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
const { SERVICES, SERVICES_INDEX } = await import(pathToFileURL(path.join(ROOT, "seo/services.mjs")).href);

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
const altFor = (s, frame) => {
  const who = cleanName(s.talent) || String(s.title || "").trim();
  const what = [s.activity, publicType(s)].filter(Boolean).join(" ");
  return [
    what ? `${what} photography` : "Photography",
    who ? `featuring ${who}` : "",
    `by ${BRAND}, Noida & Delhi NCR`,
    frame ? `(frame ${frame})` : ""
  ].filter(Boolean).join(" ");
};
const photoPath = (p) => { const u = String(p.url || ""); return u.startsWith("photos/") ? `/${u}` : u; };
const absUrl = (u) => (/^https?:/.test(u) ? u : `${ORIGIN}${u.startsWith("/") ? "" : "/"}${u}`);
const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

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
  .map((s) => ({ ...s, photos: (s.photos || []).filter((p) => p && typeof p.url === "string" && p.url && !p.url.startsWith("data:")) }))
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
const albumCover = (s) => s.photos.find((p) => String(p.id).split("-")[0] === s.coverPhotoId) || s.photos[0];
const albumPlace = (s) => (s.showLocation === false ? "" : cleanName(s.location).replace(/^—$/, ""));
const albumWhat = (s) => `${s.activity ? `${s.activity} ` : ""}photoshoot`;
const albumSentence = (s) => {
  const place = albumPlace(s);
  const when = String(s.season || "").replace(/^—$/, "");
  return `${s.activity || "Studio"} photography featuring ${albumName(s)}${place ? `, shot in ${place}` : ""}${when ? ` in ${when}` : ""} by ${BRAND} — ${s.photos.length} photograph${s.photos.length === 1 ? "" : "s"}.`;
};
const albumLastMod = (s) => isoDay(Math.max(s.updatedAt || 0, s.createdAt || 0) || Date.parse(s.date) || Date.now());

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
function pageFromTemplate({ title, description, urlPath, ogImage = OG_IMAGE, ogType = "website", jsonLd = [], mainAttrs = "", mainHtml }) {
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
  html = replaceOnce(html, /<\/head>/, `${jsonLd.join("")}${HEAD_SNIPPET}</head>`, "</head>");
  html = replaceOnce(html, EMPTY_MAIN, `<main id="view" class="view" tabindex="-1"${mainAttrs}>${mainHtml}</main>`, "empty <main id=\"view\">");
  return enrichBusinessLd(html);
}

/** An existing page: keep it as it is, add the plain-HTML copy of its content. */
function shellWithPrerender(rel, innerHtml) {
  let html = read(rel);
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

const albumCardHtml = (s) => {
  const cover = albumCover(s);
  const sub = [s.activity, albumPlace(s), String(s.season || "").replace(/^—$/, "")].filter(Boolean).join(" · ");
  return `<a class="pr-card" href="${albumUrl(s)}" data-link>
        <img src="${esc(photoPath(cover))}" alt="${esc(altFor(s))}" loading="lazy" style="object-position: ${esc(cover.objectPosition || "center")};" />
        <span class="pr-card-title">${esc(albumName(s))}</span>
        ${sub ? `<span class="pr-card-sub">${esc(sub)}</span>` : ""}
      </a>`;
};
const albumCardsHtml = (list) => `<div class="pr-cards">\n      ${list.map(albumCardHtml).join("\n      ")}\n    </div>`;

const serviceLinksHtml = (skipSlug) => SERVICES.filter((v) => v.slug !== skipSlug).map((v) =>
  `<a href="/services/${v.slug}/" data-link class="service-card" style="display: block; text-decoration: none; color: inherit;">
          <div class="service-kicker">${esc(v.audience)}</div>
          <h3>${esc(v.cardTitle)}</h3>
          <p>${esc(v.cardBlurb)}</p>
        </a>`).join("\n        ");

const siteLinksHtml = `<nav class="container pr-links" aria-label="Site">
      <a href="/" data-link>Home</a> · <a href="/albums/" data-link>Albums</a> · <a href="/categories/" data-link>Categories</a> · <a href="/services/" data-link>Services</a> · <a href="/studio/" data-link>Studio</a> · <a href="/book/" data-link>Book a shoot</a>
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
    ["Photographer", cleanName(s.photographer)], ["Art direction", cleanName(s.artDirector)], ["Styling", cleanName(s.stylist)],
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
      caption: p.caption || altFor(s, i + 1),
      creditText: BRAND,
      copyrightNotice: `© ${BRAND}`,
      creator: { "@type": "Organization", name: BRAND, url: `${ORIGIN}/` },
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
          ${s.photos.map((p, i) => `<img src="${esc(photoPath(p))}" alt="${esc(p.caption || altFor(s, i + 1))}" loading="lazy" />`).join("\n          ")}
        </div>
        ${credits.length ? `<p class="pr-credits">${credits.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ")}</p>` : ""}
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
      ogImage: absUrl(photoPath(cover)),
      ogType: "article",
      jsonLd: [ldScript(gallery, "wps-image-schema"), ldScript(breadcrumbLd([["Home", "/"], ["Albums", "/albums/"], [name, urlPath]]))],
      mainHtml
    })
  };
}

