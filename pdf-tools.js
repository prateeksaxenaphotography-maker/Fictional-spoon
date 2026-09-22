/* ============================================================
   nerdyphotographer.in — PDF tools (comp cards & portfolio PDFs)

   The print and PDF machinery that used to sit in app.js: the comp-card
   print sheet, the A4 page writer that draws every portfolio page onto a
   canvas, the UPI QR and sale log, and the builder a client works through
   to pick poses and download their PDF. It is roughly 150 KB of code that
   only matters once someone presses one of two buttons, and most visitors
   never press either — so app.js keeps the buttons and fetches this file on
   the first click (loadPdfTools), the same way it already fetched admin.js
   and book-builder.js.

   This is NOT an admin file. Everything here is visitor-facing: the free
   comp card, the paid portfolio PDF, the email-capture modal. isAdmin()
   appears only to skip the paywall and the watermark for the studio.

   app.js's IIFE closure is not shared, so the bindings this half reads come
   across through window.WPS_PDF_API, and the three entry points are handed
   back on window.WPS_PDF. Anything the PAGE needs before the click — the
   sidebar boxes, the photo filters behind them, getPortfolioPdfSettings,
   the orientation toggle — stayed in app.js on purpose.

   Loaded by app.js only, never from a page. It must not be referenced from
   any HTML file: a <script> tag would put it back on every visitor's first
   paint, which is the whole point of the split.
   ============================================================ */
