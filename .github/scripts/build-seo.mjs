#!/usr/bin/env node
/* ============================================================
   build-seo.mjs — makes the site readable without running its JavaScript.

   The site is a single-page app: every page's HTML ships with an empty
   <main id="view"> and app.js fills it in. Google can run that JavaScript,
   slowly; WhatsApp, Instagram, Bing and the AI search crawlers cannot, so to
   them every page was blank and every album shared the same preview.

   This runs in the Pages deploy (.github/workflows/pages.yml), on the
   checked-out copy that is about to be uploaded — nothing it writes is ever
   committed. From the published data.js it writes:

     /albums/<slug>/index.html     one real page per public album
     /services/…/index.html        the service landing pages (seo/services.mjs)
     a plain-HTML copy of the content inside each existing page's <main>
     /sitemap.xml                  every page above, with its photos

   The plain-HTML copy sits in <div class="prerender">. Browsers with
   JavaScript never see it (hidden by a rule in <head>, then replaced when
   app.js paints the same content); crawlers without JavaScript read it.
   Service pages are different: their HTML *is* the page, and app.js leaves
   it in place (see STATIC PAGES in app.js).

   SAFETY: everything is computed in memory first and written only at the
   very end. Any problem throws before the first write, the deploy step is
   continue-on-error, and the site goes out exactly as it is in the repo.

   Usage:  node .github/scripts/build-seo.mjs [--root <dir>] [--check]
           --root   the site folder to read and write (default: the repo)
           --check  build everything, write nothing (used by CI validation)
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const CHECK_ONLY = args.includes("--check");
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(argVal("--root") || REPO);
const ORIGIN = "https://www.nerdyphotographer.in";
const BRAND = "nerdyphotographer.in";
const OG_IMAGE = `${ORIGIN}/og-image.jpg`;

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const fail = (msg) => { throw new Error(msg); };

/* ---------- load the published data exactly as a browser would ---------- */
function loadWindowScript(rel) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read(rel), sandbox, { filename: rel, timeout: 5000 });
  return sandbox.window;
}
const DATA = loadWindowScript("data.js").WPS_DATA || fail("data.js did not define window.WPS_DATA");
const CONFIG = loadWindowScript("config.js").STUDIO_CONFIG || {};
// config.js studioPagePublic: false keeps /studio/ out of the sitemap, the site links and the page copies.
const STUDIO_PUBLIC = CONFIG.studioPagePublic !== false;
const { SERVICES, SERVICES_INDEX } = await import(pathToFileURL(path.join(ROOT, "seo/services.mjs")).href);
const { LICENCE } = await import(pathToFileURL(path.join(ROOT, "seo/licence.mjs")).href);
const { PRIVACY } = await import(pathToFileURL(path.join(ROOT, "seo/privacy.mjs")).href);
// The address of the usage terms. Google will only mark a photograph
// "Licensable" in Google Images, with a link back to the studio beside it,
// when the picture names both a page to ask on and the terms themselves.
const LICENCE_PATH = `/${LICENCE.slug}/`;
const LICENCE_URL = `${ORIGIN}${LICENCE_PATH}`;
const PRIVACY_PATH = `/${PRIVACY.slug}/`;

