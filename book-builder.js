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
  function fitLines(page, s, maxMm, maxLines, weight, startMm, minMm, family, spacingMm = 0) {
    let size = startMm, lines;
    for (;;) {
      font(page, weight, size, family, spacingMm);
      lines = wrap(page, s, maxMm);
      if (lines.length <= maxLines || size <= minMm) break;
      size = Math.max(minMm, size - 0.5);
    }
    const cut = lines.length > maxLines;
    if (cut) {
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
    if (shot && isDiagram(shot.id)) {
      rect(page, x, y, w, h, "#FFFFFF");
      const a = iw / ih, pad = Math.min(w, h) * 0.04;
      let dw = w - 2 * pad, dh = dw / a;
      if (dh > h - 2 * pad) { dh = h - 2 * pad; dw = dh * a; }
      page.ctx.drawImage(img, 0, 0, iw, ih, page.u(x + (w - dw) / 2), page.u(y + (h - dh) / 2), page.u(dw), page.u(dh));
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
    page.ctx.drawImage(img, (iw - sw) * fx, (ih - sh) * fy, sw, sh, dx, dy, dw, dh);
    page.photos.push({ id: shot && shot.id, x, y, w, h });
    return { x: dx / page.u(1), y: dy / page.u(1), w: dw / page.u(1), h: dh / page.u(1) };
  }
  // Fit whole (no crop) inside the box, centred, or against its right edge when
  // words sit to the right of it; returns the rectangle used. A placement the
  // studio chose for the photo overrides the style's habit.
  function fitPhoto(page, img, shot, x, y, w, h, right = false) {
    if (shot && FIT_MODES.includes(shot.fit)) return drawPhoto(page, img, shot, x, y, w, h);
    const a = (img.naturalWidth || 1) / (img.naturalHeight || 1);
    let dw = w, dh = w / a;
    if (dh > h) { dh = h; dw = h * a; }
    const dx = right ? x + w - dw : x + (w - dw) / 2, dy = y + (h - dh) / 2;
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

  function watermark(page, W, H) {
    const ctx = page.ctx;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#D24E1A";
    font(page, 700, 6, F.mono, 0.6);
    ctx.textAlign = "center";
    ctx.translate(page.u(W / 2), page.u(H / 2));
    ctx.rotate(-Math.PI / 6);
    const span = Math.hypot(W, H);
    for (let row = -span / 2; row <= span / 2; row += 24) {
      for (let col = -span / 2; col <= span / 2; col += 90) ctx.fillText("nerdyphotographer.in", page.u(col), page.u(row));
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

  /* ---------- page plan ------------------------------------------------------
     A book is a cover plus its page entries. A spread takes two pages. */
  const renderedCount = (book) => 1 + book.pages.reduce((n, pg) => n + (pg.type === "spread" ? 2 : 1), 0);

  // Where each photo goes on a page, in mm inside the box (x0, y0, W, H).
  // Chooses from the shapes of the photos on it, as a picture editor would.
  function cells(n, box, g, aspects, pageLandscape) {
    const { x: x0, y: y0, w: W, h: H } = box;
    const port = aspects.map((a) => a < 1);
    const allPort = port.every(Boolean), allLand = port.every((p) => !p);
    const grid = (cols, rows) => {
      const cw = (W - g * (cols - 1)) / cols, ch = (H - g * (rows - 1)) / rows, out = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: x0 + c * (cw + g), y: y0 + r * (ch + g), w: cw, h: ch });
      return out.slice(0, n);
    };
    if (n <= 1) return [{ x: x0, y: y0, w: W, h: H }];
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
  const cfg = () => API.config() || {};
  const studio = () => cfg().studioName || "nerdyphotographer.in";
  const year = () => String(new Date().getFullYear());
  const siteUrl = "https://www.nerdyphotographer.in";

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
      const t = fitLines(page, book.title || "Selected Work", W - 2 * m - 20, 2, 300, T.size, T.min, F.serif);
      const lead = T.lead * (t.size / T.size);
      t.lines.forEach((l, i) => text(page, l, m + 10, divY + T.first + i * lead, P.ink));
      let y = divY + T.first + (t.lines.length - 1) * lead;
      if (book.subtitle) { y += T.sub; font(page, 400, L ? 4.6 : 5.6, F.serif, 0, true); text(page, ellipsize(page, book.subtitle, W - 2 * m - 20), m + 10, y, P.soft); }
      rect(page, m + 10, y + T.rule - 0.4, 22, 0.8, P.accent);
      font(page, 500, 2.9, F.plex, 0.7);
      text(page, studio().toUpperCase(), m + 10, footY, P.ink);
      text(page, `NOIDA · INDIA · ${year()}`, W - m - 10, footY, P.soft, "right");
    },
    async photos(page, entry, P, W, H, imgs, shoots, n) {
      const M = this.margins(W > H ? "landscape" : "portrait");
      rect(page, 0, 0, W, H, P.paper);
      const box = { x: M.side, y: M.top, w: W - 2 * M.side, h: H - M.top - M.bottom };
      const shots = entry.photos;
      if (shots.length === 1 && imgs[0]) {
        // A single photograph is a plate: whole, never cropped, on paper.
        const r = fitPhoto(page, imgs[0], shots[0], box.x, box.y, box.w, box.h - 8);
        frame(page, r.x, r.y, r.w, r.h, P.rule, 0.2);
      } else {
        const aspects = shots.map((s, i) => (imgs[i] ? imgs[i].naturalWidth / imgs[i].naturalHeight : 0.7));
        cells(shots.length, { ...box, h: box.h - 8 }, M.gap, aspects, W > H).forEach((c, i) => {
          if (imgs[i]) { const r = drawPhoto(page, imgs[i], shots[i], c.x, c.y, c.w, c.h); frame(page, r.x, r.y, r.w, r.h, P.rule, 0.2); }
          else missing(page, P, c.x, c.y, c.w, c.h);
        });
      }
      // The caption takes the gap between the photos and the credit line, so a
      // page without one looks exactly as it always did.
      const cap = captionFit(entry, box.w - 12, CAPTION_TYPE.elegant);
      if (cap) drawCaption(page, cap, box.x, H - M.bottom - 2, CAPTION_TYPE.elegant, P.ink);
      const credit = creditLine(shoots);
      if (credit) { font(page, 300, 3.0, F.sans); text(page, ellipsize(page, credit, box.w - 12), box.x, H - M.bottom + 4, P.soft); }
      this.foot(page, P, W, H, n);
    },
    foot(page, P, W, H, n) {
      font(page, 500, 2.4, F.plex, 0.55);
      text(page, String(n).padStart(2, "0"), n % 2 ? W - 20 : 20, H - 12, P.ink, n % 2 ? "right" : "left");
    },
    heading(page, s, x, y, P, maxW) { font(page, 300, 11, F.serif); const lines = wrap(page, s, maxW); lines.forEach((l, i) => text(page, l, x, y + i * 13, P.ink)); rect(page, x, y + (lines.length - 1) * 13 + 7, 22, 0.8, P.accent); return y + (lines.length - 1) * 13 + 16; },
    body(page, s, x, y, P, maxW, maxY = Infinity) { font(page, 300, 4.0, F.sans); return bodyLines(page, s, x, y, P, maxW, maxY, 6.4); },
    label(page, s, x, y, P) { font(page, 500, 2.6, F.plex, 0.55); text(page, s.toUpperCase(), x, y, P.soft); },
    ground(page, P, W, H) { rect(page, 0, 0, W, H, P.paper); }
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
      font(page, 700, 3.0, F.mono, 0.7); text(page, "STUDIO PORTFOLIO", 26, fieldEnd + 16, accentOnDeep(P));
      const lower = H - 25;                       // the foot hairline
      const firstY = fieldEnd + (L ? 36 : 42);
      // Heavy caps at 22mm put most words on a line of their own, so a title is
      // shrunk until it fits two lines AND leaves room for the subtitle.
      let size = L ? 18 : 22, t;
      for (;;) {
        t = fitLines(page, (book.title || "Selected Work").toUpperCase(), W - 40, 2, 800, size, L ? 9 : 11, F.heavy, -0.4);
        const lastBase = firstY + (t.lines.length - 1) * t.size * 0.95;
        const need = lastBase + t.size * 0.22 + (book.subtitle ? 3 + 4.2 : 0);
        if (need <= lower - 4 || t.size <= (L ? 9 : 11)) break;
        size = t.size - 0.5;
      }
      const tLead = t.size * 0.95;
      font(page, 800, t.size, F.heavy, -0.4);
      t.lines.forEach((l, i) => text(page, l, 26, firstY + i * tLead, P.onDeep));
      if (book.subtitle) {
        const subY = Math.min(lower - 4, Math.max(H - 32, firstY + (t.lines.length - 1) * tLead + t.size * 0.22 + 7));
        font(page, 400, 4.2, F.sans); text(page, ellipsize(page, book.subtitle, W - 40), 26, subY, P.onDeep);
      }
      hair(page, 26, lower, W - 14, P.onDeep);
      font(page, 700, 2.8, F.mono, 0.5);
      text(page, studio().toUpperCase(), 26, H - 15, P.onDeep);
      page.ctx.globalAlpha = 0.62; text(page, `NOIDA · INDIA · ${year()}`, W - 14, H - 15, P.onDeep, "right"); page.ctx.globalAlpha = 1;
    },
    async photos(page, entry, P, W, H, imgs, shoots, n) {
      const M = this.margins();
      rect(page, 0, 0, W, H, P.white);
      const shots = entry.photos;
      const cap = captionFit(entry, W - 2 * M.side, CAPTION_TYPE.modern);
      if (shots.length === 1) {
        if (imgs[0]) drawPhoto(page, imgs[0], shots[0], 0, 0, W, H); else missing(page, P, 0, 0, W, H);
        // A full-bleed page still carries its number, on a band at the foot;
        // the band grows to hold a caption only when there is one.
        rect(page, 0, H - (cap ? 16 : 9), W, cap ? 16 : 9, P.deep);
        if (cap) drawCaption(page, cap, M.side, H - 9.6, CAPTION_TYPE.modern, P.onDeep);
        font(page, 700, 2.4, F.mono, 0.4);
        text(page, String(n).padStart(2, "0"), M.side, H - 3.4, P.onDeep);
        const credit = creditLine(shoots);
        if (credit) text(page, ellipsize(page, credit.toUpperCase(), W - 2 * M.side - 14), W - M.side, H - 3.4, P.onDeep, "right");
        return;
      }
      const box = { x: M.side, y: M.top, w: W - 2 * M.side, h: H - M.top - M.bottom - (cap ? 7 : 0) };
      if (cap) drawCaption(page, cap, M.side, H - 17.5, CAPTION_TYPE.modern, P.ink);
      const aspects = shots.map((s, i) => (imgs[i] ? imgs[i].naturalWidth / imgs[i].naturalHeight : 0.7));
      cells(shots.length, box, M.gap, aspects, W > H).forEach((c, i) => {
        if (imgs[i]) drawPhoto(page, imgs[i], shots[i], c.x, c.y, c.w, c.h); else missing(page, P, c.x, c.y, c.w, c.h);
        // Plate number in a chip, keyed to nothing but its order on the page.
        rect(page, c.x, c.y, 7, 5, P.accent);
        font(page, 700, 2.2, F.mono, 0.2); text(page, String(i + 1).padStart(2, "0"), c.x + 3.5, c.y + 3.5, P.onAccent, "center");
      });
      this.foot(page, P, W, H, n, creditLine(shoots));
    },
    // `ink`/`soft` default to the page colours; a chapter page on the accent
    // passes onAccent, or the foot all but vanishes on a dark accent.
    foot(page, P, W, H, n, credit, ink = P.ink, soft = P.soft) {
      hair(page, 14, H - 12, W - 14, ink);
      font(page, 700, 2.4, F.mono, 0.4);
      text(page, String(n).padStart(2, "0"), 14, H - 6, ink);
      const studioW = measure(page, studio().toUpperCase());
      text(page, studio().toUpperCase(), W - 14, H - 6, ink, "right");
      if (credit) { font(page, 400, 2.6, F.sans); text(page, ellipsize(page, credit, (W - 14 - studioW - 6) - 24), 24, H - 6, soft); }
    },
    heading(page, s, x, y, P, maxW) { font(page, 800, 10, F.heavy, -0.2); const lines = wrap(page, String(s).toUpperCase(), maxW); lines.forEach((l, i) => text(page, l, x, y + i * 10.5, P.ink)); rect(page, x, y + (lines.length - 1) * 10.5 + 5, 18, 1.2, P.accent); return y + (lines.length - 1) * 10.5 + 15; },
    body(page, s, x, y, P, maxW, maxY = Infinity) { font(page, 400, 3.9, F.sans); return bodyLines(page, s, x, y, P, maxW, maxY, 6.2); },
    label(page, s, x, y, P) { font(page, 700, 2.5, F.mono, 0.45); text(page, s.toUpperCase(), x, y, accentText(P)); },
    ground(page, P, W, H) { rect(page, 0, 0, W, H, P.white); rect(page, 0, 0, 6, H, P.accent); }
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
      const mast = cfg().studioShortName || "NERDY";
      fitSize(page, mast, W - 20, 300, L ? 38 : 44, F.serif, 1.5, 20);
      text(page, mast, W / 2, L ? 68 : 92, on, "center");
      font(page, 500, 5.4, F.geo, 3.2); text(page, "PHOTOGRAPHER", W / 2, L ? 80 : 104, on, "center");
      if (!img) hair(page, 20, L ? 90 : 116, W - 20, P.ink);
      const cl = coverLines(book), top = L ? 100 : 132;
      font(page, 600, 3.4, F.geo, 0.4);
      cl.genres.forEach((g, i) => text(page, g.toUpperCase(), 20, top + i * 6, img ? "#FFFFFF" : (i === 0 ? accentText(P) : P.ink)));
      [`${cl.photos} PLATES`, `${cl.pages} PAGES`, "NOIDA, INDIA"].forEach((w, i) => text(page, w, W - 20, top + i * 6, on, "right"));
      // One line where it fits, at a smaller size before it ever wraps; the
      // rule, the deck line and the mark then sit below whatever was drawn.
      const t = fitLines(page, (book.title || "Selected Work").toUpperCase(), W - 30, 2, 300, L ? 11 : 13, L ? 7.5 : 8.5, F.serif, 0.8);
      const tLead = t.size * 1.23, firstY = band + (L ? 24 : 35);
      font(page, 300, t.size, F.serif, 0.8);
      t.lines.forEach((l, i) => text(page, l, W / 2, firstY + i * tLead, P.onAccent, "center"));
      const ruleY = firstY + (t.lines.length - 1) * tLead + (L ? 9 : 12.7);
      rect(page, W / 2 - 12, ruleY, 24, 0.6, P.onAccent);
      let below = ruleY;
      if (book.subtitle) { below = ruleY + (L ? 9 : 12.3); font(page, 400, 4.2, F.sans); text(page, ellipsize(page, book.subtitle, W - 30), W / 2, below, P.onAccent, "center"); }
      const footY = H - 11, markSize = L ? 12 : 16;
      const markY = Math.max(H - (L ? 34 : 49), below + 5);
      if (markY + markSize <= footY - 5) await drawMark(page, P.onAccent, P.onAccent, P.accent, W / 2 - markSize / 2, markY, markSize);
      font(page, 600, 2.9, F.geo, 1.1); text(page, studio().toUpperCase(), W / 2, footY, P.onAccent, "center");
    },
    async photos(page, entry, P, W, H, imgs, shoots, n) {
      const M = this.margins();
      rect(page, 0, 0, W, H, P.white);
      const shots = entry.photos;
      // A caption gets a white strip across the foot, clear of the outer band.
      const cap = captionFit(entry, W - 24, CAPTION_TYPE.vogue);
      const area = cap ? H - 12 : H;
      if (shots.length === 1) {
        if (imgs[0]) drawPhoto(page, imgs[0], shots[0], 0, 0, W, area); else missing(page, P, 0, 0, W, area);
      } else {
        const aspects = shots.map((s, i) => (imgs[i] ? imgs[i].naturalWidth / imgs[i].naturalHeight : 0.7));
        // Tiled trim to trim: tightness is the style.
        cells(shots.length, { x: 0, y: 0, w: W, h: area }, M.gap, aspects, W > H).forEach((c, i) => {
          if (imgs[i]) drawPhoto(page, imgs[i], shots[i], c.x, c.y, c.w, c.h); else missing(page, P, c.x, c.y, c.w, c.h);
        });
      }
      if (cap) drawCaption(page, cap, 12, H - 4.8, CAPTION_TYPE.vogue, P.ink);
      this.foot(page, P, W, H, n, creditLine(shoots));
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
      ctx.fillText(ellipsize(page, `${String(n).padStart(2, "0")}   ${credit ? credit.toUpperCase() : studio().toUpperCase()}`, H - 16), 0, 0);
      ctx.restore();
    },
    heading(page, s, x, y, P, maxW) { font(page, 300, 12, F.serif, 0.6); const lines = wrap(page, String(s).toUpperCase(), maxW); lines.forEach((l, i) => text(page, l, x, y + i * 14, P.ink)); rect(page, x, y + (lines.length - 1) * 14 + 7, 24, 0.6, P.accent); return y + (lines.length - 1) * 14 + 17; },
    body(page, s, x, y, P, maxW, maxY = Infinity) { font(page, 400, 3.9, F.sans); return bodyLines(page, s, x, y, P, maxW, maxY, 6.3); },
    label(page, s, x, y, P) { font(page, 600, 2.7, F.geo, 0.8); text(page, s.toUpperCase(), x, y, accentText(P)); },
    ground(page, P, W, H) { rect(page, 0, 0, W, H, P.white); }
  };
  const STYLE_IMPL = { elegant: ELEGANT, modern: MODERN, vogue: VOGUE };

  // Running text that stops above the foot. If it has to stop early, the last
  // line that fits ends with "…" so nothing is cut mid-thought without a sign.
  function bodyLines(page, s, x, y, P, maxW, maxY, lead) {
    const lines = wrap(page, s, maxW);
    let i = 0;
    page.lastBodyCut = false;
    for (; i < lines.length; i++) {
      const yy = y + i * lead;
      if (yy > maxY) break;
      const last = i + 1 < lines.length && y + (i + 1) * lead > maxY;
      if (last) page.lastBodyCut = true;
      text(page, last ? ellipsize(page, `${lines[i]} …`, maxW) : lines[i], x, yy, P.ink);
    }
    return y + i * lead;
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
      const t = fitLines(page, shown, W - 40, 2, weight, book.style === "modern" ? 26 : 30, 12, family, spacing);
      if (t.cut) reportCut(page, "heading", "chapter heading");
      const lead = t.size * 1.05;
      const top = H / 2 - (t.lines.length - 1) * lead / 2;
      font(page, weight, t.size, family, spacing);
      t.lines.forEach((l, i) => text(page, l, 20, top + i * lead, on));
      const after = top + (t.lines.length - 1) * lead;
      if (book.style === "elegant") rect(page, 20, after + 8, 22, 0.8, P.accent);
      if (entry.line) {
        font(page, 400, 4.2, F.sans);
        const lines = wrap(page, entry.line, maxW);
        if (lines.length > 4) reportCut(page, "line", "line under the heading");
        lines.slice(0, 4).forEach((l, i) => text(page, i === 3 && lines.length > 4 ? ellipsize(page, `${l} …`, maxW) : (i === 3 ? ellipsize(page, l, maxW) : l), 20, after + t.size * 0.5 + 10 + i * 6.4, on));
      }
      if (book.style === "elegant") ELEGANT.foot(page, P, W, H, n);
      if (book.style === "modern") MODERN.foot(page, P, W, H, n, "", P.onAccent, P.onAccent);
      return;
    }
    S.ground(page, P, W, H);
    let y = M.top + 22;
    const floor = H - Math.max(M.bottom, 18) - 6;   // nothing below this: the foot lives there
    if (entry.type === "about") {
      S.label(page, "About the studio", x, y - 10, P);
      y = S.heading(page, "Not just photos, a perspective", x, y, P, maxW);
      y = S.body(page, (book.texts && book.texts.about) || DEFAULT_ABOUT, x, y + 6, P, maxW, floor);
      if (page.lastBodyCut) reportCut(page, "about", "About text");
    }
    if (entry.type === "services") {
      S.label(page, "What I shoot", x, y - 10, P);
      y = S.heading(page, "Shoots, and who they are for", x, y, P, maxW);
      y += 4;
      // Landscape pages are short and wide, so the list runs in two columns
      // rather than stopping after three entries.
      const cols = W > H ? 2 : 1;
      const colW = cols === 2 ? (W - 2 * x - 12) / 2 : maxW;
      const colX = (c) => x + c * (colW + 12);
      const top = y;
      let col = 0, cy = top;
      const entries = [];
      for (const v of (API.liveServices() || [])) entries.push({ kind: "service", v });
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
        text(page, "Every shoot is quoted to its brief.", colX(col), Math.min(cy + 4, floor), P.soft);
      }
      if (dropped) console.warn(`Portfolio book: ${dropped} item(s) did not fit on the What I shoot page.`);
    }
    if (entry.type === "contact") {
      S.label(page, "Let's make something", x, y - 10, P);
      y = S.heading(page, "Book a shoot", x, y, P, maxW);
      y += 4;
      const c = cfg();
      const ig = String(c.instagram || "").replace(/\/+$/, "").split("/").pop();
      const rows = [
        ["Email", c.email, c.email ? `mailto:${c.email}` : ""],
        ["WhatsApp", book.texts && book.texts.phone, book.texts && book.texts.phone ? `https://wa.me/${String(book.texts.phone).replace(/\D/g, "")}` : ""],
        ["Instagram", ig ? `@${ig}` : "", c.instagram || ""],
        ["Website", "nerdyphotographer.in", siteUrl],
        ["Book online", "nerdyphotographer.in/book", `${siteUrl}/book/`],
        ["Studio", "Noida · working across Delhi NCR", ""]
      ].filter((r) => r[1]);
      for (const [label, value, url] of rows) {
        S.label(page, label, x, y, P);
        font(page, book.style === "modern" ? 600 : 400, 5.0, book.style === "elegant" || book.style === "vogue" ? F.serif : F.sans);
        text(page, value, x, y + 7, P.ink);
        if (url) page.link(x, y + 1.5, Math.min(maxW, measure(page, value) + 2), 7, url);
        y += 16;
      }
      // A QR straight to the booking form, for a book read on paper.
      try {
        const qrcode = await API.loadQr();
        const qr = qrcode(0, "M"); qr.addData(`${siteUrl}/book/`); qr.make();
        const cells = qr.getModuleCount(), size = 32, cell = size / cells;
        const qx = W - x - size, qy = H - M.bottom - size - 6;
        rect(page, qx - 2, qy - 2, size + 4, size + 4, "#FFFFFF");
        for (let r = 0; r < cells; r++) for (let col = 0; col < cells; col++) if (qr.isDark(r, col)) rect(page, qx + col * cell, qy + r * cell, cell + 0.02, cell + 0.02, "#000000");
        font(page, 500, 2.2, F.plex, 0.4); text(page, "SCAN TO BOOK", qx + size / 2, qy + size + 5, P.soft, "center");
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
  const WRITING = { story: "Story", note: "About a photo", quote: "Quote", letter: "Letter" };

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
      signLine: { w: 500, size: 2.6, f: F.plex, sp: 0.55, caps: true }
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
      signLine: { w: 700, size: 2.5, f: F.mono, sp: 0.45, caps: true }
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
      signLine: { w: 600, size: 2.7, f: F.geo, sp: 0.8, caps: true }
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
  function flowBody(page, s, cols, spec, dropColor) {
    const paras = paragraphs(s);
    const flat = paras.map((p) => p.join(" ")).join("\n");
    const lead = spec.lead;
    const run = (drop) => {
      let wi = 0;
      const queues = paras.map((p) => p.map((w) => ({ s: w, w: wi++, end: true })));
      const total = wi;
      let dc = null, dropWord = 0;
      if (drop) {
        const letter = queues[0][0].s[0].toUpperCase();
        const size = (2 * lead + 0.728 * spec.size) / 0.716;
        font(page, 300, size, F.serif);
        dc = { s: letter, x: cols[0].x, y: cols[0].top + 2 * lead, size, indent: measure(page, letter) + 2.2 };
        queues[0][0] = { ...queues[0][0], s: queues[0][0].s.slice(1) };
        if (!queues[0][0].s) { queues[0].shift(); dropWord = 1; }
      }
      font(page, spec.w, spec.size, spec.f, spec.sp || 0, !!spec.it);
      const lines = [];
      let ci = 0, y = cols[0].top, colTop = true, cut = false;
      outer:
      for (let pi = 0; pi < queues.length; pi++) {
        const q = queues[pi];
        if (!colTop) y += lead * 0.5;
        while (q.length) {
          if (y > cols[ci].bottom + 0.01) {
            if (++ci >= cols.length) { cut = true; break outer; }
            y = cols[ci].top; colTop = true;
          }
          const ind = dc && ci === 0 && y <= dc.y + 0.01 ? dc.indent : 0;
          const width = cols[ci].w - ind;
          lines.push({ pieces: takeLine(page, q, width), x: cols[ci].x + ind, y, w: width, pi });
          y += lead; colTop = false;
        }
      }
      let printed = dropWord + lines.reduce((n, l) => n + l.pieces.filter((p) => p.end).length, 0);
      const out = lines.map((l) => ({ s: joinLine(l.pieces), x: l.x, y: l.y }));
      if (cut && lines.length) {
        const L = lines[lines.length - 1];
        const e = endLine(page, L.pieces, L.w, true);
        printed -= L.pieces.filter((p) => p.end).length - e.whole;
        out[out.length - 1].s = e.s;
      }
      let left = 0;
      if (!cut) for (let c = ci; c < cols.length; c++) {
        const from = c === ci ? y : cols[c].top;
        if (from <= cols[c].bottom + 0.01) left += Math.floor((cols[c].bottom + 0.01 - from) / lead) + 1;
      }
      // The letter spans three lines, so the first paragraph must fill all
      // three beside it, or the next paragraph would run into the letter.
      const dropOk = !dc || (lines.length >= 3 && lines.slice(0, 3).every((l) => l.pi === 0 && l.x > cols[0].x));
      const tail = out.length ? tailOf(out[out.length - 1].s) : "";
      return { lines: out, cut, printed, total, used: lines.length, left, drop: dc, dropOk, tail };
    };
    const wantDrop = !!dropColor && flat.length >= 120 && paras.length && /^[A-IK-PR-Za-ik-pr-z]/.test(paras[0][0]);
    if (wantDrop) { const r = run(true); if (r.dropOk) return { ...r, dropColor }; }
    return run(false);
  }

  // A photos page's one caption, measured like the writing pages.
  function captionFit(entry, width, spec) {
    if (!entry || !oneParagraph(entry.caption).length) return null;
    return fitBlock(measurer(), entry.caption, width, 1, spec, spec.start, spec.min, false);
  }
  function drawCaption(page, r, x, y, spec, color) {
    font(page, spec.w, r.size, spec.f, spec.sp || 0, !!spec.it);
    text(page, r.lines[0], x, y, color);
    if (r.cut) reportCut(page, "caption", "caption");
  }

  // The plan for one writing page: drawing operations in mm, the cuts, and
  // for the editor, how each field fared.
  function planWriting(book, entry, W, H) {
    const st = WTYPE[book.style] ? book.style : "modern";
    const T = WTYPE[st];
    const P = colourway(book.colourway);
    const L = W > H;
    const page = measurer();
    const plan = { ops: [], cuts: [], fields: {}, foot: {} };
    const op = (o) => plan.ops.push(o);
    const rectOp = (x, y, w, h, c) => op({ k: "rect", x, y, w, h, c });
    const put = (s, x, y, spec, size, c, align = "left") => op({ k: "text", s, x, y, f: [spec.w, size, spec.f, spec.sp || 0, !!spec.it], c, align });
    const colour = (role) => (role === "accentText" ? accentText(P) : P[role]);
    const hasPhoto = Array.isArray(entry.photos) && entry.photos.length > 0;
    const LABEL = { kicker: "small line", headline: "headline", intro: "intro", body: entry.type === "letter" ? "letter" : "story", title: "title", note: "words about the picture", detail: "detail line", quote: "quote", name: "name", role: "role", heading: "heading", signName: "signed name", signLine: "line under the name" };
    const report = (field, r) => {
      plan.fields[field] = r;
      if (r.cut) plan.cuts.push({ field, label: LABEL[field] || field });
    };
    // Draw a fitted block at baseline y0; an empty one leaves a guide (preview
    // only) and still holds its first line, so the layout doesn't jump.
    const block = (field, s, x, y0, w, maxLines, spec, start, min, lead, color, align = "left") => {
      const r = fitBlock(page, s, w, maxLines, spec, start, min, !!spec.caps);
      report(field, { kind: "block", empty: !r.total, ...r });
      if (!r.total) { op({ k: "guide", x: align === "center" ? x - w / 2 : x, y: y0 - start * 0.8, w, h: start }); return y0; }
      const step = lead === "mul" ? r.size * spec.lead : lead;
      r.lines.forEach((l, i) => put(l, x, y0 + i * step, spec, r.size, color, align));
      return y0 + (r.lines.length - 1) * step;
    };
    const body = (field, s, cols, spec, dropRole) => {
      const r = flowBody(page, s, cols, spec, dropRole ? colour(dropRole) : null);
      report(field, { kind: "flow", empty: !r.total, ...r, lines: undefined });
      if (!r.total) { cols.forEach((c) => op({ k: "guide", x: c.x, y: c.top - spec.size, w: c.w, h: c.bottom - c.top + spec.size })); return; }
      if (r.drop) put(r.drop.s, r.drop.x, r.drop.y, { w: 300, f: F.serif }, r.drop.size, r.dropColor);
      r.lines.forEach((l) => put(l.s, l.x, l.y, spec, spec.size, P.ink));
    };
    const rule = (x, y, color = P.accent) => rectOp(x, y - T.rule.h / 2, T.rule.w, T.rule.h, color);
    const ground = () => {
      if (st === "elegant") rectOp(0, 0, W, H, P.paper);
      else { rectOp(0, 0, W, H, P.white); if (st === "modern") rectOp(0, 0, 6, H, P.accent); }
    };
    const photo = (box, mode, empty) => op({ k: "photo", x: box[0], y: box[1], w: box[2], h: box[3], mode, frame: st === "elegant" ? P.rule : null, empty });
    const marker = (x, y, color = P.soft) => put(MARKER, x, y, { w: 500, f: F.plex, sp: 0.4 }, 3.2, color, "center");
    const kicker = (s, x, y, w) => block("kicker", s, x, y, w, 1, T.kicker, T.kicker.size, T.kicker.size, 0, colour(T.kicker.color));
    const has = (...keys) => keys.some((k) => oneParagraph(entry[k]).length);

    if (entry.type === "story") {
      ground();
      if (hasPhoto) photo(L ? (st === "elegant" ? [20, 18, 112, 168] : [0, 0, 140, st === "modern" ? 192 : 210]) : (st === "elegant" ? [20, 22, 170, 110] : [0, 0, W, 132]), "crop");
      const x = L && hasPhoto ? 152 : 20, w = L ? (hasPhoto ? 125 : 257) : 170;
      const K = L ? 30 : (hasPhoto ? 146 : 34);
      kicker(entry.kicker, x, K, w);
      const hLast = block("headline", entry.headline, x, K + 12, w, 2, T.storyHead, T.storyHead.start, T.storyHead.min, "mul", P.ink);
      let ruleY = hLast + 7;
      if (has("intro")) ruleY = block("intro", entry.intro, x, hLast + 10, w, 3, T.storyIntro, T.storyIntro.start, T.storyIntro.min, T.storyIntro.lead, colour(T.storyIntro.color)) + 6.5;
      else report("intro", { kind: "block", empty: true });
      rule(x, ruleY);
      const top = ruleY + 9.5, bottom = L ? 184 : 270;
      const cols = L && hasPhoto ? [{ x, w, top, bottom }] : [{ x, w: (w - 8) / 2, top, bottom }, { x: x + (w - 8) / 2 + 8, w: (w - 8) / 2, top, bottom }];
      body("body", entry.body, cols, T.body, T.drop);
      if (!has("kicker", "headline", "intro", "body")) marker(x + w / 2, (top + bottom) / 2);
    }

    if (entry.type === "note") {
      ground();
      photo(L ? (st === "elegant" ? [20, 18, 170, 168] : [0, 0, 196, st === "modern" ? 192 : 210]) : (st === "elegant" ? [20, 22, 170, 178] : [0, 0, W, 202]),
        st === "elegant" ? (L ? "fit-right" : "fit") : "crop", "NO PHOTO CHOSEN");
      const TT = T.noteTitle;
      if (!L) {
        const tLast = block("title", entry.title, 20, 216, 60, 3, TT, TT.start, TT.min, "mul", P.ink);
        rule(20, tLast + 7);
        body("note", entry.note, [{ x: 90, w: 100, top: 216, bottom: 262 }], T.body, null);
        block("detail", entry.detail, 20, 270, 170, 1, DETAIL_TYPE, 3.0, 2.6, 4.6, P.soft);
        if (!has("title", "note", "detail")) marker(W / 2, 240);
      } else {
        const x = 208, w = 69;
        const tLast = block("title", entry.title, x, 34, w, 3, TT, TT.start, TT.min, "mul", P.ink);
        rule(x, tLast + 7);
        body("note", entry.note, [{ x, w, top: tLast + 16.5, bottom: 170 }], T.body, null);
        // Up to two lines, set so the last one always sits on 184.
        const d = fitBlock(page, entry.detail, w, 2, DETAIL_TYPE, 3.0, 2.6, false);
        block("detail", entry.detail, x, 184 - (Math.max(1, d.lines.length) - 1) * 4.6, w, 2, DETAIL_TYPE, 3.0, 2.6, 4.6, P.soft);
        if (!has("title", "note", "detail")) marker(x + w / 2, 100);
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
        photo(L ? (st === "elegant" ? [20, 18, 112, 168] : [0, 0, 140, st === "modern" ? 192 : 210]) : (st === "elegant" ? [20, 22, 170, 128] : [0, 0, W, 150]), "crop");
        zone = L ? { x: 154, w: 123, top: 24, bottom: 180, lines: 6, start: 9, min: 6 } : { x: 20, w: 170, top: 164, bottom: 266, lines: 5, start: 9, min: 6 };
      } else zone = L ? { x: 20, w: 257, top: 26, bottom: 180, lines: 5, start: 13, min: 7 } : { x: 20, w: 170, top: 30, bottom: 266, lines: 7, start: 13, min: 7 };
      const Q = T.quote, center = T.quoteAlign === "center";
      const said = String(entry.quote || "").replace(QUOTE_MARKS, "");
      const r = fitBlock(page, said, zone.w, zone.lines, Q, zone.start, zone.min, false);
      report("quote", { kind: "block", empty: !r.total, ...r });
      const cx = center ? zone.x + zone.w / 2 : zone.x, align = center ? "center" : "left";
      const nameR = has("name") ? fitBlock(page, entry.name, zone.w, 1, T.quoteName, T.quoteName.size, T.quoteName.size, !!T.quoteName.caps) : null;
      const roleR = has("role") ? fitBlock(page, entry.role, zone.w, 1, T.quoteRole, T.quoteRole.size, T.quoteRole.size, !!T.quoteRole.caps) : null;
      const waiting = !r.total ? { blocked: "Prints once there's a quote" } : {};
      if (nameR) report("name", { kind: "block", empty: false, ...nameR, ...waiting }); else report("name", { kind: "block", empty: true });
      if (roleR) report("role", { kind: "block", empty: false, ...roleR, ...waiting }); else report("role", { kind: "block", empty: true });
      if (!r.total) {
        op({ k: "guide", x: zone.x, y: zone.top, w: zone.w, h: zone.bottom - zone.top });
        marker(zone.x + zone.w / 2, (zone.top + zone.bottom) / 2, soft);
      } else {
        const lead = r.size * Q.lead;
        const markH = st === "modern" ? 9 : r.size * 1.1;
        const textH = (r.lines.length - 1) * lead + r.size * 0.72;
        const attrH = (nameR || roleR) ? 9 + (nameR ? 8 : 0) + (roleR ? (nameR ? 5.6 : 8) : 0) : 0;
        const top = zone.top + Math.max(0, (zone.bottom - zone.top - (markH + 7 + textH + attrH)) / 2);
        if (st === "modern") {
          rectOp(zone.x, top, 12, 9, solid ? P.onAccent : P.accent);
          put("“", zone.x + 6, top + 11.2, { w: 800, f: F.heavy }, 11, solid ? P.accent : P.onAccent, "center");
        } else {
          const ms = r.size * 2.2;
          font(page, 300, ms, F.serif);
          const asc = page.ctx.measureText("“").actualBoundingBoxAscent / page.u(1);
          put("“", center ? cx : zone.x - 0.5, top + asc, { w: 300, f: F.serif }, ms, solid ? P.onAccent : accentText(P), align);
        }
        const b1 = top + markH + 7 + r.size * 0.72;
        r.lines.forEach((l, i) => put(l, cx, b1 + i * lead, Q, r.size, on, align));
        let y = b1 + (r.lines.length - 1) * lead;
        if (nameR || roleR) {
          y += 9;
          rule(center ? cx - T.rule.w / 2 : zone.x, y, solid ? P.onAccent : P.accent);
          if (nameR) { y += 8; put(nameR.lines[0], cx, y, T.quoteName, nameR.size, on, align); }
          if (roleR) { y += nameR ? 5.6 : 8; put(roleR.lines[0], cx, y, T.quoteRole, roleR.size, soft, align); }
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
      if (!has("kicker", "heading", "body", "signName", "signLine")) marker(x + w / 2, L ? 110 : 150);
    }
    return plan;
  }

  async function paintPlan(page, plan, entry, imgOf, P, guides) {
    const shot = entry.photos && entry.photos[0];
    const img = shot ? await imgOf(shot) : null;
    for (const o of plan.ops) {
      if (o.k === "rect") rect(page, o.x, o.y, o.w, o.h, o.c);
      else if (o.k === "text") { font(page, ...o.f); text(page, o.s, o.x, o.y, o.c, o.align); }
      else if (o.k === "photo") {
        if (!shot) {
          if (o.empty) { rect(page, o.x, o.y, o.w, o.h, P.rule); font(page, 500, 3.2, F.plex, 0.4); text(page, o.empty, o.x + o.w / 2, o.y + o.h / 2, P.soft, "center"); }
          continue;
        }
        if (!img) { missing(page, P, o.x, o.y, o.w, o.h); continue; }
        const r = o.mode === "crop" ? drawPhoto(page, img, shot, o.x, o.y, o.w, o.h) : fitPhoto(page, img, shot, o.x, o.y, o.w, o.h, o.mode === "fit-right");
        if (o.frame) frame(page, r.x, r.y, r.w, r.h, o.frame, 0.2);
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

  // Plans every writing page (and every captioned photos page) of a book, for
  // warnings: page number → cuts. Needs the fonts loaded.
  function bookCuts(book) {
    const size = SIZE[book.orientation] || SIZE.portrait;
    const out = [];
    let n = 1;
    for (const pg of book.pages) {
      const first = n + 1; n += pg.type === "spread" ? 2 : 1;
      if (n > MAX_PAGES) break;
      let cuts = [];
      if (WRITING[pg.type]) cuts = planWriting(book, pg, size.w, size.h).cuts;
      else if (pg.type === "photos" && pg.caption) {
        const st = WTYPE[book.style] ? book.style : "modern";
        const width = st === "elegant" ? size.w - 2 * 20 - 12 : st === "modern" ? size.w - 28 : size.w - 24;
        const r = captionFit(pg, width, CAPTION_TYPE[st]);
        if (r && r.cut) cuts = [{ field: "caption", label: "caption" }];
      }
      out.push({ entry: pg, n: first, cuts });
    }
    return out;
  }

  /* ---------- rendering a book ----------------------------------------------
     Yields one finished page at a time, so the caller can encode and release
     each canvas before the next is drawn. */
  async function* renderPages(book, { dpi, watermarked = false, cache, only = null, guides = false }) {
    await ensureFonts();
    const P = colourway(book.colourway);
    const size = SIZE[book.orientation] || SIZE.portrait;
    const W = size.w, H = size.h;
    const S = STYLE_IMPL[book.style] || MODERN;
    const lib = library();
    const full = dpi >= 100;
    const imgOf = async (shot) => {
      const hit = shot && lib.byId.get(shot.id);
      if (!hit) return null;
      const src = full ? API.photoSrc(hit.photo) : previewSrc(hit.photo);
      try { return await API.loadImage(src, cache); } catch (e) { return null; }
    };
    let n = 0;
    const want = (i) => only === null || only === i;
    // Cover
    if (want(-1)) {
      const page = API.newPdfPage(dpi, size);
      await S.cover(page, book, P, W, H, book.cover ? await imgOf(book.cover) : null);
      if (watermarked) watermark(page, W, H);
      yield { page, index: -1, n: 1 };
    }
    n = 1;
    for (let i = 0; i < book.pages.length; i++) {
      const entry = book.pages[i];
      // The builder never lets a book past 20 pages, but a book edited by hand
      // in data.js could arrive longer: stop rather than export past the limit.
      if (n + (entry.type === "spread" ? 2 : 1) > MAX_PAGES) break;
      const shoots = (entry.photos || []).map((s) => (lib.byId.get(s.id) || {}).shoot).filter(Boolean);
      if (entry.type === "spread") {
        n += 2;
        if (!want(i)) continue;
        const img = entry.photos[0] ? await imgOf(entry.photos[0]) : null;
        // One photograph across two pages: drawn once on a double-width sheet,
        // then cut down the middle, so the halves meet exactly.
        for (const half of [0, 1]) {
          const page = API.newPdfPage(dpi, size);
          rect(page, 0, 0, W, H, P.white);
          if (img) {
            page.ctx.save();
            page.ctx.beginPath(); page.ctx.rect(0, 0, page.u(W), page.u(H)); page.ctx.clip();
            drawPhoto(page, img, entry.photos[0], -half * W, 0, W * 2, H);
            page.ctx.restore();
          } else missing(page, P, 0, 0, W, H);
          const pn = n - 1 + half;
          if (book.style === "vogue") VOGUE.foot(page, P, W, H, pn, half ? creditLine(shoots) : "", half ? "right" : "left");
          else { rect(page, 0, H - 9, W, 9, P.deep); font(page, 700, 2.4, F.mono, 0.4); text(page, String(pn).padStart(2, "0"), half ? W - 14 : 14, H - 3.4, P.onDeep, half ? "right" : "left"); }
          if (watermarked) watermark(page, W, H);
          yield { page, index: i, n: pn, half };
        }
        continue;
      }
      n += 1;
      if (!want(i)) continue;
      const page = API.newPdfPage(dpi, size);
      if (entry.type === "photos") {
        const imgs = await Promise.all((entry.photos || []).map(imgOf));
        if (!(entry.photos || []).length) {
          S.ground(page, P, W, H);
          font(page, 500, 3.2, F.plex, 0.4); text(page, "NO PHOTOS ON THIS PAGE YET", W / 2, H / 2, P.soft, "center");
        } else await S.photos(page, entry, P, W, H, imgs, shoots, n);
      } else if (WRITING[entry.type]) {
        const plan = planWriting(book, entry, W, H);
        await paintPlan(page, plan, entry, imgOf, P, guides);
        if (book.style === "elegant") ELEGANT.foot(page, P, W, H, n);
        else if (book.style === "vogue") VOGUE.foot(page, P, W, H, n, "");
        else MODERN.foot(page, P, W, H, n, "", plan.foot.ink, plan.foot.soft);
        page.cuts = plan.cuts;
        page.plan = plan;
      } else {
        await textPage(page, entry, book, P, W, H, n);
      }
      if (watermarked) watermark(page, W, H);
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
  .sb-pop { position: absolute; right: 8px; top: calc(100% + 6px); z-index: 30; width: min(400px, calc(100vw - 32px)); max-height: min(70vh, 620px); overflow: auto; display: grid; gap: 12px; padding: 16px; background: var(--paper, #faf8f5); border: 1px solid var(--sb-line); border-radius: 12px; box-shadow: 0 22px 50px -20px rgba(0,0,0,.45); }
  .sb-pop[hidden] { display: none; }
  .sb-check { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .sb-check li { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font: 500 12.5px/1.45 Inter, sans-serif; }
  .sb-dlrow { display: flex; flex-wrap: wrap; gap: 8px; }
  .sb-ready { display: flex; flex-wrap: wrap; gap: 6px; }
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
  .sb-pgacts button { width: 32px; height: 28px; border: 1px solid var(--sb-line); border-radius: 7px; background: var(--paper, #faf8f5); color: var(--ink, #141416); cursor: pointer; }
  .sb-pgacts button:disabled { opacity: .35; cursor: not-allowed; }
  .sb-addwrap { padding: 8px; border-top: 1px solid var(--sb-line); }
  .sb-addbtn { width: 100%; padding: 9px 8px; border: 1px dashed var(--ink-soft, #5c5e66); border-radius: 9px; background: none; color: var(--ink, #141416); font: 600 12.5px Inter, sans-serif; cursor: pointer; }
  .sb-addbtn:hover { background: var(--sb-sunk); }

  .sb-stage { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; }
  .sb-stagebar { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--sb-line); }
  .sb-stagebar strong { flex: 1; text-align: center; font: 600 13px Inter, sans-serif; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sb-nav { width: 34px; height: 30px; border: 1px solid var(--sb-line); border-radius: 8px; background: var(--paper, #faf8f5); color: var(--ink, #141416); cursor: pointer; }
  .sb-nav:disabled { opacity: .35; cursor: not-allowed; }
  .sb-preview { display: flex; align-items: center; justify-content: center; padding: 20px; min-height: 0; background: var(--sb-sunk); overflow: hidden; }
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
    .sb-stage { order: 1; } .sb-rail { order: 2; flex-direction: row; } .sb-insp { order: 3; overflow: visible; }
    .sb-preview { height: min(60vh, 540px); padding: 14px; }
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

  const PAGE_LABEL = { photos: "Photos", spread: "Two-page spread", divider: "Chapter page", about: "About", services: "What I shoot", contact: "Contact", story: "Story", note: "About a photo", quote: "Quote", letter: "Letter" };
  const ADD_MENU = [
    { group: "Photographs", items: [
      ["photos", "Photos", "One to six photos, laid out by their shapes."],
      ["spread", "Two-page spread", "One photo across two facing pages."]] },
    { group: "Words", items: [
      ["story", "Story", "A photo with a headline, an intro and a story about a shoot or a brief."],
      ["note", "About a photo", "One photo shown large, with a title and a few lines about it."],
      ["quote", "Quote", "Someone's real words set large, with or without a photo."],
      ["letter", "Letter", "A signed page of your own writing: a foreword, or a note to a brand."]] },
    { group: "Studio pages", items: [
      ["divider", "Chapter page", "A pause between sections, e.g. “Fashion & editorial”."],
      ["about", "About the studio", "Who you are and how you work."],
      ["services", "What I shoot", "The kinds of shoot live on your site."],
      ["contact", "Contact", "Email, Instagram, booking link and a QR code."]] }
  ];
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
    ]
  };
  const REQUIRED = { story: ["headline", "body"], note: ["title", "note"], quote: ["quote"], letter: ["heading", "body"] };
  const IDEAS = {
    story: ["What was the brief, and what changed on the day?", "What was the light doing, and what did you do about it?", "What should a brand notice in these pictures?"],
    note: ["Why this frame and not the one before it?", "Where, when, and what did you ask for?", "The one technical choice that made it."],
    quote: ["Something a client or model actually said on set.", "The line you'd put on the studio wall.", "A note from a brand you shot for, with their OK."],
    letter: ["What should a brand know before booking you?", "How you plan a shoot before the day.", "The story behind the work in this book."]
  };
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
    let filter = "all", pickerOpen = null, tab = "page";
    let saveTimer = null, previewTimer = null, stripTimer = null, renderToken = 0, stripToken = 0, listToken = 0, fileUrls = [];
    let fontsOk = false;
    // Set by an actual edit. Opening a book and leaving it must not re-stamp
    // it as the newest version: that stale copy would then win the merge
    // against an edit made on another device since.
    let dirty = false;
    const dropFiles = () => { fileUrls.forEach((u) => URL.revokeObjectURL(u)); fileUrls = []; };
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => [...root.querySelectorAll(s)];
    ensureFonts().then(() => { fontsOk = true; if (book) updateMeters(); });

    function persist(status = "Saved on this device") {
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
      if (e.key !== "Escape") return;
      const pop = $("#sbDlPop"), menu = $("#sbAddMenu");
      if (pop && !pop.hidden) { pop.hidden = true; $("#sbDlToggle").setAttribute("aria-expanded", "false"); $("#sbDlToggle").focus(); }
      if (menu && !menu.hidden) closeAdd();
    };
    const onDoc = (e) => {
      if (!root.isConnected) { document.removeEventListener("keydown", onKey); document.removeEventListener("click", onDoc); return; }
      const pop = $("#sbDlPop"), btn = $("#sbDlToggle");
      if (pop && !pop.hidden && !pop.contains(e.target) && !(btn && btn.contains(e.target))) { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onDoc);

    /* --- screen 1: the books --- */
    function showList() {
      book = null; dropFiles();
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
              <span class="sb-meta">${esc((STYLES.find((s) => s.key === v.style) || {}).name || "")} · ${esc(colourway(v.colourway).name)} · ${esc(v.orientation)} · ${renderedCount(v)} page${renderedCount(v) === 1 ? "" : "s"}</span>
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
      $("#sbNew").addEventListener("click", () => { if (!atLimit) openBook(newBook(`Book ${state.versions.length + 1}`), true); });
      $$("[data-open]").forEach((b) => b.addEventListener("click", () => {
        const v = state.versions.find((x) => x.id === b.dataset.open); if (v) openBook(JSON.parse(JSON.stringify(v)));
      }));
      // Rename in place on the card: Enter or leaving the box saves, Escape cancels.
      $$("[data-rename]").forEach((b) => b.addEventListener("click", () => {
        const id = b.dataset.rename;
        const title = $$("[data-name]").find((h) => h.dataset.name === id);
        const v = state.versions.find((x) => x.id === id);
        if (!title || !v || title.querySelector("input")) return;
        title.innerHTML = `<label class="sb-vh" for="sbRename">Book name</label><input type="text" id="sbRename" maxlength="80" value="${esc(v.name)}">`;
        const input = title.querySelector("input");
        input.focus(); input.select();
        let done = false;
        const finish = (save) => {
          if (done) return; done = true;
          const name = input.value.trim();
          if (save && name && name !== v.name) {
            const cur = readState();
            const stored = cur.versions.find((x) => x.id === id);
            if (stored && !writeState({ versions: cur.versions.map((x) => (x.id === id ? { ...x, name, updatedAt: Date.now() } : x)), deleted: cur.deleted })) { API.toast("Not renamed — this device's storage is full or blocked."); }
            else if (stored) API.toast(`Renamed to “${name}”. Publish to rename it on your other devices.`);
          }
          showList();
          const again = root.querySelector(`[data-rename="${window.CSS && window.CSS.escape ? window.CSS.escape(id) : id}"]`); if (again) again.focus();
        };
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); finish(true); } if (e.key === "Escape") { e.preventDefault(); finish(false); } });
        input.addEventListener("blur", () => finish(true));
      }));
      $$("[data-dup]").forEach((b) => b.addEventListener("click", () => {
        const cur = readState();
        const v = cur.versions.find((x) => x.id === b.dataset.dup); if (!v) return;
        const copy = { ...JSON.parse(JSON.stringify(v)), id: uid(), name: `${v.name} (copy)`, updatedAt: Date.now() };
        if (!writeState({ versions: [copy, ...cur.versions], deleted: cur.deleted })) { API.toast("Not saved — this device's storage is full or blocked."); return; }
        showList();
      }));
      $$("[data-del]").forEach((b) => b.addEventListener("click", () => {
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

    function openBook(b, isNew = false) {
      book = b; sel = book.pages.length ? 0 : -1; active = 0; filter = "all"; pickerOpen = null; tab = "page";
      dirty = isNew;
      if (isNew) persist("New book saved on this device");
      showEditor();
    }

    /* --- screen 2: the editor --- */
    function showEditor() {
      root.innerHTML = `
        <div class="sb-top">
          <button type="button" class="sb-btn quiet" id="sbBack">← Books</button>
          <input type="text" id="sbName" class="sb-name" maxlength="80" value="${esc(book.name)}" aria-label="Book name" title="The book's name: type to rename it" placeholder="Name this book">
          <span class="sb-status" id="sbStatus" aria-live="polite">Saved on this device</span>
          <div class="sb-topacts">
            <button type="button" class="sb-btn" id="sbDlToggle" aria-expanded="false" aria-controls="sbDlPop">Download</button>
            <button type="button" class="sb-btn dark" id="sbPublish">Publish</button>
          </div>
          <div class="sb-pop" id="sbDlPop" hidden>
            <div class="sb-sec"><h3>Check before sending</h3><div id="sbCheck"><p class="sb-hint">Checking…</p></div></div>
            <div class="sb-dlrow">
              <button type="button" class="sb-btn dark" id="sbPdf" data-dl>Download PDF</button>
              <button type="button" class="sb-btn" id="sbPng" data-dl>PNG pages</button>
            </div>
            <p class="sb-hint">A sample with the watermark: <button type="button" class="sb-link" id="sbPdfMark" data-dl>PDF</button> · <button type="button" class="sb-link" id="sbPngMark" data-dl>PNG</button></p>
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
              <button type="button" class="sb-nav" id="sbNext" aria-label="Next page">›</button>
            </div>
            <div class="sb-preview" id="sbPreview"><p class="sb-hint">Drawing…</p></div>
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

      $("#sbBack").addEventListener("click", () => { flush(); showList(); });
      $("#sbName").addEventListener("input", (e) => { book.name = e.target.value; change({ rail: false, typing: true }); });
      $("#sbPublish").addEventListener("click", publish);
      $("#sbPrev").addEventListener("click", () => { if (sel > -1) select(sel - 1); });
      $("#sbNext").addEventListener("click", () => { if (sel < book.pages.length - 1) select(sel + 1); });
      const setTab = (t) => {
        tab = t;
        $("#sbTabPage").setAttribute("aria-selected", String(t === "page"));
        $("#sbTabDesign").setAttribute("aria-selected", String(t === "design"));
        $("#sbPanelPage").hidden = t !== "page"; $("#sbPanelDesign").hidden = t !== "design";
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
      $("#sbPdf").addEventListener("click", (e) => download(e.currentTarget, "pdf", false));
      $("#sbPng").addEventListener("click", (e) => download(e.currentTarget, "png", false));
      $("#sbPdfMark").addEventListener("click", (e) => download(e.currentTarget, "pdf", true));
      $("#sbPngMark").addEventListener("click", (e) => download(e.currentTarget, "png", true));
      // Add a page
      $("#sbAddToggle").addEventListener("click", () => ($("#sbAddMenu").hidden ? openAdd() : closeAdd()));
      drawDesign(); drawRail(); drawInspector(); schedulePreview(0); scheduleStrip(0);
      try { window.scrollTo({ top: 0 }); } catch (e) { /* older browsers */ }
    }

    function openAdd() {
      const menu = $("#sbAddMenu");
      const count = renderedCount(book);
      menu.innerHTML = `
        <div class="sb-addhead"><strong>Add a page</strong><button type="button" class="sb-btn quiet" id="sbAddClose">Close</button></div>
        <p class="sb-hint">It goes after the page you're on. ${count} of ${MAX_PAGES} pages used.</p>
        ${ADD_MENU.map((g) => `<div class="sb-addgroup"><h3>${esc(g.group)}</h3><div class="sb-additems">${g.items.map(([type, name, note]) => `
          <button type="button" class="sb-additem" data-add="${type}" ${count + (type === "spread" ? 2 : 1) > MAX_PAGES ? "disabled" : ""}><b>${esc(name)}</b><span>${esc(note)}</span></button>`).join("")}</div></div>`).join("")}`;
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

    function addPage(type) {
      const extra = type === "spread" ? 2 : 1;
      if (renderedCount(book) + extra > MAX_PAGES) { API.toast(`A book holds ${MAX_PAGES} pages at most, cover included.`); return; }
      const entry = { type };
      if (type === "photos" || type === "spread" || type === "story" || type === "note" || type === "quote") entry.photos = [];
      if (type === "divider") { entry.heading = "Selected work"; entry.line = ""; }
      // Writing pages start empty: nothing is ever written for the studio.
      for (const k of Object.keys((fieldCaps()[type]) || {})) if (WRITING[type]) entry[k] = "";
      const at = sel < 0 ? 0 : sel + 1;
      book.pages.splice(at, 0, entry);
      flush();
      sel = at; active = 0; pickerOpen = null;
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
      sel = i; active = 0; pickerOpen = null;
      drawRail(); drawInspector(); schedulePreview(0);
      const cur = $(".sb-pg[aria-current=true]"); if (cur) cur.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    /* --- the pages rail --- */
    const wordsOf = (pg) => oneParagraph(pg.headline || pg.title || pg.heading || pg.quote || pg.body || pg.note || "");
    function railLabel(pg) {
      if (!pg) return book.title ? `Cover · ${book.title}` : "Cover";
      if (WRITING[pg.type]) { const w = wordsOf(pg); return w.length ? `${PAGE_LABEL[pg.type]} · “${w.slice(0, 6).join(" ")}”` : PAGE_LABEL[pg.type]; }
      if (pg.type === "photos" || pg.type === "spread") return `${PAGE_LABEL[pg.type]} · ${(pg.photos || []).length}`;
      if (pg.type === "divider") return pg.heading ? `Chapter · ${pg.heading}` : "Chapter page";
      return PAGE_LABEL[pg.type] || pg.type;
    }
    function pageNumbers() {
      const out = [{ i: -1, n: "01", entry: null }];
      let n = 1;
      book.pages.forEach((pg, i) => {
        const first = n + 1; n += pg.type === "spread" ? 2 : 1;
        out.push({ i, entry: pg, n: pg.type === "spread" ? `${pad2(first)}–${pad2(n)}` : pad2(first) });
      });
      return out;
    }
    function drawRail() {
      const list = $("#sbPages"); if (!list) return;
      list.innerHTML = pageNumbers().map((it) => `
        <li data-i="${it.i}" class="${sel === it.i ? "sel" : ""}">
          <button type="button" class="sb-pg" data-sel="${it.i}" aria-current="${sel === it.i}">
            <span class="sb-pgimg" aria-hidden="true"></span>
            <span class="sb-pglabel"><b>${it.n}</b><span>${esc(railLabel(it.entry))}</span><i class="sb-chip" ${tooLong.get(it.entry || COVER) ? "" : "hidden"}>too long</i></span>
          </button>
          ${sel === it.i && it.i >= 0 ? `<span class="sb-pgacts">
            <button type="button" data-up="${it.i}" aria-label="Move this page earlier" ${it.i === 0 ? "disabled" : ""}>↑</button>
            <button type="button" data-down="${it.i}" aria-label="Move this page later" ${it.i === book.pages.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" data-rm="${it.i}" aria-label="Remove this page">✕</button>
          </span>` : ""}
        </li>`).join("");
      list.querySelectorAll("li").forEach((li) => {
        const i = +li.dataset.i;
        const c = thumbs.get(i < 0 ? COVER : book.pages[i]);
        if (c) li.querySelector(".sb-pgimg").replaceChildren(...c);
      });
      list.querySelectorAll("[data-sel]").forEach((b) => b.addEventListener("click", () => select(+b.dataset.sel)));
      list.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => { const i = +b.dataset.up; [book.pages[i - 1], book.pages[i]] = [book.pages[i], book.pages[i - 1]]; sel = i - 1; change(); focusAct("up"); }));
      list.querySelectorAll("[data-down]").forEach((b) => b.addEventListener("click", () => { const i = +b.dataset.down; [book.pages[i + 1], book.pages[i]] = [book.pages[i], book.pages[i + 1]]; sel = i + 1; change(); focusAct("down"); }));
      list.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
        const i = +b.dataset.rm;
        const pg = book.pages[i];
        const words = Object.keys(fieldCaps()[pg.type] || {}).reduce((n, k) => n + (pg.type === "photos" ? 0 : oneParagraph(pg[k]).length), 0);
        const photos = (pg.photos || []).length;
        const what = [photos ? `${photos} photo${photos === 1 ? "" : "s"}` : "", words ? `${words} word${words === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
        if (what && !confirm(`Remove this ${PAGE_LABEL[pg.type].toLowerCase()} page and its ${what}?`)) return;
        book.pages.splice(i, 1);
        sel = Math.min(i, book.pages.length - 1);
        active = 0;
        change(); drawInspector();
      }));
      const count = renderedCount(book);
      const c = $("#sbCount"); if (c) c.textContent = `${count}/${MAX_PAGES}`;
      const prev = $("#sbPrev"), next = $("#sbNext");
      if (prev) prev.disabled = sel <= -1;
      if (next) next.disabled = sel >= book.pages.length - 1;
      const it = pageNumbers().find((x) => x.i === sel);
      const title = $("#sbStageTitle"); if (title && it) title.textContent = `Page ${it.n} · ${it.entry ? PAGE_LABEL[it.entry.type] : "Cover"}`;
    }
    const focusAct = (kind) => { const b = $(`[data-${kind}="${sel}"]`); if (b && !b.disabled) b.focus(); else { const s = $(`.sb-pg[data-sel="${sel}"]`); if (s) s.focus(); } };
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
        for await (const r of renderPages(book, { dpi: 72, cache, only: sel, guides: true })) { got.push(r); if (token !== renderToken) return; }
        if (token !== renderToken) return;
        got.forEach((r) => { r.page.canvas.setAttribute("role", "img"); r.page.canvas.setAttribute("aria-label", `Page ${r.n} preview`); });
        box.classList.toggle("two", got.length > 1);
        box.replaceChildren(...got.map((r) => r.page.canvas));
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
          if (key !== COVER && (WRITING[key.type] || key.type === "photos" || key.type === "about" || key.type === "divider")) {
            if (r.half === undefined || r.half === 0) tooLong.set(key, !!(r.page.cuts && r.page.cuts.length));
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
        <p class="sb-warn" id="sbPageWarn" hidden></p>`;
      const head = $("#sbPageHead");
      const about = {
        cover: "The first page. Your headshot can go here when you have one: it fills the cover's empty area and nothing else moves.",
        photos: "Tap photos below to add them, tap again to remove. Up to six; the layout follows how many there are and their shapes.",
        spread: "One photograph across two facing pages. A landscape frame works best, with nobody's face on the fold.",
        divider: "A quiet page between sections, e.g. “Fashion & editorial” before your fashion work.",
        about: "Your words about the studio. With none typed, the page uses a plain description of the studio.",
        services: "Lists the kinds of shoot that are live on your site.",
        contact: "Your email, Instagram, website and booking link, with a QR code to the booking form.",
        story: "A magazine opener: a headline, an intro and a short story about a shoot or a brief, with a photo if you like.",
        note: "Writing about one picture: the photo large, a title, a few lines, and a detail line.",
        quote: "One sentence set large: a client's or model's real words, or your own belief about photography.",
        letter: "A page of your own writing, signed: a foreword to the book or a note to one brand."
      };
      const kind = entry ? entry.type : "cover";
      head.innerHTML = `<h3>${esc(entry ? PAGE_LABEL[entry.type] : "Cover")}</h3><p class="sb-hint">${esc(about[kind] || "")}</p>`;
      drawFields(); drawPhotoBlock(); updateMeters();
    }

    function fieldHtml(f, value, max, extra = "") {
      const id = `sbF_${f.k}`;
      const described = `${f.hint ? `${id}_hint ` : ""}${id}_fit ${id}_count`;
      const ph = f.ph ? `placeholder="${esc(f.ph)}"` : "";
      const control = f.ctl === "input"
        ? `<input type="text" id="${id}" data-field="${f.k}" maxlength="${max}" value="${esc(value)}" ${ph} autocapitalize="sentences" spellcheck="true" enterkeyhint="next" aria-describedby="${described}">`
        : `<textarea id="${id}" data-field="${f.k}" maxlength="${max}" rows="${f.rows || 3}" ${ph} autocapitalize="sentences" spellcheck="true" ${f.ctl === "line" ? `data-line="1" enterkeyhint="next"` : `enterkeyhint="enter"`} aria-describedby="${described}">${esc(value)}</textarea>`;
      return `<div class="sb-field">
        <label for="${id}">${esc(f.label)}</label>
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

    function drawFields() {
      const box = $("#sbFields"); if (!box) return;
      const entry = sel >= 0 ? book.pages[sel] : null;
      const caps = fieldCaps();
      if (!entry) {
        box.innerHTML = `
          ${fieldHtml({ k: "title", label: "Title", ctl: "input" }, book.title || "", 80)}
          ${fieldHtml({ k: "subtitle", label: "Line under the title", ctl: "input" }, book.subtitle || "", 120)}`;
        wireField($("#sbF_title"), (v) => { book.title = v; }, 80);
        wireField($("#sbF_subtitle"), (v) => { book.subtitle = v; }, 120);
        return;
      }
      if (WRITING[entry.type]) {
        box.innerHTML = `<h3>Words</h3>${FIELD_UI[entry.type].map((f) => fieldHtml(f, entry[f.k] || "", (caps[entry.type] || {})[f.k] || 200,
          f.credit ? `<button type="button" class="sb-link" id="sbUseCredit">Use the album credit</button>` : "")).join("")}
          <details class="sb-ideas"><summary>Ideas</summary><ul>${IDEAS[entry.type].map((q) => `<li>${esc(q)}</li>`).join("")}</ul></details>
          <p class="sb-hint">Published books are public: only use names and words people are happy to see there, and no private notes.</p>`;
        for (const f of FIELD_UI[entry.type]) wireField($(`#sbF_${f.k}`), (v) => { entry[f.k] = v; }, (caps[entry.type] || {})[f.k] || 200);
        $$("[data-select]").forEach((b) => b.addEventListener("click", () => selectOverflow(b.dataset.select)));
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
      if (entry.type === "photos") {
        box.innerHTML = fieldHtml({ k: "caption", label: "Caption for this page (optional)", ctl: "input", ph: "e.g. Monsoon edit, shot on the roof in Sector 46" }, entry.caption || "", (caps.photos || {}).caption || 90)
          + `<p class="sb-hint">Published books are public, so keep private details out of captions.</p>`;
        wireField($("#sbF_caption"), (v) => { entry.caption = v; }, (caps.photos || {}).caption || 90);
        $$("[data-select]").forEach((b) => b.addEventListener("click", () => selectOverflow(b.dataset.select)));
        return;
      }
      if (entry.type === "divider") {
        box.innerHTML = `${fieldHtml({ k: "heading", label: "Heading", ctl: "input" }, entry.heading || "", 60)}${fieldHtml({ k: "line", label: "One line under it", ctl: "input" }, entry.line || "", 160)}`;
        wireField($("#sbF_heading"), (v) => { entry.heading = v; }, 60);
        wireField($("#sbF_line"), (v) => { entry.line = v; }, 160);
        return;
      }
      if (entry.type === "about") {
        box.innerHTML = fieldHtml({ k: "about", label: "About the studio", ctl: "area", rows: 8, ph: DEFAULT_ABOUT.split("\n")[0] }, book.texts.about || "", 1200);
        wireField($("#sbF_about"), (v) => { book.texts.about = v; }, 1200);
        return;
      }
      if (entry.type === "services") {
        box.innerHTML = `<label class="sb-check-row"><input type="checkbox" id="sbPrices" ${book.texts.showPrices ? "checked" : ""}> Show package prices on this page</label>
          <p class="sb-hint">Off by default: a printed price caps a job before the brief is known.</p>`;
        $("#sbPrices").addEventListener("change", (e) => { book.texts.showPrices = e.target.checked; change({ rail: false }); });
        return;
      }
      if (entry.type === "contact") {
        box.innerHTML = `<div class="sb-field"><label for="sbPhone">WhatsApp number (optional)</label>
          <input type="tel" id="sbPhone" maxlength="24" value="${esc(book.texts.phone || "")}" placeholder="+91 …">
          <p class="sb-hint">Saved books are published inside the site's data file, which is public. Leave this empty unless you're happy for the number to be public.</p></div>`;
        $("#sbPhone").addEventListener("input", (e) => { book.texts.phone = e.target.value; change({ rail: false, typing: true }); });
        $("#sbPhone").addEventListener("blur", () => flush());
        return;
      }
      box.innerHTML = "";
    }
    function selectOverflow(k) {
      const entry = sel >= 0 ? book.pages[sel] : null;
      const el = $(`#sbF_${k}`); if (!entry || !el || !book) return;
      const size = SIZE[book.orientation] || SIZE.portrait;
      let info = null;
      if (WRITING[entry.type]) info = planWriting(book, entry, size.w, size.h).fields[k];
      else if (entry.type === "photos") {
        const st = WTYPE[book.style] ? book.style : "modern";
        info = captionFit(entry, st === "elegant" ? size.w - 52 : st === "modern" ? size.w - 28 : size.w - 24, CAPTION_TYPE[st]);
      }
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
      const size = SIZE[book.orientation] || SIZE.portrait;
      let fields = null, cuts = [];
      if (WRITING[entry.type]) { const plan = planWriting(book, entry, size.w, size.h); fields = plan.fields; cuts = plan.cuts; }
      else if (entry.type === "photos") {
        const st = WTYPE[book.style] ? book.style : "modern";
        const width = st === "elegant" ? size.w - 52 : st === "modern" ? size.w - 28 : size.w - 24;
        const r = captionFit(entry, width, CAPTION_TYPE[st]);
        fields = { caption: r ? { kind: "block", empty: false, ...r } : { kind: "block", empty: true } };
        if (r && r.cut) cuts = [{ field: "caption", label: "caption" }];
      } else {
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
      if (!entry.photos) return null;
      return { list: entry.photos, max: entry.type === "photos" ? MAX_PER_PAGE : 1, set: (l) => { entry.photos = l; } };
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
      const heading = !entry ? "Cover photo" : entry.type === "photos" ? `Photos · ${list.length} of ${t.max}` : entry.type === "spread" ? "The photo" : entry.type === "note" ? "The photo" : "Photo (optional)";
      const open = pickerOpen === null ? (list.length === 0 || (t.max > 1 && list.length < t.max)) : pickerOpen;
      const mode = cur && FIT_MODES.includes(cur.fit) ? cur.fit : "auto";
      const shown = [];
      for (const [id, hit] of lib.byId) {
        if (filter === "diagrams" ? hit.photo.diagram : (filter === "all" || hit.shoot.id === filter)) shown.push([id, hit]);
      }
      box.innerHTML = `
        <h3>${esc(heading)}</h3>
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
      box.querySelectorAll("[data-active]").forEach((b) => b.addEventListener("click", () => { active = +b.dataset.active; drawPhotoBlock(); const again = box.querySelector(`[data-active="${active}"]`); if (again) again.focus(); }));
      box.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => {
        const l = photoTarget().list.slice(), j = active + +b.dataset.move;
        [l[active], l[j]] = [l[j], l[active]]; setList(l); active = j; change({ photos: true });
      }));
      const rm = box.querySelector("[data-remove]");
      if (rm) rm.addEventListener("click", () => { const l = photoTarget().list.slice(); l.splice(active, 1); setList(l); active = Math.max(0, active - 1); change({ photos: true }); });
      box.querySelectorAll("[data-fit]").forEach((b) => b.addEventListener("click", () => {
        const l = photoTarget().list.slice();
        const next = { ...l[active] };
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
        </div>`;
      const radio = (selector, apply) => panel.querySelectorAll(selector).forEach((b) => b.addEventListener("click", () => {
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
      radio("[data-style]", (b) => { book.style = b.dataset.style; });
      radio("[data-cw]", (b) => { book.colourway = b.dataset.cw; });
      radio("[data-orient]", (b) => { book.orientation = b.dataset.orient; });
    }

    /* --- checks, publish, download --- */
    async function problems(b) {
      await ensureFonts();
      const lib = library();
      const size = SIZE[b.orientation] || SIZE.portrait;
      const out = [];
      if (b.cover && !lib.byId.has(b.cover.id)) out.push({ i: -1, text: "Cover: the photo is from a deleted album" });
      let n = 1;
      for (let i = 0; i < b.pages.length; i++) {
        const pg = b.pages[i];
        const first = n + 1; n += pg.type === "spread" ? 2 : 1;
        if (n > MAX_PAGES) break;
        const add = (text) => out.push({ i, text: `Page ${pad2(first)} · ${PAGE_LABEL[pg.type]}: ${text}` });
        if ((pg.type === "photos" || pg.type === "spread") && !(pg.photos || []).length) add("no photos yet");
        if (pg.type === "note" && !(pg.photos || []).length) add("no photo chosen");
        if ((pg.photos || []).some((sh) => !lib.byId.has(sh.id))) add("a photo from a deleted album");
        if (WRITING[pg.type]) {
          const plan = planWriting(b, pg, size.w, size.h);
          if (!Object.keys(fieldCaps()[pg.type] || {}).some((k) => oneParagraph(pg[k]).length)) add("no words yet");
          else {
            for (const k of REQUIRED[pg.type] || []) if (plan.fields[k] && plan.fields[k].empty) add(`the ${({ headline: "headline", body: pg.type === "letter" ? "letter" : "story", title: "title", note: "words about the picture", quote: "quote", heading: "heading" })[k]} is empty`);
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
    async function drawCheck() {
      const box = $("#sbCheck"); if (!box) return;
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
        setStatus(ok ? `Published ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${longNote()}` : "Saved on this device — publish failed");
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
      if (list.length) {
        const shown = list.slice(0, 5).map((p) => `• ${p.text}`).join("\n");
        const more = list.length > 5 ? `\n…and ${list.length - 5} more (marked in the page list).` : "";
        if (!confirm(`Before you send this:\n${shown}${more}\n\nDownload anyway?`)) return;
      }
      const buttons = $$("[data-dl]");
      const label = btn.textContent;
      const ready = $("#sbReady");
      buttons.forEach((b) => { b.disabled = true; });
      btn.textContent = format === "pdf" ? "Making the PDF…" : "Making the images…";
      ready.replaceChildren(); dropFiles();
      const base = `${(snap.name || "portfolio").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "portfolio"}${watermarked ? "-sample" : ""}`;
      try {
        // Print quality first, then softer if the device runs short of memory.
        let result = null, lastErr = null;
        for (const dpi of [150, 110]) {
          try {
            const out = [];
            let done = 0;
            for await (const r of renderPages(snap, { dpi, watermarked, cache })) {
              const { canvas, links } = r.page;
              if (format === "pdf") out.push({ jpeg: await API.canvasJpeg(canvas, 0.9), width: canvas.width, height: canvas.height, links });
              else out.push({ blob: await API.canvasPng(canvas), n: r.n });
              canvas.width = 0; canvas.height = 0;            // release before the next page
              done++; btn.textContent = `${format === "pdf" ? "Making the PDF" : "Making the images"}… ${done}/${renderedCount(snap)}`;
            }
            result = format === "pdf" ? await API.buildPdf(out, `${snap.name} — ${studio()}`) : out;
            break;
          } catch (err) { lastErr = err; }
        }
        if (!result) throw lastErr || new Error("unknown error");
        if (!ready.isConnected) return;
        if (format === "pdf") {
          const blob = new Blob([result], { type: "application/pdf" });
          const url = URL.createObjectURL(blob); fileUrls.push(url);
          ready.innerHTML = `<a href="${url}" download="${esc(base)}.pdf">Save PDF (${(blob.size / 1048576).toFixed(1)} MB)</a>`;
          if (!matchMedia("(pointer: coarse)").matches) ready.querySelector("a").click();
          else { const pop = $("#sbDlPop"); if (pop) { pop.hidden = false; $("#sbDlToggle").setAttribute("aria-expanded", "true"); } API.toast("Your PDF is ready: tap “Save PDF” in Download."); }
        } else {
          ready.innerHTML = result.map((r) => {
            const url = URL.createObjectURL(r.blob); fileUrls.push(url);
            return `<a href="${url}" download="${esc(base)}-page-${pad2(r.n)}.png">Page ${r.n}</a>`;
          }).join("");
          if (!matchMedia("(pointer: coarse)").matches) {
            // One after another: a browser asked for many files at once keeps the first.
            [...ready.querySelectorAll("a")].forEach((a, i) => setTimeout(() => {
              Object.assign(document.createElement("a"), { href: a.href, download: a.getAttribute("download") }).click();
            }, i * 450));
          }
        }
      } catch (err) {
        ready.innerHTML = `<p class="sb-warn">Couldn't make the ${format === "pdf" ? "PDF" : "images"} (${esc(err.message || err)}). Try again, or with fewer pages.</p>`;
      } finally {
        buttons.forEach((b) => { b.disabled = false; });
        btn.textContent = label;
      }
    }

    if (!API.isAdmin()) { root.innerHTML = `<p class="sb-warn">The portfolio book is for the studio. Switch on admin mode to use it.</p>`; return; }
    // This builder saves writing pages, captions and photo placements. A tab
    // that loaded the site before they existed still runs the old save code,
    // which would drop them while saying "Saved": refuse until it reloads.
    const L = window.STUDIO_BOOK_LIMITS;
    if (!L || !L.fields || !L.fits || !(L.pageTypes || []).includes("letter")) {
      root.innerHTML = `<div class="sb-empty"><p class="sb-warn">The site was updated while this tab was open.</p><p class="sb-hint">Reload the page (or use “↻ Load fresh version”) before editing your books, so nothing you write is lost.</p><p><button type="button" class="sb-btn dark" id="sbReload">Reload now</button></p></div>`;
      root.querySelector("#sbReload").addEventListener("click", () => location.reload());
      return;
    }
    showList();
  }

  window.StudioBook = { mount, renderPages, COLOURWAYS, STYLES, newBook };
})();
