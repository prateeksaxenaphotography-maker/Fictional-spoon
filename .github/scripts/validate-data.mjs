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
// Same brace-matching walk, for the `const NAME = …;` form (arrow functions
// and const literals), which extractFunction's "function NAME" anchor misses.
function extractConst(name) {
  const start = appText.indexOf("\n  const " + name + " ");
  if (start === -1) throw new Error("const " + name + " not found in app.js");
  let depth = 0, i = start + 1, mode = null;
  for (; i < appText.length; i++) {
    const c = appText[i], n = appText[i + 1];
    if (mode === "//") { if (c === "\n") mode = null; continue; }
    if (mode === "/*") { if (c === "*" && n === "/") { mode = null; i++; } continue; }
    if (mode) {
      if (c === "\\") { i++; continue; }
      if (c === mode) mode = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { mode = c; continue; }
    if (c === "/" && n === "/") { mode = "//"; i++; continue; }
    if (c === "/" && n === "*") { mode = "/*"; i++; continue; }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (c === ";" && depth === 0) break;
  }
  return appText.slice(start + 1, i + 1);
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

// ── 8. share links: every album's link must resolve back to that album ─────
// Album share links silently rotted: the /share/… handler looked albums up by
// exact id and required isPublic to be truthy, so it answered "Album not
// found" for every album published before that flag existed — and for every
// comp card, whose album is assembled on the fly and has no stored id at all.
// Nothing tested it, so it stayed broken for as long as it took someone to
// click a link they had sent. This runs the app's real link builder and
// resolver over the real published data on every push.
try {
  const decls = [
    extractFunction("getTalentCleanName"),
    extractFunction("shuffleArray"),
    extractFunction("normalizeModelType"),
    extractFunction("modelTypesOf"),
    extractFunction("buildCompCardDisplayList"),
    extractFunction("shareIdFor"),
    extractFunction("resolveShareId"),
    extractConst("MODEL_TYPES"),
    extractConst("MODEL_TYPES_MAX"),
    extractConst("MODEL_TYPE_MAXLEN"),
    extractConst("qualifiesAsCompCard"),
    extractConst("showsOnModelPage"),
    // buildCompCardDisplayList decides which photos belong on a comp card and
    // on the Model Portfolio page with these two.
    extractConst("usableOnCompCard"),
    extractConst("usableInPortfolio"),
    extractConst("slugify"),
    // buildCompCardDisplayList reads the per-surface credit switches and the
    // handle cleaner when it assembles a unified album. Lifting the function
    // without them left the whole share-link check dead on "REP_SWITCHES is
    // not defined" — a silent hole in the exact test that exists to stop
    // broken links reaching a client. A dependency this check picks up later
    // will fail the same way, and the fix is to lift it here too.
    extractConst("REP_SWITCHES"),
    extractConst("REP_SURFACES"),
    extractConst("showRep"),
    extractConst("cleanIgHandle"),
  ].join("\n");
  const api = new Function(decls + "\nreturn { shareIdFor, resolveShareId, buildCompCardDisplayList, qualifiesAsCompCard, showsOnModelPage, modelTypesOf };")();

  // Model types are free text now — the studio can add its own from the panel
  // — so the published values are worth a look. modelTypesOf silently drops
  // anything blank and truncates past the cap; that is right at render time
  // but wrong to discover only there, because a dropped type is a type the
  // studio thought it had set.
  for (const s of shoots) {
    if (s.modelTypes === undefined) continue;
    if (!Array.isArray(s.modelTypes)) { fail(`album "${s.title || s.id}" has modelTypes that is not an array: ${JSON.stringify(s.modelTypes)}`); continue; }
    const kept = api.modelTypesOf(s);
    if (kept.length < s.modelTypes.length) {
      fail(`album "${s.title || s.id}" stores ${s.modelTypes.length} model type(s) ${JSON.stringify(s.modelTypes)} but only ${kept.length} survive normalisation ${JSON.stringify(kept)} — the rest are blank, duplicates, or past the cap and would never show`);
    }
  }

  // Public albums, as a visitor's SHOOTS list would hold them.
  const visible = shoots.filter((s) => s && s.isPublic !== false);
  // Plus the unified albums the Comp Cards and Model Portfolio pages build.
  const unified = [
    ...api.buildCompCardDisplayList(visible.filter((s) => api.showsOnModelPage(s, "Comp Cards")), "type", "Comp Cards"),
    ...api.buildCompCardDisplayList(visible.filter((s) => api.showsOnModelPage(s, "Model Portfolio")), "type", "Model Portfolio"),
  ].filter((a) => a && a.isCompCard);

  let checked = 0;
  const seenLinks = new Map();
  for (const album of [...visible, ...unified]) {
    const shareId = api.shareIdFor(album);
    if (!shareId) { fail(`album "${album.title || album.id}" produces an empty share link`); continue; }
    if (/[\s?#/]/.test(shareId)) {
      fail(`share link for "${album.title || album.id}" is not URL-safe: /share/${shareId}`);
      continue;
    }
    // Two different albums answering to one link would make the link
    // ambiguous — whichever resolved first would win, silently.
    const prev = seenLinks.get(shareId);
    if (prev && prev !== (album.talent || album.title)) {
      fail(`two albums share the link /share/${shareId}: "${prev}" and "${album.talent || album.title}"`);
    }
    seenLinks.set(shareId, album.talent || album.title);

    for (const form of [shareId, encodeURIComponent(shareId)]) {
      const back = api.resolveShareId(form, visible);
      if (!back) { fail(`share link /share/${form} resolves to nothing (album "${album.talent || album.title}")`); continue; }
      const wantName = (album.talent || album.title || "").trim();
      const gotName = (back.talent || back.title || "").trim();
      if (back.id !== album.id && gotName !== wantName) {
        fail(`share link /share/${form} resolves to "${gotName}" but was built for "${wantName}"`);
      }
    }
    checked++;
  }
  console.log(`share links OK (${checked} albums, real + unified comp cards)`);
} catch (e) {
  fail("could not run app.js share-link builder/resolver: " + e.message);
}

// ── 9. portfolio PDF sales: the price and UPI ID every client is shown ─────
// The Model Portfolio PDF asks clients to pay PORTFOLIO_PDF.price to
// PORTFOLIO_PDF.upiId. A mangled price quotes nonsense and a malformed UPI ID
// sends money nowhere, so both are held to the pattern app.js's UPI_ID_RE uses.
const pdfSale = win.WPS_DATA.PORTFOLIO_PDF;
if (pdfSale !== undefined && pdfSale !== null) {
  if (typeof pdfSale !== "object" || Array.isArray(pdfSale)) {
    fail("WPS_DATA.PORTFOLIO_PDF must be an object { enabled, price, upiId }");
  } else {
    if (pdfSale.enabled !== undefined && typeof pdfSale.enabled !== "boolean") fail(`WPS_DATA.PORTFOLIO_PDF.enabled must be true or false — got ${JSON.stringify(pdfSale.enabled)}`);
    if (!Number.isInteger(pdfSale.price) || pdfSale.price < 0) fail(`WPS_DATA.PORTFOLIO_PDF.price must be whole rupees, 0 or more — got ${JSON.stringify(pdfSale.price)}`);
    if (typeof pdfSale.upiId !== "string" || (pdfSale.upiId && !/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/.test(pdfSale.upiId))) {
      fail(`WPS_DATA.PORTFOLIO_PDF.upiId is not a UPI ID: ${JSON.stringify(pdfSale.upiId)}`);
    }
  }
}
// ── 9b. studio portfolio books (book-builder.js) ──────────────────────────
// Saved books are the studio's own work, rebuilt by hand if lost, so their
// shape is held to what cleanStudioPortfolios in app.js keeps. A book whose
// style or pages the app does not recognise would open blank or be dropped.
const books = win.WPS_DATA.STUDIO_PORTFOLIOS;
if (books !== undefined && books !== null) {
  if (typeof books !== "object" || !Array.isArray(books.versions) || !Array.isArray(books.deleted)) {
    fail("WPS_DATA.STUDIO_PORTFOLIOS must be an object { versions: [], deleted: [] }");
  } else {
    const BOOK_STYLES = new Set(["elegant", "modern", "vogue"]);
    const PAGE_TYPES = new Set(["photos", "spread", "about", "services", "contact", "divider", "story", "note", "quote", "letter", "feature", "article", "ways", "process", "free"]);
    // The same caps as STUDIO_BOOK_LIMITS.fields in app.js. Over a cap FAILS
    // here rather than being trimmed: the app's cleaner would otherwise cut a
    // hand-edited data.js without a word.
    const FIELD_MAX = {
      story: { kicker: 32, headline: 52, intro: 150, body: 700 },
      note: { title: 40, note: 300, detail: 90 },
      quote: { quote: 220, name: 40, role: 48 },
      letter: { kicker: 32, heading: 52, body: 1100, signName: 40, signLine: 48 },
      feature: { kicker: 32, headline: 52, sub1: 40, text1: 360, sub2: 40, text2: 360 },
      article: { kicker: 32, headline: 52, intro: 150, body: 1400, caption: 90 },
      ways: { kicker: 32, heading: 52, intro: 160 },
      process: { kicker: 32, heading: 52, intro: 160, note: 120 },
      photos: { caption: 90 }
    };
    const BORDERS = new Set(["none", "top", "bottom", "left", "right", "all"]);
    const BORDER_WIDTHS = new Set(["narrow", "broad"]);
    const FONTS = new Set(["fraunces", "archivo", "inter", "outfit", "playfair", "cormorant", "baskerville", "bodoni", "dmserif", "sourcesans", "jost", "manrope", "spacegrotesk", "oswald", "plexmono"]);
    const ALIGNS = new Set(["left", "center", "right", "justify"]);
    // One text's formatting: the whole text, and, for a flowing text, each of
    // its paragraphs (numbered from 1, at most 60, the same as the app keeps).
    const PARA_FLOW = { story: ["body"], article: ["body"], letter: ["body"], note: ["note"], about: ["about"] };
    const checkOneFormat = (f, what) => {
      if (f.size !== undefined && !(typeof f.size === "number" && f.size >= 0.6 && f.size <= 1.6)) fail(`${what} at size ${JSON.stringify(f.size)}; it must be 0.6 to 1.6`);
      if (f.weight !== undefined && !["light", "regular", "bold"].includes(f.weight)) fail(`${what} in weight ${JSON.stringify(f.weight)}`);
      if (f.italic !== undefined && f.italic !== true) fail(`${what} with italic ${JSON.stringify(f.italic)}; only true is written`);
      if (f.font !== undefined && !FONTS.has(f.font)) fail(`${what} in an unknown font ${JSON.stringify(f.font)}`);
      if (f.color !== undefined && !["ink", "soft", "accent", "paper", "white", "deep"].includes(f.color) && !/^#[0-9a-f]{6}$/.test(String(f.color))) fail(`${what} in the colour ${JSON.stringify(f.color)}; use ink, soft, accent, paper, white, deep or #rrggbb`);
      if (f.align !== undefined && !ALIGNS.has(f.align)) fail(`${what} aligned ${JSON.stringify(f.align)}`);
      if (f.list !== undefined && !["bullet", "number"].includes(f.list)) fail(`${what} as a list ${JSON.stringify(f.list)}; the app knows bullet and number`);
      if (f.columns !== undefined && ![2, 3].includes(f.columns)) fail(`${what} in ${JSON.stringify(f.columns)} columns; the app writes 2 or 3, and nothing for one`);
    };
    const checkFormat = (f, what, key, flows) => {
      for (const k of Object.keys(f)) if (!["font", "color", "align", "size", "weight", "italic", "list", "columns", "paras"].includes(k)) fail(`${what} with ${JSON.stringify(k)}, which the app drops`);
      checkOneFormat(f, what);
      if (f.paras === undefined) return;
      if (!f.paras || typeof f.paras !== "object" || Array.isArray(f.paras)) { fail(`${what} with paragraphs that are not an object`); return; }
      if (flows === false) fail(`${what} paragraph by paragraph, but ${key} is one run of words, so the app draws it whole`);
      for (const [at, p] of Object.entries(f.paras)) {
        if (!/^[1-9][0-9]{0,2}$/.test(at) || Number(at) > 60) { fail(`${what} a paragraph ${JSON.stringify(at)}; paragraphs are numbered 1 to 60`); continue; }
        if (!p || typeof p !== "object" || Array.isArray(p)) { fail(`${what} paragraph ${at} with formatting that is not an object`); continue; }
        for (const k of Object.keys(p)) if (!["font", "color", "align", "size", "weight", "italic", "list", "columns"].includes(k)) fail(`${what} paragraph ${at} with ${JSON.stringify(k)}, which the app drops`);
        checkOneFormat(p, `${what} paragraph ${at}`);
      }
    };
    const PAPERS = new Set(["a4", "b5", "a5", "letter"]);
    const PHOTO_AT = { story: ["top", "bottom", "left", "right"], note: ["top", "bottom", "left", "right"], quote: ["top", "bottom", "left", "right"], feature: ["left", "right"], article: ["left", "right"] };
    const FITS = new Set(["fill", "whole", "width", "height"]);
    // Lines a page draws for itself that the studio can write over, and the
    // most each may hold. They are kept only when typed.
    const PAGE_TEXT = { label: 32, heading: 60, note: 90, credit: 60, qrLabel: 24 };
    const SERVICE_ITEM = { kicker: 28, title: 40, blurb: 120 };
    const CONTACT_ROW = { label: 24, value: 60 };
    const CREDIT_PAGES = new Set(["photos", "spread", "article", "story", "note", "quote", "feature"]);
    const KNOWN_KEYS_BASE = {
      photos: ["type", "photos", "caption", "credit", "rows", "border", "borderWidth", "style"], spread: ["type", "photos", "credit", "border", "borderWidth"], divider: ["type", "heading", "line", "style"],
      about: ["type", "label", "heading", "style"], services: ["type", "label", "heading", "note", "items", "hide"], contact: ["type", "label", "heading", "rows", "qrLabel", "hide"],
      story: ["type", "photos", "photoAt", "credit", "style", ...Object.keys(FIELD_MAX.story)], note: ["type", "photos", "photoAt", "credit", "style", ...Object.keys(FIELD_MAX.note)],
      quote: ["type", "photos", "photoAt", "credit", "style", ...Object.keys(FIELD_MAX.quote)], letter: ["type", "style", ...Object.keys(FIELD_MAX.letter)],
      feature: ["type", "photos", "photoAt", "credit", "style", ...Object.keys(FIELD_MAX.feature)],
      article: ["type", "photos", "photoAt", "credit", "style", "border", "borderWidth", ...Object.keys(FIELD_MAX.article)],
      ways: ["type", "items", "style", ...Object.keys(FIELD_MAX.ways)],
      process: ["type", "way", "steps", "style", ...Object.keys(FIELD_MAX.process)],
      free: ["type", "bg", "blocks"]
    };
    // Any page can carry its own colour behind everything.
    const KNOWN_KEYS = Object.fromEntries(Object.entries(KNOWN_KEYS_BASE).map(([k, v]) => [k, v.includes("bg") ? v : [...v, "bg"]]));
    // An Anything page: what the studio placed, as fractions of the A4 frame.
    const BLOCK_KINDS = new Set(["text", "photo", "shape", "line"]);
    const BLOCK_ROLES = new Set(["head", "intro", "body", "kicker", "quote"]);
    const THICKS = new Set(["hair", "narrow", "broad"]);
    const FILLS = new Set(["ink", "soft", "accent", "paper", "white", "deep", "rule"]);
    const BLOCK_KEYS = { text: ["k", "x", "y", "w", "h", "r", "t", "role", "fit", "style", "fill", "o", "shape", "corner"], photo: ["k", "x", "y", "w", "h", "r", "p", "edge", "edgeWidth"], shape: ["k", "x", "y", "w", "h", "r", "fill", "o", "shape", "corner"], line: ["k", "x", "y", "w", "r", "color", "o", "thick"] };
    const SHAPE_KINDS = new Set(["round", "chamfer", "ellipse", "triangle", "diamond", "star", "parallelogram"]);
    const isFill = (v) => FILLS.has(v) || /^#[0-9a-f]{6}$/.test(String(v));
    const seenBooks = new Set();
    for (const b of books.versions) {
      const name = b && b.name ? `"${b.name}"` : JSON.stringify(b && b.id);
      if (!b || typeof b.id !== "string" || !b.id) { fail(`a studio portfolio book has no id: ${JSON.stringify(b).slice(0, 120)}`); continue; }
      if (seenBooks.has(b.id)) fail(`two studio portfolio books share the id ${b.id}`);
      seenBooks.add(b.id);
      if (!BOOK_STYLES.has(b.style)) fail(`studio portfolio book ${name} has an unknown style ${JSON.stringify(b.style)}`);
      if (b.orientation !== "portrait" && b.orientation !== "landscape") fail(`studio portfolio book ${name} has an unknown page shape ${JSON.stringify(b.orientation)}`);
      if (!Array.isArray(b.pages)) { fail(`studio portfolio book ${name} has no pages list`); continue; }
      const rendered = 1 + b.pages.reduce((n, pg) => n + (pg && (pg.type === "spread" || pg.type === "article") ? 2 : 1), 0);
      if (rendered > 20) fail(`studio portfolio book ${name} has ${rendered} pages; the builder allows 20, cover included`);
      b.pages.forEach((pg, i) => {
        const where = `studio portfolio book ${name} page entry ${i + 1}`;
        if (!pg || !PAGE_TYPES.has(pg.type)) { fail(`${where} has an unknown type ${JSON.stringify(pg && pg.type)}`); return; }
        const extra = Object.keys(pg).filter((k) => !KNOWN_KEYS[pg.type].includes(k));
        if (extra.length) fail(`${where} (${pg.type}) has ${extra.map((k) => JSON.stringify(k)).join(", ")}, which the app drops when the book loads`);
        for (const [k, max] of Object.entries(FIELD_MAX[pg.type] || {})) {
          if (pg[k] === undefined) continue;
          if (typeof pg[k] !== "string") fail(`${where} (${pg.type}) has a ${k} that is not text`);
          else if (pg[k].length > max) fail(`${where} (${pg.type}) has a ${k} of ${pg[k].length} characters; the most it can hold is ${max}`);
        }
        if (pg.type === "story" || pg.type === "note" || pg.type === "quote") {
          if (!Array.isArray(pg.photos) || pg.photos.length > 1 || pg.photos.some((s) => !s || typeof s.id !== "string")) fail(`${where} (${pg.type}) must have a photos list of at most one photo`);
        }
        if (pg.type === "feature" && (!Array.isArray(pg.photos) || pg.photos.length > 2)) fail(`${where} (feature) must have a photos list of at most two photos`);
        if (pg.type === "article" && (!Array.isArray(pg.photos) || pg.photos.length > 1)) fail(`${where} (article) must have a photos list of at most one photo`);
        if (pg.type === "ways") {
          if (!Array.isArray(pg.items) || pg.items.length > 4) fail(`${where} (ways) must have a list of at most four ways`);
          else pg.items.forEach((it, k) => {
            if (!it || typeof it !== "object") { fail(`${where} way ${k + 1} is not an object`); return; }
            for (const key of Object.keys(it)) if (!["name", "forWho", "text", "lead", "liked"].includes(key)) fail(`${where} way ${k + 1} has ${JSON.stringify(key)}, which the app drops`);
            for (const [key, max] of Object.entries({ name: 32, forWho: 64, text: 150 })) { if (typeof it[key] !== "string") fail(`${where} way ${k + 1} has no ${key}`); else if (it[key].length > max) fail(`${where} way ${k + 1} ${key} is ${it[key].length} characters; the most is ${max}`); }
            if (!["you", "together", "studio"].includes(it.lead)) fail(`${where} way ${k + 1} says ${JSON.stringify(it.lead)} leads`);
            if (it.liked !== undefined && it.liked !== true) fail(`${where} way ${k + 1} has liked ${JSON.stringify(it.liked)}; only true is written`);
          });
        }
        if (pg.type === "process") {
          if (pg.way !== undefined && !["execute", "pitch", "lead", "test"].includes(pg.way)) fail(`${where} shows an unknown way ${JSON.stringify(pg.way)}`);
          if (!Array.isArray(pg.steps) || pg.steps.length > 6) fail(`${where} (process) must have a list of at most six steps`);
          else pg.steps.forEach((st, k) => {
            if (!st || typeof st !== "object") { fail(`${where} step ${k + 1} is not an object`); return; }
            for (const key of Object.keys(st)) if (!["who", "title", "text"].includes(key)) fail(`${where} step ${k + 1} has ${JSON.stringify(key)}, which the app drops`);
            for (const [key, max] of Object.entries({ title: 36, text: 130 })) { if (typeof st[key] !== "string") fail(`${where} step ${k + 1} has no ${key}`); else if (st[key].length > max) fail(`${where} step ${k + 1} ${key} is ${st[key].length} characters; the most is ${max}`); }
            if (!["you", "together", "studio"].includes(st.who)) fail(`${where} step ${k + 1} says ${JSON.stringify(st.who)} does it`);
          });
        }
        if (pg.type === "contact" && pg.hide !== undefined && (!Array.isArray(pg.hide) || pg.hide.some((k) => !["email", "whatsapp", "instagram", "website", "book", "studio", "qr"].includes(k)))) fail(`${where} hides contact lines the app doesn't know: ${JSON.stringify(pg.hide)}`);
        // The lines a page draws for itself, written over by the studio.
        for (const [k, max] of Object.entries(PAGE_TEXT)) {
          if (pg[k] === undefined || (FIELD_MAX[pg.type] || {})[k] !== undefined) continue;
          if (!KNOWN_KEYS[pg.type].includes(k)) continue;
          if (typeof pg[k] !== "string" || !pg[k].trim()) fail(`${where} (${pg.type}) has a ${k} the app would drop`);
          else if (pg[k].length > max) fail(`${where} (${pg.type}) has a ${k} of ${pg[k].length} characters; the most it can hold is ${max}`);
        }
        if (pg.type === "services") {
          if (pg.items !== undefined) {
            if (!pg.items || typeof pg.items !== "object" || Array.isArray(pg.items)) fail(`${where} has items that are not an object of shoots`);
            else for (const [slug, o] of Object.entries(pg.items)) {
              if (!slug || slug.length > 60) { fail(`${where} writes over a shoot ${JSON.stringify(slug)} the app drops`); continue; }
              if (!o || typeof o !== "object" || Array.isArray(o)) { fail(`${where} has words for the shoot ${slug} that are not an object`); continue; }
              for (const [k, v2] of Object.entries(o)) {
                if (!(k in SERVICE_ITEM)) { fail(`${where} writes a ${JSON.stringify(k)} for the shoot ${slug}, which the app drops`); continue; }
                if (typeof v2 !== "string" || !v2.trim() || v2.length > SERVICE_ITEM[k]) fail(`${where} has a ${k} for the shoot ${slug} the app would drop or cut`);
              }
            }
          }
          if (pg.hide !== undefined && (!Array.isArray(pg.hide) || pg.hide.some((k) => typeof k !== "string" || !k || k.length > 60))) fail(`${where} leaves out shoots the app can't name: ${JSON.stringify(pg.hide)}`);
        }
        if (pg.bg !== undefined && !isFill(pg.bg)) fail(`${where} has a page colour ${JSON.stringify(pg.bg)}; use ${[...FILLS].join(", ")} or #rrggbb`);
        if (pg.type === "free") {
          if (!Array.isArray(pg.blocks)) fail(`${where} (free) has no list of things on it`);
          else {
            if (pg.blocks.length > 12) fail(`${where} has ${pg.blocks.length} things on it; the builder allows 12`);
            if (pg.blocks.filter((x) => x && x.k === "photo").length > 6) fail(`${where} has more than six photographs on it`);
            pg.blocks.forEach((x, bi) => {
              const at = `${where} thing ${bi + 1}`;
              if (!x || typeof x !== "object" || Array.isArray(x)) { fail(`${at} is not an object`); return; }
              if (!BLOCK_KINDS.has(x.k)) { fail(`${at} is a ${JSON.stringify(x.k)}, which the app drops`); return; }
              for (const k of Object.keys(x)) if (!BLOCK_KEYS[x.k].includes(k)) fail(`${at} (${x.k}) has ${JSON.stringify(k)}, which the app drops`);
              for (const k of ["x", "y"]) if (typeof x[k] !== "number" || !(x[k] >= -0.3 && x[k] <= 1.3)) fail(`${at} has ${k} of ${JSON.stringify(x[k])}; it must be a number from -0.3 to 1.3`);
              for (const k of x.k === "line" ? ["w"] : ["w", "h"]) if (typeof x[k] !== "number" || !(x[k] >= 0.01 && x[k] <= 1.6)) fail(`${at} has ${k} of ${JSON.stringify(x[k])}; it must be a number from 0.01 to 1.6`);
              if (x.r !== undefined && (typeof x.r !== "number" || !(x.r >= -180 && x.r <= 180) || x.r === 0)) fail(`${at} is turned ${JSON.stringify(x.r)}; it must be a number from -180 to 180, and 0 is not written`);
              if (x.k === "text") {
                if (typeof x.t !== "string") fail(`${at} has words that are not text`);
                else if (x.t.length > 600) fail(`${at} holds ${x.t.length} characters; the most is 600`);
                if (x.role !== undefined && !BLOCK_ROLES.has(x.role)) fail(`${at} has a kind of words ${JSON.stringify(x.role)} the app doesn't know`);
                if (x.fit !== undefined && x.fit !== "cut") fail(`${at} has fit ${JSON.stringify(x.fit)}; the app writes "cut", and nothing when the words shrink`);
                if (x.style !== undefined) {
                  if (!x.style || typeof x.style !== "object" || Array.isArray(x.style)) fail(`${at} has formatting that is not an object`);
                  else checkFormat(x.style, `${at} formats its words`, "t", true);
                }
              }
              if (x.k === "photo") {
                if (x.p !== undefined) {
                  if (!x.p || typeof x.p !== "object" || typeof x.p.id !== "string") fail(`${at} has a photo that is not a chosen photograph`);
                  else {
                    if (x.p.fit !== undefined && !FITS.has(x.p.fit)) fail(`${at} places its photo as ${JSON.stringify(x.p.fit)}`);
                    if (x.p.opacity !== undefined && !(typeof x.p.opacity === "number" && x.p.opacity >= 0.1 && x.p.opacity < 1)) fail(`${at} has a photo opacity of ${JSON.stringify(x.p.opacity)}`);
                  }
                }
                if (x.edge !== undefined && !FILLS.has(x.edge)) fail(`${at} has an edge colour ${JSON.stringify(x.edge)} the app drops`);
                if (x.edgeWidth !== undefined && !THICKS.has(x.edgeWidth)) fail(`${at} has an edge width ${JSON.stringify(x.edgeWidth)}`);
              }
              if ((x.k === "shape" || x.k === "text") && x.fill !== undefined && !isFill(x.fill)) fail(`${at} is filled ${JSON.stringify(x.fill)}; use ${[...FILLS].join(", ")} or #rrggbb`);
              if (x.shape !== undefined && !SHAPE_KINDS.has(x.shape)) fail(`${at} is shaped ${JSON.stringify(x.shape)}; the app writes ${[...SHAPE_KINDS].join(", ")}, and nothing for a box`);
              if (x.corner !== undefined && !["small", "large"].includes(x.corner)) fail(`${at} has corners ${JSON.stringify(x.corner)}; the app writes small or large, and nothing for medium`);
              if (x.k === "line") {
                if (x.color !== undefined && !isFill(x.color)) fail(`${at} is drawn in ${JSON.stringify(x.color)}; use ${[...FILLS].join(", ")} or #rrggbb`);
                if (x.thick !== undefined && !THICKS.has(x.thick)) fail(`${at} has a thickness ${JSON.stringify(x.thick)}`);
              }
              if (x.o !== undefined && !(typeof x.o === "number" && x.o >= 0.05 && x.o < 1)) fail(`${at} is faded to ${JSON.stringify(x.o)}; it must be a number from 0.05 to under 1`);
            });
          }
        }
        if (pg.type === "contact" && pg.rows !== undefined) {
          if (!pg.rows || typeof pg.rows !== "object" || Array.isArray(pg.rows)) fail(`${where} has rows that are not an object`);
          else for (const [key, o] of Object.entries(pg.rows)) {
            if (!["email", "whatsapp", "instagram", "website", "book", "studio", "qr"].includes(key)) { fail(`${where} writes over a contact line ${JSON.stringify(key)} the app drops`); continue; }
            if (!o || typeof o !== "object" || Array.isArray(o)) { fail(`${where} has a contact line ${key} that is not an object`); continue; }
            for (const [k, v2] of Object.entries(o)) {
              if (!(k in CONTACT_ROW)) { fail(`${where} writes a ${JSON.stringify(k)} on the contact line ${key}, which the app drops`); continue; }
              if (typeof v2 !== "string" || !v2.trim() || v2.length > CONTACT_ROW[k]) fail(`${where} has a ${k} on the contact line ${key} the app would drop or cut`);
            }
          }
        }
        // `rows` is the row of three on a photos page; on Contact it is the lines in your own words.
        if (pg.type === "photos" && pg.rows !== undefined && !["3top", "3bottom"].includes(pg.rows)) fail(`${where} puts three in a row ${JSON.stringify(pg.rows)}; the app writes 3top or 3bottom`);
        if (pg.border !== undefined && !BORDERS.has(pg.border)) fail(`${where} has an unknown border ${JSON.stringify(pg.border)}`);
        if (pg.borderWidth !== undefined && !BORDER_WIDTHS.has(pg.borderWidth)) fail(`${where} has an unknown border width ${JSON.stringify(pg.borderWidth)}`);
        if (pg.style !== undefined) {
          const extra = { divider: ["heading", "line"], about: ["about"] }[pg.type] || [];
          if (!pg.style || typeof pg.style !== "object" || Array.isArray(pg.style)) fail(`${where} has a style that is not an object`);
          else for (const [k, f] of Object.entries(pg.style)) {
            if (!(k in (FIELD_MAX[pg.type] || {})) && !extra.includes(k)) { fail(`${where} formats ${JSON.stringify(k)}, which isn't one of its texts`); continue; }
            if (!f || typeof f !== "object") { fail(`${where} has formatting for ${k} that is not an object`); continue; }
            checkFormat(f, `${where} formats ${k}`, k, (PARA_FLOW[pg.type] || []).includes(k));
          }
        }
        if (pg.photoAt !== undefined && !(PHOTO_AT[pg.type] || []).includes(pg.photoAt)) fail(`${where} (${pg.type}) puts its photo at ${JSON.stringify(pg.photoAt)}; allowed: ${(PHOTO_AT[pg.type] || []).join(", ") || "nowhere"}`);
        for (const s of pg.photos || []) {
          if (s && s.fit !== undefined && !FITS.has(s.fit)) fail(`${where} has a photo placed as ${JSON.stringify(s.fit)}; the app knows ${[...FITS].join(", ")}`);
          if (s && s.opacity !== undefined && !(typeof s.opacity === "number" && s.opacity >= 0.1 && s.opacity < 1)) fail(`${where} has a photo opacity of ${JSON.stringify(s.opacity)}; it must be a number from 0.1 to under 1`);
        }
      });
      if (b.cover && b.cover.fit !== undefined && !FITS.has(b.cover.fit)) fail(`studio portfolio book ${name} has a cover photo placed as ${JSON.stringify(b.cover.fit)}`);
      if (b.paper !== undefined && (!PAPERS.has(b.paper) || b.paper === "a4")) fail(`studio portfolio book ${name} has paper ${JSON.stringify(b.paper)}; the app writes b5, a5 or letter, and nothing for A4`);
      if (b.coverText !== undefined) {
        const CT_MAX = { label: 32, mast: 18, tagline: 24, foot: 40, place: 40 };
        const CT_SIDE = (side, lines) => {
          if (!Array.isArray(lines) || lines.length > 3) fail(`studio portfolio book ${name} has ${side} cover lines that are not a list of at most three`);
          else lines.forEach((l, i) => { if (typeof l !== "string" || l.length > 24) fail(`studio portfolio book ${name} has a ${side} cover line ${i + 1} the app would cut`); });
        };
        if (!b.coverText || typeof b.coverText !== "object" || Array.isArray(b.coverText)) fail(`studio portfolio book ${name} has coverText that is not an object`);
        else for (const [k, v2] of Object.entries(b.coverText)) {
          if (k === "showCounts") { if (v2 !== false) fail(`studio portfolio book ${name} writes showCounts ${JSON.stringify(v2)}; only false is written`); continue; }
          if (k === "left" || k === "right") { CT_SIDE(k, v2); continue; }
          if (!(k in CT_MAX)) { fail(`studio portfolio book ${name} has a cover line ${JSON.stringify(k)}, which the app drops`); continue; }
          if (typeof v2 !== "string" || !v2.trim() || v2.length > CT_MAX[k]) fail(`studio portfolio book ${name} has a cover ${k} the app would drop or cut`);
        }
      }
      // How new the shapes in this book are; see the guard in section 10.
      if (b.schema !== undefined && !(Number.isInteger(b.schema) && b.schema >= 1 && b.schema <= 99)) fail(`studio portfolio book ${name} has a schema mark ${JSON.stringify(b.schema)}; it must be a whole number from 1 to 99`);
      if (b.pages.some((pg) => pg && pg.type === "free") && !(b.schema >= 1)) fail(`studio portfolio book ${name} has an Anything page but no schema mark; the app writes schema: 1 for one, and CI needs it to catch an out-of-date tab dropping the page`);
      if (b.footText !== undefined && (typeof b.footText !== "string" || !b.footText.trim() || b.footText.length > 40)) fail(`studio portfolio book ${name} has a running foot the app would drop or cut`);
      if (b.bg !== undefined && !isFill(b.bg)) fail(`studio portfolio book ${name} has a page colour ${JSON.stringify(b.bg)}; use ${[...FILLS].join(", ")} or #rrggbb`);
      if (b.showPageNumbers !== undefined && b.showPageNumbers !== false) fail(`studio portfolio book ${name} writes showPageNumbers ${JSON.stringify(b.showPageNumbers)}; only false is written`);
      if (b.watermark !== undefined) {
        const w = b.watermark;
        if (!w || typeof w !== "object" || Array.isArray(w)) fail(`studio portfolio book ${name} has a watermark that is not an object`);
        else {
          for (const key of Object.keys(w)) if (!["text", "strength"].includes(key)) fail(`studio portfolio book ${name} has a watermark ${JSON.stringify(key)}, which the app drops`);
          if (w.text !== undefined && (typeof w.text !== "string" || w.text.length > 40)) fail(`studio portfolio book ${name} has watermark words the app would cut`);
          if (w.strength !== undefined && !["light", "strong"].includes(w.strength)) fail(`studio portfolio book ${name} has watermark strength ${JSON.stringify(w.strength)}; the app writes light or strong, and nothing for medium`);
        }
      }
      if (b.coverStyle !== undefined) {
        if (!b.coverStyle || typeof b.coverStyle !== "object" || Array.isArray(b.coverStyle)) fail(`studio portfolio book ${name} has a coverStyle that is not an object`);
        else for (const [k, f] of Object.entries(b.coverStyle)) {
          if (!["title", "subtitle"].includes(k)) { fail(`studio portfolio book ${name} formats a cover text ${JSON.stringify(k)} the app drops`); continue; }
          if (!f || typeof f !== "object") { fail(`studio portfolio book ${name} has cover formatting for ${k} that is not an object`); continue; }
          checkFormat(f, `studio portfolio book ${name} formats the cover ${k}`, k, false);
        }
      }
      if (books.deleted.includes(b.id)) fail(`studio portfolio book ${name} is published and also marked deleted`);
    }
  }
}

// The Model Portfolio page's own switch: true, false, or absent (an album saved
// before it existed, which follows its comp card setting).
for (const s of shoots) {
  if (s.showOnModelPortfolio !== undefined && typeof s.showOnModelPortfolio !== "boolean") {
    fail(`album "${s.title || s.id}" has showOnModelPortfolio that is not true/false: ${JSON.stringify(s.showOnModelPortfolio)}`);
  }
}
// Pose tags decide which photos a client can put in the PDF; a value the app
// doesn't know would silently leave that photo out of every one.
const POSES = new Set(["full-body", "front", "left-profile", "right-profile", "three-quarter", "back", "close-up"]);
// Same for usage: the app asks "is this photo allowed here", so a value it does
// not know hides the photo from comp cards and the portfolio PDF without a word.
// A typo such as "None" or "comps" would do exactly that.
const USAGES = new Set(["both", "portfolio", "comp", "none"]);
for (const s of shoots) {
  for (const p of s.photos || []) {
    if (p.angle !== undefined && !POSES.has(p.angle)) fail(`album "${s.title || s.id}" photo ${p.id} has an unknown pose tag ${JSON.stringify(p.angle)}`);
    if (p.usage !== undefined && !USAGES.has(p.usage)) fail(`album "${s.title || s.id}" photo ${p.id} has an unknown usage ${JSON.stringify(p.usage)}`);
  }
}
// The kind of work a photo is and who an album was made for are keys from
// config.js (`looks`, `clients`). One it doesn't list puts a photo on no
// "What I shoot" grid, or an album on no client page, without a word.
const cfgWin = {};
try { new Function("window", readFileSync("config.js", "utf8"))(cfgWin); } catch (e) { fail("config.js does not execute: " + e.message); }
const cfg = cfgWin.STUDIO_CONFIG || {};
const LOOK_KEYS = new Set((cfg.looks || []).map((l) => l && l.key));
const CLIENT_KEYS = new Set((cfg.clients || []).map((c) => c && c.key));
for (const s of shoots) {
  const name = s.title || s.id;
  for (const p of s.photos || []) {
    if (p.look !== undefined && p.look !== "" && !LOOK_KEYS.has(p.look)) fail(`album "${name}" photo ${p.id} has an unknown kind of work ${JSON.stringify(p.look)} — config.js looks are ${[...LOOK_KEYS].join(", ")}`);
  }
  if (s.forClient !== undefined && s.forClient !== "" && !CLIENT_KEYS.has(s.forClient)) fail(`album "${name}" is for an unknown client ${JSON.stringify(s.forClient)} — config.js clients are ${[...CLIENT_KEYS].join(", ")}`);
  if (s.alsoFor !== undefined && (!Array.isArray(s.alsoFor) || s.alsoFor.some((k) => !CLIENT_KEYS.has(k) || k === s.forClient))) fail(`album "${name}" has an alsoFor that is not a list of other known clients: ${JSON.stringify(s.alsoFor)}`);
}

// ── 10. a publish must not strip what the previous one carried ─────────────
// A browser tab left open across a release keeps running the old publish
// code, which drops fields newer code writes. On 2026-09-14 one such tab
// wiped every pose tag, 107 usage settings and PORTFOLIO_PDF (074a44f), and
// did it again three minutes later (1003e9b), while changing nothing else.
// Deploys don't wait for this check, but its failure emails the owner, which
// beats hearing it from a client whose PDF button vanished.
try {
  const prevText = execSync("git show HEAD~1:data.js", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const prevWin = {};
  new Function("window", prevText)(prevWin);
  const prevData = prevWin.WPS_DATA || {};
  const stale = " This is the signature of a publish from an out-of-date browser tab: restore data.js from the previous commit, and reload every open tab of the site before publishing again.";
  if (prevData.PORTFOLIO_PDF && win.WPS_DATA.PORTFOLIO_PDF === undefined) fail(`PORTFOLIO_PDF vanished from data.js.${stale}`);
  // Saved portfolio books are hours of arranging; an old tab dropping the key,
  // or a publish that shrinks the list without a matching deletion, loses them.
  if (prevData.STUDIO_PORTFOLIOS && win.WPS_DATA.STUDIO_PORTFOLIOS === undefined) fail(`STUDIO_PORTFOLIOS vanished from data.js.${stale}`);
  const prevBooks = (prevData.STUDIO_PORTFOLIOS && prevData.STUDIO_PORTFOLIOS.versions) || [];
  const nowBooks = win.WPS_DATA.STUDIO_PORTFOLIOS || { versions: [], deleted: [] };
  const lostBooks = prevBooks.filter((b) => b && !(nowBooks.versions || []).some((x) => x && x.id === b.id) && !(nowBooks.deleted || []).includes(b.id));
  if (lostBooks.length) fail(`${lostBooks.length} studio portfolio book(s) disappeared without being deleted: ${lostBooks.map((b) => b.name || b.id).join(", ")}.${stale}`);
  // A deletion that vanishes lets a stale copy of the book come back.
  const lostTombstones = ((prevData.STUDIO_PORTFOLIOS && prevData.STUDIO_PORTFOLIOS.deleted) || []).filter((id) => !(nowBooks.deleted || []).includes(id));
  if (lostTombstones.length) fail(`${lostTombstones.length} deleted portfolio book(s) lost their deletion record, so they can reappear: ${lostTombstones.join(", ")}.${stale}`);
  // An old app.js strips writing pages and captions from books it never
  // opened, without touching their updatedAt. Words that shrink while the
  // book's edit time stays the same can only come from that.
  const WRITING = new Set(["story", "note", "quote", "letter", "feature", "article", "ways", "process", "free"]);
  const wordsIn = (b) => {
    let pages = 0, chars = 0, fits = 0;
    const settings = (s) => (s ? (s.fit ? 1 : 0) + (s.opacity !== undefined ? 1 : 0) : 0);
    fits += settings(b && b.cover) + (b && b.paper ? 1 : 0) + (b && b.coverStyle ? Object.keys(b.coverStyle).length : 0) + (b && b.watermark ? Object.keys(b.watermark).length : 0) + (b && b.coverText ? Object.keys(b.coverText).length : 0) + (b && b.footText ? 1 : 0) + (b && b.bg ? 1 : 0) + (b && b.showPageNumbers === false ? 1 : 0);
    for (const side of ["left", "right"]) for (const l of ((b && b.coverText && b.coverText[side]) || [])) if (typeof l === "string") chars += l.length;
    for (const pg of (b && b.pages) || []) {
      if (!pg) continue;
      if (WRITING.has(pg.type)) pages++;
      for (const [k, v] of Object.entries(pg)) if (k !== "type" && typeof v === "string") chars += v.length;
      // `items` is a list on a ways page and an object of shoots on What I shoot.
      for (const row of [...(Array.isArray(pg.items) ? pg.items : Object.values(pg.items || {})), ...(pg.steps || []), ...Object.values(pg.rows || {})]) {
        for (const v of Object.values(row || {})) if (typeof v === "string") chars += v.length;
      }
      for (const s of pg.photos || []) fits += settings(s);
      // Everything placed on an Anything page: its words, and the thing itself.
      for (const bl of pg.blocks || []) {
        if (!bl) continue;
        fits += 1 + settings(bl.p);
        if (typeof bl.t === "string") chars += bl.t.length;
      }
      // Each formatted text counts once, and each of its formatted paragraphs
      // once more, so losing paragraph formatting shows up as a shrink too.
      const props = (f) => (f && typeof f === "object" ? Object.keys(f).filter((k) => k !== "paras").length : 0);
      const styleWeight = (style) => Object.values(style || {}).reduce((n, f) => n + 1 + props(f) + (f && f.paras ? Object.values(f.paras).reduce((m, p) => m + 1 + props(p), 0) : 0), 0);
      fits += (pg.photoAt ? 1 : 0) + (pg.bg ? 1 : 0) + (pg.type === "photos" && pg.rows ? 1 : 0) + (pg.border ? 1 : 0) + (pg.borderWidth ? 1 : 0) + styleWeight(pg.style) + (Array.isArray(pg.hide) ? pg.hide.length : 0);
    }
    return { pages, chars, fits };
  };
  // The mark of how new a book's shapes are only ever goes up while this
  // release is the one saving. An older tab drops a page kind it doesn't know
  // AND the mark with it, and it bumps updatedAt while doing so — which is
  // exactly the case the words guard below skips. So this one ignores
  // updatedAt: a mark that goes backwards is always an out-of-date tab.
  for (const was of prevBooks) {
    const now = was && (nowBooks.versions || []).find((x) => x && x.id === was.id);
    if (!now || !was.schema) continue;
    if (!(now.schema >= was.schema)) fail(`portfolio book "${was.name || was.id}" was published by an older browser tab: its schema mark went from ${was.schema} to ${JSON.stringify(now.schema)}, which means pages it could not read were dropped.${stale}`);
  }
  for (const was of prevBooks) {
    const now = was && (nowBooks.versions || []).find((x) => x && x.id === was.id);
    if (!now || now.updatedAt !== was.updatedAt) continue;
    const a = wordsIn(was), b = wordsIn(now);
    if (b.pages < a.pages || b.chars < a.chars) fail(`portfolio book "${was.name || was.id}" lost ${a.pages - b.pages} writing page(s) and ${a.chars - b.chars} characters of words without being edited.${stale}`);
    if (b.fits < a.fits) fail(`portfolio book "${was.name || was.id}" lost ${a.fits - b.fits} photo, paper, border or text-format setting(s) without being edited.${stale}`);
  }
  const photosById = (data) => new Map((data.DEMO_SHOOTS || []).flatMap((s) => (s.photos || []).map((p) => [p.id, p])));
  const before = photosById(prevData);
  let lostPose = 0, lostUsage = 0, lostLook = 0;
  for (const [id, p] of photosById(win.WPS_DATA)) {
    const q = before.get(id);
    if (!q) continue;
    if (q.angle && !p.angle) lostPose++;
    if (q.usage && !p.usage) lostUsage++;
    if (q.look && !p.look) lostLook++;
  }
  // One photo un-tagged on purpose is normal; a batch vanishing at once isn't.
  if (lostPose >= 5) fail(`${lostPose} photos lost their pose tag in one publish.${stale}`);
  if (lostUsage >= 10) fail(`${lostUsage} photos lost their usage setting in one publish.${stale}`);
  if (lostLook >= 5) fail(`${lostLook} photos lost their kind of work in one publish.${stale}`);
} catch { /* first commit, shallow clone, or no prior data.js */ }

if (failed) process.exit(1);
console.log(`OK: ${shoots.length} albums, ids unique, all photo files present, format contract intact, cache-buster in sync.`);
