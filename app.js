/* ============================================================
   § BROWSER STORAGE SAFETY NET
   ============================================================ */
/* Safari's "Block All Cookies" and Chrome's "block all site data" make even
   READING localStorage throw a SecurityError. The site reads it very early
   (isAdmin, the theme, the loader's seen-flag), so that one throw used to
   abort the boot before the loader was dismissed and leave those visitors on
   a black screen with "STUDIO 000" forever (Sep 2026 audit). Swapping in an
   in-memory stand-in keeps everything working for the session; nothing is
   remembered after the tab closes, which is exactly what the visitor asked
   their browser for. */
(function installStorageSafetyNet() {
  const inMemory = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
      setItem: (k, v) => { m.set(String(k), String(v)); },
      removeItem: (k) => { m.delete(String(k)); },
      clear: () => m.clear(),
      key: (i) => [...m.keys()][i] ?? null,
      get length() { return m.size; }
    };
  };
  ["localStorage", "sessionStorage"].forEach((name) => {
    let broken = false;
    try {
      const store = window[name];
      const probe = "__wps_probe__";
      store.setItem(probe, "1");
      store.removeItem(probe);
    } catch (e) { broken = true; }
    if (!broken) return;
    try {
      Object.defineProperty(window, name, { configurable: true, writable: true, value: inMemory() });
      window.__wpsStorageIsMemoryOnly = true;   // nothing survives a reload
    }
    catch (e) { console.warn(`${name} is blocked and could not be stood in for; some settings will not stick.`); }
  });
})();

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
// A switch, not a delete: a code turned off keeps its wording and its
// settings and can be turned back on. Absent means on, so every code saved
// before this existed carries on working untouched.
window.promoCodeIsActive = function(entry) {
  return !!entry && entry.active !== false;
};

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
  // "fixed" says what the room costs with this code rather than what comes off
  // it. It is still returned as a discount — the gap between the standard rate
  // and that price — so every total, contract and email downstream keeps
  // working with no idea this option exists.
  if (hs.type === "fixed") {
    const price = Math.max(0, Math.round(rawVal));
    const amount = Math.max(0, fee - price);
    // A code can bring the rental down, never up, so a price set above the
    // standard rate leaves the client paying the standard rate. The label says
    // what they actually pay rather than the number that was typed in.
    const paid = fee - amount;
    return { amount, isFree: paid <= 0, label: paid <= 0 ? "FREE" : `STUDIO ₹${paid.toLocaleString("en-IN")}` };
  }
  return { amount: 0, isFree: false, label: "" };
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
    { code: "NERDYHOME", desc: "Home Studio TFP Collaboration Unlock (Location Locked)", location: "Home studio, Sector 46, Noida" },
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

/* ============================================================
   § ADMIN NO-CODE DYNAMIC PACKAGE & PRICING MANAGEMENT ENGINE
   ============================================================ */
// Only ever reached when the published data.js could not be read. The ids
// match the published ones (they were pkg1…pkg5 against the real pkg_1…pkg_5,
// so every rule that filters by id quietly matched nothing offline), and the
// prices are NOT treated as quotable — see pricesArePublished(): a booking is
// taken without a quote rather than at a figure that may not be the studio's.
const DEFAULT_PACKAGES = [
  { id: "pkg_1", name: "Basic Test / Comp Card", price: 7000, specs: "20 Proof Clicks + 0 Retouched" },
  { id: "pkg_2", name: "Mini Portfolio", price: 10000, specs: "25 Proof Clicks + 3-5 Retouched Clicks" },
  { id: "pkg_3", name: "Standard Editorial Portfolio", price: 25000, specs: "50 Unedited + 8-12 Retouched Clicks" },
  { id: "pkg_4", name: "Premium Brand Campaign", price: 50000, specs: "100 Unedited + 15-25 Retouched Clicks" },
  { id: "pkg_5", name: "High-End Full Day Production", price: 75000, specs: "Full Gallery + 30+ Retouched Master Assets" }
];

/* Are the prices on screen the studio's own?

   The booking form quoted from the built-in list whenever data.js failed to
   load, and those figures had drifted from the published ones — a home studio
   at ₹3,000 against the real ₹2,000, a test-shoot rental at ₹3,000 against
   ₹4,000. Nothing said anything was wrong, so a wrong total could go into a
   contract email (Sep 2026 audit). When the answer here is false the form
   shows no figures at all and says why. */
function pricesArePublished() {
  try {
    const pub = window.WPS_DATA && window.WPS_DATA.PACKAGES;
    if (Array.isArray(pub) && pub.length) return true;
    // The studio's own device holds its prices locally, and is the one place
    // they are authoritative without a publish.
    return !!localStorage.getItem("wps_custom_packages");
  } catch (e) { return false; }
}
window.pricesArePublished = pricesArePublished;

// Fixed rental added to a PAID booking when the client picks the home studio.
// Editable in the pricing panel and published with the rest of the rates, so
// the number a client is quoted is the number the studio set — the whole point
// of publishing PACKAGES rather than keeping rates on one device.
const DEFAULT_HOME_STUDIO_RATE = 3000;

// Where the home studio is, as contracts, quotes and the booking form name it.
// Only the area: the exact address of a private residence is shared on
// confirmation, never published.
// Campaign / production payment schedule, switched on the Calendar admin
// page and published with the calendar settings. "503020" is the original
// three-step split; "50301010" holds the last 20% back as two 10% steps —
// one when the clicks are finalised, one after they are delivered. The brief
// form shows whichever is set, and the enquiry email records the same one.
const PRODUCTION_SCHEDULES = {
  "503020": {
    label: "50 / 30 / 20",
    steps: [
      ["At booking", "50% advance retainer, plus the studio and lighting cost in full"],
      ["At wrap", "30%"],
      ["Before final delivery", "20%"]
    ],
    text: "50% advance + studio & lighting cost at booking · 30% at wrap · 20% before final delivery"
  },
  "50301010": {
    label: "50 / 30 / 10 / 10",
    steps: [
      ["At booking", "50% advance retainer, plus the studio and lighting cost in full"],
      ["At wrap", "30%"],
      ["On finalising the clicks", "10%"],
      ["After delivery of the clicks", "10%"]
    ],
    text: "50% advance + studio & lighting cost at booking · 30% at wrap · 10% on finalising the clicks · 10% after delivery of the clicks"
  }
};
// Package payment milestones, switched on the Calendar admin page. The legs
// split the package rate only — a studio rental is always due in full with
// the advance — and every place that quotes them (the flowchart, the quote
// card, the contract text, the terms sheet, the emails, the admin PDF) reads
// this table, so a schedule added here appears everywhere at once. The 50/50
// and 50/30/20 wording is the text those places carried before the table.
const PACKAGE_SCHEDULES = {
  "5050": {
    label: "50 / 50",
    legs: [50, 50],
    quoteSteps: ["Step 2 · 50% Wrap Balance (Prior to Deliverables)"],
    emailLegs: ["Balance {amt} at wrap, before any file is released"],
    short: "50% before the shoot · 50% before delivery",
    contract: "Standard 50/50 Milestones (50% Advance Retainer before shoot day start [non-refundable]; 50% Final Balance after shoot wrap prior to receiving any downloadable file [non-refundable])",
    sheet: "50% advance retainer before the shoot day (non-refundable), 50% final balance after wrap and before any downloadable file (non-refundable)",
    release: "Deliverables are released only after the final milestone is cleared.",
    pdf: "Standard 50/50 Milestones (50% Advance Retainer prior to shoot start [non-refundable]; 50% Final Balance prior to file download [non-refundable])."
  },
  "503020": {
    label: "50 / 30 / 20",
    legs: [50, 30, 20],
    quoteSteps: ["Step 2 · 30% Review Milestone (After Shoot)", "Step 3 · 20% Final Deliverables"],
    emailLegs: ["Review milestone {amt} after the shoot", "Final release {amt} before download"],
    short: "50% before the shoot · 30% at wrap · 20% on delivery",
    contract: "3-Tier Campaign Milestones (50% Advance Retainer before shoot day start [non-refundable]; 30% Review Milestone after shoot before proofing gallery [non-refundable]; 20% Final Release prior to receiving any downloadable file)",
    sheet: "50% advance retainer before the shoot day (non-refundable), 30% review milestone after the shoot and before the proofing gallery (non-refundable), 20% final release before any downloadable file",
    release: "Deliverables are released only after the final milestone is cleared.",
    pdf: "3-Tier Milestones (50% Advance Retainer / 30% Proofing / 20% Final Deliverables)."
  },
  "50301010": {
    label: "50 / 30 / 10 / 10",
    legs: [50, 30, 10, 10],
    quoteSteps: ["Step 2 · 30% Review Milestone (After Shoot)", "Step 3 · 10% On Finalising the Clicks", "Step 4 · 10% After Delivery of the Clicks"],
    emailLegs: ["Review milestone {amt} after the shoot", "{amt} on finalising the clicks", "{amt} after delivery of the clicks"],
    short: "50% before the shoot · 30% at wrap · 10% on finalising the clicks · 10% after delivery",
    contract: "4-Tier Campaign Milestones (50% Advance Retainer before shoot day start [non-refundable]; 30% Review Milestone after shoot before proofing gallery [non-refundable]; 10% once the selection of clicks is finalised; 10% after delivery of the retouched clicks)",
    sheet: "50% advance retainer before the shoot day (non-refundable), 30% review milestone after the shoot and before the proofing gallery (non-refundable), 10% once the selection of clicks is finalised, 10% after the retouched clicks are delivered",
    release: "Retouched deliverables are released once the third milestone is cleared; the final 10% is due after delivery.",
    pdf: "4-Tier Milestones (50% Advance Retainer / 30% Proofing / 10% on finalising the clicks / 10% after delivery)."
  }
};
function getPackageScheduleKey() {
  const key = window.WPS_DATA && window.WPS_DATA.CALENDAR_SETTINGS && window.WPS_DATA.CALENDAR_SETTINGS.paymentScheduleType;
  return PACKAGE_SCHEDULES[key] ? key : "5050";
}
// The package portion split into the schedule's legs. The first leg also
// carries the studio rental, and the last leg absorbs rounding so the legs
// always add back up to the total exactly.
function splitPackageMilestones(packageNet, homeStudioFee, key) {
  const legs = (PACKAGE_SCHEDULES[key] || PACKAGE_SCHEDULES["5050"]).legs;
  const net = Math.max(0, Number(packageNet) || 0);
  const amounts = legs.map((p) => Math.round(net * p / 100));
  amounts[amounts.length - 1] = Math.max(0, net - amounts.slice(0, -1).reduce((a, b) => a + b, 0));
  amounts[0] += Math.max(0, Number(homeStudioFee) || 0);
  return amounts;
}

function getProductionSchedule() {
  const key = window.WPS_DATA && window.WPS_DATA.CALENDAR_SETTINGS && window.WPS_DATA.CALENDAR_SETTINGS.productionScheduleType;
  const use = PRODUCTION_SCHEDULES[key] ? key : "503020";
  return { key: use, ...PRODUCTION_SCHEDULES[use] };
}

const HOME_STUDIO_AREA = "Sector 46, Noida";
const HOME_STUDIO_NAME = `Home studio, ${HOME_STUDIO_AREA}`;

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

// Model portfolio PDF: whether clients can buy the one- or two-page PDF they
// build from a model's pose-tagged photos, what it costs, and the UPI ID that
// receives it. Published with the other rates, because visitors can only read
// data.js. Off until the studio switches it on: no client sees the buy button
// and Model Portfolio stays out of the menu. A price of 0 makes it free.
const DEFAULT_PORTFOLIO_PDF = { enabled: false, price: 50, upiId: "" };

/* How every line of the portfolio PDF is set. Each entry is one line the
   studio can point at on the page, so the editor can name it in their words
   rather than in the code's.

   Only the four families the site already loads are offered. Adding another
   would put a whole new font on every visitor's first paint — the opposite of
   the work that took the site from six families to four — and the PDF is drawn
   on a canvas, which can only use a font the page has already loaded.

   The model's name has no size here on purpose: it is fitted to the width it
   has to fill, so a fixed size would either overflow the page or leave a gap.
   Family, weight and colour still apply to it. */
const PDF_TYPE_FAMILIES = {
  display: { label: "Archivo (headings)", stack: "Archivo, Inter, 'Helvetica Neue', Arial, sans-serif" },
  sans: { label: "Inter (plain text)", stack: "Inter, 'Helvetica Neue', Arial, sans-serif" },
  mono: { label: "IBM Plex Mono (labels)", stack: "'IBM Plex Mono', monospace" },
  serif: { label: "Fraunces (serif)", stack: "Fraunces, Georgia, serif" }
};
const PDF_TYPE_ROLES = [
  { key: "name", label: "The model's name", note: "Size is fitted to the page", sized: false, family: "display", weight: 800, color: "#000000" },
  { key: "role", label: "What they are cast for", note: "The line under the name", sized: true, adaptive: true, family: "mono", size: 2.0, weight: 600, color: "auto" },
  { key: "statLabel", label: "Stat headings", note: "HEIGHT, CHEST, WAIST…", sized: true, family: "mono", size: 2.0, weight: 600, color: "#8a8782" },
  { key: "statValue", label: "The stats themselves", note: "5'9, 38-40, 30…", sized: true, family: "sans", size: 3.3, weight: 600, color: "#000000" },
  { key: "header", label: "The line along the top", note: "MODEL PORTFOLIO · UPDATED…", sized: true, adaptive: true, family: "mono", size: 2.3, weight: 600, color: "auto" },
  { key: "brand", label: "Your name on the page", note: "In the header and the credit", sized: true, adaptive: true, family: "mono", size: 2.3, weight: 700, color: "auto" },
  { key: "photoTag", label: "Labels on the photos", note: "FRONT, LEFT PROFILE, CLOSE-UP", sized: true, family: "mono", size: 2.0, weight: 600, color: "#ffffff" },
  { key: "note", label: "The booking note", note: "“To book this talent…”", sized: true, family: "sans", size: 2.1, weight: 400, color: "#8a8782" },
  { key: "footer", label: "The book-a-shoot line", sized: true, family: "mono", size: 2.2, weight: 700, color: "#000000" },
  { key: "fine", label: "The small print", sized: true, family: "sans", size: 1.9, weight: 400, color: "#9a9791" }
];
const PDF_TYPE_WEIGHTS = [400, 500, 600, 700, 800];
// A rule drawn just inside the edge of every page. Off by default: the pages
// are designed to run to the paper, and a frame is a choice, not a fix.
const DEFAULT_PDF_BORDER = { on: false, width: 0.5, inset: 6, color: "#141416" };
const cleanPdfBorder = (o) => {
  const b = { ...DEFAULT_PDF_BORDER };
  if (!o || typeof o !== "object") return b;
  b.on = o.on === true;
  const w = Number(o.width), i = Number(o.inset);
  // Millimetres. A hairline under 0.1 does not print; past 4 it is a band.
  if (Number.isFinite(w) && w >= 0.1 && w <= 4) b.width = Math.round(w * 10) / 10;
  // Far enough in to clear nothing, close enough not to crowd the content.
  if (Number.isFinite(i) && i >= 0 && i <= 20) b.inset = Math.round(i * 10) / 10;
  if (typeof o.color === "string" && HEX_RE.test(o.color.trim())) b.color = o.color.trim().toLowerCase();
  return b;
};
window.DEFAULT_PDF_BORDER = DEFAULT_PDF_BORDER;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const defaultPdfType = () => {
  const out = {};
  for (const r of PDF_TYPE_ROLES) {
    out[r.key] = { family: r.family, weight: r.weight, color: r.color };
    if (r.sized) out[r.key].size = r.size;
  }
  return out;
};
// Anything unrecognised falls back to the built-in value rather than reaching
// the drawing code, where a bad number means text off the edge of the page.
const cleanPdfType = (o) => {
  const base = defaultPdfType();
  if (!o || typeof o !== "object") return base;
  for (const r of PDF_TYPE_ROLES) {
    const got = o[r.key];
    if (!got || typeof got !== "object") continue;
    const t = base[r.key];
    if (PDF_TYPE_FAMILIES[got.family]) t.family = got.family;
    if (PDF_TYPE_WEIGHTS.includes(Number(got.weight))) t.weight = Number(got.weight);
    if (typeof got.color === "string") {
      const c = got.color.trim().toLowerCase();
      if (HEX_RE.test(c)) t.color = c;
      else if (c === "auto" && r.adaptive) t.color = "auto";
    }
    if (r.sized) {
      const n = Number(got.size);
      // Millimetres on an A4 page: under 1 is unreadable, over 20 cannot fit.
      if (Number.isFinite(n) && n >= 1 && n <= 20) t.size = Math.round(n * 10) / 10;
    }
  }
  return base;
};
window.PDF_TYPE_FAMILIES = PDF_TYPE_FAMILIES;
window.PDF_TYPE_ROLES = PDF_TYPE_ROLES;
window.PDF_TYPE_WEIGHTS = PDF_TYPE_WEIGHTS;
window.defaultPdfType = defaultPdfType;
// name@handle, as UPI apps take it. CI holds the published value to the same
// pattern (.github/scripts/validate-data.mjs).
const UPI_ID_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;
function getPortfolioPdfSettings() {
  const clean = (o) => {
    if (!o || typeof o !== "object") return null;
    const price = Number(o.price);
    const upiId = typeof o.upiId === "string" ? o.upiId.trim() : "";
    return {
      enabled: o.enabled === true,
      price: Number.isInteger(price) && price >= 0 ? price : DEFAULT_PORTFOLIO_PDF.price,
      upiId: UPI_ID_RE.test(upiId) ? upiId : "",
      type: cleanPdfType(o.type),
      border: cleanPdfBorder(o.border)
    };
  };
  try {
    const saved = clean(JSON.parse(localStorage.getItem("wps_portfolio_pdf") || "null"));
    if (saved) return saved;
  } catch(e) {}
  return clean(window.WPS_DATA && window.WPS_DATA.PORTFOLIO_PDF) || { ...DEFAULT_PORTFOLIO_PDF };
}
window.getPortfolioPdfSettings = getPortfolioPdfSettings;

/* Which device last changed a setting. Prices, invite and promo codes, the
   portfolio-PDF settings and the studio rates are NOT merged at publish time
   the way albums and books are: whatever the publishing device holds wins. So
   a price edited on the phone was silently restored to the laptop's older copy
   the next time the laptop published anything (Sep 2026 audit). Every local
   save stamps the key; the stamps are published alongside the values, and the
   publish keeps whichever side is newer. */
