// Guards the published portfolio against the failure class that repeatedly
// blanked the live site: data.js and app.js drifting out of agreement about
// the data format, or a bad sync shrinking the album list. Runs on every
// push (see .github/workflows/validate-data.yml); a failure emails the repo
// owner instead of being discovered as a broken website.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

let failed = false;
const fail = (msg) => { console.error("FAIL: " + msg); failed = true; };

// ── 1. data.js must execute and expose a valid album array ─────────────────
const dataText = readFileSync("data.js", "utf8");
const win = {};
try {
  new Function("window", dataText)(win);
} catch (e) {
  console.error("FAIL: data.js does not execute: " + e.message);
  process.exit(1);
}
const shoots = win.WPS_DATA && win.WPS_DATA.DEMO_SHOOTS;
if (!Array.isArray(shoots)) {
  console.error("FAIL: window.WPS_DATA.DEMO_SHOOTS is not an array");
  process.exit(1);
}

// ── 2. every album: unique id, photos present on disk ──────────────────────
const ids = new Set();
for (const s of shoots) {
  if (!s || !s.id) { fail("album without an id: " + JSON.stringify(s).slice(0, 80)); continue; }
  if (ids.has(s.id)) fail("duplicate album id: " + s.id);
  ids.add(s.id);
  for (const p of s.photos || []) {
    for (const key of ["url", "small", "medium"]) {
      const u = p[key];
      if (u && !u.startsWith("data:") && !existsSync(u)) {
        fail(`album "${s.title || s.id}" references a missing photo file: ${u}`);
      }
    }
  }
}