/* ---------- helpers that mirror app.js (keep the two in step) ---------- */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cleanName = (s) => String(s || "").replace(/\s*\([^)]*\)/g, "").trim(); // getTalentCleanName
const slugify = (s) => String(s ?? "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// "Test Shoot" / "Selective Collaboration (TFP)" are studio bookkeeping, not
// something the work gains from announcing (publicShootType in app.js).
const publicType = (s) => {
  const t = String(s.type || "").trim();
  const testish = t === "Test Shoot" || t === "Selective Collaboration (TFP)";
  if (testish && !s.showTestShootCategory) return "";
  return t === "Selective Collaboration (TFP)" ? "Selective Collab" : t;
};
const altFor = (s, frame, photo) => {
  const who = cleanName(s.talent) || String(s.title || "").trim();
  const look = photo && lookByKey.get(photo.look);
  const what = [(look && look.label) || s.activity, publicType(s)].filter(Boolean).join(" ");
  return [
    what ? `${what} photography` : "Photography",
    who ? `featuring ${who}` : "",
    `by ${BRAND}, ${cleanName(s.location) || "Noida & Delhi NCR"}`,
    frame ? `(frame ${frame})` : ""
  ].filter(Boolean).join(" ");
};
const photoPath = (p) => { const u = String(p.url || ""); return u.startsWith("photos/") ? `/${u}` : u; };
const absUrl = (u) => (/^https?:/.test(u) ? u : `${ORIGIN}${u.startsWith("/") ? "" : "/"}${u}`);
const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/* ---------- how big each photograph actually is ---------- */
/* Every <img> below has been able to state its picture's size since this
   script was written — it writes width/height whenever a photo carries w and
   h — but nothing has ever put those numbers in data.js: 0 of 142 photos as
   of Sep 2026. Without them a crawler has to fetch a picture before it knows
   its shape, Google Images has one fewer reason to prefer it, and the plain
   copy of the page reflows as the photographs arrive.

   The files are in this checkout and their own headers carry the answer, so
   it is read off the bytes instead of being typed into the Admin Panel. Pure
   header parsing on purpose: the deploy installs no dependencies (and
   node_modules is deleted before the upload), so there is no Pillow and no
   sharp here. Anything unreadable measures as null and its <img> goes out
   exactly as it did before.

   Only the full-size file is measured. The 480 and 960 variants are the same
   picture at the same aspect ratio, which is all width/height is for. */
const sizeCache = new Map();
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i += 1; continue; }            // padding between segments
    const marker = buf[i + 1];
    if (marker === 0xff) { i += 1; continue; }            // fill byte, the next one is the marker
    // Markers that stand alone: no length and no payload to skip.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    // A start-of-frame segment holds precision, then height, then width.
    // C4, C8 and CC share that range and are not frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      return w && h ? { w, h } : null;
    }
    i += 2 + len;
  }
  return null;
}
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return w && h ? { w, h } : null;
}
function imageSize(rel) {
  if (sizeCache.has(rel)) return sizeCache.get(rel);
  let out = null;
  // The whole photos folder is 37 MB, so the file is simply read; a partial
  // read would have to grow past an EXIF block big enough to hold a thumbnail.
  try { const buf = fs.readFileSync(path.join(ROOT, rel)); out = jpegSize(buf) || pngSize(buf); } catch { out = null; }
  sizeCache.set(rel, out);
  return out;
}
/** The photo with the shape of its own file attached, when the file can be measured. */
const withSize = (p) => {
  if (p.w && p.h) return p;
  const size = imageSize(String(p.url || "").replace(/^\//, ""));
  return size ? { ...p, w: size.w, h: size.h } : p;
};

/* ---------- which albums get a page ---------- */
const deleted = new Set(DATA.DELETED_IDS || []);
const allShoots = (DATA.DEMO_SHOOTS || []).filter((s) => s && s.id && !deleted.has(s.id));
// Same rule as albumPageList() in app.js — the two must agree, or a link the
// app builds points at a page this script never wrote.
// A future-dated album is under embargo: the app hides it from visitors until
// its date ("To be visible to public after …"), so it gets no page, no card and
// no sitemap line until then. CI runs in UTC and the studio is in India, so
// "today" is the calendar day in IST. pages.yml also deploys once a day, which
// is what makes the page appear on the day the embargo lifts.
const todayIST = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const isFutureShoot = (s) => {
  if (!s.date) return false;
  const t = Date.parse(s.date);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) > todayIST;
};
const albums = allShoots
  .filter((s) => !s.isTestimonial && s.type !== "Workshop Attended" && s.isPublic !== false && !isFutureShoot(s))
  .map((s) => ({ ...s, photos: (s.photos || []).filter((p) => p && typeof p.url === "string" && p.url && !p.url.startsWith("data:")).map(withSize) }))
  .filter((s) => s.photos.length);

// Oldest album keeps the bare name; a later album of the same name gets its id
// appended, so publishing a second shoot never moves the first one's address.
const slugById = new Map();
{
  const taken = new Set();
  const byAge = [...albums].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
  for (const s of byAge) {
    const base = slugify(cleanName(s.title || s.talent)) || slugify(s.id);
    let slug = taken.has(base) ? `${base}-${slugify(s.id)}` : base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${slugify(s.id)}-${n}`;
    taken.add(base); taken.add(slug);
    slugById.set(s.id, slug);
  }
}
const albumUrl = (s) => `/albums/${slugById.get(s.id)}/`;
const newestFirst = [...albums].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (b.createdAt || 0) - (a.createdAt || 0));
const albumName = (s) => cleanName(s.title || s.talent) || "Untitled";
/* The wide crop WhatsApp, Instagram and Google show for a link. Album covers
   here are portraits, and a preview card is 1.91:1, so the platforms crop the
   middle out of a standing portrait and show a chest. photos/og/<slug>.jpg is
   a 1200x630 crop taken around the head by .github/scripts/make-og-images.py;
   an album added since that last ran has no file and falls back to its cover,
   exactly as before. */
const ogCropFor = (slug) => (slug && exists(`photos/og/${slug}.jpg`) ? `/photos/og/${slug}.jpg` : "");
const albumCover = (s) => s.photos.find((p) => String(p.id).split("-")[0] === s.coverPhotoId) || s.photos[0];
const albumPlace = (s) => (s.showLocation === false ? "" : cleanName(s.location).replace(/^—$/, ""));
const albumWhat = (s) => `${s.activity ? `${s.activity} ` : ""}photoshoot`;
/* Every album page used to carry the same sentence with the name swapped, so
   ten pages read as one page ten times over (site audit Sep 2026). This builds
   from what actually differs between albums — the looks in the frames, who was
   on the shoot, who it was shot for — and steps aside entirely the moment the
   studio writes its own description in Upload, which is the real fix. */
const listOf = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}` : (a[0] || ""));
const albumLooks = (s) => {
  const out = [];
  for (const p of s.photos || []) {
    const l = p && lookByKey.get(p.look);
    if (l && l.label && !out.includes(l.label)) out.push(l.label);
  }
  return out;
};
const realName = (x) => { const v = cleanName(x).replace(/^[—–-]+$/, "").trim(); return /[a-z]/i.test(v) ? v : ""; };
const albumTeam = (s) => [...new Set([s.stylist, s.mua, s.hair, s.artDirector].map(realName).filter(Boolean))];
const albumLookCounts = (s) => {
  const n = new Map();
  for (const p of s.photos || []) {
    const l = p && lookByKey.get(p.look);
    if (l && l.label) n.set(l.label, (n.get(l.label) || 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1]);
};
const albumSentence = (s) => {
  const own = String(s.description || "").trim();
  if (own) return own;
  const place = albumPlace(s);
  const when = String(s.season || "").replace(/^—$/, "");
  const counts = albumLookCounts(s);
  const looks = counts.map(([label]) => label);
  const team = albumTeam(s);
  const forWhom = albumClients(s).map(clientLabel).filter(Boolean);
  const castFor = (Array.isArray(s.modelTypes) ? s.modelTypes : []).map((x) => String(x || "").trim()).filter(Boolean);
  const agency = realName(s.agency);
  const n = s.photos.length;
  const kind = looks.length ? listOf(looks) : (s.activity || "Studio");
  const out = [`${kind} photography with ${albumName(s)}${place ? `, shot in ${place}` : ""}${when ? ` in ${when}` : ""}.`];
  // The breakdown is the one line no two albums share: it counts this
  // album's own frames, look by look.
  const counted = counts.reduce((t, [, c]) => t + c, 0);
  const parts = listOf(counts.map(([label, c]) => `${c} ${label.toLowerCase()}`));
  const breakdown = counts.length > 1 ? (counted === n ? ` — ${parts}` : `, including ${parts}`) : "";
  out.push(`${n} photograph${n === 1 ? "" : "s"} by ${BRAND}${team.length ? `, with ${listOf(team)}` : ""}${breakdown}.`);
  if (castFor.length) out.push(`${albumName(s)} is cast for ${listOf(castFor.map((x) => x.toLowerCase()))} work${agency ? `, represented by ${agency}` : ""}.`);
  else if (agency) out.push(`${albumName(s)} is represented by ${agency}.`);
  if (forWhom.length) out.push(`Shot for: ${forWhom.join(", ")}.`);
  return out.join(" ");
};
/* Nothing writes updatedAt on an album, so every "last changed" date in the
   sitemap was the album's creation date however often its photos changed
   (Sep 2026 audit). A photo id carries the moment it was uploaded in base 36,
   so the newest photo dates the album. */
const photoStamp = (p) => {
  // The id starts with Date.now() in base 36, which is 8 characters; the rest
  // is the random tail that makes it unique.
  const t = parseInt(String((p && p.id) || "").split("-")[0].slice(0, 8), 36);
  return Number.isFinite(t) && t > 1500000000000 && t < 4000000000000 ? t : 0;
};
const albumLastMod = (s) => isoDay(
  Math.max(s.updatedAt || 0, s.createdAt || 0, ...(s.photos || []).map(photoStamp))
  || Date.parse(s.date) || Date.now());

/* ---------- the template ---------- */
const TEMPLATE = read("index.html");
const EMPTY_MAIN = /<main id="view" class="view"(?: tabindex="-1")?><\/main>/;
// Runs before first paint: browsers with JavaScript never see the plain copy.
const HEAD_SNIPPET = `  <script>document.documentElement.classList.add("js")</script>\n  <style>.js .prerender{display:none}</style>\n`;

function replaceOnce(html, pattern, replacement, what) {
  let n = 0;
  const out = html.replace(pattern, (...m) => { n += 1; return typeof replacement === "function" ? replacement(...m) : replacement; });
  if (n !== 1) fail(`template: expected exactly one ${what}, found ${n}`);
  return out;
}
function ldScript(obj, id) {
  // No raw "<" inside a <script>: "</script>" would end it, and "<!--" followed
  // by "<script" swallows the rest of the page. \u003c is the same character to
  // every JSON parser.
  return `  <script type="application/ld+json"${id ? ` id="${id}"` : ""}>${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>\n`;
}

/** A new page built from index.html: own title, description, address, preview image and content. */
/* What a search result has room for: about 60 characters of title and 155
   of description. 16 descriptions ran to 295 and 17 titles to 104, and
   Google cut them wherever it liked (Sep 2026 audit, G10). A long title
   drops the " | nerdyphotographer.in" Google shows beside it anyway; a long
   description ends at its last full sentence that fits, or a whole word. */
function fitTitle(t) {
  const s = String(t || "");
  if (s.length <= 60) return s;
  const bare = s.replace(/\s*[|—-]\s*nerdyphotographer\.in\s*$/i, "");
  return bare.length < s.length ? bare : s;
}
function fitDesc(d, max = 155) {
  const s = String(d || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.endsWith(".") ? cut.length - 1 : -1);
  if (stop > 80) return cut.slice(0, stop + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:—–-]+$/, "") + "…";
}
function pageFromTemplate({ title: rawTitle, description: rawDesc, urlPath, ogImage = OG_IMAGE, ogType = "website", jsonLd = [], mainAttrs = "", mainHtml, robots = "" }) {
  const title = fitTitle(rawTitle), description = fitDesc(rawDesc);
  let html = TEMPLATE;
  const url = `${ORIGIN}${urlPath}`;
  html = replaceOnce(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`, "<title>");
  html = replaceOnce(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(description)}" />`, "meta description");
  html = replaceOnce(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${esc(url)}" />`, "canonical");
  html = replaceOnce(html, /<meta property="og:type" content="[^"]*" \/>/, `<meta property="og:type" content="${esc(ogType)}" />`, "og:type");
  html = replaceOnce(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(title)}" />`, "og:title");
  html = replaceOnce(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(description)}" />`, "og:description");
  html = replaceOnce(html, /<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${esc(ogImage)}" />`, "og:image");
  html = replaceOnce(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${esc(url)}" />`, "og:url");
  html = replaceOnce(html, /<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${esc(ogImage)}" />`, "twitter:image");
  // The card's own size, so a platform lays the preview out before it has
  // finished downloading the picture — and an alt line for anyone whose reader
  // describes the card. Only claimed for the wide crops this build makes; a
  // fallback portrait cover is left unmeasured rather than described wrongly.
  if (/\/photos\/og\//.test(ogImage)) {
    html = replaceOnce(html, /<meta property="og:image" content="[^"]*" \/>/,
      (m) => `${m}\n  <meta property="og:image:width" content="1200" />\n  <meta property="og:image:height" content="630" />\n  <meta property="og:image:alt" content="${esc(title)}" />`,
      "og:image dimensions");
  }
  html = replaceOnce(html, /<\/head>/, `${robots ? `  <meta name="robots" content="${esc(robots)}" />\n` : ""}${jsonLd.join("")}${HEAD_SNIPPET}</head>`, "</head>");
  html = replaceOnce(html, EMPTY_MAIN, `<main id="view" class="view" tabindex="-1"${mainAttrs}>${mainHtml}</main>`, "empty <main id=\"view\">");
  return enrichBusinessLd(html);
}

/** An existing page: keep it as it is, add the plain-HTML copy of its content. */
/* The shells are hand-kept copies, and every one of them still carries the
   home page's og:title and og:description — so a /book/ link sent to a client
   previewed as the home page, with none of the words about booking a shoot
   (Sep 2026 audit). Each page's own <title> and description are already right,
   so the sharing tags are filled in from them. */
function shareTagsFromPage(html, rel) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  const desc = (html.match(/<meta name="description" content="([^"]*)" \/>/) || [])[1];
  const canon = (html.match(/<link rel="canonical" href="([^"]*)" \/>/) || [])[1];
  if (title) html = replaceOnce(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`, `og:title in ${rel}`);
  if (desc) html = replaceOnce(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${desc}" />`, `og:description in ${rel}`);
  if (canon) html = replaceOnce(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${canon}" />`, `og:url in ${rel}`);
  return html;
}

function shellWithPrerender(rel, innerHtml) {
  let html = read(rel);
  html = shareTagsFromPage(html, rel);
  html = replaceOnce(html, /<\/head>/, `${HEAD_SNIPPET}</head>`, `</head> in ${rel}`);
  // A function, not a string: in a replacement STRING "$&", "$'" and "$`" are
  // patterns, and owner-typed text containing one would splice the page apart.
  html = replaceOnce(html, EMPTY_MAIN, (m) => m.replace("></main>", () => `><div class="prerender">${innerHtml}</div></main>`), `empty <main id="view"> in ${rel}`);
  return enrichBusinessLd(html);
}

/* ---------- shared fragments ---------- */
const breadcrumbLd = (trail) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: trail.map(([name, urlPath], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${urlPath}` }))
});

// `clients` (the pages for a kind of client) adds who the album was shot for,
// and the data-clients the page's filter buttons read.
const albumCardHtml = (s, { clients } = {}) => {
  const cover = albumCover(s);
  const sub = [s.activity, albumPlace(s), String(s.season || "").replace(/^—$/, "")].filter(Boolean).join(" · ");
  return `<a class="pr-card" href="${albumUrl(s)}" data-link${clients ? ` data-clients="${esc(clients.join(" "))}"` : ""}>
        <img src="${esc(photoPath(cover.small ? { url: cover.small } : cover))}"${srcsetOf(cover) ? ` srcset="${esc(srcsetOf(cover))}" sizes="(max-width: 760px) 94vw, (max-width: 1100px) 47vw, 30vw"` : ""} alt="${esc(altFor(s))}" loading="lazy" style="object-position: ${esc(cover.objectPosition || "center")};" />
        <span class="pr-card-title">${esc(albumName(s))}</span>
        ${sub ? `<span class="pr-card-sub">${esc(sub)}</span>` : ""}
        ${clients ? `<span class="pr-card-for">Shot for: ${esc(clients.map(clientLabel).join(" · "))}</span>` : ""}
      </a>`;
};
const albumCardsHtml = (list) => `<div class="pr-cards">\n      ${list.map((s) => albumCardHtml(s)).join("\n      ")}\n    </div>`;

const serviceLinksHtml = (skipSlug) => liveServices.filter((v) => v.slug !== skipSlug).map((v) =>
  `<a href="/services/${v.slug}/" data-link class="service-card" style="display: block; text-decoration: none; color: inherit;">
          <div class="service-kicker">${esc(v.audience)}</div>
          <h3>${esc(v.cardTitle)}</h3>
          <p>${esc(v.cardBlurb)}</p>
        </a>`).join("\n        ");

const siteLinksHtml = `<nav class="container pr-links" aria-label="Site">
      <a href="/" data-link>Home</a> · <a href="/albums/" data-link>Albums</a> · <a href="/services/" data-link>What I shoot</a> · ${STUDIO_PUBLIC ? `<a href="/studio/" data-link>Studio</a> · ` : ""}<a href="/book/" data-link>Book a shoot</a> · <a href="${LICENCE_PATH}" data-link>Photo licensing</a> · <a href="${PRIVACY_PATH}" data-link>Privacy</a>
    </nav>`;

/* ---------- album pages ---------- */
function buildAlbumPage(s) {
  const name = albumName(s);
  const place = albumPlace(s);
  const cover = albumCover(s);
  const title = `${name} — ${albumWhat(s)}${place ? ` in ${place}` : ""} | ${BRAND}`;
  const description = String(s.description || "").trim() || albumSentence(s);
  const urlPath = albumUrl(s);
  const credits = s.showCredits === false ? [] : [
    ["Photographer", (CONFIG.photographerName && cleanName(s.photographer) === BRAND) ? `${CONFIG.photographerName} (${BRAND})` : cleanName(s.photographer)], ["Art direction", cleanName(s.artDirector)], ["Styling", cleanName(s.stylist)],
    ["Hair", cleanName(s.hair)], ["Make-up", cleanName(s.mua)]
  ].filter(([, v]) => v && v !== "—");
  const others = newestFirst.filter((o) => o.id !== s.id).slice(0, 6);

  const gallery = {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    name: `${name} — ${albumWhat(s)}`,
    description,
    url: `${ORIGIN}${urlPath}`,
    ...(s.date ? { dateCreated: s.date } : {}),
    creator: { "@id": `${ORIGIN}/#identity` },
    image: s.photos.map((p, i) => ({
      "@type": "ImageObject",
      contentUrl: absUrl(photoPath(p)),
      name: `${name} — frame ${i + 1}`,
      caption: p.caption || altFor(s, i + 1, p),
      ...(p.w && p.h ? { width: p.w, height: p.h } : {}),
      creditText: BRAND,
      copyrightNotice: `© ${BRAND}`,
      creator: { "@type": "Organization", name: BRAND, url: `${ORIGIN}/` },
      license: LICENCE_URL,
      acquireLicensePage: `${ORIGIN}/book/`
    }))
  };

  const mainHtml = `<div class="prerender">
    <article>
      <header class="page-head"><div class="container">
        <p class="eyebrow">${esc([s.activity && `${s.activity} photography`, place].filter(Boolean).join(" · ") || "Album")}</p>
        <h1>${esc(name)}</h1>
        <p class="page-sub">${esc(description)}</p>
      </div></header>
      <section class="section container">
        <div class="pr-photos">
          ${s.photos.map((p, i) => `<img src="${esc(photoPath(p.small ? { url: p.small } : p))}"${srcsetOf(p) ? ` srcset="${esc(srcsetOf(p))}" sizes="(max-width: 760px) 45vw, 30vw"` : ""}${p.w && p.h ? ` width="${p.w}" height="${p.h}"` : ""} alt="${esc(p.caption || altFor(s, i + 1, p))}"${i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async" />`).join("\n          ")}
        </div>
        ${credits.length ? `<p class="pr-credits">${credits.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ")}</p>` : ""}
        ${partOfHtml(s)}
        <p><a href="/book/" data-link>Book a photoshoot with ${BRAND}</a> · <a href="/albums/" data-link>All albums</a></p>
      </section>
      ${others.length ? `<section class="section container">
        <h2>More albums</h2>
        ${albumCardsHtml(others)}
      </section>` : ""}
    </article>
    ${siteLinksHtml}
  </div>`;

  return {
    rel: `albums/${slugById.get(s.id)}/index.html`,
    html: pageFromTemplate({
      title, description, urlPath,
      ogImage: absUrl(ogCropFor(slugById.get(s.id)) || photoPath(cover)),
      ogType: "article",
      jsonLd: [ldScript(gallery, "wps-image-schema"), ldScript(breadcrumbLd([["Home", "/"], ["Albums", "/albums/"], [name, urlPath]]))],
      mainHtml
    })
  };
}

/* The service pages are the ones that win searches, and no album linked to
   them (Sep 2026 audit, G11). Each album names the pages its photographs
   appear on. */
function partOfHtml(s) {
  const pages = liveServices.filter((v) => (v.albumFilter && v.albumFilter.look
    ? photosForPage(v).some((x) => x.s.id === s.id)
    : albumsForPage(v).some((a) => a.id === s.id)));
  if (!pages.length) return "";
  return `<p class="pr-partof">Part of: ${pages.map((v) => `<a href="/services/${esc(v.slug)}/" data-link>${esc(v.cardTitle || v.kicker || v.slug)} →</a>`).join(" · ")}</p>`;
}

/* ---------- service pages ---------- */
const packages = Array.isArray(DATA.PACKAGES) ? DATA.PACKAGES.filter((p) => p && p.name && Number(p.price) > 0) : [];

// What a page shows decides whether it exists. A page that fills its "recent
// work" with whatever was shot last shows a gym owner a fashion editorial, which
// is worse than showing nothing, so a page with no work of its own is not
// written, not linked and not in the sitemap. It appears by itself the moment
// one photo or album is filed under it.
//
// The vocabularies are config.js `looks` and `clients`, shared with the app.
// The rules below mirror albumLook / photoLook / albumClients / albumOnClientPage
// in app.js: keep the two in step.
const LOOKS = Array.isArray(CONFIG.looks) && CONFIG.looks.length ? CONFIG.looks : fail("config.js: `looks` is missing");
const CLIENTS = Array.isArray(CONFIG.clients) && CONFIG.clients.length ? CONFIG.clients : fail("config.js: `clients` is missing");
const lookByKey = new Map(LOOKS.map((l) => [l.key, l]));
const clientByKey = new Map(CLIENTS.map((c) => [c.key, c]));
const lookLabel = (k) => (lookByKey.get(k) || {}).label || "";
const clientLabel = (k) => (clientByKey.get(k) || {}).label || k;

// The kind of work an album is filed as — what its untagged photos follow.
// Activity decides first; Type only where a look names one (Fine Art → Creative).
const albumLook = (s) => (LOOKS.find((l) => (l.activities || []).includes(s.activity))
  || LOOKS.find((l) => (l.types || []).includes(s.type)) || {}).key || "";
// A photo's own tag wins; an untagged photo follows its album.
const photoLook = (p, s) => (lookByKey.has(p.look) ? p.look : albumLook(s));

const hasClient = (s) => !!(s.client && s.client.trim());
const oneModel = (s) => {
  const t = (s.talent || "").trim();
  return !!t && !t.includes(",") && !/\s(and|&)\s/i.test(t);
};
/* Who is in an album and in a frame. This mirrors albumModelKeys /
   photoModelKeys in app.js and MUST stay in step with them: a model page built
   here for a grouping the site does not make is a page that 404s on click, and
   one the site makes but this does not is a model with no page at all. The
   published MODELS list names the people; an album from before tagging existed
   falls back to the old rule, one model named and no client or brand. */
const MODEL_ITEMS = (DATA.MODELS && Array.isArray(DATA.MODELS.items)) ? DATA.MODELS.items
  : (Array.isArray(DATA.MODELS) ? DATA.MODELS : []);
const modelByKey = new Map(MODEL_ITEMS.map((m) => [m.key, m]));
const modelKeyOf = (name) => slugify(cleanName(name));
const modelNameFromKey = (k) => String(k || "").split("-").filter(Boolean)
  .map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const albumModelKeys = (s) => {
  if (!s) return [];
  if (Array.isArray(s.modelKeys)) return s.modelKeys.map((k) => String(k || "").trim()).filter(Boolean);
  const t = String(s.talent || "").trim();
  if (!t) return [];
  const studiosOwn = !hasClient(s) && (!s.brand || s.brand === "Personal Project" || !s.brand.trim());
  return oneModel(s) && studiosOwn ? [modelKeyOf(t)].filter(Boolean) : [];
};
const photoModelKeys = (p, s) => {
  const tagged = (p && Array.isArray(p.models)) ? p.models.map((k) => String(k || "").trim()).filter(Boolean) : [];
  if (tagged.length) return tagged;
  const album = albumModelKeys(s);
  return album.length === 1 ? album : [];
};
// Filed as creative on purpose. For an album with no client set, this wins over
// the model-work rule, or one model's album filed as Creative would still count
// as a model portfolio.
const filedAsCreative = (s) => {
  const c = lookByKey.get("creative") || {};
  return (c.activities || []).includes(s.activity) || (c.types || []).includes(s.type);
};
// Who the album was made for: its main client first, then anyone it is also
// for. Empty for an album saved before clients existed.
const albumClients = (s) => (clientByKey.has(s.forClient)
  ? [...new Set([s.forClient, ...(Array.isArray(s.alsoFor) ? s.alsoFor : []).filter((k) => clientByKey.has(k))])]
  : []);
// An album with a client is on the pages for that client and no others. One
// without falls back to the rules the page kept from before clients existed.
function albumOnClientPage(f, s) {
  const mine = albumClients(s);
  if (mine.length) return (f.clients || []).some((c) => mine.includes(c));
  if (f.types && f.types.includes(s.type)) return true;
  if (f.modelWork && oneModel(s) && !hasClient(s) && !filedAsCreative(s)) return true;
  if (f.clientWork && hasClient(s)) return true;
  return false;
}
// The clients a card names. An album that matched by a fallback rule is
// named after the page's own first client (Model, Brand).
const cardClients = (v, s) => { const mine = albumClients(s); return mine.length ? mine : [v.albumFilter.clients[0]]; };

const clientPages = SERVICES.filter((v) => v.albumFilter && v.albumFilter.clients);
const albumsForPage = (v) => newestFirst.filter((s) => albumOnClientPage(v.albumFilter, s));
const claimedByClientPage = (s) => clientPages.some((v) => albumOnClientPage(v.albumFilter, s));
// Every photo of the page's kind, newest album first and in each album's own
// order. "residual" is the catch-all: it also takes the untagged photos of an
// album that has no kind of its own and that no client page claims.
const photosForPage = (v) => {
  const f = v.albumFilter;
  return newestFirst.flatMap((s) => s.photos.map((p, i) => ({ s, p, i, look: photoLook(p, s) }))
    .filter((x) => x.look === f.look || (f.residual && !x.look && !claimedByClientPage(s))));
};
const liveServices = SERVICES.filter((v) => (v.albumFilter && v.albumFilter.look ? photosForPage(v) : albumsForPage(v)).length > 0);
// The comp cards live on the page that carries them, once it exists (app.js compCardsHref).
const compCardsPage = liveServices.find((v) => v.compCards);
const compCardsHref = compCardsPage ? `/services/${compCardsPage.slug}/#comp-cards` : "/categories/?kind=type&val=Comp%20Cards";

// Every photo of one kind, as a grid. Each tile is a plain link to its album,
// which is what a visitor without JavaScript (and a crawler) follows; app.js
// opens the photo full screen instead, and swipes through the whole grid.
// Each file labelled with its real width, the same rule as srcsetValue in
// app.js: the 480 and 960 files are that long on their LONG edge (G2).
const srcsetOf = (p0) => {
  const p = withSize(p0);
  const W = Number(p.w) || 0, H = Number(p.h) || 0;
  const long = Math.max(W, H) || 1600, wide = W && H ? W / long : 2 / 3;
  const widthAt = (edge) => Math.max(1, Math.round(Math.min(edge, long) * wide));
  const set = [];
  if (p.small) set.push(`${photoPath({ url: p.small })} ${widthAt(480)}w`);
  if (p.medium) set.push(`${photoPath({ url: p.medium })} ${widthAt(960)}w`);
  if (set.length) set.push(`${photoPath(p)} ${W || widthAt(1600)}w`);
  return set.join(", ");
};
const focusCss = (p) => (typeof p.focalX === "number" && typeof p.focalY === "number" ? `${p.focalX}% ${p.focalY}%` : (p.objectPosition || "center"));
function photoGridHtml(items) {
  return `<div class="svc-photos">
      ${items.map(({ s, p, i, look }) => {
        const ss = srcsetOf(p);
        // The alt names the kind of work this photo is, not the album's.
        const alt = p.caption || altFor({ ...s, activity: lookLabel(look) || s.activity }, i + 1, p);
        return `<a class="svc-photo" href="${albumUrl(s)}" data-shoot="${esc(s.id)}" data-photo="${esc(p.id)}" data-look="${esc(look)}">
        <img src="${esc(photoPath(p.small ? { url: p.small } : p))}"${ss ? ` srcset="${esc(ss)}" sizes="(max-width: 620px) 50vw, (max-width: 1100px) 25vw, 220px"` : ""} alt="${esc(alt)}" loading="lazy" decoding="async" style="object-position: ${esc(focusCss(p))};" />
      </a>`;
      }).join("\n      ")}
    </div>`;
}
// Album cards saying who each was shot for. Filter buttons appear once two or
// more of the page's clients have work — a button that empties the page helps
// nobody. They need JavaScript, so the page's CSS shows them only with it.
function clientCardsHtml(v, list) {
  const present = v.albumFilter.clients.filter((c) => list.some((s) => cardClients(v, s).includes(c)));
  const chips = present.length > 1 ? `<div class="svc-chips" role="group" aria-label="Show work for">
        <button type="button" class="svc-chip" data-client="" aria-pressed="true">All</button>
        ${present.map((c) => `<button type="button" class="svc-chip" data-client="${esc(c)}" aria-pressed="false">${esc((clientByKey.get(c) || {}).plural || clientLabel(c))}</button>`).join("\n        ")}
      </div>` : "";
  return `${chips}
      <div class="pr-cards svc-cards">
      ${list.map((s) => albumCardHtml(s, { clients: cardClients(v, s) })).join("\n      ")}
      </div>`;
}

function buildServicePage(v) {
  const urlPath = `/services/${v.slug}/`;
  const picked = packages.filter((p) => (v.packageIds || []).includes(p.id));
  const shown = picked.length ? picked : packages;
  // A page for a kind of photograph shows the photos; a page for a kind of
  // client shows the albums made for them.
  const grid = v.albumFilter.look ? photosForPage(v) : null;
  const cards = grid ? null : albumsForPage(v);
  /* A "See sports work →" link that lands on "0 master albums in this
     activity… Nothing here yet" helps nobody and gives Google an empty page to
     index (Sep 2026 audit). A link to a filtered view is only written when
     that view has something in it; links to anything else are left alone. */
  const categoryHasWork = (href) => {
    const m = String(href).match(/[?&]kind=([^&]+)&val=([^&]+)/);
    if (!m) return true;                       // not a filtered view
    let kind, val;
    try { kind = decodeURIComponent(m[1]); val = decodeURIComponent(m[2]); } catch { return true; }
    if (kind === "activity") {
      // Exactly albumHasActivity() in app.js, including the [0]: the view
      // counts an album under a genre only when that genre is the FIRST
      // activity of a photo's look, so a looser test here would keep writing a
      // link to a page the site itself renders empty.
      return newestFirst.some((s) => s.activity === val
        || (s.photos || []).some((p) => p && lookByKey.has(p.look) && (lookByKey.get(p.look).activities || [])[0] === val));
    }
    if (kind === "brand") return newestFirst.some((s) => s.brand === val);
    if (kind === "type") return newestFirst.some((s) => s.type === val);
    return true;
  };
  const workLinks = (v.workLinks || []).filter((l) => categoryHasWork(l.href));
  // The wide crop of whichever album that lead photo came from, so a shared
  // "What I shoot" link shows a face rather than the middle of a portrait.
  const albumOfPhoto = (photo) => newestFirst.find((sh) => (sh.photos || []).some((q) => q && q.id === photo.id));
  const leadAlbum = grid ? (grid.length ? (grid[0].s || albumOfPhoto(grid[0].p)) : null) : (cards.length ? cards[0] : null);
  const leadCrop = leadAlbum ? ogCropFor(slugById.get(leadAlbum.id)) : "";
  const ogImage = leadCrop ? absUrl(leadCrop)
    : grid ? (grid.length ? absUrl(photoPath(grid[0].p)) : OG_IMAGE)
    : (cards.length ? absUrl(photoPath(albumCover(cards[0]))) : OG_IMAGE);

  const serviceLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: v.h1,
    serviceType: v.cardTitle,
    description: v.metaDescription,
    url: `${ORIGIN}${urlPath}`,
    provider: { "@id": `${ORIGIN}/#identity` },
    areaServed: ["Noida", "Greater Noida", "Delhi", "Delhi NCR"].map((n) => ({ "@type": "AdministrativeArea", name: n })),
    // No offers/AggregateOffer: prices are quoted to the brief, not published.
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: v.faqs.map(([q, a, points]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: points ? `${a} ${points.map((t, i) => `${i + 1}. ${t}`).join(" ")}` : a } }))
  };

  const mainHtml = `
    <section class="page-head svc-head"><div class="container">
      <p class="eyebrow">${esc(v.audience)} · ${esc(v.eyebrow)}</p>
      <h1 class="svc-h1">${esc(v.h1)}</h1>
      ${v.audienceLead ? `<p class="svc-audience">${esc(v.audienceLead)}</p>` : ""}
      <p class="page-sub">${esc(v.intro[0])}</p>
      <div class="hero-actions svc-actions">
        <a href="/book/" data-link class="btn btn-dark">Book a shoot →</a>
        ${workLinks[0] ? `<a href="${esc(workLinks[0].href)}" data-link class="btn btn-ghost">${esc(workLinks[0].label)}</a>` : ""}
      </div>
    </div></section>

    <section class="section container svc-body">
      <div class="svc-prose">
        ${v.intro.slice(1).map((p) => `<p>${esc(p)}</p>`).join("\n        ")}
      </div>
      <div class="svc-includes">
        <h2>${esc(v.includesTitle)}</h2>
        <ol class="svc-list">
          ${v.includes.map((t) => `<li>${esc(t)}</li>`).join("\n          ")}
        </ol>
      </div>
    </section>

    ${(grid || cards).length ? `<section class="section container section-divider"${v.compCards ? ' id="comp-cards"' : ""}>
      <div class="section-head row">
        <div>
          <p class="eyebrow">The work · ${grid ? `${grid.length} photograph${grid.length === 1 ? "" : "s"}` : `${cards.length} album${cards.length === 1 ? "" : "s"}`}</p>
          <h2>Judge it by the pictures</h2>
        </div>
        <div class="svc-worklinks">${workLinks.map((l) => `<a href="${esc(l.href)}" data-link class="link-arrow">${esc(l.label)} →</a>`).join("")}</div>
      </div>
      ${grid ? photoGridHtml(grid) : v.compCards ? `<div data-comp-cards>${clientCardsHtml(v, cards)}</div>` : clientCardsHtml(v, cards)}
    </section>` : ""}

    <section class="section container section-divider">
      <div class="section-head"><p class="eyebrow">Questions</p><h2>Before you book</h2></div>
      <div class="svc-faq">
        ${v.faqs.map(([q, a, points]) => `<details>
          <summary>${esc(q)}</summary>
          <p>${esc(a)}</p>${points ? `
          <ol class="svc-list" style="margin: -8px 0 22px; max-width: 700px;">
            ${points.map((t) => `<li>${esc(t)}</li>`).join("\n            ")}
          </ol>` : ""}
        </details>`).join("\n        ")}
      </div>
    </section>

    <section class="section container section-divider">
      <div class="section-head"><p class="eyebrow">Also at the studio</p><h2>Other shoots</h2></div>
      <div class="services-grid">
        ${serviceLinksHtml(v.slug)}
      </div>
    </section>
`;

  return {
    rel: `services/${v.slug}/index.html`,
    html: pageFromTemplate({
      title: v.metaTitle, description: v.metaDescription, urlPath, ogImage,
      jsonLd: [ldScript(serviceLd), ldScript(faqLd), ldScript(breadcrumbLd([["Home", "/"], ["What I shoot", "/services/"], [v.cardTitle, urlPath]]))],
      mainAttrs: ` data-static-path="/services/${v.slug}" data-title="${esc(v.metaTitle)}" data-desc="${esc(v.metaDescription)}"`,
      mainHtml
    })
  };
}

/* The usage terms, as a real page. Generated rather than kept as a shell, so
   it costs no hand-maintained copy of the site's <head> — see seo/licence.mjs
   for why it is worded the way it is, and why it points at the booking page's
   terms instead of repeating them. */
/* The privacy notice (seo/privacy.mjs) is the same kind of page: words in
   one file, built here, no shell. buildLicencePage takes it too. */
function buildLicencePage(x = LICENCE, urlPath = LICENCE_PATH, cta = `<a href="/book/" data-link>Ask about licensing a photograph</a> · <a href="/albums/" data-link>Browse the albums</a>`) {
  const mainHtml = `
    <header class="page-head"><div class="container">
      <p class="eyebrow">${esc(x.eyebrow)}</p>
      <h1>${esc(x.h1)}</h1>
      <p class="page-sub">${esc(x.intro)}</p>
    </div></header>
    <section class="section container">
      ${x.sections.map((sec) => `<h2>${esc(sec.heading)}</h2>
      ${sec.body.map((t) => `<p>${esc(t)}</p>`).join("\n      ")}${sec.points ? `
      <ul>
        ${sec.points.map((t) => `<li>${esc(t)}</li>`).join("\n        ")}
      </ul>` : ""}`).join("\n      ")}
      <p>${cta}</p>
    </section>
    ${siteLinksHtml}`;

  return {
    rel: `${x.slug}/index.html`,
    html: pageFromTemplate({
      title: x.metaTitle, description: x.metaDescription, urlPath,
      jsonLd: [ldScript(breadcrumbLd([["Home", "/"], [x.h1, urlPath]]))],
      mainAttrs: ` data-static-path="/${x.slug}" data-title="${esc(x.metaTitle)}" data-desc="${esc(x.metaDescription)}"`,
      mainHtml
    })
  };
}

function buildServicesIndex() {
  const x = SERVICES_INDEX;
  // Only describe the pages that were actually published. The old description
  // named brand campaigns, which has no page until there is campaign work to
  // put on it, so the promise went out to Google unkept (site audit Sep 2026).
  const kinds = liveServices.map((v) => v.cardTitle);
  const list = kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}` : (kinds[0] || "");
  const metaDescription = kinds.length
    ? `${list} — photographed in Noida and across Delhi NCR. See the work on each page and send a brief for a quote.`
    : x.metaDescription;
  const mainHtml = `
    <section class="page-head svc-head"><div class="container">
      <p class="eyebrow">${esc(x.eyebrow)}</p>
      <h1 class="svc-h1">${esc(x.h1)}</h1>
      <p class="page-sub">${esc(x.intro)}</p>
    </div></section>
    <section class="section container">
      <div class="services-grid">
        ${serviceLinksHtml(null)}
      </div>
    </section>
    ${newestFirst.length ? `<section class="section container section-divider">
      <div class="section-head row">
        <div><p class="eyebrow">Recent work</p><h2>From the archive</h2></div>
        <a href="/albums/" data-link class="link-arrow">All albums →</a>
      </div>
      ${albumCardsHtml(newestFirst.slice(0, 6))}
    </section>` : ""}`;
  return {
    rel: "services/index.html",
    html: pageFromTemplate({
      title: x.metaTitle, description: metaDescription, urlPath: "/services/",
      jsonLd: [ldScript(breadcrumbLd([["Home", "/"], ["What I shoot", "/services/"]]))],
      mainAttrs: ` data-static-path="/services" data-title="${esc(x.metaTitle)}" data-desc="${esc(metaDescription)}"`,
      mainHtml
    })
  };
}

/* ---------- plain-HTML copies for the existing pages ---------- */
function processSteps() {
  // The five steps on the Studio page live in app.js; read them rather than
  // keep a second copy here that would drift.
  const m = read("app.js").match(/const PROCESS = (\[[\s\S]*?\n {2}\]);/);
  if (!m) return [];
  try { const v = vm.runInNewContext(`(${m[1]})`, {}, { timeout: 1000 }); return Array.isArray(v) ? v : []; } catch { return []; }
}

/* Every testimonial a crawler should see, from both places they live: the
   written-in ones (WPS_DATA.TESTIMONIALS, what the form on /testimonials
   collects and the studio publishes) and the older ones that ride along on an
   album. The count this returns is what decides whether /testimonials is in
   the sitemap and out of noindex at all — see hiddenShells at the foot of
   this file. */
function testimonials() {
  const out = [];
  const store = DATA.TESTIMONIALS || {};
  const gone = new Set(Array.isArray(store.deleted) ? store.deleted : []);
  for (const t of (Array.isArray(store.items) ? store.items : [])) {
    if (!t || !t.id || !t.quote || gone.has(t.id)) continue;
    out.push({ quote: t.quote, by: t.by || "Anonymous", role: t.role || "", rating: Number(t.rating) || 0 });
  }
  for (const s of allShoots) {
    if (s.isPublic === false) continue;
    if (s.isTestimonial && s.description) out.push({ quote: s.description, by: cleanName(s.talent) || "Anonymous" });
    else for (const t of (s.testimonials || [])) if (t && t.quote) out.push({ quote: t.quote, by: t.by || "Anonymous" });
  }
  return out;
}

function prerenderBlocks() {
  const quotes = testimonials();
  const blocks = {};

  blocks["index.html"] = `
    <header class="page-head"><div class="container">
      <p class="eyebrow">The Creative Studio · Noida · Delhi NCR</p>
      <h1>${BRAND} — fashion, fitness &amp; model portfolio photography in Noida &amp; Delhi NCR</h1>
      <p class="page-sub">Not just photos, a perspective. Editorial-grade portfolios, comp cards, fashion and fitness photography for models and brands, shot in the studio in Noida and on location across Delhi NCR.</p>
      <p><a href="/book/" data-link>Book a shoot</a> · <a href="${liveServices.length ? "/services/" : "/albums/"}" data-link>Explore the work</a></p>
    </div></header>
    <section class="section container">
      <h2>Photoshoots</h2>
      ${albumCardsHtml(newestFirst)}
    </section>
    <section class="section container">
      <h2>Who I shoot for</h2>
      <div class="services-grid">
        ${serviceLinksHtml(null)}
      </div>
    </section>
    ${quotes.length ? `<section class="section container"><h2>Testimonials</h2>${quotes.slice(0, 5).map((t) => `<blockquote><p>${esc(t.quote)}</p><footer>${esc(t.by)}</footer></blockquote>`).join("")}</section>` : ""}
    ${siteLinksHtml}`;

  blocks["albums/index.html"] = `
    <header class="page-head"><div class="container">
      <p class="eyebrow">The archive</p>
      <h1>Albums</h1>
      <p class="page-sub">${albums.length} album${albums.length === 1 ? "" : "s"} in the archive — every photoshoot by ${BRAND}, newest first.</p>
    </div></header>
    <section class="section container">
      ${albumCardsHtml(newestFirst)}
    </section>
    ${siteLinksHtml}`;

  if (STUDIO_PUBLIC) {
    const steps = processSteps();
    blocks["studio/index.html"] = `
      <header class="page-head"><div class="container">
        <p class="eyebrow">The studio</p>
        <h1>Studio</h1>
        <p class="page-sub">A home for the photography behind ${BRAND}'s work — a working studio in Noida and a living archive, in one place.</p>
      </div></header>
      <section class="section container">
        ${CONFIG.introQuote ? `<p>${esc(CONFIG.introQuote)}</p>` : ""}
        ${steps.length ? `<h2>The process</h2><ol>${steps.map(([t, d]) => `<li><strong>${esc(t)}.</strong> ${esc(d)}</li>`).join("")}</ol>` : ""}
        <h2>What I shoot</h2>
        <div class="services-grid">
          ${serviceLinksHtml(null)}
        </div>
      </section>
      ${siteLinksHtml}`;
  }

  blocks["book/index.html"] = `
    <header class="page-head"><div class="container">
      <p class="eyebrow">Bookings</p>
      <h1>Book a shoot</h1>
      <p class="page-sub">Book a photoshoot with ${BRAND} in Noida and Delhi NCR. Pick a package and a weekend date, read the terms in full and send your brief.</p>
    </div></header>
    <section class="section container">
      ${packages.length ? `<h2>What you get</h2><ul>${packages.map((p) => `<li><strong>${esc(p.name)}</strong>${p.specs ? ` — ${esc(p.specs)}` : ""}</li>`).join("")}</ul>` : ""}
      <h2>What kind of shoot?</h2>
      <div class="services-grid">
        ${serviceLinksHtml(null)}
      </div>
      <noscript><p>The booking form needs JavaScript. You can also email ${esc(CONFIG.email || "")}.</p></noscript>
    </section>
    ${siteLinksHtml}`;

  if (exists("testimonials/index.html")) {
    // The crawler's copy mirrors what the page says on arrival: the wall when
    // there is one, and the invitation to write the first when there is not.
    // The page is noindexed while it is empty, so this second version is for
    // the reader whose JavaScript never arrives, not for search.
    blocks["testimonials/index.html"] = `
    <header class="page-head"><div class="container">
      <p class="eyebrow">${quotes.length ? "In their words" : "Your turn"}</p>
      <h1>Testimonials</h1>
      <p class="page-sub">${quotes.length
        ? `Words from models, brands and creative partners about their shoot with ${BRAND}.`
        : `Nobody has written one yet. If you have shot with ${BRAND}, yours would be the first.`}</p>
    </div></header>
    <section class="section container">
      ${quotes.length
        ? quotes.map((t) => `<blockquote><p>${esc(t.quote)}</p><footer>${esc(t.by)}${t.role ? ` — ${esc(t.role)}` : ""}</footer></blockquote>`).join("")
        : ""}
      <h2>Write a testimonial</h2>
      <p>Anyone who has worked with ${BRAND} can write one — models, brands and agencies, and anyone who came to a workshop. The form on this page needs JavaScript; you can also email ${esc(CONFIG.email || "")} directly, and attach a PDF or a picture if you have something that backs it up.</p>
    </section>
    ${siteLinksHtml}`;
  }
  return { blocks, quoteCount: quotes.length };
}

/* ---------- the studio's own schema, enriched from published data ---------- */
// Every page carries the same LocalBusiness block (@id …/#identity). Prices are
// not written into the HTML by hand — they change in the Admin Panel — so the
// price range and the package list are merged into that block here.
// The business block gets the studio's contact details. It deliberately gets no
// priceRange and no offer catalogue: the studio quotes each shoot to its brief,
// and a number published here would be read as a ceiling before any conversation.
function enrichBusinessLd(html) {
  const extras = {
    currenciesAccepted: "INR",
    ...(CONFIG.email ? { email: CONFIG.email } : {}),
  };
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (whole, json) => {
    if (!json.includes("/#identity")) return whole;
    try {
      const o = JSON.parse(json);
      if (o["@id"] !== `${ORIGIN}/#identity`) return whole;
      return `<script type="application/ld+json">${JSON.stringify({ ...o, ...extras }).replace(/</g, "\\u003c")}</script>`;
    } catch { return whole; } // a block we cannot read is left exactly as it was
  });
}

