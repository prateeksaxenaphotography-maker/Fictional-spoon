/* ============================================================
   book-print.js — the portfolio book's print file

   The book is drawn on a canvas, and until now the PDF was a photograph of
   each page: the words were pixels. That is soft on a press, cannot be
   selected or searched, and a print shop cannot trim it — there was no
   bleed and nowhere to cut.

   This file makes the PDF a real one:
   • Real type. While a page is drawn for the PDF, every line of words the
     page asks the canvas for is caught instead, and written into the PDF as
     text in the very font it was set in (the same open-source family,
     embedded), so it is razor-sharp at any size and can be selected, copied
     and searched. Each letter is placed exactly where the canvas would have
     put it — the canvas measures, the PDF follows — so a page cannot reflow
     or drift from what the studio saw. Words the PDF cannot set (a script
     the font has no letters for, emoji, a font that would not load) are
     simply left in the picture, as before.
   • Stacking is kept. If something is later painted over a line of words
     (a photograph laid over text on an Anything page, a band across the
     foot), that line goes back into the picture at that moment, under it.
   • Print-shop files. Optionally each page gets 3 mm of bleed, crop marks
     at the corners and a slug line saying which page it is, with the PDF's
     TrimBox and BleedBox set so imposition software reads them.

   Fonts come from the Fontsource copies of the Google Fonts families the
   book already uses (same designs, same OFL licence), fetched on the first
   print-file download and kept for the session.

   Loaded by book-builder.js the first time a PDF is made. Admin only.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- the families the book is set in ------------------------------
     name as the canvas knows it → the Fontsource package, the weights it
     ships and whether it has italics. Every weight a style or the Format
     panel can ask for is in its list (checked against the package, Sep 2026). */
  const FS = "https://cdn.jsdelivr.net/npm/@fontsource";
  const FS_VER = "5.3.0";
  const all = (a, b) => { const r = []; for (let w = a; w <= b; w += 100) r.push(w); return r; };
  const FACES = {
    // Fraunces changes its drawing with size (optical size 9 to 144): hairline
    // and high-contrast in a headline, sturdier in small type. The canvas
    // follows the size it draws at; the PDF takes the designer's own cut
    // nearest the printed size — 9, 72 or 144 pt — from the family's source.
    "fraunces": { pkg: "fraunces", w: [100, 300, 400, 600, 700, 900], it: [100, 300, 400, 600, 700, 900], opsz: [9, 72, 144] },
    "archivo": { pkg: "archivo", w: all(100, 900), it: all(100, 900) },
    "inter": { pkg: "inter", w: all(100, 900), it: all(100, 900) },
    "outfit": { pkg: "outfit", w: all(100, 900), it: [] },
    "jetbrains mono": { pkg: "jetbrains-mono", w: all(100, 800), it: all(100, 800) },
    "ibm plex mono": { pkg: "ibm-plex-mono", w: all(100, 700), it: all(100, 700) },
    "jost": { pkg: "jost", w: all(100, 900), it: all(100, 900) },
    "cormorant garamond": { pkg: "cormorant-garamond", w: all(300, 700), it: all(300, 700) },
    "playfair display": { pkg: "playfair-display", w: all(400, 900), it: all(400, 900) },
    "caveat": { pkg: "caveat", w: all(400, 700), it: [] },
    "anton": { pkg: "anton", w: [400], it: [] },
    "newsreader": { pkg: "newsreader", w: all(200, 800), it: all(200, 800) },
    "libre baskerville": { pkg: "libre-baskerville", w: all(400, 700), it: all(400, 700) },
    "bodoni moda": { pkg: "bodoni-moda", w: all(400, 900), it: all(400, 900) },
    "dm serif display": { pkg: "dm-serif-display", w: [400], it: [400] },
    "source sans 3": { pkg: "source-sans-3", w: all(200, 900), it: all(200, 900) },
    "manrope": { pkg: "manrope", w: all(200, 800), it: [] },
    "space grotesk": { pkg: "space-grotesk", w: all(300, 700), it: [] },
    "oswald": { pkg: "oswald", w: all(200, 700), it: [] }
  };
  const FRAUNCES_SRC = "https://cdn.jsdelivr.net/gh/undercasetype/Fraunces@ea507ccb0a2a8a3f8644385c4de7fa3fa1078ffe/fonts/ttf";
  const FRAUNCES_W = { 100: "Thin", 300: "Light", 400: "Regular", 600: "SemiBold", 700: "Bold", 900: "Black" };
  const nearest = (list, w) => list.reduce((b, x) => (Math.abs(x - w) < Math.abs(b - w) ? x : b), list[0]);

  /* "italic 700 41.33px "Playfair Display", Georgia, serif" → its parts.
     The canvas hands the font back in its own normalised spelling. */
  function parseFont(css) {
    const m = /^\s*((?:(?:italic|oblique|normal|small-caps|bold|bolder|lighter|\d{3}|[a-z-]+-?condensed|[a-z-]+-?expanded)\s+)*)([\d.]+)px\s+(.+)$/i.exec(String(css || ""));
    if (!m) return null;
    const pre = m[1].toLowerCase().split(/\s+/).filter(Boolean);
    let weight = 400, italic = false;
    for (const t of pre) {
      if (t === "italic" || t === "oblique") italic = true;
      else if (t === "bold") weight = 700;
      else if (/^\d{3}$/.test(t)) weight = +t;
    }
    const family = m[3].split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
    return { px: +m[2], weight, italic, family };
  }
  /* The weight the canvas really drew. A font asked for at a weight the page
     never loaded is drawn at the nearest one that was (CSS font matching):
     Inter "300" on this site is Inter 400, because only 400–700 are loaded.
     The PDF must use that weight, not the one asked for. Returns null when
     the family has no face in that slant at all (the canvas slanted it
     itself), so those words stay in the picture. */
  const drawnCache = new Map();
  function drawnWeight(family, w, italic) {
    const key = `${family}|${w}|${italic}`;
    if (drawnCache.has(key)) return drawnCache.get(key);
    const ranges = [];
    let any = false;
    try {
      document.fonts.forEach((ff) => {
        if (ff.family.replace(/^["']|["']$/g, "").toLowerCase() !== family) return;
        any = true;
        if (ff.status !== "loaded" || (ff.style === "italic" || ff.style === "oblique") !== italic) return;
        const [a, b] = String(ff.weight).split(/\s+/).map((x) => (x === "normal" ? 400 : x === "bold" ? 700 : +x));
        if (isFinite(a)) ranges.push([a, isFinite(b) ? b : a]);
      });
    } catch (e) { /* no FontFaceSet: trust the request */ }
    let out = w;
    if (any && !ranges.length) out = null;
    else if (ranges.length && !ranges.some(([a, b]) => w >= a && w <= b)) {
      const pts = ranges.flatMap(([a, b]) => [a, b]);
      const below = pts.filter((x) => x < w).sort((x, y) => y - x), above = pts.filter((x) => x > w).sort((x, y) => x - y);
      const mid = pts.filter((x) => x > w && x <= 500).sort((x, y) => x - y);
      out = w > 500 ? (above[0] ?? below[0]) : w >= 400 ? (mid[0] ?? below[0] ?? above[0]) : (below[0] ?? above[0]);
    }
    drawnCache.set(key, out);
    return out;
  }
  // The face a PDF will use for a canvas font, or null when there is none.
  // `pt` is the printed size, for a family cut per optical size.
  function faceOf(css, pt = 12) {
    const f = parseFont(css);
    if (!f) return null;
    const fam = FACES[f.family];
    if (!fam) return null;
    const italic = f.italic && fam.it.length > 0;
    // A family with no italic is drawn upright by the canvas too (synthetic
    // slant aside); leave such lines in the picture rather than lose the slant.
    if (f.italic && !italic) return null;
    const drawn = drawnWeight(f.family, f.weight, f.italic);
    if (drawn === null) return null;
    const weight = nearest(italic ? fam.it : fam.w, drawn);
    const opsz = fam.opsz ? nearest(fam.opsz, pt) : 0;
    return { key: `${fam.pkg}-${weight}-${italic ? "italic" : "normal"}${opsz ? `-o${opsz}` : ""}`, pkg: fam.pkg, weight, italic, opsz, px: f.px };
  }

  /* ---------- fonts: WOFF → TrueType → what the PDF needs ------------------ */
  async function inflate(bytes) {
    const ds = new DecompressionStream("deflate");
    const out = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(out);
  }
  async function deflate(bytes) {
    if (typeof CompressionStream !== "function") return null;
    const cs = new CompressionStream("deflate");
    const out = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
    return new Uint8Array(out);
  }
  // Tables a PDF viewer never reads: dropping them keeps the file small.
  const DROP = new Set(["GPOS", "GSUB", "GDEF", "STAT", "DSIG", "HVAR", "MVAR", "gasp", "FFTM"]);
  async function woffToSfnt(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (dv.getUint32(0) !== 0x774f4646) throw new Error("not a WOFF file");
    const flavor = dv.getUint32(4), n = dv.getUint16(12);
    const tables = [];
    for (let i = 0; i < n; i++) {
      const at = 44 + i * 20;
      const tag = String.fromCharCode(buf[at], buf[at + 1], buf[at + 2], buf[at + 3]);
      const off = dv.getUint32(at + 4), comp = dv.getUint32(at + 8), orig = dv.getUint32(at + 12), sum = dv.getUint32(at + 16);
      const raw = buf.subarray(off, off + comp);
      const data = comp < orig ? await inflate(raw) : raw.slice();
      tables.push({ tag, data, sum });
    }
    const map = {};
    tables.forEach((t) => { map[t.tag] = t.data; });
    const kept = tables.filter((t) => !DROP.has(t.tag)).sort((a, b) => (a.tag < b.tag ? -1 : 1));
    let size = 12 + 16 * kept.length;
    kept.forEach((t) => { size += (t.data.length + 3) & ~3; });
    const out = new Uint8Array(size), o = new DataView(out.buffer);
    o.setUint32(0, flavor); o.setUint16(4, kept.length);
    let es = 0; while ((1 << (es + 1)) <= kept.length) es++;
    o.setUint16(6, (1 << es) * 16); o.setUint16(8, es); o.setUint16(10, kept.length * 16 - (1 << es) * 16);
    let at = 12 + 16 * kept.length;
    kept.forEach((t, i) => {
      const d = 12 + i * 16;
      for (let k = 0; k < 4; k++) out[d + k] = t.tag.charCodeAt(k);
      o.setUint32(d + 4, t.sum); o.setUint32(d + 8, at); o.setUint32(d + 12, t.data.length);
      out.set(t.data, at); at += (t.data.length + 3) & ~3;
    });
    return { sfnt: out, tables: map, cff: !!map["CFF "] };
  }
  // A plain TrueType file: its tables as they are, minus what a viewer never reads.
  function sfntTables(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const n = dv.getUint16(4), map = {};
    for (let i = 0; i < n; i++) {
      const at = 12 + i * 16;
      const tag = String.fromCharCode(buf[at], buf[at + 1], buf[at + 2], buf[at + 3]);
      map[tag] = buf.subarray(dv.getUint32(at + 8), dv.getUint32(at + 8) + dv.getUint32(at + 12));
    }
    return map;
  }
  // Only what the PDF needs from the font: letters → glyphs, and their widths.
  function readFont(tables) {
    const v = (t) => new DataView(t.buffer, t.byteOffset, t.byteLength);
    const head = v(tables.head), hhea = v(tables.hhea), hmtx = v(tables.hmtx), maxp = v(tables.maxp);
    const upm = head.getUint16(18);
    const bbox = [head.getInt16(36), head.getInt16(38), head.getInt16(40), head.getInt16(42)];
    const numH = hhea.getUint16(34), numGlyphs = maxp.getUint16(4);
    const ascent = hhea.getInt16(4), descent = hhea.getInt16(6);
    let capHeight = Math.round(ascent * 0.7);
    if (tables["OS/2"]) { const os2 = v(tables["OS/2"]); if (os2.getUint16(0) >= 2 && os2.byteLength >= 90) capHeight = os2.getInt16(88); }
    let italicAngle = 0, fixed = false;
    if (tables.post) { const post = v(tables.post); italicAngle = post.getInt32(4) / 65536; fixed = post.getUint32(12) !== 0; }
    const adv = (g) => hmtx.getUint16(4 * Math.min(g, numH - 1));
    const cmap = new Map();
    const c = v(tables.cmap);
    const subs = [];
    for (let i = 0, n = c.getUint16(2); i < n; i++) subs.push({ pid: c.getUint16(4 + i * 8), eid: c.getUint16(6 + i * 8), off: c.getUint32(8 + i * 8) });
    const pick = subs.find((s) => s.pid === 3 && s.eid === 10) || subs.find((s) => s.pid === 0 && c.getUint16(s.off) === 12)
      || subs.find((s) => s.pid === 3 && s.eid === 1) || subs.find((s) => s.pid === 0);
    if (pick) {
      const o = pick.off, fmt = c.getUint16(o);
      if (fmt === 12) {
        for (let i = 0, n = c.getUint32(o + 12); i < n; i++) {
          const s = c.getUint32(o + 16 + i * 12), e = c.getUint32(o + 20 + i * 12), g = c.getUint32(o + 24 + i * 12);
          for (let ch = s; ch <= e; ch++) cmap.set(ch, g + ch - s);
        }
      } else if (fmt === 4) {
        const segX2 = c.getUint16(o + 6), ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
        for (let i = 0; i < segX2 / 2; i++) {
          const e = c.getUint16(ends + i * 2), s = c.getUint16(starts + i * 2), d = c.getInt16(deltas + i * 2), ro = c.getUint16(ranges + i * 2);
          for (let ch = s; ch <= e && ch !== 0xffff; ch++) {
            let g;
            if (!ro) g = (ch + d) & 0xffff;
            else { const at = ranges + i * 2 + ro + (ch - s) * 2; g = c.getUint16(at); if (g) g = (g + d) & 0xffff; }
            if (g && g < numGlyphs) cmap.set(ch, g);
          }
        }
      }
    }
    return { upm, bbox, ascent, descent, capHeight, italicAngle, fixed, adv, cmap };
  }

  const fontCache = new Map();   // "<pkg>-<w>-<style>-<subset>" → Promise<font|null>
  function fetchPart(face, subset) {
    const id = `${face.key}-${subset}`;
    if (!fontCache.has(id)) {
      // A Fraunces cut is one whole TrueType file with every letter it has.
      const ttf = face.opsz ? `${FRAUNCES_SRC}/Fraunces${face.opsz}pt-${face.italic ? (face.weight === 400 ? "" : FRAUNCES_W[face.weight]) + "Italic" : FRAUNCES_W[face.weight]}.ttf` : null;
      if (ttf && subset !== "latin") return Promise.resolve(null);
      const url = ttf || `${FS}/${face.pkg}@${FS_VER}/files/${face.pkg}-${subset}-${face.weight}-${face.italic ? "italic" : "normal"}.woff`;
      fontCache.set(id, (async () => {
        try {
          const res = await fetch(url, { mode: "cors", credentials: "omit" });
          if (!res.ok) return null;
          const bytes = new Uint8Array(await res.arrayBuffer());
          const { sfnt, tables, cff } = ttf ? (() => { const t = sfntTables(bytes); return { sfnt: bytes, tables: t, cff: !!t["CFF "] }; })() : await woffToSfnt(bytes);
          return { id, name: `${face.pkg}${face.opsz ? `${face.opsz}pt` : ""}-${face.weight}${face.italic ? "-italic" : ""}${subset === "latin" ? "" : `-${subset}`}`, sfnt, cff, italic: face.italic, ...readFont(tables) };
        } catch (e) { return null; }
      })());
    }
    return fontCache.get(id);
  }

  /* ---------- catching the words while a page is drawn ---------------------- */
  // A discovery pass finds which faces (and which letters) a book needs; the
  // print pass then has them all at hand, because a canvas call can't wait.
  function newNeeds() { return new Map(); }   // face key → { face, chars:Set }
  async function loadNeeds(needs) {
    const faces = new Map();   // face key → [latin, latinExt?]
    await Promise.all([...needs.values()].map(async ({ face, chars }) => {
      const latin = await fetchPart(face, "latin");
      const parts = latin ? [latin] : [];
      const rest = [...chars].filter((ch) => !(latin && latin.cmap.has(ch)));
      if (rest.length) { const ext = await fetchPart(face, "latin-ext"); if (ext) parts.push(ext); }
      if (parts.length) faces.set(face.key, parts);
    }));
    return faces;
  }

  const plainShadow = (ctx) => !ctx.shadowBlur && !ctx.shadowOffsetX && !ctx.shadowOffsetY;
  function colourOf(style) {
    if (typeof style !== "string") return null;
    let m = /^#([0-9a-f]{6})$/i.exec(style);
    if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(style);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    return null;
  }
  const boxOf = (M, x, y, w, h) => {
    const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([a, b]) => M.transformPoint(new DOMPoint(a, b)));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  };
  const meets = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  /* Wrap a page's canvas so its words are caught.
     mode "discover": draw as usual, note each face and letter used.
     mode "vector":   catch what the PDF can set (page.vtext), draw the rest. */
  function hook(page, env, dpi = 72) {
    const ctx = page.ctx;
    const orig = {
      fillText: ctx.fillText.bind(ctx), fillRect: ctx.fillRect.bind(ctx), drawImage: ctx.drawImage.bind(ctx),
      fill: ctx.fill.bind(ctx), stroke: ctx.stroke.bind(ctx), strokeRect: ctx.strokeRect.bind(ctx), putImageData: ctx.putImageData.bind(ctx)
    };
    page.vtext = [];
    const live = [];   // caught lines something could still be painted over
    const snapshot = () => ({
      m: ctx.getTransform(), font: ctx.font, fill: ctx.fillStyle, alpha: ctx.globalAlpha, align: ctx.textAlign,
      sp: "letterSpacing" in ctx ? ctx.letterSpacing : null
    });
    // A caught line goes back into the picture, drawn now, under whatever comes next.
    const toPicture = (run) => {
      run.dropped = true;
      const s = run.state;
      ctx.save();
      ctx.setTransform(s.m); ctx.font = s.font; ctx.fillStyle = s.fill; ctx.globalAlpha = s.alpha; ctx.textAlign = s.align; ctx.textBaseline = "alphabetic";
      if (s.sp !== null) ctx.letterSpacing = s.sp;
      ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.globalCompositeOperation = "source-over";
      orig.fillText(run.s, run.x, run.y);
      ctx.restore();
    };
    const underBox = (box) => {
      if (!live.length) return;
      for (let i = live.length - 1; i >= 0; i--) if (!live[i].dropped && meets(live[i].box, box)) { toPicture(live[i]); live.splice(i, 1); }
    };
    // For paths: does the shape touch any caught line? Sampled on a grid.
    const underPath = (test) => {
      if (!live.length) return;
      for (let i = live.length - 1; i >= 0; i--) {
        const r = live[i]; if (r.dropped) continue;
        const b = r.box; let hit = false;
        for (let gx = 0; gx <= 4 && !hit; gx++) for (let gy = 0; gy <= 2 && !hit; gy++) hit = test(b.x0 + (b.x1 - b.x0) * gx / 4, b.y0 + (b.y1 - b.y0) * gy / 2);
        if (hit) { toPicture(r); live.splice(i, 1); }
      }
    };
    ctx.fillRect = function (x, y, w, h) { underBox(boxOf(ctx.getTransform(), x, y, w, h)); return orig.fillRect(x, y, w, h); };
    ctx.strokeRect = function (x, y, w, h) { const lw = ctx.lineWidth / 2; underBox(boxOf(ctx.getTransform(), x - lw, y - lw, w + 2 * lw, h + 2 * lw)); return orig.strokeRect(x, y, w, h); };
    ctx.drawImage = function (img, ...a) {
      let x, y, w, h;
      if (a.length >= 8) [x, y, w, h] = a.slice(4, 8);
      else if (a.length >= 4) [x, y, w, h] = a;
      else { x = a[0]; y = a[1]; w = img.naturalWidth || img.width || 0; h = img.naturalHeight || img.height || 0; }
      underBox(boxOf(ctx.getTransform(), x, y, w, h));
      return orig.drawImage(img, ...a);
    };
    ctx.fill = function (...a) {
      const path = a[0] instanceof Path2D ? a[0] : null, rule = typeof a[a.length - 1] === "string" ? a[a.length - 1] : "nonzero";
      underPath((x, y) => (path ? ctx.isPointInPath(path, x, y, rule) : ctx.isPointInPath(x, y, rule)));
      return orig.fill(...a);
    };
    ctx.stroke = function (...a) {
      const path = a[0] instanceof Path2D ? a[0] : null;
      underPath((x, y) => (path ? ctx.isPointInStroke(path, x, y) : ctx.isPointInStroke(x, y)));
      return orig.stroke(...a);
    };
    ctx.putImageData = function (img, dx, dy, ...rest) {
      underBox({ x0: dx, y0: dy, x1: dx + img.width, y1: dy + img.height });
      return orig.putImageData(img, dx, dy, ...rest);
    };
    // The printed size of what is drawn now, in points, from the canvas's scale.
    const printedPt = () => {
      const f = parseFont(ctx.font); if (!f) return 12;
      const M = ctx.getTransform();
      return f.px * Math.sqrt(Math.abs(M.a * M.d - M.b * M.c)) * 72 / dpi;
    };
    ctx.fillText = function (text, x, y, maxW) {
      const s = String(text);
      const face = faceOf(ctx.font, printedPt());
      if (env.mode === "discover") {
        if (face && s.trim()) {
          const n = env.needs.get(face.key) || { face, chars: new Set() };
          for (const ch of s) n.chars.add(ch.codePointAt(0));
          env.needs.set(face.key, n);
        }
        return orig.fillText(text, x, y, maxW);
      }
      const col = colourOf(ctx.fillStyle);
      const parts = face && env.faces.get(face.key);
      const ok = parts && col && maxW === undefined && s.trim() && ctx.textBaseline === "alphabetic"
        && ctx.globalCompositeOperation === "source-over" && (!ctx.filter || ctx.filter === "none") && plainShadow(ctx)
        && (!document.fonts || document.fonts.check(ctx.font, s));
      if (!ok) { underBox(boxOf(ctx.getTransform(), x - 1, y - 1, 2, 2)); return orig.fillText(text, x, y, maxW); }
      // Every letter must be in one of the face's files.
      const chars = Array.from(s);
      const glyphs = [];
      for (const ch of chars) {
        const cp = ch.codePointAt(0);
        if (/\s/.test(ch)) { const f = parts.find((p) => p.cmap.has(cp)) || parts[0]; glyphs.push({ f, gid: f.cmap.get(cp) || f.cmap.get(32) || 0, ch }); continue; }
        const f = parts.find((p) => p.cmap.has(cp));
        if (!f) return orig.fillText(text, x, y, maxW);
        glyphs.push({ f, gid: f.cmap.get(cp), ch });
      }
      // Where each letter starts, measured by the canvas itself (kerning and
      // letter spacing included), so the PDF puts it exactly there.
      let acc = "";
      const starts = [0];
      for (let i = 0; i < chars.length - 1; i++) { acc += chars[i]; starts.push(ctx.measureText(acc).width); }
      const m = ctx.measureText(s);
      const total = m.width;
      const al = ctx.textAlign;
      const x0 = al === "center" ? x - total / 2 : (al === "right" || al === "end") ? x - total : x;
      glyphs.forEach((g, i) => { g.x = starts[i]; });
      const M = ctx.getTransform();
      const asc = m.actualBoundingBoxAscent || face.px * 0.8, desc = m.actualBoundingBoxDescent || face.px * 0.25;
      const run = {
        s, x, y, state: snapshot(), glyphs, px: face.px,
        // text space (y up, from the start of the line) → canvas pixels
        m: M.multiply(new DOMMatrix([1, 0, 0, -1, x0, y])),
        color: col, alpha: ctx.globalAlpha * col.a,
        box: boxOf(M, x0, y - asc, total, asc + desc)
      };
      page.vtext.push(run);
      live.push(run);
    };
    return page;
  }
  // The lines a page kept as type, ready to be carried to a sheet or the PDF.
  function takeRuns(page) {
    return (page.vtext || []).filter((r) => !r.dropped).map((r) => ({ glyphs: r.glyphs, px: r.px, m: r.m, color: r.color, alpha: r.alpha }));
  }
  // Move runs drawn on one canvas onto another (a booklet sheet), in pixels.
  const shiftRuns = (runs, dx, dy, k = 1) => runs.map((r) => ({ ...r, m: new DOMMatrix([k, 0, 0, k, dx, dy]).multiply(r.m) }));

  /* ---------- bleed ----------------------------------------------------------
     Pages are designed to the trim. For a print shop each page is grown by
     the bleed on every side by mirroring its outermost strip: a photograph or
     a colour that reaches the edge carries on past it, so a trim a hair out
     never leaves a white sliver, and anything short of the edge is untouched. */
  function withBleed(src, b) {
    const c = document.createElement("canvas");
    c.width = src.width + 2 * b; c.height = src.height + 2 * b;
    const ctx = c.getContext("2d");
    const W = src.width, H = src.height;
    ctx.drawImage(src, b, b);
    const flip = (sx, sy, sw, sh, dx, dy, fx, fy) => {
      ctx.save(); ctx.translate(dx + (fx < 0 ? sw : 0), dy + (fy < 0 ? sh : 0)); ctx.scale(fx, fy);
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh); ctx.restore();
    };
    flip(0, 0, b, H, 0, b, -1, 1);             // left
    flip(W - b, 0, b, H, W + b, b, -1, 1);     // right
    flip(0, 0, W, b, b, 0, 1, -1);             // top
    flip(0, H - b, W, b, b, H + b, 1, -1);     // bottom
    flip(0, 0, b, b, 0, 0, -1, -1);            // corners
    flip(W - b, 0, b, b, W + b, 0, -1, -1);
    flip(0, H - b, b, b, 0, H + b, -1, -1);
    flip(W - b, H - b, b, b, W + b, H + b, -1, -1);
    return c;
  }

  /* ---------- print colours (CMYK) ---------------------------------------------
     A press prints cyan, magenta, yellow and black, not the screen's red,
     green and blue. When the studio asks for CMYK, every page's picture is
     turned into those four inks and written as a four-channel JPEG (the
     browser can only write RGB JPEGs, so this file carries its own encoder),
     and the type is coloured in inks too.

     The conversion is the usual press recipe without a press profile:
     grey is carried by black ink rather than three colours (grey component
     replacement from a quarter tone), and no spot carries more than 300%
     ink in all, the ceiling most presses ask for. A neutral grey or black
     set in type becomes black ink alone, so small words print sharp with no
     colour fringes. A print shop with its own profile may still prefer the
     RGB file: the menu says so. */
  function toCmyk(r, g, b) {
    const R = r / 255, G = g / 255, B = b / 255;
    let c = 1 - R, m = 1 - G, y = 1 - B;
    const kmin = Math.min(c, m, y);
    const k = kmin <= 0.25 ? 0 : (kmin - 0.25) / 0.75;
    // Black takes over the grey the three colours shared; 30% of that colour
    // stays under the black (rich black), so a dark photograph keeps its depth.
    c -= 0.7 * k; m -= 0.7 * k; y -= 0.7 * k;
    // Grey balance: equal cyan, magenta and yellow print brown on a press, so
    // the grey the three share carries less magenta and yellow than cyan
    // (about C50 M39 Y39 for a mid grey, the usual press balance).
    const n = Math.min(c, m, y);
    m -= 0.22 * n; y -= 0.22 * n;
    const total = c + m + y + k;
    if (total > 3) { const f = (3 - k) / (c + m + y); c *= f; m *= f; y *= f; }
    return [c, m, y, k];
  }
  // A colour for type or a mark: neutral means black ink only.
  const inkOf = (col) => (Math.abs(col.r - col.g) < 3 && Math.abs(col.g - col.b) < 3 ? [0, 0, 0, 1 - col.r / 255] : toCmyk(col.r, col.g, col.b));

  // A baseline JPEG writer for 4-component (CMYK) pictures: one standard
  // quantisation table and the standard Huffman tables for every channel, no
  // subsampling. Values are stored as they are (no Adobe inversion marker).
  const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
  const QBASE = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
  const DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const AC_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
  const AC_VALS = [0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
    0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
    0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
    0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];
  function huffTable(bits, vals) {
    const codes = {}, sizes = {};
    let code = 0, k = 0;
    for (let len = 1; len <= 16; len++) { for (let i = 0; i < bits[len - 1]; i++) { codes[vals[k]] = code; sizes[vals[k]] = len; k++; code++; } code <<= 1; }
    return { codes, sizes };
  }
  const HDC = huffTable(DC_BITS, DC_VALS), HAC = huffTable(AC_BITS, AC_VALS);
  const AASF = [1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.541196100, 0.275899379];
  async function cmykJpeg(canvas, quality = 90) {
    const W = canvas.width, H = canvas.height;
    const scale = quality < 50 ? 5000 / quality : 200 - quality * 2;
    const qt = QBASE.map((v) => Math.min(255, Math.max(1, Math.floor((v * scale + 50) / 100))));
    const fdtbl = new Float64Array(64);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) fdtbl[r * 8 + c] = 1 / (qt[r * 8 + c] * AASF[r] * AASF[c] * 8);
    // Output buffer, grown as needed.
    let out = new Uint8Array(1 << 20), len = 0;
    const byte = (b) => { if (len >= out.length) { const n = new Uint8Array(out.length * 2); n.set(out); out = n; } out[len++] = b; };
    const word = (w) => { byte((w >> 8) & 255); byte(w & 255); };
    let bitBuf = 0, bitCnt = 0;
    const bits = (code, size) => {
      bitBuf = (bitBuf << size) | code; bitCnt += size;
      while (bitCnt >= 8) { const b = (bitBuf >> (bitCnt - 8)) & 255; byte(b); if (b === 255) byte(0); bitCnt -= 8; bitBuf &= (1 << bitCnt) - 1; }
    };
    // Headers.
    word(0xffd8);
    word(0xffdb); word(67); byte(0); for (let i = 0; i < 64; i++) byte(qt[ZZ[i]]);
    word(0xffc0); word(8 + 3 * 4); byte(8); word(H); word(W); byte(4); for (let c = 1; c <= 4; c++) { byte(c); byte(0x11); byte(0); }
    const dht = (cls, id, b, v) => { word(0xffc4); word(3 + 16 + v.length); byte((cls << 4) | id); b.forEach(byte); v.forEach(byte); };
    dht(0, 0, DC_BITS, DC_VALS); dht(1, 0, AC_BITS, AC_VALS);
    word(0xffda); word(6 + 2 * 4); byte(4); for (let c = 1; c <= 4; c++) { byte(c); byte(0); } byte(0); byte(63); byte(0);
    const ctx = canvas.getContext("2d");
    const blk = new Float64Array(64), q = new Int32Array(64);
    const dcPrev = [0, 0, 0, 0];
    const catOf = (v) => { let a = v < 0 ? -v : v, n = 0; while (a) { n++; a >>= 1; } return n; };
    const encodeBlock = (ci) => {
      // Rows, then columns (AAN).
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < 8; i++) {
          const s0 = pass ? i : i * 8, st = pass ? 8 : 1;
          const d0 = blk[s0], d1 = blk[s0 + st], d2 = blk[s0 + 2 * st], d3 = blk[s0 + 3 * st], d4 = blk[s0 + 4 * st], d5 = blk[s0 + 5 * st], d6 = blk[s0 + 6 * st], d7 = blk[s0 + 7 * st];
          const t0 = d0 + d7, t7 = d0 - d7, t1 = d1 + d6, t6 = d1 - d6, t2 = d2 + d5, t5 = d2 - d5, t3 = d3 + d4, t4 = d3 - d4;
          let t10 = t0 + t3; const t13 = t0 - t3; let t11 = t1 + t2; let t12 = t1 - t2;
          blk[s0] = t10 + t11; blk[s0 + 4 * st] = t10 - t11;
          const z1 = (t12 + t13) * 0.707106781;
          blk[s0 + 2 * st] = t13 + z1; blk[s0 + 6 * st] = t13 - z1;
          t10 = t4 + t5; t11 = t5 + t6; t12 = t6 + t7;
          const z5 = (t10 - t12) * 0.382683433, z2 = 0.5411961 * t10 + z5, z4 = 1.306562965 * t12 + z5, z3 = t11 * 0.707106781;
          const z11 = t7 + z3, z13 = t7 - z3;
          blk[s0 + 5 * st] = z13 + z2; blk[s0 + 3 * st] = z13 - z2; blk[s0 + st] = z11 + z4; blk[s0 + 7 * st] = z11 - z4;
        }
      }
      for (let i = 0; i < 64; i++) q[i] = Math.round(blk[ZZ[i]] * fdtbl[ZZ[i]]);
      const diff = q[0] - dcPrev[ci]; dcPrev[ci] = q[0];
      const dc = catOf(diff);
      bits(HDC.codes[dc], HDC.sizes[dc]);
      if (dc) bits(diff < 0 ? (diff - 1) & ((1 << dc) - 1) : diff, dc);
      let run = 0;
      for (let i = 1; i < 64; i++) {
        const v = q[i];
        if (!v) { run++; continue; }
        while (run > 15) { bits(HAC.codes[0xf0], HAC.sizes[0xf0]); run -= 16; }
        const n = catOf(v), sym = (run << 4) | n;
        bits(HAC.codes[sym], HAC.sizes[sym]);
        bits(v < 0 ? (v - 1) & ((1 << n) - 1) : v, n);
        run = 0;
      }
      if (run) bits(HAC.codes[0], HAC.sizes[0]);
    };
    // Eight rows of pixels at a time, turned into inks once each.
    const cmyk = new Uint8Array(W * 8 * 4);
    for (let by = 0; by < H; by += 8) {
      const rows = Math.min(8, H - by);
      const px = ctx.getImageData(0, by, W, rows).data;
      for (let i = 0, n = W * rows; i < n; i++) {
        const [c, m, y, k] = toCmyk(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
        cmyk[i * 4] = Math.round(c * 255); cmyk[i * 4 + 1] = Math.round(m * 255); cmyk[i * 4 + 2] = Math.round(y * 255); cmyk[i * 4 + 3] = Math.round(k * 255);
      }
      for (let bx = 0; bx < W; bx += 8) {
        for (let ci = 0; ci < 4; ci++) {
          for (let yy = 0; yy < 8; yy++) {
            const sy = Math.min(yy, rows - 1);
            for (let xx = 0; xx < 8; xx++) {
              const sx = Math.min(bx + xx, W - 1);
              blk[yy * 8 + xx] = cmyk[(sy * W + sx) * 4 + ci] - 128;
            }
          }
          encodeBlock(ci);
        }
      }
      if ((by & 127) === 0) await new Promise((r) => setTimeout(r, 0));   // let the page breathe
    }
    if (bitCnt > 0) bits((1 << (8 - bitCnt)) - 1, 8 - bitCnt);
    word(0xffd9);
    return out.slice(0, len);
  }

  /* ---------- the PDF ----------------------------------------------------------
     pages: [{ jpeg, width, height, pt:{w,h} (trim, points), links (mm from the
               trim's top left), runs (from takeRuns, in the image's pixels,
               measured from the trim's top left), bleedPx (pixels of bleed
               around the image, 0 if none), label (slug text) }]
     opts:  { title, author, marks: boolean } */
  const MM = 72 / 25.4;
  async function buildPdf(pages, opts = {}) {
    const enc = new TextEncoder();
    const chunks = [], offsets = [];
    let length = 0;
    const write = (part) => { const bytes = typeof part === "string" ? enc.encode(part) : part; chunks.push(bytes); length += bytes.length; };
    const num = (n) => { const r = Math.round(n * 1000) / 1000; return Object.is(r, -0) ? "0" : String(r); };
    const literal = (s) => `(${String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "?")})`;
    const unicodeText = (s) => `<FEFF${Array.from(String(s)).map((ch) => {
      const c = ch.codePointAt(0);
      if (c <= 0xffff) return c.toString(16).padStart(4, "0");
      const v = c - 0x10000;
      return (0xd800 + (v >> 10)).toString(16) + (0xdc00 + (v & 0x3ff)).toString(16);
    }).join("").toUpperCase()}>`;
    let nextId = 1;
    const alloc = () => nextId++;
    const begin = (id) => { offsets[id] = length; write(`${id} 0 obj\n`); };
    const end = () => write("\nendobj\n");
    const stream = async (id, dict, bytes, compress = true) => {
      const raw = typeof bytes === "string" ? enc.encode(bytes) : bytes;
      const z = compress ? await deflate(raw) : null;
      begin(id);
      write(`<< ${dict}${z ? " /Filter /FlateDecode" : ""} /Length ${(z || raw).length} >>\nstream\n`);
      write(z || raw); write("\nendstream"); end();
    };

    const catalogId = alloc(), pagesId = alloc(), infoId = alloc(), slugFontId = alloc();
    // Fonts used anywhere in the book: one PDF font per font file.
    const fonts = new Map();   // font.id → { font, res: "/Fn", id, used: Map(gid → char) }
    for (const p of pages) for (const r of p.runs || []) for (const g of r.glyphs) {
      let F = fonts.get(g.f.id);
      if (!F) { F = { font: g.f, res: `F${fonts.size + 1}`, id: alloc(), used: new Map() }; fonts.set(g.f.id, F); }
      if (!F.used.has(g.gid)) F.used.set(g.gid, g.ch);
    }
    const alphas = new Map();   // alpha → "/GSn"
    const gsOf = (a) => { const k = Math.round(a * 1000) / 1000; if (!alphas.has(k)) alphas.set(k, `GS${alphas.size + 1}`); return alphas.get(k); };
    const ids = pages.map((p) => ({ page: alloc(), content: alloc(), image: alloc(), annots: (p.links || []).map(() => alloc()) }));
    const gsId = alloc();

    write("%PDF-1.6\n");
    write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    const slug = opts.marks ? 10 * MM : 0, bleed = opts.marks ? 3 * MM : 0;
    const contents = [];
    pages.forEach((p, i) => {
      const TW = p.pt.w, TH = p.pt.h;
      const MW = TW + 2 * slug, MH = TH + 2 * slug;
      const bPx = p.bleedPx || 0;
      const trimPxW = p.width - 2 * bPx, k = TW / trimPxW;           // image pixels → points
      const ox = slug, oyTop = MH - slug;                             // the trim's top left, in PDF space
      let c = `q\n${num(p.width * k)} 0 0 ${num(p.height * k)} ${num(ox - bPx * k)} ${num(oyTop - (p.height - bPx) * k)} cm\n/Im0 Do\nQ\n`;
      // The words, as type.
      const toPdf = new DOMMatrix([k, 0, 0, -k, ox, oyTop]);
      for (const r of p.runs || []) {
        const T = toPdf.multiply(r.m);
        c += opts.cmyk ? `BT\n${inkOf(r.color).map(num).join(" ")} k\n` : `BT\n${num(r.color.r / 255)} ${num(r.color.g / 255)} ${num(r.color.b / 255)} rg\n`;
        if (r.alpha < 0.999) c += `/${gsOf(r.alpha)} gs\n`;
        c += `${num(T.a)} ${num(T.b)} ${num(T.c)} ${num(T.d)} ${num(T.e)} ${num(T.f)} Tm\n`;
        let cur = null, pen = 0, arr = "";
        const flush = () => { if (arr) { c += `[${arr}] TJ\n`; arr = ""; } };
        for (const g of r.glyphs) {
          const F = fonts.get(g.f.id);
          if (cur !== F) { flush(); c += `/${F.res} ${num(r.px)} Tf\n`; cur = F; }
          const d = g.x - pen;
          if (Math.abs(d) > 0.0005 * r.px) arr += ` ${num(-d * 1000 / r.px)} `;
          arr += `<${g.gid.toString(16).padStart(4, "0")}>`;
          pen = g.x + g.f.adv(g.gid) * r.px / g.f.upm;
        }
        flush();
        c += "ET\n";
      }
      // Crop marks: at each corner, two short lines pointing at the trim,
      // starting clear of the bleed; and a slug line saying what this is.
      if (opts.marks) {
        const a = bleed + 2 * MM, L = 5 * MM, x0 = slug, x1 = slug + TW, y0 = slug, y1 = slug + TH;
        c += opts.cmyk ? "q\n0 0 0 1 K 0.25 w\n" : "q\n0 0 0 RG 0.25 w\n";
        for (const [x, y, sx, sy] of [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]]) {
          c += `${num(x + sx * a)} ${num(y)} m ${num(x + sx * (a + L))} ${num(y)} l S\n`;
          c += `${num(x)} ${num(y + sy * a)} m ${num(x)} ${num(y + sy * (a + L))} l S\n`;
        }
        c += "Q\n";
        if (p.label) c += `BT ${opts.cmyk ? "0 0 0 1 k" : "0 0 0 rg"} /FS 6 Tf ${num(slug + 2 * MM + L)} ${num(slug / 2 - 2)} Td ${literal(p.label)} Tj ET\n`;
      }
      contents.push({ c, MW, MH, TW, TH, k, ox, oyTop, bPx });
    });

    begin(catalogId); write(`<< /Type /Catalog /Pages ${pagesId} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`); end();
    begin(pagesId); write(`<< /Type /Pages /Kids [${ids.map((x) => `${x.page} 0 R`).join(" ")}] /Count ${pages.length} >>`); end();
    const fontRes = [...fonts.values()].map((F) => `/${F.res} ${F.id} 0 R`).join(" ") + (opts.marks ? ` /FS ${slugFontId} 0 R` : "");
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i], id = ids[i], C = contents[i];
      const boxes = opts.marks
        ? ` /TrimBox [${num(slug)} ${num(slug)} ${num(slug + C.TW)} ${num(slug + C.TH)}] /BleedBox [${num(slug - bleed)} ${num(slug - bleed)} ${num(slug + C.TW + bleed)} ${num(slug + C.TH + bleed)}]`
        : "";
      begin(id.page);
      write(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(C.MW)} ${num(C.MH)}]${boxes} /Resources << /XObject << /Im0 ${id.image} 0 R >> /Font << ${fontRes} >> /ExtGState ${gsId} 0 R >> /Contents ${id.content} 0 R${id.annots.length ? ` /Annots [${id.annots.map((a) => `${a} 0 R`).join(" ")}]` : ""} >>`);
      end();
      await stream(id.content, "", C.c);
      begin(id.image);
      write(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /${p.cmyk ? "DeviceCMYK" : "DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      write(p.jpeg); write("\nendstream"); end();
      (p.links || []).forEach((l, li) => {
        const url = l.url.replace(/[^\x21-\x7e]/g, (ch) => encodeURIComponent(ch));
        const X = C.ox + l.x * MM, Y = C.oyTop - l.y * MM;
        begin(id.annots[li]);
        write(`<< /Type /Annot /Subtype /Link /Rect [${num(X)} ${num(Y - l.h * MM)} ${num(X + l.w * MM)} ${num(Y)}] /Border [0 0 0] /A << /S /URI /URI ${literal(url)} >> >>`);
        end();
      });
      p.jpeg = null;   // the bytes are written; let them go
    }
    begin(gsId); write(`<< ${[...alphas].map(([a, n]) => `/${n} << /Type /ExtGState /ca ${num(a)} >>`).join(" ")} >>`); end();
    begin(slugFontId); write("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"); end();

    // Each font: Type0 → CIDFont → descriptor → the font file, plus a map
    // back to the letters so the words can be copied and searched.
    const tagFor = (n) => { let s = ""; for (let i = 0; i < 6; i++) { s += String.fromCharCode(65 + (n % 26)); n = Math.floor(n / 26) + i * 7; } return s; };
    let fi = 0;
    for (const F of fonts.values()) {
      const f = F.font, sc = 1000 / f.upm, cidId = alloc(), descId = alloc(), fileId = alloc(), uniId = alloc();
      const name = `${tagFor(++fi * 7919)}+${f.name.replace(/[^A-Za-z0-9-]/g, "")}`;
      const gids = [...F.used.keys()].sort((a, b) => a - b);
      const widths = gids.map((g) => `${g} [${Math.round(f.adv(g) * sc)}]`).join(" ");
      begin(F.id); write(`<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${uniId} 0 R >>`); end();
      begin(cidId); write(`<< /Type /Font /Subtype /${f.cff ? "CIDFontType0" : "CIDFontType2"} /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descId} 0 R /DW 0 /W [${widths}]${f.cff ? "" : " /CIDToGIDMap /Identity"} >>`); end();
      const flags = 32 | (f.italic ? 64 : 0) | (f.fixed ? 1 : 0);
      begin(descId); write(`<< /Type /FontDescriptor /FontName /${name} /Flags ${flags} /FontBBox [${f.bbox.map((v) => Math.round(v * sc)).join(" ")}] /ItalicAngle ${num(f.italicAngle)} /Ascent ${Math.round(f.ascent * sc)} /Descent ${Math.round(f.descent * sc)} /CapHeight ${Math.round(f.capHeight * sc)} /StemV 80 /${f.cff ? "FontFile3" : "FontFile2"} ${fileId} 0 R >>`); end();
      await stream(fileId, f.cff ? "/Subtype /OpenType" : `/Length1 ${f.sfnt.length}`, f.sfnt);
      const hex4 = (n) => n.toString(16).padStart(4, "0");
      const utf16 = (s) => Array.from(s).map((ch) => { const c = ch.codePointAt(0); if (c <= 0xffff) return hex4(c); const v = c - 0x10000; return hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 0x3ff)); }).join("");
      let cmap = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n";
      for (let i = 0; i < gids.length; i += 100) {
        const part = gids.slice(i, i + 100);
        cmap += `${part.length} beginbfchar\n${part.map((g) => `<${hex4(g)}> <${utf16(F.used.get(g))}>`).join("\n")}\nendbfchar\n`;
      }
      cmap += "endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n";
      await stream(uniId, "", cmap);
    }
    begin(infoId);
    // A book made for someone else passes its own author, and a creator that
    // is the studio's credit or, when the contract forbids one, nothing.
    const creator = typeof opts.creator === "string" ? opts.creator : "nerdyphotographer.in portfolio book";
    const producer = typeof opts.producer === "string" ? opts.producer : "nerdyphotographer.in";
    write(`<< /Title ${unicodeText(opts.title || "Portfolio")} /Author ${unicodeText(opts.author || "nerdyphotographer.in")}${creator ? ` /Creator ${unicodeText(creator)}` : ""}${producer ? ` /Producer ${unicodeText(producer)}` : ""} /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z) >>`);
    end();

    const xrefAt = length;
    let xref = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
    for (let id = 1; id < nextId; id++) xref += `${String(offsets[id] || 0).padStart(10, "0")} 00000 n \n`;
    write(xref);
    write(`trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
    const out = new Uint8Array(length);
    let at = 0;
    chunks.forEach((ch) => { out.set(ch, at); at += ch.length; });
    return { bytes: out, fonts: fonts.size };
  }

  window.BookPrint = { hook, takeRuns, shiftRuns, withBleed, buildPdf, cmykJpeg, toCmyk, newNeeds, loadNeeds, faceOf, parseFont };
})();