// ── 3. parser parity: the app's real parser must read the real data.js ─────
// Extract the parser functions from app.js verbatim (string/comment-aware
// brace matching) and run them, so what CI tests is what browsers execute.
const appText = readFileSync("app.js", "utf8");
function extractFunction(name) {
  const fnStart = appText.indexOf("function " + name);
  if (fnStart === -1) throw new Error(name + " not found in app.js");
  const braceStart = appText.indexOf("{", fnStart);
  let depth = 0, i = braceStart, mode = null; // mode: ', ", `, //, /*
  for (; i < appText.length; i++) {
    const c = appText[i], n = appText[i + 1];
    if (mode === "//") { if (c === "\n") mode = null; continue; }
    if (mode === "/*") { if (c === "*" && n === "/") { mode = null; i++; } continue; }
    if (mode) { // inside a string/template
      if (c === "\\") { i++; continue; }
      if (c === mode) mode = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { mode = c; continue; }
    if (c === "/" && n === "/") { mode = "//"; i++; continue; }
    if (c === "/" && n === "*") { mode = "/*"; i++; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) break;
  }
  return appText.slice(fnStart, i + 1);
}
try {
  const src = ["parseArrayAfterKey", "parseShootsFromDataJs", "parseDeletedIdsFromDataJs"].map(extractFunction).join("\n");
  const api = new Function(src + "\nreturn { parseShootsFromDataJs, parseDeletedIdsFromDataJs };")();
  const parsed = api.parseShootsFromDataJs(dataText);
  if (!parsed) fail("app.js parser returned null for the current data.js — visitors would see no albums");
  else if (parsed.length !== shoots.length) fail(`parser/data drift: app.js parser sees ${parsed.length} album(s) but data.js holds ${shoots.length}`);
  else console.log(`parser parity OK (${parsed.length} albums)`);
  const parsedDeleted = api.parseDeletedIdsFromDataJs(dataText);
  const declaredDeleted = Array.isArray(win.WPS_DATA.DELETED_IDS) ? win.WPS_DATA.DELETED_IDS : [];
  if (parsedDeleted.length !== declaredDeleted.length) {
    fail(`tombstone drift: app.js parser sees ${parsedDeleted.length} deleted id(s) but data.js declares ${declaredDeleted.length}`);
  }
} catch (e) {
  fail("could not run app.js parsers: " + e.message);
}

// ── 4. album count must not silently collapse vs the previous commit ───────
try {
  const prevText = execSync("git show HEAD~1:data.js", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const prevWin = {};
  new Function("window", prevText)(prevWin);
  const prev = (prevWin.WPS_DATA && prevWin.WPS_DATA.DEMO_SHOOTS) || [];
  if (prev.length > 0 && shoots.length === 0) {
    fail(`album count collapsed from ${prev.length} to 0 — this is the signature of a bad sync, not a deliberate wipe`);
  } else if (shoots.length < prev.length) {
    console.warn(`WARN: album count decreased ${prev.length} → ${shoots.length} (fine if albums were deliberately deleted)`);
  }
} catch { /* first commit, shallow clone, or no prior data.js */ }

// ── 5. format contract both the parser and the sync generator rely on ──────
if (!dataText.includes('"DEMO_SHOOTS"')) fail('data.js is missing the quoted "DEMO_SHOOTS" key the app parser anchors on');
if (!dataText.includes("window.SHOOTS = window.WPS_DATA.DEMO_SHOOTS")) fail("data.js is missing the trailing window.* alias lines");

// ── 6. deletion tombstones: valid shape, and never contradicting the albums ─
const deleted = win.WPS_DATA.DELETED_IDS;
if (deleted !== undefined) {
  if (!Array.isArray(deleted) || deleted.some((x) => typeof x !== "string")) {
    fail("WPS_DATA.DELETED_IDS must be an array of shoot-id strings");
  } else {
    for (const id of deleted) {
      if (ids.has(id)) fail(`album ${id} is published AND tombstoned in DELETED_IDS — a deleted album must not ship in DEMO_SHOOTS`);
    }
  }
}

// ── 7. cache-buster: every page's ?v= must match sw.js's ASSET_VERSION ─────
// These silently drifted apart for five weeks — the HTML asked for ?v=253 from
// 2026-07-03 while sw.js climbed to 262. Pages get `max-age=14400` from GitHub
// Pages, so a URL that never changes means browsers keep serving a four-hour-
// old app.js, and editing from that stale copy is how a feature got wiped on
// 2026-08-08. Drift is now a build failure rather than something to discover
// on someone else's phone.
const swText = readFileSync("sw.js", "utf8");
const swVersion = (swText.match(/ASSET_VERSION\s*=\s*["'](\d+)["']/) || [])[1];
if (!swVersion) {
  fail("sw.js no longer declares ASSET_VERSION = \"<number>\" — the cache-buster check cannot run");
} else {
  const htmlFiles = execSync("git ls-files '*.html'", { encoding: "utf8" }).split("\n").filter(Boolean);
  for (const file of htmlFiles) {
    const found = new Set([...readFileSync(file, "utf8").matchAll(/\?v=(\d+)/g)].map((m) => m[1]));
    for (const v of found) {
      if (v !== swVersion) fail(`${file} requests ?v=${v} but sw.js declares ASSET_VERSION=${swVersion} — bump every page and sw.js together`);
    }
  }

  // The HTML sweep above cannot see version literals pinned inside app.js. One
  // was: the service-worker registration sat on '/sw.js?v=267' and silently
  // missed eight bumps, because search-and-replace for the current version
  // never matches a literal left behind at an older one. Any ?v=<n> in app.js
  // must track ASSET_VERSION, or carry no version at all.
  const appText = readFileSync("app.js", "utf8");
  for (const m of appText.matchAll(/['"`][^'"`\s]*\?v=(\d+)/g)) {
    if (m[1] !== swVersion) {
      fail(`app.js pins ?v=${m[1]} ("${m[0].slice(1, 60)}") but sw.js declares ASSET_VERSION=${swVersion} — a pinned literal drifts silently; bump it or drop the ?v=`);
    }
  }
}

if (failed) process.exit(1);
console.log(`OK: ${shoots.length} albums, ids unique, all photo files present, format contract intact, cache-buster in sync.`);