/* ---------- sitemap ---------- */
function buildSitemap({ quoteCount }) {
  const newest = albums.length ? albums.map(albumLastMod).sort().pop() : null;
  const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const entry = (urlPath, lastmod, images = []) => `  <url>
    <loc>${xml(ORIGIN + urlPath)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}${images.map((u) => `\n    <image:image><image:loc>${xml(u)}</image:loc></image:image>`).join("")}
  </url>`;
  const rows = [
    entry("/", newest, newestFirst.map((s) => absUrl(photoPath(albumCover(s))))),
    entry("/albums/", newest),
    ...newestFirst.map((s) => entry(albumUrl(s), albumLastMod(s), s.photos.map((p) => absUrl(photoPath(p))))),
    ...(liveServices.length ? [entry("/services/", null)] : []),
    ...liveServices.map((v) => entry(`/services/${v.slug}/`, null)),
    ...(STUDIO_PUBLIC ? [entry("/studio/", null)] : []),
    entry("/book/", null),
    entry(LICENCE_PATH, null),
    entry(PRIVACY_PATH, null),
    ...(quoteCount ? [entry("/testimonials/", null)] : [])
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${rows.join("\n")}
</urlset>
`;
}

/* ---------- checks, then build, then write ---------- */
function checkServices() {
  const slugs = SERVICES.map((v) => v.slug);
  if (new Set(slugs).size !== slugs.length) fail("seo/services.mjs: two services share a slug");
  for (const v of SERVICES) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.slug)) fail(`seo/services.mjs: bad slug "${v.slug}"`);
    for (const k of ["kicker", "cardTitle", "cardBlurb", "metaTitle", "metaDescription", "eyebrow", "h1", "includesTitle", "audience", "emptyNote"]) if (!v[k]) fail(`seo/services.mjs: ${v.slug} is missing ${k}`);
    // All four must answer the same question, or a visitor cannot tell which is theirs.
    if (!/^For /.test(v.audience)) fail(`seo/services.mjs: ${v.slug} audience must start with "For " — it names who the page is for`);
    if (!Array.isArray(v.intro) || !v.intro.length || !Array.isArray(v.includes) || !Array.isArray(v.faqs) || !Array.isArray(v.workLinks)) fail(`seo/services.mjs: ${v.slug} is incomplete`);
    const isText = (t) => typeof t === "string" && t.trim() !== "";
    for (const f of v.faqs) {
      const ok = Array.isArray(f) && isText(f[0]) && isText(f[1])
        && (f.length === 2 || (f.length === 3 && Array.isArray(f[2]) && f[2].length && f[2].every(isText)));
      if (!ok) fail(`seo/services.mjs: ${v.slug} has a question that is not [question, answer] or [question, answer, [points]]: ${JSON.stringify(f)}`);
    }
    // A page is either for a kind of photograph or for a kind of client, and
    // every key it names must exist in config.js — an unknown one is a page
    // that silently never finds its work.
    const f = v.albumFilter || {};
    if (!f.look === !f.clients) fail(`seo/services.mjs: ${v.slug} albumFilter needs exactly one of \`look\` or \`clients\``);
    if (f.look && !lookByKey.has(f.look)) fail(`seo/services.mjs: ${v.slug} names look "${f.look}", which config.js \`looks\` does not have`);
    if (f.clients && (!Array.isArray(f.clients) || !f.clients.length || f.clients.some((c) => !clientByKey.has(c)))) fail(`seo/services.mjs: ${v.slug} names a client that config.js \`clients\` does not have: ${JSON.stringify(f.clients)}`);
  }
  for (const list of [LOOKS, CLIENTS]) {
    const keys = list.map((x) => x && x.key);
    if (keys.some((k) => !/^[a-z]+$/.test(k || "")) || new Set(keys).size !== keys.length || list.some((x) => !x.label)) fail(`config.js: every entry in looks/clients needs a unique lowercase key and a label — got ${JSON.stringify(keys)}`);
  }
  // app.js names the same pages for its home-page cards and the menu.
  const m = read("app.js").match(/const SERVICE_LINKS = \[([\s\S]*?)\n {2}\];/);
  if (!m) fail("app.js: SERVICE_LINKS not found");
  const inApp = [...m[1].matchAll(/slug:\s*"([^"]+)"/g)].map((x) => x[1]);
  const missing = inApp.filter((s) => !slugs.includes(s));
  if (missing.length) fail(`app.js SERVICE_LINKS points at service pages that do not exist: ${missing.join(", ")}`);
  // app.js hides a service with no work the same way this script does, so both
  // must agree on the rule. It reads `match` on each SERVICE_LINKS entry.
  for (const v of SERVICES) {
    const m2 = m[1].match(new RegExp(`slug:\\s*"${v.slug}"[\\s\\S]*?match:\\s*(\\{[^}]*\\})`));
    if (!m2) fail(`app.js SERVICE_LINKS has no \`match\` for ${v.slug} — it cannot tell whether that page has work`);
    let parsed;
    try { parsed = JSON.parse(m2[1].replace(/([a-zA-Z_]+):/g, '"$1":').replace(/'/g, '"').replace(/,\s*}/, "}")); } catch { fail(`app.js SERVICE_LINKS match for ${v.slug} is not readable`); }
    const norm = (o) => JSON.stringify({ look: o.look || "", clients: o.clients || [], types: o.types || [], modelWork: !!o.modelWork, clientWork: !!o.clientWork, residual: !!o.residual });
    if (norm(parsed) !== norm(v.albumFilter || {})) fail(`app.js SERVICE_LINKS match for ${v.slug} is ${norm(parsed)} but seo/services.mjs albumFilter is ${norm(v.albumFilter || {})}`);
  }
  // The filtered category views quote a starting price from SERVICE_LINKS'
  // packageIds. If those drift from this file, a visitor is quoted one price
  // and shown another on the page the link lands on.
  for (const m2 of m[1].matchAll(/slug:\s*"([^"]+)"[\s\S]*?packageIds:\s*\[([^\]]*)\]/g)) {
    const v = SERVICES.find((x) => x.slug === m2[1]);
    if (!v) continue;
    const inAppIds = [...m2[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]).join(",");
    const here = (v.packageIds || []).join(",");
    if (inAppIds !== here) fail(`app.js SERVICE_LINKS packageIds for ${v.slug} are [${inAppIds}] but seo/services.mjs says [${here}]`);
  }
}

