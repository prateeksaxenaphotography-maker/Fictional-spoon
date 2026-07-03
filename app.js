/* ============================================================
   thenerdyphotographer.in — app (multi-view studio)
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
    
    SHOOTS = (usingDemo ? (window.WPS_DATA.DEMO_SHOOTS || DEMO_SHOOTS) : real).sort((a, b) => parseShootDate(b) - parseShootDate(a));
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
  function paintLb() { const p = lbList[lbIdx]; if (!p) return; lbImg.src = photoSrc(p); lbImg.alt = p.shoot.title; lbImg.style.objectPosition = p.objectPosition || "center"; lbCap.textContent = `${p.shoot.title} — ${p.shoot.brand} · by ${p.shoot.photographer}`; lbCount.textContent = `${lbIdx + 1} / ${lbList.length}`; }
  function stepLb(d) { if (!lbList.length) return; lbIdx = (lbIdx + d + lbList.length) % lbList.length; paintLb(); }
  function closeLb() { lb.hidden = true; lbImg.src = ""; document.body.style.overflow = ""; }
  $("#lightboxClose").addEventListener("click", closeLb);
  $("#lbPrev").addEventListener("click", () => stepLb(-1));
  $("#lbNext").addEventListener("click", () => stepLb(1));
  lb.addEventListener("click", (e) => { if (e.target === lb) closeLb(); });
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
  }
  adminBtn?.addEventListener("click", () => {
    const turningOn = !isAdmin();
    if (turningOn) {
      const code = prompt("Enter admin passcode to enable Admin Mode:");
      if (code !== (window.STUDIO_CONFIG?.adminPasscode || "canonr5markii")) {
        alert("Incorrect passcode.");
        return;
      }
    }
    localStorage.setItem("wps-admin", turningOn ? "1" : "0");
    updateAdminBtn();
    toast(`Admin Mode ${isAdmin() ? "enabled" : "disabled"}.`);
    render();
  });

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
   thenerdyphotographer.in — published portfolio data
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

  function fullBleedBlock(s, i) {
    const cover = s.photos.find(p => p.id.split("-")[0] === s.coverPhotoId) || s.photos[0] || { dataUrl: "", objectPosition: "top" };
    let coverPos = cover.objectPosition || "top";
    if (coverPos === "center") coverPos = "top";
    else if (coverPos === "center center") coverPos = "center";
    
    // Parse multiple Instagram accounts/URLs to clickable links
    let igHtml = "";
    if (s.instagram) {
      const handles = s.instagram.split(",").map(x => x.trim()).filter(Boolean);
      igHtml = handles.map(h => {
        let clean = h;
        if (h.includes("instagram.com")) {
          try {
            let val = h;
            if (!val.startsWith("http://") && !val.startsWith("https://")) {
              val = "https://" + val;
            }
            const url = new URL(val);
            const parts = url.pathname.split("/").filter(Boolean);
            if (parts.length > 0) clean = parts[0];
          } catch {
            const segments = h.split("/").filter(Boolean);
            clean = segments[segments.length - 1] || h;
          }
        }
        clean = clean.replace(/^@/, "");
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

    return `
      <article class="work-block ${i % 2 ? "flip" : ""} reveal" data-shoot="${s.id}">
        <button class="work-media" style="background-color: ${esc((s.palette && s.palette[1]) || '#1a1a1a')}; display: flex; align-items: center; justify-content: center;" aria-label="View ${esc(s.title)}">
          <img src="${esc(photoSrc(cover))}" style="object-position: ${esc(coverPos)}" alt="${esc(s.title)}" loading="lazy" />
          <span class="work-count">${s.photos.length} frames</span>
        </button>
        <div class="work-info">
          <p class="eyebrow">${esc(s.brand)} · ${esc(s.type)}</p>
          <h3>${esc(s.title)}</h3>
          <p class="work-desc">${esc(s.description || "")}</p>
          <dl class="work-credits">
            <div><dt>Activity</dt><dd>${esc(s.activity)}</dd></div>
            <div><dt>Season</dt><dd>${esc(s.season || "—")}</dd></div>
            <div><dt>Location</dt><dd>${esc(s.location || "—")}</dd></div>
          </dl>
          <p class="work-by">${creditsHtml}</p>
          ${testimonialsHtml}
          ${diagramHtml}
          <div style="margin-top: 22px; display: flex; align-items: center; flex-wrap: wrap; gap: 14px;">
            <button class="link-arrow work-open" style="padding: 0;">View project →</button>
            ${(!s.demo && isAdmin()) ? `
              <button class="link-arrow work-edit" style="color: var(--accent); font-weight: 700; padding: 0;" data-id="${s.id}">Edit details</button>
              <button class="link-arrow work-delete" style="color: #b22222; font-weight: 700; padding: 0;" data-id="${s.id}">Delete</button>
            ` : ""}
          </div>
        </div>
      </article>`;
  }

  function viewHome() {
    const feat = SHOOTS.slice(0, 7);
    const brandCount = new Set(SHOOTS.filter(s => s.client && s.client.trim()).map(s => s.brand)).size;
    const activeBrands = BRANDS.filter(b => SHOOTS.some(s => s.brand === b && s.client && s.client.trim()));
    const displayBrands = activeBrands.length ? activeBrands : BRANDS;
    const clientNames = [...new Set(SHOOTS.map(s => s.client).filter(c => c && c.trim()))];
    return `
      <section class="hero">
        <div class="hero-bg" aria-hidden="true"></div>
        <div class="container hero-inner">
          <p class="eyebrow reveal">The Creative Studio of ${esc(window.STUDIO_CONFIG?.studioName || "Our Studio")}</p>
          <h1 class="reveal">
            <span class="line"><span>Make.</span></span>
            <span class="line"><span>Every&nbsp;Shoot.</span></span>
            <span class="line accent-line"><span>Better.</span></span>
          </h1>
          <p class="lede reveal">${esc(window.STUDIO_CONFIG?.tagline || "The photography behind our brands — directed, shot, and archived in one place.")}${isAdmin() ? " Browse the work, or publish your own shoot." : " Browse the work or book a photoshoot session."}</p>
          <div class="hero-actions reveal">
            <a href="#/work" data-link class="btn btn-light">View the work →</a>
            ${isAdmin() ? `<a href="#/upload" data-link class="btn btn-ghost">Publish a shoot</a>` : `<a href="#/book" data-link class="btn btn-ghost">Book a shoot</a>`}
          </div>
          <dl class="hero-stats reveal">
            <div><dt data-count>${allPhotos().length}</dt><dd>Frames archived</dd></div>
            <div><dt data-count>${SHOOTS.length}</dt><dd>Photoshoots</dd></div>
            ${brandCount > 0 ? `<div><dt data-count>${brandCount}</dt><dd>Iconic brand${brandCount !== 1 ? 's' : ''}</dd></div>` : ''}
          </dl>
        </div>
        <div class="hero-scroll" aria-hidden="true"><span></span>SCROLL</div>
      </section>

      ${clientNames.length ? `
      <div class="marquee" aria-hidden="true">
        <div class="marquee-track">
          ${(clientNames.concat(clientNames)).map((c) => `<span>${esc(c)}</span><span>·</span>`).join("")}
        </div>
      </div>
      ` : ''}

      <section class="section container">
        <div class="section-head row reveal">
          <div><p class="eyebrow">01 — Selected work</p><h2>Featured photoshoots</h2></div>
          <a href="#/work" data-link class="link-arrow">All work →</a>
        </div>
        <div class="work-list">${feat.map(fullBleedBlock).join("")}</div>
      </section>

      <section class="cta-band">
        <div class="container reveal">
          ${isAdmin() ? `
            <h2>Your shoot belongs in the archive.</h2>
            <a href="#/upload" data-link class="btn btn-dark">Publish your photoshoot →</a>
          ` : `
            <h2>Ready to capture your story?</h2>
            <a href="#/book" data-link class="btn btn-dark">Book your photoshoot session →</a>
          `}
        </div>
      </section>`;
  }

  function viewWork() {
    const brandCount = new Set(SHOOTS.filter(s => s.client && s.client.trim()).map(s => s.brand)).size;
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">02 — The archive</p>
          <h1 class="reveal">The Work</h1>
          <p class="page-sub reveal">${SHOOTS.length} photoshoot${SHOOTS.length !== 1 ? 's' : ''}${brandCount > 0 ? ` across ${brandCount} brand${brandCount !== 1 ? 's' : ''}` : ''}. Every frame, full-bleed.</p>
        </div>
      </section>
      <section class="section container">
        <div class="work-list">${SHOOTS.map(fullBleedBlock).join("")}</div>
      </section>`;
  }

  function catCard(label, kind, val, count, sample) {
    return `
      <a href="#/categories/${kind}/${encodeURIComponent(val)}" data-link class="cat-card reveal">
        <span class="cat-swatch" style="background:linear-gradient(150deg,${esc(sample[0])},${esc(sample[1])})"></span>
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
      return `
        <section class="page-head">
          <div class="container">
            <p class="eyebrow reveal"><a href="#/categories" data-link>Categories</a> / ${esc(kind)}</p>
            <h1 class="reveal">${esc(d)}</h1>
            <p class="page-sub reveal">${list.length} photoshoot${list.length !== 1 ? "s" : ""} in this ${esc(kind)}.</p>
          </div>
        </section>
        <section class="section container"><div class="work-list">${list.map(fullBleedBlock).join("") || emptyCat()}</div></section>`;
    }
    // Index: three lenses
    const grp = (arr, key) => arr.map((v) => {
      const shoots = SHOOTS.filter((s) => {
        if (key === "brand" && (!s.client || !s.client.trim())) return false;
        return s[key] === v;
      });
      const sample = (shoots[0] || SHOOTS[0] || {}).palette || ["#3a3a3a", "#0d0d0d"];
      return { v, count: shoots.length, sample };
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

    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">03 — Browse</p>
          <h1 class="reveal">Categories</h1>
          <p class="page-sub reveal">Three ways into the archive — by what was shot, who it was for, and how it was made.</p>
        </div>
      </section>
      ${act.length ? `
      <section class="section container">
        <div class="section-head reveal"><p class="eyebrow">By activity</p><h2>What we shot</h2></div>
        <div class="cat-grid">${act.map((x) => catCard(x.v, "activity", x.v, x.count, x.sample)).join("")}</div>
      </section>
      ` : ""}
      ${brs.length ? `
      <section class="section container">
        <div class="section-head reveal"><p class="eyebrow">By brand</p><h2>Who it was for</h2></div>
        <div class="cat-grid">${brs.map((x) => catCard(x.v, "brand", x.v, x.count, x.sample)).join("")}</div>
      </section>
      ` : ""}
      ${typ.length ? `
      <section class="section container">
        <div class="section-head reveal"><p class="eyebrow">By type</p><h2>How it was made</h2></div>
        <div class="cat-grid">${typ.map((x) => catCard(x.v, "type", x.v, x.count, x.sample)).join("")}</div>
      </section>
      ` : ""}`;
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
          <h1 class="reveal">Built for the craft.</h1>
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
                <label class="field"><span>Instagram (comma-separated)</span><input id="f_ig" type="text" placeholder="e.g. @handle1, @handle2" /></label>
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
    const opt = (arr) => arr.map((v) => `<option value="${v}">${v}</option>`).join("");
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">Book a session</p>
          <h1 class="reveal">Book Your Shoot</h1>
          <p class="page-sub reveal">Fill out the details below to inquire about booking a session. Whether you are booking a commercial campaign, e-commerce production, editorial work, or scheduling a selective test shoot, please submit your brief and project specs below.</p>
        </div>
      </section>
      <section class="section container">
        <div class="upload-grid" style="grid-template-columns: 1fr; max-width: 680px; margin: 0 auto;">
          <form class="shoot-form" id="bookingForm">
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
                <label class="field"><span>Phone Number</span><input id="b_phone" type="tel" placeholder="+1 (555) 000-0000" /></label>
              </div>
              <label class="field"><span>Instagram Handle</span><input id="b_instagram" type="text" placeholder="e.g. @handle" /></label>
            </fieldset>

            <fieldset>
              <legend>Shoot Details</legend>
              <div class="field-row">
                <label class="field"><span>Desired Shoot Type *</span>
                  <select id="b_type">
                    ${opt(TYPES)}
                  </select>
                </label>
                <label class="field"><span>Proposed Date / Timeline *</span><input id="b_date" type="text" required placeholder="e.g. Mid-July 2026" /></label>
              </div>
              <label class="field"><span>Project Concept & Vision</span><textarea id="b_concept" rows="4" placeholder="Describe the mood, location, number of frames, or styling ideas you have in mind..."></textarea></label>
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
            manuallyAligned: !!(p.objectPosition && p.objectPosition !== "center")
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
      note.textContent = n ? `${n} photo${n > 1 ? "s" : ""} ready.` : "No photos staged yet.";
      note.classList.toggle("ready", n > 0);
      grid.innerHTML = staged.map((f) => `
        <div class="thumb" data-id="${f.id}">
          <div class="thumb-cover-ctrl" style="position: absolute; top: 10px; left: 10px; z-index: 10;">
            <label style="background: rgba(0,0,0,0.65); color: #fff; padding: 4px 8px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 8px; text-transform: uppercase; font-weight: 700; display: flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="radio" name="coverSelect" class="thumb-cover-radio" data-id="${f.id}" ${f.isCover ? 'checked' : ''} style="margin: 0; width: 12px; height: 12px; accent-color: var(--accent);" />
              Cover
            </label>
          </div>
          <img src="${esc(photoSrc(f))}" style="object-position: ${esc(f.objectPosition || 'center')}" alt="${esc(f.name)}"/>
          <button class="thumb-remove" data-id="${f.id}" aria-label="Remove">×</button>
          <div class="thumb-align-ctrl">
            <select class="thumb-align-select" data-id="${f.id}" aria-label="Align image">
              <option value="center" ${(f.objectPosition === 'center' || f.objectPosition === 'center center') ? 'selected' : ''}>Center</option>
              <option value="top" ${f.objectPosition === 'top' ? 'selected' : ''}>Top</option>
              <option value="bottom" ${f.objectPosition === 'bottom' ? 'selected' : ''}>Bottom</option>
              <option value="left" ${f.objectPosition === 'left' ? 'selected' : ''}>Left</option>
              <option value="right" ${f.objectPosition === 'right' ? 'selected' : ''}>Right</option>
            </select>
          </div>
        </div>
      `).join("");
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
      grid.querySelectorAll(".thumb-align-select").forEach((select) => {
        select.addEventListener("change", (e) => {
          const id = e.target.dataset.id;
          let pos = e.target.value;
          const item = staged.find((x) => x.id === id);
          if (item) {
            if (pos === "center") {
              item.objectPosition = "center center";
            } else {
              item.objectPosition = pos;
            }
            item.manuallyAligned = true;
            const thumbImg = grid.querySelector(`.thumb[data-id="${id}"] img`);
            if (thumbImg) thumbImg.style.objectPosition = pos;
          }
        });
      });
      grid.querySelectorAll(".thumb-cover-radio").forEach((radio) => {
        radio.addEventListener("change", (e) => {
          const id = e.target.dataset.id;
          staged.forEach(x => {
            const wasCover = x.isCover;
            x.isCover = (x.id === id);
            if (x.isCover && !x.manuallyAligned) {
              x.objectPosition = "top";
            }
            if (wasCover && !x.isCover && !x.manuallyAligned) {
              x.objectPosition = "center";
            }
          });
          renderStaged();
        });
      });
    }
    dz.addEventListener("click", (e) => { if (!e.target.closest(".thumb")) fi.click(); });
    dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fi.click(); } });
    fi.addEventListener("change", (e) => { ingest(e.target.files); fi.value = ""; });
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-drag"); }));
    ["dragleave", "dragend", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-drag"); }));
    dz.addEventListener("drop", (e) => { if (e.dataTransfer?.files?.length) ingest(e.dataTransfer.files); });
    const igInput = $("#f_ig");
    igInput?.addEventListener("blur", () => {
      let val = igInput.value.trim();
      if (!val) return;
      const cleaned = val.split(",").map(h => {
        let clean = h.trim();
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
        clean = clean.replace(/^@/, "");
        return clean ? `@${clean}` : "";
      }).filter(Boolean).join(", ");
      igInput.value = cleaned;
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!staged.length) { toast("Add at least one photo first."); return; }
      const val = (id) => $("#" + id)?.value.trim();
      
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
        photos: staged.map((f, i) => ({ id: f.id + "-" + i, dataUrl: f.dataUrl, url: f.url, objectPosition: f.objectPosition || (f.isCover ? "top" : "center") })),
        featured: $("#f_featured") ? $("#f_featured").checked : false,
        coverPhotoId: coverItem ? coverItem.id : null,
      };
      pub.disabled = true; pub.textContent = editingShoot ? "Saving changes…" : "Publishing…";
      await putShoot(shoot);
      await loadShoots();
      toast(editingShoot ? `Saved changes to “${shoot.title}”.` : `Published “${shoot.title}” — ${staged.length} frame${staged.length > 1 ? "s" : ""}.`);
      staged = [];
      location.hash = "#/work";
      await syncToGitHub(SHOOTS);
    });
    renderStaged();
  }

  function wireBook() {
    const form = $("#bookingForm"), btn = $("#bookSubmitBtn");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const val = (id) => $("#" + id)?.value.trim();

      const name = val("b_name");
      const role = val("b_role");
      const email = val("b_email");
      const phone = val("b_phone");
      const instagram = val("b_instagram");
      const type = val("b_type");
      const date = val("b_date");
      const concept = val("b_concept");

      btn.disabled = true;
      btn.textContent = "Submitting request...";

      const formData = {
        name,
        role,
        email,
        phone,
        instagram,
        type,
        date,
        concept
      };

      try {
        const response = await fetch("https://formspree.io/prateeksaxenaphotography@gmail.com", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(formData)
        });

        if (response.ok) {
          alert("Request submitted! Your booking inquiry has been sent successfully. We will get back to you shortly.");
          form.reset();
          location.hash = "#/";
        } else {
          throw new Error("Formspree response not OK");
        }
      } catch (err) {
        console.error("Booking submit error, falling back to mailto:", err);
        const subject = encodeURIComponent(`Shoot Booking Request from ${name}`);
        const body = encodeURIComponent(
          `Shoot Booking Details:\n\n` +
          `Name: ${name}\n` +
          `Role: ${role}\n` +
          `Email: ${email}\n` +
          `Phone: ${phone || '—'}\n` +
          `Instagram: ${instagram || '—'}\n` +
          `Shoot Type: ${type}\n` +
          `Proposed Date: ${date}\n\n` +
          `Concept/Vision:\n${concept || '—'}`
        );
        window.location.href = `mailto:prateeksaxenaphotography@gmail.com?subject=${subject}&body=${body}`;
        alert("We started your email app to send the request. Please click 'Send' in your mail client to complete the booking submission!");
      } finally {
        btn.disabled = false;
        btn.textContent = "Submit Booking Request";
      }
    });
  }

  /* ---------------- Router ---------------- */
  const ROUTES = { "": viewHome, "work": viewWork, "categories": viewCategories, "studio": viewStudio, "upload": viewUpload, "book": viewBook };

  function render() {
    const raw = location.hash.replace(/^#\/?/, "").split("?")[0];
    const parts = raw.split("/").filter(Boolean); // e.g. ["categories","activity","Trail"]
    const key = parts[0] || "";
    
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
      location.hash = "#/";
      return;
    }

    const fn = ROUTES[key] || (() => `<section class="page-head"><div class="container"><h1>Not found</h1><p class="page-sub"><a href="#/" data-link>Back home</a></p></div></section>`);

    view.classList.add("leaving");
    const paint = () => {
      view.innerHTML = key === "categories" ? viewCategories(parts[1], parts[2]) : fn();
      view.classList.remove("leaving");
      window.scrollTo({ top: 0, behavior: "auto" });
      wireView(key);
      initReveal();
      setActiveNav(key);

      // SEO optimization: update page title and description dynamically
      const cfg = window.STUDIO_CONFIG || { studioName: "thenerdyphotographer.in" };
      let pageTitle = `${cfg.studioName} — Noida Creative Photography Studio`;
      let pageDesc = "Noida based creative photographer studio by Prateek Saxena. Cinematic photoshoot portfolio — browse by activity, brand and type.";
      
      if (key === "work") {
        pageTitle = `The Photo Archive — ${cfg.studioName}`;
        pageDesc = `Browse through the complete photoshoot archive of ${cfg.studioName}. Editorial, fine art, and commercial photography projects.`;
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
    // work-block interactions (open lightbox on media or "View project")
    view.querySelectorAll(".work-block").forEach((block) => {
      const s = SHOOTS.find((x) => x.id === block.dataset.shoot);
      if (!s) return;
      const list = s.photos.map((p) => ({ ...p, shoot: s }));
      const open = () => openLb(list, 0);
      block.querySelector(".work-media")?.addEventListener("click", open);
      block.querySelector(".work-open")?.addEventListener("click", open);
      
      // edit button click handler
      block.querySelector(".work-edit")?.addEventListener("click", (e) => {
        e.stopPropagation();
        location.hash = `#/upload/edit/${s.id}`;
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
    
    if (key === "upload") {
      const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
      wireUpload(parts[1] === "edit" ? parts[2] : null);
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
    const items = view.querySelectorAll(".reveal");
    if (prefersReduced || !("IntersectionObserver" in window)) { items.forEach((el) => el.classList.add("in")); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });
    items.forEach((el) => io.observe(el));
  }

  /* ---------------- Header scroll + loader ---------------- */
  const header = $(".site-header");
  window.addEventListener("scroll", () => header.classList.toggle("scrolled", window.scrollY > 8), { passive: true });
  function dismissLoader() {
    const l = $("#loader"); if (!l) return;
    // Show the full loader only once per session; on later loads dismiss fast.
    let seen = false;
    try { seen = sessionStorage.getItem("wps-loaded") === "1"; sessionStorage.setItem("wps-loaded", "1"); } catch {}
    const w = prefersReduced || seen ? 0 : 1200;
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

  window.addEventListener("hashchange", render);
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
  }

  (async function boot() {
    try {
      $("#year").textContent = new Date().getFullYear();
      initBranding();
      updateAdminBtn();
      await loadShoots();
      if (!location.hash) location.hash = "#/";
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
