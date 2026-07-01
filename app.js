/* ============================================================
   Wolverine PhotoStudio — app logic (cinematic edition)
   - Drag & drop / browse upload → staging → publish (IndexedDB)
   - Demo gallery seeds a full, gorgeous grid on first visit
   - Brand filtering, lightbox with prev/next, scroll reveal
   No backend. Everything lives in this browser.
   ============================================================ */
(() => {
  "use strict";

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- IndexedDB ---------- */
  const DB_NAME = "wolverine-photostudio";
  const STORE = "photos";
  let dbPromise;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: "id" });
          s.createIndex("createdAt", "createdAt");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function dbAll() {
    const db = await openDB();
    return new Promise((res, rej) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
  }
  async function dbPut(rec) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function dbDelete(id) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  /* ---------- DOM refs ---------- */
  const $ = (s) => document.querySelector(s);
  const dropzone = $("#dropzone");
  const fileInput = $("#fileInput");
  const staging = $("#staging");
  const stagingGrid = $("#stagingGrid");
  const stagingCount = $("#stagingCount");
  const clearStagingBtn = $("#clearStaging");
  const queueNote = $("#queueNote");
  const publishBtn = $("#publishBtn");
  const shootForm = $("#shootForm");
  const gallery = $("#gallery");
  const emptyState = $("#emptyState");
  const filters = $("#portfolioFilters");
  const lightbox = $("#lightbox");
  const lightboxImg = $("#lightboxImg");
  const lightboxCaption = $("#lightboxCaption");
  const lbCounter = $("#lbCounter");

  let stagedFiles = [];

  /* ---------- Helpers ---------- */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function readAsDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  function resizeDataUrl(dataUrl, maxDim = 1600, quality = 0.82) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (Math.max(width, height) <= maxDim) return res(dataUrl);
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale); height = Math.round(height * scale);
        const c = document.createElement("canvas");
        c.width = width; c.height = height;
        c.getContext("2d").drawImage(img, 0, 0, width, height);
        res(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => res(dataUrl);
      img.src = dataUrl;
    });
  }

  let toastTimer;
  function toast(msg) {
    let el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* ---------- Demo gallery (procedural, gorgeous, never empty) ----------
     Generates editorial "photos" as SVG gradients so a first visit shows a
     full gallery. Demo items are flagged `demo:true`, never written to
     IndexedDB, and removed the moment a real photo is published. */
  const DEMO_SHOOTS = [
    { brand: "Merrell", title: "Trail — Spring '26", by: "A. Reyes", palette: ["#2f6b4f", "#163726"], h: 1.28 },
    { brand: "Saucony", title: "Endorphin — Speed Series", by: "K. Osei", palette: ["#d24e1a", "#7a2a0d"], h: 0.82 },
    { brand: "Sperry", title: "Coastline Editorial", by: "M. Vance", palette: ["#274b6d", "#0f2437"], h: 1.15 },
    { brand: "Sweaty Betty", title: "Studio Movement", by: "L. Cho", palette: ["#b23f12", "#d24e1a"], h: 1.0 },
    { brand: "Chaco", title: "Canyon Field Day", by: "A. Reyes", palette: ["#8a5a2b", "#3a2510"], h: 1.34 },
    { brand: "Wolverine", title: "Built to Last — Workwear", by: "R. Blake", palette: ["#3a3a3a", "#0d0d0d"], h: 0.9 },
    { brand: "Hush Puppies", title: "Weekend Neutrals", by: "L. Cho", palette: ["#9a8f7d", "#4a4238"], h: 1.1 },
    { brand: "Bates", title: "Tactical — Low Light", by: "R. Blake", palette: ["#20262b", "#0a0d0f"], h: 1.22 },
    { brand: "Merrell", title: "Hydro Moc — Water", by: "M. Vance", palette: ["#2f6b4f", "#0f3a2a"], h: 0.86 },
    { brand: "Saucony", title: "Track Club Portraits", by: "K. Osei", palette: ["#d24e1a", "#b23f12"], h: 1.18 },
    { brand: "Sperry", title: "Harbor Golden Hour", by: "M. Vance", palette: ["#c98a3a", "#6d4416"], h: 1.0 },
    { brand: "Sweaty Betty", title: "Power Yoga Set", by: "L. Cho", palette: ["#7a2a0d", "#d24e1a"], h: 1.3 },
  ];

  function demoPhoto(shoot, i) {
    const [c1, c2] = shoot.palette;
    const w = 800, h = Math.round(800 * shoot.h);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
      <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient>
        <radialGradient id='v' cx='0.5' cy='0.34' r='0.9'>
        <stop offset='0' stop-color='rgba(255,255,255,0.16)'/><stop offset='1' stop-color='rgba(0,0,0,0)'/></radialGradient>
      </defs>
      <rect width='${w}' height='${h}' fill='url(#g)'/>
      <rect width='${w}' height='${h}' fill='url(#v)'/>
      <circle cx='${w * 0.72}' cy='${h * 0.28}' r='${w * 0.05}' fill='rgba(255,255,255,0.10)'/>
      <text x='40' y='${h - 46}' font-family='Archivo, sans-serif' font-weight='800' font-size='34' fill='rgba(255,255,255,0.92)'>${escapeHtml(shoot.brand)}</text>
      <text x='40' y='${h - 78}' font-family='Archivo, sans-serif' font-weight='700' font-size='15' letter-spacing='3' fill='rgba(255,255,255,0.55)'>PHOTOSHOOT · 0${(i % 9) + 1}</text>
    </svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  function buildDemoPhotos() {
    const base = Date.now();
    return DEMO_SHOOTS.map((s, i) => ({
      id: "demo-" + i,
      shootId: "demo-shoot-" + i,
      title: s.title,
      brand: s.brand,
      photographer: s.by,
      dataUrl: demoPhoto(s, i),
      order: i,
      createdAt: base - i * 1000,
      demo: true,
    }));
  }

  /* ---------- Upload handling ---------- */
  async function ingestFiles(fileList) {
    const images = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!images.length) { toast("Those weren't images — try JPG, PNG or WEBP."); return; }
    for (const file of images) {
      const raw = await readAsDataURL(file);
      const dataUrl = await resizeDataUrl(raw);
      stagedFiles.push({ id: uid(), dataUrl, name: file.name });
    }
    renderStaging();
  }

  function renderStaging() {
    const n = stagedFiles.length;
    staging.hidden = n === 0;
    stagingCount.textContent = `(${n})`;
    publishBtn.disabled = n === 0;
    if (n === 0) { queueNote.textContent = "No photos staged yet."; queueNote.classList.remove("ready"); }
    else { queueNote.textContent = `${n} photo${n > 1 ? "s" : ""} ready to publish.`; queueNote.classList.add("ready"); }

    stagingGrid.innerHTML = "";
    stagedFiles.forEach((f) => {
      const cell = document.createElement("div");
      cell.className = "thumb";
      cell.innerHTML = `<img src="${f.dataUrl}" alt="${escapeHtml(f.name)}" />
        <button class="thumb-remove" aria-label="Remove ${escapeHtml(f.name)}">×</button>`;
      cell.querySelector(".thumb-remove").addEventListener("click", () => {
        stagedFiles = stagedFiles.filter((x) => x.id !== f.id);
        renderStaging();
      });
      stagingGrid.appendChild(cell);
    });
  }

  /* ---------- Dropzone events ---------- */
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", (e) => { ingestFiles(e.target.files); fileInput.value = ""; });
  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("is-drag"); }));
  ["dragleave", "dragend", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("is-drag"); }));
  dropzone.addEventListener("drop", (e) => { if (e.dataTransfer?.files?.length) ingestFiles(e.dataTransfer.files); });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
  clearStagingBtn.addEventListener("click", () => { stagedFiles = []; renderStaging(); });

  /* ---------- Publish ---------- */
  shootForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!stagedFiles.length) return;
    const title = $("#shootTitle").value.trim() || "Untitled photoshoot";
    const brand = $("#shootBrand").value;
    const photographer = $("#shootPhotographer").value.trim() || "Studio";
    const createdAt = Date.now();
    const shootId = uid();

    publishBtn.disabled = true;
    publishBtn.textContent = "Publishing…";

    for (let i = 0; i < stagedFiles.length; i++) {
      await dbPut({ id: stagedFiles[i].id, shootId, title, brand, photographer, dataUrl: stagedFiles[i].dataUrl, order: i, createdAt });
    }

    const count = stagedFiles.length;
    stagedFiles = [];
    renderStaging();
    shootForm.reset();
    publishBtn.textContent = "Publish to portfolio";

    await refreshGallery();
    toast(`Published ${count} photo${count > 1 ? "s" : ""} to “${title}”.`);
    $("#portfolio").scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth" });
  });

  /* ---------- Gallery + filters ---------- */
  let allPhotos = [];
  let viewList = [];
  let activeFilter = "all";
  let showingDemo = false;

  async function refreshGallery() {
    const real = (await dbAll()).sort((a, b) => b.createdAt - a.createdAt || a.order - b.order);
    showingDemo = real.length === 0;
    allPhotos = showingDemo ? buildDemoPhotos() : real;
    renderFilters();
    renderGallery();
    updateStats(real.length, new Set(real.map((p) => p.shootId)).size);
  }

  function renderFilters() {
    const brands = [...new Set(allPhotos.map((p) => p.brand))].sort();
    filters.innerHTML = "";
    const make = (label, val) => {
      const b = document.createElement("button");
      b.className = "chip" + (activeFilter === val ? " is-active" : "");
      b.dataset.filter = val;
      b.textContent = label;
      b.addEventListener("click", () => { activeFilter = val; renderFilters(); renderGallery(); });
      return b;
    };
    filters.appendChild(make("All", "all"));
    brands.forEach((br) => filters.appendChild(make(br, br)));
  }

  function renderGallery() {
    viewList = activeFilter === "all" ? allPhotos : allPhotos.filter((p) => p.brand === activeFilter);
    emptyState.hidden = allPhotos.length > 0;
    gallery.innerHTML = "";

    viewList.forEach((p, idx) => {
      const card = document.createElement("figure");
      card.className = "gallery-card";
      if (!prefersReduced) card.style.animationDelay = Math.min(idx * 0.04, 0.5) + "s";
      card.innerHTML = `
        ${p.demo ? '<span class="card-badge">Demo</span>' : '<button class="card-del" aria-label="Delete photo">×</button>'}
        <img src="${p.dataUrl}" alt="${escapeHtml(p.title)}" loading="lazy" />
        <figcaption class="card-meta">
          <div class="m-brand">${escapeHtml(p.brand)}</div>
          <div class="m-title">${escapeHtml(p.title)}</div>
          <div class="m-by">by ${escapeHtml(p.photographer)}</div>
        </figcaption>`;
      card.querySelector("img").addEventListener("click", () => openLightbox(idx));
      const del = card.querySelector(".card-del");
      del?.addEventListener("click", async (e) => {
        e.stopPropagation();
        await dbDelete(p.id);
        await refreshGallery();
        toast("Photo removed.");
      });
      gallery.appendChild(card);
    });
  }

  function updateStats(photoCount, shootCount) {
    animateCount($("#stat-photos"), photoCount);
    animateCount($("#stat-shoots"), shootCount);
  }
  function animateCount(el, target) {
    if (!el) return;
    if (prefersReduced) { el.textContent = target; return; }
    const start = parseInt(el.textContent, 10) || 0;
    const dur = 700, t0 = performance.now();
    (function step(now) {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(start + (target - start) * eased);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ---------- Lightbox with prev/next ---------- */
  let lbIndex = 0;
  function openLightbox(idx) {
    lbIndex = idx;
    paintLightbox();
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    $("#lightboxClose").focus();
  }
  function paintLightbox() {
    const p = viewList[lbIndex];
    if (!p) return;
    lightboxImg.src = p.dataUrl;
    lightboxImg.alt = p.title;
    lightboxCaption.textContent = `${p.title} — ${p.brand} · by ${p.photographer}`;
    lbCounter.textContent = `${lbIndex + 1} / ${viewList.length}`;
  }
  function lbStep(dir) {
    if (!viewList.length) return;
    lbIndex = (lbIndex + dir + viewList.length) % viewList.length;
    paintLightbox();
  }
  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = "";
    document.body.style.overflow = "";
  }
  $("#lightboxClose").addEventListener("click", closeLightbox);
  $("#lbPrev").addEventListener("click", () => lbStep(-1));
  $("#lbNext").addEventListener("click", () => lbStep(1));
  lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener("keydown", (e) => {
    if (lightbox.hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") lbStep(-1);
    else if (e.key === "ArrowRight") lbStep(1);
  });

  /* ---------- Mobile nav ---------- */
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
  navToggle?.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
  });
  nav?.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("open")));

  /* ---------- Scroll reveal + header state ---------- */
  function initReveal() {
    const items = document.querySelectorAll(".reveal");
    if (prefersReduced || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    items.forEach((el) => io.observe(el));
  }
  const header = document.querySelector(".site-header");
  window.addEventListener("scroll", () => {
    header.classList.toggle("scrolled", window.scrollY > 8);
  }, { passive: true });

  /* ---------- Loader ---------- */
  function dismissLoader() {
    const loader = document.getElementById("loader");
    if (!loader) return;
    const minWait = prefersReduced ? 0 : 1200;
    setTimeout(() => loader.classList.add("done"), minWait);
    setTimeout(() => loader.remove(), minWait + 900);
  }

  /* ---------- Init ---------- */
  document.getElementById("year").textContent = new Date().getFullYear();
  initReveal();
  refreshGallery();
  window.addEventListener("load", dismissLoader);
  // Fallback in case load already fired.
  if (document.readyState === "complete") dismissLoader();
})();
