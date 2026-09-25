/* ============================================================
   book-builder.js — the studio portfolio book

   The photographer's own book of work to send to clients: photographs picked
   from any album, laid out on as many A4 pages as it needs, in one of eleven styles
   (elegant, modern, vogue, lookbook, noir, swiss, pinboard, dossier, poster,
   atelier, gazette) and one of nine colourways or the studio's own, saved as
   re-editable versions and exported as a PDF or as one PNG per page.

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
  /* A colourway from one colour: the studio picks its accent and the rest of
     the theme is worked out from it — a near-black ground and ink with a hint
     of the hue, a warm paper, a soft grey, a hairline, and what reads on each.
     The book stores just the hex as its colourway; an older release, not
     knowing it, draws Terracotta and keeps the hex. */
  const hexToHsvM = (hex) => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return { h: 20, s: 0.8, v: 0.8 };
    const r = parseInt(m[1].slice(0, 2), 16) / 255, g = parseInt(m[1].slice(2, 4), 16) / 255, b = parseInt(m[1].slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h = (h * 60 + 360) % 360; }
    return { h, s: max ? d / max : 0, v: max };
  };
  const hsvToHexM = (h, s, v) => {
    const f = (n) => { const k = (n + h / 60) % 6; const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, "0"); };
    return `#${f(5)}${f(3)}${f(1)}`;
  };
  const isOwnColourway = (key) => /^#[0-9a-f]{6}$/i.test(String(key || ""));
  const ownColourways = new Map();
  function colourwayFrom(hex) {
    const key = String(hex).toLowerCase();
    if (ownColourways.has(key)) return ownColourways.get(key);
    const { h, s, v } = hexToHsvM(key);
    const c01 = (x) => Math.min(1, Math.max(0, x));
    const at = (S, V) => hsvToHexM(h, c01(S), c01(V));
    // How light the accent reads: pale accents take dark words on them and a deeper twin as text.
    const m = /^#([0-9a-f]{6})$/i.exec(key);
    const lin = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    const lum = 0.2126 * lin(parseInt(m[1].slice(0, 2), 16)) + 0.7152 * lin(parseInt(m[1].slice(2, 4), 16)) + 0.0722 * lin(parseInt(m[1].slice(4, 6), 16));
    const pale = lum > 0.35;
    const cw = {
      key, name: "Your own", own: true,
      paper: at(Math.min(0.05, s * 0.1), 0.985), white: "#FFFFFF",
      ink: at(Math.min(0.3, s * 0.4), 0.1), soft: at(Math.min(0.2, s * 0.3), 0.42),
      accent: key, accentText: pale ? at(Math.max(s, 0.45), Math.min(v * 0.62, 0.5)) : key,
      deep: at(Math.min(0.55, s * 0.7), 0.12), onDeep: at(Math.min(0.05, s * 0.1), 0.97),
      onAccent: pale ? at(Math.min(0.3, s * 0.4), 0.1) : "#FFFFFF",
      accentOnDeep: pale ? key : at(Math.max(0.35, s * 0.8), Math.max(0.78, v)),
      rule: at(Math.min(0.12, s * 0.2), 0.87)
    };
    ownColourways.set(key, cw);
    return cw;
  }
  const colourway = (key) => (isOwnColourway(key) ? colourwayFrom(key) : (COLOURWAYS.find((c) => c.key === key) || COLOURWAYS[0]));
  const accentText = (P) => P.accentText || P.accent;
  const accentOnDeep = (P) => P.accentOnDeep || P.accent;

  const STYLES = [
    { key: "elegant", name: "Elegant", note: "A gallery catalogue. Photographs framed on paper." },
    { key: "modern", name: "Modern", note: "Your site's voice. Photographs full-bleed." },
    { key: "vogue", name: "Magazine", note: "A fashion issue. Photographs tiled edge to edge." },
    { key: "lookbook", name: "Lookbook", note: "White pages, wide margins, the photographs whole. Small labels." },
    { key: "noir", name: "Noir", note: "Black pages. The photographs glow; the words are white." },
    { key: "swiss", name: "Swiss", note: "A strict grid. Bold sans, a big page number, a rule across the top." },
    { key: "pinboard", name: "Pinboard", note: "Prints with white borders, a little askew and taped down. Headings by hand." },
    { key: "dossier", name: "Dossier", note: "A working file. Typewriter capitals, numbered figures, corner marks." },
    { key: "poster", name: "Poster", note: "Loud. Tall capitals, thick black outlines, blocks of your colour." },
    { key: "atelier", name: "Atelier", note: "Soft. Arched windows on a tinted page, italic serif, centred." },
    { key: "gazette", name: "Gazette", note: "A newspaper. A masthead, double rules, columns, captions in italic." }
  ];
  const SIZE = { portrait: { w: 210, h: 297 }, landscape: { w: 297, h: 210 } };
  // A book has as many pages as the studio gives it (Sep 2026: "no limit on the
  // number of pages"). Kept as a name so every old check reads the same.
  const MAX_PAGES = Infinity; // rendered pages, cover included
  const MAX_PER_PAGE = 6;

  const F = {
    serif: "Fraunces, Georgia, serif",
    heavy: "Archivo, 'Helvetica Neue', Arial, sans-serif",
    sans: "Inter, 'Helvetica Neue', Arial, sans-serif",
    geo: "Outfit, 'Helvetica Neue', Arial, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    plex: "'IBM Plex Mono', ui-monospace, monospace",
    // Faces the newer styles are set in; each loads the first time its style is drawn.
    jost: "Jost, Arial, sans-serif",
    cormorant: "'Cormorant Garamond', Georgia, serif",
    playfair: "'Playfair Display', Georgia, serif",
    hand: "Caveat, 'Bradley Hand', cursive",
    poster: "Anton, Impact, 'Arial Narrow', sans-serif",
    news: "Newsreader, Georgia, serif"
  };

  /* ---------- colours a style works out for itself --------------------------- */
  const rgbOf = (hex) => { const m = /^#([0-9a-f]{6})$/i.exec(String(hex || "")); const v = m ? m[1] : "000000"; return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)); };
  const mixHex = (a, b, t) => { const A = rgbOf(a), B = rgbOf(b); return `#${A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, "0")).join("")}`; };
  const lumOf = (hex) => { const [r, g, b] = rgbOf(hex).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrastOf = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // `fg`, moved toward white (on a dark ground) or black until it reads on `bg`.
  const readableOn = (fg, bg, min) => { const to = lumOf(bg) < 0.4 ? "#FFFFFF" : "#000000"; let c = fg; for (let t = 0.06; contrastOf(c, bg) < min && t <= 1; t += 0.06) c = mixHex(fg, to, t); return c; };
  /* A style may read the colourway its own way. Noir turns the page over: the
     ink becomes the ground and the paper the words, and the accent is lifted
     until it reads on black. Atelier tints the page with the accent; Gazette
     prints on newsprint, Pinboard pins to a board, Dossier files on manila. */
  const PALETTES = {
    noir(P) {
      const ground = mixHex(P.ink, "#000000", 0.45), light = mixHex(P.paper, "#FFFFFF", 0.2), accent = readableOn(P.accent, ground, 3.2);
      return { ...P, paper: ground, white: ground, ink: light, soft: mixHex(light, ground, 0.4), rule: mixHex(ground, light, 0.2), deep: mixHex(ground, light, 0.1), onDeep: light,
        accent, accentText: readableOn(P.accent, ground, 5.5), accentOnDeep: readableOn(P.accent, ground, 5.5), onAccent: contrastOf(accent, ground) >= contrastOf(accent, light) ? ground : light };
    },
    atelier(P) { const tint = mixHex("#FFFFFF", P.accent, 0.09); return { ...P, paper: tint, rule: mixHex(tint, P.accent, 0.24), soft: readableOn(P.soft, tint, 4.6), accentText: readableOn(accentText(P), tint, 4.6) }; },
    gazette(P) { const news = mixHex(P.paper, "#D9D4C7", 0.45); return { ...P, paper: news, rule: mixHex(news, P.ink, 0.22), soft: readableOn(P.soft, news, 4.6), accentText: readableOn(accentText(P), news, 4.6) }; },
    pinboard(P) { const board = mixHex(P.rule, P.soft, 0.1); return { ...P, paper: board, rule: mixHex(board, P.ink, 0.16), soft: readableOn(P.soft, board, 4.6), accentText: readableOn(accentText(P), board, 4.6) }; },
    dossier(P) { const manila = mixHex(P.paper, "#E6DBBE", 0.42); return { ...P, paper: manila, rule: mixHex(manila, P.ink, 0.2), soft: readableOn(P.soft, manila, 4.6), accentText: readableOn(accentText(P), manila, 4.6) }; }
  };

  /* ---------- what each style does on the pages they share -------------------
     The preset covers, the end pages, a look, the chapter and text pages and
     the writing pages are one drawing each. A style changes them through
     these answers, not through a branch of its own inside every one:
       boxes         which set of photo boxes a writing page uses: "e" inset on
                     the page, "m" bled but clear of the foot, "v" bled to the trim
       ground        the page's own colour, "paper" or "white"
       bar           an accent bar down the inside pages' left edge (mm), coverBar on covers
       whole/frame   photographs shown whole, and with a hairline round them
       bleed         a look's photographs run to the trim
       framedGround, framedX, framedRight, coverWhole, coverFrame, emptyWin   the Window cover
       wordsGround, wordsLabel   the Words-only cover and the back cover
       divider       the chapter page: ground, type, rule, whether it carries a foot
       about, itemTitle, contactValue   type on the About, What I shoot and Contact pages
       bands         the colour of a border round a full-page photograph
       noteFit, quoteSolid, quoteChip, letterX, tagAccent, numSp   habits of the writing pages
       captionInset  how much narrower than the page a caption is */
  const TRAITS = {
    elegant: {
      boxes: "e", ground: "paper", bar: 0, coverBar: 0, whole: true, frame: true, coverFrame: true,
      framedGround: "paper", framedX: 16, emptyWin: "accent", wordsGround: "paper", wordsLabel: "accent", serifBack: true,
      divider: { ground: "paper", caps: false, w: 300, f: F.serif, sp: 0, size: 30, rule: [22, 0.8], foot: true },
      about: { w: 300, size: 4.0, lead: 6.4 }, itemTitle: { w: 400, f: F.serif }, contactValue: { w: 400, f: F.serif },
      bands: "deep", noteFit: true, quoteSolid: false, letterX: 40, numSp: 0, captionInset: 52
    },
    modern: {
      boxes: "m", ground: "white", bar: 6, coverBar: 12,
      framedGround: "deep", framedX: 26, framedRight: 14, emptyWin: "faint", wordsGround: "deep", wordsLabel: "accent",
      divider: { ground: "accent", caps: true, w: 800, f: F.heavy, sp: 0, size: 26, rule: null, foot: true },
      about: { w: 400, size: 3.9, lead: 6.2 }, itemTitle: { w: 800, f: F.heavy }, contactValue: { w: 600, f: F.sans },
      bands: "deep", quoteSolid: true, quoteChip: true, letterX: 20, tagAccent: true, numSp: -0.2, captionInset: 28
    },
    vogue: {
      boxes: "v", ground: "white", bar: 0, coverBar: 0, bleed: true,
      framedGround: "white", framedX: 12, emptyWin: "accent", wordsGround: "accent", wordsLabel: "ink",
      divider: { ground: "accent", caps: true, w: 300, f: F.serif, sp: 1, size: 30, rule: null, foot: false },
      about: { w: 400, size: 3.9, lead: 6.3 }, itemTitle: { w: 400, f: F.serif }, contactValue: { w: 400, f: F.serif },
      bands: "white", quoteSolid: true, letterX: 40, numSp: 0, captionInset: 24
    },
    lookbook: {
      boxes: "e", ground: "white", bar: 0, coverBar: 0, whole: true, coverWhole: true,
      framedGround: "white", framedX: 22, emptyWin: "rule", wordsGround: "white", wordsLabel: "soft",
      divider: { ground: "white", caps: false, w: 300, f: F.sans, sp: 0, size: 22, rule: [16, 0.5], foot: true },
      about: { w: 300, size: 4.0, lead: 6.4 }, itemTitle: { w: 400, f: F.sans }, contactValue: { w: 400, f: F.sans },
      bands: "white", quoteSolid: true, letterX: 40, numSp: 0, captionInset: 24
    },
    /* The seven after: `palette` is how the style reads the colourway, `fonts`
       the faces it loads, `deco` how it dresses a photograph (see decoPhoto),
       `backName`/`backLines` the type on its back cover, `colRule` a hairline
       between columns of text. */
    noir: {
      palette: PALETTES.noir, fonts: ["jost"], boxes: "e", ground: "paper", bar: 0, coverBar: 0, whole: true,
      framedGround: "paper", framedX: 20, emptyWin: "rule", wordsGround: "paper", wordsLabel: "accent",
      backName: { w: 300, size: 6, f: F.jost, sp: 2, caps: true }, backLines: F.jost,
      divider: { ground: "paper", caps: true, w: 300, f: F.jost, sp: 2.4, size: 20, lead: 1.4, align: "center", rule: [30, 0.3], lineF: F.jost, foot: true },
      about: { w: 400, f: F.jost, size: 3.9, lead: 6.3 }, itemTitle: { w: 400, f: F.jost, size: 4.4, sp: 0.8, caps: true }, contactValue: { w: 300, f: F.jost, size: 5.4 },
      bands: "white", quoteSolid: true, letterX: 40, numSp: 0.4, captionInset: 32
    },
    swiss: {
      fonts: ["st-inter"], boxes: "e", ground: "white", bar: 0, coverBar: 0,
      framedGround: "white", framedX: 20, emptyWin: "accent", wordsGround: "white", wordsLabel: "ink",
      backName: { w: 700, size: 7, f: F.sans, sp: -0.2, caps: false }, backLines: F.sans,
      divider: { ground: "white", caps: false, w: 700, f: F.sans, sp: -0.7, size: 30, lead: 1.04, at: "low", rule: [9, 9], foot: true },
      about: { w: 400, size: 3.9, lead: 6.2 }, itemTitle: { w: 700, f: F.sans, sp: -0.1 }, contactValue: { w: 600, f: F.sans },
      // Its caption is wrapped in the narrow column, so one line's width never cuts it.
      bands: "white", quoteSolid: true, letterX: 20, tagAccent: true, numSp: -0.3, captionInset: -400
    },
    pinboard: {
      palette: PALETTES.pinboard, fonts: ["st-caveat"], boxes: "e", ground: "paper", bar: 0, coverBar: 0, deco: { kind: "print" },
      framedGround: "paper", framedX: 24, emptyWin: "rule", wordsGround: "paper", wordsLabel: "soft",
      backName: { w: 700, size: 11, f: F.hand, sp: 0, caps: false }, backLines: F.plex,
      divider: { ground: "paper", caps: false, w: 700, f: F.hand, sp: 0, size: 40, lead: 1.0, rule: null, foot: true },
      about: { w: 400, size: 3.9, lead: 6.2 }, itemTitle: { w: 700, f: F.hand, size: 7.2 }, contactValue: { w: 600, f: F.hand, size: 7 },
      bands: "paper", quoteSolid: false, letterX: 40, numSp: 0, captionInset: 44, labelGap: 13
    },
    dossier: {
      palette: PALETTES.dossier, fonts: [], boxes: "e", ground: "paper", bar: 0, coverBar: 0, deco: { kind: "figure" },
      framedGround: "paper", framedX: 22, emptyWin: "rule", wordsGround: "paper", wordsLabel: "accent",
      backName: { w: 500, size: 5, f: F.plex, sp: 0.6, caps: true }, backLines: F.plex,
      divider: { ground: "paper", caps: true, w: 500, f: F.plex, sp: 0.4, size: 17, lead: 1.25, rule: null, lineF: F.plex, foot: true },
      about: { w: 400, size: 3.8, lead: 6.1 }, itemTitle: { w: 500, f: F.plex, size: 4.2, caps: true }, contactValue: { w: 500, f: F.plex, size: 4.2 },
      bands: "paper", quoteSolid: false, letterX: 40, numSp: 0, captionInset: 48
    },
    poster: {
      fonts: ["st-anton", "st-inter"], boxes: "e", ground: "white", bar: 0, coverBar: 0, deco: { kind: "block" },
      framedGround: "white", framedX: 18, emptyWin: "accent", wordsGround: "accent", wordsLabel: "ink",
      backName: { w: 400, size: 9, f: F.poster, sp: 0.4, caps: true }, backLines: F.sans,
      divider: { ground: "accent", caps: true, w: 400, f: F.poster, sp: 0.3, size: 44, lead: 1.04, at: "low", rule: [18, 3], ruleInk: true, foot: true },
      about: { w: 400, size: 3.9, lead: 6.2 }, itemTitle: { w: 400, f: F.poster, size: 6, sp: 0.2, caps: true }, contactValue: { w: 400, f: F.poster, size: 6 },
      bands: "deep", quoteSolid: true, letterX: 20, tagAccent: true, numSp: 0.2, captionInset: 36, labelGap: 15
    },
    atelier: {
      palette: PALETTES.atelier, fonts: ["cormorant"], boxes: "e", ground: "paper", bar: 0, coverBar: 0, deco: { kind: "arch" },
      framedGround: "paper", framedX: 26, emptyWin: "rule", wordsGround: "paper", wordsLabel: "accent",
      backName: { w: 500, size: 9, f: F.cormorant, sp: 0.3, caps: false, it: true }, backLines: F.cormorant,
      divider: { ground: "paper", caps: false, w: 500, f: F.cormorant, it: true, sp: 0, size: 30, align: "center", rule: [22, 0.3], lineF: F.cormorant, lineIt: true, foot: true },
      about: { w: 500, f: F.cormorant, size: 4.4, lead: 6.4 }, itemTitle: { w: 600, f: F.cormorant, size: 6 }, contactValue: { w: 500, f: F.cormorant, size: 5.8, it: true },
      bands: "paper", quoteSolid: false, letterX: 40, numSp: 0, captionInset: 56, labelGap: 12.5
    },
    gazette: {
      palette: PALETTES.gazette, fonts: ["playfair", "st-newsreader"], boxes: "e", ground: "paper", bar: 0, coverBar: 0, deco: { kind: "keyline", c: "ink" }, whole: true,
      framedGround: "paper", framedX: 18, emptyWin: "rule", wordsGround: "paper", wordsLabel: "ink",
      backName: { w: 900, size: 8, f: F.playfair, sp: 0, caps: false }, backLines: F.news,
      divider: { ground: "paper", caps: false, w: 800, f: F.playfair, sp: 0, size: 30, lead: 1.1, align: "center", rule: null, lineF: F.news, lineIt: true, foot: true },
      about: { w: 400, f: F.news, size: 4.0, lead: 6.3 }, itemTitle: { w: 700, f: F.playfair }, contactValue: { w: 400, f: F.news, size: 5.2 },
      bands: "paper", quoteSolid: false, letterX: 40, numSp: 0, colRule: true, captionInset: 40
    }
  };
  const TR = (st) => TRAITS[st] || TRAITS.modern;
  // An older release of the site turns any of these back into Modern, so a book in one carries schema mark 5.
  const NEWER_STYLES = ["noir", "swiss", "pinboard", "dossier", "poster", "atelier", "gazette"];
  // The colours a book is drawn in: its colourway, as its style reads it. Most
  // styles take the colourway as it is; one that turns the page dark, or
  // tints it, says so once here and every page follows.
  const palettes = new Map();
  function paletteFor(book) {
    const base = colourway(book && book.colourway);
    const st = book && book.style, make = TRAITS[st] && TRAITS[st].palette;
    if (!make) return base;
    const key = `${st}|${base.key}`;
    if (!palettes.has(key)) { if (palettes.size > 300) palettes.clear(); palettes.set(key, make(base)); }
    return palettes.get(key);
  }
  // The colours a cover or a back cover draws in, from the name of its ground.
  const onGround = (P, g) => (g === "deep" ? { ground: P.deep, ink: P.onDeep, soft: P.onDeep, light: false }
    : g === "accent" ? { ground: P.accent, ink: P.onAccent, soft: P.onAccent, light: false }
    : { ground: g === "white" ? P.white : P.paper, ink: P.ink, soft: P.soft, light: true });

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
  /* The type also shrinks while any ONE line is wider than the space: a
     single long word ("NerdyPhotographer.in", "Photographers") never wraps,
     so counting lines alone let it run off the page while the check said
     "All good" (Sep 2026 audit, K2). A word still too wide at the smallest
     size is ended with "…" like a cut title, and the page reports it —
     under `label`, unless the caller reports cuts itself (null). */
  function fitLines(page, s, maxMm, maxLines, weight, startMm, minMm, family, spacingMm = 0, italic = false, label = "title") {
    let size = startMm, lines;
    const widest = (ls) => ls.reduce((m, l) => Math.max(m, measure(page, l)), 0);
    for (;;) {
      font(page, weight, size, family, spacingMm, italic);
      lines = wrap(page, s, maxMm);
      if ((lines.length <= maxLines && widest(lines) <= maxMm + 0.01) || size <= minMm) break;
      size = Math.max(minMm, size - 0.5);
    }
    let cut = lines.length > maxLines;
    font(page, weight, size, family, spacingMm, italic);
    if (cut) {
      // Cut: the last line always ends in "…" and still fits.
      lines = lines.slice(0, maxLines);
      let last = lines[maxLines - 1];
      while (last.length > 1 && measure(page, `${last}…`) > maxMm) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last.trimEnd()}…`;
    }
    lines = lines.map((l) => {
      if (measure(page, l) <= maxMm + 0.01) return l;
      cut = true;
      return ellipsize(page, l, maxMm);
    });
    if (cut && label && page) reportCut(page, "title", label);
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
  const FLIPS = ["h", "v", "hv"];
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
    // A photograph can be flipped, left to right or top to bottom: the part
    // that shows is the same, mirrored in its place.
    const flip = shot && FLIPS.includes(shot.flip) ? shot.flip : "";
    if (flip) {
      const ctx = page.ctx;
      ctx.save(); ctx.translate(dx + dw / 2, dy + dh / 2); ctx.scale(flip.includes("h") ? -1 : 1, flip.includes("v") ? -1 : 1);
      ctx.drawImage(img, (iw - sw) * fx, (ih - sh) * fy, sw, sh, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else page.ctx.drawImage(img, (iw - sw) * fx, (ih - sh) * fy, sw, sh, dx, dy, dw, dh);
    if (alpha < 1) page.ctx.restore();
    page.photos.push({ id: shot && shot.id, x, y, w, h });
    /* "A line round every photograph", in any style (the owner, Sep 25
       2026). Round the part of the photograph that shows, and never on one
       that runs to the edge of the paper, where a line would be a stray. */
    if (bookNow && bookNow.photoLines === "on") {
      const mm = page.u(1), PW = page.canvas.width / mm, PH = page.canvas.height / mm;
      const vx = Math.max(x, dx / mm), vy = Math.max(y, dy / mm);
      const vw = Math.min(x + w, (dx + dw) / mm) - vx, vh = Math.min(y + h, (dy + dh) / mm) - vy;
      if (vw > 1 && vh > 1 && vx > 0.5 && vy > 0.5 && vx + vw < PW - 0.5 && vy + vh < PH - 0.5) frame(page, vx, vy, vw, vh, paletteFor(bookNow).rule, 0.2);
    }
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
  /* ---------- photographs from outside the site --------------------------
     A book can hold a photograph the site has never seen — something from the
     desktop that is not in any album. Asked for by the studio, Sep 2026.

     Kept in a store of its own, NOT in an album. The publish flow uploads any
     photo carrying a dataUrl in any album it publishes, so a print-only
     photograph filed that way would be committed to a PUBLIC repository on
     the studio's next publish — the exact opposite of what "print only"
     promises, and impossible to take back once it is in git history. One the
     studio marks for the site is added to a hidden album instead, where that
     same well-tested path uploads it properly.

     IndexedDB rather than localStorage: these are photographs, and a handful
     would blow the 5MB a string store allows. */
  const OUT_DB = "wps-book-outside", OUT_STORE = "photos";
  const OUTSIDE_ALBUM = "outside-this-computer";
  const OUTSIDE_SHOOT_ID = "book-outside-photos";
  let outDbP = null;
  function outDb() {
    if (outDbP) return outDbP;
    outDbP = new Promise((res, rej) => {
      let settled = false;
      const done = (fn, v) => { if (!settled) { settled = true; fn(v); } };
      // Never hang the builder on a blocked or unresponsive store.
      const t = setTimeout(() => done(rej, new Error("indexedDB timeout")), 1500);
      let r;
      try { r = indexedDB.open(OUT_DB, 1); } catch (e) { clearTimeout(t); return done(rej, e); }
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(OUT_STORE)) d.createObjectStore(OUT_STORE, { keyPath: "id" }); };
      r.onsuccess = () => { clearTimeout(t); done(res, r.result); };
      r.onerror = () => { clearTimeout(t); done(rej, r.error); };
      r.onblocked = () => { clearTimeout(t); done(rej, new Error("indexedDB blocked")); };
    });
    return outDbP;
  }
  const outAll = async () => {
    try {
      const d = await outDb();
      return await new Promise((res, rej) => {
        const q = d.transaction(OUT_STORE, "readonly").objectStore(OUT_STORE).getAll();
        q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error);
      });
    } catch (e) { return []; }
  };
  const outPut = async (rec) => {
    const d = await outDb();
    return new Promise((res, rej) => {
      const tx = d.transaction(OUT_STORE, "readwrite");
      tx.objectStore(OUT_STORE).put(rec);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  };
  const outDel = async (id) => {
    try {
      const d = await outDb();
      await new Promise((res, rej) => {
        const tx = d.transaction(OUT_STORE, "readwrite");
        tx.objectStore(OUT_STORE).delete(id);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    } catch (e) {}
  };
  // Read once into memory, because library() is called on every redraw and a
  // page turn cannot wait on a database.
  let outsideCache = [];
  const outsideRefresh = async () => { outsideCache = await outAll(); return outsideCache; };
  const outsideList = () => outsideCache;

  /* Asked once for each batch, because the two answers have very different
     consequences and only one of them can be undone. The repository this site
     publishes from is PUBLIC: a photograph committed to it is downloadable by
     anyone at a stable address, and stays in the history even after it is
     removed. Print only is the default, and the wording says why. */
  function askWhereOutsideGoes(count) {
    return new Promise((resolve) => {
      const many = count > 1;
      const box = document.createElement("div");
      box.className = "sb-modal-back";
      box.innerHTML = `
        <div class="sb-modal" role="dialog" aria-modal="true" aria-labelledby="sbOutTitle">
          <h3 id="sbOutTitle">${many ? `These ${count} photographs` : "This photograph"} ${many ? "are" : "is"} not on your site</h3>
          <label class="sb-radio"><input type="radio" name="sbOutWhere" value="print" checked>
            <span><strong>Use for printing only</strong><small>Kept on this computer, nothing uploaded. Stored at the size the site uses (1,600 px on the long side): sharp on screen and from a home printer. For a print shop, add your full-size files under Download → “Full-size photos, for a print shop”. Opened on another machine, or published, ${many ? "they" : "it"} will be missing.</small></span></label>
          <label class="sb-radio"><input type="radio" name="sbOutWhere" value="site">
            <span><strong>Add to the site</strong><small>Uploaded with your next publish, like an album photo, so the book works on any device. Anyone can then download ${many ? "them" : "it"} from the site, and a copy stays in the site's history even if ${many ? "they are" : "it is"} removed later.</small></span></label>
          <div class="sb-modal-foot">
            <button type="button" class="sb-btn" data-out-cancel>Cancel</button>
            <button type="button" class="sb-btn dark" data-out-ok>Add ${many ? `${count} photographs` : "the photograph"}</button>
          </div>
        </div>`;
      const close = (v) => { box.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
      const onKey = (e) => { if (e.key === "Escape") close(null); };
      box.addEventListener("click", (e) => {
        if (e.target === box || e.target.closest("[data-out-cancel]")) return close(null);
        if (e.target.closest("[data-out-ok]")) {
          const picked = box.querySelector('input[name="sbOutWhere"]:checked');
          close(picked && picked.value === "site");
        }
      });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(box);
      const first = box.querySelector('input[name="sbOutWhere"]');
      if (first) first.focus();
    });
  }

  function askToDeleteBook(name) {
    return new Promise((resolve) => {
      const box = document.createElement("div");
      box.className = "sb-modal-back";
      box.innerHTML = `
        <div class="sb-modal" role="alertdialog" aria-modal="true" aria-labelledby="sbDelTitle" aria-describedby="sbDelText">
          <h3 id="sbDelTitle">Delete “${esc(name)}”?</h3>
          <p id="sbDelText" class="sb-hint">It is gone from this device straight away, and this can't be undone. If the book was published, your next publish removes it from your other devices too.</p>
          <div class="sb-modal-foot">
            <button type="button" class="sb-btn" data-del-keep>Keep the book</button>
            <button type="button" class="sb-btn dark" data-del-go>Delete it</button>
          </div>
        </div>`;
      const close = (v) => { box.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
      const onKey = (e) => { if (e.key === "Escape") close(false); };
      box.addEventListener("click", (e) => {
        if (e.target === box || e.target.closest("[data-del-keep]")) return close(false);
        if (e.target.closest("[data-del-go]")) return close(true);
      });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(box);
      box.querySelector("[data-del-keep]").focus();
    });
  }

  /* A photograph marked for the site is put into a hidden album, where the
     studio's own publish uploads it to photos/<album>/ with its 480 and 960
     variants and marks it uploaded only once the commit is on the branch.
     Reusing that path rather than writing a second one is the point: it
     already survives an expired token and a dropped connection, which an
     earlier hand-rolled upload did not (see the note in admin.js). */
  async function syncOutsideToAlbum() {
    const wanted = outsideList().filter((o) => o.forSite && !o.url);
    if (!wanted.length || typeof API.shoots !== "function") return;
    try {
      const shoots = API.shoots() || [];
      let album = shoots.find((s) => s && s.id === OUTSIDE_SHOOT_ID);
      if (!album) {
        album = {
          id: OUTSIDE_SHOOT_ID,
          title: "Book photographs",
          // Never on the site itself: these are a book's, and the studio chose
          // to upload them so the book travels, not to publish an album.
          isPublic: false,
          date: new Date().toISOString().slice(0, 10),
          photos: []
        };
        shoots.push(album);
      }
      album.photos = album.photos || [];
      for (const o of wanted) {
        if (album.photos.some((p) => p && p.id === o.id)) continue;
        album.photos.push({ id: o.id, dataUrl: o.dataUrl, usage: "both" });
      }
      if (typeof API.saveShoot === "function") await API.saveShoot(album);
    } catch (e) { /* the photograph is still in the store and still prints */ }
  }

  /* How much air sits between photographs on a page. Each style sets its own
     gutter, which is part of its voice; this scales that, so a client who
     wants the photographs tight together — or floating — can have it without
     the styles losing their proportions to each other. Asked for by the
     studio, Sep 2026: "no space, narrow space, medium space, large space".
     Medium is the style's own number, so a book made before this is
     untouched. */
  const GAP_SCALE = { none: 0, narrow: 0.45, medium: 1, wide: 1.9 };
  const GAP_LABEL = [["none", "None"], ["narrow", "Narrow"], ["medium", "Medium"], ["wide", "Wide"]];
  function gapFactor() {
    // A page can have its own (This page → Space between photographs, Sep 2026).
    const own = entryNow && entryNow.gap;
    const k = Object.prototype.hasOwnProperty.call(GAP_SCALE, own) ? own : bookNow && bookNow.spacing;
    return Object.prototype.hasOwnProperty.call(GAP_SCALE, k) ? GAP_SCALE[k] : 1;
  }
  // Wraps a style's own margins so its gutter answers to the book's setting.
  const spaced = (m) => (m && typeof m.gap === "number" ? { ...m, gap: Math.round(m.gap * gapFactor() * 10) / 10 } : m);

  /* A site photo's id is "<its own id>-<a number>", and before v533 the
     number was its place in the album, rebuilt on every save: removing one
     photo renumbered those after it and a book lost them — the cover
     included (Sep 2026 audit, A4). Ids no longer move, and a reference
     saved under an old number still finds its photo by the first part. */
  class PhotoIds extends Map {
    constructor() { super(); this.base = new Map(); }
    static baseOf(k) { const m = /^([a-z0-9]{8,})-\d+$/.exec(String(k)); return m ? m[1] : null; }
    set(k, v) { super.set(k, v); const b = PhotoIds.baseOf(k); if (b && !this.base.has(b)) this.base.set(b, v); return this; }
    get(k) { if (super.has(k)) return super.get(k); const b = PhotoIds.baseOf(k); return b ? this.base.get(b) : undefined; }
    has(k) { if (super.has(k)) return true; const b = PhotoIds.baseOf(k); return !!b && this.base.has(b); }
  }

  /* Why a photograph the book names cannot be drawn. One added "for printing
     only" is kept on the computer it was added on, and was being reported as
     "from a deleted album" everywhere else (Sep 2026 audit, K12). */
  const goneWhy = (id) => /^out_/.test(String(id || ""))
    ? "a photo kept only on the computer it was added on (print only)"
    : "a photo from a deleted album";

  function library() {
    const shoots = (API.shoots() || []).filter((s) => s && !s.isTestimonial && Array.isArray(s.photos));
    const byId = new PhotoIds();
    const albums = [];
    let diagrams = 0;
    for (const s of shoots) {
      const photos = s.photos.filter((p) => p && p.id && (p.url || p.dataUrl));
      const diagram = typeof s.lightingDiagram === "string" && s.lightingDiagram ? { id: DIAGRAM + s.id, url: s.lightingDiagram, diagram: true } : null;
      if (!photos.length && !diagram) continue;
      // An album unticked "Show this album on the site" is the book's alone: say so where it is picked.
      albums.push({ id: s.id, name: cleanName(s.title || s.talent) || "Untitled", count: photos.length + (diagram ? 1 : 0), hidden: s.isPublic === false });
      for (const p of photos) if (!byId.has(p.id)) byId.set(p.id, { photo: p, shoot: s });
      if (diagram) { byId.set(diagram.id, { photo: diagram, shoot: s }); diagrams++; }
    }
    /* Photographs from outside the site stand as an album of their own, so
       every place that picks a photograph can reach them without knowing they
       are different. They carry their bytes on the record, which is what
       previewSrc and the drawing already understand. */
    const outside = outsideList();
    if (outside.length) {
      albums.unshift({ id: OUTSIDE_ALBUM, name: "From this computer", count: outside.length, hidden: true, outside: true });
      for (const o of outside) {
        if (byId.has(o.id)) continue;
        byId.set(o.id, {
          photo: { id: o.id, url: o.dataUrl, dataUrl: o.dataUrl, outside: true, forSite: !!o.forSite, name: o.name || "" },
          // No title: the name is the picker's, and a page credit printed
          // "From this computer" under these (Sep 2026 audit, K4).
          shoot: { id: OUTSIDE_ALBUM, title: "", isPublic: false, outside: true }
        });
      }
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
    /* Two rows, split where the studio says: "2 + 1", "3 + 1", "4 + 1" and so
       on — the first number on top, the rest beneath. It used to understand
       only a row of THREE, on top or at the bottom, so four photographs could
       be 3 + 1 and never 2 + 2 by choice. "3top" and "3bottom" are what older
       books carry and still mean what they did.

       The two rows do not split the height evenly. A row of four is four
       photographs wide, so each is shorter; giving both rows half the height
       would stretch them. The share leans toward the row with fewer in it,
       pulled back toward even so neither row is squeezed to a strip. */
    const asSplit = (v) => {
      if (typeof v !== "string") return null;
      const m = v.match(/^(\d+)\+(\d+)$/);
      if (m) return [Number(m[1]), Number(m[2])];
      if (v === "3top" && n > 3) return [3, n - 3];
      if (v === "3bottom" && n > 3) return [n - 3, 3];
      return null;
    };
    // "Two across" is one row of two, which an "a + b" split cannot say: both
    // numbers describe rows, and a row of two IS the whole page.
    if (rows === "2across" && n === 2) return grid(2, 1);
    const split = asSplit(rows);
    if (split && split[0] >= 1 && split[1] >= 1 && split[0] + split[1] === n) {
      const [top, rest] = split;
      /* The height each row gets. A row holding a SINGLE photograph is the
         one meant to be seen, so it takes the larger share; otherwise the two
         rows split it evenly. This is exactly what the row-of-three did
         before it could be any split — 3 + 1 gave the single one 58%, 3 + 2
         went even — so a book already made is drawn as it always was. A
         proportional rule read better on paper and moved 32 existing pages,
         which is not a change to make behind the studio's back. */
      const frac = rest === 1 ? 0.42 : top === 1 ? 0.58 : 0.5;
      const th = (H - g) * frac, oh = H - g - th;
      const tw = (W - g * (top - 1)) / top, ow = (W - g * (rest - 1)) / rest;
      const row = (count, cw, y, h) => Array.from({ length: count }, (_, c) => ({ x: x0 + c * (cw + g), y, w: cw, h }));
      return [...row(top, tw, y0, th), ...row(rest, ow, y0 + th + g, oh)];
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
      // A photograph from the studio's own computer has no album to credit.
      if (s.outside || s.id === OUTSIDE_ALBUM || s.id === OUTSIDE_SHOOT_ID) continue;
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
  /* The little plate number on each photograph of a grid — "01", "02" — and
     the chip it sits on. Until v511 both were forced: every photographs page
     in the Modern style carried them, always on the accent. The studio asked
     for a way to turn them off and to choose the colour (Sep 24 2026). */
  /* Modern always printed them and the other styles never did, so that stays
     each style's default; the book can say otherwise in Design (true / false)
     and any page on This page (entry.nums), which wins (Sep 25 2026). */
  const plateDefault = (book) => (book && typeof book.photoNums === "boolean" ? book.photoNums : styleKey(book) === "modern");
  const plateNums = () => (entryNow && typeof entryNow.nums === "boolean" ? entryNow.nums : plateDefault(bookNow));
  /* The thin line round each photograph. The studio asked to be able to
     leave it off (Sep 25 2026). A line the studio drew itself — a block's
     own edge on an Anything page — is theirs, and stays. */
  // "on": drawPhoto draws the line itself for every style, so the style's
  // own line stands down rather than doubling it.
  const photoRule = (P) => (bookNow && (bookNow.photoLines === false || bookNow.photoLines === "on") ? null : P.rule);
  const PLATE_KEYS = ["paper", "white", "ink", "soft", "accent", "deep", "rule"];
  const plateColour = (P) => {
    const c = bookNow && bookNow.photoNumColour;
    if (P && PLATE_KEYS.includes(c)) return P[c];
    return /^#[0-9a-f]{6}$/i.test(String(c || "")) ? String(c) : P.accent;
  };
  /* What the number is set in, so it can be read off whatever the chip is.
     On the style's own accent the palette's answer is kept exactly — a book
     made before this must not shift by one pixel. */
  const plateInk = (chip, P) => {
    if (chip === P.accent) return P.onAccent;
    const [r, g, b] = rgbOf(chip);
    const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.4 ? P.ink : P.white;
  };
  // The chip itself, on the corner of the photograph as drawn (r) or, with
  // nothing drawn, of its cell (c).
  function plateChip(page, P, num, c, r) {
    const chip = plateColour(P);
    const px = r ? Math.max(c.x, r.x) : c.x, py = r ? Math.max(c.y, r.y) : c.y;
    rect(page, px, py, 7, 5, chip);
    font(page, 700, 2.2, F.mono, 0.2); text(page, String(num).padStart(2, "0"), px + 3.5, py + 3.5, plateInk(chip, P), "center");
  }
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
  const COVER_LINES = { elegant: ["foot", "place"], modern: ["label", "foot", "place"], vogue: ["mast", "tagline", "foot", "counts"], lookbook: ["foot", "place"],
    noir: ["label", "foot", "place"], swiss: ["label", "foot", "place"], pinboard: ["foot", "place"], dossier: ["label", "foot", "place"], poster: ["label", "foot", "place"], atelier: ["foot", "place"], gazette: ["label", "foot", "place"] };

  /* ---------- the cover's layout ------------------------------------------
     The style's own cover (nothing stored), one of three presets, or
     "custom": the cover is an Anything page of its own (book.coverPage),
     arranged with the same tools as any Anything page. */
  const COVER_LAYOUTS = [["classic", "Classic"], ["photo", "Full photo"], ["framed", "Window"], ["poster", "Words only"], ["custom", "From scratch"]];
  const COVER_LAYOUT_NOTE = {
    classic: "The style's own cover: the mark, the title, and your headshot when you add one.",
    photo: "One photograph fills the cover; the title sits on it.",
    framed: "The photograph in a window, the title under it.",
    poster: "No photograph: the title, set big.",
    custom: "Yours to arrange, like an Anything page: words, photographs, shapes and lines, dragged where you want."
  };
  const coverLayoutOf = (book) => (book && ["photo", "framed", "poster", "custom"].includes(book.coverLayout) ? book.coverLayout : "classic");
  // The cover as an Anything page. `type` is for the editor's own checks and is never stored.
  const coverEntry = (book) => {
    if (!book.coverPage || typeof book.coverPage !== "object") book.coverPage = { blocks: [] };
    if (!Array.isArray(book.coverPage.blocks)) book.coverPage.blocks = [];
    book.coverPage.type = "free";
    return book.coverPage;
  };
  const styleKey = (book) => (TRAITS[book && book.style] ? book.style : "modern");
  // Each style's title on a cover: the face, whether it is set in capitals, its spacing, and the subtitle's face.
  const COVER_TYPE = {
    elegant: { w: 300, f: F.serif, caps: false, sp: 0, subF: F.serif, subIt: true, small: F.plex },
    modern: { w: 800, f: F.heavy, caps: true, sp: -0.4, subF: F.sans, subIt: false, small: F.mono },
    vogue: { w: 300, f: F.serif, caps: true, sp: 0.8, subF: F.sans, subIt: false, small: F.geo },
    lookbook: { w: 300, f: F.sans, caps: false, sp: 0, subF: F.geo, subIt: false, small: F.geo },
    // `lead` is the title's line height; `subSize`, `subW`, `subCaps`, `subSp` set its subtitle.
    noir: { w: 300, f: F.jost, caps: true, sp: 2.2, lead: 1.32, subF: F.jost, subIt: false, small: F.jost, subSize: 3.4, subCaps: true, subSp: 1.4 },
    swiss: { w: 700, f: F.sans, caps: false, sp: -0.5, lead: 1.02, subF: F.sans, subIt: false, small: F.sans },
    pinboard: { w: 700, f: F.hand, caps: false, sp: 0, lead: 1.0, subF: F.hand, subIt: false, small: F.plex, subSize: 6.4 },
    dossier: { w: 600, f: F.plex, caps: true, sp: 0, lead: 1.16, subF: F.plex, subIt: false, small: F.plex, subSize: 3.4 },
    poster: { w: 400, f: F.poster, caps: true, sp: 0.2, lead: 1.04, subF: F.sans, subIt: false, small: F.sans, subW: 600, subSize: 5 },
    atelier: { w: 500, f: F.cormorant, caps: false, sp: 0.2, lead: 1.08, subF: F.cormorant, subIt: true, small: F.geo, subSize: 5.6 },
    gazette: { w: 800, f: F.playfair, caps: false, sp: 0, lead: 1.08, subF: F.news, subIt: true, small: F.sans, subSize: 5 }
  };
  const titleLead = (K) => K.lead || (K.caps ? 1.0 : 1.12);
  const titleOf = (book, K) => (K.caps ? (book.title || "Selected Work").toUpperCase() : (book.title || "Selected Work"));
  // The title, its subtitle and their on-page regions, drawn from a first baseline.
  function coverWords(page, book, K, cs, P, ink, soft, x, tw, firstY, t, lead, align = "left") {
    const TT = textFormat(cs, "title", { w: K.w, f: K.f }, P, ink, align);
    const ST = textFormat(cs, "subtitle", { w: K.subW || 400, f: K.subF, it: K.subIt }, P, soft, align);
    font(page, TT.spec.w, t.size, TT.spec.f, K.sp, !!TT.spec.it);
    if (skipNow !== "title") t.lines.forEach((l, i) => text(page, l, TT.at(x, tw), firstY + i * lead, TT.color, TT.align));
    noteText(page, "title", x, firstY - t.size * 0.86, tw, (t.lines.length - 1) * lead + t.size * 1.16, { ...typeOf(TT, t.size, lead, K.sp), caps: K.caps });
    const ss = (K.subSize || 4.2) * ST.scale, subY = firstY + (t.lines.length - 1) * lead + Math.max(5, t.size * 0.32) + ss * 1.2;
    font(page, ST.spec.w, ss, ST.spec.f, K.subSp || 0, !!ST.spec.it);
    if (book.subtitle && skipNow !== "subtitle") text(page, ellipsize(page, K.subCaps ? book.subtitle.toUpperCase() : book.subtitle, tw), ST.at(x, tw), subY, ST.color, ST.align);
    noteText(page, "subtitle", x, subY - ss * 0.86, tw, ss * 1.2, K.subCaps ? { ...typeOf(ST, ss, ss * 1.3, K.subSp || 0), caps: true } : typeOf(ST, ss, ss * 1.3));
    return subY;
  }
  // The title shrunk until it fits `maxLines` and leaves `room` below it before `floorY`.
  function coverTitleFit(page, book, K, cs, P, tw, maxLines, start, min, firstY, room, floorY) {
    const TT = textFormat(cs, "title", { w: K.w, f: K.f }, P, P.ink);
    let size = start * TT.scale, t;
    const least = min * TT.scale;
    for (;;) {
      t = fitLines(page, titleOf(book, K), tw, maxLines, TT.spec.w, size, least, TT.spec.f, K.sp, !!TT.spec.it);
      const lead = t.size * titleLead(K);
      if (firstY + (t.lines.length - 1) * lead + room <= floorY || t.size <= least) return { t, lead };
      size = t.size - 0.5;
    }
  }
  function coverFoot(page, K, CT, x, right, y, ink, soft) {
    font(page, 600, 2.8, K.small, 0.6);
    text(page, ellipsize(page, CT.foot, (right - x) * 0.55), x, y, ink);
    text(page, ellipsize(page, CT.place, (right - x) * 0.42), right, y, soft, "right");
  }
  const COVER_PRESETS = {
    // One photograph fills the page; the words sit on a shade at the foot.
    async photo(page, book, P, W, H, img) {
      const st = styleKey(book), K = COVER_TYPE[st], L = W > H, CT = coverText(book), cs = coverStyleOf(book);
      rect(page, 0, 0, W, H, P.deep);
      if (img) drawPhoto(page, img, book.cover, 0, 0, W, H);
      else { const sz = L ? 44 : 52; await drawMark(page, P.onDeep, P.accent, P.deep, (W - sz) / 2, H * 0.34 - sz / 2, sz); }
      const g = page.ctx.createLinearGradient(0, page.u(H * 0.42), 0, page.u(H));
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.66)");
      page.ctx.fillStyle = g; page.ctx.fillRect(0, page.u(H * 0.42), page.u(W), page.u(H * 0.58));
      const D = TR(st);
      if (D.coverBar) rect(page, 0, 0, D.coverBar, H, P.accent);
      const x = D.coverBar ? D.coverBar + 14 : 18, right = W - 16, tw = right - x, on = "#FFFFFF";
      if (img) await drawMark(page, on, P.accent, "rgba(0,0,0,0)", x, 14, 12);
      const footY = H - 14;
      const TT = textFormat(cs, "title", { w: K.w, f: K.f }, P, on);
      const t = fitLines(page, titleOf(book, K), tw, 3, TT.spec.w, (L ? 15 : 19) * TT.scale, (L ? 8 : 10) * TT.scale, TT.spec.f, K.sp, !!TT.spec.it);
      const lead = t.size * titleLead(K);
      const subH = (K.subSize || 4.2) * 1.3 + 4;
      const firstY = footY - 14 - subH - (t.lines.length - 1) * lead;
      coverWords(page, book, K, cs, P, on, "rgba(255,255,255,0.86)", x, tw, firstY, t, lead);
      hair(page, x, footY - 6, right, "rgba(255,255,255,0.5)");
      coverFoot(page, K, CT, x, right, footY, on, "rgba(255,255,255,0.86)");
    },
    // The photograph in a window at the top, the words under it.
    async framed(page, book, P, W, H, img) {
      const st = styleKey(book), K = COVER_TYPE[st], L = W > H, CT = coverText(book), cs = coverStyleOf(book);
      const D = TR(st), { ground, ink, soft, light } = onGround(P, D.framedGround);
      rect(page, 0, 0, W, H, ground);
      if (D.coverBar) rect(page, 0, 0, D.coverBar, H, P.accent);
      const x = D.framedX, right = W - (D.framedRight || x), tw = right - x;
      const win = { x, y: L ? 14 : 18, w: tw, h: L ? H * 0.56 : H * 0.6 };
      if (img) { if (D.deco) decoPhoto(page, P, D.deco, img, book.cover, win.x, win.y, win.w, win.h, "crop", 1); else if (D.coverWhole) fitPhoto(page, img, book.cover, win.x, win.y, win.w, win.h); else drawPhoto(page, img, book.cover, win.x, win.y, win.w, win.h); }
      else {
        const faint = D.emptyWin === "faint";
        rect(page, win.x, win.y, win.w, win.h, faint ? "rgba(255,255,255,0.08)" : D.emptyWin === "rule" ? P.rule : P.accent);
        const sz = L ? 30 : 36;
        await drawMark(page, faint ? P.onDeep : P.onAccent, faint ? P.accent : P.onAccent, "rgba(0,0,0,0)", win.x + (win.w - sz) / 2, win.y + (win.h - sz) / 2, sz);
      }
      if (D.coverFrame) frame(page, win.x, win.y, win.w, win.h, P.ink);
      const footY = H - 14, top = win.y + win.h + (L ? 10 : 14);
      const { t, lead } = coverTitleFit(page, book, K, cs, P, tw, 2, L ? 12 : 15, L ? 7 : 8.5, top + (L ? 12 : 15), 4.2 * 1.3 + 4 + 8, footY - 8);
      const firstY = top + t.size;
      const subY = coverWords(page, book, K, cs, P, ink, soft, x, tw, firstY, t, lead);
      rect(page, x, Math.min(subY + 6, footY - 9), 22, 0.8, P.accent);
      hair(page, x, footY - 6, right, light ? P.rule : ink);
      coverFoot(page, K, CT, x, right, footY, ink, soft);
    },
    // No photograph: the words, set big, and the mark at the foot.
    async poster(page, book, P, W, H) {
      const st = styleKey(book), K = COVER_TYPE[st], L = W > H, CT = coverText(book), cs = coverStyleOf(book);
      const D = TR(st), { ground, ink, soft, light } = onGround(P, D.wordsGround);
      rect(page, 0, 0, W, H, ground);
      if (D.coverBar) rect(page, 0, 0, D.coverBar, H, P.accent);
      if (D.coverFrame) frame(page, 14, 14, W - 28, H - 28, P.ink);
      const x = D.coverBar ? D.coverBar + 14 : 24, right = W - (D.coverBar ? 14 : 24), tw = right - x;
      const labelY = L ? 24 : 30;
      font(page, 600, 2.9, K.small, 0.7);
      text(page, ellipsize(page, CT.label, tw), x, labelY, D.wordsLabel === "accent" ? (D.wordsGround === "deep" ? accentOnDeep(P) : accentText(P)) : D.wordsLabel === "soft" ? P.soft : ink);
      hair(page, x, labelY + 5, right, ink);
      const footY = H - 14, markS = L ? 16 : 20, firstTop = labelY + (L ? 16 : 26);
      const { t, lead } = coverTitleFit(page, book, K, cs, P, tw, 4, L ? 24 : 34, L ? 10 : 12, firstTop + (L ? 24 : 34), 4.2 * 1.3 + 4 + 10 + markS + 10, footY - 8);
      const firstY = firstTop + t.size;
      const subY = coverWords(page, book, K, cs, P, ink, soft, x, tw, firstY, t, lead);
      rect(page, x, Math.min(subY + 7, footY - markS - 14), 26, 1, light ? P.accent : ink);
      await drawMark(page, ink, D.wordsGround === "accent" ? ink : P.accent, ground, x, footY - 4 - markS, markS);
      font(page, 600, 2.8, K.small, 0.6);
      text(page, ellipsize(page, CT.foot, tw * 0.6), right, footY - 6, ink, "right");
      text(page, ellipsize(page, CT.place, tw * 0.6), right, footY, soft, "right");
    }
  };

  /* ---------- the end page --------------------------------------------------
     "back": the book's back cover — the mark, the studio's name and three
     lines (typed, or its email, Instagram and site). "closing": a last
     photograph if there is one, a line to sign off with, a small line under. */
  const endLayoutOf = (entry) => (entry && entry.layout === "back" ? "back" : "closing");
  const lineIn = (v, fallback) => ((typeof v === "string" && v.trim()) ? v : fallback);
  function endLines(entry) {
    const c = cfg();
    const ig = String(c.instagram || "").replace(/\/+$/, "").split("/").pop();
    const own = Array.isArray(entry.lines) ? entry.lines.filter((x) => typeof x === "string" && x.trim()) : [];
    return { own, defaults: [c.email || "", ig ? `@${ig}` : "", "nerdyphotographer.in"].filter(Boolean) };
  }
  async function drawEnd(page, entry, book, P, W, H, imgs, n, S) {
    const st = styleKey(book), L = W > H, CT = coverText(book), K = COVER_TYPE[st], D = TR(st);
    if (endLayoutOf(entry) === "back") {
      const G0 = onGround(P, D.wordsGround), fb = G0.ground;
      const ground = isFillish(entry.bg) ? blockColor(entry.bg, P, fb) : fb;
      const ink = G0.ink, onColour = D.wordsGround === "accent";
      rect(page, 0, 0, W, H, ground);
      if (D.coverBar) rect(page, 0, 0, D.coverBar, H, P.accent);
      if (D.coverFrame) frame(page, 14, 14, W - 28, H - 28, P.ink);
      const sz = L ? 26 : 30, midY = H * 0.36;
      await drawMark(page, ink, onColour ? ink : P.accent, ground, (W - sz) / 2, midY - sz / 2, sz);
      const BN = D.backName || (D.serifBack ? { w: 300, size: 7, f: F.serif, sp: 0.4, caps: false } : { w: 600, size: 5.2, f: K.small, sp: 1.2, caps: true });
      font(page, BN.w, BN.size, BN.f, BN.sp, !!BN.it);
      text(page, ellipsize(page, BN.caps ? studio().toUpperCase() : studio(), W - 36), W / 2, midY + sz / 2 + 14, ink, "center");
      rect(page, W / 2 - 11, midY + sz / 2 + 20, 22, 0.8, onColour ? ink : P.accent);
      if (!entry.noLines) {
        const { own, defaults } = endLines(entry);
        const lines = (own.length ? own : defaults).slice(0, 3);
        font(page, 400, 3.6, D.backLines || (D.serifBack ? F.serif : F.sans));
        lines.forEach((l, i) => text(page, ellipsize(page, l, W - 40), W / 2, midY + sz / 2 + 34 + i * 6.5, ink, "center"));
      }
      font(page, 600, 2.6, K.small, 0.6);
      text(page, ellipsize(page, CT.place, W - 40), W / 2, H - 14, ink, "center");
      return;
    }
    const ground = pageBgOf(book, entry, P, D.ground === "paper" ? P.paper : P.white);
    rect(page, 0, 0, W, H, ground);
    if (D.bar) rect(page, 0, 0, D.bar, H, P.accent);
    const M = S.margins(L ? "landscape" : "portrait");
    const img = imgs[0], shot = (entry.photos || [])[0];
    const box = { x: M.side + D.bar, y: Math.max(M.top, D.headRoom || 0), w: W - 2 * M.side - D.bar, h: H * 0.54 };
    if (img) stylePhoto(page, P, D, img, shot, box.x, box.y, box.w, box.h, n);
    const top = img ? box.y + box.h + (L ? 12 : 18) : H * 0.4;
    const TT = textFormat(entry.style, "text", { w: K.w, f: K.f }, P, P.ink);
    const line = lineIn(entry.text, "Thank you for looking.");
    const t = fitLines(page, K.caps ? line.toUpperCase() : line, box.w, 3, TT.spec.w, (L ? 9 : 11) * TT.scale, (L ? 6 : 7) * TT.scale, TT.spec.f, K.sp, !!TT.spec.it, "closing line");
    const lead = t.size * (K.caps ? 1.0 : 1.15), firstY = top + t.size;
    font(page, TT.spec.w, t.size, TT.spec.f, K.sp, !!TT.spec.it);
    if (skipNow !== "text") t.lines.forEach((l, i) => text(page, l, TT.at(box.x, box.w), firstY + i * lead, TT.color, TT.align));
    noteText(page, "text", box.x, firstY - t.size * 0.86, box.w, (t.lines.length - 1) * lead + t.size * 1.16, { ...typeOf(TT, t.size, lead, K.sp), caps: K.caps });
    const noteY = firstY + (t.lines.length - 1) * lead + 12;
    rect(page, box.x, noteY - 7, 22, 0.8, P.accent);
    const NT = textFormat(entry.style, "note", { w: 400, f: F.sans }, P, P.soft);
    const ns = 3.4 * NT.scale;
    font(page, NT.spec.w, ns, NT.spec.f, 0, !!NT.spec.it);
    const small = lineIn(entry.note, `© ${year()} ${studio()}`);
    if (skipNow !== "note") text(page, ellipsize(page, small, box.w), NT.at(box.x, box.w), noteY + 2, NT.color, NT.align);
    noteText(page, "note", box.x, noteY + 2 - ns * 0.86, box.w, ns * 1.2, typeOf(NT, ns, ns * 1.3));
  }

  /* ---------- a look ---------------------------------------------------------
     One look of a collection: one or two photographs, its number (its place
     among the looks, unless written over), its name, and up to four lines
     under it — the garments, who made them, who styled it. */
  function lookNumber(book, entry) { let n = 0; for (const pg of book.pages) { if (pg && pg.type === "look") { n++; if (pg === entry) return n; } } return n || 1; }
  async function drawLook(page, entry, book, P, W, H, imgs, n, S, no) {
    const st = styleKey(book), L = W > H, T = WTYPE[st], D = TR(st), bleed = !!D.bleed;
    rect(page, 0, 0, W, H, pageBgOf(book, entry, P, D.ground === "paper" ? P.paper : P.white));
    if (D.bar) rect(page, 0, 0, D.bar, H, P.accent);
    const M = S.margins(L ? "landscape" : "portrait");
    const side = M.side + D.bar;
    const shots = (entry.photos || []).slice(0, 2);
    // The photographs take most of the page; the words sit under them, or
    // beside them on a landscape page. Vogue runs its photographs to the trim.
    let pa, wa;
    if (L) {
      const pw = (bleed ? W : W - side - M.side) * 0.64;
      pa = bleed ? { x: 0, y: 0, w: pw, h: H } : { x: side, y: M.top, w: pw, h: H - M.top - M.bottom };
      wa = { x: pa.x + pa.w + 12, y: M.top + 6, w: W - M.side - (pa.x + pa.w + 12) - (bleed ? 6 : 0) };
    } else {
      const ph = H * (bleed ? 0.7 : 0.66);
      pa = bleed ? { x: 0, y: 0, w: W, h: ph } : { x: side, y: M.top, w: W - side - M.side, h: ph - M.top };
      wa = { x: bleed ? 12 : side, y: pa.y + pa.h + 12, w: W - (bleed ? 12 : side) - M.side };
    }
    if (!shots.length) missing(page, P, pa.x, pa.y, pa.w, pa.h);
    else {
      const aspects = shots.map((sh, i) => (imgs[i] ? imgAspect(imgs[i]) : 0.7));
      const boxes = shots.length === 1 ? [pa] : cells(2, pa, M.gap, aspects, L, null);
      boxes.forEach((c, i) => {
        if (!imgs[i]) { missing(page, P, c.x, c.y, c.w, c.h); return; }
        stylePhoto(page, P, D, imgs[i], shots[i], c.x, c.y, c.w, c.h, n * 7 + i);
      });
    }
    // LOOK 01
    const SL = T.kicker;
    const label = lineIn(entry.label, `Look ${String(no).padStart(2, "0")}`);
    font(page, SL.w, SL.size, SL.f, SL.sp || 0);
    let y = wa.y + SL.size;
    text(page, ellipsize(page, SL.caps ? label.toUpperCase() : label, wa.w), wa.x, y, SL.color === "accentText" ? accentText(P) : (P[SL.color] || P.soft));
    // its name
    const NS = T.noteTitle;
    const NT = textFormat(entry.style, "title", { w: NS.w, f: NS.f }, P, P.ink);
    const name = lineIn(entry.title, "");
    y += 5;
    if (name) {
      const t = fitLines(page, NS.caps ? name.toUpperCase() : name, wa.w, 2, NT.spec.w, NS.start * NT.scale, NS.min * NT.scale, NT.spec.f, NS.sp || 0, !!NT.spec.it, "note title");
      const lead = t.size * NS.lead;
      font(page, NT.spec.w, t.size, NT.spec.f, NS.sp || 0, !!NT.spec.it);
      y += t.size;
      if (skipNow !== "title") t.lines.forEach((l, i) => text(page, l, NT.at(wa.x, wa.w), y + i * lead, NT.color, NT.align));
      noteText(page, "title", wa.x, y - t.size * 0.86, wa.w, (t.lines.length - 1) * lead + t.size * 1.16, { ...typeOf(NT, t.size, lead, NS.sp || 0), caps: !!NS.caps });
      y += (t.lines.length - 1) * lead;
    } else {
      const sz = NS.start * NT.scale; y += sz;
      noteText(page, "title", wa.x, y - sz * 0.86, wa.w, sz * 1.16, { ...typeOf(NT, sz, sz * NS.lead, NS.sp || 0), caps: !!NS.caps });
    }
    // the lines under it
    const lines = (Array.isArray(entry.lines) ? entry.lines : []).slice(0, 4).map((v) => (typeof v === "string" ? v : ""));
    if (lines.some((v) => v.trim())) {
      rect(page, wa.x, y + 4, T.rule.w, T.rule.h, P.accent);
      font(page, T.body.w, 3.3, T.body.f);
      let ly = y + 12;
      for (const v of lines) { if (!v.trim()) continue; text(page, ellipsize(page, v, wa.w), wa.x, ly, P.soft); ly += 5.2; }
    }
  }
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
    margins(o) { return spaced(o === "landscape" ? { top: 18, side: 20, bottom: 24, gap: 7 } : { top: 22, side: 20, bottom: 30, gap: 6 }); },
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
        if (photoRule(P)) frame(page, r.x, r.y, r.w, r.h, P.rule, 0.2);
      } else {
        const aspects = shots.map((s, i) => (imgs[i] ? imgAspect(imgs[i]) : 0.7));
        cells(shots.length, { ...box, h: box.h - 8 }, M.gap, aspects, W > H, entry.rows).forEach((c, i) => {
          if (imgs[i]) { const r = drawPhoto(page, imgs[i], shots[i], c.x, c.y, c.w, c.h); if (photoRule(P)) frame(page, r.x, r.y, r.w, r.h, P.rule, 0.2); if (plateNums()) plateChip(page, P, i + 1, c, r); }
          else { missing(page, P, c.x, c.y, c.w, c.h); if (plateNums()) plateChip(page, P, i + 1, c, null); }
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
    margins() { return spaced({ top: 14, side: 14, bottom: 18, gap: 4 }); },
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
        const r = imgs[i] ? drawPhoto(page, imgs[i], shots[i], c.x, c.y, c.w, c.h) : (missing(page, P, c.x, c.y, c.w, c.h), null);
        // Plate number in a chip, keyed to nothing but its order on the page.
        // Switched off, or given another colour, in Design. It sits on the
        // corner of the photograph as drawn: a photo shown whole is smaller
        // than its cell, and a chip on the cell's corner floated ~25 mm away
        // from it (Sep 2026 audit, K8).
        if (plateNums()) plateChip(page, P, i + 1, c, r);
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
    margins() { return spaced({ top: 10, side: 10, bottom: 14, gap: 2 }); },
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
          const r = imgs[i] ? drawPhoto(page, imgs[i], shots[i], c.x, c.y, c.w, c.h) : (missing(page, P, c.x, c.y, c.w, c.h), null);
          if (plateNums()) plateChip(page, P, i + 1, c, r);
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
  /* Lookbook: white pages, wide margins, the photographs whole and unframed,
     small tracked labels, a light sans; the accent only as a short rule. */
  const LOOKBOOK = {
    margins(o) { return spaced(o === "landscape" ? { top: 20, side: 24, bottom: 24, gap: 8 } : { top: 24, side: 22, bottom: 30, gap: 7 }); },
    async cover(page, book, P, W, H, img) {
      const L = W > H;
      rect(page, 0, 0, W, H, P.white);
      const m = L ? 20 : 22;
      const CT = coverText(book);
      font(page, 500, 2.4, F.geo, 1.0);
      text(page, ellipsize(page, CT.foot, W - 2 * m - 20), m, m + 2, P.ink);
      await drawMark(page, P.ink, P.accent, P.white, W - m - 10, m - 5, 10);
      // The photograph whole, in a window with white round it.
      const win = { x: m, y: m + 14, w: W - 2 * m, h: L ? H - m - 14 - 34 : H - (m + 14) - 58 };
      if (img) fitPhoto(page, img, book.cover, win.x, win.y, win.w, win.h);
      else { const sz = L ? 28 : 34; await drawMark(page, P.rule, P.accent, P.white, win.x + (win.w - sz) / 2, win.y + (win.h - sz) / 2, sz); }
      // The title small and light at the foot, the subtitle in tracked capitals, the place at the right.
      const cs = coverStyleOf(book);
      const TT = textFormat(cs, "title", { w: 300, f: F.sans }, P, P.ink);
      const ST = textFormat(cs, "subtitle", { w: 500, f: F.geo }, P, P.soft);
      const tw = (W - 2 * m) * 0.62;
      const t = fitLines(page, book.title || "Selected Work", tw, 2, TT.spec.w, (L ? 8 : 9.5) * TT.scale, (L ? 5.5 : 6.5) * TT.scale, TT.spec.f, 0, !!TT.spec.it);
      const lead = t.size * 1.15, baseY = H - (L ? 18 : 26);
      const firstY = baseY - (t.lines.length - 1) * lead;
      font(page, TT.spec.w, t.size, TT.spec.f, 0, !!TT.spec.it);
      if (skipNow !== "title") t.lines.forEach((l, i) => text(page, l, TT.at(m, tw), firstY + i * lead, TT.color, TT.align));
      noteText(page, "title", m, firstY - t.size * 0.86, tw, (t.lines.length - 1) * lead + t.size * 1.16, typeOf(TT, t.size, lead));
      const ss = 2.6 * ST.scale, subY = baseY + 7;
      font(page, ST.spec.w, ss, ST.spec.f, 0.9, !!ST.spec.it);
      if (book.subtitle && skipNow !== "subtitle") text(page, ellipsize(page, book.subtitle.toUpperCase(), tw), ST.at(m, tw), subY, ST.color, ST.align);
      noteText(page, "subtitle", m, subY - ss * 0.86, tw, ss * 1.2, { ...typeOf(ST, ss, ss * 1.3, 0.9), caps: true });
      font(page, 500, 2.4, F.geo, 0.9);
      text(page, ellipsize(page, CT.place, (W - 2 * m) * 0.34), W - m, subY, P.soft, "right");
    },
    async photos(page, entry, P, W, H, imgs, shoots, n) {
      const M = this.margins(W > H ? "landscape" : "portrait");
      rect(page, 0, 0, W, H, pageBg(P, P.white));
      const box = { x: M.side, y: M.top, w: W - 2 * M.side, h: H - M.top - M.bottom };
      const shots = entry.photos;
      if (shots.length === 1 && entry.border) return bandedPhotoPage(page, entry, P, W, H, imgs, shots, shoots, n, captionFit(entry, W - 28, CAPTION_TYPE.lookbook), "lookbook", M.gap);
      const cap = captionFit(entry, box.w, CAPTION_TYPE.lookbook);
      const area = { ...box, h: box.h - (cap ? 8 : 0) };
      if (shots.length === 1) { if (imgs[0]) fitPhoto(page, imgs[0], shots[0], area.x, area.y, area.w, area.h); else missing(page, P, area.x, area.y, area.w, area.h); }
      else {
        const aspects = shots.map((sh, i) => (imgs[i] ? imgAspect(imgs[i]) : 0.7));
        cells(shots.length, area, M.gap, aspects, W > H, entry.rows).forEach((c, i) => { const r = imgs[i] ? drawPhoto(page, imgs[i], shots[i], c.x, c.y, c.w, c.h) : (missing(page, P, c.x, c.y, c.w, c.h), null); if (plateNums()) plateChip(page, P, i + 1, c, r); });
      }
      if (cap) drawCaption(page, cap, box.x, H - M.bottom - 1, CAPTION_TYPE.lookbook, P.soft, P);
      this.foot(page, P, W, H, n, pageCredit(entry, shoots));
    },
    // The number small in the middle of the foot; a credit at the outer edge.
    foot(page, P, W, H, n, credit) {
      font(page, 500, 2.2, F.geo, 0.9);
      if (showNums()) text(page, String(n).padStart(2, "0"), W / 2, H - 11, P.ink, "center");
      if (credit) text(page, ellipsize(page, credit.toUpperCase(), W / 2 - 28), n % 2 ? W - 20 : 20, H - 11, P.soft, n % 2 ? "right" : "left");
    },
    heading(page, s, x, y, P, maxW) { font(page, 300, 9, F.sans); const lines = wrap(page, s, maxW); lines.forEach((l, i) => text(page, l, x, y + i * 11, P.ink)); rect(page, x, y + (lines.length - 1) * 11 + 6, 16, 0.5, P.accent); return y + (lines.length - 1) * 11 + 15; },
    body(page, s, x, y, P, maxW, maxY = Infinity) { font(page, 300, 3.7, F.sans); return bodyLines(page, s, x, y, P, maxW, maxY, 6.0); },
    label(page, s, x, y, P) { font(page, 500, 2.3, F.geo, 0.9); text(page, s.toUpperCase(), x, y, P.soft); },
    ground(page, P, W, H) { rect(page, 0, 0, W, H, pageBg(P, P.white)); }
  };

  /* ---------- seven more styles -------------------------------------------------
     Noir, Swiss, Pinboard, Dossier, Poster, Atelier and Gazette. Each is its own
     cover, photo page, running foot (or head) and text-page type, as the first
     four are; what they do on the shared pages is in TRAITS, and how each
     dresses a photograph is in decoPhoto. */
  // The page being drawn and the library it draws from, for a figure's label.
  let numNow = 1, libNow = null;
  const albumOf = (shot) => { const hit = shot && (libNow || (libNow = library())).byId.get(shot.id); return hit && !hit.shoot.outside && hit.shoot.id !== OUTSIDE_SHOOT_ID ? cleanName(hit.shoot.title || hit.shoot.talent) : ""; };
  // A soft shade over part of a page, top to bottom.
  function shade(page, x, y, w, h, from, to) {
    const g = page.ctx.createLinearGradient(0, page.u(y), 0, page.u(y + h));
    g.addColorStop(0, from); g.addColorStop(1, to);
    page.ctx.fillStyle = g; page.ctx.fillRect(page.u(x), page.u(y), page.u(w), page.u(h));
  }
  // Something drawn turned about a point, by a few degrees.
  function turned(page, cx, cy, deg, draw) {
    const ctx = page.ctx;
    ctx.save(); ctx.translate(page.u(cx), page.u(cy)); ctx.rotate(deg * Math.PI / 180); ctx.translate(-page.u(cx), -page.u(cy));
    const out = draw(); ctx.restore(); return out;
  }
  // An arched window: straight sides, a half-round top. A box wider than it is
  // tall gets rounded corners instead.
  function archPath(page, x, y, w, h, always = false) {
    const ctx = page.ctx, X = page.u(x), Y = page.u(y), Wd = page.u(w), Hd = page.u(h);
    ctx.beginPath();
    if (always && h < w * 0.9) { const ry = Hd * 0.6; ctx.moveTo(X, Y + Hd); ctx.lineTo(X, Y + ry); ctx.ellipse(X + Wd / 2, Y + ry, Wd / 2, ry, 0, Math.PI, 0); ctx.lineTo(X + Wd, Y + Hd); ctx.closePath(); return; }
    if (h < w * 0.9) { const r = Math.min(Wd, Hd) * 0.09; ctx.moveTo(X + r, Y); ctx.arcTo(X + Wd, Y, X + Wd, Y + Hd, r); ctx.arcTo(X + Wd, Y + Hd, X, Y + Hd, r); ctx.arcTo(X, Y + Hd, X, Y, r); ctx.arcTo(X, Y, X + Wd, Y, r); ctx.closePath(); return; }
    const r = Wd / 2;
    ctx.moveTo(X, Y + Hd); ctx.lineTo(X, Y + r); ctx.arc(X + r, Y + r, r, Math.PI, 0); ctx.lineTo(X + Wd, Y + Hd); ctx.closePath();
  }
  const TAPE = "rgba(238, 226, 190, 0.8)";
  function tape(page, cx, cy, deg, w = 17, h = 5.6) {
    turned(page, cx, cy, deg, () => { rect(page, cx - w / 2, cy - h / 2, w, h, TAPE); rect(page, cx - w / 2, cy - h / 2, 0.5, h, "rgba(255,255,255,0.35)"); rect(page, cx + w / 2 - 0.5, cy - h / 2, 0.5, h, "rgba(0,0,0,0.05)"); });
  }
  const ANGLES = [-1.7, 1.1, -0.8, 1.6, -1.2, 0.7];
  // A white-bordered print lying on the page, a little askew, with a shadow
  // under it and a strip of tape at its head. `inner` draws what it shows.
  function printOn(page, x, y, w, h, seed, mat, inner) {
    const ctx = page.ctx, deg = ANGLES[Math.abs(seed) % ANGLES.length];
    return turned(page, x + w / 2, y + h / 2, deg, () => {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = page.u(2.6); ctx.shadowOffsetY = page.u(0.9);
      rect(page, x, y, w, h, "#FDFCF8");
      ctx.restore();
      const out = inner(x + mat, y + mat, w - 2 * mat, h - 2 * mat);
      tape(page, x + w / 2, y + 0.4, (seed % 2 ? 1 : -1) * 2.5);
      return out;
    });
  }
  // The box a photograph shown whole takes inside (x, y, w, h), by its shape.
  function wholeBox(img, x, y, w, h, align = "center") {
    const a = imgAspect(img);
    let dw = w, dh = w / a;
    if (dh > h) { dh = h; dw = h * a; }
    return { x: align === "right" ? x + w - dw : align === "left" ? x : x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
  }
  /* How a style dresses a photograph, wherever one is drawn:
       keyline  a hairline round it (Gazette)
       print    a white-bordered print, a little askew, taped down (Pinboard)
       figure   a hairline, corner ticks, and a figure number and its album under it (Dossier)
       block    a thick outline, and a block of colour behind it, offset (Poster)
       arch     an arched window with a fine line round it (Atelier)
     `mode` is "crop" to fill the box, or "fit" (also "fit-left", "fit-right")
     to show the photograph whole inside it. */
  function decoPhoto(page, P, deco, img, shot, x, y, w, h, mode = "crop", seed = 0, index = 0) {
    const kind = deco && deco.kind, crop = mode === "crop";
    const align = mode === "fit-right" ? "right" : mode === "fit-left" ? "left" : "center";
    // A placement the studio chose for the photo wins over showing it whole.
    const own = shot && FIT_MODES.includes(shot.fit);
    const boxIn = (bx, by, bw, bh) => (crop || own ? { x: bx, y: by, w: bw, h: bh } : wholeBox(img, bx, by, bw, bh, align));
    if (kind === "print") {
      const mat = Math.min(3.2, Math.max(1.8, Math.min(w, h) * 0.035));
      const b = boxIn(x + mat, y + mat, w - 2 * mat, h - 2 * mat);
      return printOn(page, b.x - mat, b.y - mat, b.w + 2 * mat, b.h + 2 * mat, seed, mat, (ix, iy, iw, ih) => drawPhoto(page, img, shot, ix, iy, iw, ih));
    }
    if (kind === "figure") {
      const b = boxIn(x, y, w, h - 5.2);
      const r = drawPhoto(page, img, shot, b.x, b.y, b.w, b.h);
      frame(page, b.x, b.y, b.w, b.h, P.ink, 0.25);
      for (const [cx, cy, sx, sy] of [[b.x, b.y, -1, -1], [b.x + b.w, b.y, 1, -1], [b.x, b.y + b.h, -1, 1], [b.x + b.w, b.y + b.h, 1, 1]]) {
        rect(page, sx < 0 ? cx - 2.6 : cx + 0.8, cy - 0.1, 1.8, 0.2, P.soft); rect(page, cx - 0.1, sy < 0 ? cy - 2.6 : cy + 0.8, 0.2, 1.8, P.soft);
      }
      font(page, 500, 2.2, F.plex, 0.35);
      const label = `FIG. ${numNow}.${index + 1}`;
      text(page, label, b.x, b.y + b.h + 4, P.ink);
      const album = albumOf(shot).toUpperCase(), used = measure(page, label) + 5;
      if (album && b.w - used > 14) text(page, ellipsize(page, album, b.w - used), b.x + b.w, b.y + b.h + 4, P.soft, "right");
      return r;
    }
    if (kind === "block") {
      const off = Math.min(3.2, Math.min(w, h) * 0.05), b = boxIn(x, y, w - off, h - off);
      rect(page, b.x + off, b.y + off, b.w, b.h, deco.c === "ink" ? P.ink : P.accent);
      const r = drawPhoto(page, img, shot, b.x, b.y, b.w, b.h);
      frame(page, b.x, b.y, b.w, b.h, P.ink, 1.1);
      return r;
    }
    if (kind === "arch") {
      const pad = 2, b = boxIn(x + pad, y + pad, w - 2 * pad, h - 2 * pad), ctx = page.ctx;
      ctx.save(); archPath(page, b.x, b.y, b.w, b.h); ctx.clip();
      const r = drawPhoto(page, img, shot, b.x, b.y, b.w, b.h);
      ctx.restore();
      archPath(page, b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad);
      ctx.strokeStyle = P.accent; ctx.lineWidth = Math.max(1, page.u(0.3)); ctx.stroke();
      return r;
    }
    const b = boxIn(x, y, w, h);
    const r = drawPhoto(page, img, shot, b.x, b.y, b.w, b.h);
    if (kind === "keyline") frame(page, b.x, b.y, b.w, b.h, deco.c === "ink" ? P.ink : P.rule, 0.2);
    return r;
  }
  // The photographs of a page inside `box`, each dressed the style's way.
  function decoCells(page, P, deco, entry, imgs, box, gap, L, n, single = "crop") {
    const shots = entry.photos;
    if (shots.length === 1) {
      if (imgs[0]) decoPhoto(page, P, deco, imgs[0], shots[0], box.x, box.y, box.w, box.h, single, n * 7); else missing(page, P, box.x, box.y, box.w, box.h);
      return;
    }
    const aspects = shots.map((s, i) => (imgs[i] ? imgAspect(imgs[i]) : 0.7));
    cells(shots.length, box, gap, aspects, L, entry.rows).forEach((c, i) => {
      const r = imgs[i] ? decoPhoto(page, P, deco, imgs[i], shots[i], c.x, c.y, c.w, c.h, "crop", n * 7 + i, i) : (missing(page, P, c.x, c.y, c.w, c.h), null);
      if (plateNums()) plateChip(page, P, i + 1, c, r && typeof r.x === "number" ? r : null);
    });
  }
  // A caption set in a narrow column: wrapped, in the studio's own formatting.
  function captionColumn(page, entry, P, x, y, w, spec, maxLines, color) {
    const words = oneParagraph(entry && entry.caption).join(" ");
    if (!words) return y;
    const f = withRole("caption", entry.style && entry.style.caption), st = styledSpec(spec, f), size = spec.start * sizeScale(f), lead = size * 1.48;
    font(page, st.w, size, st.f, st.sp || 0, !!st.it);
    const lines = wrap(page, words, w);
    if (lines.length > maxLines) reportCut(page, "caption", "caption");
    lines.slice(0, maxLines).forEach((l, i) => text(page, i === maxLines - 1 && lines.length > maxLines ? ellipsize(page, `${l} …`, w) : l, x, y + i * lead, tintOf(f.color, P, color)));
    return y + Math.min(lines.length, maxLines) * lead;
  }
  // The heading, body and small label of the About, What I shoot and Contact
  // pages, from a few numbers: h = heading, b = body, l = label.
  const textKit = (o) => ({
    heading(page, s, x, y, P, maxW) {
      font(page, o.h.w, o.h.size, o.h.f, o.h.sp || 0, !!o.h.it);
      const lines = wrap(page, o.h.caps ? String(s).toUpperCase() : s, maxW), step = o.h.size * o.h.lead;
      lines.forEach((l, i) => text(page, l, x, y + i * step, P.ink));
      const end = y + (lines.length - 1) * step;
      paintOps(page, ruleOps(o.rule, x, end + 7, P.accent));
      return end + 16;
    },
    body(page, s, x, y, P, maxW, maxY = Infinity) { font(page, o.b.w, o.b.size, o.b.f); return bodyLines(page, s, x, y, P, maxW, maxY, o.b.lead); },
    label(page, s, x, y, P) { font(page, o.l.w, o.l.size, o.l.f, o.l.sp || 0); text(page, o.l.caps === false ? s : String(s).toUpperCase(), x, y, o.l.color === "ink" ? P.ink : o.l.color === "soft" ? P.soft : accentText(P)); },
    ground(page, P, W, H) { rect(page, 0, 0, W, H, pageBg(P, o.ground === "white" ? P.white : P.paper)); }
  });
  // A caption under the photographs and the style's foot: what most photo pages end with.
  const captionUnder = (page, entry, P, x, y, w, st, color, align) => { const cap = captionFit(entry, w, CAPTION_TYPE[st], align); if (cap) drawCaption(page, cap, x, y, CAPTION_TYPE[st], color, P); };

  /* Noir: black pages. The photographs whole and unframed, so they glow; the
     words white, in light tracked capitals; the accent a thin line. */
  const NOIR = {
    ...textKit({ h: { w: 300, size: 8.5, f: F.jost, sp: 1.0, caps: true, lead: 1.3 }, b: { w: 400, size: 3.9, f: F.jost, lead: 6.3 }, l: { w: 500, size: 2.4, f: F.jost, sp: 1.4 }, rule: { w: 34, h: 0.3 }, ground: "paper" }),
    margins(o) { return spaced(o === "landscape" ? { top: 16, side: 18, bottom: 22, gap: 3 } : { top: 18, side: 16, bottom: 26, gap: 3 }); },
    async cover(page, book, P, W, H, img) {
      const L = W > H, K = COVER_TYPE.noir, CT = coverText(book), cs = coverStyleOf(book);
      rect(page, 0, 0, W, H, P.paper);
      if (img) {
        drawPhoto(page, img, book.cover, 0, 0, W, H);
        shade(page, 0, 0, W, H * 0.3, "rgba(0,0,0,0.55)", "rgba(0,0,0,0)");
        shade(page, 0, H * 0.42, W, H * 0.58, "rgba(0,0,0,0)", "rgba(0,0,0,0.88)");
      } else { const sz = L ? 40 : 48; await drawMark(page, P.ink, P.accent, P.paper, (W - sz) / 2, H * 0.3 - sz / 2, sz); }
      const x = 22, tw = W - 44, footY = H - 15, on = img ? "#FFFFFF" : P.ink, soft = img ? "rgba(255,255,255,0.78)" : P.soft;
      font(page, 500, 2.6, K.small, 1.6); text(page, ellipsize(page, CT.foot, tw), W / 2, 18, on, "center");
      const TT = textFormat(cs, "title", { w: K.w, f: K.f }, P, on, "center");
      const t = fitLines(page, titleOf(book, K), tw, 3, TT.spec.w, (L ? 12 : 14) * TT.scale, (L ? 7 : 8) * TT.scale, TT.spec.f, K.sp, !!TT.spec.it);
      const lead = t.size * 1.32, firstY = footY - 17 - 8 - (t.lines.length - 1) * lead;
      font(page, 500, 2.6, K.small, 1.6); text(page, ellipsize(page, CT.label, tw), W / 2, firstY - t.size - 6, img ? "#FFFFFF" : accentText(P), "center");
      coverWords(page, book, K, cs, P, on, soft, x, tw, firstY, t, lead, "center");
      rect(page, W / 2 - 14, footY - 7.4, 28, 0.3, P.accent);
      font(page, 500, 2.4, K.small, 1.4); text(page, ellipsize(page, CT.place, tw), W / 2, footY, soft, "center");
    },
    async photos(page, entry, P, W, H, imgs, shoots, n) {
      const L = W > H, M = this.margins(L ? "landscape" : "portrait");
      rect(page, 0, 0, W, H, pageBg(P, P.paper));
      const shots = entry.photos;
      if (shots.length === 1 && entry.border) return bandedPhotoPage(page, entry, P, W, H, imgs, shots, shoots, n, captionFit(entry, W - 32, CAPTION_TYPE.noir), "noir", M.gap);
      const has = oneParagraph(entry.caption).length > 0;
      const box = { x: M.side, y: M.top, w: W - 2 * M.side, h: H - M.top - M.bottom - (has ? 8 : 0) };
      decoCells(page, P, null, entry, imgs, box, M.gap, L, n, "fit");
      captionUnder(page, entry, P, M.side, H - M.bottom - 0.5, W - 2 * M.side, "noir", P.soft, "center");
      this.foot(page, P, W, H, n, pageCredit(entry, shoots));
    },
    // The number in the middle of the foot between two fine lines; the credit and the name either side.
    foot(page, P, W, H, n, credit, o = {}) {
      const ink = o.ink || P.ink, soft = o.soft || P.soft, y = H - 11;
      font(page, 500, 2.3, F.jost, 1.2);
      if (showNums()) { text(page, String(n).padStart(2, "0"), W / 2 + 0.6, y, ink, "center"); rect(page, W / 2 - 17, y - 0.9, 9, 0.2, soft); rect(page, W / 2 + 8, y - 0.9, 9, 0.2, soft); }
      if (credit) text(page, ellipsize(page, credit.toUpperCase(), W / 2 - 38), 16, y, soft);
      text(page, ellipsize(page, footName(), W / 2 - 38), W - 16, y, soft, "right");
    }
  };

  /* Swiss: a strict grid on white. A heavy rule and a big numeral across the
     head of every page, bold sans in lower case, the photographs pushed to the
     right of a narrow column that carries the caption and the credit. */
  const SWISS = {
    ...textKit({ h: { w: 700, size: 10, f: F.sans, sp: -0.3, lead: 1.1 }, b: { w: 400, size: 3.9, f: F.sans, lead: 6.2 }, l: { w: 600, size: 2.6, f: F.sans, sp: 0.1, caps: false, color: "ink" }, rule: { w: 3.2, h: 3.2 }, ground: "white" }),
    margins(o) { return spaced(o === "landscape" ? { top: 24, side: 20, bottom: 18, gap: 4 } : { top: 28, side: 20, bottom: 20, gap: 4 }); },
    async cover(page, book, P, W, H, img) {
      const L = W > H, K = COVER_TYPE.swiss, CT = coverText(book), cs = coverStyleOf(book);
      rect(page, 0, 0, W, H, P.white);
      const x = 20, right = W - 20, tw = right - x;
      rect(page, x, 14, tw, 1.6, P.ink);
      font(page, 600, 2.6, F.sans, 0.2); text(page, ellipsize(page, CT.label, tw), x, 21.6, P.ink);
      const { t, lead } = coverTitleFit(page, book, K, cs, P, tw, 3, L ? 19 : 25, L ? 10 : 12, 34 + (L ? 19 : 25), 4.2 * 1.3 + 4 + (L ? 100 : 130), H - 26);
      const subY = coverWords(page, book, K, cs, P, P.ink, P.soft, x, tw, 32 + t.size * 0.86, t, lead);
      // The photograph in the lower right module; the square marks the grid.
      const top = Math.max(subY + 12, H * (L ? 0.4 : 0.42)), px = x + tw * (L ? 0.36 : 0.3), box = { x: px, y: top, w: right - px, h: H - 30 - top };
      rect(page, x, top, 9, 9, P.accent);
      if (img) drawPhoto(page, img, book.cover, box.x, box.y, box.w, box.h);
      else { rect(page, box.x, box.y, box.w, box.h, P.accent); const sz = L ? 30 : 38; await drawMark(page, P.onAccent, P.onAccent, "rgba(0,0,0,0)", box.x + (box.w - sz) / 2, box.y + (box.h - sz) / 2, sz); }
      hair(page, x, H - 22, right, P.ink);
      font(page, 600, 2.6, F.sans, 0.2);
      text(page, ellipsize(page, CT.foot, tw * 0.55), x, H - 15.5, P.ink);
      text(page, ellipsize(page, CT.place, tw * 0.42), right, H - 15.5, P.soft, "right");
    },
    async photos(page, entry, P, W, H, imgs, shoots, n) {
      const L = W > H, M = this.margins(L ? "landscape" : "portrait");
      rect(page, 0, 0, W, H, pageBg(P, P.white));
      const shots = entry.photos;
      if (shots.length === 1 && entry.border) return bandedPhotoPage(page, entry, P, W, H, imgs, shots, shoots, n, captionFit(entry, W - 40, CAPTION_TYPE.swiss), "swiss", M.gap);
      const col = L ? 46 : 38, box = { x: M.side + col + 6, y: M.top, w: W - 2 * M.side - col - 6, h: H - M.top - M.bottom };
      if (shots.length === 1) {
        // One photograph: whole, hung from the top of the grid, against its right edge.
        if (imgs[0]) { const b = FIT_MODES.includes(shots[0].fit) ? box : wholeBox(imgs[0], box.x, box.y, box.w, box.h, "right"); drawPhoto(page, imgs[0], shots[0], b.x, box.y, b.w, b.h); }
        else missing(page, P, box.x, box.y, box.w, box.h);
      } else decoCells(page, P, null, entry, imgs, box, M.gap, L, n);
      // The narrow column: the square, the caption, and the credit at its foot.
      rect(page, M.side, box.y, 3.2, 3.2, P.accent);
      captionColumn(page, entry, P, M.side, box.y + 11, col, CAPTION_TYPE.swiss, 9, P.ink);
      const credit = pageCredit(entry, shoots);
      if (credit) {
        font(page, 400, 2.5, F.sans);
        const lines = wrap(page, credit.replace(/\s+\/\s+/g, " / "), col).slice(0, 7);
        lines.forEach((l, i) => text(page, ellipsize(page, l, col), M.side, box.y + box.h - (lines.length - 1 - i) * 3.7, P.soft));
      }
      this.foot(page, P, W, H, n, "");
    },
    // Not a foot: a rule across the head, the name under it, the page number large at the right.
    foot(page, P, W, H, n, credit, o = {}) {
      const ink = o.ink || P.ink, soft = o.soft || P.soft, y0 = W > H ? 9 : 11;
      rect(page, 20, y0, W - 40, 1.2, ink);
      font(page, 600, 2.5, F.sans, 0.2);
      const name = footName(), nameW = measure(page, name);
      text(page, name, 20, y0 + 6.4, ink);
      if (credit) { font(page, 400, 2.5, F.sans); text(page, ellipsize(page, credit, W - 40 - nameW - 30), 20 + nameW + 8, y0 + 6.4, soft); }
      if (showNums()) { font(page, 700, 6.2, F.sans, -0.2); text(page, String(n).padStart(2, "0"), W - 20, y0 + 8.2, ink, "right"); }
    },
    // A chapter opens on its number, large, in the colour.
    dividerDeco(page, book, entry, P, W, H) {
      let k = 0; for (const pg of book.pages) { if (pg && pg.type === "divider") { k++; if (pg === entry) break; } }
      font(page, 700, W > H ? 54 : 70, F.sans, -2);
      text(page, String(k || 1).padStart(2, "0"), 17, W > H ? 78 : 104, P.accent);
    }
  };

  /* Pinboard: a board with prints on it. Every photograph a white-bordered
     print, a little askew, taped at its head; headings and captions by hand. */
  const PINBOARD = {
    ...textKit({ h: { w: 700, size: 15, f: F.hand, lead: 1.0 }, b: { w: 400, size: 3.9, f: F.sans, lead: 6.2 }, l: { w: 500, size: 2.3, f: F.plex, sp: 0.4, color: "soft" }, rule: { w: 24, h: 0.5, kind: "wave" }, ground: "paper" }),
    margins(o) { return spaced(o === "landscape" ? { top: 20, side: 24, bottom: 26, gap: 9 } : { top: 24, side: 22, bottom: 30, gap: 9 }); },
    async cover(page, book, P, W, H, img) {
      const L = W > H, K = COVER_TYPE.pinboard, CT = coverText(book), cs = coverStyleOf(book);
      rect(page, 0, 0, W, H, P.paper);
      const x = 28, tw = W - 56, box = { x: L ? 66 : 28, y: L ? 18 : 26, w: W - (L ? 132 : 56), h: L ? H - 18 - 82 : H * 0.6 };
      if (img) decoPhoto(page, P, { kind: "print" }, img, book.cover, box.x, box.y, box.w, box.h, "crop", 0);
      else {
        // Loaded first: nothing may wait while the page is turned.
        const owl = await mark(P.soft, P.accent, "rgba(0,0,0,0)"), sz = L ? 30 : 38;
        printOn(page, box.x, box.y, box.w, box.h, 0, 3.2, (ix, iy, iw, ih) => { rect(page, ix, iy, iw, ih, P.rule); if (owl) page.ctx.drawImage(owl, page.u(ix + (iw - sz) / 2), page.u(iy + (ih - sz) / 2), page.u(sz), page.u(sz)); });
      }
      const top = box.y + box.h + (L ? 12 : 17);
      const { t, lead } = coverTitleFit(page, book, K, cs, P, tw, 2, L ? 17 : 22, L ? 10 : 12, top + (L ? 17 : 22), 6.4 * 1.3 + 4 + 16, H - 12);
      coverWords(page, book, K, cs, P, P.ink, P.soft, x, tw, top + t.size * 0.7, t, lead);
      // A label stuck at the foot, a little askew the other way.
      const lw = 66, lx = W - 28 - lw, ly = H - 28;
      turned(page, lx + lw / 2, ly + 6, 1.2, () => {
        page.ctx.save(); page.ctx.shadowColor = "rgba(0,0,0,0.22)"; page.ctx.shadowBlur = page.u(1.6); page.ctx.shadowOffsetY = page.u(0.6);
        rect(page, lx, ly, lw, 13, "#FDFCF8"); page.ctx.restore();
        font(page, 500, 2.4, F.plex, 0.3); text(page, ellipsize(page, CT.foot, lw - 8), lx + 4, ly + 5.4, "#1b1b1b");
        font(page, 400, 2.2, F.plex, 0.3); text(page, ellipsize(page, CT.place, lw - 8), lx + 4, ly + 9.8, "#6a6a6a");
      });
    },
    async photos(page, entry, P, W, H, imgs, shoots, n) {
      const L = W > H, M = this.margins(L ? "landscape" : "portrait");
      rect(page, 0, 0, W, H, pageBg(P, P.paper));
      const shots = entry.photos;
      if (shots.length === 1 && entry.border) return bandedPhotoPage(page, entry, P, W, H, imgs, shots, shoots, n, captionFit(entry, W - 44, CAPTION_TYPE.pinboard), "pinboard", M.gap);
      const has = oneParagraph(entry.caption).length > 0;
      const box = { x: M.side, y: M.top, w: W - 2 * M.side, h: H - M.top - M.bottom - (has ? 9 : 0) };
      decoCells(page, P, { kind: "print" }, entry, imgs, box, M.gap, L, n, "fit");
      captionUnder(page, entry, P, M.side, H - M.bottom + 0.5, W - 2 * M.side, "pinboard", P.ink);
      this.foot(page, P, W, H, n, pageCredit(entry, shoots));
    },
    foot(page, P, W, H, n, credit, o = {}) {
      const ink = o.ink || P.ink, soft = o.soft || P.soft;
      if (showNums()) { font(page, 600, 5.2, F.hand); text(page, `– ${n} –`, W / 2, H - 10.5, ink, "center"); }
      if (credit) { font(page, 400, 2.2, F.plex, 0.3); text(page, ellipsize(page, credit.toUpperCase(), W / 2 - 40), 22, H - 11, soft); }
    },
    dividerDeco(page, book, entry, P, W, H) { tape(page, 34, 30, -38, 26, 7); tape(page, W - 34, H - 34, -38, 26, 7); }
  };

  /* Dossier: a working file. Typewriter capitals, a header that counts the
     sheets, corner marks on the page, and every photograph a numbered figure
     with its album beside the number. */
  const cornerMarks = (page, W, H, c) => { for (const [x, y, sx, sy] of [[7, 7, 1, 1], [W - 7, 7, -1, 1], [7, H - 7, 1, -1], [W - 7, H - 7, -1, -1]]) { rect(page, sx > 0 ? x : x - 5, y - 0.1, 5, 0.2, c); rect(page, x - 0.1, sy > 0 ? y : y - 5, 0.2, 5, c); } };
  const gridOver = (page, W, H, c, step = 10) => { const t = Math.max(0.12, 1 / page.u(1)); page.ctx.save(); page.ctx.globalAlpha = 0.55; for (let gx = step; gx < W; gx += step) rect(page, gx - t / 2, 0, t, H, c); for (let gy = step; gy < H; gy += step) rect(page, 0, gy - t / 2, W, t, c); page.ctx.restore(); };
  const DOSSIER = {
    ...textKit({ h: { w: 500, size: 7, f: F.plex, caps: true, lead: 1.34 }, b: { w: 400, size: 3.8, f: F.sans, lead: 6.1 }, l: { w: 500, size: 2.3, f: F.plex, sp: 0.5 }, rule: { w: 22, h: 0.4, kind: "dash" }, ground: "paper" }),
    margins(o) { return spaced(o === "landscape" ? { top: 22, side: 22, bottom: 24, gap: 7 } : { top: 24, side: 22, bottom: 28, gap: 7 }); },
    async cover(page, book, P, W, H, img) {
      const L = W > H, K = COVER_TYPE.dossier, CT = coverText(book), cs = coverStyleOf(book);
      rect(page, 0, 0, W, H, P.paper);
      gridOver(page, W, H, P.rule); cornerMarks(page, W, H, P.soft);
      const x = 22, right = W - 22, tw = right - x;
      font(page, 500, 2.4, F.plex, 0.5);
      text(page, ellipsize(page, CT.label, tw * 0.55), x, 20, accentText(P)); text(page, ellipsize(page, CT.place, tw * 0.42), right, 20, P.soft, "right");
      hair(page, x, 23.5, right, P.ink, 0.25);
      const win = { x, y: 30, w: tw, h: L ? H * 0.47 : H * 0.5 };
      numNow = 1;
      if (img) decoPhoto(page, P, { kind: "figure" }, img, book.cover, win.x, win.y, win.w, win.h, "crop", 0);
      else { rect(page, win.x, win.y, win.w, win.h - 5.2, P.rule); frame(page, win.x, win.y, win.w, win.h - 5.2, P.ink, 0.25); const sz = L ? 28 : 34; await drawMark(page, P.soft, P.accent, "rgba(0,0,0,0)", win.x + (win.w - sz) / 2, win.y + (win.h - 5.2 - sz) / 2, sz); }
      // Under it, a table of two rows: what the file is, and what is in it.
      const y0 = win.y + win.h + (L ? 7 : 10), tx = x + 26, ttw = right - tx;
      hair(page, x, y0, right, P.ink, 0.25);
      font(page, 500, 2.2, F.plex, 0.4); text(page, "TITLE", x, y0 + 7, P.soft);
      const { t, lead } = coverTitleFit(page, book, K, cs, P, ttw, 3, L ? 10 : 13, L ? 5 : 6, y0 + 6 + (L ? 10 : 13), 3.4 * 1.3 + 12, H - 27);
      coverWords(page, book, K, cs, P, P.ink, P.soft, tx, ttw, y0 + 4 + t.size * 0.86, t, lead);
      hair(page, x, H - 24, right, P.ink, 0.25);
      font(page, 500, 2.4, F.plex, 0.5);
      text(page, ellipsize(page, CT.foot, tw * 0.6), x, H - 17.5, P.ink);
      text(page, `SHEET 01 / ${String(renderedCount(book)).padStart(2, "0")}`, right, H - 17.5, P.soft, "right");
    },
    async photos(page, entry, P, W, H, imgs, shoots, n) {
      const L = W > H, M = this.margins(L ? "landscape" : "portrait");
      rect(page, 0, 0, W, H, pageBg(P, P.paper));
      const shots = entry.photos;
      if (shots.length === 1 && entry.border) return bandedPhotoPage(page, entry, P, W, H, imgs, shots, shoots, n, captionFit(entry, W - 48, CAPTION_TYPE.dossier), "dossier", M.gap);
      const has = oneParagraph(entry.caption).length > 0;
      const box = { x: M.side, y: M.top, w: W - 2 * M.side, h: H - M.top - M.bottom - (has ? 7 : 0) };
      decoCells(page, P, { kind: "figure" }, entry, imgs, box, M.gap, L, n, "fit");
      captionUnder(page, entry, P, M.side, H - M.bottom + 0.5, W - 2 * M.side, "dossier", P.ink);
      this.foot(page, P, W, H, n, pageCredit(entry, shoots));
    },
    // A header: the name, and which sheet of how many; corner marks; the credit at the foot.
    foot(page, P, W, H, n, credit, o = {}) {
      const ink = o.ink || P.ink, soft = o.soft || P.soft, y = W > H ? 12 : 13;
      cornerMarks(page, W, H, soft);
      font(page, 500, 2.2, F.plex, 0.4);
      text(page, ellipsize(page, footName(), W * 0.5), 22, y, ink);
      if (showNums()) text(page, `SHEET ${String(n).padStart(2, "0")} / ${String(bookNow ? renderedCount(bookNow) : n).padStart(2, "0")}`, W - 22, y, soft, "right");
      hair(page, 22, y + 2.6, W - 22, ink, 0.2);
      if (credit) text(page, ellipsize(page, credit.toUpperCase(), W - 44), 22, H - 12, soft);
    },
    dividerDeco(page, book, entry, P, W, H) {
      gridOver(page, W, H, P.rule);
      let k = 0; for (const pg of book.pages) { if (pg && pg.type === "divider") { k++; if (pg === entry) break; } }
      font(page, 500, 2.4, F.plex, 0.5); text(page, `SECTION ${String(k || 1).padStart(2, "0")}`, 22, W > H ? 30 : 34, accentText(P));
    }
  };

  /* Poster: loud. Tall condensed capitals, a thick black outline round every
     photograph with a block of the colour behind it, the number in a black
     square, chapter pages and the cover flooded with the colour. */
  const POSTER = {
    ...textKit({ h: { w: 400, size: 15, f: F.poster, sp: 0.2, caps: true, lead: 1.04 }, b: { w: 400, size: 3.9, f: F.sans, lead: 6.2 }, l: { w: 700, size: 2.5, f: F.sans, sp: 0.5 }, rule: { w: 16, h: 2.2 }, ground: "white" }),
    margins(o) { return spaced(o === "landscape" ? { top: 16, side: 18, bottom: 24, gap: 7 } : { top: 18, side: 18, bottom: 26, gap: 7 }); },
    async cover(page, book, P, W, H, img) {
      const L = W > H, K = COVER_TYPE.poster, CT = coverText(book), cs = coverStyleOf(book);
      rect(page, 0, 0, W, H, P.accent);
      const x = 16, right = W - 16, tw = right - x, band = 24;
      font(page, 700, 2.6, F.sans, 0.6); text(page, ellipsize(page, CT.label, tw), x, 14, P.onAccent);
      const start = L ? 30 : 40, room = 5 * 1.3 + 4 + (img ? (L ? 70 : 96) : 40);
      const { t, lead } = coverTitleFit(page, book, K, cs, P, tw, 4, start, L ? 13 : 15, 20 + start, room, H - band - 6);
      const subY = coverWords(page, book, K, cs, P, P.onAccent, P.onAccent, x, tw, 19 + t.size * 0.86, t, lead);
      const top = subY + 10, ph = H - band - 9 - top;
      if (img && ph > 30) decoPhoto(page, P, { kind: "block", c: "ink" }, img, book.cover, x, top, tw, ph, "crop", 0);
      else if (!img) { const sz = L ? 34 : 46; await drawMark(page, P.onAccent, P.onAccent, P.accent, x, H - band - 12 - sz, sz); }
      rect(page, 0, H - band, W, band, P.ink);
      font(page, 400, 5, F.poster, 0.4);
      text(page, ellipsize(page, CT.foot, tw * 0.58), x, H - band / 2 + 1.9, P.paper);
      text(page, ellipsize(page, CT.place, tw * 0.4), right, H - band / 2 + 1.9, P.paper, "right");
    },
    async photos(page, entry, P, W, H, imgs, shoots, n) {
      const L = W > H, M = this.margins(L ? "landscape" : "portrait");
      rect(page, 0, 0, W, H, pageBg(P, P.white));
      const shots = entry.photos;
      if (shots.length === 1 && entry.border) return bandedPhotoPage(page, entry, P, W, H, imgs, shots, shoots, n, captionFit(entry, W - 36, CAPTION_TYPE.poster), "poster", M.gap);
      const has = oneParagraph(entry.caption).length > 0;
      const box = { x: M.side, y: M.top, w: W - 2 * M.side, h: H - M.top - M.bottom - (has ? 8 : 0) };
      decoCells(page, P, { kind: "block" }, entry, imgs, box, M.gap, L, n);
      captionUnder(page, entry, P, M.side, H - M.bottom + 0.5, W - 2 * M.side, "poster", P.ink);
      this.foot(page, P, W, H, n, pageCredit(entry, shoots));
    },
    // The number in a black square at the outer corner; the name in tall capitals at the inner one.
    foot(page, P, W, H, n, credit, o = {}) {
      const ink = o.ink || P.ink, soft = o.soft || P.soft, outer = n % 2 === 1, sq = 11, sx = outer ? W - 18 - sq : 18;
      if (showNums()) { rect(page, sx, H - 20, sq, sq, ink); font(page, 400, 5.4, F.poster, 0.2); text(page, String(n).padStart(2, "0"), sx + sq / 2 + 0.1, H - 12.4, o.ink ? P.accent : P.white, "center"); }
      font(page, 400, 3.8, F.poster, 0.5);
      const name = ellipsize(page, footName(), W * 0.4), nameW = measure(page, name), nx = outer ? 18 : W - 18;
      text(page, name, nx, H - 12.4, ink, outer ? "left" : "right");
      if (credit) { font(page, 600, 2.3, F.sans, 0.3); const room = W - 36 - sq - nameW - 14; if (room > 20) text(page, ellipsize(page, credit.toUpperCase(), room), outer ? nx + nameW + 6 : nx - nameW - 6, H - 12.6, soft, outer ? "left" : "right"); }
    }
  };

  /* Atelier: soft. A tinted page, every photograph in an arched window with a
     fine line round it, a narrow italic serif, the cover and the feet centred. */
  const flourish = (page, cx, y, c, arm = 18) => { hair(page, cx - arm - 3.5, y, cx - 3.5, c, 0.2); hair(page, cx + 3.5, y, cx + arm + 3.5, c, 0.2); paintOps(page, [{ k: "path", shape: "diamond", corner: 0, x: cx - 1.2, y: y - 1.2, w: 2.4, h: 2.4, c }]); };
  const ATELIER = {
    ...textKit({ h: { w: 500, size: 13, f: F.cormorant, it: true, lead: 1.06 }, b: { w: 500, size: 4.4, f: F.cormorant, lead: 6.3 }, l: { w: 500, size: 2.3, f: F.geo, sp: 1.2 }, rule: { w: 26, h: 0.3, kind: "diamond" }, ground: "paper" }),
    margins(o) { return spaced(o === "landscape" ? { top: 22, side: 26, bottom: 28, gap: 8 } : { top: 26, side: 24, bottom: 32, gap: 8 }); },
    async cover(page, book, P, W, H, img) {
      const L = W > H, K = COVER_TYPE.atelier, CT = coverText(book), cs = coverStyleOf(book);
      rect(page, 0, 0, W, H, P.paper);
      const x = 28, tw = W - 56;
      font(page, 500, 2.5, K.small, 1.6); text(page, ellipsize(page, CT.foot, tw), W / 2 + 0.8, L ? 16 : 20, P.ink, "center");
      const ah = L ? H * 0.54 : H * 0.5, aw = Math.min(W - 56, ah * (L ? 0.78 : 0.8)), ax = (W - aw) / 2, ay = L ? 23 : 30;
      if (img) decoPhoto(page, P, { kind: "arch" }, img, book.cover, ax, ay, aw, ah, "crop", 0);
      else { archPath(page, ax + 2, ay + 2, aw - 4, ah - 4); page.ctx.fillStyle = P.rule; page.ctx.fill(); archPath(page, ax, ay, aw, ah); page.ctx.strokeStyle = P.accent; page.ctx.lineWidth = Math.max(1, page.u(0.3)); page.ctx.stroke(); const sz = L ? 26 : 34; await drawMark(page, P.ink, P.accent, "rgba(0,0,0,0)", (W - sz) / 2, ay + ah * 0.55 - sz / 2, sz); }
      const top = ay + ah + (L ? 9 : 16), footY = H - (L ? 12 : 15);
      const { t, lead } = coverTitleFit(page, book, K, cs, P, tw, 2, L ? 13 : 18, L ? 8 : 10, top + (L ? 13 : 18), 5.6 * 1.3 + 4 + 16, footY - 4);
      const subY = coverWords(page, book, K, cs, P, P.ink, P.soft, x, tw, top + t.size * 0.72, t, lead, "center");
      flourish(page, W / 2, Math.min(subY + (L ? 6 : 9), footY - 7), P.accent);
      font(page, 500, 2.4, K.small, 1.4); text(page, ellipsize(page, CT.place, tw), W / 2 + 0.7, footY, P.soft, "center");
    },
    async photos(page, entry, P, W, H, imgs, shoots, n) {
      const L = W > H, M = this.margins(L ? "landscape" : "portrait");
      rect(page, 0, 0, W, H, pageBg(P, P.paper));
      const shots = entry.photos;
      if (shots.length === 1 && entry.border) return bandedPhotoPage(page, entry, P, W, H, imgs, shots, shoots, n, captionFit(entry, W - 56, CAPTION_TYPE.atelier), "atelier", M.gap);
      const has = oneParagraph(entry.caption).length > 0;
      let box = { x: M.side, y: M.top, w: W - 2 * M.side, h: H - M.top - M.bottom - (has ? 9 : 0) };
      // One photograph: a tall arch in the middle of the page.
      if (shots.length === 1) { const w = Math.min(box.w, box.h * 0.74); box = { ...box, x: box.x + (box.w - w) / 2, w }; }
      decoCells(page, P, { kind: "arch" }, entry, imgs, box, M.gap, L, n);
      captionUnder(page, entry, P, M.side, H - M.bottom + 1, W - 2 * M.side, "atelier", P.ink, "center");
      this.foot(page, P, W, H, n, pageCredit(entry, shoots));
    },
    foot(page, P, W, H, n, credit, o = {}) {
      const ink = o.ink || P.ink, soft = o.soft || P.soft;
      if (showNums()) { font(page, 500, 4.4, F.cormorant, 0.3, true); text(page, `·  ${n}  ·`, W / 2, H - 15, ink, "center"); }
      if (credit) { font(page, 500, 2.1, F.geo, 0.9); text(page, ellipsize(page, credit.toUpperCase(), W - 70), W / 2 + 0.4, H - 9.5, soft, "center"); }
    },
    // A chapter opens inside a fine arch.
    dividerDeco(page, book, entry, P, W, H) {
      const L = W > H, h = H * (L ? 0.74 : 0.62), w = L ? W * 0.8 : W * 0.72;
      page.ctx.save(); page.ctx.globalAlpha = 0.7; archPath(page, (W - w) / 2, (H - h) / 2 - 4, w, h, true); page.ctx.strokeStyle = P.accent; page.ctx.lineWidth = Math.max(1, page.u(0.3)); page.ctx.stroke(); page.ctx.restore();
    }
  };

  /* Gazette: a newspaper. A running head with double rules on every page, a
     masthead and a headline on the cover, black serif headlines, serif text in
     columns with a rule between them, italic captions, newsprint for paper. */
  const GAZETTE = {
    ...textKit({ h: { w: 800, size: 11, f: F.playfair, lead: 1.13 }, b: { w: 400, size: 3.9, f: F.news, lead: 6.2 }, l: { w: 600, size: 2.3, f: F.sans, sp: 0.6 }, rule: { w: 26, h: 0.6, kind: "double" }, ground: "paper" }),
    margins(o) { return spaced(o === "landscape" ? { top: 22, side: 18, bottom: 22, gap: 5 } : { top: 26, side: 18, bottom: 24, gap: 5 }); },
    async cover(page, book, P, W, H, img) {
      const L = W > H, K = COVER_TYPE.gazette, CT = coverText(book), cs = coverStyleOf(book);
      rect(page, 0, 0, W, H, P.paper);
      const x = 18, right = W - 18, tw = right - x;
      font(page, 600, 2.3, F.sans, 0.5);
      text(page, ellipsize(page, CT.label, tw * 0.5), x, 13, P.ink); text(page, ellipsize(page, CT.place, tw * 0.45), right, 13, P.ink, "right");
      // The masthead: the studio's name, as wide as it can go, between rules.
      hair(page, x, 16, right, P.ink, 0.25);
      const ms = fitSize(page, CT.foot, tw, 900, L ? 14 : 16, F.playfair, 0, 7), mastY = 18.5 + ms * 0.8;
      text(page, CT.foot, W / 2, mastY, P.ink, "center");
      const ry = mastY + ms * 0.2 + 3.4;
      rect(page, x, ry, tw, 0.9, P.ink); rect(page, x, ry + 1.6, tw, 0.25, P.ink);
      // The headline and its deck.
      const top = ry + (L ? 8 : 11), start = L ? 12 : 15;
      const { t, lead } = coverTitleFit(page, book, K, cs, P, tw, 2, start, L ? 7.5 : 9, top + start, 5 * 1.3 + 4 + (L ? 66 : 110), H - 22);
      const subY = coverWords(page, book, K, cs, P, P.ink, P.soft, x, tw, top + t.size * 0.8, t, lead, "center");
      hair(page, x, subY + 5.5, right, P.ink, 0.25);
      const py = subY + 10, ph = H - 25 - py;
      if (img) decoPhoto(page, P, { kind: "keyline", c: "ink" }, img, book.cover, x, py, tw, ph, "crop", 0);
      else { rect(page, x, py, tw, ph, P.rule); const sz = L ? 28 : 38; await drawMark(page, P.ink, P.accent, "rgba(0,0,0,0)", (W - sz) / 2, py + (ph - sz) / 2, sz); }
      hair(page, x, H - 20, right, P.ink, 0.25);
      font(page, 600, 2.3, F.sans, 0.5);
      text(page, `© ${year()}`, x, H - 14, P.ink); text(page, ellipsize(page, studio(), tw * 0.6), right, H - 14, P.ink, "right");
    },
    async photos(page, entry, P, W, H, imgs, shoots, n) {
      const L = W > H, M = this.margins(L ? "landscape" : "portrait");
      rect(page, 0, 0, W, H, pageBg(P, P.paper));
      const shots = entry.photos;
      if (shots.length === 1 && entry.border) return bandedPhotoPage(page, entry, P, W, H, imgs, shots, shoots, n, captionFit(entry, W - 40, CAPTION_TYPE.gazette), "gazette", M.gap);
      const has = oneParagraph(entry.caption).length > 0;
      const box = { x: M.side, y: M.top, w: W - 2 * M.side, h: H - M.top - M.bottom - (has ? 8 : 0) };
      decoCells(page, P, { kind: "keyline", c: "ink" }, entry, imgs, box, M.gap, L, n, "fit");
      captionUnder(page, entry, P, M.side, H - M.bottom + 0.5, W - 2 * M.side, "gazette", P.ink);
      this.foot(page, P, W, H, n, pageCredit(entry, shoots));
    },
    // A running head: double rule, the name in the middle, the page at the left, the year at the right.
    foot(page, P, W, H, n, credit, o = {}) {
      const ink = o.ink || P.ink, soft = o.soft || P.soft, y0 = W > H ? 7 : 8.5, yb = y0 + 6.2;
      rect(page, 18, y0, W - 36, 0.7, ink); rect(page, 18, y0 + 1.3, W - 36, 0.2, ink);
      font(page, 700, 3.3, F.playfair, 0.3); text(page, ellipsize(page, footName(), W * 0.5), W / 2, yb, ink, "center");
      font(page, 600, 2.2, F.sans, 0.5);
      if (showNums()) text(page, `PAGE ${n}`, 18, yb - 0.3, ink);
      text(page, year(), W - 18, yb - 0.3, soft, "right");
      rect(page, 18, yb + 2.4, W - 36, 0.2, ink);
      if (credit) { font(page, 400, 2.9, F.news, 0, true); text(page, ellipsize(page, credit, W - 60), W / 2, H - 11, soft, "center"); }
    },
    dividerDeco(page, book, entry, P, W, H) {
      const a = H / 2 - 50, b = H / 2 + 72;
      rect(page, 18, a, W - 36, 0.9, P.ink); rect(page, 18, a + 1.6, W - 36, 0.25, P.ink);
      rect(page, 18, b, W - 36, 0.25, P.ink); rect(page, 18, b + 1, W - 36, 0.9, P.ink);
    }
  };
  const STYLE_IMPL = { elegant: ELEGANT, modern: MODERN, vogue: VOGUE, lookbook: LOOKBOOK, noir: NOIR, swiss: SWISS, pinboard: PINBOARD, dossier: DOSSIER, poster: POSTER, atelier: ATELIER, gazette: GAZETTE };

  // The running foot of a page, whichever style draws it. `o.ink` and `o.soft`
  // colour it on a coloured page; `o.side` puts Vogue's band on a chosen edge.
  function pageFoot(book, page, P, W, H, n, credit = "", o = {}) {
    const st = styleKey(book);
    if (st === "elegant") return ELEGANT.foot(page, P, W, H, n);
    if (st === "lookbook") return LOOKBOOK.foot(page, P, W, H, n, credit);
    if (st === "vogue") return VOGUE.foot(page, P, W, H, n, credit, o.side);
    if (st === "modern") return MODERN.foot(page, P, W, H, n, credit, o.ink, o.soft);
    return STYLE_IMPL[st].foot(page, P, W, H, n, credit, o);
  }
  // A photograph on a page the styles share, shown the way the style shows them.
  function stylePhoto(page, P, D, img, shot, x, y, w, h, seed = 0) {
    if (D.deco) return decoPhoto(page, P, D.deco, img, shot, x, y, w, h, D.whole ? "fit" : "crop", seed);
    if (D.whole) { const r = fitPhoto(page, img, shot, x, y, w, h); if (D.frame && photoRule(P)) frame(page, r.x, r.y, r.w, r.h, P.rule, 0.2); return r; }
    return drawPhoto(page, img, shot, x, y, w, h);
  }

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
    const S = STYLE_IMPL[styleKey(book)], D = TR(styleKey(book));
    const M = S.margins(W > H ? "landscape" : "portrait");
    const x = Math.max(M.side, 20), maxW = Math.min(W - 2 * x, 150);
    if (entry.type === "divider") {
      // A chapter card: in most styles the colour as the whole ground.
      const V = D.divider, G0 = onGround(P, V.ground);
      rect(page, 0, 0, W, H, G0.ground);
      const on = G0.ink;
      if (S.dividerDeco) await S.dividerDeco(page, book, entry, P, W, H, n);
      // Measured exactly as it is drawn: Vogue and Modern set it in capitals,
      // which are far wider than the lower case it was typed in.
      const shown = V.caps ? (entry.heading || "Selected work").toUpperCase() : (entry.heading || "Selected work");
      const spacing = V.sp;
      const HT = textFormat(entry.style, "heading", { w: V.w, f: V.f, it: !!V.it }, P, on, V.align || "left");
      const LT = textFormat(entry.style, "line", { w: 400, f: V.lineF || F.sans, it: !!V.lineIt }, P, on, V.align || "left");
      const tw = W - 40;
      const t = fitLines(page, shown, tw, 2, HT.spec.w, V.size * HT.scale, 12 * HT.scale, HT.spec.f, spacing, !!HT.spec.it, null);
      if (t.cut) reportCut(page, "heading", "chapter heading");
      const lead = t.size * (V.lead || 1.05);
      // In the middle of the page, or (a style's choice) low on it, clear of the foot.
      const top = V.at === "low" ? H - 40 - (t.size * 0.5 + 10 + 3 * 6.4 * LT.scale) - (t.lines.length - 1) * lead : H / 2 - (t.lines.length - 1) * lead / 2;
      font(page, HT.spec.w, t.size, HT.spec.f, spacing, !!HT.spec.it);
      if (skipNow !== "heading") t.lines.forEach((l, i) => text(page, l, HT.at(20, tw), top + i * lead, HT.color, HT.align));
      noteText(page, "heading", 20, top - t.size * 0.86, tw, (t.lines.length - 1) * lead + t.size * 1.16, { ...typeOf(HT, t.size, lead, spacing), caps: !!V.caps });
      const after = top + (t.lines.length - 1) * lead;
      noteText(page, "line", 20, after + t.size * 0.5 + 10 - 4.2 * LT.scale * 0.86, tw, 3 * 6.4 * LT.scale + 4.2 * LT.scale * 1.2, typeOf(LT, 4.2 * LT.scale, 6.4 * LT.scale));
      if (V.rule) rect(page, HT.align === "center" && V.align === "center" ? W / 2 - V.rule[0] / 2 : 20, after + 8, V.rule[0], V.rule[1], V.ruleInk ? on : P.accent);
      if (entry.line) {
        font(page, LT.spec.w, 4.2 * LT.scale, LT.spec.f, 0, !!LT.spec.it);
        const lines = wrap(page, entry.line, maxW);
        if (lines.length > 4) reportCut(page, "line", "line under the heading");
        // A style that centres its chapter page centres this on the page, not on the column.
        const lx = V.align === "center" ? (W - maxW) / 2 : 20;
        if (skipNow !== "line") lines.slice(0, 4).forEach((l, i) => text(page, i === 3 && lines.length > 4 ? ellipsize(page, `${l} …`, maxW) : (i === 3 ? ellipsize(page, l, maxW) : l), LT.at(lx, maxW), after + t.size * 0.5 + 10 + i * 6.4 * LT.scale, LT.color, LT.align));
      }
      if (V.foot) pageFoot(book, page, P, W, H, n, "", { ink: on, soft: on, divider: true });
      return;
    }
    S.ground(page, P, W, H);
    let y = M.top + 22;
    const floor = H - Math.max(M.bottom, 18) - 6;   // nothing below this: the foot lives there
    const lineOf = (v, fallback) => ((typeof v === "string" && v.trim()) ? v : fallback);
    const labelGap = D.labelGap || 10;   // a tall heading pushes its small label higher
    if (entry.type === "about") {
      S.label(page, lineOf(entry.label, "About the studio"), x, y - labelGap, P);
      y = S.heading(page, lineOf(entry.heading, "Not just photos, a perspective"), x, y, P, maxW);
      // The About words take the studio's own font, colour, size and
      // alignment, and each paragraph may differ.
      const aBase = { w: D.about.w, f: D.about.f || F.sans, size: D.about.size, lead: D.about.lead };
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
      S.label(page, lineOf(entry.label, "What I shoot"), x, y - labelGap, P);
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
          font(page, D.itemTitle.w, D.itemTitle.size || 5.4, D.itemTitle.f, D.itemTitle.sp || 0, !!D.itemTitle.it);
          text(page, ellipsize(page, D.itemTitle.caps ? String(e.v.title || "").toUpperCase() : (e.v.title || ""), colW), cx, cy + 7, P.ink);
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
      S.label(page, lineOf(entry.label, "Let's make something"), x, y - labelGap, P);
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
        font(page, D.contactValue.w, D.contactValue.size || 5.0, D.contactValue.f, 0, !!D.contactValue.it);
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
    pageFoot(book, page, P, W, H, n, "");
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
  const WRITING = { story: "Story", note: "About a photo", quote: "Quote", letter: "Letter", feature: "Zig-zag", article: "Story with a full-page photo", ways: "Ways we work", process: "How a shoot runs", more: "Story continued", contents: "Contents" };

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
    },
    lookbook: {
      kicker: { w: 500, size: 2.3, f: F.geo, sp: 0.9, caps: true, color: "soft" },
      rule: { w: 16, h: 0.5 },
      body: { w: 300, size: 3.5, f: F.sans, lead: 5.8 },
      drop: null,
      storyHead: { w: 300, f: F.sans, caps: false, start: 9, min: 6.5, lead: 1.15 },
      storyIntro: { w: 400, f: F.sans, start: 4.2, min: 3.9, lead: 6.2, color: "soft" },
      noteTitle: { w: 300, f: F.sans, caps: false, start: 6.5, min: 5, lead: 1.15 },
      quote: { w: 300, f: F.sans, lead: 1.3 }, quoteAlign: "left",
      quoteName: { w: 500, size: 3.6, f: F.sans },
      quoteRole: { w: 500, size: 2.4, f: F.geo, sp: 0.8, caps: true },
      letterHead: { w: 300, f: F.sans, caps: false, start: 9, min: 6.5, lead: 1.15 },
      letterBody: { w: 300, size: 3.8, f: F.sans, lead: 6.2 },
      sign: { w: 400, size: 4.6, f: F.serif, it: true },
      signLine: { w: 500, size: 2.4, f: F.geo, sp: 0.8, caps: true },
      featureSub: { w: 500, f: F.sans, caps: false, start: 4.8, min: 4.2, lead: 1.15, color: "ink" },
      smallLabel: { w: 500, size: 2.1, f: F.geo, sp: 0.8, caps: true },
      wayName: { w: 300, f: F.sans, start: 5.4, min: 4.4, lead: 1.15 },
      wayFor: { w: 400, f: F.sans, size: 3.4, lead: 4.8, color: "soft" },
      stepTitle: { w: 500, f: F.sans, start: 4.8, min: 4.2, lead: 1.15 },
      workNote: { w: 300, f: F.sans, size: 3.7, lead: 6.0 }
    },
    /* The seven after. Every size here was set against the widest and tallest
       of the first four, so words that fit in those fit in these: a headline
       no wider than Modern's capitals and no taller a line than Elegant's,
       body text no wider than Inter at 3.6 mm on the same 5.8 mm line.
       `quoteMark` is the face of the opening mark, `quoteScale` sets a wide
       face's quote smaller, `rule.kind` is the ornament under a heading. */
    noir: {
      kicker: { w: 500, size: 2.5, f: F.jost, sp: 1.4, caps: true, color: "accentText" },
      rule: { w: 34, h: 0.3 },
      body: { w: 400, size: 3.8, f: F.jost, lead: 5.8 },
      drop: null,
      storyHead: { w: 300, f: F.jost, sp: 0.6, caps: true, start: 8.5, min: 6, lead: 1.22 },
      storyIntro: { w: 300, f: F.jost, start: 4.4, min: 4.0, lead: 6.4, color: "soft" },
      noteTitle: { w: 300, f: F.jost, sp: 0.5, caps: true, start: 6.5, min: 5, lead: 1.2 },
      quote: { w: 300, f: F.jost, lead: 1.3 }, quoteAlign: "center", quoteMark: { w: 300, f: F.jost },
      quoteName: { w: 500, size: 2.9, f: F.jost, sp: 1.2, caps: true },
      quoteRole: { w: 400, size: 3.2, f: F.jost },
      letterHead: { w: 300, f: F.jost, sp: 0.6, caps: true, start: 9, min: 6, lead: 1.2 },
      letterBody: { w: 400, size: 3.9, f: F.jost, lead: 6.1 },
      sign: { w: 300, size: 5.0, f: F.jost },
      signLine: { w: 500, size: 2.5, f: F.jost, sp: 1.0, caps: true },
      featureSub: { w: 400, f: F.jost, sp: 0.5, caps: true, start: 4.4, min: 3.8, lead: 1.2, color: "ink" },
      smallLabel: { w: 500, size: 2.2, f: F.jost, sp: 0.8, caps: true },
      wayName: { w: 300, f: F.jost, sp: 0.4, caps: true, start: 5.2, min: 4.2, lead: 1.2 },
      wayFor: { w: 400, f: F.jost, size: 3.5, lead: 4.8, color: "soft" },
      stepTitle: { w: 400, f: F.jost, sp: 0.3, caps: true, start: 4.6, min: 4.0, lead: 1.18 },
      workNote: { w: 400, f: F.jost, size: 3.9, lead: 6.0 }
    },
    swiss: {
      kicker: { w: 600, size: 2.6, f: F.sans, sp: 0.1, caps: false, color: "ink" },
      rule: { w: 3.2, h: 3.2 },
      body: { w: 400, size: 3.6, f: F.sans, lead: 5.8 },
      drop: null,
      storyHead: { w: 700, f: F.sans, sp: -0.35, caps: false, start: 10, min: 7, lead: 1.06 },
      storyIntro: { w: 500, f: F.sans, start: 4.2, min: 3.9, lead: 6.2, color: "ink" },
      noteTitle: { w: 700, f: F.sans, sp: -0.25, caps: false, start: 7, min: 5.2, lead: 1.08 },
      quote: { w: 600, f: F.sans, sp: -0.2, lead: 1.18 }, quoteAlign: "left", quoteMark: { w: 700, f: F.sans },
      quoteName: { w: 600, size: 3.6, f: F.sans },
      quoteRole: { w: 400, size: 3.2, f: F.sans },
      letterHead: { w: 700, f: F.sans, sp: -0.35, caps: false, start: 10, min: 6.5, lead: 1.06 },
      letterBody: { w: 400, size: 3.8, f: F.sans, lead: 6.1 },
      sign: { w: 600, size: 4.0, f: F.sans },
      signLine: { w: 400, size: 2.8, f: F.sans },
      featureSub: { w: 700, f: F.sans, sp: -0.1, caps: false, start: 4.8, min: 4.2, lead: 1.1, color: "ink" },
      smallLabel: { w: 600, size: 2.2, f: F.sans, sp: 0.2, caps: true },
      wayName: { w: 700, f: F.sans, sp: -0.2, start: 5.4, min: 4.4, lead: 1.1 },
      wayFor: { w: 400, f: F.sans, size: 3.4, lead: 4.8, color: "soft" },
      stepTitle: { w: 700, f: F.sans, sp: -0.15, start: 4.8, min: 4.2, lead: 1.14 },
      workNote: { w: 500, f: F.sans, size: 3.8, lead: 6.0 }
    },
    pinboard: {
      kicker: { w: 500, size: 2.4, f: F.plex, sp: 0.4, caps: true, color: "soft" },
      rule: { w: 24, h: 0.5, kind: "wave" },
      body: { w: 400, size: 3.6, f: F.sans, lead: 5.8 },
      drop: null,
      storyHead: { w: 700, f: F.hand, caps: false, start: 11.8, min: 9, lead: 1.0 },
      storyIntro: { w: 500, f: F.hand, start: 5.8, min: 5.2, lead: 6.6, color: "soft" },
      noteTitle: { w: 700, f: F.hand, caps: false, start: 9.4, min: 7, lead: 1.0 },
      quote: { w: 600, f: F.hand, lead: 1.08 }, quoteAlign: "left", quoteMark: { w: 700, f: F.hand },
      quoteName: { w: 700, size: 5.6, f: F.hand },
      quoteRole: { w: 500, size: 2.4, f: F.plex, sp: 0.4, caps: true },
      letterHead: { w: 700, f: F.hand, caps: false, start: 12.6, min: 9, lead: 1.0 },
      letterBody: { w: 400, size: 3.8, f: F.sans, lead: 6.1 },
      sign: { w: 700, size: 7.5, f: F.hand },
      signLine: { w: 500, size: 2.4, f: F.plex, sp: 0.4, caps: true },
      featureSub: { w: 700, f: F.hand, caps: false, start: 6.6, min: 5.8, lead: 1.0, color: "ink" },
      smallLabel: { w: 500, size: 2.1, f: F.plex, sp: 0.4, caps: true },
      wayName: { w: 700, f: F.hand, start: 7.6, min: 6.2, lead: 1.0 },
      wayFor: { w: 500, f: F.hand, size: 4.6, lead: 5.0, color: "soft" },
      stepTitle: { w: 700, f: F.hand, start: 6.6, min: 5.8, lead: 1.0 },
      workNote: { w: 400, f: F.sans, size: 3.8, lead: 6.0 }
    },
    dossier: {
      kicker: { w: 500, size: 2.4, f: F.plex, sp: 0.5, caps: true, color: "accentText" },
      rule: { w: 22, h: 0.4, kind: "dash" },
      body: { w: 400, size: 3.6, f: F.sans, lead: 5.8 },
      drop: null,
      storyHead: { w: 500, f: F.plex, caps: true, start: 7.4, min: 5.4, lead: 1.2 },
      storyIntro: { w: 400, f: F.plex, start: 3.3, min: 3.1, lead: 5.6, color: "soft" },
      noteTitle: { w: 500, f: F.plex, caps: true, start: 5.4, min: 4.2, lead: 1.2 },
      quote: { w: 400, f: F.plex, lead: 1.35 }, quoteAlign: "left", quoteMark: { w: 400, f: F.plex }, quoteScale: 0.76,
      quoteName: { w: 600, size: 3.0, f: F.plex, sp: 0.4, caps: true },
      quoteRole: { w: 400, size: 2.6, f: F.plex },
      letterHead: { w: 500, f: F.plex, caps: true, start: 7.4, min: 5.2, lead: 1.2 },
      letterBody: { w: 400, size: 3.8, f: F.sans, lead: 6.1 },
      sign: { w: 500, size: 3.8, f: F.plex },
      signLine: { w: 500, size: 2.4, f: F.plex, sp: 0.5, caps: true },
      featureSub: { w: 600, f: F.plex, caps: true, start: 3.8, min: 3.4, lead: 1.25, color: "ink" },
      smallLabel: { w: 500, size: 2.1, f: F.plex, sp: 0.4, caps: true },
      wayName: { w: 600, f: F.plex, caps: true, start: 4.4, min: 3.6, lead: 1.22 },
      wayFor: { w: 400, f: F.plex, size: 2.6, lead: 4.6, color: "soft" },
      stepTitle: { w: 600, f: F.plex, caps: true, start: 3.9, min: 3.4, lead: 1.2 },
      workNote: { w: 400, f: F.sans, size: 3.8, lead: 6.0 }
    },
    poster: {
      kicker: { w: 700, size: 2.5, f: F.sans, sp: 0.5, caps: true, color: "accentText" },
      rule: { w: 16, h: 2.2 },
      body: { w: 400, size: 3.6, f: F.sans, lead: 5.8 },
      drop: null,
      storyHead: { w: 400, f: F.poster, sp: 0.15, caps: true, start: 11.5, min: 8.6, lead: 1.02 },
      storyIntro: { w: 600, f: F.sans, start: 4.1, min: 3.8, lead: 6.2, color: "ink" },
      noteTitle: { w: 400, f: F.poster, sp: 0.1, caps: true, start: 8.5, min: 6.4, lead: 1.04 },
      quote: { w: 400, f: F.poster, sp: 0.1, lead: 1.14 }, quoteAlign: "left", quoteMark: { w: 400, f: F.poster },
      quoteName: { w: 700, size: 3.2, f: F.sans, sp: 0.4, caps: true },
      quoteRole: { w: 400, size: 3.2, f: F.sans },
      letterHead: { w: 400, f: F.poster, sp: 0.15, caps: true, start: 12, min: 8, lead: 1.02 },
      letterBody: { w: 400, size: 3.8, f: F.sans, lead: 6.1 },
      sign: { w: 400, size: 6, f: F.poster },
      signLine: { w: 700, size: 2.4, f: F.sans, sp: 0.5, caps: true },
      featureSub: { w: 400, f: F.poster, sp: 0.1, caps: true, start: 6, min: 5.2, lead: 1.06, color: "ink" },
      smallLabel: { w: 700, size: 2.1, f: F.sans, sp: 0.4, caps: true },
      wayName: { w: 400, f: F.poster, sp: 0.1, caps: true, start: 7, min: 5.6, lead: 1.06 },
      wayFor: { w: 500, f: F.sans, size: 3.3, lead: 4.8, color: "soft" },
      stepTitle: { w: 400, f: F.poster, sp: 0.1, caps: true, start: 6, min: 5.2, lead: 1.08 },
      workNote: { w: 500, f: F.sans, size: 3.8, lead: 6.0 }
    },
    atelier: {
      kicker: { w: 500, size: 2.3, f: F.geo, sp: 1.3, caps: true, color: "accentText" },
      rule: { w: 26, h: 0.3, kind: "diamond" },
      body: { w: 500, size: 4.2, f: F.cormorant, lead: 5.8 },
      drop: "accentText",
      storyHead: { w: 500, f: F.cormorant, it: true, caps: false, start: 11.5, min: 8, lead: 1.02 },
      storyIntro: { w: 500, f: F.cormorant, it: true, start: 5.1, min: 4.7, lead: 6.6, color: "soft" },
      noteTitle: { w: 500, f: F.cormorant, it: true, caps: false, start: 8.4, min: 6, lead: 1.05 },
      quote: { w: 400, f: F.cormorant, it: true, lead: 1.15 }, quoteAlign: "center", quoteMark: { w: 400, f: F.cormorant },
      quoteName: { w: 600, size: 2.7, f: F.geo, sp: 1.2, caps: true },
      quoteRole: { w: 500, size: 4, f: F.cormorant, it: true },
      letterHead: { w: 500, f: F.cormorant, it: true, caps: false, start: 12, min: 8, lead: 1.04 },
      letterBody: { w: 500, size: 4.4, f: F.cormorant, lead: 6.3 },
      sign: { w: 500, size: 6.4, f: F.cormorant, it: true },
      signLine: { w: 500, size: 2.3, f: F.geo, sp: 1.2, caps: true },
      featureSub: { w: 600, f: F.cormorant, caps: false, start: 5.8, min: 5, lead: 1.08, color: "ink" },
      smallLabel: { w: 500, size: 2.1, f: F.geo, sp: 0.9, caps: true },
      wayName: { w: 500, f: F.cormorant, it: true, start: 6.8, min: 5.4, lead: 1.06 },
      wayFor: { w: 500, f: F.cormorant, it: true, size: 4.0, lead: 5.0, color: "soft" },
      stepTitle: { w: 600, f: F.cormorant, start: 5.8, min: 5, lead: 1.08 },
      num: { w: 300, f: F.serif },   // Cormorant's own figures are old-style: a 3 would hang into the line below
      workNote: { w: 500, f: F.cormorant, size: 4.4, lead: 6.0 }
    },
    gazette: {
      kicker: { w: 600, size: 2.3, f: F.sans, sp: 0.6, caps: true, color: "accentText" },
      rule: { w: 26, h: 0.6, kind: "double" },
      body: { w: 400, size: 3.7, f: F.news, lead: 5.8 },
      drop: "ink",
      storyHead: { w: 800, f: F.playfair, caps: false, start: 10.2, min: 7.4, lead: 1.1 },
      storyIntro: { w: 400, f: F.news, it: true, start: 4.5, min: 4.1, lead: 6.4, color: "ink" },
      noteTitle: { w: 800, f: F.playfair, caps: false, start: 7.2, min: 5.4, lead: 1.12 },
      quote: { w: 500, f: F.playfair, it: true, lead: 1.22 }, quoteAlign: "left", quoteMark: { w: 800, f: F.playfair },
      quoteName: { w: 700, size: 3.6, f: F.playfair },
      quoteRole: { w: 600, size: 2.3, f: F.sans, sp: 0.6, caps: true },
      letterHead: { w: 800, f: F.playfair, caps: false, start: 10.5, min: 7, lead: 1.1 },
      letterBody: { w: 400, size: 3.9, f: F.news, lead: 6.1 },
      sign: { w: 500, size: 5.2, f: F.playfair, it: true },
      signLine: { w: 600, size: 2.3, f: F.sans, sp: 0.6, caps: true },
      featureSub: { w: 700, f: F.playfair, caps: false, start: 5.2, min: 4.5, lead: 1.12, color: "ink" },
      smallLabel: { w: 600, size: 2.1, f: F.sans, sp: 0.5, caps: true },
      wayName: { w: 800, f: F.playfair, start: 5.8, min: 4.7, lead: 1.12 },
      wayFor: { w: 400, f: F.news, it: true, size: 3.5, lead: 4.8, color: "soft" },
      stepTitle: { w: 700, f: F.playfair, start: 5.0, min: 4.3, lead: 1.14 },
      workNote: { w: 400, f: F.news, size: 3.9, lead: 6.0 }
    }
  };
  const DETAIL_TYPE = { w: 400, f: F.sans };
  // Caption on a photos page, per style: start size and the smallest it goes.
  const CAPTION_TYPE = {
    elegant: { w: 400, f: F.serif, it: true, start: 3.6, min: 3.2 },
    modern: { w: 400, f: F.sans, start: 3.2, min: 2.8 },
    vogue: { w: 500, f: F.geo, start: 3.0, min: 2.6 },
    lookbook: { w: 400, f: F.geo, start: 2.8, min: 2.5 },
    noir: { w: 400, f: F.jost, sp: 0.3, start: 3.2, min: 2.8 },
    swiss: { w: 500, f: F.sans, start: 3.1, min: 3.1 },
    pinboard: { w: 500, f: F.hand, start: 5.2, min: 4.2 },
    dossier: { w: 400, f: F.plex, start: 2.7, min: 2.3 },
    poster: { w: 600, f: F.sans, start: 3.2, min: 2.8 },
    atelier: { w: 500, f: F.cormorant, it: true, start: 4.2, min: 3.6 },
    gazette: { w: 400, f: F.news, it: true, start: 3.5, min: 3.1 }
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
    "intro": "Some shoots arrive with a plan, some with a goal, some with a collection or a portfolio to build. We work all four ways, and like the ones we shape together best.",
    "items": [
      {
        "name": "You've planned it, we shoot it",
        "forWho": "For a brand or designer with a clear brief, mood board and shot list.",
        "text": "You send the plan; we light it, shoot it and deliver it, directing on set and retouching the frames you choose.",
        "lead": "you"
      },
      {
        "name": "You bring the goal, we bring the idea",
        "forWho": "You tell us what the pictures are for.",
        "text": "We come back with a concept, the looks and a shot list, and shape it with you before the day; then we shoot the plan we agreed.",
        "lead": "together",
        "liked": true
      },
      {
        "name": "You bring the garments, we do the rest",
        "forWho": "A designer with a collection, or a model who wants a portfolio.",
        "text": "We plan the looks, the light, the poses and the pace, check the plan with you, and direct the shoot on the day.",
        "lead": "studio"
      },
      {
        "name": "A test shoot",
        "forWho": "By invitation, for models and athletes. No fee.",
        "text": "We propose an idea, you react, and it grows on the day; everyone leaves with new portfolio pictures.",
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
  // Faces only a style is set in. They are not in the studio's menu, and load
  // the first time a book in that style is drawn, like the menu's own.
  const STYLE_FACES = [
    { key: "st-inter", family: F.sans, weights: [700, 800], css: "Inter:wght@700;800" },
    { key: "st-caveat", family: F.hand, range: [400, 700], css: "Caveat:wght@400..700" },
    { key: "st-anton", family: F.poster, weights: [400], css: "Anton" },
    { key: "st-newsreader", family: F.news, range: [300, 700], css: "Newsreader:ital,wght@0,300..700;1,300..700" }
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
  /* ---------- text styles: one look per kind of text, for the whole book --------
     A magazine is set in a handful of named styles — headlines, the intro under
     them, body text, small labels, quotes, captions — and changing one changes
     every text of that kind. `book.typeset[role]` holds the same formatting a
     single text can have (font, colour, size, weight, italic, alignment); a
     text's own formatting still wins over it, field by field. */
  const TYPE_ROLES = [
    ["head", "Headlines", "Headlines, titles and headings, the cover's title too"],
    ["intro", "Intro lines", "The line under a headline, a chapter's line, the cover's subtitle"],
    ["body", "Body text", "Stories, letters, the words about a photo, About"],
    ["label", "Small labels", "Kickers, roles and the other small capitals"],
    ["quote", "Quotes", "Quote pages and quotes on an Anything page"],
    ["caption", "Captions", "The words under photographs"]
  ];
  const ROLE_OF = {
    headline: "head", title: "head", heading: "head", sub1: "head", sub2: "head",
    intro: "intro", line: "intro", subtitle: "intro",
    body: "body", note: "body", text: "body", about: "body", text1: "body", text2: "body",
    kicker: "label", role: "label", signLine: "label", detail: "label", label: "label",
    quote: "quote", caption: "caption"
  };
  const roleOfField = (field) => ROLE_OF[field] || (/^(name|title)\d$/.test(field) ? "head" : /^(text|forWho)\d$/.test(field) ? "body" : null);
  // An Anything page's box of words names its kind itself.
  const FREE_ROLE = { head: "head", intro: "intro", kicker: "label", quote: "quote", body: "body" };
  // The book whose text styles apply: the one named, else the one being drawn.
  const typesetOf = (book) => { const b = book || bookNow; return (b && b.typeset && typeof b.typeset === "object") ? b.typeset : null; };
  // The role's formatting underneath, the text's own on top (its paragraphs kept).
  function mergeFmt(base, own) {
    if (!base) return own || {};
    if (!own) return base;
    return { ...base, ...own };
  }
  /* The baseline grid: every column of body text starts on a line of one grid
     running down the page at the style's body leading, so lines of text sit
     level across columns and across facing pages, as in a magazine. A column
     only ever moves down, by less than one line. */
  const snapCols = (cols, lead) => (lead > 0 ? cols.map((c) => ({ ...c, top: Math.ceil(c.top / lead - 1e-6) * lead })) : cols);
  const withRole = (field, own, book) => { const ts = typesetOf(book), r = roleOfField(field); return mergeFmt(ts && r ? ts[r] : null, own); };

  // Formatting for a text on a page the plan engine doesn't lay out (the cover,
  // a chapter page, the About page). Gives the spec to draw with, the size
  // scale, the colour, and where to put a line inside its column.
  function textFormat(where, key, spec, P, color, align = "left") {
    const f = withRole(key, where && where[key]);
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
    const font = fontByKey(key) || STYLE_FACES.find((f) => f.key === key);
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
        const ws = new Set([300, 400, 500, 600, 700, 800, 900].map((w) => weightFor(font, w, false)));
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
    take(book && book.typeset);
    for (const pg of (book && book.pages) || []) take(pg && pg.style);
    return [...keys];
  }
  // The faces a book needs: those its words were given, and those its style is set in.
  const ensureBookFonts = (book) => Promise.all([...bookFontKeys(book), ...(TR(book && book.style).fonts || [])].map(loadFont));
  const ensureStyleFonts = () => Promise.all(Object.values(TRAITS).flatMap((t) => t.fonts || []).map(loadFont));

  /* The print file's own writer (real type, bleed, crop marks) lives in
     book-print.js, fetched the first time a PDF is made, at the site's ?v=. */
  let printLoad = null;
  function loadPrint() {
    if (window.BookPrint) return Promise.resolve(window.BookPrint);
    if (!printLoad) {
      printLoad = new Promise((resolve) => {
        const s = document.createElement("script");
        const v = (document.querySelector('script[src*="app.js?v="]')?.getAttribute("src") || "").split("v=")[1] || "";
        s.src = `/book-print.js${v ? `?v=${v}` : ""}`;
        s.onload = () => resolve(window.BookPrint || null);
        s.onerror = () => { printLoad = null; resolve(null); };
        document.head.appendChild(s);
      });
    }
    return printLoad;
  }

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
  // keepEnd: the words go on on a later page, so a full last line is not
  // shortened to end in "…" and every word on it counts as printed.
  function flowBody(page, s, cols, spec, dropColor, specFor, keepEnd = false) {
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
      if (cut && lines.length && !keepEnd) {
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
    // (a continuation page never opens with a drop cap: it is mid-story)
    return run(false);
  }

  // A photos page's one caption, measured like the writing pages.
  function captionFit(entry, width, spec, align = "left") {
    if (!entry || !oneParagraph(entry.caption).length) return null;
    const f = withRole("caption", entry.style && entry.style.caption);
    const styled = styledSpec(spec, f);
    const sc = sizeScale(f);
    const r = fitBlock(measurer(), entry.caption, width, 1, styled, spec.start * sc, spec.min * sc, false);
    return { ...r, spec: styled, color: f.color, align: f.align === "center" || f.align === "right" || f.align === "left" ? f.align : align, width };
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
  const bandColors = (style, P) => { const b = TR(style).bands; return b === "white" ? { band: P.white, on: P.ink } : b === "paper" ? { band: P.paper, on: P.ink } : { band: P.deep, on: P.onDeep }; };
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
  const boxFor = (type, st, L, at) => BOXES[type][L ? "L" : "P"][at][TR(st).boxes];

  // The short rule under a heading, as operations: a plain bar in most styles,
  // or the style's own ornament.
  function ruleOps(R, x, y, c) {
    const kind = R.kind || "bar";
    if (kind === "double") return [{ k: "rect", x, y: y - 0.8, w: R.w, h: 0.6, c }, { k: "rect", x, y: y + 0.35, w: R.w, h: 0.2, c }];
    if (kind === "diamond") return [{ k: "path", shape: "diamond", corner: 0, x, y: y - 1.1, w: 2.2, h: 2.2, c }, { k: "rect", x: x + 3.6, y: y - 0.1, w: Math.max(0, R.w - 3.6), h: 0.2, c }];
    if (kind === "dash") return Array.from({ length: Math.max(1, Math.floor((R.w + 1.4) / 4.4)) }, (_, i) => ({ k: "rect", x: x + i * 4.4, y: y - R.h / 2, w: 3, h: R.h, c }));
    if (kind === "wave") return [{ k: "stroke", pts: Array.from({ length: 25 }, (_, i) => [x + (i / 24) * R.w, y + Math.sin((i / 24) * Math.PI * 5) * 0.9]), w: R.h, c }];
    return [{ k: "rect", x, y: y - R.h / 2, w: R.w, h: R.h, c }];
  }
  function paintOps(page, ops) {
    for (const o of ops) {
      if (o.k === "rect") rect(page, o.x, o.y, o.w, o.h, o.c);
      else if (o.k === "path") { tracePath(page.ctx, o.shape, page.u(o.x), page.u(o.y), page.u(o.w), page.u(o.h), o.corner); page.ctx.fillStyle = o.c; page.ctx.fill(); }
      else if (o.k === "stroke") strokeOp(page, o);
    }
  }

  // The plan for one writing page: drawing operations in mm, the cuts, and
  // for the editor, how each field fared. Laid out on the A4 frame, then
  // placed on the book's paper.
  /* ---------- a story over several pages ---------------------------------------
     A "Story continued" page (type "more") has no words of its own: it takes
     the words that did not fit on the story, letter, article or note before
     it (and on any continued pages between), and a story followed by one no
     longer ends in "…". */
  const CONT_SOURCES = ["story", "article", "letter"];
  const contField = (pg) => (pg && pg.type === "note" ? "note" : "body");
  const firstPageNo = (book, i) => { let n = 1; for (let k = 0; k < i; k++) n += pageSpan(book.pages[k]); return n + 1; };
  const continues = (book, entry) => { const i = book.pages.indexOf(entry); const nx = i >= 0 ? book.pages[i + 1] : null; return !!nx && nx.type === "more"; };
  function restAfter(text, printed) {
    const paras = paragraphs(text);
    let skip = printed, po = 0;
    while (po < paras.length && skip >= paras[po].length) { skip -= paras[po].length; po++; }
    if (po >= paras.length) return { text: "", paraOffset: po };
    const rest = [paras[po].slice(skip), ...paras.slice(po + 1)].filter((x) => x.length);
    return { text: rest.map((x) => x.join(" ")).join("\n"), paraOffset: po };
  }
  /* ---------- the contents page -----------------------------------------------
     Every page with a title, at the page number it will print on: chapters
     as sections, stories, letters, notes, looks and the studio pages under
     them. Worked out afresh every time, so it is never out of date. */
  function contentsItems(book) {
    const one = (v) => oneParagraph(v).join(" ").trim();
    const out = [];
    let n = 1, looks = 0;
    book.pages.forEach((pg) => {
      const first = n + 1; n += pageSpan(pg);
      if (!pg) return;
      if (pg.type === "look") looks++;
      let t = "";
      if (pg.type === "divider") t = one(pg.heading);
      else if (pg.type === "story" || pg.type === "article" || pg.type === "feature") t = one(pg.headline) || one(pg.sub1);
      else if (pg.type === "letter") t = one(pg.heading);
      else if (pg.type === "note") t = one(pg.title);
      else if (pg.type === "look") t = one(pg.title) || `Look ${String(looks).padStart(2, "0")}`;
      else if (pg.type === "about") t = one(pg.heading) || "About the studio";
      else if (pg.type === "services") t = one(pg.heading) || "What I shoot";
      else if (pg.type === "contact") t = one(pg.heading) || "Contact";
      else if (pg.type === "ways") t = one(pg.heading) || "Ways we work";
      else if (pg.type === "process") t = one(pg.heading) || "How a shoot runs";
      else if (pg.type === "free") { const h = freeBlocks(pg).find((b) => b && b.k === "text" && b.role === "head" && one(b.t)); t = h ? one(h.t) : ""; }
      if (t) out.push({ n: first, title: t, section: pg.type === "divider" });
    });
    return out;
  }
  function contOf(book, i) {
    let j = i - 1;
    while (j >= 0 && book.pages[j] && book.pages[j].type === "more") j--;
    const src = book.pages[j];
    const fromN = i > 0 ? firstPageNo(book, i - 1) + pageSpan(book.pages[i - 1]) - 1 : 0;
    if (!src || !CONT_SOURCES.includes(src.type)) return { src: null, text: "", paraOffset: 0, fromN };
    const field = contField(src);
    const full = String(src[field] || "");
    const f0 = planWriting(book, src).fields[field];
    let printed = f0 && typeof f0.printed === "number" ? f0.printed : 0;
    let rest = restAfter(full, printed);
    for (let k = j + 1; k < i && rest.text; k++) {
      const fk = planWriting(book, book.pages[k], { cont: { src, ...rest, fromN: 0 } }).fields.body;
      printed += fk && typeof fk.printed === "number" ? fk.printed : 0;
      rest = restAfter(full, printed);
    }
    return { src, ...rest, fromN };
  }
  function planWriting(book, entry, opts = {}) {
    if (entry.type === "more" && !opts.cont) opts = { ...opts, cont: contOf(book, book.pages.indexOf(entry)) };
    const contNow = entry.type === "more" ? opts.cont : null;
    const G = geometry(book);
    const st = styleKey(book), D = TR(st);
    const T = WTYPE[st];
    const P = paletteFor(book);
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
    // A continued page is formatted as the story it continues.
    const styleSrc = contNow && contNow.src ? contNow.src : entry;
    const own = (field) => (styleSrc.style && typeof styleSrc.style === "object" && styleSrc.style[contNow ? contField(contNow.src) : field]) || null;
    const paraOff = contNow ? contNow.paraOffset || 0 : 0;
    const goesOn = continues(book, entry);
    const fmt = (field) => withRole(field, own(field), book);
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
          const pf = paraFmt(f, pi + paraOff);
          const sc = sizeScale(pf);
          const base = styledSpec(baseSpec, pf);
          const spec = sc === 1 ? base : { ...base, size: base.size * sc, lead: base.lead * sc };
          made.set(pi, { spec, lead: spec.lead, color: tintOf(pf.color, P, P.ink), align: ALIGNS.includes(pf.align) ? pf.align : "left", list: pf.list, columns: pf.columns });
        }
        return made.get(pi);
      };
      const one = specFor(0), spec = one.spec, align = one.align;
      // A drop cap belongs to text ranged left or justified, in the style's font.
      const perPara = hasParaFmt(f) || !!f.list || !!f.columns || paraOff > 0;
      // A book-wide body font keeps the drop cap; a font chosen for this text alone doesn't.
      const ownF = own(field) || {};
      if (book.baseline) cols = snapCols(cols, T.body.lead);
      // Only the page's flowing text runs on; a continued page carries its own words.
      const runsOn = goesOn && (contNow ? field === "body" : field === contField(entry));
      const r = flowBody(page, s, cols, spec, dropRole && (align === "left" || align === "justify") && !paraFmt(ownF, 0).font && !f.list && !f.columns ? colour(dropRole) : null, perPara ? specFor : null, runsOn);
      if (runsOn && r.cut) {
        // Not cut: it goes on. Say where, under the last line.
        r.cut = false; r.continued = true;
        const lastCol = cols[cols.length - 1], K = T.kicker;
        const nextN = firstPageNo(book, book.pages.indexOf(entry) + 1);
        font(page, K.w, K.size, K.f, K.sp || 0);
        const word = `${K.caps ? "CONTINUED ON PAGE" : "Continued on page"} ${String(nextN).padStart(2, "0")} →`;
        op({ k: "text", s: word, x: lastCol.x + lastCol.w, y: lastCol.bottom + spec.lead * 1.35, f: [K.w, K.size, K.f, K.sp || 0, false], c: colour(K.color), align: "right" });
      }
      const bx = Math.min(...cols.map((c) => c.x)), by = Math.min(...cols.map((c) => c.top)) - spec.size * 0.86;
      report(field, { kind: "flow", cols: cols.length, empty: !r.total, ...r, lines: undefined, box: { x: bx, y: by, w: Math.max(...cols.map((c) => c.x + c.w)) - bx, h: Math.max(...cols.map((c) => c.bottom)) + spec.size * 0.3 - by }, type: { spec, size: spec.size, lead: spec.lead, color: one.color, align } });
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
    const rule = (x, y, color = P.accent) => ruleOps(T.rule, x, y, color).forEach(op);
    const ground = () => {
      rectOp(0, 0, W, H, pageBgOf(book, entry, P, D.ground === "paper" ? P.paper : P.white));
      if (D.bar) rectOp(0, 0, D.bar, H, P.accent);
    };
    const photo = (box, mode, empty, i = 0) => op({ k: "photo", i, x: box[0], y: box[1], w: box[2], h: box[3], mode, frame: D.frame ? photoRule(P) : null, deco: D.deco || null, seed: entry.type.length * 5 + i * 3, empty });
    const marker = (x, y, color = P.soft) => put(MARKER, x, y, { w: 500, f: F.plex, sp: 0.4 }, 3.2, color, "center");
    // A newspaper's hairline between two columns of words.
    const colRules = (cols) => { if (!D.colRule) return; for (let i = 1; i < cols.length; i++) { const a = cols[i - 1], b = cols[i], mid = (a.x + a.w + b.x) / 2, top = Math.max(a.top, b.top) - 3.4; rectOp(mid - 0.1, top, 0.2, Math.min(a.bottom, b.bottom) - top + 1, P.rule); } };
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
      colRules(cols);
      if (!has("kicker", "headline", "intro", "body")) marker(cols[0].x + cols[0].w / 2, (cols[0].top + cols[0].bottom) / 2);
    }

    if (entry.type === "note") {
      ground();
      const box = boxFor("note", st, L, at);
      const fitMode = !D.noteFit ? "crop" : at === "left" ? "fit-right" : at === "right" ? "fit-left" : "fit";
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
      const solid = !hasPhoto && !!D.quoteSolid;
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
      const qsc = sizeScale(fmt("quote")) * (T.quoteScale || 1);
      zone.start *= qsc; zone.min *= qsc;
      const nameR = has("name") ? fitBlock(page, entry.name, zone.w, 1, NAME, NAME.size, NAME.size, !!NAME.caps) : null;
      const roleR = has("role") ? fitBlock(page, entry.role, zone.w, 1, ROLE, ROLE.size, ROLE.size, !!ROLE.caps) : null;
      const attrH = (nameR || roleR) ? 9 + (nameR ? 8 : 0) + (roleR ? (nameR ? 5.6 : 8) : 0) : 0;
      const heightAt = (r) => (D.quoteChip ? 9 : r.size * 1.1) + 7 + (r.lines.length - 1) * r.size * Q.lead + r.size * 0.72 + attrH;
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
        const markH = D.quoteChip ? 9 : r.size * 1.1;
        const top = zone.top + Math.max(0, (zone.bottom - zone.top - heightAt(r)) / 2);
        // The mark and the rule follow the quote's alignment.
        const markAt = (w) => (qAlign === "center" ? zone.x + (zone.w - w) / 2 : qAlign === "right" ? zone.x + zone.w - w : zone.x);
        if (D.quoteChip) {
          rectOp(markAt(12), top, 12, 9, solid ? P.onAccent : P.accent);
          put("“", markAt(12) + 6, top + 11.2, { w: 800, f: F.heavy }, 11, solid ? P.accent : P.onAccent, "center");
        } else {
          const ms = r.size * 2.2, QM = T.quoteMark || { w: 300, f: F.serif };
          font(page, QM.w, ms, QM.f);
          const m = page.ctx.measureText("“");
          const asc = m.actualBoundingBoxAscent / page.u(1), mw = m.width / page.u(1);
          put("“", qAlign === "center" ? zone.x + zone.w / 2 : qAlign === "right" ? zone.x + zone.w : zone.x - 0.5, top + asc, QM, ms, solid ? P.onAccent : accentText(P), qAlign === "center" ? "center" : qAlign === "right" ? "right" : "left");
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
      const x = L ? 20 : D.letterX, w = L ? 257 : 130;
      const K = L ? 30 : 46;
      kicker(entry.kicker, x, K, w);
      const LH = T.letterHead;
      const hLast = block("heading", entry.heading, x, K + 14, w, 2, LH, LH.start, LH.min, "mul", P.ink);
      rule(x, hLast + 8);
      const top = hLast + 18.5;
      const cols = L ? [{ x: 20, w: 121.5, top, bottom: 184 }, { x: 155.5, w: 121.5, top, bottom: 164 }] : [{ x, w, top, bottom: 244 }];
      body("body", entry.body, cols, T.letterBody, T.drop);
      colRules(cols);
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
          const inset = D.boxes === "e";
          const pw = inset ? 80 : 100;
          if (photoLeft) { pbox = inset ? [20, row.y, 80, row.h] : [0, row.y, pw, row.h]; tx = 112; tw = 78; }
          else { pbox = inset ? [110, row.y, 80, row.h] : [110, row.y, pw, row.h]; tx = 20; tw = 78; }
        } else {
          if (photoLeft) { pbox = D.boxes === "e" ? [20, row.y, 126, row.h] : [0, row.y, 146, row.h]; tx = 158; tw = 119; }
          else { pbox = D.boxes === "e" ? [151, row.y, 126, row.h] : [151, row.y, 146, row.h]; tx = 20; tw = 119; }
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
      WHO_ORDER.forEach((k, i) => rectOp(x + i * 2.6, y - 1.9, 1.9, 1.9, k === who ? (D.tagAccent ? accentText(P) : P.ink) : P.rule));
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
      /* Four ways, each its own block down the page (two by two on a
         landscape page): a number, the name, who leads it in a word, when it
         fits and how it runs. The two the studio likes best carry a mark. */
      ground();
      const items = (Array.isArray(entry.items) ? entry.items : []).slice(0, 4);
      const hb = workHeader();
      const NS = T.wayName, FS = T.wayFor, SL = T.smallLabel;
      const LEAD_WORD = { you: "YOU LEAD", together: "TOGETHER", studio: "WE LEAD" };
      const nameW = L ? 59 : 60;
      // Every name at one size, the smallest any of them needs, so the four read as one page.
      let nameSize = NS.start;
      items.forEach((it) => { const r = fitBlock(page, it && it.name, nameW, 4, NS, NS.start, NS.min, !!NS.caps); nameSize = Math.min(nameSize, r.size); });
      const top0 = hb + 8;
      // Landscape: four columns across the page, each way stacked top to bottom.
      const cells = L
        ? [0, 1, 2, 3].map((i) => ({ x: 20 + i * 66, w: 59, top: top0, h: 184 - top0 }))
        : [0, 1, 2, 3].map((i) => ({ x: 20, w: 170, top: top0 + i * ((275 - top0) / 4), h: (275 - top0) / 4 }));
      items.forEach((it, i) => {
        const c = cells[i]; if (!c) return;
        const r0 = c.top, floor = r0 + c.h - 4;
        hairOp(c.x, r0, c.x + c.w, (L || i === 0) ? P.ink : P.rule);
        const lead = (it && WHO_ORDER.includes(it.lead)) ? it.lead : "together";
        put(String(i + 1).padStart(2, "0"), c.x, r0 + 7.5, SL, SL.size, P.soft);
        if (it && it.liked) { rectOp(c.x, r0, c.w, T.rule.h, P.accent); put("HOW WE LIKE TO WORK", c.x + c.w, r0 + 7.5, SL, SL.size, accentText(P), "right"); }
        const nb = r0 + 17.5;
        const nameLast = block(`name${i + 1}`, it && it.name, c.x, nb, nameW, 4, NS, nameSize, nameSize, "mul", P.ink);
        put(LEAD_WORD[lead], c.x, Math.min(nameLast + 7, floor), SL, SL.size, lead === "together" ? accentText(P) : P.soft);
        if (L) {
          const forLast = block(`forWho${i + 1}`, it && it.forWho, c.x, Math.min(nameLast + 14, floor), c.w, 3, FS, FS.size, FS.size, FS.lead, colour(FS.color));
          body(`text${i + 1}`, it && it.text, [{ x: c.x, w: c.w, top: forLast + 6, bottom: floor }], T.body, null);
        } else {
          const tx = c.x + nameW + 8, tw = c.w - nameW - 8;
          const forLast = block(`forWho${i + 1}`, it && it.forWho, tx, nb, tw, 2, FS, FS.size, FS.size, FS.lead, colour(FS.color));
          body(`text${i + 1}`, it && it.text, [{ x: tx, w: tw, top: forLast + 7, bottom: floor }], T.body, null);
        }
      });
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
      // The steps' numbers are set in the heading's face, unless its figures hang below the line.
      const NUM = { w: (T.num || T.storyHead).w, f: (T.num || T.storyHead).f, sp: D.numSp || 0 };
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

    if (entry.type === "more") {
      ground();
      const c = contNow || { text: "", fromN: 0 };
      const top = L ? 30 : 34, K = T.kicker;
      const label = c.src ? `${K.caps ? "CONTINUED FROM PAGE" : "Continued from page"} ${String(c.fromN).padStart(2, "0")}` : (K.caps ? "CONTINUED" : "Continued");
      put(label, 20, top, K, K.size, colour(K.color));
      rule(20, top + 6);
      const colTop = top + 16, bottom = L ? 184 : 270;
      const n = L ? 3 : 2, gut = 8, cw = ((L ? 257 : 170) - gut * (n - 1)) / n;
      const cols = Array.from({ length: n }, (_, k) => ({ x: 20 + k * (cw + gut), w: cw, top: colTop, bottom }));
      const baseSpec = c.src && c.src.type === "letter" ? T.letterBody : T.body;
      if (c.text) { body("body", c.text, cols, baseSpec, null); colRules(cols); }
      else marker(105, 150);
      // Its words are the story's: they are typed there, not here.
      if (plan.fields.body) plan.fields.body = { ...plan.fields.body, box: null, readOnly: true };
      if (!c.src) plan.cuts.push({ field: "body", label: "a story, letter or note just before it to continue", none: true });
    }

    if (entry.type === "contents") {
      ground();
      const x = 20, w = L ? 257 : 170, top = L ? 30 : 34, bottom = L ? 184 : 270;
      const HS = T.storyHead;
      const hLast = block("heading", has("heading") ? entry.heading : (HS.caps ? "CONTENTS" : "Contents"), x, top + 10, w, 1, HS, HS.start, HS.min, "mul", P.ink);
      rule(x, hLast + 8);
      const items = contentsItems(book);
      const secSpec = styledSpec(HS, withRole("heading", null, book));
      const itemSpec = styledSpec(T.body, withRole("body", null, book));
      const numSpec = styledSpec(T.kicker, withRole("label", null, book));
      const start = hLast + 22;
      // Try one column, then two, and shrink the lines, until the list fits.
      let layout = null;
      for (const ncol of (w > 150 ? [1, 2] : [1])) {
        for (const k of [1, 0.9, 0.8, 0.7]) {
          const rowH = 10.5 * k, secH = 15.5 * k, cw = (w - (ncol - 1) * 12) / ncol;
          const colsY = [];
          let col = 0, y = start, fits = true;
          for (const it of items) {
            const h = it.section ? secH : rowH;
            if (y + h > bottom + 0.01) { col++; y = start; if (col >= ncol) { fits = false; break; } }
            colsY.push({ it, col, y, h }); y += h;
          }
          if (fits) { layout = { rows: colsY, cw, k, ncol }; break; }
        }
        if (layout) break;
      }
      if (!layout) {
        // Too many for one page: as many as fit, and say so.
        const k = 0.7, rowH = 10.5 * k, secH = 15.5 * k, ncol = w > 150 ? 2 : 1, cw = (w - (ncol - 1) * 12) / ncol;
        const rows = []; let col = 0, y = start;
        for (const it of items) { const h = it.section ? secH : rowH; if (y + h > bottom + 0.01) { col++; y = start; if (col >= ncol) break; } rows.push({ it, col, y, h }); y += h; }
        layout = { rows, cw, k, ncol };
        plan.cuts.push({ field: "heading", label: "list of pages (it runs past the page)" });
      }
      const numW = 12;
      for (const r of layout.rows) {
        const cx = x + r.col * (layout.cw + 12);
        const base = r.y + r.h * 0.62;
        if (r.it.section) {
          const size = Math.min(7, HS.start * 0.7) * layout.k;
          font(page, secSpec.w, size, secSpec.f, secSpec.sp || 0, !!secSpec.it);
          put(ellipsize(page, HS.caps ? r.it.title.toUpperCase() : r.it.title, layout.cw - numW - 2), cx, base, secSpec, size, P.ink);
          put(String(r.it.n).padStart(2, "0"), cx + layout.cw, base, numSpec, T.kicker.size * 1.3, accentText(P), "right");
        } else {
          const size = T.body.size * 1.3 * layout.k;
          font(page, itemSpec.w, size, itemSpec.f, itemSpec.sp || 0, !!itemSpec.it);
          put(ellipsize(page, r.it.title, layout.cw - numW - 2), cx, base, itemSpec, size, P.ink);
          put(String(r.it.n).padStart(2, "0"), cx + layout.cw, base, numSpec, T.kicker.size * 1.2, colour(T.kicker.color || "soft"), "right");
          rectOp(cx, r.y + r.h - 0.1, layout.cw, 0.2, P.rule);
        }
      }
      if (!items.length) marker(x + w / 2, 150);
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
  // A magazine page can be as full as the studio wants (Sep 2026: 12/6/600 before).
  const FREE_MAX = 60, FREE_PHOTO_MAX = 30, FREE_TEXT_MAX = 2000;
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

  /* Lines up an Anything page's photographs with an even gap: photographs
     that share a row are resized along it, then the rows are resized down
     the page, so the group keeps its outer edges and only the gaps change.
     gx, gy: the gap as fractions of the page's width and height. */
  function spacePhotos(list, gx, gy) {
    const r4 = (v) => Math.round(v * 10000) / 10000;
    const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
    const groups = (items, lo, hi) => {
      const out = [];
      [...items].sort((a, b) => lo(a) - lo(b)).forEach((it) => {
        const g = out.find((gr) => gr.some((o) => overlap(lo(o), hi(o), lo(it), hi(it)) > 0.5 * Math.min(hi(o) - lo(o), hi(it) - lo(it))));
        if (g) g.push(it); else out.push([it]);
      });
      return out;
    };
    const even = (items, pos, size, gap) => {
      if (items.length < 2) return;
      items.sort((a, b) => pos.get(a) - pos.get(b));
      const start = Math.min(...items.map((it) => pos.get(it))), end = Math.max(...items.map((it) => pos.get(it) + size.get(it)));
      const total = items.reduce((t, it) => t + size.get(it), 0), room = end - start - gap * (items.length - 1);
      if (room <= 0.02 * items.length) return;
      let at = start;
      items.forEach((it) => { const s2 = size.get(it) * room / total; pos.set(it, at); size.set(it, s2); at += s2 + gap; });
    };
    // Along each row.
    const rows = groups(list, (b) => b.y, (b) => b.y + b.h);
    rows.forEach((row) => {
      const pos = new Map(row.map((b) => [b, b.x])), size = new Map(row.map((b) => [b, b.w]));
      even(row, pos, size, gx);
      row.forEach((b) => { b.x = r4(pos.get(b)); b.w = r4(size.get(b)); });
    });
    // Then the rows down the page, each as one band; bands that sit beside
    // each other (not above) are left alone.
    const bands = rows.map((row) => ({ row, x0: Math.min(...row.map((b) => b.x)), x1: Math.max(...row.map((b) => b.x + b.w)), y: Math.min(...row.map((b) => b.y)), h: Math.max(...row.map((b) => b.y + b.h)) - Math.min(...row.map((b) => b.y)) }));
    groups(bands, (t) => t.x0, (t) => t.x1).forEach((stack) => {
      const pos = new Map(stack.map((t) => [t, t.y])), size = new Map(stack.map((t) => [t, t.h]));
      even(stack, pos, size, gy);
      stack.forEach((t) => {
        const k = size.get(t) / t.h, top = pos.get(t);
        t.row.forEach((b) => { b.y = r4(top + (b.y - t.y) * k); b.h = r4(b.h * k); });
      });
    });
    return list;
  }
  function planFree(book, entry, ground = null) {
    const G = geometry(book);
    const st = styleKey(book), D = TR(st);
    const T = WTYPE[st];
    const P = paletteFor(book);
    const page = measurer();
    const W = G.Wa, H = G.Ha;                      // blocks are fractions of this frame
    const plan = { ops: [], cuts: [], fields: {}, foot: {}, free: true };
    const op = (o) => plan.ops.push(o);
    const colour = (role) => (role === "accentText" ? accentText(P) : P[role]);
    // Numbers on an Anything page are the studio's to ask for, page by page.
    let plate = 0;
    const numbered = !ground && entry.nums === true;
    // A cover from scratch takes the style's cover ground, not the book's page colour.
    op({ k: "rect", x: 0, y: 0, w: W, h: H, c: ground ? (isFillish(entry.bg) ? blockColor(entry.bg, P, ground) : ground) : pageBgOf(book, entry, P, D.ground === "paper" ? P.paper : P.white) });
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
          frame: b.edge ? blockColor(b.edge, P, P.rule) : (D.frame ? photoRule(P) : null), frameT: THICKS[b.edgeWidth] || 0.2,
          ...(numbered && b.p && b.p.id ? { num: ++plate } : {})
        });
        return;
      }
      // Words. The box holds them: the type shrinks to fit unless the studio
      // asked for it to be cut, and either way it says what won't print. With
      // a colour behind them, the words sit inset from the box's edge.
      const sh = shapeOf(b);
      if (b.fill) op({ k: sh === "rect" ? "rect" : "path", shape: sh, corner: cornerOf(b), x: box.x, y: box.y, w: box.w, h: box.h, c: blockColor(b.fill, P, P.accent), a: b.o, rot: turn });
      const ins = b.fill ? shapeInset(sh, box.w, box.h, cornerOf(b)) : { x: 0, y: 0 };
      const ts = typesetOf(book);
      const f = mergeFmt(ts ? ts[FREE_ROLE[b.role] || "body"] : null, (b.style && typeof b.style === "object") ? b.style : null);
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
          if (o.deco && !shaped) { decoPhoto(page, P, o.deco, img, shot, o.x, o.y, o.w, o.h, o.mode, o.seed || 0); return; }
          const r = o.mode === "crop" ? drawPhoto(page, img, shot, o.x, o.y, o.w, o.h) : fitPhoto(page, img, shot, o.x, o.y, o.w, o.h, o.mode === "fit-right" ? "right" : o.mode === "fit-left" ? "left" : "center");
          if (shaped) page.ctx.restore();
          else if (o.frame) frame(page, r.x, r.y, r.w, r.h, o.frame, o.frameT || 0.2);
          if (o.num) plateChip(page, P, o.num, o, shaped ? null : r);
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
    return G.W - TR(styleKey(book)).captionInset;
  };
  const captionStyle = (book) => CAPTION_TYPE[styleKey(book)];

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
  /* One page is drawn at a time. The drawing code keeps the book, the page and
     its number in module variables (bookNow, entryNow, numNow…), and the editor
     runs several renders at once: the preview, the page strip, the covers in a
     chooser. Taking turns page by page, each with its own variables set, keeps
     one render from reading another's. A turn that never ends (a hung load) is
     passed over after 20 seconds, so nothing can lock the book for good. */
  let drawTurn = Promise.resolve();
  function takeTurn() {
    let release;
    const mine = new Promise((r) => { release = r; });
    const before = drawTurn;
    drawTurn = mine;
    return Promise.race([before, new Promise((r) => setTimeout(r, 20000))]).then(() => release);
  }
  async function* renderPages(book, { dpi, watermarked = false, cache, only = null, guides = false, skip = null, originals = null, print = null }) {
    const mark = watermarked ? markSettings(book) : null;
    await ensureFonts();
    await ensureBookFonts(book);
    const P = paletteFor(book);
    // Pages are drawn in the paper's design space (A4 or A4 grown to Letter's
    // shape) at a resolution that makes the canvas exactly the printed size
    // at `dpi`, and each page carries its printed size in points for the PDF.
    const G = geometry(book);
    const W = G.W, H = G.H, size = { w: W, h: H };
    const pt = { w: G.pw * 72 / 25.4, h: G.ph * 72 / 25.4 };
    // A print file catches the words as they are drawn, to set them as type (book-print.js).
    const newPage = () => { const pg = API.newPdfPage(dpi * G.s, size); pg.pt = pt; pg.scale = G.s; if (print && window.BookPrint) window.BookPrint.hook(pg, print, dpi); return pg; };
    const S = STYLE_IMPL[styleKey(book)];
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
    const writingFoot = (page, n, plan) => pageFoot(book, page, P, W, H, n, "", { ink: plan.foot.ink, soft: plan.foot.soft });
    // A page's photographs are fetched before its turn, so a turn is only ever drawing.
    const shotsOf = (entry) => [...((entry && entry.photos) || []), ...freeBlocks(entry).filter((b) => b && b.k === "photo" && b.p && b.p.id).map((b) => b.p)];
    const fetched = (entry) => Promise.all(shotsOf(entry).map(imgOf));
    const inTurn = async (entry, num, draw) => {
      const done = await takeTurn();
      try { bookNow = book; skipNow = skip; entryNow = entry; numNow = num; libNow = lib; return await draw(); } finally { done(); }
    };
    let n = 0;
    const want = (i) => only === null || (Array.isArray(only) ? only.includes(i) : only === i);
    // Cover
    if (want(-1)) {
      const layout = coverLayoutOf(book);
      if (layout === "custom") await fetched(coverEntry(book)); else if (book.cover && layout !== "poster") await imgOf(book.cover);
      const page = await inTurn(null, 1, async () => {
        const page = newPage();
        if (layout === "custom") {
          const ce = coverEntry(book);
          const plan = planFree(book, ce);
          await paintPlan(page, plan, ce, imgOf, P, guides, skip);
          page.cuts = plan.cuts; page.plan = plan;
        } else if (COVER_PRESETS[layout]) await COVER_PRESETS[layout](page, book, P, W, H, layout === "poster" ? null : (book.cover ? await imgOf(book.cover) : null));
        else await S.cover(page, book, P, W, H, book.cover ? await imgOf(book.cover) : null);
        if (mark) watermark(page, W, H, P, mark);
        return page;
      });
      yield { page, index: -1, n: 1 };
    }
    n = 1;
    for (let i = 0; i < book.pages.length; i++) {
      const entry = book.pages[i];
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
          const pn = n - 1 + half;
          const page = await inTurn(entry, pn, async () => {
            const page = newPage();
            rect(page, 0, 0, W, H, pageBgOf(book, entry, P, P.white));
            if (img) {
              page.ctx.save();
              page.ctx.beginPath(); page.ctx.rect(0, 0, page.u(W), page.u(H)); page.ctx.clip();
              if (B) drawPhoto(page, img, entry.photos[0], -half * W + B.left, B.top, W * 2 - B.left - B.right, H - B.top - B.bottom);
              else drawPhoto(page, img, entry.photos[0], -half * W, 0, W * 2, H);
              page.ctx.restore();
            } else missing(page, P, 0, 0, W, H);
            if (B) paintBands(page, P, W, H, { ...B, left: half ? 0 : B.left, right: half ? B.right : 0 }, bandColors(book.style, P), pn, half ? pageCredit(entry, shoots) : "", null, half ? "right" : "left");
            else if (book.style === "vogue") VOGUE.foot(page, P, W, H, pn, half ? pageCredit(entry, shoots) : "", half ? "right" : "left");
            else if (NEWER_STYLES.includes(book.style)) {
              const C = bandColors(book.style, P), SL = WTYPE[book.style].smallLabel, credit = half ? pageCredit(entry, shoots) : "";
              rect(page, 0, H - 9, W, 9, C.band);
              font(page, SL.w, 2.4, SL.f, SL.sp || 0);
              if (showNums()) text(page, String(pn).padStart(2, "0"), half ? W - 14 : 14, H - 3.4, C.on, half ? "right" : "left");
              if (credit) text(page, ellipsize(page, credit.toUpperCase(), W - 60), 14, H - 3.4, C.on);
            }
            else { rect(page, 0, H - 9, W, 9, P.deep); font(page, 700, 2.4, F.mono, 0.4); if (showNums()) text(page, String(pn).padStart(2, "0"), half ? W - 14 : 14, H - 3.4, P.onDeep, half ? "right" : "left"); }
            if (mark) watermark(page, W, H, P, mark);
            return page;
          });
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
          const pn = n - 1 + half;
          const page = await inTurn(entry, pn, async () => {
            const page = newPage();
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
            masterHead(page, book, entry, pn, P, W);
            if (mark) watermark(page, W, H, P, mark);
            return page;
          });
          yield { page, index: i, n: pn, half };
        }
        continue;
      }
      n += 1;
      if (!want(i)) continue;
      await fetched(entry);
      const page = await inTurn(entry, n, async () => {
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
        } else if (entry.type === "look") {
          const imgs = await Promise.all((entry.photos || []).map(imgOf));
          await drawLook(page, entry, book, P, W, H, imgs, n, S, lookNumber(book, entry));
          const credit = pageCredit(entry, shoots);
          pageFoot(book, page, P, W, H, n, credit);
          // Elegant's foot is the number alone: a look's credit sits across from it.
          if (styleKey(book) === "elegant" && credit) { font(page, 300, 3.0, F.sans); text(page, ellipsize(page, credit, W - 60), n % 2 ? 20 : W - 20, H - 12, P.soft, n % 2 ? "left" : "right"); }
        } else if (entry.type === "end") {
          const imgs = await Promise.all((entry.photos || []).map(imgOf));
          await drawEnd(page, entry, book, P, W, H, imgs, n, S);
          if (endLayoutOf(entry) !== "back") writingFoot(page, n, { foot: {} });
        } else if (WRITING[entry.type]) {
          const plan = planWriting(book, entry);
          await paintPlan(page, plan, entry, imgOf, P, guides, skip);
          writingFoot(page, n, plan);
          page.cuts = plan.cuts;
          page.plan = plan;
        } else {
          await textPage(page, entry, book, P, W, H, n);
        }
        masterHead(page, book, entry, n, P, W);
        // The baseline grid, shown in the editor only.
        if (guides && book.baseline && WRITING[entry.type]) baselineGuides(page, book, W, H);
        if (mark) watermark(page, W, H, P, mark);
        return page;
      });
      yield { page, index: i, n };
    }
  }

  /* ---------- on every page: the running head ------------------------------------
     A magazine's master page puts a small line at the top of each page: the
     book's title on the left-hand page, the section it is in on the right.
     book.runHead: "title" | "section" | "both"; absent means none. It is drawn
     only where the top of the page is really empty — the page is looked at,
     pixel by pixel and word by word, before anything is written — so a
     photograph to the edge, a style's own running head or a headline near the
     top is never written over. */
  const RUN_HEADS = ["title", "section", "both"];
  const NO_RUN_HEAD = ["divider", "spread", "end"];
  function sectionOf(book, entry) {
    const i = book.pages.indexOf(entry);
    for (let k = i; k >= 0; k--) { const pg = book.pages[k]; if (pg && pg.type === "divider" && String(pg.heading || "").trim()) return String(pg.heading).trim(); }
    return "";
  }
  function runHeadText(book, entry, n) {
    const title = String(book.title || book.name || "").trim(), section = sectionOf(book, entry);
    if (book.runHead === "title") return title;
    if (book.runHead === "section") return section || title;
    return n % 2 === 0 ? title : (section || title);
  }
  function baselineGuides(page, book, W, H) {
    const lead = WTYPE[styleKey(book)].body.lead; if (!(lead > 0)) return;
    const ctx = page.ctx; ctx.save(); ctx.globalAlpha = 0.18;
    for (let y = lead; y < H; y += lead) rect(page, 0, y - 0.08, W, 0.16, "#00A3FF");
    ctx.restore();
  }
  function masterHead(page, book, entry, n, P, W) {
    if (!RUN_HEADS.includes(book.runHead) || !entry || NO_RUN_HEAD.includes(entry.type)) return;
    const s = runHeadText(book, entry, n); if (!s) return;
    const SL = WTYPE[styleKey(book)].smallLabel;
    font(page, SL.w, 2.2, SL.f, SL.sp || 0.4);
    const str = ellipsize(page, SL.caps === false ? s : s.toUpperCase(), W / 2 - 20);
    const right = n % 2 === 1, x = right ? W - 14 : 14, w = measure(page, str);
    const box = { x: (right ? x - w : x) - 3, y: 4, w: w + 6, h: 8.5 };
    const k = page.u(1), ctx = page.ctx;
    const dev = { x0: box.x * k, y0: box.y * k, x1: (box.x + box.w) * k, y1: (box.y + box.h) * k };
    // Words already set there as type in a print file are not in the pixels.
    if ((page.vtext || []).some((r) => !r.dropped && r.box.x0 < dev.x1 && dev.x0 < r.box.x1 && r.box.y0 < dev.y1 && dev.y0 < r.box.y1)) return;
    let ground;
    try {
      const d = ctx.getImageData(Math.floor(dev.x0), Math.floor(dev.y0), Math.max(1, Math.ceil(dev.x1 - dev.x0)), Math.max(1, Math.ceil(dev.y1 - dev.y0))).data;
      ground = [d[0], d[1], d[2]];
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - ground[0]) > 10 || Math.abs(d[i + 1] - ground[1]) > 10 || Math.abs(d[i + 2] - ground[2]) > 10) return;
    } catch (e) { return; }
    const dark = (0.2126 * ground[0] + 0.7152 * ground[1] + 0.0722 * ground[2]) / 255 < 0.45;
    text(page, str, x, 9.6, dark ? (P.onDeep || "#ffffff") : P.soft, right ? "right" : "left");
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
  .sb-hint { margin: 0; font: 400 11.5px/1.45 Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-warn { margin: 0; font: 600 12.5px/1.5 Inter, sans-serif; color: var(--accent, #d24e1a); }
  .sb-vh { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  /* books */
  /* An admin tool: the site's "Book a shoot" band has no business under it.
     A class, not :has(), which Chrome would re-check on every change to the page. */
  html.sb-book .footer-cta { display: none !important; }
  .sb-homehead { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 14px 24px; margin-bottom: 22px; }
  .sb-eyebrow { margin: 0; font: 700 11px 'JetBrains Mono', monospace; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-soft, #5c5e66); }
  .sb-h1 { margin: 6px 0 6px; font: 800 clamp(28px, 4vw, 40px)/1.05 Archivo, Inter, sans-serif; letter-spacing: -.02em; }
  .sb-lede { margin: 0; max-width: 62ch; color: var(--ink-soft, #5c5e66); }
  .sb-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 16px; }
  .sb-card { display: grid; grid-template-rows: auto 1fr; border: 1px solid var(--sb-line); border-radius: 12px; overflow: hidden; background: var(--sb-card); }
  .sb-newcard { display: grid; grid-template-rows: none; align-content: center; justify-items: center; gap: 6px; min-height: 220px; border: 1px dashed var(--sb-line-2, #b9b7b2); background: none; color: inherit; font: 700 15px Inter, sans-serif; text-align: center; cursor: pointer; }
  .sb-newcard small { font: 400 12px/1.4 Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-newcard:hover:not(:disabled) { border-color: var(--ink, #141416); }
  .sb-newcard:disabled { opacity: .45; cursor: not-allowed; }
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
  /* Undo and Redo keep their words on a phone: a drawing stands for a thing,
     and these two needed a hover to be named (Sep 2026 audit, K9). */
  @media (max-width: 900px) { .sb-ico span { font-size: 11px; } .sb-light span { font-size: 10.5px; } }
  .sb-pop { position: absolute; right: 8px; top: calc(100% + 6px); z-index: 30; width: min(400px, calc(100vw - 32px)); max-height: min(70vh, 620px); overflow: auto; display: grid; gap: 12px; padding: 16px; background: var(--paper, #faf8f5); border: 1px solid var(--sb-line); border-radius: 12px; box-shadow: 0 22px 50px -20px rgba(0,0,0,.45); }
  .sb-pop[hidden] { display: none; }
  .sb-check { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .sb-check li { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font: 500 12.5px/1.45 Inter, sans-serif; }
  .sb-dlrow { display: flex; flex-wrap: wrap; gap: 8px; }
  .sb-sec-quiet { padding-top: 12px; border-top: 1px solid var(--sb-line); }
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
  .sb-h.sb-rot { left: 50% !important; top: -22px !important; border-radius: 50%; cursor: grab; color: var(--accent, #d24e1a); }
  .sb-h.sb-rot.side { left: calc(100% + 22px) !important; top: 50% !important; }
  .sb-h.sb-rot.inside { left: calc(100% - 22px) !important; top: 22px !important; }
  .sb-h.sb-rot.side::after, .sb-h.sb-rot.inside::after { display: none; }
  .sb-h.sb-rot::after { content: ""; position: absolute; left: 50%; top: 100%; width: 1px; height: 14px; background: currentColor; opacity: .5; }
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
  .sb-start { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: rgba(10,10,12,.42); }
  .sb-startbox { width: min(760px, 100%); max-height: min(92vh, 760px); overflow: auto; display: grid; gap: 14px; align-content: start; padding: 18px; background: var(--paper, #faf8f5); border: 1px solid var(--sb-line); border-radius: 14px; box-shadow: 0 24px 60px -24px rgba(0,0,0,.5); }
  .sb-starts { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
  .sb-startitem { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--sb-line); border-radius: 12px; background: var(--sb-card); color: inherit; text-align: left; cursor: pointer; }
  .sb-startitem:hover, .sb-startitem:focus-visible { border-color: var(--ink, #141416); }
  .sb-startpic { display: grid; place-items: center; height: 132px; background: var(--sb-sunk); border-radius: 8px; }
  .sb-startpic canvas { max-height: 116px; max-width: 100%; box-shadow: 0 6px 16px -8px rgba(0,0,0,.5); }
  .sb-startitem b { font: 700 13.5px Inter, sans-serif; }
  .sb-startitem > span:last-child { font: 400 12px/1.4 Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  @media (max-width: 900px) { .sb-starts { grid-template-columns: 1fr 1fr; } .sb-startpic { height: 110px; } .sb-startpic canvas { max-height: 96px; } }
  .sb-addhead strong { font: 700 15px Inter, sans-serif; }
  .sb-addgroup { display: grid; gap: 8px; }
  .sb-additems { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  .sb-additem { display: grid; grid-template-columns: 34px 1fr; grid-template-rows: auto 1fr; gap: 2px 12px; align-items: start; padding: 10px 12px; border: 1px solid var(--sb-line); border-radius: 10px; background: var(--sb-card); color: inherit; text-align: left; cursor: pointer; }
  .sb-additem .sb-addico { grid-row: 1 / 3; display: block; filter: drop-shadow(0 1px 1px rgba(0,0,0,.12)); }
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
  /* Sections were told apart by a gap alone, so a long one ran into the next.
     A hairline and one rhythm, the way a modern rail is built. */
  .sb-panel > .sb-sec + .sb-sec, .sb-panel > .sb-field + .sb-field,
  .sb-panel > .sb-sec + .sb-field, .sb-panel > .sb-field + .sb-sec {
    padding-top: 18px; border-top: 1px solid var(--sb-line);
  }
  .sb-panel { gap: 0; row-gap: 18px; }
  .sb-field { display: grid; gap: 5px; }
  /* ONE label voice down the whole rail. The panel used to alternate between
     an h3's mono capitals ("PHOTOS", "PAGE COLOUR") and a field label's bold
     sans ("Placement", "Credit line", "Border"), which read as two interfaces
     stacked on top of each other rather than one. Every label is now the h3's
     voice, and nothing in the column competes with the controls. */
  .sb-field > label, .sb-field > .sb-label, .sb-adjrow > span:first-child {
    font: 700 11px/1.3 'JetBrains Mono', monospace; letter-spacing: .12em;
    text-transform: uppercase; color: var(--ink-soft, #5c5e66);
  }
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
  .sb-freeform { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 8px; }
  .sb-freeform .sb-hint { flex: 1 1 200px; margin: 0; }
  .sb-layoutgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(74px, 1fr)); gap: 6px; margin: 4px 0 10px; }
  .sb-layoutbtn { display: grid; justify-items: center; gap: 3px; padding: 6px 4px; border: 1px solid var(--sb-line); border-radius: 8px; background: var(--paper, #fff); font: 500 10.5px/1.25 Inter, sans-serif; color: var(--ink, #141416); cursor: pointer; text-align: center; }
  .sb-layoutbtn:hover, .sb-layoutbtn:focus-visible { border-color: var(--accent, #d24e1a); }
  .sb-autorow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .sb-autorow select { flex: 1 1 180px; min-width: 0; }
  .sb-typerole { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 10px; padding: 8px 0; border-top: 1px solid var(--sb-line); }
  .sb-typerole:first-of-type { border-top: 0; }
  .sb-typename { display: grid; gap: 1px; min-width: 0; flex: 1; }
  .sb-typename b { font: 600 13px Inter, sans-serif; }
  .sb-typename span { font: 400 11.5px/1.35 Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
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
  .sb-cpharm { margin-top: 8px; }
  .sb-cpharm summary { cursor: pointer; font: 600 12px Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-cpbase { display: flex; align-items: center; gap: 8px; margin-top: 8px; font: 500 11px Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-cpwheelwrap { position: relative; width: 150px; height: 150px; margin: 10px auto; }
  .sb-cpwheel { position: absolute; inset: 0; border-radius: 50%; cursor: crosshair; background: conic-gradient(hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%)); -webkit-mask: radial-gradient(circle, transparent 55%, #000 56%); mask: radial-gradient(circle, transparent 55%, #000 56%); }
  .sb-cpwheel:focus-visible { outline: 2px solid var(--ink, #141416); outline-offset: 3px; }
  .sb-cpdots { position: absolute; inset: 0; pointer-events: none; }
  .sb-cpd { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.45); }
  .sb-cpd.base { width: 20px; height: 20px; margin: -10px 0 0 -10px; border-width: 3px; }
  .sb-cpd.near { border-style: dashed; }
  .sb-cprowh { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 6px; }
  .sb-cprowh > span { flex: 0 0 82px; font: 500 11px Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-cpsw { width: 21px; height: 21px; padding: 0; border: 1px solid rgba(0,0,0,.18); border-radius: 6px; cursor: pointer; }
  .sb-cpsw:hover, .sb-cpsw:focus-visible { transform: scale(1.12); outline: 2px solid var(--ink, #141416); outline-offset: 1px; }
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
  /* A drawn button is square and keeps its name for a reader and the tooltip;
     a row of them reads as a toolbar rather than as words of ragged lengths. */
  .sb-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; font-size: 11px; }
  .sb-seg button:has(svg) { display: inline-flex; align-items: center; justify-content: center; min-width: 38px; padding: 7px 9px; line-height: 0; font-size: 0; }
  /* In a row of drawings, nothing stretches — otherwise the one button that
     kept its word ("Auto") swallowed all the space left over and the drawn
     ones huddled at the end. */
  .sb-seg:has(svg) button { flex: 0 0 auto; }
  /* A row that shows the drawing AND says the word under it. Used where the
     drawing is standing for a size rather than a thing, so it cannot be read
     on its own. The word is the same .sb-sr span, simply let out of hiding. */
  .sb-seg-words button:has(svg) { flex-direction: column; gap: 3px; min-width: 56px; padding: 6px 8px; }
  .sb-seg-words .sb-sr { position: static; width: auto; height: auto; overflow: visible; clip: auto; font: 600 10px/1 'JetBrains Mono', monospace; letter-spacing: .04em; text-transform: uppercase; }
  /* Save, lit while something is waiting to be written to this device. */
  #sbSave.is-due { border-color: var(--accent, #d24e1a); color: var(--accent, #d24e1a); font-weight: 700; }
  .sb-seg button svg { display: block; pointer-events: none; }
  .sb-styles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .sb-style { display: grid; gap: 2px; align-content: start; padding: 8px; border: 1px solid var(--sb-line); border-radius: 10px; background: var(--paper, #faf8f5); color: inherit; text-align: left; cursor: pointer; }
  .sb-style b { font: 700 14px Inter, sans-serif; }
  .sb-style span { font: 400 12px/1.35 Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-style .sb-stylepic { display: flex; gap: 4px; justify-content: center; align-items: center; height: 96px; margin-bottom: 6px; padding: 6px; background: var(--sb-sunk); border-radius: 7px; overflow: hidden; }
  .sb-stylepic canvas { max-height: 84px; max-width: 48%; width: auto; height: auto; box-shadow: 0 3px 8px -4px rgba(0,0,0,.45); }
  .sb-style.is-busy { opacity: .6; }
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
  /* This was a filled grey card sitting inside the panel — a second surface,
     and the one thing in the column that did not sit flat. It is drawn with a
     line now, like everything else. */
  .sb-adjust { display: grid; gap: 10px; padding: 12px; border-radius: 10px; border: 1px solid var(--sb-line); background: none; }
  .sb-adjrow { display: flex; justify-content: space-between; align-items: center; gap: 8px; font: 600 12.5px Inter, sans-serif; }
  .sb-adjrow span:last-child { display: flex; gap: 4px; }
  .sb-adjrow button { padding: 5px 9px; border: 1px solid var(--sb-line); border-radius: 7px; background: var(--paper, #faf8f5); color: var(--ink, #141416); font: 600 12px Inter, sans-serif; cursor: pointer; }
  .sb-adjrow button:disabled { opacity: .35; cursor: not-allowed; }
  .sb-range { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 8px; font: 500 12px Inter, sans-serif; color: var(--ink-soft, #5c5e66); }
  .sb-range input { width: 100%; accent-color: var(--accent, #d24e1a); }
  /* The one remaining label in a different voice: the disclosure that opens
     the photograph chooser. It joins the rest. */
  .sb-pick > summary {
    cursor: pointer; padding: 4px 0;
    font: 700 11px/1.3 'JetBrains Mono', monospace; letter-spacing: .12em;
    text-transform: uppercase; color: var(--ink-soft, #5c5e66);
  }
  .sb-pick > summary:hover { color: var(--ink, #141416); }
  .sb-pick[open] > summary { margin-bottom: 8px; }
  .sb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 6px; max-height: 380px; overflow-y: auto; padding: 2px; margin-top: 8px; }
  .sb-thumb { position: relative; aspect-ratio: 3 / 4; padding: 0; border: 0; border-radius: 6px; overflow: hidden; background: var(--sb-sunk); cursor: pointer; }
  .sb-thumb-wrap { position: relative; display: block; }
  .sb-thumb-wrap .sb-thumb { width: 100%; }
  .sb-thumb-rm { position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; border: 0; background: rgba(0,0,0,.72); color: #fff; font-size: 15px; line-height: 24px; padding: 0; cursor: pointer; }
  .sb-thumb-rm:focus-visible { outline: 2px solid var(--sb-accent, #d24e1a); outline-offset: 2px; }
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
    /* A row of its own, so the name is read whole rather than as "Pag…". */
    .sb-root .sb-name { flex: 1 1 100%; }
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

  const PAGE_LABEL = { photos: "Photos", spread: "Two-page spread", divider: "Chapter page", about: "About", services: "What I shoot", contact: "Contact", story: "Story", note: "About a photo", quote: "Quote", letter: "Letter", feature: "Zig-zag", article: "Story + full-page photo", ways: "Ways we work", process: "How a shoot runs", free: "Anything page", end: "End page", look: "Look", more: "Story continued", contents: "Contents" };
  // The library, by kind, with a name and a line each.
  const LAYOUT_GROUPS = [
    { group: "Openers", items: [
      ["opener", "Opener", "A photograph across the top, a headline under it, two columns of words."],
      ["halves", "Half and half", "A photograph filling the left half, the story on the right."],
      ["headfirst", "Headline first", "A big headline, then a photograph to the foot of the page."],
      ["framed", "Framed opener", "A framed photograph with the headline and a few words under it."],
      ["coverstory", "Cover story", "One photograph filling the page, the headline written on it."],
      ["bigword", "One big word", "A single word or two set huge, and a photograph under it."],
      ["titled", "Title on the picture", "One photograph filling the page, a band across it, the title on the band."]] },
    { group: "Photo stories", items: [
      ["edge2", "Two, edge to edge", "Two portraits side by side, filling the page, no gap."],
      ["two", "Two pictures and a line", "Two photographs side by side with a line of words under them."],
      ["stacked", "Two, stacked", "Two landscape photographs, one above the other."],
      ["bigtwo", "One big, two small", "A photograph across the top, two under it, a caption."],
      ["beside", "Big beside two", "A tall photograph filling most of the page, two beside it."],
      ["triptych", "Three tall", "Three portraits in a row, like a triptych."],
      ["three", "Three pictures and a note", "One wide photograph, two under it, and a few words."],
      ["grid4", "Four in a grid", "Four photographs, two by two."],
      ["mosaic", "Mosaic", "One big photograph and five around it."],
      ["sheet", "Contact sheet", "Six photographs in a grid, the way a proof sheet reads."],
      ["strips", "Filmstrip", "Four wide frames down the page."],
      ["scatter", "Prints on a table", "Three prints with white edges, turned a little, overlapping."],
      ["inset", "Photo in a photo", "One photograph filling the page, a smaller one set into it."],
      ["single", "One, with a caption", "A single photograph with room around it and a caption."]] },
    { group: "Words and pictures", items: [
      ["editorial", "Words beside a photo", "Headline and story on the left, a photograph and more words on the right."],
      ["threecols", "Three columns", "A headline, an intro and the story in three columns."],
      ["pullquote", "Pull quote", "A story in two columns with a big quote breaking it."],
      ["interview", "Interview", "A round portrait, a headline beside it, the words under both."],
      ["captioned", "Three with captions", "Three photographs, each with its own words under it."],
      ["sidebar", "Colour sidebar", "A band of colour with the headline in it, the story beside."],
      ["centred", "Centred", "A centred headline, a photograph, then the words."],
      ["quote", "A quote under a photograph", "A photograph at the top, big words under it, and who said them."],
      ["quotephoto", "Quote on a photograph", "Big words written across a darkened photograph."]] }
  ];
  const LAYOUT_NAME = Object.fromEntries(LAYOUT_GROUPS.flatMap((g) => g.items.map(([k, n]) => [k, n])));
  const ADD_MENU = [
    { group: "Photographs", items: [
      ["photos", "Photos", "One to six photos, laid out by their shapes."],
      ["spread", "Two-page spread", "One photo across two facing pages."]] },
    { group: "Lookbook", items: [
      ["look", "Look", "One or two photographs of one look, its number, its name, and the lines under it: garments, who made them, who styled it."]] },
    { group: "Words", items: [
      ["story", "Story", "A photo with a headline, an intro and a story about a shoot or a brief."],
      ["note", "About a photo", "One photo shown large, with a title and a few lines about it."],
      ["quote", "Quote", "Someone's real words set large, with or without a photo."],
      ["letter", "Letter", "A signed page of your own writing: a foreword, or a note to a brand."],
      ["feature", "Zig-zag", "A photo beside words, then words beside a photo, the way magazines alternate them."],
      ["article", "Story + full-page photo", "Two facing pages: your words on one, a photo filling the other."],
      ["more", "Story continued", "The rest of the story, letter or note before it, when it runs longer than its page."]] },
    { group: "How we work", items: [
      ["ways", "Ways we work", "All four ways of working on one page, with who leads the ideas."],
      ["process", "How a shoot runs", "One way, step by step, marking who does what: you, together, or the studio."]] },
    { group: "Put it where you want", items: [
      ["free", "Anything page", "An empty page. Put words, photographs, colour blocks and lines wherever you like."],
      ["free:blank", "Empty page", "Nothing on it but the page colour: for the end of the book, or to keep a two-page spread on facing pages."]] },
    // The layout library: every one an Anything page, so everything on it can move.
    ...LAYOUT_GROUPS.map((g) => ({ group: `Layouts · ${g.group}`, items: g.items.map(([k, n, note]) => [`free:${k}`, n, note]) })),
    { group: "Studio pages", items: [
      ["contents", "Contents", "Every chapter and titled page with its page number, always up to date."],
      ["divider", "Chapter page", "A pause between sections, e.g. “Fashion & editorial”."],
      ["about", "About the studio", "Who you are and how you work."],
      ["services", "What I shoot", "The kinds of shoot live on your site."],
      ["contact", "Contact", "Email, Instagram, booking link and a QR code."],
      ["end:back", "Back cover", "The last page: your mark, your name and how to reach you."],
      ["end:closing", "Closing page", "A last photograph and a line to sign off with, then the book ends."]] }
  ];
  /* Each kind of page as a small picture for the Add-page menu: a page with
     its photographs (grey), lines of words (dark) and any band of colour, in
     a 44 × 60 box. Nothing here is drawn on a real page. */
  const ADD_ICONS = {
    photos: "p4,8,11,44 p16.5,8,11,44 p29,8,11,44",
    spread: "p2,14,40,32 l22,2,22,58",
    story: "t4,7,24,3 t4,12,16,2 p4,17,36,20 t4,40,36,2 t4,44,36,2 t4,48,30,2 t4,52,20,2",
    note: "p4,5,36,30 t4,39,22,3 t4,45,36,2 t4,49,28,2",
    quote: "t8,20,28,3 t8,26,28,3 t8,32,20,3 t8,40,12,2",
    letter: "t4,8,36,2 t4,13,36,2 t4,18,32,2 t4,23,36,2 t4,28,34,2 t4,33,36,2 t4,38,20,2 t4,48,12,3",
    feature: "p4,6,17,18 t24,8,16,2 t24,12,16,2 t24,16,12,2 t4,32,16,2 t4,36,16,2 t4,40,12,2 p23,30,17,18",
    article: "t4,8,15,2 t4,12,15,2 t4,16,13,2 t4,20,15,2 t4,24,11,2 t4,28,15,2 p23,4,19,52",
    ways: "t4,8,10,3 t16,8,24,2 t16,12,18,2 t4,20,10,3 t16,20,24,2 t16,24,18,2 t4,32,10,3 t16,32,24,2 t16,36,18,2 t4,44,10,3 t16,44,24,2 t16,48,18,2",
    process: "b4,9,3,3 t10,9,30,2 b4,17,3,3 t10,17,26,2 b4,25,3,3 t10,25,30,2 b4,33,3,3 t10,33,22,2 b4,41,3,3 t10,41,28,2",
    free: "d p8,10,16,14 t8,30,28,2 t8,34,24,2 b26,44,10,8",
    "free:opener": "p0,0,44,26 t4,30,30,3 t4,37,17,2 t4,41,17,2 t4,45,14,2 t23,37,17,2 t23,41,17,2 t23,45,12,2",
    "free:two": "p4,8,17,20 p23,8,17,20 t4,32,36,2",
    "free:titled": "p0,0,44,60 b0,36,44,8 w4,38,20,4",
    "free:quote": "p0,0,44,22 t6,28,32,3 t6,34,32,3 t6,42,14,2",
    "free:three": "p4,6,36,20 p4,28,17,14 p23,28,17,14 t4,46,30,2",
    "free:sheet": "p4,6,16,14 p24,6,16,14 p4,22,16,14 p24,22,16,14 p4,38,16,14 p24,38,16,14",
    "free:blank": "",
    divider: "t4,26,24,4 b4,33,10,1.5",
    about: "t4,8,20,3 t4,15,36,2 t4,19,36,2 t4,23,30,2 t4,27,36,2 t4,31,24,2",
    services: "t4,8,14,3 t4,13,30,2 t4,20,14,3 t4,25,30,2 t4,32,14,3 t4,37,30,2 t4,44,14,3 t4,49,30,2",
    contact: "t4,8,22,3 t4,15,26,2 t4,19,22,2 t4,23,26,2 q28,40,12,12",
    "end:back": "b0,0,44,60 w19,18,6,6 w13,30,18,2 w15,36,14,1.5 w15,40,14,1.5 w15,44,14,1.5",
    "end:closing": "p4,6,36,26 t4,40,26,3 b4,47,8,1 t4,51,20,2",
    look: "p4,4,36,34 t4,42,9,2 t4,46,22,3 b4,51,6,1 t4,54,18,1.5",
    contents: "t4,7,20,3 b4,12,8,1 t4,18,26,2 t36,18,4,2 t4,24,24,2 t36,24,4,2 t4,30,28,2 t36,30,4,2 t4,36,20,2 t36,36,4,2 t4,42,26,2 t36,42,4,2",
    more: "t4,6,14,1.5 b4,9,8,1 t4,13,17,2 t4,17,17,2 t4,21,17,2 t4,25,17,2 t4,29,13,2 t23,13,17,2 t23,17,17,2 t23,21,17,2 t23,25,10,2"
  };
  function addIcon(type) {
    const FILL = { p: "#cfcbc4", t: "#8a8c93", b: "var(--accent, #d24e1a)", w: "#ffffff", q: "#141416" };
    const spec = ADD_ICONS[type] !== undefined ? ADD_ICONS[type] : (/^free:/.test(type) ? layoutIconSpec(FREE_STARTS[type.slice(5)]) : "");
    const parts = String(spec || "").split(/\s+/).filter(Boolean).map((tok) => {
      if (tok === "d") return `<rect x="4.5" y="4.5" width="35" height="51" fill="none" stroke="#d24e1a" stroke-width=".8" stroke-dasharray="2 1.5"/>`;
      const k = tok[0], [x, y, w, h] = tok.slice(1).split(",").map(Number);
      if (k === "l") return `<line x1="${x}" y1="${y}" x2="${w}" y2="${h}" stroke="#c8c6c1" stroke-width="1"/>`;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${FILL[k] || FILL.t}"/>`;
    });
    return `<svg class="sb-addico" viewBox="0 0 44 60" width="34" height="46" aria-hidden="true"><rect x=".5" y=".5" width="43" height="59" rx="2" fill="#fff" stroke="#c8c6c1"/>${parts.join("")}</svg>`;
  }
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
    ],
    /* ---- the magazine layout library (Sep 2026) ---- */
    // Openers
    halves: [
      { k: "photo", x: 0, y: 0, w: 0.5, h: 1 },
      { k: "text", role: "kicker", x: 0.56, y: 0.14, w: 0.345, h: 0.03 },
      { k: "text", role: "head", x: 0.56, y: 0.185, w: 0.345, h: 0.18 },
      { k: "text", role: "intro", x: 0.56, y: 0.385, w: 0.345, h: 0.09 },
      { k: "text", role: "body", x: 0.56, y: 0.5, w: 0.345, h: 0.42 }
    ],
    headfirst: [
      { k: "text", role: "kicker", x: 0.095, y: 0.075, w: 0.6, h: 0.03 },
      { k: "text", role: "head", x: 0.095, y: 0.115, w: 0.81, h: 0.2, style: { size: 1.5 } },
      { k: "photo", x: 0, y: 0.36, w: 1, h: 0.64 }
    ],
    framed: [
      { k: "photo", x: 0.18, y: 0.1, w: 0.64, h: 0.5 },
      { k: "text", role: "kicker", x: 0.18, y: 0.64, w: 0.64, h: 0.03 },
      { k: "text", role: "head", x: 0.18, y: 0.68, w: 0.64, h: 0.12 },
      { k: "text", role: "body", x: 0.18, y: 0.82, w: 0.64, h: 0.1 }
    ],
    coverstory: [
      { k: "photo", x: 0, y: 0, w: 1, h: 1 },
      { k: "text", role: "kicker", x: 0.095, y: 0.08, w: 0.6, h: 0.03, style: { color: "#ffffff" } },
      { k: "text", role: "head", x: 0.095, y: 0.12, w: 0.81, h: 0.2, style: { color: "#ffffff", size: 1.4 } }
    ],
    bigword: [
      { k: "text", role: "head", x: 0.095, y: 0.06, w: 0.81, h: 0.3, style: { size: 1.6 } },
      { k: "photo", x: 0, y: 0.4, w: 1, h: 0.6 }
    ],
    // Photo stories
    edge2: [
      { k: "photo", x: 0, y: 0, w: 0.5, h: 1 },
      { k: "photo", x: 0.5, y: 0, w: 0.5, h: 1 }
    ],
    stacked: [
      { k: "photo", x: 0.095, y: 0.075, w: 0.81, h: 0.4 },
      { k: "photo", x: 0.095, y: 0.49, w: 0.81, h: 0.4 },
      { k: "text", role: "kicker", x: 0.095, y: 0.91, w: 0.81, h: 0.03 }
    ],
    bigtwo: [
      { k: "photo", x: 0, y: 0, w: 1, h: 0.6 },
      { k: "photo", x: 0.095, y: 0.64, w: 0.395, h: 0.26 },
      { k: "photo", x: 0.51, y: 0.64, w: 0.395, h: 0.26 },
      { k: "text", role: "body", x: 0.095, y: 0.915, w: 0.81, h: 0.04 }
    ],
    beside: [
      { k: "photo", x: 0, y: 0, w: 0.62, h: 1 },
      { k: "photo", x: 0.65, y: 0.075, w: 0.3, h: 0.415 },
      { k: "photo", x: 0.65, y: 0.51, w: 0.3, h: 0.415 }
    ],
    triptych: [
      { k: "photo", x: 0.095, y: 0.12, w: 0.26, h: 0.7 },
      { k: "photo", x: 0.37, y: 0.12, w: 0.26, h: 0.7 },
      { k: "photo", x: 0.645, y: 0.12, w: 0.26, h: 0.7 },
      { k: "text", role: "kicker", x: 0.095, y: 0.86, w: 0.81, h: 0.03 }
    ],
    grid4: [
      { k: "photo", x: 0.095, y: 0.075, w: 0.395, h: 0.42 },
      { k: "photo", x: 0.51, y: 0.075, w: 0.395, h: 0.42 },
      { k: "photo", x: 0.095, y: 0.51, w: 0.395, h: 0.42 },
      { k: "photo", x: 0.51, y: 0.51, w: 0.395, h: 0.42 },
      { k: "text", role: "kicker", x: 0.095, y: 0.945, w: 0.81, h: 0.025 }
    ],
    mosaic: [
      { k: "photo", x: 0.095, y: 0.075, w: 0.535, h: 0.52 },
      { k: "photo", x: 0.65, y: 0.075, w: 0.255, h: 0.25 },
      { k: "photo", x: 0.65, y: 0.345, w: 0.255, h: 0.25 },
      { k: "photo", x: 0.095, y: 0.615, w: 0.255, h: 0.3 },
      { k: "photo", x: 0.3725, y: 0.615, w: 0.255, h: 0.3 },
      { k: "photo", x: 0.65, y: 0.615, w: 0.255, h: 0.3 }
    ],
    strips: [
      { k: "photo", x: 0.095, y: 0.075, w: 0.81, h: 0.2 },
      { k: "photo", x: 0.095, y: 0.29, w: 0.81, h: 0.2 },
      { k: "photo", x: 0.095, y: 0.505, w: 0.81, h: 0.2 },
      { k: "photo", x: 0.095, y: 0.72, w: 0.81, h: 0.2 }
    ],
    scatter: [
      { k: "photo", x: 0.1, y: 0.08, w: 0.46, h: 0.36, r: -5, edge: "white", edgeWidth: "broad" },
      { k: "photo", x: 0.44, y: 0.3, w: 0.44, h: 0.34, r: 4, edge: "white", edgeWidth: "broad" },
      { k: "photo", x: 0.13, y: 0.57, w: 0.46, h: 0.33, r: -2, edge: "white", edgeWidth: "broad" },
      { k: "text", role: "kicker", x: 0.62, y: 0.86, w: 0.3, h: 0.03 }
    ],
    inset: [
      { k: "photo", x: 0, y: 0, w: 1, h: 1 },
      { k: "photo", x: 0.56, y: 0.62, w: 0.34, h: 0.28, edge: "white", edgeWidth: "broad" }
    ],
    single: [
      { k: "photo", x: 0.15, y: 0.1, w: 0.7, h: 0.7 },
      { k: "text", role: "body", x: 0.15, y: 0.83, w: 0.7, h: 0.08 }
    ],
    // Words and pictures
    editorial: [
      { k: "text", role: "kicker", x: 0.095, y: 0.075, w: 0.5, h: 0.03 },
      { k: "text", role: "head", x: 0.095, y: 0.115, w: 0.5, h: 0.15 },
      { k: "photo", x: 0.64, y: 0.075, w: 0.265, h: 0.4 },
      { k: "text", role: "body", x: 0.095, y: 0.29, w: 0.5, h: 0.63 },
      { k: "text", role: "body", x: 0.64, y: 0.5, w: 0.265, h: 0.42 }
    ],
    threecols: [
      { k: "text", role: "kicker", x: 0.095, y: 0.075, w: 0.6, h: 0.03 },
      { k: "text", role: "head", x: 0.095, y: 0.11, w: 0.81, h: 0.12 },
      { k: "text", role: "intro", x: 0.095, y: 0.25, w: 0.81, h: 0.07 },
      { k: "text", role: "body", x: 0.095, y: 0.34, w: 0.81, h: 0.58, style: { columns: 3 } }
    ],
    pullquote: [
      { k: "text", role: "head", x: 0.095, y: 0.075, w: 0.81, h: 0.1 },
      { k: "text", role: "body", x: 0.095, y: 0.2, w: 0.81, h: 0.28, style: { columns: 2 } },
      { k: "text", role: "quote", x: 0.095, y: 0.51, w: 0.81, h: 0.14 },
      { k: "line", x: 0.095, y: 0.665, w: 0.15, thick: "narrow", color: "accent" },
      { k: "text", role: "body", x: 0.095, y: 0.7, w: 0.81, h: 0.22, style: { columns: 2 } }
    ],
    interview: [
      { k: "photo", x: 0.095, y: 0.075, w: 0.3, h: 0.21, shape: "ellipse" },
      { k: "text", role: "kicker", x: 0.45, y: 0.09, w: 0.455, h: 0.03 },
      { k: "text", role: "head", x: 0.45, y: 0.13, w: 0.455, h: 0.16 },
      { k: "text", role: "body", x: 0.095, y: 0.33, w: 0.81, h: 0.59, style: { columns: 2 } }
    ],
    captioned: [
      { k: "text", role: "head", x: 0.095, y: 0.075, w: 0.81, h: 0.1 },
      { k: "photo", x: 0.095, y: 0.2, w: 0.255, h: 0.45 },
      { k: "photo", x: 0.3725, y: 0.2, w: 0.255, h: 0.45 },
      { k: "photo", x: 0.65, y: 0.2, w: 0.255, h: 0.45 },
      { k: "text", role: "body", x: 0.095, y: 0.67, w: 0.255, h: 0.2 },
      { k: "text", role: "body", x: 0.3725, y: 0.67, w: 0.255, h: 0.2 },
      { k: "text", role: "body", x: 0.65, y: 0.67, w: 0.255, h: 0.2 }
    ],
    sidebar: [
      { k: "shape", x: 0, y: 0, w: 0.34, h: 1, fill: "accent" },
      { k: "text", role: "kicker", x: 0.05, y: 0.1, w: 0.25, h: 0.03, style: { color: "#ffffff" } },
      { k: "text", role: "head", x: 0.05, y: 0.15, w: 0.25, h: 0.3, style: { color: "#ffffff" } },
      { k: "text", role: "body", x: 0.4, y: 0.1, w: 0.505, h: 0.82 }
    ],
    centred: [
      { k: "text", role: "kicker", x: 0.2, y: 0.1, w: 0.6, h: 0.03, style: { align: "center" } },
      { k: "text", role: "head", x: 0.15, y: 0.14, w: 0.7, h: 0.15, style: { align: "center" } },
      { k: "photo", x: 0.2, y: 0.33, w: 0.6, h: 0.37 },
      { k: "text", role: "body", x: 0.2, y: 0.73, w: 0.6, h: 0.19 }
    ],
    quotephoto: [
      { k: "photo", x: 0, y: 0, w: 1, h: 1 },
      { k: "shape", x: 0, y: 0, w: 1, h: 1, fill: "ink", o: 0.35 },
      { k: "text", role: "quote", x: 0.1, y: 0.35, w: 0.8, h: 0.25, style: { color: "#ffffff", align: "center" } },
      { k: "text", role: "kicker", x: 0.1, y: 0.63, w: 0.8, h: 0.03, style: { color: "#ffffff", align: "center" } }
    ]
  };
  // A layout's small picture, worked out from the layout itself.
  function layoutIconSpec(blocks) {
    const r = (v) => Math.round(v * 10) / 10;
    const out = [];
    for (const b of blocks || []) {
      const x = r(Math.max(0, b.x) * 44), y = r(Math.max(0, b.y) * 60), w = r(Math.min(1 - Math.max(0, b.x), b.w) * 44), h = r(Math.min(1 - Math.max(0, b.y), b.h || 0.01) * 60);
      if (b.k === "photo") out.push(`p${x},${y},${w},${h}`);
      else if (b.k === "shape") out.push(`${b.fill === "ink" ? "q" : "b"}${x},${y},${w},${h}`);
      else if (b.k === "line") out.push(`b${x},${y},${w},1`);
      else if (b.k === "text") {
        const white = b.style && /^#fff/i.test(b.style.color || "") ? "w" : "t";
        if (b.role === "head") out.push(`${white}${x},${y},${r(w * 0.8)},${r(Math.min(h, 4))}`);
        else if (b.role === "kicker") out.push(`${white}${x},${y},${r(w * 0.5)},1.2`);
        else if (b.role === "quote") { out.push(`${white}${x},${y},${w},2.5`); out.push(`${white}${x},${r(y + 3.5)},${r(w * 0.7)},2.5`); }
        else {
          const cols = (b.style && b.style.columns) || 1, cw = (w - (cols - 1) * 1.5) / cols;
          for (let c = 0; c < cols; c++) for (let l = 0; l * 3.2 < h - 1 && l < 6; l++) out.push(`${white}${r(x + c * (cw + 1.5))},${r(y + l * 3.2)},${r(cw * (l % 3 === 2 ? 0.7 : 1))},1.6`);
        }
      }
    }
    return out.join(" ");
  }
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
  /* Drawings for the studio's own controls (v510). Every one of these panels
     was a row of words — Fill / Whole / Fit width / Fit height, Top / Bottom /
     Left / Right, four times over — which read as a form rather than as a
     toolbar. Each button now shows what it does and says its name on hover;
     the name itself stays in the markup, hidden, so a screen reader and the
     tests both still read it. */
  const SB_ICON = (paths) => `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">${paths}</svg>`;
  const SB_ICONS = {
    // How a photograph meets its space.
    fitFill: SB_ICON('<rect x="2" y="2.6" width="12" height="10.8" rx="1.2" fill="currentColor" stroke="none"/>'),
    fitWhole: SB_ICON('<rect x="2" y="2.6" width="12" height="10.8" rx="1.2"/><rect x="5.2" y="4.6" width="5.6" height="6.8" rx=".8" fill="currentColor" stroke="none"/>'),
    fitWidth: SB_ICON('<rect x="2" y="4.4" width="12" height="7.2" rx="1.2"/><path d="M4.4 8h7.2M6 6.4 4.4 8 6 9.6M10 6.4 11.6 8 10 9.6"/>'),
    fitHeight: SB_ICON('<rect x="4.4" y="2" width="7.2" height="12" rx="1.2"/><path d="M8 4.4v7.2M6.4 6 8 4.4 9.6 6M6.4 10 8 11.6 9.6 10"/>'),
    // Which edge a band, or the big photograph, takes.
    edgeNone: SB_ICON('<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.2"/>'),
    edgeTop: SB_ICON('<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.2"/><path d="M2.2 4.6h11.6" stroke-width="3"/>'),
    edgeBottom: SB_ICON('<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.2"/><path d="M2.2 11.4h11.6" stroke-width="3"/>'),
    edgeLeft: SB_ICON('<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.2"/><path d="M4.6 2.2v11.6" stroke-width="3"/>'),
    edgeRight: SB_ICON('<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.2"/><path d="M11.4 2.2v11.6" stroke-width="3"/>'),
    edgeAll: SB_ICON('<rect x="3.4" y="3.4" width="9.2" height="9.2" rx=".8" stroke-width="3.2"/>'),
    // How broad that band is.
    ruleNarrow: SB_ICON('<path d="M2.4 8h11.2" stroke-width="1.2"/>'),
    ruleStandard: SB_ICON('<path d="M2.4 8h11.2" stroke-width="3"/>'),
    ruleBroad: SB_ICON('<path d="M2.4 8h11.2" stroke-width="5.4"/>'),
    // How much air between the photographs.
    /* The four differed by two pixels of gap and read as four identical
       blobs — the studio could not find this control at all (Sep 24 2026).
       The gap is exaggerated well past the truth so they differ at a glance,
       and the row carries its words as well: "None / Narrow / Medium / Wide"
       are sizes, and a 15px drawing cannot say a size on its own. */
    gapNone: SB_ICON('<rect x="1.6" y="3" width="6.4" height="10" rx=".6" fill="currentColor" stroke="none"/><rect x="8" y="3" width="6.4" height="10" rx=".6" fill="currentColor" stroke="none"/>'),
    gapNarrow: SB_ICON('<rect x="1.6" y="3" width="5.9" height="10" rx=".6" fill="currentColor" stroke="none"/><rect x="8.5" y="3" width="5.9" height="10" rx=".6" fill="currentColor" stroke="none"/>'),
    gapMedium: SB_ICON('<rect x="1.6" y="3" width="4.6" height="10" rx=".6" fill="currentColor" stroke="none"/><rect x="9.8" y="3" width="4.6" height="10" rx=".6" fill="currentColor" stroke="none"/>'),
    gapWide: SB_ICON('<rect x="1.6" y="3" width="2.8" height="10" rx=".6" fill="currentColor" stroke="none"/><rect x="11.6" y="3" width="2.8" height="10" rx=".6" fill="currentColor" stroke="none"/>'),
    // The shape of the paper.
    portrait: SB_ICON('<rect x="4.2" y="1.8" width="7.6" height="12.4" rx="1.2"/>'),
    landscape: SB_ICON('<rect x="1.8" y="4.2" width="12.4" height="7.6" rx="1.2"/>')
  };
  /* A button that shows a drawing and says its name on hover and to a reader.
     These names are this file's own words, but the escape stays: API.esc lives
     inside mount(), and reaching for it from out here is what first broke the
     builder with "esc is not defined". */
  const sbIcon = (icon, words) => `${SB_ICONS[icon] || ""}<span class="sb-sr">${String(words).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`;
  const POSITION_LABEL = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" };
  const POSITION_ICON = { top: "edgeTop", bottom: "edgeBottom", left: "edgeLeft", right: "edgeRight" };
  const BORDER_CHOICES = [["auto", "Auto"], ["none", "None"], ["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"], ["all", "All round"]];
  const FIT_CHOICES = [["auto", "Auto"], ["fill", "Fill"], ["whole", "Whole"], ["width", "Fit width"], ["height", "Fit height"]];
  const FIT_HINT = {
    auto: "The style decides.",
    fill: "Fills its space. Zoom and position choose the crop.",
    whole: "The whole photo, centred, with space around it if the shapes differ.",
    width: "As wide as its space. The top and bottom crop, or leave space.",
    height: "As tall as its space. The sides crop, or leave space."
  };
  const pad2 = (n) => String(n).padStart(2, "0");
  const COVER = {};                      // a key for the cover in maps keyed by page entry

  /* The studio asked for what Word and Canva do: a drawing on the button and
     its name when the mouse rests on it. Dozens of these buttons already said
     their name to a screen reader and to nothing else, and the builder redraws
     its panels constantly, so rather than write the tooltip out forty times
     the name is copied across wherever one is missing, on every redraw. */
  function nameOnHover(root) {
    // The sheets that open over the builder (the picker, the reading view) are
    // appended to the body, not inside the root, so both are swept.
    const WHERE = ".sb-root, .sb-modal-back, .sb-read";
    const pass = () => {
      document.querySelectorAll(WHERE).forEach((box) => {
        box.querySelectorAll("button[aria-label]:not([title])").forEach((b) => {
          const name = (b.getAttribute("aria-label") || "").trim();
          if (name) b.title = name;
        });
      });
    };
    // A redraw is many mutations; one sweep after the frame settles is enough,
    // and a tooltip a frame late is a tooltip nobody has reached for yet.
    let due = 0;
    const soon = () => { if (due) return; due = requestAnimationFrame(() => { due = 0; pass(); }); };
    pass();
    // Only childList is watched, so writing the title back cannot wake this up.
    new MutationObserver(soon).observe(document.body, { childList: true, subtree: true });
  }

  function mount(root) {
    injectCss();
    /* The studio's own photographs from this computer, read once as the
       builder opens and held in memory: library() runs on every redraw and a
       page turn cannot wait on a database. It lands well before the picker is
       opened, and the picker refreshes it again whenever files are added. If
       the store will not open at all, the book simply has none of them and
       everything else works. */
    outsideRefresh().catch(() => {});
    nameOnHover(root);
    document.documentElement.classList.add("sb-book");
    // The site's router replaces the page's contents to leave: the moment the
    // builder's root is gone, the page is the site's own again.
    if (root.parentNode) {
      const gone = new MutationObserver(() => { if (!root.isConnected) { document.documentElement.classList.remove("sb-book", "sb-editing"); gone.disconnect(); } });
      gone.observe(root.parentNode, { childList: true });
    }
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
    let printMarks = false;              // 3 mm bleed + crop marks, for a print shop
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
      /* A page still waiting for its photographs is the next step, not a
         fault: a brand-new book opened saying "1 to fix" (Sep 2026 audit,
         K12). Only when something else is wrong does it say fix. */
      const empty = list.filter((p) => /no photos yet$/.test(p.text)).length;
      el.querySelector("span").textContent = !list.length ? "All good"
        : empty === list.length ? `${empty} to fill`
        : `${list.length - empty} to fix${empty ? ` · ${empty} to fill` : ""}`;
      el.title = list.length ? list.map((p) => p.text).join("\n") : "Every page is ready to send";
    }
    function persist(status = "Saved on this device") {
      scheduleLight();
      if (!book || !dirty) return true;
      book.updatedAt = Date.now();
      // The mark of how new the book's shapes are, kept on this working copy
      // too: the cleaner writes it into the stored copy, but this object is
      // what the next save starts from, so without this a later edit (a
      // style changed back, a page removed) would save a lower mark and CI
      // would read it as an out-of-date tab. Raised as needed, never lowered.
      const pgs = book.pages || [];
      const need = pgs.some((pg) => pg && (pg.type === "contents" || pg.type === "more")) ? 6 : NEWER_STYLES.includes(book.style) ? 5 : book.style === "lookbook" ? 4 : pgs.some((pg) => pg && pg.type === "look") ? 3 : (coverLayoutOf(book) !== "classic" || pgs.some((pg) => pg && pg.type === "end")) ? 2 : pgs.some((pg) => pg && pg.type === "free") ? 1 : 0;
      if (need > (book.schema || 0)) book.schema = need;
      // Read what is stored now, not this tab's cached list: another builder
      // tab may have saved or deleted a book since, and writing the cached
      // list back would erase that.
      const cur = readState();
      if (!writeState({ versions: [book, ...cur.versions.filter((v) => v.id !== book.id)], deleted: cur.deleted })) {
        setStatus("NOT SAVED — this device's storage is full or blocked");
        return false;
      }
      dirty = false;
      markSave();
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
    // Says whether anything is waiting to be written to this device, so the
    // Save button can light up rather than sit there looking the same always.
    function markSave() { const b = $("#sbSave"); if (b) b.classList.toggle("is-due", !!dirty); }
    function change(opts = {}) {
      dirty = true;
      markSave();
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
      if (!root.isConnected) { window.removeEventListener("resize", onResize); document.documentElement.classList.remove("sb-editing", "sb-book"); return; }
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
            <p class="sb-lede">Your own book of work to send to clients: photographs from any album, lighting diagrams and your own words, in one of eleven styles and nine colourways, or a colourway made from your own colour. Keep as many versions as you need.</p>
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
          </article>`).join("")}
          <button type="button" class="sb-card sb-newcard" data-new ${atLimit ? "disabled" : ""}>+ New book<small>A cover and a first page of photographs</small></button></div>`
        : `<div class="sb-empty"><p class="sb-hint">No books yet. A book is a cover plus pages of your photographs and words. Start one, pick your clicks, and save a version for brands, one for agencies, one for a single client.</p></div>`}
        <p class="sb-hint sb-foot">Books save on this device as you work, and publish with your albums when you press Publish, so they open on any device.${atLimit ? ` You have ${LIMIT} books, the most there can be: delete one to start another.` : ""}</p>`;
      // A rename in progress is saved first, then the click does what it says.
      let finishRename = null;
      const settle = () => { if (finishRename) { const f = finishRename; finishRename = null; f(true, false); } };
      $$("#sbNew, [data-new]").forEach((b) => b.addEventListener("click", () => { settle(); if (!atLimit) openStart(); }));
      /* A new book begins with its cover: the five layouts, each drawn small
         for real, "From scratch" among them for a cover made by hand. The
         book then opens on that cover. */
      const withLayout = (nb, k) => { if (k && k !== "classic") nb.coverLayout = k; if (k === "custom") nb.coverPage = { blocks: [] }; return nb; };
      // A lookbook: a page about the collection, six looks, a back cover.
      let kind = "magazine";
      const KIND_NOTE = { magazine: "A cover and a page of photographs; add any pages after.", lookbook: "A cover, a page about the collection, six looks and a back cover. Each look is one or two photographs with its number, its name and its lines." };
      const withKind = (nb, k) => {
        if (k !== "lookbook") return nb;
        nb.name = nb.name.replace(/^Book /, "Lookbook ");
        nb.style = "lookbook";
        nb.title = "Lookbook"; nb.subtitle = `Collection ${year()}`;
        nb.pages = [{ type: "story", photos: [], kicker: "", headline: "", intro: "", body: "" }, ...Array.from({ length: 6 }, () => ({ type: "look", photos: [] })), { type: "end", layout: "back" }];
        return nb;
      };
      function closeStart() { const el = $("#sbStart"); if (el) el.remove(); }
      function startBook(k) {
        settle(); if (atLimit) return;
        closeStart();
        openBook(withKind(withLayout(newBook(`Book ${state.versions.length + 1}`), k), kind), true, { sel: -1 });
      }
      function openStart() {
        closeStart();
        const box = document.createElement("div");
        box.className = "sb-start"; box.id = "sbStart"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Start a new book");
        box.innerHTML = `<div class="sb-startbox">
          <div class="sb-addhead"><strong>Start a new book</strong><button type="button" class="sb-btn quiet" id="sbStartClose">Cancel</button></div>
          <div class="sb-cpbase"><span>Start with</span><div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="What kind of book">${[["magazine", "A magazine"], ["lookbook", "A lookbook"]].map(([k, nm]) => `<button type="button" role="radio" data-kind="${k}" aria-checked="${kind === k}">${nm}</button>`).join("")}</div></div>
          <p class="sb-hint" id="sbKindNote">${esc(KIND_NOTE[kind])}</p>
          <p class="sb-hint">Then the cover to begin with. It can be changed any time on the cover's own panel.</p>
          <div class="sb-starts">${COVER_LAYOUTS.map(([k, nm]) => `<button type="button" class="sb-startitem" data-start="${k}"><span class="sb-startpic"><span class="sb-hint">…</span></span><b>${esc(k === "custom" ? "From scratch (blank)" : nm)}</b><span>${esc(COVER_LAYOUT_NOTE[k])}</span></button>`).join("")}</div>
        </div>`;
        root.appendChild(box);
        box.addEventListener("click", (e) => { if (e.target === box) { closeStart(); const nb = $("#sbNew"); if (nb) nb.focus(); } });
        box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeStart(); const nb = $("#sbNew"); if (nb) nb.focus(); } });
        box.querySelector("#sbStartClose").addEventListener("click", () => { closeStart(); const nb = $("#sbNew"); if (nb) nb.focus(); });
        box.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", () => startBook(b.dataset.start)));
        box.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => {
          kind = b.dataset.kind;
          box.querySelectorAll("[data-kind]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
          const note = box.querySelector("#sbKindNote"); if (note) note.textContent = KIND_NOTE[kind];
          if (box.drawPreviews) box.drawPreviews();
        }));
        const first = box.querySelector("[data-start]"); if (first) first.focus();
        // The five covers, drawn small in the style the book will have.
        let previewToken = 0;
        const drawPreviews = async () => {
          const token = ++previewToken;
          const cache = new Map();
          try { await ensureFonts(); } catch (e) { /* the covers draw in what is there */ }
          for (const [k] of COVER_LAYOUTS) {
            if (!box.isConnected || token !== previewToken) return;
            const nb = withKind(withLayout(newBook("Preview"), k), kind);
            try {
              for await (const r of renderPages(nb, { dpi: 22, cache, only: -1 })) {
                const slot = box.querySelector(`[data-start="${k}"] .sb-startpic`);
                if (slot && box.isConnected && token === previewToken) slot.replaceChildren(r.page.canvas);
              }
            } catch (e) { /* the words stay */ }
          }
        };
        box.drawPreviews = drawPreviews;
        drawPreviews();
      }
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
      $$("[data-del]").forEach((b) => b.addEventListener("click", async () => {
        settle();
        const v0 = readState().versions.find((x) => x.id === b.dataset.del); if (!v0) return;
        /* Deleting is final on this device the moment it is confirmed, and
           the old OK/Cancel box said it could not be undone "once published"
           — as if it could be until then (Sep 2026 audit, K6; the same fix as
           bookings in v513). Two named buttons, and Keep is the one focused. */
        if (!(await askToDeleteBook(v0.name))) { b.focus(); return; }
        const cur = readState();
        const v = cur.versions.find((x) => x.id === b.dataset.del); if (!v) return;
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
    /* Points references saved under a photo's old number at the id it has
       now (see PhotoIds), so the pickers show them as chosen. Nothing is
       saved by this; the next change the studio makes saves it. */
    function currentPhotoIds(b) {
      const lib = library();
      const walk = (o) => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) { o.forEach(walk); return; }
        if (typeof o.id === "string" && PhotoIds.baseOf(o.id)) {
          const hit = lib.byId.get(o.id);
          if (hit && hit.photo && hit.photo.id !== o.id) o.id = hit.photo.id;
        }
        Object.values(o).forEach(walk);
      };
      try { walk(b && b.pages); walk(b && b.cover); } catch (e) { /* drawing still finds them */ }
    }

    function openBook(b, isNew = false, at = null) {
      currentPhotoIds(b);
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
            <!-- Every change is kept on this device the moment it is made, and
                 the status line beside Undo has always said so. The studio
                 still could not find a Save and did not trust it (Sep 24
                 2026), the same way they could not find the one for promo
                 codes in v473. So: a button that says the word, lights up
                 while there is something not yet written down, and flushes
                 the save that was about to happen anyway. -->
            <button type="button" class="sb-btn" id="sbSave" title="Keep this book on this device now. Every change is kept as you make it — this is here so you can be sure.">Save</button>
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
            <div class="sb-sec"><span class="sb-label">How it prints</span>
              <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="How it prints">
                <button type="button" role="radio" data-print="normal" aria-checked="true">Normal</button>
                <button type="button" role="radio" data-print="fold" aria-checked="false">Fold in half</button>
              </div>
              <p class="sb-hint" id="sbBookletNote">Normal: one page per sheet, the size you chose in Design.</p>
              <label class="sb-check-row" id="sbMarksRow"><input type="checkbox" id="sbMarks"> Crop marks and 3 mm bleed, for a print shop</label>
            </div>
            <div class="sb-dlrow">
              <button type="button" class="sb-btn dark" id="sbPdf" data-dl>Download PDF</button>
              <button type="button" class="sb-btn" id="sbPng" data-dl>PNG pages</button>
            </div>
            <p class="sb-warn" id="sbAnyway" hidden></p>
            <div class="sb-ready" id="sbReady"></div>
            <div class="sb-sec sb-sec-quiet"><span class="sb-label">Full-size photos, for a print shop</span>
              <p class="sb-hint">The site keeps each photo at 1600 px. Point the book at the full-size files on this computer and it prints from those; they are read here, never uploaded. Choose none and it uses the site's copies.</p>
              <div class="sb-dlrow"><button type="button" class="sb-btn" id="sbOrig">Choose the folder…</button><button type="button" class="sb-btn" id="sbOrigForget" hidden>Don't use them</button></div>
              <input type="file" id="sbOrigFile" multiple accept="image/*" hidden>
              <div id="sbOrigStatus"></div>
            </div>
            <p class="sb-hint">The words in the PDF are real type in their own fonts: sharp at any size, and they can be searched and copied.</p>
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
      $("#sbSave").addEventListener("click", () => {
        if (!flush()) return;   // persist() has already said why it could not
        setStatus(`Saved on this device · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${longNote()}`);
        API.toast("Saved on this device. Publish puts it into the site's own files, on any device.");
      });
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
        if (t === "design") drawStylePics();
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
      $("#sbMarks").addEventListener("change", (e) => { printMarks = e.currentTarget.checked; });
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
    // The page being edited: a page of the book, or the cover when it is an Anything page of its own.
    const curEntry = () => (sel >= 0 ? book.pages[sel] : (coverLayoutOf(book) === "custom" ? coverEntry(book) : null));
    const freePage = () => { const e = curEntry(); return e && e.type === "free" ? e : null; };
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
            // The turning handle sits above the thing; at the top of the page (where
            // the front-and-back bar goes underneath) it sits beside it instead.
            + `<span class="sb-h sb-rot${M.top(b) < 8 ? (M.left(b) + M.wide(b) > 92 ? " inside" : " side") : ""}" data-h="rot" title="Turn it (Shift: 15° steps)" aria-hidden="true"></span>`
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
    // A photograph's shape (width over height), from the copy the preview loaded.
    const aspects = new Map();
    function aspectOf(id) {
      if (aspects.has(id)) return aspects.get(id);
      const hit = library().byId.get(id);
      if (hit) API.loadImage(previewSrc(hit.photo), cache).then((img) => { if (img) aspects.set(id, imgAspect(img)); }).catch(() => {});
      return null;
    }
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
        // Turning: the round handle above the thing turns it about its middle.
        if (dir === "rot") {
          const r0 = el.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
          const turnMove = (m) => {
            if (!moved) { moved = true; try { layer.setPointerCapture(m.pointerId); } catch (err) { /* older browsers */ } mark(); }
            let deg = Math.atan2(m.clientY - cy, m.clientX - cx) * 180 / Math.PI + 90;
            if (m.shiftKey) deg = Math.round(deg / 15) * 15;
            else { const near = Math.round(deg / 45) * 45; if (Math.abs(deg - near) < 3) deg = near; }
            deg = ((deg + 540) % 360) - 180;
            deg = Math.round(deg * 10) / 10;
            if (Math.abs(deg) < 0.05 || Math.abs(Math.abs(deg) - 360) < 0.05) delete b.r; else b.r = deg === -180 ? 180 : deg;
            drawLayer(); schedulePreview(60);
            const mz = $("#sbMeasure") || Object.assign(document.createElement("div"), { id: "sbMeasure", className: "sb-measure" });
            if (!mz.isConnected) layer.appendChild(mz);
            mz.textContent = `${Math.round(b.r || 0)}°`;
          };
          const turnUp = () => {
            layer.removeEventListener("pointermove", turnMove); layer.removeEventListener("pointerup", turnUp); layer.removeEventListener("pointercancel", turnUp);
            const mz = $("#sbMeasure"); if (mz) mz.remove();
            if (moved) { change({ rail: true }); drawInspector(); }
          };
          layer.addEventListener("pointermove", turnMove); layer.addEventListener("pointerup", turnUp); layer.addEventListener("pointercancel", turnUp);
          return;
        }
        // A photograph's edges crop it (the picture stays where it is on the
        // page and the frame shows more or less of it); its corners resize it
        // with its proportions kept, the picture scaling with the frame.
        const cropping = b.k === "photo" && b.p && b.p.id && !isDiagram(b.p.id) && !FIT_MODES.filter((f) => f !== "fill").includes(b.p.fit) && dir && dir.length === 1;
        const scaling = b.k === "photo" && dir && dir.length === 2;
        if (b.k === "photo" && b.p) aspectOf(b.p.id);   // loads it now if the preview hasn't
        const shot0 = b.p ? { ...b.p } : null;
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
            const Gm = geometry(book), FW = Gm.Wa, FH = Gm.Ha;
            if (scaling) {
              // Keep the frame's shape: the width leads, the height follows.
              const ratio = (start.h * FH) / (start.w * FW);
              b.h = round4(Math.max(0.02, (b.w * FW * ratio) / FH));
              if (dir.includes("n")) b.y = round4(start.y + start.h - b.h);
            } else if (cropping && shot0 && aspects.get(shot0.id)) {
              const asp = aspects.get(shot0.id);
              // Where the whole picture lies on the page now, in millimetres.
              const x0 = start.x * FW, y0 = start.y * FH, w0 = start.w * FW, h0 = start.h * FH;
              const sc = Math.max(w0 / asp, h0) * Math.min(3, Math.max(1, shot0.zoom || 1));
              const IW = asp * sc, IH = sc;
              const fx0 = typeof shot0.x === "number" ? shot0.x : 0.5, fy0 = typeof shot0.y === "number" ? shot0.y : 0.35;
              const X0 = x0 - (IW - w0) * fx0, Y0 = y0 - (IH - h0) * fy0;
              // The frame can't reach past the picture.
              let x1 = b.x * FW, y1 = b.y * FH, x2 = x1 + b.w * FW, y2 = y1 + b.h * FH;
              x1 = Math.max(X0, x1); y1 = Math.max(Y0, y1); x2 = Math.min(X0 + IW, x2); y2 = Math.min(Y0 + IH, y2);
              const w1 = Math.max(1, x2 - x1), h1 = Math.max(1, y2 - y1);
              b.x = round4(x1 / FW); b.y = round4(y1 / FH); b.w = round4(w1 / FW); b.h = round4(h1 / FH);
              const z1 = Math.min(3, Math.max(1, sc / Math.max(w1 / asp, h1)));
              const sc1 = Math.max(w1 / asp, h1) * z1, IW1 = asp * sc1, IH1 = sc1;
              const fx1 = IW1 - w1 > 1e-6 ? Math.min(1, Math.max(0, (x1 - X0) / (IW1 - w1))) : 0.5;
              const fy1 = IH1 - h1 > 1e-6 ? Math.min(1, Math.max(0, (y1 - Y0) / (IH1 - h1))) : 0.5;
              b.p = { ...b.p, zoom: Math.round(z1 * 1000) / 1000, x: Math.round(fx1 * 1000) / 1000, y: Math.round(fy1 * 1000) / 1000 };
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
      const entry = curEntry();
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
      if (entry.type === "look" && field === "title") return { get: () => entry.title || "", set: (v) => { entry.title = v; }, max: (caps.look || {}).title || 40, line: true, host: styleHost(entry), key: "title" };
      if (entry.type === "end") {
        if (field === "text") return { get: () => entry.text || "", set: (v) => { entry.text = v; }, max: (caps.end || {}).text || 160, host: styleHost(entry), key: "text" };
        if (field === "note") return { get: () => entry.note || "", set: (v) => { entry.note = v; }, max: (caps.end || {}).note || 60, line: true, host: styleHost(entry), key: "note" };
        return null;
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
      const entry = curEntry();
      if (!entry) return book.cover && book.cover.id === id ? book.cover : null;
      return (entry.photos || []).find((x) => x.id === id) || null;
    }
    function drawHits(got) {
      const box = $("#sbPreview"); if (!box) return;
      const entry = curEntry();
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
        const entry = curEntry();
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
      el.addEventListener("pointerdown", (ev) => {
        pick();
        const shot = shotFor(id); const region = rg();
        if (!shot || !region || isDiagram(id)) return;
        // The listeners go on before the picture has loaded: a drag that
        // starts the moment the finger lands must not be lost while it loads.
        // Moves that arrive first are kept and applied once it has.
        const M = layerMathsFor(layer);
        const from = { x: ev.clientX, y: ev.clientY, sx: typeof shot.x === "number" ? shot.x : 0.5, sy: typeof shot.y === "number" ? shot.y : 0.35 };
        let moved = false, last = null, done = false;
        const commit = () => { change({ rail: false, photos: true }); scheduleStrip(300); };
        const apply = (m) => {
          const dx = M.mmX(m.clientX - from.x), dy = M.mmY(m.clientY - from.y);
          if (!moved && Math.abs(m.clientX - from.x) < 3 && Math.abs(m.clientY - from.y) < 3) return;
          if (!moved) { moved = true; try { layer.setPointerCapture(m.pointerId); } catch (e) { /* older browsers */ } mark(); }
          const c = crop(shot, region.box);
          if (c.iw - c.sw > 0.5) shot.x = Math.round(Math.min(1, Math.max(0, from.sx - dx / c.scale / (c.iw - c.sw))) * 100) / 100;
          if (c.ih - c.sh > 0.5) shot.y = Math.round(Math.min(1, Math.max(0, from.sy - dy / c.scale / (c.ih - c.sh))) * 100) / 100;
          schedulePreview(40);
        };
        const move = (m) => { if (!img) { last = m; return; } apply(m); };
        const up = () => {
          done = true;
          layer.removeEventListener("pointermove", move); layer.removeEventListener("pointerup", up); layer.removeEventListener("pointercancel", up);
          if (moved) commit();
        };
        layer.addEventListener("pointermove", move); layer.addEventListener("pointerup", up); layer.addEventListener("pointercancel", up);
        load().then(() => { if (!img || !last) return; const was = moved; apply(last); last = null; if (done && moved && !was) commit(); });
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
        const entry = curEntry(), b = blocksOf(entry)[host.block]; if (!b) { closeInline(false); return; }
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
      const entry = curEntry();
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
        <button type="button" data-barcolour aria-expanded="false" aria-label="Colour"><i class="sb-bardot" style="background:${tintOf(f.color, paletteFor(book), (editing.region.type || {}).color || "#000")}"></i></button>
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
        ensureBookFonts(book).then(() => { updateMeters(); schedulePreview(0); scheduleStrip(300); if (!keepBar) drawFields(); placeInline(); const dot = $("#sbBar [data-barcolour] i"); if (dot && patch.color !== undefined) dot.style.background = tintOf(patch.color, paletteFor(book), (editing && editing.region.type || {}).color || "#000"); });
      };
      const keep = () => { if (editing) editing.ta.focus({ preventScroll: true }); };
      bar.addEventListener("pointerdown", (e) => { if (e.target.tagName !== "SELECT") e.preventDefault(); });
      bar.querySelector("[data-barfont]").addEventListener("change", (e) => { mark(); apply({ font: e.target.value }); keep(); });
      bar.querySelectorAll("[data-barsize]").forEach((b) => b.addEventListener("click", () => { mark(true); apply({ size: Math.min(1.6, Math.max(0.6, Math.round((sizeScale(f) * 100 + (+b.dataset.barsize))) / 100)) }); keep(); }));
      bar.querySelector("[data-barcolour]").addEventListener("click", () => {
        const old = $("#sbBarPick");
        if (old) { old.remove(); barBusy = false; bar.querySelector("[data-barcolour]").setAttribute("aria-expanded", "false"); keep(); return; }
        const P = paletteFor(book);
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
        <p class="sb-hint">It goes after the page you're on. The book has ${count} page${count === 1 ? "" : "s"}.</p>
        <div class="sb-addgroup sb-auto"><h3>Pages from an album</h3>
          <div class="sb-autorow"><label class="sb-vh" for="sbAutoAlbum">Album</label><select id="sbAutoAlbum">${library().albums.filter((a) => a.count).map((a) => `<option value="${esc(a.id)}">${esc(a.name)} (${a.count})</option>`).join("")}</select>
          <button type="button" class="sb-btn dark" id="sbAutoGo">Lay it out</button></div>
          <label class="sb-check-row"><input type="checkbox" id="sbAutoChapter" checked> Start with a chapter page named after the album</label>
          <p class="sb-hint">Its photographs, paired and grouped by their shapes — two portraits side by side, landscapes stacked, a grid now and then, a spread for a wide one — on as many pages as they need. Photographs already in the book are left out.</p></div>
        ${ADD_MENU.map((g) => `<div class="sb-addgroup"><h3>${esc(g.group)}</h3><div class="sb-additems">${g.items.map(([type, name, note]) => `
          <button type="button" class="sb-additem" data-add="${type}" ${count + pageSpan({ type }) > MAX_PAGES ? "disabled" : ""}>${addIcon(type)}<b>${esc(name)}</b><span>${esc(note)}</span></button>`).join("")}</div></div>`).join("")}`;
      menu.hidden = false;
      $("#sbAddToggle").setAttribute("aria-expanded", "true");
      menu.querySelector("#sbAddClose").addEventListener("click", closeAdd);
      menu.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => { closeAdd(false); addPage(b.dataset.add); }));
      { const go = menu.querySelector("#sbAutoGo"); if (go) go.addEventListener("click", async () => {
        go.disabled = true; go.textContent = "Laying it out…";
        const n = await autoPages(menu.querySelector("#sbAutoAlbum").value, menu.querySelector("#sbAutoChapter").checked);
        closeAdd(false);
        API.toast(n ? `${n} page${n === 1 ? "" : "s"} added · Ctrl+Z to take them out` : "Every photograph in that album is already in the book.");
      }); }
      const first = menu.querySelector("[data-add]:not(:disabled)"); if (first) first.focus();
    }
    /* Pages from an album: its photographs, in the album's order, paired and
       grouped by their shapes (read from the small copies), onto photos pages
       and now and then a spread — starting a spread only on a left-hand page. */
    async function autoPages(albumId, chapter) {
      const lib = library();
      const inBook = new Set(bookPhotoIds(book));
      const list = [];
      for (const [id, hit] of lib.byId) if (hit.shoot.id === albumId && !hit.photo.diagram && !inBook.has(id)) list.push({ id, hit });
      if (!list.length) return 0;
      await Promise.all(list.map(async (it) => { try { it.asp = imgAspect(await API.loadImage(thumbSrc(it.hit.photo), cache)); } catch (e) { it.asp = 1; } }));
      const shot = (it) => { const f = API.photoFocus(it.hit.photo); return { id: it.id, x: +f.x.toFixed(3), y: +f.y.toFixed(3), zoom: 1 }; };
      const wide = (it) => it && it.asp > 1.15, tall = (it) => it && it.asp < 0.9;
      const at0 = sel < 0 ? 0 : (book.pages[sel] && book.pages[sel].type === "end" ? sel : sel + 1);
      const pages = [];
      if (chapter) { const al = lib.albums.find((a) => a.id === albumId); pages.push({ type: "divider", heading: String((al && al.name) || "Selected work").slice(0, 60), line: "" }); }
      // The page number the next page would start on, to keep a spread off the fold.
      const startNo = () => { let n = 1; for (let k = 0; k < at0; k++) n += pageSpan(book.pages[k]); for (const pg of pages) n += pageSpan(pg); return n + 1; };
      let i = 0, k = 0;
      while (i < list.length) {
        const a = list[i], b2 = list[i + 1], c = list[i + 2], d = list[i + 3];
        k++;
        if (k % 5 === 0 && d) { pages.push({ type: "photos", photos: [a, b2, c, d].map(shot) }); i += 4; continue; }
        if (wide(a) && a.asp > 1.3 && k % 4 === 2 && startNo() % 2 === 0) { pages.push({ type: "spread", photos: [shot(a)] }); i += 1; continue; }
        if (wide(a) && wide(b2)) { pages.push({ type: "photos", photos: [a, b2].map(shot) }); i += 2; continue; }
        if (tall(a) && tall(b2) && tall(c) && k % 3 === 0) { pages.push({ type: "photos", photos: [a, b2, c].map(shot) }); i += 3; continue; }
        if (tall(a) && tall(b2) && k % 2 === 0) { pages.push({ type: "photos", photos: [a, b2].map(shot) }); i += 2; continue; }
        pages.push({ type: "photos", photos: [shot(a)] }); i += 1;
      }
      mark();
      book.pages.splice(at0, 0, ...pages);
      flush();
      change({ rail: true, photos: true });
      select(at0);
      return pages.length;
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
      if (["photos", "spread", "story", "note", "quote", "feature", "article", "look"].includes(type)) entry.photos = [];
      if (type === "divider") { entry.heading = "Selected work"; entry.line = ""; }
      // Writing pages start empty: nothing is ever written for the studio.
      for (const k of Object.keys((fieldCaps()[type]) || {})) if (WRITING[type]) entry[k] = "";
      // The two "how we work" pages are the exception: they arrive with the
      // studio's own words, in boxes, ready to be changed.
      if (type === "ways") Object.assign(entry, { kicker: WAYS_COPY.kicker, heading: WAYS_COPY.heading, intro: WAYS_COPY.intro, items: WAYS_COPY.items.map((x) => ({ ...x })) });
      if (type === "process") { const c = PROCESS_COPY.pitch; Object.assign(entry, { way: "pitch", kicker: c.kicker, heading: c.heading, intro: c.intro, note: c.note, steps: c.steps.map((x) => ({ ...x })) }); }
      if (type === "end") {
        const have = book.pages.findIndex((pg) => pg && pg.type === "end");
        if (have >= 0) { API.toast("The book already has an end page: it is the last one."); select(have); return; }
        entry.layout = start === "back" ? "back" : "closing";
        if (entry.layout === "closing") entry.photos = [];
      }
      // An end page goes last; anything else goes after the page you're on —
      // or, with the end page selected, just before it: the back cover stays
      // the back cover (Sep 2026 audit, K10).
      const onEnd = sel >= 0 && book.pages[sel] && book.pages[sel].type === "end";
      const at = type === "end" ? book.pages.length : sel < 0 ? 0 : onEnd ? sel : sel + 1;
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
      // A different page's panel starts at its top, not wherever the last
      // one was scrolled to.
      const panel = $(".sb-panel"); if (panel) panel.scrollTop = 0;
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
      if (!pg) return coverLayoutOf(book) === "custom" ? "Cover · from scratch" : book.title ? `Cover · ${book.title}` : "Cover";
      if (pg.type === "end") return endLayoutOf(pg) === "back" ? "Back cover" : "Closing page";
      if (pg.type === "look") return `Look ${pad2(lookNumber(book, pg))}${pg.title ? ` · ${pg.title}` : ""}`;
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
            <button type="button" data-dupe="${it.i}" aria-label="Duplicate this page" title="${it.entry && it.entry.type === "end" ? "A book has one end page" : "Duplicate"}" ${renderedCount(book) + pageSpan(it.entry) > MAX_PAGES || (it.entry && it.entry.type === "end") ? "disabled" : ""}>⧉</button>
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
        // One end page per book, the same rule as Add page (K10).
        if (pg && pg.type === "end") { API.toast("A book has one end page, and this is it."); return; }
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
      const c = $("#sbCount"); if (c) c.textContent = `${count} page${count === 1 ? "" : "s"}`;
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
      tooLong.set(sel >= 0 ? entry : COVER, on);
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
        const entry = curEntry();
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
      const entry = curEntry();
      // On a page that IS its photographs, choosing them comes first; on a
      // writing page the words do, and the photo is the second thing.
      const photoFirst = sel >= 0 && !!entry && ["note", "photos", "spread", "look"].includes(entry.type);
      panel.innerHTML = `
        <div class="sb-sec" id="sbPageHead"></div>
        ${photoFirst ? `<div class="sb-sec" id="sbPhotoBlock"></div><div class="sb-sec" id="sbFields"></div>` : `<div class="sb-sec" id="sbFields"></div><div class="sb-sec" id="sbPhotoBlock"></div>`}
        <div class="sb-sec" id="sbPageBg"></div>
        <p class="sb-warn" id="sbPageWarn" hidden></p>`;
      const head = $("#sbPageHead");
      const about = {
        cover: "The first page. Your headshot can go on it when you have one.",
        photos: "Tap to add, tap again to remove. Up to six.",
        spread: "One photograph across two facing pages. A landscape frame works best, with no face on the fold.",
        divider: "A quiet page between sections, e.g. “Fashion & editorial”.",
        about: "Your words about the studio. Left empty, the page describes the studio plainly.",
        services: "The kinds of shoot that are live on your site.",
        contact: "Email, Instagram, website and booking link, with a QR code to the booking form.",
        story: "A headline, an intro and a short story, with a photo if you like.",
        note: "One photo shown large, with a title and a few lines about it.",
        quote: "One sentence set large: someone's real words, or your own.",
        letter: "A page of your own writing, signed.",
        feature: "A photo beside words, then words beside a photo. Choose which side the first photo sits on.",
        article: "Two facing pages: your story on one, one photograph filling the other.",
        ways: "All four ways of working, with who leads the ideas.",
        process: "One way of working, step by step: you, together, or the studio.",
        free: "Add words, photographs, colour blocks and lines, then drag them where you want.",
        coverFree: "Your cover, arranged by you: add words, photographs, colour blocks and lines, then drag them where you want.",
        end: "The book's last page.",
        look: "One look of a collection: its photographs, its number, its name and its lines.",
        more: "The rest of the story before it, in columns, when it runs longer than its page.",
        contents: "A list of what is in the book, with page numbers that keep themselves right."
      };
      const kind = sel < 0 ? (coverLayoutOf(book) === "custom" ? "coverFree" : "cover") : entry.type;
      head.innerHTML = `<h3>${esc(sel < 0 ? "Cover" : PAGE_LABEL[entry.type])}</h3><p class="sb-hint">${esc(about[kind] || "")}</p>`
        + (sel >= 0 && FREEFORM_TYPES.includes(entry.type) ? `<div class="sb-freeform"><button type="button" class="sb-btn" id="sbFreeform">Make it free-form</button><span class="sb-hint">Every photograph and every line of words on this page becomes a piece you can move, crop, turn and resize, anywhere. Ctrl+Z puts the page back.</span></div>` : "");
      { const ff = $("#sbFreeform"); if (ff) ff.addEventListener("click", () => makeFreeForm(sel)); }
      drawFields(); drawPhotoBlock(); drawPageBg(); updateMeters();
    }
    /* ---------- free-form: any page into an Anything page ---------------------
       A magazine maker lets you take a layout apart. The page is drawn once,
       small, and what it drew is read back: every photograph where it landed
       (with its crop, fade and flip), every text where it was set (with its
       own formatting, in the kind of words it was), and the style's rules and
       colour bars as lines and shapes. The result is an ordinary Anything page. */
    const FREEFORM_TYPES = ["photos", "story", "note", "quote", "letter", "feature", "divider", "look"];
    const FREE_ROLE_OF = { head: "head", intro: "intro", body: "body", label: "kicker", quote: "quote", caption: "body" };
    async function makeFreeForm(i) {
      const entry = book.pages[i];
      if (!entry || !FREEFORM_TYPES.includes(entry.type)) return;
      const btn = $("#sbFreeform"); if (btn) { btn.disabled = true; btn.textContent = "Taking it apart…"; }
      let pg = null;
      try { for await (const r of renderPages(book, { dpi: 30, only: i, cache })) pg = r.page; } catch (e) { pg = null; }
      if (!pg) { if (btn) { btn.disabled = false; btn.textContent = "Make it free-form"; } API.toast("Couldn't take this page apart."); return; }
      const G = geometry(book), W = G.Wa, H = G.Ha;
      const r4 = (v) => Math.round(v * 10000) / 10000;
      const inFrame = (x, y, w, h, placed) => { const ox = placed ? G.ox : 0, oy = placed ? G.oy : 0; return { x: r4((x - ox) / W), y: r4((y - oy) / H), w: r4(Math.max(0.01, w / W)), h: r4(Math.max(0.01, h / H)) }; };
      const blocks = [];
      const hexOf = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || "")) ? String(c).toLowerCase() : null);
      // The style's rules and bars, behind everything (the page's own ground excepted).
      if (pg.plan) for (const o of pg.plan.ops) {
        if (o.k !== "rect" || o.rot || !hexOf(o.c)) continue;
        if (o.w >= G.W - 0.5 && o.h >= G.H - 0.5) continue;
        if (o.h < 3) blocks.push({ k: "line", ...inFrame(o.x, o.y, o.w, 0, true), h: undefined, width: Math.max(0.2, Math.round(o.h * 10) / 10), color: hexOf(o.c) });
        else blocks.push({ k: "shape", ...inFrame(o.x, o.y, o.w, o.h, true), fill: hexOf(o.c) });
      }
      // The photographs, as drawn.
      const shots = entry.photos || [];
      for (const ph of pg.photos || []) {
        const shot = shots.find((x) => x && x.id === ph.id);
        if (!shot) continue;
        blocks.push({ k: "photo", ...inFrame(ph.x, ph.y, ph.w, ph.h, true), p: { ...shot } });
      }
      // The words, with their own formatting and their kind.
      const done = new Set();
      const own = (field) => (entry.style && entry.style[field]) || null;
      const addText = (field, box, placed, cols) => {
        const t = typeof entry[field] === "string" ? entry[field] : "";
        if (!t.trim() || done.has(field)) return;
        done.add(field);
        const pad = 1.2;
        const one = { k: "text", ...inFrame(box.x - pad / 2, box.y - pad / 2, box.w + pad, box.h * 1.12 + pad, placed), t: t.slice(0, FREE_TEXT_MAX), role: FREE_ROLE_OF[roleOfField(field)] || "body" };
        const st = own(field) ? JSON.parse(JSON.stringify(own(field))) : {};
        if (cols > 1 && !st.columns) st.columns = Math.min(3, cols);
        if (Object.keys(st).length) one.style = st;
        blocks.push(one);
      };
      if (pg.plan) {
        for (const [field, f] of Object.entries(pg.plan.fields || {})) {
          if (!f || !f.box) continue;
          // How many columns the words ran in: the left edges most lines share.
          const xs = new Map();
          for (const o of pg.plan.ops) if (o.k === "text" && o.field === field) { const k = Math.round(o.x); xs.set(k, (xs.get(k) || 0) + 1); }
          const cols = f.cols || [...xs.values()].filter((n) => n >= 3).length;
          addText(field, f.box, false, cols);
        }
      }
      for (const t of pg.texts || []) if (t && t.field) addText(t.field, t, true, 1);
      // A caption the page drew without saying where: under the photographs.
      if (typeof entry.caption === "string" && entry.caption.trim() && !done.has("caption")) addText("caption", { x: 20, y: H - 34, w: W - 40, h: 10 }, false, 1);
      for (const b of blocks) if (b.h === undefined) delete b.h;
      let photos = 0;
      const kept = blocks.filter((b) => b.k !== "photo" || ++photos <= FREE_PHOTO_MAX).slice(0, FREE_MAX);
      mark();
      const next = { type: "free", blocks: kept };
      if (entry.bg) next.bg = entry.bg;
      book.pages[i] = next;
      blockSel = -1; photoSel = null; active = 0;
      change({ rail: true, photos: true });
      drawInspector();
      API.toast(`Free-form: ${kept.length} piece${kept.length === 1 ? "" : "s"} you can move · Ctrl+Z to undo`);
    }

    /* The colour behind this page. Absent, it is the book's (set on Design),
       and failing that the style's own. The cover keeps its own look; an
       Anything page has this among its own controls. */
    function drawPageBg() {
      const box = $("#sbPageBg"); if (!box) return;
      const entry = curEntry();
      if (!entry || entry.type === "free") { box.innerHTML = ""; box.hidden = true; return; }
      box.hidden = false;
      const P = paletteFor(book);
      const sw = (key, label, c, on) => `<button type="button" class="sb-swatch" data-pgbg="${key}" aria-pressed="${on}" title="${esc(label)}" aria-label="${esc(label)}"><i style="background:${c}"></i></button>`;
      const fills = [["paper", "Paper", P.paper], ["white", "White", P.white], ["ink", "Ink", P.ink], ["soft", "Soft", P.soft], ["accent", "Accent", P.accent], ["deep", "Deep", P.deep], ["rule", "Hairline", P.rule]];
      box.innerHTML = `<h3>Page colour</h3>
        <span class="sb-swatches" role="group" aria-label="Page colour">${sw("", book.bg ? "The book's colour" : "The style's own", book.bg ? blockColor(book.bg, P, P.paper) : "linear-gradient(135deg, #fff 45%, #999 50%, #fff 55%)", !entry.bg)}${fills.map(([k, n, c]) => sw(k, n, c, entry.bg === k)).join("")}${anySwatch("pgbgany", /^#/.test(entry.bg || "") ? entry.bg : "")}</span>
        <div class="sb-cphost" data-pgbgpick hidden></div>
        <p class="sb-hint">${entry.bg ? "This page only. " : ""}Every page at once: Design.</p>`;
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
        <div class="sb-cprow"><i class="sb-cpprev"></i><input type="text" class="sb-cphex" maxlength="7" value="${/^#[0-9a-f]{6}$/i.test(hex || "") ? hex : hsvToHex(st.h, st.s, st.v)}" aria-label="The colour as #rrggbb" spellcheck="false" autocapitalize="off"><span>or type it</span></div>
        <details class="sb-cpharm">
          <summary>Colour wheel and matches</summary>
          <div class="sb-cpbase"><span>Around</span><div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Around which colour"><button type="button" role="radio" data-cpbase="this" aria-checked="true">This colour</button><button type="button" role="radio" data-cpbase="accent" aria-checked="false">The book's accent</button></div></div>
          <div class="sb-cpwheelwrap"><div class="sb-cpwheel" role="slider" aria-label="Hue, round the wheel" tabindex="0"></div><div class="sb-cpdots" aria-hidden="true"></div></div>
          <div class="sb-cprows"></div>
          <p class="sb-hint">Tap a match to use it. Same family sits beside the colour on the wheel; contrast faces it; triads and quads share the wheel in threes and fours; tints, shades and tones are the colour lighter, darker and greyer.</p>
        </details>`;
      const sat = el.querySelector(".sb-cpsat"), dot = el.querySelector(".sb-cpdot"), hue = el.querySelector(".sb-cphue"), prev = el.querySelector(".sb-cpprev"), hexIn = el.querySelector(".sb-cphex");
      /* ---- the wheel and its matches: worked out from this colour, or from
         the book's accent, in HSV; every match is a swatch that sets the colour. */
      const harm = el.querySelector(".sb-cpharm"), rows = el.querySelector(".sb-cprows"), dots = el.querySelector(".sb-cpdots"), wheel = el.querySelector(".sb-cpwheel");
      let base = "this";
      const accentHex = () => { try { return String(colourway(book.colourway).accent).toLowerCase(); } catch (e) { return "#d24e1a"; } };
      const baseHsv = () => (base === "accent" ? hexToHsv(accentHex()) : { h: st.h, s: st.s, v: st.v });
      const wrapH = (h) => ((h % 360) + 360) % 360;
      const c01 = (x) => Math.min(1, Math.max(0, x));
      const HARMONIES = (b) => {
        const at = (dh, s = b.s, v = b.v) => hsvToHex(wrapH(b.h + dh), c01(s), c01(v));
        const sat = Math.max(b.s, 0.35), val = Math.max(b.v, 0.45);   // a grey base still shows its hue family
        return [
          ["Same family", [-30, -15, 0, 15, 30].map((d) => at(d, sat, val))],
          ["Contrast", [at(0, sat, val), at(180, sat, val), at(150, sat, val), at(210, sat, val), at(180, sat, val * 0.7)]],
          ["Triad", [at(0, sat, val), at(120, sat, val), at(240, sat, val)]],
          ["Quad", [at(0, sat, val), at(90, sat, val), at(180, sat, val), at(270, sat, val)]],
          ["Tints and shades", [at(0, b.s * 0.25, 1), at(0, b.s * 0.55, 1), at(0, b.s, b.v), at(0, b.s, b.v * 0.75), at(0, b.s, b.v * 0.5), at(0, b.s, b.v * 0.3)]],
          ["Tones", [at(0, b.s * 0.85, b.v * 0.92), at(0, b.s * 0.65, b.v * 0.84), at(0, b.s * 0.45, b.v * 0.76), at(0, b.s * 0.3, b.v * 0.68), at(0, b.s * 0.15, b.v * 0.6)]],
          ["Saturation", [0.1, 0.3, 0.5, 0.7, 0.85, 1].map((sv) => at(0, sv, val))],
          ["Hues", [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((d) => at(d, sat, val))]
        ];
      };
      const paintHarm = () => {
        if (!harm.open) return;
        const b = baseHsv();
        rows.innerHTML = HARMONIES(b).map(([name, list]) => `<div class="sb-cprowh"><span>${name}</span>${list.map((hx) => `<button type="button" class="sb-cpsw" data-cphex="${hx}" style="background:${hx}" title="${hx}" aria-label="Use ${hx}"></button>`).join("")}</div>`).join("");
        const dotAt = (h, cls, hx) => { const a = (h * Math.PI) / 180; const x = 50 + 40 * Math.sin(a), y = 50 - 40 * Math.cos(a); return `<i class="sb-cpd ${cls}" style="left:${x.toFixed(1)}%; top:${y.toFixed(1)}%; background:${hx}"></i>`; };
        const sat = Math.max(b.s, 0.35), val = Math.max(b.v, 0.45);
        dots.innerHTML = [[180, "far"], [120, "tri"], [240, "tri"], [-30, "near"], [30, "near"]].map(([d, cls]) => dotAt(wrapH(b.h + d), cls, hsvToHex(wrapH(b.h + d), sat, val))).join("") + dotAt(b.h, "base", hsvToHex(b.h, b.s, b.v));
      };
      const paint = () => {
        sat.style.background = `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${st.h}, 100%, 50%))`;
        dot.style.left = `${(st.s * 100).toFixed(1)}%`; dot.style.top = `${((1 - st.v) * 100).toFixed(1)}%`;
        const cur = hsvToHex(st.h, st.s, st.v);
        prev.style.background = cur;
        if (document.activeElement !== hexIn) hexIn.value = cur;
        paintHarm();
        return cur;
      };
      harm.addEventListener("toggle", paintHarm);
      el.querySelectorAll("[data-cpbase]").forEach((b) => b.addEventListener("click", () => {
        base = b.dataset.cpbase;
        el.querySelectorAll("[data-cpbase]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        paintHarm();
      }));
      rows.addEventListener("click", (e) => {
        const b = e.target.closest("[data-cphex]"); if (!b) return;
        const got = hexToHsv(b.dataset.cphex);
        st.h = got.h; st.s = got.s; st.v = got.v; hue.value = String(Math.round(st.h));
        onChange(paint());
      });
      // Round the wheel: hue 0 at the top, clockwise. Dragging turns it.
      const hueFromWheel = (ev) => { const r = wheel.getBoundingClientRect(); const x = ev.clientX - (r.left + r.width / 2), y = ev.clientY - (r.top + r.height / 2); return wrapH((Math.atan2(x, -y) * 180) / Math.PI); };
      wheel.addEventListener("pointerdown", (ev) => {
        ev.preventDefault(); wheel.focus({ preventScroll: true });
        try { wheel.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ }
        const turn = (m) => { st.h = hueFromWheel(m); hue.value = String(Math.round(st.h)); onChange(paint()); };
        turn(ev);
        const up = () => { wheel.removeEventListener("pointermove", turn); wheel.removeEventListener("pointerup", up); wheel.removeEventListener("pointercancel", up); };
        wheel.addEventListener("pointermove", turn); wheel.addEventListener("pointerup", up); wheel.addEventListener("pointercancel", up);
      });
      wheel.addEventListener("keydown", (e) => {
        const d = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key]; if (!d) return;
        e.preventDefault(); st.h = wrapH(st.h + d); hue.value = String(Math.round(st.h)); onChange(paint());
      });
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
      const entry = curEntry();
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
      const P = paletteFor(book);
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
        <div class="sb-seg" role="radiogroup" aria-label="Border">${BORDER_CHOICES.map(([k, n]) => { const ic = { none: "edgeNone", top: "edgeTop", bottom: "edgeBottom", left: "edgeLeft", right: "edgeRight", all: "edgeAll" }[k]; return `<button type="button" role="radio" data-border="${k}" aria-checked="${b === k}" title="Border: ${esc(n)}" aria-label="Border: ${esc(n)}">${ic ? sbIcon(ic, n) : n}</button>`; }).join("")}</div>
        <div class="sb-seg sb-seg-words" role="radiogroup" aria-label="Border width" ${b === "auto" || b === "none" ? "hidden" : ""}>${[["narrow", "Narrow", "ruleNarrow"], ["standard", "Standard", "ruleStandard"], ["broad", "Broad", "ruleBroad"]].map(([k, n, ic]) => `<button type="button" role="radio" data-borderw="${k}" aria-checked="${w === k}" title="Band width: ${esc(n)}" aria-label="Band width: ${esc(n)}">${sbIcon(ic, n)}</button>`).join("")}</div>
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
      "In the foot band. Empty takes the album's own.");
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
      const entry = curEntry();
      const caps = fieldCaps();
      if (sel < 0) {
        const layout = coverLayoutOf(book);
        box.innerHTML = `<div class="sb-field"><span class="sb-label">Cover layout</span>
            <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Cover layout">${COVER_LAYOUTS.map(([k, nm]) => `<button type="button" role="radio" data-coverlayout="${k}" aria-checked="${layout === k}">${nm}</button>`).join("")}</div>
            <p class="sb-hint">${esc(COVER_LAYOUT_NOTE[layout])}</p></div>`
          + (layout === "custom" ? `<div id="sbCoverFree"></div>` : `
          ${fieldHtml({ k: "title", label: "Title", ctl: "input" }, book.title || "", 80)}
          ${fieldHtml({ k: "subtitle", label: "Line under the title", ctl: "input" }, book.subtitle || "", 120)}
          ${coverLinesHtml()}`);
        $$("[data-coverlayout]").forEach((b) => b.addEventListener("click", () => {
          const k = b.dataset.coverlayout;
          if (k === layout) return;
          mark();
          if (k === "classic") delete book.coverLayout; else book.coverLayout = k;
          if (k === "custom") coverEntry(book);
          closeInline(false); photoSel = null; blockSel = -1; active = 0; pickerOpen = null;
          change({ rail: true }); drawInspector();
          const again = $(`[data-coverlayout="${k}"]`); if (again) again.focus();
        }));
        if (layout === "custom") { drawFreeFields($("#sbCoverFree"), coverEntry(book)); return; }
        wireField($("#sbF_title"), (v) => { book.title = v; }, 80);
        wireField($("#sbF_subtitle"), (v) => { book.subtitle = v; }, 120);
        wireCoverLines();
        wireFormat(box, styleHost(null));
        return;
      }
      if (entry.type === "look") {
        const LIM = window.STUDIO_BOOK_LIMITS || {};
        const no = lookNumber(book, entry);
        const ph = ["e.g. Jacket · Ritu Kumar", "e.g. Trousers · Péro", "e.g. Styling · name", "e.g. Hair and make-up · name"];
        box.innerHTML = `${overHtml("sbOvLabel", "Small line", entry.label, PT().label, `Look ${String(no).padStart(2, "0")}`, "Numbered by its place among the looks. Type to say something else.")}
          ${fieldHtml({ k: "title", label: "The look's name", ctl: "input", ph: "e.g. Monsoon linen" }, entry.title || "", (caps.look || {}).title || 40)}
          <div class="sb-field"><span class="sb-label">Lines under it</span>${[0, 1, 2, 3].map((i) => `<input type="text" id="sbLook_line${i}" maxlength="${LIM.lookLine || 60}" value="${esc(((entry.lines || [])[i]) || "")}" placeholder="${esc(ph[i])}" aria-label="Line ${i + 1}">`).join("")}
            <p class="sb-hint">Garments, who made them, who styled the look. Empty lines are left out.</p></div>
          ${creditHtml(entry)}`;
        wireOver("sbOvLabel", setOver(entry, "label"));
        wireField($("#sbF_title"), (v) => { entry.title = v; }, (caps.look || {}).title || 40);
        for (const i of [0, 1, 2, 3]) {
          const el = $(`#sbLook_line${i}`); if (!el) continue;
          el.addEventListener("input", () => {
            const lines = Array.isArray(entry.lines) ? entry.lines.slice() : [];
            while (lines.length <= i) lines.push("");
            lines[i] = el.value;
            while (lines.length && !String(lines[lines.length - 1]).trim()) lines.pop();
            if (lines.length) entry.lines = lines; else delete entry.lines;
            change({ rail: false, typing: true });
          });
        }
        wireCredit(entry);
        wireFormat(box, styleHost(entry));
        return;
      }
      if (entry.type === "end") {
        const back = endLayoutOf(entry) === "back";
        const LIM = window.STUDIO_BOOK_LIMITS || {};
        const { defaults } = endLines(entry);
        box.innerHTML = `<div class="sb-field"><span class="sb-label">Which end page</span>
            <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Which end page">${[["back", "Back cover"], ["closing", "Closing page"]].map(([k, nm]) => `<button type="button" role="radio" data-endlayout="${k}" aria-checked="${(back ? "back" : "closing") === k}">${nm}</button>`).join("")}</div>
            <p class="sb-hint">${back ? "Your mark, your name and how to reach you, on the book's last page." : "A last photograph if you like, a line to sign off with, and a small line under it."}</p></div>`
          + (back
            ? `<div class="sb-field"><span class="sb-label">Three lines under your name</span>${[0, 1, 2].map((i) => `<input type="text" id="sbEnd_line${i}" maxlength="${LIM.endLine || 40}" value="${esc(((entry.lines || [])[i]) || "")}" placeholder="${esc(defaults[i] || "—")}" aria-label="Line ${i + 1}">`).join("")}
               <p class="sb-hint">Left empty, the lines are your email, Instagram and website.</p></div>
               <label class="sb-check-row"><input type="checkbox" id="sbEndLines" ${entry.noLines ? "" : "checked"}> Print the three lines</label>`
            : fieldHtml({ k: "text", label: "The line", ctl: "line", rows: 2, ph: "Thank you for looking." }, entry.text || "", (caps.end || {}).text || 160)
              + fieldHtml({ k: "note", label: "Small line under it", ctl: "input", ph: `© ${year()} ${studio()}` }, entry.note || "", (caps.end || {}).note || 60));
        $$("[data-endlayout]").forEach((b) => b.addEventListener("click", () => {
          const k = b.dataset.endlayout;
          if ((back ? "back" : "closing") === k) return;
          mark();
          entry.layout = k;
          if (k === "back") { delete entry.photos; } else { entry.photos = Array.isArray(entry.photos) ? entry.photos : []; delete entry.lines; delete entry.noLines; }
          closeInline(false); photoSel = null; active = 0; pickerOpen = null;
          change({ rail: true }); drawInspector();
          const again = $(`[data-endlayout="${k}"]`); if (again) again.focus();
        }));
        for (const i of [0, 1, 2]) {
          const el = $(`#sbEnd_line${i}`); if (!el) continue;
          el.addEventListener("input", () => {
            const lines = Array.isArray(entry.lines) ? entry.lines.slice() : [];
            while (lines.length <= i) lines.push("");
            lines[i] = el.value;
            while (lines.length && !String(lines[lines.length - 1]).trim()) lines.pop();
            if (lines.length) entry.lines = lines; else delete entry.lines;
            change({ rail: false, typing: true });
          });
        }
        const cb = $("#sbEndLines");
        if (cb) cb.addEventListener("change", () => { mark(); if (cb.checked) delete entry.noLines; else entry.noLines = true; change({ rail: false }); });
        if ($("#sbF_text")) wireField($("#sbF_text"), (v) => { entry.text = v; }, (caps.end || {}).text || 160);
        if ($("#sbF_note")) wireField($("#sbF_note"), (v) => { entry.note = v; }, (caps.end || {}).note || 60);
        if (!back) wireFormat(box, styleHost(entry));
        return;
      }
      if (entry.type === "more") {
        const c = contOf(book, sel);
        const src = c.src, srcIdx = src ? book.pages.indexOf(src) : -1;
        const name = src ? (oneParagraph(src.headline || src.heading).join(" ") || PAGE_LABEL[src.type]) : "";
        box.innerHTML = src
          ? `<p class="sb-hint">This page carries on <b>${esc(name)}</b> from page ${String(c.fromN).padStart(2, "0")}. Its words are typed there, and so is how they look: write on, and they flow onto this page. ${c.text ? "" : "Right now everything fits before it, so this page is empty."}</p>
             <button type="button" class="sb-btn" id="sbGoStory">Go to the story</button>
             <p class="sb-hint">Need more room still? Add another Story continued page after this one.</p>`
          : `<p class="sb-warn">A Story continued page goes straight after a story, a letter or a story with a full-page photo, and takes the words that don't fit there.</p>`;
        const go = $("#sbGoStory"); if (go) go.addEventListener("click", () => { select(srcIdx); setTabPage(); });
        return;
      }
      if (entry.type === "contents") {
        box.innerHTML = `${fieldHtml({ k: "heading", label: "Heading", ctl: "input", ph: "Contents" }, entry.heading || "", (caps.contents || {}).heading || 60)}
          <p class="sb-hint">The list makes itself from your chapter pages and every page with a title — stories, letters, notes, looks and the studio pages — with the page numbers they will print on. Move a page and the list follows.</p>`;
        wireField($("#sbF_heading"), (v) => { entry.heading = v; }, (caps.contents || {}).heading || 60);
        wireFormat(box, styleHost(entry));
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
        /* Every split these photographs can make, named as the studio would
           say it: 2 + 2, 3 + 1, 4 + 1. It offered only a row of THREE, on top
           or at the bottom, so four photographs could be 3 + 1 and never
           2 + 2 by choice. An older book's "3top" is shown as the split it
           has always meant. */
        const splitNow = (() => {
          const v = entry.rows;
          if (typeof v === "string") {
            if (v === "2across") return v;
            const m = v.match(/^(\d+)\+(\d+)$/);
            if (m) return v;
            if (v === "3top" && nPhotos > 3) return `3+${nPhotos - 3}`;
            if (v === "3bottom" && nPhotos > 3) return `${nPhotos - 3}+3`;
          }
          return "";
        })();
        /* Two photographs can stand beside each other or one above the other.
           Auto decides from their shapes, which is right nearly always and is
           not a choice — the studio asked to be able to say. */
        const splits = nPhotos === 2 ? ["2across", "1+1"]
          : nPhotos >= 3 && nPhotos <= 6
            ? Array.from({ length: nPhotos - 1 }, (_, i) => `${i + 1}+${nPhotos - 1 - i}`)
            : [];
        const splitName = (k) => k === "2across" ? "Side by side"
          : k === "1+1" && nPhotos === 2 ? "One above the other"
          : k.replace("+", " + ");
        box.innerHTML = (splits.length ? `<div class="sb-field"><span class="sb-label">Rows on this page</span>
            <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="How the photographs divide into rows">${[["", "Auto"], ...splits.map((k) => [k, splitName(k)])].map(([k, n]) => `<button type="button" role="radio" data-rows="${k}" aria-checked="${splitNow === k}">${n}</button>`).join("")}</div>
            <p class="sb-hint">${!splitNow ? "Auto follows how many photographs there are and their shapes."
              : splitNow === "2across" ? "Both photographs in one row."
              : `${splitNow.split("+")[0]} photograph${splitNow.split("+")[0] === "1" ? "" : "s"} on top, ${splitNow.split("+")[1]} beneath.`}</p></div>` : "")
          + pageLookHtml(entry, nPhotos)
          + fieldHtml({ k: "caption", label: "Caption for this page (optional)", ctl: "input", ph: "e.g. Monsoon edit, shot on the roof in Sector 46" }, entry.caption || "", (caps.photos || {}).caption || 90)
          + creditHtml(entry)
          + `<p class="sb-hint">Published books are public.</p>`
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
        wirePageLook(entry, drawFields);
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
    /* Space between the photographs and their numbers, for one page. The
       studio looked for both on This page and found them only in Design,
       which sets every page at once (Sep 25 2026). On a photos page the
       choice is kept and the style draws it; on an Anything page the studio
       placed each photograph, so spacing lines them up once, in rows and
       columns, and they can still be dragged after. */
    const PAGE_GAP_MM = { none: 0, narrow: 2, medium: 4, wide: 8 };
    function pageLookHtml(entry, nPhotos, free = false) {
      if (!nPhotos) return "";
      const gapBtns = free
        ? GAP_LABEL.map(([k, n]) => `<button type="button" data-pagegap="${k}" title="Line the photographs up with ${esc(n.toLowerCase())} space between them">${n}</button>`).join("")
        : [["", "Book's"], ...GAP_LABEL].map(([k, n]) => `<button type="button" role="radio" data-pagegap="${k}" aria-checked="${(entry.gap || "") === k}">${n}</button>`).join("");
      const numsNow = typeof entry.nums === "boolean" ? String(entry.nums) : "";
      const numOpts = free ? [["", "Off"], ["true", "On"]] : [["", "Book's"], ["true", "Show"], ["false", "Hide"]];
      const bookGap = GAP_LABEL.find(([k]) => k === (book.spacing || "medium"))[1].toLowerCase();
      return `<div class="sb-field"><span class="sb-label">Space between photographs</span>
          <div class="sb-seg sb-seg-sm" ${free ? 'role="group"' : 'role="radiogroup"'} aria-label="Space between photographs on this page">${gapBtns}</div>
          <p class="sb-hint">${free ? "Lines the photographs up in their rows and columns with this much space between them. You can still drag them after." : entry.gap ? "This page only. Every page at once: Design." : `The book's spacing (${bookGap}), set in Design.`}</p></div>
        <div class="sb-field"><span class="sb-label">Numbers on the photographs</span>
          <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Numbers on the photographs on this page">${numOpts.map(([k, n]) => `<button type="button" role="radio" data-pagenums="${k}" aria-checked="${(free ? (entry.nums === true ? "true" : "") : numsNow) === k}">${n}</button>`).join("")}</div>
          <p class="sb-hint">${free ? "01, 02, 03 on each photograph, in the order they are listed above." : numsNow ? "This page only. Every page at once: Design." : `The book's setting (${plateDefault(book) ? "shown" : "hidden"}), set in Design.`}</p></div>`;
    }
    function wirePageLook(entry, redraw, free = false) {
      $$("[data-pagegap]").forEach((b) => b.addEventListener("click", () => {
        const k = b.dataset.pagegap;
        if (free) {
          mark();
          const G = geometry(book), mm = PAGE_GAP_MM[k] || 0;
          spacePhotos(blocksOf(entry).filter((x) => x.k === "photo" && !(Math.abs(+x.r || 0) > 0.05)), mm / G.Wa, mm / G.Ha);
          change({ rail: true }); drawLayer(); redraw();
          const again = $(`[data-pagegap="${k}"]`); if (again) again.focus();
          return;
        }
        if ((entry.gap || "") === k) return;
        mark();
        if (k) entry.gap = k; else delete entry.gap;
        change({ rail: true }); redraw();
        const again = $(`[data-pagegap="${k}"]`); if (again) again.focus();
      }));
      $$("[data-pagenums]").forEach((b) => b.addEventListener("click", () => {
        const k = b.dataset.pagenums, now = typeof entry.nums === "boolean" ? String(entry.nums) : "";
        if (now === k) return;
        mark();
        if (k) entry.nums = k === "true"; else delete entry.nums;
        change({ rail: true }); redraw();
        const again = $(`[data-pagenums="${k}"]`); if (again) again.focus();
      }));
    }
    /* Another layout for an Anything page, keeping what is on it: photographs
       go into the new photo places in order (their crop reset to fill the new
       frame, their focus kept), words go to places of the same kind first,
       then to any empty box; whatever the layout has no place for stays where
       it was, on top. The old layout's own colour blocks and lines give way to
       the new one's. */
    function applyLayout(entry, key) {
      const tpl = FREE_STARTS[key]; if (!tpl || !entry) return;
      const old = blocksOf(entry);
      const photos = old.filter((b) => b.k === "photo" && b.p && b.p.id);
      const texts = old.filter((b) => b.k === "text" && String(b.t || "").trim());
      const usedP = new Set(), usedT = new Set();
      const out = tpl.map((t) => {
        const nb = { ...t, ...(t.style ? { style: { ...t.style } } : {}) };
        if (t.k === "text") nb.t = "";
        if (t.k === "photo") {
          const ph = photos.find((x) => !usedP.has(x));
          if (ph) { usedP.add(ph); nb.p = { ...ph.p, zoom: 1 }; }
        }
        if (t.k === "text") {
          const same = texts.find((x) => !usedT.has(x) && (x.role || "body") === (t.role || "body"));
          if (same) { usedT.add(same); nb.t = same.t; if (same.style) nb.style = { ...(nb.style || {}), ...same.style }; if (same.fit) nb.fit = same.fit; }
        }
        return nb;
      });
      for (const nb of out) if (nb.k === "text" && !nb.t) { const any = texts.find((x) => !usedT.has(x)); if (any) { usedT.add(any); nb.t = any.t; if (any.style) nb.style = { ...(nb.style || {}), ...any.style }; } }
      for (const b of old) if ((b.k === "photo" && b.p && b.p.id && !usedP.has(b)) || (b.k === "text" && String(b.t || "").trim() && !usedT.has(b))) out.push(b);
      mark();
      entry.blocks = out.slice(0, FREE_MAX);
      blockSel = -1;
      change({ rail: true, photos: true });
      drawInspector();
      API.toast(`Layout: ${LAYOUT_NAME[key] || key} · Ctrl+Z to go back`);
    }
    function drawFreeFields(box, entry) {
      const G = geometry(book);
      const blocks = blocksOf(entry);
      const b = blocks[blockSel] || null;
      const P = paletteFor(book);
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
        ${b ? "" : `<details class="sb-pick sb-layouts"><summary>Change the layout</summary>
          ${LAYOUT_GROUPS.map((g) => `<p class="sb-label">${esc(g.group)}</p><div class="sb-layoutgrid">${g.items.map(([k, n]) => `<button type="button" class="sb-layoutbtn" data-layout="${k}" title="${esc(n)}">${addIcon(`free:${k}`)}<span>${esc(n)}</span></button>`).join("")}</div>`).join("")}
          <p class="sb-hint">Your photographs and words move into the new layout, headlines to headlines and photographs in order; anything it has no place for stays where it is. Ctrl+Z goes back.</p></details>`}
        <h3>Add to this page</h3>
        <div class="sb-adds">
          <button type="button" data-addblk="text">+ Words</button>
          <button type="button" data-addblk="photo">+ Photo</button>
          <button type="button" data-addblk="shape">+ Shape</button>
          <button type="button" data-addblk="line">+ Line</button>
          <button type="button" data-addblk="draw" aria-pressed="${drawing}">✎ Draw by hand</button>
        </div>
        <p class="sb-hint">${blocks.length} of ${FREE_MAX} things. Drag anything to move it and the round handle to turn it (Shift for 15° steps). Pull a photograph's edge to crop it, its corner to resize it. Arrow keys nudge.</p>
        <h3>On this page</h3>
        ${blocks.length ? `<ol class="sb-blklist">${blocks.map((x, i) => `<li class="sb-blkrow">
            <button type="button" data-pickblk="${i}" aria-pressed="${i === blockSel}">${esc(blockLabel(x))}</button>
            <button type="button" data-blkup="${i}" aria-label="Send back" ${i === 0 ? "disabled" : ""}>▲</button>
            <button type="button" data-blkdown="${i}" aria-label="Bring forward" ${i === blocks.length - 1 ? "disabled" : ""}>▼</button>
            <button type="button" data-blkdel="${i}" aria-label="Remove">✕</button></li>`).join("")}</ol>
          <p class="sb-hint">The last one is on top.</p>` : `<p class="sb-hint">Nothing on this page yet. Add something above, or start again from an arrangement in “+ Add page”.</p>`}
        ${b ? "" : pageLookHtml(entry, blocks.filter((x) => x.k === "photo").length, true)}
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
      box.querySelectorAll("[data-layout]").forEach((x) => x.addEventListener("click", () => applyLayout(entry, x.dataset.layout)));
      $$("[data-pickblk]").forEach((x) => x.addEventListener("click", () => { blockSel = +x.dataset.pickblk; drawLayer(); drawInspector(); }));
      $$("[data-blkup]").forEach((x) => x.addEventListener("click", () => moveBlock(+x.dataset.blkup, -1)));
      $$("[data-blkdown]").forEach((x) => x.addEventListener("click", () => moveBlock(+x.dataset.blkdown, 1)));
      $$("[data-blkdel]").forEach((x) => x.addEventListener("click", () => removeBlock(+x.dataset.blkdel)));
      $$("[data-bg]").forEach((x) => x.addEventListener("click", () => { mark(); if (x.dataset.bg) entry.bg = x.dataset.bg; else delete entry.bg; redraw(); }));
      if (!b) wirePageLook(entry, drawInspector, true);
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
      const entry = curEntry();
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
      const entry = curEntry();
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
      const entry = curEntry();
      if (sel < 0 && coverLayoutOf(book) === "poster") return null;
      if (!entry) return { list: book.cover ? [book.cover] : [], max: 1, set: (l) => { book.cover = l[0] || null; } };
      // On an Anything page the picker works on the chosen photo box.
      if (entry.type === "free") {
        const b = curBlock();
        if (!b || b.k !== "photo") return null;
        return { list: b.p ? [b.p] : [], max: 1, set: (l) => { if (l[0]) b.p = l[0]; else delete b.p; } };
      }
      if (!entry.photos) return null;
      return { list: entry.photos, max: entry.type === "photos" ? MAX_PER_PAGE : (entry.type === "feature" || entry.type === "look") ? 2 : 1, set: (l) => { entry.photos = l; } };
    }
    function drawPhotoBlock() {
      const box = $("#sbPhotoBlock"); if (!box) return;
      const entry = curEntry();
      const t = photoTarget();
      if (!t) { box.innerHTML = ""; box.hidden = true; return; }
      box.hidden = false;
      const lib = library();
      const list = t.list;
      if (active >= list.length) active = Math.max(0, list.length - 1);
      const cur = list[active];
      const heading = !entry ? "Cover photo" : entry.type === "photos" ? `Photos · ${list.length} of ${t.max}` : (entry.type === "feature" || entry.type === "look") ? `Photos · ${list.length} of 2` : (entry.type === "spread" || entry.type === "note" || entry.type === "article") ? "The photo" : "Photo (optional)";
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
          <div class="sb-seg sb-seg-words" role="radiogroup" aria-label="${positionLabel}">${positions.map((k) => `<button type="button" role="radio" data-photoat="${k}" aria-checked="${at === k}" title="${esc(POSITION_LABEL[k])}" aria-label="${esc(positionLabel)}: ${esc(POSITION_LABEL[k])}">${POSITION_ICON[k] ? sbIcon(POSITION_ICON[k], POSITION_LABEL[k]) : POSITION_LABEL[k]}</button>`).join("")}</div></div>` : ""}
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
            <div class="sb-seg" role="radiogroup" aria-label="Placement">${FIT_CHOICES.map(([k, n]) => { const ic = { fill: "fitFill", whole: "fitWhole", width: "fitWidth", height: "fitHeight" }[k]; return `<button type="button" role="radio" data-fit="${k}" aria-checked="${mode === k}" title="${esc(n)}" aria-label="${esc(n)}">${ic ? sbIcon(ic, n) : n}</button>`; }).join("")}</div>
            <p class="sb-hint">${esc(FIT_HINT[mode])}</p></div>
          <label class="sb-range">Zoom <input type="range" min="1" max="3" step="0.05" value="${cur.zoom || 1}" data-slide="zoom"></label>
          <label class="sb-range">Left ↔ right <input type="range" min="0" max="1" step="0.01" value="${cur.x}" data-slide="x"></label>
          <label class="sb-range">Up ↕ down <input type="range" min="0" max="1" step="0.01" value="${cur.y}" data-slide="y"></label>`}
          <label class="sb-range">Opacity <input type="range" min="10" max="100" step="5" value="${Math.round(opacity * 100)}" data-opacity aria-valuetext="${Math.round(opacity * 100)} percent"></label>
          ${isDiagram(cur.id) ? "" : `<div class="sb-field"><span class="sb-label">Flip</span><span class="sb-seg sb-seg-sm">${[["h", "↔ Left to right"], ["v", "↕ Top to bottom"]].map(([k, n]) => `<button type="button" data-flip="${k}" aria-pressed="${String(cur.flip || "").includes(k)}">${n}</button>`).join("")}</span></div>`}
        </div>` : ""}
        <details class="sb-pick" ${open ? "open" : ""}>
          <summary>${list.length ? (t.max === 1 ? "Change the photo" : "Add or remove photos") : "Choose a photo"}</summary>
          <label class="sb-vh" for="sbAlbum">Show</label>
          <select id="sbAlbum">
            <option value="all" ${filter === "all" ? "selected" : ""}>All albums (${lib.byId.size})</option>
            <option value="diagrams" ${filter === "diagrams" ? "selected" : ""}>Lighting diagrams (${lib.diagrams})</option>
            ${lib.albums.map((a) => `<option value="${esc(a.id)}" ${filter === a.id ? "selected" : ""}>${esc(a.name)} (${a.count})${a.hidden ? " · not on the site" : ""}</option>`).join("")}
          </select>
          ${(lib.albums.find((a) => a.id === filter) || {}).outside
            ? `<p class="sb-hint">Photographs from this computer. They are kept here, not in an album, and the ones marked “print only” are never uploaded anywhere.</p>`
            : (lib.albums.find((a) => a.id === filter) || {}).hidden ? `<p class="sb-hint">This album is hidden from the site, a book-only album. Only the book shows its photos.</p>` : ""}
          <!-- A photograph the site has never seen. Asked for by the studio:
               something from the desktop that is in no album. -->
          <div class="sb-outside">
            <button type="button" class="sb-btn" id="sbOutsideAdd">Add from this computer…</button>
            <input type="file" id="sbOutsideFile" multiple accept="image/*" hidden>
            <span class="sb-hint" id="sbOutsideNote"></span>
          </div>
          <div class="sb-grid">${shown.map(([id, hit]) => {
            const pos = list.findIndex((s) => s.id === id);
            const on = pos >= 0;
            const full = !on && list.length >= t.max && t.max > 1;
            const pick = `<button type="button" class="sb-thumb${hit.photo.diagram ? " diagram" : ""}" data-pick="${esc(id)}" aria-pressed="${on}" data-order="${on && t.max > 1 ? pos + 1 : on ? "✓" : ""}" ${full ? "disabled" : ""} aria-label="${esc(hit.photo.outside ? (hit.photo.name || "photograph from this computer") : cleanName(hit.shoot.title || hit.shoot.talent))} ${hit.photo.diagram ? "lighting diagram" : "photo"}${on ? ", chosen" : ""}"><img src="${esc(thumbSrc(hit.photo))}" alt="" loading="lazy"></button>`;
            // A photograph from this computer can be taken out of the store
            // again (K3); one already in a book page is kept until it is
            // taken off the page, so a page never silently goes blank.
            return hit.photo.outside
              ? `<span class="sb-thumb-wrap">${pick}<button type="button" class="sb-thumb-rm" data-out-remove="${esc(id)}" aria-label="Remove ${esc(hit.photo.name || "this photograph")} from this computer's list" title="Remove from this list">×</button></span>`
              : pick;
          }).join("") || `<p class="sb-hint" style="grid-column: 1 / -1">${filter === "diagrams" ? "No lighting diagrams yet. Add one to an album on the Upload page (Lighting diagram), and it appears here." : "No photos in this album."}</p>`}</div>
        </details>`;

      /* Taking a photograph in from the desktop. It is read here and never
         sent anywhere by this step; where it ends up is asked once, per
         photograph, because the two answers are not alike: one stays on this
         machine and one goes into a PUBLIC repository, where it can be
         downloaded by anyone and stays in the history even if it is later
         removed. Print only is the default for that reason. */
      const outBtn = box.querySelector("#sbOutsideAdd");
      const outFile = box.querySelector("#sbOutsideFile");
      const outNote = box.querySelector("#sbOutsideNote");
      if (outBtn && outFile) {
        outBtn.addEventListener("click", () => outFile.click());
        outFile.addEventListener("change", async () => {
          const files = [...(outFile.files || [])].filter((f) => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name || ""));
          outFile.value = "";
          if (!files.length) return;
          const forSite = await askWhereOutsideGoes(files.length);
          if (forSite === null) return;
          outNote.textContent = `Reading ${files.length} photograph${files.length > 1 ? "s" : ""}…`;
          let added = 0;
          const refused = [];
          for (const f of files) {
            try {
              /* Drawn before it is kept, and shrunk the way an uploaded photo
                 is. A file this browser cannot draw — an iPhone HEIC in
                 Chrome, a damaged JPEG — used to be stored anyway and printed
                 as a blank column while the check said "All good" (Sep 2026
                 audit, K3). It is refused by name now. */
              const dataUrl = typeof API.webPhoto === "function" ? await API.webPhoto(f, 1600, 0.86) : null;
              if (!dataUrl) { refused.push(f.name || "a file"); continue; }
              const id = `out_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
              await outPut({ id, name: f.name || "", dataUrl, forSite: !!forSite, at: Date.now() });
              added++;
            } catch (e) { refused.push(f.name || "a file"); }
          }
          await outsideRefresh();
          filter = OUTSIDE_ALBUM;
          if (forSite && added) await syncOutsideToAlbum();
          drawPhotoBlock();
          // Said after the redraw, which used to wipe it before it was seen.
          const msg = (added ? `${added} photograph${added > 1 ? "s" : ""} added${forSite ? " — they go to the site on your next publish." : " — kept on this computer."}` : "")
            + (refused.length ? `${added ? " " : ""}NOT added (this browser cannot draw ${refused.length > 1 ? "them" : "it"}): ${refused.slice(0, 3).join(", ")}${refused.length > 3 ? "…" : ""}. iPhone HEIC photos: export them as JPEG first.` : "");
          const note = box.querySelector("#sbOutsideNote") || document.querySelector("#sbOutsideNote");
          if (note) note.textContent = msg;
          if (refused.length) API.toast(`NOT added — this browser cannot draw ${refused.slice(0, 3).map((n) => `“${n}”`).join(", ")}. iPhone HEIC photos: export them as JPEG first.`);
          else if (added) API.toast(msg);
        });
      }

      box.querySelectorAll("[data-out-remove]").forEach((b) => b.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = b.dataset.outRemove;
        const inUse = (book.pages || []).some((pg) => JSON.stringify(pg).includes(`"${id}"`)) || JSON.stringify(book.cover || {}).includes(`"${id}"`);
        if (inUse) { API.toast("NOT removed — this photograph is on a page of this book. Take it off the page first."); return; }
        await outDel(id);
        await outsideRefresh();
        drawPhotoBlock();
        API.toast("Removed from this computer's list.");
      }));
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
      box.querySelectorAll("[data-flip]").forEach((b) => b.addEventListener("click", () => {
        const l = photoTarget().list.slice();
        const next = { ...l[active] };
        const has = new Set(String(next.flip || "").split("").filter((c) => c === "h" || c === "v"));
        if (has.has(b.dataset.flip)) has.delete(b.dataset.flip); else has.add(b.dataset.flip);
        const v = ["h", "v"].filter((c) => has.has(c)).join("");
        if (v) next.flip = v; else delete next.flip;
        mark();
        l[active] = next; setList(l); change({ rail: false });
        b.setAttribute("aria-pressed", String(has.has(b.dataset.flip)));
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
        const grid = box.querySelector(".sb-grid"), scroll = grid ? grid.scrollTop : 0, gridTop = grid ? grid.getBoundingClientRect().top : null;
        change({ photos: true });
        const g2 = $("#sbPhotoBlock .sb-grid"); if (g2) { g2.scrollTop = scroll; if (gridTop !== null) holdInView(g2, gridTop); }
        patchRail();
        if (entry && entry.type === "photos") drawFields();   // a border depends on how many photos
        const again = $(`#sbPhotoBlock [data-pick="${window.CSS && window.CSS.escape ? window.CSS.escape(id) : id}"]`);
        if (again) again.focus({ preventScroll: true }); else refocus("summary");
      }));
    }

    // The grid of photos stays where it was under the finger: the panel (or
    // the page, on a phone, where the document is what scrolls) moves by
    // exactly what grew above it when the photo's own tools appeared.
    function holdInView(el, wasTop) {
      const r = el.getBoundingClientRect();
      if (!r.height) return;                       // the picker closed behind the pick: nothing to hold
      const d = r.top - wasTop;
      if (Math.abs(d) < 1) return;
      const panel = el.closest(".sb-panel");
      // Instant, not the site's smooth scroll: a glide here reads as the grid sliding away.
      if (panel && getComputedStyle(panel).overflowY !== "visible") panel.scrollTo({ top: panel.scrollTop + d, behavior: "instant" });   // the panel scrolls (laptop)
      else window.scrollBy({ top: d, behavior: "instant" });                                                                             // the page scrolls (phone)
    }

    /* --- the inspector: design --- */
    // The Design panel's colour swatches, repainted for the book's colourway.
    function refreshDesignColours() {
      const panel = $("#sbPanelDesign"); if (!panel) return;
      const P = paletteFor(book), own = isOwnColourway(book.colourway);
      panel.querySelectorAll("[data-cw]").forEach((x) => x.setAttribute("aria-checked", String(!own && book.colourway === x.dataset.cw)));
      const any = panel.querySelector("[data-cwany]"), lab = panel.querySelector("[data-cwanyhex]");
      if (any) { any.setAttribute("aria-pressed", String(own)); any.querySelector("i").style.background = own ? book.colourway : "conic-gradient(#f33, #ff3, #3f3, #3ff, #33f, #f3f, #f33)"; }
      if (lab) lab.textContent = own ? book.colourway : "";
      const tint = { paper: P.paper, white: P.white, ink: P.ink, soft: P.soft, accent: P.accent, deep: P.deep, rule: P.rule };
      panel.querySelectorAll("[data-bookbg]").forEach((x) => { const c = tint[x.dataset.bookbg]; if (c) x.querySelector("i").style.background = c; });
      // The number chip's swatches follow the colourway too, and its first
      // one is the style's own accent, which has no key of its own.
      panel.querySelectorAll("[data-plate]").forEach((x) => { const c = x.dataset.plate ? tint[x.dataset.plate] : P.accent; if (c) x.querySelector("i").style.background = c; });
    }
    // Each style's card shows this book's cover and first page drawn in it:
    // small, one after another, and again whenever the book has changed.
    let stylePicToken = 0, stylePicsFor = "";
    async function drawStylePics(force) {
      const panel = $("#sbPanelDesign"); if (!panel || panel.hidden || !panel.querySelector(".sb-stylepic")) return;   // drawn when Design is looked at
      const first = book.pages.findIndex((pg) => pg && pageSpan(pg) === 1);
      const sig = JSON.stringify([book.colourway, book.orientation, book.paper, book.title, book.subtitle, book.cover, book.coverLayout, book.coverText, book.coverStyle, book.bg, first >= 0 ? book.pages[first] : null]);
      if (!force && sig === stylePicsFor && !panel.querySelector(".sb-stylepic:empty")) return;
      stylePicsFor = sig;
      const token = ++stylePicToken, cache = new Map(), snap = JSON.parse(JSON.stringify(book));
      try { await ensureStyleFonts(); } catch (e) { /* drawn in what is there */ }
      for (const st of STYLES) {
        if (token !== stylePicToken || !panel.isConnected) return;
        const slot = panel.querySelector(`[data-style="${st.key}"] .sb-stylepic`); if (!slot) continue;
        const got = [];
        try { for await (const r of renderPages({ ...snap, style: st.key }, { dpi: 13, cache, only: first >= 0 ? [-1, first] : -1 })) got.push(r.page.canvas); } catch (e) { continue; }
        if (token === stylePicToken && slot.isConnected) slot.replaceChildren(...got);
      }
    }
    // The book's text styles, edited through the same Format controls as one text.
    const typesetHost = { get: () => book.typeset, set: (v) => { if (v) book.typeset = v; else delete book.typeset; } };
    function drawDesign() {
      const panel = $("#sbPanelDesign"); if (!panel) return;
      panel.innerHTML = `
        <div class="sb-sec"><h3>Style</h3>
          <div class="sb-styles" role="radiogroup" aria-label="Style">${STYLES.map((s) => `<button type="button" class="sb-style" role="radio" data-style="${s.key}" aria-checked="${book.style === s.key}"><span class="sb-stylepic" aria-hidden="true"></span><b>${esc(s.name)}</b><span>${esc(s.note)}</span></button>`).join("")}</div>
          <p class="sb-hint">Each is your own cover and first page, drawn in that style. Changing style keeps every page and every word.</p>
        </div>
        <div class="sb-sec"><h3>Colourway</h3>
          <div class="sb-cws" role="radiogroup" aria-label="Colourway">${COLOURWAYS.map((c) => `<button type="button" class="sb-cw" role="radio" data-cw="${c.key}" aria-checked="${book.colourway === c.key}"><span class="sb-dot" aria-hidden="true" style="background: conic-gradient(${c.accent} 0 50%, ${c.deep} 50% 75%, ${c.paper} 75% 100%)"></span>${esc(c.name)}</button>`).join("")}</div>
          <div class="sb-field sb-owncw"><span class="sb-label">Or your own, from one colour</span>
            <span class="sb-swatches" role="group" aria-label="Your own colourway">${anySwatch("cwany", isOwnColourway(book.colourway) ? book.colourway : "")}</span>
            <div class="sb-cphost" data-cwanypick hidden></div>
            <p class="sb-hint">Pick the main colour and the whole book follows: the bars and rules, the labels, the dark ground and the paper are all worked out from it. The wheel inside helps choose it.</p>
          </div>
        </div>
        <div class="sb-sec"><h3>Page shape</h3>
          <div class="sb-seg" role="radiogroup" aria-label="Page shape">${["portrait", "landscape"].map((o) => { const n = o === "portrait" ? "Portrait" : "Landscape"; return `<button type="button" role="radio" data-orient="${o}" aria-checked="${book.orientation === o}" title="${n}" aria-label="Page shape: ${n}">${sbIcon(o, n)}</button>`; }).join("")}</div>
        </div>
        <div class="sb-sec"><h3>Paper size</h3>
          <div class="sb-seg" role="radiogroup" aria-label="Paper size">${Object.entries(PAPERS).map(([k, p]) => `<button type="button" role="radio" data-paper="${k}" aria-checked="${(book.paper || "a4") === k}">${esc(p.name)}</button>`).join("")}</div>
          <p class="sb-hint" id="sbPaperNote">${esc((PAPERS[book.paper] || PAPERS.a4).note)}. Every size keeps the same layout; the words and photos scale with the page.</p>
        </div>
        <div class="sb-sec"><h3>Space between photographs</h3>
          <div class="sb-seg sb-seg-words" role="radiogroup" aria-label="Space between photographs">${GAP_LABEL.map(([k, n]) => { const ic = { none: "gapNone", narrow: "gapNarrow", medium: "gapMedium", wide: "gapWide" }[k]; return `<button type="button" role="radio" data-gap="${k}" aria-checked="${(book.spacing || "medium") === k}" title="Space between photographs: ${esc(n)}" aria-label="Space between photographs: ${esc(n)}">${ic ? sbIcon(ic, n) : n}</button>`; }).join("")}</div>
          <p class="sb-hint" id="sbGapNote">${(book.spacing || "medium") === "medium" ? "The style's own spacing." : (book.spacing === "none" ? "The photographs meet with no gutter at all." : book.spacing === "narrow" ? "Half the style's gutter." : "Nearly twice the style's gutter.")} It scales each style's own number, so the styles keep their proportions to one another.</p>
        </div>
        <div class="sb-sec"><h3>Page colour, every page</h3>
          <span class="sb-swatches" role="group" aria-label="Page colour for every page">${[["", "The style's own", "linear-gradient(135deg, #fff 45%, #999 50%, #fff 55%)"], ["paper", "Paper", paletteFor(book).paper], ["white", "White", paletteFor(book).white], ["ink", "Ink", paletteFor(book).ink], ["soft", "Soft", paletteFor(book).soft], ["accent", "Accent", paletteFor(book).accent], ["deep", "Deep", paletteFor(book).deep], ["rule", "Hairline", paletteFor(book).rule]].map(([k, n, c]) => `<button type="button" class="sb-swatch" data-bookbg="${k}" aria-pressed="${(book.bg || "") === k}" title="${n}" aria-label="${n}"><i style="background:${c}"></i></button>`).join("")}${anySwatch("bookbgany", /^#/.test(book.bg || "") ? book.bg : "")}</span>
          <div class="sb-cphost" data-bookbgpick hidden></div>
          <p class="sb-hint">Behind every page but the cover, in one go. A page can still have its own colour on This page.</p>
        </div>
        <div class="sb-sec"><h3>Line round the photographs</h3>
          <div class="sb-seg sb-seg-words" role="radiogroup" aria-label="Line round the photographs">${[["", "The style's own"], ["on", "Always"], ["off", "Never"]].map(([k, n]) => `<button type="button" role="radio" data-photolines="${k}" aria-checked="${(book.photoLines === false ? "off" : book.photoLines === "on" ? "on" : "") === k}">${n}</button>`).join("")}</div>
          <p class="sb-hint">A hairline round each photograph gives one shot on white an edge against the paper. Elegant draws it on its own; Always puts it in every style; Never leaves the photographs straight on the page. Borders you draw yourself on a page stay either way.</p>
        </div>
        <div class="sb-sec"><h3>Numbers on the photographs</h3>
          <label class="sb-check-row"><input type="checkbox" id="sbPlate" ${plateDefault(book) ? "checked" : ""}> Number each photograph on a page</label>
          <div id="sbPlateColour" ${plateDefault(book) ? "" : "hidden"}>
            <span class="sb-swatches" role="group" aria-label="Colour of the number chip">${[["", "The style's accent", paletteFor(book).accent], ["ink", "Ink", paletteFor(book).ink], ["soft", "Soft", paletteFor(book).soft], ["white", "White", paletteFor(book).white], ["rule", "Hairline", paletteFor(book).rule]].map(([k, n, c]) => `<button type="button" class="sb-swatch" data-plate="${k}" aria-pressed="${(book.photoNumColour || "") === k}" title="${n}" aria-label="Number chip: ${n}"><i style="background:${c}"></i></button>`).join("")}${anySwatch("plateany", /^#/.test(book.photoNumColour || "") ? book.photoNumColour : "")}</span>
            <div class="sb-cphost" data-platepick hidden></div>
          </div>
          <p class="sb-hint">The small 01, 02, 03 on the photographs, on every page at once. Modern prints them unless you say not; the other styles only if you say so. A page can have its own on This page.</p>
        </div>
        <div class="sb-sec" id="sbTypeset"><h3>Text styles</h3>
          <p class="sb-hint">One look for each kind of text, across the whole book: change Headlines once and every headline follows. A text you format on its own page keeps its own.</p>
          ${TYPE_ROLES.map(([k, n, note]) => `<div class="sb-typerole"><div class="sb-typename"><b>${esc(n)}</b><span>${esc(note)}</span></div>${formatHtml(k, typesetHost)}</div>`).join("")}
        </div>
        <div class="sb-sec"><h3>Top of every page</h3>
          <div class="sb-seg sb-seg-sm" role="radiogroup" aria-label="Running head">${[["", "None"], ["title", "Book title"], ["section", "Section"], ["both", "Both"]].map(([k, n]) => `<button type="button" role="radio" data-runhead="${k}" aria-checked="${(book.runHead || "") === k}">${n}</button>`).join("")}</div>
          <p class="sb-hint">A small line at the top of each page, like a magazine's. Section is the chapter page a page comes after; Both puts the title on left-hand pages and the section on right-hand ones. It is left off wherever the top of a page is already used.</p>
        </div>
        <div class="sb-sec"><h3>Baseline grid</h3>
          <label class="sb-check-row"><input type="checkbox" id="sbBaseline" ${book.baseline ? "checked" : ""}> Line up the body text on one grid</label>
          <p class="sb-hint">Every column of a story or letter starts on the same set of lines, so the lines sit level across columns and across facing pages. The grid shows faintly in the preview, never in the PDF.</p>
        </div>
        <div class="sb-sec"><h3>The foot of every page</h3>
          ${overHtml("sbFootText", "Name in the foot", book.footText, (window.STUDIO_BOOK_LIMITS || {}).footText || 40, studio())}
          <label class="sb-check-row"><input type="checkbox" id="sbNums" ${book.showPageNumbers === false ? "" : "checked"}> Print page numbers</label>
        </div>`;
      wireOver("sbFootText", (v) => { if (String(v).trim()) book.footText = v; else delete book.footText; });
      // Text styles use the same controls as one text's Format; a size in points means nothing for a whole kind of text.
      const tsBox = panel.querySelector("#sbTypeset");
      tsBox.querySelectorAll("[data-fmtpt]").forEach((x) => x.closest(".sb-fmtline").remove());
      wireFormat(tsBox, typesetHost);
      panel.querySelectorAll("[data-runhead]").forEach((b) => b.addEventListener("click", () => {
        mark();
        if (b.dataset.runhead) book.runHead = b.dataset.runhead; else delete book.runHead;
        panel.querySelectorAll("[data-runhead]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        change();
      }));
      $("#sbBaseline").addEventListener("change", (e) => { mark(); if (e.target.checked) book.baseline = true; else delete book.baseline; change(); });
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
      panel.querySelectorAll("[data-plate]").forEach((x) => x.addEventListener("click", () => {
        mark();
        if (x.dataset.plate) book.photoNumColour = x.dataset.plate; else delete book.photoNumColour;
        panel.querySelectorAll("[data-plate]").forEach((y) => y.setAttribute("aria-pressed", String(y === x)));
        const any = panel.querySelector("[data-plateany]"); if (any) any.setAttribute("aria-pressed", "false");
        change();
      }));
      wireAny(panel.querySelector("[data-plateany]"), panel.querySelector("[data-platepick]"), () => (/^#/.test(book.photoNumColour || "") ? book.photoNumColour : ""), (hex) => {
        mark(true); book.photoNumColour = hex;
        panel.querySelectorAll("[data-plate]").forEach((y) => y.setAttribute("aria-pressed", "false"));
        change();
      });
      $$("[data-photolines]").forEach((btn) => btn.addEventListener("click", () => {
        const k = btn.dataset.photolines;
        mark();
        if (k === "on") book.photoLines = "on"; else if (k === "off") book.photoLines = false; else delete book.photoLines;
        $$("[data-photolines]").forEach((x) => x.setAttribute("aria-checked", String(x === btn)));
        change();
      }));
      $("#sbPlate").addEventListener("change", (e) => {
        mark();
        // Whatever the style does on its own is left unwritten, so a book saved before stays as it was.
        const own = styleKey(book) === "modern";
        if (e.target.checked === own) delete book.photoNums; else book.photoNums = e.target.checked;
        // The colour governs nothing while the numbers are off.
        const box = $("#sbPlateColour"); if (box) box.hidden = !e.target.checked;
        change();
      });
      $("#sbNums").addEventListener("change", (e) => {
        if (e.target.checked) delete book.showPageNumbers; else book.showPageNumbers = false;
        change();
      });
      const radio = (selector, apply, current, first) => panel.querySelectorAll(selector).forEach((b) => b.addEventListener("click", async () => {
        if (current(b)) return;
        // A style's own faces arrive before its words are measured in them.
        if (first) { b.classList.add("is-busy"); try { await first(b); } catch (e) { /* drawn in what is there */ } b.classList.remove("is-busy"); if (!b.isConnected || current(b)) return; }
        const before = fontsOk ? new Set(bookCuts(book).filter((x) => x.cuts.length).map((x) => x.entry)) : null;
        panel.querySelectorAll(selector).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        mark();   // a style, colourway, shape or paper tried on can be undone
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
      // The style cards are this book drawn small: they follow its colourway, shape and paper.
      let picTimer = 0;
      const picsSoon = () => { clearTimeout(picTimer); picTimer = setTimeout(() => drawStylePics(), 450); };
      panel.onclick = (e) => { if (e.target.closest("[data-cw], [data-orient], [data-paper], [data-bookbg], [data-gap], [data-plate]")) picsSoon(); };   // one handler, however often the panel is redrawn
      radio("[data-style]", (b) => { book.style = b.dataset.style; drawFields(); refreshDesignColours(); }, (b) => book.style === b.dataset.style, (b) => ensureBookFonts({ ...book, style: b.dataset.style }));
      drawStylePics();
      radio("[data-cw]", (b) => { book.colourway = b.dataset.cw; drawFields(); refreshDesignColours(); }, (b) => book.colourway === b.dataset.cw);
      // Your own colourway: the colour is applied as it is picked, and the
      // panel's own swatches follow, without the picker being rebuilt under a drag.
      wireAny(panel.querySelector("[data-cwany]"), panel.querySelector("[data-cwanypick]"), () => (isOwnColourway(book.colourway) ? book.colourway : colourway(book.colourway).accent.toLowerCase()), (hex) => {
        if (book.colourway === hex) return;
        mark(true);
        book.colourway = hex;
        change({ rail: true }); drawPhotoBlock(); drawFields(); refreshDesignColours(); picsSoon();
      });
      radio("[data-orient]", (b) => { book.orientation = b.dataset.orient; }, (b) => book.orientation === b.dataset.orient);
      radio("[data-gap]", (b) => {
        if (b.dataset.gap === "medium") delete book.spacing; else book.spacing = b.dataset.gap;
        const note = $("#sbGapNote");
        if (note) note.textContent = `${(book.spacing || "medium") === "medium" ? "The style's own spacing." : (book.spacing === "none" ? "The photographs meet with no gutter at all." : book.spacing === "narrow" ? "Half the style's gutter." : "Nearly twice the style's gutter.")} It scales each style's own number, so the styles keep their proportions to one another.`;
      }, (b) => (book.spacing || "medium") === b.dataset.gap);
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
      const cl = coverLayoutOf(b);
      if (cl !== "custom" && cl !== "poster" && b.cover && !lib.byId.has(b.cover.id)) out.push({ i: -1, text: `Cover: ${goneWhy(b.cover.id)}` });
      if (cl === "custom") {
        const ce = { ...(b.coverPage || {}), type: "free" };
        const blocks = freeBlocks(ce);
        if (!blocks.length) out.push({ i: -1, text: "Cover: nothing on it yet" });
        { const gone = blocks.find((b2) => b2.k === "photo" && b2.p && !lib.byId.has(b2.p.id)); if (gone) out.push({ i: -1, text: `Cover: ${goneWhy(gone.p.id)}` }); }
        if (blocks.some((b2) => b2.k === "photo" && !(b2.p && b2.p.id))) out.push({ i: -1, text: "Cover: a photo box with no photo chosen" });
        for (const c of planFree(b, ce).cuts) { const info = planFree(b, ce).fields[c.field]; const miss = info ? info.total - info.printed : 0; out.push({ i: -1, text: `Cover: a box of words is too long${miss ? ` (${miss} word${miss === 1 ? "" : "s"} won't print)` : ""}` }); }
      }
      let n = 1;
      for (let i = 0; i < b.pages.length; i++) {
        const pg = b.pages[i];
        const first = n + 1; n += pageSpan(pg);
        if (n > MAX_PAGES) break;
        const add = (text) => out.push({ i, text: `Page ${pad2(first)} · ${PAGE_LABEL[pg.type]}: ${text}` });
        if ((pg.type === "photos" || pg.type === "spread" || pg.type === "look") && !(pg.photos || []).length) add("no photos yet");
        if (pageSpan(pg) === 2 && first % 2 === 1) add(`starts on a right-hand page, so its two halves would be split by a page turn — move it, or put a page before it, so it starts on an even page`);
        if ((pg.type === "note" || pg.type === "article") && !(pg.photos || []).length) add("no photo chosen");
        if (pg.type === "end" && i !== b.pages.length - 1) add("should be the last page — move it to the end");
        if (pg.type === "feature" && (pg.photos || []).length < 2) add(`${(pg.photos || []).length ? "only one photo" : "no photos"} chosen; it takes two`);
        { const gone = (pg.photos || []).find((sh) => !lib.byId.has(sh.id)); if (gone) add(goneWhy(gone.id)); }
        if (pg.type === "free") {
          const blocks = freeBlocks(pg);
          if (!blocks.length) add("nothing on this page yet");
          { const gone = blocks.find((b2) => b2.k === "photo" && b2.p && !lib.byId.has(b2.p.id)); if (gone) add(goneWhy(gone.p.id)); }
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
              add(c.none ? `it needs ${c.label}` : `the ${c.label} is too long${miss ? ` (${miss} word${miss === 1 ? "" : "s"} won't print)` : ""}`);
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
      { const row = $("#sbMarksRow"); if (row) row.hidden = printMode === "fold"; }
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
      /* One line that says where things stand; which photo is where folds
         away beneath it. It listed every unmatched photo — forty lines for a
         fourteen-page book (Sep 2026 audit, K11). */
      const rest = ids.length - m.matched.size;
      const lines = [`<p class="${m.matched.size ? "sb-ok" : "sb-warn"}">${m.matched.size} of ${ids.length} found in ${originals.count()} file${s(originals.count())}${rest ? ` · ${rest} will use the site's cop${rest === 1 ? "y" : "ies"}` : " · every photo prints from its original"}.</p>`];
      const detail = [];
      if (m.missing.length) detail.push(`<p class="sb-hint">Not in these files (${m.missing.length}): ${esc(where(m.missing))}.</p>`);
      if (m.ambiguous.length) detail.push(`<p class="sb-hint">Two files look alike, so neither was used (${m.ambiguous.length}): ${esc(where(m.ambiguous))}.</p>`);
      if (m.small.length) detail.push(`<p class="sb-hint">Found, but no bigger than the site's copy (${m.small.length}): ${esc(where(m.small))}.</p>`);
      if (detail.length) lines.push(`<details class="sb-origdetail"><summary class="sb-hint">Which ones</summary>${detail.join("")}</details>`);
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
      /* Named for the studio and the book, in the book's own letters: "Book 2"
         came out as "book-2.pdf", and a name in Hindi as "portfolio.pdf"
         (Sep 2026 audit, K12). */
      const slug = String(snap.name || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60);
      const base = `nerdyphotographer${slug ? `-${slug}` : "-portfolio"}${format === "booklet" ? "-booklet" : ""}${watermarked ? "-watermarked" : ""}`;
      try {
        // The chosen resolution first, then softer if the device runs short of memory.
        let result = null, lastErr = null, madeAt = 0, fullSize = 0;
        /* A PDF sets its words as real type. A quick pass at a tiny size finds
           every face and letter the book uses, so the fonts are at hand before
           the real pass draws (a canvas call cannot wait for a download). A
           watermarked sample keeps its words in the picture, under the mark. */
        const marks = format === "pdf" && printMarks;
        const BP = format !== "png" ? await loadPrint() : null;
        let print = null;
        if (BP && !watermarked) {
          btn.textContent = "Getting the fonts…";
          try {
            const needs = BP.newNeeds();
            for await (const r of renderPages(snap, { dpi: 20, cache, print: { mode: "discover", needs } })) { r.page.canvas.width = 0; r.page.canvas.height = 0; }
            const faces = await BP.loadNeeds(needs);
            if (faces.size) print = { mode: "vector", faces };
          } catch (e) { print = null; }
        }
        const G0 = geometry(snap);
        const ascii = (x) => String(x || "").normalize("NFKD").replace(/[^\x20-\x7e]/g, "").trim();
        for (const dpi of (exportDpi === 300 ? [300, 150, 110] : [150, 110])) {
          const orig = await originalsFor(snap, dpi);
          try {
            const out = [];
            let done = 0;
            const pageJpeg = [];    // for a booklet: every page, compressed, by number
            for await (const r of renderPages(snap, { dpi, watermarked, cache, originals: orig, print })) {
              if (orig) await orig.release();       // the page holds its pixels now
              const { canvas, links, pt, scale } = r.page;
              // Links are placed in design mm; the PDF wants printed mm.
              const printed = (links || []).map((l) => ({ ...l, x: l.x * (scale || 1), y: l.y * (scale || 1), w: l.w * (scale || 1), h: l.h * (scale || 1) }));
              const runs = print ? BP.takeRuns(r.page) : [];
              if (format === "pdf") {
                const bleedPx = marks && BP ? Math.round(3 * dpi / 25.4) : 0;
                const img = bleedPx ? BP.withBleed(canvas, bleedPx) : canvas;
                out.push({ jpeg: await API.canvasJpeg(img, 0.9), width: img.width, height: img.height, links: printed, pt, runs, bleedPx,
                  label: `${ascii(snap.name) || "Portfolio"} - page ${r.n} - trim ${Math.round(G0.pw)} x ${Math.round(G0.ph)} mm - bleed 3 mm` });
                if (img !== canvas) { img.width = 0; img.height = 0; }
              }
              else if (format === "booklet") pageJpeg[r.n] = { jpeg: await API.canvasJpeg(canvas, 0.92), w: canvas.width, h: canvas.height, runs };
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
                let sheetRuns = [];
                for (const [k2, x] of [[a, left], [b2, left + pw]]) {
                  if (!k2 || !pageJpeg[k2]) continue;
                  if (BP && pageJpeg[k2].runs.length) sheetRuns = sheetRuns.concat(BP.shiftRuns(pageJpeg[k2].runs, x, top, pw / pageJpeg[k2].w));
                  const bmp = await createImageBitmap(new Blob([pageJpeg[k2].jpeg], { type: "image/jpeg" }));
                  ctx.drawImage(bmp, x, top, pw, ph);
                  if (bmp.close) bmp.close();
                }
                // A faint fold line, so the stack is folded in the right place.
                ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(Math.round(sw / 2), 0, 1, Math.round(4 * k)); ctx.fillRect(Math.round(sw / 2), sh - Math.round(4 * k), 1, Math.round(4 * k));
                out.push({ jpeg: await API.canvasJpeg(c, 0.9), width: sw, height: sh, links: [], pt: { w: sheet.w * 72 / 25.4, h: sheet.h * 72 / 25.4 }, runs: sheetRuns });
                c.width = 0; c.height = 0;
                made++; btn.textContent = `Making the booklet… sheet side ${made}/${sides.length}`;
              }
            }
            const title = `${snap.name} — ${studio()}${format === "booklet" ? " (booklet)" : ""}`;
            result = format === "png" ? out : BP ? (await BP.buildPdf(out, { title, author: studio(), marks })).bytes : await API.buildPdf(out, title);
            madeAt = dpi; fullSize = orig ? orig.used.size : 0;
            break;
          } catch (err) { lastErr = err; } finally { if (orig) await orig.release(); }
        }
        const madeNote = `${madeAt} dpi${fullSize ? ` · ${fullSize} full-size photo${fullSize === 1 ? "" : "s"}` : ""}${format !== "png" ? (print ? " · real type" : watermarked ? "" : " · words as picture: fonts didn't load") : ""}${marks ? " · crop marks + bleed" : ""}`;
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
          ready.innerHTML = `<a href="${url}" download="${esc(name)}">Save ${watermarked ? "watermarked " : ""}${format === "booklet" ? "booklet" : "PDF"} (${(blob.size / 1048576).toFixed(1)} MB · ${madeNote})</a>${canShare ? `<button type="button" class="sb-btn dark" id="sbShare">Share or save to Files</button>` : ""}${softer}`;
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
    if (!L || !L.fields || !L.fits || !L.papers || !L.borders || !L.fonts || !L.contactRows || !L.workWays || !L.markStrengths || !L.paras || !L.coverText || !L.blockKinds || !L.schema || !L.lists || !L.photoRows || !(L.pageTypes || []).includes("free") || !L.coverLayouts || !(L.pageTypes || []).includes("end") || !(L.pageTypes || []).includes("look") || !(L.styles || []).includes("gazette") || !L.plateColours || !L.pageLook || !L.typeRoles || !(L.pageTypes || []).includes("more")) {
      root.innerHTML = `<div class="sb-empty"><p class="sb-warn">The site was updated while this tab was open.</p><p class="sb-hint">Reload the page (or use “↻ Load fresh version”) before editing your books, so nothing you write is lost.</p><p><button type="button" class="sb-btn dark" id="sbReload">Reload now</button></p></div>`;
      root.querySelector("#sbReload").addEventListener("click", () => location.reload());
      return;
    }
    let reopen = null;
    try { reopen = JSON.parse(sessionStorage.getItem(OPEN_KEY) || "null"); } catch (e) { reopen = null; }
    const again = reopen && state.versions.find((v) => v.id === reopen.id);
    if (again) openBook(JSON.parse(JSON.stringify(again)), false, reopen); else showList();
  }

  window.StudioBook = { mount, renderPages, planWriting, planFree, FREE_STARTS, COLOURWAYS, STYLES, newBook, geometry, PAPERS, WAYS_COPY, PROCESS_COPY, bookletSides, SHEETS, fingerprint, fpScore, fpColour, imageHeader, originalsStore, originalLoader };
})();
