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
    const PAGE_TYPES = new Set(["photos", "spread", "about", "services", "contact", "divider", "story", "note", "quote", "letter", "feature", "article"]);
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
      photos: { caption: 90 }
    };
    const BORDERS = new Set(["none", "top", "bottom", "left", "right", "all"]);
    const BORDER_WIDTHS = new Set(["narrow", "broad"]);
    const FONTS = new Set(["fraunces", "archivo", "inter", "outfit", "playfair", "cormorant", "baskerville", "bodoni", "dmserif", "sourcesans", "jost", "manrope", "spacegrotesk", "oswald", "plexmono"]);
    const ALIGNS = new Set(["left", "center", "right", "justify"]);
    const PAPERS = new Set(["a4", "b5", "a5", "letter"]);
    const PHOTO_AT = { story: ["top", "bottom", "left", "right"], note: ["top", "bottom", "left", "right"], quote: ["top", "bottom", "left", "right"], feature: ["left", "right"], article: ["left", "right"] };
    const FITS = new Set(["fill", "whole", "width", "height"]);
    const KNOWN_KEYS = {
      photos: ["type", "photos", "caption", "border", "borderWidth", "style"], spread: ["type", "photos", "border", "borderWidth"], divider: ["type", "heading", "line"],
      about: ["type"], services: ["type"], contact: ["type", "hide"],
      story: ["type", "photos", "photoAt", "style", ...Object.keys(FIELD_MAX.story)], note: ["type", "photos", "photoAt", "style", ...Object.keys(FIELD_MAX.note)],
      quote: ["type", "photos", "photoAt", "style", ...Object.keys(FIELD_MAX.quote)], letter: ["type", "style", ...Object.keys(FIELD_MAX.letter)],
      feature: ["type", "photos", "photoAt", "style", ...Object.keys(FIELD_MAX.feature)],
      article: ["type", "photos", "photoAt", "style", "border", "borderWidth", ...Object.keys(FIELD_MAX.article)]
    };
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
        if (pg.hide !== undefined && (!Array.isArray(pg.hide) || pg.hide.some((k) => !["email", "whatsapp", "instagram", "website", "book", "studio", "qr"].includes(k)))) fail(`${where} hides contact lines the app doesn't know: ${JSON.stringify(pg.hide)}`);
        if (pg.border !== undefined && !BORDERS.has(pg.border)) fail(`${where} has an unknown border ${JSON.stringify(pg.border)}`);
        if (pg.borderWidth !== undefined && !BORDER_WIDTHS.has(pg.borderWidth)) fail(`${where} has an unknown border width ${JSON.stringify(pg.borderWidth)}`);
        if (pg.style !== undefined) {
          if (!pg.style || typeof pg.style !== "object" || Array.isArray(pg.style)) fail(`${where} has a style that is not an object`);
          else for (const [k, f] of Object.entries(pg.style)) {
            if (!(k in (FIELD_MAX[pg.type] || {}))) { fail(`${where} formats ${JSON.stringify(k)}, which isn't one of its texts`); continue; }
            if (!f || typeof f !== "object") { fail(`${where} has formatting for ${k} that is not an object`); continue; }
            for (const key of Object.keys(f)) if (!["font", "color", "align", "size", "weight", "italic"].includes(key)) fail(`${where} formats ${k} with ${JSON.stringify(key)}, which the app drops`);
            if (f.size !== undefined && !(typeof f.size === "number" && f.size >= 0.6 && f.size <= 1.6)) fail(`${where} sizes ${k} at ${JSON.stringify(f.size)}; it must be 0.6 to 1.6`);
            if (f.weight !== undefined && !["light", "regular", "bold"].includes(f.weight)) fail(`${where} sets ${k} in weight ${JSON.stringify(f.weight)}`);
            if (f.italic !== undefined && f.italic !== true) fail(`${where} has italic ${JSON.stringify(f.italic)} for ${k}; only true is written`);
            if (f.font !== undefined && !FONTS.has(f.font)) fail(`${where} sets ${k} in an unknown font ${JSON.stringify(f.font)}`);
            if (f.color !== undefined && !["ink", "soft", "accent"].includes(f.color) && !/^#[0-9a-f]{6}$/.test(String(f.color))) fail(`${where} colours ${k} ${JSON.stringify(f.color)}; use ink, soft, accent or #rrggbb`);
            if (f.align !== undefined && !ALIGNS.has(f.align)) fail(`${where} aligns ${k} ${JSON.stringify(f.align)}`);
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
  const WRITING = new Set(["story", "note", "quote", "letter", "feature", "article"]);
  const wordsIn = (b) => {
    let pages = 0, chars = 0, fits = 0;
    const settings = (s) => (s ? (s.fit ? 1 : 0) + (s.opacity !== undefined ? 1 : 0) : 0);
    fits += settings(b && b.cover) + (b && b.paper ? 1 : 0);
    for (const pg of (b && b.pages) || []) {
      if (!pg) continue;
      if (WRITING.has(pg.type)) pages++;
      for (const [k, v] of Object.entries(pg)) if (k !== "type" && typeof v === "string") chars += v.length;
      for (const s of pg.photos || []) fits += settings(s);
      fits += (pg.photoAt ? 1 : 0) + (pg.border ? 1 : 0) + (pg.borderWidth ? 1 : 0) + (pg.style ? Object.keys(pg.style).length : 0) + (Array.isArray(pg.hide) ? pg.hide.length : 0);
    }
    return { pages, chars, fits };
  };
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
