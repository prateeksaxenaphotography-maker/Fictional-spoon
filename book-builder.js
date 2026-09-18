/* ============================================================
   book-builder.js — the studio portfolio book

   The photographer's own book of work to send to clients: photographs picked
   from any album, laid out on 1 to 20 A4 pages, in one of three styles
   (elegant, modern, vogue) and one of nine colourways, saved as re-editable
   versions and exported as a PDF or as one PNG per page.

   Admin only. app.js loads this file the first time /portfolio-book is
   opened, so no visitor ever downloads it, and it borrows the page engine,
   the PDF writer and the image loader from app.js through window.WPS_BOOK_API
   rather than keeping second copies that would drift.

   Saved books live in localStorage and are published inside data.js as
   STUDIO_PORTFOLIOS (see getStudioPortfolios / cleanStudioPortfolios in
   app.js, which also define and enforce the stored shape).

   Every measurement is in millimetres on the page; page.u() turns mm into
   pixels at whatever resolution the page was created at, so the same drawing
   code makes the small preview and the print file.
   ============================================================ */
(function () {
  "use strict";
  const API = window.WPS_BOOK_API;
  if (!API) return;

  /* ---------- colourways ----------------------------------------------------
     Every text-on-colour pairing was measured (WCAG contrast) in all three
     styles before these were accepted. `accentText` is the accent when it has
     to be read as words on white, and `accentOnDeep` as words on the Modern
     cover; both default to `accent`. Haldi needs them: bright yellow cannot be
     read as type. Keys are stored in saved books — never rename one. */
  const COLOURWAYS = [
    { key: "terracotta",   name: "Terracotta",   paper: "#FAF8F5", white: "#FFFFFF", ink: "#141416", soft: "#5E5A55", accent: "#D24E1A", deep: "#141416", onDeep: "#FFFFFF", onAccent: "#FFFFFF", rule: "#DDD8D0" },
    { key: "silver-print", name: "Silver Print", paper: "#F4F3F1", white: "#FFFFFF", ink: "#161616", soft: "#6A6866", accent: "#787674", deep: "#0E0E0E", onDeep: "#F4F3F1", onAccent: "#FFFFFF", rule: "#D6D4D0" },
    { key: "oxblood",      name: "Oxblood",      paper: "#F5F1EE", white: "#FFFFFF", ink: "#1E1416", soft: "#675A5C", accent: "#6B1B26", deep: "#E7E3E0", onDeep: "#1E1416", onAccent: "#F5F1EE", rule: "#E2D9D4" },
    { key: "petrol",       name: "Petrol",       paper: "#F3F5F4", white: "#FFFFFF", ink: "#0E1A1C", soft: "#4F5E60", accent: "#298286", deep: "#0A1C1F", onDeep: "#FFFFFF", onAccent: "#FFFFFF", rule: "#D5DEDD" },
    { key: "cobalt",       name: "Cobalt",       paper: "#F5F5F3", white: "#FFFFFF", ink: "#0B0B0D", soft: "#56565C", accent: "#3D6CF0", deep: "#0B0B0D", onDeep: "#FFFFFF", onAccent: "#FFFFFF", rule: "#DCDCE0" },
    { key: "rani-pink",    name: "Rani Pink",    paper: "#FAF7F5", white: "#FFFFFF", ink: "#1A1216", soft: "#62585E", accent: "#D6327A", deep: "#140D10", onDeep: "#FFFFFF", onAccent: "#FFFFFF", rule: "#EADFE2" },
    { key: "haldi",        name: "Haldi",        paper: "#FAF6EB", white: "#FFFFFF", ink: "#1A1712", soft: "#625C4E", accent: "#E9A90E", accentText: "#855F00", accentOnDeep: "#855F00", deep: "#F4EEDD", onDeep: "#1A1712", onAccent: "#1A1712", rule: "#E6DDC6" },
    { key: "crimson",      name: "Crimson",      paper: "#FAF6F4", white: "#FFFFFF", ink: "#180F0F", soft: "#645655", accent: "#C8102E", deep: "#180F0F", onDeep: "#FFFFFF", onAccent: "#FFFFFF", rule: "#E9DAD8" },
    { key: "indigo",       name: "Indigo",       paper: "#F5F4FA", white: "#FFFFFF", ink: "#13112B", soft: "#5B5870", accent: "#6D58DD", deep: "#18123F", onDeep: "#FFFFFF", onAccent: "#FFFFFF", rule: "#DDDAEA" }
  ];
  const colourway = (key) => COLOURWAYS.find((c) => c.key === key) || COLOURWAYS[0];
  const accentText = (P) => P.accentText || P.accent;
  const accentOnDeep = (P) => P.accentOnDeep || P.accent;

  const STYLES = [
    { key: "elegant", name: "Elegant", note: "A gallery catalogue. Photographs framed on paper." },
    { key: "modern", name: "Modern", note: "Your site's voice. Photographs full-bleed." },
    { key: "vogue", name: "Vogue", note: "A fashion issue. Photographs tiled edge to edge." }
  ];
  const SIZE = { portrait: { w: 210, h: 297 }, landscape: { w: 297, h: 210 } };
  const MAX_PAGES = 20;       // rendered pages, cover included
  const MAX_PER_PAGE = 6;

  const F = {
    serif: "Fraunces, Georgia, serif",
    heavy: "Archivo, 'Helvetica Neue', Arial, sans-serif",
    sans: "Inter, 'Helvetica Neue', Arial, sans-serif",
    geo: "Outfit, 'Helvetica Neue', Arial, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    plex: "'IBM Plex Mono', ui-monospace, monospace"
  };

  // Canvas draws in whatever font is loaded at that instant, with no error, so
  // a page drawn before the fonts arrive is silently set in Helvetica.
  let fontsReady = null;
  function ensureFonts() {
    if (!fontsReady) {
      const sample = "NERDY PHOTOGRAPHER Selected Work 2026 ·—₹@ abcxyz 0123456789";
      const faces = ["300 40px Fraunces", "italic 400 20px Fraunces", "800 40px Archivo", "700 40px Archivo", "600 20px Archivo", "300 16px Inter", "400 16px Inter", "500 16px Inter", "600 16px Inter",
        "400 16px Outfit", "500 16px Outfit", "600 16px Outfit", "700 16px 'JetBrains Mono'", "500 16px 'IBM Plex Mono'"];
      fontsReady = document.fonts && document.fonts.load
        ? Promise.all(faces.map((f) => document.fonts.load(f, sample).catch(() => null)))
        : Promise.resolve();
    }
    return fontsReady;
  }

  /* ---------- drawing primitives ------------------------------------------- */
  function font(page, weight, sizeMm, family, spacingMm = 0, italic = false) {
    page.ctx.font = `${italic ? "italic " : ""}${weight} ${page.u(sizeMm)}px ${family}`;
    if ("letterSpacing" in page.ctx) page.ctx.letterSpacing = `${page.u(spacingMm)}px`;
  }
  // Where an editable text landed on a page that isn't planned (the cover, a
  // chapter page, About), in the page's own millimetres, so a tap on the
  // preview can find it and type into it there.
  const noteText = (page, field, x, y, w, h, type) => { (page.texts || (page.texts = [])).push({ field, x, y, w, h, type }); };
  const typeOf = (T, size, lead, sp = 0) => ({ spec: { w: T.spec.w, f: T.spec.f, it: !!T.spec.it, sp }, size, lead, color: T.color, align: T.align });
  function text(page, s, x, y, color, align = "left") {
    page.ctx.fillStyle = color; page.ctx.textAlign = align;
    page.ctx.fillText(String(s), page.u(x), page.u(y));
  }
  const measure = (page, s) => page.ctx.measureText(String(s)).width / page.u(1);
  function wrap(page, s, maxMm) {
    const lines = [];
    String(s || "").split(/\n/).forEach((para) => {
      let line = "";
      para.split(/\s+/).filter(Boolean).forEach((w) => {
        const next = line ? `${line} ${w}` : w;
        if (line && measure(page, next) > maxMm) { lines.push(line); line = w; } else line = next;
      });
      lines.push(line);
    });
    return lines;
  }
  // Shrink a single line until it fits; returns the size used.
  function fitSize(page, s, maxMm, weight, startMm, family, spacingMm = 0, minMm = 6) {
    let size = startMm;
    font(page, weight, size, family, spacingMm);
    while (measure(page, s) > maxMm && size > minMm) { size -= 0.5; font(page, weight, size, family, spacingMm); }
    return size;
  }
  // Trim a single line with "…" until it fits. Set the font before calling.
  function ellipsize(page, s, maxMm) {
    let t = String(s || "");
    if (measure(page, t) <= maxMm) return t;
    while (t.length > 1 && measure(page, t + "…") > maxMm) t = t.slice(0, -1);
    return t.trimEnd() + "…";
  }
  // Shrink the type until the text wraps into at most `maxLines`; if it still
  // does not at the smallest size, keep that many lines and end the last with
  // "…". A title never loses words silently. Returns { size, lines }.
  function fitLines(page, s, maxMm, maxLines, weight, startMm, minMm, family, spacingMm = 0, italic = false) {
    let size = startMm, lines;
    for (;;) {
      font(page, weight, size, family, spacingMm, italic);
      lines = wrap(page, s, maxMm);
      if (lines.length <= maxLines || size <= minMm) break;
      size = Math.max(minMm, size - 0.5);
    }
    const cut = lines.length > maxLines;
    if (cut) {
      font(page, weight, size, family, spacingMm, italic);
      // Cut: the last line always ends in "…" and still fits.
      lines = lines.slice(0, maxLines);
      let last = lines[maxLines - 1];
      while (last.length > 1 && measure(page, `${last}…`) > maxMm) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last.trimEnd()}…`;
    }
    return { size, lines, cut };
  }
  function rect(page, x, y, w, h, color) { page.ctx.fillStyle = color; page.ctx.fillRect(page.u(x), page.u(y), page.u(w), page.u(h)); }
  function hair(page, x1, y, x2, color, w = 0.3) { rect(page, x1, y - w / 2, x2 - x1, Math.max(w, 1 / page.u(1)), color); }
  function frame(page, x, y, w, h, color, lw = 0.3) {
    page.ctx.strokeStyle = color; page.ctx.lineWidth = Math.max(1, page.u(lw));
    page.ctx.strokeRect(page.u(x), page.u(y), page.u(w), page.u(h));
  }

  // The studio's owl mark, recoloured. Strokes, the brow shape and the beak are
  // separate colours in the SVG, so a mark on ink, on paper and on a coloured
  // band can each be made to read.
  const markCache = new Map();
  function mark(stroke, beak, head) {
    const key = `${stroke}|${beak}|${head}`;
    if (!markCache.has(key)) {
      let svg = decodeURIComponent(API.studioMark().split(",").slice(1).join(","));
      svg = svg.split("#000").join(stroke).split("#0e0e0e").join(head).split("#d24e1a").join(beak);
      markCache.set(key, new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      }));
    }
    return markCache.get(key);
  }
  async function drawMark(page, stroke, beak, head, x, y, size) {
    const img = await mark(stroke, beak, head);
    if (img) page.ctx.drawImage(img, page.u(x), page.u(y), page.u(size), page.u(size));
  }

  // Crop to fill the box around the photo's focal point, then zoom. The same
  // maths as drawPdfPhoto in app.js, so a book crops a photo the way the
  // model portfolio does.
  function drawPhoto(page, img, shot, x, y, w, h) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    // A lighting diagram is a drawing with labels: shown whole on white,
    // never cropped, whatever box a layout gives it.
    // A photo can be faded; the page shows through it.
    const alpha = shot && typeof shot.opacity === "number" && shot.opacity < 1 ? Math.max(0.1, shot.opacity) : 1;
    if (shot && isDiagram(shot.id)) {
      rect(page, x, y, w, h, "#FFFFFF");
      const a = iw / ih, pad = Math.min(w, h) * 0.04;
      let dw = w - 2 * pad, dh = dw / a;
      if (dh > h - 2 * pad) { dh = h - 2 * pad; dw = dh * a; }
      if (alpha < 1) { page.ctx.save(); page.ctx.globalAlpha = alpha; }
      page.ctx.drawImage(img, 0, 0, iw, ih, page.u(x + (w - dw) / 2), page.u(y + (h - dh) / 2), page.u(dw), page.u(dh));
      if (alpha < 1) page.ctx.restore();
      page.photos.push({ id: shot.id, x, y, w, h });
      return { x, y, w, h };
    }
    const zoom = Math.min(3, Math.max(1, Number(shot && shot.zoom) || 1));
    // How the photo meets its box, chosen per photo: fill it (cropping), show
    // it whole, or match its width or its height. Zoom then scales from there,
    // and position moves the crop along whichever side overflows. A photo
    // smaller than its box on a side sits centred on that side.
    const mode = shot && FIT_MODES.includes(shot.fit) ? shot.fit : "fill";
    const bw = page.u(w), bh = page.u(h);
    const base = mode === "whole" ? Math.min(bw / iw, bh / ih) : mode === "width" ? bw / iw : mode === "height" ? bh / ih : Math.max(bw / iw, bh / ih);
    const scale = base * zoom;
    const sw = Math.min(iw, bw / scale), sh = Math.min(ih, bh / scale);
    const fx = Math.min(1, Math.max(0, shot && typeof shot.x === "number" ? shot.x : 0.5));
    const fy = Math.min(1, Math.max(0, shot && typeof shot.y === "number" ? shot.y : 0.35));
    const dw = sw * scale, dh = sh * scale;
    const dx = page.u(x) + (bw - dw) / 2, dy = page.u(y) + (bh - dh) / 2;
    if (alpha < 1) { page.ctx.save(); page.ctx.globalAlpha = alpha; }
    page.ctx.drawImage(img, (iw - sw) * fx, (ih - sh) * fy, sw, sh, dx, dy, dw, dh);
    if (alpha < 1) page.ctx.restore();
    page.photos.push({ id: shot && shot.id, x, y, w, h });
    return { x: dx / page.u(1), y: dy / page.u(1), w: dw / page.u(1), h: dh / page.u(1) };
  }
  // Fit whole (no crop) inside the box, centred, or against its right edge when
  // words sit to the right of it; returns the rectangle used. A placement the
  // studio chose for the photo overrides the style's habit.
  function fitPhoto(page, img, shot, x, y, w, h, align = "center") {
    if (shot && FIT_MODES.includes(shot.fit)) return drawPhoto(page, img, shot, x, y, w, h);
    const a = imgAspect(img);
    let dw = w, dh = w / a;
    if (dh > h) { dh = h; dw = h * a; }
    const dx = align === "right" ? x + w - dw : align === "left" ? x : x + (w - dw) / 2, dy = y + (h - dh) / 2;
    drawPhoto(page, img, { ...shot, zoom: 1, x: 0.5, y: 0.5 }, dx, dy, dw, dh);
    return { x: dx, y: dy, w: dw, h: dh };
  }
  // A missing photo (its album deleted since) leaves a quiet, labelled gap
  // rather than breaking the page.
  function missing(page, P, x, y, w, h) {
    rect(page, x, y, w, h, P.rule);
    font(page, 500, 2.4, F.plex, 0.3);
    text(page, "PHOTO REMOVED", x + w / 2, y + h / 2, P.soft, "center");
  }

  /* ---------- the watermark ---------------------------------------------------
     The studio's name written across every page, the way the model portfolio
     marks its samples: faint enough to read the work through, plain enough
     that nobody mistakes the file for the finished one. The words and how
     strong they are belong to the book. */
  const MARK_STRENGTH = { light: 0.12, medium: 0.2, strong: 0.3 };
  const markSettings = (book) => {
    const w = (book && book.watermark) || {};
    return { text: (typeof w.text === "string" && w.text.trim()) || studio(), strength: MARK_STRENGTH[w.strength] ? w.strength : "medium" };
  };
  function watermark(page, W, H, P, opts) {
    const { text, strength } = opts || { text: studio(), strength: "medium" };
    const ctx = page.ctx;
    const alpha = MARK_STRENGTH[strength] || MARK_STRENGTH.medium;
    ctx.save();
    font(page, 700, 6, F.mono, 0.3);
    ctx.textAlign = "center";
    ctx.translate(page.u(W / 2), page.u(H / 2));
    ctx.rotate(-Math.PI / 6);
    // Spaced by the words' own width, in brick rows across the diagonal. It is
    // written twice, pale then in the book's accent, so it stays readable over
    // a white page and over the dark part of a photograph alike.
    const step = measure(page, text) + 24;
    const span = Math.hypot(W, H);
    const cols = Math.ceil(span / step) + 1, rows = Math.ceil(span / 26) + 1;
    for (const [fill, a, dx] of [["#FFFFFF", alpha * 0.85, 0.5], [P ? accentText(P) : "#D24E1A", alpha, 0]]) {
      ctx.globalAlpha = a; ctx.fillStyle = fill;
      for (let row = -rows; row <= rows; row++) {
        for (let col = -cols; col <= cols; col++) ctx.fillText(text, page.u(col * step + (row % 2 ? step / 2 : 0) + dx), page.u(row * 26 + dx));
      }
    }
    ctx.restore();
  }

  /* ---------- the photo library -------------------------------------------- */
  const cleanName = (s) => String(s || "").replace(/\s*\([^)]*\)/g, "").trim();
  // Every photo in every album, plus each album's lighting diagram (public or
  // private: the book is the studio's own, and only an id is ever stored).
  // A diagram's id is "diagram:" + the album id, so it can sit in any photo
  // slot and follows its album if the album is renamed.
  const FIT_MODES = ["fill", "whole", "width", "height"];
  const DIAGRAM = "diagram:";
  const isDiagram = (id) => typeof id === "string" && id.startsWith(DIAGRAM);
  function library() {
    const shoots = (API.shoots() || []).filter((s) => s && !s.isTestimonial && Array.isArray(s.photos));
    const byId = new Map();
    const albums = [];
    let diagrams = 0;
    for (const s of shoots) {
      const photos = s.photos.filter((p) => p && p.id && (p.url || p.dataUrl));
      const diagram = typeof s.lightingDiagram === "string" && s.lightingDiagram ? { id: DIAGRAM + s.id, url: s.lightingDiagram, diagram: true } : null;
      if (!photos.length && !diagram) continue;
      albums.push({ id: s.id, name: cleanName(s.title || s.talent) || "Untitled", count: photos.length + (diagram ? 1 : 0) });
      for (const p of photos) if (!byId.has(p.id)) byId.set(p.id, { photo: p, shoot: s });
      if (diagram) { byId.set(diagram.id, { photo: diagram, shoot: s }); diagrams++; }
    }
    return { byId, albums, diagrams };
  }
  const previewSrc = (p) => API.photoSrc(p.medium ? { url: p.medium } : p);
  const thumbSrc = (p) => API.photoSrc(p.small ? { url: p.small } : (p.medium ? { url: p.medium } : p));
  // Width over height of anything drawable: an <img>, an ImageBitmap or a canvas.
  const imgAspect = (img) => (img.naturalWidth || img.width || 1) / (img.naturalHeight || img.height || 1);

  /* ---------- full-size photos for print ---------------------------------------
     The site keeps every photo at 1600 px on its long side (resize() in app.js):
     137 ppi across an A4 page, which is fine on a screen and from a home
     printer and soft from a press. For a print run the studio points the book
     at the full-size files on this computer. They are read here, never
     uploaded, and nothing about them is stored, so the folder is chosen again
     after a reload. A site photo carries no file name, so each is matched by
     what it shows: a small thumbnail of each side. Its brightness is compared
     by normalised correlation, which forgives an exposure or contrast tweak
     between the export and the upload, and its colour by plain difference,
     which tells a colour export from the black-and-white edit of the same
     frame (the site has several such twins). A match must be clear and, unless
     the runner-up is another book photo's own file (two frames from one
     burst, both in the book), beat it by a margin. A file serves one photo,
     except that the same picture published twice shares it. The thresholds
     were measured over the site's own photos (Sep 2026). */
  const FP_SIDE = 24;                     // the thumbnail compared, in px
  const FP_MID = 256;                     // decoded to this first, so the shrink is gentle
  const ORIG_ACCEPT = 0.97;               // the least a match may score
  const ORIG_MARGIN = 0.02;               // and how far the runner-up must sit below it
  const ORIG_COLOUR = 7;                  // the most the colour may differ (mean, of 255): a mono twin sits at 7.5+
  const ORIG_ASPECT = 0.03;               // shapes may differ by this much (log ratio)
  const ORIG_MIN_SIDE = 1600;             // a file no bigger than the site's copy gains nothing
  const ORIG_EXT = /\.(jpe?g|png|webp|avif|gif|bmp)$/i;
  const RAW_EXT = /\.(nef|nrw|cr2|cr3|arw|srf|sr2|dng|raf|orf|rw2|pef|3fr|iiq|heic|heif|tiff?|psd)$/i;
  let fpMid = null, fpSmall = null;
  function fingerprint(img) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;
    if (!fpMid) {
      fpMid = document.createElement("canvas"); fpMid.width = fpMid.height = FP_MID;
      fpSmall = document.createElement("canvas"); fpSmall.width = fpSmall.height = FP_SIDE;
    }
    const mid = fpMid.getContext("2d"), small = fpSmall.getContext("2d", { willReadFrequently: true });
    for (const c of [mid, small]) { c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high"; }
    mid.drawImage(img, 0, 0, iw, ih, 0, 0, FP_MID, FP_MID);
    small.drawImage(fpMid, 0, 0, FP_MID, FP_MID, 0, 0, FP_SIDE, FP_SIDE);
    const d = small.getImageData(0, 0, FP_SIDE, FP_SIDE).data;
    const N = FP_SIDE * FP_SIDE, y = new Float32Array(N), c = new Float32Array(N * 2);
    let mean = 0;
    for (let i = 0; i < N; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], Y = 0.299 * r + 0.587 * g + 0.114 * b;
      y[i] = Y; mean += Y;
      c[i * 2] = r - Y; c[i * 2 + 1] = b - Y;
    }
    mean /= N;
    let sq = 0;
    for (let i = 0; i < N; i++) { y[i] -= mean; sq += y[i] * y[i]; }
    const sd = Math.sqrt(sq / N) || 1;
    for (let i = 0; i < N; i++) y[i] /= sd;
    return { y, c };
  }
  // How alike in brightness (1 is the same), and how far apart in colour (0 is the same).
  const fpScore = (a, b) => { let s = 0; for (let i = 0; i < a.y.length; i++) s += a.y[i] * b.y[i]; return s / a.y.length; };
  const fpColour = (a, b) => { let s = 0; for (let i = 0; i < a.c.length; i++) s += Math.abs(a.c[i] - b.c[i]); return s / a.c.length; };
  const sameLook = (a, b) => fpScore(a, b) >= ORIG_ACCEPT && fpColour(a, b) <= ORIG_COLOUR;
  const aspectClose = (a, b) => a > 0 && b > 0 && Math.abs(Math.log(a / b)) <= ORIG_ASPECT;
  // A file's size as it will be seen, from its header (a small read, no
  // decode): PNG's IHDR, or a JPEG's frame header turned by its EXIF
  // orientation. Null when the file can't say; it is then decoded to find out.
  async function imageHeader(file) {
    let dv;
    try { dv = new DataView(await file.slice(0, 262144).arrayBuffer()); } catch (e) { return null; }
    const N = dv.byteLength;
    if (N > 24 && dv.getUint32(0) === 0x89504E47) return { w: dv.getUint32(16), h: dv.getUint32(20) };
    if (N < 4 || dv.getUint16(0) !== 0xFFD8) return null;
    let p = 2, w = 0, h = 0, orient = 1;
    while (p + 4 <= N) {
      if (dv.getUint8(p) !== 0xFF) return null;
      const m = dv.getUint8(p + 1);
      if (m === 0xFF) { p++; continue; }
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { p += 2; continue; }
      const len = dv.getUint16(p + 2);
      if (m === 0xE1 && p + 10 <= N && dv.getUint32(p + 4) === 0x45786966) orient = exifOrientation(dv, p + 10, Math.min(N, p + 2 + len)) || orient;
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) { if (p + 9 <= N) { h = dv.getUint16(p + 5); w = dv.getUint16(p + 7); } break; }
      if (m === 0xDA) break;
      p += 2 + len;
    }
    if (!w || !h) return null;
    return orient >= 5 && orient <= 8 ? { w: h, h: w } : { w, h };
  }
  function exifOrientation(dv, t, end) {
    if (t + 8 > end) return 0;
    const le = dv.getUint16(t) === 0x4949;
    if (dv.getUint16(t + 2, le) !== 0x2A) return 0;
    const ifd = t + dv.getUint32(t + 4, le);
    if (ifd + 2 > end) return 0;
    const count = dv.getUint16(ifd, le);
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > end) return 0;
      if (dv.getUint16(e, le) === 0x0112) return dv.getUint16(e + 8, le);
    }
    return 0;
  }
  // The files the studio has pointed at, and which site photo each one is.
  function originalsStore() {
    const files = [];                    // { file, w, h, fp }: fp undefined until looked at, null when unreadable
    const seen = new Set();
    const siteFp = new Map();            // photo id → { fp, aspect } | null
    const store = { raw: 0, other: 0 };
    store.count = () => files.length;
    store.forget = () => { files.length = 0; seen.clear(); store.raw = 0; store.other = 0; };
    store.add = async (list, progress) => {
      const fresh = [];
      for (const file of list || []) {
        const key = `${file.name}|${file.size}|${file.lastModified}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (RAW_EXT.test(file.name)) store.raw++;
        else if (ORIG_EXT.test(file.name) || /^image\//.test(file.type || "")) fresh.push(file);
        else store.other++;
      }
      for (let i = 0; i < fresh.length; i += 8) {
        await Promise.all(fresh.slice(i, i + 8).map(async (file) => {
          const hd = await imageHeader(file);
          files.push({ file, w: hd ? hd.w : 0, h: hd ? hd.h : 0, fp: undefined });
        }));
        if (progress) progress(Math.min(fresh.length, i + 8), fresh.length);
      }
      return fresh.length;
    };
    const fpOfFile = async (f) => {
      if (f.fp !== undefined) return f.fp;
      f.fp = null;
      try {
        if (f.w && f.h) {
          // The decoder scales as it reads, so a 24-megapixel file costs little here.
          const bmp = await createImageBitmap(f.file, { resizeWidth: FP_MID, resizeHeight: FP_MID, resizeQuality: "high" });
          f.fp = fingerprint(bmp); if (bmp.close) bmp.close();
        } else {
          const bmp = await createImageBitmap(f.file);
          f.w = bmp.width; f.h = bmp.height; f.fp = fingerprint(bmp); if (bmp.close) bmp.close();
        }
      } catch (e) { f.fp = null; }
      return f.fp;
    };
    const fpOfPhoto = async (id, loadThumb) => {
      if (siteFp.has(id)) return siteFp.get(id);
      let out = null;
      try { const img = await loadThumb(id); if (img) out = { fp: fingerprint(img), aspect: imgAspect(img) }; } catch (e) { out = null; }
      siteFp.set(id, out);
      return out;
    };
    // Which file is which of these photos. loadThumb(id) gives the site's
    // small copy; progress(done, total) is told as each photo is looked for.
    store.match = async (ids, loadThumb, progress) => {
      const want = [], missing = [], ambiguous = [], small = [];
      for (const id of ids) { const s = await fpOfPhoto(id, loadThumb); if (s && s.fp) want.push({ id, ...s }); else missing.push(id); }
      const pairs = [];
      let done = 0;
      for (const w of want) {
        for (const f of files) {
          if (f.w && f.h && !aspectClose(f.w / f.h, w.aspect)) continue;    // the wrong shape, without decoding it
          const fp = await fpOfFile(f);
          if (!fp || !aspectClose(f.w / f.h, w.aspect)) continue;
          const s = fpScore(w.fp, fp);
          if (s < ORIG_ACCEPT) continue;
          const cd = fpColour(w.fp, fp);
          if (cd > ORIG_COLOUR) continue;
          // Ranked by likeness, colour counting against: a grade change costs
          // a little, a black-and-white twin has already been turned away.
          pairs.push({ id: w.id, f, s, cd, k: s - cd / 200 });
        }
        done++; if (progress) progress(done, want.length);
      }
      pairs.sort((a, b) => b.k - a.k);
      // Best matches first, each file to one photo.
      const taken = new Map(), used = new Map();     // file → the photo it serves
      for (const p of pairs) { if (taken.has(p.id) || used.has(p.f)) continue; taken.set(p.id, p); used.set(p.f, p.id); }
      const matched = new Map();
      for (const w of want) {
        let best = taken.get(w.id);
        if (!best) {
          // Its file already serves another photo: fine when that is the
          // same picture, published twice.
          const top = pairs.find((p) => p.id === w.id);
          const twin = top && want.find((o) => o.id === used.get(top.f));
          if (top && twin && sameLook(w.fp, twin.fp)) best = top; else { missing.push(w.id); continue; }
        }
        const rival = pairs.find((p) => p.id === w.id && p.f !== best.f && !used.has(p.f) && p.k > best.k - ORIG_MARGIN);
        if (rival) { ambiguous.push(w.id); continue; }
        if (Math.max(best.f.w, best.f.h) <= ORIG_MIN_SIDE) { small.push(w.id); continue; }
        matched.set(w.id, best.f);
      }
      return { matched, missing, ambiguous, small };
    };
    return store;
  }
  /* Decodes matched files while a page is drawn. A 24-megapixel photo is about
     96 MB once decoded, so files are decoded one after another, anything
     bigger than `cap` on its long side is scaled down onto a canvas first, and
     release() lets them all go once the page is on its canvas. */
  function originalLoader(matched, cap) {
    const held = new Map();
    let chain = Promise.resolve();
    const decode = async (file) => {
      const bmp = await createImageBitmap(file);
      const long = Math.max(bmp.width, bmp.height);
      if (long <= cap) return bmp;
      const k = cap / long, c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const ctx = c.getContext("2d"); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      return c;
    };
    const used = new Set();
    return {
      used,
      get(id) {
        const f = matched.get(id);
        if (!f) return Promise.resolve(null);
        if (!held.has(id)) {
          const p = chain.then(() => decode(f.file)).then((img) => { used.add(id); return img; }, () => null);
          chain = p;
          held.set(id, p);
        }
        return held.get(id);
      },
      async release() {
        const all = [...held.values()]; held.clear();
        for (const p of all) { const img = await p; if (!img) continue; if (img.close) img.close(); else { img.width = 0; img.height = 0; } }
      }
    };
  }

  /* ---------- page plan ------------------------------------------------------
     A book is a cover plus its page entries. A spread takes two pages. */
  // A spread and a two-page story each take two pages.
  const pageSpan = (pg) => (pg && (pg.type === "spread" || pg.type === "article") ? 2 : 1);
  const renderedCount = (book) => 1 + book.pages.reduce((n, pg) => n + pageSpan(pg), 0);

  // Where each photo goes on a page, in mm inside the box (x0, y0, W, H).
  // Chooses from the shapes of the photos on it, as a picture editor would.
  function cells(n, box, g, aspects, pageLandscape, rows) {
    const { x: x0, y: y0, w: W, h: H } = box;
    const port = aspects.map((a) => a < 1);
    const allPort = port.every(Boolean), allLand = port.every((p) => !p);
    const grid = (cols, rows) => {
      const cw = (W - g * (cols - 1)) / cols, ch = (H - g * (rows - 1)) / rows, out = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: x0 + c * (cw + g), y: y0 + r * (ch + g), w: cw, h: ch });
      return out.slice(0, n);
    };
    if (n <= 1) return [{ x: x0, y: y0, w: W, h: H }];
    // Asked for: three photographs in one row, on top or at the bottom, and
    // the rest (one big, or two, or three) in the other row. The row of three
    // is the shorter one when the other row holds a single photograph.
    if ((rows === "3top" || rows === "3bottom") && n >= 4 && n <= 6) {
      const rest = n - 3;
      const th = (H - g) * (rest === 1 ? 0.42 : 0.5), oh = H - g - th;
      const tw = (W - 2 * g) / 3, ow = (W - g * (rest - 1)) / rest;
      const three = (y) => [0, 1, 2].map((c) => ({ x: x0 + c * (tw + g), y, w: tw, h: th }));
      const others = (y) => Array.from({ length: rest }, (_, c) => ({ x: x0 + c * (ow + g), y, w: ow, h: oh }));
      return rows === "3top" ? [...three(y0), ...others(y0 + th + g)] : [...others(y0), ...three(y0 + oh + g)];
    }
    if (n === 2) {
      if (pageLandscape || allPort) return grid(2, 1);
      return grid(1, 2);
    }
    if (n === 3) {
      if (allPort) return grid(3, 1);
      if (allLand && !pageLandscape) return grid(1, 3);
      if (pageLandscape) { // hero left, two stacked right
        const hw = (W - g) * 0.58, rw = W - g - hw, rh = (H - g) / 2;
        return [{ x: x0, y: y0, w: hw, h: H }, { x: x0 + hw + g, y: y0, w: rw, h: rh }, { x: x0 + hw + g, y: y0 + rh + g, w: rw, h: rh }];
      }
      const hh = (H - g) * 0.58, bh = H - g - hh, bw = (W - g) / 2; // hero top, two below
      return [{ x: x0, y: y0, w: W, h: hh }, { x: x0, y: y0 + hh + g, w: bw, h: bh }, { x: x0 + bw + g, y: y0 + hh + g, w: bw, h: bh }];
    }
    if (n === 4) return grid(2, 2);
    if (n === 5) {
      const th = (H - g) * (pageLandscape ? 0.5 : 0.58), bh = H - g - th, tw = (W - g) / 2, bw = (W - 2 * g) / 3;
      return [
        { x: x0, y: y0, w: tw, h: th }, { x: x0 + tw + g, y: y0, w: tw, h: th },
        { x: x0, y: y0 + th + g, w: bw, h: bh }, { x: x0 + bw + g, y: y0 + th + g, w: bw, h: bh }, { x: x0 + 2 * (bw + g), y: y0 + th + g, w: bw, h: bh }
      ];
    }
    return pageLandscape ? grid(3, 2) : grid(2, 3);
  }

  // One line of credit for the albums on a page, with no empty fields: an
  // album stores "—" in credits it does not use, and printing "Styling: —"
  // makes a considered page read like an unfilled form.
  function creditLine(shoots) {
    const seen = new Set(), parts = [];
    for (const s of shoots) {
      if (!s || seen.has(s.id)) continue;
      seen.add(s.id);
      const bits = [cleanName(s.title || s.talent), s.activity, cleanName(s.location), s.season]
        .map((b) => String(b || "").trim()).filter((b) => b && b !== "—" && b !== "Personal Project");
      if (bits.length) parts.push(bits.join(" · "));
    }
    return parts.join("   /   ");
  }

  /* ---------- styles ---------------------------------------------------------
     Each style is one object: its cover, its photo page, its text pages, and
     its running foot. They share everything else. */
  // The book being drawn, so the running foot can use its own words. Set at
  // the start of every render; only one book is drawn at a time.
  let bookNow = null;
  // The text being typed on the page right now, left out of the paint so the
  // box the studio is typing in is the only copy of the words.
  let skipNow = null;
  // The page being drawn, so a style's ground can ask for its colour.
  let entryNow = null;
  const isFillish = (v) => FILL_NAMES.includes(v) || /^#[0-9a-f]{6}$/i.test(String(v || ""));
  const pageBgOf = (book, entry, P, fallback) => (entry && isFillish(entry.bg) ? blockColor(entry.bg, P, fallback) : (book && isFillish(book.bg) ? blockColor(book.bg, P, fallback) : fallback));
  const pageBg = (P, fallback) => pageBgOf(bookNow, entryNow, P, fallback);
  const footName = () => String((bookNow && typeof bookNow.footText === "string" && bookNow.footText.trim()) ? bookNow.footText : studio()).toUpperCase();
  const showNums = () => !(bookNow && bookNow.showPageNumbers === false);
  const pageCredit = (entry, shoots) => ((entry && typeof entry.credit === "string" && entry.credit.trim()) ? entry.credit : creditLine(shoots));
  const cfg = () => API.config() || {};
  const studio = () => cfg().studioName || "nerdyphotographer.in";
  const year = () => String(new Date().getFullYear());
  const siteUrl = "https://www.nerdyphotographer.in";

  // The lines on a cover, as typed by the studio or, where nothing is typed,
  // as the style has always drawn them.
  function coverText(book) {
    const t = (book && book.coverText && typeof book.coverText === "object") ? book.coverText : {};
    const one = (v) => (typeof v === "string" && v.trim() ? v : null);
    return {
      label: one(t.label) || "STUDIO PORTFOLIO",
      mast: one(t.mast) || cfg().studioShortName || "NERDY",
      tagline: one(t.tagline) || "PHOTOGRAPHER",
      foot: one(t.foot) || studio().toUpperCase(),
      place: one(t.place) || `NOIDA · INDIA · ${year()}`,
      showCounts: t.showCounts !== false,
      left: Array.isArray(t.left) ? t.left.filter((x) => typeof x === "string") : null,
      right: Array.isArray(t.right) ? t.right.filter((x) => typeof x === "string") : null
    };
  }
  // The lines each cover prints for itself, beside the title and its subtitle.
  const COVER_LINES = { elegant: ["foot", "place"], modern: ["label", "foot", "place"], vogue: ["mast", "tagline", "foot", "counts"] };
  function coverLines(book) {
    // Cover lines from the book's own photographs, never typed: genres that
    // are actually in it, and counts that are actually true.
    const lib = library();
    const genres = [];
    let photos = 0;
    for (const pg of book.pages) for (const sh of (pg.photos || [])) {
      if (isDiagram(sh.id)) continue;
      photos++;
      const hit = lib.byId.get(sh.id);
      const g = hit && String(hit.shoot.activity || "").trim();
      if (g && g !== "Workshop" && !genres.includes(g)) genres.push(g);
    }
    return { genres: genres.slice(0, 3), photos, pages: renderedCount(book) };
  }

  const ELEGANT = {
    margins(o) { return o === "landscape" ? { top: 18, side: 20, bottom: 24, gap: 7 } : { top: 22, side: 20, bottom: 30, gap: 6 }; },
    async cover(page, book, P, W, H, img) {
      const L = W > H;
      rect(page, 0, 0, W, H, P.paper);
      // Landscape has 56mm under the photo window instead of 87, so it gets its
      // own measurements rather than the portrait ones squeezed.
      const m = 14, divY = L ? 124 : 196, footY = L ? H - 18 : H - 25;
      const T = L ? { size: 12, min: 8, lead: 14, first: 20, sub: 11, rule: 7.6 } : { size: 15, min: 9, lead: 17.5, first: 22, sub: 13, rule: 8.6 };
      if (img) drawPhoto(page, img, book.cover, m, m, W - 2 * m, divY - m);
      frame(page, m, m, W - 2 * m, H - 2 * m, P.ink);
      hair(page, m, divY, W - m, P.ink);
      await drawMark(page, img ? "#FFFFFF" : P.ink, P.accent, img ? "rgba(0,0,0,0)" : P.paper, m + 10, m + 10, 18);
      const cs = coverStyleOf(book);
      const tw = W - 2 * m - 20;
      const TT = textFormat(cs, "title", { w: 300, f: F.serif }, P, P.ink);
      const t = fitLines(page, book.title || "Selected Work", tw, 2, TT.spec.w, T.size * TT.scale, T.min * TT.scale, TT.spec.f, 0, !!TT.spec.it);
      const lead = T.lead * (t.size / (T.size * TT.scale)) * TT.scale;
      if (skipNow !== "title") t.lines.forEach((l, i) => text(page, l, TT.at(m + 10, tw), divY + T.first + i * lead, TT.color, TT.align));
      noteText(page, "title", m + 10, divY + T.first - t.size * 0.86, tw, (t.lines.length - 1) * lead + t.size * 1.16, typeOf(TT, t.size, lead));
      let y = divY + T.first + (t.lines.length - 1) * lead;
      {
        const ST = textFormat(cs, "subtitle", { w: 400, f: F.serif, it: true }, P, P.soft);
        const ss = (L ? 4.6 : 5.6) * ST.scale;
        if (book.subtitle) {
          y += T.sub * ST.scale;
          font(page, ST.spec.w, ss, ST.spec.f, 0, !!ST.spec.it);
          if (skipNow !== "subtitle") text(page, ellipsize(page, book.subtitle, tw), ST.at(m + 10, tw), y, ST.color, ST.align);
          noteText(page, "subtitle", m + 10, y - ss * 0.86, tw, ss * 1.2, typeOf(ST, ss, ss * 1.3));
        } else noteText(page, "subtitle", m + 10, y + T.sub * ST.scale - ss * 0.86, tw, ss * 1.2, typeOf(ST, ss, ss * 1.3));
      }
      rect(page, m + 10, y + T.rule - 0.4, 22, 0.8, P.accent);
      const CT = coverText(book);
      font(page, 500, 2.9, F.plex, 0.7);
      text(page, ellipsize(page, CT.foot, (W - 2 * m - 24) * 0.55), m + 10, footY, P.ink);
      text(page, ellipsize(page, CT.place, (W - 2 * m - 24) * 0.45), W - m - 10, footY, P.soft, "right");
    },
    async photos(page, entry, P, W, H, imgs, shoots, n) {
      const M = this.margins(W > H ? "landscape" : "portrait");
      rect(page, 0, 0, W, H, pageBg(P, P.paper));
      const box = { x: M.side, y: M.top, w: W - 2 * M.side, h: H - M.top - M.bottom };
      const shots = entry.photos;
      if (shots.length === 1 && entry.border) return bandedPhotoPage(page, entry, P, W, H, imgs, shots, shoots, n, captionFit(entry, W - 28, CAPTION_TYPE.elegant), "elegant", M.gap);
      if (shots.length === 1 && imgs[0]) {
        // A single photograph is a plate: whole, never cropped, on paper.
        const r = fitPhoto(page, imgs[0], shots[0], box.x, box.y, box.w, box.h - 8);
        frame(page, r.x, r.y, r.w, r.h, P.rule, 0.2);
      } else {
        const aspects = shots.map((s, i) => (imgs[i] ? imgAspect(imgs[i]) : 0.7));
        cells(shots.length, { ...box, h: box.h - 8 }, M.gap, aspects, W > H, entry.rows).forEach((c, i) => {
          if (imgs[i]) { const r = drawPhoto(page, imgs[i], shots[i], c.x, c.y, c.w, c.h); frame(page, r.x, r.y, r.w, r.h, P.rule, 0.2); }
          else missing(page, P, c.x, c.y, c.w, c.h);
        });
      }
      // The caption takes the gap between the photos and the credit line, so a
      // page without one looks exactly as it always did.
      const cap = captionFit(entry, box.w - 12, CAPTION_TYPE.elegant);
      if (cap) drawCaption(page, cap, box.x, H - M.bottom - 2, CAPTION_TYPE.elegant, P.ink, P);
      const credit = pageCredit(entry, shoots);
      if (credit) { font(page, 300, 3.0, F.sans); text(page, ellipsize(page, credit, box.w - 12), box.x, H - M.bottom + 4, P.soft); }
      this.foot(page, P, W, H, n);
    },
    foot(page, P, W, H, n) {
      if (!showNums()) return;
      font(page, 500, 2.4, F.plex, 0.55);
      text(page, String(n).padStart(2, "0"), n % 2 ? W - 20 : 20, H - 12, P.ink, n % 2 ? "right" : "left");
    },
    heading(page, s, x, y, P, maxW) { font(page, 300, 11, F.serif); const lines = wrap(page, s, maxW); lines.forEach((l, i) => text(page, l, x, y + i * 13, P.ink)); rect(page, x, y + (lines.length - 1) * 13 + 7, 22, 0.8, P.accent); return y + (lines.length - 1) * 13 + 16; },
    body(page, s, x, y, P, maxW, maxY = Infinity) { font(page, 300, 4.0, F.sans); return bodyLines(page, s, x, y, P, maxW, maxY, 6.4); },
    label(page, s, x, y, P) { font(page, 500, 2.6, F.plex, 0.55); text(page, s.toUpperCase(), x, y, P.soft); },
    ground(page, P, W, H) { rect(page, 0, 0, W, H, pageBg(P, P.paper)); }
  };

  const MODERN = {
    margins() { return { top: 14, side: 14, bottom: 18, gap: 4 }; },
    async cover(page, book, P, W, H, img) {
      const L = W > H;
      rect(page, 0, 0, W, H, P.deep);
      const fieldEnd = L ? 116 : 186;
      if (img) drawPhoto(page, img, book.cover, 0, 0, W, fieldEnd);
      rect(page, 0, 0, 12, H, P.accent);
      if (img) await drawMark(page, "#FFFFFF", P.accent, "rgba(0,0,0,0)", 26, 14, 12);
      else { const s = L ? 40 : 46; await drawMark(page, P.onDeep, P.accent, P.deep, 12 + (W - 12 - s) / 2, (fieldEnd - s) / 2, s); }
      hair(page, 26, fieldEnd, W - 14, P.onDeep);
      const CT = coverText(book);
      font(page, 700, 3.0, F.mono, 0.7); text(page, ellipsize(page, CT.label, W - 52), 26, fieldEnd + 16, accentOnDeep(P));
      const lower = H - 25;                       // the foot hairline
      const firstY = fieldEnd + (L ? 36 : 42);
      // Heavy caps at 22mm put most words on a line of their own, so a title is
      // shrunk until it fits two lines AND leaves room for the subtitle.
      const cs = coverStyleOf(book);
      const TT = textFormat(cs, "title", { w: 800, f: F.heavy }, P, P.onDeep);
      const ST = textFormat(cs, "subtitle", { w: 400, f: F.sans }, P, P.onDeep);
      const tw = W - 40;
      let size = (L ? 18 : 22) * TT.scale, t;
      const floorSize = (L ? 9 : 11) * TT.scale;
      for (;;) {
        t = fitLines(page, (book.title || "Selected Work").toUpperCase(), tw, 2, TT.spec.w, size, floorSize, TT.spec.f, -0.4, !!TT.spec.it);
        const lastBase = firstY + (t.lines.length - 1) * t.size * 0.95;
        const need = lastBase + t.size * 0.22 + (book.subtitle ? 3 + 4.2 * ST.scale : 0);
        if (need <= lower - 4 || t.size <= floorSize) break;
        size = t.size - 0.5;
      }
      const tLead = t.size * 0.95;
      font(page, TT.spec.w, t.size, TT.spec.f, -0.4, !!TT.spec.it);
      if (skipNow !== "title") t.lines.forEach((l, i) => text(page, l, TT.at(26, tw), firstY + i * tLead, TT.color, TT.align));
      noteText(page, "title", 26, firstY - t.size * 0.86, tw, (t.lines.length - 1) * tLead + t.size * 1.16, { ...typeOf(TT, t.size, tLead, -0.4), caps: true });
      {
        const subY = Math.min(lower - 4, Math.max(H - 32, firstY + (t.lines.length - 1) * tLead + t.size * 0.22 + 7));
        const ss = 4.2 * ST.scale;
        if (book.subtitle) {
          font(page, ST.spec.w, ss, ST.spec.f, 0, !!ST.spec.it);
          if (skipNow !== "subtitle") text(page, ellipsize(page, book.subtitle, tw), ST.at(26, tw), subY, ST.color, ST.align);
        }
        noteText(page, "subtitle", 26, subY - ss * 0.86, tw, ss * 1.2, typeOf(ST, ss, ss * 1.3));
      }
      hair(page, 26, lower, W - 14, P.onDeep);
      font(page, 700, 2.8, F.mono, 0.5);
      text(page, ellipsize(page, CT.foot, (W - 40) * 0.55), 26, H - 15, P.onDeep);
      page.ctx.globalAlpha = 0.62; text(page, ellipsize(page, CT.place, (W - 40) * 0.45), W - 14, H - 15, P.onDeep, "right"); page.ctx.globalAlpha = 1;
    },
    async photos(page, entry, P, W, H, imgs, shoots, n) {
      const M = this.margins();
      rect(page, 0, 0, W, H, pageBg(P, P.white));
      const shots = entry.photos;
      const cap = captionFit(entry, W - 2 * M.side, CAPTION_TYPE.modern);
      if (shots.length === 1 && entry.border) return bandedPhotoPage(page, entry, P, W, H, imgs, shots, shoots, n, cap, "modern", M.gap);
      if (shots.length === 1) {
        if (imgs[0]) drawPhoto(page, imgs[0], shots[0], 0, 0, W, H); else missing(page, P, 0, 0, W, H);
        // A full-bleed page still carries its number, on a band at the foot;
        // the band grows to hold a caption only when there is one.
        rect(page, 0, H - (cap ? 16 : 9), W, cap ? 16 : 9, P.deep);
        if (cap) drawCaption(page, cap, M.side, H - 9.6, CAPTION_TYPE.modern, P.onDeep, P);
        font(page, 700, 2.4, F.mono, 0.4);
        if (showNums()) text(page, String(n).padStart(2, "0"), M.side, H - 3.4, P.onDeep);
        const credit = pageCredit(entry, shoots);
        if (credit) text(page, ellipsize(page, credit.toUpperCase(), W - 2 * M.side - 14), W - M.side, H - 3.4, P.onDeep, "right");
        return;
      }
      const box = { x: M.side, y: M.top, w: W - 2 * M.side, h: H - M.top - M.bottom - (cap ? 7 : 0) };
      if (cap) drawCaption(page, cap, M.side, H - 17.5, CAPTION_TYPE.modern, P.ink, P);
      const aspects = shots.map((s, i) => (imgs[i] ? imgAspect(imgs[i]) : 0.7));
      cells(shots.length, box, M.gap, aspects, W > H, entry.rows).forEach((c, i) => {
        if (imgs[i]) drawPhoto(page, imgs[i], shots[i], c.x, c.y, c.w, c.h); else missing(page, P, c.x, c.y, c.w, c.h);
        // Plate number in a chip, keyed to nothing but its order on the page.
        rect(page, c.x, c.y, 7, 5, P.accent);
        font(page, 700, 2.2, F.mono, 0.2); text(page, String(i + 1).padStart(2, "0"), c.x + 3.5, c.y + 3.5, P.onAccent, "center");
      });
      this.foot(page, P, W, H, n, pageCredit(entry, shoots));
    },
    // `ink`/`soft` default to the page colours; a chapter page on the accent
    // passes onAccent, or the foot all but vanishes on a dark accent.
    foot(page, P, W, H, n, credit, ink = P.ink, soft = P.soft) {
      hair(page, 14, H - 12, W - 14, ink);
      font(page, 700, 2.4, F.mono, 0.4);
      if (showNums()) text(page, String(n).padStart(2, "0"), 14, H - 6, ink);
      const studioW = measure(page, footName());
      text(page, footName(), W - 14, H - 6, ink, "right");
      if (credit) { font(page, 400, 2.6, F.sans); text(page, ellipsize(page, credit, (W - 14 - studioW - 6) - 24), 24, H - 6, soft); }
    },
    heading(page, s, x, y, P, maxW) { font(page, 800, 10, F.heavy, -0.2); const lines = wrap(page, String(s).toUpperCase(), maxW); lines.forEach((l, i) => text(page, l, x, y + i * 10.5, P.ink)); rect(page, x, y + (lines.length - 1) * 10.5 + 5, 18, 1.2, P.accent); return y + (lines.length - 1) * 10.5 + 15; },
    body(page, s, x, y, P, maxW, maxY = Infinity) { font(page, 400, 3.9, F.sans); return bodyLines(page, s, x, y, P, maxW, maxY, 6.2); },
    label(page, s, x, y, P) { font(page, 700, 2.5, F.mono, 0.45); text(page, s.toUpperCase(), x, y, accentText(P)); },
    ground(page, P, W, H) { rect(page, 0, 0, W, H, pageBg(P, P.white)); rect(page, 0, 0, 6, H, P.accent); }
  };

  const VOGUE = {
    margins() { return { top: 10, side: 10, bottom: 14, gap: 2 }; },
    async cover(page, book, P, W, H, img) {
      const L = W > H;
      const band = L ? 126 : 179;
      rect(page, 0, 0, W, H, P.white);
      if (img) {
        drawPhoto(page, img, book.cover, 0, 0, W, band);
        // A soft shade from the top, so a white masthead reads on a pale wall.
        const g = page.ctx.createLinearGradient(0, 0, 0, page.u(band * 0.84));
        g.addColorStop(0, "rgba(0,0,0,0.42)"); g.addColorStop(1, "rgba(0,0,0,0)");
        page.ctx.fillStyle = g; page.ctx.fillRect(0, 0, page.u(W), page.u(band * 0.84));
      }
      rect(page, 0, band, W, H - band, P.accent);
      const on = img ? "#FFFFFF" : P.ink;
      const CT = coverText(book);
      const mast = CT.mast;
      fitSize(page, mast, W - 20, 300, L ? 38 : 44, F.serif, 1.5, 20);
      text(page, mast, W / 2, L ? 68 : 92, on, "center");
      font(page, 500, 5.4, F.geo, 3.2); text(page, ellipsize(page, CT.tagline.toUpperCase(), W - 24), W / 2, L ? 80 : 104, on, "center");
      if (!img) hair(page, 20, L ? 90 : 116, W - 20, P.ink);
      const cl = coverLines(book), top = L ? 100 : 132;
      font(page, 600, 3.4, F.geo, 0.4);
      if (CT.showCounts) {
        const left = (CT.left && CT.left.length ? CT.left : cl.genres).slice(0, 3);
        const right = (CT.right && CT.right.length ? CT.right : [`${cl.photos} PLATES`, `${cl.pages} PAGES`, "NOIDA, INDIA"]).slice(0, 3);
        left.forEach((g, i) => text(page, ellipsize(page, g.toUpperCase(), (W - 40) * 0.5), 20, top + i * 6, img ? "#FFFFFF" : (i === 0 ? accentText(P) : P.ink)));
        right.forEach((w, i) => text(page, ellipsize(page, w.toUpperCase(), (W - 40) * 0.45), W - 20, top + i * 6, on, "right"));
      }
      // One line where it fits, at a smaller size before it ever wraps; the
      // rule, the deck line and the mark then sit below whatever was drawn.
      const cs = coverStyleOf(book);
      const TT = textFormat(cs, "title", { w: 300, f: F.serif }, P, P.onAccent, "center");
      const ST = textFormat(cs, "subtitle", { w: 400, f: F.sans }, P, P.onAccent, "center");
      const tw = W - 30;
      const t = fitLines(page, (book.title || "Selected Work").toUpperCase(), tw, 2, TT.spec.w, (L ? 11 : 13) * TT.scale, (L ? 7.5 : 8.5) * TT.scale, TT.spec.f, 0.8, !!TT.spec.it);
      const tLead = t.size * 1.23, firstY = band + (L ? 24 : 35);
      font(page, TT.spec.w, t.size, TT.spec.f, 0.8, !!TT.spec.it);
      if (skipNow !== "title") t.lines.forEach((l, i) => text(page, l, TT.at(15, tw), firstY + i * tLead, TT.color, TT.align));
      noteText(page, "title", 15, firstY - t.size * 0.86, tw, (t.lines.length - 1) * tLead + t.size * 1.16, { ...typeOf(TT, t.size, tLead, 0.8), caps: true });
      const ruleY = firstY + (t.lines.length - 1) * tLead + (L ? 9 : 12.7);
      rect(page, W / 2 - 12, ruleY, 24, 0.6, P.onAccent);
      let below = ruleY;
      {
        const ss = 4.2 * ST.scale, at = ruleY + (L ? 9 : 12.3) * ST.scale;
        if (book.subtitle) { below = at; font(page, ST.spec.w, ss, ST.spec.f, 0, !!ST.spec.it); if (skipNow !== "subtitle") text(page, ellipsize(page, book.subtitle, tw), ST.at(15, tw), below, ST.color, ST.align); }
        noteText(page, "subtitle", 15, at - ss * 0.86, tw, ss * 1.2, typeOf(ST, ss, ss * 1.3));
      }
      const footY = H - 11, markSize = L ? 12 : 16;
      const markY = Math.max(H - (L ? 34 : 49), below + 5);
      if (markY + markSize <= footY - 5) await drawMark(page, P.onAccent, P.onAccent, P.accent, W / 2 - markSize / 2, markY, markSize);
      font(page, 600, 2.9, F.geo, 1.1); text(page, ellipsize(page, CT.foot, W - 24), W / 2, footY, P.onAccent, "center");
    },
    async photos(page, entry, P, W, H, imgs, shoots, n) {
      const M = this.margins();
      rect(page, 0, 0, W, H, pageBg(P, P.white));
      const shots = entry.photos;
      // A caption gets a white strip across the foot, clear of the outer band.
      const cap = captionFit(entry, W - 24, CAPTION_TYPE.vogue);
      if (entry.border) return bandedPhotoPage(page, entry, P, W, H, imgs, shots, shoots, n, cap, "vogue", M.gap);
      const area = cap ? H - 12 : H;
      if (shots.length === 1) {
        if (imgs[0]) drawPhoto(page, imgs[0], shots[0], 0, 0, W, area); else missing(page, P, 0, 0, W, area);
      } else {
        const aspects = shots.map((s, i) => (imgs[i] ? imgAspect(imgs[i]) : 0.7));
        // Tiled trim to trim: tightness is the style.
        cells(shots.length, { x: 0, y: 0, w: W, h: area }, M.gap, aspects, W > H, entry.rows).forEach((c, i) => {
          if (imgs[i]) drawPhoto(page, imgs[i], shots[i], c.x, c.y, c.w, c.h); else missing(page, P, c.x, c.y, c.w, c.h);
        });
      }
      if (cap) drawCaption(page, cap, 12, H - 4.8, CAPTION_TYPE.vogue, P.ink, P);
      this.foot(page, P, W, H, n, pageCredit(entry, shoots));
    },
    // `side` overrides the page-number parity: a spread's two halves put their
    // bands on the OUTER edges whatever page it starts on, never down the fold.
    foot(page, P, W, H, n, credit, side) {
      // Credits run up the outer edge on a narrow band, the way fashion
      // magazines set them, so nothing sits across the photograph.
      const ctx = page.ctx;
      const right = side ? side === "right" : n % 2 === 1;
      const bandX = right ? W - 6 : 0;
      rect(page, bandX, 0, 6, H, P.white);
      ctx.save();
      ctx.translate(page.u(bandX + 4), page.u(H - 8));
      ctx.rotate(-Math.PI / 2);
      font(page, 600, 2.2, F.geo, 0.6);
      ctx.fillStyle = P.ink; ctx.textAlign = "left";
      ctx.textAlign = "left";
      ctx.fillText(ellipsize(page, `${showNums() ? `${String(n).padStart(2, "0")}   ` : ""}${credit ? credit.toUpperCase() : footName()}`, H - 16), 0, 0);
      ctx.restore();
    },
    heading(page, s, x, y, P, maxW) { font(page, 300, 12, F.serif, 0.6); const lines = wrap(page, String(s).toUpperCase(), maxW); lines.forEach((l, i) => text(page, l, x, y + i * 14, P.ink)); rect(page, x, y + (lines.length - 1) * 14 + 7, 24, 0.6, P.accent); return y + (lines.length - 1) * 14 + 17; },
    body(page, s, x, y, P, maxW, maxY = Infinity) { font(page, 400, 3.9, F.sans); return bodyLines(page, s, x, y, P, maxW, maxY, 6.3); },
    label(page, s, x, y, P) { font(page, 600, 2.7, F.geo, 0.8); text(page, s.toUpperCase(), x, y, accentText(P)); },
    ground(page, P, W, H) { rect(page, 0, 0, W, H, pageBg(P, P.white)); }
  };
  const STYLE_IMPL = { elegant: ELEGANT, modern: MODERN, vogue: VOGUE };

  // Running text that stops above the foot. If it has to stop early, the last
  // line that fits ends with "…" so nothing is cut mid-thought without a sign.
  function bodyLines(page, s, x, y, P, maxW, maxY, lead, align = "left", specAt = null) {
    if (specAt) return paraLines(page, s, x, y, maxW, maxY, specAt);
    const lines = wrap(page, s, maxW);
    const at = align === "center" ? x + maxW / 2 : align === "right" ? x + maxW : x;
    let i = 0;
    page.lastBodyCut = false;
    for (; i < lines.length; i++) {
      const yy = y + i * lead;
      if (yy > maxY) break;
      const last = i + 1 < lines.length && y + (i + 1) * lead > maxY;
      if (last) page.lastBodyCut = true;
      text(page, last ? ellipsize(page, `${lines[i]} …`, maxW) : lines[i], at, yy, P.ink, align === "justify" ? "left" : align);
    }
    return y + i * lead;
  }
  // The same text, but each paragraph in its own font, size, colour and
  // alignment. Blank lines between paragraphs keep the gap they always had.
  function paraLines(page, s, x, y, maxW, maxY, specAt) {
    const blocks = String(s || "").replace(/\r\n?/g, "\n").split(/\n/);
    let cy = y, pi = 0, numbered = 0;
    page.lastBodyCut = false;
    for (let bi = 0; bi < blocks.length; bi++) {
      if (!blocks[bi].trim()) { cy += specAt(Math.max(0, pi - 1)).lead; continue; }
      const S = specAt(pi++);
      font(page, S.spec.w, S.spec.size, S.spec.f, 0, !!S.spec.it);
      const mark = S.list === "bullet" ? "•" : S.list === "number" ? `${++numbered}.` : null;
      if (S.list !== "number") numbered = 0;
      const hang = mark ? Math.max(4, S.spec.size * 1.35) : 0;
      const ncol = S.columns === 2 || S.columns === 3 ? S.columns : 1;
      const gap = Math.max(3, S.spec.size * 0.9);
      const w = ncol > 1 ? (maxW - gap * (ncol - 1)) / ncol : maxW - hang;
      const lines = wrap(page, blocks[bi], w);
      const per = ncol > 1 ? Math.ceil(lines.length / ncol) : lines.length;
      const align = S.align === "justify" ? "left" : S.align;
      if (mark) text(page, mark, x, cy, S.color, "left");
      for (let li = 0; li < lines.length; li++) {
        const c = ncol > 1 ? Math.floor(li / per) : 0, r = ncol > 1 ? li % per : li;
        const ly = cy + r * S.lead;
        if (ly > maxY) { page.lastBodyCut = true; return cy + per * S.lead; }
        const lx = x + hang + c * (w + gap);
        const at = align === "center" ? lx + w / 2 : align === "right" ? lx + w : lx;
        const more = li + 1 < lines.length || blocks.slice(bi + 1).some((b) => b.trim());
        const last = more && ly + S.lead > maxY && (ncol === 1 || r === per - 1);
        if (last) page.lastBodyCut = true;
        text(page, last ? ellipsize(page, `${lines[li]} …`, w) : lines[li], at, ly, S.color, align);
      }
      cy += per * S.lead;
    }
    return cy;
  }
  // What didn't fit on a page, for the editor and the check before download.
  const reportCut = (page, field, label) => { if (!page.cuts) page.cuts = []; page.cuts.push({ field, label }); };

  /* ---------- text pages ----------------------------------------------------- */
  const DEFAULT_ABOUT = "nerdyphotographer.in is a photography studio in Noida, working across Delhi NCR. It shoots fashion, beauty and editorial stories, fitness and sport, and portfolios and comp cards for models — in a home studio and on location.\n\nEvery shoot is planned before the day: the looks, the light and the frames it has to come away with. You are directed throughout, and the finished work is credited in full.";

  async function textPage(page, entry, book, P, W, H, n) {
    const S = STYLE_IMPL[book.style];
    const M = S.margins(W > H ? "landscape" : "portrait");
    const x = Math.max(M.side, 20), maxW = Math.min(W - 2 * x, 150);
    if (entry.type === "divider") {
      // A chapter card: the colour as the whole ground.
      rect(page, 0, 0, W, H, book.style === "elegant" ? P.paper : P.accent);
      const on = book.style === "elegant" ? P.ink : P.onAccent;
      // Measured exactly as it is drawn: Vogue and Modern set it in capitals,
      // which are far wider than the lower case it was typed in.
      const shown = book.style === "elegant" ? (entry.heading || "Selected work") : (entry.heading || "Selected work").toUpperCase();
      const weight = book.style === "modern" ? 800 : 300, family = book.style === "modern" ? F.heavy : F.serif, spacing = book.style === "vogue" ? 1 : 0;
      const HT = textFormat(entry.style, "heading", { w: weight, f: family }, P, on);
      const LT = textFormat(entry.style, "line", { w: 400, f: F.sans }, P, on);
      const tw = W - 40;
      const t = fitLines(page, shown, tw, 2, HT.spec.w, (book.style === "modern" ? 26 : 30) * HT.scale, 12 * HT.scale, HT.spec.f, spacing, !!HT.spec.it);
      if (t.cut) reportCut(page, "heading", "chapter heading");
      const lead = t.size * 1.05;
      const top = H / 2 - (t.lines.length - 1) * lead / 2;
      font(page, HT.spec.w, t.size, HT.spec.f, spacing, !!HT.spec.it);
      if (skipNow !== "heading") t.lines.forEach((l, i) => text(page, l, HT.at(20, tw), top + i * lead, HT.color, HT.align));
      noteText(page, "heading", 20, top - t.size * 0.86, tw, (t.lines.length - 1) * lead + t.size * 1.16, { ...typeOf(HT, t.size, lead, spacing), caps: book.style !== "elegant" });
      const after = top + (t.lines.length - 1) * lead;
      noteText(page, "line", 20, after + t.size * 0.5 + 10 - 4.2 * LT.scale * 0.86, tw, 3 * 6.4 * LT.scale + 4.2 * LT.scale * 1.2, typeOf(LT, 4.2 * LT.scale, 6.4 * LT.scale));
      if (book.style === "elegant") rect(page, 20, after + 8, 22, 0.8, P.accent);
      if (entry.line) {
        font(page, LT.spec.w, 4.2 * LT.scale, LT.spec.f, 0, !!LT.spec.it);
        const lines = wrap(page, entry.line, maxW);
        if (lines.length > 4) reportCut(page, "line", "line under the heading");
        if (skipNow !== "line") lines.slice(0, 4).forEach((l, i) => text(page, i === 3 && lines.length > 4 ? ellipsize(page, `${l} …`, maxW) : (i === 3 ? ellipsize(page, l, maxW) : l), LT.at(20, maxW), after + t.size * 0.5 + 10 + i * 6.4 * LT.scale, LT.color, LT.align));
      }
      if (book.style === "elegant") ELEGANT.foot(page, P, W, H, n);
      if (book.style === "modern") MODERN.foot(page, P, W, H, n, "", P.onAccent, P.onAccent);
      return;
    }
    S.ground(page, P, W, H);
    let y = M.top + 22;
    const floor = H - Math.max(M.bottom, 18) - 6;   // nothing below this: the foot lives there
    const lineOf = (v, fallback) => ((typeof v === "string" && v.trim()) ? v : fallback);
    if (entry.type === "about") {
      S.label(page, lineOf(entry.label, "About the studio"), x, y - 10, P);
      y = S.heading(page, lineOf(entry.heading, "Not just photos, a perspective"), x, y, P, maxW);
      // The About words take the studio's own font, colour, size and
      // alignment, and each paragraph may differ.
      const aBase = { w: book.style === "elegant" ? 300 : 400, f: F.sans, size: book.style === "elegant" ? 4.0 : 3.9, lead: book.style === "elegant" ? 6.4 : (book.style === "modern" ? 6.2 : 6.3) };
      const aFmt = (entry.style && entry.style.about) || {};
      const AT = textFormat(entry.style, "about", aBase, P, P.ink);
      font(page, AT.spec.w, AT.spec.size * AT.scale, AT.spec.f, 0, !!AT.spec.it);
      const aPara = hasParaFmt(aFmt) || aFmt.list || aFmt.columns ? (pi) => {
        const pf = paraFmt(aFmt, pi), sc = sizeScale(pf), st = styledSpec(aBase, pf);
        return { spec: { ...st, size: st.size * sc }, lead: st.lead * sc, color: tintOf(pf.color, P, P.ink), align: ALIGNS.includes(pf.align) ? pf.align : AT.align, list: pf.list, columns: pf.columns };
      } : null;
      noteText(page, "about", x, y + 6 - AT.spec.size * AT.scale * 0.86, maxW, floor - (y + 6) + AT.spec.size * AT.scale * 1.16, typeOf({ ...AT, spec: AT.spec }, AT.spec.size * AT.scale, AT.spec.lead * AT.scale));
      if (skipNow !== "about") {
        y = bodyLines(page, (book.texts && book.texts.about) || DEFAULT_ABOUT, x, y + 6, { ...P, ink: AT.color }, maxW, floor, AT.spec.lead * AT.scale, AT.align, aPara);
        if (page.lastBodyCut) reportCut(page, "about", "About text");
      }
    }
    if (entry.type === "services") {
      S.label(page, lineOf(entry.label, "What I shoot"), x, y - 10, P);
      y = S.heading(page, lineOf(entry.heading, "Shoots, and who they are for"), x, y, P, maxW);
      y += 4;
      // Landscape pages are short and wide, so the list runs in two columns
      // rather than stopping after three entries.
      const cols = W > H ? 2 : 1;
      const colW = cols === 2 ? (W - 2 * x - 12) / 2 : maxW;
      const colX = (c) => x + c * (colW + 12);
      const top = y;
      let col = 0, cy = top;
      const entries = [];
      // Each kind of shoot comes from the site; a book can leave one out or
      // put it in its own words.
      const over = (entry.items && typeof entry.items === "object") ? entry.items : {};
      const hidden = new Set(Array.isArray(entry.hide) ? entry.hide : []);
      for (const v of (API.liveServices() || [])) {
        if (hidden.has(v.slug)) continue;
        const o = over[v.slug] || {};
        entries.push({ kind: "service", v: { ...v, kicker: lineOf(o.kicker, v.kicker), title: lineOf(o.title, v.title), blurb: lineOf(o.blurb, v.blurb) } });
      }
      if (book.texts && book.texts.showPrices) {
        // Off unless the studio switches it on for a book: a published price
        // caps a job before the brief is known.
        entries.push({ kind: "label" });
        for (const pkg of (API.packages() || [])) entries.push({ kind: "package", pkg });
      }
      const heightOf = (e) => e.kind === "service" ? 13 + Math.min(4, wrap(page, e.v.blurb || "", colW).length) * 6.3 + 5 : e.kind === "label" ? 9 : 11;
      let dropped = 0;
      for (const e of entries) {
        font(page, 400, 3.9, F.sans);
        if (cy + heightOf(e) > floor) { if (col + 1 < cols) { col++; cy = top; } else { dropped++; continue; } }
        const cx = colX(col);
        if (e.kind === "service") {
          S.label(page, e.v.kicker || "", cx, cy, P);
          font(page, book.style === "modern" ? 800 : 400, 5.4, book.style === "modern" ? F.heavy : F.serif);
          text(page, ellipsize(page, e.v.title || "", colW), cx, cy + 7, P.ink);
          cy = S.body(page, e.v.blurb || "", cx, cy + 13, P, colW, cy + 13 + 3 * 6.3) + 5;
        } else if (e.kind === "label") {
          S.label(page, "Packages", cx, cy + 2, P); cy += 9;
        } else {
          font(page, 600, 3.6, F.sans); text(page, ellipsize(page, e.pkg.name || "", colW - 24), cx, cy, P.ink);
          text(page, `₹${Number(e.pkg.price || 0).toLocaleString("en-IN")}`, cx + colW, cy, P.ink, "right");
          font(page, 400, 3.0, F.sans); text(page, ellipsize(page, e.pkg.specs || "", colW), cx, cy + 4.8, P.soft);
          cy += 11;
        }
      }
      if (!(book.texts && book.texts.showPrices)) {
        font(page, 400, 3.6, F.sans);
        text(page, lineOf(entry.note, "Every shoot is quoted to its brief."), colX(col), Math.min(cy + 4, floor), P.soft);
      }
      if (dropped) console.warn(`Portfolio book: ${dropped} item(s) did not fit on the What I shoot page.`);
    }
    if (entry.type === "contact") {
      S.label(page, lineOf(entry.label, "Let's make something"), x, y - 10, P);
      y = S.heading(page, lineOf(entry.heading, "Book a shoot"), x, y, P, maxW);
      y += 4;
      const c = cfg();
      const ig = String(c.instagram || "").replace(/\/+$/, "").split("/").pop();
      // Each line can be left off this page (entry.hide lists the ones hidden).
      const hidden = new Set(Array.isArray(entry.hide) ? entry.hide : []);
      const rows = [
        ["email", "Email", c.email, c.email ? `mailto:${c.email}` : ""],
        ["whatsapp", "WhatsApp", book.texts && book.texts.phone, book.texts && book.texts.phone ? `https://wa.me/${String(book.texts.phone).replace(/\D/g, "")}` : ""],
        ["instagram", "Instagram", ig ? `@${ig}` : "", c.instagram || ""],
        ["website", "Website", "nerdyphotographer.in", siteUrl],
        ["book", "Book online", "nerdyphotographer.in/book", `${siteUrl}/book/`],
        ["studio", "Studio", "Noida · working across Delhi NCR", ""]
      ].map(([k, label, value, url]) => {
        // Any row can be renamed or rewritten for this book.
        const o = (entry.rows && typeof entry.rows === "object" && entry.rows[k]) || {};
        return [k, lineOf(o.label, label), lineOf(o.value, value), url];
      }).filter((r) => r[2] && !hidden.has(r[0])).map((r) => r.slice(1));
      for (const [label, value, url] of rows) {
        S.label(page, label, x, y, P);
        font(page, book.style === "modern" ? 600 : 400, 5.0, book.style === "elegant" || book.style === "vogue" ? F.serif : F.sans);
        text(page, value, x, y + 7, P.ink);
        if (url) page.link(x, y + 1.5, Math.min(maxW, measure(page, value) + 2), 7, url);
        y += 16;
      }
      // A QR straight to the booking form, for a book read on paper.
      if (!hidden.has("qr")) try {
        const qrcode = await API.loadQr();
        const qr = qrcode(0, "M"); qr.addData(`${siteUrl}/book/`); qr.make();
        const cells = qr.getModuleCount(), size = 32, cell = size / cells;
        const qx = W - x - size, qy = H - M.bottom - size - 6;
        rect(page, qx - 2, qy - 2, size + 4, size + 4, "#FFFFFF");
        for (let r = 0; r < cells; r++) for (let col = 0; col < cells; col++) if (qr.isDark(r, col)) rect(page, qx + col * cell, qy + r * cell, cell + 0.02, cell + 0.02, "#000000");
        font(page, 500, 2.2, F.plex, 0.4); text(page, lineOf(entry.qrLabel, "SCAN TO BOOK").toUpperCase(), qx + size / 2, qy + size + 5, P.soft, "center");
        page.link(qx, qy, size, size, `${siteUrl}/book/`);
      } catch (e) { /* the QR is a convenience; the links above still work */ }
    }
    if (book.style === "elegant") ELEGANT.foot(page, P, W, H, n);
    if (book.style === "modern") MODERN.foot(page, P, W, H, n, "");
    if (book.style === "vogue") VOGUE.foot(page, P, W, H, n, "");
  }

  /* ---------- writing pages ------------------------------------------------------
     Story, About a photo, Quote and Letter: pages of the studio's own words.

     Each is laid out ONCE, on a small 72-dpi measuring canvas, into a plan:
     every line of text already broken and placed in mm. The preview, the page
     strip and the print file all draw that same plan. Fraunces is loaded with
     optical sizes, so its letters get narrower as the pixel size grows: lines
     that fit at 72 dpi also fit at 110 and 150, and the preview shows exactly
     the PDF's line breaks. The layout never depends on a photo loading, only
     on whether one is chosen, so a deleted album can't move the words.

     Body text never shrinks, so every page of a book reads at the same size.
     Headings and intros shrink first and only then end in "…". Every cut is
     recorded, so the editor can say what won't print before a client sees it.
     Field caps (STUDIO_BOOK_LIMITS.fields in app.js) were measured against the
     narrowest style and page shape, so ordinary prose at the cap fits in all. */
  const WRITING = { story: "Story", note: "About a photo", quote: "Quote", letter: "Letter", feature: "Zig-zag", article: "Story with a full-page photo", ways: "Ways we work", process: "How a shoot runs" };

  const WTYPE = {
    elegant: {
      kicker: { w: 500, size: 2.6, f: F.plex, sp: 0.55, caps: true, color: "soft" },
      rule: { w: 22, h: 0.8 },
      body: { w: 300, size: 3.6, f: F.sans, lead: 5.8 },
      drop: "ink",
      storyHead: { w: 300, f: F.serif, caps: false, start: 10, min: 7, lead: 1.18 },
      storyIntro: { w: 400, f: F.serif, it: true, start: 4.6, min: 4.2, lead: 6.6, color: "soft" },
      noteTitle: { w: 300, f: F.serif, caps: false, start: 7, min: 5, lead: 1.18 },
      quote: { w: 400, f: F.serif, it: true, lead: 1.25 }, quoteAlign: "left",
      quoteName: { w: 400, size: 4.4, f: F.serif, it: true },
      quoteRole: { w: 500, size: 2.6, f: F.plex, sp: 0.55, caps: true },
      letterHead: { w: 300, f: F.serif, caps: false, start: 11, min: 7.5, lead: 1.18 },
      letterBody: { w: 300, size: 4.0, f: F.serif, lead: 6.4 },
      sign: { w: 400, size: 5.0, f: F.serif, it: true },
      signLine: { w: 500, size: 2.6, f: F.plex, sp: 0.55, caps: true },
      featureSub: { w: 300, f: F.serif, caps: false, start: 6, min: 5, lead: 1.18, color: "ink" },
      smallLabel: { w: 500, size: 2.2, f: F.plex, sp: 0.45, caps: true },
      wayName: { w: 300, f: F.serif, start: 6, min: 4.8, lead: 1.18 },
      wayFor: { w: 400, f: F.serif, it: true, size: 3.6, lead: 5.0, color: "soft" },
      stepTitle: { w: 300, f: F.serif, start: 5.0, min: 4.2, lead: 1.18 },
      workNote: { w: 300, f: F.sans, size: 3.8, lead: 6.0 }
    },
    modern: {
      kicker: { w: 700, size: 2.5, f: F.mono, sp: 0.45, caps: true, color: "accentText" },
      rule: { w: 18, h: 1.2 },
      body: { w: 400, size: 3.6, f: F.sans, lead: 5.8 },
      drop: null,
      storyHead: { w: 800, f: F.heavy, sp: -0.2, caps: true, start: 9, min: 6.5, lead: 1.08 },
      storyIntro: { w: 500, f: F.sans, start: 4.2, min: 3.9, lead: 6.2, color: "ink" },
      noteTitle: { w: 800, f: F.heavy, sp: -0.2, caps: true, start: 6.5, min: 5, lead: 1.08 },
      // Mixed case: five lines of heavy capitals are hard to read.
      quote: { w: 700, f: F.heavy, lead: 1.2 }, quoteAlign: "left",
      quoteName: { w: 600, size: 3.8, f: F.sans },
      quoteRole: { w: 400, size: 3.4, f: F.sans },
      letterHead: { w: 800, f: F.heavy, sp: -0.2, caps: true, start: 9, min: 6, lead: 1.08 },
      letterBody: { w: 400, size: 3.8, f: F.sans, lead: 6.1 },
      sign: { w: 600, size: 4.0, f: F.sans },
      signLine: { w: 700, size: 2.5, f: F.mono, sp: 0.45, caps: true },
      featureSub: { w: 800, f: F.heavy, sp: -0.1, caps: true, start: 4.6, min: 4, lead: 1.1, color: "ink" },
      smallLabel: { w: 700, size: 2.2, f: F.mono, sp: 0.4, caps: true },
      wayName: { w: 800, f: F.heavy, sp: -0.2, caps: true, start: 5.4, min: 4.4, lead: 1.1 },
      wayFor: { w: 400, f: F.sans, size: 3.4, lead: 4.8, color: "soft" },
      stepTitle: { w: 800, f: F.heavy, sp: -0.2, start: 5.0, min: 4.2, lead: 1.14 },
      workNote: { w: 500, f: F.sans, size: 3.8, lead: 6.0 }
    },
    vogue: {
      kicker: { w: 600, size: 2.7, f: F.geo, sp: 0.8, caps: true, color: "accentText" },
      rule: { w: 24, h: 0.6 },
      body: { w: 400, size: 3.6, f: F.sans, lead: 5.8 },
      drop: "accentText",
      storyHead: { w: 300, f: F.serif, sp: 0.5, caps: true, start: 9, min: 6.5, lead: 1.15 },
      storyIntro: { w: 400, f: F.serif, it: true, start: 4.8, min: 4.3, lead: 6.8, color: "ink" },
      noteTitle: { w: 300, f: F.serif, sp: 0.5, caps: true, start: 7, min: 5, lead: 1.15 },
      quote: { w: 400, f: F.serif, it: true, lead: 1.25 }, quoteAlign: "center",
      quoteName: { w: 600, size: 2.9, f: F.geo, sp: 1.0, caps: true },
      quoteRole: { w: 400, size: 3.2, f: F.geo },
      letterHead: { w: 300, f: F.serif, sp: 0.5, caps: true, start: 10, min: 6.5, lead: 1.15 },
      letterBody: { w: 400, size: 3.8, f: F.sans, lead: 6.1 },
      sign: { w: 400, size: 5.0, f: F.serif, it: true },
      signLine: { w: 600, size: 2.7, f: F.geo, sp: 0.8, caps: true },
      featureSub: { w: 300, f: F.serif, sp: 0.4, caps: true, start: 5.2, min: 4.4, lead: 1.15, color: "ink" },
      smallLabel: { w: 600, size: 2.3, f: F.geo, sp: 0.6, caps: true },
      wayName: { w: 300, f: F.serif, sp: 0.4, caps: true, start: 5.6, min: 4.6, lead: 1.15 },
      wayFor: { w: 400, f: F.geo, size: 3.4, lead: 4.8, color: "soft" },
      stepTitle: { w: 300, f: F.serif, sp: 0.4, caps: true, start: 5.0, min: 4.2, lead: 1.15 },
      workNote: { w: 400, f: F.sans, size: 3.8, lead: 6.0 }
    }
  };
  const DETAIL_TYPE = { w: 400, f: F.sans };
  // Caption on a photos page, per style: start size and the smallest it goes.
  const CAPTION_TYPE = {
    elegant: { w: 400, f: F.serif, it: true, start: 3.6, min: 3.2 },
    modern: { w: 400, f: F.sans, start: 3.2, min: 2.8 },
    vogue: { w: 500, f: F.geo, start: 3.0, min: 2.6 }
  };
  const MARKER = "NO WORDS ON THIS PAGE YET";

  /* ---------- the studio's four ways of working -------------------------------
     Written from what the site and the contracts already say (the two booking
     doors, the 50/30/20 schedule, crew and venue rules, the test-shoot terms),
     so a client reading the book is told the same thing twice. It arrives on
     the page as ordinary words: every line sits in a box and can be rewritten. */
  const WAYS_COPY = {
    "kicker": "How we work",
    "heading": "Four ways we work with you",
    "intro": "Some shoots arrive with a plan, others with a goal, a collection or a portfolio to build. We work all four ways, and like ideas shaped together best.",
    "items": [
      {
        "name": "Your plan, lit and shot",
        "forWho": "Brands, designers and models with the look already decided",
        "text": "You send the concept, references and shot list. We build the light, direct on set, shoot to your plan and retouch the frames you choose.",
        "lead": "you"
      },
      {
        "name": "Your goal, our idea",
        "forWho": "Brands and designers with a goal, not yet a look",
        "text": "You tell us what the pictures are for and where they will run. We propose an idea, refine it with you, and shoot the plan we agree.",
        "lead": "together",
        "liked": true
      },
      {
        "name": "We plan it around you",
        "forWho": "Designers with a collection, models who need a portfolio",
        "text": "You bring the garments, or yourself. We plan the looks, light and frames, check the plan with you, and direct the shoot on the day.",
        "lead": "studio"
      },
      {
        "name": "Test shoot, shaped together",
        "forWho": "Models, stylists and make-up artists, by invitation",
        "text": "No shoot fee: new portfolio pictures for all of us. We propose an idea, you tell us what you'd change, and we refine it together.",
        "lead": "together",
        "liked": true
      }
    ]
  };
  const PROCESS_COPY = {
    "execute": {
      "menuName": "Your plan, lit and shot",
      "menuNote": "Client arrives with the concept, references and shot list; the studio shoots to it.",
      "kicker": "Your plan, lit and shot",
      "heading": "Your idea stays yours. We light it and shoot it.",
      "intro": "You come with the concept, references and shot list. We bring light built for it, direction on set and retouching that doesn't change the work.",
      "steps": [
        {
          "who": "you",
          "title": "Send the brief",
          "text": "Your references, the looks, the shot list and where the pictures will run. Links and files are both welcome."
        },
        {
          "who": "together",
          "title": "Questions, then a price",
          "text": "We go through the brief with you, ask what we need to, and write a price against it before anything is booked."
        },
        {
          "who": "you",
          "title": "Your team, or help finding one",
          "text": "Bring your own stylist, hair and make-up artist and model, or ask us to help. Any crew cost is quoted for your approval first."
        },
        {
          "who": "studio",
          "title": "The shoot, run to your list",
          "text": "Light built for your concept and direction on set. Your planned frames come first, then the variations you need."
        },
        {
          "who": "you",
          "title": "Choose your selects",
          "text": "Pick your selects from an online proofing gallery. Those are the frames we retouch."
        },
        {
          "who": "studio",
          "title": "Retouched and credited",
          "text": "Your selects are retouched without changing the work, and the whole team is credited. RAW files are not delivered."
        }
      ],
      "note": "Want a second opinion on the plan? Ask, and we'll talk it through with you."
    },
    "pitch": {
      "menuName": "Your goal, our idea",
      "menuNote": "Client knows the goal and where the pictures will run; the studio proposes the idea.",
      "kicker": "Your goal, our idea",
      "heading": "You set the goal. We propose the idea.",
      "intro": "You know what the pictures need to do. We come back with an idea for how they could look, then shape it with you until it's a plan we both want to shoot.",
      "steps": [
        {
          "who": "you",
          "title": "Tell us the goal",
          "text": "What the pictures are for, where they will run, what they need to say, and anything that can't change."
        },
        {
          "who": "studio",
          "title": "We propose an idea",
          "text": "How the pictures could look: the mood, the light, the location and the styling, with reference pictures to show it."
        },
        {
          "who": "together",
          "title": "Shape it together",
          "text": "Tell us what works and what doesn't. We refine the idea with you until the look, the team and the shot list are agreed."
        },
        {
          "who": "studio",
          "title": "Ready before the day",
          "text": "A price written against the agreed plan, a written contract signed online, and help putting the team together if you need it."
        },
        {
          "who": "studio",
          "title": "The shoot",
          "text": "Run to the shot list, with light built for the idea: the planned frames first, then time for what the day turns up."
        },
        {
          "who": "together",
          "title": "Selects, retouched and credited",
          "text": "You choose from the proofing gallery. We retouch your selects and credit everyone who worked on the shoot."
        }
      ],
      "note": "The idea is ours to propose and yours to shape. The plan is agreed before the day."
    },
    "lead": {
      "menuName": "We plan it around you",
      "menuNote": "Designer with garments, or a model wanting a portfolio; the studio plans, client checks.",
      "kicker": "We plan it around you",
      "heading": "Bring the garments, or yourself. We plan the shoot.",
      "intro": "A designer with a new collection and a model who needs a portfolio start in the same place: what the pictures are for. We plan the rest, with you.",
      "steps": [
        {
          "who": "you",
          "title": "Tell us what it's for",
          "text": "The collection and where the pictures will be used, or the kind of work you want to be booked for."
        },
        {
          "who": "studio",
          "title": "We plan the shoot",
          "text": "The looks and the order they are shot in, the light, the location, who needs to be there and the frames to come away with."
        },
        {
          "who": "together",
          "title": "Check the plan with us",
          "text": "It's written down as a short brief you can correct, and the final looks are picked together before the shoot."
        },
        {
          "who": "studio",
          "title": "We help put the team together",
          "text": "Hair and make-up, styling or a model, when you ask. Any crew cost is quoted for your approval first."
        },
        {
          "who": "studio",
          "title": "The shoot, directed",
          "text": "You are directed through every pose, so no experience is needed. Garments are shot whole and close up, in true colour."
        },
        {
          "who": "together",
          "title": "Choose, and we retouch",
          "text": "Pick your selects from the proofing gallery. We retouch them naturally, without changing the work, and credit the team."
        }
      ],
      "note": "Even when the plan is ours, you see it, correct it and pick the final looks with us."
    },
    "test": {
      "menuName": "Test shoot, shaped together",
      "menuNote": "Invited test shoot: the studio proposes an idea, the client responds, and it's refined.",
      "kicker": "Test shoot, shaped together",
      "heading": "We propose. You respond. We refine it together.",
      "intro": "A test shoot is by invitation and has no shoot fee. Each of us brings our craft to make new portfolio pictures, so the idea has to be worth everyone's time.",
      "steps": [
        {
          "who": "studio",
          "title": "We propose an idea",
          "text": "A short idea for the pictures, with references to show it, shared with the people we'd like to shoot with."
        },
        {
          "who": "you",
          "title": "Tell us what you think",
          "text": "What you would bring, such as posing, a garment you designed or a hair and make-up look, and what you would change."
        },
        {
          "who": "together",
          "title": "Refine it until it's right",
          "text": "We adjust the idea with your feedback until it works for everyone. Once you confirm the plan by reply, your date is held."
        },
        {
          "who": "together",
          "title": "Agree who brings what",
          "text": "We bring the camera, the light and the edit. You bring wardrobe and make-up. Any crew or studio rental is quoted in advance."
        },
        {
          "who": "together",
          "title": "The shoot",
          "text": "The planned frames first, then time for what the day turns up. We shape the light; you bring the look."
        },
        {
          "who": "studio",
          "title": "Selection, edit and credits",
          "text": "You see the proofing gallery. The final selection and edit rest with us, and everyone who worked on it is credited."
        }
      ],
      "note": "Your pictures: portfolios and social media, not commercial use. Instagram posts add @nerdyphotographer.in as co-author."
    }
  };

  /* ---------- the studio's own formatting of a text -----------------------------
     A font (open-source, SIL Open Font License, from Google Fonts), a colour
     (a book colour or any hex colour) and an alignment, chosen per text. The
     site's own six families are already loaded; the others load the first
     time a book uses them. A style's weight snaps to the nearest the family
     has, so a light Fraunces headline becomes the lightest Playfair. */
  const FONT_LIST = [
    { key: "fraunces", name: "Fraunces", kind: "Serif", family: F.serif, weights: [300], italic: [400, 500] },
    { key: "playfair", name: "Playfair Display", kind: "Serif", family: "'Playfair Display', Georgia, serif", range: [400, 900], css: "Playfair+Display:ital,wght@0,400..900;1,400..900" },
    { key: "cormorant", name: "Cormorant Garamond", kind: "Serif", family: "'Cormorant Garamond', Georgia, serif", range: [300, 700], css: "Cormorant+Garamond:ital,wght@0,300..700;1,300..700" },
    { key: "baskerville", name: "Libre Baskerville", kind: "Serif", family: "'Libre Baskerville', Georgia, serif", weights: [400, 700], italic: [400], css: "Libre+Baskerville:ital,wght@0,400;0,700;1,400" },
    { key: "bodoni", name: "Bodoni Moda", kind: "Serif", family: "'Bodoni Moda', Georgia, serif", range: [400, 900], css: "Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900" },
    { key: "dmserif", name: "DM Serif Display", kind: "Serif", family: "'DM Serif Display', Georgia, serif", weights: [400], css: "DM+Serif+Display:ital@0;1" },
    { key: "archivo", name: "Archivo", kind: "Sans", family: F.heavy, range: [400, 900] },
    { key: "inter", name: "Inter", kind: "Sans", family: F.sans, weights: [300, 400, 500, 600] },
    { key: "outfit", name: "Outfit", kind: "Sans", family: F.geo, range: [400, 800] },
    { key: "sourcesans", name: "Source Sans 3", kind: "Sans", family: "'Source Sans 3', Arial, sans-serif", range: [200, 900], css: "Source+Sans+3:ital,wght@0,200..900;1,200..900" },
    { key: "jost", name: "Jost", kind: "Sans", family: "Jost, Arial, sans-serif", range: [100, 900], css: "Jost:ital,wght@0,100..900;1,100..900" },
    { key: "manrope", name: "Manrope", kind: "Sans", family: "Manrope, Arial, sans-serif", range: [200, 800], css: "Manrope:wght@200..800" },
    { key: "spacegrotesk", name: "Space Grotesk", kind: "Sans", family: "'Space Grotesk', Arial, sans-serif", range: [300, 700], css: "Space+Grotesk:wght@300..700" },
    { key: "oswald", name: "Oswald", kind: "Condensed", family: "Oswald, 'Arial Narrow', sans-serif", range: [200, 700], css: "Oswald:wght@200..700" },
    { key: "plexmono", name: "IBM Plex Mono", kind: "Mono", family: F.plex, weights: [400, 500, 600, 700] }
  ];
  const ALIGNS = ["left", "center", "right", "justify"];
  const fontByKey = (key) => FONT_LIST.find((f) => f.key === key) || null;
  function weightFor(font, w, italic) {
    const list = (italic && font.italic) || font.weights;
    if (list) return list.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), list[0]);
    return Math.min(font.range[1], Math.max(font.range[0], w));
  }
  // Font, weight and italic from the studio's formatting; the family's own
  // weights decide what a weight becomes.
  const WEIGHTS = { light: 300, regular: 400, bold: 700 };
  function styledSpec(spec, f) {
    if (!f || (!f.font && !f.weight && f.italic === undefined)) return spec;
    const font = fontByKey(f.font);
    const it = f.italic === true ? true : !!spec.it;
    const wanted = WEIGHTS[f.weight] || spec.w;
    if (font) return { ...spec, f: font.family, it, w: weightFor(font, wanted, it) };
    const base = FONT_LIST.find((x) => x.family === spec.f);
    return { ...spec, it, w: base ? weightFor(base, wanted, it) : wanted };
  }
  const sizeScale = (f) => (f && typeof f.size === "number" && isFinite(f.size) ? Math.min(1.6, Math.max(0.6, f.size)) : 1);
  /* A text is formatted as a whole, and then each paragraph can differ: its
     own font, colour, size, weight, italic and alignment. Paragraph 1 is the
     first block of words typed, 2 the next, and so on; what a paragraph
     doesn't set, it takes from the whole text. Only flowing texts carry this
     (the story, the letter, the words about a photo, About the studio) —
     headlines and quotes are one run of words, whatever is typed. */
  const hasParaFmt = (f) => !!(f && f.paras && typeof f.paras === "object" && Object.keys(f.paras).length);
  function paraFmt(f, i) {
    const base = f || {};
    const one = hasParaFmt(base) ? base.paras[String(i + 1)] : null;
    if (!one) return base;
    const out = { ...base, ...one };
    delete out.paras;
    return out;
  }
  // Formatting for a text on a page the plan engine doesn't lay out (the cover,
  // a chapter page, the About page). Gives the spec to draw with, the size
  // scale, the colour, and where to put a line inside its column.
  function textFormat(where, key, spec, P, color, align = "left") {
    const f = (where && where[key]) || {};
    const st = styledSpec(spec, f);
    return {
      spec: st, scale: sizeScale(f), color: tintOf(f.color, P, color),
      align: ALIGNS.includes(f.align) && f.align !== "justify" ? f.align : align,
      at(x, w) { return this.align === "center" ? x + w / 2 : this.align === "right" ? x + w : x; }
    };
  }
  const coverStyleOf = (book) => (book && book.coverStyle && typeof book.coverStyle === "object" ? book.coverStyle : null);
  function tintOf(color, P, fallback) {
    if (color === "ink" && P) return P.ink;
    if (color === "soft" && P) return P.soft;
    if (color === "accent" && P) return accentText(P);
    if (P && (color === "paper" || color === "white" || color === "deep")) return P[color];
    return /^#[0-9a-f]{6}$/i.test(String(color || "")) ? color : fallback;
  }
  const fontLoads = new Map();
  function loadFont(key) {
    const font = fontByKey(key);
    if (!font || !font.css) return Promise.resolve();
    if (!fontLoads.has(key)) {
      fontLoads.set(key, new Promise((resolve) => {
        const link = document.createElement("link");
        link.rel = "stylesheet"; link.id = `sb-font-${key}`;
        link.href = `https://fonts.googleapis.com/css2?family=${font.css}&display=swap`;
        const done = () => resolve();
        link.onload = done; link.onerror = done; setTimeout(done, 8000);
        document.head.appendChild(link);
      }).then(() => {
        // The stylesheet only names the files; fetch the faces canvas will use.
        const fam = font.family.split(",")[0].trim();
        const ws = new Set([300, 400, 500, 600, 700, 800].map((w) => weightFor(font, w, false)));
        const its = new Set([400, 500].map((w) => weightFor(font, w, true)));
        return Promise.all([...[...ws].map((w) => `${w} 20px ${fam}`), ...[...its].map((w) => `italic ${w} 20px ${fam}`)]
          .map((d) => document.fonts.load(d, "Abc€“”").catch(() => null)));
      }));
    }
    return fontLoads.get(key);
  }
  function bookFontKeys(book) {
    const keys = new Set();
    const take = (style) => {
      for (const f of Object.values(style || {})) {
        if (!f || typeof f !== "object") continue;
        if (f.font) keys.add(f.font);
        for (const p of Object.values(f.paras || {})) if (p && p.font) keys.add(p.font);
      }
    };
    take(book && book.coverStyle);
    for (const pg of (book && book.pages) || []) take(pg && pg.style);
    return [...keys];
  }
  const ensureBookFonts = (book) => Promise.all(bookFontKeys(book).map(loadFont));

  let measurePage = null;
  const measurer = () => measurePage || (measurePage = API.newPdfPage(72, { w: 10, h: 10 }));

  // Tidied only when laying out, never in what is stored or in the box being
  // typed in: odd spaces become spaces, invisible characters go, and any run
  // of line breaks is one paragraph break (Enter twice looks like Enter once,
  // and stray blank lines from a paste can't use up the page).
  // ZWJ and ZWNJ stay: they hold emoji sequences and Devanagari spellings together.
  const INVISIBLE = /[\u200B\uFEFF\u00AD]/g;
  function paragraphs(s) {
    return String(s || "").replace(/\r\n?/g, "\n").replace(INVISIBLE, "")
      .split(/\n+/).map((p) => p.split(/\s+/).filter(Boolean)).filter((p) => p.length);
  }
  const oneParagraph = (s) => paragraphs(s).flat();
  // The page draws its own opening mark, so any typed at either end go.
  const QUOTE_MARKS = /^[\s“”„"'‘’«»]+|[\s“”„"'‘’«»]+$/g;

  // Greedy word wrap, one line at a time, from a queue of word pieces
  // { s, w: word index, end: last piece of that word }. A word wider than the
  // whole line is broken by character, with no hyphen, so a pasted link can
  // never run off the page.
  function takeLine(page, q, width) {
    const line = [];
    let str = "";
    while (q.length) {
      const next = str ? `${str} ${q[0].s}` : q[0].s;
      if (measure(page, next) <= width) { str = next; line.push(q.shift()); continue; }
      if (line.length) break;
      const chars = Array.from(q[0].s);
      let n = 1;
      while (n < chars.length && measure(page, chars.slice(0, n + 1).join("")) <= width) n++;
      line.push({ s: chars.slice(0, n).join(""), w: q[0].w, end: false });
      q[0] = { ...q[0], s: chars.slice(n).join("") };
      break;
    }
    return line;
  }
  const joinLine = (pieces) => pieces.map((p) => p.s).join(" ");
  // End a line with "…" (after a space in running text), dropping characters
  // until it fits. Returns the string and how many words stay whole.
  function endLine(page, pieces, width, spaced) {
    let t = joinLine(pieces);
    const make = () => (t ? `${t}${spaced ? " " : ""}…` : "…");
    while (t && measure(page, make()) > width) t = Array.from(t).slice(0, -1).join("").trimEnd();
    let at = 0, whole = 0;
    for (const p of pieces) { at += p.s.length; if (at <= t.length && p.end) whole++; at += 1; }
    return { s: make(), whole };
  }
  // Last words that print, for "the page ends at …".
  const tailOf = (s) => s.replace(/\s*…$/, "").split(/\s+/).slice(-5).join(" ");

  // Headings, intros, quotes and one-line fields: shrink in 0.25 mm steps
  // until the words take at most `maxLines`, then, only if they still don't,
  // end the last line with "…".
  function fitBlock(page, s, width, maxLines, spec, start, min, caps) {
    const words = oneParagraph(s).map((w) => (caps ? w.toUpperCase() : w));
    const total = words.length;
    let size = start, lines = [];
    for (;;) {
      font(page, spec.w, size, spec.f, spec.sp || 0, !!spec.it);
      const q = words.map((w, i) => ({ s: w, w: i, end: true }));
      lines = [];
      while (q.length) lines.push(takeLine(page, q, width));
      if (lines.length <= maxLines || size <= min + 1e-6) break;
      size = Math.max(min, Math.round((size - 0.25) * 100) / 100);
    }
    let out = lines.map(joinLine), printed = total, cut = false;
    if (lines.length > maxLines) {
      cut = true;
      const kept = lines.slice(0, maxLines);
      const last = endLine(page, kept[maxLines - 1], width, false);
      out = kept.map(joinLine);
      out[maxLines - 1] = last.s;
      printed = kept.slice(0, -1).reduce((n, l) => n + l.filter((p) => p.end).length, 0) + last.whole;
    }
    return { size, lines: out, cut, printed, total, shrunk: size < start - 1e-6, nearMin: size < start - 1e-6 && size - min <= 1 + 1e-6, maxLines };
  }

  // Running text poured into columns in order. Paragraphs are separated by
  // half a line, never at the top of a column. Returns the placed lines and
  // what didn't fit. A drop cap is used only when the first paragraph is long
  // enough to hold it (three lines) and its letter doesn't hang below them.
  function flowBody(page, s, cols, spec, dropColor, specFor) {
    const paras = paragraphs(s);
    const flat = paras.map((p) => p.join(" ")).join("\n");
    // With no per-paragraph formatting, every paragraph draws with the text's
    // own spec, exactly as it always has.
    const specOf = (pi) => (specFor ? specFor(pi).spec : spec);
    const leadOf = (pi) => (specFor ? specFor(pi).lead : spec.lead);
    const infoOf = (pi) => (specFor ? specFor(pi) : {});
    const lead = leadOf(0);
    const run = (drop) => {
      let wi = 0;
      const queues = paras.map((p) => p.map((w) => ({ s: w, w: wi++, end: true })));
      const total = wi;
      let dc = null, dropWord = 0;
      if (drop) {
        const letter = queues[0][0].s[0].toUpperCase();
        const size = (2 * lead + 0.728 * specOf(0).size) / 0.716;
        font(page, 300, size, F.serif);
        dc = { s: letter, x: cols[0].x, y: cols[0].top + 2 * lead, size, indent: measure(page, letter) + 2.2 };
        queues[0][0] = { ...queues[0][0], s: queues[0][0].s.slice(1) };
        if (!queues[0][0].s) { queues[0].shift(); dropWord = 1; }
      }
      const lines = [], marks = [];
      let ci = 0, y = cols[0].top, colTop = true, cut = false, curLead = lead, numbered = 0;
      outer:
      for (let pi = 0; pi < queues.length; pi++) {
        const q = queues[pi];
        const ps = specOf(pi), info = infoOf(pi);
        curLead = leadOf(pi);
        font(page, ps.w, ps.size, ps.f, ps.sp || 0, !!ps.it);
        if (!colTop) y += curLead * 0.5;
        // A list paragraph hangs from its bullet or number; numbers run on
        // until a paragraph that isn't numbered.
        const mark = info.list === "bullet" ? "•" : info.list === "number" ? `${++numbered}.` : null;
        if (info.list !== "number") numbered = 0;
        const hang = mark ? Math.max(4, ps.size * 1.35) : 0;
        let first = true;
        // A paragraph set in two or three columns: its lines wrapped narrow
        // and dealt across the columns, balanced, then the flow goes on below.
        const ncol = info.columns === 2 || info.columns === 3 ? info.columns : 1;
        if (ncol > 1 && q.length) {
          if (y > cols[ci].bottom + 0.01) { if (++ci >= cols.length) { cut = true; break outer; } y = cols[ci].top; colTop = true; }
          const gap = Math.max(3, ps.size * 0.9);
          const subW = (cols[ci].w - gap * (ncol - 1)) / ncol;
          const all = [];
          while (q.length) all.push(takeLine(page, q, subW));
          let per = Math.ceil(all.length / ncol);
          let room = Math.floor((cols[ci].bottom + 0.01 - y) / curLead) + 1;
          if (per > room && !colTop && ci + 1 < cols.length) { ci++; y = cols[ci].top; colTop = true; room = Math.floor((cols[ci].bottom + 0.01 - y) / curLead) + 1; }
          const short = per > room;
          if (short) { per = Math.max(1, room); cut = true; }
          all.forEach((pieces, k) => {
            const c = Math.floor(k / per), r = k % per;
            if (c >= ncol) return;
            lines.push({ pieces, x: cols[ci].x + c * (subW + gap), y: y + r * curLead, w: subW, pi, end: k === all.length - 1 });
          });
          y += per * curLead; colTop = false;
          if (short) break outer;
          continue;
        }
        while (q.length) {
          if (y > cols[ci].bottom + 0.01) {
            if (++ci >= cols.length) { cut = true; break outer; }
            y = cols[ci].top; colTop = true;
          }
          const ind = (dc && ci === 0 && y <= dc.y + 0.01 ? dc.indent : 0) + hang;
          const width = cols[ci].w - ind;
          if (first && mark) { marks.push({ s: mark, x: cols[ci].x + ind - hang, y, pi }); first = false; }
          const pieces = takeLine(page, q, width);
          lines.push({ pieces, x: cols[ci].x + ind, y, w: width, pi, end: q.length === 0 });
          y += curLead; colTop = false;
        }
      }
      let printed = dropWord + lines.reduce((n, l) => n + l.pieces.filter((p) => p.end).length, 0);
      const out = lines.map((l) => ({ s: joinLine(l.pieces), x: l.x, y: l.y, w: l.w, end: l.end, pi: l.pi }));
      if (cut && lines.length) {
        const L = lines[lines.length - 1];
        const e = endLine(page, L.pieces, L.w, true);
        printed -= L.pieces.filter((p) => p.end).length - e.whole;
        out[out.length - 1].s = e.s;
      }
      let left = 0;
      if (!cut) for (let c = ci; c < cols.length; c++) {
        const from = c === ci ? y : cols[c].top;
        if (from <= cols[c].bottom + 0.01) left += Math.floor((cols[c].bottom + 0.01 - from) / curLead) + 1;
      }
      // The letter spans three lines, so the first paragraph must fill all
      // three beside it, or the next paragraph would run into the letter.
      const dropOk = !dc || (lines.length >= 3 && lines.slice(0, 3).every((l) => l.pi === 0 && l.x > cols[0].x));
      const tail = out.length ? tailOf(out[out.length - 1].s) : "";
      return { lines: out, marks, cut, printed, total, used: lines.length, left, drop: dc, dropOk, tail };
    };
    const wantDrop = !!dropColor && flat.length >= 120 && paras.length && /^[A-IK-PR-Za-ik-pr-z]/.test(paras[0][0]);
    if (wantDrop) { const r = run(true); if (r.dropOk) return { ...r, dropColor }; }
    return run(false);
  }

  // A photos page's one caption, measured like the writing pages.
  function captionFit(entry, width, spec) {
    if (!entry || !oneParagraph(entry.caption).length) return null;
    const f = (entry.style && entry.style.caption) || {};
    const styled = styledSpec(spec, f);
    const sc = sizeScale(f);
    const r = fitBlock(measurer(), entry.caption, width, 1, styled, spec.start * sc, spec.min * sc, false);
    return { ...r, spec: styled, color: f.color, align: f.align === "center" || f.align === "right" ? f.align : "left", width };
  }
  function drawCaption(page, r, x, y, spec, color, P) {
    const s = r.spec || spec;
    font(page, s.w, r.size, s.f, s.sp || 0, !!s.it);
    const c = tintOf(r.color, P, color);
    if (r.align === "center") text(page, r.lines[0], x + r.width / 2, y, c, "center");
    else if (r.align === "right") text(page, r.lines[0], x + r.width, y, c, "right");
    else text(page, r.lines[0], x, y, c);
    if (r.cut) reportCut(page, "caption", "caption");
  }

  /* ---------- borders round a full-page photo -----------------------------------
     By default each style draws its own foot on a full-page photo. When the
     studio picks a border, the photo sits inside bands on the chosen edges,
     narrow, standard or broad. The page number (and the credit, where there's
     room) goes in the foot band, else the top band; a caption always gets a
     band at the foot; "none" leaves the photograph alone, with no number. */
  const BAND = { narrow: 4, broad: 16 };
  function bandsFor(entry, hasCaption) {
    const t = BAND[entry.borderWidth] || 9, e = entry.border;
    const on = (side) => e === "all" || e === side;
    return { t, top: on("top") ? t : 0, left: on("left") ? t : 0, right: on("right") ? t : 0, bottom: on("bottom") ? Math.max(t, hasCaption ? 16 : 0) : (hasCaption ? 16 : 0) };
  }
  function paintBands(page, P, W, H, B, colors, n, credit, cap, numberSide) {
    if (B.top) rect(page, 0, 0, W, B.top, colors.band);
    if (B.bottom) rect(page, 0, H - B.bottom, W, B.bottom, colors.band);
    if (B.left) rect(page, 0, 0, B.left, H, colors.band);
    if (B.right) rect(page, W - B.right, 0, B.right, H, colors.band);
    const lx = B.left + (B.left ? 6 : 14), rx = W - B.right - (B.right ? 6 : 14);
    if (cap) drawCaption(page, cap, lx, H - 9.6, null, colors.on, P);
    const across = B.bottom || B.top;
    if (across) {
      const size = Math.min(2.4, across * 0.5);
      font(page, 700, size, F.mono, 0.4);
      const y = B.bottom ? (cap ? H - 3.4 : H - B.bottom / 2 + size * 0.36) : B.top / 2 + size * 0.36;
      const right = numberSide === "right";
      if (showNums()) text(page, String(n).padStart(2, "0"), right ? rx : lx, y, colors.on, right ? "right" : "left");
      if (credit && size >= 2.4) text(page, ellipsize(page, credit.toUpperCase(), Math.max(10, rx - lx - 14)), right ? lx : rx, y, colors.on, right ? "left" : "right");
    } else if (B.left || B.right) {
      const t = B.left || B.right, size = Math.min(2.4, t * 0.5);
      font(page, 700, size, F.mono, 0.2);
      if (showNums()) text(page, String(n).padStart(2, "0"), B.left ? B.left / 2 : W - B.right / 2, H - 8, colors.on, "center");
    }
  }
  const bandColors = (style, P) => (style === "vogue" ? { band: P.white, on: P.ink } : { band: P.deep, on: P.onDeep });
  function bandedPhotoPage(page, entry, P, W, H, imgs, shots, shoots, n, cap, style, gap) {
    const B = bandsFor(entry, !!cap);
    rect(page, 0, 0, W, H, pageBgOf(bookNow, entry, P, P.white));
    const a = { x: B.left, y: B.top, w: W - B.left - B.right, h: H - B.top - B.bottom };
    if (shots.length === 1) {
      if (imgs[0]) drawPhoto(page, imgs[0], shots[0], a.x, a.y, a.w, a.h); else missing(page, P, a.x, a.y, a.w, a.h);
    } else {
      const aspects = shots.map((s, i) => (imgs[i] ? imgAspect(imgs[i]) : 0.7));
      cells(shots.length, a, gap, aspects, W > H, entry.rows).forEach((c, i) => {
        if (imgs[i]) drawPhoto(page, imgs[i], shots[i], c.x, c.y, c.w, c.h); else missing(page, P, c.x, c.y, c.w, c.h);
      });
    }
    paintBands(page, P, W, H, B, bandColors(style, P), n, pageCredit(entry, shoots), cap, n % 2 ? "right" : "left");
  }

  /* ---------- paper sizes -----------------------------------------------------
     Every page is designed on A4 and printed on the paper chosen for the book.
     B5 and A5 have A4's proportions, so they are A4 made smaller. Letter is a
     little wider (portrait) or taller (landscape) in proportion, so its design
     space is A4 grown on that side: the layout keeps its A4 place, the extra
     goes to the margins, and anything that bleeds still reaches the edge. */
  const PAPERS = {
    a4: { name: "A4", w: 210, h: 297, note: "210 × 297 mm · most printers" },
    b5: { name: "B5", w: 176, h: 250, note: "176 × 250 mm" },
    a5: { name: "A5", w: 148, h: 210, note: "148 × 210 mm · booklet" },
    letter: { name: "Letter", w: 215.9, h: 279.4, note: "8.5 × 11 in · US printers" }
  };
  /* Booklets: pages printed two to a sheet, in the order that folds into a
     book. The sheet is the size up from the page (A5 pages on A4 sheets). */
  const SHEETS = { a5: { w: 297, h: 210, name: "A4", page: "A5" }, a4: { w: 420, h: 297, name: "A3", page: "A4" }, b5: { w: 353, h: 250, name: "B4", page: "B5" }, letter: { w: 431.8, h: 279.4, name: "Tabloid (11 × 17 in)", page: "Letter" } };
  // Which pages share each side of each sheet, front then back, left then
  // right, 1 being the cover: the outside of the first sheet carries the last
  // page and the cover, its inside page 2 and the page before last, and so on
  // inward. A count that isn't a multiple of four is filled with blank pages
  // (0) just before the last page, so the cover and the last page still come
  // out on the outside of the folded stack.
  function bookletSides(n) {
    const N = Math.ceil(n / 4) * 4, sides = [];
    for (let s = 0; s < N / 4; s++) { sides.push([N - 2 * s, 2 * s + 1]); sides.push([2 * s + 2, N - 2 * s - 1]); }
    // Position 1 is always the cover; the last position holds the last page
    // when there is one beyond the cover; everything else past the pages is blank.
    const at = (k) => (k === 1 ? 1 : k < n ? k : (k === N && n > 1) ? n : 0);
    return sides.map((side) => side.map(at));
  }
  function geometry(book) {
    const L = book.orientation === "landscape";
    const p = PAPERS[book.paper] || PAPERS.a4;
    const pw = L ? p.h : p.w, ph = L ? p.w : p.h;          // the printed page, mm
    const Wa = L ? 297 : 210, Ha = L ? 210 : 297;           // the A4 design frame
    const s = Math.min(pw / Wa, ph / Ha);                   // design mm → printed mm
    const W = Math.max(Wa, pw / s), H = Math.max(Ha, ph / s);
    return { L, W, H, Wa, Ha, s, ox: (W - Wa) / 2, oy: (H - Ha) / 2, pw, ph };
  }
  // Moves an operation laid out on the A4 frame onto the paper's design space.
  function placeOp(o, G) {
    if (!G.ox && !G.oy) return o;
    const turned = (out) => (o.rot ? { ...out, rot: { ...o.rot, cx: o.rot.cx + G.ox, cy: o.rot.cy + G.oy } } : out);
    if (o.k === "stroke") return turned({ ...o, pts: o.pts.map(([x, y]) => [x + G.ox, y + G.oy]) });
    if (o.k === "text" || o.k === "guide") return turned({ ...o, x: o.x + G.ox, y: o.y + G.oy });
    const axis = (a, len, full, off, total, stretch) => {
      const atStart = a <= 0.01, atEnd = a + len >= full - 0.01;
      if (atStart && atEnd) return [0, total];                       // spans the page: still does
      if (atStart) return [0, stretch ? len + off : len];             // bleeds off the start edge
      if (atEnd) return stretch ? [a + off, total - (a + off)] : [a + 2 * off, len];   // bleeds off the end edge
      return [a + off, len];
    };
    const stretch = o.k === "photo";   // a rect or a path keeps its size
    const [x, w] = axis(o.x, o.w, G.Wa, G.ox, G.W, stretch);
    const [y, h] = axis(o.y, o.h, G.Ha, G.oy, G.H, stretch);
    return turned({ ...o, x, y, w, h });
  }

  /* ---------- where a writing page's photo sits ------------------------------
     Boxes on the A4 frame, per page kind, position and style. Elegant insets
     its photographs on paper with a hairline frame; Modern bleeds them but
     keeps clear of its foot rule; Vogue bleeds them to every edge it touches.
     Each position keeps at least the text room the page's word caps were
     measured against, so words that fit in one position fit in all. */
  const PHOTO_AT = { story: ["top", "bottom", "left", "right"], note: ["top", "bottom", "left", "right"], quote: ["top", "bottom", "left", "right"], feature: ["left", "right"], article: ["left", "right"] };
  // Where the photo sits when the studio hasn't chosen: above the words on a
  // portrait page, beside them on a landscape one; a two-page story opens on
  // its words, with the photo on the facing (right-hand) page.
  const photoAtOf = (entry, L) => ((PHOTO_AT[entry.type] || []).includes(entry.photoAt) ? entry.photoAt : (entry.type === "feature" ? "left" : entry.type === "article" ? "right" : (L ? "left" : "top")));
  const BOXES = {
    story: {
      P: { top: { e: [20, 22, 170, 110], m: [0, 0, 210, 132], v: [0, 0, 210, 132] },
           bottom: { e: [20, 170, 170, 97], m: [0, 170, 210, 109], v: [0, 170, 210, 127] },
           left: { e: [20, 22, 80, 245], m: [0, 0, 92, 279], v: [0, 0, 92, 297] },
           right: { e: [110, 22, 80, 245], m: [118, 0, 92, 279], v: [118, 0, 92, 297] } },
      L: { left: { e: [20, 18, 112, 168], m: [0, 0, 140, 192], v: [0, 0, 140, 210] },
           right: { e: [165, 18, 112, 168], m: [157, 0, 140, 192], v: [157, 0, 140, 210] },
           top: { e: [20, 18, 257, 74], m: [0, 0, 297, 86], v: [0, 0, 297, 92] },
           bottom: { e: [20, 118, 257, 68], m: [0, 118, 297, 74], v: [0, 118, 297, 92] } }
    },
    note: {
      P: { top: { e: [20, 22, 170, 178], m: [0, 0, 210, 202], v: [0, 0, 210, 202] },
           bottom: { e: [20, 96, 170, 171], m: [0, 96, 210, 183], v: [0, 96, 210, 201] },
           left: { e: [20, 22, 104, 245], m: [0, 0, 124, 279], v: [0, 0, 124, 297] },
           right: { e: [86, 22, 104, 245], m: [86, 0, 124, 279], v: [86, 0, 124, 297] } },
      L: { left: { e: [20, 18, 170, 168], m: [0, 0, 196, 192], v: [0, 0, 196, 210] },
           right: { e: [107, 18, 170, 168], m: [101, 0, 196, 192], v: [101, 0, 196, 210] },
           top: { e: [20, 18, 257, 106], m: [0, 0, 297, 120], v: [0, 0, 297, 126] },
           bottom: { e: [20, 84, 257, 102], m: [0, 84, 297, 108], v: [0, 84, 297, 126] } }
    },
    quote: {
      P: { top: { e: [20, 22, 170, 128], m: [0, 0, 210, 150], v: [0, 0, 210, 150] },
           bottom: { e: [20, 145, 170, 122], m: [0, 145, 210, 134], v: [0, 146, 210, 151] },
           left: { e: [20, 22, 80, 245], m: [0, 0, 95, 279], v: [0, 0, 95, 297] },
           right: { e: [110, 22, 80, 245], m: [115, 0, 95, 279], v: [115, 0, 95, 297] } },
      L: { left: { e: [20, 18, 112, 168], m: [0, 0, 140, 192], v: [0, 0, 140, 210] },
           right: { e: [165, 18, 112, 168], m: [157, 0, 140, 192], v: [157, 0, 140, 210] },
           top: { e: [20, 18, 257, 74], m: [0, 0, 297, 86], v: [0, 0, 297, 92] },
           bottom: { e: [20, 112, 257, 74], m: [0, 106, 297, 86], v: [0, 118, 297, 92] } }
    }
  };
  const boxFor = (type, st, L, at) => BOXES[type][L ? "L" : "P"][at][st === "elegant" ? "e" : st === "modern" ? "m" : "v"];

  // The plan for one writing page: drawing operations in mm, the cuts, and
  // for the editor, how each field fared. Laid out on the A4 frame, then
  // placed on the book's paper.
  function planWriting(book, entry) {
    const G = geometry(book);
    const st = WTYPE[book.style] ? book.style : "modern";
    const T = WTYPE[st];
    const P = colourway(book.colourway);
    const L = G.L, W = G.Wa, H = G.Ha;
    const page = measurer();
    const plan = { ops: [], cuts: [], fields: {}, foot: {} };
    const op = (o) => plan.ops.push(o);
    const rectOp = (x, y, w, h, c) => op({ k: "rect", x, y, w, h, c });
    // Which text an op belongs to, so the editor can find it on the page and
    // the painter can leave it out while it is being typed there.
    let fieldNow = null;
    const put = (s, x, y, spec, size, c, align = "left") => op({ k: "text", s, x, y, f: [spec.w, size, spec.f, spec.sp || 0, !!spec.it], c, align, field: fieldNow });
    // The studio's own formatting of a text: its font, colour and alignment.
    const fmt = (field) => (entry.style && typeof entry.style === "object" && entry.style[field]) || {};
    const styled = (field, spec) => styledSpec(spec, fmt(field));
    const tint = (field, fallback) => tintOf(fmt(field).color, P, fallback);
    const alignOf = (field, fallback = "left") => (ALIGNS.includes(fmt(field).align) ? fmt(field).align : fallback);
    // One line inside a box from x to x + w. Justified lines spread their words
    // to both edges; a paragraph's last line stays ranged left.
    const placeLine = (s, x, w, y, spec, size, color, align, last) => {
      if (align === "center") put(s, x + w / 2, y, spec, size, color, "center");
      else if (align === "right") put(s, x + w, y, spec, size, color, "right");
      else if (align === "justify" && !last && / /.test(s) && !/…$/.test(s)) op({ k: "text", s, x, y, f: [spec.w, size, spec.f, spec.sp || 0, !!spec.it], c: color, align: "left", justify: w, field: fieldNow });
      else put(s, x, y, spec, size, color, "left");
    };
    const colour = (role) => (role === "accentText" ? accentText(P) : P[role]);
    const photos = Array.isArray(entry.photos) ? entry.photos : [];
    const hasPhoto = photos.length > 0;
    const at = photoAtOf(entry, L);
    const LABEL = { kicker: "small line", headline: "headline", intro: "intro", body: entry.type === "letter" ? "letter" : "story", title: "title", note: "words about the picture", detail: "detail line", quote: "quote", name: "name", role: "role", heading: "heading", signName: "signed name", signLine: "line under the name", sub1: "first subheading", text1: "first block of words", sub2: "second subheading", text2: "second block of words" };
    const numbered = (field) => {
      const m = /^(name|forWho|text|title)(\d)$/.exec(field);
      if (!m) return LABEL[field] || field;
      const what = { name: "name", forWho: "who it suits", text: entry.type === "ways" ? "words" : "words", title: "title" }[m[1]];
      return `${entry.type === "ways" ? "way" : "step"} ${m[2]} ${what}`;
    };
    const report = (field, r) => {
      plan.fields[field] = r;
      if (r.cut) plan.cuts.push({ field, label: numbered(field) });
    };
    // Draw a fitted block at baseline y0; an empty one leaves a guide (preview
    // only) and still holds its first line, so the layout doesn't jump.
    const block = (field, s, x, y0, w, maxLines, baseSpec, start0, min0, lead0, baseColor, baseAlign = "left") => {
      const spec = styled(field, baseSpec), color = tint(field, baseColor), align = alignOf(field, baseAlign);
      const sc = sizeScale(fmt(field));
      const start = start0 * sc, min = min0 * sc, lead = lead0 === "mul" ? "mul" : lead0 * sc;
      const r = fitBlock(page, s, w, maxLines, spec, start, min, !!spec.caps);
      const step = lead === "mul" ? r.size * spec.lead : lead;
      const rows = Math.max(1, r.lines.length);
      report(field, { kind: "block", empty: !r.total, ...r, box: { x, y: y0 - r.size * 0.86, w, h: (rows - 1) * step + r.size * 1.16 }, type: { spec, size: r.size, lead: step, color, align } });
      if (!r.total) { op({ k: "guide", x, y: y0 - start * 0.8, w, h: start, field }); return y0; }
      fieldNow = field;
      r.lines.forEach((l, i) => placeLine(l, x, w, y0 + i * step, spec, r.size, color, align, i === r.lines.length - 1));
      fieldNow = null;
      return y0 + (r.lines.length - 1) * step;
    };
    const body = (field, s, cols, baseSpec, dropRole) => {
      const f = fmt(field);
      // One spec per paragraph, worked out once and kept.
      const made = new Map();
      const specFor = (pi) => {
        if (!made.has(pi)) {
          const pf = paraFmt(f, pi);
          const sc = sizeScale(pf);
          const base = styledSpec(baseSpec, pf);
          const spec = sc === 1 ? base : { ...base, size: base.size * sc, lead: base.lead * sc };
          made.set(pi, { spec, lead: spec.lead, color: tintOf(pf.color, P, P.ink), align: ALIGNS.includes(pf.align) ? pf.align : "left", list: pf.list, columns: pf.columns });
        }
        return made.get(pi);
      };
      const one = specFor(0), spec = one.spec, align = one.align;
      // A drop cap belongs to text ranged left or justified, in the style's font.
      const perPara = hasParaFmt(f) || !!f.list || !!f.columns;
      const r = flowBody(page, s, cols, spec, dropRole && (align === "left" || align === "justify") && !paraFmt(f, 0).font && !f.list && !f.columns ? colour(dropRole) : null, perPara ? specFor : null);
      const bx = Math.min(...cols.map((c) => c.x)), by = Math.min(...cols.map((c) => c.top)) - spec.size * 0.86;
      report(field, { kind: "flow", empty: !r.total, ...r, lines: undefined, box: { x: bx, y: by, w: Math.max(...cols.map((c) => c.x + c.w)) - bx, h: Math.max(...cols.map((c) => c.bottom)) + spec.size * 0.3 - by }, type: { spec, size: spec.size, lead: spec.lead, color: one.color, align } });
      if (!r.total) { cols.forEach((c) => op({ k: "guide", x: c.x, y: c.top - spec.size, w: c.w, h: c.bottom - c.top + spec.size, field })); return; }
      fieldNow = field;
      if (r.drop) put(r.drop.s, r.drop.x, r.drop.y, { w: 300, f: F.serif }, r.drop.size, r.dropColor);
      (r.marks || []).forEach((m) => { const S = specFor(m.pi || 0); put(m.s, m.x, m.y, S.spec, S.spec.size, S.color, "left"); });
      r.lines.forEach((l, i) => {
        const S = specFor(l.pi || 0);
        placeLine(l.s, l.x, l.w, l.y, S.spec, S.spec.size, S.color, S.align, l.end || i === r.lines.length - 1);
      });
      fieldNow = null;
    };
    const rule = (x, y, color = P.accent) => rectOp(x, y - T.rule.h / 2, T.rule.w, T.rule.h, color);
    const ground = () => {
      if (st === "elegant") rectOp(0, 0, W, H, pageBgOf(book, entry, P, P.paper));
      else { rectOp(0, 0, W, H, pageBgOf(book, entry, P, P.white)); if (st === "modern") rectOp(0, 0, 6, H, P.accent); }
    };
    const photo = (box, mode, empty, i = 0) => op({ k: "photo", i, x: box[0], y: box[1], w: box[2], h: box[3], mode, frame: st === "elegant" ? P.rule : null, empty });
    const marker = (x, y, color = P.soft) => put(MARKER, x, y, { w: 500, f: F.plex, sp: 0.4 }, 3.2, color, "center");
    const kicker = (s, x, y, w) => block("kicker", s, x, y, w, 1, T.kicker, T.kicker.size, T.kicker.size, 0, colour(T.kicker.color));
    const has = (...keys) => keys.some((k) => oneParagraph(entry[k]).length);
    const beside = (box) => ({ left: box[0] + box[2] + 12, right: box[0] - 12 });   // text edges next to a side photo

    if (entry.type === "story" || entry.type === "article") {
      ground();
      let x = 20, w = L ? 257 : 170, K = L ? 30 : 34, maxHead = 2, maxIntro = 3, cols = null, bottom = L ? 184 : 270, headW = null;
      if (hasPhoto && entry.type === "story") {
        const box = boxFor("story", st, L, at);
        photo(box, "crop");
        if (at === "top" || at === "bottom") {
          K = at === "top" ? box[1] + box[3] + 14 : (L ? 30 : 34);
          if (!L) { bottom = at === "top" ? 270 : box[1] - 12; }
          else {
            // Landscape band: headline and intro in a left column, the story
            // in two columns beside them.
            headW = 80; maxHead = 3; maxIntro = 4;
            bottom = at === "top" ? 184 : box[1] - 12;
            const top = K + 12;
            cols = [{ x: 112, w: 78.5, top, bottom }, { x: 198.5, w: 78.5, top, bottom }];
          }
        } else {
          const e = beside(box);
          if (at === "left") { x = e.left; w = (L ? 277 : 190) - x; } else { x = 20; w = e.right - 20; }
          if (!L) { maxHead = 3; maxIntro = 4; }
        }
      }
      const hw = headW || w;
      // A narrow column lets the headline set smaller before it's cut: wide
      // capitals (Vogue) need it to hold a headline at its cap in three lines.
      const headMin = hw < 100 ? Math.min(T.storyHead.min, 5.5) : T.storyHead.min;
      kicker(entry.kicker, x, K, hw);
      const hLast = block("headline", entry.headline, x, K + 12, hw, maxHead, T.storyHead, T.storyHead.start, headMin, "mul", P.ink);
      let ruleY = hLast + 7;
      if (has("intro")) ruleY = block("intro", entry.intro, x, hLast + 10, hw, maxIntro, T.storyIntro, T.storyIntro.start, T.storyIntro.min, T.storyIntro.lead, colour(T.storyIntro.color)) + 6.5;
      else report("intro", { kind: "block", empty: true });
      rule(x, ruleY);
      if (!cols) {
        const top = ruleY + 9.5;
        cols = w >= 150 ? [{ x, w: (w - 8) / 2, top, bottom }, { x: x + (w - 8) / 2 + 8, w: (w - 8) / 2, top, bottom }] : [{ x, w, top, bottom }];
      }
      body("body", entry.body, cols, T.body, T.drop);
      if (!has("kicker", "headline", "intro", "body")) marker(cols[0].x + cols[0].w / 2, (cols[0].top + cols[0].bottom) / 2);
    }

    if (entry.type === "note") {
      ground();
      const box = boxFor("note", st, L, at);
      const fitMode = st !== "elegant" ? "crop" : at === "left" ? "fit-right" : at === "right" ? "fit-left" : "fit";
      photo(box, fitMode, "NO PHOTO CHOSEN");
      const TT = T.noteTitle;
      const detail = (x, lastY, w, maxLines) => {
        const d = fitBlock(page, entry.detail, w, maxLines, DETAIL_TYPE, 3.0, 2.6, false);
        block("detail", entry.detail, x, lastY - (Math.max(1, d.lines.length) - 1) * 4.6, w, maxLines, DETAIL_TYPE, 3.0, 2.6, 4.6, P.soft);
      };
      if (at === "top" || at === "bottom") {
        if (!L) {
          // Title beside the note, the detail line under both.
          const y = at === "top" ? 216 : 34;
          const tLast = block("title", entry.title, 20, y, 60, 3, TT, TT.start, TT.min, "mul", P.ink);
          rule(20, tLast + 7);
          body("note", entry.note, [{ x: 90, w: 100, top: y, bottom: y + 46 }], T.body, null);
          block("detail", entry.detail, 20, y + 54, 170, 1, DETAIL_TYPE, 3.0, 2.6, 4.6, P.soft);
          if (!has("title", "note", "detail")) marker(140, y + 24);
        } else {
          // Landscape band: title and detail in a left column, the note beside.
          const y = at === "top" ? box[1] + box[3] + 14 : 30;
          const last = at === "top" ? 184 : box[1] - 10;
          const tLast = block("title", entry.title, 20, y, 70, 3, TT, TT.start, TT.min, "mul", P.ink);
          rule(20, tLast + 7);
          body("note", entry.note, [{ x: 105, w: 120, top: y, bottom: last }], T.body, null);
          detail(20, last, 70, 2);
          if (!has("title", "note", "detail")) marker(165, (y + last) / 2);
        }
      } else {
        // A narrow column beside the photo: title, note, then the detail line.
        const e = beside(box);
        const x = at === "left" ? e.left : 20;
        const w = at === "left" ? (L ? 277 : 190) - x : e.right - 20;
        const y = 34;
        const tLast = block("title", entry.title, x, y, w, 3, TT, TT.start, TT.min, "mul", P.ink);
        rule(x, tLast + 7);
        const last = L ? 184 : 270;
        body("note", entry.note, [{ x, w, top: tLast + 16.5, bottom: last - (L ? 14 : 20) }], T.body, null);
        detail(x, last, w, L ? 2 : 3);
        if (!has("title", "note", "detail")) marker(x + w / 2, L ? 100 : 150);
      }
    }

    if (entry.type === "quote") {
      // Without a photo, Modern and Vogue turn the page over to the colour: a
      // pause between chapters. Elegant stays on paper.
      const solid = !hasPhoto && st !== "elegant";
      if (solid) rectOp(0, 0, W, H, P.accent); else ground();
      const on = solid ? P.onAccent : P.ink, soft = solid ? P.onAccent : P.soft;
      let zone;
      if (hasPhoto) {
        const box = boxFor("quote", st, L, at);
        photo(box, "crop");
        if (at === "top") zone = L ? { x: 20, w: 257, top: box[1] + box[3] + 10, bottom: 184, lines: 4 } : { x: 20, w: 170, top: 164, bottom: 266, lines: 5 };
        else if (at === "bottom") zone = L ? { x: 20, w: 257, top: 24, bottom: box[1] - 10, lines: 4 } : { x: 20, w: 170, top: 30, bottom: 132, lines: 5 };
        else {
          const e = beside(box);
          const x = at === "left" ? e.left : 20;
          const w = at === "left" ? (L ? 277 : 190) - x : e.right - 20;
          zone = L ? { x, w, top: 24, bottom: 180, lines: 6 } : { x, w, top: 30, bottom: 266, lines: 10 };
        }
        zone.start = 9; zone.min = 6;
      } else zone = L ? { x: 20, w: 257, top: 26, bottom: 180, lines: 5, start: 13, min: 7 } : { x: 20, w: 170, top: 30, bottom: 266, lines: 7, start: 13, min: 7 };
      const Q = styled("quote", T.quote);
      const qAlign = alignOf("quote", T.quoteAlign === "center" ? "center" : "left");
      const center = qAlign === "center";
      const said = String(entry.quote || "").replace(QUOTE_MARKS, "");
      const scaled = (field, spec) => { const sc = sizeScale(fmt(field)); const st2 = styled(field, spec); return sc === 1 ? st2 : { ...st2, size: st2.size * sc }; };
      const NAME = scaled("name", T.quoteName), ROLE = scaled("role", T.quoteRole);
      const qsc = sizeScale(fmt("quote"));
      zone.start *= qsc; zone.min *= qsc;
      const nameR = has("name") ? fitBlock(page, entry.name, zone.w, 1, NAME, NAME.size, NAME.size, !!NAME.caps) : null;
      const roleR = has("role") ? fitBlock(page, entry.role, zone.w, 1, ROLE, ROLE.size, ROLE.size, !!ROLE.caps) : null;
      const attrH = (nameR || roleR) ? 9 + (nameR ? 8 : 0) + (roleR ? (nameR ? 5.6 : 8) : 0) : 0;
      const heightAt = (r) => (st === "modern" ? 9 : r.size * 1.1) + 7 + (r.lines.length - 1) * r.size * Q.lead + r.size * 0.72 + attrH;
      // The quote shrinks until it fits its line limit AND the height of its
      // zone; at the smallest size it gives up lines, ending with "…".
      let r = null;
      for (let size = zone.start; ; size = Math.round((size - 0.25) * 100) / 100) {
        r = fitBlock(page, said, zone.w, zone.lines, Q, size, size, false);
        if ((!r.cut && heightAt(r) <= zone.bottom - zone.top + 0.01) || size <= zone.min + 1e-6) break;
      }
      for (let lines = r.lines.length; lines > 1 && heightAt(r) > zone.bottom - zone.top + 0.01; lines--) r = fitBlock(page, said, zone.w, lines - 1, Q, r.size, r.size, false);
      r = { ...r, shrunk: r.size < zone.start - 1e-6, nearMin: r.size < zone.start - 1e-6 && r.size - zone.min <= 1 + 1e-6 };
      report("quote", { kind: "block", empty: !r.total, ...r });
      const waiting = !r.total ? { blocked: "Prints once there's a quote" } : {};
      if (nameR) report("name", { kind: "block", empty: false, ...nameR, ...waiting }); else report("name", { kind: "block", empty: true });
      if (roleR) report("role", { kind: "block", empty: false, ...roleR, ...waiting }); else report("role", { kind: "block", empty: true });
      if (!r.total) {
        op({ k: "guide", x: zone.x, y: zone.top, w: zone.w, h: zone.bottom - zone.top });
        marker(zone.x + zone.w / 2, (zone.top + zone.bottom) / 2, soft);
      } else {
        const lead = r.size * Q.lead;
        const markH = st === "modern" ? 9 : r.size * 1.1;
        const top = zone.top + Math.max(0, (zone.bottom - zone.top - heightAt(r)) / 2);
        // The mark and the rule follow the quote's alignment.
        const markAt = (w) => (qAlign === "center" ? zone.x + (zone.w - w) / 2 : qAlign === "right" ? zone.x + zone.w - w : zone.x);
        if (st === "modern") {
          rectOp(markAt(12), top, 12, 9, solid ? P.onAccent : P.accent);
          put("“", markAt(12) + 6, top + 11.2, { w: 800, f: F.heavy }, 11, solid ? P.accent : P.onAccent, "center");
        } else {
          const ms = r.size * 2.2;
          font(page, 300, ms, F.serif);
          const m = page.ctx.measureText("“");
          const asc = m.actualBoundingBoxAscent / page.u(1), mw = m.width / page.u(1);
          put("“", qAlign === "center" ? zone.x + zone.w / 2 : qAlign === "right" ? zone.x + zone.w : zone.x - 0.5, top + asc, { w: 300, f: F.serif }, ms, solid ? P.onAccent : accentText(P), qAlign === "center" ? "center" : qAlign === "right" ? "right" : "left");
          void mw;
        }
        const b1 = top + markH + 7 + r.size * 0.72;
        const qColor = tint("quote", on);
        r.lines.forEach((l, i) => placeLine(l, zone.x, zone.w, b1 + i * lead, Q, r.size, qColor, qAlign, i === r.lines.length - 1));
        let y = b1 + (r.lines.length - 1) * lead;
        if (nameR || roleR) {
          y += 9;
          rule(markAt(T.rule.w), y, solid ? P.onAccent : P.accent);
          if (nameR) { y += 8; placeLine(nameR.lines[0], zone.x, zone.w, y, NAME, nameR.size, tint("name", on), alignOf("name", qAlign === "justify" ? "left" : qAlign), true); }
          if (roleR) { y += nameR ? 5.6 : 8; placeLine(roleR.lines[0], zone.x, zone.w, y, ROLE, roleR.size, tint("role", soft), alignOf("role", qAlign === "justify" ? "left" : qAlign), true); }
        }
      }
      if (solid) plan.foot = { ink: P.onAccent, soft: P.onAccent };
    }

    if (entry.type === "letter") {
      ground();
      const x = L ? 20 : (st === "modern" ? 20 : 40), w = L ? 257 : 130;
      const K = L ? 30 : 46;
      kicker(entry.kicker, x, K, w);
      const LH = T.letterHead;
      const hLast = block("heading", entry.heading, x, K + 14, w, 2, LH, LH.start, LH.min, "mul", P.ink);
      rule(x, hLast + 8);
      const top = hLast + 18.5;
      const cols = L ? [{ x: 20, w: 121.5, top, bottom: 184 }, { x: 155.5, w: 121.5, top, bottom: 164 }] : [{ x, w, top, bottom: 244 }];
      body("body", entry.body, cols, T.letterBody, T.drop);
      // The signature sits at a fixed place, whether the letter is short or long.
      const sx = L ? 155.5 : x, sw = L ? 121.5 : w, nameY = L ? 176 : 258;
      block("signName", entry.signName, sx, nameY, sw, 1, T.sign, T.sign.size, T.sign.size, 0, P.ink);
      block("signLine", entry.signLine, sx, nameY + 6.5, sw, 1, T.signLine, T.signLine.size, T.signLine.size, 0, P.soft);
      if (!has("kicker", "heading", "body", "signName", "signLine")) marker(L ? 20 + 121.5 / 2 : x + w / 2, L ? 110 : 150);
    }

    if (entry.type === "feature") {
      // The zig-zag feature: a photo beside words, then words beside a photo,
      // the way magazines alternate them down a page.
      ground();
      const FH = T.storyHead, SUB = T.featureSub;
      const first = at === "right" ? "right" : "left";
      kicker(entry.kicker, 20, L ? 24 : 30, L ? 257 : 170);
      const hLast = block("headline", entry.headline, 20, L ? 36 : 42, L ? 257 : 170, L ? 1 : 2, FH, FH.start, FH.min, "mul", P.ink);
      rule(20, hLast + 7);
      const rows = L ? [{ y: 50, h: 64 }, { y: 122, h: 64 }] : [{ y: 78, h: 90 }, { y: 180, h: 90 }];
      rows.forEach((row, i) => {
        const photoLeft = (i === 0) === (first === "left");
        let pbox, tx, tw;
        if (!L) {
          const pw = st === "elegant" ? 80 : 100;
          if (photoLeft) { pbox = st === "elegant" ? [20, row.y, 80, row.h] : [0, row.y, pw, row.h]; tx = 112; tw = 78; }
          else { pbox = st === "elegant" ? [110, row.y, 80, row.h] : [110, row.y, pw, row.h]; tx = 20; tw = 78; }
        } else {
          if (photoLeft) { pbox = st === "elegant" ? [20, row.y, 126, row.h] : [0, row.y, 146, row.h]; tx = 158; tw = 119; }
          else { pbox = st === "elegant" ? [151, row.y, 126, row.h] : [151, row.y, 146, row.h]; tx = 20; tw = 119; }
        }
        photo(pbox, "crop", "NO PHOTO CHOSEN", i);
        const n = i + 1;
        let top = row.y + 4;
        if (has(`sub${n}`)) top = block(`sub${n}`, entry[`sub${n}`], tx, row.y + SUB.start * 0.85, tw, 2, SUB, SUB.start, SUB.min, "mul", colour(SUB.color)) + 8;
        else report(`sub${n}`, { kind: "block", empty: true });
        body(`text${n}`, entry[`text${n}`], [{ x: tx, w: tw, top: top + 3.2, bottom: row.y + row.h - 2 }], T.body, null);
      });
      if (!has("kicker", "headline", "sub1", "text1", "sub2", "text2")) marker(W / 2, L ? 44 : 64);
    }

    /* ---------- how we work ------------------------------------------------
       Two pages the studio can show a client: the four ways of working side
       by side, and one way step by step. Both say who does what, in words as
       well as position, and both are the studio's own text: every word is in
       the boxes and can be edited. */
    const WHO_WORD = { you: "You", together: "Together", studio: "Studio" };
    const WHO_ORDER = ["you", "together", "studio"];
    // Three squares and a word: which one is filled says who does this step.
    const whoTag = (x, y, who, color) => {
      WHO_ORDER.forEach((k, i) => rectOp(x + i * 2.6, y - 1.9, 1.9, 1.9, k === who ? (st === "modern" ? accentText(P) : P.ink) : P.rule));
      const spec = T.smallLabel;
      put(WHO_WORD[who].toUpperCase(), x + 8.9, y, spec, spec.size, color || P.ink);
    };
    const tagWidth = (word) => { font(page, T.smallLabel.w, T.smallLabel.size, T.smallLabel.f, T.smallLabel.sp); return 8.9 + measure(page, word.toUpperCase()); };
    const hairOp = (x1, y, x2, color, h = 0.3) => rectOp(x1, y - h / 2, x2 - x1, h, color);
    // The header both pages share.
    const workHeader = () => {
      if (!L) {
        kicker(entry.kicker, 20, 34, 170);
        const hLast = block("heading", entry.heading, 20, 46, 170, 2, T.storyHead, T.storyHead.start, T.storyHead.min, "mul", P.ink);
        let ruleY = hLast + 7;
        if (has("intro")) ruleY = block("intro", entry.intro, 20, hLast + 10, 170, 3, T.storyIntro, T.storyIntro.start, T.storyIntro.min, T.storyIntro.lead, colour(T.storyIntro.color)) + 6.5;
        else report("intro", { kind: "block", empty: true });
        rule(20, ruleY);
        return ruleY;
      }
      kicker(entry.kicker, 20, 30, 140);
      const hLast = block("heading", entry.heading, 20, 42, 140, 2, T.storyHead, T.storyHead.start, T.storyHead.min, "mul", P.ink);
      const ruleY = hLast + 7;
      rule(20, ruleY);
      let introLast = 0;
      if (has("intro")) introLast = block("intro", entry.intro, 172, 42, 105, 4, T.storyIntro, T.storyIntro.start, T.storyIntro.min, T.storyIntro.lead, colour(T.storyIntro.color));
      else report("intro", { kind: "block", empty: true });
      return Math.max(ruleY, introLast + 1.6);
    };

    if (entry.type === "ways") {
      ground();
      const items = (Array.isArray(entry.items) ? entry.items : []).slice(0, 4);
      const hb = workHeader();
      const NS = T.wayName, FS = T.wayFor, SL = T.smallLabel;
      // Every name is set at one size, the smallest any of them needs, so the
      // four rows read as one table rather than four posters.
      let nameSize = NS.start;
      items.forEach((it) => { const r = fitBlock(page, it && it.name, L ? 58.25 : 48, 2, NS, NS.start, NS.min, !!NS.caps); nameSize = Math.min(nameSize, r.size); });
      const likedMark = (x, y) => put("HOW WE LIKE TO WORK", x, y, SL, SL.size, accentText(P));
      if (!L) {
        [["THE WAY", 20], ["HOW IT RUNS", 75], ["WHO LEADS THE IDEAS", 145]].forEach(([s, x]) => put(s, x, hb + 11, SL, SL.size, P.soft));
        const R0 = hb + 14.5;
        hairOp(20, R0, 190, P.ink);
        const rh = (275 - R0) / 4;
        items.forEach((it, i) => {
          const r0 = R0 + i * rh, floor = r0 + rh - 4.2;
          if (i) hairOp(20, r0, 190, P.rule);
          if (it && it.liked) { rectOp(20, r0, 170, T.rule.h, P.accent); likedMark(20, r0 + 7.2); }
          const nb = r0 + 15.5 + (st === "modern" ? 1 : 0);
          const nameLast = block(`name${i + 1}`, it && it.name, 20, nb, 48, 3, NS, nameSize, nameSize, "mul", P.ink);
          block(`forWho${i + 1}`, it && it.forWho, 20, nameLast + 6, 48, 3, FS, FS.size, FS.size, FS.lead, colour(FS.color));
          body(`text${i + 1}`, it && it.text, [{ x: 75, w: 62, top: nb, bottom: floor }], T.body, null);
          whoTag(145, nb - 2.4, (it && WHO_ORDER.includes(it.lead)) ? it.lead : "together");
        });
      } else {
        const cw = 58.25, gap = 8;
        const cx = (i) => 20 + i * (cw + gap);
        const T0 = hb + 11;
        const nbOf = T0 + 15.5 + (st === "modern" ? 1 : 0);
        let forBottom = nbOf;
        const nameLasts = [];
        items.forEach((it, i) => {
          hairOp(cx(i), T0, cx(i) + cw, P.ink);
          if (it && it.liked) { rectOp(cx(i), T0, cw, T.rule.h, P.accent); likedMark(cx(i), T0 + 7.2); }
          const nameLast = block(`name${i + 1}`, it && it.name, cx(i), nbOf, cw, 3, NS, nameSize, nameSize, "mul", P.ink);
          nameLasts.push(nameLast);
          const r = fitBlock(page, it && it.forWho, cw, 3, FS, FS.size, FS.size, false);
          forBottom = Math.max(forBottom, nameLast + 6 + (Math.max(1, r.lines.length) - 1) * FS.lead);
        });
        const SB = forBottom + 9.5;
        items.forEach((it, i) => {
          block(`forWho${i + 1}`, it && it.forWho, cx(i), nameLasts[i] + 6, cw, 3, FS, FS.size, FS.size, FS.lead, colour(FS.color));
          if (!i) put("WHO LEADS THE IDEAS", cx(0), SB, SL, SL.size, P.soft);
          whoTag(cx(i), SB + 8, (it && WHO_ORDER.includes(it.lead)) ? it.lead : "together");
          body(`text${i + 1}`, it && it.text, [{ x: cx(i), w: cw, top: SB + 20, bottom: 184 }], T.body, null);
        });
      }
      if (!items.some((it) => it && (oneParagraph(it.name).length || oneParagraph(it.text).length)) && !has("kicker", "heading", "intro")) marker(L ? 148 : 105, L ? 110 : 150);
    }

    if (entry.type === "process") {
      ground();
      const steps = (Array.isArray(entry.steps) ? entry.steps : []).slice(0, 6);
      const n = Math.max(1, steps.length);
      const hb = workHeader();
      const NOTE = T.workNote, TS = T.stepTitle, SL = T.smallLabel;
      // The closing line sits at the foot, with a hairline above it.
      let floor = L ? 184 : 270;
      if (has("note")) {
        const noteR = fitBlock(page, entry.note, L ? 257 : 170, 2, NOTE, NOTE.size, NOTE.size, false);
        const firstY = (L ? 184 : 270) - (noteR.lines.length - 1) * NOTE.lead;
        block("note", entry.note, 20, firstY, L ? 257 : 170, 2, NOTE, NOTE.size, NOTE.size, NOTE.lead, P.ink);
        const hairY = firstY - 0.75 * NOTE.size - 5;
        hairOp(20, hairY, L ? 277 : 190, P.rule);
        floor = hairY - 7;
      } else report("note", { kind: "block", empty: true });
      const numSize = (L ? { 3: 30, 4: 25, 5: 19, 6: 13 } : { 3: 22, 4: 18, 5: 14, 6: 11.5 })[n] || (L ? 19 : 14);
      const NUM = { w: T.storyHead.w, f: T.storyHead.f, sp: st === "modern" ? -0.2 : 0 };
      font(page, NUM.w, numSize, NUM.f, NUM.sp);
      const numW = Math.max(...steps.map((s2, i) => measure(page, String(i + 1).padStart(2, "0"))), measure(page, "00"));
      const numCap = page.ctx.measureText("00").actualBoundingBoxAscent / page.u(1);
      const titleScale = (L ? 1 : { 3: 1.3, 4: 1.15, 5: 1, 6: 1 }[n] || 1);
      const top0 = hb + 11;
      if (!L) {
        const wordsX = 20 + Math.max(numW, tagWidth("Together")) + 9, wordsW = 190 - wordsX;
        // One title size for every step, and the text that fits under it.
        let titleSize = TS.start * titleScale;
        steps.forEach((s2) => { const r = fitBlock(page, s2 && s2.title, wordsW, 2, TS, TS.start * titleScale, TS.min, !!TS.caps); titleSize = Math.min(titleSize, r.size); });
        const titleStep = titleSize * TS.lead;
        const measured = steps.map((s2) => {
          const tr = fitBlock(page, s2 && s2.title, wordsW, 2, TS, titleSize, titleSize, !!TS.caps);
          return { lines: Math.max(1, tr.lines.length) };
        });
        const titleCap = (() => { font(page, TS.w, titleSize, TS.f, TS.sp || 0, !!TS.it); return page.ctx.measureText("Hx").actualBoundingBoxAscent / page.u(1); })();
        const heightOf = (m, textLines) => Math.max(numCap + 8.2, titleCap + (m.lines - 1) * titleStep + 6.8 + (textLines - 1) * 5.8 + 1.3);
        let textLines = 3, gap = 0, total = 0;
        for (; textLines >= 1; textLines--) {
          total = measured.reduce((a, m) => a + heightOf(m, textLines), 0);
          gap = n > 1 ? (floor - top0 - total) / (n - 1) : 0;
          if (gap >= 7 || textLines === 1) break;
        }
        gap = Math.min(gap, ({ 3: 40, 4: 32, 5: 24, 6: 18 })[n] || 18);
        const used = total + gap * (n - 1);
        let y = top0 + Math.max(0, (floor - top0 - used) / 2);
        steps.forEach((s2, i) => {
          const h = heightOf(measured[i], textLines);
          const nBase = y + numCap;
          font(page, NUM.w, numSize, NUM.f, NUM.sp);
          put(String(i + 1).padStart(2, "0"), 20, nBase, NUM, numSize, accentText(P));
          whoTag(20, nBase + 7.2, (s2 && WHO_ORDER.includes(s2.who)) ? s2.who : "together");
          const tLast = block(`title${i + 1}`, s2 && s2.title, wordsX, y + titleCap, wordsW, 2, TS, titleSize, titleSize, titleStep, P.ink);
          body(`text${i + 1}`, s2 && s2.text, [{ x: wordsX, w: wordsW, top: tLast + 6.8, bottom: tLast + 6.8 + (textLines - 1) * 5.8 }], T.body, null);
          if (i < n - 1) rectOp(20 + numW / 2 - 0.15, nBase + 11.2, 0.3, Math.max(0, (y + h + gap - 3.5) - (nBase + 11.2)), P.rule);
          y += h + gap;
        });
      } else {
        const gapC = n <= 4 ? 9 : 7;
        const cw = (257 - (n - 1) * gapC) / n;
        const cx = (i) => 20 + i * (cw + gapC);
        const NB = top0 + numCap;
        const maxLines = cw >= 50 ? 2 : 3;
        let titleSize = TS.start;
        steps.forEach((s2) => { const r = fitBlock(page, s2 && s2.title, cw, maxLines, TS, TS.start, TS.min, !!TS.caps); titleSize = Math.min(titleSize, r.size); });
        const titleStep = titleSize * TS.lead;
        let lines = 1;
        steps.forEach((s2) => { const r = fitBlock(page, s2 && s2.title, cw, maxLines + 1, TS, titleSize, titleSize, !!TS.caps); lines = Math.max(lines, Math.min(maxLines + 1, r.lines.length)); });
        const textTop = NB + 18 + (lines - 1) * titleStep + 7;
        steps.forEach((s2, i) => {
          font(page, NUM.w, numSize, NUM.f, NUM.sp);
          put(String(i + 1).padStart(2, "0"), cx(i), NB, NUM, numSize, accentText(P));
          if (i < n - 1) hairOp(cx(i) + numW + 4, NB - numCap / 2, cx(i + 1) - 4, P.rule);
          whoTag(cx(i), NB + 9, (s2 && WHO_ORDER.includes(s2.who)) ? s2.who : "together");
          block(`title${i + 1}`, s2 && s2.title, cx(i), NB + 18, cw, maxLines + 1, TS, titleSize, titleSize, titleStep, P.ink);
          body(`text${i + 1}`, s2 && s2.text, [{ x: cx(i), w: cw, top: textTop, bottom: floor }], T.body, null);
        });
      }
      if (!steps.some((s2) => s2 && (oneParagraph(s2.title).length || oneParagraph(s2.text).length)) && !has("kicker", "heading", "intro", "note")) marker(L ? 148 : 105, L ? 110 : 150);
    }

    plan.ops = plan.ops.map((o) => placeOp(o, G));
    return plan;
  }


  /* ---------- a page where the studio decides -----------------------------------
     The "Anything page": words, photographs, colour blocks and lines, put where
     the studio wants them. Everything is stored as a fraction of the A4 design
     frame (0 to 1), so one page prints the same on A4, B5, A5 or Letter and in
     either shape, and it draws through the same plan-then-paint pipeline as
     every other page — so the preview, the little page in the rail and the PDF
     can never disagree. Nothing flows from one box to the next: a box holds
     what it holds, and says so when the words don't fit. */
  const FREE_KINDS = ["text", "photo", "shape", "line"];
  // What a colour block (or the colour behind a box of words) is shaped like.
  const SHAPES = ["rect", "round", "chamfer", "ellipse", "triangle", "diamond", "star", "parallelogram"];
  const CORNER = { small: 0.1, medium: 0.18, large: 0.3 };
  // How rounded the corners are, as a share of the shorter side: a box and a
  // cut-cornered box start at 0.18, any other shape at 0. The old words
  // small / medium / large still mean what they did.
  const cornerDefault = (shape) => (shape === "round" || shape === "chamfer" ? 0.18 : 0);
  const cornerOf = (b) => (typeof (b && b.corner) === "number" ? Math.max(0, Math.min(0.5, b.corner)) : CORNER[b && b.corner] || cornerDefault(shapeOf(b)));
  const shapeOf = (b) => (SHAPES.includes(b && b.shape) ? b.shape : "rect");
  // Traces the shape inside a box, in page units, ready to fill.
  // A polygon with every corner rounded by r (or sharp when r is 0): each
  // corner is cut back along both edges and bridged by a curve through it.
  function roundedPoly(ctx, v, r) {
    const n = v.length;
    if (!(r > 0)) { v.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); return; }
    const pts = v.map((V, i) => {
      const A = v[(i + n - 1) % n], B = v[(i + 1) % n];
      const la = Math.hypot(A[0] - V[0], A[1] - V[1]) || 1, lb = Math.hypot(B[0] - V[0], B[1] - V[1]) || 1;
      const ua = [(A[0] - V[0]) / la, (A[1] - V[1]) / la], ub = [(B[0] - V[0]) / lb, (B[1] - V[1]) / lb];
      const cosT = Math.max(-0.999, Math.min(0.999, ua[0] * ub[0] + ua[1] * ub[1])), theta = Math.acos(cosT);
      const d = Math.min(r / Math.tan(theta / 2), la / 2, lb / 2);
      return { p1: [V[0] + ua[0] * d, V[1] + ua[1] * d], p2: [V[0] + ub[0] * d, V[1] + ub[1] * d], V };
    });
    pts.forEach((c, i) => { if (i) ctx.lineTo(c.p1[0], c.p1[1]); else ctx.moveTo(c.p1[0], c.p1[1]); ctx.quadraticCurveTo(c.V[0], c.V[1], c.p2[0], c.p2[1]); });
    ctx.closePath();
  }
  function tracePath(ctx, shape, x, y, w, h, k = 0.18) {
    ctx.beginPath();
    const r = Math.min(w, h) * Math.max(0, Math.min(0.5, k));
    if (shape === "ellipse") { ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); return; }
    if (shape === "chamfer") { const c = r; ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath(); return; }
    let v;
    if (shape === "triangle") v = [[x + w / 2, y], [x + w, y + h], [x, y + h]];
    else if (shape === "diamond") v = [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
    else if (shape === "parallelogram") { const d = w * 0.2; v = [[x + d, y], [x + w, y], [x + w - d, y + h], [x, y + h]]; }
    else if (shape === "star") { const cx = x + w / 2, cy = y + h / 2; v = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, m = i % 2 ? 0.2 : 0.5; return [cx + Math.cos(a) * m * w, cy + Math.sin(a) * m * h]; }); }
    else v = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];   // a box, rounded or not
    roundedPoly(ctx, v, r);
  }
  // How far in from the box the words sit, so they stay inside the shape.
  const shapeInset = (shape, w, h, k = 0.18) => (shape === "ellipse" ? { x: w * 0.15, y: h * 0.15 } : shape === "diamond" ? { x: w * 0.25, y: h * 0.25 } : shape === "triangle" ? { x: w * 0.22, y: h * 0.38 } : shape === "star" ? { x: w * 0.28, y: h * 0.3 } : shape === "parallelogram" ? { x: w * 0.22, y: Math.min(4, h * 0.2) } : (shape === "round" || shape === "chamfer") ? { x: Math.max(Math.min(4, w * 0.08), Math.min(w, h) * k * 0.6), y: Math.max(Math.min(4, h * 0.2), Math.min(w, h) * k * 0.6) } : { x: Math.min(4, w * 0.08), y: Math.min(4, h * 0.2) });
  const FREE_ROLES = ["head", "intro", "body", "kicker", "quote"];
  const FREE_MAX = 12, FREE_PHOTO_MAX = 6, FREE_TEXT_MAX = 600;
  const THICKS = { hair: 0.3, narrow: 0.8, medium: 1.5, broad: 2.2, heavy: 4 };
  /* A line: across (a rule, as always), down, diagonal, curved or wavy with
     a bend, or drawn by hand as a run of points; an arrowhead at either end,
     both or none; drawn with a pencil, a pen, a soft brush, a square marker,
     a flat nib (thick across the stroke, thin along it) or a tapering cone. */
  const LINE_PATHS = ["h", "v", "d", "u", "curve", "wave", "free"];
  const LINE_TIPS = ["pencil", "brush", "marker", "nib", "taper", "sumi", "bristle"];
  const linePath = (b) => (LINE_PATHS.includes(b && b.path) ? b.path : "h");
  // An exact width in millimetres wins over the named ones.
  const lineThick = (b) => (b && typeof b.width === "number" && isFinite(b.width) ? Math.min(12, Math.max(0.2, b.width)) : THICKS[b && b.thick] || THICKS.narrow);
  const lineBend = (b) => Math.max(-1, Math.min(1, typeof b.bend === "number" ? b.bend : 0.5));
  const lineWaves = (b) => Math.max(1, Math.min(8, Math.round(typeof b.waves === "number" ? b.waves : 1)));
  const lineSoft = (b) => Math.max(0, Math.min(1, typeof b.soft === "number" ? b.soft : 1));
  // The line's own points, in millimetres, inside its box.
  function linePoints(b, box) {
    const path = linePath(b), { x, y, w, h } = box, cy = y + h / 2;
    const sample = (f, n = 32) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
    if (path === "v") return [[x + w / 2, y], [x + w / 2, y + h]];
    if (path === "d") return [[x, y], [x + w, y + h]];
    if (path === "u") return [[x, y + h], [x + w, y]];
    if (path === "curve") { const k = lineBend(b) * h, cx = x + w / 2; return sample((t) => [(1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * (x + w), (1 - t) * (1 - t) * cy + 2 * (1 - t) * t * (cy - k) + t * t * cy]); }
    if (path === "wave") {
      // As many waves as asked, rounded (a sine) or sharp (a zigzag) or in between.
      const k = lineBend(b) * h, n = lineWaves(b), soft = lineSoft(b);
      const tri = (u) => (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * u));
      return sample((t) => [x + t * w, cy - k * (soft * Math.sin(2 * Math.PI * n * t) + (1 - soft) * tri(n * t))], Math.max(40, n * 16));
    }
    if (path === "free") return (Array.isArray(b.pts) ? b.pts : []).filter((p) => Array.isArray(p) && p.length === 2).map(([px, py]) => [x + (+px || 0) * w, y + (+py || 0) * h]);
    return [[x, cy], [x + w, cy]];
  }
  // Draws a run of points with the chosen tip, then the arrowheads.
  function strokeOp(page, o) {
    const ctx = page.ctx, u = (v) => page.u(v), pts = o.pts;
    if (!pts || pts.length < 2) return;
    const tip = LINE_TIPS.includes(o.tip) ? o.tip : "pen";
    const w = u(o.w);
    const P = pts.map(([x, y]) => [u(x), u(y)]);
    const trace = () => {
      ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length - 1; i++) ctx.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
      const L = P[P.length - 1]; ctx.lineTo(L[0], L[1]);
    };
    const draw = (lw, alpha, cap = "round") => { ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = o.c; ctx.lineWidth = Math.max(0.5, lw); ctx.lineCap = cap; ctx.lineJoin = cap === "square" ? "miter" : "round"; trace(); ctx.stroke(); ctx.restore(); };
    // A ribbon: each segment as a quad between the offsets at its two ends.
    const ribbon = (offsetAt) => {
      ctx.save(); ctx.fillStyle = o.c; ctx.beginPath();
      for (let i = 0; i < P.length - 1; i++) {
        const [ax, ay] = offsetAt(i), [bx, by] = offsetAt(i + 1);
        ctx.moveTo(P[i][0] + ax, P[i][1] + ay); ctx.lineTo(P[i + 1][0] + bx, P[i + 1][1] + by); ctx.lineTo(P[i + 1][0] - bx, P[i + 1][1] - by); ctx.lineTo(P[i][0] - ax, P[i][1] - ay); ctx.closePath();
      }
      ctx.fill(); ctx.restore();
    };
    const dirAt = (i) => { const a = P[Math.max(0, i - 1)], b2 = P[Math.min(P.length - 1, i + 1)]; const dx = b2[0] - a[0], dy = b2[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
    if (tip === "brush") { draw(w * 2.2, 0.5); draw(w * 1.3, 0.85); }
    else if (tip === "pencil") draw(w * 0.75, 0.85, "butt");
    else if (tip === "marker") draw(w * 1.8, 0.55, "square");
    else if (tip === "nib") { const a = -Math.PI / 4, nx = Math.cos(a) * w * 1.4, ny = Math.sin(a) * w * 1.4; ribbon(() => [nx, ny]); }
    else if (tip === "taper") { ribbon((i) => { const [dx, dy] = dirAt(i); const half = w * (1.6 - 1.4 * (i / Math.max(1, P.length - 1))); return [-dy * half, dx * half]; }); ctx.save(); ctx.fillStyle = o.c; ctx.beginPath(); ctx.arc(P[0][0], P[0][1], w * 1.6, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    else if (tip === "sumi") {
      // A Japanese brush: pressed hard at the start, swelling, then lifting
      // to a dry flick; the edges fibrous, the ink thinner at the sides.
      const N = Math.max(1, P.length - 1);
      const prof = (t) => 0.35 + 1.75 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.6) * (1 - 0.55 * t);
      const perp = (i) => { const [dx, dy] = dirAt(i); return [-dy, dx]; };
      const wobble = (i, k) => 1 + 0.08 * Math.sin(i * 1.7 + k) * Math.cos(i * 0.9 + k * 2);
      ctx.save(); ctx.globalAlpha *= 0.42; ribbon((i) => { const [px, py] = perp(i); const half = w * prof(i / N) * 1.25 * wobble(i, 1); return [px * half, py * half]; }); ctx.restore();
      ctx.save(); ctx.globalAlpha *= 0.9; ribbon((i) => { const [px, py] = perp(i); const half = w * prof(i / N) * wobble(i, 2); return [px * half, py * half]; }); ctx.restore();
      // three dry bristle lines that split off toward the end of the stroke
      for (const k of [-0.7, 0.2, 0.75]) {
        ctx.save(); ctx.globalAlpha *= 0.5; ctx.strokeStyle = o.c; ctx.lineWidth = Math.max(0.5, w * 0.35); ctx.lineCap = "round"; ctx.beginPath();
        P.forEach(([x, y], i) => { const [px, py] = perp(i); const off = w * prof(i / N) * k * (0.6 + 0.6 * (i / N)); if (i) ctx.lineTo(x + px * off, y + py * off); else ctx.moveTo(x + px * off, y + py * off); });
        ctx.stroke(); ctx.restore();
      }
      ctx.save(); ctx.fillStyle = o.c; ctx.beginPath(); ctx.arc(P[0][0], P[0][1], w * prof(0.02), 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    else if (tip === "bristle") {
      // A dry, flat bristle brush: many hairs side by side, each its own thin line.
      const perp = (i) => { const [dx, dy] = dirAt(i); return [-dy, dx]; };
      const hairs = 9;
      for (let hIdx = 0; hIdx < hairs; hIdx++) {
        const off = (hIdx / (hairs - 1) - 0.5) * 2 * w * 1.5, jitter = ((hIdx * 7919) % 17) / 17 - 0.5;
        ctx.save(); ctx.globalAlpha *= 0.42 + 0.35 * Math.abs(Math.sin(hIdx * 1.3)); ctx.strokeStyle = o.c; ctx.lineWidth = Math.max(0.5, w * (0.28 + 0.18 * Math.abs(Math.cos(hIdx)))); ctx.lineCap = "round"; ctx.beginPath();
        P.forEach(([x, y], i) => { const [px, py] = perp(i); const o2 = off + jitter * w * 0.6 * Math.sin(i * 0.8 + hIdx); if (i) ctx.lineTo(x + px * o2, y + py * o2); else ctx.moveTo(x + px * o2, y + py * o2); });
        ctx.stroke(); ctx.restore();
      }
    }
    else draw(w, 1);
    const head = (from, to) => {
      const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
      const size = Math.max(3, o.w * 3.2), ux = dx / len, uy = dy / len;
      const bx = to[0] - ux * size, by = to[1] - uy * size, sx = -uy * size * 0.5, sy = ux * size * 0.5;
      ctx.save(); ctx.fillStyle = o.c; ctx.beginPath(); ctx.moveTo(u(to[0]), u(to[1])); ctx.lineTo(u(bx + sx), u(by + sy)); ctx.lineTo(u(bx - sx), u(by - sy)); ctx.closePath(); ctx.fill(); ctx.restore();
    };
    if (o.ends === "end" || o.ends === "both") head(pts[pts.length - 2], pts[pts.length - 1]);
    if (o.ends === "start" || o.ends === "both") head(pts[1], pts[0]);
  }
  const FILL_NAMES = ["ink", "soft", "accent", "paper", "white", "deep", "rule"];
  const blockColor = (v, P, fallback) => (FILL_NAMES.includes(v) ? P[v] : (/^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v).toLowerCase() : fallback));
  // What a box of words is: the style's own type, so an Anything page still
  // looks like the rest of the book.
  function roleType(T, role) {
    if (role === "head") return { spec: T.storyHead, start: T.storyHead.start, min: T.storyHead.min, leadMul: T.storyHead.lead, caps: !!T.storyHead.caps, color: "ink" };
    if (role === "intro") return { spec: T.storyIntro, start: T.storyIntro.start, min: T.storyIntro.min, lead: T.storyIntro.lead, color: T.storyIntro.color || "ink" };
    if (role === "kicker") return { spec: T.kicker, start: T.kicker.size, min: T.kicker.size * 0.8, lead: T.kicker.size * 1.8, caps: !!T.kicker.caps, color: T.kicker.color || "soft" };
    if (role === "quote") return { spec: { ...T.quote, sp: T.quote.sp || 0 }, start: 9, min: 4.6, leadMul: T.quote.lead || 1.25, color: "ink" };
    return { spec: T.body, start: T.body.size, min: T.body.size * 0.72, lead: T.body.lead, color: "ink" };
  }
  const freeBlocks = (entry) => (Array.isArray(entry && entry.blocks) ? entry.blocks : []).slice(0, FREE_MAX);
  // A block's box in design millimetres, on the A4 frame.
  // A line across keeps its box as thin as its stroke, as it always has; any
  // other line owns a real box.
  const lineH = (b, H) => (linePath(b) === "h" ? lineThick(b) / H : Math.max(0.01, +b.h || 0.15));
  const blockBox = (b, W, H) => ({ x: (+b.x || 0) * W, y: (+b.y || 0) * H, w: Math.max(0.5, (+b.w || 0) * W), h: b.k === "line" ? lineH(b, H) * H : Math.max(0.5, (+b.h || 0) * H) });

  function planFree(book, entry) {
    const G = geometry(book);
    const st = WTYPE[book.style] ? book.style : "modern";
    const T = WTYPE[st];
    const P = colourway(book.colourway);
    const page = measurer();
    const W = G.Wa, H = G.Ha;                      // blocks are fractions of this frame
    const plan = { ops: [], cuts: [], fields: {}, foot: {}, free: true };
    const op = (o) => plan.ops.push(o);
    const colour = (role) => (role === "accentText" ? accentText(P) : P[role]);
    op({ k: "rect", x: 0, y: 0, w: W, h: H, c: pageBgOf(book, entry, P, st === "elegant" ? P.paper : P.white) });
    freeBlocks(entry).forEach((b, i) => {
      if (!b || !FREE_KINDS.includes(b.k)) return;
      const box = blockBox(b, W, H);
      const turn = Math.abs(+b.r || 0) > 0.05 ? { deg: +b.r, cx: box.x + box.w / 2, cy: box.y + box.h / 2 } : null;
      const field = `b${i}`;
      if (b.k === "shape") { const sh = shapeOf(b); op({ k: sh === "rect" ? "rect" : "path", shape: sh, corner: cornerOf(b), x: box.x, y: box.y, w: box.w, h: box.h, c: blockColor(b.fill, P, P.accent), a: b.o, rot: turn }); return; }
      if (b.k === "line") {
        const c = blockColor(b.color, P, P.rule);
        if (linePath(b) === "h" && !b.ends && !b.tip) { op({ k: "rect", x: box.x, y: box.y, w: box.w, h: box.h, c, a: b.o, rot: turn }); return; }
        op({ k: "stroke", pts: linePoints(b, box), w: lineThick(b), c, a: b.o, tip: b.tip, ends: b.ends, rot: turn });
        return;
      }
      if (b.k === "photo") {
        op({
          k: "photo", shot: (b.p && b.p.id) ? b.p : null, x: box.x, y: box.y, w: box.w, h: box.h,
          mode: b.p && b.p.fit === "whole" ? "fit" : "crop", rot: turn, empty: "CHOOSE A PHOTO",
          shape: b.shape ? shapeOf(b) : (typeof b.corner === "number" && b.corner > 0 ? "rect" : null), corner: cornerOf(b),
          frame: b.edge ? blockColor(b.edge, P, P.rule) : (st === "elegant" ? P.rule : null), frameT: THICKS[b.edgeWidth] || 0.2
        });
        return;
      }
      // Words. The box holds them: the type shrinks to fit unless the studio
      // asked for it to be cut, and either way it says what won't print. With
      // a colour behind them, the words sit inset from the box's edge.
      const sh = shapeOf(b);
      if (b.fill) op({ k: sh === "rect" ? "rect" : "path", shape: sh, corner: cornerOf(b), x: box.x, y: box.y, w: box.w, h: box.h, c: blockColor(b.fill, P, P.accent), a: b.o, rot: turn });
      const ins = b.fill ? shapeInset(sh, box.w, box.h, cornerOf(b)) : { x: 0, y: 0 };
      const f = (b.style && typeof b.style === "object") ? b.style : {};
      const R = roleType(T, b.role);
      const base = styledSpec(R.spec, f);
      const sc = sizeScale(f);
      const align = ALIGNS.includes(f.align) ? f.align : "left";
      const color = tintOf(f.color, P, colour(R.color));
      const words = R.caps ? String(b.t || "").toUpperCase() : String(b.t || "");
      const start = R.start * sc, floor = b.fit === "cut" ? start : Math.max(1.6, (R.min || R.start) * sc);
      const leadAt = (size) => (R.leadMul ? size * R.leadMul : R.lead * (size / R.start));
      const perPara = hasParaFmt(f) || !!f.list || !!f.columns;
      let size = start, r = null, lead = leadAt(size);
      for (;;) {
        lead = leadAt(size);
        const spec = { ...base, size, lead };
        const specFor = (pi) => { const pf = paraFmt(f, pi); const st2 = styledSpec(R.spec, pf); const sc2 = sizeScale(pf) / sc; return { spec: { ...st2, size: size * sc2, lead: lead * sc2 }, lead: lead * sc2, color: tintOf(pf.color, P, colour(R.color)), align: ALIGNS.includes(pf.align) ? pf.align : align, list: pf.list, columns: pf.columns }; };
        r = flowBody(page, words, [{ x: box.x + ins.x, w: box.w - 2 * ins.x, top: box.y + ins.y + size * 0.84, bottom: box.y + box.h - ins.y - size * 0.2 }], spec, null, perPara ? specFor : null);
        r.specFor = perPara ? specFor : null;
        r.spec = spec;
        if (!r.cut || size <= floor + 1e-6) break;
        size = Math.max(floor, Math.round((size - 0.25) * 100) / 100);
      }
      plan.fields[field] = { kind: "flow", empty: !r.total, ...r, lines: undefined, box: { ...box }, type: { spec: r.spec, size: r.spec.size, lead: r.spec.lead, color, align } };
      if (r.cut) plan.cuts.push({ field, label: "words on this page" });
      if (!r.total) { op({ k: "guide", x: box.x, y: box.y, w: box.w, h: box.h, field }); return; }
      const styleAt = (pi) => (r.specFor ? r.specFor(pi) : { spec: r.spec, color, align });
      (r.marks || []).forEach((m) => { const S = styleAt(m.pi || 0); op({ k: "text", s: m.s, x: m.x, y: m.y, f: [S.spec.w, S.spec.size, S.spec.f, S.spec.sp || 0, !!S.spec.it], c: S.color, align: "left", rot: turn, field }); });
      r.lines.forEach((l, k) => {
        const last = l.end || k === r.lines.length - 1;
        const S = styleAt(l.pi || 0), spec = S.spec, c2 = S.color, al = S.align;
        const fnt = [spec.w, spec.size, spec.f, spec.sp || 0, !!spec.it];
        if (al === "center") op({ k: "text", s: l.s, x: l.x + l.w / 2, y: l.y, f: fnt, c: c2, align: "center", rot: turn, field });
        else if (al === "right") op({ k: "text", s: l.s, x: l.x + l.w, y: l.y, f: fnt, c: c2, align: "right", rot: turn, field });
        else if (al === "justify" && !last && / /.test(l.s) && !/…$/.test(l.s)) op({ k: "text", s: l.s, x: l.x, y: l.y, f: fnt, c: c2, align: "left", justify: l.w, rot: turn, field });
        else op({ k: "text", s: l.s, x: l.x, y: l.y, f: fnt, c: c2, align: "left", rot: turn, field });
      });
    });
    plan.ops = plan.ops.map((o) => placeOp(o, G));
    return plan;
  }
  // A page number on an Anything page, without the style's band or rule, so
  // nothing the studio placed is covered.
  function freeFoot(page, P, W, H, n) {
    if (!showNums()) return;
    font(page, 700, 2.4, F.mono, 0.4);
    const right = n % 2 === 1;
    text(page, String(n).padStart(2, "0"), right ? W - 14 : 14, H - 7, P.ink, right ? "right" : "left");
  }

  async function paintPlan(page, plan, entry, imgOf, P, guides, skip = null) {
    const shots = entry.photos || [];
    const imgs = await Promise.all(shots.map((s) => imgOf(s)));
    // A block on an Anything page carries its own photograph rather than an
    // index into the page's list.
    const own = plan.ops.filter((o) => o.k === "photo" && o.shot);
    const ownImgs = new Map(await Promise.all(own.map(async (o) => [o, await imgOf(o.shot)])));
    // Anything a block sets: turned about its own centre, and faded.
    const around = (o, draw) => {
      const ctx = page.ctx, fade = typeof o.a === "number" && o.a > 0 && o.a < 1;
      if (!o.rot && !fade) return draw();
      ctx.save();
      if (fade) ctx.globalAlpha = o.a;
      if (o.rot) {
        ctx.translate(page.u(o.rot.cx), page.u(o.rot.cy));
        ctx.rotate(o.rot.deg * Math.PI / 180);
        ctx.translate(-page.u(o.rot.cx), -page.u(o.rot.cy));
      }
      const out = draw();
      ctx.restore();
      return out;
    };
    for (const o of plan.ops) {
      // The words being typed on the page are drawn by the box the studio is
      // typing in, not by the page underneath it.
      if (skip && o.field === skip && (o.k === "text" || o.k === "guide")) continue;
      if (o.k === "rect") around(o, () => rect(page, o.x, o.y, o.w, o.h, o.c));
      else if (o.k === "path") around(o, () => { const ctx = page.ctx; tracePath(ctx, o.shape, page.u(o.x), page.u(o.y), page.u(o.w), page.u(o.h), o.corner); ctx.fillStyle = o.c; ctx.fill(); });
      else if (o.k === "stroke") around(o, () => strokeOp(page, o));
      else if (o.k === "text") around(o, () => {
        font(page, ...o.f);
        if (o.justify) {
          // Spread the words to both edges, measured at this page's resolution.
          const words = o.s.split(" ");
          const widths = words.map((w) => measure(page, w));
          const gap = (o.justify - widths.reduce((a, b) => a + b, 0)) / Math.max(1, words.length - 1);
          let xx = o.x;
          words.forEach((w, k) => { text(page, w, xx, o.y, o.c, "left"); xx += widths[k] + gap; });
        } else text(page, o.s, o.x, o.y, o.c, o.align);
      });
      else if (o.k === "photo") {
        const shot = o.shot !== undefined ? o.shot : shots[o.i || 0];
        const img = o.shot !== undefined ? ownImgs.get(o) : imgs[o.i || 0];
        if (!shot) {
          if (o.empty) around(o, () => { rect(page, o.x, o.y, o.w, o.h, P.rule); font(page, 500, 3.2, F.plex, 0.4); text(page, o.empty, o.x + o.w / 2, o.y + o.h / 2, P.soft, "center"); });
          continue;
        }
        if (!img) { around(o, () => missing(page, P, o.x, o.y, o.w, o.h)); continue; }
        around(o, () => {
          const shaped = o.shape && o.shape !== "rect" || (o.shape === "rect" && o.corner > 0);
          if (shaped) { page.ctx.save(); tracePath(page.ctx, o.shape, page.u(o.x), page.u(o.y), page.u(o.w), page.u(o.h), o.corner); page.ctx.clip(); }
          const r = o.mode === "crop" ? drawPhoto(page, img, shot, o.x, o.y, o.w, o.h) : fitPhoto(page, img, shot, o.x, o.y, o.w, o.h, o.mode === "fit-right" ? "right" : o.mode === "fit-left" ? "left" : "center");
          if (shaped) page.ctx.restore();
          else if (o.frame) frame(page, r.x, r.y, r.w, r.h, o.frame, o.frameT || 0.2);
        });
      } else if (o.k === "guide" && guides) {
        // Where words will go, in the editor's preview only; never exported.
        const ctx = page.ctx;
        ctx.save();
        ctx.setLineDash([page.u(1.4), page.u(1.1)]);
        ctx.strokeStyle = P.soft; ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(1, page.u(0.25));
        ctx.strokeRect(page.u(o.x), page.u(o.y), page.u(o.w), page.u(o.h));
        ctx.restore();
      }
    }
  }

  // The caption width a photos page draws at, in design mm.
  const captionWidth = (book) => {
    const G = geometry(book);
    const st = WTYPE[book.style] ? book.style : "modern";
    return st === "elegant" ? G.W - 52 : st === "modern" ? G.W - 28 : G.W - 24;
  };
  const captionStyle = (book) => CAPTION_TYPE[WTYPE[book.style] ? book.style : "modern"];

  // Plans every writing page (and every captioned photos page) of a book, for
  // warnings: page number → cuts. Needs the fonts loaded.
  function bookCuts(book) {
    const out = [];
    let n = 1;
    for (const pg of book.pages) {
      const first = n + 1; n += pageSpan(pg);
      if (n > MAX_PAGES) break;
      let cuts = [];
      if (WRITING[pg.type]) cuts = planWriting(book, pg).cuts;
      if (pg.type === "free") cuts = planFree(book, pg).cuts;
      if ((pg.type === "photos" || pg.type === "article") && pg.caption) {
        const r = captionFit(pg, captionWidth(book), captionStyle(book));
        if (r && r.cut) cuts = [...cuts, { field: "caption", label: "caption" }];
      }
      out.push({ entry: pg, n: first, cuts });
    }
    return out;
  }

  /* ---------- rendering a book ----------------------------------------------
     Yields one finished page at a time, so the caller can encode and release
     each canvas before the next is drawn. */
  async function* renderPages(book, { dpi, watermarked = false, cache, only = null, guides = false, skip = null, originals = null }) {
    const mark = watermarked ? markSettings(book) : null;
    await ensureFonts();
    await ensureBookFonts(book);
    bookNow = book;
    skipNow = skip;
    const P = colourway(book.colourway);
    // Pages are drawn in the paper's design space (A4 or A4 grown to Letter's
    // shape) at a resolution that makes the canvas exactly the printed size
    // at `dpi`, and each page carries its printed size in points for the PDF.
    const G = geometry(book);
    const W = G.W, H = G.H, size = { w: W, h: H };
    const pt = { w: G.pw * 72 / 25.4, h: G.ph * 72 / 25.4 };
    const newPage = () => { const pg = API.newPdfPage(dpi * G.s, size); pg.pt = pt; pg.scale = G.s; return pg; };
    const S = STYLE_IMPL[book.style] || MODERN;
    const lib = library();
    const full = dpi >= 100;
    const imgOf = async (shot) => {
      const hit = shot && lib.byId.get(shot.id);
      if (!hit) return null;
      // The studio's own full-size file, when one was matched (print files only).
      if (full && originals) { const own = await originals.get(shot.id); if (own) return own; }
      const src = full ? API.photoSrc(hit.photo) : previewSrc(hit.photo);
      try { return await API.loadImage(src, cache); } catch (e) { return null; }
    };
    const writingFoot = (page, n, plan) => {
      if (book.style === "elegant") ELEGANT.foot(page, P, W, H, n);
      else if (book.style === "vogue") VOGUE.foot(page, P, W, H, n, "");
      else MODERN.foot(page, P, W, H, n, "", plan.foot.ink, plan.foot.soft);
    };
    let n = 0;
    const want = (i) => only === null || (Array.isArray(only) ? only.includes(i) : only === i);
    // Cover
    entryNow = null;
    if (want(-1)) {
      const page = newPage();
      await S.cover(page, book, P, W, H, book.cover ? await imgOf(book.cover) : null);
      if (mark) watermark(page, W, H, P, mark);
      yield { page, index: -1, n: 1 };
    }
    n = 1;
    for (let i = 0; i < book.pages.length; i++) {
      const entry = book.pages[i];
      entryNow = entry;
      // The builder never lets a book past 20 pages, but a book edited by hand
      // in data.js could arrive longer: stop rather than export past the limit.
      if (n + pageSpan(entry) > MAX_PAGES) break;
      const shoots = (entry.photos || []).map((s) => (lib.byId.get(s.id) || {}).shoot).filter(Boolean);
      if (entry.type === "spread") {
        n += 2;
        if (!want(i)) continue;
        const img = entry.photos[0] ? await imgOf(entry.photos[0]) : null;
        const B = entry.border ? bandsFor(entry, false) : null;
        // One photograph across two pages: drawn once on a double-width sheet,
        // then cut down the middle, so the halves meet exactly. A chosen border
        // runs round the outside of the pair, never down the fold.
        for (const half of [0, 1]) {
          const page = newPage();
          rect(page, 0, 0, W, H, pageBgOf(book, entry, P, P.white));
          const pn = n - 1 + half;
          if (img) {
            page.ctx.save();
            page.ctx.beginPath(); page.ctx.rect(0, 0, page.u(W), page.u(H)); page.ctx.clip();
            if (B) drawPhoto(page, img, entry.photos[0], -half * W + B.left, B.top, W * 2 - B.left - B.right, H - B.top - B.bottom);
            else drawPhoto(page, img, entry.photos[0], -half * W, 0, W * 2, H);
            page.ctx.restore();
          } else missing(page, P, 0, 0, W, H);
          if (B) paintBands(page, P, W, H, { ...B, left: half ? 0 : B.left, right: half ? B.right : 0 }, bandColors(book.style, P), pn, half ? pageCredit(entry, shoots) : "", null, half ? "right" : "left");
          else if (book.style === "vogue") VOGUE.foot(page, P, W, H, pn, half ? pageCredit(entry, shoots) : "", half ? "right" : "left");
          else { rect(page, 0, H - 9, W, 9, P.deep); font(page, 700, 2.4, F.mono, 0.4); if (showNums()) text(page, String(pn).padStart(2, "0"), half ? W - 14 : 14, H - 3.4, P.onDeep, half ? "right" : "left"); }
          if (mark) watermark(page, W, H, P, mark);
          yield { page, index: i, n: pn, half };
        }
        continue;
      }
      if (entry.type === "article") {
        // A story over two facing pages: the words on one, the photograph
        // whole on the other, drawn as that style's full-page photo.
        n += 2;
        if (!want(i)) continue;
        const photoFirst = photoAtOf(entry, G.L) === "left";
        const imgs = await Promise.all((entry.photos || []).slice(0, 1).map(imgOf));
        for (const half of [0, 1]) {
          const page = newPage();
          const pn = n - 1 + half;
          if ((half === 0) === photoFirst) {
            const asPhotos = { type: "photos", photos: (entry.photos || []).slice(0, 1), caption: entry.caption, border: entry.border, borderWidth: entry.borderWidth, style: entry.style && entry.style.caption ? { caption: entry.style.caption } : undefined };
            if (!asPhotos.photos.length) {
              S.ground(page, P, W, H);
              font(page, 500, 3.2, F.plex, 0.4); text(page, "NO PHOTO CHOSEN", W / 2, H / 2, P.soft, "center");
            } else await S.photos(page, asPhotos, P, W, H, imgs, shoots, pn);
          } else {
            const plan = planWriting(book, entry);
            await paintPlan(page, plan, { ...entry, photos: [] }, imgOf, P, guides, skip);
            writingFoot(page, pn, plan);
            page.cuts = [...(page.cuts || []), ...plan.cuts];
            page.plan = plan;
          }
          if (mark) watermark(page, W, H, P, mark);
          yield { page, index: i, n: pn, half };
        }
        continue;
      }
      n += 1;
      if (!want(i)) continue;
      const page = newPage();
      if (entry.type === "photos") {
        const imgs = await Promise.all((entry.photos || []).map(imgOf));
        if (!(entry.photos || []).length) {
          S.ground(page, P, W, H);
          font(page, 500, 3.2, F.plex, 0.4); text(page, "NO PHOTOS ON THIS PAGE YET", W / 2, H / 2, P.soft, "center");
        } else await S.photos(page, entry, P, W, H, imgs, shoots, n);
      } else if (entry.type === "free") {
        const plan = planFree(book, entry);
        await paintPlan(page, plan, entry, imgOf, P, guides, skip);
        freeFoot(page, P, W, H, n);
        page.cuts = plan.cuts;
        page.plan = plan;
      } else if (WRITING[entry.type]) {
        const plan = planWriting(book, entry);
        await paintPlan(page, plan, entry, imgOf, P, guides, skip);
        writingFoot(page, n, plan);
        page.cuts = plan.cuts;
        page.plan = plan;
      } else {
        await textPage(page, entry, book, P, W, H, n);
      }
      if (mark) watermark(page, W, H, P, mark);
      yield { page, index: i, n };
    }
  }

  /* ---------- storage --------------------------------------------------------- */
  const uid = () => `bk${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  function newBook(name) {
    return {
      id: uid(), name: name || "New book", style: "modern", colourway: "terracotta", orientation: "portrait",
      title: "Selected Work", subtitle: "Fashion, portraits & editorial", cover: null,
      pages: [{ type: "photos", photos: [] }],
      texts: { about: "", phone: "", showPrices: false },
      updatedAt: Date.now()
    };
  }
  function readState() { return window.getStudioPortfolios ? window.getStudioPortfolios() : { versions: [], deleted: [] }; }
  function writeState(state) { return window.saveStudioPortfolios ? window.saveStudioPortfolios(state) : false; }

  /* ---------- the builder UI ---------------------------------------------------
     A workspace, not a long form: the pages down the left, the page itself in
     the middle, and on the right only what the selected page needs ("This
     page") or the look of the whole book ("Design"). Download and Publish
     sit in the bar at the top. On a phone the same parts stack: the page,
     the strip of pages, then one panel at a time. */
  const CSS = `
  .sb-root { --sb-line: var(--line, rgba(20,20,22,.14)); --sb-card: var(--paper, #faf8f5); --sb-sunk: var(--bone, #eceae7); --sb-warn: #8A5A00; color: var(--ink, #141416); font: 400 14px/1.45 Inter, system-ui, sans-serif; }
  html.theme-dark .sb-root { --sb-warn: #E3B34A; }
  .sb-root *, .sb-root *::before, .sb-root *::after { box-sizing: border-box; }
  .sb-root h3 { margin: 0; font: 700 11px/1.3 'JetBrains Mono', monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-soft, #5c5e66); }
  /* the site sets every h3's size with !important */
  .sb-root h3 { font-size: 11px !important; line-height: 1.3 !important; }
  .sb-root input[type=text], .sb-root input[type=tel], .sb-root textarea, .sb-root select { width: 100%; font: 500 14px/1.4 Inter, system-ui, sans-serif; padding: 9px 11px; border: 1px solid var(--sb-line); border-radius: 8px; background: var(--paper, #faf8f5); color: var(--ink, #141416); min-width: 0; }
  .sb-root textarea { resize: vertical; line-height: 1.5; }
  .sb-root input:focus-visible, .sb-root textarea:focus-visible, .sb-root select:focus-visible { outline: 2px solid var(--accent, #d24e1a); outline-offset: 1px; }
  @media (pointer: coarse) { .sb-root input[type=text], .sb-root input[type=tel], .sb-root textarea, .sb-root select { font-size: 16px; } }
  .sb-btn { font: 600 13.5px Inter, system-ui, sans-serif; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--ink, #141416); background: transparent; color: var(--ink, #141416); cursor: pointer; white-space: nowrap; }
  .sb-btn:hover { background: var(--sb-sunk); }
  .sb-btn.dark { background: var(--ink, #141416); color: var(--paper, #faf8f5); }
  .sb-btn.dark:hover { background: var(--accent, #d24e1a); border-color: var(--accent, #d24e1a); }
  .sb-btn.quiet { border-color: transparent; }
  .sb-btn:disabled { opacity: .45; cursor: not-allowed; }
  .sb-link { background: none; border: 0; padding: 2px; font: 600 12.5px Inter, sans-serif; color: var(--accent, #d24e1a); text-decoration: underline; cursor: pointer; }
  .sb-root button:focus-visible { outline: 2px solid var(--accent, #d24e1a); outline-offset: 2px; }
  .sb-hint { margin: 0; font: 400 12.5px/1.5 Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-warn { margin: 0; font: 600 12.5px/1.5 Inter, sans-serif; color: var(--accent, #d24e1a); }
  .sb-vh { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  /* books */
  .sb-homehead { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 14px 24px; margin-bottom: 22px; }
  .sb-eyebrow { margin: 0; font: 700 11px 'JetBrains Mono', monospace; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-soft, #5c5e66); }
  .sb-h1 { margin: 6px 0 6px; font: 800 clamp(28px, 4vw, 40px)/1.05 Archivo, Inter, sans-serif; letter-spacing: -.02em; }
  .sb-lede { margin: 0; max-width: 62ch; color: var(--ink-soft, #5c5e66); }
  .sb-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 16px; }
  .sb-card { display: grid; grid-template-rows: auto 1fr; border: 1px solid var(--sb-line); border-radius: 12px; overflow: hidden; background: var(--sb-card); }
  .sb-cardcover { display: grid; place-items: center; height: 190px; padding: 14px; border: 0; background: var(--sb-sunk); cursor: pointer; }
  .sb-cardcover canvas { max-width: 100%; max-height: 162px; box-shadow: 0 8px 20px -10px rgba(0,0,0,.45); }
  .sb-cardbody { display: grid; gap: 3px; padding: 12px 14px 14px; align-content: start; }
  .sb-cardbody h4 { margin: 0; font: 700 15px Inter, sans-serif; overflow-wrap: anywhere; }
  .sb-meta { font: 400 12.5px Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-cardacts { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 10px; }
  .sb-cardacts .sb-btn { padding: 7px 12px; }
  .sb-cardacts .sb-btn.quiet { padding: 6px 7px; font-size: 12.5px; }
  .sb-empty { padding: 28px; border: 1px dashed var(--sb-line); border-radius: 12px; text-align: center; }
  .sb-foot { margin-top: 16px; }

  /* the editor */
  .sb-top { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 8px 10px; border: 1px solid var(--sb-line); border-radius: 12px; background: var(--sb-card); }
  .sb-root .sb-name { flex: 1 1 180px; width: auto; font: 700 16px Inter, sans-serif; border-color: var(--sb-line); background: var(--paper, #faf8f5); }
  .sb-root .sb-name:hover, .sb-root .sb-name:focus { border-color: var(--sb-line); background: var(--paper, #faf8f5); }
  .sb-status { font: 600 11.5px 'JetBrains Mono', monospace; letter-spacing: .03em; color: var(--ink-soft, #5c5e66); }
  .sb-topacts { display: flex; gap: 8px; margin-left: auto; }
  .sb-undos { display: inline-flex; gap: 4px; }
  .sb-ico { display: inline-flex; align-items: center; gap: 5px; padding: 6px 9px; }
  .sb-ico svg { width: 16px; height: 16px; }
  .sb-ico:disabled { opacity: .35; }
  /* The check light: green when every page is ready, amber with a count when not. */
  .sb-light { display: inline-flex; align-items: center; gap: 7px; padding: 6px 10px; border: 1px solid var(--sb-line); border-radius: 100px; background: transparent; color: inherit; font: 600 11.5px 'JetBrains Mono', monospace; letter-spacing: .03em; cursor: pointer; }
  .sb-light i { width: 9px; height: 9px; border-radius: 50%; background: #b7b3ad; }
  .sb-light.ok i { background: #2f9e5a; } .sb-light.warn i { background: #E0A100; } .sb-light.warn { color: var(--sb-warn); }
  @media (max-width: 900px) { .sb-ico span { display: none; } .sb-light span { font-size: 10.5px; } }
  .sb-pop { position: absolute; right: 8px; top: calc(100% + 6px); z-index: 30; width: min(400px, calc(100vw - 32px)); max-height: min(70vh, 620px); overflow: auto; display: grid; gap: 12px; padding: 16px; background: var(--paper, #faf8f5); border: 1px solid var(--sb-line); border-radius: 12px; box-shadow: 0 22px 50px -20px rgba(0,0,0,.45); }
  .sb-pop[hidden] { display: none; }
  .sb-check { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .sb-check li { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font: 500 12.5px/1.45 Inter, sans-serif; }
  .sb-dlrow { display: flex; flex-wrap: wrap; gap: 8px; }
  .sb-ready { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .sb-ready p { flex-basis: 100%; margin: 0; }
  .sb-ok { margin: 0; font: 500 12.5px/1.45 Inter, sans-serif; color: var(--ink, #141416); }
  #sbOrigStatus { display: grid; gap: 4px; } #sbOrigStatus p { margin: 0; }
  .sb-ready a { font: 600 12.5px Inter, sans-serif; padding: 7px 11px; border-radius: 999px; background: var(--ink, #141416); color: var(--paper, #faf8f5); text-decoration: none; }

  .sb-work { display: grid; grid-template-columns: 148px minmax(0, 1fr) 392px; gap: 12px; margin-top: 12px; height: calc(100vh - 220px); min-height: 440px; }
  .sb-rail, .sb-stage, .sb-insp { min-height: 0; border: 1px solid var(--sb-line); border-radius: 12px; background: var(--sb-card); }
  .sb-rail { display: flex; flex-direction: column; overflow: hidden; }
  .sb-railhead { display: flex; justify-content: space-between; align-items: baseline; padding: 10px 12px 4px; }
  .sb-count { font: 600 11px 'JetBrains Mono', monospace; color: var(--ink-soft, #5c5e66); }
  .sb-pages { list-style: none; margin: 0; padding: 6px 8px 10px; overflow-y: auto; flex: 1; display: grid; gap: 6px; align-content: start; }
  .sb-pages li { display: grid; gap: 4px; }
  .sb-pg { display: grid; gap: 5px; width: 100%; padding: 6px; border: 1px solid transparent; border-radius: 9px; background: none; color: inherit; cursor: pointer; text-align: left; }
  .sb-pg:hover { background: var(--sb-sunk); }
  .sb-pg[aria-current=true] { border-color: var(--accent, #d24e1a); background: var(--sb-sunk); }
  .sb-pgimg { display: flex; justify-content: center; align-items: center; min-height: 92px; }
  .sb-pgimg canvas { display: block; height: 88px; width: auto; max-width: 100%; background: #fff; box-shadow: 0 3px 8px -3px rgba(0,0,0,.35); }
  .sb-pgimg canvas + canvas { max-width: 50%; }
  .sb-pglabel { display: flex; align-items: baseline; gap: 5px; min-width: 0; font: 500 11.5px/1.3 Inter, sans-serif; }
  .sb-pglabel b { flex: none; font: 700 10.5px 'JetBrains Mono', monospace; color: var(--ink-soft, #5c5e66); }
  .sb-pglabel span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sb-chip { flex: none; font: 700 9.5px/1.4 'JetBrains Mono', monospace; font-style: normal; color: #fff; background: var(--accent, #d24e1a); border-radius: 4px; padding: 0 4px; }
  .sb-chip[hidden] { display: none; }
  .sb-pgacts { display: flex; justify-content: center; gap: 4px; }
  .sb-pages.reordering { cursor: grabbing; } .sb-pages.reordering .sb-pg { cursor: grabbing; }
  .sb-pages li.dragging { opacity: .45; }
  .sb-pages li.drop-before { box-shadow: 0 -3px 0 0 var(--accent, #d24e1a); } .sb-pages li.drop-after { box-shadow: 0 3px 0 0 var(--accent, #d24e1a); }
  @media (max-width: 900px) { .sb-pages li.drop-before { box-shadow: -3px 0 0 0 var(--accent, #d24e1a); } .sb-pages li.drop-after { box-shadow: 3px 0 0 0 var(--accent, #d24e1a); } }
  .sb-pg { touch-action: pan-x pan-y; }
  .sb-pgacts button { width: 32px; height: 28px; border: 1px solid var(--sb-line); border-radius: 7px; background: var(--paper, #faf8f5); color: var(--ink, #141416); cursor: pointer; }
  .sb-pgacts button:disabled { opacity: .35; cursor: not-allowed; }
  .sb-addwrap { padding: 8px; border-top: 1px solid var(--sb-line); }
  .sb-addbtn { width: 100%; padding: 9px 8px; border: 1px dashed var(--ink-soft, #5c5e66); border-radius: 9px; background: none; color: var(--ink, #141416); font: 600 12.5px Inter, sans-serif; cursor: pointer; }
  .sb-addbtn:hover { background: var(--sb-sunk); }

  .sb-stage { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; overflow: hidden; }
  .sb-stagebar { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--sb-line); flex-wrap: wrap; }
  .sb-views { display: inline-flex; align-items: center; gap: 6px; margin-left: 2px; }
  .sb-views .sb-btn { padding: 5px 9px; font-size: 12px; }
  .sb-views .sb-btn[aria-pressed=true] { background: var(--ink, #141416); color: var(--paper, #fff); border-color: var(--ink, #141416); }
  .sb-preview.zoom { overflow: auto; align-items: flex-start; justify-content: flex-start; }
  .sb-preview.zoom canvas { max-width: none; max-height: none; height: 165%; width: auto; }
  .sb-preview.two canvas + canvas { margin-left: 0; box-shadow: 8px 16px 36px -18px rgba(0,0,0,.5); }
  .sb-preview.two canvas:first-child { box-shadow: -8px 16px 36px -18px rgba(0,0,0,.5); }
  .sb-preview canvas.facing { cursor: pointer; opacity: .96; }
  /* Reading it through: the pages large on a dark ground, nothing else. */
  .sb-read { position: fixed; inset: 0; z-index: 300; display: grid; grid-template-rows: auto minmax(0, 1fr); background: #141416; color: #fff; }
  .sb-readbar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; font: 600 12px/1.3 'JetBrains Mono', monospace; letter-spacing: .06em; }
  .sb-readbar .sb-btn { border-color: rgba(255,255,255,.35); color: #fff; }
  .sb-readbar strong { flex: 1; text-align: center; font-weight: 600; }
  .sb-readpages { display: flex; align-items: center; justify-content: center; gap: 0; padding: 12px 24px 28px; min-height: 0; }
  .sb-readpages canvas { max-height: 100%; max-width: 50%; width: auto; height: auto; box-shadow: 0 30px 60px -30px rgba(0,0,0,.8); }
  .sb-readpages canvas:only-child { max-width: 100%; }
  .sb-readnav { position: absolute; top: 50%; width: 48px; height: 48px; margin-top: -24px; border: 0; border-radius: 50%; background: rgba(255,255,255,.12); color: #fff; font-size: 22px; cursor: pointer; }
  .sb-readnav:disabled { opacity: .25; cursor: default; } .sb-readnav.prev { left: 12px; } .sb-readnav.next { right: 12px; }
  @media (max-width: 900px) { .sb-views .sb-btn { padding: 5px 7px; font-size: 11.5px; } .sb-readpages { padding: 8px 8px 20px; } .sb-readnav { width: 40px; height: 40px; margin-top: -20px; } }
  .sb-stagebar strong { flex: 1; text-align: center; font: 600 13px Inter, sans-serif; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sb-nav { width: 34px; height: 30px; border: 1px solid var(--sb-line); border-radius: 8px; background: var(--paper, #faf8f5); color: var(--ink, #141416); cursor: pointer; }
  .sb-nav:disabled { opacity: .35; cursor: not-allowed; }
  .sb-preview { position: relative; display: flex; align-items: center; justify-content: center; padding: 20px; min-height: 0; background: var(--sb-sunk); overflow: hidden; }
  /* The Anything page: a layer of handles sitting exactly on the drawn page. */
  .sb-layer { position: absolute; }
  .sb-layer.drawing { cursor: crosshair; touch-action: none; } .sb-layer.drawing .sb-blk { pointer-events: none; }
  .sb-trail { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
  .sb-blk { position: absolute; margin: 0; padding: 0; border: 1px solid transparent; border-radius: 0; background: none; cursor: move; touch-action: none; }
  .sb-blk:hover { border-color: rgba(210, 78, 26, .55); }
  .sb-blk:focus-visible { outline: 2px solid var(--accent, #d24e1a); outline-offset: 1px; }
  .sb-blk.on { border-color: var(--accent, #d24e1a); border-style: solid; }
  .sb-blk.line { display: flex; align-items: center; }
  .sb-blk.oval { border-radius: 50%; }
  .sb-h { position: absolute; width: 11px; height: 11px; margin: -6px 0 0 -6px; border: 1px solid var(--accent, #d24e1a); border-radius: 2px; background: var(--paper, #fff); cursor: nwse-resize; }
  .sb-h[data-h="ne"], .sb-h[data-h="sw"] { cursor: nesw-resize; }
  .sb-h[data-h="n"], .sb-h[data-h="s"] { cursor: ns-resize; }
  .sb-h[data-h="e"], .sb-h[data-h="w"] { cursor: ew-resize; }
  @media (pointer: coarse) { .sb-h { width: 18px; height: 18px; margin: -9px 0 0 -9px; } }
  .sb-guide { position: absolute; background: #FF3D7F; pointer-events: none; }
  /* The style's margins and the page's middle, faint, in the editor only. */
  .sb-mg { position: absolute; pointer-events: none; border: 0 dashed rgba(210, 78, 26, .45); }
  .sb-mg.v { top: 0; height: 100%; width: 0; border-left-width: 1px; } .sb-mg.h { left: 0; width: 100%; height: 0; border-top-width: 1px; }
  .sb-mg.mid { border-color: rgba(20, 20, 22, .22); }
  .sb-measure { position: absolute; z-index: 4; padding: 4px 7px; border-radius: 6px; background: var(--ink, #141416); color: var(--paper, #fff); font: 600 10.5px/1.3 'JetBrains Mono', monospace; letter-spacing: .02em; white-space: nowrap; pointer-events: none; }
  .sb-measure b { color: #FF9EBB; font-weight: 700; }
  /* The bar on the chosen thing: which is in front, a copy, and remove. */
  .sb-blkbar { position: absolute; z-index: 3; display: flex; gap: 2px; padding: 3px; border: 1px solid var(--sb-line); border-radius: 8px; background: var(--sb-card); box-shadow: 0 10px 28px -12px rgba(0,0,0,.4); white-space: nowrap; }
  .sb-blkbar button { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 7px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: inherit; font: 600 11.5px/1 Inter, system-ui, sans-serif; cursor: pointer; }
  .sb-blkbar button:hover { border-color: var(--sb-line); } .sb-blkbar button:disabled { opacity: .35; cursor: default; }
  .sb-blkbar button i { font-style: normal; font-size: 13px; }
  .sb-blkbar .sb-sep { width: 1px; margin: 4px 2px; background: var(--sb-line); }
  @media (max-width: 900px) { .sb-blkbar button span { display: none; } .sb-blkbar button { padding: 0 8px; min-width: 34px; justify-content: center; } }
  /* Touching the page: an invisible button on every text and photograph. */
  .sb-hits { position: absolute; }
  .sb-hit { position: absolute; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; cursor: text; }
  .sb-hit:hover, .sb-hit:focus-visible { outline: 1px dashed rgba(210, 78, 26, .7); outline-offset: 1px; }
  .sb-hit.photo { cursor: grab; touch-action: none; }
  .sb-hit.photo.on { outline: 2px solid var(--accent, #d24e1a); outline-offset: -2px; cursor: grabbing; }
  .sb-hit.photo.on::after { content: ""; position: absolute; inset: 6px; border: 1px dashed rgba(255,255,255,.7); mix-blend-mode: difference; pointer-events: none; }
  .sb-inline { position: absolute; margin: 0; padding: 0; border: 0; border-radius: 0; resize: none; overflow: hidden; background: transparent; outline: 2px solid var(--accent, #d24e1a); outline-offset: 2px; white-space: pre-wrap; overflow-wrap: break-word; box-shadow: none; }
  .sb-inline:focus-visible { outline: 2px solid var(--accent, #d24e1a); outline-offset: 2px; }
  .sb-inline.caps { text-transform: uppercase; }
  .sb-bar { position: absolute; z-index: 3; display: flex; align-items: center; gap: 3px; padding: 4px; border: 1px solid var(--sb-line); border-radius: 9px; background: var(--sb-card); box-shadow: 0 10px 28px -12px rgba(0,0,0,.4); white-space: nowrap; }
  .sb-bar select { width: auto; max-width: 128px; padding: 4px 6px; font-size: 12px; border-radius: 6px; }
  .sb-bar button { min-width: 28px; height: 28px; padding: 0 6px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: inherit; font: 600 12px/1 Inter, system-ui, sans-serif; cursor: pointer; }
  .sb-bar button:hover { border-color: var(--sb-line); }
  .sb-bar button[aria-pressed=true] { background: var(--ink, #141416); color: var(--paper, #fff); }
  .sb-bar b { font-weight: 800; } .sb-bar i { font-style: italic; font-family: Georgia, serif; }
  .sb-bar .sb-barsize { display: inline-flex; align-items: center; gap: 1px; }
  .sb-bar output { min-width: 34px; text-align: center; font: 600 11px/1 'JetBrains Mono', monospace; }
  .sb-pagehint { padding: 4px 12px 8px; font: 500 11.5px/1.4 Inter, system-ui, sans-serif; color: var(--ink-soft, #5c5e66); text-align: center; }
  .sb-pagehint:empty { display: none; }
  @media (max-width: 900px) { .sb-bar { gap: 2px; } .sb-bar select { max-width: 96px; } }
  .sb-blklist { list-style: none; margin: 0 0 10px; padding: 0; display: grid; gap: 4px; }
  .sb-blkrow { display: flex; align-items: center; gap: 4px; }
  .sb-blkrow > button:first-child { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sb-blkrow button { min-height: 32px; padding: 4px 8px; border: 1px solid var(--sb-line); border-radius: 7px; background: var(--paper, #fff); color: inherit; font: 500 12px/1.3 Inter, system-ui, sans-serif; cursor: pointer; }
  .sb-blkrow button[aria-pressed=true] { background: var(--ink, #141416); color: var(--paper, #fff); border-color: var(--ink, #141416); }
  .sb-adds { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .sb-adds button { flex: 1 1 calc(50% - 6px); min-height: 38px; border: 1px solid var(--sb-line); border-radius: 8px; background: var(--paper, #fff); color: inherit; font: 600 13px/1.3 Inter, system-ui, sans-serif; cursor: pointer; }
  .sb-adds button:hover { border-color: var(--accent, #d24e1a); }
  .sb-step { display: flex; align-items: center; gap: 6px; margin: 6px 0; font: 500 12px/1.3 Inter, system-ui, sans-serif; }
  .sb-step span:first-child { flex: 1; color: var(--ink-soft, #5c5e66); }
  .sb-step button { min-width: 34px; min-height: 32px; border: 1px solid var(--sb-line); border-radius: 7px; background: var(--paper, #fff); color: inherit; font: 600 14px/1 Inter, system-ui, sans-serif; cursor: pointer; }
  .sb-step output { min-width: 52px; text-align: center; font-variant-numeric: tabular-nums; }
  .sb-preview canvas { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; background: #fff; box-shadow: 0 16px 36px -18px rgba(0,0,0,.5); }
  .sb-preview canvas + canvas { max-width: 50%; }
  .sb-preview.two canvas { max-width: 50%; }
  .sb-addmenu { position: absolute; inset: 8px; z-index: 10; overflow: auto; display: grid; gap: 16px; align-content: start; padding: 16px; background: var(--paper, #faf8f5); border: 1px solid var(--sb-line); border-radius: 10px; box-shadow: 0 18px 40px -20px rgba(0,0,0,.45); }
  .sb-addmenu[hidden] { display: none; }
  .sb-addhead { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .sb-addhead strong { font: 700 15px Inter, sans-serif; }
  .sb-addgroup { display: grid; gap: 8px; }
  .sb-additems { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  .sb-additem { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--sb-line); border-radius: 10px; background: var(--sb-card); color: inherit; text-align: left; cursor: pointer; }
  .sb-additem:hover { border-color: var(--ink, #141416); }
  .sb-additem b { font: 700 13.5px Inter, sans-serif; }
  .sb-additem span { font: 400 12px/1.4 Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-additem:disabled { opacity: .45; cursor: not-allowed; }

  .sb-insp { display: flex; flex-direction: column; overflow: hidden; }
  .sb-tabs { display: flex; gap: 4px; padding: 6px; border-bottom: 1px solid var(--sb-line); }
  .sb-tabs button { flex: 1; padding: 8px; border: 0; border-radius: 8px; background: none; color: var(--ink-soft, #5c5e66); font: 600 13px Inter, sans-serif; cursor: pointer; }
  .sb-tabs button[aria-selected=true] { background: var(--ink, #141416); color: var(--paper, #faf8f5); }
  .sb-panel { flex: 1; min-height: 0; overflow-y: auto; display: grid; gap: 18px; align-content: start; padding: 14px; }
  .sb-panel[hidden] { display: none; }
  .sb-sec { display: grid; gap: 10px; }
  .sb-sec[hidden] { display: none; }
  .sb-field { display: grid; gap: 5px; }
  .sb-field > label, .sb-field > .sb-label { font: 600 12.5px Inter, sans-serif; }
  .sb-meter { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font: 500 11px/1.4 'JetBrains Mono', monospace; color: var(--ink-soft, #5c5e66); }
  .sb-meter .warn { color: var(--sb-warn); }
  .sb-meter .bad { color: var(--accent, #d24e1a); font-weight: 700; }
  .sb-meter .sb-counter { flex: none; }
  .sb-note { margin: 0; font: 500 12px/1.45 Inter, sans-serif; color: var(--sb-warn); }
  .sb-note[hidden], .sb-link[hidden] { display: none; }
  .sb-check-row { display: flex; align-items: center; gap: 8px; font: 500 13px Inter, sans-serif; }
  .sb-check-row input { width: 18px; height: 18px; accent-color: var(--accent, #d24e1a); }
  .sb-ideas summary { cursor: pointer; font: 600 12.5px Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-ideas ul { margin: 6px 0 0; padding-left: 18px; font: 400 12.5px/1.6 Inter, sans-serif; color: var(--ink-soft, #5c5e66); }

  .sb-labelrow { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .sb-labelrow > label { font: 600 12.5px Inter, sans-serif; }
  .sb-fmt { display: contents; }
  .sb-fmttoggle { font-size: 12px; }
  .sb-fmtrow { flex-basis: 100%; display: grid; gap: 8px; padding: 10px; margin: 2px 0 4px; border-radius: 10px; background: var(--sb-sunk); }
  .sb-fmtrow[hidden] { display: none; }
  .sb-fmtline { display: grid; grid-template-columns: 52px 1fr; align-items: center; gap: 8px; font: 500 12px Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-swatches { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .sb-swatch { width: 30px; height: 30px; padding: 3px; border: 1px solid var(--sb-line); border-radius: 50%; background: var(--paper, #faf8f5); cursor: pointer; }
  .sb-swatch i { display: block; width: 100%; height: 100%; border-radius: 50%; border: 1px solid rgba(0,0,0,.15); }
  .sb-swatch[aria-pressed=true] { border-color: var(--ink, #141416); box-shadow: inset 0 0 0 1px var(--ink, #141416); }
  .sb-custom { display: inline-flex; align-items: center; gap: 4px; font: 600 11.5px 'JetBrains Mono', monospace; color: var(--ink, #141416); }
  /* Any colour: a square for how strong and how bright, a strip for the hue,
     and the colour written out. */
  .sb-hexlabel { font: 600 11.5px 'JetBrains Mono', monospace; color: var(--ink, #141416); }
  .sb-ptrow { display: flex; align-items: center; gap: 6px; font: 500 11px Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-ptrow input[type=number] { width: 74px; padding: 6px 8px; border: 1px solid var(--sb-line); border-radius: 8px; background: var(--paper, #faf8f5); color: var(--ink, #141416); font: 600 13px 'JetBrains Mono', monospace; }
  .sb-cphost { grid-column: 1 / -1; } .sb-cphost[hidden] { display: none; }
  .sb-cpick { display: grid; gap: 8px; margin-top: 6px; padding: 8px; border: 1px solid var(--sb-line); border-radius: 10px; background: var(--paper, #faf8f5); }
  .sb-cpsat { position: relative; height: 118px; border-radius: 8px; border: 1px solid rgba(0,0,0,.15); cursor: crosshair; touch-action: none; }
  .sb-cpsat:focus-visible { outline: 2px solid var(--accent, #d24e1a); outline-offset: 2px; }
  .sb-cpdot { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,.55); pointer-events: none; }
  .sb-cphue { width: 100%; height: 14px; margin: 2px 0; -webkit-appearance: none; appearance: none; border-radius: 7px; border: 1px solid rgba(0,0,0,.12); background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); }
  .sb-cphue::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 1px solid rgba(0,0,0,.4); box-shadow: 0 1px 3px rgba(0,0,0,.3); }
  .sb-cphue::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 1px solid rgba(0,0,0,.4); }
  .sb-cprow { display: flex; align-items: center; gap: 8px; font: 500 12px Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-cpprev { width: 30px; height: 30px; border-radius: 50%; border: 1px solid rgba(0,0,0,.15); flex: none; }
  .sb-cprow .sb-cphex { width: 104px; padding: 6px 8px; font: 600 12px 'JetBrains Mono', monospace; }
  .sb-swatch.sb-any[aria-expanded=true] { box-shadow: 0 0 0 2px var(--accent, #d24e1a); }
  .sb-barpick { position: absolute; z-index: 4; width: 272px; padding: 8px; border: 1px solid var(--sb-line); border-radius: 9px; background: var(--sb-card); box-shadow: 0 10px 28px -12px rgba(0,0,0,.4); }
  .sb-barpick .sb-swatches { margin-bottom: 4px; }
  .sb-bardot { display: inline-block; width: 14px; height: 14px; border-radius: 50%; border: 1px solid rgba(0,0,0,.3); vertical-align: middle; }
  .sb-custom input { width: 30px; height: 30px; padding: 0; border: 1px solid var(--sb-line); border-radius: 50%; background: none; cursor: pointer; }
  .sb-seg-sm button { padding: 6px 8px; font-size: 12px; }
  .sb-rowbox { padding: 10px; border: 1px solid var(--sb-line); border-radius: 10px; }
  .sb-rowacts { display: flex; gap: 4px; }
  .sb-rowacts .sb-btn { padding: 5px 8px; font-size: 12px; }
  .sb-sizerow { display: flex; align-items: center; gap: 8px; }
  .sb-sizerow input { flex: 1; accent-color: var(--accent, #d24e1a); }
  .sb-sizerow output { min-width: 40px; font: 600 11.5px 'JetBrains Mono', monospace; color: var(--ink, #141416); }
  .sb-italic { font-size: 12px; margin-left: 4px; }
  .sb-seg[hidden] { display: none; }
  .sb-seg { display: flex; gap: 4px; flex-wrap: wrap; }
  .sb-seg button { flex: 1 1 auto; padding: 7px 9px; border: 1px solid var(--sb-line); border-radius: 8px; background: var(--paper, #faf8f5); color: var(--ink, #141416); font: 600 12.5px Inter, sans-serif; cursor: pointer; }
  .sb-seg button[aria-checked=true] { background: var(--ink, #141416); border-color: var(--ink, #141416); color: var(--paper, #faf8f5); }
  .sb-styles { display: grid; gap: 8px; }
  .sb-style { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--sb-line); border-radius: 10px; background: var(--paper, #faf8f5); color: inherit; text-align: left; cursor: pointer; }
  .sb-style b { font: 700 14px Inter, sans-serif; }
  .sb-style span { font: 400 12px Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-style[aria-checked=true] { border-color: var(--ink, #141416); box-shadow: inset 0 0 0 1px var(--ink, #141416); }
  .sb-cws { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 6px; }
  .sb-cw { display: grid; justify-items: center; gap: 5px; padding: 8px 2px 6px; border: 1px solid transparent; border-radius: 10px; background: none; color: inherit; font: 600 11px/1.2 Inter, sans-serif; text-align: center; cursor: pointer; }
  .sb-cw:hover { background: var(--sb-sunk); }
  .sb-cw[aria-checked=true] { border-color: var(--ink, #141416); background: var(--paper, #faf8f5); }
  .sb-dot { width: 32px; height: 32px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); }

  .sb-chosen { display: flex; flex-wrap: wrap; gap: 6px; }
  .sb-ch { position: relative; width: 58px; aspect-ratio: 3 / 4; padding: 0; border: 2px solid transparent; border-radius: 7px; overflow: hidden; background: var(--sb-sunk); cursor: pointer; }
  .sb-ch img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .sb-ch.diagram img { object-fit: contain; background: #fff; }
  .sb-ch[aria-pressed=true] { border-color: var(--accent, #d24e1a); }
  .sb-ch i { position: absolute; top: 3px; left: 3px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 9px; background: var(--ink, #141416); color: var(--paper, #faf8f5); font: 700 10px/17px Inter, sans-serif; font-style: normal; text-align: center; }
  .sb-adjust { display: grid; gap: 10px; padding: 12px; border-radius: 10px; background: var(--sb-sunk); }
  .sb-adjrow { display: flex; justify-content: space-between; align-items: center; gap: 8px; font: 600 12.5px Inter, sans-serif; }
  .sb-adjrow span:last-child { display: flex; gap: 4px; }
  .sb-adjrow button { padding: 5px 9px; border: 1px solid var(--sb-line); border-radius: 7px; background: var(--paper, #faf8f5); color: var(--ink, #141416); font: 600 12px Inter, sans-serif; cursor: pointer; }
  .sb-adjrow button:disabled { opacity: .35; cursor: not-allowed; }
  .sb-range { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 8px; font: 500 12px Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-range input { width: 100%; accent-color: var(--accent, #d24e1a); }
  .sb-pick > summary { cursor: pointer; font: 600 13px Inter, sans-serif; padding: 4px 0; }
  .sb-pick[open] > summary { margin-bottom: 8px; }
  .sb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 6px; max-height: 380px; overflow-y: auto; padding: 2px; margin-top: 8px; }
  .sb-thumb { position: relative; aspect-ratio: 3 / 4; padding: 0; border: 0; border-radius: 6px; overflow: hidden; background: var(--sb-sunk); cursor: pointer; }
  .sb-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .sb-thumb.diagram img { object-fit: contain; background: #fff; }
  .sb-thumb.diagram::before { content: "Diagram"; position: absolute; left: 3px; bottom: 3px; padding: 0 4px; border-radius: 4px; background: rgba(0,0,0,.7); color: #fff; font: 600 9.5px/15px Inter, sans-serif; }
  .sb-thumb[aria-pressed=true] { box-shadow: inset 0 0 0 3px var(--accent, #d24e1a); }
  .sb-thumb[aria-pressed=true]::after { content: attr(data-order); position: absolute; top: 4px; right: 4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: var(--accent, #d24e1a); color: #fff; font: 700 11px/20px Inter, sans-serif; text-align: center; }
  .sb-thumb:disabled { opacity: .35; cursor: not-allowed; }

  @media (max-width: 1200px) { .sb-work { grid-template-columns: 124px minmax(0, 1fr) 340px; } .sb-pgimg canvas { height: 72px; } .sb-pgimg { min-height: 76px; } }
  @media (max-width: 900px) {
    .sb-work { display: flex; flex-direction: column; height: auto; min-height: 0; }
    .sb-stage { order: 1; position: sticky; top: 0; z-index: 8; } .sb-rail { order: 2; flex-direction: row; } .sb-insp { order: 3; overflow: visible; }
    .sb-preview { height: min(46vh, 440px); padding: 12px; }
    /* Editing a book on a phone: the site's header, its reminder bar and the
       marketing footer get out of the way; the page stays pinned at the top. */
    html.sb-editing .site-header, html.sb-editing .site-footer, html.sb-editing .admin-sticky-reminder, html.sb-editing #adminStickyReminderBar { display: none !important; }
    html.sb-editing .sb-root { padding-top: 0; }
    html.sb-editing body { padding-top: 0 !important; }
    .sb-railhead { display: none; }
    .sb-pages { display: flex; overflow-x: auto; overflow-y: hidden; padding: 8px; gap: 6px; }
    .sb-pages li { flex: none; width: 86px; }
    .sb-pages li.sel { width: 136px; }
    .sb-pgimg canvas { height: 76px; }
    .sb-addwrap { border-top: 0; border-left: 1px solid var(--sb-line); display: flex; align-items: center; }
    .sb-addbtn { width: 72px; height: 100%; }
    .sb-panel { overflow: visible; }
    .sb-root .sb-name { flex: 1 1 120px; }
    .sb-status { flex: 1 1 auto; min-width: 0; font-size: 10.5px; }
    .sb-topacts { margin-left: auto; }
    .sb-grid { max-height: 340px; }
    .sb-additems { grid-template-columns: 1fr; }
  }
  @media (pointer: coarse) { .sb-pgacts button, .sb-nav, .sb-seg button, .sb-adjrow button { min-height: 40px; } .sb-pgacts button { width: 40px; } }
  `;
  function injectCss() {
    const old = document.getElementById("sb-css");
    if (old && old.textContent === CSS) return;
    if (old) old.remove();
    const st = document.createElement("style");
    st.id = "sb-css"; st.textContent = CSS;
    document.head.appendChild(st);
  }

  const PAGE_LABEL = { photos: "Photos", spread: "Two-page spread", divider: "Chapter page", about: "About", services: "What I shoot", contact: "Contact", story: "Story", note: "About a photo", quote: "Quote", letter: "Letter", feature: "Zig-zag", article: "Story + full-page photo", ways: "Ways we work", process: "How a shoot runs", free: "Anything page" };
  const ADD_MENU = [
    { group: "Photographs", items: [
      ["photos", "Photos", "One to six photos, laid out by their shapes."],
      ["spread", "Two-page spread", "One photo across two facing pages."]] },
    { group: "Words", items: [
      ["story", "Story", "A photo with a headline, an intro and a story about a shoot or a brief."],
      ["note", "About a photo", "One photo shown large, with a title and a few lines about it."],
      ["quote", "Quote", "Someone's real words set large, with or without a photo."],
      ["letter", "Letter", "A signed page of your own writing: a foreword, or a note to a brand."],
      ["feature", "Zig-zag", "A photo beside words, then words beside a photo, the way magazines alternate them."],
      ["article", "Story + full-page photo", "Two facing pages: your words on one, a photo filling the other."]] },
    { group: "How we work", items: [
      ["ways", "Ways we work", "All four ways of working on one page, with who leads the ideas."],
      ["process", "How a shoot runs", "One way, step by step, marking who does what: you, together, or the studio."]] },
    { group: "Put it where you want", items: [
      ["free", "Anything page", "An empty page. Put words, photographs, colour blocks and lines wherever you like."],
      ["free:opener", "Opener", "A photograph across the top, a headline under it, two columns of words."],
      ["free:two", "Two pictures and a line", "Two photographs side by side with a line of words under them."],
      ["free:titled", "Title on the picture", "One photograph filling the page, a band across it, the title on the band."],
      ["free:quote", "A quote under a photograph", "A photograph at the top, big words under it, and who said them."],
      ["free:three", "Three pictures and a note", "One wide photograph, two under it, and a few words."],
      ["free:sheet", "Contact sheet", "Six photographs in a grid, the way a proof sheet reads."],
      ["free:blank", "Empty page", "Nothing on it but the page colour: for the end of the book, or to keep a two-page spread on facing pages."]] },
    { group: "Studio pages", items: [
      ["divider", "Chapter page", "A pause between sections, e.g. “Fashion & editorial”."],
      ["about", "About the studio", "Who you are and how you work."],
      ["services", "What I shoot", "The kinds of shoot live on your site."],
      ["contact", "Contact", "Email, Instagram, booking link and a QR code."]] }
  ];
  /* Arrangements to start an Anything page from. Positions are fractions of
     the A4 frame, chosen against the styles' own margins (20 mm at the side on
     Elegant, the widest), so a starter page lines up with the rest of the book
     whichever style it is in. Text boxes start empty: nothing is ever written
     for the studio. */
  const FREE_STARTS = {
    opener: [
      { k: "photo", x: 0, y: 0, w: 1, h: 0.56 },
      { k: "text", role: "kicker", x: 0.095, y: 0.6, w: 0.5, h: 0.035 },
      { k: "text", role: "head", x: 0.095, y: 0.645, w: 0.81, h: 0.12 },
      { k: "text", role: "body", x: 0.095, y: 0.79, w: 0.39, h: 0.14 },
      { k: "text", role: "body", x: 0.515, y: 0.79, w: 0.39, h: 0.14 }
    ],
    two: [
      { k: "photo", x: 0.095, y: 0.09, w: 0.39, h: 0.42 },
      { k: "photo", x: 0.515, y: 0.09, w: 0.39, h: 0.42 },
      { k: "text", role: "body", x: 0.095, y: 0.55, w: 0.81, h: 0.1 }
    ],
    titled: [
      { k: "photo", x: 0, y: 0, w: 1, h: 1 },
      { k: "shape", x: 0, y: 0.58, w: 1, h: 0.26, fill: "ink", o: 0.5 },
      { k: "text", role: "kicker", x: 0.095, y: 0.615, w: 0.5, h: 0.03, style: { color: "#ffffff" } },
      { k: "text", role: "head", x: 0.095, y: 0.655, w: 0.81, h: 0.15, style: { color: "#ffffff" } }
    ],
    quote: [
      { k: "photo", x: 0, y: 0, w: 1, h: 0.5 },
      { k: "text", role: "quote", x: 0.095, y: 0.57, w: 0.81, h: 0.22 },
      { k: "line", x: 0.095, y: 0.82, w: 0.12, thick: "narrow", color: "accent" },
      { k: "text", role: "kicker", x: 0.095, y: 0.855, w: 0.6, h: 0.03 }
    ],
    three: [
      { k: "photo", x: 0.095, y: 0.075, w: 0.81, h: 0.34 },
      { k: "photo", x: 0.095, y: 0.43, w: 0.39, h: 0.28 },
      { k: "photo", x: 0.515, y: 0.43, w: 0.39, h: 0.28 },
      { k: "text", role: "body", x: 0.095, y: 0.74, w: 0.55, h: 0.12 }
    ],
    sheet: [
      { k: "photo", x: 0.095, y: 0.075, w: 0.255, h: 0.26 },
      { k: "photo", x: 0.3725, y: 0.075, w: 0.255, h: 0.26 },
      { k: "photo", x: 0.65, y: 0.075, w: 0.255, h: 0.26 },
      { k: "photo", x: 0.095, y: 0.355, w: 0.255, h: 0.26 },
      { k: "photo", x: 0.3725, y: 0.355, w: 0.255, h: 0.26 },
      { k: "photo", x: 0.65, y: 0.355, w: 0.255, h: 0.26 },
      { k: "text", role: "kicker", x: 0.095, y: 0.65, w: 0.81, h: 0.03 }
    ]
  };
  // The fields of each writing page, in the order they print. `line` fields
  // are one paragraph: Enter does nothing, and the words wrap on their own.
  const FIELD_UI = {
    story: [
      { k: "kicker", label: "Small line above the headline", ctl: "input", ph: "e.g. Behind the frame" },
      { k: "headline", label: "Headline", ctl: "line", rows: 2, hint: "A few words. It's set smaller before it's ever cut.", ph: "e.g. Light first, then the pose" },
      { k: "intro", label: "Intro", ctl: "line", rows: 3, hint: "One or two sentences that make someone read on." },
      { k: "body", label: "The story", ctl: "area", rows: 8, hint: "About 120 words. Press Enter to start a new paragraph." }
    ],
    note: [
      { k: "title", label: "Title", ctl: "line", rows: 2, ph: "e.g. The quiet frame" },
      { k: "note", label: "About this picture", ctl: "area", rows: 5, hint: "About 50 words: why this frame, for whom, how it was lit." },
      { k: "detail", label: "Detail line", ctl: "input", ph: "e.g. 85mm · one strobe, softbox camera left", credit: true }
    ],
    quote: [
      { k: "quote", label: "The quote", ctl: "line", rows: 3, hint: "Only words someone actually said or wrote, with their OK. Don't type quote marks; the page adds one." },
      { k: "name", label: "Whose words", ctl: "input", hint: "Leave empty if these are your own words." },
      { k: "role", label: "Their role", ctl: "input", ph: "e.g. Model, fashion shoot" }
    ],
    letter: [
      { k: "kicker", label: "Small line above the heading", ctl: "input", ph: "e.g. A note before the work" },
      { k: "heading", label: "Heading", ctl: "line", rows: 2, ph: "e.g. Why I still direct every frame" },
      { k: "body", label: "The letter", ctl: "area", rows: 10, hint: "About 190 words. Press Enter to start a new paragraph." },
      { k: "signName", label: "Signed", ctl: "input", ph: "Your name" },
      { k: "signLine", label: "Under the name", ctl: "input", ph: "e.g. Photographer, Noida" }
    ],
    feature: [
      { k: "kicker", label: "Small line above the headline", ctl: "input", ph: "e.g. On set" },
      { k: "headline", label: "Headline", ctl: "line", rows: 2, ph: "e.g. Two looks, one afternoon" },
      { k: "sub1", label: "First block: subheading", ctl: "input", hint: "Sits beside the first photo." },
      { k: "text1", label: "First block: words", ctl: "area", rows: 5, hint: "About 60 words." },
      { k: "sub2", label: "Second block: subheading", ctl: "input", hint: "Sits beside the second photo." },
      { k: "text2", label: "Second block: words", ctl: "area", rows: 5, hint: "About 60 words." }
    ],
    article: [
      { k: "kicker", label: "Small line above the headline", ctl: "input", ph: "e.g. Behind the frame" },
      { k: "headline", label: "Headline", ctl: "line", rows: 2, hint: "A few words. It's set smaller before it's ever cut." },
      { k: "intro", label: "Intro", ctl: "line", rows: 3, hint: "One or two sentences that make someone read on." },
      { k: "body", label: "The story", ctl: "area", rows: 10, hint: "Up to about 240 words. Press Enter to start a new paragraph." },
      { k: "caption", label: "Caption on the photo page (optional)", ctl: "input", ph: "e.g. Monsoon edit, Sector 46" }
    ]
  };
  // Fields that can be formatted (font, colour, alignment).
  const LEAD_CHOICES = [["you", "You"], ["together", "Together"], ["studio", "Studio"]];
  const REQUIRED = { story: ["headline", "body"], note: ["title", "note"], quote: ["quote"], letter: ["heading", "body"], feature: ["headline"], article: ["headline", "body"], ways: ["heading"], process: ["heading"] };
  const IDEAS = {
    story: ["What was the brief, and what changed on the day?", "What was the light doing, and what did you do about it?", "What should a brand notice in these pictures?"],
    note: ["Why this frame and not the one before it?", "Where, when, and what did you ask for?", "The one technical choice that made it."],
    quote: ["Something a client or model actually said on set.", "The line you'd put on the studio wall.", "A note from a brand you shot for, with their OK."],
    letter: ["What should a brand know before booking you?", "How you plan a shoot before the day.", "The story behind the work in this book."],
    feature: ["Two moments from one shoot, and what changed between them.", "Before and after: the plan, then the picture.", "One look styled two ways."],
    article: ["The whole story of one shoot, beside its best frame.", "A brief, the day, and the frame the client chose.", "Why this picture opens the book."],
    ways: ["Which way suits the client you're sending this to?", "Say plainly which way you like working best.", "Keep every way sounding welcome."],
    process: ["Does each step say who does it?", "Would a first-time model understand every line?", "Nothing here should promise what your terms don't."]
  };
  const POSITION_LABEL = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" };
  const BORDER_CHOICES = [["auto", "Auto"], ["none", "None"], ["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"], ["all", "All round"]];
  const FIT_CHOICES = [["auto", "Auto"], ["fill", "Fill"], ["whole", "Whole"], ["width", "Fit width"], ["height", "Fit height"]];
  const FIT_HINT = {
    auto: "The style decides: most fill their space; Elegant shows a single photo whole.",
    fill: "Fills its space. Zoom and position choose the crop.",
    whole: "The whole photo, centred, with space around it if the shapes differ.",
    width: "As wide as its space. The top and bottom crop, or leave space.",
    height: "As tall as its space. The sides crop, or leave space."
  };
  const pad2 = (n) => String(n).padStart(2, "0");
  const COVER = {};                      // a key for the cover in maps keyed by page entry

  function mount(root) {
    injectCss();
    const esc = API.esc;
    const cache = new Map();
    const thumbs = new WeakMap();        // page entry → its small canvases
    const tooLong = new WeakMap();       // page entry → true when something won't print
    let state = readState();
    let book = null;                     // the book being edited (a working copy)
    let sel = -1;                        // -1 = cover, else index into book.pages
    let active = 0;                      // which chosen photo the placement controls act on
    let blockSel = -1;                   // which thing on an Anything page is chosen
    let drawing = false;                 // the pointer draws a line by hand on an Anything page
    let lastRender = [];                 // what the preview last drew, page by page
    let lastFacing = null;               // the page drawn beside it, when Two is on
    let view = { two: false, zoom: false }; // facing pages, and larger than fit
    let printMode = "normal";            // or "fold": pages two to a sheet, in folding order
    let exportDpi = 150;                 // or 300, for a print shop
    const originals = originalsStore();  // the studio's full-size files, this session only
    let lastMatch = null;                // what match() last found for this book
    let lightTimer = null;
    let editing = null;                  // the text being typed on the page itself
    let photoSel = null;                 // the photograph chosen on the page itself
    let filter = "all", pickerOpen = null, tab = "page";
    let saveTimer = null, previewTimer = null, stripTimer = null, renderToken = 0, stripToken = 0, listToken = 0, fileUrls = [];
    let fontsOk = false;
    // Set by an actual edit. Opening a book and leaving it must not re-stamp
    // it as the newest version: that stale copy would then win the merge
    // against an edit made on another device since.
    let dirty = false;
    // Released a minute later, so files still downloading one by one finish.
    const dropFiles = () => { const urls = fileUrls; fileUrls = []; if (urls.length) setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 60000); };
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => [...root.querySelectorAll(s)];
    ensureFonts().then(() => { fontsOk = true; if (book) ensureBookFonts(book).then(() => { if (book) updateMeters(); }); });

    // The light in the top bar: green when every page is ready, amber with a
    // count when not. Checked a moment after each save, never while typing.
    function scheduleLight(ms = 900) { clearTimeout(lightTimer); lightTimer = setTimeout(drawLight, ms); }
    async function drawLight() {
      const el = $("#sbLight"); if (!el || !book) return;
      const mine = book;
      let list = [];
      try { list = await problems(book); } catch (e) { return; }
      if (book !== mine || !$("#sbLight")) return;
      el.className = `sb-light ${list.length ? "warn" : "ok"}`;
      el.querySelector("span").textContent = list.length ? `${list.length} to fix` : "All good";
      el.title = list.length ? list.map((p) => p.text).join("\n") : "Every page is ready to send";
    }
    function persist(status = "Saved on this device") {
      scheduleLight();
      if (!book || !dirty) return true;
      book.updatedAt = Date.now();
      // Read what is stored now, not this tab's cached list: another builder
      // tab may have saved or deleted a book since, and writing the cached
      // list back would erase that.
      const cur = readState();
      if (!writeState({ versions: [book, ...cur.versions.filter((v) => v.id !== book.id)], deleted: cur.deleted })) {
        setStatus("NOT SAVED — this device's storage is full or blocked");
        return false;
      }
      dirty = false;
      state = readState();
      setStatus(status + longNote());
      return true;
    }
    // Pages whose words don't all fit stay named next to the save status, so
    // a warning isn't replaced by "Saved" a moment later.
    function longNote() {
      if (!book || !fontsOk) return "";
      const long = bookCuts(book).filter((x) => x.cuts.length).map((x) => pad2(x.n));
      return long.length ? ` · page${long.length === 1 ? "" : "s"} ${long.join(", ")} too long` : "";
    }
    // Words are never held in a timer: every keystroke is on the book at once.
    // Only the save to this device waits, and anything that leaves the page
    // or the book saves straight away.
    function flush() { clearTimeout(saveTimer); saveTimer = null; return persist(); }
    function change(opts = {}) {
      dirty = true;
      const ready = $("#sbReady");
      if (ready && ready.childElementCount) { ready.replaceChildren(); dropFiles(); }
      clearTimeout(saveTimer);
      setStatus("Saving…");
      saveTimer = setTimeout(() => { saveTimer = null; persist(); }, opts.typing ? 800 : 350);
      if (opts.rail !== false) drawRail();
      if (opts.photos) drawPhotoBlock();
      schedulePreview(opts.typing ? 180 : 0);
      scheduleStrip(opts.typing ? 1500 : 300);
      updateMeters();
    }
    function setStatus(s) { const el = $("#sbStatus"); if (el) el.textContent = s; }
    if (!mount.hooked) {
      mount.hooked = true;
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && mount.flush) mount.flush(); });
      window.addEventListener("pagehide", () => { if (mount.flush) mount.flush(); });
    }
    mount.flush = () => { if (book && root.isConnected) flush(); };
    // Escape closes the download menu or the add-a-page menu; a click outside
    // closes the download menu. Looked up at the moment, since the editor
    // is rebuilt each time a book opens.
    const onKey = (e) => {
      if (!root.isConnected) { document.removeEventListener("keydown", onKey); document.removeEventListener("click", onDoc); return; }
      const el = e.target;
      const typing = el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      // Undo is the editor's own, so the browser can never undo a keystroke in
      // a box the studio isn't looking at.
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
        if (typing || !book) return;
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (!typing && book && $("#sbRead") && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); turnRead(e.key === "ArrowLeft" ? -1 : 1); return; }
      if (!typing && book && freePage() && blockSel >= 0) {
        const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (step) { e.preventDefault(); nudgeBlock(step[0], step[1], e.shiftKey); return; }
        if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeBlock(blockSel); return; }
        if (e.key === "]" || e.key === "}") { e.preventDefault(); if (e.shiftKey) moveBlockTo(blockSel, "front"); else moveBlock(blockSel, 1); return; }
        if (e.key === "[" || e.key === "{") { e.preventDefault(); if (e.shiftKey) moveBlockTo(blockSel, "back"); else moveBlock(blockSel, -1); return; }
      }
      if (e.key !== "Escape") return;
      if (drawing) { setDrawing(false); return; }
      if (editing) { closeInline(true); return; }
      if (photoSel) { photoSel = null; $$(".sb-hit.photo.on").forEach((x) => x.classList.remove("on")); pageHint(""); return; }
      if ($("#sbRead")) { closeRead(); return; }
      if (blockSel >= 0) { blockSel = -1; drawLayer(); drawInspector(); return; }
      const pop = $("#sbDlPop"), menu = $("#sbAddMenu");
      if (pop && !pop.hidden) { pop.hidden = true; $("#sbDlToggle").setAttribute("aria-expanded", "false"); $("#sbDlToggle").focus(); }
      if (menu && !menu.hidden) closeAdd();
    };
    const onDoc = (e) => {
      if (!root.isConnected) { document.removeEventListener("keydown", onKey); document.removeEventListener("click", onDoc); return; }
      const pop = $("#sbDlPop"), btn = $("#sbDlToggle");
      if (pop && !pop.hidden && !pop.contains(e.target) && !(btn && btn.contains(e.target))) { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    };
    const onResize = () => {
      if (!root.isConnected) { window.removeEventListener("resize", onResize); document.documentElement.classList.remove("sb-editing"); return; }
      if ($("#sbLayer")) drawLayer();
      if ($(".sb-hits") || editing) drawHits(lastRender);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onDoc);
    window.addEventListener("resize", onResize);

    /* --- screen 1: the books --- */
    function showList() {
      document.documentElement.classList.remove("sb-editing");
      book = null; dropFiles(); forget();
      state = readState();
      const LIMIT = (window.STUDIO_BOOK_LIMITS && window.STUDIO_BOOK_LIMITS.versions) || 200;
      const atLimit = state.versions.length >= LIMIT;
      root.innerHTML = `
        <div class="sb-homehead">
          <div>
            <p class="sb-eyebrow">Admin · Studio portfolio book</p>
            <h1 class="sb-h1">Portfolio book</h1>
            <p class="sb-lede">Your own book of work to send to clients: photographs from any album, lighting diagrams and your own words, in one of three styles and nine colourways. Keep as many versions as you need.</p>
          </div>
          <button type="button" class="sb-btn dark" id="sbNew" ${atLimit ? "disabled" : ""}>New book</button>
        </div>
        ${state.versions.length ? `<div class="sb-cards">${state.versions.map((v) => `
          <article class="sb-card">
            <button type="button" class="sb-cardcover" data-open="${esc(v.id)}" aria-label="Open ${esc(v.name)}"><span class="sb-hint">…</span></button>
            <div class="sb-cardbody">
              <h4 data-name="${esc(v.id)}">${esc(v.name)}</h4>
              <span class="sb-meta">${esc((STYLES.find((s) => s.key === v.style) || {}).name || "")} · ${esc(colourway(v.colourway).name)} · ${esc((PAPERS[v.paper] || PAPERS.a4).name)} ${esc(v.orientation)} · ${renderedCount(v)} page${renderedCount(v) === 1 ? "" : "s"}</span>
              <span class="sb-meta">Edited ${esc(new Date(v.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }))}</span>
              <div class="sb-cardacts">
                <button type="button" class="sb-btn dark" data-open="${esc(v.id)}">Open</button>
                <button type="button" class="sb-btn quiet" data-rename="${esc(v.id)}">Rename</button>
                <button type="button" class="sb-btn quiet" data-dup="${esc(v.id)}" ${atLimit ? "disabled" : ""}>Duplicate</button>
                <button type="button" class="sb-btn quiet" data-del="${esc(v.id)}">Delete</button>
              </div>
            </div>
          </article>`).join("")}</div>`
        : `<div class="sb-empty"><p class="sb-hint">No books yet. A book is a cover plus pages of your photographs and words. Start one, pick your clicks, and save a version for brands, one for agencies, one for a single client.</p></div>`}
        <p class="sb-hint sb-foot">Books save on this device as you work, and publish with your albums when you press Publish, so they open on any device.${atLimit ? ` You have ${LIMIT} books, the most there can be: delete one to start another.` : ""}</p>`;
      // A rename in progress is saved first, then the click does what it says.
      let finishRename = null;
      const settle = () => { if (finishRename) { const f = finishRename; finishRename = null; f(true, false); } };
      $("#sbNew").addEventListener("click", () => { settle(); if (!atLimit) openBook(newBook(`Book ${state.versions.length + 1}`), true); });
      $$("[data-open]").forEach((b) => b.addEventListener("click", () => {
        settle();
        const v = state.versions.find((x) => x.id === b.dataset.open); if (v) openBook(JSON.parse(JSON.stringify(v)));
      }));
      // Rename in place on the card: Enter or leaving the box saves, Escape cancels.
      $$("[data-rename]").forEach((b) => b.addEventListener("click", () => {
        const id = b.dataset.rename;
        if (finishRename && !root.querySelector(`[data-name] input`)) finishRename = null;
        if (finishRename) settle();
        const title = $$("[data-name]").find((h) => h.dataset.name === id);
        const v = state.versions.find((x) => x.id === id);
        if (!title || !v || title.querySelector("input")) return;
        title.innerHTML = `<label class="sb-vh" for="sbRename">Book name</label><input type="text" id="sbRename" maxlength="80" value="${esc(v.name)}">`;
        const input = title.querySelector("input");
        input.focus(); input.select();
        let done = false;
        const finish = (save, redraw = true) => {
          if (done) return; done = true; finishRename = null;
          const name = input.value.trim();
          if (save && name && name !== v.name) {
            const cur = readState();
            const stored = cur.versions.find((x) => x.id === id);
            if (stored && !writeState({ versions: cur.versions.map((x) => (x.id === id ? { ...x, name, updatedAt: Date.now() } : x)), deleted: cur.deleted })) { API.toast("Not renamed — this device's storage is full or blocked."); }
            else if (stored) { state = readState(); API.toast(`Renamed to “${name}”. Publish to rename it on your other devices.`); }
          }
          if (!redraw) { title.textContent = (state.versions.find((x) => x.id === id) || v).name; return; }
          showList();
          const again = root.querySelector(`[data-rename="${window.CSS && window.CSS.escape ? window.CSS.escape(id) : id}"]`); if (again) again.focus();
        };
        finishRename = finish;
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); finish(true); } if (e.key === "Escape") { e.preventDefault(); finish(false); } });
        // Leaving the box saves, a moment later, so a click on another button
        // on the list still lands.
        input.addEventListener("blur", () => setTimeout(() => finish(true), 180));
      }));
      $$("[data-dup]").forEach((b) => b.addEventListener("click", () => {
        settle();
        const cur = readState();
        const v = cur.versions.find((x) => x.id === b.dataset.dup); if (!v) return;
        const copy = { ...JSON.parse(JSON.stringify(v)), id: uid(), name: `${v.name} (copy)`, updatedAt: Date.now() };
        if (!writeState({ versions: [copy, ...cur.versions], deleted: cur.deleted })) { API.toast("Not saved — this device's storage is full or blocked."); return; }
        showList();
      }));
      $$("[data-del]").forEach((b) => b.addEventListener("click", () => {
        settle();
        const cur = readState();
        const v = cur.versions.find((x) => x.id === b.dataset.del); if (!v) return;
        if (!confirm(`Delete “${v.name}”? This cannot be undone once published.`)) return;
        if (!writeState({ versions: cur.versions.filter((x) => x.id !== v.id), deleted: [...cur.deleted, v.id] })) { API.toast("Not deleted — this device's storage is full or blocked."); return; }
        showList(); API.toast(`Deleted “${v.name}”. Publish to remove it everywhere.`);
      }));
      // Small covers, one at a time, so a long list never stalls the page.
      const token = ++listToken;
      (async () => {
        for (const v of state.versions) {
          if (token !== listToken || book) return;
          const slot = root.querySelector(`.sb-cardcover[data-open="${window.CSS && window.CSS.escape ? window.CSS.escape(v.id) : v.id}"]`);
          if (!slot) continue;
          try { for await (const r of renderPages(v, { dpi: 22, cache, only: -1 })) { if (token === listToken) slot.replaceChildren(r.page.canvas); } } catch (e) { slot.replaceChildren(); }
        }
      })();
    }

    const OPEN_KEY = "wps_book_open";
    const remember = (extra = {}) => { try { if (book) sessionStorage.setItem(OPEN_KEY, JSON.stringify({ id: book.id, sel, tab, ...extra })); } catch (e) { /* only a convenience */ } };
    const forget = () => { try { sessionStorage.removeItem(OPEN_KEY); } catch (e) { /* only a convenience */ } };
    function openBook(b, isNew = false, at = null) {
      book = b; sel = book.pages.length ? 0 : -1; active = 0; filter = "all"; pickerOpen = null; tab = "page";
      if (at && typeof at.sel === "number" && at.sel >= -1 && at.sel < book.pages.length) sel = at.sel;
      if (at && (at.tab === "design" || at.tab === "page")) tab = at.tab;
      dirty = isNew;
      if (isNew) persist("New book saved on this device");
      remember();
      showEditor();
      if (at && at.status) setStatus(at.status);
    }

    /* --- screen 2: the editor --- */
    function showEditor() {
      document.documentElement.classList.add("sb-editing");
      root.innerHTML = `
        <div class="sb-top">
          <button type="button" class="sb-btn quiet" id="sbBack">← Books</button>
          <input type="text" id="sbName" class="sb-name" maxlength="80" value="${esc(book.name)}" aria-label="Book name" title="The book's name: type to rename it" placeholder="Name this book">
          <span class="sb-status" id="sbStatus" aria-live="polite">Saved on this device</span>
          <span class="sb-undos">
            <button type="button" class="sb-btn quiet sb-ico" id="sbUndo" title="Undo (Ctrl+Z)" aria-label="Undo" disabled><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 5.5 3.5 9l4 3.5M4 9h7.5a4 4 0 0 1 0 8H9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Undo</span></button>
            <button type="button" class="sb-btn quiet sb-ico" id="sbRedo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 5.5 4 3.5-4 3.5M16 9H8.5a4 4 0 0 0 0 8H11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Redo</span></button>
          </span>
          <button type="button" class="sb-light" id="sbLight" aria-live="polite" title="What to look at before sending"><i></i><span>Checking…</span></button>
          <div class="sb-topacts">
            <button type="button" class="sb-btn" id="sbDlToggle" aria-expanded="false" aria-controls="sbDlPop">Download</button>
            <button type="button" class="sb-btn dark" id="sbPublish" title="Saves this book into the site's own files, so it is there on any device. Nothing is shown to visitors — what a client gets is the PDF.">Publish</button>
          </div>
          <div class="sb-pop" id="sbDlPop" hidden>
            <div class="sb-sec"><h3>Check before sending</h3><div id="sbCheck"><p class="sb-hint">Checking…</p></div></div>
            <div class="sb-sec">
              <label class="sb-check-row"><input type="checkbox" id="sbMark"> Write a watermark across every page</label>
              <div id="sbMarkOpts" hidden>
                <div class="sb-field"><label for="sbMarkText">The words</label><input type="text" id="sbMarkText" maxlength="40" placeholder="${esc(studio())}"></div>
                <div class="sb-field"><span class="sb-label">How strong</span><div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="How strong">${[["light", "Light"], ["medium", "Medium"], ["strong", "Strong"]].map(([k, n]) => `<button type="button" role="radio" data-mark="${k}">${n}</button>`).join("")}</div></div>
                <p class="sb-hint">For a sample you send before a job is agreed. Leave it off for the file the client keeps.</p>
              </div>
            </div>
            <div class="sb-sec"><span class="sb-label">Resolution</span>
              <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Resolution">
                <button type="button" role="radio" data-dpi="150" aria-checked="true">150 dpi</button>
                <button type="button" role="radio" data-dpi="300" aria-checked="false">300 dpi</button>
              </div>
              <p class="sb-hint" id="sbDpiNote"></p>
            </div>
            <div class="sb-sec"><span class="sb-label">Your full-size photos</span>
              <p class="sb-hint">The site keeps each photo at 1600 px. For a print run, point the book at the full-size files on this computer. They are read here and never uploaded, even if the browser's dialog says “Upload”. Choose nothing and the book prints with the site's own copies; “Don't use them” lets go of a folder you chose.</p>
              <div class="sb-dlrow"><button type="button" class="sb-btn" id="sbOrig">Choose the folder…</button><button type="button" class="sb-btn" id="sbOrigForget" hidden>Don't use them</button></div>
              <input type="file" id="sbOrigFile" multiple accept="image/*" hidden>
              <div id="sbOrigStatus"></div>
            </div>
            <div class="sb-sec"><span class="sb-label">How it prints</span>
              <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="How it prints">
                <button type="button" role="radio" data-print="normal" aria-checked="true">Normal</button>
                <button type="button" role="radio" data-print="fold" aria-checked="false">Fold in half</button>
              </div>
              <p class="sb-hint" id="sbBookletNote">Normal: one page per sheet, the size you chose in Design.</p>
            </div>
            <div class="sb-dlrow">
              <button type="button" class="sb-btn dark" id="sbPdf" data-dl>Download PDF</button>
              <button type="button" class="sb-btn" id="sbPng" data-dl>PNG pages</button>
            </div>
            <p class="sb-warn" id="sbAnyway" hidden></p>
            <div class="sb-ready" id="sbReady"></div>
            <p class="sb-hint">The PDF is made of page images, so its words can't be searched or copied.</p>
          </div>
        </div>
        <div class="sb-work">
          <nav class="sb-rail" aria-label="Pages">
            <div class="sb-railhead"><h3>Pages</h3><span class="sb-count" id="sbCount"></span></div>
            <ol class="sb-pages" id="sbPages"></ol>
            <div class="sb-addwrap"><button type="button" class="sb-addbtn" id="sbAddToggle" aria-expanded="false" aria-controls="sbAddMenu">+ Add page</button></div>
          </nav>
          <section class="sb-stage" aria-label="Page preview">
            <div class="sb-stagebar">
              <button type="button" class="sb-nav" id="sbPrev" aria-label="Previous page">‹</button>
              <strong id="sbStageTitle">Cover</strong>
              <span class="sb-views">
                <span class="sb-seg sb-seg-sm" role="radiogroup" aria-label="How many pages to show"><button type="button" role="radio" data-view="one" aria-checked="true">One</button><button type="button" role="radio" data-view="two" aria-checked="false">Two</button></span>
                <button type="button" class="sb-btn quiet" id="sbZoom" aria-pressed="false" title="Larger">Larger</button>
                <button type="button" class="sb-btn quiet" id="sbReadBtn" title="Read it through, the way a client will">Read</button>
              </span>
              <button type="button" class="sb-nav" id="sbNext" aria-label="Next page">›</button>
            </div>
            <div class="sb-preview" id="sbPreview"><p class="sb-hint">Drawing…</p></div>
            <p class="sb-pagehint" id="sbPageHint"></p>
            <div class="sb-addmenu" id="sbAddMenu" role="dialog" aria-label="Add a page" hidden></div>
          </section>
          <aside class="sb-insp">
            <div class="sb-tabs" role="tablist" aria-label="Edit">
              <button type="button" role="tab" id="sbTabPage" aria-controls="sbPanelPage" aria-selected="${tab === "page"}">This page</button>
              <button type="button" role="tab" id="sbTabDesign" aria-controls="sbPanelDesign" aria-selected="${tab === "design"}">Design</button>
            </div>
            <div class="sb-panel" role="tabpanel" id="sbPanelPage" aria-labelledby="sbTabPage" ${tab === "page" ? "" : "hidden"}></div>
            <div class="sb-panel" role="tabpanel" id="sbPanelDesign" aria-labelledby="sbTabDesign" ${tab === "design" ? "" : "hidden"}></div>
          </aside>
        </div>`;

      $("#sbBack").addEventListener("click", () => { flush(); forget(); showList(); });
      $("#sbName").addEventListener("input", (e) => { book.name = e.target.value; change({ rail: false, typing: true }); });
      $("#sbPublish").addEventListener("click", publish);
      $("#sbLight").addEventListener("click", () => { const t = $("#sbDlToggle"); if (t && $("#sbDlPop").hidden) t.click(); });
      $$("[data-view]").forEach((b) => b.addEventListener("click", () => {
        view.two = b.dataset.view === "two";
        $$("[data-view]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        closeInline(false); schedulePreview(0);
        pageHint(view.two ? (sel >= 0 && splitByTurn(sel) ? `This two-page ${book.pages[sel].type === "spread" ? "spread" : "story"} starts on page ${pad2(firstPageOf(sel))}, a right-hand page: in the printed book its halves would be either side of a turn. Move it so it starts on an even page.` : "Two shows the pages as they face each other once printed and folded. It changes nothing: how it prints is chosen in Download.") : "");
      }));
      $('[data-view="two"]').title = "See the facing page beside this one, as they will sit once printed and folded. How it prints is chosen in Download.";
      $("#sbZoom").addEventListener("click", () => {
        view.zoom = !view.zoom;
        $("#sbZoom").setAttribute("aria-pressed", String(view.zoom));
        $("#sbPreview").classList.toggle("zoom", view.zoom);
        drawLayer(); drawHits(lastRender);
      });
      $("#sbReadBtn").addEventListener("click", openRead);
      $("#sbUndo").addEventListener("click", () => { undo(); $("#sbUndo").focus(); });
      $("#sbRedo").addEventListener("click", () => { redo(); $("#sbRedo").focus(); });
      paintUndo();
      // Keyboard focus stays on the arrows; when one runs out, it moves to the other.
      $("#sbPrev").addEventListener("click", () => { if (sel > -1) { select(sel - 1); const b = $("#sbPrev"); (b.disabled ? $("#sbNext") : b).focus({ preventScroll: true }); } });
      $("#sbNext").addEventListener("click", () => { if (sel < book.pages.length - 1) { select(sel + 1); const b = $("#sbNext"); (b.disabled ? $("#sbPrev") : b).focus({ preventScroll: true }); } });
      const setTab = (t) => {
        tab = t;
        $("#sbTabPage").setAttribute("aria-selected", String(t === "page"));
        $("#sbTabDesign").setAttribute("aria-selected", String(t === "design"));
        $("#sbPanelPage").hidden = t !== "page"; $("#sbPanelDesign").hidden = t !== "design";
        remember();
      };
      $("#sbTabPage").addEventListener("click", () => setTab("page"));
      $("#sbTabDesign").addEventListener("click", () => setTab("design"));
      $$(".sb-tabs [role=tab]").forEach((b) => b.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const next = tab === "page" ? "design" : "page"; setTab(next); $(next === "page" ? "#sbTabPage" : "#sbTabDesign").focus();
      }));
      // Download menu
      const pop = $("#sbDlPop"), dlBtn = $("#sbDlToggle");
      dlBtn.addEventListener("click", () => {
        const open = pop.hidden;
        pop.hidden = !open; dlBtn.setAttribute("aria-expanded", String(open));
        if (open) { flush(); drawCheck(); }
      });
      $("#sbPdf").addEventListener("click", (e) => download(e.currentTarget, printMode === "fold" ? "booklet" : "pdf", $("#sbMark").checked));
      $$("[data-print]").forEach((b) => b.addEventListener("click", () => {
        if (b.disabled) return;
        printMode = b.dataset.print;
        $$("[data-print]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        bookletNote();
      }));
      $("#sbPng").addEventListener("click", (e) => download(e.currentTarget, "png", $("#sbMark").checked));
      $$("[data-dpi]").forEach((b) => b.addEventListener("click", () => {
        exportDpi = +b.dataset.dpi;
        $$("[data-dpi]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        dpiNote();
      }));
      // The studio's full-size photos: a folder on a computer, single files on a phone.
      const origInput = $("#sbOrigFile"), origBtn = $("#sbOrig");
      if (matchMedia("(pointer: coarse)").matches) origBtn.textContent = "Choose the photos…"; else origInput.setAttribute("webkitdirectory", "");
      origBtn.addEventListener("click", () => origInput.click());
      origInput.addEventListener("change", async () => {
        const list = [...(origInput.files || [])];
        origInput.value = "";
        if (!list.length) return;
        const el = $("#sbOrigStatus");
        origBtn.disabled = true;
        try {
          await originals.add(list, (d, t) => { if ($("#sbOrigStatus")) el.innerHTML = `<p class="sb-hint">Reading ${d} of ${t} files…</p>`; });
        } finally { origBtn.disabled = false; }
        originalsNote();
      });
      $("#sbOrigForget").addEventListener("click", () => { originals.forget(); lastMatch = null; originalsNote(); });
      dpiNote();

      // The watermark's words and strength stay with the book; whether this
      // file carries it is chosen each time.
      const markBox = $("#sbMark"), markOpts = $("#sbMarkOpts"), markText = $("#sbMarkText");
      const paintMark = () => {
        const w = book.watermark || {};
        markText.value = w.text || "";
        $$("[data-mark]").forEach((b) => b.setAttribute("aria-checked", String((w.strength || "medium") === b.dataset.mark)));
      };
      paintMark();
      markBox.addEventListener("change", () => { markOpts.hidden = !markBox.checked; if (markBox.checked) paintMark(); });
      markText.addEventListener("input", () => {
        const v = markText.value.trim();
        const w = { ...(book.watermark || {}) };
        if (v) w.text = markText.value; else delete w.text;
        if (Object.keys(w).length) book.watermark = w; else delete book.watermark;
        change({ rail: false, typing: true });
      });
      markText.addEventListener("blur", () => flush());
      $$("[data-mark]").forEach((b) => b.addEventListener("click", () => {
        const w = { ...(book.watermark || {}) };
        if (b.dataset.mark === "medium") delete w.strength; else w.strength = b.dataset.mark;
        if (Object.keys(w).length) book.watermark = w; else delete book.watermark;
        $$("[data-mark]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        change({ rail: false });
      }));
      // Add a page
      $("#sbAddToggle").addEventListener("click", () => ($("#sbAddMenu").hidden ? openAdd() : closeAdd()));
      drawDesign(); drawRail(); drawInspector(); schedulePreview(0); scheduleStrip(0); scheduleLight(1500);
      try { window.scrollTo({ top: 0 }); } catch (e) { /* older browsers */ }
    }

    /* ---------- undo -------------------------------------------------------
       The whole book as it was, kept in this tab only: small (a few kB a
       step), never saved, and cleared when the book closes. A step is taken
       before a change, not after, so undo puts back what was there. */
    const history = { past: [], future: [] };
    let lastMark = 0;
    const snapshot = () => JSON.stringify(book);
    function paintUndo() {
      const u = $("#sbUndo"), r = $("#sbRedo");
      if (u) u.disabled = !history.past.length;
      if (r) r.disabled = !history.future.length;
    }
    function mark(coalesce) {
      const now = Date.now();
      // Typing in one box is one step, not one a keystroke.
      if (coalesce && history.past.length && now - lastMark < 700) { lastMark = now; return; }
      history.past.push(snapshot());
      if (history.past.length > 40) history.past.shift();
      history.future.length = 0;
      lastMark = now;
      paintUndo();
    }
    function restoreBook(json) {
      let was = null;
      try { was = JSON.parse(json); } catch (e) { return; }
      for (const k of Object.keys(book)) delete book[k];
      Object.assign(book, was);
      if (sel >= book.pages.length) sel = book.pages.length - 1;
      // Keep hold of the thing that was chosen, if it is still there.
      const fp = freePage();
      blockSel = fp && blockSel >= 0 ? Math.min(blockSel, blocksOf(fp).length - 1) : -1;
      active = 0; pickerOpen = null;
      change({ rail: true });
      drawInspector(); drawDesign();
      paintUndo();
    }
    const undo = () => { if (!history.past.length) return; history.future.push(snapshot()); restoreBook(history.past.pop()); lastMark = 0; API.toast("Undone."); };
    const redo = () => { if (!history.future.length) return; history.past.push(snapshot()); restoreBook(history.future.pop()); lastMark = 0; };

    /* ---------- the Anything page ------------------------------------------
       Things placed by hand. The page itself is the control surface: each
       thing has an invisible button sitting exactly on top of it, which is
       dragged, resized with its corners, and nudged with the arrow keys.
       Positions stay fractions of the A4 frame, so nothing moves when the
       paper or the shape changes. */
    const freePage = () => { const e = sel >= 0 ? book.pages[sel] : null; return e && e.type === "free" ? e : null; };
    const blocksOf = (e) => (Array.isArray(e.blocks) ? e.blocks : (e.blocks = []));
    const curBlock = () => { const e = freePage(); if (!e) return null; return blocksOf(e)[blockSel] || null; };
    const BLOCK_NAME = { text: "Words", photo: "Photograph", shape: "Shape", line: "Line" };
    const blockLabel = (b) => (b.k === "text" ? (String(b.t || "").trim().slice(0, 28) || "Words (empty)") : b.k === "line" && linePath(b) === "free" ? "Drawn line" : BLOCK_NAME[b.k] || b.k);
    // Screen pixels to a fraction of the A4 frame, and the other way.
    function layerMaths() {
      const G = geometry(book);
      const layer = $("#sbLayer");
      const r = layer ? layer.getBoundingClientRect() : { width: 1, height: 1 };
      return {
        G, r,
        fx: (px) => (px / r.width) * (G.W / G.Wa),
        fy: (px) => (px / r.height) * (G.H / G.Ha),
        left: (b) => ((b.x * G.Wa + G.ox) / G.W) * 100,
        top: (b) => ((b.y * G.Ha + G.oy) / G.H) * 100,
        wide: (b) => ((b.w * G.Wa) / G.W) * 100,
        high: (b) => ((b.k === "line" ? lineH(b, G.Ha) * G.Ha : b.h * G.Ha) / G.H) * 100
      };
    }
    const round4 = (v) => Math.round(v * 10000) / 10000;
    function drawLayer() {
      const box = $("#sbPreview"); if (!box) return;
      const e = freePage();
      const mine = lastRender[0] && lastRender[0].page && lastRender[0].page.canvas;
      const canvas = mine && mine.isConnected ? mine : box.querySelector("canvas");
      let layer = $("#sbLayer");
      if (!e || !canvas) { if (layer) layer.remove(); return; }
      if (!layer) {
        layer = document.createElement("div");
        layer.id = "sbLayer"; layer.className = "sb-layer";
        box.appendChild(layer);
        wireLayer(layer);
      }
      layer.style.left = `${canvas.offsetLeft}px`;
      layer.style.top = `${canvas.offsetTop}px`;
      layer.style.width = `${canvas.offsetWidth}px`;
      layer.style.height = `${canvas.offsetHeight}px`;
      const M = layerMaths();
      const blocks = blocksOf(e);
      if (blockSel >= blocks.length) blockSel = -1;
      layer.querySelectorAll(".sb-blk, .sb-guide, .sb-mg").forEach((x) => x.remove());
      {
        // The style's margins and the middle of the page, as faint lines.
        const G = M.G, S = STYLE_IMPL[book.style] || STYLE_IMPL.modern;
        const mg = S.margins(book.orientation === "landscape" ? "landscape" : "portrait");
        const px = (frac) => `${(((frac * G.Wa + G.ox) / G.W) * 100).toFixed(3)}%`, py = (frac) => `${(((frac * G.Ha + G.oy) / G.H) * 100).toFixed(3)}%`;
        layer.insertAdjacentHTML("afterbegin", `
          <i class="sb-mg v" style="left:${px(mg.side / G.Wa)}"></i><i class="sb-mg v" style="left:${px(1 - mg.side / G.Wa)}"></i>
          <i class="sb-mg h" style="top:${py(mg.top / G.Ha)}"></i><i class="sb-mg h" style="top:${py(1 - mg.bottom / G.Ha)}"></i>
          <i class="sb-mg v mid" style="left:${px(0.5)}"></i><i class="sb-mg h mid" style="top:${py(0.5)}"></i>`);
      }
      layer.insertAdjacentHTML("afterbegin", blocks.map((b, i) => {
        const on = i === blockSel;
        const turn = b.r ? ` transform: rotate(${b.r}deg);` : "";
        const handles = on && !(b.k === "line" && linePath(b) === "h")
          ? ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => `<span class="sb-h" data-h="${h}" style="left:${{ nw: 0, n: 50, ne: 100, e: 100, se: 100, s: 50, sw: 0, w: 0 }[h]}%; top:${{ nw: 0, n: 0, ne: 0, e: 50, se: 100, s: 100, sw: 100, w: 50 }[h]}%"></span>`).join("")
          : on ? `<span class="sb-h" data-h="w" style="left:0%; top:50%"></span><span class="sb-h" data-h="e" style="left:100%; top:50%"></span>` : "";
        return `<button type="button" class="sb-blk${on ? " on" : ""}${b.k === "line" && linePath(b) === "h" ? " line" : ""}${shapeOf(b) === "ellipse" ? " oval" : ""}" data-blk="${i}" aria-pressed="${on}"
          aria-label="${esc(blockLabel(b))}, ${i + 1} of ${blocks.length}"
          style="left:${M.left(b).toFixed(3)}%; top:${M.top(b).toFixed(3)}%; width:${M.wide(b).toFixed(3)}%; height:${Math.max(M.high(b), b.k === "line" && linePath(b) === "h" ? 1.2 : 0.6).toFixed(3)}%;${turn}">${handles}</button>`;
      }).join(""));
      const old = layer.querySelector("#sbBlkBar"); if (old) old.remove();
      if (blockSel >= 0 && blocks[blockSel]) {
        const b = blocks[blockSel], n = blocks.length;
        const bar = document.createElement("div");
        bar.id = "sbBlkBar"; bar.className = "sb-blkbar"; bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", `${blockLabel(b)}: front and back`);
        bar.innerHTML = `
          <button type="button" data-order="front" aria-label="Bring to the front" ${blockSel === n - 1 ? "disabled" : ""}><i>⇈</i><span>To front</span></button>
          <button type="button" data-order="up" aria-label="Bring forward" ${blockSel === n - 1 ? "disabled" : ""}><i>↑</i><span>Forward</span></button>
          <button type="button" data-order="down" aria-label="Send backward" ${blockSel === 0 ? "disabled" : ""}><i>↓</i><span>Backward</span></button>
          <button type="button" data-order="back" aria-label="Send to the back" ${blockSel === 0 ? "disabled" : ""}><i>⇊</i><span>To back</span></button>
          <i class="sb-sep"></i>
          <button type="button" data-order="dupe" aria-label="Duplicate" ${n >= FREE_MAX ? "disabled" : ""}><i>⧉</i><span>Copy</span></button>
          <button type="button" data-order="del" aria-label="Remove"><i>✕</i><span>Remove</span></button>`;
        // Above the thing, or below it when it sits at the top of the page.
        const top = M.top(b);
        bar.style.left = `${Math.max(0, Math.min(M.left(b), 100 - 60)).toFixed(3)}%`;
        if (top < 8) bar.style.top = `calc(${(top + Math.max(M.high(b), 0.6)).toFixed(3)}% + 6px)`; else bar.style.bottom = `calc(${(100 - top).toFixed(3)}% + 6px)`;
        bar.querySelectorAll("[data-order]").forEach((x) => x.addEventListener("click", () => {
          const k = x.dataset.order;
          if (k === "up") moveBlock(blockSel, 1); else if (k === "down") moveBlock(blockSel, -1);
          else if (k === "front") moveBlockTo(blockSel, "front"); else if (k === "back") moveBlockTo(blockSel, "back");
          else if (k === "dupe") dupeBlock(blockSel); else if (k === "del") removeBlock(blockSel);
          const again = $(`#sbBlkBar [data-order="${k}"]`); if (again && !again.disabled) again.focus({ preventScroll: true });
        }));
        layer.appendChild(bar);
      }
      const cur = layer.querySelector(".sb-blk.on");
      if (cur && layer.dataset.focus === "1") { cur.focus({ preventScroll: true }); layer.dataset.focus = ""; }
    }
    // Lines things can land on: the page's own margins, its middle, its thirds,
    // and every edge and middle of everything else on the page.
    function guidesFor(e, skip) {
      const G = geometry(book);
      const S = STYLE_IMPL[book.style] || STYLE_IMPL.modern;
      const M = S.margins(book.orientation === "landscape" ? "landscape" : "portrait");
      const xs = [0, 0.5, 1, 1 / 3, 2 / 3, M.side / G.Wa, 1 - M.side / G.Wa];
      const ys = [0, 0.5, 1, 1 / 3, 2 / 3, M.top / G.Ha, 1 - M.bottom / G.Ha];
      const boxes = [];
      blocksOf(e).forEach((b, i) => {
        if (i === skip) return;
        const h = b.k === "line" ? lineH(b, G.Ha) : b.h;
        xs.push(b.x, b.x + b.w / 2, b.x + b.w);
        ys.push(b.y, b.y + h / 2, b.y + h);
        // …and the same thing mirrored about the middle, so two things can sit
        // the same distance in from each side.
        xs.push(1 - b.x, 1 - (b.x + b.w));
        boxes.push({ x: b.x, y: b.y, w: b.w, h });
      });
      // The page facing this one: line up with what is on it, at the same
      // height, and the same distance in from the outer edge (mirrored about the fold).
      const other = facingRender();
      if (other) {
        for (const rg of facingBoxes(other)) {
          const fx = rg.x, fw = rg.w, fy = rg.y, fh = rg.h;
          ys.push(fy, fy + fh / 2, fy + fh);
          xs.push(1 - (fx + fw), 1 - fx, fx, fx + fw);
        }
      }
      // A mouse is not that precise: things snap from a millimetre and a half away.
      return { xs, ys, boxes, tolX: 1.5 / G.Wa, tolY: 1.5 / G.Ha };
    }
    // What the preview drew beside this page, when Two is on.
    const facingRender = () => (view.two && lastFacing && lastFacing.page ? lastFacing : null);
    // Everything on the facing page, as fractions of the frame: the things on
    // an Anything page (all kinds), or the words and photographs drawn on any other.
    function facingBoxes(other) {
      const G = geometry(book);
      const e = other.index >= 0 ? book.pages[other.index] : null;
      if (e && e.type === "free") return blocksOf(e).map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.k === "line" ? lineH(b, G.Ha) : b.h }));
      return pageRegions(other).map((rg) => ({ x: (rg.box.x - G.ox) / G.Wa, y: (rg.box.y - G.oy) / G.Ha, w: rg.box.w / G.Wa, h: rg.box.h / G.Ha }));
    }
    // Equal gaps: a thing between two others snaps to sit the same distance
    // from each; returns the position, or null.
    function equalGap(pos, size, boxes, axis, tol) {
      const lo = (b) => (axis === "x" ? b.x : b.y), hi = (b) => (axis === "x" ? b.x + b.w : b.y + b.h);
      const ov = (b) => (axis === "x" ? !(b.y + b.h < 0 || b.y > 1.3) : true);
      let best = null;
      for (const a of boxes) for (const c of boxes) {
        if (a === c || !ov(a) || !ov(c)) continue;
        if (hi(a) > pos + tol || lo(c) < pos + size - tol) continue;        // a before, c after
        const want = (hi(a) + lo(c) - size) / 2;
        const d = Math.abs(want - pos);
        if (d <= tol && (!best || d < best.d)) best = { at: want, gap: want - hi(a), d };
      }
      return best;
    }
    const snapTo = (v, list, tol) => { let best = null, gap = tol; for (const t of list) { const d = Math.abs(v - t); if (d <= gap) { gap = d; best = t; } } return best; };
    function showGuides(marks) {
      const layer = $("#sbLayer"); if (!layer) return;
      layer.querySelectorAll(".sb-guide").forEach((g) => g.remove());
      const G = geometry(book);
      for (const m of marks) {
        const g = document.createElement("span");
        g.className = "sb-guide";
        if (m.axis === "x") { g.style.left = `${((m.at * G.Wa + G.ox) / G.W) * 100}%`; g.style.top = "0"; g.style.width = "1px"; g.style.height = "100%"; }
        else { g.style.top = `${((m.at * G.Ha + G.oy) / G.H) * 100}%`; g.style.left = "0"; g.style.height = "1px"; g.style.width = "100%"; }
        layer.appendChild(g);
      }
    }
    const clearGuides = () => { const l = $("#sbLayer"); if (l) l.querySelectorAll(".sb-guide").forEach((g) => g.remove()); };
    // While dragging: how far the thing is from each edge of the page, in
    // millimetres, and whether that matches something else on the spread.
    function showMeasure(b, equal) {
      const layer = $("#sbLayer"); if (!layer) return;
      const G = geometry(book);
      const h = b.k === "line" ? lineH(b, G.Ha) : b.h;
      const mm = (v) => `${(v).toFixed(1).replace(/\.0$/, "")}`;
      const left = b.x * G.Wa, right = (1 - b.x - b.w) * G.Wa, top = b.y * G.Ha, bottom = (1 - b.y - h) * G.Ha;
      // The same distance in from the outer edge as something on the facing page?
      let twin = "";
      const other = facingRender();
      if (other) {
        const outer = other.index < sel ? right : left;   // this page is on the right when the other is earlier
        for (const rg of facingBoxes(other)) {
          const fx = rg.x, fw = rg.w;
          const theirs = (other.index < sel ? fx : 1 - fx - fw) * G.Wa;
          if (Math.abs(theirs - outer) < 0.6) { twin = " · <b>same as the facing page</b>"; break; }
        }
      }
      let el = $("#sbMeasure");
      if (!el) { el = document.createElement("div"); el.id = "sbMeasure"; el.className = "sb-measure"; layer.appendChild(el); }
      el.innerHTML = `← ${mm(left)}${equal.x !== null ? " <b>= gap</b>" : ""} · → ${mm(right)} · ↑ ${mm(top)}${equal.y !== null ? " <b>= gap</b>" : ""} · ↓ ${mm(bottom)} mm${twin}`;
      const topPct = ((b.y * G.Ha + G.oy) / G.H) * 100, leftPct = ((b.x * G.Wa + G.ox) / G.W) * 100;
      el.style.left = `${Math.max(0, Math.min(leftPct, 55)).toFixed(2)}%`;
      el.style.top = `calc(${Math.max(0, topPct + (h * G.Ha / G.H) * 100).toFixed(2)}% + 8px)`;
    }

    function wireLayer(layer) {
      layer.addEventListener("dblclick", (ev) => {
        const el = ev.target.closest(".sb-blk"); if (!el) return;
        const e = freePage(); if (!e) return;
        const i = +el.dataset.blk, b = blocksOf(e)[i];
        if (b && b.k === "text") { blockSel = i; drawLayer(); drawInspector(); openInline(`b${i}`, { box: { x: 0, y: 0, w: 1, h: 1 }, type: null }, layer); }
      });
      layer.addEventListener("pointerdown", (ev) => {
        const e = freePage(); if (!e) return;
        if (ev.target.closest("#sbBlkBar")) return;
        if (drawing) {
          // A stroke: points as fractions of the frame, until the pointer lifts.
          ev.preventDefault();
          const M = layerMaths();
          const r = M.r;
          const at = (m) => [((m.clientX - r.left) / r.width * M.G.W - M.G.ox) / M.G.Wa, ((m.clientY - r.top) / r.height * M.G.H - M.G.oy) / M.G.Ha];
          const pts = [at(ev)];
          try { layer.setPointerCapture(ev.pointerId); } catch (err) { /* older browsers */ }
          let trail = layer.querySelector("#sbTrail");
          if (!trail) { trail = document.createElementNS("http://www.w3.org/2000/svg", "svg"); trail.id = "sbTrail"; trail.setAttribute("class", "sb-trail"); trail.innerHTML = `<polyline fill="none" stroke="#FF3D7F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`; layer.appendChild(trail); }
          const poly = trail.querySelector("polyline");
          const paint = () => { poly.setAttribute("points", pts.map(([px, py]) => `${(((px * M.G.Wa + M.G.ox) / M.G.W) * r.width).toFixed(1)},${(((py * M.G.Ha + M.G.oy) / M.G.H) * r.height).toFixed(1)}`).join(" ")); };
          paint();
          const move = (m) => { pts.push(at(m)); paint(); };
          const up = () => {
            layer.removeEventListener("pointermove", move); layer.removeEventListener("pointerup", up); layer.removeEventListener("pointercancel", up);
            trail.remove();
            strokeToBlock(pts);
          };
          layer.addEventListener("pointermove", move); layer.addEventListener("pointerup", up); layer.addEventListener("pointercancel", up);
          return;
        }
        const handle = ev.target.closest(".sb-h");
        const el = ev.target.closest(".sb-blk");
        if (!el) { if (blockSel !== -1) { blockSel = -1; drawLayer(); drawInspector(); } return; }
        const i = +el.dataset.blk;
        if (i !== blockSel) { blockSel = i; drawLayer(); drawInspector(); }
        const blocks = blocksOf(e);
        const b = blocks[i]; if (!b) return;
        const M = layerMaths();
        const start = { x: b.x, y: b.y, w: b.w, h: b.h };
        const from = { x: ev.clientX, y: ev.clientY };
        const dir = handle ? handle.dataset.h : null;
        const guides = guidesFor(e, i);
        let moved = false, copy = null;
        const move = (m) => {
          const dx = M.fx(m.clientX - from.x), dy = M.fy(m.clientY - from.y);
          if (!moved && Math.abs(m.clientX - from.x) < 3 && Math.abs(m.clientY - from.y) < 3) return;
          if (!moved) {
            moved = true;
            try { layer.setPointerCapture(m.pointerId); } catch (err) { /* older browsers */ }
            mark();
            // Holding Alt while dragging leaves a copy behind.
            if (!dir && m.altKey && blocks.length < FREE_MAX) { copy = { ...b }; blocks.splice(i, 0, copy); blockSel = i + 1; }
          }
          const hit = [];
          let equal = { x: null, y: null };
          if (!dir) {
            let nx = start.x + dx, ny = start.y + dy;
            const hh = b.k === "line" && linePath(b) === "h" ? 0 : (start.h || 0);
            const gx = equalGap(nx, start.w, guides.boxes, "x", guides.tolX), gy = equalGap(ny, hh, guides.boxes, "y", guides.tolY);
            if (gx) { nx = gx.at; equal.x = gx.gap; }
            else {
              const sx = snapTo(nx, guides.xs, guides.tolX), sxm = snapTo(nx + start.w / 2, guides.xs, guides.tolX), sxr = snapTo(nx + start.w, guides.xs, guides.tolX);
              if (sx !== null) { nx = sx; hit.push({ axis: "x", at: sx }); }
              else if (sxm !== null) { nx = sxm - start.w / 2; hit.push({ axis: "x", at: sxm }); }
              else if (sxr !== null) { nx = sxr - start.w; hit.push({ axis: "x", at: sxr }); }
            }
            if (gy) { ny = gy.at; equal.y = gy.gap; }
            else {
              const sy = snapTo(ny, guides.ys, guides.tolY), sym = snapTo(ny + hh / 2, guides.ys, guides.tolY), syr = snapTo(ny + hh, guides.ys, guides.tolY);
              if (sy !== null) { ny = sy; hit.push({ axis: "y", at: sy }); }
              else if (sym !== null) { ny = sym - hh / 2; hit.push({ axis: "y", at: sym }); }
              else if (syr !== null) { ny = syr - hh; hit.push({ axis: "y", at: syr }); }
            }
            b.x = round4(Math.min(1.3, Math.max(-0.3, nx)));
            b.y = round4(Math.min(1.3, Math.max(-0.3, ny)));
          } else {
            const west = dir.includes("w"), east = dir.includes("e"), north = dir.includes("n"), south = dir.includes("s");
            if (east) { let r = start.x + start.w + dx; const sr = snapTo(r, guides.xs, guides.tolX); if (sr !== null) { r = sr; hit.push({ axis: "x", at: sr }); } b.w = round4(Math.max(0.02, Math.min(1.6, r - b.x))); }
            if (west) { let l = start.x + dx; const sl = snapTo(l, guides.xs, guides.tolX); if (sl !== null) { l = sl; hit.push({ axis: "x", at: sl }); } const right = start.x + start.w; b.x = round4(Math.min(right - 0.02, l)); b.w = round4(Math.max(0.02, right - b.x)); }
            if (!(b.k === "line" && linePath(b) === "h")) {
              if (south) { let bo = start.y + start.h + dy; const sb = snapTo(bo, guides.ys, guides.tolY); if (sb !== null) { bo = sb; hit.push({ axis: "y", at: sb }); } b.h = round4(Math.max(0.02, Math.min(1.6, bo - b.y))); }
              if (north) { let t = start.y + dy; const stp = snapTo(t, guides.ys, guides.tolY); if (stp !== null) { t = stp; hit.push({ axis: "y", at: stp }); } const bot = start.y + start.h; b.y = round4(Math.min(bot - 0.02, t)); b.h = round4(Math.max(0.02, bot - b.y)); }
            }
          }
          drawLayer();
          showGuides(hit);
          showMeasure(b, equal);
          schedulePreview(60);
        };
        const up = () => {
          layer.removeEventListener("pointermove", move);
          layer.removeEventListener("pointerup", up);
          layer.removeEventListener("pointercancel", up);
          clearGuides();
          const mz = $("#sbMeasure"); if (mz) mz.remove();
          if (moved) { change({ rail: true }); drawInspector(); }
        };
        layer.addEventListener("pointermove", move);
        layer.addEventListener("pointerup", up);
        layer.addEventListener("pointercancel", up);
      });
    }
    // Arrow keys move the chosen thing half a millimetre, five with Shift.
    function nudgeBlock(dx, dy, big) {
      const e = freePage(), b = curBlock(); if (!e || !b) return;
      const G = geometry(book);
      const step = big ? 5 : 0.5;
      mark(true);
      b.x = round4(Math.min(1.3, Math.max(-0.3, b.x + (dx * step) / G.Wa)));
      b.y = round4(Math.min(1.3, Math.max(-0.3, b.y + (dy * step) / G.Ha)));
      change({ rail: true });
      drawLayer();
    }
    function removeBlock(i) {
      const e = freePage(); if (!e) return;
      const blocks = blocksOf(e);
      if (!blocks[i]) return;
      mark();
      blocks.splice(i, 1);
      blockSel = Math.min(i, blocks.length - 1);
      change({ rail: true });
      drawInspector();
      API.toast("Removed · press Ctrl+Z to put it back");
    }
    function moveBlock(i, by) {
      const e = freePage(); if (!e) return;
      const blocks = blocksOf(e);
      const to = i + by;
      if (to < 0 || to >= blocks.length) return;
      mark();
      const [b] = blocks.splice(i, 1);
      blocks.splice(to, 0, b);
      blockSel = to;
      change({ rail: true });
      drawInspector();
    }
    // Drawing by hand: every stroke on the page becomes a line of its own.
    function setDrawing(on) {
      drawing = !!on;
      const btn = $('[data-addblk="draw"]'); if (btn) btn.setAttribute("aria-pressed", String(drawing));
      const layer = $("#sbLayer"); if (layer) layer.classList.toggle("drawing", drawing);
      pageHint(drawing ? "Draw on the page with your finger or mouse; each stroke becomes a line. Esc to stop." : "");
    }
    // Fewer points that still follow the hand: the usual corner-keeping cull.
    function thinPoints(pts, tol) {
      if (pts.length < 3) return pts;
      const d = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1e-9; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)); return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)); };
      let far = 0, at = 0;
      for (let i = 1; i < pts.length - 1; i++) { const v = d(pts[i], pts[0], pts[pts.length - 1]); if (v > far) { far = v; at = i; } }
      if (far <= tol) return [pts[0], pts[pts.length - 1]];
      return [...thinPoints(pts.slice(0, at + 1), tol).slice(0, -1), ...thinPoints(pts.slice(at), tol)];
    }
    function strokeToBlock(pts) {
      const e = freePage(); if (!e || pts.length < 2) return;
      const blocks = blocksOf(e);
      if (blocks.length >= FREE_MAX) { API.toast(`A page holds ${FREE_MAX} things. Remove one to add another.`); return; }
      const G = geometry(book);
      const thin = thinPoints(pts, 0.35 / G.Wa).slice(0, 200);
      const xs = thin.map((p) => p[0]), ys = thin.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const w = Math.max(0.02, x1 - x0), h = Math.max(0.02, y1 - y0);
      mark();
      blocks.push({ k: "line", path: "free", x: round4(x0), y: round4(y0), w: round4(w), h: round4(h), thick: "narrow", pts: thin.map(([px, py]) => [Math.round(((px - x0) / w) * 1000) / 1000, Math.round(((py - y0) / h) * 1000) / 1000]) });
      blockSel = blocks.length - 1;
      change({ rail: true });
      drawInspector();
    }
    function moveBlockTo(i, where) {
      const e = freePage(); if (!e) return;
      const blocks = blocksOf(e);
      if (!blocks[i]) return;
      const to = where === "front" ? blocks.length - 1 : 0;
      if (to === i) return;
      mark();
      const [b] = blocks.splice(i, 1);
      blocks.splice(to, 0, b);
      blockSel = to;
      change({ rail: true });
      drawInspector();
    }
    function dupeBlock(i) {
      const e = freePage(); if (!e) return;
      const blocks = blocksOf(e);
      const b = blocks[i]; if (!b) return;
      if (blocks.length >= FREE_MAX) { API.toast(`A page holds ${FREE_MAX} things. Remove one to add another.`); return; }
      if (b.k === "photo" && blocks.filter((x) => x.k === "photo").length >= FREE_PHOTO_MAX) { API.toast(`${FREE_PHOTO_MAX} photographs on one page is the most.`); return; }
      mark();
      const copy = JSON.parse(JSON.stringify(b));
      copy.x = round4(Math.min(1.2, copy.x + 0.02)); copy.y = round4(Math.min(1.2, copy.y + 0.02));
      blocks.splice(i + 1, 0, copy);
      blockSel = i + 1;
      change({ rail: true });
      drawInspector();
    }
    function addBlock(k) {
      const e = freePage(); if (!e) return;
      const blocks = blocksOf(e);
      if (blocks.length >= FREE_MAX) { API.toast(`A page holds ${FREE_MAX} things. Remove one to add another.`); return; }
      if (k === "photo" && blocks.filter((b) => b.k === "photo").length >= FREE_PHOTO_MAX) { API.toast(`${FREE_PHOTO_MAX} photographs on one page is the most.`); return; }
      mark();
      const n = blocks.length;
      const at = (v) => round4(Math.min(0.72, v + n * 0.018));
      const b = k === "text" ? { k: "text", role: "body", t: "", x: at(0.12), y: at(0.16), w: 0.5, h: 0.18 }
        : k === "photo" ? { k: "photo", x: at(0.12), y: at(0.16), w: 0.45, h: 0.3 }
        : k === "shape" ? { k: "shape", x: at(0.12), y: at(0.16), w: 0.45, h: 0.18, fill: "accent" }
        : { k: "line", x: at(0.12), y: at(0.2), w: 0.3, thick: "narrow", color: "rule" };
      blocks.push(b);
      blockSel = blocks.length - 1;
      active = 0; pickerOpen = null;
      change({ rail: true });
      drawInspector();
      const first = $("#sbF_blocktext");
      if (first && matchMedia("(pointer: fine)").matches) first.focus();
    }

    /* ---------- touching the page ------------------------------------------
       Tap the words on the page and the caret is in them, on the page, in the
       real font at the real size; tap a photograph and drag it inside its
       frame. Every region comes from the same plan the page was painted from,
       so it can never sit somewhere other than the words. */
    const pageHint = (s) => { const el = $("#sbPageHint"); if (el) el.textContent = s || ""; };
    // Where the words of a field live, and how many there may be.
    function textHost(field) {
      const entry = sel >= 0 ? book.pages[sel] : null;
      const caps = fieldCaps();
      if (!entry) {
        if (field === "title") return { get: () => book.title || "", set: (v) => { book.title = v; }, max: 80, line: true, host: styleHost(null), key: "title" };
        if (field === "subtitle") return { get: () => book.subtitle || "", set: (v) => { book.subtitle = v; }, max: 120, line: true, host: styleHost(null), key: "subtitle" };
        return null;
      }
      if (entry.type === "divider") {
        if (field === "heading") return { get: () => entry.heading || "", set: (v) => { entry.heading = v; }, max: 60, line: true, host: styleHost(entry), key: "heading" };
        if (field === "line") return { get: () => entry.line || "", set: (v) => { entry.line = v; }, max: 160, line: true, host: styleHost(entry), key: "line" };
        return null;
      }
      if (entry.type === "about" && field === "about") return { get: () => book.texts.about || "", set: (v) => { book.texts.about = v; }, max: 1200, host: styleHost(entry), key: "about" };
      if (entry.type === "free") {
        const m = /^b(\d+)$/.exec(field), b = m && blocksOf(entry)[+m[1]];
        if (!b || b.k !== "text") return null;
        return { get: () => b.t || "", set: (v) => { b.t = v; }, max: FREE_TEXT_MAX, host: blockStyleHost(b), key: "t", block: +m[1] };
      }
      if (WRITING[entry.type] && (caps[entry.type] || {})[field] !== undefined) {
        const ui = (FIELD_UI[entry.type] || []).find((f) => f.k === field);
        return { get: () => entry[field] || "", set: (v) => { entry[field] = v; }, max: caps[entry.type][field], line: !!(ui && ui.ctl !== "area"), host: styleHost(entry), key: field };
      }
      return null;
    }
    // Every text and photograph on a drawn page, in the page's own millimetres.
    function pageRegions(r) {
      const G = geometry(book);
      const page = r.page, out = [];
      if (page.plan) for (const [field, f] of Object.entries(page.plan.fields || {})) if (f.box) out.push({ kind: "text", field, box: { x: f.box.x + G.ox, y: f.box.y + G.oy, w: f.box.w, h: f.box.h }, type: f.type });
      for (const t of page.texts || []) out.push({ kind: "text", field: t.field, box: { x: t.x, y: t.y, w: t.w, h: t.h }, type: t.type });
      (page.photos || []).forEach((ph, i) => { if (ph.id && ph.w > 4 && ph.h > 4) out.push({ kind: "photo", id: ph.id, n: i, box: { x: ph.x, y: ph.y, w: ph.w, h: ph.h } }); });
      return out;
    }
    // The shot object a drawn photograph came from.
    function shotFor(id) {
      const entry = sel >= 0 ? book.pages[sel] : null;
      if (!entry) return book.cover && book.cover.id === id ? book.cover : null;
      return (entry.photos || []).find((x) => x.id === id) || null;
    }
    function drawHits(got) {
      const box = $("#sbPreview"); if (!box) return;
      const entry = sel >= 0 ? book.pages[sel] : null;
      if (entry && entry.type === "free") { box.querySelectorAll(".sb-hits").forEach((l) => l.remove()); placeInline(); return; }    // the blocks layer does this there
      const G = geometry(book);
      // The layer holding the box being typed in is kept, so focus never leaves it.
      const keep = editing && editing.ta.parentNode && editing.ta.parentNode.classList.contains("sb-hits") ? editing.ta.parentNode : null;
      const fresh = [];
      (got || []).forEach((r) => {
        const canvas = r.page.canvas; if (!canvas || !canvas.isConnected) return;
        let layer = keep && r.index === sel && keep.isConnected ? keep : null;
        if (!layer) { layer = document.createElement("div"); layer.className = "sb-hits"; box.appendChild(layer); }
        layer.style.left = `${canvas.offsetLeft}px`; layer.style.top = `${canvas.offsetTop}px`;
        layer.style.width = `${canvas.offsetWidth}px`; layer.style.height = `${canvas.offsetHeight}px`;
        const regions = pageRegions(r);
        // Photographs underneath, words on top, so words over a picture win.
        const order = [...regions.filter((x) => x.kind === "photo"), ...regions.filter((x) => x.kind === "text")];
        layer.querySelectorAll(".sb-hit").forEach((h) => h.remove());
        fresh.push(layer);
        layer.insertAdjacentHTML("afterbegin", order.map((rg) => {
          const on = rg.kind === "photo" && photoSel && photoSel.id === rg.id && photoSel.n === rg.n;
          const label = rg.kind === "photo" ? "Photograph: drag to move it in its frame, scroll to zoom, double-click to change how it fills" : `${rg.field}: tap to type it on the page`;
          return `<button type="button" class="sb-hit ${rg.kind}${on ? " on" : ""}" data-kind="${rg.kind}" data-field="${esc(rg.field || "")}" data-id="${esc(rg.id || "")}" data-n="${rg.n == null ? "" : rg.n}" aria-label="${esc(label)}"
            style="left:${(rg.box.x / G.W * 100).toFixed(3)}%; top:${(rg.box.y / G.H * 100).toFixed(3)}%; width:${(rg.box.w / G.W * 100).toFixed(3)}%; height:${(rg.box.h / G.H * 100).toFixed(3)}%"></button>`;
        }).join(""));
        layer._regions = regions; layer._page = r.page;
        wireHits(layer);
      });
      box.querySelectorAll(".sb-hits").forEach((l) => { if (!fresh.includes(l)) l.remove(); });
      placeInline();
    }
    function wireHits(layer) {
      layer.querySelectorAll('.sb-hit[data-kind="text"]').forEach((el) => {
        el.addEventListener("click", () => {
          const rg = layer._regions.find((x) => x.kind === "text" && x.field === el.dataset.field);
          if (rg) openInline(el.dataset.field, rg, layer);
        });
      });
      layer.querySelectorAll('.sb-hit[data-kind="photo"]').forEach((el) => wirePhotoHit(el, layer));
    }
    /* A photograph on the page: drag moves the picture inside its frame,
       the wheel zooms it, a double-click steps through how it fills. The maths
       is drawPhoto's, run backwards, in millimetres. */
    function wirePhotoHit(el, layer) {
      const id = el.dataset.id, n = +el.dataset.n;
      const rg = () => layer._regions.find((x) => x.kind === "photo" && x.id === id && x.n === n);
      const pick = () => {
        closeInline(false);
        photoSel = { id, n };
        const entry = sel >= 0 ? book.pages[sel] : null;
        if (entry && entry.photos) { const k = entry.photos.findIndex((x) => x.id === id); if (k >= 0 && k !== active) { active = k; drawPhotoBlock(); } }
        layer.querySelectorAll(".sb-hit.photo").forEach((x) => x.classList.toggle("on", x === el));
        pageHint(isDiagram(id) ? "A lighting diagram is always shown whole." : "Drag to move the picture in its frame · scroll to zoom · double-click to change how it fills");
      };
      let img = null;
      const load = async () => { if (img) return img; const hit = library().byId.get(id); if (!hit) return null; try { img = await API.loadImage(previewSrc(hit.photo), cache); } catch (e) { img = null; } return img; };
      // How far a millimetre of drag moves the crop, for this photo in this box.
      const crop = (shot, box) => {
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        const mode = FIT_MODES.includes(shot.fit) ? shot.fit : "fill";
        const base = mode === "whole" ? Math.min(box.w / iw, box.h / ih) : mode === "width" ? box.w / iw : mode === "height" ? box.h / ih : Math.max(box.w / iw, box.h / ih);
        const scale = base * Math.min(3, Math.max(1, Number(shot.zoom) || 1));
        return { iw, ih, scale, sw: Math.min(iw, box.w / scale), sh: Math.min(ih, box.h / scale) };
      };
      el.addEventListener("pointerdown", async (ev) => {
        pick();
        const shot = shotFor(id); const region = rg();
        if (!shot || !region || isDiagram(id)) return;
        await load(); if (!img) return;
        const M = layerMathsFor(layer);
        const from = { x: ev.clientX, y: ev.clientY, sx: typeof shot.x === "number" ? shot.x : 0.5, sy: typeof shot.y === "number" ? shot.y : 0.35 };
        let moved = false;
        const move = (m) => {
          const dx = M.mmX(m.clientX - from.x), dy = M.mmY(m.clientY - from.y);
          if (!moved && Math.abs(m.clientX - from.x) < 3 && Math.abs(m.clientY - from.y) < 3) return;
          if (!moved) { moved = true; try { layer.setPointerCapture(m.pointerId); } catch (e) { /* older browsers */ } mark(); }
          const c = crop(shot, region.box);
          if (c.iw - c.sw > 0.5) shot.x = Math.round(Math.min(1, Math.max(0, from.sx - dx / c.scale / (c.iw - c.sw))) * 100) / 100;
          if (c.ih - c.sh > 0.5) shot.y = Math.round(Math.min(1, Math.max(0, from.sy - dy / c.scale / (c.ih - c.sh))) * 100) / 100;
          schedulePreview(40);
        };
        const up = () => {
          layer.removeEventListener("pointermove", move); layer.removeEventListener("pointerup", up); layer.removeEventListener("pointercancel", up);
          if (moved) { change({ rail: false, photos: true }); scheduleStrip(300); }
        };
        layer.addEventListener("pointermove", move); layer.addEventListener("pointerup", up); layer.addEventListener("pointercancel", up);
      });
      el.addEventListener("wheel", (ev) => {
        if (!photoSel || photoSel.id !== id || photoSel.n !== n) return;
        const shot = shotFor(id); if (!shot || isDiagram(id)) return;
        ev.preventDefault();
        mark(true);
        const z = Math.min(3, Math.max(1, (Number(shot.zoom) || 1) * (ev.deltaY < 0 ? 1.08 : 1 / 1.08)));
        shot.zoom = Math.round(z * 100) / 100;
        change({ rail: false, photos: true });
      }, { passive: false });
      el.addEventListener("dblclick", () => {
        const shot = shotFor(id); if (!shot || isDiagram(id)) return;
        mark();
        const order = ["", ...FIT_MODES];
        const next = order[(order.indexOf(shot.fit || "") + 1) % order.length];
        if (next) shot.fit = next; else delete shot.fit;
        change({ rail: false, photos: true });
        pageHint(`Now: ${({ "": "Auto", fill: "Fill", whole: "Whole", width: "Fit width", height: "Fit height" })[next]} · double-click again for the next`);
      });
    }
    // Screen pixels to page millimetres for a layer sitting on a page.
    function layerMathsFor(layer) {
      const G = geometry(book);
      const r = layer.getBoundingClientRect();
      return { G, r, mmX: (px) => (px / r.width) * G.W, mmY: (px) => (px / r.height) * G.H, px: r.width / G.W };
    }
    /* The box you type in, sitting exactly on the words, in the real font at
       the real size, with a small bar of the most used formatting above it. */
    function openInline(field, region, layer) {
      const host = textHost(field); if (!host) return;
      closeInline(false);
      photoSel = null;
      $$(".sb-hit.photo.on").forEach((x) => x.classList.remove("on"));
      const ta = document.createElement("textarea");
      ta.className = "sb-inline"; ta.id = "sbInline";
      ta.value = host.get(); ta.maxLength = host.max;
      ta.setAttribute("aria-label", `${field}, typed on the page`);
      ta.spellcheck = true; ta.autocapitalize = "sentences";
      if (host.line) ta.setAttribute("enterkeyhint", "done");
      editing = { field, region, host, ta, page: layer._page };
      layer.appendChild(ta);
      placeInline();
      ta.addEventListener("input", () => {
        const v = ta.value;
        mark(true);
        host.set(v);
        const panelBox = host.block != null ? $("#sbF_blocktext") : $(`#sbF_${host.key}`);
        if (panelBox && panelBox.value !== v) panelBox.value = v;
        change({ typing: true, rail: false }); patchRail();
      });
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); closeInline(true); return; }
        if (e.key === "Enter" && host.line) { e.preventDefault(); closeInline(true); return; }
        e.stopPropagation();
      });
      ta.addEventListener("blur", () => { setTimeout(() => {
        if (!editing || editing.ta !== ta) return;
        const a = document.activeElement;
        if (a === ta || (a && a.closest && (a.closest("#sbBar") || a.closest("#sbBarPick")))) return;
        closeInline(false);
      }, 120); });
      drawBar();
      schedulePreview(0);
      ta.focus({ preventScroll: true });
      try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { /* not a text control */ }
      pageHint("Type here · Esc when done");
    }
    // Keep the box on the words after every redraw, in the page's own type.
    function placeInline() {
      if (!editing) return;
      const box = $("#sbPreview"); if (!box) return;
      const { field, host, ta } = editing;
      const layer = $("#sbLayer") || box.querySelector(".sb-hits");
      if (!layer) return;
      if (ta.parentNode !== layer) layer.appendChild(ta);
      // The fresh region (the type may have changed size while typing).
      let region = null;
      if (host.block != null) {
        const entry = book.pages[sel], b = blocksOf(entry)[host.block]; if (!b) { closeInline(false); return; }
        const plan = planFree(book, entry), f = plan.fields[field];
        const G = geometry(book);
        region = { box: { x: b.x * G.Wa + G.ox, y: b.y * G.Ha + G.oy, w: b.w * G.Wa, h: b.h * G.Ha }, type: f && f.type };
      } else {
        const hits = [...box.querySelectorAll(".sb-hits")];
        for (const l of hits) { const rg = (l._regions || []).find((x) => x.kind === "text" && x.field === field); if (rg) { region = rg; if (ta.parentNode !== l) l.appendChild(ta); break; } }
      }
      if (!region) region = editing.region;
      editing.region = region;
      const M = layerMathsFor(ta.parentNode);
      const G = M.G, px = M.px;
      const t = region.type || {};
      const spec = t.spec || {};
      ta.style.left = `${(region.box.x / G.W * 100).toFixed(3)}%`;
      ta.style.top = `${(region.box.y / G.H * 100).toFixed(3)}%`;
      ta.style.width = `${(region.box.w / G.W * 100).toFixed(3)}%`;
      ta.style.height = `${(Math.max(region.box.h, (t.size || 4) * 1.4) / G.H * 100).toFixed(3)}%`;
      const size = (t.size || 4) * px, lead = (t.lead || (t.size || 4) * 1.3) * px;
      ta.style.font = `${spec.it ? "italic " : ""}${spec.w || 400} ${size.toFixed(2)}px/${lead.toFixed(2)}px ${spec.f || F.sans}`;
      ta.style.letterSpacing = `${((spec.sp || 0) * px).toFixed(2)}px`;
      ta.style.color = t.color || "#000";
      ta.style.textAlign = t.align === "justify" ? "left" : (t.align || "left");
      ta.classList.toggle("caps", !!(t.caps || spec.caps));
      drawBar();
    }
    function closeInline(refocusPanel) {
      const was = editing;
      editing = null; barBusy = false;
      const bar = $("#sbBar"); if (bar) bar.remove();
      const pick = $("#sbBarPick"); if (pick) pick.remove();
      if (!was) return;
      if (was.ta && was.ta.parentNode) was.ta.remove();
      flush();
      schedulePreview(0); scheduleStrip(300); updateMeters();
      pageHint("");
      if (refocusPanel) { const hit = $(`.sb-hit[data-field="${was.field}"]`) || $(`.sb-blk.on`); if (hit) hit.focus({ preventScroll: true }); }
    }
    // Font · size · bold · italic · alignment · more, above the box.
    let barBusy = false;    // a colour is being picked under the bar: leave it be
    function drawBar() {
      if (barBusy && $("#sbBar") && editing) return;
      const old = $("#sbBar"); if (old) old.remove();
      const oldPick = $("#sbBarPick"); if (oldPick) oldPick.remove();
      barBusy = false;
      if (!editing) return;
      const { host, ta, field } = editing;
      const entry = sel >= 0 ? book.pages[sel] : null;
      const allowed = entry
        ? [...Object.keys(fieldCaps()[entry.type] || {}), ...(((window.STUDIO_BOOK_LIMITS || {}).formatFields || {})[entry.type] || []), ...(entry.type === "free" ? ["t"] : [])]
        : (((window.STUDIO_BOOK_LIMITS || {}).formatFields || {}).cover || []);
      if (!allowed.includes(host.key)) return;
      const f = ((host.host.get() || {})[host.key]) || {};
      const bar = document.createElement("div");
      bar.id = "sbBar"; bar.className = "sb-bar"; bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Format");
      const pct = Math.round(sizeScale(f) * 100);
      const nowMm = textSizeMm(host.key);
      bar.innerHTML = `
        <select data-barfont aria-label="Font"><option value="">Style's font</option>${FONT_LIST.map((x) => `<option value="${x.key}" ${f.font === x.key ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
        <span class="sb-barsize"><button type="button" data-barsize="-10" aria-label="Smaller">−</button><output title="${pct}% of the style's size">${nowMm ? `${mmToPt(nowMm)} pt` : `${pct}%`}</output><button type="button" data-barsize="10" aria-label="Bigger">+</button></span>
        <button type="button" data-barcolour aria-expanded="false" aria-label="Colour"><i class="sb-bardot" style="background:${tintOf(f.color, colourway(book.colourway), (editing.region.type || {}).color || "#000")}"></i></button>
        <button type="button" data-barweight aria-pressed="${f.weight === "bold"}" aria-label="Bold"><b>B</b></button>
        <button type="button" data-baritalic aria-pressed="${!!f.italic}" aria-label="Italic"><i>I</i></button>
        <button type="button" data-baralign aria-label="Alignment: ${f.align || "auto"}">${({ "": "≡", left: "⫷", center: "☰", right: "⫸", justify: "☷" })[f.align || ""] || "≡"}</button>
        <button type="button" data-barmore aria-label="More formatting">⋯</button>`;
      ta.parentNode.appendChild(bar);
      // Above the box, or below it when the box is at the top of the page.
      const top = parseFloat(ta.style.top);
      bar.style.left = ta.style.left;
      if (top < 9) bar.style.top = `calc(${ta.style.top} + ${ta.style.height} + 6px)`; else bar.style.bottom = `calc(100% - ${ta.style.top} + 6px)`;
      const apply = (patch, keepBar = false) => {
        const all = { ...(host.host.get() || {}) };
        const one = { ...(all[host.key] || {}), ...patch };
        for (const key of Object.keys(one)) if (key !== "paras" && (!one[key] || (key === "size" && one[key] === 1))) delete one[key];
        if (Object.keys(one).length) all[host.key] = one; else delete all[host.key];
        host.host.set(Object.keys(all).length ? all : null);
        change({ rail: false });
        ensureBookFonts(book).then(() => { updateMeters(); schedulePreview(0); scheduleStrip(300); if (!keepBar) drawFields(); placeInline(); const dot = $("#sbBar [data-barcolour] i"); if (dot && patch.color !== undefined) dot.style.background = tintOf(patch.color, colourway(book.colourway), (editing && editing.region.type || {}).color || "#000"); });
      };
      const keep = () => { if (editing) editing.ta.focus({ preventScroll: true }); };
      bar.addEventListener("pointerdown", (e) => { if (e.target.tagName !== "SELECT") e.preventDefault(); });
      bar.querySelector("[data-barfont]").addEventListener("change", (e) => { mark(); apply({ font: e.target.value }); keep(); });
      bar.querySelectorAll("[data-barsize]").forEach((b) => b.addEventListener("click", () => { mark(true); apply({ size: Math.min(1.6, Math.max(0.6, Math.round((sizeScale(f) * 100 + (+b.dataset.barsize))) / 100)) }); keep(); }));
      bar.querySelector("[data-barcolour]").addEventListener("click", () => {
        const old = $("#sbBarPick");
        if (old) { old.remove(); barBusy = false; bar.querySelector("[data-barcolour]").setAttribute("aria-expanded", "false"); keep(); return; }
        const P = colourway(book.colourway);
        const pick = document.createElement("div"); pick.id = "sbBarPick"; pick.className = "sb-barpick";
        const sw = (key, label, c) => `<button type="button" class="sb-swatch" data-barsw="${key}" aria-pressed="${(f.color || "") === key}" title="${label}" aria-label="${label}"><i style="background:${c}"></i></button>`;
        pick.innerHTML = `<span class="sb-swatches" role="group" aria-label="The book's own colours">${sw("", "The style's colour", "linear-gradient(135deg, #fff 45%, #999 50%, #fff 55%)")}${sw("ink", "Ink", P.ink)}${sw("soft", "Soft", P.soft)}${sw("accent", "Accent", accentText(P))}${sw("paper", "Paper", P.paper)}${sw("white", "White", P.white)}${sw("deep", "Deep", P.deep)}</span>`;
        pick.appendChild(colourPicker(/^#/.test(f.color || "") ? f.color : "", (hex) => { f.color = hex; apply({ color: hex }, true); }));
        pick.querySelectorAll("[data-barsw]").forEach((b2) => b2.addEventListener("click", () => { mark(); f.color = b2.dataset.barsw; apply({ color: b2.dataset.barsw }, true); pick.querySelectorAll("[data-barsw]").forEach((x) => x.setAttribute("aria-pressed", String(x === b2))); }));
        pick.style.left = bar.style.left; pick.style.top = bar.style.bottom ? `calc(${ta.style.top} + 4px)` : `calc(${ta.style.top} + ${ta.style.height} + 46px)`;
        ta.parentNode.appendChild(pick);
        barBusy = true;
        bar.querySelector("[data-barcolour]").setAttribute("aria-expanded", "true");
        mark();
      });
      bar.querySelector("[data-barweight]").addEventListener("click", () => { mark(); apply({ weight: f.weight === "bold" ? "" : "bold" }); keep(); });
      bar.querySelector("[data-baritalic]").addEventListener("click", () => { mark(); apply({ italic: !f.italic }); keep(); });
      bar.querySelector("[data-baralign]").addEventListener("click", () => { mark(); const order = ["", "left", "center", "right", "justify"]; apply({ align: order[(order.indexOf(f.align || "") + 1) % order.length] }); keep(); });
      bar.querySelector("[data-barmore]").addEventListener("click", () => {
        // The full panel, opened at this text.
        setTabPage();
        const wrap = $(`[data-fmt="${host.key}"]`);
        if (wrap) { const t = wrap.querySelector(".sb-fmttoggle"), r = wrap.querySelector(".sb-fmtrow"); if (r && r.hidden && t) t.click(); wrap.scrollIntoView({ block: "center", behavior: "smooth" }); }
      });
    }

    function openAdd() {
      const menu = $("#sbAddMenu");
      const count = renderedCount(book);
      menu.innerHTML = `
        <div class="sb-addhead"><strong>Add a page</strong><button type="button" class="sb-btn quiet" id="sbAddClose">Close</button></div>
        <p class="sb-hint">It goes after the page you're on. ${count} of ${MAX_PAGES} pages used.</p>
        ${ADD_MENU.map((g) => `<div class="sb-addgroup"><h3>${esc(g.group)}</h3><div class="sb-additems">${g.items.map(([type, name, note]) => `
          <button type="button" class="sb-additem" data-add="${type}" ${count + pageSpan({ type }) > MAX_PAGES ? "disabled" : ""}><b>${esc(name)}</b><span>${esc(note)}</span></button>`).join("")}</div></div>`).join("")}`;
      menu.hidden = false;
      $("#sbAddToggle").setAttribute("aria-expanded", "true");
      menu.querySelector("#sbAddClose").addEventListener("click", closeAdd);
      menu.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => { closeAdd(false); addPage(b.dataset.add); }));
      const first = menu.querySelector("[data-add]:not(:disabled)"); if (first) first.focus();
    }
    function closeAdd(refocus = true) {
      const menu = $("#sbAddMenu"); if (!menu) return;
      menu.hidden = true;
      $("#sbAddToggle").setAttribute("aria-expanded", "false");
      if (refocus) $("#sbAddToggle").focus();
    }

    function addPage(want) {
      // An Anything page can arrive empty or as one of the arrangements.
      const [type, start] = String(want).split(":");
      const extra = pageSpan({ type });
      mark();
      if (renderedCount(book) + extra > MAX_PAGES) { API.toast(`A book holds ${MAX_PAGES} pages at most, cover included.`); return; }
      const entry = { type };
      if (type === "free") entry.blocks = (FREE_STARTS[start] || []).map((b) => ({ ...b, ...(b.k === "text" ? { t: "" } : {}), ...(b.style ? { style: { ...b.style } } : {}) }));
      if (["photos", "spread", "story", "note", "quote", "feature", "article"].includes(type)) entry.photos = [];
      if (type === "divider") { entry.heading = "Selected work"; entry.line = ""; }
      // Writing pages start empty: nothing is ever written for the studio.
      for (const k of Object.keys((fieldCaps()[type]) || {})) if (WRITING[type]) entry[k] = "";
      // The two "how we work" pages are the exception: they arrive with the
      // studio's own words, in boxes, ready to be changed.
      if (type === "ways") Object.assign(entry, { kicker: WAYS_COPY.kicker, heading: WAYS_COPY.heading, intro: WAYS_COPY.intro, items: WAYS_COPY.items.map((x) => ({ ...x })) });
      if (type === "process") { const c = PROCESS_COPY.pitch; Object.assign(entry, { way: "pitch", kicker: c.kicker, heading: c.heading, intro: c.intro, note: c.note, steps: c.steps.map((x) => ({ ...x })) }); }
      const at = sel < 0 ? 0 : sel + 1;
      book.pages.splice(at, 0, entry);
      flush();
      closeInline(false); photoSel = null; pageHint("");
      sel = at; active = 0; pickerOpen = null; blockSel = -1;
      setTabPage();
      change({ rail: true });
      drawInspector();
      // On a laptop the first box is ready to type in; on a phone the keyboard
      // would cover the new page, so it just scrolls into view.
      const first = $("#sbPanelPage [data-field]");
      if (first && matchMedia("(pointer: fine)").matches && type !== "note") first.focus();
    }
    const fieldCaps = () => ((window.STUDIO_BOOK_LIMITS && window.STUDIO_BOOK_LIMITS.fields) || {});
    function setTabPage() { const t = $("#sbTabPage"); if (t && tab !== "page") t.click(); }

    function select(i) {
      if (i === sel) return;
      closeAdd(false);
      flush();
      const fromRail = document.activeElement && document.activeElement.closest && document.activeElement.closest("#sbPages");
      closeInline(false); photoSel = null; pageHint(""); drawing = false;
      sel = i; active = 0; pickerOpen = null; blockSel = -1;
      drawRail(); drawInspector(); schedulePreview(0);
      remember();
      // Bring the page into view inside the rail only; scrolling the window
      // would push the buttons under the site's fixed header on a phone.
      const cur = $(".sb-pg[aria-current=true]"), list = $("#sbPages");
      if (cur && list) {
        const a = cur.closest("li").getBoundingClientRect(), b = list.getBoundingClientRect();
        if (list.scrollWidth > list.clientWidth + 1) list.scrollLeft += (a.left - b.left) - (b.width - a.width) / 2;
        else list.scrollTop += (a.top - b.top) - (b.height - a.height) / 2;
      }
      if (fromRail && cur) cur.focus({ preventScroll: true });
      // On a phone the site's header floats over the page: if the preview has
      // slid under it (or off the bottom), bring it back into view.
      if (matchMedia("(pointer: coarse)").matches) {
        const stage = $(".sb-stage");
        const top = stage ? stage.getBoundingClientRect().top : 0;
        const under = 128;                                  // the fixed header
        if (stage && (top < under - 6 || top > window.innerHeight * 0.55)) window.scrollBy(0, top - under);
      }
    }

    /* --- the pages rail --- */
    const wordsOf = (pg) => oneParagraph(pg.headline || pg.title || pg.heading || pg.quote || pg.body || pg.note || pg.sub1 || pg.text1 || "");
    const rowsOf = (pg) => [...(pg.items || []), ...(pg.steps || [])];
    function railLabel(pg) {
      if (!pg) return book.title ? `Cover · ${book.title}` : "Cover";
      if (pg.type === "process") return `${PAGE_LABEL.process} · ${(PROCESS_COPY[pg.way] || {}).menuName || "one way"}`;
      if (WRITING[pg.type]) { const w = wordsOf(pg); return w.length ? `${PAGE_LABEL[pg.type]} · “${w.slice(0, 6).join(" ")}”` : PAGE_LABEL[pg.type]; }
      if (pg.type === "photos" || pg.type === "spread") return `${PAGE_LABEL[pg.type]} · ${(pg.photos || []).length}`;
      if (pg.type === "divider") return pg.heading ? `Chapter · ${pg.heading}` : "Chapter page";
      if (pg.type === "free") return (pg.blocks || []).length ? `${PAGE_LABEL.free} · ${pg.blocks.length}` : "Empty page";
      return PAGE_LABEL[pg.type] || pg.type;
    }
    // The page that faces this one in the printed book: the cover sits alone,
    // then even numbers on the left face odd numbers on the right. Returns
    // the entry indices to draw, left to right.
    function facing(i) {
      if (i < 0) return [-1];
      const nums = [];
      let n = 1;
      book.pages.forEach((pg, k) => { const first = n + 1; n += pageSpan(pg); nums.push({ k, first, last: n }); });
      const me = nums.find((x) => x.k === i); if (!me) return [i];
      if (me.last > me.first) return [i];                       // a spread is its own pair
      const wantN = me.first % 2 === 0 ? me.first + 1 : me.first - 1;
      const other = nums.find((x) => x.first === wantN && x.last === wantN);
      if (wantN === 1) return [-1, i];
      if (!other) return [i];
      return me.first % 2 === 0 ? [i, other.k] : [other.k, i];
    }
    /* Reading it through: the current pair, large, on a dark ground. Arrow
       keys and the buttons turn the pages; Esc closes it. */
    let readAt = 0;
    function openRead() {
      closeInline(false);
      const old = $("#sbRead"); if (old) old.remove();
      const el = document.createElement("div");
      el.id = "sbRead"; el.className = "sb-read"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Reading the book");
      el.innerHTML = `<div class="sb-readbar"><button type="button" class="sb-btn quiet" id="sbReadClose">Close</button><strong id="sbReadTitle"></strong><span>${esc(book.name)}</span></div>
        <div class="sb-readpages" id="sbReadPages"><p class="sb-hint" style="color:#aaa">Drawing…</p></div>
        <button type="button" class="sb-readnav prev" id="sbReadPrev" aria-label="Previous">‹</button><button type="button" class="sb-readnav next" id="sbReadNext" aria-label="Next">›</button>`;
      root.appendChild(el);
      readAt = sel;
      el.querySelector("#sbReadClose").addEventListener("click", closeRead);
      el.querySelector("#sbReadPrev").addEventListener("click", () => turnRead(-1));
      el.querySelector("#sbReadNext").addEventListener("click", () => turnRead(1));
      el.addEventListener("click", (e) => { if (e.target === el.querySelector("#sbReadPages")) turnRead(1); });
      drawRead();
      el.querySelector("#sbReadNext").focus();
    }
    function closeRead() { const el = $("#sbRead"); if (el) el.remove(); const b = $("#sbReadBtn"); if (b) b.focus(); }
    function turnRead(by) {
      const pair = facing(readAt);
      let next = readAt;
      if (by > 0) { const last = Math.max(...pair); next = last + 1; if (next >= book.pages.length) return; }
      else { const first = Math.min(...pair); next = first - 1; if (next < -1) return; }
      readAt = next; drawRead();
    }
    async function drawRead() {
      const box = $("#sbReadPages"); if (!box) return;
      const pair = facing(readAt);
      const got = [];
      for await (const r of renderPages(book, { dpi: 110, cache, only: pair })) { got.push(r); if (!$("#sbReadPages")) return; }
      got.forEach((r) => { r.page.canvas.setAttribute("role", "img"); r.page.canvas.setAttribute("aria-label", `Page ${r.n}`); });
      box.replaceChildren(...got.map((r) => r.page.canvas));
      const t = $("#sbReadTitle"); if (t) t.textContent = got.length > 1 ? `Pages ${pad2(got[0].n)}–${pad2(got[got.length - 1].n)}` : `Page ${pad2(got[0] ? got[0].n : 1)}`;
      const prev = $("#sbReadPrev"), next = $("#sbReadNext");
      if (prev) prev.disabled = Math.min(...pair) <= -1;
      if (next) next.disabled = Math.max(...pair) >= book.pages.length - 1;
    }
    // A two-page spread or story only sits side by side when it starts on a
    // left-hand page — an even number, the cover being 1. Started on an odd
    // page, its halves land either side of a page turn.
    function firstPageOf(i) {
      let n = 1;
      for (let k = 0; k < book.pages.length; k++) { const first = n + 1; if (k === i) return first; n += pageSpan(book.pages[k]); }
      return -1;
    }
    const splitByTurn = (i) => { const pg = book.pages[i]; return !!pg && pageSpan(pg) === 2 && firstPageOf(i) % 2 === 1; };
    // The fix: an empty page before it, so it starts on an even page.
    function padBefore(i) {
      if (renderedCount(book) + 1 > MAX_PAGES) { API.toast(`A book holds ${MAX_PAGES} pages at most, cover included.`); return; }
      mark();
      book.pages.splice(i, 0, { type: "free", blocks: [] });
      sel = i + 1; active = 0; blockSel = -1;
      change({ rail: true }); drawInspector(); remember();
      API.toast("An empty page went in before it · Ctrl+Z to undo");
    }
    const splitHtml = (i) => (splitByTurn(i) ? `<p class="sb-warn" id="sbSplit">This starts on page ${pad2(firstPageOf(i))}, a right-hand page, so its two halves would be on either side of a page turn. Move it, or put a page before it, so it starts on an even page.</p>
      <p><button type="button" class="sb-btn" id="sbPadBefore">Put an empty page before it</button></p>` : "");
    const wireSplit = (i) => { const b = $("#sbPadBefore"); if (b) b.addEventListener("click", () => padBefore(i)); };
    function pageNumbers() {
      const out = [{ i: -1, n: "01", entry: null }];
      let n = 1;
      book.pages.forEach((pg, i) => {
        const first = n + 1; n += pageSpan(pg);
        out.push({ i, entry: pg, n: pageSpan(pg) === 2 ? `${pad2(first)}–${pad2(n)}` : pad2(first) });
      });
      return out;
    }
    function drawRail() {
      const list = $("#sbPages"); if (!list) return;
      list.innerHTML = pageNumbers().map((it) => `
        <li data-i="${it.i}" class="${sel === it.i ? "sel" : ""}">
          <button type="button" class="sb-pg" data-sel="${it.i}" aria-current="${sel === it.i}">
            <span class="sb-pgimg" aria-hidden="true"></span>
            <span class="sb-pglabel"><b>${it.n}</b><span>${esc(railLabel(it.entry))}</span><i class="sb-chip" ${tooLong.get(it.entry || COVER) ? "" : "hidden"}>too long</i>${it.i >= 0 && splitByTurn(it.i) ? `<i class="sb-chip">split by a turn</i>` : ""}</span>
          </button>
          ${sel === it.i && it.i >= 0 ? `<span class="sb-pgacts">
            <button type="button" data-up="${it.i}" aria-label="Move this page earlier" ${it.i === 0 ? "disabled" : ""}>↑</button>
            <button type="button" data-down="${it.i}" aria-label="Move this page later" ${it.i === book.pages.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" data-dupe="${it.i}" aria-label="Duplicate this page" title="Duplicate" ${renderedCount(book) + pageSpan(it.entry) > MAX_PAGES ? "disabled" : ""}>⧉</button>
            <button type="button" data-rm="${it.i}" aria-label="Remove this page">✕</button>
          </span>` : ""}
        </li>`).join("");
      list.querySelectorAll("li").forEach((li) => {
        const i = +li.dataset.i;
        const c = thumbs.get(i < 0 ? COVER : book.pages[i]);
        if (c) li.querySelector(".sb-pgimg").replaceChildren(...c);
      });
      list.querySelectorAll("[data-sel]").forEach((b) => b.addEventListener("click", () => select(+b.dataset.sel)));
      list.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => { const i = +b.dataset.up; mark(); [book.pages[i - 1], book.pages[i]] = [book.pages[i], book.pages[i - 1]]; sel = i - 1; change(); drawInspector(); focusAct("up"); }));
      list.querySelectorAll("[data-down]").forEach((b) => b.addEventListener("click", () => { const i = +b.dataset.down; mark(); [book.pages[i + 1], book.pages[i]] = [book.pages[i], book.pages[i + 1]]; sel = i + 1; change(); drawInspector(); focusAct("down"); }));
      list.querySelectorAll("[data-dupe]").forEach((b) => b.addEventListener("click", () => {
        const i = +b.dataset.dupe, pg = book.pages[i];
        if (renderedCount(book) + pageSpan(pg) > MAX_PAGES) { API.toast(`A book holds ${MAX_PAGES} pages at most, cover included.`); return; }
        mark();
        book.pages.splice(i + 1, 0, JSON.parse(JSON.stringify(pg)));
        sel = i + 1; active = 0; blockSel = -1;
        change(); drawInspector(); remember();
        API.toast("Page duplicated · Ctrl+Z to undo");
        focusAct("dupe");
      }));
      wireRailDrag(list);
      list.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
        const i = +b.dataset.rm;
        const pg = book.pages[i];
        const words = Object.keys(fieldCaps()[pg.type] || {}).reduce((n, k) => n + (pg.type === "photos" ? 0 : oneParagraph(pg[k]).length), 0)
          + rowsOf(pg).reduce((n, row) => n + Object.values(row).reduce((m, v) => m + (typeof v === "string" ? oneParagraph(v).length : 0), 0), 0);
        const photos = (pg.photos || []).length;
        const what = [photos ? `${photos} photo${photos === 1 ? "" : "s"}` : "", words ? `${words} word${words === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
        // No "are you sure?": it goes, and Undo brings it back with everything on it.
        mark();
        const n = (pageNumbers().find((x) => x.i === i) || {}).n;
        book.pages.splice(i, 1);
        sel = Math.min(i, book.pages.length - 1);
        active = 0; blockSel = -1;
        change(); drawInspector(); remember();
        API.toast(`Removed page ${n}${what ? ` and its ${what}` : ""} · Ctrl+Z to undo`);
        focusAct("rm");
      }));
      remember();
      const count = renderedCount(book);
      const c = $("#sbCount"); if (c) c.textContent = `${count}/${MAX_PAGES}`;
      const prev = $("#sbPrev"), next = $("#sbNext");
      if (prev) prev.disabled = sel <= -1;
      if (next) next.disabled = sel >= book.pages.length - 1;
      const it = pageNumbers().find((x) => x.i === sel);
      const title = $("#sbStageTitle"); if (title && it) title.textContent = `Page ${it.n} · ${it.entry ? PAGE_LABEL[it.entry.type] : "Cover"}`;
    }
    const focusAct = (kind) => { const b = $(`[data-${kind}="${sel}"]`); if (b && !b.disabled) b.focus(); else { const s = $(`.sb-pg[data-sel="${sel}"]`); if (s) s.focus(); } };
    /* Drag a page's little picture up or down the rail (sideways on a phone)
       to move it. A short press still just selects it; a drag starts after
       the pointer has moved a little, and on a phone after a moment's hold. */
    function wireRailDrag(list) {
      list.querySelectorAll(".sb-pg[data-sel]").forEach((btn) => {
        btn.addEventListener("pointerdown", (ev) => {
          const from = +btn.dataset.sel; if (from < 0) return;
          const coarse = ev.pointerType === "touch";
          const start = { x: ev.clientX, y: ev.clientY, t: Date.now() };
          let dragging = false, ghost = null, over = null;
          const items = () => [...list.querySelectorAll("li[data-i]")].filter((li) => +li.dataset.i >= 0);
          // Sideways when the pages sit beside each other (the phone's strip),
          // up and down when they stack: judged from where they are, not from
          // an overflow a wide selected page can cause.
          const horizontal = () => { const it = items(); if (it.length < 2) return getComputedStyle(list).display === "flex"; const a = it[0].getBoundingClientRect(), b2 = it[1].getBoundingClientRect(); return b2.left >= a.right - 2; };
          const move = (m) => {
            const dx = m.clientX - start.x, dy = m.clientY - start.y;
            if (!dragging) {
              if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
              if (coarse && Date.now() - start.t < 220) { stop(); return; }   // a swipe to scroll, not a drag
              dragging = true;
              try { list.setPointerCapture(m.pointerId); } catch (e) { /* older browsers */ }
              ghost = btn.closest("li"); ghost.classList.add("dragging");
              list.classList.add("reordering");
            }
            m.preventDefault();
            const h = horizontal();
            over = null;
            for (const li of items()) {
              const r = li.getBoundingClientRect();
              const before = h ? m.clientX < r.left + r.width / 2 : m.clientY < r.top + r.height / 2;
              li.classList.remove("drop-before", "drop-after");
              if (!over && (h ? m.clientX < r.right : m.clientY < r.bottom)) { over = { i: +li.dataset.i, before, li }; }
            }
            if (!over) { const last = items().slice(-1)[0]; if (last) over = { i: +last.dataset.i, before: false, li: last }; }
            if (over) over.li.classList.add(over.before ? "drop-before" : "drop-after");
          };
          const stop = () => {
            list.removeEventListener("pointermove", move); list.removeEventListener("pointerup", up); list.removeEventListener("pointercancel", up);
            list.classList.remove("reordering");
            items().forEach((li) => li.classList.remove("dragging", "drop-before", "drop-after"));
          };
          const up = () => {
            const was = dragging; const target = over; stop();
            if (!was || !target) return;
            let to = target.i + (target.before ? 0 : 1);
            if (to > from) to -= 1;
            if (to === from) return;
            mark();
            const [pg] = book.pages.splice(from, 1);
            book.pages.splice(to, 0, pg);
            sel = to; active = 0; blockSel = -1;
            change(); drawInspector(); remember();
            const s2 = $(`.sb-pg[data-sel="${sel}"]`); if (s2) s2.focus({ preventScroll: true });
          };
          list.addEventListener("pointermove", move); list.addEventListener("pointerup", up); list.addEventListener("pointercancel", up);
        });
      });
    }
    function patchRail() {
      const it = pageNumbers().find((x) => x.i === sel); if (!it) return;
      const li = $(`#sbPages li[data-i="${sel}"]`); if (!li) return;
      li.querySelector(".sb-pglabel span").textContent = railLabel(it.entry);
    }
    function setChip(entry, on) {
      tooLong.set(entry || COVER, on);
      const i = entry ? book.pages.indexOf(entry) : -1;
      const chip = $(`#sbPages li[data-i="${i}"] .sb-chip`); if (chip) chip.hidden = !on;
    }

    /* --- previews --- */
    function schedulePreview(ms) { clearTimeout(previewTimer); previewTimer = setTimeout(drawPreview, ms); }
    function scheduleStrip(ms) { clearTimeout(stripTimer); stripTimer = setTimeout(drawStrip, ms); }
    async function drawPreview() {
      const token = ++renderToken;
      const box = $("#sbPreview"); if (!box || !book) return;
      try {
        const got = [];
        const only = view.two ? facing(sel) : sel;
        for await (const r of renderPages(book, { dpi: 72, cache, only, guides: true, skip: editing ? editing.field : null })) { got.push(r); if (token !== renderToken) return; }
        if (token !== renderToken) return;
        got.forEach((r) => {
          r.page.canvas.setAttribute("role", "img"); r.page.canvas.setAttribute("aria-label", `Page ${r.n} preview`);
          // The facing page is there to look at; a tap on it makes it the page being edited.
          if (r.index !== sel) { r.page.canvas.classList.add("facing"); r.page.canvas.addEventListener("click", () => select(r.index)); }
        });
        box.classList.toggle("two", got.length > 1);
        box.classList.toggle("zoom", view.zoom);
        box.querySelectorAll("canvas, p").forEach((c) => c.remove());
        box.prepend(...got.map((r) => r.page.canvas));
        lastRender = got.filter((r) => r.index === sel);
        lastFacing = got.find((r) => r.index !== sel) || null;
        // The size-in-points boxes read from the page just drawn.
        $$("[data-fmtpt]").forEach((el) => { if (document.activeElement === el) return; const mm = textSizeMm(el.dataset.fmtpt); if (mm) el.value = mmToPt(mm); });
        drawLayer();
        drawHits(lastRender);
        // Pages that aren't planned (About, chapter pages) report their cuts
        // as they draw.
        const entry = sel >= 0 ? book.pages[sel] : null;
        if (entry && !WRITING[entry.type] && entry.type !== "photos") {
          const cuts = got.flatMap((r) => r.page.cuts || []);
          setChip(entry, cuts.length > 0);
          const warn = $("#sbPageWarn");
          if (warn) { warn.hidden = !cuts.length; warn.textContent = cuts.length ? `Too long: the ${cuts.map((c) => c.label).join(" and the ")} won't all print. Shorten it until this goes.` : ""; }
        }
      } catch (err) {
        box.innerHTML = `<p class="sb-warn">Could not draw this page (${esc(err.message || err)}).</p>`;
      }
    }
    async function drawStrip() {
      const token = ++stripToken;
      if (!book) return;
      const groups = new Map();
      try {
        for await (const r of renderPages(book, { dpi: 22, cache })) {
          if (token !== stripToken) return;
          const key = r.index < 0 ? COVER : book.pages[r.index];
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(r.page.canvas);
          if (key !== COVER && (WRITING[key.type] || key.type === "free" || key.type === "photos" || key.type === "about" || key.type === "divider")) {
            // A two-page story is too long if either of its pages is.
            if (r.half === undefined || r.half === 0) tooLong.set(key, !!(r.page.cuts && r.page.cuts.length));
            else if (r.page.cuts && r.page.cuts.length) tooLong.set(key, true);
          }
        }
      } catch (e) { return; /* the strip is an overview; the large preview reports errors */ }
      if (token !== stripToken) return;
      for (const [key, canvases] of groups) thumbs.set(key, canvases);
      $$("#sbPages li").forEach((li) => {
        const i = +li.dataset.i;
        const key = i < 0 ? COVER : book.pages[i];
        const c = groups.get(key); if (c) li.querySelector(".sb-pgimg").replaceChildren(...c);
        const chip = li.querySelector(".sb-chip"); if (chip) chip.hidden = !tooLong.get(key);
      });
    }

    /* --- the inspector: this page --- */
    function drawInspector() {
      const panel = $("#sbPanelPage"); if (!panel) return;
      const entry = sel >= 0 ? book.pages[sel] : null;
      const photoFirst = entry && entry.type === "note";
      panel.innerHTML = `
        <div class="sb-sec" id="sbPageHead"></div>
        ${photoFirst ? `<div class="sb-sec" id="sbPhotoBlock"></div><div class="sb-sec" id="sbFields"></div>` : `<div class="sb-sec" id="sbFields"></div><div class="sb-sec" id="sbPhotoBlock"></div>`}
        <div class="sb-sec" id="sbPageBg"></div>
        <p class="sb-warn" id="sbPageWarn" hidden></p>`;
      const head = $("#sbPageHead");
      const about = {
        cover: "The first page. Your headshot can go here when you have one: it fills the cover's empty area and nothing else moves.",
        photos: "Tap photos below to add them, tap again to remove. Up to six; the layout follows how many there are and their shapes. With four or more, three can sit in one row on top or at the bottom.",
        spread: "One photograph across two facing pages. A landscape frame works best, with nobody's face on the fold.",
        divider: "A quiet page between sections, e.g. “Fashion & editorial” before your fashion work.",
        about: "Your words about the studio. With none typed, the page uses a plain description of the studio.",
        services: "Lists the kinds of shoot that are live on your site.",
        contact: "Your email, Instagram, website and booking link, with a QR code to the booking form.",
        story: "A magazine opener: a headline, an intro and a short story about a shoot or a brief, with a photo if you like.",
        note: "Writing about one picture: the photo large, a title, a few lines, and a detail line.",
        quote: "One sentence set large: a client's or model's real words, or your own belief about photography.",
        letter: "A page of your own writing, signed: a foreword to the book or a note to one brand.",
        feature: "A photo beside words, then words beside a photo. Choose which side the first photo sits on.",
        article: "Two facing pages: your story on one, one photograph filling the other. Choose which side the photo page goes.",
        ways: "All four ways of working, side by side, with who leads the ideas and the ways you like best marked.",
        process: "One way of working, step by step, marking each step as yours, together, or the studio's.",
        free: "Yours to arrange. Add words, photographs, colour blocks and lines, then drag them on the page."
      };
      const kind = entry ? entry.type : "cover";
      head.innerHTML = `<h3>${esc(entry ? PAGE_LABEL[entry.type] : "Cover")}</h3><p class="sb-hint">${esc(about[kind] || "")}</p>`;
      drawFields(); drawPhotoBlock(); drawPageBg(); updateMeters();
    }
    /* The colour behind this page. Absent, it is the book's (set on Design),
       and failing that the style's own. The cover keeps its own look; an
       Anything page has this among its own controls. */
    function drawPageBg() {
      const box = $("#sbPageBg"); if (!box) return;
      const entry = sel >= 0 ? book.pages[sel] : null;
      if (!entry || entry.type === "free") { box.innerHTML = ""; box.hidden = true; return; }
      box.hidden = false;
      const P = colourway(book.colourway);
      const sw = (key, label, c, on) => `<button type="button" class="sb-swatch" data-pgbg="${key}" aria-pressed="${on}" title="${esc(label)}" aria-label="${esc(label)}"><i style="background:${c}"></i></button>`;
      const fills = [["paper", "Paper", P.paper], ["white", "White", P.white], ["ink", "Ink", P.ink], ["soft", "Soft", P.soft], ["accent", "Accent", P.accent], ["deep", "Deep", P.deep], ["rule", "Hairline", P.rule]];
      box.innerHTML = `<h3>Page colour</h3>
        <span class="sb-swatches" role="group" aria-label="Page colour">${sw("", book.bg ? "The book's colour" : "The style's own", book.bg ? blockColor(book.bg, P, P.paper) : "linear-gradient(135deg, #fff 45%, #999 50%, #fff 55%)", !entry.bg)}${fills.map(([k, n, c]) => sw(k, n, c, entry.bg === k)).join("")}${anySwatch("pgbgany", /^#/.test(entry.bg || "") ? entry.bg : "")}</span>
        <div class="sb-cphost" data-pgbgpick hidden></div>
        <p class="sb-hint">${entry.bg ? "This page only. " : ""}For every page at once, use Page colour on Design.</p>`;
      box.querySelectorAll("[data-pgbg]").forEach((x) => x.addEventListener("click", () => { mark(); if (x.dataset.pgbg) entry.bg = x.dataset.pgbg; else delete entry.bg; change({ rail: true }); drawPageBg(); const again = $(`[data-pgbg="${x.dataset.pgbg}"]`); if (again) again.focus(); }));
      wireAny($("[data-pgbgany]"), $("[data-pgbgpick]"), () => (/^#/.test(entry.bg || "") ? entry.bg : ""), (hex) => { mark(true); entry.bg = hex; box.querySelectorAll("[data-pgbg]").forEach((x) => x.setAttribute("aria-pressed", "false")); change({ rail: true }); });
    }

    // The small "Format" control under a text's label: font, colour, alignment.
    const styleHost = (entry) => (entry
      ? { get: () => entry.style, set: (v) => { if (v) entry.style = v; else delete entry.style; } }
      : { get: () => book.coverStyle, set: (v) => { if (v) book.coverStyle = v; else delete book.coverStyle; } });
    /* ---------- any colour ------------------------------------------------
       Two kinds of colour everywhere a colour is chosen: the book's own
       (ink, soft, accent, paper, white, deep — they follow the colourway), and
       any colour at all, picked by eye on a square (how strong, how bright)
       and a strip (the hue), or typed as #rrggbb. Stored as before. */
    const hexToHsv = (hex) => {
      const m = /^#([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return { h: 20, s: 0.8, v: 0.8 };
      const r = parseInt(m[1].slice(0, 2), 16) / 255, g = parseInt(m[1].slice(2, 4), 16) / 255, b = parseInt(m[1].slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      let h = 0;
      if (d) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h = (h * 60 + 360) % 360; }
      return { h, s: max ? d / max : 0, v: max };
    };
    const hsvToHex = (h, s, v) => {
      const f = (n) => { const k = (n + h / 60) % 6; const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, "0"); };
      return `#${f(5)}${f(3)}${f(1)}`;
    };
    function colourPicker(hex, onChange) {
      const st = hexToHsv(hex);
      const el = document.createElement("div"); el.className = "sb-cpick";
      el.innerHTML = `<div class="sb-cpsat" role="slider" aria-label="How strong and how bright" tabindex="0"><i class="sb-cpdot"></i></div>
        <input type="range" class="sb-cphue" min="0" max="360" step="1" value="${Math.round(st.h)}" aria-label="Hue">
        <div class="sb-cprow"><i class="sb-cpprev"></i><input type="text" class="sb-cphex" maxlength="7" value="${/^#[0-9a-f]{6}$/i.test(hex || "") ? hex : hsvToHex(st.h, st.s, st.v)}" aria-label="The colour as #rrggbb" spellcheck="false" autocapitalize="off"><span>or type it</span></div>`;
      const sat = el.querySelector(".sb-cpsat"), dot = el.querySelector(".sb-cpdot"), hue = el.querySelector(".sb-cphue"), prev = el.querySelector(".sb-cpprev"), hexIn = el.querySelector(".sb-cphex");
      const paint = () => {
        sat.style.background = `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${st.h}, 100%, 50%))`;
        dot.style.left = `${(st.s * 100).toFixed(1)}%`; dot.style.top = `${((1 - st.v) * 100).toFixed(1)}%`;
        const cur = hsvToHex(st.h, st.s, st.v);
        prev.style.background = cur;
        if (document.activeElement !== hexIn) hexIn.value = cur;
        return cur;
      };
      const emit = () => onChange(paint());
      const fromPoint = (ev) => { const r = sat.getBoundingClientRect(); st.s = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)); st.v = Math.min(1, Math.max(0, 1 - (ev.clientY - r.top) / r.height)); emit(); };
      sat.addEventListener("pointerdown", (ev) => {
        ev.preventDefault(); sat.focus({ preventScroll: true });
        try { sat.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ }
        fromPoint(ev);
        const mv = (m) => fromPoint(m);
        const up = () => { sat.removeEventListener("pointermove", mv); sat.removeEventListener("pointerup", up); sat.removeEventListener("pointercancel", up); };
        sat.addEventListener("pointermove", mv); sat.addEventListener("pointerup", up); sat.addEventListener("pointercancel", up);
      });
      sat.addEventListener("keydown", (e) => {
        const k = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, 0.02], ArrowDown: [0, -0.02] }[e.key]; if (!k) return;
        e.preventDefault(); st.s = Math.min(1, Math.max(0, st.s + k[0])); st.v = Math.min(1, Math.max(0, st.v + k[1])); emit();
      });
      hue.addEventListener("input", () => { st.h = +hue.value; emit(); });
      hexIn.addEventListener("input", () => {
        const v = hexIn.value.trim();
        if (!/^#?[0-9a-f]{6}$/i.test(v)) return;
        const got = hexToHsv(v.startsWith("#") ? v : `#${v}`);
        st.h = got.h; st.s = got.s; st.v = got.v; hue.value = String(Math.round(st.h));
        onChange(paint());
      });
      paint();
      return el;
    }
    // How big a text prints right now, in millimetres, from the page last drawn.
    function textSizeMm(k) {
      const entry = sel >= 0 ? book.pages[sel] : null;
      const r = lastRender[0]; if (!r || !r.page) return null;
      if (entry && entry.type === "free") { const f = r.page.plan && r.page.plan.fields[`b${blockSel}`]; return f && f.type ? f.type.size : null; }
      const f = r.page.plan && r.page.plan.fields[k];
      if (f && f.type) return f.type.size;
      const t = (r.page.texts || []).find((x) => x.field === k);
      return t && t.type ? t.type.size : null;
    }
    const mmToPt = (mm) => Math.round(mm * geometry(book).s * 72 / 25.4 * 2) / 2;
    // The scale that makes a text print at `pt`, given the scale it has now.
    const scaleForPt = (k, pt, f) => {
      const now = textSizeMm(k); if (!now) return null;
      const base = now / sizeScale(f);
      const want = (pt / (72 / 25.4)) / geometry(book).s / base;
      return Math.round(Math.min(1.6, Math.max(0.6, want)) * 100) / 100;
    };
    // The "any colour" swatch: a rainbow until a colour is chosen, then that colour.
    const anySwatch = (attr, hex, extra = "") => `<button type="button" class="sb-swatch sb-any" data-${attr} aria-pressed="${!!hex}" aria-expanded="false" title="Any colour" aria-label="Any colour" ${extra}><i style="background:${hex || "conic-gradient(#f33, #ff3, #3f3, #3ff, #33f, #f3f, #f33)"}"></i></button><span class="sb-hexlabel" data-${attr}hex>${hex ? esc(hex) : ""}</span>`;
    // Wires one "any colour" swatch to a picker that appears under it.
    function wireAny(anyBtn, hostEl, current, onPick) {
      if (!anyBtn || !hostEl) return;
      anyBtn.addEventListener("click", () => {
        const open = hostEl.hidden;
        if (open && !hostEl.firstChild) {
          hostEl.appendChild(colourPicker(current(), (hex) => {
            anyBtn.setAttribute("aria-pressed", "true"); anyBtn.querySelector("i").style.background = hex;
            const lab = anyBtn.nextElementSibling; if (lab && lab.classList.contains("sb-hexlabel")) lab.textContent = hex;
            onPick(hex);
          }));
        }
        hostEl.hidden = !open; anyBtn.setAttribute("aria-expanded", String(open));
        if (open) { const sq = hostEl.querySelector(".sb-cpsat"); if (sq) sq.focus({ preventScroll: true }); }
      });
    }
    // Texts that flow as paragraphs: each paragraph can take its own font.
    const PARA_FLOW = { story: ["body"], article: ["body"], letter: ["body"], note: ["note"], about: ["about"], free: ["t"] };
    const paraCount = (s) => String(s == null ? "" : s).split(/\n+/).map((x) => x.trim()).filter(Boolean).length;
    const fmtSet = (f) => !!(f && (f.font || f.color || f.align || f.size || f.weight || f.italic || f.list || f.columns || (f.paras && Object.keys(f.paras).length)));
    // `words` is the text itself when its paragraphs can be formatted apart,
    // and null when the text is one run of words. `para` is 0 for the whole
    // text, or the paragraph being formatted.
    function formatHtml(k, host, words = null, para = 0) {
      const whole = ((host && host.get()) || {})[k] || {};
      const n = words == null ? 0 : paraCount(words);
      if (para > n) para = 0;
      const f = para ? ((whole.paras || {})[String(para)] || {}) : whole;
      const P = colourway(book.colourway);
      const groups = ["Serif", "Sans", "Condensed", "Mono"].map((kind) => `<optgroup label="${kind}">${FONT_LIST.filter((x) => x.kind === kind).map((x) => `<option value="${x.key}" ${f.font === x.key ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</optgroup>`).join("");
      const set = fmtSet(whole);
      const pct = Math.round(sizeScale(f) * 100);
      const picker = n >= 2
        ? `<label class="sb-fmtline"><span>Applies to</span><select data-fmtpara="${k}"><option value="0" ${para ? "" : "selected"}>The whole text</option>${Array.from({ length: n }, (_, i) => `<option value="${i + 1}" ${para === i + 1 ? "selected" : ""}>Paragraph ${i + 1}${(whole.paras || {})[String(i + 1)] ? " ·" : ""}</option>`).join("")}</select></label>`
        : "";
      const auto = para ? "Same as the whole text" : "The style's font";
      const swatch = (key, label, c) => `<button type="button" class="sb-swatch" data-fmtcolor="${key}" aria-pressed="${(f.color || "") === key}" title="${label}" aria-label="${label}"><i style="background:${c}"></i></button>`;
      const hex = /^#[0-9a-f]{6}$/i.test(f.color || "") ? f.color : "";
      return `<div class="sb-fmt" data-fmt="${k}" data-fmtat="${para}">
        <button type="button" class="sb-link sb-fmttoggle" aria-expanded="false" aria-controls="sbFmt_${k}">Format${set ? " · changed" : ""}</button>
        <div class="sb-fmtrow" id="sbFmt_${k}" hidden>
          ${picker}
          <label class="sb-fmtline"><span>Font</span><select data-fmtfont="${k}"><option value="">${auto}</option>${groups}</select></label>
          <div class="sb-fmtline"><span>Colour</span><span class="sb-swatches" role="group" aria-label="The book's own colours">${swatch("", para ? "Same as the whole text" : "The style's colour", "linear-gradient(135deg, #fff 45%, #999 50%, #fff 55%)")}${swatch("ink", "Ink", P.ink)}${swatch("soft", "Soft", P.soft)}${swatch("accent", "Accent", accentText(P))}${swatch("paper", "Paper", P.paper)}${swatch("white", "White", P.white)}${swatch("deep", "Deep", P.deep)}${anySwatch(`fmtany="${k}"`, hex)}</span></div>
          <div class="sb-cphost" data-fmtpick="${k}" hidden></div>
          <label class="sb-fmtline"><span>Size</span><span class="sb-sizerow"><input type="range" min="60" max="160" step="5" value="${pct}" data-fmtsize="${k}" aria-valuetext="${pct} percent"><output>${pct}%</output></span></label>
          ${para ? "" : (() => { const mm = textSizeMm(k); return `<div class="sb-fmtline"><span>In points</span><span class="sb-ptrow"><input type="number" data-fmtpt="${k}" min="4" max="140" step="0.5" value="${mm ? mmToPt(mm) : ""}" placeholder="…" aria-label="Size in points"><span>pt · from 60% to 160% of the style's size</span></span></div>`; })()}
          <div class="sb-fmtline"><span>Style</span><span class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Weight">${[["", "Auto"], ["light", "Light"], ["regular", "Regular"], ["bold", "Bold"]].map(([w, n]) => `<button type="button" role="radio" data-fmtweight="${w}" aria-checked="${(f.weight || "") === w}">${n}</button>`).join("")}<label class="sb-check-row sb-italic"><input type="checkbox" data-fmtitalic="${k}" ${f.italic ? "checked" : ""}> <i>Italic</i></label></span></div>
          <div class="sb-fmtline"><span>Align</span><span class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Alignment">${[["", "Auto"], ["left", "Left"], ["center", "Centre"], ["right", "Right"], ["justify", "Justify"]].map(([a, n]) => `<button type="button" role="radio" data-fmtalign="${a}" aria-checked="${(f.align || "") === a}">${n}</button>`).join("")}</span></div>
          ${words == null ? "" : `<div class="sb-fmtline"><span>List</span><span class="sb-seg sb-seg-sm" role="radiogroup" aria-label="List">${[["", "None"], ["bullet", "• Bullets"], ["number", "1. Numbers"]].map(([v, n]) => `<button type="button" role="radio" data-fmtlist="${v}" aria-checked="${(f.list || "") === v}">${n}</button>`).join("")}</span></div>
          <div class="sb-fmtline"><span>Columns</span><span class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Columns">${[["", "1"], ["2", "2"], ["3", "3"]].map(([v, n]) => `<button type="button" role="radio" data-fmtcols="${v}" aria-checked="${String(f.columns || "") === v}">${n}</button>`).join("")}</span></div>`}
        </div>
      </div>`;
    }
    function wireFormat(box, host) {
      box.querySelectorAll("[data-fmt]").forEach((wrap) => wireFormatOne(wrap, host));
    }
    // The words in the box beside this control, so the paragraph list can
    // follow what is typed.
    const fmtWords = (wrap, k) => {
      const field = wrap.closest(".sb-field");
      const ctl = field && field.querySelector(`[data-field="${k}"]`);
      return ctl ? ctl.value : null;
    };
    function wireFormatOne(wrap, host) {
      {
        const k = wrap.dataset.fmt;
        const para = +(wrap.dataset.fmtat || 0);
        const toggle = wrap.querySelector(".sb-fmttoggle"), row = wrap.querySelector(".sb-fmtrow");
        // Redraw the controls, open, for the paragraph now being formatted.
        const redraw = (at, focusPicker) => {
          const holder = document.createElement("div");
          holder.innerHTML = formatHtml(k, host, fmtWords(wrap, k), at);
          const fresh = holder.firstElementChild;
          wrap.replaceWith(fresh);
          wireFormatOne(fresh, host);
          const r = fresh.querySelector(".sb-fmtrow"), t = fresh.querySelector(".sb-fmttoggle");
          r.hidden = false; t.setAttribute("aria-expanded", "true");
          const again = fresh.querySelector(focusPicker ? "[data-fmtpara]" : ".sb-fmttoggle");
          if (again) again.focus();
        };
        const paraSel = wrap.querySelector("[data-fmtpara]");
        toggle.addEventListener("click", () => {
          // Opening it: the list of paragraphs follows what has been typed since.
          const words = fmtWords(wrap, k);
          const flows = !!paraSel || (PARA_FLOW[sel >= 0 ? book.pages[sel].type : "cover"] || []).includes(k);
          if (row.hidden && flows && words != null && paraCount(words) !== (paraSel ? paraSel.options.length - 1 : 0)) { redraw(para, false); return; }
          row.hidden = !row.hidden;
          toggle.setAttribute("aria-expanded", String(!row.hidden));
        });
        if (paraSel) paraSel.addEventListener("change", () => redraw(+paraSel.value || 0, true));
        const update = (patch) => {
          const all = { ...(host.get() || {}) };
          const one = { ...(all[k] || {}) };
          if (para) {
            const paras = { ...(one.paras || {}) };
            const at = { ...(paras[String(para)] || {}), ...patch };
            for (const key of Object.keys(at)) if (!at[key] || (key === "size" && at[key] === 1)) delete at[key];
            if (Object.keys(at).length) paras[String(para)] = at; else delete paras[String(para)];
            if (Object.keys(paras).length) one.paras = paras; else delete one.paras;
          } else {
            Object.assign(one, patch);
            for (const key of Object.keys(one)) if (key !== "paras" && (!one[key] || (key === "size" && one[key] === 1))) delete one[key];
          }
          if (Object.keys(one).length) all[k] = one; else delete all[k];
          host.set(Object.keys(all).length ? all : null);
          toggle.textContent = `Format${fmtSet(all[k]) ? " · changed" : ""}`;
          change({ rail: false });
          ensureBookFonts(book).then(() => { updateMeters(); schedulePreview(0); scheduleStrip(300); });
        };
        wrap.querySelector("[data-fmtfont]").addEventListener("change", (e) => update({ font: e.target.value }));
        wrap.querySelectorAll("[data-fmtcolor]").forEach((b) => b.addEventListener("click", () => {
          wrap.querySelectorAll("[data-fmtcolor]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          update({ color: b.dataset.fmtcolor });
        }));
        wireAny(wrap.querySelector("[data-fmtany]"), wrap.querySelector("[data-fmtpick]"), () => {
          const cur = ((host.get() || {})[k] || {});
          const at = para ? ((cur.paras || {})[String(para)] || {}) : cur;
          return /^#/.test(at.color || "") ? at.color : "";
        }, (hex) => {
          wrap.querySelectorAll("[data-fmtcolor]").forEach((x) => x.setAttribute("aria-pressed", "false"));
          update({ color: hex });
        });
        wrap.querySelectorAll("[data-fmtcolor]").forEach((b) => b.addEventListener("click", () => {
          const any = wrap.querySelector("[data-fmtany]"); if (any) any.setAttribute("aria-pressed", "false");
        }));
        const size = wrap.querySelector("[data-fmtsize]");
        const ptBox = wrap.querySelector("[data-fmtpt]");
        size.addEventListener("input", () => {
          const v = Math.round(+size.value) / 100;
          size.nextElementSibling.textContent = `${Math.round(v * 100)}%`;
          size.setAttribute("aria-valuetext", `${Math.round(v * 100)} percent`);
          update({ size: v });
          if (ptBox) setTimeout(() => { const mm = textSizeMm(k); if (mm && document.activeElement !== ptBox) ptBox.value = mmToPt(mm); }, 350);
        });
        if (ptBox) ptBox.addEventListener("change", () => {
          const pt = +ptBox.value; if (!(pt > 0)) return;
          const cur = ((host.get() || {})[k]) || {};
          const v = scaleForPt(k, pt, cur); if (v === null) return;
          update({ size: v });
          size.value = String(Math.round(v * 100)); size.nextElementSibling.textContent = `${Math.round(v * 100)}%`;
          setTimeout(() => { const mm = textSizeMm(k); if (mm) { const got = mmToPt(mm); if (Math.abs(got - pt) > 0.6) API.toast(`${got} pt is as ${got < pt ? "big" : "small"} as this text goes here (60% to 160% of the style's size).`); ptBox.value = got; } }, 400);
        });
        wrap.querySelectorAll("[data-fmtweight]").forEach((b) => b.addEventListener("click", () => {
          wrap.querySelectorAll("[data-fmtweight]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
          update({ weight: b.dataset.fmtweight });
        }));
        wrap.querySelector("[data-fmtitalic]").addEventListener("change", (e) => update({ italic: e.target.checked }));
        wrap.querySelectorAll("[data-fmtalign]").forEach((b) => b.addEventListener("click", () => {
          wrap.querySelectorAll("[data-fmtalign]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
          update({ align: b.dataset.fmtalign });
        }));
        wrap.querySelectorAll("[data-fmtlist]").forEach((b) => b.addEventListener("click", () => {
          wrap.querySelectorAll("[data-fmtlist]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
          update({ list: b.dataset.fmtlist });
        }));
        wrap.querySelectorAll("[data-fmtcols]").forEach((b) => b.addEventListener("click", () => {
          wrap.querySelectorAll("[data-fmtcols]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
          update({ columns: b.dataset.fmtcols ? +b.dataset.fmtcols : "" });
        }));
      }
    }
    // Bands round a full-page photo: which edges, and how broad.
    function borderHtml(entry) {
      const b = entry.border || "auto", w = entry.borderWidth || "standard";
      return `<div class="sb-field" id="sbBorder"><span class="sb-label">Border</span>
        <div class="sb-seg" role="radiogroup" aria-label="Border">${BORDER_CHOICES.map(([k, n]) => `<button type="button" role="radio" data-border="${k}" aria-checked="${b === k}">${n}</button>`).join("")}</div>
        <div class="sb-seg" role="radiogroup" aria-label="Border width" ${b === "auto" || b === "none" ? "hidden" : ""}>${[["narrow", "Narrow"], ["standard", "Standard"], ["broad", "Broad"]].map(([k, n]) => `<button type="button" role="radio" data-borderw="${k}" aria-checked="${w === k}">${n}</button>`).join("")}</div>
        <p class="sb-hint">${b === "auto" ? "Auto: the style's usual band with the page number." : b === "none" ? "None: the photo fills the page, with no page number." : "The photo sits inside the band. The page number goes in the foot or top band; a caption always sits at the foot."}</p></div>`;
    }
    function wireBorder(box, entry) {
      box.querySelectorAll("[data-border]").forEach((btn) => btn.addEventListener("click", () => {
        const v = btn.dataset.border;
        if ((entry.border || "auto") === v) return;
        if (v === "auto") { delete entry.border; delete entry.borderWidth; } else entry.border = v;
        change({ rail: false }); drawFieldsAndMeters();
        const again = $(`[data-border="${v}"]`); if (again) again.focus();
      }));
      box.querySelectorAll("[data-borderw]").forEach((btn) => btn.addEventListener("click", () => {
        const v = btn.dataset.borderw;
        if ((entry.borderWidth || "standard") === v) return;
        if (v === "standard") delete entry.borderWidth; else entry.borderWidth = v;
        change({ rail: false }); drawFieldsAndMeters();
        const again = $(`[data-borderw="${v}"]`); if (again) again.focus();
      }));
    }
    const borderApplies = (entry) => entry.type === "spread" || entry.type === "article" || (entry.type === "photos" && ((entry.photos || []).length === 1 || book.style === "vogue"));

    function fieldHtml(f, value, max, extra = "") {
      const id = `sbF_${f.k}`;
      const described = `${f.hint ? `${id}_hint ` : ""}${id}_fit ${id}_count`;
      const ph = f.ph ? `placeholder="${esc(f.ph)}"` : "";
      const control = f.ctl === "input"
        ? `<input type="text" id="${id}" data-field="${f.k}" maxlength="${max}" value="${esc(value)}" ${ph} autocapitalize="sentences" spellcheck="true" enterkeyhint="next" aria-describedby="${described}">`
        : `<textarea id="${id}" data-field="${f.k}" maxlength="${max}" rows="${f.rows || 3}" ${ph} autocapitalize="sentences" spellcheck="true" ${f.ctl === "line" ? `data-line="1" enterkeyhint="next"` : `enterkeyhint="enter"`} aria-describedby="${described}">${esc(value)}</textarea>`;
      const entry = sel >= 0 ? book.pages[sel] : null;
      const L2 = window.STUDIO_BOOK_LIMITS || {};
      const allowed = entry
        ? [...Object.keys((L2.fields || {})[entry.type] || {}), ...((L2.formatFields || {})[entry.type] || [])].filter((k) => entry.type !== "photos" || k === "caption")
        : ((L2.formatFields || {}).cover || []);
      const formattable = allowed.includes(f.k);
      const flows = (PARA_FLOW[entry ? entry.type : "cover"] || []).includes(f.k);
      return `<div class="sb-field">
        <div class="sb-labelrow"><label for="${id}">${esc(f.label)}</label>${formattable ? formatHtml(f.k, styleHost(entry), flows ? value : null) : ""}</div>
        ${f.hint ? `<p class="sb-hint" id="${id}_hint">${esc(f.hint)}</p>` : ""}
        ${control}
        <div class="sb-meter"><span id="${id}_fit">${fontsOk ? "" : "Measuring…"}</span><span class="sb-counter" id="${id}_count"></span></div>
        <button type="button" class="sb-link" data-select="${f.k}" hidden>Select what won't print</button>
        <p class="sb-note" id="${id}_paste" hidden></p>
        ${extra}
      </div>`;
    }
    // Wires a text box to a place on the book. The value goes onto the book
    // on every keystroke; nothing ever writes back into the box while typing.
    function wireField(el, set, max) {
      const grow = () => { if (el.tagName === "TEXTAREA" && !el.dataset.line) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight + 2, Math.round(window.innerHeight * 0.5))}px`; } };
      el.addEventListener("input", () => { set(el.value); grow(); change({ typing: true, rail: false }); patchRail(); });
      if (el.dataset.line) el.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
      el.addEventListener("blur", () => { flush(); schedulePreview(0); scheduleStrip(300); });
      el.addEventListener("paste", (e) => pasteGuard(e, el, max));
      grow();
    }
    function pasteGuard(e, el, max) {
      const text = (e.clipboardData && e.clipboardData.getData("text")) || "";
      const room = max - (el.value.length - ((el.selectionEnd || 0) - (el.selectionStart || 0)));
      const note = $(`#${el.id}_paste`);
      if (text.length <= room) { if (note) note.hidden = true; return; }
      // The browser would drop the end of a long paste without a word; cut it
      // at a word instead, say so, and offer the rest.
      e.preventDefault();
      let part = text.slice(0, Math.max(0, room)).replace(/[\uD800-\uDBFF]$/, "");
      const lastSpace = part.search(/\s\S*$/);
      if (lastSpace > 0) part = part.slice(0, lastSpace);
      el.setRangeText(part, el.selectionStart, el.selectionEnd, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      const rest = text.slice(part.length).trimStart();
      if (!note) return;
      note.hidden = false;
      note.innerHTML = `Pasted text was cut to fit ${max} characters; ${rest.length} weren't added. <button type="button" class="sb-link">Copy the rest</button>`;
      note.querySelector("button").addEventListener("click", () => {
        (navigator.clipboard ? navigator.clipboard.writeText(rest) : Promise.reject()).then(() => API.toast("The rest is on your clipboard."), () => API.toast("Couldn't copy it on this device."));
      });
    }

    /* A line the book draws for itself — a page's small label and heading, the
       credit under a photo, the words on the cover. Typed here it is used
       instead; left empty the book keeps its own words, and nothing is stored. */
    const PT = () => (window.STUDIO_BOOK_LIMITS || {}).pageText || { label: 32, heading: 60, note: 90, credit: 60, qrLabel: 24 };
    const overHtml = (id, label, value, max, ph, hint) => `<div class="sb-field">
        <label for="${id}">${esc(label)}</label>
        ${hint ? `<p class="sb-hint">${esc(hint)}</p>` : ""}
        <input type="text" id="${id}" maxlength="${max}" value="${esc(value || "")}" placeholder="${esc(ph || "")}" spellcheck="true" autocapitalize="sentences">
      </div>`;
    const setOver = (host, k) => (v) => { if (String(v).trim()) host[k] = v; else delete host[k]; };
    const wireOver = (id, set) => {
      const el = $(`#${id}`); if (!el) return;
      el.addEventListener("input", () => { set(el.value); change({ rail: false, typing: true }); patchRail(); });
      el.addEventListener("blur", () => { flush(); schedulePreview(0); scheduleStrip(300); });
    };
    // The small label and heading every About / What I shoot / Contact page draws.
    const headingsHtml = (entry, label, heading) => overHtml("sbOvLabel", "Small line above the heading", entry.label, PT().label, label)
      + overHtml("sbOvHeading", "Heading", entry.heading, PT().heading, heading);
    const wireHeadings = (entry) => { wireOver("sbOvLabel", setOver(entry, "label")); wireOver("sbOvHeading", setOver(entry, "heading")); };
    // The credit line printed under or beside a photograph.
    const creditHtml = (entry) => overHtml("sbOvCredit", "Credit line", entry.credit, PT().credit,
      creditLine(((entry.photos || []).map((s) => { const hit = library().byId.get(s.id); return hit && hit.shoot; }).filter(Boolean))) || "The album's own credit",
      "Printed in the foot band. Empty means the album's own credit.");
    const wireCredit = (entry) => wireOver("sbOvCredit", setOver(entry, "credit"));

    /* Everything else the cover prints: the small label, the masthead and its
       tagline, the two lines at the foot, and the three lines each side. Each
       is shown with what the book would print if it were left empty. */
    function coverLinesHtml() {
      const t = (book.coverText && typeof book.coverText === "object") ? book.coverText : {};
      const CT = coverText(book), cl = coverLines(book), M = (window.STUDIO_BOOK_LIMITS || {}).coverText || {};
      const rightNow = [`${cl.photos} PLATES`, `${cl.pages} PAGES`, "NOIDA, INDIA"];
      const side = (which, now) => `<div class="sb-field"><span class="sb-label">${which === "left" ? "Three lines on the left" : "Three lines on the right"}</span>
        ${[0, 1, 2].map((i) => `<input type="text" id="sbCov_${which}${i}" maxlength="${(window.STUDIO_BOOK_LIMITS || {}).coverLine || 24}" value="${esc(((t[which] || [])[i]) || "")}" placeholder="${esc(now[i] || "—")}" aria-label="${which === "left" ? "Left" : "Right"} line ${i + 1}">`).join("")}</div>`;
      // Each style prints its own lines, so only those are offered.
      const line = { label: "Small label", mast: "Masthead word", tagline: "Line under the masthead", foot: "Foot line", place: "Place and year" };
      const mine = COVER_LINES[book.style] || COVER_LINES.modern;
      const counts = mine.includes("counts");
      return `<details class="sb-sec" id="sbCoverLines"><summary>The rest of the cover</summary>
        ${mine.filter((k) => line[k]).map((k) => overHtml(`sbCov_${k}`, line[k], t[k], M[k] || 32, CT[k])).join("")}
        ${counts ? `<label class="sb-check-row"><input type="checkbox" id="sbCovCounts" ${CT.showCounts ? "checked" : ""}> Print the three lines each side</label>` : ""}
        ${counts && CT.showCounts ? side("left", cl.genres) + side("right", rightNow) : ""}
        <p class="sb-hint">Left empty, each line is the one the book works out for itself. Another style prints other lines.</p></details>`;
    }
    function wireCoverLines() {
      const at = () => (book.coverText && typeof book.coverText === "object" ? book.coverText : (book.coverText = {}));
      const mine = COVER_LINES[book.style] || COVER_LINES.modern;
      const tidy = () => { if (book.coverText && !Object.keys(book.coverText).length) delete book.coverText; };
      for (const k of mine) {
        wireOver(`sbCov_${k}`, (v) => { const t = at(); if (String(v).trim()) t[k] = v; else delete t[k]; tidy(); });
      }
      const counts = $("#sbCovCounts");
      if (counts) counts.addEventListener("change", () => {
        const t = at();
        if (counts.checked) delete t.showCounts; else t.showCounts = false;
        tidy(); change({ rail: false }); drawFieldsAndMeters();
        const open = $("#sbCoverLines"); if (open) { open.open = true; const again = $("#sbCovCounts"); if (again) again.focus(); }
      });
      for (const which of ["left", "right"]) for (const i of [0, 1, 2]) {
        wireOver(`sbCov_${which}${i}`, (v) => {
          const t = at();
          const lines = Array.isArray(t[which]) ? t[which].slice() : [];
          while (lines.length <= i) lines.push("");
          lines[i] = v;
          while (lines.length && !String(lines[lines.length - 1]).trim()) lines.pop();
          if (lines.length) t[which] = lines; else delete t[which];
          tidy();
        });
      }
    }

    function drawFields() {
      const box = $("#sbFields"); if (!box) return;
      const entry = sel >= 0 ? book.pages[sel] : null;
      const caps = fieldCaps();
      if (!entry) {
        box.innerHTML = `
          ${fieldHtml({ k: "title", label: "Title", ctl: "input" }, book.title || "", 80)}
          ${fieldHtml({ k: "subtitle", label: "Line under the title", ctl: "input" }, book.subtitle || "", 120)}
          ${coverLinesHtml()}`;
        wireField($("#sbF_title"), (v) => { book.title = v; }, 80);
        wireField($("#sbF_subtitle"), (v) => { book.subtitle = v; }, 120);
        wireCoverLines();
        wireFormat(box, styleHost(null));
        return;
      }
      if (WRITING[entry.type] && FIELD_UI[entry.type]) {
        box.innerHTML = `<h3>Words</h3>${FIELD_UI[entry.type].map((f) => fieldHtml(f, entry[f.k] || "", (caps[entry.type] || {})[f.k] || 200,
          f.credit ? `<button type="button" class="sb-link" id="sbUseCredit">Use the album credit</button>` : "")).join("")}
          <details class="sb-ideas"><summary>Ideas</summary><ul>${IDEAS[entry.type].map((q) => `<li>${esc(q)}</li>`).join("")}</ul></details>
          <p class="sb-hint">Published books are public: only use names and words people are happy to see there, and no private notes.</p>`;
        if (entry.type === "article") { box.insertAdjacentHTML("afterbegin", splitHtml(sel)); box.insertAdjacentHTML("beforeend", creditHtml(entry) + borderHtml(entry)); wireSplit(sel); }
        for (const f of FIELD_UI[entry.type]) wireField($(`#sbF_${f.k}`), (v) => { entry[f.k] = v; }, (caps[entry.type] || {})[f.k] || 200);
        $$("[data-select]").forEach((b) => b.addEventListener("click", () => selectOverflow(b.dataset.select)));
        wireFormat(box, styleHost(entry));
        if (entry.type === "article") { wireCredit(entry); wireBorder(box, entry); }
        const credit = $("#sbUseCredit");
        if (credit) credit.addEventListener("click", () => {
          const hit = entry.photos[0] && library().byId.get(entry.photos[0].id);
          if (!hit) { API.toast("Choose the photo first: the credit comes from its album."); return; }
          const el = $("#sbF_detail");
          el.value = creditLine([hit.shoot]).slice(0, (caps.note || {}).detail || 90);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        });
        return;
      }
      if (entry.type === "ways" || entry.type === "process") {
        const F2 = caps[entry.type] || {};
        const LIM = window.STUDIO_BOOK_LIMITS || {};
        const head = [
          { k: "kicker", label: "Small line above the heading", ctl: "input" },
          { k: "heading", label: "Heading", ctl: "line", rows: 2 },
          { k: "intro", label: "Intro", ctl: "line", rows: 3 }
        ];
        const seg = (label, attr, i, value) => `<div class="sb-field"><span class="sb-label">${label}</span><div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="${label}">${LEAD_CHOICES.map(([k, n]) => `<button type="button" role="radio" data-${attr}="${i}:${k}" aria-checked="${value === k}">${n}</button>`).join("")}</div></div>`;
        let html = "";
        if (entry.type === "process") {
          html += `<div class="sb-field"><span class="sb-label">Which way is this page about?</span>
            <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Which way">${Object.entries(PROCESS_COPY).map(([k, v]) => `<button type="button" role="radio" data-way="${k}" aria-checked="${entry.way === k}">${esc(v.menuName)}</button>`).join("")}</div>
            <p class="sb-hint">${esc((PROCESS_COPY[entry.way] || {}).menuNote || "Pick a way and this page fills with the studio's words for it. Every line stays yours to edit.")}</p></div>`;
        }
        html += `<h3>Words</h3>` + head.map((f) => fieldHtml(f, entry[f.k] || "", F2[f.k] || 160)).join("");
        if (entry.type === "ways") {
          html += (entry.items || []).map((it, i) => `<div class="sb-sec sb-rowbox"><h3>Way ${i + 1}</h3>
            ${fieldHtml({ k: `name${i + 1}`, label: "Name", ctl: "input" }, it.name || "", (LIM.wayItem || {}).name || 32)}
            ${fieldHtml({ k: `forWho${i + 1}`, label: "Who it suits", ctl: "input" }, it.forWho || "", (LIM.wayItem || {}).forWho || 64)}
            ${fieldHtml({ k: `text${i + 1}`, label: "How it runs", ctl: "area", rows: 3 }, it.text || "", (LIM.wayItem || {}).text || 150)}
            ${seg("Who leads the ideas", "lead", i, it.lead)}
            <label class="sb-check-row"><input type="checkbox" data-liked="${i}" ${it.liked ? "checked" : ""}> Mark as how we like to work</label></div>`).join("");
        } else {
          const steps = entry.steps || [];
          html += steps.map((st, i) => `<div class="sb-sec sb-rowbox"><h3>Step ${i + 1}</h3>
            <div class="sb-rowacts"><button type="button" class="sb-btn quiet" data-stepup="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move step ${i + 1} earlier">↑</button><button type="button" class="sb-btn quiet" data-stepdown="${i}" ${i === steps.length - 1 ? "disabled" : ""} aria-label="Move step ${i + 1} later">↓</button><button type="button" class="sb-btn quiet" data-steprm="${i}" ${steps.length <= 3 ? "disabled" : ""} aria-label="Remove step ${i + 1}">Remove</button></div>
            ${seg("Who does it", "who", i, st.who)}
            ${fieldHtml({ k: `title${i + 1}`, label: "Title", ctl: "input" }, st.title || "", (LIM.stepItem || {}).title || 36)}
            ${fieldHtml({ k: `text${i + 1}`, label: "What happens", ctl: "area", rows: 3 }, st.text || "", (LIM.stepItem || {}).text || 130)}</div>`).join("");
          html += `<p><button type="button" class="sb-btn quiet" id="sbAddStep" ${steps.length >= 6 ? "disabled" : ""}>+ Add a step</button></p>`;
          html += fieldHtml({ k: "note", label: "Closing line (optional)", ctl: "input" }, entry.note || "", F2.note || 120);
        }
        html += `<details class="sb-ideas"><summary>Ideas</summary><ul>${IDEAS[entry.type].map((q) => `<li>${esc(q)}</li>`).join("")}</ul></details>
          <p class="sb-hint">These words came from what your site and contracts already say. Change anything that isn't how you work.</p>`;
        box.innerHTML = html;
        for (const f of head) wireField($(`#sbF_${f.k}`), (v) => { entry[f.k] = v; }, F2[f.k] || 160);
        if (entry.type === "ways") (entry.items || []).forEach((it, i) => {
          wireField($(`#sbF_name${i + 1}`), (v) => { it.name = v; }, (LIM.wayItem || {}).name || 32);
          wireField($(`#sbF_forWho${i + 1}`), (v) => { it.forWho = v; }, (LIM.wayItem || {}).forWho || 64);
          wireField($(`#sbF_text${i + 1}`), (v) => { it.text = v; }, (LIM.wayItem || {}).text || 150);
        });
        else {
          (entry.steps || []).forEach((st, i) => {
            wireField($(`#sbF_title${i + 1}`), (v) => { st.title = v; }, (LIM.stepItem || {}).title || 36);
            wireField($(`#sbF_text${i + 1}`), (v) => { st.text = v; }, (LIM.stepItem || {}).text || 130);
          });
          wireField($("#sbF_note"), (v) => { entry.note = v; }, F2.note || 120);
        }
        $$("[data-lead]").forEach((b) => b.addEventListener("click", () => {
          const [i, k] = b.dataset.lead.split(":");
          if (entry.items[+i].lead === k) return;
          entry.items[+i].lead = k; change({ rail: false }); drawFieldsAndMeters();
          const again = $(`[data-lead="${i}:${k}"]`); if (again) again.focus({ preventScroll: true });
        }));
        $$("[data-who]").forEach((b) => b.addEventListener("click", () => {
          const [i, k] = b.dataset.who.split(":");
          if (entry.steps[+i].who === k) return;
          entry.steps[+i].who = k; change({ rail: false }); drawFieldsAndMeters();
          const again = $(`[data-who="${i}:${k}"]`); if (again) again.focus({ preventScroll: true });
        }));
        $$("[data-liked]").forEach((cb) => cb.addEventListener("change", () => {
          const it = entry.items[+cb.dataset.liked];
          if (cb.checked) it.liked = true; else delete it.liked;
          change({ rail: false });
        }));
        $$("[data-stepup], [data-stepdown]").forEach((b) => b.addEventListener("click", () => {
          const up = "stepup" in b.dataset, i = +(b.dataset.stepup || b.dataset.stepdown), j = i + (up ? -1 : 1);
          [entry.steps[i], entry.steps[j]] = [entry.steps[j], entry.steps[i]];
          change({ rail: false }); drawFieldsAndMeters();
        }));
        $$("[data-steprm]").forEach((b) => b.addEventListener("click", () => {
          const i = +b.dataset.steprm;
          const st = entry.steps[i];
          mark();
          if (oneParagraph(st.title).length || oneParagraph(st.text).length) API.toast(`Removed step ${i + 1} · Ctrl+Z to undo`);
          entry.steps.splice(i, 1); change({ rail: false }); drawFieldsAndMeters();
        }));
        const addStep = $("#sbAddStep");
        if (addStep) addStep.addEventListener("click", () => {
          if ((entry.steps || []).length >= 6) return;
          entry.steps.push({ who: "together", title: "", text: "" });
          change({ rail: false }); drawFieldsAndMeters();
          const el = $(`#sbF_title${entry.steps.length}`); if (el && matchMedia("(pointer: fine)").matches) el.focus();
        });
        $$("[data-way]").forEach((b) => b.addEventListener("click", () => {
          const k = b.dataset.way;
          if (entry.way === k) return;
          const copy = PROCESS_COPY[k], was = PROCESS_COPY[entry.way] || {};
          const untouched = JSON.stringify({ kicker: entry.kicker, heading: entry.heading, intro: entry.intro, steps: entry.steps, note: entry.note })
            === JSON.stringify({ kicker: was.kicker || "", heading: was.heading || "", intro: was.intro || "", steps: (was.steps || []).map((x) => ({ ...x })), note: was.note || "" });
          mark();
          if (!untouched) API.toast(`Now “${copy.menuName}” · Ctrl+Z brings your words back`);
          Object.assign(entry, { way: k, kicker: copy.kicker, heading: copy.heading, intro: copy.intro, note: copy.note, steps: copy.steps.map((x) => ({ ...x })) });
          change(); drawFieldsAndMeters();
          const again = $(`[data-way="${k}"]`); if (again) again.focus({ preventScroll: true });
        }));
        $$("[data-select]").forEach((b) => b.addEventListener("click", () => selectOverflow(b.dataset.select)));
        wireFormat(box, styleHost(entry));
        return;
      }
      if (entry.type === "photos") {
        const nPhotos = (entry.photos || []).length;
        box.innerHTML = (nPhotos >= 4 && nPhotos <= 6 ? `<div class="sb-field"><span class="sb-label">Three in a row</span>
            <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Three in a row">${[["", "Auto"], ["3top", "On top"], ["3bottom", "At the bottom"]].map(([k, n]) => `<button type="button" role="radio" data-rows="${k}" aria-checked="${(entry.rows || "") === k}">${n}</button>`).join("")}</div>
            <p class="sb-hint">${entry.rows ? `Three photographs in one row ${entry.rows === "3top" ? "on top" : "at the bottom"}, the other ${nPhotos - 3 === 1 ? "one large" : `${nPhotos - 3} in the other row`}.` : "Auto follows how many photographs there are and their shapes."}</p></div>` : "")
          + fieldHtml({ k: "caption", label: "Caption for this page (optional)", ctl: "input", ph: "e.g. Monsoon edit, shot on the roof in Sector 46" }, entry.caption || "", (caps.photos || {}).caption || 90)
          + creditHtml(entry)
          + `<p class="sb-hint">Published books are public, so keep private details out of captions.</p>`
          + (borderApplies(entry) ? borderHtml(entry) : "");
        wireField($("#sbF_caption"), (v) => { entry.caption = v; }, (caps.photos || {}).caption || 90);
        wireCredit(entry);
        $$("[data-rows]").forEach((b) => b.addEventListener("click", () => {
          if ((entry.rows || "") === b.dataset.rows) return;
          mark();
          if (b.dataset.rows) entry.rows = b.dataset.rows; else delete entry.rows;
          change({ rail: true }); drawFields();
          const again = $(`[data-rows="${b.dataset.rows}"]`); if (again) again.focus();
        }));
        $$("[data-select]").forEach((b) => b.addEventListener("click", () => selectOverflow(b.dataset.select)));
        wireFormat(box, styleHost(entry));
        wireBorder(box, entry);
        return;
      }
      if (entry.type === "spread") {
        box.innerHTML = splitHtml(sel) + creditHtml(entry) + borderHtml(entry);
        wireSplit(sel);
        wireCredit(entry);
        wireBorder(box, entry);
        return;
      }
      if (entry.type === "divider") {
        box.innerHTML = `${fieldHtml({ k: "heading", label: "Heading", ctl: "input" }, entry.heading || "", 60)}${fieldHtml({ k: "line", label: "One line under it", ctl: "input" }, entry.line || "", 160)}`;
        wireField($("#sbF_heading"), (v) => { entry.heading = v; }, 60);
        wireField($("#sbF_line"), (v) => { entry.line = v; }, 160);
        wireFormat(box, styleHost(entry));
        return;
      }
      if (entry.type === "about") {
        box.innerHTML = headingsHtml(entry, "About the studio", "Not just photos, a perspective")
          + fieldHtml({ k: "about", label: "About the studio", ctl: "area", rows: 8, ph: DEFAULT_ABOUT.split("\n")[0] }, book.texts.about || "", 1200);
        wireHeadings(entry);
        wireField($("#sbF_about"), (v) => { book.texts.about = v; }, 1200);
        wireFormat(box, styleHost(entry));
        return;
      }
      if (entry.type === "services") {
        const live = API.liveServices() || [];
        const hide = new Set(Array.isArray(entry.hide) ? entry.hide : []);
        const over = (entry.items && typeof entry.items === "object") ? entry.items : {};
        const SI = (window.STUDIO_BOOK_LIMITS || {}).serviceItem || { kicker: 28, title: 40, blurb: 120 };
        box.innerHTML = headingsHtml(entry, "What I shoot", "Shoots, and who they are for")
          + overHtml("sbOvNote", "Closing line", entry.note, PT().note, "Every shoot is quoted to its brief.")
          + `<label class="sb-check-row"><input type="checkbox" id="sbPrices" ${book.texts.showPrices ? "checked" : ""}> Show package prices on this page</label>
          <p class="sb-hint">Off by default: a printed price caps a job before the brief is known.</p>`
          + live.map((v, i) => {
            const o = over[v.slug] || {};
            const changed = !!(o.kicker || o.title || o.blurb);
            return `<details class="sb-sec sb-rowbox" ${changed ? "open" : ""}><summary>${esc(o.title || v.title || v.slug)}${hide.has(v.slug) ? " · left out" : changed ? " · in your words" : ""}</summary>
              <label class="sb-check-row"><input type="checkbox" data-svchide="${i}" ${hide.has(v.slug) ? "" : "checked"}> Print this shoot</label>
              ${overHtml(`sbSvc${i}_kicker`, "Small line", o.kicker, SI.kicker, v.kicker || "")}
              ${overHtml(`sbSvc${i}_title`, "Name", o.title, SI.title, v.title || "")}
              ${overHtml(`sbSvc${i}_blurb`, "What it is", o.blurb, SI.blurb, v.blurb || "")}</details>`;
          }).join("")
          + `<p class="sb-hint">The shoots come from the site. Anything typed here is used in this book only.</p>`;
        wireHeadings(entry);
        wireOver("sbOvNote", setOver(entry, "note"));
        $("#sbPrices").addEventListener("change", (e) => { book.texts.showPrices = e.target.checked; change({ rail: false }); });
        const items = () => ((entry.items && typeof entry.items === "object") ? entry.items : (entry.items = {}));
        const tidyItems = () => { if (entry.items && !Object.keys(entry.items).length) delete entry.items; };
        live.forEach((v, i) => {
          for (const k of ["kicker", "title", "blurb"]) wireOver(`sbSvc${i}_${k}`, (val) => {
            const all = items(), one = { ...(all[v.slug] || {}) };
            if (String(val).trim()) one[k] = val; else delete one[k];
            if (Object.keys(one).length) all[v.slug] = one; else delete all[v.slug];
            tidyItems();
          });
          const cb = $(`[data-svchide="${i}"]`);
          if (cb) cb.addEventListener("change", () => {
            const h = new Set(Array.isArray(entry.hide) ? entry.hide : []);
            if (cb.checked) h.delete(v.slug); else h.add(v.slug);
            if (h.size) entry.hide = [...h]; else delete entry.hide;
            change({ rail: false });
          });
        });
        return;
      }
      if (entry.type === "contact") {
        const hidden = new Set(Array.isArray(entry.hide) ? entry.hide : []);
        const cfgNow = cfg();
        const lines = [["email", `Email${cfgNow.email ? ` · ${cfgNow.email}` : ""}`], ["whatsapp", "WhatsApp (when a number is typed below)"], ["instagram", "Instagram"], ["website", "Website"], ["book", "Book online"], ["studio", "Studio · Noida, working across Delhi NCR"], ["qr", "QR code to the booking form"]];
        const CR = (window.STUDIO_BOOK_LIMITS || {}).contactRow || { label: 24, value: 60 };
        const rowNow = { email: ["Email", cfgNow.email || ""], whatsapp: ["WhatsApp", book.texts.phone || ""], instagram: ["Instagram", cfgNow.instagramHandle ? `@${cfgNow.instagramHandle}` : ""], website: ["Website", "nerdyphotographer.in"], book: ["Book online", "nerdyphotographer.in/book"], studio: ["Studio", "Noida · working across Delhi NCR"] };
        const rowsOver = (entry.rows && typeof entry.rows === "object") ? entry.rows : {};
        box.innerHTML = headingsHtml(entry, "Let\u2019s make something", "Book a shoot")
          + `<div class="sb-field"><span class="sb-label">Show on this page</span>
          ${lines.map(([k, label]) => `<label class="sb-check-row"><input type="checkbox" data-show="${k}" ${hidden.has(k) ? "" : "checked"}> ${esc(label)}</label>`).join("")}</div>
          <div class="sb-field"><label for="sbPhone">WhatsApp number (optional)</label>
          <input type="tel" id="sbPhone" maxlength="24" value="${esc(book.texts.phone || "")}" placeholder="+91 …">
          <p class="sb-hint">Saved books are published inside the site's data file, which is public. Leave this empty unless you're happy for the number to be public.</p></div>`
          + overHtml("sbOvQr", "Words under the QR code", entry.qrLabel, PT().qrLabel, "SCAN TO BOOK")
          + `<details class="sb-sec" id="sbRowsOver"><summary>These lines in your own words</summary>
            ${Object.entries(rowNow).map(([k, [label, value]], i) => `<div class="sb-rowbox">
              ${overHtml(`sbRow${i}_label`, `${esc(label)} · what it is called`, (rowsOver[k] || {}).label, CR.label, label)}
              ${overHtml(`sbRow${i}_value`, `${esc(label)} · what it says`, (rowsOver[k] || {}).value, CR.value, value || "—")}</div>`).join("")}
            <p class="sb-hint">Left empty, each line stays as the site has it.</p></details>`;
        $$("[data-show]").forEach((cb) => cb.addEventListener("change", () => {
          const h = new Set(Array.isArray(entry.hide) ? entry.hide : []);
          if (cb.checked) h.delete(cb.dataset.show); else h.add(cb.dataset.show);
          if (h.size) entry.hide = [...h]; else delete entry.hide;
          change({ rail: false });
        }));
        $("#sbPhone").addEventListener("input", (e) => { book.texts.phone = e.target.value; change({ rail: false, typing: true }); });
        $("#sbPhone").addEventListener("blur", () => flush());
        wireHeadings(entry);
        wireOver("sbOvQr", setOver(entry, "qrLabel"));
        const rowsAt = () => ((entry.rows && typeof entry.rows === "object") ? entry.rows : (entry.rows = {}));
        Object.keys(rowNow).forEach((k, i) => {
          for (const which of ["label", "value"]) wireOver(`sbRow${i}_${which}`, (val) => {
            const all = rowsAt(), one = { ...(all[k] || {}) };
            if (String(val).trim()) one[which] = val; else delete one[which];
            if (Object.keys(one).length) all[k] = one; else delete all[k];
            if (entry.rows && !Object.keys(entry.rows).length) delete entry.rows;
          });
        });
        return;
      }
      if (entry.type === "free") { drawFreeFields(box, entry); return; }
      box.innerHTML = "";
    }

    /* The Anything page's own panel: what to add, what is on the page, and
       the settings of the one thing chosen. Everything here also works with
       a finger, because dragging on a small page is fiddly. */
    function drawFreeFields(box, entry) {
      const G = geometry(book);
      const blocks = blocksOf(entry);
      const b = blocks[blockSel] || null;
      const P = colourway(book.colourway);
      const swatch = (attr, key, label, c, on) => `<button type="button" class="sb-swatch" data-${attr}="${key}" aria-pressed="${on}" title="${esc(label)}" aria-label="${esc(label)}"><i style="background:${c}"></i></button>`;
      const fills = [["accent", "Accent", P.accent], ["ink", "Ink", P.ink], ["soft", "Soft", P.soft], ["rule", "Hairline", P.rule], ["paper", "Paper", P.paper], ["white", "White", P.white], ["deep", "Deep", P.deep]];
      const mmX = (v) => `${(v * G.Wa).toFixed(1)} mm`;
      const mmY = (v) => `${(v * G.Ha).toFixed(1)} mm`;
      const step = (label, attr, minus, plus, value) => `<div class="sb-step"><span>${esc(label)}</span><button type="button" data-${attr}="${minus}" aria-label="${esc(label)} less">−</button><output>${esc(value)}</output><button type="button" data-${attr}="${plus}" aria-label="${esc(label)} more">+</button></div>`;
      const fade = b && typeof b.o === "number" ? b.o : 1;
      const words = b && b.k === "text" ? `
        <div class="sb-field"><span class="sb-label">What kind of words</span>
          <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="What kind of words">${[["kicker", "Small line"], ["head", "Headline"], ["intro", "Intro"], ["body", "Words"], ["quote", "Quote"]].map(([k, n]) => `<button type="button" role="radio" data-role="${k}" aria-checked="${(b.role || "body") === k}">${n}</button>`).join("")}</div></div>
        <div class="sb-field">
          <div class="sb-labelrow"><label for="sbF_blocktext">The words</label>${formatHtml("t", blockStyleHost(b), b.t || "")}</div>
          <textarea id="sbF_blocktext" data-field="t" maxlength="${FREE_TEXT_MAX}" rows="4" autocapitalize="sentences" spellcheck="true" aria-describedby="sbF_blocktext_fit sbF_blocktext_count">${esc(b.t || "")}</textarea>
          <div class="sb-meter"><span id="sbF_blocktext_fit">${fontsOk ? "" : "Measuring…"}</span><span class="sb-counter" id="sbF_blocktext_count"></span></div>
          <p class="sb-note" id="sbF_blocktext_paste" hidden></p>
        </div>
        <div class="sb-field"><span class="sb-label">If they don't all fit</span>
          <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="If they don't all fit">${[["", "Make them smaller"], ["cut", "Keep the size"]].map(([k, n]) => `<button type="button" role="radio" data-tfit="${k}" aria-checked="${(b.fit || "") === k}">${n}</button>`).join("")}</div></div>` : "";
      const photoShape = b && b.k === "photo" ? `
        <div class="sb-field"><span class="sb-label">Shape</span>
          <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Shape">${[["rect", "▭ Box"], ["round", "▢ Rounded"], ["chamfer", "⬠ Cut corners"], ["ellipse", "◯ Oval"], ["triangle", "△ Triangle"], ["diamond", "◇ Diamond"], ["star", "☆ Star"], ["parallelogram", "▱ Slanted"]].map(([k, n]) => `<button type="button" role="radio" data-shape="${k}" aria-checked="${shapeOf(b) === k}">${n}</button>`).join("")}</div>
          ${shapeOf(b) === "ellipse" ? "" : `<label class="sb-range">Rounded corners <input type="range" min="0" max="50" step="1" value="${Math.round(cornerOf(b) * 100)}" data-cornerpct aria-valuetext="${Math.round(cornerOf(b) * 100)} percent"></label>`}
          <p class="sb-hint">The photograph is cut to the shape.</p></div>` : "";
      const paint = b && (b.k === "shape" || b.k === "line" || b.k === "text") ? `
        <div class="sb-field"><span class="sb-label">${b.k === "text" ? "Colour behind the words" : "Colour"}</span>
          <span class="sb-swatches" role="group" aria-label="The book's own colours">${b.k === "text" ? swatch("fill", "", "None", "linear-gradient(135deg, #fff 45%, #999 50%, #fff 55%)", !b.fill) : ""}${fills.map(([k, n, c]) => swatch("fill", k, n, c, (b.k === "line" ? b.color : b.fill) === k)).join("")}${anySwatch("fillany", /^#/.test(b.k === "line" ? b.color || "" : b.fill || "") ? (b.k === "line" ? b.color : b.fill) : "")}</span>
          <div class="sb-cphost" data-fillpick hidden></div>${b.k === "text" ? `<p class="sb-hint">A shape with words in it: the words sit inside the colour.</p>` : ""}</div>
        ${b.k === "shape" || (b.k === "text" && b.fill) ? `<div class="sb-field"><span class="sb-label">Shape</span>
          <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Shape">${[["rect", "▭ Box"], ["round", "▢ Rounded"], ["chamfer", "⬠ Cut corners"], ["ellipse", "◯ Oval"], ["triangle", "△ Triangle"], ["diamond", "◇ Diamond"], ["star", "☆ Star"], ["parallelogram", "▱ Slanted"]].map(([k, n]) => `<button type="button" role="radio" data-shape="${k}" aria-checked="${shapeOf(b) === k}">${n}</button>`).join("")}</div>
          ${shapeOf(b) === "ellipse" ? "" : `<label class="sb-range">Rounded corners <input type="range" min="0" max="50" step="1" value="${Math.round(cornerOf(b) * 100)}" data-cornerpct aria-valuetext="${Math.round(cornerOf(b) * 100)} percent"></label><p class="sb-hint">0 is sharp; it rounds the tips of a star or a triangle too.</p>`}</div>` : ""}
        ${b.k === "shape" ? `<div class="sb-field"><span class="sb-label">Put something in it</span><div class="sb-adds"><button type="button" data-into="text">Words in this shape</button><button type="button" data-into="photo">A photo in this shape</button></div></div>` : ""}
        ${b.k === "line" ? `<div class="sb-field"><span class="sb-label">Runs</span>
          <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="How the line runs">${[["h", "▬ Across"], ["v", "┃ Down"], ["d", "╲ Diagonal"], ["u", "╱ Diagonal up"], ["curve", "◠ Curved"], ["wave", "∿ Wavy"]].map(([k, n]) => `<button type="button" role="radio" data-lpath="${k}" aria-checked="${linePath(b) === k}">${n}</button>`).join("")}${linePath(b) === "free" ? `<button type="button" role="radio" data-lpath="free" aria-checked="true">✎ Drawn by hand</button>` : ""}</div>
          ${linePath(b) === "curve" || linePath(b) === "wave" ? `<label class="sb-range">Bend <input type="range" min="-100" max="100" step="5" value="${Math.round(lineBend(b) * 100)}" data-lbend aria-valuetext="${Math.round(lineBend(b) * 100)} percent"></label>` : ""}
          ${linePath(b) === "wave" ? `<label class="sb-range">How many waves <input type="range" min="1" max="8" step="1" value="${lineWaves(b)}" data-lwaves aria-valuetext="${lineWaves(b)} waves"></label>
          <label class="sb-range">Sharp ↔ rounded <input type="range" min="0" max="100" step="5" value="${Math.round(lineSoft(b) * 100)}" data-lsoft aria-valuetext="${Math.round(lineSoft(b) * 100)} percent rounded"></label>` : ""}</div>
          <div class="sb-field"><span class="sb-label">Arrowheads</span>
          <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Arrowheads">${[["", "None"], ["end", "At the end →"], ["start", "← At the start"], ["both", "↔ Both"]].map(([k, n]) => `<button type="button" role="radio" data-lends="${k}" aria-checked="${(b.ends || "") === k}">${n}</button>`).join("")}</div></div>
          <div class="sb-field"><span class="sb-label">Drawn with</span>
          <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Drawn with">${[["pencil", "Pencil"], ["", "Pen"], ["brush", "Soft brush"], ["marker", "Marker"], ["nib", "Flat nib"], ["taper", "Cone"], ["sumi", "Japanese brush"], ["bristle", "Bristle brush"]].map(([k, n]) => `<button type="button" role="radio" data-ltip="${k}" aria-checked="${(b.tip || "") === k}">${n}</button>`).join("")}</div>
          <p class="sb-hint">A flat nib is thick across the stroke and thin along it, the way calligraphy goes; a cone starts thick and ends thin; a Japanese brush presses hard, swells, then lifts to a dry flick; a bristle brush is many dry hairs side by side. The thickness below sets the brush.</p></div>
          <div class="sb-field"><span class="sb-label">Thickness</span>
          <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Thickness">${[["hair", "Hair"], ["narrow", "Narrow"], ["medium", "Medium"], ["broad", "Broad"], ["heavy", "Heavy"]].map(([k, n]) => `<button type="button" role="radio" data-thick="${k}" aria-checked="${typeof b.width !== "number" && (b.thick || "narrow") === k}">${n}</button>`).join("")}</div>
          <div class="sb-ptrow" style="margin-top:6px"><input type="range" min="0.2" max="12" step="0.1" value="${lineThick(b)}" data-lwidth aria-label="Thickness in millimetres" style="flex:1"><input type="number" min="0.2" max="12" step="0.1" value="${lineThick(b)}" data-lwidthbox aria-label="Thickness in millimetres"><span>mm</span></div></div>` : ""}
        ${b.k === "text" && !b.fill ? "" : `<label class="sb-range">Fade <input type="range" min="10" max="100" step="5" value="${Math.round(fade * 100)}" data-blkfade aria-valuetext="${Math.round(fade * 100)} percent"></label>`}` : "";
      box.innerHTML = `
        <h3>Add to this page</h3>
        <div class="sb-adds">
          <button type="button" data-addblk="text">+ Words</button>
          <button type="button" data-addblk="photo">+ Photo</button>
          <button type="button" data-addblk="shape">+ Shape</button>
          <button type="button" data-addblk="line">+ Line</button>
          <button type="button" data-addblk="draw" aria-pressed="${drawing}">✎ Draw by hand</button>
        </div>
        <p class="sb-hint">${blocks.length} of ${FREE_MAX} things. Drag anything on the page to move it, pull a corner to resize it, and use the arrow keys to nudge it.</p>
        <h3>On this page</h3>
        ${blocks.length ? `<ol class="sb-blklist">${blocks.map((x, i) => `<li class="sb-blkrow">
            <button type="button" data-pickblk="${i}" aria-pressed="${i === blockSel}">${esc(blockLabel(x))}</button>
            <button type="button" data-blkup="${i}" aria-label="Send back" ${i === 0 ? "disabled" : ""}>▲</button>
            <button type="button" data-blkdown="${i}" aria-label="Bring forward" ${i === blocks.length - 1 ? "disabled" : ""}>▼</button>
            <button type="button" data-blkdel="${i}" aria-label="Remove">✕</button></li>`).join("")}</ol>
          <p class="sb-hint">The last one is on top.</p>` : `<p class="sb-hint">Nothing on this page yet. Add something above, or start again from an arrangement in “+ Add page”.</p>`}
        ${b ? `<div class="sb-sec sb-rowbox"><h3>${esc(BLOCK_NAME[b.k] || "Thing")} ${blockSel + 1}</h3>
          ${words}${paint}${photoShape}
          ${b.k === "photo" ? `<p class="sb-hint">Choose the photograph, and how it sits in its box, below.</p>` : ""}
          ${step("Across", "nudx", "-1", "1", mmX(b.x))}
          ${step("Down", "nudy", "-1", "1", mmY(b.y))}
          ${step("Width", "sizw", "-1", "1", mmX(b.w))}
          ${b.k === "line" && linePath(b) === "h" ? "" : step("Height", "sizh", "-1", "1", mmY(b.h || 0.15))}
          ${step("Turn", "turn", "-15", "15", `${b.r || 0}°`)}
          <div class="sb-field"><span class="sb-label">In front or behind</span>
            <div class="sb-adds"><button type="button" data-tofront ${blockSel === blocks.length - 1 ? "disabled" : ""}>Bring to the front</button><button type="button" data-toback ${blockSel === 0 ? "disabled" : ""}>Send to the back</button></div>
            <p class="sb-hint">Words over a photograph: bring the words to the front, or send the photograph to the back.</p></div>
          <div class="sb-adds"><button type="button" data-fillw>Fill the width</button>${b.k === "line" && linePath(b) === "h" ? "" : `<button type="button" data-fillp>Fill the page</button>`}</div>
        </div>` : ""}
        <div class="sb-field"><span class="sb-label">Page colour</span>
          <span class="sb-swatches" role="group" aria-label="Page colour">${swatch("bg", "", "The style's own", "linear-gradient(135deg, #fff 45%, #999 50%, #fff 55%)", !entry.bg)}${fills.map(([k, n, c]) => swatch("bg", k, n, c, entry.bg === k)).join("")}${anySwatch("bgany", /^#/.test(entry.bg || "") ? entry.bg : "")}</span>
          <div class="sb-cphost" data-bgpick hidden></div></div>`;

      const redraw = () => { change({ rail: true }); drawInspector(); };
      $$("[data-addblk]").forEach((x) => x.addEventListener("click", () => { if (x.dataset.addblk === "draw") { setDrawing(!drawing); return; } addBlock(x.dataset.addblk); }));
      $$("[data-pickblk]").forEach((x) => x.addEventListener("click", () => { blockSel = +x.dataset.pickblk; drawLayer(); drawInspector(); }));
      $$("[data-blkup]").forEach((x) => x.addEventListener("click", () => moveBlock(+x.dataset.blkup, -1)));
      $$("[data-blkdown]").forEach((x) => x.addEventListener("click", () => moveBlock(+x.dataset.blkdown, 1)));
      $$("[data-blkdel]").forEach((x) => x.addEventListener("click", () => removeBlock(+x.dataset.blkdel)));
      $$("[data-bg]").forEach((x) => x.addEventListener("click", () => { mark(); if (x.dataset.bg) entry.bg = x.dataset.bg; else delete entry.bg; redraw(); }));
      if (!b) {
        wireAny($("[data-bgany]"), $("[data-bgpick]"), () => (/^#/.test(entry.bg || "") ? entry.bg : ""), (hex) => {
          mark(true); entry.bg = hex;
          $$("[data-bg]").forEach((x) => x.setAttribute("aria-pressed", "false"));
          change({ rail: true });
        });
        return;
      }
      const setNum = (key, v, lo, hi) => { b[key] = round4(Math.min(hi, Math.max(lo, v))); };
      $$("[data-nudx]").forEach((x) => x.addEventListener("click", () => { mark(true); setNum("x", b.x + (+x.dataset.nudx) / G.Wa, -0.3, 1.3); redraw(); }));
      $$("[data-nudy]").forEach((x) => x.addEventListener("click", () => { mark(true); setNum("y", b.y + (+x.dataset.nudy) / G.Ha, -0.3, 1.3); redraw(); }));
      $$("[data-sizw]").forEach((x) => x.addEventListener("click", () => { mark(true); setNum("w", b.w + (+x.dataset.sizw) * 2 / G.Wa, 0.02, 1.6); redraw(); }));
      $$("[data-sizh]").forEach((x) => x.addEventListener("click", () => { mark(true); setNum("h", b.h + (+x.dataset.sizh) * 2 / G.Ha, 0.02, 1.6); redraw(); }));
      $$("[data-turn]").forEach((x) => x.addEventListener("click", () => {
        mark(true);
        const next = Math.round(((b.r || 0) + (+x.dataset.turn)) * 10) / 10;
        if (next <= -180 || next >= 180 || next === 0) delete b.r; else b.r = next;
        redraw();
      }));
      const toFront = $("[data-tofront]"); if (toFront) toFront.addEventListener("click", () => moveBlockTo(blockSel, "front"));
      const toBack = $("[data-toback]"); if (toBack) toBack.addEventListener("click", () => moveBlockTo(blockSel, "back"));
      const fillBtn = $("[data-fillw]");
      if (fillBtn) fillBtn.addEventListener("click", () => { mark(); b.x = 0; b.w = 1; redraw(); });
      const fillPage = $("[data-fillp]");
      if (fillPage) fillPage.addEventListener("click", () => { mark(); b.x = 0; b.y = 0; b.w = 1; b.h = 1; redraw(); });
      $$("[data-role]").forEach((x) => x.addEventListener("click", () => { mark(); b.role = x.dataset.role; redraw(); }));
      $$("[data-tfit]").forEach((x) => x.addEventListener("click", () => { mark(); if (x.dataset.tfit) b.fit = "cut"; else delete b.fit; redraw(); }));
      $$("[data-thick]").forEach((x) => x.addEventListener("click", () => { mark(); b.thick = x.dataset.thick; delete b.width; redraw(); }));
      // The exact width: the slider and the box move together; typed, it wins over the named ones.
      const wSlide = $("[data-lwidth]"), wBox = $("[data-lwidthbox]");
      const setWidth = (v) => { const n = Math.round(Math.min(12, Math.max(0.2, +v || 0.2)) * 10) / 10; mark(true); b.width = n; $$("[data-thick]").forEach((x) => x.setAttribute("aria-checked", "false")); change({ rail: true }); drawLayer(); if (wSlide) wSlide.value = String(n); if (wBox && document.activeElement !== wBox) wBox.value = String(n); };
      if (wSlide) wSlide.addEventListener("input", () => setWidth(wSlide.value));
      if (wBox) wBox.addEventListener("change", () => setWidth(wBox.value));
      $$("[data-lpath]").forEach((x) => x.addEventListener("click", () => {
        mark();
        const to = x.dataset.lpath;
        if (to === "h") { delete b.path; delete b.pts; delete b.bend; }
        else { b.path = to; if (to !== "free") delete b.pts; if (!(b.h > 0.01)) b.h = to === "v" ? 0.25 : 0.15; }
        redraw();
      }));
      $$("[data-lends]").forEach((x) => x.addEventListener("click", () => { mark(); if (x.dataset.lends) b.ends = x.dataset.lends; else delete b.ends; redraw(); }));
      $$("[data-ltip]").forEach((x) => x.addEventListener("click", () => { mark(); if (x.dataset.ltip) b.tip = x.dataset.ltip; else delete b.tip; redraw(); }));
      const wavesEl = $("[data-lwaves]");
      if (wavesEl) wavesEl.addEventListener("input", () => { mark(true); const n = Math.round(+wavesEl.value); if (n <= 1) delete b.waves; else b.waves = n; wavesEl.setAttribute("aria-valuetext", `${n} waves`); change({ rail: true }); drawLayer(); });
      const softEl = $("[data-lsoft]");
      if (softEl) softEl.addEventListener("input", () => { mark(true); const v = Math.round(+softEl.value) / 100; if (v >= 0.999) delete b.soft; else b.soft = v; softEl.setAttribute("aria-valuetext", `${Math.round(v * 100)} percent rounded`); change({ rail: true }); drawLayer(); });
      const bendEl = $("[data-lbend]");
      if (bendEl) bendEl.addEventListener("input", () => { mark(true); const v = Math.round(+bendEl.value) / 100; if (Math.abs(v - 0.5) < 0.001) delete b.bend; else b.bend = v; bendEl.setAttribute("aria-valuetext", `${Math.round(v * 100)} percent`); change({ rail: true }); drawLayer(); });
      $$("[data-shape]").forEach((x) => x.addEventListener("click", () => { mark(); if (x.dataset.shape === "rect") delete b.shape; else b.shape = x.dataset.shape; redraw(); }));
      const cornerEl = $("[data-cornerpct]");
      if (cornerEl) cornerEl.addEventListener("input", () => {
        mark(true);
        const v = Math.round(+cornerEl.value) / 100;
        if (Math.abs(v - cornerDefault(shapeOf(b))) < 0.005) delete b.corner; else b.corner = v;
        cornerEl.setAttribute("aria-valuetext", `${Math.round(v * 100)} percent`);
        change({ rail: true }); drawLayer();
      });
      // A shape becomes a box of words, or a photograph, cut to that shape.
      $$("[data-into]").forEach((x) => x.addEventListener("click", () => {
        mark();
        const keep = { x: b.x, y: b.y, w: b.w, h: b.h, ...(b.r ? { r: b.r } : {}), ...(b.shape ? { shape: b.shape } : {}), ...(typeof b.corner === "number" ? { corner: b.corner } : {}) };
        for (const k2 of Object.keys(b)) delete b[k2];
        if (x.dataset.into === "text") Object.assign(b, { k: "text", role: "body", t: "", fill: keep.fill || "accent" }, keep, { fill: "accent" });
        else Object.assign(b, { k: "photo" }, keep);
        active = 0; pickerOpen = null;
        redraw();
        const first = $("#sbF_blocktext"); if (first && matchMedia("(pointer: fine)").matches) first.focus();
      }));
      $$("[data-fill]").forEach((x) => x.addEventListener("click", () => {
        mark();
        const key = b.k === "line" ? "color" : "fill";
        if (x.dataset.fill) b[key] = x.dataset.fill; else { delete b[key]; if (b.k === "text") delete b.o; }
        redraw();
      }));
      wireAny($("[data-fillany]"), $("[data-fillpick]"), () => { const v = b.k === "line" ? b.color : b.fill; return /^#/.test(v || "") ? v : ""; }, (hex) => {
        mark(true); b[b.k === "line" ? "color" : "fill"] = hex;
        $$("[data-fill]").forEach((x) => x.setAttribute("aria-pressed", "false"));
        change({ rail: true }); drawLayer();
      });
      wireAny($("[data-bgany]"), $("[data-bgpick]"), () => (/^#/.test(entry.bg || "") ? entry.bg : ""), (hex) => {
        mark(true); entry.bg = hex;
        $$("[data-bg]").forEach((x) => x.setAttribute("aria-pressed", "false"));
        change({ rail: true });
      });
      const fadeEl = $("[data-blkfade]");
      if (fadeEl) fadeEl.addEventListener("input", () => {
        mark(true);
        const v = Math.round(+fadeEl.value) / 100;
        if (v >= 1) delete b.o; else b.o = v;
        fadeEl.setAttribute("aria-valuetext", `${Math.round(v * 100)} percent`);
        change({ rail: true });
      });
      const area = $("#sbF_blocktext");
      if (area) {
        wireField(area, (v) => { mark(true); b.t = v; }, FREE_TEXT_MAX);
        wireFormat(box, blockStyleHost(b));
      }
    }
    // A thing's own formatting, in the same shape every other text uses.
    const blockStyleHost = (b) => ({
      get: () => (b && b.style ? { t: b.style } : {}),
      set: (v) => { if (v && v.t) b.style = v.t; else delete b.style; }
    });
    // Rebuilding the boxes clears their meters, so they are filled again.
    const drawFieldsAndMeters = () => { drawFields(); updateMeters(); };
    function selectOverflow(k) {
      const entry = sel >= 0 ? book.pages[sel] : null;
      const el = $(`#sbF_${k}`); if (!entry || !el || !book) return;
      let info = null;
      if (k === "caption" && (entry.type === "photos" || entry.type === "article")) info = captionFit(entry, captionWidth(book), captionStyle(book));
      else if (WRITING[entry.type]) info = planWriting(book, entry).fields[k];
      if (!info) return;
      // Find where the first word that won't print starts, in what was typed.
      // A quote's own quote marks aren't words on the page.
      const re = /\S+/g; let m, n = 0, at = el.value.length;
      while ((m = re.exec(el.value))) {
        if (!m[0].replace(INVISIBLE, "")) continue;
        if (k === "quote" && /^[“”„"'‘’«»]+$/.test(m[0])) continue;
        if (n === info.printed) { at = m.index; break; }
        n++;
      }
      el.focus();
      el.setSelectionRange(at, el.value.length);
    }

    // How each field fares, from the same plan the PDF is drawn from.
    function updateMeters() {
      if (!book || !fontsOk) return;
      const entry = sel >= 0 ? book.pages[sel] : null;
      if (!entry) return;
      let fields = null, cuts = [];
      if (WRITING[entry.type]) { const plan = planWriting(book, entry); fields = { ...plan.fields }; cuts = plan.cuts; }
      if (entry.type === "photos" || entry.type === "article") {
        const r = captionFit(entry, captionWidth(book), captionStyle(book));
        fields = { ...(fields || {}), caption: r ? { kind: "block", empty: false, ...r } : { kind: "block", empty: true } };
        if (r && r.cut) cuts = [...cuts, { field: "caption", label: "caption" }];
      }
      if (entry.type === "free") {
        const plan = planFree(book, entry);
        const el = $("#sbF_blocktext");
        if (el) {
          const info = plan.fields[`b${blockSel}`];
          const fit = $("#sbF_blocktext_fit"), count = $("#sbF_blocktext_count");
          const m = meterText(info || { kind: "flow", empty: true }, false);
          if (fit) { fit.textContent = m.text; fit.className = m.cls; }
          if (count) { const max = +el.maxLength, len = el.value.length; count.textContent = counter(len, max); count.className = `sb-counter ${len >= max * 0.95 ? "warn" : ""}`; }
        }
        setChip(entry, plan.cuts.length > 0);
        const warn = $("#sbPageWarn");
        if (warn) { warn.hidden = !plan.cuts.length; warn.textContent = plan.cuts.length ? "Too long: a box of words won't all print. Shorten it, make the box bigger, or let the words get smaller." : ""; }
        return;
      }
      if (!fields) {
        // Only lengths to show: About and chapter pages report fit as they draw.
        $$("[data-field]").forEach((el) => { const c = $(`#${el.id}_count`); if (c) c.textContent = counter(el.value.length, +el.maxLength); });
        $$("[id$=_fit]").forEach((el) => { el.textContent = ""; });
        return;
      }
      const required = REQUIRED[entry.type] || [];
      for (const [k, info] of Object.entries(fields)) {
        const el = $(`#sbF_${k}`); if (!el) continue;
        const fit = $(`#sbF_${k}_fit`), count = $(`#sbF_${k}_count`), selBtn = $(`[data-select="${k}"]`);
        const m = meterText(info, required.includes(k));
        fit.textContent = m.text; fit.className = m.cls;
        const max = +el.maxLength, len = el.value.length;
        count.textContent = counter(len, max); count.className = `sb-counter ${len >= max * 0.95 ? "warn" : ""}`;
        if (selBtn) selBtn.hidden = !(info.cut && info.total > info.printed);
      }
      setChip(entry, cuts.length > 0);
    }
    const counter = (len, max) => (max > 0 ? (len >= max * 0.95 ? `${len} / ${max} · ${Math.max(0, max - len)} left` : `${len} / ${max}`) : "");
    function meterText(info, required) {
      if (info.blocked) return { text: info.blocked, cls: "warn" };
      if (info.empty) return required ? { text: "Empty · this page needs it", cls: "warn" } : { text: "Empty · not printed", cls: "" };
      const miss = info.total - info.printed;
      if (info.cut) {
        const tail = info.tail || (info.lines && info.lines.length ? tailOf(info.lines[info.lines.length - 1]) : "");
        return { text: `Too long · ${miss} word${miss === 1 ? "" : "s"} won't print${tail ? `. It ends at “…${tail}”` : ""}`, cls: "bad" };
      }
      if (info.kind === "flow") {
        const all = info.used + info.left;
        const near = info.left <= 2 || info.used / Math.max(1, all) >= 0.9;
        return { text: `${near ? "Nearly full" : "Fits"} · ${info.used} of ${all} lines`, cls: near ? "warn" : "" };
      }
      if (info.nearMin) return { text: "Nearly full · set smaller to fit", cls: "warn" };
      if (info.shrunk) return { text: "Fits · set smaller to fit", cls: "" };
      return { text: info.maxLines > 1 ? `Fits on ${info.lines.length} line${info.lines.length === 1 ? "" : "s"}` : "Fits", cls: "" };
    }

    /* --- photos for the selected page --- */
    function photoTarget() {
      const entry = sel >= 0 ? book.pages[sel] : null;
      if (!entry) return { list: book.cover ? [book.cover] : [], max: 1, set: (l) => { book.cover = l[0] || null; } };
      // On an Anything page the picker works on the chosen photo box.
      if (entry.type === "free") {
        const b = curBlock();
        if (!b || b.k !== "photo") return null;
        return { list: b.p ? [b.p] : [], max: 1, set: (l) => { if (l[0]) b.p = l[0]; else delete b.p; } };
      }
      if (!entry.photos) return null;
      return { list: entry.photos, max: entry.type === "photos" ? MAX_PER_PAGE : entry.type === "feature" ? 2 : 1, set: (l) => { entry.photos = l; } };
    }
    function drawPhotoBlock() {
      const box = $("#sbPhotoBlock"); if (!box) return;
      const entry = sel >= 0 ? book.pages[sel] : null;
      const t = photoTarget();
      if (!t) { box.innerHTML = ""; box.hidden = true; return; }
      box.hidden = false;
      const lib = library();
      const list = t.list;
      if (active >= list.length) active = Math.max(0, list.length - 1);
      const cur = list[active];
      const heading = !entry ? "Cover photo" : entry.type === "photos" ? `Photos · ${list.length} of ${t.max}` : entry.type === "feature" ? `Photos · ${list.length} of 2` : (entry.type === "spread" || entry.type === "note" || entry.type === "article") ? "The photo" : "Photo (optional)";
      const G = geometry(book);
      const positions = entry ? PHOTO_AT[entry.type] : null;
      const at = entry && positions ? photoAtOf(entry, G.L) : null;
      const positionLabel = entry && entry.type === "feature" ? "First photo on the" : entry && entry.type === "article" ? "Photo page on the" : "Where the photo goes";
      const opacity = cur && typeof cur.opacity === "number" ? cur.opacity : 1;
      const open = pickerOpen === null ? (list.length === 0 || (t.max > 1 && list.length < t.max)) : pickerOpen;
      const mode = cur && FIT_MODES.includes(cur.fit) ? cur.fit : "auto";
      const shown = [];
      for (const [id, hit] of lib.byId) {
        if (filter === "diagrams" ? hit.photo.diagram : (filter === "all" || hit.shoot.id === filter)) shown.push([id, hit]);
      }
      box.innerHTML = `
        <h3>${esc(heading)}</h3>
        ${positions && (list.length || entry.type === "note" || entry.type === "feature" || entry.type === "article") ? `<div class="sb-field"><span class="sb-label">${positionLabel}</span>
          <div class="sb-seg" role="radiogroup" aria-label="${positionLabel}">${positions.map((k) => `<button type="button" role="radio" data-photoat="${k}" aria-checked="${at === k}">${POSITION_LABEL[k]}</button>`).join("")}</div></div>` : ""}
        ${list.length ? `<div class="sb-chosen" role="group" aria-label="Chosen">${list.map((s, i) => {
          const hit = lib.byId.get(s.id);
          return `<button type="button" class="sb-ch${hit && hit.photo.diagram ? " diagram" : ""}" data-active="${i}" aria-pressed="${i === active}" aria-label="${t.max > 1 ? `Photo ${i + 1}` : "The photo"}${hit ? `, ${esc(cleanName(hit.shoot.title || hit.shoot.talent))}${hit.photo.diagram ? " lighting diagram" : ""}` : ", from a deleted album"}. Adjust it">${hit ? `<img src="${esc(thumbSrc(hit.photo))}" alt="">` : `<span class="sb-hint">Removed</span>`}${t.max > 1 ? `<i>${i + 1}</i>` : ""}</button>`;
        }).join("")}</div>` : ""}
        ${cur ? `<div class="sb-adjust">
          <div class="sb-adjrow"><span>${t.max > 1 ? `Photo ${active + 1}` : "This photo"}</span><span>
            ${t.max > 1 ? `<button type="button" data-move="-1" aria-label="Move earlier" ${active === 0 ? "disabled" : ""}>←</button><button type="button" data-move="1" aria-label="Move later" ${active === list.length - 1 ? "disabled" : ""}>→</button>` : ""}
            <button type="button" data-remove>Remove</button></span></div>
          ${isDiagram(cur.id) ? `<p class="sb-hint">Lighting diagrams are always shown whole, on white.</p>` : `
          <div class="sb-field"><span class="sb-label">Placement</span>
            <div class="sb-seg" role="radiogroup" aria-label="Placement">${FIT_CHOICES.map(([k, n]) => `<button type="button" role="radio" data-fit="${k}" aria-checked="${mode === k}">${n}</button>`).join("")}</div>
            <p class="sb-hint">${esc(FIT_HINT[mode])}</p></div>
          <label class="sb-range">Zoom <input type="range" min="1" max="3" step="0.05" value="${cur.zoom || 1}" data-slide="zoom"></label>
          <label class="sb-range">Left ↔ right <input type="range" min="0" max="1" step="0.01" value="${cur.x}" data-slide="x"></label>
          <label class="sb-range">Up ↕ down <input type="range" min="0" max="1" step="0.01" value="${cur.y}" data-slide="y"></label>`}
          <label class="sb-range">Opacity <input type="range" min="10" max="100" step="5" value="${Math.round(opacity * 100)}" data-opacity aria-valuetext="${Math.round(opacity * 100)} percent"></label>
        </div>` : ""}
        <details class="sb-pick" ${open ? "open" : ""}>
          <summary>${list.length ? (t.max === 1 ? "Change the photo" : "Add or remove photos") : "Choose a photo"}</summary>
          <label class="sb-vh" for="sbAlbum">Show</label>
          <select id="sbAlbum">
            <option value="all" ${filter === "all" ? "selected" : ""}>All albums (${lib.byId.size})</option>
            <option value="diagrams" ${filter === "diagrams" ? "selected" : ""}>Lighting diagrams (${lib.diagrams})</option>
            ${lib.albums.map((a) => `<option value="${esc(a.id)}" ${filter === a.id ? "selected" : ""}>${esc(a.name)} (${a.count})</option>`).join("")}
          </select>
          <div class="sb-grid">${shown.map(([id, hit]) => {
            const pos = list.findIndex((s) => s.id === id);
            const on = pos >= 0;
            const full = !on && list.length >= t.max && t.max > 1;
            return `<button type="button" class="sb-thumb${hit.photo.diagram ? " diagram" : ""}" data-pick="${esc(id)}" aria-pressed="${on}" data-order="${on && t.max > 1 ? pos + 1 : on ? "✓" : ""}" ${full ? "disabled" : ""} aria-label="${esc(cleanName(hit.shoot.title || hit.shoot.talent))} ${hit.photo.diagram ? "lighting diagram" : "photo"}${on ? ", chosen" : ""}"><img src="${esc(thumbSrc(hit.photo))}" alt="" loading="lazy"></button>`;
          }).join("") || `<p class="sb-hint" style="grid-column: 1 / -1">${filter === "diagrams" ? "No lighting diagrams yet. Add one to an album on the Upload page (Lighting diagram), and it appears here." : "No photos in this album."}</p>`}</div>
        </details>`;

      const setList = (l) => { photoTarget().set(l); };
      const refocus = (sel2) => { const el = $(`#sbPhotoBlock ${sel2}`); if (el) el.focus({ preventScroll: true }); };
      box.querySelectorAll("[data-active]").forEach((b) => b.addEventListener("click", () => { active = +b.dataset.active; drawPhotoBlock(); refocus(`[data-active="${active}"]`); }));
      box.querySelectorAll("[data-photoat]").forEach((b) => b.addEventListener("click", () => {
        const v = b.dataset.photoat;
        if (at === v) return;
        entry.photoAt = v;
        change({ photos: true, rail: false }); refocus(`[data-photoat="${v}"]`);
      }));
      box.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => {
        const l = photoTarget().list.slice(), j = active + +b.dataset.move;
        [l[active], l[j]] = [l[j], l[active]]; setList(l); active = j; change({ photos: true });
        refocus(`[data-move="${b.dataset.move}"]:not(:disabled)`) ; if (!box.isConnected || document.activeElement === document.body) refocus(`[data-active="${active}"]`);
      }));
      const rm = box.querySelector("[data-remove]");
      if (rm) rm.addEventListener("click", () => { const l = photoTarget().list.slice(); l.splice(active, 1); setList(l); active = Math.max(0, active - 1); change({ photos: true }); refocus(`[data-active="${active}"]`); if (document.activeElement === document.body) refocus("summary"); });
      box.querySelectorAll("[data-fit]").forEach((b) => b.addEventListener("click", () => {
        const l = photoTarget().list.slice();
        const next = { ...l[active] };
        if ((next.fit || "auto") === b.dataset.fit) return;
        if (b.dataset.fit === "auto") delete next.fit; else next.fit = b.dataset.fit;
        l[active] = next; setList(l); change({ photos: true, rail: false });
        const again = box.querySelector(`[data-fit="${b.dataset.fit}"]`); if (again) again.focus();
      }));
      // Sliders move the photo live without rebuilding the controls under the finger.
      box.querySelectorAll("[data-slide]").forEach((r) => r.addEventListener("input", () => {
        const l = photoTarget().list.slice();
        l[active] = { ...l[active], [r.dataset.slide]: +r.value };
        setList(l); change({ rail: false });
      }));
      const op = box.querySelector("[data-opacity]");
      if (op) op.addEventListener("input", () => {
        const l = photoTarget().list.slice();
        const next = { ...l[active] };
        const v = Math.round(+op.value) / 100;
        if (v >= 1) delete next.opacity; else next.opacity = Math.max(0.1, v);
        op.setAttribute("aria-valuetext", `${Math.round(v * 100)} percent`);
        l[active] = next; setList(l); change({ rail: false });
      });
      const det = box.querySelector(".sb-pick");
      det.addEventListener("toggle", () => { pickerOpen = det.open; });
      box.querySelector("#sbAlbum").addEventListener("change", (e) => { filter = e.target.value; pickerOpen = true; drawPhotoBlock(); const s = $("#sbAlbum"); if (s) s.focus(); });
      box.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
        const id = b.dataset.pick;
        const tt = photoTarget();
        const l = tt.list.slice();
        const at = l.findIndex((s) => s.id === id);
        if (at >= 0) { l.splice(at, 1); active = Math.min(active, Math.max(0, l.length - 1)); }
        else {
          const hit = lib.byId.get(id);
          const f = hit && !hit.photo.diagram ? API.photoFocus(hit.photo) : { x: 0.5, y: 0.5 };
          const shot = { id, x: +f.x.toFixed(3), y: +f.y.toFixed(3), zoom: 1 };
          if (tt.max === 1) l.splice(0, l.length, shot);
          else if (l.length < tt.max) l.push(shot);
          active = tt.max === 1 ? 0 : l.length - 1;
        }
        setList(l);
        pickerOpen = tt.max > 1 ? true : l.length === 0;
        const grid = box.querySelector(".sb-grid"), scroll = grid ? grid.scrollTop : 0;
        change({ photos: true });
        const g2 = $("#sbPhotoBlock .sb-grid"); if (g2) g2.scrollTop = scroll;
        patchRail();
        if (entry && entry.type === "photos") drawFields();   // a border depends on how many photos
        const again = $(`#sbPhotoBlock [data-pick="${window.CSS && window.CSS.escape ? window.CSS.escape(id) : id}"]`);
        if (again) again.focus({ preventScroll: true }); else refocus("summary");
      }));
    }

    /* --- the inspector: design --- */
    function drawDesign() {
      const panel = $("#sbPanelDesign"); if (!panel) return;
      panel.innerHTML = `
        <div class="sb-sec"><h3>Style</h3>
          <div class="sb-styles" role="radiogroup" aria-label="Style">${STYLES.map((s) => `<button type="button" class="sb-style" role="radio" data-style="${s.key}" aria-checked="${book.style === s.key}"><b>${esc(s.name)}</b><span>${esc(s.note)}</span></button>`).join("")}</div>
        </div>
        <div class="sb-sec"><h3>Colourway</h3>
          <div class="sb-cws" role="radiogroup" aria-label="Colourway">${COLOURWAYS.map((c) => `<button type="button" class="sb-cw" role="radio" data-cw="${c.key}" aria-checked="${book.colourway === c.key}"><span class="sb-dot" aria-hidden="true" style="background: conic-gradient(${c.accent} 0 50%, ${c.deep} 50% 75%, ${c.paper} 75% 100%)"></span>${esc(c.name)}</button>`).join("")}</div>
        </div>
        <div class="sb-sec"><h3>Page shape</h3>
          <div class="sb-seg" role="radiogroup" aria-label="Page shape">${["portrait", "landscape"].map((o) => `<button type="button" role="radio" data-orient="${o}" aria-checked="${book.orientation === o}">${o === "portrait" ? "Portrait" : "Landscape"}</button>`).join("")}</div>
        </div>
        <div class="sb-sec"><h3>Paper size</h3>
          <div class="sb-seg" role="radiogroup" aria-label="Paper size">${Object.entries(PAPERS).map(([k, p]) => `<button type="button" role="radio" data-paper="${k}" aria-checked="${(book.paper || "a4") === k}">${esc(p.name)}</button>`).join("")}</div>
          <p class="sb-hint" id="sbPaperNote">${esc((PAPERS[book.paper] || PAPERS.a4).note)}. Every size keeps the same layout; the words and photos scale with the page.</p>
        </div>
        <div class="sb-sec"><h3>Page colour, every page</h3>
          <span class="sb-swatches" role="group" aria-label="Page colour for every page">${[["", "The style's own", "linear-gradient(135deg, #fff 45%, #999 50%, #fff 55%)"], ["paper", "Paper", colourway(book.colourway).paper], ["white", "White", colourway(book.colourway).white], ["ink", "Ink", colourway(book.colourway).ink], ["soft", "Soft", colourway(book.colourway).soft], ["accent", "Accent", colourway(book.colourway).accent], ["deep", "Deep", colourway(book.colourway).deep], ["rule", "Hairline", colourway(book.colourway).rule]].map(([k, n, c]) => `<button type="button" class="sb-swatch" data-bookbg="${k}" aria-pressed="${(book.bg || "") === k}" title="${n}" aria-label="${n}"><i style="background:${c}"></i></button>`).join("")}${anySwatch("bookbgany", /^#/.test(book.bg || "") ? book.bg : "")}</span>
          <div class="sb-cphost" data-bookbgpick hidden></div>
          <p class="sb-hint">Behind every page but the cover, in one go. A page can still have its own colour on This page.</p>
        </div>
        <div class="sb-sec"><h3>The foot of every page</h3>
          ${overHtml("sbFootText", "Name in the foot", book.footText, (window.STUDIO_BOOK_LIMITS || {}).footText || 40, studio())}
          <label class="sb-check-row"><input type="checkbox" id="sbNums" ${book.showPageNumbers === false ? "" : "checked"}> Print page numbers</label>
        </div>`;
      wireOver("sbFootText", (v) => { if (String(v).trim()) book.footText = v; else delete book.footText; });
      panel.querySelectorAll("[data-bookbg]").forEach((x) => x.addEventListener("click", () => {
        mark();
        if (x.dataset.bookbg) book.bg = x.dataset.bookbg; else delete book.bg;
        panel.querySelectorAll("[data-bookbg]").forEach((y) => y.setAttribute("aria-pressed", String(y === x)));
        const any = panel.querySelector("[data-bookbgany]"); if (any) any.setAttribute("aria-pressed", "false");
        change(); drawPageBg();
      }));
      wireAny(panel.querySelector("[data-bookbgany]"), panel.querySelector("[data-bookbgpick]"), () => (/^#/.test(book.bg || "") ? book.bg : ""), (hex) => {
        mark(true); book.bg = hex;
        panel.querySelectorAll("[data-bookbg]").forEach((y) => y.setAttribute("aria-pressed", "false"));
        change(); drawPageBg();
      });
      $("#sbNums").addEventListener("change", (e) => {
        if (e.target.checked) delete book.showPageNumbers; else book.showPageNumbers = false;
        change();
      });
      const radio = (selector, apply, current) => panel.querySelectorAll(selector).forEach((b) => b.addEventListener("click", () => {
        if (current(b)) return;
        const before = fontsOk ? new Set(bookCuts(book).filter((x) => x.cuts.length).map((x) => x.entry)) : null;
        panel.querySelectorAll(selector).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        apply(b);
        change();
        drawPhotoBlock();
        if (!before) return;
        // Words that fitted can stop fitting in another style or shape: say so.
        const now = bookCuts(book).filter((x) => x.cuts.length);
        now.forEach((x) => tooLong.set(x.entry, true));
        const fresh = now.filter((x) => !before.has(x.entry)).map((x) => x.n);
        if (fresh.length) {
          const msg = `In ${(STYLES.find((s) => s.key === book.style) || {}).name} ${book.orientation}, page${fresh.length === 1 ? "" : "s"} ${fresh.join(", ")} ${fresh.length === 1 ? "is" : "are"} now too long.`;
          setStatus(msg); API.toast(msg);
        }
      }));
      radio("[data-style]", (b) => { book.style = b.dataset.style; drawFields(); }, (b) => book.style === b.dataset.style);
      radio("[data-cw]", (b) => { book.colourway = b.dataset.cw; drawFields(); }, (b) => book.colourway === b.dataset.cw);
      radio("[data-orient]", (b) => { book.orientation = b.dataset.orient; }, (b) => book.orientation === b.dataset.orient);
      radio("[data-paper]", (b) => {
        if (b.dataset.paper === "a4") delete book.paper; else book.paper = b.dataset.paper;
        const note = $("#sbPaperNote"); if (note) note.textContent = `${(PAPERS[book.paper] || PAPERS.a4).note}. Every size keeps the same layout; the words and photos scale with the page.`;
      }, (b) => (book.paper || "a4") === b.dataset.paper);
    }

    /* --- checks, publish, download --- */
    async function problems(b) {
      await ensureFonts();
      const lib = library();
      await ensureBookFonts(b);
      const out = [];
      if (b.cover && !lib.byId.has(b.cover.id)) out.push({ i: -1, text: "Cover: the photo is from a deleted album" });
      let n = 1;
      for (let i = 0; i < b.pages.length; i++) {
        const pg = b.pages[i];
        const first = n + 1; n += pageSpan(pg);
        if (n > MAX_PAGES) break;
        const add = (text) => out.push({ i, text: `Page ${pad2(first)} · ${PAGE_LABEL[pg.type]}: ${text}` });
        if ((pg.type === "photos" || pg.type === "spread") && !(pg.photos || []).length) add("no photos yet");
        if (pageSpan(pg) === 2 && first % 2 === 1) add(`starts on a right-hand page, so its two halves would be split by a page turn — move it, or put a page before it, so it starts on an even page`);
        if ((pg.type === "note" || pg.type === "article") && !(pg.photos || []).length) add("no photo chosen");
        if (pg.type === "feature" && (pg.photos || []).length < 2) add(`${(pg.photos || []).length ? "only one photo" : "no photos"} chosen; it takes two`);
        if ((pg.photos || []).some((sh) => !lib.byId.has(sh.id))) add("a photo from a deleted album");
        if (pg.type === "free") {
          const blocks = freeBlocks(pg);
          if (!blocks.length) add("nothing on this page yet");
          if (blocks.some((b2) => b2.k === "photo" && b2.p && !lib.byId.has(b2.p.id))) add("a photo from a deleted album");
          if (blocks.some((b2) => b2.k === "photo" && !(b2.p && b2.p.id))) add("a photo box with no photo chosen");
          const plan = planFree(b, pg);
          for (const c of plan.cuts) {
            const info = plan.fields[c.field];
            const miss = info ? info.total - info.printed : 0;
            add(`a box of words is too long${miss ? ` (${miss} word${miss === 1 ? "" : "s"} won't print)` : ""}`);
          }
        }
        if (WRITING[pg.type]) {
          const plan = planWriting(b, pg);
          const rows = [...(Array.isArray(pg.items) ? pg.items : []), ...(pg.steps || [])];
          if (!Object.keys(fieldCaps()[pg.type] || {}).some((k) => oneParagraph(pg[k]).length) && !rows.some((row) => Object.values(row).some((v) => typeof v === "string" && oneParagraph(v).length))) add("no words yet");
          else {
            for (const k of REQUIRED[pg.type] || []) if (plan.fields[k] && plan.fields[k].empty) add(`the ${({ headline: "headline", body: pg.type === "letter" ? "letter" : "story", title: "title", note: "words about the picture", quote: "quote", heading: "heading" })[k]} is empty`);
            if (pg.type === "article" && pg.caption && bookCuts({ ...b, pages: [pg] })[0].cuts.some((c) => c.field === "caption")) add("the caption is too long");
            for (const c of plan.cuts) {
              const info = plan.fields[c.field];
              const miss = info ? info.total - info.printed : 0;
              add(`the ${c.label} is too long${miss ? ` (${miss} word${miss === 1 ? "" : "s"} won't print)` : ""}`);
            }
          }
        } else if (pg.type === "photos" && pg.caption) {
          if (bookCuts({ ...b, pages: [pg] })[0].cuts.length) add("the caption is too long");
        } else if (pg.type === "about" || pg.type === "divider") {
          for await (const r of renderPages(b, { dpi: 72, cache, only: i })) { (r.page.cuts || []).forEach((c) => add(`the ${c.label} is too long`)); r.page.canvas.width = 0; }
        }
      }
      return out;
    }
    /* A booklet: the pages two to a sheet, in the order that folds. The sheet
       is the size up from the page — A5 pages on A4 sheets, the case a home
       printer can manage — and the note says so, and how to print it. */
    function bookletNote() {
      const el = $("#sbBookletNote"), fold = $('[data-print="fold"]'), pdf = $("#sbPdf"); if (!el || !fold) return;
      const sheet = SHEETS[book.paper || "a4"];
      const can = book.orientation !== "landscape";
      fold.disabled = !can;
      if (!can && printMode === "fold") { printMode = "normal"; $$("[data-print]").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.print === "normal"))); }
      if (pdf) pdf.textContent = printMode === "fold" ? "Download PDF to fold" : "Download PDF";
      if (!can) { el.textContent = `Normal: one ${sheet.page} page per sheet. Folding needs a portrait book — a landscape one would fold along the top edge.`; return; }
      if (printMode !== "fold") { el.textContent = `Normal: one ${sheet.page} page per sheet, the size you chose in Design.`; return; }
      const n = renderedCount(book), padded = Math.ceil(n / 4) * 4;
      el.textContent = `Fold in half: ${sheet.page} pages two to a ${sheet.name} sheet, in folding order${padded > n ? ` (${padded - n} blank page${padded - n === 1 ? "" : "s"} added to fill the last sheet)` : ""}. Print two-sided, flipping on the short edge, then fold the stack down the middle and staple.${book.paper !== "a5" ? " For A4 sheets from a home printer, set the paper to A5 in Design first." : ""}`;
    }
    // Every photo a book draws, cover and Anything-page boxes included.
    function bookPhotoIds(b) {
      const ids = new Set();
      const add = (s) => { if (s && typeof s.id === "string" && !isDiagram(s.id)) ids.add(s.id); };
      add(b.cover);
      for (const pg of b.pages || []) {
        (pg.photos || []).forEach(add);
        if (pg.type === "free") for (const blk of freeBlocks(pg)) if (blk.k === "photo") add(blk.p);
      }
      return [...ids];
    }
    // Where a photo sits, for the notes: "the cover", "page 03", "page 05 (2nd photo)".
    function photoPlaces(b) {
      const places = new Map();
      const note = (id, where) => { if (!id) return; if (!places.has(id)) places.set(id, []); places.get(id).push(where); };
      const nth = (k) => ["1st", "2nd", "3rd", "4th", "5th", "6th"][k] || `${k + 1}th`;
      if (b.cover) note(b.cover.id, "the cover");
      let n = 1;
      for (const pg of b.pages || []) {
        const first = n + 1; n += pageSpan(pg);
        if (n > MAX_PAGES) break;
        const shots = pg.type === "free" ? freeBlocks(pg).filter((x) => x.k === "photo").map((x) => x.p) : (pg.photos || []);
        shots.forEach((s, k) => { if (s) note(s.id, `page ${pad2(first)}${shots.length > 1 ? ` (${nth(k)} photo)` : ""}`); });
      }
      return places;
    }
    const thumbLoader = () => {
      const lib = library();
      return async (id) => { const hit = lib.byId.get(id); return hit && !isDiagram(id) ? API.loadImage(thumbSrc(hit.photo), cache) : null; };
    };
    async function originalsFor(b, dpi) {
      if (!originals.count()) return null;
      const m = await originals.match(bookPhotoIds(b), thumbLoader());
      if (!m.matched.size) return null;
      const G = geometry(b);
      // Nothing on a page is drawn bigger than the page, and a crop shows
      // at most part of a photo: twice the page's long side keeps every
      // crop at full resolution without holding more than that.
      return originalLoader(m.matched, Math.round(Math.max(G.pw, G.ph) * dpi / 25.4 * 2));
    }
    function dpiNote() {
      const el = $("#sbDpiNote"); if (!el) return;
      const have = lastMatch && lastMatch.matched.size;
      el.textContent = exportDpi === 300
        ? (have ? "300 dpi is what a print shop asks for. The file is about four times the size of the 150 dpi one." : "300 dpi is what a print shop asks for. Without your full-size photos (below), a photo is sharp only up to about half a page: the site keeps each at 1600 px.")
        : "150 dpi suits a screen, email and a home printer. Choose 300 dpi for a print shop.";
    }
    let origToken = 0;
    async function originalsNote() {
      const el = $("#sbOrigStatus"), forget = $("#sbOrigForget"); if (!el) return;
      const token = ++origToken;
      if (!originals.count()) { lastMatch = null; el.innerHTML = originals.raw ? `<p class="sb-warn">${originals.raw} RAW file${originals.raw === 1 ? "" : "s"} skipped: a browser can't read them. Export them as JPEGs first.</p>` : ""; forget.hidden = true; dpiNote(); return; }
      forget.hidden = false;
      const ids = bookPhotoIds(book);
      el.innerHTML = `<p class="sb-hint">Looking through ${originals.count()} files…</p>`;
      const m = await originals.match(ids, thumbLoader(), (d, t) => { if (token === origToken && $("#sbOrigStatus")) el.innerHTML = `<p class="sb-hint">Looking for photo ${d} of ${t}…</p>`; });
      if (token !== origToken || !$("#sbOrigStatus")) return;
      lastMatch = m;
      const places = photoPlaces(book);
      const where = (list) => list.map((id) => (places.get(id) || ["somewhere"]).join(" and ")).join("; ");
      const s = (k) => (k === 1 ? "" : "s");
      const lines = [`<p class="${m.matched.size ? "sb-ok" : "sb-warn"}">${m.matched.size} of the ${ids.length} photo${s(ids.length)} in this book found among ${originals.count()} file${s(originals.count())}.</p>`];
      if (m.missing.length) lines.push(`<p class="sb-hint">Not in these files: ${esc(where(m.missing))}.</p>`);
      if (m.ambiguous.length) lines.push(`<p class="sb-hint">Two files look alike, so neither was used for ${esc(where(m.ambiguous))}.</p>`);
      if (m.small.length) lines.push(`<p class="sb-hint">Found, but no bigger than the site's copy: ${esc(where(m.small))}.</p>`);
      if (originals.raw) lines.push(`<p class="sb-hint">${originals.raw} RAW file${s(originals.raw)} skipped: a browser can't read them. Export them as JPEGs first.</p>`);
      el.innerHTML = lines.join("");
      dpiNote();
    }
    async function drawCheck() {
      const box = $("#sbCheck"); if (!box) return;
      bookletNote();
      $$("[data-dl]").forEach((b2) => { if (b2.dataset.anyway) { delete b2.dataset.anyway; b2.textContent = b2.textContent.replace(/ anyway$/, ""); } });
      { const note = $("#sbAnyway"); if (note) note.hidden = true; }
      dpiNote();
      if (originals.count()) originalsNote();
      box.innerHTML = `<p class="sb-hint">Checking…</p>`;
      const list = await problems(book);
      if (!$("#sbCheck")) return;
      box.innerHTML = list.length
        ? `<p class="sb-warn">${list.length} thing${list.length === 1 ? "" : "s"} to look at:</p><ul class="sb-check">${list.map((p) => `<li><span>${esc(p.text)}</span><button type="button" class="sb-link" data-go="${p.i}">Go</button></li>`).join("")}</ul>`
        : `<p class="sb-hint">All pages are ready.</p>`;
      box.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
        $("#sbDlPop").hidden = true; $("#sbDlToggle").setAttribute("aria-expanded", "false");
        select(+b.dataset.go); setTabPage();
        const bad = $("#sbPanelPage .bad");
        const field = bad && bad.closest(".sb-field") && bad.closest(".sb-field").querySelector("[data-field]");
        if (field) field.focus();
      }));
    }

    async function publish() {
      const btn = $("#sbPublish");
      // An unsaved edit must not be reported as published while the older
      // stored version is what actually goes out.
      if (!flush()) { API.toast("Not published: this book could not be saved on this device first."); return; }
      btn.disabled = true; setStatus("Publishing…");
      try {
        const ok = await API.publish();
        const status = ok ? `Published ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${longNote()}` : "Saved on this device — publish failed";
        // Publishing repaints the site, which mounts the builder again: it
        // reopens this book, on this page, with this status.
        remember({ status });
        setStatus(status);
        if (ok) API.toast("Your books are published with your albums and open on any device.");
      } catch (e) {
        setStatus("Saved on this device — publish failed");
      } finally { btn.disabled = false; }
    }

    async function download(btn, format, watermarked) {
      flush();
      // A frozen copy: an edit made while pages are being drawn must not end up
      // half in the file, mixing two styles or losing a page it had counted.
      const snap = JSON.parse(JSON.stringify(book));
      const list = await problems(snap);
      // Things to look at are listed in the menu; the first press says so and
      // turns the button into "anyway", the second goes ahead. No pop-up.
      if (list.length && !btn.dataset.anyway) {
        await drawCheck();
        btn.dataset.anyway = "1";
        btn.textContent = `${btn.textContent.replace(/ anyway$/, "")} anyway`;
        const note = $("#sbAnyway");
        if (note) {
          note.hidden = false;
          note.innerHTML = `<b>${list.length} thing${list.length === 1 ? "" : "s"} to look at</b> — fix ${list.length === 1 ? "it" : "them"}, or press the button again to download anyway.<ul class="sb-check">${list.slice(0, 6).map((x) => `<li><span>${esc(x.text)}</span><button type="button" class="sb-link" data-go="${x.i}">Go</button></li>`).join("")}${list.length > 6 ? `<li><span>…and ${list.length - 6} more, in the check above.</span></li>` : ""}</ul>`;
          note.querySelectorAll("[data-go]").forEach((g) => g.addEventListener("click", () => { $("#sbDlPop").hidden = true; $("#sbDlToggle").setAttribute("aria-expanded", "false"); select(+g.dataset.go); setTabPage(); }));
        }
        return;
      }
      delete btn.dataset.anyway;
      { const note = $("#sbAnyway"); if (note) note.hidden = true; }
      const buttons = $$("[data-dl]");
      const label = btn.textContent;
      const ready = $("#sbReady");
      buttons.forEach((b) => { b.disabled = true; });
      btn.textContent = format === "png" ? "Making the images…" : format === "booklet" ? "Making the booklet…" : "Making the PDF…";
      ready.replaceChildren(); dropFiles();
      const base = `${(snap.name || "portfolio").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "portfolio"}${format === "booklet" ? "-booklet" : ""}${watermarked ? "-watermarked" : ""}`;
      try {
        // The chosen resolution first, then softer if the device runs short of memory.
        let result = null, lastErr = null, madeAt = 0, fullSize = 0;
        for (const dpi of (exportDpi === 300 ? [300, 150, 110] : [150, 110])) {
          const orig = await originalsFor(snap, dpi);
          try {
            const out = [];
            let done = 0;
            const pageJpeg = [];    // for a booklet: every page, compressed, by number
            for await (const r of renderPages(snap, { dpi, watermarked, cache, originals: orig })) {
              if (orig) await orig.release();       // the page holds its pixels now
              const { canvas, links, pt, scale } = r.page;
              // Links are placed in design mm; the PDF wants printed mm.
              const printed = (links || []).map((l) => ({ ...l, x: l.x * (scale || 1), y: l.y * (scale || 1), w: l.w * (scale || 1), h: l.h * (scale || 1) }));
              if (format === "pdf") out.push({ jpeg: await API.canvasJpeg(canvas, 0.9), width: canvas.width, height: canvas.height, links: printed, pt });
              else if (format === "booklet") pageJpeg[r.n] = { jpeg: await API.canvasJpeg(canvas, 0.92), w: canvas.width, h: canvas.height };
              else out.push({ blob: await API.canvasPng(canvas), n: r.n });
              canvas.width = 0; canvas.height = 0;            // release before the next page
              done++; btn.textContent = `${format === "png" ? "Making the images" : format === "booklet" ? "Making the booklet" : "Making the PDF"}… ${done}/${renderedCount(snap)}`;
            }
            if (format === "booklet") {
              // Each side of each sheet: two pages side by side, decoded two at
              // a time so a long book never holds every page in memory at once.
              const G = geometry(snap), sheet = SHEETS[snap.paper || "a4"], k = dpi / 25.4;
              const n = renderedCount(snap);
              const sides = bookletSides(n);
              const sw = Math.round(sheet.w * k), sh = Math.round(sheet.h * k);
              const pw = Math.round(G.pw * k), ph = Math.round(G.ph * k);
              const left = Math.round((sw - 2 * pw) / 2), top = Math.round((sh - ph) / 2);
              let made = 0;
              for (const [a, b2] of sides) {
                const c = document.createElement("canvas"); c.width = sw; c.height = sh;
                const ctx = c.getContext("2d");
                ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, sw, sh);
                for (const [k2, x] of [[a, left], [b2, left + pw]]) {
                  if (!k2 || !pageJpeg[k2]) continue;
                  const bmp = await createImageBitmap(new Blob([pageJpeg[k2].jpeg], { type: "image/jpeg" }));
                  ctx.drawImage(bmp, x, top, pw, ph);
                  if (bmp.close) bmp.close();
                }
                // A faint fold line, so the stack is folded in the right place.
                ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(Math.round(sw / 2), 0, 1, Math.round(4 * k)); ctx.fillRect(Math.round(sw / 2), sh - Math.round(4 * k), 1, Math.round(4 * k));
                out.push({ jpeg: await API.canvasJpeg(c, 0.9), width: sw, height: sh, links: [], pt: { w: sheet.w * 72 / 25.4, h: sheet.h * 72 / 25.4 } });
                c.width = 0; c.height = 0;
                made++; btn.textContent = `Making the booklet… sheet side ${made}/${sides.length}`;
              }
            }
            result = format === "png" ? out : await API.buildPdf(out, `${snap.name} — ${studio()}${format === "booklet" ? " (booklet)" : ""}`);
            madeAt = dpi; fullSize = orig ? orig.used.size : 0;
            break;
          } catch (err) { lastErr = err; } finally { if (orig) await orig.release(); }
        }
        const madeNote = `${madeAt} dpi${fullSize ? ` · ${fullSize} full-size photo${fullSize === 1 ? "" : "s"}` : ""}`;
        const softer = madeAt && madeAt < exportDpi ? `<p class="sb-warn">Made at ${madeAt} dpi: this device ran short of memory at ${exportDpi}. Try on a computer, or with fewer pages.</p>` : "";
        if (!result) throw lastErr || new Error("unknown error");
        if (!ready.isConnected) return;
        if (format !== "png") {
          const blob = new Blob([result], { type: "application/pdf" });
          const url = URL.createObjectURL(blob); fileUrls.push(url);
          const name = `${base}.pdf`;
          // A phone can't save a file from a link the way a laptop does — an
          // iPhone opens it instead — so it also gets the share sheet, where
          // "Save to Files", AirDrop and WhatsApp live.
          let file = null;
          try { file = new File([blob], name, { type: "application/pdf" }); } catch (e) { file = null; }
          const canShare = !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
          ready.innerHTML = `<a href="${url}" download="${esc(name)}">Save ${format === "booklet" ? "booklet" : "PDF"} (${(blob.size / 1048576).toFixed(1)} MB · ${madeNote})</a>${canShare ? `<button type="button" class="sb-btn dark" id="sbShare">Share or save to Files</button>` : ""}${softer}`;
          const share = $("#sbShare");
          if (share) share.addEventListener("click", () => navigator.share({ files: [file], title: snap.name }).catch(() => { /* the sheet was closed */ }));
          if (!matchMedia("(pointer: coarse)").matches) ready.querySelector("a").click();
          else {
            const pop = $("#sbDlPop"); if (pop) { pop.hidden = false; $("#sbDlToggle").setAttribute("aria-expanded", "true"); }
            (share || ready.querySelector("a")).focus();
            API.toast(canShare ? "Your PDF is ready: tap “Share or save to Files” in Download." : "Your PDF is ready: tap “Save PDF” in Download.");
          }
        } else {
          ready.innerHTML = result.map((r) => {
            const url = URL.createObjectURL(r.blob); fileUrls.push(url);
            return `<a href="${url}" download="${esc(base)}-page-${pad2(r.n)}.png">Page ${r.n}</a>`;
          }).join("") + `<p class="sb-hint">${madeNote}</p>` + softer;
          if (!matchMedia("(pointer: coarse)").matches) {
            // One after another: a browser asked for many files at once keeps the first.
            [...ready.querySelectorAll("a")].forEach((a, i) => setTimeout(() => {
              Object.assign(document.createElement("a"), { href: a.href, download: a.getAttribute("download") }).click();
            }, i * 450));
          }
        }
      } catch (err) {
        ready.innerHTML = `<p class="sb-warn">Couldn't make the ${format === "png" ? "images" : format === "booklet" ? "booklet" : "PDF"} (${esc(err.message || err)}). Try again, or with fewer pages.</p>`;
      } finally {
        buttons.forEach((b) => { b.disabled = false; });
        btn.textContent = label.replace(/ anyway$/, "");
      }
    }

    if (!API.isAdmin()) { root.innerHTML = `<p class="sb-warn">The portfolio book is for the studio. Switch on admin mode to use it.</p>`; return; }
    // This builder saves writing pages, captions and photo placements. A tab
    // that loaded the site before they existed still runs the old save code,
    // which would drop them while saying "Saved": refuse until it reloads.
    const L = window.STUDIO_BOOK_LIMITS;
    if (!L || !L.fields || !L.fits || !L.papers || !L.borders || !L.fonts || !L.contactRows || !L.workWays || !L.markStrengths || !L.paras || !L.coverText || !L.blockKinds || !L.schema || !L.lists || !L.photoRows || !(L.pageTypes || []).includes("free")) {
      root.innerHTML = `<div class="sb-empty"><p class="sb-warn">The site was updated while this tab was open.</p><p class="sb-hint">Reload the page (or use “↻ Load fresh version”) before editing your books, so nothing you write is lost.</p><p><button type="button" class="sb-btn dark" id="sbReload">Reload now</button></p></div>`;
      root.querySelector("#sbReload").addEventListener("click", () => location.reload());
      return;
    }
    let reopen = null;
    try { reopen = JSON.parse(sessionStorage.getItem(OPEN_KEY) || "null"); } catch (e) { reopen = null; }
    const again = reopen && state.versions.find((v) => v.id === reopen.id);
    if (again) openBook(JSON.parse(JSON.stringify(again)), false, reopen); else showList();
  }

  window.StudioBook = { mount, renderPages, COLOURWAYS, STYLES, newBook, geometry, PAPERS, WAYS_COPY, PROCESS_COPY, bookletSides, SHEETS, fingerprint, fpScore, fpColour, imageHeader, originalsStore, originalLoader };
})();
