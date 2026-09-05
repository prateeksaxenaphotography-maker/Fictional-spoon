/* ============================================================
   § UNIFIED MASTER ADMIN PROMO & INVITE CODES ENGINE
   ============================================================ */
const DEFAULT_PROMO_CODES = {
  "NERDY500":  { flat: 500,  label: "Flat ₹500 Off Instant Savings (NERDY500)" },
  "NERDY1000": { flat: 1000, label: "Flat ₹1,000 Off Instant Savings (NERDY1000)" },
  "NERDY10":   { pct: 10,    label: "10% Off First Commercial Booking (NERDY10)" },
  "NERDY15":   { pct: 15,    label: "15% Off Noida / Delhi NCR Shoots (NERDY15)" },
  "NERDY20":   { pct: 20,    label: "20% Off Studio Production Campaigns (NERDY20)" },
  "NERDYVIP":  { pct: 25,    label: "25% VIP Partner Discount (NERDYVIP)" }
};

window.adminDraftPromoCodes = null;
window.adminDraftInviteCodes = null;
// Which existing code the creator form is editing (null = creating new).
window._editingPromoKey = null;
window._editingInviteCode = null;

// Flips the pricing/codes status badge to its amber "unsaved" state. Every
// draft mutation (packages, promo or invite codes) calls this; the badge
// returns to green when saveAdminCustomPackages commits the drafts. This was
// previously called but never defined anywhere — the ReferenceError aborted
// the delete handlers mid-flight, so the grid never repainted and deletes
// looked like silent no-ops.
function markUnsavedChanges() {
  const statusBadge = document.getElementById("adminPricingSaveStatus");
  if (statusBadge && !statusBadge.textContent.includes("UNSAVED")) {
    statusBadge.style.color = "#d97706";
    statusBadge.style.background = "rgba(217,119,6,0.15)";
    statusBadge.style.borderColor = "#d97706";
    statusBadge.innerHTML = '⚠️ UNSAVED CHANGES — Click "Save All Changes & Push Live"';
  }
}
window.markUnsavedChanges = markUnsavedChanges;

// --- PROMO CODE HANDLERS ---
window.getAdminPromoCodes = function() {
  if (window.adminDraftPromoCodes && typeof window.adminDraftPromoCodes === "object") {
    return window.adminDraftPromoCodes;
  }
  try {
    const saved = localStorage.getItem("wps_custom_promo_codes");
    if (saved) {
      window.adminDraftPromoCodes = JSON.parse(saved);
      return window.adminDraftPromoCodes;
    }
  } catch(e) {}
  // Published promo codes — see the note on INVITE_CODES in getAdminInviteCodes.
  try {
    const pub = window.WPS_DATA && window.WPS_DATA.PROMO_CODES;
    if (pub && typeof pub === "object" && Object.keys(pub).length > 0) {
      window.adminDraftPromoCodes = { ...pub };
      return window.adminDraftPromoCodes;
    }
  } catch(e) {}
  window.adminDraftPromoCodes = { ...DEFAULT_PROMO_CODES };
  return window.adminDraftPromoCodes;
};

// A promo code's discount on the home studio rental, kept separate from its
// package discount so a code can (say) take 20% off the package and only a
// flat ₹500 off the room, or knock the rental to ₹0 outright. Codes saved
// before this existed only ever carried the boolean freeHomeStudio — read
// here as {type:'free'} so an old code keeps behaving exactly as it did.
window.getPromoHomeStudioDiscount = function(entry) {
  if (!entry) return { type: "none" };
  if (entry.homeStudioDiscount && entry.homeStudioDiscount.type && entry.homeStudioDiscount.type !== "none") {
    return entry.homeStudioDiscount;
  }
  if (entry.freeHomeStudio) return { type: "free" };
  return { type: "none" };
};

// Applies that discount to one specific rental fee. The amount is capped at
// the fee itself so a flat ₹ code larger than the rental can never turn into
// a negative charge, and isFree covers both an explicit "free" type and a
// flat/pct value that happens to equal or exceed the fee.
window.applyPromoHomeStudioDiscount = function(entry, fee) {
  const hs = window.getPromoHomeStudioDiscount(entry);
  if (!(fee > 0) || hs.type === "none") return { amount: 0, isFree: false, label: "" };
  if (hs.type === "free") return { amount: fee, isFree: true, label: "FREE" };
  const rawVal = Number(hs.value) || 0;
  if (hs.type === "flat") {
    const amount = Math.max(0, Math.min(fee, Math.round(rawVal)));
    return { amount, isFree: amount >= fee, label: `FLAT ₹${rawVal.toLocaleString("en-IN")} OFF` };
  }
  if (hs.type === "pct") {
    const pct = Math.max(0, Math.min(100, rawVal));
    const amount = Math.round((fee * pct) / 100);
    return { amount, isFree: amount >= fee, label: `${pct}% OFF` };
  }
  return { amount: 0, isFree: false, label: "" };
};

window.addNewAdminPromoCode = function() {
  window.openPromoCodeModal();
};

window.editAdminPromoCode = function(codeKey) {
  window.openPromoCodeModal(codeKey);
};

window.deleteAdminPromoCode = function(codeName) {
  if (confirm(`Remove promo code '${codeName}' from draft?`)) {
    const currentCodes = window.getAdminPromoCodes();
    delete currentCodes[codeName];
    window.adminDraftPromoCodes = { ...currentCodes };
    markUnsavedChanges();
    if (typeof toast === "function") toast(`🗑️ Promo code '${codeName}' removed from draft.`);
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
  if (hsValEl) hsValEl.value = (hsDiscount.type === "flat" || hsDiscount.type === "pct") ? (hsDiscount.value || "") : "";
  if (typeof window.togglePromoHomeStudioValField === "function") window.togglePromoHomeStudioValField();

  form.style.display = "block";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  if (nameEl) nameEl.focus();
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

  const codes = window.getAdminPromoCodes();
  const editing = window._editingPromoKey;
  if (!editing && codes[name] && !confirm(`Promo code '${name}' already exists. Overwrite it?`)) return;
  if (editing && editing !== name) delete codes[editing]; // renamed while editing

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
  } else if (hsType === "flat" || hsType === "pct") {
    const hsVal = Math.round(Number(document.getElementById("newPromoHomeStudioVal")?.value));
    if (!Number.isFinite(hsVal) || hsVal <= 0 || (hsType === "pct" && hsVal > 100)) {
      alert(hsType === "pct" ? "Home studio % off must be between 1 and 100." : "Home studio flat discount must be a positive amount in ₹.");
      return;
    }
    homeStudioDiscount = { type: hsType, value: hsVal };
  }
  codes[name] = type === "flat"
    ? { flat: val, label, includeAddons, homeStudioDiscount }
    : { pct: val, label, includeAddons, homeStudioDiscount };
  window.adminDraftPromoCodes = { ...codes };
  window._editingPromoKey = null;

  markUnsavedChanges();
  if (typeof toast === "function") toast(`🎟️ Promo code '${name}' ${editing ? "updated" : "added"} to draft. Click Save to push live.`);
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
};

// Shows the value input only for the two discount types that need a number —
// "free" and "none" have nothing to type in.
window.togglePromoHomeStudioValField = function() {
  const typeEl = document.getElementById("newPromoHomeStudioType");
  const valEl = document.getElementById("newPromoHomeStudioVal");
  if (!typeEl || !valEl) return;
  const needsVal = typeEl.value === "flat" || typeEl.value === "pct";
  valEl.style.display = needsVal ? "" : "none";
  valEl.placeholder = typeEl.value === "pct" ? "e.g. 10" : "e.g. 500";
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

// --- INVITE CODE HANDLERS ---
window.getAdminInviteCodes = function() {
  const normalize = (arr) => {
    const seen = new Set();
    const result = [];
    (arr || []).forEach(item => {
      let codeStr = typeof item === 'object' ? item.code : item;
      let descStr = typeof item === 'object' ? (item.desc || '') : 'Default Photographer Unlock Code';
      let locationStr = typeof item === 'object' ? (item.location || '') : '';
      // What the talent pays for the venue this code supplies. Only meaningful
      // alongside a locked location: the studio has chosen where the shoot
      // happens, so it also says what that costs. Blank means complimentary —
      // the common case — and a number bills exactly that, which covers a
      // rented space with a real cost as well as the home studio.
      // Codes with no locked venue leave the choice to the talent, so the
      // standard home studio rate governs there instead of this field.
      let venueCostVal = null;
      if (typeof item === 'object' && item.venueCost !== undefined && item.venueCost !== null && item.venueCost !== "") {
        const n = parseInt(item.venueCost, 10);
        if (!isNaN(n) && n >= 0) venueCostVal = n;
      }
      // Same shape as a promo code's home studio discount (none/flat/pct/free)
      // — carried through here so it survives a reload instead of being
      // silently dropped like any other field this normalizer does not know.
      const hsDiscount = (typeof item === 'object' && item.homeStudioDiscount && item.homeStudioDiscount.type && item.homeStudioDiscount.type !== "none")
        ? item.homeStudioDiscount
        : null;
      if (codeStr && typeof codeStr === 'string' && !seen.has(codeStr.trim().toUpperCase())) {
        const cleanStr = codeStr.trim().toUpperCase();
        seen.add(cleanStr);
        result.push({ code: cleanStr, desc: descStr, location: locationStr, venueCost: venueCostVal, ...(hsDiscount ? { homeStudioDiscount: hsDiscount } : {}) });
      }
    });
    return result;
  };

  if (window.adminDraftInviteCodes && Array.isArray(window.adminDraftInviteCodes)) {
    window.adminDraftInviteCodes = normalize(window.adminDraftInviteCodes);
    return window.adminDraftInviteCodes;
  }

  try {
    const saved = localStorage.getItem("wps_custom_invite_codes");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        window.adminDraftInviteCodes = normalize(parsed);
        return window.adminDraftInviteCodes;
      }
    }
  } catch(e) {}

  // Published codes: what a visitor's browser sees. Checked after this
  // device's own list so the studio's unsaved edits still win locally, and
  // before the built-ins so a code retired in the panel does not come back.
  try {
    const pub = window.WPS_DATA && window.WPS_DATA.INVITE_CODES;
    if (Array.isArray(pub) && pub.length > 0) {
      window.adminDraftInviteCodes = normalize(pub);
      return window.adminDraftInviteCodes;
    }
  } catch(e) {}

  const defaultList = [
    { code: "NERDYBRAND", desc: "Default photographer unlock code for Instagram DMs" },
    // Built into the defaults on purpose: invite codes added through the Admin
    // Panel live in this device's localStorage and are never published, so a
    // code that only exists there is invalid for every client who types it.
    // No venueCost: this code has always granted the home studio free, and a
    // blank venue cost is exactly that.
    { code: "NERDYHOME", desc: "Home Studio TFP Collaboration Unlock (Location Locked)", location: "Home Studio - Sector 46, Noida (Provided by Studio)" },
    { code: "NERDYTEST", desc: "Test shoot unlock pass for agency models" },
    { code: "INVITE2026", desc: "General 2026 TFP collaboration pass" },
    { code: "NERDYVIP", desc: "VIP partner unlock code" }
  ];

  window.adminDraftInviteCodes = normalize(defaultList);
  return window.adminDraftInviteCodes;
};

window.getAdminInviteCode = function() {
  const list = window.getAdminInviteCodes();
  return (list[0] && list[0].code) || "NERDYBRAND";
};

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
    if (!persisted) markUnsavedChanges();
    if (typeof toast === "function") {
      toast(persisted
        ? `🗑️ Invite code '${targetUpper}' deleted.`
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

  const list = window.getAdminInviteCodes();
  const editing = window._editingInviteCode;
  if (list.some(x => x.code === code && x.code !== editing)) {
    alert(`Invite code '${code}' already exists.`);
    return;
  }

  if (editing) {
    const idx = list.findIndex(x => x.code === editing);
    if (idx !== -1) list[idx] = { code, desc, location, venueCost, homeStudioDiscount };
    else list.push({ code, desc, location, venueCost, homeStudioDiscount });
  } else {
    list.push({ code, desc, location, venueCost, homeStudioDiscount });
  }
  window.adminDraftInviteCodes = [...list];
  window._editingInviteCode = null;

  const persisted = window.persistAdminInviteCodes();
  if (!persisted) markUnsavedChanges();
  if (typeof toast === "function") {
    toast(persisted
      ? `🔑 Invite code '${code}' ${editing ? "updated" : "saved"}.`
      : `⚠️ '${code}' ${editing ? "updated" : "added"} but could not be stored on this device — click "Save & Push Live".`);
  }
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
};


/* ============================================================
   § ADMIN NO-CODE DYNAMIC PACKAGE & PRICING MANAGEMENT ENGINE
   ============================================================ */
const DEFAULT_PACKAGES = [
  { id: "pkg1", name: "Basic Test / Comp Card", price: 7000, specs: "20 Proof Clicks + 0 Retouched" },
  { id: "pkg2", name: "Mini Portfolio", price: 10000, specs: "25 Proof Clicks + 3-5 Retouched Clicks" },
  { id: "pkg3", name: "Standard Editorial Portfolio", price: 25000, specs: "50 Unedited + 8-12 Retouched Clicks" },
  { id: "pkg4", name: "Premium Brand Campaign", price: 50000, specs: "100 Unedited + 15-25 Retouched Clicks" },
  { id: "pkg5", name: "High-End Full Day Production", price: 75000, specs: "Full Gallery + 30+ Retouched Master Assets" }
];

// Fixed rental added to a PAID booking when the client picks the home studio.
// Editable in the pricing panel and published with the rest of the rates, so
// the number a client is quoted is the number the studio set — the whole point
// of publishing PACKAGES rather than keeping rates on one device.
const DEFAULT_HOME_STUDIO_RATE = 3000;

// forTestShoot picks the collaboration rate. A test shoot brings no shoot fee
// with it, so the studio may want to hand the space over cheaper than a paid
// client pays for the same room. Left blank it simply follows the paid rate,
// which is what every booking did before the two rates were split.
function getHomeStudioRate(forTestShoot) {
  const readRate = (localKey, publishedKey) => {
    try {
      const saved = localStorage.getItem(localKey);
      if (saved !== null && saved !== "") {
        const n = parseInt(saved, 10);
        // 0 is a real value — it switches the charge off — so only a genuinely
        // unparseable or negative entry falls through to the published rate.
        if (!isNaN(n) && n >= 0) return n;
      }
    } catch(e) {}
    try {
      const pub = window.WPS_DATA && window.WPS_DATA[publishedKey];
      if (typeof pub === "number" && !isNaN(pub) && pub >= 0) return pub;
    } catch(e) {}
    return null;
  };

  if (forTestShoot) {
    const tfpRate = readRate("wps_home_studio_rate_tfp", "HOME_STUDIO_RATE_TFP");
    if (tfpRate !== null) return tfpRate;
    // No separate collaboration rate set — fall through to the paid one.
  }
  const paidRate = readRate("wps_home_studio_rate", "HOME_STUDIO_RATE");
  return paidRate !== null ? paidRate : DEFAULT_HOME_STUDIO_RATE;
}
window.getHomeStudioRate = getHomeStudioRate;

function getAdminPackages() {
  try {
    const saved = localStorage.getItem("wps_custom_packages");
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  // Published rates — without this a price edit in the panel changed what the
  // studio saw and nothing a client was ever quoted.
  try {
    const pub = window.WPS_DATA && window.WPS_DATA.PACKAGES;
    if (Array.isArray(pub) && pub.length > 0) return pub;
  } catch(e) {}
  return DEFAULT_PACKAGES;
}

window.getAdminPackages = getAdminPackages;

// The test-shoot "package": no fee (the TFP home-studio rental is its own
// setting), but a name and a deliverables line the studio can edit in the
// same panel as the paid tiers. Same resolution order as the tiers —
// this device's draft, then what is published, then the default.
const DEFAULT_TFP_PACKAGE = { name: "Test Shoot / TFP Collaboration", specs: "Full Proofing Gallery + 8 to 12 Retouched Master Clicks (No RAW files delivered)" };
function getAdminTfpPackage() {
  const clean = (o) => (o && typeof o === "object") ? { name: String(o.name || "").trim() || DEFAULT_TFP_PACKAGE.name, specs: String(o.specs || "").trim() || DEFAULT_TFP_PACKAGE.specs } : null;
  try { const saved = localStorage.getItem("wps_tfp_package"); if (saved) { const c = clean(JSON.parse(saved)); if (c) return c; } } catch(e) {}
  try { const c = clean(window.WPS_DATA && window.WPS_DATA.TFP_PACKAGE); if (c) return c; } catch(e) {}
  return { ...DEFAULT_TFP_PACKAGE };
}
window.getAdminTfpPackage = getAdminTfpPackage;

/* ============================================================
   § STUDIO CONTRACT ARCHIVE & VERSION RESOLUTION
   Kept at top level, beside the other published-data helpers, because the
   Contracts page and the PDF generator can both be reached without ever
   opening the Calendar view. Defined inside a view function, the archive
   simply did not exist on those paths.
   ============================================================ */
window.ACTIVE_CONTRACTS = { commercial: "V3.7-COMMERCIAL", tfp: "V3.6-TFP" };

/* ============================================================
   § CALL TIME, GRACE PERIOD & NO-SHOW
   One wording, built in both plain text and HTML, because this clause has to
   appear identically in five places: the terms modal, the emailed contract
   record, the on-page policy notice, the studio policy list and the archived
   PDF. Written out five times by hand they drift, and a contract that
   contradicts the page it was agreed on is worse than no clause at all.
   ============================================================ */
// How long the set is held past the confirmed call time before the Studio may
// cancel. A paid booking gets three hours against a collaboration's one: the
// client has already paid a non-refundable retainer, so they carry a real loss
// of their own if the day collapses, and a commercial crew is far more likely
// to have a legitimate reason for a long delay.
window.GRACE_MINUTES = { tfp: 60, paid: 180 };
// The Studio holds itself to one hour either way. Making a paying client wait
// three hours for the photographer because that is their own grace period
// would be reciprocity in name only.
window.STUDIO_GRACE_MINUTES = 60;

window.graceMinutesFor = (isTfp) => (isTfp ? window.GRACE_MINUTES.tfp : window.GRACE_MINUTES.paid);
window.graceLabelFor = (isTfp) => {
  const m = window.graceMinutesFor(isTfp);
  return m >= 120 ? `${m} minutes (${m / 60} hours)` : `${m} minutes`;
};

// Plain text, for the emailed contract record and the archived PDF.
window.buildLateArrivalText = function (isTfp, sectionNumber) {
  const label = window.graceLabelFor(isTfp);
  const mins = window.graceMinutesFor(isTfp);
  const consequence = isTfp
    ? "A session cancelled on this basis is not rescheduled as of right; any home studio rental or other amount already paid is forfeited and non-refundable; and the photographer invite code under which the session was booked may be withdrawn."
    : "A session cancelled on this basis is not rescheduled as of right, and the advance retainer is forfeited under the non-refundable milestone terms set out above. The shoot day is released and any further session must be booked afresh.";
  const reschedule = isTfp
    ? "A delay or cancellation notified at least 24 hours before the call time is treated as a reschedule rather than a no-show, and nothing is forfeited — up to a maximum of two reschedules, beyond which the invite lapses."
    : "A delay or cancellation notified at least 24 hours before the call time is treated as a reschedule rather than a no-show, and the advance retainer carries over to the rescheduled date — up to a maximum of two reschedules.";
  return `${sectionNumber}. CALL TIME, GRACE PERIOD, LATE ARRIVAL & NO-SHOW
The call time confirmed by the Studio is the time the Participant is expected on set and ready to begin, not the time they set out. The Studio holds the set for ${label} past that call time. Arriving within that window does not extend the session: the booked wrap time stands, and time lost to a late arrival comes out of the shoot.
If the Participant has not arrived within those ${mins} minutes and has not agreed a later start with the Studio, the Studio may cancel the session at its sole discretion. ${consequence}
${reschedule}
A delay notified on the shoot day may be accommodated where the set is still free and the session can still finish within booked daylight hours, and by 7:00 PM at the home studio. Notifying a delay is a courtesy and not an entitlement: it does not by itself extend the grace period or move the wrap time, and acceptance remains at the Studio's discretion.
If the Studio is not ready to begin within ${window.STUDIO_GRACE_MINUTES} minutes of the confirmed call time, the Participant may reschedule at no cost, or proceed with the wrap time extended by the length of the delay where the venue allows.`;
};

// The same clause as modal HTML.
window.buildLateArrivalHtml = function (isTfp, sectionNumber) {
  const label = window.graceLabelFor(isTfp);
  const mins = window.graceMinutesFor(isTfp);
  const consequence = isTfp
    ? "A session cancelled on this basis is not rescheduled as of right; any home studio rental or other amount already paid is forfeited and non-refundable; and the photographer invite code under which the session was booked may be withdrawn."
    : "A session cancelled on this basis is not rescheduled as of right, and the advance retainer is forfeited under the non-refundable milestone terms set out above. The shoot day is released and any further session must be booked afresh.";
  const reschedule = isTfp
    ? "and nothing is forfeited — up to a maximum of <strong>two reschedules</strong>, beyond which the invite lapses."
    : "and the advance retainer carries over to the rescheduled date — up to a maximum of <strong>two reschedules</strong>.";
  return `
    <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: #b22222;">${sectionNumber}. CALL TIME, GRACE PERIOD, LATE ARRIVAL &amp; NO-SHOW</h4>
    <p style="margin: 0; font-weight: 500;">The call time confirmed by the Studio is the time the Participant is expected on set and ready to begin — not the time they set out. The Studio holds the set for <strong>${label}</strong> past that call time. Arriving within that window does not extend the session: the booked wrap time stands, and time lost to a late arrival comes out of the shoot.</p>
    <p style="margin: 6px 0 0 0; font-weight: 500;">If the Participant has not arrived within those ${mins} minutes and has not agreed a later start with the Studio, the Studio may <strong>cancel the session at its sole discretion</strong>. ${consequence}</p>
    <p style="margin: 6px 0 0 0;">A delay or cancellation notified <strong>at least 24 hours</strong> before the call time is treated as a reschedule rather than a no-show, ${reschedule}</p>
    <p style="margin: 6px 0 0 0;">A delay notified on the shoot day may be accommodated where the set is still free and the session can still finish within booked daylight hours, and by <strong>7:00 PM</strong> at the home studio. Notifying a delay is a courtesy and not an entitlement: it does not by itself extend the grace period or move the wrap time, and acceptance remains at the Studio's discretion.</p>
    <p style="margin: 6px 0 0 0;">If the <strong>Studio</strong> is not ready to begin within ${window.STUDIO_GRACE_MINUTES} minutes of the confirmed call time, the Participant may reschedule at no cost, or proceed with the wrap time extended by the length of the delay where the venue allows.</p>`;
};

// The one-line version for the on-page policy notice and policy list.
window.buildLateArrivalSummary = function (isTfp) {
  const label = window.graceLabelFor(isTfp);
  const tail = isTfp
    ? "the studio may cancel the shoot at its discretion, any rental paid is forfeited, and the invite code may be withdrawn"
    : "the studio may cancel the shoot at its discretion and the advance retainer is forfeited";
  return `the set is held for <strong>${label}</strong> past your confirmed call time; arriving late does not extend the session — the booked wrap time stands. Beyond that, ${tail}. Tell us at least 24 hours ahead and it is a reschedule instead (max 2). If the studio runs more than ${window.STUDIO_GRACE_MINUTES} minutes late, you may reschedule at no cost.`;
};

// Bookings carry a version in whichever form the UI of the day wrote: a
// bare "V3.3", a document reference like "COMMERCIAL-CONTRACT-V3.4", or a
// canonical archive key. Only the last is actually a key, so a direct
// lookup misses — and printContractPdf's two fallbacks both reached for
// "V3.3", which has never been a key at all. The result was an archiveObj
// of undefined and a contract PDF printed with an entirely empty terms
// section, silently, for every commercial booking.
window.resolveContractArchive = function(version) {
  const archive = window.WPS_CONTRACT_ARCHIVE || {};
  const raw = String(version || "").trim();
  if (archive[raw]) return archive[raw];

  const upper = raw.toUpperCase();
  const wantsTfp = upper.includes("TFP");
  const num = (upper.match(/V(\d+\.\d+)/) || [])[1];
  if (num) {
    // V3.3 onwards are split into -COMMERCIAL / -TFP pairs; V3.2 and older
    // are single unsuffixed documents covering both kinds of shoot.
    const paired = archive[`V${num}-${wantsTfp ? "TFP" : "COMMERCIAL"}`];
    if (paired) return paired;
    if (archive[`V${num}`]) return archive[`V${num}`];
  }
  return archive[wantsTfp ? window.ACTIVE_CONTRACTS.tfp : window.ACTIVE_CONTRACTS.commercial];
};

window.WPS_CONTRACT_ARCHIVE = {
  "V3.4-COMMERCIAL": {
    version: "V3.4-COMMERCIAL",
    title: "Commercial Shoot & Release Agreement V3.4 (Paid Shoots)",
    effectiveDate: "August 2026 – Present",
    status: "Active / Current (Paid Commercial)",
    summary: "Dedicated contract for Paid Commercial, Editorial, Fashion & Brand productions. Covers 50/50 & 50/30/20 non-refundable retainer milestones, commercial licensing, outstation travel (>20km), camera gear & media protection, and photography specialization. Package rates cover the photographer only — HMUA, styling, set design & other third-party crew are billed separately at actuals.",
    fullText: "1. SCOPE OF COMMERCIAL PRODUCTION & PAYMENT MILESTONES\nThis session is scheduled as a paid commercial production. Package rates cover photography creation, light design & master retouched deliverables. Standard bookings require a 50% advance retainer prior to shoot day start (non-refundable) and 50% final balance after shoot wrap prior to receiving downloadable master files (non-refundable). Commercial campaign bookings follow a 50/30/20 milestone structure.\n\n2. COMMERCIAL USAGE RIGHTS & INTELLECTUAL PROPERTY\nThe legal copyright of all visual media remains exclusively with the Studio. The Client is granted full commercial usage rights for digital advertising, website grids, social media campaigns, print catalogs, and brand marketing as specified in the agreed project scope. Under no circumstances are RAW unedited files delivered.\n\n3. STILL PHOTOGRAPHY SPECIALIZATION & VIDEO COVERAGE POLICY\nStudio packages and rate tiers are strictly dedicated to Still Photography creation (Commercial, Fashion, Editorial & Portfolio). Video / Reels coverage is not included in standard packages. Clients may bring their own videographer or request studio assistance to source a freelance videographer for the session.\n\n4. OUTSTATION LOCATION, TRAVEL & ACCOMMODATION (>20 KM FROM NOIDA)\nIf the shoot location is located beyond a 20 km radius from Noida (Delhi NCR), all travel expenses, local conveyance, outstation transport, tolls, and accommodation expenses incurred for the photographer (and core production team) shall be fully borne, arranged, or reimbursed by the client.\n\n5. CAMERA GEAR HANDS-OFF & DATA PROTECTION CLAUSE\nAll camera bodies, lenses, memory cards, tethering systems, and digital raw captures remain the exclusive physical and intellectual property of the Studio. Under no circumstances is a client or crew participant permitted to operate, touch, or delete media from the photographer's cameras or memory cards.\n\n6. THIRD-PARTY CREATIVE CREW, HMUA, STYLING & SET COSTS\nStudio package rates cover the photographer’s creative fee, light design, direction and master retouched deliverables ONLY. Hair & makeup artists (HMUA), wardrobe stylists, set designers, prop and set construction, art direction, assistants sourced on request, models or talent casting, and any other third-party creative professional are NOT included in the package rate. The Client is free to engage their own crew of choice, or may ask the Studio to source them on the Client’s behalf; in either case such crew are billed AT ACTUALS (at cost) in addition to the package rate. Any quotation for such crew is shared for approval before the shoot date, and no third-party cost is incurred without the Client’s written confirmation. Where the session takes place at the Studio’s home studio in Noida, total attendance including the Client and all such crew is capped at 3 people."
  },
  "V3.3-COMMERCIAL": {
    version: "V3.3-COMMERCIAL",
    title: "Commercial Shoot & Release Agreement V3.3 (Paid Shoots)",
    effectiveDate: "August 2026 (superseded by V3.4)",
    status: "Archived — superseded by V3.4 (added third-party crew cost clause)",
    summary: "Dedicated contract for Paid Commercial, Editorial, Fashion & Brand productions. Covers 50/50 & 50/30/20 non-refundable retainer milestones, commercial licensing, outstation travel (>20km), camera gear & media protection, and photography specialization.",
    fullText: "1. SCOPE OF COMMERCIAL PRODUCTION & PAYMENT MILESTONES\nThis session is scheduled as a paid commercial production. Package rates cover photography creation, light design & master retouched deliverables. Standard bookings require a 50% advance retainer prior to shoot day start (non-refundable) and 50% final balance after shoot wrap prior to receiving downloadable master files (non-refundable). Commercial campaign bookings follow a 50/30/20 milestone structure.\n\n2. COMMERCIAL USAGE RIGHTS & INTELLECTUAL PROPERTY\nThe legal copyright of all visual media remains exclusively with the Studio. The Client is granted full commercial usage rights for digital advertising, website grids, social media campaigns, print catalogs, and brand marketing as specified in the agreed project scope. Under no circumstances are RAW unedited files delivered.\n\n3. STILL PHOTOGRAPHY SPECIALIZATION & VIDEO COVERAGE POLICY\nStudio packages and rate tiers are strictly dedicated to Still Photography creation (Commercial, Fashion, Editorial & Portfolio). Video / Reels coverage is not included in standard packages. Clients may bring their own videographer or request studio assistance to source a freelance videographer for the session.\n\n4. OUTSTATION LOCATION, TRAVEL & ACCOMMODATION (>20 KM FROM NOIDA)\nIf the shoot location is located beyond a 20 km radius from Noida (Delhi NCR), all travel expenses, local conveyance, outstation transport, tolls, and accommodation expenses incurred for the photographer (and core production team) shall be fully borne, arranged, or reimbursed by the client.\n\n5. CAMERA GEAR HANDS-OFF & DATA PROTECTION CLAUSE\nAll camera bodies, lenses, memory cards, tethering systems, and digital raw captures remain the exclusive physical and intellectual property of the Studio. Under no circumstances is a client or crew participant permitted to operate, touch, or delete media from the photographer's cameras or memory cards."
  },
  "V3.4-TFP": {
    version: "V3.4-TFP",
    title: "Test Shoot & TFP Liability Release V3.4 (Test Shoots)",
    effectiveDate: "August 2026 – Present",
    status: "Active / Current (Test Shoot / TFP)",
    summary: "Dedicated agreement for Selective Collaborations & Test Shoots unlocked via Photographer Invite Codes. Covers non-commercial portfolio licensing, 8-12 retouched deliverable caps, mandatory Instagram tag credits (@nerdyphotographer.in), studio rental at actuals, physical liability waiver, gear protection, and a 60-minute call-time grace period with no-show cancellation.",
    fullText: "1. SCOPE OF COLLABORATION & DELIVERABLE LIMITS\nThis session is scheduled as a peer-to-peer Selective Collaboration (TFP Test Shoot) structured for mutual portfolio growth. Standard packages include web gallery access for online proofing and 8 to 12 Retouched Master Clicks. Strictly no RAW unedited files are delivered.\n\n2. NON-COMMERCIAL PORTFOLIO USAGE LICENSE\nParticipants are granted a non-exclusive license to use final retouched photos for personal self-promotion, social media grids (Instagram/TikTok), personal websites, and agency portfolios. Commercial licensing or selling assets to third parties is strictly prohibited.\n\n3. MANDATORY ATTRIBUTION & INSTAGRAM CO-AUTHOR WORKFLOW\nAll primary feed or grid publications must issue an Instagram Co-Author Collaboration Invite to @nerdyphotographer.in prior to publishing, and include full production credits in the caption:\n  📷 Photography & Light Design: @nerdyphotographer.in\n  👤 Model / Talent: @[Handle]\n\n4. STUDIO RENTAL AT ACTUALS & TRAVEL EQUATION\nPackage rates cover photography creation & master retouched deliverables. If a dedicated indoor studio venue/space is required, applicable studio rental fees are billed at actuals (at cost). Shoots requiring travel beyond 20 km incur travel expenses at actuals.\n\n5. PHYSICAL SAFETY LIABILITY WAIVER & GEAR PROTECTION\nThe Participant enters the studio environment and performs physical poses entirely at their own risk. The Studio is not liable for injuries or clothing damage. Participants may not touch equipment or delete media from cameras.\n\n6. CALL TIME, GRACE PERIOD, LATE ARRIVAL & NO-SHOW\nThe call time confirmed by the Studio is the time the Participant is expected on set and ready to begin, not the time they set out. The Studio holds the set for 60 minutes past that call time. Arriving within that window does not extend the session: the booked wrap time stands, and time lost to a late arrival comes out of the shoot. If the Participant has not arrived within those 60 minutes and has not agreed a later start with the Studio, the Studio may cancel the session at its sole discretion; a session cancelled on this basis is not rescheduled as of right, any home studio rental or other amount already paid is forfeited and non-refundable, and the photographer invite code under which the session was booked may be withdrawn. A delay or cancellation notified at least 24 hours before the call time is treated as a reschedule rather than a no-show and nothing is forfeited, up to a maximum of two reschedules; beyond that the invite lapses. A delay notified on the shoot day may be accommodated where the set is still free and the session can still finish within booked daylight hours, and by 7:00 PM at the home studio — notifying a delay is a courtesy and not an entitlement, it does not by itself extend the grace period or move the wrap time, and acceptance remains at the Studio's discretion. If the Studio is not ready to begin within 60 minutes of the confirmed call time, the Participant may reschedule at no cost, or proceed with the wrap time extended by the length of the delay where the venue allows."
  },
  "V3.3-TFP": {
    version: "V3.3-TFP",
    title: "Test Shoot & TFP Liability Release V3.3 (Test Shoots)",
    effectiveDate: "August 2026 (superseded by V3.4)",
    status: "Archived — superseded by V3.4 (added call-time grace period & no-show clause)",
    summary: "Dedicated agreement for Selective Collaborations & Test Shoots unlocked via Photographer Invite Codes. Covers non-commercial portfolio licensing, 8-12 retouched deliverable caps, mandatory Instagram tag credits (@nerdyphotographer.in), studio rental at actuals, physical liability waiver, and gear protection.",
    fullText: "1. SCOPE OF COLLABORATION & DELIVERABLE LIMITS\nThis session is scheduled as a peer-to-peer Selective Collaboration (TFP Test Shoot) structured for mutual portfolio growth. Standard packages include web gallery access for online proofing and 8 to 12 Retouched Master Clicks. Strictly no RAW unedited files are delivered.\n\n2. NON-COMMERCIAL PORTFOLIO USAGE LICENSE\nParticipants are granted a non-exclusive license to use final retouched photos for personal self-promotion, social media grids (Instagram/TikTok), personal websites, and agency portfolios. Commercial licensing or selling assets to third parties is strictly prohibited.\n\n3. MANDATORY ATTRIBUTION & INSTAGRAM CO-AUTHOR WORKFLOW\nAll primary feed or grid publications must issue an Instagram Co-Author Collaboration Invite to @nerdyphotographer.in prior to publishing, and include full production credits in the caption:\n  📷 Photography & Light Design: @nerdyphotographer.in\n  👤 Model / Talent: @[Handle]\n\n4. STUDIO RENTAL AT ACTUALS & TRAVEL EQUATION\nPackage rates cover photography creation & master retouched deliverables. If a dedicated indoor studio venue/space is required, applicable studio rental fees are billed at actuals (at cost). Shoots requiring travel beyond 20 km incur travel expenses at actuals.\n\n5. PHYSICAL SAFETY LIABILITY WAIVER & GEAR PROTECTION\nThe Participant enters the studio environment and performs physical poses entirely at their own risk. The Studio is not liable for injuries or clothing damage. Participants may not touch equipment or delete media from cameras."
  },
  "V3.2": {
    version: "V3.2",
    title: "Studio Release, Liability Waiver & Payment Terms V3.2",
    effectiveDate: "May 2026 – August 2026",
    status: "Archived",
    summary: "Current studio terms including 50/50 & 50/30/20 non-refundable milestone payments, explicit RAW file exclusion clause, Test Shoot deliverable limit (Full Proofing Gallery + 8 to 12 Retouched Master Clicks), Dedicated Studio Space Rental policy (at actuals / cost), Instagram Co-Author workflow, and physical safety liability release.",
    fullText: `1. SCOPE OF CREATIVE COLLABORATION & STUDIO VENUE RENTAL
This session is scheduled as a peer-to-peer creative collaboration or commercial production structured for mutual portfolio growth, asset curation, and personal branding advancement. The Studio provides specialized equipment, lighting architecture, workspace, and post-production engineering; the Participant(s) provide technical modeling direction, personal wardrobe, and makeup artistry. Studio Rental Policy: Package rates cover photography creation, light design & master retouched deliverables. If a dedicated indoor studio venue/space is required, applicable studio rental fees are billed at actuals (at cost), or the client may directly book their preferred studio venue for the production.

2. INTELLECTUAL PROPERTY, MODEL RELEASE & USAGE LICENSE
The legal copyright of all visual media remains exclusively with the Studio. To support mutual growth and portfolio building, all participants are granted a full non-exclusive license to publish, share, and use final retouched photos for personal self-promotion, social media grids (Instagram/TikTok), personal websites, and agency portfolios.
No Alterations: To preserve the lighting design and capture integrity, no party shall apply secondary mobile filters, automated presets, cropping adjustments, or third-party digital modifications to the delivered files.

3. COMPREHENSIVE LIABILITY WAIVER & INDEMNIFICATION
CRITICAL SAFETY & LIABILITY RELEASE: The Participant enters the studio environment, uses studio blocks, cubes, chairs, furniture, or props, and performs physical poses entirely at their own risk. The Studio shall not be held liable for any physical injury, illness, accident, psychological distress, property damage, or clothing wear-and-tear incurred before, during, or after this production. The Participant explicitly waives any right to seek damages or legal recourse against the Studio or its operating photographers for accidents or injuries occurring on the premises.
Furthermore, the Participant agrees to indemnify and hold harmless the Studio from any claims, damages, liabilities, or legal expenses arising out of the Participant’s conduct or injuries on set.

4. TECHNICAL PERFORMANCE, DELIVERABLES, PROOFING GALLERY, REVISIONS & PAYMENT MILESTONES
Proofing & Download Rights: All packages include web gallery access for online proofing, viewing, and image selection. High-resolution file downloading is strictly restricted to contracted retouched master clicks, unless full gallery download permission/buyout is explicitly purchased. Under no circumstances are RAW unedited files delivered.
Editing Revision Policy: Delivered retouched master assets include One (1) Round of Minor Revisions (minor skin adjustments, color grading tweaks, or crop adjustments). Revisions must be submitted in writing within 7 days of delivery. Additional revision rounds or major structural edits (body warping, outfit color changes, background alterations) are billed at ₹1,500 per image.
Cloud Storage Archival & Expiration Policy: Delivered online galleries and download links remain active on cloud servers for 3 Months (Test Shoots / TFP) or 6 Months (Paid Commercial Shoots) from the date of initial gallery delivery. The Client/Participant is solely responsible for downloading, archiving, and saving local copies of all delivered files within this retention window. After the retention window expires, cloud files are automatically purged from studio servers. Extended cloud archival beyond the retention window is available upon request for an additional fee (₹3,000 / year).
Payment Terms: Standard bookings require a 50% advance retainer prior to shoot day start (non-refundable) and 50% final balance after shoot wrap prior to receiving any downloadable file (non-refundable). Commercial campaign bookings follow a 50/30/20 milestone structure.

5. MANDATORY ALL-PARTY ATTRIBUTION WORKFLOW
To ensure creative transparency, all parties agree to execute the following mandatory publishing workflow:
- Instagram Collaboration Feature: For all primary feed or grid publications, the publishing party must issue an Instagram Co-Author Collaboration Invite to @nerdyphotographer.in prior to publishing.
- Full Production Credits Block: Every party publishing an asset must explicitly credit all contributors in the caption:
📷 Photography & Light Design: @nerdyphotographer.in
👤 Model / Talent: @[Handle]
💄 Makeup Artist / MUA: @[Handle]
👔 Styling / Wardrobe: @[Handle]

6. DIGITAL CONSENT & BINDING ACCEPTANCE
In accordance with standard digital contract practices, physical signatures are not required. Legal acceptance is established by replying with confirmation over email/DM or entering the studio workspace following receipt of these terms.`
  },
  "V3.1": {
    version: "V3.1",
    title: "TFP Production & Portfolio Release V3.1",
    effectiveDate: "May 2026 – July 2026",
    status: "Archived",
    summary: "Standard TFP portfolio licensing, model release, basic liability waiver, and mandatory credit block requirement.",
    fullText: `1. SCOPE OF COLLABORATION
This session is conducted under a Time-For-Print (TFP) framework for mutual portfolio creation. The Studio provides photography, lighting, and editing services; the Participant provides modeling services, wardrobe, and styling. No monetary compensation is exchanged for creative time.

2. COPYRIGHT OWNERSHIP & USAGE RIGHTS
Legal copyright remains with the Studio. All participants receive a non-exclusive license to share and publish retouched final files for personal self-promotion, social media, and portfolio usage. Commercial reselling or licensing to third-party brands is prohibited without written authorization.
No Filters: Secondary filter applications, color adjustments, or cropping modifications are strictly prohibited.

3. INDEMNIFICATION & LIABILITY WAIVER
The Participant assumes all physical risks associated with entering studio premises, posing on studio props, or participating in physical movements. The Studio is held harmless from any claims regarding injury, accident, or personal property damage.

4. DELIVERABLES & RAW FILE POLICY
Delivered assets consist exclusively of retouched JPEG files selected by the Studio. RAW unedited camera files remain confidential studio property and are not delivered to participants under standard TFP terms.

5. ATTRIBUTION & CREDITING
All digital publications on social platforms (Instagram, TikTok, LinkedIn, Portfolios) must tag and credit the Studio (@nerdyphotographer.in) in the caption and image tags prior to publishing.`
  },
  "V3.0": {
    version: "V3.0",
    title: "Creative Collab & Release V3.0",
    effectiveDate: "January 2026 – April 2026",
    status: "Archived",
    summary: "Initial Time-For-Print collab structure, non-exclusive social media usage license, and studio rules.",
    fullText: `1. CREATIVE SESSION SCOPE
TFP creative session organized for portfolio development. Studio provides camera equipment, lighting, and post-processing; model provides styling and modeling direction.

2. COPYRIGHT & MODEL RELEASE
All images are the exclusive intellectual property of the photographer. Model is granted a personal, non-commercial usage license for online portfolio display and social media posting.

3. UNEDITED & RAW FILE RESTRICTIONS
Unedited RAW files remain studio property and will not be released or distributed under any circumstances. Only retouched final JPEGs are provided.

4. SAFETY & LIABILITY RELEASE
Model enters studio environment voluntarily and assumes personal responsibility for health and safety on set. Photographer is released from any injury or property liability.

5. CREDITING AGREEMENT
Model agrees to credit @nerdyphotographer.in on all social media posts and web galleries.`
  },
  "V2.0": {
    version: "V2.0",
    title: "Studio Model Release V2.0",
    effectiveDate: "June 2025 – December 2025",
    status: "Archived",
    summary: "Early model release agreement covering digital distribution, copyright ownership, and promo usage.",
    fullText: `1. MODEL CONSENT & RELEASE
Model hereby grants photographer permission to take, edit, and publish photographs taken during the shoot for studio self-promotion, website display, and portfolio presentations.

2. INTELLECTUAL PROPERTY
Photographer retains full copyright ownership of all captured media. Model receives digital copies of edited photos for personal self-promotion.

3. RAW FILE POLICY
RAW unedited files are not included or delivered in standard shoot packages.

4. LIABILITY WAIVER
Model waives any claims against photographer for accidental injury or property damage during the shoot session.`
  },
  "V1.0": {
    version: "V1.0",
    title: "Basic Photography Release V1.0",
    effectiveDate: "January 2025 – May 2025",
    status: "Archived",
    summary: "Foundational photo release and copyright acknowledgment for early studio testing.",
    fullText: `1. BASIC PHOTOGRAPHY RELEASE
Participant consents to photography session and grants photographer the right to use resulting images for portfolio, web, and promotional display.

2. COPYRIGHT & USAGE
Photographer owns all legal copyright. Participant receives personal usage license for final edited photos.

3. RAW FILES
RAW files are not provided.`
  }
};

// V3.5 is V3.4 plus the call-time clause, composed rather than copied so the
// two cannot drift — the whole of the commercial agreement is otherwise
// unchanged, and retyping 6 clauses to add a 7th is how they diverge.
window.WPS_CONTRACT_ARCHIVE["V3.5-COMMERCIAL"] = {
  version: "V3.5-COMMERCIAL",
  title: "Commercial Shoot & Release Agreement V3.5 (Paid Shoots)",
  effectiveDate: "August 2026 – Present",
  status: "Active / Current (Paid Commercial)",
  summary: window.WPS_CONTRACT_ARCHIVE["V3.4-COMMERCIAL"].summary + " Adds a 180-minute call-time grace period, after which the studio may cancel and the advance retainer is forfeited.",
  fullText: window.WPS_CONTRACT_ARCHIVE["V3.4-COMMERCIAL"].fullText + "\n\n" + window.buildLateArrivalText(false, 7)
};
// The document it replaces stays readable, because bookings already agreed
// under it must still print the terms those clients actually accepted.
window.WPS_CONTRACT_ARCHIVE["V3.4-COMMERCIAL"].effectiveDate = "August 2026 (superseded by V3.5)";
window.WPS_CONTRACT_ARCHIVE["V3.4-COMMERCIAL"].status = "Archived — superseded by V3.5 (added call-time grace period & no-show clause)";

// V3.6 is V3.5 plus the Client's choice of who arranges a rented external
// studio (Client or photographer, billed at actuals), and confirms any
// studio rental is paid in full as part of the advance retainer rather than
// split across milestones — composed via .replace() on the shared clause 1
// sentence so the five unrelated clauses cannot drift out of sync.
window.WPS_CONTRACT_ARCHIVE["V3.6-COMMERCIAL"] = {
  version: "V3.6-COMMERCIAL",
  title: "Commercial Shoot & Release Agreement V3.6 (Paid Shoots)",
  effectiveDate: "August 2026 – Present",
  status: "Active / Current (Paid Commercial)",
  summary: window.WPS_CONTRACT_ARCHIVE["V3.5-COMMERCIAL"].summary + " Adds the Client's choice of who arranges a rented external studio (Client or photographer, billed at actuals), and confirms any studio rental is paid in full as part of the advance retainer.",
  fullText: window.WPS_CONTRACT_ARCHIVE["V3.5-COMMERCIAL"].fullText.replace(
    "Commercial campaign bookings follow a 50/30/20 milestone structure.",
    "Commercial campaign bookings follow a 50/30/20 milestone structure. Any studio rental applicable to the session (home studio or a dedicated external studio) is payable in full as part of the advance retainer, in addition to the package advance. Where a dedicated external or commercial studio space is booked for the shoot, the Client chooses who arranges it: the Client may book the studio space and any lighting equipment directly, or ask the photographer to do so on the Client's behalf, with the actual cost billed at actuals."
  )
};
window.WPS_CONTRACT_ARCHIVE["V3.5-COMMERCIAL"].effectiveDate = "August 2026 (superseded by V3.6)";
window.WPS_CONTRACT_ARCHIVE["V3.5-COMMERCIAL"].status = "Archived — superseded by V3.6 (added studio-arranger choice & rental-due-upfront rule)";

// V3.5-TFP is V3.4-TFP plus the same studio-arranger choice, adapted for a
// collaboration — composed the same way, off the existing studio-rental
// sentence in clause 4.
window.WPS_CONTRACT_ARCHIVE["V3.5-TFP"] = {
  version: "V3.5-TFP",
  title: "Test Shoot & TFP Liability Release V3.5 (Test Shoots)",
  effectiveDate: "August 2026 – Present",
  status: "Active / Current (Test Shoot / TFP)",
  summary: window.WPS_CONTRACT_ARCHIVE["V3.4-TFP"].summary + " Adds the Participant's choice of who arranges a rented external studio (Participant or photographer, billed at actuals).",
  fullText: window.WPS_CONTRACT_ARCHIVE["V3.4-TFP"].fullText.replace(
    "If a dedicated indoor studio venue/space is required, applicable studio rental fees are billed at actuals (at cost).",
    "If a dedicated indoor studio venue/space is required, applicable studio rental fees are billed at actuals (at cost) and are payable in full before the shoot day. Where a dedicated external or commercial studio space is booked, the Participant chooses who arranges it: they may book the studio space and lighting equipment directly themselves, or ask the photographer to do so on their behalf, with the actual cost billed at actuals."
  )
};
window.WPS_CONTRACT_ARCHIVE["V3.4-TFP"].effectiveDate = "August 2026 (superseded by V3.5-TFP)";
window.WPS_CONTRACT_ARCHIVE["V3.4-TFP"].status = "Archived — superseded by V3.5-TFP (added studio-arranger choice)";

// V3.7 / V3.6-TFP drop the at-cost pass-through for a rented studio: an
// external studio (and, when the photographer arranges it, the equipment)
// is quoted in advance and added to the invoice, so the studio can price its
// own coordination instead of promising cost price. Composed off the active
// sentences with .replace(), like the versions before them.
window.WPS_CONTRACT_ARCHIVE["V3.7-COMMERCIAL"] = {
  version: "V3.7-COMMERCIAL",
  title: "Commercial Shoot & Release Agreement V3.7 (Paid Shoots)",
  effectiveDate: "September 2026 – Present",
  status: "Active / Current (Paid Commercial)",
  summary: window.WPS_CONTRACT_ARCHIVE["V3.6-COMMERCIAL"].summary.replace("(Client or photographer, billed at actuals)", "(Client or photographer)") + " A photographer-arranged studio and its equipment are quoted in advance and added to the invoice rather than passed through at cost.",
  fullText: window.WPS_CONTRACT_ARCHIVE["V3.6-COMMERCIAL"].fullText.replace(
    "or ask the photographer to do so on the Client's behalf, with the actual cost billed at actuals.",
    "or ask the photographer to do so on the Client's behalf, in which case the studio space and equipment charges are quoted to the Client in advance and added to the invoice."
  )
};
window.WPS_CONTRACT_ARCHIVE["V3.6-COMMERCIAL"].effectiveDate = "August 2026 (superseded by V3.7)";
window.WPS_CONTRACT_ARCHIVE["V3.6-COMMERCIAL"].status = "Archived — superseded by V3.7 (photographer-arranged studio quoted in advance, not at cost)";

window.WPS_CONTRACT_ARCHIVE["V3.6-TFP"] = {
  version: "V3.6-TFP",
  title: "Test Shoot & TFP Liability Release V3.6 (Test Shoots)",
  effectiveDate: "September 2026 – Present",
  status: "Active / Current (Test Shoot / TFP)",
  summary: window.WPS_CONTRACT_ARCHIVE["V3.5-TFP"].summary.replace("studio rental at actuals", "studio rental quoted in advance").replace("(Participant or photographer, billed at actuals)", "(Participant or photographer)") + " Studio rental and a photographer-arranged studio are quoted in advance rather than passed through at cost.",
  fullText: window.WPS_CONTRACT_ARCHIVE["V3.5-TFP"].fullText
    .replace("4. STUDIO RENTAL AT ACTUALS & TRAVEL EQUATION", "4. STUDIO RENTAL & TRAVEL EQUATION")
    .replace("applicable studio rental fees are billed at actuals (at cost) and are payable in full before the shoot day.", "applicable studio rental fees are quoted to the Participant in advance and are payable in full before the shoot day.")
    .replace("or ask the photographer to do so on their behalf, with the actual cost billed at actuals.", "or ask the photographer to do so on their behalf, in which case the studio space and equipment charges are quoted in advance and added to the Participant's invoice.")
};
window.WPS_CONTRACT_ARCHIVE["V3.5-TFP"].effectiveDate = "August 2026 (superseded by V3.6-TFP)";
window.WPS_CONTRACT_ARCHIVE["V3.5-TFP"].status = "Archived — superseded by V3.6-TFP (studio rental quoted in advance, not at cost)";

window.saveAdminCustomPackages = async function() {
  // The test-shoot row shares the class for layout but is not a paid tier.
  const rows = document.querySelectorAll(".admin-pkg-editor-row:not(.admin-pkg-editor-row--tfp)");
  if (rows.length) {
    const updated = [];
    rows.forEach((row, i) => {
      const name = row.querySelector(".pkg-edit-name")?.value || `Package ${i+1}`;
      const price = parseInt(row.querySelector(".pkg-edit-price")?.value, 10) || 10000;
      const specs = row.querySelector(".pkg-edit-specs")?.value || "Standard Deliverables";
      updated.push({ id: `pkg_${i+1}`, name, price, specs });
    });
    localStorage.setItem("wps_custom_packages", JSON.stringify(updated));
  }
  // Test-shoot row (no fee): name + deliverables line.
  const tfpNameEl = document.getElementById("tfpPkgName");
  const tfpSpecsEl = document.getElementById("tfpPkgSpecs");
  if (tfpNameEl || tfpSpecsEl) {
    const current = getAdminTfpPackage();
    const tfp = {
      name: (tfpNameEl?.value || "").trim() || current.name,
      specs: (tfpSpecsEl?.value || "").trim() || current.specs
    };
    localStorage.setItem("wps_tfp_package", JSON.stringify(tfp));
  }

  // Home studio rental. Blank is "leave it as it was", not zero — clearing the
  // box by accident must not silently make the studio free.
  const homeRateEl = document.getElementById("homeStudioRateInput");
  if (homeRateEl && homeRateEl.value !== "") {
    const rate = parseInt(homeRateEl.value, 10);
    if (!isNaN(rate) && rate >= 0) localStorage.setItem("wps_home_studio_rate", String(rate));
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
      if (!isNaN(tfpRate) && tfpRate >= 0) localStorage.setItem("wps_home_studio_rate_tfp", String(tfpRate));
    }
  }

  // Commit Draft Invite Codes. (A legacy singular "wps_custom_invite_code"
  // key used to be written here too — as "[object Object]", since the entry
  // is an object — but nothing anywhere reads it, so it was dropped.)
  if (window.adminDraftInviteCodes && Array.isArray(window.adminDraftInviteCodes)) {
    localStorage.setItem("wps_custom_invite_codes", JSON.stringify(window.adminDraftInviteCodes));
  }

  // Commit Draft Promo Codes
  if (window.adminDraftPromoCodes && typeof window.adminDraftPromoCodes === "object") {
    localStorage.setItem("wps_custom_promo_codes", JSON.stringify(window.adminDraftPromoCodes));
  }

  const statusBadge = document.getElementById("adminPricingSaveStatus");
  const setBadge = (color, bg, text) => {
    if (!statusBadge) return;
    statusBadge.style.color = color;
    statusBadge.style.background = bg;
    statusBadge.style.borderColor = color;
    statusBadge.innerHTML = text;
  };

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
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
  if (typeof toast === "function") toast(`↕️ Reordered Package #${index + 1}!`);
  if (typeof render === "function") render();
};

/* ============================================================
   nerdyphotographer.in — app (multi-view studio)
   Hash-free router · 7 views · overlay nav · rich upload form ·
   IndexedDB persistence · GitHub publishing · lightbox.
   No backend, no framework.

   TABLE OF CONTENTS
   §1  Data & environment
   §2  Core utilities            ($, esc, uid, toast, shuffle, focus trap)
   §3  Photo & media helpers     (src/srcset/alt, read, resize, palette)
   §4  Text, credits & socials   (names, credit links, IG/Kavyar parsing)
   §5  Shoot helpers             (future shoots, testimonials)
   §6  Admin mode & view context (?admin= unlock, comp-card/portfolio views)
   §7  Persistence — IndexedDB   (shoots store)
   §8  App state                 (SHOOTS, demo fallback, loading)
   §9  GitHub sync               (publish shoots + photos to the repo)
   §10 Lightbox                  (viewer, sidebar, keyboard/touch nav)
   §11 Site chrome               (overlay nav, admin & theme controls)
   §12 Views                     (HTML builders for every route)
   §13 View wiring               (upload form, booking form, cards)
   §14 Router                    (routes, render, SEO metadata)
   §15 Animation & loader        (reveals, counters, boot loader)
   §16 Comp-card printing        (PDF export + download logging)
   §17 Boot                      (init order, first render)
   ============================================================ */
(() => {
  "use strict";

  /* ============================================================
     §1 · DATA & ENVIRONMENT
     ============================================================ */
  // Falls back to {} rather than throwing if data.js failed to load — a hard
  // throw here happens before boot()'s try/catch even exists, so the loader
  // would be left spinning forever with no error page and no 2.5s failsafe.
  const { ACTIVITIES: rawAct, TYPES: rawTyp, BRANDS: rawBrs, DEMO_SHOOTS } = window.WPS_DATA || {};
  const cfgData = window.STUDIO_CONFIG || {};
  const ACTIVITIES = [...new Set([...(rawAct || []), ...(cfgData.activities || [])])];
  const TYPES = [...new Set([...(rawTyp || []), ...(cfgData.types || [])])];
  const BRANDS = [...new Set([...(rawBrs || []), ...(cfgData.brands || [])])];
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The site itself is static (GitHub Pages) but /api/logs is served by server.js
  // running elsewhere (Render). Same-origin locally; absolute URL in production.
  // TODO: replace with your actual Render service URL after deploying.
  const IS_LOCAL_HOST = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const COMP_CARD_API_BASE = IS_LOCAL_HOST ? "" : "https://wolverine-photostudio-api.onrender.com";

  /* ============================================================
     §2 · CORE UTILITIES
     ============================================================ */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // For a value interpolated inside a single-quoted JS string literal that
  // itself sits inside an HTML on* attribute (e.g. onclick="fn('${id}')").
  // esc() alone only guards the HTML attribute boundary (") — an apostrophe
  // in the value (e.g. a model's name flowing into a synthetic album id)
  // would still break out of the JS string and leave the handler a syntax
  // error, silently no-op'ing the button for that model.
  const escJs = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  let toastTimer;
  function toast(msg) {
    let el = $(".toast"); if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg; requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }
  // The admin promo/invite/package engine at the top of this file lives in
  // global scope (its handlers are wired via onclick attributes), so it can
  // only reach these module helpers through window. Its
  // `typeof toast === "function"` / `typeof render === "function"` guards
  // silently no-op'd forever while these stayed IIFE-private — no toasts, no
  // re-render after Save. (render is a function declaration further down;
  // hoisting makes this binding valid here.)
  window.toast = toast;
  window.render = render;
  function shuffleArray(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  // Shared focus trap: keep Tab cycling within `root` while it's open.
  // `isActive` (optional) can veto trapping (e.g. only when a menu is open).
  function trapTabKey(root, focusableSelector, isActive) {
    root.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      if (isActive && !isActive()) return;
      const f = [...root.querySelectorAll(focusableSelector)].filter(el => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ============================================================
     §3 · PHOTO & MEDIA HELPERS
     ============================================================ */
  // A photo renders from its published file URL when it has one, else its local base64.
  const photoSrc = (p) => {
    if (!p) return "";
    let src = p.url || p.dataUrl || "";
    if (src.startsWith("photos/")) {
      src = "/" + src;
    }
    return src;
  };
  // Build responsive srcset attributes when a photo has generated size variants.
  // Existing single-size photos return "" (plain src is used, unchanged behaviour).
  // The raw candidate list, for code that assigns the `srcset` *property*
  // (the *Attr helper below returns a whole attribute string, which is right
  // for innerHTML but becomes a malformed value when assigned to img.srcset).
  const srcsetValue = (p) => {
    if (!p || !p.url) return "";                 // base64/local: no srcset
    const fixPath = (url) => (url && url.startsWith("photos/")) ? "/" + url : url;
    const set = [];
    if (p.small)  set.push(`${fixPath(p.small)} 480w`);
    if (p.medium) set.push(`${fixPath(p.medium)} 960w`);
    if (set.length) set.push(`${fixPath(p.url)} 1600w`);
    return set.join(", ");
  };
  const srcsetAttr = (p, sizes = "(max-width: 620px) 90vw, (max-width: 1100px) 45vw, 640px") => {
    const value = srcsetValue(p);
    return value ? ` srcset="${esc(value)}" sizes="${esc(sizes)}"` : "";
  };
  // Descriptive, SEO-friendly alt text for a shoot's photo (Google Images).
  // How a shoot's type should read to a visitor. "Test Shoot" and "Selective
  // Collaboration (TFP)" are how the studio classifies a booking, not something
  // the work itself gains from announcing — on a portfolio it reads as "unpaid",
  // which devalues the frames beside it. Both are suppressed publicly unless a
  // shoot opts in with showTestShootCategory. The studio still sees them in
  // admin mode, where the classification is the point.
  // Returns "" when there is nothing to show, so callers must drop the label
  // rather than render an empty badge.
  const publicShootType = (s) => {
    const t = ((s && s.type) || "").trim();
    const isTestish = t === "Test Shoot" || t === "Selective Collaboration (TFP)";
    if (isTestish && !s.showTestShootCategory && !isAdmin()) return "";
    return t === "Selective Collaboration (TFP)" ? "Selective Collab" : t;
  };

  const altFor = (s, frame) => {
    if (!s) return "Photograph by nerdyphotographer.in";
    if (s.caption) return s.caption;
    // Cleaned: alt text is read aloud by screen readers, indexed by Google
    // Images, and shown verbatim when a photo fails to load — a raw
    // "Name (https://instagram.com/…)" spelled the whole URL out in all three.
    const who = getTalentCleanName(s.talent) || (s.title && s.title.trim()) || "";
    const what = [s.activity, publicShootType(s)].filter(Boolean).join(" ");
    const parts = [
      what ? `${what} photography` : "Photography",
      who ? `featuring ${who}` : "",
      "by nerdyphotographer.in, Noida & Delhi NCR",
      frame ? `(frame ${frame})` : ""
    ].filter(Boolean);
    return parts.join(" ");
  };
  function readAsDataURL(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
  function resize(dataUrl, maxDim = 1600, q = 0.82) {
    return new Promise((res) => { const img = new Image(); img.onload = () => {
      let { width: w, height: h } = img; if (Math.max(w, h) <= maxDim) return res(dataUrl);
      const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s);
      const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h);
      res(c.toDataURL("image/jpeg", q));
    }; img.onerror = () => res(dataUrl); img.src = dataUrl; });
  }
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

  /* ============================================================
     §4 · TEXT, CREDITS & SOCIAL-HANDLE HELPERS
     ============================================================ */
  function getTalentCleanName(talentStr) {
    return (talentStr || "").replace(/\s*\([^)]+\)/g, "").trim();
  }

  function buildSocialLinkHtml(s, compact = false) {
    const c = classifySocial(s);
    if (!c) return "";
    const url = c.url, label = c.label;
    const arrow = (compact || c.kind === "email") ? "" : " ↗";
    const margin = compact ? "4px" : "6px";
    return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent); font-weight:700; text-decoration:none; margin-left:${margin}; display:inline-flex; align-items:center; gap:2px;">${esc(label)}${arrow}</a>`;
  }

  function renderCreditLinks(text, delimiter = ";", compact = false) {
    if (!text || text === "—") return "—";
    const items = text.split(",").map(item => item.trim()).filter(Boolean);
    const renderedItems = items.map(item => {
      // 1. Parentheses format: Name (@handle)
      const parenRegex = /\(([^)]+)\)/;
      const match = item.match(parenRegex);
      if (match) {
        const rawName = item.replace(parenRegex, "").trim();
        const rawSocials = match[1].split(delimiter).map(s => s.trim()).filter(Boolean);
        const socialLinks = rawSocials.map(s => buildSocialLinkHtml(s, compact)).join(" ");
        return `${esc(rawName)} ${socialLinks}`;
      }
      
      // 2. Inline format: Name @handle or Name instagram.com/handle
      const handleRegex = /(https?:\/\/[^\s]+|@[\w._-]+|instagram\.com\/[^\s]+|kavyar\.com\/[^\s]+)/gi;
      const handles = item.match(handleRegex);
      if (handles && handles.length > 0) {
        let cleanName = item;
        handles.forEach(h => { cleanName = cleanName.replace(h, ""); });
        cleanName = cleanName.replace(/—|-/g, "").trim();
        const socialLinks = handles.map(h => buildSocialLinkHtml(h, compact)).join(" ");
        return `${esc(cleanName)} ${socialLinks}`;
      }

      return esc(item);
    });
    return renderedItems.join(", ");
  }

  const renderCreditValue = (text) => renderCreditLinks(text, ";", false);
  const renderCreditsValue = (text) => renderCreditLinks(text, ";", true);

  const shouldShowField = (shoot, fieldName) => isAdmin() || shoot[`show${fieldName}`] !== false;

  // Where a model's agency / email may appear, per surface (CompCard, Home,
  // Pdf). Older albums saved a single switch (showAgency / showModelEmail);
  // that is honoured when no per-surface value exists. Agency defaults to
  // shown, the email to hidden: it is personal data.
  // Every visibility switch: [input id stem, what, default]. Only the
  // model's Instagram is on unless switched on.
  const REP_SWITCHES = [
    ["ig", "ModelInstagram", true], ["kavyar", "ModelKavyar", false], ["linkedin", "ModelLinkedin", false], ["behance", "ModelBehance", false], ["website", "ModelWebsite", false], ["email", "Email", false],
    ["agency", "Agency", false], ["agency_ig", "AgencyInstagram", false], ["agency_kavyar", "AgencyKavyar", false], ["agency_linkedin", "AgencyLinkedin", false], ["agency_behance", "AgencyBehance", false], ["agency_website", "AgencyWebsite", false], ["agency_email", "AgencyEmail", false]
  ];
  const REP_SURFACES = [["cc", "CompCard"], ["home", "Home"], ["pdf", "Pdf"]];
  const repSwitchValues = () => { const o = {}; REP_SWITCHES.forEach(([id, what, def]) => REP_SURFACES.forEach(([sfx, sf]) => { o[`show${what}On${sf}`] = $(`#f_show_${id}_${sfx}`)?.checked ?? def; })); return o; };
  const showRep = (shoot, what, surface) => {
    if (!shoot) return false;
    const v = shoot[`show${what}On${surface}`];
    if (v !== undefined) return v === true;
    // Only the model's Instagram is shown unless a switch says otherwise.
    if (what === "Agency") return shoot.showAgency === true;
    if (what === "Email") return shoot.showModelEmail === true;
    // Kavyar / LinkedIn / Behance / website briefly shared one switch.
    if (["ModelKavyar", "ModelLinkedin", "ModelBehance", "ModelWebsite"].includes(what)) return shoot[`showModelSocialsOn${surface}`] === true;
    return what === "ModelInstagram";
  };
  // The agency is typed like every other credit — "Name (@handle; site.com)" —
  // and stored split, because comp cards and PDFs print the name and link
  // the handle separately.
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
  const cleanIgHandle = (h) => {
    const v = String(h || "").trim();
    if (!v) return "";
    const m = v.match(/instagram\.com\/([\w._-]+)/i);
    if (m) return m[1];
    return v.replace(/^@/, "").replace(/[\/?#].*$/, "");
  };
  const siteFromCredit = (text) => {
    const m = (text || "").match(/\(([^)]+)\)/);
    if (!m) return "";
    const site = m[1].split(/[;,]/).map(x => x.trim()).filter(Boolean).find(p => !p.startsWith("@") && !/instagram\.com/i.test(p));
    return site ? site.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "") : "";
  };
  const siteHref = (site) => /^https?:\/\//i.test(site) ? site : `https://${site}`;
  const cleanSite = (v) => String(v || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  // Everything that can follow a name in a credit, told apart by shape so
  // the order never matters and any part can be left out:
  //   @handle · instagram.com/x · ig:x          Instagram
  //   kavyar.com/x · kv:x                       Kavyar
  //   linkedin.com/in/x · li:x                  LinkedIn
  //   behance.net/x · be:x                      Behance
  //   name@domain.tld · mail:x                  email
  //   anything else with a dot · web:x          website
  // The short prefixes exist for the one case shape cannot settle: a bare
  // LinkedIn or Behance name typed without its domain.
  function classifySocial(raw) {
    let v = String(raw || "").trim();
    if (!v) return null;
    let forced = "";
    const pre = v.match(/^(ig|instagram|kv|kavyar|li|linkedin|be|behance|mail|email|web|site):\s*(.+)$/i);
    if (pre) {
      forced = { ig: "instagram", instagram: "instagram", kv: "kavyar", kavyar: "kavyar", li: "linkedin", linkedin: "linkedin", be: "behance", behance: "behance", mail: "email", email: "email", web: "website", site: "website" }[pre[1].toLowerCase()];
      v = pre[2].trim();
    }
    const pathAfter = (host) => { const m = v.match(new RegExp(host.replace(".", "\\.") + "\\/([^\\s?#]+)", "i")); return m ? m[1].replace(/\/+$/, "") : ""; };
    const has = (host) => new RegExp(host.replace(".", "\\."), "i").test(v);
    if (forced === "email" || (!forced && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))) return { kind: "email", label: v, url: `mailto:${v}` };
    if (forced === "instagram" || (!forced && (v.startsWith("@") || has("instagram.com")))) {
      const h = has("instagram.com") ? (pathAfter("instagram.com").split("/")[0] || "") : v.replace(/^@/, "");
      return h ? { kind: "instagram", label: `@${h}`, url: `https://instagram.com/${h}` } : null;
    }
    if (forced === "kavyar" || (!forced && has("kavyar.com"))) { const p = has("kavyar.com") ? pathAfter("kavyar.com") : v.replace(/^@/, ""); return { kind: "kavyar", label: "Kavyar", url: `https://kavyar.com/${p}` }; }
    if (forced === "linkedin" || (!forced && has("linkedin.com"))) { const p = has("linkedin.com") ? pathAfter("linkedin.com") : `in/${v.replace(/^@/, "")}`; return { kind: "linkedin", label: "LinkedIn", url: `https://www.linkedin.com/${p}` }; }
    if (forced === "behance" || (!forced && has("behance.net"))) { const p = has("behance.net") ? pathAfter("behance.net") : v.replace(/^@/, ""); return { kind: "behance", label: "Behance", url: `https://www.behance.net/${p}` }; }
    if (forced === "website" || /\./.test(v)) { const clean = cleanSite(v); return { kind: "website", label: clean, url: /^https?:\/\//i.test(v) ? v : `https://${clean}` }; }
    // A bare word has always meant an Instagram handle.
    return { kind: "instagram", label: `@${v}`, url: `https://instagram.com/${v}` };
  }
  const SOCIAL_ORDER = ["instagram", "kavyar", "linkedin", "behance", "website", "email"];
  const SOCIAL_LABEL = { instagram: "Instagram", kavyar: "Kavyar", linkedin: "LinkedIn", behance: "Behance", website: "Website", email: "Email" };
  const socialsFromCredit = (text) => {
    const m = String(text || "").match(/\(([^)]+)\)/);
    if (!m) return [];
    return m[1].split(";").map(x => x.trim()).filter(Boolean).map(classifySocial).filter(Boolean);
  };
  // Printed form of a link: the handle, the address, or the bare site/path.
  const socialPrintText = (l) => l.kind === "instagram" || l.kind === "email" ? l.label : cleanSite(l.url);
  const agencyLinksOf = (shoot) => {
    if (Array.isArray(shoot.agencyLinks) && shoot.agencyLinks.length) return shoot.agencyLinks;
    const out = [];
    const h = cleanIgHandle(shoot.agencyHandle); if (h) out.push({ kind: "instagram", label: `@${h}`, url: `https://instagram.com/${h}` });
    const site = cleanSite(shoot.agencySite); if (site) out.push({ kind: "website", label: site, url: siteHref(site) });
    return out;
  };
  const igHandleFromCredit = (text) => {
    const m = (text || "").match(/\(([^)]+)\)/);
    const parts = m ? m[1].split(/[;,]/).map(x => x.trim()).filter(Boolean) : ((text || "").match(/@[\w._-]+|instagram\.com\/[^\s)]+/gi) || []);
    for (const p of parts) {
      if (p.startsWith("@")) return p.slice(1);
      const ig = p.match(/instagram\.com\/([\w._-]+)/i);
      if (ig) return ig[1];
    }
    return "";
  };

  // Does this album belong on the Comp Cards / Model Portfolio pages?
  //
  // "Show as Comp Card" is the real switch. Type used to be the only way in,
  // which forced an album to be relabelled Test Shoot purely to appear here —
  // but a shoot's type describes what it was, not where it should be shown.
  // Test Shoot / TFP still qualify on their own so every album published
  // before the checkbox existed keeps working untouched.
  //
  // Workshop albums stay out either way, checkbox or not: the page states
  // outright that models from workshop projects are not included, and that
  // promise used to be kept only as a side effect of the type test.
  //
  // Defined once because three separate places gated on this and would
  // otherwise drift apart: the listing, the category tile samples, and the
  // lightbox's comp-card mode.
  const qualifiesAsCompCard = (s) => {
    if (!s || s.type === "Workshop Attended") return false;
    return !!(s.showAsCompCard || s.isCompCard || s.type === "Selective Collaboration (TFP)" || s.type === "Test Shoot");
  };

  // Which book is this model cast from? Agencies file talent by the kind of
  // work they get booked for, not only by measurements, and a model can
  // genuinely straddle two books (fashion who also shoots fitness) — so this
  // is a list, not one value. It is capped at two: a comp card claiming four
  // specialities reads as claiming none, and the printed card only has room
  // for two badges beside the name.
  // The four the studio started with. Not a closed list — the panel can add
  // its own (Commercial, Editorial, Runway, whatever a casting calls for);
  // these are just the ones that are always offered, so a fresh album never
  // opens on an empty picker.
  const MODEL_TYPES = ["Fashion", "Fitness", "Sports", "Lifestyle"];
  const MODEL_TYPES_MAX = 2;
  // Long enough for "Commercial Print", short enough that a typed-in essay
  // can't push the printed comp card's name off its own line.
  const MODEL_TYPE_MAXLEN = 24;

  // Canonical spelling for one type. Case and a trailing "Model"/"Models" are
  // noise — "fashion", "Fashion" and "Fashion Model" are the same book — so
  // they are normalised away here, and a value matching a built-in adopts the
  // built-in's exact casing. Without this, a type typed slightly differently
  // on two albums would show up as two separate options in the picker.
  function normalizeModelType(value) {
    const name = String(value ?? "").replace(/\s+/g, " ").trim().replace(/\s*models?$/i, "").trim();
    if (!name) return "";
    const known = MODEL_TYPES.find((t) => t.toLowerCase() === name.toLowerCase());
    if (known) return known;
    return name.slice(0, MODEL_TYPE_MAXLEN)
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  }

  // Accepts whatever a record happens to carry — a real array, a legacy
  // comma-separated string, or nothing at all — and always answers with a
  // normalised, deduped list at most MODEL_TYPES_MAX long. Everything that
  // reads model types goes through here so no surface has to re-guess the
  // shape or re-apply the cap.
  function modelTypesOf(shoot) {
    if (!shoot) return [];
    const raw = shoot.modelTypes ?? shoot.modelType;
    const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const name = normalizeModelType(item);
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push(name);
      if (out.length === MODEL_TYPES_MAX) break;
    }
    return out;
  }

  // Everything the picker offers: the built-ins, then whatever the studio has
  // added, in use order. A custom type is an option because some album
  // carries it — there is no separate list to keep in sync, and nothing extra
  // to publish, so a type added on one album is offered on every album as
  // soon as that one is saved.
  function modelTypeOptions(extra = []) {
    const seen = new Map();
    const add = (t) => {
      const name = normalizeModelType(t);
      if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
    };
    MODEL_TYPES.forEach(add);
    (Array.isArray(SHOOTS) ? SHOOTS : []).forEach((s) => modelTypesOf(s).forEach(add));
    (Array.isArray(extra) ? extra : [extra]).forEach(add);
    return [...seen.values()];
  }
  // Stored bare ("Fashion") so each surface can label it its own way; this is
  // the one the public sees.
  const modelTypeLabel = (t) => `${t} Model`;

  // Every card used to print "Chest/Bust" for everyone, which is a label no
  // real model has: a person has one or the other, whatever their gender, and
  // a comp card hedging between the two reads as a form, not a card. The
  // studio picks the word per model; "Chest" only stands in until they do.
  const CHEST_LABELS = ["Chest", "Bust"];
  const chestLabelOf = (shoot) => {
    const raw = String((shoot && shoot.chestLabel) || "").trim().toLowerCase();
    return CHEST_LABELS.find((l) => l.toLowerCase() === raw) || CHEST_LABELS[0];
  };

  // Fields that can exist only in the published copy, because they were
  // written into data.js directly rather than through the panel. "Local wins
  // by id" treats a device's copy of an album as the whole truth, which for
  // these means two silent failures at once: the field is invisible on the
  // one device that has a local copy — the studio's own — and the next
  // publish from that device removes it for everyone else too. Model type hit
  // exactly this. Both merges call this, and it is strictly additive: a value
  // actually set on a device always wins.
  function backfillPublishedOnlyFields(local, published) {
    if (!local || !published || local === published) return local;
    if (!modelTypesOf(local).length && modelTypesOf(published).length) {
      local.modelTypes = modelTypesOf(published);
    }
    if (!String(local.chestLabel || "").trim() && String(published.chestLabel || "").trim()) {
      local.chestLabel = published.chestLabel;
    }
    return local;
  }
  // On-screen chips. Shared by the album card and the lightbox so the two
  // never drift; the print surfaces have their own inline-styled version
  // because the PDF window carries none of this stylesheet.
  const modelTypeBadgesHtml = (shoot, style = "") => {
    const types = modelTypesOf(shoot);
    if (!types.length) return "";
    return `<div class="model-type-badges" style="${style}">${types.map((t) => `<span class="model-type-badge">${esc(modelTypeLabel(t))}</span>`).join("")}</div>`;
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
  const parseKavyarLink = (h) => {
    let clean = String(h ?? "").trim();
    if (!clean) return "";
    if (clean.includes("kavyar.com")) {
      try {
        let temp = clean;
        if (!temp.startsWith("http://") && !temp.startsWith("https://")) {
          temp = "https://" + temp;
        }
        const url = new URL(temp);
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length > 0) return "https://kavyar.com/" + parts[0];
      } catch {
        const segments = clean.split("/").filter(Boolean);
        const last = segments[segments.length - 1] || clean;
        return "https://kavyar.com/" + last;
      }
    }
    return "https://kavyar.com/" + clean.replace(/^@/, "");
  };
  // Which platform does a raw handle string belong to?
  const isIgHandle = (s) => !s.includes("kavyar.com") && (s.startsWith("@") || s.includes("instagram.com"));
  const isKavyarHandle = (s) => s.includes("kavyar.com");
  // Comp cards may inherit handles for the whole crew; narrow the list down to
  // the model's own. Preference order: handles inlined in the talent field's
  // parentheses → handles containing the model's name → first handle.
  function compCardOwnHandles(shoot, handles, isPlatformHandle) {
    if (!shoot.isCompCard) return handles;
    if (!handles.length) return handles; // nothing to narrow down — avoid falling through to [handles[0]] === [undefined]
    const talentNameLower = getTalentCleanName(shoot.talent).toLowerCase();
    const words = talentNameLower.split(/\s+/).filter(w => w.length > 2);
    const talentMatch = shoot.talent.match(/\(([^)]+)\)/);
    if (talentMatch) {
      const inline = talentMatch[1].split(";").map(s => s.trim()).filter(Boolean).filter(isPlatformHandle);
      return inline.length ? inline : handles;
    }
    if (words.length) {
      const matched = handles.filter(h => {
        const hClean = h.toLowerCase().replace(/[^a-z0-9]/g, "");
        return words.some(word => hClean.includes(word));
      });
      return matched.length ? matched : [handles[0]];
    }
    return [handles[0]];
  }

  /* ============================================================
     §5 · SHOOT HELPERS
     ============================================================ */
  const isFutureShoot = (s) => {
    if (!s.date) return false;
    const t = Date.parse(s.date);
    if (isNaN(t)) return false;
    const todayTime = new Date().setHours(0, 0, 0, 0);
    const shootTime = new Date(t).setHours(0, 0, 0, 0);
    return shootTime > todayTime;
  };
  function getAllTestimonials() {
    const list = [];
    SHOOTS.forEach(s => {
      if (s.isTestimonial) {
        list.push({
          quote: s.description || "",
          by: getTalentCleanName(s.talent) || "Anonymous",
          meta: s.brand || "",
          season: s.season || "",
          shootId: s.id,
          shootTitle: s.title
        });
      } else if (s.testimonials && s.testimonials.length) {
        s.testimonials.forEach(t => {
          list.push({
            quote: t.quote || "",
            by: t.by || "Anonymous",
            meta: s.brand === "Personal Project" ? "" : s.brand,
            season: s.season || "",
            shootId: s.id,
            shootTitle: s.title
          });
        });
      }
    });
    return list;
  }

  /* ============================================================
     §6 · ADMIN MODE & VIEW CONTEXT
     ============================================================ */
  // ?admin=1 reveals the (passcode-gated) admin UI; ?admin=0 locks it again
  // and clears stored credentials. Both the search query and hash-routing
  // params are honoured. Called first thing at boot.
  // SECURITY: the old &pat=<token> URL parameter was removed on purpose —
  // tokens in URLs leak via browser history, logs and screenshots. The
  // GitHub token is only ever entered via the sync prompt now.
  function applyAdminUrlParams() {
    const fullUrlString = window.location.search + window.location.hash;
    const adminMatch = fullUrlString.match(/[?&]admin=([01])\b/);
    if (!adminMatch) return;
    if (adminMatch[1] === "1") {
      localStorage.setItem("wps-admin-authorized", "1");
    } else {
      localStorage.removeItem("wps-admin-authorized");
      localStorage.removeItem("wps-admin");
      localStorage.removeItem("wps-github-pat");
      // isAdmin() actually reads the session flag below, not localStorage's
      // "wps-admin" — without clearing it too, ?admin=0 then ?admin=1 in the
      // same tab silently restored full admin with no passcode re-entry.
      sessionStorage.removeItem("wps-admin");
    }
  }

  // SHA-256 hex digest (secure contexts: https or localhost, fallback to pure-JS).
  async function sha256Hex(text) {
    if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
      try {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
      } catch (e) {
        // fallback
      }
    }
    return sha256HexFallback(String(text));
  }

  function sha256HexFallback(str) {
    // UTF-8 encode first: the loop below packs 1 char = 1 byte, which is only
    // correct for code points 0-255. Without this, a passcode with any
    // non-Latin1 character hashes differently here than via the WebCrypto
    // path (or Node's crypto on the server), silently locking that passcode
    // out on non-secure origins where this fallback is the only one used.
    str = unescape(encodeURIComponent(str));
    function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
    function s0(x) { return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x); }
    function s1(x) { return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x); }
    function g0(x) { return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3); }
    function g1(x) { return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10); }

    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    var ascii = str + '\x80';
    var asciiLength = str.length * 8;
    while (ascii.length % 64 !== 56) ascii += '\x00';
    
    var words = [];
    for (var i = 0; i < ascii.length; i++) {
      words[i >> 2] |= ascii.charCodeAt(i) << (24 - (i % 4) * 8);
    }
    
    words.push(0);
    words.push(asciiLength);

    for (var chunk = 0; chunk < words.length; chunk += 16) {
      var w = words.slice(chunk, chunk + 16);
      while (w.length < 64) w.push(0);
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], j = h[7];

      for (var t = 0; t < 64; t++) {
        if (t >= 16) {
          w[t] = (g1(w[t - 2]) + w[t - 7] + g0(w[t - 15]) + w[t - 16]) | 0;
        }
        var T1 = (j + s1(e) + ((e & f) ^ (~e & g)) + k[t] + (w[t] || 0)) | 0;
        var T2 = (s0(a) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        j = g;
        g = f;
        f = e;
        e = (d + T1) | 0;
        d = c;
        c = b;
        b = a;
        a = (T1 + T2) | 0;
      }

      h[0] = (h[0] + a) | 0;
      h[1] = (h[1] + b) | 0;
      h[2] = (h[2] + c) | 0;
      h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0;
      h[5] = (h[5] + f) | 0;
      h[6] = (h[6] + g) | 0;
      h[7] = (h[7] + j) | 0;
    }

    var result = '';
    for (var i = 0; i < 8; i++) {
      var s = h[i] >>> 0;
      result += s.toString(16).padStart(8, '0');
    }
    return result;
  }

  // Verify an entered admin passcode. Preferred: compare its SHA-256 hash to
  // STUDIO_CONFIG.adminPasscodeHash, so no readable passcode ships with the
  // site's public source. A plaintext adminPasscode is honoured only as a
  // legacy fallback for older configs; there is no built-in default.
  async function verifyAdminPasscode(code) {
    if (!code) return false;
    const cfg = window.STUDIO_CONFIG || {};
    if (cfg.adminPasscodeHash) {
      try { return (await sha256Hex(code)) === String(cfg.adminPasscodeHash).toLowerCase(); }
      catch { return false; }
    }
    if (cfg.adminPasscode) return code === cfg.adminPasscode;
    return false;
  }

  const shouldShowWorkshopsToAll = () => {
    const workshops = SHOOTS.filter(s => s.type === "Workshop Attended");
    return workshops.length >= 1;
  };

  const isAdminAuthorized = () => localStorage.getItem("wps-admin-authorized") === "1";
  const isAdmin = () => isAdminAuthorized() && sessionStorage.getItem("wps-admin") === "1";
  
  // Both detectors also answer for /share/… links, because a shared comp card
  // is the same album seen through a different URL: without this it rendered
  // stripped of the stats, socials and model-type badges that are the whole
  // point of sending someone a comp card.
  const sharedAlbumSegment = () => {
    const path = location.pathname.replace(/\/index\.html$/, "");
    if (!/^\/share(\/|$)/.test(path)) return "";
    const raw = new URLSearchParams(location.search).get("a") || (path.match(/^\/share\/([^/]+)/) || [])[1] || "";
    try { return decodeURIComponent(raw); } catch { return raw; }
  };

  function isCurrentlyCompCardView() {
    const search = location.pathname + location.search;
    const decoded = decodeURIComponent(search).replace(/\+/g, " ");
    if (sharedAlbumSegment().startsWith("comp-card-")) return true;
    return search.includes("categories") && (
      search.includes("Comp%20Cards") || decoded.includes("Comp Cards") ||
      search.includes("Test%20Shoot") || decoded.includes("Selective Collaboration (TFP)") || search.includes("Test+Shoot")
    );
  }

  function isCurrentlyModelPortfolioView() {
    const search = location.pathname + location.search;
    const decoded = decodeURIComponent(search).replace(/\+/g, " ");
    if (sharedAlbumSegment().startsWith("portfolio-")) return true;
    return search.includes("categories") && (
      search.includes("Model%20Portfolio") || decoded.includes("Model Portfolio")
    );
  }

  /* ============================================================
     §7 · PERSISTENCE — INDEXEDDB (shoots)
     ============================================================ */
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
  // Persistent local deletion tombstones. Removing the album from IndexedDB
  // and the in-memory list only covers this session: on the next load a stale
  // data.js (GitHub Pages caches it ~10 min) merges the album straight back,
  // and it stays until that cache turns over. The tombstone survives reloads,
  // filters the album out of every merge, and rides along on the next sync
  // into the published DELETED_IDS list so other devices retire it too.
  const LOCAL_TOMBSTONES_KEY = "wps-deleted-shoot-ids";
  function localTombstones() {
    try {
      const a = JSON.parse(localStorage.getItem(LOCAL_TOMBSTONES_KEY) || "[]");
      return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
    } catch { return []; }
  }
  function rememberDeletedShoot(id) {
    try {
      const set = new Set(localTombstones());
      set.add(id);
      localStorage.setItem(LOCAL_TOMBSTONES_KEY, JSON.stringify([...set]));
    } catch { /* private mode / quota — the in-memory + sync paths still cover it */ }
  }
  async function delShoot(id) {
    rememberDeletedShoot(id);
    // Also drop it from the in-memory published list — loadShoots() merges
    // published shoots back in, so without this a just-deleted album would
    // resurrect on the very next render until the deletion syncs to GitHub.
    const pub = window.WPS_DATA && window.WPS_DATA.DEMO_SHOOTS;
    if (Array.isArray(pub)) {
      const i = pub.findIndex(s => s && s.id === id);
      if (i !== -1) pub.splice(i, 1);
    }
    const d = await db();
    return new Promise((res, rej) => { const tx = d.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  }

  /* ============================================================
     §8 · APP STATE
     ============================================================ */
  let SHOOTS = [];      // live shoots (real or demo)
  let usingDemo = true;
  let CURRENT_VIEW_SHOOTS = [];
  // Resolves once boot() has loaded shoots and painted the first render (or
  // given up trying to) — the magic download link waits on this instead of a
  // fixed timeout, so it can't fire before SHOOTS is actually populated on a
  // slow connection, nor need to guess how long that will take.
  let resolveBootReady;
  const bootReady = new Promise((res) => { resolveBootReady = res; });

  async function loadShoots() {
    let real = [];
    try { real = await allShoots(); }
    catch { real = []; }
    
    const parseShootDate = (s) => {
      if (!s || !s.date) return (s && s.createdAt) || 0;
      const t = Date.parse(s.date);
      return isNaN(t) ? ((s && s.createdAt) || 0) : t;
    };
    
    const demoList = (window.WPS_DATA && window.WPS_DATA.DEMO_SHOOTS) || window.DEMO_SHOOTS || [];
    const validReal = real.filter(s => s && Array.isArray(s.photos) && s.photos.length > 0);
    usingDemo = validReal.length === 0;
    // Merge published (data.js) and local (IndexedDB) shoots by id, local
    // winning, instead of showing one list XOR the other: a browser holding a
    // stale subset locally must never hide albums that are published for
    // everyone else. True demo placeholders (s.demo) still vanish as soon as
    // any real shoot exists.
    const mergedById = new Map();
    demoList.forEach(s => { if (s && s.id && (usingDemo || !s.demo)) mergedById.set(s.id, s); });
    validReal.forEach(s => { if (s && s.id) mergedById.set(s.id, s); });
    // Published-only fields survive a device's local copy of the album — see
    // backfillPublishedOnlyFields. Without this the studio's own browser is
    // the one place they never appear.
    demoList.forEach((pub) => {
      if (pub && pub.id) backfillPublishedOnlyFields(mergedById.get(pub.id), pub);
    });
    // Deleted albums stay deleted: drop every id tombstoned either in the
    // published data.js (DELETED_IDS) or locally on this device — otherwise
    // the merge above would resurrect a deleted album from whichever side
    // still has a stale copy (cached data.js, another device's IndexedDB).
    const gone = new Set([...((window.WPS_DATA && window.WPS_DATA.DELETED_IDS) || []), ...localTombstones()]);
    gone.forEach(id => mergedById.delete(id));
    const shootsSource = [...mergedById.values()];

    const sorted = [...shootsSource].sort((a, b) => parseShootDate(b) - parseShootDate(a));
    
    if (isAdmin()) {
      SHOOTS = sorted;
    } else {
      SHOOTS = sorted.filter(s => s && !isFutureShoot(s) && s.isPublic !== false);
    }
    if (typeof syncCalendarWithShoots === "function") syncCalendarWithShoots();
  }

  /* ============================================================
     §9 · GITHUB SYNC
     Publishes the portfolio into the repo so every visitor sees it.
     - Merges per-shoot with what's already in data.js (local wins by id),
       so publishing from one device can't wipe another device's shoots.
     - Uploads photos as real image files under photos/ and stores only
       their paths in data.js, keeping data.js small and images cacheable.
     - Writes everything as one atomic commit via the git data API.
     ============================================================ */
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

  // Pull a JSON array out of a data.js source string. Anchors on the quoted
  // JSON key inside WPS_DATA — never a bare identifier like the trailing
  // window.* alias lines (whose `|| []` literal is what a lastIndexOf-based
  // parse used to pick up, reading a full portfolio as empty) — and finds
  // the array's end by string-aware bracket matching instead of trusting
  // whatever "]" happens to be last in the file.
  function parseArrayAfterKey(text, quotedKey) {
    try {
      const key = text.indexOf(quotedKey);
      if (key === -1) return null;
      const start = text.indexOf("[", key);
      if (start === -1) return null;
      let depth = 0, inString = false, escaped = false;
      for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (escaped) { escaped = false; continue; }
        if (c === "\\") { escaped = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === "[") depth++;
        else if (c === "]" && --depth === 0) {
          const arr = JSON.parse(text.slice(start, i + 1));
          return Array.isArray(arr) ? arr : null;
        }
      }
      return null;
    } catch { return null; }
  }
  function parseShootsFromDataJs(text) {
    return parseArrayAfterKey(text, '"DEMO_SHOOTS"');
  }
  // Published deletion tombstones. A data.js from before tombstones existed
  // has no DELETED_IDS key — that is a valid empty list, not a parse failure.
  function parseDeletedIdsFromDataJs(text) {
    if (text.indexOf('"DELETED_IDS"') === -1) return [];
    const arr = parseArrayAfterKey(text, '"DELETED_IDS"');
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  }

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
      return { shoots: [], deletedIds: [] }; // repo reachable, data.js genuinely not published yet
    }
    if (!res.ok) throw new Error(`Could not read the published data.js (GitHub ${res.status}) — aborting to avoid overwriting other devices' shoots.`);
    const text = await res.text();
    const parsed = parseShootsFromDataJs(text);
    if (parsed === null) throw new Error("Could not parse the published data.js — aborting to avoid overwriting other devices' shoots.");
    return { shoots: parsed, deletedIds: parseDeletedIdsFromDataJs(text) };
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
              ...(small ? { small } : {}),
              ...(medium ? { medium } : {}),
              ...(p.caption ? { caption: p.caption } : {}),
              ...(typeof p.focalX === "number" ? { focalX: p.focalX, focalY: p.focalY } : {})
            }
          : p;
        }),
      }));
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
window.WPS_DATA = ${JSON.stringify({ ACTIVITIES, TYPES, BRANDS, DEMO_SHOOTS: published, DELETED_IDS: [...removed].sort(), CALENDAR_SETTINGS: (window.WPS_DATA && window.WPS_DATA.CALENDAR_SETTINGS) || {},
        // Invite codes, promo codes and package rates used to live only in the
        // admin device's localStorage, which no visitor can read: a code
        // created in the panel worked for the studio and was rejected as
        // invalid for every client, and price edits never reached the booking
        // form. Publishing them here is what makes them real for everyone.
        INVITE_CODES: (typeof window.getAdminInviteCodes === "function" ? window.getAdminInviteCodes() : []),
        PROMO_CODES: (typeof window.getAdminPromoCodes === "function" ? window.getAdminPromoCodes() : {}),
        PACKAGES: (typeof window.getAdminPackages === "function" ? window.getAdminPackages() : []),
        TFP_PACKAGE: (typeof window.getAdminTfpPackage === "function" ? window.getAdminTfpPackage() : null),
        HOME_STUDIO_RATE: (typeof window.getHomeStudioRate === "function" ? window.getHomeStudioRate() : 3000),
        // Only published when the studio actually set a separate collaboration
        // rate; null keeps test shoots on the paid rate for every visitor.
        HOME_STUDIO_RATE_TFP: (function() {
          try {
            const v = localStorage.getItem("wps_home_studio_rate_tfp");
            if (v !== null && v !== "") {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n >= 0) return n;
            }
            const pub = window.WPS_DATA && window.WPS_DATA.HOME_STUDIO_RATE_TFP;
            return (typeof pub === "number" && pub >= 0) ? pub : null;
          } catch(e) { return null; }
        })() }, null, 2)};

// Explicit Global Aliases for Data Safety
window.ACTIVITIES = window.WPS_DATA.ACTIVITIES || [];
window.TYPES = window.WPS_DATA.TYPES || [];
window.BRANDS = window.WPS_DATA.BRANDS || [];
window.DEMO_SHOOTS = window.WPS_DATA.DEMO_SHOOTS || [];
window.SHOOTS = window.WPS_DATA.DEMO_SHOOTS || [];
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

  // The pricing/codes panel lives outside this scope, so without an exposed
  // handle its Save button could only ever write to this device — which is how
  // a rate edit came to announce "saved to live site" while every client kept
  // being quoted the old price. Returns whether the publish actually landed so
  // the caller can tell the truth about it.
  window.publishStudioDataToLiveSite = () => syncToGitHub(SHOOTS);

  /* ============================================================
     §10 · LIGHTBOX
     Fullscreen viewer: credits/stats sidebar, angle filters (Model
     Portfolio view), keyboard + touch navigation, focus handling.
     ============================================================ */
  const lb = $("#lightbox"), lbImg = $("#lightboxImg"), lbSidebar = $("#lightboxSidebar"), lbCount = $("#lbCounter");
  let lbList = [], lbIdx = 0, lbReturnFocus = null;
  
  window.toggleLbDiagram = () => {
    const el = document.getElementById("lbDiagramImg");
    if (el) {
      el.style.display = el.style.display === "none" ? "block" : "none";
    }
  };
  function renderLbSidebar(p) {
    const shoot = SHOOTS.find(x => x.id === p.shootId) || p.shoot;
    if (!shoot) return "";
    const isCc = (shoot.type === "Selective Collaboration (TFP)" || shoot.type === "Test Shoot" || shoot.isCompCard) && (isCurrentlyCompCardView() || isCurrentlyModelPortfolioView());
    
    // Parse social handle
    let igHtml = "";
    if (shoot.instagram && shouldShowField(shoot, "Instagram")) {
      const handles = compCardOwnHandles(shoot, shoot.instagram.split(",").map(x => x.trim()).filter(Boolean), isIgHandle);
      if (handles.length) {
        const links = handles.map(h => {
          let url = h;
          let label = h;
          if (!/^https?:\/\//i.test(h)) {
            const clean = h.replace(/^@/, "");
            url = `https://instagram.com/${clean}`;
            label = `@${clean}`;
          } else {
            try {
              const urlObj = new URL(h);
              const cleanPath = urlObj.pathname.replace(/^\/|\/$/g, "");
              if (cleanPath && !cleanPath.includes("/")) {
                label = `@${cleanPath}`;
              } else {
                label = `@${cleanPath.split("/").pop() || h}`;
              }
            } catch {
              label = h;
            }
          }
          return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: none; margin-right: 14px; display: inline-block;">${esc(label)}</a>`;
        }).join("");
        igHtml = links;
      }
    }

    let kavyarHtml = "";
    if (shoot.kavyar && shouldShowField(shoot, "Kavyar")) {
      const handles = compCardOwnHandles(shoot, shoot.kavyar.split(",").map(x => x.trim()).filter(Boolean), isKavyarHandle);
      if (handles.length) {
        const links = handles.map(h => {
          let url = h;
          let label = h;
          if (!/^https?:\/\//i.test(h)) {
            url = `https://kavyar.com/${h}`;
            label = `Kavyar: ${h}`;
          } else {
            try {
              const urlObj = new URL(h);
              const cleanPath = urlObj.pathname.replace(/^\/|\/$/g, "");
              label = `Kavyar: ${cleanPath.split("/").pop() || h}`;
            } catch {
              label = "Kavyar";
            }
          }
          return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: none; margin-right: 14px; display: inline-block;">${esc(label)}</a>`;
        }).join("");
        kavyarHtml = links;
      }
    }

    // Which book the model is cast from. Deliberately outside the stats HUD
    // below and outside its "Show stats" toggle: hiding a model's
    // measurements is a privacy choice, but the kind of work they model for
    // is the headline of the card and stays visible either way.
    const modelTypeHtml = isCc ? modelTypeBadgesHtml(shoot, "margin-bottom: 14px;") : "";
    // Current representation — on a unified comp card this is the newest
    // album's agency (buildCompCardDisplayList picks it newest-first), so a
    // model who moved agencies between shoots shows where they are now.
    const repRows = [];
    if (isCc && shoot.agency && showRep(shoot, "Agency", "CompCard")) {
      const agSub = visibleAgencyLinks(shoot, "CompCard").map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}${l.kind === "email" ? "" : " ↗"}</a>`).join("");
      repRows.push(`<div class="lb-credit"><dt>Agency</dt><dd><span class="lb-person">${esc(shoot.agency)}</span>${agSub ? `<span class="lb-person lb-person-sub">${agSub}</span>` : ""}</dd></div>`);
    }
    // Strictly opt-in, even for admins: it is the model's personal email.
    if (isCc && shoot.modelEmail && showRep(shoot, "Email", "CompCard")) {
      repRows.push(`<div class="lb-credit"><dt>Email</dt><dd><span class="lb-person"><a href="mailto:${esc(shoot.modelEmail)}">${esc(shoot.modelEmail)}</a></span></dd></div>`);
    }
    const agencyHtml = repRows.length ? `<dl class="lb-credits lb-credits-top">${repRows.join("")}</dl>` : "";

    // Agency Model Stats HUD Card (Album Space #4 Redesign with Smart Fallback)
    let statsHtml = "";
    const hasStats = shoot.height || shoot.chest || shoot.waist || shoot.hips || shoot.shoes || shoot.modelHair || shoot.modelEyes;
    const statsAllowedHere = isCurrentlyModelPortfolioView() ? shoot.showStatsOnModelPortfolio !== false : shoot.showStatsOnCompCard !== false;
    if (isCc && hasStats && statsAllowedHere) {
      const statItems = [
        ["Height", shoot.height],
        [chestLabelOf(shoot), shoot.chest],
        ["Waist", shoot.waist],
        ["Hips", shoot.hips],
        ["Shoes", shoot.shoes],
        ["Hair", shoot.modelHair],
        ["Eyes", shoot.modelEyes]
      ].filter(([, v]) => v).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`);
      statsHtml = `
        <div class="lb-sidebar-section lb-card lb-stats-card">
          <div class="lb-h"><span>Measurements</span></div>
          <dl class="lb-stats">${statItems.join("")}</dl>
        </div>
      `;
    }

    let angleHtml = "";
    let filterBarHtml = "";
    if (isCurrentlyModelPortfolioView()) {
      if (p.angle) {
        const labels = {
          "front": "Front Portrait",
          "full-body": "Full Body Shot",
          "left-profile": "Left Profile",
          "right-profile": "Right Profile",
          "back": "Back Angle",
          "three-quarter": "3/4 Angle",
          "close-up": "Close-up / Headshot"
        };
        const label = labels[p.angle] || p.angle;
        angleHtml = `
          <div style="margin-top: 8px;">
            <span style="font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); font-weight: 700; color:var(--accent); background:rgba(210,78,26,0.1); border: 1px solid var(--accent); padding: 4px 8px; border-radius: 4px; text-transform: uppercase; display: inline-block;">
              ${esc(label)}
            </span>
          </div>
        `;
      }
      
      const anglesInShoot = [...new Set((shoot.photos || []).map(x => x.angle).filter(Boolean))];
      if (anglesInShoot.length > 0) {
        const labels = {
          "front": "Front",
          "full-body": "Full Body",
          "left-profile": "Left Profile",
          "right-profile": "Right Profile",
          "back": "Back",
          "three-quarter": "3/4",
          "close-up": "Close-up"
        };
        filterBarHtml = `
          <div class="lb-sidebar-section" style="border-top: 1px solid var(--line); padding-top: 16px; margin-top: 16px;">
            <span class="eyebrow" style="font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); text-transform:uppercase; color:var(--ink-soft); display:block; margin-bottom: 8px;">Filter Portfolio</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="angle-filter-btn ${window.activeAngleFilter === 'all' ? 'active' : ''}" data-angle="all" style="font-family:inherit; font-size: var(--font-xs); font-weight:700; padding:4px 8px; border-radius:4px; border:1px solid var(--line); background:${window.activeAngleFilter === 'all' ? 'var(--accent)' : 'var(--paper)'}; color:${window.activeAngleFilter === 'all' ? '#fff' : 'var(--ink)'}; cursor:pointer;">All</button>
              ${anglesInShoot.map(ang => {
                const isActive = window.activeAngleFilter === ang;
                return `<button class="angle-filter-btn ${isActive ? 'active' : ''}" data-angle="${ang}" style="font-family:inherit; font-size: var(--font-xs); font-weight:700; padding:4px 8px; border-radius:4px; border:1px solid var(--line); background:${isActive ? 'var(--accent)' : 'var(--paper)'}; color:${isActive ? '#fff' : 'var(--ink)'}; cursor:pointer;">${labels[ang] || ang}</button>`;
              }).join("")}
            </div>
          </div>
        `;
      }
    }

    // Credits as one definition list: the role on the left, the people on the
    // right. Models first, then the crew, then where it was shot.
    const isCcPage = !!shoot.isCompCard;
    const groups = [];
    const addGroup = (label, val, opts = {}) => {
      if (!val || val === "—") return;
      const items = String(val).split(",").map(x => x.trim()).filter(Boolean);
      if (!items.length) return;
      const rendered = items.map(item => {
        let html = isCcPage ? esc(getTalentCleanName(item)) : (opts.plain ? renderCreditsValue(item) : renderCreditValue(item));
        // A model line with no link of its own borrows the album's handle.
        if (opts.attachIg && igHtml && !html.includes("href=") && !html.includes("@")) html += ` <span class="lb-ig">${igHtml}</span>`;
        return `<span class="lb-person">${html}</span>`;
      });
      groups.push({ label: (items.length > 1 && opts.plural) ? opts.plural : label, rendered });
    };
    const hasTalent = !!(shoot.talent && shoot.talent !== "—");
    if (hasTalent) addGroup("Model", shoot.talent, { plural: "Models", attachIg: true });
    if (shoot.photographer || shoot.secondaryPhotographers) addGroup("Photography", [shoot.photographer, shoot.secondaryPhotographers].filter(Boolean).join(", "));
    if (shoot.mentor) addGroup("Mentor", shoot.mentor, { plural: "Mentors" });
    if (shoot.artDirector) addGroup("Art direction", shoot.artDirector);
    if (shoot.stylist) addGroup("Styling", shoot.stylist);
    if (shoot.hair) addGroup("Hair", shoot.hair);
    if (shoot.mua) addGroup("Makeup", shoot.mua);
    if (shoot.videographer) addGroup("Video", shoot.videographer);
    if (shoot.credits && shouldShowField(shoot, "Credits")) addGroup("Also", shoot.credits, { plain: true });
    // Where it was shot, with the studio's own profiles on the same row. The
    // links are named by platform: the Kavyar URL ends in a random id, so
    // there is no handle worth showing there.
    const cfg = window.STUDIO_CONFIG || {};
    const studioLinkHtml = (href, platform) =>
      `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${esc(cfg.studioName || "the studio")} on ${platform}" aria-label="${esc(cfg.studioName || "the studio")} on ${platform} (opens in a new tab)">${platform} ↗</a>`;
    const locBits = [];
    if (shoot.location && shoot.location !== "—") locBits.push(`<span class="lb-person">${renderCreditLinks(shoot.location)}</span>`);
    const studioLinks = [];
    if (cfg.instagram) studioLinks.push(studioLinkHtml(cfg.instagram, "Instagram"));
    if (cfg.kavyar) studioLinks.push(studioLinkHtml(cfg.kavyar, "Kavyar"));
    if (studioLinks.length) locBits.push(`<span class="lb-person lb-studio-links">${studioLinks.join("")}</span>`);
    if (locBits.length) groups.push({ label: "Location", rendered: locBits });
    // The model's own handles, unless the model line already links out.
    const modelLinked = hasTalent && groups[0] && groups[0].rendered.some(r => r.includes("href="));
    if ((igHtml || kavyarHtml) && !modelLinked) {
      groups.push({ label: "Socials", rendered: [igHtml, kavyarHtml].filter(Boolean).map(h => `<span class="lb-person">${h}</span>`) });
    }
    if (shoot.pdfUrl && shouldShowField(shoot, "Pdf")) {
      groups.push({ label: "Publication", rendered: [`<span class="lb-person"><a href="${esc(shoot.pdfUrl)}" download>Download PDF ↗</a></span>`] });
    }
    // One model on the album and a comp card exists for them: point at it.
    // The share link is the same slug form the Share button hands out.
    const soloModel = hasTalent && shoot.talent.split(",").map(x => x.trim()).filter(Boolean).length === 1;
    if (soloModel && !isCcPage && qualifiesAsCompCard(shoot) && !shoot.hideFromCompCard) {
      const modelName = getTalentCleanName(shoot.talent);
      const slug = slugify(modelName);
      if (slug) groups.push({ label: "Comp card", rendered: [`<span class="lb-person"><a href="/share/?a=comp-card-${encodeURIComponent(slug)}">View ${esc(modelName)}’s comp card ↗</a><small class="lb-person-note">Free to view and download as a PDF.</small></span>`] });
    }
    const creditRows = (list) => `<dl class="lb-credits">${list.map(g => `<div class="lb-credit"><dt>${esc(g.label)}</dt><dd>${g.rendered.join("")}</dd></div>`).join("")}</dl>`;
    const creditsHtml = groups.length ? creditRows(groups) : "";
    // Lighting diagram
    let diagHtml = "";
    if (shoot.lightingDiagram && (shoot.lightingDiagramVisibility === "public" || isAdmin())) {
      diagHtml = `
        <div class="lb-sidebar-section" style="margin-top: 10px;">
          <button class="btn btn-ghost btn-block" style="font-size: var(--font-xs); height: auto; padding: 8px;" onclick="window.toggleLbDiagram()">
            View Lighting Setup
          </button>
          <div id="lbDiagramImg" style="display:none; margin-top:12px; border:1px solid var(--line); padding:10px; background:var(--bone); border-radius:4px;">
            <img src="${esc(shoot.lightingDiagram)}" style="max-width:100%; height:auto;" alt="Lighting setup" />
          </div>
        </div>
      `;
    }

    let pdfBtnHtml = "";
    if (isCc && !isCurrentlyModelPortfolioView()) {
      if (!shoot.disableCompCardDownload) {
        window.currentCompCardShootObj = shoot;
        // Orientation choice is kept per-shoot (not a single global), so
        // picking Landscape for one model and then opening another — or just
        // stepping to that model's next photo — doesn't silently carry the
        // choice over: the toggle shown always matches what Export will
        // actually produce for THIS model.
        const currentOrient = (window.compCardOrientationByShoot && window.compCardOrientationByShoot[shoot.id]) || "portrait";
        const isPortraitActive = currentOrient !== "landscape";
        pdfBtnHtml = `
          <div class="lb-sidebar-section lb-card lb-export">
            <div class="lb-export-head">
              <span class="lb-h" style="margin: 0;"><span>Comp card PDF</span></span>
              <div class="lb-seg" id="compCardOrientGroup" role="radiogroup" aria-label="PDF orientation">
                <label class="orient-radio-label${isPortraitActive ? " active" : ""}">
                  <input type="radio" name="compCardOrientRadio" value="portrait" ${isPortraitActive ? "checked" : ""} onchange="window.setCompCardOrientation('portrait', this, '${escJs(shoot.id)}')" />
                  <span>Portrait</span>
                </label>
                <label class="orient-radio-label${!isPortraitActive ? " active" : ""}">
                  <input type="radio" name="compCardOrientRadio" value="landscape" ${!isPortraitActive ? "checked" : ""} onchange="window.setCompCardOrientation('landscape', this, '${escJs(shoot.id)}')" />
                  <span>Landscape</span>
                </label>
              </div>
            </div>
            <button class="btn btn-dark btn-block lb-export-btn" onclick="window.triggerCompCardDownload('${escJs(shoot.id)}')">Export comp card PDF</button>
            <p class="lb-note">Supporting photos are picked at random from every photo tagged to this model, so each export is a little different.</p>
          </div>
        `;
      } else if (isAdmin()) {
        pdfBtnHtml = `
          <div class="lb-sidebar-section lb-note lb-note-admin">Comp card PDF download is switched off for this model (admin only sees this)
          </div>
        `;
      }
    } else if (isCc && isCurrentlyModelPortfolioView()) {
      // Open to any visitor viewing this model's portfolio (model, agency,
      // casting director) — the whole point of the template system is that
      // the model/agency builds and downloads their own PDF, not the studio.
      window.currentCompCardShootObj = shoot;
      pdfBtnHtml = `
        <div class="lb-sidebar-section" style="margin-top: 10px;">
          <button class="btn btn-dark btn-block lb-export-btn" onclick="window.printModelPortfolio('${escJs(shoot.id)}')">Export model portfolio PDF</button>
        </div>
      `;
    }
    const disclaimerHtml = isCc ? `
      <p class="lb-disclaimer">To book this talent, connect through their social channels or their representing agency. The photos on this comp card were made by nerdyphotographer.in or its affiliates.</p>
    ` : "";

    const metaBits = isCc ? [] : [
      shoot.activity ? `<div><dt>Activity</dt><dd>${esc(shoot.activity)}</dd></div>` : "",
      shoot.season ? `<div><dt>Season</dt><dd>${esc(shoot.season)}</dd></div>` : ""
    ].filter(Boolean);
    // Comp card panel: every social we have for the model, from the album
    // fields and the model credit alike (same list the PDF prints).
    const socialsHtml = (() => {
      const links = visibleModelLinks(shoot, "CompCard");
      if (!links.length) return "";
      return creditRows([{ label: "Socials", rendered: links.map(l => `<span class="lb-person"><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}${l.kind === "email" ? "" : " ↗"}</a></span>`) }]);
    })();
    return `
      <div class="lb-panel">
        <header class="lb-head">
          <span class="eyebrow lb-eyebrow">${isCc ? "Model portfolio" : esc([shoot.brand, publicShootType(shoot)].filter(Boolean).join(" · "))}</span>
          <h2 class="lb-title">${esc(getTalentCleanName(shoot.talent || shoot.title))}</h2>
          ${angleHtml}
          ${modelTypeHtml}
          ${shoot.description ? `<p class="lb-desc">${esc(shoot.description)}</p>` : ""}
        </header>
        ${metaBits.length ? `<dl class="lb-meta">${metaBits.join("")}</dl>` : ""}
        ${isCc ? socialsHtml : ""}
        ${agencyHtml}
        ${statsHtml}
        ${filterBarHtml}
        ${isCc ? "" : creditsHtml}
        ${diagHtml}
        ${pdfBtnHtml}
        ${disclaimerHtml}
        ${(() => {
          if (!isAdmin()) return "";
          // Unified comp-card/portfolio "albums" are synthetic — they merge
          // several real shoots and their id doesn't exist in storage. Edit
          // and delete must target the REAL underlying shoots, so list one
          // row per original shoot (single-shoot albums get one plain row).
          const targets = (shoot.originalShoots && shoot.originalShoots.length) ? shoot.originalShoots : [shoot];
          // A model's shoots usually all carry the model's name as title, so
          // titles alone render as identical-looking duplicate rows. Label
          // each row with what actually distinguishes the shoots: season (or
          // date), activity, and photo count.
          const fmtDate = (t) => { const d = new Date(t.date); return isNaN(d) ? (t.season || t.date || "") : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
          const many = targets.length > 1;
          // Newest first, as the card itself orders them: the first row is the
          // album the agency, stats and socials are read from.
          const rows = targets.map((t, i) => `
              <div class="lb-admin-album">
                <div class="lb-admin-album-main">
                  <span class="lb-admin-album-name">${esc(t.title || t.talent || "Untitled")}</span>
                  <span class="lb-admin-album-meta">${esc(fmtDate(t))}${t.activity ? " · " + esc(t.activity) : ""} · ${(t.photos || []).length} photo${(t.photos || []).length === 1 ? "" : "s"}${many && i === 0 ? ' · <em>newest, supplies the details</em>' : ""}</span>
                </div>
                <div class="lb-admin-album-actions">
                  <button class="linkish work-edit" data-id="${t.id}">Edit details →</button>
                  <button class="linkish muted work-delete" data-id="${t.id}" data-title="${esc(t.title || t.talent || "")}${many ? ` — ${esc(fmtDate(t))}` : ""}">Delete →</button>
                </div>
              </div>`).join("");
          return `
            <div class="lb-sidebar-section lb-admin">
              <h4 class="lb-h"><span>Admin</span><small>${many ? `${targets.length} albums feed this card · ` : ""}only you see this</small></h4>
              ${rows}
            </div>
          `;
        })()}
      </div>
    `;
  }

  function openLb(list, idx) {
    window.activeAngleFilter = "all";
    lbReturnFocus = document.activeElement;
    lbList = list; lbIdx = idx; paintLb(); lb.hidden = false;
    document.body.style.overflow = "hidden"; $("#lightboxClose").focus();
    logShootView(list[idx]);
  }
  // Content-engagement signal for the Analytics tab: one record per shoot
  // opened in the lightbox (not per next/prev step within it), so the admin
  // can see which categories/shoots get looked at and shoot more of that
  // kind. No visitor identity is sent. Skips the admin's own browsing (that's
  // curation, not visitor interest) and demo/placeholder content.
  function logShootView(photo) {
    if (!photo || isAdmin()) return;
    const s = SHOOTS.find(x => x.id === photo.shootId) || photo.shoot;
    if (!s || s.demo) return;
    fetch(`${COMP_CARD_API_BASE}/api/views`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shootId: s.id,
        activity: s.activity || "",
        type: s.type || "",
        talent: s.talent || "",
        title: s.title || "",
      }),
    }).catch(() => {}); // best-effort — never blocks or affects the viewing experience
  }
  /* Stepping between photos used to assign lbImg.src directly, which makes the
     browser drop the photo on screen and render an EMPTY frame until the next
     one has downloaded and decoded — the flash/stutter on every next/prev.
     Instead: decode the next photo off-screen first, keep the current one
     visible meanwhile, and only then swap. Neighbours are prefetched so the
     common case (arrow/swipe through an album) is an instant swap.
     `lbPaintToken` discards a slow decode that a newer step has overtaken —
     without it, holding the arrow key down lands you on whichever photo
     happened to decode last rather than the one you stopped on. */
  const LB_SIZES = "100vw";
  let lbPaintToken = 0;

  function preloadLbNeighbours() {
    if (lbList.length < 2) return;
    [lbIdx + 1, lbIdx - 1].forEach((i) => {
      const p = lbList[(i + lbList.length) % lbList.length];
      const src = photoSrc(p);
      if (!src) return;
      const im = new Image();
      im.decoding = "async";
      const ss = srcsetValue(p);
      if (ss) { im.sizes = LB_SIZES; im.srcset = ss; }
      im.src = src;
    });
  }

  async function paintLbImage(p) {
    const token = ++lbPaintToken;
    const src = photoSrc(p);
    if (!src) return;
    const ss = srcsetValue(p);

    const apply = () => {
      if (token !== lbPaintToken) return false;   // a newer step won the race
      if (ss) { lbImg.sizes = LB_SIZES; lbImg.srcset = ss; }
      else { lbImg.removeAttribute("srcset"); lbImg.removeAttribute("sizes"); }
      lbImg.src = src;
      lbImg.alt = p.caption || altFor(p.shoot);
      lbImg.style.objectPosition = "center";
      return true;
    };

    const next = new Image();
    next.decoding = "async";
    if (ss) { next.sizes = LB_SIZES; next.srcset = ss; }
    next.src = src;

    // Already cached (the usual case once neighbours are prefetched): swap now,
    // no waiting and no loading state to flicker.
    if (next.complete) { apply(); preloadLbNeighbours(); return; }

    // Only show the loading state if the wait is long enough to notice —
    // flashing it on every cached step would be its own kind of jitter. An
    // already-decoded photo returns above and never reaches this timer.
    //
    // 140ms was too patient on a phone: a tap that lands mid-download gets no
    // acknowledgement at all for a seventh of a second, on top of however long
    // the photo itself takes, so the tap reads as ignored and gets repeated —
    // which skips a photo, because the first tap did register. 60ms is still
    // above the threshold where a cached-but-not-instant step would flicker.
    const slowTimer = setTimeout(() => {
      if (token === lbPaintToken) lb.classList.add("lb-loading");
    }, 60);

    try {
      if (next.decode) await next.decode();
      else await new Promise((res) => { next.onload = res; next.onerror = res; });
    } catch (e) {
      // Decode failed (broken/missing file) — swap anyway so the global image
      // error handler can retry and show its placeholder.
    }

    clearTimeout(slowTimer);
    if (apply()) lb.classList.remove("lb-loading");
    preloadLbNeighbours();
  }

  function paintLb() {
    const p = lbList[lbIdx]; if (!p) return;
    paintLbImage(p);
    lbSidebar.innerHTML = renderLbSidebar(p);
    lbCount.textContent = `${lbIdx + 1} / ${lbList.length}`;

    // Wire edit & delete buttons inside the lightbox sidebar if in admin mode.
    // Buttons carry data-id of the REAL underlying shoot (unified comp-card /
    // portfolio albums are synthetic and can't be edited or deleted directly).
    if (isAdmin()) {
      const shoot = SHOOTS.find(x => x.id === p.shootId) || p.shoot;
      if (shoot) {
        lbSidebar.querySelectorAll(".work-edit").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeLb();
            history.pushState(null, "", `/upload?edit=${btn.dataset.id || shoot.id}`);
            render();
          });
        });
        lbSidebar.querySelectorAll(".work-delete").forEach(btn => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const targetId = btn.dataset.id || shoot.id;
            const targetName = btn.dataset.title || shoot.title || shoot.talent;
            if (confirm(`Are you sure you want to delete the photoshoot "${targetName}"?`)) {
              closeLb();
              await delShoot(targetId);
              await loadShoots();
              toast(`Deleted "${targetName}".`);
              render();
              await syncToGitHub(SHOOTS, { deletedIds: [targetId] });
            }
          });
        });
      }
    }

    // Wire angle filter buttons for Model Portfolio view inside lightbox
    lbSidebar.querySelectorAll(".angle-filter-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const selectedAngle = btn.dataset.angle;
        window.activeAngleFilter = selectedAngle;
        
        // Find parent shoot to rebuild filtered list
        const currentShoot = SHOOTS.find(x => x.id === p.shootId) || p.shoot;
        const fullList = (currentShoot.photos || []).filter(x => {
          return x.usage === "portfolio" || x.usage === "both" || x.usage === undefined;
        }).map(x => ({ ...x, shoot: currentShoot }));
        
        let filteredList = fullList;
        if (selectedAngle !== "all") {
          filteredList = fullList.filter(x => x.angle === selectedAngle);
        }
        
        if (filteredList.length) {
          lbList = filteredList;
          lbIdx = 0;
          paintLb();
        } else {
          toast("No photos matching this profile.");
        }
      });
    });
  }
  function stepLb(d) { if (!lbList.length) return; lbIdx = (lbIdx + d + lbList.length) % lbList.length; paintLb(); }
  function closeLb() {
    lbPaintToken++;                 // cancel any decode still in flight
    lb.classList.remove("lb-loading");
    lb.hidden = true; lbImg.src = ""; document.body.style.overflow = "";
    // Return focus to the thumbnail/card that opened the viewer.
    if (lbReturnFocus && document.contains(lbReturnFocus)) { try { lbReturnFocus.focus(); } catch {} }
    lbReturnFocus = null;
  }
  function initLightbox() {
    // Simple focus trap: keep Tab within the lightbox while it's open.
    trapTabKey(lb, "button:not([disabled])");
    $("#lightboxClose").addEventListener("click", (e) => { e.stopPropagation(); closeLb(); });
    $("#lbPrev").addEventListener("click", (e) => { e.stopPropagation(); stepLb(-1); });
    $("#lbNext").addEventListener("click", (e) => { e.stopPropagation(); stepLb(1); });
    // Close only on a genuine backdrop click — never when the click lands on the
    // nav buttons, close button, image, caption, sidebar, or counter (or their children).
    lb.addEventListener("click", (e) => {
      if (e.target.closest(".lightbox-nav, .lightbox-close, .lightbox-figure, .lightbox-counter, .lightbox-sidebar, #lightboxSidebar, .lb-sidebar-section, .lightbox-main")) return;
      if (e.target === lb || e.target.classList.contains("lightbox")) {
        closeLb();
      }
    });
    document.addEventListener("keydown", (e) => { if (lb.hidden) return; if (e.key === "Escape") closeLb(); else if (e.key === "ArrowLeft") stepLb(-1); else if (e.key === "ArrowRight") stepLb(1); });

    // Touch swipe support for lightbox on mobile — scoped to the image/nav
    // area (.lightbox-main), not the whole overlay: attaching to `lb` meant a
    // diagonal scroll gesture inside the scrollable credits/stats sidebar
    // could register as a left/right swipe and jump to the next photo.
    let touchStartX = 0;
    let touchEndX = 0;
    let lastSwipeAt = 0;
    const lbMain = $(".lightbox-main") || lb;
    lbMain.addEventListener("touchstart", (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    lbMain.addEventListener("touchend", (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const diff = touchEndX - touchStartX;
      if (diff < -50) { lastSwipeAt = Date.now(); stepLb(1); }       // Swipe left -> Next
      else if (diff > 50) { lastSwipeAt = Date.now(); stepLb(-1); }  // Swipe right -> Prev
    }, { passive: true });

    // Tapping the photo itself steps it: right half forward, left half back.
    //
    // Until now the only ways forward on a phone were a >50px swipe or one of
    // two 44px arrows pinned to the screen edges — which is where iOS and
    // Android put their own back/forward edge gestures, so taps aimed at
    // "next" routinely hit nothing at all. Tapping the picture did nothing
    // either, so the photo appeared frozen and the tap got repeated. That is
    // the part a loading spinner could never fix: those taps were not slow,
    // they were never reaching a handler.
    //
    // The figure fills the viewport between the header and the caption, so
    // this turns nearly the whole screen into the control.
    const lbFigure = $(".lightbox-figure");
    if (lbFigure) {
      lbFigure.addEventListener("click", (e) => {
        // Never hijack a real control that happens to sit over the photo.
        if (e.target.closest("button, a, input, select, textarea")) return;
        // A swipe can still emit a click on touchend; without this the two
        // handlers would both fire and skip two photos per gesture.
        if (Date.now() - lastSwipeAt < 500) return;
        const r = lbFigure.getBoundingClientRect();
        if (!r.width) return;
        stepLb(e.clientX - r.left > r.width / 2 ? 1 : -1);
      });
    }
  }

  /* ============================================================
     §11 · SITE CHROME — overlay nav, admin & theme controls
     ============================================================ */
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
    // Focus management: into the menu on open, back to the button on close.
    if (o) {
      const firstLink = overlay.querySelector(".nav-links a");
      setTimeout(() => firstLink?.focus(), 60);
    } else if (document.activeElement && overlay.contains(document.activeElement)) {
      menuBtn.focus();
    }
  }
  // Global safety net for images that fail to load (a stale cache, a photo
  // that didn't publish, or a transient GitHub Pages hiccup). Rather than
  // leaving a browser "broken image" icon, retry once with a cache-bust and,
  // if it still fails, swap in a subtle inline placeholder so the layout holds.
  function initImageErrorHandling() {
    const PLACEHOLDER =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='500'>` +
        `<rect width='100%' height='100%' fill='#1a1917'/>` +
        `<g fill='none' stroke='#4a473f' stroke-width='6' stroke-linecap='round'>` +
        `<circle cx='200' cy='215' r='52'/><path d='M200 178v-16M200 268v16M163 215h-16M363-148'/>` +
        `<path d='M120 330h160'/></g>` +
        `<text x='50%' y='400' fill='#6b665c' font-family='monospace' font-size='18' text-anchor='middle'>image unavailable</text></svg>`
      );
    document.addEventListener(
      "error",
      (e) => {
        const img = e.target;
        if (!(img instanceof HTMLImageElement)) return;
        if (img.dataset.imgFallback) return; // already handled
        const original = img.currentSrc || img.src || "";
        // Don't retry the placeholder itself or non-http(s)/data sources.
        if (!original || original.startsWith("data:")) return;
        if (!img.dataset.imgRetried) {
          img.dataset.imgRetried = "1";
          const bust = (original.includes("?") ? "&" : "?") + "retry=" + Date.now();
          img.removeAttribute("srcset"); // force it to use the single retried src
          img.src = original.split("#")[0] + bust;
          return;
        }
        // Second failure — show the placeholder and stop.
        img.dataset.imgFallback = "1";
        img.removeAttribute("srcset");
        img.src = PLACEHOLDER;
        img.style.objectFit = "cover";
      },
      true // capture phase: img error events don't bubble
    );
  }

  function initNav() {
    menuBtn.addEventListener("click", () => toggleMenu());
    // Trap Tab within the open menu overlay.
    trapTabKey(overlay, "a[href], button:not([disabled])", () => overlay.classList.contains("open"));
    overlay.addEventListener("click", (e) => { if (e.target.closest("[data-link]")) toggleMenu(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.classList.contains("open")) toggleMenu(false); });
  }

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
    const active = isAdmin();
    const btnText = active ? "🔓 Admin Mode: On" : "🔒 Admin Mode: Off";
    const headerText = active ? "🔓 Admin: On" : "🔒 Admin: Off";

    const adminBtn = $("#adminModeBtn");
    if (adminBtn) {
      adminBtn.textContent = btnText;
      adminBtn.style.borderColor = active ? "var(--accent)" : "currentColor";
      adminBtn.style.color = active ? "var(--accent)" : "inherit";
    }

    const headerAdminBtn = $("#headerAdminBtn");
    if (headerAdminBtn) {
      headerAdminBtn.textContent = headerText;
      headerAdminBtn.style.borderColor = active ? "var(--accent)" : "currentColor";
      headerAdminBtn.style.color = active ? "var(--accent)" : "currentColor";
      headerAdminBtn.style.background = active ? "rgba(224, 73, 56, 0.15)" : "none";
    }

    const menuAdminBtnText = $("#menuAdminBtnText");
    if (menuAdminBtnText) {
      menuAdminBtnText.textContent = btnText;
    }

    const adminSec = $("#navAdminSec");
    if (adminSec) {
      adminSec.style.display = "block";
    }

    const uploadLi = $("#navUploadLi"), bookLi = $("#navBookLi"), compCardsLi = $("#navCompCardsLi"), portfolioLi = $("#navModelPortfolioLi"), workshopLi = $("#navWorkshopLi"), analyticsLi = $("#navAnalyticsLi"), calendarLi = $("#navCalendarLi");
    if (uploadLi) uploadLi.style.display = active ? "block" : "none";
    if (bookLi) bookLi.style.display = active ? "none" : "block";
    if (compCardsLi) compCardsLi.style.display = "block";
    if (portfolioLi) portfolioLi.style.display = active ? "block" : "none";
    if (workshopLi) workshopLi.style.display = "block"; // Always show Workshop in nav
    if (calendarLi) calendarLi.style.display = active ? "block" : "none";
    if (analyticsLi) analyticsLi.style.display = "none";

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

    updateAdminReminders();
  }

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

  function updateAdminReminders() {
    const active = isAdmin();
    let banner = $("#adminStickyReminderBar");

    if (!active) {
      if (banner) banner.style.display = "none";
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
      requestAnimationFrame(() => {
        const h = banner.offsetHeight;
        const hdr = document.querySelector(".site-header");
        if (hdr) hdr.style.top = h + "px";
        // Anything that sticks below the header (upload dropzone, albums
        // filter bar) reads this so it clears the banner too.
        document.documentElement.style.setProperty("--admin-banner-h", h + "px");
      });

      banner.querySelector("#viewNextShootBtn")?.addEventListener("click", () => {
        if (typeof window.openDateAdminModal === "function") {
          window.openDateAdminModal(nextShoot.dateKey);
        } else {
          location.href = "/calendar";
        }
      });
      banner.querySelector("#dismissReminderBtn")?.addEventListener("click", () => {
        banner.style.display = "none";
        const hdr = document.querySelector(".site-header");
        if (hdr) hdr.style.top = "";
        document.documentElement.style.removeProperty("--admin-banner-h");
      });
    } else if (banner) {
      banner.style.display = "none";
      const hdr = document.querySelector(".site-header");
      if (hdr) hdr.style.top = "";
      document.documentElement.style.removeProperty("--admin-banner-h");
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
            <strong style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm);">Upcoming Shoots (${upcoming.length})</strong>
            <div style="display: flex; gap: 12px; align-items: center;">
              <a href="/calendar" data-link style="font-family: var(--mono-font); font-size: var(--font-xs); color: var(--accent); font-weight: 700; text-decoration: none;">View Full Calendar &rarr;</a>
              <a href="/contracts" data-link style="font-family: var(--mono-font); font-size: var(--font-xs); color: #059669; font-weight: 700; text-decoration: none;">✅ Contracts &rarr;</a>
            </div>
          </div>
          ${upcoming.length ? upcoming.slice(0, 5).map(b => `
            <div style="padding: 8px; background: var(--bone); border-radius: 6px; border: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-family: var(--mono-font); font-size: var(--font-xs); color: var(--accent); font-weight: 700;">📅 ${esc(b.dateKey)} (${esc(b.dayLabel)})</div>
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

  function initAdminControls() {
    const toggleAdminModeState = async () => {
      const turningOn = !isAdmin();
      if (turningOn) {
        const code = prompt("Enter admin passcode to enable Admin Mode:");
        if (!code) return;
        if (!(await verifyAdminPasscode(code))) {
          alert("Incorrect passcode.");
          return;
        }
        localStorage.setItem("wps-admin-authorized", "1");
      }
      sessionStorage.setItem("wps-admin", turningOn ? "1" : "0");
      await loadShoots();
      updateAdminBtn();
      toast(`Admin Mode ${isAdmin() ? "enabled" : "disabled"}.`);
      render();
    };

    adminBtn?.addEventListener("click", toggleAdminModeState);
    $("#headerAdminBtn")?.addEventListener("click", toggleAdminModeState);
    $("#menuAdminBtn")?.addEventListener("click", toggleAdminModeState);

    // Secret trigger: 3 quick taps/clicks on footer copyright or notice unlocks Admin Mode directly!
    let secretClickCount = 0;
    let secretClickTimer = null;
    document.addEventListener("click", (e) => {
      if (e.target.closest("#footerCopyright") || e.target.closest("#footerNotice")) {
        secretClickCount++;
        if (secretClickTimer) clearTimeout(secretClickTimer);
        if (secretClickCount >= 3) {
          secretClickCount = 0;
          toggleAdminModeState();
        } else {
          secretClickTimer = setTimeout(() => { secretClickCount = 0; }, 800);
        }
      }
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
  }

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

  function initThemeControls() {
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
  }

  function initStudioSettingsControls() {
    const modal = $("#studioSettingsModal");
    const btn = $("#studioSettingsBtn");
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
        instagramVerify.innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener" style="color:var(--accent); font-weight:600; text-decoration:underline;">Test Instagram ↗</a>`;
      } else {
        instagramVerify.innerHTML = "";
      }

      if (kav) {
        const url = kav.startsWith("http") ? kav : "https://" + kav;
        kavyarVerify.innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener" style="color:var(--accent); font-weight:600; text-decoration:underline;">Test Kavyar ↗</a>`;
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

  /* ============================================================
     §12 · VIEWS — HTML builders for every route
     ============================================================ */
  const view = $("#view");

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
  // Letters are grouped per word: the inner row is flex-wrap, and with bare
  // letter spans it wrapped between ANY two letters — "Studio Availability"
  // rendered as "Studio Availa / bility" on a phone. --i keeps counting
  // across words so the rise-in stagger is unchanged.
  const kineticH1 = (word, extraClass = "") => {
    let i = 0;
    const words = String(word).split(" ").map(w =>
      `<span class="kw-word">${w.split("").map(ch => `<span class="kw-letter" style="--i:${i++}">${esc(ch)}</span>`).join("")}</span>`
    );
    return `<h1 class="reveal kinetic-h1 ${extraClass}"><span class="kinetic-word-inner">${words.join(`<span class="kw-space">&nbsp;</span>`)}</span></h1>`;
  };
  // noth.in-style full-bleed work card: big image, title + tagline overlay,
  // image reveal on hover. Opens the shoot in the lightbox via .noth-work wiring.
  function nothWorkCard(s, i) {
    const cover = s.photos.find(p => p.id.split("-")[0] === s.coverPhotoId) || s.photos[0] || { objectPosition: "center" };
    const coverPos = cover.objectPosition || "center";
    // The homepage grid is a showcase, not the archive: a "Test Shoot" /
    // "Selective Collab" badge there reads as a disclaimer on the work.
    // The albums and category pages keep it, since there it is a filter.
    const onHome = location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "") === "";
    const rawType = ((s && s.type) || "").trim();
    const isTestish = rawType === "Test Shoot" || rawType === "Selective Collaboration (TFP)";
    const typeTag = (onHome && isTestish) ? "" : publicShootType(s);
    const tagline = s.description
      ? s.description
      : [s.activity, typeTag].filter(Boolean).join(" · ");
    let mentorText = "";
    if (s.type === "Workshop Attended" && s.mentor) {
      const cleanNames = s.mentor.split(",").map(item => {
        const name = item.trim().split(/\s+/).filter(w => !w.startsWith("@") && !w.includes("instagram.com") && !w.includes("kavyar.com") && !w.startsWith("http")).join(" ").trim();
        return name;
      }).filter(Boolean);
      if (cleanNames.length) mentorText = `Mentors: ${cleanNames.join(", ")}`;
    }
    const meta = [s.brand, s.season, s.location].filter(v => v && v !== "Personal Project" && v !== "—").join(" · ");
    const title = getTalentCleanName(s.isCompCard ? s.talent : (s.title || "Untitled"));

    return `
      <article class="noth-work reveal" data-shoot="${s.id}" data-category="${esc(s.type || '')}" data-talent="${esc(s.talent || '')}" style="--d:${(i % 2) * 0.08}s; position: relative; border-radius: 12px; overflow: hidden; background: var(--paper); border: 1px solid var(--line); box-shadow: var(--shadow-sm); transition: transform 0.3s ease, box-shadow 0.3s ease;">
        <button class="noth-work-media" aria-label="View ${esc(title)}" style="position: relative; overflow: hidden; border-radius: 12px 12px 0 0;">
          <!-- Floating micro-badge: shoot type. A photo-count badge used to sit
               opposite it, but a frame count is inventory, not something a
               visitor picks an album by, and it competed with the cover. -->
          ${typeTag ? `
          <div style="position: absolute; top: 12px; left: 12px; z-index: 4; display: flex; gap: 6px; align-items: center;">
            <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 800; background: rgba(10, 10, 10, 0.75); backdrop-filter: blur(8px); color: #ffffff; padding: 4px 9px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.2); text-transform: uppercase; letter-spacing: 0.05em;">${esc(typeTag)}</span>
          </div>` : ""}

          <span class="noth-work-backdrop" style="background-image: url('${esc(photoSrc(cover))}');" aria-hidden="true"></span>
          <img src="${esc(photoSrc(cover))}"${srcsetAttr(cover, "(max-width: 620px) 100vw, 100vw")} style="object-position: ${esc(coverPos)}; transition: transform 0.5s ease;" alt="${esc(altFor(s))}" loading="lazy" />
        </button>

        <div class="noth-work-row" style="padding: 16px;">
          <div class="noth-work-titles">
            <h3 class="noth-work-title" style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; margin-bottom: 4px;">${esc(title)}</h3>
            <p class="noth-work-tagline" style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.4;">${esc(tagline)}</p>
          </div>
          <div class="noth-work-meta" style="margin-top: 10px; border-top: 1px solid var(--line); padding-top: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="font-family: var(--mono-font); font-size: var(--font-xs); color: var(--ink-soft);">
              ${meta ? `<span>${esc(meta)}</span>` : ""}
              ${mentorText ? `<div style="font-size: var(--font-xs); color: var(--accent); margin-top: 2px; font-weight: 600;">${esc(mentorText)}</div>` : ""}
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="noth-work-cta" style="font-size: var(--font-xs); font-weight: 700; color: var(--accent);">View Album →</span>
              <button class="work-share" data-id="${s.id}" style="background: var(--bone); border: 1px solid var(--line); border-radius: 6px; cursor: pointer; padding: 4px 8px; display: flex; align-items: center; justify-content: center; color: var(--ink); font-size: var(--font-xs);" title="Share album" aria-label="Share album">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>
            </div>
          </div>
          ${isAdmin() ? `
            <div class="noth-work-admin" style="margin-top: 10px; display: flex; gap: 12px; width: 100%; border-top: 1px dashed var(--line); padding-top: 10px;">
              <button class="link-arrow work-edit" style="color: var(--accent); font-weight: 700; padding: 0; font-size: var(--font-xs); height: auto;" data-id="${s.id}">Edit details →</button>
              <button class="link-arrow work-delete" style="color: #b22222; font-weight: 700; padding: 0; font-size: var(--font-xs); height: auto;" data-id="${s.id}">Delete →</button>
            </div>
          ` : ""}
        </div>
      </article>`;
  }

  function fullBleedBlock(s, i) {
    const cover = s.photos.find(p => p.id.split("-")[0] === s.coverPhotoId) || s.photos[0] || { dataUrl: "", objectPosition: "center" };
    let coverPos = cover.objectPosition || "center";
    
    const latestShoot = s.originalShoots ? s.originalShoots[0] : s;

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

    // Cards render on the homepage / album pages and on the comp card pages;
    // each surface has its own switches for socials, agency and email.
    const repSurface = (isCurrentlyCompCardView() || isCurrentlyModelPortfolioView()) ? "CompCard" : "Home";
    const creditsList = [];
    if (s.isCompCard) {
      // Name only — the handle lives in the talent field's parentheses (see
      // compCardOwnHandles) purely so the right social can be picked out, and
      // it is already rendered as the "Socials" credit right below. Printing
      // the raw field here spelled the whole instagram.com URL out in the
      // credits line.
      if (s.talent && s.talent !== "—") creditsList.push(`Talent <strong>${esc(getTalentCleanName(s.talent))}</strong>`);
      // Current agency: the unified card carries the newest album's value.
      // Name only on a card: the handle and website live on the comp card
      // panel and the PDF.
      if (s.agency && showRep(s, "Agency", repSurface)) creditsList.push(`Agency <strong>${esc(s.agency)}</strong>`);
      if (s.modelEmail && showRep(s, "Email", repSurface)) creditsList.push(`Email <a href="mailto:${esc(s.modelEmail)}" style="color:var(--accent); font-weight:600;">${esc(s.modelEmail)}</a>`);
      if (igHtml && showRep(s, "ModelInstagram", repSurface)) creditsList.push(`Socials ${igHtml}`);
    } else {
      if (s.photographer || s.secondaryPhotographers) {
        const extra = (s.secondaryPhotographers || "").split(",").map(x => getTalentCleanName(x.trim())).filter(Boolean);
        creditsList.push(`Photo <strong>${esc([s.photographer, ...extra].filter(Boolean).join(", "))}</strong>`);
      }
      if (s.artDirector) creditsList.push(`AD <strong>${esc(s.artDirector)}</strong>`);
      if (s.stylist && s.stylist !== "—") creditsList.push(`Style <strong>${esc(s.stylist)}</strong>`);
      if (s.hair && s.hair !== "—") creditsList.push(`Hair <strong>${esc(s.hair)}</strong>`);
      if (s.mua && s.mua !== "—") creditsList.push(`Makeup <strong>${esc(s.mua)}</strong>`);
      // renderCreditValue (not getTalentCleanName) on this branch: a regular
      // album can list several models, each with their own handle inlined,
      // and s.instagram won't necessarily carry them. This strips the
      // parentheses AND renders each handle as a link, so no link is lost.
      if (s.talent && s.talent !== "—") creditsList.push(`Talent <strong>${renderCreditValue(s.talent)}</strong>`);
      if (igHtml && showRep(s, "ModelInstagram", repSurface)) creditsList.push(`Socials ${igHtml}`);
    }
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
        <p class="eyebrow" style="margin: 0 0 10px; font-size: var(--font-xs);">Lighting Setup ${s.lightingDiagramVisibility === 'private' ? '🔒 (Admin Only)' : '🌐 (Public)'}</p>
        <button class="btn btn-ghost btn-block view-diagram-btn" style="padding: 10px; font-size: var(--font-xs); height: auto;" data-id="${s.id}">View Lighting Diagram</button>
        <div class="diagram-img-wrap" style="display: none; margin-top: 14px; text-align: center;">
          <img src="${esc(s.lightingDiagram)}" style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: var(--shadow);" alt="Lighting Setup Diagram" />
        </div>
      </div>
    ` : "";

    const mediaHtml = (s.isCompCard || s.type === "Selective Collaboration (TFP)") ? (() => {
      const activePhotos = s.photos || [];
      const shownPhotos = activePhotos.slice(0, 3);
      const remainingCount = activePhotos.length - 3;
      const fourthPhoto = activePhotos[3];
      return `
        <div class="comp-card-grid">
          ${shownPhotos.map((p, idx) => `
            <button class="comp-card-thumb reveal" data-index="${idx}">
              <img src="${esc(photoSrc(p))}"${srcsetAttr(p, "(max-width: 620px) 45vw, 22vw")} alt="${esc(altFor(s, idx + 1))}" loading="lazy" />
            </button>
          `).join("")}
          ${fourthPhoto ? `
            <button class="comp-card-thumb comp-card-more reveal" data-index="3">
              <img src="${esc(photoSrc(fourthPhoto))}" style="filter: brightness(0.42);" alt="${esc(altFor(s, 4))}" loading="lazy" />
              ${remainingCount > 1 ? `<div class="comp-card-more-overlay">+${remainingCount} more</div>` : ""}
            </button>
          ` : ""}
        </div>
      `;
    })() : `
      <button class="work-media" aria-label="View ${esc(s.title)}">
        <img src="${esc(photoSrc(cover))}"${srcsetAttr(cover)} style="object-position: ${esc(coverPos)};" alt="${esc(altFor(s))}" loading="lazy" />
        <span class="work-count">${s.photos.length} frame${s.photos.length !== 1 ? 's' : ''}</span>
      </button>
    `;

    return `
      <article class="work-block ${i % 2 ? "flip" : ""} reveal" data-shoot="${s.id}" data-talent="${esc(s.talent)}">
        ${s.isCompCard ? `
          <div class="comp-card-header">
            <h2>${esc(getTalentCleanName(s.talent))}</h2>
            <p class="comp-card-eyebrow">Comp Card</p>
            ${modelTypeBadgesHtml(s, "margin-top: 10px;")}
          </div>
        ` : ""}
        ${mediaHtml}
        <div class="work-info">
          ${isFutureShoot(s) ? `
            <div class="future-schedule-badge" style="display: inline-block; background: rgba(210,78,26,0.12); color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: var(--font-xs); font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 6px 12px; border-radius: 4px; margin-bottom: 16px; border: 1px solid rgba(210,78,26,0.25);">
              To be visible to public after ${esc(s.date)}
            </div>
          ` : ""}
          ${(() => {
            const canInline = !s.demo && !s.isCompCard && isAdmin();
            const ed = (field, extra = "") => canInline
              ? ` class="inline-edit ${extra}" contenteditable="true" spellcheck="false" data-shoot="${s.id}" data-field="${field}" title="Click to edit"`
              : (extra ? ` class="${extra}"` : "");
            const brandAndType = [s.brand, publicShootType(s)].filter(Boolean).join(" · ");
            return `
            ${s.isCompCard ? "" : `
              <p class="eyebrow">${esc(brandAndType)}</p>
              <h3><span${ed("title")}>${esc(s.title)}</span></h3>
            `}
            <p class="work-desc"><span${ed("description")}>${esc(s.description || (canInline ? "Add a description…" : ""))}</span></p>
            ${s.isCompCard ? "" : `
            <dl class="work-credits">
              <div><dt>Activity</dt><dd>${esc(s.activity)}</dd></div>
              <div><dt>Season</dt><dd><span${ed("season")}>${esc(s.season || "—")}</span></dd></div>
              <div><dt>Location</dt><dd><span${ed("location")}>${esc(s.location || "—")}</span></dd></div>
            </dl>
            `}`;
          })()}
          
          ${s.isCompCard && (latestShoot.height || latestShoot.chest || latestShoot.waist || latestShoot.hips || latestShoot.shoes || latestShoot.modelHair || latestShoot.modelEyes) && (isCurrentlyModelPortfolioView() ? s.showStatsOnModelPortfolio !== false : s.showStatsOnCompCard !== false) ? `
            <div style="margin-top: 14px; border-top: 1px solid var(--line); padding-top: 14px; width: 100%;">
              <p class="eyebrow" style="font-size: var(--font-xs); margin-bottom: 8px; color: var(--ink-soft); letter-spacing: 0.05em; text-align: left;">Model Stats</p>
              <div class="stats-row">
                ${latestShoot.height ? `<div class="stats-item"><dt>Height</dt><dd>${esc(latestShoot.height)}</dd></div>` : ""}
                ${latestShoot.chest ? `<div class="stats-item"><dt>${esc(chestLabelOf(latestShoot))}</dt><dd>${esc(latestShoot.chest)}</dd></div>` : ""}
                ${latestShoot.waist ? `<div class="stats-item"><dt>Waist</dt><dd>${esc(latestShoot.waist)}</dd></div>` : ""}
                ${latestShoot.hips ? `<div class="stats-item"><dt>Hips</dt><dd>${esc(latestShoot.hips)}</dd></div>` : ""}
                ${latestShoot.shoes ? `<div class="stats-item"><dt>Shoes</dt><dd>${esc(latestShoot.shoes)}</dd></div>` : ""}
                ${latestShoot.modelHair ? `<div class="stats-item"><dt>Hair</dt><dd>${esc(latestShoot.modelHair)}</dd></div>` : ""}
                ${latestShoot.modelEyes ? `<div class="stats-item"><dt>Eyes</dt><dd>${esc(latestShoot.modelEyes)}</dd></div>` : ""}
              </div>
            </div>
          ` : ""}

          ${""}

          <p class="work-by">${creditsHtml}</p>
          ${testimonialsHtml}
          ${diagramHtml}
          <div style="margin-top: 22px; display: flex; align-items: center; flex-wrap: wrap; gap: 14px; width: 100%;">
            <button class="link-arrow work-open" style="padding: 0;">${s.isCompCard ? "View model details" : "View project"} →</button>
            <button class="link-arrow work-share" style="padding: 0; display: inline-flex; align-items: center; gap: 6px;" title="Share this album" aria-label="Share this album">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share link
            </button>
            ${(!s.demo && isAdmin()) ? `
              <button class="link-arrow work-edit" style="color: var(--accent); font-weight: 700; padding: 0;" data-id="${s.originalShoots ? s.originalShoots[0].id : s.id}">Edit details</button>
              ${s.isCompCard ? `
                <button class="link-arrow work-toggle-hide" style="color: var(--accent); font-weight: 700; padding: 0;" data-talent="${esc(s.talent)}">${s.originalShoots && s.originalShoots.some(x => x.hideFromCompCard) ? "👁️ Unhide Card" : "🔒 Hide Card"}</button>
              ` : ""}
              <button class="link-arrow work-delete" style="color: #b22222; font-weight: 700; padding: 0;" data-id="${s.originalShoots ? s.originalShoots[0].id : s.id}">Delete</button>
            ` : ""}
          </div>
        </div>
      </article>`;
  }

  // Minimal line-art camera drawn behind the hero wordmark. Uses stroke-dash
  // draw-on animation (see .hero-camera CSS). Decorative, so aria-hidden.
  function cameraSvg() {
    return `
      <div class="hero-camera" aria-hidden="true">
        <svg viewBox="0 0 640 440" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <g stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
            <path class="hc-body" pathLength="1" d="M70 130 h110 l34 -46 h172 l34 46 h110 a30 30 0 0 1 30 30 v190 a30 30 0 0 1 -30 30 H70 a30 30 0 0 1 -30 -30 V160 a30 30 0 0 1 30 -30 Z"/>
            <circle class="hc-lens-outer" pathLength="1" cx="320" cy="258" r="96"/>
            <circle class="hc-lens-inner" pathLength="1" cx="320" cy="258" r="58"/>
            <circle class="hc-lens-dot" pathLength="1" cx="292" cy="230" r="14"/>
            <path class="hc-flash" pathLength="1" d="M120 176 h70"/>
            <rect class="hc-view" pathLength="1" x="470" y="168" width="70" height="42" rx="8"/>
          </g>
        </svg>
      </div>`;
  }

  function viewHome() {
    // Nine is a cap for a very large archive, not a curation: with the albums
    // published today every one of them appears. Trimming to six to make the
    // rows come out even had quietly cost two albums — one cut here and one
    // hidden by the grid — which is a far worse outcome than a last row that
    // is not completely full.
    // The album the hero was taken from is dropped: it is already the largest
    // image on the page, and showing it again as the first tile read as a
    // mistake. Dropping it also happens to leave six portraits, which fill the
    // grid exactly — the hero frame is the landscape one, and a wide tile in
    // this grid is shorter than the portraits beside it, so it left a dead gap
    // in its row and stranded the last album alone on a third row.
    const heroPhoto = (window.STUDIO_CONFIG?.heroImage || "").trim();
    const usesHeroPhoto = (s) => heroPhoto && (s.photos || []).some(p => (p.url || "") === heroPhoto);
    const feat = SHOOTS
      .filter(s => !s.isTestimonial && s.type !== "Workshop Attended" && !usesHeroPhoto(s))
      .slice(0, 9);
    // Hand-picked in config.js. Falls back to the old typographic hero if it is
    // blank or points at a file that no longer exists, so a mistyped path
    // degrades to the previous design rather than a broken image.
    const heroSrc = (window.STUDIO_CONFIG?.heroImage || "").trim();
    const heroFocus = (window.STUDIO_CONFIG?.heroFocus || "50% 35%").trim();
    const heroAlt = (window.STUDIO_CONFIG?.heroAlt || "Studio photography by nerdyphotographer.in").trim();
    CURRENT_VIEW_SHOOTS = feat;
    const brandCount = new Set(SHOOTS.filter(s => s.client && s.client.trim() && s.type !== "Workshop Attended").map(s => s.brand)).size;
    const activeBrands = BRANDS.filter(b => SHOOTS.some(s => s.brand === b && s.client && s.client.trim() && s.type !== "Workshop Attended"));
    const displayBrands = activeBrands.length ? activeBrands : BRANDS;
    const clientNames = [...new Set(SHOOTS.filter(s => s.type !== "Workshop Attended").map(s => s.client).filter(c => c && c.trim()))];
    // Partners strip: every distinct brand on a published album, minus the
    // placeholders. Two rows drifting opposite ways; a brand shows as its
    // logo when STUDIO_CONFIG.partnerLogos names one, otherwise as a wordmark.
    // Appears once there are brands to show; until then the client band stays.
    const partnerNames = [...new Set(SHOOTS
      .filter(s => !s.isTestimonial && s.type !== "Workshop Attended")
      .map(s => (s.brand || "").trim())
      .filter(b => b && !/^(personal project|other|none|n\/a|self|-)$/i.test(b)))];
    const partnerLogos = (window.STUDIO_CONFIG && window.STUDIO_CONFIG.partnerLogos) || {};
    const partnerItem = (name) => partnerLogos[name]
      ? `<span class="partner"><img src="${esc(partnerLogos[name])}" alt="${esc(name)}" loading="lazy" /></span>`
      : `<span class="partner">${esc(name)}</span>`;
    const partnerRow = (names, dir) => {
      // Pad short rows so the loop never shows a gap, then repeat the set
      // twice: the animation slides exactly one set width.
      let list = names.slice();
      while (list.length && list.length < 6) list = list.concat(names);
      const set = `<div class="partners-set">${list.map(partnerItem).join("")}</div>`;
      return `<div class="partners-row" data-dir="${dir}"><div class="partners-track">${set}${set}</div></div>`;
    };
    const rowA = partnerNames.filter((_, i) => i % 2 === 0);
    const rowB = partnerNames.filter((_, i) => i % 2 === 1);
    const partnersHtml = partnerNames.length >= 2 ? `
      <section class="partners" aria-label="Our partners">
        <div class="container partners-head reveal">
          <p class="eyebrow">Our partners</p>
          <h2>Trusted by brands &amp; publications</h2>
        </div>
        ${partnerRow(rowA.length ? rowA : partnerNames, "ltr")}
        ${partnerRow(rowB.length ? rowB : partnerNames, "rtl")}
      </section>` : "";
    const nerdyLetters = "NERDY".split("").map((ch, i) =>
      `<span class="wm-letter" style="--i:${i}">${esc(ch)}</span>`
    ).join("");
    const subLetters = "PHOTOGRAPHER".split("").map((ch, i) =>
      `<span class="wm-sub-letter" style="--i:${i}">${esc(ch)}</span>`
    ).join("");

    const allT = getAllTestimonials();
    const shuffledT = shuffleArray(allT);
    const homeT = shuffledT.slice(0, 5);
    return `
      <section class="hero ${heroSrc ? "hero-shot" : "hero-mono hero-brand"}">
        ${heroSrc ? `
          <img class="hero-shot-img" src="${esc(heroSrc)}"${srcsetAttr({ url: heroSrc }, "100vw")} style="object-position: ${esc(heroFocus)};" alt="${esc(heroAlt)}" fetchpriority="high" decoding="async" />
          <div class="hero-shot-scrim" aria-hidden="true"></div>
        ` : `<div class="hero-bg" aria-hidden="true"></div>${cameraSvg()}`}
        <div class="container hero-inner">
          <div class="hero-topline reveal">
            <span class="hero-topline-l">The Creative Studio</span>
            <span class="hero-topline-r">Noida · Delhi NCR</span>
          </div>
          <div class="hero-brandmark">
            <h1 class="hero-wordmark hero-wordmark-nerdy" aria-label="Nerdy Photographer">
              ${nerdyLetters}
            </h1>
            <p class="hero-subword" aria-hidden="true">${subLetters}</p>
          </div>
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

      ${partnersHtml}
      ${clientNames.length && !partnersHtml ? `
      <div class="marquee" aria-hidden="true">
        <div class="marquee-track">
          ${(clientNames.concat(clientNames)).map((c) => `<span>${esc(c)}</span><span>·</span>`).join("")}
        </div>
      </div>
      ` : ''}

      <!-- FEATURED PHOTOSHOOTS -->
      <section class="section container section-divider">
        ${kineticWord("WORKS")}
        <div class="section-head row reveal" style="margin-top: 8px;">
          <div><p class="eyebrow">01 — Selected work</p><h2>Featured photoshoots</h2></div>
          <a href="/albums" data-link class="link-arrow">All albums →</a>
        </div>
        <div class="noth-work-list">${feat.map(nothWorkCard).join("")}</div>
        ${(() => {
          // The way into the archive, and it must not depend on the front page
          // holding something back. This used to render only when there were
          // MORE albums than the grid showed, so the moment the grid started
          // showing all of them the button silently disappeared — taking the
          // only route to /albums from this section with it. Wording shifts
          // instead: a count when there is genuinely more to see, an invitation
          // when there is not.
          const total = SHOOTS.filter(s => s.type !== "Workshop Attended").length;
          if (!total) return "";
          const more = total > feat.length;
          return `
        <div class="works-all-cta reveal">
          <a href="/albums" data-link class="btn btn-dark">${more ? `View all ${total} albums →` : "Browse the full archive →"}</a>
        </div>`;
        })()}
      </section>

      <!-- SERVICES (WHO I SHOOT FOR) -->
      <section class="section container section-divider">
        <div class="section-head section-head-center reveal">
          <p class="eyebrow">Services</p>
          <h2>Who I shoot for</h2>
        </div>
        <div class="services-grid reveal-stagger">
          <a href="/categories" data-link class="service-card" style="display: block; text-decoration: none; color: inherit; cursor: pointer;">
            <div class="service-kicker">Brands</div>
            <h3>Campaigns &amp; Lookbooks</h3>
            <p>High-concept visual storytelling, commercial lookbooks, and campaigns tailored to elevate brand identities and drive customer engagement.</p>
            <span class="link-arrow" style="margin-top: 12px; display: inline-block; font-size: var(--font-xs); font-weight: 700;">Browse categories →</span>
          </a>
          <a href="/categories?kind=type&amp;val=Comp%20Cards" data-link class="service-card" style="display: block; text-decoration: none; color: inherit; cursor: pointer;">
            <div class="service-kicker">Models</div>
            <h3>Portfolio Building &amp; TFP</h3>
            <p>Editorial-grade portfolio building, comp card shoot development, and selective test shoots (TFP) to help models stand out in agency submissions.</p>
            <span class="link-arrow" style="margin-top: 12px; display: inline-block; font-size: var(--font-xs); font-weight: 700; color: var(--accent);">View model comp cards →</span>
          </a>
          <a href="/categories?kind=activity&amp;val=Fitness" data-link class="service-card" style="display: block; text-decoration: none; color: inherit; cursor: pointer;">
            <div class="service-kicker">Athletes</div>
            <h3>Fitness &amp; Sports Action</h3>
            <p>Dynamic action-freezing athletic portraits and editorial-grade fitness content that highlights physique, strength, and raw athletic performance.</p>
            <span class="link-arrow" style="margin-top: 12px; display: inline-block; font-size: var(--font-xs); font-weight: 700;">See fitness work →</span>
          </a>
        </div>
      </section>

      <!-- QUICK LINKS -->
      <section class="section container">
        <div class="quick-links-grid reveal" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin: 40px 0;">
          <a href="/categories?kind=type&amp;val=Comp%20Cards" data-link class="btn btn-dark" style="text-align: center; padding: 16px 24px;">Model Comp Cards →</a>
          <a href="/workshop-attended" data-link class="btn btn-dark" style="text-align: center; padding: 16px 24px;">Workshop Attended →</a>
        </div>
      </section>

      ${homeT.length ? `
      <!-- TESTIMONIALS (CLIENT REACTIONS) -->
      <section class="section container" style="border-top: 1px solid var(--line); padding-top: 60px; margin-top: 60px;">
        <div class="section-head row reveal" style="margin-bottom: 40px;">
          <div>
            <p class="eyebrow">Client Reactions</p>
            <h2>Testimonials &amp; Trust</h2>
          </div>
          ${allT.length > 5 ? `<a href="/testimonials" data-link class="link-arrow">All Testimonials (${allT.length}) →</a>` : ""}
        </div>
        <div class="testimonials-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 30px;">
          ${homeT.map((t, i) => `
            <div class="testimonial-card reveal" style="--d:${(i * 0.06).toFixed(2)}s; background: var(--bone); border: 1px solid var(--line); padding: 24px; border-radius: 12px; display: flex; flex-direction: column; gap: 15px; justify-content: space-between;">
              <p style="font-family: 'Georgia', serif; font-size: var(--font-sm); font-style: italic; line-height: 1.6; color: var(--ink); margin: 0;">“${esc(t.quote)}”</p>
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <strong style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); color: var(--ink);">${esc(t.by)}</strong>
                <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">${esc(t.meta)} ${t.season ? `· ${esc(t.season)}` : ""}</span>
              </div>
            </div>
          `).join("")}
        </div>
        ${allT.length > 5 ? `
        <div style="text-align: center; margin-top: 40px;" class="reveal">
          <a href="/testimonials" data-link class="btn btn-dark">View all ${allT.length} testimonials →</a>
        </div>
        ` : ""}
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
    const userIsAdmin = isAdmin();
    const list = SHOOTS.filter(s => {
      if (s.type === "Workshop Attended") return false;
      if (!userIsAdmin && s.isPublic === false) return false;
      return true;
    });
    CURRENT_VIEW_SHOOTS = list;

    // Calculate Category Counts
    const counts = {
      all: list.length,
      fashion: list.filter(s => (s.type || "").toLowerCase().includes("fashion")).length,
      commercial: list.filter(s => (s.type || "").toLowerCase().includes("commercial")).length,
      tfp: list.filter(s => (s.type || "").toLowerCase().includes("tfp") || (s.type || "").toLowerCase().includes("selective")).length,
      test: list.filter(s => (s.type || "").toLowerCase().includes("test")).length
    };

    const filterPillHtml = `
      <div style="position: sticky; top: calc(70px + var(--admin-banner-h, 0px)); z-index: 30; background: rgba(250,250,250,0.85); backdrop-filter: blur(12px); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 12px 0; margin-bottom: 24px;">
        <div class="container" style="display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px;">
          <button type="button" class="album-filter-pill active" data-filter="all" onclick="window.filterAlbumGrid('all', this)" style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; padding: 6px 14px; border-radius: 20px; border: 1px solid var(--accent); background: var(--accent); color: #fff; cursor: pointer; white-space: nowrap;">🌐 All Albums (${counts.all})</button>
          ${counts.fashion ? `<button type="button" class="album-filter-pill" data-filter="fashion" onclick="window.filterAlbumGrid('fashion', this)" style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; padding: 6px 14px; border-radius: 20px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; white-space: nowrap;">👗 Fashion (${counts.fashion})</button>` : ''}
          ${counts.commercial ? `<button type="button" class="album-filter-pill" data-filter="commercial" onclick="window.filterAlbumGrid('commercial', this)" style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; padding: 6px 14px; border-radius: 20px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; white-space: nowrap;">💼 Commercial (${counts.commercial})</button>` : ''}
          ${(counts.tfp && isAdmin()) ? `<button type="button" class="album-filter-pill" data-filter="tfp" onclick="window.filterAlbumGrid('tfp', this)" style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; padding: 6px 14px; border-radius: 20px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; white-space: nowrap;">🤝 Selective Collab (${counts.tfp})</button>` : ''}
          ${(counts.test && isAdmin()) ? `<button type="button" class="album-filter-pill" data-filter="test" onclick="window.filterAlbumGrid('test', this)" style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; padding: 6px 14px; border-radius: 20px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; white-space: nowrap;">📸 Test Shoots (${counts.test})</button>` : ''}
        </div>
      </div>
    `;

    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">02 — The archive</p>
          ${kineticH1("Albums")}
          <p class="page-sub reveal">${list.length} album${list.length !== 1 ? "s" : ""} in the archive — every photoshoot, newest first.</p>
        </div>
      </section>
      ${filterPillHtml}
      <section class="section container full-bleed" style="padding-top: 0;">
        <div class="noth-work-list" id="albumsMainGrid">${list.map(nothWorkCard).join("") || emptyCat()}</div>
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

  // Shared album view — anyone with the link can view
  function viewSharedAlbum(albumId) {
    const album = resolveShareId(albumId, SHOOTS);
    // `isPublic !== false`, not `isPublic` — every other gate in the app
    // treats a missing flag as public (see loadShoots and viewAlbums), and
    // the flag only exists on albums saved since the checkbox was added.
    // Testing it as truthy meant every album published before that — six of
    // the nine live ones — answered "Album not found" to its own share link.
    if (!album || album.isPublic === false) {
      return `
        <section class="page-head">
          <div class="container">
            <h1 class="kinetic-h1">Album not found</h1>
            <p class="page-sub reveal">This link doesn't match any published album. It may have been shared before the album was renamed, or the album may since have been unpublished.</p>
            <div class="hero-actions" style="margin-top: 18px;">
              <a href="/" data-link class="btn btn-dark">Back home →</a>
              <a href="/categories?kind=type&amp;val=Comp%20Cards" data-link class="btn btn-ghost">Model comp cards</a>
            </div>
          </div>
        </section>`;
    }
    CURRENT_VIEW_SHOOTS = [album];
    const title = getTalentCleanName(album.isCompCard ? album.talent : (album.title || "Untitled"));
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">Shared ${album.isCompCard ? "Comp Card" : "Album"}</p>
          <h1 class="kinetic-h1">${esc(title)}</h1>
          ${album.description ? `<p class="page-sub reveal">${esc(album.description)}</p>` : ""}
        </div>
      </section>
      <section class="section container full-bleed">
        ${album.isCompCard
          ? `<div class="work-list">${fullBleedBlock(album, 0)}</div>`
          : `<div class="noth-work-list">${nothWorkCard(album, 0)}</div>`}
      </section>`;
  }

  function viewWorkshopAttended() {
    const list = SHOOTS.filter(s => s.type === "Workshop Attended");
    CURRENT_VIEW_SHOOTS = list;
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">Workshops</p>
          ${kineticH1("Workshops", "kinetic-h1-wide")}
          <p class="page-sub reveal" style="max-width: 600px; line-height: 1.6; opacity: 1 !important; visibility: visible !important; transform: none !important;">A dedicated record of professional photography workshops attended, people trained, and creative techniques learned to build editorial proficiency.</p>
        </div>
      </section>
      <section class="section container full-bleed">
        <div class="noth-work-list">${list.map(nothWorkCard).join("") || `<p class="page-sub">No workshop albums published yet. Go to <a href="/upload" data-link style="text-decoration:underline; font-weight:600; color:var(--accent);">Upload</a> to add one with type 'Workshop Attended'.</p>`}</div>
      </section>
    `;
  }

  // Ranked horizontal bars: length encodes magnitude (a count), one accent
  // hue throughout. No categorical color assignment is needed here — each
  // row already carries its own text label, so identity never depends on
  // color, only on the label beside it.
  function rankedBarsHtml(items) {
    const max = Math.max(1, ...items.map((i) => i.count));
    return items.map((i) => {
      const pct = Math.max(2, Math.round((i.count / max) * 100));
      return `
        <div style="display:flex; flex-direction:column; gap:5px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:baseline; gap:10px; font-size: var(--font-xs);">
            <span style="font-weight:600; color:var(--ink);">${esc(i.label)}</span>
            <span style="font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); color:var(--ink-soft); font-variant-numeric: tabular-nums; flex:0 0 auto;">${i.count}</span>
          </div>
          <div style="height:8px; border-radius:4px; background:var(--line); overflow:hidden;">
            <div style="height:100%; width:${pct}%; border-radius:4px; background:var(--accent);"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAnalytics(data) {
    const container = $("#analyticsContent");
    if (!container) return;
    const catItems = (data.categories || []).map((c) => ({ label: c.activity, count: c.count }));
    const shootItems = (data.topShoots || []).map((s) => ({ label: s.label, count: s.count }));
    const emptyNote = `<p class="page-sub" style="font-size: var(--font-sm); margin:0;">No views recorded yet.</p>`;
    container.innerHTML = `
      <div style="padding:18px 22px; border:1px solid var(--line); border-radius:8px; background:var(--bone); display:inline-flex; flex-direction:column; gap:4px; margin-bottom:36px;">
        <span style="font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); letter-spacing:0.06em; text-transform:uppercase; color:var(--ink-soft);">Total Views</span>
        <span style="font-size: var(--font-lg); font-weight:800; color:var(--ink); font-variant-numeric: tabular-nums;">${data.totalViews ?? 0}</span>
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:40px;">
        <div>
          <h3 style="font-family:'Outfit', sans-serif; font-size: var(--font-sm); font-weight:700; margin:0 0 16px; color:var(--ink);">Views by Category</h3>
          ${catItems.length ? rankedBarsHtml(catItems) : emptyNote}
        </div>
        <div>
          <h3 style="font-family:'Outfit', sans-serif; font-size: var(--font-sm); font-weight:700; margin:0 0 16px; color:var(--ink);">Top Shoots</h3>
          ${shootItems.length ? rankedBarsHtml(shootItems) : emptyNote}
        </div>
      </div>
    `;
  }

  function viewAnalytics() {
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">Workshops</p>
          ${kineticH1("Analytics", "kinetic-h1-wide")}
          <p class="page-sub reveal" style="max-width: 620px; line-height: 1.6; opacity: 1 !important; visibility: visible !important; transform: none !important;">Which photo categories and shoots get looked at most on the site — a signal for what kind of shoot to do more of. Live traffic and referrers are already tracked separately via Cloudflare and Google Analytics; this is just content engagement within the portfolio itself.</p>
        </div>
      </section>
      <section class="section container">
        <div id="analyticsContent">
          <button type="button" id="analyticsLoadBtn" class="btn btn-dark" style="font-family:'JetBrains Mono', monospace; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; font-size: var(--font-xs); height:auto; padding:12px 20px;">Load Analytics →</button>
        </div>
      </section>
    `;
  }

  function wireAnalytics() {
    const btn = $("#analyticsLoadBtn");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const passcode = prompt("Enter admin passcode to view analytics:");
      if (!passcode) return;
      btn.disabled = true;
      btn.textContent = "Loading…";
      try {
        const res = await fetch(`${COMP_CARD_API_BASE}/api/views/summary?passcode=${encodeURIComponent(passcode.trim())}`);
        if (res.status === 401) {
          toast("Incorrect passcode.");
          btn.disabled = false;
          btn.textContent = "Load Analytics →";
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        renderAnalytics(await res.json());
      } catch (err) {
        console.error("Analytics load failed:", err);
        toast("Couldn't load analytics — check the server connection.");
        btn.disabled = false;
        btn.textContent = "Load Analytics →";
      }
    });
  }

  /* ============================================================
     § CALENDAR AVAILABILITY & BOOKING SYSTEM DATA
     ============================================================ */
  if (!window.WPS_DATA) window.WPS_DATA = {};
  /* The published data.js is the calendar the whole studio shares; this
     device's localStorage is a working copy that can also hold bookings taken
     here but not published yet.

     The old merge was `Object.assign(defaults, published, saved)`. `saved` was
     applied LAST and Object.assign is shallow, so the localStorage snapshot
     replaced the ENTIRE published `bookedDates` map. Once a browser had any
     saved copy it could never see a newer publish again — that is why the
     calendar kept showing old data.

     Now the two sides are merged per date and per booking, so newly published
     bookings arrive and unpublished local ones survive. Deletions travel as
     tombstones (the same pattern data.js already uses for deleted albums via
     DELETED_IDS) rather than by dropping anything merely absent — "absent" is
     indistinguishable from "booked on another device", and guessing wrong
     there destroys real bookings. */
  const CAL_STORE_KEY = "wps-calendar-settings";

  const readSavedCalSettings = () => {
    try { return JSON.parse(localStorage.getItem(CAL_STORE_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  };

  /* Identity of one booking, for de-duplication and for tombstones. Scoped by
     date on purpose: a shoot-derived entry keeps the same `shoot-<id>` across a
     date correction, so an id-only key would have the tombstone for the old
     date immediately delete the freshly written entry on the new one. Falls
     back to the name for legacy rows saved before bookings carried ids. */
  const calBookingKey = (dKey, b) => `${dKey}::${(b && (b.id || b.name)) || ""}`;

  function mergeCalendarSettings(published, saved) {
    const pub = published || {};
    const loc = saved || {};
    const publishedAt = Number(pub.updatedAt) || 0;
    const syncedAt = Number(loc.syncedAt) || 0;
    // A publish newer than the one this device last reconciled with is the
    // studio's current word on availability, so its blocked/opened maps win.
    // Otherwise this device holds the freshest edits and keeps its own.
    const publishedIsNewer = publishedAt > syncedAt;

    const removedIds = new Set([
      ...(Array.isArray(pub.removedBookingIds) ? pub.removedBookingIds : []),
      ...(Array.isArray(loc.removedBookingIds) ? loc.removedBookingIds : []),
    ]);

    const merged = {
      customBlockedDates: (publishedIsNewer ? pub.customBlockedDates : loc.customBlockedDates) || pub.customBlockedDates || {},
      customOpenedDates: (publishedIsNewer ? pub.customOpenedDates : loc.customOpenedDates) || pub.customOpenedDates || {},
      bookedDates: {},
      removedBookingIds: [...removedIds],
      paymentScheduleType: (publishedIsNewer ? pub.paymentScheduleType : loc.paymentScheduleType) || pub.paymentScheduleType || loc.paymentScheduleType || "5050",
      updatedAt: publishedAt,
      syncedAt: publishedAt,
    };

    // Union both sides, dropping anything tombstoned and de-duplicating the
    // bookings the two copies share.
    const seen = new Set();
    const absorb = (bookedDates) => {
      Object.entries(bookedDates || {}).forEach(([dKey, list]) => {
        (Array.isArray(list) ? list : []).forEach((b) => {
          if (!b) return;
          const key = calBookingKey(dKey, b);
          if (removedIds.has(key)) return;
          if (seen.has(key)) return;
          seen.add(key);
          if (!merged.bookedDates[dKey]) merged.bookedDates[dKey] = [];
          merged.bookedDates[dKey].push(b);
        });
      });
    };
    absorb(pub.bookedDates);
    absorb(loc.bookedDates);

    return merged;
  }

  window.WPS_DATA.CALENDAR_SETTINGS = mergeCalendarSettings(
    window.WPS_DATA.CALENDAR_SETTINGS,
    readSavedCalSettings()
  );

  function saveCalendarSettings() {
    try {
      localStorage.setItem(CAL_STORE_KEY, JSON.stringify(window.WPS_DATA.CALENDAR_SETTINGS));
    } catch (e) {}
  }

  function sanitizeCalendarBookings() {
    const settings = window.WPS_DATA?.CALENDAR_SETTINGS;
    if (!settings || !settings.bookedDates) return;
    let changed = false;
    Object.keys(settings.bookedDates).forEach(dKey => {
      const list = settings.bookedDates[dKey];
      if (Array.isArray(list)) {
        list.forEach(b => {
          if (b.name && /anticipated|tentative|hold/i.test(b.name)) {
            if (!b.isTentative || b.status !== "tentative") {
              b.isTentative = true;
              b.status = "tentative";
              changed = true;
            }
          }
          if (b.type && /anticipated|tentative|hold/i.test(b.type)) {
            if (!b.isTentative || b.status !== "tentative") {
              b.isTentative = true;
              b.status = "tentative";
              changed = true;
            }
          }
        });
      }
    });
    if (changed) {
      saveCalendarSettings();
    }
  }

  function syncCalendarWithShoots() {
    if (!window.WPS_DATA?.CALENDAR_SETTINGS) return;
    if (!window.WPS_DATA.CALENDAR_SETTINGS.bookedDates) {
      window.WPS_DATA.CALENDAR_SETTINGS.bookedDates = {};
    }
    const booked = window.WPS_DATA.CALENDAR_SETTINGS.bookedDates;
    let changed = false;

    // Entries derived from a published shoot are owned by that shoot, so they
    // have to follow it: this used to only ever ADD them, which left a phantom
    // booking on the calendar forever when a shoot was deleted, and left one
    // at BOTH dates when a shoot's date was corrected.
    //
    // Only ever prune against the COMPLETE shoot list. A visitor's SHOOTS is
    // filtered (future and non-public shoots are stripped), so pruning there
    // would delete the bookings for every upcoming shoot and show those dates
    // back to clients as free. Admin devices hold the full list; their pruning
    // reaches everyone else through the tombstones below.
    if (isAdmin()) {
      const shootDateById = new Map();
      (window.SHOOTS || []).forEach((s) => {
        if (s && s.id && s.date && /^\d{4}-\d{2}-\d{2}$/.test(s.date)) shootDateById.set(s.id, s.date);
      });
      if (!Array.isArray(window.WPS_DATA.CALENDAR_SETTINGS.removedBookingIds)) {
        window.WPS_DATA.CALENDAR_SETTINGS.removedBookingIds = [];
      }
      const tombstones = window.WPS_DATA.CALENDAR_SETTINGS.removedBookingIds;
      Object.keys(booked).forEach((dKey) => {
        const list = Array.isArray(booked[dKey]) ? booked[dKey] : [];
        const kept = list.filter((b) => !b || !b.shootId || shootDateById.get(b.shootId) === dKey);
        if (kept.length === list.length) return;
        list.filter((b) => b && b.shootId && shootDateById.get(b.shootId) !== dKey)
            .forEach((b) => { const k = calBookingKey(dKey, b); if (!tombstones.includes(k)) tombstones.push(k); });
        changed = true;
        if (kept.length) booked[dKey] = kept;
        else delete booked[dKey];
      });
    }

    (window.SHOOTS || []).forEach(s => {
      if (!s.date || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return;
      const dKey = s.date;
      if (!booked[dKey]) booked[dKey] = [];
      const exists = booked[dKey].some(b => b.shootId === s.id || b.name === s.title);
      if (!exists) {
        booked[dKey].push({
          id: `shoot-${s.id}`,
          shootId: s.id,
          name: s.title || s.client || "Published Production",
          type: s.type || s.activity || "Shoot",
          duration: "Full Day",
          status: s.type === "Workshop Attended" ? "workshop" : "confirmed",
          isTentative: false,
          notes: `Published Portfolio Shoot: ${s.title}`
        });
        changed = true;
      }
    });
    if (changed) {
      saveCalendarSettings();
    }
  }

  function parseToCalKey(str) {
    if (!str) return null;
    const trimmed = String(str).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
      const da = String(dmyMatch[1]).padStart(2, "0");
      const mo = String(dmyMatch[2]).padStart(2, "0");
      const yr = dmyMatch[3];
      return `${yr}-${mo}-${da}`;
    }
    const dObj = new Date(trimmed);
    if (isNaN(dObj.getTime())) return null;
    const yr = dObj.getFullYear();
    const mo = String(dObj.getMonth() + 1).padStart(2, "0");
    const da = String(dObj.getDate()).padStart(2, "0");
    return `${yr}-${mo}-${da}`;
  }

  function syncCalendarWithAudits() {
    if (!window.WPS_DATA?.CALENDAR_SETTINGS) return;
    if (!window.WPS_DATA.CALENDAR_SETTINGS.bookedDates) {
      window.WPS_DATA.CALENDAR_SETTINGS.bookedDates = {};
    }
    const booked = window.WPS_DATA.CALENDAR_SETTINGS.bookedDates;
    const audits = getLocalContractAudits();
    if (!Array.isArray(audits) || audits.length === 0) return;

    let changed = false;
    audits.forEach(audit => {
      if (!audit || !audit.date) return;
      const rawParts = String(audit.date).split(/[,–]/).map(s => s.trim()).filter(Boolean);
      rawParts.forEach(pStr => {
        const dKey = parseToCalKey(pStr);
        if (!dKey) return;
        if (!booked[dKey]) booked[dKey] = [];
        const exists = booked[dKey].some(b => 
          (b.contractNumber && audit.contractNumber && b.contractNumber === audit.contractNumber) ||
          (b.name === audit.clientName && b.email === audit.clientEmail)
        );
        if (!exists) {
          booked[dKey].push({
            id: "b_audit_" + (audit.contractNumber || (Date.now() + "_" + Math.random().toString(36).slice(2, 6))),
            name: audit.clientName || "Client Booking",
            email: audit.clientEmail || "",
            phone: audit.clientPhone || audit.phone || "",
            type: audit.shootType || "Shoot",
            duration: "Full Day",
            isTentative: false,
            status: "confirmed",
            notes: audit.notes || "",
            location: audit.location || "",
            contractVersion: audit.contractVersion || "V3.3",
            agreedToTerms: true,
            contractNumber: audit.contractNumber || "",
            inviteMeta: audit.inviteMeta || null,
            promoMeta: audit.promoMeta || null,
            financials: audit.financials || null,
            createdAt: audit.timestamp ? new Date(audit.timestamp).getTime() : Date.now()
          });
          changed = true;
        }
      });
    });
    if (changed) {
      saveCalendarSettings();
    }
  }

  sanitizeCalendarBookings();
  syncCalendarWithShoots();
  syncCalendarWithAudits();

  function getCalDateKey(d) {
    if (!d) return "";
    if (typeof d === "string") return d;
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${yr}-${mo}-${da}`;
  }

  function getCalDateStatus(d) {
    const key = getCalDateKey(d);
    const settings = window.WPS_DATA.CALENDAR_SETTINGS || {};
    const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    
    // Default rule: Monday (1) through Friday (5) are permanently blocked unless custom opened
    const isDefaultBlockedWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isManuallyOpened = !!(settings.customOpenedDates && settings.customOpenedDates[key]);
    const isCustomBlocked = !!(settings.customBlockedDates && settings.customBlockedDates[key]);
    const bookings = (settings.bookedDates && settings.bookedDates[key]) || [];
    const isBooked = bookings.length > 0;

    const isTentativeBooking = (b) => {
      if (b.isTentative || b.status === "tentative") return true;
      if (b.name && /anticipated|tentative|hold/i.test(b.name)) return true;
      if (b.type && /anticipated|tentative|hold/i.test(b.type)) return true;
      return false;
    };
    const isWorkshopBooking = (b) => b.status === "workshop";
    const isAssistingBooking = (b) => b.status === "assisting";
    const isTestShootBooking = (b) => /TFP|Selective Collaboration/i.test(`${b.type || ""} ${b.contractVersion || ""} ${b.budget || ""}`);

    const hasConfirmedBooking = bookings.some(b => !isTentativeBooking(b) && !isWorkshopBooking(b) && !isAssistingBooking(b));
    const isTentativeOnly = isBooked && !hasConfirmedBooking && bookings.some(b => isTentativeBooking(b));
    const hasWorkshop = bookings.some(b => isWorkshopBooking(b));
    const hasAssisting = bookings.some(b => isAssistingBooking(b));
    const hasTestShoot = bookings.some(b => isTestShootBooking(b) && !isWorkshopBooking(b) && !isAssistingBooking(b));
    
    let isBlocked = false;
    if (isCustomBlocked) {
      isBlocked = true;
    } else if (isDefaultBlockedWeekday && !isManuallyOpened) {
      isBlocked = true;
    }
    
    return {
      key,
      dayOfWeek,
      isDefaultBlockedWeekday,
      isManuallyOpened,
      isCustomBlocked,
      isBlocked,
      isBooked,
      hasConfirmedBooking,
      isTentativeOnly,
      hasWorkshop,
      hasAssisting,
      hasTestShoot,
      bookings
    };
  }

  function toggleCalDateBlock(dKey) {
    const settings = window.WPS_DATA.CALENDAR_SETTINGS;
    if (!settings.customOpenedDates) settings.customOpenedDates = {};
    if (!settings.customBlockedDates) settings.customBlockedDates = {};

    const parts = dKey.split("-").map(Number);
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    const status = getCalDateStatus(dateObj);

    if (status.isDefaultBlockedWeekday) {
      if (settings.customOpenedDates[dKey]) {
        delete settings.customOpenedDates[dKey];
      } else {
        settings.customOpenedDates[dKey] = true;
      }
    } else {
      if (settings.customBlockedDates[dKey]) {
        delete settings.customBlockedDates[dKey];
      } else {
        settings.customBlockedDates[dKey] = true;
      }
    }
    saveCalendarSettings();
  }

  function getLocalContractAudits() {
    try {
      const raw = localStorage.getItem("wps-contract-audit");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  // Only an actual image data URL may reach an <img>. Anything else (a legacy
  // sentinel string, an empty value) resolves as a relative path, 404s, and the
  // global image-error handler swaps in the "image unavailable" placeholder —
  // so a checkbox agreement rendered as a broken image in the admin views.
  const isSigImage = (v) => typeof v === "string" && v.startsWith("data:image/");
  const agreedBadge = (b) =>
    `<span style="display:inline-block; font-size: var(--font-xs); font-weight:700; color: var(--accent); border:1px solid var(--accent); border-radius:4px; padding:2px 7px;">\u2713 Agreed via checkbox</span>`;

  function saveLocalContractAudit(entry) {
    try {
      const audits = getLocalContractAudits();
      audits.push(entry);
      localStorage.setItem("wps-contract-audit", JSON.stringify(audits));
      return entry;
    } catch (e) {
      return null;
    }
  }

  function generateContractNumber() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `WPS-${timestamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  // Delivery outcome of the signed-contract PDF email, keyed by contract
  // number. Kept in its own store (not on the booking) because the email
  // send resolves asynchronously and may finish before or after the booking
  // record is created.
  function getContractEmailStatuses() {
    try {
      return JSON.parse(localStorage.getItem("wps-contract-email-status") || "{}");
    } catch (e) {
      return {};
    }
  }

  function setContractEmailStatus(contractNumber, status) {
    if (!contractNumber) return;
    try {
      const statuses = getContractEmailStatuses();
      statuses[contractNumber] = { status, at: new Date().toISOString() };
      localStorage.setItem("wps-contract-email-status", JSON.stringify(statuses));
    } catch (e) {}
  }

  function addCalBooking(dKey, bookingObj) {
    const settings = window.WPS_DATA.CALENDAR_SETTINGS;
    if (!settings.bookedDates) settings.bookedDates = {};
    if (!settings.bookedDates[dKey]) settings.bookedDates[dKey] = [];
    const booking = {
      id: "b_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      name: bookingObj.name || "Anticipated Client Hold",
      email: bookingObj.email || "",
      phone: bookingObj.phone || "",
      type: bookingObj.type || "Shoot",
      duration: bookingObj.duration || "Full Day",
      isTentative: bookingObj.isTentative || bookingObj.status === "tentative" || false,
      notes: bookingObj.notes || "",
      location: bookingObj.location || "",
      // True when the shoot venue is supplied by the studio (an invite code
      // carrying a location). Stored on the booking so the PDF contract reads
      // it from the record it is generating, not from page state.
      venueByStudio: !!bookingObj.venueByStudio,
      // How the client agreed: "signature" (drawn) or "checkbox". This object
      // is an explicit whitelist rather than a spread, so a field that is not
      // listed here is silently dropped on save.
      agreementMethod: bookingObj.agreementMethod || (bookingObj.sigDataUrl ? "signature" : ""),
      links: Array.isArray(bookingObj.links) ? bookingObj.links : (bookingObj.links ? [bookingObj.links] : []),
      attachments: Array.isArray(bookingObj.attachments) ? bookingObj.attachments : [],
      status: bookingObj.status || (bookingObj.isTentative ? "tentative" : "confirmed"),
      // A new booking marked as agreed but with no version named should carry
      // the ACTIVE terms, not V3.2 — which stopped being active when V3.3
      // shipped. Display fallbacks for older stored records are left alone on
      // purpose: relabelling them would misstate what was actually signed.
      contractVersion: bookingObj.contractVersion || (bookingObj.agreedToTerms ? "V3.3" : "Pending Agreement"),
      agreedToTerms: bookingObj.agreedToTerms !== undefined ? bookingObj.agreedToTerms : (bookingObj.contractVersion && bookingObj.contractVersion !== "Pending Agreement"),
      contractNumber: bookingObj.contractNumber || "",
      sigDataUrl: bookingObj.sigDataUrl || "",
      agreedContract: bookingObj.agreedContract || "",
      // What the client was quoted. These were passed in by the booking form
      // but never listed here, and the whitelist above drops anything unlisted
      // — so every booking was stored with no money on it at all, including
      // the home studio rental the client had just agreed to pay.
      budget: bookingObj.budget || "",
      homeStudioFee: Number(bookingObj.homeStudioFee) || 0,
      finalPayable: Number(bookingObj.finalPayable) || 0,
      financials: bookingObj.financials || null,
      inviteMeta: bookingObj.inviteMeta || null,
      promoMeta: bookingObj.promoMeta || null,
      createdAt: Date.now()
    };
    settings.bookedDates[dKey].push(booking);
    saveCalendarSettings();
    return booking;
  }

  function updateCalBooking(dKey, bookingId, updatedObj) {
    const settings = window.WPS_DATA.CALENDAR_SETTINGS;
    if (settings.bookedDates && settings.bookedDates[dKey]) {
      let idx = settings.bookedDates[dKey].findIndex(b => (b.id && b.id === bookingId) || (!b.id && b.name === bookingId));
      if (idx === -1 && settings.bookedDates[dKey].length === 1) idx = 0;
      if (idx !== -1) {
        const cur = settings.bookedDates[dKey][idx];
        const updated = {
          ...cur,
          id: cur.id || ("b_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
          name: updatedObj.name || cur.name,
          email: updatedObj.email !== undefined ? updatedObj.email : cur.email,
          phone: updatedObj.phone !== undefined ? updatedObj.phone : cur.phone,
          type: updatedObj.type || cur.type,
          duration: updatedObj.duration || cur.duration || "Full Day",
          isTentative: updatedObj.isTentative !== undefined ? updatedObj.isTentative : (updatedObj.status === "tentative"),
          status: updatedObj.status || (updatedObj.isTentative ? "tentative" : cur.status || "confirmed"),
          notes: updatedObj.notes !== undefined ? updatedObj.notes : cur.notes,
          links: updatedObj.links !== undefined ? updatedObj.links : cur.links,
          contractVersion: updatedObj.contractVersion !== undefined ? updatedObj.contractVersion : cur.contractVersion,
          agreedToTerms: updatedObj.agreedToTerms !== undefined ? updatedObj.agreedToTerms : cur.agreedToTerms,
          contractNumber: updatedObj.contractNumber !== undefined ? updatedObj.contractNumber : cur.contractNumber
        };

        const newDateKey = updatedObj.newDateKey || dKey;
        if (newDateKey !== dKey) {
          settings.bookedDates[dKey].splice(idx, 1);
          if (!settings.bookedDates[dKey].length) delete settings.bookedDates[dKey];
          if (!settings.bookedDates[newDateKey]) settings.bookedDates[newDateKey] = [];
          settings.bookedDates[newDateKey].push(updated);
        } else {
          settings.bookedDates[dKey][idx] = updated;
        }

        saveCalendarSettings();
        return updated;
      }
    }
    return null;
  }

  function removeCalBooking(dKey, bookingId) {
    const settings = window.WPS_DATA.CALENDAR_SETTINGS;
    if (settings.bookedDates && settings.bookedDates[dKey]) {
      const doomed = settings.bookedDates[dKey].filter(b => b.id === bookingId || b.name === bookingId);
      settings.bookedDates[dKey] = settings.bookedDates[dKey].filter(b => b.id !== bookingId && b.name !== bookingId);
      if (!settings.bookedDates[dKey].length) {
        delete settings.bookedDates[dKey];
      }
      // Tombstone the deletion, so the merge on the next load (or on another
      // device, once this is published) knows the booking was deliberately
      // removed instead of treating it as one that simply hasn't arrived yet
      // and adding it straight back.
      if (!Array.isArray(settings.removedBookingIds)) settings.removedBookingIds = [];
      doomed.forEach((b) => {
        const key = calBookingKey(dKey, b);
        if (!settings.removedBookingIds.includes(key)) settings.removedBookingIds.push(key);
      });
      saveCalendarSettings();
    }
  }

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
            <div style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">${esc(b.name || '—')}</div>
            <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 2px;">
              📅 ${esc(b.dateKey || '—')} &nbsp;·&nbsp; ${esc(b.type || '—')}
              ${b.email ? `&nbsp;·&nbsp; ✉️ ${esc(b.email)}` : ''}
              ${b.phone ? `&nbsp;·&nbsp; 📞 ${esc(b.phone)}` : ''}
            </div>
            ${b.contractNumber ? `<div style="margin-top: 6px; font-family: var(--mono-font); font-size: var(--font-xs); color: var(--accent); font-weight: 700;">Contract #: ${esc(b.contractNumber)}</div>` : ''}
          </div>
          <button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('${esc(b.dateKey)}', '${esc(b.id || '')}')" style="border-color: var(--accent); color: var(--accent); font-size: var(--font-xs); padding: 4px 10px; font-weight: 700; white-space: nowrap;">📄 Generate PDF</button>
        </div>
        ${b.agreedContract ? `<div style="font-family: var(--mono-font); font-size: var(--font-xs); color: #059669; font-weight: 700;">✅ ${esc(b.agreedContract)}</div>` : ''}
        ${emailBadge(b.contractNumber)}
        ${isSigImage(b.sigDataUrl) ? `
          <div>
            <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-bottom: 4px; font-weight: 600;">Digital Signature:</div>
            <img src="${b.sigDataUrl}" style="max-height: 48px; max-width: 220px; border-bottom: 1.5px solid var(--line); display: block; background: var(--bone); padding: 4px;" alt="Client signature" />
          </div>
        ` : (b.agreementMethod === "checkbox"
            ? '<div style="font-size: var(--font-xs); color: var(--accent); font-weight: 700;">\u2713 Agreed via checkbox \u2014 Studio Terms V3.3 accepted</div>'
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
            <p class="eyebrow" style="margin-bottom: 4px; color: var(--accent);">Legal Compliance &amp; Version Control</p>
            <h2 style="font-family: 'Outfit', sans-serif; font-size: var(--font-md); font-weight: 700; margin: 0;">📜 Studio Contract &amp; Terms Vault</h2>
          </div>
          <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent); background: var(--accent-soft); padding: 4px 10px; border-radius: 4px; border: 1px solid var(--accent);">8 Historical Contract Versions Preserved</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
          <div style="background: var(--paper); border: 1.5px solid var(--accent); border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--accent); color: #fff; padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.7 COMMERCIAL (ACTIVE)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Aug 2026 – Present</span>
            </div>
            <h3 style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">💼 Commercial Shoot Agreement V3.7</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Paid Commercial, Editorial, Fashion &amp; Brand. 50/50 &amp; 50/30/20 retainer milestones (studio rental due in full with the advance), Client/photographer studio-arranger choice with a photographer-arranged studio quoted in advance, commercial licensing, travel &gt;20km, gear &amp; media protection.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.7-COMMERCIAL')" style="font-size: var(--font-xs); flex: 1; font-weight: 700;">👁 Review Commercial</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '')" style="font-size: var(--font-xs); border-color: var(--accent); color: var(--accent); font-weight: 700;">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1.5px solid #059669; border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: #059669; color: #fff; padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.6 TFP / TEST SHOOT (ACTIVE)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Aug 2026 – Present</span>
            </div>
            <h3 style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">📸 Test Shoot &amp; TFP Release V3.6</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Selective Collaborations via Invite Codes. Non-commercial portfolio licensing, 8-12 retouched caps, Instagram credit, Participant/photographer studio-arranger choice, studio rental quoted in advance, liability waiver, gear protection.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.6-TFP')" style="font-size: var(--font-xs); flex: 1; font-weight: 700; background: #059669; border-color: #059669;">👁 Review TFP Release</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.6-TFP')" style="font-size: var(--font-xs); border-color: #059669; color: #059669; font-weight: 700;">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.6 COMMERCIAL (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Aug 2026 – Sep 2026</span>
            </div>
            <h3 style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">💼 Commercial Shoot Agreement V3.6</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Superseded by V3.7. Same terms, but a photographer-arranged external studio was passed through at cost (billed at actuals). Bookings agreed under it print these terms.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn" onclick="window.openContractArchiveModal('V3.6-COMMERCIAL')" style="font-size: var(--font-xs); flex: 1;">👁 Review</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.6-COMMERCIAL')" style="font-size: var(--font-xs);">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.5 TFP / TEST SHOOT (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Aug 2026 – Sep 2026</span>
            </div>
            <h3 style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">📸 Test Shoot &amp; TFP Release V3.5</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Superseded by V3.6-TFP. Same release, but studio rental and a photographer-arranged studio were billed at actuals. Bookings agreed under it print these terms.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn" onclick="window.openContractArchiveModal('V3.5-TFP')" style="font-size: var(--font-xs); flex: 1;">👁 Review</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.5-TFP')" style="font-size: var(--font-xs);">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.2 (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">May 2026 – Aug 2026</span>
            </div>
            <h3 style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">Studio Release &amp; Payment Terms V3.2</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">50/50 &amp; 50/30/20 milestones, RAW exclusion, Test Shoot specs, Studio Space Rental, social media attribution.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.2')" style="font-size: var(--font-xs); flex: 1; font-weight: 700;">👁 Review V3.2</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.2')" style="font-size: var(--font-xs); border-color: var(--accent); color: var(--accent); font-weight: 700;">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.1 (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">May 2026 – Jul 2026</span>
            </div>
            <h3 style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">TFP Production &amp; Portfolio Release V3.1</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Standard TFP portfolio licensing, model release, basic liability waiver, mandatory credit block.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.1')" style="font-size: var(--font-xs); flex: 1; font-weight: 700;">👁 Review V3.1</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.1')" style="font-size: var(--font-xs); border-color: var(--accent); color: var(--accent); font-weight: 700;">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.0 (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Jan 2026 – Apr 2026</span>
            </div>
            <h3 style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">Creative Collab &amp; Release V3.0</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Initial TFP structure, non-exclusive social media license, and studio rules.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.0')" style="font-size: var(--font-xs); flex: 1; font-weight: 700;">👁 Review V3.0</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.0')" style="font-size: var(--font-xs); border-color: var(--accent); color: var(--accent); font-weight: 700;">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V2.0 (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Jun 2025 – Dec 2025</span>
            </div>
            <h3 style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">Studio Model Release V2.0</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Early model release covering digital distribution, copyright ownership, promo usage.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V2.0')" style="font-size: var(--font-xs); flex: 1; font-weight: 700;">👁 Review V2.0</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V2.0')" style="font-size: var(--font-xs); border-color: var(--accent); color: var(--accent); font-weight: 700;">📄 Print PDF</button></div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V1.0 (ARCHIVED)</span>
              <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Jan 2025 – May 2025</span>
            </div>
            <h3 style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 12px 0 6px;">Basic Photography Release V1.0</h3>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Foundational photo release and copyright acknowledgment for early studio testing.</p>
            <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V1.0')" style="font-size: var(--font-xs); flex: 1; font-weight: 700;">👁 Review V1.0</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V1.0')" style="font-size: var(--font-xs); border-color: var(--accent); color: var(--accent); font-weight: 700;">📄 Print PDF</button></div>
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
            <p class="eyebrow" style="margin: 0 0 6px; color: var(--accent);">Contract Audit Trail</p>
            <h3 style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 0;">Audit Records — Server (permanent) + Local (this browser)</h3>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <span id="serverAuditMeta" style="font-family: var(--mono-font); font-size: var(--font-xs); color: var(--ink-soft);"></span>
            <button type="button" class="admin-cal-btn primary" onclick="window.loadServerContractRecords(this)" style="font-size: var(--font-xs); font-weight: 700;">☁️ Load Server Records</button>
          </div>
        </div>
        <div id="serverAuditGrid" style="display: none; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-bottom: 18px;"></div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
          ${getLocalContractAudits().length ? getLocalContractAudits().map(a => `
            <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 8px;">
              <div style="display:flex; justify-content: space-between; align-items:flex-start; gap: 8px; flex-wrap: wrap;">
                <div>
                  <div style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">${esc(a.clientName || 'Unknown')}</div>
                  <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 2px;">${esc(a.contractVersion || '—')} · ${esc(a.date || '—')}</div>
                </div>
                ${a.contractNumber ? `<span style="font-family: var(--mono-font); font-size: var(--font-xs); color: var(--accent); font-weight: 700;">${esc(a.contractNumber)}</span>` : ''}
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

  // Fetches the passcode-gated server audit trail (durable GitHub store,
  // merged with any Render-local fallback entries) into the vault page.
  window.loadServerContractRecords = async (btn) => {
    const passcode = prompt("Enter admin passcode to load server contract records:");
    if (!passcode) return;
    if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }
    try {
      const res = await fetch(`${COMP_CARD_API_BASE}/api/contracts/audit?passcode=${encodeURIComponent(passcode.trim())}`);
      if (res.status === 401) { toast("Incorrect passcode."); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const grid = $("#serverAuditGrid");
      if (!grid) return;
      const entries = data.entries || [];
      // Reconcile server audits into local storage and calendar
      if (Array.isArray(entries) && entries.length > 0) {
        const localAudits = getLocalContractAudits();
        let auditAdded = false;
        entries.forEach(srvEntry => {
          if (!srvEntry) return;
          const match = localAudits.find(l => (l.contractNumber && srvEntry.contractNumber && l.contractNumber === srvEntry.contractNumber) || (l.clientName === srvEntry.clientName && l.date === srvEntry.date));
          if (!match) {
            localAudits.push(srvEntry);
            auditAdded = true;
          }
        });
        if (auditAdded) {
          localStorage.setItem("wps-contract-audit", JSON.stringify(localAudits));
          syncCalendarWithAudits();
        }
      }
      const meta = $("#serverAuditMeta");
      if (meta) meta.textContent = `${entries.length} server record${entries.length !== 1 ? "s" : ""} · ${data.storage || ""}`;
      grid.style.display = "grid";
      grid.innerHTML = entries.length ? entries.map(a => `
        <div style="background: var(--surface); border: 1.5px solid var(--accent); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display:flex; justify-content: space-between; align-items:flex-start; gap: 8px; flex-wrap: wrap;">
            <div>
              <div style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">☁️ ${esc(a.clientName || 'Unknown')}</div>
              <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 2px;">${esc(a.contractVersion || '—')} · ${esc(a.date || '—')}</div>
            </div>
            ${a.contractNumber ? `<span style="font-family: var(--mono-font); font-size: var(--font-xs); color: var(--accent); font-weight: 700;">${esc(a.contractNumber)}</span>` : ''}
          </div>
          <div style="font-size: var(--font-xs); color: var(--ink-soft);">${a.clientEmail ? `✉️ ${esc(a.clientEmail)}` : ''} ${a.phone ? `· 📞 ${esc(a.phone)}` : ''}</div>
          <div style="font-size: var(--font-xs); color: var(--ink-soft);">Signed: ${a.sigCaptured ? 'Yes' : 'No'} · Recorded: ${a.timestamp ? new Date(a.timestamp).toLocaleString() : 'Unknown'}</div>
          <div style="font-size: var(--font-xs); color: var(--ink-soft);">Notes: ${esc(a.notes || 'No notes')}</div>
        </div>
      `).join('') : `
        <div style="text-align: center; padding: 28px 18px; color: var(--ink-soft); font-size: var(--font-sm); background: var(--bone); border: 1px dashed var(--line); border-radius: 10px;">
          <div style="font-weight: 700;">No server records yet</div>
          <div style="font-size: var(--font-xs); margin-top: 6px;">Records land here permanently once clients sign — from any device.</div>
        </div>
      `;
    } catch (err) {
      console.warn("Server contract records load failed:", err);
      toast("Couldn't load server records — check the server connection.");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "☁️ Load Server Records"; }
    }
  };

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
            <span id="adminPricingSaveStatus" style="font-size: var(--font-xs); font-weight: 700; color: #059669; background: rgba(5,150,105,0.12); padding: 4px 10px; border-radius: 12px; border: 1px solid #059669; font-family: var(--mono-font); display: inline-block; margin-bottom: 8px;">🟢 ALL CHANGES SAVED TO LIVE SITE</span>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0 0 12px 0;">Edit max package rates (INR), package names, or deliverable descriptions. Click <strong>Save &amp; Push Live</strong> to update booking forms.</p>
            <div style="background: var(--paper); border: 1px solid var(--accent); border-radius: 8px; padding: 12px 16px; margin-bottom: 12px;">
              <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); display: block; margin-bottom: 4px; text-transform: uppercase;">🏠 Home Studio Rental (Noida)</span>
              <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0 0 8px 0; font-family: 'Outfit', sans-serif;">Charged when someone picks the home studio, and shown as its own line in their quote. Set <strong>0</strong> to switch it off. An invite code that locks a venue carries its own price and ignores both of these.</p>
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
              <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 8px 0 0 0; font-family: 'Outfit', sans-serif;">Leave the test-shoot box <strong>empty</strong> and collaborations pay the same as paid shoots.</p>
            </div>
            <div id="adminPackagesEditorGrid" style="display: flex; flex-direction: column; gap: 8px;"></div>
          </div>
        </div>

        <div class="admin-panel">
          <div class="admin-panel-head" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; cursor: pointer; user-select: none;" onclick="const b=document.getElementById('adminPromoBody');const a=document.getElementById('adminPromoArrow');const open=b.style.display!=='none';b.style.display=open?'none':'block';a.textContent=open?'▼':'▲';">
            <span style="display: flex; align-items: center; gap: 8px;">Promo codes</span>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button type="button" class="admin-cal-btn primary" onclick="event.stopPropagation();document.getElementById('adminPromoBody').style.display='block';document.getElementById('adminPromoArrow').textContent='▲';window.addNewAdminPromoCode()">Add promo code</button>
              <span id="adminPromoArrow" style="font-size: var(--font-xs); color: var(--ink-soft); font-weight: 700;">▼</span>
            </div>
          </div>
          <div id="adminPromoBody" style="display: none; margin-top: 12px;">
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
              <button type="button" class="admin-cal-btn primary" onclick="event.stopPropagation();document.getElementById('adminInviteBody').style.display='block';document.getElementById('adminInviteArrow').textContent='▲';window.addNewAdminInviteCode()">Add invite code</button>
              <span id="adminInviteArrow" style="font-size: var(--font-xs); color: var(--ink-soft); font-weight: 700;">▼</span>
            </div>
          </div>
          <div id="adminInviteBody" style="display: none; margin-top: 12px;">
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
      location: "Studio Space, Noida Sector 62 / Outdoor NCR",
      package: "₹10,000 Package — 50 Proof Clicks + 8 Retouched Master Clicks",
      notes: "",
      contractVersion: preselectedVersion || window.ACTIVE_CONTRACTS.commercial
    };
    // bookingId may be a plain object of typed details (day modal's "Draft
    // contract PDF"): no calendar entry exists, so seed the form from it. A
    // test-shoot type with no explicit version lets the TFP release preselect.
    let b;
    if (bookingId && typeof bookingId === "object") {
      b = Object.assign({}, defaults, bookingId);
      if (!bookingId.contractVersion && /test|tfp/i.test(b.type || "")) b.contractVersion = "";
    } else {
      b = bookings.find(x => x.id === bookingId || x.name === bookingId) || defaults;
    }

    let modal = document.getElementById("pdfContractGeneratorModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "pdfContractGeneratorModal";
      modal.className = "modal-overlay";
      modal.style.cssText = "position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.65); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 20px;";
      document.body.appendChild(modal);
    }

    const dVal = dKey || (new Date()).toISOString().split("T")[0];
    const isTest = b.type && /test|tfp/i.test(b.type);
    const genSelected = (() => {
      const raw = String(b.contractVersion || "").trim();
      if (raw === "Custom Contract") return raw;
      const fallback = isTest ? window.ACTIVE_CONTRACTS.tfp : window.ACTIVE_CONTRACTS.commercial;
      if (!raw || raw === "Pending Agreement") return fallback;
      const r = window.resolveContractArchive(raw);
      return r ? r.version : fallback;
    })();

    modal.innerHTML = `
      <div class="modal-content" style="background: var(--paper); border: 1px solid var(--line); border-radius: 14px; max-width: 720px; width: 100%; max-height: 90vh; display: flex; flex-direction: column; box-shadow: var(--shadow); overflow: hidden; animation: modalFadeIn 0.3s ease;">
        <div style="padding: 20px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; background: var(--bone);">
          <div>
            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink);">📄 Generate PDF Contract &amp; Agreement</h3>
            <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 2px;">Prepare A4 PDF Contract for Off-Site &amp; DM/Email Bookings</div>
          </div>
          <button type="button" id="closePdfGenModal" style="background: none; border: none; font-size: var(--font-md); cursor: pointer; color: var(--ink-soft); padding: 4px;">✕</button>
        </div>

        <div style="padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px;">
          <div style="background: rgba(var(--accent-rgb), 0.05); border: 1px solid var(--accent); border-radius: 8px; padding: 12px; font-size: var(--font-xs); color: var(--ink); line-height: 1.5;">
            💡 <strong>Off-Site / DM Inquiry Workflow:</strong> Fill or edit the booking details below. Click <strong>🖨️ Print / Save as A4 PDF</strong> to download your official contract, then copy the <strong>Approval Message</strong> to paste into IG DM or Gmail!
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Client Name *
              <input type="text" id="pdf_clientName" value="${esc(b.name || '')}" placeholder="e.g. Rahul Sharma / Model Name" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
            </label>
            <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Instagram / Handle / Website
              <input type="text" id="pdf_instagram" value="${esc(b.instagram || b.handle || '')}" placeholder="e.g. @handle or website.com" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
            </label>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Client Email Address
              <input type="email" id="pdf_email" value="${esc(b.email || '')}" placeholder="client@example.com" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
            </label>
            <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Phone Number
              <input type="tel" id="pdf_phone" value="${esc(b.phone || '')}" placeholder="+91 98765-43210" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
            </label>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Shoot Date / Timeline *
              <input type="text" id="pdf_date" value="${esc(dVal)}" placeholder="YYYY-MM-DD or Mid-August" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
            </label>
            <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Shoot Duration
              <select id="pdf_duration" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
                <option value="Full Day (10:30 AM – 5:30 PM)" ${(b.duration && b.duration.includes('Full Day')) || !b.duration ? 'selected' : ''}>Full Day Shoot (10:30 AM – 5:30 PM · 7 Hours)</option>
                <option value="Half Day Morning (10:30 AM – 2:30 PM)" ${b.duration && b.duration.includes('Morning') ? 'selected' : ''}>Half Day Morning (10:30 AM – 2:30 PM · 4 Hours)</option>
                <option value="Half Day Afternoon (1:30 PM – 5:30 PM)" ${b.duration && b.duration.includes('Afternoon') ? 'selected' : ''}>Half Day Afternoon (1:30 PM – 5:30 PM · 4 Hours)</option>
                <option value="Flexible / Photographer Choice" ${b.duration && b.duration.includes('Flexible') ? 'selected' : ''}>Flexible / Photographer Choice (Photographer Recommends Best Time)</option>
                <option value="Custom Timings (Specify Call & Wrap Time)" ${b.duration && b.duration.includes('Custom') ? 'selected' : ''}>Custom Timings (Specify Call &amp; Wrap Time)</option>
              </select>
            </label>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Shoot Location Address *
              <input type="text" id="pdf_location" value="${esc(b.location || 'Studio Space, Noida / Outdoor NCR')}" placeholder="e.g. Sector 62 Studio, Noida / Client Venue" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
              <span style="display: flex; align-items: flex-start; gap: 7px; margin-top: 7px; font-weight: 400; line-height: 1.4;">
                <input type="checkbox" id="pdf_venueByStudio" ${b.venueByStudio ? 'checked' : ''} style="margin-top: 2px; flex-shrink: 0;" />
                <span>Venue provided by the studio — no rental billed to the client. Ticked automatically for bookings that came in on an invite code carrying a location; tick it by hand for shoots you are supplying the space for.</span>
              </span>
            </label>
            <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Contract Document Version *
              <select id="pdf_contractVersion" data-contract-select="1" data-custom="1" data-prev-value="${esc(genSelected)}" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">${contractVersionOptionsHtml({ selected: genSelected })}</select>
            </label>
          </div>

          <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Package Tier &amp; Deliverables Specs *
            <select id="pdf_packageSelect" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
              <option value="custom" selected>✏️ Custom Package / Bespoke Deliverables (Specify Below)</option>
              <option value="₹7,000 (20 Proof Clicks · 0 Retouched)">₹7,000 · Basic Test / Comp Card (20 Proof Clicks + 0 Retouched)</option>
              <option value="₹10,000 (25 Proof Clicks + 3-5 Retouched)">₹10,000 · Mini Portfolio (25 Proof Clicks + 3-5 Retouched Clicks)</option>
              <option value="₹25,000 (50 Proof Clicks + 8-12 Retouched)">₹25,000 · Standard Editorial Portfolio (50 Proof Clicks + 8-12 Retouched)</option>
              <option value="₹50,000 (100 Proof Clicks + 15-25 Retouched)">₹50,000 · Premium Brand Campaign (100 Proof Clicks + 15-25 Retouched)</option>
              <option value="₹50,000+ (Full Proof Gallery + 30+ Commercial Retouched)">₹50,000+ · Full Proof Gallery + 30+ Commercial Master Retouched Assets</option>
              <option value="Test Shoot / TFP (Full Proof Gallery + 8-12 Retouched)">Test Shoot / TFP · Full Proofing Gallery + 8 to 12 Retouched Clicks</option>
            </select>
          </label>

          <div id="pdf_customPackage_wrap" style="background: var(--bone); border: 1px solid var(--line); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
            <div style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em;">🛠️ Bespoke Package Details &amp; Download Permissions</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Custom Package Name &amp; Price
                <input type="text" id="pdf_customPkgName" value="₹15,000 Commercial Retainer" placeholder="e.g. ₹15,000 Custom Brand Retainer" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
              </label>
              <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Retouched Master Clicks Included
                <input type="text" id="pdf_customRetouchedCount" value="8 Master Retouched Clicks" placeholder="e.g. 10 Retouched Master Clicks" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
              </label>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Unedited Gallery Download Permission
                <select id="pdf_customDownloadPermission" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
                  <option value="Proofing View Only (Download Restricted to Billed Retouched Clicks)" selected>Proofing View Only (Download Restricted to Contracted Retouched Clicks)</option>
                  <option value="Full Unedited Gallery Download Included">Full Unedited High-Res Gallery Download Included</option>
                </select>
              </label>
              <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Editing Revision Limit
                <select id="pdf_customRevisions" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
                  <option value="1 Round of Minor Revisions (Within 7 Days)" selected>1 Round of Minor Revisions (Within 7 Days)</option>
                  <option value="2 Rounds of Minor Revisions (Within 14 Days)">2 Rounds of Minor Revisions (Within 14 Days)</option>
                  <option value="No Revisions Included (Extra Revisions Billed at ₹1,500/image)">No Revisions Included (Billed at ₹1,500/image)</option>
                </select>
              </label>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Cloud Storage Archival Window *
                <select id="pdf_customCloudRetention" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
                  <option value="3 Months Cloud Retention (Standard Test Shoot / TFP)">3 Months Cloud Retention (Test Shoots / TFP)</option>
                  <option value="6 Months Cloud Retention (Standard Paid Commercial Shoot)" selected>6 Months Cloud Retention (Paid Commercial Shoots)</option>
                  <option value="12 Months Extended Archival (1 Year)">12 Months Extended Archival (1 Year)</option>
                  <option value="1 Month Cloud Retention (30 Days Express)">1 Month Cloud Retention (30 Days)</option>
                  <option value="custom">✏️ Custom Retention Expiry Date / Months (Specify Below)</option>
                </select>
                <div id="pdf_customCloudRetentionWrap" style="display: none; margin-top: 6px;">
                  <input type="text" id="pdf_customCloudRetentionInput" value="2 Months (Expiry: Oct 15, 2026)" placeholder="e.g. 2 Months / Expiry: Oct 15, 2026" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit;" />
                </div>
              </label>
            </div>
          </div>

          <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Payment Milestone Terms
            <select id="pdf_paymentMilestones" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
              <option value="5050">Standard 50/50 Milestones (50% Advance Retainer / 50% Final Balance prior to file download)</option>
              <option value="503020">3-Tier Campaign Milestones (50% Advance / 30% Proofing / 20% Final Deliverables)</option>
              <option value="tfp">TFP / Test Shoot Collab (0 Fee, Full Proofing Gallery + 8-12 Retouched Clicks)</option>
            </select>
          </label>

          <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Production Notes &amp; Call Time
            <textarea id="pdf_notes" rows="2" placeholder="e.g. Call time 9:00 AM, 3 wardrobe changes, client brings own outfits." style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">${esc(b.notes || '')}</textarea>
          </label>
        </div>

        <div style="padding: 16px 24px; border-top: 1px solid var(--line); display: flex; gap: 10px; justify-content: space-between; background: var(--bone); flex-wrap: wrap;">
          <button type="button" class="admin-cal-btn" id="copyApprovalMsgBtn" style="border-color: var(--accent); color: var(--accent); font-weight: 700;">📋 Copy Approval Message for DM/Gmail</button>
          <div style="display: flex; gap: 10px;">
            <button type="button" class="admin-cal-btn" id="cancelPdfGenBtn">Cancel</button>
            <button type="button" class="admin-cal-btn primary" id="triggerPrintPdfBtn" style="font-weight: 700;">🖨️ Print / Save as A4 PDF</button>
          </div>
        </div>
      </div>
    `;

    $("#pdf_packageSelect")?.addEventListener("change", () => {
      const isCustom = $("#pdf_packageSelect").value === "custom";
      const wrap = $("#pdf_customPackage_wrap");
      if (wrap) wrap.style.display = isCustom ? "flex" : "none";
    });

    $("#pdf_customCloudRetention")?.addEventListener("change", () => {
      const isCustomRet = $("#pdf_customCloudRetention").value === "custom";
      const wrapRet = $("#pdf_customCloudRetentionWrap");
      if (wrapRet) wrapRet.style.display = isCustomRet ? "block" : "none";
    });

    $("#closePdfGenModal")?.addEventListener("click", () => modal.style.display = "none");
    $("#cancelPdfGenBtn")?.addEventListener("click", () => modal.style.display = "none");

    $("#copyApprovalMsgBtn")?.addEventListener("click", () => {
      const name = $("#pdf_clientName").value.trim() || "Client";
      const date = $("#pdf_date").value.trim() || "scheduled date";
      const ver = $("#pdf_contractVersion").value;
      const msg = `Hi ${name}! Please find attached your Studio Booking Contract & Production Agreement for ${date}.\n\nPlease review the PDF document and reply to this email / DM with: "I approve and agree to Studio Contract Terms ${ver} for ${date}" to confirm your session.\n\nStudio Operations · nerdyphotographer.in`;
      navigator.clipboard.writeText(msg).then(() => {
        toast("📋 Approval message copied to clipboard! Paste it into IG DM or Gmail when sending the PDF.");
      }).catch(() => {
        toast("Copy failed, please copy manually.");
      });
    });

    $("#triggerPrintPdfBtn")?.addEventListener("click", () => {
      window.printContractPdf({
        clientName: $("#pdf_clientName").value.trim(),
        instagram: $("#pdf_instagram").value.trim(),
        email: $("#pdf_email").value.trim(),
        phone: $("#pdf_phone").value.trim(),
        date: $("#pdf_date").value.trim(),
        duration: $("#pdf_duration").value,
        location: $("#pdf_location").value.trim(),
        studioProvidedByPhotographer: !!$("#pdf_venueByStudio")?.checked,
        contractVersion: $("#pdf_contractVersion").value,
        package: $("#pdf_packageSelect").value === "custom"
          ? (() => {
              const cloudRetention = $("#pdf_customCloudRetention").value === "custom"
                ? $("#pdf_customCloudRetentionInput").value.trim()
                : $("#pdf_customCloudRetention").value;
              return `${$("#pdf_customPkgName").value.trim()} — ${$("#pdf_customRetouchedCount").value.trim()} (${$("#pdf_customDownloadPermission").value}; ${$("#pdf_customRevisions").value}; ${cloudRetention})`;
            })()
          : $("#pdf_packageSelect").value,
        paymentMilestones: $("#pdf_paymentMilestones").value,
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
    const homeStudioRiderHtml = (studioByPhotographer && /home studio/i.test(studioLocation))
      ? ` Attendance is limited to a maximum of 3 people in total including the Participant and any crew they bring (hair &amp; makeup, stylist, assistants or guests all count towards this limit); the session runs within booked daylight hours and concludes by <strong>7:00 PM</strong>; the full address is shared on booking confirmation; guests may not attend unaccompanied.`
      : ``;
    const studioClauseTfp = studioByPhotographer
      ? `Studio venue for this session is provided by the photographer${studioLocation ? ` at <strong>${esc(studioLocation)}</strong>` : ""} at no additional rental charge to the talent.${homeStudioRiderHtml}`
      : `If a dedicated indoor studio venue/space is required, applicable venue rental fees are quoted separately in advance.`;

    const innerHtml = `
      <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #111; padding: 20px; max-width: 800px; margin: 0 auto; background: #fff; line-height: 1.5;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 18px;">
          <div>
            <div style="font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #000;">NERDYPHOTOGRAPHER.IN</div>
            <div style="font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 2px;">Fashion, Fitness &amp; Commercial Photography Studio</div>
            <div style="font-size: 11px; color: #555; margin-top: 2px;">Web: www.nerdyphotographer.in · Email: ${window.STUDIO_CONFIG?.email || "prateeksaxenaphotography@gmail.com"}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-family: monospace; font-size: 11px; font-weight: 700; background: #f0f0f0; border: 1px solid #ccc; padding: 4px 10px; border-radius: 4px;">REF: WPS-CONTRACT-${esc(cVer)}-${esc(data.date || 'BLANK')}</div>
            <div style="font-size: 10px; color: #666; margin-top: 4px;">Issued: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </div>
        </div>

        <h2 style="font-family: 'Outfit', sans-serif; font-size: 17px; font-weight: 800; text-transform: uppercase; margin: 0 0 14px; text-align: center; letter-spacing: 0.05em;">
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
            <strong>📸 TFP Test Shoot Terms:</strong> This session is structured for mutual portfolio growth. Deliverables include a Full Proofing Gallery + 8 to 12 Retouched Master Clicks. RAW format files are strictly confidential studio property and are excluded. ${studioClauseTfp}
          ` : `
            <strong>💳 Payment Milestones:</strong> ${data.paymentMilestones === '503020' ? '3-Tier Milestones (50% Advance Retainer / 30% Proofing / 20% Final Deliverables).' : 'Standard 50/50 Milestones (50% Advance Retainer prior to shoot start [non-refundable]; 50% Final Balance prior to file download [non-refundable]).'}<br/>
            <strong>🏢 Studio Venue Rental Policy:</strong> ${studioByPhotographer
              ? `The venue for this session${studioLocation ? ` (<strong>${esc(studioLocation)}</strong>)` : ''} is arranged and paid for by the Studio — <strong>no venue rental is billed to the client</strong>.${homeStudioRiderHtml}`
              : `Dedicated indoor studio venue rentals are <strong>quoted separately in advance</strong>, or the client may directly book their preferred studio space for the session.`}
          `}
        </div>

        <!-- Contract Terms Text -->
        <div style="margin-bottom: 20px;">
          <h3 style="font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 800; text-transform: uppercase; border-bottom: 1px solid #111; padding-bottom: 4px; margin: 0 0 8px;">
            Terms &amp; Conditions (Contract Version ${esc(cVer)})
          </h3>
          <div style="font-size: 10px; line-height: 1.5; color: #222; text-align: justify; white-space: pre-wrap;">${esc(contractText)}</div>
        </div>

        <!-- Digital & Physical Pen Signature Acceptance Block -->
        <div style="border: 2px dashed #111; border-radius: 8px; padding: 12px; background: #fff; page-break-inside: avoid;">
          <div style="font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #000; margin-bottom: 4px; text-align: center;">
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
        <title>WPS Contract ${cVer}</title>
        <meta name="color-scheme" content="light">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
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
          h1, h2, h3, h4 { font-family: 'Outfit', sans-serif; color: #000000 !important; }
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
              <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: var(--font-md); font-weight: 700; color: var(--ink);">${esc(contract.title)}</h3>
              <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 2px; font-family: var(--mono-font);">Effective: <strong>${esc(contract.effectiveDate)}</strong> · Status: <span style="color: var(--accent); font-weight:700;">${esc(contract.status)}</span></div>
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
            <button type="button" class="admin-cal-btn" onclick="document.getElementById('contractArchiveModal').style.display='none'; window.openPdfContractGenerator('', '', '${esc(contract.version)}');" style="border-color: var(--accent); color: var(--accent); font-weight: 700;">🖨️ Print PDF of ${esc(contract.version)}</button>
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
            <div style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink); margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
              <span id="promoCreatorFormTitle">🎟️ Create New Custom Promotional Discount Code</span>
              <button type="button" onclick="document.getElementById('promoCreatorForm').style.display='none'" style="background:none; border:none; color:var(--ink-soft); font-size: var(--font-sm); cursor:pointer;">✕</button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; align-items: flex-end;">
              <div>
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; display: block; margin-bottom: 4px;">Promo Code String *</label>
                <input type="text" id="newPromoName" placeholder="e.g. SUMMER30" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-weight: 700; font-family: var(--mono-font); text-transform: uppercase; background: var(--bone); color: var(--ink);" />
              </div>
              <div>
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; display: block; margin-bottom: 4px;">Discount Type *</label>
                <select id="newPromoType" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: var(--font-xs); font-weight: 700; background: var(--bone); color: var(--ink);">
                  <option value="pct">Percentage Off (%)</option>
                  <option value="flat">Flat Amount (INR ₹)</option>
                </select>
              </div>
              <div>
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; display: block; margin-bottom: 4px;">Value Amount *</label>
                <input type="number" id="newPromoVal" placeholder="e.g. 30 or 1500, or 0 for home studio only" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-weight: 700; color: #059669; background: var(--bone);" />
              </div>
              <div style="grid-column: span 2;">
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; display: block; margin-bottom: 4px;">Description Label</label>
                <input type="text" id="newPromoDesc" placeholder="e.g. 30% Off Summer Shoots" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: var(--font-xs); background: var(--bone); color: var(--ink);" />
              </div>
              <div style="grid-column: span 2; background: var(--bone); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px;">
                <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; display: block; margin-bottom: 4px;">🏠 Home Studio Rental Discount</label>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <select id="newPromoHomeStudioType" onchange="window.togglePromoHomeStudioValField()" style="flex: 1; min-width: 150px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: var(--font-xs); font-weight: 700; background: var(--paper); color: var(--ink);">
                    <option value="none">No discount on the rental</option>
                    <option value="free">Free — 100% off</option>
                    <option value="flat">Flat ₹ off</option>
                    <option value="pct">% off</option>
                  </select>
                  <input type="number" id="newPromoHomeStudioVal" placeholder="e.g. 500" style="flex: 1; min-width: 100px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-weight: 700; color: #059669; background: var(--paper); display: none;" />
                </div>
                <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 4px; line-height: 1.4;">Only applies when the booking actually carries a home studio rental (dropdown pick, or a locked invite venue with a cost).</div>
              </div>
              <div style="grid-column: span 2;">
                <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer; background: var(--bone); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px;">
                  <input type="checkbox" id="newPromoIncludeAddons" style="width: 16px; height: 16px; margin-top: 2px; accent-color: var(--accent); cursor: pointer;" />
                  <span style="font-size: var(--font-xs); color: var(--ink); font-family: 'Outfit', sans-serif; line-height: 1.4;">
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
          return `
            <div style="background: var(--paper); border: 1px solid var(--accent); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; justify-content: space-between; gap: 10px; box-shadow: var(--shadow-sm); overflow: hidden;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
                <div style="min-width: 0; flex: 1;">
                  <span style="font-size: var(--font-xs); font-weight: 800; color: var(--accent); text-transform: uppercase; font-family: var(--mono-font); display: block;">${idx === 0 ? '⭐ Primary Code' : '🔑 VIP Invite'}</span>
                  <strong style="font-size: var(--font-md); font-family: var(--mono-font); color: var(--ink); letter-spacing: 0.04em; display: block; margin-top: 2px; word-break: break-all;">${esc(codeStr)}</strong>
                  <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 4px; line-height: 1.3;">📝 ${esc(descStr)}</div>
                  ${itemObj && typeof itemObj === 'object' && itemObj.location ? `<div style="font-size: var(--font-xs); color: #059669; font-weight: 700; margin-top: 4px;">🏠 Location Locked: ${esc(itemObj.location)}</div>` : ''}
                </div>
                <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap; flex-shrink: 0; margin-top: 2px;">
                  <button type="button" onclick="navigator.clipboard.writeText('${escJs(codeStr)}'); if(typeof toast==='function') toast('📋 Invite Code ${escJs(codeStr)} copied!'); else alert('Copied!');" style="background: var(--accent); color: #ffffff; border: none; padding: 5px 9px; border-radius: 4px; font-size: var(--font-xs); cursor: pointer; font-weight: 700; font-family: var(--mono-font);" title="Copy Invite Code">📋 Copy</button>
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
                <div style="font-size: var(--font-xs); font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em;">🔑 Photographer Direct Invite Codes (VIP / TFP Unlock Manager)</div>
                <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 2px;">Create, edit, auto-generate, or delete multiple active invite codes. Invited talent entering ANY active code on /book unlocks a Test Shoot / TFP session.</div>
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button type="button" onclick="window.addNewAdminInviteCode()" class="admin-cal-btn primary" style="font-size: var(--font-xs); padding: 5px 12px; font-weight: 700;">➕ Add Custom Code</button>
                <button type="button" onclick="window.generateRandomAdminInviteCode()" class="admin-cal-btn" style="font-size: var(--font-xs); padding: 5px 12px; font-weight: 700; border-color: var(--accent); color: var(--accent);">🎲 Auto-Generate Random VIP Code</button>
              </div>
            </div>
            <div id="inviteCreatorForm" style="display: none; background: var(--paper); border: 1.5px solid var(--accent); border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; box-shadow: var(--shadow-sm); animation: modalFadeIn 0.3s ease;">
              <div style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink); margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                <span id="inviteCreatorFormTitle">🔑 Add New Invite Code</span>
                <button type="button" onclick="document.getElementById('inviteCreatorForm').style.display='none'" style="background:none; border:none; color:var(--ink-soft); font-size: var(--font-sm); cursor:pointer;">✕</button>
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; align-items: flex-end;">
                <div>
                  <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; display: block; margin-bottom: 4px;">Invite Code String *</label>
                  <input type="text" id="newInviteCode" placeholder="e.g. VIP-2431" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-weight: 700; font-family: var(--mono-font); text-transform: uppercase; background: var(--bone); color: var(--ink);" />
                </div>
                <div style="grid-column: span 2;">
                  <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; display: block; margin-bottom: 4px;">Description Label</label>
                  <input type="text" id="newInviteDesc" placeholder="e.g. Agency model unlock pass" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: var(--font-xs); background: var(--bone); color: var(--ink);" />
                </div>
                <div style="grid-column: span 3;">
                  <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; display: block; margin-bottom: 4px;">🏠 Lock Location for Client <span style="font-weight:400;text-transform:none;color:var(--ink-soft);">(optional — leave blank to let client fill)</span></label>
                  <input type="text" id="newInviteLocation" placeholder="e.g. Home Studio, Sector 15, Noida — or leave blank" oninput="window.syncInviteWaiveVisibility && window.syncInviteWaiveVisibility()" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: var(--font-xs); background: var(--bone); color: var(--ink);" />
                </div>
                <!-- Only shown when the code leaves the venue to the talent. A
                     code that names a venue has already had it chosen for them
                     by the studio, so the rental is waived and there is nothing
                     here to decide. -->
                <div id="newInviteWaiveRow" style="grid-column: span 3; display: none;">
                  <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; display: block; margin-bottom: 4px;">💰 Venue cost for this code <span style="font-weight:400;text-transform:none;color:var(--ink-soft);">(optional — leave blank if it is free)</span></label>
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
                  <label style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; display: block; margin-bottom: 4px;">🏠 Home Studio Rental Discount</label>
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
          return `
            <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 10px; box-shadow: var(--shadow-sm); overflow: hidden; flex-wrap: wrap;">
              <div style="min-width: 0; flex: 1;">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <strong style="color: #059669; font-size: var(--font-sm); font-family: var(--mono-font); letter-spacing: 0.04em;">${esc(codeKey)}</strong>
                  <span style="font-size: var(--font-xs); font-weight: 700; background: rgba(5,150,105,0.12); color: #059669; padding: 2px 6px; border-radius: 4px;">${esc(tagDesc)}</span>
                  ${!hasPackageDiscount
                    ? ""
                    : item.includeAddons
                      ? `<span style="font-size: var(--font-xs); font-weight: 700; background: rgba(217,119,6,0.14); color: #d97706; padding: 2px 6px; border-radius: 4px;" title="This discount also comes off the home studio rental">+ ADD-ONS</span>`
                      : `<span style="font-size: var(--font-xs); font-weight: 700; background: rgba(120,120,120,0.14); color: var(--ink-soft); padding: 2px 6px; border-radius: 4px;" title="Discount applies to the package rate only">PACKAGE ONLY</span>`}
                  ${hsBadge}
                </div>
                <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 2px;">${esc(item.label)}</div>
              </div>
              <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap; flex-shrink: 0;">
                <button type="button" onclick="navigator.clipboard.writeText('${escJs(codeKey)}'); if(typeof toast==='function') toast('📋 Promo Code ${escJs(codeKey)} copied!'); else alert('Copied!');" style="background: #059669; color: #ffffff; border: none; padding: 5px 10px; border-radius: 4px; font-size: var(--font-xs); cursor: pointer; font-weight: 700; font-family: var(--mono-font);" title="Copy Code">📋 Copy</button>
                <button type="button" onclick="window.editAdminPromoCode('${escJs(codeKey)}')" style="background: var(--bone); color: var(--ink); border: 1px solid var(--line); padding: 5px 8px; border-radius: 4px; font-size: var(--font-xs); cursor: pointer; font-weight: 700;" title="Edit Code">✏️ Edit</button>
                <button type="button" onclick="window.deleteAdminPromoCode('${escJs(codeKey)}')" style="background: rgba(255,77,77,0.1); color: #ff4d4d; border: 1px solid rgba(255,77,77,0.3); padding: 5px 8px; border-radius: 4px; font-size: var(--font-xs); cursor: pointer; font-weight: 700;" title="Delete Code">🗑️</button>
              </div>
            </div>
          `;
        }).join("");

        promoGrid.innerHTML = creatorFormHtml + codeCardsHtml;
        const inviteGrid = $("#adminInviteCodesGrid");
        if (inviteGrid) inviteGrid.innerHTML = inviteCardHtml;
      }

      // Attach input change listener to flip status badge to UNSAVED CHANGES
      setTimeout(() => {
        const editorInputs = document.querySelectorAll(".pkg-edit-name, .pkg-edit-price, .pkg-edit-specs");
        editorInputs.forEach(input => {
          input.addEventListener("input", () => {
            const statusBadge = document.getElementById("adminPricingSaveStatus");
            if (statusBadge && !statusBadge.textContent.includes("UNSAVED")) {
              statusBadge.style.color = "#d97706";
              statusBadge.style.background = "rgba(217,119,6,0.15)";
              statusBadge.style.borderColor = "#d97706";
              statusBadge.innerHTML = '⚠️ UNSAVED CHANGES — Click "Save Pricing Changes"';
            }
          });
        });
      }, 50);

      const pkgsGrid = $("#adminPackagesEditorGrid");
      if (!pkgsGrid) return;
      const pkgs = getAdminPackages();
      pkgsGrid.innerHTML = pkgs.map((p, idx) => `
        <div class="admin-pkg-editor-row" style="background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; display: grid; grid-template-columns: 1.4fr 0.9fr 2.2fr 110px; gap: 10px; align-items: center;">
          <div>
            <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); display: block; margin-bottom: 4px; text-transform: uppercase;">Package Name #${idx+1}</span>
            <input type="text" class="pkg-edit-name" value="${esc(p.name)}" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); font-weight: 700; background: var(--bone); color: var(--ink);" />
          </div>
          <div>
            <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); display: block; margin-bottom: 4px; text-transform: uppercase;">Max Rate (INR ₹)</span>
            <input type="number" class="pkg-edit-price" value="${p.price}" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); font-weight: 800; color: #059669; background: var(--bone);" />
          </div>
          <div>
            <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); display: block; margin-bottom: 4px; text-transform: uppercase;">Deliverable Specs</span>
            <input type="text" class="pkg-edit-specs" value="${esc(p.specs)}" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); background: var(--bone); color: var(--ink);" />
          </div>
          <div style="display: flex; gap: 4px; justify-content: flex-end; padding-top: 14px;">
            <button type="button" class="admin-cal-btn" onclick="window.copyPackageBookingLink(${p.price})" title="Copy Shareable Booking Link" style="font-size: var(--font-xs); padding: 6px 8px; border-color: var(--accent); color: var(--accent); font-weight: 700;">🔗 Share Link</button>
            <button type="button" class="admin-cal-btn" onclick="window.moveAdminPackageRow(${idx}, -1)" title="Move Up" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:not-allowed; padding:6px 8px; font-size: var(--font-xs);"' : 'style="padding:6px 8px; font-size: var(--font-xs);"'}>▲</button>
            <button type="button" class="admin-cal-btn" onclick="window.moveAdminPackageRow(${idx}, 1)" title="Move Down" ${idx === pkgs.length - 1 ? 'disabled style="opacity:0.3; cursor:not-allowed; padding:6px 8px; font-size: var(--font-xs);"' : 'style="padding:6px 8px; font-size: var(--font-xs);"'}>▼</button>
            <button type="button" class="admin-cal-btn" onclick="window.deleteAdminPackageRow(${idx})" title="Delete Package Tier" style="color: #b22222; border-color: rgba(178,34,34,0.3); padding: 6px 8px; font-size: var(--font-xs);">🗑️</button>
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
            <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); display: block; margin-bottom: 4px; text-transform: uppercase;">Test shoot / TFP</span>
            <input type="text" id="tfpPkgName" value="${esc(tfp.name)}" oninput="window.markUnsavedChanges && window.markUnsavedChanges()" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); font-weight: 700; background: var(--bone); color: var(--ink);" />
          </div>
          <div>
            <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); display: block; margin-bottom: 4px; text-transform: uppercase;">Fee</span>
            <div style="padding: 8px 10px; border: 1px dashed var(--line); border-radius: 6px; font-size: var(--font-xs); color: var(--ink-soft); background: transparent;">No fee · rental set above</div>
          </div>
          <div>
            <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); display: block; margin-bottom: 4px; text-transform: uppercase;">Deliverable Specs</span>
            <input type="text" id="tfpPkgSpecs" value="${esc(tfp.specs)}" oninput="window.markUnsavedChanges && window.markUnsavedChanges()" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-xs); background: var(--bone); color: var(--ink);" />
          </div>
          <div style="display: flex; gap: 4px; justify-content: flex-end; padding-top: 14px;">
            <button type="button" class="admin-cal-btn" onclick="window.copyTfpBookingLink()" title="Copy a booking link that opens the test-shoot form with your primary invite code" style="font-size: var(--font-xs); padding: 6px 8px; border-color: var(--accent); color: var(--accent); font-weight: 700;">Share link</button>
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
          <button type="button" class="admin-cal-btn" style="padding: 3px 8px; font-size: var(--font-xs); font-family: var(--mono-font); ${calYear === m.yr && calMonth === m.mo ? 'background: var(--accent); color: #fff; font-weight: 700; border-color: var(--accent);' : ''}" onclick="window.jumpToCalMonth(${m.yr}, ${m.mo})">${m.label}</button>
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
        const contractLine = isNonContract
          ? `<span>Internal activity · no contract</span>`
          : v === "Pending Agreement" ? `<span style="color: #B7791F; font-weight: 600;">Agreement pending</span>`
          : v === "Custom Contract" ? `<span>Custom contract / MSA</span>`
          : `<span><strong>Agreed:</strong> ${esc(v)}</span>${(v !== "Pending Agreement" && v !== "Custom Contract") ? ` <button type="button" class="linkish" onclick="window.openContractArchiveModal('${esc(v)}')">View terms ↗</button>` : ""}`;
        const statusPill = b.status === "workshop" ? `<span class="roster-pill roster-pill-workshop">Workshop</span>` : b.status === "assisting" ? `<span class="roster-pill roster-pill-assisting">Assisting</span>` : (b.isTentative || b.status === "tentative") ? `<span class="roster-pill roster-pill-hold">Hold</span>` : `<span class="roster-pill roster-pill-confirmed">Confirmed</span>`;
        const links = (b.links && b.links.length) ? `<div><strong>Reference links:</strong> ${b.links.map(l => `<a href="${esc(l)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); word-break: break-all;">${esc(l)} ↗</a>`).join(" · ")}</div>` : "";
        const atts = (b.attachments && b.attachments.length) ? `<div><strong>Attachments:</strong> ${b.attachments.map(att => `<a href="${esc(att.dataUrl)}" download="${esc(att.name)}" target="_blank" style="color: var(--accent);">${esc(att.name)} (${Math.round(att.size/1024)} KB)</a>`).join(" · ")}</div>` : "";
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
            <summary style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; color: var(--ink-soft); cursor: pointer; padding: 8px 0; user-select: none;">
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
            <h2 style="font-family: 'Outfit', sans-serif; font-size: var(--font-md); font-weight: 800; margin: 0 0 16px; color: var(--ink);">Edit Booking for ${dKey}</h2>
            
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
              : `<div class="dam-booking-sub">Contract · ${esc(b.contractVersion || "Pending agreement")}</div>`}
            ${isSigImage(b.sigDataUrl) ? `<img class="dam-booking-sig" src="${b.sigDataUrl}" alt="" title="Client digital signature captured at booking" />` : ""}
            ${b.links && b.links.length ? b.links.map(l => `<a class="dam-booking-link" href="${esc(l)}" target="_blank" rel="noopener noreferrer">${esc(l)} ↗</a>`).join("") : ""}
            ${b.attachments && b.attachments.length ? `<div>${b.attachments.map(att => `<a class="dam-att" href="${esc(att.dataUrl)}" download="${esc(att.name)}" target="_blank">${esc(att.name)}</a>`).join("")}</div>` : ""}
          </div>
          <div class="dam-booking-actions">
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
        addCalBooking(dKey, { name: clientName, type: "Selective Collaboration (TFP)", notes: notes, isTentative: false, status: "confirmed", contractVersion: "V3.6-TFP", agreedToTerms: false });
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
        await syncToGitHub(SHOOTS);
      } finally {
        btnEl.disabled = false;
        btnEl.textContent = orig;
      }
    });

    const pay5050Btn = $("#adminPay5050Btn");
    const pay503020Btn = $("#adminPay503020Btn");

    const updateAdminPayBtns = () => {
      const currentSched = window.WPS_DATA.CALENDAR_SETTINGS?.paymentScheduleType || "5050";
      if (currentSched === "503020") {
        if (pay503020Btn) { pay503020Btn.style.background = "var(--accent)"; pay503020Btn.style.color = "#fff"; }
        if (pay5050Btn) { pay5050Btn.style.background = "transparent"; pay5050Btn.style.color = "var(--ink)"; }
      } else {
        if (pay5050Btn) { pay5050Btn.style.background = "var(--accent)"; pay5050Btn.style.color = "#fff"; }
        if (pay503020Btn) { pay503020Btn.style.background = "transparent"; pay503020Btn.style.color = "var(--ink)"; }
      }
    };
    updateAdminPayBtns();

    if (pay5050Btn) {
      pay5050Btn.addEventListener("click", () => {
        window.WPS_DATA.CALENDAR_SETTINGS.paymentScheduleType = "5050";
        saveCalendarSettings();
        updateAdminPayBtns();
        toast("Default Studio Payment Terms set to Standard 50/50.");
      });
    }

    if (pay503020Btn) {
      pay503020Btn.addEventListener("click", () => {
        window.WPS_DATA.CALENDAR_SETTINGS.paymentScheduleType = "503020";
        saveCalendarSettings();
        updateAdminPayBtns();
        toast("Default Studio Payment Terms set to 3-Tier Campaign (50/30/20).");
      });
    }

    renderAdminPackagesEditor();
    renderAdminGrid();
    renderRoster();
  }

  function catCard(label, kind, val, count, sample, cover) {
    const coverSrc = cover ? photoSrc(cover) : "";
    const coverImg = coverSrc
      ? `<img src="${esc(coverSrc)}" alt="${esc(label)}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease;" loading="lazy" />`
      : `<div style="width:100%; height:100%; background:linear-gradient(150deg,${esc(sample[0])},${esc(sample[1])});"></div>`;
    
    return `
      <a href="/categories?kind=${kind}&amp;val=${encodeURIComponent(val)}" data-link class="cat-card reveal" style="display: flex; flex-direction: column; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; padding: 0; text-decoration: none; color: inherit; box-shadow: var(--shadow-sm); transition: transform 0.3s ease, box-shadow 0.3s ease;">
        <div style="position: relative; height: 180px; overflow: hidden; background: var(--bone);">
          ${coverImg}
          <div style="position: absolute; top: 10px; left: 10px; z-index: 2;">
            <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 800; background: rgba(10,10,10,0.75); backdrop-filter: blur(8px); color: #fff; padding: 4px 8px; border-radius: 20px; text-transform: uppercase;">${esc(kind)}</span>
          </div>
          <div style="position: absolute; top: 10px; right: 10px; z-index: 2;">
            <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 800; background: var(--accent); color: #fff; padding: 4px 9px; border-radius: 20px;">${count} Album${count !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div style="padding: 16px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h3 style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 0 0 2px; color: var(--ink);">${esc(label)}</h3>
            <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Browse Category Collection</span>
          </div>
          <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); display: inline-flex; align-items: center; gap: 4px;">Explore →</span>
        </div>
      </a>`;
  }

  // The Comp Cards and Model Portfolio pages don't list raw shoots: several
  // shoots of the same model collapse into one unified album per model. That
  // grouping lived inline in viewCategories, which meant a shared link to one
  // of those albums had nothing to resolve against — the album only existed
  // while the category page was being rendered. It is a function now so
  // viewSharedAlbum can rebuild the exact same album from an id alone.
  //   `kind`/`d` are the category axis and its decoded value: kind "type"
  //   with "Comp Cards" / "Selective Collaboration (TFP)" for the comp-card
  //   page, or "Model Portfolio" for the portfolio page. Any other category
  //   returns the list untouched.
  function buildCompCardDisplayList(list, kind, d) {
    let displayList = list;
    if (kind === "type" && (d === "Selective Collaboration (TFP)" || d === "Model Portfolio" || d === "Comp Cards")) {
      const filteredList = list.filter(s => !s.hideFromCompCard && ((s.instagram && s.instagram.trim()) || (s.kavyar && s.kavyar.trim()) || (s.talent && s.talent.trim())));
      const groupable = [];
      const nonGroupable = [];
      for (const s of filteredList) {
        const talentClean = (s.talent || "").trim();
        const hasExactlyOneModel = talentClean && !talentClean.includes(",") && !talentClean.toLowerCase().includes(" and ") && !talentClean.toLowerCase().includes("&");
        const hasNoBrandOrClient = (!s.client || !s.client.trim()) && (!s.brand || s.brand === "Personal Project" || !s.brand.trim());
        
        if (hasExactlyOneModel && hasNoBrandOrClient) {
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
        const isPortView = (d === "Model Portfolio");
        const allGroupPhotos = shootsInGroup.flatMap(gs => (gs.photos || []).filter(p => {
          if (isPortView) {
            return p.usage === "portfolio" || p.usage === "both" || p.usage === undefined;
          } else {
            // `!p.excludeFromCompCard` must be a hard AND, not another OR
            // branch — as an OR it swallowed the usage check entirely, so
            // a "Portfolio Only" photo still leaked into the comp card
            // album unless excludeFromCompCard happened to also be set.
            return (p.usage === "comp" || p.usage === "both" || p.usage === undefined) && !p.excludeFromCompCard;
          }
        }).map(p => ({ ...p, parent: gs })));
        const coverId = latestShoot.coverPhotoId || (latestShoot.photos[0] && latestShoot.photos[0].id);
        const coverPhotoObj = allGroupPhotos.find(p => p.id.split("-")[0] === coverId);
        const remainingPhotos = allGroupPhotos.filter(p => p.id.split("-")[0] !== coverId);
        // Supporting photos come from each album in turn — a shuffled lane per
        // album, dealt round-robin — so every shoot is represented instead of
        // the largest one crowding the rest out.
        const lanesByAlbum = new Map();
        (coverPhotoObj ? remainingPhotos : allGroupPhotos).forEach(p => { const k = p.parent ? p.parent.id : "?"; if (!lanesByAlbum.has(k)) lanesByAlbum.set(k, []); lanesByAlbum.get(k).push(p); });
        const lanes = shuffleArray(Array.from(lanesByAlbum.values()).map(list => shuffleArray(list.slice())));
        const dealt = [];
        for (let i = 0; lanes.some(l => i < l.length); i++) lanes.forEach(l => { if (i < l.length) dealt.push(l[i]); });
        const finalPhotos = coverPhotoObj ? [coverPhotoObj, ...dealt] : dealt;
        
        const findStat = (key) => {
           const found = shootsInGroup.find(s => s[key] && String(s[key]).trim());
           return found ? String(found[key]).trim() : "";
        };
        // Each visibility switch travels with the album that supplied the
        // value, so the newest album's choice decides per surface.
        const agencySrc = shootsInGroup.find(x => x.agency && String(x.agency).trim());
        const emailSrc = shootsInGroup.find(x => x.modelEmail && String(x.modelEmail).trim());
        const repFlags = {};
        REP_SWITCHES.forEach(([, what]) => REP_SURFACES.forEach(([, sf]) => { const src = what.startsWith("Agency") ? agencySrc : what === "Email" ? emailSrc : shootsInGroup[0]; repFlags[`show${what}On${sf}`] = showRep(src, what, sf); }));

        // Model type merges across the group instead of taking the latest
        // shoot's value: a model tagged Fashion on one shoot and Fitness on
        // another is both, and the unified card is the only place that can
        // say so. modelTypesOf re-applies the two-type cap on the union.
        const groupModelTypes = modelTypesOf({
          modelTypes: shootsInGroup.flatMap(gs => modelTypesOf(gs))
        });
        
        const isPort = d === "Model Portfolio";
        return {
          id: isPort ? `portfolio-${encodeURIComponent(modelName)}` : `comp-card-${encodeURIComponent(modelName)}`,
          // Display title is cleaned; `talent` below stays raw on purpose,
          // because compCardOwnHandles parses its parentheses to pick the
          // model's own social. Same reason `id` is left alone — changing
          // it would break links already shared for this album.
          title: isPort ? `${getTalentCleanName(modelName)} — Portfolio` : `${getTalentCleanName(modelName)} — Comp Card`,
          brand: "Personal Project",
          activity: latestShoot.activity,
          type: "Selective Collaboration (TFP)",
          height: findStat("height"),
          chest: findStat("chest"),
          chestLabel: findStat("chestLabel"),
          waist: findStat("waist"),
          hips: findStat("hips"),
          shoes: findStat("shoes"),
          modelHair: findStat("modelHair"),
          modelEyes: findStat("modelEyes"),
          // Newest album first, so this is the model's current agency even
          // when older shoots were booked through a different one.
          agency: findStat("agency"),
          agencyHandle: cleanIgHandle(agencySrc ? agencySrc.agencyHandle : ""),
          agencySite: agencySrc ? (agencySrc.agencySite || "") : "",
          agencyLinks: agencySrc ? (agencySrc.agencyLinks || []) : [],
          modelEmail: findStat("modelEmail"),
          // Each flag travels with the album that supplied its value, so the
          // newest album's choice decides what visitors and the PDF may see.
          ...repFlags,
          modelTypes: groupModelTypes,
          // Carried over so the "Show stats on Comp Cards / Model
          // Portfolio" checkboxes still apply once shoots are merged into
          // this synthetic album — without this, every stats display that
          // reads from the album (not the raw shoot) ignored the toggle.
          showStatsOnCompCard: latestShoot.showStatsOnCompCard,
          showStatsOnModelPortfolio: latestShoot.showStatsOnModelPortfolio,
          mentor: latestShoot.mentor || "",
          season: latestShoot.season || "Comp Card",
          photographer: latestShoot.photographer || "Studio",
          secondaryPhotographers: latestShoot.secondaryPhotographers || "",
          artDirector: latestShoot.artDirector || "",
          stylist: latestShoot.stylist || "",
          hair: latestShoot.hair || "",
          mua: latestShoot.mua || "",
          videographer: latestShoot.videographer || "",
          talent: modelName,
          location: latestShoot.location || "Studio",
          description: latestShoot.description || "",
          tags: latestShoot.tags || "",
          gear: latestShoot.gear || "",
          client: "",
          date: latestShoot.date,
          instagram: latestShoot.instagram,
          kavyar: latestShoot.kavyar,
          link: latestShoot.link,
          rights: latestShoot.rights,
          palette: latestShoot.palette || ["#3a3a3a", "#0d0d0d"],
          photos: finalPhotos,
          coverPhotoId: latestShoot.coverPhotoId || (latestShoot.photos[0] && latestShoot.photos[0].id),
          isCompCard: true,
          originalShoots: shootsInGroup
        };
      });
      
      // Order by model name. unifiedAlbums came out of Object.keys(groups),
      // i.e. the order the shoots happened to sit in — so the list read as
      // date-ish/random while the A–Z filter bar right below promised an
      // alphabet. Sort on the cleaned name so "Sumitt Verma (instagram…)"
      // files under S, not under whatever its raw string starts with, and
      // so it matches the letter its alpha-filter button assigns it.
      const sortName = (s) => getTalentCleanName(s.talent || s.title || "").trim();
      displayList = [...unifiedAlbums, ...nonGroupable].sort((a, b) => {
        const an = sortName(a), bn = sortName(b);
        if (!an !== !bn) return an ? -1 : 1; // unnamed albums sink to the bottom
        return an.localeCompare(bn, undefined, { sensitivity: "base", numeric: true });
      });
    }
    return displayList;
  }

  /* ---- Album share links ---------------------------------------------------
     A shared link has to survive being pasted into WhatsApp and clicked days
     later, which ruled out the id these albums render under. A unified
     comp-card album's id is built from the raw `talent` field, and that field
     inlines the model's Instagram URL in parentheses — so the link came out
     as /share/comp-card-Sumitt%20Verma%20(https%3A%2F%2F…%3Fhl%3Den): it
     broke on any client that stops linkifying at a bracket, and even intact
     it resolved to nothing, because that id exists only for as long as the
     Comp Cards page is on screen.

     Links are built from a slug of the model's clean name instead, and
     resolved by slug — with the old raw and percent-encoded forms still
     accepted, so links already sent out keep working. */
  const slugify = (s) => String(s ?? "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // The path segment that identifies an album in a /share/… link. Real albums
  // keep their own id (short, stable, already URL-safe); unified comp-card and
  // portfolio albums get the readable slug form.
  function shareIdFor(album) {
    if (!album) return "";
    const id = String(album.id || "");
    const prefix = id.startsWith("portfolio-") ? "portfolio-" : id.startsWith("comp-card-") ? "comp-card-" : "";
    if (!prefix) return id;
    const slug = slugify(getTalentCleanName(album.talent || album.title));
    return slug ? prefix + slug : id;
  }
  // /share/?a=… and not /share/…: GitHub Pages has no file at the second path,
  // so it answered every shared link with 404.html — a real HTTP 404, titled
  // "Page not found" and marked noindex, whatever the app then rendered
  // underneath. /share/ is a real directory, so this form is a 200 with the
  // right metadata behind it.
  const shareUrlFor = (album) => `${window.location.origin}/share/?a=${encodeURIComponent(shareIdFor(album))}`;

  // Reverse of shareIdFor, and deliberately forgiving — it has to keep every
  // link that has ever been sent out resolvable. Accepts a real album id, the
  // slug form, the legacy percent-encoded synthetic id, and the raw talent
  // string. Returns the album object, or null when nothing matches.
  function resolveShareId(rawId, shoots) {
    const list = Array.isArray(shoots) ? shoots : [];
    let id = String(rawId ?? "");
    if (!id) return null;
    // A link pasted into a chat app can arrive still-encoded or already
    // decoded; try the decode, and fall back to the literal text if it is not
    // valid percent-encoding rather than throwing the whole lookup away.
    try { id = decodeURIComponent(id); } catch { /* not valid %-encoding — match on the literal */ }

    const direct = list.find((s) => s && s.id === id);
    if (direct) return direct;

    const nameSlug = (x) => slugify(getTalentCleanName((x && (x.talent || x.title)) || ""));
    const m = id.match(/^(comp-card|portfolio)-([\s\S]*)$/);
    if (m) {
      // getTalentCleanName on the tail as well: a legacy id carries the raw
      // talent string, parenthesised Instagram URL and all, which would
      // otherwise slugify into something no album's clean name can match.
      const wanted = new Set([slugify(m[2]), slugify(getTalentCleanName(m[2]))].filter(Boolean));
      const category = m[1] === "portfolio" ? "Model Portfolio" : "Comp Cards";
      const unified = buildCompCardDisplayList(list.filter(qualifiesAsCompCard), "type", category);
      const hit = unified.find((a) => wanted.has(nameSlug(a)));
      if (hit) return hit;
    }

    // Last resort: any album whose model/title slugifies to what was asked
    // for. Covers a link typed or trimmed by hand.
    const wanted = slugify(id);
    return wanted ? (list.find((s) => nameSlug(s) === wanted) || null) : null;
  }

  function viewCategories(kind, val) {
    // Detail: a filtered work list
    if (kind && val) {
      const d = decodeURIComponent(val);
      const list = SHOOTS.filter((s) => {
        if (kind === "brand" && (!s.client || !s.client.trim())) return false;
        if (kind === "type" && (d === "Model Portfolio" || d === "Comp Cards" || d === "Selective Collaboration (TFP)" || d === "Test Shoot")) {
          return qualifiesAsCompCard(s);
        }
        return (kind === "activity" ? s.activity : kind === "brand" ? s.brand : s.type) === d;
      });

      let displayList = buildCompCardDisplayList(list, kind, d);

      CURRENT_VIEW_SHOOTS = displayList;

      const isTestShoot = (kind === "type" && (d === "Selective Collaboration (TFP)" || d === "Comp Cards" || d === "Model Portfolio"));
      const alphaFilterHtml = isTestShoot ? `
        <div class="alpha-filter-bar container reveal">
          <button class="alpha-btn active" data-alpha="ALL">ALL</button>
          ${"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(char => {
            const hasMatches = displayList.some(s => getTalentCleanName(s.talent).trim().charAt(0).toUpperCase() === char);
            return `<button class="alpha-btn" data-alpha="${char}"${!hasMatches ? " disabled" : ""}>${char}</button>`;
          }).join("")}
        </div>
      ` : "";

      const getCategoryTitle = (val) => {
        if (val === "Selective Collaboration (TFP)" || val === "Comp Cards") return "Model Comp Cards";
        if (val === "Model Portfolio") return "Model Portfolio";
        return val;
      };

      const getCategoryDescription = (val) => {
        if (val === "Model Portfolio") {
          return "This portfolio archive displays curated agency-standard portfolios, filtered and tagged by profile angles (Front, Side, Back, 3/4, Close-up).";
        }
        if (val === "Comp Cards" || val === "Selective Collaboration (TFP)") {
          return "This compcard archive includes photos clicked or produced under nerdyphotographer.in studio or its subsidiaries.";
        }
        return "This compcard archive includes photos clicked or produced under nerdyphotographer.in studio or its subsidiaries.";
      };

      return `
        <section class="page-head">
          <div class="container">
            <p class="eyebrow reveal"><a href="/categories" data-link>Categories</a> / ${esc(kind)}</p>
             <h1 class="reveal">${esc(getCategoryTitle(d))}</h1>
            ${isTestShoot ? `<p class="page-sub" style="max-width: 600px; line-height: 1.6; opacity: 1 !important; visibility: visible !important; transform: none !important;">${esc(getCategoryDescription(d))}<span style="font-size: var(--font-xs); color: var(--ink-soft); display: block; margin-top: 8px;">Note: Models from workshop projects are not included here.</span></p>` : `<p class="page-sub reveal">${displayList.length} master album${displayList.length !== 1 ? "s" : ""} in this ${esc(kind)}.</p>`}
          </div>
        </section>
        ${alphaFilterHtml}
        <section class="section container full-bleed"><div class="work-list">${displayList.map(fullBleedBlock).join("") || emptyCat()}</div></section>`;
    }
    // Index: three lenses
    const grp = (arr, key) => arr.map((v) => {
      const shoots = SHOOTS.filter((s) => {
        if (s.type === "Workshop Attended") return false;
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
    const typFilter = TYPES.filter(t => {
      if (t === "Workshop Attended") return false;
      if (t === "Selective Collaboration (TFP)") return SHOOTS.some(s => s.type === "Selective Collaboration (TFP)" && s.showTestShootCategory);
      return true;
    });
    const act = grp(ACTIVITIES, "activity"), brs = grp(BRANDS, "brand"), typ = grp(typFilter, "type");
    
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
      const targetVal = (key === "type" && (val === "Comp Cards" || val === "Model Portfolio" || val === "Selective Collaboration (TFP)")) ? "Selective Collaboration (TFP)" : val;
      let shoots = SHOOTS.filter(s => (s[key] === targetVal || (targetVal === "Selective Collaboration (TFP)" && qualifiesAsCompCard(s))) && ((s.instagram && s.instagram.trim()) || (s.kavyar && s.kavyar.trim()) || (s.talent && s.talent.trim())));
      if (!shoots.length) return [];
      
      // Group shoots by UNIQUE model/talent name to ensure distinct models in thumbnails!
      const modelGroups = new Map();
      shoots.forEach(s => {
        const modelName = getTalentCleanName(s.talent || s.title).trim().toLowerCase();
        if (!modelGroups.has(modelName)) {
          modelGroups.set(modelName, []);
        }
        modelGroups.get(modelName).push(s);
      });

      // Pick 1 random shoot per unique model
      const distinctModelShoots = [];
      for (const [mName, mShoots] of modelGroups.entries()) {
        const randShoot = mShoots[Math.floor(Math.random() * mShoots.length)];
        distinctModelShoots.push(randShoot);
      }

      // Shuffle the distinct models array to randomize thumbnail selection on each page view
      const shuffledShoots = distinctModelShoots.sort(() => Math.random() - 0.5);
      
      const samples = [];
      // 1. Take a random photo from each distinct model to guarantee distinct models!
      for (const s of shuffledShoots) {
        if (s.photos && s.photos.length) {
          const randomIdx = Math.floor(Math.random() * s.photos.length);
          samples.push({ ...s.photos[randomIdx], parent: s, index: randomIdx });
        }
        if (samples.length >= limit) break;
      }
      
      // 2. Fallback: If total unique models < 3, fill remaining slots with remaining photos from available shoots
      if (samples.length < limit) {
        const remaining = [];
        for (const s of shoots) {
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

    const renderSpecialtyGallery = (samples, placeholderPrefix, kind = "", val = "") => {
      let html = '';
      for (let i = 0; i < 3; i++) {
        const photo = samples[i];
        if (photo) {
          const src = photoSrc(photo);
          html += `<button class="specialty-thumb-btn reveal" data-kind="${esc(kind)}" data-val="${esc(val)}" data-src="${esc(src)}" style="aspect-ratio: 3/4; overflow: hidden; background: var(--bone); border: 1px solid var(--line); border-radius: 4px; padding: 0; cursor: pointer; display: block; width: 100%;">
                     <img src="${esc(src)}"${srcsetAttr(photo, "(max-width: 620px) 30vw, 18vw")} style="width:100%; height:100%; object-fit:cover; object-position:center; transition: transform .4s var(--ease);" alt="${esc(photo.parent ? altFor(photo.parent) : placeholderPrefix + ' photography by nerdyphotographer.in')}" loading="lazy" />
                   </button>`;
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
    const testShootSamples = getSamples("type", "Selective Collaboration (TFP)");

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
              <a href="/categories?kind=activity&amp;val=Fashion" data-link class="link-arrow" style="font-size: var(--font-xs); font-weight: 700;">Explore fashion edit →</a>
            </div>
            <div class="specialty-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              ${renderSpecialtyGallery(fashionSamples, "FASHION", "activity", "Fashion")}
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
              <a href="/categories?kind=activity&amp;val=Portrait" data-link class="link-arrow" style="font-size: var(--font-xs); font-weight: 700;">Explore beauty &amp; portraits →</a>
            </div>
            <div class="specialty-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              ${renderSpecialtyGallery(portraitSamples, "BEAUTY", "activity", "Portrait")}
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
              <a href="/categories?kind=activity&amp;val=Fitness" data-link class="link-arrow" style="font-size: var(--font-xs); font-weight: 700;">Explore fitness catalog →</a>
            </div>
            <div class="specialty-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              ${renderSpecialtyGallery(fitnessSamples, "FITNESS", "activity", "Fitness")}
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
              <a href="/categories?kind=activity&amp;val=Sports" data-link class="link-arrow" style="font-size: var(--font-xs); font-weight: 700;">Explore sports action →</a>
            </div>
            <div class="specialty-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              ${renderSpecialtyGallery(sportsSamples, "SPORTS", "activity", "Sports")}
            </div>
          </div>
          ` : ""}

          ${testShootSamples.length ? `
          <div class="specialty-item reveal">
            <div class="specialty-meta">
              <h3>
                <a href="/categories?kind=type&amp;val=Comp%20Cards" data-link>Model Comp Cards</a>
              </h3>
              <p>
                Comprehensive testing shoots and comp card layout photography designed for aspiring and professional model talent. Direct submissions focus: clean test lighting, polaroids, digitals, and styling versatility.
                <span style="display: block; margin-top: 8px; font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.4;">This compcard archive includes photos clicked or produced under nerdyphotographer.in studio or its subsidiaries.</span>
              </p>
              <a href="/categories?kind=type&amp;val=Comp%20Cards" data-link class="link-arrow" style="font-size: var(--font-xs); font-weight: 700;">Explore comp cards →</a>
            </div>
            <div class="specialty-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              ${renderSpecialtyGallery(testShootSamples, "MODEL", "type", "Comp Cards")}
            </div>
          </div>
          ` : ""}

          ${testShootSamples.length && isAdmin() ? `
          <div class="specialty-item reveal" style="border-top: 1px dashed var(--line); padding-top: 40px; margin-top: 40px;">
            <div class="specialty-meta">
              <span style="font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.05em; display:block; margin-bottom: 6px;">🔒 Admin Portfolio View</span>
              <h3>
                <a href="/categories?kind=type&amp;val=Model%20Portfolio" data-link>Model Portfolio</a>
              </h3>
              <p>
                Curated model portfolios displaying agency-ready grids. Optimized for casting directors with quick filters to segment by shooting angle (Front, Side, Back, 3/4, Close-up).
              </p>
              <a href="/categories?kind=type&amp;val=Model%20Portfolio" data-link class="link-arrow" style="font-size: var(--font-xs); font-weight: 700; color: var(--accent);">Explore portfolio angles →</a>
            </div>
            <div class="specialty-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              ${renderSpecialtyGallery(testShootSamples, "PORTFOLIO", "type", "Model Portfolio")}
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

  function viewTestimonials() {
    const allT = getAllTestimonials();
    const shuffledT = shuffleArray(allT);
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">06 — Social Proof</p>
          ${kineticH1("Testimonials")}
          <p class="page-sub reveal">Words from our creative partners, brands, and models about their shoot experience and production results at nerdyphotographer.in.</p>
        </div>
      </section>
      <section class="section container">
        ${shuffledT.length ? `
        <div class="testimonials-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 30px;">
          ${shuffledT.map((t, i) => `
            <div class="testimonial-card reveal" style="--d:${(i * 0.05).toFixed(2)}s; background: var(--bone); border: 1px solid var(--line); padding: 28px; border-radius: 12px; display: flex; flex-direction: column; gap: 20px; justify-content: space-between;">
              <p style="font-family: 'Georgia', serif; font-size: var(--font-sm); font-style: italic; line-height: 1.6; color: var(--ink); margin: 0;">“${esc(t.quote)}”</p>
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <strong style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); color: var(--ink);">${esc(t.by)}</strong>
                <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">${esc(t.meta)} ${t.season ? `· ${esc(t.season)}` : ""}</span>
              </div>
            </div>
          `).join("")}
        </div>
        ` : `<p class="page-sub">No testimonials published yet.</p>`}
      </section>
      <section class="cta-band" style="border-top: 1px solid var(--line); margin-top: 60px;">
        <div class="container reveal">
          ${isAdmin() ? `
            <h2>Have a testimonial to publish?</h2>
            <a href="/upload" data-link class="btn btn-dark">Publish testimonial →</a>
          ` : `
            <h2>Ready to collaborate?</h2>
            <a href="/book" data-link class="btn btn-dark">Book your photoshoot session →</a>
          `}
        </div>
      </section>
    `;
  }

  /* ---------- Upload view (rich, grouped form) ---------- */
  let staged = []; // {id,dataUrl,name}
  function viewUpload() {
    const opt = (arr) => arr.map((v) => `<option value="${v}">${v}</option>`).join("");
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
              <span style="font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink-soft);">Bulk-tag pose:</span>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="full-body" style="font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Full Body</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="front" style="font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Front</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="left-profile" style="font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Left Profile</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="right-profile" style="font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Right Profile</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="three-quarter" style="font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">3/4</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="back" style="font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Back</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="close-up" style="font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Close-up</button>
              <span style="width:1px; align-self:stretch; background:var(--line-2);"></span>
              <button type="button" id="thumbBulkSelectAll" style="font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink-soft); cursor:pointer;">Select all</button>
              <button type="button" id="thumbBulkClear" style="font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink-soft); cursor:pointer;">Clear</button>
              <span id="thumbBulkCount" style="margin-left:auto; font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); color:var(--ink-soft);">0 selected</span>
            </div>
            <div class="thumb-grid" id="stagingGrid"></div>
          </div>

          <form class="shoot-form reveal" id="shootForm" autocomplete="off">
            <div style="margin-bottom: 24px; padding: 14px 18px; border: 1px solid var(--line); border-radius: 8px; background: var(--bone); display: flex; align-items: center; gap: 10px; width: 100%;">
              <input id="f_is_testimonial_only" type="checkbox" style="width: 16px; height: 16px; accent-color: var(--accent); margin: 0; cursor: pointer;" />
              <label for="f_is_testimonial_only" style="font-family: 'JetBrains Mono', monospace; font-size: var(--font-xs); text-transform: uppercase; font-weight: 700; cursor: pointer; color: var(--ink);">Testimonial Only (No Photoshoot Album)</label>
            </div>

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
              <button type="button" data-target="extraTestimonialsFs">Extras</button>
            </nav>

            <fieldset id="fs_shoot"><legend>The shoot</legend>
              <label class="field"><span>Shoot title *</span><input id="f_title" type="text" placeholder="e.g. Merrell Trail — Spring '26" required /></label>
              <div class="field-row">
                <label class="field" id="f_brand_select_field"><span>Brand</span><select id="f_brand">${opt(BRANDS)}<option>Other</option></select></label>
                <label class="field" id="f_brand_text_field" style="display: none;"><span>Company / Role *</span><input id="f_brand_text" type="text" placeholder="e.g. Model, Vogue, Brand Director" /></label>
                <label class="field" id="f_activity_field"><span>Activity</span><select id="f_activity">${opt(ACTIVITIES)}</select></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Type</span><select id="f_type">${opt(TYPES)}</select></label>
                <label class="field"><span>Date shot</span><input id="f_date" type="date" /></label>
                <label class="field"><span>Season / Year</span><input id="f_season" type="text" placeholder="Spring 2026" /></label>
                <label class="field"><span>Shoot Location (add Instagram in parentheses)</span><input id="f_location" type="text" placeholder="e.g. Studio (@studiohandle), Noida, Outdoor" /></label>
                <div id="f_location_verify" style="margin-top: 5px; font-size: var(--font-xs); display: none;"></div>
              </div>
            </fieldset>

            <fieldset id="fs_credits"><legend>Credits</legend>
              <div class="credits-format" role="note">
                <span class="credits-format-k">How to write a credit</span>
                <code>Name (@handle; site.com; …)</code>
                <span class="credits-format-sub">Socials go in parentheses after the name, separated by <code>;</code> — Instagram <code>@handle</code>, <code>kavyar.com/…</code>, <code>linkedin.com/in/…</code>, <code>behance.net/…</code>, a website, an email. Any of them, in any order: the app tells them apart by their shape. Several people: separate with commas. Example — <em>nerdyphotographer (@nerdyphotographer.in; nerdyphotographer.in; prateeksaxenaphotography@gmail.com)</em>. Instagram, Kavyar, LinkedIn, Behance and websites get a verify link; email cannot be tested. The same pattern works for the agency.</span>
              </div>
              <div class="field-row">
                <label class="field"><span>Photographer <em class="label-hint">primary</em></span><input id="f_photographer" type="text" value="nerdyphotographer" placeholder="Your name" /></label>
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
              <p class="field-note credits-note" style="margin-top: -2px;">Models move between agencies — the comp card and PDF use the agency from the model's most recent album. Where the agency and email may appear is set under Publish settings.</p>
              <div class="field-row" id="f_mentor_row" style="display: none;">
                <label class="field" style="grid-column: 1 / -1;"><span>Teacher / Mentor</span><input id="f_mentor" type="text" placeholder="e.g. Mentor One (@handle; site.com), Mentor Two" /><span class="field-verify" id="f_mentor_verify" style="display: none;"></span></label>
              </div>
              <label class="field"><span>Other credits</span><input id="f_credits" type="text" placeholder="e.g. Set designer Name (@handle; site.com), Assistant Name" /><span class="field-verify" id="f_credits_verify" style="display: none;"></span></label>
            </fieldset>

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
                      <input type="checkbox" class="model-type-cb" value="${esc(t)}" style="width: 16px; height: 16px; accent-color: var(--accent);" />
                      ${esc(modelTypeLabel(t))}
                    </label>
                  `).join("")}
                </div>
                <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; align-items: center;">
                  <input id="f_model_type_new" type="text" maxlength="${MODEL_TYPE_MAXLEN}" placeholder="Add another type, e.g. Commercial" style="flex: 1 1 220px; min-width: 0; height: 38px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); border-radius: 6px; padding: 0 12px; box-sizing: border-box; font-size: var(--font-sm); outline: none;" />
                  <button type="button" id="f_model_type_add" class="btn btn-ghost" style="height: 38px; padding: 0 16px; font-size: var(--font-xs); font-family: 'JetBrains Mono', monospace; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">+ Add</button>
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
                  <input id="f_show_stats_comp" type="checkbox" checked style="width: 16px; height: 16px; accent-color: var(--accent);" />
                  Show stats on Comp Cards
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); font-weight: 500; color: var(--ink); cursor: pointer; user-select: none;">
                  <input id="f_show_stats_port" type="checkbox" checked style="width: 16px; height: 16px; accent-color: var(--accent);" />
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
                <input id="f_is_public" type="checkbox" checked style="width: 16px; height: 16px; accent-color: var(--accent); margin: 0; cursor: pointer;" />
                <label for="f_is_public" style="font-weight: 600; cursor: pointer; margin: 0;">Show this album on the site <span class="label-hint" style="font-weight: 400; text-transform: none; letter-spacing: 0; font-family: inherit; font-size: 12.5px;">— untick to keep it saved but hidden everywhere</span></label>
              </div>
              <div class="publish-toggles">
                <label>
                  <input id="f_featured" type="checkbox" checked style="width: 15px; height: 15px; accent-color: var(--accent); margin: 3px 0 0;" />
                  <span class="tog-text"><strong>Show on the homepage</strong><small>Appears in Featured photoshoots.</small></span>
                </label>
                <label>
                  <input id="f_show_compcard" type="checkbox" style="width: 15px; height: 15px; accent-color: var(--accent); margin: 3px 0 0;" />
                  <span class="tog-text"><strong>Also make a comp card from this album</strong><small>Test shoots get a comp card automatically. Tick this for any other kind of shoot.</small></span>
                </label>
                <label>
                  <input id="f_hide_compcard" type="checkbox" style="width: 15px; height: 15px; accent-color: var(--accent); margin: 3px 0 0;" />
                  <span class="tog-text"><strong>Keep it off the Comp cards page</strong><small>For a test shoot you don't want listed there. The album itself stays in the archive.</small></span>
                </label>
                <label>
                  <input id="f_disable_download" type="checkbox" style="width: 15px; height: 15px; accent-color: var(--accent); margin: 3px 0 0;" />
                  <span class="tog-text"><strong>No comp card PDF download</strong><small>Visitors can view the comp card but not download it.</small></span>
                </label>
                <label>
                  <input id="f_show_test_shoot_cat" type="checkbox" style="width: 15px; height: 15px; accent-color: var(--accent); margin: 3px 0 0;" />
                  <span class="tog-text"><strong>Show the &quot;Test shoot / TFP&quot; label on the album</strong><small>Otherwise visitors see a normal album, not that it was a collaboration.</small></span>
                </label>
              </div>
              <div class="vis-matrix" id="repVisibility">
                <p class="vis-matrix-title">Agency &amp; contact</p>
                <p class="vis-matrix-sub">Where each detail may appear, for the model and for the agency. Only the model's Instagram is shown by default — switch on anything else where you want it. Agency socials show only where the agency name does.</p>
                <table class="vis-table">
                  <thead><tr><th></th><th>Comp cards</th><th>Homepage</th><th>PDF</th></tr></thead>
                  <tbody>
                    <tr class="vis-group"><th colspan="4">Model</th></tr>
                    <tr><th>Instagram</th><td><input id="f_show_ig_cc" type="checkbox" checked aria-label="Model Instagram on comp cards" /></td><td><input id="f_show_ig_home" type="checkbox" checked aria-label="Model Instagram on homepage" /></td><td><input id="f_show_ig_pdf" type="checkbox" checked aria-label="Model Instagram on PDF" /></td></tr>
                    <tr><th>Kavyar</th><td><input id="f_show_kavyar_cc" type="checkbox" aria-label="Model Kavyar on comp cards" /></td><td><input id="f_show_kavyar_home" type="checkbox" aria-label="Model Kavyar on homepage" /></td><td><input id="f_show_kavyar_pdf" type="checkbox" aria-label="Model Kavyar on PDF" /></td></tr>
                    <tr><th>LinkedIn</th><td><input id="f_show_linkedin_cc" type="checkbox" aria-label="Model LinkedIn on comp cards" /></td><td><input id="f_show_linkedin_home" type="checkbox" aria-label="Model LinkedIn on homepage" /></td><td><input id="f_show_linkedin_pdf" type="checkbox" aria-label="Model LinkedIn on PDF" /></td></tr>
                    <tr><th>Behance</th><td><input id="f_show_behance_cc" type="checkbox" aria-label="Model Behance on comp cards" /></td><td><input id="f_show_behance_home" type="checkbox" aria-label="Model Behance on homepage" /></td><td><input id="f_show_behance_pdf" type="checkbox" aria-label="Model Behance on PDF" /></td></tr>
                    <tr><th>Website</th><td><input id="f_show_website_cc" type="checkbox" aria-label="Model website on comp cards" /></td><td><input id="f_show_website_home" type="checkbox" aria-label="Model website on homepage" /></td><td><input id="f_show_website_pdf" type="checkbox" aria-label="Model website on PDF" /></td></tr>
                    <tr><th>Email</th><td><input id="f_show_email_cc" type="checkbox" aria-label="Model email on comp cards" /></td><td><input id="f_show_email_home" type="checkbox" aria-label="Model email on homepage" /></td><td><input id="f_show_email_pdf" type="checkbox" aria-label="Model email on PDF" /></td></tr>
                    <tr class="vis-group"><th colspan="4">Agency</th></tr>
                    <tr><th>Agency name</th><td><input id="f_show_agency_cc" type="checkbox" aria-label="Agency name on comp cards" /></td><td><input id="f_show_agency_home" type="checkbox" aria-label="Agency name on homepage" /></td><td><input id="f_show_agency_pdf" type="checkbox" aria-label="Agency name on PDF" /></td></tr>
                    <tr><th>Instagram</th><td><input id="f_show_agency_ig_cc" type="checkbox" aria-label="Agency Instagram on comp cards" /></td><td><input id="f_show_agency_ig_home" type="checkbox" aria-label="Agency Instagram on homepage" /></td><td><input id="f_show_agency_ig_pdf" type="checkbox" aria-label="Agency Instagram on PDF" /></td></tr>
                    <tr><th>Kavyar</th><td><input id="f_show_agency_kavyar_cc" type="checkbox" aria-label="Agency Kavyar on comp cards" /></td><td><input id="f_show_agency_kavyar_home" type="checkbox" aria-label="Agency Kavyar on homepage" /></td><td><input id="f_show_agency_kavyar_pdf" type="checkbox" aria-label="Agency Kavyar on PDF" /></td></tr>
                    <tr><th>LinkedIn</th><td><input id="f_show_agency_linkedin_cc" type="checkbox" aria-label="Agency LinkedIn on comp cards" /></td><td><input id="f_show_agency_linkedin_home" type="checkbox" aria-label="Agency LinkedIn on homepage" /></td><td><input id="f_show_agency_linkedin_pdf" type="checkbox" aria-label="Agency LinkedIn on PDF" /></td></tr>
                    <tr><th>Behance</th><td><input id="f_show_agency_behance_cc" type="checkbox" aria-label="Agency Behance on comp cards" /></td><td><input id="f_show_agency_behance_home" type="checkbox" aria-label="Agency Behance on homepage" /></td><td><input id="f_show_agency_behance_pdf" type="checkbox" aria-label="Agency Behance on PDF" /></td></tr>
                    <tr><th>Website</th><td><input id="f_show_agency_website_cc" type="checkbox" aria-label="Agency website on comp cards" /></td><td><input id="f_show_agency_website_home" type="checkbox" aria-label="Agency website on homepage" /></td><td><input id="f_show_agency_website_pdf" type="checkbox" aria-label="Agency website on PDF" /></td></tr>
                    <tr><th>Email</th><td><input id="f_show_agency_email_cc" type="checkbox" aria-label="Agency email on comp cards" /></td><td><input id="f_show_agency_email_home" type="checkbox" aria-label="Agency email on homepage" /></td><td><input id="f_show_agency_email_pdf" type="checkbox" aria-label="Agency email on PDF" /></td></tr>
                  </tbody>
                </table>
              </div>
              <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 4px 0 0;">Show on the album page:</p>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_credits" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  Credits
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_pdf" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  PDF materials
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_instagram" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  Instagram
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_kavyar" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  Kavyar
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_testimonials" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  Testimonials
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_stats" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  Model Stats
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_gear" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  Gear/Equipment
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-sm); cursor: pointer;">
                  <input id="f_show_location" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  Location
                </label>
              </div>
            </fieldset>

            <fieldset id="extraTestimonialsFs" class="fs-collapsible is-collapsed"><legend>Testimonials <span class="legend-opt">optional (up to 3)</span></legend>
              <div class="fs-head">
                <span class="fs-summary" id="fsSummaryTestimonials">No testimonials yet</span>
                <button type="button" class="fs-toggle" aria-expanded="false" aria-controls="fsBodyTestimonials">+ Expand</button>
              </div>
              <div class="fs-body" id="fsBodyTestimonials">
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
                <button type="button" id="clearDiagramBtn" style="display: block; margin-top: 6px; background: none; border: none; color: #b22222; font-size: var(--font-xs); cursor: pointer; text-decoration: underline; padding: 0;">Remove Diagram</button>
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

  function viewBook() {
    const studioEmail = window.STUDIO_CONFIG?.email || "prateeksaxenaphotography@gmail.com";
    const params = new URLSearchParams(location.search);
    const prefilledType = params.get("type") || "";
    const isSelected = (val) => {
      if (val === "Fashion Editorial" && prefilledType === "Editorial") return "selected";
      if (val === "Commercial Campaign" && prefilledType === "Commercial") return "selected";
      return val === prefilledType ? "selected" : "";
    };

    return `
      <section class="page-head admin-page-head book-page-head">
        <div class="container">
          <p class="eyebrow reveal">Book a session</p>
          <h1 class="admin-h1 reveal">Tell us about the shoot.</h1>
          <p class="page-sub admin-sub reveal">Whether it is a campaign, an editorial or a selective test shoot: who you are, what we are shooting, and the brief. Your quote updates as you go, and nothing is sent until you submit.</p>
        </div>
      </section>
      <section class="section container">
        <div class="book-wrap">
          <div class="book-success" id="bookSuccess" style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 20px; width: 100%; max-width: 580px; margin: 0 auto;" hidden>
            <div class="book-success-icon" id="bookSuccessIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <h2 id="bookSuccessHeading">Request prepared.</h2>
            <p id="bookSuccessMsg" style="margin: 0; line-height: 1.6;">Your booking inquiry is ready in your email app — please hit <strong>Send</strong> in your mail client to complete the request.</p>

            <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; width: 100%;">
              <a href="" id="bookGmailLink" target="_blank" rel="noopener noreferrer" class="btn btn-dark" style="font-size: var(--font-xs); height: auto; padding: 10px 18px; text-decoration: none; background: #ea4335; border-color: #ea4335; color: #fff;">Send via Gmail (Web)</a>
              <a href="" id="bookOutlookLink" target="_blank" rel="noopener noreferrer" class="btn btn-dark" style="font-size: var(--font-xs); height: auto; padding: 10px 18px; text-decoration: none; background: #0078d4; border-color: #0078d4; color: #fff;">Send via Outlook (Web)</a>
              <a href="" id="bookMailtoLink" class="btn btn-dark" style="font-size: var(--font-xs); height: auto; padding: 10px 18px; text-decoration: none;">Open my Mail app</a>
            </div>
            <div style="display: flex; gap: 12px; justify-content: center; width: 100%; margin-top: 6px;">
              <button type="button" class="btn btn-ghost" id="bookAnother" style="font-size: var(--font-xs); height: auto; padding: 8px 18px;">Send another request</button>
              <a href="/" data-link class="btn btn-ghost" style="font-size: var(--font-xs); height: auto; padding: 8px 18px; text-decoration: none;">Back to home</a>
            </div>

            <div style="margin-top: 14px; border-top: 1px dashed var(--line); padding-top: 20px; width: 100%; display: flex; flex-direction: column; gap: 10px; align-items: center;">
              <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Mail app didn't open? Copy the inquiry details below and email them to <strong style="color: var(--ink); font-family: monospace;">${studioEmail}</strong>:</p>
              <button type="button" class="btn btn-ghost" id="copyInquiryBtn" style="font-size: var(--font-xs); padding: 8px 16px; height: auto;">Copy Inquiry Text</button>
              <pre id="inquiryTextPreview" style="width: 100%; box-sizing: border-box; background: var(--bone); padding: 14px; border-radius: 6px; font-size: var(--font-xs); font-family: monospace; white-space: pre-wrap; text-align: left; max-height: 200px; overflow-y: auto; border: 1px solid var(--line); color: var(--ink); margin: 0;"></pre>
            </div>
          </div>
          <form class="shoot-form" id="bookingForm" novalidate>
            <fieldset id="bookContactFs">
              <legend>Contact</legend>
               <div class="field-row">
                 <label class="field"><span>Your Name / Brand *</span><input id="b_name" type="text" required placeholder="e.g. John Doe / Brand Name" /></label>
                 <label class="field"><span>Role *</span>
                   <select id="b_role">
                     <option value="Model">Model / Talent</option>
                     <option value="MUA">Makeup Artist / MUA</option>
                     <option value="Stylist">Stylist / Wardrobe</option>
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
               <label class="field"><span id="b_instagram_label">Instagram / Website</span><input id="b_instagram" type="text" placeholder="e.g. @handle or website.com" /></label>
             </fieldset>
 
             <fieldset id="bookShootFs">
               <legend>The shoot</legend>

                <!-- Dedicated Still Photography Specialization & Video Coverage Policy Notice -->
                <div style="background: rgba(var(--accent-rgb), 0.04); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
                  <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Still photography only</div>
                  <div style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5;">
                    Studio packages &amp; rates are <strong>strictly dedicated to Still Photography creation</strong> (Commercial, Fashion, Editorial &amp; Portfolio). Video / Reels coverage is not included in standard packages. Clients may bring their own videographer or request studio assistance to source a freelance videographer for the session.
                  </div>
                </div>

<div style="margin-bottom: 14px; text-align: left;">
                  <a id="toggleInviteCodeLink" href="javascript:void(0)" style="font-size: var(--font-xs); color: var(--accent); font-weight: 700; text-decoration: underline; font-family: var(--mono-font); cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">Have a photographer invite code? (test shoot)</a>
                </div>

                <!-- Photographer Direct Invite Code (Hidden by default, expandable via discreet link) -->
                <div id="inviteCodeContainer" style="display: none; background: rgba(var(--accent-rgb), 0.04); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin-bottom: 18px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-weight: 700; color: var(--ink); font-size: var(--font-sm);">Photographer invite code</span>
                    <span id="inviteCodeStatus" style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; display: none;"></span>
                  </div>
                  <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-bottom: 10px; line-height: 1.4;">Enter your photographer invite code to unlock direct Test Shoot / TFP options.</div>
                  <div style="display: flex; gap: 8px;">
                    <input id="b_invite_code" type="text" placeholder="Enter Direct Invite Code" style="text-transform: uppercase; font-family: var(--mono-font); font-weight: 700; flex: 1; padding: 10px; border: 1px solid var(--line); border-radius: 6px;" />
                    <button type="button" id="btnApplyInviteCode" style="background: var(--accent); color: #ffffff; border: none; padding: 0 18px; border-radius: 6px; font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; cursor: pointer; white-space: nowrap;">Verify Code</button>
                  </div>
                </div>
               <div class="field-row">
                 <label class="field" id="b_type_field_wrap"><span>Desired Project Type *</span>
                   <select id="b_type">
                     <option value="Fashion Editorial" ${isSelected("Fashion Editorial")}>Fashion Editorial</option>
                     <option value="Fitness &amp; Athletic" ${isSelected("Fitness &amp; Athletic")}>Fitness &amp; Athletic</option>
                     <option value="Sports Action" ${isSelected("Sports Action")}>Sports Action</option>
                     <option value="Commercial Campaign" ${isSelected("Commercial Campaign")}>Commercial Campaign</option>
                     <option value="Selective Collaboration (TFP)" ${isSelected("Selective Collaboration (TFP)")}>SELECTIVE COLLABORATION / TFP (Portfolio Collab)</option>
                     <option value="Other" ${isSelected("Other")}>Other Focus Area</option>
                   </select>
                    <div id="b_type_notice" style="font-size: var(--font-xs); color: #059669; margin-top: 6px; font-family: var(--mono-font); background: rgba(5,150,105,0.08); border: 1px solid rgba(5,150,105,0.25); border-radius: 6px; padding: 8px 12px; display: none;">
                      <strong>Test shoot deliverables:</strong> ${esc(getAdminTfpPackage().specs)} · Mandatory Instagram credit @nerdyphotographer.in.
                    </div>
                  </label>

                  <!-- Option B: Locked TFP Card displayed when Photographer Invite Code is verified -->
                  <div id="lockedTfpCard" style="display: none; background: rgba(5,150,105,0.06); border: 1.5px solid #059669; border-radius: 8px; padding: 14px 16px; margin-bottom: 6px; box-shadow: var(--shadow-sm); width: 100%; box-sizing: border-box;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px;">
                      <span>PROJECT TYPE: SELECTIVE COLLABORATION (TFP / TEST SHOOT)</span>
                      <span style="background: #059669; color: #ffffff; padding: 2.5px 8px; border-radius: 4px; font-size: var(--font-xs); font-weight: 700;">LOCKED BY INVITE CODE</span>
                    </div>
                    <div style="font-size: var(--font-xs); color: var(--ink); line-height: 1.5; font-weight: 600; margin-top: 4px;">
                      Session is locked to a <strong>Selective Collaboration / TFP Test Shoot</strong> via your verified Photographer Direct Invite Code.
                    </div>
                    <div style="background: rgba(5,150,105,0.1); border: 1px solid rgba(5,150,105,0.3); border-radius: 6px; padding: 8px 12px; margin-top: 8px; font-family: var(--mono-font); font-size: var(--font-xs); color: #047857; font-weight: 700;">
                      <strong>Test shoot deliverables:</strong> ${esc(getAdminTfpPackage().specs)} · Mandatory credit @nerdyphotographer.in.
                    </div>
                  </div>
                 <label class="field" id="b_date_field">
                    <span>Preferred Date / Timeline * <span id="b_date_availability_badge" style="display: none; font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; padding: 2.5px 7px; border-radius: 4px; margin-left: 8px; vertical-align: middle; text-transform: uppercase; letter-spacing: 0.05em;"></span></span>
                    <div class="date-picker-wrap">
                      <input id="b_date" type="text" required placeholder="e.g. Mid-July 2026, or use the calendar →" autocomplete="off" />
                      <button type="button" class="date-picker-toggle" id="datePickerToggle" aria-label="Open date picker" title="Pick dates from calendar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      </button>
                      <div class="date-picker-popup" id="datePickerPopup"></div>
                    </div>
                    <div id="b_date_booked_note" style="display: none; font-size: var(--font-xs); color: #dc2626; margin-top: 6px; line-height: 1.4;">This date already has a booking — you're welcome to send a request anyway. I'll confirm it or suggest an alternative date.</div>
                  </label>
               </div>
                <div class="field-row">
                  <label class="field venue-native" style="grid-column: 1 / -1;"><span>Where are we shooting? *</span>
                    <!-- A choice of venue rather than a yes/no: the home studio
                         carries no rental, so a yes/no framing on cost no longer
                         fits. No price is stated on the first line on purpose —
                         only the commercial option mentions billing, and that
                         contrast reads as "included" without the discount-sounding
                         wording. Outdoor stays selected by default so an inquiry
                         can never silently claim the home studio; the client has
                         to pick it deliberately. -->
                    <select id="b_studio_space">
                      <option value="Home Studio - Noida (Provided by Studio)" id="b_studio_space_home">Home Studio, Noida — intimate setup, best for portraits, comp cards &amp; solo talent</option>
                      <option value="Dedicated Commercial Studio Rental (Billed at Actuals)">Dedicated Commercial Studio</option>
                      <option value="Outdoor / On-Location (No Studio Required)" selected>Outdoor / on-location — no studio required</option>
                    </select>
                  </label>
                  <!-- Visible face of the <select> above: a pick writes the select
                       and fires change, so every consumer of #b_studio_space
                       (updateFields, the submit payload, the contract clause)
                       is untouched. Kept inside this .field-row so the invite
                       code's venue lock hides both together. -->
                  <div class="venue-cards" id="venueCards" style="grid-column: 1 / -1;" role="radiogroup" aria-label="Where are we shooting?">
                    <label class="venue-card"><input type="radio" name="venue_pick" value="Home Studio - Noida (Provided by Studio)" /><span class="vc-main"><strong>Home studio, Noida</strong><small>Intimate setup · portraits, comp cards, solo talent</small></span><span class="vc-tag">Rental itemised in your quote</span></label>
                    <label class="venue-card"><input type="radio" name="venue_pick" value="Dedicated Commercial Studio Rental (Billed at Actuals)" /><span class="vc-main"><strong>Commercial studio</strong><small>Rented space, booked by you or by us</small></span><span class="vc-tag">Rental quoted separately</span></label>
                    <label class="venue-card"><input type="radio" name="venue_pick" value="Outdoor / On-Location (No Studio Required)" checked /><span class="vc-main"><strong>Outdoor / on location</strong><small>Your venue, or the outdoors</small></span><span class="vc-tag">No studio needed</span></label>
                  </div>
                </div>
                <!-- Shown only for the rented commercial studio: that space
                     does not come with the photographer's own lighting kit
                     built in the way the home studio does, so the client has
                     to say who is actually booking the space and lighting —
                     themselves, or the photographer on their behalf, billed
                     at actuals. Neither radio is pre-checked, so submitting
                     without an explicit pick is not possible while the row
                     is visible. -->
                <div class="field-row" id="b_studio_arranger_wrap" style="display: none;">
                  <label class="field" style="grid-column: 1 / -1;"><span>Who Will Arrange the Rented Studio? *</span>
                    <div style="font-weight: 400; font-size: 0.85em; opacity: 0.75; margin-top: 4px;">This studio does not include lighting equipment — please choose one:</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 16px; margin-top: 8px;">
                      <label style="display: flex; align-items: flex-start; gap: 6px; font-weight: 400; cursor: pointer; flex: 1 1 220px;">
                        <input type="radio" name="b_studio_arranger" id="b_studio_arranger_client" value="Client Arranges Studio & Lighting Independently" style="width: 15px; height: 15px; padding: 0; border: none; background: transparent; border-radius: 0; margin: 0; margin-top: 3px; flex-shrink: 0;" />
                        I'll rent the studio and lighting on my own and share the details with the photographer
                      </label>
                      <label style="display: flex; align-items: flex-start; gap: 6px; font-weight: 400; cursor: pointer; flex: 1 1 220px;">
                        <input type="radio" name="b_studio_arranger" id="b_studio_arranger_photog" value="Photographer Arranges Studio & Lighting (Billed at Actuals)" style="width: 15px; height: 15px; padding: 0; border: none; background: transparent; border-radius: 0; margin: 0; margin-top: 3px; flex-shrink: 0;" />
                        The photographer should arrange the studio and lighting for me
                      </label>
                    </div>
                  </label>
                </div>
                <div class="field-row">
                  <label class="field"><span>Preferred Session Duration (Optional)</span>
                    <select id="b_duration">
                      <option value="Flexible / Photographer Choice" selected>Flexible / Photographer Choice (Recommended)</option>
                      <option value="Full Day (10:30 AM – 5:30 PM)">Full Day Shoot (10:30 AM – 5:30 PM · 7 Hours)</option>
                      <option value="Half Day Morning (10:30 AM – 2:30 PM)">Half Day Morning (10:30 AM – 2:30 PM · 4 Hours)</option>
                      <option value="Half Day Afternoon (1:30 PM – 5:30 PM)">Half Day Afternoon (1:30 PM – 5:30 PM · 4 Hours)</option>
                      <option value="Custom Timings">Custom Timings (Pick Call &amp; Wrap Time)</option>
                    </select>
                    <div id="b_duration_note" style="font-size: var(--font-xs); color: #059669; margin-top: 6px; font-family: var(--mono-font); background: rgba(5,150,105,0.08); border: 1px solid rgba(5,150,105,0.25); border-radius: 6px; padding: 8px 12px; display: none;">
                      <strong>Test shoots run to a half day (4 hours).</strong> A custom call &amp; wrap window can stretch to 5 hours at most.
                    </div>
                  </label>
                  <label class="field"><span>Shoot Location / Venue Address *</span><input id="b_location" type="text" required placeholder="" /></label>
                </div>

                <div id="b_custom_time_wrap" style="display: none; background: var(--bone); border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
                  <div style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">⏰ Custom Call &amp; Wrap Timings</div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Start / Call Time *
                      <input type="time" id="b_time_start" value="10:30" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                    </label>
                    <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">End / Wrap Time *
                      <input type="time" id="b_time_end" value="17:30" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                    </label>
                  </div>
                  <div id="b_custom_time_badge" style="margin-top: 8px; font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent);">
                    ⏱️ 7 Hours Session (10:30 AM – 5:30 PM)
                  </div>
                </div>

               <div class="field-row">
                 <label class="field" id="b_budget_field" style="grid-column: 1 / -1;"><span>Studio Package &amp; Rate Tier *</span>
                   <select id="b_budget">
                     ${getAdminPackages().map((p, i) => `<option value="₹${p.price.toLocaleString('en-IN')} (${p.name})"${i===0?' selected':''}>₹${p.price.toLocaleString('en-IN')} · ${p.name} (${p.specs})</option>`).join("")}
                   </select>
                 </label>
               </div>
               <div id="collabFallbackWrap" style="display: none; background: var(--bone); border: 1px dashed var(--line); border-radius: 8px; padding: 14px; margin-bottom: 16px; text-align: left; grid-column: 1 / -1;"></div>

               <div class="field-row" style="margin-top: 10px;">
                 <label class="field" id="b_discount_field" style="grid-column: 1 / -1;">
                   <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                     <span style="font-weight: 700; color: var(--ink);">Promo code (optional)</span>
                     <span id="discountCodeStatus" style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; display: none;"></span>
                   </div>
                   <div style="display: flex; gap: 8px;">
                     <input id="b_discount_code" type="text" placeholder="Enter Promo Code" style="text-transform: uppercase; font-family: var(--mono-font); font-weight: 700; flex: 1; padding: 10px; border: 1px solid var(--line); border-radius: 6px;" />
                     <button type="button" id="btnApplyDiscountCode" style="background: var(--accent); color: #ffffff; border: none; padding: 0 18px; border-radius: 6px; font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; cursor: pointer; white-space: nowrap;">Apply Code</button>
                   </div>
                 </label>
               </div>
               <div id="discountSavingsBadge" style="display: none; margin-top: 6px; font-family: var(--mono-font); font-size: var(--font-xs); color: #059669; font-weight: 700;"></div>

               <!-- Starts HIDDEN and is shown only once updateFields has
                    confirmed a price actually applies (it runs unconditionally
                    when the form is wired, so a paying client still sees it).
                    Defaulting to visible meant every failure mode — a throw
                    earlier in updateFields, a lookup returning null, a
                    re-render — showed a package rate and payment milestones to
                    someone invited to shoot for free. Wrong in the expensive
                    direction; hidden-by-default fails the safe way. -->
               <div id="finalPriceSummaryBox" style="display: none; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; margin-top: 18px; margin-bottom: 28px; box-shadow: var(--shadow-sm);">
                  <div style="font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <span>Your quote</span>
                    <span id="calcDiscountTag" style="font-size: var(--font-xs); color: #059669; background: rgba(5,150,105,0.2); padding: 3px 10px; border-radius: 12px; font-weight: 700; display: none;"></span>
                  </div>
                  <!-- Itemised as a stacked list rather than one wrapping row:
                       every charge gets its own line, and the total sits at the
                       foot where a quote is read from. Add-on lines appear only
                       when they apply. -->
                  <div style="font-family: var(--mono-font); font-size: var(--font-sm); border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 5px 0;">
                      <span id="summaryPackageLabel" style="color: var(--ink-soft);">Package Base Rate</span>
                      <span id="summaryOriginalPrice" style="font-weight: 700; color: var(--ink); white-space: nowrap;">₹${getAdminPackages()[0].price.toLocaleString('en-IN')}</span>
                    </div>
                    <div id="summaryHomeStudioWrap" style="display: none; justify-content: space-between; align-items: baseline; gap: 12px; padding: 5px 0;">
                      <span style="color: var(--ink-soft);"><span id="summaryHomeStudioLabel">Home Studio Rental (Noida)</span></span>
                      <span id="summaryHomeStudioAmount" style="font-weight: 700; color: var(--ink); white-space: nowrap;">+₹0</span>
                    </div>
                    <div id="summaryDiscountWrap" style="display: none; justify-content: space-between; align-items: baseline; gap: 12px; padding: 5px 0;">
                      <span id="summaryDiscountLabel" style="color: #059669; font-weight: 700;">Promo Savings:</span>
                      <span id="summarySavingsAmount" style="font-weight: 700; color: #059669; white-space: nowrap;">-₹0</span>
                    </div>
                    <!-- Only when more than one saving stacks up. A waived
                         rental is worth more than the discount that carried it,
                         and adding them up is the only place the client (and
                         the studio's own record) sees what the booking was
                         really worth. -->
                    <div id="summaryTotalSavingsWrap" style="display: none; justify-content: space-between; align-items: baseline; gap: 12px; padding: 8px 0 2px; margin-top: 6px; border-top: 1px solid rgba(5,150,105,0.3);">
                      <span style="color: #059669; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: var(--font-xs);">Total savings</span>
                      <span id="summaryTotalSavingsAmount" style="font-weight: 800; color: #059669; white-space: nowrap; font-family: var(--mono-font);">₹0</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 10px 0 2px; margin-top: 8px; border-top: 1px solid var(--line-2);">
                      <span style="color: var(--ink); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: var(--font-xs);">Total payable</span>
                      <span id="summaryFinalAmount" style="font-size: var(--font-md); font-weight: 800; color: var(--accent); font-family: var(--mono-font); white-space: nowrap;">₹${getAdminPackages()[0].price.toLocaleString('en-IN')} INR</span>
                    </div>
                    <!-- Only when the client has handed studio+lighting booking
                         over to the photographer: the actual venue and lighting
                         cost is not known yet, so the total above will change
                         once those are booked and billed at actuals. Hidden the
                         rest of the time so it never implies a change that
                         isn't coming. -->
                    <div id="summaryArrangerNote" style="display: none; margin-top: 8px; padding: 8px 10px; background: rgba(217,119,6,0.12); border: 1px solid rgba(217,119,6,0.35); border-radius: 6px; font-size: var(--font-xs); color: #d97706; font-family: inherit;">⚠️ Since the photographer is arranging the studio &amp; lighting, this total does not yet include the venue and equipment — that is quoted separately and added once the venue is booked.</div>
                  </div>
                  <!-- Milestone Itemized Breakdown. Reads the studio's global
                       2-step (50/50) or 3-step (50/30/20) setting — the same
                       switch that drives the flowchart below — so the live
                       numbers the client sees always match the milestones the
                       contract they are about to sign describes. -->
                  <div id="summaryMilestoneBreakdown" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; font-size: var(--font-xs);">
                    <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px;">
                      <span id="summaryAdvanceLabel" style="color: var(--ink-soft); display: block; font-size: var(--font-xs); text-transform: uppercase;">Step 1 · 50% Advance Retainer (Due Now)</span>
                      <strong id="summaryAdvanceAmount" style="color: var(--accent); font-size: var(--font-sm); font-family: var(--mono-font);">₹${Math.round(getAdminPackages()[0].price / 2).toLocaleString('en-IN')} INR</strong>
                    </div>
                    <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px;">
                      <span id="summaryStep2Label" style="color: var(--ink-soft); display: block; font-size: var(--font-xs); text-transform: uppercase;">Step 2 · 50% Wrap Balance (Prior to Deliverables)</span>
                      <strong id="summaryBalanceAmount" style="color: #059669; font-size: var(--font-sm); font-family: var(--mono-font);">₹${(getAdminPackages()[0].price - Math.round(getAdminPackages()[0].price / 2)).toLocaleString('en-IN')} INR</strong>
                    </div>
                    <div id="summaryStep3Wrap" style="display: none; background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px;">
                      <span style="color: var(--ink-soft); display: block; font-size: var(--font-xs); text-transform: uppercase;">Step 3 · 20% Final Deliverables</span>
                      <strong id="summaryStep3Amount" style="color: #f57c00; font-size: var(--font-sm); font-family: var(--mono-font);">₹0 INR</strong>
                    </div>
                  </div>
                  <!-- Collaboration bookings carry no package fee, so the only
                       amount owed is the studio rental. It reserves the space,
                       so it is due in full up front rather than split in two —
                       the 50/50 grid above is hidden for these. -->
                  <div id="summaryNothingToPay" style="display: none; background: rgba(5,150,105,0.12); border: 1px solid rgba(5,150,105,0.35); border-radius: 6px; padding: 8px 12px; font-size: var(--font-xs); color: #2F6B4F; line-height: 1.5;">
                    <strong>Nothing to pay for this collaboration.</strong> The studio is covering the venue for this session — the figure above is what it would otherwise have cost.
                  </div>
                  <div id="summaryReservationCard" style="display: none; background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; font-size: var(--font-xs);">
                    <span style="color: var(--ink-soft); display: block; font-size: var(--font-xs); text-transform: uppercase;">Home studio rental · paid in full up front</span>
                    <strong id="summaryReservationAmount" style="color: var(--accent); font-size: var(--font-sm); font-family: var(--mono-font);">₹0 INR</strong>
                    <span style="color: var(--ink-soft); display: block; margin-top: 4px; line-height: 1.5;">Payable <strong style="color: var(--ink);">in full</strong> at least 48 hours before the shoot day to reserve the home studio. <strong style="color: #e07a5f;">Non-refundable.</strong></span>
                  </div>
                </div>

               <div class="book-policies" style="background: var(--bone); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 10px; padding: 16px 18px; margin-bottom: 20px;">
                 <button type="button" id="bookPoliciesToggle" aria-expanded="false" aria-controls="bookPoliciesDetail" style="all: unset; box-sizing: border-box; cursor: pointer; display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 10px;">
                   <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em;">Studio policies &amp; terms</span>
                   <span id="bookPoliciesToggleIcon" style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent); white-space: nowrap;">+ Read full policies</span>
                 </button>
                 <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 6px; line-height: 1.4;">Still photography only · studio rental quoted separately · travel &gt;20km at actuals · full gallery buyout available</div>
                 <div id="bookPoliciesDetail" style="display: none; margin-top: 12px;">
                 <ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px;">
                   <li style="display: flex; gap: 10px; align-items: flex-start; font-size: var(--font-xs); line-height: 1.55; color: var(--ink-soft);">
                      <span aria-hidden="true" style="flex: 0 0 20px; font-size: var(--font-sm); line-height: 1.4;">📷</span>
                      <span><strong style="color: var(--ink);">Still Photography Specialization:</strong> Rates &amp; studio packages are <strong style="color: var(--ink);">strictly dedicated to Still Photography creation</strong>. Video / Reels coverage is excluded from standard packages. Clients may hire an external videographer or request studio assistance to source a freelance videographer for the session.</span>
                    </li>
<li style="display: flex; gap: 10px; align-items: flex-start; font-size: var(--font-xs); line-height: 1.55; color: var(--ink-soft);">
                     <span aria-hidden="true" style="flex: 0 0 20px; font-size: var(--font-sm); line-height: 1.4;">🏢</span>
                     <span id="policyStudioRental"><strong style="color: var(--ink);">Studio Rental:</strong> Package rates cover photography creation, light design &amp; master retouched deliverables. If a dedicated indoor studio venue/space is required, applicable studio rental fees are <strong style="color: var(--ink);">quoted separately in advance</strong>, or the client may directly book their preferred studio space for the production.</span>
                   </li>
                   <li style="display: flex; gap: 10px; align-items: flex-start; font-size: var(--font-xs); line-height: 1.55; color: var(--ink-soft);">
                     <span aria-hidden="true" style="flex: 0 0 20px; font-size: var(--font-sm); line-height: 1.4;">🚗</span>
                     <span id="policyTravel"><strong style="color: var(--ink);">Travel &amp; Accommodation:</strong> Shoots requiring travel beyond <strong style="color: var(--ink);">20 km</strong> from the studio base (Noida) incur paid travel and, where an overnight stay is needed, accommodation — billed <strong style="color: var(--ink);">at actuals (at cost)</strong>.</span>
                   </li>
                   <li style="display: flex; gap: 10px; align-items: flex-start; font-size: var(--font-xs); line-height: 1.55; color: var(--ink-soft);">
                     <span aria-hidden="true" style="flex: 0 0 20px; font-size: var(--font-sm); line-height: 1.4;">📸</span>
                     <span><strong style="color: var(--ink);">Full Unedited Gallery Buyout:</strong> Packages include a proofing gallery to select contracted retouches. If the client requests the complete full unedited image gallery or additional retouched master clicks beyond the package limit, extra gallery buyout charges apply.</span>
                   </li>
                   <li id="policyLateArrival" style="display: none; gap: 10px; align-items: flex-start; font-size: var(--font-xs); line-height: 1.55; color: var(--ink-soft);"><span aria-hidden="true" style="flex: 0 0 20px; font-size: var(--font-sm); line-height: 1.4;">⏰</span><span id="policyLateArrivalText"></span></li>
                   <li style="display: flex; gap: 10px; align-items: flex-start; font-size: var(--font-xs); line-height: 1.55; color: var(--ink-soft);">
                     <span aria-hidden="true" style="flex: 0 0 20px; font-size: var(--font-sm); line-height: 1.4;">🔒</span>
                     <span><strong style="color: var(--ink);">Camera &amp; Media Protection:</strong> All camera equipment, memory cards, and raw captures are strictly confidential studio property. Participants may not touch equipment or delete media from cameras. Unauthorized file deletion constitutes a material breach of contract and incurs full data recovery costs.</span>
                   </li>
                 </ul>
                 </div>
               </div>

             </fieldset>

             <fieldset id="bookBriefFs">
               <legend>Brief</legend>
                <div class="field" style="display: flex; flex-direction: column; gap: 4px;">
                  <span>Reference &amp; Mood Board Links (Multiple allowed)</span>
                  <div id="b_links_container">
                    <div class="link-input-row">
                      <input class="b_moodboard_input" type="url" placeholder="Pinterest board, Dropbox, or Google Drive URL" />
                    </div>
                  </div>
                  <button type="button" id="b_add_link_btn" style="background:none; border:1px dashed var(--line); padding:6px 12px; border-radius:6px; font-family:var(--mono-font); font-size: var(--font-xs); font-weight:700; cursor:pointer; color:var(--ink-soft); align-self:flex-start; margin-top:4px;">+ Add another reference link</button>
                </div>

                <div class="field" style="display: flex; flex-direction: column; gap: 4px;">
                  <span>File Attachments (Multiple PDFs, Images, Brief Documents)</span>
                  <input id="b_file_input" type="file" multiple accept="image/*,application/pdf,.doc,.docx" style="display: none;" />
                  <div class="attachments-dropzone" id="b_dropzone">
                    📎 <strong>Click or drag files here to attach</strong>
                    <div style="font-size: var(--font-xs); margin-top: 4px;">Attach multiple PDFs, moodboard JPEGs, or project documents</div>
                  </div>
                  <div class="attachment-list" id="b_file_list"></div>
                </div>

                <label class="field"><span>Project Concept &amp; Detailed Brief</span><textarea id="b_concept" rows="4" placeholder="Describe the mood, location style, styling ideas, and deliverables you have in mind..."></textarea></label>
              </fieldset>

              <!-- Payment Terms & Milestone Flowchart -->
              <fieldset id="paymentTermsFieldset" style="border: 1px solid var(--line); border-radius: 12px; padding: 24px; background: var(--paper); margin-top: 24px;">
                <legend style="font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); padding: 0 10px;">Payment terms &amp; milestones</legend>
                
                <div style="margin-bottom: 18px;">
                  <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">To reserve studio dates and ensure smooth delivery, studio productions follow structured milestone payments as detailed below:</p>
                </div>

                <!-- Flowchart 2-Step (Default) -->
                <div id="flowchart2Step" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 18px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; margin-bottom: 6px;">STEP 1 · 50% ADVANCE RETAINER</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">48 hours before shoot start</h4>
                    <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid at least 48 hours before the shoot day to reserve studio space, schedule the crew, and lock calendar availability (unless explicitly discussed with the team). <strong>Mandatory prior to shoot start.</strong> <strong style="color: #b22222;">(Non-refundable)</strong></p>
                  </div>

                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 18px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: #2e7d32; text-transform: uppercase; margin-bottom: 6px;">STEP 2 · 50% FINAL BALANCE</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">After the shoot · before any file is delivered</h4>
                    <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid upon completion of the shoot session, prior to receiving any downloadable preview or retouched final deliverable file. <strong style="color: #b22222;">(Non-refundable)</strong></p>
                  </div>
                </div>

                <!-- Flowchart 3-Step (3-Tier Milestone) -->
                <div id="flowchart3Step" style="display: none; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px;">
                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; margin-bottom: 6px;">STEP 1 · 50% ADVANCE RETAINER</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">48 hours before shoot start</h4>
                    <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid at least 48 hours before the shoot day to lock studio date and reserve production crew (unless explicitly discussed with the team). <strong>Mandatory prior to shoot start.</strong> <strong style="color: #b22222;">(Non-refundable)</strong></p>
                  </div>

                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: #f57c00; text-transform: uppercase; margin-bottom: 6px;">STEP 2 · 30% REVIEW MILESTONE</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">After the shoot · proofing gallery</h4>
                    <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid after shoot wrap, before receiving the watermarked proofing gallery to select retouches. <strong style="color: #b22222;">(Non-refundable)</strong></p>
                  </div>

                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: #2e7d32; text-transform: uppercase; margin-bottom: 6px;">STEP 3 · 20% FINAL DELIVERABLES</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">Before any file is delivered</h4>
                    <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid upon final approval, prior to receiving any downloadable or high-resolution retouched master file.</p>
                  </div>
                </div>
              </fieldset>
 
             <!-- TFP Liability Release Terms Modal -->
             <div id="termsModal" class="modal-overlay" style="display: none; position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); align-items: center; justify-content: center; padding: 20px;">
               <div class="modal-content" style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; max-width: 680px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.15); overflow: hidden; animation: modalFadeIn 0.3s ease;">
                 <div style="padding: 20px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; background: var(--bone);">
                   <h3 id="termsModalTitle" style="margin: 0; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink);">Studio Production &amp; Liability Release</h3>
                   <span id="termsModalTag" style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--accent); padding: 4px 8px; border-radius: 4px; color: #fff; font-weight: 700;">TFP-LIABILITY-RELEASE-V3.6 (ACTIVE)</span>
                 </div>
                 <div style="padding: 24px; overflow-y: auto; font-size: var(--font-sm); line-height: 1.6; color: var(--ink); display: flex; flex-direction: column; gap: 20px; text-align: left;">
                   <p style="margin: 0; font-family: var(--mono-font); font-size: var(--font-xs); color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em;">TFP Collaboration, Model Release &amp; Digital Consent Terms</p>
                   
                   <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 6px; padding: 14px; font-size: var(--font-xs); display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px;">
                     <div><strong>Studio/Photographer:</strong> nerdyphotographer.in</div>
                     <div><strong>Creative Partner/Model:</strong> <span id="terms_partner_name">[Your Name]</span></div>
                     <div><strong>Business Handle:</strong> @nerdyphotographer.in</div>
                     <div><strong>Consent Tracking:</strong> Verified via Email / Digital Acknowledgment</div>
                     <div><strong>Production Status:</strong> Time-For-Print (TFP) Collab</div>
                     <div><strong>Location:</strong> Studio Production Space</div>
                   </div>
 
                   <div>
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700;">1. SCOPE OF CREATIVE COLLABORATION</h4>
                     <p style="margin: 0;">This session is scheduled as a peer-to-peer creative collaboration structured for mutual portfolio growth, asset curation, and personal branding advancement. No monetary compensation is required or exchanged for photographer or model services. The Studio provides specialized equipment, lighting architecture, workspace, and post-production engineering; the Participant(s) provide technical modeling direction, personal wardrobe, and makeup artistry. <em id="bookingContractStudioClause">If a dedicated external or commercial studio space is requested or booked for the shoot, the Participant shall be entirely responsible for covering the applicable studio rental charges.</em></p>
                   </div>
 
                   <div>
                      <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700;">2. INTELLECTUAL PROPERTY, MODEL RELEASE &amp; USAGE LICENSE</h4>
                      <p style="margin: 0;">The legal copyright of all visual media remains exclusively with the Studio. To support mutual growth and portfolio building, all participants are granted a full non-exclusive license to publish, share, and use final retouched photos for personal self-promotion, social media grids (Instagram/TikTok), personal websites, and agency portfolios.</p>
                      <p style="margin: 6px 0 0 0; font-style: italic;"><strong>No Alterations:</strong> To preserve the lighting design and capture integrity, no party shall apply secondary mobile filters, automated presets, cropping adjustments, or third-party digital modifications to the delivered files.</p>
                    </div>
 
                   <div style="border-left: 3px solid var(--accent); padding-left: 14px; background: rgba(var(--accent-rgb), 0.04);">
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: #b22222;">3. COMPREHENSIVE LIABILITY WAIVER &amp; INDEMNIFICATION</h4>
                     <p style="margin: 0; font-weight: 500;">CRITICAL SAFETY &amp; LIABILITY RELEASE: The Participant enters the studio environment, uses studio blocks, cubes, chairs, furniture, or props, and performs physical poses entirely at their own risk. The Studio shall not be held liable for any physical injury, illness, accident, psychological distress, property damage, or clothing wear-and-tear incurred before, during, or after this production. The Participant explicitly waives any right to seek damages or legal recourse against the Studio or its operating photographers for accidents or injuries occurring on the premises.</p>
                     <p style="margin: 6px 0 0 0;">Furthermore, the Participant agrees to indemnify and hold harmless the Studio from any claims, damages, liabilities, or legal expenses arising out of the Participant’s conduct or injuries on set.</p>
                   </div>
 
                   <div>
                      <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700;">4. TECHNICAL PERFORMANCE &amp; DELIVERY DISCLAIMER</h4>
                      <p style="margin: 0;">As a creative collaboration, test shoots (TFP collabs) include <strong>${esc(getAdminTfpPackage().specs)}</strong>. The Studio retains final artistic authority over image selection and editing styles. Under no circumstances will raw unedited files (RAW format) be delivered to the Participant, unless otherwise agreed upon in writing for an additional fee.</p>
                    </div>
 
                   <div>
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700;">5. MANDATORY ALL-PARTY ATTRIBUTION WORKFLOW</h4>
                     <p style="margin: 0 0 6px 0;">To ensure creative transparency, all parties agree to execute the following mandatory publishing workflow:</p>
                     <ul style="margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px;">
                       <li><strong>Instagram Collaboration Feature:</strong> For all primary feed or grid publications, the publishing party must issue an Instagram Co-Author Collaboration Invite to <strong>@nerdyphotographer.in</strong> prior to publishing.</li>
                       <li><strong>Full Production Credits Block:</strong> Every party publishing an asset must explicitly credit all contributors in the caption. In formats where joint collaboration tools are restricted, a comprehensive credit block must be placed within the first three lines of the caption body text as follows:
                         <pre style="margin: 6px 0; background: var(--bone); padding: 8px; border-radius: 4px; font-family: monospace; font-size: var(--font-xs); white-space: pre-wrap; line-height: 1.4;">
📷 Photography &amp; Light Design: @nerdyphotographer.in
👤 Model / Talent: @[Handle]
💄 Makeup Artist / MUA: @[Handle]
👔 Styling / Wardrobe: @[Handle]</pre>
                       </li>
                     </ul>
                   </div>
 
                   <div style="border-left: 3px solid #b22222; padding-left: 14px; background: rgba(178,34,34,0.04);">
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: #b22222;">6. UNAUTHORIZED CAMERA OPERATION, GEAR HANDS-OFF &amp; DATA PROTECTION CLAUSE</h4>
                     <p style="margin: 0; font-weight: 500;">All raw captures, memory cards, and camera equipment remain the exclusive property and intellectual property of the Studio. Under no circumstances is a model, participant, or client permitted to touch, handle, or delete media from the photographer's camera, cards, or tethering systems.</p>
                     <p style="margin: 6px 0 0 0; font-weight: 500;">The Studio retains sole artistic authority over image culling, selection, and deletion. Deleting or attempting to delete media from equipment constitutes a material breach of contract, resulting in immediate termination of the shoot, forfeiture of all deliverables, and potential liability for data recovery expenses.</p>
                   </div>

                   <div>
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700;">7. DIGITAL CONSENT, EMAIL ACCEPTANCE &amp; BINDING NATURE</h4>
                     <p style="margin: 0;">In accordance with standard digital contract practices, a physical or handwritten signature is not required to validate these terms. Definitive legal acceptance and a binding obligation to these conditions are established through any of the following actions:</p>
                     <ul style="margin: 6px 0 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px;">
                       <li>Sending a reply stating "I agree", "Confirmed", or equivalent confirmation over email or direct digital messaging channels.</li>
                       <li>Voluntarily entering the studio workspace environment and participating in the scheduled production session following receipt of these terms.</li>
                     </ul>
                   </div>

                    <div style="border-left: 3px solid var(--accent); padding-left: 14px; background: rgba(var(--accent-rgb), 0.04);">
                      <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--accent);">8. OUTSTATION LOCATION, TRAVEL &amp; ACCOMMODATION EXPENSE POLICY (&gt;20 KM FROM NOIDA)</h4>
                      <p style="margin: 0; font-weight: 500;">If the shoot location is located beyond a 20 km radius from Noida (Delhi NCR), all travel expenses, local conveyance, outstation transport, tolls, and accommodation expenses incurred for the photographer (and core production team) shall be fully borne, arranged, or reimbursed by the client / party requesting the shoot session. This condition applies to both Paid Commercial Shoots and Test Shoot Collaborations (TFP).</p>
                    </div>
                   
                   <!-- Test shoots only: a collaboration brings no retainer with
                        it, so a no-show costs the studio a held weekend and
                        nothing else. Hidden for commercial bookings by
                        openTermsModal, where the non-refundable retainer
                        already carries that risk. -->
                   <div id="termsLateArrivalSection" style="border-left: 3px solid #b22222; padding-left: 14px; background: rgba(178,34,34,0.04); display: none;"></div>

                   <!-- Checkbox Agreement Block -->
                   <div style="margin-top: 15px; border-top: 1px dashed var(--line); padding-top: 15px;">
                     <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; background: var(--bone); border: 1.5px solid var(--accent); border-radius: 8px; padding: 14px;">
                       <input type="checkbox" id="termsAgreeCheckbox" style="width: 20px; height: 20px; margin-top: 2px; accent-color: var(--accent); cursor: pointer;" />
                       <span style="font-size: var(--font-xs); color: var(--ink); line-height: 1.5; font-weight: 600;">
                         I have read, understood, and agree to the <strong id="termsAgreeVersionLabel">Studio Terms &amp; Conditions</strong> and <strong>Model Release Agreement</strong>.
                       </span>
                     </label>
                   </div>
                 </div>
                  <div style="padding: 16px 20px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; background: var(--bone);">
                    <div id="customContractOptionWrap" style="display: none; background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 12px; text-align: left;">
                      <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft); display: block;">Specify Your Custom Contract / Agency MSA Details (Optional):
                        <input type="text" id="customContractNotesInput" placeholder="e.g. Client Agency MSA provided via Email / Custom Brand Terms" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                      </label>
                    </div>
                    <div style="display: flex; gap: 8px; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                      <button type="button" class="btn btn-ghost" id="termsDeclineBtn" style="font-size: var(--font-xs); height: auto; padding: 9px 14px;">✕ Decline</button>
                      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button type="button" class="btn btn-ghost" id="termsCustomBtn" style="font-size: var(--font-xs); height: auto; padding: 9px 14px; border: 1px solid var(--accent); color: var(--accent); font-weight: 700;">📝 Request Custom Contract</button>
                        <button type="button" class="btn btn-dark" id="termsAcceptBtn" style="font-size: var(--font-xs); height: auto; padding: 9px 18px;">✅ Agree &amp; Continue</button>
                      </div>
                    </div>
                  </div>
                 </div>
               </div>

            <div id="gearProtectionCallout" style="background: rgba(178,34,34,0.05); border: 1px solid rgba(178,34,34,0.3); border-radius: 10px; padding: 18px; margin-bottom: 20px; text-align: left;">
             <div style="display: flex; align-items: center; gap: 8px; font-family: 'Outfit', sans-serif; font-size: var(--font-sm); font-weight: 700; color: #b22222; margin-bottom: 10px;">
               Unauthorised data deletion &amp; gear clause
             </div>
             <p style="font-size: var(--font-xs); color: var(--ink); margin: 0 0 8px; line-height: 1.5; font-weight: 500;">
               "All raw captures, memory cards, and camera equipment remain the exclusive property and intellectual property of the Studio. Under no circumstances is a model, participant, or client permitted to touch, handle, or delete media from the photographer's camera, cards, or tethering systems."
             </p>
             <p style="font-size: var(--font-xs); color: var(--ink); margin: 0; line-height: 1.5; font-weight: 500;">
               "The Studio retains sole artistic authority over image culling, selection, and deletion. Deleting or attempting to delete media from equipment constitutes a material breach of contract, resulting in immediate termination of the shoot, forfeiture of all deliverables, and potential liability for data recovery expenses."
             </p>
           </div>

           <div id="bookingPolicyOuter" style="background: var(--bone); border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin-bottom: 24px; text-align: left;">
             <!-- #bookingPolicyNotice's innerHTML is fully replaced by
                  updateFields() on load and on every shoot-type change (see
                  the TFP / Commercial branch there) — so the toggle and its
                  state live on this outer wrapper instead, which JS never
                  touches, rather than inside the div JS overwrites. -->
             <button type="button" id="bookingPolicyToggle" aria-expanded="false" aria-controls="bookingPolicyNoticeWrap" style="all: unset; box-sizing: border-box; cursor: pointer; display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 10px;">
               <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em;">Booking &amp; production terms</span>
               <span id="bookingPolicyToggleIcon" style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent); white-space: nowrap;">+ Read full terms</span>
             </button>
             <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 6px; line-height: 1.4;">Retainer &amp; cancellation terms, usage licensing, and call-time policy for this booking.</div>
             <div id="bookingPolicyNoticeWrap" style="display: none; margin-top: 10px;">
               <div id="bookingPolicyNotice" style="font-size: var(--font-xs); line-height: 1.5; color: var(--ink-soft);">
                  <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Booking &amp; Collaboration Policy</span>
                  Submission of a booking inquiry or TFP collaboration request does not constitute a confirmed session or a commitment to shoot. All inquiries are subject to schedule availability, creative brief alignment, and final studio review. <strong>Note: If a dedicated studio space is booked for the shoot, applicable studio rental charges will apply.</strong> Collaboration requests (TFP/Test Shoots) are selective and accepted at the sole discretion of the studio. Inquiries that are not explicitly approved by the studio will be considered inactive.
               </div>
             </div>
           </div>

            <button type="submit" class="btn btn-dark btn-block" id="bookSubmitBtn">Submit Booking Request</button>
            <!-- Pinned total + submit while the form is on screen; mirrors
                 #summaryFinalAmount / #bookSubmitBtn and just clicks the real
                 button, so validation and the terms flow stay untouched.
                 Shown/hidden by wireBook (fixed, not sticky — see the note on
                 .upload-sticky-bar). -->
            <div class="upload-sticky-bar book-sticky-bar is-hidden" id="bookStickyBar" aria-live="polite">
              <div class="sticky-total" id="bookStickyTotal" style="display: none;"><small>Total payable</small><strong id="bookStickyAmount">—</strong></div>
              <span class="sticky-note" id="bookStickyNote">Ready when you are</span>
              <div class="sticky-actions">
                <button type="button" class="btn btn-dark sticky-publish" id="bookStickySubmit">Submit booking request</button>
              </div>
            </div>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 15px; text-align: center; line-height: 1.4;">By submitting a booking request, you agree to our standard terms. For test shoots, read our online <a href="#tfp-terms" id="tfpTermsTrigger" style="text-decoration: underline; color: var(--accent); font-weight: 600;">Studio Production &amp; Liability Release</a>.</p>
          </form>
        </div>
      </section>
    `;
  }

  /* ============================================================
     §13 · VIEW WIRING — event handlers per view
     ============================================================ */
  function wireUpload(editId) {
    staged = [];
    const dz = $("#dropzone"), fi = $("#fileInput"), grid = $("#stagingGrid"), note = $("#queueNote"), pub = $("#publishBtn"), form = $("#shootForm");
    // Bulk pose-tagging: tick photos, click a pose once to tag all of them —
    // avoids setting the Angle/Profile dropdown one photo at a time on
    // shoots with a dozen-plus frames. selectedForBulk is transient UI state
    // (never saved), cleared on every re-render of the grid.
    const selectedForBulk = new Set();
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
      box.style.cssText = "width: 16px; height: 16px; accent-color: var(--accent);";
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

    const diagInput = $("#f_diagram_file"), diagPreview = $("#diagramPreview"), diagImg = $("#f_diagram_img"), diagVisibility = $("#f_diagram_visibility"), clearDiagBtn = $("#clearDiagramBtn");
    const testimonialOnlyCheckbox = $("#f_is_testimonial_only");
    
    const mentorRow = $("#f_mentor_row");
    const typeSelect = $("#f_type");
    const updateMentorRowState = () => {
      const isTestimonialOnly = !!testimonialOnlyCheckbox?.checked;
      if (mentorRow && typeSelect) {
        // Mentors can be credited on any shoot type, not just workshops.
        mentorRow.style.display = !isTestimonialOnly ? "" : "none";
      }
    };
    typeSelect?.addEventListener("change", updateMentorRowState);

    const updateTestimonialFormState = () => {
      const isTestimonialOnly = !!testimonialOnlyCheckbox?.checked;

      // Hide / show the dropzone
      if (dz) dz.style.display = isTestimonialOnly ? "none" : "";

      // Hide / show other fieldsets
      const statsFs = $("#modelStatsFieldset");
      if (statsFs) statsFs.style.display = isTestimonialOnly ? "none" : "";

      // Hide / show Credits mentor field
      updateMentorRowState();

      const lightingFs = $("#fieldsetLighting");
      if (lightingFs) lightingFs.style.display = isTestimonialOnly ? "none" : "";

      const extraTestimonialsFs = $("#extraTestimonialsFs");
      if (extraTestimonialsFs) extraTestimonialsFs.style.display = isTestimonialOnly ? "none" : "";

      // Hide / show Brand Dropdown vs Custom Text Input
      const brandSelectField = $("#f_brand_select_field");
      const brandTextField = $("#f_brand_text_field");
      if (brandSelectField) brandSelectField.style.display = isTestimonialOnly ? "none" : "";
      if (brandTextField) brandTextField.style.display = isTestimonialOnly ? "" : "none";

      const activityField = $("#f_activity_field");
      if (activityField) activityField.style.display = isTestimonialOnly ? "none" : "";
      { const row = $("#f_agency_row"); if (row) row.style.display = isTestimonialOnly ? "none" : ""; }

      // Change labels and descriptions
      const titleLabel = $("#f_title")?.closest(".field")?.querySelector("span");
      if (titleLabel) {
        titleLabel.textContent = isTestimonialOnly ? "Testimonial Subject / Headline *" : "Shoot title *";
      }

      const talentLabel = $("#f_talent")?.closest(".field")?.querySelector("span");
      if (talentLabel) {
        talentLabel.textContent = isTestimonialOnly ? "Client Name *" : "Model / talent";
      }

      const descLabel = $("#f_desc")?.closest(".field")?.querySelector("span");
      if (descLabel) {
        descLabel.textContent = isTestimonialOnly ? "Testimonial Quote *" : "Description";
      }
    };
    testimonialOnlyCheckbox?.addEventListener("change", updateTestimonialFormState);
    updateTestimonialFormState();
    updateMentorRowState();
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
          const paint = () => { const live = !!pubCb?.checked; pill.textContent = live ? "Published · public" : "Hidden from site"; pill.classList.toggle("is-live", live); };
          pubCb?.addEventListener("change", paint);
          paint();
        }, 0);
        pub.textContent = "Save changes";
        const stickyPubLabel = $("#stickyPublishBtn");
        if (stickyPubLabel) stickyPubLabel.textContent = "Save changes";
        
        if (editingShoot.isTestimonial) {
          if (testimonialOnlyCheckbox) testimonialOnlyCheckbox.checked = true;
          $("#f_brand_text").value = editingShoot.brand || "";
        } else {
          if (testimonialOnlyCheckbox) testimonialOnlyCheckbox.checked = false;
          $("#f_brand").value = editingShoot.brand || "Other";
        }
        updateTestimonialFormState();

        $("#f_title").value = editingShoot.title || "";
        $("#f_activity").value = editingShoot.activity || "";
        $("#f_type").value = editingShoot.type || "";
        $("#f_season").value = editingShoot.season || "";
        $("#f_photographer").value = editingShoot.photographer || "nerdyphotographer";
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
        updateMentorRowState();
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
        const showCompcardInput = $("#f_show_compcard");
        if (showCompcardInput) {
          showCompcardInput.checked = !!editingShoot.showAsCompCard;
        }
        const hideCompcardInput = $("#f_hide_compcard");
        if (hideCompcardInput) {
          hideCompcardInput.checked = !!editingShoot.hideFromCompCard;
        }
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
      const filledQuotes = [1, 2, 3].filter(n => fieldVal("f_quote_" + n) || fieldVal("f_quoteby_" + n)).length;
      const sumT = $("#fsSummaryTestimonials");
      if (sumT) sumT.textContent = filledQuotes ? `${filledQuotes} of 3 filled` : "No testimonials yet";

      const hasDiagram = ($("#diagramPreview") && $("#diagramPreview").style.display !== "none") || !!($("#f_diagram_file")?.files?.length);
      const sumL = $("#fsSummaryLighting");
      if (sumL) sumL.textContent = hasDiagram ? `Diagram attached · ${$("#f_diagram_visibility")?.selectedOptions?.[0]?.textContent || ""}` : "No diagram attached";

      const statsFilled = ["f_height", "f_chest", "f_waist", "f_hips", "f_shoes", "f_model_hair", "f_model_eyes"].filter(id => fieldVal(id)).length;
      const types = form.querySelectorAll(".model-type-cb:checked").length;
      const isCompish = /Test Shoot|Selective Collaboration/.test(fieldVal("f_type")) || !!$("#f_show_compcard")?.checked;
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
      auto($("#extraTestimonialsFs"), filledQuotes > 0);
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
      const groups = { extraTestimonialsFs: ["extraTestimonialsFs", "fieldsetLighting"] };
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
              <input type="checkbox" class="thumb-bulk-check" data-id="${f.id}" ${selectedForBulk.has(f.id) ? 'checked' : ''} style="width: 12px; height: 12px; accent-color: var(--accent); margin: 0; cursor: pointer;" />
              Select for bulk tagging
            </label>
            <input type="text" class="thumb-caption-input" data-id="${f.id}" value="${esc(f.caption || '')}" placeholder="Add caption…" style="width: 100%; box-sizing: border-box; font-size: var(--font-xs); padding: 4px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); outline: none;" />
            
            <div style="display: grid; grid-template-columns: 1fr; gap: 4px;">
              <label style="font-size: var(--font-xs); color: var(--ink-soft); display: flex; flex-direction: column; gap: 2px;">
                <span>Usage</span>
                <select class="thumb-usage-select" data-id="${f.id}" style="font-size: var(--font-xs); padding: 2px 4px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); width: 100%;">
                  <option value="both" ${f.usage === 'both' ? 'selected' : ''}>Both (Comp & Port)</option>
                  <option value="portfolio" ${f.usage === 'portfolio' ? 'selected' : ''}>Portfolio Only</option>
                  <option value="comp" ${f.usage === 'comp' ? 'selected' : ''}>Comp Card Only</option>
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

      grid.querySelectorAll(".thumb-usage-select").forEach((sel) => {
        sel.addEventListener("change", (e) => {
          const item = staged.find(x => x.id === e.target.dataset.id);
          if (item) {
            item.usage = e.target.value;
            // Maintain backwards compatibility:
            item.excludeFromCompCard = (e.target.value === "portfolio");
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
          `<a href="${esc(url)}" target="_blank" rel="noopener" style="color:var(--accent); font-weight:600; text-decoration:underline; display:inline-flex; align-items:center; gap:2px; margin-right:12px;">${esc(label)} ↗</a>`
        ).join("");
        verify.innerHTML = `<span style="color:var(--ink-soft); font-family:'JetBrains Mono', monospace; font-size: var(--font-xs); margin-right:6px; text-transform:uppercase;">Verify links:</span> ${linksHtml}`;
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
      const isTestimonialOnly = !!$("#f_is_testimonial_only")?.checked;
      if (isTestimonialOnly) {
        if (!val("f_title")) { toast("Testimonial Subject / Headline is required."); return; }
        if (!val("f_talent")) { toast("Client Name is required."); return; }
        if (!val("f_desc")) { toast("Testimonial Quote is required."); return; }
      } else {
        if (!staged.length) { toast("Add at least one photo first."); return; }
      }
      
      const testimonialsList = isTestimonialOnly ? [] : [
        val("f_quote_1") ? { quote: val("f_quote_1"), by: val("f_quoteby_1") || "Client" } : null,
        val("f_quote_2") ? { quote: val("f_quote_2"), by: val("f_quoteby_2") || "Client" } : null,
        val("f_quote_3") ? { quote: val("f_quote_3"), by: val("f_quoteby_3") || "Client" } : null,
      ].filter(Boolean);

      const coverItem = staged.find(x => x.isCover) || staged[0];
      let pColors = editingShoot ? editingShoot.palette : ["#3a3a3a", "#0d0d0d"];
      if (coverItem && !isTestimonialOnly) {
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
        isTestimonial: isTestimonialOnly,
        title: val("f_title") || "Untitled",
        brand: isTestimonialOnly ? val("f_brand_text") : (val("f_brand") || "Other"),
        activity: isTestimonialOnly ? "Testimonial" : $("#f_activity").value,
        type: isTestimonialOnly ? "Testimonial" : $("#f_type").value,
        season: val("f_season"),
        photographer: isTestimonialOnly ? "" : (val("f_photographer") || "Studio"),
        secondaryPhotographers: isTestimonialOnly ? "" : val("f_photographer2"),
        artDirector: isTestimonialOnly ? "" : val("f_ad"),
        stylist: isTestimonialOnly ? "" : (val("f_stylist") || "—"),
        hair: isTestimonialOnly ? "" : (val("f_hair") || "—"),
        mua: isTestimonialOnly ? "" : (val("f_mua") || "—"),
        videographer: isTestimonialOnly ? "" : (val("f_video") || "—"),
        talent: val("f_talent"),
        location: isTestimonialOnly ? "" : val("f_location"),
        height: isTestimonialOnly ? "" : val("f_height"),
        chest: isTestimonialOnly ? "" : val("f_chest"),
        chestLabel: isTestimonialOnly ? "" : chestLabelOf({ chestLabel: val("f_chest_label") }),
        waist: isTestimonialOnly ? "" : val("f_waist"),
        hips: isTestimonialOnly ? "" : val("f_hips"),
        shoes: isTestimonialOnly ? "" : val("f_shoes"),
        modelHair: isTestimonialOnly ? "" : val("f_model_hair"),
        modelEyes: isTestimonialOnly ? "" : val("f_model_eyes"),
        // Per album, because a model changes agencies between shoots; the
        // unified comp card reads the most recent album that names one.
        agencyCredit: isTestimonialOnly ? "" : val("f_agency"),
        agency: isTestimonialOnly ? "" : getTalentCleanName(val("f_agency")),
        agencyHandle: isTestimonialOnly ? "" : igHandleFromCredit(val("f_agency")),
        agencySite: isTestimonialOnly ? "" : siteFromCredit(val("f_agency")),
        agencyLinks: isTestimonialOnly ? [] : socialsFromCredit(val("f_agency")),
        modelEmail: isTestimonialOnly ? "" : val("f_model_email"),
        modelTypes: isTestimonialOnly ? [] : modelTypesOf({ modelTypes: readModelTypes() }),
        showStatsOnCompCard: isTestimonialOnly ? true : ($("#f_show_stats_comp") ? $("#f_show_stats_comp").checked : true),
        showStatsOnModelPortfolio: isTestimonialOnly ? true : ($("#f_show_stats_port") ? $("#f_show_stats_port").checked : true),
        showTestShootCategory: isTestimonialOnly ? false : ($("#f_show_test_shoot_cat") ? $("#f_show_test_shoot_cat").checked : false),
        mentor: isTestimonialOnly ? "" : val("f_mentor"),
        credits: isTestimonialOnly ? "" : val("f_credits"),
        description: val("f_desc"),
        tags: isTestimonialOnly ? "" : val("f_tags"),
        gear: isTestimonialOnly ? "" : val("f_gear"),
        client: isTestimonialOnly ? "" : val("f_client"),
        date: dateVal,
        instagram: val("f_ig"),
        kavyar: val("f_kavyar"),
        link: val("f_link"),
        pdfUrl: isTestimonialOnly ? "" : pdfDataUrl,
        rights: isTestimonialOnly ? "" : val("f_rights"),
        testimonials: testimonialsList,
        lightingDiagram: isTestimonialOnly ? null : diagramDataUrl,
        lightingDiagramVisibility: isTestimonialOnly ? "disabled" : $("#f_diagram_visibility").value,
        palette: pColors,
        photos: isTestimonialOnly ? [] : staged.map((f, i) => ({
          id: f.id + "-" + i,
          dataUrl: f.dataUrl,
          url: f.url,
          objectPosition: f.objectPosition || (f.isCover ? "top" : "center"),
          excludeFromCompCard: !!f.excludeFromCompCard,
          usage: f.usage || (f.excludeFromCompCard ? "portfolio" : "both"),
          angle: f.angle || "",
          // Carried back out of the staging list — see the note where staged
          // is built. Kept by value: a photo's id is re-derived from its
          // position here, but these paths point at the file that was actually
          // uploaded, so they must survive a reorder unchanged.
          ...(f.small ? { small: f.small } : {}),
          ...(f.medium ? { medium: f.medium } : {}),
          ...(typeof f.focalX === "number" ? { focalX: f.focalX, focalY: f.focalY } : {}),
          ...(f.caption && f.caption.trim() ? { caption: f.caption.trim() } : {})
        })),
        featured: isTestimonialOnly ? false : ($("#f_featured")?.checked ?? false),
        showAsCompCard: $("#f_show_compcard")?.checked ?? false,
        hideFromCompCard: $("#f_hide_compcard")?.checked ?? false,
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
        coverPhotoId: isTestimonialOnly ? null : (coverItem ? coverItem.id : null),
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

    // ── Multi-Link & Multi-File Attachments Handling ──
    window.attachedFiles = window.attachedFiles || [];
    const attachedFiles = window.attachedFiles;

    window.getFormLinks = () => {
      const inputs = document.querySelectorAll(".b_moodboard_input");
      const list = [];
      inputs.forEach(inp => {
        const v = inp.value.trim();
        if (v) list.push(v);
      });
      return list;
    };

    const addLinkBtn = $("#b_add_link_btn");
    const linksContainer = $("#b_links_container");
    if (addLinkBtn && linksContainer) {
      addLinkBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const row = document.createElement("div");
        row.className = "link-input-row";
        row.innerHTML = `
          <input class="b_moodboard_input" type="url" placeholder="Additional Pinterest, Drive, or Dropbox URL" style="padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-sm);" />
          <button type="button" class="remove-link-btn" title="Remove link">&times;</button>
        `;
        row.querySelector(".remove-link-btn").addEventListener("click", () => row.remove());
        linksContainer.appendChild(row);
      });
    }

    const dropzone = $("#b_dropzone");
    const fileInput = $("#b_file_input");
    const fileListEl = $("#b_file_list");

    if (dropzone && fileInput) {
      dropzone.addEventListener("click", (e) => {
        e.preventDefault();
        fileInput.click();
      });
      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "var(--accent)";
      });
      dropzone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "";
      });
      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "";
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          handleSelectedFiles(e.dataTransfer.files);
        }
      });
      fileInput.addEventListener("change", () => {
        if (fileInput.files && fileInput.files.length) {
          handleSelectedFiles(fileInput.files);
        }
      });
    }

    function handleSelectedFiles(files) {
      Array.from(files).forEach((file) => {
        if (file.size > 15 * 1024 * 1024) {
          toast(`File ${file.name} exceeds 15MB size limit.`);
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          attachedFiles.push({
            id: "att_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
            name: file.name,
            size: file.size,
            type: file.type,
            dataUrl: e.target.result
          });
          renderAttachedFileList();
        };
        reader.readAsDataURL(file);
      });
    }

    function renderAttachedFileList() {
      if (!fileListEl) return;
      fileListEl.innerHTML = attachedFiles.map((f, idx) => `
        <div class="attachment-pill">
          <span>📄 ${esc(f.name)} (${Math.round(f.size / 1024)} KB)</span>
          <button type="button" class="remove-att" data-idx="${idx}">&times;</button>
        </div>
      `).join("");

      fileListEl.querySelectorAll(".remove-att").forEach((b) => {
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = parseInt(b.dataset.idx, 10);
          attachedFiles.splice(idx, 1);
          renderAttachedFileList();
        });
      });
    }

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
    ["b_name", "b_email", "b_date", "b_instagram", "b_location"].forEach((id) => {
      $("#" + id)?.addEventListener("input", () => clearError(id));
    });
    document.querySelectorAll('input[name="b_studio_arranger"]').forEach((r) => {
      r.addEventListener("change", () => clearError("b_studio_arranger_client"));
    });

    // Picker selection lives at wireBook scope, not inside the picker's own
    // closure: handleBookingSubmit reads it to flag an already-booked date,
    // and as an inner `let` that read was a ReferenceError — every submit
    // died there, before the terms modal, with nothing shown to the client.
    let rangeStart = null, rangeEnd = null;
    let multiDates = []; // array of Date objects

    // ── Custom Date Picker Calendar ──
    (() => {
      const toggle = $("#datePickerToggle");
      const popup = $("#datePickerPopup");
      const dateInput = $("#b_date");
      if (!toggle || !popup || !dateInput) return;

      let pickerMode = "range"; // "range" or "multi"
      let viewYear, viewMonth; // currently displayed month

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      viewYear = today.getFullYear();
      viewMonth = today.getMonth();

      const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

      const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const sameDay = (a, b) => a && b && dateKey(a) === dateKey(b);
      const isPast = (d) => d < today;

      function formatDate(d) {
        return `${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}, ${d.getFullYear()}`;
      }

      function updateInput() {
        if (pickerMode === "range") {
          if (rangeStart && rangeEnd) {
            if (rangeStart.getFullYear() === rangeEnd.getFullYear()) {
              dateInput.value = `${MONTHS[rangeStart.getMonth()].slice(0,3)} ${rangeStart.getDate()} – ${MONTHS[rangeEnd.getMonth()].slice(0,3)} ${rangeEnd.getDate()}, ${rangeEnd.getFullYear()}`;
            } else {
              dateInput.value = `${formatDate(rangeStart)} – ${formatDate(rangeEnd)}`;
            }
          } else if (rangeStart) {
            dateInput.value = formatDate(rangeStart);
          }
        } else {
          if (multiDates.length) {
            const sorted = [...multiDates].sort((a, b) => a - b);
            dateInput.value = sorted.map(formatDate).join(", ");
          }
        }
        dateInput.dispatchEvent(new Event("input", { bubbles: true }));
        checkAvailabilityBadge();
      }

      function checkAvailabilityBadge() {
        const badge = $("#b_date_availability_badge");
        const bookedNote = $("#b_date_booked_note");
        if (!badge) return;
        const valStr = dateInput.value.trim();
        if (!valStr) {
          badge.style.display = "none";
          if (bookedNote) bookedNote.style.display = "none";
          return;
        }

        let targetDate = rangeStart || (multiDates.length ? multiDates[0] : null);
        if (!targetDate) {
          const parsed = new Date(valStr);
          if (!isNaN(parsed.getTime())) targetDate = parsed;
        }

        if (!targetDate) {
          badge.style.display = "none";
          if (bookedNote) bookedNote.style.display = "none";
          return;
        }

        const todayObj = new Date();
        todayObj.setHours(0,0,0,0);

        if (targetDate < todayObj) {
          badge.style.display = "inline-flex";
          badge.style.background = "rgba(128,128,128,0.12)";
          badge.style.border = "1px solid rgba(128,128,128,0.3)";
          badge.style.color = "#888";
          badge.innerHTML = "⚪ PAST DATE";
          if (bookedNote) bookedNote.style.display = "none";
          return;
        }

        const st = getCalDateStatus(targetDate);
        badge.style.display = "inline-flex";
        if (bookedNote) bookedNote.style.display = st.isBooked ? "block" : "none";

        if (st.isBooked) {
          badge.style.background = "rgba(220,38,38,0.12)";
          badge.style.border = "1px solid rgba(220,38,38,0.3)";
          badge.style.color = "#dc2626";
          badge.innerHTML = "🔴 ALREADY BOOKED";
        } else if (st.hasWorkshop || st.hasAssisting) {
          badge.style.background = "rgba(217,119,6,0.12)";
          badge.style.border = "1px solid rgba(217,119,6,0.3)";
          badge.style.color = "#d97706";
          badge.innerHTML = "🟡 STUDIO RESERVED";
        } else if (st.isBlocked) {
          badge.style.background = "rgba(156,163,175,0.12)";
          badge.style.border = "1px solid rgba(156,163,175,0.3)";
          badge.style.color = "#6b7280";
          badge.innerHTML = "🔒 WEEKDAY BLOCKED";
        } else {
          badge.style.background = "rgba(16,185,129,0.12)";
          badge.style.border = "1px solid rgba(16,185,129,0.3)";
          badge.style.color = "#059669";
          badge.innerHTML = "🟢 AVAILABLE";
        }
      }

      dateInput.addEventListener("input", checkAvailabilityBadge);

      let adminManageMode = false;

      function renderCalendar() {
        const firstDay = new Date(viewYear, viewMonth, 1).getDay();
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const isUserAdmin = isAdmin();

        let html = `
          <div class="dp-header">
            ${isUserAdmin ? `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed var(--line);">
                <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent);">⚙️ Admin Mode</span>
                <button type="button" id="dpAdminToggle" style="background: ${adminManageMode ? 'var(--accent)' : 'none'}; color: ${adminManageMode ? '#fff' : 'var(--ink)'}; border: 1px solid var(--line); border-radius: 4px; padding: 3px 8px; font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; cursor: pointer;">
                  ${adminManageMode ? "Managing Dates (ON)" : "Manage Availability"}
                </button>
              </div>
            ` : ""}
            <div class="dp-mode-tabs">
              <button type="button" class="dp-mode-btn ${pickerMode === 'range' ? 'active' : ''}" data-mode="range">Date Range</button>
              <button type="button" class="dp-mode-btn ${pickerMode === 'multi' ? 'active' : ''}" data-mode="multi">Multiple Dates</button>
            </div>
          </div>
          <div class="dp-legend">
            <span class="dp-legend-item"><span class="dp-legend-dot dot-available"></span> Open</span>
            <span class="dp-legend-item"><span class="dp-legend-dot dot-booked"></span> Date Booked</span>
            <span class="dp-legend-item"><span class="dp-legend-dot dot-testshoot"></span> Test Shoot Booked</span>
            <span class="dp-legend-item"><span class="dp-legend-dot dot-workshop"></span> Workshop</span>
            <span class="dp-legend-item"><span class="dp-legend-dot dot-assisting"></span> Assisting</span>
            <span class="dp-legend-item"><span class="dp-legend-dot dot-blocked"></span> Mon–Fri Blocked</span>
          </div>
          <div class="dp-nav">
            <button type="button" class="dp-nav-btn dp-prev" aria-label="Previous month">‹</button>
            <span class="dp-month-year">${MONTHS[viewMonth]} ${viewYear}</span>
            <button type="button" class="dp-nav-btn dp-next" aria-label="Next month">›</button>
          </div>
          <div class="dp-grid">
            ${DAYS.map(d => `<span class="dp-day-label">${d}</span>`).join("")}
        `;

        for (let i = 0; i < firstDay; i++) {
          html += `<span class="dp-cell dp-empty"></span>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
          const d = new Date(viewYear, viewMonth, day);
          const past = isPast(d);
          const status = getCalDateStatus(d);
          const classes = ["dp-cell"];
          let isCellDisabled = past;
          let titleAttr = "";

          if (sameDay(d, today)) classes.push("dp-today");

          if (past) {
            classes.push("dp-past");
          } else {
            if (status.hasWorkshop && !status.hasConfirmedBooking) {
              classes.push("dp-booked", "dp-workshop");
              titleAttr = "Unavailable: Booked for Workshop (Skill-Up Day)";
              isCellDisabled = true;
            } else if (status.hasAssisting && !status.hasConfirmedBooking) {
              classes.push("dp-booked", "dp-assisting");
              titleAttr = "Unavailable: Booked for Assisting Work";
              isCellDisabled = true;
            } else if (status.isBooked) {
              classes.push("dp-booked");
              if (status.hasTestShoot) classes.push("dp-testshoot");
              titleAttr = "This date already has a booking — you can still send a request, and I'll confirm or suggest an alternative";
            } else if (status.isBlocked) {
              classes.push("dp-blocked");
              titleAttr = status.isDefaultBlockedWeekday ? "Weekday Blocked (Mon–Fri default)" : "Custom Blocked";
            } else {
              if (status.isDefaultBlockedWeekday && status.isManuallyOpened) classes.push("dp-open-weekday");
              classes.push("dp-active");
            }
          }

          if (isUserAdmin && adminManageMode && !past) {
            classes.push("dp-admin-manage");
            isCellDisabled = false;
          }

          if (pickerMode === "range") {
            if (sameDay(d, rangeStart)) classes.push("dp-selected", "dp-range-start");
            if (sameDay(d, rangeEnd)) classes.push("dp-selected", "dp-range-end");
            if (rangeStart && rangeEnd && d > rangeStart && d < rangeEnd) classes.push("dp-in-range");
          } else {
            if (multiDates.some(md => sameDay(md, d))) classes.push("dp-selected");
          }

          html += `<button type="button" class="${classes.join(" ")}" data-day="${day}" data-date="${status.key}" title="${esc(titleAttr)}" ${isCellDisabled ? "disabled" : ""}>${day}</button>`;
        }

        html += `</div>`;

        // Selection summary
        let summary = "";
        if (adminManageMode) {
          summary = `<span class="dp-hint" style="color:var(--accent); font-weight:700;">Click dates to Block/Open or Add Bookings</span>`;
        } else if (pickerMode === "range") {
          if (rangeStart && !rangeEnd) summary = `<span class="dp-hint">Now pick the end date</span>`;
          else if (rangeStart && rangeEnd) {
            const diff = Math.round((rangeEnd - rangeStart) / 86400000) + 1;
            summary = `<span class="dp-summary">${diff} day${diff > 1 ? "s" : ""} selected</span>`;
          } else {
            summary = `<span class="dp-hint">Pick a start date</span>`;
          }
        } else {
          if (multiDates.length) {
            summary = `<span class="dp-summary">${multiDates.length} date${multiDates.length > 1 ? "s" : ""} selected</span>`;
          } else {
            summary = `<span class="dp-hint">Click available dates to select</span>`;
          }
        }

        html += `
          <div class="dp-footer">
            ${summary}
            <div class="dp-actions">
              ${(pickerMode === "range" && (rangeStart || rangeEnd)) || (pickerMode === "multi" && multiDates.length) ? `<button type="button" class="dp-clear">Clear</button>` : ""}
              <button type="button" class="dp-done">Done</button>
            </div>
          </div>
        `;

        popup.innerHTML = html;
        wireCalendarEvents();
      }

      function selectDate(clicked) {
        if (pickerMode === "range") {
          if (!rangeStart || (rangeStart && rangeEnd)) {
            rangeStart = clicked;
            rangeEnd = null;
          } else {
            if (clicked < rangeStart) {
              rangeEnd = rangeStart;
              rangeStart = clicked;
            } else {
              rangeEnd = clicked;
            }
          }
        } else {
          const idx = multiDates.findIndex(md => sameDay(md, clicked));
          if (idx >= 0) {
            multiDates.splice(idx, 1);
          } else {
            multiDates.push(clicked);
          }
        }
        renderCalendar();
      }

      function wireCalendarEvents() {
        popup.querySelector("#dpAdminToggle")?.addEventListener("click", (e) => {
          e.stopPropagation();
          adminManageMode = !adminManageMode;
          renderCalendar();
        });

        popup.querySelector(".dp-prev")?.addEventListener("click", (e) => {
          e.stopPropagation();
          viewMonth--;
          if (viewMonth < 0) { viewMonth = 11; viewYear--; }
          renderCalendar();
        });
        popup.querySelector(".dp-next")?.addEventListener("click", (e) => {
          e.stopPropagation();
          viewMonth++;
          if (viewMonth > 11) { viewMonth = 0; viewYear++; }
          renderCalendar();
        });

        popup.querySelectorAll(".dp-mode-btn").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const mode = btn.dataset.mode;
            if (mode !== pickerMode) {
              pickerMode = mode;
              rangeStart = null; rangeEnd = null; multiDates = [];
              renderCalendar();
            }
          });
        });

        if (adminManageMode && isAdmin()) {
          popup.querySelectorAll(".dp-cell.dp-admin-manage").forEach(cell => {
            cell.addEventListener("click", (e) => {
              e.stopPropagation();
              const dKey = cell.dataset.date;
              if (dKey) {
                closePopup();
                if (typeof window.openDateAdminModal === "function") {
                  window.openDateAdminModal(dKey);
                } else {
                  toggleCalDateBlock(dKey);
                  toast(`Availability updated for ${dKey}.`);
                }
              }
            });
          });
        } else {
          popup.querySelectorAll(".dp-cell.dp-past").forEach(cell => {
            cell.addEventListener("click", (e) => {
              e.stopPropagation();
              const day = cell.dataset.day;
              toast(`Unable to select ${MONTHS[viewMonth]} ${day} — dates in the past cannot be booked.`);
            });
          });

          popup.querySelectorAll(".dp-cell.dp-booked").forEach(cell => {
            cell.addEventListener("click", (e) => {
              e.stopPropagation();
              const day = parseInt(cell.dataset.day);
              const clicked = new Date(viewYear, viewMonth, day);
              selectDate(clicked);
              toast(`Heads up — ${MONTHS[viewMonth]} ${day} already has a booking. You're welcome to send a request anyway; I'll confirm or suggest another date.`);
            });
          });

          popup.querySelectorAll(".dp-cell.dp-blocked").forEach(cell => {
            cell.addEventListener("click", (e) => {
              e.stopPropagation();
              const day = cell.dataset.day;
              toast(`Unable to select ${MONTHS[viewMonth]} ${day} — Mon–Fri dates are blocked.`);
            });
          });
          popup.querySelectorAll(".dp-cell.dp-active").forEach(cell => {
            cell.addEventListener("click", (e) => {
              e.stopPropagation();
              const day = parseInt(cell.dataset.day);
              selectDate(new Date(viewYear, viewMonth, day));
            });
          });
        }

        popup.querySelector(".dp-clear")?.addEventListener("click", (e) => {
          e.stopPropagation();
          rangeStart = null; rangeEnd = null; multiDates = [];
          renderCalendar();
        });

        popup.querySelector(".dp-done")?.addEventListener("click", (e) => {
          e.stopPropagation();
          updateInput();
          closePopup();
        });
      }

      function openPopup() {
        popup.classList.add("open");
        renderCalendar();
      }
      function closePopup() {
        popup.classList.remove("open");
      }

      toggle.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (popup.classList.contains("open")) {
          closePopup();
        } else {
          openPopup();
        }
      });

      // Close popup when clicking outside
      document.addEventListener("click", (e) => {
        if (popup.classList.contains("open") && !popup.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) {
          closePopup();
        }
      });
    })();

    // Sync Payment Terms & Milestone Schedule with Global Studio Setting
    const flow2 = $("#flowchart2Step");
    const flow3 = $("#flowchart3Step");
    const globalSched = window.WPS_DATA.CALENDAR_SETTINGS?.paymentScheduleType || "5050";

    if (flow2 && flow3) {
      if (globalSched === "503020") {
        flow2.style.display = "none";
        flow3.style.display = "grid";
      } else {
        flow2.style.display = "grid";
        flow3.style.display = "none";
      }
    }

    // Invite/promo/pricing state, computed inside updateFields but needed again
    // when the form is submitted. These used to be read straight out of
    // updateFields' local scope by the submit handler, where they do not
    // exist — every submission threw "isValidInvite is not defined" before
    // anything was saved or sent, so the client saw a dead button and the
    // studio received nothing. updateFields refreshes this snapshot on init
    // and on every field change, so it always reflects what is on screen.
    let bookingCalc = {
      enteredCode: "",
      matchedInvite: null,
      isValidInvite: false,
      lockedLocation: "",
      enteredDiscount: "",
      matchedDiscount: null,
      discountTagText: "",
      basePrice: 0,
      packageCharge: 0,
      isCollabBooking: false,
      isCommercialStudioSelected: false,
      homeStudioFee: 0,
      savings: 0,
      finalPayable: 0
    };

    // Dynamic field update logic
    const updateFields = () => {
      const type = $("#b_type")?.value;
      const role = $("#b_role")?.value;
      const budgetField = $("#b_budget_field");
      const brandOpt = $("#b_role")?.querySelector('option[value="Brand"]');
      const igLabel = $("#b_instagram_label");
      const typeNotice = $("#b_type_notice");
      const policyNotice = $("#bookingPolicyNotice");

      if (typeNotice) {
        typeNotice.style.display = (type === "Selective Collaboration (TFP)" ? "block" : "none");
      }

      if (policyNotice) {
        if (type === "Selective Collaboration (TFP)") {
          policyNotice.innerHTML = `
            <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">TFP Collaboration &amp; Test Shoot Policy</span>
            Submission of a TFP collaboration request does not constitute a confirmed session or a commitment to shoot. All inquiries are subject to schedule availability, creative alignment, and final studio review. <strong>Note: If a dedicated studio space is booked for the shoot, applicable studio rental charges will apply.</strong> TFP shoots include a Full Proofing Gallery + 8 to 12 Retouched Master Clicks. RAW unedited camera files are strictly excluded and remain unreleased. <strong>⏰ Call time &amp; no-show:</strong> ${window.buildLateArrivalSummary(true)}
          `;
        } else {
          policyNotice.innerHTML = `
            <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Commercial Production &amp; Studio Protection Policy</span>
            <strong>🔒 Booking &amp; Retainer Terms:</strong> 50% advance retainer reserves studio space &amp; production crew (non-refundable). Cancellations within 48h forfeit advance retainer.<br/>
            <strong>📦 Deliverables &amp; Full Gallery Buyout:</strong> Packages include a proofing gallery to select contracted retouches. If the client requests the complete full unedited image gallery or additional retouched master clicks beyond the package limit, extra buyout charges apply. RAW unedited camera files remain confidential studio property.<br/>
            <strong>📜 Usage Licensing:</strong> Rates cover digital web &amp; social media usage. Extended billboard, TV, print, or commercial advertising rights require separate usage licensing.<br/>
            <strong>⏰ Call Time &amp; No-Show:</strong> ${window.buildLateArrivalSummary(false)}
          `;
        }
      }

      if (igLabel) {
        igLabel.innerHTML = (type === "Selective Collaboration (TFP)" ? "Instagram / Website *" : "Instagram / Website");
      }

      if (btn) {
        btn.textContent = (type === "Selective Collaboration (TFP)" ? "Request for a Test Shoot" : "Submit Booking Request");
      }

      const paymentTermsFieldset = $("#paymentTermsFieldset");
      const collabFallbackWrap = $("#collabFallbackWrap");
      const isTalentRole = (role === "Model" || role === "MUA" || role === "Stylist");

      if (type === "Selective Collaboration (TFP)") {
        if (budgetField) budgetField.style.display = "none";
        if (paymentTermsFieldset) paymentTermsFieldset.style.display = "none";
        // Your screenshot proves this branch runs — the package dropdown was
        // gone from the form. So the money UI is switched off from here too,
        // not only from the pricing section that was somehow not taking effect.
        document.body.classList.add("wps-no-pricing");

        if (collabFallbackWrap) {
          if (isTalentRole) {
            // Models, MUAs & Stylists get pure TFP collaboration without being forced to pick a paid package
            collabFallbackWrap.style.display = "block";
            collabFallbackWrap.innerHTML = `
              <div style="font-family: 'Outfit', sans-serif; font-size: var(--font-xs); font-weight: 700; color: var(--accent); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                📸 Creative Talent TFP Collaboration Policy &amp; Deliverables
              </div>
              <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0 0 6px 0; line-height: 1.5;">
                Peer-to-peer collaboration session for portfolio growth &amp; creative curation. Submissions are reviewed at studio discretion based on creative brief alignment and schedule availability.
              </p>
              <div style="font-family: var(--mono-font); font-size: var(--font-xs); color: #059669; font-weight: 700; background: rgba(5,150,105,0.08); border: 1px solid rgba(5,150,105,0.2); border-radius: 6px; padding: 6px 10px; margin-top: 6px;">
                🎁 <strong>Contracted Deliverables:</strong> Full Proofing Gallery + 8 to 12 Retouched Master Clicks (No RAW files delivered).
              </div>
            `;
          } else {
            // Brands & Agencies require a mandatory Paid Fallback Package
            collabFallbackWrap.style.display = "block";
            collabFallbackWrap.innerHTML = `
              <div style="font-family: 'Outfit', sans-serif; font-size: var(--font-xs); font-weight: 700; color: var(--accent); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                📌 Studio Discretion Policy &amp; Paid Fallback Package *
              </div>
              <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0 0 10px 0; line-height: 1.5;">
                Brand &amp; Commercial TFP collaborations are accepted at the sole discretion of the studio based on creative brief alignment and portfolio synergy. Unapproved collaboration requests do not reserve shoot dates.
              </p>
              <label class="field" style="margin: 0;">
                <span style="font-size: var(--font-xs); font-weight: 700; color: var(--ink);">If your collaboration request is not approved, which Paid Package would you like to proceed with? *</span>
                <select id="b_collab_fallback" style="margin-top: 4px;">
                  ${getAdminPackages().map(p => `<option value="₹${p.price.toLocaleString('en-IN')} ${p.name} (Paid Fallback)">₹${p.price.toLocaleString('en-IN')} · ${p.name} (${p.specs})</option>`).join("")}
                  <option value="Custom Bespoke Package (Paid Fallback)">Custom Bespoke Package</option>
                  <option value="Cancel Inquiry if Collaboration is Declined">Cancel Inquiry if Collaboration is Declined</option>
                </select>
              </label>
            `;
          }
        }
      } else {
        if (budgetField) budgetField.style.display = "";
        if (collabFallbackWrap) collabFallbackWrap.style.display = "none";
        if (paymentTermsFieldset) paymentTermsFieldset.style.display = "";
      }

      const testShootOpt = $("#b_type")?.querySelector('option[value="Selective Collaboration (TFP)"]');
      const inviteCodeInput = $("#b_invite_code");
      const inviteStatus = $("#inviteCodeStatus");
      const allAdminCodes = (typeof window.getAdminInviteCodes === "function" ? window.getAdminInviteCodes() : [{ code: "NERDYBRAND" }]);
      const enteredCode = (inviteCodeInput?.value || "").trim().toUpperCase();

      // Verify against ALL active admin invite codes. Only codes on the admin-managed list are valid.
      const matchedInvite = enteredCode ? allAdminCodes.find(c => (typeof c === 'object' ? c.code : c).toUpperCase() === enteredCode) : null;
      const isValidInvite = !!matchedInvite;
      // Extract location locked by photographer when creating this invite code (empty = client fills it)
      const lockedLocation = (isValidInvite && matchedInvite && typeof matchedInvite === 'object' ? (matchedInvite.location || "") : "").trim();
      window._lockedLocationFromInvite = isValidInvite ? lockedLocation : "";

      // Promo Discount Codes Map
      const discountCodesMap = getAdminPromoCodes();

      const discountInput = $("#b_discount_code");
      const discountStatus = $("#discountCodeStatus");
      const savingsBadge = $("#discountSavingsBadge");
      const enteredDiscount = (discountInput?.value || "").trim().toUpperCase();
      const matchedDiscount = discountCodesMap[enteredDiscount];

      const btnDiscount = $("#btnApplyDiscountCode");
      if (discountStatus && savingsBadge) {
        if (enteredDiscount) {
          discountStatus.style.display = "inline-block";
          if (matchedDiscount) {
            discountStatus.style.color = "#059669";
            // A package value of 0 means this code exists only to compensate
            // the home studio rental — there is no package-side "X% OFF" to
            // report, so tagMsg stays blank rather than showing a false 0%.
            const hasPackageDiscount = !!(matchedDiscount.flat || matchedDiscount.pct);
            const tagMsg = !hasPackageDiscount
              ? ""
              : (matchedDiscount.flat ? `FLAT ₹${matchedDiscount.flat.toLocaleString("en-IN")} OFF` : `${matchedDiscount.pct}% OFF`);
            discountStatus.textContent = hasPackageDiscount ? `🟢 ${tagMsg} APPLIED` : `🟢 CODE APPLIED`;
            savingsBadge.style.display = "block";
            // Name the home studio discount here too. This banner sits above
            // the quote and used to advertise only the package discount,
            // which on a code that also touches the studio is the smaller
            // half of the offer. Shown as "if you shoot there" since the
            // venue pick itself may not be made yet.
            const bannerHsDiscount = getPromoHomeStudioDiscount(matchedDiscount);
            savingsBadge.textContent = !hasPackageDiscount
              ? (bannerHsDiscount.type === "free"
                  ? `🎉 Promo Offer Applied: Home studio free if you shoot there!`
                  : (bannerHsDiscount.type === "flat" || bannerHsDiscount.type === "pct")
                    ? `🎉 Promo Offer Applied: ${bannerHsDiscount.type === "flat" ? `₹${Number(bannerHsDiscount.value || 0).toLocaleString("en-IN")}` : `${bannerHsDiscount.value}%`} off the home studio rental if you shoot there!`
                    : `🎉 Promo Offer Applied!`)
              : bannerHsDiscount.type === "free"
                ? `🎉 Promo Offer Applied: ${tagMsg} on your package — plus the home studio free if you shoot there!`
                : (bannerHsDiscount.type === "flat" || bannerHsDiscount.type === "pct")
                  ? `🎉 Promo Offer Applied: ${tagMsg} on your package — plus ${bannerHsDiscount.type === "flat" ? `₹${Number(bannerHsDiscount.value || 0).toLocaleString("en-IN")}` : `${bannerHsDiscount.value}%`} off the home studio rental if you shoot there!`
                  : `🎉 Promo Offer Applied: You save ${tagMsg} on your selected package total!`;
            if (btnDiscount) {
              btnDiscount.textContent = "✕ Remove Code";
              btnDiscount.style.background = "transparent";
              btnDiscount.style.color = "var(--accent)";
              btnDiscount.style.border = "1px solid var(--accent)";
            }
          } else {
            discountStatus.style.color = "#dc2626";
            discountStatus.textContent = "🔴 INVALID PROMO CODE";
            savingsBadge.style.display = "none";
            if (btnDiscount) {
              btnDiscount.textContent = "Apply Code";
              btnDiscount.style.background = "var(--accent)";
              btnDiscount.style.color = "#ffffff";
              btnDiscount.style.border = "none";
            }
          }
        } else {
          discountStatus.style.display = "none";
          savingsBadge.style.display = "none";
          if (btnDiscount) {
            btnDiscount.textContent = "Apply Code";
            btnDiscount.style.background = "var(--accent)";
            btnDiscount.style.color = "#ffffff";
            btnDiscount.style.border = "none";
          }
        }
      }

      const btnInvite = $("#btnApplyInviteCode");
      const inviteContainer = $("#inviteCodeContainer");
      const inviteLink = $("#toggleInviteCodeLink");
      if (inviteStatus) {
        if (enteredCode) {
          inviteStatus.style.display = "inline-block";
          if (isValidInvite) {
            inviteStatus.style.color = "#059669";
            inviteStatus.textContent = "🟢 INVITE VERIFIED";
            if (btnInvite) {
              btnInvite.textContent = "✕ Remove Code";
              btnInvite.style.background = "transparent";
              btnInvite.style.color = "var(--accent)";
              btnInvite.style.border = "1px solid var(--accent)";
            }
          } else {
            inviteStatus.style.color = "#dc2626";
            inviteStatus.textContent = "🔴 INVALID CODE";
            if (btnInvite) {
              btnInvite.textContent = "Verify Code";
              btnInvite.style.background = "var(--accent)";
              btnInvite.style.color = "#ffffff";
              btnInvite.style.border = "none";
            }
          }
        } else {
          inviteStatus.style.display = "none";
          if (btnInvite) {
            btnInvite.textContent = "Verify Code";
            btnInvite.style.background = "var(--accent)";
            btnInvite.style.color = "#ffffff";
            btnInvite.style.border = "none";
          }
        }
      }

      const typeFieldWrap = $("#b_type_field_wrap");
      const lockedTfpCard = $("#lockedTfpCard");

      // TFP gated behind invite code on public booking form
      if (!isValidInvite) {
        if (testShootOpt) { testShootOpt.hidden = true; testShootOpt.style.display = "none"; testShootOpt.disabled = true; }
        if ($("#b_type") && $("#b_type").value === "Selective Collaboration (TFP)") {
          $("#b_type").value = "Fashion Editorial";
          $("#b_type").dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (typeFieldWrap) typeFieldWrap.style.display = "";
        if (lockedTfpCard) lockedTfpCard.style.display = "none";
        // No verified invite — a paying enquiry, so let the pricing section
        // decide as normal. Guarded on the type because this runs AFTER the TFP
        // branch above sets the class: an unconditional remove here would undo
        // it for a test shoot within the same pass.
        if ($("#b_type")?.value !== "Selective Collaboration (TFP)") {
          document.body.classList.remove("wps-no-pricing");
        }
      } else {
        if (testShootOpt) { testShootOpt.hidden = false; testShootOpt.style.display = ""; testShootOpt.disabled = false; }
        const typeSelect = $("#b_type");
        if (typeSelect && typeSelect.value !== "Selective Collaboration (TFP)") {
          typeSelect.value = "Selective Collaboration (TFP)";
          typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (typeFieldWrap) typeFieldWrap.style.display = "none";
        if (lockedTfpCard) lockedTfpCard.style.display = "block";
        // Hide the money UI HERE, at the point that provably runs — the lock
        // card above renders on screen, so this line is reached. The pricing
        // section further down sets the same elements with inline styles and,
        // for reasons the source alone has not explained, was still leaving the
        // quote and promo field on screen for a verified invite. A body class
        // backed by `!important` beats any inline display the later section
        // writes, so a collaborator invited to shoot for free cannot be shown a
        // package rate no matter which branch runs afterwards.
        document.body.classList.add("wps-no-pricing");
      }

      // Location lock: if invite code has a location, pre-fill + lock the field
      const locationField = $("#b_location");
      const studioSpaceRow = $("#b_studio_space") ? $("#b_studio_space").closest(".field-row") : null;
      if (isValidInvite && lockedLocation) {
        if (locationField) {
          // Stash whatever the visitor had typed before the lock so removing
          // the code hands their own answer back instead of eating it.
          if (locationField.dataset.inviteLocked !== "1") {
            locationField.dataset.prevLocation = locationField.value || "";
          }
          locationField.value = lockedLocation;
          locationField.readOnly = true;
          locationField.dataset.inviteLocked = "1";
          locationField.style.opacity = "0.7";
          locationField.style.cursor = "not-allowed";
          locationField.title = "Location set by photographer\u2019s invite code";
        }
        if (studioSpaceRow) studioSpaceRow.style.display = "none";
      } else {
        if (locationField) {
          // Release the lock whenever this code no longer supplies a venue \u2014
          // including a swap to a DIFFERENT valid code that has none. Keying
          // the clear off `!isValidInvite` missed that case, so the previous
          // code's address stayed in the box, now editable and with the studio
          // -space question back, and got submitted as if it were provided.
          if (locationField.dataset.inviteLocked === "1") {
            locationField.value = locationField.dataset.prevLocation || "";
            delete locationField.dataset.prevLocation;
            delete locationField.dataset.inviteLocked;
          }
          locationField.readOnly = false;
          locationField.style.opacity = "";
          locationField.style.cursor = "";
          locationField.title = "";
        }
        if (studioSpaceRow) studioSpaceRow.style.display = "";
      }
      window._prevLockedLocation = lockedLocation;

      // ── Studio Policies & Terms block ───────────────────────────────────
      // The Studio Rental and Travel lines in the policies panel are written
      // for a client who sources and pays for the venue. When the studio is
      // supplying it — an invite carrying a location, or the home studio on a
      // paid shoot — they state the opposite of everything else on the page and
      // of the contract the client signs. Same correction as the release text
      // in v268/v269, applied to the last surface still reading the old way.
      const venueSuppliedByStudio = !!lockedLocation
        || $("#b_studio_space")?.value === "Home Studio - Noida (Provided by Studio)";
      const venueAddressShown = ($("#b_location")?.value || "").trim();
      const policyRental = $("#policyStudioRental");
      const policyTravel = $("#policyTravel");
      if (policyRental) {
        policyRental.innerHTML = venueSuppliedByStudio
          ? `<strong style="color: var(--ink);">Studio Rental:</strong> The venue for this session${venueAddressShown ? ` (<strong style="color: var(--ink);">${esc(venueAddressShown)}</strong>)` : ""} is arranged and paid for by the studio. <strong style="color: var(--ink);">No studio rental or venue fee is billed to you.</strong> If you later ask to shoot somewhere else, standard venue terms apply again.`
          : `<strong style="color: var(--ink);">Studio Rental:</strong> Package rates cover photography creation, light design &amp; master retouched deliverables. If a dedicated indoor studio venue/space is required, applicable studio rental fees are <strong style="color: var(--ink);">quoted separately in advance</strong>, or the client may directly book their preferred studio space for the production.`;
      }
      if (policyTravel) {
        policyTravel.innerHTML = venueSuppliedByStudio
          ? `<strong style="color: var(--ink);">Travel &amp; Accommodation:</strong> Travel to the studio-provided venue above is covered by the studio for this session. Standard terms (travel beyond <strong style="color: var(--ink);">20 km</strong> from the studio base in Noida, and accommodation where an overnight stay is needed, billed at actuals) apply only if you request a different location.`
          : `<strong style="color: var(--ink);">Travel &amp; Accommodation:</strong> Shoots requiring travel beyond <strong style="color: var(--ink);">20 km</strong> from the studio base (Noida) incur paid travel and, where an overnight stay is needed, accommodation — billed <strong style="color: var(--ink);">at actuals (at cost)</strong>.`;
      }

      // ── Home studio (paid shoots only) ──────────────────────────────────
      // The home studio is offered on paid bookings; TFP venues are handled by
      // the invite code instead, so the option is removed for a test shoot
      // rather than silently offering the photographer's home for free work.
      const HOME_STUDIO_VALUE = "Home Studio - Noida (Provided by Studio)";
      const OUTDOOR_VALUE = "Outdoor / On-Location (No Studio Required)";
      const COMMERCIAL_STUDIO_VALUE = "Dedicated Commercial Studio Rental (Billed at Actuals)";
      const HOME_STUDIO_LABEL = "Home Studio, Noida";
      const studioSpaceSel = $("#b_studio_space");
      const homeStudioOpt = $("#b_studio_space_home");
      const isTfpType = $("#b_type")?.value === "Selective Collaboration (TFP)";

      // This question only makes sense once a commercial studio is actually
      // being rented — the home studio already comes with the photographer's
      // own kit and is booked by the studio either way, and there is no
      // venue at all on an outdoor shoot. Hidden (and therefore not
      // required) the moment the client picks anything else, so a stale
      // answer from an earlier selection never rides along on a shoot it no
      // longer applies to.
      const studioArrangerWrap = $("#b_studio_arranger_wrap");
      // An invite that supplies the venue hides the studio-space row but
      // leaves the <select>'s value alone (so removing the code hands the
      // visitor's earlier pick back). That stale value must not keep asking
      // who will rent a studio the photographer is already providing.
      const inviteSuppliesVenue = !!(isValidInvite && lockedLocation);
      const isCommercialStudioSelected = studioSpaceSel?.value === COMMERCIAL_STUDIO_VALUE && !inviteSuppliesVenue;
      if (studioArrangerWrap) {
        studioArrangerWrap.style.display = isCommercialStudioSelected ? "" : "none";
        if (!isCommercialStudioSelected) {
          document.querySelectorAll('input[name="b_studio_arranger"]').forEach((r) => { r.checked = false; });
        }
      }
      // Read once here so the live contract clause below and the submitted
      // booking (further down, off the same select/radio pair) always agree.
      const studioArrangerChoice = isCommercialStudioSelected
        ? ($("input[name='b_studio_arranger']:checked")?.value || "")
        : "";
      const studioArrangerClauseHtml = studioArrangerChoice
        ? (studioArrangerChoice === "Photographer Arranges Studio & Lighting (Billed at Actuals)"
            ? ` Where requested, the photographer will instead source and book the studio space and lighting equipment on the Participant's behalf, with the studio space and equipment charges quoted to the Participant in advance and added to the invoice.`
            : ` The Participant will source and book the studio space and any lighting equipment directly, and will share the confirmed venue details with the photographer ahead of the shoot.`)
        : "";

      // The home studio used to be withheld from test shoots so the
      // photographer's residence was not silently given away for free work.
      // It is now an itemised rental that a test shoot pays like anyone else
      // (waivable per invite code), so the option is offered to everyone.
      if (homeStudioOpt) {
        homeStudioOpt.hidden = false;
        homeStudioOpt.disabled = false;
      }

      // Picking the home studio fills the address in as a starting point. Only
      // the area is used — the exact address of a private residence is shared
      // on confirmation, never published on a form anyone can open. The field
      // stays editable, so the flip below is what keeps the two answers honest.
      if (studioSpaceSel && locationField && !locationField.dataset.inviteLocked) {
        // One handler serves both fields, so it has to work out which one the
        // visitor just touched: picking the venue should overwrite the address,
        // but editing the address must NOT be overwritten back.
        const venueJustPicked = studioSpaceSel.dataset.prevVenue !== undefined
          && studioSpaceSel.dataset.prevVenue !== studioSpaceSel.value;
        studioSpaceSel.dataset.prevVenue = studioSpaceSel.value;

        if (studioSpaceSel.value === HOME_STUDIO_VALUE) {
          const typed = locationField.value.trim();
          if (venueJustPicked || !typed) {
            locationField.value = HOME_STUDIO_LABEL;
            locationField.dataset.homePrefill = "1";
          } else if (typed !== HOME_STUDIO_LABEL) {
            // They typed a venue of their own while Home Studio was selected.
            // Left alone the contract would promise a studio-provided venue at
            // an address that is not the photographer's, so the venue answer
            // follows what they actually typed instead of contradicting it.
            studioSpaceSel.value = OUTDOOR_VALUE;
            studioSpaceSel.dataset.prevVenue = OUTDOOR_VALUE;
            delete locationField.dataset.homePrefill;
          } else {
            locationField.dataset.homePrefill = "1";
          }
        } else if (locationField.dataset.homePrefill === "1") {
          // Moved off the home studio — take the prefill back out again.
          if (locationField.value.trim() === HOME_STUDIO_LABEL) locationField.value = "";
          delete locationField.dataset.homePrefill;
        }
      }

      // Update inline contract studio clause dynamically
      // Home studio rental. The home studio is a bookable venue for test shoots
      // too, so the charge no longer turns on shoot type — it turns on whether
      // the invite waives it. Computed here rather than beside the rest of the
      // pricing because the contract clause just below quotes it, and that
      // clause is the text the client actually ticks agreement to.
      // An invite carrying a home-studio venue counts as having chosen it: the
      // studio-space dropdown is hidden on those bookings.
      // Two different situations, so two different sources for the charge:
      //   · the code locks a venue — the studio picked the place, so the code
      //     also says what it costs (blank = complimentary, which is the usual
      //     case, and a figure covers a rented space with a real cost);
      //   · no locked venue — the talent picks, so choosing the home studio
      //     costs the studio's standard published rate.
      const inviteLocksVenue = !!(isValidInvite && lockedLocation);
      const dropdownHomeStudio = studioSpaceSel?.value === HOME_STUDIO_VALUE;
      let homeStudioFee = 0;
      if (inviteLocksVenue) {
        const c = matchedInvite && typeof matchedInvite === "object" ? Number(matchedInvite.venueCost) : 0;
        homeStudioFee = (!isNaN(c) && c > 0) ? c : 0;
      } else if (dropdownHomeStudio) {
        // Collaborations can carry their own rate for the same room.
        homeStudioFee = getHomeStudioRate(isTfpType || isValidInvite);
      }
      const homeStudioSelected = dropdownHomeStudio || inviteLocksVenue;

      // What the venue is worth, kept separately from what is charged so a
      // waiver can show the talent the size of what they were given instead of
      // a bare zero.
      let homeStudioListPrice = homeStudioFee;
      // The invite code's own discount on the rental — free, flat ₹, or % —
      // same shape as a promo code's, so a VIP invite can waive or reduce the
      // standard home studio rate without also requiring a separate promo
      // code. Applied before the promo code below so the two can stack.
      const inviteHomeStudioResult = applyPromoHomeStudioDiscount(matchedInvite, homeStudioFee);
      homeStudioFee = Math.max(0, homeStudioFee - inviteHomeStudioResult.amount);
      const inviteFreesHomeStudio = inviteHomeStudioResult.isFree;
      const inviteDiscountsHomeStudio = inviteHomeStudioResult.amount > 0 && !inviteHomeStudioResult.isFree;
      // A promo code's own discount on the rental — free, flat ₹, or % —
      // unlike includeAddons, which only widens what the package's discount
      // is taken off and never zeroes the rental on its own.
      const promoHomeStudioResult = applyPromoHomeStudioDiscount(matchedDiscount, homeStudioFee);
      homeStudioFee = Math.max(0, homeStudioFee - promoHomeStudioResult.amount);
      const promoFreesHomeStudio = promoHomeStudioResult.isFree;
      // A discount that knocks something off without zeroing it out — shown
      // differently from the fully-free case, which reads as "complimentary".
      const promoDiscountsHomeStudio = promoHomeStudioResult.amount > 0 && !promoHomeStudioResult.isFree;

      // An invite that supplies the venue and names no price is handing it over
      // free. Nothing was shown for this at all, so a collaborator given a
      // studio worth thousands saw an empty quote and never learned of it.
      // Its worth is the studio's own rate for that kind of booking.
      const inviteVenueComplimentary = inviteLocksVenue && homeStudioFee === 0 && !promoFreesHomeStudio && !inviteFreesHomeStudio;
      if (inviteVenueComplimentary) {
        homeStudioListPrice = getHomeStudioRate(isTfpType || isValidInvite);
      }
      const venueComplimentary = promoFreesHomeStudio || inviteFreesHomeStudio || inviteVenueComplimentary;
      // Which code earned it, for the line the talent reads.
      const venueFreeWithCode = promoFreesHomeStudio ? enteredDiscount : ((inviteFreesHomeStudio || inviteVenueComplimentary) ? enteredCode : "");
      // Same idea for a partial discount — kept apart from the line above
      // since "complimentary" would misstate a rental that still costs
      // something.
      const venueDiscountWithCode = promoDiscountsHomeStudio ? enteredDiscount : (inviteDiscountsHomeStudio ? enteredCode : "");

      // A collaboration buys no package, so the rental is the only charge it
      // can ever carry — a package rate must never leak into a TFP quote.
      const isCollabBooking = isTfpType || isValidInvite;

      const contractStudioClause = $("#bookingContractStudioClause");
      if (contractStudioClause) {
        // The residence rider is rebuilt here rather than borrowed from the
        // contract-text builder: that `homeStudioRiderHtml` is scoped to its
        // own function, so reaching for it threw a ReferenceError the moment a
        // visitor typed an invite code carrying a venue — the whole field
        // refresh died mid-update, leaving pricing and policy text stale.
        const lockedHomeRiderHtml = /home studio/i.test(lockedLocation || "")
          ? ` Attendance is limited to a maximum of 3 people in total including the Participant and any crew they bring (hair &amp; makeup, stylist, assistants or guests all count towards this limit); the session runs within booked daylight hours and concludes by <strong>7:00 PM</strong>; the full address is shared on booking confirmation; guests may not attend unaccompanied.`
          : ``;
        // House rules for the residence, quoted wherever the home studio is
        // the venue — a paid booking is capped exactly like an invited one.
        const paidHomeRiderHtml = ` Attendance is limited to a maximum of 3 people in total including the Participant and any crew they bring (hair &amp; makeup, stylist, assistants or guests all count towards this limit); the session runs within booked daylight hours and concludes by <strong>7:00 PM</strong>; the full address is shared on booking confirmation; guests may not attend unaccompanied.`;
        contractStudioClause.innerHTML = (isValidInvite && lockedLocation && homeStudioFee === 0)
          ? `Studio for this session is provided by the photographer at <strong>${lockedLocation}</strong> at no additional rental charge to the talent.${lockedHomeRiderHtml} Hair &amp; makeup artists, stylists, set designers and any other third-party crew are not included — the Participant may bring their own or ask the Studio to source them, and such crew are billed at actuals (at cost).`
          : homeStudioFee > 0
            // The client is looking at a quote with this rental on it, so the
            // clause they tick has to name the same number.
            ? `This session takes place at the Studio's home studio in Noida. A fixed home studio rental of <strong>₹${homeStudioFee.toLocaleString("en-IN")}</strong> applies and is itemised in the production quote; no further venue rental applies to it.${paidHomeRiderHtml} Hair &amp; makeup artists, stylists, set designers and any other third-party crew are not included in this booking — the Participant may bring their own or ask the Studio to source them, and such crew are billed at actuals (at cost).`
            : `If a dedicated external or commercial studio space is requested or booked for the shoot, the Participant shall be entirely responsible for covering the applicable studio rental charges.${studioArrangerClauseHtml} Hair &amp; makeup artists, stylists, set designers and any other third-party crew are not included in this booking — the Participant may bring their own or ask the Studio to source them, and such crew are billed at actuals (at cost).`;
      }

      // Update TFP policy notice studio line if TFP is selected
      const policyNoticeEl = $("#bookingPolicyNotice");
      if (policyNoticeEl && $("#b_type") && $("#b_type").value === "Selective Collaboration (TFP)") {
        // Must agree with the quote box: a test shoot at the home studio now
        // carries a rental unless the invite waives it.
        const studioLine = homeStudioFee > 0
          ? `<strong>🏠 Home studio session: a fixed rental of ₹${homeStudioFee.toLocaleString("en-IN")} applies, itemised in your quote and payable in full before the shoot day.</strong>`
          : (isValidInvite && lockedLocation)
            ? `<strong>🏠 Studio provided by photographer at ${lockedLocation} — no rental charge to talent.</strong>`
            : `<strong>Note: If a dedicated studio space is booked for the shoot, applicable studio rental charges will apply.</strong>`;
        policyNoticeEl.innerHTML = `
          <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">TFP Collaboration &amp; Test Shoot Policy</span>
          Submission of a TFP collaboration request does not constitute a confirmed session or a commitment to shoot. All inquiries are subject to schedule availability, creative alignment, and final studio review. ${studioLine} TFP shoots include a Full Proofing Gallery + 8 to 12 Retouched Master Clicks. RAW unedited camera files are strictly excluded and remain unreleased. <strong>⏰ Call time &amp; no-show:</strong> ${window.buildLateArrivalSummary(true)}
        `;
      }

      // Real-Time Final Amount Calculator Engine
      const pkgSelect = $("#b_budget");
      const summaryOriginalPrice = $("#summaryOriginalPrice");
      const summaryDiscountWrap = $("#summaryDiscountWrap");
      const summaryDiscountLabel = $("#summaryDiscountLabel");
      const summarySavingsAmount = $("#summarySavingsAmount");
      const summaryFinalAmount = $("#summaryFinalAmount");
      const calcDiscountTag = $("#calcDiscountTag");

      let rawPkgVal = "";
      if (pkgSelect) {
        if (pkgSelect.selectedIndex >= 0 && pkgSelect.options[pkgSelect.selectedIndex]) {
          rawPkgVal = pkgSelect.options[pkgSelect.selectedIndex].text + " " + pkgSelect.options[pkgSelect.selectedIndex].value;
        } else {
          rawPkgVal = pkgSelect.value || "";
        }
      }

      let basePrice = 7000;
      const priceMatch = rawPkgVal.match(/₹\s*([\d,]+)/);
      if (priceMatch && priceMatch[1]) {
        basePrice = parseInt(priceMatch[1].replace(/,/g, ""), 10) || 7000;
      }

      let savings = 0;
      let discountTagText = "";
      // Each promo code decides whether it discounts add-ons too, or the
      // package rate alone.
      const packageCharge = isCollabBooking ? 0 : basePrice;
      const discountableTotal = (matchedDiscount && matchedDiscount.includeAddons)
        ? packageCharge + homeStudioFee
        : packageCharge;

      // Promo codes are a paid-booking mechanism and the field is hidden on
      // collaborations, so a code left in the box must not discount a rental.
      if (matchedDiscount && !isCollabBooking) {
        if (matchedDiscount.flat) {
          savings = matchedDiscount.flat;
          discountTagText = `FLAT ₹${matchedDiscount.flat.toLocaleString("en-IN")} OFF`;
        } else if (matchedDiscount.pct) {
          savings = Math.round((discountableTotal * matchedDiscount.pct) / 100);
          discountTagText = `${matchedDiscount.pct}% OFF`;
        }
      }
      // Never discount more than the code is entitled to touch: a package-only
      // code caps at the package, so a large flat code cannot quietly eat the
      // studio rental it was never meant to cover.
      savings = Math.min(savings, discountableTotal);
      let finalPayable = Math.max(0, packageCharge + homeStudioFee - savings);

      // Publish the current invite/promo/pricing state for the submit handler.
      bookingCalc = {
        enteredCode,
        matchedInvite,
        isValidInvite,
        lockedLocation,
        enteredDiscount,
        matchedDiscount,
        discountTagText,
        basePrice,
        // What the package actually contributes: zero on a collaboration, so
        // the submit handler bills the rental alone rather than a package rate
        // the client was never quoted.
        packageCharge,
        isCollabBooking,
        // Whether the studio-arranger question is actually in play — false
        // whenever an invite supplies the venue, even if a stale "commercial
        // studio" pick is still sitting in the hidden <select>.
        isCommercialStudioSelected,
        homeStudioFee,
        // What the venue would have cost, and whether the promo code covered
        // it — so the client's email and the studio's record both show the
        // waiver rather than a rental that silently never existed.
        homeStudioListPrice,
        inviteFreesHomeStudio,
        inviteDiscountsHomeStudio,
        inviteHomeStudioAmount: inviteHomeStudioResult.amount,
        inviteHomeStudioLabel: inviteHomeStudioResult.label,
        promoFreesHomeStudio,
        promoDiscountsHomeStudio,
        promoHomeStudioAmount: promoHomeStudioResult.amount,
        promoHomeStudioLabel: promoHomeStudioResult.label,
        savings,
        finalPayable
      };

      // Deliberately after the snapshot above: the duration limits are read
      // back off bookingCalc by the badge and the submit-time check, so setting
      // them any earlier would apply this pass's limits to last pass's status.
      syncDurationLimits(isCollabBooking);

      // The grace-period bullet is a test-shoot term, so it follows the same
      // signal the rest of the collaboration UI does rather than the raw type —
      // an invite-locked booking is a test shoot whatever the (hidden) type
      // select happens to say. Set to "flex" and not "" because the list item
      // is a flex row; "" would restore the stylesheet default of list-item.
      // Shown on every booking now, worded for whichever kind this is.
      const policyLateArrival = $("#policyLateArrival");
      const policyLateArrivalText = $("#policyLateArrivalText");
      if (policyLateArrivalText) {
        policyLateArrivalText.innerHTML = `<strong style="color: var(--ink);">Call Time, Grace Period &amp; No-Show:</strong> ${window.buildLateArrivalSummary(isCollabBooking)}`;
      }
      if (policyLateArrival) policyLateArrival.style.display = "flex";

      const finalPriceSummaryBox = $("#finalPriceSummaryBox");
      const promoCodeWrap = $("#b_discount_code")?.closest(".field");

      // Read the type FRESH rather than using the `type` captured at the top of
      // updateFields. The invite-code lock above switches #b_type to TFP and
      // dispatches a change event, which re-enters updateFields; that nested
      // run correctly hid this box, and then this outer run — still holding the
      // pre-lock value — put it straight back. That is why a test shoot locked
      // by an invite code was quoting a package price and 50/50 milestones.
      const effectiveType = $("#b_type")?.value || type;

      // Hide the quote on a verified invite as well as on TFP, rather than
      // trusting that an invite always forces the type. That coupling has been
      // removed and restored before (a43b076 / 0a422fc); if it is ever undone
      // again, a package price and payment milestones must not reappear on an
      // invited collaborator's screen just because the type check stopped
      // matching. Either condition is enough to mean "nothing is payable here".
      // Temporary diagnostic, only on /book/?debug=1 — invisible to clients.
      // The quote box is provably hidden by the branch below whenever an invite
      // verifies, yet it was still rendering on the live site, so this reports
      // what the browser actually evaluates rather than what the source says.
      if (new URLSearchParams(location.search).get("debug") === "1") {
        let dbg = document.getElementById("__wpsDebug");
        if (!dbg) {
          dbg = document.createElement("div");
          dbg.id = "__wpsDebug";
          dbg.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99999;background:#000;color:#0f0;font:11px/1.5 monospace;padding:10px 12px;border:1px solid #0f0;border-radius:6px;max-width:min(92vw,460px);white-space:pre-wrap;";
          document.body.appendChild(dbg);
        }
        const box = document.querySelectorAll("#finalPriceSummaryBox");
        dbg.textContent = [
          `enteredCode      ${JSON.stringify(enteredCode)}`,
          `isValidInvite    ${isValidInvite}`,
          `effectiveType    ${JSON.stringify(effectiveType)}`,
          `will hide        ${effectiveType === "Selective Collaboration (TFP)" || isValidInvite}`,
          `#quoteBox found  ${box.length}`,
          `  its display    ${box[0] ? JSON.stringify(box[0].style.display) : "n/a"}`,
          `#promoWrap found ${promoCodeWrap ? "yes" : "NO"}`,
          `updateFields run ${(window.__wpsRuns = (window.__wpsRuns || 0) + 1)}`,
        ].join("\n");
      }

      // A collaboration owes nothing unless it is using the home studio without
      // a waiver. When it does, the quote has to appear — charging a rental the
      // client was never shown is exactly the failure this box exists to stop.
      const collabOwesRental = isCollabBooking && homeStudioFee > 0;
      // A collaboration also gets a quote when the venue is complimentary:
      // nothing is payable, but there IS something worth telling them.
      const collabShowsQuote = isCollabBooking && (collabOwesRental || venueComplimentary);

      // `wps-no-pricing` hides the quote with !important, which is right for a
      // free collaboration and wrong the moment one owes a rental. This is the
      // switch that lets the itemised quote back through.
      document.body.classList.toggle("wps-rental-quote", homeStudioFee > 0 || collabShowsQuote);

      if (isCollabBooking) {
        if (finalPriceSummaryBox) finalPriceSummaryBox.style.display = collabShowsQuote ? "block" : "none";
        if (promoCodeWrap) promoCodeWrap.style.display = "none";
        if (budgetField) budgetField.style.display = "none";
      } else {
        if (finalPriceSummaryBox) finalPriceSummaryBox.style.display = "block";
        if (promoCodeWrap) promoCodeWrap.style.display = "";
        if (budgetField) budgetField.style.display = "";
      }

      if (!isCollabBooking || collabShowsQuote) {
        // On a collaboration the first line names the arrangement rather than a
        // package, and reads ₹0 — there is no package rate to quote.
        const summaryPackageLabel = $("#summaryPackageLabel");
        if (summaryPackageLabel) {
          summaryPackageLabel.textContent = isCollabBooking
            ? getAdminTfpPackage().name
            : "Package Base Rate";
        }
        if (summaryOriginalPrice) summaryOriginalPrice.textContent = `₹${packageCharge.toLocaleString("en-IN")}`;

        // Home studio rental line. Kept visible at ₹0 when a promo code hands
        // the venue over free: a line that simply disappears reads as a bug and
        // hides the fact that the code is worth the rental on top of its
        // discount. It is dropped only when no rental was ever in play.
        const summaryHomeStudioWrap = $("#summaryHomeStudioWrap");
        const summaryHomeStudioAmount = $("#summaryHomeStudioAmount");
        const showHomeStudioLine = homeStudioFee > 0 || venueComplimentary;
        if (summaryHomeStudioWrap) {
          summaryHomeStudioWrap.style.display = showHomeStudioLine ? "flex" : "none";
        }
        // Any promo discount on the rental (full or partial) shows the
        // struck-through original beside the reduced number — not just the
        // fully-free case, so a flat-₹ or % code off the room is visible too.
        const homeStudioPromoApplied = homeStudioListPrice > homeStudioFee;
        if (summaryHomeStudioAmount && showHomeStudioLine) {
          // Show what the venue costs before showing the discount. "₹0" on
          // its own hides the size of the gift — the studio is handing over a
          // ₹2,000 room, and the client should see that, not a zero.
          summaryHomeStudioAmount.innerHTML = homeStudioPromoApplied
            ? `<span style="text-decoration: line-through; color: rgba(255,255,255,0.45); font-weight: 500; margin-right: 8px;">₹${homeStudioListPrice.toLocaleString("en-IN")}</span><span style="color: #059669;">₹${homeStudioFee.toLocaleString("en-IN")}</span>`
            : (venueComplimentary ? "₹0" : `+₹${homeStudioFee.toLocaleString("en-IN")}`);
          summaryHomeStudioAmount.style.color = venueComplimentary ? "#2F6B4F" : "var(--ink)";
        }
        // Name the actual venue when the invite supplies one — billing a client
        // for "Home Studio Rental" when the code sent them to a rented space is
        // a line item they cannot reconcile.
        const summaryHomeStudioLabel = $("#summaryHomeStudioLabel");
        if (summaryHomeStudioLabel && showHomeStudioLine) {
          const venueName = inviteLocksVenue
            ? `Studio Venue (${lockedLocation})`
            : "Home Studio Rental (Noida)";
          summaryHomeStudioLabel.innerHTML = venueComplimentary
            ? `${esc(venueName)} <span style="color:#059669;font-weight:700;">— complimentary${venueFreeWithCode ? ` with ${esc(venueFreeWithCode)}` : ""}</span>`
            : promoDiscountsHomeStudio
              ? `${esc(venueName)} <span style="color:#059669;font-weight:700;">— ${esc(promoHomeStudioResult.label)}${venueDiscountWithCode ? ` with ${esc(venueDiscountWithCode)}` : ""}</span>`
              : inviteDiscountsHomeStudio
                ? `${esc(venueName)} <span style="color:#059669;font-weight:700;">— ${esc(inviteHomeStudioResult.label)}${venueDiscountWithCode ? ` with ${esc(venueDiscountWithCode)}` : ""}</span>`
                : esc(venueName);
        }

        if (savings > 0) {
          if (summaryDiscountWrap) summaryDiscountWrap.style.display = "flex";
          if (summaryDiscountLabel) summaryDiscountLabel.textContent = `Promo Savings (${discountTagText}):`;
          if (summarySavingsAmount) summarySavingsAmount.textContent = `-₹${savings.toLocaleString("en-IN")}`;
          if (calcDiscountTag) {
            calcDiscountTag.style.display = "inline-block";
            calcDiscountTag.textContent = `PROMO APPLIED: ${discountTagText}`;
          }
        } else {
          if (summaryDiscountWrap) summaryDiscountWrap.style.display = "none";
          if (calcDiscountTag) calcDiscountTag.style.display = "none";
        }

        // Everything the booking saved, added up: the package discount plus
        // whatever the promo code took off the rental — free or partial.
        // Shown only when the two stack, since on an ordinary discount it
        // would just repeat the line above it.
        const waivedVenueValue = Math.max(0, homeStudioListPrice - homeStudioFee);
        const totalSavings = savings + waivedVenueValue;
        const summaryTotalSavingsWrap = $("#summaryTotalSavingsWrap");
        const summaryTotalSavingsAmount = $("#summaryTotalSavingsAmount");
        if (summaryTotalSavingsWrap) {
          summaryTotalSavingsWrap.style.display = (waivedVenueValue > 0 && totalSavings > 0) ? "flex" : "none";
        }
        if (summaryTotalSavingsAmount && waivedVenueValue > 0) {
          summaryTotalSavingsAmount.textContent = `₹${totalSavings.toLocaleString("en-IN")}`;
        }

        if (summaryFinalAmount) summaryFinalAmount.textContent = `₹${finalPayable.toLocaleString("en-IN")} INR`;

        // The photographer arranging the studio means its real cost is not
        // known yet — it is billed at actuals once booked — so the total
        // above is provisional and the client should not read it as final.
        const summaryArrangerNote = $("#summaryArrangerNote");
        if (summaryArrangerNote) {
          summaryArrangerNote.style.display = (studioArrangerChoice === "Photographer Arranges Studio & Lighting (Billed at Actuals)") ? "block" : "none";
        }

        // Payment terms. A collaboration owes only the rental, which reserves
        // the space, so it is due in full up front — splitting a small rental
        // into two milestones just creates a second amount to chase.
        const milestoneGrid = $("#summaryMilestoneBreakdown");
        const reservationCard = $("#summaryReservationCard");
        // A complimentary collaboration owes nothing at all, so neither the
        // 50/50 milestones nor the reservation card belong on it — a pair of
        // ₹0 payment steps reads as a broken quote.
        const nothingToPay = isCollabBooking && finalPayable === 0;
        const nothingToPayNote = $("#summaryNothingToPay");
        if (milestoneGrid) milestoneGrid.style.display = (collabOwesRental || nothingToPay) ? "none" : "grid";
        if (reservationCard) reservationCard.style.display = collabOwesRental ? "block" : "none";
        if (nothingToPayNote) nothingToPayNote.style.display = nothingToPay ? "block" : "none";

        if (collabOwesRental) {
          const reservationAmount = $("#summaryReservationAmount");
          if (reservationAmount) reservationAmount.textContent = `₹${finalPayable.toLocaleString("en-IN")} INR`;
        } else {
          // Itemized Retainer & remaining milestones. The studio rental
          // reserves the venue, so — like a collaboration's rental — it is
          // due in full up front rather than split across milestones; only
          // the package rate itself is divided per the studio's milestone
          // schedule (50/50, or 50/30/20 when that global setting is on).
          const packageNet = Math.max(0, finalPayable - homeStudioFee);
          const is3Step = globalSched === "503020";
          const summaryAdvanceAmount = $("#summaryAdvanceAmount");
          const summaryBalanceAmount = $("#summaryBalanceAmount");
          const summaryAdvanceLabel = $("#summaryAdvanceLabel");
          const summaryStep2Label = $("#summaryStep2Label");
          const summaryStep3Wrap = $("#summaryStep3Wrap");
          const summaryStep3Amount = $("#summaryStep3Amount");

          let advanceRetainer, wrapBalance, step3Amount = 0;
          if (is3Step) {
            // 30% off the package portion goes to step 2; step 3 takes
            // whatever rounding left over so the three legs always add
            // back up to finalPayable exactly.
            const step2 = Math.round(packageNet * 0.3);
            advanceRetainer = Math.round(packageNet * 0.5) + homeStudioFee;
            step3Amount = Math.max(0, packageNet - Math.round(packageNet * 0.5) - step2);
            wrapBalance = step2;
          } else {
            advanceRetainer = Math.round(packageNet / 2) + homeStudioFee;
            wrapBalance = finalPayable - advanceRetainer;
          }

          if (summaryAdvanceAmount) summaryAdvanceAmount.textContent = `₹${advanceRetainer.toLocaleString("en-IN")} INR`;
          if (summaryBalanceAmount) summaryBalanceAmount.textContent = `₹${wrapBalance.toLocaleString("en-IN")} INR`;
          if (summaryStep3Wrap) summaryStep3Wrap.style.display = is3Step ? "block" : "none";
          if (summaryStep3Amount) summaryStep3Amount.textContent = `₹${step3Amount.toLocaleString("en-IN")} INR`;
          if (summaryAdvanceLabel) {
            summaryAdvanceLabel.textContent = homeStudioFee > 0
              ? "Step 1 · 50% Advance Retainer + Studio Rental (Due Now)"
              : "Step 1 · 50% Advance Retainer (Due Now)";
          }
          if (summaryStep2Label) {
            summaryStep2Label.textContent = is3Step
              ? "Step 2 · 30% Review Milestone (After Shoot)"
              : "Step 2 · 50% Wrap Balance (Prior to Deliverables)";
          }
        }

        // Update Mobile Sticky Floating Action Bar (FAB)
        const fabPrice = $("#mobileFabPrice");
        if (fabPrice) fabPrice.textContent = `Payable: ₹${finalPayable.toLocaleString("en-IN")} INR`;
      }
    };

    // A collaboration brings no shoot fee with it, so it does not take a whole
    // production day the way a paid booking can: the full-day preset is
    // withdrawn, leaving the two 4-hour half days, and a custom call/wrap
    // window is allowed a single hour of headroom over that. Paid shoots keep
    // the full range — none of this applies to them.
    const TFP_MAX_SESSION_MINS = 5 * 60;
    const DEFAULT_DURATION = "Flexible / Photographer Choice";
    // Matched on the "Full Day" prefix rather than the option's exact label,
    // which carries an en dash and the hours in it — rewording those should not
    // silently switch the cap off.
    const isFullDayOption = (opt) => (opt.value || "").startsWith("Full Day");

    const format12 = (timeStr) => {
      if (!timeStr) return "";
      const [h, m] = timeStr.split(":").map(Number);
      const period = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, "0")} ${period}`;
    };

    // One source of truth for the length of a custom window: the badge, the
    // submit-time check and the inquiry text all read it, and a cap enforced by
    // two separate calculations is a cap that eventually disagrees with itself.
    const customSessionMinutes = () => {
      const startVal = $("#b_time_start")?.value || "10:30";
      const endVal = $("#b_time_end")?.value || "17:30";
      const [sh, sm] = startVal.split(":").map(Number);
      const [eh, em] = endVal.split(":").map(Number);
      let diffMins = (eh * 60 + em) - (sh * 60 + sm);
      if (diffMins < 0) diffMins += 24 * 60;
      return diffMins;
    };

    const isCollabSession = () => !!(bookingCalc && bookingCalc.isCollabBooking);

    const formatHours = (mins) => (mins / 60).toFixed(1).replace(".0", "");

    const updateCustomTimeBadge = () => {
      const startVal = $("#b_time_start")?.value || "10:30";
      const endVal = $("#b_time_end")?.value || "17:30";
      const diffMins = customSessionMinutes();
      const hrs = formatHours(diffMins);
      const overCap = isCollabSession() && diffMins > TFP_MAX_SESSION_MINS;
      const badge = $("#b_custom_time_badge");
      if (badge) {
        badge.innerHTML = overCap
          ? `⚠️ ${hrs} Hours — a test shoot runs to 5 hours at most. Please shorten the window before submitting.`
          : `⏱️ ${hrs} Hours Session (${format12(startVal)} – ${format12(endVal)})`;
        badge.style.color = overCap ? "#dc2626" : "var(--accent)";
      }
    };

    // Applies the collaboration limits to the duration field. Called from
    // updateFields once the booking's collaboration status is settled, so a
    // verified invite code takes the full day away in the same pass that locks
    // the shoot type.
    const syncDurationLimits = (isCollab) => {
      const durSel = $("#b_duration");
      if (!durSel) return;
      const fullDayOpt = Array.from(durSel.options).find(isFullDayOption);
      if (fullDayOpt) {
        fullDayOpt.hidden = isCollab;
        fullDayOpt.disabled = isCollab;
        // Someone who picked the full day before entering an invite code is
        // left holding a selection that is no longer on offer. Fall back to the
        // recommended default rather than quietly picking a half day for them:
        // the photographer sets the hours on a collaboration anyway.
        if (isCollab && isFullDayOption(durSel)) durSel.value = DEFAULT_DURATION;
      }
      const note = $("#b_duration_note");
      if (note) note.style.display = isCollab ? "block" : "none";
      updateCustomTimeBadge();
    };

    // What the visitor actually agreed to run, resolved for the studio's records.
    // "Custom Timings" on its own says nothing, so the call and wrap times travel
    // with it.
    const sessionDurationLabel = () => {
      const durSel = $("#b_duration");
      if (!durSel) return "";
      if (durSel.value !== "Custom Timings") return durSel.value;
      const startVal = $("#b_time_start")?.value || "";
      const endVal = $("#b_time_end")?.value || "";
      return `Custom — ${format12(startVal)} to ${format12(endVal)} (${formatHours(customSessionMinutes())} hours)`;
    };

    $("#b_duration")?.addEventListener("change", () => {
      const isCustom = $("#b_duration")?.value === "Custom Timings";
      const wrap = $("#b_custom_time_wrap");
      if (wrap) wrap.style.display = isCustom ? "block" : "none";
      if (isCustom) {
        // The panel opens on the full-day window it was built for, which on a
        // collaboration is already past the cap — so picking "Custom" would
        // greet a test shoot with a red warning it did nothing to earn. Open it
        // on the half day instead, leaving the hour of headroom to stretch into.
        // Only an over-cap window is moved; a legal one the visitor set is left
        // exactly as they left it.
        if (isCollabSession() && customSessionMinutes() > TFP_MAX_SESSION_MINS) {
          const startEl = $("#b_time_start"), endEl = $("#b_time_end");
          if (startEl && endEl) { startEl.value = "10:30"; endEl.value = "14:30"; }
        }
        updateCustomTimeBadge();
      }
    });

    // Wrapped rather than passed by reference: these fire with an Event as the
    // first argument, and a bare handler here would hand it to any parameter
    // this function later grows.
    $("#b_time_start")?.addEventListener("input", () => updateCustomTimeBadge());
    $("#b_time_end")?.addEventListener("input", () => updateCustomTimeBadge());

    ["change", "input", "blur", "click"].forEach(evtName => {
      $("#b_type")?.addEventListener(evtName, updateFields);
      $("#b_role")?.addEventListener(evtName, updateFields);
      $("#b_budget")?.addEventListener(evtName, updateFields);
      $("#b_invite_code")?.addEventListener(evtName, updateFields);
      $("#b_discount_code")?.addEventListener(evtName, updateFields);
      // The venue choice and the address have to re-run updateFields too, or
      // the home-studio prefill never appears and the flip that keeps the two
      // answers agreeing never fires.
      $("#b_studio_space")?.addEventListener(evtName, updateFields);
    });
    // Venue cards ⇄ #b_studio_space. A card pick writes the select and fires
    // change (updateFields runs as before); after every form event the cards
    // are re-read from the select, because updateFields itself flips the
    // value when a typed address contradicts the home-studio pick.
    (() => {
      const sel = $("#b_studio_space"), wrap = $("#venueCards");
      if (!sel || !wrap) return;
      const radios = Array.from(wrap.querySelectorAll('input[type="radio"]'));
      const sync = () => {
        radios.forEach(r => {
          const opt = Array.from(sel.options).find(o => o.value === r.value);
          const card = r.closest(".venue-card");
          r.checked = sel.value === r.value;
          r.disabled = !opt || opt.disabled || sel.disabled;
          card.hidden = !opt || opt.hidden;
          card.classList.toggle("is-on", r.checked);
          card.classList.toggle("is-off", r.disabled);
        });
      };
      radios.forEach(r => r.addEventListener("change", () => {
        if (r.checked && sel.value !== r.value) {
          sel.value = r.value;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }
        sync();
      }));
      const formEl = $("#bookingForm");
      ["change", "input", "click"].forEach(ev => formEl?.addEventListener(ev, () => setTimeout(sync, 0)));
      sync();
    })();
    // Picking who arranges the studio has to re-run updateFields too, or the
    // live contract clause the client reads keeps showing the pre-pick text
    // until some other field happens to change.
    document.querySelectorAll('input[name="b_studio_arranger"]').forEach((r) => {
      r.addEventListener("change", updateFields);
    });
    // Address changes are checked on change/blur rather than on every
    // keystroke: flipping the dropdown mid-word would yank the selection out
    // from under someone who is still typing "Home Studio, Noida" by hand.
    ["change", "blur"].forEach(evtName => {
      $("#b_location")?.addEventListener(evtName, updateFields);
    });

    $("#btnApplyDiscountCode")?.addEventListener("click", () => {
      const input = $("#b_discount_code");
      const val = (input?.value || "").trim();
      if (val) {
        input.value = "";
      }
      updateFields();
    });

    $("#toggleInviteCodeLink")?.addEventListener("click", () => {
      const container = $("#inviteCodeContainer");
      const link = $("#toggleInviteCodeLink");
      if (container) {
        const isHidden = container.style.display === "none" || !container.style.display;
        container.style.display = isHidden ? "block" : "none";
        if (link) {
          link.textContent = isHidden ? "✕ Hide invite code field" : "🔑 Have a direct photographer invite code? (test shoot invite)";
        }
      }
    });

    // Collapses the two long policy blocks behind a one-line summary — the
    // full form used to always show ~40 lines of dense legal text twice over,
    // which made the page feel far longer than the handful of fields a
    // client actually has to fill in. Same toggle pattern as the invite code
    // link above; both start collapsed.
    const makePolicyToggle = (toggleId, detailId, iconId, openLabel, closedLabel) => {
      const toggleBtn = $(toggleId);
      const detail = $(detailId);
      const icon = $(iconId);
      if (!toggleBtn || !detail) return;
      toggleBtn.addEventListener("click", () => {
        const isOpen = detail.style.display !== "none";
        detail.style.display = isOpen ? "none" : "block";
        toggleBtn.setAttribute("aria-expanded", String(!isOpen));
        if (icon) icon.textContent = isOpen ? openLabel : closedLabel;
      });
    };
    makePolicyToggle("#bookPoliciesToggle", "#bookPoliciesDetail", "#bookPoliciesToggleIcon", "+ Read full policies", "− Hide policies");
    makePolicyToggle("#bookingPolicyToggle", "#bookingPolicyNoticeWrap", "#bookingPolicyToggleIcon", "+ Read full terms", "− Hide terms");

    // Pinned total + submit. The quote and the Submit button used to sit
    // ~2,000px apart with nothing on screen in between; this fixed bar
    // mirrors the live total and the real button's label (which flips to
    // "Request for a Test Shoot" for collaborations) and hides whenever the
    // real button is on screen. Clicking it clicks the real button, so
    // validation and the terms modal are untouched.
    (() => {
      const bar = $("#bookStickyBar"), realBtn = $("#bookSubmitBtn");
      // The submit button renders outside the <form> element, so closest()
      // comes back null — fall back to the form by id, then to the button's
      // own container, for both the "form on screen" observer and the
      // input/change listeners that keep the total in sync.
      const formEl = (realBtn && realBtn.closest("form")) || $("#bookingForm") || (realBtn && realBtn.parentElement);
      if (!bar || !realBtn || !formEl) return;
      const totalWrap = $("#bookStickyTotal"), amount = $("#bookStickyAmount"), note = $("#bookStickyNote"), proxy = $("#bookStickySubmit");
      proxy?.addEventListener("click", () => realBtn.click());
      const sync = () => {
        const hud = $("#finalPriceSummaryBox");
        const hudVisible = !!hud && getComputedStyle(hud).display !== "none";
        const amt = ($("#summaryFinalAmount")?.textContent || "").trim();
        const showTotal = hudVisible && !!amt;
        if (totalWrap) totalWrap.style.display = showTotal ? "" : "none";
        if (amount) amount.textContent = amt.replace(/\s*INR$/i, "");
        if (note) note.style.display = showTotal ? "none" : "";
        if (proxy) proxy.textContent = realBtn.textContent.trim() || "Submit booking request";
      };
      formEl.addEventListener("input", sync);
      formEl.addEventListener("change", sync);
      sync();
      setTimeout(sync, 0);
      if ("IntersectionObserver" in window) {
        let formOn = false, btnOn = false;
        const apply = () => bar.classList.toggle("is-hidden", !formOn || btnOn);
        new IntersectionObserver(([e]) => { formOn = e.isIntersecting; apply(); }, { threshold: 0 }).observe(formEl);
        new IntersectionObserver(([e]) => { btnOn = e.isIntersecting; apply(); }, { threshold: 0, rootMargin: "0px 0px 40px 0px" }).observe(realBtn);
      }
    })();

    // URL Query Parameter Pre-filling Engine (?package=...&date=...&invite=...)
    (function parseUrlQueryParams() {
      try {
        const params = new URLSearchParams(window.location.search);
        const pkgParam = params.get("package") || params.get("pkg");
        const dateParam = params.get("date");
        const inviteParam = params.get("invite") || params.get("code");
        const roleParam = params.get("role");

        if (roleParam && $("#b_role")) {
          $("#b_role").value = roleParam;
        }

        if (dateParam && $("#b_date")) {
          $("#b_date").value = dateParam;
        }

        if (pkgParam && $("#b_budget")) {
          const sel = $("#b_budget");
          const targetOpt = Array.from(sel.options).find(o => o.value.includes(pkgParam) || o.text.includes(pkgParam));
          if (targetOpt) sel.value = targetOpt.value;
        }

        if (inviteParam && $("#b_invite_code")) {
          const inviteInput = $("#b_invite_code");
          const inviteContainer = $("#inviteCodeContainer");
          const inviteLink = $("#toggleInviteCodeLink");
          inviteInput.value = inviteParam;
          if (inviteContainer) inviteContainer.style.display = "block";
          if (inviteLink) inviteLink.textContent = "✕ Hide invite code field";
        }
      } catch(e) {}
    })();

    $("#btnApplyInviteCode")?.addEventListener("click", () => {
      const input = $("#b_invite_code");
      const container = $("#inviteCodeContainer");
      const link = $("#toggleInviteCodeLink");
      const val = (input?.value || "").trim();
      if (val) {
        input.value = "";
        if (container) container.style.display = "none";
        if (link) link.textContent = "🔑 Have a direct photographer invite code? (test shoot invite)";
      }
      updateFields();
    });
    updateFields();

    function validate() {
      let firstBad = null;
      const require = (id, msg) => {
        if (!val(id)) { setError(id, msg); firstBad = firstBad || id; }
        else clearError(id);
      };
      require("b_name", "Please add your name or brand.");
      require("b_date", "Let us know a rough date or timeline.");
      require("b_location", "Please let us know your preferred location.");

      // Only asked (and therefore only enforced) once a dedicated commercial
      // studio is actually being rented — see the show/hide note beside
      // b_studio_arranger_wrap in updateFields.
      // Read off bookingCalc rather than the raw <select>: an invite that
      // supplies the venue hides the row but leaves the value, and a hidden
      // required radio would block submit with an error nobody can see.
      if (bookingCalc && bookingCalc.isCommercialStudioSelected) {
        if (!document.querySelector('input[name="b_studio_arranger"]:checked')) {
          setError("b_studio_arranger_client", "Please choose who will arrange the studio and lighting — you, or the photographer.");
          firstBad = firstBad || "b_studio_arranger_client";
        } else {
          clearError("b_studio_arranger_client");
        }
      }

      const rawDateStr = val("b_date");
      if (rawDateStr) {
        const parsedT = Date.parse(rawDateStr);
        if (!isNaN(parsedT)) {
          const parsedD = new Date(parsedT);
          parsedD.setHours(23, 59, 59, 999);
          const todayFloor = new Date();
          todayFloor.setHours(0, 0, 0, 0);
          if (parsedD < todayFloor) {
            setError("b_date", "Dates in the past cannot be booked. Please select today or a future date.");
            firstBad = firstBad || "b_date";
          }
        }
      }

      const email = val("b_email");
      if (!email) { setError("b_email", "We need an email to reply to."); firstBad = firstBad || "b_email"; }
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("b_email", "That email doesn't look right."); firstBad = firstBad || "b_email"; }
      else clearError("b_email");

      const type = $("#b_type")?.value;
      if (type === "Selective Collaboration (TFP)") {
        if (!val("b_instagram")) {
          setError("b_instagram", "Instagram / Website is mandatory for test shoots.");
          firstBad = firstBad || "b_instagram";
        } else {
          clearError("b_instagram");
        }
      }

      // The badge only warns; this is what actually stops a test shoot being
      // agreed to for longer than the cap. Attached to the duration field
      // because that is the choice being rejected — the time inputs sit outside
      // a .field wrapper and cannot carry an inline error.
      if (isCollabSession() && $("#b_duration")?.value === "Custom Timings"
          && customSessionMinutes() > TFP_MAX_SESSION_MINS) {
        setError("b_duration", `Test shoots run to a maximum of ${TFP_MAX_SESSION_MINS / 60} hours. Please shorten the call and wrap window.`);
        firstBad = firstBad || "b_duration";
      } else {
        clearError("b_duration");
      }
      return firstBad;
    }

    // No-server delivery: the signed contract goes to the studio inbox (with
    // a copy to the client via _cc) through the same free FormSubmit relay
    // the booking form uses — the studio Gmail is the permanent record.
    // FormSubmit reports soft failures (e.g. pending form activation) as
    // HTTP 200 with success:"false", so the body flag is the real result.
    function sigDataUrlToBlob(dataUrl) {
      try {
        const match = String(dataUrl).match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
        if (!match) return null;
        const bytes = atob(match[2]);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        return new Blob([arr], { type: match[1] });
      } catch (e) {
        return null;
      }
    }

    async function sendSignedContractEmail(payload) {
      const sigBlob = payload.sigDataUrl ? sigDataUrlToBlob(payload.sigDataUrl) : null;

      const postForm = async (withSig) => {
        const fd = new FormData();
        fd.append("_subject", `Signed Contract — ${payload.clientName || "Client"} (${payload.contractNumber || payload.contractVersion || "Contract"})`);
        fd.append("_template", "box");
        if (payload.clientEmail) {
          fd.append("_replyto", payload.clientEmail);
          fd.append("_cc", payload.clientEmail);
        }
        fd.append("Record Type", "SIGNED CONTRACT — keep this email as the studio's permanent record");
        fd.append("Contract Number", payload.contractNumber || "—");
        fd.append("Contract Version", payload.contractVersion || "—");
        fd.append("Client Name", payload.clientName || "—");
        fd.append("Client Email", payload.clientEmail || "—");
        fd.append("Phone", payload.phone || "—");
        fd.append("Instagram / Website", payload.instagram || "—");
        fd.append("Shoot Type", payload.shootType || "—");
        fd.append("Scheduled Date", payload.date || "—");
        fd.append("Location", payload.location || "—");
        fd.append("Notes", payload.notes || "—");
        // Three distinct cases, not two. Falling through to "No (email/DM
        // consent)" for anything without an image understated a checkbox
        // acceptance — the client HAD agreed, on the form, to the terms.
        // The version is read off the booking rather than written in: hardcoding
        // it meant this line kept naming V3.3 while the reference and full text
        // in the same email had moved on, so the studio's own record disagreed
        // with itself about which document was accepted.
        fd.append("Signature Captured", sigBlob
          ? (withSig ? "Yes — drawn signature attached as PNG" : "Yes — drawn at booking (attachment unavailable; image kept in booking record)")
          : (payload.agreementMethod === "checkbox"
              ? `Yes — accepted via checkbox confirmation on the booking form (${payload.contractVersion || "Studio Terms"})`
              : "No (email/DM consent)"));
        fd.append("Contract Terms (full text)", payload.contractText || "—");
        if (withSig) fd.append("attachment", sigBlob, `signature-${payload.contractNumber || "contract"}.png`);
        const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(studioEmail)}`, {
          method: "POST",
          headers: { "Accept": "application/json" },
          body: fd
        });
        const body = await res.json().catch(() => null);
        return { ok: res.ok && !!body && (body.success === true || body.success === "true"), message: (body && body.message) || res.statusText };
      };

      try {
        let result = await postForm(!!sigBlob);
        // If the attachment is what made the relay reject, resend without it —
        // a delivered record without the image beats no record at all.
        if (!result.ok && sigBlob) result = await postForm(false);
        if (!result.ok) console.warn("Signed contract email failed:", result.message);
        return result.ok;
      } catch (err) {
        console.warn("Signed contract email error:", err);
        return false;
      }
    }

    const handleBookingSubmit = (e) => {
      if (e) e.preventDefault();

      const firstBad = validate();
      if (firstBad) {
        const el = $("#" + firstBad);
        if (el) {
          el.focus();
          el.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "center" });
        }
        return;
      }

      const name = val("b_name"), role = val("b_role"), email = val("b_email");
      const phone = val("b_phone"), instagram = val("b_instagram"), type = val("b_type");
      const date = val("b_date"), locationVal = val("b_location"), budget = (type === "Selective Collaboration (TFP)" ? "Collab / TFP (No Budget)" : val("b_budget"));
      const moodboard = getFormLinks().join(", "), concept = val("b_concept");
      // Flag an already-booked date for the studio's attention rather than
      // blocking submission — the client may still want to send the request
      // so the studio can decide (confirm anyway, or offer an alternative).
      const dateStatusTarget = rangeStart || (multiDates.length ? multiDates[0] : (() => { const p = new Date(date); return isNaN(p.getTime()) ? null : p; })());
      const dateAlreadyBooked = dateStatusTarget ? getCalDateStatus(dateStatusTarget).isBooked : false;
      // The session length was collected and then dropped on the floor: it
      // reached neither the studio's inbox nor the calendar, which recorded
      // every booking as a full day. A cap nobody can see is not a cap, so it
      // now travels with the rest of the booking.
      const sessionDuration = sessionDurationLabel();

      const proceedSubmit = (agreedToTerms = false, shootCategory = "Commercial", isCustomContract = false, customContractNotes = "", sigDataUrl = "", agreementMethod = "") => {
        btn.disabled = true;
        btn.classList.add("is-loading");
        btn.textContent = "Sending your request…";

        const isTfpCat = shootCategory === "TFP";

        // Did this booking come in on an invite that supplies the venue? Read
        // from the field's own lock marker rather than a window global, so it
        // can only ever describe the booking actually being submitted. Resolved
        // here because the signed release below and the inquiry policy lines
        // further down must not be able to disagree about who pays for the venue.
        // Two ways the studio ends up supplying the venue: an invite code that
        // carries one, or the client choosing the home studio on a paid shoot.
        // For the money question they are the same answer — no rental billed —
        // so they share this clause. The home studio then adds a rider, because
        // a private residence is not the same as a hired commercial space.
        const isHomeStudio = $("#b_studio_space")?.value === "Home Studio - Noida (Provided by Studio)";
        const venueByStudio = $("#b_location")?.dataset.inviteLocked === "1" || isHomeStudio;
        const venueByStudioAddress = venueByStudio ? ($("#b_location")?.value || "") : "";
        const homeStudioRider = isHomeStudio
          ? `\n\nHOME STUDIO SESSIONS\nThis session takes place at the photographer's private residence. Attendance is limited to a maximum of 3 people in total, including the Participant and any crew they bring — hair & makeup artists, stylists, assistants and guests all count towards this limit. Sessions run within booked daylight hours and conclude by 7:00 PM. The full address is shared on booking confirmation. Guests may not attend unaccompanied.`
          : "";
        // Same arranger choice the live contract clause reads during
        // updateFields, re-read here off the same select/radio pair so the
        // document the client actually signs never disagrees with what they
        // saw on screen a moment before submitting.
        const isCommercialStudioBooked = !!(bookingCalc && bookingCalc.isCommercialStudioSelected);
        const studioArrangerPick = isCommercialStudioBooked ? ($("input[name='b_studio_arranger']:checked")?.value || "") : "";
        const studioArrangerSubmitClause = studioArrangerPick
          ? (studioArrangerPick === "Photographer Arranges Studio & Lighting (Billed at Actuals)"
              ? ` Where requested, the photographer will instead source and book the studio space and lighting equipment on the Participant's behalf, with the studio space and equipment charges quoted to the Participant in advance and added to the invoice.`
              : ` The Participant will source and book the studio space and any lighting equipment directly, and will share the confirmed venue details with the photographer ahead of the shoot.`)
          : "";
        const venueClause = venueByStudio
          ? `1. SCOPE OF PRODUCTION & VENUE (PROVIDED BY STUDIO)\nThis session is scheduled for studio/location photography production at a venue arranged and paid for by the Studio: ${venueByStudioAddress || "as confirmed with the Studio"}. No studio rental, venue hire or space fee is billed to the Participant for this session. A change of venue requested by the Participant is subject to Studio approval and may reintroduce venue costs, quoted in advance.${homeStudioRider}`
          : `1. SCOPE OF PRODUCTION & VENUE RENTAL POLICY\nThis session is scheduled for studio/location photography production. Package rates cover photography, light design & retouched master deliverables. If a dedicated indoor studio venue space is required, applicable studio rental fees are quoted separately in advance.${studioArrangerSubmitClause}`;
        const contractRefDoc = isCustomContract ? "CUSTOM-CLIENT-CONTRACT-MSA" : (isTfpCat ? "TFP-LIABILITY-RELEASE-V3.6" : "COMMERCIAL-CONTRACT-V3.7");
        // Resolved before the release text below, which now states the fee and
        // the milestones. They previously appeared only in the inquiry email as
        // booking details — so the document the client actually signed said
        // nothing at all about money, the package, or the non-refundable split.
        // Declared before the contract text rather than beside the other venue
        // details further down: the clauses below quote this number, and a
        // const read before its declaration is a crash, not a zero.
        const homeStudioRentalFee = (bookingCalc && bookingCalc.homeStudioFee) || 0;
        // A promo code can hand the venue over free. The waiver is stated
        // explicitly rather than left as a missing line, so the client's record
        // shows what the code was worth and the studio's does too.
        const homeStudioWaivedByPromo = !!(bookingCalc && bookingCalc.promoFreesHomeStudio);
        const homeStudioListPriceVal = (bookingCalc && bookingCalc.homeStudioListPrice) || 0;
        // Same promo code, applied only partially — the rental still costs
        // something, so this reads differently from the fully-waived case above.
        const homeStudioDiscountedByPromo = !!(bookingCalc && bookingCalc.promoDiscountsHomeStudio);
        const homeStudioPromoDiscountAmount = (bookingCalc && bookingCalc.promoHomeStudioAmount) || 0;
        const homeStudioPromoDiscountLabel = (bookingCalc && bookingCalc.promoHomeStudioLabel) || "";
        // An invite code can carry the same kind of rental discount as a promo
        // code — checked separately so the record credits whichever code
        // actually earned it, instead of defaulting to "promo code" wording
        // for a discount an invite gave.
        const homeStudioWaivedByInvite = !!(bookingCalc && bookingCalc.inviteFreesHomeStudio);
        const homeStudioDiscountedByInvite = !!(bookingCalc && bookingCalc.inviteDiscountsHomeStudio);
        const homeStudioInviteDiscountAmount = (bookingCalc && bookingCalc.inviteHomeStudioAmount) || 0;
        const homeStudioInviteDiscountLabel = (bookingCalc && bookingCalc.inviteHomeStudioLabel) || "";
        // Read off bookingCalc, never off updateFields' own locals: those live
        // in a different function, and reaching for one here is the exact
        // ReferenceError that silently killed every booking submit before.
        const promoCodeUsed = (bookingCalc && bookingCalc.enteredDiscount) || "";
        const inviteCodeUsed = (bookingCalc && bookingCalc.enteredCode) || "";
        const is3StepActive = $("#flowchart3Step") && $("#flowchart3Step").style.display !== "none";
        // The studio rental (home or commercial) reserves the venue, so it is
        // due in full alongside the advance retainer rather than split across
        // milestones like the package rate — the document has to say this
        // explicitly, or the total charged on shoot day will not match what
        // was agreed here.
        const rentalUpfrontNote = homeStudioRentalFee > 0
          ? ` The studio rental of ₹${homeStudioRentalFee.toLocaleString('en-IN')} is payable in full as part of the advance retainer, in addition to the package advance above.`
          : "";
        const paymentTermsText = is3StepActive ?
          `Payment Terms: 3-Tier Campaign Milestones (50% Advance Retainer before shoot day start [non-refundable]; 30% Review Milestone after shoot before proofing gallery [non-refundable]; 20% Final Release prior to receiving any downloadable file).${rentalUpfrontNote}` :
          `Payment Terms: Standard 50/50 Milestones (50% Advance Retainer before shoot day start [non-refundable]; 50% Final Balance after shoot wrap prior to receiving any downloadable file [non-refundable]).${rentalUpfrontNote}`;
        // A collaboration carries no shoot fee, but it can still owe the home
        // studio rental — and the document the participant agrees to has to say
        // so, in the same terms the quote showed them.
        const engagementFeeClause = isTfpCat
          ? (homeStudioRentalFee > 0
              ? `\n\n7. HOME STUDIO RENTAL & PAYMENT\nThis collaboration carries no shoot fee. A fixed home studio rental of ₹${homeStudioRentalFee.toLocaleString('en-IN')} applies for use of the photographer's home studio in Noida, and is payable IN FULL at least 48 hours before the shoot day to reserve the space. This rental is non-refundable once paid, including where the Participant cancels or reschedules. No other fee is payable to the Studio for this session.`
              : "")
          : `\n\n7. ENGAGEMENT FEE, SELECTED PACKAGE & PAYMENT MILESTONES\nSelected package and contracted deliverables: ${budget || "as quoted by the Studio"}.\n${paymentTermsText.replace(/^Payment Terms: /, "Payment terms: ")}\nMilestone payments marked non-refundable are non-refundable once paid, including where the Participant cancels or reschedules. Deliverables are released only after the final milestone is cleared. Any work beyond the contracted package (additional retouched masters, extended usage, gallery buyout) is quoted and invoiced separately.`;

        // Test shoots only. A paid booking already carries this risk through its
        // non-refundable retainer; a collaboration pays nothing, so without this
        // a no-show costs the studio a held weekend and nothing else.
        // Numbered off whether the rental clause above is present, since it is
        // omitted on a collaboration with no rental — hardcoding "8" would
        // print a document that jumps from 6 to 8.
        const lateArrivalClause = "\n\n" + window.buildLateArrivalText(isTfpCat, engagementFeeClause ? 8 : 7);

        const tfpReleaseText = agreedToTerms ? (
          `\n\n==================================================\n` +
          `STUDIO PRODUCTION CONTRACT & LEGAL TERMS\n` +
          `${isCustomContract ? 'CUSTOM CLIENT CONTRACT / AGENCY MSA REQUESTED' : (isTfpCat ? 'TFP COLLABORATION & MODEL RELEASE' : 'COMMERCIAL SHOOT PRODUCTION AGREEMENT')}\n` +
          `Document Reference: ${contractRefDoc}\n` +
          `--------------------------------------------------\n` +
          `Studio/Photographer: nerdyphotographer.in\n` +
          `Client/Participant: ${name}\n` +
          `Contact Email: ${email}\n` +
          `Contract Status: ${isCustomContract ? 'Custom Contract / Agency MSA Requested (Pending Studio Review)' : `Agreed to Studio Contract ${contractRefDoc}`}\n` +
          (isCustomContract ? `Custom Contract Notes: ${customContractNotes || 'Client requested custom agency MSA'}\n` : '') +
          `--------------------------------------------------\n\n` +
          (isCustomContract ? 
            `1. CUSTOM CONTRACT / AGENCY MSA REQUEST\nThis shoot request is submitted under a Custom Client Contract / Agency Master Services Agreement (MSA). Studio V3.3 default terms remain subject to custom contract review and mutual alignment prior to shoot day confirmation.\n\n2. CAMERA GEAR & DATA PROTECTION CLAUSE\nAll camera bodies, memory cards, and raw captures remain confidential studio property. Participants may not touch equipment or delete media from cameras.\n` :
            `${venueClause}\n\n2. INTELLECTUAL PROPERTY & USAGE LICENSING\nThe legal copyright of all visual media remains exclusively with the Studio. Clients receive personal, social media, and web self-promotion usage rights.\n\n3. COMPREHENSIVE LIABILITY WAIVER\nParticipant(s) enter the studio workspace and perform physical poses entirely at their own risk.\n\n4. DELIVERABLES, REVISIONS & CLOUD ARCHIVAL\nDeliverables include 1 Round of Minor Revisions (within 7 days). Cloud retention is active for ${isTfpCat ? '3 Months' : '6 Months'}. RAW files are strictly excluded.\n\n5. UNAUTHORIZED CAMERA OPERATION & GEAR PROTECTION\nAll camera gear and memory cards are strictly hands-off.\n\n6. DIGITAL CONSENT & EMAIL ACCEPTANCE\nLegal acceptance is established by submitting this request.${engagementFeeClause}${lateArrivalClause}`
          ) +
          `\n\nnerdyphotographer.in studios\n` +
          `==================================================`
        ) : "";

        // One canonical inquiry body — the copy-paste block gets the full
        // version (release text included). The mailto/Gmail/Outlook links get
        // a COMPACT body without the release: embedding the full release used
        // to blow past browser URL length limits, so for test shoots the mail
        // app silently refused to open at all.
        // (is3StepActive / paymentTermsText are resolved above, alongside the
        // release text, so the contract and the email quote identical terms.)
        const cleanBudget = (budget && budget !== "Not Decided" && budget !== "TBD") ? `Package & Deliverables: ${budget}\n` : "";

        // The studio-space select is hidden on these bookings but keeps its
        // default answer, so reading it verbatim told the studio "client books
        // studio directly" on a shoot where the studio supplies the space.
        // Read from the pricing snapshot rather than the destructure further
        // down: that runs after this block, so naming it here would be a
        // use-before-declaration crash on every submit.
        // House rules for shooting at the photographer's residence apply
        // whether or not a rental is charged for it.
        const homeStudioHouseRules = `Home Studio Policy: This session takes place at the photographer's private residence. Attendance is capped at 3 people in total including yourself and any crew you bring (hair & makeup, stylist, assistants and guests all count towards this cap), sessions run within booked daylight hours and finish by 7:00 PM, and the full address is shared once the booking is confirmed. Guests may not attend unaccompanied.\n`;

        // A rental above zero means the home studio IS the venue, whatever the
        // dropdown says — it is hidden entirely on invite bookings, so keying
        // off it alone described an invited-but-chargeable session as free.
        // An invite can supply a venue that is not the home studio at all, so
        // the venue is named from the booking rather than assumed — billing a
        // rented space as "Home Studio, Noida" leaves the studio's own record
        // describing a shoot that never happened there.
        const inviteVenueName = (bookingCalc && bookingCalc.isValidInvite && bookingCalc.lockedLocation) || "";
        const venueLabel = inviteVenueName || "Home Studio, Noida";
        const studioSpaceVal = (isHomeStudio || homeStudioRentalFee > 0)
          ? (homeStudioRentalFee > 0
              ? `${venueLabel} — provided by the studio, fixed rental ₹${homeStudioRentalFee.toLocaleString('en-IN')} (itemised in the quote)`
              : `${venueLabel} — provided by the studio, no rental billed`)
          : (venueByStudio
              ? `Not required — venue provided by the studio (photographer's invite)`
              : (val("b_studio_space") || 'Not Specified') + (studioArrangerPick
                  ? ` — Arranged by: ${studioArrangerPick === "Photographer Arranges Studio & Lighting (Billed at Actuals)" ? "photographer (studio & lighting quoted in advance)" : "client (client books studio & lighting independently)"}`
                  : ""));
        const studioRentalPolicyNote = (homeStudioRentalFee > 0)
          // A paid home-studio booking is the one case where the studio does
          // charge for its own venue, so the stock "no fee is billed to you"
          // and "billed at actuals" lines would both misstate the quote.
          ? `Studio Rental Policy: This session takes place at the studio's home studio in Noida. A fixed home studio rental of ₹${homeStudioRentalFee.toLocaleString('en-IN')} applies and is itemised in your production quote — nothing further is charged for the venue.\n` +
            homeStudioHouseRules
          : venueByStudio
            ? `Studio Rental Policy: The venue for this session is arranged and paid for by the studio. No venue rental or studio space fee is billed to you for this shoot.\n` +
              (isHomeStudio ? homeStudioHouseRules : ``)
            : `Studio Rental Policy: Package rates cover photography, light design & retouched master deliverables. If a dedicated indoor studio space is required, venue rental fees are quoted separately in advance, or the client may book the studio directly.\n` +
              (studioArrangerSubmitClause ? `Studio Arranger:${studioArrangerSubmitClause}\n` : ``);
        const travelPolicyNote = venueByStudio
          ? `Travel & Accommodation Policy: Travel to the studio-provided venue above is covered by the studio for this invite. If you later request a different location, standard terms apply again (travel beyond 20 km from the studio base in Noida, and accommodation where an overnight stay is needed, billed at actuals).\n`
          : `Travel & Accommodation Policy: Shoots requiring travel beyond 20 km from the studio base (Noida) incur paid travel and, where an overnight stay is needed, accommodation - billed at actuals (at cost).\n`;
        // Paid shoots only: the package buys the photographer, not the crew.
        // Nothing anywhere said so, which left every HMUA/styling/set cost an
        // argument waiting to happen on shoot day.
        // Test shoots need this every bit as much as paid ones: a collaboration
        // covers the photographer's time, never an HMUA or stylist the talent
        // assumed was included.
        const crewCostPolicyNote = (type !== "Selective Collaboration (TFP)")
          ? `Creative Crew & Third-Party Costs: The package rate covers the photographer's creative fee, light design, direction and retouched master deliverables only. If the shoot requires a hair & makeup artist (HMUA), wardrobe stylist, set designer, props / set construction, art direction or any other third-party creative, their charges apply AT ACTUALS (at cost) over and above the package rate. You are free to bring your own crew, or the studio can source them for you — either way the cost is quoted for your approval before the shoot day and nothing is incurred without your confirmation.\n`
          : `Creative Crew & Third-Party Costs: This collaboration covers the photographer's creative fee, light design, direction and the agreed retouched master deliverables only. If the shoot requires a hair & makeup artist (HMUA), wardrobe stylist, set designer, props / set construction, art direction or any other third-party creative, those charges apply AT ACTUALS (at cost) and are borne by the participant. You are free to bring your own crew, or the studio can source them for you — either way the cost is quoted for your approval before the shoot day and nothing is incurred without your confirmation.\n`;
        const deliverablePolicyNote = `RAW Files & Deliverables Policy: Includes proofing gallery + contracted retouched master limit. Requesting the complete full unedited image gallery or extra retouched master clicks beyond the package limit incurs additional gallery buyout fees. RAW unedited camera files remain confidential studio property.\n`;
        const gearPolicyNote = `Camera & Media Policy: All cameras, memory cards, and raw captures are strictly hands-off. Participants may not touch equipment or delete media from cameras. Deleting files constitutes a material breach of contract and incurs full data recovery costs.\n`;

        const compactBody =
          `Shoot Booking Details:\n\n` +
          `Name: ${name}\n` +
          `Role: ${role}\n` +
          `Email: ${email}\n` +
          `Phone: ${phone || '—'}\n` +
          `Instagram / Website: ${instagram || '—'}\n` +
          `Shoot Type: ${type}\n` +
          `Proposed Date: ${date}\n` +
          (dateAlreadyBooked ? `⚠️ Date Status: This date already has a booking on the calendar — decide whether to confirm anyway or suggest an alternative.\n` : "") +
          `Session Duration: ${sessionDuration || '—'}\n` +
          `Location Pref: ${locationVal}\n` +
          `Studio Space Rental: ${studioSpaceVal}\n` +
          studioRentalPolicyNote +
          travelPolicyNote +
          cleanBudget +
          (homeStudioRentalFee > 0
            ? (homeStudioDiscountedByPromo
                ? `Home Studio Rental (add-on): ₹${homeStudioRentalFee.toLocaleString('en-IN')} — ${homeStudioPromoDiscountLabel} with promo code ${promoCodeUsed} applied (normally ₹${homeStudioListPriceVal.toLocaleString('en-IN')})\n` +
                  `Total Savings: ₹${(((bookingCalc && bookingCalc.savings) || 0) + homeStudioPromoDiscountAmount).toLocaleString('en-IN')} (promo discount + home studio discount)\n`
                : homeStudioDiscountedByInvite
                  ? `Home Studio Rental (add-on): ₹${homeStudioRentalFee.toLocaleString('en-IN')} — ${homeStudioInviteDiscountLabel} with invite code ${inviteCodeUsed} applied (normally ₹${homeStudioListPriceVal.toLocaleString('en-IN')})\n` +
                    `Total Savings: ₹${homeStudioInviteDiscountAmount.toLocaleString('en-IN')} (home studio discount via invite code)\n`
                  : `Home Studio Rental (add-on): ₹${homeStudioRentalFee.toLocaleString('en-IN')}\n`)
            : (homeStudioWaivedByPromo
                ? `Home Studio Rental (add-on): ₹0 — complimentary with promo code ${promoCodeUsed} (normally ₹${homeStudioListPriceVal.toLocaleString('en-IN')})\n` +
                  `Total Savings: ₹${(((bookingCalc && bookingCalc.savings) || 0) + homeStudioListPriceVal).toLocaleString('en-IN')} (promo discount + complimentary home studio)\n`
                : homeStudioWaivedByInvite
                  ? `Home Studio Rental (add-on): ₹0 — complimentary with invite code ${inviteCodeUsed} (normally ₹${homeStudioListPriceVal.toLocaleString('en-IN')})\n` +
                    `Total Savings: ₹${homeStudioListPriceVal.toLocaleString('en-IN')} (complimentary home studio via invite code)\n`
                  : "")) +
          (type !== "Selective Collaboration (TFP)"
            ? `${paymentTermsText}\n`
            : (homeStudioRentalFee > 0
                ? `Payment Terms: No shoot fee applies to this collaboration. The home studio rental of ₹${homeStudioRentalFee.toLocaleString('en-IN')} is payable IN FULL at least 48 hours before the shoot day to reserve the space (non-refundable once paid). Nothing else is payable to the studio.\n`
                : "")) +
          crewCostPolicyNote +
          deliverablePolicyNote +
          gearPolicyNote +
          `Moodboard Link: ${moodboard || '—'}\n` +
          (agreedToTerms ? `Contract Agreement: ${name} has agreed to ${contractRefDoc} in full, without modifications. By sending this email the client confirms acceptance of all studio terms and conditions.\nContract Reference: ${contractRefDoc}\nSignature Captured: ${sigDataUrl ? 'Yes' : 'No'}\nRead terms online: https://www.nerdyphotographer.in/book/${isTfpCat ? '#tfp-terms' : '#terms'}\n\n` : `\n`) +
          `Concept/Vision:\n${concept || '—'}`;
        const inquiryBody = compactBody + tfpReleaseText;
        const plainTextBody = `To: ${studioEmail}\nSubject: Shoot Booking Request — ${name}\n\n` + inquiryBody;

        const subject = encodeURIComponent(isCustomContract ? `Shoot Booking Request (CUSTOM CONTRACT REQUESTED) — ${name}` : `Shoot Booking Request — ${name}`);
        const body = encodeURIComponent(compactBody);

        // A mailto: URL is handed to the operating system, not to the browser,
        // and Windows/Outlook silently truncate or refuse anything past ~2,000
        // characters — the full brief encodes to ~2,700, which is why the mail
        // app kept opening blank or not at all. Gmail/Outlook web, the relay
        // and the copy block all still carry the full text including every
        // policy clause; only the mailto: link is trimmed, and only when the
        // full body would not have survived the handoff anyway.
        const MAILTO_SAFE_LEN = 1900;
        const buildMailto = (b) => `mailto:${studioEmail}?subject=${subject}&body=${encodeURIComponent(b)}`;
        const mailtoShortBody =
          `Shoot Booking Details:\n\n` +
          `Name: ${name}\n` +
          `Role: ${role}\n` +
          `Email: ${email}\n` +
          `Phone: ${phone || '—'}\n` +
          `Instagram / Website: ${instagram || '—'}\n` +
          `Shoot Type: ${type}\n` +
          `Proposed Date: ${date}\n` +
          (dateAlreadyBooked ? `⚠️ Date Status: This date already has a booking on the calendar — decide whether to confirm anyway or suggest an alternative.\n` : "") +
          `Session Duration: ${sessionDuration || '—'}\n` +
          `Location Pref: ${locationVal}\n` +
          `Studio Space Rental: ${studioSpaceVal}\n` +
          cleanBudget +
          `Moodboard Link: ${moodboard || '—'}\n` +
          (agreedToTerms
            ? `Contract Agreement: ${name} has agreed to ${contractRefDoc} in full, without modifications. By sending this email the client confirms acceptance of all studio terms and conditions.\nContract Reference: ${contractRefDoc}\nSignature Captured: ${sigDataUrl ? 'Yes' : 'No'}\n`
            : ``) +
          `Studio Policies (studio rental, travel & accommodation, deliverables & RAW files, camera & media, payment terms): read and accepted in full — https://www.nerdyphotographer.in/book/${isTfpCat ? '#tfp-terms' : '#terms'}\n\n` +
          `Concept/Vision:\n${concept || '—'}`;

        let mailtoUrl = buildMailto(compactBody);
        if (mailtoUrl.length > MAILTO_SAFE_LEN) mailtoUrl = buildMailto(mailtoShortBody);
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(studioEmail)}&su=${subject}&body=${body}`;
        const outlookUrl = `https://outlook.live.com/default.aspx?rru=compose&to=${encodeURIComponent(studioEmail)}&subject=${subject}&body=${body}`;

        const contractNumber = agreedToTerms ? generateContractNumber() : "";

        // Gather complete metadata for Admin DB & Audit Vault. The invite,
        // promo and pricing values come from the snapshot updateFields keeps
        // current — they are not in this function's scope.
        const {
          enteredCode, matchedInvite, isValidInvite, lockedLocation,
          enteredDiscount, matchedDiscount, discountTagText,
          basePrice, homeStudioFee, savings, finalPayable
        } = bookingCalc;

        const inviteMeta = (isValidInvite && matchedInvite && typeof matchedInvite === "object") ? {
          code: matchedInvite.code,
          desc: matchedInvite.desc || "Photographer Direct Unlock",
          lockedLocation: lockedLocation || ""
        } : (enteredCode ? { code: enteredCode, desc: "Direct Invite", lockedLocation: "" } : null);

        const promoMeta = (matchedDiscount) ? {
          code: enteredDiscount,
          tag: discountTagText,
          savings: savings
        } : null;

        // A collaboration can still owe the home studio rental, so it no longer
        // records a flat zero. The rental reserves the space and is due in full
        // before the shoot, so it is booked as the retainer with no wrap
        // balance — a 50/50 split on a rental is not what the client agreed to.
        const financialSummary = (type !== "Selective Collaboration (TFP)" && !isValidInvite) ? (() => {
          // The studio rental reserves the venue, so — like a collaboration's
          // rental — it is due in full up front rather than split across
          // both milestones; only the package rate itself is divided 50/50.
          const packageNet = Math.max(0, finalPayable - (homeStudioFee || 0));
          const advance = Math.round(packageNet / 2) + (homeStudioFee || 0);
          return {
            basePrice: basePrice,
            homeStudioFee: homeStudioFee || 0,
            savings: savings,
            finalPayable: finalPayable,
            advanceRetainer: advance,
            wrapBalance: finalPayable - advance
          };
        })() : {
          basePrice: 0,
          homeStudioFee: homeStudioRentalFee,
          savings: 0,
          finalPayable: homeStudioRentalFee,
          advanceRetainer: homeStudioRentalFee,
          wrapBalance: 0
        };

        async function recordContractAudit(payload) {
          saveLocalContractAudit({
            contractNumber: payload.contractNumber,
            clientName: payload.clientName,
            clientEmail: payload.clientEmail,
            clientPhone: payload.phone || "",
            instagram: payload.instagram || "",
            contractVersion: payload.contractVersion,
            date: payload.date,
            shootType: payload.shootType,
            timestamp: new Date().toISOString(),
            sigCaptured: !!payload.sigDataUrl,
            agreementMethod: payload.agreementMethod || (payload.sigDataUrl ? "signature" : ""),
            isCustomContract: payload.isCustomContract || false,
            customContractNotes: payload.customContractNotes || "",
            inviteMeta: payload.inviteMeta || null,
            promoMeta: payload.promoMeta || null,
            financials: payload.financials || null,
            notes: payload.notes
          });

          try {
            await fetch(`${COMP_CARD_API_BASE}/api/contracts/audit`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });
          } catch (err) {
            console.warn("Contract audit sync failed:", err);
          }
        }

        // GUARANTEED INSTANT SAVE: Record the booking and contract acceptance
        // into local storage / DB immediately when the client confirms, BEFORE
        // running email relays or opening mail app links.
        if (contractNumber || agreedToTerms) {
          const auditNotesStr = [
            `Location: ${locationVal || "Not Specified"}`,
            `Budget: ${budget || "TBD"}`,
            inviteMeta ? `Invite Code: ${inviteMeta.code} (${inviteMeta.desc})` : null,
            promoMeta ? `Promo Code: ${promoMeta.code} (${promoMeta.tag})` : null,
            financialSummary.homeStudioFee > 0 ? `Home Studio Rental: ₹${financialSummary.homeStudioFee.toLocaleString('en-IN')}` : null,
            financialSummary.finalPayable > 0 ? `Payable: ₹${financialSummary.finalPayable.toLocaleString('en-IN')} (Retainer: ₹${financialSummary.advanceRetainer.toLocaleString('en-IN')}, Balance: ₹${financialSummary.wrapBalance.toLocaleString('en-IN')})` : `Category: TFP / Collab ($0)`
          ].filter(Boolean).join(" | ");

          recordContractAudit({
            contractNumber: contractNumber || generateContractNumber(),
            clientName: name,
            clientEmail: email,
            phone,
            instagram,
            date,
            location: locationVal,
            shootType: type,
            contractVersion: contractRefDoc,
            sigDataUrl: sigDataUrl || "",
            agreementMethod: agreementMethod || (sigDataUrl ? "signature" : ""),
            isCustomContract: isCustomContract,
            customContractNotes: customContractNotes,
            inviteMeta: inviteMeta,
            promoMeta: promoMeta,
            financials: financialSummary,
            notes: auditNotesStr
          });

          // Auto-save booking into Studio Calendar DB immediately
          if (date) {
            const rawParts = date.split(/[,–]/).map(s => s.trim()).filter(Boolean);
            rawParts.forEach(pStr => {
              const dObj = new Date(pStr);
              if (!isNaN(dObj.getTime())) {
                const dKey = getCalDateKey(dObj);
                addCalBooking(dKey, {
                  name,
                  email,
                  phone,
                  type,
                  duration: sessionDuration,
                  links: typeof getFormLinks === "function" ? getFormLinks() : [],
                  attachments: typeof attachedFiles !== "undefined" ? attachedFiles : [],
                  sigDataUrl: sigDataUrl || "",
                  agreementMethod: agreementMethod || (sigDataUrl ? "signature" : ""),
                  agreedContract: contractRefDoc,
                  venueByStudio,
                  location: locationVal,
                  notes: concept,
                  budget,
                  homeStudioFee: financialSummary.homeStudioFee,
                  finalPayable: financialSummary.finalPayable,
                  contractVersion: contractRefDoc,
                  agreedToTerms: true,
                  isCustomContract,
                  customContractNotes,
                  contractNumber: contractNumber || "",
                  inviteMeta,
                  promoMeta,
                  financials: financialSummary,
                  isTentative: false,
                  status: "confirmed"
                });
              }
            });
          }
        }

        // Populate manual link and copy block
        const mailtoLink = $("#bookMailtoLink");
        if (mailtoLink) mailtoLink.href = mailtoUrl;

        const gmailLink = $("#bookGmailLink");
        if (gmailLink) gmailLink.href = gmailUrl;

        const outlookLink = $("#bookOutlookLink");
        if (outlookLink) outlookLink.href = outlookUrl;

        const previewText = $("#inquiryTextPreview");
        if (previewText) previewText.textContent = plainTextBody;

        // Reveal the in-page success state with the right message for how the
        // inquiry actually went out. `mode` is one of:
        //   "sent"   — the relay delivered it; the visitor is done.
        //   "gmail"  — nothing sent yet; a pre-filled Gmail tab is open.
        //   "manual" — nothing sent yet; the visitor must pick a send button.
        // Only "sent" is allowed to look like a completed request — showing a
        // green tick when the mail still has to be sent is what left clients
        // thinking they had booked when the studio had received nothing.
        const showSuccess = (mode) => {
          const sentDirectly = mode === "sent";
          // The booking itself was already written to the calendar store by
          // the instant-save block above — recording it again here doubled
          // every agreed booking on the device (two slots per date).
          if (date) updateAdminReminders();

          if (successPanel) {
            form.hidden = true;
            successPanel.hidden = false;

            const iconEl = $("#bookSuccessIcon");
            if (iconEl) {
              iconEl.innerHTML = sentDirectly
                ? `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`
                : `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>`;
            }

            const headingEl = $("#bookSuccessHeading");
            if (headingEl) {
              headingEl.textContent = sentDirectly
                ? "Request sent."
                : (mode === "gmail" ? "One last step — press Send." : "One last step — pick how to send.");
            }

            const releaseNote = agreedToTerms
              ? `<br/><br/><strong style="color: var(--accent);">Terms Agreed:</strong> Your acceptance of <em>${esc(contractRefDoc)}</em>${contractNumber ? ` (${esc(contractNumber)})` : ""} has already been recorded with the studio — that part is done regardless of the email below.`
              : "";

            const msgEl = $("#bookSuccessMsg");
            if (msgEl) {
              if (sentDirectly) {
                msgEl.innerHTML = `<strong style="color: var(--accent);">Request sent!</strong> Your booking inquiry has been delivered straight to the studio — no further action needed. We'll reply to <strong>${esc(email)}</strong>.` +
                  releaseNote +
                  `<br/><br/><span style="opacity: 0.8;">Want a copy for your own records? The buttons below open the same inquiry in your email app.</span>`;
              } else if (mode === "gmail") {
                msgEl.innerHTML = `We've opened your inquiry, already filled in, in a <strong>new Gmail tab</strong> — switch to it and press <strong>Send</strong> to finish. <span style="opacity: 0.8;">Nothing has reached the studio until you do.</span>` +
                  releaseNote +
                  `<br/><br/><span style="opacity: 0.8;">Don't see that tab, or don't use Gmail? Any button below sends the same inquiry, or copy the text and mail it yourself.</span>`;
              } else {
                msgEl.innerHTML = `Your inquiry is ready to send — <strong>choose one of the buttons below</strong> and press Send in whichever app opens. <span style="opacity: 0.8;">Nothing has reached the studio until you do.</span>` +
                  releaseNote +
                  `<br/><br/><span style="opacity: 0.8;">Prefer to do it yourself? Copy the text at the bottom and email it to <strong>${esc(studioEmail)}</strong>.</span>`;
              }
            }
            successPanel.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "center" });
          }
          btn.disabled = false;
          btn.classList.remove("is-loading");
          // Restore the type-appropriate label (updateFields sets this same
          // pair) rather than always falling back to the non-Test-Shoot text.
          btn.textContent = (type === "Selective Collaboration (TFP)" ? "Request for a Test Shoot" : "Submit Booking Request");
        };

        // Deliver the inquiry directly to the studio inbox via FormSubmit
        // (free relay — needs a one-time activation click in the studio's
        // email the first time it's used). If the relay is unreachable or
        // rejects, fall back to opening the visitor's mail app pre-filled.
        const relayFields = {
          _subject: `Shoot Booking Request — ${name}`,
          _replyto: email,
          _template: "box",
          "Name": name,
          "Role": role,
          "Email": email,
          "Phone": phone || "—",
          "Instagram / Website": instagram || "—",
          "Shoot Type": type,
          "Proposed Date": date,
          "Session Duration": sessionDuration || "—",
          "Location Pref": locationVal,
          "Studio Space": studioSpaceVal || "—",
          "Budget Range": budget,
          // The rental and the resulting total are what the client just agreed
          // to pay. Without them the studio's own copy of the booking gave no
          // hint a rental was owed, so there was nothing to invoice against.
          "Studio / Venue Charge": homeStudioRentalFee > 0
            ? `₹${homeStudioRentalFee.toLocaleString('en-IN')} — ${venueLabel} (payable in full before the shoot)`
            : "Not applicable",
          "Total Payable": financialSummary.finalPayable > 0
            ? `₹${financialSummary.finalPayable.toLocaleString('en-IN')}`
            : (type === "Selective Collaboration (TFP)" ? "₹0 — TFP collaboration" : "—"),
          "Moodboard Link": moodboard || "—",
          "Concept / Vision": concept || "—",
          "TFP Release": agreedToTerms ? `AGREED — ${contractRefDoc} (full text below)` : "Not applicable",
        };
        if (agreedToTerms) relayFields["Release Full Text"] = tfpReleaseText.trim();

        // The signed-contract email is an independent channel from the inquiry
        // relay — it goes out however the inquiry itself ends up travelling —
        // but it is queued to run AFTER the relay settles rather than beside
        // it: FormSubmit rate-limits per IP, so firing both (plus the
        // attachment retry) at once made them knock each other out.
        let contractRecordSent = false;
        const sendContractRecord = () => {
          if (!agreedToTerms) return;
          // Fires from the optimistic path AND from the fallback, so it has to
          // be idempotent — otherwise a failed relay mails the studio and the
          // client a duplicate copy of the same signed contract.
          if (contractRecordSent) return;
          contractRecordSent = true;
          sendSignedContractEmail({
            clientName: name,
            clientEmail: email,
            phone,
            instagram,
            date,
            location: locationVal,
            shootType: type,
            contractVersion: contractRefDoc,
            contractNumber,
            contractText: tfpReleaseText.trim(),
            sigDataUrl: sigDataUrl || "",
            agreementMethod: agreementMethod || (sigDataUrl ? "signature" : ""),
            notes: `Location: ${locationVal} | Budget: ${budget}`
          }).then((sent) => setContractEmailStatus(contractNumber, sent ? "sent" : "failed"));
        };

        // Relay failed, so nothing has been sent yet. Gmail web is the first
        // fallback: it has none of mailto:'s length limits and needs no mail
        // handler registered on the device. It can still be swallowed by a
        // pop-up blocker (the await above spent the click's user gesture), so
        // the return value decides which panel the visitor sees. What we no
        // longer do is assign window.location — that navigated the visitor's
        // own tab at a mailto: URL, which on a desktop with no mail client
        // set up is a dead end that also killed the in-flight contract email.
        const openGmailCompose = () => {
          try {
            const win = window.open(gmailUrl, "_blank");
            if (!win || win.closed || typeof win.closed === "undefined") return false;
            try { win.focus(); } catch (e) {}
            return true;
          } catch (e) {
            return false;
          }
        };

        const finishWithFallback = () => {
          showSuccess(openGmailCompose() ? "gmail" : "manual");
          sendContractRecord();
        };

        // INSTANT UI RESPONSE: show the success state immediately (0ms delay).
        // The booking and contract audit are ALREADY saved to the Admin DB
        // above, so the request is genuinely captured at this point and the
        // client does not have to wait on the network to be told so.
        showSuccess("sent");
        sendContractRecord();

        // ...but the relay still has to be checked. FormSubmit reports soft
        // failures (an unactivated form, rate limiting) as HTTP 200 with
        // success:"false", so neither res.ok nor "the fetch didn't throw" means
        // delivered. Announcing success unconditionally told clients "delivered
        // straight to the studio — no further action needed" on bookings that
        // never arrived, with the recovery path left unreachable.
        //
        // So: stay optimistic, then correct course if the relay disagrees. The
        // client keeps the instant response; a failure quietly turns it into
        // "one more step" with the Gmail / mail-app buttons, instead of a
        // cheerful message about an email nobody received.
        const relayAbort = new AbortController();
        const relayTimer = setTimeout(() => relayAbort.abort(), 15000);

        fetch(`https://formsubmit.co/ajax/${encodeURIComponent(studioEmail)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(relayFields),
          signal: relayAbort.signal
        })
        .then(async (res) => {
          clearTimeout(relayTimer);
          const body = await res.json().catch(() => null);
          const relayOk = res.ok && !!body && (body.success === true || body.success === "true");
          if (relayOk) return;                       // optimistic message was right
          console.warn("Booking relay rejected:", (body && body.message) || res.statusText);
          finishWithFallback();                      // downgrade to "one more step"
        })
        .catch((err) => {
          clearTimeout(relayTimer);
          if (err && err.name === "AbortError") console.warn("Booking relay timed out");
          else console.warn("Booking relay unreachable:", err && err.message);
          finishWithFallback();
        });
      };

      if (type === "Selective Collaboration (TFP)") {
        openTermsModal(name, "TFP", (agreed, isCustom, notes, sigUrl, method) => proceedSubmit(agreed, "TFP", isCustom, notes, sigUrl, method));
      } else {
        openTermsModal(name, "Commercial", (agreed, isCustom, notes, sigUrl, method) => proceedSubmit(agreed, "Commercial", isCustom, notes, sigUrl, method));
      }
    };

    if (form) form.addEventListener("submit", handleBookingSubmit);
    if (btn) btn.addEventListener("click", handleBookingSubmit);

    // Open the terms modal for `partnerName` and `shootCategory` ("TFP" vs "Commercial").
    function openTermsModal(partnerName, shootCategory, onAccept) {
      const isTfp = shootCategory === "TFP";
      const modalTitle = $("#termsModalTitle");
      const modalTag = $("#termsModalTag");
      const partnerNameEl = $("#terms_partner_name");
      const sec4Text = $("#termsSec4Text");
      const customWrap = $("#customContractOptionWrap");
      const customBtn = $("#termsCustomBtn");
      const customInput = $("#customContractNotesInput");
      const declineBtn = $("#termsDeclineBtn");

      if (customWrap) customWrap.style.display = "none";
      if (customInput) customInput.value = "";
      const agreeCheckbox = $("#termsAgreeCheckbox");
      if (agreeCheckbox) agreeCheckbox.checked = false;
      if (customBtn) {
        customBtn.textContent = "📝 Request Custom Contract";
        customBtn.style.display = isTfp ? "none" : "inline-flex"; // Hide custom contract for fixed TFP collaborations
      }

      if (modalTitle) modalTitle.textContent = isTfp ? "Studio Production & Liability Release" : "Commercial Shoot Contract & Production Agreement";
      if (modalTag) modalTag.textContent = isTfp ? "TFP-LIABILITY-RELEASE-V3.6 (ACTIVE)" : "COMMERCIAL-CONTRACT-V3.7 (ACTIVE)";
      // The grace-period clause is a test-shoot term only. It has to be toggled
      // on every open, not just hidden by default: the modal element persists
      // across bookings, so a commercial enquiry opened after a TFP one would
      // otherwise still be showing it.
      const versionLabel = $("#termsAgreeVersionLabel");
      if (versionLabel) versionLabel.textContent = `Studio Terms & Conditions (${isTfp ? "Version V3.6" : "Version V3.7"})`;
      const lateArrivalSection = $("#termsLateArrivalSection");
      if (lateArrivalSection) {
        // Applies to both kinds now, on different terms — a paid client gets
        // three hours against a collaboration's one. Rebuilt on every open
        // because the modal element outlives the booking that filled it.
        lateArrivalSection.innerHTML = window.buildLateArrivalHtml(isTfp, 9);
        lateArrivalSection.style.display = "block";
      }
      if (partnerNameEl) partnerNameEl.textContent = partnerName || "Valued Client";
      
      // This is the screen the signature is actually captured on, so it is the
      // last place that can be left contradicting the form. On an invite that
      // supplies the venue, the stock "locations >20 km require client-funded
      // travel" / "venue rentals billed at actuals" lines are the opposite of
      // what the visitor was just shown.
      const modalIsHomeStudio = $("#b_studio_space")?.value === "Home Studio - Noida (Provided by Studio)";
      const modalVenueByStudio = $("#b_location")?.dataset.inviteLocked === "1" || modalIsHomeStudio;
      const modalVenueAddress = modalVenueByStudio ? ($("#b_location")?.value || "") : "";
      const modalHomeRider = modalIsHomeStudio
        ? ` <strong>Home studio sessions</strong> take place at the photographer's private residence: attendance is capped at 3 people in total including you and any crew you bring — hair &amp; makeup, stylist, assistants and guests all count towards this cap, the session runs within booked daylight hours and finishes by <strong>7:00 PM</strong>, and the full address is shared once your booking is confirmed. Guests may not attend unaccompanied.`
        : "";
      // A paid home-studio booking now carries a fixed rental, so the blanket
      // "no studio rental is billed to you" would contradict the quote the
      // client is looking at while they tick this box.
      const modalHomeStudioFee = (modalIsHomeStudio && bookingCalc && bookingCalc.homeStudioFee) || 0;
      const venueSentence = modalHomeStudioFee > 0
        ? ` This session takes place at the Studio's home studio in Noida${modalVenueAddress ? ` (<strong>${esc(modalVenueAddress)}</strong>)` : ""}. A fixed home studio rental of <strong>₹${modalHomeStudioFee.toLocaleString("en-IN")}</strong> applies and is itemised in your quote — nothing further is charged for the venue, and no travel cost is charged for it.${modalHomeRider}`
        : modalVenueByStudio
        ? ` The shoot venue${modalVenueAddress ? ` (<strong>${esc(modalVenueAddress)}</strong>)` : ""} is arranged and paid for by the Studio — no studio rental, venue hire or travel cost is billed to you for it. Requesting a different location later re-applies the standard venue and travel terms.${modalHomeRider}`
        : (isTfp
            ? ` Locations &gt;20 km from Noida require client-funded travel, conveyance &amp; accommodation.`
            : ` Dedicated indoor studio venue rentals are <strong>quoted separately in advance</strong>.`);

      if (sec4Text) {
        sec4Text.innerHTML = isTfp
          ? `As a creative collaboration, test shoots (TFP collabs) include <strong>${esc(getAdminTfpPackage().specs)}</strong>. Deliverables include 1 Round of Minor Revisions (within 7 days). Cloud retention is active for 3 Months (90 days). The Studio retains final artistic authority over image selection and editing styles.${venueSentence} Under no circumstances will raw unedited files (RAW format) be delivered.`
          : `Commercial productions include a <strong>Full Proofing Gallery + contracted retouched master deliverables</strong> specified in the rate tier. Deliverables include 1 Round of Minor Revisions (within 7 days). Cloud retention is active for 6 Months (180 days). Extended usage licensing or RAW file access requires separate buyout agreements.${venueSentence} Payment terms follow 50/50 non-refundable milestone payments.`;
      }

      $("#termsModal").style.display = "flex";
      const acceptBtn = $("#termsAcceptBtn");

      // Agreement is captured by the checkbox above. The drawn-signature
      // canvas that used to live here was removed by request: signing with a
      // finger or stylus is fiddly for many clients, and the tick-box is now
      // the studio's permanent mechanism. Bookings recorded before the change
      // still hold a real signature image and are still rendered as one.

      const close = () => {
        $("#termsModal").style.display = "none";
        if (acceptBtn) acceptBtn.removeEventListener("click", onAcceptClick);
        if (customBtn) customBtn.removeEventListener("click", onCustomClick);
        if (declineBtn) declineBtn.removeEventListener("click", onDeclineClick);
      };

      const onAcceptClick = () => {
        const checkbox = $("#termsAgreeCheckbox");
        if (checkbox && !checkbox.checked) {
          alert("Please check the box to agree to the terms and continue!");
          return;
        }
        close();
        // The signature slot carries an image data URL or nothing at all. It
        // used to receive the string "DIGITALLY_ACCEPTED_VIA_CHECKBOX", which
        // three admin views then fed straight into <img src>; the browser
        // resolved it as a relative path, 404'd, and the global image-error
        // handler replaced it with the "image unavailable" placeholder. How the
        // client agreed now travels in its own argument instead.
        if (onAccept) onAccept(true, false, "", "", "checkbox");
      };

      const onDeclineClick = () => {
        close();
      };

      const onCustomClick = () => {
        if (customWrap && customWrap.style.display === "none") {
          customWrap.style.display = "block";
          customInput?.focus();
          customBtn.textContent = "Submit with Custom Contract Request ✓";
        } else {
          const notes = customInput?.value.trim() || "Client requested custom contract / agency MSA";
          close();
          if (onAccept) onAccept(true, true, notes, "", "checkbox");
        }
      };

      if (acceptBtn) acceptBtn.addEventListener("click", onAcceptClick);
      if (declineBtn) declineBtn.addEventListener("click", onDeclineClick);
      if (customBtn) customBtn.addEventListener("click", onCustomClick);
    }

    // Wire copy button
    // Copy is the last resort when every mail route has failed, so it must not
    // claim success it didn't achieve: navigator.clipboard is unavailable on
    // insecure origins and rejects when permission is denied, which used to
    // still flash "Copied! ✓" over an empty clipboard.
    $("#copyInquiryBtn")?.addEventListener("click", async () => {
      const txt = $("#inquiryTextPreview")?.textContent || "";
      const btnEl = $("#copyInquiryBtn");
      const orig = btnEl ? btnEl.textContent : "";
      const flash = (label) => {
        if (!btnEl) return;
        btnEl.textContent = label;
        setTimeout(() => { btnEl.textContent = orig; }, 2200);
      };

      const legacyCopy = () => {
        try {
          const ta = document.createElement("textarea");
          ta.value = txt;
          ta.setAttribute("readonly", "");
          ta.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;";
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(ta);
          return ok;
        } catch (e) {
          return false;
        }
      };

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(txt);
          flash("Copied! ✓");
        } else {
          flash(legacyCopy() ? "Copied! ✓" : "Press and hold the text to copy");
        }
      } catch (e) {
        flash(legacyCopy() ? "Copied! ✓" : "Press and hold the text to copy");
      }
    });

    // Wire the terms trigger link
    $("#tfpTermsTrigger")?.addEventListener("click", (e) => {
      e.preventDefault();
      openTermsModal($("#b_name")?.value || "Creative Partner", "TFP");
    });

    // Check if loaded with Hash link
    if (location.hash === "#tfp-terms") {
      openTermsModal("Creative Partner", "TFP");
    }

    // "Send another request" — reset back to a clean form.
    $("#bookAnother")?.addEventListener("click", () => {
      form.reset();
      ["b_name", "b_email", "b_date"].forEach(clearError);
      if (successPanel) successPanel.hidden = true;
      form.hidden = false;
      form.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" });
      updateFields();
    });
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

    // One share affordance for both card layouts. Prefers the OS share sheet,
    // because this is mostly pressed on a phone to send a model their own
    // card over WhatsApp, and falls back to the clipboard and then to a
    // prompt — clipboard access needs a secure context and can be refused,
    // and the old handler's only answer to that was "Failed to copy link".
    function wireShareButton(btn, album) {
      if (!btn || !album) return;
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const url = shareUrlFor(album);
        const title = getTalentCleanName(album.isCompCard ? album.talent : (album.title || "Album"));
        if (navigator.share) {
          try {
            await navigator.share({ title, url });
            return;
          } catch (err) {
            // AbortError means the sheet opened and was dismissed on purpose;
            // anything else means it never opened, so fall through.
            if (err && err.name === "AbortError") return;
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          toast("Link copied to clipboard");
        } catch {
          prompt("Copy this album link:", url);
        }
      });
    }

    // noth.in full-bleed work cards → open the shoot in the lightbox.
    view.querySelectorAll(".noth-work").forEach((card) => {
      const s = CURRENT_VIEW_SHOOTS.find((x) => x.id === card.dataset.shoot) || SHOOTS.find((x) => x.id === card.dataset.shoot);
      if (!s) return;
      const isCc = qualifiesAsCompCard(s) && isCurrentlyCompCardView();
      const list = s.photos.filter((p) => !(isCc && p.excludeFromCompCard)).map((p) => ({ ...p, shoot: s }));
      const media = card.querySelector(".noth-work-media");
      const cta = card.querySelector(".noth-work-cta");
      const open = () => openLb(list, 0);
      media?.addEventListener("click", open);
      cta?.addEventListener("click", open);

      wireShareButton(card.querySelector(".work-share"), s);

      // Wire admin edit & delete buttons
      card.querySelectorAll(".work-edit").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          history.pushState(null, "", `/upload?edit=${s.id}`);
          render();
        });
      });
      card.querySelector(".work-delete")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete the photoshoot "${s.title || s.talent}"?`)) {
          await delShoot(s.id);
          await loadShoots();
          toast(`Deleted "${s.title || s.talent}".`);
          render();
          await syncToGitHub(SHOOTS, { deletedIds: [s.id] });
        }
      });

      // Dynamic padding: if the cover's orientation clashes with the 16:9 frame,
      // contain the image (show it whole) over a blurred fill instead of cropping.
      const img = media?.querySelector("img");
      if (img) {
        const evaluateFit = () => {
          const nw = img.naturalWidth, nh = img.naturalHeight;
          if (!nw || !nh) return;
          const imgRatio = nw / nh;
          // A landscape cover claims two columns and a 3:2 frame; everything
          // else keeps the portrait cell. Set before measuring the frame below,
          // since it changes the frame's own shape.
          // Nothing is known about a photo until it has loaded — data.js stores
          // no dimensions — so the tile starts portrait, which is right for 94%
          // of this library, and only the rare wide cover reflows.
          const card = media.closest(".noth-work");
          if (card) card.classList.toggle("is-landscape", imgRatio > 1.05);
          // A tile that is not laid out yet measures zero, and a 16/9 guess
          // off the back of that reads as a mismatch against every portrait,
          // switching the blurred fill on for no reason.
          if (!media.clientWidth || !media.clientHeight) return;
          const frameRatio = media.clientWidth / media.clientHeight;
          // Whatever is left over after the frame has adapted: a cover whose
          // shape still cannot be matched is contained over the blurred fill
          // rather than cropped.
          const mismatch = Math.abs(imgRatio - frameRatio) / frameRatio > 0.35;
          media.classList.toggle("fit-contain", mismatch);
          if (mismatch) {
            const isPortrait = imgRatio < 1;
            media.classList.toggle("fit-portrait", isPortrait);
            media.classList.toggle("fit-landscape", !isPortrait);
          } else {
            media.classList.remove("fit-portrait", "fit-landscape");
          }
        };
        if (img.complete) evaluateFit();
        img.addEventListener("load", evaluateFit, { once: true });
      }
    });

    // work-block interactions (open lightbox on media or "View project")
    view.querySelectorAll(".work-block").forEach((block) => {
      const s = CURRENT_VIEW_SHOOTS.find((x) => x.id === block.dataset.shoot) || SHOOTS.find((x) => x.id === block.dataset.shoot);
      if (!s) return;
      const isCc = qualifiesAsCompCard(s) && isCurrentlyCompCardView();
      const isPortView = (s.isCompCard || s.type === "Selective Collaboration (TFP)" || s.type === "Test Shoot") && isCurrentlyModelPortfolioView();
      // On the Model Portfolio page this used to fall through to "include
      // everything" (isCc is false there, since isCurrentlyCompCardView()
      // only matches the Comp Cards view) — so opening the lightbox showed
      // comp-only photos too, until the angle filter was clicked and rebuilt
      // the list with this same portfolio-usage rule.
      const list = s.photos.filter((p) => {
        if (isCc) return !p.excludeFromCompCard;
        if (isPortView) return p.usage === "portfolio" || p.usage === "both" || p.usage === undefined;
        return true;
      }).map((p) => ({ ...p, shoot: s }));
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
      wireShareButton(block.querySelector(".work-share"), s);
      
      // edit buttons click handler
      block.querySelectorAll(".work-edit").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const targetId = btn.dataset.id || s.id;
          history.pushState(null, "", `/upload?edit=${targetId}`);
          render();
        });
      });

      block.querySelectorAll(".work-toggle-hide").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const tName = btn.dataset.talent;
          if (!tName) return;
          
          const matchingShoots = SHOOTS.filter(s => (s.talent || "").trim().toLowerCase() === tName.trim().toLowerCase());
          if (matchingShoots.length === 0) return;
          
          const currentlyHidden = matchingShoots.some(s => s.hideFromCompCard);
          const newHiddenState = !currentlyHidden;
          
          matchingShoots.forEach(s => { s.hideFromCompCard = newHiddenState; });
          
          try {
            localStorage.setItem("wps_custom_shoots", JSON.stringify(SHOOTS));
          } catch(err) {}
          
          alert(newHiddenState ? `🔒 Model card for '${tName}' is now HIDDEN from the public Comp Cards page.` : `👁️ Model card for '${tName}' is now VISIBLE on the public Comp Cards page.`);
          if (typeof render === "function") render();
        });
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
    
    // specialty thumb click interactions
    view.querySelectorAll(".specialty-thumb-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const kind = btn.dataset.kind;
        const val = btn.dataset.val;
        const clickedSrc = btn.dataset.src;
        
        let shoots = SHOOTS.filter(s => s[kind] === val);
        if (val === "Selective Collaboration (TFP)" || val === "Comp Cards" || val === "Model Portfolio") {
          shoots = shoots.filter(s => (s.instagram && s.instagram.trim()) || (s.kavyar && s.kavyar.trim()));
        }
        
        const isCc = val === "Selective Collaboration (TFP)" && isCurrentlyCompCardView();
        const list = shoots.flatMap(s => (s.photos || []).filter(p => !(isCc && p.excludeFromCompCard)).map(p => ({ ...p, shoot: s })));
        const idx = list.findIndex(p => photoSrc(p) === clickedSrc);
        openLb(list, idx >= 0 ? idx : 0);
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
            const talent = getTalentCleanName(block.dataset.talent || "");
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
    if (key === "calendar") wireCalendar();
    if (key === "analytics") wireAnalytics();
    // animate hero counts
    view.querySelectorAll("[data-count]").forEach((el) => animateCount(el, parseInt(el.textContent, 10) || 0));
  }

  /* ============================================================
     §14 · ROUTER
     ============================================================ */
  const ROUTES = { "": viewHome, "albums": viewAlbums, "categories": viewCategories, "studio": viewStudio, "upload": viewUpload, "book": viewBook, "calendar": viewCalendar, "contracts": viewContracts, "testimonials": viewTestimonials, "workshop-attended": viewWorkshopAttended, "analytics": viewAnalytics };

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

    // Redirect non-admins trying to access the calendar page
    if (key === "calendar" && !isAdmin()) {
      history.pushState(null, "", "/");
      render();
      return;
    }

    // Redirect non-admins trying to access the contracts vault
    if (key === "contracts" && !isAdmin()) {
      history.pushState(null, "", "/");
      render();
      return;
    }

    // Redirect all requests to analytics page to home
    if (key === "analytics") {
      history.pushState(null, "", "/");
      render();
      return;
    }

    // Redirect to home if trying to access workshop-attended and not authorized
    if (key === "workshop-attended" && !isAdmin() && !shouldShowWorkshopsToAll()) {
      history.pushState(null, "", "/");
      render();
      return;
    }

    if (key === "categories" && val === "Workshop Attended") {
      const allowed = isAdmin() || shouldShowWorkshopsToAll();
      history.pushState(null, "", allowed ? "/workshop-attended" : "/");
      render();
      return;
    }

    const fn = ROUTES[key] || (() => `
      <section class="hero hero-mono hero-404">
        <div class="hero-bg" aria-hidden="true"></div>
        <div class="container hero-inner">
          <div class="hero-topline">
            <span class="hero-topline-l">Error 404</span>
            <span class="hero-topline-r">Page not found</span>
          </div>
          <h1 class="hero-wordmark hero-wordmark-nerdy notfound-mark" aria-label="404 — page not found">
            <span class="wm-letter" style="--i:0">4</span><span class="wm-letter" style="--i:1">0</span><span class="wm-letter" style="--i:2">4</span>
          </h1>
          <div class="hero-mono-foot">
            <p class="hero-mono-tagline">This frame doesn't exist — but the archive does.</p>
            <div class="hero-actions">
              <a href="/" data-link class="btn btn-dark">Back home →</a>
              <a href="/albums" data-link class="btn btn-ghost">Browse albums</a>
            </div>
          </div>
        </div>
      </section>`);

    view.classList.add("leaving");
    const paint = () => {
      let html;
      if (key === "categories") {
        html = viewCategories(kind, val);
      } else if (key === "share") {
        // ?a= is what share links carry now; parts[1] is the older
        // /share/<album> path form, still handed out in links already sent.
        html = viewSharedAlbum(params.get("a") || parts[1] || "");
      } else {
        html = fn();
      }
      view.innerHTML = html;
      // Inject a lightweight "back" link at the top of every inner page's
      // header so visitors can return home without opening the Menu overlay.
      // Skipped on the home hero (key === "") and the 404 (no .page-head).
      if (key) {
        const phContainer = view.querySelector(".page-head .container");
        if (phContainer && !phContainer.querySelector(".page-back-link")) {
          const back = document.createElement("a");
          back.href = "/";
          back.setAttribute("data-link", "");
          back.className = "page-back-link reveal";
          back.innerHTML = `<span aria-hidden="true">←</span> Back to home`;
          phContainer.insertBefore(back, phContainer.firstChild);
        }
      }
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
          const rawCatName = decodeURIComponent(parts[2]);
          const catName = rawCatName === "Selective Collaboration (TFP)" ? "Model Portfolio (Comp Cards)" : rawCatName;
          pageTitle = `${catName} (${parts[1]}) — ${cfg.studioName}`;
          pageDesc = `Photoshoots filed under the ${parts[1]} category "${catName}" in the photography archive.`;
        } else {
          pageTitle = `Browse by Category — ${cfg.studioName}`;
          pageDesc = `Explore creative photoshoots categorized by activity (genre), brand, or production type.`;
        }
      } else if (key === "share") {
        const shared = CURRENT_VIEW_SHOOTS[0];
        if (shared) {
          const sharedName = getTalentCleanName(shared.isCompCard ? shared.talent : (shared.title || "Album"));
          pageTitle = `${sharedName}${shared.isCompCard ? " — Comp Card" : ""} — ${cfg.studioName}`;
          pageDesc = shared.description || `${sharedName} — photographed by ${cfg.studioName}, Noida & Delhi NCR.`;
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
      updateImageSchema();
    };
    if (prefersReduced) paint(); else setTimeout(paint, 180);
  }

  // Inject/refresh ImageGallery + ImageObject structured data for the shoots in
  // the current view, so the photography surfaces in Google Images / rich results.
  function updateImageSchema() {
    const ORIGIN = "https://www.nerdyphotographer.in";
    const abs = (u) => u ? (u.startsWith("http") ? u : `${ORIGIN}/${u.replace(/^\//, "")}`) : "";
    const shoots = (CURRENT_VIEW_SHOOTS && CURRENT_VIEW_SHOOTS.length ? CURRENT_VIEW_SHOOTS : SHOOTS).slice(0, 12);
    const images = [];
    for (const s of shoots) {
      if (!s.photos) continue;
      for (const p of s.photos) {
        const url = abs(p.url);
        if (!url) continue; // only real published files (not base64)
        images.push({
          "@type": "ImageObject",
          "contentUrl": url,
          "name": s.title || getTalentCleanName(s.talent) || "Photoshoot",
          "caption": p.caption || altFor(s),
          "creditText": "nerdyphotographer.in",
          "creator": { "@type": "Organization", "name": "Nerdy Photographer" }
        });
        if (images.length >= 30) break;
      }
      if (images.length >= 30) break;
    }
    let el = document.getElementById("wps-image-schema");
    if (!images.length) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("script"); el.type = "application/ld+json"; el.id = "wps-image-schema"; document.head.appendChild(el); }
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ImageGallery",
      "name": `${window.STUDIO_CONFIG?.studioName || "nerdyphotographer.in"} — photography archive`,
      "url": location.href,
      "image": images
    });
  }

  function setActiveNav(key) {
    overlay.querySelectorAll(".nav-links a").forEach((a) => {
      const h = a.getAttribute("href").replace(/^#\/?/, "");
      a.classList.toggle("active", h === key || (h === "" && key === ""));
    });
  }

  /* ============================================================
     §15 · ANIMATION, SCROLL & LOADER
     ============================================================ */
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
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0, rootMargin: "100px 0px 100px 0px" });
    items.forEach((el) => io.observe(el));

    const sweep = () => items.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight + 300) el.classList.add("in");
    });
    sweep();
    setTimeout(sweep, 300);
    setTimeout(sweep, 1000);
  }

  // The footer lives outside the SPA view mount, so it needs its own persistent
  // reveal observer (set up once at boot, survives navigations). A generous
  // rootMargin means bottom-of-page elements still trigger, and a safety timer
  // guarantees footer content can never stay stuck invisible.
  function initFooterReveal() {
    const footer = $(".site-footer"); if (!footer) return;
    const items = [...footer.querySelectorAll(".reveal, .reveal-stagger")];
    const revealAll = () => items.forEach((el) => el.classList.add("in"));
    if (prefersReduced || !("IntersectionObserver" in window)) { revealAll(); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }), { threshold: 0, rootMargin: "0px 0px 120px 0px" });
    items.forEach((el) => io.observe(el));
    // Safety net: if anything is still hidden shortly after it's on-screen, show it.
    // getBoundingClientRect forces a synchronous layout, so running it straight
    // off the scroll event meant a forced layout on every scroll tick. Coalesced
    // into one rAF frame, and unhooked once everything has been revealed —
    // after that the sweep has nothing left to do.
    let sweepQueued = false;
    const sweep = () => {
      sweepQueued = false;
      let pending = 0;
      items.forEach((el) => {
        if (el.classList.contains("in")) return;
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight + 200) el.classList.add("in");
        else pending++;
      });
      if (!pending) window.removeEventListener("scroll", onScroll);
    };
    const onScroll = () => {
      if (sweepQueued) return;
      sweepQueued = true;
      requestAnimationFrame(sweep);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    setTimeout(sweep, 1200);
  }

  // (The noth.in-style "View" hover cursor was removed by request —
  //  portfolio imagery no longer shows a follower badge.)

  /* ---------------- Scrolling ----------------
     Native scrolling is used (trackpads/modern browsers are already smooth and
     JS wheel-hijacking makes them feel laggy). Smoothness for anchor jumps comes
     from CSS `scroll-behavior: smooth`. This shim keeps the old API as a no-op. */
  const smoothScroll = { enabled: false, reset() {}, to(y) { window.scrollTo({ top: y, behavior: prefersReduced ? "auto" : "smooth" }); } };

  function initHeaderScroll() {
    const header = $(".site-header");
    window.addEventListener("scroll", () => header.classList.toggle("scrolled", window.scrollY > 8), { passive: true });
  }

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

  /* ============================================================
     §16 · COMP-CARD PRINTING & DOWNLOAD LOGGING
     ============================================================ */
  /* ---- Shared print builders (comp card + model portfolio) ---- */

  // Branding footer — this doubles as a marketing touchpoint, so it's always
  // included and only ever shrinks (via --print-scale), never gets dropped.
  const PRINT_FOOTER_HTML = `
    <div style="border-top: 1px solid #d9d6d0; padding-top: calc(8px * var(--print-scale, 1)); margin-top: auto; width: 100%; flex: 0 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; gap: calc(10px * var(--print-scale, 1)); flex-wrap: wrap;">
        <span style="font-family:'JetBrains Mono', monospace; font-size: calc(8px * var(--print-scale, 1)); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8782; ">Photographed by nerdyphotographer.in &nbsp;·&nbsp; @nerdyphotographer.in</span>
        <span style="font-family:'JetBrains Mono', monospace; font-size: calc(8.5px * var(--print-scale, 1)); font-weight: 700; color: #000; letter-spacing: 0.04em;">Book a shoot &nbsp;·&nbsp; nerdyphotographer.in/book</span>
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
        ${types.map((t) => `<span style="font-family:'JetBrains Mono', monospace; font-size: calc(8px * var(--print-scale, 1)); font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #333; background: #fff; border: 1px solid #cfccc6; border-radius: 999px; padding: calc(3px * var(--print-scale, 1)) calc(10px * var(--print-scale, 1)); white-space: nowrap;">${esc(modelTypeLabel(t))}</span>`).join("")}
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
        ${pairs.map(([k, v]) => `<div><div style="font-family:'JetBrains Mono', monospace; font-size: calc(8px * var(--print-scale, 1)); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8782; margin-bottom: calc(2px * var(--print-scale, 1));">${esc(k)}</div><div style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: calc(12px * var(--print-scale, 1)); font-weight: 700; color: #000; letter-spacing: -0.01em;">${esc(v)}</div></div>`).join("")}
      </div>
    `;
  }

  // Every social we have for the model: the album's Instagram / Kavyar
  // fields first, then whatever sits in the model's own credit, in a fixed
  // order and without repeats.
  function printModelLinks(shoot) {
    const links = [];
    const add = (l) => { if (l && !links.some(x => x.url.toLowerCase() === l.url.toLowerCase())) links.push(l); };
    if (shoot.instagram) {
      compCardOwnHandles(shoot, shoot.instagram.split(",").map(x => x.trim()).filter(Boolean), isIgHandle).forEach(h => add(classifySocial(h)));
    }
    if (shoot.kavyar) {
      compCardOwnHandles(shoot, shoot.kavyar.split(",").map(x => x.trim()).filter(Boolean), isKavyarHandle).forEach(h => add(classifySocial(h)));
    }
    socialsFromCredit(shoot.talent).forEach(add);
    return links.sort((a, b) => SOCIAL_ORDER.indexOf(a.kind) - SOCIAL_ORDER.indexOf(b.kind));
  }
  // The model's links a surface may show: Instagram, other socials and an
  // email in the credit each answer to their own switch.
  function visibleAgencyLinks(shoot, surface) {
    const what = { instagram: "AgencyInstagram", kavyar: "AgencyKavyar", linkedin: "AgencyLinkedin", behance: "AgencyBehance", website: "AgencyWebsite", email: "AgencyEmail" };
    return agencyLinksOf(shoot).filter(l => showRep(shoot, what[l.kind] || "AgencyWebsite", surface));
  }
  function visibleModelLinks(shoot, surface) {
    const what = { instagram: "ModelInstagram", kavyar: "ModelKavyar", linkedin: "ModelLinkedin", behance: "ModelBehance", website: "ModelWebsite", email: "Email" };
    return printModelLinks(shoot).filter(l => showRep(shoot, what[l.kind] || "ModelWebsite", surface));
  }
  function printSocialsBarHtml(shoot) {
    // Contact block: one line for the model (every social and the email),
    // one line for the agency (its name, then its socials). Each detail is
    // a small label over its value.
    const cell = (label, value) => `<div style="min-width: 0;"><div style="font-family:'JetBrains Mono', monospace; font-size: calc(8px * var(--print-scale, 1)); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8782; margin-bottom: calc(2px * var(--print-scale, 1));">${label}</div><div style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: calc(11px * var(--print-scale, 1)); font-weight: 700; color: #000;">${value}</div></div>`;
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
        <span style="font-family:'JetBrains Mono', monospace; font-size: calc(8px * var(--print-scale, 1)); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8782; ">Credits</span> &nbsp;${creditsItems}
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
          <span style="font-family:'JetBrains Mono', monospace; font-size: calc(8px * var(--print-scale, 1)); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8782;">Comp card${updatedStamp ? ` &nbsp;·&nbsp; Updated ${esc(updatedStamp)}` : ""}</span>
          <span style="display: inline-flex; align-items: center; gap: calc(6px * var(--print-scale, 1));"><svg viewBox="0 0 100 100" fill="none" aria-hidden="true" style="width: calc(13px * var(--print-scale, 1)); height: calc(13px * var(--print-scale, 1)); color: #000; flex: 0 0 auto;"><circle cx="50" cy="52" r="39" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M 26 22 C 26 22 28 32 37 40 C 45 44 48 40 50 38 C 52 40 55 44 63 40 C 72 32 74 22 74 22 C 74 22 70 34 50 44 C 30 34 26 22 26 22 Z" fill="#0e0e0e" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="36" cy="48" r="13" stroke="currentColor" stroke-width="3"/><circle cx="64" cy="48" r="13" stroke="currentColor" stroke-width="3"/><path d="M 49 48 L 51 48" stroke="currentColor" stroke-width="3"/><path d="M 23 48 L 16 48 L 16 40" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M 77 48 L 84 48 L 84 40" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M 36 38 L 41 45 M 42.5 44 L 38 52 M 39 53 L 30 51 M 31 50 L 29 42 M 30 41 L 38 41" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M 64 38 L 69 45 M 70.5 44 L 66 52 M 67 53 L 58 51 M 59 50 L 57 42 M 58 41 L 66 41" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><polygon points="50,49 46,55 54,55" fill="#d24e1a"/><path d="M 20 58 C 24 72 35 78 50 86 C 65 78 76 72 80 58" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M 27 68 C 32 78 40 82 50 90 C 60 82 68 78 73 68" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><span style="font-family:'JetBrains Mono', monospace; font-size: calc(8px * var(--print-scale, 1)); font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #000;">nerdyphotographer.in</span></span>
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
  window.printCompCard = (shootId, orientation = "auto") => {
    const shoot = SHOOTS.find(x => x.id === shootId) || (window.currentCompCardShootObj);
    if (!shoot) return;
    // The button already hides itself when this is set, but printCompCard is
    // also reachable directly (magic download link, console) — the lock must
    // hold everywhere, not just in the UI that normally gates it.
    if (shoot.disableCompCardDownload) {
      toast("Comp card PDF download has been disabled for this model by the studio.");
      return;
    }

    // Gather ALL photos across ALL shoots tagged to this model
    const modelName = getTalentCleanName(shoot.talent || shoot.title).trim();
    let allModelPhotos = [];
    if (modelName) {
      const matchingShoots = SHOOTS.filter(s => {
        if (s.type === "Workshop Attended") return false;
        if (!s.talent) return false;
        const names = s.talent.split(",").map(t => getTalentCleanName(t).trim().toLowerCase());
        return names.includes(modelName.toLowerCase());
      });
      allModelPhotos = matchingShoots.flatMap(s => (s.photos || []).filter(p => !p.excludeFromCompCard && p.usage !== "portfolio"));
    }
    if (!allModelPhotos.length) {
      allModelPhotos = (shoot.photos || []).filter(p => !p.excludeFromCompCard && p.usage !== "portfolio");
    }
    const rawPhotos = allModelPhotos.length ? allModelPhotos : (shoot.photos || []);
    if (!rawPhotos.length) { toast("No photos to export."); return; }

    // Freshly shuffle the whole pool every time the button is clicked — the
    // hero is random too (first of the shuffle), not pinned to the album
    // cover, so every export leads with a different shot of the model.
    const shuffled = shuffleArray([...rawPhotos]);

    // Hero + up to 5 side candidates (6 photos max on the card, keeping the
    // model highlighted); the aspect-aware layout pass keeps however many of
    // them tile the chosen orientation best.
    const photos = shuffled.slice(0, 6);
    printFromContainer(shoot, printCompCardPageHtml(shoot, photos), "CompCard", orientation);
  };

  // ---- Model Portfolio template system (Template 1: The Composite Lookbook) ----
  // Replaces the old "select any photos, 1-page or multi-page" flat export.
  // Every slot here is pinned to an existing angle tag (full-body/front/left-
  // profile/right-profile/three-quarter/back/close-up) — the customer can
  // only ever put a photo into the slot it was already tagged for. A slot
  // with zero tagged candidates is simply skipped (no page for it), rather
  // than forced with a placeholder.
  const PORTFOLIO_TEMPLATE1_SLOTS = [
    { angle: "full-body", label: "Full Body" },
    { angle: "front", label: "Front" },
    { angle: "left-profile", label: "Left Profile" },
    { angle: "right-profile", label: "Right Profile" },
    { angle: "three-quarter", label: "Three-Quarter" },
    { angle: "back", label: "Back" },
    { angle: "close-up", label: "Close-Up" }
  ];

  function printTemplate1StatBlocksHtml(shoot) {
    if (shoot.showStatsOnModelPortfolio === false) return "";
    const rows = [];
    if (shoot.height) rows.push(["Height", shoot.height]);
    if (shoot.chest) rows.push([chestLabelOf(shoot), shoot.chest]);
    if (shoot.waist) rows.push(["Waist", shoot.waist]);
    if (shoot.hips) rows.push(["Hips", shoot.hips]);
    if (shoot.shoes) rows.push(["Shoes", shoot.shoes]);
    if (shoot.modelHair) rows.push(["Hair", shoot.modelHair]);
    if (shoot.modelEyes) rows.push(["Eyes", shoot.modelEyes]);
    if (!rows.length) return "";
    return rows.map(([label, val]) => `
      <div>
        <p style="font-family:'JetBrains Mono', monospace; font-size: calc(8px * var(--print-scale, 1)); letter-spacing: 0.1em; text-transform: uppercase; color: #999; margin: 0 0 2px;">${esc(label)}</p>
        <p style="font-size: calc(12px * var(--print-scale, 1)); font-weight: 700; color: #000; margin: 0;">${esc(val)}</p>
      </div>
    `).join("");
  }

  // manualFields (location/phone/brands) are typed in by the customer at
  // export time and only ever flow into this generated HTML — never written
  // back onto the shoot object, never persisted, never sent to the backend.
  function printTemplate1ContactRowsHtml(shoot, manualFields) {
    const rows = [];
    visibleModelLinks(shoot, "Pdf").forEach(l => rows.push([SOCIAL_LABEL[l.kind], socialPrintText(l), false]));
    if (shoot.agency && showRep(shoot, "Agency", "Pdf")) {
      rows.push(["Agency", shoot.agency, false, visibleAgencyLinks(shoot, "Pdf").map(socialPrintText).join("  ·  ")]);
    }
    if (shoot.modelEmail && showRep(shoot, "Email", "Pdf") && !rows.some(r => r[1] === shoot.modelEmail)) rows.push(["Email", shoot.modelEmail, false]);
    if (manualFields.phone) rows.push(["Phone", manualFields.phone, true]);
    if (manualFields.brands && manualFields.brands.length) rows.push(["Worked With", manualFields.brands.join(" · "), true]);
    if (!rows.length) return "";
    return rows.map(([label, val, isManual, sub]) => `
      <div>
        <p style="font-family:'JetBrains Mono', monospace; font-size: calc(8px * var(--print-scale, 1)); letter-spacing: 0.1em; text-transform: uppercase; color: #999; margin: 0 0 2px;">${esc(label)}${isManual ? ` <span style="font-weight:400; text-transform:none; letter-spacing:0;">(optional, provided by model)</span>` : ""}</p>
        <p style="font-size: calc(11px * var(--print-scale, 1)); font-weight: 700; color: ${label === "Instagram" ? "var(--accent, #d24e1a)" : "#000"}; margin: 0;">${esc(val)}</p>
        ${sub ? `<p style="font-size: calc(9px * var(--print-scale, 1)); font-weight: 600; color: #666; margin: 2px 0 0;">${esc(sub)}</p>` : ""}
      </div>
    `).join("");
  }

  // Page 1 — full-bleed-feeling cover: name + template label + optional
  // manual location beside the lead pose, in the same bordered-page look as
  // every other export on this site (Outfit heading, JetBrains Mono labels,
  // accent-orange eyebrow) so it reads as one product family, not a one-off.
  function printTemplate1CoverHtml(shoot, name, heroSlot, manualFields) {
    const locationLine = manualFields.location ? ` &nbsp;·&nbsp; ${esc(manualFields.location)}` : "";
    return `
      <div class="print-page">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #d9d6d0; padding-bottom: 12px; margin-bottom: 16px; flex: 0 0 auto;">
          <span style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.1em;">MODEL PORTFOLIO</span>
          <span style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #000; text-transform: uppercase;">Clicked by nerdyphotographer.in</span>
        </div>
        <div style="display: flex; gap: 16px; flex: 1 1 auto; min-height: 0;">
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 10px;">
            <p style="font-family:'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: var(--accent, #d24e1a); text-transform: uppercase; letter-spacing: 0.15em; margin: 0;">The Composite Lookbook</p>
            <h1 style="font-family:'Outfit', sans-serif; font-size: 34px; font-weight: 800; margin: 0; text-transform: uppercase; color: #000; letter-spacing: -0.03em; line-height: 1.05;">${esc(name)}</h1>
            ${printModelTypeBadgesHtml(shoot)}
            <p style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: #555; letter-spacing: 0.05em; margin: 0;">SEASON ${new Date().getFullYear()}${locationLine}</p>
          </div>
          <div style="flex: 1.3; position: relative; background: #f4f4f2; border: 1px solid #e2e0dc; border-radius: 6px; overflow: hidden; min-height: 0;">
            ${heroSlot ? `<img src="${photoSrc(heroSlot.photo)}" alt="Cover" style="width:100%; height:100%; object-fit:cover; object-position: top center; display:block;" />` : ""}
          </div>
        </div>
        <div style="text-align: center; padding-top: 16px; margin-top: 16px; border-top: 1px solid #eee; flex: 0 0 auto;">
          <p style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: 0.1em; margin: 0;">
            Photographed &amp; Produced by nerdyphotographer.in studio
          </p>
        </div>
      </div>
    `;
  }

  // Page 2 — stats/contact on the left, a numbered contents list of every
  // template slot on the right (unfilled slots stay listed but dimmed, so
  // the document is honest about which poses this export actually has).
  function printTemplate1ContentsHtml(shoot, name, filledSlots, manualFields) {
    const statBlocks = printTemplate1StatBlocksHtml(shoot);
    const contactRows = printTemplate1ContactRowsHtml(shoot, manualFields);
    const contentsItems = PORTFOLIO_TEMPLATE1_SLOTS.map((slot, i) => {
      const num = String(i + 1).padStart(2, "0");
      const filled = filledSlots.find(f => f.angle === slot.angle);
      if (!filled) {
        return `
          <div style="display:flex; align-items:center; gap:10px; opacity:0.4;">
            <span style="font-family:'JetBrains Mono', monospace; font-size:10px; font-weight:800; color:var(--accent, #d24e1a); width:18px;">${num}</span>
            <span style="font-size:11px; font-weight:650; flex:1;">${esc(slot.label)}</span>
          </div>
        `;
      }
      return `
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-family:'JetBrains Mono', monospace; font-size:10px; font-weight:800; color:var(--accent, #d24e1a); width:18px;">${num}</span>
          <span style="font-size:11px; font-weight:650; flex:1;">${esc(slot.label)}</span>
          <img src="${photoSrc(filled.photo)}" style="width:28px; height:34px; object-fit:cover; border-radius:2px;" alt="" />
        </div>
      `;
    }).join("");

    return `
      <div class="print-page">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #d9d6d0; padding-bottom: 12px; margin-bottom: 16px; flex: 0 0 auto;">
          <h2 style="font-family:'Outfit', sans-serif; font-size: 22px; font-weight: 800; margin: 0; text-transform: uppercase; color: #000; letter-spacing: -0.02em;">${esc(name)} — Contents</h2>
          <span style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #000; text-transform: uppercase;">Clicked by nerdyphotographer.in</span>
        </div>
        <div style="display: flex; gap: 24px; flex: 1 1 auto; min-height: 0;">
          <div style="flex: 1; display: flex; flex-direction: column; gap: 16px; justify-content: center;">
            ${statBlocks}
            ${contactRows}
          </div>
          <div style="flex: 1.1; display: flex; flex-direction: column; gap: 10px; justify-content: center; border-left: 1px solid #eee; padding-left: 24px;">
            <p style="font-family:'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #999; margin: 0 0 4px;">Contents</p>
            ${contentsItems}
          </div>
        </div>
        ${PRINT_FOOTER_HTML}
      </div>
    `;
  }

  // Pages 3+ — one spread per filled slot: full-bleed pose photo beside a
  // simple caption panel. Deliberately doesn't fabricate shoot-specific copy
  // (no invented location/story) — the only facts printed are the pose name,
  // the model's name, and studio credit.
  function printTemplate1SpreadHtml(shoot, name, slot, index, totalCount) {
    const num = String(index + 1).padStart(2, "0");
    return `
      <div class="print-page">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #d9d6d0; padding-bottom: 10px; margin-bottom: 14px; flex: 0 0 auto;">
          <span style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.1em;">${num} / ${String(totalCount).padStart(2, "0")} — ${esc(slot.label.toUpperCase())}</span>
          <span style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #000; text-transform: uppercase;">Clicked by nerdyphotographer.in</span>
        </div>
        <div style="display: flex; gap: 16px; flex: 1 1 auto; min-height: 0;">
          <div style="flex: 1.6; position: relative; background: #f4f4f2; border: 1px solid #e2e0dc; border-radius: 6px; overflow: hidden; min-height: 0;">
            <img src="${photoSrc(slot.photo)}" alt="${esc(slot.label)}" style="width:100%; height:100%; object-fit:cover; display:block;" />
          </div>
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 8px;">
            <p style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: var(--accent, #d24e1a); letter-spacing: 0.08em; margin: 0;">${num} — ${esc(slot.label.toUpperCase())}</p>
            <p style="font-family:'Outfit', sans-serif; font-size: 19px; font-weight: 750; margin: 0; color: #000;">${esc(name)}</p>
            <p style="font-size: 11px; color: #666; line-height: 1.5; margin: 0;">Selected by ${esc(name)} from their own ${esc(slot.label.toLowerCase())}-tagged photographs.</p>
          </div>
        </div>
        ${PRINT_FOOTER_HTML}
      </div>
    `;
  }

  // Assembles cover + contents + one spread per filled slot, then hands off
  // to the shared print pipeline. Template 1 is a fixed landscape format —
  // not user-choosable, since the template itself defines its own shape.
  function printPortfolioTemplate1(shoot, filledSlots, manualFields) {
    const name = getTalentCleanName(shoot.talent || shoot.title);
    const heroSlot = filledSlots[0];
    let pagesHtml = printTemplate1CoverHtml(shoot, name, heroSlot, manualFields);
    pagesHtml += printTemplate1ContentsHtml(shoot, name, filledSlots, manualFields);
    filledSlots.forEach((slot, i) => {
      pagesHtml += printTemplate1SpreadHtml(shoot, name, slot, i, filledSlots.length);
    });
    printFromContainer(shoot, pagesHtml, "Portfolio", "landscape");
  }

  // The customer-facing flow: role fork (Model vs Agency) up top, then one
  // pick-a-photo row per available pose, then — Model only — optional
  // location/phone/brand fields that are typed in here and nowhere else;
  // Agency exports skip those three fields entirely since an agency rep
  // wouldn't have (and shouldn't be asked for) that talent's personal info.
  function openPortfolioTemplateFlow(shoot, photos) {
    document.getElementById("portfolioTemplateModal")?.remove();
    const name = getTalentCleanName(shoot.talent || shoot.title);

    const slotsWithCandidates = PORTFOLIO_TEMPLATE1_SLOTS.map(slot => ({
      ...slot,
      candidates: photos.filter(p => p.angle === slot.angle)
    }));
    const availableSlots = slotsWithCandidates.filter(s => s.candidates.length);

    if (!availableSlots.length) {
      toast("None of this model's portfolio photos are tagged with a pose yet (Front/Side/Three-Quarter/Back/Close-up) — tag them in Upload to use the template system.");
      return;
    }

    const selectedBySlot = {};
    availableSlots.forEach(s => { selectedBySlot[s.angle] = s.candidates[0].id; });
    let role = "model";

    const modal = document.createElement("div");
    modal.id = "portfolioTemplateModal";
    modal.style = "position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.75); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; padding: 20px;";
    modal.innerHTML = `
      <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 14px; width: 100%; max-width: 760px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--shadow);">
        <div style="padding: 18px 22px; border-bottom: 1px solid var(--line); background: var(--bone);">
          <span style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent);">Model Portfolio · The Composite Lookbook</span>
          <h3 style="margin: 4px 0 0; font-family:'Outfit', sans-serif; font-size: 18px; font-weight: 700; color: var(--ink);">${esc(name)} — build the portfolio PDF</h3>
          <p style="margin: 4px 0 0; font-size: 11px; color: var(--ink-soft);">Pick a photo for each pose, then export. Cover, Contents &amp; Contact, and one spread page per pose are generated automatically.</p>
        </div>

        <div style="padding: 16px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 18px;">

          <div style="display:flex; flex-wrap:wrap; align-items:center; gap: 12px; background: var(--bone); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px;">
            <span style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--ink-soft);">Exporting as:</span>
            <div style="display: inline-flex; background: var(--paper); border: 1px solid var(--line); border-radius: 7px; padding: 3px;">
              <button type="button" data-role="model" class="pt-role-btn active" style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; border: none; padding: 6px 14px; border-radius: 5px; cursor: pointer; background: var(--ink); color: var(--paper);">Model</button>
              <button type="button" data-role="agency" class="pt-role-btn" style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; border: none; padding: 6px 14px; border-radius: 5px; cursor: pointer; background: transparent; color: var(--ink-soft);">Agency</button>
            </div>
            <span style="font-size: 11px; color: var(--ink-soft); flex: 1 1 220px;">Agency exports skip location, phone, and brand credits entirely.</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 14px;">
            ${slotsWithCandidates.map((slot, i) => {
              const num = String(i + 1).padStart(2, "0");
              if (!slot.candidates.length) {
                return `
                  <div style="opacity: 0.5; display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--ink-soft);">
                    <span style="font-family:'JetBrains Mono', monospace; font-weight: 800; color: var(--accent);">${num}</span>
                    <span>${esc(slot.label)} — no tagged photos yet, this page will be skipped.</span>
                  </div>
                `;
              }
              return `
                <div class="pt-slot-row" data-angle="${esc(slot.angle)}">
                  <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px;">
                    <span style="font-family:'JetBrains Mono', monospace; font-size: 11px; font-weight: 800; color: var(--accent);">${num}</span>
                    <span style="font-size: 13px; font-weight: 650; color: var(--ink);">${esc(slot.label)} — pick one</span>
                  </div>
                  <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    ${slot.candidates.map((p, ci) => `
                      <button type="button" class="pt-cand" data-id="${esc(p.id)}" style="position: relative; width: 72px; aspect-ratio: 4/5; border-radius: 6px; overflow: hidden; border: 2px solid ${ci === 0 ? "var(--accent)" : "var(--line)"}; padding: 0; cursor: pointer; background: var(--bone);">
                        <img src="${esc(photoSrc(p))}" style="width: 100%; height: 100%; object-fit: cover; object-position: ${esc(p.objectPosition || "center")}; display: block;" alt="${esc(slot.label)} option" loading="lazy" />
                        <span class="pt-check" style="display:${ci === 0 ? "flex" : "none"}; position: absolute; top: 4px; right: 4px; width: 16px; height: 16px; border-radius: 50%; background: var(--accent); color: #fff; font-size: 10px; font-weight: 800; align-items: center; justify-content: center;">✓</span>
                      </button>
                    `).join("")}
                  </div>
                </div>
              `;
            }).join("")}
          </div>

          <div id="ptOptionalFields" style="display: flex; flex-direction: column; gap: 10px; border-top: 1px dashed var(--line); padding-top: 14px;">
            <span style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--ink-soft);">Optional details — typed in by the model, never saved by the studio</span>
            <input type="text" id="ptLocation" placeholder="Current location (optional, e.g. Based in Mumbai)" style="width: 100%; box-sizing: border-box; padding: 9px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink); font-size: 12px;" />
            <input type="text" id="ptPhone" placeholder="Phone number (optional)" style="width: 100%; box-sizing: border-box; padding: 9px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink); font-size: 12px;" />
            <input type="text" id="ptBrands" placeholder="Top 5 brands worked with, comma-separated (optional)" style="width: 100%; box-sizing: border-box; padding: 9px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink); font-size: 12px;" />
          </div>

        </div>

        <div style="padding: 16px 22px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; align-items: center; gap: 12px; background: var(--bone);">
          <span style="font-size: 10px; color: var(--ink-soft); margin-right: auto; font-family:'JetBrains Mono', monospace;">${availableSlots.length} of ${PORTFOLIO_TEMPLATE1_SLOTS.length} poses included</span>
          <button type="button" id="ptCancel" class="btn btn-ghost" style="font-size: 12px; height: auto; padding: 10px 18px;">Cancel</button>
          <button type="button" id="ptExport" class="btn btn-dark" style="font-size: 12px; height: auto; padding: 10px 18px; font-family:'JetBrains Mono', monospace; font-weight: 700;">Export PDF</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll(".pt-cand").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".pt-slot-row");
        const angle = row.dataset.angle;
        selectedBySlot[angle] = btn.dataset.id;
        row.querySelectorAll(".pt-cand").forEach(b => {
          const on = b === btn;
          b.style.borderColor = on ? "var(--accent)" : "var(--line)";
          b.querySelector(".pt-check").style.display = on ? "flex" : "none";
        });
      });
    });

    modal.querySelectorAll(".pt-role-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        role = btn.dataset.role;
        modal.querySelectorAll(".pt-role-btn").forEach(b => {
          const on = b === btn;
          b.style.background = on ? "var(--ink)" : "transparent";
          b.style.color = on ? "var(--paper)" : "var(--ink-soft)";
        });
        modal.querySelector("#ptOptionalFields").style.display = role === "agency" ? "none" : "flex";
      });
    });

    const close = () => modal.remove();
    modal.querySelector("#ptCancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector("#ptExport").addEventListener("click", () => {
      const filledSlots = availableSlots.map(slot => {
        const chosenId = selectedBySlot[slot.angle];
        const photo = slot.candidates.find(p => p.id === chosenId) || slot.candidates[0];
        return { angle: slot.angle, label: slot.label, photo };
      });
      const manualFields = role === "agency" ? {} : {
        location: (modal.querySelector("#ptLocation").value || "").trim(),
        phone: (modal.querySelector("#ptPhone").value || "").trim(),
        brands: (modal.querySelector("#ptBrands").value || "").split(",").map(b => b.trim()).filter(Boolean).slice(0, 5)
      };
      close();
      printPortfolioTemplate1(shoot, filledSlots, manualFields);
    });
  }

  // Open entry point in the Model Portfolio lightbox sidebar — any visitor
  // (model, agency, casting director) can build and download their own PDF.
  // Opens the template flow above instead of the old flat "select any
  // photos" picker, which it fully replaces.
  window.printModelPortfolio = (shootId) => {
    const shoot = SHOOTS.find(x => x.id === shootId) || (window.currentCompCardShootObj);
    if (!shoot) return;
    // Same selection rule as the Model Portfolio view: photos tagged
    // "portfolio" or "both" (untagged legacy photos count as portfolio).
    const photos = (shoot.photos || []).filter(p => p.usage === "portfolio" || p.usage === "both" || p.usage === undefined);
    if (!photos.length) { toast("No portfolio-tagged photos to export."); return; }
    openPortfolioTemplateFlow(shoot, photos);
  };

  // Keyed by shoot id rather than one global value — a single global meant
  // picking Landscape for one model leaked into whatever model was opened
  // next (or even the same model's next photo), with the toggle still
  // visually showing Portrait while actually exporting landscape.
  window.compCardOrientationByShoot = window.compCardOrientationByShoot || {};
  window.setCompCardOrientation = (orient, inputEl, shootId) => {
    if (shootId) window.compCardOrientationByShoot[shootId] = orient;
    const parent = inputEl ? inputEl.closest("#compCardOrientGroup") : document.getElementById("compCardOrientGroup");
    if (parent) {
      parent.querySelectorAll(".orient-radio-label").forEach(lbl => {
        lbl.style.background = "transparent";
        lbl.style.color = "var(--ink-soft)";
        lbl.classList.remove("active");
      });
      const targetLabel = inputEl ? inputEl.closest("label") : null;
      if (targetLabel) {
        targetLabel.style.background = "var(--ink)";
        targetLabel.style.color = "var(--paper)";
        targetLabel.classList.add("active");
      }
    }
  };

  window.triggerCompCardDownload = (shootId, orientation) => {
    const targetOrient = orientation || (window.compCardOrientationByShoot && window.compCardOrientationByShoot[shootId]) || "portrait";
    if (isAdmin()) {
      window.printCompCard(shootId, targetOrient);
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
            <h3 style="font-family:'Outfit', sans-serif; font-size: 20px; font-weight: 700; margin: 0 0 8px; color: var(--ink);">Enter your Email</h3>
            <p style="font-size: 12px; color: var(--ink-soft); line-height: 1.5; margin: 0;">Please enter your email to proceed with downloading this talent comp card.</p>
            <p style="font-size: 10.5px; color: var(--accent); margin: 8px 0 0; font-family: 'JetBrains Mono', monospace; font-weight: 600; line-height: 1.4;">
              🎲 Note: Supporting images are randomly selected from all photos tagged to this model on each export.
            </p>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; text-align: left;">
            <label style="font-family:'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; font-weight: 700; color: var(--ink-soft);">Email Address</label>
            <input type="email" id="downloadEmailInput" placeholder="name@example.com" style="width: 100%; height: 42px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); border-radius: 8px; padding: 0 14px; box-sizing: border-box; font-size: 14px; outline: none; transition: border-color 0.2s;" />
            <span id="downloadEmailError" style="font-size: 10px; color: var(--accent); display: none; margin-top: 4px;">Please enter a valid email address.</span>
          </div>
          <div style="display: flex; gap: 12px; margin-top: 8px;">
            <button id="cancelEmailDownload" class="btn btn-ghost btn-block" style="flex: 1; height: 42px;">Cancel</button>
            <button id="submitEmailDownload" class="btn btn-dark btn-block" style="flex: 1; height: 42px; font-family:'JetBrains Mono', monospace; font-weight: 700;">Download</button>
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
    
    modal.style.display = "flex";
    modal.offsetHeight;
    modal.style.opacity = "1";
    emailInput.focus();
    
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

      window.printCompCard(shootId, targetOrient);
    });
  };

  // Auto-trigger Comp Card print preview when opening via magic email link.
  // Waits for boot() to actually finish loading shoots (bootReady) rather
  // than guessing a fixed delay — on a slow connection/IndexedDB, a blind
  // 800ms timeout could fire before SHOOTS was populated, silently no-op'ing
  // printCompCard (shoot lookup fails).
  (function checkMagicDownloadLink() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("downloadCompCard") === "1") {
      const shootId = params.get("shootId");
      const orientation = params.get("orientation") || "portrait";
      if (shootId) {
        bootReady.then(() => {
          // One more frame so the just-painted view/sidebar settle before
          // the print pipeline measures it.
          setTimeout(() => window.printCompCard(shootId, orientation), 50);
        });
      }
    }
  })();

  // User-facing "hard refresh" — clears the service-worker caches and
  // unregisters the worker, then reloads with a cache-busting query so the
  // browser fetches the freshest bundle. Fixes "I'm seeing an old version"
  // without asking visitors to dig through DevTools.
  window.clearSiteCacheAndReload = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if (window.caches && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      /* best-effort — reload regardless */
    }
    // Cache-bust the document itself so the shell HTML is refetched too.
    const url = new URL(location.href);
    url.searchParams.set("fresh", Date.now().toString());
    location.replace(url.toString());
  };

  /* ============================================================
     §17 · BOOT
     ============================================================ */
  // GitHub Pages caches data.js for ~10 minutes, so visitors can see a stale
  // portfolio right after a sync. Refetch it bypassing the cache and re-render
  // if the published shoots changed. Local (IndexedDB) shoots take precedence.
  async function refreshPublishedData() {
    try {
      const res = await fetch(`data.js?fresh=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const text = await res.text();
      const fresh = parseShootsFromDataJs(text);
      // A background refresh must never blank a page that is already showing
      // albums — an empty parse here is far more likely a parser/network
      // regression than a portfolio someone intentionally emptied, and the
      // genuinely-empty case corrects itself on the next full page load.
      if (!fresh || !fresh.length || !usingDemo) return;
      const freshDeleted = parseDeletedIdsFromDataJs(text);
      if (JSON.stringify(fresh) === JSON.stringify(window.WPS_DATA.DEMO_SHOOTS) &&
          JSON.stringify(freshDeleted) === JSON.stringify(window.WPS_DATA.DELETED_IDS || [])) return;
      window.WPS_DATA.DEMO_SHOOTS = fresh;
      window.WPS_DATA.DELETED_IDS = freshDeleted;
      await loadShoots();
      render();
    } catch { /* offline or unparsable — keep what we have */ }
  }

  function initRouting() {
    window.addEventListener("popstate", render);
    document.addEventListener("click", (e) => {
      const link = e.target.closest("[data-link]");
      if (link) {
        const href = link.getAttribute("href");
        // !href.includes("://") alone would also swallow mailto:/tel:/sms:
        // links (no "://") tagged with data-link, pushState-ing them as an
        // internal route instead of letting the browser open the mail/phone
        // app — hence the explicit scheme exclusion.
        if (href && !/^(mailto|tel|sms):/i.test(href) && (href.startsWith("/") || !href.includes("://"))) {
          e.preventDefault();
          history.pushState(null, "", href);
          render();
        }
      }
    });
  }

  function initBranding() {
    const cfg = window.STUDIO_CONFIG;
    if (!cfg) return;
    document.title = `${cfg.studioName} — The Creative Studio`;
    const loaderLbl = $("#loaderLabel");
    if (loaderLbl) loaderLbl.textContent = `${cfg.studioShortName} ${cfg.studioSubName}`;
    const headerBrandText = $("#headerBrandText");
    if (headerBrandText) headerBrandText.innerHTML = `<span style="text-transform: lowercase; font-weight: 800; font-size: var(--font-sm); letter-spacing: 0.02em;">${esc(cfg.studioName)}</span>`;
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

    // "Load fresh" utility — injected once into the nav-meta so it appears on
    // every route without touching each per-route index.html shell. Lets any
    // visitor clear a stale cached bundle without opening DevTools.
    const navMeta = document.querySelector(".nav-meta");
    if (navMeta && !document.getElementById("clearCacheBlock")) {
      const block = document.createElement("div");
      block.id = "clearCacheBlock";
      block.innerHTML = `
        <p class="nav-meta-label">Trouble loading?</p>
        <button id="clearCacheBtn" type="button" title="Clear cached files and reload the latest version" style="background:none; border:1px solid currentColor; color:inherit; font-family:inherit; font-size: var(--font-xs); font-weight:700; padding:6px 12px; border-radius:100px; cursor:pointer; text-transform:uppercase; letter-spacing:0.1em; transition:all 0.3s; outline:none;">↻ Load Fresh Version</button>`;
      navMeta.appendChild(block);
      const ccBtn = document.getElementById("clearCacheBtn");
      if (ccBtn) {
        ccBtn.addEventListener("click", () => {
          ccBtn.textContent = "↻ Refreshing…";
          ccBtn.disabled = true;
          window.clearSiteCacheAndReload();
        });
      }
    }

    // Footer email link (mailto) — mirrors nav email.
    const footerEmail = $("#footerEmail");
    if (footerEmail && cfg.email) {
      footerEmail.href = `mailto:${cfg.email}`;
      footerEmail.dataset.email = cfg.email;
      footerEmail.title = cfg.email;
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

    // Always-visible "Load fresh version" link in the footer (the nav-meta copy
    // is only reachable with the menu open). Clears cache + hard reload.
    const footerMeta = document.querySelector(".footer-meta");
    if (footerMeta && !document.getElementById("footerClearCache")) {
      const p = document.createElement("p");
      p.innerHTML = `<a href="#" id="footerClearCache" title="Clear cached files and reload the latest version" style="font-size: var(--font-xs); opacity: 0.75;">↻ Load fresh version</a>`;
      footerMeta.appendChild(p);
      document.getElementById("footerClearCache")?.addEventListener("click", (e) => {
        e.preventDefault();
        window.clearSiteCacheAndReload();
      });
    }

    // Hide duplicate pre-footer CTA banner on /book and /upload pages
    const footerCta = $(".footer-cta");
    if (footerCta) {
      if (location.pathname === "/book" || location.pathname === "/upload") {
        footerCta.style.display = "none";
      } else {
        footerCta.style.display = "";
      }
    }
  }

  (async function boot() {
    // Order matters: admin URL params must apply before anything calls
    // isAdmin() or loadShoots(); chrome wiring must precede first render.
    applyAdminUrlParams();
    initLightbox();
    initImageErrorHandling();
    initNav();
    initAdminControls();
    initThemeControls();
    initStudioSettingsControls();
    initHeaderScroll();
    initRouting();
    try {
      $("#year").textContent = new Date().getFullYear();
      initBranding();
      updateAdminBtn();
      await loadShoots();
      render();
      initFooterReveal();
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
      resolveBootReady();
    }
  })();
})();

// Register Service Worker for PWA Offline Caching
if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    // No ?v= here on purpose. It was hardcoded to 267 and silently missed
    // eight version bumps, because a pinned literal is exactly the drift this
    // whole cache-buster scheme exists to prevent. Browsers revalidate the
    // service-worker script on their own; the version lives inside sw.js.
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

/* One-time auto-update for returning visitors.
   Friends kept landing on an old build: their browser still held a cached HTML
   document that asked for an older app.js?v=, so bumping the version could
   never reach them — the stale page never requested the new file.
   The page knows which build it came from (the ?v= on its own <script>). sw.js
   is fetched with cache:"no-store" to find out which build is actually live. On
   a mismatch the visitor is sent to the same URL with a cache-busting
   parameter, which forces a genuinely fresh document rather than the cached one
   a plain reload would return. The parameter is stripped from the address bar
   on arrival, and the sessionStorage guard is keyed to the live version, so
   this can never loop. */
(function autoUpdateStaleVisitors() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.has("_v")) {
      const clean = new URL(location.href);
      clean.searchParams.delete("_v");
      history.replaceState(null, "", clean.pathname + clean.search + clean.hash);
    }
    const tag = document.querySelector('script[src*="app.js"]');
    const loaded = tag && (String(tag.getAttribute("src")).match(/[?&]v=(\d+)/) || [])[1];
    if (!loaded) return;

    // The beacon URL is made unique per check. cache:"no-store" only bypasses
    // the BROWSER cache; sw.js is served with max-age=14400, and Cloudflare
    // does not honour a client's no-cache header, so the plain URL could hand
    // back a version number up to four hours old — the check would then report
    // "you are current" to a visitor who was not. A URL nothing has seen before
    // cannot be served from any cache, browser or edge.
    const beacon = () => fetch(`/sw.js?cb=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((txt) => (String(txt).match(/ASSET_VERSION\s*=\s*"(\d+)"/) || [])[1] || "");

    const checkOnce = () => beacon()
      .then((live) => {
        if (!live || live === loaded) return;
        if (sessionStorage.getItem("wps-updated-to") === live) return;
        sessionStorage.setItem("wps-updated-to", live);
        // Drop the service worker's precache too, so its offline fallback
        // cannot hand back the build we are trying to leave behind.
        const dropCaches = (window.caches && caches.keys)
          ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {})
          : Promise.resolve();
        dropCaches.then(() => {
          const next = new URL(location.href);
          next.searchParams.set("_v", live);
          location.replace(next.toString());
        });
      })
      .catch(() => {});

    checkOnce();

    // A tab left open for hours never reloads, so it would sit on whatever
    // build it started with. Re-check when the visitor comes back to it,
    // throttled to once a minute so switching tabs is not a stream of requests.
    let lastCheck = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheck < 60000) return;
      lastCheck = Date.now();
      checkOnce();
    });
  } catch (e) {}
})();


window.filterAlbumGrid = function(filterKey, btnEl) {
  document.querySelectorAll('.album-filter-pill').forEach(btn => {
    btn.style.background = 'var(--paper)';
    btn.style.color = 'var(--ink)';
    btn.style.borderColor = 'var(--line)';
  });
  if (btnEl) {
    btnEl.style.background = 'var(--accent)';
    btnEl.style.color = '#ffffff';
    btnEl.style.borderColor = 'var(--accent)';
  }
  const cards = document.querySelectorAll('#albumsMainGrid .noth-work');
  cards.forEach(card => {
    const cat = (card.getAttribute('data-category') || '').toLowerCase();
    if (filterKey === 'all') {
      card.style.display = 'block';
    } else if (cat.includes(filterKey)) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
};
// The menu index spans were removed from index.html; a cached copy of the
// page can still carry them, so strip any that arrive.
document.querySelectorAll(".nav-idx").forEach(el => el.remove());
