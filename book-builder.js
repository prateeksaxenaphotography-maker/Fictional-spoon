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
      const faces = ["300 40px Fraunces", "italic 400 20px Fraunces", "800 40px Archivo", "600 20px Archivo", "300 16px Inter", "400 16px Inter", "600 16px Inter",
        "500 16px Outfit", "600 16px Outfit", "700 16px 'JetBrains Mono'", "500 16px 'IBM Plex Mono'"];
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
    if (lines.length > maxLines) {
      // Cut: the last line always ends in "…" and still fits.
      lines = lines.slice(0, maxLines);
      let last = lines[maxLines - 1];
      while (last.length > 1 && measure(page, `${last}…`) > maxMm) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last.trimEnd()}…`;
    }
    return { size, lines };
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
    const zoom = Math.min(3, Math.max(1, Number(shot && shot.zoom) || 1));
    const scale = Math.max(page.u(w) / iw, page.u(h) / ih) * zoom;
    const sw = Math.min(iw, page.u(w) / scale), sh = Math.min(ih, page.u(h) / scale);
    const fx = Math.min(1, Math.max(0, shot && typeof shot.x === "number" ? shot.x : 0.5));
    const fy = Math.min(1, Math.max(0, shot && typeof shot.y === "number" ? shot.y : 0.35));
    page.ctx.drawImage(img, (iw - sw) * fx, (ih - sh) * fy, sw, sh, page.u(x), page.u(y), page.u(w), page.u(h));
    page.photos.push({ id: shot && shot.id, x, y, w, h });
  }
  // Fit whole (no crop) inside the box, centred; returns the rectangle used.
  function fitPhoto(page, img, shot, x, y, w, h) {
    const a = (img.naturalWidth || 1) / (img.naturalHeight || 1);
    let dw = w, dh = w / a;
    if (dh > h) { dh = h; dw = h * a; }
    const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
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
  function library() {
    const shoots = (API.shoots() || []).filter((s) => s && !s.isTestimonial && Array.isArray(s.photos));
    const byId = new Map();
    const albums = [];
    for (const s of shoots) {
      const photos = s.photos.filter((p) => p && p.id && (p.url || p.dataUrl));
      if (!photos.length) continue;
      albums.push({ id: s.id, name: cleanName(s.title || s.talent) || "Untitled", count: photos.length });
      for (const p of photos) if (!byId.has(p.id)) byId.set(p.id, { photo: p, shoot: s });
    }
    return { byId, albums };
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
          if (imgs[i]) { drawPhoto(page, imgs[i], shots[i], c.x, c.y, c.w, c.h); frame(page, c.x, c.y, c.w, c.h, P.rule, 0.2); }
          else missing(page, P, c.x, c.y, c.w, c.h);
        });
      }
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
      if (shots.length === 1) {
        if (imgs[0]) drawPhoto(page, imgs[0], shots[0], 0, 0, W, H); else missing(page, P, 0, 0, W, H);
        // A full-bleed page still carries its number, on a band at the foot.
        rect(page, 0, H - 9, W, 9, P.deep);
        font(page, 700, 2.4, F.mono, 0.4);
        text(page, String(n).padStart(2, "0"), M.side, H - 3.4, P.onDeep);
        const credit = creditLine(shoots);
        if (credit) text(page, ellipsize(page, credit.toUpperCase(), W - 2 * M.side - 14), W - M.side, H - 3.4, P.onDeep, "right");
        return;
      }
      const box = { x: M.side, y: M.top, w: W - 2 * M.side, h: H - M.top - M.bottom };
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
      if (shots.length === 1) {
        if (imgs[0]) drawPhoto(page, imgs[0], shots[0], 0, 0, W, H); else missing(page, P, 0, 0, W, H);
      } else {
        const aspects = shots.map((s, i) => (imgs[i] ? imgs[i].naturalWidth / imgs[i].naturalHeight : 0.7));
        // Tiled trim to trim: tightness is the style.
        cells(shots.length, { x: 0, y: 0, w: W, h: H }, M.gap, aspects, W > H).forEach((c, i) => {
          if (imgs[i]) drawPhoto(page, imgs[i], shots[i], c.x, c.y, c.w, c.h); else missing(page, P, c.x, c.y, c.w, c.h);
        });
      }
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
    for (; i < lines.length; i++) {
      const yy = y + i * lead;
      if (yy > maxY) break;
      const last = i + 1 < lines.length && y + (i + 1) * lead > maxY;
      text(page, last ? ellipsize(page, `${lines[i]} …`, maxW) : lines[i], x, yy, P.ink);
    }
    return y + i * lead;
  }

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
      const lead = t.size * 1.05;
      const top = H / 2 - (t.lines.length - 1) * lead / 2;
      font(page, weight, t.size, family, spacing);
      t.lines.forEach((l, i) => text(page, l, 20, top + i * lead, on));
      const after = top + (t.lines.length - 1) * lead;
      if (book.style === "elegant") rect(page, 20, after + 8, 22, 0.8, P.accent);
      if (entry.line) { font(page, 400, 4.2, F.sans); wrap(page, entry.line, maxW).slice(0, 4).forEach((l, i) => text(page, i === 3 ? ellipsize(page, l, maxW) : l, 20, after + t.size * 0.5 + 10 + i * 6.4, on)); }
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

  /* ---------- rendering a book ----------------------------------------------
     Yields one finished page at a time, so the caller can encode and release
     each canvas before the next is drawn. */
  async function* renderPages(book, { dpi, watermarked = false, cache, only = null }) {
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

  /* ---------- the builder UI --------------------------------------------------- */
  const CSS = `
  .sb-root { --sb-line: var(--line, rgba(20,20,22,.1)); display: grid; gap: 22px; }
  .sb-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 12px 14px; background: var(--bone, #fff); border: 1px solid var(--sb-line); border-radius: 10px; }
  .sb-bar select, .sb-root input[type=text], .sb-root input[type=tel], .sb-root textarea { font: 500 14px Inter, system-ui, sans-serif; padding: 9px 11px; border: 1px solid var(--sb-line); border-radius: 8px; background: var(--paper, #faf8f5); color: var(--ink, #141416); min-width: 0; }
  .sb-root textarea { width: 100%; min-height: 110px; resize: vertical; line-height: 1.5; }
  .sb-grow { flex: 1 1 auto; }
  .sb-status { font: 600 12px 'JetBrains Mono', monospace; letter-spacing: .04em; color: var(--ink-soft, #5c5e66); }
  .sb-btn { font: 600 13.5px Inter, system-ui, sans-serif; padding: 9px 14px; border-radius: 999px; border: 1px solid var(--ink, #141416); background: transparent; color: var(--ink, #141416); cursor: pointer; }
  .sb-btn:hover { background: var(--bone-2, #f3efe7); }
  .sb-btn.dark { background: var(--ink, #141416); color: var(--paper, #faf8f5); }
  .sb-btn.dark:hover { background: var(--accent, #d24e1a); border-color: var(--accent, #d24e1a); }
  .sb-btn:disabled { opacity: .45; cursor: not-allowed; }
  .sb-btn:focus-visible, .sb-sw:focus-visible, .sb-seg button:focus-visible, .sb-thumb:focus-visible, .sb-pagerow:focus-visible { outline: 2px solid var(--accent, #d24e1a); outline-offset: 2px; }
  .sb-link { background: none; border: 0; padding: 2px; font: 600 13px Inter, sans-serif; color: var(--accent, #d24e1a); text-decoration: underline; cursor: pointer; }
  .sb-editor { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 22px; align-items: start; }
  .sb-panel { background: var(--bone, #fff); border: 1px solid var(--sb-line); border-radius: 10px; padding: 16px; display: grid; gap: 14px; }
  .sb-panel h3 { margin: 0; font: 700 11px 'JetBrains Mono', monospace; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-soft, #5c5e66); }
  .sb-field { display: grid; gap: 6px; font: 600 12.5px Inter, sans-serif; color: var(--ink, #141416); }
  .sb-seg { display: flex; gap: 4px; flex-wrap: wrap; }
  .sb-seg button { flex: 1 1 auto; font: 600 12.5px Inter, sans-serif; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--sb-line); background: var(--paper, #faf8f5); color: var(--ink, #141416); cursor: pointer; }
  .sb-seg button[aria-checked=true] { background: var(--ink, #141416); color: var(--paper, #faf8f5); border-color: var(--ink, #141416); }
  .sb-sws { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px; }
  .sb-sw { display: flex; align-items: center; gap: 7px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--sb-line); background: var(--paper, #faf8f5); color: var(--ink, #141416); font: 600 11.5px Inter, sans-serif; cursor: pointer; text-align: left; }
  .sb-sw[aria-checked=true] { border-color: var(--ink, #141416); box-shadow: inset 0 0 0 1px var(--ink, #141416); }
  .sb-chips { display: inline-flex; flex: none; }
  .sb-chips i { width: 13px; height: 13px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); margin-left: -4px; }
  .sb-chips i:first-child { margin-left: 0; }
  .sb-pages { display: grid; gap: 6px; }
  .sb-pagerow { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; padding: 8px 10px; border: 1px solid var(--sb-line); border-radius: 8px; background: var(--paper, #faf8f5); cursor: pointer; font: 500 13px Inter, sans-serif; color: var(--ink, #141416); }
  .sb-pagerow[aria-current=true] { border-color: var(--accent, #d24e1a); box-shadow: inset 3px 0 0 var(--accent, #d24e1a); }
  .sb-pagerow .sb-n { font: 700 11px 'JetBrains Mono', monospace; color: var(--ink-soft, #5c5e66); min-width: 34px; }
  .sb-pagerow .sb-acts { display: flex; gap: 2px; }
  .sb-pagerow .sb-acts button { width: 28px; height: 28px; border-radius: 6px; border: 1px solid transparent; background: none; color: var(--ink, #141416); cursor: pointer; font-size: 14px; }
  .sb-pagerow .sb-acts button:hover { border-color: var(--sb-line); background: var(--bone, #fff); }
  .sb-add { display: flex; flex-wrap: wrap; gap: 6px; }
  .sb-add button { font: 600 12px Inter, sans-serif; padding: 6px 10px; border-radius: 999px; border: 1px dashed var(--ink-soft, #5c5e66); background: none; color: var(--ink, #141416); cursor: pointer; }
  .sb-hint { margin: 0; font: 400 12.5px/1.5 Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-warn { margin: 0; font: 600 12.5px/1.5 Inter, sans-serif; color: var(--accent, #d24e1a); }
  .sb-work { display: grid; gap: 18px; min-width: 0; }
  .sb-preview { display: grid; place-items: center; background: var(--bone-2, #f3efe7); border-radius: 10px; padding: 18px; min-height: 320px; }
  .sb-preview canvas { max-width: 100%; max-height: 72vh; height: auto; box-shadow: 0 12px 30px -14px rgba(0,0,0,.4); background: #fff; }
  .sb-strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
  .sb-strip button { flex: none; border: 2px solid transparent; padding: 0; background: none; cursor: pointer; border-radius: 3px; }
  .sb-strip button[aria-current=true] { border-color: var(--accent, #d24e1a); }
  .sb-strip canvas { display: block; height: 96px; width: auto; }
  .sb-on { display: flex; flex-wrap: wrap; gap: 10px; }
  .sb-onitem { display: grid; gap: 6px; width: 132px; font: 500 11.5px Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-onitem img { width: 132px; height: 132px; object-fit: cover; border-radius: 6px; background: var(--bone-2, #f3efe7); }
  .sb-onitem .sb-row { display: flex; gap: 4px; }
  .sb-onitem .sb-row button { flex: 1; font: 700 12px Inter, sans-serif; padding: 4px 0; border-radius: 6px; border: 1px solid var(--sb-line); background: var(--paper, #faf8f5); color: var(--ink, #141416); cursor: pointer; }
  .sb-onitem input[type=range] { width: 100%; accent-color: var(--accent, #d24e1a); }
  .sb-filters { display: flex; flex-wrap: wrap; gap: 6px; }
  .sb-filters button { font: 600 12px Inter, sans-serif; padding: 6px 10px; border-radius: 999px; border: 1px solid var(--sb-line); background: var(--paper, #faf8f5); color: var(--ink, #141416); cursor: pointer; }
  .sb-filters button[aria-pressed=true] { background: var(--ink, #141416); color: var(--paper, #faf8f5); }
  .sb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
  .sb-thumb { position: relative; padding: 0; border: 0; background: var(--bone-2, #f3efe7); border-radius: 6px; overflow: hidden; cursor: pointer; aspect-ratio: 3 / 4; }
  .sb-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .25s; }
  .sb-thumb:hover img { transform: scale(1.04); }
  .sb-thumb[aria-pressed=true] { box-shadow: 0 0 0 3px var(--accent, #d24e1a); }
  .sb-thumb[aria-pressed=true]::after { content: attr(data-order); position: absolute; top: 5px; right: 5px; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px; background: var(--accent, #d24e1a); color: #fff; font: 700 11.5px/22px Inter, sans-serif; text-align: center; }
  .sb-thumb:disabled { opacity: .35; cursor: not-allowed; }
  .sb-export { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .sb-ready { display: flex; flex-wrap: wrap; gap: 8px; }
  .sb-ready a { font: 600 13px Inter, sans-serif; padding: 8px 12px; border-radius: 999px; background: var(--ink, #141416); color: var(--paper, #faf8f5); text-decoration: none; }
  .sb-list { display: grid; gap: 10px; }
  .sb-card { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; padding: 14px 16px; border: 1px solid var(--sb-line); border-radius: 10px; background: var(--bone, #fff); }
  .sb-card h4 { margin: 0 0 3px; font: 700 15px Inter, sans-serif; color: var(--ink, #141416); }
  .sb-card p { margin: 0; font: 400 12.5px Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-card .sb-cardacts { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  @media (max-width: 900px) { .sb-editor { grid-template-columns: minmax(0, 1fr); } .sb-sws { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (prefers-reduced-motion: reduce) { .sb-thumb img { transition: none; } }
  `;
  function injectCss() {
    if (document.getElementById("sb-css")) return;
    const st = document.createElement("style");
    st.id = "sb-css"; st.textContent = CSS;
    document.head.appendChild(st);
  }

  function mount(root) {
    injectCss();
    const esc = API.esc;
    const cache = new Map();
    let state = readState();
    let book = null;             // the book being edited (a working copy)
    let sel = -1;                // -1 = cover, else index into book.pages
    let filter = "all";
    let saveTimer = null, renderToken = 0, fileUrls = [];
    // Set by an actual edit. Opening a book and leaving it must not re-stamp
    // it as the newest version: that stale copy would then win the merge
    // against an edit made on another device since.
    let dirty = false;
    const dropFiles = () => { fileUrls.forEach((u) => URL.revokeObjectURL(u)); fileUrls = []; };

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
      setStatus(status);
      return true;
    }
    function change(opts = {}) {
      dirty = true;
      clearTimeout(saveTimer);
      setStatus("Saving…");
      saveTimer = setTimeout(() => persist(), 350);
      if (opts.pages !== false) drawPageList();
      if (opts.picker !== false) drawPicker();
      drawPreview();
    }
    function setStatus(s) { const el = root.querySelector("#sbStatus"); if (el) el.textContent = s; }

    /* --- screen 1: the list of books --- */
    function showList() {
      book = null; dropFiles();
      state = readState();
      root.innerHTML = `
        <div class="sb-bar">
          <strong class="sb-grow" style="font: 700 15px Inter, sans-serif;">Your books</strong>
          <button type="button" class="sb-btn dark" id="sbNew">New book</button>
        </div>
        ${state.versions.length ? `<div class="sb-list">${state.versions.map((v) => `
          <div class="sb-card">
            <div>
              <h4>${esc(v.name)}</h4>
              <p>${esc((STYLES.find((s) => s.key === v.style) || {}).name || "")} · ${esc(colourway(v.colourway).name)} · ${esc(v.orientation)} · ${renderedCount(v)} page${renderedCount(v) === 1 ? "" : "s"} · edited ${esc(new Date(v.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }))}</p>
            </div>
            <div class="sb-cardacts">
              <button type="button" class="sb-btn dark" data-open="${esc(v.id)}">Open</button>
              <button type="button" class="sb-btn" data-dup="${esc(v.id)}">Duplicate</button>
              <button type="button" class="sb-btn" data-del="${esc(v.id)}">Delete</button>
            </div>
          </div>`).join("")}</div>`
        : `<p class="sb-hint">No books yet. A book is a cover plus pages of your photographs, in one of three styles and nine colourways. Start one, pick your clicks, and save as many versions as you need — one for brands, one for agencies, one for a single client.</p>`}
        <p class="sb-hint">Books are saved on this device as you work, and published with your albums when you press Publish, so they open on any device.</p>`;
      const LIMIT = (window.STUDIO_BOOK_LIMITS && window.STUDIO_BOOK_LIMITS.versions) || 200;
      const atLimit = state.versions.length >= LIMIT;
      if (atLimit) { root.querySelector("#sbNew").disabled = true; root.querySelectorAll("[data-dup]").forEach((b) => { b.disabled = true; }); }
      root.querySelector("#sbNew").addEventListener("click", () => { if (!atLimit) openBook(newBook(`Book ${state.versions.length + 1}`), true); });
      root.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
        const v = state.versions.find((x) => x.id === b.dataset.open); if (v) openBook(JSON.parse(JSON.stringify(v)));
      }));
      root.querySelectorAll("[data-dup]").forEach((b) => b.addEventListener("click", () => {
        const cur = readState();
        const v = cur.versions.find((x) => x.id === b.dataset.dup); if (!v) return;
        const copy = { ...JSON.parse(JSON.stringify(v)), id: uid(), name: `${v.name} (copy)`, updatedAt: Date.now() };
        if (!writeState({ versions: [copy, ...cur.versions], deleted: cur.deleted })) { API.toast("Not saved — this device's storage is full or blocked."); return; }
        showList();
      }));
      root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
        const cur = readState();
        const v = cur.versions.find((x) => x.id === b.dataset.del); if (!v) return;
        if (!confirm(`Delete “${v.name}”? This cannot be undone once published.`)) return;
        if (!writeState({ versions: cur.versions.filter((x) => x.id !== v.id), deleted: [...cur.deleted, v.id] })) { API.toast("Not deleted — this device's storage is full or blocked."); return; }
        showList(); API.toast(`Deleted “${v.name}”. Publish to remove it everywhere.`);
      }));
    }

    function openBook(b, isNew = false) {
      book = b; sel = book.pages.length ? 0 : -1; filter = "all";
      dirty = isNew;
      if (isNew) persist("New book saved on this device");
      showEditor();
    }

    /* --- screen 2: the editor --- */
    function showEditor() {
      const P = colourway(book.colourway);
      root.innerHTML = `
        <div class="sb-bar">
          <button type="button" class="sb-btn" id="sbBack">← All books</button>
          <input type="text" id="sbName" class="sb-grow" maxlength="80" value="${esc(book.name)}" aria-label="Book name">
          <span class="sb-status" id="sbStatus" aria-live="polite">Saved on this device</span>
          <button type="button" class="sb-btn dark" id="sbPublish">Publish</button>
        </div>
        <div class="sb-editor">
          <div class="sb-panel">
            <h3>Cover</h3>
            <label class="sb-field">Title<input type="text" id="sbTitle" maxlength="80" value="${esc(book.title)}"></label>
            <label class="sb-field">Line under the title<input type="text" id="sbSub" maxlength="120" value="${esc(book.subtitle)}"></label>
            <h3>Style</h3>
            <div class="sb-seg" role="radiogroup" aria-label="Style">${STYLES.map((s) => `<button type="button" role="radio" data-style="${s.key}" aria-checked="${book.style === s.key}">${s.name}</button>`).join("")}</div>
            <p class="sb-hint" id="sbStyleNote">${esc((STYLES.find((s) => s.key === book.style) || STYLES[1]).note)}</p>
            <h3>Colourway</h3>
            <div class="sb-sws" role="radiogroup" aria-label="Colourway">${COLOURWAYS.map((c) => `<button type="button" class="sb-sw" role="radio" data-cw="${c.key}" aria-checked="${book.colourway === c.key}"><span class="sb-chips" aria-hidden="true"><i style="background:${c.paper}"></i><i style="background:${c.accent}"></i><i style="background:${c.deep}"></i></span>${c.name}</button>`).join("")}</div>
            <h3>Page shape</h3>
            <div class="sb-seg" role="radiogroup" aria-label="Page shape">${["portrait", "landscape"].map((o) => `<button type="button" role="radio" data-orient="${o}" aria-checked="${book.orientation === o}">${o === "portrait" ? "Portrait" : "Landscape"}</button>`).join("")}</div>
            <h3>Pages</h3>
            <div class="sb-pages" id="sbPages"></div>
            <div class="sb-add" id="sbAdd">
              <button type="button" data-add="photos">+ Photos</button>
              <button type="button" data-add="spread">+ Two-page spread</button>
              <button type="button" data-add="divider">+ Chapter page</button>
              <button type="button" data-add="about">+ About</button>
              <button type="button" data-add="services">+ What I shoot</button>
              <button type="button" data-add="contact">+ Contact</button>
            </div>
            <p class="sb-hint" id="sbCount"></p>
            <h3>Words</h3>
            <label class="sb-field">About the studio (used on the About page)<textarea id="sbAbout" maxlength="1200" placeholder="${esc(DEFAULT_ABOUT.split("\n")[0])}">${esc(book.texts.about || "")}</textarea></label>
            <label class="sb-field">WhatsApp number (used on the Contact page)<input type="tel" id="sbPhone" maxlength="24" value="${esc(book.texts.phone || "")}" placeholder="+91 …"></label>
            <p class="sb-hint">Saved books are published inside the site's data file, which is public. Leave this empty unless you are happy for the number to be public.</p>
            <label class="sb-field" style="grid-auto-flow: column; justify-content: start; align-items: center;"><input type="checkbox" id="sbPrices" ${book.texts.showPrices ? "checked" : ""}> Show package prices on the What I shoot page</label>
            <p class="sb-hint">Off by default: a printed price caps a job before the brief is known.</p>
          </div>
          <div class="sb-work">
            <div class="sb-panel">
              <h3 id="sbPrevTitle">Preview</h3>
              <div class="sb-preview" id="sbPreview" aria-live="polite"><p class="sb-hint">Drawing…</p></div>
              <div class="sb-strip" id="sbStrip" aria-label="All pages"></div>
            </div>
            <div class="sb-panel" id="sbPickPanel"></div>
            <div class="sb-panel">
              <h3>Download</h3>
              <div class="sb-export">
                <button type="button" class="sb-btn dark" id="sbPdf" data-dl>Download PDF</button>
                <button type="button" class="sb-btn" id="sbPng" data-dl>Download PNG pages</button>
                <span class="sb-hint">With the watermark, as a sample: <button type="button" class="sb-link" id="sbPdfMark" data-dl>PDF</button> · <button type="button" class="sb-link" id="sbPngMark" data-dl>PNG</button></span>
              </div>
              <div class="sb-ready" id="sbReady"></div>
            </div>
          </div>
        </div>`;

      root.querySelector("#sbBack").addEventListener("click", () => { clearTimeout(saveTimer); persist(); showList(); });
      root.querySelector("#sbName").addEventListener("input", (e) => { book.name = e.target.value; change({ pages: false, picker: false }); });
      root.querySelector("#sbTitle").addEventListener("input", (e) => { book.title = e.target.value; change({ pages: false, picker: false }); });
      root.querySelector("#sbSub").addEventListener("input", (e) => { book.subtitle = e.target.value; change({ pages: false, picker: false }); });
      root.querySelector("#sbAbout").addEventListener("input", (e) => { book.texts.about = e.target.value; change({ pages: false, picker: false }); });
      root.querySelector("#sbPhone").addEventListener("input", (e) => { book.texts.phone = e.target.value; change({ pages: false, picker: false }); });
      root.querySelector("#sbPrices").addEventListener("change", (e) => { book.texts.showPrices = e.target.checked; change({ pages: false, picker: false }); });
      const radio = (sel2, attr, set) => root.querySelectorAll(sel2).forEach((b) => b.addEventListener("click", () => {
        root.querySelectorAll(sel2).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        set(b.dataset[attr]); change({ picker: false });
      }));
      radio("[data-style]", "style", (v) => { book.style = v; root.querySelector("#sbStyleNote").textContent = (STYLES.find((s) => s.key === v) || {}).note || ""; });
      radio("[data-cw]", "cw", (v) => { book.colourway = v; });
      radio("[data-orient]", "orient", (v) => { book.orientation = v; });
      root.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => addPage(b.dataset.add)));
      root.querySelector("#sbPublish").addEventListener("click", publish);
      root.querySelector("#sbPdf").addEventListener("click", (e) => download(e.currentTarget, "pdf", false));
      root.querySelector("#sbPng").addEventListener("click", (e) => download(e.currentTarget, "png", false));
      root.querySelector("#sbPdfMark").addEventListener("click", (e) => download(e.currentTarget, "pdf", true));
      root.querySelector("#sbPngMark").addEventListener("click", (e) => download(e.currentTarget, "png", true));
      drawPageList(); drawPicker(); drawPreview();
    }

    const PAGE_LABEL = { photos: "Photos", spread: "Two-page spread", divider: "Chapter page", about: "About", services: "What I shoot", contact: "Contact" };
    function addPage(type) {
      const extra = type === "spread" ? 2 : 1;
      if (renderedCount(book) + extra > MAX_PAGES) { API.toast(`A book holds ${MAX_PAGES} pages at most, cover included.`); return; }
      const entry = { type };
      if (type === "photos" || type === "spread") entry.photos = [];
      if (type === "divider") { entry.heading = "Selected work"; entry.line = ""; }
      // New pages go after the one selected, so a book is built in order.
      const at = sel < 0 ? 0 : sel + 1;
      book.pages.splice(at, 0, entry);
      sel = at;
      change();
    }

    function drawPageList() {
      const el = root.querySelector("#sbPages"); if (!el) return;
      let n = 1;
      const rows = [`<div class="sb-pagerow" role="button" tabindex="0" data-sel="-1" aria-current="${sel === -1}"><span class="sb-n">01</span><span>Cover${book.cover ? " · with photo" : ""}</span><span class="sb-acts"></span></div>`];
      book.pages.forEach((pg, i) => {
        const first = n + 1; n += pg.type === "spread" ? 2 : 1;
        const num = pg.type === "spread" ? `${String(first).padStart(2, "0")}–${String(n).padStart(2, "0")}` : String(first).padStart(2, "0");
        const count = pg.photos ? ` · ${pg.photos.length} photo${pg.photos.length === 1 ? "" : "s"}` : "";
        rows.push(`<div class="sb-pagerow" role="button" tabindex="0" data-sel="${i}" aria-current="${sel === i}">
          <span class="sb-n">${num}</span><span>${esc(PAGE_LABEL[pg.type])}${count}${pg.type === "divider" && pg.heading ? ` · ${esc(pg.heading)}` : ""}</span>
          <span class="sb-acts">
            <button type="button" data-up="${i}" aria-label="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
            <button type="button" data-down="${i}" aria-label="Move down" ${i === book.pages.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" data-rm="${i}" aria-label="Remove page">✕</button>
          </span></div>`);
      });
      el.innerHTML = rows.join("");
      el.querySelectorAll("[data-sel]").forEach((r) => {
        const go = (e) => { if (e.target.closest("button")) return; sel = Number(r.dataset.sel); drawPageList(); drawPicker(); drawPreview(); };
        r.addEventListener("click", go);
        r.addEventListener("keydown", (e) => { if (e.target !== r) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(e); } });
      });
      el.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => { const i = +b.dataset.up; [book.pages[i - 1], book.pages[i]] = [book.pages[i], book.pages[i - 1]]; sel = i - 1; change(); }));
      el.querySelectorAll("[data-down]").forEach((b) => b.addEventListener("click", () => { const i = +b.dataset.down; [book.pages[i + 1], book.pages[i]] = [book.pages[i], book.pages[i + 1]]; sel = i + 1; change(); }));
      el.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
        const i = +b.dataset.rm;
        const pg = book.pages[i];
        if (pg.photos && pg.photos.length && !confirm(`Remove this ${PAGE_LABEL[pg.type].toLowerCase()} page and its ${pg.photos.length} photo${pg.photos.length === 1 ? "" : "s"}?`)) return;
        book.pages.splice(i, 1);
        sel = Math.min(i, book.pages.length - 1);
        change();
      }));
      const count = renderedCount(book);
      const c = root.querySelector("#sbCount");
      if (c) c.innerHTML = `${count} of ${MAX_PAGES} pages used${count >= MAX_PAGES ? " — the book is full" : ""}.`;
      root.querySelectorAll("#sbAdd button").forEach((b) => { b.disabled = count + (b.dataset.add === "spread" ? 2 : 1) > MAX_PAGES; });
    }

    // The picker edits whatever is selected: the cover takes one photo, a
    // spread one, a photos page up to six. Tap to add, tap again to remove.
    function drawPicker() {
      const panel = root.querySelector("#sbPickPanel"); if (!panel) return;
      const lib = library();
      const entry = sel >= 0 ? book.pages[sel] : null;
      if (entry && !entry.photos) {
        if (entry.type === "divider") {
          panel.innerHTML = `<h3>Chapter page</h3>
            <label class="sb-field">Heading<input type="text" id="sbDivH" maxlength="60" value="${esc(entry.heading || "")}"></label>
            <label class="sb-field">One line under it<input type="text" id="sbDivL" maxlength="160" value="${esc(entry.line || "")}"></label>
            <p class="sb-hint">A quiet page between sections, for example “Fashion & editorial” before your fashion work.</p>`;
          panel.querySelector("#sbDivH").addEventListener("input", (e) => { entry.heading = e.target.value; change({ picker: false }); });
          panel.querySelector("#sbDivL").addEventListener("input", (e) => { entry.line = e.target.value; change({ picker: false }); });
        } else {
          const why = { about: "Uses the “About the studio” words on the left. With none typed, it uses a plain description of the studio.", services: "Lists the shoots live on your site, with the prices only if you switch them on.", contact: "Your email, Instagram, website and booking link, with a QR code to the booking form. The WhatsApp number shows only if you type one." };
          panel.innerHTML = `<h3>${esc(PAGE_LABEL[entry.type])} page</h3><p class="sb-hint">${esc(why[entry.type] || "")}</p>`;
        }
        return;
      }
      let target = entry ? entry.photos : (book.cover ? [book.cover] : []);
      const max = entry ? (entry.type === "spread" ? 1 : MAX_PER_PAGE) : 1;
      const heading = entry ? (entry.type === "spread" ? "Photo for this spread" : "Photos for this page") : "Cover photo";
      const help = entry
        ? (entry.type === "spread" ? "One photograph runs across two pages. A landscape frame works best, with nobody's face on the fold." : `Tap a photo to add it, tap again to remove it. Up to ${MAX_PER_PAGE} on a page; the layout follows how many you pick and their shapes.`)
        : "Optional. Your headshot, when you have one: it fills the cover's empty area and nothing else moves.";
      const albums = lib.albums;
      const shown = [];
      for (const [id, hit] of lib.byId) if (filter === "all" || hit.shoot.id === filter) shown.push([id, hit]);
      panel.innerHTML = `
        <h3>${heading}</h3>
        <p class="sb-hint">${esc(help)}</p>
        ${target.length ? `<div class="sb-on">${target.map((s, i) => {
          const hit = lib.byId.get(s.id);
          return `<div class="sb-onitem">
            ${hit ? `<img src="${esc(thumbSrc(hit.photo))}" alt="">` : `<div style="width:132px;height:132px;border-radius:6px;background:var(--bone-2,#f3efe7);display:grid;place-items:center;">Removed</div>`}
            <div class="sb-row">
              ${max > 1 ? `<button type="button" data-left="${i}" aria-label="Move earlier" ${i === 0 ? "disabled" : ""}>←</button><button type="button" data-right="${i}" aria-label="Move later" ${i === target.length - 1 ? "disabled" : ""}>→</button>` : ""}
              <button type="button" data-remove="${i}" aria-label="Remove">✕</button>
            </div>
            <label>Zoom<input type="range" min="1" max="3" step="0.05" value="${s.zoom || 1}" data-zoom="${i}"></label>
            <label>Left ↔ right<input type="range" min="0" max="1" step="0.01" value="${s.x}" data-fx="${i}"></label>
            <label>Up ↕ down<input type="range" min="0" max="1" step="0.01" value="${s.y}" data-fy="${i}"></label>
          </div>`;
        }).join("")}</div>` : ""}
        ${target.length >= max ? `<p class="sb-warn">${max === 1 ? "Chosen. Tap it below to remove it, or tap another photo to swap." : `This page is full at ${max}. Remove one to add another.`}</p>` : ""}
        <div class="sb-filters" role="group" aria-label="Filter by album">
          <button type="button" data-f="all" aria-pressed="${filter === "all"}">All albums (${lib.byId.size})</button>
          ${albums.map((a) => `<button type="button" data-f="${esc(a.id)}" aria-pressed="${filter === a.id}">${esc(a.name)} (${a.count})</button>`).join("")}
        </div>
        <div class="sb-grid">${shown.map(([id, hit]) => {
          const pos = target.findIndex((s) => s.id === id);
          const on = pos >= 0;
          const full = !on && target.length >= max && max > 1;
          return `<button type="button" class="sb-thumb" data-pick="${esc(id)}" aria-pressed="${on}" data-order="${on ? pos + 1 : ""}" ${full ? "disabled" : ""} aria-label="${esc(cleanName(hit.shoot.title || hit.shoot.talent))} photo${on ? `, number ${pos + 1} on this page` : ""}"><img src="${esc(thumbSrc(hit.photo))}" alt="" loading="lazy"></button>`;
        }).join("") || `<p class="sb-hint">No photos in this album.</p>`}</div>`;

      // Keeps `target` current: the sliders do not redraw the picker, so every
      // later action must start from the list as it now is, or it writes back
      // the list from when the picker was drawn and loses the zoom just set.
      const setTarget = (list) => { target = list; if (entry) entry.photos = list; else book.cover = list[0] || null; };
      panel.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
        const id = b.dataset.pick;
        const list = target.slice();
        const at = list.findIndex((s) => s.id === id);
        if (at >= 0) list.splice(at, 1);                                   // unselect
        else {
          const hit = lib.byId.get(id);
          const f = hit ? API.photoFocus(hit.photo) : { x: 0.5, y: 0.35 };
          const shot = { id, x: +f.x.toFixed(3), y: +f.y.toFixed(3), zoom: 1 };
          if (max === 1) list.splice(0, list.length, shot);               // swap
          else if (list.length < max) list.push(shot);                      // select
        }
        setTarget(list);
        change();
      }));
      panel.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; drawPicker(); }));
      panel.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => { const l = target.slice(); l.splice(+b.dataset.remove, 1); setTarget(l); change(); }));
      panel.querySelectorAll("[data-left]").forEach((b) => b.addEventListener("click", () => { const i = +b.dataset.left, l = target.slice(); [l[i - 1], l[i]] = [l[i], l[i - 1]]; setTarget(l); change(); }));
      panel.querySelectorAll("[data-right]").forEach((b) => b.addEventListener("click", () => { const i = +b.dataset.right, l = target.slice(); [l[i + 1], l[i]] = [l[i], l[i + 1]]; setTarget(l); change(); }));
      // Sliders move the photo live without rebuilding the picker under the finger.
      const slide = (attr, key) => panel.querySelectorAll(`[data-${attr}]`).forEach((r) => r.addEventListener("input", () => {
        const i = +r.dataset[attr]; const l = target.slice(); l[i] = { ...l[i], [key]: +r.value }; setTarget(l); change({ picker: false, pages: false });
      }));
      slide("zoom", "zoom"); slide("fx", "x"); slide("fy", "y");
    }

    // Draw the selected page large, and every page small along the strip.
    let stripToken = 0;
    async function drawPreview() {
      const token = ++renderToken;
      const box = root.querySelector("#sbPreview"); if (!box) return;
      const title = root.querySelector("#sbPrevTitle");
      try {
        const got = [];
        for await (const r of renderPages(book, { dpi: 72, cache, only: sel })) { got.push(r); if (token !== renderToken) return; }
        if (token !== renderToken) return;
        box.replaceChildren(...got.map((r) => r.page.canvas));
        if (title) title.textContent = got.length > 1 ? `Preview · pages ${got[0].n}–${got[got.length - 1].n}` : `Preview · page ${got[0] ? got[0].n : ""}`;
      } catch (err) {
        box.innerHTML = `<p class="sb-warn">Could not draw this page (${esc(err.message || err)}).</p>`;
      }
      clearTimeout(drawPreview._t);
      drawPreview._t = setTimeout(drawStrip, 250);
    }
    async function drawStrip() {
      const token = ++stripToken;
      const strip = root.querySelector("#sbStrip"); if (!strip) return;
      const buttons = [];
      try {
        for await (const r of renderPages(book, { dpi: 22, cache })) {
          if (token !== stripToken) return;
          const b = document.createElement("button");
          b.type = "button"; b.setAttribute("aria-label", `Page ${r.n}`);
          b.setAttribute("aria-current", String(r.index === sel));
          b.appendChild(r.page.canvas);
          b.addEventListener("click", () => { sel = r.index; drawPageList(); drawPicker(); drawPreview(); });
          buttons.push(b);
        }
        if (token === stripToken) strip.replaceChildren(...buttons);
      } catch (e) { /* the strip is an overview; the large preview reports errors */ }
    }

    async function publish() {
      const btn = root.querySelector("#sbPublish");
      clearTimeout(saveTimer);
      // An unsaved edit must not be reported as published while the older
      // stored version is what actually goes out.
      if (!persist()) { API.toast("Not published: this book could not be saved on this device first."); return; }
      btn.disabled = true; setStatus("Publishing…");
      try {
        const ok = await API.publish();
        setStatus(ok ? `Published ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Saved on this device — publish failed");
        if (ok) API.toast("Your books are published with your albums and open on any device.");
      } catch (e) {
        setStatus("Saved on this device — publish failed");
      } finally { btn.disabled = false; }
    }

    async function download(btn, format, watermarked) {
      // A frozen copy: an edit made while pages are being drawn must not end up
      // half in the file, mixing two styles or losing a page it had counted.
      const snap = JSON.parse(JSON.stringify(book));
      const lib = library();
      const gaps = [];
      let pn = 1;
      snap.pages.forEach((pg) => {
        const first = pn + 1; pn += pg.type === "spread" ? 2 : 1;
        if (!pg.photos) return;
        if (!pg.photos.length) gaps.push(`page ${first} has no photos`);
        else if (pg.photos.some((sh) => !lib.byId.has(sh.id))) gaps.push(`page ${first} has a photo from a deleted album`);
      });
      if (gaps.length && !confirm(`Before you send this: ${gaps.join("; ")}. Those pages will show a placeholder. Download anyway?`)) return;
      const buttons = [...root.querySelectorAll("[data-dl]")];
      const label = btn.textContent;
      const ready = root.querySelector("#sbReady");
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
        if (format === "pdf") {
          const blob = new Blob([result], { type: "application/pdf" });
          const url = URL.createObjectURL(blob); fileUrls.push(url);
          ready.innerHTML = `<a href="${url}" download="${esc(base)}.pdf">Save PDF (${(blob.size / 1048576).toFixed(1)} MB)</a>`;
          if (!matchMedia("(pointer: coarse)").matches) ready.querySelector("a").click();
        } else {
          ready.innerHTML = result.map((r) => {
            const url = URL.createObjectURL(r.blob); fileUrls.push(url);
            return `<a href="${url}" download="${esc(base)}-page-${String(r.n).padStart(2, "0")}.png">Page ${r.n}</a>`;
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
    showList();
  }

  window.StudioBook = { mount, renderPages, COLOURWAYS, STYLES, newBook };
})();