const SETTINGS_KEYS = {
  PACKAGES: "wps_custom_packages",
  TFP_PACKAGE: "wps_tfp_package",
  INVITE_CODES: "wps_custom_invite_codes",
  PROMO_CODES: "wps_custom_promo_codes",
  PORTFOLIO_PDF: "wps_portfolio_pdf",
  HOME_STUDIO_RATE: "wps_home_studio_rate",
  HOME_STUDIO_RATE_TFP: "wps_home_studio_rate_tfp"
};
function stampSetting(storageKey) {
  try { localStorage.setItem(`wps_at_${storageKey}`, String(Date.now())); } catch (e) {}
}
function settingStamp(storageKey) {
  try { return Number(localStorage.getItem(`wps_at_${storageKey}`)) || 0; } catch (e) { return 0; }
}
// The stamps to publish: this device's, except where the live file already
// carries a newer one for a value we are about to re-publish unchanged.
function localSettingStamps() {
  const out = {};
  Object.entries(SETTINGS_KEYS).forEach(([field, storageKey]) => { out[field] = settingStamp(storageKey); });
  return out;
}
window.stampSetting = stampSetting;
window.settingStamp = settingStamp;
window.localSettingStamps = localSettingStamps;
window.SETTINGS_KEYS = SETTINGS_KEYS;

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
window.ACTIVE_CONTRACTS = { commercial: "V3.7-COMMERCIAL", tfp: "V3.7-TFP" };

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
    <h4 style="margin: 0 0 6px 0; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--danger-text);">${sectionNumber}. CALL TIME, GRACE PERIOD, LATE ARRIVAL &amp; NO-SHOW</h4>
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
   §9  Published data            (parsers for data.js; publishing is admin.js)
   §10 Lightbox                  (viewer, sidebar, keyboard/touch nav)
   §11 Site chrome               (overlay nav, admin & theme controls)
   §12 Views                     (HTML builders for every route)
   §13 View wiring               (upload form, booking form, cards)
   §14 Router                    (routes, render, SEO metadata)
   §15 Animation & loader        (reveals, counters, boot loader)
   §16 Comp cards & PDFs         (the two buttons; the machinery is elsewhere)
   §17 Boot                      (init order, first render)

   The studio's own half — /calendar, /contracts, /upload, the code, package
   and contract editors, and publishing to the repository — is in admin.js,
   fetched by loadAdmin() the moment admin mode is on. A visitor never asks
   for it. See the header of that file.

   The comp-card print sheet, the A4 PDF writer and the pose-picking builder
   behind "Export comp card PDF" and "Make portfolio PDF" are in pdf-tools.js,
   fetched by loadPdfTools() on the first press of either button. They are
   visitor-facing, not admin — but most visitors never press either, and it is
   ~150 KB. See the header of that file.
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
  // Kinds of work a photo can be (config.js `looks`) and who an album was made
  // for (`clients`). .github/scripts/build-seo.mjs writes the "What I shoot"
  // pages with the same rules as albumLook / photoLook / albumClients and
  // albumOnClientPage below: keep the two in step.
  const LOOKS = Array.isArray(cfgData.looks) ? cfgData.looks : [];
  const CLIENTS = Array.isArray(cfgData.clients) ? cfgData.clients : [];
  const lookByKey = new Map(LOOKS.map((l) => [l.key, l]));
  const clientByKey = new Map(CLIENTS.map((c) => [c.key, c]));
  const lookLabel = (k) => (lookByKey.get(k) || {}).label || "";
  // What an album is filed as, which its untagged photos follow. Activity
  // decides first; Type only where a look names one (Fine Art → Creative).
  const albumLook = (s) => ((LOOKS.find((l) => (l.activities || []).includes(s.activity))
    || LOOKS.find((l) => (l.types || []).includes(s.type)) || {}).key) || "";
  // A photo's own tag wins; an untagged photo follows its album.
  const photoLook = (p, s) => (lookByKey.has(p.look) ? p.look : albumLook(s));
  // Who an album was made for: the main client first, then anyone it is also
  // for. Empty for an album saved before clients existed.
  const albumClients = (s) => (clientByKey.has(s.forClient)
    ? [...new Set([s.forClient, ...(Array.isArray(s.alsoFor) ? s.alsoFor : []).filter((k) => clientByKey.has(k))])]
    : []);
  // Categories: an Activity also lists the albums with a look of that kind
  // inside them — a fitness look in a fashion album is under Fitness too. A look
  // is filed under its first activity (Fashion & Editorial → Fashion).
  const albumHasActivity = (s, activity) => s.activity === activity
    || (s.photos || []).some((p) => p && lookByKey.has(p.look) && (lookByKey.get(p.look).activities || [])[0] === activity);
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // There was a COMP_CARD_API_BASE here, pointing at a Render service
  // (wolverine-photostudio-api.onrender.com) that was written but never
  // deployed. Four calls went to it: a view beacon on every lightbox open, the
  // full booking payload on every agreed contract, and two admin loaders that
  // put the admin passcode in the query string. Render hands an unused
  // subdomain to whoever creates a service with that name, and render.yaml and
  // server.js are in this public repo, so anyone could have taken the name and
  // started receiving clients' names, emails, phones and signatures. All four
  // calls and the host's CSP entry are gone (v443, site audit Sep 2026).
  // Anything server-backed must use a domain the studio owns.

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
  /* An address safe to put in an href. Only http(s), mailto and tel links are
     let through; anything else — "javascript:" above all — becomes an empty
     link rather than something that runs when clicked. Only the studio can
     write these fields today, so this is a lock on a door rather than a fix
     for an open one (Sep 2026 audit). */
  const safeHref = (url) => {
    const u = String(url || "").trim();
    if (!u) return "";
    if (/^(https?:|mailto:|tel:|\/|#|\.\/)/i.test(u)) return u;
    // A bare domain or path with no scheme is fine; anything with a scheme we
    // did not name is not.
    return /^[a-z][a-z0-9+.-]*:/i.test(u) ? "" : u;
  };

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
  /* The picture's real pixel size, written into the tag. Without it a tile has
     no height until its photo arrives: every tile on an album page collapsed
     to nothing, which put all 19 photos inside the browser's lazy-load
     distance, so they were all requested in the same instant and the ones on
     screen queued behind the rest (Sep 2026 audit). It also stops the page
     jumping as each photo lands. */
  const sizeAttr = (p) => (p && p.w && p.h ? ` width="${p.w}" height="${p.h}"` : "");
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
  // Always re-encodes, even when the photo is already small enough. Returning
  // the upload untouched (which this did) published whatever the camera or
  // Lightroom wrote: three files came in around 1 byte per pixel — 1.3 MB for
  // a 1020x1360 photo, six times what it needs — and seven carried full EXIF
  // including the camera body and lens serial numbers and the exact capture
  // time. Drawing through a canvas drops every metadata block and re-encodes
  // at a sane quality, so neither can reach the site again (Sep 2026 audit).
  function resize(dataUrl, maxDim = 1600, q = 0.82) {
    return new Promise((res) => { const img = new Image(); img.onload = () => {
      let { width: w, height: h } = img;
      if (Math.max(w, h) > maxDim) {
        const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s);
      }
      const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h);
      const out = c.toDataURL("image/jpeg", q);
      // A photo that was already lean stays as it was rather than being
      // re-compressed for nothing.
      res(out.length < dataUrl.length ? out : dataUrl);
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
    return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-text); font-weight:700; text-decoration:none; margin-left:${margin}; display:inline-flex; align-items:center; gap:2px;">${esc(label)}${arrow}</a>`;
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

  // Is this album on the Comp Cards page, or on the Model Portfolio page? Each
  // page has its own switch. They used to share one pair of flags, so an album
  // saved before the split has no showOnModelPortfolio and follows its comp
  // card setting: nothing moved on either page when they were separated.
  const showsOnModelPage = (s, page) => {
    if (!s || s.type === "Workshop Attended") return false;
    if (page === "Model Portfolio" && typeof s.showOnModelPortfolio === "boolean") return s.showOnModelPortfolio;
    return qualifiesAsCompCard(s) && !s.hideFromCompCard;
  };

  // Where may a photo be used? Its `usage` is "both" (the default when the
  // field is missing), "portfolio", "comp", or "none" — none meaning it belongs
  // to its album and nowhere else: the home page, the Albums page, the album's
  // own page, the album lightbox and share links still show it, but no comp
  // card, no Model Portfolio page and no portfolio PDF ever will.
  //
  // Both tests ask "is this photo allowed here", never "is it forbidden".
  // That matters: the old exclusion tests (`!p.excludeFromCompCard && p.usage
  // !== "portfolio"`) let any value they had not been taught about through, so
  // "none" would have gone straight onto comp cards. Written this way, a value
  // this build does not know stays off both surfaces instead.
  //
  // Kept as single `const NAME = (p) => …;` statements at this indent because
  // .github/scripts/validate-data.mjs lifts them out of this file by text to
  // run buildCompCardDisplayList in CI.
  const usableOnCompCard = (p) => !!p && !p.excludeFromCompCard && (p.usage === undefined || p.usage === "both" || p.usage === "comp");
  const usableInPortfolio = (p) => !!p && (p.usage === undefined || p.usage === "both" || p.usage === "portfolio");

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
    // A copy saved before clients existed has no forClient at all; one saved
    // since always has the field, even empty, so a cleared client stays cleared.
    if (local.forClient === undefined && published.forClient) {
      local.forClient = published.forClient;
      local.alsoFor = Array.isArray(published.alsoFor) ? published.alsoFor : [];
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
      // isAdmin() actually reads the session flag below, not localStorage's
      // "wps-admin" — without clearing it too, ?admin=0 then ?admin=1 in the
      // same tab silently restored full admin with no passcode re-entry.
      sessionStorage.removeItem("wps-admin");
      // Locking admin mode is harmless and always happens. Forgetting the saved
      // GitHub token is not: it has to be typed in again before anything can be
      // published, and this used to happen silently — so a link ending in
      // ?admin=0 from anyone at all cost the studio its token with one tap.
      // Ask first, and keep the token if the answer is no (site audit Sep 2026).
      if (localStorage.getItem("wps-github-pat")
        && window.confirm("Forget the saved GitHub token on this device?\n\nYou will have to enter it again the next time you publish. Admin mode is being locked either way.")) {
        localStorage.removeItem("wps-github-pat");
      }
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
  /* Another site can put this page inside a frame, cover it, and lure clicks
     onto controls the person cannot see — worth doing only while the studio is
     signed in, since that is where the destructive buttons are. A
     frame-ancestors header is the proper fix and only the host can set one, so
     until then admin mode simply does not exist inside a frame: there is
     nothing to aim a click at. Reading window.top across origins throws, and
     that throw is itself the answer (site audit Sep 2026).

     The one iframe this app makes is the contract print sheet, which is
     written into the frame directly and never loads this script, so it is not
     affected. */
  const isFramed = () => { try { return window.top !== window.self; } catch (e) { return true; } };
  const isAdmin = () => !isFramed() && isAdminAuthorized() && sessionStorage.getItem("wps-admin") === "1";

  /* The studio's own half of the app — the /calendar, /contracts and /upload
     screens, the code and package editors, the contract archive, publishing —
     lives in admin.js and is fetched only once admin mode is on. It is a
     third of the application, and a visitor has no use for any of it.
     Memoised, and the same version as the rest of the site: scraped off the
     app.js tag rather than written down, because a pinned literal is exactly
     the drift the cache-buster exists to prevent (see book-builder.js). */
  let adminLoad = null;
  function loadAdmin() {
    if (window.WPS_ADMIN) return Promise.resolve(window.WPS_ADMIN);
    if (!adminLoad) {
      adminLoad = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        const v = (document.querySelector('script[src*="app.js?v="]')?.getAttribute("src") || "").split("v=")[1] || "";
        s.src = `/admin.js${v ? `?v=${v}` : ""}`;
        s.onload = () => {
          if (window.WPS_ADMIN) { resolve(window.WPS_ADMIN); return; }
          adminLoad = null;
          reject(new Error("admin.js loaded without WPS_ADMIN"));
        };
        s.onerror = () => { adminLoad = null; reject(new Error("admin.js failed to load")); };
        document.head.appendChild(s);
      });
    }
    return adminLoad;
  }
  // Every publish goes through admin.js. Each caller below is on a path only
  // an admin can reach, so the file is loaded by the time one runs; if it
  // somehow is not, say so rather than reporting a publish that never went.
  const publishToLiveSite = (list, opts) => {
    const fn = window.WPS_ADMIN && window.WPS_ADMIN.publish;
    if (!fn) {
      toast("The studio screens have not loaded, so nothing was published. Reload the page and try again.");
      return Promise.resolve(false);
    }
    return fn(list, opts);
  };
  // studioPagePublic in config.js: false keeps /studio to the admin while it is rethought.
  const studioPageOpen = () => isAdmin() || window.STUDIO_CONFIG?.studioPagePublic !== false;
  
  // Both detectors also answer for /share/… links, because a shared comp card
  // is the same album seen through a different URL: without this it rendered
  // stripped of the stats, socials and model-type badges that are the whole
  // point of sending someone a comp card.
  const sharedAlbumSegment = () => {
    const path = location.pathname.replace(/\/index\.html$/, "");
    // A model's own address. Every /share/ link previews as the same generic
    // card whatever it points at, because one file cannot carry ten models'
    // titles and faces; the deploy writes a page per model instead, and it
    // means exactly what the comp-card share id means (Sep 2026 audit).
    const model = path.match(/^\/models\/([^/]+)/);
    if (model) { try { return "comp-card-" + decodeURIComponent(model[1]); } catch { return "comp-card-" + model[1]; } }
    if (!/^\/share(\/|$)/.test(path)) return "";
    const raw = new URLSearchParams(location.search).get("a") || (path.match(/^\/share\/([^/]+)/) || [])[1] || "";
    try { return decodeURIComponent(raw); } catch { return raw; }
  };

  // The model blocks live on the model portfolio service page; the old
  // /categories addresses and every link to them lead there (see render).
  //
  // One page, one detector. The separate Model Portfolio page was folded into
  // these blocks: a model's card now carries both PDFs, so the old address,
  // the old `portfolio-` share links and the fallback /categories views are
  // all the same view, and nothing branches on which address it was reached
  // by. (Before, the two boxes were mutually exclusive BY URL, which is why a
  // portfolio PDF could not be offered beside a comp card.)
  const COMP_CARDS_PAGE = "/services/model-portfolio-shoot-noida/";
  function isCurrentlyCompCardView() {
    if (location.pathname.replace(/\/?$/, "/") === COMP_CARDS_PAGE) return true;
    const search = location.pathname + location.search;
    const decoded = decodeURIComponent(search).replace(/\+/g, " ");
    const shared = sharedAlbumSegment();
    if (shared.startsWith("comp-card-") || shared.startsWith("portfolio-")) return true;
    return search.includes("categories") && (
      search.includes("Comp%20Cards") || decoded.includes("Comp Cards") ||
      search.includes("Model%20Portfolio") || decoded.includes("Model Portfolio") ||
      search.includes("Test%20Shoot") || decoded.includes("Selective Collaboration (TFP)") || search.includes("Test+Shoot")
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

  // The brand became nerdyphotographer.in in July 2026, but albums saved
  // before then credit "nerdyphotographer" or the placeholder "Studio".
  // Corrected as albums load, for visitors and on the studio's own device,
  // and saved with the album the next time it is published.
  const brandName = () => (window.STUDIO_CONFIG && window.STUDIO_CONFIG.studioName) || "nerdyphotographer.in";
  function brandCredit(shoot) {
    if (shoot && typeof shoot.photographer === "string" && /^\s*(nerdyphotographer|studio)\s*$/i.test(shoot.photographer)) {
      shoot.photographer = brandName();
    }
    return shoot;
  }

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
    demoList.forEach(brandCredit);
    validReal.forEach(brandCredit);
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
     §9 · READING THE PUBLISHED data.js
     What is left here is the reading half: the parsers that turn a
     published data.js back into albums and tombstones. They are used by
     the background refresh at the foot of this file, by the studio's
     publish in admin.js, and lifted verbatim by CI
     (.github/scripts/validate-data.mjs) so that what is tested is what
     browsers actually run — which is why they stay in app.js.
     Publishing itself — the per-shoot merge, the photo uploads and the
     single atomic commit — moved to admin.js with the rest of the
     studio's half.
     ============================================================ */

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
  // The object after a quoted key, string-aware, the same way as the arrays
  // above. Not eval or new Function: the site's CSP has no 'unsafe-eval', so
  // running the fetched file would throw in production.
  // undefined = the key is absent (nothing published yet, a valid state);
  // null = present but unreadable, which the caller must treat as a failure.
  // Reads any JSON value that follows a key in the published file: object,
  // array or number. parseObjectAfterKey only ever handled objects.
  function parseValueAfterKey(text, quotedKey) {
    const at = text.indexOf(quotedKey);
    if (at === -1) return undefined;
    const colon = text.indexOf(":", at + quotedKey.length);
    if (colon === -1) return undefined;
    const rest = text.slice(colon + 1);
    const m = rest.match(/^\s*(\{|\[|-?\d)/);
    if (!m) return undefined;
    if (m[1] === "{" || m[1] === "[") {
      const openCh = m[1], closeCh = openCh === "{" ? "}" : "]";
      const start = rest.indexOf(openCh);
      let depth = 0, inStr = false, esc = false;
      for (let i = start; i < rest.length; i++) {
        const c = rest[i];
        if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') { inStr = true; continue; }
        if (c === openCh) depth++;
        else if (c === closeCh && --depth === 0) {
          try { return JSON.parse(rest.slice(start, i + 1)); } catch (e) { return undefined; }
        }
      }
      return undefined;
    }
    const num = rest.match(/^\s*(-?\d+(?:\.\d+)?)/);
    return num ? Number(num[1]) : undefined;
  }

  function parseObjectAfterKey(text, quotedKey) {
    const key = text.indexOf(quotedKey);
    if (key === -1) return undefined;
    try {
      const start = text.indexOf("{", key);
      if (start === -1) return null;
      let depth = 0, inString = false, escaped = false;
      for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (escaped) { escaped = false; continue; }
        if (c === "\\") { escaped = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === "{") depth++;
        else if (c === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
      }
      return null;
    } catch { return null; }
  }
  // Published deletion tombstones. A data.js from before tombstones existed
  // has no DELETED_IDS key — that is a valid empty list, not a parse failure.
  function parseDeletedIdsFromDataJs(text) {
    if (text.indexOf('"DELETED_IDS"') === -1) return [];
    const arr = parseArrayAfterKey(text, '"DELETED_IDS"');
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  }

  // The pricing/codes panel lives outside this scope, so without an exposed
  // handle its Save button could only ever write to this device — which is how
  // a rate edit came to announce "saved to live site" while every client kept
  // being quoted the old price. Returns whether the publish actually landed so
  // the caller can tell the truth about it.
  window.publishStudioDataToLiveSite = () => publishToLiveSite(SHOOTS);

  // The studio portfolio book lives in book-builder.js and is only loaded when
  // the studio opens it. It draws with the same page engine and PDF writer as
  // the model portfolio, so it borrows them from here rather than keeping a
  // second copy that would drift. Admin-only in practice: nothing here reads
  // or writes anything a visitor could not already get from the page.
  //
  // The page engine itself now lives in pdf-tools.js (§16), so the first eight
  // bindings are forwarded rather than held. admin.js's loadBookBuilder waits
  // for that file before it fetches the builder, so window.WPS_PDF is always
  // there by the time the builder calls one of these.
  window.WPS_BOOK_API = {
    newPdfPage: (dpi, size) => window.WPS_PDF.newPdfPage(dpi, size),
    photoFocus: (p) => window.WPS_PDF.photoFocus(p),
    loadImage: (src, cache) => window.WPS_PDF.loadPdfImage(src, cache),
    buildPdf: (pages, title) => window.WPS_PDF.buildPortfolioPdf(pages, title),
    canvasPng: (canvas) => window.WPS_PDF.pdfCanvasPng(canvas),
    canvasJpeg: (canvas, q) => window.WPS_PDF.pdfCanvasJpeg(canvas, q),
    loadQr: () => window.WPS_PDF.loadQrLibrary(),
    studioMark: () => window.WPS_PDF.studioMark(),
    photoSrc: (p) => photoSrc(p),
    shoots: () => SHOOTS,
    isAdmin: () => isAdmin(),
    esc: (x) => esc(x),
    toast: (m) => toast(m),
    publish: () => publishToLiveSite(SHOOTS),
    liveServices: () => liveServiceLinks(),
    packages: () => (typeof window.getAdminPackages === "function" ? window.getAdminPackages() : []),
    config: () => window.STUDIO_CONFIG || {}
  };

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
  // The free comp card, as a box in the model's panel. It is offered when the
  // studio hasn't switched the download off AND at least one photo may go on a
  // comp card — the card itself now shows every photo tagged to the model,
  // whatever its Usage, so "this model has photos" no longer means "this model
  // has a comp card". An admin is told which of the two reasons hid the box,
  // because from the outside they look the same.
  function compCardBoxHtml(shoot) {
    const adminNote = (text) => isAdmin() ? `
      <div class="lb-sidebar-section lb-note lb-note-admin">${text} (admin only sees this)</div>
    ` : "";
    if (shoot.disableCompCardDownload) return adminNote("Comp card PDF download is switched off for this model");
    if (!compCardPdfPhotos(shoot).length) return adminNote("None of this model's photos are set to Comp Card or Both, so there's no comp card to export. Change their Usage in Upload, then publish");
    // Orientation choice is kept per-shoot (not a single global), so picking
    // Landscape for one model and then opening another — or just stepping to
    // that model's next photo — doesn't silently carry the choice over: the
    // toggle shown always matches what Export will actually produce for THIS
    // model.
    const currentOrient = (window.compCardOrientationByShoot && window.compCardOrientationByShoot[shoot.id]) || "portrait";
    const isPortraitActive = currentOrient !== "landscape";
    return `
      <div class="lb-sidebar-section lb-card lb-export">
        <span class="lb-h" style="margin: 0;"><span>Comp card PDF</span><small>Free</small></span>
        <div class="lb-export-head">
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
  }

  // The portfolio PDF, under the comp card box. Anyone can pick photos by pose
  // and preview a one- or two-page PDF; the studio downloads free, clients
  // download once sales are open and pay by UPI. Two switches gate it: "Show
  // on Model portfolio" (this box, nothing else — the model is on the page
  // either way) and whether any photo may go in a portfolio PDF at all.
  function portfolioPdfBoxHtml(shoot) {
    const adminNote = (text) => isAdmin() ? `
      <div class="lb-sidebar-section lb-note lb-note-admin">${text} (admin only sees this)</div>
    ` : "";
    if (!showsOnModelPage(shoot, "Model Portfolio")) return adminNote("\"Show on Model portfolio\" is off for this model, so no portfolio PDF is offered here. Turn it on in Upload, then publish");
    const photoCount = portfolioPdfPhotos(shoot).length;
    if (!photoCount) return adminNote("None of this model's photos are set to Portfolio or Both, so there's no portfolio PDF to build. Change their Usage in Upload, then publish");
    const pdfPrice = getPortfolioPdfSettings().price;
    const exportBtn = `<button class="btn btn-dark btn-block lb-export-btn" onclick="window.printModelPortfolio('${escJs(shoot.id)}')">Make portfolio PDF</button>`;
    if (isAdmin()) {
      const emailToBuy = `Clients download it as watermarked PNGs, and email you to buy the PDF${pdfPrice ? ` (₹${pdfPrice})` : ""}.`;
      const salesNote = !getPortfolioPdfSettings().enabled ? emailToBuy
        : !portfolioPdfSalesOpen() ? `${emailToBuy} Add your UPI ID to sell it on the site.`
        : pdfPrice ? `On for clients: they pay ₹${pdfPrice}.` : "On for clients, free.";
      // A full page load rather than an in-app link, so the lightbox closes;
      // the calendar opens the Portfolio PDF panel when it sees #portfolio-pdf.
      const settingsLink = `<a href="/calendar#portfolio-pdf">Portfolio PDF settings →</a>`;
      return `
        <div class="lb-sidebar-section lb-card lb-export">
          <span class="lb-h" style="margin: 0;"><span>Portfolio PDF</span><small>Free for you</small></span>
          ${exportBtn}
          <p class="lb-note">${esc(salesNote)} ${settingsLink}</p>
        </div>
      `;
    }
    const selling = portfolioPdfSalesOpen();
    // Until sales open, the price and the studio's email, to buy it by mail.
    const mail = selling ? "" : portfolioPdfMailLink(getTalentCleanName(shoot.talent) || (shoot.title || "").trim());
    return `
      <div class="lb-sidebar-section lb-card lb-export">
        <span class="lb-h" style="margin: 0;"><span>Portfolio PDF</span>${pdfPrice && (selling || mail) ? `<small>₹${pdfPrice}</small>` : ""}</span>
        ${exportBtn}
        <p class="lb-note">${selling ? "Pick photos by pose (front, side, back) and download a 1 or 2 page PDF to send to casting directors and designers." : `Pick photos by pose (front, side, back) and lay out 1 or 2 pages. Free to download as PNG images, with a watermark. ${mail ? `To buy the PDF without it${pdfPrice ? ` for ₹${pdfPrice}` : ""}, email ${mail}.` : "The PDF without it isn't on sale yet."}`}</p>
      </div>
    `;
  }

  function renderLbSidebar(p) {
    const shoot = SHOOTS.find(x => x.id === p.shootId) || p.shoot;
    if (!shoot) return "";
    const isCc = (shoot.type === "Selective Collaboration (TFP)" || shoot.type === "Test Shoot" || shoot.isCompCard) && isCurrentlyCompCardView();
    
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
          return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-text); text-decoration: none; margin-right: 14px; display: inline-block;">${esc(label)}</a>`;
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
          return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-text); text-decoration: none; margin-right: 14px; display: inline-block;">${esc(label)}</a>`;
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
      const agSub = visibleAgencyLinks(shoot, "CompCard").map(l => `<a href="${esc(safeHref(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.label)}${l.kind === "email" ? "" : " ↗"}</a>`).join("");
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
    // One card, one answer: measurements on the page and in this panel follow
    // "Show stats on Comp Cards". "Show stats on Model Portfolio" still
    // decides whether they print inside the portfolio PDF.
    const statsAllowedHere = shoot.showStatsOnCompCard !== false;
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

    // No pose label and no pose filter in this panel: poses are a tool for
    // building the portfolio PDF, not a way to browse a model's card, and the
    // merged panel is the comp card panel plus the portfolio PDF box.

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
    // Where it was shot. The studio's own profiles used to ride along on this
    // row, and unlabelled under a location — two rows below the model's name,
    // where the model has handles of their own — they read as the model's or
    // the venue's. They get a row of their own at the foot of the list now,
    // with the studio named. The links are named by platform: the Kavyar URL
    // ends in a random id, so there is no handle worth showing there.
    const cfg = window.STUDIO_CONFIG || {};
    const studioLinkHtml = (href, platform) =>
      `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${esc(cfg.studioName || "the studio")} on ${platform}" aria-label="${esc(cfg.studioName || "the studio")} on ${platform} (opens in a new tab)">${platform} ↗</a>`;
    const locBits = [];
    if (shoot.location && shoot.location !== "—") locBits.push(`<span class="lb-person">${renderCreditLinks(shoot.location)}</span>`);
    if (locBits.length) groups.push({ label: "Location", rendered: locBits });
    const studioLinks = [];
    if (cfg.instagram) studioLinks.push(studioLinkHtml(cfg.instagram, "Instagram"));
    if (cfg.kavyar) studioLinks.push(studioLinkHtml(cfg.kavyar, "Kavyar"));
    // The model's own handles, unless the model line already links out.
    const modelLinked = hasTalent && groups[0] && groups[0].rendered.some(r => r.includes("href="));
    if ((igHtml || kavyarHtml) && !modelLinked) {
      groups.push({ label: "Socials", rendered: [igHtml, kavyarHtml].filter(Boolean).map(h => `<span class="lb-person">${h}</span>`) });
    }
    if (shoot.pdfUrl && shouldShowField(shoot, "Pdf")) {
      groups.push({ label: "Publication", rendered: [`<span class="lb-person"><a href="${esc(safeHref(shoot.pdfUrl))}" download>Download PDF ↗</a></span>`] });
    }
    // One model on the album and a comp card exists for them: point at it.
    // The share link is the same slug form the Share button hands out.
    const soloModel = hasTalent && shoot.talent.split(",").map(x => x.trim()).filter(Boolean).length === 1;
    // …and that card has photos on it: a model with none has no card, so the
    // link would lead to "Album not found". Any photo counts, because since
    // v415 a card carries every photo tagged to the model whatever its Usage.
    // Testing for a comp-card photo here (as this did) hid the link from a
    // model whose work is all Portfolio Only, though their card exists.
    const hasCompCard = soloModel && !isCcPage && showsOnModelPage(shoot, "Comp Cards")
      // Compared as slugs, because that is how the link resolves: a second
      // album of the same model typed in a different case used to fail this
      // test and hide a link to a card that exists.
      && SHOOTS.some((x) => showsOnModelPage(x, "Comp Cards")
        && slugify(getTalentCleanName(x.talent)) === slugify(getTalentCleanName(shoot.talent))
        && (x.photos || []).length);
    if (hasCompCard) {
      const modelName = getTalentCleanName(shoot.talent);
      const slug = slugify(modelName);
      if (slug) groups.push({ label: "Model portfolio", rendered: [`<span class="lb-person"><a href="/share/?a=comp-card-${encodeURIComponent(slug)}">View ${esc(modelName)}’s model portfolio ↗</a><small class="lb-person-note">Every model on the site has one: all their photographs in one place, with the PDFs the studio offers for them. <a href="${esc(compCardsHref())}" data-link>See all model portfolios ↗</a></small></span>`] });
    }
    // Last row, below every credit that belongs to the shoot: these links are
    // the studio's own, not a credit for the work, and naming the studio on
    // the row is what tells a visitor whose profiles they are.
    if (studioLinks.length) {
      groups.push({
        label: "Follow",
        rendered: [`<span class="lb-person">${esc(cfg.studioName || "The studio")}</span><span class="lb-person lb-person-sub lb-studio-links">${studioLinks.join("")}</span>`]
      });
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

    // Both PDFs, one under the other: the free comp card first, then the
    // portfolio PDF built by pose. Which boxes appear is decided by this
    // model's switches and photos and never by the address — the two used to
    // live on two different pages, which is the whole point of the merge.
    let pdfBtnHtml = "";
    if (isCc) {
      // printCompCard and printModelPortfolio resolve a synthetic album (one
      // with no id in SHOOTS) through this.
      window.currentCompCardShootObj = shoot;
      pdfBtnHtml = compCardBoxHtml(shoot) + portfolioPdfBoxHtml(shoot);
    }

    const disclaimerHtml = isCc ? `
      <p class="lb-disclaimer">To book this talent, connect through their social channels or their representing agency. The photos on this model portfolio were made by nerdyphotographer.in or its affiliates.</p>
    ` : "";

    const metaBits = isCc ? [] : [
      // A photo tagged with its own kind of work says so, rather than the
      // album's Activity: a fitness look in a fashion album is fitness.
      lookByKey.has(p.look) ? `<div><dt>Kind of work</dt><dd>${esc(lookLabel(p.look))}</dd></div>`
        : shoot.activity ? `<div><dt>Activity</dt><dd>${esc(shoot.activity)}</dd></div>` : "",
      shoot.season ? `<div><dt>Season</dt><dd>${esc(shoot.season)}</dd></div>` : ""
    ].filter(Boolean);
    // Comp card panel: every social we have for the model, from the album
    // fields and the model credit alike (same list the PDF prints).
    const socialsHtml = (() => {
      const links = visibleModelLinks(shoot, "CompCard");
      if (!links.length) return "";
      return creditRows([{ label: "Socials", rendered: links.map(l => `<span class="lb-person"><a href="${esc(safeHref(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.label)}${l.kind === "email" ? "" : " ↗"}</a></span>`) }]);
    })();
    return `
      <div class="lb-panel">
        <header class="lb-head">
          <span class="eyebrow lb-eyebrow">${isCc ? "Model portfolio" : p.gridLook ? esc(lookLabel(p.gridLook)) : esc([shoot.brand, publicShootType(shoot)].filter(Boolean).join(" · "))}</span>
          <h2 class="lb-title">${esc(getTalentCleanName(shoot.talent || shoot.title))}</h2>
          ${p.albumHref ? `<a href="${esc(p.albumHref)}" data-link class="link-arrow lb-album-link">See the full album →</a>` : ""}
          ${modelTypeHtml}
          ${shoot.description ? `<p class="lb-desc">${esc(shoot.description)}</p>` : ""}
        </header>
        ${metaBits.length ? `<dl class="lb-meta">${metaBits.join("")}</dl>` : ""}
        ${isCc ? socialsHtml : ""}
        ${agencyHtml}
        ${statsHtml}
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

  // An open photo is a step the Back button can undo. Without this, Back with a
  // photo open ran the router: the page underneath changed while the photo
  // stayed on top of it, and closing it left the visitor on a different page
  // (reported in the Sep 2026 audit; on a phone, Back is how people close
  // things). The entry keeps the same address — a photo has no address of its
  // own — so Back means "close this", and the page under it never moves.
  let lbHistoryEntry = false;
  function openLb(list, idx) {
    if (!list || !list.length) return;   // nothing to show is not a lightbox
    lbReturnFocus = document.activeElement;
    lbList = list; lbIdx = idx; paintLb(); lb.hidden = false;
    document.body.style.overflow = "hidden"; $("#lightboxClose").focus();
    if (!lbHistoryEntry) {
      lbHistoryEntry = true;
      try { history.pushState({ wpsLightbox: true }, "", location.href); } catch {}
    }
  }
  // A logShootView() beacon fired here on every lightbox open, naming the shoot
  // and its talent to the never-deployed Render host. Removed with the rest of
  // that backend (v443). Which shoots get looked at is a question for Google
  // Analytics, which the site already loads.
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
            closeLb(true);   // Edit navigates next
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
              closeLb(true);   // Delete re-renders next
              await delShoot(targetId);
              await loadShoots();
              toast(`Deleted "${targetName}".`);
              render();
              await publishToLiveSite(SHOOTS, { deletedIds: [targetId] });
            }
          });
        });
      }
    }

    // A link in the panel ("See the full album", "See all models' comp cards")
    // leaves the page: the router follows it, and the viewer must not stay open
    // on top of the page it leads to.
    lbSidebar.querySelectorAll("a[data-link]").forEach((a) => a.addEventListener("click", () => closeLb(true)));  // the link navigates next
  }
  function stepLb(d) { if (!lbList.length) return; lbIdx = (lbIdx + d + lbList.length) % lbList.length; paintLb(); }
  // keepHistory: the caller is about to navigate (a sidebar link, Edit,
  // Delete), so leave the history alone — stepping back here would land the
  // synthetic pop in the middle of that navigation and undo it.
  function closeLb(keepHistory) {
    lbPaintToken++;                 // cancel any decode still in flight
    lb.classList.remove("lb-loading");
    lb.hidden = true; lbImg.src = ""; document.body.style.overflow = "";
    // Return focus to the thumbnail/card that opened the viewer.
    if (lbReturnFocus && document.contains(lbReturnFocus)) { try { lbReturnFocus.focus(); } catch {} }
    lbReturnFocus = null;
    if (lbHistoryEntry) {
      lbHistoryEntry = false;
      // Closing by hand spends the entry Back would have spent, so one Back
      // press still leaves the album rather than doing nothing first.
      if (!keepHistory) { lbClosingByHand = true; try { history.back(); } catch { lbClosingByHand = false; } }
    }
  }
  // Set while the line above walks history back; the router ignores that one
  // pop, because the view it would repaint is the one already on screen.
  let lbClosingByHand = false;
  function initLightbox() {
    // Simple focus trap: keep Tab within the lightbox while it's open.
    // Links too: the trap counted only buttons, so the side panel's links —
    // the model's Instagram, their model portfolio, the studio's own — could
    // never be reached with a keyboard (Sep 2026 audit).
    trapTabKey(lb, 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
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
    document.addEventListener("keydown", (e) => {
      if (lb.hidden) return;
      // A radio, a text box or a select inside the viewer owns its own arrow
      // keys: stepping the photo instead is what made Landscape unreachable
      // from the keyboard on the comp-card export (Sep 2026 audit).
      const t = e.target;
      const typing = t && (t.matches("input, select, textarea, [contenteditable]") || t.closest("[role='radiogroup']"));
      if (typing && e.key !== "Escape") return;
      if (e.key === "Escape") closeLb(); else if (e.key === "ArrowLeft") stepLb(-1); else if (e.key === "ArrowRight") stepLb(1); });

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
    // Fixed bars (the booking page's "Total payable / Submit" bar, the
    // upload page's publish bar) sit at the same layer as the menu and were
    // left floating over its footer while it was open. The stylesheet hides
    // them under this class.
    document.body.classList.toggle("menu-open", o);
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

  // There was a "Visits: N (24H) · N (7D)" line in the admin menu here. Its
  // numbers came from Math.sin of the day number, not from any visitor, so it
  // was removed (v442, at the studio's request). Real traffic is in Google
  // Analytics; nothing on a server-less site can count visits itself.

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
      // This entry is the one thing in the menu a visitor can see, so signed
      // out it says only "Admin" rather than announcing a mode and its state.
      // Signed in it says what pressing it will do.
      menuAdminBtnText.textContent = active ? "Sign out of admin" : "Admin";
    }

    // Only in admin mode. A visitor opening the menu saw an ADMIN heading and
    // could open "Studio Links", a form pre-filled with the studio's own
    // addresses that even said "Studio links updated" on save (it changed
    // nothing that lasts, but it should not have been reachable at all —
    // Sep 2026 audit). The passcode prompt behind "Admin Mode" is unaffected:
    // the studio reaches it the same way it always has, by turning admin mode
    // on with the keyboard shortcut or the ?admin=1 address.
    const adminSec = $("#navAdminSec");
    if (adminSec) {
      adminSec.style.display = active ? "block" : "none";
    }

    // "Model portfolio" is shown and hidden by syncServicesNavLink, with What I
    // shoot: it leads to the models' cards on one of those pages (v440).
    const uploadLi = $("#navUploadLi"), bookLi = $("#navBookLi"), workshopLi = $("#navWorkshopLi"), calendarLi = $("#navCalendarLi");
    if (uploadLi) uploadLi.style.display = active ? "block" : "none";
    if (bookLi) bookLi.style.display = active ? "none" : "block";
    if (workshopLi) workshopLi.style.display = "block"; // Always show Workshop in nav
    if (calendarLi) calendarLi.style.display = active ? "block" : "none";
    const bookBuilderLi = $("#navBookBuilderLi");
    if (bookBuilderLi) bookBuilderLi.style.display = active ? "block" : "none";
    // Every shell has its own copy of the menu and footer, so find the links rather than an id.
    document.querySelectorAll('a[href="/studio"], a[href="/studio/"]').forEach((a) => {
      (a.closest(".nav-links li") || a).style.display = studioPageOpen() ? "" : "none";
    });

    if (themeBtn) {
      themeBtn.style.display = active ? "inline-block" : "none";
      updateThemeBtnText();
    }

    window.WPS_ADMIN?.updateReminders?.();
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
      // Before loadShoots and the render below, both of which paint admin
      // chrome: without it the studio would get one visitor-shaped screen and
      // have to navigate again.
      if (turningOn) {
        try { await loadAdmin(); }
        catch (err) { console.error(err); toast("The studio screens could not be loaded. Check the connection and try again."); }
      }
      await loadShoots();
      updateAdminBtn();
      toast(`Admin Mode ${isAdmin() ? "enabled" : "disabled"}.`);
      render();
    };

    // The menu's sign-in entry is built later, in initBranding, so it cannot
    // be wired by the listeners below — it reaches the toggle through here.
    window.__wpsSignIn = toggleAdminModeState;
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
    // The letters are separate elements so they can animate, which makes a
    // screen reader read the heading out one letter at a time ("A l b u m s").
    // The label carries the real word; the pieces are decoration.
    return `<h1 class="reveal kinetic-h1 ${extraClass}" aria-label="${esc(String(word))}"><span class="kinetic-word-inner" aria-hidden="true">${words.join(`<span class="kw-space">&nbsp;</span>`)}</span></h1>`;
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
    // getTalentCleanName on the location too: a venue saved as
    // "Tavish Studio (https://www.instagram.com/studiotavish/?hl=en)" printed
    // the whole address, in capitals, on the workshop card (Sep 2026 audit).
    const meta = [s.brand, s.season, getTalentCleanName(s.location)].filter(v => v && v !== "Personal Project" && v !== "—").join(" · ");
    const title = getTalentCleanName(s.isCompCard ? s.talent : (s.title || "Untitled"));
    // An album with "Show this album on the site" unticked is on no visitor
    // page; only the studio's own view lists it, so the card says so, or it
    // would pass for published. That is what a book-only album is.
    const hidden = s.isPublic === false;
    const hiddenTag = (hidden && isAdmin())
      ? `<span class="noth-work-hidden" style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 800; background: var(--accent); color: #ffffff; padding: 4px 9px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em;">Hidden · book only</span>`
      : "";

    return `
      <article class="noth-work reveal" data-shoot="${s.id}" data-category="${esc(s.type || '')}" data-activity="${esc(s.activity || '')}" data-talent="${esc(s.talent || '')}" style="--d:${(i % 2) * 0.08}s; position: relative; border-radius: 12px; overflow: hidden; background: var(--paper); border: 1px solid var(--line); box-shadow: var(--shadow-sm); transition: transform 0.3s ease, box-shadow 0.3s ease;">
        <button class="noth-work-media" aria-label="View ${esc(title)}" style="position: relative; overflow: hidden; border-radius: 12px 12px 0 0;">
          <!-- Floating micro-badge: shoot type. A photo-count badge used to sit
               opposite it, but a frame count is inventory, not something a
               visitor picks an album by, and it competed with the cover. -->
          ${(typeTag || hiddenTag) ? `
          <div style="position: absolute; top: 12px; left: 12px; z-index: 4; display: flex; gap: 6px; align-items: center;">
            ${typeTag ? `<span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 800; background: rgba(10, 10, 10, 0.75); backdrop-filter: blur(8px); color: #ffffff; padding: 4px 9px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.2); text-transform: uppercase; letter-spacing: 0.05em;">${esc(typeTag)}</span>` : ""}${hiddenTag}
          </div>` : ""}

          <span class="noth-work-backdrop" style="background-image: url('${esc(photoSrc(cover))}');" aria-hidden="true"></span>
          <img src="${esc(photoSrc(cover))}"${srcsetAttr(cover, "(max-width: 620px) 100vw, 100vw")} style="object-position: ${esc(coverPos)}; transition: transform 0.5s ease;" alt="${esc(altFor(s))}" loading="lazy" />
        </button>

        <div class="noth-work-row" style="padding: 16px;">
          <div class="noth-work-titles">
            <h3 class="noth-work-title" style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; margin-bottom: 4px;">${albumPathFor(s) ? `<a href="${esc(albumPathFor(s))}" data-link style="color: inherit; text-decoration: none;">${esc(title)}</a>` : esc(title)}</h3>
            <p class="noth-work-tagline" style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.4;">${esc(tagline)}</p>
          </div>
          <div class="noth-work-meta" style="margin-top: 10px; border-top: 1px solid var(--line); padding-top: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="font-family: var(--mono-font); font-size: var(--font-xs); color: var(--ink-soft);">
              ${meta ? `<span>${esc(meta)}</span>` : ""}
              ${mentorText ? `<div style="font-size: var(--font-xs); color: var(--accent-text); margin-top: 2px; font-weight: 600;">${esc(mentorText)}</div>` : ""}
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="noth-work-cta" style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text);">View Album →</span>
              ${hidden ? "" : `<button class="work-share" data-id="${s.id}" style="background: var(--bone); border: 1px solid var(--line); border-radius: 6px; cursor: pointer; padding: 4px 8px; display: flex; align-items: center; justify-content: center; color: var(--ink); font-size: var(--font-xs);" title="Share album" aria-label="Share album">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>`}
            </div>
          </div>
          ${isAdmin() ? `
            <div class="noth-work-admin" style="margin-top: 10px; display: flex; gap: 12px; width: 100%; border-top: 1px dashed var(--line); padding-top: 10px;">
              <button class="link-arrow work-edit" style="color: var(--accent-text); font-weight: 700; padding: 0; font-size: var(--font-xs); height: auto;" data-id="${s.id}">Edit details →</button>
              <button class="link-arrow work-delete" style="color: var(--danger-text); font-weight: 700; padding: 0; font-size: var(--font-xs); height: auto;" data-id="${s.id}">Delete →</button>
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
        return `<a href="https://instagram.com/${encodeURIComponent(clean)}" target="_blank" rel="noopener" style="color:var(--accent-text); font-weight:600;">@${esc(clean)}</a>`;
      }).join(" · ");
    }

    // Cards render on the homepage / album pages and on the comp card pages;
    // each surface has its own switches for socials, agency and email.
    const repSurface = isCurrentlyCompCardView() ? "CompCard" : "Home";
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
      if (s.modelEmail && showRep(s, "Email", repSurface)) creditsList.push(`Email <a href="mailto:${esc(s.modelEmail)}" style="color:var(--accent-text); font-weight:600;">${esc(s.modelEmail)}</a>`);
      if (igHtml && showRep(s, "ModelInstagram", repSurface)) creditsList.push(`Socials ${igHtml}`);
    } else {
      if (s.photographer || s.secondaryPhotographers) {
        const extra = (s.secondaryPhotographers || "").split(",").map(x => getTalentCleanName(x.trim())).filter(Boolean);
        creditsList.push(`Photo <strong>${esc([s.photographer, ...extra].filter(Boolean).join(", "))}</strong>`);
      }
      if (s.artDirector) creditsList.push(`AD <strong>${esc(s.artDirector)}</strong>`);
      if (s.stylist && s.stylist !== "—") creditsList.push(`Style <strong>${esc(getTalentCleanName(s.stylist))}</strong>`);
      if (s.hair && s.hair !== "—") creditsList.push(`Hair <strong>${esc(getTalentCleanName(s.hair))}</strong>`);
      if (s.mua && s.mua !== "—") creditsList.push(`Makeup <strong>${esc(getTalentCleanName(s.mua))}</strong>`);
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
              <img src="${esc(photoSrc(p))}"${srcsetAttr(p, "(max-width: 620px) 45vw, 22vw")}${sizeAttr(p)} alt="${esc(altFor(s, idx + 1))}" loading="lazy" />
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
            <p class="comp-card-eyebrow">Model portfolio</p>
            ${modelTypeBadgesHtml(s, "margin-top: 10px;")}
          </div>
        ` : ""}
        ${mediaHtml}
        <div class="work-info">
          ${isFutureShoot(s) ? `
            <div class="future-schedule-badge" style="display: inline-block; background: rgba(210,78,26,0.12); color: var(--accent-text); font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 6px 12px; border-radius: 4px; margin-bottom: 16px; border: 1px solid rgba(210,78,26,0.25);">
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
          
          ${s.isCompCard && (latestShoot.height || latestShoot.chest || latestShoot.waist || latestShoot.hips || latestShoot.shoes || latestShoot.modelHair || latestShoot.modelEyes) && s.showStatsOnCompCard !== false ? `
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
            <button class="link-arrow work-open" style="padding: 0;" aria-label="${esc(s.isCompCard ? `View ${getTalentCleanName(s.talent || s.title)}\u2019s details` : `View ${s.title || "project"}`)}">${s.isCompCard ? "View model details" : "View project"} →</button>
            <button class="link-arrow work-share" style="padding: 0; display: inline-flex; align-items: center; gap: 6px;" title="Share this album" aria-label="Share this album">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share link
            </button>
            ${(!s.demo && isAdmin()) ? `
              <button class="link-arrow work-edit" style="color: var(--accent-text); font-weight: 700; padding: 0;" data-id="${s.originalShoots ? s.originalShoots[0].id : s.id}">Edit details</button>
              <button class="link-arrow work-delete" style="color: var(--danger-text); font-weight: 700; padding: 0;" data-id="${s.originalShoots ? s.originalShoots[0].id : s.id}">Delete</button>
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

  // The service landing pages, written at deploy from seo/services.mjs. Listed
  // here for the home-page cards and the menu. A slug is a public address —
  // never rename one.
  //
  // `phrase` reads inside "what a … shoot includes"; `packageIds` are the
  // packages that page prices; `match` is the rule deciding what the page shows
  // — the photos of one `look`, or the albums made for its `clients` — and
  // therefore whether the page exists at all. The build fails if any of the
  // three drifts from seo/services.mjs.
  //
  // The kicker names WHO THE PAGE IS FOR, and all five answer that same
  // question: two named after the client and two after the kind of photograph
  // left a fitness model unable to tell which page was hers.
  const SERVICE_LINKS = [
    { slug: "model-portfolio-shoot-noida", kicker: "For models", title: "Model Portfolios & Comp Cards", phrase: "model portfolio", packageIds: ["pkg_1", "pkg_2", "pkg_3"], match: { clients: ["model", "agency"], modelWork: true }, blurb: "Editorial-grade portfolio building and agency-ready comp cards for new faces and working models, male and female.", cta: "Model portfolio shoots" },
    { slug: "fashion-editorial-photographer-delhi-ncr", kicker: "For magazines & editorial stories", title: "Fashion & Editorial", phrase: "fashion or editorial", packageIds: ["pkg_3", "pkg_4"], match: { look: "fashion" }, blurb: "Concept-led fashion, beauty and editorial stories for designers, stylists and magazine submissions.", cta: "Fashion & editorial" },
    { slug: "fitness-sports-photographer-noida", kicker: "For athletes, coaches & gyms", title: "Fitness & Sports Action", phrase: "fitness or sports", packageIds: ["pkg_2", "pkg_3"], match: { look: "fitness" }, blurb: "Action-freezing athletic portraits and fitness content that shows physique, strength and raw performance.", cta: "Fitness & sports shoots" },
    { slug: "brand-campaign-photographer-noida", kicker: "For brands", title: "Campaigns & Lookbooks", phrase: "brand campaign", packageIds: ["pkg_4", "pkg_5"], match: { clients: ["brand"], types: ["Campaign", "Commercial", "E-commerce"], clientWork: true }, blurb: "High-concept campaigns, lookbooks and e-commerce sets, planned to the shot list and covered by a written contract.", cta: "Brand campaigns" },
    { slug: "designer-stylist-makeup-artist-shoot-noida", kicker: "For designers, stylists & makeup artists", title: "Designers, Stylists & Makeup Artists", phrase: "designer, stylist or makeup", packageIds: ["pkg_2", "pkg_3", "pkg_4"], match: { clients: ["designer", "stylist", "mua"] }, blurb: "Lookbooks, styling portfolios and makeup looks, shot for the designer, stylist or makeup artist whose work is in the frame.", cta: "Shoots for your work" },
    { slug: "creative-shoot-photographer-noida", kicker: "For anyone with an idea", title: "Creative & Conceptual", phrase: "creative or conceptual", packageIds: ["pkg_2", "pkg_3", "pkg_4"], match: { look: "creative", residual: true }, blurb: "Conceptual, themed and personal shoots for artists, makers and performers — the work that fits none of the others.", cta: "Creative shoots" }
  ];

  // A page exists once it has work of its own, and not before. The deploy does
  // not write a page with nothing to show, so the card and the menu link must
  // hide it too or they would lead to a 404. Same rules on both sides (see
  // build-seo.mjs), and the build checks `match` against seo/services.mjs.
  const oneModelAlbum = (s) => { const t = (s.talent || "").trim(); return !!t && !t.includes(",") && !/\s(and|&)\s/i.test(t); };
  const namesClient = (s) => !!(s.client && s.client.trim());
  // Filed as creative on purpose. For an album with no client set this wins over
  // the model-work rule (same as the build).
  const filedAsCreative = (s) => { const c = lookByKey.get("creative") || {}; return (c.activities || []).includes(s.activity) || (c.types || []).includes(s.type); };
  // An album with a client is on the pages for that client and no others. One
  // without falls back to the rules the page kept from before clients existed.
  const albumOnClientPage = (f, s) => {
    const mine = albumClients(s);
    if (mine.length) return (f.clients || []).some((c) => mine.includes(c));
    if (f.types && f.types.includes(s.type)) return true;
    if (f.modelWork && oneModelAlbum(s) && !namesClient(s) && !filedAsCreative(s)) return true;
    if (f.clientWork && namesClient(s)) return true;
    return false;
  };
  // What a page shows: the photos of its look, or the albums made for its clients.
  const serviceWork = (v) => {
    const f = v.match || {};
    const shown = SHOOTS.filter((s) => s && !s.isTestimonial && s.type !== "Workshop Attended" && s.isPublic !== false
      && !isFutureShoot(s) && !s.isCompCard && (s.photos || []).some((p) => p && p.url));
    if (!f.look) return shown.filter((s) => albumOnClientPage(f, s));
    // The catch-all also takes the untagged photos of an album that has no kind
    // of its own and that no client page claims.
    const claimed = (s) => SERVICE_LINKS.some((o) => (o.match || {}).clients && albumOnClientPage(o.match, s));
    return shown.flatMap((s) => s.photos.filter((p) => {
      if (!p || !p.url) return false;
      const k = photoLook(p, s);
      return k === f.look || (!!f.residual && !k && !claimed(s));
    }));
  };
  const liveServiceLinks = () => SERVICE_LINKS.filter((v) => serviceWork(v).length);
  // Where "comp cards" links go: the model portfolio page's cards once that page
  // exists (it is written only when it has work), the old page before then.
  const OLD_COMP_CARDS_HREF = "/categories?kind=type&val=Comp%20Cards";
  const compCardsHref = () => (liveServiceLinks().some((v) => `/services/${v.slug}/` === COMP_CARDS_PAGE) ? `${COMP_CARDS_PAGE}#comp-cards` : OLD_COMP_CARDS_HREF);
  // Upload: the client an album without one already gets from the page rules
  // (Model, Brand), or "" when none applies.
  const legacyClientOf = (s) => {
    const page = SERVICE_LINKS.find((v) => (v.match || {}).clients && albumOnClientPage(v.match, { ...s, forClient: "" }));
    return page ? page.match.clients[0] : "";
  };
  // Upload: what "follows the album" means for the Activity and Type on the form now.
  const followAlbumText = () => {
    const k = albumLook({ activity: $("#f_activity")?.value || "", type: $("#f_type")?.value || "" });
    return k ? `Follows album — ${lookLabel(k)}` : "Follows album";
  };

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
    // The albums ticked "Show on the homepage" in Upload, newest first, six to a
    // page. Home showed every album, which made Albums the same list twice and
    // left that switch doing nothing. An album saved before the switch existed
    // has no value and is shown. This filters the list, never SHOOTS itself.
    const feat = SHOOTS
      .filter(s => !s.isTestimonial && s.type !== "Workshop Attended" && s.featured !== false && !usesHeroPhoto(s));
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
            <h1 class="hero-wordmark hero-wordmark-nerdy" aria-label="nerdyphotographer.in">
              ${nerdyLetters}
            </h1>
            <p class="hero-subword" aria-hidden="true">${subLetters}</p>
          </div>
          <div class="hero-mono-foot">
            <p class="hero-mono-tagline reveal">Not just photos, a perspective. <span class="hero-accent">Editorial-grade portfolios</span> for models &amp; brands.</p>
            <div class="hero-actions reveal">
              <a href="${liveServiceLinks().length ? "/services/" : "/albums"}" data-link class="btn btn-dark">Explore work →</a>
              <a href="${esc(compCardsHref())}" data-link class="btn btn-ghost">Model portfolios</a>
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
          <div><p class="eyebrow">The work</p><h2>Photoshoots</h2></div>
          <a href="/albums" data-link class="link-arrow">All albums →</a>
        </div>
        <div class="noth-work-list" data-paginate="6" aria-label="Photoshoots">${feat.map(nothWorkCard).join("")}</div>
      </section>

      <!-- SERVICES (WHO I SHOOT FOR) -->
      <section class="section container section-divider">
        <div class="section-head section-head-center reveal">
          <p class="eyebrow">Services</p>
          <h2>Who I shoot for</h2>
        </div>
        <div class="services-grid reveal-stagger">
          ${liveServiceLinks().map((v) => `
          <a href="/services/${v.slug}/" data-link class="service-card" style="display: block; text-decoration: none; color: inherit; cursor: pointer;">
            <div class="service-kicker">${esc(v.kicker)}</div>
            <h3>${esc(v.title)}</h3>
            <p>${esc(v.blurb)}</p>
            <span class="link-arrow" style="margin-top: 12px; display: inline-block; font-size: var(--font-xs); font-weight: 700; color: var(--accent-text);">${esc(v.cta)} →</span>
          </a>`).join("")}
        </div>
      </section>

      <!-- QUICK LINKS -->
      <section class="section container">
        <div class="quick-links-grid reveal" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin: 40px 0;">
          <a href="${esc(compCardsHref())}" data-link class="btn btn-dark" style="text-align: center; padding: 16px 24px;">Model portfolios &amp; comp cards →</a>
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

    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">The archive</p>
          ${kineticH1("Albums")}
          <p class="page-sub reveal">${list.length} album${list.length !== 1 ? "s" : ""} in the archive — every photoshoot, newest first.</p>
        </div>
      </section>
      <section class="section container full-bleed" style="padding-top: 0;">
        <div class="noth-work-list" id="albumsMainGrid" data-paginate="9" aria-label="Albums">${list.map(nothWorkCard).join("") || emptyCat()}</div>
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
              <a href="${esc(compCardsHref())}" data-link class="btn btn-ghost">Model portfolios</a>
            </div>
          </div>
        </section>`;
    }
    CURRENT_VIEW_SHOOTS = [album];
    const title = getTalentCleanName(album.isCompCard ? album.talent : (album.title || "Untitled"));
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">Shared ${album.isCompCard ? "Model portfolio" : "Album"}</p>
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
        <div class="noth-work-list">${list.map(nothWorkCard).join("") || `<p class="page-sub">No workshop albums published yet. Go to <a href="/upload" data-link style="text-decoration:underline; font-weight:600; color:var(--accent-text);">Upload</a> to add one with type 'Workshop Attended'.</p>`}</div>
      </section>
    `;
  }

  // The Analytics screen (rankedBarsHtml, renderAnalytics, viewAnalytics and
  // wireAnalytics) lived here. Its only source of numbers was the
  // never-deployed Render host, and its Load button put the admin passcode
  // into a query string. The /analytics route has redirected to home for a
  // long time, so nothing ever reached it. Removed in v443; real traffic is in
  // Google Analytics.

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
      productionScheduleType: (publishedIsNewer ? pub.productionScheduleType : loc.productionScheduleType) || pub.productionScheduleType || loc.productionScheduleType || "503020",
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
    `<span style="display:inline-block; font-size: var(--font-xs); font-weight:700; color: var(--accent-text); border:1px solid var(--accent); border-radius:4px; padding:2px 7px;">\u2713 Agreed via checkbox</span>`;

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
    // NP- for nerdyphotographer.in. Numbers already issued as WPS-… stay as
    // they are: they are on contracts clients already hold.
    return `NP-${timestamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
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
      // When a PDF contract was generated for this date. Set on the hold that
      // printing a contract places, so the roster can say the terms are out
      // and waiting rather than claiming the client already agreed to them.
      contractSentAt: Number(bookingObj.contractSentAt) || 0,
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

  // A hold that is waiting on an answer: the date is penciled in for a named
  // client and terms have gone out, but nobody has signed. These are the only
  // holds the roster offers Accept / Reject on \u2014 a bare "Anticipated Client
  // Hold" you placed to keep a weekend free has nothing to accept.
  function isDecidableHold(b) {
    if (!b) return false;
    if (!(b.isTentative || b.status === "tentative")) return false;
    const name = String(b.name || "").trim();
    if (!name || /^anticipated client hold$/i.test(name)) return false;
    const ver = String(b.contractVersion || "").trim();
    return !!ver && ver !== "Pending Agreement";
  }

  // Printing a contract for an off-site / DM inquiry also pencils the date in,
  // so a day you have already sent terms for stops being offered to anyone
  // else. It lands as a Hold \u2014 visitors see the day as taken \u2014 and stays a
  // hold until you Accept it (it becomes the confirmed shoot) or Reject it
  // (the day goes back on sale). Nothing here confirms anything by itself.
  function createHoldFromContract(details) {
    const dKey = String(details.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dKey)) {
      toast("Contract printed. The shoot date is not a plain YYYY-MM-DD, so no calendar hold was placed \u2014 add it by hand from the calendar.");
      return null;
    }
    const name = String(details.clientName || "").trim() || "Anticipated Client Hold";
    const settings = window.WPS_DATA?.CALENDAR_SETTINGS || {};
    const already = ((settings.bookedDates && settings.bookedDates[dKey]) || [])
      .find(x => String(x.name || "").trim().toLowerCase() === name.toLowerCase());
    if (already) {
      toast(`\u{1F4C5} ${dKey} is already on your calendar for ${name} \u2014 no second hold added.`);
      return already;
    }
    const version = String(details.contractVersion || "").trim();
    const booking = addCalBooking(dKey, {
      name: name,
      email: details.email || "",
      phone: details.phone || "",
      type: details.type || (/tfp|test/i.test(version) ? "Selective Collaboration (TFP)" : "Client Shoot"),
      duration: details.duration || "Full Day",
      location: details.location || "",
      venueByStudio: !!details.venueByStudio,
      isTentative: true,
      status: "tentative",
      notes: details.notes || "",
      budget: details.budget || "",
      homeStudioFee: Number(details.homeStudioFee) || 0,
      finalPayable: Number(details.finalPayable) || 0,
      promoMeta: details.promoMeta || null,
      financials: details.financials || null,
      contractVersion: version || "Pending Agreement",
      // The contract has been sent, not signed. Accept is what marks it agreed.
      agreedToTerms: false,
      contractSentAt: Date.now()
    });
    if (typeof window.refreshAdminCalendarViews === "function") window.refreshAdminCalendarViews();
    toast(`\u{1F4C5} ${dKey} held for ${name}. Accept or Reject the hold once they reply, then Publish the calendar.`);
    return booking;
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
            <h3 style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; margin: 0 0 2px; color: var(--ink);">${esc(label)}</h3>
            <span style="font-size: var(--font-xs); color: var(--ink-soft); font-family: var(--mono-font);">Browse Category Collection</span>
          </div>
          <span style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); display: inline-flex; align-items: center; gap: 4px;">Explore →</span>
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
      const filteredList = list.filter(s => showsOnModelPage(s, d === "Model Portfolio" ? "Model Portfolio" : "Comp Cards") && ((s.instagram && s.instagram.trim()) || (s.kavyar && s.kavyar.trim()) || (s.talent && s.talent.trim())));
      // One card per model, showing EVERY photo tagged to them — Comp Card,
      // Portfolio, Both, or neither. The card is where a visitor judges the
      // model, so it holds all the work; Usage decides only what each PDF may
      // print (usableOnCompCard / usableInPortfolio, applied where the PDFs
      // are built). Before the merge each page filtered the card to its own
      // PDF's photos, which is why one model appeared twice with two different
      // sets of pictures.
      const usableHere = (p) => !!p;
      const groupable = [];
      const nonGroupable = [];
      for (const s of filteredList) {
        const talentClean = (s.talent || "").trim();
        const hasExactlyOneModel = talentClean && !talentClean.includes(",") && !talentClean.toLowerCase().includes(" and ") && !talentClean.toLowerCase().includes("&");
        const hasNoBrandOrClient = (!s.client || !s.client.trim()) && (!s.brand || s.brand === "Personal Project" || !s.brand.trim());
        
        if (hasExactlyOneModel && hasNoBrandOrClient) {
          groupable.push(s);
        } else {
          // An album that cannot be merged into a per-model card (several
          // models, or a brand's job) is shown as itself. It gets a copy
          // holding only the photos allowed on this page — everything
          // downstream (cover, thumbnails, counts, lightbox) reads .photos, so
          // filtering here is what keeps one "none" photo off all of them. The
          // id is kept, so edit, delete and share links still resolve.
          const shown = (s.photos || []).filter(usableHere);
          if (shown.length) nonGroupable.push({ ...s, photos: shown });
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
        // Every photo of the model, from every album of theirs: see usableHere
        // above. A photo's Usage is read again where each PDF is built, never
        // here.
        const allGroupPhotos = shootsInGroup.flatMap(gs => (gs.photos || []).map(p => ({ ...p, parent: gs })));
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
        
        // `portfolio-…` ids exist only so links shared from the retired
        // Model Portfolio page still open this same card; nothing on the site
        // builds that list any more except resolveShareId.
        const isPort = d === "Model Portfolio";
        return {
          id: isPort ? `portfolio-${encodeURIComponent(modelName)}` : `comp-card-${encodeURIComponent(modelName)}`,
          // Display title is cleaned; `talent` below stays raw on purpose,
          // because compCardOwnHandles parses its parentheses to pick the
          // model's own social. Same reason `id` is left alone — changing
          // it would break links already shared for this album.
          title: `${getTalentCleanName(modelName)} — Model portfolio`,
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
          // "Show on Model portfolio" on ANY of this model's albums offers the
          // portfolio PDF on the merged card, because the PDF draws on every
          // album's photos. Without this the merged card had no such field at
          // all, and showsOnModelPage silently fell back to the comp-card
          // switch — the box would have followed the wrong tick.
          showOnModelPortfolio: shootsInGroup.some((s) => showsOnModelPage(s, "Model Portfolio")),
          // "Turn off the comp card download" on any of this model's albums
          // holds for the merged card too. It was never copied here, so on the
          // Comp cards page (which shows only merged cards) the switch did nothing.
          disableCompCardDownload: shootsInGroup.some((s) => s.disableCompCardDownload),
          mentor: latestShoot.mentor || "",
          season: latestShoot.season || "Comp Card",
          photographer: latestShoot.photographer || brandName(),
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
      // A model every one of whose photos is kept off this page gets no card at
      // all, rather than a card with an empty grid that opens a blank lightbox.
      }).filter(a => a.photos.length);
      
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

  /* ---- Album pages (/albums/<slug>/) ---------------------------------------
     Every public album has an address of its own, so Google can index it and
     a link to it previews with the album's own cover. The deploy writes a real
     page at each address (.github/scripts/build-seo.mjs); this is the same
     rule for which albums get one and what the slug is. KEEP THE TWO IN STEP —
     a slug built here that the build did not write is a 404 for crawlers. */
  function albumPageList() {
    // Built from what is published, never from an admin's unpublished drafts:
    // the slugs must come out the same for everyone.
    // A future-dated album is under embargo ("visible to public after …"): an
    // admin's SHOOTS still holds it, so it is dropped here, as the build drops it.
    return SHOOTS.filter((s) => s && !s.isTestimonial && s.type !== "Workshop Attended" && s.isPublic !== false
      && !isFutureShoot(s) && !s.isCompCard && (s.photos || []).some((p) => p && p.url));
  }
  function albumSlugMap() {
    // Oldest album keeps the bare name; a later album of the same name gets its
    // id appended, so a second shoot never moves the first one's address.
    const map = new Map(), taken = new Set();
    const byAge = albumPageList().slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
    for (const s of byAge) {
      const base = slugify(getTalentCleanName(s.title || s.talent)) || slugify(s.id);
      let slug = taken.has(base) ? `${base}-${slugify(s.id)}` : base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${slugify(s.id)}-${n}`;
      taken.add(base); taken.add(slug);
      map.set(s.id, slug);
    }
    return map;
  }
  // "" when the album has no page (private, a workshop, a merged comp card).
  const albumPathFor = (s) => { const slug = s && albumSlugMap().get(s.id); return slug ? `/albums/${slug}/` : ""; };
  function resolveAlbumSlug(slug) {
    let wanted = String(slug || "");
    try { wanted = decodeURIComponent(wanted); } catch { /* literal */ }
    for (const [id, sl] of albumSlugMap()) if (sl === wanted) return SHOOTS.find((s) => s.id === id) || null;
    // The slug is built from the album's name, so renaming the album moves it.
    // Shared links carry the album's id as ?a= for exactly that case; after
    // that, fall back to the forgiving share-link lookup for a hand-typed or
    // older form of the address rather than answer "not found".
    const byId = new URLSearchParams(location.search).get("a");
    const hit = (byId && SHOOTS.find((s) => s.id === byId)) || resolveShareId(wanted, SHOOTS);
    return hit && !hit.isCompCard ? hit : null;
  }
  const albumPlace = (s) => (s.showLocation === false ? "" : getTalentCleanName(s.location).replace(/^—$/, ""));
  const albumNotFoundHtml = () => `
        <section class="page-head">
          <div class="container">
            <h1 class="kinetic-h1">Album not found</h1>
            <p class="page-sub reveal">This link doesn't match any published album. It may have been shared before the album was renamed, or the album may since have been unpublished.</p>
            <div class="hero-actions" style="margin-top: 18px;">
              <a href="/" data-link class="btn btn-dark">Back home →</a>
              <a href="/albums" data-link class="btn btn-ghost">Browse albums</a>
            </div>
          </div>
        </section>`;

  function viewAlbumPage(slug) {
    const album = resolveAlbumSlug(slug);
    if (!album || (album.isPublic === false && !isAdmin())) { CURRENT_VIEW_SHOOTS = []; return albumNotFoundHtml(); }
    CURRENT_VIEW_SHOOTS = [album];
    const name = getTalentCleanName(album.title || album.talent) || "Untitled";
    const place = albumPlace(album);
    const season = (album.season || "").replace(/^—$/, "");
    const eyebrow = [album.activity && `${album.activity} photography`, place, season].filter(Boolean).join(" · ") || "Album";
    const credits = album.showCredits === false ? [] : [
      ["Photographer", getTalentCleanName(album.photographer)], ["Art direction", getTalentCleanName(album.artDirector)],
      ["Styling", getTalentCleanName(album.stylist)], ["Hair", getTalentCleanName(album.hair)], ["Makeup", getTalentCleanName(album.mua)]
    ].filter(([, v]) => v && v !== "—");
    const others = albumPageList().filter((s) => s.id !== album.id)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 3);
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">${esc(eyebrow)}</p>
          ${/[^\x20-\x7e]/.test(name)
            // kineticH1 wraps every UTF-16 unit in its own box, which splits an
            // emoji in two and breaks Devanagari shaping. Owner-typed names get
            // the animation only when they are plain ASCII.
            ? `<h1 class="kinetic-h1 album-page-h1">${esc(name)}</h1>`
            : kineticH1(name, "album-page-h1")}
          ${album.description ? `<p class="page-sub reveal">${esc(album.description)}</p>` : ""}
          ${album.isPublic === false ? `<p class="page-sub reveal album-hidden-note" style="margin-top: 14px; padding: 10px 12px; border: 1px dashed var(--line-2); border-radius: 10px; font-size: var(--font-xs);">Only you can see this album: it is hidden from the site, a book-only album. Its photos are offered in your portfolio book. To put it on the site, tick "Show this album on the site" in Upload → Publish settings.</p>` : ""}
        </div>
      </section>
      <section class="section container album-page">
        <div class="album-page-grid" data-shoot="${esc(album.id)}">
          ${album.photos.map((p, i) => `
            <button type="button" class="album-page-photo" data-index="${i}" aria-label="Open photo ${i + 1} of ${album.photos.length}">
              <img src="${esc(photoSrc(p))}"${srcsetAttr(p, "(max-width: 620px) 100vw, (max-width: 1100px) 50vw, 33vw")}${sizeAttr(p)} alt="${esc(p.caption || altFor(album, i + 1))}" ${i < 3 ? `fetchpriority="${i === 0 ? "high" : "auto"}" decoding="async"` : `loading="lazy" decoding="async"`} />
            </button>`).join("")}
        </div>
        ${credits.length ? `<p class="album-page-credits">${credits.map(([k, v]) => `<span><strong>${esc(k)}</strong> ${esc(v)}</span>`).join("")}</p>` : ""}
        <div class="album-page-actions">
          <button type="button" class="btn btn-ghost work-share" data-id="${esc(album.id)}">Share this album</button>
          <a href="/albums" data-link class="link-arrow">All albums →</a>
        </div>
      </section>
      ${others.length ? `
      <section class="section container section-divider">
        <div class="section-head row reveal">
          <div><p class="eyebrow">Keep looking</p><h2>More albums</h2></div>
          <a href="/albums" data-link class="link-arrow">All albums →</a>
        </div>
        <div class="noth-work-list" aria-label="More albums">${others.map(nothWorkCard).join("")}</div>
      </section>` : ""}
      <section class="cta-band">
        <div class="container reveal">
          <h2>Want pictures like these?</h2>
          <a href="/book" data-link class="btn btn-dark">Book your photoshoot session →</a>
        </div>
      </section>`;
  }

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
  // An album with a page of its own (see "Album pages" above) is better shared
  // by that address: it previews with the album's own cover and title, where
  // every /share/ link shows the same generic card. But that page is written by
  // the deploy, so it does not exist for the first minutes after an album is
  // published, nor if the build step failed — hence albumPageIsLive(), and
  // /share/ as the fallback. ?a=<id> keeps the link working after a rename.
  const albumShareUrlFor = (album) => {
    const own = albumPathFor(album);
    return own ? `${window.location.origin}${own}?a=${encodeURIComponent(album.id)}` : "";
  };
  // A model card's own page, for the same reason: it previews with that
  // model's name and face instead of the one generic "shared album" card.
  const modelPathFor = (album) => {
    const id = String((album && album.id) || "");
    if (!/^(comp-card|portfolio)-/.test(id)) return "";
    const slug = slugify(getTalentCleanName((album && (album.talent || album.title)) || ""));
    return slug ? `/models/${slug}/` : "";
  };
  const ALBUM_PAGE_LIVE = new Map(); // path → Promise<boolean>
  function albumPageIsLive(path) {
    if (!path) return Promise.resolve(false);
    if (!ALBUM_PAGE_LIVE.has(path)) {
      ALBUM_PAGE_LIVE.set(path, fetch(path, { method: "HEAD", cache: "no-store" })
        .then((res) => res.status === 200)
        .catch(() => { ALBUM_PAGE_LIVE.delete(path); return false; }));
    }
    return ALBUM_PAGE_LIVE.get(path);
  }

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
      const unified = buildCompCardDisplayList(list.filter((s) => showsOnModelPage(s, category)), "type", category);
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
          return d === "Model Portfolio" ? showsOnModelPage(s, "Model Portfolio") : qualifiesAsCompCard(s);
        }
        if (kind === "activity") return albumHasActivity(s, d);
        return (kind === "brand" ? s.brand : s.type) === d;
      });

      let displayList = buildCompCardDisplayList(list, kind, d);

      CURRENT_VIEW_SHOOTS = displayList;

      const isTestShoot = (kind === "type" && (d === "Selective Collaboration (TFP)" || d === "Comp Cards" || d === "Model Portfolio"));
      const alphaFilterHtml = isTestShoot ? alphaFilterBarHtml(displayList) : "";

      // A filtered view shows the work but never says what such a shoot costs
      // or what you get. This points up at the page that does. Genres map onto
      // the four pages; anything unmapped simply gets no line.
      const serviceForCategory = (kind2, val) => {
        const byGenre = {
          "Fashion": "fashion-editorial-photographer-delhi-ncr",
          "Editorial": "fashion-editorial-photographer-delhi-ncr",
          "Beauty": "fashion-editorial-photographer-delhi-ncr",
          "Fitness": "fitness-sports-photographer-noida",
          "Sports": "fitness-sports-photographer-noida",
          "Portrait": "model-portfolio-shoot-noida"
        };
        const byType = {
          "Comp Cards": "model-portfolio-shoot-noida",
          "Model Portfolio": "model-portfolio-shoot-noida",
          "Selective Collaboration (TFP)": "model-portfolio-shoot-noida",
          "Test Shoot": "model-portfolio-shoot-noida",
          "Campaign": "brand-campaign-photographer-noida",
          "Commercial": "brand-campaign-photographer-noida",
          "E-commerce": "brand-campaign-photographer-noida"
        };
        const slug = kind2 === "activity" ? byGenre[val] : kind2 === "type" ? byType[val] : "";
        // Only point at a page that exists.
        return slug ? liveServiceLinks().find((v) => v.slug === slug) : null;
      };
      const service = serviceForCategory(kind, d);
      // No price in this line: shoots are quoted to the brief, so nothing public
      // sets a ceiling before the conversation starts.
      const serviceLineHtml = service ? `
        <p class="cat-service reveal">${esc(service.kicker)} — <a href="/services/${esc(service.slug)}/" data-link>what a ${esc(service.phrase)} shoot includes →</a></p>` : "";

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
            <p class="eyebrow reveal"><a href="/albums" data-link>Albums</a> / ${esc(kind)}</p>
             <h1 class="reveal">${esc(getCategoryTitle(d))}</h1>
            ${isTestShoot ? `<p class="page-sub" style="max-width: 600px; line-height: 1.6; opacity: 1 !important; visibility: visible !important; transform: none !important;">${esc(getCategoryDescription(d))}<span style="font-size: var(--font-xs); color: var(--ink-soft); display: block; margin-top: 8px;">Note: Models from workshop projects are not included here.</span></p>` : `<p class="page-sub reveal">${displayList.length} master album${displayList.length !== 1 ? "s" : ""} in this ${esc(kind)}.</p>`}
            ${serviceLineHtml}
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
        return key === "activity" ? albumHasActivity(s, v) : s[key] === v;
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
      let shoots = SHOOTS.filter(s => (s[key] === targetVal || (targetVal === "Selective Collaboration (TFP)" && (val === "Model Portfolio" ? showsOnModelPage(s, "Model Portfolio") : qualifiesAsCompCard(s)))) && ((s.instagram && s.instagram.trim()) || (s.kavyar && s.kavyar.trim()) || (s.talent && s.talent.trim())));
      // These thumbnails advertise the Comp Cards and Model Portfolio pages, so
      // they may only show photos that are allowed on them. `index` below is an
      // index into this pool, used to avoid picking the same photo twice.
      const poolOf = (s) => {
        const all = s.photos || [];
        if (key !== "type") return all;
        if (val === "Model Portfolio") return all.filter(usableInPortfolio);
        if (val === "Comp Cards" || val === "Selective Collaboration (TFP)") return all.filter(usableOnCompCard);
        return all;
      };
      shoots = shoots.filter(s => poolOf(s).length);
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
        const pool = poolOf(s);
        if (pool.length) {
          const randomIdx = Math.floor(Math.random() * pool.length);
          samples.push({ ...pool[randomIdx], parent: s, index: randomIdx });
        }
        if (samples.length >= limit) break;
      }
      
      // 2. Fallback: If total unique models < 3, fill remaining slots with remaining photos from available shoots
      if (samples.length < limit) {
        const remaining = [];
        for (const s of shoots) {
          const pool = poolOf(s);
          if (pool.length > 1) {
            const selectedIdxs = samples.filter(p => p.parent.id === s.id).map(p => p.index);
            for (let i = 0; i < pool.length; i++) {
              if (!selectedIdxs.includes(i)) {
                remaining.push({ ...pool[i], parent: s, index: i });
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
                     <img src="${esc(src)}"${srcsetAttr(photo, "(max-width: 620px) 30vw, 18vw")}${sizeAttr(photo)} style="width:100%; height:100%; object-fit:cover; object-position:center; transition: transform .4s var(--ease);" alt="${esc(photo.parent ? altFor(photo.parent) : placeholderPrefix + ' photography by nerdyphotographer.in')}" loading="lazy" />
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
                Editorial-grade fashion photography combining styling, dramatic concepts, and high-fashion modelling portfolios. Crafted for designer campaigns, apparel lookbooks, and modelling agency submissions in Noida &amp; Delhi NCR.
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
                <a href="${esc(compCardsHref())}" data-link>Model Comp Cards</a>
              </h3>
              <p>
                Comprehensive testing shoots and comp card layout photography designed for aspiring and professional model talent. Direct submissions focus: clean test lighting, polaroids, digitals, and styling versatility.
                <span style="display: block; margin-top: 8px; font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.4;">This compcard archive includes photos clicked or produced under nerdyphotographer.in studio or its subsidiaries.</span>
              </p>
              <a href="${esc(compCardsHref())}" data-link class="link-arrow" style="font-size: var(--font-xs); font-weight: 700;">Explore comp cards →</a>
            </div>
            <div class="specialty-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              ${renderSpecialtyGallery(testShootSamples, "MODEL", "type", "Comp Cards")}
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
          <p class="eyebrow reveal">Social proof</p>
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
          <h1 class="admin-h1 reveal">Tell me about the shoot.</h1>
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
            <ol class="next-steps" aria-label="What happens next">
              <li><strong>I reply within 24 hours</strong><span class="ns-std">At the email you gave, with answers to your questions and the confirmed quote.</span><span class="ns-prod">At the email you gave, to set up a call at a time that suits you.</span></li>
              <li><strong class="ns-std">Your date is confirmed</strong><strong class="ns-prod">We talk the production through</strong><span class="ns-paid">Once the advance retainer is paid, the date is held for you. Payment details come with that reply.</span><span class="ns-tfp">Once you confirm the plan by reply, the date is held for you.</span><span class="ns-prod">Scope, team, locations, dates and usage, on the call.</span></li>
              <li><strong class="ns-std">Shoot day</strong><strong class="ns-prod">Proposal and agreement follow the call</strong><span class="ns-std">Call time, venue and wardrobe notes arrive the day before. Proofs follow after the shoot.</span><span class="ns-prod">A written proposal with the quote and the 50 / 30 / 20 schedule, then the agreement. The date is held once it is signed.</span></li>
            </ol>

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
                <!-- Two doors. Portfolio / small-brand shoots take the priced
                     path below; a campaign or production sends a brief only —
                     no packages, no quote, no contract at this step — and the
                     studio quotes after a call. -->
                <div class="scale-cards" id="scaleCards" role="radiogroup" aria-label="What are we planning?">
                  <label class="scale-card is-on"><input type="radio" name="shoot_scale" value="standard" checked /><strong>Portfolio or small-brand shoot</strong><small>Packages, an instant quote and standard terms. Models, makeup artists, designers, small brands.</small></label>
                  <label class="scale-card"><input type="radio" name="shoot_scale" value="production" /><strong>Campaign or production</strong><small>No packages or prices here. Send the brief, we set up a call and quote on it.</small></label>
                </div>

                <!-- Dedicated Still Photography Specialization & Video Coverage Policy Notice -->
                <div style="background: rgba(var(--accent-rgb), 0.04); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
                  <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">Still photography only</div>
                  <div style="font-size: var(--font-xs); color: var(--ink-soft); line-height: 1.5;">
                    Studio packages &amp; rates are <strong>strictly dedicated to Still Photography creation</strong> (Commercial, Fashion, Editorial &amp; Portfolio). Video / Reels coverage is not included in standard packages. Clients may bring their own videographer or request studio assistance to source a freelance videographer for the session.
                  </div>
                </div>

<div style="margin-bottom: 14px; text-align: left;">
                  <a id="toggleInviteCodeLink" href="javascript:void(0)" style="font-size: var(--font-xs); color: var(--accent-text); font-weight: 700; text-decoration: underline; font-family: var(--mono-font); cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">Have a photographer invite code? (test shoot)</a>
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
                <!-- Codes come before the project type: a verified invite locks the type
                     to a test shoot, so the box has to be reachable first.
                     One box for both kinds of code. The old invite and promo
                     fields stay in the DOM (hidden) because updateFields, the
                     quote and the contract clauses all read them; this box just
                     writes the right one and shows the outcome. -->
                <div class="code-box" id="codeBox">
                  <div class="code-box-head">
                    <span class="code-box-title">Have a code?</span>
                    <span class="code-box-sub">An invite code from the photographer unlocks a test shoot. A promo code discounts a package or the studio rental.</span>
                  </div>
                  <div class="code-box-row">
                    <input id="b_any_code" type="text" placeholder="Enter invite or promo code" autocomplete="off" autocapitalize="characters" spellcheck="false" />
                    <button type="button" class="btn btn-dark" id="btnApplyAnyCode">Apply</button>
                  </div>
                  <div class="code-box-chips" id="codeChips" aria-live="polite" hidden></div>
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
                <div class="production-brief" id="productionBrief" hidden>
                  <div class="field-row">
                    <label class="field"><span>What are we shooting, and for whom?</span><input id="p_subject" type="text" placeholder="e.g. Autumn campaign for a footwear brand" /></label>
                    <label class="field"><span>Where will the images be used?</span>
                      <select id="p_usage">
                        <option value="">Choose…</option>
                        <option>Web &amp; social</option>
                        <option>E-commerce</option>
                        <option>Print &amp; outdoor</option>
                        <option>Web, print &amp; outdoor campaign</option>
                        <option>Not sure yet</option>
                      </select>
                    </label>
                  </div>
                  <div class="field-row">
                    <label class="field"><span>Budget band <em class="label-hint">optional</em></span>
                      <select id="p_budget" style="font-family: var(--mono-font);">
                        <option value="">Prefer to discuss</option>
                        <option>Under ₹2 lakh</option>
                        <option>₹2–5 lakh</option>
                        <option>₹5–10 lakh</option>
                        <option>₹10 lakh and above</option>
                      </select>
                    </label>
                    <label class="field"><span>Rough scale <em class="label-hint">optional</em></span><input id="p_scale" type="text" placeholder="e.g. 2 days, 4 looks, 6 models, video crew on set" /></label>
                  </div>
                  <div class="production-terms" role="note">
                    <span class="production-terms-k">How payment works</span>
                    <ol class="production-terms-list" id="productionTermsList">
                      ${getProductionSchedule().steps.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join("")}
                    </ol>
                    <span class="production-terms-sub">For information now. The exact figures, and the agreement, come with the written proposal after the call. Nothing is due for sending the brief.</span>
                  </div>
                  <p class="production-note">We reply within 24 hours to set up a call, then send a proposal and agreement after it.</p>
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
                    <!-- Hidden until the venue question applies. It kept its
                         tab stop while invisible, so a keyboard user lost
                         focus for a press (Sep 2026 audit); the code that
                         shows it clears these. -->
                    <select id="b_studio_space" tabindex="-1" aria-hidden="true">
                      <option value="Home Studio - Noida (Provided by Studio)" id="b_studio_space_home">Home studio, Sector 46, Noida — intimate setup, best for portraits, comp cards &amp; solo talent</option>
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
                    <label class="venue-card"><input type="radio" name="venue_pick" value="Home Studio - Noida (Provided by Studio)" /><span class="vc-main"><strong>Home studio, Sector 46, Noida</strong><small>Intimate setup · portraits, comp cards, solo talent</small></span><span class="vc-tag">Rental itemised in your quote</span></label>
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
                    <p id="arrangerTermsNote" class="arranger-terms-note" hidden></p>
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
                  <div style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">⏰ Custom Call &amp; Wrap Timings</div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">Start / Call Time *
                      <input type="time" id="b_time_start" value="10:30" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                    </label>
                    <label style="font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft);">End / Wrap Time *
                      <input type="time" id="b_time_end" value="17:30" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                    </label>
                  </div>
                  <div id="b_custom_time_badge" style="margin-top: 8px; font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text);">
                    ⏱️ 7 Hours Session (10:30 AM – 5:30 PM)
                  </div>
                </div>

               <div class="field-row">
                 <label class="field" id="b_budget_field" style="grid-column: 1 / -1;"><span>Package · set tiers *</span><span class="field-hint">Anything larger than these — multi-day, multi-location, or a campaign with a crew — is quoted on the brief: choose "Campaign or production" at the top of this section.</span>
                   <select id="b_budget">
                     ${getAdminPackages().map((p, i) => `<option value="₹${esc(p.price.toLocaleString('en-IN'))} (${esc(p.name)})"${i===0?' selected':''}>₹${esc(p.price.toLocaleString('en-IN'))} · ${esc(p.name)} (${esc(p.specs)})</option>`).join("")}
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
                  <div style="font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
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
                      <span style="color: var(--ink-soft);"><span id="summaryHomeStudioLabel">Home Studio Rental (Sector 46, Noida)</span></span>
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
                      <span id="summaryFinalAmount" style="font-size: var(--font-md); font-weight: 800; color: var(--accent-text); font-family: var(--mono-font); white-space: nowrap;">₹${getAdminPackages()[0].price.toLocaleString('en-IN')} INR</span>
                    </div>
                    <!-- What the package includes sits UNDER the total, not
                         inside that row: as a third flex child beside "Total
                         payable" and the amount it was squeezed into a ~75px
                         column eleven lines tall, and its widest word set a
                         minimum width that made the whole booking page wider
                         than any phone screen (Sep 2026 audit). -->
                    <div id="summaryIncluded" class="quote-included" hidden></div>
                    <!-- Only when the client has handed studio+lighting booking
                         over to the photographer: the actual venue and lighting
                         cost is not known yet, so the total above will change
                         once those are booked and billed at actuals. Hidden the
                         rest of the time so it never implies a change that
                         isn't coming. -->
                    <div id="summaryArrangerNote" style="display: none; margin-top: 8px; padding: 8px 10px; background: rgba(217,119,6,0.12); border: 1px solid rgba(217,119,6,0.35); border-radius: 6px; font-size: var(--font-xs); color: #d97706; font-family: inherit;">Since the photographer is arranging the studio &amp; lighting, this total does not yet include the venue and equipment. They are quoted in advance once the venue is confirmed and are payable in full together with your 50% advance.</div>
                  </div>
                  <!-- Milestone Itemized Breakdown. Reads the studio's global
                       2-step (50/50) or 3-step (50/30/20) setting — the same
                       switch that drives the flowchart below — so the live
                       numbers the client sees always match the milestones the
                       contract they are about to sign describes. -->
                  <div id="summaryMilestoneBreakdown" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; font-size: var(--font-xs);">
                    <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px;">
                      <span id="summaryAdvanceLabel" style="color: var(--ink-soft); display: block; font-size: var(--font-xs); text-transform: uppercase;">Step 1 · 50% Advance Retainer (Before Shoot Day)</span>
                      <strong id="summaryAdvanceAmount" style="color: var(--accent-text); font-size: var(--font-sm); font-family: var(--mono-font);">₹${Math.round(getAdminPackages()[0].price / 2).toLocaleString('en-IN')} INR</strong>
                    </div>
                    <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px;">
                      <span id="summaryStep2Label" style="color: var(--ink-soft); display: block; font-size: var(--font-xs); text-transform: uppercase;">Step 2 · 50% Wrap Balance (Prior to Deliverables)</span>
                      <strong id="summaryBalanceAmount" style="color: #059669; font-size: var(--font-sm); font-family: var(--mono-font);">₹${(getAdminPackages()[0].price - Math.round(getAdminPackages()[0].price / 2)).toLocaleString('en-IN')} INR</strong>
                    </div>
                    <div id="summaryStep3Wrap" style="display: none; background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px;">
                      <span id="summaryStep3Label" style="color: var(--ink-soft); display: block; font-size: var(--font-xs); text-transform: uppercase;">Step 3 · 20% Final Deliverables</span>
                      <strong id="summaryStep3Amount" style="color: var(--warn-text); font-size: var(--font-sm); font-family: var(--mono-font);">₹0 INR</strong>
                    </div>
                    <div id="summaryStep4Wrap" style="display: none; background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px;">
                      <span id="summaryStep4Label" style="color: var(--ink-soft); display: block; font-size: var(--font-xs); text-transform: uppercase;">Step 4 · 10% After Delivery of the Clicks</span>
                      <strong id="summaryStep4Amount" style="color: var(--warn-text); font-size: var(--font-sm); font-family: var(--mono-font);">₹0 INR</strong>
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
                    <strong id="summaryReservationAmount" style="color: var(--accent-text); font-size: var(--font-sm); font-family: var(--mono-font);">₹0 INR</strong>
                    <span style="color: var(--ink-soft); display: block; margin-top: 4px; line-height: 1.5;">Payable <strong style="color: var(--ink);">in full</strong> at least 48 hours before the shoot day to reserve the home studio. <strong style="color: #e07a5f;">Non-refundable.</strong></span>
                  </div>
                </div>

               <div class="book-policies" style="background: var(--bone); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 10px; padding: 16px 18px; margin-bottom: 20px;">
                 <button type="button" id="bookPoliciesToggle" aria-expanded="false" aria-controls="bookPoliciesDetail" style="all: unset; box-sizing: border-box; cursor: pointer; display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 10px;">
                   <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; letter-spacing: 0.08em;">Studio policies &amp; terms</span>
                   <span id="bookPoliciesToggleIcon" style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); white-space: nowrap;">+ Read full policies</span>
                 </button>
                 <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 6px; line-height: 1.4;">Still photography only · studio rental quoted separately · travel beyond 20 km (10 km for test shoots) at actuals · full gallery buyout available</div>
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
                <legend style="font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent-text); padding: 0 10px;">Payment terms &amp; milestones</legend>
                
                <div style="margin-bottom: 18px;">
                  <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">To reserve studio dates and ensure smooth delivery, studio productions follow structured milestone payments as detailed below:</p>
                </div>

                <!-- Flowchart 2-Step (Default) -->
                <div id="flowchart2Step" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 18px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; margin-bottom: 6px;">STEP 1 · 50% ADVANCE RETAINER</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">48 hours before shoot start</h4>
                    <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid at least 48 hours before the shoot day to reserve studio space, schedule the crew, and lock calendar availability (unless explicitly discussed with the team). <strong>Mandatory prior to shoot start.</strong> <strong style="color: var(--danger-text);">(Non-refundable)</strong></p>
                  </div>

                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 18px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: #2e7d32; text-transform: uppercase; margin-bottom: 6px;">STEP 2 · 50% FINAL BALANCE</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">After the shoot · before any file is delivered</h4>
                    <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid upon completion of the shoot session, prior to receiving any downloadable preview or retouched final deliverable file. <strong style="color: var(--danger-text);">(Non-refundable)</strong></p>
                  </div>
                </div>

                <!-- Flowchart 3-Step (3-Tier Milestone) -->
                <div id="flowchart3Step" style="display: none; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px;">
                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; margin-bottom: 6px;">STEP 1 · 50% ADVANCE RETAINER</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">48 hours before shoot start</h4>
                    <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid at least 48 hours before the shoot day to lock studio date and reserve production crew (unless explicitly discussed with the team). <strong>Mandatory prior to shoot start.</strong> <strong style="color: var(--danger-text);">(Non-refundable)</strong></p>
                  </div>

                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--warn-text); text-transform: uppercase; margin-bottom: 6px;">STEP 2 · 30% REVIEW MILESTONE</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">After the shoot · proofing gallery</h4>
                    <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid after shoot wrap, before receiving the watermarked proofing gallery to select retouches. <strong style="color: var(--danger-text);">(Non-refundable)</strong></p>
                  </div>

                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: #2e7d32; text-transform: uppercase; margin-bottom: 6px;">STEP 3 · 20% FINAL DELIVERABLES</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">Before any file is delivered</h4>
                    <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid upon final approval, prior to receiving any downloadable or high-resolution retouched master file.</p>
                  </div>
                </div>
                <!-- Flowchart 4-Step (4-Tier Milestone: the last 20% split into two 10% legs) -->
                <div id="flowchart4Step" style="display: none; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px;">
                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; margin-bottom: 6px;">STEP 1 · 50% ADVANCE RETAINER</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">48 hours before shoot start</h4>
                    <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid at least 48 hours before the shoot day to lock studio date and reserve production crew (unless explicitly discussed with the team). <strong>Mandatory prior to shoot start.</strong> <strong style="color: var(--danger-text);">(Non-refundable)</strong></p>
                  </div>

                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--warn-text); text-transform: uppercase; margin-bottom: 6px;">STEP 2 · 30% REVIEW MILESTONE</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">After the shoot · proofing gallery</h4>
                    <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid after shoot wrap, before receiving the watermarked proofing gallery to select retouches. <strong style="color: var(--danger-text);">(Non-refundable)</strong></p>
                  </div>

                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: #2e7d32; text-transform: uppercase; margin-bottom: 6px;">STEP 3 · 10% ON FINALISING THE CLICKS</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">Once the selection of clicks is finalised</h4>
                    <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid once the final selection of clicks from the proofing gallery is confirmed.</p>
                  </div>

                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: #2e7d32; text-transform: uppercase; margin-bottom: 6px;">STEP 4 · 10% AFTER DELIVERY</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--ink);">After the retouched clicks are delivered</h4>
                    <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid after the retouched master files have been delivered.</p>
                  </div>
                </div>
              </fieldset>
 
             <!-- TFP Liability Release Terms Modal -->
             <div id="termsModal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="termsModalTitle" style="display: none; position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); align-items: center; justify-content: center; padding: 20px;">
               <div class="modal-content" style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; max-width: 680px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.15); overflow: hidden; animation: modalFadeIn 0.3s ease;">
                 <div style="padding: 20px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; background: var(--bone);">
                   <h3 id="termsModalTitle" style="margin: 0; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink);">Studio Production &amp; Liability Release</h3>
                   <span id="termsModalTag" style="font-family: var(--mono-font); font-size: var(--font-xs); background: var(--accent); padding: 4px 8px; border-radius: 4px; color: #fff; font-weight: 700;">TFP-LIABILITY-RELEASE-V3.7 (ACTIVE)</span>
                 </div>
                 <div id="termsScrollArea" tabindex="0" style="padding: 24px; overflow-y: auto; font-size: var(--font-sm); line-height: 1.6; color: var(--ink); display: flex; flex-direction: column; gap: 20px; text-align: left;">
                   <p id="termsModalSubtitle" style="margin: 0; font-family: var(--mono-font); font-size: var(--font-xs); color: var(--accent-text); text-transform: uppercase; letter-spacing: 0.05em;">TFP Collaboration, Model Release &amp; Digital Consent Terms</p>
                   
                   <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 6px; padding: 14px; font-size: var(--font-xs); display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px;">
                     <div><strong>Studio/Photographer:</strong> nerdyphotographer.in</div>
                     <div><strong id="termsPartnerLabel">Creative Partner/Model:</strong> <span id="terms_partner_name">[Your Name]</span></div>
                     <div><strong>Business Handle:</strong> @nerdyphotographer.in</div>
                     <div><strong>Consent Tracking:</strong> Verified via Email / Digital Acknowledgment</div>
                     <div><strong>Production Status:</strong> <span id="termsProductionStatus">Time-For-Print (TFP) Collab</span></div>
                     <div><strong>Location:</strong> <span id="termsLocation">Studio Production Space</span></div>
                   </div>
 
                   <div>
                     <h4 id="termsSec1Title" style="margin: 0 0 6px 0; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700;">1. SCOPE OF CREATIVE COLLABORATION</h4>
                     <p style="margin: 0;"><span id="termsSec1Text">This session is scheduled as a peer-to-peer creative collaboration structured for mutual portfolio growth, asset curation, and personal branding advancement. No monetary compensation is required or exchanged for photographer or model services. The Studio provides specialized equipment, lighting architecture, workspace, and post-production engineering; the Participant(s) provide technical modelling direction, personal wardrobe, and makeup artistry. </span><em id="bookingContractStudioClause">If a dedicated external or commercial studio space is requested or booked for the shoot, the Participant shall be entirely responsible for covering the applicable studio rental charges.</em></p>
                   </div>
 
                   <div>
                      <h4 id="termsSec2Title" style="margin: 0 0 6px 0; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700;">2. INTELLECTUAL PROPERTY, MODEL RELEASE &amp; USAGE LICENSE</h4>
                      <p id="termsSec2Text" style="margin: 0;">The legal copyright of all visual media remains exclusively with the Studio. To support mutual growth and portfolio building, all participants are granted a full non-exclusive license to publish, share, and use final retouched photos for personal self-promotion, social media grids (Instagram/TikTok), personal websites, and agency portfolios.</p>
                      <p style="margin: 6px 0 0 0; font-style: italic;"><strong>No Alterations:</strong> To preserve the lighting design and capture integrity, no party shall apply secondary mobile filters, automated presets, cropping adjustments, or third-party digital modifications to the delivered files.</p>
                    </div>
 
                   <div style="border-left: 3px solid var(--accent); padding-left: 14px; background: rgba(var(--accent-rgb), 0.04);">
                     <h4 style="margin: 0 0 6px 0; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--danger-text);">3. COMPREHENSIVE LIABILITY WAIVER &amp; INDEMNIFICATION</h4>
                     <p style="margin: 0; font-weight: 500;">CRITICAL SAFETY &amp; LIABILITY RELEASE: The Participant enters the studio environment, uses studio blocks, cubes, chairs, furniture, or props, and performs physical poses entirely at their own risk. The Studio shall not be held liable for any physical injury, illness, accident, psychological distress, property damage, or clothing wear-and-tear incurred before, during, or after this production. The Participant explicitly waives any right to seek damages or legal recourse against the Studio or its operating photographers for accidents or injuries occurring on the premises.</p>
                     <p style="margin: 6px 0 0 0;">Furthermore, the Participant agrees to indemnify and hold harmless the Studio from any claims, damages, liabilities, or legal expenses arising out of the Participant’s conduct or injuries on set.</p>
                   </div>
 
                   <div>
                      <h4 id="termsSec4Title" style="margin: 0 0 6px 0; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700;">4. TECHNICAL PERFORMANCE &amp; DELIVERY DISCLAIMER</h4>
                      <p id="termsSec4Text" style="margin: 0;">As a creative collaboration, test shoots (TFP collabs) include <strong>${esc(getAdminTfpPackage().specs)}</strong>. The Studio retains final artistic authority over image selection and editing styles. Under no circumstances will raw unedited files (RAW format) be delivered to the Participant, unless otherwise agreed upon in writing for an additional fee.</p>
                    </div>
 
                   <div>
                     <h4 style="margin: 0 0 6px 0; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700;">5. MANDATORY ALL-PARTY ATTRIBUTION WORKFLOW</h4>
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
                     <h4 style="margin: 0 0 6px 0; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--danger-text);">6. UNAUTHORIZED CAMERA OPERATION, GEAR HANDS-OFF &amp; DATA PROTECTION CLAUSE</h4>
                     <p style="margin: 0; font-weight: 500;">All raw captures, memory cards, and camera equipment remain the exclusive property and intellectual property of the Studio. Under no circumstances is a model, participant, or client permitted to touch, handle, or delete media from the photographer's camera, cards, or tethering systems.</p>
                     <p style="margin: 6px 0 0 0; font-weight: 500;">The Studio retains sole artistic authority over image culling, selection, and deletion. Deleting or attempting to delete media from equipment constitutes a material breach of contract, resulting in immediate termination of the shoot, forfeiture of all deliverables, and potential liability for data recovery expenses.</p>
                   </div>

                   <div>
                     <h4 style="margin: 0 0 6px 0; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700;">7. DIGITAL CONSENT, EMAIL ACCEPTANCE &amp; BINDING NATURE</h4>
                     <p style="margin: 0;">In accordance with standard digital contract practices, a physical or handwritten signature is not required to validate these terms. Definitive legal acceptance and a binding obligation to these conditions are established through any of the following actions:</p>
                     <ul style="margin: 6px 0 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px;">
                       <li>Sending a reply stating "I agree", "Confirmed", or equivalent confirmation over email or direct digital messaging channels.</li>
                       <li>Voluntarily entering the studio workspace environment and participating in the scheduled production session following receipt of these terms.</li>
                     </ul>
                   </div>

                    <div style="border-left: 3px solid var(--accent); padding-left: 14px; background: rgba(var(--accent-rgb), 0.04);">
                      <h4 style="margin: 0 0 6px 0; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--accent-text);">8. OUTSTATION LOCATION, TRAVEL &amp; ACCOMMODATION EXPENSE POLICY (&gt;<span class="policy-km">20</span> KM FROM NOIDA)</h4>
                      <p style="margin: 0; font-weight: 500;">If the shoot location is located beyond a <span class="policy-km">20</span> km radius from Noida (Delhi NCR), all travel expenses, local conveyance, outstation transport, tolls, and accommodation expenses incurred for the photographer (and core production team) shall be fully borne, arranged, or reimbursed by the client / party requesting the shoot session. This condition applies to both Paid Commercial Shoots and Test Shoot Collaborations (TFP).</p>
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
                       <input type="checkbox" id="termsAgreeCheckbox" style="width: 20px; height: 20px; margin-top: 2px; accent-color: var(--accent-text); cursor: pointer;" />
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
                        <button type="button" class="btn btn-ghost" id="termsCustomBtn" style="font-size: var(--font-xs); height: auto; padding: 9px 14px; border: 1px solid var(--accent); color: var(--accent-text); font-weight: 700;">📝 Request Custom Contract</button>
                        <button type="button" class="btn btn-dark" id="termsAcceptBtn" style="font-size: var(--font-xs); height: auto; padding: 9px 18px;">✅ Agree &amp; Continue</button>
                      </div>
                    </div>
                  </div>
                 </div>
               </div>

            <div id="gearProtectionCallout" style="background: rgba(178,34,34,0.05); border: 1px solid rgba(178,34,34,0.3); border-radius: 10px; padding: 18px; margin-bottom: 20px; text-align: left;">
             <div style="display: flex; align-items: center; gap: 8px; font-family: 'Archivo', sans-serif; font-size: var(--font-sm); font-weight: 700; color: var(--danger-text); margin-bottom: 10px;">
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
               <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; letter-spacing: 0.05em;">Booking &amp; production terms</span>
               <span id="bookingPolicyToggleIcon" style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); white-space: nowrap;">+ Read full terms</span>
             </button>
             <div style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 6px; line-height: 1.4;">Retainer &amp; cancellation terms, usage licensing, and call-time policy for this booking.</div>
             <div id="bookingPolicyNoticeWrap" style="display: none; margin-top: 10px;">
               <div id="bookingPolicyNotice" style="font-size: var(--font-xs); line-height: 1.5; color: var(--ink-soft);">
                  <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Booking &amp; Collaboration Policy</span>
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
              <div class="sticky-total" id="bookStickyTotal" style="display: none;"><small>Total payable</small><strong id="bookStickyAmount" style="font-family: var(--mono-font);">—</strong></div>
              <span class="sticky-note" id="bookStickyNote">Ready when you are</span>
              <div class="sticky-actions">
                <button type="button" class="btn btn-dark sticky-publish" id="bookStickySubmit">Submit booking request</button>
              </div>
            </div>
            <p style="font-size: var(--font-xs); color: var(--ink-soft); margin-top: 15px; text-align: center; line-height: 1.4;">By submitting a booking request, you agree to our standard terms. For test shoots, read our online <a href="#tfp-terms" id="tfpTermsTrigger" style="text-decoration: underline; color: var(--accent-text); font-weight: 600;">Studio Production &amp; Liability Release</a>.</p>
          </form>
        </div>
      </section>
    `;
  }

  /* ============================================================
     §13 · VIEW WIRING — event handlers per view
     ============================================================ */
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
      let pickerIsWriting = false;   // true only while updateInput fills the field
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
        // The days the visitor actually picked, kept beside the text. Saving a
        // booking used to re-read the text and split it on commas, so
        // "Oct 10, 2026" became "Oct 10" and "2026" — filed under 10 October
        // 2001 and 1 January 2026, never the real day (there are such entries
        // in the published calendar). Typing into the field clears this, so a
        // hand-typed date is parsed rather than inheriting an old pick.
        dateInput._wpsPickedDates = (pickerMode === "range"
          ? [rangeStart, rangeEnd].filter(Boolean)
          : [...multiDates].sort((a, b) => a - b)).map((d) => new Date(d));
        pickerIsWriting = true;
        dateInput.dispatchEvent(new Event("input", { bubbles: true }));
        pickerIsWriting = false;
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

      // Typing over the field means the picker's memory no longer describes it:
      // drop the remembered days, and the range/multi selection whose status
      // the badge and the studio's email were still reporting.
      dateInput.addEventListener("input", () => {
        // Anything but the picker writing into the field means the selection no
        // longer describes it: drop the remembered days and the range/list whose
        // status the badge and the studio's email were still reporting.
        if (!pickerIsWriting) {
          dateInput._wpsPickedDates = null;
          rangeStart = null; rangeEnd = null; multiDates = [];
        }
        checkAvailabilityBadge();
      });

      let adminManageMode = false;

      function renderCalendar() {
        const firstDay = new Date(viewYear, viewMonth, 1).getDay();
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const isUserAdmin = isAdmin();

        let html = `
          <div class="dp-header">
            ${isUserAdmin ? `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed var(--line);">
                <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text);">⚙️ Admin Mode</span>
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
            <span class="dp-legend-item"><span class="dp-legend-dot dot-blocked"></span> Weekdays closed</span>
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
              titleAttr = status.isDefaultBlockedWeekday ? "Weekdays are closed for bookings" : "Not available";
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

          // Named in full, with the reason it cannot be booked spoken rather
          // than left in a tooltip nobody can hover on a phone, and with the
          // selection stated instead of shown only in colour (Sep 2026 audit).
          const dayLabel = `${d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}${titleAttr ? ` — ${String(titleAttr).replace(/\s+/g, " ").trim()}` : ""}`;
          const isChosen = classes.includes("dp-selected");
          html += `<button type="button" class="${classes.join(" ")}" data-day="${day}" data-date="${status.key}" title="${esc(titleAttr)}" aria-label="${esc(dayLabel)}" aria-pressed="${isChosen ? "true" : "false"}"${isCellDisabled ? " disabled" : ""}>${day}</button>`;
        }

        html += `</div>`;

        // Selection summary
        let summary = "";
        if (adminManageMode) {
          summary = `<span class="dp-hint" style="color:var(--accent-text); font-weight:700;">Click dates to Block/Open or Add Bookings</span>`;
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
        // The grid is rebuilt on every pick, which dropped focus to the body:
        // choosing a second date meant tabbing back through the whole page.
        const back = popup.querySelector(`[data-date="${dateKey(clicked)}"]`);
        if (back) { try { back.focus(); } catch (e) {} }
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
          // …and the field and its remembered days, or the "already booked"
          // badge and the studio's email would keep describing a cleared pick.
          dateInput.value = "";
          dateInput._wpsPickedDates = null;
          checkAvailabilityBadge();
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
        toggle.setAttribute("aria-expanded", "true");
        renderCalendar();
        // Straight to a day, rather than making the visitor tab through the
        // month arrows and mode buttons first.
        setTimeout(() => {
          const first = popup.querySelector("[data-date]:not([disabled])") || popup.querySelector("button");
          if (first) { try { first.focus(); } catch (e) {} }
        }, 30);
      }
      function closePopup() {
        popup.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
      popup.setAttribute("role", "dialog");
      popup.setAttribute("aria-label", "Choose a shoot date");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", popup.id || "datePickerPopup");
      // Escape closed nothing: the picker stayed open over the form and the
      // keyboard stayed inside it (Sep 2026 audit).
      popup.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        closePopup();
        try { toggle.focus(); } catch (err) {}
      });

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
    const globalSched = getPackageScheduleKey();
    [["#flowchart2Step", "5050"], ["#flowchart3Step", "503020"], ["#flowchart4Step", "50301010"]].forEach(([sel, key]) => {
      const el = $(sel);
      if (el) el.style.display = globalSched === key ? "grid" : "none";
    });

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
            <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">TFP Collaboration &amp; Test Shoot Policy</span>
            Submission of a TFP collaboration request does not constitute a confirmed session or a commitment to shoot. All inquiries are subject to schedule availability, creative alignment, and final studio review. <strong>Note: If a dedicated studio space is booked for the shoot, applicable studio rental charges will apply.</strong> TFP shoots include a Full Proofing Gallery + 8 to 12 Retouched Master Clicks. RAW unedited camera files are strictly excluded and remain unreleased. <strong>⏰ Call time &amp; no-show:</strong> ${window.buildLateArrivalSummary(true)}
          `;
        } else {
          policyNotice.innerHTML = `
            <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Commercial Production &amp; Studio Protection Policy</span>
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
              <div style="font-family: 'Archivo', sans-serif; font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
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
            // updateFields runs on every change, and rebuilding this block
            // reset the choice to the first package — a brand that picked the
            // ₹50,000 tier had ₹7,000 sent to the studio instead (Sep 2026
            // audit). Keep what they chose across the rebuild.
            const keptFallback = (collabFallbackWrap.querySelector("#b_collab_fallback") || {}).value || "";
            collabFallbackWrap.innerHTML = `
              <div style="font-family: 'Archivo', sans-serif; font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                📌 Studio Discretion Policy &amp; Paid Fallback Package *
              </div>
              <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0 0 10px 0; line-height: 1.5;">
                Brand &amp; Commercial TFP collaborations are accepted at the sole discretion of the studio based on creative brief alignment and portfolio synergy. Unapproved collaboration requests do not reserve shoot dates.
              </p>
              <label class="field" style="margin: 0;">
                <span style="font-size: var(--font-xs); font-weight: 700; color: var(--ink);">If your collaboration request is not approved, which Paid Package would you like to proceed with? *</span>
                <select id="b_collab_fallback" style="margin-top: 4px;">
                  ${getAdminPackages().map(p => `<option value="₹${esc(p.price.toLocaleString('en-IN'))} ${esc(p.name)} (Paid Fallback)">₹${esc(p.price.toLocaleString('en-IN'))} · ${esc(p.name)} (${esc(p.specs)})</option>`).join("")}
                  <option value="Custom Bespoke Package (Paid Fallback)">Custom Bespoke Package</option>
                  <option value="Cancel Inquiry if Collaboration is Declined">Cancel Inquiry if Collaboration is Declined</option>
                </select>
              </label>
            `;
            if (keptFallback) {
              const again = collabFallbackWrap.querySelector("#b_collab_fallback");
              if (again && [...again.options].some((o) => o.value === keptFallback)) again.value = keptFallback;
            }
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
      // A switched-off code behaves exactly like one that was never created,
      // so nothing downstream — the badge, the quote, the contract, the email
      // — has to know the switch exists.
      const matchedDiscountRaw = discountCodesMap[enteredDiscount];
      const matchedDiscount = window.promoCodeIsActive(matchedDiscountRaw) ? matchedDiscountRaw : undefined;

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
        const travelKm = $("#b_type")?.value === "Selective Collaboration (TFP)" ? 10 : 20;
        policyTravel.innerHTML = venueSuppliedByStudio
          ? `<strong style="color: var(--ink);">Travel &amp; Accommodation:</strong> Travel to the studio-provided venue above is covered by the studio for this session. Standard terms (travel beyond <strong style="color: var(--ink);">${travelKm} km</strong> from the studio base in Noida, and accommodation where an overnight stay is needed, billed at actuals) apply only if you request a different location.`
          : `<strong style="color: var(--ink);">Travel &amp; Accommodation:</strong> Shoots requiring travel beyond <strong style="color: var(--ink);">${travelKm} km</strong> from the studio base (Noida) incur paid travel and, where an overnight stay is needed, accommodation — billed <strong style="color: var(--ink);">at actuals (at cost)</strong>.`;
      }

      // ── Home studio (paid shoots only) ──────────────────────────────────
      // The home studio is offered on paid bookings; TFP venues are handled by
      // the invite code instead, so the option is removed for a test shoot
      // rather than silently offering the photographer's home for free work.
      const HOME_STUDIO_VALUE = "Home Studio - Noida (Provided by Studio)";
      const OUTDOOR_VALUE = "Outdoor / On-Location (No Studio Required)";
      const COMMERCIAL_STUDIO_VALUE = "Dedicated Commercial Studio Rental (Billed at Actuals)";
      const HOME_STUDIO_LABEL = HOME_STUDIO_NAME;
      const studioSpaceSel = $("#b_studio_space");
      const homeStudioOpt = $("#b_studio_space_home");
      const isTfpType = $("#b_type")?.value === "Selective Collaboration (TFP)";
      { const n = $("#summaryArrangerNote"); if (n) n.textContent = isTfpType
          ? "Since the photographer is arranging the studio & lighting, they are quoted in advance once the venue is confirmed and are payable in full before shoot day."
          : "Since the photographer is arranging the studio & lighting, this total does not yet include the venue and equipment. They are quoted in advance once the venue is confirmed and are payable in full together with your 50% advance."; }

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
      // When the photographer books the studio, say when it is paid — with
      // the advance on a paid shoot, before shoot day on a test shoot — right
      // under the choice, where both kinds of booking can see it.
      {
        const arrangerNote = $("#arrangerTermsNote");
        if (arrangerNote) {
          const picked = isCommercialStudioSelected && $("input[name='b_studio_arranger']:checked")?.value === "Photographer Arranges Studio & Lighting (Billed at Actuals)";
          arrangerNote.hidden = !picked;
          arrangerNote.textContent = isTfpType
            ? "Studio and lighting are quoted in advance once the venue is confirmed and payable in full before shoot day."
            : "Studio and lighting are quoted in advance once the venue is confirmed and payable in full together with your 50% advance.";
        }
      }
      const studioArrangerChoice = isCommercialStudioSelected
        ? ($("input[name='b_studio_arranger']:checked")?.value || "")
        : "";
      const studioArrangerClauseHtml = studioArrangerChoice
        ? (studioArrangerChoice === "Photographer Arranges Studio & Lighting (Billed at Actuals)"
            ? ` Where requested, the photographer will instead source and book the studio space and lighting equipment on the Participant's behalf, with the studio space and equipment charges quoted to the Participant in advance, ${isTfpType ? "payable in full before shoot day" : "payable in full together with the advance retainer"}, and added to the invoice.`
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
            ? `This session takes place at the Studio's home studio in ${HOME_STUDIO_AREA}. A fixed home studio rental of <strong>₹${homeStudioFee.toLocaleString("en-IN")}</strong> applies and is itemised in the production quote, <strong>payable in full at least 48 hours before the shoot day</strong> to reserve the space and non-refundable once paid; no further venue rental applies to it.${paidHomeRiderHtml} Hair &amp; makeup artists, stylists, set designers and any other third-party crew are not included in this booking — the Participant may bring their own or ask the Studio to source them, and such crew are billed at actuals (at cost).`
            : `If a dedicated external or commercial studio space is requested or booked for the shoot, the Participant shall be entirely responsible for covering the applicable studio rental charges.${studioArrangerClauseHtml} Hair &amp; makeup artists, stylists, set designers and any other third-party crew are not included in this booking — the Participant may bring their own or ask the Studio to source them, and such crew are billed at actuals (at cost).`;
      }

      // Update TFP policy notice studio line if TFP is selected
      const policyNoticeEl = $("#bookingPolicyNotice");
      if (policyNoticeEl && $("#b_type") && $("#b_type").value === "Selective Collaboration (TFP)") {
        // Must agree with the quote box: a test shoot at the home studio now
        // carries a rental unless the invite waives it.
        // Labelled lines, like the paid-shoot block. Deliverables come from the
        // test-shoot package setting so the two never disagree.
        const studioLine = homeStudioFee > 0
          ? `Home studio session: a fixed rental of ₹${homeStudioFee.toLocaleString("en-IN")} applies, itemised in your quote and payable in full before shoot day.`
          : (isValidInvite && lockedLocation)
            ? `Provided by the photographer at ${esc(lockedLocation)}. No rental charge to you.`
            : `If a dedicated studio is booked, the rental is quoted in advance once the venue is confirmed and payable in full before shoot day.`;
        const tfpSpecs = ((typeof getAdminTfpPackage === "function" && getAdminTfpPackage().specs) || "Full Proofing Gallery + 8 to 12 Retouched Master Clicks").replace(/\s*\(No RAW files delivered\)\s*$/i, "");
        policyNoticeEl.innerHTML = `
          <span class="policy-k">TFP Collaboration &amp; Test Shoot Policy</span>
          <dl class="policy-lines">
            <div><dt>Status</dt><dd>A request is not a confirmed session or a commitment to shoot. Every enquiry is subject to schedule availability, creative fit and final studio review.</dd></div>
            <div><dt>Studio</dt><dd>${studioLine}</dd></div>
            <div><dt>Deliverables</dt><dd>${esc(tfpSpecs)}. RAW unedited camera files are not released.</dd></div>
            <div><dt>Travel</dt><dd>Beyond 10 km from Noida, travel is at actuals.</dd></div>
            <div><dt>Call time &amp; no-show</dt><dd>${(t => t.charAt(0).toUpperCase() + t.slice(1))(window.buildLateArrivalSummary(true))}</dd></div>
          </dl>
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

      // No published prices in hand (data.js did not load) means no figure on
      // this page is known to be the studio's, so none is shown: the client
      // sends the request and the studio quotes by email. Showing the built-in
      // list instead is how a total that was never the studio's could end up
      // in a contract (Sep 2026 audit).
      // A field that is on screen belongs in the tab order; one that is not,
      // does not. Kept in step with whatever the venue rules decide below.
      const studioSpaceEl = $("#b_studio_space");
      if (studioSpaceEl) {
        const shown = !!(studioSpaceEl.offsetParent);
        studioSpaceEl.tabIndex = shown ? 0 : -1;
        if (shown) studioSpaceEl.removeAttribute("aria-hidden");
        else studioSpaceEl.setAttribute("aria-hidden", "true");
      }
      const pricesKnown = pricesArePublished();
      const priceNotice = (() => {
        let el = $("#bookPricesUnavailable");
        if (!el && finalPriceSummaryBox && finalPriceSummaryBox.parentNode) {
          el = document.createElement("div");
          el.id = "bookPricesUnavailable";
          el.style.cssText = "display:none; background: var(--bone); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; margin-top: 14px; line-height: 1.55;";
          el.innerHTML = `<p style="margin:0; font-size: var(--font-xs); font-weight:700; color: var(--accent-text); text-transform: uppercase; letter-spacing:.05em;">Prices unavailable</p>
            <p style="margin:6px 0 0; font-size: var(--font-sm); color: var(--ink);">The studio's current rates couldn't be loaded just now, so nothing is quoted here. Send your request anyway — you'll get the price by email before anything is booked. Reloading the page usually brings them back.</p>`;
          finalPriceSummaryBox.parentNode.insertBefore(el, finalPriceSummaryBox.nextSibling);
        }
        return el;
      })();
      if (priceNotice) priceNotice.style.display = pricesKnown ? "none" : "block";

      if (!pricesKnown) {
        if (finalPriceSummaryBox) finalPriceSummaryBox.style.display = "none";
        if (promoCodeWrap) promoCodeWrap.style.display = "none";
        if (budgetField) budgetField.style.display = "none";
      } else if (isCollabBooking) {
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
            : `Home Studio Rental (${HOME_STUDIO_AREA})`;
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
          const schedule = PACKAGE_SCHEDULES[globalSched] || PACKAGE_SCHEDULES["5050"];
          const legs = splitPackageMilestones(packageNet, homeStudioFee, globalSched);
          const advanceRetainer = legs[0], wrapBalance = legs[1] || 0, step3Amount = legs[2] || 0, step4Amount = legs[3] || 0;
          const summaryAdvanceAmount = $("#summaryAdvanceAmount");
          const summaryBalanceAmount = $("#summaryBalanceAmount");
          const summaryAdvanceLabel = $("#summaryAdvanceLabel");
          const summaryStep2Label = $("#summaryStep2Label");
          const summaryStep3Wrap = $("#summaryStep3Wrap"), summaryStep3Label = $("#summaryStep3Label"), summaryStep3Amount = $("#summaryStep3Amount");
          const summaryStep4Wrap = $("#summaryStep4Wrap"), summaryStep4Label = $("#summaryStep4Label"), summaryStep4Amount = $("#summaryStep4Amount");

          if (summaryAdvanceAmount) summaryAdvanceAmount.textContent = `₹${advanceRetainer.toLocaleString("en-IN")} INR`;
          if (summaryBalanceAmount) summaryBalanceAmount.textContent = `₹${wrapBalance.toLocaleString("en-IN")} INR`;
          if (summaryStep3Wrap) summaryStep3Wrap.style.display = legs.length >= 3 ? "block" : "none";
          if (summaryStep3Amount) summaryStep3Amount.textContent = `₹${step3Amount.toLocaleString("en-IN")} INR`;
          if (summaryStep4Wrap) summaryStep4Wrap.style.display = legs.length >= 4 ? "block" : "none";
          if (summaryStep4Amount) summaryStep4Amount.textContent = `₹${step4Amount.toLocaleString("en-IN")} INR`;
          if (summaryAdvanceLabel) {
            // The studio the photographer books on the client's behalf is due
            // in full with the advance too (contract clause 1); the amount is
            // quoted once the venue is confirmed, so the label carries the
            // rule even though the figure is not on the card yet.
            summaryAdvanceLabel.textContent = homeStudioFee > 0
              ? "Step 1 · 50% Advance Retainer + Studio Rental (Before Shoot Day)"
              : (studioArrangerChoice === "Photographer Arranges Studio & Lighting (Billed at Actuals)"
                  ? "Step 1 · 50% Advance Retainer + Studio & Lighting in full (Before Shoot Day)"
                  : "Step 1 · 50% Advance Retainer (Before Shoot Day)");
          }
          if (summaryStep2Label) summaryStep2Label.textContent = schedule.quoteSteps[0];
          if (summaryStep3Label && schedule.quoteSteps[1]) summaryStep3Label.textContent = schedule.quoteSteps[1];
          if (summaryStep4Label && schedule.quoteSteps[2]) summaryStep4Label.textContent = schedule.quoteSteps[2];
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
    // The window a booking runs in when the client picks nothing. "Flexible /
    // Photographer Choice" is the form's default, and sending it verbatim
    // left the studio's inbox and calendar with no time at all — so the
    // studio's own standard day is written in instead, marked as a default
    // so the photographer knows the client did not choose it. Test shoots get
    // the half day the cap allows; the custom panel opens on the same windows.
    const DEFAULT_SESSION_PAID = "Full Day (10:30 AM – 5:30 PM)";
    const DEFAULT_SESSION_COLLAB = "Half Day Morning (10:30 AM – 2:30 PM)";
    const defaultSessionWindow = () => (isCollabSession() ? DEFAULT_SESSION_COLLAB : DEFAULT_SESSION_PAID);
    const hoursOf = (label) => (label.match(/\(([^)]+)\)/) || [])[1] || label;
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
      // Say on the form what "flexible" will be recorded as, so the client is
      // not surprised by a call time they never saw.
      const flexOpt = Array.from(durSel.options).find((o) => o.value === DEFAULT_DURATION);
      if (flexOpt) flexOpt.textContent = `Flexible / Photographer Choice (Recommended · defaults to ${hoursOf(isCollab ? DEFAULT_SESSION_COLLAB : DEFAULT_SESSION_PAID)})`;
      const note = $("#b_duration_note");
      if (note) note.style.display = isCollab ? "block" : "none";
      updateCustomTimeBadge();
    };

    // What the visitor actually agreed to run, resolved for the studio's records.
    // "Custom Timings" on its own says nothing, so the call and wrap times travel
    // with it.
    const sessionDurationLabel = () => {
      const durSel = $("#b_duration");
      const picked = durSel ? durSel.value : "";
      if (!picked || picked === DEFAULT_DURATION) {
        return `${defaultSessionWindow()} · studio default, timing left to the photographer`;
      }
      if (picked !== "Custom Timings") return picked;
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
    // Portfolio shoot vs campaign / production. Production mode hides every
    // priced element (packages, codes, quote, payment terms, policies) and
    // shows the brief fields; the submit becomes "Send the brief".
    (() => {
      const cards = $("#scaleCards"), brief = $("#productionBrief"), form = $("#bookingForm");
      if (!cards || !form) return;
      const radios = Array.from(cards.querySelectorAll('input[name="shoot_scale"]'));
      const isProd = () => radios.some(r => r.checked && r.value === "production");
      window.isProductionBrief = isProd;
      const notice = Array.from(form.querySelectorAll("div")).find(d => /Still Photography creation/.test(d.textContent) && d.querySelectorAll("div").length <= 2);
      const apply = () => {
        const on = isProd();
        form.classList.toggle("is-production", on);
        radios.forEach(r => r.closest(".scale-card").classList.toggle("is-on", r.checked));
        if (brief) brief.hidden = !on;
        if (notice) notice.hidden = on;
        const btn = $("#bookSubmitBtn");
        if (btn && !btn.classList.contains("is-loading")) {
          if (on) { if (!btn.dataset.defaultLabel) btn.dataset.defaultLabel = btn.textContent; btn.textContent = "Send the brief"; }
          else if (btn.dataset.defaultLabel) { btn.textContent = btn.dataset.defaultLabel; delete btn.dataset.defaultLabel; }
        }
        const stickyBtn = $("#bookStickySubmit");
        if (stickyBtn && btn) stickyBtn.textContent = btn.textContent;
      };
      radios.forEach(r => r.addEventListener("change", apply));
      ["change", "input", "click"].forEach(ev => form.addEventListener(ev, () => setTimeout(apply, 0)));
      apply();
    })();
    // "Have a code?": one box, the app decides whether it is an invite or a
    // promo code (invite list first, then promo), writes the hidden field the
    // rest of the form reads, and shows the result as a chip.
    (() => {
      const input = $("#b_any_code"), btn = $("#btnApplyAnyCode"), chips = $("#codeChips");
      const inviteEl = $("#b_invite_code"), promoEl = $("#b_discount_code");
      if (!input || !btn || !chips || !inviteEl || !promoEl) return;
      const fire = (el) => { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
      const inviteCodes = () => (typeof window.getAdminInviteCodes === "function" ? window.getAdminInviteCodes() : []).map(c => String(typeof c === "object" ? c.code : c).toUpperCase());
      const isPromo = (code) => {
        const map = typeof window.getAdminPromoCodes === "function" ? window.getAdminPromoCodes() : {};
        return Object.keys(map).some((k) => k.toUpperCase() === code && window.promoCodeIsActive(map[k]));
      };
      let lastError = "";
      const paint = () => {
        const out = [];
        const inv = (inviteEl.value || "").trim().toUpperCase();
        if (inv) {
          const ok = ($("#inviteCodeStatus")?.textContent || "").includes("VERIFIED");
          out.push(`<span class="code-chip ${ok ? "is-ok" : "is-bad"}"><b>${esc(inv)}</b><span>${ok ? "Invite verified · test shoot unlocked" : "Invite code not recognised"}</span><button type="button" data-clear="invite" aria-label="Remove invite code">×</button></span>`);
        }
        const pr = (promoEl.value || "").trim().toUpperCase();
        if (pr) {
          const st = $("#discountCodeStatus")?.textContent || "";
          const ok = st.includes("APPLIED");
          const savings = ($("#discountSavingsBadge")?.textContent || "").replace(/^[^:]*:\s*/, "").replace(/[\u{1F300}-\u{1FAFF}]/gu, "").trim();
          out.push(`<span class="code-chip ${ok ? "is-ok" : "is-bad"}"><b>${esc(pr)}</b><span>${ok ? ("Promo applied" + (savings ? " · " + esc(savings) : "")) : "Promo code not valid for this booking"}</span><button type="button" data-clear="promo" aria-label="Remove promo code">×</button></span>`);
        }
        if (lastError) out.push(`<span class="code-chip is-bad"><span>${esc(lastError)}</span></span>`);
        chips.innerHTML = out.join("");
        chips.hidden = !out.length;
      };
      const apply = () => {
        const code = (input.value || "").trim().toUpperCase();
        lastError = "";
        if (!code) { paint(); return; }
        if (inviteCodes().includes(code)) { inviteEl.value = code; fire(inviteEl); input.value = ""; }
        else if (isPromo(code)) { promoEl.value = code; fire(promoEl); input.value = ""; }
        else lastError = `"${code}" is not an invite or promo code we recognise.`;
        setTimeout(paint, 0);
      };
      btn.addEventListener("click", apply);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } });
      chips.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-clear]");
        if (!b) return;
        const el = b.dataset.clear === "invite" ? inviteEl : promoEl;
        el.value = ""; fire(el); lastError = ""; setTimeout(paint, 0);
      });
      // A code arriving by link (?invite= / ?code=) shows up as a chip too.
      $("#bookingForm")?.addEventListener("change", () => setTimeout(paint, 0));
      setTimeout(paint, 80);
    })();
    // "What's included" under the total: the package's deliverables, the
    // delivery time when the admin has set one, and the payment split the
    // quote is actually showing. Read after updateFields has run.
    (() => {
      const line = $("#summaryIncluded");
      if (!line) return;
      const sync = () => {
        const type = $("#b_type")?.value || "";
        const isCollab = type === "Selective Collaboration (TFP)";
        let pkg = null;
        if (isCollab) pkg = (typeof getAdminTfpPackage === "function") ? getAdminTfpPackage() : null;
        else {
          const v = $("#b_budget")?.value || "";
          pkg = (typeof getAdminPackages === "function" ? getAdminPackages() : []).find(p => v.includes(p.name)) || null;
        }
        const bits = [];
        if (pkg && pkg.specs) bits.push(pkg.specs);
        if (pkg && pkg.delivery) bits.push(`delivered in ${pkg.delivery}`);
        const nothing = $("#summaryNothingToPay"), reserve = $("#summaryReservationCard"), steps = $("#summaryMilestoneBreakdown");
        const visible = (el) => !!el && el.offsetParent !== null;
        if (visible(nothing)) bits.push("nothing to pay");
        else if (visible(reserve)) bits.push("studio rental paid in full up front");
        else if (visible(steps)) {
          bits.push(PACKAGE_SCHEDULES[getPackageScheduleKey()].short);
        }
        line.textContent = bits.join(" · ");
        line.hidden = !bits.length;
      };
      ["change", "input", "click"].forEach(ev => $("#bookingForm")?.addEventListener(ev, () => setTimeout(sync, 0)));
      setTimeout(sync, 100);
    })();
    // Picking who arranges the studio has to re-run updateFields too, or the
    // live contract clause the client reads keeps showing the pre-pick text
    // until some other field happens to change.
    document.querySelectorAll('input[name="b_studio_arranger"]').forEach((r) => {
      r.addEventListener("change", updateFields);
    });
    // Address changes are checked on change/blur rather than on every
    // keystroke: flipping the dropdown mid-word would yank the selection out
    // from under someone who is still typing "Home studio, Sector 46, Noida" by hand.
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
        if (payload.isCustomContract) fd.append("Requested Contract Changes", payload.customContractNotes || "Client requested a custom contract / agency MSA (no details given)");
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

    // The terms sheet exactly as the client saw it, captured by openTermsModal
    // at the moment they agree, while the sheet is still on screen so
    // innerText keeps the rendered line breaks. The emailed contract is
    // built from this, so the studio's record can never say less than the
    // sheet did.
    let agreedSheetText = "";
    function serializeTermsSheet() {
      try {
        const content = $("#termsModal .modal-content");
        const body = content && content.children[1];
        if (!body) return "";
        const parts = [];
        Array.from(body.children).forEach((el) => {
          if (el.querySelector("#termsAgreeCheckbox")) return;
          const t = (el.innerText || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
          if (t) parts.push(t);
        });
        return parts.join("\n\n");
      } catch (e) {
        return "";
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
      // Every day this booking covers, from the picker where it was used and
      // from the text otherwise (same parsing as the calendar save below).
      const dateEl0 = $("#b_date");
      const requestedDates = (dateEl0 && Array.isArray(dateEl0._wpsPickedDates) && dateEl0._wpsPickedDates.length)
        ? dateEl0._wpsPickedDates.slice()
        : date.split(/\s*[–—]\s*/)
              .flatMap((part) => part.split(/,(?=\s*[A-Za-z])/))
              .map((t) => new Date(t.trim()))
              .filter((d) => !isNaN(d.getTime()) && d.getFullYear() >= 2020);
      const dateStatusTarget = requestedDates[0] || null;
      const dateAlreadyBooked = dateStatusTarget ? getCalDateStatus(dateStatusTarget).isBooked : false;

      // The picker disables closed days, but a date typed by hand went through
      // untouched: a Tuesday, or a Saturday the studio had blocked, reached
      // "Request sent" and the studio's email said nothing about it (Sep 2026
      // audit). Same rules either way now. Days that are merely already booked
      // stay allowed on purpose — the studio decides those — and keep their flag.
      const todayKey = getCalDateKey(new Date());
      const unbookable = requestedDates.map((d) => {
        const st = getCalDateStatus(d);
        const label = d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        if (st.key < todayKey) return `${label} has already passed`;
        if (st.isCustomBlocked) return `${label} is blocked in the studio's calendar`;
        if (st.isBlocked) return `${label} is a ${d.toLocaleDateString("en-IN", { weekday: "long" })} — shoots run at weekends`;
        return null;
      }).filter(Boolean);
      if (unbookable.length) {
        const dateField = $("#b_date");
        toast(`${unbookable[0]}. Pick a date from the calendar, or email the studio to ask about that day.`);
        if (dateField) {
          dateField.focus();
          dateField.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "center" });
        }
        return;
      }
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
        const isProduction = !!(window.isProductionBrief && window.isProductionBrief());
        const productionSchedule = getProductionSchedule();
        const productionLines = isProduction
          ? `What we're shooting: ${val("p_subject") || "—"}\nUsage: ${val("p_usage") || "—"}\nBudget band: ${val("p_budget") || "Prefer to discuss"}\nRough scale: ${val("p_scale") || "—"}\nPayment terms (shown for information): ${productionSchedule.text} — figures to be confirmed in the proposal.\n`
          : "";

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
        // The home studio is the venue whether the client picked it from the
        // venue cards or an invite code supplied it: the house rules and the
        // "no rental billed" wording used to be skipped on invited bookings
        // because only the dropdown was consulted.
        const inviteLockedHome = $("#b_location")?.dataset.inviteLocked === "1" && /home studio/i.test($("#b_location")?.value || "");
        const isHomeStudio = $("#b_studio_space")?.value === "Home Studio - Noida (Provided by Studio)" || inviteLockedHome;
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
              ? ` Where requested, the photographer will instead source and book the studio space and lighting equipment on the Participant's behalf, with the studio space and equipment charges quoted to the Participant in advance, ${isTfpCat ? "payable in full before shoot day" : "payable in full together with the advance retainer"}, and added to the invoice.`
              : ` The Participant will source and book the studio space and any lighting equipment directly, and will share the confirmed venue details with the photographer ahead of the shoot.`)
          : "";
        const venueClause = venueByStudio
          ? `1. SCOPE OF PRODUCTION & VENUE (PROVIDED BY STUDIO)\nThis session is scheduled for studio/location photography production at a venue arranged and paid for by the Studio: ${venueByStudioAddress || "as confirmed with the Studio"}. No studio rental, venue hire or space fee is billed to the Participant for this session. A change of venue requested by the Participant is subject to Studio approval and may reintroduce venue costs, quoted in advance.${homeStudioRider}`
          : `1. SCOPE OF PRODUCTION & VENUE RENTAL POLICY\nThis session is scheduled for studio/location photography production. Package rates cover photography, light design & retouched master deliverables. If a dedicated indoor studio venue space is required, applicable studio rental fees are quoted separately in advance.${studioArrangerSubmitClause}`;
        const contractRefDoc = isCustomContract ? "CUSTOM-CLIENT-CONTRACT-MSA" : (isTfpCat ? "TFP-LIABILITY-RELEASE-V3.7" : "COMMERCIAL-CONTRACT-V3.7");
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
        const packageScheduleKey = getPackageScheduleKey();
        const packageSchedule = PACKAGE_SCHEDULES[packageScheduleKey];
        // The studio rental (home or commercial) reserves the venue, so it is
        // due in full alongside the advance retainer rather than split across
        // milestones like the package rate — the document has to say this
        // explicitly, or the total charged on shoot day will not match what
        // was agreed here.
        const rentalUpfrontNote = homeStudioRentalFee > 0
          ? ` The studio rental of ₹${homeStudioRentalFee.toLocaleString('en-IN')} is payable in full as part of the advance retainer, in addition to the package advance above.`
          : "";
        const paymentTermsText = `Payment Terms: ${packageSchedule.contract}.${rentalUpfrontNote}`;
        // A collaboration carries no shoot fee, but it can still owe the home
        // studio rental — and the document the participant agrees to has to say
        // so, in the same terms the quote showed them.
        const engagementFeeClause = isTfpCat
          ? (homeStudioRentalFee > 0
              ? `\n\n7. HOME STUDIO RENTAL & PAYMENT\nThis collaboration carries no shoot fee. A fixed home studio rental of ₹${homeStudioRentalFee.toLocaleString('en-IN')} applies for use of the photographer's home studio in ${HOME_STUDIO_AREA}, and is payable IN FULL at least 48 hours before the shoot day to reserve the space. This rental is non-refundable once paid, including where the Participant cancels or reschedules. No other fee is payable to the Studio for this session.`
              : "")
          : `\n\n7. ENGAGEMENT FEE, SELECTED PACKAGE & PAYMENT MILESTONES\nSelected package and contracted deliverables: ${budget || "as quoted by the Studio"}.\n${paymentTermsText.replace(/^Payment Terms: /, "Payment terms: ")}\nMilestone payments marked non-refundable are non-refundable once paid, including where the Participant cancels or reschedules. ${packageSchedule.release} Any work beyond the contracted package (additional retouched masters, extended usage, gallery buyout) is quoted and invoiced separately.`;

        // Test shoots only. A paid booking already carries this risk through its
        // non-refundable retainer; a collaboration pays nothing, so without this
        // a no-show costs the studio a held weekend and nothing else.
        // Numbered off whether the rental clause above is present, since it is
        // omitted on a collaboration with no rental — hardcoding "8" would
        // print a document that jumps from 6 to 8.
        const lateArrivalClause = "\n\n" + window.buildLateArrivalText(isTfpCat, engagementFeeClause ? 8 : 7);

        // What goes on the record is the sheet the client ticked (see
        // serializeTermsSheet). The clauses below are the old hand-written
        // summary, kept only as a fallback for an empty capture: the record
        // used to be built from them alone, and said far less than the sheet
        // — no house rules on an invited home-studio shoot, no credit
        // workflow, no travel clause, one-line waivers.
        const legacyStandardClauses = `${venueClause}\n\n2. INTELLECTUAL PROPERTY & USAGE LICENSING\nThe legal copyright of all visual media remains exclusively with the Studio. Clients receive personal, social media, and web self-promotion usage rights.\n\n3. COMPREHENSIVE LIABILITY WAIVER\nParticipant(s) enter the studio workspace and perform physical poses entirely at their own risk.\n\n4. DELIVERABLES, REVISIONS & CLOUD ARCHIVAL\nDeliverables include 1 Round of Minor Revisions (within 7 days). Cloud retention is active for ${isTfpCat ? '3 Months' : '6 Months'}. RAW files are strictly excluded.\n\n5. UNAUTHORIZED CAMERA OPERATION & GEAR PROTECTION\nAll camera gear and memory cards are strictly hands-off.\n\n6. DIGITAL CONSENT & EMAIL ACCEPTANCE\nLegal acceptance is established by submitting this request.${engagementFeeClause}${lateArrivalClause}`;
        const sheetText = (agreedSheetText || "").trim();
        const standardTermsText = sheetText || legacyStandardClauses;
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
            `1. CUSTOM CONTRACT / AGENCY MSA REQUEST\nThis shoot request is submitted under a Custom Client Contract / Agency Master Services Agreement (MSA). Studio V3.7 default terms remain subject to custom contract review and mutual alignment prior to shoot day confirmation.\n\n2. CAMERA GEAR & DATA PROTECTION CLAUSE\nAll camera bodies, memory cards, and raw captures remain confidential studio property. Participants may not touch equipment or delete media from cameras.\n` +
            `\n\nSTANDARD TERMS SHOWN AT BOOKING (subject to the custom contract review above)\n--------------------------------------------------\n${standardTermsText}` :
            standardTermsText
          ) +
          `\n\nnerdyphotographer.in\n` +
          `==================================================`
        ) : "";

        // One canonical inquiry body — the copy-paste block gets the full
        // version (release text included). The mailto/Gmail/Outlook links get
        // a COMPACT body without the release: embedding the full release used
        // to blow past browser URL length limits, so for test shoots the mail
        // app silently refused to open at all.
        // (packageSchedule / paymentTermsText are resolved above, alongside the
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
        // rented space as the home studio leaves the studio's own record
        // describing a shoot that never happened there.
        const inviteVenueName = (bookingCalc && bookingCalc.isValidInvite && bookingCalc.lockedLocation) || "";
        const venueLabel = inviteVenueName || HOME_STUDIO_NAME;
        const studioSpaceVal = (isHomeStudio || homeStudioRentalFee > 0)
          ? (homeStudioRentalFee > 0
              ? `${venueLabel} — provided by the studio, fixed rental ₹${homeStudioRentalFee.toLocaleString('en-IN')} (itemised in the quote)`
              : `${venueLabel} — provided by the studio, no rental billed`)
          : (venueByStudio
              ? `Not required — venue provided by the studio (photographer's invite)`
              : (val("b_studio_space") || 'Not Specified') + (studioArrangerPick
                  ? ` — Arranged by: ${studioArrangerPick === "Photographer Arranges Studio & Lighting (Billed at Actuals)" ? `photographer (studio & lighting quoted in advance, ${isTfpCat ? "payable in full before shoot day" : "payable in full with the 50% advance"})` : "client (client books studio & lighting independently)"}`
                  : ""));
        const studioRentalPolicyNote = (homeStudioRentalFee > 0)
          // A paid home-studio booking is the one case where the studio does
          // charge for its own venue, so the stock "no fee is billed to you"
          // and "billed at actuals" lines would both misstate the quote.
          ? `Studio Rental Policy: This session takes place at the studio's home studio in ${HOME_STUDIO_AREA}. A fixed home studio rental of ₹${homeStudioRentalFee.toLocaleString('en-IN')} applies and is itemised in your production quote — nothing further is charged for the venue.\n` +
            homeStudioHouseRules
          : venueByStudio
            ? `Studio Rental Policy: The venue for this session is arranged and paid for by the studio. No venue rental or studio space fee is billed to you for this shoot.\n` +
              (isHomeStudio ? homeStudioHouseRules : ``)
            : `Studio Rental Policy: Package rates cover photography, light design & retouched master deliverables. If a dedicated indoor studio space is required, venue rental fees are quoted separately in advance, or the client may book the studio directly.\n` +
              (studioArrangerSubmitClause ? `Studio Arranger:${studioArrangerSubmitClause}\n` : ``);
        const travelPolicyNote = venueByStudio
          ? `Travel & Accommodation Policy: Travel to the studio-provided venue above is covered by the studio${inviteMeta ? " for this invite" : ""}. If you later request a different location, standard terms apply again (travel beyond ${isTfpCat ? 10 : 20} km from the studio base in Noida, and accommodation where an overnight stay is needed, billed at actuals).\n`
          : `Travel & Accommodation Policy: Shoots requiring travel beyond ${isTfpCat ? 10 : 20} km from the studio base (Noida) incur paid travel and, where an overnight stay is needed, accommodation - billed at actuals (at cost).\n`;
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

        // One pricing block, written once and sent everywhere — the studio's
        // relay email, the client's Gmail/Outlook/copy body and the mailto
        // fallback. Before this the relay carried a total with no code and no
        // savings, and the client's copy carried the package with no total, so
        // a discounted booking could not be reconciled from either inbox; an
        // invited test shoot named no code at all and reported its waived
        // home studio as "Not applicable".
        const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
        const isCollabPricing = isTfpCat || isValidInvite || type === "Selective Collaboration (TFP)";
        // Brands and agencies asking for a test shoot name the paid package
        // they would take if the collaboration is declined; it was collected
        // on the form and never sent anywhere.
        const fallbackPackage = isCollabPricing ? (val("b_collab_fallback") || "") : "";
        const inviteLine = (isValidInvite && inviteMeta)
          ? `${inviteMeta.code} — ${inviteMeta.desc}${inviteMeta.lockedLocation ? ` · venue set by the studio: ${inviteMeta.lockedLocation}` : ""}`
          : (enteredCode ? `${enteredCode} — not recognised, no invite applied` : "");
        const promoLine = promoMeta
          ? `${promoMeta.code}${promoMeta.tag ? ` — ${promoMeta.tag} on the package` : ""}` +
            (homeStudioWaivedByPromo
              ? " · home studio rental waived"
              : (homeStudioDiscountedByPromo ? ` · ${homeStudioPromoDiscountLabel} on the home studio rental` : "")) +
            ((!promoMeta.tag && !homeStudioWaivedByPromo && !homeStudioDiscountedByPromo) ? " · no discount applies to this booking" : "")
          : (enteredDiscount ? `${enteredDiscount} — not recognised, no discount applied` : "");
        const packageDiscountLine = savings > 0 ? `− ${inr(savings)} (${discountTagText})` : "";
        const venueChargeLine = homeStudioRentalFee > 0
          ? `${inr(homeStudioRentalFee)} — ${venueLabel}` +
            (homeStudioDiscountedByPromo
              ? ` (${homeStudioPromoDiscountLabel} with promo code ${promoCodeUsed}, normally ${inr(homeStudioListPriceVal)})`
              : (homeStudioDiscountedByInvite ? ` (${homeStudioInviteDiscountLabel} with invite code ${inviteCodeUsed}, normally ${inr(homeStudioListPriceVal)})` : "")) +
            " · payable in full before the shoot"
          : homeStudioWaivedByPromo
            ? `₹0 — ${venueLabel}, waived by promo code ${promoCodeUsed} (normally ${inr(homeStudioListPriceVal)})`
            : homeStudioWaivedByInvite
              ? `₹0 — ${venueLabel}, waived by invite code ${inviteCodeUsed} (normally ${inr(homeStudioListPriceVal)})`
              : venueByStudio
                ? `₹0 — ${venueLabel}, provided by the studio${inviteCodeUsed ? ` (invite code ${inviteCodeUsed})` : ""} — no rental billed`
                : studioArrangerPick === "Photographer Arranges Studio & Lighting (Billed at Actuals)"
                  ? `Commercial studio & lighting arranged by the photographer — quoted in advance, ${isTfpCat ? "payable in full before shoot day" : "payable in full with the 50% advance"}`
                  : (studioArrangerPick
                      ? "Commercial studio & lighting booked by the client directly — nothing billed by the studio"
                      : "Not applicable — no studio rental");
        const totalSavings = (Number(savings) || 0) + (Number(homeStudioPromoDiscountAmount) || 0) + (Number(homeStudioInviteDiscountAmount) || 0);
        const finalPayableNum = Number(financialSummary.finalPayable) || 0;
        const totalPayableLine = isProduction
          ? "Quoted on the brief"
          : finalPayableNum > 0
            ? `${inr(finalPayableNum)}${isCollabPricing ? " — home studio rental only, no shoot fee" : (totalSavings > 0 ? ` (after ${inr(totalSavings)} in discounts)` : "")}`
            : (isCollabPricing ? "₹0 — collaboration, nothing payable to the studio" : "—");
        const paymentScheduleLine = isProduction
          ? `${productionSchedule.text} — as shown on the brief form; figures confirmed in the proposal`
          : isCollabPricing
            ? (homeStudioRentalFee > 0
                ? `${inr(homeStudioRentalFee)} rental payable in full at least 48 hours before the shoot (non-refundable once paid)`
                : "Nothing payable")
            : (() => {
                const legs = splitPackageMilestones(Math.max(0, finalPayableNum - homeStudioRentalFee), homeStudioRentalFee, packageScheduleKey);
                const advNote = `non-refundable${homeStudioRentalFee > 0 ? ", includes the studio rental" : ""}`;
                return [`Advance retainer ${inr(legs[0])} (${advNote})`]
                  .concat(packageSchedule.emailLegs.map((tpl, i) => tpl.replace("{amt}", inr(legs[i + 1] || 0))))
                  .join(" · ");
              })();
        const pricingLines =
          (fallbackPackage ? `Paid Fallback Package (if the collaboration is declined): ${fallbackPackage}\n` : "") +
          (inviteLine ? `Invite Code: ${inviteLine}\n` : "") +
          (promoLine ? `Promo Code: ${promoLine}\n` : "") +
          (packageDiscountLine ? `Package Discount: ${packageDiscountLine}\n` : "") +
          `Studio / Venue Charge: ${venueChargeLine}\n` +
          (totalSavings > 0 ? `Total Savings: ${inr(totalSavings)}\n` : "") +
          `Total Payable: ${totalPayableLine}\n` +
          `Payment Schedule: ${paymentScheduleLine}\n`;
        // The mailto: link is length-capped, so it gets only the lines that
        // change what the studio has to invoice.
        const pricingShort =
          (inviteLine ? `Invite Code: ${inviteLine}\n` : "") +
          (promoLine ? `Promo Code: ${promoLine}\n` : "") +
          `Total Payable: ${totalPayableLine}\n`;

        const compactBody =
          `${isProduction ? "Campaign / Production Brief" : "Shoot Booking Details"}:\n\n` +
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
          (isProduction ? `Budget / Package: Quoted on the brief after a call\n` + productionLines : cleanBudget) +
          pricingLines +
          (type !== "Selective Collaboration (TFP)"
            ? `${paymentTermsText}\n`
            : (homeStudioRentalFee > 0
                ? `Payment Terms: No shoot fee applies to this collaboration. The home studio rental of ₹${homeStudioRentalFee.toLocaleString('en-IN')} is payable IN FULL at least 48 hours before the shoot day to reserve the space (non-refundable once paid). Nothing else is payable to the studio.\n`
                : "")) +
          crewCostPolicyNote +
          deliverablePolicyNote +
          gearPolicyNote +
          `Moodboard Link: ${moodboard || '—'}\n` +
          (agreedToTerms
            ? (isCustomContract
                ? `Contract Agreement: ${name} has REQUESTED A CUSTOM CONTRACT / AGENCY MSA rather than accepting the standard terms as they stand. Studio default terms remain subject to custom contract review and mutual alignment before the shoot day is confirmed.\nRequested Contract Changes: ${customContractNotes || "—"}\nContract Reference: ${contractRefDoc}\nSignature Captured: ${sigDataUrl ? 'Yes' : 'No'}\nRead terms online: https://www.nerdyphotographer.in/book/${isTfpCat ? '#tfp-terms' : '#terms'}\n\n`
                : `Contract Agreement: ${name} has agreed to ${contractRefDoc} in full, without modifications. By sending this email the client confirms acceptance of all studio terms and conditions.\nContract Reference: ${contractRefDoc}\nSignature Captured: ${sigDataUrl ? 'Yes' : 'No'}\nRead terms online: https://www.nerdyphotographer.in/book/${isTfpCat ? '#tfp-terms' : '#terms'}\n\n`)
            : `\n`) +
          `Concept/Vision:\n${concept || '—'}`;
        const inquiryBody = compactBody + tfpReleaseText;
        const plainTextBody = `To: ${studioEmail}\nSubject: ${isProduction ? "Production Brief" : "Shoot Booking Request"} — ${name}\n\n` + inquiryBody;

        const subject = encodeURIComponent(isProduction ? `Production Brief — ${name}` : isCustomContract ? `Shoot Booking Request (CUSTOM CONTRACT REQUESTED) — ${name}` : `Shoot Booking Request — ${name}`);
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
          `${isProduction ? "Campaign / Production Brief" : "Shoot Booking Details"}:\n\n` +
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
          (isProduction ? `Budget / Package: Quoted on the brief after a call\n` + productionLines : cleanBudget) +
          pricingShort +
          `Moodboard Link: ${moodboard || '—'}\n` +
          (agreedToTerms
            ? (isCustomContract
                ? `Contract Agreement: CUSTOM CONTRACT / AGENCY MSA REQUESTED — standard terms subject to review.\nRequested Contract Changes: ${customContractNotes || "—"}\nContract Reference: ${contractRefDoc}\nSignature Captured: ${sigDataUrl ? 'Yes' : 'No'}\n`
                : `Contract Agreement: ${name} has agreed to ${contractRefDoc} in full, without modifications. By sending this email the client confirms acceptance of all studio terms and conditions.\nContract Reference: ${contractRefDoc}\nSignature Captured: ${sigDataUrl ? 'Yes' : 'No'}\n`)
            : ``) +
          (isProduction ? `` :           `Studio Policies (studio rental, travel & accommodation, deliverables & RAW files, camera & media, payment terms): read and accepted in full — https://www.nerdyphotographer.in/book/${isTfpCat ? '#tfp-terms' : '#terms'}\n\n`) +
          `Concept/Vision:\n${concept || '—'}`;

        let mailtoUrl = buildMailto(compactBody);
        if (mailtoUrl.length > MAILTO_SAFE_LEN) mailtoUrl = buildMailto(mailtoShortBody);
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(studioEmail)}&su=${subject}&body=${body}`;
        const outlookUrl = `https://outlook.live.com/default.aspx?rru=compose&to=${encodeURIComponent(studioEmail)}&subject=${subject}&body=${body}`;

        const contractNumber = agreedToTerms ? generateContractNumber() : "";

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

          // The same payload used to be POSTed to the never-deployed Render
          // host as well (v443 removed it): it carried the client's name,
          // email, phone, Instagram, signature and financials to a hostname
          // the studio does not own. The record the studio keeps is the
          // contract email; this local copy is the client's own.
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
            // The days the picker recorded, when it was used. Falling back to
            // the text, a range or list is split on the en-dash or on commas
            // that separate whole dates ("Oct 10, 2026, Oct 11, 2026"), never
            // on the comma inside one date, which is what filed bookings under
            // the year 2001.
            const dateEl = $("#b_date");
            const picked = (dateEl && Array.isArray(dateEl._wpsPickedDates) && dateEl._wpsPickedDates.length)
              ? dateEl._wpsPickedDates.slice()
              : date.split(/\s*[–—]\s*/)
                    .flatMap((part) => part.split(/,(?=\s*[A-Za-z])/))
                    .map((t) => new Date(t.trim()))
                    .filter((d) => !isNaN(d.getTime()) && d.getFullYear() >= 2020);
            picked.forEach(dObj => {
              {
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
        // mode: "sending" (waiting on the relay), "sent" (the relay confirmed),
        // "gmail" / "manual" (the relay failed, the client has to send it).
        // "sending" is the state the panel opens in: saying "Request sent" before
        // the relay has answered told clients their booking had arrived when it
        // might not have, and a client who closed the tab in that window never
        // saw the correction (site audit, Sep 2026).
        const showSuccess = (mode) => {
          const sending = mode === "sending";
          const sentDirectly = mode === "sent";
          // Until the relay answers there is nothing for the client to do, and
          // the fallback buttons would be telling them to send it themselves.
          [$("#bookGmailLink"), $("#bookOutlookLink"), $("#bookMailtoLink"), $("#bookAnother"),
           $("#copyInquiryBtn"), $("#inquiryTextPreview")].forEach((el) => { if (el) el.hidden = sending; });
          const steps = successPanel && successPanel.querySelector(".next-steps");
          if (steps) steps.hidden = sending;
          if (successPanel) successPanel.classList.toggle("is-tfp", type === "Selective Collaboration (TFP)");
          if (successPanel) successPanel.classList.toggle("is-production", isProduction);
          // The booking itself was already written to the calendar store by
          // the instant-save block above — recording it again here doubled
          // every agreed booking on the device (two slots per date).
          if (date) window.WPS_ADMIN?.updateReminders?.();

          if (successPanel) {
            form.hidden = true;
            successPanel.hidden = false;

            const iconEl = $("#bookSuccessIcon");
            if (iconEl) {
              iconEl.innerHTML = sending
                ? `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 2a10 10 0 0 1 10 10"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/></path><circle cx="12" cy="12" r="10" opacity="0.25"/></svg>`
                : sentDirectly
                ? `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`
                : `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>`;
            }

            const headingEl = $("#bookSuccessHeading");
            if (headingEl) {
              headingEl.textContent = sending
                ? (isProduction ? "Sending your brief…" : "Sending your request…")
                : sentDirectly
                ? (isProduction ? "Brief received." : "Request sent.")
                : (mode === "gmail" ? "One last step — press Send." : "One last step — pick how to send.");
            }

            // What the acceptance note may claim depends on whether the request
            // actually reached the studio: it used to say "already recorded with
            // the studio… regardless of the email below" even when both emails
            // had failed, which was the one thing it could not promise.
            const releaseNote = !agreedToTerms ? ""
              : sentDirectly
              ? `<br/><br/><strong style="color: var(--accent-text);">Terms agreed:</strong> your acceptance of <em>${esc(contractRefDoc)}</em>${contractNumber ? ` (${esc(contractNumber)})` : ""} went to the studio with this request, and a copy is on its way to you.`
              : `<br/><br/><strong style="color: var(--accent-text);">Terms agreed:</strong> your acceptance of <em>${esc(contractRefDoc)}</em>${contractNumber ? ` (${esc(contractNumber)})` : ""} is saved in this browser and is part of the email below — it reaches the studio when you send it.`;

            const msgEl = $("#bookSuccessMsg");
            if (msgEl) {
              if (sending) {
                msgEl.innerHTML = `Sending this to the studio now — <strong>please keep this page open</strong> for a moment. We'll confirm here as soon as it's through, and show you another way to send it if anything goes wrong.`;
              } else if (sentDirectly && isProduction) {
                msgEl.innerHTML = `<strong style="color: var(--accent-text);">Brief received.</strong> It's with the studio. I'll reply within 24 hours to set up a call; the proposal and agreement follow the call.`;
              } else if (sentDirectly) {
                msgEl.innerHTML = `<strong style="color: var(--accent-text);">Request sent!</strong> Your booking inquiry has been delivered straight to the studio — no further action needed. I'll reply to <strong>${esc(email)}</strong>.` +
                  releaseNote +
                  `<br/><br/><span style="opacity: 0.8;">Want a copy for your own records? The buttons below open the same inquiry in your email app.</span>`;
              } else if (mode === "gmail") {
                msgEl.innerHTML = `I've opened your inquiry, already filled in, in a <strong>new Gmail tab</strong> — switch to it and press <strong>Send</strong> to finish. <span style="opacity: 0.8;">Nothing has reached the studio until you do.</span>` +
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
          _subject: isProduction ? `Production Brief — ${name}` : (isCustomContract ? `Shoot Booking Request (CUSTOM CONTRACT REQUESTED) — ${name}` : `Shoot Booking Request — ${name}`),
          "Enquiry": isProduction ? "Campaign / production brief — quote on the brief after a call" : "Booking request",
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
          // With no published rates in hand, nothing on the page was a real
          // quote, so the email must not read as though one was agreed.
          ...(pricesArePublished() ? {} : { "⚠️ Prices": "The studio's rates could not be loaded in this visitor's browser, so no quote was shown and none was agreed. Quote this request by email." }),
          "Package": isProduction ? "Quoted on the brief" : (pricesArePublished() ? budget : "Not quoted — prices unavailable"),
          ...(isProduction ? { "What we're shooting": val("p_subject") || "—", "Usage": val("p_usage") || "—", "Budget band": val("p_budget") || "Prefer to discuss", "Rough scale": val("p_scale") || "—" } : {}),
          ...(fallbackPackage ? { "Paid Fallback Package": fallbackPackage } : {}),
          "Invite Code": inviteLine || "—",
          "Promo Code": promoLine || "—",
          "Package Discount": packageDiscountLine || "—",
          "Studio / Venue Charge": venueChargeLine,
          "Total Savings": totalSavings > 0 ? inr(totalSavings) : "—",
          "Total Payable": pricesArePublished() ? totalPayableLine : "Not quoted — prices unavailable",
          "Payment Schedule": paymentScheduleLine,
          ...(dateAlreadyBooked ? { "Date Status": "⚠️ This date already has a booking on the calendar — confirm anyway or offer an alternative" } : {}),
          "Moodboard Link": moodboard || "—",
          "Concept / Vision": concept || "—",
          "Contract Agreement": agreedToTerms
            ? `AGREED — ${contractRefDoc}${contractNumber ? ` · No. ${contractNumber}` : ""} · ${sigDataUrl ? "drawn signature captured" : (agreementMethod === "checkbox" ? "accepted by checkbox" : "accepted by email/DM consent")}${isCustomContract ? " · CUSTOM CONTRACT / AGENCY MSA REQUESTED" : ""} (full text below)`
            : "Not applicable",
          // What the client typed into "Request Custom Contract". It used to
          // travel only as one line inside the full contract text below,
          // where a request to change the terms was easy to miss.
          ...(isCustomContract ? { "Requested Contract Changes": customContractNotes || "Client requested a custom contract / agency MSA (no details given)" } : {}),
        };
        if (agreedToTerms) relayFields["Contract Full Text"] = tfpReleaseText.trim();

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
            isCustomContract,
            customContractNotes,
            notes: `Location: ${locationVal} | Package: ${budget} | Total payable: ${totalPayableLine}${inviteLine ? ` | Invite code: ${inviteLine}` : ""}${promoLine ? ` | Promo code: ${promoLine}` : ""}`
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

        // The panel opens on "Sending…", not on "Request sent": the booking is
        // saved on this device by the block above, but only the relay can say
        // whether the studio has it.
        showSuccess("sending");

        // FormSubmit reports soft
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
          if (relayOk) {
            // Only now is it true. The signed-contract email follows rather
            // than travelling beside this one: FormSubmit rate-limits per IP,
            // and two emails fired in the same millisecond knock each other
            // out — the bug this sequencing was written for in v258, undone by
            // an "instant response" change in v281 and found again in the
            // Sep 2026 audit.
            showSuccess("sent");
            sendContractRecord();
            return;
          }
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

      if (window.isProductionBrief && window.isProductionBrief()) {
        // No package, no quote, no contract at this step: the brief goes to the
        // studio and the proposal and agreement follow the call.
        proceedSubmit(false, "Commercial", true, "Campaign / production brief — scope, team, dates and terms to be discussed on a call; proposal and agreement to follow.", "", "none");
        return;
      }
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
      agreedSheetText = "";
      if (customBtn) {
        customBtn.textContent = "📝 Request Custom Contract";
        customBtn.style.display = isTfp ? "none" : "inline-flex"; // Hide custom contract for fixed TFP collaborations
      }

      if (modalTitle) modalTitle.textContent = isTfp ? "Studio Production & Liability Release" : "Commercial Shoot Contract & Production Agreement";
      if (modalTag) modalTag.textContent = isTfp ? "TFP-LIABILITY-RELEASE-V3.7 (ACTIVE)" : "COMMERCIAL-CONTRACT-V3.7 (ACTIVE)";
      // Travel radius in the policy text: 10 km on a test shoot, 20 km otherwise.
      document.querySelectorAll("#termsModal .policy-km").forEach(el => { el.textContent = isTfp ? "10" : "20"; });
      // The grace-period clause is a test-shoot term only. It has to be toggled
      // on every open, not just hidden by default: the modal element persists
      // across bookings, so a commercial enquiry opened after a TFP one would
      // otherwise still be showing it.
      const versionLabel = $("#termsAgreeVersionLabel");
      if (versionLabel) versionLabel.textContent = `Studio Terms & Conditions (${isTfp ? "Version V3.7" : "Version V3.7"})`;
      const lateArrivalSection = $("#termsLateArrivalSection");
      if (lateArrivalSection) {
        // Applies to both kinds now, on different terms — a paid client gets
        // three hours against a collaboration's one. Rebuilt on every open
        // because the modal element outlives the booking that filled it.
        lateArrivalSection.innerHTML = window.buildLateArrivalHtml(isTfp, 9);
        lateArrivalSection.style.display = "block";
      }
      if (partnerNameEl) partnerNameEl.textContent = partnerName || "Valued Client";
      const termsLocationEl = $("#termsLocation");
      if (termsLocationEl) termsLocationEl.textContent = ($("#b_location")?.value || "").trim() || "As per the booking form";
      
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
        ? ` This session takes place at the Studio's home studio in ${HOME_STUDIO_AREA}${modalVenueAddress && modalVenueAddress !== HOME_STUDIO_NAME ? ` (<strong>${esc(modalVenueAddress)}</strong>)` : ""}. A fixed home studio rental of <strong>₹${modalHomeStudioFee.toLocaleString("en-IN")}</strong> applies and is itemised in your quote, <strong>payable in full at least 48 hours before the shoot day</strong> to reserve the space and non-refundable once paid — nothing further is charged for the venue, and no travel cost is charged for it.${modalHomeRider}`
        : modalVenueByStudio
        ? ` The shoot venue${modalVenueAddress ? ` (<strong>${esc(modalVenueAddress)}</strong>)` : ""} is arranged and paid for by the Studio — no studio rental, venue hire or travel cost is billed to you for it. Requesting a different location later re-applies the standard venue and travel terms.${modalHomeRider}`
        : (isTfp
            ? ` Locations &gt;${isTfp ? 10 : 20} km from Noida require client-funded travel, conveyance &amp; accommodation.`
            : ` Dedicated indoor studio venue rentals are <strong>quoted separately in advance</strong>.`);

      // The heading matched the test-shoot wording too, so a paying client's
      // record said "TECHNICAL PERFORMANCE & DELIVERY DISCLAIMER" over the
      // collaboration text. Both are set from the booking now.
      const sec4Title = $("#termsSec4Title");
      if (sec4Title) {
        sec4Title.textContent = isTfp
          ? "4. TECHNICAL PERFORMANCE & DELIVERY DISCLAIMER"
          : "4. TECHNICAL PERFORMANCE, DELIVERABLES, PROOFING GALLERY, REVISIONS & PAYMENT MILESTONES";
      }
      if (sec4Text) {
        sec4Text.innerHTML = isTfp
          ? `As a creative collaboration, test shoots (TFP collabs) include <strong>${esc(getAdminTfpPackage().specs)}</strong>. Deliverables include 1 Round of Minor Revisions (within 7 days). Cloud retention is active for 3 Months (90 days). The Studio retains final artistic authority over image selection and editing styles.${venueSentence} Under no circumstances will raw unedited files (RAW format) be delivered.`
          : `Commercial productions include a <strong>Full Proofing Gallery + contracted retouched master deliverables</strong> specified in the rate tier. Deliverables include 1 Round of Minor Revisions (within 7 days). Cloud retention is active for 6 Months (180 days). Extended usage licensing or RAW file access requires separate buyout agreements.${venueSentence} Payment terms follow 50/50 non-refundable milestone payments.`;
      }

      // The sheet's header and first two clauses were written for a test
      // shoot and never changed: a paying client was ticking a box under
      // "Production Status: TFP Collab" and "No monetary compensation is
      // required or exchanged", while the contract emailed to them said the
      // opposite. Reworded here from the same clauses the emailed commercial
      // contract carries, so what is ticked and what is recorded agree.
      const tfpSubtitle = "TFP Collaboration, Model Release & Digital Consent Terms";
      const subtitleEl = $("#termsModalSubtitle"), partnerLabelEl = $("#termsPartnerLabel"), prodStatusEl = $("#termsProductionStatus");
      const sec1Title = $("#termsSec1Title"), sec1Text = $("#termsSec1Text"), sec2Title = $("#termsSec2Title"), sec2Text = $("#termsSec2Text");
      const modalPackage = isTfp ? "" : ($("#b_budget")?.value || "");
      const modalSchedule = PACKAGE_SCHEDULES[getPackageScheduleKey()];
      const modalPayTerms = modalSchedule.sheet;
      if (subtitleEl) subtitleEl.textContent = isTfp ? tfpSubtitle : "Commercial Shoot, Usage Licence & Digital Consent Terms";
      if (partnerLabelEl) partnerLabelEl.textContent = isTfp ? "Creative Partner/Model:" : "Client:";
      if (prodStatusEl) prodStatusEl.textContent = isTfp ? "Time-For-Print (TFP) Collab" : `Commercial / paid production${modalPackage ? ` — ${modalPackage}` : ""}`;
      if (sec1Title) sec1Title.textContent = isTfp ? "1. SCOPE OF CREATIVE COLLABORATION" : "1. SCOPE OF PRODUCTION, PACKAGE FEE & PAYMENT MILESTONES";
      if (sec1Text) sec1Text.innerHTML = isTfp
        ? `This session is scheduled as a peer-to-peer creative collaboration structured for mutual portfolio growth, asset curation, and personal branding advancement. No monetary compensation is required or exchanged for photographer or model services. The Studio provides specialized equipment, lighting architecture, workspace, and post-production engineering; the Participant(s) provide technical modelling direction, personal wardrobe, and makeup artistry. `
        : `This session is scheduled as a commercial photography production under the package selected on the booking form${modalPackage ? ` (<strong>${esc(modalPackage)}</strong>)` : ""}. Package rates cover photography, light design, direction and the contracted retouched master deliverables; hair &amp; makeup, styling, set and any other third-party crew are quoted for your approval and billed at actuals. <strong>Payment:</strong> ${modalPayTerms}; any studio rental is payable in full together with the advance. Milestone payments marked non-refundable are non-refundable once paid, including where the client cancels or reschedules. ${modalSchedule.release} `;
      if (sec2Title) sec2Title.textContent = isTfp ? "2. INTELLECTUAL PROPERTY, MODEL RELEASE & USAGE LICENSE" : "2. INTELLECTUAL PROPERTY & USAGE LICENSING";
      if (sec2Text) sec2Text.textContent = isTfp
        ? "The legal copyright of all visual media remains exclusively with the Studio. To support mutual growth and portfolio building, all participants are granted a full non-exclusive license to publish, share, and use final retouched photos for personal self-promotion, social media grids (Instagram/TikTok), personal websites, and agency portfolios."
        : "The legal copyright of all visual media remains exclusively with the Studio. Clients receive personal, social media, and web self-promotion usage rights for the final retouched photos. Any work beyond the contracted package (additional retouched masters, extended usage, gallery buyout) is quoted and invoiced separately.";

      const termsModalEl = $("#termsModal");
      termsModalEl.style.display = "flex";
      // Focus used to stay on the Submit button behind the overlay: Tab walked
      // the page underneath, Escape did nothing, and a keyboard-only client
      // could never reach Agree — so could not book at all (Sep 2026 audit).
      const termsOpener = document.activeElement;
      const termsFocusable = () => [...termsModalEl.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.offsetParent !== null);
      const onTermsKeydown = (e) => {
        if (e.key === "Escape") { e.preventDefault(); onDeclineClick(); return; }
        if (e.key !== "Tab") return;
        const f = termsFocusable();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || !termsModalEl.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !termsModalEl.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      };
      termsModalEl.addEventListener("keydown", onTermsKeydown);
      document.addEventListener("keydown", onTermsKeydown);
      // The terms themselves, so the first thing a screen reader meets is what
      // is being agreed to rather than the button that agrees to it.
      setTimeout(() => { const area = $("#termsScrollArea"); (area || termsFocusable()[0] || termsModalEl).focus(); }, 30);
      const acceptBtn = $("#termsAcceptBtn");

      // Agreement is captured by the checkbox above. The drawn-signature
      // canvas that used to live here was removed by request: signing with a
      // finger or stylus is fiddly for many clients, and the tick-box is now
      // the studio's permanent mechanism. Bookings recorded before the change
      // still hold a real signature image and are still rendered as one.

      const close = () => {
        termsModalEl.style.display = "none";
        termsModalEl.removeEventListener("keydown", onTermsKeydown);
        document.removeEventListener("keydown", onTermsKeydown);
        if (acceptBtn) acceptBtn.removeEventListener("click", onAcceptClick);
        if (customBtn) customBtn.removeEventListener("click", onCustomClick);
        if (declineBtn) declineBtn.removeEventListener("click", onDeclineClick);
        // Back to the button that opened it, so the visitor keeps their place.
        if (termsOpener && document.contains(termsOpener)) { try { termsOpener.focus(); } catch {} }
      };

      const onAcceptClick = () => {
        const checkbox = $("#termsAgreeCheckbox");
        if (checkbox && !checkbox.checked) {
          alert("Please check the box to agree to the terms and continue!");
          return;
        }
        agreedSheetText = serializeTermsSheet();
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
          agreedSheetText = serializeTermsSheet();
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
    } else if (location.hash === "#terms") {
      // The link in every commercial client's email ("Read terms online:
      // …/book/#terms") opened the form and nothing else, so a paying client
      // could not re-read what they had agreed to (Sep 2026 audit).
      openTermsModal("Client", "Commercial");
    }

    // "Send another request" — reset back to a clean form.
    $("#bookAnother")?.addEventListener("click", () => {
      form.reset();
      // form.reset() empties the field but not the picker behind it: the next
      // request kept reporting the previous date's "already booked" badge, and
      // sent that warning to the studio about a different day (Sep 2026 audit).
      const dateEl = $("#b_date");
      if (dateEl) {
        dateEl._wpsPickedDates = null;
        dateEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
      ["b_name", "b_email", "b_date"].forEach(clearError);
      if (successPanel) successPanel.hidden = true;
      form.hidden = false;
      form.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" });
      updateFields();
    });
  }

  // One share affordance for both card layouts. Prefers the OS share sheet,
  // because this is mostly pressed on a phone to send a model their own
  // card over WhatsApp, and falls back to the clipboard and then to a
  // prompt — clipboard access needs a secure context and can be refused,
  // and the old handler's only answer to that was "Failed to copy link".
  function wireShareButton(btn, album) {
    if (!btn || !album) return;
    // Start the "is the album's own page live?" check as soon as a finger or
    // pointer heads for the button, so the answer is in hand by the click.
    // A model card has a page of its own, an album has its album page; either
    // previews with that subject's name and face where a /share/ link shows
    // the same generic card for everything.
    const own = modelPathFor(album) || albumPathFor(album);
    const warm = () => { albumPageIsLive(own); };
    if (own) {
      btn.addEventListener("pointerenter", warm, { once: true });
      btn.addEventListener("touchstart", warm, { once: true, passive: true });
      btn.addEventListener("focus", warm, { once: true });
    }
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      let url = shareUrlFor(album);
      if (own) {
        // Capped: the share sheet must open while the tap still counts as one.
        const live = await Promise.race([albumPageIsLive(own), new Promise((r) => setTimeout(() => r(false), 1200))]);
        if (live) url = modelPathFor(album) ? `${window.location.origin}${own}` : albumShareUrlFor(album);
      }
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

  // Full-bleed work blocks (Albums, Categories, the Comp Cards blocks): open the
  // lightbox, share, and the admin edit / hide / delete buttons. `root` is the
  // view, or the slot on the model portfolio service page the blocks are painted into.
  function wireWorkBlocks(root) {
    root.querySelectorAll(".work-block").forEach((block) => {
      const s = CURRENT_VIEW_SHOOTS.find((x) => x.id === block.dataset.shoot) || SHOOTS.find((x) => x.id === block.dataset.shoot);
      if (!s) return;
      // The viewer shows what the card shows: every photo tagged to the model.
      // buildCompCardDisplayList already decided which photos belong to this
      // card, and re-filtering them here by Usage is what used to hide a
      // model's portfolio-only work behind the comp-card page (and vice versa).
      const list = s.photos.map((p) => ({ ...p, shoot: s }));
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

      // The "Hide Card" button that sat here was removed (v442): it said the
      // card was hidden, but only changed this page in memory and wrote a
      // storage key nothing reads, so the card stayed public. Hiding a model's
      // card is the "Show on Comp cards" switch in Upload (Edit details),
      // which saves and publishes.

      // delete button click handler
      block.querySelector(".work-delete")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete the photoshoot "${s.title}"?`)) {
          await delShoot(s.id);
          await loadShoots();
          toast(`Deleted "${s.title}".`);
          render(); // re-render view
          await publishToLiveSite(SHOOTS, { deletedIds: [s.id] });
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
  }

  // Page numbers under a list: ← 1 2 3 →. Items stay in the DOM and only the
  // current page's are visible, so their wiring binds once. setItems() pages a
  // filtered subset instead (the A–Z bar, the client filter buttons) and hides
  // everything outside it. With a single page there is no bar.
  function makePager(list, per, items) {
    const every = items;
    let shown = items, current = 1;
    const nav = document.createElement("nav");
    nav.className = "pager";
    nav.setAttribute("aria-label", "Pages");
    list.insertAdjacentElement("afterend", nav);
    const show = (n, scroll) => {
      const pages = Math.max(1, Math.ceil(shown.length / per));
      current = Math.min(Math.max(1, n), pages);
      shown.forEach((el, i) => {
        const on = Math.floor(i / per) + 1 === current;
        el.hidden = !on;
        if (on) el.classList.add("in");
      });
      nav.hidden = pages < 2;
      nav.innerHTML = pages < 2 ? "" : `
          <button type="button" class="pager-arrow" data-go="${current - 1}" ${current === 1 ? "disabled" : ""} aria-label="Previous page">←</button>
          ${Array.from({ length: pages }, (_, i) => `<button type="button" data-go="${i + 1}" ${i + 1 === current ? 'aria-current="page"' : ""}>${i + 1}</button>`).join("")}
          <button type="button" class="pager-arrow" data-go="${current + 1}" ${current === pages ? "disabled" : ""} aria-label="Next page">→</button>`;
      if (scroll) {
        const top = list.getBoundingClientRect().top + window.scrollY - 110;
        window.scrollTo({ top, behavior: "smooth" });
      }
    };
    nav.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-go]");
      if (!btn || btn.disabled) return;
      show(parseInt(btn.dataset.go, 10), true);
    });
    show(1, false);
    return {
      setItems(subset) {
        every.forEach((el) => { if (!subset.includes(el)) el.hidden = true; });
        shown = subset;
        show(1, false);
      }
    };
  }

  // The A–Z bar above a model list. With a pager, the letter pages its matches.
  function wireAlphaFilter(root, pager) {
    const alphaBtns = root.querySelectorAll(".alpha-btn");
    if (alphaBtns.length) {
      alphaBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          alphaBtns.forEach(b => { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
          btn.classList.add("active");
          btn.setAttribute("aria-pressed", "true");
          
          const filterVal = btn.dataset.alpha;
          const blocks = root.querySelectorAll(".work-block");
          if (pager) {
            pager.setItems([...blocks].filter((block) => filterVal === "ALL" || getTalentCleanName(block.dataset.talent || "").trim().charAt(0).toUpperCase() === filterVal));
            return;
          }
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
  }
  const alphaFilterBarHtml = (list) => `
        <div class="alpha-filter-bar container reveal">
          <button class="alpha-btn active" data-alpha="ALL" aria-pressed="true">ALL</button>
          ${"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(char => {
            const hasMatches = list.some(s => getTalentCleanName(s.talent).trim().charAt(0).toUpperCase() === char);
            return `<button class="alpha-btn" data-alpha="${char}" aria-pressed="false"${!hasMatches ? " disabled" : ""} aria-label="Models whose name starts with ${char}">${char}</button>`;
          }).join("")}
        </div>
      `;

  // The model portfolio service page shows the Comp Cards page's blocks — same
  // list, same rules, same A–Z bar — in the slot the deploy leaves for them.
  // The plain album cards the deploy writes there stay as what crawlers and
  // visitors without JavaScript read. Runs on every paint of a static page, so
  // a data refresh repaints the cards too.
  function paintServiceCompCards() {
    const slot = view.querySelector("[data-comp-cards]");
    if (!slot) return;
    const list = buildCompCardDisplayList(SHOOTS.filter((s) => qualifiesAsCompCard(s)), "type", "Comp Cards");
    if (!list.length) return;
    const firstPaint = !slot.dataset.painted;
    CURRENT_VIEW_SHOOTS = list;
    slot.innerHTML = `${alphaFilterBarHtml(list)}<div class="work-list">${list.map(fullBleedBlock).join("")}</div>`;
    slot.dataset.painted = "1";
    const section = slot.closest("section");
    const eyebrow = section && section.querySelector(".section-head .eyebrow");
    if (eyebrow) eyebrow.textContent = `The work · ${list.length} model${list.length === 1 ? "" : "s"}`;
    wireWorkBlocks(slot);
    const cardList = slot.querySelector(".work-list");
    wireAlphaFilter(slot, makePager(cardList, 5, [...cardList.querySelectorAll(".work-block")]));
    // Arrived from an old Comp Cards link: land on the cards, not the page top.
    if (firstPaint && location.hash === "#comp-cards" && section) {
      const header = document.querySelector(".site-header");
      window.scrollTo({ top: Math.max(0, section.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight : 0)), behavior: "auto" });
    }
  }

  // "Judge it by the pictures" on the What I shoot pages, a page at a time: 12
  // photos, in a fresh random order on each visit so the same frames don't
  // always lead, or 5 albums. (The comp cards are paged where they are painted.)
  // Runs on every paint of a static page; a list already paged is left alone,
  // so a data refresh neither reshuffles nor resets what is on screen. The HTML
  // itself keeps the deploy's order and every item, for crawlers.
  function pageServiceWork() {
    view.querySelectorAll(".svc-photos:not([data-paged])").forEach((grid) => {
      grid.dataset.paged = "1";
      const tiles = shuffleArray([...grid.querySelectorAll(".svc-photo")]);
      tiles.forEach((tile) => grid.appendChild(tile));
      makePager(grid, 12, tiles);
    });
    view.querySelectorAll(".svc-cards:not([data-paged])").forEach((cards) => {
      cards.dataset.paged = "1";
      cards._pager = makePager(cards, 5, [...cards.querySelectorAll(".pr-card")]);
    });
  }

  function wireView(key) {
    if (key === "portfolio-book") {
      const root = view.querySelector("#studioBookRoot");
      // The builder borrows the book's storage and limits from admin.js, so
      // that has to be in hand first — without it the builder would quietly
      // make empty books instead of failing.
      const startBuilder = window.WPS_ADMIN?.loadBookBuilder;
      if (root && startBuilder) startBuilder()
        .then((SB) => { if (root.isConnected) SB.mount(root); })
        .catch((err) => { root.innerHTML = `<p class="pp-error">The builder could not load (${esc(err.message)}). Use “Load fresh version” and try again.</p>`; });
      else if (root) root.innerHTML = `<p class="pp-error">The studio screens have not loaded. Use “Load fresh version” and try again.</p>`;
    }
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
          publishToLiveSite(SHOOTS);
        } catch (err) {
          console.error("Inline edit save failed:", err);
          toast("Couldn't save that change.");
        }
      });
    });

    // Album page: every frame opens the lightbox at that frame.
    view.querySelectorAll(".album-page-grid").forEach((grid) => {
      const s = SHOOTS.find((x) => x.id === grid.dataset.shoot);
      if (!s) return;
      const list = s.photos.map((p) => ({ ...p, shoot: s }));
      grid.querySelectorAll(".album-page-photo").forEach((btn) => {
        btn.addEventListener("click", () => openLb(list, parseInt(btn.dataset.index, 10) || 0));
      });
      wireShareButton(view.querySelector(".album-page-actions .work-share"), s);
    });

    // noth.in full-bleed work cards → open the shoot in the lightbox.
    // Page numbers under any card list that asks for them (data-paginate="N").
    view.querySelectorAll("[data-paginate]").forEach((list) => {
      const per = Math.max(1, parseInt(list.dataset.paginate, 10) || 6);
      makePager(list, per, Array.from(list.children).filter(el => el.classList.contains("noth-work")));
    });
    view.querySelectorAll(".noth-work").forEach((card) => {
      const s = CURRENT_VIEW_SHOOTS.find((x) => x.id === card.dataset.shoot) || SHOOTS.find((x) => x.id === card.dataset.shoot);
      if (!s) return;
      // As above: the card's own photos, unfiltered.
      const list = s.photos.map((p) => ({ ...p, shoot: s }));
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
          await publishToLiveSite(SHOOTS, { deletedIds: [s.id] });
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

    wireWorkBlocks(view);

    // specialty thumb click interactions
    view.querySelectorAll(".specialty-thumb-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const kind = btn.dataset.kind;
        const val = btn.dataset.val;
        const clickedSrc = btn.dataset.src;
        
        // The comp-card and portfolio tiles advertise a page; no album has
        // "Comp Cards" as its type, so building a lightbox list from
        // s[kind] === val came out empty and the thumbnail was a dead click.
        // Open the page it advertises instead.
        if (kind === "type") {
          history.pushState(null, "", `/categories?kind=type&val=${encodeURIComponent(val)}`);
          render();
          return;
        }
        let shoots = SHOOTS.filter(s => s[kind] === val);
        
        const isCc = val === "Selective Collaboration (TFP)" && isCurrentlyCompCardView();
        const list = shoots.flatMap(s => (s.photos || []).filter(p => !isCc || usableOnCompCard(p)).map(p => ({ ...p, shoot: s })));
        const idx = list.findIndex(p => photoSrc(p) === clickedSrc);
        openLb(list, idx >= 0 ? idx : 0);
      });
    });

    wireAlphaFilter(view);

    if (key === "upload") {
      const editId = new URLSearchParams(location.search).get("edit");
      window.WPS_ADMIN?.wireUpload?.(editId);
    }
    if (key === "book") wireBook();
    if (key === "calendar") window.WPS_ADMIN?.wireCalendar?.();
    // animate hero counts
    view.querySelectorAll("[data-count]").forEach((el) => animateCount(el, parseInt(el.textContent, 10) || 0));
  }

  /* ============================================================
     §14 · ROUTER
     ============================================================ */
  /* The studio's four screens are built in admin.js and put themselves in
     here when it loads (WPS_ADMIN_API.setRoutes). Naming them directly would
     be a ReferenceError while this object is built — at boot, for every
     visitor — and that takes the whole application down, not just the route.
     Until they arrive the keys hold this placeholder, so an admin whose
     admin.js failed to arrive gets a sentence about it rather than a 404. */
  const ADMIN_SCREEN_PENDING = () => `
    <section class="page-head">
      <div class="container">
        <h1 class="kinetic-h1">Studio screen</h1>
        <p class="page-sub reveal">The studio's own screens have not loaded yet. If this stays, use “Load fresh version” in the menu and try again.</p>
      </div>
    </section>`;
  const ROUTES = { "": viewHome, "portfolio-book": ADMIN_SCREEN_PENDING, "albums": viewAlbums, "categories": viewCategories, "studio": viewStudio, "upload": ADMIN_SCREEN_PENDING, "book": viewBook, "calendar": ADMIN_SCREEN_PENDING, "contracts": ADMIN_SCREEN_PENDING, "testimonials": viewTestimonials, "workshop-attended": viewWorkshopAttended };

  /* ---- STATIC PAGES ---------------------------------------------------------
     The service pages (/services/…) are written as plain HTML at deploy by
     .github/scripts/build-seo.mjs: the page's content is already inside
     <main id="view" data-static-path="…"> when it arrives, which is what lets
     every crawler read it. The app keeps that HTML rather than painting over
     it, and fetches it when a visitor gets there by an in-app link instead. */
  const STATIC_PAGES = new Map(); // "/services/x" → { html, title, desc }, or null when there is no such page
  const staticPathOf = (pathname) => "/" + String(pathname).replace(/\/index\.html$/, "").replace(/^\/+|\/+$/g, "");
  function readStaticMain(mainEl) {
    const path = mainEl && mainEl.dataset.staticPath;
    if (!path || !mainEl.innerHTML.trim()) return null;
    return { path, html: mainEl.innerHTML, title: mainEl.dataset.title || "", desc: mainEl.dataset.desc || "" };
  }
  function captureStaticPage() {
    const page = readStaticMain(view);
    if (!page) return;
    STATIC_PAGES.set(page.path, page);
    view.dataset.showing = page.path;
  }
  async function fetchStaticPage(path) {
    try {
      const res = await fetch(`${path}/`, { headers: { Accept: "text/html" } });
      const doc = res.ok ? new DOMParser().parseFromString(await res.text(), "text/html") : null;
      const page = doc ? readStaticMain(doc.getElementById("view")) : null;
      // Only a page that says it is this path: the 404 shell and the SPA
      // fallback both answer with HTML too.
      if (res.ok || res.status === 404) { STATIC_PAGES.set(path, page && page.path === path ? page : null); return; }
    } catch { /* offline, or a hiccup */ }
    // No answer is not "no such page". false = could not load this time; the
    // next visit to the address tries again (null would be remembered all session).
    STATIC_PAGES.set(path, false);
  }
  // What a /services/ address shows when its page cannot be had — the build
  // step failed (it is continue-on-error), or the network dropped. The home-page
  // cards and the menu lead here, so it must never be a dead end.
  function viewServiceFallback(staticPath) {
    const slug = staticPath.replace(/^\/services\/?/, "");
    const live = liveServiceLinks();
    const one = live.find((v) => v.slug === slug);
    // A service with no work has no page, so there is nothing to stand in for.
    if ((slug && !one) || !live.length) return "";
    const list = one ? [one] : live;
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">Services</p>
          <h1 class="kinetic-h1">${esc(one ? one.title : "What I shoot")}</h1>
          <p class="page-sub reveal">${esc(one ? one.blurb : "Model portfolios and comp cards, fashion and editorial, fitness and sports, and brand campaigns — in Noida and across Delhi NCR.")}</p>
          <div class="hero-actions" style="margin-top: 22px;">
            <a href="/book" data-link class="btn btn-dark">Book a shoot →</a>
            <a href="/albums" data-link class="btn btn-ghost">See the work</a>
          </div>
        </div>
      </section>
      ${one ? "" : `
      <section class="section container">
        <div class="services-grid">
          ${list.map((v) => `
          <a href="/services/${v.slug}/" data-link class="service-card" style="display: block; text-decoration: none; color: inherit;">
            <div class="service-kicker">${esc(v.kicker)}</div>
            <h3>${esc(v.title)}</h3>
            <p>${esc(v.blurb)}</p>
          </a>`).join("")}
        </div>
      </section>`}`;
  }

  // One polite live region for route changes: a screen reader reads the new
  // page's title, the way a full page load would have announced it.
  let routeAnnouncer = null;
  function announceRoute(title) {
    if (!routeAnnouncer) {
      routeAnnouncer = document.createElement("p");
      routeAnnouncer.className = "sr-only";
      routeAnnouncer.setAttribute("role", "status");
      routeAnnouncer.setAttribute("aria-live", "polite");
      document.body.appendChild(routeAnnouncer);
    }
    const name = String(title || "").split("—")[0].split("|")[0].trim() || "Page";
    // Re-setting the same text does not re-announce, so clear it first.
    routeAnnouncer.textContent = "";
    setTimeout(() => { routeAnnouncer.textContent = `${name} — page loaded`; }, 60);
  }

  let renderSeq = 0;
  function render(opts) {
    // Also the popstate handler, so opts may be an Event: only a literal
    // { afterFetch: true } from fetchStaticPage's callback counts.
    const afterFetch = !!(opts && opts.afterFetch === true);
    let raw = location.pathname;
    raw = raw.replace(/\/index\.html$/, "").replace(/^\//, "").replace(/\/$/, "");
    const parts = raw.split("/").filter(Boolean);
    const key = parts[0] || "";

    const staticPath = key === "services" ? staticPathOf(location.pathname) : "";
    if (staticPath && !afterFetch && (!STATIC_PAGES.has(staticPath) || STATIC_PAGES.get(staticPath) === false)) {
      // Not in hand yet (or it failed to load last time): fetch it, then come
      // back through here — unless the visitor has already moved on. afterFetch
      // stops a failed fetch from asking again in a loop.
      fetchStaticPage(staticPath).then(() => { if (staticPathOf(location.pathname) === staticPath) render({ afterFetch: true }); });
      return;
    }
    
    const params = new URLSearchParams(location.search);
    const qKind = params.get("kind");
    const qVal = params.get("val");
    const kind = parts[1] || qKind;
    const val = parts[2] || qVal;
    
    // One measurement per view. This used to call config() on every render on
    // top of the one in the page's head, so a single landing was counted twice
    // (Sep 2026 audit); the head no longer configures anything, and a view is
    // recorded as a page_view event rather than by re-configuring the tag.
    if (typeof gtag === "function") {
      gtag("event", "page_view", { page_path: location.pathname + location.search, page_title: document.title });
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

    // The portfolio book is the studio's own tool.
    if (key === "portfolio-book" && !isAdmin()) {
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

    // The Studio page is admin-only while it is rethought. replaceState, not
    // pushState: Back from the home page would otherwise land here and bounce again.
    if (key === "studio" && !studioPageOpen()) {
      history.replaceState(null, "", "/");
      render();
      return;
    }

    // Redirect to home if trying to access workshop-attended and not authorized
    if (key === "workshop-attended" && !isAdmin() && !shouldShowWorkshopsToAll()) {
      history.pushState(null, "", "/");
      render();
      return;
    }

    // The Comp Cards page moved onto the model portfolio service page, and the
    // Model Portfolio page was folded into the same cards (one card per model,
    // carrying both PDFs). All of those old addresses land there — for as long
    // as that page exists; until then the old pages stay.
    if (key === "categories" && kind === "type" && compCardsHref() !== OLD_COMP_CARDS_HREF) {
      let wanted = val || "";
      try { wanted = decodeURIComponent(wanted); } catch { /* literal */ }
      if (["Comp Cards", "Model Portfolio", "Selective Collaboration (TFP)", "Test Shoot"].includes(wanted.replace(/\+/g, " "))) {
        history.replaceState(null, "", compCardsHref());
        render();
        return;
      }
    }

    // The Categories main page (genre / brand / type tiles) is retired: What I
    // shoot does that browsing now. Its address lands there. The filtered views
    // under it (/categories?kind=…) stay, except the model ones just above.
    if (key === "categories" && !kind && !val) {
      history.replaceState(null, "", liveServiceLinks().length ? "/services/" : "/albums/");
      render();
      return;
    }

    if (key === "categories" && val === "Workshop Attended") {
      const allowed = isAdmin() || shouldShowWorkshopsToAll();
      history.pushState(null, "", allowed ? "/workshop-attended" : "/");
      render();
      return;
    }

    const NOT_FOUND_VIEW = () => `
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
      </section>`;
    const fn = ROUTES[key] || NOT_FOUND_VIEW;

    // A static page that is already on screen — it arrived as HTML, or this is
    // a re-render after a data refresh. Painting the same HTML again would only
    // flicker, reload its pictures and snap shut whichever FAQ was open.
    const keep = !!staticPath && view.dataset.showing === staticPath;
    // Paints are delayed, "keep" paints are not: without a sequence number an
    // older pending paint could land after a newer one (tap Book, then Back
    // within 180ms) and leave the booking page under a service address.
    const seq = ++renderSeq;
    if (!keep) { view.classList.add("leaving"); view.dataset.showing = ""; }
    const paint = () => {
      if (seq !== renderSeq) return;
      let html;
      if (keep) {
        html = null;
      } else if (key === "categories") {
        html = viewCategories(kind, val);
      } else if (key === "share" || key === "models") {
        // ?a= is what share links carry now; parts[1] is the older
        // /share/<album> path form, still handed out in links already sent.
        // /models/<slug>/ is a model's own page, read through sharedAlbumSegment.
        html = viewSharedAlbum(key === "models" ? sharedAlbumSegment() : (params.get("a") || parts[1] || ""));
      } else if (key === "albums" && parts[1]) {
        html = viewAlbumPage(parts[1]);
      } else if (staticPath) {
        const page = STATIC_PAGES.get(staticPath);
        html = page ? page.html : (viewServiceFallback(staticPath) || NOT_FOUND_VIEW());
      } else {
        html = fn();
      }
      if (!keep) {
        view.innerHTML = html;
        view.dataset.showing = staticPath && STATIC_PAGES.get(staticPath) ? staticPath : "";
      }
      // Inject a lightweight "back" link at the top of every inner page's
      // header so visitors can return home without opening the Menu overlay.
      // Skipped on the home hero (key === "") and the 404 (no .page-head).
      if (key) {
        const phContainer = view.querySelector(".page-head .container");
        if (phContainer && !phContainer.querySelector(".page-back-link")) {
          // Back to where this page sits, not all the way home: from one shoot
          // page to the list of shoots, from one album to the albums.
          let backHref = "/", backLabel = "Back to home";
          if (key === "services" && parts[1] && liveServiceLinks().length) { backHref = "/services/"; backLabel = "What I shoot"; }
          else if (key === "albums" && parts[1]) { backHref = "/albums/"; backLabel = "All albums"; }
          const back = document.createElement("a");
          back.href = backHref;
          back.setAttribute("data-link", "");
          back.className = "page-back-link reveal";
          back.innerHTML = `<span aria-hidden="true">←</span> ${esc(backLabel)}`;
          phContainer.insertBefore(back, phContainer.firstChild);
        }
      }
      view.classList.remove("leaving");
      if (!keep) {
        // Going back should put the visitor where they were, not at the top of
        // a list they had scrolled a long way down (Sep 2026 audit). The
        // browser's own restoration cannot help here: the page is rebuilt by
        // script after the navigation, so the position is remembered per
        // history entry and reapplied once this paint has settled.
        const remembered = (history.state && typeof history.state.wpsScrollY === "number") ? history.state.wpsScrollY : 0;
        window.scrollTo({ top: 0, behavior: "auto" });
        if (remembered > 0) {
          const settle = () => window.scrollTo({ top: remembered, behavior: "auto" });
          requestAnimationFrame(() => { settle(); setTimeout(settle, 120); setTimeout(settle, 380); });
        }
        if (typeof smoothScroll !== "undefined" && smoothScroll.enabled) smoothScroll.reset();
        wireView(key);
      }
      if (staticPath) { paintServiceCompCards(); pageServiceWork(); }
      initReveal();
      // Arriving on a new page used to leave focus on whatever was clicked and
      // announce nothing, so a screen-reader user had no idea the page had
      // changed and a keyboard user restarted from the top of the document.
      // #view has tabindex="-1", so it can take focus without joining the tab
      // order; a route that only scrolls (a link to a section of this page)
      // keeps its place.
      setActiveNav(key);
      syncServicesNavLink();

      applyRouteSeo(key, parts, params, staticPath);
      // After applyRouteSeo, which is what sets the new page's title: announcing
      // before it read out the page just left. #view has tabindex="-1" in every
      // shell, so it can take focus without joining the tab order; a render that
      // only scrolls to a section keeps the visitor where they are.
      if (!keep) {
        announceRoute(document.title);
        try { view.focus({ preventScroll: true }); } catch (e) {}
      }
      updateImageSchema();
    };
    if (prefersReduced || keep) paint(); else setTimeout(paint, 180);
  }

  /* What a search engine reads about the page on screen: title, description,
     canonical address and whether to index it. Google indexes the page as it
     stands AFTER this has run, so whatever is set here wins over the HTML the
     page arrived with — a vague title here quietly replaces a good one there.
     Canonicals end in "/" because that is the address GitHub Pages answers
     200 on; the bare form is a 301 to it. */
  function applyRouteSeo(key, parts, params, staticPath) {
    const ORIGIN = "https://www.nerdyphotographer.in";
    const cfg = window.STUDIO_CONFIG || { studioName: "nerdyphotographer.in" };
    const brand = cfg.studioName;
    let title = `${brand} — Fashion, Beauty, Editorial, Sports, Fitness & Model Photography Studio Noida`;
    let desc = `Professional male and female model photography, fashion, beauty, editorial, sports, and fitness photoshoots by ${brand}. Noida & Delhi NCR, India — high-end modelling portfolios, creative campaigns, and cinematic portraits.`;
    let path = "/";
    let index = true;

    if (key === "albums" && parts[1]) {
      const album = CURRENT_VIEW_SHOOTS[0];
      if (album) {
        const name = getTalentCleanName(album.title || album.talent) || "Album";
        const place = albumPlace(album);
        const season = (album.season || "").replace(/^—$/, "");
        title = `${name} — ${album.activity ? `${album.activity} ` : ""}photoshoot${place ? ` in ${place}` : ""} | ${brand}`;
        desc = album.description || `${album.activity || "Studio"} photography featuring ${name}${place ? `, shot in ${place}` : ""}${season ? ` in ${season}` : ""} by ${brand} — ${album.photos.length} photograph${album.photos.length === 1 ? "" : "s"}.`;
        path = albumPathFor(album) || `/albums/${parts[1]}/`;
        index = album.isPublic !== false;
      } else {
        title = `Album not found — ${brand}`;
        path = `/albums/${parts[1]}/`;
        index = false;
      }
    } else if (key === "work" || key === "albums") {
      title = `All Albums — ${brand} | Fashion, Beauty, Sports & Fitness Photoshoots`;
      desc = `Browse the complete photoshoot album archive of ${brand} — fashion, beauty, editorial, sports, and fitness photography in Noida & Delhi NCR.`;
      path = "/albums/";
    } else if (key === "categories") {
      const kind = parts[1] || params.get("kind");
      const rawVal = parts[2] || params.get("val");
      if (kind && rawVal) {
        let rawCatName = rawVal;
        try { rawCatName = decodeURIComponent(rawVal); } catch { /* literal */ }
        const catName = rawCatName === "Selective Collaboration (TFP)" ? "Model Portfolio (Comp Cards)" : rawCatName;
        title = `${catName} photography in Noida & Delhi NCR — ${brand}`;
        desc = `${catName}: photoshoots from the archive of ${brand}, a photography studio in Noida working across Delhi NCR.`;
        path = `/categories/?kind=${encodeURIComponent(kind)}&val=${encodeURIComponent(rawCatName)}`;
      } else {
        title = `Fashion, Editorial, Fitness & Sports Photography Categories | ${brand}`;
        desc = `Explore creative photoshoots categorised by activity (genre), brand, or production type.`;
        path = "/categories/";
      }
      // These filtered views are a way of browsing, not pages meant to rank.
      // "Fashion photography in Noida & Delhi NCR" here competed with the
      // What I shoot page of nearly the same name that links to it, and an
      // empty one ("0 master albums… Nothing here yet") was indexable too
      // (Sep 2026 audit). The service pages and the album pages are the ones
      // to find; this view is still followed, so it passes on to them.
      index = false;
    } else if (key === "share" || key === "models") {
      const shared = CURRENT_VIEW_SHOOTS[0];
      path = key === "models" ? location.pathname : `/share/${location.search}`;
      if (shared) {
        const sharedName = getTalentCleanName(shared.isCompCard ? shared.talent : (shared.title || "Album"));
        title = `${sharedName}${shared.isCompCard ? " — Comp Card" : ""} — ${brand}`;
        desc = shared.description || `${sharedName} — photographed by ${brand}, Noida & Delhi NCR.`;
        // The album's own page is the one to index; this is a second door to it.
        path = albumPathFor(shared) || path;
      } else {
        index = false;
      }
    } else if (key === "studio") {
      title = `About the Studio | ${brand} – Noida Based Photography Studio`;
      desc = `Learn about our creative process, vision, philosophy, and tools behind the photography craft. Noida, India.`;
      path = "/studio/";
      index = window.STUDIO_CONFIG?.studioPagePublic !== false;
    } else if (key === "book") {
      title = `Book a Fashion/Fitness/Sports Photoshoot in Noida & Delhi NCR | ${brand}`;
      desc = `Collaborate with us on your next photoshoot. Send a project brief or book a session with Noida's creative studio.`;
      path = "/book/";
    } else if (key === "testimonials") {
      title = `Client Testimonials & Reviews | ${brand}`;
      desc = `Read reviews and testimonials from models, brands, and creative collaborators who have worked with us in Noida & Delhi NCR.`;
      path = "/testimonials/";
      index = getAllTestimonials().length > 0; // an empty page is not worth a place in search results
    } else if (staticPath) {
      const page = STATIC_PAGES.get(staticPath);
      path = `${staticPath}/`;
      if (page) { title = page.title || title; desc = page.desc || desc; }
      // The stand-in shown when the real page could not be had is not for indexing.
      else { title = viewServiceFallback(staticPath) ? `What I shoot — ${brand}` : `Page not found — ${brand}`; index = false; }
    } else if (key !== "") {
      // Admin screens, the invitation-only workshop page and the 404.
      title = ROUTES[key] ? `${brand} — The Creative Studio` : `Page not found — ${brand}`;
      path = location.pathname;
      index = false;
    }

    document.title = title;
    const setAttr = (sel, attr, value) => { const el = document.querySelector(sel); if (el) el.setAttribute(attr, value); };
    setAttr('meta[name="description"]', "content", desc);
    setAttr('link[rel="canonical"]', "href", ORIGIN + path);
    setAttr('meta[property="og:url"]', "content", ORIGIN + path);
    setAttr('meta[property="og:title"]', "content", title);
    setAttr('meta[property="og:description"]', "content", desc);
    let robots = document.querySelector('meta[name="robots"]');
    if (index) { if (robots) robots.remove(); }
    else {
      if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.appendChild(robots); }
      robots.content = "noindex, follow";
    }
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
          "creator": { "@type": "Organization", "name": "nerdyphotographer.in" }
        });
        if (images.length >= 30) break;
      }
      if (images.length >= 30) break;
    }
    let el = document.getElementById("wps-image-schema");
    // An album's own page: the deploy already wrote a fuller block under this
    // same id (album name, canonical address, every frame, licensing fields).
    // Write that same shape here — the generic one below would replace it with
    // less, and Google reads the page as it stands after this has run.
    const onAlbumPage = /^\/albums\/[^/]+\/?$/.test(location.pathname) && CURRENT_VIEW_SHOOTS.length === 1 && albumPathFor(CURRENT_VIEW_SHOOTS[0]);
    if (onAlbumPage) {
      const s = CURRENT_VIEW_SHOOTS[0];
      const name = getTalentCleanName(s.title || s.talent) || "Untitled";
      const frames = (s.photos || []).filter((p) => p && p.url);
      if (!el) { el = document.createElement("script"); el.type = "application/ld+json"; el.id = "wps-image-schema"; document.head.appendChild(el); }
      el.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "ImageGallery",
        "name": `${name} — ${s.activity ? `${s.activity} ` : ""}photoshoot`,
        "description": document.querySelector('meta[name="description"]')?.content || "",
        "url": ORIGIN + albumPathFor(s),
        ...(s.date ? { "dateCreated": s.date } : {}),
        "creator": { "@id": `${ORIGIN}/#identity` },
        "image": frames.map((p, i) => ({
          "@type": "ImageObject",
          "contentUrl": abs(p.url),
          "name": `${name} — frame ${i + 1}`,
          "caption": p.caption || altFor(s, i + 1),
          "creditText": "nerdyphotographer.in",
          "copyrightNotice": "© nerdyphotographer.in",
          "creator": { "@type": "Organization", "name": "nerdyphotographer.in", "url": `${ORIGIN}/` },
          "acquireLicensePage": `${ORIGIN}/book/`
        }))
      }).replace(/</g, "\\u003c");
      return;
    }
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

  // "What I shoot" is in the menu while at least one of its pages exists: the
  // deploy writes a page only once it has work, so the link would otherwise
  // lead to a 404.
  function syncServicesNavLink() {
    const pages = liveServiceLinks();
    const live = pages.length > 0;
    const li = document.getElementById("navServicesLi");
    if (li) li.style.display = live ? "" : "none";
    // "Model portfolio" goes to the models' cards, so it needs their page.
    const modelsLi = document.getElementById("navModelsLi");
    if (modelsLi) modelsLi.style.display = pages.some((v) => `/services/${v.slug}/` === COMP_CARDS_PAGE) ? "" : "none";
    document.querySelectorAll('.footer-nav a[href="/services/"]').forEach((a) => { a.style.display = live ? "" : "none"; });
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
  // The photo grids and filter buttons on the "What I shoot" pages. Those pages
  // arrive as finished HTML from build-seo.mjs and are kept rather than
  // repainted, so wireView never runs for them — both work by delegation.
  // A tile's photo, read off the tile itself. The grids are built at deploy from
  // the published albums, and this browser's copy of an album can differ: the
  // studio's own device keeps its saved copy, which wins over data.js (see
  // loadShoots), and a returning visitor can hold a data.js older than the
  // page. A photo missing from that copy used to send the click to the whole
  // album instead of opening the photo (reported for one of Prachi's frames,
  // Sep 19 2026). The tile carries the photo's addresses, so it never has to.
  function photoFromTile(el) {
    const img = el.querySelector("img");
    if (!img) return null;
    const sized = (w) => ((img.getAttribute("srcset") || "").split(",").map((c) => c.trim().split(/\s+/)).find((c) => c[1] === w) || [""])[0];
    const url = sized("1600w") || img.getAttribute("src") || "";
    return url ? { id: el.dataset.photo, url, small: sized("480w"), medium: sized("960w") } : null;
  }
  // The album a tile belongs to, when this browser doesn't know it at all: just
  // enough for the viewer's panel to name it and link to it.
  function albumFromTile(el) {
    const slug = ((el.getAttribute("href") || "").match(/\/albums\/([^/?#]+)/) || [])[1] || "";
    const name = decodeURIComponent(slug).split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
    return { id: el.dataset.shoot || "", title: name, talent: name, photos: [] };
  }

  function initServiceGrids() {
    // The filter buttons are hidden without JavaScript; the class the built
    // pages set in <head> is missing from pages the build does not touch.
    document.documentElement.classList.add("js");
    document.addEventListener("click", (e) => {
      const tile = e.target.closest(".svc-photo");
      if (tile) {
        // A new tab or window is the visitor's call: let the link open the album.
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const list = [];
        let at = -1;
        tile.closest(".svc-photos").querySelectorAll(".svc-photo").forEach((el) => {
          const s = SHOOTS.find((x) => x.id === el.dataset.shoot);
          const p = (s && (s.photos || []).find((x) => x.id === el.dataset.photo)) || photoFromTile(el);
          if (!p) return;
          if (el === tile) at = list.length;
          list.push({ ...p, shoot: s || albumFromTile(el), gridLook: el.dataset.look || "", albumHref: el.getAttribute("href") });
        });
        // A tile with no picture in it: the link still opens its album.
        if (at < 0) return;
        e.preventDefault();
        openLb(list, at);
        return;
      }
      const chip = e.target.closest(".svc-chip");
      if (!chip) return;
      const want = chip.dataset.client;
      const section = chip.closest("section") || document;
      section.querySelectorAll(".svc-chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      const cardsEl = section.querySelector(".svc-cards");
      if (!cardsEl) return;
      const cards = [...cardsEl.querySelectorAll(".pr-card")];
      const matches = cards.filter((card) => !want || (card.dataset.clients || "").split(" ").includes(want));
      if (cardsEl._pager) cardsEl._pager.setItems(matches);
      else cards.forEach((card) => { card.hidden = !matches.includes(card); });
    });
  }

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
    // A page that arrived from the deploy already has its words on screen, so
    // there is nothing to cover; the intro is for the app's own first paint.
    const prerendered = !!document.querySelector(".prerender, [data-static-path]");
    const w = prefersReduced || seen || prerendered ? 0 : 600;

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
     §16 · COMP CARDS & PORTFOLIO PDFs (the buttons; the machinery is in pdf-tools.js)
     ============================================================ */
  /* What stays here is everything the page needs BEFORE anyone presses a
     button: which photos may go on a comp card or in a portfolio PDF, whether
     the studio is selling, the mailto fallback, the orientation toggle and
     the studio's own settings form. The print sheet, the A4 PDF writer and
     the pose-picking builder — about 150 KB that most visitors never use —
     moved to pdf-tools.js and arrive on the first click. */

  // Fetched on the first press of "Export comp card PDF" or "Make portfolio
  // PDF", memoised, and reset on failure so a second press retries rather
  // than resolving a promise that never will. Same version as the rest of the
  // site: scraped off the app.js tag rather than written down, because a
  // pinned literal is exactly the drift the cache-buster exists to prevent.
  let pdfToolsLoad = null;
  function loadPdfTools() {
    if (window.WPS_PDF) return Promise.resolve(window.WPS_PDF);
    if (!pdfToolsLoad) {
      pdfToolsLoad = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        const v = (document.querySelector('script[src*="app.js?v="]')?.getAttribute("src") || "").split("v=")[1] || "";
        s.src = `/pdf-tools.js${v ? `?v=${v}` : ""}`;
        s.onload = () => {
          if (window.WPS_PDF) { resolve(window.WPS_PDF); return; }
          pdfToolsLoad = null;
          reject(new Error("pdf-tools.js loaded without WPS_PDF"));
        };
        s.onerror = () => { pdfToolsLoad = null; reject(new Error("pdf-tools.js failed to load")); };
        document.head.appendChild(s);
      });
    }
    return pdfToolsLoad;
  }
  // A press must never look ignored while the file is on its way, and must
  // say so plainly if it never arrives.
  function withPdfTools(run) {
    if (window.WPS_PDF) { run(window.WPS_PDF); return; }
    toast("Getting the PDF tools ready…");
    loadPdfTools().then(run).catch((err) => {
      console.error("pdf-tools.js failed to load:", err);
      toast("Couldn't load the PDF tools. Check your connection and try again.");
    });
  }
  window.printCompCard = (shootId, orientation = "auto") => withPdfTools((pdf) => pdf.printCompCard(shootId, orientation));
  window.printModelPortfolio = (shootId) => withPdfTools((pdf) => pdf.printModelPortfolio(shootId));
  window.triggerCompCardDownload = (shootId, orientation) => withPdfTools((pdf) => pdf.triggerCompCardDownload(shootId, orientation));

  /* What pdf-tools.js borrows from this closure. Same bargain as
     WPS_BOOK_API and WPS_ADMIN_API: one object of bindings handed across, so
     the machinery can be a separate file without a second copy of anything.
     Nothing on it writes to this scope. */
  window.WPS_PDF_API = {
    // Live: SHOOTS is reassigned by loadShoots on every load and publish.
    shoots: () => SHOOTS,
    SOCIAL_LABEL, chestLabelOf, compCardPdfPhotos, esc, getTalentCleanName, isAdmin,
    modelTypeLabel, modelTypesOf, photoSrc, portfolioPdfMailLink,
    portfolioPdfPhotos, portfolioPdfSalesOpen, prefersReduced, showRep, shuffleArray,
    slugify, socialPrintText, toast, trapTabKey, visibleAgencyLinks, visibleModelLinks,
  };

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

  // What a client may put in the PDF: the model's photos marked for portfolio
  // use (usage "portfolio" or "both", or unset on legacy photos), with or
  // without a pose tag. A photo with no pose prints without its tag.
  //
  // Since the merge the card carries every photo tagged to the model, whatever
  // its Usage, so this is the filter that keeps a comp-only or album-only
  // photo out of the PDF.
  function portfolioPdfPhotos(shoot) {
    return (shoot.photos || []).filter(usableInPortfolio);
  }

  // What the comp card PDF may print: every photo allowed on a comp card, from
  // every album that names this model — group shoots and brand jobs included,
  // not just the album in hand. The panel counts with this and printCompCard
  // shuffles the same pool, so the box appears exactly when the export has
  // something to print.
  function compCardPdfPhotos(shoot) {
    const modelName = getTalentCleanName(shoot.talent || shoot.title).trim();
    let photos = [];
    if (modelName) {
      photos = SHOOTS.filter((s) => {
        if (s.type === "Workshop Attended") return false;
        if (!s.talent) return false;
        return s.talent.split(",").map((t) => getTalentCleanName(t).trim().toLowerCase()).includes(modelName.toLowerCase());
      }).flatMap((s) => (s.photos || []).filter(usableOnCompCard));
    }
    // Falls back to this album's own allowed photos (a synthetic card whose
    // model has no name to match on), but never to the album's FULL list: that
    // used to mean a model whose every photo was kept off comp cards got a
    // card built from exactly those photos — the filter undone at the last step.
    return photos.length ? photos : (shoot.photos || []).filter(usableOnCompCard);
  }

  // Clients can buy only once the studio has switched it on, and only with
  // somewhere for the money to go (or nothing to pay).
  function portfolioPdfSalesOpen() {
    const s = getPortfolioPdfSettings();
    return s.enabled && (s.price === 0 || !!s.upiId);
  }

  // Until clients can pay on the site, they ask the studio for a PDF by
  // email: a mailto link naming the model in the subject, or "" when the
  // studio has no email set.
  function portfolioPdfMailLink(modelName, body) {
    const to = (window.STUDIO_CONFIG && window.STUDIO_CONFIG.email) || "";
    if (!to) return "";
    const href = `mailto:${to}?subject=${encodeURIComponent(`Portfolio PDF: ${modelName}`)}${body ? `&body=${encodeURIComponent(body)}` : ""}`;
    return `<a class="pp-mail" href="${esc(href)}">${esc(to)}</a>`;
  }

  window.saveAdminPortfolioPdfSettings = async () => {
    const priceEl = document.getElementById("portfolioPdfPriceInput");
    const upiEl = document.getElementById("portfolioPdfUpiInput");
    const status = document.getElementById("portfolioPdfSaveStatus");
    const say = (text, tone) => { if (status) { status.textContent = text; status.dataset.tone = tone; } };
    const current = getPortfolioPdfSettings();
    // A blank price box means "leave it as it was", as with the rental rates:
    // clearing it by accident must not make the PDF free.
    const price = priceEl && priceEl.value.trim() !== "" ? Number(priceEl.value) : current.price;
    if (!Number.isInteger(price) || price < 0) { toast("Enter the price in whole rupees: 0 or more."); if (priceEl) priceEl.focus(); return; }
    const upiId = upiEl ? upiEl.value.trim() : current.upiId;
    if (upiId && !UPI_ID_RE.test(upiId)) { toast("That isn't a UPI ID. It should look like yourname@okaxis."); if (upiEl) upiEl.focus(); return; }
    const enabledEl = document.getElementById("portfolioPdfEnabledInput");
    const showSwitch = (on) => {
      if (enabledEl) enabledEl.checked = on;
      const label = document.getElementById("portfolioPdfEnabledLabel");
      if (label) label.textContent = on ? "On" : "Off";
    };
    const enabled = enabledEl ? enabledEl.checked : current.enabled;
    // Switched on with a price and nowhere to pay, clients would get a button
    // that leads nowhere. Refuse the whole save and put the switch back.
    if (enabled && price > 0 && !upiId) {
      showSwitch(current.enabled);
      toast("A paid PDF needs your UPI ID. Add it, or set the price to 0, then switch it on.");
      const pdfBody = document.getElementById("adminPdfBody");
      if (pdfBody) pdfBody.style.display = "block";
      if (upiEl) upiEl.focus();
      return;
    }
    const type = (typeof window.readPdfTypeEditor === "function" && window.readPdfTypeEditor()) || current.type;
    const border = (typeof window.readPdfBorderEditor === "function" && window.readPdfBorderEditor()) || current.border;
    localStorage.setItem("wps_portfolio_pdf", JSON.stringify({ enabled, price, upiId, type, border }));
    stampSetting("wps_portfolio_pdf");
    showSwitch(enabled);
    updateAdminBtn();
    say("Publishing to the live site…", "busy");
    const ok = await window.publishStudioDataToLiveSite();
    const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const salesLine = !enabled ? "Off: clients take watermarked PNGs and email you to buy the PDF." : price === 0 ? "On: free for everyone." : `On: clients pay ₹${price}.`;
    say(ok ? `Live on the site (${at}). ${salesLine}` : `Saved on this device only (${salesLine.split(":")[0]}). Publishing failed, so try again.`, ok ? "ok" : "warn");
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
      // Absolute path: from a nested route such as /book a relative "data.js"
      // resolved to /book/data.js, which the SPA fallback answered with the
      // index page, so the refresh silently never found any albums.
      const res = await fetch(navigator.serviceWorker && navigator.serviceWorker.controller ? "/data.js" : `/data.js?fresh=${Date.now()}`, { cache: "no-store" });
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
    // Where this entry was scrolled to, written onto it before any navigation
    // replaces it. history.scrollRestoration is left alone: it cannot restore
    // a position on a page that does not exist until script rebuilds it.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const rememberScroll = () => {
      try { history.replaceState({ ...(history.state || {}), wpsScrollY: window.scrollY }, ""); } catch (e) {}
    };
    let scrollTick = null;
    window.addEventListener("scroll", () => {
      if (scrollTick) return;
      scrollTick = setTimeout(() => { scrollTick = null; rememberScroll(); }, 250);
    }, { passive: true });
    window.addEventListener("popstate", () => {
      // Our own step-back after closing the photo by hand: the page underneath
      // never changed, so there is nothing to repaint.
      if (lbClosingByHand) { lbClosingByHand = false; return; }
      // Back with a photo open means "close the photo", not "leave the page".
      if (!lb.hidden) { closeLb(true); return; }
      render();
    });
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
          // A link to a section of the page already open (the model page's
          // "See the models" → #comp-cards) re-renders to the same view, which
          // paints nothing and would leave the reader where they were: scroll
          // to the section instead. The first-paint handler covers arriving
          // from another page.
          const [path, hash] = href.split("#");
          const samePage = hash && (!path || path.replace(/\/?$/, "/") === location.pathname.replace(/\/?$/, "/"));
          rememberScroll();          // so Back returns to this spot
          history.pushState(null, "", href);
          if (samePage) {
            const target = document.getElementById(hash);
            const header = document.querySelector(".site-header");
            if (target) {
              window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight : 0)), behavior: "smooth" });
              return;
            }
          }
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

    // "Upload" and "Calendar & Bookings" — the studio's own screens. They used
    // to sit in all nine shells' HTML, so every visitor's page, and every
    // search engine reading it, carried a link to them even though only the
    // studio can use them (site audit Sep 2026). Built here instead, like
    // "Portfolio book" below, so they exist only once someone is looking at the
    // page. The visibility block reads these ids and shows them in admin mode.
    const adminNavList = document.querySelector(".nav-links");
    if (adminNavList) {
      const addAdminLi = (id, href, label, before) => {
        if (document.getElementById(id)) return;
        const li = document.createElement("li");
        li.id = id;
        li.style.display = "none";
        const a = document.createElement("a");
        a.href = href;
        a.setAttribute("data-link", "");
        a.textContent = label;
        li.appendChild(a);
        if (before) before.before(li); else adminNavList.appendChild(li);
      };
      // Upload goes where it always sat, above "Book a shoot"; the calendar last.
      addAdminLi("navUploadLi", "/upload", "Upload", document.getElementById("navBookLi"));
      addAdminLi("navCalendarLi", "/calendar", "Calendar & Bookings", null);

      // The way back in. Until this existed the only route was three quick
      // taps on the footer line, which is not something you can be expected
      // to remember. Pressing it asks for the passcode; pressing it while
      // signed in signs you out, the same as the button in the admin block.
      if (!document.getElementById("navSignInLi")) {
        const li = document.createElement("li");
        li.id = "navSignInLi";
        li.className = "nav-signin";
        const b = document.createElement("button");
        b.type = "button";
        b.id = "menuAdminBtn";
        b.innerHTML = '<span id="menuAdminBtnText">Admin</span>';
        b.addEventListener("click", () => {
          if (typeof window.__wpsSignIn === "function") window.__wpsSignIn();
        });
        li.appendChild(b);
        adminNavList.appendChild(li);
      }
    }

    // "Portfolio book" — the studio's own tool, so it shows only in admin mode
    // (see the nav visibility block, which reads its id).
    const bookNavList = document.querySelector(".nav-links");
    if (bookNavList && !document.getElementById("navBookBuilderLi")) {
      const li = document.createElement("li");
      li.id = "navBookBuilderLi";
      li.style.display = "none";
      li.innerHTML = `<a href="/portfolio-book" data-link>Portfolio book</a>`;
      const uploadLi = document.getElementById("navUploadLi");
      if (uploadLi) uploadLi.after(li); else bookNavList.appendChild(li);
    }

    // "What I shoot" in the menu — added here rather than in each page's HTML,
    // for the same reason as the block below: there are nine shells and they
    // drift. This runs before the albums load, so it goes in hidden and
    // syncServicesNavLink shows it on the first paint. Checking for pages here
    // left it out for good on every page opened directly (Book, Albums, the
    // portfolio book) — only the home page, which has it in its HTML, kept it.
    //
    // "Model portfolio" comes with it (v440): it goes straight to the models'
    // cards, which sit on one of the What I shoot pages. The entry was taken
    // out in v415, when its own page was retired, and the studio asked for it
    // back: it is what models and agencies look for by name. It no longer
    // points at a page that only redirects, which was the reason it went.
    const navList = document.querySelector(".nav-links");
    if (navList) {
      const navItem = (id, href, label) => {
        const li = document.createElement("li");
        li.id = id;
        li.style.display = "none";
        li.innerHTML = `<a href="${href}" data-link>${label}</a>`;
        return li;
      };
      // Straight after Home and above Albums: what I shoot, then the models,
      // then the archive. Placed even when the shell already has the item, so
      // a shell in the old order (Albums first) is put right as well.
      const homeLi = [...navList.children].find((el) => el.querySelector("a")?.getAttribute("href") === "/");
      const servicesLi = document.getElementById("navServicesLi") || navItem("navServicesLi", "/services/", "What I shoot");
      const modelsLi = document.getElementById("navModelsLi") || navItem("navModelsLi", `${COMP_CARDS_PAGE}#comp-cards`, "Model portfolio");
      if (homeLi) homeLi.after(servicesLi); else navList.prepend(servicesLi);
      servicesLi.after(modelsLi);
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

  /* Google's tag is 172 KB and was fetched from the top of every page's head,
     ahead of the site's own three scripts and sharing a slow connection with
     them. Nothing on the page needs it to render, so it is fetched once the
     page has been drawn and the browser is otherwise idle. The stub in the
     head keeps queueing calls in the meantime, and gtag.js replays that queue
     when it arrives, so nothing measured before it loads is lost. */
  let analyticsRequested = false;
  function loadAnalyticsWhenIdle() {
    if (analyticsRequested) return;
    analyticsRequested = true;
    const start = () => {
      try {
        const sc = document.createElement("script");
        sc.async = true;
        sc.src = "https://www.googletagmanager.com/gtag/js?id=G-S0Q7T5Y2J4";
        document.head.appendChild(sc);
        if (typeof gtag === "function") {
          gtag("config", "G-S0Q7T5Y2J4", { page_path: location.pathname + location.search });
        }
      } catch (e) { /* analytics must never break the site */ }
    };
    if (window.requestIdleCallback) requestIdleCallback(start, { timeout: 4000 });
    else setTimeout(start, 1500);
  }

  /* What admin.js borrows from this closure. Same bargain as WPS_BOOK_API
     above: one object of bindings handed across, so the studio's half can be
     a separate file without a second copy of anything. It is built here, at
     the end, because some of these are only initialised further down.
     Nothing on it writes to this scope — the admin half reads it. */
  window.WPS_ADMIN_API = {
    // Live: SHOOTS is reassigned by loadShoots on every load and publish.
    shoots: () => SHOOTS,
    setRoutes: (map) => { Object.assign(ROUTES, map); },
    // The book builder draws with the page engine in pdf-tools.js, so
    // loadBookBuilder fetches that first (see WPS_BOOK_API above).
    loadPdfTools: () => loadPdfTools(),
    $, ACTIVITIES, BRANDS, CHEST_LABELS, CLIENTS, LOOKS, MODEL_TYPES_MAX, MODEL_TYPE_MAXLEN,
    REP_SURFACES, REP_SWITCHES, TYPES, addCalBooking, albumClients, backfillPublishedOnlyFields, chestLabelOf, classifySocial,
    cleanIgHandle, createHoldFromContract, esc, escJs, extractPalette, followAlbumText, getCalDateKey, getCalDateStatus,
    getContractEmailStatuses, getLocalContractAudits, getTalentCleanName, igHandleFromCredit, isAdmin, isDecidableHold, isSigImage, kineticH1,
    legacyClientOf, loadShoots, localTombstones, lookByKey, lookLabel, modelTypeLabel, modelTypeOptions, modelTypesOf,
    normalizeModelType, parseDeletedIdsFromDataJs, parseIgHandle, parseKavyarLink, parseObjectAfterKey, parseShootsFromDataJs, parseValueAfterKey, photoSrc,
    putShoot, readAsDataURL, removeCalBooking, render, repSwitchValues, resize, saveCalendarSettings, showRep,
    showsOnModelPage, siteFromCredit, socialsFromCredit, syncCalendarWithAudits, syncCalendarWithShoots, toast, toggleCalDateBlock, uid,
    updateCalBooking, view, wireView,
  };

  (async function boot() {
    // Order matters: admin URL params must apply before anything calls
    // isAdmin() or loadShoots(); chrome wiring must precede first render.
    // Every one of these is INSIDE the try: they were above it, so a throw in
    // any of them skipped the finally below and left the loader covering the
    // page for good (a blocked-storage browser did exactly that).
    try {
      applyAdminUrlParams();
      // Before initStudioSettingsControls, updateAdminBtn and the first
      // render, all of which paint admin chrome: isAdmin() can already be
      // true on a cold reload (it reads sessionStorage), and a tab that
      // painted as a visitor first and corrected itself afterwards is exactly
      // the flash this ordering avoids. A failure here is reported and left
      // at that — it must not reach boot's catch, which replaces the page.
      if (isAdmin()) {
        try { await loadAdmin(); }
        catch (err) { console.error("admin.js failed to load:", err); }
      }
      initLightbox();
      initImageErrorHandling();
      initNav();
      initAdminControls();
      initThemeControls();
      // The studio-links editor is wired in admin.js. For a visitor the only
      // thing that function ever did was hide its button, which is done here
      // so a visitor never needs the file.
      if (!isAdmin()) $("#studioSettingsBtn")?.setAttribute("hidden", "");
      window.WPS_ADMIN?.initStudioSettings?.();
      initHeaderScroll();
      initRouting();
      initServiceGrids();
      $("#year").textContent = new Date().getFullYear();
      initBranding();
      updateAdminBtn();
      captureStaticPage();
      await loadShoots();
      render();
      initFooterReveal();
      refreshPublishedData();
    } catch (err) {
      // Never leave the user on a blank page under the loader.
      console.error("boot failed:", err);
      view.innerHTML = `<section class="page-head"><div class="container"><h1>Something went wrong.</h1><p class="page-sub">Try reloading.</p></div></section>`;
    } finally {
      // The view has been rendered by this point, so the page is ready to look
      // at. This used to wait for window "load" — every photo, font and script
      // — which on mobile data kept a finished page hidden behind the loader
      // for five to ten seconds, and on the deploy-built pages hid text that
      // had been on screen since 1.9s (Sep 2026 audit).
      dismissLoader();
      loadAnalyticsWhenIdle();
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
    // The version this page was already reloaded to, read before the parameter
    // is tidied away. It is the only record that survives the reload itself:
    // the sessionStorage flag below does not when a browser blocks storage and
    // the in-memory stand-in starts empty on every load — which turned a stale
    // tab into an endless reload loop (found while testing v448).
    const arrivedAt = params.get("_v");
    if (params.has("_v") || params.has("fresh")) {
      const clean = new URL(location.href);
      clean.searchParams.delete("_v");
      clean.searchParams.delete("fresh");
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

    // Work a visitor would lose. A reload throws away an unsent booking, an
    // unsent testimonial and a staged upload queue, and this fires whenever a
    // tab is returned to — on a day with 25 releases it will land on someone
    // mid-sentence (Sep 2026 audit). The new build can wait until they are done.
    const hasWorkInProgress = () => {
      const typedInto = (el) => el && !el.disabled && String(el.value || "").trim() !== "";
      const anyTyped = [...document.querySelectorAll("form input, form textarea, form select")]
        .some((el) => {
          if (el.type === "hidden" || el.type === "submit" || el.type === "button") return false;
          if (el.type === "checkbox" || el.type === "radio") return el.checked && !el.defaultChecked;
          return typedInto(el) && el.value !== el.defaultValue;
        });
      if (anyTyped) return true;
      // The booking's own success panel counts as in progress too: it may be
      // holding the "one last step" fallback the client still has to send.
      const success = document.getElementById("bookSuccess");
      if (success && !success.hidden) return true;
      // Photos staged in the admin's Upload queue but not published yet.
      const queue = document.querySelector("#uploadPreviewGrid, #photoPreviewGrid, .upload-queue");
      if (queue && queue.children.length) return true;
      const modal = document.getElementById("termsModal");
      return !!(modal && modal.style.display === "flex");
    };

    const checkOnce = () => beacon()
      .then((live) => {
        if (!live || live === loaded) return;
        if (arrivedAt === live) return;              // this hop has already happened
        if (sessionStorage.getItem("wps-updated-to") === live) return;
        // Without storage that outlives a reload there is no way to remember
        // having tried, beyond the one hop above; a second attempt would loop.
        if (window.__wpsStorageIsMemoryOnly && arrivedAt) return;
        if (hasWorkInProgress()) return;    // try again next time they switch back
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


// The menu index spans were removed from index.html; a cached copy of the
// page can still carry them, so strip any that arrive.
document.querySelectorAll(".nav-idx").forEach(el => el.remove());
