/* ============================================================
   § SECURE UTILITIES & HASHING ENGINE
   ============================================================ */
function hashFNV1a(str) {
  let hval = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hval = Math.imul(hval ^ str.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hval.toString(16).padStart(8, "0");
}
window.hashFNV1a = hashFNV1a;

/* ============================================================
   § ADMIN NO-CODE PROMO CODE MANAGEMENT ENGINE
   ============================================================ */
const DEFAULT_PROMO_CODES = {
  "NERDY500":  { flat: 500,  label: "Flat ₹500 Off Instant Savings (NERDY500)" },
  "NERDY1000": { flat: 1000, label: "Flat ₹1,000 Off Instant Savings (NERDY1000)" },
  "NERDY10":   { pct: 10,    label: "10% Off First Commercial Booking (NERDY10)" },
  "NERDY15":   { pct: 15,    label: "15% Off Noida / Delhi NCR Shoots (NERDY15)" },
  "NERDY20":   { pct: 20,    label: "20% Off Studio Production Campaigns (NERDY20)" },
  "NERDYVIP":  { pct: 25,    label: "25% VIP Partner Discount (NERDYVIP)" }
};

function getAdminPromoCodes() {
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
  window.adminDraftPromoCodes = { ...DEFAULT_PROMO_CODES };
  return window.adminDraftPromoCodes;
}
window.getAdminPromoCodes = getAdminPromoCodes;

window.addNewAdminPromoCode = function() {
  const codeName = prompt("Enter New Promo Code (e.g. NERDY50):")?.trim().toUpperCase();
  if (!codeName) return;
  if (codeName.length < 3) { alert("Promo code must be at least 3 characters!"); return; }

  const typeChoice = prompt("Select Discount Type:\nType '1' for Percentage (%)\nType '2' for Flat Amount (INR ₹):", "1");
  if (!typeChoice) return;

  let pct = 0, flat = 0;
  if (typeChoice.trim() === "1") {
    const valStr = prompt("Enter Percentage Discount (1 to 90%):", "30");
    pct = parseInt(valStr, 10);
    if (isNaN(pct) || pct <= 0 || pct > 90) { alert("Invalid percentage!"); return; }
  } else {
    const valStr = prompt("Enter Flat Discount Amount in INR ₹ (e.g. 2000):", "2000");
    flat = parseInt(valStr, 10);
    if (isNaN(flat) || flat <= 0) { alert("Invalid amount!"); return; }
  }

  const labelDesc = prompt("Enter Short Description (e.g. 30% Off Special Shoot Offer):", pct ? `${pct}% Off Special Offer` : `Flat ₹${flat.toLocaleString('en-IN')} Off Special Offer`) || "Special Promo Discount";

  const currentCodes = getAdminPromoCodes();
  currentCodes[codeName] = pct ? { pct, label: labelDesc, isCustom: true } : { flat, label: labelDesc, isCustom: true };
  localStorage.setItem("wps_custom_promo_codes", JSON.stringify(currentCodes));

  alert(`🎉 Promo Code '${codeName}' created successfully! Clients can now use it on /book.`);
  if (typeof render === "function") render();
};

// Global Draft States for Manual Save Mode
window.adminDraftInviteCodes = null;
window.adminDraftPromoCodes = null;

window.getAdminInviteCodes = function() {
  if (window.adminDraftInviteCodes && Array.isArray(window.adminDraftInviteCodes)) {
    return window.adminDraftInviteCodes;
  }
  try {
    const saved = localStorage.getItem("wps_custom_invite_codes");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        window.adminDraftInviteCodes = [...parsed];
        return window.adminDraftInviteCodes;
      }
    }
  } catch(e) {}
  try {
    const legacy = localStorage.getItem("wps_custom_invite_code");
    if (legacy) {
      window.adminDraftInviteCodes = [legacy, "NERDY-INVITE", "INVITE2026", "NERDYVIP"];
      return window.adminDraftInviteCodes;
    }
  } catch(e) {}
  window.adminDraftInviteCodes = ["NERDY-INVITE", "INVITE2026", "NERDYVIP", "STUDIOINVITE", "VIP2026"];
  return window.adminDraftInviteCodes;
};

window.getAdminInviteCode = function() {
  const list = window.getAdminInviteCodes();
  return list[0] || "NERDY-INVITE";
};

function markUnsavedChanges() {
  const statusBadge = document.getElementById("adminPricingSaveStatus");
  if (statusBadge) {
    statusBadge.style.color = "#d97706";
    statusBadge.style.background = "rgba(217,119,6,0.15)";
    statusBadge.style.borderColor = "#d97706";
    statusBadge.innerHTML = '⚠️ UNSAVED CHANGES — Click "Save All Changes & Push Live"';
  }
}

