/* ============================================================
   nerdyphotographer.in — admin (the studio's own half of the app)

   Everything here used to sit in app.js, which every visitor downloads.
   None of it is any use to a visitor: the promo and invite code editors,
   the package editor, the contract archive and its PDF generator, the
   /calendar, /contracts and /upload screens, publishing to the repository,
   and the loader for the portfolio-book builder. app.js fetches this file
   the moment admin mode is turned on (loadAdmin), the same way it already
   fetched book-builder.js, so a visitor is spared roughly a third of the
   application's bytes.

   TWO PARTS, exactly as they sat in app.js:
   1. Plain top-level code. A classic script shares the global lexical
      scope, so `const` and `function` declared here and in app.js still
      see each other — these moved unchanged.
   2. An IIFE holding the code that lived inside app.js's own IIFE. That
      closure is not shared, so app.js hands over the bindings it reads
      through window.WPS_ADMIN_API. The admin half only ever READ that
      scope (the one exception, the upload form's `staged` queue, travels
      with the upload code), so accessors are enough.

   Loaded by app.js only, never from a page. It must not be referenced from
   any HTML file: a <script> tag would put it back on every visitor's first
   paint, which is the whole point of the split.
   ============================================================ */

/* ---- markUnsavedChanges ---- */

// Flips the pricing/codes status badge to its amber "unsaved" state. Every
// draft mutation (packages, promo or invite codes) calls this; the badge
// returns to green when saveAdminCustomPackages commits the drafts. This was
// previously called but never defined anywhere — the ReferenceError aborted
// the delete handlers mid-flight, so the grid never repainted and deletes
// looked like silent no-ops.
//
// The badge used to exist once, inside the Package rates panel's folded body,
// and named a button ("Save All Changes & Push Live") that is not on the page.
// Someone editing a promo code was told to "click Save" with no Save and no
// badge in sight. Every settings panel that publishes through
// saveAdminCustomPackages now carries its own copy (.admin-save-status) beside
// its own Save & push live button, and this paints them all.
function paintSaveStatus(color, bg, html) {
  document.querySelectorAll(".admin-save-status").forEach((el) => {
    el.style.color = color;
    el.style.background = bg;
    el.style.borderColor = color;
    el.innerHTML = html;
  });
}
window.paintSaveStatus = paintSaveStatus;

function markUnsavedChanges() {
  paintSaveStatus("#d97706", "rgba(217,119,6,0.15)", '⚠️ NOT LIVE YET — press "Save &amp; push live"');
}
window.markUnsavedChanges = markUnsavedChanges;

// A code edit is kept on this device the moment it is made, so it can outlive
// the page — and so must the fact that it has not been published. Without the
// flag a reload painted "all changes saved to live site" over an edit no
// client had received. Cleared only when a publish actually succeeds.
const UNPUBLISHED_CODES_KEY = "wps_codes_unpublished";
function markCodesUnpublished() {
  try { localStorage.setItem(UNPUBLISHED_CODES_KEY, "1"); } catch (e) {}
  markUnsavedChanges();
}
window.markCodesUnpublished = markCodesUnpublished;
window.codesAreUnpublished = function() {
  try { return localStorage.getItem(UNPUBLISHED_CODES_KEY) === "1"; } catch (e) { return false; }
};


/* ---- the dates a code works between ---- */

// One block shared by the promo and the invite creator forms, told apart by
// the id prefix ("newPromo" / "newInvite"). The end is a choice rather than a
// bare date box because "no end date" is the usual answer and an empty date
// input does not say so: it reads as a field someone forgot to fill in.
window.codeDatesFieldsHtml = function(prefix, span) {
  const box = "padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: var(--font-xs); font-weight: 700; background: var(--paper); color: var(--ink); font-family: inherit;";
  const cap = "font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft); display: block; margin-bottom: 4px;";
  return `
    <div style="grid-column: span ${span}; background: var(--bone); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px;">
      <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; display: block; margin-bottom: 6px;">📅 When it works</label>
      <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;">
        <div style="flex: 1; min-width: 150px;">
          <label for="${prefix}StartDate" style="${cap}">Starts</label>
          <input type="date" id="${prefix}StartDate" style="width: 100%; ${box}" />
        </div>
        <div style="flex: 1; min-width: 190px;">
          <label for="${prefix}Ends" style="${cap}">Ends</label>
          <select id="${prefix}Ends" onchange="window.syncCodeEndsField('${prefix}')" style="width: 100%; ${box}">
            <option value="open">Runs until I switch it off</option>
            <option value="date">Ends on a date</option>
          </select>
        </div>
        <div id="${prefix}EndDateWrap" style="flex: 1; min-width: 150px; display: none;">
          <label for="${prefix}EndDate" style="${cap}">Last day it works</label>
          <input type="date" id="${prefix}EndDate" style="width: 100%; ${box}" />
        </div>
      </div>
      <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 6px; line-height: 1.4;">Leave Starts empty and the code works straight away. The dates are checked on the day the client fills in the booking form, not the day of the shoot, and both days are included — a code ending on the 31st works all day on the 31st.</div>
    </div>`;
};

window.syncCodeEndsField = function(prefix) {
  const sel = document.getElementById(prefix + "Ends");
  const wrap = document.getElementById(prefix + "EndDateWrap");
  if (sel && wrap) wrap.style.display = sel.value === "date" ? "" : "none";
};

window.fillCodeDatesFields = function(prefix, entry) {
  const start = window.cleanCodeDate(entry && entry.startDate);
  const end = window.cleanCodeDate(entry && entry.endDate);
  const startEl = document.getElementById(prefix + "StartDate");
  const endsEl = document.getElementById(prefix + "Ends");
  const endEl = document.getElementById(prefix + "EndDate");
  if (startEl) startEl.value = start;
  if (endsEl) endsEl.value = end ? "date" : "open";
  if (endEl) endEl.value = end;
  window.syncCodeEndsField(prefix);
};

// { startDate, endDate } with "" for "not set", or null when the form was
// refused (the reason has already been shown).
window.readCodeDatesFields = function(prefix) {
  const startDate = window.cleanCodeDate(document.getElementById(prefix + "StartDate")?.value);
  const endsOnDate = document.getElementById(prefix + "Ends")?.value === "date";
  const endDate = endsOnDate ? window.cleanCodeDate(document.getElementById(prefix + "EndDate")?.value) : "";
  if (endsOnDate && !endDate) {
    alert("Pick the last day this code should work — or change Ends to \"Runs until I switch it off\".");
    return null;
  }
  if (startDate && endDate && endDate < startDate) {
    alert(`The end date (${window.formatCodeDate(endDate)}) is before the start date (${window.formatCodeDate(startDate)}), so this code would never work.`);
    return null;
  }
  if (endDate && endDate < window.codeTodayKey()
      && !confirm(`${window.formatCodeDate(endDate)} has already passed, so nobody will be able to use this code. Save it anyway?`)) {
    return null;
  }
  return { startDate, endDate };
};

// The dates in words, for the line under a code on its card. Empty when the
// code carries no dates, which is most of them.
window.codeDatesLine = function(entry) {
  const start = window.cleanCodeDate(entry && entry.startDate);
  const end = window.cleanCodeDate(entry && entry.endDate);
  if (start && end) return `Works ${window.formatCodeDate(start)} – ${window.formatCodeDate(end)}`;
  if (start) return `Works from ${window.formatCodeDate(start)}, until you switch it off`;
  if (end) return `Works until ${window.formatCodeDate(end)}`;
  return "";
};

// The state badge on a code's card. A live code gets none — the card stays as
// quiet as it was — so a badge always means "clients cannot use this today".
window.codeStatusBadgeHtml = function(entry) {
  const st = window.codeStatus(entry);
  const pill = (bg, fg, text, title) => `<span style="font-size: var(--font-xs); font-weight: 700; background: ${bg}; color: ${fg}; padding: 2px 6px; border-radius: 4px; white-space: nowrap;" title="${title}">${text}</span>`;
  if (st === "off") return pill("rgba(120,120,120,0.18)", "var(--ink-soft)", "OFF", "Switched off — clients cannot use this code");
  if (st === "early") return pill("rgba(217,119,6,0.14)", "#d97706", "NOT STARTED", "Clients cannot use this code until its start date");
  if (st === "ended") return pill("rgba(120,120,120,0.18)", "var(--ink-soft)", "ENDED", "Past its end date — clients cannot use this code. Edit it to set a new end date.");
  return "";
};


/* ---- promo CRUD ---- */

window.addNewAdminPromoCode = function() {
  window.openPromoCodeModal();
};

window.editAdminPromoCode = function(codeKey) {
  window.openPromoCodeModal(codeKey);
};

// Same promise persistAdminInviteCodes makes for invites. A promo edit used to
// live in memory until Save & push live was pressed, so a reload — or simply
// not finding the button — lost it without a word.
window.persistAdminPromoCodes = function() {
  try {
    if (!window.adminDraftPromoCodes || typeof window.adminDraftPromoCodes !== "object") return false;
    localStorage.setItem("wps_custom_promo_codes", JSON.stringify(window.adminDraftPromoCodes));
    stampSetting("wps_custom_promo_codes");
    return true;
  } catch (e) {
    return false;
  }
};

window.toggleAdminPromoActive = function(codeName) {
  const codes = window.getAdminPromoCodes();
  const entry = codes[codeName];
  if (!entry) return;
  const nowOn = !window.promoCodeIsActive(entry);
  codes[codeName] = { ...entry, active: nowOn };
  window.adminDraftPromoCodes = { ...codes };
  window.persistAdminPromoCodes();
  markCodesUnpublished();
  if (typeof toast === "function") toast(`🎟️ '${codeName}' ${nowOn ? "switched on" : "switched off"}. Press "Save & push live" at the top of Promo codes to make it live.`);
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
};

window.deleteAdminPromoCode = function(codeName) {
  if (confirm(`Remove promo code '${codeName}' from draft?`)) {
    const currentCodes = window.getAdminPromoCodes();
    delete currentCodes[codeName];
    window.adminDraftPromoCodes = { ...currentCodes };
    window.persistAdminPromoCodes();
    markCodesUnpublished();
    if (typeof toast === "function") toast(`🗑️ Promo code '${codeName}' removed. Press "Save & push live" at the top of Promo codes to make it live.`);
    if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
  }
};

// Opens the inline promo-code creator form (rendered hidden inside the admin
// promo grid) in "create" or "edit" mode. codeKey naming an existing code →
// edit that code with fields prefilled (rename allowed). These open/save
// functions were referenced by every Add/Edit button but never existed, so
// all promo & invite CRUD buttons threw TypeErrors and did nothing.
window.openPromoCodeModal = function(codeKey) {
  const form = document.getElementById("promoCreatorForm");
  if (!form) { alert("Open the Calendar admin page to manage promo codes."); return; }
  const codes = window.getAdminPromoCodes();
  const editing = codeKey && codes[codeKey] ? codeKey : null;
  window._editingPromoKey = editing;

  const title = document.getElementById("promoCreatorFormTitle");
  const nameEl = document.getElementById("newPromoName");
  const typeEl = document.getElementById("newPromoType");
  const valEl = document.getElementById("newPromoVal");
  const descEl = document.getElementById("newPromoDesc");
  if (title) title.textContent = editing ? `✏️ Edit Promo Code — ${editing}` : "🎟️ Create New Custom Promotional Discount Code";
  const entry = editing ? codes[editing] : null;
  if (nameEl) nameEl.value = editing || "";
  // 'in' rather than truthiness: a home-studio-only code can legitimately
  // store a package value of 0, which || would treat the same as "absent"
  // and blank out on reopen — then reject the next save as not-a-number.
  if (typeEl) typeEl.value = entry && ('flat' in entry) ? "flat" : "pct";
  if (valEl) valEl.value = entry ? String((('flat' in entry) ? entry.flat : entry.pct) ?? "") : "";
  if (descEl) descEl.value = entry ? (entry.label || "") : "";
  // Carry the existing add-on rule into the form; without this, editing a code
  // to fix a typo would quietly demote it to package-only.
  const addonsEl = document.getElementById("newPromoIncludeAddons");
  if (addonsEl) addonsEl.checked = !!(entry && entry.includeAddons);
  const hsTypeEl = document.getElementById("newPromoHomeStudioType");
  const hsValEl = document.getElementById("newPromoHomeStudioVal");
  const hsDiscount = window.getPromoHomeStudioDiscount(entry);
  if (hsTypeEl) hsTypeEl.value = hsDiscount.type;
  if (hsValEl) hsValEl.value = (hsDiscount.type === "flat" || hsDiscount.type === "pct" || hsDiscount.type === "fixed") ? (hsDiscount.value ?? "") : "";
  // Without this, reopening a switched-off code to fix a typo would quietly
  // switch it back on.
  const activeEl = document.getElementById("newPromoActive");
  if (activeEl) activeEl.checked = entry ? window.promoCodeIsActive(entry) : true;
  window.fillCodeDatesFields("newPromo", entry);
  if (typeof window.togglePromoHomeStudioValField === "function") window.togglePromoHomeStudioValField();

  form.style.display = "block";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  if (nameEl) nameEl.focus();
};


/* The per-line type editor in the Portfolio PDF panel. Rows are generated from
   window.PDF_TYPE_ROLES — the same list pdf-tools.js draws from — so a role
   added there appears here with no second edit. */
const pdfEsc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
window.renderPdfTypeEditor = function(host) {
  host = host || document.getElementById("pdfTypeRows");
  if (!host || !window.PDF_TYPE_ROLES) return;
  const cur = (window.getPortfolioPdfSettings() || {}).type || window.defaultPdfType();
  const fams = window.PDF_TYPE_FAMILIES || {};
  const cell = "padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink); font-size: var(--font-xs); font-family: inherit;";
  host.innerHTML = window.PDF_TYPE_ROLES.map((r) => {
    const v = cur[r.key] || {};
    const isAuto = v.color === "auto";
    /* Laid out in the stylesheet, not here: this editor is shown in the admin
       page AND in a panel beside the portfolio preview, and a grid of fixed
       columns written inline could not answer to either. It cut the selects
       off at the panel's edge and asked the studio to scroll sideways to
       reach them, which read as the controls being missing. */
    return `<div class="pdf-type-row" data-role="${pdfEsc(r.key)}"${r.aligns ? ' data-aligns="1"' : ""}${r.fills ? ' data-fills="1"' : ""}>
      <div class="pdf-type-what">
        <strong style="font-size: var(--font-xs); color: var(--ink);">${pdfEsc(r.label)}</strong>
        ${r.note ? `<span style="display: block; font-size: var(--font-xs); color: var(--ink-soft);">${pdfEsc(r.note)}</span>` : ""}
      </div>
      <select data-f="family" style="${cell}" aria-label="Typeface for ${pdfEsc(r.label)}">
        ${Object.entries(fams).map(([k, f]) => `<option value="${pdfEsc(k)}"${v.family === k ? " selected" : ""}>${pdfEsc(f.label)}</option>`).join("")}
      </select>
      <select data-f="weight" style="${cell}" aria-label="Weight for ${pdfEsc(r.label)}">
        ${(window.PDF_TYPE_WEIGHTS || []).map((w) => `<option value="${w}"${Number(v.weight) === w ? " selected" : ""}>${w === 400 ? "Regular" : w === 500 ? "Medium" : w === 600 ? "Semibold" : w === 700 ? "Bold" : "Heavy"}</option>`).join("")}
      </select>
      ${r.aligns ? `<select data-f="align" style="${cell}" aria-label="How ${pdfEsc(r.label)} line up in their cell">
        ${[["left", "Left"], ["centre", "Centre"], ["right", "Right"]].map(([k, lbl]) => `<option value="${k}"${(v.align || "left") === k ? " selected" : ""}>${lbl}</option>`).join("")}
      </select>` : ""}
      ${r.sized
        ? `<input type="number" data-f="size" min="1" max="20" step="0.1" value="${v.size != null ? v.size : ""}" style="${cell}" aria-label="Size in millimetres for ${pdfEsc(r.label)}" />`
        : `<span style="font-size: var(--font-xs); color: var(--ink-soft);">fitted</span>`}
      ${r.fills ? `<span class="pdf-type-colour">
        <select data-f="fillmode" style="${cell}" aria-label="The panel behind ${pdfEsc(r.label)}">
          <option value="auto"${(v.fill || "auto") === "auto" ? " selected" : ""}>Panel: auto</option>
          <option value="none"${v.fill === "none" ? " selected" : ""}>No fill</option>
          <option value="custom"${v.fill && v.fill !== "auto" && v.fill !== "none" ? " selected" : ""}>Panel: pick</option>
        </select>
        <input type="color" data-f="fill" value="${pdfEsc(v.fill && v.fill !== "auto" && v.fill !== "none" ? v.fill : "#ffffff")}"${(!v.fill || v.fill === "auto" || v.fill === "none") ? " disabled" : ""} style="width: 34px; height: 30px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: none; cursor: pointer;" aria-label="Panel colour behind ${pdfEsc(r.label)}" />
      </span>` : ""}
      <span class="pdf-type-colour">
        <input type="color" data-f="color" value="${pdfEsc(isAuto ? "#000000" : (v.color || "#000000"))}" ${isAuto ? "disabled" : ""} style="width: 34px; height: 30px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: none; cursor: pointer;" aria-label="Colour for ${pdfEsc(r.label)}" />
        ${r.adaptive ? `<label style="font-size: var(--font-xs); color: var(--ink-soft); display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;" title="On the cover this line sits over a photograph, so the PDF picks a colour that stays readable."><input type="checkbox" data-f="auto"${isAuto ? " checked" : ""} /> auto</label>` : ""}
      </span>
    </div>`;
  }).join("");
  // The panel's own swatch is only live when the studio picks a colour.
  host.querySelectorAll('select[data-f="fillmode"]').forEach((sel) => {
    sel.addEventListener("change", () => {
      const sw = sel.closest(".pdf-type-row").querySelector('input[data-f="fill"]');
      if (sw) sw.disabled = sel.value !== "custom";
    });
  });
  host.querySelectorAll('input[data-f="auto"]').forEach((box) => {
    box.addEventListener("change", () => {
      const swatch = box.closest(".pdf-type-row").querySelector('input[data-f="color"]');
      if (swatch) swatch.disabled = box.checked;
    });
  });
};

/* A frame just inside the edge of every page. Off by default — the pages are
   designed to run to the paper — so this row sits apart from the type rows. */
window.renderPdfBorderEditor = function(host) {
  host = host || document.getElementById("pdfBorderRow");
  if (!host) return;
  const b = (window.getPortfolioPdfSettings() || {}).border || window.DEFAULT_PDF_BORDER || {};
  const cell = "padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink); font-size: var(--font-xs); font-family: inherit;";
  host.innerHTML = `
    <div style="min-width: 0;">
      <strong style="font-size: var(--font-xs); color: var(--ink);">A border round the page</strong>
      <span style="display: block; font-size: var(--font-xs); color: var(--ink-soft);">Thickness and how far in, in millimetres</span>
    </div>
    <label style="font-size: var(--font-xs); color: var(--ink); display: inline-flex; align-items: center; gap: 6px;">
      <input type="checkbox" id="pdfBorderOn"${b.on ? " checked" : ""} /> Draw it
    </label>
    <input type="number" id="pdfBorderWidth" min="0.1" max="4" step="0.1" value="${b.width}" style="${cell}" aria-label="Border thickness in millimetres" />
    <input type="number" id="pdfBorderInset" min="0" max="20" step="0.5" value="${b.inset}" style="${cell}" aria-label="How far in from the edge, in millimetres" />
    <input type="color" id="pdfBorderColor" value="${pdfEsc(b.color || "#141416")}" style="width: 34px; height: 30px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: none; cursor: pointer;" aria-label="Border colour" />`;
};

window.readPdfBorderEditor = function(host) {
  host = host || document.getElementById("pdfBorderRow");
  const on = host && host.querySelector("#pdfBorderOn");
  if (!on) return null;
  const num = (id, fallback) => { const el = host.querySelector("#" + id); const n = el ? Number(el.value) : NaN; return Number.isFinite(n) ? n : fallback; };
  const d = window.DEFAULT_PDF_BORDER || { width: 0.5, inset: 6, color: "#141416" };
  return {
    on: on.checked,
    width: num("pdfBorderWidth", d.width),
    inset: num("pdfBorderInset", d.inset),
    color: (host.querySelector("#pdfBorderColor") || {}).value || d.color
  };
};

// What the rows currently say, in the shape getPortfolioPdfSettings stores.
window.readPdfTypeEditor = function(host) {
  host = host || document.getElementById("pdfTypeRows");
  if (!host || !host.children.length) return null;
  const out = {};
  host.querySelectorAll(".pdf-type-row").forEach((row) => {
    const get = (f) => row.querySelector(`[data-f="${f}"]`);
    const auto = get("auto");
    const size = get("size");
    const t = {
      family: get("family") ? get("family").value : undefined,
      weight: get("weight") ? Number(get("weight").value) : undefined,
      color: auto && auto.checked ? "auto" : (get("color") ? get("color").value : undefined)
    };
    if (size && size.value.trim() !== "") t.size = Number(size.value);
    const align = get("align");
    if (align) t.align = align.value;
    const mode = get("fillmode");
    if (mode) t.fill = mode.value === "custom" ? (get("fill") ? get("fill").value : "#ffffff") : mode.value;
    out[row.dataset.role] = t;
  });
  return out;
};

window.saveNewPromoCodeFromForm = function() {
  const name = (document.getElementById("newPromoName")?.value || "").trim().toUpperCase();
  const type = document.getElementById("newPromoType")?.value === "flat" ? "flat" : "pct";
  const val = Math.round(Number(document.getElementById("newPromoVal")?.value));
  const desc = (document.getElementById("newPromoDesc")?.value || "").trim();
  const hsType = document.getElementById("newPromoHomeStudioType")?.value || "none";

  if (!/^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(name)) {
    alert("Enter a promo code of 2–24 letters, numbers, dashes or underscores (e.g. SUMMER30).");
    return;
  }
  // A code that exists only to compensate the home studio rental has nothing
  // to say here, so a package value of 0 is allowed — but only when the home
  // studio discount below actually does something, or the code would be a
  // pure no-op that saves the client nothing at all.
  if (!Number.isFinite(val) || val < 0 || (type === "pct" && val > 100)) {
    alert(type === "pct" ? "Percentage must be between 0 and 100." : "Flat discount must be ₹0 or more.");
    return;
  }
  if (val === 0 && hsType === "none") {
    alert("This code would do nothing — enter a package discount above 0, or set a Home Studio Rental Discount below.");
    return;
  }
  // Read before anything below touches the draft: a refused date must leave
  // the list exactly as it was, including the old name of a code being renamed.
  const dates = window.readCodeDatesFields("newPromo");
  if (!dates) return;

  const codes = window.getAdminPromoCodes();
  const editing = window._editingPromoKey;
  if (!editing && codes[name] && !confirm(`Promo code '${name}' already exists. Overwrite it?`)) return;

  const label = desc ||
    (val === 0
      ? `Home Studio Discount Only (${name})`
      : (type === "flat" ? `Flat ₹${val.toLocaleString("en-IN")} Off (${name})` : `${val}% Off (${name})`));
  // Per-code choice: does this discount also come off add-ons (the home studio
  // rental), or only the package rate? Off by default, so a rental the studio
  // actually pays for is never discounted unless that is the intent.
  const includeAddons = !!document.getElementById("newPromoIncludeAddons")?.checked;
  // Independent of includeAddons above: this is a dedicated discount on the
  // home studio rental itself (free / flat ₹ / %), separate from whatever the
  // code takes off the package rate.
  let homeStudioDiscount = { type: "none" };
  if (hsType === "free") {
    homeStudioDiscount = { type: "free" };
  } else if (hsType === "flat" || hsType === "pct" || hsType === "fixed") {
    const hsVal = Math.round(Number(document.getElementById("newPromoHomeStudioVal")?.value));
    // A fixed price of zero is meaningful — the room is free — so only the two
    // discount types have to be above zero.
    const bad = !Number.isFinite(hsVal) || hsVal < 0
      || (hsType !== "fixed" && hsVal <= 0)
      || (hsType === "pct" && hsVal > 100);
    if (bad) {
      alert(hsType === "pct" ? "Home studio % off must be between 1 and 100."
        : hsType === "fixed" ? "Enter what the client should pay for the home studio, in rupees (0 or more)."
        : "Home studio flat discount must be a positive amount in rupees.");
      return;
    }
    homeStudioDiscount = { type: hsType, value: hsVal };
  }
  const active = document.getElementById("newPromoActive") ? !!document.getElementById("newPromoActive").checked : true;
  // Written only when set, so a code with no dates stays the shape it was.
  const dateFields = { ...(dates.startDate ? { startDate: dates.startDate } : {}), ...(dates.endDate ? { endDate: dates.endDate } : {}) };
  // Renamed while editing. Done here, after every check above has passed: it
  // used to run first, so a rename refused for a bad home studio value had
  // already dropped the old code from the draft.
  if (editing && editing !== name) delete codes[editing];
  codes[name] = type === "flat"
    ? { flat: val, label, includeAddons, homeStudioDiscount, active, ...dateFields }
    : { pct: val, label, includeAddons, homeStudioDiscount, active, ...dateFields };
  window.adminDraftPromoCodes = { ...codes };
  window._editingPromoKey = null;

  window.persistAdminPromoCodes();
  markCodesUnpublished();
  if (typeof toast === "function") toast(`🎟️ Promo code '${name}' ${editing ? "updated" : "added"}. Press "Save & push live" at the top of Promo codes to make it live.`);
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
};

// Shows the value input only for the two discount types that need a number —
// "free" and "none" have nothing to type in.
window.togglePromoHomeStudioValField = function() {
  const typeEl = document.getElementById("newPromoHomeStudioType");
  const valEl = document.getElementById("newPromoHomeStudioVal");
  if (!typeEl || !valEl) return;
  const needsVal = typeEl.value === "flat" || typeEl.value === "pct" || typeEl.value === "fixed";
  valEl.style.display = needsVal ? "" : "none";
  valEl.placeholder = typeEl.value === "pct" ? "e.g. 10"
    : typeEl.value === "fixed" ? "client pays e.g. 1500"
    : "e.g. 500";
};

// Same idea as togglePromoHomeStudioValField, for the invite code form's
// own home studio discount widget.
window.toggleInviteHomeStudioValField = function() {
  const typeEl = document.getElementById("newInviteHomeStudioType");
  const valEl = document.getElementById("newInviteHomeStudioVal");
  if (!typeEl || !valEl) return;
  const needsVal = typeEl.value === "flat" || typeEl.value === "pct";
  valEl.style.display = needsVal ? "" : "none";
  valEl.placeholder = typeEl.value === "pct" ? "e.g. 10" : "e.g. 500";
};


/* ---- invite CRUD ---- */

// Write the invite-code list straight to storage. A button labelled "Save
// Invite Code" that only updates an in-memory draft, and needs a second,
// separate "Save & Push Live" click elsewhere on the page to actually persist,
// loses the code on any reload or navigation — which read as "new invites don't
// save". Adding and deleting now persist on the spot. Returns false when
// storage refuses (private browsing, quota), so callers can say so honestly
// instead of claiming a save that did not happen.
window.persistAdminInviteCodes = function() {
  try {
    if (!Array.isArray(window.adminDraftInviteCodes)) return false;
    localStorage.setItem("wps_custom_invite_codes", JSON.stringify(window.adminDraftInviteCodes));
    stampSetting("wps_custom_invite_codes");
    return true;
  } catch (e) {
    return false;
  }
};

window.addNewAdminInviteCode = function() {
  window.openInviteCodeModal();
};

window.editAdminInviteCode = function(targetCodeStr) {
  window.openInviteCodeModal(targetCodeStr);
};

// The same switch a promo code has: off keeps the code and everything set on
// it, and anyone typing it is told it is not recognised. Stored the way
// getAdminInviteCodes keeps it — `active: false` when off, nothing when on.
window.toggleAdminInviteActive = function(codeStr) {
  const list = window.getAdminInviteCodes();
  const target = (codeStr || "").trim().toUpperCase();
  const idx = list.findIndex(x => x.code === target);
  if (idx === -1) return;
  const nowOn = list[idx].active === false;
  const { active, ...rest } = list[idx];
  list[idx] = nowOn ? rest : { ...rest, active: false };
  window.adminDraftInviteCodes = [...list];
  window.persistAdminInviteCodes();
  // Stored on this device either way; clients only see it once it is pushed.
  markCodesUnpublished();
  if (typeof toast === "function") toast(`🔑 '${target}' ${nowOn ? "switched on" : "switched off"}. Press "Save & push live" at the top of Invite codes to make it live.`);
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
};

window.generateRandomAdminInviteCode = function() {
  const prefixes = ["VIP", "NERDY", "MODEL", "STUDIO", "TALENT", "SHOOT"];
  const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const generated = `${randomPrefix}-${randomNum}`;
  window.openInviteCodeModal(generated);
};

window.deleteAdminInviteCode = function(codeToDelete) {
  const current = window.getAdminInviteCodes();
  if (current.length <= 1) {
    alert("You must keep at least 1 active invite code!");
    return;
  }
  const getItemCodeStr = (item) => (typeof item === "object" ? (item.code || "") : String(item)).trim().toUpperCase();
  const targetUpper = (codeToDelete || "").trim().toUpperCase();
  
  if (confirm(`Remove invite code '${targetUpper}' from draft?`)) {
    const updated = current.filter(x => getItemCodeStr(x) !== targetUpper);
    window.adminDraftInviteCodes = [...updated];
    const persisted = window.persistAdminInviteCodes();
    // Deleted here, still live for clients until it is pushed — same as a save.
    markCodesUnpublished();
    if (typeof toast === "function") {
      toast(persisted
        ? `🗑️ Invite code '${targetUpper}' deleted. Press "Save & push live" at the top of Invite codes to make it live.`
        : `⚠️ '${targetUpper}' removed but not stored on this device — click "Save & Push Live".`);
    }
    if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
  }
};

// Opens the inline invite-code creator form. A code already on the list →
// edit mode; a fresh value (e.g. from the random generator) prefills the
// form as a new code; no argument → blank "add" form.
window.openInviteCodeModal = function(codeStr) {
  const form = document.getElementById("inviteCreatorForm");
  if (!form) { alert("Open the Calendar admin page to manage invite codes."); return; }
  const list = window.getAdminInviteCodes();
  const target = (codeStr || "").trim().toUpperCase();
  const existing = target ? list.find(x => x.code === target) : null;
  window._editingInviteCode = existing ? existing.code : null;

  const title = document.getElementById("inviteCreatorFormTitle");
  const codeEl = document.getElementById("newInviteCode");
  const descEl = document.getElementById("newInviteDesc");
  const locationEl = document.getElementById("newInviteLocation");
  if (title) title.textContent = existing ? `✏️ Edit Invite Code — ${existing.code}` : "🔑 Add New Invite Code";
  if (codeEl) codeEl.value = existing ? existing.code : target;
  if (descEl) descEl.value = existing ? (existing.desc || "") : "";
  if (locationEl) locationEl.value = existing ? (existing.location || "") : "";
  // Blank cost box means complimentary, which is what most invites are.
  const costEl = document.getElementById("newInviteVenueCost");
  if (costEl) costEl.value = (existing && existing.venueCost !== null && existing.venueCost !== undefined) ? String(existing.venueCost) : "";
  const hsTypeEl = document.getElementById("newInviteHomeStudioType");
  const hsValEl = document.getElementById("newInviteHomeStudioVal");
  const hsDiscount = window.getPromoHomeStudioDiscount(existing);
  if (hsTypeEl) hsTypeEl.value = hsDiscount.type;
  if (hsValEl) hsValEl.value = (hsDiscount.type === "flat" || hsDiscount.type === "pct") ? (hsDiscount.value || "") : "";
  // Without this, reopening a switched-off code to fix a typo would quietly
  // switch it back on.
  const activeEl = document.getElementById("newInviteActive");
  if (activeEl) activeEl.checked = existing ? existing.active !== false : true;
  window.fillCodeDatesFields("newInvite", existing);
  if (typeof window.toggleInviteHomeStudioValField === "function") window.toggleInviteHomeStudioValField();
  if (typeof window.syncInviteWaiveVisibility === "function") window.syncInviteWaiveVisibility();

  form.style.display = "block";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  if (codeEl) codeEl.focus();
};

// The cost box only applies to a code that supplies its own venue. With no
// address the talent picks, and the studio's standard home studio rate governs
// instead — so the box is swapped for a line saying exactly that.
window.syncInviteWaiveVisibility = function() {
  const hasVenue = !!(document.getElementById("newInviteLocation")?.value || "").trim();
  const row = document.getElementById("newInviteWaiveRow");
  const note = document.getElementById("newInviteVenueNote");
  if (row) row.style.display = hasVenue ? "" : "none";
  if (note) note.style.display = hasVenue ? "none" : "block";
};

window.saveInviteCodeFromForm = function() {
  const code = (document.getElementById("newInviteCode")?.value || "").trim().toUpperCase();
  const desc = (document.getElementById("newInviteDesc")?.value || "").trim() || "Photographer direct unlock code";
  const location = (document.getElementById("newInviteLocation")?.value || "").trim();
  // Only a code that supplies a venue carries a venue cost; without one the
  // standard home studio rate applies and this field is not even shown.
  const costRaw = (document.getElementById("newInviteVenueCost")?.value || "").trim();
  let venueCost = null;
  if (location && costRaw !== "") {
    const n = parseInt(costRaw, 10);
    if (isNaN(n) || n < 0) {
      alert("Venue cost must be a whole number in ₹ (or leave it blank if the venue is free).");
      return;
    }
    venueCost = n;
  }

  if (!/^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(code)) {
    alert("Enter an invite code of 2–24 letters, numbers, dashes or underscores (e.g. VIP-2431).");
    return;
  }

  // Same shape as a promo code's home studio discount, and validated the
  // same way — a code that can never resolve to a real deduction is refused
  // up front rather than silently saved as a no-op.
  const hsType = document.getElementById("newInviteHomeStudioType")?.value || "none";
  let homeStudioDiscount = { type: "none" };
  if (hsType === "free") {
    homeStudioDiscount = { type: "free" };
  } else if (hsType === "flat" || hsType === "pct") {
    const hsVal = Math.round(Number(document.getElementById("newInviteHomeStudioVal")?.value));
    if (!Number.isFinite(hsVal) || hsVal <= 0 || (hsType === "pct" && hsVal > 100)) {
      alert(hsType === "pct" ? "Home studio % off must be between 1 and 100." : "Home studio flat discount must be a positive amount in ₹.");
      return;
    }
    homeStudioDiscount = { type: hsType, value: hsVal };
  }

  const dates = window.readCodeDatesFields("newInvite");
  if (!dates) return;
  const isOn = document.getElementById("newInviteActive") ? !!document.getElementById("newInviteActive").checked : true;

  const list = window.getAdminInviteCodes();
  const editing = window._editingInviteCode;
  if (list.some(x => x.code === code && x.code !== editing)) {
    alert(`Invite code '${code}' already exists.`);
    return;
  }

  const entry = {
    code, desc, location, venueCost, homeStudioDiscount,
    ...(isOn ? {} : { active: false }),
    ...(dates.startDate ? { startDate: dates.startDate } : {}),
    ...(dates.endDate ? { endDate: dates.endDate } : {})
  };
  if (editing) {
    const idx = list.findIndex(x => x.code === editing);
    if (idx !== -1) list[idx] = entry;
    else list.push(entry);
  } else {
    list.push(entry);
  }
  window.adminDraftInviteCodes = [...list];
  window._editingInviteCode = null;

  const persisted = window.persistAdminInviteCodes();
  // Kept on this device straight away, but a client's browser reads the
  // published list — so the badge asks for the push either way. Saying only
  // "saved" here is how an end date could sit unpublished while the code
  // carried on working for everyone.
  markCodesUnpublished();
  if (typeof toast === "function") {
    toast(persisted
      ? `🔑 Invite code '${code}' ${editing ? "updated" : "saved"}. Press "Save & push live" at the top of Invite codes to make it live.`
      : `⚠️ '${code}' ${editing ? "updated" : "added"} but could not be stored on this device — click "Save & Push Live".`);
  }
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
};


/* ---- studio-book storage schema ---- */
// The studio portfolio book (book-builder.js): every saved version, published
// with the albums so it opens on any device and survives a cleared browser.
// Shape: { versions: [ { id, name, style, colourway, orientation, title,
// subtitle, cover, pages, texts, updatedAt } ], deleted: [ids] }.
//
// Merged PER BOOK by updatedAt, never "this device's copy wins": a phone that
// last opened the builder a month ago must not overwrite the book edited on
// the laptop since. A deleted book is remembered by id so an old copy
// elsewhere cannot bring it back — the same lesson as album tombstones.
const STUDIO_BOOK_STYLES = ["elegant", "modern", "vogue", "lookbook", "noir", "swiss", "pinboard", "dossier", "poster", "atelier", "gazette"];
// The seven added after Lookbook. A release that doesn't know one turns the
// book back into Modern, so a book in one carries schema mark 5.
const STUDIO_BOOK_NEWER_STYLES = ["noir", "swiss", "pinboard", "dossier", "poster", "atelier", "gazette"];
// versions/tombstones are generous on purpose: a cap that trimmed a list would
// silently delete the book or the deletion it cut. The builder refuses a new
// book at `versions` rather than letting the clean-up drop one.
const STUDIO_BOOK_LIMITS = {
  versions: 200, pages: 30, text: 1200, deleted: 2000,
  pageTypes: ["photos", "spread", "about", "services", "contact", "divider", "story", "note", "quote", "letter", "feature", "article", "ways", "process", "free", "end", "look"],
  // The cover's layout: absent means the style's own; "custom" is a cover
  // arranged like an Anything page (book.coverPage). The end page is the
  // book's back cover or a closing page; its three lines are 40 characters.
  coverLayouts: ["photo", "framed", "poster", "custom"],
  endLayouts: ["back", "closing"],
  endLine: 40,
  // A look (a lookbook page): up to four lines under its name, 60 characters each.
  lookLines: 4,
  lookLine: 60,
  fits: ["fill", "whole", "width", "height"],
  // Paper a book prints on; absent means A4. Where a writing page's photo sits;
  // absent means the page shape's usual place.
  papers: ["a4", "b5", "a5", "letter"],
  photoAt: { story: ["top", "bottom", "left", "right"], note: ["top", "bottom", "left", "right"], quote: ["top", "bottom", "left", "right"], feature: ["left", "right"], article: ["left", "right"] },
  // Bands round a full-page photo (absent = the style's usual foot band).
  borders: ["none", "top", "bottom", "left", "right", "all"],
  borderWidths: ["narrow", "broad"],
  // Per-text formatting on writing pages and captions: an open-source font,
  // a colour (a book colour or #rrggbb) and an alignment. Absent = the style's.
  fonts: ["fraunces", "archivo", "inter", "outfit", "playfair", "cormorant", "baskerville", "bodoni", "dmserif", "sourcesans", "jost", "manrope", "spacegrotesk", "oswald", "plexmono"],
  colors: ["ink", "soft", "accent", "paper", "white", "deep"],
  // A paragraph (or a whole flowing text) can be a list, and can run in two
  // or three columns. A photos page with four to six photographs can put
  // three of them in one row, on top or at the bottom.
  lists: ["bullet", "number"],
  columns: [2, 3],
  photoRows: ["3top", "3bottom"],
  aligns: ["left", "center", "right", "justify"],
  // A flowing text (a story, a letter, the words about a photo, About the
  // studio) can format each paragraph on its own; this many at most.
  paras: 60,
  // Lines a contact page can leave off.
  contactRows: ["email", "whatsapp", "instagram", "website", "book", "studio", "qr"],
  // Texts that can be formatted outside the writing pages: the cover's own two
  // lines (stored on the book as coverStyle), a chapter page and About.
  formatFields: { cover: ["title", "subtitle"], divider: ["heading", "line"], about: ["about"], ways: ["kicker", "heading", "intro"], process: ["kicker", "heading", "intro", "note"] },
  // The two "how we work" pages: four ways side by side, or one way step by
  // step. Their rows are lists, so they have their own caps.
  leads: ["you", "together", "studio"],
  workWays: ["execute", "pitch", "lead", "test"],
  // A watermark across every page of a sample: the words, and how strong.
  markStrengths: ["light", "medium", "strong"],
  /* An "Anything page": things the studio places itself. Every position and
     size is a fraction of the A4 design frame, so the page prints the same on
     any paper and in either shape. A little outside 0-1 is allowed, so a
     photograph can run off the edge. */
  blockKinds: ["text", "photo", "shape", "line"],
  blockRoles: ["head", "intro", "body", "kicker", "quote"],
  blockMax: 12, blockPhotoMax: 6, blockText: 600,
  thicks: ["hair", "narrow", "medium", "broad", "heavy"],
  // A line: how it runs ("h", across, writes nothing), its arrowheads, and
  // what it is drawn with ("pen" writes nothing). A line drawn by hand keeps
  // up to 200 points, each a fraction of its own box.
  linePaths: ["v", "d", "u", "curve", "wave", "free"],
  lineEnds: ["end", "start", "both"],
  lineTips: ["pencil", "brush", "marker", "nib", "taper", "sumi", "bristle"],
  linePoints: 200,
  shapes: ["round", "chamfer", "ellipse", "triangle", "diamond", "star", "parallelogram"],   // a plain box writes nothing
  cornerMax: 0.5,   // corners: a share of the shorter side, 0 to this; the old words small/medium/large still read
  fills: ["ink", "soft", "accent", "paper", "white", "deep", "rule"],
  /* How new the shapes in a book are. A book is marked with the highest one
     it needs, and the mark is never taken off, so a browser tab running an
     older release — which would quietly drop a page kind it doesn't know —
     shows up in CI as a book whose mark went backwards, whatever its
     updatedAt says. 1 = Anything pages; 2 = a cover layout or an end page;
     3 = a look; 4 = the Lookbook style; 5 = one of the seven styles after it. */
  schema: 5,
  // Every style a book can be in; the builder refuses to run under a release that lacks one.
  styles: STUDIO_BOOK_STYLES,
  // The cover's own lines. Empty means "as the style has always drawn it".
  coverText: { label: 32, mast: 18, tagline: 24, foot: 40, place: 40 },
  coverLine: 24,          // one of the cover's inside lines, three a side
  // Lines the book draws for itself that can be written over: a page's small
  // label and heading, the credit under a photo, the closing line on What I
  // shoot, the words under the QR code, and the name in the running foot.
  pageText: { label: 32, heading: 60, note: 90, credit: 60, qrLabel: 24 },
  serviceItem: { kicker: 28, title: 40, blurb: 120 },
  contactRow: { label: 24, value: 60 },
  footText: 40,
  wayItem: { name: 56, forWho: 80, text: 150 },
  stepItem: { title: 36, text: 130 },
  // Writing pages: the most characters each field may hold. Each cap is what
  // the narrowest style and page shape can print, measured, so ordinary prose
  // at the cap never gets cut when the style or shape changes. book-builder.js
  // uses these as the inputs' maxlength, and validate-data.mjs holds the same
  // numbers (a test compares them).
  fields: {
    story: { kicker: 32, headline: 52, intro: 150, body: 700 },
    note: { title: 40, note: 300, detail: 90 },
    quote: { quote: 220, name: 40, role: 48 },
    letter: { kicker: 32, heading: 52, body: 1100, signName: 40, signLine: 48 },
    feature: { kicker: 32, headline: 52, sub1: 40, text1: 360, sub2: 40, text2: 360 },
    article: { kicker: 32, headline: 52, intro: 150, body: 1400, caption: 90 },
    ways: { kicker: 32, heading: 52, intro: 160 },
    process: { kicker: 32, heading: 52, intro: 160, note: 120 },
    photos: { caption: 90 },
    end: { text: 160, note: 60 },
    look: { title: 40 }
  }
};
// One text's formatting: an open-source font, a colour, an alignment, a size,
// a weight and italic. Anything else, or a value the app doesn't know, goes.
function cleanOneFormat(f) {
  if (!f || typeof f !== "object") return null;
  const one = {};
  if (STUDIO_BOOK_LIMITS.fonts.includes(f.font)) one.font = f.font;
  if (STUDIO_BOOK_LIMITS.colors.includes(f.color) || /^#[0-9a-f]{6}$/i.test(String(f.color || ""))) one.color = String(f.color).toLowerCase();
  if (STUDIO_BOOK_LIMITS.aligns.includes(f.align)) one.align = f.align;
  if (typeof f.size === "number" && isFinite(f.size) && Math.abs(f.size - 1) > 0.001) one.size = Math.round(Math.min(1.6, Math.max(0.6, f.size)) * 100) / 100;
  if (["light", "regular", "bold"].includes(f.weight)) one.weight = f.weight;
  if (f.italic === true) one.italic = true;
  if (STUDIO_BOOK_LIMITS.lists.includes(f.list)) one.list = f.list;
  if (STUDIO_BOOK_LIMITS.columns.includes(f.columns)) one.columns = f.columns;
  return Object.keys(one).length ? one : null;
}
// One text's formatting, and each of its paragraphs.
function cleanFormatDeep(f) {
  const one = cleanOneFormat(f) || {};
  const paras = {};
  if (f && f.paras && typeof f.paras === "object" && !Array.isArray(f.paras)) {
    for (const [at, p] of Object.entries(f.paras)) {
      if (!/^[1-9][0-9]{0,2}$/.test(at) || Number(at) > STUDIO_BOOK_LIMITS.paras) continue;
      const c = cleanOneFormat(p);
      if (c) paras[at] = c;
    }
  }
  if (Object.keys(paras).length) one.paras = paras;
  return Object.keys(one).length ? one : null;
}
function cleanBookFormatting(from, allowed) {
  if (!from || typeof from !== "object") return null;
  const style = {};
  for (const [k, f] of Object.entries(from)) {
    if (!allowed.includes(k) || !f || typeof f !== "object") continue;
    // A flowing text can also format each of its paragraphs, numbered from 1.
    const one = cleanFormatDeep(f);
    if (one) style[k] = one;
  }
  return Object.keys(style).length ? style : null;
}
function cleanStudioPortfolios(o) {
  if (!o || typeof o !== "object" || !Array.isArray(o.versions)) return null;
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  // Words are sliced by UTF-16 unit, so an emoji at the limit could be cut in
  // half; a lone leading surrogate left at the end is dropped.
  const strU = (v, max) => str(v, max).replace(/[\uD800-\uDBFF]$/, "");
  const num = (v, lo, hi, d) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  // `fit` (how a photo meets its box) is written only when chosen, so books
  // saved before it existed store exactly as they did.
  const shot = (x) => {
    if (!(x && typeof x === "object" && typeof x.id === "string" && x.id)) return null;
    const out = { id: x.id.slice(0, 120), x: num(x.x, 0, 1, 0.5), y: num(x.y, 0, 1, 0.35), zoom: num(x.zoom, 1, 3, 1) };
    if (STUDIO_BOOK_LIMITS.fits.includes(x.fit)) out.fit = x.fit;
    // Opacity is kept only when the photo is faded; fully visible is the default.
    if (typeof x.opacity === "number" && isFinite(x.opacity) && x.opacity < 1) out.opacity = Math.round(num(x.opacity, 0.1, 1, 1) * 100) / 100;
    return out;
  };
  const PAGE_TYPES = STUDIO_BOOK_LIMITS.pageTypes;
  const FIELDS = STUDIO_BOOK_LIMITS.fields;
  // The things placed on an Anything page (or a cover from scratch), in the
  // order they are drawn — the last one is on top. Each is rebuilt from a
  // whitelist, and every number is clamped and rounded, so nothing hand-edited
  // can put a block far off the paper or a text past its cap.
  const cleanBlocks = (list) => {
    const L2 = STUDIO_BOOK_LIMITS;
    const frac = (v, lo, hi, d) => Math.round(num(v, lo, hi, d) * 10000) / 10000;
    let photos = 0;
    return (Array.isArray(list) ? list : []).map((x) => {
      if (!x || typeof x !== "object" || !L2.blockKinds.includes(x.k)) return null;
      if (x.k === "photo" && ++photos > L2.blockPhotoMax) return null;
      const one = { k: x.k, x: frac(x.x, -0.3, 1.3, 0), y: frac(x.y, -0.3, 1.3, 0), w: frac(x.w, 0.01, 1.6, 0.3) };
      if (x.k !== "line" || (L2.linePaths.includes(x.path) && x.path !== "h")) one.h = frac(x.h, 0.01, 1.6, 0.2);
      const turn = Math.round(num(x.r, -180, 180, 0) * 10) / 10;
      if (turn) one.r = turn;
      if (x.k === "text") {
        one.t = strU(x.t, L2.blockText);
        if (L2.blockRoles.includes(x.role)) one.role = x.role;
        if (x.fit === "cut") one.fit = "cut";
        const st = cleanFormatDeep(x.style);
        if (st) one.style = st;
      }
      if (x.k === "photo") {
        const p2 = shot(x.p);
        if (p2) one.p = p2;
        if (L2.fills.includes(x.edge)) one.edge = x.edge;
        if (L2.thicks.includes(x.edgeWidth)) one.edgeWidth = x.edgeWidth;
      }
      if (x.k === "text" && (L2.fills.includes(x.fill) || /^#[0-9a-f]{6}$/i.test(String(x.fill || "")))) {
        // A shape with words in it.
        one.fill = String(x.fill).toLowerCase();
        if (typeof x.o === "number" && isFinite(x.o) && x.o < 1) one.o = Math.round(num(x.o, 0.05, 1, 1) * 100) / 100;
      }
      if ((x.k === "shape" || x.k === "text" || x.k === "photo") && L2.shapes.includes(x.shape)) one.shape = x.shape;
      if (x.k === "shape" || x.k === "text" || x.k === "photo") {
        // Corners as a number; the old words still mean what they did.
        const legacy = { small: 0.1, medium: 0.18, large: 0.3 };
        const c = typeof x.corner === "number" && isFinite(x.corner) ? x.corner : legacy[x.corner];
        if (typeof c === "number") one.corner = Math.round(num(c, 0, L2.cornerMax, 0) * 100) / 100;
      }
      if (x.k === "shape" || x.k === "line") {
        const key = x.k === "shape" ? "fill" : "color";
        if (L2.fills.includes(x[key]) || /^#[0-9a-f]{6}$/i.test(String(x[key] || ""))) one[key] = String(x[key]).toLowerCase();
        if (typeof x.o === "number" && isFinite(x.o) && x.o < 1) one.o = Math.round(num(x.o, 0.05, 1, 1) * 100) / 100;
        if (x.k === "line" && L2.thicks.includes(x.thick)) one.thick = x.thick;
        // An exact width, in millimetres, from a fifth of one to twelve.
        if (x.k === "line" && typeof x.width === "number" && isFinite(x.width)) one.width = Math.round(num(x.width, 0.2, 12, 0.8) * 10) / 10;
        if (x.k === "line") {
          if (L2.linePaths.includes(x.path)) one.path = x.path;
          if (L2.lineEnds.includes(x.ends)) one.ends = x.ends;
          if (L2.lineTips.includes(x.tip)) one.tip = x.tip;
          if ((one.path === "curve" || one.path === "wave") && typeof x.bend === "number" && isFinite(x.bend)) { const bd = Math.round(num(x.bend, -1, 1, 0.5) * 100) / 100; if (Math.abs(bd - 0.5) > 0.001) one.bend = bd; }
          // A wavy line: how many waves (one writes nothing), and how rounded (fully rounded writes nothing).
          if (one.path === "wave" && typeof x.waves === "number" && isFinite(x.waves)) { const n = Math.round(num(x.waves, 1, 8, 1)); if (n > 1) one.waves = n; }
          if (one.path === "wave" && typeof x.soft === "number" && isFinite(x.soft)) { const sv = Math.round(num(x.soft, 0, 1, 1) * 100) / 100; if (sv < 0.999) one.soft = sv; }
          if (one.path === "free") {
            const pts = (Array.isArray(x.pts) ? x.pts : []).filter((q) => Array.isArray(q) && q.length === 2 && typeof q[0] === "number" && typeof q[1] === "number").slice(0, L2.linePoints).map((q) => [Math.round(num(q[0], 0, 1, 0) * 1000) / 1000, Math.round(num(q[1], 0, 1, 0) * 1000) / 1000]);
            if (pts.length >= 2) one.pts = pts; else delete one.path;
          }
        }
      }
      return one;
    }).filter(Boolean).slice(0, L2.blockMax);
  };
  const versions = o.versions.slice(0, STUDIO_BOOK_LIMITS.versions).map((v) => {
    if (!v || typeof v !== "object" || typeof v.id !== "string" || !v.id) return null;
    const pages = (Array.isArray(v.pages) ? v.pages : []).slice(0, STUDIO_BOOK_LIMITS.pages).map((pg) => {
      if (!pg || !PAGE_TYPES.includes(pg.type)) return null;
      const out = { type: pg.type };
      if (pg.type === "photos") {
        out.photos = (Array.isArray(pg.photos) ? pg.photos : []).map(shot).filter(Boolean).slice(0, 6);
        // Written only when there is one, so every book saved before captions
        // existed stores exactly as it did.
        const caption = strU(pg.caption, FIELDS.photos.caption);
        if (caption) out.caption = caption;
        if (STUDIO_BOOK_LIMITS.photoRows.includes(pg.rows)) out.rows = pg.rows;
      }
      if (pg.type === "spread" || pg.type === "article") out.photos = (Array.isArray(pg.photos) ? pg.photos : []).map(shot).filter(Boolean).slice(0, 1);
      if (pg.type === "photos" || pg.type === "spread" || pg.type === "article") {
        if (STUDIO_BOOK_LIMITS.borders.includes(pg.border)) out.border = pg.border;
        if (STUDIO_BOOK_LIMITS.borderWidths.includes(pg.borderWidth)) out.borderWidth = pg.borderWidth;
      }
      if (pg.type === "divider") { out.heading = str(pg.heading, 60); out.line = str(pg.line, 160); }
      // An Anything page: the things the studio placed, in the order they are
      // drawn — the last one is on top. Each is rebuilt from a whitelist, and
      // every number is clamped and rounded, so nothing hand-edited can put a
      // block far off the paper or a text past its cap.
      // Any page can have its own colour behind everything; absent means the
      // book's, and failing that the style's.
      if (STUDIO_BOOK_LIMITS.fills.includes(pg.bg) || /^#[0-9a-f]{6}$/i.test(String(pg.bg || ""))) out.bg = String(pg.bg).toLowerCase();
      if (pg.type === "free") out.blocks = cleanBlocks(pg.blocks);
      if (pg.type === "look") {
        out.photos = (Array.isArray(pg.photos) ? pg.photos : []).map(shot).filter(Boolean).slice(0, 2);
        const lines = (Array.isArray(pg.lines) ? pg.lines : []).slice(0, STUDIO_BOOK_LIMITS.lookLines).map((x) => str(x, STUDIO_BOOK_LIMITS.lookLine));
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        if (lines.length) out.lines = lines;
      }
      if (pg.type === "end") {
        out.layout = STUDIO_BOOK_LIMITS.endLayouts.includes(pg.layout) ? pg.layout : "closing";
        if (out.layout === "closing") out.photos = (Array.isArray(pg.photos) ? pg.photos : []).map(shot).filter(Boolean).slice(0, 1);
        else {
          // The three lines under the name; empty means the studio's own.
          const lines = (Array.isArray(pg.lines) ? pg.lines : []).slice(0, 3).map((x) => str(x, STUDIO_BOOK_LIMITS.endLine));
          while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
          if (lines.length) out.lines = lines;
          if (pg.noLines === true) out.noLines = true;
        }
      }
      if (pg.type === "ways") {
        out.items = (Array.isArray(pg.items) ? pg.items : []).slice(0, 4).map((it) => {
          const one = { name: strU(it && it.name, STUDIO_BOOK_LIMITS.wayItem.name), forWho: strU(it && it.forWho, STUDIO_BOOK_LIMITS.wayItem.forWho), text: strU(it && it.text, STUDIO_BOOK_LIMITS.wayItem.text), lead: STUDIO_BOOK_LIMITS.leads.includes(it && it.lead) ? it.lead : "together" };
          if (it && it.liked === true) one.liked = true;
          return one;
        });
      }
      if (pg.type === "process") {
        if (STUDIO_BOOK_LIMITS.workWays.includes(pg.way)) out.way = pg.way;
        out.steps = (Array.isArray(pg.steps) ? pg.steps : []).slice(0, 6).map((st) => ({
          who: STUDIO_BOOK_LIMITS.leads.includes(st && st.who) ? st.who : "together",
          title: strU(st && st.title, STUDIO_BOOK_LIMITS.stepItem.title),
          text: strU(st && st.text, STUDIO_BOOK_LIMITS.stepItem.text)
        }));
      }
      if (pg.type === "contact" && Array.isArray(pg.hide)) {
        const hide = [...new Set(pg.hide.filter((k) => STUDIO_BOOK_LIMITS.contactRows.includes(k)))];
        if (hide.length) out.hide = hide;
      }
      // Every line a page draws for itself can be written over. Each is kept
      // only when it has been typed, so a book saved before this stores as it did.
      const PT = STUDIO_BOOK_LIMITS.pageText;
      const over = (k, max) => { const val = strU(pg[k], max); if (val.trim()) out[k] = val; };
      if (["about", "services", "contact"].includes(pg.type)) { over("label", PT.label); over("heading", PT.heading); }
      if (pg.type === "look") over("label", PT.label);
      if (pg.type === "services") {
        over("note", PT.note);
        if (pg.items && typeof pg.items === "object" && !Array.isArray(pg.items)) {
          const items = {};
          for (const [slug, o] of Object.entries(pg.items).slice(0, 20)) {
            if (typeof slug !== "string" || !slug || slug.length > 60 || !o || typeof o !== "object") continue;
            const one = {};
            for (const [k, max] of Object.entries(STUDIO_BOOK_LIMITS.serviceItem)) { const val = strU(o[k], max); if (val.trim()) one[k] = val; }
            if (Object.keys(one).length) items[slug] = one;
          }
          if (Object.keys(items).length) out.items = items;
        }
        if (Array.isArray(pg.hide)) {
          const hide = [...new Set(pg.hide.filter((k) => typeof k === "string" && k && k.length <= 60))].slice(0, 20);
          if (hide.length) out.hide = hide;
        }
      }
      if (pg.type === "contact") {
        over("qrLabel", PT.qrLabel);
        if (pg.rows && typeof pg.rows === "object" && !Array.isArray(pg.rows)) {
          const rows = {};
          for (const key of STUDIO_BOOK_LIMITS.contactRows) {
            const o = pg.rows[key];
            if (!o || typeof o !== "object") continue;
            const one = {};
            for (const [k, max] of Object.entries(STUDIO_BOOK_LIMITS.contactRow)) { const val = strU(o[k], max); if (val.trim()) one[k] = val; }
            if (Object.keys(one).length) rows[key] = one;
          }
          if (Object.keys(rows).length) out.rows = rows;
        }
      }
      if (["photos", "spread", "article", "story", "note", "quote", "feature", "look"].includes(pg.type)) over("credit", PT.credit);
      if (pg.type === "story" || pg.type === "note" || pg.type === "quote") out.photos = (Array.isArray(pg.photos) ? pg.photos : []).map(shot).filter(Boolean).slice(0, 1);
      if (pg.type === "feature") out.photos = (Array.isArray(pg.photos) ? pg.photos : []).map(shot).filter(Boolean).slice(0, 2);
      if ((STUDIO_BOOK_LIMITS.photoAt[pg.type] || []).includes(pg.photoAt)) out.photoAt = pg.photoAt;
      // Stored exactly as typed, line breaks included; tidying happens only
      // when a page is laid out, never under the cursor.
      if (FIELDS[pg.type] && pg.type !== "photos") for (const [k, max] of Object.entries(FIELDS[pg.type])) out[k] = strU(pg[k], max);
      const styleKeys = [...Object.keys(FIELDS[pg.type] || {}), ...(STUDIO_BOOK_LIMITS.formatFields[pg.type] || [])];
      if (styleKeys.length) {
        const style = cleanBookFormatting(pg.style, styleKeys);
        if (style) out.style = style;
      }
      return out;
    }).filter(Boolean);
    const t = v.texts && typeof v.texts === "object" ? v.texts : {};
    return {
      id: v.id.slice(0, 40), name: str(v.name, 80) || "Untitled book",
      style: STUDIO_BOOK_STYLES.includes(v.style) ? v.style : "modern",
      ...(STUDIO_BOOK_LIMITS.papers.includes(v.paper) && v.paper !== "a4" ? { paper: v.paper } : {}),
      colourway: str(v.colourway, 40) || "terracotta",
      orientation: v.orientation === "landscape" ? "landscape" : "portrait",
      title: str(v.title, 80), subtitle: str(v.subtitle, 120),
      cover: shot(v.cover),
      // The book's mark of how new its shapes are: the highest it has ever
      // carried, never lowered here, so an older tab dropping what it cannot
      // read shows up as the mark going backwards.
      ...(() => {
        const need = STUDIO_BOOK_NEWER_STYLES.includes(v.style) ? 5 : v.style === "lookbook" ? 4 : pages.some((pg) => pg.type === "look") ? 3 : (STUDIO_BOOK_LIMITS.coverLayouts.includes(v.coverLayout) || pages.some((pg) => pg.type === "end")) ? 2 : pages.some((pg) => pg.type === "free") ? 1 : 0;
        const mark = Math.max(need, num(v.schema, 0, 99, 0));
        return mark ? { schema: mark } : {};
      })(),
      // The running foot: the studio's name unless the book gives its own, and
      // page numbers unless they are switched off.
      ...(str(v.footText, STUDIO_BOOK_LIMITS.footText).trim() ? { footText: str(v.footText, STUDIO_BOOK_LIMITS.footText) } : {}),
      // One colour behind every page (the cover keeps its own), unless a page says otherwise.
      ...(STUDIO_BOOK_LIMITS.fills.includes(v.bg) || /^#[0-9a-f]{6}$/i.test(String(v.bg || "")) ? { bg: String(v.bg).toLowerCase() } : {}),
      ...(v.showPageNumbers === false ? { showPageNumbers: false } : {}),
      // The cover's layout, and the cover itself when it is arranged from scratch.
      ...(STUDIO_BOOK_LIMITS.coverLayouts.includes(v.coverLayout) ? { coverLayout: v.coverLayout } : {}),
      ...(v.coverLayout === "custom" ? { coverPage: (() => {
        const cp = v.coverPage && typeof v.coverPage === "object" ? v.coverPage : {};
        const out = { blocks: cleanBlocks(cp.blocks) };
        if (STUDIO_BOOK_LIMITS.fills.includes(cp.bg) || /^#[0-9a-f]{6}$/i.test(String(cp.bg || ""))) out.bg = String(cp.bg).toLowerCase();
        return out;
      })() } : {}),
      ...(cleanBookFormatting(v.coverStyle, STUDIO_BOOK_LIMITS.formatFields.cover) ? { coverStyle: cleanBookFormatting(v.coverStyle, STUDIO_BOOK_LIMITS.formatFields.cover) } : {}),
      ...(() => {
        const t = v.coverText && typeof v.coverText === "object" ? v.coverText : {};
        const out = {};
        for (const [k, max] of Object.entries(STUDIO_BOOK_LIMITS.coverText)) { const val = str(t[k], max); if (val.trim()) out[k] = val; }
        // The three lines each side of the cover's inside block.
        for (const side of ["left", "right"]) {
          const lines = (Array.isArray(t[side]) ? t[side] : []).slice(0, 3).map((x) => str(x, STUDIO_BOOK_LIMITS.coverLine));
          while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
          if (lines.length) out[side] = lines;
        }
        if (t.showCounts === false) out.showCounts = false;
        return Object.keys(out).length ? { coverText: out } : {};
      })(),
      ...(() => {
        const w = v.watermark && typeof v.watermark === "object" ? v.watermark : {};
        const out = {};
        const text = str(w.text, 40);
        if (text.trim()) out.text = text;
        if (STUDIO_BOOK_LIMITS.markStrengths.includes(w.strength) && w.strength !== "medium") out.strength = w.strength;
        return Object.keys(out).length ? { watermark: out } : {};
      })(),
      pages,
      texts: { about: str(t.about, STUDIO_BOOK_LIMITS.text), phone: str(t.phone, 24), showPrices: t.showPrices === true },
      updatedAt: num(v.updatedAt, 0, 8.64e15, 0)
    };
  }).filter(Boolean);
  // Newest tombstones kept, if ever over the cap: keeping the oldest would drop
  // the deletion just made and let the published copy bring the book back.
  const deleted = (Array.isArray(o.deleted) ? o.deleted : []).filter((x) => typeof x === "string" && x).slice(-STUDIO_BOOK_LIMITS.deleted);
  return { versions, deleted };
}
// `live` is the copy just fetched from GitHub when publishing; it joins the
// same per-book merge as this device's drafts and the copy the page loaded.
// A book holding anything older code doesn't know (a writing page, a caption,
// a photo placement) is also kept under a second key. A tab still running an
// older app.js cleans every book it saves with the old rules, which drop
// those from books it never opened while leaving their updatedAt alone. The
// copy here is read first, so on that equal updatedAt the complete copy wins.
// Older code never touches it.
// Each time the stored shape grows, the copy moves to a new key: code that
// knows the previous shape still writes the previous key (stripping only what
// it doesn't know), so the newest key is read first and wins ties.
const STUDIO_BOOK_WORDS_KEY = "wps_studio_portfolios_words_v9";
// Older keys: code that knows only an older shape keeps rewriting the key it
// knows, so every growth of the shape gets a new one, read before the old.
const STUDIO_BOOK_WORDS_OLD = ["wps_studio_portfolios_words_v8", "wps_studio_portfolios_words_v7", "wps_studio_portfolios_words_v6", "wps_studio_portfolios_words_v5", "wps_studio_portfolios_words_v4", "wps_studio_portfolios_words_v3", "wps_studio_portfolios_words_v2", "wps_studio_portfolios_words"];
const studioBookHasWords = (v) => v.style === "lookbook" || STUDIO_BOOK_NEWER_STYLES.includes(v.style) || !!v.paper || !!v.coverStyle || !!v.watermark || !!v.coverText || !!v.schema || !!v.footText || !!v.bg || v.showPageNumbers === false || !!v.coverLayout || !!v.coverPage || !!(v.cover && (v.cover.fit || v.cover.opacity)) || (v.pages || []).some((pg) =>
  (STUDIO_BOOK_LIMITS.fields[pg.type] && (pg.type !== "photos" || pg.caption)) || (pg.blocks || []).length || pg.bg || pg.items || pg.steps || pg.rows || pg.credit || pg.label || pg.heading || pg.photoAt || pg.border || pg.borderWidth || pg.style || pg.hide || (pg.photos || []).some((s) => s.fit || s.opacity));
function getStudioPortfolios(live) {
  let local = null, published = null, remote = null, words = null;
  const older = [];
  try { local = cleanStudioPortfolios(JSON.parse(localStorage.getItem("wps_studio_portfolios") || "null")); } catch (e) {}
  try { words = cleanStudioPortfolios(JSON.parse(localStorage.getItem(STUDIO_BOOK_WORDS_KEY) || "null")); } catch (e) {}
  for (const key of STUDIO_BOOK_WORDS_OLD) { try { const got = cleanStudioPortfolios(JSON.parse(localStorage.getItem(key) || "null")); if (got) older.push(got); } catch (e) {} }
  try { published = cleanStudioPortfolios(window.WPS_DATA && window.WPS_DATA.STUDIO_PORTFOLIOS); } catch (e) {}
  try { remote = live ? cleanStudioPortfolios(live) : null; } catch (e) {}
  const deleted = [...new Set([...((local && local.deleted) || []), ...((published && published.deleted) || []), ...((remote && remote.deleted) || [])])];
  const byId = new Map();
  for (const v of [...((words && words.versions) || []), ...older.flatMap((o) => o.versions), ...((remote && remote.versions) || []), ...((published && published.versions) || []), ...((local && local.versions) || [])]) {
    const have = byId.get(v.id);
    if (!have || v.updatedAt > have.updatedAt) byId.set(v.id, v);
  }
  const versions = [...byId.values()].filter((v) => !deleted.includes(v.id)).sort((a, b) => b.updatedAt - a.updatedAt);
  return { versions, deleted };
}
function saveStudioPortfolios(state) {
  const clean = cleanStudioPortfolios(state);
  if (!clean) return false;
  try { localStorage.setItem("wps_studio_portfolios", JSON.stringify(clean)); } catch (e) { return false; }
  try {
    const copy = JSON.stringify({ versions: clean.versions.filter(studioBookHasWords), deleted: [] });
    localStorage.setItem(STUDIO_BOOK_WORDS_KEY, copy);
    for (const key of STUDIO_BOOK_WORDS_OLD) localStorage.setItem(key, copy);
  } catch (e) { /* the main copy is saved; these are a safety net */ }
  return true;
}
window.cleanStudioPortfolios = cleanStudioPortfolios;
window.getStudioPortfolios = getStudioPortfolios;
window.saveStudioPortfolios = saveStudioPortfolios;
window.STUDIO_BOOK_LIMITS = STUDIO_BOOK_LIMITS;


/* ---- testimonials -------------------------------------------------------
   What people have written about working with the studio, and the only store
   of them. They arrive as email (the form on /testimonials has nowhere else
   to send them — there is no server), so putting one on the site is the
   studio typing it in here and publishing. That is also the moderation: a
   stranger cannot write onto the page, only into the inbox.

   Shape published in data.js: { items: [...], deleted: [...] }, merged by id
   with newest-updatedAt winning, exactly as MODEL_PDFS and STUDIO_PORTFOLIOS
   are. Two devices can both add one without either losing the other's, and a
   deletion is durable rather than being undone by the next device to publish.

   The documentation a writer attached — a letterhead, an email, a screenshot
   — is deliberately NOT here. It sits in the studio's Gmail, where the signed
   contracts sit, because this repository is public and a client's paperwork
   is not ours to publish. All that crosses is `verified`: the studio saw it.

   TRAP, the same one the invite codes have: this normaliser drops any field
   it does not name. A new field on a testimonial must be added here too, or
   it will vanish the next time the page is reloaded. */
const TESTIMONIAL_STORE_LIMITS = { quote: 900, name: 60, role: 80, shoot: 80, items: 200 };
function cleanTestimonials(state) {
  if (!state || typeof state !== "object") return { items: [], deleted: [] };
  const str = (v, n) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, n);
  const ids = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && x).slice(0, 400) : []);
  const KINDS = ["model", "brand", "workshop", "other"];
  const items = (Array.isArray(state.items) ? state.items : []).map((t) => {
    if (!t || typeof t !== "object" || typeof t.id !== "string" || !t.id) return null;
    const quote = str(t.quote, TESTIMONIAL_STORE_LIMITS.quote);
    if (!quote) return null; // a testimonial with no words is not one
    const rating = Math.round(Number(t.rating) || 0);
    return {
      id: t.id,
      quote,
      by: str(t.by, TESTIMONIAL_STORE_LIMITS.name) || "Anonymous",
      role: str(t.role, TESTIMONIAL_STORE_LIMITS.role),
      kind: KINDS.includes(t.kind) ? t.kind : "",
      // Out of five, and 0 means "not rated" rather than "rated nothing".
      rating: rating >= 1 && rating <= 5 ? rating : 0,
      // Free text on purpose ("March 2026", "after the Goa shoot"): it is a
      // caption under a name, not a date anything sorts or compares by.
      dateLabel: str(t.dateLabel, 40),
      shoot: str(t.shoot, TESTIMONIAL_STORE_LIMITS.shoot),
      shootId: str(t.shootId, 80),
      verified: t.verified === true,
      onHome: t.onHome !== false,
      updatedAt: Number(t.updatedAt) || 0
    };
  }).filter(Boolean).slice(0, TESTIMONIAL_STORE_LIMITS.items);
  return { items, deleted: ids(state.deleted) };
}
/* The merged list: what is live, what another device published while this one
   was not looking, and what has been typed in here since. Newest wins per id,
   and anything deleted anywhere stays deleted. */
function getTestimonials(live) {
  let local = null, published = null, remote = null;
  try { local = cleanTestimonials(JSON.parse(localStorage.getItem("wps_testimonials") || "null")); } catch (e) {}
  try { published = cleanTestimonials(window.WPS_DATA && window.WPS_DATA.TESTIMONIALS); } catch (e) {}
  try { remote = live ? cleanTestimonials(live) : null; } catch (e) {}
  const deleted = [...new Set([
    ...((local && local.deleted) || []),
    ...((published && published.deleted) || []),
    ...((remote && remote.deleted) || [])
  ])];
  const byId = new Map();
  for (const t of [...((remote && remote.items) || []), ...((published && published.items) || []), ...((local && local.items) || [])]) {
    const have = byId.get(t.id);
    if (!have || t.updatedAt >= have.updatedAt) byId.set(t.id, t);
  }
  const items = [...byId.values()].filter((t) => !deleted.includes(t.id)).sort((a, b) => b.updatedAt - a.updatedAt);
  return { items, deleted };
}
function saveTestimonials(state) {
  const clean = cleanTestimonials(state);
  try { localStorage.setItem("wps_testimonials", JSON.stringify(clean)); } catch (e) { return false; }
  return true;
}
window.cleanTestimonials = cleanTestimonials;
window.getTestimonials = getTestimonials;
window.saveTestimonials = saveTestimonials;
window.TESTIMONIAL_STORE_LIMITS = TESTIMONIAL_STORE_LIMITS;

/* ---- the people the studio photographs ----------------------------------
   One record per model, holding what belongs to the person rather than to any
   one shoot: their name, their own social handles, their measurements, the
   agency representing them. Albums and individual photographs point at a
   record by `key` — a slug of the name — so the same model tagged on a test
   shoot in March and on a brand's campaign in September is one person with
   one card, however her name happened to be typed the second time.

   Why this exists at all: a comp card used to be assembled by grouping albums
   on the raw text of the "Model / talent" credit. That works while every
   album is one model's test shoot and breaks the moment it is not — a brand's
   day with six models has one credit line naming all six, belongs to the
   client, and has frames with two models in one picture. See the model-tagging
   note in app.js for how photographs are dealt out to the people in them.

   An album still carries its own copy of these fields, and still answers for
   a model with no record here (see `sources` in buildCompCardDisplayList), so
   nothing published before this existed changed shape or behaviour.

   TRAP, the same one the testimonials and invite codes have: this normaliser
   drops any field it does not name. A new field on a model must be added here
   too, or it will vanish the next time the page is reloaded. The per-surface
   visibility switches are matched by shape rather than listed, so adding one
   to REP_SWITCHES in app.js needs no change here. */
const MODEL_STORE_LIMITS = { name: 80, credit: 300, stat: 40, email: 120, items: 400 };
function cleanModels(state) {
  if (!state || typeof state !== "object") return { items: [], deleted: [] };
  const list = Array.isArray(state) ? state : (Array.isArray(state.items) ? state.items : []);
  const str = (v, n) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, n);
  const ids = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && x).slice(0, 400) : []);
  const items = list.map((m) => {
    if (!m || typeof m !== "object") return null;
    const key = str(m.key, 120);
    const name = str(m.name, MODEL_STORE_LIMITS.name);
    // A record with no key cannot be pointed at, and one with no name has
    // nothing to print on a card. Either way it is not a model.
    if (!key || !name) return null;
    const out = {
      key,
      name,
      // The credit line as it is typed everywhere else on the site —
      // "Name (@handle; site.com)" — because that is the form the comp card,
      // the lightbox and the PDFs already know how to read handles out of.
      talent: str(m.talent, MODEL_STORE_LIMITS.credit) || name,
      height: str(m.height, MODEL_STORE_LIMITS.stat),
      chest: str(m.chest, MODEL_STORE_LIMITS.stat),
      chestLabel: str(m.chestLabel, 20),
      waist: str(m.waist, MODEL_STORE_LIMITS.stat),
      hips: str(m.hips, MODEL_STORE_LIMITS.stat),
      shoes: str(m.shoes, MODEL_STORE_LIMITS.stat),
      modelHair: str(m.modelHair, MODEL_STORE_LIMITS.stat),
      modelEyes: str(m.modelEyes, MODEL_STORE_LIMITS.stat),
      agencyCredit: str(m.agencyCredit, MODEL_STORE_LIMITS.credit),
      agency: str(m.agency, MODEL_STORE_LIMITS.name),
      agencyHandle: str(m.agencyHandle, 120),
      agencySite: str(m.agencySite, 200),
      agencyLinks: (Array.isArray(m.agencyLinks) ? m.agencyLinks : []).slice(0, 8)
        .map((l) => (l && typeof l === "object" ? { kind: str(l.kind, 20), label: str(l.label, 120), url: str(l.url, 300) } : null))
        .filter((l) => l && l.url),
      modelEmail: str(m.modelEmail, MODEL_STORE_LIMITS.email),
      modelTypes: (Array.isArray(m.modelTypes) ? m.modelTypes : []).slice(0, 4).map((t) => str(t, 40)).filter(Boolean),
      updatedAt: Number(m.updatedAt) || 0
    };
    if (typeof m.showStatsOnCompCard === "boolean") out.showStatsOnCompCard = m.showStatsOnCompCard;
    if (typeof m.showStatsOnModelPortfolio === "boolean") out.showStatsOnModelPortfolio = m.showStatsOnModelPortfolio;
    // Matched by shape, not by a list that would have to be kept in step with
    // REP_SWITCHES × REP_SURFACES in app.js.
    Object.keys(m).forEach((k) => {
      if (/^show[A-Za-z]+On(CompCard|Home|Pdf)$/.test(k) && typeof m[k] === "boolean") out[k] = m[k];
    });
    return out;
  }).filter(Boolean);
  // One record per key: a duplicate key would give the model two cards, which
  // is the exact failure this registry exists to prevent.
  const byKey = new Map();
  for (const m of items) {
    const have = byKey.get(m.key);
    if (!have || m.updatedAt >= have.updatedAt) byKey.set(m.key, m);
  }
  return { items: [...byKey.values()].slice(0, MODEL_STORE_LIMITS.items), deleted: ids(state.deleted) };
}
/* The merged list: what is live, what another device published while this one
   was not looking, and what has been typed in here since. Newest wins per key,
   and anyone deleted anywhere stays deleted. */
function getModels(live) {
  let local = null, published = null, remote = null;
  try { local = cleanModels(JSON.parse(localStorage.getItem("wps_models") || "null")); } catch (e) {}
  try { published = cleanModels(window.WPS_DATA && window.WPS_DATA.MODELS); } catch (e) {}
  try { remote = live ? cleanModels(live) : null; } catch (e) {}
  const deleted = [...new Set([
    ...((local && local.deleted) || []),
    ...((published && published.deleted) || []),
    ...((remote && remote.deleted) || [])
  ])];
  const byKey = new Map();
  for (const m of [...((remote && remote.items) || []), ...((published && published.items) || []), ...((local && local.items) || [])]) {
    const have = byKey.get(m.key);
    if (!have || m.updatedAt >= have.updatedAt) byKey.set(m.key, m);
  }
  const items = [...byKey.values()].filter((m) => !deleted.includes(m.key))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { items, deleted };
}
function saveModels(state) {
  const clean = cleanModels(state);
  try { localStorage.setItem("wps_models", JSON.stringify(clean)); } catch (e) { return false; }
  // The live list a visitor's page reads is the published one; this keeps the
  // admin's own pages showing what was just typed without a reload.
  try { if (window.WPS_DATA) window.MODELS = clean.items; } catch (e) {}
  return true;
}
window.cleanModels = cleanModels;
window.getModels = getModels;
window.saveModels = saveModels;
window.MODEL_STORE_LIMITS = MODEL_STORE_LIMITS;


/* ---- saved model-portfolio PDFs ----------------------------------------
   An arrangement the studio built for a model: which photos, in what order,
   the layout, the cover and any nudge given to a photo. Saved by name so it
   can be reopened months later and sent again, with or without the watermark.

   What is stored is the ARRANGEMENT, not the finished file. Three reasons:
   a PDF is about a megabyte and this repository is public, so the file would
   be downloadable by anyone who guessed its address; the arrangement is a few
   hundred bytes of ids; and reopening it draws from the photos and the type
   settings as they are TODAY, so a saved portfolio improves when the work
   does rather than going stale. Both downloads are then a press away, as they
   already are for a PDF made from scratch.

   Shape mirrors STUDIO_PORTFOLIOS above — versions by id, a deleted list, and
   newest-updatedAt wins — so publishing from two devices merges rather than
   one silently replacing the other. */
const MODEL_PDF_LIMITS = { perModel: 12, name: 60 };
function cleanModelPdfs(state) {
  if (!state || typeof state !== "object") return { versions: [], deleted: [] };
  const ids = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && x).slice(0, 60) : []);
  const versions = (Array.isArray(state.versions) ? state.versions : []).map((v) => {
    if (!v || typeof v !== "object" || typeof v.id !== "string" || !v.id) return null;
    const sp = v.spec && typeof v.spec === "object" ? v.spec : {};
    const adjust = {};
    if (sp.adjust && typeof sp.adjust === "object") {
      for (const [k, a] of Object.entries(sp.adjust).slice(0, 60)) {
        if (!a || typeof a !== "object") continue;
        const num = (n, lo, hi) => { const x = Number(n); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : 0; };
        adjust[k] = { x: num(a.x, -1, 1), y: num(a.y, -1, 1), zoom: Math.min(4, Math.max(1, Number(a.zoom) || 1)) };
      }
    }
    return {
      id: v.id,
      shootId: typeof v.shootId === "string" ? v.shootId : "",
      name: String(v.name || "").slice(0, MODEL_PDF_LIMITS.name),
      updatedAt: Number(v.updatedAt) || 0,
      spec: {
        pages: [2, 3].includes(sp.pages) ? sp.pages : 1,
        count: Math.min(18, Math.max(1, Number(sp.count) || 5)),
        // The client's own answer for each page, one to six a page. `count`
        // and the older `firstPage` are kept so an arrangement saved before
        // this still reopens as the PDF it was saved as.
        perPage: (Array.isArray(sp.perPage) ? sp.perPage : []).slice(0, 3)
          .map((n) => Math.min(6, Math.max(1, Number(n) || 1))),
        // Photo id → 1 or 2 places across, where the client overruled the page.
        span: (() => {
          const out = {};
          if (sp.span && typeof sp.span === "object") {
            for (const [k, v] of Object.entries(sp.span).slice(0, 60)) {
              if (typeof k === "string" && k && (Number(v) === 1 || Number(v) === 2)) out[k] = Number(v);
            }
          }
          return out;
        })(),
        firstPage: Math.min(6, Math.max(0, Number(sp.firstPage) || 0)),
        picks: ids(sp.picks),
        cleared: ids(sp.cleared),
        lead: typeof sp.lead === "string" ? sp.lead : "",
        cover: sp.cover === true,
        coverId: typeof sp.coverId === "string" ? sp.coverId : "",
        coverStyle: ["full", "framed", "split", "split-wide"].includes(sp.coverStyle) ? sp.coverStyle : "full",
        // Whether pose tags print at all. Named here because this normaliser
        // drops any field it does not name — the same gate that lost
        // `split-wide` above for a month. `!== false` rather than `=== true`
        // so an arrangement saved before the switch existed reopens the way it
        // was saved, with tags wanted.
        // Pose labels, per page since v495. A scalar is an arrangement saved
        // when the switch governed the whole PDF, and is widened on load; the
        // absent case must still mean ON, which is why this tests !== false
        // rather than === true.
        tags: Array.isArray(sp.tags)
          ? sp.tags.slice(0, 3).map((v) => v !== false)
          : sp.tags !== false,
        tagPlace: ["in", "below", "above"].includes(sp.tagPlace) ? sp.tagPlace : "in",
        tagAlign: ["left", "center", "right"].includes(sp.tagAlign) ? sp.tagAlign : "left",
        layout: sp.layout === "equal" ? "equal" : "lead",
        order: ids(sp.order),
        fewerOnTop: sp.fewerOnTop === true,
        adjust
      }
    };
  }).filter(Boolean);
  return { versions, deleted: ids(state.deleted) };
}
function getModelPdfs(live) {
  let local = null, published = null, remote = null;
  try { local = cleanModelPdfs(JSON.parse(localStorage.getItem("wps_model_pdfs") || "null")); } catch (e) {}
  try { published = cleanModelPdfs(window.WPS_DATA && window.WPS_DATA.MODEL_PDFS); } catch (e) {}
  try { remote = live ? cleanModelPdfs(live) : null; } catch (e) {}
  const deleted = [...new Set([...((local && local.deleted) || []), ...((published && published.deleted) || []), ...((remote && remote.deleted) || [])])];
  const byId = new Map();
  for (const v of [...((remote && remote.versions) || []), ...((published && published.versions) || []), ...((local && local.versions) || [])]) {
    const have = byId.get(v.id);
    if (!have || v.updatedAt > have.updatedAt) byId.set(v.id, v);
  }
  const versions = [...byId.values()].filter((v) => !deleted.includes(v.id)).sort((a, b) => b.updatedAt - a.updatedAt);
  return { versions, deleted };
}
function saveModelPdfs(state) {
  const clean = cleanModelPdfs(state);
  try { localStorage.setItem("wps_model_pdfs", JSON.stringify(clean)); } catch (e) { return false; }
  return true;
}
window.cleanModelPdfs = cleanModelPdfs;
window.getModelPdfs = getModelPdfs;
window.saveModelPdfs = saveModelPdfs;
window.MODEL_PDF_LIMITS = MODEL_PDF_LIMITS;


/* ---- contract archive text ----
   Moved to contracts.js so the booking page can render the real document
   instead of a hand-written copy that drifted three versions behind.
   app.js loads it on demand; everything here still reads
   window.WPS_CONTRACT_ARCHIVE exactly as before. */



/* ---- package-editor CRUD ---- */
window.saveAdminCustomPackages = async function() {
  // The test-shoot row shares the class for layout but is not a paid tier.
  const rows = document.querySelectorAll(".admin-pkg-editor-row:not(.admin-pkg-editor-row--tfp)");
  if (rows.length) {
    const updated = [];
    rows.forEach((row, i) => {
      const name = row.querySelector(".pkg-edit-name")?.value || `Package ${i+1}`;
      const price = parseInt(row.querySelector(".pkg-edit-price")?.value, 10) || 10000;
      const specs = row.querySelector(".pkg-edit-specs")?.value || "Standard Deliverables";
      const delivery = (row.querySelector(".pkg-edit-delivery")?.value || "").trim();
      updated.push({ id: `pkg_${i+1}`, name, price, specs, ...(delivery ? { delivery } : {}) });
    });
    localStorage.setItem("wps_custom_packages", JSON.stringify(updated));
    stampSetting("wps_custom_packages");
  }
  // Test-shoot row (no fee): name + deliverables line.
  const tfpNameEl = document.getElementById("tfpPkgName");
  const tfpSpecsEl = document.getElementById("tfpPkgSpecs");
  if (tfpNameEl || tfpSpecsEl) {
    const current = getAdminTfpPackage();
    const tfp = {
      name: (tfpNameEl?.value || "").trim() || current.name,
      specs: (tfpSpecsEl?.value || "").trim() || current.specs,
      delivery: (document.getElementById("tfpPkgDelivery")?.value || "").trim()
    };
    localStorage.setItem("wps_tfp_package", JSON.stringify(tfp));
    stampSetting("wps_tfp_package");
  }

  // Home studio rental. Blank is "leave it as it was", not zero — clearing the
  // box by accident must not silently make the studio free.
  const homeRateEl = document.getElementById("homeStudioRateInput");
  if (homeRateEl && homeRateEl.value !== "") {
    const rate = parseInt(homeRateEl.value, 10);
    if (!isNaN(rate) && rate >= 0) { localStorage.setItem("wps_home_studio_rate", String(rate)); stampSetting("wps_home_studio_rate"); }
  }
  // The test-shoot rate is genuinely optional: emptying the box means "charge
  // collaborations the same as paid shoots", so a blank clears the override
  // rather than being ignored the way a blank paid rate is.
  const homeRateTfpEl = document.getElementById("homeStudioRateTfpInput");
  if (homeRateTfpEl) {
    if (homeRateTfpEl.value === "") {
      localStorage.removeItem("wps_home_studio_rate_tfp");
    } else {
      const tfpRate = parseInt(homeRateTfpEl.value, 10);
      if (!isNaN(tfpRate) && tfpRate >= 0) { localStorage.setItem("wps_home_studio_rate_tfp", String(tfpRate)); stampSetting("wps_home_studio_rate_tfp"); }
    }
  }

  // Commit Draft Invite Codes. (A legacy singular "wps_custom_invite_code"
  // key used to be written here too — as "[object Object]", since the entry
  // is an object — but nothing anywhere reads it, so it was dropped.)
  if (window.adminDraftInviteCodes && Array.isArray(window.adminDraftInviteCodes)) {
    localStorage.setItem("wps_custom_invite_codes", JSON.stringify(window.adminDraftInviteCodes));
    stampSetting("wps_custom_invite_codes");
  }

  // Commit Draft Promo Codes
  if (window.adminDraftPromoCodes && typeof window.adminDraftPromoCodes === "object") {
    localStorage.setItem("wps_custom_promo_codes", JSON.stringify(window.adminDraftPromoCodes));
    stampSetting("wps_custom_promo_codes");
  }

  const setBadge = paintSaveStatus;

  if (typeof render === "function") render();

  // Saving used to stop here and still announce "saved to live site". It was
  // not: rates, promo and invite codes only reached visitors when some album
  // was published later, so a price edit read as live to the studio while
  // every client was still quoted the old one. Publish for real, and say so
  // only once GitHub has actually taken it.
  setBadge("#d97706", "rgba(217,119,6,0.15)", "⏳ PUBLISHING TO LIVE SITE…");
  if (typeof toast === "function") toast("Publishing rates & codes to the live site…");

  const publish = window.publishStudioDataToLiveSite;
  if (typeof publish !== "function") {
    setBadge("#d97706", "rgba(217,119,6,0.15)", "⚠️ SAVED ON THIS DEVICE ONLY — NOT LIVE YET");
    if (typeof toast === "function") toast("Saved on this device, but publishing is unavailable here. Open the site as admin and try again.");
    return;
  }

  const ok = await publish();
  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (ok) {
    try { localStorage.removeItem(UNPUBLISHED_CODES_KEY); } catch (e) {}
    setBadge("#059669", "rgba(5,150,105,0.15)", `🟢 PUBLISHED TO LIVE SITE (${nowStr})`);
    if (typeof toast === "function") toast("✅ Rates, promo & invite codes are live for every client within a few minutes.");
  } else {
    // syncToGitHub has already explained the specific failure in its own toast.
    setBadge("#d97706", "rgba(217,119,6,0.15)", "⚠️ SAVED ON THIS DEVICE ONLY — PUBLISH FAILED, TRY AGAIN");
  }
};

window.resetAdminCustomPackages = function() {
  if (confirm("Reset studio package rates to default values?")) {
    localStorage.removeItem("wps_custom_packages");
    localStorage.removeItem("wps_tfp_package");
    alert("Reset to default package rates!");
    if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
    if (typeof render === "function") render();
  }
};

window.addNewAdminPackageRow = function() {
  const pkgs = getAdminPackages();
  if (pkgs.length >= 15) {
    alert("Maximum 15 package tiers allowed!");
    return;
  }
  const nextNum = pkgs.length + 1;
  const lastPrice = pkgs.length ? pkgs[pkgs.length - 1].price : 10000;
  pkgs.push({
    id: `pkg_${nextNum}`,
    name: `Custom Package Tier #${nextNum}`,
    price: lastPrice + 10000,
    specs: "Custom Proofing & Master Retouched Deliverables"
  });
  localStorage.setItem("wps_custom_packages", JSON.stringify(pkgs));
  stampSetting("wps_custom_packages");
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
  if (typeof toast === "function") toast(`➕ Package Tier #${nextNum} added! Adjust rates & click Save.`);
  if (typeof render === "function") render();
};

// Test shoots are gated behind an invite code, so the shareable link
// carries the primary code: the form verifies it on load and switches
// itself to the collaboration type.
window.copyTfpBookingLink = function() {
  const code = (typeof window.getAdminInviteCode === "function" ? window.getAdminInviteCode() : "NERDYBRAND");
  const url = `https://www.nerdyphotographer.in/book?invite=${encodeURIComponent(code)}`;
  navigator.clipboard.writeText(url).then(() => {
    if (typeof toast === "function") toast(`Test shoot link copied: ${url}`);
    else alert(`Test shoot link: ${url}`);
  }).catch(() => {
    alert(`Test shoot link: ${url}`);
  });
};

window.copyPackageBookingLink = function(price) {
  const url = `https://www.nerdyphotographer.in/book?package=${price}`;
  navigator.clipboard.writeText(url).then(() => {
    if (typeof toast === "function") toast(`🔗 Shareable Booking Link copied: ${url}`);
    else alert(`Shareable Link: ${url}`);
  }).catch(() => {
    alert(`Shareable Link: ${url}`);
  });
};

window.deleteAdminPackageRow = function(index) {
  const pkgs = getAdminPackages();
  if (pkgs.length <= 1) {
    alert("Minimum 1 package tier must remain!");
    return;
  }
  const pkgName = pkgs[index]?.name || `Tier #${index + 1}`;
  if (confirm(`Delete Package Tier #${index + 1} (${pkgName})?`)) {
    pkgs.splice(index, 1);
    localStorage.setItem("wps_custom_packages", JSON.stringify(pkgs));
    stampSetting("wps_custom_packages");
  stampSetting("wps_custom_packages");
    if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
    if (typeof toast === "function") toast("🗑️ Package tier removed!");
    if (typeof render === "function") render();
  }
};

window.moveAdminPackageRow = function(index, dir) {
  const pkgs = getAdminPackages();
  const targetIndex = index + dir;
  if (targetIndex < 0 || targetIndex >= pkgs.length) return;
  
  const temp = pkgs[index];
  pkgs[index] = pkgs[targetIndex];
  pkgs[targetIndex] = temp;
  
  localStorage.setItem("wps_custom_packages", JSON.stringify(pkgs));
  stampSetting("wps_custom_packages");
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
  if (typeof toast === "function") toast(`↕️ Reordered Package #${index + 1}!`);
  if (typeof render === "function") render();
};


/* ============================================================
   The half that lived inside app.js's IIFE.
   ============================================================ */
(() => {
  "use strict";
  const A = window.WPS_ADMIN_API;
  if (!A) {
    console.error("admin.js loaded without WPS_ADMIN_API — app.js is older than this file, or did not finish. Reload with “Load fresh version”.");
    return;
  }
  const {
    $, ACTIVITIES, BRANDS, CHEST_LABELS, CLIENTS, LOOKS,
    MODEL_TYPES_MAX, MODEL_TYPE_MAXLEN, REP_SURFACES, REP_SWITCHES, TYPES, addCalBooking,
    albumClients, backfillPublishedOnlyFields, chestLabelOf, classifySocial, cleanIgHandle, createHoldFromContract,
    esc, escJs, extractPalette, followAlbumText, getCalDateKey, getCalDateStatus,
    getContractEmailStatuses, getLocalContractAudits, getTalentCleanName, igHandleFromCredit, isAdmin, isDecidableHold,
    isSigImage, kineticH1, legacyClientOf, loadShoots, localTombstones, lookByKey,
    albumModelKeys, feedsModelCards, modelKeyOf, modelNameFromKey, modelRoster, photoModelKeys, slugify,
    lookLabel, modelTypeLabel, modelTypeOptions, modelTypesOf, normalizeModelType, parseDeletedIdsFromDataJs,
    parseIgHandle, parseKavyarLink, parseObjectAfterKey, parseShootsFromDataJs, parseValueAfterKey, photoSrc,
    putShoot, readAsDataURL, removeCalBooking, render, repSwitchValues, resize,
    saveCalendarSettings, showRep, showsOnModelPage, siteFromCredit, socialsFromCredit, syncCalendarWithAudits,
    syncCalendarWithShoots, toast, toggleCalDateBlock, uid, updateCalBooking, view,
    wireView,
  } = A;
  // SHOOTS is reassigned on every load, so it is read live rather than
  // captured once: a snapshot here would leave the studio editing the album
  // list as it was when admin mode was switched on.
  const shootsNow = A.shoots;

  /* ---- contract-version selects ---- */
  // Contract version <select>s used to hard-code every version, so each new
  // release meant editing three lists that only grew. They are built from the
  // archive instead: the two active versions up front (plus the one an older
  // booking already carries), everything else behind "Older versions…".
  const contractVersionLabel = (key) => {
    const num = (key.match(/V(\d+\.\d+)/) || [])[1] || key;
    if (/COMMERCIAL/.test(key)) return `Commercial contract V${num}`;
    if (/TFP/.test(key)) return `Test shoot / TFP release V${num}`;
    return `Studio terms V${num}`;
  };
  const contractVersionKeys = () => Object.keys(window.WPS_CONTRACT_ARCHIVE || {}).sort((a, b) => {
    const kind = (k) => /COMMERCIAL/.test(k) ? 0 : /TFP/.test(k) ? 1 : 2;
    const num = (k) => parseFloat((k.match(/V(\d+\.\d+)/) || [])[1] || 0);
    return kind(a) - kind(b) || num(b) - num(a);
  });
  const contractVersionOptionsHtml = ({ selected = "", pending = false, custom = true, expanded = false } = {}) => {
    const active = [window.ACTIVE_CONTRACTS.commercial, window.ACTIVE_CONTRACTS.tfp];
    const all = contractVersionKeys();
    const keys = expanded ? all : all.filter(k => active.includes(k) || k === selected);
    const opt = (v, label) => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(label)}</option>`;
    let html = "";
    if (pending) html += opt("Pending Agreement", "Pending agreement · not signed yet");
    html += keys.map(k => opt(k, `${contractVersionLabel(k)} ${active.includes(k) ? "(active)" : "(archived)"}`)).join("");
    if (custom) html += opt("Custom Contract", "Custom contract / MSA");
    if (!expanded && keys.length < all.length) html += `<option value="__older__">Older versions…</option>`;
    return html;
  };
  // Picking "Older versions…" swaps the full list in and restores the value
  // that was selected before, so the pick itself never becomes the answer.
  document.addEventListener("change", (e) => {
    const sel = e.target;
    if (!(sel instanceof HTMLSelectElement) || !sel.dataset.contractSelect) return;
    if (sel.value !== "__older__") { sel.dataset.prevValue = sel.value; return; }
    const prev = sel.dataset.prevValue || "";
    sel.innerHTML = contractVersionOptionsHtml({ selected: prev, pending: sel.dataset.pending === "1", custom: sel.dataset.custom !== "0", expanded: true });
    sel.value = prev && Array.from(sel.options).some(o => o.value === prev) ? prev : sel.options[0].value;
  }, true);

  /* ---- GitHub api helpers ---- */
  const GH_REPO = "prateeksaxenaphotography-maker/Fictional-spoon";
  const GH_BRANCH = "main";
  const GH_API = `https://api.github.com/repos/${GH_REPO}`;

  // A credential GitHub has rejected is cleared wherever it is discovered, not
  // only in ghApi. fetchRemoteData runs before any ghApi call and used to throw
  // on 401 while leaving the dead token in storage: the sync then aborted, the
  // prompt never reappeared (it only shows when nothing is stored), and every
  // subsequent publish dead-ended on the same error with no way to enter a new
  // token short of clearing localStorage by hand.
  function clearRejectedToken(reason = "401") {
    localStorage.removeItem("wps-github-pat");
    return explains(new Error(`GitHub rejected the token (${reason}). It was cleared — you'll be asked for a new one on the next publish.`));
  }

  // GitHub answers a token that CAN'T touch this repo (wrong scope, a
  // fine-grained token never given access, SSO not authorized for the
  // token's org) with 403 rather than 401 -- but 403 also covers rate
  // limiting, which says nothing about the token's validity and must not
  // clear it. GitHub sets X-RateLimit-Remaining on every response, success
  // or not, so remaining === "0" is what tells the two apart. Any 403 that
  // isn't a rate limit is treated exactly like a 401: cleared and reprompted,
  // otherwise a bad token just gets silently retried forever with no way
  // back to the prompt short of clearing localStorage by hand.
  function checkAuthFailure(res) {
    if (res.status === 401) throw clearRejectedToken("401");
    if (res.status === 403 && res.headers.get("X-RateLimit-Remaining") !== "0") {
      throw clearRejectedToken("403 — insufficient permissions or SSO not authorized");
    }
  }

  // Marks an error whose message already tells the studio exactly what went
  // wrong and what to do about it, so the catch below shows it verbatim rather
  // than burying it under the generic "check the token and connection" hint.
  // A flag rather than a regex over the message text: the previous /401|abort/
  // match silently downgraded any new message that happened not to contain
  // those words.
  function explains(err) {
    err.userFacing = true;
    return err;
  }

  async function ghApi(pat, path, opts = {}) {
    const res = await fetch(`${GH_API}${path}`, {
      ...opts,
      headers: {
        "Authorization": `token ${pat}`,
        "Accept": "application/vnd.github+json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    checkAuthFailure(res);
    if (!res.ok) throw new Error(`GitHub ${opts.method || "GET"} ${path} failed (${res.status})`);
    return res.json();
  }

  /* ---- remote data + publish ---- */

  // Throws (rather than returning null) on any failure short of a genuine
  // "file doesn't exist yet" 404 — syncToGitHub's merge treats a null/empty
  // result as "nothing published remotely" and would otherwise publish a
  // local-only view of the world on a network hiccup, silently wiping out
  // shoots that only exist on other devices.
  async function fetchRemoteData(pat) {
    const res = await fetch(`${GH_API}/contents/data.js?ref=${GH_BRANCH}`, {
      headers: { "Authorization": `token ${pat}`, "Accept": "application/vnd.github.raw+json" },
    });
    checkAuthFailure(res);
    // 404 is ambiguous, and reading it as "nothing published yet" is only safe
    // for one of the two things it can mean. A repo with no data.js answers
    // 404 — but so does a repo this token cannot see, because GitHub hides a
    // private repo's existence rather than admitting a permission failure. A
    // token scoped to the wrong repository therefore looked exactly like a
    // fresh one, and the empty list it returned would let the merge below
    // publish this device's view over the top of every other device's shoots.
    // So the repo itself is checked, and only a demonstrably reachable one is
    // allowed to be genuinely empty.
    if (res.status === 404) {
      const repoRes = await fetch(GH_API, {
        headers: { "Authorization": `token ${pat}`, "Accept": "application/vnd.github+json" },
      });
      checkAuthFailure(repoRes);
      if (!repoRes.ok) {
        throw explains(new Error(`This token cannot reach ${GH_REPO} (GitHub ${repoRes.status}) — check it grants Contents read & write on that repository. Nothing was published.`));
      }
      return { shoots: [], deletedIds: [], studioPortfolios: null, modelPdfs: null }; // repo reachable, data.js genuinely not published yet
    }
    if (!res.ok) throw new Error(`Could not read the published data.js (GitHub ${res.status}) — aborting to avoid overwriting other devices' shoots.`);
    const text = await res.text();
    const parsed = parseShootsFromDataJs(text);
    if (parsed === null) throw new Error("Could not parse the published data.js — aborting to avoid overwriting other devices' shoots.");
    // Saved portfolio books are merged with what is LIVE, not with the copy
    // this page loaded: a tab opened this morning must not publish over a book
    // edited on another device since, or bring back one deleted there. Same
    // rule as the albums above — unreadable means stop, not "none published".
    const books = parseObjectAfterKey(text, '"STUDIO_PORTFOLIOS"');
    if (books === null) throw new Error("Could not read the saved portfolio books in the published data.js — aborting so no book is overwritten.");
    // The settings that are not merged per item (prices, codes, rates) come
    // back whole, with the stamps saying when each was last changed, so the
    // publish can keep a newer copy made on another device.
    const settings = {};
    const stamps = parseObjectAfterKey(text, '"SETTINGS_AT"') || {};
    ["PACKAGES", "TFP_PACKAGE", "INVITE_CODES", "PROMO_CODES", "PORTFOLIO_PDF", "HOME_STUDIO_RATE", "HOME_STUDIO_RATE_TFP"].forEach((k) => {
      const v = parseValueAfterKey(text, `"${k}"`);
      if (v !== undefined) settings[k] = v;
    });
    const modelPdfs = parseObjectAfterKey(text, '"MODEL_PDFS"');
    if (modelPdfs === null) throw new Error("Could not read the saved model portfolios in the published data.js — aborting so none is overwritten.");
    // Same rule as the books and the model portfolios: unreadable means stop,
    // not "none published". A testimonial is somebody's words about the
    // studio, given once; publishing over the top of them because this file
    // could not be parsed is not a mistake that can be undone by asking again.
    // A file that predates testimonials has no key at all, and that IS "none":
    // parseObjectAfterKey returns undefined for a missing key and null for one
    // it could not read.
    const testimonials = parseObjectAfterKey(text, '"TESTIMONIALS"');
    if (testimonials === null) throw new Error("Could not read the published testimonials in data.js — aborting so none is overwritten.");
    // The people the studio photographs. Same rule again: a file that predates
    // the list has no key and that IS "none", but a key this cannot read means
    // stop — republishing without it would strip every model's measurements
    // and agency from every comp card at once.
    const models = parseObjectAfterKey(text, '"MODELS"');
    if (models === null) throw new Error("Could not read the published models in data.js — aborting so none is overwritten.");
    return { shoots: parsed, deletedIds: parseDeletedIdsFromDataJs(text), studioPortfolios: books || null, modelPdfs: modelPdfs || null, testimonials: testimonials || null, models: models || null, settings, stamps };
  }

  const MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

  // Which build this page runs (the ?v= on its own app.js) against the build
  // that's live (sw.js's ASSET_VERSION, fetched past every cache). Returns
  // null when current, or when the live build can't be read: a failed check
  // must not stop the studio publishing.
  async function staleBuildCheck() {
    try {
      const tag = document.querySelector('script[src*="app.js"]');
      const loaded = Number((String(tag && tag.getAttribute("src")).match(/[?&]v=(\d+)/) || [])[1]);
      const res = await fetch(`/sw.js?cb=${Date.now()}`, { cache: "no-store" });
      const live = Number((String(res.ok ? await res.text() : "").match(/ASSET_VERSION\s*=\s*"(\d+)"/) || [])[1]);
      return loaded && live && live > loaded ? { loaded, live } : null;
    } catch (e) {
      return null;
    }
  }

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
      // A tab left open across a release keeps running the old code, and an
      // old publish step drops fields the new one writes. On 2026-09-14 a tab
      // from before v370 wiped every pose tag and the portfolio PDF settings,
      // twice in four minutes. So only the live build may publish.
      const stale = await staleBuildCheck();
      if (stale) {
        toast("This page is out of date, so nothing was published.");
        if (confirm(`A newer version of the site is live (v${stale.live}; this page is v${stale.loaded}).\n\nYour changes are saved on this device, but publishing from an out-of-date page can undo parts of the live site, so nothing was published.\n\nReload now, then publish again?`)) {
          const next = new URL(location.href);
          next.searchParams.set("_v", String(stale.live));
          location.replace(next.toString());
        }
        return false;
      }

      toast("Syncing portfolio to GitHub…");

      // Merge with the published shoots: local wins by id; shoots that only
      // exist remotely (added from another device) survive; deletes propagate.
      const remote = await fetchRemoteData(pat); // throws -> caught below, sync aborts, nothing published
      // Deletions are permanent across devices: union this call's deletions
      // with this device's stored tombstones and the ones already published
      // in data.js. Without the published set, a deletion only held for the
      // one sync that carried it — any other device whose IndexedDB still
      // had the album would innocently publish it right back.
      const removed = new Set([...deletedIds, ...localTombstones(), ...remote.deletedIds]);
      const merged = new Map();
      remote.shoots.forEach((s) => { if (s && s.id && !s.demo && !removed.has(s.id)) merged.set(s.id, s); });
      shootsList.forEach((s) => { if (s && s.id && !s.demo && !removed.has(s.id)) merged.set(s.id, s); });
      const shoots = [...merged.values()];

      // Local wins wholesale above, which is right for everything a device can
      // actually edit — but the 480/960px variant paths are not edited, they
      // are generated at upload. A device whose local copy has lost them (an
      // older build dropped them through the edit form) would therefore
      // republish the album without them and unpublish working files for
      // everyone. Backfill from the published copy: additive only, never
      // overwriting a path the local record already has.
      const remoteById = new Map(remote.shoots.map((s) => [s && s.id, s]));
      for (const s of shoots) {
        const r = remoteById.get(s.id);
        if (!r) continue;
        // ...and the same additive rule for fields that may only exist in the
        // published copy, so publishing from a device whose record predates
        // them cannot clear them for every visitor.
        backfillPublishedOnlyFields(s, r);
        if (!Array.isArray(r.photos)) continue;
        const rPhotos = new Map(r.photos.map((p) => [p && p.id, p]));
        for (const p of s.photos || []) {
          const rp = rPhotos.get(p.id);
          if (!rp || rp.url !== p.url) continue; // different file — its variants aren't ours
          if (!p.small && rp.small) p.small = rp.small;
          if (!p.medium && rp.medium) p.medium = rp.medium;
          // Pose and usage by the same additive rule, but only where this
          // device never had the field at all. An empty angle is a deliberate
          // "Unspecified" from the edit form, and that must still publish.
          if (p.angle === undefined && rp.angle) p.angle = rp.angle;
          if (p.usage === undefined && rp.usage) p.usage = rp.usage;
          if (p.look === undefined && rp.look) p.look = rp.look;
          // Who is in the frame, by the same additive rule. An empty array is
          // a deliberate "nobody is tagged here yet" and still publishes.
          if (p.models === undefined && Array.isArray(rp.models)) p.models = rp.models;
        }
      }

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
      // Uploaded paths are staged here, keyed by the photo object itself, and
      // are NOT written onto that object until the commit is actually on the
      // branch. p.url doubles as the "already uploaded, skip it" marker, so
      // stamping it the moment a blob was created meant an interrupted publish
      // (an expired token, a dropped connection) left photos permanently
      // marked as uploaded — while their blobs, never referenced by any
      // commit, were garbage-collected by GitHub. Every later publish then
      // skipped them and wrote dangling paths into data.js, which is how
      // Sumitt Verma's album came to reference three images that did not
      // exist. Nothing here mutates local state; see the apply step after the
      // ref update below.
      const pendingPaths = new Map(); // photo object -> { url, small?, medium? }
      for (const s of shoots) {
        for (const p of s.photos || []) {
          if (p.url || !p.dataUrl) continue;
          const m = p.dataUrl.match(/^data:(image\/[a-z.+-]+);base64,/);
          if (!m) continue; // not a base64 image (e.g. demo SVG) — leave inline
          const dir = `photos/${s.id}`;
          const fullPath = `${dir}/${p.id}.${MIME_EXT[m[1]] || "jpg"}`;
          await commitBlob(fullPath, p.dataUrl.slice(m[0].length));
          const paths = { url: fullPath };
          // Responsive variants (JPEG). Skip a variant if it doesn't shrink.
          try {
            for (const [w, key] of [[480, "small"], [960, "medium"]]) {
              const variant = await resize(p.dataUrl, w, 0.8);
              const vm = variant.match(/^data:(image\/[a-z.+-]+);base64,/);
              if (variant !== p.dataUrl && vm) {
                const vPath = `${dir}/${p.id}@${w}.jpg`;
                await commitBlob(vPath, variant.slice(vm[0].length));
                paths[key] = vPath;
              }
            }
          } catch (err) { console.warn("variant gen failed for", p.id, err); }
          pendingPaths.set(p, paths);
          toast(`Uploading photos… (${photoEntries.length})`);
        }
      }

      // Published copy references photo files instead of inline base64. Paths
      // come from pendingPaths for anything uploaded in this run, and from
      // p.url for anything already published in an earlier one.
      const published = shoots.map((s) => ({
        ...s,
        photos: (s.photos || []).map((p) => {
          const fresh = pendingPaths.get(p) || {};
          const url = fresh.url || p.url;
          const small = fresh.small || p.small;
          const medium = fresh.medium || p.medium;
          return url
          ? {
              id: p.id, url, objectPosition: p.objectPosition || "center",
              ...(p.excludeFromCompCard ? { excludeFromCompCard: true } : {}),
              // Pose and usage decide which photos the Model Portfolio page and
              // its PDF may use. They were missing from this field list, so a
              // pose tagged in Upload stayed on the studio's device and no
              // visitor ever saw one: the portfolio PDF had nothing to offer.
              ...(p.angle ? { angle: p.angle } : {}),
              ...(p.usage ? { usage: p.usage } : {}),
              // The kind of work a photo was tagged as puts it on that page's grid.
              ...(p.look ? { look: p.look } : {}),
              // Who is in this frame. This is what sends one photograph to two
              // models' comp cards, so leaving it out of this list would have
              // repeated the pose-and-usage bug: tagged on the studio's device,
              // invisible to every visitor.
              ...(Array.isArray(p.models) && p.models.length ? { models: p.models } : {}),
              ...(small ? { small } : {}),
              ...(medium ? { medium } : {}),
              ...(p.caption ? { caption: p.caption } : {}),
              ...(typeof p.focalX === "number" ? { focalX: p.focalX, focalY: p.focalY } : {})
            }
          : p;
        }),
      }));
      // A booking record holds everything the client typed: their name, email,
      // phone, the shoot notes, the location, the money and the contract
      // number. All of it was being written into data.js, which is a plain file
      // on a public site and in a public repo — a stranger could read the
      // studio's client list (found in the Sep 2026 audit). A visitor's page
      // only ever asks "is this date taken, and how" (getCalDateStatus), so
      // that is all that leaves the device now.
      //
      // The studio's own copy of each booking stays in this browser's
      // localStorage and in the signed-contract emails. That does mean a
      // second device shows a date as taken without the client's name on it.
      const publicCalendarSettings = (settings) => {
        const src = settings || {};
        const dates = src.bookedDates || {};
        const safeDates = {};
        Object.keys(dates).forEach((key) => {
          const list = Array.isArray(dates[key]) ? dates[key] : [dates[key]];
          const kept = list.filter(Boolean).map((b) => ({
            id: b.id,
            // Worked out here rather than published as a name for the reader to
            // pattern-match ("Anticipated…", "Hold…"), which is why the name
            // used to have to travel.
            isTentative: !!(b.isTentative || b.status === "tentative"
              || /anticipated|tentative|hold/i.test(`${b.name || ""} ${b.type || ""}`)),
            // The kind of day it is, and nothing about who booked it.
            ...(b.status ? { status: b.status } : {}),
            ...(b.type ? { type: b.type } : {}),
            ...(b.contractVersion ? { contractVersion: b.contractVersion } : {}),
            // The album this day belongs to, when it came from one. Not personal
            // (the album is on the site), and syncCalendarWithShoots matches on
            // it: without it a second device cannot tell the published entry
            // from the one it derives itself, and books the day twice.
            ...(b.shootId ? { shootId: b.shootId } : {})
          }));
          if (kept.length) safeDates[key] = kept;
        });
        return { ...src, bookedDates: safeDates };
      };
      // Regenerate data.js in EXACTLY the committed format — same keys
      // (CALENDAR_SETTINGS included) and same trailing alias lines. The
      // parser and this generator must always agree on the file shape:
      // format drift between hand commits and auto-syncs is what previously
      // made parseShootsFromDataJs read a full portfolio as empty and let a
      // sync wipe albums published from other devices.
      const fileContent = `/* ============================================================
   nerdyphotographer.in — published portfolio data
   Auto-synced by the Admin Panel. Photo files live under photos/.
   ============================================================ */
window.WPS_DATA = ${JSON.stringify({ ACTIVITIES, TYPES, BRANDS, DEMO_SHOOTS: published, DELETED_IDS: [...removed].sort(), CALENDAR_SETTINGS: publicCalendarSettings(window.WPS_DATA && window.WPS_DATA.CALENDAR_SETTINGS),
        // Invite codes, promo codes and package rates used to live only in the
        // admin device's localStorage, which no visitor can read: a code
        // created in the panel worked for the studio and was rejected as
        // invalid for every client, and price edits never reached the booking
        // form. Publishing them here is what makes them real for everyone.
        ...(() => {
          // Prices, codes and rates are not merged item by item the way albums
          // and books are, so the publishing device's copy simply replaced the
          // live one: a price edited on the phone came back to the laptop's
          // older value the next time the laptop published anything. Each
          // setting now carries a stamp, and the newer side wins.
          const mine = {
            INVITE_CODES: (typeof window.getAdminInviteCodes === "function" ? window.getAdminInviteCodes() : []),
            PROMO_CODES: (typeof window.getAdminPromoCodes === "function" ? window.getAdminPromoCodes() : {}),
            PACKAGES: (typeof window.getAdminPackages === "function" ? window.getAdminPackages() : []),
            TFP_PACKAGE: (typeof window.getAdminTfpPackage === "function" ? window.getAdminTfpPackage() : null),
            HOME_STUDIO_RATE: (typeof window.getHomeStudioRate === "function" ? window.getHomeStudioRate() : 3000),
            PORTFOLIO_PDF: (typeof window.getPortfolioPdfSettings === "function" ? window.getPortfolioPdfSettings() : null),
            HOME_STUDIO_RATE_TFP: (function() {
              try {
                const v = localStorage.getItem("wps_home_studio_rate_tfp");
                if (v !== null && v !== "") {
                  const n = parseInt(v, 10);
                  if (!isNaN(n) && n >= 0) return n;
                }
                const pub = window.WPS_DATA && window.WPS_DATA.HOME_STUDIO_RATE_TFP;
                return (typeof pub === "number" && pub >= 0) ? pub : null;
              } catch (e) { return null; }
            })()
          };
          const liveVals = (remote && remote.settings) || {};
          const liveAt = (remote && remote.stamps) || {};
          const mineAt = (typeof window.localSettingStamps === "function") ? window.localSettingStamps() : {};
          const out = {}, keptAt = {};
          Object.keys(mine).forEach((k) => {
            const theirs = liveAt[k] || 0, ours = mineAt[k] || 0;
            const takeLive = theirs > ours && liveVals[k] !== undefined;
            out[k] = takeLive ? liveVals[k] : mine[k];
            keptAt[k] = takeLive ? theirs : ours;
            if (takeLive) console.info(`Publish: keeping the newer ${k} from the live site (changed on another device).`);
          });
          out.SETTINGS_AT = keptAt;
          return out;
        })(),
        // Saved studio portfolio books (book-builder.js), merged per book with
        // this device's drafts AND the live copy just fetched, never only the
        // copy this page happened to load.
        // What people have written about the studio, merged the same way as
        // the books below: per testimonial, against the copy just fetched, so
        // one device publishing never drops what another added.
        TESTIMONIALS: (typeof window.getTestimonials === "function" ? window.getTestimonials(remote.testimonials) : { items: [], deleted: [] }),
        // Who the studio photographs, merged per model the same way, so a
        // model added on the phone is not dropped by the next publish from
        // the laptop. Albums and photographs reference these by `key`.
        MODELS: (typeof window.getModels === "function" ? window.getModels(remote.models) : { items: [], deleted: [] }),
        MODEL_PDFS: (typeof window.getModelPdfs === "function" ? window.getModelPdfs(remote.modelPdfs) : { versions: [], deleted: [] }),
        STUDIO_PORTFOLIOS: (typeof window.getStudioPortfolios === "function" ? window.getStudioPortfolios(remote.studioPortfolios) : { versions: [], deleted: [] }),
        }, null, 2)};

// Explicit Global Aliases for Data Safety
window.ACTIVITIES = window.WPS_DATA.ACTIVITIES || [];
window.TYPES = window.WPS_DATA.TYPES || [];
window.BRANDS = window.WPS_DATA.BRANDS || [];
window.DEMO_SHOOTS = window.WPS_DATA.DEMO_SHOOTS || [];
window.SHOOTS = window.WPS_DATA.DEMO_SHOOTS || [];
window.MODELS = (window.WPS_DATA.MODELS && window.WPS_DATA.MODELS.items) || [];
`;

      // Round-trip self-test before anything is committed: the very parser
      // this app (and every visitor's background refresh) uses to read
      // data.js must get back exactly the albums being published. If it
      // can't, the file format has drifted — abort rather than publish a
      // portfolio the site itself would read as empty.
      const roundTrip = parseShootsFromDataJs(fileContent);
      if (!roundTrip || roundTrip.length !== published.length) {
        throw new Error(`Sync aborted before publishing: regenerated data.js failed its own read-back check (parsed ${roundTrip ? roundTrip.length : "nothing"}, expected ${published.length} albums). Nothing was changed.`);
      }
      // Independent shrink check: never publish fewer albums than are live
      // unless each missing one was explicitly deleted this session.
      const keptRemote = remote.shoots.filter(s => s && s.id && !s.demo && !removed.has(s.id)).length;
      if (published.length < keptRemote) {
        throw new Error(`Sync aborted: it would silently remove ${keptRemote - published.length} published album(s) that were not explicitly deleted. Nothing was changed.`);
      }
      // The same guard for testimonials. They are somebody's words, given
      // once and usually not recoverable by asking again, so the only way the
      // count may fall is a deletion this session recorded in `deleted`.
      try {
        const liveT = cleanTestimonials(remote.testimonials);
        // Read back out of the file about to be committed, not out of the
        // variable that wrote it: this is the round-trip check as well as the
        // count check, so a key the generator mangled is caught here too.
        const mineT = cleanTestimonials(parseObjectAfterKey(fileContent, '"TESTIMONIALS"'));
        const goneT = new Set(mineT.deleted);
        const keptT = liveT.items.filter((t) => !goneT.has(t.id)).length;
        if (mineT.items.length < keptT) {
          throw new Error(`Sync aborted: it would silently remove ${keptT - mineT.items.length} published testimonial(s) that were not deleted here. Nothing was changed.`);
        }
      } catch (err) {
        if (/Sync aborted/.test(err.message)) throw err;
        console.warn("Publish: could not check the testimonial count —", err.message);
      }

      // One atomic commit: photo blobs + regenerated data.js + the files no
      // album uses any more.
      const ref = await ghApi(pat, `/git/ref/heads/${GH_BRANCH}`);
      const baseCommit = await ghApi(pat, `/git/commits/${ref.object.sha}`);

      /* Deleting an album or a photo used to take it off the pages and leave
         the file itself on the site for ever, at the same address and in the
         public repo — 132 such files had built up by Sep 2026, including every
         photo of four deleted albums. A model asking to be taken down was not
         actually taken down. So a publish now also removes the picture files
         that nothing published points at.

         The list it compares against is the MERGED one being published (this
         device's albums plus every album live on the site), which is the same
         list that decides what stays on the site at all — so a file can only
         be dropped when no album anywhere refers to it. Two more guards: the
         album count checks above have already run, and a publish that somehow
         referenced nothing at all deletes nothing. */
      let removedFiles = [];
      try {
        const referenced = new Set();
        published.forEach((s) => (s.photos || []).forEach((p) => {
          [p && p.url, p && p.small, p && p.medium].forEach((u) => {
            if (u) referenced.add(String(u).replace(/^\//, ""));
          });
        }));
        if (referenced.size) {
          const treeNow = await ghApi(pat, `/git/trees/${baseCommit.tree.sha}?recursive=1`);
          // Only files inside an album's own folder — photos/<albumId>/<file>.
          // Anything else under photos/ belongs to the site rather than to an
          // album, and no album will ever "reference" it: photos/og/ holds the
          // wide crops that WhatsApp and Google show for a link, and the first
          // publish after they were added deleted all ten of them (d3ddcb7,
          // Sep 2026). A folder this code does not own is not its to tidy.
          const tracked = (treeNow.tree || []).filter((t) =>
            t && t.type === "blob" && /^photos\/[^/]+\/[^/]+$/.test(t.path) && !/^photos\/og\//.test(t.path));
          // A photo added by THIS publish is not in the base tree yet, so it
          // can never be caught here.
          removedFiles = tracked.filter((t) => !referenced.has(t.path)).map((t) => t.path);
          if (treeNow.truncated) {
            console.warn("Publish: the repository listing was truncated, so unused photo files were left alone this time.");
            removedFiles = [];
          }
        }
      } catch (err) {
        // Housekeeping must never cost the studio a publish.
        console.warn("Publish: could not work out which photo files are unused —", err.message);
        removedFiles = [];
      }
      if (removedFiles.length) console.info(`Publish: removing ${removedFiles.length} photo file(s) no album uses any more.`);

      const tree = await ghApi(pat, "/git/trees", {
        method: "POST",
        body: JSON.stringify({
          base_tree: baseCommit.tree.sha,
          tree: [
            ...photoEntries,
            { path: "data.js", mode: "100644", type: "blob", content: fileContent },
            // sha: null is how the tree API says "this path is gone".
            ...removedFiles.map((path) => ({ path, mode: "100644", type: "blob", sha: null })),
          ],
        }),
      });
      const commit = await ghApi(pat, "/git/commits", {
        method: "POST",
        body: JSON.stringify({ message: `Auto-sync portfolio data from Admin Panel${removedFiles.length ? ` (and ${removedFiles.length} unused photo file${removedFiles.length === 1 ? "" : "s"} removed)` : ""}`, tree: tree.sha, parents: [ref.object.sha] }),
      });
      await ghApi(pat, `/git/refs/heads/${GH_BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });

      // The branch now points at a commit that contains these blobs, so the
      // paths are finally real — only now is it safe to mark these photos as
      // uploaded. Everything above this line is side-effect free with respect
      // to local state: if any step threw, the catch runs, these assignments
      // never happen, the photos keep their base64 and simply upload again on
      // the next publish.
      for (const [photo, paths] of pendingPaths) Object.assign(photo, paths);

      // Bring this browser up to date with the merged result (photo URLs,
      // shoots that only existed on the other device, and the full published
      // tombstone list so this session's merges retire remotely-deleted
      // albums immediately).
      try {
        if (window.WPS_DATA) window.WPS_DATA.DELETED_IDS = [...removed].sort();
        for (const s of shoots) await putShoot(s);
        await loadShoots();
        render();
      } catch {}

      toast("Sync complete! Changes go live for everyone within a few minutes.");
      return true;
    } catch (e) {
      console.error(e);
      // Abort-guard messages ("Sync aborted…", "…aborting to avoid
      // overwriting…") explain exactly why nothing was published — show them
      // verbatim instead of the generic connection hint.
      toast(e.message && (e.userFacing || /401|abort/i.test(e.message)) ? e.message : "GitHub sync failed — changes are saved locally. Check the token and connection, then publish again.");
      return false;
    }
  }

  /* ---- admin banner & reminders ---- */
  function getUpcomingBookings() {
    const settings = window.WPS_DATA?.CALENDAR_SETTINGS || {};
    const booked = settings.bookedDates || {};
    const now = new Date();
    now.setHours(0,0,0,0);
    const todayKey = getCalDateKey(now);

    const upcoming = [];
    Object.keys(booked).forEach(dKey => {
      if (dKey >= todayKey) {
        const parts = dKey.split("-").map(Number);
        const dObj = new Date(parts[0], parts[1] - 1, parts[2]);
        const diffMs = dObj - now;
        const diffDays = Math.round(diffMs / 86400000);
        
        (booked[dKey] || []).forEach(b => {
          upcoming.push({
            dateKey: dKey,
            dateObj: dObj,
            diffDays: diffDays,
            dayLabel: diffDays === 0 ? "TODAY" : diffDays === 1 ? "TOMORROW" : `In ${diffDays} days`,
            ...b
          });
        });
      }
    });

    upcoming.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    return upcoming;
  }

  // The fixed header sits below the fixed admin banner by exactly the
  // banner's height. That height changes when the banner wraps (narrower
  // window, fonts arriving, zoom), so it is tracked live rather than
  // measured once; otherwise a strip of page shows between the two.
  let adminBannerObserver = null;
  function syncAdminBannerOffset() {
    const banner = document.getElementById("adminStickyReminderBar");
    const h = banner && banner.style.display !== "none" ? banner.offsetHeight : 0;
    const hdr = document.querySelector(".site-header");
    if (hdr) hdr.style.top = h ? h + "px" : "";
    if (h) document.documentElement.style.setProperty("--admin-banner-h", h + "px");
    else document.documentElement.style.removeProperty("--admin-banner-h");
  }
  function watchAdminBanner(banner) {
    if (adminBannerObserver || !("ResizeObserver" in window)) return;
    adminBannerObserver = new ResizeObserver(() => syncAdminBannerOffset());
    adminBannerObserver.observe(banner);
    window.addEventListener("resize", syncAdminBannerOffset);
  }
  function updateAdminReminders() {
    const active = isAdmin();
    let banner = $("#adminStickyReminderBar");

    if (!active) {
      if (banner) banner.style.display = "none";
      syncAdminBannerOffset();
      const pillWrap = $("#adminHeaderPillWrap");
      if (pillWrap) pillWrap.style.display = "none";
      return;
    }

    const upcoming = getUpcomingBookings();

    // 1. Sticky Banner
    if (upcoming.length) {
      const nextShoot = upcoming[0];
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "adminStickyReminderBar";
        banner.className = "admin-sticky-reminder";
        document.body.insertBefore(banner, document.body.firstChild);
      }
      banner.style.display = "flex";
      banner.innerHTML = `
        <div class="reminder-text">
          <span class="reminder-badge">${esc(nextShoot.dayLabel)}</span>
          <!-- Split so the phone layout can keep just the badge + name on one
               line and drop the rest (it is one tap away behind Details);
               at full width the banner wrapped to three lines and took a
               fifth of every admin screen. -->
          <span class="reminder-main"><strong>${esc(nextShoot.name)}</strong></span>
          <span class="reminder-detail">· ${esc(nextShoot.dateKey)} · ${esc(nextShoot.type || "Shoot")} · ⏱️ ${esc(nextShoot.duration || "Full Day")}${nextShoot.phone ? ` · 📞 ${esc(nextShoot.phone)}` : ""}</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button type="button" class="reminder-btn" id="viewNextShootBtn">👁 Details</button>
          <button type="button" class="reminder-btn" id="dismissReminderBtn" title="Dismiss banner">&times;</button>
        </div>
      `;

      // Push site-header below the banner so it doesn't block the nav
      requestAnimationFrame(syncAdminBannerOffset);
      watchAdminBanner(banner);

      banner.querySelector("#viewNextShootBtn")?.addEventListener("click", () => {
        if (typeof window.openDateAdminModal === "function") {
          window.openDateAdminModal(nextShoot.dateKey);
        } else {
          location.href = "/calendar";
        }
      });
      banner.querySelector("#dismissReminderBtn")?.addEventListener("click", () => {
        banner.style.display = "none";
        syncAdminBannerOffset();
      });
    } else if (banner) {
      banner.style.display = "none";
      syncAdminBannerOffset();
    }

    // 2. Header Dropdown Widget in navAdminSec
    const adminSec = $("#navAdminSec");
    if (adminSec) {
      let pillWrap = $("#adminHeaderPillWrap");
      if (!pillWrap) {
        pillWrap = document.createElement("div");
        pillWrap.id = "adminHeaderPillWrap";
        pillWrap.className = "admin-header-pill-wrap";
        pillWrap.style.marginTop = "8px";
        adminSec.appendChild(pillWrap);
      }
      pillWrap.style.display = "block";
      pillWrap.innerHTML = `
        <div class="admin-header-pill" id="adminHeaderPill">
          <span>📅 Upcoming Shoots</span>
          <span class="count-badge">${upcoming.length}</span>
        </div>
        <div class="admin-shoots-dropdown" id="adminShootsDropdown">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 6px;">
            <strong style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm);">Upcoming Shoots (${upcoming.length})</strong>
            <div style="display: flex; gap: 12px; align-items: center;">
              <a href="/calendar" data-link style="font-family: var(--mono-font); font-size: var(--font-xs); color: var(--accent-text); font-weight: 700; text-decoration: none;">View Full Calendar &rarr;</a>
              <a href="/contracts" data-link style="font-family: var(--mono-font); font-size: var(--font-xs); color: #059669; font-weight: 700; text-decoration: none;">✅ Contracts &rarr;</a>
            </div>
          </div>
          ${upcoming.length ? upcoming.slice(0, 5).map(b => `
            <div style="padding: 8px; background: var(--bone); border-radius: 6px; border: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-family: var(--mono-font); font-size: var(--font-xs); color: var(--accent-text); font-weight: 700;">📅 ${esc(b.dateKey)} (${esc(b.dayLabel)})</div>
                <strong style="font-size: var(--font-xs); color: var(--ink);">${esc(b.name)}</strong>
                <div style="font-size: var(--font-xs); color: var(--ink-soft);">${esc(b.type)} · ⏱️ ${esc(b.duration || "Full Day")} ${b.phone ? `· 📞 ${esc(b.phone)}` : ""}</div>
              </div>
              <button type="button" class="admin-cal-btn" onclick="if (typeof window.openDateAdminModal === 'function') window.openDateAdminModal('${b.dateKey}');" style="font-size: var(--font-xs); padding: 3px 6px;">Details</button>
            </div>
          `).join("") : `
            <div style="font-size: var(--font-xs); color: var(--ink-soft); text-align: center; padding: 12px;">No upcoming client shoots scheduled.</div>
          `}
        </div>
      `;

      const pill = pillWrap.querySelector("#adminHeaderPill");
      const dropdown = pillWrap.querySelector("#adminShootsDropdown");
      if (pill && dropdown) {
        pill.addEventListener("click", (e) => {
          e.stopPropagation();
          dropdown.classList.toggle("open");
        });
        document.addEventListener("click", (e) => {
          if (!pillWrap.contains(e.target)) dropdown.classList.remove("open");
        });
      }
    }
  }


  /* ---- studio settings modal ---- */
  let studioSettingsWired = false;
  function initStudioSettingsControls() {
    if (studioSettingsWired) return;
    studioSettingsWired = true;
    // Belt as well as braces: the button is hidden for visitors above, and the
    // editor refuses to open for one even if the button is reached some other
    // way.
    const modal = $("#studioSettingsModal");
    const btn = $("#studioSettingsBtn");
    if (btn && !isAdmin()) btn.setAttribute("hidden", "");
    const closeBtn = $("#studioSettingsClose");
    const saveBtn = $("#studioSettingsSave");
    const instagramInput = $("#studio_instagram_input");
    const kavyarInput = $("#studio_kavyar_input");
    const instagramVerify = $("#studio_instagram_verify");
    const kavyarVerify = $("#studio_kavyar_verify");

    if (!btn) return;

    function updateVerifyLinks() {
      const inst = instagramInput?.value.trim() || "";
      const kav = kavyarInput?.value.trim() || "";

      if (inst) {
        const url = inst.startsWith("http") ? inst : "https://instagram.com/" + inst;
        instagramVerify.innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener" style="color:var(--accent-text); font-weight:600; text-decoration:underline;">Test Instagram ↗</a>`;
      } else {
        instagramVerify.innerHTML = "";
      }

      if (kav) {
        const url = kav.startsWith("http") ? kav : "https://" + kav;
        kavyarVerify.innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener" style="color:var(--accent-text); font-weight:600; text-decoration:underline;">Test Kavyar ↗</a>`;
      } else {
        kavyarVerify.innerHTML = "";
      }
    }

    btn.addEventListener("click", () => {
      instagramInput.value = STUDIO_CONFIG.instagram || "";
      kavyarInput.value = STUDIO_CONFIG.kavyar || "";
      updateVerifyLinks();
      modal.style.display = "flex";
    });

    closeBtn?.addEventListener("click", () => {
      modal.style.display = "none";
    });

    modal?.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });

    instagramInput?.addEventListener("input", updateVerifyLinks);
    kavyarInput?.addEventListener("input", updateVerifyLinks);

    saveBtn?.addEventListener("click", async () => {
      const inst = instagramInput?.value.trim() || "";
      const kav = kavyarInput?.value.trim() || "";

      if (!inst || !kav) {
        toast("Both Instagram and Kavyar links are required.");
        return;
      }

      STUDIO_CONFIG.instagram = inst;
      STUDIO_CONFIG.kavyar = kav;
      toast("Studio links updated.");
      modal.style.display = "none";
      render();
    });
  }


  /* ---- contracts + calendar views + wiring ---- */

  /* ============================================================
     § ADMIN CALENDAR & BOOKING MANAGEMENT PAGE (/calendar)
     ============================================================ */

  /* ============================================================
     § ADMIN CONTRACT VAULT PAGE (/contracts)
     ============================================================ */
  function viewContracts() {
    // Gather all bookings that have an agreed contract. Read the live calendar
    // store (persisted as "wps-calendar-settings") — an older version read a
    // "wps-cal-bookings" key that nothing ever wrote, so the vault always came
    // up empty. Reading the in-memory store rather than localStorage directly
    // also picks up anything signed earlier in this same session.
    //
    // The match is deliberately broad: bookings signed through the contract
    // pipeline carry `agreedContract`/`sigDataUrl`, while ones entered by hand
    // in the admin panel only ever get `agreedToTerms`/`contractVersion`.
    // Testing just one pair hides half the roster.
    let allSigned = [];
    try {
      const allBookings = window.WPS_DATA?.CALENDAR_SETTINGS?.bookedDates || {}; // { dateKey: [booking, ...] }
      Object.entries(allBookings).forEach(([dateKey, bookings]) => {
        (bookings || []).forEach(b => {
          const signed = b.agreedContract || b.sigDataUrl || b.agreedToTerms ||
            (b.contractVersion && b.contractVersion !== "Pending Agreement");
          if (signed) {
            allSigned.push({ ...b, dateKey });
          }
        });
      });
      // newest first
      allSigned.sort((a, b) => (b.dateKey || "").localeCompare(a.dateKey || ""));
    } catch (e) { /* ignore */ }

    const emailStatuses = getContractEmailStatuses();
    const emailBadge = (contractNumber) => {
      const st = contractNumber && emailStatuses[contractNumber] && emailStatuses[contractNumber].status;
      if (st === "sent") return `<div style="font-family: var(--mono-font); font-size: var(--font-xs); color: #059669; font-weight: 700;">📧 Contract PDF emailed (studio + client copy)</div>`;
      if (st === "failed") return `<div style="font-family: var(--mono-font); font-size: var(--font-xs); color: #dc2626; font-weight: 700;">⚠️ Contract email FAILED — no PDF copy was delivered</div>`;
      return "";
    };

    const rows = allSigned.length ? allSigned.map(b => `
      <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
          <div>
            <div style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">${esc(b.name || '—')}</div>
            <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 2px;">
              📅 ${esc(b.dateKey || '—')} &nbsp;·&nbsp; ${esc(b.type || '—')}
              ${b.email ? `&nbsp;·&nbsp; ✉️ ${esc(b.email)}` : ''}
              ${b.phone ? `&nbsp;·&nbsp; 📞 ${esc(b.phone)}` : ''}
            </div>
            ${b.contractNumber ? `<div style="margin-top: 6px; font-family: var(--mono-font); font-size: var(--font-xs); color: var(--accent-text); font-weight: 700;">Contract #: ${esc(b.contractNumber)}</div>` : ''}
          </div>
          <button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('${esc(b.dateKey)}', '${esc(b.id || '')}')" style="border-color: var(--accent-text); color: var(--accent-text); font-size: var(--font-xs); padding: 4px 10px; font-weight: 700; white-space: nowrap;">📄 Generate PDF</button>
        </div>
        ${b.agreedContract ? `<div style="font-family: var(--mono-font); font-size: var(--font-xs); color: #059669; font-weight: 700;">✅ ${esc(b.agreedContract)}</div>` : ''}
        ${emailBadge(b.contractNumber)}
        ${isSigImage(b.sigDataUrl) ? `
          <div>
            <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-bottom: 4px; font-weight: 600;">Digital Signature:</div>
            <img src="${b.sigDataUrl}" style="max-height: 48px; max-width: 220px; border-bottom: 1.5px solid var(--line); display: block; background: var(--bone); padding: 4px;" alt="Client signature" />
          </div>
        ` : (b.agreementMethod === "checkbox"
            ? '<div style="font-size: var(--font-xs); color: var(--accent-text); font-weight: 700;">\u2713 Agreed via checkbox \u2014 Studio Terms V3.3 accepted</div>'
            : '<div style="font-size: var(--font-xs); color: var(--ink-soft); font-style: italic;">No digital signature captured (email/DM consent)</div>')}
      </div>
    `).join('') : `
      <div style="text-align: center; padding: 48px 20px; color: var(--ink-soft); font-size: var(--font-sm);">
        <div style="font-size: 2.4rem; margin-bottom: 12px;">📭</div>
        <div style="font-weight: 700; margin-bottom: 6px;">No signed contracts yet</div>
        <div style="font-size: var(--font-xs);">Agreed bookings will appear here automatically after a client signs and submits.</div>
      </div>
    `;

    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">🔒 Admin · Contract Vault</p>
          ${kineticH1("Signed Contracts", "kinetic-h1-wide")}
          <p class="page-sub reveal" style="max-width: 600px; line-height: 1.6; opacity: 1 !important; visibility: visible !important; transform: none !important;">All bookings where a client has digitally agreed to studio contract terms. Signature images, contract references, and PDF generation are available per record.</p>
        </div>
      </section>
      <section class="section container" style="max-width: 900px; margin: 0 auto; border-bottom: 1px solid var(--line); padding-bottom: 36px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
          <div>
            <p class="eyebrow" style="margin-bottom: 4px; color: var(--accent-text);">Legal Compliance &amp; Version Control</p>
            <h2 style="font-family: 'Archivo', sans-serif; font-size: var(--font-md); font-weight: 700; margin: 0;">📜 Studio Contract &amp; Terms Vault</h2>
          </div>
          <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); background: var(--accent-soft); padding: 4px 10px; border-radius: 4px; border: 1px solid var(--accent);">8 Historical Contract Versions Preserved</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
          <div style="background: var(--paper); border: 1.5px solid var(--accent); border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--accent); color: #fff; padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.7 COMMERCIAL (ACTIVE)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Aug 2026 – Present</span>
            </div>
            <h3 style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">💼 Commercial Shoot Agreement V3.7</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Paid Commercial, Editorial, Fashion &amp; Brand. 50/50 &amp; 50/30/20 retainer milestones (studio rental due in full with the advance), Client/photographer studio-arranger choice with a photographer-arranged studio quoted in advance, commercial licensing, travel &gt;20km, gear &amp; media protection.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.7-COMMERCIAL')" style="font-size: var(--font-xs); flex: 1; font-weight: 700;">👁 Review Commercial</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '')" style="font-size: var(--font-xs); border-color: var(--accent-text); color: var(--accent-text); font-weight: 700;">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1.5px solid #059669; border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: #059669; color: #fff; padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.7 TFP / TEST SHOOT (ACTIVE)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Aug 2026 – Present</span>
            </div>
            <h3 style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">📸 Test Shoot &amp; TFP Release V3.7</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Selective Collaborations via Invite Codes. Non-commercial portfolio licensing, 8-12 retouched caps, Instagram credit, Participant/photographer studio-arranger choice, studio rental quoted in advance, liability waiver, gear protection.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.7-TFP')" style="font-size: var(--font-xs); flex: 1; font-weight: 700; background: #059669; border-color: #059669;">👁 Review TFP Release</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.7-TFP')" style="font-size: var(--font-xs); border-color: #059669; color: #059669; font-weight: 700;">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.6 COMMERCIAL (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Aug 2026 – Sep 2026</span>
            </div>
            <h3 style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">💼 Commercial Shoot Agreement V3.6</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Superseded by V3.7. Same terms, but a photographer-arranged external studio was passed through at cost (billed at actuals). Bookings agreed under it print these terms.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn" onclick="window.openContractArchiveModal('V3.6-COMMERCIAL')" style="font-size: var(--font-xs); flex: 1;">👁 Review</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.6-COMMERCIAL')" style="font-size: var(--font-xs);">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.6 TFP / TEST SHOOT (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Sep 2026</span>
            </div>
            <h3 style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">📸 Test Shoot &amp; TFP Release V3.6</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Superseded by V3.7-TFP. Same release with a 20 km travel radius. Bookings agreed under it print these terms.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn" onclick="window.openContractArchiveModal('V3.6-TFP')" style="font-size: var(--font-xs); flex: 1;">👁 Review</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.6-TFP')" style="font-size: var(--font-xs);">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.5 TFP / TEST SHOOT (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Aug 2026 – Sep 2026</span>
            </div>
            <h3 style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">📸 Test Shoot &amp; TFP Release V3.5</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Superseded by V3.6-TFP. Same release, but studio rental and a photographer-arranged studio were billed at actuals. Bookings agreed under it print these terms.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn" onclick="window.openContractArchiveModal('V3.5-TFP')" style="font-size: var(--font-xs); flex: 1;">👁 Review</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.5-TFP')" style="font-size: var(--font-xs);">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.2 (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">May 2026 – Aug 2026</span>
            </div>
            <h3 style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">Studio Release &amp; Payment Terms V3.2</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">50/50 &amp; 50/30/20 milestones, RAW exclusion, Test Shoot specs, Studio Space Rental, social media attribution.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.2')" style="font-size: var(--font-xs); flex: 1; font-weight: 700;">👁 Review V3.2</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.2')" style="font-size: var(--font-xs); border-color: var(--accent-text); color: var(--accent-text); font-weight: 700;">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.1 (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">May 2026 – Jul 2026</span>
            </div>
            <h3 style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">TFP Production &amp; Portfolio Release V3.1</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Standard TFP portfolio licensing, model release, basic liability waiver, mandatory credit block.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.1')" style="font-size: var(--font-xs); flex: 1; font-weight: 700;">👁 Review V3.1</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.1')" style="font-size: var(--font-xs); border-color: var(--accent-text); color: var(--accent-text); font-weight: 700;">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.0 (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Jan 2026 – Apr 2026</span>
            </div>
            <h3 style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">Creative Collab &amp; Release V3.0</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Initial TFP structure, non-exclusive social media license, and studio rules.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.0')" style="font-size: var(--font-xs); flex: 1; font-weight: 700;">👁 Review V3.0</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.0')" style="font-size: var(--font-xs); border-color: var(--accent-text); color: var(--accent-text); font-weight: 700;">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V2.0 (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Jun 2025 – Dec 2025</span>
            </div>
            <h3 style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">Studio Model Release V2.0</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Early model release covering digital distribution, copyright ownership, promo usage.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V2.0')" style="font-size: var(--font-xs); flex: 1; font-weight: 700;">👁 Review V2.0</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V2.0')" style="font-size: var(--font-xs); border-color: var(--accent-text); color: var(--accent-text); font-weight: 700;">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V1.0 (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Jan 2025 – May 2025</span>
            </div>
            <h3 style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">Basic Photography Release V1.0</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Foundational photo release and copyright acknowledgment for early studio testing.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V1.0')" style="font-size: var(--font-xs); flex: 1; font-weight: 700;">👁 Review V1.0</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V1.0')" style="font-size: var(--font-xs); border-color: var(--accent-text); color: var(--accent-text); font-weight: 700;">📄 Print PDF</button></div>
          </div>
        </div>
      </section>
      <section class="section container" style="max-width: 900px; margin: 0 auto; padding-top: 36px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
          <span style="font-family: var(--mono-font); font-size: var(--font-xs); color: var(--ink-soft); font-weight: 700;">${allSigned.length} SIGNED RECORD${allSigned.length !== 1 ? 'S' : ''}</span>
          <a href="/calendar" data-link class="admin-cal-btn" style="font-size: var(--font-xs); font-weight: 700;">← Back to Calendar</a>
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${rows}
        </div>
      </section>
      <section class="section container" style="max-width: 900px; margin: 0 auto; padding-top: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; flex-wrap: wrap; gap: 10px;">
          <div>
            <p class="eyebrow" style="margin: 0 0 6px; color: var(--accent-text);">Contract Audit Trail</p>
            <h3 style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 0;">Audit Records — this browser</h3>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
          ${getLocalContractAudits().length ? getLocalContractAudits().map(a => `
            <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 8px;">
              <div style="display:flex; justify-content: space-between; align-items:flex-start; gap: 8px; flex-wrap: wrap;">
                <div>
                  <div style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">${esc(a.clientName || 'Unknown')}</div>
                  <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 2px;">${esc(a.contractVersion || '—')} · ${esc(a.date || '—')}</div>
                </div>
                ${a.contractNumber ? `<span style="font-family: var(--mono-font); font-size: var(--font-xs); color: var(--accent-text); font-weight: 700;">${esc(a.contractNumber)}</span>` : ''}
              </div>
              <div style="font-size: var(--font-xs); color: var(--ink-soft);">${a.clientEmail ? `✉️ ${esc(a.clientEmail)}` : ''} ${a.phone ? `· 📞 ${esc(a.phone)}` : ''}</div>
              <div style="font-size: var(--font-xs); color: var(--ink-soft);">Signed: ${a.sigCaptured ? 'Yes' : 'No'} · Recorded: ${new Date(a.timestamp || '').toLocaleString() || 'Unknown'}</div>
              ${emailBadge(a.contractNumber)}
              <div style="font-size: var(--font-xs); color: var(--ink-soft);">Notes: ${esc(a.notes || 'No notes')}</div>
            </div>
          `).join('') : `
            <div style="text-align: center; padding: 28px 18px; color: var(--ink-soft); font-size: var(--font-sm); background: var(--bone); border: 1px dashed var(--line); border-radius: 10px;">
              <div style="font-size: 2rem; margin-bottom: 12px;">🧾</div>
              <div style="font-weight: 700; margin-bottom: 6px;">No local audit records yet</div>
              <div style="font-size: var(--font-xs);">Signed contract acceptances are stored locally after record creation. They remain visible here once a client completes the booking request.</div>
            </div>
          `}
        </div>
      </section>
    `;
  }

  // window.loadServerContractRecords lived here: it prompted for the admin
  // passcode and sent it in the query string to the never-deployed Render
  // host, so it could only ever fail. Removed in v443 with the rest of that
  // backend. The signed contracts themselves are in the studio's Gmail.

  /* ============================================================
     § ADMIN CALENDAR & BOOKING MANAGEMENT PAGE (/calendar)
     ============================================================ */
  function viewCalendar() {
    return `
      <section class="page-head admin-page-head">
        <div class="container admin-title-row">
          <div>
            <p class="eyebrow">Admin · Calendar</p>
            <h1 class="admin-h1">Studio availability</h1>
            <p class="admin-sub">Weekdays are closed to clients by default and weekends are open. Tap a day to block it, hold it, or add a booking.</p>
          </div>
          <div class="admin-title-actions">
            <button type="button" class="admin-cal-btn" id="adminCalNewBookingBtn">Add booking</button>
            <!-- Until this existed, calendar edits were saved to this device
                 only: syncToGitHub had no caller anywhere in the calendar UI,
                 so bookings never reached data.js and every visitor kept
                 seeing the studio as fully open. -->
            <button type="button" class="admin-cal-btn primary" id="adminCalPublishBtn" title="Push this calendar to the live site so visitors see booked dates">Publish to live site</button>
          </div>
        </div>
      </section>
      <section class="section container admin-calendar-wrap">
        <div class="admin-cal-card">
        <div class="admin-calendar-header">
          <div class="admin-cal-nav">
            <button type="button" class="admin-cal-btn" id="adminCalPrev">‹ Prev</button>
            <h2 class="admin-cal-title" id="adminCalMonthTitle">Loading...</h2>
            <button type="button" class="admin-cal-btn" id="adminCalNext">Next ›</button>
            <button type="button" class="admin-cal-btn" id="adminCalToday">Today</button>
          </div>
          <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <div class="admin-cal-terms">
              <span>Payment terms</span>
              <div class="admin-cal-seg">
                <button type="button" id="adminPay5050Btn" class="admin-cal-btn" style="cursor: pointer;">50 / 50</button>
                <button type="button" id="adminPay503020Btn" class="admin-cal-btn" style="cursor: pointer;">50 / 30 / 20</button>
                <button type="button" id="adminPay50301010Btn" class="admin-cal-btn" style="cursor: pointer;">50 / 30 / 10 / 10</button>
              </div>
            </div>
            <div class="admin-cal-terms">
              <span>Campaign / production terms</span>
              <div class="admin-cal-seg">
                <button type="button" id="adminProd503020Btn" class="admin-cal-btn" style="cursor: pointer;">50 / 30 / 20</button>
                <button type="button" id="adminProd50301010Btn" class="admin-cal-btn" style="cursor: pointer;">50 / 30 / 10 / 10</button>
              </div>
            </div>
            <button type="button" class="admin-cal-btn" id="adminCalResetBtn">Reset rules</button>
          </div>
        </div>

        <div class="admin-cal-legend">
          <span><i style="background: #2F6B4F;"></i>Open</span>
          <span><i style="background: #A9AAB1;"></i>Blocked (weekdays by default)</span>
          <span><i style="background: #D24E1A;"></i>Booked</span>
          <span><i style="background: #2C6BB5;"></i>Test shoot</span>
          <span><i style="background: #6B5BD2;"></i>Hold</span>
          <span><i style="background: #B7791F;"></i>Workshop</span>
          <span><i style="background: #B23A5A;"></i>Assisting</span>
        </div>

        <div id="adminCalGridContainer"></div>
        </div>

        <div id="adminRosterWrap">
          <div class="admin-roster-head">
            <h3 class="admin-roster-title">Upcoming</h3>
            <span id="rosterCountBadge" style="font-family: var(--mono-font); font-size: var(--font-xs); color: var(--ink-soft); font-weight: 700;"></span>
          </div>
          <div id="bookingRosterGrid" class="booking-list"></div>
        </div>

        <div class="admin-settings">
          <h3 class="admin-roster-title" style="margin-bottom: 12px;">Settings</h3>
        <div class="admin-panel">
          <div class="admin-panel-head" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; cursor: pointer; user-select: none;" onclick="const b=document.getElementById('adminPkgBody');const a=document.getElementById('adminPkgArrow');const open=b.style.display!=='none';b.style.display=open?'none':'block';a.textContent=open?'▼':'▲';">
            <span style="display: flex; align-items: center; gap: 8px;">Package rates &amp; deliverables</span>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <button type="button" class="admin-cal-btn primary" onclick="event.stopPropagation();window.saveAdminCustomPackages()">Save &amp; push live</button>
              <button type="button" class="admin-cal-btn" onclick="event.stopPropagation();window.resetAdminCustomPackages()" title="Reset to defaults">Reset</button>
              <span id="adminPkgArrow" style="font-size: var(--font-xs); color: var(--ink-soft); font-weight: 700;">▼</span>
            </div>
          </div>
          <div id="adminPkgBody" style="display: none; margin-top: 12px;">
            <span id="adminPricingSaveStatus" class="admin-save-status" style="font-size: var(--font-xs); font-weight: 700; color: #059669; background: rgba(5,150,105,0.12); padding: 4px 10px; border-radius: 12px; border: 1px solid #059669; font-family: var(--mono-font); display: inline-block; margin-bottom: 8px;">🟢 ALL CHANGES SAVED TO LIVE SITE</span>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0 0 12px 0;">Edit max package rates (INR), package names, or deliverable descriptions. Click <strong>Save &amp; Push Live</strong> to update booking forms.</p>
            <div style="background: var(--paper); border: 1px solid var(--accent); border-radius: 8px; padding: 12px 16px; margin-bottom: 12px;">
              <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); display: block; margin-bottom: 4px; text-transform: uppercase;">🏠 Home Studio Rental (Sector 46, Noida)</span>
              <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0 0 8px 0; font-family: 'Archivo', sans-serif;">Charged when someone picks the home studio, and shown as its own line in their quote. Set <strong>0</strong> to switch it off. An invite code that locks a venue carries its own price and ignores both of these.</p>
              <div style="display: flex; align-items: flex-end; gap: 18px; flex-wrap: wrap;">
                <div>
                  <span style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft); display: block; margin-bottom: 4px; text-transform: uppercase;">Paid shoots</span>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 800; color: #059669; font-size: var(--font-sm);">₹</span>
                    <input type="number" id="homeStudioRateInput" min="0" step="500" value="${getHomeStudioRate()}" oninput="window.markUnsavedChanges && window.markUnsavedChanges()" style="width: 140px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); font-weight: 800; color: #059669; background: var(--bone);" />
                  </div>
                </div>
                <div>
                  <span style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft); display: block; margin-bottom: 4px; text-transform: uppercase;">Test shoots (TFP)</span>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 800; color: #059669; font-size: var(--font-sm);">₹</span>
                    <input type="number" id="homeStudioRateTfpInput" min="0" step="500" placeholder="same as paid" value="${(function(){ try { const v = localStorage.getItem("wps_home_studio_rate_tfp"); if (v !== null && v !== "") return v; const p = window.WPS_DATA && window.WPS_DATA.HOME_STUDIO_RATE_TFP; return (typeof p === "number") ? p : ""; } catch(e) { return ""; } })()}" oninput="window.markUnsavedChanges && window.markUnsavedChanges()" style="width: 140px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); font-weight: 800; color: #059669; background: var(--bone);" />
                  </div>
                </div>
              </div>
              <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 8px 0 0 0; font-family: 'Archivo', sans-serif;">Leave the test-shoot box <strong>empty</strong> and collaborations pay the same as paid shoots.</p>
            </div>
            <div id="adminPackagesEditorGrid" style="display: flex; flex-direction: column; gap: 8px;"></div>
          </div>
        </div>

        <!-- What a client pays to download the portfolio PDF they build on the
             Model Portfolio page, and the UPI ID it's paid to. Published with
             the rates, since visitors can only read data.js. The on/off switch
             is on the header line, so it shows while the panel is folded: tucked
             inside the body, the studio couldn't find it. -->
        <div class="admin-panel" id="portfolio-pdf">
          <div class="admin-panel-head" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; cursor: pointer; user-select: none;" onclick="const b=document.getElementById('adminPdfBody');const a=document.getElementById('adminPdfArrow');const open=b.style.display!=='none';b.style.display=open?'none':'block';a.textContent=open?'▼':'▲';">
            <span style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">Portfolio PDF for clients
              <label class="pp-switch" onclick="event.stopPropagation()"><input type="checkbox" id="portfolioPdfEnabledInput" aria-label="Portfolio PDF for clients" ${getPortfolioPdfSettings().enabled ? "checked" : ""} onchange="window.saveAdminPortfolioPdfSettings()" /><span class="pp-switch-track" aria-hidden="true"></span><span id="portfolioPdfEnabledLabel">${getPortfolioPdfSettings().enabled ? "On" : "Off"}</span></label>
            </span>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button type="button" class="admin-cal-btn primary" onclick="event.stopPropagation();window.saveAdminPortfolioPdfSettings()">Save &amp; push live</button>
              <span id="adminPdfArrow" style="font-size: var(--font-xs); color: var(--ink-soft); font-weight: 700;">▼</span>
            </div>
          </div>
          <div id="adminPdfBody" style="display: none; margin-top: 12px;">
            <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0 0 12px 0;">Everyone can open Model Portfolio, pick a model's photos by pose and preview a 1 or 2 page PDF, and download the pages as watermarked PNG images for free. <strong>Off:</strong> only you can download the PDF; clients see this price and your email address, to ask you for one. <strong>On:</strong> clients pay this amount to your UPI ID to download, and each payment unlocks one PDF. Set the price to <strong>0</strong> to make downloads free.</p>
            <div style="display: flex; align-items: flex-end; gap: 18px; flex-wrap: wrap;">
              <div>
                <span style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft); display: block; margin-bottom: 4px; text-transform: uppercase;">Price per PDF</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-weight: 800; color: #059669; font-size: var(--font-sm);">₹</span>
                  <input type="number" id="portfolioPdfPriceInput" min="0" step="10" value="${getPortfolioPdfSettings().price}" style="width: 140px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); font-weight: 800; color: #059669; background: var(--bone);" />
                </div>
              </div>
              <div style="flex: 1 1 220px;">
                <span style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft); display: block; margin-bottom: 4px; text-transform: uppercase;">Your UPI ID</span>
                <input type="text" id="portfolioPdfUpiInput" value="${esc(getPortfolioPdfSettings().upiId)}" placeholder="yourname@okaxis" autocomplete="off" autocapitalize="none" spellcheck="false" style="width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--ink); background: var(--bone);" />
              </div>
            </div>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 10px 0 0 0;">Every client who buys sees this UPI ID, and it's public in the site's code, so use one that isn't your phone number. Each sale emails you the client's UPI reference number: check the money reached your bank. Two emails with the same number are one payment entered twice.</p>
            <details class="pdf-type" style="margin-top: 16px;">
              <summary style="cursor: pointer; font-size: var(--font-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--accent-text);">How each line looks</summary>
              <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 8px 0 12px;">Every line of the PDF, in the order you meet it on the page. Sizes are millimetres on A4. Only the four typefaces the site already loads are offered — adding another would slow every visitor's first page down, and the PDF can only draw a typeface the site has loaded.</p>
              <div id="pdfTypeRows"></div>
              <div id="pdfBorderRow" style="display: grid; grid-template-columns: minmax(150px, 1.4fr) repeat(3, minmax(88px, 1fr)) auto; gap: 8px; align-items: center; padding: 10px 0 2px; border-top: 2px solid var(--line);"></div>
              <button type="button" class="admin-cal-btn" id="pdfTypeReset" style="margin-top: 10px; font-size: var(--font-xs);">↺ Put every line back to the original</button>
            </details>
            <span id="portfolioPdfSaveStatus" class="admin-pdf-status" aria-live="polite"></span>
          </div>
        </div>

        <div class="admin-panel">
          <div class="admin-panel-head" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; cursor: pointer; user-select: none;" onclick="const b=document.getElementById('adminPromoBody');const a=document.getElementById('adminPromoArrow');const open=b.style.display!=='none';b.style.display=open?'none':'block';a.textContent=open?'▼':'▲';">
            <span style="display: flex; align-items: center; gap: 8px;">Promo codes</span>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button type="button" class="admin-cal-btn" onclick="event.stopPropagation();document.getElementById('adminPromoBody').style.display='block';document.getElementById('adminPromoArrow').textContent='▲';window.addNewAdminPromoCode()">Add promo code</button>
              <button type="button" class="admin-cal-btn primary" id="adminPromoSaveBtn" onclick="event.stopPropagation();window.saveAdminCustomPackages()">Save &amp; push live</button>
              <span id="adminPromoArrow" style="font-size: var(--font-xs); color: var(--ink-soft); font-weight: 700;">▼</span>
            </div>
          </div>
          <div id="adminPromoBody" style="display: none; margin-top: 12px;">
            <span class="admin-save-status" style="font-size: var(--font-xs); font-weight: 700; color: #059669; background: rgba(5,150,105,0.12); padding: 4px 10px; border-radius: 12px; border: 1px solid #059669; font-family: var(--mono-font); display: inline-block; margin-bottom: 8px;">🟢 ALL CHANGES SAVED TO LIVE SITE</span>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0 0 12px 0;">A change here is kept on this device straight away. Clients get it once you press <strong>Save &amp; push live</strong> above — the same button publishes rates, promo codes and invite codes together.</p>
            <div id="adminPromoCodesGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;"></div>
          </div>
        </div>

        <!-- Invite codes are a different tool from promo codes — they unlock
             the test-shoot form rather than discount a package — so they get
             their own panel instead of sharing the promo one. -->
        <div class="admin-panel">
          <div class="admin-panel-head" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; cursor: pointer; user-select: none;" onclick="const b=document.getElementById('adminInviteBody');const a=document.getElementById('adminInviteArrow');const open=b.style.display!=='none';b.style.display=open?'none':'block';a.textContent=open?'▼':'▲';">
            <span style="display: flex; align-items: center; gap: 8px;">Invite codes <span style="font-weight: 400; color: var(--ink-soft); font-size: 12.5px;">— test shoot / TFP unlocks</span></span>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button type="button" class="admin-cal-btn" onclick="event.stopPropagation();document.getElementById('adminInviteBody').style.display='block';document.getElementById('adminInviteArrow').textContent='▲';window.addNewAdminInviteCode()">Add invite code</button>
              <button type="button" class="admin-cal-btn primary" id="adminInviteSaveBtn" onclick="event.stopPropagation();window.saveAdminCustomPackages()">Save &amp; push live</button>
              <span id="adminInviteArrow" style="font-size: var(--font-xs); color: var(--ink-soft); font-weight: 700;">▼</span>
            </div>
          </div>
          <div id="adminInviteBody" style="display: none; margin-top: 12px;">
            <span class="admin-save-status" style="font-size: var(--font-xs); font-weight: 700; color: #059669; background: rgba(5,150,105,0.12); padding: 4px 10px; border-radius: 12px; border: 1px solid #059669; font-family: var(--mono-font); display: inline-block; margin-bottom: 8px;">🟢 ALL CHANGES SAVED TO LIVE SITE</span>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0 0 12px 0;">A change here is kept on this device straight away. Invited talent get it once you press <strong>Save &amp; push live</strong> above — the same button publishes rates, promo codes and invite codes together.</p>
            <div id="adminInviteCodesGrid" style="display: grid; grid-template-columns: 1fr; gap: 12px;"></div>
          </div>
        </div>

        </div>

        <div style="margin-top: 32px; border-top: 1px solid var(--line); padding-top: 20px; text-align: center;">
          <a href="/contracts" data-link class="admin-cal-btn">Contract vault &rarr;</a>
        </div>
      </section>
      <div id="dateAdminModalContainer"></div>
      <div id="codeAdminModalContainer"></div>
    `;
  }

  // The contract PDF generator, printer and archive viewer are used by the
  // contract vault page as well as the calendar, so they live at module
  // scope: defined inside wireCalendar they did not exist on a direct load of
  // /contracts and every Review / Print button there was dead.
  window.openPdfContractGenerator = function(dKey, bookingId, preselectedVersion) {
    const settings = window.WPS_DATA?.CALENDAR_SETTINGS || {};
    const bookings = (settings.bookedDates && settings.bookedDates[dKey]) || [];
    const defaults = {
      name: "",
      email: "",
      phone: "",
      type: "Fashion Editorial",
      duration: "Full Day",
      status: "confirmed",
      location: HOME_STUDIO_NAME,
      package: "₹10,000 Package — 50 Proof Clicks + 8 Retouched Master Clicks",
      notes: "",
      contractVersion: preselectedVersion || window.ACTIVE_CONTRACTS.commercial
    };
    // bookingId may be a plain object of typed details (day modal's "Draft
    // contract PDF"): no calendar entry exists, so seed the form from it. A
    // test-shoot type with no explicit version lets the TFP release preselect.
    let b;
    // Set only when this contract is being printed for an entry that is
    // already on the calendar: that date is spoken for, so the generator does
    // not offer to hold it a second time.
    let existingBooking = null;
    if (bookingId && typeof bookingId === "object") {
      b = Object.assign({}, defaults, bookingId);
      if (!bookingId.contractVersion && /test|tfp/i.test(b.type || "")) b.contractVersion = "";
    } else {
      existingBooking = bookings.find(x => x.id === bookingId || x.name === bookingId) || null;
      b = existingBooking || defaults;
    }

    let modal = document.getElementById("pdfContractGeneratorModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "pdfContractGeneratorModal";
      modal.className = "modal-overlay";
      modal.style.cssText = "position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.65); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 20px;";
      document.body.appendChild(modal);
    }
    // Cancel and × hide the overlay rather than removing it, so a second open
    // has to unhide it — without this the generator came up invisible every
    // time after the first, and the click looked like it did nothing.
    modal.style.display = "flex";

    const dVal = dKey || (new Date()).toISOString().split("T")[0];
    const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
    const parsePrice = (s) => { const m = String(s || "").replace(/,/g, "").match(/₹\s*(\d+)/); return m ? Number(m[1]) : null; };
    const packages = ((typeof getAdminPackages === "function" && getAdminPackages()) || []).filter((p) => p && p.name);
    const tfpPkg = (typeof getAdminTfpPackage === "function" && getAdminTfpPackage()) || {};
    const tfpSpecs = String(tfpPkg.specs || "").replace(/\s*\(No RAW files delivered\)\s*$/i, "").trim() || "Full Proofing Gallery + 8 to 12 Retouched Master Clicks";
    const pkgValue = (p) => `₹${Number(p.price).toLocaleString("en-IN")} (${p.name})`;
    const promoCodes = (typeof window.getAdminPromoCodes === "function" && window.getAdminPromoCodes()) || {};
    const describePromo = (e) => {
      const hs = window.getPromoHomeStudioDiscount(e), parts = [];
      if (Number(e.flat) > 0) parts.push(`flat ${inr(e.flat)} off ${e.includeAddons ? "package + rental" : "the package"}`);
      else if (Number(e.pct) > 0) parts.push(`${e.pct}% off ${e.includeAddons ? "package + rental" : "the package"}`);
      if (hs.type === "free") parts.push("home studio rental waived");
      else if (hs.type === "flat") parts.push(`${inr(hs.value)} off the rental`);
      else if (hs.type === "pct") parts.push(`${hs.value}% off the rental`);
      return parts.join(" · ") || "no discount";
    };
    // A booking that arrived with a promo code reopens with it; one with a
    // recorded saving but no live code reopens as a custom discount.
    const initialPromo = (b.promoMeta && b.promoMeta.code && promoCodes[String(b.promoMeta.code).toUpperCase()]) ? String(b.promoMeta.code).toUpperCase() : "";
    const initialCustomDiscount = (!initialPromo && b.promoMeta && Number(b.promoMeta.savings) > 0) ? { value: Number(b.promoMeta.savings), reason: String(b.promoMeta.tag || b.promoMeta.code || "Discount") } : null;

    // What the form opens on. The booking kind drives the contract document,
    // the payment terms and the deliverables, so the three can no longer be
    // left contradicting each other (a test shoot printed with 3-tier paid
    // milestones and the commercial contract).
    const bookingBudget = String(b.budget || "").trim();
    const initialKind = ((b.type && /test|tfp/i.test(b.type)) || /tfp|test/i.test(String(b.contractVersion || "")) || /Collab \/ TFP/i.test(bookingBudget)) ? "tfp" : "paid";
    const initialLocation = String(b.location || "").trim();
    const initialVenue = (/home studio/i.test(initialLocation) || Number(b.homeStudioFee) > 0) ? "home" : (initialLocation ? "outdoor" : "home");
    const budgetPrice = parsePrice(bookingBudget);
    const initialPkg = packages.find((p) => pkgValue(p) === bookingBudget) || packages.find((p) => budgetPrice !== null && Number(p.price) === budgetPrice) || packages[0] || null;
    const initialCustomName = (!initialPkg && bookingBudget && !/Collab \/ TFP/i.test(bookingBudget)) ? bookingBudget : "₹15,000 Commercial Retainer";
    const initialRental = (b.homeStudioFee !== undefined && b.homeStudioFee !== null && b.homeStudioFee !== "") ? Math.max(0, Number(b.homeStudioFee) || 0) : null;
    const initialSchedule = (b.financials && PACKAGE_SCHEDULES[b.financials.scheduleKey]) ? b.financials.scheduleKey : getPackageScheduleKey();
    const genSelected = (() => {
      const raw = String(b.contractVersion || "").trim();
      if (raw === "Custom Contract") return raw;
      const fallback = initialKind === "tfp" ? window.ACTIVE_CONTRACTS.tfp : window.ACTIVE_CONTRACTS.commercial;
      if (!raw || raw === "Pending Agreement") return fallback;
      const r = window.resolveContractArchive(raw);
      return r ? r.version : fallback;
    })();
    const durationOpt = (value, label, on) => `<option value="${esc(value)}"${on ? " selected" : ""}>${label}</option>`;
    // The draft defaults carry a generic "Full Day"; only a duration the
    // booking itself states should pin the select, so a test-shoot draft can
    // open on the half day the cap allows.
    const dur = (bookingId && typeof bookingId === "object") ? String(bookingId.duration || "") : String((existingBooking && existingBooking.duration) || "");
    // Custom call & wrap times, in the same shape the booking page records
    // ("Custom — 11:00 AM to 3:00 PM (4 hours)"), so a booking made on the
    // site and a contract drafted here describe a window the same way.
    const format12 = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };
    const parse12 = (t) => { const m = String(t || "").match(/(\d{1,2}):(\d{2})\s*([AP]M)/i); if (!m) return ""; let h = Number(m[1]) % 12; if (/PM/i.test(m[3])) h += 12; return `${String(h).padStart(2, "0")}:${m[2]}`; };
    const storedCustom = dur.match(/Custom — (\d{1,2}:\d{2} [AP]M) to (\d{1,2}:\d{2} [AP]M)/i);
    const initialStart = storedCustom ? parse12(storedCustom[1]) : "10:30";
    const initialEnd = storedCustom ? parse12(storedCustom[2]) : (initialKind === "tfp" ? "14:30" : "17:30");

    modal.innerHTML = `
      <div class="modal-content pdfgen" style="background: var(--paper); border: 1px solid var(--line); border-radius: 14px; max-width: 760px; width: 100%; max-height: 92vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.35); overflow: hidden; color: var(--ink);">
        <div class="pdfgen-head">
          <div>
            <h3>📄 Contract &amp; agreement PDF</h3>
            <div class="pdfgen-hint">For bookings that arrive by DM, email or phone. Print the A4 PDF, send it with the approval message, and the client's reply is the signature.</div>
          </div>
          <button type="button" id="closePdfGenModal" aria-label="Close">✕</button>
        </div>

        <div class="pdfgen-body">
          <section class="pdfgen-card">
            <h4>Client</h4>
            <div class="pdfgen-grid">
              <label class="pdfgen-field">Client name *<input type="text" id="pdf_clientName" value="${esc(b.name || '')}" placeholder="e.g. Rahul Sharma / Model Name" /></label>
              <label class="pdfgen-field">Instagram / handle / website<input type="text" id="pdf_instagram" value="${esc(b.instagram || b.handle || '')}" placeholder="e.g. @handle or website.com" /></label>
              <label class="pdfgen-field">Email<input type="email" id="pdf_email" value="${esc(b.email || '')}" placeholder="client@example.com" /></label>
              <label class="pdfgen-field">Phone<input type="tel" id="pdf_phone" value="${esc(b.phone || '')}" placeholder="+91 98765-43210" /></label>
            </div>
          </section>

          <section class="pdfgen-card">
            <h4>Shoot</h4>
            <div class="pdfgen-grid">
              <label class="pdfgen-field">Shoot date / timeline *<input type="text" id="pdf_date" value="${esc(dVal)}" placeholder="YYYY-MM-DD or Mid-August" /></label>
              <label class="pdfgen-field">Session<select id="pdf_duration">
                ${durationOpt("Full Day (10:30 AM – 5:30 PM)", "Full Day Shoot (10:30 AM – 5:30 PM · 7 Hours)", dur.includes("Full Day") || (!dur && initialKind !== "tfp"))}
                ${durationOpt("Half Day Morning (10:30 AM – 2:30 PM)", "Half Day Morning (10:30 AM – 2:30 PM · 4 Hours)", dur.includes("Morning") || (!dur && initialKind === "tfp"))}
                ${durationOpt("Half Day Afternoon (1:30 PM – 5:30 PM)", "Half Day Afternoon (1:30 PM – 5:30 PM · 4 Hours)", dur.includes("Afternoon"))}
                ${durationOpt("Flexible / Photographer Choice", "Flexible / Photographer Choice (Photographer Recommends Best Time)", dur.includes("Flexible"))}
                ${durationOpt("Custom Timings (Specify Call & Wrap Time)", "Custom Timings (Specify Call &amp; Wrap Time)", dur.includes("Custom"))}
              </select></label>
            </div>
            <div class="pdfgen-grid" id="pdf_customTimeWrap" style="display: none;">
              <label class="pdfgen-field">Call time<input type="time" id="pdf_timeStart" value="${esc(initialStart)}" /></label>
              <label class="pdfgen-field">Wrap time<input type="time" id="pdf_timeEnd" value="${esc(initialEnd)}" /><span class="pdfgen-hint" id="pdf_customTimeBadge"></span></label>
            </div>
            <div class="pdfgen-field">Venue
              <div class="pdfgen-seg" role="radiogroup" aria-label="Venue">
                <label><input type="radio" name="pdf_venue" value="home" /><span>Home studio</span></label>
                <label><input type="radio" name="pdf_venue" value="commercial" /><span>Commercial studio</span></label>
                <label><input type="radio" name="pdf_venue" value="outdoor" /><span>Outdoor / client venue</span></label>
              </div>
            </div>
            <div class="pdfgen-grid">
              <label class="pdfgen-field">Location address *<input type="text" id="pdf_location" value="${esc(initialLocation || HOME_STUDIO_NAME)}" placeholder="Venue name and address" /></label>
              <label class="pdfgen-field" id="pdf_rentalWrap">Home studio rental (₹)<input type="number" id="pdf_rental" min="0" step="100" inputmode="numeric" /><span class="pdfgen-hint" id="pdf_rentalHint"></span></label>
            </div>
            <label class="pdfgen-check"><input type="checkbox" id="pdf_venueByStudio" ${b.venueByStudio ? 'checked' : ''} /><span><strong>Venue provided by the studio — no rental billed.</strong> Ticked automatically for bookings that came in on an invite code carrying a location; tick it by hand when you are supplying the space for free.</span></label>
            ${existingBooking ? "" : `
            <label class="pdfgen-check"><input type="checkbox" id="pdf_holdDate" checked /><span><strong>\u{1F4C5} Hold this date on the calendar when I print.</strong> It goes in as a <strong>Hold</strong> — the public sees the day as taken, nothing is confirmed — with <strong>Accept</strong> and <strong>Reject</strong> waiting on it in the calendar and roster for when the client replies. Needs the shoot date above to be a plain YYYY-MM-DD.</span></label>`}
          </section>

          <section class="pdfgen-card">
            <h4>Agreement</h4>
            <div class="pdfgen-field">Booking kind
              <div class="pdfgen-seg" role="radiogroup" aria-label="Booking kind">
                <label><input type="radio" name="pdf_kind" value="paid" /><span>Paid shoot</span></label>
                <label><input type="radio" name="pdf_kind" value="tfp" /><span>Test shoot / TFP</span></label>
              </div>
              <span class="pdfgen-hint" id="pdf_kindHint"></span>
            </div>
            <div class="pdfgen-grid">
              <label class="pdfgen-field" id="pdf_packageWrap">Package &amp; deliverables *<select id="pdf_packageSelect">
                ${packages.map((p) => `<option value="${esc(pkgValue(p))}"${initialPkg === p ? " selected" : ""}>₹${Number(p.price).toLocaleString("en-IN")} · ${esc(p.name)}${p.specs ? ` (${esc(p.specs)})` : ""}</option>`).join("")}
                <option value="custom"${!initialPkg ? " selected" : ""}>✏️ Custom package / bespoke deliverables</option>
              </select></label>
              <div class="pdfgen-field" id="pdf_tfpPackageWrap">Deliverables<div class="pdfgen-static">Test shoot / TFP · ${esc(tfpSpecs)}. No shoot fee.</div></div>
              <label class="pdfgen-field">Contract document *<select id="pdf_contractVersion" data-contract-select="1" data-custom="1" data-prev-value="${esc(genSelected)}">${contractVersionOptionsHtml({ selected: genSelected })}</select></label>
              <label class="pdfgen-field" id="pdf_scheduleWrap">Payment milestones<select id="pdf_paymentMilestones">
                ${["5050", "503020", "50301010"].map((k) => `<option value="${k}"${initialSchedule === k ? " selected" : ""}>${esc(PACKAGE_SCHEDULES[k].label)} · ${esc(PACKAGE_SCHEDULES[k].contract.replace(/ \(.*$/, ""))}</option>`).join("")}
              </select></label>
            </div>

            <div class="pdfgen-grid" id="pdf_discountRow">
              <label class="pdfgen-field">Discount<select id="pdf_discount">
                <option value="">None</option>
                ${Object.keys(promoCodes).map((code) => `<option value="${esc(code)}"${initialPromo === code ? " selected" : ""}>${esc(code)} · ${esc(describePromo(promoCodes[code]))}</option>`).join("")}
                <option value="custom"${initialCustomDiscount ? " selected" : ""}>✏️ Custom discount…</option>
              </select></label>
              <div class="pdfgen-field" id="pdf_customDiscountWrap" style="display: none;">Custom discount
                <div style="display: flex; gap: 8px;">
                  <input type="number" id="pdf_discountValue" min="0" inputmode="numeric" placeholder="Amount" value="${initialCustomDiscount ? esc(String(initialCustomDiscount.value)) : ""}" />
                  <select id="pdf_discountType" style="width: auto; flex: 0 0 auto;"><option value="flat">₹ off</option><option value="pct">% off</option></select>
                </div>
                <input type="text" id="pdf_discountReason" placeholder="Reason, printed on the contract — e.g. Returning client" value="${initialCustomDiscount ? esc(initialCustomDiscount.reason) : ""}" />
              </div>
            </div>

            <div id="pdf_customPackage_wrap" class="pdfgen-card" style="background: var(--bone); display: none;">
              <h4>Custom package</h4>
              <div class="pdfgen-grid">
                <label class="pdfgen-field">Package name &amp; price (₹ figure drives the split)<input type="text" id="pdf_customPkgName" value="${esc(initialCustomName)}" placeholder="e.g. ₹15,000 Custom Brand Retainer" /></label>
                <label class="pdfgen-field">Retouched master clicks included<input type="text" id="pdf_customRetouchedCount" value="8 Master Retouched Clicks" placeholder="e.g. 10 Retouched Master Clicks" /></label>
                <label class="pdfgen-field">Unedited gallery download<select id="pdf_customDownloadPermission">
                  <option value="Proofing View Only (Download Restricted to Billed Retouched Clicks)" selected>Proofing view only (download restricted to contracted retouched clicks)</option>
                  <option value="Full Unedited Gallery Download Included">Full unedited high-res gallery download included</option>
                </select></label>
                <label class="pdfgen-field">Revisions<select id="pdf_customRevisions">
                  <option value="1 Round of Minor Revisions (Within 7 Days)" selected>1 round of minor revisions (within 7 days)</option>
                  <option value="2 Rounds of Minor Revisions (Within 14 Days)">2 rounds of minor revisions (within 14 days)</option>
                  <option value="No Revisions Included (Extra Revisions Billed at ₹1,500/image)">No revisions included (billed at ₹1,500/image)</option>
                </select></label>
                <label class="pdfgen-field">Cloud archival window<select id="pdf_customCloudRetention">
                  <option value="3 Months Cloud Retention (Standard Test Shoot / TFP)">3 months (test shoots / TFP)</option>
                  <option value="6 Months Cloud Retention (Standard Paid Commercial Shoot)" selected>6 months (paid commercial shoots)</option>
                  <option value="12 Months Extended Archival (1 Year)">12 months extended archival</option>
                  <option value="1 Month Cloud Retention (30 Days Express)">1 month (30 days)</option>
                  <option value="custom">✏️ Custom expiry / months</option>
                </select></label>
                <label class="pdfgen-field" id="pdf_customCloudRetentionWrap" style="display: none;">Custom retention<input type="text" id="pdf_customCloudRetentionInput" value="2 Months (Expiry: Oct 15, 2026)" placeholder="e.g. 2 Months / Expiry: Oct 15, 2026" /></label>
              </div>
            </div>

            <div class="pdfgen-summary" id="pdf_paySummary" aria-live="polite"></div>
          </section>

          <section class="pdfgen-card">
            <h4>Notes</h4>
            <label class="pdfgen-field">Production notes &amp; call time<textarea id="pdf_notes" rows="2" placeholder="e.g. Call time 9:00 AM, 3 wardrobe changes, client brings own outfits.">${esc(b.notes || '')}</textarea></label>
          </section>
        </div>

        <div class="pdfgen-foot">
          <button type="button" class="admin-cal-btn" id="copyApprovalMsgBtn">📋 Copy approval message</button>
          <div>
            <button type="button" class="admin-cal-btn" id="cancelPdfGenBtn">Cancel</button>
            <button type="button" class="admin-cal-btn primary" id="triggerPrintPdfBtn">🖨️ Print / save as A4 PDF</button>
          </div>
        </div>
      </div>
    `;

    const q = (id) => document.getElementById(id);
    const kindOf = () => (document.querySelector('input[name="pdf_kind"]:checked') || {}).value || "paid";
    const venueOf = () => (document.querySelector('input[name="pdf_venue"]:checked') || {}).value || "home";
    const setRadio = (name, v) => { const r = document.querySelector(`input[name="${name}"][value="${v}"]`); if (r) r.checked = true; };
    setRadio("pdf_kind", initialKind);
    setRadio("pdf_venue", initialVenue);
    const locEl = q("pdf_location");
    if (initialVenue === "home" && (!initialLocation || initialLocation === HOME_STUDIO_NAME)) locEl.dataset.auto = "1";
    const rateFor = (kind) => getHomeStudioRate(kind === "tfp");
    let rentalTouched = initialRental !== null;
    q("pdf_rental").value = initialRental !== null ? initialRental : rateFor(initialKind);

    const customMinutes = () => { const [sh, sm] = (q("pdf_timeStart").value || "10:30").split(":").map(Number); const [eh, em] = (q("pdf_timeEnd").value || "17:30").split(":").map(Number); let d = (eh * 60 + em) - (sh * 60 + sm); if (d < 0) d += 24 * 60; return d; };
    const isCustomSession = () => /^Custom/.test(q("pdf_duration").value);
    const sessionLabel = () => isCustomSession()
      ? `Custom — ${format12(q("pdf_timeStart").value || "10:30")} to ${format12(q("pdf_timeEnd").value || "17:30")} (${(customMinutes() / 60).toFixed(1).replace(".0", "")} hours)`
      : q("pdf_duration").value;
    const currentRental = () => (venueOf() === "home" && !q("pdf_venueByStudio").checked) ? Math.max(0, Number(q("pdf_rental").value) || 0) : 0;
    const currentPackagePrice = () => { const sel = q("pdf_packageSelect"); return sel.value === "custom" ? parsePrice(q("pdf_customPkgName").value) : parsePrice(sel.value); };
    const currentPackageLabel = () => {
      if (kindOf() === "tfp") return `Test Shoot / TFP · ${tfpSpecs}`;
      const sel = q("pdf_packageSelect");
      if (sel.value !== "custom") return sel.value;
      const cloud = q("pdf_customCloudRetention").value === "custom" ? q("pdf_customCloudRetentionInput").value.trim() : q("pdf_customCloudRetention").value;
      return `${q("pdf_customPkgName").value.trim()} — ${q("pdf_customRetouchedCount").value.trim()} (${q("pdf_customDownloadPermission").value}; ${q("pdf_customRevisions").value}; ${cloud})`;
    };
    // The discount in play: one of the studio's promo codes (applied exactly
    // as the booking page applies it) or a custom amount with a reason that
    // is printed on the contract.
    const currentDiscount = () => {
      const pick = q("pdf_discount").value;
      if (!pick) return { source: "none" };
      if (pick === "custom") {
        const value = Math.max(0, Number(q("pdf_discountValue").value) || 0);
        const type = q("pdf_discountType").value === "pct" ? "pct" : "flat";
        const reason = q("pdf_discountReason").value.trim();
        if (!value) return { source: "none" };
        return { source: "custom", value: type === "pct" ? Math.min(100, value) : value, type, reason, label: `${reason || "Discount"} · ${type === "pct" ? `${Math.min(100, value)}% off` : `${inr(value)} off`}` };
      }
      const entry = promoCodes[pick];
      if (!entry) return { source: "none" };
      return { source: "promo", code: pick, entry, label: `${pick} · ${describePromo(entry)}` };
    };
    // Same arithmetic as the booking page's quote card, so a contract printed
    // here and a booking made on the site never disagree about the split.
    const computeMoney = () => {
      const kind = kindOf(), listRental = currentRental(), key = q("pdf_paymentMilestones").value, disc = currentDiscount();
      let rental = listRental, rentalOff = 0;
      if (disc.source === "promo") { const r = window.applyPromoHomeStudioDiscount(disc.entry, listRental); rentalOff = r.amount; rental = Math.max(0, listRental - r.amount); }
      if (kind === "tfp") {
        // A collaboration has no package, so a custom discount can only be
        // taken off the rental; a promo code's package part does nothing here.
        if (disc.source === "custom") { rentalOff = Math.min(listRental, disc.type === "pct" ? Math.round(listRental * disc.value / 100) : disc.value); rental = listRental - rentalOff; }
        const label = disc.source === "none" ? "" : (rentalOff > 0 ? disc.label : `${disc.label} (no effect on a test shoot)`);
        return { kind, listRental, rental, rentalOff, price: 0, savings: 0, total: rental, key: "tfp", legs: rental > 0 ? [rental] : [], discountLabel: label, discount: disc };
      }
      const price = currentPackagePrice();
      if (price === null) return { kind, listRental, rental, rentalOff, price: null, savings: 0, total: null, key, legs: [], discountLabel: disc.source === "none" ? "" : disc.label, discount: disc };
      let savings = 0;
      if (disc.source === "promo") {
        const e = disc.entry, base = e.includeAddons ? price + rental : price;
        savings = e.flat ? Number(e.flat) : (e.pct ? Math.round(base * Number(e.pct) / 100) : 0);
        savings = Math.min(savings, base);
      } else if (disc.source === "custom") {
        savings = Math.min(price, disc.type === "pct" ? Math.round(price * disc.value / 100) : disc.value);
      }
      const total = Math.max(0, price + rental - savings);
      const legs = splitPackageMilestones(Math.max(0, total - rental), rental, key);
      const label = disc.source === "none" ? "" : ((savings > 0 || rentalOff > 0) ? disc.label : `${disc.label} (no effect)`);
      return { kind, listRental, rental, rentalOff, price, savings, total, key, legs, discountLabel: label, discount: disc };
    };
    const legLabels = (key, rental) => [`Advance retainer${rental > 0 ? " + studio rental" : ""}`].concat(PACKAGE_SCHEDULES[key].quoteSteps.map((s) => s.replace(/^Step \d · /, "")));
    const rentalPhrase = (m) => m.rental > 0
      ? `home studio rental ${inr(m.rental)}${m.rentalOff > 0 ? ` (${inr(m.listRental)} less ${inr(m.rentalOff)})` : ""}`
      : (m.rentalOff > 0 && m.listRental > 0 ? `home studio rental waived (normally ${inr(m.listRental)})` : "");
    const paySummaryText = () => {
      const m = computeMoney(), free = q("pdf_venueByStudio").checked;
      const discNote = m.discountLabel ? ` Discount: ${m.discountLabel}.` : "";
      if (m.kind === "tfp") {
        if (free) return "Payment: nothing is payable — the venue is provided by the studio and a test shoot carries no shoot fee.";
        if (m.rental > 0) return `Payment: no shoot fee. Home studio rental ${inr(m.rental)}${m.rentalOff > 0 ? ` (${inr(m.listRental)} less ${inr(m.rentalOff)})` : ""} is payable in full at least 48 hours before the shoot (non-refundable once paid).${discNote}`;
        if (m.rentalOff > 0 && m.listRental > 0) return `Payment: nothing is payable — no shoot fee on a test shoot, and the home studio rental (normally ${inr(m.listRental)}) is waived.${discNote}`;
        return "Payment: nothing is payable to the studio — no shoot fee on a test shoot.";
      }
      if (m.price === null) return `Payment terms: ${PACKAGE_SCHEDULES[m.key].contract}.`;
      const labels = legLabels(m.key, m.rental).map((l) => l.toLowerCase());
      const rp = rentalPhrase(m);
      return `Payment: total ${inr(m.total)} (package ${inr(m.price)}${m.savings > 0 ? ` less ${inr(m.savings)} discount` : ""}${rp ? ` + ${rp}` : ""}) — ` + m.legs.map((a, i) => `${inr(a)} ${labels[i] || "milestone " + (i + 1)}`).join(" · ") + `.${discNote}`;
    };
    const render = () => {
      const kind = kindOf(), venue = venueOf(), free = q("pdf_venueByStudio").checked;
      q("pdf_packageWrap").style.display = kind === "paid" ? "" : "none";
      q("pdf_tfpPackageWrap").style.display = kind === "tfp" ? "" : "none";
      q("pdf_scheduleWrap").style.display = kind === "paid" ? "" : "none";
      q("pdf_customPackage_wrap").style.display = (kind === "paid" && q("pdf_packageSelect").value === "custom") ? "" : "none";
      q("pdf_customCloudRetentionWrap").style.display = q("pdf_customCloudRetention").value === "custom" ? "" : "none";
      q("pdf_customTimeWrap").style.display = isCustomSession() ? "" : "none";
      if (isCustomSession()) {
        const mins = customMinutes(), hrs = (mins / 60).toFixed(1).replace(".0", "");
        q("pdf_customTimeBadge").textContent = (kind === "tfp" && mins > 5 * 60)
          ? `⚠️ ${hrs} hours — test shoots run to 5 hours at most.`
          : `⏱️ ${hrs} hours · ${format12(q("pdf_timeStart").value || "10:30")} – ${format12(q("pdf_timeEnd").value || "17:30")}`;
      }
      q("pdf_rentalWrap").style.display = (venue === "home" && !free) ? "" : "none";
      q("pdf_rentalHint").textContent = `Studio rate for ${kind === "tfp" ? "test shoots" : "paid shoots"}: ${inr(rateFor(kind))}. Change it for a special rate, or use a discount below.`;
      // A test shoot with nothing to pay has nothing to discount.
      q("pdf_discountRow").style.display = (kind === "paid" || (venue === "home" && !free)) ? "" : "none";
      q("pdf_customDiscountWrap").style.display = q("pdf_discount").value === "custom" ? "" : "none";
      q("pdf_kindHint").textContent = kind === "tfp"
        ? "No shoot fee. The test shoot release is selected and the only amount is the home studio rental, if any."
        : "Package rate plus any home studio rental, split on the studio's milestone schedule.";
      const m = computeMoney(), box = q("pdf_paySummary");
      const discLine = m.discountLabel ? `<div>Discount: <strong>${esc(m.discountLabel)}</strong></div>` : "";
      if (kind === "tfp") {
        box.innerHTML = free
          ? `<div><strong>Nothing payable.</strong> Venue provided by the studio; a test shoot carries no shoot fee.</div>`
          : m.rental > 0
            ? `<div class="pdfgen-total">${inr(m.rental)}</div><div>Home studio rental${m.rentalOff > 0 ? ` (${inr(m.listRental)} less ${inr(m.rentalOff)})` : ""}, <strong>payable in full at least 48 hours before the shoot</strong> and non-refundable once paid. No shoot fee.</div>${discLine}`
            : (m.rentalOff > 0 && m.listRental > 0)
              ? `<div><strong>Nothing payable.</strong> No shoot fee, and the home studio rental (normally ${inr(m.listRental)}) is waived.</div>${discLine}`
              : venue === "commercial"
                ? `<div><strong>No shoot fee.</strong> Studio rental, if any, is quoted separately in advance and payable before shoot day.</div>`
                : `<div><strong>Nothing payable.</strong> No shoot fee on a test shoot, and no studio rental at this venue.</div>`;
      } else if (m.price === null) {
        box.innerHTML = `<div><strong>No ₹ amount in the package name</strong>, so the split cannot be shown. Terms: ${esc(PACKAGE_SCHEDULES[m.key].contract)}.</div>`;
      } else {
        const labels = legLabels(m.key, m.rental), rp = rentalPhrase(m);
        box.innerHTML = `<div class="pdfgen-total">${inr(m.total)}</div>` +
          `<div>Package ${inr(m.price)}${m.savings > 0 ? ` − ${inr(m.savings)} discount` : ""}${rp ? ` + ${rp}${m.rental > 0 ? " (paid in full with the advance)" : ""}` : ""} · ${esc(PACKAGE_SCHEDULES[m.key].label)}</div>` + discLine +
          `<div class="pdfgen-legs">${m.legs.map((a, i) => `<div class="pdfgen-leg"><b>${esc(labels[i] || "Milestone " + (i + 1))}</b><strong>${inr(a)}</strong></div>`).join("")}</div>`;
      }
    };
    const onKindChange = () => {
      const kind = kindOf(), ver = q("pdf_contractVersion");
      // The document follows the kind unless the operator has gone custom.
      if (ver && ver.value !== "Custom Contract") {
        const target = kind === "tfp" ? window.ACTIVE_CONTRACTS.tfp : window.ACTIVE_CONTRACTS.commercial;
        if (!Array.from(ver.options).some((o) => o.value === target)) ver.innerHTML = contractVersionOptionsHtml({ selected: target });
        ver.value = target;
        ver.dataset.prevValue = target;
      }
      if (!rentalTouched) q("pdf_rental").value = rateFor(kind);
      const durSel = q("pdf_duration");
      if (kind === "tfp" && durSel && /^Full Day/.test(durSel.value)) durSel.value = "Half Day Morning (10:30 AM – 2:30 PM)";
      if (kind === "tfp" && isCustomSession() && customMinutes() > 5 * 60) { q("pdf_timeStart").value = "10:30"; q("pdf_timeEnd").value = "14:30"; }
      render();
    };
    const onVenueChange = () => {
      const v = venueOf();
      if (v === "home") {
        if (!locEl.value.trim() || locEl.dataset.auto === "1") { locEl.value = HOME_STUDIO_NAME; locEl.dataset.auto = "1"; }
      } else if (locEl.dataset.auto === "1" || /home studio/i.test(locEl.value)) {
        locEl.value = ""; locEl.dataset.auto = "";
      }
      locEl.placeholder = v === "home" ? HOME_STUDIO_NAME : (v === "commercial" ? "Studio name and address" : "Venue or area");
      render();
    };
    document.querySelectorAll('input[name="pdf_kind"]').forEach((r) => r.addEventListener("change", onKindChange));
    document.querySelectorAll('input[name="pdf_venue"]').forEach((r) => r.addEventListener("change", onVenueChange));
    locEl.addEventListener("input", () => { locEl.dataset.auto = ""; });
    q("pdf_rental").addEventListener("input", () => { rentalTouched = true; render(); });
    ["pdf_venueByStudio", "pdf_packageSelect", "pdf_paymentMilestones", "pdf_customCloudRetention", "pdf_discount", "pdf_discountType", "pdf_duration"].forEach((id) => q(id)?.addEventListener("change", render));
    ["pdf_customPkgName", "pdf_customRetouchedCount", "pdf_customCloudRetentionInput", "pdf_discountValue", "pdf_discountReason", "pdf_timeStart", "pdf_timeEnd"].forEach((id) => q(id)?.addEventListener("input", render));
    render();

    $("#closePdfGenModal")?.addEventListener("click", () => modal.style.display = "none");
    $("#cancelPdfGenBtn")?.addEventListener("click", () => modal.style.display = "none");

    $("#copyApprovalMsgBtn")?.addEventListener("click", () => {
      const name = $("#pdf_clientName").value.trim() || "Client";
      const date = $("#pdf_date").value.trim() || "scheduled date";
      const ver = $("#pdf_contractVersion").value;
      const docName = kindOf() === "tfp" ? "Test Shoot Agreement & Model Release" : "Studio Booking Contract & Production Agreement";
      const msg = `Hi ${name}! Please find attached your ${docName} for ${date}.\n\n${paySummaryText()}\n\nPlease review the PDF document and reply to this email / DM with: "I approve and agree to Studio Contract Terms ${ver} for ${date}" to confirm your session.\n\nStudio Operations · nerdyphotographer.in`;
      navigator.clipboard.writeText(msg).then(() => {
        toast("📋 Approval message copied to clipboard! Paste it into IG DM or Gmail when sending the PDF.");
      }).catch(() => {
        toast("Copy failed, please copy manually.");
      });
    });

    $("#triggerPrintPdfBtn")?.addEventListener("click", () => {
      const kind = kindOf(), m = computeMoney(), pkgLabel = currentPackageLabel();
      // Hold the date before printing: printContractPdf hands the browser off
      // to a print window, and anything queued after that is easy to miss.
      if ($("#pdf_holdDate")?.checked) {
        createHoldFromContract({
          date: $("#pdf_date").value.trim(),
          clientName: $("#pdf_clientName").value.trim(),
          email: $("#pdf_email").value.trim(),
          phone: $("#pdf_phone").value.trim(),
          type: kind === "tfp" ? "Selective Collaboration (TFP)" : ((b.type && !/test|tfp/i.test(b.type)) ? b.type : "Client Shoot"),
          duration: sessionLabel(),
          location: $("#pdf_location").value.trim(),
          venueByStudio: !!$("#pdf_venueByStudio")?.checked,
          notes: $("#pdf_notes").value.trim(),
          budget: kind === "tfp" ? "Collab / TFP (No Budget)" : pkgLabel,
          homeStudioFee: m.rental,
          finalPayable: m.total === null ? 0 : m.total,
          promoMeta: (m.savings > 0 || m.rentalOff > 0) ? { code: m.discount.source === "promo" ? m.discount.code : "CUSTOM", tag: m.discountLabel, savings: m.savings + m.rentalOff } : null,
          financials: m.total === null ? null : { basePrice: m.price, homeStudioFee: m.rental, homeStudioListPrice: m.listRental, savings: m.savings, finalPayable: m.total, advanceRetainer: m.legs[0] || 0, wrapBalance: Math.max(0, m.total - (m.legs[0] || 0)), scheduleKey: m.key },
          contractVersion: $("#pdf_contractVersion").value
        });
      }
      window.printContractPdf({
        clientName: $("#pdf_clientName").value.trim(),
        instagram: $("#pdf_instagram").value.trim(),
        email: $("#pdf_email").value.trim(),
        phone: $("#pdf_phone").value.trim(),
        date: $("#pdf_date").value.trim(),
        duration: sessionLabel(),
        location: $("#pdf_location").value.trim(),
        studioProvidedByPhotographer: !!$("#pdf_venueByStudio")?.checked,
        contractVersion: $("#pdf_contractVersion").value,
        package: pkgLabel,
        tfpSpecs,
        paymentMilestones: kind === "tfp" ? "tfp" : $("#pdf_paymentMilestones").value,
        homeStudioFee: m.rental,
        homeStudioListPrice: m.listRental,
        rentalDiscountAmount: m.rentalOff,
        packagePrice: m.price,
        discountAmount: m.savings,
        discountLabel: m.discountLabel,
        notes: $("#pdf_notes").value.trim(),
        sigDataUrl: b.sigDataUrl || "",
        agreementMethod: b.agreementMethod || "",
        agreedContract: b.agreedContract || ""
      });
    });
  };

  window.printContractPdf = function(data) {
    const cVer = data.contractVersion || "";
    const archiveObj = String(cVer).trim() === "Custom Contract"
      ? {
          version: "Custom Contract",
          title: "Custom Client Contract / Master Services Agreement (MSA)",
          fullText: `1. MASTER SERVICES AGREEMENT (MSA) SCOPE\nThis production session is executed under the Client / Brand Provided Master Services Agreement (MSA) or custom contract agreed upon between the Studio and the Client.\n\n2. PRODUCTION BRIEF & DELIVERABLE SPECIFICATIONS\nSpecific shoot dates, locations, deliverable asset counts, retouched image limits, and payment milestone terms are governed by the Production Brief summary table above.\n\n3. UNAUTHORIZED CAMERA OPERATION & DATA PROTECTION\nAll studio camera bodies, memory cards, tethering systems, and raw captures remain confidential studio property. Participants are strictly prohibited from handling equipment or deleting media from studio cards.`
        }
      : window.resolveContractArchive(cVer);
    const contractText = archiveObj ? archiveObj.fullText : "";
    // Read off the document that was actually resolved rather than the raw
    // string, so a booking stored as "TFP-LIABILITY-RELEASE-V3.4" still prints
    // with test-shoot milestones instead of a paid client's 50/50 split.
    const isTfp = (data.paymentMilestones === "tfp" || /-TFP$/.test(String(archiveObj && archiveObj.version || "")));
    // Studio clause: photographer-provided (locked invite) vs rental at actuals
    // (client pays). This used to fall back to `window._lockedLocationFromInvite`,
    // which is set by the PUBLIC booking form and then persists for the whole
    // session — so opening /book, typing a venue-carrying code, and later
    // generating a PDF for an unrelated booking produced a contract promising a
    // free venue (at that other address) for a shoot nobody agreed it for.
    // The flag now comes from the booking record being printed, or the operator.
    const studioByPhotographer = !!data.studioProvidedByPhotographer;
    const studioLocation = data.location || "";
    // A home-studio booking carries the residence rider wherever the venue is
    // described, so the printed contract says the same as the screen the client
    // signed on rather than only the money half of it.
    const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
    // The home studio rental the generator (or the booking record) carries.
    // The printed contract used to know only "venue provided" or "quoted
    // separately", so a test shoot at the home studio printed without the
    // one amount the talent actually owes.
    const rentalFee = Math.max(0, Number(data.homeStudioFee) || 0);
    const rentalList = Math.max(rentalFee, Number(data.homeStudioListPrice) || 0);
    const rentalOff = Math.max(0, Number(data.rentalDiscountAmount) || 0);
    const rentalWaived = rentalFee === 0 && rentalOff > 0 && rentalList > 0;
    const discountAmt = Math.max(0, Number(data.discountAmount) || 0);
    const discountLabel = String(data.discountLabel || "").trim();
    const discountNote = discountLabel ? ` (${esc(discountLabel)})` : "";
    const tfpSpecs = String(data.tfpSpecs || (typeof getAdminTfpPackage === "function" && getAdminTfpPackage().specs) || "Full Proofing Gallery + 8 to 12 Retouched Master Clicks").replace(/\s*\(No RAW files delivered\)\s*$/i, "");
    const tfpPaymentHtml = studioByPhotographer
      ? `No shoot fee applies to this collaboration. The venue is provided by the Studio — <strong>nothing is payable</strong> for this session.`
      : rentalFee > 0
        ? `No shoot fee applies to this collaboration. A fixed home studio rental of <strong>${inr(rentalFee)}</strong>${rentalOff > 0 ? ` (${inr(rentalList)} less a ${inr(rentalOff)} discount${discountNote})` : ""} applies for use of the photographer's home studio in ${esc(HOME_STUDIO_AREA)}, <strong>payable in full at least 48 hours before the shoot day</strong> to reserve the space, and non-refundable once paid. No other fee is payable to the Studio.`
        : rentalWaived
          ? `No shoot fee applies to this collaboration. The home studio rental (normally ${inr(rentalList)}) is waived${discountNote} — <strong>nothing is payable</strong> for this session.`
          : `No shoot fee applies to this collaboration. Any dedicated studio rental is quoted separately in advance and payable in full before shoot day; otherwise nothing is payable to the Studio.`;
    const paidSchedule = PACKAGE_SCHEDULES[data.paymentMilestones] || PACKAGE_SCHEDULES["5050"];
    const paidScheduleKey = PACKAGE_SCHEDULES[data.paymentMilestones] ? data.paymentMilestones : "5050";
    const pkgPrice = Number(data.packagePrice) || 0;
    const paidAmountsHtml = pkgPrice > 0
      ? (() => {
          const net = Math.max(0, pkgPrice - discountAmt);
          const legs = splitPackageMilestones(net, rentalFee, paidScheduleKey);
          const labels = [`Advance retainer${rentalFee > 0 ? " (incl. studio rental)" : ""}`].concat(paidSchedule.quoteSteps.map((s) => s.replace(/^Step \d · /, "")));
          const rentalPart = rentalFee > 0
            ? ` + home studio rental ${inr(rentalFee)}${rentalOff > 0 ? ` (${inr(rentalList)} less ${inr(rentalOff)})` : ""}`
            : (rentalWaived ? ` + home studio rental waived (normally ${inr(rentalList)})` : "");
          return `<br/><strong>💰 Amounts:</strong> Package ${inr(pkgPrice)}${discountAmt > 0 ? ` − discount ${inr(discountAmt)}${discountNote} = ${inr(net)}` : ""}${rentalPart} = <strong>${inr(net + rentalFee)}</strong> · ` + legs.map((a, i) => `${esc(labels[i] || "Milestone " + (i + 1))} ${inr(a)}`).join(" · ");
        })()
      : "";
    const homeStudioRiderHtml = ((studioByPhotographer || rentalFee > 0 || rentalWaived) && /home studio/i.test(studioLocation))
      ? ` Attendance is limited to a maximum of 3 people in total — the photographer, the Participant, and any crew they bring (hair &amp; makeup, stylist, assistants or guests all count towards this limit); the session runs within booked daylight hours and concludes by <strong>7:00 PM</strong>; the full address is shared on booking confirmation; guests may not attend unaccompanied.`
      : ``;
    const studioClauseTfp = studioByPhotographer
      ? `Studio venue for this session is provided by the photographer${studioLocation ? ` at <strong>${esc(studioLocation)}</strong>` : ""} at no additional rental charge to the talent.${homeStudioRiderHtml}`
      : rentalFee > 0
        ? `This session takes place at the photographer's home studio${studioLocation ? ` at <strong>${esc(studioLocation)}</strong>` : ` in ${esc(HOME_STUDIO_AREA)}`}; the fixed home studio rental under Payment is the only venue charge.${homeStudioRiderHtml}`
        : rentalWaived
          ? `This session takes place at the photographer's home studio${studioLocation ? ` at <strong>${esc(studioLocation)}</strong>` : ` in ${esc(HOME_STUDIO_AREA)}`}; the rental is waived (see Payment).${homeStudioRiderHtml}`
          : `If a dedicated indoor studio venue/space is required, applicable venue rental fees are quoted separately in advance.`;

    const innerHtml = `
      <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #111; padding: 20px; max-width: 800px; margin: 0 auto; background: #fff; line-height: 1.5;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 18px;">
          <div>
            <div style="font-family: 'Archivo', sans-serif; font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #000;">NERDYPHOTOGRAPHER.IN</div>
            <div style="font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 2px;">Fashion, Fitness &amp; Commercial Photography Studio</div>
            <div style="font-size: 11px; color: #555; margin-top: 2px;">Web: www.nerdyphotographer.in · Email: ${window.STUDIO_CONFIG?.email || "prateeksaxenaphotography@gmail.com"}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-family: monospace; font-size: 11px; font-weight: 700; background: #f0f0f0; border: 1px solid #ccc; padding: 4px 10px; border-radius: 4px;">REF: NP-CONTRACT-${esc(cVer)}-${esc(data.date || 'BLANK')}</div>
            <div style="font-size: 10px; color: #666; margin-top: 4px;">Issued: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </div>
        </div>

        <h2 style="font-family: 'Archivo', sans-serif; font-size: 17px; font-weight: 800; text-transform: uppercase; margin: 0 0 14px; text-align: center; letter-spacing: 0.05em;">
          ${isTfp ? 'Time-For-Print (TFP) Production &amp; Model Release Agreement' : 'Studio Shoot Booking Contract &amp; Production Agreement'}
        </h2>

        <!-- Production Brief Table with Blank Pen-Fill Line Support -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12px; border: 1px solid #ddd;">
          <tbody>
            <tr style="background: #f9f9f9;">
              <td style="padding: 8px 12px; font-weight: 700; border: 1px solid #ddd; width: 25%;">Client / Participant:</td>
              <td style="padding: 8px 12px; border: 1px solid #ddd; width: 25%;">${data.clientName ? esc(data.clientName) : '<span style="border-bottom: 1.5px solid #000; display: inline-block; width: 90%; height: 14px;">&nbsp;</span>'}</td>
              <td style="padding: 8px 12px; font-weight: 700; border: 1px solid #ddd; width: 25%;">Instagram / Contact:</td>
              <td style="padding: 8px 12px; border: 1px solid #ddd; width: 25%;">${(data.instagram || data.email) ? esc(data.instagram || data.email) : '<span style="border-bottom: 1.5px solid #000; display: inline-block; width: 90%; height: 14px;">&nbsp;</span>'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; font-weight: 700; border: 1px solid #ddd;">Scheduled Date:</td>
              <td style="padding: 8px 12px; border: 1px solid #ddd;">${data.date ? esc(data.date) : '<span style="border-bottom: 1.5px solid #000; display: inline-block; width: 90%; height: 14px;">&nbsp;</span>'}</td>
              <td style="padding: 8px 12px; font-weight: 700; border: 1px solid #ddd;">Session Duration:</td>
              <td style="padding: 8px 12px; border: 1px solid #ddd;">${data.duration ? esc(data.duration) : '<span style="border-bottom: 1.5px solid #000; display: inline-block; width: 90%; height: 14px;">&nbsp;</span>'}</td>
            </tr>
            <tr style="background: #f9f9f9;">
              <td style="padding: 8px 12px; font-weight: 700; border: 1px solid #ddd;">Shoot Location:</td>
              <td style="padding: 8px 12px; border: 1px solid #ddd;" colspan="3">${data.location ? esc(data.location) : '<span style="border-bottom: 1.5px solid #000; display: inline-block; width: 95%; height: 14px;">&nbsp;</span>'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; font-weight: 700; border: 1px solid #ddd;">Package &amp; Deliverables:</td>
              <td style="padding: 8px 12px; border: 1px solid #ddd;" colspan="3">${data.package ? esc(data.package) : '<span style="border-bottom: 1.5px solid #000; display: inline-block; width: 95%; height: 14px;">&nbsp;</span>'}</td>
            </tr>
            <tr style="background: #f9f9f9;">
              <td style="padding: 8px 12px; font-weight: 700; border: 1px solid #ddd;">Production Notes:</td>
              <td style="padding: 8px 12px; border: 1px solid #ddd;" colspan="3">${data.notes ? esc(data.notes) : '<span style="border-bottom: 1.5px dashed #999; display: block; width: 98%; height: 16px;">&nbsp;</span>'}</td>
            </tr>
          </tbody>
        </table>

        <!-- Payment & Rental Policy Box -->
        <div style="background: #fafafa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px 14px; margin-bottom: 18px; font-size: 11px; line-height: 1.4;">
          ${isTfp ? `
            <strong>📸 TFP Test Shoot Terms:</strong> This session is structured for mutual portfolio growth. Deliverables include ${esc(tfpSpecs)}. RAW format files are strictly confidential studio property and are excluded. ${studioClauseTfp}<br/>
            <strong>💳 Payment:</strong> ${tfpPaymentHtml}
          ` : `
            <strong>💳 Payment Milestones:</strong> ${paidSchedule.pdf}${paidAmountsHtml}<br/>
            <strong>🏢 Studio Venue Rental Policy:</strong> ${studioByPhotographer
              ? `The venue for this session${studioLocation ? ` (<strong>${esc(studioLocation)}</strong>)` : ''} is arranged and paid for by the Studio — <strong>no venue rental is billed to the client</strong>.${homeStudioRiderHtml}`
              : rentalFee > 0
                ? `This session takes place at the Studio's home studio in ${esc(HOME_STUDIO_AREA)}. A fixed home studio rental of <strong>${inr(rentalFee)}</strong>${rentalOff > 0 ? ` (${inr(rentalList)} less a ${inr(rentalOff)} discount${discountNote})` : ""} applies, is itemised above and is payable in full together with the advance retainer; nothing further is charged for the venue.${homeStudioRiderHtml}`
                : rentalWaived
                  ? `This session takes place at the Studio's home studio in ${esc(HOME_STUDIO_AREA)}. The home studio rental (normally ${inr(rentalList)}) is waived${discountNote}; nothing is charged for the venue.${homeStudioRiderHtml}`
                  : `Dedicated indoor studio venue rentals are <strong>quoted separately in advance</strong>, or the client may directly book their preferred studio space for the session.`}
          `}
        </div>

        <!-- Contract Terms Text -->
        <div style="margin-bottom: 20px;">
          <h3 style="font-family: 'Archivo', sans-serif; font-size: 13px; font-weight: 800; text-transform: uppercase; border-bottom: 1px solid #111; padding-bottom: 4px; margin: 0 0 8px;">
            Terms &amp; Conditions (Contract Version ${esc(cVer)})
          </h3>
          <div style="font-size: 10px; line-height: 1.5; color: #222; text-align: justify; white-space: pre-wrap;">${esc(contractText)}</div>
        </div>

        <!-- Digital & Physical Pen Signature Acceptance Block -->
        <div style="border: 2px dashed #111; border-radius: 8px; padding: 12px; background: #fff; page-break-inside: avoid;">
          <div style="font-family: 'Archivo', sans-serif; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #000; margin-bottom: 4px; text-align: center;">
            ✍️ Digital Approval Code OR Physical Pen Signature
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 8px; font-size: 10px; align-items: start;">
            <div>
              <strong>Method A — Digital Approval (DM / Email):</strong><br/>
              Reply to <strong>${window.STUDIO_CONFIG?.email || "prateeksaxenaphotography@gmail.com"}</strong> or DM <strong>@nerdyphotographer.in</strong>:<br/>
              <div style="font-family: monospace; font-size: 9px; font-weight: 700; background: #f4f4f4; border: 1px solid #ccc; padding: 5px; border-radius: 4px; margin-top: 4px;">"I approve Studio Contract Terms ${esc(cVer)}"</div>
            </div>
            <div style="border-left: 1px solid #ddd; padding-left: 12px;">
              ${isSigImage(data.sigDataUrl) ? `
                <strong>Client Digital Signature (Drawn at Booking):</strong><br/>
                <img src="${data.sigDataUrl}" style="max-width: 200px; max-height: 56px; display: block; margin-top: 8px; border-bottom: 1.5px solid #000;" alt="Client Signature" />
                <div style="margin-top: 4px; font-size: 9px; color: #444;">${esc(data.clientName || "")} · Agreed ${new Date().toLocaleDateString("en-IN")} · ${esc(data.agreedContract || cVer)}</div>
              ` : data.agreementMethod === "checkbox" ? `
                <strong>Digital Acceptance (Checkbox Confirmation):</strong><br/>
                <div style="margin-top: 8px;">${esc(data.clientName || "")} confirmed acceptance of the Studio Terms &amp; Conditions (V3.3) and Model Release by ticking the agreement box on the booking form.</div>
                <div style="margin-top: 4px; font-size: 9px; color: #444;">Recorded electronically at the time of booking \u00b7 no handwritten signature was requested.</div>
              ` : `
                <strong>Method B — Physical Pen Signature:</strong><br/>
                <div style="margin-top: 10px;">Client Sign: <span style="border-bottom: 1.5px solid #000; display: inline-block; width: 130px; height: 12px;">&nbsp;</span></div>
                <div style="margin-top: 6px;">Date: <span style="border-bottom: 1.5px solid #000; display: inline-block; width: 130px; height: 12px;">&nbsp;</span></div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;

    // Create isolated printing iframe
    let printIframe = document.getElementById("wpsPrintIframe");
    if (printIframe) printIframe.remove();

    printIframe = document.createElement("iframe");
    printIframe.id = "wpsPrintIframe";
    printIframe.style.cssText = "position: fixed; right: 0; bottom: 0; width: 0; height: 0; border: 0; opacity: 0; pointer-events: none;";
    document.body.appendChild(printIframe);

    const doc = printIframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>nerdyphotographer.in contract ${cVer}</title>
        <meta name="color-scheme" content="light">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          :root { color-scheme: light !important; }
          @page { size: A4 portrait; margin: 12mm 15mm; }
          @media print {
            :root, html, body {
              color-scheme: light !important;
              background-color: #ffffff !important;
              background: #ffffff !important;
              color: #000000 !important;
            }
          }
          html, body {
            color-scheme: light !important;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            color: #111111 !important;
            margin: 0;
            padding: 0;
            background-color: #ffffff !important;
            background: #ffffff !important;
            line-height: 1.5;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          * {
            color-scheme: light !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          h1, h2, h3, h4 { font-family: 'Archivo', sans-serif; color: #000000 !important; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12px; border: 1px solid #dddddd; background: #ffffff !important; color: #111111 !important; }
          td, th { padding: 8px 12px; border: 1px solid #dddddd; color: #111111 !important; }
        </style>
      </head>
      <body>
        ${innerHtml}
      </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      printIframe.contentWindow.focus();
      printIframe.contentWindow.print();
      setTimeout(() => {
        if (printIframe && printIframe.parentNode) {
          printIframe.parentNode.removeChild(printIframe);
        }
      }, 3000);
    }, 400);
  };

  window.openContractArchiveModal = function(ver) {
      const contract = window.WPS_CONTRACT_ARCHIVE[ver] || window.WPS_CONTRACT_ARCHIVE["V3.2"];
      let modal = document.getElementById("contractArchiveModal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "contractArchiveModal";
        modal.className = "modal-overlay";
        modal.style.cssText = "position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 20px;";
        document.body.appendChild(modal);
      }

      modal.innerHTML = `
        <div class="modal-content" style="background: var(--paper); border: 1px solid var(--line); border-radius: 14px; max-width: 720px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: var(--shadow); overflow: hidden; animation: modalFadeIn 0.3s ease;">
          <div style="padding: 20px 24px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; background: var(--bone);">
            <div>
              <h3 style="margin: 0; font-family: 'Archivo', sans-serif; font-size: var(--font-md); font-weight: 700; color: var(--ink);">${esc(contract.title)}</h3>
              <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 2px; font-family: var(--mono-font);">Effective: <strong>${esc(contract.effectiveDate)}</strong> · Status: <span style="color: var(--accent-text); font-weight:700;">${esc(contract.status)}</span></div>
            </div>
            <button type="button" onclick="document.getElementById('contractArchiveModal').style.display='none'" style="background:none; border:none; font-size: var(--font-md); color: var(--ink-soft); cursor:pointer;">✕</button>
          </div>
          <div style="padding: 24px; overflow-y: auto; font-size: var(--font-sm); line-height: 1.6; color: var(--ink); text-align: left;">
            <div style="background: var(--bone); border: 1px solid var(--line); padding: 12px 16px; border-radius: 8px; font-size: var(--font-xs); margin-bottom: 20px; color: var(--ink);">
              <strong>Vault Archive Summary:</strong> ${esc(contract.summary)}
            </div>
            <pre style="white-space: pre-wrap; font-family: inherit; font-size: var(--font-sm); line-height: 1.6; margin: 0; color: var(--ink);">${esc(contract.fullText)}</pre>
          </div>
          <div style="padding: 16px 24px; border-top: 1px solid var(--line); background: var(--bone); display: flex; justify-content: space-between; align-items: center;">
            <button type="button" class="admin-cal-btn" onclick="document.getElementById('contractArchiveModal').style.display='none'; window.openPdfContractGenerator('', '', '${esc(contract.version)}');" style="border-color: var(--accent-text); color: var(--accent-text); font-weight: 700;">🖨️ Print PDF of ${esc(contract.version)}</button>
            <button type="button" class="admin-cal-btn primary" onclick="document.getElementById('contractArchiveModal').style.display='none'">Close Vault Viewer</button>
          </div>
        </div>
      `;
      modal.style.display = "flex";
    };


  function wireCalendar() {
    function renderAdminPackagesEditor() {
      const promoGrid = $("#adminPromoCodesGrid");
      if (promoGrid) {
        const codes = getAdminPromoCodes();
        const activeInviteCode = typeof window.getAdminInviteCode === "function" ? window.getAdminInviteCode() : "NERDYBRAND";

        const creatorFormHtml = `
          <div id="promoCreatorForm" style="grid-column: 1 / -1; display: none; background: var(--paper); border: 1.5px solid var(--accent); border-radius: 8px; padding: 16px 18px; margin-bottom: 8px; box-shadow: var(--shadow-sm); animation: modalFadeIn 0.3s ease;">
            <div style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink); margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
              <span id="promoCreatorFormTitle">🎟️ Create New Custom Promotional Discount Code</span>
              <button type="button" onclick="document.getElementById('promoCreatorForm').style.display='none'" style="background:none; border:none; color:var(--ink-soft); font-size: var(--font-sm); cursor:pointer;">✕</button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; align-items: flex-end;">
              <div>
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; display: block; margin-bottom: 4px;">Promo Code String *</label>
                <input type="text" id="newPromoName" placeholder="e.g. SUMMER30" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-weight: 700; font-family: var(--mono-font); text-transform: uppercase; background: var(--bone); color: var(--ink);" />
              </div>
              <div>
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; display: block; margin-bottom: 4px;">Discount Type *</label>
                <select id="newPromoType" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: var(--font-xs); font-weight: 700; background: var(--bone); color: var(--ink);">
                  <option value="pct">Percentage Off (%)</option>
                  <option value="flat">Flat Amount (INR ₹)</option>
                </select>
              </div>
              <div>
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; display: block; margin-bottom: 4px;">Value Amount *</label>
                <input type="number" id="newPromoVal" placeholder="e.g. 30 or 1500, or 0 for home studio only" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-weight: 700; color: #059669; background: var(--bone);" />
              </div>
              <div style="grid-column: span 2;">
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; display: block; margin-bottom: 4px;">Description Label</label>
                <input type="text" id="newPromoDesc" placeholder="e.g. 30% Off Summer Shoots" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: var(--font-xs); background: var(--bone); color: var(--ink);" />
              </div>
              <div style="grid-column: span 2; background: var(--bone); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px;">
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; display: block; margin-bottom: 4px;">🏠 Home Studio Rental Discount</label>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <select id="newPromoHomeStudioType" onchange="window.togglePromoHomeStudioValField()" style="flex: 1; min-width: 150px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: var(--font-xs); font-weight: 700; background: var(--paper); color: var(--ink);">
                    <option value="none">No discount on the rental</option>
                    <option value="free">Free — 100% off</option>
                    <option value="flat">Flat ₹ off</option>
                    <option value="pct">% off</option>
                    <option value="fixed">Set the rental price</option>
                  </select>
                  <input type="number" id="newPromoHomeStudioVal" placeholder="e.g. 500" style="flex: 1; min-width: 100px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-weight: 700; color: #059669; background: var(--paper); display: none;" />
                </div>
                <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 4px; line-height: 1.4;">Only applies when the booking actually carries a home studio rental (dropdown pick, or a locked invite venue with a cost).</div>
              </div>
              ${window.codeDatesFieldsHtml("newPromo", 2)}
              <div style="grid-column: span 2;">
                <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer; background: var(--bone); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px;">
                  <input type="checkbox" id="newPromoActive" checked style="width: 16px; height: 16px; margin-top: 2px; accent-color: var(--accent-text); cursor: pointer;" />
                  <span style="font-size: var(--font-xs); color: var(--ink); font-family: 'Archivo', sans-serif; line-height: 1.4;">
                    <strong>Active</strong> — clients can use this code.<br/>
                    <span style="color: var(--ink-soft);">Untick to switch it off without deleting it. The code keeps its wording and settings, and anyone typing it is told it is not valid. Tick it again whenever you want it back.</span>
                  </span>
                </label>
                <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer; background: var(--bone); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px;">
                  <input type="checkbox" id="newPromoIncludeAddons" style="width: 16px; height: 16px; margin-top: 2px; accent-color: var(--accent-text); cursor: pointer;" />
                  <span style="font-size: var(--font-xs); color: var(--ink); font-family: 'Archivo', sans-serif; line-height: 1.4;">
                    <strong>Also discount the rental</strong> — the % also comes off the home studio rental, instead of the package rate alone.<br/>
                    <span style="color: var(--ink-soft);">Only changes anything on a <strong>% code</strong>. On a flat ₹ code the saving is the same either way, so leave it unticked.</span>
                  </span>
                </label>
              </div>
              <div>
                <button type="button" class="admin-cal-btn primary" onclick="window.saveNewPromoCodeFromForm()" style="width: 100%; font-weight: 700; padding: 8px 12px;">💾 Save Promo Code</button>
              </div>
            </div>
          </div>
        `;

        const allInviteCodes = typeof window.getAdminInviteCodes === "function" ? window.getAdminInviteCodes() : [{ code: activeInviteCode, desc: 'Default Code' }];
        const inviteItemsHtml = allInviteCodes.map((itemObj, idx) => {
          const codeStr = typeof itemObj === 'object' ? itemObj.code : itemObj;
          const descStr = typeof itemObj === 'object' ? (itemObj.desc || 'Admin VIP Code') : 'Admin VIP Code';
          // Off and ended are dimmed; a code waiting for its start date is not
          // — it is set up and healthy, it just has not begun.
          const inviteState = window.codeStatus(itemObj);
          const inviteIsOn = !(itemObj && typeof itemObj === 'object' && itemObj.active === false);
          const inviteDates = window.codeDatesLine(itemObj);
          return `
            <div style="background: var(--paper); border: 1px solid var(--accent); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; justify-content: space-between; gap: 10px;${inviteState === "off" || inviteState === "ended" ? " opacity: 0.55;" : ""} box-shadow: var(--shadow-sm); overflow: hidden;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
                <!-- A real basis, not flex: 1 alone: with four buttons beside it
                     the text column used to shrink until the code broke across
                     four lines. Now the buttons drop underneath instead. -->
                <div style="min-width: 0; flex: 1 1 190px;">
                  <span style="font-size: var(--font-xs); font-weight: 800; color: var(--accent-text); text-transform: uppercase; font-family: var(--mono-font); display: flex; align-items: center; gap: 6px; flex-wrap: wrap;"><span>${codeStr === activeInviteCode ? '⭐ Primary Code' : '🔑 VIP Invite'}</span>${window.codeStatusBadgeHtml(itemObj)}</span>
                  <strong style="font-size: var(--font-md); font-family: var(--mono-font); color: var(--ink); letter-spacing: 0.04em; display: block; margin-top: 2px; word-break: break-all;">${esc(codeStr)}</strong>
                  <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 4px; line-height: 1.3;">📝 ${esc(descStr)}</div>
                  ${itemObj && typeof itemObj === 'object' && itemObj.location ? `<div style="font-size: var(--font-xs); color: #059669; font-weight: 700; margin-top: 4px;">🏠 Location Locked: ${esc(itemObj.location)}</div>` : ''}
                  ${inviteDates ? `<div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 4px;">📅 ${esc(inviteDates)}</div>` : ''}
                </div>
                <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap; flex-shrink: 0; margin-top: 2px;">
                  <button type="button" onclick="navigator.clipboard.writeText('${escJs(codeStr)}'); if(typeof toast==='function') toast('📋 Invite Code ${escJs(codeStr)} copied!'); else alert('Copied!');" style="background: var(--accent); color: #ffffff; border: none; padding: 5px 9px; border-radius: 4px; font-size: var(--font-xs); cursor: pointer; font-weight: 700; font-family: var(--mono-font);" title="Copy Invite Code">📋 Copy</button>
                  <button type="button" onclick="window.toggleAdminInviteActive('${escJs(codeStr)}')" style="background: var(--bone); color: var(--ink); border: 1px solid var(--line); padding: 5px 8px; border-radius: 4px; font-size: var(--font-xs); cursor: pointer; font-weight: 700;" title="${inviteIsOn ? "Switch this code off" : "Switch this code back on"}">${inviteIsOn ? "⏸️" : "▶️"}</button>
                  <button type="button" onclick="window.editAdminInviteCode('${escJs(codeStr)}')" style="background: var(--bone); color: var(--ink); border: 1px solid var(--line); padding: 5px 8px; border-radius: 4px; font-size: var(--font-xs); cursor: pointer; font-weight: 700;" title="Edit Code">✏️ Edit</button>
                  <button type="button" onclick="window.deleteAdminInviteCode('${escJs(codeStr)}')" style="background: rgba(255,77,77,0.1); color: #ff4d4d; border: 1px solid rgba(255,77,77,0.3); padding: 5px 8px; border-radius: 4px; font-size: var(--font-xs); cursor: pointer; font-weight: 700;" title="Delete Code">🗑️</button>
                </div>
              </div>
            </div>
          `;
        }).join("");

        const inviteCardHtml = `
          <div style="grid-column: 1 / -1; background: rgba(255, 69, 0, 0.06); border: 1.5px solid var(--accent); border-radius: 10px; padding: 16px 18px; margin-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
              <div>
                <div style="font-size: var(--font-xs); font-weight: 800; color: var(--accent-text); text-transform: uppercase; letter-spacing: 0.06em;">🔑 Photographer Direct Invite Codes (VIP / TFP Unlock Manager)</div>
                <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 2px;">Create, edit, auto-generate, or delete multiple active invite codes. Invited talent entering ANY active code on /book unlocks a Test Shoot / TFP session.</div>
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button type="button" onclick="window.addNewAdminInviteCode()" class="admin-cal-btn primary" style="font-size: var(--font-xs); padding: 5px 12px; font-weight: 700;">➕ Add Custom Code</button>
                <button type="button" onclick="window.generateRandomAdminInviteCode()" class="admin-cal-btn" style="font-size: var(--font-xs); padding: 5px 12px; font-weight: 700; border-color: var(--accent-text); color: var(--accent-text);">🎲 Auto-Generate Random VIP Code</button>
              </div>
            </div>
            <div id="inviteCreatorForm" style="display: none; background: var(--paper); border: 1.5px solid var(--accent); border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; box-shadow: var(--shadow-sm); animation: modalFadeIn 0.3s ease;">
              <div style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink); margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                <span id="inviteCreatorFormTitle">🔑 Add New Invite Code</span>
                <button type="button" onclick="document.getElementById('inviteCreatorForm').style.display='none'" style="background:none; border:none; color:var(--ink-soft); font-size: var(--font-sm); cursor:pointer;">✕</button>
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; align-items: flex-end;">
                <div>
                  <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; display: block; margin-bottom: 4px;">Invite Code String *</label>
                  <input type="text" id="newInviteCode" placeholder="e.g. VIP-2431" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-weight: 700; font-family: var(--mono-font); text-transform: uppercase; background: var(--bone); color: var(--ink);" />
                </div>
                <div style="grid-column: span 2;">
                  <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; display: block; margin-bottom: 4px;">Description Label</label>
                  <input type="text" id="newInviteDesc" placeholder="e.g. Agency model unlock pass" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: var(--font-xs); background: var(--bone); color: var(--ink);" />
                </div>
                <div style="grid-column: span 3;">
                  <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; display: block; margin-bottom: 4px;">🏠 Lock Location for Client <span style="font-weight:400;text-transform:none;color:var(--ink-soft);">(optional — leave blank to let client fill)</span></label>
                  <input type="text" id="newInviteLocation" placeholder="e.g. Home studio, Sector 46, Noida — or leave blank" oninput="window.syncInviteWaiveVisibility && window.syncInviteWaiveVisibility()" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: var(--font-xs); background: var(--bone); color: var(--ink);" />
                </div>
                <!-- Only shown when the code leaves the venue to the talent. A
                     code that names a venue has already had it chosen for them
                     by the studio, so the rental is waived and there is nothing
                     here to decide. -->
                <div id="newInviteWaiveRow" style="grid-column: span 3; display: none;">
                  <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; display: block; margin-bottom: 4px;">💰 Venue cost for this code <span style="font-weight:400;text-transform:none;color:var(--ink-soft);">(optional — leave blank if it is free)</span></label>
                  <input type="number" min="0" id="newInviteVenueCost" placeholder="Blank = complimentary" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: var(--font-xs); font-weight: 700; color: #059669; background: var(--bone);" />
                  <span style="display: block; margin-top: 5px; font-size: var(--font-xs); line-height: 1.5; color: var(--ink-soft);">You picked the venue above, so you decide what it costs. Leave this blank and the shoot is complimentary. Enter an amount and the talent is billed exactly that, shown as its own line in their quote and payable in full before the shoot.</span>
                </div>
                <div id="newInviteVenueNote" style="grid-column: span 3; font-size: var(--font-xs); line-height: 1.5; color: var(--ink-soft); background: var(--bone); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px;">
                  🏠 <strong style="color: var(--ink);">No venue locked, so the talent chooses.</strong> If they pick your home studio they are billed your standard home studio rate (currently ₹${(typeof getHomeStudioRate === "function" ? getHomeStudioRate() : 3000).toLocaleString('en-IN')}). Fill in an address above to choose the venue for them and set its cost.
                </div>
                <!-- Same discount shape as a promo code's (none/flat/pct/free),
                     so a VIP invite can waive or reduce the home studio rate on
                     its own, without needing a separate promo code entered too.
                     Applies to whatever fee the code carries above — the
                     standard rate when no venue is locked, or the locked
                     venue's own cost when one is. -->
                <div style="grid-column: span 3; background: var(--bone); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px;">
                  <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; display: block; margin-bottom: 4px;">🏠 Home Studio Rental Discount</label>
                  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <select id="newInviteHomeStudioType" onchange="window.toggleInviteHomeStudioValField()" style="flex: 1; min-width: 150px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: var(--font-xs); font-weight: 700; background: var(--paper); color: var(--ink);">
                      <option value="none">No discount on the rental</option>
                      <option value="free">Free — 100% off</option>
                      <option value="flat">Flat ₹ off</option>
                      <option value="pct">% off</option>
                    </select>
                    <input type="number" id="newInviteHomeStudioVal" placeholder="e.g. 500" style="flex: 1; min-width: 100px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-weight: 700; color: #059669; background: var(--paper); display: none;" />
                  </div>
                  <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 4px; line-height: 1.4;">Only applies when the booking actually carries a home studio rental (standard rate, or this code's own locked venue cost above).</div>
                </div>
                ${window.codeDatesFieldsHtml("newInvite", 3)}
                <div style="grid-column: span 3;">
                  <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer; background: var(--bone); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px;">
                    <input type="checkbox" id="newInviteActive" checked style="width: 16px; height: 16px; margin-top: 2px; accent-color: var(--accent-text); cursor: pointer;" />
                    <span style="font-size: var(--font-xs); color: var(--ink); font-family: 'Archivo', sans-serif; line-height: 1.4;">
                      <strong>Active</strong> — invited talent can use this code.<br/>
                      <span style="color: var(--ink-soft);">Untick to switch it off without deleting it. The code keeps everything set here, and anyone typing it is told it is not recognised. Tick it again whenever you want it back.</span>
                    </span>
                  </label>
                </div>
                <div>
                  <button type="button" class="admin-cal-btn primary" onclick="window.saveInviteCodeFromForm()" style="width: 100%; font-weight: 700; padding: 8px 12px;">💾 Save Invite Code</button>
                </div>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
              ${inviteItemsHtml}
            </div>
          </div>
        `;

        const codeCardsHtml = Object.keys(codes).map(codeKey => {
          const item = codes[codeKey];
          // A package value of 0 means this code exists only to compensate
          // the home studio rental — "0% Off" would misstate that as a
          // discount the code does not actually give.
          const hasPackageDiscount = !!(item.flat || item.pct);
          const tagDesc = !hasPackageDiscount
            ? "Home Studio Only"
            : (item.flat ? `Flat ₹${item.flat.toLocaleString('en-IN')} Off` : `${item.pct}% Off`);
          const hsDiscount = window.getPromoHomeStudioDiscount(item);
          const hsBadge = hsDiscount.type === "free"
            ? `<span style="font-size: var(--font-xs); font-weight: 700; background: rgba(5,150,105,0.12); color: #059669; padding: 2px 6px; border-radius: 4px;" title="Home studio rental is free with this code">🏠 FREE</span>`
            : hsDiscount.type === "flat"
              ? `<span style="font-size: var(--font-xs); font-weight: 700; background: rgba(5,150,105,0.12); color: #059669; padding: 2px 6px; border-radius: 4px;" title="Home studio rental discount">🏠 ₹${Number(hsDiscount.value || 0).toLocaleString('en-IN')} OFF</span>`
              : hsDiscount.type === "pct"
                ? `<span style="font-size: var(--font-xs); font-weight: 700; background: rgba(5,150,105,0.12); color: #059669; padding: 2px 6px; border-radius: 4px;" title="Home studio rental discount">🏠 ${hsDiscount.value}% OFF</span>`
                : "";
          // Off and ended are dimmed; a code waiting for its start date is not.
          const promoState = window.codeStatus(item);
          const promoDates = window.codeDatesLine(item);
          return `
            <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 10px;${promoState === "off" || promoState === "ended" ? " opacity: 0.55;" : ""} box-shadow: var(--shadow-sm); overflow: hidden; flex-wrap: wrap;">
              <div style="min-width: 0; flex: 1 1 190px;">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <strong style="color: #059669; font-size: var(--font-sm); font-family: var(--mono-font); letter-spacing: 0.04em;">${esc(codeKey)}</strong>
                  <span style="font-size: var(--font-xs); font-weight: 700; background: rgba(5,150,105,0.12); color: #059669; padding: 2px 6px; border-radius: 4px;">${esc(tagDesc)}</span>
                  ${!hasPackageDiscount
                    ? ""
                    : item.includeAddons
                      ? `<span style="font-size: var(--font-xs); font-weight: 700; background: rgba(217,119,6,0.14); color: #d97706; padding: 2px 6px; border-radius: 4px;" title="This discount also comes off the home studio rental">+ ADD-ONS</span>`
                      : `<span style="font-size: var(--font-xs); font-weight: 700; background: rgba(120,120,120,0.14); color: var(--ink-soft); padding: 2px 6px; border-radius: 4px;" title="Discount applies to the package rate only">PACKAGE ONLY</span>`}
                  ${hsBadge}
                  ${window.codeStatusBadgeHtml(item)}
                </div>
                <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 2px;">${esc(item.label)}</div>
                ${promoDates ? `<div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 2px;">📅 ${esc(promoDates)}</div>` : ""}
              </div>
              <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap; flex-shrink: 0;">
                <button type="button" onclick="navigator.clipboard.writeText('${escJs(codeKey)}'); if(typeof toast==='function') toast('📋 Promo Code ${escJs(codeKey)} copied!'); else alert('Copied!');" style="background: #059669; color: #ffffff; border: none; padding: 5px 10px; border-radius: 4px; font-size: var(--font-xs); cursor: pointer; font-weight: 700; font-family: var(--mono-font);" title="Copy Code">📋 Copy</button>
                <button type="button" onclick="window.toggleAdminPromoActive('${escJs(codeKey)}')" style="background: var(--bone); color: var(--ink); border: 1px solid var(--line); padding: 5px 8px; border-radius: 4px; font-size: var(--font-xs); cursor: pointer; font-weight: 700;" title="${window.promoCodeIsActive(item) ? "Switch this code off" : "Switch this code back on"}">${window.promoCodeIsActive(item) ? "⏸️" : "▶️"}</button>
                <button type="button" onclick="window.editAdminPromoCode('${escJs(codeKey)}')" style="background: var(--bone); color: var(--ink); border: 1px solid var(--line); padding: 5px 8px; border-radius: 4px; font-size: var(--font-xs); cursor: pointer; font-weight: 700;" title="Edit Code">✏️ Edit</button>
                <button type="button" onclick="window.deleteAdminPromoCode('${escJs(codeKey)}')" style="background: rgba(255,77,77,0.1); color: #ff4d4d; border: 1px solid rgba(255,77,77,0.3); padding: 5px 8px; border-radius: 4px; font-size: var(--font-xs); cursor: pointer; font-weight: 700;" title="Delete Code">🗑️</button>
              </div>
            </div>
          `;
        }).join("");

        promoGrid.innerHTML = creatorFormHtml + codeCardsHtml;
        const inviteGrid = $("#adminInviteCodesGrid");
        if (inviteGrid) inviteGrid.innerHTML = inviteCardHtml;
        if (window.codesAreUnpublished()) markUnsavedChanges();
      }

      // Attach input change listener to flip status badge to UNSAVED CHANGES
      setTimeout(() => {
        const editorInputs = document.querySelectorAll(".pkg-edit-name, .pkg-edit-price, .pkg-edit-specs");
        editorInputs.forEach(input => {
          input.addEventListener("input", () => markUnsavedChanges());
        });
      }, 50);

      const pkgsGrid = $("#adminPackagesEditorGrid");
      if (!pkgsGrid) return;
      const pkgs = getAdminPackages();
      pkgsGrid.innerHTML = pkgs.map((p, idx) => `
        <div class="admin-pkg-editor-row" style="background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; display: grid; grid-template-columns: 1.4fr 0.9fr 2.2fr 110px; gap: 10px; align-items: center;">
          <div>
            <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); display: block; margin-bottom: 4px; text-transform: uppercase;">Package Name #${idx+1}</span>
            <input type="text" class="pkg-edit-name" value="${esc(p.name)}" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); font-weight: 700; background: var(--bone); color: var(--ink);" />
          </div>
          <div>
            <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); display: block; margin-bottom: 4px; text-transform: uppercase;">Max Rate (INR ₹)</span>
            <input type="number" class="pkg-edit-price" value="${p.price}" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); font-weight: 800; color: #059669; background: var(--bone);" />
          </div>
          <div>
            <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); display: block; margin-bottom: 4px; text-transform: uppercase;">Deliverable Specs</span>
            <input type="text" class="pkg-edit-specs" value="${esc(p.specs)}" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); background: var(--bone); color: var(--ink);" />
          </div>
          <div>
            <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); display: block; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;">Delivery time <span style="font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--ink-soft);">(optional, shown on the quote)</span></span>
            <input type="text" class="pkg-edit-delivery" value="${esc(p.delivery || "")}" placeholder="e.g. 10 working days" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); background: var(--bone); color: var(--ink);" />
          </div>
          <div style="display: flex; gap: 4px; justify-content: flex-end; padding-top: 14px;">
            <button type="button" class="admin-cal-btn" onclick="window.copyPackageBookingLink(${p.price})" title="Copy Shareable Booking Link" style="font-size: var(--font-xs); padding: 6px 8px; border-color: var(--accent-text); color: var(--accent-text); font-weight: 700;">🔗 Share Link</button>
            <button type="button" class="admin-cal-btn" onclick="window.moveAdminPackageRow(${idx}, -1)" title="Move Up" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:not-allowed; padding:6px 8px; font-size: var(--font-xs);"' : 'style="padding:6px 8px; font-size: var(--font-xs);"'}>▲</button>
            <button type="button" class="admin-cal-btn" onclick="window.moveAdminPackageRow(${idx}, 1)" title="Move Down" ${idx === pkgs.length - 1 ? 'disabled style="opacity:0.3; cursor:not-allowed; padding:6px 8px; font-size: var(--font-xs);"' : 'style="padding:6px 8px; font-size: var(--font-xs);"'}>▼</button>
            <button type="button" class="admin-cal-btn" onclick="window.deleteAdminPackageRow(${idx})" title="Delete Package Tier" style="color: var(--danger-text); border-color: rgba(178,34,34,0.3); padding: 6px 8px; font-size: var(--font-xs);">🗑️</button>
          </div>
        </div>
      `).join("") + (() => {
        // Test-shoot row: same shape as a tier, but no fee (the TFP home
        // studio rental is set above) and no reorder/delete — there is
        // exactly one. Its deliverables line feeds the booking form's
        // test-shoot notices, the terms modal and the quote.
        const tfp = getAdminTfpPackage();
        return `
        <div class="admin-pkg-editor-row admin-pkg-editor-row--tfp" style="background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; display: grid; grid-template-columns: 1.4fr 0.9fr 2.2fr 110px; gap: 10px; align-items: center;">
          <div>
            <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); display: block; margin-bottom: 4px; text-transform: uppercase;">Test shoot / TFP</span>
            <input type="text" id="tfpPkgName" value="${esc(tfp.name)}" oninput="window.markUnsavedChanges && window.markUnsavedChanges()" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); font-weight: 700; background: var(--bone); color: var(--ink);" />
          </div>
          <div>
            <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); display: block; margin-bottom: 4px; text-transform: uppercase;">Fee</span>
            <div style="padding: 8px 10px; border: 1px dashed var(--line); border-radius: 6px; font-size: var(--font-xs); color: var(--ink-soft); background: transparent;">No fee · rental set above</div>
          </div>
          <div>
            <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); display: block; margin-bottom: 4px; text-transform: uppercase;">Deliverable Specs</span>
            <input type="text" id="tfpPkgSpecs" value="${esc(tfp.specs)}" oninput="window.markUnsavedChanges && window.markUnsavedChanges()" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); background: var(--bone); color: var(--ink);" />
          </div>
          <div>
            <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); display: block; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;">Delivery time <span style="font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--ink-soft);">(optional, shown on the quote)</span></span>
            <input type="text" id="tfpPkgDelivery" value="${esc(tfp.delivery || "")}" oninput="window.markUnsavedChanges && window.markUnsavedChanges()" placeholder="e.g. 14 working days" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); background: var(--bone); color: var(--ink);" />
          </div>
          <div style="display: flex; gap: 4px; justify-content: flex-end; padding-top: 14px;">
            <button type="button" class="admin-cal-btn" onclick="window.copyTfpBookingLink()" title="Copy a booking link that opens the test-shoot form with your primary invite code" style="font-size: var(--font-xs); padding: 6px 8px; border-color: var(--accent-text); color: var(--accent-text); font-weight: 700;">Share link</button>
          </div>
        </div>`;
      })() + `
        <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <button type="button" class="admin-cal-btn primary" onclick="window.addNewAdminPackageRow()" style="font-size: var(--font-xs); padding: 6px 14px; font-weight: 700;">Add package tier (${pkgs.length} now)</button>
          <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Reorder with ▲ ▼ · the test-shoot row is fixed and carries no fee.</span>
        </div>
      `;
    }
    // The global add/edit/delete handlers for promo & invite codes guard on
    // `typeof renderAdminPackagesEditor === "function"` to repaint this grid;
    // without this export the guard never passed and every mutation looked
    // like a silent no-op (the draft changed but the screen didn't).
    window.renderAdminPackagesEditor = renderAdminPackagesEditor;

    let calYear = new Date().getFullYear();
    let calMonth = new Date().getMonth();

    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

    function renderAdminGrid() {
      syncCalendarWithAudits();
      const container = $("#adminCalGridContainer");
      const title = $("#adminCalMonthTitle");
      if (!container || !title) return;

      title.textContent = `${MONTHS[calMonth]} ${calYear}`;

      window.jumpToCalMonth = function(yr, mo) {
        calYear = yr;
        calMonth = mo;
        renderAdminGrid();
      };

      const settings = window.WPS_DATA.CALENDAR_SETTINGS || {};
      const jumpBar = $("#adminCalMonthJumpBar");
      if (jumpBar) {
        const bookedKeys = Object.keys(settings.bookedDates || {});
        const monthSet = new Set();
        const now = new Date();
        monthSet.add(`${now.getFullYear()}-${now.getMonth()}`);
        bookedKeys.forEach(k => {
          const parts = k.split("-").map(Number);
          if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            monthSet.add(`${parts[0]}-${parts[1] - 1}`);
          }
        });
        const activeMonths = Array.from(monthSet).map(str => {
          const [yr, mo] = str.split("-").map(Number);
          return { yr, mo, label: `${MONTHS[mo].slice(0,3)} ${yr}` };
        }).sort((a, b) => (a.yr * 12 + a.mo) - (b.yr * 12 + b.mo));

        jumpBar.innerHTML = activeMonths.map(m => `
          <button type="button" class="admin-cal-btn" style="padding: 3px 8px; font-size: var(--font-xs); font-family: var(--mono-font); ${calYear === m.yr && calMonth === m.mo ? 'background: var(--accent); color: #fff; font-weight: 700; border-color: var(--accent-text);' : ''}" onclick="window.jumpToCalMonth(${m.yr}, ${m.mo})">${m.label}</button>
        `).join("");
      }

      const firstDay = new Date(calYear, calMonth, 1).getDay();
      const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
      const today = new Date();
      today.setHours(0,0,0,0);

      let html = `<div class="admin-cal-grid">`;
      DAYS.forEach(d => {
        html += `<div class="admin-cal-day-label">${d}</div>`;
      });

      for (let i = 0; i < firstDay; i++) {
        html += `<div class="admin-cal-day day-empty"></div>`;
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(calYear, calMonth, day);
        const status = getCalDateStatus(d);
        const isPast = d < today;

        const dayClasses = ["admin-cal-day"];
        if (isPast) dayClasses.push("day-past");
        if (d.getTime() === today.getTime()) dayClasses.push("day-today");
        
        if (status.hasWorkshop && !status.hasConfirmedBooking) {
          dayClasses.push("day-workshop");
        } else if (status.hasAssisting && !status.hasConfirmedBooking) {
          dayClasses.push("day-assisting");
        } else if (status.hasTestShoot && status.hasConfirmedBooking) {
          dayClasses.push("day-testshoot");
        } else if (status.hasConfirmedBooking) {
          dayClasses.push("day-booked");
        } else if (status.isTentativeOnly) {
          dayClasses.push("day-tentative");
        } else if (status.isBlocked) {
          dayClasses.push("day-blocked");
        } else {
          dayClasses.push("day-open");
        }

        html += `
          <div class="${dayClasses.join(" ")}" data-date="${status.key}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <span class="admin-cal-num">${day}</span>
              ${status.hasWorkshop && !status.hasConfirmedBooking ? `<span class="admin-cal-badge badge-workshop">Workshop</span>` :
                status.hasAssisting && !status.hasConfirmedBooking ? `<span class="admin-cal-badge badge-assisting">Assisting</span>` :
                status.hasTestShoot && status.hasConfirmedBooking ? `<span class="admin-cal-badge badge-testshoot">Test shoot${status.bookings.length > 1 ? ` · ${status.bookings.length}` : ""}</span>` :
                status.hasConfirmedBooking ? `<span class="admin-cal-badge badge-booked">Booked${status.bookings.length > 1 ? ` · ${status.bookings.length}` : ""}</span>` :
                status.isTentativeOnly ? `<span class="admin-cal-badge badge-tentative">Hold${status.bookings.length > 1 ? ` · ${status.bookings.length}` : ""}</span>` :
                status.isBlocked ? `<span class="admin-cal-badge badge-blocked">${status.isDefaultBlockedWeekday ? "Weekday Blocked" : "Custom Blocked"}</span>` :
                `<span class="admin-cal-badge badge-open">Open</span>`
              }
            </div>
            <div>
              ${status.bookings.map(b => `<div class="admin-cal-client-item" title="${esc(b.name)} - ${esc(b.type)}">${esc(b.name)}</div>`).join("")}
            </div>
          </div>
        `;
      }

      html += `</div>`;
      container.innerHTML = html;

      container.querySelectorAll(".admin-cal-day[data-date]").forEach(cell => {
        cell.addEventListener("click", () => {
          openDateAdminModal(cell.dataset.date);
        });
      });

      renderRoster();
    }

    function renderRoster() {
      const rosterGrid = $("#bookingRosterGrid");
      const countBadge = $("#rosterCountBadge");
      if (!rosterGrid) return;

      const settings = window.WPS_DATA.CALENDAR_SETTINGS || {};
      const allBookings = [];

      Object.keys(settings.bookedDates || {}).forEach(dKey => {
        const list = settings.bookedDates[dKey] || [];
        list.forEach(b => {
          allBookings.push({ dateKey: dKey, ...b });
        });
      });

      // Calculate today's YYYY-MM-DD
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const todayKey = `${yyyy}-${mm}-${dd}`;

      // Separate into Upcoming (today onwards) vs Past (before today)
      const upcomingBookings = allBookings.filter(b => b.dateKey >= todayKey).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
      const pastBookings = allBookings.filter(b => b.dateKey < todayKey).sort((a, b) => b.dateKey.localeCompare(a.dateKey));

      if (countBadge) {
        countBadge.textContent = `${upcomingBookings.length} Active Upcoming · ${pastBookings.length} Past Completed`;
      }

      const renderBookingCardHtml = (b, isPast = false) => {
        const isNonContract = (b.type === "Assisting Photographer" || b.type === "Workshop Attended" || (b.title && (b.title.includes("Assisting") || b.title.includes("Workshop"))));
        const v = b.contractVersion || (b.agreedToTerms ? "V3.2" : "Pending Agreement");
        const viewTermsBtn = ` <button type="button" class="linkish" onclick="window.openContractArchiveModal('${esc(v)}')">View terms ↗</button>`;
        // agreedToTerms is only explicitly false on a record that was created
        // with terms sent but unsigned — a contract-generated hold. Older
        // records simply don't carry the field, and keep the "Agreed" wording.
        const awaitingApproval = b.agreedToTerms === false && v !== "Pending Agreement" && v !== "Custom Contract";
        const contractLine = isNonContract
          ? `<span>Internal activity · no contract</span>`
          : v === "Pending Agreement" ? `<span style="color: #B7791F; font-weight: 600;">Agreement pending</span>`
          : v === "Custom Contract" ? `<span>Custom contract / MSA</span>`
          : awaitingApproval ? `<span class="contract-sent-note">Contract sent · ${esc(v)} · awaiting client approval</span>${viewTermsBtn}`
          : `<span><strong>Agreed:</strong> ${esc(v)}</span>${viewTermsBtn}`;
        const statusPill = b.status === "workshop" ? `<span class="roster-pill roster-pill-workshop">Workshop</span>` : b.status === "assisting" ? `<span class="roster-pill roster-pill-assisting">Assisting</span>` : (b.isTentative || b.status === "tentative") ? `<span class="roster-pill roster-pill-hold">Hold</span>` : `<span class="roster-pill roster-pill-confirmed">Confirmed</span>`;
        const links = (b.links && b.links.length) ? `<div><strong>Reference links:</strong> ${b.links.map(l => `<a href="${esc(l)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-text); word-break: break-all;">${esc(l)} ↗</a>`).join(" · ")}</div>` : "";
        const atts = (b.attachments && b.attachments.length) ? `<div><strong>Attachments:</strong> ${b.attachments.map(att => `<a href="${esc(att.dataUrl)}" download="${esc(att.name)}" target="_blank" style="color: var(--accent-text);">${esc(att.name)} (${Math.round(att.size/1024)} KB)</a>`).join(" · ")}</div>` : "";
        const hasMore = !!(b.email || b.phone || links || atts);
        return `
        <div class="booking-row${isPast ? " is-past" : ""}">
          <span class="br-date">${esc(b.dateKey)}</span>
          <div class="br-main">
            <div class="br-name">${esc(b.name)}</div>
            <div class="br-sub">${esc(b.type || "General Shoot")}${b.notes ? ` · <em>${esc(b.notes)}</em>` : ""}</div>
            <div class="br-sub br-contract">${contractLine}</div>
          </div>
          <span>${statusPill}</span>
          <span class="br-sub">${esc(b.duration || "Full Day")}</span>
          <div class="br-actions">
            ${isDecidableHold(b) && !isPast ? `<button type="button" class="linkish hold-accept" onclick="window.acceptHoldBooking('${b.dateKey}', '${b.id}')">✓ Accept</button><button type="button" class="linkish hold-reject" onclick="window.rejectHoldBooking('${b.dateKey}', '${b.id}')">✕ Reject</button>` : ""}
            <button type="button" class="linkish" onclick="window.openEditBookingModal('${b.dateKey}', '${b.id}')">Edit</button>
            <button type="button" class="linkish muted" onclick="window.removeBookingFromRoster('${b.dateKey}', '${b.id}')">Cancel</button>
            ${hasMore ? `<button type="button" class="linkish muted" onclick="this.closest('.booking-row').classList.toggle('is-open')">Details</button>` : ""}
          </div>
          ${hasMore ? `<div class="br-more">${b.email ? `<div><strong>Email:</strong> ${esc(b.email)}</div>` : ""}${b.phone ? `<div><strong>Phone:</strong> ${esc(b.phone)}</div>` : ""}${links}${atts}</div>` : ""}
        </div>`;
      };

      if (!upcomingBookings.length) {
        rosterGrid.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--ink-soft); font-family: var(--mono-font); font-size: 12px; background: var(--bone); border-radius: var(--r-sm); border: 1px dashed var(--line);">
            ✅ No upcoming client bookings recorded from today onwards (${todayKey}). All past bookings are listed in the Past Completed Archive below.
          </div>
        `;
      } else {
        rosterGrid.innerHTML = upcomingBookings.map(b => renderBookingCardHtml(b, false)).join("");
      }

      // Render Past Completed Bookings Archive if any exist
      let pastArchiveSection = document.getElementById("pastBookingsArchiveSec");
      if (!pastArchiveSection) {
        pastArchiveSection = document.createElement("div");
        pastArchiveSection.id = "pastBookingsArchiveSec";
        pastArchiveSection.style.cssText = "margin-top: 36px; border-top: 1px solid var(--line); padding-top: 24px;";
        rosterGrid.parentNode.appendChild(pastArchiveSection);
      }

      if (pastBookings.length) {
        pastArchiveSection.innerHTML = `
          <details style="width: 100%;">
            <summary style="font-family: 'Archivo', sans-serif; font-size: 16px; font-weight: 700; color: var(--ink-soft); cursor: pointer; padding: 8px 0; user-select: none;">
              Past shoots &amp; archive (${pastBookings.length})
            </summary>
            <div class="booking-roster-grid" style="margin-top: 16px;">
              ${pastBookings.map(b => renderBookingCardHtml(b, true)).join("")}
            </div>
          </details>
        `;
      } else {
        pastArchiveSection.innerHTML = "";
      }
    }
    window.removeBookingFromRoster = (dKey, bId) => {
      if (confirm(`Are you sure you want to remove this booking for ${dKey}?`)) {
        removeCalBooking(dKey, bId);
        toast("Booking removed.");
        renderAdminGrid();
        updateAdminReminders();
      }
    };

    // Redraw every admin view of the calendar at once. Exposed on window
    // because the contract generator lives at module scope, outside this
    // closure, and its hold has to show up without a page reload.
    window.refreshAdminCalendarViews = () => {
      renderAdminGrid();
      renderRoster();
      updateAdminReminders();
    };

    const findBooking = (dKey, bId) => {
      const settings = window.WPS_DATA?.CALENDAR_SETTINGS || {};
      return ((settings.bookedDates && settings.bookedDates[dKey]) || [])
        .find(x => x.id === bId || x.name === bId) || null;
    };
    const closeDayModal = () => {
      const mc = document.getElementById("dateAdminModalContainer");
      if (mc) mc.innerHTML = "";
    };

    // A hold placed when a contract went out is a question, not a booking.
    // Accept answers yes: it becomes the confirmed shoot on that date, on the
    // contract version that was sent. Reject answers no and hands the day back
    // to the public. Either way the change is device-local until you publish.
    window.acceptHoldBooking = (dKey, bId) => {
      const b = findBooking(dKey, bId);
      if (!b) return;
      const ver = b.contractVersion && b.contractVersion !== "Pending Agreement" ? b.contractVersion : "";
      if (!confirm(`Accept ${b.name} for ${dKey}?\n\nThe hold becomes a confirmed shoot${ver ? `, agreed on ${ver}` : ""}.`)) return;
      updateCalBooking(dKey, bId, { status: "confirmed", isTentative: false, agreedToTerms: true });
      toast(`\u2713 ${b.name} confirmed for ${dKey}. Publish the calendar to show it live.`);
      closeDayModal();
      window.refreshAdminCalendarViews();
    };

    window.rejectHoldBooking = (dKey, bId) => {
      const b = findBooking(dKey, bId);
      if (!b) return;
      if (!confirm(`Reject the hold for ${b.name} on ${dKey}?\n\nThe hold is removed and ${dKey} goes back to being open for anyone to book. The contract PDF you already sent is not affected.`)) return;
      removeCalBooking(dKey, bId);
      toast(`Hold for ${b.name} on ${dKey} rejected \u2014 the date is open again. Publish the calendar to release it live.`);
      closeDayModal();
      window.refreshAdminCalendarViews();
    };



    


    window.openEditBookingModal = (dKey, bookingId) => {
      const settings = window.WPS_DATA.CALENDAR_SETTINGS || {};
      const list = settings.bookedDates?.[dKey] || [];
      let b = list.find(x => (x.id && x.id === bookingId) || (!x.id && x.name === bookingId));
      if (!b && list.length === 1) b = list[0];
      if (!b) {
        toast("Unable to find target booking to edit.");
        return;
      }

      const modalContainer = $("#dateAdminModalContainer");
      if (!modalContainer) return;

      const ebSelected = (() => {
        const raw = String(b.contractVersion || "").trim();
        if (raw === "Custom Contract") return raw;
        if (raw === "Pending Agreement" || (!raw && !b.agreedToTerms)) return "Pending Agreement";
        if (!raw) return window.ACTIVE_CONTRACTS.commercial;
        const r = window.resolveContractArchive(raw);
        return r ? r.version : "Pending Agreement";
      })();
      modalContainer.innerHTML = `
        <div class="date-admin-modal-overlay" id="editBookingOverlay">
          <div class="date-admin-modal">
            <button type="button" id="closeEditModal" style="position: absolute; top: 18px; right: 20px; background: none; border: none; font-size: var(--font-md); cursor: pointer; color: var(--ink-soft);">&times;</button>
            <p class="eyebrow" style="margin-bottom: 6px;">Edit Client Booking</p>
            <h2 style="font-family: 'Archivo', sans-serif; font-size: var(--font-md); font-weight: 800; margin: 0 0 16px; color: var(--ink);">Edit Booking for ${dKey}</h2>
            
            <form id="editBookingForm" style="display: flex; flex-direction: column; gap: 12px;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Client / Model Name *
                  <input type="text" id="eb_name" value="${esc(b.name)}" required style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                </label>
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Shoot Date (YYYY-MM-DD) *
                  <input type="text" id="eb_date" value="${esc(dKey)}" required style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                </label>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Email Address
                  <input type="email" id="eb_email" value="${esc(b.email || '')}" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                </label>
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Phone Number
                  <input type="tel" id="eb_phone" value="${esc(b.phone || '')}" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                </label>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Shoot Type
                  <input type="text" id="eb_type" value="${esc(b.type || 'Shoot')}" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                </label>
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Shoot Duration
                  <select id="eb_duration" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
                    <option value="Full Day" ${(b.duration || 'Full Day') === 'Full Day' ? 'selected' : ''}>Full Day Shoot</option>
                    <option value="Half Day (Morning)" ${b.duration === 'Half Day (Morning)' ? 'selected' : ''}>Half Day (Morning 9AM - 1PM)</option>
                    <option value="Half Day (Afternoon)" ${b.duration === 'Half Day (Afternoon)' ? 'selected' : ''}>Half Day (Afternoon 2PM - 6PM)</option>
                    <option value="Half Day (Flexible)" ${b.duration === 'Half Day (Flexible)' ? 'selected' : ''}>Half Day (Flexible Hours)</option>
                  </select>
                </label>
              </div>
              <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Booking Status
                <select id="eb_status" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
                  <option value="confirmed" ${(!b.isTentative && b.status !== 'tentative' && b.status !== 'workshop' && b.status !== 'assisting') ? 'selected' : ''}>✓ Confirmed Client Booking</option>
                  <option value="tentative" ${(b.isTentative || b.status === 'tentative') ? 'selected' : ''}>⏳ Anticipated Client Hold (Looks Booked to Public)</option>
                  <option value="workshop" ${b.status === 'workshop' ? 'selected' : ''}>📚 Workshop Attended (Skill-Up Day)</option>
                  <option value="assisting" ${b.status === 'assisting' ? 'selected' : ''}>🤝 Assisting Work (Assisting Another Photographer)</option>
                </select>
              </label>
              <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Contract Agreement &amp; Version Status
                <select id="eb_contractVersion" data-contract-select="1" data-pending="1" data-custom="1" data-prev-value="${esc(ebSelected)}" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">${contractVersionOptionsHtml({ selected: ebSelected, pending: true })}</select>
              </label>
              <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Reference Links (one per line)
                <textarea id="eb_links" rows="2" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">${esc((b.links || []).join('\n'))}</textarea>
              </label>
              <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Notes / Concepts
                <textarea id="eb_notes" rows="2" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">${esc(b.notes || '')}</textarea>
              </label>
              <div style="display: flex; gap: 10px; margin-top: 8px;">
                <button type="submit" class="admin-cal-btn primary">Save Changes</button>
                <button type="button" id="cancelEditBtn" class="admin-cal-btn">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      `;

      $("#closeEditModal")?.addEventListener("click", () => modalContainer.innerHTML = "");
      $("#cancelEditBtn")?.addEventListener("click", () => modalContainer.innerHTML = "");
      $("#editBookingOverlay")?.addEventListener("click", (e) => {
        if (e.target.id === "editBookingOverlay") modalContainer.innerHTML = "";
      });

      $("#editBookingForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = $("#eb_name").value.trim();
        const newDateKey = $("#eb_date").value.trim();
        const email = $("#eb_email").value.trim();
        const phone = $("#eb_phone").value.trim();
        const type = $("#eb_type").value.trim();
        const duration = $("#eb_duration").value;
        const status = $("#eb_status").value;
        const isTentative = (status === "tentative");
        const isWorkshop = (status === "workshop");
        const isAssisting = (status === "assisting");
        const rawLinks = $("#eb_links").value.split("\n").map(s => s.trim()).filter(Boolean);
        const notes = $("#eb_notes").value.trim();
        const contractVersion = $("#eb_contractVersion").value;
        const agreedToTerms = (contractVersion !== "Pending Agreement");

        const targetId = b.id || bookingId || name;
        updateCalBooking(dKey, targetId, { newDateKey, name, email, phone, type, duration, isTentative, status, links: rawLinks, notes, contractVersion, agreedToTerms });
        toast("Booking updated successfully!");
        modalContainer.innerHTML = "";
        renderAdminGrid();
        renderRoster();
        updateAdminReminders();
      });
    };

    function openDateAdminModal(dKey) {
      const parts = dKey.split("-").map(Number);
      const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
      const status = getCalDateStatus(dateObj);

      const modalContainer = $("#dateAdminModalContainer");
      if (!modalContainer) return;

      const dateLabel = dateObj.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
      const statusPill = status.isBooked
        ? `<span class="roster-pill roster-pill-confirmed">Booked · ${status.bookings.length} slot${status.bookings.length > 1 ? "s" : ""}</span>`
        : status.isBlocked
          ? `<span class="roster-pill roster-pill-neutral">Blocked · ${status.isDefaultBlockedWeekday ? "weekday default" : "custom"}</span>`
          : `<span class="roster-pill roster-pill-open">Open for booking</span>`;
      const blockLabel = status.isDefaultBlockedWeekday
        ? (status.isManuallyOpened ? "Re-block weekday" : "Open weekday for clients")
        : (status.isCustomBlocked ? "Unblock weekend date" : "Block weekend date");
      const pillFor = (b) => {
        const st = b.status || (b.isTentative ? "tentative" : "confirmed");
        if (st === "tentative") return '<span class="roster-pill roster-pill-hold">Hold</span>';
        if (st === "workshop") return '<span class="roster-pill roster-pill-workshop">Workshop</span>';
        if (st === "assisting") return '<span class="roster-pill roster-pill-assisting">Assisting</span>';
        if (/test|tfp/i.test(b.type || "")) return '<span class="roster-pill roster-pill-test">Test shoot</span>';
        return '<span class="roster-pill roster-pill-confirmed">Booked</span>';
      };
      const bookingRow = (b) => `
        <div class="dam-booking">
          <div class="dam-booking-main">
            <div class="dam-booking-name">${esc(b.name)} ${pillFor(b)}</div>
            <div class="dam-booking-sub">${esc(b.type || "")}${b.duration ? " · " + esc(b.duration) : ""}${b.phone ? " · " + esc(b.phone) : ""}${b.email ? " · " + esc(b.email) : ""}</div>
            ${b.notes ? `<div class="dam-booking-sub"><em>${esc(b.notes)}</em></div>` : ""}
            ${b.agreedContract
              ? `<div class="dam-booking-ok">Contract agreed · ${esc(b.agreedContract)}</div>`
              : isDecidableHold(b)
                ? `<div class="dam-booking-sub contract-sent-note">Contract sent · ${esc(b.contractVersion)} · awaiting approval</div>`
                : `<div class="dam-booking-sub">Contract · ${esc(b.contractVersion || "Pending agreement")}</div>`}
            ${isSigImage(b.sigDataUrl) ? `<img class="dam-booking-sig" src="${b.sigDataUrl}" alt="" title="Client digital signature captured at booking" />` : ""}
            ${b.links && b.links.length ? b.links.map(l => `<a class="dam-booking-link" href="${esc(l)}" target="_blank" rel="noopener noreferrer">${esc(l)} ↗</a>`).join("") : ""}
            ${b.attachments && b.attachments.length ? `<div>${b.attachments.map(att => `<a class="dam-att" href="${esc(att.dataUrl)}" download="${esc(att.name)}" target="_blank">${esc(att.name)}</a>`).join("")}</div>` : ""}
          </div>
          <div class="dam-booking-actions">
            ${isDecidableHold(b) ? `<button type="button" class="linkish hold-accept" onclick="window.acceptHoldBooking('${dKey}', '${b.id}')">✓ Accept</button><button type="button" class="linkish hold-reject" onclick="window.rejectHoldBooking('${dKey}', '${b.id}')">✕ Reject</button>` : ""}
            <button type="button" class="linkish" onclick="document.getElementById('closeAdminModal')?.click(); window.openPdfContractGenerator('${dKey}', '${b.id}')">Contract PDF</button>
            <button type="button" class="linkish" onclick="window.openEditBookingModal('${dKey}', '${b.id}')">Edit</button>
            <button type="button" class="linkish muted" onclick="window.removeBookingFromRoster('${dKey}', '${b.id}'); document.getElementById('closeAdminModal')?.click();">Remove</button>
          </div>
        </div>`;

      modalContainer.innerHTML = `
        <div class="date-admin-modal-overlay" id="adminModalOverlay">
          <div class="date-admin-modal dam" role="dialog" aria-modal="true" aria-labelledby="damTitle">
            <button type="button" id="closeAdminModal" class="dam-close" aria-label="Close">&times;</button>
            <header class="dam-head">
              <p class="eyebrow">Manage day</p>
              <h2 class="dam-title" id="damTitle">${dateLabel}</h2>
              <div class="dam-status">${statusPill}</div>
            </header>

            <section class="dam-section">
              <div class="dam-section-head"><h3>Mark this day</h3><span class="dam-hint">One tap. Hold and Test shoot use the name and notes below if you have typed them.</span></div>
              <div class="dam-chips">
                <button type="button" class="dam-chip chip-block" id="toggleBlockBtn">${blockLabel}</button>
                <button type="button" class="dam-chip chip-hold" id="quickHoldBtn">Hold</button>
                <button type="button" class="dam-chip chip-test" id="quickTestShootBtn">Test shoot</button>
                <button type="button" class="dam-chip chip-workshop" id="quickWorkshopBtn">Workshop</button>
                <button type="button" class="dam-chip chip-assisting" id="quickAssistingBtn">Assisting</button>
              </div>
            </section>

            <section class="dam-section">
              <div class="dam-section-head"><h3>Add a booking</h3><span class="dam-hint">Leave the name blank to hold the date.</span></div>
              <form id="modalAddBookingForm" class="dam-form">
                <div class="dam-row">
                  <label class="dam-field"><span>Client / model</span><input type="text" id="m_clientName" placeholder="Name or brand" /></label>
                  <label class="dam-field"><span>Status</span>
                    <select id="m_clientStatus">
                      <option value="confirmed">Confirmed booking</option>
                      <option value="tentative">Anticipated hold (shows as taken)</option>
                      <option value="workshop">Workshop attended</option>
                      <option value="assisting">Assisting another photographer</option>
                    </select>
                  </label>
                </div>
                <div class="dam-row">
                  <label class="dam-field"><span>Email</span><input type="email" id="m_clientEmail" placeholder="name@example.com" /></label>
                  <label class="dam-field"><span>Phone</span><input type="tel" id="m_clientPhone" placeholder="98765 43210" /></label>
                </div>
                <div class="dam-row">
                  <label class="dam-field"><span>Project type</span>
                    <select id="m_clientType">
                      <option value="Fashion Editorial">Fashion Editorial</option>
                      <option value="Fitness &amp; Athletic">Fitness &amp; Athletic</option>
                      <option value="Sports Action">Sports Action</option>
                      <option value="Commercial Campaign">Commercial Campaign</option>
                      <option value="Portfolio">Portfolio</option>
                      <option value="Selective Collaboration (TFP)">Test shoot / TFP</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  <label class="dam-field"><span>Duration</span>
                    <select id="m_clientDuration">
                      <option value="Full Day">Full day</option>
                      <option value="Half Day (Morning)">Half day · morning (9 AM – 1 PM)</option>
                      <option value="Half Day (Afternoon)">Half day · afternoon (2 PM – 6 PM)</option>
                      <option value="Half Day (Flexible)">Half day · flexible hours</option>
                    </select>
                  </label>
                </div>
                <label class="dam-field"><span>Contract</span>
                  <select id="m_clientContractVersion" data-contract-select="1" data-pending="1" data-custom="1" data-prev-value="Pending Agreement">${contractVersionOptionsHtml({ selected: "Pending Agreement", pending: true })}</select>
                </label>
                <label class="dam-field"><span>Reference link</span><input type="url" id="m_clientLinks" placeholder="Drive, Pinterest, moodboard…" /></label>
                <label class="dam-field"><span>Notes</span><textarea id="m_clientNotes" rows="2" placeholder="Call time, wardrobe, anything to remember"></textarea></label>
                <div class="dam-actions">
                  <button type="submit" class="admin-cal-btn primary">Add booking</button>
                  <button type="button" class="admin-cal-btn" id="draftContractBtn" title="Prepare an A4 contract PDF from the details above, without adding a booking">Draft contract PDF</button>
                </div>
              </form>
            </section>

            ${status.bookings.length ? `
              <section class="dam-section">
                <div class="dam-section-head"><h3>On this day</h3><span class="dam-hint">${status.bookings.length} booking${status.bookings.length > 1 ? "s" : ""}</span></div>
                <div class="dam-list">${status.bookings.map(bookingRow).join("")}</div>
              </section>
            ` : ""}
          </div>
        </div>
      `;

      $("#closeAdminModal")?.addEventListener("click", () => modalContainer.innerHTML = "");
      // A contract for someone who never booked online: whatever is typed in
      // the form seeds the PDF generator, nothing is added to the calendar.
      $("#draftContractBtn")?.addEventListener("click", () => {
        const typed = {
          name: $("#m_clientName").value.trim(),
          email: $("#m_clientEmail").value.trim(),
          phone: $("#m_clientPhone")?.value.trim() || "",
          type: $("#m_clientType").value,
          duration: $("#m_clientDuration")?.value || "Full Day",
          status: $("#m_clientStatus")?.value || "confirmed",
          notes: $("#m_clientNotes").value.trim()
        };
        const ver = $("#m_clientContractVersion")?.value;
        if (ver && ver !== "Pending Agreement" && ver !== "Custom Contract") typed.contractVersion = ver;
        modalContainer.innerHTML = "";
        window.openPdfContractGenerator(dKey, typed);
      });
      $("#adminModalOverlay")?.addEventListener("click", (e) => {
        if (e.target.id === "adminModalOverlay") modalContainer.innerHTML = "";
      });

      $("#toggleBlockBtn")?.addEventListener("click", () => {
        toggleCalDateBlock(dKey);
        toast(`Availability updated for ${dKey}.`);
        modalContainer.innerHTML = "";
        renderAdminGrid();
      });

      $("#quickHoldBtn")?.addEventListener("click", () => {
        const clientName = $("#m_clientName").value.trim() || "Anticipated Client Hold";
        const shootType = $("#m_clientType").value.trim() || "Tentative Hold";
        const notes = $("#m_clientNotes").value.trim() || "Date held by Admin for anticipated client inquiry.";
        addCalBooking(dKey, { name: clientName, type: shootType, notes: notes, isTentative: true, status: "tentative", contractVersion: "Pending Agreement", agreedToTerms: false });
        toast(`Date ${dKey} held as Anticipated Client! (Appears TAKEN to public)`);
        modalContainer.innerHTML = "";
        renderAdminGrid();
        renderRoster();
        updateAdminReminders();
      });

      $("#quickWorkshopBtn")?.addEventListener("click", () => {
        addCalBooking(dKey, { name: "Workshop Day", type: "Workshop Attended", notes: "Booked for Workshop (Skill-Up Day)", isTentative: false, status: "workshop", contractVersion: "Pending Agreement", agreedToTerms: false });
        toast(`📚 Workshop day marked for ${dKey}! (Appears as Booked for Workshop in Yellow)`);
        modalContainer.innerHTML = "";
        renderAdminGrid();
        renderRoster();
        updateAdminReminders();
      });

      $("#quickAssistingBtn")?.addEventListener("click", () => {
        addCalBooking(dKey, { name: "Assisting Work", type: "Assisting Photographer", notes: "Booked for Assisting Work", isTentative: false, status: "assisting", contractVersion: "Pending Agreement", agreedToTerms: false });
        toast(`🤝 Assisting work marked for ${dKey}! (Appears as Assisting Work in Teal)`);
        modalContainer.innerHTML = "";
        renderAdminGrid();
        renderRoster();
        updateAdminReminders();
      });

      $("#quickTestShootBtn")?.addEventListener("click", () => {
        const clientName = $("#m_clientName").value.trim() || "Test Shoot Client";
        const notes = $("#m_clientNotes").value.trim() || "Booked for Test Shoot / TFP Collaboration.";
        addCalBooking(dKey, { name: clientName, type: "Selective Collaboration (TFP)", notes: notes, isTentative: false, status: "confirmed", contractVersion: "V3.7-TFP", agreedToTerms: false });
        toast(`📸 Test Shoot marked for ${dKey}! (Appears as Test Shoot in Blue)`);
        modalContainer.innerHTML = "";
        renderAdminGrid();
        renderRoster();
        updateAdminReminders();
      });

      $("#modalAddBookingForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const rawName = $("#m_clientName").value.trim();
        const email = $("#m_clientEmail").value.trim();
        const phone = $("#m_clientPhone")?.value.trim() || "";
        const type = $("#m_clientType").value.trim() || "General Shoot";
        const duration = $("#m_clientDuration")?.value || "Full Day";
        const statusVal = $("#m_clientStatus")?.value || "confirmed";
        const isTentative = (statusVal === "tentative");
        const isWorkshop = (statusVal === "workshop");
        const isAssisting = (statusVal === "assisting");
        const name = rawName || (isWorkshop ? "Workshop Day" : isAssisting ? "Assisting Work" : isTentative ? "Anticipated Client Hold" : "Client Booking");
        const rawLink = $("#m_clientLinks").value.trim();
        const notes = $("#m_clientNotes").value.trim();
        const contractVersion = $("#m_clientContractVersion")?.value || "Pending Agreement";
        const agreedToTerms = (contractVersion !== "Pending Agreement");

        const links = rawLink ? [rawLink] : [];
        addCalBooking(dKey, { name, email, phone, type, duration, isTentative, status: statusVal, links, notes, contractVersion, agreedToTerms });
        toast(isWorkshop ? `📚 Workshop day marked for ${dKey}!` : isAssisting ? `🤝 Assisting work marked for ${dKey}!` : isTentative ? `Date ${dKey} held for ${name}! (Appears TAKEN to public)` : `Booking confirmed for ${name} on ${dKey}!`);
        modalContainer.innerHTML = "";
        renderAdminGrid();
        renderRoster();
        updateAdminReminders();
      });
    }

    $("#adminCalPrev")?.addEventListener("click", () => {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      renderAdminGrid();
    });
    $("#adminCalNext")?.addEventListener("click", () => {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      renderAdminGrid();
    });
    $("#adminCalToday")?.addEventListener("click", () => {
      calYear = new Date().getFullYear();
      calMonth = new Date().getMonth();
      renderAdminGrid();
    });
    $("#adminCalNewBookingBtn")?.addEventListener("click", () => {
      const targetDate = prompt("Enter booking date (YYYY-MM-DD):", getCalDateKey(new Date()));
      if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate.trim())) {
        openDateAdminModal(targetDate.trim());
      }
    });
    $("#adminCalResetBtn")?.addEventListener("click", () => {
      if (confirm("Reset custom date overrides? Monday-Friday will be default blocked, Saturdays-Sundays open.")) {
        window.WPS_DATA.CALENDAR_SETTINGS.customBlockedDates = {};
        window.WPS_DATA.CALENDAR_SETTINGS.customOpenedDates = {};
        saveCalendarSettings();
        toast("Date rules reset to defaults.");
        renderAdminGrid();
      }
    });

    // Publishing the calendar is the only way a booking taken on this device
    // becomes visible to visitors: data.js is what every browser reads, and
    // saveCalendarSettings() only writes this device's localStorage.
    $("#adminCalPublishBtn")?.addEventListener("click", async (e) => {
      const btnEl = e.currentTarget;
      const dates = Object.keys(window.WPS_DATA?.CALENDAR_SETTINGS?.bookedDates || {}).length;
      if (!confirm(`Publish this device's calendar (${dates} booked date${dates === 1 ? "" : "s"}) to the live site so visitors see them?\n\nPublish only from the device whose calendar is correct.`)) return;
      const orig = btnEl.textContent;
      btnEl.disabled = true;
      btnEl.textContent = "Publishing…";
      try {
        await syncToGitHub(shootsNow());
      } finally {
        btnEl.disabled = false;
        btnEl.textContent = orig;
      }
    });

    // One button per schedule in PACKAGE_SCHEDULES; the choice is saved with
    // the calendar settings and published with them.
    const payBtns = [[$("#adminPay5050Btn"), "5050"], [$("#adminPay503020Btn"), "503020"], [$("#adminPay50301010Btn"), "50301010"]];
    const updateAdminPayBtns = () => {
      const on = getPackageScheduleKey();
      payBtns.forEach(([b, key]) => {
        if (!b) return;
        b.style.background = on === key ? "var(--accent)" : "transparent";
        b.style.color = on === key ? "#fff" : "var(--ink)";
      });
    };
    updateAdminPayBtns();
    payBtns.forEach(([b, key]) => {
      if (!b) return;
      b.addEventListener("click", () => {
        window.WPS_DATA.CALENDAR_SETTINGS.paymentScheduleType = key;
        saveCalendarSettings();
        updateAdminPayBtns();
        toast(`Default Studio Payment Terms set to ${PACKAGE_SCHEDULES[key].label}. Publish to show it on the site.`);
      });
    });

    // Campaign / production payment schedule — a separate switch from the
    // package terms above, because a production brief carries no package:
    // its figures are quoted on the proposal, and this only decides which
    // split the brief form shows and the enquiry email records.
    const prodScheduleBtns = [[$("#adminProd503020Btn"), "503020"], [$("#adminProd50301010Btn"), "50301010"]];
    const updateAdminProdBtns = () => {
      const on = getProductionSchedule().key;
      prodScheduleBtns.forEach(([b, key]) => {
        if (!b) return;
        b.style.background = on === key ? "var(--accent)" : "transparent";
        b.style.color = on === key ? "#fff" : "var(--ink)";
      });
    };
    updateAdminProdBtns();
    prodScheduleBtns.forEach(([b, key]) => {
      if (!b) return;
      b.addEventListener("click", () => {
        window.WPS_DATA.CALENDAR_SETTINGS.productionScheduleType = key;
        saveCalendarSettings();
        updateAdminProdBtns();
        toast(`Campaign / production payment terms set to ${PRODUCTION_SCHEDULES[key].label}. Publish to show it on the site.`);
      });
    });

    renderAdminPackagesEditor();
    renderAdminGrid();
    renderRoster();
    // The per-line type rows, and the way back if a choice turns out wrong.
    if (typeof window.renderPdfTypeEditor === "function") window.renderPdfTypeEditor();
    if (typeof window.renderPdfBorderEditor === "function") window.renderPdfBorderEditor();
    document.getElementById("pdfTypeReset")?.addEventListener("click", () => {
      if (!confirm("Put every line of the PDF back to how it started? Anything you have set here is lost.")) return;
      const cur = getPortfolioPdfSettings();
      localStorage.setItem("wps_portfolio_pdf", JSON.stringify({ ...cur, type: window.defaultPdfType(), border: { ...window.DEFAULT_PDF_BORDER } }));
      stampSetting("wps_portfolio_pdf");
      window.renderPdfTypeEditor();
      window.renderPdfBorderEditor();
      toast("Every line is back to the original. Click Save to publish it.");
    });

    // Arriving from the link in a Model Portfolio lightbox: unfold the
    // Portfolio PDF panel and bring it into view.
    if (location.hash === "#portfolio-pdf") {
      const pdfBody = document.getElementById("adminPdfBody");
      const pdfArrow = document.getElementById("adminPdfArrow");
      if (pdfBody) pdfBody.style.display = "block";
      if (pdfArrow) pdfArrow.textContent = "▲";
      document.getElementById("portfolio-pdf")?.scrollIntoView({ block: "start" });
    }
  }


  /* ---- upload view ---- */
  /* ---------- Upload view (rich, grouped form) ---------- */
  let staged = []; // {id,dataUrl,name}
  function viewUpload() {
    const opt = (arr) => arr.map((v) => `<option value="${v}">${v}</option>`).join("");
    // Activity and Type decide which "What I shoot" page an album shows up on.
    // They used to default to whatever sorted first — Beauty and Campaign — so
    // an album saved without touching them claimed to be a beauty shoot for a
    // brand campaign. Neither has a default now; the studio picks, and the save
    // refuses until it does.
    const chooseOpt = `<option value="">— Choose —</option>`;
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const dropTitle = isTouch ? "Tap to upload photos" : "Drag your photoshoot here";
    const dropHint = isTouch ? "Select images from files or photo library" : "or <span class=\"link\">browse files</span> — JPG, PNG, WEBP";
    return `
      <section class="page-head admin-page-head upload-page-head">
        <div class="container admin-title-row">
          <div>
            <p class="eyebrow reveal">Admin · Archive</p>
            <h1 class="admin-h1 reveal">Publish a photoshoot</h1>
            <p class="page-sub admin-sub reveal">Drop your images, fill in the credits, and the shoot joins the archive — browsable by activity, brand and type. Saved to this browser until you publish.</p>
          </div>
          <div class="admin-title-actions"><span class="upload-status-pill" id="uploadStatusPill">Draft · not published</span></div>
        </div>
      </section>
      <section class="section container">
        <div class="upload-grid">
          <div class="dropzone reveal" id="dropzone" tabindex="0" role="button" aria-label="Upload images">
            <input type="file" id="fileInput" accept="image/*" multiple hidden />
            <div class="dz-head"><span class="dz-kicker">Photos <b id="dzCount">· 0</b></span><span class="dz-meta">Drag to reorder · dot sets focus</span></div>
            <div class="dropzone-inner">
              <svg class="dropzone-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              <p class="dropzone-title">${dropTitle}</p>
              <p class="dropzone-hint">${dropHint}</p>
              <p class="dropzone-ratio">Cover image works best at 2:3 portrait (e.g. 2000 × 3000 px) or 3:2 landscape (e.g. 3000 × 2000 px).</p>
            </div>
            <div class="thumb-bulk-toolbar" id="thumbBulkToolbar" style="display:none; align-items:center; flex-wrap:wrap; gap:8px; margin-top:14px; padding:10px 12px; border:1px solid var(--line-2); border-radius:8px; background:var(--bone-2); pointer-events:auto;">
              <span style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink-soft);">Bulk-tag pose:</span>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="full-body" style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Full Body</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="front" style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Front</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="left-profile" style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Left Profile</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="right-profile" style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Right Profile</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="three-quarter" style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">3/4</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="back" style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Back</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="close-up" style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Close-up</button>
              <span style="width:1px; align-self:stretch; background:var(--line-2);"></span>
              <span style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink-soft);">Kind of work:</span>
              ${LOOKS.map((l) => `<button type="button" class="thumb-bulk-look-btn" data-look="${esc(l.key)}" style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">${esc(l.label)}</button>`).join("")}
              <button type="button" class="thumb-bulk-look-btn" data-look="" style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink-soft); cursor:pointer;">Follow album</button>
              <!-- Filled in whenever the album has more than one model in it:
                   with six models and forty frames, tagging one at a time is
                   the difference between the feature being used and not. -->
              <span id="thumbBulkPeople" style="display:none; align-items:center; flex-wrap:wrap; gap:8px;"></span>
              <span style="width:1px; align-self:stretch; background:var(--line-2);"></span>
              <button type="button" id="thumbBulkSelectAll" style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink-soft); cursor:pointer;">Select all</button>
              <button type="button" id="thumbBulkClear" style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink-soft); cursor:pointer;">Clear</button>
              <span id="thumbBulkCount" style="margin-left:auto; font-family:var(--mono-font); font-size: var(--font-xs); color:var(--ink-soft);">0 selected</span>
            </div>
            <div class="thumb-grid" id="stagingGrid"></div>
          </div>

          <form class="shoot-form reveal" id="shootForm" autocomplete="off">
            <!-- Section strip: the form is ~5,000px tall, and without this the
                 only way to know where you were was the legend that happened
                 to be on screen. Chips light up as their section scrolls into
                 view (see wireUpload) and click to jump. -->
            <nav class="upload-sections" id="uploadSections" aria-label="Form sections">
              <button type="button" data-target="fs_shoot">The shoot</button>
              <button type="button" data-target="fs_credits">Credits</button>
              <button type="button" data-target="modelStatsFieldset">Model stats</button>
              <button type="button" data-target="fs_details">Details &amp; links</button>
              <button type="button" data-target="fs_publish">Publish settings</button>
            </nav>

            <fieldset id="fs_shoot"><legend>The shoot</legend>
              <label class="field"><span>Shoot title *</span><input id="f_title" type="text" placeholder="e.g. Merrell Trail — Spring '26" required /></label>
              <div class="field-row">
                <label class="field" id="f_brand_select_field"><span>Brand</span><select id="f_brand">${opt(BRANDS)}<option>Other</option></select></label>
                <label class="field" id="f_brand_text_field" style="display: none;"><span>Company / Role *</span><input id="f_brand_text" type="text" placeholder="e.g. Model, Vogue, Brand Director" /></label>
                <label class="field" id="f_activity_field"><span>Activity</span><select id="f_activity">${chooseOpt}${opt(ACTIVITIES)}</select></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Type</span><select id="f_type">${chooseOpt}${opt(TYPES)}</select></label>
                <label class="field"><span>Date shot</span><input id="f_date" type="date" /></label>
                <label class="field"><span>Season / Year</span><input id="f_season" type="text" placeholder="Spring 2026" /></label>
                <label class="field"><span>Shoot Location (add Instagram in parentheses)</span><input id="f_location" type="text" placeholder="e.g. Studio (@studiohandle), Noida, Outdoor" /></label>
                <div id="f_location_verify" style="margin-top: 5px; font-size: var(--font-xs); display: none;"></div>
              </div>
              <!-- Who the album was made for decides which client page it is on
                   (Model portfolios, Campaigns, Designers/stylists/makeup).
                   The kind of work in each photo is set on the photos. -->
              <div class="field-row" id="f_for_row">
                <label class="field"><span>Who is this album for? <em class="label-hint">who booked the shoot and uses the photos</em></span><select id="f_for_client">${chooseOpt}${CLIENTS.map((c) => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join("")}</select></label>
              </div>
              <div class="field" id="f_also_for_field">
                <span>Also for <em class="label-hint">anyone else who uses the photos, as on a collaboration</em></span>
                <div id="f_also_for" style="display: flex; flex-wrap: wrap; gap: 10px 18px; margin-top: 8px;">
                  ${CLIENTS.map((c) => `
                    <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); font-weight: 500; color: var(--ink); cursor: pointer; user-select: none;">
                      <input type="checkbox" class="also-for-cb" value="${esc(c.key)}" style="width: 16px; height: 16px; accent-color: var(--accent-text);" />
                      ${esc(c.label)}
                    </label>`).join("")}
                </div>
              </div>
            </fieldset>

            <fieldset id="fs_credits"><legend>Credits</legend>
              <div class="credits-format" role="note">
                <span class="credits-format-k">How to write a credit</span>
                <code>Name (@handle; site.com; …)</code>
                <span class="credits-format-sub">Socials go in parentheses after the name, separated by <code>;</code> — Instagram <code>@handle</code>, <code>kavyar.com/…</code>, <code>linkedin.com/in/…</code>, <code>behance.net/…</code>, a website, an email. Any of them, in any order: the app tells them apart by their shape. Several people: separate with commas. Example — <em>nerdyphotographer.in (@nerdyphotographer.in; prateeksaxenaphotography@gmail.com)</em>. Instagram, Kavyar, LinkedIn, Behance and websites get a verify link; email cannot be tested. The same pattern works for the agency.</span>
              </div>
              <div class="field-row">
                <label class="field"><span>Photographer <em class="label-hint">primary</em></span><input id="f_photographer" type="text" value="nerdyphotographer.in" placeholder="Your name" /></label>
                <label class="field"><span>Secondary photographer(s)</span><input id="f_photographer2" type="text" placeholder="e.g. Name (@handle; site.com), Name Two" /><span class="field-verify" id="f_photographer2_verify" style="display: none;"></span></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Videographer(s)</span><input id="f_video" type="text" placeholder="e.g. Name (@handle; site.com)" /><span class="field-verify" id="f_video_verify" style="display: none;"></span></label>
                <label class="field"><span>Art director</span><input id="f_ad" type="text" placeholder="e.g. Name (@handle; site.com)" /><span class="field-verify" id="f_ad_verify" style="display: none;"></span></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Stylist</span><input id="f_stylist" type="text" placeholder="e.g. Name (@handle; site.com)" /><span class="field-verify" id="f_stylist_verify" style="display: none;"></span></label>
                <label class="field"><span>Hair stylist</span><input id="f_hair" type="text" placeholder="e.g. Name (@handle; site.com)" /><span class="field-verify" id="f_hair_verify" style="display: none;"></span></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Makeup artist / MUA</span><input id="f_mua" type="text" placeholder="e.g. Name (@handle; site.com)" /><span class="field-verify" id="f_mua_verify" style="display: none;"></span></label>
                <label class="field"><span>Model / talent</span><input id="f_talent" type="text" placeholder="e.g. Model Name (@handle; site.com), Second Model" /><span class="field-verify" id="f_talent_verify" style="display: none;"></span></label>
              </div>
              <div class="field-row" id="f_agency_row">
                <label class="field"><span>Model's agency <em class="label-hint">as of this shoot</em></span><input id="f_agency" type="text" placeholder="e.g. Inega Model Management (@inegamodels; inega.com)" /><span class="field-verify" id="f_agency_verify" style="display: none;"></span></label>
                <label class="field"><span>Model's email <em class="label-hint">optional</em></span><input id="f_model_email" type="email" placeholder="name@example.com" autocomplete="off" /></label>
              </div>
              <!-- Who is in this album. A test shoot is one person and this
                   stays out of the way; a brand's day or a makeup artist's day
                   is where it earns its place. The people are the studio's own
                   list (MODELS), not text typed again per album, so the same
                   model tagged in March and in September is one card. -->
              <div class="field" id="f_models_field" style="margin-top: 14px;">
                <span>Who's in this album <span style="font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--ink-soft);">— tick everyone who appears</span></span>
                <p style="margin: 6px 0 0; font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5;">One model needs nothing more — every photo is hers. Tick two or more and a "Who's in it" row appears on each photo below, so a frame with two models reaches both their cards.</p>
                <div id="f_models" style="display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 10px;"></div>
                <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; align-items: center;">
                  <input id="f_model_new" type="text" placeholder="Add someone — Name (@handle)" style="flex: 1 1 260px; min-width: 0; height: 38px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); border-radius: 6px; padding: 0 12px; box-sizing: border-box; font-size: var(--font-sm); outline: none;" />
                  <button type="button" id="f_model_add" class="btn btn-ghost" style="height: 38px; padding: 0 16px; font-size: var(--font-xs); font-family: var(--mono-font); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">+ Add</button>
                </div>
                <!-- One person's details, opened from their chip above. These
                     belong to the person, not to this shoot, so they follow
                     her onto every card built from any album she is in. -->
                <div id="f_model_detail" style="display: none; margin-top: 12px; padding: 14px; border: 1px solid var(--line-2); border-radius: 8px; background: var(--bone-2);"></div>
                <label id="f_feeds_row" style="display: none; align-items: flex-start; gap: 10px; margin-top: 14px; font-size: var(--font-sm); font-weight: 500; color: var(--ink); cursor: pointer; user-select: none;">
                  <input id="f_feeds_model_cards" type="checkbox" style="width: 16px; height: 16px; margin-top: 2px; accent-color: var(--accent-text); flex: 0 0 auto;" />
                  <span>These photographs may appear on the models' own comp cards<br /><em id="f_feeds_hint" style="font-style: normal; font-weight: 400; font-size: var(--font-xs); color: var(--ink-soft);"></em></span>
                </label>
              </div>
              <p class="field-note credits-note" style="margin-top: -2px;">Models move between agencies — the comp card and PDF use the agency from the model's most recent album. Where the agency and email may appear is set under Publish settings.</p>
              <div class="field-row" id="f_mentor_row" style="display: none;">
                <label class="field" style="grid-column: 1 / -1;"><span>Teacher / Mentor</span><input id="f_mentor" type="text" placeholder="e.g. Mentor One (@handle; site.com), Mentor Two" /><span class="field-verify" id="f_mentor_verify" style="display: none;"></span></label>
              </div>
              <label class="field"><span>Other credits</span><input id="f_credits" type="text" placeholder="e.g. Set designer Name (@handle; site.com), Assistant Name" /><span class="field-verify" id="f_credits_verify" style="display: none;"></span></label>
            </fieldset>

            <p id="f_stats_shared_note" class="field-note" style="display: none; margin: 4px 0 14px;"></p>
            <fieldset id="modelStatsFieldset" class="fs-collapsible is-collapsed"><legend>Model stats <span class="legend-opt">comp cards</span></legend>
              <div class="fs-head">
                <span class="fs-summary" id="fsSummaryStats">Only for comp cards — measurements, model type</span>
                <button type="button" class="fs-toggle" aria-expanded="false" aria-controls="fsBodyStats">+ Expand</button>
              </div>
              <div class="fs-body" id="fsBodyStats">
              <div class="field" style="margin-bottom: 6px;">
                <span>Model type <span style="font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--ink-soft);">— pick up to ${MODEL_TYPES_MAX}</span></span>
                <div id="f_model_types" style="display: flex; flex-wrap: wrap; gap: 10px 18px; margin-top: 8px;">
                  ${modelTypeOptions().map((t) => `
                    <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); font-weight: 500; color: var(--ink); cursor: pointer; user-select: none;">
                      <input type="checkbox" class="model-type-cb" value="${esc(t)}" style="width: 16px; height: 16px; accent-color: var(--accent-text);" />
                      ${esc(modelTypeLabel(t))}
                    </label>
                  `).join("")}
                </div>
                <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; align-items: center;">
                  <input id="f_model_type_new" type="text" maxlength="${MODEL_TYPE_MAXLEN}" placeholder="Add another type, e.g. Commercial" style="flex: 1 1 220px; min-width: 0; height: 38px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); border-radius: 6px; padding: 0 12px; box-sizing: border-box; font-size: var(--font-sm); outline: none;" />
                  <button type="button" id="f_model_type_add" class="btn btn-ghost" style="height: 38px; padding: 0 16px; font-size: var(--font-xs); font-family: var(--mono-font); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">+ Add</button>
                </div>
                <p id="f_model_types_hint" style="margin: 6px 0 0; font-size: var(--font-xs); color: var(--ink-soft);">Shown beside the model's name on the comp card album, in the lightbox, and on the exported PDF.</p>
              </div>
              <div class="field-row">
                <label class="field"><span>Height</span><input id="f_height" type="text" placeholder="e.g. 5'11&quot; / 180 cm" /></label>
                <div class="field">
                  <span>Chest or bust <span style="font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--ink-soft);">— pick the word this model's card should use</span></span>
                  <div style="display: flex; gap: 8px; margin-top: 6px;">
                    <select id="f_chest_label" style="flex: 0 0 110px;">${opt(CHEST_LABELS)}</select>
                    <input id="f_chest" type="text" placeholder="e.g. 38-40 cm" style="flex: 1 1 auto; min-width: 0;" />
                  </div>
                </div>
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
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); font-weight: 500; color: var(--ink); cursor: pointer; user-select: none;">
                  <input id="f_show_stats_comp" type="checkbox" checked style="width: 16px; height: 16px; accent-color: var(--accent-text);" />
                  Show stats on Comp Cards
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); font-weight: 500; color: var(--ink); cursor: pointer; user-select: none;">
                  <input id="f_show_stats_port" type="checkbox" checked style="width: 16px; height: 16px; accent-color: var(--accent-text);" />
                  Show stats on Model Portfolio
                </label>
              </div>
              </div>
            </fieldset>

            <fieldset id="fs_details"><legend>Details &amp; links</legend>
              <label class="field"><span>Description</span><textarea id="f_desc" rows="3" placeholder="A line or two about the shoot…"></textarea></label>
              <label class="field"><span>PDF (Course material, curriculum, etc.)</span><input id="f_pdf" type="file" accept=".pdf" /></label>
              <div class="field-row">
                <label class="field"><span>Tags</span><input id="f_tags" type="text" placeholder="golden hour, motion, coast" /></label>
                <label class="field"><span>Camera / gear</span><input id="f_gear" type="text" placeholder="Sony A1 · 85mm" /></label>
              </div>
              <!-- Formerly its own "Links & meta" fieldset; the client / date /
                   socials belong with the description, and the publish
                   toggles that used to sit down here now live in Publish
                   settings with the rest of them. -->
              <div class="fs-divider" aria-hidden="true"></div>
              <div class="field-row">
                <label class="field"><span>Client</span><input id="f_client" type="text" placeholder="Brand name" /></label>
              </div>
              <div class="field-row">
                <label class="field" style="position: relative;">
                  <span>Instagram (comma-separated)</span>
                  <input id="f_ig" type="text" placeholder="e.g. @handle1, @handle2" />
                  <div id="f_ig_verify" style="margin-top: 5px; font-size: var(--font-xs); display: none;"></div>
                </label>
                <label class="field" style="position: relative;">
                  <span>Kavyar Profile / Links</span>
                  <input id="f_kavyar" type="text" placeholder="e.g. https://kavyar.com/profile" />
                  <div id="f_kavyar_verify" style="margin-top: 5px; font-size: var(--font-xs); display: none;"></div>
                </label>
              </div>
              <div class="field-row">
                <label class="field"><span>Portfolio link / Website</span><input id="f_link" type="url" placeholder="https://…" /></label>
                <label class="field"><span>Usage rights</span><input id="f_rights" type="text" placeholder="e.g. Web + social, 1 year" /></label>
              </div>
            </fieldset>

            <!-- Everything that decides WHERE the album shows up, in one place.
                 These toggles used to be split between "Links & meta" (homepage
                 / comp card / PDF) and "Visibility & Privacy" (public + field
                 visibility), with the TFP category tag off in "The shoot". -->
            <fieldset id="fs_publish"><legend>Publish settings</legend>
              <div style="display: flex; align-items: center; gap: 8px;">
                <input id="f_is_public" type="checkbox" checked style="width: 16px; height: 16px; accent-color: var(--accent-text); margin: 0; cursor: pointer;" />
                <label for="f_is_public" style="font-weight: 600; cursor: pointer; margin: 0;">Show this album on the site <span class="label-hint" style="font-weight: 400; text-transform: none; letter-spacing: 0; font-family: inherit; font-size: 12.5px;">— untick to keep it off the homepage, Albums and every other page. It stays saved, and its photos are still offered in your portfolio book: a book-only album.</span></label>
              </div>
              <div class="publish-toggles">
                <label>
                  <input id="f_featured" type="checkbox" checked style="width: 15px; height: 15px; accent-color: var(--accent-text); margin: 3px 0 0;" />
                  <span class="tog-text"><strong>Show on the homepage</strong><small>In Photoshoots on the home page. The album stays on Albums either way.</small></span>
                </label>
                <label>
                  <input id="f_on_compcards" type="checkbox" style="width: 15px; height: 15px; accent-color: var(--accent-text); margin: 3px 0 0;" />
                  <span class="tog-text"><strong>Show on Comp cards</strong><small>On for test shoots unless you untick it. The album itself stays on the site either way.</small></span>
                </label>
                <label>
                  <input id="f_on_portfolio" type="checkbox" style="width: 15px; height: 15px; accent-color: var(--accent-text); margin: 3px 0 0;" />
                  <span class="tog-text"><strong>Show on Model portfolio</strong><small>On for test shoots unless you untick it. Its photos can go into portfolio PDFs.</small></span>
                </label>
                <label>
                  <input id="f_disable_download" type="checkbox" style="width: 15px; height: 15px; accent-color: var(--accent-text); margin: 3px 0 0;" />
                  <span class="tog-text"><strong>Turn off the comp card download</strong><small>People can still see the comp card, just not download it. The paid portfolio PDF isn't affected.</small></span>
                </label>
                <label>
                  <input id="f_show_test_shoot_cat" type="checkbox" style="width: 15px; height: 15px; accent-color: var(--accent-text); margin: 3px 0 0;" />
                  <span class="tog-text"><strong>Show that it was a test shoot</strong><small>Adds a "Test shoot" or "Collab" label. Left off, it looks like any other album.</small></span>
                </label>
              </div>
              <div class="vis-matrix" id="repVisibility">
                <p class="vis-matrix-title">Contact details</p>
                <p class="vis-matrix-sub">Tick where each detail should appear. Only the model's Instagram is on by default. Agency links only appear where the agency name does.</p>
                <table class="vis-table">
                  <thead><tr><th></th><th>Comp cards &amp; portfolio</th><th>Homepage</th><th>PDFs</th></tr></thead>
                  <tbody>
                    <tr class="vis-group"><th colspan="4">Model</th></tr>
                    <tr><th>Instagram</th><td><input id="f_show_ig_cc" type="checkbox" checked aria-label="Model Instagram on comp cards and portfolio" /></td><td><input id="f_show_ig_home" type="checkbox" checked aria-label="Model Instagram on homepage" /></td><td><input id="f_show_ig_pdf" type="checkbox" checked aria-label="Model Instagram on PDFs" /></td></tr>
                    <tr><th>Kavyar</th><td><input id="f_show_kavyar_cc" type="checkbox" aria-label="Model Kavyar on comp cards and portfolio" /></td><td><input id="f_show_kavyar_home" type="checkbox" aria-label="Model Kavyar on homepage" /></td><td><input id="f_show_kavyar_pdf" type="checkbox" aria-label="Model Kavyar on PDFs" /></td></tr>
                    <tr><th>LinkedIn</th><td><input id="f_show_linkedin_cc" type="checkbox" aria-label="Model LinkedIn on comp cards and portfolio" /></td><td><input id="f_show_linkedin_home" type="checkbox" aria-label="Model LinkedIn on homepage" /></td><td><input id="f_show_linkedin_pdf" type="checkbox" aria-label="Model LinkedIn on PDFs" /></td></tr>
                    <tr><th>Behance</th><td><input id="f_show_behance_cc" type="checkbox" aria-label="Model Behance on comp cards and portfolio" /></td><td><input id="f_show_behance_home" type="checkbox" aria-label="Model Behance on homepage" /></td><td><input id="f_show_behance_pdf" type="checkbox" aria-label="Model Behance on PDFs" /></td></tr>
                    <tr><th>Website</th><td><input id="f_show_website_cc" type="checkbox" aria-label="Model website on comp cards and portfolio" /></td><td><input id="f_show_website_home" type="checkbox" aria-label="Model website on homepage" /></td><td><input id="f_show_website_pdf" type="checkbox" aria-label="Model website on PDFs" /></td></tr>
                    <tr><th>Email</th><td><input id="f_show_email_cc" type="checkbox" aria-label="Model email on comp cards and portfolio" /></td><td><input id="f_show_email_home" type="checkbox" aria-label="Model email on homepage" /></td><td><input id="f_show_email_pdf" type="checkbox" aria-label="Model email on PDFs" /></td></tr>
                    <tr class="vis-group"><th colspan="4">Agency</th></tr>
                    <tr><th>Agency name</th><td><input id="f_show_agency_cc" type="checkbox" aria-label="Agency name on comp cards and portfolio" /></td><td><input id="f_show_agency_home" type="checkbox" aria-label="Agency name on homepage" /></td><td><input id="f_show_agency_pdf" type="checkbox" aria-label="Agency name on PDFs" /></td></tr>
                    <tr><th>Instagram</th><td><input id="f_show_agency_ig_cc" type="checkbox" aria-label="Agency Instagram on comp cards and portfolio" /></td><td><input id="f_show_agency_ig_home" type="checkbox" aria-label="Agency Instagram on homepage" /></td><td><input id="f_show_agency_ig_pdf" type="checkbox" aria-label="Agency Instagram on PDFs" /></td></tr>
                    <tr><th>Kavyar</th><td><input id="f_show_agency_kavyar_cc" type="checkbox" aria-label="Agency Kavyar on comp cards and portfolio" /></td><td><input id="f_show_agency_kavyar_home" type="checkbox" aria-label="Agency Kavyar on homepage" /></td><td><input id="f_show_agency_kavyar_pdf" type="checkbox" aria-label="Agency Kavyar on PDFs" /></td></tr>
                    <tr><th>LinkedIn</th><td><input id="f_show_agency_linkedin_cc" type="checkbox" aria-label="Agency LinkedIn on comp cards and portfolio" /></td><td><input id="f_show_agency_linkedin_home" type="checkbox" aria-label="Agency LinkedIn on homepage" /></td><td><input id="f_show_agency_linkedin_pdf" type="checkbox" aria-label="Agency LinkedIn on PDFs" /></td></tr>
                    <tr><th>Behance</th><td><input id="f_show_agency_behance_cc" type="checkbox" aria-label="Agency Behance on comp cards and portfolio" /></td><td><input id="f_show_agency_behance_home" type="checkbox" aria-label="Agency Behance on homepage" /></td><td><input id="f_show_agency_behance_pdf" type="checkbox" aria-label="Agency Behance on PDFs" /></td></tr>
                    <tr><th>Website</th><td><input id="f_show_agency_website_cc" type="checkbox" aria-label="Agency website on comp cards and portfolio" /></td><td><input id="f_show_agency_website_home" type="checkbox" aria-label="Agency website on homepage" /></td><td><input id="f_show_agency_website_pdf" type="checkbox" aria-label="Agency website on PDFs" /></td></tr>
                    <tr><th>Email</th><td><input id="f_show_agency_email_cc" type="checkbox" aria-label="Agency email on comp cards and portfolio" /></td><td><input id="f_show_agency_email_home" type="checkbox" aria-label="Agency email on homepage" /></td><td><input id="f_show_agency_email_pdf" type="checkbox" aria-label="Agency email on PDFs" /></td></tr>
                  </tbody>
                </table>
              </div>
              <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 4px 0 0;">On the album page, show:</p>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_credits" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent-text); margin: 0;" />
                  Credits
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_pdf" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent-text); margin: 0;" />
                  Attached PDF
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_instagram" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent-text); margin: 0;" />
                  Instagram
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_kavyar" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent-text); margin: 0;" />
                  Kavyar
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_testimonials" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent-text); margin: 0;" />
                  Testimonials
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_stats" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent-text); margin: 0;" />
                  Measurements
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_gear" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent-text); margin: 0;" />
                  Gear
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_location" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent-text); margin: 0;" />
                  Location
                </label>
              </div>
            </fieldset>


            <fieldset id="fieldsetLighting" class="fs-collapsible is-collapsed"><legend>Lighting diagram <span class="legend-opt">optional</span></legend>
              <div class="fs-head">
                <span class="fs-summary" id="fsSummaryLighting">No diagram attached</span>
                <button type="button" class="fs-toggle" aria-expanded="false" aria-controls="fsBodyLighting">+ Expand</button>
              </div>
              <div class="fs-body" id="fsBodyLighting">
              <label class="field"><span>Diagram image</span><input type="file" id="f_diagram_file" accept="image/*" /></label>
              <div id="diagramPreview" style="margin-top: 10px; display: none;">
                <img id="f_diagram_img" style="max-height: 180px; width: auto; object-fit: contain; border-radius: 6px; border: 1px solid var(--line);" alt="Diagram Preview" />
                <button type="button" id="clearDiagramBtn" style="display: block; margin-top: 6px; background: none; border: none; color: var(--danger-text); font-size: var(--font-xs); cursor: pointer; text-decoration: underline; padding: 0;">Remove Diagram</button>
              </div>
              <label class="field"><span>Visibility mode</span>
                <select id="f_diagram_visibility">
                  <option value="private">Private (Admin Only)</option>
                  <option value="public">Public (Visible to everyone)</option>
                  <option value="disabled">Disabled (Do not show at all)</option>
                </select>
              </label>
              </div>
            </fieldset>

            <p class="field-note" id="queueNote">No photos staged yet.</p>
            <button type="submit" class="btn btn-dark btn-block" id="publishBtn" disabled>Publish to the archive</button>
            <!-- Mirrors #queueNote / #publishBtn (see renderStaged) and just
                 clicks the real button, so the form's own submit path stays
                 the single source of truth. -->
            <div class="upload-sticky-bar" id="uploadStickyBar" aria-live="polite">
              <span class="sticky-note" id="stickyQueueNote">No photos staged yet.</span>
              <div class="sticky-actions">
                <button type="button" class="sticky-jump" id="stickyJumpPhotos" title="Scroll to the photo dropzone">↑ Photos</button>
                <button type="button" class="btn btn-dark sticky-publish" id="stickyPublishBtn" disabled>Publish to the archive</button>
              </div>
            </div>
          </form>
        </div>
      </section>`;
  }


  /* ---- upload wiring ---- */
  function wireUpload(editId) {
    staged = [];
    const dz = $("#dropzone"), fi = $("#fileInput"), grid = $("#stagingGrid"), note = $("#queueNote"), pub = $("#publishBtn"), form = $("#shootForm");
    // Bulk pose-tagging: tick photos, click a pose once to tag all of them —
    // avoids setting the Angle/Profile dropdown one photo at a time on
    // shoots with a dozen-plus frames. selectedForBulk is transient UI state
    // (never saved), cleared on every re-render of the grid.
    const selectedForBulk = new Set();
    // "Show on Comp cards" and "Show on Model portfolio" start ticked for a
    // test shoot. On a new album they follow the Type until either is touched;
    // an album being edited keeps what it has.
    const pageSwitches = ["#f_on_compcards", "#f_on_portfolio"].map((sel) => $(sel)).filter(Boolean);
    pageSwitches.forEach((sw) => sw.addEventListener("change", () => { sw.dataset.touched = "1"; }));
    if (!editId) {
      const followType = () => {
        const testShoot = /Test Shoot|Selective Collaboration/.test($("#f_type")?.value || "");
        pageSwitches.forEach((sw) => { if (!sw.dataset.touched) sw.checked = testShoot; });
      };
      $("#f_type")?.addEventListener("change", followType);
      followType();
    }
    const bulkToolbar = $("#thumbBulkToolbar"), bulkCount = $("#thumbBulkCount");
    const ANGLE_LABELS = { "full-body": "Full Body", "front": "Front", "left-profile": "Left Profile", "right-profile": "Right Profile", "three-quarter": "Three-Quarter", "back": "Back", "close-up": "Close-up" };
    function updateBulkToolbar() {
      if (bulkToolbar) bulkToolbar.style.display = staged.length ? "flex" : "none";
      if (bulkCount) bulkCount.textContent = `${selectedForBulk.size} selected`;
    }
    bulkToolbar?.querySelectorAll(".thumb-bulk-angle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!selectedForBulk.size) { toast("Tick the checkbox on each photo you want to tag first."); return; }
        const angle = btn.dataset.angle;
        let n = 0;
        staged.forEach((item) => { if (selectedForBulk.has(item.id)) { item.angle = angle; n++; } });
        selectedForBulk.clear();
        renderStaged();
        toast(`Tagged ${n} photo${n > 1 ? "s" : ""} as ${ANGLE_LABELS[angle]}.`);
      });
    });
    // Kind of work, a look at a time: tick the photos of one look, click its kind.
    // "Follow album" clears the tag, so the photos go back to the album's Activity.
    bulkToolbar?.querySelectorAll(".thumb-bulk-look-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!selectedForBulk.size) { toast("Tick the checkbox on each photo of the look first."); return; }
        const look = btn.dataset.look;
        let n = 0;
        staged.forEach((item) => { if (selectedForBulk.has(item.id)) { item.look = look; n++; } });
        selectedForBulk.clear();
        renderStaged();
        toast(look ? `Tagged ${n} photo${n > 1 ? "s" : ""} as ${lookLabel(look)}.` : `${n} photo${n > 1 ? "s" : ""} now follow${n > 1 ? "" : "s"} the album.`);
      });
    });
    // An untagged photo follows the album, so its dropdown says what that means
    // right now — and says it again whenever Activity or Type changes.
    const syncFollowText = () => grid.querySelectorAll('.thumb-look-select option[value=""]').forEach((o) => { o.textContent = followAlbumText(); });
    $("#f_activity")?.addEventListener("change", syncFollowText);
    $("#f_type")?.addEventListener("change", syncFollowText);
    // "Also for" never repeats the main client.
    const forSelect = $("#f_for_client");
    const syncAlsoFor = () => document.querySelectorAll("#f_also_for .also-for-cb").forEach((cb) => {
      const isMain = cb.value === (forSelect?.value || "");
      if (isMain) cb.checked = false;
      cb.closest("label").style.display = isMain ? "none" : "";
    });
    forSelect?.addEventListener("change", syncAlsoFor);
    syncAlsoFor();
    $("#thumbBulkSelectAll")?.addEventListener("click", () => {
      staged.forEach((item) => selectedForBulk.add(item.id));
      renderStaged();
    });
    $("#thumbBulkClear")?.addEventListener("click", () => {
      selectedForBulk.clear();
      renderStaged();
    });
    // Model type: at most MODEL_TYPES_MAX. Enforced by greying out the boxes
    // that are still unticked once the cap is reached, rather than rejecting
    // the pick on submit — the limit is then visible while choosing instead
    // of being discovered after filling in the whole form.
    const modelTypeBoxes = () => Array.from(document.querySelectorAll("#f_model_types .model-type-cb"));
    const readModelTypes = () => modelTypeBoxes().filter((b) => b.checked).map((b) => b.value);
    const syncModelTypeCap = () => {
      const boxes = modelTypeBoxes();
      if (!boxes.length) return;
      const chosen = boxes.filter((b) => b.checked).length;
      const atCap = chosen >= MODEL_TYPES_MAX;
      boxes.forEach((b) => {
        b.disabled = atCap && !b.checked;
        const label = b.closest("label");
        if (label) label.style.opacity = b.disabled ? "0.45" : "1";
      });
      const hint = $("#f_model_types_hint");
      if (hint) {
        hint.textContent = atCap
          ? `Maximum of ${MODEL_TYPES_MAX} reached — untick one to choose a different type.`
          : "Shown beside the model's name on the comp card album, in the lightbox, and on the exported PDF.";
      }
    };
    // Adds a tickbox for a type the picker isn't offering yet, and hands back
    // the box either way. Needed twice over: for a type the studio types in
    // here, and for one an album already carries that no other album does
    // (edited on another device, or hand-written into data.js).
    const ensureModelTypeBox = (name) => {
      const clean = normalizeModelType(name);
      if (!clean) return null;
      const existing = modelTypeBoxes().find((b) => b.value.toLowerCase() === clean.toLowerCase());
      if (existing) return existing;
      const wrap = $("#f_model_types");
      if (!wrap) return null;
      const label = document.createElement("label");
      label.style.cssText = "display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); font-weight: 500; color: var(--ink); cursor: pointer; user-select: none;";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.className = "model-type-cb";
      box.value = clean;
      box.style.cssText = "width: 16px; height: 16px; accent-color: var(--accent-text);";
      box.addEventListener("change", syncModelTypeCap);
      label.appendChild(box);
      label.appendChild(document.createTextNode(" " + modelTypeLabel(clean)));
      wrap.appendChild(label);
      return box;
    };

    const writeModelTypes = (types) => {
      const wanted = modelTypesOf({ modelTypes: types });
      wanted.forEach(ensureModelTypeBox);
      const set = new Set(wanted.map((t) => t.toLowerCase()));
      modelTypeBoxes().forEach((b) => { b.checked = set.has(b.value.toLowerCase()); });
      syncModelTypeCap();
    };

    // "+ Add" is only ever adding an option to this picker — the type becomes
    // a permanent choice for every other album by virtue of this album being
    // saved with it, so there is no separate list to edit and nothing extra
    // to publish.
    const addTypedModelType = () => {
      const input = $("#f_model_type_new");
      if (!input) return;
      const clean = normalizeModelType(input.value);
      if (!clean) { toast("Type a model type first, e.g. Commercial."); return; }
      const existed = modelTypeBoxes().some((b) => b.value.toLowerCase() === clean.toLowerCase());
      const box = ensureModelTypeBox(clean);
      if (!box) return;
      input.value = "";
      if (box.checked) { toast(`${modelTypeLabel(clean)} is already selected.`); return; }
      // At the cap the option is still added — it just isn't ticked, rather
      // than silently doing nothing or quietly dropping an existing pick.
      if (readModelTypes().length >= MODEL_TYPES_MAX) {
        syncModelTypeCap();
        toast(`Added ${modelTypeLabel(clean)} to the list. Untick one to select it.`);
        return;
      }
      box.checked = true;
      syncModelTypeCap();
      toast(existed ? `Selected ${modelTypeLabel(clean)}.` : `Added ${modelTypeLabel(clean)}.`);
    };
    $("#f_model_type_add")?.addEventListener("click", addTypedModelType);
    $("#f_model_type_new")?.addEventListener("keydown", (e) => {
      // Enter in a text field would otherwise submit the whole album form.
      if (e.key === "Enter") { e.preventDefault(); addTypedModelType(); }
    });

    modelTypeBoxes().forEach((b) => b.addEventListener("change", syncModelTypeCap));
    syncModelTypeCap();

    /* ---- who is in this album ------------------------------------------
       The people are picked from the studio's own list rather than typed
       again per album, because typing a name twice is how one model ends up
       with two comp cards. Adding someone here adds them to that list. */
    const pickedModels = new Set();     // keys ticked for the album being edited
    let openModelKey = "";              // whose details are expanded, if any
    const rosterItems = () => (typeof getModels === "function" ? getModels().items : []);
    const rosterFind = (key) => rosterItems().find((m) => m.key === key) || null;
    const rosterName = (key) => { const m = rosterFind(key); return m ? m.name : modelNameFromKey(key); };
    // Everyone the picker offers: the studio's list, plus anyone this album
    // already tags who is somehow missing from it (edited on another device,
    // or written into data.js by hand). Never a shorter list than the album
    // needs, so a tick can never be silently dropped.
    const pickerKeys = () => {
      const seen = new Map();
      rosterItems().forEach((m) => seen.set(m.key, m.name));
      pickedModels.forEach((k) => { if (!seen.has(k)) seen.set(k, modelNameFromKey(k)); });
      return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: "base" }));
    };

    function renderModelPicker() {
      const wrap = $("#f_models");
      if (!wrap) return;
      const keys = pickerKeys();
      wrap.innerHTML = keys.length
        ? keys.map(([key, name]) => `
            <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px 4px 6px; border: 1px solid ${pickedModels.has(key) ? "var(--accent-text)" : "var(--line-2)"}; border-radius: 20px; background: var(--paper);">
              <label style="display: inline-flex; align-items: center; gap: 6px; font-size: var(--font-sm); font-weight: 500; color: var(--ink); cursor: pointer; user-select: none; margin: 0;">
                <input type="checkbox" class="model-pick-cb" value="${esc(key)}" ${pickedModels.has(key) ? "checked" : ""} style="width: 15px; height: 15px; accent-color: var(--accent-text);" />
                ${esc(name)}
              </label>
              <button type="button" class="model-pick-edit" data-key="${esc(key)}" title="${esc(name)}'s measurements, agency and socials" style="border: 0; background: none; padding: 0 2px; cursor: pointer; font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: ${openModelKey === key ? "var(--accent-text)" : "var(--ink-soft)"};">${openModelKey === key ? "✕" : "✎"}</button>
            </span>`).join("")
        : `<span style="font-size: var(--font-xs); color: var(--ink-soft);">Nobody on the studio's list yet — add the first person below.</span>`;
      wrap.querySelectorAll(".model-pick-cb").forEach((cb) => {
        cb.addEventListener("change", (e) => {
          const key = e.target.value;
          if (e.target.checked) pickedModels.add(key); else { pickedModels.delete(key); if (openModelKey === key) openModelKey = ""; }
          renderModelPicker();
          syncModelsUi();
        });
      });
      wrap.querySelectorAll(".model-pick-edit").forEach((btn) => {
        btn.addEventListener("click", () => {
          openModelKey = openModelKey === btn.dataset.key ? "" : btn.dataset.key;
          renderModelPicker();
          renderModelDetail();
        });
      });
      renderModelDetail();
    }

    /* One person's own details. They belong to the person and not to this
       shoot, so they follow her onto every card built from any album she is
       in — which is the whole point of the list: a model tagged only on a
       brand's job still has measurements and an agency to print. */
    const MODEL_DETAIL_FIELDS = [
      ["name", "Name", "e.g. Aisha Khan"],
      ["talent", "Name with her own links", "e.g. Aisha Khan (@aishak; aishakhan.com)"],
      ["height", "Height", "e.g. 5'9\" / 175 cm"],
      ["chest", "Chest or bust", "e.g. 32 inch"],
      ["waist", "Waist", "e.g. 26\" / 66 cm"],
      ["hips", "Hips", "e.g. 36\" / 91 cm"],
      ["shoes", "Shoes", "e.g. 8 US / 41 EU"],
      ["modelHair", "Hair colour", "e.g. Dark Brown"],
      ["modelEyes", "Eye colour", "e.g. Green"],
      ["agencyCredit", "Agency", "e.g. Inega Model Management (@inegamodels; inega.com)"],
      ["modelEmail", "Email", "name@example.com"],
    ];
    function renderModelDetail() {
      const box = $("#f_model_detail");
      if (!box) return;
      if (!openModelKey) { box.style.display = "none"; box.innerHTML = ""; return; }
      const m = rosterFind(openModelKey) || { key: openModelKey, name: modelNameFromKey(openModelKey) };
      box.style.display = "block";
      box.innerHTML = `
        <p style="margin: 0 0 10px; font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft);">${esc(m.name)} — her own details</p>
        <p style="margin: 0 0 12px; font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5;">These belong to her, not to this shoot, so they show on her card wherever her photographs came from. Leave anything blank and her albums answer for it instead.</p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
          ${MODEL_DETAIL_FIELDS.map(([f, label, ph]) => `
            <label class="field" style="margin: 0;"><span>${esc(label)}</span><input class="model-detail-in" data-f="${esc(f)}" type="text" value="${esc(m[f] || "")}" placeholder="${esc(ph)}" /></label>`).join("")}
          <label class="field" style="margin: 0;"><span>Chest or bust — the word her card uses</span>
            <select class="model-detail-in" data-f="chestLabel">${CHEST_LABELS.map((l) => `<option value="${esc(l)}" ${chestLabelOf(m) === l ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
          </label>
          <label class="field" style="margin: 0;"><span>Model type <em class="label-hint">up to ${MODEL_TYPES_MAX}, comma separated</em></span><input class="model-detail-in" data-f="modelTypes" type="text" value="${esc(modelTypesOf(m).join(", "))}" placeholder="e.g. Fashion, Fitness" /></label>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; align-items: center;">
          <button type="button" id="f_model_detail_save" class="btn btn-ghost" style="height: 36px; padding: 0 16px; font-size: var(--font-xs); font-family: var(--mono-font); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">Save her details</button>
          <span style="font-size: var(--font-xs); color: var(--ink-soft);">Saved on this device until you publish the album.</span>
        </div>`;
      box.querySelectorAll(".model-detail-in").forEach((el) => {
        el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveOpenModelDetail(); } });
      });
      $("#f_model_detail_save")?.addEventListener("click", saveOpenModelDetail);
    }

    function saveOpenModelDetail() {
      if (!openModelKey) return;
      const box = $("#f_model_detail");
      if (!box) return;
      const vals = {};
      box.querySelectorAll(".model-detail-in").forEach((el) => { vals[el.dataset.f] = String(el.value || "").trim(); });
      const name = vals.name || modelNameFromKey(openModelKey);
      if (!name) { toast("A model needs a name — her card has nothing to print without one."); return; }
      const agencyCredit = vals.agencyCredit || "";
      const record = {
        ...(rosterFind(openModelKey) || {}),
        key: openModelKey,
        name,
        talent: vals.talent || name,
        height: vals.height, chest: vals.chest, chestLabel: chestLabelOf({ chestLabel: vals.chestLabel }),
        waist: vals.waist, hips: vals.hips, shoes: vals.shoes,
        modelHair: vals.modelHair, modelEyes: vals.modelEyes,
        // Typed as one credit line and stored split, because the card and the
        // PDFs print the agency's name and link its handle separately.
        agencyCredit,
        agency: getTalentCleanName(agencyCredit),
        agencyHandle: igHandleFromCredit(agencyCredit),
        agencySite: siteFromCredit(agencyCredit),
        agencyLinks: socialsFromCredit(agencyCredit),
        modelEmail: vals.modelEmail,
        modelTypes: modelTypesOf({ modelTypes: String(vals.modelTypes || "").split(",") }),
        updatedAt: Date.now(),
      };
      writeModelRecord(record);
      toast(`Saved ${name}'s details.`);
      renderModelPicker();
    }

    // One way in and out of the studio's list, so nothing writes a half-clean
    // record: cleanModels decides the shape, saveModels persists it, and the
    // live MODELS every page reads is refreshed in the same breath.
    function writeModelRecord(record) {
      const state = (typeof getModels === "function") ? getModels() : { items: [], deleted: [] };
      const items = state.items.filter((m) => m.key !== record.key).concat([record]);
      if (typeof saveModels === "function") saveModels({ items, deleted: state.deleted });
    }

    // "+ Add" takes the same "Name (@handle; site.com)" a credit is typed in,
    // because that is the form every other name field on this page uses.
    function addTypedModel() {
      const input = $("#f_model_new");
      if (!input) return;
      const credit = String(input.value || "").trim();
      const name = getTalentCleanName(credit);
      if (!name) { toast("Type a name first, e.g. Aisha Khan (@aishak)."); return; }
      const key = modelKeyOf(name);
      if (!key) { toast("That name has no letters or digits to make a tag from."); return; }
      const existing = rosterFind(key);
      if (!existing) {
        writeModelRecord({ key, name, talent: credit || name, modelTypes: [], agencyLinks: [], updatedAt: Date.now() });
      }
      input.value = "";
      pickedModels.add(key);
      // Straight into her details when she is new: a model added from a brand
      // shoot has no album of her own to carry her measurements, and a comp
      // card with no measurements is not a comp card.
      openModelKey = existing ? openModelKey : key;
      renderModelPicker();
      syncModelsUi();
      toast(existing ? `${existing.name} is in this album.` : `Added ${name}. Fill in her details below.`);
    }

    /* What the rest of the form does about who is in the album.
       One model: her own stats live on her record, and the album's Model
       stats fieldset edits them — the studio should not have to know there
       are two places. Several: those fields cannot mean anything, so they are
       replaced by a line pointing at each person's own details. */
    function syncModelsUi() {
      const n = pickedModels.size;
      const feedsRow = $("#f_feeds_row");
      if (feedsRow) feedsRow.style.display = n ? "flex" : "none";
      const hint = $("#f_feeds_hint");
      if (hint) {
        hint.textContent = n
          ? ($("#f_feeds_model_cards")?.checked
              ? (n === 1 ? "On. Every photo here shows on her card." : `On. Each photo shows on the cards of whoever is ticked in it below.`)
              : "Off. Nothing from this album reaches anyone's card — tick this once the work is the model's to show.")
          : "";
      }
      const statsFs = $("#modelStatsFieldset");
      const statsNote = $("#f_stats_shared_note");
      if (statsFs) {
        const many = n > 1;
        statsFs.style.display = many ? "none" : "";
        if (statsNote) {
          statsNote.style.display = many ? "block" : "none";
          statsNote.textContent = many
            ? `${n} models in this album — measurements, agency and model type belong to each of them, so edit those with the ✎ beside their name above.`
            : "";
        }
      }
      renderBulkPeople();
      // The per-photo "Who's in it" row appears and disappears with the
      // second model, so the grid has to be rebuilt.
      if (typeof renderStaged === "function") renderStaged();
    }

    // Tag everything selected as one person in a click. Adding rather than
    // replacing, so a frame with two models is two clicks and not a fight:
    // select the frames she is in, click her, select the frames he is in,
    // click him, and the frame in both ends up with both.
    function renderBulkPeople() {
      const wrap = $("#thumbBulkPeople");
      if (!wrap) return;
      const keys = [...pickedModels];
      if (keys.length < 2) { wrap.style.display = "none"; wrap.innerHTML = ""; return; }
      wrap.style.display = "inline-flex";
      wrap.innerHTML = `<span style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink-soft);">Who's in it:</span>`
        + keys.map((k) => `<button type="button" class="thumb-bulk-person-btn" data-key="${esc(k)}" style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">${esc(rosterName(k))}</button>`).join("")
        + `<button type="button" class="thumb-bulk-person-btn" data-key="" style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink-soft); cursor:pointer;">Nobody</button>`;
      wrap.querySelectorAll(".thumb-bulk-person-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (!selectedForBulk.size) { toast("Tick the checkbox on each photo this person is in first."); return; }
          const key = btn.dataset.key;
          let n = 0;
          staged.forEach((item) => {
            if (!selectedForBulk.has(item.id)) return;
            n++;
            if (!key) { item.models = []; return; }
            const have = Array.isArray(item.models) ? item.models.slice() : [];
            if (!have.includes(key)) have.push(key);
            item.models = have;
          });
          selectedForBulk.clear();
          renderStaged();
          toast(key ? `${rosterName(key)} is in ${n} photo${n === 1 ? "" : "s"}.` : `Cleared the people on ${n} photo${n === 1 ? "" : "s"}.`);
        });
      });
    }

    $("#f_model_add")?.addEventListener("click", addTypedModel);
    $("#f_model_new")?.addEventListener("keydown", (e) => {
      // Enter in a text field would otherwise submit the whole album form.
      if (e.key === "Enter") { e.preventDefault(); addTypedModel(); }
    });
    $("#f_feeds_model_cards")?.addEventListener("change", syncModelsUi);

    const diagInput = $("#f_diagram_file"), diagPreview = $("#diagramPreview"), diagImg = $("#f_diagram_img"), diagVisibility = $("#f_diagram_visibility"), clearDiagBtn = $("#clearDiagramBtn");
    /* "Testimonial Only (No Photoshoot Album)" used to live here: a tick that
       turned this whole form into a one-quote editor, filed the result as an
       album with no photos, and left five places in app.js having to remember
       to hide it from the real albums. Testimonials have their own screen now
       — the studio panel on /testimonials — so the mode and everything that
       relabelled the form for it are gone.

       One thing it did has to survive it: the mentor row is hidden in the
       markup and was revealed by that code, because it was hidden only inside
       the mode. A mentor can be credited on any shoot, so it is simply shown. */
    { const row = $("#f_mentor_row"); if (row) row.style.display = ""; }

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
      editingShoot = shootsNow().find(x => x.id === editId);
      if (editingShoot) {
        const pageTitle = $(".page-head h1");
        if (pageTitle) pageTitle.textContent = `Edit album · ${editingShoot.title || "Untitled"}`;
        const pageSub = $(".page-head .page-sub");
        if (pageSub) {
          const d = new Date(editingShoot.date);
          const when = isNaN(d) ? (editingShoot.date || "") : d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
          const count = Array.isArray(editingShoot.photos) ? editingShoot.photos.length : 0;
          pageSub.textContent = [editingShoot.type, when, count ? `${count} photo${count === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || `Editing: ${editingShoot.title}`;
        }
        // Status pill mirrors the "Make album public" toggle once the prefill
        // below has set it (same tick, so a 0ms defer is enough).
        setTimeout(() => {
          const pill = $("#uploadStatusPill"), pubCb = $("#f_is_public");
          if (!pill) return;
          const paint = () => { const live = !!pubCb?.checked; pill.textContent = live ? "Published · public" : "Hidden from site · book only"; pill.classList.toggle("is-live", live); };
          pubCb?.addEventListener("change", paint);
          paint();
        }, 0);
        pub.textContent = "Save changes";
        const stickyPubLabel = $("#stickyPublishBtn");
        if (stickyPubLabel) stickyPubLabel.textContent = "Save changes";
        
        $("#f_brand").value = editingShoot.brand || "Other";

        $("#f_title").value = editingShoot.title || "";
        $("#f_activity").value = editingShoot.activity || "";
        $("#f_type").value = editingShoot.type || "";
        $("#f_season").value = editingShoot.season || "";
        $("#f_photographer").value = editingShoot.photographer || "nerdyphotographer.in";
        if ($("#f_photographer2")) $("#f_photographer2").value = editingShoot.secondaryPhotographers || "";
        $("#f_ad").value = editingShoot.artDirector || "";
        $("#f_stylist").value = (editingShoot.stylist && editingShoot.stylist !== "—") ? editingShoot.stylist : "";
        $("#f_hair").value = (editingShoot.hair && editingShoot.hair !== "—") ? editingShoot.hair : "";
        $("#f_mua").value = (editingShoot.mua && editingShoot.mua !== "—") ? editingShoot.mua : "";
        if ($("#f_video")) $("#f_video").value = (editingShoot.videographer && editingShoot.videographer !== "—") ? editingShoot.videographer : "";
        $("#f_talent").value = editingShoot.talent || "";
        $("#f_location").value = editingShoot.location || "";
        $("#f_desc").value = editingShoot.description || "";
        $("#f_tags").value = editingShoot.tags || "";
        $("#f_gear").value = editingShoot.gear || "";
        $("#f_client").value = editingShoot.client || "";
        // An album saved before clients existed shows the client its page rules
        // already give it, so saving it again changes nothing on the site.
        if ($("#f_for_client")) $("#f_for_client").value = albumClients(editingShoot)[0] || legacyClientOf(editingShoot);
        document.querySelectorAll("#f_also_for .also-for-cb").forEach((cb) => { cb.checked = albumClients(editingShoot).slice(1).includes(cb.value); });
        syncAlsoFor();
        // Who is in it. An album tagged explicitly says so; one from before
        // tagging existed is read with the same rule the pages read it with,
        // so opening an old test shoot shows its model already ticked rather
        // than an empty picker over an album that plainly has a model in it.
        albumModelKeys(editingShoot).forEach((k) => pickedModels.add(k));
        if ($("#f_feeds_model_cards")) $("#f_feeds_model_cards").checked = feedsModelCards(editingShoot);
        $("#f_height").value = editingShoot.height || "";

        // Trigger initial verification updates after loading values (for editing existing albums)
        if ($("#f_mentor")) $("#f_mentor").dispatchEvent(new Event("input"));
        if ($("#f_talent")) $("#f_talent").dispatchEvent(new Event("input"));
        if ($("#f_location")) $("#f_location").dispatchEvent(new Event("input"));
        if ($("#f_stylist")) $("#f_stylist").dispatchEvent(new Event("input"));
        if ($("#f_hair")) $("#f_hair").dispatchEvent(new Event("input"));
        if ($("#f_mua")) $("#f_mua").dispatchEvent(new Event("input"));
        if ($("#f_ad")) $("#f_ad").dispatchEvent(new Event("input"));
        if ($("#f_credits")) $("#f_credits").dispatchEvent(new Event("input"));
        if ($("#f_ig")) $("#f_ig").dispatchEvent(new Event("input"));
        if ($("#f_kavyar")) $("#f_kavyar").dispatchEvent(new Event("input"));
        $("#f_chest").value = editingShoot.chest || "";
        if ($("#f_chest_label")) $("#f_chest_label").value = chestLabelOf(editingShoot);
        $("#f_waist").value = editingShoot.waist || "";
        $("#f_hips").value = editingShoot.hips || "";
        $("#f_shoes").value = editingShoot.shoes || "";
        $("#f_model_hair").value = editingShoot.modelHair || "";
        $("#f_model_eyes").value = editingShoot.modelEyes || "";
        if ($("#f_agency")) {
          const socials = [cleanIgHandle(editingShoot.agencyHandle) ? "@" + cleanIgHandle(editingShoot.agencyHandle) : "", editingShoot.agencySite || ""].filter(Boolean);
          $("#f_agency").value = editingShoot.agencyCredit || (editingShoot.agency ? editingShoot.agency + (socials.length ? ` (${socials.join("; ")})` : "") : "");
        }
        if ($("#f_model_email")) $("#f_model_email").value = editingShoot.modelEmail || "";
        writeModelTypes(editingShoot.modelTypes);
        if ($("#f_show_stats_comp")) $("#f_show_stats_comp").checked = (editingShoot.showStatsOnCompCard !== false);
        if ($("#f_show_stats_port")) $("#f_show_stats_port").checked = (editingShoot.showStatsOnModelPortfolio !== false);
        if ($("#f_show_test_shoot_cat")) $("#f_show_test_shoot_cat").checked = !!editingShoot.showTestShootCategory;
        if ($("#f_mentor")) $("#f_mentor").value = editingShoot.mentor || "";
        if ($("#f_credits")) $("#f_credits").value = editingShoot.credits || "";
        if (editingShoot.pdfUrl) pdfDataUrl = editingShoot.pdfUrl;
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
        // One box per page, ticked where the album appears today.
        const onCompcardsInput = $("#f_on_compcards");
        if (onCompcardsInput) onCompcardsInput.checked = showsOnModelPage(editingShoot, "Comp Cards");
        const onPortfolioInput = $("#f_on_portfolio");
        if (onPortfolioInput) onPortfolioInput.checked = showsOnModelPage(editingShoot, "Model Portfolio");
        const disableDownloadInput = $("#f_disable_download");
        if (disableDownloadInput) {
          disableDownloadInput.checked = !!editingShoot.disableCompCardDownload;
        }

        // Load visibility settings (cache DOM refs to avoid repeated queries)
        const visibilityFields = [
          { id: "#f_is_public", prop: "isPublic" },
          { id: "#f_show_credits", prop: "showCredits" },
          { id: "#f_show_pdf", prop: "showPdf" },
          { id: "#f_show_instagram", prop: "showInstagram" },
          { id: "#f_show_kavyar", prop: "showKavyar" },
          { id: "#f_show_testimonials", prop: "showTestimonials" },
          { id: "#f_show_stats", prop: "showStats" },
          { id: "#f_show_gear", prop: "showGear" },
          { id: "#f_show_location", prop: "showLocation" }
        ];
        visibilityFields.forEach(({ id, prop }) => {
          const el = $(id);
          if (el) el.checked = editingShoot[prop] !== false;
        });
        // Agency defaults to shown, the email to hidden: it is personal data.
        REP_SWITCHES.forEach(([id, what]) => REP_SURFACES.forEach(([sfx, sf]) => { const el = $(`#f_show_${id}_${sfx}`); if (el) el.checked = showRep(editingShoot, what, sf); }));

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
            look: p.look || "",
            // Who is in the frame. Another field this explicit list would drop
            // on save if it were left out — re-saving a tagged album would
            // untag every photograph in it.
            models: Array.isArray(p.models) ? p.models.slice() : [],
            // The 480/960px variants have to ride along through the edit form.
            // This mapping is an explicit field list, so anything missing from
            // it is silently dropped on save — which is how editing an album
            // (even just to change its type) stripped every responsive path it
            // had, orphaning the generated files and sending phone visitors
            // back to downloading full-size images.
            ...(p.small ? { small: p.small } : {}),
            ...(p.medium ? { medium: p.medium } : {}),
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
    const stickyNote = $("#stickyQueueNote");
    const stickyPub = $("#stickyPublishBtn");
    const stickyBar = $("#uploadStickyBar");
    $("#stickyPublishBtn")?.addEventListener("click", () => pub.click());
    $("#stickyJumpPhotos")?.addEventListener("click", () => {
      ($("#dropzone") || $(".dropzone"))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    // The bar is position: fixed (see styles.css), so it decides its own
    // visibility: shown only while the form is on screen and the real
    // Publish/Save button is not — at the bottom of the page the button
    // itself is right there and a second copy over it just gets in the way.
    if (stickyBar && form && "IntersectionObserver" in window) {
      let formOnScreen = false, realBtnOnScreen = false;
      const syncBar = () => stickyBar.classList.toggle("is-hidden", !formOnScreen || realBtnOnScreen);
      stickyBar.classList.add("is-hidden");
      new IntersectionObserver(([e]) => { formOnScreen = e.isIntersecting; syncBar(); }, { threshold: 0 }).observe(form);
      new IntersectionObserver(([e]) => { realBtnOnScreen = e.isIntersecting; syncBar(); }, { threshold: 0, rootMargin: "0px 0px 40px 0px" }).observe(pub);
    }

    // Collapsible optional sections (model stats, testimonials, lighting) and
    // the section strip. Collapse is a class on the fieldset that hides its
    // .fs-body — deliberately not style.display on the fieldset itself, which
    // updateTestimonialFormState already owns for testimonial-only mode.
    const setCollapsed = (fs, collapsed) => {
      fs.classList.toggle("is-collapsed", collapsed);
      const btn = fs.querySelector(".fs-toggle");
      if (btn) { btn.setAttribute("aria-expanded", String(!collapsed)); btn.textContent = collapsed ? "+ Expand" : "− Collapse"; }
    };
    form.querySelectorAll(".fs-collapsible").forEach(fs => {
      fs.querySelector(".fs-toggle")?.addEventListener("click", () => {
        fs.dataset.userToggled = "1";
        setCollapsed(fs, !fs.classList.contains("is-collapsed"));
      });
    });
    const fieldVal = (id) => ($("#" + id)?.value || "").trim();
    const refreshSectionSummaries = () => {

      const hasDiagram = ($("#diagramPreview") && $("#diagramPreview").style.display !== "none") || !!($("#f_diagram_file")?.files?.length);
      const sumL = $("#fsSummaryLighting");
      if (sumL) sumL.textContent = hasDiagram ? `Diagram attached · ${$("#f_diagram_visibility")?.selectedOptions?.[0]?.textContent || ""}` : "No diagram attached";

      const statsFilled = ["f_height", "f_chest", "f_waist", "f_hips", "f_shoes", "f_model_hair", "f_model_eyes"].filter(id => fieldVal(id)).length;
      const types = form.querySelectorAll(".model-type-cb:checked").length;
      const isCompish = /Test Shoot|Selective Collaboration/.test(fieldVal("f_type")) || !!($("#f_on_compcards")?.checked || $("#f_on_portfolio")?.checked);
      const sumS = $("#fsSummaryStats");
      if (sumS) {
        const parts = [];
        if (types) parts.push(`${types} model type${types > 1 ? "s" : ""}`);
        if (statsFilled) parts.push(`${statsFilled} of 7 measurements`);
        sumS.textContent = parts.length ? parts.join(" · ") : (isCompish ? "Comp card — add model type & measurements" : "Only for comp cards — measurements, model type");
      }

      // Sections open themselves when they have content (edit mode) or are
      // relevant to the shoot type, unless the admin has toggled them by hand.
      const auto = (fs, open) => { if (fs && !fs.dataset.userToggled) setCollapsed(fs, !open); };
      auto($("#fieldsetLighting"), hasDiagram);
      auto($("#modelStatsFieldset"), isCompish || statsFilled > 0 || types > 0);
    };
    form.addEventListener("input", refreshSectionSummaries);
    form.addEventListener("change", refreshSectionSummaries);
    // The diagram preview appears after an async FileReader, not on the change
    // event itself; the same goes for clearing it.
    $("#f_diagram_file")?.addEventListener("change", () => setTimeout(refreshSectionSummaries, 300));
    $("#clearDiagramBtn")?.addEventListener("click", () => setTimeout(refreshSectionSummaries, 0));
    refreshSectionSummaries();
    // Edit-mode prefill runs later in this function; a deferred pass reads it.
    setTimeout(refreshSectionSummaries, 0);

    const strip = $("#uploadSections");
    if (strip) {
      const chips = Array.from(strip.querySelectorAll("button[data-target]"));
      // Tabs: one section on screen at a time. "Extras" owns two fieldsets
      // (testimonials + lighting). A fieldset that testimonial-only mode has
      // hidden inline (style.display, see updateTestimonialFormState) stays
      // hidden whichever tab is on, and a chip whose every fieldset is hidden
      // that way disappears with it.
      const groups = { fieldsetLighting: ["fieldsetLighting"] };
      const fsOf = (key) => (groups[key] || [key]).map(id => document.getElementById(id)).filter(Boolean);
      const tabbed = new Set(chips.flatMap(ch => fsOf(ch.dataset.target)));
      const chipUsable = (ch) => fsOf(ch.dataset.target).some(f => f.style.display !== "none");
      let current = null;
      const activate = (key) => {
        current = key;
        const show = new Set(fsOf(key));
        tabbed.forEach(f => f.classList.toggle("tab-hidden", !show.has(f)));
        show.forEach(f => { if (f.classList.contains("is-collapsed")) { f.dataset.userToggled = "1"; setCollapsed(f, false); } });
        chips.forEach(ch => ch.classList.toggle("active", ch.dataset.target === key));
        form.dataset.tab = key;
      };
      const syncChips = () => {
        chips.forEach(ch => { ch.hidden = !chipUsable(ch); });
        const cur = chips.find(ch => ch.dataset.target === current);
        if (!cur || cur.hidden) { const first = chips.find(ch => !ch.hidden); if (first) activate(first.dataset.target); }
      };
      chips.forEach(ch => ch.addEventListener("click", () => activate(ch.dataset.target)));
      // Browser validation cannot focus a control inside a hidden tab, so a
      // required field left empty on another tab would fail silently.
      form.addEventListener("invalid", (e) => {
        const f = e.target.closest("fieldset");
        if (!f || !f.classList.contains("tab-hidden")) return;
        const owner = chips.find(ch => fsOf(ch.dataset.target).includes(f));
        if (owner) activate(owner.dataset.target);
      }, true);
      if ("MutationObserver" in window) {
        const mo = new MutationObserver(syncChips);
        tabbed.forEach(f => mo.observe(f, { attributes: true, attributeFilter: ["style"] }));
      }
      activate(chips[0].dataset.target);
      syncChips();
    }
    function renderStaged() {
      const n = staged.length; pub.disabled = n === 0;
      note.textContent = n ? `${n} photo${n > 1 ? "s" : ""} ready — drag to reorder, drag the dot to set focus.` : "No photos staged yet.";
      note.classList.toggle("ready", n > 0);
      const dzCount = $("#dzCount"); if (dzCount) dzCount.textContent = "· " + n;
      if (stickyPub) stickyPub.disabled = pub.disabled;
      if (stickyNote) {
        stickyNote.textContent = n ? `${n} photo${n > 1 ? "s" : ""} ready` : "No photos staged yet";
        stickyNote.classList.toggle("ready", n > 0);
      }
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
            <label style="display: flex; align-items: center; gap: 5px; font-size: var(--font-xs); color: var(--ink-soft); cursor: pointer;">
              <input type="checkbox" class="thumb-bulk-check" data-id="${f.id}" ${selectedForBulk.has(f.id) ? 'checked' : ''} style="width: 12px; height: 12px; accent-color: var(--accent-text); margin: 0; cursor: pointer;" />
              Select for bulk tagging
            </label>
            <input type="text" class="thumb-caption-input" data-id="${f.id}" value="${esc(f.caption || '')}" placeholder="Add caption…" style="width: 100%; box-sizing: border-box; font-size: var(--font-xs); padding: 4px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); outline: none;" />
            
            <div style="display: grid; grid-template-columns: 1fr; gap: 4px;">
              <label style="font-size: var(--font-xs); color: var(--ink-soft); display: flex; flex-direction: column; gap: 2px;">
                <span>Kind of work</span>
                <select class="thumb-look-select" data-id="${f.id}" style="font-size: var(--font-xs); padding: 2px 4px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); width: 100%;">
                  <option value="" ${!lookByKey.has(f.look) ? 'selected' : ''}>${esc(followAlbumText())}</option>
                  ${LOOKS.map((l) => `<option value="${esc(l.key)}" ${f.look === l.key ? 'selected' : ''}>${esc(l.label)}</option>`).join("")}
                </select>
              </label>
              ${pickedModels.size > 1 ? `
              <div style="font-size: var(--font-xs); color: var(--ink-soft); display: flex; flex-direction: column; gap: 3px;">
                <span>Who's in it${(Array.isArray(f.models) && f.models.filter((k) => pickedModels.has(k)).length) ? "" : ` <em style="font-style: normal; color: var(--danger-text); font-weight: 700;">— nobody yet</em>`}</span>
                <div style="display: flex; flex-wrap: wrap; gap: 3px;">
                  ${[...pickedModels].map((key) => {
                    const on = Array.isArray(f.models) && f.models.includes(key);
                    return `<button type="button" class="thumb-model-btn" data-id="${esc(f.id)}" data-key="${esc(key)}" aria-pressed="${on}" style="font-family: var(--mono-font); font-size: 9px; font-weight: 700; padding: 3px 6px; border-radius: 4px; cursor: pointer; border: 1px solid ${on ? "var(--accent-text)" : "var(--line-2)"}; background: ${on ? "var(--accent-text)" : "var(--paper)"}; color: ${on ? "#fff" : "var(--ink-soft)"};">${esc(rosterName(key))}</button>`;
                  }).join("")}
                </div>
              </div>` : ""}
              <label style="font-size: var(--font-xs); color: var(--ink-soft); display: flex; flex-direction: column; gap: 2px;">
                <span>Usage</span>
                <select class="thumb-usage-select" data-id="${f.id}" style="font-size: var(--font-xs); padding: 2px 4px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); width: 100%;">
                  <option value="both" ${f.usage === 'both' ? 'selected' : ''}>Both (Comp & Port)</option>
                  <option value="portfolio" ${f.usage === 'portfolio' ? 'selected' : ''}>Portfolio Only</option>
                  <option value="comp" ${f.usage === 'comp' ? 'selected' : ''}>Comp Card Only</option>
                  <option value="none" ${f.usage === 'none' ? 'selected' : ''}>Albums Only (No Comp/Port)</option>
                </select>
              </label>
              <label style="font-size: var(--font-xs); color: var(--ink-soft); display: flex; flex-direction: column; gap: 2px;">
                <span>Angle / Profile</span>
                <select class="thumb-angle-select" data-id="${f.id}" style="font-size: var(--font-xs); padding: 2px 4px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); width: 100%;">
                  <option value="" ${!f.angle ? 'selected' : ''}>Unspecified</option>
                  <option value="full-body" ${f.angle === 'full-body' ? 'selected' : ''}>Full Body Shot</option>
                  <option value="front" ${f.angle === 'front' ? 'selected' : ''}>Front Portrait</option>
                  <option value="left-profile" ${f.angle === 'left-profile' ? 'selected' : ''}>Left Profile</option>
                  <option value="right-profile" ${f.angle === 'right-profile' ? 'selected' : ''}>Right Profile</option>
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

      grid.querySelectorAll(".thumb-model-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const item = staged.find((x) => x.id === btn.dataset.id);
          if (!item) return;
          const key = btn.dataset.key;
          const have = Array.isArray(item.models) ? item.models.slice() : [];
          const at = have.indexOf(key);
          if (at >= 0) have.splice(at, 1); else have.push(key);
          item.models = have;
          renderStaged();
        });
        btn.addEventListener("mousedown", (e) => e.stopPropagation());
      });

      grid.querySelectorAll(".thumb-usage-select").forEach((sel) => {
        sel.addEventListener("change", (e) => {
          const item = staged.find(x => x.id === e.target.dataset.id);
          if (item) {
            item.usage = e.target.value;
            // The old boolean is kept in step with the dropdown. It is a second
            // lock on the comp card surfaces, and the only one a visitor still
            // running a cached older build understands — that build has never
            // heard of "none", so without this it would put the photo on a
            // comp card until it next reloads.
            item.excludeFromCompCard = (e.target.value === "portfolio" || e.target.value === "none");
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

      grid.querySelectorAll(".thumb-look-select").forEach((sel) => {
        sel.addEventListener("change", (e) => {
          const item = staged.find(x => x.id === e.target.dataset.id);
          if (item) item.look = e.target.value;
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

      grid.querySelectorAll(".thumb-bulk-check").forEach((cb) => {
        cb.addEventListener("change", (e) => {
          const id = e.target.dataset.id;
          if (e.target.checked) selectedForBulk.add(id); else selectedForBulk.delete(id);
          updateBulkToolbar();
        });
        cb.addEventListener("mousedown", (e) => e.stopPropagation());
      });
      updateBulkToolbar();
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

    // Generic link verification for all fields with custom parsers
    function setupLinkVerification(fieldId, verifyId, flagName, parseLinks) {
      const input = $("#" + fieldId);
      const verify = $("#" + verifyId);
      if (!input || !verify) return;

      let clickedFlag = false;
      let hasLinks = false;

      // Capture clicks on verification links
      verify.addEventListener("click", (e) => {
        if (e.target.closest("a")) clickedFlag = true;
      }, true);

      function updateVerify() {
        const val = input.value.trim();
        if (!val) {
          verify.style.display = "none";
          verify.innerHTML = "";
          hasLinks = false;
          return;
        }

        // Use custom parser if provided, otherwise use default
        const allLinks = parseLinks ? parseLinks(val) : parseDefaultLinks(val);

        if (!allLinks.length) {
          verify.style.display = "none";
          verify.innerHTML = "";
          hasLinks = false;
          return;
        }

        hasLinks = true;
        const linksHtml = allLinks.map(({ label, url }) =>
          `<a href="${esc(url)}" target="_blank" rel="noopener" style="color:var(--accent-text); font-weight:600; text-decoration:underline; display:inline-flex; align-items:center; gap:2px; margin-right:12px;">${esc(label)} ↗</a>`
        ).join("");
        verify.innerHTML = `<span style="color:var(--ink-soft); font-family:var(--mono-font); font-size: var(--font-xs); margin-right:6px; text-transform:uppercase;">Verify links:</span> ${linksHtml}`;
        verify.style.display = "block";
      }

      function parseDefaultLinks(val) {
        // Default parser: looks for links in parentheses (Name (@handle; site.com))
        const items = val.split(",").map(item => item.trim()).filter(Boolean);
        const allLinks = [];
        items.forEach(item => {
          const parenRegex = /\(([^)]+)\)/;
          const match = item.match(parenRegex);
          if (match) {
            const socials = match[1].split(";").map(s => s.trim()).filter(Boolean);
            socials.forEach(s => {
              const c = classifySocial(s);
              if (c && c.kind !== "email") allLinks.push({ label: c.label, url: c.url });
            });
          }
        });
        return allLinks;
      }

      setTimeout(updateVerify, 50);
      input.addEventListener("input", () => {
        clickedFlag = false;
        updateVerify();
      });
      input.addEventListener("blur", updateVerify);

      window[flagName] = {
        get: () => clickedFlag,
        hasLinks: () => hasLinks,
        set: (v) => { clickedFlag = v; }
      };
    }

    // Custom parser for Instagram handles or URLs
    const parseInstagramLinks = (val) => {
      const items = val.split(",").map(item => item.trim()).filter(Boolean);
      const links = [];
      items.forEach(item => {
        let handle = item;
        // If it's a full URL, extract handle
        if (handle.includes("instagram.com")) {
          handle = handle.split("instagram.com/")[1]?.split("/")[0]?.split("?")[0] || "";
        }
        // Remove @ prefix if present
        if (handle.startsWith("@")) {
          handle = handle.substring(1);
        }
        // Use parseIgHandle to clean it up
        const cleaned = parseIgHandle(handle);
        if (cleaned) {
          links.push({
            label: `@${cleaned}`,
            url: `https://instagram.com/${encodeURIComponent(cleaned)}`
          });
        }
      });
      return links;
    };

    // Custom parser for Kavyar links
    const parseKavyarLinks = (val) => {
      const links = val.split(",").map(h => parseKavyarLink(h.trim())).filter(Boolean);
      return links.map(url => ({
        label: `Kavyar: ${url.split("/").pop()}`,
        url: url
      }));
    };

    // Initialize verification for ALL fields using unified generic system
    setupLinkVerification("f_talent", "f_talent_verify", "talentVerifyFlag");
    setupLinkVerification("f_location", "f_location_verify", "locationVerifyFlag");
    setupLinkVerification("f_stylist", "f_stylist_verify", "stylistVerifyFlag");
    setupLinkVerification("f_hair", "f_hair_verify", "hairVerifyFlag");
    setupLinkVerification("f_mua", "f_mua_verify", "muaVerifyFlag");
    setupLinkVerification("f_ad", "f_ad_verify", "adVerifyFlag");
    setupLinkVerification("f_photographer2", "f_photographer2_verify", "photographer2VerifyFlag");
    setupLinkVerification("f_video", "f_video_verify", "videoVerifyFlag");
    setupLinkVerification("f_agency", "f_agency_verify", "agencyVerifyFlag");
    setupLinkVerification("f_mentor", "f_mentor_verify", "mentorVerifyFlag");
    setupLinkVerification("f_credits", "f_credits_verify", "creditsVerifyFlag");
    setupLinkVerification("f_ig", "f_ig_verify", "igVerifyFlag", parseInstagramLinks);
    setupLinkVerification("f_kavyar", "f_kavyar_verify", "kavyarVerifyFlag", parseKavyarLinks);

    // PDF file upload handler
    let pdfDataUrl = editingShoot?.pdfUrl || "";
    const pdfInput = $("#f_pdf");
    if (pdfInput) {
      pdfInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            pdfDataUrl = evt.target?.result || "";
            toast(`PDF loaded: ${file.name}`);
          };
          reader.onerror = () => toast("Failed to read PDF");
          reader.readAsDataURL(file);
        }
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const val = (id) => $("#" + id)?.value.trim();
      const igVal = val("f_ig");
      const originalIg = editingShoot ? (editingShoot.instagram || "") : "";
      if (igVal && igVal !== originalIg && window.igVerifyFlag?.hasLinks?.() && !window.igVerifyFlag?.get?.()) {
        toast("Please test the Instagram links before publishing.");
        return;
      }
      const kavyarVal = val("f_kavyar");
      const originalKavyar = editingShoot ? (editingShoot.kavyar || "") : "";
      if (kavyarVal && kavyarVal !== originalKavyar && window.kavyarVerifyFlag?.hasLinks?.() && !window.kavyarVerifyFlag?.get?.()) {
        toast("Please test the Kavyar links before publishing.");
        return;
      }
      const creditsVal = val("f_credits");
      const originalCredits = editingShoot ? (editingShoot.credits || "") : "";
      if (creditsVal && creditsVal !== originalCredits && window.creditsVerifyFlag?.hasLinks?.() && !window.creditsVerifyFlag?.get?.()) {
        toast("Please test the credit links before publishing.");
        return;
      }
      const mentorVal = val("f_mentor");
      const originalMentor = editingShoot ? (editingShoot.mentor || "") : "";
      if (mentorVal && mentorVal !== originalMentor && window.mentorVerifyFlag?.hasLinks?.() && !window.mentorVerifyFlag?.get?.()) {
        toast("Please test the mentor links before publishing.");
        return;
      }
      const stylistVal = val("f_stylist");
      const originalStylist = editingShoot ? (editingShoot.stylist || "") : "";
      if (stylistVal && stylistVal !== originalStylist && window.stylistVerifyFlag?.hasLinks?.() && !window.stylistVerifyFlag?.get?.()) {
        toast("Please test the stylist links before publishing.");
        return;
      }
      const hairVal = val("f_hair");
      const originalHair = editingShoot ? (editingShoot.hair || "") : "";
      if (hairVal && hairVal !== originalHair && window.hairVerifyFlag?.hasLinks?.() && !window.hairVerifyFlag?.get?.()) {
        toast("Please test the hair stylist links before publishing.");
        return;
      }
      const muaVal = val("f_mua");
      const originalMua = editingShoot ? (editingShoot.mua || "") : "";
      if (muaVal && muaVal !== originalMua && window.muaVerifyFlag?.hasLinks?.() && !window.muaVerifyFlag?.get?.()) {
        toast("Please test the makeup artist links before publishing.");
        return;
      }
      const adVal = val("f_ad");
      const originalAd = editingShoot ? (editingShoot.artDirector || "") : "";
      if (adVal && adVal !== originalAd && window.adVerifyFlag?.hasLinks?.() && !window.adVerifyFlag?.get?.()) {
        toast("Please test the art director links before publishing.");
        return;
      }
      const photographer2Val = val("f_photographer2");
      const originalPhotographer2 = editingShoot ? (editingShoot.secondaryPhotographers || "") : "";
      if (photographer2Val && photographer2Val !== originalPhotographer2 && window.photographer2VerifyFlag?.hasLinks?.() && !window.photographer2VerifyFlag?.get?.()) {
        toast("Please test the secondary photographer links before publishing.");
        return;
      }
      const agencyVal = val("f_agency");
      const originalAgency = editingShoot ? (editingShoot.agencyCredit || "") : "";
      if (agencyVal && agencyVal !== originalAgency && window.agencyVerifyFlag?.hasLinks?.() && !window.agencyVerifyFlag?.get?.()) {
        toast("Please test the agency links before publishing.");
        return;
      }
      const videoVal = val("f_video");
      const originalVideo = editingShoot ? (editingShoot.videographer || "") : "";
      if (videoVal && videoVal !== originalVideo && window.videoVerifyFlag?.hasLinks?.() && !window.videoVerifyFlag?.get?.()) {
        toast("Please test the videographer links before publishing.");
        return;
      }
      const talentVal = val("f_talent");
      const originalTalent = editingShoot ? (editingShoot.talent || "") : "";
      if (talentVal && talentVal !== originalTalent && window.talentVerifyFlag?.hasLinks?.() && !window.talentVerifyFlag?.get?.()) {
        toast("Please test the talent/model links before publishing.");
        return;
      }
      const locationVal = val("f_location");
      const originalLocation = editingShoot ? (editingShoot.location || "") : "";
      if (locationVal && locationVal !== originalLocation && window.locationVerifyFlag?.hasLinks?.() && !window.locationVerifyFlag?.get?.()) {
        toast("Please test the location links before publishing.");
        return;
      }
      {
        if (!staged.length) { toast("Add at least one photo first."); return; }
        // Both drive which page this album appears on, so neither may be guessed.
        if (!$("#f_activity").value) { toast("Pick an Activity — it decides which page this album shows up on. Use Creative if it fits none of them."); $("#f_activity").focus(); return; }
        if (!$("#f_type").value) { toast("Pick a Type — Test Shoot for your own work, Campaign or Commercial only for a paid job."); $("#f_type").focus(); return; }
        if ($("#f_type").value !== "Workshop Attended" && $("#f_for_client") && !$("#f_for_client").value) { toast("Pick who this album is for — it decides which client page it shows up on."); $("#f_for_client").focus(); return; }
      }
      
      /* Quotes are no longer typed into this form — they belong to the
         testimonials panel, which can also tie one to a shoot. Anything an
         older build attached to THIS album is carried through untouched, so
         re-saving an album published before the move cannot silently drop a
         quote someone gave. Nothing new is ever added here. */
      const testimonialsList = Array.isArray(editingShoot?.testimonials) ? editingShoot.testimonials : [];

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
      /* One model in this album means the Model stats fieldset above IS her
         record: the studio should not have to learn that a height lives in
         two places. Only non-empty values are carried over, so an album whose
         stats were never filled in cannot blank what her other albums know.
         Her name is only rewritten when the credit line still names HER —
         otherwise a mistyped talent field would quietly rename somebody. */
      if (pickedModels.size === 1) {
        const soleKey = [...pickedModels][0];
        const prev = rosterFind(soleKey) || { key: soleKey, name: modelNameFromKey(soleKey), agencyLinks: [], modelTypes: [] };
        const keep = (v, was) => (String(v || "").trim() || was || "");
        const talentVal2 = val("f_talent");
        const samePerson = modelKeyOf(talentVal2) === soleKey;
        const agencyCredit2 = val("f_agency");
        const typesNow = modelTypesOf({ modelTypes: readModelTypes() });
        writeModelRecord({
          ...prev,
          key: soleKey,
          name: samePerson ? (getTalentCleanName(talentVal2) || prev.name) : prev.name,
          talent: samePerson ? (talentVal2 || prev.talent || prev.name) : (prev.talent || prev.name),
          height: keep(val("f_height"), prev.height),
          chest: keep(val("f_chest"), prev.chest),
          chestLabel: chestLabelOf({ chestLabel: val("f_chest_label") }),
          waist: keep(val("f_waist"), prev.waist),
          hips: keep(val("f_hips"), prev.hips),
          shoes: keep(val("f_shoes"), prev.shoes),
          modelHair: keep(val("f_model_hair"), prev.modelHair),
          modelEyes: keep(val("f_model_eyes"), prev.modelEyes),
          agencyCredit: keep(agencyCredit2, prev.agencyCredit),
          agency: agencyCredit2 ? getTalentCleanName(agencyCredit2) : (prev.agency || ""),
          agencyHandle: agencyCredit2 ? igHandleFromCredit(agencyCredit2) : (prev.agencyHandle || ""),
          agencySite: agencyCredit2 ? siteFromCredit(agencyCredit2) : (prev.agencySite || ""),
          agencyLinks: agencyCredit2 ? socialsFromCredit(agencyCredit2) : (prev.agencyLinks || []),
          modelEmail: keep(val("f_model_email"), prev.modelEmail),
          modelTypes: typesNow.length ? typesNow : (prev.modelTypes || []),
          updatedAt: Date.now(),
        });
      }

      const shoot = {
        id: editingShoot ? editingShoot.id : uid(),
        createdAt: editingShoot ? editingShoot.createdAt : Date.now(),
        // Kept on the record, always false: five filters in app.js still ask,
        // and an album saved without the field would read as undefined there.
        isTestimonial: false,
        title: val("f_title") || "Untitled",
        brand: val("f_brand") || "Other",
        activity: $("#f_activity").value,
        type: $("#f_type").value,
        season: val("f_season"),
        photographer: val("f_photographer") || "Studio",
        secondaryPhotographers: val("f_photographer2"),
        artDirector: val("f_ad"),
        stylist: val("f_stylist") || "—",
        hair: val("f_hair") || "—",
        mua: val("f_mua") || "—",
        videographer: val("f_video") || "—",
        talent: val("f_talent"),
        location: val("f_location"),
        height: val("f_height"),
        chest: val("f_chest"),
        chestLabel: chestLabelOf({ chestLabel: val("f_chest_label") }),
        waist: val("f_waist"),
        hips: val("f_hips"),
        shoes: val("f_shoes"),
        modelHair: val("f_model_hair"),
        modelEyes: val("f_model_eyes"),
        // Per album, because a model changes agencies between shoots; the
        // unified comp card reads the most recent album that names one.
        agencyCredit: val("f_agency"),
        agency: getTalentCleanName(val("f_agency")),
        agencyHandle: igHandleFromCredit(val("f_agency")),
        agencySite: siteFromCredit(val("f_agency")),
        agencyLinks: socialsFromCredit(val("f_agency")),
        modelEmail: val("f_model_email"),
        modelTypes: modelTypesOf({ modelTypes: readModelTypes() }),
        // Who is in this album. Written only when the studio has actually
        // ticked somebody: an album saved without touching the picker keeps
        // no modelKeys at all and is read by the old rule, so nothing
        // published before tagging existed changes by being saved again.
        ...(pickedModels.size ? { modelKeys: [...pickedModels] } : {}),
        ...(pickedModels.size ? { feedsModelCards: $("#f_feeds_model_cards")?.checked ?? false } : {}),
        showStatsOnCompCard: $("#f_show_stats_comp") ? $("#f_show_stats_comp").checked : true,
        showStatsOnModelPortfolio: $("#f_show_stats_port") ? $("#f_show_stats_port").checked : true,
        showTestShootCategory: $("#f_show_test_shoot_cat") ? $("#f_show_test_shoot_cat").checked : false,
        mentor: val("f_mentor"),
        credits: val("f_credits"),
        description: val("f_desc"),
        tags: val("f_tags"),
        gear: val("f_gear"),
        client: val("f_client"),
        forClient: $("#f_for_client")?.value || "",
        alsoFor: [...document.querySelectorAll("#f_also_for .also-for-cb:checked")].map((cb) => cb.value).filter((k) => k !== $("#f_for_client")?.value),
        date: dateVal,
        instagram: val("f_ig"),
        kavyar: val("f_kavyar"),
        link: val("f_link"),
        pdfUrl: pdfDataUrl,
        rights: val("f_rights"),
        testimonials: testimonialsList,
        lightingDiagram: diagramDataUrl,
        lightingDiagramVisibility: $("#f_diagram_visibility").value,
        palette: pColors,
        photos: staged.map((f, i) => ({
          id: f.id + "-" + i,
          dataUrl: f.dataUrl,
          url: f.url,
          objectPosition: f.objectPosition || (f.isCover ? "top" : "center"),
          // Derived from usage, not only carried over: whatever path produced
          // this photo, the old boolean can never end up disagreeing with the
          // dropdown (see the change handler in renderStaged).
          excludeFromCompCard: !!f.excludeFromCompCard || f.usage === "portfolio" || f.usage === "none",
          usage: f.usage || (f.excludeFromCompCard ? "portfolio" : "both"),
          angle: f.angle || "",
          // "" is "follows the album", on purpose: a missing field is what the
          // publish step fills in from the live copy (see syncToGitHub).
          look: lookByKey.has(f.look) ? f.look : "",
          // Who is in this frame, kept only to people actually in the album.
          // Untagging someone in the picker must not leave her tagged on the
          // photographs, or her card would keep collecting them.
          models: Array.isArray(f.models) ? f.models.filter((k) => pickedModels.has(k)) : [],
          // Carried back out of the staging list — see the note where staged
          // is built. Kept by value: a photo's id is re-derived from its
          // position here, but these paths point at the file that was actually
          // uploaded, so they must survive a reorder unchanged.
          ...(f.small ? { small: f.small } : {}),
          ...(f.medium ? { medium: f.medium } : {}),
          ...(typeof f.focalX === "number" ? { focalX: f.focalX, focalY: f.focalY } : {}),
          ...(f.caption && f.caption.trim() ? { caption: f.caption.trim() } : {})
        })),
        featured: $("#f_featured")?.checked ?? false,
        // Comp cards keep their original pair of flags; the portfolio page has its own.
        showAsCompCard: $("#f_on_compcards")?.checked ?? false,
        hideFromCompCard: !($("#f_on_compcards")?.checked ?? false),
        showOnModelPortfolio: $("#f_on_portfolio")?.checked ?? false,
        disableCompCardDownload: $("#f_disable_download")?.checked ?? false,
        isPublic: $("#f_is_public")?.checked ?? true,
        showCredits: $("#f_show_credits")?.checked ?? true,
        showPdf: $("#f_show_pdf")?.checked ?? true,
        showInstagram: $("#f_show_instagram")?.checked ?? true,
        showKavyar: $("#f_show_kavyar")?.checked ?? true,
        showTestimonials: $("#f_show_testimonials")?.checked ?? true,
        showStats: $("#f_show_stats")?.checked ?? true,
        showGear: $("#f_show_gear")?.checked ?? true,
        showLocation: $("#f_show_location")?.checked ?? true,
        ...repSwitchValues(),
        coverPhotoId: (coverItem ? coverItem.id : null),
      };
      /* The same switches onto the models this album credits.

         A model's card is merged from every album they are tagged in, and it
         takes each visibility switch from whatever supplied the value it
         guards — the model's own record when that holds one. A model whose
         email lives on their record therefore read the switch from there and
         never from the album, so ticking "Email → PDFs" here saved, published,
         and did nothing: the record still said no, and nothing on this page
         could reach it. Studio hit this on Atharv Sharma's portfolio, Sep 2026.

         The album is where the studio works, so the album decides. Only the
         switches are written across; the model's name, stats and agency are
         their record's own. */
      if (pickedModels.size && typeof getModels === "function" && typeof saveModels === "function") {
        try {
          const flags = repSwitchValues();
          const roster = getModels() || { items: [], deleted: [] };
          const items = (roster.items || []).map((m) =>
            pickedModels.has(m.key) ? { ...m, ...flags, updatedAt: Date.now() } : m);
          saveModels({ items, deleted: roster.deleted || [] });
        } catch (err) {
          console.warn("Could not carry the visibility switches to the model records:", err);
        }
      }
      pub.disabled = true; pub.textContent = editingShoot ? "Saving changes…" : "Publishing…";
      await putShoot(shoot);
      await loadShoots();
      toast(editingShoot ? `Saved changes to “${shoot.title}”.` : `Published “${shoot.title}” — ${staged.length} frame${staged.length > 1 ? "s" : ""}.`);
      staged = [];
      history.pushState(null, "", "/"); render();
      await syncToGitHub(shootsNow());
    });
    // Both painted last: the prefill above has decided who is ticked by now,
    // and syncModelsUi rebuilds the grid, so renderStaged must already exist.
    renderModelPicker();
    syncModelsUi();
    renderStaged();
  }


  /* ---- book-builder loader ---- */
  // The builder draws every page with the engine in pdf-tools.js, which it
  // reaches through window.WPS_BOOK_API synchronously — so that file is
  // fetched first and awaited, never raced. A.loadPdfTools is memoised in
  // app.js, so a second book opening costs nothing.
  let bookBuilderLoad = null;
  function loadBookBuilder() {
    if (window.StudioBook && window.WPS_PDF) return Promise.resolve(window.StudioBook);
    if (!bookBuilderLoad) {
      // An older app.js still holds the page engine itself, and hands no
      // loader across; there is nothing to fetch in that case.
      bookBuilderLoad = (A.loadPdfTools ? A.loadPdfTools() : Promise.resolve()).then(() => new Promise((resolve, reject) => {
        const s = document.createElement("script");
        // Same version as the rest of the site, so a release never pairs a new
        // app.js with a cached old builder.
        const v = (document.querySelector('script[src*="app.js?v="]')?.getAttribute("src") || "").split("v=")[1] || "";
        s.src = `/book-builder.js${v ? `?v=${v}` : ""}`;
        s.onload = () => (window.StudioBook ? resolve(window.StudioBook) : reject(new Error("book-builder.js loaded without StudioBook")));
        s.onerror = () => { bookBuilderLoad = null; reject(new Error("book-builder.js failed to load")); };
        document.head.appendChild(s);
      })).catch((err) => { bookBuilderLoad = null; throw err; });
    }
    return bookBuilderLoad;
  }


  /* ---- portfolio-book view ---- */
  // The studio portfolio book: a shell here, the builder itself in
  // book-builder.js, loaded on first visit (see wireView).
  // A workspace rather than a page: no hero, just enough room to clear the
  // fixed header, so the editor fits the screen. The builder draws its own
  // title on the list of books.
  function viewPortfolioBook() {
    return `
      <section class="container" style="padding-top: 132px; padding-bottom: 48px;">
        <div id="studioBookRoot" class="sb-root"><p class="page-sub">Loading the builder…</p></div>
      </section>`;
  }
  /* ---- the studio's testimonials panel -----------------------------------

     Mounted onto the public /testimonials page rather than given a screen of
     its own, so the studio edits a card while looking at the page a client
     will see — and so there is one address to remember for "testimonials"
     instead of two.

     The shape of the work it supports: someone writes one through the form
     further down that page, it arrives as an email, the studio reads it and
     types it in here, and presses Save & push live. Nothing is automatic and
     nothing can be: there is no server. The panel says so in one line at the
     top, because a studio that expects submissions to appear by themselves
     would sit waiting for a page that never changes.

     A testimonial is kept on this device the moment it is saved, and is not
     live until it is published — the badge and the button are both in here,
     beside the editing, which is the lesson v473 was written for. */
  const TM_UNPUBLISHED_KEY = "wps_testimonials_unpublished";
  const tmUnpublished = () => { try { return localStorage.getItem(TM_UNPUBLISHED_KEY) === "1"; } catch (e) { return false; } };
  // Every copy of the badge, not the first one: the panel carries one at the
  // top and one at the foot of the list, so the studio can see the state
  // without scrolling back up past a screen of testimonials.
  function tmPaintStatus() {
    const dirty = tmUnpublished();
    document.querySelectorAll(".tm-save-status").forEach((el) => {
      el.style.color = dirty ? "#d97706" : "#2f6b4f";
      el.style.background = dirty ? "rgba(217,119,6,0.15)" : "rgba(47,107,79,0.12)";
      el.style.borderColor = dirty ? "#d97706" : "#2f6b4f";
      el.textContent = dirty ? '⚠️ NOT LIVE YET — press "Save & push live"' : "✓ Everything here is live";
    });
  }
  function tmMarkUnpublished() {
    try { localStorage.setItem(TM_UNPUBLISHED_KEY, "1"); } catch (e) {}
    tmPaintStatus();
  }

  // The one being edited, or null for the list. Kept out here so a repaint
  // (which rebuilds the panel's markup) does not lose the studio's place.
  let tmEditing = null;

  /* The open editor, kept on disk as it is typed.

     v481 stopped "Save & push live" discarding an unsaved editor, but that
     closed only the half a button caused. An open editor otherwise lives ONLY
     in the DOM: the panel calls A.render() after a save and after a publish, a
     background refresh of the published data calls it too, and any of those
     rebuilds the page and takes the typing with it. So does closing the tab.
     Nobody types a testimonial twice. */
  /* Shorten for the list without halving an emoji. `.slice(150)` counts
     UTF-16 units, so it can cut a surrogate pair in two and leave a
     replacement character in the studio's own list — the same fault v482
     fixed on the writing side. A third copy of the primitive, by the same
     reasoning as validate-data.mjs's: three small copies pinned by a test
     beat a build step. Must agree with graphemesOf in app.js. */
  const tmTrim = (str, max) => {
    const text = String(str ?? "");
    let g;
    try {
      g = (typeof Intl !== "undefined" && Intl.Segmenter)
        ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((x) => x.segment)
        : [...text];
    } catch (e) { g = [...text]; }
    return g.length <= max ? text : g.slice(0, max).join("") + "…";
  };

  /* The emoji a testimonial actually uses.

     Deliberately not a full set. v482 made a testimonial able to carry any
     emoji, and the studio then asked the fair question: where is the button?
     Every operating system has a picker — ⌃⌘Space on a Mac, the key on a
     phone keyboard — but the studio should not have to know a shortcut to
     use a feature the site advertises.

     Twenty-eight, chosen for what people say about a photograph. A grid of
     two thousand pictures is a worse tool than a small one that fits, and
     the panel points at the system picker for anything not here. */
  const TM_EMOJI = [
    "🙏", "❤️", "🔥", "✨", "⭐", "🌟", "👏", "🙌",
    "😍", "🤩", "😊", "😁", "💯", "👌", "👍", "🎉",
    "📸", "📷", "🎬", "💫", "🥰", "😇", "💕", "🫶",
    "💪", "🕺", "💃", "🤝"
  ];

  /* The system emoji picker, named for the machine this actually is.

     The panel used to say "Control + Command + Space on a Mac" full stop,
     which is no help at all to the studio on a Windows laptop — and they
     asked. The shortcut is genuinely different per platform, so the sentence
     has to be as well.

     Detection can be wrong (a spoofed user agent, something unusual), so the
     fallback is not a guess: it names both, which is right whichever it is.
     userAgentData is preferred where it exists because navigator.platform is
     deprecated and lies on some browsers. */
  function tmEmojiShortcut() {
    let p = "";
    try { p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || ""; } catch (e) { p = ""; }
    const mac = /mac|iphone|ipad|ipod/i.test(p);
    const win = /win/i.test(p);
    const phone = "or the emoji key on a phone's keyboard — they work in the box above like any other letter.";
    if (win && !mac) return `press <strong>Windows key + .</strong> (the full stop), ${phone}`;
    if (mac && !win) return `press <strong>Control + Command + Space</strong>, ${phone}`;
    return `press <strong>Windows key + .</strong> on Windows or <strong>Control + Command + Space</strong> on a Mac, ${phone}`;
  }

  const TM_DRAFT_KEY = "wps_testimonial_draft";
  const tmReadDraft = () => {
    try {
      const d = JSON.parse(localStorage.getItem(TM_DRAFT_KEY) || "null");
      return d && typeof d === "object" && typeof d.id === "string" ? d : null;
    } catch (e) { return null; }
  };
  const tmWriteDraft = (d) => { try { localStorage.setItem(TM_DRAFT_KEY, JSON.stringify(d)); } catch (e) {} };
  const tmClearDraft = () => { try { localStorage.removeItem(TM_DRAFT_KEY); } catch (e) {} };

  /* ---- the studio's own documentation, kept OFF the website --------------

     A client sends a screenshot of what they said on WhatsApp, or an email,
     or a scan of a letter. The studio wants it filed with the testimonial so
     they can find it months later. It must never be published, and "private"
     is not something this site can offer: the repository is public, so a file
     committed to it is downloadable by anyone who guesses the address — which
     is exactly why CI fails a publish carrying a data: URL in a testimonial.

     So it lives in this browser and nowhere else: IndexedDB, in a database of
     its own rather than the albums' one, so nothing here can ever be swept
     into a publish. The trade is stated in the panel — clearing site data or
     moving to another device loses it, and the studio's inbox stays the
     durable copy. A screenshot also usually carries a phone number and a
     profile photo, which is a second reason it does not belong on a page. */
  const TM_PROOF_DB = "wps-testimonial-proofs", TM_PROOF_STORE = "proofs";
  function tmProofDb() {
    return new Promise((res, rej) => {
      let r;
      try { r = indexedDB.open(TM_PROOF_DB, 1); } catch (e) { rej(e); return; }
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains(TM_PROOF_STORE)) {
          d.createObjectStore(TM_PROOF_STORE, { keyPath: "id" }).createIndex("tmId", "tmId", { unique: false });
        }
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function tmPutProof(rec) {
    const d = await tmProofDb();
    return new Promise((res, rej) => {
      const tx = d.transaction(TM_PROOF_STORE, "readwrite");
      tx.objectStore(TM_PROOF_STORE).put(rec);
      tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error);
    });
  }
  async function tmProofsFor(tmId) {
    try {
      const d = await tmProofDb();
      return await new Promise((res, rej) => {
        const q = d.transaction(TM_PROOF_STORE, "readonly").objectStore(TM_PROOF_STORE).index("tmId").getAll(tmId);
        q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error);
      });
    } catch (e) { return []; }
  }
  async function tmDelProof(id) {
    const d = await tmProofDb();
    return new Promise((res, rej) => {
      const tx = d.transaction(TM_PROOF_STORE, "readwrite");
      tx.objectStore(TM_PROOF_STORE).delete(id);
      tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error);
    });
  }
  async function tmDelProofsFor(tmId) {
    for (const p of await tmProofsFor(tmId)) { try { await tmDelProof(p.id); } catch (e) {} }
  }
  // Counts for the list, fetched once per paint rather than per row.
  async function tmProofCounts() {
    try {
      const d = await tmProofDb();
      const all = await new Promise((res, rej) => {
        const q = d.transaction(TM_PROOF_STORE, "readonly").objectStore(TM_PROOF_STORE).getAll();
        q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error);
      });
      const by = {};
      all.forEach((p) => { by[p.tmId] = (by[p.tmId] || 0) + 1; });
      return by;
    } catch (e) { return {}; }
  }

  function tmStore() { return (typeof getTestimonials === "function" ? getTestimonials() : { items: [], deleted: [] }); }

  function mountTestimonials(root) {
    if (!root) return;
    const esc = A.esc;

    // A draft outlives the page, so the panel opens on whatever was being
    // written when it last went away — rather than on a list that silently
    // omits it.
    let tmRestored = false;
    if (!tmEditing) {
      const draft = tmReadDraft();
      if (draft && (String(draft.quote || "").trim() || String(draft.by || "").trim())) {
        tmEditing = draft;
        tmRestored = true;
      }
    }
    let proofCounts = {};   // tmId -> how many files are filed on this device

    const paint = () => {
      const store = tmStore();
      root.innerHTML = `
        <section class="section container">
          <div class="tm-panel">
            <div class="tm-panel-head">
              <div>
                <p class="eyebrow">Studio only · nobody else sees this</p>
                <h2 class="tm-panel-title">Testimonials</h2>
              </div>
              <div class="tm-panel-actions">
                <span class="tm-save-status"></span>
                <button type="button" class="admin-cal-btn primary tm-publish">Save &amp; push live</button>
              </div>
            </div>
            <p class="tm-panel-note">A testimonial can reach you any way at all — the form at the bottom of this page, a WhatsApp message, an email, or something a client said on the shoot day. However it came, <strong>you type it in here</strong> and press <strong>Save &amp; push live</strong>. Nothing appears on this page by itself, which is what stops anyone else writing straight onto your site.${store.items.length ? "" : ` <strong>With none published, the Testimonials link stays out of your menu and out of Google.</strong> The page still works at its address, so you can send it to a client to write the first one.`}</p>

            ${tmEditing ? tmEditorHtml(tmEditing, tmRestored) : `
              <div class="tm-panel-bar">
                <button type="button" class="admin-cal-btn primary" id="tmAddBtn">+ Add a testimonial</button>
                <span class="tm-panel-count">${store.items.length} added here${store.items.length ? ` · ${store.items.filter((t) => t.onHome !== false).length} shown on the home page` : ""}</span>
              </div>
              ${store.items.length ? `
              <div class="tm-rows">
                ${store.items.map((t) => `
                  <div class="tm-row" data-id="${esc(t.id)}">
                    <div class="tm-row-main">
                      <p class="tm-row-quote">${esc(tmTrim(t.quote, 150))}</p>
                      <p class="tm-row-by">${esc(t.by)}${t.role ? ` · ${esc(t.role)}` : ""}${t.rating ? ` · ${t.rating}/5` : ""}${t.dateLabel ? ` · ${esc(t.dateLabel)}` : ""}</p>
                    </div>
                    <div class="tm-row-flags">
                      ${proofCounts[t.id] ? `<span class="tm-flag is-file" title="Files filed on this device — never on the website">📎 ${proofCounts[t.id]} file${proofCounts[t.id] === 1 ? "" : "s"}</span>` : ""}
                      ${t.verified ? `<span class="tm-flag is-on" title="You have documentation for this one">✓ documented</span>` : ""}
                      <span class="tm-flag${t.onHome !== false ? " is-on" : ""}">${t.onHome !== false ? "on the home page" : "this page only"}</span>
                    </div>
                    <div class="tm-row-btns">
                      <button type="button" class="admin-cal-btn tm-edit" data-id="${esc(t.id)}">Edit</button>
                      <button type="button" class="admin-cal-btn tm-del" data-id="${esc(t.id)}">Delete</button>
                    </div>
                  </div>`).join("")}
              </div>
              <div class="tm-panel-foot">
                <span class="tm-save-status"></span>
                <button type="button" class="admin-cal-btn primary tm-publish">Save &amp; push live</button>
              </div>` : `<p class="tm-panel-empty">Nothing added yet. When the first one lands in your inbox, press <strong>+ Add a testimonial</strong> and paste it in.</p>`}
            `}
          </div>
        </section>`;
      tmPaintStatus();
      wire();
      // The file counts come from IndexedDB, which cannot be read while the
      // markup is being built. Fetch once and repaint only if the answer
      // changed, so the first paint is never blocked on a database.
      tmProofCounts().then((counts) => {
        if (JSON.stringify(counts) === JSON.stringify(proofCounts)) return;
        proofCounts = counts;
        if (root.isConnected) paint();
      }).catch(() => {});
    };

    function tmEditorHtml(t, restored) {
      const albums = A.shoots()
        .filter((s) => s && !s.isTestimonial && s.type !== "Workshop Attended")
        .slice()
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      return `
        <div class="tm-editor">
          <h3>${t.updatedAt ? "Edit this testimonial" : "Add a testimonial"}</h3>
          <label class="field"><span>What they said *</span>
            <textarea id="tmE_quote" rows="6" maxlength="${TESTIMONIAL_STORE_LIMITS.quote}" placeholder="Paste or type their words — as they wrote them, or as they said them to you.">${esc(t.quote || "")}</textarea>
          </label>
          <div class="tm-emoji">
            <button type="button" class="admin-cal-btn" id="tmE_emojiBtn" aria-expanded="false" aria-controls="tmE_emojiPanel">🙂 Add an emoji</button>
            <div class="tm-emoji-panel" id="tmE_emojiPanel" hidden>
              <div class="tm-emoji-grid">
                ${TM_EMOJI.map((e) => `<button type="button" class="tm-emoji-pick" data-e="${esc(e)}" title="${esc(e)}">${esc(e)}</button>`).join("")}
              </div>
              <p class="field-hint" style="margin: 8px 0 0;">Anything else: ${tmEmojiShortcut()}</p>
            </div>
          </div>
          <p class="field-hint">Their words, not a summary of them. If they said this to you rather than filling in the form, check they are happy to see it here under their name — the form asks for that in writing, and this does not.</p>
          <div class="field-row">
            <label class="field"><span>Name to show *</span><input id="tmE_by" type="text" maxlength="${TESTIMONIAL_STORE_LIMITS.name}" value="${esc(t.by || "")}" placeholder="Aisha Khan" /></label>
            <label class="field"><span>Credit them as</span><input id="tmE_role" type="text" maxlength="${TESTIMONIAL_STORE_LIMITS.role}" value="${esc(t.role || "")}" placeholder="Model, Noida" /></label>
          </div>
          <div class="field-row">
            <label class="field"><span>They are</span>
              <select id="tmE_kind">
                <option value="">Not saying</option>
                ${A.TESTIMONIAL_KINDS.map((k) => `<option value="${esc(k.key)}"${t.kind === k.key ? " selected" : ""}>${esc(k.label)}</option>`).join("")}
              </select>
            </label>
            <label class="field"><span>Stars they gave</span>
              <select id="tmE_rating">
                <option value="0">No rating</option>
                ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}"${Number(t.rating) === n ? " selected" : ""}>${n} out of 5</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="field-row">
            <label class="field"><span>When (shown under their name)</span><input id="tmE_date" type="text" maxlength="40" value="${esc(t.dateLabel || "")}" placeholder="March 2026" /></label>
            <label class="field"><span>Which shoot</span>
              <select id="tmE_shoot">
                <option value="">Not about one shoot</option>
                ${albums.map((s) => `<option value="${esc(s.id)}"${t.shootId === s.id ? " selected" : ""}>${esc(s.title || s.talent || s.id)}</option>`).join("")}
              </select>
            </label>
          </div>
          <p class="field-hint">Pick a shoot and this also appears on that shoot's card, under the photos — which is where the three quote boxes in the upload form used to put it. They have gone; this is the one place now.</p>
          <label class="check-line"><input type="checkbox" id="tmE_verified"${t.verified ? " checked" : ""} /><span>I can show where this came from — a WhatsApp message, an email, a letter, a screenshot. <em>The card shows a small tick. Whatever you have stays in your own inbox and is never put on the website.</em></span></label>
          <label class="check-line"><input type="checkbox" id="tmE_home"${t.onHome !== false ? " checked" : ""} /><span>Show this one on the home page too</span></label>
          <fieldset class="tm-files">
            <legend>Your own file copy <span class="tm-opt">never goes on the website</span></legend>
            <p class="field-hint" style="margin-bottom: 10px;">The screenshot, email or PDF this came in — a WhatsApp message, a letter, an invoice. It is filed here <strong>with this testimonial, on this device only</strong>, so you can find it later. Nobody visiting the site can see it or reach it, and it is never published.</p>
            <label class="attachments-dropzone tm-files-drop" for="tmE_files">
              📎 <strong>Add a picture or a PDF</strong>
              <div style="font-size: var(--font-xs); margin-top: 4px;">As many as you like. Kept in this browser — see the note below.</div>
            </label>
            <input id="tmE_files" type="file" accept="image/*,.pdf,application/pdf" multiple class="sr-only" />
            <div class="attachment-list" id="tmE_fileList"></div>
            <p class="field-hint tm-files-warn">⚠︎ This browser is the only place these live. Clearing your site data, or opening the panel on another phone or laptop, will not show them — and they are not in any backup. <strong>Keep the original email or chat as your real record;</strong> this is a convenience copy filed next to the words.</p>
          </fieldset>
          <p class="field-error" id="tmE_error" hidden></p>
          ${restored ? `<p class="tm-editor-restored">↩︎ Picked up where you left off — this was still unsaved when the page last closed. Press <strong>Save on this device</strong> to keep it, or Cancel to throw it away.</p>` : ""}
          <div class="tm-editor-foot">
            <button type="button" class="admin-cal-btn primary" id="tmSaveBtn">Save on this device</button>
            <button type="button" class="admin-cal-btn" id="tmCancelBtn">Cancel</button>
            <span class="tm-editor-hint">Saving keeps it here. It reaches visitors when you press <strong>Save &amp; push live</strong> at the top.</span>
          </div>
        </div>`;
    }

    function wire() {
      /* Every keystroke in the editor goes to the draft. Reading the fields
         rather than tracking them one by one means a field added later is
         carried without anyone remembering to add it here. */
      const tmSnapshot = () => {
        const el = (n) => root.querySelector(`#tmE_${n}`);
        if (!el("quote")) return null;
        return {
          ...(tmEditing || {}),
          quote: el("quote").value, by: el("by")?.value || "", role: el("role")?.value || "",
          kind: el("kind")?.value || "", rating: Number(el("rating")?.value) || 0,
          dateLabel: el("date")?.value || "", shootId: el("shoot")?.value || "",
          verified: !!el("verified")?.checked, onHome: !!el("home")?.checked
        };
      };
      ["quote", "by", "role", "kind", "rating", "date", "shoot", "verified", "home"].forEach((n) => {
        const el = root.querySelector(`#tmE_${n}`);
        if (!el) return;
        ["input", "change"].forEach((ev) => el.addEventListener(ev, () => {
          const snap = tmSnapshot();
          if (snap) tmWriteDraft(snap);
        }));
      });

      /* The emoji button. Inserts at the cursor rather than appending, so it
         can be used mid-sentence, and fires a real `input` event afterwards
         so the character counter and the draft both see it — an emoji put in
         by setting .value alone would be saved by neither. */
      const emojiBtn = root.querySelector("#tmE_emojiBtn");
      const emojiPanel = root.querySelector("#tmE_emojiPanel");
      emojiBtn?.addEventListener("click", () => {
        const open = emojiPanel.hidden;
        emojiPanel.hidden = !open;
        emojiBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      root.querySelectorAll(".tm-emoji-pick").forEach((b) => b.addEventListener("click", () => {
        const box = root.querySelector("#tmE_quote");
        if (!box) return;
        const e = b.dataset.e || "";
        const at = typeof box.selectionStart === "number" ? box.selectionStart : box.value.length;
        const to = typeof box.selectionEnd === "number" ? box.selectionEnd : at;
        box.value = box.value.slice(0, at) + e + box.value.slice(to);
        // Put the caret after what was just inserted, counted in UTF-16 units
        // because that is what selectionStart speaks — the grapheme count is
        // for the limit, not for the cursor.
        const after = at + e.length;
        box.focus();
        try { box.setSelectionRange(after, after); } catch (err) {}
        box.dispatchEvent(new Event("input", { bubbles: true }));
      }));
      // Clicking away closes it, the way a small palette should behave.
      root.addEventListener("click", (ev) => {
        if (!emojiPanel || emojiPanel.hidden) return;
        if (ev.target.closest(".tm-emoji")) return;
        emojiPanel.hidden = true;
        emojiBtn?.setAttribute("aria-expanded", "false");
      });

      /* The studio's own file copies. Kept in IndexedDB against this
         testimonial's id, listed back with a way to open and to remove, and
         never touched by saveTestimonials or by a publish. */
      const fileList = root.querySelector("#tmE_fileList");
      const paintFiles = async () => {
        if (!fileList || !tmEditing) return;
        const files = await tmProofsFor(tmEditing.id);
        const size = (n) => (n < 102400 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
        fileList.innerHTML = files.length ? files.map((f) => `
          <div class="attachment-pill">
            <button type="button" class="tm-file-open" data-id="${esc(f.id)}" title="Open it">${esc(f.name)} · ${esc(size(f.size || 0))}</button>
            <button type="button" class="remove-att tm-file-del" data-id="${esc(f.id)}" aria-label="Remove this file">×</button>
          </div>`).join("") : "";
        fileList.querySelectorAll(".tm-file-open").forEach((b) => b.addEventListener("click", async () => {
          const one = (await tmProofsFor(tmEditing.id)).find((x) => x.id === b.dataset.id);
          if (!one || !one.blob) return;
          // A blob: URL exists only in this tab and is revoked straight after,
          // so nothing lingers and nothing is addressable from outside.
          const url = URL.createObjectURL(one.blob);
          window.open(url, "_blank");
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }));
        fileList.querySelectorAll(".tm-file-del").forEach((b) => b.addEventListener("click", async () => {
          if (!confirm("Remove this file from your records on this device?")) return;
          await tmDelProof(b.dataset.id);
          await paintFiles();
          A.toast("Removed from this device.");
        }));
      };
      paintFiles();

      root.querySelector("#tmE_files")?.addEventListener("change", async (e) => {
        const picked = [...(e.target.files || [])];
        if (!picked.length || !tmEditing) return;
        let added = 0, skipped = 0;
        for (const f of picked) {
          const ok = /^image\//.test(f.type) || /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
          // Generous, because this never travels: it is not going through a
          // relay or into a repository, only into this browser's own store.
          if (!ok || f.size > 25 * 1048576) { skipped++; continue; }
          try {
            await tmPutProof({
              id: `${tmEditing.id}:${A.uid()}`, tmId: tmEditing.id,
              name: f.name, type: f.type || "application/octet-stream", size: f.size,
              addedAt: Date.now(), blob: f
            });
            added++;
          } catch (err) { console.warn("could not file that one:", err); skipped++; }
        }
        e.target.value = "";
        await paintFiles();
        if (added) A.toast(`${added} file${added === 1 ? "" : "s"} filed on this device. ${skipped ? `${skipped} skipped. ` : ""}Not on the website.`);
        else if (skipped) A.toast("Nothing was filed — pictures and PDFs only, up to 25 MB each.");
      });

      root.querySelector("#tmAddBtn")?.addEventListener("click", () => {
        tmEditing = { id: A.uid(), quote: "", by: "", role: "", kind: "", rating: 0, dateLabel: "", shoot: "", shootId: "", verified: false, onHome: true, updatedAt: 0 };
        paint();
        root.querySelector("#tmE_quote")?.focus();
      });
      root.querySelectorAll(".tm-edit").forEach((b) => b.addEventListener("click", () => {
        tmEditing = tmStore().items.find((x) => x.id === b.dataset.id) || null;
        paint();
      }));
      root.querySelectorAll(".tm-del").forEach((b) => b.addEventListener("click", () => {
        const store = tmStore();
        const one = store.items.find((x) => x.id === b.dataset.id);
        if (!one) return;
        if (!confirm(`Delete the testimonial from ${one.by}?\n\nIt goes from this page and from the home page. Their email stays in your inbox, so you could add it again — but their words are not stored anywhere else.`)) return;
        // Recorded as a tombstone, not just dropped: otherwise the next
        // device to publish, still holding its own copy, would put it back.
        saveTestimonials({ items: store.items.filter((x) => x.id !== one.id), deleted: [...store.deleted, one.id] });
        // The files filed against it go too: leaving them would keep a
        // client's screenshot on the device after the words were withdrawn.
        tmDelProofsFor(one.id).catch(() => {});
        tmMarkUnpublished();
        A.toast(`Deleted. Press "Save & push live" to take it off the site.`);
        tmEditing = null;
        A.render();
      }));
      root.querySelector("#tmCancelBtn")?.addEventListener("click", () => {
        // Cancel is the one place a draft is meant to be thrown away, so it
        // says what it is throwing away first.
        const snap = tmSnapshot();
        if (snap && (String(snap.quote || "").trim() || String(snap.by || "").trim())
            && !confirm("Throw away what you have typed?\n\nIt has not been saved, and it will not come back.")) return;
        tmEditing = null;
        tmClearDraft();
        paint();
      });
      /* Commit whatever is open in the editor.

         One function, because BOTH buttons reach it and the label on them is
         the same promise. "Save & push live" used to call syncToGitHub
         directly and never look at the editor, so a studio that pressed the
         button it could see — filling the form and then reaching for the
         only button labelled Save — published an empty store and watched its
         typing disappear on the next repaint. That is exactly what happened
         to the first real testimonial anyone tried to add.

         Returns "none" when there is nothing open, "invalid" when the editor
         is open but not finishable (and leaves every word where it is), and
         "saved" when it went in. */
      const tmCommitEditor = () => {
        if (!tmEditing || !root.querySelector("#tmE_quote")) return "none";
        const val = (id) => String(root.querySelector(id)?.value || "").trim();
        const err = root.querySelector("#tmE_error");
        const quote = val("#tmE_quote"), by = val("#tmE_by");
        const problem = !quote ? "Paste what they wrote first — a testimonial needs their words."
          : !by ? "Give the name to show under it (or write “Anonymous”)." : "";
        if (err) { err.textContent = problem; err.hidden = !problem; }
        if (problem) { root.querySelector(problem.startsWith("Paste") ? "#tmE_quote" : "#tmE_by")?.focus(); return "invalid"; }
        const shootId = val("#tmE_shoot");
        const album = shootId ? A.shoots().find((s) => s.id === shootId) : null;
        const store = tmStore();
        const next = {
          ...tmEditing,
          quote, by,
          role: val("#tmE_role"),
          kind: val("#tmE_kind"),
          rating: Number(val("#tmE_rating")) || 0,
          dateLabel: val("#tmE_date"),
          shootId,
          shoot: album ? (album.title || album.talent || "") : "",
          verified: !!root.querySelector("#tmE_verified")?.checked,
          onHome: !!root.querySelector("#tmE_home")?.checked,
          updatedAt: Date.now()
        };
        saveTestimonials({ items: [next, ...store.items.filter((x) => x.id !== next.id)], deleted: store.deleted });
        tmMarkUnpublished();
        tmEditing = null;
        tmClearDraft();   // the words are in the store now; the draft has done its job
        return "saved";
      };

      root.querySelector("#tmSaveBtn")?.addEventListener("click", () => {
        if (tmCommitEditor() !== "saved") return;
        A.toast(`Saved on this device. Press "Save & push live" to put it on the site.`);
        // The whole page, not just this panel: the wall above it, the count in
        // the heading and the menu link all answer to this list.
        A.render();
      });
      // Both copies of the button do the same thing, and both show the wait.
      const publishBtns = [...root.querySelectorAll(".tm-publish")];
      publishBtns.forEach((btn) => btn.addEventListener("click", async () => {
        /* Anything half-typed goes in FIRST. Both copies of this button run
           this same line — two controls wearing one label must not take two
           code paths, which is how this bug would come back. */
        const committed = tmCommitEditor();
        if (committed === "invalid") {
          A.toast("Nothing was published — finish the testimonial above first. Your words are still there.");
          return;
        }
        publishBtns.forEach((b) => { b.disabled = true; b.textContent = "Publishing…"; });
        const ok = await syncToGitHub(shootsNow());
        publishBtns.forEach((b) => { b.disabled = false; b.textContent = "Save & push live"; });
        if (ok) {
          try { localStorage.removeItem(TM_UNPUBLISHED_KEY); } catch (e) {}
          A.toast("Published. Visitors see it within a few minutes.");
        }
        tmPaintStatus();
        // Repaint if the editor was folded away into the list by the commit
        // above, so the studio sees the testimonial it just published.
        if (committed === "saved") A.render();
      }));
    }

    paint();
  }

  /* ---- Handing the studio's screens back to app.js -----------------------
     app.js's ROUTES cannot name these builders: it is built while this file
     is not loaded, and a missing name there is a ReferenceError that takes
     the whole boot with it. They register themselves instead, and app.js
     calls the wiring through window.WPS_ADMIN with the same optional-call
     guards it already uses for everything wired by an onclick attribute. */
  A.setRoutes({
    "upload": viewUpload,
    "calendar": viewCalendar,
    "contracts": viewContracts,
    "portfolio-book": viewPortfolioBook
  });

  window.WPS_ADMIN = {
    publish: (list, opts) => syncToGitHub(list || shootsNow(), opts),
    // The studio's merged view of the testimonials — what is live plus what
    // has been typed in here since. app.js prefers this over the published
    // file when it is there, so the studio sees a draft on the real page.
    testimonials: () => (typeof getTestimonials === "function" ? getTestimonials() : { items: [], deleted: [] }),
    mountTestimonials: (root) => mountTestimonials(root),
    wireUpload: (editId) => wireUpload(editId),
    wireCalendar: () => wireCalendar(),
    updateReminders: () => updateAdminReminders(),
    initStudioSettings: () => initStudioSettingsControls(),
    loadBookBuilder: () => loadBookBuilder()
  };

  // The only chance the studio-links editor gets when admin mode is switched
  // on in a tab that booted as a visitor: boot() has long since run. It wires
  // itself once, whichever of the two calls arrives first.
  initStudioSettingsControls();
})();