/* A page per model, at /models/<slug>/.

   Sharing a model's card handed out /share/?a=comp-card-<slug>, and every one
   of those previews identically — "A shared album from nerdyphotographer.in"
   over the site's default picture — because one file cannot carry ten models'
   names and faces (Sep 2026 audit). These pages carry them. app.js reads the
   address as the same comp-card id (sharedAlbumSegment) and renders the card,
   so what opens is unchanged.

   They are noindex on purpose: the model's album pages and the model-portfolio
   service page are the ones meant to rank, and three addresses competing over
   one model's name would help none of them. */
function buildModelPages() {
  if (!compCardsPage) return [];
  // One page per PERSON, not per album. Grouping on the credit line was fine
  // while every comp-card album was one model's test shoot; on a brand's day
  // or a makeup artist's day that line names the whole cast, and it would
  // have built one page addressed to six people joined by hyphens.
  const groups = new Map();
  // A model the studio hid from the cards gets no page either: Sumitt Verma's
  // answered 200 with his name in the title, then said "Album not found"
  // (Sep 2026 audit, V2). Same switch the site reads (showsOnModelPage).
  const consider = albumsForPage(compCardsPage).filter((s) => !s.hideFromCompCard).concat(
    // Albums that only contribute frames — a client's job the studio has said
    // the models may show. Same two conditions the site applies: tagged, and
    // ticked.
    newestFirst.filter((s) => s.feedsModelCards === true && Array.isArray(s.modelKeys) && s.modelKeys.length
      && s.type !== "Workshop Attended" && !albumsForPage(compCardsPage).includes(s))
  );
  for (const s of consider) {
    const inAlbum = new Set();
    for (const p of s.photos || []) for (const k of photoModelKeys(p, s)) inAlbum.add(k);
    for (const key of inAlbum) {
      if (!key) continue;
      const rec = modelByKey.get(key);
      const name = rec ? rec.name : (albumModelKeys(s).length === 1 ? cleanName(s.talent || s.title || "").trim() : modelNameFromKey(key));
      if (!name) continue;
      if (!groups.has(key)) groups.set(key, { name, albums: [] });
      groups.get(key).albums.push(s);
    }
  }
  return [...groups.entries()].map(([slug, g]) => {
    const lead = g.albums[0];
    // Her frames, not every frame in the albums she appears in.
    const shots = g.albums.reduce((n, s) => n + (s.photos || []).filter((p) => photoModelKeys(p, s).includes(slug)).length, 0);
    const title = `${g.name} — Model Portfolio | ${BRAND}`;
    const description = `${g.name}: ${shots} photograph${shots === 1 ? "" : "s"} in one place, with a comp card and a portfolio PDF to download. Photographed by ${BRAND}, Noida & Delhi NCR.`;
    const urlPath = `/models/${slug}/`;
    const mainHtml = `<div class="prerender">
    <h1>${esc(g.name)}</h1>
    <p>${esc(description)}</p>
    <p><a href="${esc(compCardsHref)}">See every model</a> &middot; <a href="${esc(albumUrl(lead))}">${esc(g.name)}'s album</a></p>
    ${g.albums.map((s) => albumCardHtml(s)).join("\n    ")}
  </div>`;
    return {
      rel: `models/${slug}/index.html`,
      html: pageFromTemplate({
        title, description, urlPath,
        ogImage: absUrl(ogCropFor(slugById.get(lead.id)) || photoPath(albumCover(lead))),
        ogType: "profile",
        robots: "noindex, follow",
        mainHtml
      })
    };
  });
}