window.getAdminInviteCodes = function() {
  const normalize = (arr) => {
    const seen = new Set();
    const result = [];
    arr.forEach(item => {
      let codeStr = typeof item === 'object' ? item.code : item;
      let descStr = typeof item === 'object' ? (item.desc || '') : 'Default Photographer Unlock Code';
      if (codeStr && !seen.has(codeStr.toUpperCase())) {
        seen.add(codeStr.toUpperCase());
        result.push({ code: codeStr.toUpperCase(), desc: descStr });
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

  const defaultList = [
    { code: "NERDYBRAND", desc: "Default photographer unlock code for Instagram DMs" },
    { code: "NERDYTEST", desc: "Test shoot unlock pass for agency models" },
    { code: "INVITE2026", desc: "General 2026 TFP collaboration pass" },
    { code: "NERDYVIP", desc: "VIP partner unlock code" }
  ];

  window.adminDraftInviteCodes = normalize(defaultList);
  return window.adminDraftInviteCodes;
};

window.addNewAdminInviteCode = function() {
  const newCode = prompt("Enter New Photographer Direct Invite Code (e.g. MODELVIP):")?.trim().toUpperCase();
  if (!newCode) return;
  if (newCode.length < 3) { alert("Invite code must be at least 3 characters!"); return; }
  const newDesc = prompt("Enter Admin-Only Note / Description (Admin Eyes Only):", "VIP invite for agency talent")?.trim() || "Admin VIP Code";
  
  const current = window.getAdminInviteCodes();
  window.adminDraftInviteCodes = [{ code: newCode, desc: newDesc }, ...current];
  markUnsavedChanges();
  if (typeof toast === "function") toast(`🔑 Invite Code '${newCode}' added to draft (Click "Save All Changes" to push live)`);
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
};

window.editAdminInviteCode = function(targetCodeStr) {
  const currentCodes = window.getAdminInviteCodes();
  const item = currentCodes.find(x => x.code === targetCodeStr) || currentCodes[0] || { code: "NERDYBRAND", desc: "" };
  
  const updatedCode = prompt("Edit Photographer Direct Invite Code String:", item.code)?.trim().toUpperCase();
  if (!updatedCode) return;
  if (updatedCode.length < 3) { alert("Invite code must be at least 3 characters!"); return; }
  
  const updatedDesc = prompt("Edit Admin-Only Note / Description (Admin Eyes Only):", item.desc || "")?.trim() || "Admin VIP Code";
  
  const updated = currentCodes.map(x => x.code === targetCodeStr ? { code: updatedCode, desc: updatedDesc } : x);
  window.adminDraftInviteCodes = updated;
  markUnsavedChanges();
  if (typeof toast === "function") toast(`🔑 Invite Code '${updatedCode}' updated in draft (Click "Save All Changes" to push live)`);
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
};

window.generateRandomAdminInviteCode = function() {
  const prefixes = ["VIP", "NERDY", "MODEL", "STUDIO", "TALENT", "SHOOT"];
  const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const generated = `${randomPrefix}-${randomNum}`;
  const randomDesc = prompt("Enter Admin-Only Note for this random code:", "Auto-generated random VIP code")?.trim() || "Auto-generated random VIP code";
  
  const current = window.getAdminInviteCodes();
  window.adminDraftInviteCodes = [{ code: generated, desc: randomDesc }, ...current];
  markUnsavedChanges();
  if (typeof toast === "function") toast(`🎲 Auto-generated VIP Code '${generated}' in draft (Click "Save All Changes" to push live)`);
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
};

window.deleteAdminInviteCode = function(codeToDelete) {
  const current = window.getAdminInviteCodes();
  if (current.length <= 1) {
    alert("You must keep at least 1 active invite code!");
    return;
  }
  if (confirm(`Remove invite code '${codeToDelete}' from draft?`)) {
    const updated = current.filter(x => x.code !== codeToDelete);
    window.adminDraftInviteCodes = updated;
    markUnsavedChanges();
    if (typeof toast === "function") toast(`🗑️ Invite code '${codeToDelete}' removed from draft.`);
    if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
  }
};

window.editAdminInviteCode = function(oldCode) {
  const currentCodes = window.getAdminInviteCodes();
  const targetCode = oldCode || currentCodes[0] || "NERDY-INVITE";
  const updated = prompt("Edit Photographer Direct Invite Code String:", targetCode)?.trim().toUpperCase();
  if (!updated) return;
  if (updated.length < 3) { alert("Invite code must be at least 3 characters!"); return; }
  
  const idx = currentCodes.indexOf(targetCode);
  if (idx !== -1) {
    currentCodes[idx] = updated;
  } else {
    currentCodes.unshift(updated);
  }
  localStorage.setItem("wps_custom_invite_codes", JSON.stringify(currentCodes));
  localStorage.setItem("wps_custom_invite_code", updated);
  if (typeof toast === "function") toast(`🔑 Invite Code updated to '${updated}'!`);
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
  if (typeof render === "function") render();
};

window.generateRandomAdminInviteCode = function() {
  const prefixes = ["VIP", "NERDY", "MODEL", "STUDIO", "TALENT", "SHOOT"];
  const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const generated = `${randomPrefix}-${randomNum}`;
  
  const current = window.getAdminInviteCodes();
  current.unshift(generated);
  localStorage.setItem("wps_custom_invite_codes", JSON.stringify(current));
  localStorage.setItem("wps_custom_invite_code", generated);
  if (typeof toast === "function") toast(`🎲 Auto-generated new VIP Invite Code '${generated}'!`);
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
  if (typeof render === "function") render();
};

window.copyInviteCodeToClipboard = function() {
  const inviteCode = window.getAdminInviteCode();
  navigator.clipboard.writeText(inviteCode).then(() => {
    if (typeof toast === "function") toast(`📋 Invite Code '${inviteCode}' copied to clipboard!`);
    else alert(`📋 Invite Code '${inviteCode}' copied to clipboard!`);
  }).catch(() => {
    alert(`Photographer Invite Code: ${inviteCode}`);
  });
};

window.saveNewPromoCodeFromForm = function() {
  const codeInput = document.getElementById("newPromoName");
  const typeSelect = document.getElementById("newPromoType");
  const valInput = document.getElementById("newPromoVal");
  const descInput = document.getElementById("newPromoDesc");

  const codeName = (codeInput?.value || "").trim().toUpperCase();
  if (!codeName || codeName.length < 3) {
    alert("Promo code must be at least 3 characters!");
    return;
  }

  const isPct = (typeSelect?.value || "pct") === "pct";
  const numVal = parseInt(valInput?.value || "0", 10);
  if (isNaN(numVal) || numVal <= 0) {
    alert("Please enter a valid discount value!");
    return;
  }
  if (isPct && numVal > 90) {
    alert("Percentage discount cannot exceed 90%!");
    return;
  }

  const defaultDesc = isPct ? `${numVal}% Off Special Offer` : `Flat ₹${numVal.toLocaleString('en-IN')} Off Instant Savings`;
  const labelDesc = (descInput?.value || "").trim() || defaultDesc;

  const currentCodes = getAdminPromoCodes();
  currentCodes[codeName] = isPct ? { pct: numVal, label: labelDesc, isCustom: true } : { flat: numVal, label: labelDesc, isCustom: true };

  if (codeInput) codeInput.value = "";
  if (valInput) valInput.value = "";
  if (descInput) descInput.value = "";

  markUnsavedChanges();
  if (typeof toast === "function") toast(`🎉 Promo Code '${codeName}' added to draft (Click "Save All Changes" to push live)`);
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
};

window.addNewAdminPromoCode = function() {
  const form = document.getElementById("promoCreatorForm");
  if (form) {
    form.style.display = "block";
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else {
    // Fallback prompt if form not in DOM
    const codeName = prompt("Enter New Promo Code String (e.g. SUMMER30):")?.trim().toUpperCase();
    if (!codeName) return;
    const currentCodes = getAdminPromoCodes();
    currentCodes[codeName] = { pct: 20, label: "20% Off Special Offer", isCustom: true };
    localStorage.setItem("wps_custom_promo_codes", JSON.stringify(currentCodes));
    if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
  }
};

window.editAdminPromoCode = function(codeKey) {
  const currentCodes = getAdminPromoCodes();
  const item = currentCodes[codeKey] || {};

  const newCodeName = prompt("Edit Promo Code String (e.g. SUMMER30):", codeKey)?.trim().toUpperCase();
  if (!newCodeName) return;
  if (newCodeName.length < 3) { alert("Promo code must be at least 3 characters!"); return; }

  const currentType = item.flat ? "2" : "1";
  const typeChoice = prompt("Select Discount Type:\nType '1' for Percentage (%)\nType '2' for Flat Amount (INR ₹):", currentType);
  if (!typeChoice) return;

  let pct = 0, flat = 0;
  if (typeChoice.trim() === "1") {
    const valStr = prompt("Enter Percentage Discount (1 to 90%):", item.pct || "20");
    pct = parseInt(valStr, 10);
    if (isNaN(pct) || pct <= 0 || pct > 90) { alert("Invalid percentage!"); return; }
  } else {
    const valStr = prompt("Enter Flat Discount Amount in INR ₹ (e.g. 1000):", item.flat || "1000");
    flat = parseInt(valStr, 10);
    if (isNaN(flat) || flat <= 0) { alert("Invalid amount!"); return; }
  }

  const defaultDesc = pct ? `${pct}% Off Special Discount` : `Flat ₹${flat.toLocaleString('en-IN')} Off Instant Savings`;
  const labelDesc = prompt("Enter Short Description:", item.label || defaultDesc) || defaultDesc;

  if (newCodeName !== codeKey) {
    delete currentCodes[codeKey];
  }
  currentCodes[newCodeName] = pct ? { pct, label: labelDesc, isCustom: true } : { flat, label: labelDesc, isCustom: true };

  markUnsavedChanges();
  if (typeof toast === "function") toast(`✏️ Promo Code '${newCodeName}' updated in draft (Click "Save All Changes" to push live)`);
  if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
};

window.deleteAdminPromoCode = function(codeName) {
  if (confirm(`Remove promo code '${codeName}' from draft?`)) {
    const currentCodes = getAdminPromoCodes();
    delete currentCodes[codeName];
    markUnsavedChanges();
    if (typeof toast === "function") toast(`🗑️ Promo code '${codeName}' removed from draft.`);
    if (typeof renderAdminPackagesEditor === "function") renderAdminPackagesEditor();
  }
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

function getAdminPackages() {
  try {
    const saved = localStorage.getItem("wps_custom_packages");
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return DEFAULT_PACKAGES;
}

window.getAdminPackages = getAdminPackages;

window.saveAdminCustomPackages = function() {
  const rows = document.querySelectorAll(".admin-pkg-editor-row");
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

  // Commit Draft Invite Codes
  if (window.adminDraftInviteCodes && Array.isArray(window.adminDraftInviteCodes)) {
    localStorage.setItem("wps_custom_invite_codes", JSON.stringify(window.adminDraftInviteCodes));
    if (window.adminDraftInviteCodes[0]) {
      localStorage.setItem("wps_custom_invite_code", window.adminDraftInviteCodes[0]);
    }
  }

  // Commit Draft Promo Codes
  if (window.adminDraftPromoCodes && typeof window.adminDraftPromoCodes === "object") {
    localStorage.setItem("wps_custom_promo_codes", JSON.stringify(window.adminDraftPromoCodes));
  }

  const statusBadge = document.getElementById("adminPricingSaveStatus");
  if (statusBadge) {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    statusBadge.style.color = "#059669";
    statusBadge.style.background = "rgba(5,150,105,0.15)";
    statusBadge.style.borderColor = "#059669";
    statusBadge.innerHTML = `🟢 ALL CHANGES SAVED TO LIVE SITE (${nowStr})`;
  }

  if (typeof toast === "function") toast("✅ Package Rates, Promo Codes & Invite Codes saved to live site! All booking forms updated.");
  else alert("✅ Package Rates, Promo Codes & Invite Codes saved to live site!");
  
  if (typeof render === "function") render();
};

window.resetAdminCustomPackages = function() {
  if (confirm("Reset studio package rates to default values?")) {
    localStorage.removeItem("wps_custom_packages");
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
  const srcsetAttr = (p, sizes = "(max-width: 620px) 90vw, (max-width: 1100px) 45vw, 640px") => {
    if (!p || !p.url) return "";                 // base64/local: no srcset
    const fixPath = (url) => (url && url.startsWith("photos/")) ? "/" + url : url;
    const set = [];
    if (p.small)  set.push(`${fixPath(p.small)} 480w`);
    if (p.medium) set.push(`${fixPath(p.medium)} 960w`);
    if (set.length) set.push(`${fixPath(p.url)} 1600w`);
    return set.length ? ` srcset="${esc(set.join(", "))}" sizes="${esc(sizes)}"` : "";
  };
  // Descriptive, SEO-friendly alt text for a shoot's photo (Google Images).
  const altFor = (s, frame) => {
    if (!s) return "Photograph by nerdyphotographer.in";
    if (s.caption) return s.caption;
    const who = (s.talent && s.talent.trim()) || (s.title && s.title.trim()) || "";
    const typeTag = (s.type === "Selective Collaboration (TFP)" && !s.showTestShootCategory) ? "" : s.type;
    const what = [s.activity, typeTag].filter(Boolean).join(" ");
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
    let url = s, label = s;
    if (s.includes("instagram.com") || s.startsWith("@")) {
      if (s.startsWith("http")) {
        const handle = s.split("instagram.com/")[1]?.split("/")[0]?.split("?")[0] || "";
        url = `https://instagram.com/${handle}`;
        label = `@${handle}`;
      } else if (s.startsWith("@")) {
        label = s;
        url = "https://instagram.com/" + s.replace(/^@/, "");
      } else {
        label = "@" + s;
        url = "https://instagram.com/" + s;
      }
    } else if (s.includes("kavyar.com")) {
      url = s.startsWith("http") ? s : "https://" + s;
      label = compact ? "Kavyar" : "Kavyar: " + url.split("/").pop();
    } else if (s.startsWith("http")) {
      url = s;
      label = compact ? "Link" : s.split("//")[1]?.split("/")[0] || "Link";
    } else {
      url = "https://instagram.com/" + s;
      label = "@" + s;
    }
    const arrow = compact ? "" : " ↗";
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
          by: s.talent || "Anonymous",
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
  
  function isCurrentlyCompCardView() {
    const search = location.pathname + location.search;
    const decoded = decodeURIComponent(search).replace(/\+/g, " ");
    return search.includes("categories") && (
      search.includes("Comp%20Cards") || decoded.includes("Comp Cards") ||
      search.includes("Test%20Shoot") || decoded.includes("Selective Collaboration (TFP)") || search.includes("Test+Shoot")
    );
  }

  function isCurrentlyModelPortfolioView() {
    const search = location.pathname + location.search;
    const decoded = decodeURIComponent(search).replace(/\+/g, " ");
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
  async function delShoot(id) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }

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
    usingDemo = real.length === 0;
    
    const parseShootDate = (s) => {
      if (!s.date) return s.createdAt || 0;
      const t = Date.parse(s.date);
      return isNaN(t) ? (s.createdAt || 0) : t;
    };
    
    // Sort a copy — sorting window.WPS_DATA.DEMO_SHOOTS in place made
    // refreshPublishedData's JSON.stringify equality check always see a
    // "change" (reordered array) on every poll, even when nothing published
    // had actually changed.
    const sorted = [...(usingDemo ? ((window.WPS_DATA && window.WPS_DATA.DEMO_SHOOTS) || DEMO_SHOOTS || []) : real)].sort((a, b) => parseShootDate(b) - parseShootDate(a));
    
    if (isAdmin()) {
      SHOOTS = sorted;
    } else {
      SHOOTS = sorted.filter(s => !isFutureShoot(s));
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

  async function ghApi(pat, path, opts = {}) {
    const res = await fetch(`${GH_API}${path}`, {
      ...opts,
      headers: {
        "Authorization": `token ${pat}`,
        "Accept": "application/vnd.github+json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (res.status === 401) {
      localStorage.removeItem("wps-github-pat");
      throw new Error("GitHub rejected the token (401). It was cleared — you'll be asked for it again on the next sync.");
    }
    if (!res.ok) throw new Error(`GitHub ${opts.method || "GET"} ${path} failed (${res.status})`);
    return res.json();
  }

  // Pull the DEMO_SHOOTS array out of a data.js source string. The array is
  // always the last JSON value in the file, in every format we've published.
  function parseShootsFromDataJs(text) {
    try {
      const key = text.lastIndexOf("DEMO_SHOOTS");
      if (key === -1) return null;
      const start = text.indexOf("[", key);
      const end = text.lastIndexOf("]");
      if (start === -1 || end <= start) return null;
      const arr = JSON.parse(text.slice(start, end + 1));
      return Array.isArray(arr) ? arr : null;
    } catch { return null; }
  }

  // Throws (rather than returning null) on any failure short of a genuine
  // "file doesn't exist yet" 404 — syncToGitHub's merge treats a null/empty
  // result as "nothing published remotely" and would otherwise publish a
  // local-only view of the world on a network hiccup, silently wiping out
  // shoots that only exist on other devices.
  async function fetchRemoteShoots(pat) {
    const res = await fetch(`${GH_API}/contents/data.js?ref=${GH_BRANCH}`, {
      headers: { "Authorization": `token ${pat}`, "Accept": "application/vnd.github.raw+json" },
    });
    if (res.status === 404) return []; // fresh repo, no data.js published yet — genuinely empty
    if (!res.ok) throw new Error(`Could not read the published data.js (GitHub ${res.status}) — aborting to avoid overwriting other devices' shoots.`);
    const parsed = parseShootsFromDataJs(await res.text());
    if (parsed === null) throw new Error("Could not parse the published data.js — aborting to avoid overwriting other devices' shoots.");
    return parsed;
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
      const remote = await fetchRemoteShoots(pat); // throws -> caught below, sync aborts, nothing published
      const removed = new Set(deletedIds);
      const merged = new Map();
      remote.forEach((s) => { if (s && s.id && !s.demo && !removed.has(s.id)) merged.set(s.id, s); });
      shootsList.forEach((s) => { if (s && s.id && !s.demo && !removed.has(s.id)) merged.set(s.id, s); });
      const shoots = [...merged.values()];

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
      for (const s of shoots) {
        for (const p of s.photos || []) {
          if (p.url || !p.dataUrl) continue;
          const m = p.dataUrl.match(/^data:(image\/[a-z.+-]+);base64,/);
          if (!m) continue; // not a base64 image (e.g. demo SVG) — leave inline
          const dir = `photos/${s.id}`;
          const fullPath = `${dir}/${p.id}.${MIME_EXT[m[1]] || "jpg"}`;
          await commitBlob(fullPath, p.dataUrl.slice(m[0].length));
          p.url = fullPath;
          // Responsive variants (JPEG). Skip a variant if it doesn't shrink.
          try {
            for (const [w, key] of [[480, "small"], [960, "medium"]]) {
              const variant = await resize(p.dataUrl, w, 0.8);
              const vm = variant.match(/^data:(image\/[a-z.+-]+);base64,/);
              if (variant !== p.dataUrl && vm) {
                const vPath = `${dir}/${p.id}@${w}.jpg`;
                await commitBlob(vPath, variant.slice(vm[0].length));
                p[key] = vPath;
              }
            }
          } catch (err) { console.warn("variant gen failed for", p.id, err); }
          toast(`Uploading photos… (${photoEntries.length})`);
        }
      }

      // Published copy references photo files instead of inline base64.
      const published = shoots.map((s) => ({
        ...s,
        photos: (s.photos || []).map((p) => p.url
          ? {
              id: p.id, url: p.url, objectPosition: p.objectPosition || "center",
              ...(p.excludeFromCompCard ? { excludeFromCompCard: true } : {}),
              ...(p.small ? { small: p.small } : {}),
              ...(p.medium ? { medium: p.medium } : {}),
              ...(p.caption ? { caption: p.caption } : {}),
              ...(typeof p.focalX === "number" ? { focalX: p.focalX, focalY: p.focalY } : {})
            }
          : p),
      }));
      const fileContent = `/* ============================================================
   nerdyphotographer.in — published portfolio data
   Auto-synced by the Admin Panel. Photo files live under photos/.
   ============================================================ */
window.WPS_DATA = ${JSON.stringify({ ACTIVITIES, TYPES, BRANDS, DEMO_SHOOTS: published }, null, 2)};
`;

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

      // Bring this browser up to date with the merged result (photo URLs and
      // any shoots that only existed on the other device).
      try {
        for (const s of shoots) await putShoot(s);
        await loadShoots();
        render();
      } catch {}

      toast("Sync complete! Changes go live for everyone within a few minutes.");
    } catch (e) {
      console.error(e);
      toast(e.message && e.message.includes("401") ? e.message : "GitHub sync failed — changes are saved locally. Check the token and connection, then publish again.");
    }
  }

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

    // Agency Model Stats HUD Card (Album Space #4 Redesign with Smart Fallback)
    let statsHtml = "";
    const hasStats = shoot.height || shoot.chest || shoot.waist || shoot.hips || shoot.shoes || shoot.modelHair || shoot.modelEyes;
    const statsAllowedHere = isCurrentlyModelPortfolioView() ? shoot.showStatsOnModelPortfolio !== false : shoot.showStatsOnCompCard !== false;
    if (isCc && hasStats && statsAllowedHere) {
      const statItems = [
        shoot.height ? `<span>📏 <strong>Height:</strong> ${esc(shoot.height)}</span>` : "",
        shoot.chest ? `<span>👚 <strong>Bust/Chest:</strong> ${esc(shoot.chest)}</span>` : "",
        shoot.waist ? `<span>👗 <strong>Waist:</strong> ${esc(shoot.waist)}</span>` : "",
        shoot.hips ? `<span>👠 <strong>Hips:</strong> ${esc(shoot.hips)}</span>` : "",
        shoot.shoes ? `<span>👟 <strong>Shoes:</strong> ${esc(shoot.shoes)}</span>` : "",
        shoot.modelHair ? `<span>💇 <strong>Hair:</strong> ${esc(shoot.modelHair)}</span>` : "",
        shoot.modelEyes ? `<span>👁️ <strong>Eyes:</strong> ${esc(shoot.modelEyes)}</span>` : ""
      ].filter(Boolean);

      statsHtml = `
        <div class="lb-sidebar-section" style="background: var(--paper); border: 1.5px solid var(--accent); border-radius: 10px; padding: 14px; margin-bottom: 14px; box-shadow: var(--shadow-sm);">
          <div style="font-family: var(--mono-font); font-size: 10px; font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
            <span>📏 Agency Model Measurements</span>
            <span style="font-size: 9px; background: rgba(255,69,0,0.15); padding: 2px 6px; border-radius: 4px;">VERIFIED</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px 12px; font-size: 11.5px; color: var(--ink); line-height: 1.5;">
            ${statItems.join("")}
          </div>
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
            <span style="font-family:'JetBrains Mono', monospace; font-size:10px; font-weight: 700; color:var(--accent); background:rgba(210,78,26,0.1); border: 1px solid var(--accent); padding: 4px 8px; border-radius: 4px; text-transform: uppercase; display: inline-block;">
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
            <span class="eyebrow" style="font-family:'JetBrains Mono', monospace; font-size:9px; text-transform:uppercase; color:var(--ink-soft); display:block; margin-bottom: 8px;">Filter Portfolio</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="angle-filter-btn ${window.activeAngleFilter === 'all' ? 'active' : ''}" data-angle="all" style="font-family:inherit; font-size:10px; font-weight:700; padding:4px 8px; border-radius:4px; border:1px solid var(--line); background:${window.activeAngleFilter === 'all' ? 'var(--accent)' : 'var(--paper)'}; color:${window.activeAngleFilter === 'all' ? '#fff' : 'var(--ink)'}; cursor:pointer;">All</button>
              ${anglesInShoot.map(ang => {
                const isActive = window.activeAngleFilter === ang;
                return `<button class="angle-filter-btn ${isActive ? 'active' : ''}" data-angle="${ang}" style="font-family:inherit; font-size:10px; font-weight:700; padding:4px 8px; border-radius:4px; border:1px solid var(--line); background:${isActive ? 'var(--accent)' : 'var(--paper)'}; color:${isActive ? '#fff' : 'var(--ink)'}; cursor:pointer;">${labels[ang] || ang}</button>`;
              }).join("")}
            </div>
          </div>
        `;
      }
    }

    // Categorized UI/UX Credits Engine with Micro-Badges & Deduplicated Venue Cards
    const isCcPage = !!shoot.isCompCard;
    const talentList = [];
    const creativeList = [];

    const addCreativeItem = (val, roleTag) => {
      if (!val || val === "—") return;
      const items = val.split(",").map(item => item.trim()).filter(Boolean);
      items.forEach(item => {
        const rendered = isCcPage ? esc(getTalentCleanName(item)) : renderCreditValue(item);
        creativeList.push(`
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; padding: 4px 0; border-bottom: 1px dashed var(--line);">
            <div style="font-size: 12px; font-weight: 600; color: var(--ink);">${rendered}</div>
            <span style="font-family: var(--mono-font); font-size: 9px; font-weight: 800; background: rgba(255, 69, 0, 0.1); color: var(--accent); border: 1px solid rgba(255, 69, 0, 0.25); padding: 2px 6px; border-radius: 4px; text-transform: uppercase; white-space: nowrap;">${roleTag}</span>
          </div>
        `);
      });
    };

    if (shoot.talent && shoot.talent !== "—") {
      const items = shoot.talent.split(",").map(item => item.trim()).filter(Boolean);
      items.forEach(item => {
        let rendered = isCcPage ? esc(getTalentCleanName(item)) : renderCreditValue(item);
        // If talent string doesn't contain a link but shoot.instagram exists, attach igHtml right beside the name!
        if (igHtml && !rendered.includes("href=") && !rendered.includes("@")) {
          rendered += ` <span style="margin-left: 6px;">${igHtml}</span>`;
        }
        talentList.push(`
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; padding: 4px 0; border-bottom: 1px dashed var(--line);">
            <div style="font-size: 12.5px; font-weight: 700; color: var(--ink); display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">${rendered}</div>
            <span style="font-family: var(--mono-font); font-size: 9px; font-weight: 800; background: rgba(5, 150, 105, 0.12); color: #059669; border: 1px solid rgba(5, 150, 105, 0.25); padding: 2px 6px; border-radius: 4px; text-transform: uppercase; white-space: nowrap;">MODEL</span>
          </div>
        `);
      });
    }

    if (shoot.photographer) addCreativeItem(shoot.photographer, "PHOTOGRAPHY");
    if (shoot.mentor) addCreativeItem(shoot.mentor, "MENTOR");
    if (shoot.artDirector) addCreativeItem(shoot.artDirector, "ART DIRECTOR");
    if (shoot.stylist) addCreativeItem(shoot.stylist, "STYLING");
    if (shoot.hair) addCreativeItem(shoot.hair, "HAIR STYLIST");
    if (shoot.mua) addCreativeItem(shoot.mua, "MUA");
    if (shoot.videographer) addCreativeItem(shoot.videographer, "VIDEO");

    if (shoot.credits && shouldShowField(shoot, "Credits")) {
      const items = shoot.credits.split(",").map(item => item.trim()).filter(Boolean);
      items.forEach(item => {
        const rendered = isCcPage ? esc(getTalentCleanName(item)) : renderCreditsValue(item);
        creativeList.push(`
          <div style="font-size: 12px; color: var(--ink-soft); margin-bottom: 6px; padding: 3px 0;">${rendered}</div>
        `);
      });
    }

    // Build Venue & Studio links block
    const cfg = window.STUDIO_CONFIG || {};
    let locationContent = "";
    if (shoot.location && shoot.location !== "—") {
      locationContent += `<div style="font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 4px;">${renderCreditLinks(shoot.location)}</div>`;
    }
    const studioLinks = [];
    if (cfg.instagram) studioLinks.push(`<a href="${esc(cfg.instagram)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); font-weight: 700; text-decoration: none; margin-right: 12px; font-size: 11.5px;">@nerdyphotographer.in ↗</a>`);
    if (cfg.kavyar) studioLinks.push(`<a href="${esc(cfg.kavyar)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); font-weight: 700; text-decoration: none; font-size: 11.5px;">Kavyar Studio ↗</a>`);
    if (studioLinks.length) {
      locationContent += `<div style="display: flex; gap: 8px; margin-top: 4px;">${studioLinks.join("")}</div>`;
    }

    const creditsSections = [];

    // Talent Section
    if (talentList.length > 0) {
      creditsSections.push(`
        <div style="margin-bottom: 16px;">
          <div style="font-family: var(--mono-font); font-size: 10px; font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;">
            <span>👥 Models &amp; Talent</span>
          </div>
          ${talentList.join("")}
        </div>
      `);
    }

    // Creative Team Section
    if (creativeList.length > 0) {
      creditsSections.push(`
        <div style="margin-bottom: 16px;">
          <div style="font-family: var(--mono-font); font-size: 10px; font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;">
            <span>🎨 Creative &amp; Production Team</span>
          </div>
          ${creativeList.join("")}
        </div>
      `);
    }

    // Location & Studio Section
    if (locationContent) {
      creditsSections.push(`
        <div style="margin-bottom: 14px;">
          <div style="font-family: var(--mono-font); font-size: 10px; font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;">
            <span>📍 Location &amp; Studio</span>
          </div>
          ${locationContent}
        </div>
      `);
    }

    // Direct Social Handles Tag Credits Card (Instagram & Kavyar)
    if ((igHtml || kavyarHtml) && (!talentList.length || !talentList[0].includes("href="))) {
      creditsSections.push(`
        <div>
          <div style="font-family: var(--mono-font); font-size: 10px; font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;">
            <span>📱 Social Handle Tags</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 11.5px; align-items: center;">
            ${igHtml ? `<div>${igHtml}</div>` : ""}
            ${kavyarHtml ? `<div>${kavyarHtml}</div>` : ""}
          </div>
        </div>
      `);
    }

    if (shoot.pdfUrl && shouldShowField(shoot, "Pdf")) {
      creditsSections.push(`
        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line);">
          <a href="${esc(shoot.pdfUrl)}" download style="color: var(--accent); text-decoration: none; font-weight: 700; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;">📄 Download Publication PDF</a>
        </div>
      `);
    }

    const creditsHtml = creditsSections.length ? `
      <div class="lb-sidebar-section" style="background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin-top: 14px; box-shadow: var(--shadow-sm);">
        ${creditsSections.join("")}
      </div>
    ` : "";

    // Lighting diagram
    let diagHtml = "";
    if (shoot.lightingDiagram && (shoot.lightingDiagramVisibility === "public" || isAdmin())) {
      diagHtml = `
        <div class="lb-sidebar-section" style="margin-top: 10px;">
          <button class="btn btn-ghost btn-block" style="font-size: 11px; height: auto; padding: 8px;" onclick="window.toggleLbDiagram()">
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
          <div class="lb-sidebar-section" style="margin-top: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--bone); display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <span style="font-family:'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; text-transform: uppercase; color: var(--ink-soft);">PDF Orientation</span>
              <div style="display: inline-flex; background: var(--paper); padding: 2px; border-radius: 6px; border: 1px solid var(--line);" id="compCardOrientGroup">
                <label style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-family:'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; border-radius: 4px; cursor: pointer; transition: all 0.2s ease; background: ${isPortraitActive ? "var(--ink)" : "transparent"}; color: ${isPortraitActive ? "var(--paper)" : "var(--ink-soft)"};" class="orient-radio-label${isPortraitActive ? " active" : ""}">
                  <input type="radio" name="compCardOrientRadio" value="portrait" ${isPortraitActive ? "checked" : ""} onchange="window.setCompCardOrientation('portrait', this, '${escJs(shoot.id)}')" style="display: none;" />
                  <span>Portrait</span>
                </label>
                <label style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-family:'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; border-radius: 4px; cursor: pointer; transition: all 0.2s ease; background: ${!isPortraitActive ? "var(--ink)" : "transparent"}; color: ${!isPortraitActive ? "var(--paper)" : "var(--ink-soft)"};" class="orient-radio-label${!isPortraitActive ? " active" : ""}">
                  <input type="radio" name="compCardOrientRadio" value="landscape" ${!isPortraitActive ? "checked" : ""} onchange="window.setCompCardOrientation('landscape', this, '${escJs(shoot.id)}')" style="display: none;" />
                  <span>Landscape</span>
                </label>
              </div>
            </div>
            <button class="btn btn-dark btn-block" style="font-size: 11px; height: auto; padding: 10px; font-family: 'JetBrains Mono', monospace; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;" onclick="window.triggerCompCardDownload('${escJs(shoot.id)}')">
              Export PDF Comp Card ↗
            </button>
            <div style="margin-top: 4px; padding: 10px 12px; background: #fdf6f0; border: 1px solid #f2c9b6; border-left: 4px solid var(--accent); border-radius: 6px; display: flex; align-items: flex-start; gap: 8px; text-align: left;">
              <span style="font-size: 15px; line-height: 1;">🎲</span>
              <div style="font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #3b2f27; line-height: 1.45;">
                <strong style="color: var(--accent); text-transform: uppercase; font-size: 10px; letter-spacing: 0.03em;">Random Selection:</strong><br/>
                Supporting photos are randomly selected from all photos tagged to this model every time you export.
              </div>
            </div>
          </div>
        `;
      } else if (isAdmin()) {
        pdfBtnHtml = `
          <div class="lb-sidebar-section" style="margin-top: 10px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--accent); border: 1px dashed var(--accent); padding: 8px 12px; text-transform: uppercase; text-align: center; border-radius: 4px;">
            🔒 Comp card PDF download disabled by agency override
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
          <button class="btn btn-dark btn-block" style="font-size: 11px; height: auto; padding: 10px; font-family: 'JetBrains Mono', monospace; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;" onclick="window.printModelPortfolio('${escJs(shoot.id)}')">
            Export Model Portfolio PDF ↗
          </button>
        </div>
      `;
    }
    const disclaimerHtml = isCc ? `
      <p class="lb-disclaimer" style="font-size: 11px; font-style: italic; color: var(--ink-soft); margin-top: 16px; border-top: 1px solid var(--line); padding-top: 12px; line-height: 1.5; font-family: sans-serif;">
        To book this talent, please connect directly via their verified social channels or contact their representing agency.
        <br/><br/>
        This compcard includes photos clicked or produced under nerdyphotographer.in studio or its subsidiaries.
      </p>
    ` : "";

    return `
      <div style="display:flex; flex-direction:column; gap: 24px; width: 100%;">
        <div>
          <span class="eyebrow" style="color:var(--accent); font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:0.05em; text-transform:uppercase;">
            ${isCc ? "Model Portfolio" : `${esc(shoot.brand)} · ${esc(shoot.type)}`}
          </span>
          <h2 style="font-family:'Outfit', sans-serif; font-size: 24px; font-weight:700; margin: 6px 0 0; color:var(--ink); line-height: 1.2;">
            ${esc(getTalentCleanName(shoot.talent || shoot.title))}
          </h2>
          ${angleHtml}
          ${shoot.description ? `<p style="font-size:13px; color:var(--ink-soft); line-height:1.5; margin:14px 0 0;">${esc(shoot.description)}</p>` : ""}
        </div>
        
        ${isCc ? "" : `
        <dl class="work-credits" style="margin: 0; padding: 14px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);">
          ${shoot.activity ? `<div><dt>Activity</dt><dd>${esc(shoot.activity)}</dd></div>` : ""}
          ${shoot.season ? `<div><dt>Season</dt><dd>${esc(shoot.season)}</dd></div>` : ""}
          ${(shoot.location) ? `<div><dt>Location</dt><dd>${renderCreditLinks(shoot.location)}</dd></div>` : ""}
        </dl>
        `}
        
        ${statsHtml}
        ${filterBarHtml}
        
        ${isCc ? `
          <div class="lb-sidebar-section" style="border-top: 1px solid var(--line); padding-top: 16px;">
            <dl class="work-credits" style="margin: 0;">
              ${igHtml}
              ${kavyarHtml}
            </dl>
          </div>
        ` : `
          ${creditsHtml}
        `}
        
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
          const shootLabel = (t) => {
            const parts = [t.season || t.date, t.activity, `${(t.photos || []).length} photos`].filter(Boolean);
            return parts.join(" · ");
          };
          const rows = targets.map(t => `
              <div style="display: flex; gap: 14px; width: 100%; margin-top: 6px;">
                <button class="link-arrow work-edit" style="color: var(--accent); font-weight: 700; padding: 0; font-size: 11px; height: auto; text-align: left;" data-id="${t.id}">${targets.length > 1 ? `Edit: ${esc(shootLabel(t))}` : "Edit details"} →</button>
                <button class="link-arrow work-delete" style="color: #b22222; font-weight: 700; padding: 0; font-size: 11px; height: auto;" data-id="${t.id}" data-title="${esc(t.title || t.talent || "")}${targets.length > 1 ? ` — ${esc(shootLabel(t))}` : ""}">Delete →</button>
              </div>`).join("");
          return `
            <div class="lb-sidebar-section" style="margin-top: 20px; border-top: 1px dashed var(--line); padding-top: 16px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; width: 100%;">
              <h4 style="font-family:'Outfit', sans-serif; font-size:9px; font-weight:800; letter-spacing:0.05em; text-transform:uppercase; color:var(--ink-soft); margin:0;">Admin Controls <span style="font-weight: normal; opacity: 0.7; font-size: 8px; margin-left: 4px;">(🔒 Visible Only to Admins)</span></h4>
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
  function paintLb() {
    const p = lbList[lbIdx]; if (!p) return;
    lbImg.src = photoSrc(p);
    lbImg.srcset = p.url ? srcsetAttr(p) : "";
    lbImg.alt = p.caption || altFor(p.shoot);
    lbImg.style.objectPosition = "center";
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
    const lbMain = $(".lightbox-main") || lb;
    lbMain.addEventListener("touchstart", (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    lbMain.addEventListener("touchend", (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const diff = touchEndX - touchStartX;
      if (diff < -50) stepLb(1);      // Swipe left -> Next
      else if (diff > 50) stepLb(-1); // Swipe right -> Prev
    }, { passive: true });
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
      adminBtn.style.color = active ? "var(--accent)" : "#fff";
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

    const uploadLi = $("#navUploadLi"), bookLi = $("#navBookLi"), compCardsLi = $("#navCompCardsLi"), portfolioLi = $("#navModelPortfolioLi"), workshopLi = $("#navWorkshopLi"), logsLi = $("#navLogsLi"), analyticsLi = $("#navAnalyticsLi"), calendarLi = $("#navCalendarLi");
    if (uploadLi) uploadLi.style.display = active ? "block" : "none";
    if (bookLi) bookLi.style.display = active ? "none" : "block";
    if (compCardsLi) compCardsLi.style.display = "block";
    if (portfolioLi) portfolioLi.style.display = active ? "block" : "none";
    if (workshopLi) workshopLi.style.display = "block"; // Always show Workshop in nav
    if (calendarLi) calendarLi.style.display = active ? "block" : "none";
    if (logsLi) logsLi.style.display = active ? "block" : "none";
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
          <span><strong>Next Shoot:</strong> ${esc(nextShoot.dateKey)} — <strong>${esc(nextShoot.name)}</strong> (${esc(nextShoot.type || "Shoot")} · ⏱️ ${esc(nextShoot.duration || "Full Day")})</span>
          ${nextShoot.phone ? `<span style="opacity: 0.8;">· 📞 ${esc(nextShoot.phone)}</span>` : ""}
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button type="button" class="reminder-btn" id="viewNextShootBtn">👁 Details</button>
          <button type="button" class="reminder-btn" id="dismissReminderBtn" title="Dismiss banner">&times;</button>
        </div>
      `;

      banner.querySelector("#viewNextShootBtn")?.addEventListener("click", () => {
        if (typeof window.openDateAdminModal === "function") {
          window.openDateAdminModal(nextShoot.dateKey);
        } else {
          location.href = "/calendar";
        }
      });
      banner.querySelector("#dismissReminderBtn")?.addEventListener("click", () => {
        banner.style.display = "none";
      });
    } else if (banner) {
      banner.style.display = "none";
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
            <strong style="font-family: 'Outfit', sans-serif; font-size: 13px;">Upcoming Shoots (${upcoming.length})</strong>
            <a href="/calendar" data-link style="font-family: var(--mono-font); font-size: 10px; color: var(--accent); font-weight: 700; text-decoration: none;">View Full Calendar &rarr;</a>
          </div>
          ${upcoming.length ? upcoming.slice(0, 5).map(b => `
            <div style="padding: 8px; background: var(--bone); border-radius: 6px; border: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-family: var(--mono-font); font-size: 10px; color: var(--accent); font-weight: 700;">📅 ${esc(b.dateKey)} (${esc(b.dayLabel)})</div>
                <strong style="font-size: 12px; color: var(--ink);">${esc(b.name)}</strong>
                <div style="font-size: 10px; color: var(--ink-soft);">${esc(b.type)} · ⏱️ ${esc(b.duration || "Full Day")} ${b.phone ? `· 📞 ${esc(b.phone)}` : ""}</div>
              </div>
              <button type="button" class="admin-cal-btn" onclick="if (typeof window.openDateAdminModal === 'function') window.openDateAdminModal('${b.dateKey}');" style="font-size: 9px; padding: 3px 6px;">Details</button>
            </div>
          `).join("") : `
            <div style="font-size: 11px; color: var(--ink-soft); text-align: center; padding: 12px;">No upcoming client shoots scheduled.</div>
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
  const kineticH1 = (word, extraClass = "") => {
    const letters = String(word).split("").map((ch, i) =>
      ch === " "
        ? `<span class="kw-space">&nbsp;</span>`
        : `<span class="kw-letter" style="--i:${i}">${esc(ch)}</span>`
    ).join("");
    return `<h1 class="reveal kinetic-h1 ${extraClass}"><span class="kinetic-word-inner">${letters}</span></h1>`;
  };
  // noth.in-style full-bleed work card: big image, title + tagline overlay,
  // image reveal on hover. Opens the shoot in the lightbox via .noth-work wiring.
  function nothWorkCard(s, i) {
    const cover = s.photos.find(p => p.id.split("-")[0] === s.coverPhotoId) || s.photos[0] || { objectPosition: "center" };
    const coverPos = cover.objectPosition || "center";
    const typeTag = (s.type === "Selective Collaboration (TFP)" && !s.showTestShootCategory) ? "Selective Collab" : (s.type || "Editorial");
    const tagline = s.description
      ? s.description
      : [s.activity, typeTag].filter(Boolean).join(" · ");
    const photoCount = s.photos ? s.photos.length : 0;
    const countBadgeText = photoCount ? `📸 ${photoCount} Photo${photoCount > 1 ? "s" : ""}` : "";
    
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
          <!-- Top Floating Micro-Badges -->
          <div style="position: absolute; top: 12px; left: 12px; z-index: 4; display: flex; gap: 6px; align-items: center;">
            <span style="font-family: var(--mono-font); font-size: 9.5px; font-weight: 800; background: rgba(10, 10, 10, 0.75); backdrop-filter: blur(8px); color: #ffffff; padding: 4px 9px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.2); text-transform: uppercase; letter-spacing: 0.05em;">${esc(typeTag)}</span>
          </div>
          ${countBadgeText ? `
            <div style="position: absolute; top: 12px; right: 12px; z-index: 4;">
              <span style="font-family: var(--mono-font); font-size: 9.5px; font-weight: 800; background: rgba(10, 10, 10, 0.75); backdrop-filter: blur(8px); color: #ffffff; padding: 4px 9px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.2);">${esc(countBadgeText)}</span>
            </div>
          ` : ''}

          <span class="noth-work-backdrop" style="background-image: url('${esc(photoSrc(cover))}');" aria-hidden="true"></span>
          <img src="${esc(photoSrc(cover))}"${srcsetAttr(cover, "(max-width: 620px) 100vw, 100vw")} style="object-position: ${esc(coverPos)}; transition: transform 0.5s ease;" alt="${esc(altFor(s))}" loading="lazy" />
        </button>

        <div class="noth-work-row" style="padding: 16px;">
          <div class="noth-work-titles">
            <h3 class="noth-work-title" style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; margin-bottom: 4px;">${esc(title)}</h3>
            <p class="noth-work-tagline" style="font-size: 12px; color: var(--ink-soft); line-height: 1.4;">${esc(tagline)}</p>
          </div>
          <div class="noth-work-meta" style="margin-top: 10px; border-top: 1px solid var(--line); padding-top: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="font-family: var(--mono-font); font-size: 11px; color: var(--ink-soft);">
              ${meta ? `<span>${esc(meta)}</span>` : ""}
              ${mentorText ? `<div style="font-size: 11px; color: var(--accent); margin-top: 2px; font-weight: 600;">${esc(mentorText)}</div>` : ""}
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="noth-work-cta" style="font-size: 11px; font-weight: 700; color: var(--accent);">View Album →</span>
              <button class="work-share" data-id="${s.id}" style="background: var(--bone); border: 1px solid var(--line); border-radius: 6px; cursor: pointer; padding: 4px 8px; display: flex; align-items: center; justify-content: center; color: var(--ink); font-size: 11px;" title="Share album" aria-label="Share album">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>
            </div>
          </div>
          ${isAdmin() ? `
            <div class="noth-work-admin" style="margin-top: 10px; display: flex; gap: 12px; width: 100%; border-top: 1px dashed var(--line); padding-top: 10px;">
              <button class="link-arrow work-edit" style="color: var(--accent); font-weight: 700; padding: 0; font-size: 11px; height: auto;" data-id="${s.id}">Edit details →</button>
              <button class="link-arrow work-delete" style="color: #b22222; font-weight: 700; padding: 0; font-size: 11px; height: auto;" data-id="${s.id}">Delete →</button>
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

    const creditsList = [];
    if (s.isCompCard) {
      if (s.talent && s.talent !== "—") creditsList.push(`Talent <strong>${esc(s.talent)}</strong>`);
      if (igHtml) creditsList.push(`Socials ${igHtml}`);
    } else {
      if (s.photographer) creditsList.push(`Photo <strong>${esc(s.photographer)}</strong>`);
      if (s.artDirector) creditsList.push(`AD <strong>${esc(s.artDirector)}</strong>`);
      if (s.stylist && s.stylist !== "—") creditsList.push(`Style <strong>${esc(s.stylist)}</strong>`);
      if (s.hair && s.hair !== "—") creditsList.push(`Hair <strong>${esc(s.hair)}</strong>`);
      if (s.mua && s.mua !== "—") creditsList.push(`Makeup <strong>${esc(s.mua)}</strong>`);
      if (s.talent && s.talent !== "—") creditsList.push(`Talent <strong>${esc(s.talent)}</strong>`);
      if (igHtml) creditsList.push(`Socials ${igHtml}`);
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
        <p class="eyebrow" style="margin: 0 0 10px; font-size: 9px;">Lighting Setup ${s.lightingDiagramVisibility === 'private' ? '🔒 (Admin Only)' : '🌐 (Public)'}</p>
        <button class="btn btn-ghost btn-block view-diagram-btn" style="padding: 10px; font-size: 12px; height: auto;" data-id="${s.id}">View Lighting Diagram</button>
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
            <h2>${esc(s.talent)}</h2>
            <p class="comp-card-eyebrow">Comp Card</p>
          </div>
        ` : ""}
        ${mediaHtml}
        <div class="work-info">
          ${isFutureShoot(s) ? `
            <div class="future-schedule-badge" style="display: inline-block; background: rgba(210,78,26,0.12); color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 6px 12px; border-radius: 4px; margin-bottom: 16px; border: 1px solid rgba(210,78,26,0.25);">
              To be visible to public after ${esc(s.date)}
            </div>
          ` : ""}
          ${(() => {
            const canInline = !s.demo && !s.isCompCard && isAdmin();
            const ed = (field, extra = "") => canInline
              ? ` class="inline-edit ${extra}" contenteditable="true" spellcheck="false" data-shoot="${s.id}" data-field="${field}" title="Click to edit"`
              : (extra ? ` class="${extra}"` : "");
            const typeTag = (s.type === "Selective Collaboration (TFP)" && !s.showTestShootCategory) ? "" : s.type;
            const brandAndType = [s.brand, typeTag].filter(Boolean).join(" · ");
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
              <p class="eyebrow" style="font-size: 9px; margin-bottom: 8px; color: var(--ink-soft); letter-spacing: 0.05em; text-align: left;">Model Stats</p>
              <div class="stats-row">
                ${latestShoot.height ? `<div class="stats-item"><dt>Height</dt><dd>${esc(latestShoot.height)}</dd></div>` : ""}
                ${latestShoot.chest ? `<div class="stats-item"><dt>Chest/Bust</dt><dd>${esc(latestShoot.chest)}</dd></div>` : ""}
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
    const feat = SHOOTS.filter(s => !s.isTestimonial && s.type !== "Workshop Attended").slice(0, 7);
    CURRENT_VIEW_SHOOTS = feat;
    const brandCount = new Set(SHOOTS.filter(s => s.client && s.client.trim() && s.type !== "Workshop Attended").map(s => s.brand)).size;
    const activeBrands = BRANDS.filter(b => SHOOTS.some(s => s.brand === b && s.client && s.client.trim() && s.type !== "Workshop Attended"));
    const displayBrands = activeBrands.length ? activeBrands : BRANDS;
    const clientNames = [...new Set(SHOOTS.filter(s => s.type !== "Workshop Attended").map(s => s.client).filter(c => c && c.trim()))];
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
      <section class="hero hero-mono hero-brand">
        <div class="hero-bg" aria-hidden="true"></div>
        ${cameraSvg()}
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

      ${clientNames.length ? `
      <div class="marquee" aria-hidden="true">
        <div class="marquee-track">
          ${(clientNames.concat(clientNames)).map((c) => `<span>${esc(c)}</span><span>·</span>`).join("")}
        </div>
      </div>
      ` : ''}

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
            <span class="link-arrow" style="margin-top: 12px; display: inline-block; font-size: 12px; font-weight: 700;">Browse categories →</span>
          </a>
          <a href="/categories?kind=type&amp;val=Comp%20Cards" data-link class="service-card" style="display: block; text-decoration: none; color: inherit; cursor: pointer;">
            <div class="service-kicker">Models</div>
            <h3>Portfolio Building &amp; TFP</h3>
            <p>Editorial-grade portfolio building, comp card shoot development, and selective test shoots (TFP) to help models stand out in agency submissions.</p>
            <span class="link-arrow" style="margin-top: 12px; display: inline-block; font-size: 12px; font-weight: 700; color: var(--accent);">View model comp cards →</span>
          </a>
          <a href="/categories?kind=activity&amp;val=Fitness" data-link class="service-card" style="display: block; text-decoration: none; color: inherit; cursor: pointer;">
            <div class="service-kicker">Athletes</div>
            <h3>Fitness &amp; Sports Action</h3>
            <p>Dynamic action-freezing athletic portraits and editorial-grade fitness content that highlights physique, strength, and raw athletic performance.</p>
            <span class="link-arrow" style="margin-top: 12px; display: inline-block; font-size: 12px; font-weight: 700;">See fitness work →</span>
          </a>
        </div>
      </section>

      <!-- FEATURED PHOTOSHOOTS -->
      <section class="section container section-divider">
        ${kineticWord("WORKS")}
        <div class="section-head row reveal" style="margin-top: 8px;">
          <div><p class="eyebrow">01 — Selected work</p><h2>Featured photoshoots</h2></div>
          <a href="/albums" data-link class="link-arrow">All albums →</a>
        </div>
        <div class="noth-work-list">${feat.map(nothWorkCard).join("")}</div>
        ${SHOOTS.filter(s => s.type !== "Workshop Attended").length > feat.length ? `
        <div class="works-all-cta reveal">
          <a href="/albums" data-link class="btn btn-dark">View all ${SHOOTS.filter(s => s.type !== "Workshop Attended").length} albums →</a>
        </div>
        ` : ""}
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
              <p style="font-family: 'Georgia', serif; font-size: 15px; font-style: italic; line-height: 1.6; color: var(--ink); margin: 0;">“${esc(t.quote)}”</p>
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <strong style="font-family: 'Archivo', sans-serif; font-size: 13px; color: var(--ink);">${esc(t.by)}</strong>
                <span style="font-size: 11px; color: var(--ink-soft); font-family: var(--mono-font);">${esc(t.meta)} ${t.season ? `· ${esc(t.season)}` : ""}</span>
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
      <div style="position: sticky; top: 70px; z-index: 30; background: rgba(250,250,250,0.85); backdrop-filter: blur(12px); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 12px 0; margin-bottom: 24px;">
        <div class="container" style="display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px;">
          <button type="button" class="album-filter-pill active" data-filter="all" onclick="window.filterAlbumGrid('all', this)" style="font-family: var(--mono-font); font-size: 11px; font-weight: 700; padding: 6px 14px; border-radius: 20px; border: 1px solid var(--accent); background: var(--accent); color: #fff; cursor: pointer; white-space: nowrap;">🌐 All Albums (${counts.all})</button>
          ${counts.fashion ? `<button type="button" class="album-filter-pill" data-filter="fashion" onclick="window.filterAlbumGrid('fashion', this)" style="font-family: var(--mono-font); font-size: 11px; font-weight: 700; padding: 6px 14px; border-radius: 20px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; white-space: nowrap;">👗 Fashion (${counts.fashion})</button>` : ''}
          ${counts.commercial ? `<button type="button" class="album-filter-pill" data-filter="commercial" onclick="window.filterAlbumGrid('commercial', this)" style="font-family: var(--mono-font); font-size: 11px; font-weight: 700; padding: 6px 14px; border-radius: 20px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; white-space: nowrap;">💼 Commercial (${counts.commercial})</button>` : ''}
          ${counts.tfp ? `<button type="button" class="album-filter-pill" data-filter="tfp" onclick="window.filterAlbumGrid('tfp', this)" style="font-family: var(--mono-font); font-size: 11px; font-weight: 700; padding: 6px 14px; border-radius: 20px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; white-space: nowrap;">🤝 Selective Collab (${counts.tfp})</button>` : ''}
          ${counts.test ? `<button type="button" class="album-filter-pill" data-filter="test" onclick="window.filterAlbumGrid('test', this)" style="font-family: var(--mono-font); font-size: 11px; font-weight: 700; padding: 6px 14px; border-radius: 20px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; white-space: nowrap;">📸 Test Shoots (${counts.test})</button>` : ''}
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
    const album = SHOOTS.find(s => s.id === albumId);
    if (!album || !album.isPublic) {
      return `
        <section class="page-head">
          <div class="container">
            <h1 class="kinetic-h1">Album not found</h1>
            <p class="page-sub reveal">The album you're looking for doesn't exist.</p>
            <a href="/" data-link class="btn btn-dark">Back home →</a>
          </div>
        </section>`;
    }
    CURRENT_VIEW_SHOOTS = [album];
    const title = getTalentCleanName(album.isCompCard ? album.talent : (album.title || "Untitled"));
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">Shared Album</p>
          <h1 class="kinetic-h1">${esc(title)}</h1>
          ${album.description ? `<p class="page-sub reveal">${esc(album.description)}</p>` : ""}
        </div>
      </section>
      <section class="section container full-bleed">
        <div class="noth-work-list">${nothWorkCard(album, 0)}</div>
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
          <div style="display:flex; justify-content:space-between; align-items:baseline; gap:10px; font-size:12.5px;">
            <span style="font-weight:600; color:var(--ink);">${esc(i.label)}</span>
            <span style="font-family:'JetBrains Mono', monospace; font-size:11px; color:var(--ink-soft); font-variant-numeric: tabular-nums; flex:0 0 auto;">${i.count}</span>
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
    const emptyNote = `<p class="page-sub" style="font-size:13px; margin:0;">No views recorded yet.</p>`;
    container.innerHTML = `
      <div style="padding:18px 22px; border:1px solid var(--line); border-radius:8px; background:var(--bone); display:inline-flex; flex-direction:column; gap:4px; margin-bottom:36px;">
        <span style="font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:var(--ink-soft);">Total Views</span>
        <span style="font-size:30px; font-weight:800; color:var(--ink); font-variant-numeric: tabular-nums;">${data.totalViews ?? 0}</span>
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:40px;">
        <div>
          <h3 style="font-family:'Outfit', sans-serif; font-size:16px; font-weight:700; margin:0 0 16px; color:var(--ink);">Views by Category</h3>
          ${catItems.length ? rankedBarsHtml(catItems) : emptyNote}
        </div>
        <div>
          <h3 style="font-family:'Outfit', sans-serif; font-size:16px; font-weight:700; margin:0 0 16px; color:var(--ink);">Top Shoots</h3>
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
          <button type="button" id="analyticsLoadBtn" class="btn btn-dark" style="font-family:'JetBrains Mono', monospace; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; font-size:12px; height:auto; padding:12px 20px;">Load Analytics →</button>
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
  const savedCalSettings = (() => {
    try {
      return JSON.parse(localStorage.getItem("wps-calendar-settings") || "{}");
    } catch (e) {
      return {};
    }
  })();

  window.WPS_DATA.CALENDAR_SETTINGS = Object.assign({
    customBlockedDates: {},
    customOpenedDates: {},
    bookedDates: {}
  }, window.WPS_DATA.CALENDAR_SETTINGS || {}, savedCalSettings);

  function saveCalendarSettings() {
    try {
      localStorage.setItem("wps-calendar-settings", JSON.stringify(window.WPS_DATA.CALENDAR_SETTINGS));
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

  sanitizeCalendarBookings();
  syncCalendarWithShoots();

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

    const hasConfirmedBooking = bookings.some(b => !isTentativeBooking(b) && !isWorkshopBooking(b) && !isAssistingBooking(b));
    const isTentativeOnly = isBooked && !hasConfirmedBooking && bookings.some(b => isTentativeBooking(b));
    const hasWorkshop = bookings.some(b => isWorkshopBooking(b));
    const hasAssisting = bookings.some(b => isAssistingBooking(b));
    
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
      links: Array.isArray(bookingObj.links) ? bookingObj.links : (bookingObj.links ? [bookingObj.links] : []),
      attachments: Array.isArray(bookingObj.attachments) ? bookingObj.attachments : [],
      status: bookingObj.status || (bookingObj.isTentative ? "tentative" : "confirmed"),
      contractVersion: bookingObj.contractVersion || (bookingObj.agreedToTerms ? "V3.2" : "Pending Agreement"),
      agreedToTerms: bookingObj.agreedToTerms !== undefined ? bookingObj.agreedToTerms : (bookingObj.contractVersion && bookingObj.contractVersion !== "Pending Agreement"),
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
          agreedToTerms: updatedObj.agreedToTerms !== undefined ? updatedObj.agreedToTerms : cur.agreedToTerms
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
      settings.bookedDates[dKey] = settings.bookedDates[dKey].filter(b => b.id !== bookingId && b.name !== bookingId);
      if (!settings.bookedDates[dKey].length) {
        delete settings.bookedDates[dKey];
      }
      saveCalendarSettings();
    }
  }

  /* ============================================================
     § ADMIN CALENDAR & BOOKING MANAGEMENT PAGE (/calendar)
     ============================================================ */
  function viewCalendar() {
    return `
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">🔒 Admin Calendar &amp; Roster</p>
          ${kineticH1("Studio Availability", "kinetic-h1-wide")}
          <p class="page-sub reveal" style="max-width: 650px; line-height: 1.6; opacity: 1 !important; visibility: visible !important; transform: none !important;">Manage studio booking dates, block/open specific days, view upcoming client bookings, and handle double-bookings. By default, Monday–Friday are blocked for clients; Saturday–Sunday are open.</p>
        </div>
      </section>
      <section class="section container admin-calendar-wrap">
        <div class="admin-calendar-header">
          <div class="admin-cal-nav">
            <button type="button" class="admin-cal-btn" id="adminCalPrev">‹ Prev</button>
            <h2 class="admin-cal-title" id="adminCalMonthTitle">Loading...</h2>
            <button type="button" class="admin-cal-btn" id="adminCalNext">Next ›</button>
            <button type="button" class="admin-cal-btn" id="adminCalToday">Today</button>
          </div>
          <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 6px; background: var(--bone); padding: 4px 8px; border-radius: 20px; border: 1px solid var(--line); font-family: var(--mono-font); font-size: 11px;">
              <span style="font-weight: 700; color: var(--ink-soft); margin-right: 4px;">💳 Payment Terms:</span>
              <button type="button" id="adminPay5050Btn" class="admin-cal-btn" style="padding: 4px 10px; border-radius: 12px; font-size: 10px; cursor: pointer;">50/50</button>
              <button type="button" id="adminPay503020Btn" class="admin-cal-btn" style="padding: 4px 10px; border-radius: 12px; font-size: 10px; cursor: pointer;">50/30/20</button>
            </div>
            <button type="button" class="admin-cal-btn primary" id="adminCalNewBookingBtn">+ Add Manual Booking</button>
            <button type="button" class="admin-cal-btn" id="adminCalResetBtn">Reset Rules</button>
          </div>
        </div>

        <div style="display: flex; gap: 16px; margin-bottom: 20px; font-family: var(--mono-font); font-size: 11px; flex-wrap: wrap;">
          <span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 2px; background: #e8f5e9; border: 1px solid #2e7d32;"></span> Open for Booking (Weekend/Opened)</span>
          <span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 2px; background: #eee; border: 1px dashed #999;"></span> Blocked for Clients (Mon–Fri Default / Custom)</span>
          <span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 2px; background: var(--accent-soft); border: 1px solid var(--accent);"></span> Confirmed Booking (Red/Orange)</span>
          <span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 2px; background: rgba(124, 77, 255, 0.2); border: 1px dashed #7c4dff;"></span> ⏳ Anticipated Hold Only (Royal Purple/Blue)</span>
        </div>

                <div style="background: var(--bone); border: 1px solid var(--accent); border-radius: 8px; padding: 14px 18px; margin-bottom: 16px; font-family: var(--mono-font);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
            <h3 style="font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700; color: var(--ink); margin: 0; display: flex; align-items: center; gap: 8px;">
              ⚙️ Studio Package Rates &amp; Deliverables Editor (No-Code Admin Control)
            </h3>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <span id="adminPricingSaveStatus" style="font-size: 11px; font-weight: 700; color: #059669; background: rgba(5,150,105,0.12); padding: 4px 10px; border-radius: 12px; border: 1px solid #059669; font-family: var(--mono-font); transition: all 0.3s ease;">🟢 ALL CHANGES SAVED TO LIVE SITE</span>
              <button type="button" class="admin-cal-btn primary" onclick="window.saveAdminCustomPackages()" style="font-size: 11px; padding: 4px 12px; font-weight: 700;">💾 Save All Changes &amp; Push Live</button>
              <button type="button" class="admin-cal-btn" onclick="window.resetAdminCustomPackages()" style="font-size: 11px; padding: 4px 12px; font-weight: 700;">🔄 Reset Defaults</button>
            </div>
          </div>
          <p style="font-size: 11px; color: var(--ink-soft); margin: 0 0 12px 0;">
            Edit max package rates (INR), package names, or deliverable descriptions below without coding. Click <strong>Save Pricing Changes</strong> to update live across all booking forms!
          </p>
          <div id="adminPackagesEditorGrid" style="display: flex; flex-direction: column; gap: 8px;"></div>
        </div>

        <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 8px; padding: 14px 18px; margin-bottom: 16px; font-family: var(--mono-font); font-size: 11px;">
          <div style="font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700; color: var(--ink); margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <span style="display: flex; align-items: center; gap: 8px;">🎟️ Studio Promotional Discount &amp; Invite Codes Manager (No-Code Admin Control)</span>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button type="button" onclick="window.copyInviteCodeToClipboard()" style="font-size: 11px; color: var(--accent); font-weight: 700; background: rgba(255,69,0,0.1); padding: 4px 12px; border-radius: 12px; border: 1px solid var(--accent); cursor: pointer; font-family: var(--mono-font);" title="Click to copy invite code">🔑 Copy Invite Code</button>
              <button type="button" class="admin-cal-btn primary" onclick="window.addNewAdminPromoCode()" style="font-size: 11px; padding: 4px 12px; font-weight: 700;">+ Add New Promo Code</button>
            </div>
          </div>
          <div id="adminPromoCodesGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px;"></div>
        </div>

        <div id="adminCalGridContainer"></div>

        <div class="booking-roster-sec">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <h2 style="font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 700; margin: 0;">Upcoming Client Bookings Roster</h2>
            <span id="rosterCountBadge" style="font-family: var(--mono-font); font-size: 11px; font-weight: 700; color: var(--accent);"></span>
          </div>
          <div id="bookingRosterGrid" class="booking-roster-grid"></div>
        </div>

        <!-- Studio Contract & Legal Vault Archive -->
        <div class="contract-archive-sec" style="margin-top: 48px; border-top: 1px solid var(--line); padding-top: 36px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
            <div>
              <p class="eyebrow" style="margin-bottom: 4px; color: var(--accent);">Legal Compliance &amp; Version Control</p>
              <h2 style="font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 700; margin: 0;">📜 Studio Contract &amp; Terms Vault</h2>
            </div>
            <span style="font-family: var(--mono-font); font-size: 11px; font-weight: 700; color: var(--accent); background: var(--accent-soft); padding: 4px 10px; border-radius: 4px; border: 1px solid var(--accent);">6 Historical Contract Versions Preserved</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
            <!-- V3.3 Commercial Current -->
            <div style="background: var(--paper); border: 1.5px solid var(--accent); border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm);">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-family: var(--mono-font); font-size: 10px; background: var(--accent); color: #fff; padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.3 COMMERCIAL (ACTIVE)</span>
                <span style="font-size: 11px; color: var(--ink-soft); font-family: var(--mono-font);">Aug 2026 – Present</span>
              </div>
              <h3 style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; margin: 12px 0 6px;">💼 Commercial Shoot Agreement V3.3</h3>
              <p style="font-size: 12px; color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Dedicated contract for Paid Commercial, Editorial, Fashion &amp; Brand productions. Covers 50/50 &amp; 50/30/20 non-refundable retainer milestones, commercial licensing, outstation travel (>20km), camera gear &amp; media protection, and photography specialization.</p>
              <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.3-COMMERCIAL')" style="font-size: 11px; flex: 1; font-weight: 700;">👁 Review Commercial</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '')" style="font-size: 11px; border-color: var(--accent); color: var(--accent); font-weight: 700;">📄 Print PDF</button></div>
            </div>

            <!-- V3.3 TFP Current -->
            <div style="background: var(--paper); border: 1.5px solid #059669; border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm);">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-family: var(--mono-font); font-size: 10px; background: #059669; color: #fff; padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.3 TFP / TEST SHOOT (ACTIVE)</span>
                <span style="font-size: 11px; color: var(--ink-soft); font-family: var(--mono-font);">Aug 2026 – Present</span>
              </div>
              <h3 style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; margin: 12px 0 6px;">📸 Test Shoot &amp; TFP Release V3.3</h3>
              <p style="font-size: 12px; color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Dedicated agreement for Selective Collaborations &amp; Test Shoots unlocked via Photographer Invite Codes. Covers non-commercial portfolio licensing, 8-12 retouched deliverable caps, mandatory Instagram tag credits (@nerdyphotographer.in), studio rental at actuals, physical liability waiver, and gear protection.</p>
              <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.3-TFP')" style="font-size: 11px; flex: 1; font-weight: 700; background: #059669; border-color: #059669;">👁 Review TFP Release</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.3-TFP')" style="font-size: 11px; border-color: #059669; color: #059669; font-weight: 700;">📄 Print PDF</button></div>
            </div>

            <!-- V3.2 -->
            <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-family: var(--mono-font); font-size: 10px; background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.2 (ARCHIVED)</span>
                <span style="font-size: 11px; color: var(--ink-soft); font-family: var(--mono-font);">May 2026 – August 2026</span>
              </div>
              <h3 style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; margin: 12px 0 6px;">Studio Release &amp; Payment Terms V3.2</h3>
              <p style="font-size: 12px; color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Archived terms including 50/50 &amp; 50/30/20 milestones, RAW file delivery exclusion, Test Shoot specs (Full Proofing + 8-12 Retouched), Studio Space Rental policy, and social media attribution workflow.</p>
              <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.2')" style="font-size: 11px; flex: 1; font-weight: 700;">👁 Review V3.2</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.2')" style="font-size: 11px; border-color: var(--accent); color: var(--accent); font-weight: 700;">📄 Print PDF</button></div>
            </div>

            <!-- V3.1 -->
            <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-family: var(--mono-font); font-size: 10px; background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.1 (ARCHIVED)</span>
                <span style="font-size: 11px; color: var(--ink-soft); font-family: var(--mono-font);">May 2026 – Jul 2026</span>
              </div>
              <h3 style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; margin: 12px 0 6px;">TFP Production &amp; Portfolio Release V3.1</h3>
              <p style="font-size: 12px; color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Standard TFP portfolio licensing, model release, basic liability waiver, and mandatory credit block requirement.</p>
              <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.1')" style="font-size: 11px; flex: 1; font-weight: 700;">👁 Review V3.1</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.1')" style="font-size: 11px; border-color: var(--accent); color: var(--accent); font-weight: 700;">📄 Print PDF</button></div>
            </div>

            <!-- V3.0 -->
            <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-family: var(--mono-font); font-size: 10px; background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V3.0 (ARCHIVED)</span>
                <span style="font-size: 11px; color: var(--ink-soft); font-family: var(--mono-font);">Jan 2026 – Apr 2026</span>
              </div>
              <h3 style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; margin: 12px 0 6px;">Creative Collab &amp; Release V3.0</h3>
              <p style="font-size: 12px; color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Initial Time-For-Print collab structure, non-exclusive social media usage license, and studio rules.</p>
              <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V3.0')" style="font-size: 11px; flex: 1; font-weight: 700;">👁 Review V3.0</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V3.0')" style="font-size: 11px; border-color: var(--accent); color: var(--accent); font-weight: 700;">📄 Print PDF</button></div>
            </div>

            <!-- V2.0 -->
            <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-family: var(--mono-font); font-size: 10px; background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V2.0 (ARCHIVED)</span>
                <span style="font-size: 11px; color: var(--ink-soft); font-family: var(--mono-font);">Jun 2025 – Dec 2025</span>
              </div>
              <h3 style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; margin: 12px 0 6px;">Studio Model Release V2.0</h3>
              <p style="font-size: 12px; color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Early model release agreement covering digital distribution, copyright ownership, and promo usage.</p>
              <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V2.0')" style="font-size: 11px; flex: 1; font-weight: 700;">👁 Review V2.0</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V2.0')" style="font-size: 11px; border-color: var(--accent); color: var(--accent); font-weight: 700;">📄 Print PDF</button></div>
            </div>

            <!-- V1.0 -->
            <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-family: var(--mono-font); font-size: 10px; background: var(--bone); border: 1px solid var(--line); color: var(--ink-soft); padding: 3px 8px; border-radius: 4px; font-weight: 700;">V1.0 (ARCHIVED)</span>
                <span style="font-size: 11px; color: var(--ink-soft); font-family: var(--mono-font);">Jan 2025 – May 2025</span>
              </div>
              <h3 style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; margin: 12px 0 6px;">Basic Photography Release V1.0</h3>
              <p style="font-size: 12px; color: var(--ink-soft); line-height: 1.5; margin-bottom: 16px;">Foundational photo release and copyright acknowledgment for early studio testing.</p>
              <div style="display: flex; gap: 8px;"><button type="button" class="admin-cal-btn primary" onclick="window.openContractArchiveModal('V1.0')" style="font-size: 11px; flex: 1; font-weight: 700;">👁 Review V1.0</button><button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('', '', 'V1.0')" style="font-size: 11px; border-color: var(--accent); color: var(--accent); font-weight: 700;">📄 Print PDF</button></div>
            </div>
          </div>
        </div>
      </section>
      <div id="dateAdminModalContainer"></div>
    `;
  }

  function wireCalendar() {
    function renderAdminPackagesEditor() {
      const promoGrid = $("#adminPromoCodesGrid");
      if (promoGrid) {
        const codes = getAdminPromoCodes();
        const activeInviteCode = typeof window.getAdminInviteCode === "function" ? window.getAdminInviteCode() : "NERDY-INVITE";

        const creatorFormHtml = `
          <div id="promoCreatorForm" style="grid-column: 1 / -1; display: none; background: var(--paper); border: 1.5px solid var(--accent); border-radius: 8px; padding: 16px 18px; margin-bottom: 8px; box-shadow: var(--shadow-sm); animation: modalFadeIn 0.3s ease;">
            <div style="font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700; color: var(--ink); margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
              <span>🎟️ Create New Custom Promotional Discount Code</span>
              <button type="button" onclick="document.getElementById('promoCreatorForm').style.display='none'" style="background:none; border:none; color:var(--ink-soft); font-size:16px; cursor:pointer;">✕</button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; align-items: flex-end;">
              <div>
                <label style="font-size: 10px; font-weight: 700; color: var(--accent); text-transform: uppercase; display: block; margin-bottom: 4px;">Promo Code String *</label>
                <input type="text" id="newPromoName" placeholder="e.g. SUMMER30" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-weight: 700; font-family: var(--mono-font); text-transform: uppercase; background: var(--bone); color: var(--ink);" />
              </div>
              <div>
                <label style="font-size: 10px; font-weight: 700; color: var(--accent); text-transform: uppercase; display: block; margin-bottom: 4px;">Discount Type *</label>
                <select id="newPromoType" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: 12px; font-weight: 700; background: var(--bone); color: var(--ink);">
                  <option value="pct">Percentage Off (%)</option>
                  <option value="flat">Flat Amount (INR ₹)</option>
                </select>
              </div>
              <div>
                <label style="font-size: 10px; font-weight: 700; color: var(--accent); text-transform: uppercase; display: block; margin-bottom: 4px;">Value Amount *</label>
                <input type="number" id="newPromoVal" placeholder="e.g. 30 or 1500" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-weight: 700; color: #059669; background: var(--bone);" />
              </div>
              <div style="grid-column: span 2;">
                <label style="font-size: 10px; font-weight: 700; color: var(--accent); text-transform: uppercase; display: block; margin-bottom: 4px;">Description Label</label>
                <input type="text" id="newPromoDesc" placeholder="e.g. 30% Off Summer Shoots" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-size: 12px; background: var(--bone); color: var(--ink);" />
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
            <div style="background: var(--paper); border: 1px solid var(--accent); border-radius: 6px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; box-shadow: var(--shadow-sm);">
              <div>
                <span style="font-size: 9px; font-weight: 800; color: var(--accent); text-transform: uppercase; font-family: var(--mono-font); display: block;">${idx === 0 ? '⭐ Primary Code' : '🔑 VIP Invite'}</span>
                <strong style="font-size: 13.5px; font-family: var(--mono-font); color: var(--ink); letter-spacing: 0.04em; display: block; margin-top: 1px;">${esc(codeStr)}</strong>
                <div style="font-size: 11px; color: var(--ink-soft); margin-top: 4px; line-height: 1.3;">📝 ${esc(descStr)}</div>
              </div>
              <div style="display: flex; gap: 4px; align-items: center; flex-shrink: 0;">
                <button type="button" onclick="navigator.clipboard.writeText('${esc(codeStr)}'); if(typeof toast==='function') toast('📋 Invite Code ${esc(codeStr)} copied!'); else alert('Copied!');" style="background: var(--accent); color: #ffffff; border: none; padding: 4px 8px; border-radius: 4px; font-size: 9.5px; cursor: pointer; font-weight: 700; font-family: var(--mono-font);" title="Copy Invite Code">📋 Copy</button>
                <button type="button" onclick="window.editAdminInviteCode('${esc(codeStr)}')" style="background: var(--bone); color: var(--ink); border: 1px solid var(--line); padding: 4px 6px; border-radius: 4px; font-size: 9.5px; cursor: pointer; font-weight: 700;" title="Edit Code">✏️ Edit</button>
                <button type="button" onclick="window.deleteAdminInviteCode('${esc(codeStr)}')" style="background: rgba(255,77,77,0.1); color: #ff4d4d; border: 1px solid rgba(255,77,77,0.3); padding: 4px 6px; border-radius: 4px; font-size: 9.5px; cursor: pointer; font-weight: 700;" title="Delete Code">🗑️</button>
              </div>
            </div>
          `;
        }).join("");

        const inviteCardHtml = `
          <div style="grid-column: 1 / -1; background: rgba(255, 69, 0, 0.06); border: 1.5px solid var(--accent); border-radius: 10px; padding: 16px 18px; margin-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
              <div>
                <div style="font-size: 11px; font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em;">🔑 Photographer Direct Invite Codes (VIP / TFP Unlock Manager)</div>
                <div style="font-size: 11px; color: var(--ink-soft); margin-top: 2px;">Create, edit, auto-generate, or delete multiple active invite codes. Invited talent entering ANY active code on /book unlocks a Test Shoot / TFP session.</div>
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button type="button" onclick="window.addNewAdminInviteCode()" class="admin-cal-btn primary" style="font-size: 11px; padding: 5px 12px; font-weight: 700;">➕ Add Custom Code</button>
                <button type="button" onclick="window.generateRandomAdminInviteCode()" class="admin-cal-btn" style="font-size: 11px; padding: 5px 12px; font-weight: 700; border-color: var(--accent); color: var(--accent);">🎲 Auto-Generate Random VIP Code</button>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px;">
              ${inviteItemsHtml}
            </div>
          </div>
        `;

        const codeCardsHtml = Object.keys(codes).map(codeKey => {
          const item = codes[codeKey];
          const tagDesc = item.flat ? `Flat ₹${item.flat.toLocaleString('en-IN')} Off` : `${item.pct}% Off`;
          return `
            <div style="background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 10px; box-shadow: var(--shadow-sm);">
              <div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <strong style="color: #059669; font-size: 13px; font-family: var(--mono-font); letter-spacing: 0.04em;">${esc(codeKey)}</strong>
                  <span style="font-size: 9px; font-weight: 700; background: rgba(5,150,105,0.12); color: #059669; padding: 2px 6px; border-radius: 4px;">${esc(tagDesc)}</span>
                </div>
                <div style="font-size: 11px; color: var(--ink-soft); margin-top: 2px;">${esc(item.label)}</div>
              </div>
              <div style="display: flex; gap: 4px; align-items: center;">
                <button type="button" onclick="navigator.clipboard.writeText('${esc(codeKey)}'); if(typeof toast==='function') toast('📋 Promo Code ${esc(codeKey)} copied!'); else alert('Copied!');" style="background: #059669; color: #ffffff; border: none; padding: 5px 10px; border-radius: 4px; font-size: 10px; cursor: pointer; font-weight: 700; font-family: var(--mono-font);" title="Copy Code">📋 Copy</button>
                <button type="button" onclick="window.editAdminPromoCode('${esc(codeKey)}')" style="background: var(--bone); color: var(--ink); border: 1px solid var(--line); padding: 5px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; font-weight: 700;" title="Edit Code">✏️ Edit</button>
                <button type="button" onclick="window.deleteAdminPromoCode('${esc(codeKey)}')" style="background: rgba(255,77,77,0.1); color: #ff4d4d; border: 1px solid rgba(255,77,77,0.3); padding: 5px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; font-weight: 700;" title="Delete Code">🗑️</button>
              </div>
            </div>
          `;
        }).join("");

        promoGrid.innerHTML = inviteCardHtml + creatorFormHtml + codeCardsHtml;
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
            <span style="font-size: 10px; font-weight: 700; color: var(--accent); display: block; margin-bottom: 4px; text-transform: uppercase;">Package Name #${idx+1}</span>
            <input type="text" class="pkg-edit-name" value="${esc(p.name)}" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: 12px; font-weight: 700; background: var(--bone); color: var(--ink);" />
          </div>
          <div>
            <span style="font-size: 10px; font-weight: 700; color: var(--accent); display: block; margin-bottom: 4px; text-transform: uppercase;">Max Rate (INR ₹)</span>
            <input type="number" class="pkg-edit-price" value="${p.price}" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: 12px; font-weight: 800; color: #059669; background: var(--bone);" />
          </div>
          <div>
            <span style="font-size: 10px; font-weight: 700; color: var(--accent); display: block; margin-bottom: 4px; text-transform: uppercase;">Deliverable Specs</span>
            <input type="text" class="pkg-edit-specs" value="${esc(p.specs)}" style="width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: 12px; background: var(--bone); color: var(--ink);" />
          </div>
          <div style="display: flex; gap: 4px; justify-content: flex-end; padding-top: 14px;">
            <button type="button" class="admin-cal-btn" onclick="window.copyPackageBookingLink(${p.price})" title="Copy Shareable Booking Link" style="font-size: 11px; padding: 6px 8px; border-color: var(--accent); color: var(--accent); font-weight: 700;">🔗 Share Link</button>
            <button type="button" class="admin-cal-btn" onclick="window.moveAdminPackageRow(${idx}, -1)" title="Move Up" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:not-allowed; padding:6px 8px; font-size:11px;"' : 'style="padding:6px 8px; font-size:11px;"'}>▲</button>
            <button type="button" class="admin-cal-btn" onclick="window.moveAdminPackageRow(${idx}, 1)" title="Move Down" ${idx === pkgs.length - 1 ? 'disabled style="opacity:0.3; cursor:not-allowed; padding:6px 8px; font-size:11px;"' : 'style="padding:6px 8px; font-size:11px;"'}>▼</button>
            <button type="button" class="admin-cal-btn" onclick="window.deleteAdminPackageRow(${idx})" title="Delete Package Tier" style="color: #b22222; border-color: rgba(178,34,34,0.3); padding: 6px 8px; font-size: 11px;">🗑️</button>
          </div>
        </div>
      `).join("") + `
        <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <button type="button" class="admin-cal-btn primary" onclick="window.addNewAdminPackageRow()" style="font-size: 11px; padding: 6px 14px; font-weight: 700;">➕ Add New Package Tier (Currently ${pkgs.length} Tiers)</button>
          <span style="font-size: 11px; color: var(--ink-soft); font-family: var(--mono-font);">Supports 1 to 10+ dynamic package tiers with sequence controls (▲ Move Up / ▼ Move Down / 🗑️ Delete).</span>
        </div>
      `;
    }

    let calYear = new Date().getFullYear();
    let calMonth = new Date().getMonth();

    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

    function renderAdminGrid() {
      const container = $("#adminCalGridContainer");
      const title = $("#adminCalMonthTitle");
      if (!container || !title) return;

      title.textContent = `${MONTHS[calMonth]} ${calYear}`;

      window.jumpToCalMonth = function(yr, mo) {
        calYear = yr;
        calMonth = mo;
        renderAdminGrid();
      };

      const jumpBar = $("#adminCalMonthJumpBar");
      if (jumpBar) {
        const activeMonths = [
          { yr: 2026, mo: 2, label: "Mar 2026" },
          { yr: 2026, mo: 4, label: "May 2026" },
          { yr: 2026, mo: 5, label: "Jun 2026" },
          { yr: 2026, mo: 6, label: "Jul 2026" },
          { yr: 2026, mo: 7, label: "Aug 2026" }
        ];
        jumpBar.innerHTML = activeMonths.map(m => `
          <button type="button" class="admin-cal-btn" style="padding: 3px 8px; font-size: 10px; font-family: var(--mono-font); ${calYear === m.yr && calMonth === m.mo ? 'background: var(--accent); color: #fff; font-weight: 700; border-color: var(--accent);' : ''}" onclick="window.jumpToCalMonth(${m.yr}, ${m.mo})">${m.label}</button>
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
        
        if (status.hasWorkshop && !status.hasConfirmedBooking) {
          dayClasses.push("day-workshop");
        } else if (status.hasAssisting && !status.hasConfirmedBooking) {
          dayClasses.push("day-assisting");
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
              ${status.hasWorkshop && !status.hasConfirmedBooking ? `<span class="admin-cal-badge badge-workshop">📚 Workshop</span>` :
                status.hasAssisting && !status.hasConfirmedBooking ? `<span class="admin-cal-badge badge-assisting">🤝 Assisting</span>` :
                status.hasConfirmedBooking ? `<span class="admin-cal-badge badge-booked">${status.bookings.length} Booked</span>` :
                status.isTentativeOnly ? `<span class="admin-cal-badge badge-tentative">⏳ Hold (${status.bookings.length})</span>` :
                status.isBlocked ? `<span class="admin-cal-badge badge-blocked">${status.isDefaultBlockedWeekday ? "Weekday Blocked" : "Custom Blocked"}</span>` :
                `<span class="admin-cal-badge badge-open">Open</span>`
              }
            </div>
            <div>
              ${status.bookings.map(b => `<div class="admin-cal-client-item" title="${esc(b.name)} - ${esc(b.type)}">${b.status === "workshop" ? "📚" : b.status === "assisting" ? "🤝" : (b.isTentative || b.status === "tentative") ? "⏳" : "👤"} ${esc(b.name)}</div>`).join("")}
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

      allBookings.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

      if (countBadge) countBadge.textContent = `${allBookings.length} Total Booking${allBookings.length !== 1 ? "s" : ""}`;

      if (!allBookings.length) {
        rosterGrid.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 32px; text-align: center; color: var(--ink-soft); font-family: var(--mono-font); font-size: 13px; background: var(--bone); border-radius: var(--r-sm);">
            No upcoming client bookings recorded yet. Click any date on the calendar above or use "+ Add Manual Booking".
          </div>
        `;
        return;
      }

      rosterGrid.innerHTML = allBookings.map(b => `
        <div class="booking-card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <div class="booking-card-date">📅 ${esc(b.dateKey)}</div>
            <div style="display:flex; gap:6px; align-items:center;">
              ${b.status === "workshop" ? `<span style="background: rgba(249,168,37,0.15); border: 1px solid rgba(249,168,37,0.5); border-radius: 4px; padding: 2px 7px; font-family: var(--mono-font); font-size: 10px; font-weight: 700; color: #f9a825;">📚 Workshop</span>` : b.status === "assisting" ? `<span style="background: rgba(0,137,123,0.15); border: 1px solid rgba(0,137,123,0.5); border-radius: 4px; padding: 2px 7px; font-family: var(--mono-font); font-size: 10px; font-weight: 700; color: #00897b;">🤝 Assisting</span>` : (b.isTentative || b.status === "tentative") ? `<span style="background: rgba(255,152,0,0.15); border: 1px solid rgba(255,152,0,0.5); border-radius: 4px; padding: 2px 7px; font-family: var(--mono-font); font-size: 10px; font-weight: 700; color: #f57c00;">⏳ Anticipated Hold</span>` : `<span style="background: rgba(46,125,50,0.15); border: 1px solid rgba(46,125,50,0.5); border-radius: 4px; padding: 2px 7px; font-family: var(--mono-font); font-size: 10px; font-weight: 700; color: #2e7d32;">✓ Confirmed</span>`}
              <span style="background:var(--bone); border:1px solid var(--line); border-radius:4px; padding:2px 7px; font-family:var(--mono-font); font-size:10px; font-weight:700; color:var(--accent);">⏱️ ${esc(b.duration || "Full Day")}</span>
            </div>
          </div>
          <h3 class="booking-card-name" style="margin-top:6px;">${esc(b.name)}</h3>
          <div class="booking-card-detail"><strong>Shoot Type:</strong> ${esc(b.type || "General Shoot")}</div>
          ${b.email ? `<div class="booking-card-detail"><strong>Email:</strong> ${esc(b.email)}</div>` : ""}
          ${b.phone ? `<div class="booking-card-detail"><strong>Phone:</strong> ${esc(b.phone)}</div>` : ""}
          ${b.notes ? `<div class="booking-card-detail" style="margin-top: 8px; font-style: italic; color: var(--ink);">"${esc(b.notes)}"</div>` : ""}
          ${b.links && b.links.length ? `
            <div class="booking-card-detail" style="margin-top:8px;">
              <strong>Reference Links (${b.links.length}):</strong>
              <div style="display:flex; flex-direction:column; gap:3px; margin-top:3px;">
                ${b.links.map(l => `<a href="${esc(l)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent); word-break:break-all; font-family:var(--mono-font); font-size:11px;">🔗 ${esc(l)} ↗</a>`).join("")}
              </div>
            </div>
          ` : ""}
          ${b.attachments && b.attachments.length ? `
            <div class="booking-card-detail" style="margin-top:8px;">
              <strong>Attachments (${b.attachments.length}):</strong>
              <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">
                ${b.attachments.map(att => `<a href="${esc(att.dataUrl)}" download="${esc(att.name)}" target="_blank" style="display:inline-flex; align-items:center; gap:4px; background:var(--bone); border:1px solid var(--line); border-radius:4px; padding:4px 8px; font-family:var(--mono-font); font-size:10px; color:var(--ink); text-decoration:none;">📄 ${esc(att.name)} (${Math.round(att.size/1024)} KB) ⬇</a>`).join("")}
              </div>
            </div>
          ` : ""}
          <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--line); font-size: 11px; color: var(--ink-soft); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
            <span>${(() => {
              const isNonContract = (b.type === "Assisting Photographer" || b.type === "Workshop Attended" || (b.title && (b.title.includes("Assisting") || b.title.includes("Workshop"))));
              if (isNonContract) {
                return `<span style="color: var(--ink-soft); font-weight: 600;">🛠️ Internal Activity (No Contract Required)</span>`;
              }
              const v = b.contractVersion || (b.agreedToTerms ? "V3.2" : "Pending Agreement");
              if (v === "Pending Agreement") return `<span style="color: #f57c00; font-weight: 700;">⏳ Agreement Pending (Not Signed Yet)</span>`;
              if (v === "Custom Contract") return `<span style="color: #7c4dff; font-weight: 700;">📄 Custom Client Contract / Brand MSA</span>`;
              return `📜 <strong>Agreed Term:</strong> ${esc(v)}`;
            })()}</span>
            ${(() => {
              const isNonContract = (b.type === "Assisting Photographer" || b.type === "Workshop Attended" || (b.title && (b.title.includes("Assisting") || b.title.includes("Workshop"))));
              if (isNonContract) return '';
              const v = b.contractVersion || (b.agreedToTerms ? "V3.2" : "Pending Agreement");
              return (v !== "Pending Agreement" && v !== "Custom Contract") ? `<button type="button" class="admin-cal-btn" onclick="window.openContractArchiveModal('${esc(v)}')" style="font-size: 9px; padding: 3px 8px;">View Terms Text ↗</button>` : '';
            })()}
          </div>
          <div style="margin-top: 12px; display: flex; gap: 10px; flex-wrap: wrap;">
            <button type="button" class="admin-cal-btn primary" onclick="window.openEditBookingModal('${b.dateKey}', '${b.id}')" style="font-family: var(--mono-font); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 14px; background: var(--accent); color: #fff; border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">✏️ Edit Booking</button>
            <button type="button" class="admin-cal-btn" onclick="window.removeBookingFromRoster('${b.dateKey}', '${b.id}')" style="font-family: var(--mono-font); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 14px; color: #ff4d4d; border: 1px solid rgba(255,77,77,0.4); background: rgba(255,77,77,0.1); border-radius: 4px; cursor: pointer;">Cancel Booking</button>
          </div>
        </div>
      `).join("");
    }

    window.removeBookingFromRoster = (dKey, bId) => {
      if (confirm(`Are you sure you want to remove this booking for ${dKey}?`)) {
        removeCalBooking(dKey, bId);
        toast("Booking removed.");
        renderAdminGrid();
        updateAdminReminders();
      }
    };

        window.WPS_CONTRACT_ARCHIVE = {
      "V3.3-COMMERCIAL": {
        version: "V3.3-COMMERCIAL",
        title: "Commercial Shoot & Release Agreement V3.3 (Paid Shoots)",
        effectiveDate: "August 2026 – Present",
        status: "Active / Current (Paid Commercial)",
        summary: "Dedicated contract for Paid Commercial, Editorial, Fashion & Brand productions. Covers 50/50 & 50/30/20 non-refundable retainer milestones, commercial licensing, outstation travel (>20km), camera gear & media protection, and photography specialization.",
        fullText: "1. SCOPE OF COMMERCIAL PRODUCTION & PAYMENT MILESTONES\nThis session is scheduled as a paid commercial production. Package rates cover photography creation, light design & master retouched deliverables. Standard bookings require a 50% advance retainer prior to shoot day start (non-refundable) and 50% final balance after shoot wrap prior to receiving downloadable master files (non-refundable). Commercial campaign bookings follow a 50/30/20 milestone structure.\n\n2. COMMERCIAL USAGE RIGHTS & INTELLECTUAL PROPERTY\nThe legal copyright of all visual media remains exclusively with the Studio. The Client is granted full commercial usage rights for digital advertising, website grids, social media campaigns, print catalogs, and brand marketing as specified in the agreed project scope. Under no circumstances are RAW unedited files delivered.\n\n3. STILL PHOTOGRAPHY SPECIALIZATION & VIDEO COVERAGE POLICY\nStudio packages and rate tiers are strictly dedicated to Still Photography creation (Commercial, Fashion, Editorial & Portfolio). Video / Reels coverage is not included in standard packages. Clients may bring their own videographer or request studio assistance to source a freelance videographer for the session.\n\n4. OUTSTATION LOCATION, TRAVEL & ACCOMMODATION (>20 KM FROM NOIDA)\nIf the shoot location is located beyond a 20 km radius from Noida (Delhi NCR), all travel expenses, local conveyance, outstation transport, tolls, and accommodation expenses incurred for the photographer (and core production team) shall be fully borne, arranged, or reimbursed by the client.\n\n5. CAMERA GEAR HANDS-OFF & DATA PROTECTION CLAUSE\nAll camera bodies, lenses, memory cards, tethering systems, and digital raw captures remain the exclusive physical and intellectual property of the Studio. Under no circumstances is a client or crew participant permitted to operate, touch, or delete media from the photographer's cameras or memory cards."
      },
      "V3.3-TFP": {
        version: "V3.3-TFP",
        title: "Test Shoot & TFP Liability Release V3.3 (Test Shoots)",
        effectiveDate: "August 2026 – Present",
        status: "Active / Current (Test Shoot / TFP)",
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

    
  window.openPdfContractGenerator = function(dKey, bookingId, preselectedVersion) {
    const settings = window.WPS_DATA?.CALENDAR_SETTINGS || {};
    const bookings = (settings.bookedDates && settings.bookedDates[dKey]) || [];
    const b = bookings.find(x => x.id === bookingId || x.name === bookingId) || {
      name: "",
      email: "",
      phone: "",
      type: "Fashion Editorial",
      duration: "Full Day",
      status: "confirmed",
      location: "Studio Space, Noida Sector 62 / Outdoor NCR",
      package: "₹10,000 Package — 50 Proof Clicks + 8 Retouched Master Clicks",
      notes: "Call time 9:00 AM. 3 wardrobe changes.",
      contractVersion: preselectedVersion || "V3.3"
    };

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

    modal.innerHTML = `
      <div class="modal-content" style="background: var(--paper); border: 1px solid var(--line); border-radius: 14px; max-width: 720px; width: 100%; max-height: 90vh; display: flex; flex-direction: column; box-shadow: var(--shadow); overflow: hidden; animation: modalFadeIn 0.3s ease;">
        <div style="padding: 20px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; background: var(--bone);">
          <div>
            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink);">📄 Generate PDF Contract &amp; Agreement</h3>
            <div style="font-size: 11px; color: var(--ink-soft); margin-top: 2px;">Prepare A4 PDF Contract for Off-Site &amp; DM/Email Bookings</div>
          </div>
          <button type="button" id="closePdfGenModal" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--ink-soft); padding: 4px;">✕</button>
        </div>

        <div style="padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px;">
          <div style="background: rgba(var(--accent-rgb), 0.05); border: 1px solid var(--accent); border-radius: 8px; padding: 12px; font-size: 11px; color: var(--ink); line-height: 1.5;">
            💡 <strong>Off-Site / DM Inquiry Workflow:</strong> Fill or edit the booking details below. Click <strong>🖨️ Print / Save as A4 PDF</strong> to download your official contract, then copy the <strong>Approval Message</strong> to paste into IG DM or Gmail!
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Client Name *
              <input type="text" id="pdf_clientName" value="${esc(b.name || '')}" placeholder="e.g. Rahul Sharma / Model Name" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
            </label>
            <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Instagram / Handle / Website
              <input type="text" id="pdf_instagram" value="${esc(b.instagram || b.handle || '')}" placeholder="e.g. @handle or website.com" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
            </label>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Client Email Address
              <input type="email" id="pdf_email" value="${esc(b.email || '')}" placeholder="client@example.com" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
            </label>
            <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Phone Number
              <input type="tel" id="pdf_phone" value="${esc(b.phone || '')}" placeholder="+91 98765-43210" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
            </label>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Shoot Date / Timeline *
              <input type="text" id="pdf_date" value="${esc(dVal)}" placeholder="YYYY-MM-DD or Mid-August" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
            </label>
            <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Shoot Duration
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
            <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Shoot Location Address *
              <input type="text" id="pdf_location" value="${esc(b.location || 'Studio Space, Noida / Outdoor NCR')}" placeholder="e.g. Sector 62 Studio, Noida / Client Venue" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
            </label>
            <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Contract Document Version *
              <select id="pdf_contractVersion" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
                <option value="V3.3" ${(b.contractVersion === 'V3.3' || (!b.contractVersion && !isTest)) ? 'selected' : ''}>📜 Commercial Shoot Contract V3.3 Active (50/50 + Gear Protection)</option>
                <option value="V3.3-TFP" ${(b.contractVersion === 'V3.3-TFP' || (isTest && !b.contractVersion)) ? 'selected' : ''}>📸 Test Shoot / TFP Release V3.3 Active (8-12 Retouched + Gear Protection)</option>
                <option value="V3.2" ${b.contractVersion === 'V3.2' ? 'selected' : ''}>📜 Archived Terms V3.2 (May 2026 – Aug 2026)</option>
                <option value="V3.1" ${b.contractVersion === 'V3.1' ? 'selected' : ''}>📜 Archived Terms V3.1 (May 2026 – Jul 2026)</option>
                <option value="V3.0" ${b.contractVersion === 'V3.0' ? 'selected' : ''}>📜 Archived Terms V3.0 (Jan 2026 – Apr 2026)</option>
                <option value="V2.0" ${b.contractVersion === 'V2.0' ? 'selected' : ''}>📜 Archived Terms V2.0 (Jun 2025 – Dec 2025)</option>
                <option value="V1.0" ${b.contractVersion === 'V1.0' ? 'selected' : ''}>📜 Archived Terms V1.0 (Jan 2025 – May 2025)</option>
                <option value="Custom Contract" ${b.contractVersion === 'Custom Contract' ? 'selected' : ''}>📄 Custom Client Contract / Brand MSA</option>
              </select>
            </label>
          </div>

          <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Package Tier &amp; Deliverables Specs *
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
            <div style="font-size: 11px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em;">🛠️ Bespoke Package Details &amp; Download Permissions</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Custom Package Name &amp; Price
                <input type="text" id="pdf_customPkgName" value="₹15,000 Commercial Retainer" placeholder="e.g. ₹15,000 Custom Brand Retainer" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
              </label>
              <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Retouched Master Clicks Included
                <input type="text" id="pdf_customRetouchedCount" value="8 Master Retouched Clicks" placeholder="e.g. 10 Retouched Master Clicks" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
              </label>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Unedited Gallery Download Permission
                <select id="pdf_customDownloadPermission" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
                  <option value="Proofing View Only (Download Restricted to Billed Retouched Clicks)" selected>Proofing View Only (Download Restricted to Contracted Retouched Clicks)</option>
                  <option value="Full Unedited Gallery Download Included">Full Unedited High-Res Gallery Download Included</option>
                </select>
              </label>
              <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Editing Revision Limit
                <select id="pdf_customRevisions" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
                  <option value="1 Round of Minor Revisions (Within 7 Days)" selected>1 Round of Minor Revisions (Within 7 Days)</option>
                  <option value="2 Rounds of Minor Revisions (Within 14 Days)">2 Rounds of Minor Revisions (Within 14 Days)</option>
                  <option value="No Revisions Included (Extra Revisions Billed at ₹1,500/image)">No Revisions Included (Billed at ₹1,500/image)</option>
                </select>
              </label>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Cloud Storage Archival Window *
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

          <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Payment Milestone Terms
            <select id="pdf_paymentMilestones" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
              <option value="5050">Standard 50/50 Milestones (50% Advance Retainer / 50% Final Balance prior to file download)</option>
              <option value="503020">3-Tier Campaign Milestones (50% Advance / 30% Proofing / 20% Final Deliverables)</option>
              <option value="tfp">TFP / Test Shoot Collab (0 Fee, Full Proofing Gallery + 8-12 Retouched Clicks)</option>
            </select>
          </label>

          <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Production Notes &amp; Call Time
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
        contractVersion: $("#pdf_contractVersion").value,
        package: $("#pdf_packageSelect").value === "custom" 
          ? `${$("#pdf_customCloudRetention").value === "custom" ? $("#pdf_customCloudRetentionInput").value.trim() : $("#pdf_customCloudRetention").value}"#pdf_customPkgName").value.trim()} — ${$("#pdf_customCloudRetention").value === "custom" ? $("#pdf_customCloudRetentionInput").value.trim() : $("#pdf_customCloudRetention").value}"#pdf_customRetouchedCount").value.trim()} (${$("#pdf_customCloudRetention").value === "custom" ? $("#pdf_customCloudRetentionInput").value.trim() : $("#pdf_customCloudRetention").value}"#pdf_customDownloadPermission").value}; ${$("#pdf_customCloudRetention").value === "custom" ? $("#pdf_customCloudRetentionInput").value.trim() : $("#pdf_customCloudRetention").value}"#pdf_customRevisions").value}; ${$("#pdf_customCloudRetention").value === "custom" ? $("#pdf_customCloudRetentionInput").value.trim() : $("#pdf_customCloudRetention").value}"#pdf_customCloudRetention").value})`
          : $("#pdf_packageSelect").value,
        paymentMilestones: $("#pdf_paymentMilestones").value,
        notes: $("#pdf_notes").value.trim()
      });
    });
  };

  window.printContractPdf = function(data) {
    const cVer = data.contractVersion || "V3.3";
    let archiveObj = window.WPS_CONTRACT_ARCHIVE[cVer];
    if (!archiveObj) {
      if (cVer === "V3.3-TFP") {
        archiveObj = window.WPS_CONTRACT_ARCHIVE["V3.3"];
      } else if (cVer === "Custom Contract") {
        archiveObj = {
          title: "Custom Client Contract / Master Services Agreement (MSA)",
          fullText: `1. MASTER SERVICES AGREEMENT (MSA) SCOPE\nThis production session is executed under the Client / Brand Provided Master Services Agreement (MSA) or custom contract agreed upon between the Studio and the Client.\n\n2. PRODUCTION BRIEF & DELIVERABLE SPECIFICATIONS\nSpecific shoot dates, locations, deliverable asset counts, retouched image limits, and payment milestone terms are governed by the Production Brief summary table above.\n\n3. UNAUTHORIZED CAMERA OPERATION & DATA PROTECTION\nAll studio camera bodies, memory cards, tethering systems, and raw captures remain confidential studio property. Participants are strictly prohibited from handling equipment or deleting media from studio cards.`
        };
      } else {
        archiveObj = window.WPS_CONTRACT_ARCHIVE["V3.3"];
      }
    }
    const contractText = archiveObj ? archiveObj.fullText : "";
    const isTfp = (data.paymentMilestones === "tfp" || cVer === "V3.3-TFP");

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
            <strong>📸 TFP Test Shoot Terms:</strong> This session is structured for mutual portfolio growth. Deliverables include a Full Proofing Gallery + 8 to 12 Retouched Master Clicks. RAW format files are strictly confidential studio property and are excluded. If a dedicated indoor studio venue space is requested, venue rental fees are billed at actuals (at cost).
          ` : `
            <strong>💳 Payment Milestones:</strong> ${data.paymentMilestones === '503020' ? '3-Tier Milestones (50% Advance Retainer / 30% Proofing / 20% Final Deliverables).' : 'Standard 50/50 Milestones (50% Advance Retainer prior to shoot start [non-refundable]; 50% Final Balance prior to file download [non-refundable]).'}<br/>
            <strong>🏢 Studio Venue Rental Policy:</strong> Dedicated indoor studio venue rentals are billed <strong>at actuals (at cost)</strong>, or the client may directly book their preferred studio space for the session.
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
              <strong>Method B — Physical Pen Signature:</strong><br/>
              <div style="margin-top: 10px;">Client Sign: <span style="border-bottom: 1.5px solid #000; display: inline-block; width: 130px; height: 12px;">&nbsp;</span></div>
              <div style="margin-top: 6px;">Date: <span style="border-bottom: 1.5px solid #000; display: inline-block; width: 130px; height: 12px;">&nbsp;</span></div>
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
              <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 17px; font-weight: 700; color: var(--ink);">${esc(contract.title)}</h3>
              <div style="font-size: 11px; color: var(--ink-soft); margin-top: 2px; font-family: var(--mono-font);">Effective: <strong>${esc(contract.effectiveDate)}</strong> · Status: <span style="color: var(--accent); font-weight:700;">${esc(contract.status)}</span></div>
            </div>
            <button type="button" onclick="document.getElementById('contractArchiveModal').style.display='none'" style="background:none; border:none; font-size: 20px; color: var(--ink-soft); cursor:pointer;">✕</button>
          </div>
          <div style="padding: 24px; overflow-y: auto; font-size: 13px; line-height: 1.6; color: var(--ink); text-align: left;">
            <div style="background: var(--bone); border: 1px solid var(--line); padding: 12px 16px; border-radius: 8px; font-size: 12px; margin-bottom: 20px; color: var(--ink);">
              <strong>Vault Archive Summary:</strong> ${esc(contract.summary)}
            </div>
            <pre style="white-space: pre-wrap; font-family: inherit; font-size: 13px; line-height: 1.6; margin: 0; color: var(--ink);">${esc(contract.fullText)}</pre>
          </div>
          <div style="padding: 16px 24px; border-top: 1px solid var(--line); background: var(--bone); display: flex; justify-content: space-between; align-items: center;">
            <button type="button" class="admin-cal-btn" onclick="document.getElementById('contractArchiveModal').style.display='none'; window.openPdfContractGenerator('', '', '${esc(contract.version)}');" style="border-color: var(--accent); color: var(--accent); font-weight: 700;">🖨️ Print PDF of ${esc(contract.version)}</button>
            <button type="button" class="admin-cal-btn primary" onclick="document.getElementById('contractArchiveModal').style.display='none'">Close Vault Viewer</button>
          </div>
        </div>
      `;
      modal.style.display = "flex";
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

      modalContainer.innerHTML = `
        <div class="date-admin-modal-overlay" id="editBookingOverlay">
          <div class="date-admin-modal">
            <button type="button" id="closeEditModal" style="position: absolute; top: 18px; right: 20px; background: none; border: none; font-size: 24px; cursor: pointer; color: var(--ink-soft);">&times;</button>
            <p class="eyebrow" style="margin-bottom: 6px;">Edit Client Booking</p>
            <h2 style="font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 800; margin: 0 0 16px; color: var(--ink);">Edit Booking for ${dKey}</h2>
            
            <form id="editBookingForm" style="display: flex; flex-direction: column; gap: 12px;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Client / Model Name *
                  <input type="text" id="eb_name" value="${esc(b.name)}" required style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                </label>
                <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Shoot Date (YYYY-MM-DD) *
                  <input type="text" id="eb_date" value="${esc(dKey)}" required style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                </label>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Email Address
                  <input type="email" id="eb_email" value="${esc(b.email || '')}" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                </label>
                <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Phone Number
                  <input type="tel" id="eb_phone" value="${esc(b.phone || '')}" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                </label>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Shoot Type
                  <input type="text" id="eb_type" value="${esc(b.type || 'Shoot')}" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                </label>
                <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Shoot Duration
                  <select id="eb_duration" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
                    <option value="Full Day" ${(b.duration || 'Full Day') === 'Full Day' ? 'selected' : ''}>Full Day Shoot</option>
                    <option value="Half Day (Morning)" ${b.duration === 'Half Day (Morning)' ? 'selected' : ''}>Half Day (Morning 9AM - 1PM)</option>
                    <option value="Half Day (Afternoon)" ${b.duration === 'Half Day (Afternoon)' ? 'selected' : ''}>Half Day (Afternoon 2PM - 6PM)</option>
                    <option value="Half Day (Flexible)" ${b.duration === 'Half Day (Flexible)' ? 'selected' : ''}>Half Day (Flexible Hours)</option>
                  </select>
                </label>
              </div>
              <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Booking Status
                <select id="eb_status" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
                  <option value="confirmed" ${(!b.isTentative && b.status !== 'tentative' && b.status !== 'workshop' && b.status !== 'assisting') ? 'selected' : ''}>✓ Confirmed Client Booking</option>
                  <option value="tentative" ${(b.isTentative || b.status === 'tentative') ? 'selected' : ''}>⏳ Anticipated Client Hold (Looks Booked to Public)</option>
                  <option value="workshop" ${b.status === 'workshop' ? 'selected' : ''}>📚 Workshop Attended (Skill-Up Day)</option>
                  <option value="assisting" ${b.status === 'assisting' ? 'selected' : ''}>🤝 Assisting Work (Assisting Another Photographer)</option>
                </select>
              </label>
              <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Contract Agreement &amp; Version Status
                <select id="eb_contractVersion" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">
                  <option value="Pending Agreement" ${(b.contractVersion === 'Pending Agreement' || (!b.agreedToTerms && !b.contractVersion)) ? 'selected' : ''}>⏳ Pending Agreement / Not Signed Yet (Admin Manual Booking)</option>
                  <option value="V3.2" ${(b.contractVersion === 'V3.2' || (b.agreedToTerms && !b.contractVersion)) ? 'selected' : ''}>📜 Agreed Terms V3.2 (Active Studio Terms)</option>
                  <option value="V3.1" ${b.contractVersion === 'V3.1' ? 'selected' : ''}>📜 Agreed Terms V3.1 (Archived Release)</option>
                  <option value="V3.0" ${b.contractVersion === 'V3.0' ? 'selected' : ''}>📜 Agreed Terms V3.0 (Archived Release)</option>
                  <option value="Custom Contract" ${b.contractVersion === 'Custom Contract' ? 'selected' : ''}>📄 Custom Client Contract / Brand Provided MSA</option>
                </select>
              </label>
              <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Reference Links (one per line)
                <textarea id="eb_links" rows="2" style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;">${esc((b.links || []).join('\n'))}</textarea>
              </label>
              <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Notes / Concepts
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

      modalContainer.innerHTML = `
        <div class="date-admin-modal-overlay" id="adminModalOverlay">
          <div class="date-admin-modal">
            <button type="button" id="closeAdminModal" style="position: absolute; top: 18px; right: 20px; background: none; border: none; font-size: 24px; cursor: pointer; color: var(--ink-soft);">&times;</button>
            <p class="eyebrow" style="margin-bottom: 6px;">Manage Availability &amp; Bookings</p>
            <h2 style="font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 800; margin: 0 0 12px; color: var(--ink);">${dKey} (${DAYS[dateObj.getDay()]})</h2>
            
            <div style="padding: 12px; border-radius: 8px; background: var(--bone); font-family: var(--mono-font); font-size: 11px; margin-bottom: 20px;">
              <strong>Current Status for Clients:</strong> 
              ${status.isBooked ? `<span style="color: var(--accent); font-weight: 700;">Already Booked (${status.bookings.length} slot${status.bookings.length > 1 ? "s" : ""})</span>` :
                status.isBlocked ? `<span style="color: #666; font-weight: 700; text-decoration: line-through;">Blocked (${status.isDefaultBlockedWeekday ? "Default Weekday" : "Custom Blocked"})</span>` :
                `<span style="color: #2e7d32; font-weight: 700;">Open for Booking</span>`
              }
            </div>

            <div style="display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap;">
              <button type="button" class="admin-cal-btn primary" id="toggleBlockBtn">
                ${status.isDefaultBlockedWeekday ? (status.isManuallyOpened ? "🔒 Re-block Weekday" : "🔓 Open Weekday for Clients") : (status.isCustomBlocked ? "🔓 Unblock Weekend Date" : "🔒 Block Weekend Date")}
              </button>
              <button type="button" class="admin-cal-btn" id="quickHoldBtn" style="border-color: #f57c00; color: #f57c00; background: rgba(255,152,0,0.1);">
                ⏳ Hold Date
              </button>
              <button type="button" class="admin-cal-btn" id="quickWorkshopBtn" style="border-color: #f9a825; color: #f9a825; background: rgba(249,168,37,0.1);">
                📚 Workshop (Yellow)
              </button>
              <button type="button" class="admin-cal-btn" id="quickAssistingBtn" style="border-color: #00897b; color: #00897b; background: rgba(0,137,123,0.1);">
                🤝 Assisting (Teal)
              </button>
            </div>

            <hr style="border: none; border-top: 1px solid var(--line); margin: 20px 0;" />

            <h3 style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; margin: 0 0 12px;">Add / Double-Book Client for ${dKey}</h3>
            <form id="modalAddBookingForm" style="display: flex; flex-direction: column; gap: 12px;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <input type="text" id="m_clientName" placeholder="Client / Model Name (or leave blank for Hold)" style="padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit;" />
                <select id="m_clientStatus" style="padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit;">
                  <option value="confirmed">✓ Confirmed Client Booking</option>
                  <option value="tentative">⏳ Anticipated Client Hold (Looks Booked to Public)</option>
                  <option value="workshop">📚 Workshop Attended (Skill-Up Day)</option>
                  <option value="assisting">🤝 Assisting Work (Assisting Another Photographer)</option>
                </select>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <input type="email" id="m_clientEmail" placeholder="Email Address" style="padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit;" />
                <input type="tel" id="m_clientPhone" placeholder="Phone Number (e.g. 9876543210)" style="padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit;" />
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <input type="text" id="m_clientType" placeholder="Shoot Type (e.g. Fashion, Portfolio)" style="padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit;" />
                <select id="m_clientDuration" style="padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit;">
                  <option value="Full Day">Full Day Shoot</option>
                  <option value="Half Day (Morning)">Half Day (Morning 9AM - 1PM)</option>
                  <option value="Half Day (Afternoon)">Half Day (Afternoon 2PM - 6PM)</option>
                  <option value="Half Day (Flexible)">Half Day (Flexible Hours)</option>
                </select>
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Contract Agreement &amp; Version Status</label>
                <select id="m_clientContractVersion" style="padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit;">
                  <option value="Pending Agreement">⏳ Pending Agreement / Not Signed Yet (Admin Manual Booking)</option>
                  <option value="V3.2">📜 Agreed Terms V3.2 (Active Studio Terms)</option>
                  <option value="V3.1">📜 Agreed Terms V3.1 (Archived Release)</option>
                  <option value="V3.0">📜 Agreed Terms V3.0 (Archived Release)</option>
                  <option value="Custom Contract">📄 Custom Client Contract / Brand Provided MSA</option>
                </select>
              </div>
              <input type="url" id="m_clientLinks" placeholder="Reference Link (Drive, Pinterest)" style="padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit;" />
              <textarea id="m_clientNotes" placeholder="Notes / Details..." rows="2" style="padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; resize: vertical;"></textarea>
              <button type="submit" class="admin-cal-btn primary" style="align-self: flex-start;">+ Add Booking / Hold to ${dKey}</button>
            </form>

            ${status.bookings.length ? `
              <hr style="border: none; border-top: 1px solid var(--line); margin: 20px 0;" />
              <h3 style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; margin: 0 0 12px;">Existing Bookings on this Date (${status.bookings.length})</h3>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                ${status.bookings.map(b => `
                  <div style="padding: 12px; border: 1px solid var(--line); border-radius: 8px; display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <div>
                        <strong style="font-size: 14px;">${esc(b.name)}</strong>
                        <span style="display:inline-block; margin-left:6px; background:var(--bone); border:1px solid var(--line); border-radius:4px; padding:1px 6px; font-family:var(--mono-font); font-size:10px; font-weight:700; color:var(--accent);">⏱️ ${esc(b.duration || "Full Day")}</span>
                      </div>
                      <div style="display:flex; gap:6px;">
                        <button type="button" class="admin-cal-btn" onclick="window.openPdfContractGenerator('${dKey}', '${b.id}')" style="border-color: var(--accent); color: var(--accent); font-size: 10px; padding:3px 8px; font-weight:700;">📄 Generate PDF Contract</button>
                        <button type="button" class="admin-cal-btn primary" onclick="window.openEditBookingModal('${dKey}', '${b.id}')" style="font-size: 10px; padding:3px 8px;">✏️ Edit</button>
                        <button type="button" class="admin-cal-btn" onclick="window.removeBookingFromRoster('${dKey}', '${b.id}'); document.getElementById('closeAdminModal')?.click();" style="color: #b22222; border-color: rgba(178,34,34,0.3); font-size: 10px; padding:3px 8px;">Remove</button>
                      </div>
                    </div>
                    <div style="font-size: 12px; color: var(--ink-soft);">${esc(b.type)} ${b.phone ? `· 📞 ${esc(b.phone)}` : ""} ${b.email ? `· ✉️ ${esc(b.email)}` : ""}</div>
                    ${b.notes ? `<div style="font-size: 11px; font-style: italic;">"${esc(b.notes)}"</div>` : ""}
                    ${b.links && b.links.length ? `
                      <div style="font-size: 11px; margin-top: 4px;">
                        <strong>Links:</strong>
                        ${b.links.map(l => `<div style="margin-top:2px;"><a href="${esc(l)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent); word-break:break-all;">🔗 ${esc(l)} ↗</a></div>`).join("")}
                      </div>
                    ` : ""}
                    ${b.attachments && b.attachments.length ? `
                      <div style="font-size: 11px; margin-top: 4px;">
                        <strong>Attachments:</strong>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                          ${b.attachments.map(att => `<a href="${esc(att.dataUrl)}" download="${esc(att.name)}" target="_blank" style="display:inline-flex; align-items:center; gap:4px; background:var(--bone); border:1px solid var(--line); border-radius:4px; padding:3px 6px; font-family:var(--mono-font); font-size:10px; color:var(--ink); text-decoration:none;">📄 ${esc(att.name)} ⬇</a>`).join("")}
                        </div>
                      </div>
                    ` : ""}
                  </div>
                `).join("")}
              </div>
            ` : ""}
          </div>
        </div>
      `;

      $("#closeAdminModal")?.addEventListener("click", () => modalContainer.innerHTML = "");
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
            <span style="font-family: var(--mono-font); font-size: 9px; font-weight: 800; background: rgba(10,10,10,0.75); backdrop-filter: blur(8px); color: #fff; padding: 4px 8px; border-radius: 20px; text-transform: uppercase;">${esc(kind)}</span>
          </div>
          <div style="position: absolute; top: 10px; right: 10px; z-index: 2;">
            <span style="font-family: var(--mono-font); font-size: 9.5px; font-weight: 800; background: var(--accent); color: #fff; padding: 4px 9px; border-radius: 20px;">${count} Album${count !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div style="padding: 16px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h3 style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; margin: 0 0 2px; color: var(--ink);">${esc(label)}</h3>
            <span style="font-size: 11px; color: var(--ink-soft); font-family: var(--mono-font);">Browse Category Collection</span>
          </div>
          <span style="font-size: 12px; font-weight: 700; color: var(--accent); display: inline-flex; align-items: center; gap: 4px;">Explore →</span>
        </div>
      </a>`;
  }

  function viewCategories(kind, val) {
    // Detail: a filtered work list
    if (kind && val) {
      const d = decodeURIComponent(val);
      const list = SHOOTS.filter((s) => {
        if (kind === "brand" && (!s.client || !s.client.trim())) return false;
        if (kind === "type" && (d === "Model Portfolio" || d === "Comp Cards" || d === "Selective Collaboration (TFP)" || d === "Test Shoot")) {
          return s.type === "Selective Collaboration (TFP)" || s.type === "Test Shoot" || s.isCompCard;
        }
        return (kind === "activity" ? s.activity : kind === "brand" ? s.brand : s.type) === d;
      });

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
          const finalPhotos = coverPhotoObj ? [coverPhotoObj, ...shuffleArray(remainingPhotos)] : shuffleArray(allGroupPhotos);
          
          const findStat = (key) => {
             const found = shootsInGroup.find(s => s[key] && String(s[key]).trim());
             return found ? String(found[key]).trim() : "";
          };
          
          const isPort = d === "Model Portfolio";
          return {
            id: isPort ? `portfolio-${encodeURIComponent(modelName)}` : `comp-card-${encodeURIComponent(modelName)}`,
            title: isPort ? `${modelName} — Portfolio` : `${modelName} — Comp Card`,
            brand: "Personal Project",
            activity: latestShoot.activity,
            type: "Selective Collaboration (TFP)",
            height: findStat("height"),
            chest: findStat("chest"),
            waist: findStat("waist"),
            hips: findStat("hips"),
            shoes: findStat("shoes"),
            modelHair: findStat("modelHair"),
            modelEyes: findStat("modelEyes"),
            // Carried over so the "Show stats on Comp Cards / Model
            // Portfolio" checkboxes still apply once shoots are merged into
            // this synthetic album — without this, every stats display that
            // reads from the album (not the raw shoot) ignored the toggle.
            showStatsOnCompCard: latestShoot.showStatsOnCompCard,
            showStatsOnModelPortfolio: latestShoot.showStatsOnModelPortfolio,
            mentor: latestShoot.mentor || "",
            season: latestShoot.season || "Comp Card",
            photographer: latestShoot.photographer || "Studio",
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
        
        displayList = [...unifiedAlbums, ...nonGroupable];
      }

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
            ${isTestShoot ? `<p class="page-sub" style="max-width: 600px; line-height: 1.6; opacity: 1 !important; visibility: visible !important; transform: none !important;">${esc(getCategoryDescription(d))}<span style="font-size: 12px; color: var(--ink-soft); display: block; margin-top: 8px;">Note: Models from workshop projects are not included here.</span></p>` : `<p class="page-sub reveal">${displayList.length} master album${displayList.length !== 1 ? "s" : ""} in this ${esc(kind)}.</p>`}
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
      let shoots = SHOOTS.filter(s => (s[key] === targetVal || (targetVal === "Selective Collaboration (TFP)" && (s.isCompCard || s.type === "Selective Collaboration (TFP)" || s.type === "Test Shoot"))) && ((s.instagram && s.instagram.trim()) || (s.kavyar && s.kavyar.trim()) || (s.talent && s.talent.trim())));
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
              <a href="/categories?kind=activity&amp;val=Fashion" data-link class="link-arrow" style="font-size: 12px; font-weight: 700;">Explore fashion edit →</a>
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
              <a href="/categories?kind=activity&amp;val=Portrait" data-link class="link-arrow" style="font-size: 12px; font-weight: 700;">Explore beauty &amp; portraits →</a>
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
              <a href="/categories?kind=activity&amp;val=Fitness" data-link class="link-arrow" style="font-size: 12px; font-weight: 700;">Explore fitness catalog →</a>
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
              <a href="/categories?kind=activity&amp;val=Sports" data-link class="link-arrow" style="font-size: 12px; font-weight: 700;">Explore sports action →</a>
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
                <span style="display: block; margin-top: 8px; font-size: 11.5px; color: var(--ink-soft); line-height: 1.4;">This compcard archive includes photos clicked or produced under nerdyphotographer.in studio or its subsidiaries.</span>
              </p>
              <a href="/categories?kind=type&amp;val=Comp%20Cards" data-link class="link-arrow" style="font-size: 12px; font-weight: 700;">Explore comp cards →</a>
            </div>
            <div class="specialty-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              ${renderSpecialtyGallery(testShootSamples, "MODEL", "type", "Comp Cards")}
            </div>
          </div>
          ` : ""}

          ${testShootSamples.length && isAdmin() ? `
          <div class="specialty-item reveal" style="border-top: 1px dashed var(--line); padding-top: 40px; margin-top: 40px;">
            <div class="specialty-meta">
              <span style="font-family:var(--mono-font); font-size:9px; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.05em; display:block; margin-bottom: 6px;">🔒 Admin Portfolio View</span>
              <h3>
                <a href="/categories?kind=type&amp;val=Model%20Portfolio" data-link>Model Portfolio</a>
              </h3>
              <p>
                Curated model portfolios displaying agency-ready grids. Optimized for casting directors with quick filters to segment by shooting angle (Front, Side, Back, 3/4, Close-up).
              </p>
              <a href="/categories?kind=type&amp;val=Model%20Portfolio" data-link class="link-arrow" style="font-size: 12px; font-weight: 700; color: var(--accent);">Explore portfolio angles →</a>
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
              <p style="font-family: 'Georgia', serif; font-size: 16px; font-style: italic; line-height: 1.6; color: var(--ink); margin: 0;">“${esc(t.quote)}”</p>
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <strong style="font-family: 'Archivo', sans-serif; font-size: 14px; color: var(--ink);">${esc(t.by)}</strong>
                <span style="font-size: 11px; color: var(--ink-soft); font-family: var(--mono-font);">${esc(t.meta)} ${t.season ? `· ${esc(t.season)}` : ""}</span>
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
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">05 — Contribute</p>
          <h1 class="reveal">Publish a photoshoot</h1>
          <p class="page-sub reveal">Drop your images, fill in the studio credits, and your shoot joins the archive — browsable by activity, brand and type. Saved locally to this browser.</p>
        </div>
      </section>
      <section class="section container">
        <div class="upload-grid">
          <div class="dropzone reveal" id="dropzone" tabindex="0" role="button" aria-label="Upload images">
            <input type="file" id="fileInput" accept="image/*" multiple hidden />
            <div class="dropzone-inner">
              <svg class="dropzone-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              <p class="dropzone-title">${dropTitle}</p>
              <p class="dropzone-hint">${dropHint}</p>
            </div>
            <div class="thumb-bulk-toolbar" id="thumbBulkToolbar" style="display:none; align-items:center; flex-wrap:wrap; gap:8px; margin-top:14px; padding:10px 12px; border:1px solid var(--line-2); border-radius:8px; background:var(--bone-2); pointer-events:auto;">
              <span style="font-family:'JetBrains Mono', monospace; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink-soft);">Bulk-tag pose:</span>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="full-body" style="font-family:'JetBrains Mono', monospace; font-size:10px; font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Full Body</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="front" style="font-family:'JetBrains Mono', monospace; font-size:10px; font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Front</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="left-profile" style="font-family:'JetBrains Mono', monospace; font-size:10px; font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Left Profile</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="right-profile" style="font-family:'JetBrains Mono', monospace; font-size:10px; font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Right Profile</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="three-quarter" style="font-family:'JetBrains Mono', monospace; font-size:10px; font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">3/4</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="back" style="font-family:'JetBrains Mono', monospace; font-size:10px; font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Back</button>
              <button type="button" class="thumb-bulk-angle-btn" data-angle="close-up" style="font-family:'JetBrains Mono', monospace; font-size:10px; font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink); cursor:pointer;">Close-up</button>
              <span style="width:1px; align-self:stretch; background:var(--line-2);"></span>
              <button type="button" id="thumbBulkSelectAll" style="font-family:'JetBrains Mono', monospace; font-size:10px; font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink-soft); cursor:pointer;">Select all</button>
              <button type="button" id="thumbBulkClear" style="font-family:'JetBrains Mono', monospace; font-size:10px; font-weight:700; padding:5px 10px; border-radius:5px; border:1px solid var(--line-2); background:var(--paper); color:var(--ink-soft); cursor:pointer;">Clear</button>
              <span id="thumbBulkCount" style="margin-left:auto; font-family:'JetBrains Mono', monospace; font-size:10px; color:var(--ink-soft);">0 selected</span>
            </div>
            <div class="thumb-grid" id="stagingGrid"></div>
          </div>

          <form class="shoot-form reveal" id="shootForm" autocomplete="off">
            <div style="margin-bottom: 24px; padding: 14px 18px; border: 1px solid var(--line); border-radius: 8px; background: var(--bone); display: flex; align-items: center; gap: 10px; width: 100%;">
              <input id="f_is_testimonial_only" type="checkbox" style="width: 16px; height: 16px; accent-color: var(--accent); margin: 0; cursor: pointer;" />
              <label for="f_is_testimonial_only" style="font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; font-weight: 700; cursor: pointer; color: var(--ink);">Testimonial Only (No Photoshoot Album)</label>
            </div>

            <fieldset><legend>The shoot</legend>
              <label class="field"><span>Shoot title *</span><input id="f_title" type="text" placeholder="e.g. Merrell Trail — Spring '26" required /></label>
              <div class="field-row">
                <label class="field" id="f_brand_select_field"><span>Brand</span><select id="f_brand">${opt(BRANDS)}<option>Other</option></select></label>
                <label class="field" id="f_brand_text_field" style="display: none;"><span>Company / Role *</span><input id="f_brand_text" type="text" placeholder="e.g. Model, Vogue, Brand Director" /></label>
                <label class="field" id="f_activity_field"><span>Activity</span><select id="f_activity">${opt(ACTIVITIES)}</select></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Type</span><select id="f_type">${opt(TYPES)}</select></label>
                <label class="field"><span>Season / Year</span><input id="f_season" type="text" placeholder="Spring 2026" /></label>
                <label class="field"><span>Shoot Location (add Instagram in parentheses)</span><input id="f_location" type="text" placeholder="e.g. Studio (@studiohandle), Noida, Outdoor" /></label>
                <div id="f_location_verify" style="margin-top: 5px; font-size: 11px; display: none;"></div>
              </div>
              <div class="field-row" style="margin-top: 12px; gap: 20px; flex-wrap: wrap;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: var(--ink); cursor: pointer; user-select: none;">
                  <input id="f_show_test_shoot_cat" type="checkbox" style="width: 16px; height: 16px; accent-color: var(--accent);" />
                  Display "Selective Collaboration (TFP)" category tag publicly
                </label>
              </div>
            </fieldset>

            <fieldset><legend>Credits</legend>
              <div class="field-row">
                <label class="field"><span>Photographer</span><input id="f_photographer" type="text" value="nerdyphotographer" placeholder="Your name" /></label>
                <label class="field"><span>Art director (add socials in parentheses)</span><input id="f_ad" type="text" placeholder="e.g. Name (@handle; site.com)" /></label>
                <div id="f_ad_verify" style="margin-top: 5px; font-size: 11px; display: none;"></div>
              </div>
              <div class="field-row">
                <label class="field"><span>Stylist (add socials in parentheses)</span><input id="f_stylist" type="text" placeholder="e.g. Name (@handle; site.com)" /></label>
                <div id="f_stylist_verify" style="margin-top: 5px; font-size: 11px; display: none;"></div>
              </div>
              <div class="field-row">
                <label class="field"><span>Hair stylist (add socials in parentheses)</span><input id="f_hair" type="text" placeholder="e.g. Name (@handle; site.com)" /></label>
                <div id="f_hair_verify" style="margin-top: 5px; font-size: 11px; display: none;"></div>
              </div>
              <div class="field-row">
                <label class="field"><span>Makeup artist / MUA (add socials in parentheses)</span><input id="f_mua" type="text" placeholder="e.g. Name (@handle; site.com)" /></label>
                <div id="f_mua_verify" style="margin-top: 5px; font-size: 11px; display: none;"></div>
                <label class="field"><span>Videographer(s)</span><input id="f_video" type="text" placeholder="—" /></label>
              </div>
              <div class="field-row">
                <label class="field"><span>Model / talent (comma-separated · socials in parentheses)</span><input id="f_talent" type="text" placeholder="e.g. Bharti (@handle; site.com), Suyagya" /></label>
                <div id="f_talent_verify" style="margin-top: 5px; font-size: 11px; display: none;"></div>
              </div>
              <div class="field-row" id="f_mentor_row" style="display: none;">
                <label class="field"><span>Teacher / Mentor (comma-separated · socials in parentheses)</span><input id="f_mentor" type="text" placeholder="e.g. Mentor One (@handle; site.com), Mentor Two" /></label>
                <div id="f_mentor_verify" style="margin-top: 5px; font-size: 11px; display: none;"></div>
              </div>
              <label class="field" style="position: relative;">
                <span>Credits (Name with socials · comma-separated)</span>
                <input id="f_credits" type="text" placeholder="e.g. Stylist Name (@handle; site.com), Makeup Artist Name" />
                <div id="f_credits_verify" style="margin-top: 5px; font-size: 11px; display: none;"></div>
              </label>
            </fieldset>

            <fieldset id="modelStatsFieldset"><legend>Model stats (Comp Cards)</legend>
              <div class="field-row">
                <label class="field"><span>Height</span><input id="f_height" type="text" placeholder="e.g. 5'11&quot; / 180 cm" /></label>
                <label class="field"><span>Bust / Chest</span><input id="f_chest" type="text" placeholder="e.g. 34&quot; / 86 cm" /></label>
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
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: var(--ink); cursor: pointer; user-select: none;">
                  <input id="f_show_stats_comp" type="checkbox" checked style="width: 16px; height: 16px; accent-color: var(--accent);" />
                  Show stats on Comp Cards
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: var(--ink); cursor: pointer; user-select: none;">
                  <input id="f_show_stats_port" type="checkbox" checked style="width: 16px; height: 16px; accent-color: var(--accent);" />
                  Show stats on Model Portfolio
                </label>
              </div>
            </fieldset>

            <fieldset><legend>Details</legend>
              <label class="field"><span>Description</span><textarea id="f_desc" rows="3" placeholder="A line or two about the shoot…"></textarea></label>
              <label class="field"><span>PDF (Course material, curriculum, etc.)</span><input id="f_pdf" type="file" accept=".pdf" /></label>
              <div class="field-row">
                <label class="field"><span>Tags</span><input id="f_tags" type="text" placeholder="golden hour, motion, coast" /></label>
                <label class="field"><span>Camera / gear</span><input id="f_gear" type="text" placeholder="Sony A1 · 85mm" /></label>
              </div>
            </fieldset>

            <fieldset><legend>Links & meta</legend>
              <div class="field-row">
                <label class="field"><span>Client</span><input id="f_client" type="text" placeholder="Brand name" /></label>
                <label class="field"><span>Date shot</span><input id="f_date" type="date" /></label>
              </div>
              <div class="field-row">
                <label class="field" style="position: relative;">
                  <span>Instagram (comma-separated)</span>
                  <input id="f_ig" type="text" placeholder="e.g. @handle1, @handle2" />
                  <div id="f_ig_verify" style="margin-top: 5px; font-size: 11px; display: none;"></div>
                </label>
                <label class="field" style="position: relative;">
                  <span>Kavyar Profile / Links</span>
                  <input id="f_kavyar" type="text" placeholder="e.g. https://kavyar.com/profile" />
                  <div id="f_kavyar_verify" style="margin-top: 5px; font-size: 11px; display: none;"></div>
                </label>
              </div>
              <div class="field-row">
                <label class="field"><span>Portfolio link / Website</span><input id="f_link" type="url" placeholder="https://…" /></label>
                <label class="field"><span>Usage rights</span><input id="f_rights" type="text" placeholder="e.g. Web + social, 1 year" /></label>
              </div>
              <div class="field-row" style="align-items: center; margin-top: 10px; gap: 20px; flex-wrap: wrap;">
                <label style="display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; font-weight: 700; cursor: pointer; color: #fff;">
                  <input id="f_featured" type="checkbox" checked style="width: 15px; height: 15px; accent-color: var(--accent); margin: 0;" />
                  Feature on homepage
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; font-weight: 700; cursor: pointer; color: #fff;">
                  <input id="f_hide_compcard" type="checkbox" style="width: 15px; height: 15px; accent-color: var(--accent); margin: 0;" />
                  Hide from Comp Cards Page
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; font-weight: 700; cursor: pointer; color: #fff;">
                  <input id="f_disable_download" type="checkbox" style="width: 15px; height: 15px; accent-color: var(--accent); margin: 0;" />
                  Disable Comp Card PDF Download
                </label>
              </div>
            </fieldset>

            <fieldset><legend>Visibility & Privacy</legend>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                <input id="f_is_public" type="checkbox" checked style="width: 16px; height: 16px; accent-color: var(--accent); margin: 0; cursor: pointer;" />
                <label for="f_is_public" style="font-weight: 600; cursor: pointer; margin: 0;">Make album public (uncheck to hide entirely)</label>
              </div>
              <p style="font-size: 12px; color: var(--ink-soft); margin: 0 0 16px;">Show these fields publicly:</p>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                  <input id="f_show_credits" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  Credits
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                  <input id="f_show_pdf" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  PDF Materials
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                  <input id="f_show_instagram" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  Instagram
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                  <input id="f_show_kavyar" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  Kavyar
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                  <input id="f_show_testimonials" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  Testimonials
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                  <input id="f_show_stats" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  Model Stats
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                  <input id="f_show_gear" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  Gear/Equipment
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                  <input id="f_show_location" type="checkbox" checked style="width: 14px; height: 14px; accent-color: var(--accent); margin: 0;" />
                  Location
                </label>
              </div>
            </fieldset>

            <fieldset id="extraTestimonialsFs"><legend>Testimonials <span class="legend-opt">optional (up to 3)</span></legend>
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
            </fieldset>

            <fieldset id="fieldsetLighting"><legend>Lighting Diagram <span class="legend-opt">optional</span></legend>
              <label class="field"><span>Diagram image</span><input type="file" id="f_diagram_file" accept="image/*" /></label>
              <div id="diagramPreview" style="margin-top: 10px; display: none;">
                <img id="f_diagram_img" style="max-height: 180px; width: auto; object-fit: contain; border-radius: 6px; border: 1px solid var(--line);" alt="Diagram Preview" />
                <button type="button" id="clearDiagramBtn" style="display: block; margin-top: 6px; background: none; border: none; color: #b22222; font-size: 11px; cursor: pointer; text-decoration: underline; padding: 0;">Remove Diagram</button>
              </div>
              <label class="field"><span>Visibility mode</span>
                <select id="f_diagram_visibility">
                  <option value="private">Private (Admin Only)</option>
                  <option value="public">Public (Visible to everyone)</option>
                  <option value="disabled">Disabled (Do not show at all)</option>
                </select>
              </label>
            </fieldset>

            <p class="field-note" id="queueNote">No photos staged yet.</p>
            <button type="submit" class="btn btn-dark btn-block" id="publishBtn" disabled>Publish to the archive</button>
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
      <section class="page-head">
        <div class="container">
          <p class="eyebrow reveal">Book a session</p>
          ${kineticH1("Book", "kinetic-h1-wide")}
          <p class="page-sub reveal">Fill out the details below to inquire about booking a session. Whether you are booking a commercial campaign, e-commerce production, editorial work, or scheduling a selective test shoot, please submit your brief and project specs below.</p>

        </div>
      </section>
      <section class="section container">
        <div class="book-wrap">
          <div class="book-success" id="bookSuccess" style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 20px; width: 100%; max-width: 580px; margin: 0 auto;" hidden>
            <div class="book-success-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <h2>Request prepared.</h2>
            <p id="bookSuccessMsg" style="margin: 0; line-height: 1.6;">Your booking inquiry is ready in your email app — please hit <strong>Send</strong> in your mail client to complete the request.</p>
            
            <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; width: 100%;">
              <a href="" id="bookMailtoLink" class="btn btn-dark" style="font-size: 11px; height: auto; padding: 10px 18px; text-decoration: none;">Launch Mail App</a>
              <a href="" id="bookGmailLink" target="_blank" rel="noopener noreferrer" class="btn btn-dark" style="font-size: 11px; height: auto; padding: 10px 18px; text-decoration: none; background: #ea4335; border-color: #ea4335; color: #fff;">Send via Gmail (Web)</a>
              <a href="" id="bookOutlookLink" target="_blank" rel="noopener noreferrer" class="btn btn-dark" style="font-size: 11px; height: auto; padding: 10px 18px; text-decoration: none; background: #0078d4; border-color: #0078d4; color: #fff;">Send via Outlook (Web)</a>
            </div>
            <div style="display: flex; gap: 12px; justify-content: center; width: 100%; margin-top: 6px;">
              <button type="button" class="btn btn-ghost" id="bookAnother" style="font-size: 11px; height: auto; padding: 8px 18px;">Send another request</button>
              <a href="/" data-link class="btn btn-ghost" style="font-size: 11px; height: auto; padding: 8px 18px; text-decoration: none;">Back to home</a>
            </div>

            <div style="margin-top: 14px; border-top: 1px dashed var(--line); padding-top: 20px; width: 100%; display: flex; flex-direction: column; gap: 10px; align-items: center;">
              <p style="font-size: 12px; color: var(--ink-soft); margin: 0; line-height: 1.5;">Mail app didn't open? Copy the inquiry details below and email them to <strong style="color: var(--ink); font-family: monospace;">${studioEmail}</strong>:</p>
              <button type="button" class="btn btn-ghost" id="copyInquiryBtn" style="font-size: 11px; padding: 8px 16px; height: auto;">Copy Inquiry Text</button>
              <pre id="inquiryTextPreview" style="width: 100%; box-sizing: border-box; background: var(--bone); padding: 14px; border-radius: 6px; font-size: 11px; font-family: monospace; white-space: pre-wrap; text-align: left; max-height: 200px; overflow-y: auto; border: 1px solid var(--line); color: var(--ink); margin: 0;"></pre>
            </div>
          </div>
          <form class="shoot-form" id="bookingForm" novalidate>
            <fieldset>
              <legend>Contact Information</legend>
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
 
             <fieldset>
               <legend>Shoot Details</legend>

                <!-- Dedicated Still Photography Specialization & Video Coverage Policy Notice -->
                <div style="background: rgba(var(--accent-rgb), 0.04); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
                  <div style="font-family: var(--mono-font); font-size: 10px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">📷 Still Photography Specialization &amp; Video Policy</div>
                  <div style="font-size: 11px; color: var(--ink-soft); line-height: 1.5;">
                    Studio packages &amp; rates are <strong>strictly dedicated to Still Photography creation</strong> (Commercial, Fashion, Editorial &amp; Portfolio). Video / Reels coverage is not included in standard packages. Clients may bring their own videographer or request studio assistance to source a freelance videographer for the session.
                  </div>
                </div>

<div style="margin-bottom: 12px; text-align: right;">
                  <a id="toggleInviteCodeLink" href="javascript:void(0)" style="font-size: 11px; color: var(--ink-soft); text-decoration: underline; font-family: var(--mono-font); cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">🔑 Have a direct photographer invite code? (Test Shoot)</a>
                </div>

                <!-- Photographer Direct Invite Code (Hidden by default, expandable via discreet link) -->
                <div id="inviteCodeContainer" style="display: none; background: rgba(var(--accent-rgb), 0.04); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin-bottom: 18px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-weight: 700; color: var(--ink); font-size: 13px;">🔑 Photographer Direct Invite Code</span>
                    <span id="inviteCodeStatus" style="font-family: var(--mono-font); font-size: 10px; font-weight: 700; display: none;"></span>
                  </div>
                  <div style="font-size: 11px; color: var(--ink-soft); margin-bottom: 10px; line-height: 1.4;">Enter your photographer invite code to unlock direct Test Shoot / TFP options.</div>
                  <div style="display: flex; gap: 8px;">
                    <input id="b_invite_code" type="text" placeholder="Enter Direct Invite Code" style="text-transform: uppercase; font-family: var(--mono-font); font-weight: 700; flex: 1; padding: 10px; border: 1px solid var(--line); border-radius: 6px;" />
                    <button type="button" id="btnApplyInviteCode" style="background: var(--accent); color: #ffffff; border: none; padding: 0 18px; border-radius: 6px; font-family: var(--mono-font); font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap;">Verify Code</button>
                  </div>
                </div>
               <div class="field-row">
                 <label class="field" id="b_type_field_wrap"><span>Desired Project Type (Includes Test Shoots / TFP) *</span>
                   <select id="b_type">
                     <option value="Fashion Editorial" ${isSelected("Fashion Editorial")}>Fashion Editorial</option>
                     <option value="Fitness &amp; Athletic" ${isSelected("Fitness &amp; Athletic")}>Fitness &amp; Athletic</option>
                     <option value="Sports Action" ${isSelected("Sports Action")}>Sports Action</option>
                     <option value="Commercial Campaign" ${isSelected("Commercial Campaign")}>Commercial Campaign</option>
                     <option value="Selective Collaboration (TFP)" ${isSelected("Selective Collaboration (TFP)")}>📸 SELECTIVE COLLABORATION / TFP (Portfolio Collab)</option>
                     <option value="Other" ${isSelected("Other")}>Other Focus Area</option>
                   </select>
                   <div id="b_type_notice" style="font-size: 11px; color: var(--accent); margin-top: 5px; font-family: var(--mono-font); display: none;">
                     🎁 <strong>Test Shoot Deliverables:</strong> Full Proofing Gallery + 8 to 12 Retouched Master Clicks (No RAW files delivered).
                   </div>
                 </label>

                 <!-- Option B: Locked TFP Card displayed when Photographer Invite Code is verified -->
                 <div id="lockedTfpCard" style="display: none; background: rgba(5,150,105,0.06); border: 1.5px solid #059669; border-radius: 8px; padding: 14px 16px; margin-bottom: 6px; box-shadow: var(--shadow-sm); width: 100%; box-sizing: border-box;">
                   <div style="font-family: var(--mono-font); font-size: 10px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
                     <span>🔑 PROJECT TYPE: SELECTIVE COLLABORATION (TFP / TEST SHOOT)</span>
                     <span style="background: #059669; color: #ffffff; padding: 2.5px 8px; border-radius: 4px; font-size: 9px; font-weight: 700;">LOCKED BY INVITE CODE</span>
                   </div>
                   <div style="font-size: 12px; color: var(--ink); line-height: 1.5; font-weight: 600;">
                     Session is locked to a <strong>Selective Collaboration / TFP Test Shoot</strong> via your verified Photographer Direct Invite Code.
                   </div>
                 </div>
                 <label class="field" id="b_date_field">
                    <span>Preferred Date / Timeline * <span id="b_date_availability_badge" style="display: none; font-family: var(--mono-font); font-size: 9px; font-weight: 700; padding: 2.5px 7px; border-radius: 4px; margin-left: 8px; vertical-align: middle; text-transform: uppercase; letter-spacing: 0.05em;"></span></span>
                    <div class="date-picker-wrap">
                      <input id="b_date" type="text" required placeholder="e.g. Mid-July 2026, or use the calendar →" autocomplete="off" />
                      <button type="button" class="date-picker-toggle" id="datePickerToggle" aria-label="Open date picker" title="Pick dates from calendar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      </button>
                      <div class="date-picker-popup" id="datePickerPopup"></div>
                    </div>
                  </label>
               </div>
                <div class="field-row">
                  <label class="field"><span>Preferred Session Duration (Optional)</span>
                    <select id="b_duration">
                      <option value="Flexible / Photographer Choice" selected>🤔 Flexible / Photographer Choice (Photographer Recommends Best Time)</option>
                      <option value="Full Day (10:30 AM – 5:30 PM)">☀️ Full Day Shoot (10:30 AM – 5:30 PM · 7 Hours)</option>
                      <option value="Half Day Morning (10:30 AM – 2:30 PM)">🌅 Half Day Morning (10:30 AM – 2:30 PM · 4 Hours)</option>
                      <option value="Half Day Afternoon (1:30 PM – 5:30 PM)">🌇 Half Day Afternoon (1:30 PM – 5:30 PM · 4 Hours)</option>
                      <option value="Custom Timings">⏰ Custom Timings (Pick Call &amp; Wrap Time)</option>
                    </select>
                  </label>
                  <label class="field"><span>Shoot Location / Venue Address *</span><input id="b_location" type="text" required placeholder="" /></label>
                </div>

                <div id="b_custom_time_wrap" style="display: none; background: var(--bone); border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
                  <div style="font-size: 11px; font-weight: 700; color: var(--accent); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">⏰ Custom Call &amp; Wrap Timings</div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">Start / Call Time *
                      <input type="time" id="b_time_start" value="10:30" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                    </label>
                    <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft);">End / Wrap Time *
                      <input type="time" id="b_time_end" value="17:30" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                    </label>
                  </div>
                  <div id="b_custom_time_badge" style="margin-top: 8px; font-family: var(--mono-font); font-size: 11px; font-weight: 700; color: var(--accent);">
                    ⏱️ 7 Hours Session (10:30 AM – 5:30 PM)
                  </div>
                </div>

                <div class="field-row">
                  <label class="field" style="grid-column: 1 / -1;"><span>Dedicated Studio Space Needed? *</span>
                    <select id="b_studio_space">
                      <option value="No - Outdoor / Client Location / Client Books Studio Directly">No — Outdoor / Client Location / Client Books Studio Directly</option>
                      <option value="Yes - Dedicated Studio Rental Required (Billed at Actuals)">Yes — Studio Space Needed (Venue rental billed at actuals / cost)</option>
                    </select>
                  </label>
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
                 <label class="field" style="grid-column: 1 / -1;">
                   <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                     <span style="font-weight: 700; color: var(--ink);">🎟️ Promotional Discount Code (Optional)</span>
                     <span id="discountCodeStatus" style="font-family: var(--mono-font); font-size: 10px; font-weight: 700; display: none;"></span>
                   </div>
                   <div style="display: flex; gap: 8px;">
                     <input id="b_discount_code" type="text" placeholder="Enter Promo Code" style="text-transform: uppercase; font-family: var(--mono-font); font-weight: 700; flex: 1; padding: 10px; border: 1px solid var(--line); border-radius: 6px;" />
                     <button type="button" id="btnApplyDiscountCode" style="background: var(--accent); color: #ffffff; border: none; padding: 0 18px; border-radius: 6px; font-family: var(--mono-font); font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap;">Apply Code</button>
                   </div>
                 </label>
               </div>
               <div id="discountSavingsBadge" style="display: none; margin-top: 6px; font-family: var(--mono-font); font-size: 11px; color: #059669; font-weight: 700;"></div>

               <div id="finalPriceSummaryBox" style="background: #111111; color: #ffffff; border: 1.5px solid var(--accent); border-radius: 10px; padding: 16px 20px; margin-top: 18px; margin-bottom: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.35);">
                  <div style="font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <span>💎 Itemized Production Quote &amp; Milestone Payable HUD</span>
                    <span id="calcDiscountTag" style="font-size: 10px; color: #059669; background: rgba(5,150,105,0.2); padding: 3px 10px; border-radius: 12px; font-weight: 700; display: none;"></span>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; font-family: var(--mono-font); font-size: 13px; border-bottom: 1px dashed rgba(255,255,255,0.15); padding-bottom: 12px; margin-bottom: 12px;">
                    <div>
                      <span style="color: rgba(255,255,255,0.6);">Package Base Rate:</span>
                      <span id="summaryOriginalPrice" style="font-weight: 700; color: #ffffff; margin-left: 6px;">₹${getAdminPackages()[0].price.toLocaleString('en-IN')}</span>
                    </div>
                    <div id="summaryDiscountWrap" style="display: none;">
                      <span id="summaryDiscountLabel" style="color: #059669; font-weight: 700;">Promo Savings:</span>
                      <span id="summarySavingsAmount" style="font-weight: 700; color: #059669; margin-left: 6px;">-₹0</span>
                    </div>
                    <div>
                      <span style="color: rgba(255,255,255,0.6);">Total Payable:</span>
                      <span id="summaryFinalAmount" style="font-size: 22px; font-weight: 800; color: var(--accent); font-family: var(--mono-font);">₹${getAdminPackages()[0].price.toLocaleString('en-IN')} INR</span>
                    </div>
                  </div>
                  <!-- 50/50 Milestone Itemized Breakdown -->
                  <div id="summaryMilestoneBreakdown" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; font-size: 11px;">
                    <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 8px 12px;">
                      <span style="color: rgba(255,255,255,0.6); display: block; font-size: 9px; text-transform: uppercase;">Step 1 · 50% Advance Retainer (Due Now)</span>
                      <strong id="summaryAdvanceAmount" style="color: var(--accent); font-size: 13px; font-family: var(--mono-font);">₹${Math.round(getAdminPackages()[0].price / 2).toLocaleString('en-IN')} INR</strong>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 8px 12px;">
                      <span style="color: rgba(255,255,255,0.6); display: block; font-size: 9px; text-transform: uppercase;">Step 2 · 50% Wrap Balance (Prior to Deliverables)</span>
                      <strong id="summaryBalanceAmount" style="color: #059669; font-size: 13px; font-family: var(--mono-font);">₹${(getAdminPackages()[0].price - Math.round(getAdminPackages()[0].price / 2)).toLocaleString('en-IN')} INR</strong>
                    </div>
                  </div>
                </div>
               </div>

               <div class="book-policies" style="background: var(--bone); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 10px; padding: 16px 18px; margin-bottom: 20px;">
                 <div style="font-family: var(--mono-font); font-size: 10px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">Studio Policies &amp; Terms · Please Read</div>
                 <ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px;">
                   <li style="display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; line-height: 1.55; color: var(--ink-soft);">
                      <span aria-hidden="true" style="flex: 0 0 20px; font-size: 15px; line-height: 1.4;">📷</span>
                      <span><strong style="color: var(--ink);">Still Photography Specialization:</strong> Rates &amp; studio packages are <strong style="color: var(--ink);">strictly dedicated to Still Photography creation</strong>. Video / Reels coverage is excluded from standard packages. Clients may hire an external videographer or request studio assistance to source a freelance videographer for the session.</span>
                    </li>
<li style="display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; line-height: 1.55; color: var(--ink-soft);">
                     <span aria-hidden="true" style="flex: 0 0 20px; font-size: 15px; line-height: 1.4;">🏢</span>
                     <span><strong style="color: var(--ink);">Studio Rental:</strong> Package rates cover photography creation, light design &amp; master retouched deliverables. If a dedicated indoor studio venue/space is required, applicable studio rental fees are billed <strong style="color: var(--ink);">at actuals (at cost)</strong>, or the client may directly book their preferred studio space for the production.</span>
                   </li>
                   <li style="display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; line-height: 1.55; color: var(--ink-soft);">
                     <span aria-hidden="true" style="flex: 0 0 20px; font-size: 15px; line-height: 1.4;">🚗</span>
                     <span><strong style="color: var(--ink);">Travel &amp; Accommodation:</strong> Shoots requiring travel beyond <strong style="color: var(--ink);">20 km</strong> from the studio base (Noida) incur paid travel and, where an overnight stay is needed, accommodation — billed <strong style="color: var(--ink);">at actuals (at cost)</strong>.</span>
                   </li>
                   <li style="display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; line-height: 1.55; color: var(--ink-soft);">
                     <span aria-hidden="true" style="flex: 0 0 20px; font-size: 15px; line-height: 1.4;">📸</span>
                     <span><strong style="color: var(--ink);">Full Unedited Gallery Buyout:</strong> Packages include a proofing gallery to select contracted retouches. If the client requests the complete full unedited image gallery or additional retouched master clicks beyond the package limit, extra gallery buyout charges apply.</span>
                   </li>
                   <li style="display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; line-height: 1.55; color: var(--ink-soft);">
                     <span aria-hidden="true" style="flex: 0 0 20px; font-size: 15px; line-height: 1.4;">🔒</span>
                     <span><strong style="color: var(--ink);">Camera &amp; Media Protection:</strong> All camera equipment, memory cards, and raw captures are strictly confidential studio property. Participants may not touch equipment or delete media from cameras. Unauthorized file deletion constitutes a material breach of contract and incurs full data recovery costs.</span>
                   </li>
                 </ul>
               </div>

                <div class="field" style="display: flex; flex-direction: column; gap: 4px;">
                  <span>Reference &amp; Mood Board Links (Multiple allowed)</span>
                  <div id="b_links_container">
                    <div class="link-input-row">
                      <input class="b_moodboard_input" type="url" placeholder="Pinterest board, Dropbox, or Google Drive URL" />
                    </div>
                  </div>
                  <button type="button" id="b_add_link_btn" style="background:none; border:1px dashed var(--line); padding:6px 12px; border-radius:6px; font-family:var(--mono-font); font-size:10px; font-weight:700; cursor:pointer; color:var(--ink-soft); align-self:flex-start; margin-top:4px;">+ Add another reference link</button>
                </div>

                <div class="field" style="display: flex; flex-direction: column; gap: 4px;">
                  <span>File Attachments (Multiple PDFs, Images, Brief Documents)</span>
                  <input id="b_file_input" type="file" multiple accept="image/*,application/pdf,.doc,.docx" style="display: none;" />
                  <div class="attachments-dropzone" id="b_dropzone">
                    📎 <strong>Click or drag files here to attach</strong>
                    <div style="font-size: 10px; margin-top: 4px;">Attach multiple PDFs, moodboard JPEGs, or project documents</div>
                  </div>
                  <div class="attachment-list" id="b_file_list"></div>
                </div>

                <label class="field"><span>Project Concept &amp; Detailed Brief</span><textarea id="b_concept" rows="4" placeholder="Describe the mood, location style, styling ideas, and deliverables you have in mind..."></textarea></label>
              </fieldset>

              <!-- Payment Terms & Milestone Flowchart -->
              <fieldset id="paymentTermsFieldset" style="border: 1px solid var(--line); border-radius: 12px; padding: 24px; background: var(--paper); margin-top: 24px;">
                <legend style="font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); padding: 0 10px;">💳 Studio Payment Terms &amp; Milestones</legend>
                
                <div style="margin-bottom: 18px;">
                  <p style="font-size: 12px; color: var(--ink-soft); margin: 0; line-height: 1.5;">To reserve studio dates and ensure smooth delivery, studio productions follow structured milestone payments as detailed below:</p>
                </div>

                <!-- Flowchart 2-Step (Default) -->
                <div id="flowchart2Step" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 18px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: 10px; font-weight: 700; color: var(--accent); text-transform: uppercase; margin-bottom: 6px;">STEP 1 · 50% ADVANCE RETAINER</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 700; color: var(--ink);">🔒 48 Hours Prior to Shoot Start</h4>
                    <p style="font-size: 12px; color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid at least 48 hours before the shoot day to reserve studio space, schedule the crew, and lock calendar availability (unless explicitly discussed with the team). <strong>Mandatory prior to shoot start.</strong> <strong style="color: #b22222;">(Non-refundable)</strong></p>
                  </div>

                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 18px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: 10px; font-weight: 700; color: #2e7d32; text-transform: uppercase; margin-bottom: 6px;">STEP 2 · 50% FINAL BALANCE</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 700; color: var(--ink);">📦 After Shoot · Prior to Receiving Any Downloadable File</h4>
                    <p style="font-size: 12px; color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid upon completion of the shoot session, prior to receiving any downloadable preview or retouched final deliverable file. <strong style="color: #b22222;">(Non-refundable)</strong></p>
                  </div>
                </div>

                <!-- Flowchart 3-Step (3-Tier Milestone) -->
                <div id="flowchart3Step" style="display: none; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px;">
                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: 10px; font-weight: 700; color: var(--accent); text-transform: uppercase; margin-bottom: 6px;">STEP 1 · 50% ADVANCE RETAINER</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700; color: var(--ink);">🔒 48 Hours Prior to Shoot Start</h4>
                    <p style="font-size: 11px; color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid at least 48 hours before the shoot day to lock studio date and reserve production crew (unless explicitly discussed with the team). <strong>Mandatory prior to shoot start.</strong> <strong style="color: #b22222;">(Non-refundable)</strong></p>
                  </div>

                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: 10px; font-weight: 700; color: #f57c00; text-transform: uppercase; margin-bottom: 6px;">STEP 2 · 30% REVIEW MILESTONE</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700; color: var(--ink);">🔎 After Shoot · Proofing Gallery</h4>
                    <p style="font-size: 11px; color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid after shoot wrap, before receiving the watermarked proofing gallery to select retouches. <strong style="color: #b22222;">(Non-refundable)</strong></p>
                  </div>

                  <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 10px; padding: 16px; position: relative;">
                    <div style="font-family: var(--mono-font); font-size: 10px; font-weight: 700; color: #2e7d32; text-transform: uppercase; margin-bottom: 6px;">STEP 3 · 20% FINAL DELIVERABLES</div>
                    <h4 style="margin: 0 0 6px; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700; color: var(--ink);">📦 Prior to Receiving Any Downloadable File</h4>
                    <p style="font-size: 11px; color: var(--ink-soft); margin: 0; line-height: 1.5;">Paid upon final approval, prior to receiving any downloadable or high-resolution retouched master file.</p>
                  </div>
                </div>
              </fieldset>
 
             <!-- TFP Liability Release Terms Modal -->
             <div id="termsModal" class="modal-overlay" style="display: none; position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); align-items: center; justify-content: center; padding: 20px;">
               <div class="modal-content" style="background: var(--paper); border: 1px solid var(--line); border-radius: 12px; max-width: 680px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.15); overflow: hidden; animation: modalFadeIn 0.3s ease;">
                 <div style="padding: 20px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; background: var(--bone);">
                   <h3 id="termsModalTitle" style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink);">Studio Production &amp; Liability Release</h3>
                   <span id="termsModalTag" style="font-family: var(--mono-font); font-size: 10px; background: var(--accent); padding: 4px 8px; border-radius: 4px; color: #fff; font-weight: 700;">TFP-LIABILITY-RELEASE-V3.3 (CURRENT)</span>
                 </div>
                 <div style="padding: 24px; overflow-y: auto; font-size: 13px; line-height: 1.6; color: var(--ink); display: flex; flex-direction: column; gap: 20px; text-align: left;">
                   <p style="margin: 0; font-family: var(--mono-font); font-size: 10px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em;">TFP Collaboration, Model Release &amp; Digital Consent Terms</p>
                   
                   <div style="background: var(--bone); border: 1px solid var(--line); border-radius: 6px; padding: 14px; font-size: 11px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px;">
                     <div><strong>Studio/Photographer:</strong> nerdyphotographer.in</div>
                     <div><strong>Creative Partner/Model:</strong> <span id="terms_partner_name">[Your Name]</span></div>
                     <div><strong>Business Handle:</strong> @nerdyphotographer.in</div>
                     <div><strong>Consent Tracking:</strong> Verified via Email / Digital Acknowledgment</div>
                     <div><strong>Production Status:</strong> Time-For-Print (TFP) Collab</div>
                     <div><strong>Location:</strong> Studio Production Space</div>
                   </div>
 
                   <div>
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700;">1. SCOPE OF CREATIVE COLLABORATION</h4>
                     <p style="margin: 0;">This session is scheduled as a peer-to-peer creative collaboration structured for mutual portfolio growth, asset curation, and personal branding advancement. No monetary compensation is required or exchanged for photographer or model services. The Studio provides specialized equipment, lighting architecture, workspace, and post-production engineering; the Participant(s) provide technical modeling direction, personal wardrobe, and makeup artistry. <em>Note: If a dedicated external or commercial studio space is requested or booked for the shoot, the Participant shall be entirely responsible for covering the applicable studio rental charges.</em></p>
                   </div>
 
                   <div>
                      <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700;">2. INTELLECTUAL PROPERTY, MODEL RELEASE &amp; USAGE LICENSE</h4>
                      <p style="margin: 0;">The legal copyright of all visual media remains exclusively with the Studio. To support mutual growth and portfolio building, all participants are granted a full non-exclusive license to publish, share, and use final retouched photos for personal self-promotion, social media grids (Instagram/TikTok), personal websites, and agency portfolios.</p>
                      <p style="margin: 6px 0 0 0; font-style: italic;"><strong>No Alterations:</strong> To preserve the lighting design and capture integrity, no party shall apply secondary mobile filters, automated presets, cropping adjustments, or third-party digital modifications to the delivered files.</p>
                    </div>
 
                   <div style="border-left: 3px solid var(--accent); padding-left: 14px; background: rgba(var(--accent-rgb), 0.04);">
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700; color: #b22222;">3. COMPREHENSIVE LIABILITY WAIVER &amp; INDEMNIFICATION</h4>
                     <p style="margin: 0; font-weight: 500;">CRITICAL SAFETY &amp; LIABILITY RELEASE: The Participant enters the studio environment, uses studio blocks, cubes, chairs, furniture, or props, and performs physical poses entirely at their own risk. The Studio shall not be held liable for any physical injury, illness, accident, psychological distress, property damage, or clothing wear-and-tear incurred before, during, or after this production. The Participant explicitly waives any right to seek damages or legal recourse against the Studio or its operating photographers for accidents or injuries occurring on the premises.</p>
                     <p style="margin: 6px 0 0 0;">Furthermore, the Participant agrees to indemnify and hold harmless the Studio from any claims, damages, liabilities, or legal expenses arising out of the Participant’s conduct or injuries on set.</p>
                   </div>
 
                   <div>
                      <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700;">4. TECHNICAL PERFORMANCE &amp; DELIVERY DISCLAIMER</h4>
                      <p style="margin: 0;">As a creative collaboration, test shoots (TFP collabs) include a <strong>Full Proofing Gallery + 8 to 12 Retouched Master Clicks</strong>. The Studio retains final artistic authority over image selection and editing styles. Under no circumstances will raw unedited files (RAW format) be delivered to the Participant, unless otherwise agreed upon in writing for an additional fee.</p>
                    </div>
 
                   <div>
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700;">5. MANDATORY ALL-PARTY ATTRIBUTION WORKFLOW</h4>
                     <p style="margin: 0 0 6px 0;">To ensure creative transparency, all parties agree to execute the following mandatory publishing workflow:</p>
                     <ul style="margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px;">
                       <li><strong>Instagram Collaboration Feature:</strong> For all primary feed or grid publications, the publishing party must issue an Instagram Co-Author Collaboration Invite to <strong>@nerdyphotographer.in</strong> prior to publishing.</li>
                       <li><strong>Full Production Credits Block:</strong> Every party publishing an asset must explicitly credit all contributors in the caption. In formats where joint collaboration tools are restricted, a comprehensive credit block must be placed within the first three lines of the caption body text as follows:
                         <pre style="margin: 6px 0; background: var(--bone); padding: 8px; border-radius: 4px; font-family: monospace; font-size: 11px; white-space: pre-wrap; line-height: 1.4;">
📷 Photography &amp; Light Design: @nerdyphotographer.in
👤 Model / Talent: @[Handle]
💄 Makeup Artist / MUA: @[Handle]
👔 Styling / Wardrobe: @[Handle]</pre>
                       </li>
                     </ul>
                   </div>
 
                   <div style="border-left: 3px solid #b22222; padding-left: 14px; background: rgba(178,34,34,0.04);">
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700; color: #b22222;">6. UNAUTHORIZED CAMERA OPERATION, GEAR HANDS-OFF &amp; DATA PROTECTION CLAUSE</h4>
                     <p style="margin: 0; font-weight: 500;">All raw captures, memory cards, and camera equipment remain the exclusive property and intellectual property of the Studio. Under no circumstances is a model, participant, or client permitted to touch, handle, or delete media from the photographer's camera, cards, or tethering systems.</p>
                     <p style="margin: 6px 0 0 0; font-weight: 500;">The Studio retains sole artistic authority over image culling, selection, and deletion. Deleting or attempting to delete media from equipment constitutes a material breach of contract, resulting in immediate termination of the shoot, forfeiture of all deliverables, and potential liability for data recovery expenses.</p>
                   </div>

                   <div>
                     <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700;">7. DIGITAL CONSENT, EMAIL ACCEPTANCE &amp; BINDING NATURE</h4>
                     <p style="margin: 0;">In accordance with standard digital contract practices, a physical or handwritten signature is not required to validate these terms. Definitive legal acceptance and a binding obligation to these conditions are established through any of the following actions:</p>
                     <ul style="margin: 6px 0 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px;">
                       <li>Sending a reply stating "I agree", "Confirmed", or equivalent confirmation over email or direct digital messaging channels.</li>
                       <li>Voluntarily entering the studio workspace environment and participating in the scheduled production session following receipt of these terms.</li>
                     </ul>
                   </div>

                    <div style="border-left: 3px solid var(--accent); padding-left: 14px; background: rgba(var(--accent-rgb), 0.04);">
                      <h4 style="margin: 0 0 6px 0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700; color: var(--accent);">8. OUTSTATION LOCATION, TRAVEL &amp; ACCOMMODATION EXPENSE POLICY (&gt;20 KM FROM NOIDA)</h4>
                      <p style="margin: 0; font-weight: 500;">If the shoot location is located beyond a 20 km radius from Noida (Delhi NCR), all travel expenses, local conveyance, outstation transport, tolls, and accommodation expenses incurred for the photographer (and core production team) shall be fully borne, arranged, or reimbursed by the client / party requesting the shoot session. This condition applies to both Paid Commercial Shoots and Test Shoot Collaborations (TFP).</p>
                    </div>
                   
                   <!-- Signature Block -->
                   <div style="margin-top: 15px; border-top: 1px dashed var(--line); padding-top: 15px;">
                     <label style="font-size: 12px; font-weight: 700; color: var(--ink); display: block; margin-bottom: 6px;">Draw Your Signature Below to Confirm Agreement *</label>
                     <div style="position: relative; background: var(--bone); border: 1px solid var(--line); border-radius: 6px; height: 120px; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                       <canvas id="termsSigCanvas" width="600" height="120" style="position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; touch-action: none; z-index: 2;"></canvas>
                       <div id="termsSigHint" style="position: absolute; color: var(--ink-soft); font-size: 11px; font-style: italic; z-index: 1; pointer-events: none; display: flex; align-items: center; gap: 6px;">
                         ✍️ Draw signature here with finger or mouse
                       </div>
                     </div>
                     <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                       <span style="font-size: 10px; color: var(--ink-soft);">This digital consent is legally binding.</span>
                       <button type="button" id="clearTermsSigBtn" style="background: none; border: none; font-size: 11px; color: var(--accent); font-weight: 700; cursor: pointer; text-decoration: underline; padding: 0;">Clear Signature</button>
                     </div>
                   </div>
                 </div>
                  <div style="padding: 16px 20px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; background: var(--bone);">
                    <div id="customContractOptionWrap" style="display: none; background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 12px; text-align: left;">
                      <label style="font-size: 11px; font-weight: 700; color: var(--ink-soft); display: block;">Specify Your Custom Contract / Agency MSA Details (Optional):
                        <input type="text" id="customContractNotesInput" placeholder="e.g. Client Agency MSA provided via Email / Custom Brand Terms" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; margin-top: 4px;" />
                      </label>
                    </div>
                    <div style="display: flex; gap: 8px; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                      <button type="button" class="btn btn-ghost" id="termsDeclineBtn" style="font-size: 11px; height: auto; padding: 9px 14px;">✕ Decline</button>
                      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button type="button" class="btn btn-ghost" id="termsCustomBtn" style="font-size: 11px; height: auto; padding: 9px 14px; border: 1px solid var(--accent); color: var(--accent); font-weight: 700;">📝 Request Custom Contract</button>
                        <button type="button" class="btn btn-dark" id="termsAcceptBtn" style="font-size: 12px; height: auto; padding: 9px 18px;">✅ Agree &amp; Continue</button>
                      </div>
                    </div>
                  </div>
                 </div>
               </div>
             </div>

            <div id="gearProtectionCallout" style="background: rgba(178,34,34,0.05); border: 1px solid rgba(178,34,34,0.3); border-radius: 10px; padding: 18px; margin-bottom: 20px; text-align: left;">
             <div style="display: flex; align-items: center; gap: 8px; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700; color: #b22222; margin-bottom: 10px;">
               🔒 Unauthorized Data Deletion &amp; Gear Clause
             </div>
             <p style="font-size: 12px; color: var(--ink); margin: 0 0 8px; line-height: 1.5; font-weight: 500;">
               "All raw captures, memory cards, and camera equipment remain the exclusive property and intellectual property of the Studio. Under no circumstances is a model, participant, or client permitted to touch, handle, or delete media from the photographer's camera, cards, or tethering systems."
             </p>
             <p style="font-size: 12px; color: var(--ink); margin: 0; line-height: 1.5; font-weight: 500;">
               "The Studio retains sole artistic authority over image culling, selection, and deletion. Deleting or attempting to delete media from equipment constitutes a material breach of contract, resulting in immediate termination of the shoot, forfeiture of all deliverables, and potential liability for data recovery expenses."
             </p>
           </div>

           <div id="bookingPolicyNotice" style="background: var(--bone); border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin-bottom: 24px; font-size: 11px; line-height: 1.5; color: var(--ink-soft); text-align: left;">
              <span style="font-family: var(--mono-font); font-size: 9px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Booking &amp; Collaboration Policy</span>
              Submission of a booking inquiry or TFP collaboration request does not constitute a confirmed session or a commitment to shoot. All inquiries are subject to schedule availability, creative brief alignment, and final studio review. <strong>Note: If a dedicated studio space is booked for the shoot, applicable studio rental charges will apply.</strong> Collaboration requests (TFP/Test Shoots) are selective and accepted at the sole discretion of the studio. Inquiries that are not explicitly approved by the studio will be considered inactive.
            </div>

            <button type="submit" class="btn btn-dark btn-block" id="bookSubmitBtn">Submit Booking Request</button>
            <p style="font-size: 11px; color: var(--ink-soft); margin-top: 15px; text-align: center; line-height: 1.4;">By submitting a booking request, you agree to our standard terms. For test shoots, read our online <a href="#tfp-terms" id="tfpTermsTrigger" style="text-decoration: underline; color: var(--accent); font-weight: 600;">Studio Production &amp; Liability Release</a>.</p>
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

      // Change labels and descriptions
      const titleLabel = $("#f_title")?.closest(".field")?.querySelector("span");
      if (titleLabel) {
        titleLabel.textContent = isTestimonialOnly ? "Testimonial Subject / Headline *" : "Shoot title *";
      }

      const talentLabel = $("#f_talent")?.closest(".field")?.querySelector("span");
      if (talentLabel) {
        talentLabel.textContent = isTestimonialOnly ? "Client Name *" : "Model / talent (comma-separated · socials in parentheses)";
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
        if (pageTitle) pageTitle.textContent = "Edit photoshoot details";
        const pageSub = $(".page-head .page-sub");
        if (pageSub) pageSub.textContent = `Editing: ${editingShoot.title}`;
        pub.textContent = "Save changes";
        
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
        $("#f_ad").value = editingShoot.artDirector || "";
        $("#f_stylist").value = editingShoot.stylist || "";
        $("#f_hair").value = editingShoot.hair || "";
        $("#f_mua").value = editingShoot.mua || "";
        if ($("#f_video")) $("#f_video").value = editingShoot.videographer || "";
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
        $("#f_waist").value = editingShoot.waist || "";
        $("#f_hips").value = editingShoot.hips || "";
        $("#f_shoes").value = editingShoot.shoes || "";
        $("#f_model_hair").value = editingShoot.modelHair || "";
        $("#f_model_eyes").value = editingShoot.modelEyes || "";
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
    function renderStaged() {
      const n = staged.length; pub.disabled = n === 0;
      note.textContent = n ? `${n} photo${n > 1 ? "s" : ""} ready — drag to reorder, drag the dot to set focus.` : "No photos staged yet.";
      note.classList.toggle("ready", n > 0);
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
            <label style="display: flex; align-items: center; gap: 5px; font-size: 9px; color: var(--ink-soft); cursor: pointer;">
              <input type="checkbox" class="thumb-bulk-check" data-id="${f.id}" ${selectedForBulk.has(f.id) ? 'checked' : ''} style="width: 12px; height: 12px; accent-color: var(--accent); margin: 0; cursor: pointer;" />
              Select for bulk tagging
            </label>
            <input type="text" class="thumb-caption-input" data-id="${f.id}" value="${esc(f.caption || '')}" placeholder="Add caption…" style="width: 100%; box-sizing: border-box; font-size: 10px; padding: 4px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); outline: none;" />
            
            <div style="display: grid; grid-template-columns: 1fr; gap: 4px;">
              <label style="font-size: 9px; color: var(--ink-soft); display: flex; flex-direction: column; gap: 2px;">
                <span>Usage</span>
                <select class="thumb-usage-select" data-id="${f.id}" style="font-size: 9px; padding: 2px 4px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); width: 100%;">
                  <option value="both" ${f.usage === 'both' ? 'selected' : ''}>Both (Comp & Port)</option>
                  <option value="portfolio" ${f.usage === 'portfolio' ? 'selected' : ''}>Portfolio Only</option>
                  <option value="comp" ${f.usage === 'comp' ? 'selected' : ''}>Comp Card Only</option>
                </select>
              </label>
              <label style="font-size: 9px; color: var(--ink-soft); display: flex; flex-direction: column; gap: 2px;">
                <span>Angle / Profile</span>
                <select class="thumb-angle-select" data-id="${f.id}" style="font-size: 9px; padding: 2px 4px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); width: 100%;">
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
        verify.innerHTML = `<span style="color:var(--ink-soft); font-family:'JetBrains Mono', monospace; font-size:10px; margin-right:6px; text-transform:uppercase;">Verify links:</span> ${linksHtml}`;
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
              if (s.includes("instagram.com") || s.startsWith("@")) {
                let handle = s.startsWith("@") ? s.replace(/^@/, "") : s;
                // Extract handle from full URL, removing query params
                if (handle.includes("instagram.com")) {
                  handle = handle.split("instagram.com/")[1]?.split("/")[0]?.split("?")[0] || "";
                }
                if (handle) {
                  allLinks.push({ label: `@${handle}`, url: `https://instagram.com/${handle}` });
                }
              } else if (s.includes("kavyar.com")) {
                allLinks.push({ label: "Kavyar", url: s.startsWith("http") ? s : "https://" + s });
              } else if (s.startsWith("http")) {
                allLinks.push({ label: s.split("//")[1]?.split("/")[0] || "Link", url: s });
              }
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
        artDirector: isTestimonialOnly ? "" : val("f_ad"),
        stylist: isTestimonialOnly ? "" : (val("f_stylist") || "—"),
        hair: isTestimonialOnly ? "" : (val("f_hair") || "—"),
        mua: isTestimonialOnly ? "" : (val("f_mua") || "—"),
        videographer: isTestimonialOnly ? "" : (val("f_video") || "—"),
        talent: val("f_talent"),
        location: isTestimonialOnly ? "" : val("f_location"),
        height: isTestimonialOnly ? "" : val("f_height"),
        chest: isTestimonialOnly ? "" : val("f_chest"),
        waist: isTestimonialOnly ? "" : val("f_waist"),
        hips: isTestimonialOnly ? "" : val("f_hips"),
        shoes: isTestimonialOnly ? "" : val("f_shoes"),
        modelHair: isTestimonialOnly ? "" : val("f_model_hair"),
        modelEyes: isTestimonialOnly ? "" : val("f_model_eyes"),
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
          ...(typeof f.focalX === "number" ? { focalX: f.focalX, focalY: f.focalY } : {}),
          ...(f.caption && f.caption.trim() ? { caption: f.caption.trim() } : {})
        })),
        featured: isTestimonialOnly ? false : ($("#f_featured")?.checked ?? false),
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
          <input class="b_moodboard_input" type="url" placeholder="Additional Pinterest, Drive, or Dropbox URL" style="padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: 13px;" />
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

    // ── Custom Date Picker Calendar ──
    (() => {
      const toggle = $("#datePickerToggle");
      const popup = $("#datePickerPopup");
      const dateInput = $("#b_date");
      if (!toggle || !popup || !dateInput) return;

      let pickerMode = "range"; // "range" or "multi"
      let viewYear, viewMonth; // currently displayed month
      let rangeStart = null, rangeEnd = null;
      let multiDates = []; // array of Date objects

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
        if (!badge) return;
        const valStr = dateInput.value.trim();
        if (!valStr) {
          badge.style.display = "none";
          return;
        }

        let targetDate = rangeStart || (multiDates.length ? multiDates[0] : null);
        if (!targetDate) {
          const parsed = new Date(valStr);
          if (!isNaN(parsed.getTime())) targetDate = parsed;
        }

        if (!targetDate) {
          badge.style.display = "none";
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
          return;
        }

        const st = getCalDateStatus(targetDate);
        badge.style.display = "inline-flex";

        if (st.isBooked) {
          badge.style.background = "rgba(220,38,38,0.12)";
          badge.style.border = "1px solid rgba(220,38,38,0.3)";
          badge.style.color = "#dc2626";
          badge.innerHTML = "🔴 BOOKED";
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
                <span style="font-family: var(--mono-font); font-size: 10px; font-weight: 700; color: var(--accent);">⚙️ Admin Mode</span>
                <button type="button" id="dpAdminToggle" style="background: ${adminManageMode ? 'var(--accent)' : 'none'}; color: ${adminManageMode ? '#fff' : 'var(--ink)'}; border: 1px solid var(--line); border-radius: 4px; padding: 3px 8px; font-family: var(--mono-font); font-size: 9px; font-weight: 700; cursor: pointer;">
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
              titleAttr = "Unavailable: This date is booked by another client";
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
              const day = cell.dataset.day;
              toast(`Unable to select ${MONTHS[viewMonth]} ${day} — this date is already taken by another client.`);
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
              const clicked = new Date(viewYear, viewMonth, day);

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
            <span style="font-family: var(--mono-font); font-size: 9px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">TFP Collaboration &amp; Test Shoot Policy</span>
            Submission of a TFP collaboration request does not constitute a confirmed session or a commitment to shoot. All inquiries are subject to schedule availability, creative alignment, and final studio review. <strong>Note: If a dedicated studio space is booked for the shoot, applicable studio rental charges will apply.</strong> TFP shoots include a Full Proofing Gallery + 8 to 12 Retouched Master Clicks. RAW unedited camera files are strictly excluded and remain unreleased.
          `;
        } else {
          policyNotice.innerHTML = `
            <span style="font-family: var(--mono-font); font-size: 9px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Commercial Production &amp; Studio Protection Policy</span>
            <strong>🔒 Booking &amp; Retainer Terms:</strong> 50% advance retainer reserves studio space &amp; production crew (non-refundable). Cancellations within 48h forfeit advance retainer.<br/>
            <strong>📦 Deliverables &amp; Full Gallery Buyout:</strong> Packages include a proofing gallery to select contracted retouches. If the client requests the complete full unedited image gallery or additional retouched master clicks beyond the package limit, extra buyout charges apply. RAW unedited camera files remain confidential studio property.<br/>
            <strong>📜 Usage Licensing:</strong> Rates cover digital web &amp; social media usage. Extended billboard, TV, print, or commercial advertising rights require separate usage licensing.<br/>
            <strong>🏢 Studio Rental Policy:</strong> Dedicated indoor studio venue rentals are billed <strong>at actuals (at cost)</strong>, or the client may directly book their preferred studio venue for our team to shoot on location.
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

        if (collabFallbackWrap) {
          if (isTalentRole) {
            // Models, MUAs & Stylists get pure TFP collaboration without being forced to pick a paid package
            collabFallbackWrap.style.display = "block";
            collabFallbackWrap.innerHTML = `
              <div style="font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 700; color: var(--accent); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                📸 Creative Talent TFP Collaboration Policy
              </div>
              <p style="font-size: 11px; color: var(--ink-soft); margin: 0; line-height: 1.5;">
                Peer-to-peer collaboration session for portfolio growth &amp; creative curation. Submissions are reviewed at studio discretion based on creative brief alignment and schedule availability.
              </p>
            `;
          } else {
            // Brands & Agencies require a mandatory Paid Fallback Package
            collabFallbackWrap.style.display = "block";
            collabFallbackWrap.innerHTML = `
              <div style="font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 700; color: var(--accent); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                📌 Studio Discretion Policy &amp; Paid Fallback Package *
              </div>
              <p style="font-size: 11px; color: var(--ink-soft); margin: 0 0 10px 0; line-height: 1.5;">
                Brand &amp; Commercial TFP collaborations are accepted at the sole discretion of the studio based on creative brief alignment and portfolio synergy. Unapproved collaboration requests do not reserve shoot dates.
              </p>
              <label class="field" style="margin: 0;">
                <span style="font-size: 11px; font-weight: 700; color: var(--ink);">If your collaboration request is not approved, which Paid Package would you like to proceed with? *</span>
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
      const allAdminInvites = (typeof window.getAdminInviteCodes === "function" ? window.getAdminInviteCodes() : [{ code: "NERDYBRAND" }]).map(c => (typeof c === 'object' ? c.code : c).toUpperCase());
      const enteredCode = (inviteCodeInput?.value || "").trim().toUpperCase();
      
      // Verify against ALL active admin invite codes (e.g. NERDYTEST, MODELVIP, etc.) or backup codes
      const validInviteCodes = Array.from(new Set([...allAdminInvites, "NERDY-INVITE", "INVITE2026", "NERDYVIP", "STUDIOINVITE", "VIP2026"]));
      const isValidInvite = enteredCode ? (validInviteCodes.includes(enteredCode) || ["a0488e15", "107a6c92", "f8043214", "4fe5835e", "326d5752"].includes(hashFNV1a(enteredCode))) : false;

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
            const tagMsg = matchedDiscount.flat ? `FLAT ₹${matchedDiscount.flat.toLocaleString("en-IN")} OFF` : `${matchedDiscount.pct}% OFF`;
            discountStatus.textContent = `🟢 ${tagMsg} APPLIED`;
            savingsBadge.style.display = "block";
            savingsBadge.textContent = `🎉 Promo Offer Applied: You save ${tagMsg} on your selected package total!`;
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

      // Universal Photographer Invite Code Enforcement for ALL Roles
      if (!isValidInvite) {
        if (testShootOpt) {
          testShootOpt.hidden = true;
          testShootOpt.style.display = "none";
          testShootOpt.disabled = true;
        }
        if ($("#b_type") && $("#b_type").value === "Selective Collaboration (TFP)") {
          $("#b_type").value = "Fashion Editorial";
          $("#b_type").dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (typeFieldWrap) typeFieldWrap.style.display = "";
        if (lockedTfpCard) lockedTfpCard.style.display = "none";
      } else {
        if (testShootOpt) {
          testShootOpt.hidden = false;
          testShootOpt.style.display = "";
          testShootOpt.disabled = false;
        }
        const typeSelect = $("#b_type");
        if (typeSelect && typeSelect.value !== "Selective Collaboration (TFP)") {
          typeSelect.value = "Selective Collaboration (TFP)";
          typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (typeFieldWrap) typeFieldWrap.style.display = "none";
        if (lockedTfpCard) lockedTfpCard.style.display = "block";
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

      if (matchedDiscount) {
        if (matchedDiscount.flat) {
          savings = matchedDiscount.flat;
          discountTagText = `FLAT ₹${matchedDiscount.flat.toLocaleString("en-IN")} OFF`;
        } else if (matchedDiscount.pct) {
          savings = Math.round((basePrice * matchedDiscount.pct) / 100);
          discountTagText = `${matchedDiscount.pct}% OFF`;
        }
      }
      let finalPayable = Math.max(0, basePrice - savings);

      const finalPriceSummaryBox = $("#finalPriceSummaryBox");
      const promoCodeWrap = $("#b_discount_code")?.closest(".field");

      if (type === "Selective Collaboration (TFP)") {
        if (finalPriceSummaryBox) finalPriceSummaryBox.style.display = "none";
        if (promoCodeWrap) promoCodeWrap.style.display = "none";
        if (budgetField) budgetField.style.display = "none";
      } else {
        if (finalPriceSummaryBox) finalPriceSummaryBox.style.display = "block";
        if (promoCodeWrap) promoCodeWrap.style.display = "";
        if (budgetField) budgetField.style.display = "";

        if (summaryOriginalPrice) summaryOriginalPrice.textContent = `₹${basePrice.toLocaleString("en-IN")}`;
        if (savings > 0) {
          if (summaryDiscountWrap) summaryDiscountWrap.style.display = "block";
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
        if (summaryFinalAmount) summaryFinalAmount.textContent = `₹${finalPayable.toLocaleString("en-IN")} INR`;

        // 50/50 Itemized Retainer & Balance Update
        const advanceRetainer = Math.round(finalPayable / 2);
        const wrapBalance = finalPayable - advanceRetainer;
        const summaryAdvanceAmount = $("#summaryAdvanceAmount");
        const summaryBalanceAmount = $("#summaryBalanceAmount");
        if (summaryAdvanceAmount) summaryAdvanceAmount.textContent = `₹${advanceRetainer.toLocaleString("en-IN")} INR`;
        if (summaryBalanceAmount) summaryBalanceAmount.textContent = `₹${wrapBalance.toLocaleString("en-IN")} INR`;

        // Update Mobile Sticky Floating Action Bar (FAB)
        const fabPrice = $("#mobileFabPrice");
        if (fabPrice) fabPrice.textContent = `Payable: ₹${finalPayable.toLocaleString("en-IN")} INR`;
      }
    };

    const updateCustomTimeBadge = () => {
      const startVal = $("#b_time_start")?.value || "10:30";
      const endVal = $("#b_time_end")?.value || "17:30";
      const format12 = (timeStr) => {
        if (!timeStr) return "";
        const [h, m] = timeStr.split(":").map(Number);
        const period = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 || 12;
        return `${h12}:${String(m).padStart(2, "0")} ${period}`;
      };
      
      const [sh, sm] = startVal.split(":").map(Number);
      const [eh, em] = endVal.split(":").map(Number);
      let diffMins = (eh * 60 + em) - (sh * 60 + sm);
      if (diffMins < 0) diffMins += 24 * 60;
      const hrs = (diffMins / 60).toFixed(1).replace(".0", "");
      const badge = $("#b_custom_time_badge");
      if (badge) {
        badge.innerHTML = `⏱️ ${hrs} Hours Session (${format12(startVal)} – ${format12(endVal)})`;
      }
    };

    $("#b_duration")?.addEventListener("change", () => {
      const isCustom = $("#b_duration")?.value === "Custom Timings";
      const wrap = $("#b_custom_time_wrap");
      if (wrap) wrap.style.display = isCustom ? "block" : "none";
      if (isCustom) updateCustomTimeBadge();
    });

    $("#b_time_start")?.addEventListener("input", updateCustomTimeBadge);
    $("#b_time_end")?.addEventListener("input", updateCustomTimeBadge);

    ["change", "input", "blur", "click"].forEach(evtName => {
      $("#b_type")?.addEventListener(evtName, updateFields);
      $("#b_role")?.addEventListener(evtName, updateFields);
      $("#b_budget")?.addEventListener(evtName, updateFields);
      $("#b_invite_code")?.addEventListener(evtName, updateFields);
      $("#b_discount_code")?.addEventListener(evtName, updateFields);
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
          link.textContent = isHidden ? "✕ Hide invite code field" : "🔑 Have a direct photographer invite code? (Test Shoot)";
        }
      }
    });

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
        if (link) link.textContent = "🔑 Have a direct photographer invite code? (Test Shoot)";
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
      return firstBad;
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

      const proceedSubmit = (agreedToTerms = false, shootCategory = "Commercial", isCustomContract = false, customContractNotes = "") => {
        btn.disabled = true;
        btn.classList.add("is-loading");
        btn.textContent = "Sending your request…";

        const isTfpCat = shootCategory === "TFP";
        const contractRefDoc = isCustomContract ? "CUSTOM-CLIENT-CONTRACT-MSA" : (isTfpCat ? "TFP-LIABILITY-RELEASE-V3.3" : "COMMERCIAL-CONTRACT-V3.3");
        const tfpReleaseText = agreedToTerms ? (
          `\n\n==================================================\n` +
          `STUDIO PRODUCTION CONTRACT & LEGAL TERMS\n` +
          `${isCustomContract ? 'CUSTOM CLIENT CONTRACT / AGENCY MSA REQUESTED' : (isTfpCat ? 'TFP COLLABORATION & MODEL RELEASE' : 'COMMERCIAL SHOOT PRODUCTION AGREEMENT')}\n` +
          `Document Reference: ${contractRefDoc}\n` +
          `--------------------------------------------------\n` +
          `Studio/Photographer: nerdyphotographer.in\n` +
          `Client/Participant: ${name}\n` +
          `Contact Email: ${email}\n` +
          `Contract Status: ${isCustomContract ? 'Custom Contract / Agency MSA Requested (Pending Studio Review)' : 'Agreed to Studio Contract V3.3'}\n` +
          (isCustomContract ? `Custom Contract Notes: ${customContractNotes || 'Client requested custom agency MSA'}\n` : '') +
          `--------------------------------------------------\n\n` +
          (isCustomContract ? 
            `1. CUSTOM CONTRACT / AGENCY MSA REQUEST\nThis shoot request is submitted under a Custom Client Contract / Agency Master Services Agreement (MSA). Studio V3.3 default terms remain subject to custom contract review and mutual alignment prior to shoot day confirmation.\n\n2. CAMERA GEAR & DATA PROTECTION CLAUSE\nAll camera bodies, memory cards, and raw captures remain confidential studio property. Participants may not touch equipment or delete media from cameras.\n` :
            `1. SCOPE OF PRODUCTION & VENUE RENTAL POLICY\nThis session is scheduled for studio/location photography production. Package rates cover photography, light design & retouched master deliverables. If a dedicated indoor studio venue space is required, applicable studio rental fees are billed at actuals (at cost).\n\n2. INTELLECTUAL PROPERTY & USAGE LICENSING\nThe legal copyright of all visual media remains exclusively with the Studio. Clients receive personal, social media, and web self-promotion usage rights.\n\n3. COMPREHENSIVE LIABILITY WAIVER\nParticipant(s) enter the studio workspace and perform physical poses entirely at their own risk.\n\n4. DELIVERABLES, REVISIONS & CLOUD ARCHIVAL\nDeliverables include 1 Round of Minor Revisions (within 7 days). Cloud retention is active for ${isTfpCat ? '3 Months' : '6 Months'}. RAW files are strictly excluded.\n\n5. UNAUTHORIZED CAMERA OPERATION & GEAR PROTECTION\nAll camera gear and memory cards are strictly hands-off.\n\n6. DIGITAL CONSENT & EMAIL ACCEPTANCE\nLegal acceptance is established by submitting this request.`
          ) +
          `\n\nnerdyphotographer.in studios\n` +
          `==================================================`
        ) : "";

        // One canonical inquiry body — the copy-paste block gets the full
        // version (release text included). The mailto/Gmail/Outlook links get
        // a COMPACT body without the release: embedding the full release used
        // to blow past browser URL length limits, so for test shoots the mail
        // app silently refused to open at all.
        const is3StepActive = $("#flowchart3Step") && $("#flowchart3Step").style.display !== "none";
        const paymentTermsText = is3StepActive ?
          `Payment Terms: 3-Tier Campaign Milestones (50% Advance Retainer before shoot day start [non-refundable]; 30% Review Milestone after shoot before proofing gallery [non-refundable]; 20% Final Release prior to receiving any downloadable file)` :
          `Payment Terms: Standard 50/50 Milestones (50% Advance Retainer before shoot day start [non-refundable]; 50% Final Balance after shoot wrap prior to receiving any downloadable file [non-refundable])`;

        const cleanBudget = (budget && budget !== "Not Decided" && budget !== "TBD") ? `Package & Deliverables: ${budget}\n` : "";
        const studioSpaceVal = val("b_studio_space") || 'Not Specified';
        const studioRentalPolicyNote = `Studio Rental Policy: Package rates cover photography, light design & retouched master deliverables. If a dedicated indoor studio space is required, venue rental fees are billed at actuals (at cost), or the client may book the studio directly.\n`;
        const travelPolicyNote = `Travel & Accommodation Policy: Shoots requiring travel beyond 20 km from the studio base (Noida) incur paid travel and, where an overnight stay is needed, accommodation - billed at actuals (at cost).\n`;
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
          `Location Pref: ${locationVal}\n` +
          `Studio Space Rental: ${studioSpaceVal}\n` +
          studioRentalPolicyNote +
          travelPolicyNote +
          cleanBudget +
          (type !== "Selective Collaboration (TFP)" ? `${paymentTermsText}\n` : "") +
          deliverablePolicyNote +
          gearPolicyNote +
          `Moodboard Link: ${moodboard || '—'}\n` +
          (agreedToTerms ? `TFP Release terms: Agreed (TFP-LIABILITY-RELEASE-V3.3)\nRead online: https://www.nerdyphotographer.in/book/#tfp-terms\n\n` : `\n`) +
          `Concept/Vision:\n${concept || '—'}`;
        const inquiryBody = compactBody + tfpReleaseText;
        const plainTextBody = `To: ${studioEmail}\nSubject: Shoot Booking Request — ${name}\n\n` + inquiryBody;

        const subject = encodeURIComponent(isCustomContract ? `Shoot Booking Request (CUSTOM CONTRACT REQUESTED) — ${name}` : `Shoot Booking Request — ${name}`);
        const body = encodeURIComponent(compactBody);

        const mailtoUrl = `mailto:${studioEmail}?subject=${subject}&body=${body}`;
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(studioEmail)}&su=${subject}&body=${body}`;
        const outlookUrl = `https://outlook.live.com/default.aspx?rru=compose&to=${encodeURIComponent(studioEmail)}&subject=${subject}&body=${body}`;

        // Populate manual link and copy block
        const mailtoLink = $("#bookMailtoLink");
        if (mailtoLink) mailtoLink.href = mailtoUrl;

        const gmailLink = $("#bookGmailLink");
        if (gmailLink) gmailLink.href = gmailUrl;

        const outlookLink = $("#bookOutlookLink");
        if (outlookLink) outlookLink.href = outlookUrl;

        const previewText = $("#inquiryTextPreview");
        if (previewText) previewText.textContent = plainTextBody;

        // Reveal the in-page success state with the right message for how
        // the inquiry actually went out (direct send vs. visitor's mail app).
        const showSuccess = (sentDirectly) => {
          // Auto-record booking in studio calendar
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
                  links: typeof getFormLinks === "function" ? getFormLinks() : [],
                  attachments: typeof attachedFiles !== "undefined" ? attachedFiles : [],
                  notes: `Location: ${locationVal} | Budget: ${budget}`
                });
              }
            });
            updateAdminReminders();
          }
          if (successPanel) {
            form.hidden = true;
            successPanel.hidden = false;
            const msgEl = $("#bookSuccessMsg");
            if (msgEl) {
              if (sentDirectly) {
                msgEl.innerHTML = `<strong style="color: var(--accent);">Request sent!</strong> Your booking inquiry has been delivered straight to the studio — no further action needed. We'll reply to <strong>${esc(email)}</strong>.` +
                  (agreedToTerms ? `<br/><br/><strong style="color: var(--accent);">Release Agreed:</strong> Your acceptance of the <em>Studio Production &amp; Liability Release</em> (TFP-LIABILITY-RELEASE-V3.3) was recorded with the request.` : "") +
                  `<br/><br/><span style="opacity: 0.8;">Want a copy for your own records? The buttons below open the same inquiry in your email app.</span>`;
              } else if (agreedToTerms) {
                msgEl.innerHTML = `Your booking inquiry is ready in your email app — please hit <strong>Send</strong> in your mail client to complete the request. <br/><br/><strong style="color: var(--accent);">Release Agreed:</strong> Your acceptance of the <em>Studio Production &amp; Liability Release</em> is noted in the email; the full terms text is included in the copy block below for your records.`;
              } else {
                msgEl.innerHTML = `Your booking inquiry is ready in your email app — please hit <strong>Send</strong> in your mail client to complete the request.`;
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
          "Location Pref": locationVal,
          "Budget Range": budget,
          "Moodboard Link": moodboard || "—",
          "Concept / Vision": concept || "—",
          "TFP Release": agreedToTerms ? "AGREED — TFP-LIABILITY-RELEASE-V3.3 (full text below)" : "Not applicable",
        };
        if (agreedToTerms) relayFields["Release Full Text"] = tfpReleaseText.trim();

        // Send FormSubmit background relay asynchronously
        fetch(`https://formsubmit.co/ajax/${encodeURIComponent(studioEmail)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(relayFields)
        })
        .then(res => {
          if (res.ok) {
            showSuccess(true);
          } else {
            showSuccess(false);
            try {
              if (mailtoUrl) window.location.href = mailtoUrl;
            } catch(e) {}
          }
        })
        .catch(() => {
          showSuccess(false);
          try {
            if (mailtoUrl) window.location.href = mailtoUrl;
          } catch(e) {}
        });
      };

      if (type === "Selective Collaboration (TFP)") {
        openTermsModal(name, "TFP", (agreed, isCustom, notes) => proceedSubmit(agreed, "TFP", isCustom, notes));
      } else {
        openTermsModal(name, "Commercial", (agreed, isCustom, notes) => proceedSubmit(agreed, "Commercial", isCustom, notes));
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
      if (customBtn) {
        customBtn.textContent = "📝 Request Custom Contract";
        customBtn.style.display = isTfp ? "none" : "inline-flex"; // Hide custom contract for fixed TFP collaborations
      }

      if (modalTitle) modalTitle.textContent = isTfp ? "Studio Production & Liability Release" : "Commercial Shoot Contract & Production Agreement";
      if (modalTag) modalTag.textContent = isTfp ? "TFP-LIABILITY-RELEASE-V3.3 (ACTIVE)" : "COMMERCIAL-CONTRACT-V3.3 (ACTIVE)";
      if (partnerNameEl) partnerNameEl.textContent = partnerName || "Valued Client";
      
      if (sec4Text) {
        sec4Text.innerHTML = isTfp ? 
          `As a creative collaboration, test shoots (TFP collabs) include a <strong>Full Proofing Gallery + 8 to 12 Retouched Master Clicks</strong>. Deliverables include 1 Round of Minor Revisions (within 7 days). Cloud retention is active for 3 Months (90 days). The Studio retains final artistic authority over image selection and editing styles. Locations &gt;20 km from Noida require client-funded travel, conveyance &amp; accommodation. Under no circumstances will raw unedited files (RAW format) be delivered.` :
          `Commercial productions include a <strong>Full Proofing Gallery + contracted retouched master deliverables</strong> specified in the rate tier. Deliverables include 1 Round of Minor Revisions (within 7 days). Cloud retention is active for 6 Months (180 days). Extended usage licensing or RAW file access requires separate buyout agreements. Dedicated indoor studio venue rentals are billed <strong>at actuals (at cost)</strong>. Payment terms follow 50/50 non-refundable milestone payments.`;
      }

      $("#termsModal").style.display = "flex";
      const acceptBtn = $("#termsAcceptBtn");

      // Setup HTML5 Signature Canvas
      const canvas = $("#termsSigCanvas");
      const sigHint = $("#termsSigHint");
      const clearBtn = $("#clearTermsSigBtn");
      let isDrawing = false;
      let hasSigned = false;
      let ctx = null;

      if (canvas) {
        ctx = canvas.getContext("2d");
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        const getPos = (e) => {
          const rect = canvas.getBoundingClientRect();
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          return { x: clientX - rect.left, y: clientY - rect.top };
        };

        const startDraw = (e) => {
          isDrawing = true;
          hasSigned = true;
          if (sigHint) sigHint.style.display = "none";
          const pos = getPos(e);
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
        };

        const draw = (e) => {
          if (!isDrawing) return;
          e.preventDefault();
          const pos = getPos(e);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        };

        const stopDraw = () => { isDrawing = false; };

        canvas.onmousedown = startDraw;
        canvas.onmousemove = draw;
        canvas.onmouseup = stopDraw;
        canvas.ontouchstart = startDraw;
        canvas.ontouchmove = draw;
        canvas.ontouchend = stopDraw;

        if (clearBtn) {
          clearBtn.onclick = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            hasSigned = false;
            if (sigHint) sigHint.style.display = "flex";
          };
        }
      }

      const close = () => {
        $("#termsModal").style.display = "none";
        if (acceptBtn) acceptBtn.removeEventListener("click", onAcceptClick);
        if (customBtn) customBtn.removeEventListener("click", onCustomClick);
        if (declineBtn) declineBtn.removeEventListener("click", onDeclineClick);
      };

      const onAcceptClick = () => {
        if (!hasSigned) {
          alert("Please draw your signature to agree and continue!");
          return;
        }
        close();
        if (onAccept) onAccept(true, false, "");
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
          if (onAccept) onAccept(true, true, notes);
        }
      };

      if (acceptBtn) acceptBtn.addEventListener("click", onAcceptClick);
      if (declineBtn) declineBtn.addEventListener("click", onDeclineClick);
      if (customBtn) customBtn.addEventListener("click", onCustomClick);
    }

    // Wire copy button
    $("#copyInquiryBtn")?.addEventListener("click", () => {
      const txt = $("#inquiryTextPreview")?.textContent || "";
      navigator.clipboard.writeText(txt);
      const btnEl = $("#copyInquiryBtn");
      if (btnEl) {
        const orig = btnEl.textContent;
        btnEl.textContent = "Copied! ✓";
        setTimeout(() => { btnEl.textContent = orig; }, 2000);
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

    // noth.in full-bleed work cards → open the shoot in the lightbox.
    view.querySelectorAll(".noth-work").forEach((card) => {
      const s = CURRENT_VIEW_SHOOTS.find((x) => x.id === card.dataset.shoot) || SHOOTS.find((x) => x.id === card.dataset.shoot);
      if (!s) return;
      const isCc = (s.isCompCard || s.type === "Selective Collaboration (TFP)") && isCurrentlyCompCardView();
      const list = s.photos.filter((p) => !(isCc && p.excludeFromCompCard)).map((p) => ({ ...p, shoot: s }));
      const media = card.querySelector(".noth-work-media");
      const cta = card.querySelector(".noth-work-cta");
      const open = () => openLb(list, 0);
      media?.addEventListener("click", open);
      cta?.addEventListener("click", open);

      // Wire share button
      const shareBtn = card.querySelector(".work-share");
      shareBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const shareUrl = `${window.location.origin}/share/${s.id}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
          toast("Link copied to clipboard");
        }).catch(() => {
          toast("Failed to copy link");
        });
      });

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
          const frameRatio = media.clientWidth / media.clientHeight || (16 / 9);
          // Portrait covers, or ratios that differ a lot, get contained + padded.
          const mismatch = imgRatio < 1 || Math.abs(imgRatio - frameRatio) / frameRatio > 0.35;
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
      const isCc = (s.isCompCard || s.type === "Selective Collaboration (TFP)" || s.type === "Test Shoot") && isCurrentlyCompCardView();
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
  const ROUTES = { "": viewHome, "albums": viewAlbums, "categories": viewCategories, "studio": viewStudio, "upload": viewUpload, "book": viewBook, "calendar": viewCalendar, "testimonials": viewTestimonials, "workshop-attended": viewWorkshopAttended, "analytics": viewAnalytics };

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
        html = viewSharedAlbum(kind);
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
          "name": s.title || s.talent || "Photoshoot",
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
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.1, rootMargin: "0px 0px -8% 0px" });
    items.forEach((el) => io.observe(el));
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
    const sweep = () => items.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight + 200) el.classList.add("in");
    });
    window.addEventListener("scroll", sweep, { passive: true });
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
    <div style="border-top: 2px solid #000; padding-top: calc(10px * var(--print-scale, 1)); margin-top: auto; font-family: sans-serif; font-size: calc(8.5px * var(--print-scale, 1)); color: #000; line-height: 1.5; display: flex; flex-direction: column; gap: calc(4px * var(--print-scale, 1)); text-align: left; width: 100%; flex: 0 0 auto;">
      <div style="font-family:'JetBrains Mono', monospace; font-size: calc(10px * var(--print-scale, 1)); font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: 0.05em; background: #f4f4f2; padding: calc(6px * var(--print-scale, 1)) calc(10px * var(--print-scale, 1)); border-radius: 4px; border: 1px solid #dcdad5; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>📸 Photographed by nerdyphotographer.in</span>
          <span>·</span>
          <span style="display: inline-flex; align-items: center; gap: 4px;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
            @nerdyphotographer.in
          </span>
        </div>
        <span style="font-weight: 700; color: var(--accent, #d24e1a);">www.nerdyphotographer.in</span>
      </div>
      <div style="color: #555; font-size: calc(7.5px * var(--print-scale, 1));">Where brands and models build their story — Fashion, Fitness, Lifestyle &amp; Sports Photography | Noida. All portfolio cards, comp cards, and photography frames are official creative works produced under nerdyphotographer.in studio.</div>
    </div>
  `;

  function printStatsBarHtml(shoot) {
    if (shoot.showStatsOnCompCard === false) return "";

    const statsArr = [];
    if (shoot.height) statsArr.push(`Height: ${shoot.height}`);
    if (shoot.chest) statsArr.push(`Chest/Bust: ${shoot.chest}`);
    if (shoot.waist) statsArr.push(`Waist: ${shoot.waist}`);
    if (shoot.hips) statsArr.push(`Hips: ${shoot.hips}`);
    if (shoot.shoes) statsArr.push(`Shoes: ${shoot.shoes}`);
    if (shoot.modelHair) statsArr.push(`Hair: ${shoot.modelHair}`);
    if (shoot.modelEyes) statsArr.push(`Eyes: ${shoot.modelEyes}`);
    const statsLine = statsArr.join("  ·  ");
    return statsLine ? `
      <div style="font-family:'JetBrains Mono', monospace; font-size: calc(11px * var(--print-scale, 1)); font-weight: 700; background: #f5f5f5; color: #000; padding: calc(10px * var(--print-scale, 1)) calc(14px * var(--print-scale, 1)); text-transform: uppercase; letter-spacing: 0.05em; text-align: center; border-radius: 6px; margin-bottom: calc(20px * var(--print-scale, 1)); border: 1px solid #e0e0e0; flex: 0 0 auto;">
        ${statsLine}
      </div>
    ` : "";
  }

  function printSocialsBarHtml(shoot) {
    const printSocials = [];
    if (shoot.instagram) {
      const filteredHandles = compCardOwnHandles(shoot, shoot.instagram.split(",").map(x => x.trim()).filter(Boolean), isIgHandle);
      if (filteredHandles.length) {
        const cleaned = filteredHandles.map(h => h.startsWith("@") ? h : `@${h.split("/").pop()}`);
        printSocials.push(`Instagram: ${cleaned.join(", ")}`);
      }
    }
    if (shoot.kavyar) {
      const filteredHandles = compCardOwnHandles(shoot, shoot.kavyar.split(",").map(x => x.trim()).filter(Boolean), isKavyarHandle);
      if (filteredHandles.length) {
        const cleaned = filteredHandles.map(h => h.split("/").pop());
        printSocials.push(`Kavyar: ${cleaned.join(", ")}`);
      }
    }
    const socialsLine = printSocials.join("   |   ");
    return socialsLine ? `
      <div style="font-family:'JetBrains Mono', monospace; font-size: calc(10px * var(--print-scale, 1)); font-weight: 700; color: #333; padding: calc(6px * var(--print-scale, 1)) calc(12px * var(--print-scale, 1)); text-transform: uppercase; letter-spacing: 0.05em; text-align: center; margin-bottom: calc(20px * var(--print-scale, 1)); border-bottom: 1px solid #ddd; padding-bottom: calc(10px * var(--print-scale, 1)); flex: 0 0 auto;">
        ${socialsLine}
        <div style="font-family: sans-serif; font-size: calc(8.5px * var(--print-scale, 1)); font-weight: 400; color: #555; text-transform: none; letter-spacing: 0; margin-top: calc(5px * var(--print-scale, 1)); font-style: italic;">
          To book this talent, connect directly with the model or their representing agency via the social channels above.
        </div>
      </div>
    ` : "";
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
      <div style="font-family:'JetBrains Mono', monospace; font-size: calc(9px * var(--print-scale, 1)); font-weight: 600; color: #333; padding: calc(6px * var(--print-scale, 1)) calc(12px * var(--print-scale, 1)); text-transform: uppercase; letter-spacing: 0.05em; text-align: center; margin-bottom: calc(20px * var(--print-scale, 1)); flex: 0 0 auto;">
        Credits: ${creditsItems}
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
      document.title = `${cleanModelName}_${docType}_Shot_By_NerdyPhotographerin_${stamp}`;
      // Flip visible only for the print snapshot itself. The screen never
      // paints the container: no yield to the event loop happens between
      // this assignment and window.print() blocking. Doing it here in JS
      // (not only via the @media print rule in styles.css) means a stale
      // cached stylesheet can't leave the container hidden during the
      // snapshot — that skew (new app.js + old styles.css under the same
      // ?v=) produced blank PDFs on the live site.
      printContainer.style.setProperty("visibility", "visible", "important");
      document.body.classList.add("is-printing");
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove("is-printing");
      }, 1000);
    }, 150);
      document.title = oldTitle;

      printContainer.style.display = prevDisplay;
      printContainer.style.position = prevPosition;
      printContainer.style.left = prevLeft;
      printContainer.style.top = prevTop;
      printContainer.style.visibility = prevVisibility;
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

    // Render up to 5 side photos — the card stays at 6 photos max so the
    // model stays highlighted, per the studio's comp card format. The
    // post-load layout pass (layoutCompCardMainRow) decides how many to
    // actually keep based on which count tiles the sheet best for the
    // shapes drawn this export.
    const side = photos.slice(1, 6);

    return `
      <div class="print-page${!hasDetails ? " no-details" : ""}">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: calc(8px * var(--print-scale, 1)); margin-bottom: calc(10px * var(--print-scale, 1)); flex: 0 0 auto;">
          <span style="font-family:'JetBrains Mono', monospace; font-size: calc(10px * var(--print-scale, 1)); font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.1em;">MODEL COMP CARD</span>
          <span style="font-family:'JetBrains Mono', monospace; font-size: calc(10px * var(--print-scale, 1)); font-weight: 800; color: #000; text-transform: uppercase;">Clicked by nerdyphotographer.in</span>
        </div>
        <h1 style="font-family:'Outfit', sans-serif; font-size: calc(30px * var(--print-scale, 1)); font-weight: 800; margin: 0 0 calc(10px * var(--print-scale, 1)); text-transform: uppercase; color: #000; letter-spacing: -0.02em; flex: 0 0 auto;">${name}</h1>
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
    if (shoot.chest) rows.push(["Chest/Bust", shoot.chest]);
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
    if (shoot.instagram) {
      const handles = compCardOwnHandles(shoot, shoot.instagram.split(",").map(x => x.trim()).filter(Boolean), isIgHandle);
      if (handles.length) {
        const cleaned = handles.map(h => h.startsWith("@") ? h : `@${h.split("/").pop()}`);
        rows.push(["Instagram", cleaned.join(", "), false]);
      }
    }
    if (manualFields.phone) rows.push(["Phone", manualFields.phone, true]);
    if (manualFields.brands && manualFields.brands.length) rows.push(["Worked With", manualFields.brands.join(" · "), true]);
    if (!rows.length) return "";
    return rows.map(([label, val, isManual]) => `
      <div>
        <p style="font-family:'JetBrains Mono', monospace; font-size: calc(8px * var(--print-scale, 1)); letter-spacing: 0.1em; text-transform: uppercase; color: #999; margin: 0 0 2px;">${esc(label)}${isManual ? ` <span style="font-weight:400; text-transform:none; letter-spacing:0;">(optional, provided by model)</span>` : ""}</p>
        <p style="font-size: calc(11px * var(--print-scale, 1)); font-weight: 700; color: ${label === "Instagram" ? "var(--accent, #d24e1a)" : "#000"}; margin: 0;">${esc(val)}</p>
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
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; flex: 0 0 auto;">
          <span style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.1em;">MODEL PORTFOLIO</span>
          <span style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color: #000; text-transform: uppercase;">Clicked by nerdyphotographer.in</span>
        </div>
        <div style="display: flex; gap: 16px; flex: 1 1 auto; min-height: 0;">
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 10px;">
            <p style="font-family:'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: var(--accent, #d24e1a); text-transform: uppercase; letter-spacing: 0.15em; margin: 0;">The Composite Lookbook</p>
            <h1 style="font-family:'Outfit', sans-serif; font-size: 34px; font-weight: 800; margin: 0; text-transform: uppercase; color: #000; letter-spacing: -0.03em; line-height: 1.05;">${esc(name)}</h1>
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
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; flex: 0 0 auto;">
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
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 14px; flex: 0 0 auto;">
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

      const shoot = SHOOTS.find(x => x.id === shootId) || (window.currentCompCardShootObj);
      const modelName = shoot ? getTalentCleanName(shoot.talent || shoot.title) : "Unknown Model";

      // Best-effort analytics log — never blocks or fails the download itself,
      // since the visitor has no way to fix a backend outage on their end.
      fetch(`${COMP_CARD_API_BASE}/api/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          modelName,
          shootId,
          orientation: targetOrient,
          originUrl: window.location.origin
        })
      }).catch((err) => console.warn("Comp card download logging failed (non-blocking):", err));

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

  window.downloadLogsCSV = () => {
    // The passcode is asked for on demand and never stored in the page's
    // public source; the log server compares its SHA-256 hash.
    const passcode = prompt("Enter admin passcode to download the logs CSV:");
    if (!passcode) return;
    // A bare relative path only resolves on the local/Render server that
    // actually hosts /api/logs — on the live GitHub Pages site (a different
    // origin) this 404'd. The POST side of this feature already routes
    // through COMP_CARD_API_BASE; this was the one spot that didn't.
    window.location.href = `${COMP_CARD_API_BASE}/api/logs/download?passcode=${encodeURIComponent(passcode.trim())}`;
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
      const fresh = parseShootsFromDataJs(await res.text());
      if (!fresh || !usingDemo) return;
      if (JSON.stringify(fresh) === JSON.stringify(window.WPS_DATA.DEMO_SHOOTS)) return;
      window.WPS_DATA.DEMO_SHOOTS = fresh;
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
    if (headerBrandText) headerBrandText.innerHTML = `<span style="text-transform: lowercase; font-weight: 800; font-size: 15px; letter-spacing: 0.02em;">${esc(cfg.studioName)}</span>`;
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
        <button id="clearCacheBtn" type="button" title="Clear cached files and reload the latest version" style="background:none; border:1px solid currentColor; color:inherit; font-family:inherit; font-size:10px; font-weight:700; padding:6px 12px; border-radius:100px; cursor:pointer; text-transform:uppercase; letter-spacing:0.1em; transition:all 0.3s; outline:none;">↻ Load Fresh Version</button>`;
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
      p.innerHTML = `<a href="#" id="footerClearCache" title="Clear cached files and reload the latest version" style="font-size: 11px; opacity: 0.75;">↻ Load fresh version</a>`;
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
    navigator.serviceWorker.register('/sw.js?v=238').catch(() => {});
  });
}


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