(() => {
  "use strict";
  const A = window.WPS_PDF_API;
  if (!A) {
    console.error("pdf-tools.js loaded without WPS_PDF_API — app.js is older than this file, or did not finish. Reload with “Load fresh version”.");
    return;
  }
  const {
    SOCIAL_LABEL, chestLabelOf, compCardPdfPhotos, esc, getTalentCleanName, isAdmin,
    modelTypeLabel, modelTypesOf, photoSrc, portfolioPdfMailLink,
    portfolioPdfPhotos, portfolioPdfSalesOpen, prefersReduced, showRep, shuffleArray,
    slugify, socialPrintText, toast, trapTabKey, visibleAgencyLinks, visibleModelLinks,
  } = A;
  // SHOOTS is reassigned by loadShoots on every load and publish, so it is
  // read live rather than captured once.
  const shootsNow = A.shoots;

  /* ---- Shared print builders (comp card + model portfolio) ---- */

  // Branding footer — this doubles as a marketing touchpoint, so it's always
  // included and only ever shrinks (via --print-scale), never gets dropped.
  const PRINT_FOOTER_HTML = `
    <div style="border-top: 1px solid #d9d6d0; padding-top: calc(8px * var(--print-scale, 1)); margin-top: auto; width: 100%; flex: 0 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; gap: calc(10px * var(--print-scale, 1)); flex-wrap: wrap;">
        <span style="font-family:var(--mono-font); font-size: calc(8px * var(--print-scale, 1)); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8782; ">Photographed by nerdyphotographer.in &nbsp;·&nbsp; @nerdyphotographer.in</span>
        <span style="font-family:var(--mono-font); font-size: calc(8.5px * var(--print-scale, 1)); font-weight: 700; color: #000; letter-spacing: 0.04em;">Book a shoot &nbsp;·&nbsp; nerdyphotographer.in/book</span>
      </div>
      <div style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: calc(7px * var(--print-scale, 1)); color: #9a9791; margin-top: calc(4px * var(--print-scale, 1)); line-height: 1.4;">Fashion, fitness, lifestyle and sports photography, Noida. Comp cards, portfolio cards and frames are creative works produced under nerdyphotographer.in.</div>
    </div>
  `;

  // Print twin of modelTypeBadgesHtml. The export renders into a bare print
  // container that styles.css classes don't reach, so every rule is inline
  // and sized off --print-scale like the rest of the sheet. Pure black on
  // near-white: these have to survive a cheap agency photocopy.
  function printModelTypeBadgesHtml(shoot, extraStyle = "") {
    const types = modelTypesOf(shoot);
    if (!types.length) return "";
    return `
      <div style="display: flex; flex-wrap: wrap; gap: calc(6px * var(--print-scale, 1)); margin: 0; flex: 0 0 auto; ${extraStyle}">
        ${types.map((t) => `<span style="font-family:var(--mono-font); font-size: calc(8px * var(--print-scale, 1)); font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #333; background: #fff; border: 1px solid #cfccc6; border-radius: 999px; padding: calc(3px * var(--print-scale, 1)) calc(10px * var(--print-scale, 1)); white-space: nowrap;">${esc(modelTypeLabel(t))}</span>`).join("")}
      </div>
    `;
  }

  function printStatsBarHtml(shoot) {
    if (shoot.showStatsOnCompCard === false) return "";
    const pairs = [
      ["Height", shoot.height],
      [chestLabelOf(shoot), shoot.chest],
      ["Waist", shoot.waist],
      ["Hips", shoot.hips],
      ["Shoes", shoot.shoes],
      ["Hair", shoot.modelHair],
      ["Eyes", shoot.modelEyes]
    ].filter(([, v]) => v);
    if (!pairs.length) return "";
    return `
      <div style="display: flex; flex-wrap: wrap; gap: calc(6px * var(--print-scale, 1)) calc(24px * var(--print-scale, 1)); padding: calc(9px * var(--print-scale, 1)) 0; border-top: 1px solid #d9d6d0; border-bottom: 1px solid #d9d6d0; margin-bottom: calc(12px * var(--print-scale, 1)); flex: 0 0 auto;">
        ${pairs.map(([k, v]) => `<div><div style="font-family:var(--mono-font); font-size: calc(8px * var(--print-scale, 1)); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8782; margin-bottom: calc(2px * var(--print-scale, 1));">${esc(k)}</div><div style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: calc(12px * var(--print-scale, 1)); font-weight: 700; color: #000; letter-spacing: -0.01em;">${esc(v)}</div></div>`).join("")}
      </div>
    `;
  }


  function printSocialsBarHtml(shoot) {
    // Contact block: one line for the model (every social and the email),
    // one line for the agency (its name, then its socials). Each detail is
    // a small label over its value.
    const cell = (label, value) => `<div style="min-width: 0;"><div style="font-family:var(--mono-font); font-size: calc(8px * var(--print-scale, 1)); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8782; margin-bottom: calc(2px * var(--print-scale, 1));">${label}</div><div style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: calc(11px * var(--print-scale, 1)); font-weight: 700; color: #000;">${value}</div></div>`;
    const modelCells = visibleModelLinks(shoot, "Pdf").map(l => cell(SOCIAL_LABEL[l.kind], esc(socialPrintText(l))));
    if (shoot.modelEmail && showRep(shoot, "Email", "Pdf") && !modelCells.some(c => c.includes(esc(shoot.modelEmail)))) modelCells.push(cell("Email", esc(shoot.modelEmail)));
    const agencyCells = [];
    if (shoot.agency && showRep(shoot, "Agency", "Pdf")) {
      agencyCells.push(cell("Agency", esc(shoot.agency)));
      visibleAgencyLinks(shoot, "Pdf").forEach(l => agencyCells.push(cell(`Agency ${SOCIAL_LABEL[l.kind]}`, esc(socialPrintText(l)))));
    }
    if (!modelCells.length && !agencyCells.length) return "";
    const line = (cells) => `<div style="display: flex; flex-wrap: wrap; gap: calc(6px * var(--print-scale, 1)) calc(28px * var(--print-scale, 1)); align-items: flex-start;">${cells.join("")}</div>`;
    return `
      <div style="padding: calc(9px * var(--print-scale, 1)) 0 calc(8px * var(--print-scale, 1)); border-bottom: 1px solid #d9d6d0; margin-bottom: calc(12px * var(--print-scale, 1)); flex: 0 0 auto;">
        ${modelCells.length ? line(modelCells) : ""}
        ${modelCells.length && agencyCells.length ? `<div style="height: 1px; background: #ecebe7; margin: calc(7px * var(--print-scale, 1)) 0;"></div>` : ""}
        ${agencyCells.length ? line(agencyCells) : ""}
        <div style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: calc(8px * var(--print-scale, 1)); color: #8a8782; margin-top: calc(6px * var(--print-scale, 1));">To book this talent, contact the model or their representing agency through the channels above.</div>
      </div>
    `;
  }

  function printCreditsBarHtml(shoot) {
    if (!shoot.credits) return "";
    const creditsItems = shoot.credits.split(",").map(item => {
      const parenRegex = /\(([^)]+)\)/;
      const match = item.match(parenRegex);
      if (match) {
        const rawName = item.replace(parenRegex, "").trim();
        const rawSocials = match[1].split("|").map(s => s.trim()).filter(Boolean);
        const socialStr = rawSocials.map(s => {
          if (s.includes("instagram.com") || s.startsWith("@")) {
            return "@" + (s.startsWith("@") ? s.replace(/^@/, "") : s.split("/").pop());
          } else if (s.includes("kavyar.com")) {
            return "Kavyar: " + s.split("/").pop();
          }
          return s;
        }).join(" · ");
        return `${rawName} (${socialStr})`;
      }
      return item.trim();
    }).join("   |   ");
    return creditsItems ? `
      <div style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: calc(9px * var(--print-scale, 1)); color: #555; margin-bottom: calc(12px * var(--print-scale, 1)); flex: 0 0 auto;">
        <span style="font-family:var(--mono-font); font-size: calc(8px * var(--print-scale, 1)); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8782; ">Credits</span> &nbsp;${creditsItems}
      </div>
    ` : "";
  }

  // One grid cell. Cell shapes are re-derived from each photo's real aspect
  // ratio at export time (justifyPrintGrid), so photos tile the grid
  // edge-to-edge with at most a few percent of even all-edge trim — and the
  // layout falls back to contain (padded, zero-crop) rather than ever
  // trimming more. Full-length shots keep their heads.
  function printGridCellHtml(p) {
    return `
      <div class="print-photo-item">
        <img src="${photoSrc(p)}" alt="Portfolio frame" />
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

  // maxTrim is a caller-supplied threshold (not a shared module constant) —
  // Comp Card and Model Portfolio each keep their own tolerance so tuning one
  // can never silently change the other's output.
  function applyJustifiedLayout(grid, cells, imgs, aspects, best, gapPx, maxTrim) {
    const fit = best.trim <= maxTrim ? "cover" : "contain";
    grid.style.setProperty("display", "flex", "important");
    grid.style.setProperty("flex-direction", "column", "important");
    grid.style.setProperty("gap", `${gapPx}px`, "important");
    grid.innerHTML = "";
    for (const row of best.rows) {
      const rowEl = document.createElement("div");
      rowEl.style.cssText = `display:flex; gap:${gapPx}px; width:100%; min-height:0; flex:${row.h} 1 0;`;
      // Normalize grow factors to sum to exactly 1: raw aspect ratios keep
      // the right proportions between cells, but flexbox only hands out
      // sum(flex-grow) of the free space when that sum is below 1 — a lone
      // portrait photo (aspect ~0.7) in a row would fill just 70% of it and
      // sit flush left instead of spanning the row.
      const rowSumA = row.rowIdxs.reduce((s, i) => s + aspects[i], 0);
      for (const i of row.rowIdxs) {
        cells[i].style.setProperty("flex", `${aspects[i] / rowSumA} 1 0%`, "important");
        cells[i].style.setProperty("height", "100%", "important");
        imgs[i].style.setProperty("object-fit", fit, "important");
        rowEl.appendChild(cells[i]);
      }
      grid.appendChild(rowEl);
    }
  }

  // ---- Comp Card one-pager main-row layout ---------------------------------
  // Comp Card's own copy (own CSS classes, own tunable constants) of the
  // one-pager layout — kept independent from Model Portfolio's template
  // system so tuning one can never silently change the other. Only what's
  // genuinely generic geometry — bestJustifiedSplit/collectGridPhotos/
  // applyJustifiedLayout/trimOf above — stays shared, parametrized by the
  // caller's own thresholds.
  //
  // The cover panel's size and the side grid's layout
  // constrain each other (bigger hero = less grid room), and the ideal split
  // depends on the shapes drawn this export. Two arrangements are swept:
  //   "row"    — hero left, grid right: suits a portrait hero.
  //   "column" — hero as a full-width band on top, grid beneath: a landscape
  //              hero can never fill a tall side panel, but it can fill a
  //              full-width band.
  // For each arrangement, sweep the hero's size AND how many of the rendered
  // side photos to keep, scoring every combination by its worst trim — with
  // a small penalty per dropped photo, so shots are only dropped when doing
  // so genuinely rescues the layout.
  const CC_JUSTIFY_MAX_TRIM = 0.16; // Comp Card: grid photos' max even trim before contain fallback
  const CC_COVER_MAX_TRIM = 0.12;   // Comp Card: hero's tolerance (the sweep's 0.1×coverTrim bias
                                    // already keeps it lower than this whenever the sheet allows)
  const CC_GRID_GAP = 10;
  const CC_DROP_PENALTY = 0.02;
  function layoutCompCardMainRow(printContainer) {
    printContainer.querySelectorAll(".cc-main-row").forEach((row) => {
      const panel = row.querySelector(".cc-cover-panel");
      const grid = row.querySelector(".cc-side-grid");
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
        for (let n = Math.min(2, gp.cells.length); n <= gp.cells.length; n++) {
          const aspects = gp.aspects.slice(0, n);
          const dropped = gp.cells.length - n;
          // The hero carries the card: weight its trim into the score so the
          // sweep lands on a full-bleed hero over a marginally better grid.
          const heroW = W * frac;
          const rowCoverTrim = trimOf((heroW / H) / coverAspect);
          const rowSplit = bestJustifiedSplit(W - heroW - rowGap, H, aspects, CC_GRID_GAP);
          if (rowSplit) {
            const score = Math.max(rowCoverTrim, rowSplit.trim) + 0.1 * rowCoverTrim + CC_DROP_PENALTY * dropped;
            if (!best || score < best.score) best = { score, mode: "row", size: heroW, n, split: rowSplit, coverTrim: rowCoverTrim };
          }
          const heroH = H * frac;
          const colCoverTrim = trimOf((W / heroH) / coverAspect);
          const colSplit = bestJustifiedSplit(W, H - heroH - rowGap, aspects, CC_GRID_GAP);
          if (colSplit) {
            const score = Math.max(colCoverTrim, colSplit.trim) + 0.1 * colCoverTrim + CC_DROP_PENALTY * dropped;
            if (!best || score < best.score) best = { score, mode: "column", size: heroH, n, split: colSplit, coverTrim: colCoverTrim };
          }
        }
      }
      if (!best) return;

      if (best.mode === "column") {
        row.style.setProperty("flex-direction", "column", "important");
        panel.style.setProperty("height", "auto", "important");
        panel.style.setProperty("width", "100%", "important");
        grid.style.setProperty("height", "auto", "important");
      }
      panel.style.setProperty("flex", `0 0 ${best.size}px`, "important");
      grid.style.setProperty("flex", "1 1 0", "important");
      coverImg.style.setProperty("object-fit", best.coverTrim <= CC_COVER_MAX_TRIM ? "cover" : "contain", "important");
      for (let i = best.n; i < gp.cells.length; i++) gp.cells[i].remove();
      applyJustifiedLayout(grid, gp.cells.slice(0, best.n), gp.imgs.slice(0, best.n), gp.aspects.slice(0, best.n), best.split, CC_GRID_GAP, CC_JUSTIFY_MAX_TRIM);
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

      // .cc-main-row/.cc-cover-panel/.cc-side-grid are Comp Card's own
      // one-pager classes — the only document type that still produces this
      // markup (Model Portfolio's template pages use fixed, non-justified
      // layouts instead, so they need no selector here at all).
      if (isLandscape) {
        styleTag.textContent = `
          @media print {
            @page { size: A4 landscape !important; margin: 6mm 8mm !important; }
            .print-page { padding: 12px 16px !important; }
            .cc-main-row {
              flex: 1 1 0% !important;
              gap: 14px !important;
              margin: 0 0 10px !important;
            }
            .cc-cover-panel {
              flex: 1.5 1 0 !important;
            }
            .cc-side-grid {
              flex: 1 1 0 !important;
              grid-template-columns: repeat(2, 1fr) !important;
              gap: 8px !important;
            }
          }
        `;
        printContainer.querySelectorAll(".print-page").forEach(p => p.classList.add("landscape"));
      } else {
        styleTag.textContent = `
          @media print {
            @page { size: A4 portrait !important; margin: 6mm 8mm !important; }
            .print-page { padding: 14px 16px !important; }
            .cc-main-row {
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
      // A no-op for any page that doesn't produce .cc-main-row markup (i.e.
      // every Model Portfolio template page) — printFromContainer doesn't
      // need to know which caller invoked it.
      layoutCompCardMainRow(printContainer);

      const oldTitle = document.title;
      const cleanModelName = getTalentCleanName(shoot.talent || shoot.title).trim().replace(/\s+/g, '_');
      // "nerdyphotographer.in" would leave a stray dot right before ".pdf" in
      // the saved filename (e.g. "..._NerdyPhotographer.in.pdf") — dropped to
      // avoid that, per explicit instruction to prefer the no-dot form.
      // Timestamp suffix: every export is a unique random draw, and an
      // identical suggested filename makes the OS save dialog prompt
      // "replace?" against the previous export instead of saving cleanly.
      const now = new Date();
      const pad2 = (n) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}`;
      const exportTitle = `${cleanModelName}_${docType}_Shot_By_NerdyPhotographerin_${stamp}`;
      // Everything the print dialog snapshots — container visibility and the
      // document title that becomes the PDF filename — is set inside the SAME
      // task that calls window.print(), with the restore strictly AFTER
      // print() returns. A previous change deferred the print call by 150ms
      // but left the restore synchronous (and the title set before the
      // deferral, where a queued render() could clobber it): every export
      // came out as a blank PDF with the wrong filename.
      const prevWidth = printContainer.style.width;
      setTimeout(() => {
        document.title = exportTitle;
        // For the snapshot itself, leave the fixed-at-0,0 measurement
        // position and join normal flow at full printable width: a fixed box
        // shrink-wraps to the card's width, so when the dialog's printable
        // area is wider than the card (Margins: None/custom, or a browser
        // ignoring @page size) the card would pin to the left edge with all
        // the slack on the right. In flow, the container spans the printable
        // width and its align-items:center keeps every page centered.
        printContainer.style.setProperty("position", "static", "important");
        printContainer.style.setProperty("width", "100%", "important");
        printContainer.style.setProperty("visibility", "visible", "important");
        document.body.classList.add("is-printing");
        window.print();
        // window.print() blocks while the dialog is open; in browsers where
        // it returns early this still matches the pre-regression ordering.
        document.title = oldTitle;
        printContainer.style.display = prevDisplay;
        printContainer.style.position = prevPosition;
        printContainer.style.left = prevLeft;
        printContainer.style.top = prevTop;
        printContainer.style.width = prevWidth;
        printContainer.style.visibility = prevVisibility;
        setTimeout(() => document.body.classList.remove("is-printing"), 1000);
      }, 150);
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
  // header, one large lead photo beside a supporting grid, then stats and
  // socials strips when the data exists. The photo row flexes, so the page
  // absorbs optional strips without ever spilling onto a second sheet.
  //
  // Comp Card's own copy of the one-pager layout (own .cc-* CSS classes) —
  // Model Portfolio now uses the template system below instead of a
  // matching one-pager, so this is Comp Card-only.
  function printCompCardPageHtml(shoot, photos) {
    const name = getTalentCleanName(shoot.talent || shoot.title);
    const cover = photos[0];
    const statsHtml = printStatsBarHtml(shoot);
    const socialsHtml = printSocialsBarHtml(shoot);
    const creditsHtml = printCreditsBarHtml(shoot);
    const hasDetails = !!(statsHtml.trim() || socialsHtml.trim() || creditsHtml.trim());
    // "Updated" = the newest album's shoot date, so an agency can see how
    // current the card is.
    const updatedStamp = (() => {
      const src = (shoot.originalShoots && shoot.originalShoots[0]) || shoot;
      const d = new Date(src.date || "");
      return isNaN(d) ? "" : d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    })();

    // Render up to 5 side photos — the card stays at 6 photos max so the
    // model stays highlighted, per the studio's comp card format. The
    // post-load layout pass (layoutCompCardMainRow) decides how many to
    // actually keep based on which count tiles the sheet best for the
    // shapes drawn this export.
    const side = photos.slice(1, 6);

    return `
      <div class="print-page${!hasDetails ? " no-details" : ""}">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #d9d6d0; padding-bottom: calc(8px * var(--print-scale, 1)); margin-bottom: calc(12px * var(--print-scale, 1)); flex: 0 0 auto;">
          <span style="font-family:var(--mono-font); font-size: calc(8px * var(--print-scale, 1)); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8782;">Comp card${updatedStamp ? ` &nbsp;·&nbsp; Updated ${esc(updatedStamp)}` : ""}</span>
          <span style="display: inline-flex; align-items: center; gap: calc(6px * var(--print-scale, 1));"><svg viewBox="0 0 100 100" fill="none" aria-hidden="true" style="width: calc(13px * var(--print-scale, 1)); height: calc(13px * var(--print-scale, 1)); color: #000; flex: 0 0 auto;"><circle cx="50" cy="52" r="39" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M 26 22 C 26 22 28 32 37 40 C 45 44 48 40 50 38 C 52 40 55 44 63 40 C 72 32 74 22 74 22 C 74 22 70 34 50 44 C 30 34 26 22 26 22 Z" fill="#0e0e0e" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="36" cy="48" r="13" stroke="currentColor" stroke-width="3"/><circle cx="64" cy="48" r="13" stroke="currentColor" stroke-width="3"/><path d="M 49 48 L 51 48" stroke="currentColor" stroke-width="3"/><path d="M 23 48 L 16 48 L 16 40" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M 77 48 L 84 48 L 84 40" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M 36 38 L 41 45 M 42.5 44 L 38 52 M 39 53 L 30 51 M 31 50 L 29 42 M 30 41 L 38 41" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M 64 38 L 69 45 M 70.5 44 L 66 52 M 67 53 L 58 51 M 59 50 L 57 42 M 58 41 L 66 41" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><polygon points="50,49 46,55 54,55" fill="#d24e1a"/><path d="M 20 58 C 24 72 35 78 50 86 C 65 78 76 72 80 58" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M 27 68 C 32 78 40 82 50 90 C 60 82 68 78 73 68" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><span style="font-family:var(--mono-font); font-size: calc(8px * var(--print-scale, 1)); font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #000;">nerdyphotographer.in</span></span>
        </div>
        <h1 style="font-family: 'Archivo', 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: calc(34px * var(--print-scale, 1)); font-weight: 800; margin: 0 0 calc(8px * var(--print-scale, 1)); text-transform: uppercase; color: #000; letter-spacing: -0.025em; line-height: 1; flex: 0 0 auto;">${name}</h1>
        ${printModelTypeBadgesHtml(shoot, "margin: 0 0 calc(10px * var(--print-scale, 1));")}
        <div class="cc-main-row">
          <div class="cc-cover-panel">
            ${cover ? `<img src="${photoSrc(cover)}" alt="Lead photo" />` : ""}
          </div>
          ${side.length ? `<div class="cc-side-grid${side.length === 5 ? " grid-5" : ""}">${side.map(p => printGridCellHtml(p)).join("")}</div>` : ""}
        </div>
        ${statsHtml}
        ${creditsHtml}
        ${socialsHtml}
        ${PRINT_FOOTER_HTML}
      </div>
    `;
  }

  // Comp card export (Location 1): ONE A4 page — lead photo + 4 or 5 randomized side photos (content-aware of model details).
  function printCompCard(shootId, orientation = "auto") {
    const shoot = shootsNow().find((x) => x.id === shootId) || (window.currentCompCardShootObj);
    if (!shoot) return;
    // The button already hides itself when this is set, but printCompCard is
    // also reachable directly (magic download link, console) — the lock must
    // hold everywhere, not just in the UI that normally gates it.
    if (shoot.disableCompCardDownload) {
      toast("Comp card PDF download has been disabled for this model by the studio.");
      return;
    }

    // Every photo across every album tagged to this model — the same pool the
    // panel counted before it offered the box.
    const rawPhotos = compCardPdfPhotos(shoot);
    if (!rawPhotos.length) { toast("None of this model's photos are set to go on a comp card."); return; }

    // Freshly shuffle the whole pool every time the button is clicked — the
    // hero is random too (first of the shuffle), not pinned to the album
    // cover, so every export leads with a different shot of the model.
    const shuffled = shuffleArray([...rawPhotos]);

    // Hero + up to 5 side candidates (6 photos max on the card, keeping the
    // model highlighted); the aspect-aware layout pass keeps however many of
    // them tile the chosen orientation best.
    const photos = shuffled.slice(0, 6);
    printFromContainer(shoot, printCompCardPageHtml(shoot, photos), "CompCard", orientation);
  }

  // ---- Model Portfolio PDF: pose-picked, one or two pages, paid by UPI ----
  // Replaces the Composite Lookbook (a cover, a contents page and a page per
  // pose, sent through the print dialog). Clients want a one- or two-page PDF
  // to send casting directors and designers, and a phone's print dialog can't
  // save one. So every page is drawn onto a canvas and packed into a real PDF
  // file here: it looks the same in every browser and downloads straight to
  // the phone.
  //
  // Paying is on trust. With no server there is nothing to confirm a UPI
  // payment, so a client unlocks the download by entering the 12-digit
  // reference from their receipt, and every sale emails the studio that
  // number to check against the bank. The studio (admin) always exports free.

  function portfolioPoses() {
    return [
      { angle: "full-body", label: "Full Body" },
      { angle: "front", label: "Front" },
      { angle: "left-profile", label: "Left Profile" },
      { angle: "right-profile", label: "Right Profile" },
      { angle: "three-quarter", label: "Three-Quarter" },
      { angle: "back", label: "Back" },
      { angle: "close-up", label: "Close-Up" }
    ];
  }

  // A page holds one to six photographs, and the client says how many go on
  // each one. The first page gives up some of its room to the name, the
  // measurements and the contact details, so its six print smaller than six
  // on a page of nothing but photographs; one on a page means that photo
  // alone, as large as the paper allows. The cover is not counted — it has a
  // page of its own. Three pages of six is the most a portfolio can carry.
  const PORTFOLIO_MAX_PAGES = 3;
  const PORTFOLIO_PAGE_MAX = 6;
  const PORTFOLIO_PAGE_COUNTS = [1, 2, 3, 4, 5, 6];

  // Arrangements saved before v491 recorded a total and, from v490, how many
  // of it went on the first page; the rest divided evenly. This reproduces
  // that division, so reopening one draws exactly the PDF it drew then.
  function portfolioLegacySplit(total, pages, first) {
    const out = [];
    let left = total;
    for (let i = 0; i < pages; i++) {
      let n;
      if (i === 0 && pages > 1) {
        const fits = PORTFOLIO_PAGE_COUNTS.filter((x) => total - x >= pages - 1 && total - x <= PORTFOLIO_PAGE_MAX * (pages - 1));
        n = fits.includes(first) ? first : fits.length
          ? fits.reduce((a, b) => Math.abs(b - total / pages) < Math.abs(a - total / pages) ? b : a)
          : Math.floor(total / pages);
      } else {
        n = Math.ceil(left / (pages - i));
      }
      out.push(Math.max(0, n));
      left -= n;
    }
    return out;
  }

  // The photos each page of this PDF gets. `spec.perPage` is the client's own
  // answer; an older arrangement is converted. Either way it is trimmed to the
  // photos actually on the pages, so a short pick can never ask a page for a
  // photograph that isn't there, and a long one never silently drops the last.
  function portfolioSplitFor(spec, total) {
    const want = Array.isArray(spec.perPage) && spec.perPage.length
      ? spec.perPage.slice(0, spec.pages)
      : portfolioLegacySplit(total, spec.pages, spec.firstPage);
    const out = [];
    let left = total;
    want.forEach((n, i) => {
      // Every page after this one keeps at least one photograph.
      const take = Math.max(0, Math.min(n, left - (want.length - 1 - i)));
      out.push(take);
      left -= take;
    });
    if (left > 0 && out.length) out[out.length - 1] += left;
    return out;
  }

  // Reference numbers this browser has taken for portfolio PDFs: "sent" once
  // the studio has the sale email, "used" once a PDF was made with it. With
  // no server, the same number on another device can't be stopped; it shows
  // up as a second sale email carrying the same reference number.
  const PDF_UTRS_KEY = "wps_portfolio_pdf_utrs";
  function readPdfUtrs() {
    try {
      const all = JSON.parse(localStorage.getItem(PDF_UTRS_KEY) || "{}");
      return all && typeof all === "object" && !Array.isArray(all) ? all : {};
    } catch (e) {
      return {};
    }
  }
  function markPdfUtr(utr, status) {
    if (!utr) return;
    const all = readPdfUtrs();
    if (all[utr] === "used") return;
    all[utr] = status;
    // Twelve-digit keys keep the order they were added in; keep the newest 100.
    const keys = Object.keys(all);
    keys.slice(0, Math.max(0, keys.length - 100)).forEach((k) => delete all[k]);
    try { localStorage.setItem(PDF_UTRS_KEY, JSON.stringify(all)); } catch (e) { /* storage blocked or full */ }
  }

  // The studio's record of a sale. It can't prove the money arrived (only the
  // bank can), so it carries everything needed to check: the amount, the
  // client's UPI reference and the note their payment was sent with.
  async function sendPortfolioPdfSaleEmail(sale) {
    const to = (window.STUDIO_CONFIG && window.STUDIO_CONFIG.email) || "";
    if (!to) return false;
    try {
      const fd = new FormData();
      fd.append("_subject", `Portfolio PDF sale: ${sale.model} (₹${sale.price}, ${sale.ref})`);
      fd.append("_template", "box");
      fd.append("_replyto", sale.email);
      fd.append("Record Type", "PORTFOLIO PDF SALE: check this UPI payment reached your bank");
      fd.append("Model", sale.model);
      fd.append("Amount", `₹${sale.price}`);
      fd.append("UPI reference (UTR)", sale.utr);
      fd.append("Payment note", `Portfolio PDF ${sale.ref}`);
      fd.append("Paid to", sale.upiId);
      fd.append("Client email", sale.email);
      fd.append("PDF", `${sale.pages} page${sale.pages > 1 ? "s" : ""}${sale.cover ? " + cover" : ""}: ${sale.poses}`);
      fd.append("Page", location.href);
      const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
        method: "POST",
        headers: { "Accept": "application/json" },
        body: fd
      });
      // FormSubmit answers 200 with success:"false" when it refuses, so the
      // body's flag is the only honest signal.
      const body = await res.json().catch(() => null);
      const ok = res.ok && !!body && (body.success === true || body.success === "true");
      if (!ok) console.warn("Portfolio PDF sale email failed:", (body && body.message) || res.statusText);
      return ok;
    } catch (err) {
      console.warn("Portfolio PDF sale email error:", err);
      return false;
    }
  }

  // The QR library is only needed at the payment step, so it loads then
  // rather than weighing down every page of the site.
  let qrLibraryLoad = null;
  function loadQrLibrary() {
    if (typeof window.qrcode === "function") return Promise.resolve(window.qrcode);
    if (!qrLibraryLoad) {
      qrLibraryLoad = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "/vendor/qrcode.js";
        s.onload = () => (typeof window.qrcode === "function" ? resolve(window.qrcode) : reject(new Error("QR library loaded without qrcode()")));
        s.onerror = () => { qrLibraryLoad = null; reject(new Error("QR library failed to load")); };
        document.head.appendChild(s);
      });
    }
    return qrLibraryLoad;
  }

  async function drawUpiQr(canvas, text) {
    const makeQr = await loadQrLibrary();
    const qr = makeQr(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount(), quiet = 4;
    const scale = Math.max(4, Math.ceil(352 / (count + quiet * 2)));
    canvas.width = canvas.height = (count + quiet * 2) * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      }
    }
  }

  // UPI's own link format: scanning it (or tapping it on a phone) opens the
  // payment with the amount and note already filled in.
  function portfolioUpiLink(upiId, price, ref) {
    const payee = (window.STUDIO_CONFIG && window.STUDIO_CONFIG.studioName) || "nerdyphotographer.in";
    return `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payee)}&am=${price}.00&cu=INR&tn=${encodeURIComponent(`Portfolio PDF ${ref}`)}`;
  }

  /* ---- PDF page drawing (all measurements in millimetres on A4) ---- */
  const PDF_PAGE = { w: 210, h: 297, margin: 12, gap: 2.5 };
  const PDF_FOOTER_H = 8.5;
  // A LITERAL stack, never a CSS variable: this string goes into ctx.font, and
  // canvas does not resolve var(). An unresolvable font makes the whole
  // declaration invalid, so the canvas silently keeps its default 10px sans and
  // every measured width is wrong — which is what overlapped the name and the
  // role on the cover, and truncated "HEIGHT" to "H…" (v466). It must stay in
  // step with --mono-font in styles.css by hand.
  const PDF_MONO = "'IBM Plex Mono', monospace";
  const PDF_SANS = "Inter, 'Helvetica Neue', Arial, sans-serif";
  const PDF_DISPLAY = "Archivo, Inter, 'Helvetica Neue', Arial, sans-serif";
  /* One line of the PDF as the studio has set it. The built-in style is the
     floor: the setting only replaces the parts it actually carries, so a role
     that has never been touched draws exactly as it always did.

     "auto" keeps the colour the drawing code worked out for itself — the cover
     puts these over a photograph, so a fixed colour there could be white on
     white. Choosing a real colour overrides that everywhere. */
  function pdfType(key, base) {
    const cfg = ((typeof getPortfolioPdfSettings === "function" ? getPortfolioPdfSettings() : {}).type || {})[key];
    if (!cfg) return base;
    const fams = window.PDF_TYPE_FAMILIES || {};
    const out = { ...base };
    if (fams[cfg.family]) out.family = fams[cfg.family].stack;
    if (cfg.weight) out.weight = cfg.weight;
    if (cfg.color && cfg.color !== "auto") out.color = cfg.color;
    if (cfg.size) out.size = cfg.size;
    return out;
  }

  const PDF_LABEL = { weight: 600, size: 2.0, family: PDF_MONO, spacing: 0.35, upper: true, color: "#8a8782" };
  const PDF_VALUE = { weight: 600, size: 3.3, family: PDF_SANS, color: "#000" };
  const PDF_CELL_H = 6.6;
  const PDF_NOTE_H = 4.8;
  const PDF_BOOKING_NOTE = "To book this talent, contact the model or their representing agency through the channels above.";
  // The studio mark from the comp card header, in black for paper.
  const PDF_STUDIO_MARK = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200" fill="none"><circle cx="50" cy="52" r="39" stroke="#000" stroke-width="3" stroke-linecap="round"/><path d="M 26 22 C 26 22 28 32 37 40 C 45 44 48 40 50 38 C 52 40 55 44 63 40 C 72 32 74 22 74 22 C 74 22 70 34 50 44 C 30 34 26 22 26 22 Z" fill="#0e0e0e" stroke="#000" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="36" cy="48" r="13" stroke="#000" stroke-width="3"/><circle cx="64" cy="48" r="13" stroke="#000" stroke-width="3"/><path d="M 49 48 L 51 48" stroke="#000" stroke-width="3"/><path d="M 23 48 L 16 48 L 16 40" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M 77 48 L 84 48 L 84 40" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M 36 38 L 41 45 M 42.5 44 L 38 52 M 39 53 L 30 51 M 31 50 L 29 42 M 30 41 L 38 41" stroke="#000" stroke-width="2.2" stroke-linecap="round"/><path d="M 64 38 L 69 45 M 70.5 44 L 66 52 M 67 53 L 58 51 M 59 50 L 57 42 M 58 41 L 66 41" stroke="#000" stroke-width="2.2" stroke-linecap="round"/><polygon points="50,49 46,55 54,55" fill="#d24e1a"/><path d="M 20 58 C 24 72 35 78 50 86 C 65 78 76 72 80 58" stroke="#000" stroke-width="3" stroke-linecap="round"/><path d="M 27 68 C 32 78 40 82 50 90 C 60 82 68 78 73 68" stroke="#000" stroke-width="3" stroke-linecap="round"/></svg>');

  // A blank A4 canvas with millimetre drawing helpers. Sizes are converted to
  // pixels on every call instead of scaling the context, because some
  // browsers render small text badly under a scale transform.
  // `size` defaults to A4 portrait; the studio portfolio book also draws A4
  // landscape through here, with { w: 297, h: 210 }.
  /* The optional frame just inside the edge of every page. The stroke is
     centred on the path, so the inset is measured to the middle of the line
     and half of it sits either side — which is what keeps a thick border from
     creeping off the paper. */
  function drawPdfBorder(pages) {
    const b = ((typeof getPortfolioPdfSettings === "function" ? getPortfolioPdfSettings() : {}) || {}).border;
    if (!b || !b.on) return;
    for (const page of pages) {
      const { ctx, u } = page;
      ctx.save();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = u(b.width);
      ctx.strokeRect(u(b.inset), u(b.inset), u(PDF_PAGE.w - b.inset * 2), u(PDF_PAGE.h - b.inset * 2));
      ctx.restore();
    }
  }

  function newPdfPage(dpi, size = PDF_PAGE) {
    const k = dpi / 25.4;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(size.w * k);
    canvas.height = Math.round(size.h * k);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = "alphabetic";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const u = (mm) => mm * k;
    const setFont = (style) => {
      ctx.font = `${style.weight || 400} ${u(style.size || 3)}px ${style.family || PDF_SANS}`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = `${u(style.spacing || 0)}px`;
    };
    const cased = (str, style) => (style.upper ? String(str).toUpperCase() : String(str));
    const page = {
      canvas, ctx, u, links: [],
      // Every photo drawn and its frame in mm, so a tap on the preview can
      // tell which photo it landed on.
      photos: [],
      // An All equal grid with a short row records its split here ({ short, full }).
      equalRows: null,
      measure(str, style) {
        setFont(style);
        return ctx.measureText(cased(str, style)).width / k;
      },
      text(str, x, y, style) {
        setFont(style);
        ctx.fillStyle = style.color || "#000";
        ctx.textAlign = style.align || "left";
        ctx.fillText(cased(str, style), u(x), u(y));
      },
      // Shorten to a width, ending in an ellipsis.
      fit(str, maxW, style) {
        let s = String(str);
        if (page.measure(s, style) <= maxW) return s;
        while (s.length > 1 && page.measure(s + "…", style) > maxW) s = s.slice(0, -1);
        return s.trimEnd() + "…";
      },
      wrap(str, maxW, style) {
        const lines = [];
        let line = "";
        String(str).split(/\s+/).forEach((word) => {
          const next = line ? `${line} ${word}` : word;
          if (line && page.measure(next, style) > maxW) { lines.push(line); line = word; } else { line = next; }
        });
        if (line) lines.push(line);
        return lines;
      },
      rule(x1, y, x2) {
        ctx.strokeStyle = "#d9d6d0";
        ctx.lineWidth = Math.max(1, u(0.25));
        ctx.beginPath();
        ctx.moveTo(u(x1), u(y));
        ctx.lineTo(u(x2), u(y));
        ctx.stroke();
      },
      // A clickable area in the finished PDF (an Instagram handle, an email).
      link(x, y, w, h, url) {
        if (/^(https?:|mailto:|tel:)/i.test(String(url || ""))) page.links.push({ x, y, w, h, url: String(url) });
      }
    };
    return page;
  }

  // Where to anchor a crop, as fractions of the photo: the same point the
  // site's object-position uses, so the PDF crops the way the album does.
  // "center" is what publishing writes for a photo nobody positioned, so it
  // leans up a little: in a portrait crop the face is nearly always above
  // the middle.
  function photoFocus(p) {
    const clamp = (v) => Math.min(1, Math.max(0, v));
    if (typeof p.focalX === "number" && typeof p.focalY === "number") return { x: clamp(p.focalX / 100), y: clamp(p.focalY / 100) };
    const parts = String(p.objectPosition || "center").trim().toLowerCase().split(/\s+/);
    const pcts = parts.filter((t) => /%$/.test(t)).map((t) => parseFloat(t) / 100);
    if (pcts.length === 2 && pcts.every((v) => !isNaN(v))) return { x: clamp(pcts[0]), y: clamp(pcts[1]) };
    let x = 0.5, y = 0.35;
    parts.forEach((t) => {
      if (t === "left") x = 0; else if (t === "right") x = 1;
      else if (t === "top") y = 0; else if (t === "bottom") y = 1;
    });
    return { x, y };
  }

  // How far a client zoomed a photo in Adjust photo: 1 just fills the frame.
  const PDF_MAX_ZOOM = 3;
  const pdfZoom = (photo) => Math.min(PDF_MAX_ZOOM, Math.max(1, Number(photo.pdfZoom) || 1));

  function drawPdfPhoto(page, img, photo, x, y, w, h, frame = true) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const scale = Math.max(w / iw, h / ih) * pdfZoom(photo);
    const sw = Math.min(iw, w / scale), sh = Math.min(ih, h / scale);
    const f = photoFocus(photo);
    page.ctx.drawImage(img, (iw - sw) * f.x, (ih - sh) * f.y, sw, sh, page.u(x), page.u(y), page.u(w), page.u(h));
    page.photos.push({ id: photo.id, x, y, w, h });
    // A hairline frame, so a photo shot on white seamless still has an edge
    // against the paper. A full-bleed cover has no paper around it.
    if (!frame) return;
    page.ctx.strokeStyle = "#e2e0dc";
    page.ctx.lineWidth = Math.max(1, page.u(0.2));
    page.ctx.strokeRect(page.u(x), page.u(y), page.u(w), page.u(h));
  }

  // How light a colour reads, 0 (black) to 255 (white).
  function pdfLuma(color) {
    const hex = String(color == null ? "" : color).trim().replace(/^#/, "");
    const six = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.slice(0, 6);
    const n = /^[0-9a-f]{6}$/i.test(six) ? parseInt(six, 16) : 0x111111;
    return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  }

  // A photo with its pose named in a small tag in the corner, so a casting
  // director can see which angle is which at a glance. No label, no tag.
  //
  // The tag used to be white whatever colour the type was, and the photo tag
  // is one of the ten lines the studio can restyle in Type & Border. Its
  // published setting has been #ffffff — white type on an opaque white chip,
  // so every tag on every portfolio PDF was drawn correctly and could not be
  // read (found Sep 22 2026, reported as "tags didnt come"). The chip now
  // follows the type instead of ignoring it, which fixes the setting already
  // published without anyone reopening it, and holds for whatever colour the
  // studio picks next.
  // Where a pose label sits against its photograph, and how it lines up.
  // "in" is the original: over the picture at its foot. "below" and "above"
  // give the label a strip of paper of its own, taken out of the frame's
  // height so the grid is untouched and every photograph on the page still
  // stands the same height as the ones beside it.
  const PDF_TAG_PLACES = ["in", "below", "above"];
  const PDF_TAG_ALIGNS = ["left", "center", "right"];
  const PDF_TAG_H = 3.9;

  function drawPdfSlot(page, img, slot, x, y, w, h, place, align) {
    const where = PDF_TAG_PLACES.includes(place) ? place : "in";
    const how = PDF_TAG_ALIGNS.includes(align) ? align : "left";
    // The strip comes out of the frame, never out of the neighbouring cell.
    const strip = slot.label && where !== "in" ? PDF_TAG_H + 1.2 : 0;
    const photoY = where === "above" ? y + strip : y;
    drawPdfPhoto(page, img, slot.photo, x, photoY, w, h - strip);
    if (!slot.label) return;
    // The colour here is a merge base, not a fallback: cleanPdfType always
    // hands pdfType a complete record, so this #111 has never once applied.
    const style = pdfType("photoTag", { weight: 700, size: 1.9, family: PDF_MONO, spacing: 0.25, upper: true, color: "#111" });
    const tw = page.measure(slot.label, style);
    const padX = where === "in" ? 1.4 : 0;
    const boxW = tw + padX * 2;
    // Over the picture the label keeps a margin off the edge; on paper it
    // lines up flush with the photograph above or below it.
    const inset = where === "in" ? 1.6 : 0;
    if (boxW > w - (where === "in" ? 3.2 : 0)) return;
    const tx = how === "right" ? x + w - inset - boxW
      : how === "center" ? x + (w - boxW) / 2
      : x + inset;
    const ty = where === "above" ? y
      : where === "below" ? y + h - PDF_TAG_H
      : photoY + (h - strip) - PDF_TAG_H - inset;
    // A chip goes under the label over a photograph, because anything may be
    // behind it. On paper it is only needed when the type is too pale to read
    // against the page — which is exactly the case that made every tag
    // invisible before v493, so it is worth keeping on both paths.
    const pale = pdfLuma(style.color);
    if (where === "in" || pale > 200) {
      page.ctx.fillStyle = pale > 140 ? "rgba(17,17,17,0.82)" : "rgba(255,255,255,0.9)";
      page.ctx.fillRect(page.u(tx), page.u(ty), page.u(boxW), page.u(PDF_TAG_H));
    }
    page.text(slot.label, tx + padX, ty + PDF_TAG_H / 2 + 0.68, style);
  }

  // "Model portfolio · Updated July 2026 · 2/3". A cover counts as page 1,
  // so the pages after it number from 2; pageNo 0 is the cover's own line.
  function pdfHeaderLabel(spec, pageNo) {
    const src = (spec.shoot.originalShoots && spec.shoot.originalShoots[0]) || spec.shoot;
    const d = new Date(src.date || "");
    const updated = isNaN(d) ? "" : ` · Updated ${d.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`;
    if (!pageNo) return `Model portfolio${updated}`;
    const offset = spec.cover ? 1 : 0;
    const total = spec.pages + offset;
    return `Model portfolio${updated}${total > 1 ? ` · ${pageNo + offset}/${total}` : ""}`;
  }

  function drawPdfHeader(page, mark, label) {
    const { w, margin: M } = PDF_PAGE;
    const base = M + 3.4;
    page.text(label, M, base, pdfType("header", { ...PDF_LABEL, size: 2.3 }));
    const brand = "nerdyphotographer.in";
    const brandStyle = pdfType("brand", { weight: 700, size: 2.3, family: PDF_MONO, spacing: 0.3, upper: true, color: "#000", align: "right" });
    const bw = page.measure(brand, brandStyle);
    page.text(brand, w - M, base, brandStyle);
    if (mark) page.ctx.drawImage(mark, page.u(w - M - bw - 5.6), page.u(M + 0.35), page.u(4.4), page.u(4.4));
    page.link(w - M - bw - 5.8, M - 0.5, bw + 5.8, 5.5, "https://www.nerdyphotographer.in/");
    page.rule(M, M + 6, w - M);
    return M + 6;
  }

  // The model's name as large as the width allows; returns its baseline.
  function drawPdfName(page, name, top, maxSize) {
    const width = PDF_PAGE.w - PDF_PAGE.margin * 2;
    const style = (size) => pdfType("name", { weight: 800, size, family: PDF_DISPLAY, spacing: -0.025 * size, upper: true, color: "#000" });
    let size = maxSize;
    while (size > 5 && page.measure(name, style(size)) > width) size -= 0.25;
    page.text(page.fit(name, width, style(size)), PDF_PAGE.margin, top + size * 0.74, style(size));
    return top + size * 0.74;
  }

  function drawPdfBadges(page, shoot, top, tone = { text: "#333", stroke: "#cfccc6" }) {
    const types = modelTypesOf(shoot);
    if (!types.length) return top;
    const style = pdfType("role", { weight: 600, size: 2.0, family: PDF_MONO, spacing: 0.3, upper: true, color: tone.text });
    const { ctx, u } = page;
    const h = 4.6;
    let x = tone.x ?? PDF_PAGE.margin;
    types.forEach((t) => {
      const label = modelTypeLabel(t);
      const w = page.measure(label, style) + 5.6;
      ctx.strokeStyle = tone.stroke;
      ctx.lineWidth = Math.max(1, u(0.25));
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(u(x), u(top), u(w), u(h), u(h / 2)); else ctx.rect(u(x), u(top), u(w), u(h));
      ctx.stroke();
      page.text(label, x + 2.8, top + h / 2 + 0.72, style);
      x += w + 2;
    });
    return top + h;
  }

  function portfolioPdfStatCells(shoot) {
    if (shoot.showStatsOnModelPortfolio === false) return [];
    return [
      ["Height", shoot.height], [chestLabelOf(shoot), shoot.chest], ["Waist", shoot.waist], ["Hips", shoot.hips],
      ["Shoes", shoot.shoes], ["Hair", shoot.modelHair], ["Eyes", shoot.modelEyes]
    ].filter(([, v]) => v && String(v).trim()).map(([label, v]) => ({ label, value: String(v).trim() }));
  }

  // The same contact details, under the same per-surface switches, as the
  // comp card PDF, plus the two a client may type in for this PDF alone.
  function portfolioPdfContactCells(shoot, extra) {
    const cells = [];
    visibleModelLinks(shoot, "Pdf").forEach((l) => cells.push({ label: SOCIAL_LABEL[l.kind] || "Link", value: socialPrintText(l), url: l.url }));
    if (shoot.modelEmail && showRep(shoot, "Email", "Pdf") && !cells.some((c) => c.value === shoot.modelEmail)) {
      cells.push({ label: "Email", value: shoot.modelEmail, url: `mailto:${shoot.modelEmail}` });
    }
    if (shoot.agency && showRep(shoot, "Agency", "Pdf")) {
      cells.push({ label: "Agency", value: shoot.agency });
      visibleAgencyLinks(shoot, "Pdf").forEach((l) => cells.push({ label: `Agency ${SOCIAL_LABEL[l.kind] || "link"}`, value: socialPrintText(l), url: l.url }));
    }
    if (extra.location) cells.push({ label: "Based in", value: extra.location });
    if (extra.phone) cells.push({ label: "Phone", value: extra.phone, url: `tel:${extra.phone.replace(/[^\d+]/g, "")}` });
    return cells;
  }

  // A small label over its value; returns the width used.
  function drawPdfCell(page, cell, x, top, maxW) {
    const lab = pdfType("statLabel", PDF_LABEL), val = pdfType("statValue", PDF_VALUE);
    const label = page.fit(cell.label, maxW, lab);
    const value = page.fit(cell.value, maxW, val);
    page.text(label, x, top + 1.6, lab);
    page.text(value, x, top + 5.8, val);
    const w = Math.min(maxW, Math.max(page.measure(label, lab), page.measure(value, val)));
    if (cell.url) page.link(x, top, w, PDF_CELL_H, cell.url);
    return w;
  }

  // Cells in wrapping rows across maxW; returns the height. With draw false
  // it only measures, so a page can reserve the room before placing photos.
  function flowPdfCells(page, cells, x, top, maxW, draw) {
    const gapX = 7, gapY = 2.6;
    let cx = x, cy = top;
    cells.forEach((cell) => {
      const w = Math.min(maxW, Math.max(page.measure(cell.label, pdfType("statLabel", PDF_LABEL)), page.measure(cell.value, pdfType("statValue", PDF_VALUE))));
      if (cx > x && cx + w > x + maxW) { cx = x; cy += PDF_CELL_H + gapY; }
      if (draw) drawPdfCell(page, cell, cx, cy, x + maxW - cx);
      cx += w + gapX;
    });
    return cells.length ? cy + PDF_CELL_H - top : 0;
  }

  function drawPdfBookingNote(page, x, baseline, maxW) {
    const style = pdfType("note", { weight: 400, size: 2.1, family: PDF_SANS, color: "#8a8782" });
    page.wrap(PDF_BOOKING_NOTE, maxW, style).forEach((line, i) => page.text(line, x, baseline + i * 3.1, style));
  }

  // Branding: the credit, the booking link and one line on the studio. It
  // doubles as the studio's marketing, so every page carries it.
  function drawPdfFooter(page) {
    const { w, h, margin: M } = PDF_PAGE;
    const top = h - M - PDF_FOOTER_H;
    page.rule(M, top, w - M);
    page.text("Photographed by nerdyphotographer.in  ·  @nerdyphotographer.in", M, top + 3.8, pdfType("brand", PDF_LABEL));
    const book = "Book a shoot  ·  nerdyphotographer.in/book";
    const bookStyle = pdfType("footer", { weight: 700, size: 2.2, family: PDF_MONO, spacing: 0.1, color: "#000", align: "right" });
    const bw = page.measure(book, bookStyle);
    page.text(book, w - M, top + 3.8, bookStyle);
    page.link(w - M - bw, top + 0.8, bw, 4, "https://www.nerdyphotographer.in/book");
    page.text("Fashion, fitness, lifestyle and sports photography, Noida. Comp cards, portfolio cards and frames are creative works produced under nerdyphotographer.in.", M, top + 7.6, pdfType("fine", { weight: 400, size: 1.9, family: PDF_SANS, color: "#9a9791" }));
  }

  // How strong the studio's name is drawn across a page. The preview a client
  // looks at before paying keeps it quiet (the louder one was "too loud",
  // v387); a watermarked file they take away carries it a shade darker,
  // because that copy leaves the site at full size.
  const PDF_MARK_ALPHA = { preview: 0.2, file: 0.3 };

  // Never on a PDF that was paid for, or on the studio's own clean copies.
  function drawPdfPreviewMark(page, alpha = PDF_MARK_ALPHA.preview) {
    const { ctx, u } = page;
    // The studio's name, faint enough to look past but on every photo.
    const mark = "nerdyphotographer.in";
    const style = { weight: 700, size: 6, family: PDF_DISPLAY, spacing: 0.3, color: `rgba(210, 78, 26, ${alpha})`, align: "center" };
    // Spaced by the name's own width, across the page's diagonal (364 mm).
    const step = page.measure(mark, style) + 24;
    const cols = Math.ceil(182 / step) + 1;
    ctx.save();
    ctx.translate(u(PDF_PAGE.w / 2), u(PDF_PAGE.h / 2));
    ctx.rotate(-Math.PI / 6);
    for (let row = -7; row <= 7; row++) {
      for (let col = -cols; col <= cols; col++) page.text(mark, col * step + (row % 2 ? step / 2 : 0), row * 26, style);
    }
    ctx.restore();
  }

  /* ---- Layout: where each photo sits, chosen to crop as little as possible ---- */
  const pdfAspect = (img) => ((img.naturalWidth || img.width) / (img.naturalHeight || img.height)) || 2 / 3;
  // How much of a photo a cell throws away: 0 when the shapes match.
  const pdfCropLoss = (cellAspect, photoAspect) => 1 - Math.min(cellAspect / photoAspect, photoAspect / cellAspect);

  // Every way to split photos, kept in order, into rows of at most maxPerRow.
  function pdfRowSplits(n, maxPerRow) {
    const out = [];
    for (let mask = 0; mask < (1 << Math.max(0, n - 1)); mask++) {
      const rows = [];
      let row = [0];
      for (let i = 1; i < n; i++) {
        if (mask & (1 << (i - 1))) { rows.push(row); row = [i]; } else row.push(i);
      }
      rows.push(row);
      if (rows.every((r) => r.length <= maxPerRow)) out.push(rows);
    }
    return out;
  }

  // Each row as tall as it must be for its photos to span width W uncropped.
  const pdfRowHeights = (rows, aspects, W, gap) => rows.map((r) => (W - (r.length - 1) * gap) / r.reduce((s, i) => s + aspects[i], 0));

  // Fill a W x H box exactly: take the row split whose natural height is
  // closest to H, then share the difference out as an even crop on every cell.
  function pdfFillRows(aspects, W, H, gap, maxPerRow) {
    if (!aspects.length || W <= gap * aspects.length || H <= 0) return null;
    let best = null;
    pdfRowSplits(aspects.length, maxPerRow).forEach((rows) => {
      const heights = pdfRowHeights(rows, aspects, W, gap);
      const stretch = (H - (rows.length - 1) * gap) / heights.reduce((s, x) => s + x, 0);
      if (!(stretch > 0)) return;
      const loss = pdfCropLoss(1 / stretch, 1);
      if (!best || loss < best.loss) best = { rows, heights, stretch, loss };
    });
    if (!best) return null;
    const cells = [];
    let y = 0;
    best.rows.forEach((r, ri) => {
      const rh = best.heights[ri] * best.stretch;
      let x = 0;
      r.forEach((i) => { const cw = best.heights[ri] * aspects[i]; cells[i] = { x, y, w: cw, h: rh }; x += cw + gap; });
      y += rh + gap;
    });
    return { cells, loss: best.loss };
  }

  // How much of a picture a frame of this shape throws away: 0 when they
  // match, towards 1 as they diverge.
  const pdfShapeLoss = (cell, photo) => 1 - Math.min(cell / photo, photo / cell);

  // Photos into rows of at most `cols` columns, in order, each taking as many
  // columns as its span. A photo that will not fit the row it is offered
  // starts the next one. `firstCols` narrows the opening row, which is how the
  // short row is moved to the top without disturbing the order.
  function pdfPackSpans(spans, cols, firstCols) {
    const rows = [];
    let row = [], used = 0, cap = firstCols || cols;
    spans.forEach((span, i) => {
      if (row.length && used + span > cap) { rows.push(row); row = []; used = 0; cap = cols; }
      row.push(i);
      used += span;
    });
    if (row.length) rows.push(row);
    return rows;
  }

  // Every photo the same size: the column count that gives the biggest cells
  // in W x H. Cells take the photos' typical shape (the median aspect), give
  // up to a tenth of a frame to fill more of the box, and a short row is
  // centred. Five portraits come out three on top and two below, or two on
  // top and three below with fewerOnTop: the client's choice. `rows` reports
  // the split when a row is short, so the builder knows to offer that choice.
  //
  // A landscape photograph among portraits used to be cropped to the portrait
  // shape, which cost it half its picture. It now takes TWO columns instead,
  // at the same height as everything else: the grid stays regular, the rows
  // stay level, and it keeps its shape (Sep 22 2026, at the studio's ask).
  // Nothing is special-cased as "landscape" — a photo spans two columns when
  // two columns would crop it less than one, so a page of landscapes, where
  // the median is already wide, spans nothing.
  function pdfEqualGrid(aspects, W, H, gap, fewerOnTop = false, forced = []) {
    const n = aspects.length;
    const sorted = [...aspects].sort((a, b) => a - b);
    const aspect = sorted[Math.floor((n - 1) / 2)] || 2 / 3;
    let best = null;
    for (let cols = 1; cols <= Math.min(n, 5); cols++) {
      // Which photos want two columns, judged against a first guess at the
      // cell, since the real one depends on how many rows the spans make.
      const guessW = (W - (cols - 1) * gap) / cols;
      const guessH = guessW / aspect;
      const spans = aspects.map((a, i) => {
        if (cols < 2) return 1;                       // nothing to span across
        if (forced[i] === 1 || forced[i] === 2) return forced[i];   // the client said so
        return pdfShapeLoss((guessW * 2 + gap) / guessH, a) < pdfShapeLoss(guessW / guessH, a) - 1e-6 ? 2 : 1;
      });
      // Short row at the top: the rows keep the sizes they would have had,
      // the opening one just takes the last row's share. Packing backwards
      // instead would reorder the photographs and, with a double-wide among
      // them, land them in a staircase.
      const forward = pdfPackSpans(spans, cols);
      const lastUnits = forward[forward.length - 1].reduce((s, i) => s + spans[i], 0);
      const packed = fewerOnTop && forward.length > 1 && lastUnits < cols
        ? pdfPackSpans(spans, cols, lastUnits)
        : forward;
      const rows = packed.length;
      const rowH = (H - (rows - 1) * gap) / rows;
      const w = Math.min(guessW, rowH * aspect * 1.12);
      const h = Math.min(rowH, (w / aspect) * 1.12);
      if (w > 0 && h > 0 && (!best || w * h > best.w * best.h + 1e-6)) best = { cols, rows, w, h, spans, packed };
    }
    const { cols, rows, w, h, spans, packed } = best;
    const gridW = cols * w + (cols - 1) * gap;
    const cells = [];
    packed.forEach((row, r) => {
      const units = row.reduce((s, i) => s + spans[i], 0);
      const rowW = units * w + (units - 1) * gap;
      let x = (gridW - rowW) / 2;
      row.forEach((i) => {
        const cw = spans[i] * w + (spans[i] - 1) * gap;
        cells[i] = { x, y: r * (h + gap), w: cw, h };
        x += cw + gap;
      });
    });
    // The short-row choice is offered in photographs, which is what the client
    // counts, not in columns — a row of two with one of them double-wide is
    // still two photographs.
    const counts = packed.map((r) => r.length);
    const full = Math.max(...counts), fewest = Math.min(...counts);
    return { cells, spans, width: gridW, height: rows * h + (rows - 1) * gap,
      rows: rows > 1 && fewest !== full ? { short: fewest, full } : null };
  }

  // How unevenly sized the supporting photos are: 0 when all match, towards 1
  // when one is a sliver beside another. Two tiny photos tucked into a corner
  // of an otherwise tidy page are what this keeps out.
  const pdfImbalance = (cells) => {
    if (cells.length < 2) return 0;
    const areas = cells.map((c) => c.w * c.h);
    return 1 - Math.min(...areas) / Math.max(...areas);
  };

  // One page: the lead photo large, the rest beside or beneath it. Tries both
  // arrangements at every lead size and block height, and keeps the one that
  // crops least. A shorter block costs a little, since it leaves paper blank,
  // but a clean shorter grid beats a tall one that slices faces.
  function pdfLeadLayout(leadAspect, aspects, W, maxH, gap) {
    let best = null;
    const consider = (c) => {
      if (!c) return;
      // "Big photo" has to mean it. With only two photos the least-cropped answer
      // is two equal halves, which reads exactly like All equal.
      const biggest = Math.max(0, ...c.cells.map((x) => x.w * x.h));
      if (biggest && c.lead.w * c.lead.h < biggest * 1.8) c.score += 0.6;
      if (!best || c.score < best.score) best = c;
    };
    for (let H = maxH; H >= maxH * 0.55; H -= 2) {
      const unused = (1 - H / maxH) * 0.6;
      if (!aspects.length) {
        const w = Math.min(W, H * leadAspect);
        consider({ score: pdfCropLoss(w / H, leadAspect) + unused + (1 - w / W) * 0.3, height: H, lead: { x: (W - w) / 2, y: 0, w, h: H }, cells: [] });
        continue;
      }
      for (let f = 0.38; f <= 0.721; f += 0.02) {
        const lw = W * f;
        const side = pdfFillRows(aspects, W - lw - gap, H, gap, 2);
        if (side) consider({ score: pdfCropLoss(lw / H, leadAspect) * 1.5 + side.loss + pdfImbalance(side.cells) * 0.8 + unused, height: H, lead: { x: 0, y: 0, w: lw, h: H }, cells: side.cells.map((c) => ({ ...c, x: c.x + lw + gap })) });
      }
      for (let f = 0.4; f <= 0.701; f += 0.02) {
        const lh = H * f;
        const below = pdfFillRows(aspects, W, H - lh - gap, gap, 4);
        if (below) consider({ score: pdfCropLoss(W / lh, leadAspect) * 1.5 + below.loss + pdfImbalance(below.cells) * 0.8 + unused, height: H, lead: { x: 0, y: 0, w: W, h: lh }, cells: below.cells.map((c) => ({ ...c, y: c.y + lh + gap })) });
      }
    }
    return best;
  }

  /* ---- Page compositions ---- */
  // The header, name and model-type badges a first page opens with; returns
  // where the content below them starts.
  function drawPdfTitleBlock(page, spec, mark) {
    const nameBase = drawPdfName(page, spec.name, drawPdfHeader(page, mark, pdfHeaderLabel(spec, 1)) + 5, 12);
    return drawPdfBadges(page, spec.shoot, nameBase + 3) + 5;
  }

  // Measurements between hairlines, then contact details and the booking
  // note. With draw false it only measures, so a page can reserve the room
  // before placing photos. Returns the height used.
  function pdfDetailsBlock(page, spec, top, draw) {
    const { w: PW, margin: M } = PDF_PAGE;
    const CW = PW - M * 2;
    const stats = portfolioPdfStatCells(spec.shoot);
    const contact = portfolioPdfContactCells(spec.shoot, spec);
    let y = top;
    if (stats.length) {
      if (draw) page.rule(M, y, PW - M);
      y += flowPdfCells(page, stats, M, y + 3, CW, draw) + 6;
      if (draw) page.rule(M, y, PW - M);
    }
    if (contact.length) {
      y += flowPdfCells(page, contact, M, y + 3, CW, draw) + 3 + PDF_NOTE_H;
      if (draw) drawPdfBookingNote(page, M, y - 1.2, CW);
    }
    return y - top;
  }

  function composeOnePagePdf(page, spec, imgs, mark) {
    const { w: PW, h: PH, margin: M, gap } = PDF_PAGE;
    const CW = PW - M * 2;
    const y = drawPdfTitleBlock(page, spec, mark);
    const detailsH = pdfDetailsBlock(page, spec, 0, false);
    const photoMaxH = PH - M - PDF_FOOTER_H - 5 - (detailsH ? detailsH + 5 : 0) - y;
    if (spec.layout === "equal") {
      const all = [spec.lead, ...spec.others];
      const grid = pdfEqualGrid(imgs.map(pdfAspect), CW, photoMaxH, gap, spec.fewerOnTop, all.map((s) => s.wide || 0));
      page.equalRows = grid.rows;
      // Which photographs ended up double-wide, so the builder can show it.
      page.wide = all.filter((s, i) => grid.spans[i] === 2).map((s) => s.photo.id);
      const gridTop = y + Math.max(0, (photoMaxH - grid.height) / 2);
      const x0 = M + (CW - grid.width) / 2;
      grid.cells.forEach((c, i) => drawPdfSlot(page, imgs[i], all[i], x0 + c.x, gridTop + c.y, c.w, c.h, spec.tagPlace, spec.tagAlign));
      pdfDetailsBlock(page, spec, gridTop + grid.height + 5, true);
      drawPdfFooter(page);
      return;
    }
    const layout = pdfLeadLayout(pdfAspect(imgs[0]), imgs.slice(1).map(pdfAspect), CW, photoMaxH, gap);
    // A crop-free grid can come up shorter than the page allows. Share the
    // spare height above and below, rather than leaving a blank strip at the foot.
    const top = y + Math.max(0, (photoMaxH - layout.height) / 2);
    drawPdfSlot(page, imgs[0], spec.lead, M + layout.lead.x, top + layout.lead.y, layout.lead.w, layout.lead.h, spec.tagPlace, spec.tagAlign);
    layout.cells.forEach((c, i) => drawPdfSlot(page, imgs[i + 1], spec.others[i], M + c.x, top + c.y, c.w, c.h, spec.tagPlace, spec.tagAlign));
    pdfDetailsBlock(page, spec, top + layout.height + 5, true);
    drawPdfFooter(page);
  }

  // The optional front cover: one photo across the whole sheet, with the
  // name over a dark fade at its foot so it reads on any background, white
  // seamless included. Contact details stay on the pages after it.
  function composeFrontCoverPdf(page, spec, img, mark) {
    if (spec.coverStyle === "framed") return composeFramedCoverPdf(page, spec, img, mark);
    if (spec.coverStyle === "split") return composeSplitCoverPdf(page, spec, img, mark, 0.5);
    if (spec.coverStyle === "split-wide") return composeSplitCoverPdf(page, spec, img, mark, 0.75);
    const { w: PW, h: PH, margin: M } = PDF_PAGE;
    const CW = PW - M * 2;
    const { ctx, u } = page;
    drawPdfPhoto(page, img, spec.cover.photo, 0, 0, PW, PH, false);
    const fadeTop = PH * 0.5;
    const fade = ctx.createLinearGradient(0, u(fadeTop), 0, u(PH));
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(0.5, "rgba(0,0,0,0.42)");
    fade.addColorStop(1, "rgba(0,0,0,0.8)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, u(fadeTop), u(PW), u(PH - fadeTop));

    const white = "#fff", soft = "rgba(255,255,255,0.8)";
    const credit = "Photographed by nerdyphotographer.in";
    const creditStyle = pdfType("brand", { ...PDF_LABEL, size: 2.3, color: soft });
    page.text(credit, M, PH - M, creditStyle);
    page.link(M, PH - M - 3, page.measure(credit, creditStyle), 4, "https://www.nerdyphotographer.in/");
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(u(M), u(PH - M - 6), u(CW), Math.max(1, u(0.25)));

    // Built upward from the credit line: badges, the name, then its label.
    let baseline = PH - M - 11;
    if (modelTypesOf(spec.shoot).length) {
      drawPdfBadges(page, spec.shoot, baseline - 4.6, { text: white, stroke: "rgba(255,255,255,0.7)" });
      baseline -= 8.6;
    }
    const nameStyle = (size) => pdfType("name", { weight: 800, size, family: PDF_DISPLAY, spacing: -0.025 * size, upper: true, color: white });
    let size = 17;
    while (size > 6 && page.measure(spec.name, nameStyle(size)) > CW) size -= 0.25;
    page.text(page.fit(spec.name, CW, nameStyle(size)), M, baseline, nameStyle(size));
    page.text(pdfHeaderLabel(spec, 0), M, baseline - size * 0.74 - 4, pdfType("header", { ...PDF_LABEL, size: 2.5, color: soft }));
  }

  // Cover, framed: the photo on white with the name centred beneath it, in
  // the same quiet style as the pages after it. Prints cleanly, and a photo
  // on white seamless keeps its edge.
  function composeFramedCoverPdf(page, spec, img, mark) {
    const { w: PW, h: PH, margin: M } = PDF_PAGE;
    const CW = PW - M * 2;
    const top = drawPdfHeader(page, mark, pdfHeaderLabel(spec, 0)) + 7;
    drawPdfFooter(page);
    const footerTop = PH - M - PDF_FOOTER_H;
    const nameStyle = (size) => pdfType("name", { weight: 800, size, family: PDF_DISPLAY, spacing: -0.025 * size, upper: true, color: "#000", align: "center" });
    let size = 20;
    while (size > 6 && page.measure(spec.name, nameStyle(size)) > CW) size -= 0.25;
    const types = modelTypesOf(spec.shoot);
    const badgesTop = footerTop - 8 - 4.6;
    const nameBase = types.length ? badgesTop - 4.5 : footerTop - 8;
    const room = nameBase - size * 0.74 - 8 - top;
    const aspect = pdfAspect(img);
    const w = Math.min(CW, room * aspect * 1.1);
    const h = Math.min(room, (w / aspect) * 1.1);
    drawPdfPhoto(page, img, spec.cover.photo, M + (CW - w) / 2, top, w, h);
    page.text(page.fit(spec.name, CW, nameStyle(size)), PW / 2, nameBase, nameStyle(size));
    if (types.length) {
      const pill = pdfType("role", { weight: 600, size: 2.0, family: PDF_MONO, spacing: 0.3, upper: true });
      const total = types.reduce((sum, t) => sum + page.measure(modelTypeLabel(t), pill) + 5.6, 0) + (types.length - 1) * 2;
      drawPdfBadges(page, spec.shoot, badgesTop, { text: "#333", stroke: "#cfccc6", x: (PW - total) / 2 });
    }
  }

  // Cover, split: the photo runs down the right of the page edge to edge,
  // over half or three quarters of its width (the client's choice); the name,
  // stacked large, and the model's measurements sit on white beside it.
  function composeSplitCoverPdf(page, spec, img, mark, photoShare) {
    const { w: PW, h: PH, margin: M } = PDF_PAGE;
    const photoX = PW * (1 - photoShare);
    drawPdfPhoto(page, img, spec.cover.photo, photoX, 0, PW - photoX, PH, false);
    // A hairline where photo meets paper, for photos shot on white.
    page.ctx.fillStyle = "#e2e0dc";
    page.ctx.fillRect(page.u(photoX), 0, Math.max(1, page.u(0.25)), page.u(PH));
    const x = M, colW = photoX - M - 8;
    const label = pdfType("statLabel", { ...PDF_LABEL, size: 2.3 });
    // One piece per line, wrapped again when the column is narrow (the ¾ split).
    pdfHeaderLabel(spec, 0).split(" · ")
      .flatMap((part) => page.measure(part, label) <= colW ? [part]
        // Break after "Updated" so the month and year stay together.
        : part.startsWith("Updated ") ? ["Updated", part.slice(8)] : page.wrap(part, colW, label))
      .forEach((line, i) => page.text(line, x, M + 3.4 + i * 3.6, label));

    const words = String(spec.name).split(/\s+/).filter(Boolean);
    const nameStyle = (size) => pdfType("name", { weight: 800, size, family: PDF_DISPLAY, spacing: -0.025 * size, upper: true, color: "#000" });
    let size = 17;
    while (size > 6 && Math.max(...words.map((wd) => page.measure(wd, nameStyle(size)))) > colW) size -= 0.25;
    let y = M + 28 + size * 0.74;
    words.forEach((wd, i) => page.text(wd, x, y + i * size * 0.92, nameStyle(size)));
    y += (words.length - 1) * size * 0.92 + 7;

    // Model types one to a line, so a long pair still fits the column.
    const pill = pdfType("role", { weight: 600, size: 2.0, family: PDF_MONO, spacing: 0.3, upper: true, color: "#333" });
    modelTypesOf(spec.shoot).forEach((t) => {
      const text = modelTypeLabel(t);
      const w = page.measure(text, pill) + 5.6;
      page.ctx.strokeStyle = "#cfccc6";
      page.ctx.lineWidth = Math.max(1, page.u(0.25));
      page.ctx.beginPath();
      if (page.ctx.roundRect) page.ctx.roundRect(page.u(x), page.u(y), page.u(w), page.u(4.6), page.u(2.3)); else page.ctx.rect(page.u(x), page.u(y), page.u(w), page.u(4.6));
      page.ctx.stroke();
      page.text(text, x + 2.8, y + 3.02, pill);
      y += 6.6;
    });

    // Measurements sitting on the studio line at the foot: two to a row, or
    // one when the column is too narrow to hold "Dark Brown" beside "38-40".
    const brandBase = PH - M;
    const stats = portfolioPdfStatCells(spec.shoot);
    const perRow = colW >= 50 ? 2 : 1;
    const cellW = (colW - (perRow - 1) * 4) / perRow;
    const statsTop = brandBase - 10 - Math.ceil(stats.length / perRow) * (PDF_CELL_H + 3.2);
    stats.forEach((cell, i) => drawPdfCell(page, cell, x + (i % perRow) * (cellW + 4), statsTop + Math.floor(i / perRow) * (PDF_CELL_H + 3.2), cellW));
    page.rule(x, brandBase - 6, x + colW);
    if (mark) page.ctx.drawImage(mark, page.u(x), page.u(brandBase - 3.7), page.u(4.2), page.u(4.2));
    // The studio name shrinks, never overflows, when the column is narrow.
    const brandStyle = (size) => pdfType("brand", { weight: 700, size, family: PDF_MONO, spacing: (0.3 * size) / 2.2, upper: true, color: "#000" });
    let brandSize = 2.2;
    while (brandSize > 1.4 && page.measure("nerdyphotographer.in", brandStyle(brandSize)) > colW - 5.8) brandSize -= 0.1;
    page.text("nerdyphotographer.in", x + 5.8, brandBase, brandStyle(brandSize));
    page.link(x, brandBase - 4.5, colW, 5.5, "https://www.nerdyphotographer.in/");
  }

  // Page one of two: the lead photo as large as the page allows, with every
  // detail beneath it, like the front of a comp card.
  function composeLeadPagePdf(page, spec, img, mark) {
    const { w: PW, h: PH, margin: M } = PDF_PAGE;
    const CW = PW - M * 2;
    const y = drawPdfTitleBlock(page, spec, mark);
    const detailsH = pdfDetailsBlock(page, spec, 0, false);
    const roomH = PH - M - PDF_FOOTER_H - 5 - (detailsH ? detailsH + 5 : 0) - y;
    // As large as the room allows. The photo may give up a tenth of its frame
    // to fill more of the page: a portrait off its sides, a landscape off its
    // top and bottom.
    const aspect = pdfAspect(img);
    const lw = Math.min(CW, roomH * aspect * 1.1);
    const lh = Math.min(roomH, (lw / aspect) * 1.1);
    // Same for a lead photo that can't fill the room (a wide one, say).
    const top = y + Math.max(0, (roomH - lh) / 2);
    drawPdfSlot(page, img, spec.lead, M + (CW - lw) / 2, top, lw, lh, spec.tagPlace, spec.tagAlign);
    pdfDetailsBlock(page, spec, top + lh + 5, true);
    drawPdfFooter(page);
  }

  // A page of nothing but poses: page two, and page three when there is one.
  function composePosesPdf(page, spec, imgs, mark, pageNo = 2) {
    const { w: PW, h: PH, margin: M, gap } = PDF_PAGE;
    const CW = PW - M * 2;
    let y = drawPdfHeader(page, mark, pdfHeaderLabel(spec, pageNo)) + 4.5;
    const nameStyle = pdfType("name", { weight: 800, size: 6, family: PDF_DISPLAY, spacing: -0.12, upper: true, color: "#000" });
    const name = page.fit(spec.name, CW - 30, nameStyle);
    page.text(name, M, y + 4.4, nameStyle);
    page.text("Poses", M + page.measure(name, nameStyle) + 3, y + 4.4, PDF_LABEL);
    y += 9;
    const gridH = PH - M - PDF_FOOTER_H - 5 - y;
    if (spec.layout !== "equal") {
      // One big photo, on this page too: the first photo the client put on it
      // is the big one, the rest sit beside or beneath it.
      page.equalRows = null;
      const layout = pdfLeadLayout(pdfAspect(imgs[0]), imgs.slice(1).map(pdfAspect), CW, gridH, gap);
      const top = y + Math.max(0, (gridH - layout.height) / 2);
      drawPdfSlot(page, imgs[0], spec.others[0], M + layout.lead.x, top + layout.lead.y, layout.lead.w, layout.lead.h, spec.tagPlace, spec.tagAlign);
      layout.cells.forEach((c, i) => drawPdfSlot(page, imgs[i + 1], spec.others[i + 1], M + c.x, top + c.y, c.w, c.h, spec.tagPlace, spec.tagAlign));
      drawPdfFooter(page);
      return;
    }
    const grid = pdfEqualGrid(imgs.map(pdfAspect), CW, gridH, gap, spec.fewerOnTop, spec.others.map((s) => s.wide || 0));
    page.equalRows = grid.rows || null;
    page.wide = spec.others.filter((s, i) => grid.spans[i] === 2).map((s) => s.photo.id);
    const x0 = M + (CW - grid.width) / 2;
    grid.cells.forEach((c, i) => drawPdfSlot(page, imgs[i], spec.others[i], x0 + c.x, y + c.y, c.w, c.h, spec.tagPlace, spec.tagAlign));
    drawPdfFooter(page);
  }

  function loadImageOnce(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Couldn't load ${src.startsWith("data:") ? "an embedded image" : src}`));
      img.src = src;
    });
  }

  function loadPdfImage(src, cache) {
    if (!cache.has(src)) {
      // A photo asked for moments after upload, before GitHub Pages had
      // deployed it, comes back 404, and the site's max-age=14400 can keep
      // that answer for hours: every later load of the address fails without
      // asking the server. That is how one of Devesh Baisoya's photos broke
      // the studio's PDF (2026-09-14) while loading fine everywhere else. So a
      // failed photo is asked for again at an address no cache has seen, and
      // the plain address is refetched to heal it for the rest of the site.
      const load = loadImageOnce(src).catch((err) => {
        if (src.startsWith("data:")) throw err;
        fetch(src, { cache: "reload" }).catch(() => {});
        return loadImageOnce(`${src}${src.includes("?") ? "&" : "?"}fresh=${Date.now()}`);
      });
      // A failed load mustn't stay cached, or retrying could never work.
      load.catch(() => cache.delete(src));
      cache.set(src, load);
    }
    return cache.get(src);
  }

  // Canvas text draws in whatever font is loaded at that instant, so wait for
  // the site's fonts (and the glyphs this model's name needs) first.
  function ensurePdfFonts(spec) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const sample = `${spec.name} ${spec.location || ""} ${spec.phone || ""} ABCXYZ abcxyz 0123456789 @·…`;
    return Promise.all(["800 32px Archivo", "600 16px Inter", "400 16px Inter", "600 16px 'IBM Plex Mono'", "700 16px 'IBM Plex Mono'"]
      .map((f) => document.fonts.load(f, sample).catch(() => null)));
  }

  async function renderPortfolioPdfPages(spec, { dpi, watermark, markAlpha, cache }) {
    const slots = [spec.lead, ...spec.others];
    // The preview is small, so it draws from the 960px copies when they exist.
    const srcFor = (photo) => photoSrc(dpi < 100 && photo.medium ? { url: photo.medium } : photo);
    // If a full-size photo still won't load, the 960px copy the preview drew
    // from makes that photo a little softer, rather than failing the PDF.
    const loadPhoto = (photo) => loadPdfImage(srcFor(photo), cache).catch((err) => {
      const fallback = photo.medium ? photoSrc({ url: photo.medium }) : "";
      if (!fallback || fallback === srcFor(photo)) throw err;
      console.warn("Portfolio PDF: using the 960px copy,", err.message);
      return loadPdfImage(fallback, cache);
    });
    const [imgs, mark, coverImg] = await Promise.all([
      Promise.all(slots.map((s) => loadPhoto(s.photo))),
      loadPdfImage(PDF_STUDIO_MARK, cache).catch(() => null),
      spec.cover ? loadPhoto(spec.cover.photo) : null,
      ensurePdfFonts(spec)
    ]);
    const pages = [];
    const addPage = () => { const p = newPdfPage(dpi); pages.push(p); return p; };
    if (spec.cover) composeFrontCoverPdf(addPage(), spec, coverImg, mark);
    // The photos divide between the pages, the first taking however many the
    // client chose; it also carries the name, the measurements and the
    // contact details, so it holds fewer. Every page is then drawn in the
    // same shape — All the same size, or one big photo on each page.
    let at = 0;
    portfolioSplitFor(spec, slots.length).forEach((n, i) => {
      const whole = slots.slice(at, at + n);
      const partImgs = imgs.slice(at, at + n);
      at += n;
      if (!whole.length) return;
      /* A page shows pose tags only when every photograph ON THAT PAGE has
         one. Tags under some pictures and not the ones beside them reads as a
         mistake, which is why the studio asked for all-or-nothing in the first
         place (v386) — but they asked for it again per page, because that is
         the unit anybody looks at. Across the whole PDF it meant a model with
         seventeen tagged photographs and one untagged lost all seventeen. */
      // Each page carries its own switch, because the studio asked for the
      // tags "for each page" — one page of a portfolio can want naming and
      // the next can want the photographs to speak for themselves.
      const wanted = Array.isArray(spec.tags) ? spec.tags[i] !== false : spec.tags !== false;
      const bare = wanted ? whole.filter((s) => !s.label).length : 0;
      const part = !wanted || bare ? whole.map((s) => ({ ...s, label: "" })) : whole;
      const page = addPage();
      // Recorded on the page that was drawn, never recomputed beside it, so
      // what the builder says about this page cannot disagree with what
      // printed on it. Same reason page.wide is read back rather than derived.
      page.tagsBare = bare;
      page.tagsShown = !bare && whole.some((s) => s.label);
      // A page down to its single photo is that photo as large as it will go.
      if (i === 0 && n === 1 && spec.layout !== "equal") composeLeadPagePdf(page, spec, partImgs[0], mark);
      else if (i === 0) composeOnePagePdf(page, { ...spec, lead: part[0], others: part.slice(1) }, partImgs, mark);
      else composePosesPdf(page, { ...spec, others: part }, partImgs, mark, i + 1);
    });
    if (watermark) pages.forEach((p) => drawPdfPreviewMark(p, markAlpha));
    // Drawn last so it sits over a full-bleed photograph rather than under it.
    drawPdfBorder(pages);
    return pages;
  }

  function pdfCanvasJpeg(canvas, quality) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("A page could not be encoded")); return; }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, "image/jpeg", quality));
  }

  // Lossless, for the studio's own use (see offerImages): type and hairlines
  // stay crisp where JPEG would smear them.
  function pdfCanvasPng(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob); else reject(new Error("A page could not be encoded"));
    }, "image/png"));
  }

  // A minimal PDF: one full-page JPEG per A4 page, plus link areas over the
  // printed handles and addresses so they can be tapped. JPEG goes into a PDF
  // as-is (DCTDecode), so no PDF library is needed.
  async function buildPortfolioPdf(pages, title) {
    const enc = new TextEncoder();
    const jpegs = [];
    // A page may arrive already encoded ({ jpeg, width, height, links }) with
    // its canvas released: a 20-page book held as canvases is ~170 MB, which a
    // phone refuses. The model portfolio still passes canvases.
    const dims = (p) => ({ width: p.canvas ? p.canvas.width : p.width, height: p.canvas ? p.canvas.height : p.height });
    for (const p of pages) jpegs.push(p.jpeg || await pdfCanvasJpeg(p.canvas, 0.9));
    const PT = 72 / 25.4;
    // Each page is sized from its own canvas, so a book can mix portrait and
    // landscape; an A4 portrait canvas comes out at exactly 595.28 x 841.89.
    // A page drawn for another paper size says its printed size in points.
    const pageBox = (p) => (p.pt && p.pt.w > 0 && p.pt.h > 0) ? { w: Math.round(p.pt.w * 100) / 100, h: Math.round(p.pt.h * 100) / 100 } : dims(p).width > dims(p).height ? { w: 841.89, h: 595.28 } : { w: 595.28, h: 841.89 };
    const chunks = [];
    const offsets = [];
    let length = 0;
    const write = (part) => { const bytes = typeof part === "string" ? enc.encode(part) : part; chunks.push(bytes); length += bytes.length; };
    const num = (n) => String(Math.round(n * 100) / 100);
    const literal = (s) => `(${String(s).replace(/[\\()]/g, (c) => `\\${c}`)})`;
    // Titles may hold any script, so they go in as UTF-16 with a byte-order mark.
    const unicodeText = (s) => `<FEFF${Array.from(String(s)).map((ch) => {
      const c = ch.codePointAt(0);
      if (c <= 0xffff) return c.toString(16).padStart(4, "0");
      const v = c - 0x10000;
      return (0xd800 + (v >> 10)).toString(16) + (0xdc00 + (v & 0x3ff)).toString(16);
    }).join("").toUpperCase()}>`;

    let nextId = 3;
    const ids = pages.map((p) => ({ page: nextId++, content: nextId++, image: nextId++, annots: p.links.map(() => nextId++) }));
    const infoId = nextId++;
    const begin = (id) => { offsets[id] = length; write(`${id} 0 obj\n`); };
    const end = () => write("\nendobj\n");

    write("%PDF-1.4\n");
    write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    begin(1); write("<< /Type /Catalog /Pages 2 0 R >>"); end();
    begin(2); write(`<< /Type /Pages /Kids [${ids.map((x) => `${x.page} 0 R`).join(" ")}] /Count ${pages.length} >>`); end();
    pages.forEach((p, i) => {
      const id = ids[i], jpeg = jpegs[i];
      const { w: PT_W, h: PT_H } = pageBox(p);
      begin(id.page);
      write(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT_W} ${PT_H}] /Resources << /XObject << /Im0 ${id.image} 0 R >> >> /Contents ${id.content} 0 R${id.annots.length ? ` /Annots [${id.annots.map((a) => `${a} 0 R`).join(" ")}]` : ""} >>`);
      end();
      const content = `q\n${PT_W} 0 0 ${PT_H} 0 0 cm\n/Im0 Do\nQ\n`;
      begin(id.content); write(`<< /Length ${content.length} >>\nstream\n${content}endstream`); end();
      begin(id.image);
      write(`<< /Type /XObject /Subtype /Image /Width ${dims(p).width} /Height ${dims(p).height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
      write(jpeg);
      write("\nendstream");
      end();
      p.links.forEach((l, li) => {
        const url = l.url.replace(/[^\x21-\x7e]/g, (c) => encodeURIComponent(c));
        begin(id.annots[li]);
        write(`<< /Type /Annot /Subtype /Link /Rect [${num(l.x * PT)} ${num(PT_H - (l.y + l.h) * PT)} ${num((l.x + l.w) * PT)} ${num(PT_H - l.y * PT)}] /Border [0 0 0] /A << /S /URI /URI ${literal(url)} >> >>`);
        end();
      });
    });
    begin(infoId);
    write(`<< /Title ${unicodeText(title)} /Author (nerdyphotographer.in) /Creator (nerdyphotographer.in) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z) >>`);
    end();

    const xrefAt = length;
    let xref = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
    for (let id = 1; id < nextId; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    write(xref);
    write(`trailer\n<< /Size ${nextId} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

    const out = new Uint8Array(length);
    let at = 0;
    chunks.forEach((c) => { out.set(c, at); at += c.length; });
    return out;
  }

  /* ---- The builder a client (or the studio) works through ---- */
  function openPortfolioPdfBuilder(shoot, photos) {
    const open = document.getElementById("portfolioPdfModal");
    if (open && open._close) open._close();

    const admin = isAdmin();
    const sale = getPortfolioPdfSettings();
    const price = admin ? 0 : sale.price;
    // Until the studio opens sales, clients build, preview and take the pages
    // as watermarked PNGs; only the studio downloads the PDF.
    const lookOnly = !admin && !portfolioPdfSalesOpen();
    const name = getTalentCleanName(shoot.talent || shoot.title);
    // Their PNG (or a screenshot of the preview) shows the studio which photos and layout to use.
    const lookMail = lookOnly ? portfolioPdfMailLink(name, `Hi, I'd like the portfolio PDF of ${name}. I've attached the preview I made.`) : "";
    const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    const known = portfolioPoses();
    // Photos with no pose tag come last, as a group with no name to print.
    const poses = [...known, { angle: "", label: "" }]
      .map((pose) => ({ ...pose, candidates: photos.filter((p) => pose.angle ? p.angle === pose.angle : !known.some((k) => k.angle === p.angle)) }))
      .filter((pose) => pose.candidates.length);
    const newSaleRef = () => `NP-${Date.now().toString(36).slice(-3).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const state = {
      pages: 1,
      count: 0,            // photos on the pages; the cover isn't counted
      picks: new Set(),    // chosen photo ids, any number from one pose
      /* Poses the client deliberately emptied. Nothing acts on this any more:
         it steered the topping-up, which is gone (v498 — the client picks
         every photograph themselves). It is still written and still saved,
         because a saved arrangement is read back by builds either side of
         that change and the shape has to stay the same. */
      cleared: new Set(),
      lead: "",            // id of the big photo
      cover: false,        // add a front cover page
      coverId: "",         // id of the cover photo
      coverStyle: "full",  // the cover's look: full photo, framed or split
      // Every photograph the same size to begin with: a portfolio is a set of
      // pictures of equal standing, and singling one out is a choice the
      // client makes rather than one the builder makes for them (Sep 22 2026).
      layout: "equal",     // all the same size, or one big photo with the rest around it
      perPage: [],         // photos on each page, as the client set them
      span: {},            // photo id → 1 or 2 places across, when the client overrules
      order: [],           // photo ids in the order the client arranged them
      fewerOnTop: false,   // All equal: the short row at the top, not the foot
      // Print the pose under each photograph, or don't. It used to be decided
      // for the client: tags appeared only when EVERY photograph across the
      // whole PDF had a pose, so one untagged shot anywhere silently stripped
      // the tags off every page. The consistency that rule was protecting is
      // per page — which is where a page's look lives — so the rule moved
      // there (see renderPortfolioPdfPages) and the choice came here.
      tags: [],            // per page: print pose tags on it at all
      tagPlace: "in",      // the label over the photograph, or below or above it
      tagAlign: "left",    // and which end of the photograph it lines up with
      filter: "all",       // which pose the grid shows
      choosingCover: false, // the grid is picking the cover photo
      location: "", phone: "", email: "", utr: "",
      paid: price === 0,
      paidUtr: "",         // the reference number of the payment in hand
      madeKey: "",         // the PDF that payment was spent on (see specKey)
      adjust: {},          // photo id → { x, y, zoom } from Adjust photo, this PDF only
      // Goes in the UPI payment note, so the studio can match a payment to
      // the sale email even before looking at the reference number.
      ref: newSaleRef()
    };
    const cache = new Map();
    let renderToken = 0;
    let fileUrls = [];     // blob: addresses of the finished file(s) on offer
    const dropFiles = () => { fileUrls.forEach((u) => URL.revokeObjectURL(u)); fileUrls = []; };
    let lastSplits = [];   // the short-row splits the last preview drew
    let lastWide = new Set();  // photo ids the last preview drew two places across

    // Every photo on offer, in pose order.
    const slots = poses.flatMap((pose) => pose.candidates.map((photo, i) => ({
      id: photo.id, photo, angle: pose.angle, label: pose.label,
      // A name per photo for screen readers: two Full Body shots need telling apart.
      name: !pose.label ? `Untagged photo ${i + 1}` : pose.candidates.length > 1 ? `${pose.label} · photo ${i + 1}` : pose.label
    })));
    // The picked photos in print order: as the client arranged them, with any
    // they haven't placed after, in pose order. Nothing arranged is pose order.
    const picked = () => {
      const rank = (s) => { const i = state.order.indexOf(s.id); return i < 0 ? state.order.length : i; };
      return slots.filter((s) => state.picks.has(s.id)).sort((a, b) => rank(a) - rank(b));
    };
    const pickedIn = (angle) => picked().filter((s) => s.angle === angle).length;
    // Photos free for the pages: every posed photo except the cover's.
    const available = () => slots.length - (state.cover && slots.some((s) => s.id === state.coverId) ? 1 : 0);
    // How the picked photographs fall across the pages — see spreadPages.
    const perPage = () => state.perPage.slice(0, state.pages);
    // Whether each page prints its pose labels. A page nobody has answered
    // for prints them, which is what the single switch used to do.
    const tagsPerPage = () => Array.from({ length: state.pages }, (_, i) => state.tags[i] !== false);
    /* How many pages the client asks for says how much ROOM the PDF has, and
       nothing whatever about what goes in it. The client picks every
       photograph themselves.

       It used to be a quota: choosing two pages set the total to twelve, the
       system ticked twelve photographs on the client's behalf, and Preview
       stayed dead until exactly twelve were ticked. A client who wanted eight
       was told "Pick 4 more" with no way to say "eight is what I want", and a
       client who wanted to choose for themselves first had to untick a dozen
       someone else had chosen. Both readings of the screen were right and the
       screen was wrong.

       So `state.count` is now simply how many the client picked — what the PDF
       actually holds — and the pages are a partition of it. */
    const syncCount = () => { state.count = picked().length; };
    // The most this PDF can hold: six to a page, and never more photographs
    // than the model has.
    const capacity = () => Math.min(available(), PORTFOLIO_PAGE_MAX * state.pages);
    // The fewest worth previewing: a page with nothing on it is not a page.
    const minPicks = () => Math.min(state.pages, available());
    // The largest a single page may be asked to hold: six, or fewer when the
    // other pages must keep at least one photograph each.
    /* The picked photographs spread across the pages, as even as it divides,
       the earlier pages taking the spare one: eight across two is 4 + 4, seven
       is 4 + 3. The client can still shape this by hand in the preview, where
       each sheet carries its own row of numbers. */
    const spreadPages = () => {
      const total = state.count;
      state.perPage = Array.from({ length: state.pages }, (_, i) =>
        Math.floor(total / state.pages) + (i < total % state.pages ? 1 : 0));
    };
    // Picks changed: the total and the page split both follow them.
    const syncPages = () => { syncCount(); spreadPages(); };
    // A headshot is the classic lead; otherwise the first photo picked.
    const defaultLead = () => { const p = picked(); return (p.find((s) => s.angle === "close-up") || p[0] || {}).id || ""; };
    // The cover photo is extra. It has a page of its own, so it is never also
    // on the pages and never uses up any of the 5 or 7. By default it's a
    // photo not already picked, preferring a headshot.
    const defaultCover = () => {
      const free = slots.filter((s) => !state.picks.has(s.id));
      return (free.find((s) => s.angle === "close-up") || free.find((s) => s.angle === "front") || free[0] || slots[0]).id;
    };
    // Puts a photo on the cover, taking it off the pages if it was there, and
    // returns the note to show when that freed a place.
    const setCoverPhoto = (id) => {
      state.coverId = id;
      return state.picks.delete(id) ? "Moved to the cover. Pick one more for the pages." : "";
    };
    // Opens empty. The client's own choice is the whole point of the screen,
    // so the system starts it with nothing ticked.
    syncPages();
    state.lead = defaultLead();

    const modal = document.createElement("div");
    modal.id = "portfolioPdfModal";
    modal.className = "pp-backdrop";
    modal.innerHTML = `
      <div class="pp-sheet" role="dialog" aria-modal="true" aria-labelledby="ppTitle">
        <div class="pp-head">
          <span class="pp-eyebrow">Model portfolio PDF</span>
          <h3 id="ppTitle">${esc(name)}</h3>
          <button type="button" class="pp-close" aria-label="Close">×</button>
        </div>
        <div class="pp-body"></div>
        <div class="pp-foot"></div>
      </div>
    `;
    document.body.appendChild(modal);
    const body = modal.querySelector(".pp-body");
    const foot = modal.querySelector(".pp-foot");
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Captured at the window and stopped there, so typing in this sheet
    // doesn't also page the lightbox behind it with the arrow keys.
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === "Escape") close();
    };
    function close() {
      renderToken++;
      window.removeEventListener("keydown", onKey, true);
      dropFiles();
      document.body.style.overflow = prevOverflow;
      modal.remove();
      // Back to whatever opened the builder, rather than the top of the
      // document — or, worse, nothing at all (Sep 2026 audit).
      if (pdfOpener && document.contains(pdfOpener)) { try { pdfOpener.focus(); } catch (e) {} }
    }
    const pdfOpener = document.activeElement;
    // Tab stays inside. Without this it walked out to the page underneath,
    // which is hidden behind the builder and cannot be seen.
    trapTabKey(modal, 'a[href], button:not([disabled]), input:not([disabled]), select, [tabindex]:not([tabindex="-1"])');
    modal._close = close;
    modal.querySelector(".pp-close").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    window.addEventListener("keydown", onKey, true);

    // The pages' photos exactly as they print. All equal has no big photo, so
    // it is the client's order as it stands; Big photo puts the big one first.
    function printOrder() {
      const chosen = picked();
      if (state.layout === "equal") return chosen;
      const lead = chosen.find((s) => s.id === state.lead) || chosen[0];
      return lead ? [lead, ...chosen.filter((s) => s !== lead)] : chosen;
    }

    // A photo as this PDF crops it: the client's own position and zoom, when
    // they set one, in place of the focus point saved in Upload.
    function adjusted(photo) {
      const a = state.adjust[photo.id];
      return a ? { ...photo, focalX: a.x * 100, focalY: a.y * 100, pdfZoom: a.zoom } : photo;
    }

    function buildSpec() {
      const onPages = printOrder();
      const [lead, ...rest] = onPages;
      // Only whether tags are wanted at all. Whether a given page can show
      // them consistently is decided where the pages actually exist, in
      // renderPortfolioPdfPages — deciding it here would mean re-deriving the
      // page split a second time, and a rule derived twice is a rule that can
      // disagree with the paper.
      // The real label always travels; which pages print it is decided where
      // the page split exists, in renderPortfolioPdfPages.
      const slot = (s) => ({ photo: adjusted(s.photo), label: s.label, wide: state.span[s.id] || 0 });
      return {
        shoot, name, pages: state.pages,
        lead: slot(lead),
        others: rest.map(slot),
        cover: state.cover ? slot(slots.find((s) => s.id === state.coverId) || lead) : null,
        coverStyle: state.coverStyle,
        layout: state.layout,
        perPage: perPage(),
        fewerOnTop: state.fewerOnTop,
        // Which pages name their poses, and where the name sits. The labels
        // themselves always travel on the slots; these decide what becomes of
        // them, page by page, where the split is known.
        tags: tagsPerPage(),
        tagPlace: state.tagPlace,
        tagAlign: state.tagAlign,
        location: state.location.trim(),
        phone: state.phone.trim()
      };
    }

    // What tells one PDF from another: the photos, how they're laid out and
    // how each is cropped. Location and phone are left out, so fixing a typo
    // in them is free.
    function specKey() {
      const ids = printOrder().map((s) => s.id);
      const crops = (state.cover ? [...ids, state.coverId] : ids).map((id) => {
        const a = state.adjust[id];
        return a ? [a.x, a.y, a.zoom].map((v) => Math.round(v * 1000)) : 0;
      });
      return JSON.stringify([state.pages, ids, state.layout, perPage(), state.fewerOnTop,
        tagsPerPage(), state.tagPlace, state.tagAlign,
        ids.map((id) => state.span[id] || 0),
        state.cover ? [state.coverId, state.coverStyle] : null, crops]);
    }
    // One payment buys one PDF. Until it's downloaded the client can change
    // anything; after that only that same PDF stays unlocked.
    const covered = () => !lookOnly && (price === 0 || (state.paid && (!state.madeKey || state.madeKey === specKey())));

    /* Step 1: pick photos. One contact sheet of every posed photo, filters
       by pose, and a footer that always says where things stand, so a
       message is never scrolled out of sight. */
    const SHORT_POSE = { "full-body": "Full body", front: "Front", "left-profile": "Left", "right-profile": "Right", "three-quarter": "¾ view", back: "Back", "close-up": "Close-up" };
    function showPick() {
      renderToken++;
      state.choosingCover = false;
      body.innerHTML = `
        <div class="pp-controls">
          <div class="pp-seg" role="radiogroup" aria-label="Pages">
            ${Array.from({ length: PORTFOLIO_MAX_PAGES }, (_, i) => i + 1).map((n) => `<button type="button" role="radio" data-pages="${n}" aria-checked="false">${n} page${n > 1 ? "s" : ""}</button>`).join("")}
          </div>
          <!-- How many photographs go on each page is asked at the preview,
               not here: it is a question about how the pages look, and the
               answer only suggests itself once they are on screen. -->
        </div>
        <div class="pp-filters" role="toolbar" aria-label="Show one pose">
          <button type="button" data-filter="all" aria-pressed="true">All</button>
          ${poses.map((p) => `<button type="button" data-filter="${esc(p.angle)}" aria-pressed="false">${esc(p.angle ? SHORT_POSE[p.angle] || p.label : "Other")}<span class="pp-filter-n"></span></button>`).join("")}
        </div>
        <div class="pp-mode" id="ppCoverMode" hidden>
          <span>Tap the photo for your cover</span>
          <button type="button" class="pp-link" id="ppCoverModeCancel">Cancel</button>
        </div>
        <div class="pp-grid" id="ppGrid">
          ${slots.map((x) => `
            <div class="pp-tile" data-id="${esc(x.id)}" data-angle="${esc(x.angle)}">
              <button type="button" class="pp-tile-pick" aria-pressed="false" aria-label="${esc(x.name)}">
                <img src="${esc(photoSrc(x.photo.small ? { url: x.photo.small } : x.photo))}" alt="" loading="lazy" style="object-position: ${esc(x.photo.objectPosition || "center")};" />
                ${x.angle ? `<span class="pp-tile-pose">${esc(SHORT_POSE[x.angle] || x.label)}</span>` : ""}
                <span class="pp-tile-check" aria-hidden="true"></span>
                <span class="pp-tile-cover" aria-hidden="true">Cover</span>
              </button>
              <button type="button" class="pp-tile-star" aria-pressed="false" aria-label="Make ${esc(x.name)} the big photo" title="Big photo"></button>
            </div>`).join("")}
        </div>
        <div class="pp-cover-line">
          <label class="pp-switch"><input type="checkbox" id="ppCover" /><span class="pp-switch-track" aria-hidden="true"></span><span>Cover page</span></label>
          <div class="pp-cover-set" id="ppCoverSet" hidden>
            <button type="button" class="pp-cover-thumb" id="ppCoverChange"><img id="ppCoverImg" alt="" /><span>Change</span></button>
            <div class="pp-seg" role="radiogroup" aria-label="Cover look" id="ppCoverStyleSeg">
              <button type="button" role="radio" data-cover-style="full" aria-checked="true">Full</button>
              <button type="button" role="radio" data-cover-style="framed" aria-checked="false">Framed</button>
              <button type="button" role="radio" data-cover-style="split" aria-checked="false">Split ½</button>
              <button type="button" role="radio" data-cover-style="split-wide" aria-checked="false">Split ¾</button>
            </div>
          </div>
        </div>
        <!-- Folded away for clients, to keep the picker short (v379). Open for
             the studio, which fills these in on most cards and could not find
             them: the summary is one grey line below a long photo grid. -->
        <details class="pp-more"${admin || state.location || state.phone ? " open" : ""}>
          <summary>Add location or phone — both optional</summary>
          <div class="pp-more-fields">
            <label><span class="pp-sr">Based in</span><input type="text" id="ppLocation" maxlength="40" placeholder="Based in (optional)" value="${esc(state.location)}" /></label>
            <label><span class="pp-sr">Phone</span><input type="tel" id="ppPhone" maxlength="20" placeholder="Phone (optional)" value="${esc(state.phone)}" /></label>
          </div>
          <p class="pp-hint">Fill in either, both or neither — they are independent. Printed on your PDF only, never saved.</p>
        </details>
      `;
      foot.innerHTML = `
        <p class="pp-status" aria-live="polite"><strong id="ppTally"></strong> <span id="ppMsg"></span></p>
        <button type="button" class="btn btn-ghost" id="ppCancel">Cancel</button>
        <button type="button" class="btn btn-dark" id="ppNext">Preview</button>
      `;
      body.querySelectorAll("[data-pages]").forEach((btn) => btn.addEventListener("click", () => setPages(Number(btn.dataset.pages))));
      body.querySelectorAll(".pp-filters [data-filter]").forEach((btn) => btn.addEventListener("click", () => { state.filter = btn.dataset.filter; syncPick(); }));
      body.querySelectorAll(".pp-tile").forEach((tile) => {
        tile.querySelector(".pp-tile-pick").addEventListener("click", () => {
          if (state.choosingCover) {
            state.choosingCover = false;
            syncPick(fitCountToPhotos(setCoverPhoto(tile.dataset.id)));
          } else {
            togglePick(tile.dataset.id);
          }
        });
        tile.querySelector(".pp-tile-star").addEventListener("click", () => { state.lead = tile.dataset.id; syncPick(); });
      });
      body.querySelector("#ppCover").addEventListener("change", (e) => {
        state.cover = e.target.checked;
        // Keep an earlier cover choice if it's still free; otherwise pick one.
        const keep = slots.some((x) => x.id === state.coverId) && !state.picks.has(state.coverId);
        state.choosingCover = false;
        syncPick(fitCountToPhotos(state.cover ? setCoverPhoto(keep ? state.coverId : defaultCover()) : ""));
      });
      body.querySelector("#ppCoverChange").addEventListener("click", () => {
        state.choosingCover = true;
        state.filter = "all";
        syncPick();
        body.querySelector("#ppCoverMode").scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
      body.querySelector("#ppCoverModeCancel").addEventListener("click", () => { state.choosingCover = false; syncPick(); });
      body.querySelectorAll("#ppCoverStyleSeg [data-cover-style]").forEach((btn) => btn.addEventListener("click", () => { state.coverStyle = btn.dataset.coverStyle; syncPick(); }));
      body.querySelector("#ppLocation").addEventListener("input", (e) => { state.location = e.target.value; });
      body.querySelector("#ppPhone").addEventListener("input", (e) => { state.phone = e.target.value; });
      foot.querySelector("#ppCancel").addEventListener("click", close);
      foot.querySelector("#ppNext").addEventListener("click", () => showPreview());
      syncPick();
    }

    function syncPick(warning) {
      const chosen = picked();
      if (!state.picks.has(state.lead)) state.lead = defaultLead();
      body.querySelectorAll("[data-pages]").forEach((btn) => {
        btn.setAttribute("aria-checked", String(Number(btn.dataset.pages) === state.pages));
        // A page with no photograph on it is not worth printing.
        btn.disabled = Number(btn.dataset.pages) > available();
      });
      body.querySelectorAll("#ppCoverStyleSeg [data-cover-style]").forEach((btn) => btn.setAttribute("aria-checked", String(btn.dataset.coverStyle === state.coverStyle)));
      body.querySelectorAll(".pp-filters [data-filter]").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(btn.dataset.filter === state.filter));
        const n = btn.querySelector(".pp-filter-n");
        if (n) n.textContent = pickedIn(btn.dataset.filter) || "";
      });

      const grid = body.querySelector("#ppGrid");
      grid.classList.toggle("is-equal", state.layout === "equal");
      grid.classList.toggle("is-choosing-cover", state.choosingCover);
      body.querySelector("#ppCoverMode").hidden = !state.choosingCover;
      body.querySelectorAll(".pp-tile").forEach((tile) => {
        const id = tile.dataset.id;
        tile.hidden = state.filter !== "all" && tile.dataset.angle !== state.filter;
        tile.classList.toggle("is-cover", state.cover && id === state.coverId);
        tile.querySelector(".pp-tile-pick").setAttribute("aria-pressed", String(state.picks.has(id)));
        tile.querySelector(".pp-tile-star").setAttribute("aria-pressed", String(id === state.lead));
      });

      body.querySelector("#ppCover").checked = state.cover;
      body.querySelector("#ppCoverSet").hidden = !state.cover;
      const coverSlot = slots.find((x) => x.id === state.coverId);
      if (state.cover && coverSlot) {
        const coverImg = body.querySelector("#ppCoverImg");
        const coverSrc = photoSrc(coverSlot.photo.small ? { url: coverSlot.photo.small } : coverSlot.photo);
        if (coverImg.getAttribute("src") !== coverSrc) coverImg.setAttribute("src", coverSrc);
        coverImg.style.objectPosition = coverSlot.photo.objectPosition || "center";
      }

      /* The tally reads as room, not as a target: "8 of up to 12" says eight
         is a finished answer and there is space for more, where the old
         "8/12" read as four short of a quota the client never set. */
      const short = minPicks() - chosen.length;
      const msg = foot.querySelector("#ppMsg");
      foot.querySelector("#ppTally").textContent = `${chosen.length} of up to ${capacity()}`;
      msg.classList.toggle("is-warn", !!warning);
      msg.textContent = warning
        || (state.choosingCover ? "Tap a photo for the cover"
        : short > 0 ? `Pick ${short} more — every page needs a photograph`
        : `${state.cover ? "+ cover · " : ""}${admin ? "free for you" : lookOnly ? "free with watermark" : !price ? "free" : state.madeKey ? `₹${price} for a new PDF` : state.paid ? "paid" : `₹${price}`}`);
      // Anything from one photograph a page up to a full six is a real
      // portfolio, so Preview opens as soon as every page has something.
      foot.querySelector("#ppNext").disabled = short > 0 || state.choosingCover;
    }

    function togglePick(id) {
      const slot = slots.find((s) => s.id === id);
      if (!slot) return;
      if (state.cover && id === state.coverId) {
        syncPick("That's your cover photo. Change the cover to use it on the pages.");
        return;
      }
      if (state.picks.has(id)) {
        state.picks.delete(id);
        if (!pickedIn(slot.angle)) state.cleared.add(slot.angle);
      } else if (picked().length < capacity()) {
        state.picks.add(id);
        state.cleared.delete(slot.angle);
      } else {
        // The room is full, not the choice wrong: say how to make space, and
        // that another page would make more.
        syncPick(state.pages < PORTFOLIO_MAX_PAGES
          ? `${capacity()} is all ${state.pages} page${state.pages > 1 ? "s" : ""} holds. Untick one, or add a page.`
          : `${capacity()} is the most a portfolio holds. Untick one to swap it for this.`);
        return;
      }
      // The pages are a partition of the picks, so both follow every tap.
      syncPages();
      syncPick();
    }

    // The row of numbers that sits under a page in the preview. A number the
    // model has too few photographs for is offered but disabled, so the row
    // never changes length as the client works.
    // The pose-tag switch for one page, sitting on its own sheet. It reports
    // what the page DREW (page.tagsShown / page.tagsBare), never what was
    // asked for, so it cannot claim a page printed labels it did not — the
    // same rule as the Wide button.
    function pageTagsBtnHtml(i, drawn) {
      const on = tagsPerPage()[i];
      const bare = (drawn && drawn.tagsBare) || 0;
      const shown = !!(drawn && drawn.tagsShown);
      const note = !on ? "off" : shown ? "on" : bare ? `${bare} untagged` : "none tagged";
      return `<button type="button" class="pp-sheet-tags" data-page-tags="${i}" aria-pressed="${on}"
        title="${on ? "Pose labels on this page" : "No pose labels on this page"}"
        aria-label="Pose labels on page ${i + 1}">Tags<span class="pp-sheet-tags-note">${esc(note)}</span></button>`;
    }

    /* The row of numbers under a sheet moves photographs BETWEEN pages: the
       total is what the client picked, so asking this page for more takes it
       from the others. With a single page there is nowhere to take from and
       nowhere to give, so the row would be a control that cannot do anything;
       it is left out rather than shown dead. */
    function pageCountSegHtml(i) {
      if (state.pages < 2) return "";
      const on = perPage()[i];
      return `<div class="pp-seg pp-page-count" role="radiogroup" aria-label="Photos on page ${i + 1}">
        ${PORTFOLIO_PAGE_COUNTS.map((n) => `<button type="button" role="radio" data-page="${i}" data-on-page="${n}" aria-checked="${n === on}"${canPutOnPage(i, n) ? "" : " disabled"}>${n}</button>`).join("")}
      </div>`;
    }

    /* The cover's look, offered under the cover itself in the preview. It was
       only ever on the picking screen, where the cover is a thumbnail and a
       switch: the client chooses "Framed" without being able to see what
       framed does, then finds out a page later. Here the cover is drawn full
       size beside the pages, so the choice is made while looking at it. */
    function coverStyleSegHtml() {
      const on = state.coverStyle || "full";
      const looks = [["full", "Full"], ["framed", "Framed"], ["split", "Split ½"], ["split-wide", "Split ¾"]];
      return `<div class="pp-seg pp-cover-look" role="radiogroup" aria-label="Cover look">
        ${looks.map(([v, label]) => `<button type="button" role="radio" data-sheet-cover-style="${v}" aria-checked="${v === on}">${label}</button>`).join("")}
      </div>`;
    }

    /* Changing the page count changes the room, never the contents. Fewer
       pages can leave the client holding more photographs than now fit, and
       only then does anything come off — from the back, and it is said out
       loud. Nothing is ever added. */
    function setPages(n) {
      if (n === state.pages) return;
      state.pages = n;
      const dropped = trimPicks();
      syncPages();
      syncPick(dropped.length
        ? `${state.pages} page${state.pages > 1 ? "s" : ""} holds ${capacity()}, so ${dropped.length} came off the end.`
        : "");
    }

    /* How many photographs one page carries, set by hand in the preview. The
       total is fixed by what the client picked, so giving this page more takes
       it from the others rather than asking for photographs that aren't
       there. */
    function setOnPage(i, n) {
      // One page has nowhere to move a photograph to, so there is nothing to
      // balance and the row is not offered (see pageCountSegHtml).
      if (state.pages < 2) return;
      if (!canPutOnPage(i, n) || perPage()[i] === n) return;
      /* This page gets exactly what was asked for and keeps it. The others
         give up or take on the difference, from the back forwards, each one
         staying between one photograph and six — so a page the client set
         earlier is disturbed as little as possible and 1 + 3 + 4 survives
         being built one number at a time. An earlier version re-spread every
         other page evenly, which both undid the client's own arrangement and
         could hand a single page seven photographs, which no page can hold. */
      const arr = perPage().slice();
      arr[i] = n;
      let diff = state.count - arr.reduce((a, b) => a + b, 0);
      for (let pass = 0; pass < 2 && diff !== 0; pass++) {
        for (let j = arr.length - 1; j >= 0 && diff !== 0; j--) {
          if (j === i) continue;
          if (diff > 0) { const add = Math.min(PORTFOLIO_PAGE_MAX - arr[j], diff); arr[j] += add; diff -= add; }
          else { const cut = Math.min(arr[j] - 1, -diff); arr[j] -= cut; diff += cut; }
        }
      }
      if (diff !== 0) return;  // not a split these photographs can make
      state.perPage = arr;
      /* Deliberately no syncPick here. This is only ever reached from the
         preview, whose caller redraws the sheets; syncPick speaks to the
         picker's tiles and footer, which the preview has replaced. Calling it
         threw on a null element, and the throw landed before the redraw — so
         asking page 1 for four photographs appeared to do nothing at all. */
    }

    /* Whether this page can hold n — which is only ever about whether the
       OTHER pages can take the rest, each of them holding between one
       photograph and six. Every photograph the client picked is printed, so
       the numbers across the pages always add up to what they chose: with
       nine picked over two pages that allows 3+6, 4+5, 5+4 and 6+3, and asking
       for two would leave seven on the other page, which is why two is offered
       greyed rather than silently doing nothing. To reach 2 + 4 the client
       takes photographs out — which is what the × on each one is for. */
    const canPutOnPage = (i, n) => {
      if (n < 1 || n > PORTFOLIO_PAGE_MAX) return false;
      const others = state.pages - 1;
      const rest = state.count - n;
      return rest >= others && rest <= PORTFOLIO_PAGE_MAX * others;
    };

    /* There is deliberately nothing here that picks a photograph. The screen
       used to top itself up to the count — which is why choosing a page count
       ticked photographs the client had never looked at. Every photograph on
       these pages is one the client tapped. */

    // Takes photographs off the end until they fit the room, never the big
    // photo. Returns their pose names, so the client is told what went.
    function trimPicks() {
      const dropped = [];
      while (picked().length > capacity()) {
        const drop = picked().filter((s) => s.id !== state.lead).pop();
        if (!drop) break;
        state.picks.delete(drop.id);
        dropped.unshift(drop.label);
      }
      return dropped;
    }

    // The cover photo comes off the pages, so the room shrinks by one and the
    // client may now be holding one photograph too many.
    function fitCountToPhotos(note) {
      trimPicks();
      syncPages();
      return note;
    }

    /* Step 2: preview, then pay (clients) or download (studio, or once paid). */
    function showPreview(focus) {
      const canDownload = covered();
      const payable = !canDownload && !lookOnly;
      // A visitor who can't take the clean PDF (sales closed, or not paid yet)
      // can still take the pages away as PNG images, watermark and all: one
      // image per page, so a cover and two pages are three files.
      const freePng = !admin && !canDownload;
      const sheets = state.pages + (state.cover ? 1 : 0);
      const pngs = sheets > 1 ? "PNG images" : "a PNG image";
      const upiLink = portfolioUpiLink(sale.upiId, price, state.ref);
      body.innerHTML = `
        <div class="pp-arrange" id="ppArrange">
          <div class="pp-arrange-head">
            <span class="pp-label" id="ppOrderLabel">Photo order</span>
            <div class="pp-arrange-segs">
              <div class="pp-seg" role="radiogroup" aria-label="Layout" id="ppLayoutSeg" hidden>
                <button type="button" role="radio" data-layout="lead">One big photo</button>
                <button type="button" role="radio" data-layout="equal">All the same size</button>
              </div>
              <div class="pp-seg" role="radiogroup" aria-label="Rows" id="ppRowsSeg" hidden></div>
              <!-- In the preview and not the picker: the picker is for
                   choosing photographs, this is about how they look. Whether
                   a PAGE shows its labels is asked on the page itself; where
                   the label sits is one answer for the whole PDF, so it is
                   asked once, here. -->
              <div class="pp-seg" role="radiogroup" aria-label="Where the pose label sits" id="ppTagPlaceSeg" hidden>
                <span class="pp-seg-cap" aria-hidden="true">Label</span>
                <button type="button" role="radio" data-tag-place="in">On the photo</button>
                <button type="button" role="radio" data-tag-place="below">Below</button>
                <button type="button" role="radio" data-tag-place="above">Above</button>
              </div>
              <div class="pp-seg" role="radiogroup" aria-label="How the pose label lines up" id="ppTagAlignSeg" hidden>
                <button type="button" role="radio" data-tag-align="left">Left</button>
                <button type="button" role="radio" data-tag-align="center">Centre</button>
                <button type="button" role="radio" data-tag-align="right">Right</button>
              </div>
            </div>
          </div>
          <ol class="pp-order" id="ppOrder" aria-labelledby="ppOrderLabel"></ol>
        </div>
        <p class="pp-hint pp-tap-hint">Tap a photo to move or zoom it.</p>
        <p class="pp-hint" id="ppTagsNote" hidden></p>
        <div class="pp-preview" aria-live="polite"><p class="pp-rendering">Drawing your ${state.pages > 1 || state.cover ? "pages" : "page"}…</p></div>
        <!-- The same two fields as the photo picker. They print on the first
             page, so they belong where you can watch that page redraw. -->
        <details class="pp-more"${state.location || state.phone ? " open" : ""}>
          <summary>Add location or phone — both optional</summary>
          <div class="pp-more-fields">
            <label><span class="pp-sr">Based in</span><input type="text" id="ppLocation" maxlength="40" placeholder="Based in (optional)" value="${esc(state.location)}" /></label>
            <label><span class="pp-sr">Phone</span><input type="tel" id="ppPhone" maxlength="20" placeholder="Phone (optional)" value="${esc(state.phone)}" /></label>
          </div>
          <p class="pp-hint">Fill in either, both or neither — they are independent. Printed on your PDF only, never saved.</p>
        </details>
        ${payable ? `
          <p class="pp-hint">Free with the watermark, as ${pngs}. Pay below for the PDF without it.</p>
          <div id="ppReady" class="pp-ready"></div>
          <div class="pp-pay">
            <div>
              <p class="pp-pay-title">${state.madeKey ? `This is a new PDF. Pay ₹${price} to download it` : `Pay ₹${price} to download`}</p>
              <p class="pp-hint">${state.madeKey ? "Your payment went on the PDF you downloaded. Undo your change to download that one again." : "The preview is watermarked. The PDF you download isn't."}</p>
            </div>
            ${coarse ? `<a class="btn btn-dark btn-block pp-upi-open" href="${esc(upiLink)}">Pay ₹${price} in your UPI app</a>` : ""}
            <div class="pp-pay-grid">
              <canvas class="pp-qr" id="ppQr" width="1" height="1" role="img" aria-label="UPI QR code for ₹${price}"></canvas>
              <ol class="pp-steps">
                <li>${coarse ? "Tap the button above, or scan the code from another phone." : "Scan the code with any UPI app on your phone."} It pays ₹${price} to <span class="pp-upi">${esc(sale.upiId)}</span>.</li>
                <li>Once paid, find the 12-digit UPI reference number on your receipt. Apps call it UTR or UPI Ref No.</li>
                <li>Enter it below with your email to unlock the download.</li>
              </ol>
            </div>
            <div class="pp-pay-fields">
              <label class="pp-field"><span class="pp-label">Your email</span><input type="email" id="ppEmail" autocomplete="email" inputmode="email" placeholder="name@example.com" value="${esc(state.email)}" /></label>
              <label class="pp-field"><span class="pp-label">UPI reference number</span><input type="text" id="ppUtr" inputmode="numeric" autocomplete="off" maxlength="16" placeholder="12 digits" value="${esc(state.utr)}" /></label>
            </div>
            <p class="pp-error" id="ppPayError" role="alert" hidden></p>
            <button type="button" class="btn btn-dark btn-block" id="ppUnlock">I've paid: unlock the download</button>
            <p class="pp-fine">One payment unlocks one PDF. Your payment goes straight to the studio, which matches every reference number against its bank.</p>
          </div>
        ` : `
        ${admin ? `
          <details class="pp-panel pp-saved-box">
            <summary>Saved portfolios<span id="ppSavedCount"></span></summary>
            <p class="pp-type-note">Keep this arrangement by name and reopen it whenever you like — the photos, the order, the layout, the cover and any nudge you gave a photo. It saves the arrangement rather than the file, so reopening it draws from today's photos and today's type, and both downloads are a press away. Saved on this device, and live the next time you publish from Calendar.</p>
            <div class="pp-save-row">
              <input type="text" id="ppSaveName" maxlength="60" placeholder="Name it, e.g. Devesh — agency set" />
              <button type="button" class="pp-sample-btn" id="ppSaveBtn">Save this arrangement</button>
            </div>
            <div id="ppSavedList"></div>
          </details>
          <details class="pp-panel pp-type">
            <summary>Type &amp; border</summary>
            <p class="pp-type-note">Every line of the page. Sizes are millimetres. This changes every portfolio PDF from now on, not just this one — it is saved on this device, and goes live the next time you publish from Calendar.</p>
            <div id="ppTypeRows"></div>
            <div id="ppBorderRow"></div>
            <button type="button" class="pp-sample-btn" id="ppTypeReset">↺ Put every line back to the original</button>
          </details>` : ""}
          <p class="pp-hint${admin ? " pp-hint-sample" : ""}">${admin ? `<span>Yours is free of the watermark. To send a sample with it:</span> <span class="pp-sample-actions"><button type="button" class="pp-sample-btn" id="ppDownloadMarked" data-download>Watermarked PDF</button><button type="button" class="pp-sample-btn" id="ppDownloadMarkedPng" data-download>Watermarked PNG${sheets > 1 ? "s" : ""}</button></span>` : lookOnly ? `Free to download with the watermark, as ${pngs}. ${lookMail ? `To buy the PDF without it${price ? ` for ₹${price}` : ""}, email ${lookMail} with your PNG or a screenshot of this preview.` : "The PDF without it isn't on sale yet."}` : price ? "Payment noted, thank you. It pays for one PDF with no watermark: once you've downloaded it, changing the photos or layout means paying again." : "Free to download."}</p>
          <div id="ppReady" class="pp-ready"></div>
        `}
      `;
      foot.innerHTML = `
        <button type="button" class="btn btn-ghost" id="ppBack">← Change photos</button>
        ${canDownload && admin ? `<button type="button" class="btn btn-ghost" id="ppDownloadPng" data-download>Download PNG</button>` : ""}
        ${freePng ? `<button type="button" class="btn ${payable ? "btn-ghost" : "btn-dark"}" id="ppDownloadFreePng" data-download>Download ${sheets > 1 ? `${sheets} PNGs` : "PNG"}</button>` : ""}
        ${canDownload ? `<button type="button" class="btn btn-dark" id="ppDownload" data-download>Download PDF</button>` : ""}
      `;
      foot.querySelector("#ppBack").addEventListener("click", showPick);
      const dl = foot.querySelector("#ppDownload");
      if (dl) dl.addEventListener("click", () => download(dl));
      // The clean PNG is the studio's: one image per page, for Instagram and
      // WhatsApp, where a PDF cannot be posted. Clients buy the PDF; the PNG
      // they can take is the watermarked one.
      const dlPng = foot.querySelector("#ppDownloadPng");
      if (dlPng) dlPng.addEventListener("click", () => download(dlPng, false, "png"));
      const dlFreePng = foot.querySelector("#ppDownloadFreePng");
      if (dlFreePng) dlFreePng.addEventListener("click", () => download(dlFreePng, true, "png"));
      // Changing any of it redraws the page underneath, so a choice is judged
      // against the real thing rather than described.
      // Saved arrangements: keep this one, or put a saved one back on screen.
      const savedList = body.querySelector("#ppSavedList");
      if (savedList && typeof window.getModelPdfs === "function") {
        const shootId = (shoot && shoot.id) || "";
        const store = () => window.getModelPdfs();
        const mine = () => store().versions.filter((v) => v.shootId === shootId);
        const paint = () => {
          const list = mine();
          const count = body.querySelector("#ppSavedCount");
          if (count) count.textContent = list.length ? ` (${list.length})` : "";
          savedList.innerHTML = list.length
            ? list.map((v) => `<div class="pp-saved-row" data-id="${esc(v.id)}">
                <span class="pp-saved-name">${esc(v.name || "Untitled")}</span>
                <span class="pp-saved-when">${new Date(v.updatedAt).toLocaleDateString()}</span>
                <button type="button" class="pp-sample-btn" data-open>Open</button>
                <button type="button" class="pp-sample-btn" data-del>Delete</button>
              </div>`).join("")
            : `<p class="pp-type-note" style="margin:0;">Nothing saved for this model yet.</p>`;
        };
        const write = (next) => {
          window.saveModelPdfs(next);
          if (typeof window.stampPortfolioPdfSetting === "function") window.stampPortfolioPdfSetting();
          paint();
        };
        paint();
        body.querySelector("#ppSaveBtn").addEventListener("click", () => {
          const nameEl = body.querySelector("#ppSaveName");
          // `name` in this scope is the model; this one is the arrangement.
          const title = (nameEl.value || "").trim() || `${name} — ${new Date().toLocaleDateString()}`;
          const cur = store();
          const limit = (window.MODEL_PDF_LIMITS || {}).perModel || 12;
          if (mine().length >= limit) { toast(`That is ${limit} saved for this model, which is the limit. Delete one first.`); return; }
          cur.versions.unshift({
            id: `mp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            shootId, name: title, updatedAt: Date.now(),
            spec: {
              pages: state.pages, count: state.count, picks: [...state.picks], cleared: [...state.cleared],
              lead: state.lead, cover: state.cover, coverId: state.coverId, coverStyle: state.coverStyle,
              layout: state.layout, order: [...state.order], fewerOnTop: state.fewerOnTop,
              tags: tagsPerPage(),
              tagPlace: state.tagPlace,
              tagAlign: state.tagAlign,
              perPage: perPage(),
              span: JSON.parse(JSON.stringify(state.span || {})),
              adjust: JSON.parse(JSON.stringify(state.adjust || {}))
            }
          });
          write(cur);
          nameEl.value = "";
          toast(`Saved. It is on this device — publish from Calendar to keep it everywhere.`);
        });
        savedList.addEventListener("click", (e) => {
          const row = e.target.closest(".pp-saved-row");
          if (!row) return;
          const v = mine().find((x) => x.id === row.dataset.id);
          if (!v) return;
          if (e.target.hasAttribute("data-del")) {
            if (!confirm(`Delete “${v.name}”? The photos are untouched — only this arrangement goes.`)) return;
            const cur = store();
            cur.versions = cur.versions.filter((x) => x.id !== v.id);
            cur.deleted = [...new Set([...(cur.deleted || []), v.id])];
            write(cur);
            return;
          }
          if (!e.target.hasAttribute("data-open")) return;
          const sp = v.spec;
          state.pages = sp.pages; state.count = sp.count;
          state.picks = new Set(sp.picks); state.cleared = new Set(sp.cleared);
          state.lead = sp.lead; state.cover = sp.cover; state.coverId = sp.coverId;
          state.coverStyle = sp.coverStyle; state.layout = sp.layout;
          state.order = [...sp.order]; state.fewerOnTop = sp.fewerOnTop;
          // An arrangement saved before the switch existed has no answer, and
          // "on" is what it was saved under.
          // An arrangement saved when the switch was one for the whole PDF
          // reopens with every page set the way it was.
          state.tags = Array.isArray(sp.tags) ? sp.tags.slice(0, sp.pages) : [];
          if (!Array.isArray(sp.tags)) state.tags = Array.from({ length: sp.pages }, () => sp.tags !== false);
          state.tagPlace = sp.tagPlace || "in";
          state.tagAlign = sp.tagAlign || "left";
          // One saved before the client could answer page by page is converted
          // from its total, so it reopens as the PDF it was saved as.
          /* Six to a page is the hard limit — the grid is built for six and a
             seventh has nowhere to print. Every other path honours it by
             construction, but this one takes its numbers from a file written
             by an older build, so it is clamped rather than trusted, and a
             set that cannot be made is re-spread from the count instead. */
          const saved = Array.isArray(sp.perPage) && sp.perPage.length
            ? sp.perPage.slice(0, sp.pages).map((n) => Math.max(1, Math.min(PORTFOLIO_PAGE_MAX, Number(n) || 1)))
            : portfolioLegacySplit(sp.count, sp.pages, sp.firstPage || 0);
          state.perPage = saved.reduce((a, b) => a + b, 0) === sp.count && saved.length === sp.pages
            ? saved
            : Array.from({ length: sp.pages }, (_, i) =>
                Math.floor(sp.count / sp.pages) + (i < sp.count % sp.pages ? 1 : 0));
          syncCount();
          state.adjust = JSON.parse(JSON.stringify(sp.adjust || {}));
          state.span = JSON.parse(JSON.stringify(sp.span || {}));
          showPreview();
          toast(`“${v.name}” is back on screen.`);
        });
      }

      const typeHost = body.querySelector("#ppTypeRows");
      const borderHost = body.querySelector("#ppBorderRow");
      if (typeHost && typeof window.renderPdfTypeEditor === "function") {
        window.renderPdfTypeEditor(typeHost);
        window.renderPdfBorderEditor(borderHost);
        const persist = () => {
          const cur = getPortfolioPdfSettings();
          const next = {
            ...cur,
            type: window.readPdfTypeEditor(typeHost) || cur.type,
            border: window.readPdfBorderEditor(borderHost) || cur.border
          };
          try { localStorage.setItem("wps_portfolio_pdf", JSON.stringify(next)); } catch (e) {}
          if (typeof window.stampPortfolioPdfSetting === "function") window.stampPortfolioPdfSetting();
          showPreview();
          const reopened = body.querySelector(".pp-type");
          if (reopened) reopened.open = true;
        };
        const panel = body.querySelector(".pp-type");
        panel.addEventListener("change", persist);
        body.querySelector("#ppTypeReset").addEventListener("click", () => {
          const cur = getPortfolioPdfSettings();
          try {
            localStorage.setItem("wps_portfolio_pdf", JSON.stringify({ ...cur, type: window.defaultPdfType(), border: { ...window.DEFAULT_PDF_BORDER } }));
          } catch (e) {}
          if (typeof window.stampPortfolioPdfSetting === "function") window.stampPortfolioPdfSetting();
          showPreview();
          const reopened = body.querySelector(".pp-type");
          if (reopened) reopened.open = true;
        });
      }
      const marked = body.querySelector("#ppDownloadMarked");
      if (marked) marked.addEventListener("click", () => download(marked, true));
      const markedPng = body.querySelector("#ppDownloadMarkedPng");
      if (markedPng) markedPng.addEventListener("click", () => download(markedPng, true, "png"));
      if (payable) {
        body.querySelector("#ppEmail").addEventListener("input", (e) => { state.email = e.target.value; });
        body.querySelector("#ppUtr").addEventListener("input", (e) => { state.utr = e.target.value; });
        body.querySelector("#ppUnlock").addEventListener("click", unlock);
        const qr = body.querySelector("#ppQr");
        drawUpiQr(qr, upiLink).catch((err) => { console.warn("UPI QR failed:", err); qr.hidden = true; });
      }

      body.querySelector("#ppOrder").addEventListener("click", (e) => {
        // Move or zoom, from the keyboard as well as by tapping the preview.
        const adjust = e.target.closest("[data-adjust]");
        if (adjust) {
          const id = adjust.dataset.adjust;
          const canvasPhoto = (body.querySelector(".pp-preview canvas") || {})._photos || [];
          const frame = canvasPhoto.find((f) => f.id === id);
          if (frame) showAdjust(frame);
          else {
            // The preview may not have drawn its frames yet; Adjust needs one,
            // so wait for the redraw rather than opening on nothing.
            const wait = setInterval(() => {
              const fr = ((body.querySelector(".pp-preview canvas") || {})._photos || []).find((f) => f.id === id);
              if (fr) { clearInterval(wait); showAdjust(fr); }
            }, 120);
            setTimeout(() => clearInterval(wait), 4000);
          }
          return;
        }
        // Which photo is the big one, chosen here as well as with the star in
        // the contact sheet: the page below shows what "big" means, and going
        // back to the sheet to change it is a trip for nothing.
        const star = e.target.closest("[data-make-big]");
        if (star) {
          const starId = star.closest("[data-id]").dataset.id;
          if (starId === state.lead) return;
          const wasCoveredLead = covered();
          state.lead = starId;
          if (covered() !== wasCoveredLead) { showPreview(); return; }
          syncOrder();
          drawPreview();
          return;
        }
        const btn = e.target.closest("[data-move]");
        if (!btn || btn.disabled) return;
        const id = btn.closest("[data-id]").dataset.id;
        const step = Number(btn.dataset.move);
        const wasCovered = covered();
        if (!movePhoto(id, step)) return;
        // Moving off the PDF already paid for (or back onto it) swaps the
        // download for the payment step, or back.
        if (covered() !== wasCovered) { showPreview({ id, step }); return; }
        syncOrder({ id, step });
        drawPreview();
      });
      body.querySelector("#ppOrder").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-wide]");
        if (!btn) return;
        const id = btn.dataset.wide;
        const wasCovered = covered();
        // Whatever it is doing now, ask for the other thing.
        state.span[id] = lastWide.has(id) ? 1 : 2;
        if (covered() !== wasCovered) { showPreview(); return; }
        drawPreview();
      });

      /* Taking a photograph out, from the preview, where the client can see
         what it was doing. The pages hold what was picked, so one fewer
         photograph is one fewer place — which is also how a client reaches a
         smaller arrangement like 2 + 4 when they had picked nine. */
      body.querySelector("#ppOrder").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-remove]");
        if (!btn) return;
        const id = btn.dataset.remove;
        if (state.count - 1 < minPicks()) {
          flashOrderNote(`Every page needs a photograph, so ${state.pages} page${state.pages > 1 ? "s" : ""} cannot go below ${minPicks()}.`);
          return;
        }
        const wasCovered = covered();
        state.picks.delete(id);
        state.order = state.order.filter((x) => x !== id);
        if (state.lead === id) state.lead = defaultLead();
        syncPages();
        if (covered() !== wasCovered) { showPreview(); return; }
        syncLayout(); syncOrder(); drawPreview();
      });

      /* Swapping one photograph for one that is not in the PDF, in place: the
         newcomer takes the same position, so an arrangement the client has
         already built is not disturbed by changing their mind about one
         picture. */
      body.querySelector("#ppOrder").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-swap]");
        if (!btn) return;
        showSwapChooser(btn.dataset.swap);
      });
      body.querySelector("#ppTagPlaceSeg").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-tag-place]");
        if (!btn || btn.dataset.tagPlace === state.tagPlace) return;
        const wasCovered = covered();
        state.tagPlace = btn.dataset.tagPlace;
        // Where the labels sit makes a different PDF (see specKey), so
        // changing it after paying swaps the download back for the payment
        // step, exactly as moving a photograph does.
        if (covered() !== wasCovered) { showPreview(); return; }
        drawPreview();
      });
      body.querySelector("#ppTagAlignSeg").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-tag-align]");
        if (!btn || btn.dataset.tagAlign === state.tagAlign) return;
        const wasCovered = covered();
        state.tagAlign = btn.dataset.tagAlign;
        if (covered() !== wasCovered) { showPreview(); return; }
        drawPreview();
      });
      body.querySelector("#ppRowsSeg").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-fewer-on-top]");
        if (!btn || (btn.dataset.fewerOnTop === "true") === state.fewerOnTop) return;
        const wasCovered = covered();
        state.fewerOnTop = btn.dataset.fewerOnTop === "true";
        if (covered() !== wasCovered) { showPreview(); return; }
        syncRows(lastSplits);
        drawPreview();
      });
      // Which shape the pages take. It lives here rather than with the photo
      // picking, because "One big photo" and "All the same size" mean nothing
      // until you can see them: here the page below redraws as you switch.
      body.querySelector("#ppLayoutSeg").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-layout]");
        if (!btn || btn.dataset.layout === state.layout) return;
        const wasCovered = covered();
        state.layout = btn.dataset.layout;
        // Big photo pins the big one first in Photo order; All the same size
        // frees it, so the list is rebuilt rather than just redrawn.
        if (covered() !== wasCovered) { showPreview(); return; }
        syncLayout();
        syncOrder();
        drawPreview();
      });
      let detailsTimer = 0;
      body.querySelectorAll("#ppLocation, #ppPhone").forEach((input) => input.addEventListener("input", (e) => {
        state[e.target.id === "ppLocation" ? "location" : "phone"] = e.target.value;
        clearTimeout(detailsTimer);
        detailsTimer = setTimeout(drawPreview, 300);
      }));
      // A tap on a photo in the preview opens it in Adjust photo; a tap on a
      // number under a page changes how many photographs that page carries.
      body.querySelector(".pp-preview").addEventListener("click", (e) => {
        const tagBtn = e.target.closest("[data-page-tags]");
        if (tagBtn) {
          const i = Number(tagBtn.dataset.pageTags);
          const wasCovered = covered();
          state.tags[i] = !tagsPerPage()[i];
          if (covered() !== wasCovered) { showPreview(); return; }
          drawPreview();
          return;
        }
        // The cover's look, chosen while looking at the cover itself.
        const look = e.target.closest("[data-sheet-cover-style]");
        if (look) {
          const want = look.dataset.sheetCoverStyle;
          if (want === state.coverStyle) return;
          state.coverStyle = want;
          drawPreview();
          return;
        }
        const num = e.target.closest("[data-on-page]");
        if (num) {
          if (num.disabled) return;
          const i = Number(num.dataset.page), n = Number(num.dataset.onPage);
          if (perPage()[i] === n) return;
          const wasCovered = covered();
          // One rule for this, shared with step 1: the total stays exactly
          // what the client picked, and the other pages take up the slack.
          setOnPage(i, n);
          if (covered() !== wasCovered) { showPreview(); return; }
          syncLayout();
          syncOrder();
          drawPreview();
          return;
        }
        const canvas = e.target.closest("canvas");
        if (!canvas || !canvas._photos) return;
        const r = canvas.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * PDF_PAGE.w;
        const y = (e.clientY - r.top) / r.height * PDF_PAGE.h;
        const hit = canvas._photos.find((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
        if (hit) showAdjust(hit);
      });
      syncLayout();
      syncOrder(focus);
      drawPreview();
    }

    // Draws the preview, and again after every change to the arrangement. A
    // PDF already made from the old arrangement is withdrawn, so what
    // downloads always matches what's on screen.
    function drawPreview() {
      const token = ++renderToken;
      const box = body.querySelector(".pp-preview");
      box.classList.add("is-busy");
      const ready = body.querySelector("#ppReady");
      if (ready) ready.replaceChildren();
      dropFiles();
      renderPortfolioPdfPages(buildSpec(), { dpi: 72, watermark: !covered(), cache }).then((pages) => {
        if (token !== renderToken) return;
        box.classList.remove("is-busy");
        // A cover is page nought: it has no count of its own.
        const offset = state.cover ? 1 : 0;
        box.replaceChildren(...pages.map((p, i) => {
          p.canvas._photos = p.photos;
          p.canvas.setAttribute("role", "img");
          p.canvas.setAttribute("aria-label", i < offset ? "Preview of the cover" : `Preview of page ${i - offset + 1}`);
          const item = document.createElement("figure");
          item.className = "pp-sheet-item";
          item.appendChild(p.canvas);
          const cap = document.createElement("figcaption");
          cap.className = "pp-sheet-cap";
          cap.innerHTML = i < offset
            ? `<span class="pp-sheet-name">Cover</span>${coverStyleSegHtml()}`
            : `<span class="pp-sheet-head"><span class="pp-sheet-name">Page ${i - offset + 1}</span>${pageTagsBtnHtml(i - offset, p)}</span>${pageCountSegHtml(i - offset)}`;
          item.appendChild(cap);
          return item;
        }));
        box.classList.toggle("two", pages.length === 2);
        box.classList.toggle("three", pages.length === 3);
        box.classList.toggle("four", pages.length > 3);
        lastSplits = pages.map((p) => p.equalRows).filter(Boolean);
        lastWide = new Set(pages.flatMap((p) => p.wide || []));
        syncRows(lastSplits);
        syncWide();
        syncTags(pages.slice(state.cover ? 1 : 0));
      }).catch((err) => {
        console.warn("Portfolio preview failed:", err);
        if (token !== renderToken) return;
        box.classList.remove("is-busy");
        box.innerHTML = `<p class="pp-rendering">Couldn't draw the preview. Check your connection and try again.</p>`;
      });
    }

    /* Adjust photo: one photo large, in the exact shape of its frame. Dragging
       moves it and zoom crops closer. It changes this PDF only; every photo
       starts from the focus point saved in Upload. */
    function showAdjust(frame) {
      const slot = slots.find((s) => s.id === frame.id);
      if (!slot) return;
      const token = ++renderToken;
      const saved = () => ({ ...photoFocus(slot.photo), zoom: 1 });
      const a = { ...(state.adjust[slot.id] || saved()) };
      const clamp01 = (v) => Math.min(1, Math.max(0, v));
      body.innerHTML = `
        <div class="pp-adjust">
          <p class="pp-hint">Drag the photo to move it in its frame. Zoom in to crop closer.</p>
          <div class="pp-adjust-stage"><canvas class="pp-adjust-canvas" role="img" aria-label="${esc(slot.name)}, as the PDF crops it"></canvas></div>
          <label class="pp-adjust-zoom"><span class="pp-label">Zoom</span><input type="range" id="ppZoom" min="1" max="${PDF_MAX_ZOOM}" step="0.05" value="${a.zoom}" /><output id="ppZoomVal"></output></label>
        </div>
      `;
      foot.innerHTML = `
        <button type="button" class="btn btn-ghost" id="ppAdjustReset">Reset</button>
        <button type="button" class="btn btn-dark" id="ppAdjustDone">Done</button>
      `;
      const stage = body.querySelector(".pp-adjust-stage");
      const canvas = body.querySelector(".pp-adjust-canvas");
      const zoom = body.querySelector("#ppZoom");
      const zoomVal = body.querySelector("#ppZoomVal");
      let img = null, queued = false, drag = null;

      // The frame's shape, as large as the sheet allows.
      let cw = Math.min(stage.clientWidth || 320, 520), ch = cw * frame.h / frame.w;
      const maxH = Math.max(240, window.innerHeight * 0.5);
      if (ch > maxH) { ch = maxH; cw = ch * frame.w / frame.h; }
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);

      // The crop drawPdfPhoto makes: cover the frame, times the zoom, anchored
      // at the focus point. Worked out in screen pixels.
      const crop = () => {
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        const scale = Math.max(cw / iw, ch / ih) * a.zoom;
        return { iw, ih, scale, sw: Math.min(iw, cw / scale), sh: Math.min(ih, ch / scale) };
      };
      const draw = () => {
        queued = false;
        zoomVal.textContent = `${a.zoom.toFixed(1)}×`;
        if (!img) return;
        const c = crop();
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, (c.iw - c.sw) * a.x, (c.ih - c.sh) * a.y, c.sw, c.sh, 0, 0, canvas.width, canvas.height);
      };
      const redraw = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
      // Moves the photo by screen pixels: dragging it right shows more of its left.
      const nudge = (from, dx, dy) => {
        const c = crop();
        if (c.iw - c.sw > 0.5) a.x = clamp01(from.x - dx / c.scale / (c.iw - c.sw));
        if (c.ih - c.sh > 0.5) a.y = clamp01(from.y - dy / c.scale / (c.ih - c.sh));
        redraw();
      };
      const setZoom = (z) => {
        a.zoom = Math.min(PDF_MAX_ZOOM, Math.max(1, z));
        zoom.value = String(a.zoom);
        redraw();
      };

      canvas.addEventListener("pointerdown", (e) => {
        if (!img) return;
        canvas.setPointerCapture(e.pointerId);
        drag = { px: e.clientX, py: e.clientY, x: a.x, y: a.y };
      });
      canvas.addEventListener("pointermove", (e) => { if (drag) nudge(drag, e.clientX - drag.px, e.clientY - drag.py); });
      const stop = () => { drag = null; };
      canvas.addEventListener("pointerup", stop);
      canvas.addEventListener("pointercancel", stop);
      canvas.addEventListener("wheel", (e) => {
        if (!img) return;
        e.preventDefault();
        setZoom(a.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
      }, { passive: false });
      zoom.addEventListener("input", () => setZoom(Number(zoom.value)));
      foot.querySelector("#ppAdjustReset").addEventListener("click", () => {
        Object.assign(a, saved());
        setZoom(1);
      });
      foot.querySelector("#ppAdjustDone").addEventListener("click", () => {
        const s = saved();
        const changed = Math.abs(a.x - s.x) > 0.001 || Math.abs(a.y - s.y) > 0.001 || a.zoom > 1.001;
        if (changed) state.adjust[slot.id] = { x: a.x, y: a.y, zoom: a.zoom };
        else delete state.adjust[slot.id];
        showPreview();
      });

      draw();
      loadPdfImage(photoSrc(slot.photo.medium ? { url: slot.photo.medium } : slot.photo), cache).then((loaded) => {
        if (token !== renderToken) return;
        img = loaded;
        draw();
      }).catch(() => {
        if (token !== renderToken) return;
        stage.innerHTML = `<p class="pp-rendering">Couldn't load this photo. Check your connection and try again.</p>`;
      });
    }

    /* Arranging the pages: the print order as a strip of thumbnails, each
       moved a place at a time with arrows (dragging is fiddly on a phone),
       and, when All equal leaves a row short, whether it sits top or bottom. */
    function movePhoto(id, step) {
      const ids = printOrder().map((s) => s.id);
      const from = ids.indexOf(id), to = from + step;
      // The big photo keeps first place.
      if (from < 0 || to < (state.layout === "equal" ? 0 : 1) || to >= ids.length) return false;
      [ids[from], ids[to]] = [ids[to], ids[from]];
      state.order = ids;
      return true;
    }

    function syncOrder(focus) {
      const list = printOrder();
      const fixed = state.layout === "equal" ? 0 : 1;
      const strip = body.querySelector("#ppOrder");
      strip.hidden = list.length - fixed < 2;
      strip.innerHTML = list.map((s, i) => `
        <li class="pp-order-item" data-id="${esc(s.id)}" data-pos="${i}">
          <!-- Dragging is on the photograph itself, so the buttons below stay
               ordinary buttons. Bringing the last photograph to the front was
               eight taps of the arrow; now it is one drag, and the arrows stay
               for the keyboard. -->
          <span class="pp-order-photo" data-drag="${esc(s.id)}" title="Drag to move ${esc(s.name)}">
            <img src="${esc(photoSrc(s.photo.small ? { url: s.photo.small } : s.photo))}" alt="" draggable="false" style="object-position: ${esc(s.photo.objectPosition || "center")};" />
            <span class="pp-order-n">${i < fixed ? "Big" : i + 1}</span>
            ${fixed && i >= fixed ? `<button type="button" class="pp-order-star" data-make-big aria-label="Make ${esc(s.name)} the big photo" title="Make this the big photo"></button>` : ""}
            <button type="button" class="pp-order-drop" data-remove="${esc(s.id)}" aria-label="Take ${esc(s.name)} out of this portfolio" title="Take this photo out">&times;</button>
          </span>
          <button type="button" class="pp-order-swap" data-swap="${esc(s.id)}" aria-label="Put a different photograph in place of ${esc(s.name)}" title="Swap for a photo you haven't used">Swap</button>
          <!-- Adjust photo could only be opened by tapping the preview, so a
               keyboard user could not reach it at all (Sep 2026 audit). -->
          <button type="button" class="pp-order-adjust" data-adjust="${esc(s.id)}" aria-label="Move or zoom ${esc(s.name)}" title="Move or zoom this photo">Adjust</button>
          <!-- A landscape photograph takes two places of its own accord; this
               is how the client overrules that either way, which they had no
               means of doing at all (Sep 22 2026). Only "All the same size"
               has places to take: the big-photo layout already cuts every
               supporting cell to its own photograph's shape. -->
          ${state.layout === "equal" ? `<button type="button" class="pp-order-wide" data-wide="${esc(s.id)}" aria-pressed="false" aria-label="Give ${esc(s.name)} two places across" title="Two places across">Wide</button>` : ""}
          ${i < fixed ? "" : `<span class="pp-order-move">
            <button type="button" data-move="-1" aria-label="Move ${esc(s.name)} earlier"${i === fixed ? " disabled" : ""}>‹</button>
            <button type="button" data-move="1" aria-label="Move ${esc(s.name)} later"${i === list.length - 1 ? " disabled" : ""}>›</button>
          </span>`}
        </li>`).join("");
      syncWide();
      // The strip is rebuilt on every change, so the drag is wired to the
      // strip itself rather than to the items, and only once.
      wireOrderDrag();
      // Keep the keyboard on the photo that moved, even once it reaches an end.
      if (focus) {
        const item = [...strip.children].find((li) => li.dataset.id === focus.id);
        const btn = item && (item.querySelector(`[data-move="${focus.step}"]:not([disabled])`) || item.querySelector("[data-move]:not([disabled])"));
        if (btn) btn.focus();
      }
      syncArrange();
    }

    /* A word under the strip that fades, for the cases where a tap is
       deliberately refused — taking out the last photograph a page needs. It
       borrows the strip's own live region so a screen reader hears it. */
    let orderNoteTimer = 0;
    function flashOrderNote(text) {
      const strip = body.querySelector("#ppOrder");
      let note = body.querySelector("#ppOrderNote");
      if (!note) {
        note = document.createElement("p");
        note.id = "ppOrderNote";
        note.className = "pp-hint pp-order-note";
        note.setAttribute("aria-live", "polite");
        strip.insertAdjacentElement("afterend", note);
      }
      note.textContent = text;
      note.hidden = false;
      clearTimeout(orderNoteTimer);
      orderNoteTimer = setTimeout(() => { note.hidden = true; }, 4000);
    }

    /* The photographs this model has that are not in the PDF: what a swap can
       reach for. The cover's photograph is not among them — it is spoken for. */
    const sparePhotos = () => slots.filter((s) =>
      !state.picks.has(s.id) && !(state.cover && s.id === state.coverId));

    /* Swap: a sheet of the photographs not being used, and the one tapped
       takes the place of the one being swapped — same position in the order,
       same page, so nothing the client arranged moves around it. */
    function showSwapChooser(outId) {
      const spare = sparePhotos();
      const out = slots.find((s) => s.id === outId);
      if (!out) return;
      if (!spare.length) {
        flashOrderNote("Every photograph this model has is already in the portfolio, so there is none to swap in.");
        return;
      }
      const sheet = document.createElement("div");
      sheet.className = "pp-swap-backdrop";
      sheet.innerHTML = `
        <div class="pp-swap" role="dialog" aria-modal="true" aria-label="Swap this photograph">
          <div class="pp-swap-head">
            <p class="pp-swap-title">Put another photograph in place of ${esc(out.name)}</p>
            <button type="button" class="pp-swap-x" data-swap-close aria-label="Keep the one I have">&times;</button>
          </div>
          <div class="pp-swap-grid">
            ${spare.map((s) => `
              <button type="button" class="pp-swap-tile" data-swap-in="${esc(s.id)}" title="Use ${esc(s.name)}">
                <img src="${esc(photoSrc(s.photo.small ? { url: s.photo.small } : s.photo))}" alt="${esc(s.name)}" style="object-position: ${esc(s.photo.objectPosition || "center")};" />
                ${s.label ? `<span class="pp-swap-tag">${esc(s.label)}</span>` : ""}
              </button>`).join("")}
          </div>
        </div>`;
      const close = () => sheet.remove();
      sheet.addEventListener("click", (e) => {
        if (e.target === sheet || e.target.closest("[data-swap-close]")) { close(); return; }
        const tile = e.target.closest("[data-swap-in]");
        if (!tile) return;
        const inId = tile.dataset.swapIn;
        const wasCovered = covered();
        // In place: the newcomer inherits the position, so the order holds.
        const order = printOrder().map((s) => s.id);
        const at = order.indexOf(outId);
        state.picks.delete(outId);
        state.picks.add(inId);
        if (at >= 0) { order[at] = inId; state.order = order; }
        if (state.lead === outId) state.lead = inId;
        // Anything the client had set about the photograph leaving goes with
        // it: its crop and its width belonged to that picture, not the place.
        delete state.adjust[outId];
        delete state.span[outId];
        close();
        syncPages();
        if (covered() !== wasCovered) { showPreview(); return; }
        syncLayout(); syncOrder(); drawPreview();
      });
      document.body.appendChild(sheet);
    }

    /* Dragging a photograph to a new place, with a pointer — which is one
       gesture for a mouse, a finger and a stylus alike, where HTML5 drag never
       fires on a touch screen at all. The arrows stay: they are what a
       keyboard has, and they are still the quickest way to nudge by one. */
    function wireOrderDrag() {
      const strip = body.querySelector("#ppOrder");
      if (!strip || strip._dragWired) return;
      strip._dragWired = true;
      let drag = null;

      const itemsNow = () => [...strip.querySelectorAll(".pp-order-item")];
      // Where the dragged photograph would land: the item whose middle the
      // pointer has passed. Measured live, because the strip scrolls.
      const slotAt = (x, y) => {
        const items = itemsNow();
        for (let i = 0; i < items.length; i++) {
          const r = items[i].getBoundingClientRect();
          if (x < r.left + r.width / 2 && y < r.bottom) return i;
          if (y < r.top) return i;
        }
        return items.length - 1;
      };

      strip.addEventListener("pointerdown", (e) => {
        const grip = e.target.closest("[data-drag]");
        if (!grip || e.button > 0) return;
        /* The × and the make-big star sit ON the photograph, inside the part
           that drags. Capturing the pointer for a drag swallowed their click
           entirely, so the × could not take a photograph out at all. A press
           that starts on a button is that button's. */
        if (e.target.closest("button")) return;
        const item = grip.closest(".pp-order-item");
        const fixed = state.layout === "equal" ? 0 : 1;
        // The big photograph holds first place by the layout's own rule.
        if (Number(item.dataset.pos) < fixed) return;
        drag = { id: grip.dataset.drag, from: Number(item.dataset.pos), item, moved: false, x: e.clientX, y: e.clientY };
        grip.setPointerCapture(e.pointerId);
      });

      strip.addEventListener("pointermove", (e) => {
        if (!drag) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
        // Past the slop: this is a drag, not a tap, so stop the strip
        // scrolling under the finger and show the photograph as lifted.
        if (!drag.moved) { drag.moved = true; drag.item.classList.add("is-dragging"); strip.classList.add("is-reordering"); }
        e.preventDefault();
        const to = slotAt(e.clientX, e.clientY);
        itemsNow().forEach((li, i) => li.classList.toggle("is-drop-here", i === to && i !== drag.from));
      });

      const finish = (e) => {
        if (!drag) return;
        const was = drag;
        drag = null;
        strip.classList.remove("is-reordering");
        was.item.classList.remove("is-dragging");
        itemsNow().forEach((li) => li.classList.remove("is-drop-here"));
        if (!was.moved) return;          // a tap that never travelled
        const to = slotAt(e.clientX, e.clientY);
        const fixed = state.layout === "equal" ? 0 : 1;
        if (to === was.from || to < fixed) return;
        const wasCovered = covered();
        if (!dropPhoto(was.id, to)) return;
        if (covered() !== wasCovered) { showPreview(); return; }
        syncOrder(); drawPreview();
      };
      strip.addEventListener("pointerup", finish);
      strip.addEventListener("pointercancel", finish);
    }

    /* Lifts a photograph out of the order and puts it back down at `to`,
       which is what a drag means — unlike the arrows, which trade places with
       a neighbour. Carrying the last photograph to the front leaves every
       other one in its own relative order. */
    function dropPhoto(id, to) {
      const ids = printOrder().map((s) => s.id);
      const from = ids.indexOf(id);
      if (from < 0 || to < 0 || to >= ids.length || from === to) return false;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      state.order = ids;
      return true;
    }

    // Shows which photographs the page actually drew two places across —
    // whichever chose it for themselves and whichever the client insisted on.
    // It runs off the drawn page rather than a second copy of the rule, so
    // the button can never disagree with the paper.
    function syncWide() {
      body.querySelectorAll("[data-wide]").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(lastWide.has(btn.dataset.wide)));
      });
    }

    // Real counts when every page splits the same way ("3 on top"), words when
    // they differ.
    function syncRows(splits) {
      const seg = body.querySelector("#ppRowsSeg");
      seg.hidden = !splits.length;
      if (splits.length) {
        const same = splits.every((x) => x.short === splits[0].short && x.full === splits[0].full);
        const label = (fewer) => same ? `${fewer ? splits[0].short : splits[0].full} on top` : (fewer ? "Fewer on top" : "More on top");
        if (!seg.children.length) seg.innerHTML = ["false", "true"].map((v) => `<button type="button" role="radio" data-fewer-on-top="${v}"></button>`).join("");
        seg.querySelectorAll("[data-fewer-on-top]").forEach((btn) => {
          const fewer = btn.dataset.fewerOnTop === "true";
          btn.textContent = label(fewer);
          btn.setAttribute("aria-checked", String(fewer === state.fewerOnTop));
        });
      }
      syncArrange();
    }

    // Offered whenever a page holds more than one photograph. It used to be
    // held back below three, on the reasoning that two come out as equal
    // halves either way — true when that was written, and false since v381
    // gave the lead a penalty for being under 1.8x the largest photo beside
    // it. Two photographs print 1.85x apart now, so hiding the choice left no
    // way to ask for the equal pair the note promised (found Sep 22 2026).
    function syncLayout() {
      const seg = body.querySelector("#ppLayoutSeg");
      if (!seg) return;
      seg.hidden = printOrder().length < 2;
      seg.querySelectorAll("[data-layout]").forEach((btn) => btn.setAttribute("aria-checked", String(btn.dataset.layout === state.layout)));
      syncArrange();
    }

    /* The switch, and the one sentence that makes the rule visible.

       Without the sentence this screen lies by omission. Four of the studio's
       models have no pose on a single photograph, so their PDFs can never show
       a tag — turn the switch on, watch nothing happen, conclude the switch is
       broken. The note is read off the pages that were actually drawn
       (page.tagsBare), so it cannot claim a page printed something it didn't. */
    function syncTags(pages) {
      const place = body.querySelector("#ppTagPlaceSeg");
      const align = body.querySelector("#ppTagAlignSeg");
      const note = body.querySelector("#ppTagsNote");
      if (!place || !align || !note) return;
      const posed = printOrder().filter((s) => s.label).length;
      const total = printOrder().length;
      const anyOn = tagsPerPage().some(Boolean);
      // Nothing to offer when not one photograph has a pose, or when every
      // page has its labels switched off: the controls would govern nothing.
      // The note explains instead.
      place.hidden = align.hidden = !total || !posed || !anyOn;
      place.querySelectorAll("[data-tag-place]").forEach((btn) => btn.setAttribute("aria-checked", String(btn.dataset.tagPlace === state.tagPlace)));
      align.querySelectorAll("[data-tag-align]").forEach((btn) => btn.setAttribute("aria-checked", String(btn.dataset.tagAlign === state.tagAlign)));
      let text = "";
      if (!total) text = "";
      else if (!posed) text = total === 1
        ? "This photograph has no pose set, so no tag can print on it. Poses are set in Upload."
        : `None of these ${total} photographs has a pose set, so no tags can print. Poses are set in Upload.`;
      else if (!anyOn) text = "Pose labels are off on every page, so none will print.";
      else {
        const bare = (pages || []).map((pg, i) => ({ i, n: pg.tagsBare || 0 })).filter((x) => x.n);
        if (bare.length) {
          text = bare.map(({ i, n }) => `Page ${i + 1}: no tags — ${n} photograph${n === 1 ? " has" : "s have"} no pose.`).join(" ")
            + " A page prints tags only when every photograph on it has one.";
        }
      }
      note.textContent = text;
      note.hidden = !text;
      syncArrange();
    }

    function syncArrange() {
      const hideAll = body.querySelector("#ppOrder").hidden && body.querySelector("#ppRowsSeg").hidden
        && body.querySelector("#ppTagPlaceSeg").hidden
        && body.querySelector("#ppLayoutSeg").hidden;
      body.querySelector("#ppArrange").hidden = hideAll;
    }

    function unlock() {
      const email = state.email.trim();
      const utr = state.utr.replace(/\s+/g, "");
      const error = body.querySelector("#ppPayError");
      const fail = (message, field) => { error.textContent = message; error.hidden = false; body.querySelector(field).focus(); };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fail("Enter your email, so the studio can reach you if the payment doesn't show up.", "#ppEmail"); return; }
      if (!/^\d{12}$/.test(utr)) { fail("The UPI reference number is the 12-digit number on your payment receipt.", "#ppUtr"); return; }
      const seen = readPdfUtrs()[utr];
      if (seen === "used") { fail("That reference number has already paid for a PDF. Each payment unlocks one PDF.", "#ppUtr"); return; }
      state.paid = true;
      state.paidUtr = utr;
      state.madeKey = "";
      // Entered again before any PDF was made (after a reload, say), the
      // studio already has this sale's email.
      if (seen !== "sent") {
        const spec = buildSpec();
        sendPortfolioPdfSaleEmail({
          model: name, price, upiId: sale.upiId, utr, ref: state.ref, email,
          pages: spec.pages, cover: !!spec.cover, poses: printOrder().map((s) => s.label || "no pose").join(", ")
        }).then((ok) => { if (ok) markPdfUtr(utr, "sent"); });
      }
      showPreview();
    }

    // The studio can also save a watermarked copy, to send as a sample; a
    // visitor's free PNG is that same watermarked copy.
    async function download(btn, watermark = false, format = "pdf") {
      // The clean PNG is only ever the studio's; refuse it outright otherwise,
      // so a client cannot reach an unpaid, unmarked image by calling this.
      if (format === "png" && !admin && !watermark) return;
      const asPng = format === "png";
      const token = renderToken;
      const key = specKey();
      const label = btn.textContent;
      const buttons = [...modal.querySelectorAll("[data-download]")];
      buttons.forEach((b) => { b.disabled = true; });
      btn.textContent = asPng ? "Making your images…" : "Making your PDF…";
      const ready = body.querySelector("#ppReady");
      try {
        const spec = buildSpec();
        // Full quality first. A browser short on memory (a phone after a long
        // browse, say) can refuse pages that size, so step down before giving
        // up: a slightly softer PDF beats none. A failed photo load also gets
        // retried this way, since failed loads aren't cached.
        // A watermarked copy is given away, so it starts a size down from the
        // one that is paid for: 150 dpi, where the clean PDF and PNG are 200.
        let bytes = null, lastErr = null;
        for (const dpi of watermark ? [150, 110] : [200, 150, 110]) {
          try {
            const pages = await renderPortfolioPdfPages(spec, { dpi, watermark, markAlpha: PDF_MARK_ALPHA.file, cache });
            try {
              bytes = asPng
                ? await Promise.all(pages.map((p) => pdfCanvasPng(p.canvas)))
                : await buildPortfolioPdf(pages, `${spec.name} — Model Portfolio${watermark ? " (preview)" : ""}`);
            } finally {
              // Full-resolution canvases are large; give the memory back.
              pages.forEach((p) => { p.canvas.width = 0; p.canvas.height = 0; });
            }
            break;
          } catch (err) {
            lastErr = err;
            console.warn(`Portfolio PDF failed at ${dpi} dpi:`, err);
          }
          if (token !== renderToken) return;
        }
        if (!bytes) throw lastErr || new Error("unknown error");
        if (token !== renderToken) return;
        const fileBase = `${slugify(spec.name) || "model"}-portfolio${watermark ? "-preview" : ""}`;
        const fileTitle = `${spec.name} — Model Portfolio${watermark ? " (preview)" : ""}`;
        if (asPng) offerImages(bytes, fileBase, fileTitle, !!spec.cover);
        else offerPdf(bytes, `${fileBase}.pdf`, fileTitle);
        if (price && !watermark) {
          // A watermarked copy is free and spends nothing.
          // The payment is spent on this PDF. It downloads again for free, but
          // a different PDF needs a new payment with a new note, and this
          // reference number won't unlock anything in this browser again.
          state.madeKey = key;
          markPdfUtr(state.paidUtr, "used");
          state.utr = "";
          state.ref = newSaleRef();
        }
      } catch (err) {
        console.warn("Portfolio PDF failed:", err);
        // Name the cause on screen: a client who can't open the console can
        // still send a screenshot that says what went wrong.
        const reason = (err && (err.message || err.name)) || "unknown error";
        if (ready) ready.innerHTML = `<p class="pp-error">Couldn't make the ${asPng ? "images" : "PDF"} (${esc(reason)}). Try again, or try another browser.</p>`;
      } finally {
        buttons.forEach((b) => { b.disabled = false; });
        btn.textContent = label;
      }
    }

    // One PNG per page. A computer downloads them all; a phone gets Share (which
    // is how images reach Photos, Instagram and WhatsApp) and a Save per page.
    function offerImages(blobs, fileBase, title, hasCover) {
      const ready = body.querySelector("#ppReady");
      if (!ready) return;
      dropFiles();
      const inner = blobs.length - (hasCover ? 1 : 0);
      const items = blobs.map((blob, i) => {
        const isCover = hasCover && i === 0;
        const n = i + (hasCover ? 0 : 1);
        const label = isCover ? "Cover" : inner > 1 ? `Page ${n}` : blobs.length > 1 ? "Page" : "";
        const suffix = isCover ? "-cover" : inner > 1 ? `-page-${n}` : blobs.length > 1 ? "-page" : "";
        const fileName = `${fileBase}${suffix}.png`;
        const url = URL.createObjectURL(blob);
        return { blob, url, label, fileName, file: typeof File === "function" ? new File([blob], fileName, { type: "image/png" }) : null };
      });
      fileUrls = items.map((x) => x.url);
      const files = items.map((x) => x.file).filter(Boolean);
      const canShare = !!(files.length === items.length && navigator.canShare && navigator.canShare({ files }));
      const size = items.reduce((sum, x) => sum + x.blob.size, 0);
      ready.innerHTML = `
        <p class="pp-hint"><strong>Your ${items.length > 1 ? `${items.length} images are` : "image is"} ready</strong> (PNG, ${(size / 1048576).toFixed(1)} MB${items.length > 1 ? " in all" : ""}).</p>
        <div class="pp-ready-actions">
          ${canShare ? `<button type="button" class="btn btn-dark" id="ppShare">${items.length > 1 ? "Share or save all" : "Share or save"}</button>` : ""}
          ${items.map((x, i) => `<a class="btn ${canShare ? "btn-ghost" : "btn-dark"} pp-save-img" data-i="${i}" href="${x.url}" download="${esc(x.fileName)}">Save ${esc(x.label || "PNG")}</a>`).join("")}
        </div>
      `;
      const share = ready.querySelector("#ppShare");
      if (share) share.addEventListener("click", () => navigator.share({ files, title }).catch(() => {}));
      // A phone saves nothing until one of these is tapped, and they can land
      // out of sight: above the pay panel, or under a tall preview.
      ready.scrollIntoView({ block: "nearest", behavior: prefersReduced ? "auto" : "smooth" });
      // On a computer they just download, one after another: a browser asked
      // for several files in the same instant tends to keep only the first.
      // Each save gets its own address and its own anchor, so touching the
      // preview mid-run cannot revoke the files or detach the links and leave
      // the studio with only the cover — the on-screen Save buttons are still
      // withdrawn by the redraw, which is what should happen.
      if (!coarse) {
        items.forEach((x, i) => setTimeout(() => {
          const url = URL.createObjectURL(x.blob);
          Object.assign(document.createElement("a"), { href: url, download: x.fileName }).click();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }, i * 450));
      }
    }

    function offerPdf(bytes, fileName, title) {
      const ready = body.querySelector("#ppReady");
      if (!ready) return;
      dropFiles();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const fileUrl = URL.createObjectURL(blob);
      fileUrls = [fileUrl];
      const file = typeof File === "function" ? new File([blob], fileName, { type: "application/pdf" }) : null;
      const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
      ready.innerHTML = `
        <p class="pp-hint"><strong>Your PDF is ready</strong> (${(blob.size / 1048576).toFixed(1)} MB).</p>
        <div class="pp-ready-actions">
          <a class="btn btn-dark" id="ppSave" href="${fileUrl}" download="${esc(fileName)}">Save PDF</a>
          ${canShare ? `<button type="button" class="btn btn-ghost" id="ppShare">Share</button>` : ""}
        </div>
      `;
      const share = ready.querySelector("#ppShare");
      if (share) share.addEventListener("click", () => navigator.share({ files: [file], title }).catch(() => {}));
      // On a computer the file just downloads; a phone gets the Save and
      // Share buttons, which work from a fresh tap.
      if (!coarse) ready.querySelector("#ppSave").click();
    }

    showPick();
    modal.querySelector(".pp-close").focus();
  }

  // Entry point from the Model Portfolio lightbox. A unified album (one per
  // model, merged from all their shoots) has no id in SHOOTS, so the album the
  // lightbox is showing is used first.
  function printModelPortfolio(shootId) {
    const held = window.currentCompCardShootObj;
    const shoot = (held && held.id === shootId) ? held : (shootsNow().find((x) => x.id === shootId) || held);
    if (!shoot) return;
    const photos = portfolioPdfPhotos(shoot);
    if (!photos.length) { toast("None of this model's photos can go in a portfolio PDF."); return; }
    openPortfolioPdfBuilder(shoot, photos);
  }

  function triggerCompCardDownload(shootId, orientation) {
    const targetOrient = orientation || (window.compCardOrientationByShoot && window.compCardOrientationByShoot[shootId]) || "portrait";
    if (isAdmin()) {
      printCompCard(shootId, targetOrient);
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
            <h3 style="font-family:'Archivo', sans-serif; font-size: 20px; font-weight: 700; margin: 0 0 8px; color: var(--ink);">Enter your Email</h3>
            <p style="font-size: 12px; color: var(--ink-soft); line-height: 1.5; margin: 0;">Please enter your email to proceed with downloading this talent comp card.</p>
            <p style="font-size: 10.5px; color: var(--accent-text); margin: 8px 0 0; font-family: var(--mono-font); font-weight: 600; line-height: 1.4;">
              🎲 Note: Supporting images are randomly selected from all photos tagged to this model on each export.
            </p>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; text-align: left;">
            <label style="font-family:var(--mono-font); font-size: 9px; text-transform: uppercase; font-weight: 700; color: var(--ink-soft);">Email Address</label>
            <input type="email" id="downloadEmailInput" placeholder="name@example.com" style="width: 100%; height: 42px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); border-radius: 8px; padding: 0 14px; box-sizing: border-box; font-size: 14px; outline: none; transition: border-color 0.2s;" />
            <span id="downloadEmailError" style="font-size: 10px; color: var(--accent-text); display: none; margin-top: 4px;">Please enter a valid email address.</span>
          </div>
          <div style="display: flex; gap: 12px; margin-top: 8px;">
            <button id="cancelEmailDownload" class="btn btn-ghost btn-block" style="flex: 1; height: 42px;">Cancel</button>
            <button id="submitEmailDownload" class="btn btn-dark btn-block" style="flex: 1; height: 42px; font-family:var(--mono-font); font-weight: 700;">Download</button>
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
    
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Enter your email to download the comp card");
    errorText.setAttribute("role", "alert");
    emailInput.setAttribute("aria-describedby", errorText.id || "downloadEmailError");
    modal.style.display = "flex";
    modal.offsetHeight;
    modal.style.opacity = "1";
    emailInput.focus();

    // Tab stayed inside, Escape closes this box and not the viewer behind it,
    // and Enter in the field submits (Sep 2026 audit).
    const closeEmailModal = () => {
      modal.style.opacity = "0";
      setTimeout(() => { modal.style.display = "none"; }, 300);
      document.removeEventListener("keydown", onEmailKey, true);
      if (emailOpener && document.contains(emailOpener)) { try { emailOpener.focus(); } catch (e) {} }
    };
    const emailOpener = document.activeElement === emailInput ? null : document.activeElement;
    function onEmailKey(e) {
      if (modal.style.display === "none") return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeEmailModal(); return; }
      if (e.key === "Enter" && e.target === emailInput) { e.preventDefault(); modal.querySelector("#submitEmailDownload").click(); return; }
      if (e.key !== "Tab") return;
      const f = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onEmailKey, true);
    
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

      // No download log is sent from here any more. This used to POST the
      // email, model and shoot to /api/logs on the Render backend — an
      // endpoint that answers 404 on every path, because that service was
      // never deployed. The POST was wrapped in a .catch(), so it failed
      // silently on every single download and the studio had a logging
      // feature that had never once recorded anything. Code that only
      // pretends to work is worse than no code: it stops anyone asking why
      // the log is empty. See backend/logController.js for the Aug 2026
      // decision that stranded it, and restore this deliberately alongside a
      // backend that exists if download analytics is wanted again.

      modal.style.opacity = "0";
      setTimeout(() => { modal.style.display = "none"; }, 300);

      printCompCard(shootId, targetOrient);
    });
  }

  /* ---- Handing the buttons their machinery back ------------------------
     app.js owns window.printCompCard / printModelPortfolio /
     triggerCompCardDownload: they exist from first paint, and each one
     fetches this file and then calls through to here. The rest is what
     book-builder.js borrows through window.WPS_BOOK_API, which app.js
     forwards to this object. */
  window.WPS_PDF = {
    printCompCard: (shootId, orientation) => printCompCard(shootId, orientation),
    printModelPortfolio: (shootId) => printModelPortfolio(shootId),
    triggerCompCardDownload: (shootId, orientation) => triggerCompCardDownload(shootId, orientation),
    newPdfPage: (dpi, size) => newPdfPage(dpi, size),
    photoFocus: (p) => photoFocus(p),
    loadPdfImage: (src, cache) => loadPdfImage(src, cache),
    buildPortfolioPdf: (pages, title) => buildPortfolioPdf(pages, title),
    pdfCanvasPng: (canvas) => pdfCanvasPng(canvas),
    pdfCanvasJpeg: (canvas, q) => pdfCanvasJpeg(canvas, q),
    loadQrLibrary: () => loadQrLibrary(),
    studioMark: () => PDF_STUDIO_MARK,
  };
})();