/* ---------- service pages ---------- */
const packages = Array.isArray(DATA.PACKAGES) ? DATA.PACKAGES.filter((p) => p && p.name && Number(p.price) > 0) : [];

function albumsForService(v) {
  const f = v.albumFilter || {};
  const match = newestFirst.filter((s) => (f.activities || []).includes(s.activity) || ((f.types || []).includes(s.type)));
  // A service with nothing of its own published yet still shows recent work —
  // but says so, and does not send anyone to an empty category page. The day a
  // matching album is published, the page picks it up by itself.
  const matched = match.length >= 2;
  return { list: (matched ? match : newestFirst).slice(0, 6), matched };
}

function buildServicePage(v) {
  const urlPath = `/services/${v.slug}/`;
  const picked = packages.filter((p) => (v.packageIds || []).includes(p.id));
  const shown = picked.length ? picked : packages;
  const { list: samples, matched } = albumsForService(v);
  const workLinks = matched ? v.workLinks : [{ href: "/albums/", label: "See recent work" }];
  const ogImage = matched ? absUrl(photoPath(albumCover(samples[0]))) : OG_IMAGE;

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
    mainEntity: v.faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }))
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

    <section class="section container section-divider">
      <div class="section-head"><p class="eyebrow">What it costs</p><h2>Quoted to the brief</h2></div>
      <p class="svc-note">No fixed rate card here — the price follows the shoot: how many looks, how many finished images, whether it is a half day or a full production, and where it is shot. Tell me what you need and you will have a price against it, in writing, before anything is booked.</p>
      <div class="svc-actions"><a href="/book/" data-link class="btn btn-dark">Ask for a quote →</a></div>
    </section>

    ${samples.length ? `<section class="section container section-divider">
      <div class="section-head row">
        <div><p class="eyebrow">Recent work</p><h2>${matched ? "Judge it by the pictures" : "Recent work from the studio"}</h2></div>
        <div class="svc-worklinks">${workLinks.map((l) => `<a href="${esc(l.href)}" data-link class="link-arrow">${esc(l.label)} →</a>`).join("")}</div>
      </div>
      ${albumCardsHtml(samples)}
    </section>` : ""}

    <section class="section container section-divider">
      <div class="section-head"><p class="eyebrow">Questions</p><h2>Before you book</h2></div>
      <div class="svc-faq">
        ${v.faqs.map(([q, a]) => `<details>
          <summary>${esc(q)}</summary>
          <p>${esc(a)}</p>
        </details>`).join("\n        ")}
      </div>
    </section>

    <section class="section container section-divider">
      <div class="section-head"><p class="eyebrow">Also at the studio</p><h2>Other shoots</h2></div>
      <div class="services-grid">
        ${serviceLinksHtml(v.slug)}
      </div>
    </section>

    <section class="cta-band">
      <div class="container">
        <h2>Ready when you are.</h2>
        <a href="/book/" data-link class="btn btn-dark">Book your photoshoot session →</a>
      </div>
    </section>`;

  return {
    rel: `services/${v.slug}/index.html`,
    html: pageFromTemplate({
      title: v.metaTitle, description: v.metaDescription, urlPath, ogImage,
      jsonLd: [ldScript(serviceLd), ldScript(faqLd), ldScript(breadcrumbLd([["Home", "/"], ["Services", "/services/"], [v.cardTitle, urlPath]]))],
      mainAttrs: ` data-static-path="/services/${v.slug}" data-title="${esc(v.metaTitle)}" data-desc="${esc(v.metaDescription)}"`,
      mainHtml
    })
  };
}

function buildServicesIndex() {
  const x = SERVICES_INDEX;
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
    </section>` : ""}
    <section class="cta-band">
      <div class="container">
        <h2>Ready when you are.</h2>
        <a href="/book/" data-link class="btn btn-dark">Book your photoshoot session →</a>
      </div>
    </section>`;
  return {
    rel: "services/index.html",
    html: pageFromTemplate({
      title: x.metaTitle, description: x.metaDescription, urlPath: "/services/",
      jsonLd: [ldScript(breadcrumbLd([["Home", "/"], ["Services", "/services/"]]))],
      mainAttrs: ` data-static-path="/services" data-title="${esc(x.metaTitle)}" data-desc="${esc(x.metaDescription)}"`,
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

function testimonials() {
  const out = [];
  for (const s of allShoots) {
    if (s.isPublic === false) continue;
    if (s.isTestimonial && s.description) out.push({ quote: s.description, by: cleanName(s.talent) || "Anonymous" });
    else for (const t of (s.testimonials || [])) if (t && t.quote) out.push({ quote: t.quote, by: t.by || "Anonymous" });
  }
  return out;
}

const countBy = (key) => {
  const m = new Map();
  for (const s of albums) if (s[key]) m.set(s[key], (m.get(s[key]) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

function prerenderBlocks() {
  const quotes = testimonials();
  const steps = processSteps();
  const blocks = {};

  blocks["index.html"] = `
    <header class="page-head"><div class="container">
      <p class="eyebrow">The Creative Studio · Noida · Delhi NCR</p>
      <h1>${BRAND} — fashion, fitness &amp; model portfolio photography in Noida &amp; Delhi NCR</h1>
      <p class="page-sub">Not just photos, a perspective. Editorial-grade portfolios, comp cards, fashion and fitness photography for models and brands, shot in the studio in Noida and on location across Delhi NCR.</p>
      <p><a href="/book/" data-link>Book a shoot</a> · <a href="/categories/" data-link>Explore the work</a></p>
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

  const catList = (kind, entries) => entries.length
    ? `<ul>${entries.map(([name, n]) => `<li><a href="/categories/?kind=${kind}&amp;val=${encodeURIComponent(name)}" data-link>${esc(name)}</a> — ${n} album${n === 1 ? "" : "s"}</li>`).join("")}</ul>` : "";
  blocks["categories/index.html"] = `
    <header class="page-head"><div class="container">
      <p class="eyebrow">Browse</p>
      <h1>Categories</h1>
      <p class="page-sub">The photography archive of ${BRAND}, filed by genre and by kind of production.</p>
    </div></header>
    <section class="section container">
      <h2>By genre</h2>
      ${catList("activity", countBy("activity"))}
      <h2>For models</h2>
      <ul>
        <li><a href="/categories/?kind=type&amp;val=Model%20Portfolio" data-link>Model portfolios</a></li>
        <li><a href="/categories/?kind=type&amp;val=Comp%20Cards" data-link>Model comp cards</a></li>
      </ul>
      <h2>Albums</h2>
      ${albumCardsHtml(newestFirst)}
    </section>
    ${siteLinksHtml}`;

  blocks["studio/index.html"] = `
    <header class="page-head"><div class="container">
      <p class="eyebrow">The studio</p>
      <h1>Studio</h1>
      <p class="page-sub">A home for the photography behind ${BRAND}'s work — a working studio in Noida and a living archive, in one place.</p>
    </div></header>
    <section class="section container">
      ${CONFIG.introQuote ? `<p>${esc(CONFIG.introQuote)}</p>` : ""}
      ${steps.length ? `<h2>The process</h2><ol>${steps.map(([t, d]) => `<li><strong>${esc(t)}.</strong> ${esc(d)}</li>`).join("")}</ol>` : ""}
      <h2>Services</h2>
      <div class="services-grid">
        ${serviceLinksHtml(null)}
      </div>
    </section>
    ${siteLinksHtml}`;

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
    blocks["testimonials/index.html"] = `
    <header class="page-head"><div class="container">
      <p class="eyebrow">Social proof</p>
      <h1>Testimonials</h1>
      <p class="page-sub">Words from models, brands and creative partners about their shoot with ${BRAND}.</p>
    </div></header>
    <section class="section container">
      ${quotes.length ? quotes.map((t) => `<blockquote><p>${esc(t.quote)}</p><footer>${esc(t.by)}</footer></blockquote>`).join("") : "<p>No testimonials published yet.</p>"}
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
    entry("/services/", null),
    ...SERVICES.map((v) => entry(`/services/${v.slug}/`, null)),
    entry("/categories/", newest),
    entry("/studio/", null),
    entry("/book/", null),
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
    for (const k of ["kicker", "cardTitle", "cardBlurb", "metaTitle", "metaDescription", "eyebrow", "h1", "includesTitle", "audience"]) if (!v[k]) fail(`seo/services.mjs: ${v.slug} is missing ${k}`);
    // All four must answer the same question, or a visitor cannot tell which is theirs.
    if (!/^For /.test(v.audience)) fail(`seo/services.mjs: ${v.slug} audience must start with "For " — it names who the page is for`);
    if (!Array.isArray(v.intro) || !v.intro.length || !Array.isArray(v.includes) || !Array.isArray(v.faqs) || !Array.isArray(v.workLinks)) fail(`seo/services.mjs: ${v.slug} is incomplete`);
  }
  // app.js names the same pages for its home-page cards and the menu.
  const m = read("app.js").match(/const SERVICE_LINKS = \[([\s\S]*?)\n {2}\];/);
  if (!m) fail("app.js: SERVICE_LINKS not found");
  const inApp = [...m[1].matchAll(/slug:\s*"([^"]+)"/g)].map((x) => x[1]);
  const missing = inApp.filter((s) => !slugs.includes(s));
  if (missing.length) fail(`app.js SERVICE_LINKS points at service pages that do not exist: ${missing.join(", ")}`);
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

checkServices();
const outputs = [];
for (const s of albums) outputs.push(buildAlbumPage(s));
outputs.push(buildServicesIndex());
for (const v of SERVICES) outputs.push(buildServicePage(v));
const { blocks, quoteCount } = prerenderBlocks();
for (const [rel, inner] of Object.entries(blocks)) {
  outputs.push({ rel, html: shellWithPrerender(rel, inner) });
}
outputs.push({ rel: "sitemap.xml", html: buildSitemap({ quoteCount }) });

// Two outputs at one path would mean one page silently overwriting another.
if (new Set(outputs.map((o) => o.rel)).size !== outputs.length) fail("two generated pages share a path");
for (const o of outputs) {
  if (/\.html$/.test(o.rel) && (o.html.match(/<\/main>/g) || []).length !== 1) fail(`${o.rel}: expected exactly one </main>`);
}
// Nothing may land on top of a page this script does not own.
const owned = new Set([...Object.keys(blocks), "sitemap.xml"]);
for (const o of outputs) {
  if (!owned.has(o.rel) && exists(o.rel) && !read(o.rel).includes('class="prerender"') && !read(o.rel).includes("data-static-path=")) {
    fail(`refusing to overwrite ${o.rel}: it exists and was not written by this script`);
  }
  if (!o.html || o.html.length < 200) fail(`${o.rel}: generated output is empty`);
}

if (CHECK_ONLY) {
  console.log(`build-seo: OK (check only) — ${albums.length} album pages, ${SERVICES.length + 1} service pages, ${Object.keys(blocks).length} page copies, sitemap.`);
} else {
  for (const o of outputs) {
    const abs = path.join(ROOT, o.rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, o.html);
  }
  console.log(`build-seo: wrote ${outputs.length} files into ${ROOT} — ${albums.length} album pages, ${SERVICES.length + 1} service pages, ${Object.keys(blocks).length} page copies, sitemap.`);
}
