/* ============================================================
   nerdyphotographer.in — app (multi-view studio)
   Hash-free router · 7 views · overlay nav · rich upload form ·
   IndexedDB persistence · GitHub publishing · lightbox.
   No backend, no framework.

   TABLE OF CONTENTS
   §1  Data & environment
   §2  Core utilities            ($, esc, uid, toast, shuffle, focus trap)
   §3  Photo & media helpers     (src/srcset/alt, read, resize, palette)
   §4  Text, credits & socials   (names, credit links, IG/Kavyar parsing)
   §5  Shoot helpers             (future shoots, testimonials)
   §6  Admin mode & view context (?admin= unlock, comp-card/portfolio views)
   §7  Persistence — IndexedDB   (shoots store)
   §8  App state                 (SHOOTS, demo fallback, loading)
   §9  GitHub sync               (publish shoots + photos to the repo)
   §10 Lightbox                  (viewer, sidebar, keyboard/touch nav)
   §11 Site chrome               (overlay nav, admin & theme controls)
   §12 Views                     (HTML builders for every route)
   §13 View wiring               (upload form, booking form, cards)
   §14 Router                    (routes, render, SEO metadata)
   §15 Animation & loader        (reveals, counters, boot loader)
   §16 Comp-card printing        (PDF export + download logging)
   §17 Boot                      (init order, first render)
   ============================================================ */