function checkLicence(x = LICENCE) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(x.slug || ""))) fail(`seo/licence.mjs: bad slug "${x.slug}"`);
  for (const k of ["metaTitle", "metaDescription", "eyebrow", "h1", "intro"]) if (!x[k]) fail(`seo/licence.mjs: missing ${k}`);
  if (!Array.isArray(x.sections) || !x.sections.length) fail("seo/licence.mjs: no sections");
  for (const sec of x.sections) {
    if (!sec.heading || !Array.isArray(sec.body) || !sec.body.length) fail(`seo/licence.mjs: section "${sec.heading || "?"}" needs a heading and a body`);
    if (sec.points && (!Array.isArray(sec.points) || !sec.points.length)) fail(`seo/licence.mjs: section "${sec.heading}" has an empty points list`);
  }
  // The pictures point at this page; a page that is not there would leave
  // every ImageObject naming terms that 404.
  if (!LICENCE_URL.startsWith(ORIGIN)) fail("seo/licence.mjs: the licence address must be on this site");
}

checkServices();
checkLicence();
checkLicence(PRIVACY);
const outputs = [];
for (const s of albums) outputs.push(buildAlbumPage(s));
if (liveServices.length) {
  outputs.push(buildServicesIndex());
  for (const v of liveServices) outputs.push(buildServicePage(v));
}
outputs.push(buildLicencePage());
// /workshop-attended is linked from the menu and the home page, but only the
// app knew it, so crawlers got a 404 for a page visitors could see (Sep 2026
// audit, V3). While there is a workshop album to show, it gets a copy of the
// app shell (noindex, as the app marks it) so the address answers 200.
if (allShoots.some((s) => s && s.type === "Workshop Attended" && s.isPublic !== false)) {
  outputs.push({ rel: "workshop-attended/index.html", html: read("404.html") });
}
outputs.push(buildLicencePage(PRIVACY, PRIVACY_PATH, `<a href="mailto:prateeksaxenaphotography@gmail.com">prateeksaxenaphotography@gmail.com</a> · <a href="/book/" data-link>Book a shoot</a>`));
const modelPages = buildModelPages();
for (const m of modelPages) outputs.push(m);
console.log(`build-seo: ${liveServices.length}/${SERVICES.length} service pages have work and are published${liveServices.length < SERVICES.length ? ` — waiting on: ${SERVICES.filter((v) => !liveServices.includes(v)).map((v) => v.slug).join(", ")}` : ""}`);
const { blocks, quoteCount } = prerenderBlocks();
for (const [rel, inner] of Object.entries(blocks)) {
  outputs.push({ rel, html: shellWithPrerender(rel, inner) });
}
/* Pages that exist but have nothing for a search engine yet: the Studio page
   while it is closed to visitors (config.js studioPagePublic), and Testimonials
   while no review has been published. Both were indexable as good as empty
   (site audit Sep 2026). The tag is stamped at deploy time rather than typed
   into the shells, so opening the studio page or publishing the first
   testimonial takes it away again with nothing to remember. */
