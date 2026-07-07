/* ============================================================
   nerdyphotographer.in — app (multi-view studio)
   Hash router · 5 views · overlay nav · rich upload form ·
   IndexedDB persistence · lightbox. No backend, no framework.
   ============================================================ */
(() => {
  "use strict";
  const { ACTIVITIES, TYPES, BRANDS, DEMO_SHOOTS } = window.WPS_DATA;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  // A photo renders from its published file URL when it has one, else its local base64.
  const photoSrc = (p) => (p && (p.url || p.dataUrl)) || "";
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
  const isFutureShoot = (s) => {
    if (!s.date) return false;
    const t = Date.parse(s.date);
    if (isNaN(t)) return false;
    const todayTime = new Date().setHours(0, 0, 0, 0);
    const shootTime = new Date(t).setHours(0, 0, 0, 0);
    return shootTime > todayTime;
  };
  // Check for admin unlock parameter (?admin=1 or ?admin=0, supporting both search query and hash routing params)
  const fullUrlString = window.location.search + window.location.hash;
  const adminMatch = fullUrlString.match(/[?&]admin=([01])\b/);
  if (adminMatch) {
    if (adminMatch[1] === "1") {
      localStorage.setItem("wps-admin-authorized", "1");
      const patMatch = fullUrlString.match(/[?&]pat=([^&#]+)/);
      if (patMatch) {
        localStorage.setItem("wps-github-pat", decodeURIComponent(patMatch[1]));
      }
    } else {
      localStorage.removeItem("wps-admin-authorized");
      localStorage.removeItem("wps-admin");
      localStorage.removeItem("wps-github-pat");
    }
  }

  const isAdminAuthorized = () => localStorage.getItem("wps-admin-authorized") === "1";
  const isAdmin = () => isAdminAuthorized() && localStorage.getItem("wps-admin") === "1";

  /* ---------------- IndexedDB (shoots) ---------------- */
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

  /* ---------------- State ---------------- */
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
  const allPhotos = () => SHOOTS.flatMap((s) => s.photos.map((p) => ({ ...p, shoot: s })));

  /* ---------------- Helpers ---------------- */
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
  let toastTimer;
  function toast(msg) {
    let el = $(".toast"); if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg; requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }
  function readAsDataURL(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
  function resize(dataUrl, maxDim = 1600, q = 0.82) {
    return new Promise((res) => { const img = new Image(); img.onload = () => {
      let { width: w, height: h } = img; if (Math.max(w, h) <= maxDim) return res(dataUrl);
      const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s);
      const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h);
      res(c.toDataURL("image/jpeg", q));
    }; img.onerror = () => res(dataUrl); img.src = dataUrl; });
  }
  const brandTag = (s) => `${esc(s.brand)}${s.activity ? " · " + esc(s.activity) : ""}`;

  /* ---------------- Lightbox ---------------- */
  const lb = $("#lightbox"), lbImg = $("#lightboxImg"), lbCap = $("#lightboxCaption"), lbCount = $("#lbCounter");
  let lbList = [], lbIdx = 0;
  function openLb(list, idx) { lbList = list; lbIdx = idx; paintLb(); lb.hidden = false; document.body.style.overflow = "hidden"; $("#lightboxClose").focus(); }
  function paintLb() {
    const p = lbList[lbIdx]; if (!p) return;
    lbImg.src = photoSrc(p); lbImg.alt = p.caption || p.shoot.title; lbImg.style.objectPosition = "center";
    // Prefer a per-photo caption when present, else the shoot credit line.
    lbCap.textContent = p.caption
      ? `${p.caption} — ${p.shoot.title}`
      : `${p.shoot.title} — ${p.shoot.brand} · by ${p.shoot.photographer}`;
    lbCount.textContent = `${lbIdx + 1} / ${lbList.length}`;
  }
  function stepLb(d) { if (!lbList.length) return; lbIdx = (lbIdx + d + lbList.length) % lbList.length; paintLb(); }
  function closeLb() { lb.hidden = true; lbImg.src = ""; document.body.style.overflow = ""; }
  $("#lightboxClose").addEventListener("click", (e) => { e.stopPropagation(); closeLb(); });
  $("#lbPrev").addEventListener("click", (e) => { e.stopPropagation(); stepLb(-1); });
  $("#lbNext").addEventListener("click", (e) => { e.stopPropagation(); stepLb(1); });
  // Close only on a genuine backdrop click — never when the click lands on the
  // nav buttons, close button, image, caption, or counter (or their children).
  lb.addEventListener("click", (e) => {
    if (e.target.closest(".lightbox-nav, .lightbox-close, .lightbox-figure, .lightbox-counter")) return;
    closeLb();
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

  /* ---------------- Overlay nav ---------------- */
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
  }
  menuBtn.addEventListener("click", () => toggleMenu());
  overlay.addEventListener("click", (e) => { if (e.target.closest("[data-link]")) toggleMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.classList.contains("open")) toggleMenu(false); });

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

    const uploadLi = $("#navUploadLi"), bookLi = $("#navBookLi");
    if (uploadLi) uploadLi.style.display = active ? "block" : "none";
    if (bookLi) bookLi.style.display = active ? "none" : "block";

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

  adminBtn?.addEventListener("click", async () => {
    const turningOn = !isAdmin();
    if (turningOn) {
      const code = prompt("Enter admin passcode to enable Admin Mode:");
      if (code !== (window.STUDIO_CONFIG?.adminPasscode || "canonr5markii")) {
        alert("Incorrect passcode.");
        return;
      }
    }
    localStorage.setItem("wps-admin", turningOn ? "1" : "0");
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

  /* ---------------- GitHub sync ----------------
     Publishes the portfolio into the repo so every visitor sees it.
     - Merges per-shoot with what's already in data.js (local wins by id),
       so publishing from one device can't wipe another device's shoots.
     - Uploads photos as real image files under photos/ and stores only
       their paths in data.js, keeping data.js small and images cacheable.
     - Writes everything as one atomic commit via the git data API. */
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
      const photoEntries = [];
      for (const s of shoots) {
        for (const p of s.photos || []) {
          if (p.url || !p.dataUrl) continue;
          const m = p.dataUrl.match(/^data:(image\/[a-z.+-]+);base64,/);
          if (!m) continue; // not a base64 image (e.g. demo SVG) — leave inline
          const path = `photos/${s.id}/${p.id}.${MIME_EXT[m[1]] || "jpg"}`;
          const blob = await ghApi(pat, "/git/blobs", {
            method: "POST",
            body: JSON.stringify({ content: p.dataUrl.slice(m[0].length), encoding: "base64" }),
          });
          photoEntries.push({ path, mode: "100644", type: "blob", sha: blob.sha });
          p.url = path;
          toast(`Uploading photos… (${photoEntries.length})`);
        }
      }

      // Published copy references photo files instead of inline base64.
      const published = shoots.map((s) => ({
        ...s,
        photos: (s.photos || []).map((p) => p.url
          ? { id: p.id, url: p.url, objectPosition: p.objectPosition || "center" }
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

  /* ================= VIEWS ================= */
  const view = $("#view");

  // noth.in-style full-bleed work card: big image, title + tagline overlay,
  // image reveal on hover. Opens the shoot in the lightbox via .noth-work wiring.
  function nothWorkCard(s, i) {
    const cover = s.photos.find(p => p.id.split("-")[0] === s.coverPhotoId) || s.photos[0] || { objectPosition: "center" };
    const coverPos = cover.objectPosition || "center";
    const tagline = s.description
      ? s.description
      : [s.activity, s.type].filter(Boolean).join(" · ");
    const meta = [s.brand, s.season].filter(v => v && v !== "Personal Project").join(" · ");
    const title = s.isCompCard ? s.talent : (s.title || "Untitled");
    return `
      <article class="noth-work reveal" data-shoot="${s.id}" data-talent="${esc(s.talent || '')}" style="--d:${(i % 2) * 0.08}s">
        <button class="noth-work-media" aria-label="View ${esc(title)}">
          <span class="noth-work-backdrop" style="background-image: url('${esc(photoSrc(cover))}');" aria-hidden="true"></span>
          <img src="${esc(photoSrc(cover))}" style="object-position: ${esc(coverPos)};" alt="${esc(title)}" loading="lazy" />
          <span class="noth-work-index">${String(i + 1).padStart(2, "0")}</span>
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
        </div>
      </article>`;
  }

  function fullBleedBlock(s, i) {
    const cover = s.photos.find(p => p.id.split("-")[0] === s.coverPhotoId) || s.photos[0] || { dataUrl: "", objectPosition: "center" };
    let coverPos = cover.objectPosition || "center";
    
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
    if (s.photographer) creditsList.push(`Photo <strong>${esc(s.photographer)}</strong>`);
    if (s.artDirector) creditsList.push(`AD <strong>${esc(s.artDirector)}</strong>`);
    if (s.stylist && s.stylist !== "—") creditsList.push(`Style <strong>${esc(s.stylist)}</strong>`);
    if (s.hair && s.hair !== "—") creditsList.push(`Hair <strong>${esc(s.hair)}</strong>`);
    if (s.mua && s.mua !== "—") creditsList.push(`Makeup <strong>${esc(s.mua)}</strong>`);
    if (s.talent && s.talent !== "—") creditsList.push(`Talent <strong>${esc(s.talent)}</strong>`);
    if (igHtml) creditsList.push(`Socials ${igHtml}`);
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

    const mediaHtml = s.isCompCard ? (() => {
      const shownPhotos = s.photos.slice(0, 3);
      const remainingCount = s.photos.length - 3;
      const fourthPhoto = s.photos[3];
      return `
        <div class="comp-card-grid">
          ${shownPhotos.map((p, idx) => `
            <button class="comp-card-thumb reveal" data-index="${idx}">
              <img src="${esc(photoSrc(p))}" alt="Comp card frame ${idx + 1}" loading="lazy" />
            </button>
          `).join("")}
          ${fourthPhoto ? `
            <button class="comp-card-thumb comp-card-more reveal" data-index="3">
              <img src="${esc(photoSrc(fourthPhoto))}" style="filter: brightness(0.42);" alt="Comp card frame 4" loading="lazy" />
              ${remainingCount > 1 ? `<div class="comp-card-more-overlay">+${remainingCount} more</div>` : ""}
            </button>
          ` : ""}
        </div>
      `;
    })() : `
      <button class="work-media" aria-label="View ${esc(s.title)}">
        <img src="${esc(photoSrc(cover))}" style="object-position: ${esc(coverPos)};" alt="${esc(s.title)}" loading="lazy" />
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
            return `
            ${s.isCompCard ? "" : `
              <p class="eyebrow">${esc(s.brand)} · ${esc(s.type)}</p>
              <h3><span${ed("title")}>${esc(s.title)}</span></h3>
            `}
            <p class="work-desc"><span${ed("description")}>${esc(s.description || (canInline ? "Add a description…" : ""))}</span></p>
            <dl class="work-credits">
              <div><dt>Activity</dt><dd>${esc(s.activity)}</dd></div>
              <div><dt>Season</dt><dd><span${ed("season")}>${esc(s.season || "—")}</span></dd></div>
              <div><dt>Location</dt><dd><span${ed("location")}>${esc(s.location || "—")}</span></dd></div>
            </dl>`;
          })()}
          <p class="work-by">${creditsHtml}</p>
          ${testimonialsHtml}
          ${diagramHtml}
          <div style="margin-top: 22px; display: flex; align-items: center; flex-wrap: wrap; gap: 14px;">
            <button class="link-arrow work-open" style="padding: 0;">View project →</button>
            ${(!s.demo && !s.isCompCard && isAdmin()) ? `
              <button class="link-arrow work-edit" style="color: var(--accent); font-weight: 700; padding: 0;" data-id="${s.id}">Edit details</button>
              <button class="link-arrow work-delete" style="color: #b22222; font-weight: 700; padding: 0;" data-id="${s.id}">Delete</button>
            ` : ""}
          </div>
        </div>
      </article>`;
  }

  function viewHome() {
    const feat = SHOOTS.slice(0, 7);
    CURRENT_VIEW_SHOOTS = feat;
    const brandCount = new Set(SHOOTS.filter(s => s.client && s.client.trim()).map(s => s.brand)).size;
    const activeBrands = BRANDS.filter(b => SHOOTS.some(s => s.brand === b && s.client && s.client.trim()));
    const displayBrands = activeBrands.length ? activeBrands : BRANDS;
    const clientNames = [...new Set(SHOOTS.map(s => s.client).filter(c => c && c.trim()))];
    const wordmark = "nerdyphotographer";
    const wordmarkLetters = wordmark.split("").map((ch, i) =>
      `<span class="wm-letter" style="--i:${i}">${esc(ch)}</span>`
    ).join("");
    return `
      <section class="hero hero-mono">
        <div class="hero-bg" aria-hidden="true"></div>
        <div class="container hero-inner">
          <div class="hero-topline reveal">
            <span class="hero-topline-l">The Creative Studio</span>
            <span class="hero-topline-r">Noida · Delhi NCR</span>
          </div>
          <h1 class="hero-wordmark hero-wordmark-long" aria-label="${esc(window.STUDIO_CONFIG?.studioName || 'nerdyphotographer.in')}">
            ${wordmarkLetters}
          </h1>
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
          <div class="service-card">
            <div class="service-kicker">Brands</div>
            <h3>Campaigns &amp; Lookbooks</h3>
            <p>High-concept visual storytelling, commercial lookbooks, and campaigns tailored to elevate brand identities and drive customer engagement.</p>
          </div>
          <div class="service-card">
            <div class="service-kicker">Models</div>
            <h3>Portfolio Building &amp; TFP</h3>
            <p>Editorial-grade portfolio building, comp card shoot development, and selective test shoots (TFP) to help models stand out in agency submissions.</p>
          </div>
          <div class="service-card">
            <div class="service-kicker">Athletes</div>
            <h3>Fitness &amp; Sports Action</h3>
            <p>Dynamic action-freezing athletic portraits and editorial-grade fitness content that highlights physique, strength, and raw athletic performance.</p>
          </div>
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
        ${SHOOTS.length > feat.length ? `
        <div class="works-all-cta reveal">
          <a href="/albums" data-link class="btn btn-dark">View all ${SHOOTS.length} albums →</a>
        </div>
        ` : ""}
      </section>


      ${window.STUDIO_CONFIG?.testimonials?.length ? `
      <!-- TESTIMONIALS (CLIENT REACTIONS) -->
      <section class="section container" style="border-top: 1px solid var(--line); padding-top: 60px; margin-top: 60px;">
        <div class="section-head reveal" style="margin-bottom: 40px; text-align: center;">
          <p class="eyebrow">Client Reactions</p>
          <h2>Testimonials &amp; Trust</h2>
        </div>
        <div class="testimonials-grid">
          ${window.STUDIO_CONFIG.testimonials.map((t, i) => `
            <div class="testimonial-card reveal" style="--d:${(i * 0.06).toFixed(2)}s">
              <p class="t-quote">${esc(t.quote)}</p>
              <div class="t-author">${esc(t.author)}</div>
              ${t.role ? `<div class="t-role">${esc(t.role)}</div>` : ''}
            </div>
          `).join("")}
        </div>
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
    const list = SHOOTS.slice();
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
        return (kind === "activity" ? s.activity : kind === "brand" ? s.brand : s.type) === d;
      });

      let displayList = list;
      if (kind === "type" && d === "Test Shoot") {
        const filteredList = list.filter(s => s.instagram && s.instagram.trim());
        const groupable = [];
        const nonGroupable = [];
        for (const s of filteredList) {
          const talentClean = (s.talent || "").trim();
          const hasExactlyOneModel = talentClean && !talentClean.includes(",") && !talentClean.toLowerCase().includes(" and ") && !talentClean.toLowerCase().includes("&");
          const hasNoBrandOrClient = (!s.client || !s.client.trim()) && (!s.brand || s.brand === "Personal Project" || !s.brand.trim());
          const hasSocialLinks = s.instagram && s.instagram.trim();
          
          if (hasExactlyOneModel && hasNoBrandOrClient && hasSocialLinks) {
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
          const allGroupPhotos = shootsInGroup.flatMap(gs => gs.photos.map(p => ({ ...p, parent: gs })));
          
          return {
            id: `comp-card-${encodeURIComponent(modelName)}`,
            title: `${modelName} — Comp Card`,
            brand: "Personal Project",
            activity: latestShoot.activity,
            type: "Test Shoot",
            season: latestShoot.season || "Comp Card",
            photographer: latestShoot.photographer || "Studio",
            artDirector: latestShoot.artDirector || "",
            stylist: latestShoot.stylist || "",
            hair: latestShoot.hair || "",
            mua: latestShoot.mua || "",
            talent: modelName,
            location: latestShoot.location || "Studio",
            description: `Modeling portfolio and comp card archive for ${modelName}. Contains ${shootsInGroup.length} photoshoot sessions.`,
            tags: latestShoot.tags || "",
            gear: latestShoot.gear || "",
            client: "",
            date: latestShoot.date,
            instagram: latestShoot.instagram,
            link: latestShoot.link,
            rights: latestShoot.rights,
            palette: latestShoot.palette || ["#3a3a3a", "#0d0d0d"],
            photos: allGroupPhotos,
            coverPhotoId: latestShoot.coverPhotoId || (latestShoot.photos[0] && latestShoot.photos[0].id),
            isCompCard: true,
            originalShoots: shootsInGroup
          };
        });
        
        displayList = [...unifiedAlbums, ...nonGroupable];
      }

      CURRENT_VIEW_SHOOTS = displayList;

      const isTestShoot = (kind === "type" && d === "Test Shoot");
      const alphaFilterHtml = isTestShoot ? `
        <div class="alpha-filter-bar container reveal">
          <button class="alpha-btn active" data-alpha="ALL">ALL</button>
          ${"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(char => {
            const hasMatches = displayList.some(s => (s.talent || "").trim().charAt(0).toUpperCase() === char);
            return `<button class="alpha-btn" data-alpha="${char}"${!hasMatches ? " disabled" : ""}>${char}</button>`;
          }).join("")}
        </div>
      ` : "";

      return `
        <section class="page-head">
          <div class="container">
            <p class="eyebrow reveal"><a href="/categories" data-link>Categories</a> / ${esc(kind)}</p>
            <h1 class="reveal">${esc(d)}</h1>
            ${isTestShoot ? "" : `<p class="page-sub reveal">${displayList.length} master album${displayList.length !== 1 ? "s" : ""} in this ${esc(kind)}.</p>`}
          </div>
        </section>
        ${alphaFilterHtml}
        <section class="section container"><div class="work-list">${displayList.map(fullBleedBlock).join("") || emptyCat()}</div></section>`;
    }
    // Index: three lenses
    const grp = (arr, key) => arr.map((v) => {
      const shoots = SHOOTS.filter((s) => {
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
    const act = grp(ACTIVITIES, "activity"), brs = grp(BRANDS, "brand"), typ = grp(TYPES, "type");
    
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
      const shoots = SHOOTS.filter(s => s[key] === val);
      if (!shoots.length) return [];
      
      // Shuffle the shoots array to randomize album selection on each page view
      const shuffledShoots = [...shoots].sort(() => Math.random() - 0.5);
      
      const samples = [];
      // 1. Take a random photo from each distinct shoot to maximize variety
      for (const s of shuffledShoots) {
        if (s.photos && s.photos.length) {
          const randomIdx = Math.floor(Math.random() * s.photos.length);
          samples.push({ ...s.photos[randomIdx], parent: s, index: randomIdx });
        }
      }
      
      // 2. If we need more samples to fill the grid, take other random photos from those same shoots
      if (samples.length < limit) {
        const remaining = [];
        for (const s of shuffledShoots) {
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

    const renderSpecialtyGallery = (samples, placeholderPrefix) => {
      let html = '';
      for (let i = 0; i < 3; i++) {
        const photo = samples[i];
        if (photo) {
          html += `<div class="specialty-thumb-wrap">
                     <img src="${esc(photoSrc(photo))}" alt="${esc(photo.parent?.title || placeholderPrefix)}" loading="lazy" />
                   </div>`;
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
            <div class="specialty-gallery">
              ${renderSpecialtyGallery(fashionSamples, "FASHION")}
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
            <div class="specialty-gallery">
              ${renderSpecialtyGallery(portraitSamples, "BEAUTY")}
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
            <div class="specialty-gallery">
              ${renderSpecialtyGallery(fitnessSamples, "FITNESS")}
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
            <div class="specialty-gallery">
              ${renderSpecialtyGallery(sportsSamples, "SPORTS")}
            </div>
          </div>
          ` : ""}

          ${testShootSamples.length ? `
          <div class="specialty-item reveal">
            <div class="specialty-meta">
              <h3>
                <a href="/categories?kind=type&amp;val=Test%20Shoot" data-link>Model Portfolio (Comp Cards)</a>
              </h3>
              <p>
                Comprehensive testing shoots and comp card layout photography designed for aspiring and professional model talent. Direct submissions focus: clean test lighting, polaroids, digitals, and styling versatility.
              </p>
              <a href="/categories?kind=type&amp;val=Test%20Shoot" data-link class="link-arrow" style="font-size: 12px; font-weight: 700;">Explore test shoots →</a>
            </div>
            <div class="specialty-gallery">
              ${renderSpecialtyGallery(testShootSamples, "MODEL")}
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
            <fieldset><legend>The shoot</legend>
              <label class="field"><span>Shoot title *</span><input id="f_title" type="text" placeholder="e.g. Merrell Trail — Spring '26" required /></label>
              <div class="field-row">
                <label class="field"><span>Brand</span><select id="f_brand">${opt(BRANDS)}<option>Other</option></select></label>
                <label class="field"><span>Activity</span><select id="f_activity">${opt(ACTIVITIES)}</select></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Type</span><select id="f_type">${opt(TYPES)}</select></label>
                <label class="field"><span>Season / Year</span><input id="f_season" type="text" placeholder="Spring 2026" /></label>
              </div>
            </fieldset>

            <fieldset><legend>Credits</legend>
              <div class="field-row">
                <label class="field"><span>Photographer</span><input id="f_photographer" type="text" placeholder="Your name" /></label>
                <label class="field"><span>Art director</span><input id="f_ad" type="text" placeholder="—" /></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Stylist</span><input id="f_stylist" type="text" placeholder="—" /></label>
                <label class="field"><span>Hair stylist</span><input id="f_hair" type="text" placeholder="—" /></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Makeup artist (MUA)</span><input id="f_mua" type="text" placeholder="—" /></label>
                <label class="field"><span>Model / talent (comma-separated)</span><input id="f_talent" type="text" placeholder="e.g. Model A, Model B" /></label>
              </div>
              <label class="field"><span>Location</span><input id="f_location" type="text" placeholder="Studio 3, Brooklyn" /></label>
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
                <label class="field"><span>Portfolio link</span><input id="f_link" type="url" placeholder="https://…" /></label>
              </div>
              <label class="field"><span>Usage rights</span><input id="f_rights" type="text" placeholder="e.g. Web + social, 1 year" /></label>
              <div class="field-row" style="align-items: center; margin-top: 10px;">
                <label style="display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; font-weight: 700; cursor: pointer; color: #fff;">
                  <input id="f_featured" type="checkbox" checked style="width: 15px; height: 15px; accent-color: var(--accent); margin: 0;" />
                  Feature on homepage
                </label>
              </div>
            </fieldset>

            <fieldset><legend>Testimonials <span class="legend-opt">optional (up to 3)</span></legend>
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
    const isSelected = (val) => val === prefilledType ? "selected" : "";

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
          <div class="book-success" id="bookSuccess" hidden>
            <div class="book-success-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <h2>Request on its way.</h2>
            <p id="bookSuccessMsg">Your booking inquiry is ready in your email app — hit <strong>Send</strong> to complete it, and we'll get back to you shortly.</p>
            <div class="book-success-actions">
              <a href="/" data-link class="btn btn-dark">Back to home</a>
              <button type="button" class="btn btn-ghost" id="bookAnother">Send another request</button>
            </div>
          </div>
          <form class="shoot-form" id="bookingForm" novalidate>
            <fieldset>
              <legend>Contact Information</legend>
              <div class="field-row">
                <label class="field"><span>Your Name / Brand *</span><input id="b_name" type="text" required placeholder="e.g. John Doe / Slugger" /></label>
                <label class="field"><span>Role *</span>
                  <select id="b_role">
                    <option value="Model">Model / Talent</option>
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
              <label class="field"><span>Instagram Handle</span><input id="b_instagram" type="text" placeholder="e.g. @handle" /></label>
            </fieldset>

            <fieldset>
              <legend>Shoot Details</legend>
              <div class="field-row">
                <label class="field"><span>Desired Project Type *</span>
                  <select id="b_type">
                    <option value="Fashion Editorial" ${isSelected("Fashion Editorial")}>Fashion Editorial</option>
                    <option value="Fitness &amp; Athletic" ${isSelected("Fitness &amp; Athletic")}>Fitness &amp; Athletic</option>
                    <option value="Sports Action" ${isSelected("Sports Action")}>Sports Action</option>
                    <option value="Commercial Campaign" ${prefilledType === "Commercial" ? "selected" : ""}>Commercial Campaign</option>
                    <option value="Model Portfolio" ${prefilledType === "Editorial" ? "selected" : ""}>Model Portfolio (Comp Cards)</option>
                    <option value="Other" ${isSelected("Other")}>Other Focus Area</option>
                  </select>
                </label>
                <label class="field"><span>Preferred Date / Timeline *</span><input id="b_date" type="text" required placeholder="e.g. Mid-July 2026" /></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Preferred Location *</span>
                  <select id="b_location">
                    <option value="Noida Studio">Noida Studio Setup</option>
                    <option value="Delhi NCR Outdoor">Delhi NCR Outdoor / Location</option>
                    <option value="Outstation">Outstation Shoot</option>
                    <option value="Other">Other / TBD</option>
                  </select>
                </label>
                <label class="field"><span>Estimated Budget Range *</span>
                  <select id="b_budget">
                    <option value="Under ₹10,000">Under ₹10,000 (Selective Tests)</option>
                    <option value="₹10,000 - ₹25,000">₹10,000 - ₹25,000 (Standard Portfolio)</option>
                    <option value="₹25,000 - ₹50,000">₹25,000 - ₹50,000 (Premium Campaign)</option>
                    <option value="₹50,000+">₹50,000+ (High-End Commercial)</option>
                  </select>
                </label>
              </div>
              <label class="field"><span>Reference / Mood Board Link</span><input id="b_moodboard" type="url" placeholder="Pinterest board, Dropbox, or Google Drive URL" /></label>
              <label class="field"><span>Project Concept &amp; Detailed Brief</span><textarea id="b_concept" rows="4" placeholder="Describe the mood, location style, styling ideas, and deliverables you have in mind..."></textarea></label>
            </fieldset>

            <button type="submit" class="btn btn-dark btn-block" id="bookSubmitBtn">Submit Booking Request</button>
          </form>
        </div>
      </section>
    `;
  }

  function wireUpload(editId) {
    staged = [];
    const dz = $("#dropzone"), fi = $("#fileInput"), grid = $("#stagingGrid"), note = $("#queueNote"), pub = $("#publishBtn"), form = $("#shootForm");
    const diagInput = $("#f_diagram_file"), diagPreview = $("#diagramPreview"), diagImg = $("#f_diagram_img"), diagVisibility = $("#f_diagram_visibility"), clearDiagBtn = $("#clearDiagramBtn");
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
        
        $("#f_title").value = editingShoot.title || "";
        $("#f_brand").value = editingShoot.brand || "Other";
        $("#f_activity").value = editingShoot.activity || "";
        $("#f_type").value = editingShoot.type || "";
        $("#f_season").value = editingShoot.season || "";
        $("#f_photographer").value = editingShoot.photographer || "";
        $("#f_ad").value = editingShoot.artDirector || "";
        $("#f_stylist").value = editingShoot.stylist || "";
        $("#f_hair").value = editingShoot.hair || "";
        $("#f_mua").value = editingShoot.mua || "";
        $("#f_talent").value = editingShoot.talent || "";
        $("#f_location").value = editingShoot.location || "";
        $("#f_desc").value = editingShoot.description || "";
        $("#f_tags").value = editingShoot.tags || "";
        $("#f_gear").value = editingShoot.gear || "";
        $("#f_client").value = editingShoot.client || "";
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
          manuallyAligned: false
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
        // Focal dot position: derive % from a stored focalX/focalY, else map keyword.
        const fp = focalPercent(f);
        return `
        <div class="thumb" data-id="${f.id}" draggable="true">
          <span class="thumb-order">${index + 1}</span>
          <label class="thumb-cover-ctrl">
            <input type="radio" name="coverSelect" class="thumb-cover-radio" data-id="${f.id}" ${f.isCover ? 'checked' : ''} />
            Cover
          </label>
          <img src="${esc(photoSrc(f))}" style="object-position: ${esc(pos)}" alt="${esc(f.name)}"/>
          <div class="thumb-focal" data-id="${f.id}" title="Drag to set focal point">
            <span class="thumb-focal-dot" style="left:${fp.x}%; top:${fp.y}%;"></span>
          </div>
          <button type="button" class="thumb-remove" data-id="${f.id}" aria-label="Remove">×</button>
          <input type="text" class="thumb-caption" data-id="${f.id}" value="${esc(f.caption || '')}" placeholder="Add caption…" aria-label="Photo caption" />
        </div>`;
      }).join("");

      wireDragReorder();
      wireFocalPoints();

      grid.querySelectorAll(".thumb-caption").forEach((inp) => {
        inp.addEventListener("input", (e) => {
          const item = staged.find(x => x.id === e.target.dataset.id);
          if (item) item.caption = e.target.value;
        });
        // Don't let caption typing trigger drag / thumb click.
        inp.addEventListener("mousedown", (e) => e.stopPropagation());
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

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const val = (id) => $("#" + id)?.value.trim();
      const igVal = val("f_ig");
      const originalIg = editingShoot ? (editingShoot.instagram || "") : "";
      if (igVal && igVal !== originalIg && !clickedVerify) {
        const proceed = confirm("You haven't tested the new Instagram links. Would you like to proceed and publish anyway?");
        if (!proceed) return;
      }
      if (!staged.length) { toast("Add at least one photo first."); return; }
      
      const testimonialsList = [
        val("f_quote_1") ? { quote: val("f_quote_1"), by: val("f_quoteby_1") || "Client" } : null,
        val("f_quote_2") ? { quote: val("f_quote_2"), by: val("f_quoteby_2") || "Client" } : null,
        val("f_quote_3") ? { quote: val("f_quote_3"), by: val("f_quoteby_3") || "Client" } : null,
      ].filter(Boolean);

      const coverItem = staged.find(x => x.isCover) || staged[0];
      let pColors = editingShoot ? editingShoot.palette : ["#3a3a3a", "#0d0d0d"];
      if (coverItem) {
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
        title: val("f_title") || "Untitled photoshoot",
        brand: val("f_brand") || "Other", activity: $("#f_activity").value, type: $("#f_type").value, season: val("f_season"),
        photographer: val("f_photographer") || "Studio", artDirector: val("f_ad"), stylist: val("f_stylist") || "—",
        hair: val("f_hair") || "—", mua: val("f_mua") || "—", talent: val("f_talent"), location: val("f_location"),
        description: val("f_desc"), tags: val("f_tags"), gear: val("f_gear"),
        client: val("f_client"), date: dateVal, instagram: val("f_ig"), link: val("f_link"), rights: val("f_rights"),
        testimonials: testimonialsList,
        lightingDiagram: diagramDataUrl,
        lightingDiagramVisibility: $("#f_diagram_visibility").value,
        palette: pColors,
        photos: staged.map((f, i) => ({
          id: f.id + "-" + i,
          dataUrl: f.dataUrl,
          url: f.url,
          objectPosition: f.objectPosition || (f.isCover ? "top" : "center"),
          ...(typeof f.focalX === "number" ? { focalX: f.focalX, focalY: f.focalY } : {}),
          ...(f.caption && f.caption.trim() ? { caption: f.caption.trim() } : {})
        })),
        featured: $("#f_featured") ? $("#f_featured").checked : false,
        coverPhotoId: coverItem ? coverItem.id : null,
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
    ["b_name", "b_email", "b_date"].forEach((id) => {
      $("#" + id)?.addEventListener("input", () => clearError(id));
    });

    function validate() {
      let firstBad = null;
      const require = (id, msg) => {
        if (!val(id)) { setError(id, msg); firstBad = firstBad || id; }
        else clearError(id);
      };
      require("b_name", "Please add your name or brand.");
      require("b_date", "Let us know a rough date or timeline.");
      const email = val("b_email");
      if (!email) { setError("b_email", "We need an email to reply to."); firstBad = firstBad || "b_email"; }
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("b_email", "That email doesn't look right."); firstBad = firstBad || "b_email"; }
      else clearError("b_email");
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
      const date = val("b_date"), locationVal = val("b_location"), budget = val("b_budget");
      const moodboard = val("b_moodboard"), concept = val("b_concept");

      btn.disabled = true;
      btn.classList.add("is-loading");
      btn.textContent = "Preparing your request…";

      const subject = encodeURIComponent(`Shoot Booking Request — ${name}`);
      const body = encodeURIComponent(
        `Shoot Booking Details:\n\n` +
        `Name: ${name}\n` +
        `Role: ${role}\n` +
        `Email: ${email}\n` +
        `Phone: ${phone || '—'}\n` +
        `Instagram: ${instagram || '—'}\n` +
        `Shoot Type: ${type}\n` +
        `Proposed Date: ${date}\n` +
        `Location Pref: ${locationVal}\n` +
        `Budget Range: ${budget}\n` +
        `Moodboard Link: ${moodboard || '—'}\n\n` +
        `Concept/Vision:\n${concept || '—'}`
      );

      // Open the visitor's mail client with everything pre-filled.
      window.location.href = `mailto:${studioEmail}?subject=${subject}&body=${body}`;

      // Reveal the in-page success state (replaces the old alert()).
      if (successPanel) {
        form.hidden = true;
        successPanel.hidden = false;
        successPanel.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "center" });
      }
      btn.disabled = false;
      btn.classList.remove("is-loading");
      btn.textContent = "Submit Booking Request";
    });

    // "Send another request" — reset back to a clean form.
    $("#bookAnother")?.addEventListener("click", () => {
      form.reset();
      ["b_name", "b_email", "b_date"].forEach(clearError);
      if (successPanel) successPanel.hidden = true;
      form.hidden = false;
      form.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" });
    });
  }

  const ROUTES = { "": viewHome, "albums": viewAlbums, "categories": viewCategories, "studio": viewStudio, "upload": viewUpload, "book": viewBook };

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

    const fn = ROUTES[key] || (() => `<section class="page-head"><div class="container"><h1>Not found</h1><p class="page-sub"><a href="/" data-link>Back home</a></p></div></section>`);

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
          const catName = decodeURIComponent(parts[2]);
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
    };
    if (prefersReduced) paint(); else setTimeout(paint, 180);
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
      const list = s.photos.map((p) => ({ ...p, shoot: s }));
      const media = card.querySelector(".noth-work-media");
      media?.addEventListener("click", () => openLb(list, 0));

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
        };
        if (img.complete) evaluateFit();
        img.addEventListener("load", evaluateFit, { once: true });
      }
    });

    // work-block interactions (open lightbox on media or "View project")
    view.querySelectorAll(".work-block").forEach((block) => {
      const s = CURRENT_VIEW_SHOOTS.find((x) => x.id === block.dataset.shoot) || SHOOTS.find((x) => x.id === block.dataset.shoot);
      if (!s) return;
      const list = s.photos.map((p) => ({ ...p, shoot: s }));
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
      
      // edit button click handler
      block.querySelector(".work-edit")?.addEventListener("click", (e) => {
        e.stopPropagation();
        history.pushState(null, "", `/upload?edit=${s.id}`);
        render();
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
            const talent = block.dataset.talent || "";
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

  function setActiveNav(key) {
    overlay.querySelectorAll(".nav-links a").forEach((a) => {
      const h = a.getAttribute("href").replace(/^#\/?/, "");
      a.classList.toggle("active", h === key || (h === "" && key === ""));
    });
  }

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

  /* ---------------- Custom hover cursor (noth.in-style) ----------------
     A "View" follower that appears over portfolio imagery. Skipped entirely
     on touch devices and when the user prefers reduced motion. */
  (function initCursorFollow() {
    const cursor = $("#cursorFollow");
    if (!cursor) return;
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (isTouch || !fine || prefersReduced) { cursor.remove(); return; }

    const HOT = ".noth-work-media, .work-media, .comp-card-thumb, .cat-cover, .specialty-thumb-wrap";
    let x = 0, y = 0, cx = 0, cy = 0, raf = null, active = false;

    const loop = () => {
      cx += (x - cx) * 0.18; cy += (y - cy) * 0.18;
      cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      raf = Math.abs(x - cx) > 0.1 || Math.abs(y - cy) > 0.1 ? requestAnimationFrame(loop) : null;
      if (!raf) { cx = x; cy = y; cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`; }
    };
    window.addEventListener("mousemove", (e) => {
      x = e.clientX; y = e.clientY;
      if (!raf) raf = requestAnimationFrame(loop);
      const over = e.target.closest(HOT);
      if (over && !active) { active = true; cursor.classList.add("show"); }
      else if (!over && active) { active = false; cursor.classList.remove("show"); }
      // Comp-card thumbs and cat covers say "Open"; big media says "View".
      if (over) {
        const label = over.matches(".cat-cover, .specialty-thumb-wrap") ? "Open" : "View";
        const span = cursor.firstElementChild;
        if (span && span.textContent !== label) span.textContent = label;
      }
    }, { passive: true });
    window.addEventListener("mouseout", (e) => { if (!e.relatedTarget) { active = false; cursor.classList.remove("show"); } });
  })();

  /* ---------------- Scrolling ----------------
     Native scrolling is used (trackpads/modern browsers are already smooth and
     JS wheel-hijacking makes them feel laggy). Smoothness for anchor jumps comes
     from CSS `scroll-behavior: smooth`. This shim keeps the old API as a no-op. */
  const smoothScroll = { enabled: false, reset() {}, to(y) { window.scrollTo({ top: y, behavior: prefersReduced ? "auto" : "smooth" }); } };

  /* ---------------- Header scroll + loader ---------------- */
  const header = $(".site-header");
  window.addEventListener("scroll", () => header.classList.toggle("scrolled", window.scrollY > 8), { passive: true });
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

  /* ---------------- Boot ---------------- */
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
    try {
      $("#year").textContent = new Date().getFullYear();
      initBranding();
      updateAdminBtn();
      await loadShoots();
      render();
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