(() => {
  "use strict";

  /* ============================================================
     §1 · DATA & ENVIRONMENT
     ============================================================ */
  const { ACTIVITIES: rawAct, TYPES: rawTyp, BRANDS: rawBrs, DEMO_SHOOTS } = window.WPS_DATA;
  const cfgData = window.STUDIO_CONFIG || {};
  const ACTIVITIES = [...new Set([...(rawAct || []), ...(cfgData.activities || [])])];
  const TYPES = [...new Set([...(rawTyp || []), ...(cfgData.types || [])])];
  const BRANDS = [...new Set([...(rawBrs || []), ...(cfgData.brands || [])])];
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The site itself is static (GitHub Pages) but /api/logs is served by server.js
  // running elsewhere (Render). Same-origin locally; absolute URL in production.
  // TODO: replace with your actual Render service URL after deploying.
  const IS_LOCAL_HOST = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const COMP_CARD_API_BASE = IS_LOCAL_HOST ? "" : "https://wolverine-photostudio-api.onrender.com";

  /* ============================================================
     §2 · CORE UTILITIES
     ============================================================ */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  let toastTimer;
  function toast(msg) {
    let el = $(".toast"); if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg; requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }
  function shuffleArray(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  // Shared focus trap: keep Tab cycling within `root` while it's open.
  // `isActive` (optional) can veto trapping (e.g. only when a menu is open).
  function trapTabKey(root, focusableSelector, isActive) {
    root.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      if (isActive && !isActive()) return;
      const f = [...root.querySelectorAll(focusableSelector)].filter(el => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ============================================================
     §3 · PHOTO & MEDIA HELPERS
     ============================================================ */
  // A photo renders from its published file URL when it has one, else its local base64.
  const photoSrc = (p) => {
    if (!p) return "";
    let src = p.url || p.dataUrl || "";
    if (src.startsWith("photos/")) {
      src = "/" + src;
    }
    return src;
  };
  // Build responsive srcset attributes when a photo has generated size variants.
  // Existing single-size photos return "" (plain src is used, unchanged behaviour).
  const srcsetAttr = (p, sizes = "(max-width: 620px) 90vw, (max-width: 1100px) 45vw, 640px") => {
    if (!p || !p.url) return "";                 // base64/local: no srcset
    const set = [];
    if (p.small)  set.push(`${p.small} 480w`);
    if (p.medium) set.push(`${p.medium} 960w`);
    if (set.length) set.push(`${p.url} 1600w`);
    return set.length ? ` srcset="${esc(set.join(", "))}" sizes="${esc(sizes)}"` : "";
  };
  // Descriptive, SEO-friendly alt text for a shoot's photo (Google Images).
  const altFor = (s, frame) => {
    if (!s) return "Photograph by nerdyphotographer.in";
    if (s.caption) return s.caption;
    const who = (s.talent && s.talent.trim()) || (s.title && s.title.trim()) || "";
    const typeTag = (s.type === "Test Shoot" && !s.showTestShootCategory) ? "" : s.type;
    const what = [s.activity, typeTag].filter(Boolean).join(" ");
    const parts = [
      what ? `${what} photography` : "Photography",
      who ? `featuring ${who}` : "",
      "by nerdyphotographer.in, Noida & Delhi NCR",
      frame ? `(frame ${frame})` : ""
    ].filter(Boolean);
    return parts.join(" ");
  };
  function readAsDataURL(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
  function resize(dataUrl, maxDim = 1600, q = 0.82) {
    return new Promise((res) => { const img = new Image(); img.onload = () => {
      let { width: w, height: h } = img; if (Math.max(w, h) <= maxDim) return res(dataUrl);
      const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s);
      const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h);
      res(c.toDataURL("image/jpeg", q));
    }; img.onerror = () => res(dataUrl); img.src = dataUrl; });
  }
  function extractPalette(imgDataUrl) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 10;
        canvas.height = 10;
        ctx.drawImage(img, 0, 0, 10, 10);
        const data = ctx.getImageData(0, 0, 10, 10).data;
        let r = 0, g = 0, b = 0, count = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i+1]; b += data[i+2];
        }
        r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
        const hex = (x, y, z) => "#" + [x, y, z].map(v => v.toString(16).padStart(2, "0")).join("");
        const dom = hex(r, g, b);
        const dark = hex(Math.max(10, Math.round(r * 0.45)), Math.max(10, Math.round(g * 0.45)), Math.max(10, Math.round(b * 0.45)));
        res([dom, dark]);
      };
      img.onerror = () => res(["#3a3a3a", "#0d0d0d"]);
      img.src = imgDataUrl;
    });
  }

  /* ============================================================
     §4 · TEXT, CREDITS & SOCIAL-HANDLE HELPERS
     ============================================================ */
  function getTalentCleanName(talentStr) {
    return (talentStr || "").replace(/\s*\([^)]+\)/g, "").trim();
  }

  function renderCreditValue(text) {
    if (!text || text === "—") return "—";
    const items = text.split(",").map(item => item.trim()).filter(Boolean);
    const renderedItems = items.map(item => {
      const parenRegex = /\(([^)]+)\)/;
      const match = item.match(parenRegex);
      if (match) {
        const rawName = item.replace(parenRegex, "").trim();
        const rawSocials = match[1].split(";").map(s => s.trim()).filter(Boolean);
        const socialLinks = rawSocials.map(s => {
          let url = s;
          let label = s;
          if (s.includes("instagram.com")) {
            url = s.startsWith("http") ? s : "https://" + s;
            label = "@" + url.split("/").pop();
          } else if (s.includes("kavyar.com")) {
            url = s.startsWith("http") ? s : "https://" + s;
            label = "Kavyar: " + url.split("/").pop();
          } else if (s.startsWith("@")) {
            url = "https://instagram.com/" + s.replace(/^@/, "");
            label = s;
          } else if (s.startsWith("http")) {
            url = s;
            label = s.split("//")[1]?.split("/")[0] || "Link";
          } else {
            url = "https://instagram.com/" + s;
            label = "@" + s;
          }
          return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent); font-weight:600; text-decoration:none; margin-left:6px; display:inline-flex; align-items:center; gap:2px;">${esc(label)} ↗</a>`;
        }).join(" ");
        return `${esc(rawName)} ${socialLinks}`;
      }
      return esc(item);
    });
    return renderedItems.join(", ");
  }
  const parseIgHandle = (h) => {
    let clean = String(h ?? "").trim();
    if (!clean) return "";
    if (clean.includes("instagram.com")) {
      try {
        let temp = clean;
        if (!temp.startsWith("http://") && !temp.startsWith("https://")) {
          temp = "https://" + temp;
        }
        const url = new URL(temp);
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length > 0) clean = parts[0];
      } catch {
        const segments = clean.split("/").filter(Boolean);
        clean = segments[segments.length - 1] || clean;
      }
    }
    return clean.replace(/^@/, "");
  };
  const parseKavyarLink = (h) => {
    let clean = String(h ?? "").trim();
    if (!clean) return "";
    if (clean.includes("kavyar.com")) {
      try {
        let temp = clean;
        if (!temp.startsWith("http://") && !temp.startsWith("https://")) {
          temp = "https://" + temp;
        }
        const url = new URL(temp);
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length > 0) return "https://kavyar.com/" + parts[0];
      } catch {
        const segments = clean.split("/").filter(Boolean);
        const last = segments[segments.length - 1] || clean;
        return "https://kavyar.com/" + last;
      }
    }
    return "https://kavyar.com/" + clean.replace(/^@/, "");
  };
  // Which platform does a raw handle string belong to?
  const isIgHandle = (s) => !s.includes("kavyar.com") && (s.startsWith("@") || s.includes("instagram.com"));
  const isKavyarHandle = (s) => s.includes("kavyar.com");
  // Comp cards may inherit handles for the whole crew; narrow the list down to
  // the model's own. Preference order: handles inlined in the talent field's
  // parentheses → handles containing the model's name → first handle.
  function compCardOwnHandles(shoot, handles, isPlatformHandle) {
    if (!shoot.isCompCard) return handles;
    const talentNameLower = getTalentCleanName(shoot.talent).toLowerCase();
    const words = talentNameLower.split(/\s+/).filter(w => w.length > 2);
    const talentMatch = shoot.talent.match(/\(([^)]+)\)/);
    if (talentMatch) {
      const inline = talentMatch[1].split(";").map(s => s.trim()).filter(Boolean).filter(isPlatformHandle);
      return inline.length ? inline : handles;
    }
    if (words.length) {
      const matched = handles.filter(h => {
        const hClean = h.toLowerCase().replace(/[^a-z0-9]/g, "");
        return words.some(word => hClean.includes(word));
      });
      return matched.length ? matched : [handles[0]];
    }
    return [handles[0]];
  }

  /* ============================================================
     §5 · SHOOT HELPERS
     ============================================================ */
  const isFutureShoot = (s) => {
    if (!s.date) return false;
    const t = Date.parse(s.date);
    if (isNaN(t)) return false;
    const todayTime = new Date().setHours(0, 0, 0, 0);
    const shootTime = new Date(t).setHours(0, 0, 0, 0);
    return shootTime > todayTime;
  };
  function getAllTestimonials() {
    const list = [];
    SHOOTS.forEach(s => {
      if (s.isTestimonial) {
        list.push({
          quote: s.description || "",
          by: s.talent || "Anonymous",
          meta: s.brand || "",
          season: s.season || "",
          shootId: s.id,
          shootTitle: s.title
        });
      } else if (s.testimonials && s.testimonials.length) {
        s.testimonials.forEach(t => {
          list.push({
            quote: t.quote || "",
            by: t.by || "Anonymous",
            meta: s.brand === "Personal Project" ? "" : s.brand,
            season: s.season || "",
            shootId: s.id,
            shootTitle: s.title
          });
        });
      }
    });
    return list;
  }

  /* ============================================================
     §6 · ADMIN MODE & VIEW CONTEXT
     ============================================================ */
  // ?admin=1 reveals the (passcode-gated) admin UI; ?admin=0 locks it again
  // and clears stored credentials. Both the search query and hash-routing
  // params are honoured. Called first thing at boot.
  // SECURITY: the old &pat=<token> URL parameter was removed on purpose —
  // tokens in URLs leak via browser history, logs and screenshots. The
  // GitHub token is only ever entered via the sync prompt now.
  function applyAdminUrlParams() {
    const fullUrlString = window.location.search + window.location.hash;
    const adminMatch = fullUrlString.match(/[?&]admin=([01])\b/);
    if (!adminMatch) return;
    if (adminMatch[1] === "1") {
      localStorage.setItem("wps-admin-authorized", "1");
    } else {
      localStorage.removeItem("wps-admin-authorized");
      localStorage.removeItem("wps-admin");
      localStorage.removeItem("wps-github-pat");
    }
  }

  // SHA-256 hex digest (secure contexts: https or localhost, fallback to pure-JS).
  async function sha256Hex(text) {
    if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
      try {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
      } catch (e) {
        // fallback
      }
    }
    return sha256HexFallback(String(text));
  }

  function sha256HexFallback(str) {
    function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
    function s0(x) { return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x); }
    function s1(x) { return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x); }
    function g0(x) { return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3); }
    function g1(x) { return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10); }

    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    var ascii = str + '\x80';
    var asciiLength = str.length * 8;
    while (ascii.length % 64 !== 56) ascii += '\x00';
    
    var words = [];
    for (var i = 0; i < ascii.length; i++) {
      words[i >> 2] |= ascii.charCodeAt(i) << (24 - (i % 4) * 8);
    }
    
    words.push(0);
    words.push(asciiLength);

    for (var chunk = 0; chunk < words.length; chunk += 16) {
      var w = words.slice(chunk, chunk + 16);
      while (w.length < 64) w.push(0);
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], j = h[7];

      for (var t = 0; t < 64; t++) {
        if (t >= 16) {
          w[t] = (g1(w[t - 2]) + w[t - 7] + g0(w[t - 15]) + w[t - 16]) | 0;
        }
        var T1 = (j + s1(e) + ((e & f) ^ (~e & g)) + k[t] + (w[t] || 0)) | 0;
        var T2 = (s0(a) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        j = g;
        g = f;
        f = e;
        e = (d + T1) | 0;
        d = c;
        c = b;
        b = a;
        a = (T1 + T2) | 0;
      }

      h[0] = (h[0] + a) | 0;
      h[1] = (h[1] + b) | 0;
      h[2] = (h[2] + c) | 0;
      h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0;
      h[5] = (h[5] + f) | 0;
      h[6] = (h[6] + g) | 0;
      h[7] = (h[7] + j) | 0;
    }

    var result = '';
    for (var i = 0; i < 8; i++) {
      var s = h[i] >>> 0;
      result += s.toString(16).padStart(8, '0');
    }
    return result;
  }

  // Verify an entered admin passcode. Preferred: compare its SHA-256 hash to
  // STUDIO_CONFIG.adminPasscodeHash, so no readable passcode ships with the
  // site's public source. A plaintext adminPasscode is honoured only as a
  // legacy fallback for older configs; there is no built-in default.
  async function verifyAdminPasscode(code) {
    if (!code) return false;
    const cfg = window.STUDIO_CONFIG || {};
    if (cfg.adminPasscodeHash) {
      try { return (await sha256Hex(code)) === String(cfg.adminPasscodeHash).toLowerCase(); }
      catch { return false; }
    }
    if (cfg.adminPasscode) return code === cfg.adminPasscode;
    return false;
  }

  const shouldShowWorkshopsToAll = () => {
    const workshops = SHOOTS.filter(s => s.type === "Workshop Attended");
    const uniqueMentors = new Set(
      workshops.map(s => String(s.mentor || "").trim().toLowerCase()).filter(Boolean)
    );
    return uniqueMentors.size >= 3;
  };

  const isAdminAuthorized = () => localStorage.getItem("wps-admin-authorized") === "1";
  const isAdmin = () => isAdminAuthorized() && sessionStorage.getItem("wps-admin") === "1";
  
  function isCurrentlyCompCardView() {
    const search = location.pathname + location.search;
    const decoded = decodeURIComponent(search).replace(/\+/g, " ");
    return search.includes("categories") && (
      search.includes("Comp%20Cards") || decoded.includes("Comp Cards") ||
      search.includes("Test%20Shoot") || decoded.includes("Test Shoot") || search.includes("Test+Shoot")
    );
  }

  function isCurrentlyModelPortfolioView() {
    const search = location.pathname + location.search;
    const decoded = decodeURIComponent(search).replace(/\+/g, " ");
    return search.includes("categories") && (
      search.includes("Model%20Portfolio") || decoded.includes("Model Portfolio")
    );
  }

  /* ============================================================
     §7 · PERSISTENCE — INDEXEDDB (shoots)
     ============================================================ */
  const DB = "personal-photostudio-v2", STORE = "shoots";
  let dbP;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise((res, rej) => {
      let settled = false;
      const done = (fn, v) => { if (!settled) { settled = true; fn(v); } };
      // Never let an unresponsive IndexedDB (private mode, headless, blocked)
      // hang boot — time out and fall back to the demo archive.
      const t = setTimeout(() => done(rej, new Error("indexedDB timeout")), 1500);
      let r;
      try { r = indexedDB.open(DB, 1); }
      catch (e) { clearTimeout(t); return done(rej, e); }
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" }); };
      r.onsuccess = () => { clearTimeout(t); done(res, r.result); };
      r.onerror = () => { clearTimeout(t); done(rej, r.error); };
      r.onblocked = () => { clearTimeout(t); done(rej, new Error("indexedDB blocked")); };
    });
    return dbP;
  }
  async function allShoots() { const d = await db(); return new Promise((res, rej) => { const q = d.transaction(STORE, "readonly").objectStore(STORE).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); }); }
  async function putShoot(rec) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(rec); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
  async function delShoot(id) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }

  /* ============================================================
     §8 · APP STATE
     ============================================================ */
  let SHOOTS = [];      // live shoots (real or demo)
  let usingDemo = true;
  let CURRENT_VIEW_SHOOTS = [];

  async function loadShoots() {
    let real = [];
    try { real = await allShoots(); }
    catch { real = []; }
    usingDemo = real.length === 0;
    
    const parseShootDate = (s) => {
      if (!s.date) return s.createdAt || 0;
      const t = Date.parse(s.date);
      return isNaN(t) ? (s.createdAt || 0) : t;
    };
    
    const sorted = (usingDemo ? (window.WPS_DATA.DEMO_SHOOTS || DEMO_SHOOTS) : real).sort((a, b) => parseShootDate(b) - parseShootDate(a));
    
    if (isAdmin()) {
      SHOOTS = sorted;
    } else {
      SHOOTS = sorted.filter(s => !isFutureShoot(s));
    }
  }

  /* ============================================================
     §9 · GITHUB SYNC
     Publishes the portfolio into the repo so every visitor sees it.
     - Merges per-shoot with what's already in data.js (local wins by id),
       so publishing from one device can't wipe another device's shoots.
     - Uploads photos as real image files under photos/ and stores only
       their paths in data.js, keeping data.js small and images cacheable.
     - Writes everything as one atomic commit via the git data API.
     ============================================================ */
  const GH_REPO = "prateeksaxenaphotography-maker/Fictional-spoon";
  const GH_BRANCH = "main";
  const GH_API = `https://api.github.com/repos/${GH_REPO}`;

  async function ghApi(pat, path, opts = {}) {
    const res = await fetch(`${GH_API}${path}`, {
      ...opts,
      headers: {
        "Authorization": `token ${pat}`,
        "Accept": "application/vnd.github+json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (res.status === 401) {
      localStorage.removeItem("wps-github-pat");
      throw new Error("GitHub rejected the token (401). It was cleared — you'll be asked for it again on the next sync.");
    }
    if (!res.ok) throw new Error(`GitHub ${opts.method || "GET"} ${path} failed (${res.status})`);
    return res.json();
  }

  // Pull the DEMO_SHOOTS array out of a data.js source string. The array is
  // always the last JSON value in the file, in every format we've published.
  function parseShootsFromDataJs(text) {
    try {
      const key = text.lastIndexOf("DEMO_SHOOTS");
      if (key === -1) return null;
      const start = text.indexOf("[", key);
      const end = text.lastIndexOf("]");
      if (start === -1 || end <= start) return null;
      const arr = JSON.parse(text.slice(start, end + 1));
      return Array.isArray(arr) ? arr : null;
    } catch { return null; }
  }

  async function fetchRemoteShoots(pat) {
    const res = await fetch(`${GH_API}/contents/data.js?ref=${GH_BRANCH}`, {
      headers: { "Authorization": `token ${pat}`, "Accept": "application/vnd.github.raw+json" },
    });
    if (!res.ok) return null;
    return parseShootsFromDataJs(await res.text());
  }

  const MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

  async function syncToGitHub(shootsList, { deletedIds = [] } = {}) {
    let pat = localStorage.getItem("wps-github-pat");
    if (!pat) {
      pat = prompt("Enter your GitHub Personal Access Token (PAT) to publish this change for everyone:");
      if (pat) {
        pat = pat.trim();
        localStorage.setItem("wps-github-pat", pat);
      } else {
        toast("Auto-sync skipped. Changes saved locally only.");
        return;
      }
    }
    try {
      toast("Syncing portfolio to GitHub…");

      // Merge with the published shoots: local wins by id; shoots that only
      // exist remotely (added from another device) survive; deletes propagate.
      const remote = await fetchRemoteShoots(pat);
      const removed = new Set(deletedIds);
      const merged = new Map();
      (remote || []).forEach((s) => { if (s && s.id && !s.demo && !removed.has(s.id)) merged.set(s.id, s); });
      shootsList.forEach((s) => { if (s && s.id && !s.demo && !removed.has(s.id)) merged.set(s.id, s); });
      const shoots = [...merged.values()];

      // Upload any photo still stored as base64 to photos/<shoot>/<photo>.<ext>.
      // Also generate 480px + 960px variants for responsive srcset (mobile perf).
      const photoEntries = [];
      const commitBlob = async (path, base64) => {
        const blob = await ghApi(pat, "/git/blobs", {
          method: "POST",
          body: JSON.stringify({ content: base64, encoding: "base64" }),
        });
        photoEntries.push({ path, mode: "100644", type: "blob", sha: blob.sha });
      };
      for (const s of shoots) {
        for (const p of s.photos || []) {
          if (p.url || !p.dataUrl) continue;
          const m = p.dataUrl.match(/^data:(image\/[a-z.+-]+);base64,/);
          if (!m) continue; // not a base64 image (e.g. demo SVG) — leave inline
          const dir = `photos/${s.id}`;
          const fullPath = `${dir}/${p.id}.${MIME_EXT[m[1]] || "jpg"}`;
          await commitBlob(fullPath, p.dataUrl.slice(m[0].length));
          p.url = fullPath;
          // Responsive variants (JPEG). Skip a variant if it doesn't shrink.
          try {
            for (const [w, key] of [[480, "small"], [960, "medium"]]) {
              const variant = await resize(p.dataUrl, w, 0.8);
              const vm = variant.match(/^data:(image\/[a-z.+-]+);base64,/);
              if (variant !== p.dataUrl && vm) {
                const vPath = `${dir}/${p.id}@${w}.jpg`;
                await commitBlob(vPath, variant.slice(vm[0].length));
                p[key] = vPath;
              }
            }
          } catch (err) { console.warn("variant gen failed for", p.id, err); }
          toast(`Uploading photos… (${photoEntries.length})`);
        }
      }

      // Published copy references photo files instead of inline base64.
      const published = shoots.map((s) => ({
        ...s,
        photos: (s.photos || []).map((p) => p.url
          ? {
              id: p.id, url: p.url, objectPosition: p.objectPosition || "center",
              ...(p.excludeFromCompCard ? { excludeFromCompCard: true } : {}),
              ...(p.small ? { small: p.small } : {}),
              ...(p.medium ? { medium: p.medium } : {}),
              ...(p.caption ? { caption: p.caption } : {}),
              ...(typeof p.focalX === "number" ? { focalX: p.focalX, focalY: p.focalY } : {})
            }
          : p),
      }));
      const fileContent = `/* ============================================================
   nerdyphotographer.in — published portfolio data
   Auto-synced by the Admin Panel. Photo files live under photos/.
   ============================================================ */
window.WPS_DATA = ${JSON.stringify({ ACTIVITIES, TYPES, BRANDS, DEMO_SHOOTS: published }, null, 2)};
`;

      // One atomic commit: photo blobs + regenerated data.js.
      const ref = await ghApi(pat, `/git/ref/heads/${GH_BRANCH}`);
      const baseCommit = await ghApi(pat, `/git/commits/${ref.object.sha}`);
      const tree = await ghApi(pat, "/git/trees", {
        method: "POST",
        body: JSON.stringify({
          base_tree: baseCommit.tree.sha,
          tree: [...photoEntries, { path: "data.js", mode: "100644", type: "blob", content: fileContent }],
        }),
      });
      const commit = await ghApi(pat, "/git/commits", {
        method: "POST",
        body: JSON.stringify({ message: "Auto-sync portfolio data from Admin Panel", tree: tree.sha, parents: [ref.object.sha] }),
      });
      await ghApi(pat, `/git/refs/heads/${GH_BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });

      // Bring this browser up to date with the merged result (photo URLs and
      // any shoots that only existed on the other device).
      try {
        for (const s of shoots) await putShoot(s);
        await loadShoots();
        render();
      } catch {}

      toast("Sync complete! Changes go live for everyone within a few minutes.");
    } catch (e) {
      console.error(e);
      toast(e.message && e.message.includes("401") ? e.message : "GitHub sync failed — changes are saved locally. Check the token and connection, then publish again.");
    }
  }

  /* ============================================================
     §10 · LIGHTBOX
     Fullscreen viewer: credits/stats sidebar, angle filters (Model
     Portfolio view), keyboard + touch navigation, focus handling.
     ============================================================ */
  const lb = $("#lightbox"), lbImg = $("#lightboxImg"), lbSidebar = $("#lightboxSidebar"), lbCount = $("#lbCounter");
  let lbList = [], lbIdx = 0, lbReturnFocus = null;
  
  window.toggleLbDiagram = () => {
    const el = document.getElementById("lbDiagramImg");
    if (el) {
      el.style.display = el.style.display === "none" ? "block" : "none";
    }
  };
  function renderLbSidebar(p) {
    const shoot = SHOOTS.find(x => x.id === p.shootId) || p.shoot;
    if (!shoot) return "";
    const isCc = shoot.type === "Test Shoot" && (isCurrentlyCompCardView() || isCurrentlyModelPortfolioView());
    
    // Parse social handle
    let igHtml = "";
    if (shoot.instagram) {
      const handles = compCardOwnHandles(shoot, shoot.instagram.split(",").map(x => x.trim()).filter(Boolean), isIgHandle);
      if (handles.length) {
        const links = handles.map(h => {
          let url = h;
          let label = h;
          if (!/^https?:\/\//i.test(h)) {
            const clean = h.replace(/^@/, "");
            url = `https://instagram.com/${clean}`;
            label = `@${clean}`;
          } else {
            try {
              const urlObj = new URL(h);
              const cleanPath = urlObj.pathname.replace(/^\/|\/$/g, "");
              if (cleanPath && !cleanPath.includes("/")) {
                label = `@${cleanPath}`;
              } else {
                label = `@${cleanPath.split("/").pop() || h}`;
              }
            } catch {
              label = h;
            }
          }
          return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: none; margin-right: 14px; display: inline-block;">${esc(label)}</a>`;
        }).join("");
        igHtml = `<div><dt>Instagram</dt><dd>${links}</dd></div>`;
      }
    }

    let kavyarHtml = "";
    if (shoot.kavyar) {
      const handles = compCardOwnHandles(shoot, shoot.kavyar.split(",").map(x => x.trim()).filter(Boolean), isKavyarHandle);
      if (handles.length) {
        const links = handles.map(h => {
          let url = h;
          let label = h;
          if (!/^https?:\/\//i.test(h)) {
            url = `https://kavyar.com/${h}`;
            label = `Kavyar: ${h}`;
          } else {
            try {
              const urlObj = new URL(h);
              const cleanPath = urlObj.pathname.replace(/^\/|\/$/g, "");
              label = `Kavyar: ${cleanPath.split("/").pop() || h}`;
            } catch {
              label = "Kavyar";
            }
          }
          return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: none; margin-right: 14px; display: inline-block;">${esc(label)}</a>`;
        }).join("");
        kavyarHtml = `<div><dt>Kavyar</dt><dd>${links}</dd></div>`;
      }
    }

    // Model Stats
    let statsHtml = "";
    const hasStats = shoot.height || shoot.chest || shoot.waist || shoot.hips || shoot.shoes || shoot.modelHair || shoot.modelEyes;
    if (isCc && hasStats) {
      statsHtml = `
        <div class="lb-sidebar-section">
          <h4 style="font-family:'Outfit', sans-serif; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink-soft); margin:0 0 10px;">Model Stats</h4>
          <div class="stats-row">
            ${shoot.height ? `<div class="stats-item"><dt>Height</dt><dd>${esc(shoot.height)}</dd></div>` : ""}
            ${shoot.chest ? `<div class="stats-item"><dt>Chest/Bust</dt><dd>${esc(shoot.chest)}</dd></div>` : ""}
            ${shoot.waist ? `<div class="stats-item"><dt>Waist</dt><dd>${esc(shoot.waist)}</dd></div>` : ""}
            ${shoot.hips ? `<div class="stats-item"><dt>Hips</dt><dd>${esc(shoot.hips)}</dd></div>` : ""}
            ${shoot.shoes ? `<div class="stats-item"><dt>Shoes</dt><dd>${esc(shoot.shoes)}</dd></div>` : ""}
            ${shoot.modelHair ? `<div class="stats-item"><dt>Hair</dt><dd>${esc(shoot.modelHair)}</dd></div>` : ""}
            ${shoot.modelEyes ? `<div class="stats-item"><dt>Eyes</dt><dd>${esc(shoot.modelEyes)}</dd></div>` : ""}
          </div>
        </div>
      `;
    }

    let angleHtml = "";
    let filterBarHtml = "";
    if (isCurrentlyModelPortfolioView()) {
      if (p.angle) {
        const labels = {
          "front": "Front Portrait",
          "side": "Side Profile",
          "back": "Back Angle",
          "three-quarter": "3/4 Angle",
          "close-up": "Close-up / Headshot"
        };
        const label = labels[p.angle] || p.angle;
        angleHtml = `
          <div style="margin-top: 8px;">
            <span style="font-family:'JetBrains Mono', monospace; font-size:10px; font-weight: 700; color:var(--accent); background:rgba(210,78,26,0.1); border: 1px solid var(--accent); padding: 4px 8px; border-radius: 4px; text-transform: uppercase; display: inline-block;">
              ${esc(label)}
            </span>
          </div>
        `;
      }
      
      const anglesInShoot = [...new Set((shoot.photos || []).map(x => x.angle).filter(Boolean))];
      if (anglesInShoot.length > 0) {
        const labels = {
          "front": "Front",
          "side": "Side",
          "back": "Back",
          "three-quarter": "3/4",
          "close-up": "Close-up"
        };
        filterBarHtml = `
          <div class="lb-sidebar-section" style="border-top: 1px solid var(--line); padding-top: 16px; margin-top: 16px;">
            <span class="eyebrow" style="font-family:'JetBrains Mono', monospace; font-size:9px; text-transform:uppercase; color:var(--ink-soft); display:block; margin-bottom: 8px;">Filter Portfolio</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="angle-filter-btn ${window.activeAngleFilter === 'all' ? 'active' : ''}" data-angle="all" style="font-family:inherit; font-size:10px; font-weight:700; padding:4px 8px; border-radius:4px; border:1px solid var(--line); background:${window.activeAngleFilter === 'all' ? 'var(--accent)' : 'var(--paper)'}; color:${window.activeAngleFilter === 'all' ? '#fff' : 'var(--ink)'}; cursor:pointer;">All</button>
              ${anglesInShoot.map(ang => {
                const isActive = window.activeAngleFilter === ang;
                return `<button class="angle-filter-btn ${isActive ? 'active' : ''}" data-angle="${ang}" style="font-family:inherit; font-size:10px; font-weight:700; padding:4px 8px; border-radius:4px; border:1px solid var(--line); background:${isActive ? 'var(--accent)' : 'var(--paper)'}; color:${isActive ? '#fff' : 'var(--ink)'}; cursor:pointer;">${labels[ang] || ang}</button>`;
              }).join("")}
            </div>
          </div>
        `;
      }
    }

    // Credits
    const credits = [];
    const isCcPage = !!shoot.isCompCard;
    const formatCrew = (val) => {
      if (!val) return "";
      return isCcPage ? esc(getTalentCleanName(val)) : renderCreditValue(val);
    };

    if (shoot.photographer) credits.push(`<div><dt>Photo</dt><dd>${formatCrew(shoot.photographer)}</dd></div>`);
    if (shoot.type === "Workshop Attended" && shoot.mentor) credits.push(`<div><dt>Teacher / Mentor</dt><dd>${esc(shoot.mentor)}</dd></div>`);
    if (shoot.artDirector && shoot.artDirector !== "—") credits.push(`<div><dt>Art Direction</dt><dd>${formatCrew(shoot.artDirector)}</dd></div>`);
    if (shoot.stylist && shoot.stylist !== "—") credits.push(`<div><dt>Stylist</dt><dd>${formatCrew(shoot.stylist)}</dd></div>`);
    if (shoot.mua && shoot.mua !== "—") credits.push(`<div><dt>MUA</dt><dd>${formatCrew(shoot.mua)}</dd></div>`);
    if (shoot.videographer && shoot.videographer !== "—") credits.push(`<div><dt>Video</dt><dd>${formatCrew(shoot.videographer)}</dd></div>`);
    if (shoot.hair && shoot.hair !== "—") credits.push(`<div><dt>Hair</dt><dd>${formatCrew(shoot.hair)}</dd></div>`);
    if (shoot.talent && shoot.talent !== "—") credits.push(`<div><dt>Model / Talent</dt><dd>${renderCreditValue(shoot.talent)}</dd></div>`);
    if (igHtml) credits.push(igHtml);
    if (kavyarHtml) credits.push(kavyarHtml);

    const creditsHtml = credits.length ? `
      <div class="lb-sidebar-section">
        <h4 style="font-family:'Outfit', sans-serif; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink-soft); margin:0 0 10px;">Credits</h4>
        <dl class="work-credits" style="margin: 0;">
          ${credits.join("")}
        </dl>
      </div>
    ` : "";

    // Lighting diagram
    let diagHtml = "";
    if (shoot.lightingDiagram && (shoot.lightingDiagramVisibility === "public" || isAdmin())) {
      diagHtml = `
        <div class="lb-sidebar-section" style="margin-top: 10px;">
          <button class="btn btn-ghost btn-block" style="font-size: 11px; height: auto; padding: 8px;" onclick="window.toggleLbDiagram()">
            View Lighting Setup
          </button>
          <div id="lbDiagramImg" style="display:none; margin-top:12px; border:1px solid var(--line); padding:10px; background:var(--bone); border-radius:4px;">
            <img src="${esc(shoot.lightingDiagram)}" style="max-width:100%; height:auto;" alt="Lighting setup" />
          </div>
        </div>
      `;
    }

    let pdfBtnHtml = "";
    if (isCc && !isCurrentlyModelPortfolioView()) {
      if (!shoot.disableCompCardDownload) {
        window.currentCompCardShootObj = shoot;
        pdfBtnHtml = `
          <div class="lb-sidebar-section" style="margin-top: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--bone); display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <span style="font-family:'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; text-transform: uppercase; color: var(--ink-soft);">PDF Orientation</span>
              <div style="display: inline-flex; background: var(--paper); padding: 2px; border-radius: 6px; border: 1px solid var(--line);" id="compCardOrientGroup">
                <label style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-family:'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; border-radius: 4px; cursor: pointer; transition: all 0.2s ease; background: var(--ink); color: var(--paper);" class="orient-radio-label active">
                  <input type="radio" name="compCardOrientRadio" value="portrait" checked onchange="window.setCompCardOrientation('portrait', this)" style="display: none;" />
                  <span>Portrait</span>
                </label>
                <label style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-family:'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; border-radius: 4px; cursor: pointer; transition: all 0.2s ease; background: transparent; color: var(--ink-soft);" class="orient-radio-label">
                  <input type="radio" name="compCardOrientRadio" value="landscape" onchange="window.setCompCardOrientation('landscape', this)" style="display: none;" />
                  <span>Landscape</span>
                </label>
              </div>
            </div>
            <button class="btn btn-dark btn-block" style="font-size: 11px; height: auto; padding: 10px; font-family: 'JetBrains Mono', monospace; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;" onclick="window.triggerCompCardDownload('${shoot.id}', window.selectedCompCardOrientation || 'portrait')">
              Export PDF Comp Card ↗
            </button>
            <div style="margin-top: 4px; padding: 10px 12px; background: #fdf6f0; border: 1px solid #f2c9b6; border-left: 4px solid var(--accent); border-radius: 6px; display: flex; align-items: flex-start; gap: 8px; text-align: left;">
              <span style="font-size: 15px; line-height: 1;">🎲</span>
              <div style="font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--ink); line-height: 1.45;">
                <strong style="color: var(--accent); text-transform: uppercase; font-size: 10px; letter-spacing: 0.03em;">Random Selection:</strong><br/>
                Supporting photos are randomly selected from all photos tagged to this model every time you export.
              </div>
            </div>
          </div>
        `;
      } else if (isAdmin()) {
        pdfBtnHtml = `
          <div class="lb-sidebar-section" style="margin-top: 10px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--accent); border: 1px dashed var(--accent); padding: 8px 12px; text-transform: uppercase; text-align: center; border-radius: 4px;">
            🔒 Comp card PDF download disabled by agency override
          </div>
        `;
      }
    } else if (isCc && isCurrentlyModelPortfolioView() && isAdmin()) {
      // Admin-only: export every portfolio-tagged photo of this model as a
      // multi-page PDF (cover + angle-labelled grids of 6 per A4 page).
      window.currentCompCardShootObj = shoot;
      pdfBtnHtml = `
        <div class="lb-sidebar-section" style="margin-top: 10px;">
          <button class="btn btn-dark btn-block" style="font-size: 11px; height: auto; padding: 10px; font-family: 'JetBrains Mono', monospace; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;" onclick="window.printModelPortfolio('${shoot.id}')">
            Export Model Portfolio PDF ↗ <span style="font-weight: normal; opacity: 0.7; font-size: 9px;">(🔒 Admin)</span>
          </button>
        </div>
      `;
    }
    const disclaimerHtml = isCc ? `
      <p class="lb-disclaimer" style="font-size: 11px; font-style: italic; color: var(--ink-soft); margin-top: 16px; border-top: 1px solid var(--line); padding-top: 12px; line-height: 1.5; font-family: sans-serif;">
        To book this talent, please connect directly via their verified social channels or contact their representing agency.
        <br/><br/>
        This compcard includes photos clicked or produced under nerdyphotographer.in studio or its subsidiaries.
      </p>
    ` : "";

    return `
      <div style="display:flex; flex-direction:column; gap: 24px; width: 100%;">
        <div>
          <span class="eyebrow" style="color:var(--accent); font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:0.05em; text-transform:uppercase;">
            ${isCc ? "Model Portfolio" : `${esc(shoot.brand)} · ${esc(shoot.type)}`}
          </span>
          <h2 style="font-family:'Outfit', sans-serif; font-size: 24px; font-weight:700; margin: 6px 0 0; color:var(--ink); line-height: 1.2;">
            ${esc(getTalentCleanName(shoot.talent || shoot.title))}
          </h2>
          ${angleHtml}
          ${shoot.description ? `<p style="font-size:13px; color:var(--ink-soft); line-height:1.5; margin:14px 0 0;">${esc(shoot.description)}</p>` : ""}
        </div>
        
        ${isCc ? "" : `
        <dl class="work-credits" style="margin: 0; padding: 14px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);">
          ${shoot.activity ? `<div><dt>Activity</dt><dd>${esc(shoot.activity)}</dd></div>` : ""}
          ${shoot.season ? `<div><dt>Season</dt><dd>${esc(shoot.season)}</dd></div>` : ""}
          ${(shoot.location) ? `<div><dt>Location</dt><dd>${esc(shoot.location)}</dd></div>` : ""}
        </dl>
        `}
        
        ${statsHtml}
        ${filterBarHtml}
        
        ${isCc ? `
          <div class="lb-sidebar-section" style="border-top: 1px solid var(--line); padding-top: 16px;">
            <dl class="work-credits" style="margin: 0;">
              ${igHtml}
              ${kavyarHtml}
            </dl>
          </div>
        ` : `
          ${creditsHtml}
        `}
        
        ${diagHtml}
        ${pdfBtnHtml}
        ${disclaimerHtml}
        ${(() => {
          if (!isAdmin()) return "";
          // Unified comp-card/portfolio "albums" are synthetic — they merge
          // several real shoots and their id doesn't exist in storage. Edit
          // and delete must target the REAL underlying shoots, so list one
          // row per original shoot (single-shoot albums get one plain row).
          const targets = (shoot.originalShoots && shoot.originalShoots.length) ? shoot.originalShoots : [shoot];
          const rows = targets.map(t => `
              <div style="display: flex; gap: 14px; width: 100%; margin-top: 6px;">
                <button class="link-arrow work-edit" style="color: var(--accent); font-weight: 700; padding: 0; font-size: 11px; height: auto; text-align: left;" data-id="${t.id}">${targets.length > 1 ? `Edit: "${esc(t.title)}"` : "Edit details"} →</button>
                <button class="link-arrow work-delete" style="color: #b22222; font-weight: 700; padding: 0; font-size: 11px; height: auto;" data-id="${t.id}" data-title="${esc(t.title || t.talent || "")}">Delete →</button>
              </div>`).join("");
          return `
            <div class="lb-sidebar-section" style="margin-top: 20px; border-top: 1px dashed var(--line); padding-top: 16px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; width: 100%;">
              <h4 style="font-family:'Outfit', sans-serif; font-size:9px; font-weight:800; letter-spacing:0.05em; text-transform:uppercase; color:var(--ink-soft); margin:0;">Admin Controls <span style="font-weight: normal; opacity: 0.7; font-size: 8px; margin-left: 4px;">(🔒 Visible Only to Admins)</span></h4>
              ${rows}
            </div>
          `;
        })()}
      </div>
    `;
  }

  function openLb(list, idx) {
    window.activeAngleFilter = "all";
    lbReturnFocus = document.activeElement;
    lbList = list; lbIdx = idx; paintLb(); lb.hidden = false;
    document.body.style.overflow = "hidden"; $("#lightboxClose").focus();
  }
  function paintLb() {
    const p = lbList[lbIdx]; if (!p) return;
    lbImg.src = photoSrc(p);
    lbImg.srcset = p.url ? srcsetAttr(p) : "";
    lbImg.alt = p.caption || altFor(p.shoot);
    lbImg.style.objectPosition = "center";
    lbSidebar.innerHTML = renderLbSidebar(p);
    lbCount.textContent = `${lbIdx + 1} / ${lbList.length}`;

    // Wire edit & delete buttons inside the lightbox sidebar if in admin mode.
    // Buttons carry data-id of the REAL underlying shoot (unified comp-card /
    // portfolio albums are synthetic and can't be edited or deleted directly).
    if (isAdmin()) {
      const shoot = SHOOTS.find(x => x.id === p.shootId) || p.shoot;
      if (shoot) {
        lbSidebar.querySelectorAll(".work-edit").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeLb();
            history.pushState(null, "", `/upload?edit=${btn.dataset.id || shoot.id}`);
            render();
          });
        });
        lbSidebar.querySelectorAll(".work-delete").forEach(btn => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const targetId = btn.dataset.id || shoot.id;
            const targetName = btn.dataset.title || shoot.title || shoot.talent;
            if (confirm(`Are you sure you want to delete the photoshoot "${targetName}"?`)) {
              closeLb();
              await delShoot(targetId);
              await loadShoots();
              toast(`Deleted "${targetName}".`);
              render();
              await syncToGitHub(SHOOTS, { deletedIds: [targetId] });
            }
          });
        });
      }
    }

    // Wire angle filter buttons for Model Portfolio view inside lightbox
    lbSidebar.querySelectorAll(".angle-filter-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const selectedAngle = btn.dataset.angle;
        window.activeAngleFilter = selectedAngle;
        
        // Find parent shoot to rebuild filtered list
        const currentShoot = SHOOTS.find(x => x.id === p.shootId) || p.shoot;
        const fullList = (currentShoot.photos || []).filter(x => {
          return x.usage === "portfolio" || x.usage === "both" || x.usage === undefined;
        }).map(x => ({ ...x, shoot: currentShoot }));
        
        let filteredList = fullList;
        if (selectedAngle !== "all") {
          filteredList = fullList.filter(x => x.angle === selectedAngle);
        }
        
        if (filteredList.length) {
          lbList = filteredList;
          lbIdx = 0;
          paintLb();
        } else {
          toast("No photos matching this profile.");
        }
      });
    });
  }
  function stepLb(d) { if (!lbList.length) return; lbIdx = (lbIdx + d + lbList.length) % lbList.length; paintLb(); }
  function closeLb() {
    lb.hidden = true; lbImg.src = ""; document.body.style.overflow = "";
    // Return focus to the thumbnail/card that opened the viewer.
    if (lbReturnFocus && document.contains(lbReturnFocus)) { try { lbReturnFocus.focus(); } catch {} }
    lbReturnFocus = null;
  }
  function initLightbox() {
    // Simple focus trap: keep Tab within the lightbox while it's open.
    trapTabKey(lb, "button:not([disabled])");
    $("#lightboxClose").addEventListener("click", (e) => { e.stopPropagation(); closeLb(); });
    $("#lbPrev").addEventListener("click", (e) => { e.stopPropagation(); stepLb(-1); });
    $("#lbNext").addEventListener("click", (e) => { e.stopPropagation(); stepLb(1); });
    // Close only on a genuine backdrop click — never when the click lands on the
    // nav buttons, close button, image, caption, sidebar, or counter (or their children).
    lb.addEventListener("click", (e) => {
      if (e.target.closest(".lightbox-nav, .lightbox-close, .lightbox-figure, .lightbox-counter, .lightbox-sidebar, #lightboxSidebar, .lb-sidebar-section, .lightbox-main")) return;
      if (e.target === lb || e.target.classList.contains("lightbox")) {
        closeLb();
      }
    });
    document.addEventListener("keydown", (e) => { if (lb.hidden) return; if (e.key === "Escape") closeLb(); else if (e.key === "ArrowLeft") stepLb(-1); else if (e.key === "ArrowRight") stepLb(1); });

    // Touch swipe support for lightbox on mobile
    let touchStartX = 0;
    let touchEndX = 0;
    lb.addEventListener("touchstart", (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    lb.addEventListener("touchend", (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const diff = touchEndX - touchStartX;
      if (diff < -50) stepLb(1);      // Swipe left -> Next
      else if (diff > 50) stepLb(-1); // Swipe right -> Prev
    }, { passive: true });
  }

  /* ============================================================
     §11 · SITE CHROME — overlay nav, admin & theme controls
     ============================================================ */
  const menuBtn = $("#menuBtn"), overlay = $("#navOverlay");
  function toggleMenu(open) {
    const o = open ?? !overlay.classList.contains("open");
    overlay.classList.toggle("open", o);
    overlay.setAttribute("aria-hidden", String(!o));
    menuBtn.setAttribute("aria-expanded", String(o));
    document.body.style.overflow = o ? "hidden" : "";
    const header = $(".site-header");
    if (header) {
      header.classList.toggle("menu-open", o);
    }
    // Focus management: into the menu on open, back to the button on close.
    if (o) {
      const firstLink = overlay.querySelector(".nav-links a");
      setTimeout(() => firstLink?.focus(), 60);
    } else if (document.activeElement && overlay.contains(document.activeElement)) {
      menuBtn.focus();
    }
  }
  function initNav() {
    menuBtn.addEventListener("click", () => toggleMenu());
    // Trap Tab within the open menu overlay.
    trapTabKey(overlay, "a[href], button:not([disabled])", () => overlay.classList.contains("open"));
    overlay.addEventListener("click", (e) => { if (e.target.closest("[data-link]")) toggleMenu(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.classList.contains("open")) toggleMenu(false); });
  }

  const adminBtn = $("#adminModeBtn");
  const themeBtn = $("#themeOverrideBtn");
  const visitorStatsLabel = $("#visitorStatsLabel");
  const visitorStatsBlock = $("#visitorStatsBlock");

  function getVisitorStats(seedString) {
    function random(seed) {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    }
    const msInDay = 24 * 60 * 60 * 1000;
    const currentDay = Math.floor(Date.now() / msInDay);
    const seedVal = seedString.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const visits24h = Math.floor(18 + random(currentDay + seedVal) * 15);
    let visits7d = visits24h;
    for (let i = 1; i < 7; i++) {
      visits7d += Math.floor(18 + random(currentDay - i + seedVal) * 15);
    }
    return { visits24h, visits7d };
  }

  function updateThemeBtnText() {
    if (!themeBtn) return;
    const mode = localStorage.getItem("wps-theme-override") || "auto";
    themeBtn.textContent = `Theme: ${mode}`;
    themeBtn.style.borderColor = mode !== "auto" ? "var(--accent)" : "currentColor";
    themeBtn.style.color = mode !== "auto" ? "var(--accent)" : "#fff";
  }

  function updateAdminBtn() {
    if (!adminBtn) return;
    const active = isAdmin();
    adminBtn.textContent = `Admin Mode: ${active ? "On" : "Off"}`;
    adminBtn.style.borderColor = active ? "var(--accent)" : "currentColor";
    adminBtn.style.color = active ? "var(--accent)" : "#fff";

    const adminSec = $("#navAdminSec");
    if (adminSec) {
      adminSec.style.display = isAdminAuthorized() ? "block" : "none";
    }

    const uploadLi = $("#navUploadLi"), bookLi = $("#navBookLi"), compCardsLi = $("#navCompCardsLi"), portfolioLi = $("#navModelPortfolioLi"), workshopLi = $("#navWorkshopLi"), logsLi = $("#navLogsLi");
    if (uploadLi) uploadLi.style.display = active ? "block" : "none";
    if (bookLi) bookLi.style.display = active ? "none" : "block";
    if (compCardsLi) compCardsLi.style.display = "block";
    if (portfolioLi) portfolioLi.style.display = active ? "block" : "none";
    if (workshopLi) workshopLi.style.display = (active || shouldShowWorkshopsToAll()) ? "block" : "none";
    if (logsLi) logsLi.style.display = active ? "block" : "none";

    if (themeBtn) {
      themeBtn.style.display = active ? "inline-block" : "none";
      updateThemeBtnText();
    }

    if (visitorStatsBlock && visitorStatsLabel) {
      if (active) {
        const stats = getVisitorStats("Wolverine Photo Studio");
        visitorStatsLabel.innerHTML = `Visits: <strong>${stats.visits24h}</strong> (24H) · <strong>${stats.visits7d}</strong> (7D)`;
        visitorStatsBlock.style.display = "block";
      } else {
        visitorStatsBlock.style.display = "none";
      }
    }
  }

  function initAdminControls() {
    adminBtn?.addEventListener("click", async () => {
      const turningOn = !isAdmin();
      if (turningOn) {
        const code = prompt("Enter admin passcode to enable Admin Mode:");
        if (!(await verifyAdminPasscode(code))) {
          alert("Incorrect passcode.");
          return;
        }
      }
      sessionStorage.setItem("wps-admin", turningOn ? "1" : "0");
      await loadShoots();
      updateAdminBtn();
      toast(`Admin Mode ${isAdmin() ? "enabled" : "disabled"}.`);
      render();
    });

    themeBtn?.addEventListener("click", () => {
      const current = localStorage.getItem("wps-theme-override") || "auto";
      let next = "auto";
      if (current === "auto") next = "light";
      else if (current === "light") next = "dark";
      else next = "auto";

      localStorage.setItem("wps-theme-override", next);
      updateThemeBtnText();
      if (window.applyWpsThemeOverride) {
        window.applyWpsThemeOverride();
      }
      syncHeaderThemeToggle();
    });
  }

  /* Public header theme toggle — simple light <-> dark for every visitor.
     Resolves the current effective theme, then flips to the opposite and
     stores it as an explicit override (leaving "auto" behind once used). */
  const headerThemeToggle = $("#headerThemeToggle");
  function currentEffectiveTheme() {
    return document.documentElement.classList.contains("theme-dark") ? "dark" : "light";
  }
  function syncHeaderThemeToggle() {
    if (!headerThemeToggle) return;
    const isDark = currentEffectiveTheme() === "dark";
    headerThemeToggle.setAttribute("aria-pressed", String(isDark));
    headerThemeToggle.setAttribute(
      "title",
      isDark ? "Switch to light theme" : "Switch to dark theme"
    );
  }

  function initThemeControls() {
    headerThemeToggle?.addEventListener("click", () => {
      const next = currentEffectiveTheme() === "dark" ? "light" : "dark";
      localStorage.setItem("wps-theme-override", next);
      if (window.applyWpsThemeOverride) window.applyWpsThemeOverride();
      updateThemeBtnText();
      syncHeaderThemeToggle();
    });
    // Keep the toggle icon/state in sync when the system theme changes in auto mode.
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncHeaderThemeToggle);
    syncHeaderThemeToggle();
  }

  /* ============================================================
     §12 · VIEWS — HTML builders for every route
     ============================================================ */
  const view = $("#view");

  // noth.in-style oversized section word that rises per-letter on scroll.
  const kineticWord = (word) => {
    const letters = String(word).split("").map((ch, i) =>
      ch === " "
        ? `<span class="kw-space">&nbsp;</span>`
        : `<span class="kw-letter" style="--i:${i}">${esc(ch)}</span>`
    ).join("");
    return `<div class="kinetic-word reveal" aria-hidden="true">${letters}</div>`;
  };
  // Turn a page-head <h1> into a per-letter kinetic headline (stays semantic for SEO).
  const kineticH1 = (word, extraClass = "") => {
    const letters = String(word).split("").map((ch, i) =>
      ch === " "
        ? `<span class="kw-space">&nbsp;</span>`
        : `<span class="kw-letter" style="--i:${i}">${esc(ch)}</span>`
    ).join("");
    return `<h1 class="reveal kinetic-h1 ${extraClass}"><span class="kinetic-word-inner">${letters}</span></h1>`;
  };
  // noth.in-style full-bleed work card: big image, title + tagline overlay,
  // image reveal on hover. Opens the shoot in the lightbox via .noth-work wiring.
  function nothWorkCard(s, i) {
    const cover = s.photos.find(p => p.id.split("-")[0] === s.coverPhotoId) || s.photos[0] || { objectPosition: "center" };
    const coverPos = cover.objectPosition || "center";
    const typeTag = (s.type === "Test Shoot" && !s.showTestShootCategory) ? "" : s.type;
    const tagline = s.description
      ? s.description
      : [s.activity, typeTag].filter(Boolean).join(" · ");
    const photoCount = s.photos ? s.photos.length : 0;
    const countText = photoCount ? `${photoCount} Photo${photoCount > 1 ? "s" : ""}` : "";
    const mentorText = (s.type === "Workshop Attended" && s.mentor) ? `Mentor: ${s.mentor}` : "";
    const meta = [s.brand, s.season, mentorText, countText].filter(v => v && v !== "Personal Project").join(" · ");
    const title = getTalentCleanName(s.isCompCard ? s.talent : (s.title || "Untitled"));
    return `
      <article class="noth-work reveal" data-shoot="${s.id}" data-talent="${esc(s.talent || '')}" style="--d:${(i % 2) * 0.08}s">
        <button class="noth-work-media" aria-label="View ${esc(title)}">
          <span class="noth-work-backdrop" style="background-image: url('${esc(photoSrc(cover))}');" aria-hidden="true"></span>
          <img src="${esc(photoSrc(cover))}"${srcsetAttr(cover, "(max-width: 620px) 100vw, 100vw")} style="object-position: ${esc(coverPos)};" alt="${esc(altFor(s))}" loading="lazy" />
        </button>
        <div class="noth-work-row">
          <div class="noth-work-titles">
            <h3 class="noth-work-title">${esc(title)}</h3>
            <p class="noth-work-tagline">${esc(tagline)}</p>
          </div>
          <div class="noth-work-meta">
            ${meta ? `<span>${esc(meta)}</span>` : ""}
            <span class="noth-work-cta">View <svg viewBox="0 0 14 10" width="14" height="10" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 5h12M9 1l4 4-4 4"/></svg></span>
          </div>
          ${isAdmin() ? `
            <div class="noth-work-admin" style="margin-top: 12px; display: flex; gap: 14px; width: 100%; border-top: 1px dashed var(--line); padding-top: 12px;">
              <button class="link-arrow work-edit" style="color: var(--accent); font-weight: 700; padding: 0; font-size: 11px; height: auto;" data-id="${s.id}">Edit details →</button>
              <button class="link-arrow work-delete" style="color: #b22222; font-weight: 700; padding: 0; font-size: 11px; height: auto;" data-id="${s.id}">Delete →</button>
            </div>
          ` : ""}
        </div>
      </article>`;
  }

  function fullBleedBlock(s, i) {
    const cover = s.photos.find(p => p.id.split("-")[0] === s.coverPhotoId) || s.photos[0] || { dataUrl: "", objectPosition: "center" };
    let coverPos = cover.objectPosition || "center";
    
    const latestShoot = s.originalShoots ? s.originalShoots[0] : s;
    const missingStats = [];
    if (s.isCompCard) {
      if (!latestShoot.height) missingStats.push("Height");
      if (!latestShoot.chest) missingStats.push("Bust/Chest");
      if (!latestShoot.waist) missingStats.push("Waist");
      if (!latestShoot.hips) missingStats.push("Hips");
      if (!latestShoot.shoes) missingStats.push("Shoes");
      if (!latestShoot.modelHair) missingStats.push("Hair Color");
      if (!latestShoot.modelEyes) missingStats.push("Eye Color");
    }
    
    // Parse multiple Instagram accounts/URLs to clickable links
    let igHtml = "";
    if (s.instagram) {
      let handles = s.instagram.split(",").map(x => x.trim()).filter(Boolean);
      if (s.isCompCard) {
        // Only show the model's (first) Instagram link for comp cards
        handles = handles.slice(0, 1);
      }
      igHtml = handles.map(h => {
        const clean = parseIgHandle(h);
        return `<a href="https://instagram.com/${encodeURIComponent(clean)}" target="_blank" rel="noopener" style="color:var(--accent); font-weight:600;">@${esc(clean)}</a>`;
      }).join(" · ");
    }

    const creditsList = [];
    if (s.isCompCard) {
      if (s.talent && s.talent !== "—") creditsList.push(`Talent <strong>${esc(s.talent)}</strong>`);
      if (igHtml) creditsList.push(`Socials ${igHtml}`);
    } else {
      if (s.photographer) creditsList.push(`Photo <strong>${esc(s.photographer)}</strong>`);
      if (s.artDirector) creditsList.push(`AD <strong>${esc(s.artDirector)}</strong>`);
      if (s.stylist && s.stylist !== "—") creditsList.push(`Style <strong>${esc(s.stylist)}</strong>`);
      if (s.hair && s.hair !== "—") creditsList.push(`Hair <strong>${esc(s.hair)}</strong>`);
      if (s.mua && s.mua !== "—") creditsList.push(`Makeup <strong>${esc(s.mua)}</strong>`);
      if (s.talent && s.talent !== "—") creditsList.push(`Talent <strong>${esc(s.talent)}</strong>`);
      if (igHtml) creditsList.push(`Socials ${igHtml}`);
    }
    const creditsHtml = creditsList.join("  ·  ");

    const testimonials = s.testimonials || (s.testimonial ? [s.testimonial] : []);
    const testimonialsHtml = testimonials.map(t => `
      <blockquote class="work-quote">“${esc(t.quote)}” <cite>— ${esc(t.by)}</cite></blockquote>
    `).join("");

    const showDiagram = s.lightingDiagram && (
      s.lightingDiagramVisibility === "public" || 
      (s.lightingDiagramVisibility === "private" && isAdmin())
    );

    const diagramHtml = showDiagram ? `
      <div class="work-diagram" style="margin-top: 24px; padding: 18px; border: 1px solid var(--line); border-radius: 8px; background: var(--bone);">
        <p class="eyebrow" style="margin: 0 0 10px; font-size: 9px;">Lighting Setup ${s.lightingDiagramVisibility === 'private' ? '🔒 (Admin Only)' : '🌐 (Public)'}</p>
        <button class="btn btn-ghost btn-block view-diagram-btn" style="padding: 10px; font-size: 12px; height: auto;" data-id="${s.id}">View Lighting Diagram</button>
        <div class="diagram-img-wrap" style="display: none; margin-top: 14px; text-align: center;">
          <img src="${esc(s.lightingDiagram)}" style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: var(--shadow);" alt="Lighting Setup Diagram" />
        </div>
      </div>
    ` : "";

    const mediaHtml = (s.isCompCard || s.type === "Test Shoot") ? (() => {
      const activePhotos = s.photos || [];
      const shownPhotos = activePhotos.slice(0, 3);
      const remainingCount = activePhotos.length - 3;
      const fourthPhoto = activePhotos[3];
      return `
        <div class="comp-card-grid">
          ${shownPhotos.map((p, idx) => `
            <button class="comp-card-thumb reveal" data-index="${idx}">
              <img src="${esc(photoSrc(p))}"${srcsetAttr(p, "(max-width: 620px) 45vw, 22vw")} alt="${esc(altFor(s, idx + 1))}" loading="lazy" />
            </button>
          `).join("")}
          ${fourthPhoto ? `
            <button class="comp-card-thumb comp-card-more reveal" data-index="3">
              <img src="${esc(photoSrc(fourthPhoto))}" style="filter: brightness(0.42);" alt="${esc(altFor(s, 4))}" loading="lazy" />
              ${remainingCount > 1 ? `<div class="comp-card-more-overlay">+${remainingCount} more</div>` : ""}
            </button>
          ` : ""}
        </div>
      `;
    })() : `
      <button class="work-media" aria-label="View ${esc(s.title)}">
        <img src="${esc(photoSrc(cover))}"${srcsetAttr(cover)} style="object-position: ${esc(coverPos)};" alt="${esc(altFor(s))}" loading="lazy" />
        <span class="work-count">${s.photos.length} frame${s.photos.length !== 1 ? 's' : ''}</span>
      </button>
    `;

    return `
      <article class="work-block ${i % 2 ? "flip" : ""} reveal" data-shoot="${s.id}" data-talent="${esc(s.talent)}">
        ${s.isCompCard ? `
          <div class="comp-card-header">
            <h2>${esc(s.talent)}</h2>
            <p class="comp-card-eyebrow">Comp Card</p>
          </div>
        ` : ""}
        ${mediaHtml}
        <div class="work-info">
          ${isFutureShoot(s) ? `
            <div class="future-schedule-badge" style="display: inline-block; background: rgba(210,78,26,0.12); color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 6px 12px; border-radius: 4px; margin-bottom: 16px; border: 1px solid rgba(210,78,26,0.25);">
              To be visible to public after ${esc(s.date)}
            </div>
          ` : ""}
          ${(() => {
            const canInline = !s.demo && !s.isCompCard && isAdmin();
            const ed = (field, extra = "") => canInline
              ? ` class="inline-edit ${extra}" contenteditable="true" spellcheck="false" data-shoot="${s.id}" data-field="${field}" title="Click to edit"`
              : (extra ? ` class="${extra}"` : "");
            const typeTag = (s.type === "Test Shoot" && !s.showTestShootCategory) ? "" : s.type;
            const brandAndType = [s.brand, typeTag].filter(Boolean).join(" · ");
            return `
            ${s.isCompCard ? "" : `
              <p class="eyebrow">${esc(brandAndType)}</p>
              <h3><span${ed("title")}>${esc(s.title)}</span></h3>
            `}
            <p class="work-desc"><span${ed("description")}>${esc(s.description || (canInline ? "Add a description…" : ""))}</span></p>
            ${s.isCompCard ? "" : `
            <dl class="work-credits">
              <div><dt>Activity</dt><dd>${esc(s.activity)}</dd></div>
              <div><dt>Season</dt><dd><span${ed("season")}>${esc(s.season || "—")}</span></dd></div>
              <div><dt>Location</dt><dd><span${ed("location")}>${esc(s.location || "—")}</span></dd></div>
            </dl>
            `}`;
          })()}
          
          ${s.isCompCard && (latestShoot.height || latestShoot.chest || latestShoot.waist || latestShoot.hips || latestShoot.shoes || latestShoot.modelHair || latestShoot.modelEyes) ? `
            <div style="margin-top: 14px; border-top: 1px solid var(--line); padding-top: 14px; width: 100%;">
              <p class="eyebrow" style="font-size: 9px; margin-bottom: 8px; color: var(--ink-soft); letter-spacing: 0.05em; text-align: left;">Model Stats</p>
              <div class="stats-row">
                ${latestShoot.height ? `<div class="stats-item"><dt>Height</dt><dd>${esc(latestShoot.height)}</dd></div>` : ""}
                ${latestShoot.chest ? `<div class="stats-item"><dt>Chest/Bust</dt><dd>${esc(latestShoot.chest)}</dd></div>` : ""}
                ${latestShoot.waist ? `<div class="stats-item"><dt>Waist</dt><dd>${esc(latestShoot.waist)}</dd></div>` : ""}
                ${latestShoot.hips ? `<div class="stats-item"><dt>Hips</dt><dd>${esc(latestShoot.hips)}</dd></div>` : ""}
                ${latestShoot.shoes ? `<div class="stats-item"><dt>Shoes</dt><dd>${esc(latestShoot.shoes)}</dd></div>` : ""}
                ${latestShoot.modelHair ? `<div class="stats-item"><dt>Hair</dt><dd>${esc(latestShoot.modelHair)}</dd></div>` : ""}
                ${latestShoot.modelEyes ? `<div class="stats-item"><dt>Eyes</dt><dd>${esc(latestShoot.modelEyes)}</dd></div>` : ""}
              </div>
            </div>
          ` : ""}

          ${s.isCompCard ? `
            <p style="font-size: 10px; font-style: italic; color: var(--ink-soft); margin-top: 10px; line-height: 1.4; font-family: sans-serif; text-align: left; width: 100%;">
              To book this talent, please connect directly via their verified social channels or contact their representing agency.
            </p>
          ` : ""}

          ${s.isCompCard && isAdmin() && missingStats.length > 0 ? `
            <div class="admin-warning-banner" style="background: rgba(210,78,26,0.06); border: 1px dashed var(--accent); padding: 14px 18px; border-radius: 6px; margin: 18px 0; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--accent); line-height: 1.5; text-align: left; width: 100%; box-sizing: border-box;">
              <span style="font-weight: 800; display: block; margin-bottom: 4px;">⚠️ MISSING COMP CARD STATS <span style="font-weight: normal; opacity: 0.7; font-size: 10px; margin-left: 6px;">(🔒 Visible Only to Admins)</span></span>
              The following details are missing for this model: ${missingStats.join(", ")}.
              <div style="margin-top: 8px;">
                <button class="link-arrow work-edit" style="color: var(--accent); font-weight: 700; padding: 0; font-size: 11px; height: auto;" data-id="${latestShoot.id}">Add stats now →</button>
              </div>
            </div>
          ` : ""}
          <p class="work-by">${creditsHtml}</p>
          ${testimonialsHtml}
          ${diagramHtml}
          <div style="margin-top: 22px; display: flex; align-items: center; flex-wrap: wrap; gap: 14px; width: 100%;">
            <button class="link-arrow work-open" style="padding: 0;">${s.isCompCard ? "View model details" : "View project"} →</button>
            ${(!s.demo && !s.isCompCard && isAdmin()) ? `
              <button class="link-arrow work-edit" style="color: var(--accent); font-weight: 700; padding: 0;" data-id="${s.id}">Edit details</button>
              <button class="link-arrow work-delete" style="color: #b22222; font-weight: 700; padding: 0;" data-id="${s.id}">Delete</button>
            ` : ""}
            ${s.isCompCard && isAdmin() ? `
              <div style="margin-top: 20px; border-top: 1px dashed var(--line); padding-top: 16px; width: 100%; text-align: left;">
                <p class="eyebrow" style="font-size: 9px; margin-bottom: 8px; color: var(--ink-soft); letter-spacing: 0.05em;">Admin Edit Portfolio Shoots</p>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  ${s.originalShoots.map(shootInfo => `
                    <button class="link-arrow work-edit" style="color: var(--accent); font-weight: 700; padding: 0; text-align: left; font-size: 11px; height: auto;" data-id="${shootInfo.id}">Edit: "${esc(shootInfo.title)}" →</button>
                  `).join("")}
                </div>
              </div>
            ` : ""}
          </div>
        </div>
      </article>`;
  }

  // Minimal line-art camera drawn behind the hero wordmark. Uses stroke-dash
  // draw-on animation (see .hero-camera CSS). Decorative, so aria-hidden.
  function cameraSvg() {
    return `
      <div class="hero-camera" aria-hidden="true">
        <svg viewBox="0 0 640 440" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <g stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
            <path class="hc-body" pathLength="1" d="M70 130 h110 l34 -46 h172 l34 46 h110 a30 30 0 0 1 30 30 v190 a30 30 0 0 1 -30 30 H70 a30 30 0 0 1 -30 -30 V160 a30 30 0 0 1 30 -30 Z"/>
            <circle class="hc-lens-outer" pathLength="1" cx="320" cy="258" r="96"/>
            <circle class="hc-lens-inner" pathLength="1" cx="320" cy="258" r="58"/>
            <circle class="hc-lens-dot" pathLength="1" cx="292" cy="230" r="14"/>
            <path class="hc-flash" pathLength="1" d="M120 176 h70"/>
            <rect class="hc-view" pathLength="1" x="470" y="168" width="70" height="42" rx="8"/>
          </g>
        </svg>
      </div>`;
  }

  function viewHome() {
    const feat = SHOOTS.filter(s => !s.isTestimonial && s.type !== "Workshop Attended").slice(0, 7);
    CURRENT_VIEW_SHOOTS = feat;
    const brandCount = new Set(SHOOTS.filter(s => s.client && s.client.trim() && s.type !== "Workshop Attended").map(s => s.brand)).size;
    const activeBrands = BRANDS.filter(b => SHOOTS.some(s => s.brand === b && s.client && s.client.trim() && s.type !== "Workshop Attended"));
    const displayBrands = activeBrands.length ? activeBrands : BRANDS;
    const clientNames = [...new Set(SHOOTS.filter(s => s.type !== "Workshop Attended").map(s => s.client).filter(c => c && c.trim()))];
    const nerdyLetters = "NERDY".split("").map((ch, i) =>
      `<span class="wm-letter" style="--i:${i}">${esc(ch)}</span>`
    ).join("");
    const subLetters = "PHOTOGRAPHER".split("").map((ch, i) =>
      `<span class="wm-sub-letter" style="--i:${i}">${esc(ch)}</span>`
    ).join("");

    const allT = getAllTestimonials();
    const shuffledT = shuffleArray(allT);
    const homeT = shuffledT.slice(0, 5);
    return `
      <section class="hero hero-mono hero-brand">
        <div class="hero-bg" aria-hidden="true"></div>
        ${cameraSvg()}
        <div class="container hero-inner">
          <div class="hero-topline reveal">
            <span class="hero-topline-l">The Creative Studio</span>
            <span class="hero-topline-r">Noida · Delhi NCR</span>
          </div>
          <div class="hero-brandmark">
            <h1 class="hero-wordmark hero-wordmark-nerdy" aria-label="Nerdy Photographer">
              ${nerdyLetters}
            </h1>
            <p class="hero-subword" aria-hidden="true">${subLetters}</p>
          </div>
          <div class="hero-mono-foot">
            <p class="hero-mono-tagline reveal">Not just photos, a perspective. <span class="hero-accent">Editorial-grade portfolios</span> for models &amp; brands.</p>
            <div class="hero-actions reveal">
              <a href="/categories" data-link class="btn btn-dark">Explore work →</a>
              ${isAdmin() ? `<a href="/upload" data-link class="btn btn-ghost">Publish a shoot</a>` : `<a href="/book" data-link class="btn btn-ghost">Book a shoot</a>`}
            </div>
          </div>
        </div>
        <div class="hero-scroll" aria-hidden="true"><span></span>SCROLL</div>
      </section>
      <h2 class="visually-hidden">Fashion, Fitness &amp; Sports Photography in Noida &amp; Delhi NCR — editorial-grade portfolios for models &amp; brands</h2>

      ${clientNames.length ? `
      <div class="marquee" aria-hidden="true">
        <div class="marquee-track">
          ${(clientNames.concat(clientNames)).map((c) => `<span>${esc(c)}</span><span>·</span>`).join("")}
        </div>
      </div>
      ` : ''}

      <!-- SERVICES (WHO I SHOOT FOR) -->
      <section class="section container section-divider">
        <div class="section-head section-head-center reveal">
          <p class="eyebrow">Services</p>
          <h2>Who I shoot for</h2>
        </div>
        <div class="services-grid reveal-stagger">
          <a href="/categories" data-link class="service-card" style="display: block; text-decoration: none; color: inherit; cursor: pointer;">
            <div class="service-kicker">Brands</div>
            <h3>Campaigns &amp; Lookbooks</h3>
            <p>High-concept visual storytelling, commercial lookbooks, and campaigns tailored to elevate brand identities and drive customer engagement.</p>
            <span class="link-arrow" style="margin-top: 12px; display: inline-block; font-size: 12px; font-weight: 700;">Browse categories →</span>
          </a>
          <a href="/categories?kind=type&amp;val=Comp%20Cards" data-link class="service-card" style="display: block; text-decoration: none; color: inherit; cursor: pointer;">
            <div class="service-kicker">Models</div>
            <h3>Portfolio Building &amp; TFP</h3>
            <p>Editorial-grade portfolio building, comp card shoot development, and selective test shoots (TFP) to help models stand out in agency submissions.</p>
            <span class="link-arrow" style="margin-top: 12px; display: inline-block; font-size: 12px; font-weight: 700; color: var(--accent);">View model comp cards →</span>
          </a>
          <a href="/categories?kind=activity&amp;val=Fitness" data-link class="service-card" style="display: block; text-decoration: none; color: inherit; cursor: pointer;">
            <div class="service-kicker">Athletes</div>
            <h3>Fitness &amp; Sports Action</h3>
            <p>Dynamic action-freezing athletic portraits and editorial-grade fitness content that highlights physique, strength, and raw athletic performance.</p>
            <span class="link-arrow" style="margin-top: 12px; display: inline-block; font-size: 12px; font-weight: 700;">See fitness work →</span>
          </a>
        </div>
      </section>

      <!-- FEATURED PHOTOSHOOTS -->
      <section class="section container section-divider">
        ${kineticWord("WORKS")}
        <div class="section-head row reveal" style="margin-top: 8px;">
          <div><p class="eyebrow">01 — Selected work</p><h2>Featured photoshoots</h2></div>
          <a href="/albums" data-link class="link-arrow">All albums →</a>
        </div>
        <div class="noth-work-list">${feat.map(nothWorkCard).join("")}</div>
        ${SHOOTS.filter(s => s.type !== "Workshop Attended").length > feat.length ? `
        <div class="works-all-cta reveal">
          <a href="/albums" data-link class="btn btn-dark">View all ${SHOOTS.filter(s => s.type !== "Workshop Attended").length} albums →</a>
        </div>
        ` : ""}
      </section>


      ${homeT.length ? `
      <!-- TESTIMONIALS (CLIENT REACTIONS) -->
      <section class="section container" style="border-top: 1px solid var(--line); padding-top: 60px; margin-top: 60px;">
        <div class="section-head row reveal" style="margin-bottom: 40px;">
          <div>
            <p class="eyebrow">Client Reactions</p>
            <h2>Testimonials &amp; Trust</h2>
          </div>
          ${allT.length > 5 ? `<a href="/testimonials" data-link class="link-arrow">All Testimonials (${allT.length}) →</a>` : ""}
        </div>
        <div class="testimonials-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 30px;">
          ${homeT.map((t, i) => `
            <div class="testimonial-card reveal" style="--d:${(i * 0.06).toFixed(2)}s; background: var(--bone); border: 1px solid var(--line); padding: 24px; border-radius: 12px; display: flex; flex-direction: column; gap: 15px; justify-content: space-between;">
              <p style="font-family: 'Georgia', serif; font-size: 15px; font-style: italic; line-height: 1.6; color: var(--ink); margin: 0;">“${esc(t.quote)}”</p>
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <strong style="font-family: 'Archivo', sans-serif; font-size: 13px; color: var(--ink);">${esc(t.by)}</strong>
                <span style="font-size: 11px; color: var(--ink-soft); font-family: var(--mono-font);">${esc(t.meta)} ${t.season ? `· ${esc(t.season)}` : ""}</span>
              </div>
            </div>
          `).join("")}
        </div>
        ${allT.length > 5 ? `
        <div style="text-align: center; margin-top: 40px;" class="reveal">
          <a href="/testimonials" data-link class="btn btn-dark">View all ${allT.length} testimonials →</a>
        </div>
        ` : ""}
      </section>
      ` : ''}

      <!-- CTA BAND -->
      <section class="cta-band" style="border-top: 1px solid var(--line); margin-top: 60px;">
        <div class="container reveal">
          ${isAdmin() ? `
            <h2>Your shoot belongs in the archive.</h2>
            <a href="/upload" data-link class="btn btn-dark">Publish your photoshoot →</a>
          ` : `
            <h2>Ready to capture your story?</h2>
            <a href="/book" data-link class="btn btn-dark">Book your photoshoot session →</a>
          `}
        </div>
      </section>`;
  }

  // Full listing of every album — the "All albums" page.
  function viewAlbums() {
    const list = SHOOTS.filter(s => s.type !== "Workshop Attended");
    CURRENT_VIEW_SHOOTS = list;
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">02 — The archive</p>
          ${kineticH1("Albums")}
          <p class="page-sub reveal">${list.length} album${list.length !== 1 ? "s" : ""} in the archive — every photoshoot, newest first.</p>
        </div>
      </section>
      <section class="section container">
        <div class="noth-work-list">${list.map(nothWorkCard).join("") || emptyCat()}</div>
      </section>
      <section class="cta-band">
        <div class="container reveal">
          ${isAdmin() ? `
            <h2>Add another to the archive.</h2>
            <a href="/upload" data-link class="btn btn-dark">Publish a photoshoot →</a>
          ` : `
            <h2>Ready to capture your story?</h2>
            <a href="/book" data-link class="btn btn-dark">Book your photoshoot session →</a>
          `}
        </div>
      </section>`;
  }

  function viewWorkshopAttended() {
    const list = SHOOTS.filter(s => s.type === "Workshop Attended");
    CURRENT_VIEW_SHOOTS = list;
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">🔒 Admin View Only</p>
          ${kineticH1("Workshops", "kinetic-h1-wide")}
          <p class="page-sub reveal" style="max-width: 600px; line-height: 1.6; opacity: 1 !important; visibility: visible !important; transform: none !important;">A dedicated record of professional photography workshops attended, people trained, and creative techniques learned to build editorial proficiency.</p>
        </div>
      </section>
      <section class="section container">
        <div class="noth-work-list">${list.map(nothWorkCard).join("") || `<p class="page-sub">No workshop albums published yet. Go to <a href="/upload" data-link style="text-decoration:underline; font-weight:600; color:var(--accent);">Upload</a> to add one with type 'Workshop Attended'.</p>`}</div>
      </section>
    `;
  }


  function catCard(label, kind, val, count, sample, cover) {
    const coverSrc = cover ? photoSrc(cover) : "";
    const swatch = coverSrc
      ? `<span class="cat-cover"><img src="${esc(coverSrc)}" alt="${esc(label)}" loading="lazy" /></span>`
      : `<span class="cat-swatch" style="background:linear-gradient(150deg,${esc(sample[0])},${esc(sample[1])})"></span>`;
    return `
      <a href="/categories?kind=${kind}&amp;val=${encodeURIComponent(val)}" data-link class="cat-card reveal">
        ${swatch}
        <div class="cat-body"><span class="cat-kind">${kind}</span><h3>${esc(label)}</h3><span class="cat-count">${count} shoot${count !== 1 ? "s" : ""}</span></div>
        <span class="cat-arrow">→</span>
      </a>`;
  }

  function viewCategories(kind, val) {
    // Detail: a filtered work list
    if (kind && val) {
      const d = decodeURIComponent(val);
      const list = SHOOTS.filter((s) => {
        if (kind === "brand" && (!s.client || !s.client.trim())) return false;
        if (kind === "type" && (d === "Model Portfolio" || d === "Comp Cards" || d === "Test Shoot")) {
          return s.type === "Test Shoot";
        }
        return (kind === "activity" ? s.activity : kind === "brand" ? s.brand : s.type) === d;
      });

      let displayList = list;
      if (kind === "type" && (d === "Test Shoot" || d === "Model Portfolio" || d === "Comp Cards")) {
        const filteredList = list.filter(s => !s.hideFromCompCard && ((s.instagram && s.instagram.trim()) || (s.kavyar && s.kavyar.trim())));
        const groupable = [];
        const nonGroupable = [];
        for (const s of filteredList) {
          const talentClean = (s.talent || "").trim();
          const hasExactlyOneModel = talentClean && !talentClean.includes(",") && !talentClean.toLowerCase().includes(" and ") && !talentClean.toLowerCase().includes("&");
          const hasNoBrandOrClient = (!s.client || !s.client.trim()) && (!s.brand || s.brand === "Personal Project" || !s.brand.trim());
          
          if (hasExactlyOneModel && hasNoBrandOrClient) {
            groupable.push(s);
          } else {
            nonGroupable.push(s);
          }
        }
        
        const groups = {};
        for (const s of groupable) {
          const modelName = s.talent.trim();
          if (!groups[modelName]) groups[modelName] = [];
          groups[modelName].push(s);
        }
        
        const unifiedAlbums = Object.keys(groups).map(modelName => {
          const shootsInGroup = groups[modelName];
          shootsInGroup.sort((a, b) => {
            const parseDate = (x) => x.date ? Date.parse(x.date) : (x.createdAt || 0);
            return parseDate(b) - parseDate(a);
          });
          const latestShoot = shootsInGroup[0];
          const isPortView = (d === "Model Portfolio");
          const allGroupPhotos = shootsInGroup.flatMap(gs => (gs.photos || []).filter(p => {
            if (isPortView) {
              return p.usage === "portfolio" || p.usage === "both" || p.usage === undefined;
            } else {
              return p.usage === "comp" || p.usage === "both" || !p.excludeFromCompCard;
            }
          }).map(p => ({ ...p, parent: gs })));
          const coverId = latestShoot.coverPhotoId || (latestShoot.photos[0] && latestShoot.photos[0].id);
          const coverPhotoObj = allGroupPhotos.find(p => p.id.split("-")[0] === coverId);
          const remainingPhotos = allGroupPhotos.filter(p => p.id.split("-")[0] !== coverId);
          const finalPhotos = coverPhotoObj ? [coverPhotoObj, ...shuffleArray(remainingPhotos)] : shuffleArray(allGroupPhotos);
          
          const findStat = (key) => {
             const found = shootsInGroup.find(s => s[key] && String(s[key]).trim());
             return found ? String(found[key]).trim() : "";
          };
          
          const isPort = d === "Model Portfolio";
          return {
            id: isPort ? `portfolio-${encodeURIComponent(modelName)}` : `comp-card-${encodeURIComponent(modelName)}`,
            title: isPort ? `${modelName} — Portfolio` : `${modelName} — Comp Card`,
            brand: "Personal Project",
            activity: latestShoot.activity,
            type: "Test Shoot",
            height: findStat("height"),
            chest: findStat("chest"),
            waist: findStat("waist"),
            hips: findStat("hips"),
            shoes: findStat("shoes"),
            modelHair: findStat("modelHair"),
            modelEyes: findStat("modelEyes"),
            season: latestShoot.season || "Comp Card",
            photographer: latestShoot.photographer || "Studio",
            artDirector: latestShoot.artDirector || "",
            stylist: latestShoot.stylist || "",
            hair: latestShoot.hair || "",
            mua: latestShoot.mua || "",
            videographer: latestShoot.videographer || "",
            talent: modelName,
            location: latestShoot.location || "Studio",
            description: latestShoot.description || "",
            tags: latestShoot.tags || "",
            gear: latestShoot.gear || "",
            client: "",
            date: latestShoot.date,
            instagram: latestShoot.instagram,
            kavyar: latestShoot.kavyar,
            link: latestShoot.link,
            rights: latestShoot.rights,
            palette: latestShoot.palette || ["#3a3a3a", "#0d0d0d"],
            photos: finalPhotos,
            coverPhotoId: latestShoot.coverPhotoId || (latestShoot.photos[0] && latestShoot.photos[0].id),
            isCompCard: true,
            originalShoots: shootsInGroup
          };
        });
        
        displayList = [...unifiedAlbums, ...nonGroupable];
      }

      CURRENT_VIEW_SHOOTS = displayList;

      const isTestShoot = (kind === "type" && (d === "Test Shoot" || d === "Comp Cards" || d === "Model Portfolio"));
      const alphaFilterHtml = isTestShoot ? `
        <div class="alpha-filter-bar container reveal">
          <button class="alpha-btn active" data-alpha="ALL">ALL</button>
          ${"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(char => {
            const hasMatches = displayList.some(s => getTalentCleanName(s.talent).trim().charAt(0).toUpperCase() === char);
            return `<button class="alpha-btn" data-alpha="${char}"${!hasMatches ? " disabled" : ""}>${char}</button>`;
          }).join("")}
        </div>
      ` : "";

      const getCategoryTitle = (val) => {
        if (val === "Test Shoot" || val === "Comp Cards") return "Model Comp Cards";
        if (val === "Model Portfolio") return "Model Portfolio";
        return val;
      };

      const getCategoryDescription = (val) => {
        if (val === "Model Portfolio") {
          return "This portfolio archive displays curated agency-standard portfolios, filtered and tagged by profile angles (Front, Side, Back, 3/4, Close-up).";
        }
        return "This compcard archive includes photos clicked or produced under nerdyphotographer.in studio or its subsidiaries.";
      };

      return `
        <section class="page-head">
          <div class="container">
            <p class="eyebrow reveal"><a href="/categories" data-link>Categories</a> / ${esc(kind)}</p>
             <h1 class="reveal">${esc(getCategoryTitle(d))}</h1>
            ${isTestShoot ? `<p class="page-sub" style="max-width: 600px; line-height: 1.6; opacity: 1 !important; visibility: visible !important; transform: none !important;">${esc(getCategoryDescription(d))}</p>` : `<p class="page-sub reveal">${displayList.length} master album${displayList.length !== 1 ? "s" : ""} in this ${esc(kind)}.</p>`}
          </div>
        </section>
        ${alphaFilterHtml}
        <section class="section container"><div class="work-list">${displayList.map(fullBleedBlock).join("") || emptyCat()}</div></section>`;
    }
    // Index: three lenses
    const grp = (arr, key) => arr.map((v) => {
      const shoots = SHOOTS.filter((s) => {
        if (s.type === "Workshop Attended") return false;
        if (key === "brand" && (!s.client || !s.client.trim())) return false;
        return s[key] === v;
      });
      const sample = (shoots[0] || SHOOTS[0] || {}).palette || ["#3a3a3a", "#0d0d0d"];
      // Pick a representative cover photo for the tile
      let cover = null;
      for (const s of shoots) {
        const c = s.photos && (s.photos.find(p => p.id && p.id.split("-")[0] === s.coverPhotoId) || s.photos[0]);
        if (c) { cover = c; break; }
      }
      return { v, count: shoots.length, sample, cover };
    }).filter((x) => x.count > 0);
    const typFilter = TYPES.filter(t => {
      if (t === "Workshop Attended") return false;
      if (t === "Test Shoot") return SHOOTS.some(s => s.type === "Test Shoot" && s.showTestShootCategory);
      return true;
    });
    const act = grp(ACTIVITIES, "activity"), brs = grp(BRANDS, "brand"), typ = grp(typFilter, "type");
    
    if (act.length === 0 && brs.length === 0 && typ.length === 0) {
      return `
        <section class="page-head">
          <div class="container">
            <p class="eyebrow reveal">03 — Browse</p>
            <h1 class="reveal">Categories</h1>
            <p class="page-sub reveal">No categories or shoots exist yet. Publish a shoot to populate the archive.</p>
          </div>
        </section>`;
    }

    const getSamples = (key, val, limit = 3) => {
      const targetVal = (key === "type" && (val === "Comp Cards" || val === "Model Portfolio" || val === "Test Shoot")) ? "Test Shoot" : val;
      let shoots = SHOOTS.filter(s => (s[key] === targetVal || (targetVal === "Test Shoot" && (s.isCompCard || s.type === "Test Shoot"))) && ((s.instagram && s.instagram.trim()) || (s.kavyar && s.kavyar.trim())));
      if (!shoots.length) return [];
      
      // Group shoots by UNIQUE model/talent name to ensure distinct models in thumbnails!
      const modelGroups = new Map();
      shoots.forEach(s => {
        const modelName = getTalentCleanName(s.talent || s.title).trim().toLowerCase();
        if (!modelGroups.has(modelName)) {
          modelGroups.set(modelName, []);
        }
        modelGroups.get(modelName).push(s);
      });

      // Pick 1 random shoot per unique model
      const distinctModelShoots = [];
      for (const [mName, mShoots] of modelGroups.entries()) {
        const randShoot = mShoots[Math.floor(Math.random() * mShoots.length)];
        distinctModelShoots.push(randShoot);
      }

      // Shuffle the distinct models array to randomize thumbnail selection on each page view
      const shuffledShoots = distinctModelShoots.sort(() => Math.random() - 0.5);
      
      const samples = [];
      // 1. Take a random photo from each distinct model to guarantee distinct models!
      for (const s of shuffledShoots) {
        if (s.photos && s.photos.length) {
          const randomIdx = Math.floor(Math.random() * s.photos.length);
          samples.push({ ...s.photos[randomIdx], parent: s, index: randomIdx });
        }
        if (samples.length >= limit) break;
      }
      
      // 2. Fallback: If total unique models < 3, fill remaining slots with remaining photos from available shoots
      if (samples.length < limit) {
        const remaining = [];
        for (const s of shoots) {
          if (s.photos && s.photos.length > 1) {
            const selectedIdxs = samples.filter(p => p.parent.id === s.id).map(p => p.index);
            for (let i = 0; i < s.photos.length; i++) {
              if (!selectedIdxs.includes(i)) {
                remaining.push({ ...s.photos[i], parent: s, index: i });
              }
            }
          }
        }
        const shuffledRemaining = remaining.sort(() => Math.random() - 0.5);
        for (const photo of shuffledRemaining) {
          if (samples.length >= limit) break;
          samples.push(photo);
        }
      }
      return samples.slice(0, limit);
    };

    const renderSpecialtyGallery = (samples, placeholderPrefix, kind = "", val = "") => {
      let html = '';
      for (let i = 0; i < 3; i++) {
        const photo = samples[i];
        if (photo) {
          const src = photoSrc(photo);
          html += `<button class="specialty-thumb-btn reveal" data-kind="${esc(kind)}" data-val="${esc(val)}" data-src="${esc(src)}" style="aspect-ratio: 3/4; overflow: hidden; background: var(--bone); border: 1px solid var(--line); border-radius: 4px; padding: 0; cursor: pointer; display: block; width: 100%;">
                     <img src="${esc(src)}"${srcsetAttr(photo, "(max-width: 620px) 30vw, 18vw")} style="width:100%; height:100%; object-fit:cover; object-position:center; transition: transform .4s var(--ease);" alt="${esc(photo.parent ? altFor(photo.parent) : placeholderPrefix + ' photography by nerdyphotographer.in')}" loading="lazy" />
                   </button>`;
        } else {
          html += `<div class="specialty-thumb-empty">${placeholderPrefix}_0${i+1}</div>`;
        }
      }
      return html;
    };

    const fashionSamples = getSamples("activity", "Fashion");
    const portraitSamples = getSamples("activity", "Portrait");
    const fitnessSamples = getSamples("activity", "Fitness");
    const sportsSamples = getSamples("activity", "Sports");
    const testShootSamples = getSamples("type", "Test Shoot");

    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">03 — Browse</p>
          ${kineticH1("Categories")}
          <p class="page-sub reveal">Three ways into the archive — by what was shot, who it was for, and how it was made.</p>
        </div>
      </section>
      ${act.length ? `
      <section class="section container">
        <div class="section-head reveal"><p class="eyebrow">By activity</p><h2>What we shot</h2></div>
        <div class="cat-grid">${act.map((x) => catCard(x.v, "activity", x.v, x.count, x.sample, x.cover)).join("")}</div>
      </section>
      ` : ""}
      ${brs.length ? `
      <section class="section container">
        <div class="section-head reveal"><p class="eyebrow">By brand</p><h2>Who it was for</h2></div>
        <div class="cat-grid">${brs.map((x) => catCard(x.v, "brand", x.v, x.count, x.sample, x.cover)).join("")}</div>
      </section>
      ` : ""}


      <!-- SPECIALTIES DIRECTORY -->
      ${(fashionSamples.length || portraitSamples.length || fitnessSamples.length || sportsSamples.length || testShootSamples.length) ? `
      <section class="section container section-divider">
        <div class="section-head reveal" style="margin-bottom: 45px;">
          <p class="eyebrow">Our Specialties</p>
          <h2>Photography Focus Areas</h2>
        </div>
        <div class="specialties-list">
          
          ${fashionSamples.length ? `
          <div class="specialty-item reveal">
            <div class="specialty-meta">
              <h3>
                <a href="/categories?kind=activity&amp;val=Fashion" data-link>Fashion Editorial</a>
              </h3>
              <p>
                Editorial-grade fashion photography combining styling, dramatic concepts, and high-fashion modeling portfolios. Crafted for designer campaigns, apparel lookbooks, and modeling agency submissions in Noida &amp; Delhi NCR.
              </p>
              <a href="/categories?kind=activity&amp;val=Fashion" data-link class="link-arrow" style="font-size: 12px; font-weight: 700;">Explore fashion edit →</a>
            </div>
            <div class="specialty-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              ${renderSpecialtyGallery(fashionSamples, "FASHION", "activity", "Fashion")}
            </div>
          </div>
          ` : ""}

          ${portraitSamples.length ? `
          <div class="specialty-item reveal">
            <div class="specialty-meta">
              <h3>
                <a href="/categories?kind=activity&amp;val=Portrait" data-link>Beauty &amp; Portrait</a>
              </h3>
              <p>
                Fine art beauty portraits, cinematic lighting setups, and magazine-style close-ups. Focused on capturing expressive features, professional model headshots, and high-fidelity skin textures with natural detailing.
              </p>
              <a href="/categories?kind=activity&amp;val=Portrait" data-link class="link-arrow" style="font-size: 12px; font-weight: 700;">Explore beauty &amp; portraits →</a>
            </div>
            <div class="specialty-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              ${renderSpecialtyGallery(portraitSamples, "BEAUTY", "activity", "Portrait")}
            </div>
          </div>
          ` : ""}

          ${fitnessSamples.length ? `
          <div class="specialty-item reveal">
            <div class="specialty-meta">
              <h3>
                <a href="/categories?kind=activity&amp;val=Fitness" data-link>Fitness &amp; Athletic</a>
              </h3>
              <p>
                Physique, fitness, and bodybuilding editorial photography. High-contrast athletic portraits, highlighting musculature, dedication, and form for personal trainers, fitness models, and activewear brands.
              </p>
              <a href="/categories?kind=activity&amp;val=Fitness" data-link class="link-arrow" style="font-size: 12px; font-weight: 700;">Explore fitness catalog →</a>
            </div>
            <div class="specialty-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              ${renderSpecialtyGallery(fitnessSamples, "FITNESS", "activity", "Fitness")}
            </div>
          </div>
          ` : ""}

          ${sportsSamples.length ? `
          <div class="specialty-item reveal">
            <div class="specialty-meta">
              <h3>
                <a href="/categories?kind=activity&amp;val=Sports" data-link>Sports Action</a>
              </h3>
              <p>
                Action-stopping sports photography capturing motion, speed, and raw intensity. Documenting athletes in their element with high-speed shutter setups and responsive editorial lensing.
              </p>
              <a href="/categories?kind=activity&amp;val=Sports" data-link class="link-arrow" style="font-size: 12px; font-weight: 700;">Explore sports action →</a>
            </div>
            <div class="specialty-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              ${renderSpecialtyGallery(sportsSamples, "SPORTS", "activity", "Sports")}
            </div>
          </div>
          ` : ""}

          ${testShootSamples.length ? `
          <div class="specialty-item reveal">
            <div class="specialty-meta">
              <h3>
                <a href="/categories?kind=type&amp;val=Comp%20Cards" data-link>Model Comp Cards</a>
              </h3>
              <p>
                Comprehensive testing shoots and comp card layout photography designed for aspiring and professional model talent. Direct submissions focus: clean test lighting, polaroids, digitals, and styling versatility.
                <span style="display: block; margin-top: 8px; font-size: 11.5px; color: var(--ink-soft); line-height: 1.4;">This compcard archive includes photos clicked or produced under nerdyphotographer.in studio or its subsidiaries.</span>
              </p>
              <a href="/categories?kind=type&amp;val=Comp%20Cards" data-link class="link-arrow" style="font-size: 12px; font-weight: 700;">Explore comp cards →</a>
            </div>
            <div class="specialty-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              ${renderSpecialtyGallery(testShootSamples, "MODEL", "type", "Comp Cards")}
            </div>
          </div>
          ` : ""}

          ${testShootSamples.length && isAdmin() ? `
          <div class="specialty-item reveal" style="border-top: 1px dashed var(--line); padding-top: 40px; margin-top: 40px;">
            <div class="specialty-meta">
              <span style="font-family:var(--mono-font); font-size:9px; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.05em; display:block; margin-bottom: 6px;">🔒 Admin Portfolio View</span>
              <h3>
                <a href="/categories?kind=type&amp;val=Model%20Portfolio" data-link>Model Portfolio</a>
              </h3>
              <p>
                Curated model portfolios displaying agency-ready grids. Optimized for casting directors with quick filters to segment by shooting angle (Front, Side, Back, 3/4, Close-up).
              </p>
              <a href="/categories?kind=type&amp;val=Model%20Portfolio" data-link class="link-arrow" style="font-size: 12px; font-weight: 700; color: var(--accent);">Explore portfolio angles →</a>
            </div>
            <div class="specialty-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              ${renderSpecialtyGallery(testShootSamples, "PORTFOLIO", "type", "Model Portfolio")}
            </div>
          </div>
          ` : ""}

        </div>
      </section>
      ` : ""}
      `;
  }
  const emptyCat = () => `<p class="page-sub">Nothing here yet — publish a shoot in this category.</p>`;

  const PROCESS = [
    ["The Brief", "We start with the story the brand needs to tell — the feeling before the frame."],
    ["Direction", "Mood, location, casting, and shot list. Every frame is decided before the shutter."],
    ["The Shoot", "On set: light, motion, and patience. We shoot for the hero and the archive both."],
    ["The Edit", "Selects, color, and sequence. The edit is where a shoot becomes a story."],
    ["Deliver", "Tagged, credited, and filed by activity, brand, and type — ready to find in seconds."],
  ];
  function viewStudio() {
    const activeBrands = BRANDS.filter(b => SHOOTS.some(s => s.brand === b && s.client && s.client.trim()));
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">04 — The studio</p>
          ${kineticH1("Studio")}
          <p class="page-sub reveal">A home for the photography behind ${esc(window.STUDIO_CONFIG?.studioName || "our studio")}'s work — a working studio and a living archive, in one place.</p>
        </div>
      </section>
      <section class="section container">
        <div class="studio-intro reveal">
          <p class="serif-lead">${esc(window.STUDIO_CONFIG?.introQuote || "“The best photography doesn't just record a moment. It captures the light, the mood, and the silent story within the frame.”")}</p>
        </div>
      </section>
      <section class="section container">
        <div class="section-head reveal"><p class="eyebrow">How a shoot happens</p><h2>The process</h2></div>
        <ol class="process">
          ${PROCESS.map(([t, d], i) => `<li class="reveal" style="--d:${i * 0.06}s"><span class="process-num">0${i + 1}</span><h3>${t}</h3><p>${d}</p></li>`).join("")}
        </ol>
      </section>
      ${activeBrands.length ? `
      <section class="section container">
        <div class="section-head reveal"><p class="eyebrow">Our house</p><h2>The brands we shoot for.</h2></div>
        <ul class="brand-row">${activeBrands.map((b, i) => `<li class="reveal" style="--d:${i * 0.04}s">${esc(b)}</li>`).join("")}</ul>
      </section>
      ` : ""}
      <section class="cta-band">
        <div class="container reveal">
          ${isAdmin() ? `
            <h2>Have a shoot to add?</h2>
            <a href="#/upload" data-link class="btn btn-dark">Publish to the archive →</a>
          ` : `
            <h2>Looking to collaborate?</h2>
            <a href="#/book" data-link class="btn btn-dark">Book a photoshoot session →</a>
          `}
        </div>
      </section>`;
  }

  function viewTestimonials() {
    const allT = getAllTestimonials();
    const shuffledT = shuffleArray(allT);
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">06 — Social Proof</p>
          ${kineticH1("Testimonials")}
          <p class="page-sub reveal">Words from our creative partners, brands, and models about their shoot experience and production results at nerdyphotographer.in.</p>
        </div>
      </section>
      <section class="section container">
        ${shuffledT.length ? `
        <div class="testimonials-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 30px;">
          ${shuffledT.map((t, i) => `
            <div class="testimonial-card reveal" style="--d:${(i * 0.05).toFixed(2)}s; background: var(--bone); border: 1px solid var(--line); padding: 28px; border-radius: 12px; display: flex; flex-direction: column; gap: 20px; justify-content: space-between;">
              <p style="font-family: 'Georgia', serif; font-size: 16px; font-style: italic; line-height: 1.6; color: var(--ink); margin: 0;">“${esc(t.quote)}”</p>
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <strong style="font-family: 'Archivo', sans-serif; font-size: 14px; color: var(--ink);">${esc(t.by)}</strong>
                <span style="font-size: 11px; color: var(--ink-soft); font-family: var(--mono-font);">${esc(t.meta)} ${t.season ? `· ${esc(t.season)}` : ""}</span>
              </div>
            </div>
          `).join("")}
        </div>
        ` : `<p class="page-sub">No testimonials published yet.</p>`}
      </section>
      <section class="cta-band" style="border-top: 1px solid var(--line); margin-top: 60px;">
        <div class="container reveal">
          ${isAdmin() ? `
            <h2>Have a testimonial to publish?</h2>
            <a href="/upload" data-link class="btn btn-dark">Publish testimonial →</a>
          ` : `
            <h2>Ready to collaborate?</h2>
            <a href="/book" data-link class="btn btn-dark">Book your photoshoot session →</a>
          `}
        </div>
      </section>
    `;
  }

  /* ---------- Upload view (rich, grouped form) ---------- */
  let staged = []; // {id,dataUrl,name}
  function viewUpload() {
    const opt = (arr) => arr.map((v) => `<option value="${v}">${v}</option>`).join("");
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const dropTitle = isTouch ? "Tap to upload photos" : "Drag your photoshoot here";
    const dropHint = isTouch ? "Select images from files or photo library" : "or <span class=\"link\">browse files</span> — JPG, PNG, WEBP";
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">05 — Contribute</p>
          <h1 class="reveal">Publish a photoshoot</h1>
          <p class="page-sub reveal">Drop your images, fill in the studio credits, and your shoot joins the archive — browsable by activity, brand and type. Saved locally to this browser.</p>
        </div>
      </section>
      <section class="section container">
        <div class="upload-grid">
          <div class="dropzone reveal" id="dropzone" tabindex="0" role="button" aria-label="Upload images">
            <input type="file" id="fileInput" accept="image/*" multiple hidden />
            <div class="dropzone-inner">
              <svg class="dropzone-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              <p class="dropzone-title">${dropTitle}</p>
              <p class="dropzone-hint">${dropHint}</p>
            </div>
            <div class="thumb-grid" id="stagingGrid"></div>
          </div>

          <form class="shoot-form reveal" id="shootForm" autocomplete="off">
            <div style="margin-bottom: 24px; padding: 14px 18px; border: 1px solid var(--line); border-radius: 8px; background: var(--bone); display: flex; align-items: center; gap: 10px; width: 100%;">
              <input id="f_is_testimonial_only" type="checkbox" style="width: 16px; height: 16px; accent-color: var(--accent); margin: 0; cursor: pointer;" />
              <label for="f_is_testimonial_only" style="font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; font-weight: 700; cursor: pointer; color: var(--ink);">Testimonial Only (No Photoshoot Album)</label>
            </div>

            <fieldset><legend>The shoot</legend>
              <label class="field"><span>Shoot title *</span><input id="f_title" type="text" placeholder="e.g. Merrell Trail — Spring '26" required /></label>
              <div class="field-row">
                <label class="field" id="f_brand_select_field"><span>Brand</span><select id="f_brand">${opt(BRANDS)}<option>Other</option></select></label>
                <label class="field" id="f_brand_text_field" style="display: none;"><span>Company / Role *</span><input id="f_brand_text" type="text" placeholder="e.g. Model, Vogue, Brand Director" /></label>
                <label class="field" id="f_activity_field"><span>Activity</span><select id="f_activity">${opt(ACTIVITIES)}</select></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Type</span><select id="f_type">${opt(TYPES)}</select></label>
                <label class="field"><span>Season / Year</span><input id="f_season" type="text" placeholder="Spring 2026" /></label>
                <label class="field"><span>Shoot Location</span><input id="f_location" type="text" placeholder="e.g. Studio, Noida, Outdoor" /></label>
              </div>
              <div class="field-row" style="margin-top: 12px; gap: 20px; flex-wrap: wrap;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: var(--ink); cursor: pointer; user-select: none;">
                  <input id="f_show_test_shoot_cat" type="checkbox" style="width: 16px; height: 16px; accent-color: var(--accent);" />
                  Display "Test Shoot" category tag publicly
                </label>
              </div>
            </fieldset>

            <fieldset><legend>Credits</legend>
              <div class="field-row">
                <label class="field"><span>Photographer</span><input id="f_photographer" type="text" value="nerdyphotographer" placeholder="Your name" /></label>
                <label class="field"><span>Art director</span><input id="f_ad" type="text" placeholder="—" /></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Stylist</span><input id="f_stylist" type="text" placeholder="—" /></label>
                <label class="field"><span>Hair stylist</span><input id="f_hair" type="text" placeholder="—" /></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Makeup artist (MUA)</span><input id="f_mua" type="text" placeholder="—" /></label>
                <label class="field"><span>Videographer(s)</span><input id="f_video" type="text" placeholder="—" /></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Model / talent (comma-separated)</span><input id="f_talent" type="text" placeholder="e.g. Model A, Model B" /></label>
              </div>
              <div class="field-row" id="f_mentor_row" style="display: none;">
                <label class="field"><span>Teacher / Mentor (only for Workshops)</span><input id="f_mentor" type="text" placeholder="e.g. Mentor Name" /></label>
              </div>
            </fieldset>

            <fieldset id="modelStatsFieldset"><legend>Model stats (Comp Cards)</legend>
              <div class="field-row">
                <label class="field"><span>Height</span><input id="f_height" type="text" placeholder="e.g. 5'11&quot; / 180 cm" /></label>
                <label class="field"><span>Bust / Chest</span><input id="f_chest" type="text" placeholder="e.g. 34&quot; / 86 cm" /></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Waist</span><input id="f_waist" type="text" placeholder="e.g. 26&quot; / 66 cm" /></label>
                <label class="field"><span>Hips</span><input id="f_hips" type="text" placeholder="e.g. 36&quot; / 91 cm" /></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Shoes</span><input id="f_shoes" type="text" placeholder="e.g. 8 US / 41 EU" /></label>
                <label class="field"><span>Hair color</span><input id="f_model_hair" type="text" placeholder="e.g. Dark Brown" /></label>
              </div>
              <label class="field"><span>Eye color</span><input id="f_model_eyes" type="text" placeholder="e.g. Green" /></label>
              <div class="field-row" style="margin-top: 12px; gap: 20px; flex-wrap: wrap;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: var(--ink); cursor: pointer; user-select: none;">
                  <input id="f_show_stats_comp" type="checkbox" checked style="width: 16px; height: 16px; accent-color: var(--accent);" />
                  Show stats on Comp Cards
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: var(--ink); cursor: pointer; user-select: none;">
                  <input id="f_show_stats_port" type="checkbox" checked style="width: 16px; height: 16px; accent-color: var(--accent);" />
                  Show stats on Model Portfolio
                </label>
              </div>
            </fieldset>

            <fieldset><legend>Details</legend>
              <label class="field"><span>Description</span><textarea id="f_desc" rows="3" placeholder="A line or two about the shoot…"></textarea></label>
              <div class="field-row">
                <label class="field"><span>Tags</span><input id="f_tags" type="text" placeholder="golden hour, motion, coast" /></label>
                <label class="field"><span>Camera / gear</span><input id="f_gear" type="text" placeholder="Sony A1 · 85mm" /></label>
              </div>
            </fieldset>

            <fieldset><legend>Links & meta</legend>
              <div class="field-row">
                <label class="field"><span>Client</span><input id="f_client" type="text" placeholder="Brand name" /></label>
                <label class="field"><span>Date shot</span><input id="f_date" type="date" /></label>
              </div>
              <div class="field-row">
                <label class="field" style="position: relative;">
                  <span>Instagram (comma-separated)</span>
                  <input id="f_ig" type="text" placeholder="e.g. @handle1, @handle2" />
                  <div id="f_ig_verify" style="margin-top: 5px; font-size: 11px; display: none;"></div>
                </label>
                <label class="field" style="position: relative;">
                  <span>Kavyar Profile / Links</span>
                  <input id="f_kavyar" type="text" placeholder="e.g. https://kavyar.com/profile" />
                  <div id="f_kavyar_verify" style="margin-top: 5px; font-size: 11px; display: none;"></div>
                </label>
              </div>
              <div class="field-row">
                <label class="field"><span>Portfolio link / Website</span><input id="f_link" type="url" placeholder="https://…" /></label>
                <label class="field"><span>Usage rights</span><input id="f_rights" type="text" placeholder="e.g. Web + social, 1 year" /></label>
              </div>
              <div class="field-row" style="align-items: center; margin-top: 10px; gap: 20px; flex-wrap: wrap;">
                <label style="display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; font-weight: 700; cursor: pointer; color: #fff;">
                  <input id="f_featured" type="checkbox" checked style="width: 15px; height: 15px; accent-color: var(--accent); margin: 0;" />
                  Feature on homepage
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; font-weight: 700; cursor: pointer; color: #fff;">
                  <input id="f_hide_compcard" type="checkbox" style="width: 15px; height: 15px; accent-color: var(--accent); margin: 0;" />
                  Hide from Comp Cards Page
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; font-weight: 700; cursor: pointer; color: #fff;">
                  <input id="f_disable_download" type="checkbox" style="width: 15px; height: 15px; accent-color: var(--accent); margin: 0;" />
                  Disable Comp Card PDF Download
                </label>
              </div>
            </fieldset>

            <fieldset id="extraTestimonialsFs"><legend>Testimonials <span class="legend-opt">optional (up to 3)</span></legend>
              <div class="testimonial-group">
                <h4>Testimonial 1</h4>
                <label class="field"><span>Quote</span><textarea id="f_quote_1" rows="2" placeholder="“First quote…”"></textarea></label>
                <label class="field"><span>Attribution</span><input id="f_quoteby_1" type="text" placeholder="Attribution 1" /></label>
              </div>
              <div style="margin-top: 14px; border-top: 1px solid var(--line); padding-top: 14px;">
                <h4>Testimonial 2</h4>
                <label class="field"><span>Quote</span><textarea id="f_quote_2" rows="2" placeholder="“Second quote…”"></textarea></label>
                <label class="field"><span>Attribution</span><input id="f_quoteby_2" type="text" placeholder="Attribution 2" /></label>
              </div>
              <div style="margin-top: 14px; border-top: 1px solid var(--line); padding-top: 14px;">
                <h4>Testimonial 3</h4>
                <label class="field"><span>Quote</span><textarea id="f_quote_3" rows="2" placeholder="“Third quote…”"></textarea></label>
                <label class="field"><span>Attribution</span><input id="f_quoteby_3" type="text" placeholder="Attribution 3" /></label>
              </div>
            </fieldset>

            <fieldset id="fieldsetLighting"><legend>Lighting Diagram <span class="legend-opt">optional</span></legend>
              <label class="field"><span>Diagram image</span><input type="file" id="f_diagram_file" accept="image/*" /></label>
              <div id="diagramPreview" style="margin-top: 10px; display: none;">
                <img id="f_diagram_img" style="max-height: 180px; width: auto; object-fit: contain; border-radius: 6px; border: 1px solid var(--line);" alt="Diagram Preview" />
                <button type="button" id="clearDiagramBtn" style="display: block; margin-top: 6px; background: none; border: none; color: #b22222; font-size: 11px; cursor: pointer; text-decoration: underline; padding: 0;">Remove Diagram</button>
              </div>
              <label class="field"><span>Visibility mode</span>
                <select id="f_diagram_visibility">
                  <option value="private">Private (Admin Only)</option>
                  <option value="public">Public (Visible to everyone)</option>
                  <option value="disabled">Disabled (Do not show at all)</option>
                </select>
              </label>
            </fieldset>

            <p class="field-note" id="queueNote">No photos staged yet.</p>
            <button type="submit" class="btn btn-dark btn-block" id="publishBtn" disabled>Publish to the archive</button>
          </form>
        </div>
      </section>`;
  }

  function viewBook() {
    const params = new URLSearchParams(location.search);
    const prefilledType = params.get("type") || "";
    const isSelected = (val) => {
      if (val === "Fashion Editorial" && prefilledType === "Editorial") return "selected";
      if (val === "Commercial Campaign" && prefilledType === "Commercial") return "selected";
      return val === prefilledType ? "selected" : "";
    };

    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">Book a session</p>
          ${kineticH1("Book", "kinetic-h1-wide")}
          <p class="page-sub reveal">Fill out the details below to inquire about booking a session. Whether you are booking a commercial campaign, e-commerce production, editorial work, or scheduling a selective test shoot, please submit your brief and project specs below.</p>
        </div>
      </section>
      <section class="section container">
        <div class="book-wrap">
          <div class="book-success" id="bookSuccess" style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 20px; width: 100%; max-width: 580px; margin: 0 auto;" hidden>
            <div class="book-success-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <h2>Request prepared.</h2>
            <p id="bookSuccessMsg" style="margin: 0; line-height: 1.6;">Your booking inquiry is ready in your email app — please hit <strong>Send</strong> in your mail client to complete the request.</p>
            
            <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; width: 100%;">
              <a href="" id="bookMailtoLink" class="btn btn-dark" style="font-size: 11px; height: auto; padding: 10px 18px; text-decoration: none;">Launch Mail App</a>
              <a href="" id="bookGmailLink" target="_blank" rel="noopener noreferrer" class="btn btn-dark" style="font-size: 11px; height: auto; padding: 10px 18px; text-decoration: none; background: #ea4335; border-color: #ea4335; color: #fff;">Send via Gmail (Web)</a>
              <a href="" id="bookOutlookLink" target="_blank" rel="noopener noreferrer" class="btn btn-dark" style="font-size: 11px; height: auto; padding: 10px 18px; text-decoration: none; background: #0078d4; border-color: #0078d4; color: #fff;">Send via Outlook (Web)</a>
            </div>
            <div style="display: flex; gap: 12px; justify-content: center; width: 100%; margin-top: 6px;">
              <button type="button" class="btn btn-ghost" id="bookAnother" style="font-size: 11px; height: auto; padding: 8px 18px;">Send another request</button>
              <a href="/" data-link class="btn btn-ghost" style="font-size: 11px; height: auto; padding: 8px 18px; text-decoration: none;">Back to home</a>
            </div>

            <div style="margin-top: 14px; border-top: 1px dashed var(--line); padding-top: 20px; width: 100%; display: flex; flex-direction: column; gap: 10px; align-items: center;">
              <p style="font-size: 12px; color: var(--ink-soft); margin: 0; line-height: 1.5;">Mail app didn't open? Copy the inquiry details below and email them to <strong style="color: var(--ink); font-family: monospace;">prateeksaxenaphotography@gmail.com</strong>:</p>
              <button type="button" class="btn btn-ghost" id="copyInquiryBtn" style="font-size: 11px; padding: 8px 16px; height: auto;">Copy Inquiry Text</button>
              <pre id="inquiryTextPreview" style="width: 100%; box-sizing: border-box; background: var(--bone); padding: 14px; border-radius: 6px; font-size: 11px; font-family: monospace; white-space: pre-wrap; text-align: left; max-height: 200px; overflow-y: auto; border: 1px solid var(--line); color: var(--ink); margin: 0;"></pre>
            </div>
          </div>
          <form class="shoot-form" id="bookingForm" novalidate>
            <fieldset>
              <legend>Contact Information</legend>
               <div class="field-row">
                 <label class="field"><span>Your Name / Brand *</span><input id="b_name" type="text" required placeholder="e.g. John Doe / Brand Name" /></label>
                 <label class="field"><span>Role *</span>
                   <select id="b_role">
                     <option value="Model">Model / Talent</option>
                     <option value="MUA">Makeup Artist / MUA</option>
                     <option value="Stylist">Stylist / Wardrobe</option>
                     <option value="Brand">Brand / Client</option>
                     <option value="Agency">Agency / Agent</option>
                     <option value="Other">Other</option>
                   </select>
                 </label>
               </div>
               <div class="field-row">
                 <label class="field"><span>Email Address *</span><input id="b_email" type="email" required placeholder="name@example.com" /></label>
                 <label class="field"><span>Phone Number</span><input id="b_phone" type="tel" placeholder="+91 99999-99999" /></label>
               </div>
               <label class="field"><span id="b_instagram_label">Instagram / Website</span><input id="b_instagram" type="text" placeholder="e.g. @handle or website.com" /></label>
             </fieldset>
 
             <fieldset>
               <legend>Shoot Details</legend>
               <div class="field-row">
                 <label class="field"><span>Desired Project Type *</span>
                   <select id="b_type">
                     <option value="Fashion Editorial" ${isSelected("Fashion Editorial")}>Fashion Editorial</option>
                     <option value="Fitness &amp; Athletic" ${isSelected("Fitness &amp; Athletic")}>Fitness &amp; Athletic</option>
                     <option value="Sports Action" ${isSelected("Sports Action")}>Sports Action</option>
                     <option value="Commercial Campaign" ${isSelected("Commercial Campaign")}>Commercial Campaign</option>
                     <option value="Test Shoot" ${isSelected("Test Shoot")}>Test Shoot (TFP Collab)</option>
                     <option value="Other" ${isSelected("Other")}>Other Focus Area</option>
                   </select>
                 </label>
                 <label class="field"><span>Preferred Date / Timeline *</span><input id="b_date" type="text" required placeholder="e.g. Mid-July 2026" /></label>
               </div>
               <div class="field-row">
                 <label class="field"><span>Preferred Location *</span><input id="b_location" type="text" required placeholder="e.g. Noida Studio / Outdoor NCR" /></label>
                 <label class="field" id="b_budget_field"><span>Estimated Budget Range *</span>
                   <select id="b_budget">
                     <option value="Under ₹10,000">Under ₹10,000 (Selective Tests)</option>
                     <option value="₹10,000 - ₹25,000">₹10,000 - ₹25,000 (Standard Portfolio)</option>
                     <option value="₹25,000 - ₹50,000">₹25,000 - ₹50,000 (Premium Campaign)</option>
                     <option value="₹50,000+">₹50,000+ (High-End Commercial)</option>
                     <option value="Not Decided">Not Decided / TBD</option>
                   </select>
                 </label>
               </div>
               <label class="field"><span>Reference / Mood Board Link</span><input id="b_moodboard" type="url" placeholder="Pinterest board, Dropbox, or Google Drive URL" /></label>
               <label class="field"><span>Project Concept &amp; Detailed Brief</span><textarea id="b_concept" rows="4" placeholder="Describe the mood, location style, styling ideas, and deliverables you have in mind..."></textarea></label>
             </fieldset>
 
             <!-- TFP Liability Release Terms Modal -->
             <div id="termsModal" class="modal-overlay" style="display: none; position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); align-items: center; justify-content: center; padding: 20px;">
               <div class="modal-content" style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; max-width: 680px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.15); overflow: hidden; animation: modalFadeIn 0.3s ease;">
                 <div style="padding: 20px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; background: var(--bone);">
                   <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink);">Studio Production &amp; Liability Release</h3>
                   <span style="font-family: var(--mono-font); font-size: 10px; background: var(--line); padding: 4px 8px; border-radius: 4px; color: var(--ink-soft);">TFP-LIABILITY-RELEASE-V3</span>
                 </div>
                 <div style="padding: 24px; overflow-y: auto; font-size: 13px; line-height: 1.6; color: var(--ink); display: flex; flex-direction: column; gap: 20px; text-align: left;">
                   <p style="margin: 0; font-family: var(--mono-font); font-size: 10px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em;">TFP Collaboration, Model Release &amp; Digital Consent Terms</p>
                   
                   <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 6px; padding: 14px; font-size: 11px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px;">
                     <div><strong>Studio/Photographer:</strong> nerdyphotographer.in studios</div>
                     <div><strong>Creative Partner/Model:</strong> <span id="terms_partner_name">[Your Name]</span></div>
                     <div><strong>Business Handle:</strong> @thenerdyphotographer.in</div>
                     <div><strong>Consent Tracking:</strong> Verified via Email / Digital Acknowledgment</div>
                     <div><strong>Production Status:</strong> Time-For-Print (TFP) Collab</div>
                     <div><strong>Location:</strong> Studio Production Space</div>
                   </div>
 
                   <div>
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700;">1. SCOPE OF CREATIVE COLLABORATION</h4>
                     <p style="margin: 0;">This session is scheduled as a peer-to-peer creative collaboration structured for mutual portfolio growth, asset curation, and personal branding advancement. No monetary compensation is required or exchanged for photographer or model services. The Studio provides specialized equipment, lighting architecture, workspace, and post-production engineering; the Participant(s) provide technical modeling direction, personal wardrobe, and makeup artistry. <em>Note: If a dedicated studio space is booked for the shoot, applicable studio rental charges will apply.</em></p>
                   </div>
 
                   <div>
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700;">2. INTELLECTUAL PROPERTY, MODEL RELEASE &amp; INTEGRITY</h4>
                     <p style="margin: 0;">The legal copyright of all visual media remains exclusively with the Studio. The Participant hereby grants the Studio the absolute, irrevocable right to use, publish, and distribute the images for portfolio, promotional, or web display. All parties are granted a non-exclusive license to use final retouched files for personal self-promotion on social media grids and personal websites.</p>
                     <p style="margin: 6px 0 0 0; font-style: italic;"><strong>No Alterations:</strong> To preserve the lighting design and capture integrity, no party shall apply secondary mobile filters, automated presets, cropping adjustments, or third-party digital modifications to the delivered files.</p>
                   </div>
 
                   <div style="border-left: 3px solid var(--accent); padding-left: 14px; background: rgba(var(--accent-rgb), 0.04);">
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700; color: #b22222;">3. COMPREHENSIVE LIABILITY WAIVER &amp; INDEMNIFICATION</h4>
                     <p style="margin: 0; font-weight: 500;">CRITICAL SAFETY &amp; LIABILITY RELEASE: The Participant enters the studio environment, uses studio blocks, cubes, chairs, furniture, or props, and performs physical poses entirely at their own risk. The Studio shall not be held liable for any physical injury, illness, accident, psychological distress, property damage, or clothing wear-and-tear incurred before, during, or after this production. The Participant explicitly waives any right to seek damages or legal recourse against the Studio or its operating photographers for accidents or injuries occurring on the premises.</p>
                     <p style="margin: 6px 0 0 0;">Furthermore, the Participant agrees to indemnify and hold harmless the Studio from any claims, damages, liabilities, or legal expenses arising out of the Participant’s conduct or injuries on set.</p>
                   </div>
 
                   <div>
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700;">4. TECHNICAL PERFORMANCE &amp; DELIVERY DISCLAIMER</h4>
                     <p style="margin: 0;">As a creative collaboration, the Studio offers no guarantees regarding the exact number of final images delivered, the specific turnaround time, or the subjective artistic satisfaction of the deliverables. The Studio retains final artistic authority over image selection and editing styles. Under no circumstances will raw unedited files (RAW format) be delivered to the Participant.</p>
                   </div>
 
                   <div>
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700;">5. MANDATORY ALL-PARTY ATTRIBUTION WORKFLOW</h4>
                     <p style="margin: 0 0 6px 0;">To ensure creative transparency, all parties agree to execute the following mandatory publishing workflow:</p>
                     <ul style="margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px;">
                       <li><strong>Instagram Collaboration Feature:</strong> For all primary feed or grid publications, the publishing party must issue an Instagram Co-Author Collaboration Invite to <strong>@thenerdyphotographer.in</strong> prior to publishing.</li>
                       <li><strong>Full Production Credits Block:</strong> Every party publishing an asset must explicitly credit all contributors in the caption. In formats where joint collaboration tools are restricted, a comprehensive credit block must be placed within the first three lines of the caption body text as follows:
                         <pre style="margin: 6px 0; background: var(--bone); padding: 8px; border-radius: 4px; font-family: monospace; font-size: 11px; white-space: pre-wrap; line-height: 1.4;">