const hiddenShells = new Set();
if (!STUDIO_PUBLIC && exists("studio/index.html")) hiddenShells.add("studio/index.html");
if (!quoteCount && exists("testimonials/index.html")) hiddenShells.add("testimonials/index.html");
const withNoindex = (html, rel) => (/<meta\s+name="robots"/i.test(html) ? html
  : replaceOnce(html, /<head>/i, (m) => `${m}\n  <meta name="robots" content="noindex, follow" />`, `<head> in ${rel}`));
for (const rel of hiddenShells) {
  const at = outputs.findIndex((o) => o.rel === rel);
  if (at >= 0) outputs[at] = { rel, html: withNoindex(outputs[at].html, rel) };
  else outputs.push({ rel, html: withNoindex(read(rel), rel) });
}

outputs.push({ rel: "sitemap.xml", html: buildSitemap({ quoteCount }) });

/* A hidden /studio/ was still linked from every page's menu and footer:
   the app hides the links, but a crawler reads the HTML (Sep 2026 audit,
   G4). While the page is closed they are taken out of every shell. */
const SHELLS = ["index.html", "404.html", "albums/index.html", "book/index.html", "categories/index.html", "share/index.html", "studio/index.html", "testimonials/index.html", "upload/index.html"];
const studioLinksOut = new Set();
if (!STUDIO_PUBLIC) {
  const strip = (html) => html
    .replace(/\s*<li>\s*<a href="\/studio\/?"[^>]*>(?:(?!<\/a>)[\s\S])*<\/a>\s*<\/li>/g, "")
    .replace(/\s*<a href="\/studio\/?" data-link>Studio<\/a>/g, "");
  // Every page this script wrote carries the same menu.
  outputs.forEach((o, i) => { if (/\.html$/.test(o.rel)) outputs[i] = { ...o, html: strip(o.html) }; });
  for (const rel of SHELLS) {
    if (!exists(rel)) continue;
    const at = outputs.findIndex((o) => o.rel === rel);
    const html = at >= 0 ? outputs[at].html : read(rel);
    const out = strip(html);
    if (out === html) continue;
    if (at >= 0) outputs[at] = { ...outputs[at], html: out };
    else outputs.push({ rel, html: out });
    studioLinksOut.add(rel);
  }
}

/* The deployed data.js carries each photograph's real width and height.
   The browser labelled its sizes by the long edge — the "480" file of a
   portrait is 320 px wide — so phones fetched photos twice the size they
   needed while laptops showed soft ones, and a tile had no height until its
   photo arrived (Sep 2026 audit, G2). The numbers are only known here, where
   the files are, so they are added to the copy being deployed; the repo's
   data.js, and what the studio's publish reads, are untouched. The object is
   written back exactly as the admin writes it (JSON, two-space indent) and
   the text around it — header and alias lines — is kept byte for byte, and
   the result must read back to the same albums. */
{
  const src = read("data.js");
  const head = src.indexOf("window.WPS_DATA = ");
  const start = head >= 0 ? src.indexOf("{", head) : -1;
  let end = -1;
  if (start >= 0) {
    let depth = 0, inStr = false, esc2 = false;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (esc2) { esc2 = false; continue; }
      if (c === "\\") { esc2 = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { end = i + 1; break; }
    }
  }
  if (start < 0 || end < 0) fail("data.js: could not find the WPS_DATA object to add photo sizes to");
  const data = JSON.parse(JSON.stringify(DATA));
  let added = 0;
  for (const s of data.DEMO_SHOOTS || []) for (const p of (s && s.photos) || []) {
    if (!p || p.w || !p.url || String(p.url).startsWith("data:")) continue;
    const size = imageSize(String(p.url).replace(/^\//, ""));
    if (size) { p.w = size.w; p.h = size.h; added++; }
  }
  const out = src.slice(0, start) + JSON.stringify(data, null, 2) + src.slice(end);
  const back = (() => { const sb = { window: {} }; vm.createContext(sb); vm.runInContext(out, sb, { timeout: 5000 }); return sb.window; })();
  const same = (back.WPS_DATA.DEMO_SHOOTS || []).length === (DATA.DEMO_SHOOTS || []).length
    && Array.isArray(back.DEMO_SHOOTS) && back.DEMO_SHOOTS.length === (DATA.DEMO_SHOOTS || []).length;
  if (!same) fail("data.js with photo sizes does not read back to the same albums");
  outputs.push({ rel: "data.js", html: out, sizes: added });
}

// Two outputs at one path would mean one page silently overwriting another.
if (new Set(outputs.map((o) => o.rel)).size !== outputs.length) fail("two generated pages share a path");
for (const o of outputs) {
  if (/\.html$/.test(o.rel) && (o.html.match(/<\/main>/g) || []).length !== 1) fail(`${o.rel}: expected exactly one </main>`);
}
// Nothing may land on top of a page this script does not own.
const owned = new Set([...Object.keys(blocks), ...hiddenShells, ...studioLinksOut, "sitemap.xml", "data.js"]);
for (const o of outputs) {
  if (!owned.has(o.rel) && exists(o.rel) && !read(o.rel).includes('class="prerender"') && !read(o.rel).includes("data-static-path=")) {
    fail(`refusing to overwrite ${o.rel}: it exists and was not written by this script`);
  }
  if (!o.html || o.html.length < 200) fail(`${o.rel}: generated output is empty`);
}

if (CHECK_ONLY) {
  console.log(`build-seo: OK (check only) — ${modelPages.length} model pages, ${albums.length} album pages, ${liveServices.length ? liveServices.length + 1 : 0} service pages, ${Object.keys(blocks).length} page copies, sitemap.`);
} else {
  for (const o of outputs) {
    const abs = path.join(ROOT, o.rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, o.html);
  }
  console.log(`build-seo: wrote ${outputs.length} files into ${ROOT} — ${modelPages.length} model pages, ${albums.length} album pages, ${liveServices.length ? liveServices.length + 1 : 0} service pages, ${Object.keys(blocks).length} page copies, sitemap.`);
}