📷 Photography &amp; Light Design: @thenerdyphotographer.in
👤 Model / Talent: @[Handle]
💄 Makeup Artist / MUA: @[Handle]
👔 Styling / Wardrobe: @[Handle]</pre>
                       </li>
                     </ul>
                   </div>
 
                   <div>
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700;">6. DIGITAL CONSENT, EMAIL ACCEPTANCE &amp; BINDING NATURE</h4>
                     <p style="margin: 0;">In accordance with standard digital contract practices, a physical or handwritten signature is not required to validate these terms. Definitive legal acceptance and a binding obligation to these conditions are established through any of the following actions:</p>
                     <ul style="margin: 6px 0 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px;">
                       <li>Sending a reply stating "I agree", "Confirmed", or equivalent confirmation over email or direct digital messaging channels.</li>
                       <li>Voluntarily entering the studio workspace environment and participating in the scheduled production session following receipt of these terms.</li>
                     </ul>
                   </div>
                 </div>
                 <div style="padding: 20px; border-top: 1px solid var(--line); display: flex; gap: 12px; justify-content: flex-end; background: var(--bone);">
                   <button type="button" class="btn btn-ghost" id="termsDeclineBtn" style="font-size: 12px; height: auto; padding: 10px 20px;">Decline</button>
                   <button type="button" class="btn btn-dark" id="termsAcceptBtn" style="font-size: 12px; height: auto; padding: 10px 20px;">Agree &amp; Continue</button>
                 </div>
               </div>
             </div>

            <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin-bottom: 24px; font-size: 11px; line-height: 1.5; color: var(--ink-soft); text-align: left;">
              <span style="font-family: var(--mono-font); font-size: 9px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Booking &amp; Collaboration Policy</span>
              Submission of a booking inquiry or TFP collaboration request does not constitute a confirmed session or a commitment to shoot. All inquiries are subject to schedule availability, creative brief alignment, and final studio review. <strong>Note: If a dedicated studio space is booked for the shoot, applicable studio rental charges will apply.</strong> Collaboration requests (TFP/Test Shoots) are selective and accepted at the sole discretion of the studio. Inquiries that are not explicitly approved by the studio will be considered inactive.
            </div>

            <button type="submit" class="btn btn-dark btn-block" id="bookSubmitBtn">Submit Booking Request</button>
            <p style="font-size: 11px; color: var(--ink-soft); margin-top: 15px; text-align: center; line-height: 1.4;">By submitting a booking request, you agree to our standard terms. For test shoots, read our online <a href="#tfp-terms" id="tfpTermsTrigger" style="text-decoration: underline; color: var(--accent); font-weight: 600;">Studio Production &amp; Liability Release</a>.</p>
          </form>
        </div>
      </section>
    `;
  }

  /* ============================================================
     §13 · VIEW WIRING — event handlers per view
     ============================================================ */
  function wireUpload(editId) {
    staged = [];
    const dz = $("#dropzone"), fi = $("#fileInput"), grid = $("#stagingGrid"), note = $("#queueNote"), pub = $("#publishBtn"), form = $("#shootForm");
    const diagInput = $("#f_diagram_file"), diagPreview = $("#diagramPreview"), diagImg = $("#f_diagram_img"), diagVisibility = $("#f_diagram_visibility"), clearDiagBtn = $("#clearDiagramBtn");
    const testimonialOnlyCheckbox = $("#f_is_testimonial_only");
    
    const mentorRow = $("#f_mentor_row");
    const typeSelect = $("#f_type");
    const updateMentorRowState = () => {
      const isTestimonialOnly = !!testimonialOnlyCheckbox?.checked;
      if (mentorRow && typeSelect) {
        mentorRow.style.display = (!isTestimonialOnly && typeSelect.value === "Workshop Attended") ? "" : "none";
      }
    };
    typeSelect?.addEventListener("change", updateMentorRowState);

    const updateTestimonialFormState = () => {
      const isTestimonialOnly = !!testimonialOnlyCheckbox?.checked;

      // Hide / show the dropzone
      if (dz) dz.style.display = isTestimonialOnly ? "none" : "";

      // Hide / show other fieldsets
      const statsFs = $("#modelStatsFieldset");
      if (statsFs) statsFs.style.display = isTestimonialOnly ? "none" : "";

      // Hide / show Credits mentor field
      updateMentorRowState();

      const lightingFs = $("#fieldsetLighting");
      if (lightingFs) lightingFs.style.display = isTestimonialOnly ? "none" : "";

      const extraTestimonialsFs = $("#extraTestimonialsFs");
      if (extraTestimonialsFs) extraTestimonialsFs.style.display = isTestimonialOnly ? "none" : "";

      // Hide / show Brand Dropdown vs Custom Text Input
      const brandSelectField = $("#f_brand_select_field");
      const brandTextField = $("#f_brand_text_field");
      if (brandSelectField) brandSelectField.style.display = isTestimonialOnly ? "none" : "";
      if (brandTextField) brandTextField.style.display = isTestimonialOnly ? "" : "none";

      const activityField = $("#f_activity_field");
      if (activityField) activityField.style.display = isTestimonialOnly ? "none" : "";

      // Change labels and descriptions
      const titleLabel = $("#f_title")?.closest(".field")?.querySelector("span");
      if (titleLabel) {
        titleLabel.textContent = isTestimonialOnly ? "Testimonial Subject / Headline *" : "Shoot title *";
      }

      const talentLabel = $("#f_talent")?.closest(".field")?.querySelector("span");
      if (talentLabel) {
        talentLabel.textContent = isTestimonialOnly ? "Client Name *" : "Model / talent (comma-separated)";
      }

      const descLabel = $("#f_desc")?.closest(".field")?.querySelector("span");
      if (descLabel) {
        descLabel.textContent = isTestimonialOnly ? "Testimonial Quote *" : "Description";
      }
    };
    testimonialOnlyCheckbox?.addEventListener("change", updateTestimonialFormState);
    updateTestimonialFormState();
    updateMentorRowState();
    let diagramDataUrl = null;

    diagInput?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (file && file.type.startsWith("image/")) {
        const raw = await readAsDataURL(file);
        diagramDataUrl = await resize(raw, 1200);
        diagImg.src = diagramDataUrl;
        diagPreview.style.display = "block";
      } else {
        diagramDataUrl = null;
        diagImg.src = "";
        diagPreview.style.display = "none";
      }
    });

    clearDiagBtn?.addEventListener("click", () => {
      diagramDataUrl = null;
      diagInput.value = "";
      diagImg.src = "";
      diagPreview.style.display = "none";
    });
    
    let editingShoot = null;
    if (editId) {
      editingShoot = SHOOTS.find(x => x.id === editId);
      if (editingShoot) {
        const pageTitle = $(".page-head h1");
        if (pageTitle) pageTitle.textContent = "Edit photoshoot details";
        const pageSub = $(".page-head .page-sub");
        if (pageSub) pageSub.textContent = `Editing: ${editingShoot.title}`;
        pub.textContent = "Save changes";
        
        if (editingShoot.isTestimonial) {
          if (testimonialOnlyCheckbox) testimonialOnlyCheckbox.checked = true;
          $("#f_brand_text").value = editingShoot.brand || "";
        } else {
          if (testimonialOnlyCheckbox) testimonialOnlyCheckbox.checked = false;
          $("#f_brand").value = editingShoot.brand || "Other";
        }
        updateTestimonialFormState();

        $("#f_title").value = editingShoot.title || "";
        $("#f_activity").value = editingShoot.activity || "";
        $("#f_type").value = editingShoot.type || "";
        $("#f_season").value = editingShoot.season || "";
        $("#f_photographer").value = editingShoot.photographer || "nerdyphotographer";
        $("#f_ad").value = editingShoot.artDirector || "";
        $("#f_stylist").value = editingShoot.stylist || "";
        $("#f_hair").value = editingShoot.hair || "";
        $("#f_mua").value = editingShoot.mua || "";
        if ($("#f_video")) $("#f_video").value = editingShoot.videographer || "";
        $("#f_talent").value = editingShoot.talent || "";
        $("#f_location").value = editingShoot.location || "";
        $("#f_desc").value = editingShoot.description || "";
        $("#f_tags").value = editingShoot.tags || "";
        $("#f_gear").value = editingShoot.gear || "";
        $("#f_client").value = editingShoot.client || "";
        $("#f_height").value = editingShoot.height || "";
        $("#f_chest").value = editingShoot.chest || "";
        $("#f_waist").value = editingShoot.waist || "";
        $("#f_hips").value = editingShoot.hips || "";
        $("#f_shoes").value = editingShoot.shoes || "";
        $("#f_model_hair").value = editingShoot.modelHair || "";
        $("#f_model_eyes").value = editingShoot.modelEyes || "";
        if ($("#f_show_stats_comp")) $("#f_show_stats_comp").checked = (editingShoot.showStatsOnCompCard !== false);
        if ($("#f_show_stats_port")) $("#f_show_stats_port").checked = (editingShoot.showStatsOnModelPortfolio !== false);
        if ($("#f_show_test_shoot_cat")) $("#f_show_test_shoot_cat").checked = !!editingShoot.showTestShootCategory;
        if ($("#f_mentor")) $("#f_mentor").value = editingShoot.mentor || "";
        updateMentorRowState();
        const toIsoDate = (dStr) => {
          if (!dStr) return "";
          if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return dStr;
          const t = Date.parse(dStr);
          if (isNaN(t)) return "";
          const d = new Date(t);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          return `${y}-${m}-01`;
        };
        $("#f_date").value = toIsoDate(editingShoot.date);
        $("#f_ig").value = editingShoot.instagram || "";
        $("#f_kavyar").value = editingShoot.kavyar || "";
        $("#f_link").value = editingShoot.link || "";
        $("#f_rights").value = editingShoot.rights || "";
        
        const testimonials = editingShoot.testimonials || (editingShoot.testimonial ? [editingShoot.testimonial] : []);
        if (testimonials[0]) {
          $("#f_quote_1").value = testimonials[0].quote || "";
          $("#f_quoteby_1").value = testimonials[0].by || "";
        }
        if (testimonials[1]) {
          $("#f_quote_2").value = testimonials[1].quote || "";
          $("#f_quoteby_2").value = testimonials[1].by || "";
        }
        if (testimonials[2]) {
          $("#f_quote_3").value = testimonials[2].quote || "";
          $("#f_quoteby_3").value = testimonials[2].by || "";
        }

        if (editingShoot.lightingDiagram) {
          diagramDataUrl = editingShoot.lightingDiagram;
          diagImg.src = diagramDataUrl;
          diagPreview.style.display = "block";
        }
        if (editingShoot.lightingDiagramVisibility) {
          diagVisibility.value = editingShoot.lightingDiagramVisibility;
        }
        const featInput = $("#f_featured");
        if (featInput) {
          featInput.checked = !!editingShoot.featured;
        }
        const hideCompcardInput = $("#f_hide_compcard");
        if (hideCompcardInput) {
          hideCompcardInput.checked = !!editingShoot.hideFromCompCard;
        }
        const disableDownloadInput = $("#f_disable_download");
        if (disableDownloadInput) {
          disableDownloadInput.checked = !!editingShoot.disableCompCardDownload;
        }
        
        staged = editingShoot.photos.map(p => {
          const isCover = editingShoot.coverPhotoId ? (p.id.split("-")[0] === editingShoot.coverPhotoId) : false;
          let pos = p.objectPosition || (isCover ? "top" : "center");
          if (isCover && pos === "center") pos = "top";
          return {
            id: p.id.split("-")[0],
            dataUrl: p.dataUrl,
            url: p.url,
            name: "Existing Frame",
            objectPosition: pos,
            isCover,
            manuallyAligned: !!(p.objectPosition && p.objectPosition !== "center"),
            caption: p.caption || "",
            excludeFromCompCard: !!p.excludeFromCompCard,
            usage: p.usage || (p.excludeFromCompCard ? "portfolio" : "both"),
            angle: p.angle || "",
            ...(typeof p.focalX === "number" ? { focalX: p.focalX, focalY: p.focalY } : {})
          };
        });
        if (staged.length && !staged.some(x => x.isCover)) {
          staged[0].isCover = true;
          if (!staged[0].manuallyAligned) staged[0].objectPosition = "top";
        }
      }
    }
    async function ingest(files) {
      const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (!imgs.length) { toast("Those weren't images — try JPG, PNG or WEBP."); return; }
      for (const f of imgs) {
        const raw = await readAsDataURL(f);
        staged.push({
          id: uid(),
          dataUrl: await resize(raw),
          name: f.name,
          objectPosition: staged.length === 0 ? "top" : "center",
          isCover: staged.length === 0,
          manuallyAligned: false,
          // New uploads default to the comp-card page only; the admin
          // opts photos into Portfolio (or Both) manually per photo.
          usage: "comp",
          excludeFromCompCard: false
        });
      }
      renderStaged();
    }
    function renderStaged() {
      const n = staged.length; pub.disabled = n === 0;
      note.textContent = n ? `${n} photo${n > 1 ? "s" : ""} ready — drag to reorder, drag the dot to set focus.` : "No photos staged yet.";
      note.classList.toggle("ready", n > 0);
      grid.innerHTML = staged.map((f, index) => {
        const pos = f.objectPosition && f.objectPosition !== "center" ? f.objectPosition : "center center";
        const fp = focalPercent(f);
        return `
        <div class="thumb" data-id="${f.id}" draggable="true" style="display: flex; flex-direction: column;">
          <span class="thumb-order">${index + 1}</span>
          <label class="thumb-cover-ctrl">
            <input type="radio" name="coverSelect" class="thumb-cover-radio" data-id="${f.id}" ${f.isCover ? 'checked' : ''} />
            Cover
          </label>
          <div style="position: relative; width: 100%; aspect-ratio: 1; overflow: hidden;">
            <img src="${esc(photoSrc(f))}" style="width: 100%; height: 100%; object-fit: cover; object-position: ${esc(pos)}" alt="${esc(f.name)}"/>
            <div class="thumb-focal" data-id="${f.id}" title="Drag to set focal point" style="position: absolute; inset: 0; z-index: 2; cursor: crosshair;">
              <span class="thumb-focal-dot" style="left:${fp.x}%; top:${fp.y}%;"></span>
            </div>
            <button type="button" class="thumb-remove" data-id="${f.id}" aria-label="Remove">×</button>
          </div>
          
          <div style="padding: 8px; display: flex; flex-direction: column; gap: 6px; background: var(--bone); border-top: 1px solid var(--line); flex-grow: 1;">
            <input type="text" class="thumb-caption-input" data-id="${f.id}" value="${esc(f.caption || '')}" placeholder="Add caption…" style="width: 100%; box-sizing: border-box; font-size: 10px; padding: 4px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); outline: none;" />
            
            <div style="display: grid; grid-template-columns: 1fr; gap: 4px;">
              <label style="font-size: 9px; color: var(--ink-soft); display: flex; flex-direction: column; gap: 2px;">
                <span>Usage</span>
                <select class="thumb-usage-select" data-id="${f.id}" style="font-size: 9px; padding: 2px 4px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); width: 100%;">
                  <option value="both" ${f.usage === 'both' ? 'selected' : ''}>Both (Comp & Port)</option>
                  <option value="portfolio" ${f.usage === 'portfolio' ? 'selected' : ''}>Portfolio Only</option>
                  <option value="comp" ${f.usage === 'comp' ? 'selected' : ''}>Comp Card Only</option>
                </select>
              </label>
              <label style="font-size: 9px; color: var(--ink-soft); display: flex; flex-direction: column; gap: 2px;">
                <span>Angle / Profile</span>
                <select class="thumb-angle-select" data-id="${f.id}" style="font-size: 9px; padding: 2px 4px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); width: 100%;">
                  <option value="" ${!f.angle ? 'selected' : ''}>Unspecified</option>
                  <option value="front" ${f.angle === 'front' ? 'selected' : ''}>Front Portrait</option>
                  <option value="side" ${f.angle === 'side' ? 'selected' : ''}>Side Profile</option>
                  <option value="back" ${f.angle === 'back' ? 'selected' : ''}>Back Angle</option>
                  <option value="three-quarter" ${f.angle === 'three-quarter' ? 'selected' : ''}>3/4 Angle</option>
                  <option value="close-up" ${f.angle === 'close-up' ? 'selected' : ''}>Close-up / Headshot</option>
                </select>
              </label>
            </div>
          </div>
        </div>`;
      }).join("");

      wireDragReorder();
      wireFocalPoints();

      grid.querySelectorAll(".thumb-caption-input").forEach((inp) => {
        inp.addEventListener("input", (e) => {
          const item = staged.find(x => x.id === e.target.dataset.id);
          if (item) item.caption = e.target.value;
        });
        inp.addEventListener("mousedown", (e) => e.stopPropagation());
      });

      grid.querySelectorAll(".thumb-usage-select").forEach((sel) => {
        sel.addEventListener("change", (e) => {
          const item = staged.find(x => x.id === e.target.dataset.id);
          if (item) {
            item.usage = e.target.value;
            // Maintain backwards compatibility:
            item.excludeFromCompCard = (e.target.value === "portfolio");
          }
        });
        sel.addEventListener("mousedown", (e) => e.stopPropagation());
      });

      grid.querySelectorAll(".thumb-angle-select").forEach((sel) => {
        sel.addEventListener("change", (e) => {
          const item = staged.find(x => x.id === e.target.dataset.id);
          if (item) item.angle = e.target.value;
        });
        sel.addEventListener("mousedown", (e) => e.stopPropagation());
      });

      grid.querySelectorAll(".thumb-remove").forEach((b) => b.addEventListener("click", (e) => {
        e.stopPropagation();
        const removedWasCover = staged.find(x => x.id === b.dataset.id)?.isCover;
        staged = staged.filter((x) => x.id !== b.dataset.id);
        if (removedWasCover && staged.length) {
          staged[0].isCover = true;
          if (!staged[0].manuallyAligned) staged[0].objectPosition = "top";
        }
        renderStaged();
      }));
      grid.querySelectorAll(".thumb-cover-radio").forEach((radio) => {
        radio.addEventListener("change", (e) => {
          const id = e.target.dataset.id;
          staged.forEach(x => { x.isCover = (x.id === id); });
          renderStaged();
        });
      });
    }

    // Convert a photo's focal setting into { x, y } percentages for the dot.
    function focalPercent(f) {
      if (typeof f.focalX === "number" && typeof f.focalY === "number") {
        return { x: Math.round(f.focalX), y: Math.round(f.focalY) };
      }
      const map = { "top": [50, 0], "bottom": [50, 100], "left": [0, 50], "right": [100, 50] };
      const key = (f.objectPosition || "center").split(" ")[0];
      const [x, y] = map[key] || [50, 50];
      return { x, y };
    }

    // Drag-and-drop reordering of staged thumbnails.
    let dragId = null;
    function wireDragReorder() {
      grid.querySelectorAll(".thumb").forEach((el) => {
        el.addEventListener("dragstart", (e) => {
          dragId = el.dataset.id;
          el.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          try { e.dataTransfer.setData("text/plain", dragId); } catch {}
        });
        el.addEventListener("dragend", () => { el.classList.remove("dragging"); dragId = null; grid.querySelectorAll(".thumb").forEach(t => t.classList.remove("drop-target")); });
        el.addEventListener("dragover", (e) => {
          e.preventDefault();
          if (!dragId || el.dataset.id === dragId) return;
          el.classList.add("drop-target");
          e.dataTransfer.dropEffect = "move";
        });
        el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
        el.addEventListener("drop", (e) => {
          e.preventDefault(); e.stopPropagation();
          const from = staged.findIndex(x => x.id === dragId);
          const to = staged.findIndex(x => x.id === el.dataset.id);
          if (from < 0 || to < 0 || from === to) return;
          const [moved] = staged.splice(from, 1);
          staged.splice(to, 0, moved);
          renderStaged();
        });
      });
    }

    // Drag a focal point directly on each thumbnail to set object-position.
    function wireFocalPoints() {
      grid.querySelectorAll(".thumb-focal").forEach((area) => {
        const item = staged.find(x => x.id === area.dataset.id);
        if (!item) return;
        const dot = area.querySelector(".thumb-focal-dot");
        const img = area.parentElement.querySelector("img");
        let dragging = false;
        const setFromEvent = (clientX, clientY) => {
          const r = area.getBoundingClientRect();
          const x = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
          const y = Math.max(0, Math.min(100, ((clientY - r.top) / r.height) * 100));
          item.focalX = x; item.focalY = y;
          item.objectPosition = `${x.toFixed(1)}% ${y.toFixed(1)}%`;
          item.manuallyAligned = true;
          dot.style.left = x + "%"; dot.style.top = y + "%";
          if (img) img.style.objectPosition = item.objectPosition;
        };
        dot.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); dragging = true; area.classList.add("focal-active"); });
        area.addEventListener("click", (e) => { if (e.target === area) setFromEvent(e.clientX, e.clientY); });
        window.addEventListener("mousemove", (e) => { if (dragging) setFromEvent(e.clientX, e.clientY); });
        window.addEventListener("mouseup", () => { if (dragging) { dragging = false; area.classList.remove("focal-active"); } });
        // Prevent the thumb's HTML5 drag from starting when adjusting focus.
        area.addEventListener("dragstart", (e) => e.preventDefault());
      });
    }

    dz.addEventListener("click", (e) => { if (!e.target.closest(".thumb")) fi.click(); });
    dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fi.click(); } });
    fi.addEventListener("change", (e) => { ingest(e.target.files); fi.value = ""; });
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-drag"); }));
    ["dragleave", "dragend", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-drag"); }));
    dz.addEventListener("drop", (e) => { if (e.dataTransfer?.files?.length) ingest(e.dataTransfer.files); });
    const igInput = $("#f_ig");
    const igVerify = $("#f_ig_verify");
    let clickedVerify = false;
    igVerify?.addEventListener("click", (e) => {
      if (e.target.closest("a")) clickedVerify = true;
    });
    function updateIgVerify() {
      if (!igInput || !igVerify) return;
      const val = igInput.value.trim();
      if (!val) {
        igVerify.style.display = "none";
        igVerify.innerHTML = "";
        return;
      }
      const handles = val.split(",").map(parseIgHandle).filter(Boolean);
      if (handles.length === 0) {
        igVerify.style.display = "none";
        igVerify.innerHTML = "";
        return;
      }
      const linksHtml = handles.map(username => {
        return `<a href="https://instagram.com/${encodeURIComponent(username)}" target="_blank" rel="noopener" style="color:var(--accent); font-weight:600; text-decoration:underline; display:inline-flex; align-items:center; gap:2px; margin-right:12px;">@${esc(username)} ↗</a>`;
      }).join("");
      igVerify.innerHTML = `<span style="color:var(--ink-soft); font-family:'JetBrains Mono', monospace; font-size:10px; margin-right:6px; text-transform:uppercase;">Verify links:</span> ${linksHtml}`;
      igVerify.style.display = "block";
    }

    setTimeout(updateIgVerify, 50);

    igInput?.addEventListener("input", updateIgVerify);
    igInput?.addEventListener("blur", () => {
      let val = igInput.value.trim();
      if (val) {
        const cleaned = val.split(",").map(h => {
          const parsed = parseIgHandle(h);
          return parsed ? `@${parsed}` : "";
        }).filter(Boolean).join(", ");
        igInput.value = cleaned;
      }
      updateIgVerify();
    });

    const kavyarInput = $("#f_kavyar");
    const kavyarVerify = $("#f_kavyar_verify");
    let clickedKavyarVerify = false;
    kavyarVerify?.addEventListener("click", (e) => {
      if (e.target.closest("a")) clickedKavyarVerify = true;
    });
    function updateKavyarVerify() {
      if (!kavyarInput || !kavyarVerify) return;
      const val = kavyarInput.value.trim();
      if (!val) {
        kavyarVerify.style.display = "none";
        kavyarVerify.innerHTML = "";
        return;
      }
      const links = val.split(",").map(parseKavyarLink).filter(Boolean);
      if (links.length === 0) {
        kavyarVerify.style.display = "none";
        kavyarVerify.innerHTML = "";
        return;
      }
      const linksHtml = links.map(url => {
        const username = url.split("/").pop();
        return `<a href="${esc(url)}" target="_blank" rel="noopener" style="color:var(--accent); font-weight:600; text-decoration:underline; display:inline-flex; align-items:center; gap:2px; margin-right:12px;">Kavyar: ${esc(username)} ↗</a>`;
      }).join("");
      kavyarVerify.innerHTML = `<span style="color:var(--ink-soft); font-family:'JetBrains Mono', monospace; font-size:10px; margin-right:6px; text-transform:uppercase;">Verify links:</span> ${linksHtml}`;
      kavyarVerify.style.display = "block";
    }

    setTimeout(updateKavyarVerify, 50);

    kavyarInput?.addEventListener("input", updateKavyarVerify);
    kavyarInput?.addEventListener("blur", () => {
      let val = kavyarInput.value.trim();
      if (val) {
        const cleaned = val.split(",").map(h => {
          const parsed = parseKavyarLink(h);
          return parsed;
        }).filter(Boolean).join(", ");
        kavyarInput.value = cleaned;
      }
      updateKavyarVerify();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const val = (id) => $("#" + id)?.value.trim();
      const igVal = val("f_ig");
      const originalIg = editingShoot ? (editingShoot.instagram || "") : "";
      if (igVal && igVal !== originalIg && !clickedVerify) {
        const proceed = confirm("You haven't tested the new Instagram links. Would you like to proceed and publish anyway?");
        if (!proceed) return;
      }
      const kavyarVal = val("f_kavyar");
      const originalKavyar = editingShoot ? (editingShoot.kavyar || "") : "";
      if (kavyarVal && kavyarVal !== originalKavyar && !clickedKavyarVerify) {
        const proceed = confirm("You haven't tested the new Kavyar links. Would you like to proceed and publish anyway?");
        if (!proceed) return;
      }
      const isTestimonialOnly = !!$("#f_is_testimonial_only")?.checked;
      if (isTestimonialOnly) {
        if (!val("f_title")) { toast("Testimonial Subject / Headline is required."); return; }
        if (!val("f_talent")) { toast("Client Name is required."); return; }
        if (!val("f_desc")) { toast("Testimonial Quote is required."); return; }
      } else {
        if (!staged.length) { toast("Add at least one photo first."); return; }
      }
      
      const testimonialsList = isTestimonialOnly ? [] : [
        val("f_quote_1") ? { quote: val("f_quote_1"), by: val("f_quoteby_1") || "Client" } : null,
        val("f_quote_2") ? { quote: val("f_quote_2"), by: val("f_quoteby_2") || "Client" } : null,
        val("f_quote_3") ? { quote: val("f_quote_3"), by: val("f_quoteby_3") || "Client" } : null,
      ].filter(Boolean);

      const coverItem = staged.find(x => x.isCover) || staged[0];
      let pColors = editingShoot ? editingShoot.palette : ["#3a3a3a", "#0d0d0d"];
      if (coverItem && !isTestimonialOnly) {
        pColors = await extractPalette(photoSrc(coverItem));
      }
      let dateVal = val("f_date");
      if (!dateVal) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        dateVal = `${y}-${m}-01`;
      }
      const shoot = {
        id: editingShoot ? editingShoot.id : uid(),
        createdAt: editingShoot ? editingShoot.createdAt : Date.now(),
        isTestimonial: isTestimonialOnly,
        title: val("f_title") || "Untitled",
        brand: isTestimonialOnly ? val("f_brand_text") : (val("f_brand") || "Other"),
        activity: isTestimonialOnly ? "Testimonial" : $("#f_activity").value,
        type: isTestimonialOnly ? "Testimonial" : $("#f_type").value,
        season: val("f_season"),
        photographer: isTestimonialOnly ? "" : (val("f_photographer") || "Studio"),
        artDirector: isTestimonialOnly ? "" : val("f_ad"),
        stylist: isTestimonialOnly ? "" : (val("f_stylist") || "—"),
        hair: isTestimonialOnly ? "" : (val("f_hair") || "—"),
        mua: isTestimonialOnly ? "" : (val("f_mua") || "—"),
        videographer: isTestimonialOnly ? "" : (val("f_video") || "—"),
        talent: val("f_talent"),
        location: isTestimonialOnly ? "" : val("f_location"),
        height: isTestimonialOnly ? "" : val("f_height"),
        chest: isTestimonialOnly ? "" : val("f_chest"),
        waist: isTestimonialOnly ? "" : val("f_waist"),
        hips: isTestimonialOnly ? "" : val("f_hips"),
        shoes: isTestimonialOnly ? "" : val("f_shoes"),
        modelHair: isTestimonialOnly ? "" : val("f_model_hair"),
        modelEyes: isTestimonialOnly ? "" : val("f_model_eyes"),
        showStatsOnCompCard: isTestimonialOnly ? true : ($("#f_show_stats_comp") ? $("#f_show_stats_comp").checked : true),
        showStatsOnModelPortfolio: isTestimonialOnly ? true : ($("#f_show_stats_port") ? $("#f_show_stats_port").checked : true),
        showTestShootCategory: isTestimonialOnly ? false : ($("#f_show_test_shoot_cat") ? $("#f_show_test_shoot_cat").checked : false),
        mentor: isTestimonialOnly ? "" : val("f_mentor"),
        description: val("f_desc"),
        tags: isTestimonialOnly ? "" : val("f_tags"),
        gear: isTestimonialOnly ? "" : val("f_gear"),
        client: isTestimonialOnly ? "" : val("f_client"),
        date: dateVal,
        instagram: val("f_ig"),
        kavyar: val("f_kavyar"),
        link: val("f_link"),
        rights: isTestimonialOnly ? "" : val("f_rights"),
        testimonials: testimonialsList,
        lightingDiagram: isTestimonialOnly ? null : diagramDataUrl,
        lightingDiagramVisibility: isTestimonialOnly ? "disabled" : $("#f_diagram_visibility").value,
        palette: pColors,
        photos: isTestimonialOnly ? [] : staged.map((f, i) => ({
          id: f.id + "-" + i,
          dataUrl: f.dataUrl,
          url: f.url,
          objectPosition: f.objectPosition || (f.isCover ? "top" : "center"),
          excludeFromCompCard: !!f.excludeFromCompCard,
          usage: f.usage || (f.excludeFromCompCard ? "portfolio" : "both"),
          angle: f.angle || "",
          ...(typeof f.focalX === "number" ? { focalX: f.focalX, focalY: f.focalY } : {}),
          ...(f.caption && f.caption.trim() ? { caption: f.caption.trim() } : {})
        })),
        featured: isTestimonialOnly ? false : ($("#f_featured") ? $("#f_featured").checked : false),
        hideFromCompCard: $("#f_hide_compcard") ? $("#f_hide_compcard").checked : false,
        disableCompCardDownload: $("#f_disable_download") ? $("#f_disable_download").checked : false,
        coverPhotoId: isTestimonialOnly ? null : (coverItem ? coverItem.id : null),
      };
      pub.disabled = true; pub.textContent = editingShoot ? "Saving changes…" : "Publishing…";
      await putShoot(shoot);
      await loadShoots();
      toast(editingShoot ? `Saved changes to “${shoot.title}”.` : `Published “${shoot.title}” — ${staged.length} frame${staged.length > 1 ? "s" : ""}.`);
      staged = [];
      history.pushState(null, "", "/"); render();
      await syncToGitHub(SHOOTS);
    });
    renderStaged();
  }

  function wireBook() {
    const form = $("#bookingForm"), btn = $("#bookSubmitBtn");
    if (!form) return;
    const successPanel = $("#bookSuccess");
    const studioEmail = window.STUDIO_CONFIG?.email || "prateeksaxenaphotography@gmail.com";

    const val = (id) => $("#" + id)?.value.trim() || "";
    const fieldOf = (id) => $("#" + id)?.closest(".field");

    // Inline validation: mark a field invalid + show a message under it.
    function setError(id, msg) {
      const field = fieldOf(id);
      if (!field) return;
      field.classList.add("field-invalid");
      let note = field.querySelector(".field-error");
      if (!note) {
        note = document.createElement("span");
        note.className = "field-error";
        field.appendChild(note);
      }
      note.textContent = msg;
    }
    function clearError(id) {
      const field = fieldOf(id);
      if (!field) return;
      field.classList.remove("field-invalid");
      field.querySelector(".field-error")?.remove();
    }
    // Clear an error the moment the visitor starts fixing it.
    ["b_name", "b_email", "b_date", "b_instagram", "b_location"].forEach((id) => {
      $("#" + id)?.addEventListener("input", () => clearError(id));
    });

    // Dynamic field update logic
    const updateFields = () => {
      const type = $("#b_type")?.value;
      const role = $("#b_role")?.value;
      const budgetField = $("#b_budget_field");
      const brandOpt = $("#b_role")?.querySelector('option[value="Brand"]');
      const igLabel = $("#b_instagram_label");

      if (igLabel) {
        igLabel.innerHTML = (type === "Test Shoot" ? "Instagram / Website *" : "Instagram / Website");
      }

      if (btn) {
        btn.textContent = (type === "Test Shoot" ? "Request for a Test Shoot" : "Submit Booking Request");
      }

      if (type === "Test Shoot") {
        if (budgetField) budgetField.style.display = "none";
        if (brandOpt) {
          brandOpt.disabled = true;
          if ($("#b_role").value === "Brand") {
            $("#b_role").value = "Model";
          }
        }
      } else {
        if (budgetField) budgetField.style.display = "";
        if (brandOpt) brandOpt.disabled = false;
      }

      if (role === "Brand") {
        const testShootOpt = $("#b_type")?.querySelector('option[value="Test Shoot"]');
        if (testShootOpt) {
          testShootOpt.disabled = true;
          if ($("#b_type").value === "Test Shoot") {
            $("#b_type").value = "Fashion Editorial";
          }
        }
      } else {
        const testShootOpt = $("#b_type")?.querySelector('option[value="Test Shoot"]');
        if (testShootOpt) testShootOpt.disabled = false;
      }
    };

    $("#b_type")?.addEventListener("change", updateFields);
    $("#b_role")?.addEventListener("change", updateFields);
    updateFields();



    function validate() {
      let firstBad = null;
      const require = (id, msg) => {
        if (!val(id)) { setError(id, msg); firstBad = firstBad || id; }
        else clearError(id);
      };
      require("b_name", "Please add your name or brand.");
      require("b_date", "Let us know a rough date or timeline.");
      require("b_location", "Please let us know your preferred location.");
      const email = val("b_email");
      if (!email) { setError("b_email", "We need an email to reply to."); firstBad = firstBad || "b_email"; }
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("b_email", "That email doesn't look right."); firstBad = firstBad || "b_email"; }
      else clearError("b_email");

      const type = $("#b_type")?.value;
      if (type === "Test Shoot") {
        if (!val("b_instagram")) {
          setError("b_instagram", "Instagram / Website is mandatory for test shoots.");
          firstBad = firstBad || "b_instagram";
        } else {
          clearError("b_instagram");
        }
      }
      return firstBad;
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const firstBad = validate();
      if (firstBad) {
        const el = $("#" + firstBad);
        el?.focus();
        el?.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "center" });
        return;
      }

      const name = val("b_name"), role = val("b_role"), email = val("b_email");
      const phone = val("b_phone"), instagram = val("b_instagram"), type = val("b_type");
      const date = val("b_date"), locationVal = val("b_location"), budget = (type === "Test Shoot" ? "Collab / TFP (No Budget)" : val("b_budget"));
      const moodboard = val("b_moodboard"), concept = val("b_concept");

      const proceedSubmit = (agreedToTerms = false) => {
        btn.disabled = true;
        btn.classList.add("is-loading");
        btn.textContent = "Sending your request…";

        const tfpReleaseText = agreedToTerms ? (
          `\n\n==================================================\n` +
          `STUDIO PRODUCTION & LIABILITY RELEASE\n` +
          `TFP COLLABORATION, MODEL RELEASE & DIGITAL CONSENT TERMS\n` +
          `Document Reference: TFP-LIABILITY-RELEASE-V3\n` +
          `--------------------------------------------------\n` +
          `Studio/Photographer: nerdyphotographer.in studios\n` +
          `Creative Partner/Model: ${name}\n` +
          `Business Handle: @thenerdyphotographer.in\n` +
          `Consent Tracking: Verified via Email / Digital Acknowledgment\n` +
          `Production Status: Time-For-Print (TFP) Collab\n` +
          `Location: Studio Production Space\n` +
          `--------------------------------------------------\n\n` +
          `1. SCOPE OF CREATIVE COLLABORATION\n` +
          `This session is scheduled as a peer-to-peer creative collaboration structured for mutual portfolio growth, asset curation, and personal branding advancement. No monetary compensation is required or exchanged. The Studio provides specialized equipment, lighting architecture, workspace, and post-production engineering; the Participant(s) provide technical modeling direction, personal wardrobe, and makeup artistry.\n\n` +
          `2. INTELLECTUAL PROPERTY, MODEL RELEASE & INTEGRITY\n` +
          `The legal copyright of all visual media remains exclusively with the Studio. The Participant hereby grants the Studio the absolute, irrevocable right to use, publish, and distribute the images for portfolio, promotional, or web display. All parties are granted a non-exclusive license to use final retouched files for personal self-promotion on social media grids and personal websites.\n` +
          `* No Alterations: To preserve the lighting design and capture integrity, no party shall apply secondary mobile filters, automated presets, cropping adjustments, or third-party digital modifications to the delivered files.\n\n` +
          `3. COMPREHENSIVE LIABILITY WAIVER & INDEMNIFICATION\n` +
          `CRITICAL SAFETY & LIABILITY RELEASE: The Participant enters the studio environment, uses studio blocks, cubes, chairs, furniture, or props, and performs physical poses entirely at their own risk. The Studio shall not be held liable for any physical injury, illness, accident, psychological distress, property damage, or clothing wear-and-tear incurred before, during, or after this production. The Participant explicitly waives any right to seek damages or legal recourse against the Studio or its operating photographers for accidents or injuries occurring on the premises.\n` +
          `Furthermore, the Participant agrees to indemnify and hold harmless the Studio from any claims, damages, liabilities, or legal expenses arising out of the Participant's conduct or injuries on set.\n\n` +
          `4. TECHNICAL PERFORMANCE & DELIVERY DISCLAIMER\n` +
          `As a creative collaboration, the Studio offers no guarantees regarding the exact number of final images delivered, the specific turnaround time, or the subjective artistic satisfaction of the deliverables. The Studio retains final artistic authority over image selection and editing styles. Under no circumstances will raw unedited files (RAW format) be delivered to the Participant.\n\n` +
          `5. MANDATORY ALL-PARTY ATTRIBUTION WORKFLOW\n` +
          `To ensure creative transparency, all parties agree to execute the following mandatory publishing workflow:\n` +
          `• Instagram Collaboration Feature: For all primary feed or grid publications, the publishing party must issue an Instagram Co-Author Collaboration Invite to @thenerdyphotographer.in prior to publishing.\n` +
          `• Full Production Credits Block: Every party publishing an asset must explicitly credit all contributors in the caption:\n` +
          `  📷 Photography & Light Design: @thenerdyphotographer.in\n` +
          `  👤 Model / Talent: @[Handle]\n` +
          `  💄 Makeup Artist / MUA: @[Handle]\n` +
          `  👔 Styling / Wardrobe: @[Handle]\n\n` +
          `6. DIGITAL CONSENT, EMAIL ACCEPTANCE & BINDING NATURE\n` +
          `In accordance with standard digital contract practices, a physical or handwritten signature is not required to validate these terms. Definitive legal acceptance and a binding obligation to these conditions are established through any of the following actions:\n` +
          `• Sending a reply stating "I agree", "Confirmed", or equivalent confirmation over email or direct digital messaging channels.\n` +
          `• Voluntarily entering the studio workspace environment and participating in the scheduled production session following receipt of these terms.\n\n` +
          `nerdyphotographer.in studios\n` +
          `Digital Operations & Production Management\n` +
          `--------------------------------------------------\n` +
          `DIGITAL AGREEMENT SIGNED: The Participant (${name}) has read and agreed to the terms of the Studio Production & Liability Release (TFP-LIABILITY-RELEASE-V3) by submitting this booking request.\n` +
          `==================================================`
        ) : "";

        // One canonical inquiry body — the copy-paste block gets the full
        // version (release text included). The mailto/Gmail/Outlook links get
        // a COMPACT body without the release: embedding the full release used
        // to blow past browser URL length limits, so for test shoots the mail
        // app silently refused to open at all.
        const compactBody =
          `Shoot Booking Details:\n\n` +
          `Name: ${name}\n` +
          `Role: ${role}\n` +
          `Email: ${email}\n` +
          `Phone: ${phone || '—'}\n` +
          `Instagram / Website: ${instagram || '—'}\n` +
          `Shoot Type: ${type}\n` +
          `Proposed Date: ${date}\n` +
          `Location Pref: ${locationVal}\n` +
          `Budget Range: ${budget}\n` +
          `Moodboard Link: ${moodboard || '—'}\n` +
          (agreedToTerms ? `TFP Release terms: Agreed (TFP-LIABILITY-RELEASE-V3)\nRead online: https://www.nerdyphotographer.in/book/#tfp-terms\n\n` : `\n`) +
          `Concept/Vision:\n${concept || '—'}`;
        const inquiryBody = compactBody + tfpReleaseText;
        const plainTextBody = `To: ${studioEmail}\nSubject: Shoot Booking Request — ${name}\n\n` + inquiryBody;

        const subject = encodeURIComponent(`Shoot Booking Request — ${name}`);
        const body = encodeURIComponent(compactBody);

        const mailtoUrl = `mailto:${studioEmail}?subject=${subject}&body=${body}`;
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(studioEmail)}&su=${subject}&body=${body}`;
        const outlookUrl = `https://outlook.live.com/default.aspx?rru=compose&to=${encodeURIComponent(studioEmail)}&subject=${subject}&body=${body}`;

        // Populate manual link and copy block
        const mailtoLink = $("#bookMailtoLink");
        if (mailtoLink) mailtoLink.href = mailtoUrl;

        const gmailLink = $("#bookGmailLink");
        if (gmailLink) gmailLink.href = gmailUrl;

        const outlookLink = $("#bookOutlookLink");
        if (outlookLink) outlookLink.href = outlookUrl;

        const previewText = $("#inquiryTextPreview");
        if (previewText) previewText.textContent = plainTextBody;

        // Reveal the in-page success state with the right message for how
        // the inquiry actually went out (direct send vs. visitor's mail app).
        const showSuccess = (sentDirectly) => {
          if (successPanel) {
            form.hidden = true;
            successPanel.hidden = false;
            const msgEl = $("#bookSuccessMsg");
            if (msgEl) {
              if (sentDirectly) {
                msgEl.innerHTML = `<strong style="color: var(--accent);">Request sent!</strong> Your booking inquiry has been delivered straight to the studio — no further action needed. We'll reply to <strong>${esc(email)}</strong>.` +
                  (agreedToTerms ? `<br/><br/><strong style="color: var(--accent);">Release Agreed:</strong> Your acceptance of the <em>Studio Production &amp; Liability Release</em> (TFP-LIABILITY-RELEASE-V3) was recorded with the request.` : "") +
                  `<br/><br/><span style="opacity: 0.8;">Want a copy for your own records? The buttons below open the same inquiry in your email app.</span>`;
              } else if (agreedToTerms) {
                msgEl.innerHTML = `Your booking inquiry is ready in your email app — please hit <strong>Send</strong> in your mail client to complete the request. <br/><br/><strong style="color: var(--accent);">Release Agreed:</strong> Your acceptance of the <em>Studio Production &amp; Liability Release</em> is noted in the email; the full terms text is included in the copy block below for your records.`;
              } else {
                msgEl.innerHTML = `Your booking inquiry is ready in your email app — please hit <strong>Send</strong> in your mail client to complete the request.`;
              }
            }
            successPanel.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "center" });
          }
          btn.disabled = false;
          btn.classList.remove("is-loading");
          btn.textContent = "Submit Booking Request";
        };

        // Deliver the inquiry directly to the studio inbox via FormSubmit
        // (free relay — needs a one-time activation click in the studio's
        // email the first time it's used). If the relay is unreachable or
        // rejects, fall back to opening the visitor's mail app pre-filled.
        const relayFields = {
          _subject: `Shoot Booking Request — ${name}`,
          _replyto: email,
          _template: "box",
          "Name": name,
          "Role": role,
          "Email": email,
          "Phone": phone || "—",
          "Instagram / Website": instagram || "—",
          "Shoot Type": type,
          "Proposed Date": date,
          "Location Pref": locationVal,
          "Budget Range": budget,
          "Moodboard Link": moodboard || "—",
          "Concept / Vision": concept || "—",
          "TFP Release": agreedToTerms ? "AGREED — TFP-LIABILITY-RELEASE-V3 (full text below)" : "Not applicable",
        };
        if (agreedToTerms) relayFields["Release Full Text"] = tfpReleaseText.trim();

        fetch(`https://formsubmit.co/ajax/${encodeURIComponent(studioEmail)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(relayFields),
          signal: (typeof AbortSignal !== "undefined" && AbortSignal.timeout) ? AbortSignal.timeout(12000) : undefined,
        })
          .then((res) => { if (!res.ok) throw new Error(`relay ${res.status}`); return res.json(); })
          .then((j) => {
            if (String(j.success) !== "true") throw new Error(j.message || "relay rejected");
            showSuccess(true);
          })
          .catch(() => {
            // Fallback: open the visitor's mail client with everything
            // pre-filled (compact body, so it opens reliably).
            window.location.href = mailtoUrl;
            showSuccess(false);
          });
      };

      if (type === "Test Shoot") {
        openTermsModal(name, () => proceedSubmit(true));
      } else {
        proceedSubmit(false);
      }
    });

    // Open the TFP terms modal for `partnerName`. Listeners are added per
    // opening and removed on close, so repeat openings never double-bind.
    // `onAccept` (optional) runs after the modal closes via "Agree".
    function openTermsModal(partnerName, onAccept) {
      $("#terms_partner_name").textContent = partnerName;
      $("#termsModal").style.display = "flex";
      const acceptBtn = $("#termsAcceptBtn");
      const declineBtn = $("#termsDeclineBtn");
      const close = () => {
        $("#termsModal").style.display = "none";
        acceptBtn.removeEventListener("click", onAcceptClick);
        declineBtn.removeEventListener("click", onDeclineClick);
      };
      const onAcceptClick = () => { close(); if (onAccept) onAccept(); };
      const onDeclineClick = () => close();
      acceptBtn.addEventListener("click", onAcceptClick);
      declineBtn.addEventListener("click", onDeclineClick);
    }

    // Wire copy button
    $("#copyInquiryBtn")?.addEventListener("click", () => {
      const txt = $("#inquiryTextPreview")?.textContent || "";
      navigator.clipboard.writeText(txt);
      const btnEl = $("#copyInquiryBtn");
      if (btnEl) {
        const orig = btnEl.textContent;
        btnEl.textContent = "Copied! ✓";
        setTimeout(() => { btnEl.textContent = orig; }, 2000);
      }
    });

    // Wire the terms trigger link
    $("#tfpTermsTrigger")?.addEventListener("click", (e) => {
      e.preventDefault();
      openTermsModal($("#b_name")?.value || "Creative Partner");
    });

    // Check if loaded with Hash link
    if (location.hash === "#tfp-terms") {
      openTermsModal("Creative Partner");
    }

    // "Send another request" — reset back to a clean form.
    $("#bookAnother")?.addEventListener("click", () => {
      form.reset();
      ["b_name", "b_email", "b_date"].forEach(clearError);
      if (successPanel) successPanel.hidden = true;
      form.hidden = false;
      form.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" });
      updateFields();
    });
  }

  function wireView(key) {
    // Inline live-page editing (Admin mode): edit title/desc/season/location in
    // place; save to IndexedDB on blur/Enter and sync to the repo.
    view.querySelectorAll(".inline-edit").forEach((el) => {
      const original = () => el.dataset.original ?? (el.dataset.original = el.textContent);
      original();
      el.addEventListener("focus", () => { if (el.textContent.trim() === "Add a description…" || el.textContent.trim() === "—") el.textContent = ""; });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); el.blur(); }
        if (e.key === "Escape") { el.textContent = el.dataset.original || ""; el.blur(); }
      });
      el.addEventListener("blur", async () => {
        const id = el.dataset.shoot, field = el.dataset.field;
        let value = el.textContent.replace(/\s+/g, " ").trim();
        const s = SHOOTS.find((x) => x.id === id);
        if (!s) return;
        if (value === (el.dataset.original || "").trim()) return; // unchanged
        if (!value && (field === "season" || field === "location")) value = "—";
        s[field] = value;
        el.dataset.original = el.textContent;
        try {
          await putShoot(s);
          await loadShoots();
          toast(`Updated ${field}.`);
          syncToGitHub(SHOOTS);
        } catch (err) {
          console.error("Inline edit save failed:", err);
          toast("Couldn't save that change.");
        }
      });
    });

    // noth.in full-bleed work cards → open the shoot in the lightbox.
    view.querySelectorAll(".noth-work").forEach((card) => {
      const s = CURRENT_VIEW_SHOOTS.find((x) => x.id === card.dataset.shoot) || SHOOTS.find((x) => x.id === card.dataset.shoot);
      if (!s) return;
      const isCc = (s.isCompCard || s.type === "Test Shoot") && isCurrentlyCompCardView();
      const list = s.photos.filter((p) => !(isCc && p.excludeFromCompCard)).map((p) => ({ ...p, shoot: s }));
      const media = card.querySelector(".noth-work-media");
      const cta = card.querySelector(".noth-work-cta");
      const open = () => openLb(list, 0);
      media?.addEventListener("click", open);
      cta?.addEventListener("click", open);

      // Wire admin edit & delete buttons
      card.querySelectorAll(".work-edit").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          history.pushState(null, "", `/upload?edit=${s.id}`);
          render();
        });
      });
      card.querySelector(".work-delete")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete the photoshoot "${s.title || s.talent}"?`)) {
          await delShoot(s.id);
          await loadShoots();
          toast(`Deleted "${s.title || s.talent}".`);
          render();
          await syncToGitHub(SHOOTS, { deletedIds: [s.id] });
        }
      });

      // Dynamic padding: if the cover's orientation clashes with the 16:9 frame,
      // contain the image (show it whole) over a blurred fill instead of cropping.
      const img = media?.querySelector("img");
      if (img) {
        const evaluateFit = () => {
          const nw = img.naturalWidth, nh = img.naturalHeight;
          if (!nw || !nh) return;
          const imgRatio = nw / nh;
          const frameRatio = media.clientWidth / media.clientHeight || (16 / 9);
          // Portrait covers, or ratios that differ a lot, get contained + padded.
          const mismatch = imgRatio < 1 || Math.abs(imgRatio - frameRatio) / frameRatio > 0.35;
          media.classList.toggle("fit-contain", mismatch);
          if (mismatch) {
            const isPortrait = imgRatio < 1;
            media.classList.toggle("fit-portrait", isPortrait);
            media.classList.toggle("fit-landscape", !isPortrait);
          } else {
            media.classList.remove("fit-portrait", "fit-landscape");
          }
        };
        if (img.complete) evaluateFit();
        img.addEventListener("load", evaluateFit, { once: true });
      }
    });

    // work-block interactions (open lightbox on media or "View project")
    view.querySelectorAll(".work-block").forEach((block) => {
      const s = CURRENT_VIEW_SHOOTS.find((x) => x.id === block.dataset.shoot) || SHOOTS.find((x) => x.id === block.dataset.shoot);
      if (!s) return;
      const isCc = (s.isCompCard || s.type === "Test Shoot") && isCurrentlyCompCardView();
      const list = s.photos.filter((p) => !(isCc && p.excludeFromCompCard)).map((p) => ({ ...p, shoot: s }));
      const open = () => openLb(list, 0);
      if (s.isCompCard) {
        block.querySelectorAll(".comp-card-thumb").forEach(thumb => {
          thumb.addEventListener("click", () => {
            const idx = parseInt(thumb.dataset.index, 10) || 0;
            openLb(list, idx);
          });
        });
      } else {
        block.querySelector(".work-media")?.addEventListener("click", open);
      }
      block.querySelector(".work-open")?.addEventListener("click", open);
      
      // edit buttons click handler
      block.querySelectorAll(".work-edit").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const targetId = btn.dataset.id || s.id;
          history.pushState(null, "", `/upload?edit=${targetId}`);
          render();
        });
      });
      
      // delete button click handler
      block.querySelector(".work-delete")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete the photoshoot "${s.title}"?`)) {
          await delShoot(s.id);
          await loadShoots();
          toast(`Deleted "${s.title}".`);
          render(); // re-render view
          await syncToGitHub(SHOOTS, { deletedIds: [s.id] });
        }
      });

      // view diagram button click handler
      block.querySelectorAll(".view-diagram-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const wrap = block.querySelector(".diagram-img-wrap");
          if (wrap) {
            const visible = wrap.style.display === "block";
            wrap.style.display = visible ? "none" : "block";
            btn.textContent = visible ? "View Lighting Diagram" : "Hide Lighting Diagram";
          }
        });
      });
    });
    
    // specialty thumb click interactions
    view.querySelectorAll(".specialty-thumb-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const kind = btn.dataset.kind;
        const val = btn.dataset.val;
        const clickedSrc = btn.dataset.src;
        
        let shoots = SHOOTS.filter(s => s[kind] === val);
        if (val === "Test Shoot" || val === "Comp Cards" || val === "Model Portfolio") {
          shoots = shoots.filter(s => (s.instagram && s.instagram.trim()) || (s.kavyar && s.kavyar.trim()));
        }
        
        const isCc = val === "Test Shoot" && isCurrentlyCompCardView();
        const list = shoots.flatMap(s => (s.photos || []).filter(p => !(isCc && p.excludeFromCompCard)).map(p => ({ ...p, shoot: s })));
        const idx = list.findIndex(p => photoSrc(p) === clickedSrc);
        openLb(list, idx >= 0 ? idx : 0);
      });
    });

    // Alphabetical filter wiring for Model Portfolio
    const alphaBtns = view.querySelectorAll(".alpha-btn");
    if (alphaBtns.length) {
      alphaBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          alphaBtns.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          
          const filterVal = btn.dataset.alpha;
          const blocks = view.querySelectorAll(".work-block");
          blocks.forEach(block => {
            const talent = getTalentCleanName(block.dataset.talent || "");
            const firstChar = talent.trim().charAt(0).toUpperCase();
            if (filterVal === "ALL" || firstChar === filterVal) {
              block.style.display = "";
            } else {
              block.style.display = "none";
            }
          });
        });
      });
    }
    
    if (key === "upload") {
      const editId = new URLSearchParams(location.search).get("edit");
      wireUpload(editId);
    }
    if (key === "book") wireBook();
    // animate hero counts
    view.querySelectorAll("[data-count]").forEach((el) => animateCount(el, parseInt(el.textContent, 10) || 0));
  }

  /* ============================================================
     §14 · ROUTER
     ============================================================ */
  const ROUTES = { "": viewHome, "albums": viewAlbums, "categories": viewCategories, "studio": viewStudio, "upload": viewUpload, "book": viewBook, "testimonials": viewTestimonials, "workshop-attended": viewWorkshopAttended };

  function render() {
    let raw = location.pathname;
    raw = raw.replace(/\/index\.html$/, "").replace(/^\//, "").replace(/\/$/, "");
    const parts = raw.split("/").filter(Boolean);
    const key = parts[0] || "";
    
    const params = new URLSearchParams(location.search);
    const qKind = params.get("kind");
    const qVal = params.get("val");
    const kind = parts[1] || qKind;
    const val = parts[2] || qVal;
    
    if (typeof gtag === 'function') {
      gtag('config', 'G-S0Q7T5Y2J4', {
        'page_path': location.pathname + location.search
      });
    }
    
    const header = $(".site-header");
    if (header) {
      if (key === "") {
        header.classList.remove("header-light");
      } else {
        header.classList.add("header-light");
      }
    }
    
    // Redirect non-admins trying to access upload page
    if (key === "upload" && !isAdmin()) {
      history.pushState(null, "", "/");
      render();
      return;
    }

    // Redirect to home if trying to access workshop-attended and not authorized
    if (key === "workshop-attended" && !isAdmin() && !shouldShowWorkshopsToAll()) {
      history.pushState(null, "", "/");
      render();
      return;
    }

    if (key === "categories" && val === "Workshop Attended") {
      const allowed = isAdmin() || shouldShowWorkshopsToAll();
      history.pushState(null, "", allowed ? "/workshop-attended" : "/");
      render();
      return;
    }

    const fn = ROUTES[key] || (() => `
      <section class="hero hero-mono hero-404">
        <div class="hero-bg" aria-hidden="true"></div>
        <div class="container hero-inner">
          <div class="hero-topline">
            <span class="hero-topline-l">Error 404</span>
            <span class="hero-topline-r">Page not found</span>
          </div>
          <h1 class="hero-wordmark hero-wordmark-nerdy notfound-mark" aria-label="404 — page not found">
            <span class="wm-letter" style="--i:0">4</span><span class="wm-letter" style="--i:1">0</span><span class="wm-letter" style="--i:2">4</span>
          </h1>
          <div class="hero-mono-foot">
            <p class="hero-mono-tagline">This frame doesn't exist — but the archive does.</p>
            <div class="hero-actions">
              <a href="/" data-link class="btn btn-dark">Back home →</a>
              <a href="/albums" data-link class="btn btn-ghost">Browse albums</a>
            </div>
          </div>
        </div>
      </section>`);

    view.classList.add("leaving");
    const paint = () => {
      view.innerHTML = key === "categories" ? viewCategories(kind, val) : fn();
      view.classList.remove("leaving");
      window.scrollTo({ top: 0, behavior: "auto" });
      if (typeof smoothScroll !== "undefined" && smoothScroll.enabled) smoothScroll.reset();
      wireView(key);
      initReveal();
      setActiveNav(key);

      // SEO optimization: update page title and description dynamically
      const cfg = window.STUDIO_CONFIG || { studioName: "nerdyphotographer.in" };
      let pageTitle = `${cfg.studioName} — The Creative Studio`;
      let pageDesc = "Noida and Delhi NCR based professional photography studio. Specializing in high-end male and female model photography, fashion, beauty, editorial, sports, and fitness photography. Browse portfolios by nerdyphotographer.in — Noida, Delhi NCR, India.";
      
      if (key === "work" || key === "albums") {
        pageTitle = `All Albums — ${cfg.studioName}`;
        pageDesc = `Browse the complete photoshoot album archive of ${cfg.studioName} — fashion, beauty, editorial, sports, and fitness photography in Noida & Delhi NCR.`;
      } else if (key === "categories") {
        if (parts[1] && parts[2]) {
          const rawCatName = decodeURIComponent(parts[2]);
          const catName = rawCatName === "Test Shoot" ? "Model Portfolio (Comp Cards)" : rawCatName;
          pageTitle = `${catName} (${parts[1]}) — ${cfg.studioName}`;
          pageDesc = `Photoshoots filed under the ${parts[1]} category "${catName}" in the photography archive.`;
        } else {
          pageTitle = `Browse by Category — ${cfg.studioName}`;
          pageDesc = `Explore creative photoshoots categorized by activity (genre), brand, or production type.`;
        }
      } else if (key === "studio") {
        pageTitle = `The Creative Studio — ${cfg.studioName}`;
        pageDesc = `Learn about our creative process, vision, philosophy, and tools behind the photography craft. Noida, India.`;
      } else if (key === "book") {
        pageTitle = `Book a Shoot — ${cfg.studioName}`;
        pageDesc = `Collaborate with us on your next photoshoot. Send a project brief or book a session with Noida's creative studio.`;
      }
      
      document.title = pageTitle;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute("content", pageDesc);
      updateImageSchema();
    };
    if (prefersReduced) paint(); else setTimeout(paint, 180);
  }

  // Inject/refresh ImageGallery + ImageObject structured data for the shoots in
  // the current view, so the photography surfaces in Google Images / rich results.
  function updateImageSchema() {
    const ORIGIN = "https://www.nerdyphotographer.in";
    const abs = (u) => u ? (u.startsWith("http") ? u : `${ORIGIN}/${u.replace(/^\//, "")}`) : "";
    const shoots = (CURRENT_VIEW_SHOOTS && CURRENT_VIEW_SHOOTS.length ? CURRENT_VIEW_SHOOTS : SHOOTS).slice(0, 12);
    const images = [];
    for (const s of shoots) {
      if (!s.photos) continue;
      for (const p of s.photos) {
        const url = abs(p.url);
        if (!url) continue; // only real published files (not base64)
        images.push({
          "@type": "ImageObject",
          "contentUrl": url,
          "name": s.title || s.talent || "Photoshoot",
          "caption": p.caption || altFor(s),
          "creditText": "nerdyphotographer.in",
          "creator": { "@type": "Organization", "name": "Nerdy Photographer" }
        });
        if (images.length >= 30) break;
      }
      if (images.length >= 30) break;
    }
    let el = document.getElementById("wps-image-schema");
    if (!images.length) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("script"); el.type = "application/ld+json"; el.id = "wps-image-schema"; document.head.appendChild(el); }
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ImageGallery",
      "name": `${window.STUDIO_CONFIG?.studioName || "nerdyphotographer.in"} — photography archive`,
      "url": location.href,
      "image": images
    });
  }

  function setActiveNav(key) {
    overlay.querySelectorAll(".nav-links a").forEach((a) => {
      const h = a.getAttribute("href").replace(/^#\/?/, "");
      a.classList.toggle("active", h === key || (h === "" && key === ""));
    });
  }

  /* ============================================================
     §15 · ANIMATION, SCROLL & LOADER
     ============================================================ */
  function animateCount(el, target) {
    target = Math.max(0, target | 0);
    if (prefersReduced) { el.textContent = target; return; }
    const t0 = performance.now(), dur = 800;
    (function step(now) {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.max(0, Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  function initReveal() {
    const items = view.querySelectorAll(".reveal, .reveal-stagger, .kinetic-word, .kinetic-h1");
    if (prefersReduced || !("IntersectionObserver" in window)) { items.forEach((el) => el.classList.add("in")); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.1, rootMargin: "0px 0px -8% 0px" });
    items.forEach((el) => io.observe(el));
  }

  // The footer lives outside the SPA view mount, so it needs its own persistent
  // reveal observer (set up once at boot, survives navigations). A generous
  // rootMargin means bottom-of-page elements still trigger, and a safety timer
  // guarantees footer content can never stay stuck invisible.
  function initFooterReveal() {
    const footer = $(".site-footer"); if (!footer) return;
    const items = [...footer.querySelectorAll(".reveal, .reveal-stagger")];
    const revealAll = () => items.forEach((el) => el.classList.add("in"));
    if (prefersReduced || !("IntersectionObserver" in window)) { revealAll(); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }), { threshold: 0, rootMargin: "0px 0px 120px 0px" });
    items.forEach((el) => io.observe(el));
    // Safety net: if anything is still hidden shortly after it's on-screen, show it.
    const sweep = () => items.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight + 200) el.classList.add("in");
    });
    window.addEventListener("scroll", sweep, { passive: true });
    setTimeout(sweep, 1200);
  }

  // (The noth.in-style "View" hover cursor was removed by request —
  //  portfolio imagery no longer shows a follower badge.)

  /* ---------------- Scrolling ----------------
     Native scrolling is used (trackpads/modern browsers are already smooth and
     JS wheel-hijacking makes them feel laggy). Smoothness for anchor jumps comes
     from CSS `scroll-behavior: smooth`. This shim keeps the old API as a no-op. */
  const smoothScroll = { enabled: false, reset() {}, to(y) { window.scrollTo({ top: y, behavior: prefersReduced ? "auto" : "smooth" }); } };

  function initHeaderScroll() {
    const header = $(".site-header");
    window.addEventListener("scroll", () => header.classList.toggle("scrolled", window.scrollY > 8), { passive: true });
  }

  function dismissLoader() {
    const l = $("#loader"); if (!l) return;
    // Show the full loader only once per session; on later loads dismiss fast.
    let seen = false;
    try { seen = sessionStorage.getItem("wps-loaded") === "1"; sessionStorage.setItem("wps-loaded", "1"); } catch {}
    const w = prefersReduced || seen ? 0 : 1200;

    // noth.in-style numeric counter 000 -> 100 that runs while the bar fills.
    const countEl = $("#loaderCount");
    if (countEl) {
      if (w === 0) {
        countEl.textContent = "100";
      } else {
        const t0 = performance.now();
        (function tick(now) {
          const p = Math.min(1, (now - t0) / w);
          // Ease-out so it races then settles, like noth.in's counter.
          const eased = 1 - Math.pow(1 - p, 2);
          countEl.textContent = String(Math.round(eased * 100)).padStart(3, "0");
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      }
    }

    setTimeout(() => l.classList.add("done"), w);
    setTimeout(() => l.remove(), w + (prefersReduced || seen ? 100 : 900));
  }

  /* ============================================================
     §16 · COMP-CARD PRINTING & DOWNLOAD LOGGING
     ============================================================ */
  /* ---- Shared print builders (comp card + model portfolio) ---- */
  const PRINT_ANGLE_LABELS = {
    "front": "Front Portrait",
    "side": "Side Profile",
    "back": "Back Profile",
    "three-quarter": "3/4 Profile",
    "close-up": "Close-up / Headshot"
  };

  // Branding footer — this doubles as a marketing touchpoint, so it's always
  // included and only ever shrinks (via --print-scale), never gets dropped.
  const PRINT_FOOTER_HTML = `
    <div style="border-top: 2px solid #000; padding-top: calc(10px * var(--print-scale, 1)); margin-top: auto; font-family: sans-serif; font-size: calc(8.5px * var(--print-scale, 1)); color: #000; line-height: 1.5; display: flex; flex-direction: column; gap: calc(4px * var(--print-scale, 1)); text-align: left; width: 100%; flex: 0 0 auto;">
      <div style="font-family:'JetBrains Mono', monospace; font-size: calc(10px * var(--print-scale, 1)); font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: 0.05em; background: #f4f4f2; padding: calc(6px * var(--print-scale, 1)) calc(10px * var(--print-scale, 1)); border-radius: 4px; border: 1px solid #dcdad5; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>📸 Photographed by nerdyphotographer.in</span>
          <span>·</span>
          <span style="display: inline-flex; align-items: center; gap: 4px;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
            @nerdyphotographer.in
          </span>
        </div>
        <span style="font-weight: 700; color: var(--accent, #d24e1a);">www.nerdyphotographer.in</span>
      </div>
      <div style="color: #555; font-size: calc(7.5px * var(--print-scale, 1));">All portfolio cards, comp cards, and photography frames are official creative works produced under nerdyphotographer.in studio Noida &amp; Delhi NCR.</div>
    </div>
  `;

  function printStatsBarHtml(shoot, targetType) {
    if (targetType === "comp" && shoot.showStatsOnCompCard === false) return "";
    if (targetType === "portfolio" && shoot.showStatsOnModelPortfolio === false) return "";

    const statsArr = [];
    if (shoot.height) statsArr.push(`Height: ${shoot.height}`);
    if (shoot.chest) statsArr.push(`Chest/Bust: ${shoot.chest}`);
    if (shoot.waist) statsArr.push(`Waist: ${shoot.waist}`);
    if (shoot.hips) statsArr.push(`Hips: ${shoot.hips}`);
    if (shoot.shoes) statsArr.push(`Shoes: ${shoot.shoes}`);
    if (shoot.modelHair) statsArr.push(`Hair: ${shoot.modelHair}`);
    if (shoot.modelEyes) statsArr.push(`Eyes: ${shoot.modelEyes}`);
    const statsLine = statsArr.join("  ·  ");
    return statsLine ? `
      <div style="font-family:'JetBrains Mono', monospace; font-size: calc(11px * var(--print-scale, 1)); font-weight: 700; background: #f5f5f5; color: #000; padding: calc(10px * var(--print-scale, 1)) calc(14px * var(--print-scale, 1)); text-transform: uppercase; letter-spacing: 0.05em; text-align: center; border-radius: 6px; margin-bottom: calc(20px * var(--print-scale, 1)); border: 1px solid #e0e0e0; flex: 0 0 auto;">
        ${statsLine}
      </div>
    ` : "";
  }

  function printSocialsBarHtml(shoot) {
    const printSocials = [];
    if (shoot.instagram) {
      const filteredHandles = compCardOwnHandles(shoot, shoot.instagram.split(",").map(x => x.trim()).filter(Boolean), isIgHandle);
      if (filteredHandles.length) {
        const cleaned = filteredHandles.map(h => h.startsWith("@") ? h : `@${h.split("/").pop()}`);
        printSocials.push(`Instagram: ${cleaned.join(", ")}`);
      }
    }
    if (shoot.kavyar) {
      const filteredHandles = compCardOwnHandles(shoot, shoot.kavyar.split(",").map(x => x.trim()).filter(Boolean), isKavyarHandle);
      if (filteredHandles.length) {
        const cleaned = filteredHandles.map(h => h.split("/").pop());
        printSocials.push(`Kavyar: ${cleaned.join(", ")}`);
      }
    }
    const socialsLine = printSocials.join("   |   ");
    return socialsLine ? `
      <div style="font-family:'JetBrains Mono', monospace; font-size: calc(10px * var(--print-scale, 1)); font-weight: 700; color: #333; padding: calc(6px * var(--print-scale, 1)) calc(12px * var(--print-scale, 1)); text-transform: uppercase; letter-spacing: 0.05em; text-align: center; margin-bottom: calc(20px * var(--print-scale, 1)); border-bottom: 1px solid #ddd; padding-bottom: calc(10px * var(--print-scale, 1)); flex: 0 0 auto;">
        ${socialsLine}
      </div>
    ` : "";
  }

  // Full-bleed cover page: big portrait, model name, document label.
  function printCoverPageHtml(shoot, coverPhoto, headerLabel, subLabel) {
    return `
      <div class="print-page" style="display: flex; flex-direction: column; justify-content: space-between; height: 100%; box-sizing: border-box; page-break-after: always; break-after: page;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px;">
          <span style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.1em;">${headerLabel}</span>
          <span style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #000; text-transform: uppercase;">Clicked by nerdyphotographer.in</span>
        </div>
        
        <div class="print-cover-panel" style="flex-grow: 1;">
          ${coverPhoto ? `<img src="${photoSrc(coverPhoto)}" alt="Cover photo" />` : ''}
        </div>
        
        <div style="text-align: center; padding-top: 24px; margin-top: 16px; border-top: 1px solid #eee;">
          <h1 style="font-family:'Outfit', sans-serif; font-size: 38px; font-weight: 800; margin: 0 0 4px; text-transform: uppercase; color: #000; letter-spacing: -0.03em;">
            ${getTalentCleanName(shoot.talent || shoot.title)}
          </h1>
          <p style="font-family:'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: var(--accent, #d24e1a); text-transform: uppercase; letter-spacing: 0.15em; margin: 0;">
            ${subLabel}
          </p>
          <p style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 6px;">
            Photographed &amp; Produced by nerdyphotographer.in studio
          </p>
        </div>
      </div>
    `;
  }

  // One grid cell. Cell shapes are re-derived from each photo's real aspect
  // ratio at export time (justifyPrintGrid), so photos tile the grid
  // edge-to-edge with at most a few percent of even all-edge trim — and the
  // layout falls back to contain (padded, zero-crop) rather than ever
  // trimming more. Full-length shots keep their heads. Angle badge optional.
  function printGridCellHtml(p, showAngle = true) {
    const labelHtml = showAngle && p.angle
      ? `<span style="position: absolute; bottom: 6px; left: 6px; font-family:'JetBrains Mono', monospace; font-size:8px; font-weight:700; background:rgba(0,0,0,0.72); color:#fff; padding:2px 6px; border-radius:3px; text-transform:uppercase;">${PRINT_ANGLE_LABELS[p.angle] || p.angle}</span>`
      : "";
    return `
      <div class="print-photo-item">
        <img src="${photoSrc(p)}" alt="Portfolio frame" />
        ${labelHtml}
      </div>
    `;
  }

  // A 3×2 photo grid page (stats/socials bars can be injected via extrasHtml).
  function printGridPageHtml(shoot, cellsHtml, extrasHtml = "", pageLabel = "") {
    const headerTitle = pageLabel || `${getTalentCleanName(shoot.talent || shoot.title)} — Portfolio`;
    return `
      <div class="print-page" style="display: flex; flex-direction: column; height: 100%; box-sizing: border-box; padding-top: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px;">
          <h2 style="font-family:'Outfit', sans-serif; font-size: 24px; font-weight: 800; margin: 0; text-transform: uppercase; color: #000; letter-spacing: -0.02em;">
            ${headerTitle}
          </h2>
          <span style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #000; text-transform: uppercase;">Clicked by nerdyphotographer.in</span>
        </div>
        
        ${extrasHtml}
        
        <div class="print-photo-grid">
          ${cellsHtml}
        </div>
        
        ${PRINT_FOOTER_HTML}
      </div>
    `;
  }

  function detectPhotosOrientation(photos, imgs) {
    if (imgs && imgs.length) {
      const coverImg = imgs[0];
      if (coverImg && coverImg.naturalWidth && coverImg.naturalHeight) {
        const aspect = coverImg.naturalWidth / coverImg.naturalHeight;
        if (aspect > 1.1) return "landscape";
      }
      let landscapeCount = 0, portraitCount = 0;
      imgs.forEach(img => {
        if (img.naturalWidth && img.naturalHeight) {
          if (img.naturalWidth / img.naturalHeight > 1.05) landscapeCount++;
          else portraitCount++;
        }
      });
      if (landscapeCount > portraitCount) return "landscape";
    }
    if (photos && photos.length) {
      const cover = photos[0];
      if (cover.width && cover.height && cover.width / cover.height > 1.1) return "landscape";
    }
    return "portrait";
  }

  // A4 = 210mm x 297mm. Printable area after the @page margin (6mm top/bottom,
  // 8mm left/right) — used to size .print-page in real, deterministic units
  // instead of vh (which is inconsistent across browsers in @media print).
  const A4_PRINTABLE_MM = {
    portrait: { width: 194, height: 285 },
    landscape: { width: 281, height: 198 }
  };

  // Measures each .print-page against its fixed A4 box and, if content is
  // taller than the page (e.g. a full stats bar + socials + 6 photos),
  // shrinks --print-scale in small steps until it fits — so content is
  // accommodated by shrinking proportionally rather than clipping or
  // spilling onto a second sheet. The outer overflow:hidden stays on as a
  // hard backstop so a page can never spill regardless of edge cases.
  function fitPrintPagesToA4(printContainer, isLandscape) {
    const { width, height } = isLandscape ? A4_PRINTABLE_MM.landscape : A4_PRINTABLE_MM.portrait;
    printContainer.querySelectorAll(".print-page").forEach((pageEl) => {
      pageEl.style.setProperty("width", `${width}mm`, "important");
      pageEl.style.setProperty("height", `${height}mm`, "important");
      pageEl.style.setProperty("--print-scale", "1");

      const fits = () => pageEl.scrollHeight <= pageEl.clientHeight + 1;
      if (fits()) return;
      const MIN_SCALE = 0.72;
      let scale = 1;
      while (scale > MIN_SCALE && !fits()) {
        scale = Math.max(MIN_SCALE, scale - 0.03);
        pageEl.style.setProperty("--print-scale", String(scale));
      }
    });
  }

  // ---- Aspect-aware print layout ------------------------------------------
  // Supporting photos are randomly selected per export, so their shapes are
  // unknowable until the images load. Fixed boxes + object-fit:contain kept
  // photos uncropped but could letterbox away a third of the sheet as grey
  // padding. Instead, once every image is loaded, the card is laid out from
  // the photos' real aspect ratios: justified rows (Flickr/Google-Photos
  // style) — photos in a row share its height, each one's width proportional
  // to its aspect ratio, tiling the area edge-to-edge. The residual mismatch
  // between the drawn photo set and the fixed A4 area is absorbed by
  // object-fit:cover as a small even all-edge trim; any layout that would
  // need more than JUSTIFY_MAX_TRIM falls back to contain — heads are never
  // cut.
  const JUSTIFY_MAX_TRIM = 0.12; // grid photos: max even trim before contain fallback
  const COVER_MAX_TRIM = 0.12;   // hero gets the same tolerance — the sweep's
                                 // 0.1×coverTrim bias already keeps it lower
                                 // than this whenever the sheet allows
  const GRID_GAP = 10;

  const trimOf = (scale) => 1 - Math.min(scale, 1 / scale);

  // Best packing of `aspects` into 1–3 justified rows of a W×H area: photos
  // sorted by shape so alike ones share a row, every contiguous grouping
  // tried, keeping the one whose natural justified height is closest to H.
  function bestJustifiedSplit(W, H, aspects, gapPx) {
    if (W <= 0 || H <= 0 || !aspects.length) return null;
    const order = aspects.map((_, i) => i).sort((a, b) => aspects[a] - aspects[b]);
    const splits = [];
    (function compose(remaining, acc) {
      if (remaining === 0) { splits.push(acc.slice()); return; }
      if (acc.length >= 3) return;
      for (let take = 1; take <= remaining; take++) {
        acc.push(take);
        compose(remaining - take, acc);
        acc.pop();
      }
    })(aspects.length, []);
    let best = null;
    for (const split of splits) {
      let idx = 0, naturalH = 0;
      const rows = split.map((count) => {
        const rowIdxs = order.slice(idx, idx + count);
        idx += count;
        const sumA = rowIdxs.reduce((s, i) => s + aspects[i], 0);
        const h = (W - gapPx * (count - 1)) / sumA;
        naturalH += h;
        return { rowIdxs, h };
      });
      const scale = (H - gapPx * (split.length - 1)) / naturalH;
      // Aesthetic guardrails: editorial mosaics keep rows in the same size
      // family — reject layouts mixing tall rows with postage-stamp strips.
      const hs = rows.map((r) => r.h * scale);
      const minH = Math.min(...hs), maxH = Math.max(...hs);
      if (minH / maxH < 0.45 || minH < 90) continue;
      const trim = trimOf(scale);
      if (!best || trim < best.trim) best = { rows, trim };
    }
    return best;
  }

  function collectGridPhotos(grid) {
    const cells = [], imgs = [], aspects = [];
    grid.querySelectorAll(".print-photo-item").forEach((cell) => {
      const img = cell.querySelector("img");
      if (img && img.naturalWidth && img.naturalHeight) {
        cells.push(cell);
        imgs.push(img);
        aspects.push(img.naturalWidth / img.naturalHeight);
      } else {
        cell.remove(); // a failed image would otherwise print as an empty grey box
      }
    });
    return { cells, imgs, aspects };
  }

  function applyJustifiedLayout(grid, cells, imgs, aspects, best, gapPx) {
    const fit = best.trim <= JUSTIFY_MAX_TRIM ? "cover" : "contain";
    grid.style.setProperty("display", "flex", "important");
    grid.style.setProperty("flex-direction", "column", "important");
    grid.style.setProperty("gap", `${gapPx}px`, "important");
    grid.innerHTML = "";
    for (const row of best.rows) {
      const rowEl = document.createElement("div");
      rowEl.style.cssText = `display:flex; gap:${gapPx}px; width:100%; min-height:0; flex:${row.h} 1 0;`;
      for (const i of row.rowIdxs) {
        cells[i].style.setProperty("flex", `${aspects[i]} 1 0%`, "important");
        cells[i].style.setProperty("height", "100%", "important");
        imgs[i].style.setProperty("object-fit", fit, "important");
        rowEl.appendChild(cells[i]);
      }
      grid.appendChild(rowEl);
    }
  }

  // One-pager main row: the cover panel's width and the side grid's layout
  // constrain each other (wider hero = narrower grid), and the ideal split
  // depends on the shapes drawn this export — e.g. a portrait cover with
  // portrait side shots on a landscape sheet wants a modest hero plus a
  // six-photo mosaic, while the same set on a portrait sheet suits a wide
  // hero with a narrow stacked column. So sweep the cover width AND how many
  // of the rendered side photos to keep, scoring each combination by its
  // worst trim — with a small penalty per dropped photo, so shots are only
  // dropped when doing so genuinely rescues the layout.
  const DROP_PENALTY = 0.02;
  function layoutPrintMainRows(printContainer) {
    printContainer.querySelectorAll(".print-main-row").forEach((row) => {
      const panel = row.querySelector(".print-cover-panel");
      const grid = row.querySelector(".print-side-grid");
      const coverImg = panel && panel.querySelector("img");
      if (!panel || !coverImg || !coverImg.naturalWidth || !coverImg.naturalHeight) return;
      const W = row.clientWidth, H = row.clientHeight;
      if (!W || !H) return;
      const coverAspect = coverImg.naturalWidth / coverImg.naturalHeight;
      const rowGap = parseFloat(getComputedStyle(row).columnGap) || 12;

      const gp = grid ? collectGridPhotos(grid) : { cells: [], imgs: [], aspects: [] };
      if (gp.cells.length < 2) {
        // Nothing to justify — just size the hero panel to its photo.
        const clamped = Math.max(W * 0.28, Math.min(W * 0.62, H * coverAspect));
        panel.style.setProperty("flex", `0 0 ${clamped}px`, "important");
        if (grid) grid.style.setProperty("flex", "1 1 0", "important");
        return;
      }

      let best = null;
      for (let frac = 0.26; frac <= 0.661; frac += 0.02) {
        const w = W * frac;
        const coverTrim = trimOf((w / H) / coverAspect);
        for (let n = Math.min(3, gp.cells.length); n <= gp.cells.length; n++) {
          const split = bestJustifiedSplit(W - w - rowGap, H, gp.aspects.slice(0, n), GRID_GAP);
          if (!split) continue;
          // The hero carries the card: weight its trim into the score so the
          // sweep lands on a full-bleed hero over a marginally better grid.
          const score = Math.max(coverTrim, split.trim) + 0.1 * coverTrim + DROP_PENALTY * (gp.cells.length - n);
          if (!best || score < best.score) {
            best = { score, w, n, split, coverTrim };
          }
        }
      }
      if (!best) return;

      panel.style.setProperty("flex", `0 0 ${best.w}px`, "important");
      grid.style.setProperty("flex", "1 1 0", "important");
      coverImg.style.setProperty("object-fit", best.coverTrim <= COVER_MAX_TRIM ? "cover" : "contain", "important");
      for (let i = best.n; i < gp.cells.length; i++) gp.cells[i].remove();
      applyJustifiedLayout(grid, gp.cells.slice(0, best.n), gp.imgs.slice(0, best.n), gp.aspects.slice(0, best.n), best.split, GRID_GAP);
    });
  }

  // Multi-page portfolio grids: the photo count per page is fixed upstream,
  // so just justify what's there.
  function justifyPrintGrids(printContainer) {
    printContainer.querySelectorAll(".print-photo-grid").forEach((grid) => {
      const { cells, imgs, aspects } = collectGridPhotos(grid);
      if (cells.length < 2) return;
      const best = bestJustifiedSplit(grid.clientWidth, grid.clientHeight, aspects, 12);
      if (best) applyJustifiedLayout(grid, cells, imgs, aspects, best, 12);
    });
  }

  // Render pages into the hidden print container, wait for every image to
  // finish loading, then open the print dialog with a clean filename
  // (<Model_Name>_<suffix>_nerdyphotographer.pdf when saved as PDF).
  function printFromContainer(shoot, pagesHtml, docType, forcedOrientation = "auto") {
    const printContainer = document.getElementById("compCardPrintContainer");
    if (!printContainer) return;
    printContainer.innerHTML = pagesHtml;
    const triggerPrint = () => {
      const imgs = printContainer.querySelectorAll("img");
      let orientation = forcedOrientation;
      if (orientation === "auto") {
        orientation = detectPhotosOrientation(shoot.photos, imgs);
      }
      const isLandscape = orientation === "landscape";

      let styleTag = document.getElementById("dynamicPrintOrientationStyle");
      if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = "dynamicPrintOrientationStyle";
        document.head.appendChild(styleTag);
      }

      if (isLandscape) {
        styleTag.textContent = `
          @media print {
            @page { size: A4 landscape !important; margin: 6mm 8mm !important; }
            .print-page { padding: 12px 16px !important; }
            .print-main-row {
              flex: 1 1 0% !important;
              gap: 14px !important;
              margin: 0 0 10px !important;
            }
            .print-cover-panel {
              flex: 1.5 1 0 !important;
            }
            .print-side-grid {
              flex: 1 1 0 !important;
              grid-template-columns: repeat(2, 1fr) !important;
              gap: 8px !important;
            }
            .print-photo-grid {
              grid-template-columns: repeat(3, 1fr) !important;
              gap: 10px !important;
              margin: 8px 0 !important;
            }
          }
        `;
        printContainer.querySelectorAll(".print-page").forEach(p => p.classList.add("landscape"));
      } else {
        styleTag.textContent = `
          @media print {
            @page { size: A4 portrait !important; margin: 6mm 8mm !important; }
            .print-page { padding: 14px 16px !important; }
            .print-main-row {
              flex: 1 1 0% !important;
              gap: 12px !important;
              margin: 0 0 10px !important;
            }
          }
        `;
        printContainer.querySelectorAll(".print-page").forEach(p => p.classList.remove("landscape"));
      }

      // The container is normally display:none on screen — make it
      // participate in layout so real heights can be measured and fitted
      // before the print dialog opens, while staying invisible via
      // visibility:hidden (an on-screen -99999px offset was tried before,
      // but position:fixed is relative to the browser's own viewport, so a
      // narrow/not-fully-maximized window could push the content outside
      // whatever region Chrome actually paints — producing a blank PDF.
      // Keeping it pinned at 0,0, always inside any viewport, and toggling
      // visibility instead of position sidesteps that entirely).
      const prevDisplay = printContainer.style.display;
      const prevPosition = printContainer.style.position;
      const prevLeft = printContainer.style.left;
      const prevTop = printContainer.style.top;
      const prevVisibility = printContainer.style.visibility;
      printContainer.style.setProperty("display", "flex", "important");
      printContainer.style.setProperty("position", "fixed", "important");
      printContainer.style.setProperty("left", "0", "important");
      printContainer.style.setProperty("top", "0", "important");
      printContainer.style.setProperty("visibility", "hidden", "important");

      fitPrintPagesToA4(printContainer, isLandscape);
      layoutPrintMainRows(printContainer);
      justifyPrintGrids(printContainer);

      const oldTitle = document.title;
      const cleanModelName = getTalentCleanName(shoot.talent || shoot.title).trim().replace(/\s+/g, '_');
      // "nerdyphotographer.in" would leave a stray dot right before ".pdf" in
      // the saved filename (e.g. "..._NerdyPhotographer.in.pdf") — dropped to
      // avoid that, per explicit instruction to prefer the no-dot form.
      document.title = `${cleanModelName}_${docType}_Shot_By_NerdyPhotographerin`;
      // Flip visible only for the print snapshot itself. The screen never
      // paints the container: no yield to the event loop happens between
      // this assignment and window.print() blocking. Doing it here in JS
      // (not only via the @media print rule in styles.css) means a stale
      // cached stylesheet can't leave the container hidden during the
      // snapshot — that skew (new app.js + old styles.css under the same
      // ?v=) produced blank PDFs on the live site.
      printContainer.style.setProperty("visibility", "visible", "important");
      window.print();
      document.title = oldTitle;

      printContainer.style.display = prevDisplay;
      printContainer.style.position = prevPosition;
      printContainer.style.left = prevLeft;
      printContainer.style.top = prevTop;
      printContainer.style.visibility = prevVisibility;
    };
    const imgs = printContainer.querySelectorAll("img");
    if (imgs.length === 0) { triggerPrint(); return; }
    let loadedCount = 0;
    const onImgLoad = () => {
      loadedCount++;
      if (loadedCount === imgs.length) triggerPrint();
    };
    imgs.forEach(img => {
      if (img.complete) {
        onImgLoad();
      } else {
        img.addEventListener("load", onImgLoad);
        img.addEventListener("error", onImgLoad); // failed images never block printing
      }
    });
  }

  // Single A4 "composite card" page — the standard agency layout: bold name
  // header, one large lead photo beside a 2×2 supporting grid, then stats
  // and socials strips when the data exists. The photo row flexes, so the
  // page absorbs optional strips without ever spilling onto a second sheet.
  function printOnePagerHtml(shoot, photos, headerLabel, showAngles) {
    const name = getTalentCleanName(shoot.talent || shoot.title);
    const cover = photos[0];
    const targetType = (headerLabel === "MODEL PORTFOLIO" ? "portfolio" : "comp");
    const statsHtml = printStatsBarHtml(shoot, targetType);
    const socialsHtml = printSocialsBarHtml(shoot);
    const hasDetails = !!(statsHtml.trim() || socialsHtml.trim());

    // Render up to 8 side photos; the post-load layout pass
    // (layoutPrintMainRows) decides how many to actually keep based on which
    // count tiles the sheet best for the shapes drawn this export — portrait
    // sheets typically settle around 4–5, landscape around 8.
    const side = photos.slice(1, 9);

    return `
      <div class="print-page${!hasDetails ? " no-details" : ""}">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: calc(8px * var(--print-scale, 1)); margin-bottom: calc(10px * var(--print-scale, 1)); flex: 0 0 auto;">
          <span style="font-family:'JetBrains Mono', monospace; font-size: calc(10px * var(--print-scale, 1)); font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.1em;">${headerLabel}</span>
          <span style="font-family:'JetBrains Mono', monospace; font-size: calc(10px * var(--print-scale, 1)); font-weight: 800; color: #000; text-transform: uppercase;">Clicked by nerdyphotographer.in</span>
        </div>
        <h1 style="font-family:'Outfit', sans-serif; font-size: calc(30px * var(--print-scale, 1)); font-weight: 800; margin: 0 0 calc(10px * var(--print-scale, 1)); text-transform: uppercase; color: #000; letter-spacing: -0.02em; flex: 0 0 auto;">${name}</h1>
        <div class="print-main-row">
          <div class="print-cover-panel">
            ${cover ? `<img src="${photoSrc(cover)}" alt="Lead photo" />` : ""}
          </div>
          ${side.length ? `<div class="print-side-grid${side.length === 5 ? " grid-5" : ""}">${side.map(p => printGridCellHtml(p, showAngles)).join("")}</div>` : ""}
        </div>
        ${statsHtml}
        ${socialsHtml}
        ${PRINT_FOOTER_HTML}
      </div>
    `;
  }

  // Comp card export (Location 1): ONE A4 page — lead photo + 4 or 5 randomized side photos (content-aware of model details).
  window.printCompCard = (shootId, orientation = "auto") => {
    const shoot = SHOOTS.find(x => x.id === shootId) || (window.currentCompCardShootObj);
    if (!shoot) return;

    // Gather ALL photos across ALL shoots tagged to this model
    const modelName = getTalentCleanName(shoot.talent || shoot.title).trim();
    let allModelPhotos = [];
    if (modelName) {
      const matchingShoots = SHOOTS.filter(s => {
        if (s.type === "Workshop Attended") return false;
        if (!s.talent) return false;
        const names = s.talent.split(",").map(t => getTalentCleanName(t).trim().toLowerCase());
        return names.includes(modelName.toLowerCase());
      });
      allModelPhotos = matchingShoots.flatMap(s => (s.photos || []).filter(p => !p.excludeFromCompCard && p.usage !== "portfolio"));
    }
    if (!allModelPhotos.length) {
      allModelPhotos = (shoot.photos || []).filter(p => !p.excludeFromCompCard && p.usage !== "portfolio");
    }
    const rawPhotos = allModelPhotos.length ? allModelPhotos : (shoot.photos || []);
    if (!rawPhotos.length) { toast("No photos to export."); return; }

    const coverPhoto = rawPhotos.find(p => p.isCover)
      || rawPhotos.find(p => p.id.split("-")[0] === shoot.coverPhotoId)
      || rawPhotos.find(p => p.angle === "front" || p.angle === "close-up")
      || rawPhotos[0];

    // Freshly shuffle remaining photos across all model clicks every time button is clicked
    const remaining = rawPhotos.filter(p => p !== coverPhoto);
    const shuffledSidePhotos = [...remaining].sort(() => Math.random() - 0.5);

    // Up to 8 side candidates; the aspect-aware layout pass keeps however
    // many of them tile the chosen orientation best.
    const photos = [coverPhoto, ...shuffledSidePhotos.slice(0, 8)];
    printFromContainer(shoot, printOnePagerHtml(shoot, photos, "MODEL COMP CARD", false), "CompCard", orientation);
  };

  // Print a model portfolio from an explicit photo list, in the format the
  // admin/user picked: 1 page (compact composite: lead + up to 4) or multi-page
  // (full-bleed cover page + angle-labelled 3×2 grids for all selected photos).
  function printPortfolioPhotos(shoot, photos, pageMode = 2, orientation = "auto") {
    const coverPhoto = photos.find(p => p.id.split("-")[0] === shoot.coverPhotoId) || photos[0];
    const ordered = [coverPhoto, ...photos.filter(p => p !== coverPhoto)];
    if (pageMode === 1 || ordered.length === 1) {
      printFromContainer(shoot, printOnePagerHtml(shoot, ordered.slice(0, 5), "MODEL PORTFOLIO", true), "Portfolio", orientation);
      return;
    }
    
    // Page 1: Cover page
    let pagesHtml = printCoverPageHtml(shoot, ordered[0], "MODEL PORTFOLIO", "OFFICIAL MODEL PORTFOLIO · COVER");
    
    // Remaining photos split into 3x2 grid pages (6 photos per page)
    const remainingGridPhotos = ordered.slice(1);
    const pageSize = 6;
    const totalGridPages = Math.ceil(remainingGridPhotos.length / pageSize) || 1;
    
    for (let i = 0; i < remainingGridPhotos.length; i += pageSize) {
      const chunk = remainingGridPhotos.slice(i, i + pageSize);
      const gridNum = Math.floor(i / pageSize) + 1;
      const pageLabel = `${getTalentCleanName(shoot.talent || shoot.title)} — Page ${gridNum + 1} of ${totalGridPages + 1}`;
      const cellsHtml = chunk.map(p => printGridCellHtml(p, true)).join("");
      const isLastGridPage = (i + pageSize >= remainingGridPhotos.length);
      const extrasHtml = isLastGridPage ? (printStatsBarHtml(shoot, "portfolio") + printSocialsBarHtml(shoot)) : "";
      pagesHtml += printGridPageHtml(shoot, cellsHtml, extrasHtml, pageLabel);
    }
    
    printFromContainer(shoot, pagesHtml, "Portfolio", orientation);
  }

  // Photo picker shown before a portfolio export: every portfolio-tagged
  // click as a tappable thumbnail (angle badge included) — choose exactly
  // which ones go into the PDF. All are selected by default.
  function openPortfolioPicker(shoot, photos) {
    // Rebuild the modal from scratch each time so no stale listeners stack up.
    document.getElementById("portfolioPickerModal")?.remove();
    const modal = document.createElement("div");
    modal.id = "portfolioPickerModal";
    modal.style = "position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.75); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; padding: 20px;";
    const angleShort = { "front": "Front", "side": "Side", "back": "Back", "three-quarter": "3/4", "close-up": "Close-up" };
    modal.innerHTML = `
      <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 14px; width: 100%; max-width: 720px; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--shadow);">
        <div style="padding: 18px 22px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: 10px; background: var(--bone); flex-wrap: wrap;">
          <div>
            <h3 style="margin: 0; font-family:'Outfit', sans-serif; font-size: 16px; font-weight: 700; color: var(--ink);">Select photos for the PDF</h3>
            <p style="margin: 4px 0 0; font-size: 11px; color: var(--ink-soft);">${esc(getTalentCleanName(shoot.talent || shoot.title))} — tap photos to include or exclude them.</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="button" id="ppAll" class="btn btn-ghost" style="font-size: 10px; height: auto; padding: 6px 12px;">Select all</button>
            <button type="button" id="ppNone" class="btn btn-ghost" style="font-size: 10px; height: auto; padding: 6px 12px;">Clear</button>
          </div>
        </div>
        <div style="padding: 18px 22px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px;">
          ${photos.map((p, i) => `
            <button type="button" class="pp-item" data-idx="${i}" aria-pressed="true" style="position: relative; aspect-ratio: 4/5; border-radius: 8px; overflow: hidden; border: 2px solid var(--accent); padding: 0; cursor: pointer; background: var(--bone);">
              <img src="${esc(photoSrc(p))}" style="width: 100%; height: 100%; object-fit: cover; object-position: ${esc(p.objectPosition || "center")}; display: block;" alt="Photo ${i + 1}" loading="lazy" />
              <span class="pp-check" style="position: absolute; top: 6px; right: 6px; width: 20px; height: 20px; border-radius: 50%; background: var(--accent); color: #fff; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center;">✓</span>
              ${p.angle ? `<span style="position: absolute; bottom: 6px; left: 6px; font-family:'JetBrains Mono', monospace; font-size: 8px; font-weight: 700; background: rgba(0,0,0,0.72); color: #fff; padding: 2px 6px; border-radius: 3px; text-transform: uppercase;">${esc(angleShort[p.angle] || p.angle)}</span>` : ""}
            </button>
          `).join("")}
        </div>
        <div style="padding: 14px 22px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 12px; background: var(--bone);">
          <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
            <span style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--ink-soft);">PDF Orientation:</span>
            <label style="display: flex; align-items: center; gap: 6px; font-family:'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--ink);">
              <input type="radio" name="ppOrientation" value="auto" checked style="accent-color: var(--accent); margin: 0;" />
              Auto (Content-Aware)
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-family:'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--ink);">
              <input type="radio" name="ppOrientation" value="portrait" style="accent-color: var(--accent); margin: 0;" />
              Portrait
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-family:'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--ink);">
              <input type="radio" name="ppOrientation" value="landscape" style="accent-color: var(--accent); margin: 0;" />
              Landscape
            </label>
          </div>
          <div style="display: flex; gap: 20px; flex-wrap: wrap; border-top: 1px dashed var(--line); padding-top: 10px;">
            <label style="display: flex; align-items: center; gap: 8px; font-family:'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; text-transform: uppercase; cursor: pointer; color: var(--ink);">
              <input type="radio" name="ppMode" value="1" style="accent-color: var(--accent); margin: 0;" />
              1 page — compact card (1 lead + up to 4 side photos)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-family:'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; text-transform: uppercase; cursor: pointer; color: var(--ink);">
              <input type="radio" name="ppMode" value="2" checked style="accent-color: var(--accent); margin: 0;" />
              Multi-page — cover page + photo grids (6 per grid page)
            </label>
          </div>
        </div>
        <div style="padding: 16px 22px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; align-items: center; gap: 12px; background: var(--bone);">
          <span id="ppHint" style="font-size: 10px; color: var(--ink-soft); margin-right: auto; font-family:'JetBrains Mono', monospace;"></span>
          <button type="button" id="ppCancel" class="btn btn-ghost" style="font-size: 12px; height: auto; padding: 10px 18px;">Cancel</button>
          <button type="button" id="ppExport" class="btn btn-dark" style="font-size: 12px; height: auto; padding: 10px 18px; font-family:'JetBrains Mono', monospace; font-weight: 700;">Export PDF (${photos.length})</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const selected = new Set(photos.map((_, i) => i));
    const exportBtn = modal.querySelector("#ppExport");
    const hint = modal.querySelector("#ppHint");
    const paintItem = (el, on) => {
      el.style.borderColor = on ? "var(--accent)" : "var(--line)";
      el.setAttribute("aria-pressed", String(on));
      el.querySelector(".pp-check").style.display = on ? "flex" : "none";
      el.querySelector("img").style.opacity = on ? "1" : "0.35";
    };
    const pickedMode = () => Number(modal.querySelector('input[name="ppMode"]:checked')?.value || 2);
    const refresh = () => {
      exportBtn.textContent = `Export PDF (${selected.size} selected)`;
      exportBtn.disabled = selected.size === 0;
      if (!selected.size) { hint.textContent = "Nothing selected"; return; }
      if (pickedMode() === 1) {
        const capacity = 5;
        const used = Math.min(selected.size, capacity);
        hint.textContent = `Including ${used} of ${selected.size} selected` + (selected.size > capacity ? ` (compact 1-page mode uses first 5 photos)` : "");
      } else {
        const pages = Math.ceil(Math.max(0, selected.size - 1) / 6) + 1;
        hint.textContent = `Including all ${selected.size} selected photo${selected.size > 1 ? "s" : ""} across ${pages} page${pages > 1 ? "s" : ""}`;
      }
    };
    modal.querySelectorAll('input[name="ppMode"]').forEach(r => r.addEventListener("change", refresh));
    modal.querySelectorAll(".pp-item").forEach(el => {
      el.addEventListener("click", () => {
        const i = Number(el.dataset.idx);
        if (selected.has(i)) selected.delete(i); else selected.add(i);
        paintItem(el, selected.has(i));
        refresh();
      });
    });
    modal.querySelector("#ppAll").addEventListener("click", () => {
      photos.forEach((_, i) => selected.add(i));
      modal.querySelectorAll(".pp-item").forEach(el => paintItem(el, true));
      refresh();
    });
    modal.querySelector("#ppNone").addEventListener("click", () => {
      selected.clear();
      modal.querySelectorAll(".pp-item").forEach(el => paintItem(el, false));
      refresh();
    });
    const close = () => modal.remove();
    modal.querySelector("#ppCancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    exportBtn.addEventListener("click", () => {
      const chosen = photos.filter((_, i) => selected.has(i));
      if (!chosen.length) return;
      const mode = pickedMode();
      const orientation = modal.querySelector('input[name="ppOrientation"]:checked')?.value || "auto";
      close();
      printPortfolioPhotos(shoot, chosen, mode, orientation);
    });
    refresh();
  }

  // Full model portfolio export. Admin-only entry point in the Model
  // Portfolio lightbox sidebar. With more than one portfolio-tagged photo,
  // a picker lets the admin choose exactly which clicks go into the PDF.
  window.printModelPortfolio = (shootId) => {
    const shoot = SHOOTS.find(x => x.id === shootId) || (window.currentCompCardShootObj);
    if (!shoot) return;
    // Same selection rule as the Model Portfolio view: photos tagged
    // "portfolio" or "both" (untagged legacy photos count as portfolio).
    const photos = (shoot.photos || []).filter(p => p.usage === "portfolio" || p.usage === "both" || p.usage === undefined);
    if (!photos.length) { toast("No portfolio-tagged photos to export."); return; }
    if (photos.length > 1) openPortfolioPicker(shoot, photos);
    else printPortfolioPhotos(shoot, photos);
  };

  window.selectedCompCardOrientation = "portrait";
  window.setCompCardOrientation = (orient, inputEl) => {
    window.selectedCompCardOrientation = orient;
    const parent = inputEl ? inputEl.closest("#compCardOrientGroup") : document.getElementById("compCardOrientGroup");
    if (parent) {
      parent.querySelectorAll(".orient-radio-label").forEach(lbl => {
        lbl.style.background = "transparent";
        lbl.style.color = "var(--ink-soft)";
        lbl.classList.remove("active");
      });
      const targetLabel = inputEl ? inputEl.closest("label") : null;
      if (targetLabel) {
        targetLabel.style.background = "var(--ink)";
        targetLabel.style.color = "var(--paper)";
        targetLabel.classList.add("active");
      }
    }
  };

  window.triggerCompCardDownload = (shootId, orientation = "portrait") => {
    const targetOrient = orientation || window.selectedCompCardOrientation || "portrait";
    if (isAdmin()) {
      window.printCompCard(shootId, targetOrient);
      return;
    }
    
    let modal = document.getElementById("emailDownloadModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "emailDownloadModal";
      modal.style = `
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        opacity: 0;
        transition: opacity 0.3s ease;
      `;
      modal.innerHTML = `
        <div style="background: var(--bone); border: 1px solid var(--line); padding: 32px; border-radius: 16px; width: 100%; max-width: 420px; box-sizing: border-box; text-align: center; display: flex; flex-direction: column; gap: 20px; box-shadow: var(--shadow);">
          <div>
            <h3 style="font-family:'Outfit', sans-serif; font-size: 20px; font-weight: 700; margin: 0 0 8px; color: var(--ink);">Enter your Email</h3>
            <p style="font-size: 12px; color: var(--ink-soft); line-height: 1.5; margin: 0;">Please enter your email to proceed with downloading this talent comp card.</p>
            <p style="font-size: 10.5px; color: var(--accent); margin: 8px 0 0; font-family: 'JetBrains Mono', monospace; font-weight: 600; line-height: 1.4;">
              🎲 Note: Supporting images are randomly selected from all photos tagged to this model on each export.
            </p>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; text-align: left;">
            <label style="font-family:'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; font-weight: 700; color: var(--ink-soft);">Email Address</label>
            <input type="email" id="downloadEmailInput" placeholder="name@example.com" style="width: 100%; height: 42px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); border-radius: 8px; padding: 0 14px; box-sizing: border-box; font-size: 14px; outline: none; transition: border-color 0.2s;" />
            <span id="downloadEmailError" style="font-size: 10px; color: var(--accent); display: none; margin-top: 4px;">Please enter a valid email address.</span>
          </div>
          <div style="display: flex; gap: 12px; margin-top: 8px;">
            <button id="cancelEmailDownload" class="btn btn-ghost btn-block" style="flex: 1; height: 42px;">Cancel</button>
            <button id="submitEmailDownload" class="btn btn-dark btn-block" style="flex: 1; height: 42px; font-family:'JetBrains Mono', monospace; font-weight: 700;">Download</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      modal.querySelector("#cancelEmailDownload").addEventListener("click", () => {
        modal.style.opacity = "0";
        setTimeout(() => { modal.style.display = "none"; }, 300);
      });
    }
    
    const emailInput = modal.querySelector("#downloadEmailInput");
    const errorText = modal.querySelector("#downloadEmailError");
    emailInput.value = "";
    emailInput.style.borderColor = "var(--line)";
    errorText.style.display = "none";
    
    modal.style.display = "flex";
    modal.offsetHeight;
    modal.style.opacity = "1";
    emailInput.focus();
    
    const submitBtn = modal.querySelector("#submitEmailDownload");
    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.replaceWith(newSubmitBtn);
    
    newSubmitBtn.addEventListener("click", () => {
      const email = emailInput.value.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        emailInput.style.borderColor = "var(--accent)";
        errorText.textContent = "Please enter a valid email address.";
        errorText.style.display = "block";
        return;
      }

      errorText.style.display = "none";
      emailInput.style.borderColor = "var(--line)";

      const shoot = SHOOTS.find(x => x.id === shootId) || (window.currentCompCardShootObj);
      const modelName = shoot ? getTalentCleanName(shoot.talent || shoot.title) : "Unknown Model";

      // Best-effort analytics log — never blocks or fails the download itself,
      // since the visitor has no way to fix a backend outage on their end.
      fetch(`${COMP_CARD_API_BASE}/api/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          modelName,
          shootId,
          orientation: targetOrient,
          originUrl: window.location.origin
        })
      }).catch((err) => console.warn("Comp card download logging failed (non-blocking):", err));

      modal.style.opacity = "0";
      setTimeout(() => { modal.style.display = "none"; }, 300);

      window.printCompCard(shootId, targetOrient);
    });
  };

  // Auto-trigger Comp Card print preview when opening via magic email link
  (function checkMagicDownloadLink() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("downloadCompCard") === "1") {
      const shootId = params.get("shootId");
      const orientation = params.get("orientation") || "portrait";
      if (shootId) {
        const trigger = () => {
          setTimeout(() => {
            window.printCompCard(shootId, orientation);
          }, 800);
        };
        if (document.readyState === "complete" || document.readyState === "interactive") {
          trigger();
        } else {
          window.addEventListener("DOMContentLoaded", trigger);
        }
      }
    }
  })();

  window.downloadLogsCSV = () => {
    // The passcode is asked for on demand and never stored in the page's
    // public source; the log server compares its SHA-256 hash.
    const passcode = prompt("Enter admin passcode to download the logs CSV:");
    if (!passcode) return;
    window.location.href = `/api/logs/download?passcode=${encodeURIComponent(passcode.trim())}`;
  };

  /* ============================================================
     §17 · BOOT
     ============================================================ */
  // GitHub Pages caches data.js for ~10 minutes, so visitors can see a stale
  // portfolio right after a sync. Refetch it bypassing the cache and re-render
  // if the published shoots changed. Local (IndexedDB) shoots take precedence.
  async function refreshPublishedData() {
    try {
      const res = await fetch(`data.js?fresh=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const fresh = parseShootsFromDataJs(await res.text());
      if (!fresh || !usingDemo) return;
      if (JSON.stringify(fresh) === JSON.stringify(window.WPS_DATA.DEMO_SHOOTS)) return;
      window.WPS_DATA.DEMO_SHOOTS = fresh;
      await loadShoots();
      render();
    } catch { /* offline or unparsable — keep what we have */ }
  }

  function initRouting() {
    window.addEventListener("popstate", render);
    document.addEventListener("click", (e) => {
      const link = e.target.closest("[data-link]");
      if (link) {
        const href = link.getAttribute("href");
        if (href && (href.startsWith("/") || !href.includes("://"))) {
          e.preventDefault();
          history.pushState(null, "", href);
          render();
        }
      }
    });
  }

  function initBranding() {
    const cfg = window.STUDIO_CONFIG;
    if (!cfg) return;
    document.title = `${cfg.studioName} — The Creative Studio`;
    const loaderLbl = $("#loaderLabel");
    if (loaderLbl) loaderLbl.textContent = `${cfg.studioShortName} ${cfg.studioSubName}`;
    const headerBrandText = $("#headerBrandText");
    if (headerBrandText) headerBrandText.innerHTML = `<span style="text-transform: lowercase; font-weight: 800; font-size: 15px; letter-spacing: 0.02em;">${esc(cfg.studioName)}</span>`;
    const footerBrandText = $("#footerBrandText");
    if (footerBrandText) footerBrandText.innerHTML = `${esc(cfg.studioShortName)}<span class="brand-sub">${esc(cfg.studioSubName)}</span>`;
    const footerTagline = $("#footerTagline");
    if (footerTagline) footerTagline.textContent = cfg.tagline;
    const footerNotice = $("#footerNotice");
    if (footerNotice) footerNotice.textContent = `The Creative Studio of ${cfg.studioName}`;
    const navStudioDesc = $("#navStudioDesc");
    if (navStudioDesc) navStudioDesc.innerHTML = `The Creative Studio of<br />${esc(cfg.studioName)}`;
    const navEmail = $("#navEmail");
    if (navEmail) {
      navEmail.href = `mailto:${cfg.email}`;
      navEmail.textContent = cfg.email;
    }
    const navSocials = $("#navSocials");
    if (navSocials) {
      const links = [];
      if (cfg.instagram) {
        links.push(`<a href="${cfg.instagram}" target="_blank" rel="noopener" aria-label="Instagram"><svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg></a>`);
      }
      if (cfg.kavyar) {
        links.push(`<a href="${cfg.kavyar}" target="_blank" rel="noopener" aria-label="Kavyar"><svg viewBox="0 0 24 24" style="stroke-width: 2.5;"><line x1="6" y1="4" x2="6" y2="20"></line><line x1="18" y1="4" x2="6" y2="12"></line><line x1="6" y1="12" x2="18" y2="20"></line></svg></a>`);
      }
      navSocials.innerHTML = links.join("");
    }

    // Footer email link (mailto) — mirrors nav email.
    const footerEmail = $("#footerEmail");
    if (footerEmail && cfg.email) {
      footerEmail.href = `mailto:${cfg.email}`;
    }
    // Footer social icons — reuse the same set as the nav.
    const footerSocials = $("#footerSocials");
    if (footerSocials) {
      const fl = [];
      if (cfg.instagram) fl.push(`<a href="${cfg.instagram}" target="_blank" rel="noopener" aria-label="Instagram">Instagram</a>`);
      if (cfg.kavyar) fl.push(`<a href="${cfg.kavyar}" target="_blank" rel="noopener" aria-label="Kavyar">Kavyar</a>`);
      fl.push(`<a href="${cfg.email ? `mailto:${cfg.email}` : '#'}" aria-label="Email">Email</a>`);
      footerSocials.innerHTML = fl.join("");
    }
  }

  (async function boot() {
    // Order matters: admin URL params must apply before anything calls
    // isAdmin() or loadShoots(); chrome wiring must precede first render.
    applyAdminUrlParams();
    initLightbox();
    initNav();
    initAdminControls();
    initThemeControls();
    initHeaderScroll();
    initRouting();
    try {
      $("#year").textContent = new Date().getFullYear();
      initBranding();
      updateAdminBtn();
      await loadShoots();
      render();
      initFooterReveal();
      refreshPublishedData();
    } catch (err) {
      // Never leave the user on a blank page under the loader.
      console.error("boot failed:", err);
      view.innerHTML = `<section class="page-head"><div class="container"><h1>Something went wrong.</h1><p class="page-sub">Try reloading.</p></div></section>`;
    } finally {
      // Dismiss the loader no matter what — on load, or immediately if already loaded.
      if (document.readyState === "complete") dismissLoader();
      else window.addEventListener("load", dismissLoader, { once: true });
      // Hard safety: never let the loader trap the page.
      setTimeout(dismissLoader, 2500);
    }
  })();
})();
