/* The booking form's wiring (v619). It was wireBook() inside app.js: 257 KB, a third of the file, that only the booking
   page needs, downloaded and parsed on every other page too. It now lives here and is fetched when a page with a booking
   form is shown (loadBookForm in app.js, the same way contracts.js and admin.js are). Nothing about the form changed: this is
   the same function body, run in its own file, given the 31 things it used from app.js through `ctx` — all of them
   only read, never changed, which is checked when this file is made. The rest it uses is on `window` already. */
(() => {
  "use strict";
  window.WPS_BOOK_FORM = function wireBook(ctx) {
    const { $, addCalBooking, esc, generateContractNumber, getAdminPackages, getAdminTfpPackage, getCalDateKey, getCalDateStatus, getHomeStudioRate, getPackageScheduleKey, getProductionSchedule, getStudio, HOME_STUDIO_AREA, HOME_STUDIO_NAME, isAdmin, isStudioVenue, loadContracts, PACKAGE_SCHEDULES, prefersReduced, pricesArePublished, saveLocalContractAudit, setContractEmailStatus, splitPackageMilestones, studioLabel, studioText, testShootFullMessage, testShootMonthKey, testShootSpots, testShootSpotsLine, toast, toggleCalDateBlock } = ctx;
    const form = $("#bookingForm"), btn = $("#bookSubmitBtn");
    if (!form) return;
    const successPanel = $("#bookSuccess");
    const studioEmail = window.STUDIO_CONFIG?.email || "prateeksaxenaphotography@gmail.com";

    const val = (id) => $("#" + id)?.value.trim() || "";
    // What the studio costs with the package chosen in the budget box (v624): the package's own fee, else the standard rate.
    const studioRateNow = (forTest) => window.getHomeStudioRateFor(window.packageOfBudget($("#b_budget")?.value), forTest);
    /* How they found the studio (v621). Optional from end to end: nothing here ever blocks a send or asks twice. Only
       "Referred by someone" opens the second box, and that box is optional too. What reaches the studio is a line for the
       answer and, for a referral, a line for who (or "(no details given)" when they chose it and left the box empty). */
    const REFERRED = "Referred by someone";
    const heardOf = () => {
      const heard = val("b_heard");
      const referredBy = heard === REFERRED ? val("b_referrer").replace(/\s+/g, " ").slice(0, 120) : "";
      const lines = heard ? `How they heard about the studio: ${heard}\n` + (heard === REFERRED ? `Referred by: ${referredBy || "(no details given)"}\n` : "") : "";
      const fields = heard ? { "How they heard about the studio": heard, ...(heard === REFERRED ? { "Referred by": referredBy || "(no details given)" } : {}) } : {};
      return { heard, referredBy, lines, fields };
    };
    const fieldOf = (id) => $("#" + id)?.closest(".field, .check-line");

    // "Today" is India's today: the studio is in Noida, and a visitor abroad
    // used to be told a date was past, or open, by their own clock (Sep 2026
    // audit, B35). Promo codes already used India's date.
    const indiaToday = () => {
      const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      d.setHours(0, 0, 0, 0);
      return d;
    };
    /* A typed date is read only when it names a real day: "24 Oct 2026",
       "Oct 24", "24/10/2026" (day first, as written in India), "tomorrow". A
       day with no year means its next occurrence. Anything vaguer ("mid-July",
       "next month") is a timeline, not a date — it travels to the studio as
       written and is never guessed into a day. The browser's own guessing
       turned "Mid-July 2027" into a Thursday and "October 3" into 2001
       (Sep 2026 audit, B20). */
    const MONTHS_IDX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
    const parseOneTypedDate = (raw) => {
      const s = String(raw || "").trim().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/i, "").replace(/(\d)(st|nd|rd|th)\b/gi, "$1").replace(/\s+/g, " ");
      if (!s) return null;
      const today = indiaToday();
      if (/^today$/i.test(s)) return today;
      if (/^tomorrow$/i.test(s)) { const t = new Date(today); t.setDate(t.getDate() + 1); return t; }
      const make = (y, m, d, yearGiven) => {
        let dt = new Date(y, m, d);
        if (dt.getMonth() !== m || dt.getDate() !== d) return null;
        if (!yearGiven && dt < today) dt = new Date(y + 1, m, d);
        return dt;
      };
      let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
      if (m) return make(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1], true);
      m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) return make(+m[1], +m[2] - 1, +m[3], true);
      const monthOf = (w) => MONTHS_IDX[w.slice(0, 4).toLowerCase()] ?? MONTHS_IDX[w.slice(0, 3).toLowerCase()];
      m = s.match(/^(\d{1,2}) ([a-z]+)\.?,? ?(\d{4})?$/i);
      if (m && monthOf(m[2]) !== undefined) return make(m[3] ? +m[3] : today.getFullYear(), monthOf(m[2]), +m[1], !!m[3]);
      m = s.match(/^([a-z]+)\.? (\d{1,2}),? ?(\d{4})?$/i);
      if (m && monthOf(m[1]) !== undefined) return make(m[3] ? +m[3] : today.getFullYear(), monthOf(m[1]), +m[2], !!m[3]);
      return null;
    };
    const parseTypedDates = (text) => String(text || "")
      .split(/\s*[–—]\s*|\s+to\s+/i)
      .flatMap((part) => part.split(/,(?=\s*[A-Za-z])|;/))
      .map(parseOneTypedDate)
      .filter(Boolean);

    /* Test shoots per month (v607). A client asking for a test shoot in a month
       the studio has filled is told so — in the picker when they click a day,
       under the date when the date or the kind of booking changes afterwards,
       and again when they press Send. The studio, signed in, is never held to
       it. The rules themselves (testShootSpots and friends) sit with the
       calendar; this only asks them about THIS form. */
    const bookingIsTestShoot = () => ($("#b_type")?.value || "") === "Selective Collaboration (TFP)";
    /* "Book with the date to be agreed" (v615, the owner: "the date is not confirmed, rest
       everything else the client should see and approve"). When a test shoot's month is
       full the client can book anyway: the costs and the terms are read and signed as
       usual and the booking says the shoot date is "to be agreed", which contract V4.3
       explains. No day is asked for, so no month or code window is checked. */
    let dateToBeAgreed = false;
    const requestedDays = () => {
      const el = $("#b_date");
      if (!el || dateToBeAgreed) return [];
      return Array.isArray(el._wpsPickedDates) && el._wpsPickedDates.length ? el._wpsPickedDates.slice() : parseTypedDates(el.value);
    };
    /* A place agreed by email (v613): the invite code typed in lets THIS date through
       although its month is full — see window.codeAllowsFullMonth. */
    const monthAgreedByCode = (d) => { try { return window.codeAllowsFullMonth(bookingCalc.matchedInvite, getCalDateKey(d)); } catch (e) { return false; } };
    const monthKeyAgreed = (m) => { try { const e = bookingCalc.matchedInvite, w = e && e.allowFullMonth === true && window.codeShootWindow(e); return !!w && (!w.from || m >= w.from.slice(0, 7)) && (!w.to || m <= w.to.slice(0, 7)); } catch (x) { return false; } };
    const testMonthIsFull = (d) => { const sp = testShootSpots(testShootMonthKey(d)); return !!(sp && sp.full) && !monthAgreedByCode(d); };
    function testLimitProblem() {
      if (isAdmin() || !bookingIsTestShoot()) return "";
      const hit = requestedDays().find(testMonthIsFull);
      return hit ? testShootFullMessage(testShootMonthKey(hit)) : "";
    }
    /* Codes that limit which shoot dates may be booked (v608): the invite and/or
       promo code the client has applied that is live and carries a window. A day
       must fall inside EVERY window. */
    function activeCodeWindows() {
      try { return [bookingCalc.matchedInvite, bookingCalc.matchedDiscount].filter((e) => e && typeof e === "object" && window.codeShootWindow(e)); }
      catch (e) { return []; }
    }
    const codeWindowRefusing = (d) => { if (isAdmin()) return null; const key = getCalDateKey(d); return activeCodeWindows().find((e) => !window.shootDateAllowedBy(e, key)) || null; };
    function codeWindowProblem() {
      const bad = requestedDays().map(codeWindowRefusing).find(Boolean);
      return bad ? window.shootWindowMessage(bad) : "";
    }
    // The one answer for the date box: a code's window first, then a full test-shoot month.
    const dateRuleProblem = () => (dateToBeAgreed ? "" : codeWindowProblem() || testLimitProblem());
    const preferredDates = () => ($("#b_date")?.value || "").trim();
    // What the booking says the date is: the words contract V4.3 names, then any dates they would like.
    const dateAgreedWords = () => { const p = preferredDates(); return p ? `To be agreed (preferred: ${p})` : "To be agreed"; };
    // The way out of a full month (v608): a request instead of a booking.
    // Offered only for the full-month case, never for a code's date window.
    const canAskInstead = () => !isAdmin() && !codeWindowProblem() && !!testLimitProblem();
    let askForDatesHandler = null;
    function setDateLater(on) {
      dateToBeAgreed = !!on;
      const box = $("#b_date_later"), text = $("#b_date_label_text"), inp = $("#b_date"), tog = $("#datePickerToggle");
      if (box) box.hidden = !on;
      if (text) text.textContent = on ? "Dates you would like (optional)" : "Preferred Date / Timeline *";
      if (inp) { inp.placeholder = on ? "e.g. any Saturday in January — or leave empty" : "e.g. 24 Oct 2026, or use the calendar →"; if (on) { inp._wpsPickedDates = []; inp.value = ""; } }
      if (tog) tog.hidden = !!on;
      clearError("b_date");
      paintTestLimitNote();
    }
    $("#b_date_later_undo")?.addEventListener("click", () => { setDateLater(false); $("#b_date")?.focus(); });
    function paintTestLimitNote() {
      const note = $("#b_date_limit_note");
      if (!note) return;
      // It only ever belongs to a test shoot the client is making, and the studio is never held to a month.
      if (dateToBeAgreed && (!bookingIsTestShoot() || isAdmin())) { setDateLater(false); return; }
      const msg = dateRuleProblem();
      note.textContent = msg;
      note.style.display = msg ? "block" : "none";
      const ask = $("#b_date_request_btn");
      if (ask) ask.hidden = dateToBeAgreed || !canAskInstead();
    }
    $("#b_date_request_btn")?.addEventListener("click", () => askForDatesHandler && askForDatesHandler());
    ["change", "input", "click"].forEach((ev) => $("#bookingForm")?.addEventListener(ev, () => setTimeout(paintTestLimitNote, 0)));

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
          <input class="b_moodboard_input" type="url" aria-label="Another moodboard link" placeholder="Additional Pinterest, Drive, or Dropbox URL" style="padding: 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: var(--font-sm);" />
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
      /* Tied to its field, so a screen reader reads the message with the
         field and knows it is wrong (Sep 2026 audit, G6). */
      note.id = `${id}_error`;
      const input = document.getElementById(id);
      if (input) {
        input.setAttribute("aria-invalid", "true");
        const was = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter((x) => x && x !== note.id);
        input.setAttribute("aria-describedby", [...was, note.id].join(" "));
      }
    }
    function clearError(id) {
      const field = fieldOf(id);
      if (!field) return;
      field.classList.remove("field-invalid");
      field.querySelector(".field-error")?.remove();
      const input = document.getElementById(id);
      if (input) {
        input.removeAttribute("aria-invalid");
        const rest = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter((x) => x && x !== `${id}_error`);
        if (rest.length) input.setAttribute("aria-describedby", rest.join(" ")); else input.removeAttribute("aria-describedby");
      }
    }
    // Clear an error the moment the visitor starts fixing it.
    ["b_name", "b_email", "b_date", "b_instagram", "b_location", "b_phone", "b_subject_name", "b_subject_email", "b_guardian_name", "b_guardian_email"].forEach((id) => {
      $("#" + id)?.addEventListener("input", () => clearError(id));
    });
    $("#b_authorised")?.addEventListener("change", () => clearError("b_authorised"));
    $("#b_adult")?.addEventListener("change", () => clearError("b_adult"));
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
      let limitMsg = "";             // why the last-clicked day was refused (test-shoot month full)
      let limitMsgAsk = false;       // …and whether a request is the way out (a full month, not a code's window)
      let viewYear, viewMonth; // currently displayed month

      const today = indiaToday();
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
        // A range means every day in it: only the two ends used to be checked
        // and held, so Sat → Sat passed over five closed weekdays (B29).
        const everyDay = (a, b) => {
          if (!a || !b) return [a || b].filter(Boolean);
          const out = [], d = new Date(Math.min(a, b)), end = new Date(Math.max(a, b));
          for (; d <= end && out.length < 62; d.setDate(d.getDate() + 1)) out.push(new Date(d));
          return out;
        };
        dateInput._wpsPickedDates = (pickerMode === "range"
          ? everyDay(rangeStart, rangeEnd)
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
        // The date is to be agreed (v615): what they typed are dates they would like, not a day being booked.
        if (dateToBeAgreed) { badge.style.display = "none"; if (bookedNote) bookedNote.style.display = "none"; return; }
        const valStr = dateInput.value.trim();
        if (!valStr) {
          badge.style.display = "none";
          if (bookedNote) bookedNote.style.display = "none";
          return;
        }

        let targetDate = rangeStart || (multiDates.length ? multiDates[0] : null);
        if (!targetDate) {
          const parsed = parseTypedDates(valStr)[0];
          if (parsed) targetDate = parsed;
        }

        if (!targetDate) {
          badge.style.display = "none";
          if (bookedNote) bookedNote.style.display = "none";
          return;
        }

        const todayObj = indiaToday();
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

        if ((st.hasWorkshop || st.hasAssisting) && !st.hasConfirmedBooking) {
          badge.style.background = "rgba(156,163,175,0.12)";
          badge.style.border = "1px solid rgba(156,163,175,0.3)";
          badge.style.color = "#6b7280";
          badge.innerHTML = "🔒 PHOTOGRAPHER AWAY";
          if (bookedNote) bookedNote.style.display = "none";
        } else if (st.isBusyOnly) {
          badge.style.background = "rgba(220,38,38,0.12)";
          badge.style.border = "1px solid rgba(220,38,38,0.3)";
          badge.style.color = "#dc2626";
          badge.innerHTML = "🔴 BUSY";
        } else if (st.isBooked) {
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
          badge.innerHTML = (targetDate.getDay() === 0 || targetDate.getDay() === 6) ? "🔒 NOT AVAILABLE" : "🔒 WEEKDAY — CLOSED";
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
            <span class="dp-legend-item"><span class="dp-legend-dot dot-booked"></span> Booked</span>
            <span class="dp-legend-item"><span class="dp-legend-dot dot-testshoot"></span> Test shoot</span>
            <span class="dp-legend-item"><span class="dp-legend-dot dot-workshop"></span> Workshop</span>
            <span class="dp-legend-item"><span class="dp-legend-dot dot-assisting"></span> Assisting</span>
            <span class="dp-legend-item"><span class="dp-legend-dot dot-blocked"></span> Closed (weekdays)</span>
          </div>
          <div class="dp-nav">
            <button type="button" class="dp-nav-btn dp-prev" aria-label="Previous month">‹</button>
            <span class="dp-month-year">${MONTHS[viewMonth]} ${viewYear}</span>
            <button type="button" class="dp-nav-btn dp-next" aria-label="Next month">›</button>
          </div>
          ${(() => {
            if (isUserAdmin) return "";
            const note = (cls, text) => `<p class="${cls}" style="margin: 2px 0 6px; font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--ink-soft); text-align: center; line-height: 1.45;">${esc(text)}</p>`;
            const wins = activeCodeWindows().map((e) => window.shootWindowMessage(e));
            const monthNow = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
            let line = bookingIsTestShoot() ? testShootSpotsLine(monthNow) : null;
            if (line && monthKeyAgreed(monthNow) && (testShootSpots(monthNow) || {}).full) line = "This month is full, but the studio has agreed your date with you.";
            return `${wins.length ? note("dp-window", wins.join(" ")) : ""}${line ? note("dp-spots", line) : ""}${limitMsg ? `<p class="dp-limit-msg" role="alert" style="margin: 0 0 8px; padding: 8px 10px; border-radius: 8px; background: rgba(220,38,38,0.08); border: 1px solid rgba(220,38,38,0.3); color: #b91c1c; font-size: var(--font-xs); line-height: 1.45; font-weight: 600;">${esc(limitMsg)}${limitMsgAsk ? ` <button type="button" class="dp-request-btn link-arrow" style="padding: 0; margin-left: 4px; font-size: var(--font-xs);">Book with the date to be agreed →</button>` : ""}</p>` : ""}`;
          })()}
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
              titleAttr = "Unavailable: away on another shoot";
              isCellDisabled = true;
            } else if (status.isBusyOnly) {
              classes.push("dp-booked");
              titleAttr = "Busy that day — you can still send a request, and I'll confirm or suggest another time";
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

          // A code that allows only some shoot dates: the others are greyed out
          // and say why (v608). Only days a client could otherwise ask for — a
          // closed weekday or a day the photographer is away keeps its own reason.
          if (!past && !isUserAdmin) {
            const refusing = codeWindowRefusing(d);
            if (refusing && !classes.includes("dp-workshop") && !classes.includes("dp-assisting") && !classes.includes("dp-blocked")) {
              ["dp-active", "dp-booked", "dp-testshoot", "dp-open-weekday"].forEach((c) => { const i = classes.indexOf(c); if (i >= 0) classes.splice(i, 1); });
              classes.push("dp-outside");
              titleAttr = window.shootWindowMessage(refusing);
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

      // A test-shoot client clicking a day in a month that is full: the day is
      // not taken, and the reason is said in the picker itself.
      function refuseFullTestMonth(clicked) {
        if (isAdmin() || !bookingIsTestShoot() || !testMonthIsFull(clicked)) { limitMsg = ""; limitMsgAsk = false; return false; }
        limitMsg = testShootFullMessage(testShootMonthKey(clicked));
        limitMsgAsk = true;
        renderCalendar();
        return true;
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
          limitMsg = ""; limitMsgAsk = false;
          renderCalendar();
        });
        popup.querySelector(".dp-next")?.addEventListener("click", (e) => {
          e.stopPropagation();
          viewMonth++;
          if (viewMonth > 11) { viewMonth = 0; viewYear++; }
          limitMsg = ""; limitMsgAsk = false;
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
              if (refuseFullTestMonth(clicked)) return;
              selectDate(clicked);
              toast(`Heads up — ${MONTHS[viewMonth]} ${day} already has a booking. You're welcome to send a request anyway; I'll confirm or suggest another date.`);
            });
          });

          popup.querySelectorAll(".dp-cell.dp-outside").forEach(cell => {
            cell.addEventListener("click", (e) => {
              e.stopPropagation();
              const refusing = codeWindowRefusing(new Date(viewYear, viewMonth, parseInt(cell.dataset.day)));
              limitMsg = refusing ? window.shootWindowMessage(refusing) : "";
              limitMsgAsk = false;
              renderCalendar();
            });
          });

          popup.querySelectorAll(".dp-cell.dp-blocked").forEach(cell => {
            cell.addEventListener("click", (e) => {
              e.stopPropagation();
              const day = cell.dataset.day;
              toast(`${MONTHS[viewMonth]} ${day} is a weekday — shoots run on Saturdays and Sundays. Pick a weekend, or email to ask about a weekday.`);
            });
          });
          popup.querySelectorAll(".dp-cell.dp-active").forEach(cell => {
            cell.addEventListener("click", (e) => {
              e.stopPropagation();
              const day = parseInt(cell.dataset.day);
              const clicked = new Date(viewYear, viewMonth, day);
              if (refuseFullTestMonth(clicked)) return;
              selectDate(clicked);
            });
          });
        }

        popup.querySelector(".dp-request-btn")?.addEventListener("click", (e) => {
          e.stopPropagation();
          closePopup();
          askForDatesHandler && askForDatesHandler();
        });

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
    /* This booking's deliverables, read off the form as it stands — the invite
       or promo code typed in, the kind of shoot, the package (see
       window.bookingDeliverables). Every place the booking shows or records
       them asks this, so the quote, the notices and the signed record agree. */
    function deliverablesNow(tfpOverride) {
      const tfp = typeof tfpOverride === "boolean" ? tfpOverride : ($("#b_type")?.value || "") === "Selective Collaboration (TFP)";
      const live = (c) => (window.codeStatus(c) === "live" ? c : null);
      const typedInvite = ($("#b_invite_code")?.value || "").trim().toUpperCase();
      const invite = typedInvite ? live((window.getAdminInviteCodes() || []).find((c) => window.codeMatches(typeof c === "object" ? c.code : c, typedInvite))) : null;
      const typedPromo = ($("#b_discount_code")?.value || "").trim().toUpperCase();
      const promos = getAdminPromoCodes() || {};
      const promoKey = typedPromo ? Object.keys(promos).find((k) => window.codeMatches(k, typedPromo)) : null;
      const promo = promoKey ? live(promos[promoKey]) : null;
      const v = $("#b_budget")?.value || "";
      const pkg = (typeof getAdminPackages === "function" ? getAdminPackages() : []).find((p) => v.includes(p.name)) || null;
      return window.bookingDeliverables({ tfp, invite, promo, pkg });
    }
    // Shown everywhere the form names the test-shoot deliverables in its fixed markup.
    function paintDeliverables() {
      const dl = deliverablesNow(true);
      document.querySelectorAll("[data-deliverables-line]").forEach((el) => { el.textContent = dl.line; });
    }
    /* Whether this booking is at the photographer's home studio: picked in the
       studio-space list, or an invite whose locked venue is the home studio (the
       list is hidden then, and may still hold a stale pick). An invite can lock
       another venue altogether, so a locked venue is read by its name. */
    function bookingAtHomeStudio() {
      if (bookingCalc && bookingCalc.isValidInvite && bookingCalc.lockedLocation) {
        const v = String(bookingCalc.lockedLocation).trim();
        return isStudioVenue(v);
      }
      return document.getElementById("b_studio_space")?.value === "Home Studio - Noida (Provided by Studio)";
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

      /* Booking for someone else. A model booking themselves is asked none of
         this; anyone else has to name the person in front of the camera, so
         the contract binds them rather than the payer.

         `required` is set here rather than in the markup: a hidden required
         field blocks submission with a browser message pointing at something
         the person cannot see, which is a dead end with no explanation. */
      const subjectBlock = $("#b_subject_block");
      if (subjectBlock) {
        const onBehalf = !!$("#b_onbehalf")?.checked;
        // An agency or a brand already has a contract with the model, and
        // some forbid approaching their talent directly — so they warrant the
        // rights in the contract instead of us emailing the model. Everyone
        // else booking for someone is usually an individual with no paperwork
        // at all, and there the release has to come from the person.
        const bookerIsCompany = role === "Agency" || role === "Brand";
        subjectBlock.hidden = !onBehalf;
        const adultLine = $("#b_adult_line");
        if (adultLine) adultLine.hidden = onBehalf;
        // "I am under 18": offered until someone says they are booking for someone else,
        // and while it is ticked the "someone else" tick is put away (it would say the child is not the one photographed).
        const selfMinor = !!$("#b_selfminor")?.checked;
        const selfLine = $("#b_selfminor_line"); if (selfLine) selfLine.hidden = onBehalf && !selfMinor;
        const behalfLine = $("#b_onbehalf_line"); if (behalfLine) behalfLine.hidden = selfMinor;
        subjectBlock.classList.toggle("is-self", selfMinor);
        const minor = !!$("#b_subject_minor")?.checked;
        const guardianBlock = $("#b_guardian_block");
        if (guardianBlock) guardianBlock.hidden = !(onBehalf && minor);
        const need = (id, on) => { const el = $("#" + id); if (el) el.required = !!on; };
        need("b_subject_name", onBehalf);
        // Their own email is needed only where the release goes to them: not
        // for someone under 18 (who may not have one — it goes to the guardian)
        // and not where an agency or brand holds the rights (user, 24 Sep 2026).
        const subjectEmailNeeded = onBehalf && !minor && !bookerIsCompany;
        need("b_subject_email", subjectEmailNeeded);
        const subjectEmailLabel = $("#b_subject_email_label");
        if (subjectEmailLabel) subjectEmailLabel.textContent = subjectEmailNeeded ? "Their email *" : "Their email (optional)";
        need("b_authorised", onBehalf);
        need("b_guardian_name", onBehalf && minor);
        need("b_guardian_email", onBehalf && minor);

        /* An agency is a professional counterparty, not someone who needs the
           idea of a release explained to them — and it already holds one. Ask
           it to stand behind the rights instead, and do not email its talent.
           A child is the exception: that yes belongs on this studio's record. */
        const lede = $("#b_subject_lede"), hint = $("#b_subject_email_hint"), tick = $("#b_authorised_text");
        if (lede) {
          lede.innerHTML = bookerIsCompany
            ? "<strong>Who is being photographed?</strong> They are named on the contract and credited with the work. We will not contact them — you hold their agreement, and the contract asks you to confirm it."
            : (minor
              ? "<strong>Who is being photographed?</strong> You are booking for someone else, so we need their details as well as yours. They are named on the contract, and because they are under 18 the release goes to their parent or guardian."
              : "<strong>Who is being photographed?</strong> You are booking for someone else, so we need their details as well as yours. They are named on the contract and sent their own release — their pictures, their say.");
        }
        if (hint) {
          hint.textContent = bookerIsCompany
            ? (minor ? "Used only to reach them about the shoot. The release goes to their guardian." : "Used only to reach them about the shoot — no release is sent to them. Leave it empty rather than using your own address.")
            : (minor ? "Used only to reach them about the shoot. The release goes to their guardian." : "Their release goes to their email address, so it needs to be their own, not yours. It does not replace yours.");
        }
        if (tick) {
          tick.textContent = bookerIsCompany
            ? "I am authorised to book for them, and we hold their agreement to be photographed and to these pictures being used. *"
            : "I am authorised to book on their behalf. *";
        }
      }

      if (policyNotice) {
        if (type === "Selective Collaboration (TFP)") {
          policyNotice.innerHTML = `
            <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">TFP Collaboration &amp; Test Shoot Policy</span>
            Submission of a TFP collaboration request does not constitute a confirmed session or a commitment to shoot. All inquiries are subject to schedule availability, creative alignment, and final studio review. <strong>Note: If a dedicated studio space is booked for the shoot, applicable studio rental charges will apply.</strong> Test shoots include a proofing gallery and ${esc(String(deliverablesNow(true).line || "").replace(/\s*\((No RAW files delivered|RAW files not included)\)\s*$/i, ""))}. RAW files aren't included — they can be bought separately; ask. <strong>⏰ Call time &amp; no-show:</strong> ${window.buildLateArrivalSummary(true)}
          `;
        } else {
          policyNotice.innerHTML = `
            <span style="font-family: var(--mono-font); font-size: var(--font-xs); font-weight: 700; color: var(--accent-text); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Commercial Production &amp; Studio Protection Policy</span>
            <strong>🔒 Booking &amp; Retainer Terms:</strong> the 50% advance retainer holds your date. Move the shoot at least 24 hours before call time and it carries to the new date (up to two moves); with less notice, or a no-show, it is kept. If I have to cancel, you get a new date or a full refund.<br/>
            <strong>📦 Deliverables &amp; Full Gallery Buyout:</strong> Packages include a proofing gallery to select contracted retouches. If the client requests the complete full unedited image gallery or additional retouched master clicks beyond the package limit, extra buyout charges apply. RAW files aren't included — they can be bought separately; ask.<br/>
            <strong>📜 Usage:</strong> your package covers your own website, social media, portfolio and comp cards. Print, outdoor, TV and paid advertising need a separate written licence.<br/>
            <strong>⏰ Call Time &amp; No-Show:</strong> ${window.buildLateArrivalSummary(false)}
          `;
        }
      }

      if (igLabel) {
        igLabel.innerHTML = (type === "Selective Collaboration (TFP)" ? "Instagram / Website *" : "Instagram / Website");
      }

      if (btn) {
        btn.textContent = (type === "Selective Collaboration (TFP)" ? "Request a test shoot" : "Submit Booking Request");
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
                🎁 <strong>Deliverables:</strong> ${esc(deliverablesNow(true).line)}.
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
                If this collaboration isn’t a fit *
              </div>
              <p style="font-size: var(--font-xs); color: var(--ink-soft); margin: 0 0 10px 0; line-height: 1.5;">
                Collaborations are by invitation, and a request does not hold the date until I confirm it.
              </p>
              <label class="field" style="margin: 0;">
                <span style="font-size: var(--font-xs); font-weight: 700; color: var(--ink);">If it isn’t a fit, which package would you like instead? *</span>
                <select id="b_collab_fallback" style="margin-top: 4px;">
                  ${getAdminPackages().map(p => `<option value="₹${esc(p.price.toLocaleString('en-IN'))} ${esc(p.name)} (Paid Fallback)">₹${esc(p.price.toLocaleString('en-IN'))} · ${esc(p.name)} (${esc(p.specs)})</option>`).join("")}
                  <option value="Custom Bespoke Package (Paid Fallback)">A custom package</option>
                  <option value="Cancel Inquiry if Collaboration is Declined">None — cancel the request</option>
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
      const allAdminCodes = (typeof window.getAdminInviteCodes === "function" ? window.getAdminInviteCodes() : []);
      const enteredCode = (inviteCodeInput?.value || "").trim().toUpperCase();

      // Verify against ALL active admin invite codes. Only codes on the admin-managed list are valid,
      // and only while they are live: a code switched off, not yet started or past its end date
      // unlocks nothing, exactly as if it were not on the list.
      const matchedInviteRaw = enteredCode ? allAdminCodes.find(c => window.codeMatches(typeof c === 'object' ? c.code : c, enteredCode)) : null;
      const matchedInvite = window.codeStatus(matchedInviteRaw) === "live" ? matchedInviteRaw : null;
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
      // — has to know the switch exists. The same goes for a code outside the
      // dates it works between: codeStatus folds the switch and the dates
      // into one answer.
      const matchedDiscountRaw = discountCodesMap[Object.keys(discountCodesMap).find((k) => window.codeMatches(k, enteredDiscount))];
      const matchedDiscount = window.codeStatus(matchedDiscountRaw) === "live" ? matchedDiscountRaw : undefined;

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
            // A set rental price below the standard rate, as the discount it is.
            const bannerFixedPct = bannerHsDiscount.type === "fixed" ? (applyPromoHomeStudioDiscount(matchedDiscount, studioRateNow(false)).pct || 0) : 0;
            savingsBadge.textContent = bannerFixedPct
              ? (hasPackageDiscount
                  ? `🎉 Promo Offer Applied: ${tagMsg} on your package — plus a ${bannerFixedPct}% home studio discount if you shoot there!`
                  : `🎉 Promo Offer Applied: a ${bannerFixedPct}% home studio discount if you shoot there!`)
              : !hasPackageDiscount
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
            savingsBadge.textContent = studioText(savingsBadge.textContent);
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

      // ── Home studio (paid shoots only) ──────────────────────────────────
      // The home studio is offered on paid bookings; TFP venues are handled by
      // the invite code instead, so the option is removed for a test shoot
      // rather than silently offering the photographer's home for free work.
      const HOME_STUDIO_VALUE = "Home Studio - Noida (Provided by Studio)";
      const OUTDOOR_VALUE = "Outdoor / On-Location (No Studio Required)";
      const COMMERCIAL_STUDIO_VALUE = "Dedicated Commercial Studio Rental (Billed at Actuals)";
      const HOME_STUDIO_LABEL = studioLabel();
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
          if (locationField.value.trim() === HOME_STUDIO_LABEL || locationField.value.trim() === HOME_STUDIO_NAME) locationField.value = "";
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
        // Collaborations can carry their own rate for the same room, and a package its own (v624).
        homeStudioFee = studioRateNow(isTfpType || isValidInvite);
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
        homeStudioListPrice = studioRateNow(isTfpType || isValidInvite);
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
        const lockedHomeRiderHtml = isStudioVenue(lockedLocation)
          ? studioText(` Attendance is limited to a maximum of 3 people in total — the photographer, the Participant, and any crew they bring (hair &amp; make-up, stylist, assistants or guests all count towards this limit); the session runs within booked daylight hours and concludes by <strong>7:00 PM</strong>; the full address is shared on booking confirmation; guests may not attend unaccompanied.`)
          : ``;
        // House rules for the residence, quoted wherever the home studio is
        // the venue — a paid booking is capped exactly like an invited one.
        const paidHomeRiderHtml = studioText(` Attendance is limited to a maximum of 3 people in total — the photographer, the Participant, and any crew they bring (hair &amp; make-up, stylist, assistants or guests all count towards this limit); the session runs within booked daylight hours and concludes by <strong>7:00 PM</strong>; the full address is shared on booking confirmation; guests may not attend unaccompanied.`);
        contractStudioClause.innerHTML = (isValidInvite && lockedLocation && homeStudioFee === 0)
          ? `Studio for this session is provided by the photographer at <strong>${lockedLocation}</strong> at no additional rental charge to the talent.${lockedHomeRiderHtml} Hair &amp; make-up artists, stylists, set designers and any other third-party crew are not included — the Participant may bring their own or ask the Studio to source them, and such crew are billed at actuals (at cost).`
          : homeStudioFee > 0
            // The client is looking at a quote with this rental on it, so the
            // clause they tick has to name the same number.
            ? studioText(`This session takes place at the Studio's home studio in ${HOME_STUDIO_AREA}. A fixed home studio rental of <strong>₹${homeStudioFee.toLocaleString("en-IN")}</strong> applies and is itemised in the production quote, <strong>payable in full at least 48 hours before the shoot day</strong> to reserve the space and non-refundable once paid; no further venue rental applies to it.${paidHomeRiderHtml} Hair &amp; make-up artists, stylists, set designers and any other third-party crew are not included in this booking — the Participant may bring their own or ask the Studio to source them, and such crew are billed at actuals (at cost).`)
            : `If a dedicated external or commercial studio space is requested or booked for the shoot, the Participant shall be entirely responsible for covering the applicable studio rental charges.${studioArrangerClauseHtml} Hair &amp; make-up artists, stylists, set designers and any other third-party crew are not included in this booking — the Participant may bring their own or ask the Studio to source them, and such crew are billed at actuals (at cost).`;
      }

      // Update TFP policy notice studio line if TFP is selected
      const policyNoticeEl = $("#bookingPolicyNotice");
      if (policyNoticeEl && $("#b_type") && $("#b_type").value === "Selective Collaboration (TFP)") {
        // Must agree with the quote box: a test shoot at the home studio now
        // carries a rental unless the invite waives it.
        // Labelled lines, like the paid-shoot block. Deliverables come from the
        // test-shoot package setting so the two never disagree.
        const studioLine = homeStudioFee > 0
          ? studioText(`Home studio session: a fixed rental of ₹${homeStudioFee.toLocaleString("en-IN")} applies, itemised in your quote and payable in full before shoot day.`)
          : (isValidInvite && lockedLocation)
            ? `Provided by the photographer at ${esc(lockedLocation)}. No rental charge to you.`
            : `If a dedicated studio is booked, the rental is quoted in advance once the venue is confirmed and payable in full before shoot day.`;
        // This booking's: the invite's own line, or the test-shoot default.
        const tfpSpecs = (deliverablesNow(true).line || "Full proof gallery + 8 retouched photos").replace(/\s*\((No RAW files delivered|RAW files not included)\)\s*$/i, "");
        paintDeliverables();
        policyNoticeEl.innerHTML = `
          <span class="policy-k">TFP Collaboration &amp; Test Shoot Policy</span>
          <dl class="policy-lines">
            <div><dt>Status</dt><dd>A request is not a confirmed session or a commitment to shoot. Every enquiry is subject to schedule availability, creative fit and final studio review.</dd></div>
            <div><dt>Studio</dt><dd>${studioLine}</dd></div>
            <div><dt>Deliverables</dt><dd>${esc(tfpSpecs)}. RAW files aren't included — they can be bought separately.</dd></div>
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
        // A code that sets the room above the standard rate (see
        // applyPromoHomeStudioDiscount): the studio's email says so.
        promoRaisesHomeStudio: promoHomeStudioResult.amount < 0,
        savings,
        finalPayable
      };

      // Deliberately after the snapshot above: the duration limits are read
      // back off bookingCalc by the badge and the submit-time check, so setting
      // them any earlier would apply this pass's limits to last pass's status.
      syncDurationLimits(isCollabBooking);

      // ── Studio Policies & Terms block ───────────────────────────────────
      // The Studio Rental and Travel lines in the policies panel are written
      // for a client who sources and pays for the venue. When the studio is
      // supplying it — an invite carrying a location, or the home studio — they
      // used to say "no studio rental or venue fee is billed to you" even with
      // a rental in the quote right above them (the studio, Sep 30 2026: "we
      // are charging 4000 however, down it is saying we will not charge"). They
      // are painted here, after the quote, and say what the quote says, in the
      // words the studio's own record of the booking already uses.
      {
        const venueSuppliedByStudio = !!lockedLocation
          || $("#b_studio_space")?.value === "Home Studio - Noida (Provided by Studio)";
        const venueAddressShown = ($("#b_location")?.value || "").trim();
        const rentalFee = (bookingCalc && bookingCalc.homeStudioFee) || 0;
        const atHome = bookingAtHomeStudio();
        const policyRental = $("#policyStudioRental");
        const policyTravel = $("#policyTravel");
        if (policyRental) {
          policyRental.innerHTML = studioText(rentalFee > 0
            ? `<strong style="color: var(--ink);">Studio Rental:</strong> This session takes place at ${atHome ? `the studio's home studio in ${esc(HOME_STUDIO_AREA)}` : `<strong style="color: var(--ink);">${esc(venueAddressShown || "the venue above")}</strong>`}. A fixed ${atHome ? "home studio " : ""}rental of <strong style="color: var(--ink);">₹${rentalFee.toLocaleString("en-IN")}</strong> applies and is itemised in your quote — nothing further is charged for the venue.`
            : venueSuppliedByStudio
            ? `<strong style="color: var(--ink);">Studio Rental:</strong> The venue for this session${venueAddressShown ? ` (<strong style="color: var(--ink);">${esc(venueAddressShown)}</strong>)` : ""} is arranged and paid for by the studio. <strong style="color: var(--ink);">No studio rental or venue fee is billed to you.</strong> If you later ask to shoot somewhere else, standard venue terms apply again.`
            : `<strong style="color: var(--ink);">Studio Rental:</strong> Package rates cover photography creation, light design &amp; master retouched deliverables. If a dedicated indoor studio venue/space is required, applicable studio rental fees are <strong style="color: var(--ink);">quoted separately in advance</strong>, or the client may directly book their preferred studio space for the production.`);
        }
        if (policyTravel) {
          const travelKm = $("#b_type")?.value === "Selective Collaboration (TFP)" ? 10 : 20;
          policyTravel.innerHTML = studioText(venueSuppliedByStudio
            ? `<strong style="color: var(--ink);">Travel &amp; Accommodation:</strong> Travel to the studio-provided venue above is covered by the studio for this session. Standard terms (travel beyond <strong style="color: var(--ink);">${travelKm} km</strong> from the studio base in Noida, and accommodation where an overnight stay is needed, billed at actuals) apply only if you request a different location.`
            : `<strong style="color: var(--ink);">Travel &amp; Accommodation:</strong> Shoots requiring travel beyond <strong style="color: var(--ink);">${travelKm} km</strong> from the studio base (Sector 46, Noida) incur paid travel and, where an overnight stay is needed, accommodation — billed <strong style="color: var(--ink);">at actuals (at cost)</strong>.`);
        }
      }

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
            ? `<span style="text-decoration: line-through; color: var(--ink-soft); opacity: 0.8; font-weight: 500; margin-right: 8px;">₹${homeStudioListPrice.toLocaleString("en-IN")}</span><span style="color: #059669;">₹${homeStudioFee.toLocaleString("en-IN")}</span>`
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
            : studioText(`Home Studio Rental (${HOME_STUDIO_AREA})`);
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

        if (summaryFinalAmount) summaryFinalAmount.textContent = `₹${finalPayable.toLocaleString("en-IN")}`;

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
          if (reservationAmount) reservationAmount.textContent = `₹${finalPayable.toLocaleString("en-IN")}`;
        } else {
          // Itemized Retainer & remaining milestones. The studio rental
          // reserves the venue, so — like a collaboration's rental — it is
          // due in full up front rather than split across milestones; only
          // the package rate itself is divided per the studio's milestone
          // schedule (50/50, or 50/30/20 when that global setting is on).
          const packageNet = finalPayable - homeStudioFee; // may be negative: splitPackageMilestones takes it off the rental (B23)
          const schedule = PACKAGE_SCHEDULES[globalSched] || PACKAGE_SCHEDULES["5050"];
          const legs = splitPackageMilestones(packageNet, homeStudioFee, globalSched);
          const advanceRetainer = legs[0], wrapBalance = legs[1] || 0, step3Amount = legs[2] || 0, step4Amount = legs[3] || 0;
          const summaryAdvanceAmount = $("#summaryAdvanceAmount");
          const summaryBalanceAmount = $("#summaryBalanceAmount");
          const summaryAdvanceLabel = $("#summaryAdvanceLabel");
          const summaryStep2Label = $("#summaryStep2Label");
          const summaryStep3Wrap = $("#summaryStep3Wrap"), summaryStep3Label = $("#summaryStep3Label"), summaryStep3Amount = $("#summaryStep3Amount");
          const summaryStep4Wrap = $("#summaryStep4Wrap"), summaryStep4Label = $("#summaryStep4Label"), summaryStep4Amount = $("#summaryStep4Amount");

          if (summaryAdvanceAmount) summaryAdvanceAmount.textContent = `₹${advanceRetainer.toLocaleString("en-IN")}`;
          if (summaryBalanceAmount) summaryBalanceAmount.textContent = `₹${wrapBalance.toLocaleString("en-IN")}`;
          if (summaryStep3Wrap) summaryStep3Wrap.style.display = legs.length >= 3 ? "block" : "none";
          if (summaryStep3Amount) summaryStep3Amount.textContent = `₹${step3Amount.toLocaleString("en-IN")}`;
          if (summaryStep4Wrap) summaryStep4Wrap.style.display = legs.length >= 4 ? "block" : "none";
          if (summaryStep4Amount) summaryStep4Amount.textContent = `₹${step4Amount.toLocaleString("en-IN")}`;
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
        if (fabPrice) fabPrice.textContent = `Payable: ₹${finalPayable.toLocaleString("en-IN")}`;
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
    /* An agency or a brand is never the one in front of the camera, so tick
       the box for them. Only on a real change of role, and never unticking
       what they ticked themselves. */
    const onRoleChosen = () => {
      const box = $("#b_onbehalf"), r = $("#b_role")?.value;
      if (box && !box.checked && (r === "Agency" || r === "Brand")) { box.checked = true; updateFields(); }
    };
    $("#b_time_start")?.addEventListener("input", () => updateCustomTimeBadge());
    $("#b_time_end")?.addEventListener("input", () => updateCustomTimeBadge());

    ["change", "input", "blur", "click"].forEach(evtName => {
      $("#b_type")?.addEventListener(evtName, updateFields);
      $("#b_role")?.addEventListener(evtName, updateFields);
      $("#b_role")?.addEventListener("change", onRoleChosen);
      $("#b_subject_minor")?.addEventListener("change", updateFields);
      $("#b_onbehalf")?.addEventListener("change", updateFields);
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
      // The entry behind a typed code, whatever state it is in — whether it is
      // live is asked separately, so a code that is real but outside its dates
      // can be told apart from one that does not exist.
      const findInvite = (code) => (typeof window.getAdminInviteCodes === "function" ? window.getAdminInviteCodes() : []).find(c => window.codeMatches(typeof c === "object" ? c.code : c, code)) || null;
      const findPromo = (code) => {
        const map = typeof window.getAdminPromoCodes === "function" ? window.getAdminPromoCodes() : {};
        const key = Object.keys(map).find((k) => window.codeMatches(k, code));
        return key ? map[key] : null;
      };
      const isLive = (entry) => window.codeStatus(entry) === "live";
      const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1);
      let lastError = "";
      const paint = () => {
        const out = [];
        const inv = (inviteEl.value || "").trim().toUpperCase();
        if (inv) {
          const ok = ($("#inviteCodeStatus")?.textContent || "").includes("VERIFIED");
          // A code that arrived by link skips apply(), so the dates are
          // explained here too rather than only when it is typed.
          const why = ok ? "" : window.codeDatesReason(findInvite(inv));
          out.push(`<span class="code-chip ${ok ? "is-ok" : "is-bad"}"><b>${esc(inv)}</b><span>${ok ? ("Invite verified · test shoot unlocked" + (window.shootWindowWords(findInvite(inv)) ? " · shoots " + window.shootWindowWords(findInvite(inv)) : "")) : (why ? esc(sentence(why)) : "Invite code not recognised")}</span><button type="button" data-clear="invite" aria-label="Remove invite code">×</button></span>`);
        }
        const pr = (promoEl.value || "").trim().toUpperCase();
        if (pr) {
          const st = $("#discountCodeStatus")?.textContent || "";
          const ok = st.includes("APPLIED");
          const savings = ($("#discountSavingsBadge")?.textContent || "").replace(/^[^:]*:\s*/, "").replace(/[\u{1F300}-\u{1FAFF}]/gu, "").trim();
          const why = ok ? "" : window.codeDatesReason(findPromo(pr));
          out.push(`<span class="code-chip ${ok ? "is-ok" : "is-bad"}"><b>${esc(pr)}</b><span>${ok ? ("Promo applied" + (savings ? " · " + esc(savings) : "") + (window.shootWindowWords(findPromo(pr)) ? " · shoots " + window.shootWindowWords(findPromo(pr)) : "")) : (why ? esc(sentence(why)) : "Promo code not valid for this booking")}</span><button type="button" data-clear="promo" aria-label="Remove promo code">×</button></span>`);
        }
        if (lastError) out.push(`<span class="code-chip is-bad"><span>${esc(lastError)}</span></span>`);
        chips.innerHTML = out.join("");
        chips.hidden = !out.length;
      };
      const apply = () => {
        const code = (input.value || "").trim().toUpperCase();
        lastError = "";
        if (!code) { paint(); return; }
        const invite = findInvite(code), promo = findPromo(code);
        if (isLive(invite)) { inviteEl.value = code; fire(inviteEl); input.value = ""; }
        else if (isLive(promo)) { promoEl.value = code; fire(promoEl); input.value = ""; }
        else {
          const why = window.codeDatesReason(invite) || window.codeDatesReason(promo);
          lastError = why ? `"${code}" ${why}.` : `"${code}" is not an invite or promo code we recognise.`;
        }
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
        // The booking's deliverables: the package's (or test shoot's), or the line its code sets (v588).
        const dl = deliverablesNow(isCollab);
        if (dl.line) bits.push(dl.from === "invite" || dl.from === "promo" ? `${dl.line} (with your code)` : dl.line);
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

        // Set the way a visitor would, so what hangs off each field runs:
        // ?role=Agency ticks "on behalf", ?date= shows its badge (B37).
        if (roleParam && $("#b_role")) {
          $("#b_role").value = roleParam;
          $("#b_role").dispatchEvent(new Event("change", { bubbles: true }));
        }

        if (dateParam && $("#b_date")) {
          $("#b_date").value = dateParam;
          setTimeout(() => $("#b_date")?.dispatchEvent(new Event("input", { bubbles: true })), 0);
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

    // "test@example.c" used to pass; a real address ends in a dot and at least
    // two letters (Sep 2026 audit, B33).
    const emailLooksReal = (v) => /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(String(v || "").trim());
    /* The same inbox written another way is the same inbox (v622): capitals, a +tag, Gmail's dots, googlemail. A release
       that has to reach another person, or a parent or guardian, means nothing if it lands in the booker's own box. It
       cannot tell two inboxes of one person apart: that is for the studio's own check (the release must come BACK from
       that address, and the studio calls them). */
    const emailKey = (v) => {
      const [local = "", host = ""] = String(v || "").trim().toLowerCase().split("@");
      const domain = host === "googlemail.com" ? "gmail.com" : host;
      let l = local.split("+")[0];
      if (domain === "gmail.com") l = l.replace(/\./g, "");
      return `${l}@${domain}`;
    };
    const sameInbox = (a, b) => !!String(a || "").trim() && !!String(b || "").trim() && emailKey(a) === emailKey(b);

    function validate() {
      let firstBad = null;
      mirrorSelf();
      const require = (id, msg) => {
        if (!val(id)) { setError(id, msg); firstBad = firstBad || id; }
        else clearError(id);
      };
      require("b_name", "Please add your name or brand.");
      if (dateToBeAgreed && bookingIsTestShoot()) clearError("b_date"); else require("b_date", "Let us know a rough date or timeline.");
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

      const rawDateStr = dateToBeAgreed ? "" : val("b_date");
      if (rawDateStr) {
        const parsedD = parseTypedDates(rawDateStr)[0];
        if (parsedD) {
          if (parsedD < indiaToday()) {
            setError("b_date", "Dates in the past cannot be booked. Please select today or a future date.");
            firstBad = firstBad || "b_date";
          }
        }
      }
      // A test shoot in a month the studio has filled (the date may have been
      // picked before the kind of booking was chosen, or typed).
      const fullMonthProblem = dateRuleProblem();
      if (fullMonthProblem) { setError("b_date", fullMonthProblem); firstBad = firstBad || "b_date"; }

      const email = val("b_email");
      if (!email) { setError("b_email", "We need an email to reply to."); firstBad = firstBad || "b_email"; }
      else if (!emailLooksReal(email)) { setError("b_email", "That email doesn't look right."); firstBad = firstBad || "b_email"; }
      else clearError("b_email");

      // A phone number is optional, but one that cannot be dialled is worse
      // than none: "abc" and "123" used to go through (Sep 2026 audit, B33).
      const phoneDigits = val("b_phone").replace(/\D/g, "");
      if (val("b_phone") && (phoneDigits.length < 10 || phoneDigits.length > 15)) {
        setError("b_phone", "Please check the number — 10 digits, or with the country code.");
        firstBad = firstBad || "b_phone";
      } else clearError("b_phone");

      // Booking for someone else. These fields were marked required, but the
      // form skips the browser's own checks and nothing here looked at them,
      // so an agency booking with no model named, no guardian for a minor and
      // no "I am authorised" tick went straight through (Sep 2026 audit, B8).
      const onBehalfNow = !!$("#b_onbehalf")?.checked;
      const minorNow = onBehalfNow && !!$("#b_subject_minor")?.checked;
      [["b_subject_name", onBehalfNow, "Please add the name of the person being photographed."],
       ["b_subject_email", onBehalfNow && !minorNow && !["Agency", "Brand"].includes(val("b_role")), "Their release goes to this address — please add it."],
       ["b_guardian_name", minorNow, "Please add their parent or guardian’s name."],
       ["b_guardian_email", minorNow, "The release goes to their parent or guardian — please add their email."]
      ].forEach(([id, needed, msg]) => {
        const v = val(id);
        if (needed && !v) { setError(id, msg); firstBad = firstBad || id; }
        else if (needed && /email/.test(id) && !emailLooksReal(v)) { setError(id, "That email doesn't look right."); firstBad = firstBad || id; }
        else clearError(id);
      });
      /* Two people, two inboxes (v622, the owner: "people don't use the same email id to bypass the system"). An adult
         booked for by someone else is sent their own release, so it needs their address, not the booker's. For someone
         under 18 the release goes to a parent or guardian, who must not be the child's own address. A parent booking for
         their own child may of course give their own address as the guardian's, and a guardian who asked the child to
         fill the form in is the same case from the other side: the child's address as the booker's is allowed, as the
         guardian's is not. An agency or brand holds the rights and is not asked for the model's inbox, but if it gives one it
         is not its own. */
      if (onBehalfNow) {
        const bookerAt = val("b_email"), theirAt = val("b_subject_email"), guardAt = val("b_guardian_email");
        if (minorNow) {
          if (sameInbox(guardAt, theirAt)) {
            setError("b_guardian_email", "That's the same email as the child's. The release goes to a parent or guardian, so it needs their own email address.");
            firstBad = firstBad || "b_guardian_email";
          }
        } else if (sameInbox(bookerAt, theirAt)) {
          // An agency or brand is not sent the model's release, so its box is optional: the same address there is no
          // answer at all, and is asked to be left empty (the owner, Oct 2026: on behalf, never the same email).
          const company = ["Agency", "Brand"].includes(val("b_role"));
          setError("b_subject_email", company
            ? "That's the same email as yours. Leave this empty, or add their own email address."
            : "That's the same email as yours. Their release goes to them, so it needs their own email address.");
          firstBad = firstBad || "b_subject_email";
        }
      }
      // Someone booking for themselves agrees to a contract, which in India
      // needs an adult; under 18, a parent or guardian books for them
      // (Sep 2026 audit, B24). The form still never asks an age.
      if (!onBehalfNow && !$("#b_adult")?.checked) {
        // Said plainly (the owner, Sep 29 2026: "this should tell them … that you need a guardian to book it").
        setError("b_adult", "You need to be 18 or over to book on your own. If you are under 18, tick “I am under 18” and add a parent or guardian's name and email, or ask a parent or guardian to book for you.");
        firstBad = firstBad || "b_adult";
      } else clearError("b_adult");
      if (onBehalfNow && !$("#b_authorised")?.checked) {
        setError("b_authorised", "Please confirm you are authorised to book for them.");
        firstBad = firstBad || "b_authorised";
      } else clearError("b_authorised");

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
          // The booker, and for someone under 18 the parent or guardian too (v622): the person who has to agree sees what
          // was signed. Once if they are the same inbox. FormSubmit takes the addresses comma-separated.
          const copies = [payload.clientEmail, payload.participantIsMinor ? payload.guardianEmail : ""].filter(Boolean)
            .filter((a, i, all) => all.findIndex((b) => sameInbox(a, b)) === i);
          fd.append("_cc", copies.join(","));
        }
        fd.append("Record Type", "Signed booking contract — a copy for the client and for the studio's records");
        fd.append("Contract Number", payload.contractNumber || "—");
        fd.append("Contract Version", payload.contractVersion || "—");
        if (payload.isCustomContract) fd.append("Requested Contract Changes", payload.customContractNotes || "Client requested a custom contract / agency MSA (no details given)");
        fd.append("Client Name", payload.clientName || "—");
        fd.append("Client Email", payload.clientEmail || "—");
        if (payload.participantName) {
          fd.append("Participant (being photographed)", payload.participantName);
          fd.append("Participant Email", payload.participantEmail || "—");
          fd.append("Participant Under 18", payload.participantIsMinor ? `Yes — parent or guardian: ${payload.guardianName || "—"} (${payload.guardianEmail || "—"})` : "No");
        }
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
        fd.append("Agreement", sigBlob
          ? (withSig ? "Yes — drawn signature attached as PNG" : "Yes — drawn at booking (attachment unavailable; image kept in booking record)")
          : (payload.isCustomContract
              ? `Custom contract requested — not yet agreed (${payload.contractVersion || "Studio Terms"})`
              : payload.agreementMethod === "checkbox"
                ? `Accepted by tick-box on the booking form (${payload.contractVersion || "Studio Terms"})`
                : "Not recorded on the form"));
        fd.append("Contract Terms (full text)", payload.contractText || "—");
        if (withSig) fd.append("attachment", sigBlob, `signature-${payload.contractNumber || "contract"}.png`);
        // With the signature image, FormSubmit alone (the backup carries no
        // file); without it, either relay (sendStudioMail).
        const r = await window.sendStudioMail(studioEmail, fd, { backup: !withSig });
        return { ok: r.ok, message: r.message };
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

    /* The release for a person who did not do the booking.

       An agency or brand books, signs, and pays — but the pictures are of
       somebody else, and that somebody has to agree to their own image being
       used. This goes to them in their own name, separately from the
       contract, and is asked for as a reply rather than a second signing
       screen: there is no server here, so a reply sitting in the studio's
       Gmail is the record, exactly as the signed contracts are
       (see the contract-records note). _replyto is the studio, so their
       "I agree" lands where the studio will see it.

       For anyone under 18 this is addressed to a parent or guardian and the
       child's own address is never used. */
    async function sendSubjectReleaseEmail(payload) {
      const fd = new FormData();
      const who = payload.signedBy || payload.subjectName || "the person photographed";
      fd.append("_subject", `Your photo release — ${payload.subjectName || "shoot"} (${payload.contractNumber || "booking"})`);
      fd.append("_template", "box");
      fd.append("_replyto", payload.studioEmail);
      if (payload.to) fd.append("_cc", payload.to);
      fd.append("Record Type", payload.isMinor
        ? "PHOTO RELEASE — sent to the parent or guardian, awaiting their reply"
        : "PHOTO RELEASE — sent to the person photographed, awaiting their reply");
      fd.append("Being photographed", payload.subjectName || "—");
      if (payload.isMinor) fd.append("Parent or guardian", payload.signedBy || "—");
      fd.append("Booked by", payload.selfMinor ? `${payload.subjectName || "—"} themselves (under 18, ${payload.bookerEmail || "—"})` : `${payload.bookerName || "—"} (${payload.bookerRole || "—"}, ${payload.bookerEmail || "—"})`);
      fd.append("Shoot", `${payload.shootType || "—"} on ${payload.date || "—"}${payload.location ? `, ${payload.location}` : ""}`);
      fd.append("Contract Number", payload.contractNumber || "—");
      fd.append("What you are agreeing to", [
        payload.selfMinor
          ? `${who}, ${payload.subjectName || "your child"} is under 18 and has booked this shoot, naming you as their parent or guardian.`
          : `${who}, this shoot was booked for ${payload.subjectName || "you"} by ${payload.bookerName || "someone else"}.`,
        payload.isMinor
          ? "Because they are under 18, this permission is yours to give, not theirs."
          : "They have signed the booking contract. This part is yours, because it is about your pictures.",
        "",
        "By replying I AGREE to this email you confirm:",
        `1. You are happy for ${payload.subjectName || "the person photographed"} to be photographed at this shoot.`,
        "2. nerdyphotographer.in may use the photographs in its portfolio, on its website and on its social media, with credit.",
        "3. The photographs are not sold on to anyone else, and are not used in paid advertising without asking you first.",
        "4. You may withdraw this at any time by replying to this email, and the pictures come down from the studio's own pages.",
        "",
        "If any of that is not right, reply and say so instead — nothing is published until this is settled.",
        "",
        "Not expecting this email? Reply and tell the studio, because it means someone booked a shoot in this person's name."
      ].join("\n"));
      // Either relay (sendStudioMail). The backup cannot copy the person
      // photographed in, so its email to the studio says to forward it.
      return (await window.sendStudioMail(payload.studioEmail, fd)).ok;
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
          if (el.querySelector("#termsAgreeCheckbox") || el.id === "termsPager") return;
          // The contract's own text, exactly as written (see renderTermsBody).
          if (el.id === "termsBody" && el.__contractText) { parts.push(el.__contractText.trim()); return; }
          // Page 1 is off screen by the time they agree; innerText of a hidden
          // part loses its line breaks, so it is read shown.
          const wasHidden = el.hidden;
          el.hidden = false;
          const t = (el.innerText || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
          el.hidden = wasHidden;
          if (t) parts.push(t);
        });
        return parts.join("\n\n");
      } catch (e) {
        return "";
      }
    }

    // Talk first (v594): the Contact card's details only, nothing booked. Its code (talk-first.js) loads on the press.
    const withTalkFirst = (go) => {
      if (window.WPS_TALK_FIRST) return go();
      const v = (document.querySelector('script[src*="app.js?v="]')?.getAttribute("src") || "").split("v=")[1] || "";
      const s = document.createElement("script");
      s.src = `/talk-first.js${v ? `?v=${v}` : ""}`;
      s.onload = go;
      s.onerror = () => toast("Couldn't send just now — please try again in a moment.");
      document.head.appendChild(s);
    };
    $("#talkSubmitBtn")?.addEventListener("click", () => {
      withTalkFirst(() => window.WPS_TALK_FIRST({ $, esc, setError, clearError, form, panel: successPanel }));
    });
    /* A test shoot in a month that is full: the way out is not a dead end, nor a bare
       request (the owner, Oct 2026): the client books with the date still to be agreed.
       The costs and the terms are read and signed as for any booking; the studio
       replies by email to fix a date and then adds it to the calendar as a Test shoot. */
    askForDatesHandler = () => {
      const typed = preferredDates();
      setDateLater(true);
      if (typed) { const inp = $("#b_date"); if (inp) inp.value = typed; }
      $("#b_date_later")?.scrollIntoView({ block: "center", behavior: prefersReduced ? "auto" : "smooth" });
    };

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
      const heardInfo = heardOf();
      /* Booking on someone else's behalf. `subjectName` is the person in front
         of the camera; `name` above is whoever is arranging and paying. Where
         they are the same person these are all empty and nothing downstream
         changes. A release for someone under 18 goes to their guardian — the
         child's own address is never used for it. */
      const onBehalf = !!$("#b_onbehalf")?.checked;
      // See updateFields: a company warrants the rights, an individual does not.
      const bookerIsCompany = role === "Agency" || role === "Brand";
      const subjectName = onBehalf ? val("b_subject_name") : "";
      const subjectEmail = onBehalf ? val("b_subject_email") : "";
      const subjectIsMinor = onBehalf && !!$("#b_subject_minor")?.checked;
      const guardianName = subjectIsMinor ? val("b_guardian_name") : "";
      const guardianEmail = subjectIsMinor ? val("b_guardian_email") : "";
      // Who the release is sent to, and in whose name it is signed.
      const releaseTo = subjectIsMinor ? guardianEmail : (bookerIsCompany ? "" : subjectEmail);
      const releaseSignedBy = subjectIsMinor ? guardianName : subjectName;
      const bookerAuthorised = !!$("#b_authorised")?.checked;
      // The person photographed is the one booking (under 18, with a parent or guardian named): the same as a booking for someone
      // under 18, except nobody else is the booker.
      const selfMinorBooking = onBehalf && !!$("#b_selfminor")?.checked;
      // The person the contract's Participant clauses describe.
      const participantName = subjectName || name;
      const laterMode = dateToBeAgreed && bookingIsTestShoot();
      const date = laterMode ? dateAgreedWords() : val("b_date"), locationVal = val("b_location"), budget = (type === "Selective Collaboration (TFP)" ? "Collab / TFP (No Budget)" : val("b_budget"));
      const moodboard = getFormLinks().join(", "), concept = val("b_concept");
      // Flag an already-booked date for the studio's attention rather than
      // blocking submission — the client may still want to send the request
      // so the studio can decide (confirm anyway, or offer an alternative).
      // Every day this booking covers, from the picker where it was used and
      // from the text otherwise (same parsing as the calendar save below).
      const dateEl0 = $("#b_date");
      const requestedDates = laterMode ? [] : (dateEl0 && Array.isArray(dateEl0._wpsPickedDates) && dateEl0._wpsPickedDates.length)
        ? dateEl0._wpsPickedDates.slice()
        : parseTypedDates(date);
      const dateStatusTarget = requestedDates[0] || null;
      const dateAlreadyBooked = dateStatusTarget ? getCalDateStatus(dateStatusTarget).isBooked : false;

      // The picker disables closed days, but a date typed by hand went through
      // untouched: a Tuesday, or a Saturday the studio had blocked, reached
      // "Request sent" and the studio's email said nothing about it (Sep 2026
      // audit). Same rules either way now. Days that are merely already booked
      // stay allowed on purpose — the studio decides those — and keep their flag.
      const todayKey = getCalDateKey(indiaToday());
      const unbookable = requestedDates.map((d) => {
        const st = getCalDateStatus(d);
        const label = d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        if (st.key < todayKey) return `${label} has already passed`;
        if (st.isCustomBlocked) return `${label} is blocked in the studio's calendar`;
        if ((st.hasWorkshop || st.hasAssisting) && !st.hasConfirmedBooking) return `${label} — the photographer is away that day`;
        if (st.isBlocked) return `${label} is a ${d.toLocaleDateString("en-IN", { weekday: "long" })} — shoots run on weekends`;
        return null;
      }).filter(Boolean);
      // A brand's campaign is planned around the brand, weekday or not; the
      // brief only asks for a call, so the weekend rule is for bookings (B21).
      if (unbookable.length && !(window.isProductionBrief && window.isProductionBrief())) {
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
        const inviteLockedHome = $("#b_location")?.dataset.inviteLocked === "1" && isStudioVenue($("#b_location")?.value);
        const isHomeStudio = $("#b_studio_space")?.value === "Home Studio - Noida (Provided by Studio)" || inviteLockedHome;
        const venueByStudio = $("#b_location")?.dataset.inviteLocked === "1" || isHomeStudio;
        const venueByStudioAddress = venueByStudio ? ($("#b_location")?.value || "") : "";
        const homeStudioRider = isHomeStudio
          ? studioText(`\n\nHOME STUDIO SESSIONS\nThis session takes place at the photographer's private residence. Attendance is limited to a maximum of 3 people in total — the photographer, the Participant, and any crew they bring; hair & make-up artists, stylists, assistants and guests all count towards this limit. Sessions run within booked daylight hours and conclude by 7:00 PM. The full address is shared on booking confirmation. Anyone under 18 must come with a parent or guardian.`)
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
        // Stamped with the version actually in force. Pinned at a literal V3.7
        // this said one thing while ACTIVE_CONTRACTS said another.
        const refNum = (String(isTfpCat ? window.ACTIVE_CONTRACTS.tfp : window.ACTIVE_CONTRACTS.commercial).match(/V(\d+\.\d+)/) || [])[1] || "";
        const contractRefDoc = isCustomContract ? "CUSTOM-CLIENT-CONTRACT-MSA" : `${isTfpCat ? "TFP-LIABILITY-RELEASE" : "COMMERCIAL-CONTRACT"}-V${refNum}`;
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
        // Only a saving counts as one: a code that raised the rental is not a negative saving.
        const homeStudioPromoDiscountAmount = Math.max(0, (bookingCalc && bookingCalc.promoHomeStudioAmount) || 0);
        const homeStudioRaisedByPromo = !!(bookingCalc && bookingCalc.promoRaisesHomeStudio);
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
        /* The deliverables, named in the signed record: contracts V4.1 say they
           are the ones stated in this booking (v588). A test shoot's are its
           invite's own line or the default; a paid shoot's, its package's or
           its promo code's. */
        const dlNow = deliverablesNow(isTfpCat);
        const paidPackageLine = budget && dlNow.line ? `${budget} — ${dlNow.line}` : (budget || "as quoted by the Studio");
        const recordDeliverablesLine = isTfpCat
          ? `Deliverables for this session: ${dlNow.line}\n`
          : `Selected package and contracted deliverables: ${paidPackageLine}\n`;
        // A collaboration carries no shoot fee, but it can still owe the home
        // studio rental — and the document the participant agrees to has to say
        // so, in the same terms the quote showed them.
        const engagementFeeClause = isTfpCat
          ? (homeStudioRentalFee > 0
              ? studioText(`\n\n7. HOME STUDIO RENTAL & PAYMENT\nThis collaboration carries no shoot fee. A fixed home studio rental of ₹${homeStudioRentalFee.toLocaleString('en-IN')} applies for use of the photographer's home studio in ${HOME_STUDIO_AREA}, and is payable IN FULL at least 48 hours before the shoot day to reserve the space. This rental is non-refundable once paid, including where the Participant cancels or reschedules. No other fee is payable to the Studio for this session.`)
              : "")
          : `\n\n7. ENGAGEMENT FEE, SELECTED PACKAGE & PAYMENT MILESTONES\nSelected package and contracted deliverables: ${paidPackageLine}.\n${paymentTermsText.replace(/^Payment Terms: /, "Payment terms: ")}\nThe advance retainer moves to a new date if the shoot is rescheduled at least 24 hours before the call time (up to two moves); with less notice, or a no-show, it is kept. If the Studio cancels, the Client is offered a new date or a full refund. ${packageSchedule.release} Any work beyond the contracted package (additional retouched masters, extended usage, gallery buyout) is quoted and invoiced separately.`;

        // Test shoots only. A paid booking already carries this risk through its
        // non-refundable retainer; a collaboration pays nothing, so without this
        // a no-show costs the studio a held weekend and nothing else.
        // Numbered off whether the rental clause above is present, since it is
        // omitted on a collaboration with no rental — hardcoding "8" would
        // print a document that jumps from 6 to 8.
        const lateArrivalClause = "\n\n" + studioText(window.buildLateArrivalText(isTfpCat, engagementFeeClause ? 8 : 7));

        // What goes on the record is the sheet the client ticked (see
        // serializeTermsSheet). The clauses below are the old hand-written
        // summary, kept only as a fallback for an empty capture: the record
        // used to be built from them alone, and said far less than the sheet
        // — no house rules on an invited home-studio shoot, no credit
        // workflow, no travel clause, one-line waivers.
        /* Last resort only. A booking cannot be submitted without passing the
           terms modal, and the modal refuses to let anyone agree when the
           contract text has not loaded — so in practice sheetText is always
           there. What used to sit here was a frozen six-clause summary: a
           third copy of the terms, drifting quietly alongside the modal's.
           A pointer cannot drift. */
        const legacyStandardClauses = `${venueClause}\n\nStandard terms: ${contractRefDoc} applies in full, as shown on the booking form at the time of acceptance. A copy is available from the studio on request.${engagementFeeClause}${lateArrivalClause}`;
        const sheetText = (agreedSheetText || "").trim();
        /* Normally the client's record is the sheet they actually read. Where
           that was not captured, fall back to the live contract rather than to
           the frozen six-clause summary below it, which is a third copy of the
           terms and the reason the modal drifted in the first place. */
        const fallbackDoc = (window.WPS_CONTRACT_ARCHIVE || {})[isTfpCat ? window.ACTIVE_CONTRACTS.tfp : window.ACTIVE_CONTRACTS.commercial];
        const standardTermsText = sheetText
          || (fallbackDoc && fallbackDoc.fullText ? `${venueClause}\n\n${fallbackDoc.fullText}` : legacyStandardClauses);
        const tfpReleaseText = agreedToTerms ? (
          `\n\n==================================================\n` +
          `STUDIO PRODUCTION CONTRACT & LEGAL TERMS\n` +
          `${isCustomContract ? 'CUSTOM CLIENT CONTRACT / AGENCY MSA REQUESTED' : (isTfpCat ? 'TFP COLLABORATION & MODEL RELEASE' : 'COMMERCIAL SHOOT PRODUCTION AGREEMENT')}\n` +
          `Document Reference: ${contractRefDoc}\n` +
          `--------------------------------------------------\n` +
          `Studio: Prateek Saxena, trading as nerdyphotographer.in, ${getStudio().area}\n` +
          `Client/Participant: ${name}\n` +
          `Contact Email: ${email}\n` +
          `Contract Status: ${isCustomContract ? 'Custom Contract / Agency MSA Requested (Pending Studio Review)' : `Agreed to Studio Contract ${contractRefDoc}`}\n` +
          (isCustomContract ? `Custom Contract Notes: ${customContractNotes || 'Client requested custom agency MSA'}\n` : '') +
          (isCustomContract ? '' : recordDeliverablesLine) +
          `--------------------------------------------------\n\n` +
          (isCustomContract ?
            `1. CUSTOM CONTRACT / AGENCY MSA REQUEST\nThis shoot request is submitted under a Custom Client Contract / Agency Master Services Agreement (MSA). The studio's standard terms (${isTfpCat ? window.ACTIVE_CONTRACTS.tfp : window.ACTIVE_CONTRACTS.commercial}) remain subject to custom contract review and mutual alignment prior to shoot day confirmation.\n\n2. CAMERA GEAR & DATA PROTECTION CLAUSE\nAll camera bodies, memory cards, and raw captures remain confidential studio property. Participants may not touch equipment or delete media from cameras.\n` +
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
        // With the deliverables this booking gets (v588), not only the package's name.
        const dlMail = deliverablesNow(isTfpCat);
        const cleanBudget = isTfpCat
          ? (dlMail.line ? `Package & Deliverables: Test shoot — ${dlMail.line}\n` : "")
          : ((budget && budget !== "Not Decided" && budget !== "TBD") ? `Package & Deliverables: ${dlMail.line ? `${budget} — ${dlMail.line}` : budget}\n` : "");

        // The studio-space select is hidden on these bookings but keeps its
        // default answer, so reading it verbatim told the studio "client books
        // studio directly" on a shoot where the studio supplies the space.
        // Read from the pricing snapshot rather than the destructure further
        // down: that runs after this block, so naming it here would be a
        // use-before-declaration crash on every submit.
        // House rules for shooting at the photographer's residence apply
        // whether or not a rental is charged for it.
        const homeStudioHouseRules = studioText(`Home Studio Policy: This session takes place at the photographer's private residence. Attendance is capped at 3 people in total — the photographer, you, and any crew you bring (hair & make-up, stylist, assistants and guests all count towards this cap), sessions run within booked daylight hours and finish by 7:00 PM, and the full address is shared once the booking is confirmed. Anyone under 18 must come with a parent or guardian.\n`);

        // A rental above zero means the home studio IS the venue, whatever the
        // dropdown says — it is hidden entirely on invite bookings, so keying
        // off it alone described an invited-but-chargeable session as free.
        // An invite can supply a venue that is not the home studio at all, so
        // the venue is named from the booking rather than assumed — billing a
        // rented space as the home studio leaves the studio's own record
        // describing a shoot that never happened there.
        const inviteVenueName = (bookingCalc && bookingCalc.isValidInvite && bookingCalc.lockedLocation) || "";
        const venueLabel = inviteVenueName || studioLabel();
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
          ? studioText(`Studio Rental Policy: This session takes place at the studio's home studio in ${HOME_STUDIO_AREA}. A fixed home studio rental of ₹${homeStudioRentalFee.toLocaleString('en-IN')} applies and is itemised in your production quote — nothing further is charged for the venue.\n`) +
            homeStudioHouseRules
          : venueByStudio
            ? `Studio Rental Policy: The venue for this session is arranged and paid for by the studio. No venue rental or studio space fee is billed to you for this shoot.\n` +
              (isHomeStudio ? homeStudioHouseRules : ``)
            : `Studio Rental Policy: Package rates cover photography, light design & retouched master deliverables. If a dedicated indoor studio space is required, venue rental fees are quoted separately in advance, or the client may book the studio directly.\n` +
              (studioArrangerSubmitClause ? `Studio Arranger:${studioArrangerSubmitClause}\n` : ``);
        // Reads bookingCalc, not inviteMeta: inviteMeta is declared further
        // down, and touching a const before its line throws — which silently
        // killed every home-studio and venue-locked invite submit from v452
        // to v514 (nothing reached the studio, the button hung on "Sending").
        const travelPolicyNote = venueByStudio
          ? studioText(`Travel & Accommodation Policy: Travel to the studio-provided venue above is covered by the studio${(bookingCalc && bookingCalc.isValidInvite) ? " for this invite" : ""}. If you later request a different location, standard terms apply again (travel beyond ${isTfpCat ? 10 : 20} km from the studio base in Noida, and accommodation where an overnight stay is needed, billed at actuals).\n`)
          : studioText(`Travel & Accommodation Policy: Shoots requiring travel beyond ${isTfpCat ? 10 : 20} km from the studio base (Sector 46, Noida) incur paid travel and, where an overnight stay is needed, accommodation - billed at actuals (at cost).\n`);
        // Paid shoots only: the package buys the photographer, not the crew.
        // Nothing anywhere said so, which left every HMUA/styling/set cost an
        // argument waiting to happen on shoot day.
        // Test shoots need this every bit as much as paid ones: a collaboration
        // covers the photographer's time, never an HMUA or stylist the talent
        // assumed was included.
        const crewCostPolicyNote = (type !== "Selective Collaboration (TFP)")
          ? `Creative Crew & Third-Party Costs: The package rate covers the photographer's creative fee, light design, direction and retouched master deliverables only. If the shoot requires a hair & make-up artist (HMUA), wardrobe stylist, set designer, props / set construction, art direction or any other third-party creative, their charges apply AT ACTUALS (at cost) over and above the package rate. You are free to bring your own crew, or the studio can source them for you — either way the cost is quoted for your approval before the shoot day and nothing is incurred without your confirmation.\n`
          : `Creative Crew & Third-Party Costs: This collaboration covers the photographer's creative fee, light design, direction and the agreed retouched master deliverables only. If the shoot requires a hair & make-up artist (HMUA), wardrobe stylist, set designer, props / set construction, art direction or any other third-party creative, those charges apply AT ACTUALS (at cost) and are borne by the participant. You are free to bring your own crew, or the studio can source them for you — either way the cost is quoted for your approval before the shoot day and nothing is incurred without your confirmation.\n`;
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
          code: enteredCode,
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
          const advance = Math.min(finalPayable, Math.round(packageNet / 2) + (homeStudioFee || 0));
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
          ? `${inviteMeta.code} (test shoot)${inviteMeta.lockedLocation ? ` · venue set by the studio: ${inviteMeta.lockedLocation}` : ""}`
          : (enteredCode ? `${enteredCode} — not recognised, no invite applied` : "");
        const promoLine = promoMeta
          ? `${promoMeta.code}${promoMeta.tag ? ` — ${promoMeta.tag} on the package` : ""}` +
            studioText(homeStudioWaivedByPromo
              ? " · home studio rental waived"
              : (homeStudioDiscountedByPromo ? ` · ${homeStudioPromoDiscountLabel} on the home studio rental`
                : (homeStudioRaisedByPromo ? ` · home studio rental set to ${inr(homeStudioRentalFee)} by the code` : ""))) +
            ((!promoMeta.tag && !homeStudioWaivedByPromo && !homeStudioDiscountedByPromo && !homeStudioRaisedByPromo) ? " · no discount applies to this booking" : "")
          : (enteredDiscount ? `${enteredDiscount} — not recognised, no discount applied` : "");
        const packageDiscountLine = savings > 0 ? `− ${inr(savings)} (${discountTagText})` : "";
        const venueChargeLine = homeStudioRentalFee > 0
          ? `${inr(homeStudioRentalFee)} — ${venueLabel}` +
            (homeStudioDiscountedByPromo
              ? ` (${homeStudioPromoDiscountLabel} with promo code ${promoCodeUsed}, normally ${inr(homeStudioListPriceVal)})`
              : (homeStudioDiscountedByInvite ? ` (${homeStudioInviteDiscountLabel} with invite code ${inviteCodeUsed}, normally ${inr(homeStudioListPriceVal)})`
                : (homeStudioRaisedByPromo ? ` (set by promo code ${promoCodeUsed}; the standard rate is ${inr(homeStudioListPriceVal)})` : ""))) +
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
            ? studioText(`${inr(finalPayableNum)}${isCollabPricing ? " — home studio rental only, no shoot fee" : (totalSavings > 0 ? ` (after ${inr(totalSavings)} in discounts)` : "")}`)
            : (isCollabPricing ? "₹0 — collaboration, nothing payable to the studio" : "—");
        const paymentScheduleLine = isProduction
          ? `${productionSchedule.text} — as shown on the brief form; figures confirmed in the proposal`
          : isCollabPricing
            ? (homeStudioRentalFee > 0
                ? `${inr(homeStudioRentalFee)} rental payable in full before the shoot day (moves with a reschedule made 24 hours ahead; otherwise kept)`
                : "Nothing payable")
            : (() => {
                const legs = splitPackageMilestones(finalPayableNum - homeStudioRentalFee, homeStudioRentalFee, packageScheduleKey);
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
          (subjectName
            ? `\n— BOOKING FOR SOMEONE ELSE —\n` +
              `Being photographed: ${subjectName}\n` +
              `Their email: ${subjectEmail || '—'}\n` +
              (subjectIsMinor
                ? `Under 18: YES — release goes to ${guardianName || 'their guardian'} (${guardianEmail || '—'}), not to them. Do not confirm until it comes back from that address; they are copied on the signed contract.\n`
                : `Under 18: no\n`) +
              (selfMinorBooking
                ? `Who is booking: the person being photographed, who is under 18 — they gave a parent or guardian's name and email\n`
                : `Booker confirmed they may book for them: ${bookerAuthorised ? "yes" : "NO — check before shooting"}\n`) +
              `Release sent to: ${releaseTo || '—'} (separate from the contract; it comes back on its own)\n\n`
            : "") +
          `Email: ${email}\n` +
          `Phone: ${phone || '—'}\n` +
          `Instagram / Website: ${instagram || '—'}\n` +
          heardInfo.lines +
          `Shoot Type: ${type}\n` +
          `Proposed Date: ${date}\n` +
          (laterMode ? `⚠️ Date Status: TO BE AGREED — the client has seen the costs, accepted the terms and signed. Agree a date with them by email, then add it to the calendar as a Test shoot.\n` : "") +
          (dateAlreadyBooked ? `⚠️ Date Status: This date already has a booking on the calendar — decide whether to confirm anyway or suggest an alternative.\n` : "") +
          `Session Duration: ${sessionDuration || '—'}\n` +
          `Location Pref: ${locationVal}\n` +
          `Studio Space Rental: ${studioSpaceVal.replace(/ \(Billed at Actuals\)/g, "")}\n` +
          studioRentalPolicyNote +
          travelPolicyNote +
          (isProduction ? `Budget / Package: Quoted on the brief after a call\n` + productionLines : cleanBudget) +
          pricingLines +
          (type !== "Selective Collaboration (TFP)"
            ? `${paymentTermsText}\n`
            : (homeStudioRentalFee > 0
                ? studioText(`Payment Terms: No shoot fee applies to this collaboration. The home studio rental of ₹${homeStudioRentalFee.toLocaleString('en-IN')} is payable IN FULL at least 48 hours before the shoot day to reserve the space (non-refundable once paid). Nothing else is payable to the studio.\n`)
                : "")) +
          crewCostPolicyNote +
          deliverablePolicyNote +
          gearPolicyNote +
          `Moodboard Link: ${moodboard || '—'}\n` +
          (agreedToTerms
            ? (isCustomContract
                ? `Contract Agreement: ${name} has REQUESTED A CUSTOM CONTRACT / AGENCY MSA rather than accepting the standard terms as they stand. Studio default terms remain subject to custom contract review and mutual alignment before the shoot day is confirmed.\nRequested Contract Changes: ${customContractNotes || "—"}\nContract Reference: ${contractRefDoc}\nAgreement: ${sigDataUrl ? 'signed on the booking form' : 'accepted by tick-box on the booking form'}\nRead the terms you agreed to: https://www.nerdyphotographer.in/book/#terms-${isTfpCat ? window.ACTIVE_CONTRACTS.tfp : window.ACTIVE_CONTRACTS.commercial}\n\n`
                : `Contract Agreement: ${name} has agreed to ${contractRefDoc} in full, without modifications. By sending this email the client confirms acceptance of all studio terms and conditions.\nContract Reference: ${contractRefDoc}\nAgreement: ${sigDataUrl ? 'signed on the booking form' : 'accepted by tick-box on the booking form'}\nRead the terms you agreed to: https://www.nerdyphotographer.in/book/#terms-${isTfpCat ? window.ACTIVE_CONTRACTS.tfp : window.ACTIVE_CONTRACTS.commercial}\n\n`)
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
          (subjectName
            ? `\n— BOOKING FOR SOMEONE ELSE —\n` +
              `Being photographed: ${subjectName}\n` +
              `Their email: ${subjectEmail || '—'}\n` +
              (subjectIsMinor
                ? `Under 18: YES — release goes to ${guardianName || 'their guardian'} (${guardianEmail || '—'}), not to them. Do not confirm until it comes back from that address; they are copied on the signed contract.\n`
                : `Under 18: no\n`) +
              (selfMinorBooking
                ? `Who is booking: the person being photographed, who is under 18 — they gave a parent or guardian's name and email\n`
                : `Booker confirmed they may book for them: ${bookerAuthorised ? "yes" : "NO — check before shooting"}\n`) +
              `Release sent to: ${releaseTo || '—'} (separate from the contract; it comes back on its own)\n\n`
            : "") +
          `Email: ${email}\n` +
          `Phone: ${phone || '—'}\n` +
          `Instagram / Website: ${instagram || '—'}\n` +
          heardInfo.lines +
          `Shoot Type: ${type}\n` +
          `Proposed Date: ${date}\n` +
          (laterMode ? `⚠️ Date Status: TO BE AGREED — the client has seen the costs, accepted the terms and signed. Agree a date with them by email, then add it to the calendar as a Test shoot.\n` : "") +
          (dateAlreadyBooked ? `⚠️ Date Status: This date already has a booking on the calendar — decide whether to confirm anyway or suggest an alternative.\n` : "") +
          `Session Duration: ${sessionDuration || '—'}\n` +
          `Location Pref: ${locationVal}\n` +
          `Studio Space Rental: ${studioSpaceVal.replace(/ \(Billed at Actuals\)/g, "")}\n` +
          (isProduction ? `Budget / Package: Quoted on the brief after a call\n` + productionLines : cleanBudget) +
          pricingShort +
          `Moodboard Link: ${moodboard || '—'}\n` +
          (agreedToTerms
            ? (isCustomContract
                ? `Contract Agreement: CUSTOM CONTRACT / AGENCY MSA REQUESTED — standard terms subject to review.\nRequested Contract Changes: ${customContractNotes || "—"}\nContract Reference: ${contractRefDoc}\nAgreement: ${sigDataUrl ? 'signed on the booking form' : 'accepted by tick-box on the booking form'}\n`
                : `Contract Agreement: ${name} has agreed to ${contractRefDoc} in full, without modifications. By sending this email the client confirms acceptance of all studio terms and conditions.\nContract Reference: ${contractRefDoc}\nAgreement: ${sigDataUrl ? 'signed on the booking form' : 'accepted by tick-box on the booking form'}\n`)
            : ``) +
          (isProduction ? `` :           `Studio Policies (studio rental, travel & accommodation, deliverables & RAW files, camera & media, payment terms): read and accepted in full — https://www.nerdyphotographer.in/book/#terms-${isTfpCat ? window.ACTIVE_CONTRACTS.tfp : window.ACTIVE_CONTRACTS.commercial}\n\n`) +
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
            financialSummary.homeStudioFee > 0 ? studioText(`Home Studio Rental: ₹${financialSummary.homeStudioFee.toLocaleString('en-IN')}`) : null,
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
          if (date && !laterMode) {
            // The days the picker recorded, when it was used. Falling back to
            // the text, a range or list is split on the en-dash or on commas
            // that separate whole dates ("Oct 10, 2026, Oct 11, 2026"), never
            // on the comma inside one date, which is what filed bookings under
            // the year 2001.
            const dateEl = $("#b_date");
            const picked = (dateEl && Array.isArray(dateEl._wpsPickedDates) && dateEl._wpsPickedDates.length)
              ? dateEl._wpsPickedDates.slice()
              : parseTypedDates(date);
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
          /* Once the request has reached the studio, the copy below is the
             client's own record, not something left for them to send: "Mail
             app didn't open? … email them" under a delivered request read as
             a failed send (the studio, testing it, Sep 29 2026). */
          const copyNote = $("#inquiryCopyNote");
          if (copyNote) {
            copyNote.hidden = sending;
            if (sentDirectly) copyNote.textContent = "Your copy of this request — it has already reached the studio, so there is nothing more to send. Keep it for your records.";
            else copyNote.innerHTML = `Mail app didn't open? Copy the inquiry details below and email them to <strong style="color: var(--ink); font-family: monospace;">${esc(studioEmail)}</strong>:`;
          }
          if (successPanel) successPanel.classList.toggle("is-tfp", type === "Selective Collaboration (TFP)");
          if (successPanel) successPanel.classList.toggle("is-production", isProduction);
          // The booking itself was already written to the calendar store by
          // the instant-save block above — recording it again here doubled
          // every agreed booking on the device (two slots per date).
          if (date && !laterMode) window.WPS_ADMIN?.updateReminders?.();

          if (successPanel) {
            form.hidden = true;
            successPanel.hidden = false;
            clearBookDraft();

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
              ? (isCustomContract
                  ? `<br/><br/><strong style="color: var(--accent-text);">Custom contract requested:</strong> your changes went to the studio with this request${contractNumber ? ` (${esc(contractNumber)})` : ""}. Nothing is agreed until the studio replies with the contract.`
                  : `<br/><br/><strong style="color: var(--accent-text);">Terms agreed:</strong> your acceptance of <em>${esc(contractRefDoc)}</em>${contractNumber ? ` (${esc(contractNumber)})` : ""} went to the studio with this request, and a copy is on its way to you.`)
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
          btn.textContent = (type === "Selective Collaboration (TFP)" ? "Request a test shoot" : "Submit Booking Request");
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
          // How they heard about the studio: only when they said (v621). The signed contract record does not carry it.
          ...heardInfo.fields,
          // Booking for someone else: the one email that always reaches the
          // studio never said who was in front of the camera (Sep 2026 audit, B7).
          ...(onBehalf ? {
            "Being photographed": subjectName || "—",
            "Their email": subjectEmail || "—",
            "Under 18": subjectIsMinor ? "Yes" : "No",
            ...(subjectIsMinor ? {
              "Parent or guardian": `${guardianName || "—"} (${guardianEmail || "—"})`,
              "⚠️ Under 18": `Do not confirm until the parent or guardian's signed release comes back from ${guardianEmail || "their address"}. They are copied on the signed contract. A parent or guardian should be at the shoot.`
            } : {}),
            ...(selfMinorBooking ? { "Who is booking": "The person being photographed, who is under 18. They gave a parent or guardian's name and email." } : {}),
            "Booker confirms they are authorised": selfMinorBooking ? "n/a — they are booking for themselves" : (bookerAuthorised ? "Yes" : "No")
          } : { "Confirms 18 or over": $("#b_adult")?.checked ? "Yes" : "No" }),
          "Shoot Type": type,
          "Proposed Date": date,
          ...(laterMode ? { "Date Status": "⚠️ TO BE AGREED — the client has seen the costs, accepted the terms and signed. Agree a date with them by email, then add it to the calendar as a Test shoot." } : {}),
          "Session Duration": sessionDuration || "—",
          "Location Pref": locationVal,
          "Studio Space": (studioSpaceVal || "—").replace(/ \(Billed at Actuals\)/g, ""),
          // With no published rates in hand, nothing on the page was a real
          // quote, so the email must not read as though one was agreed.
          ...(pricesArePublished() ? {} : { "⚠️ Prices": "The studio's rates could not be loaded in this visitor's browser, so no quote was shown and none was agreed. Quote this request by email." }),
          "Package": isProduction ? "Quoted on the brief" : (pricesArePublished() ? budget : "Not quoted — prices unavailable"),
          // What this booking delivers, as its signed record names it (v588): the default, or the line its code sets.
          ...(isProduction ? {} : { "Deliverables": dlNow.line ? `${dlNow.line}${dlNow.from === "invite" ? " (set on the invite code)" : dlNow.from === "promo" ? " (set on the promo code)" : ""}` : "—" }),
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
          "Contract Agreement": agreedToTerms && isCustomContract
            ? `CUSTOM CONTRACT REQUESTED — not yet agreed; standard terms under review`
            : agreedToTerms
            ? `AGREED — ${contractRefDoc}${contractNumber ? ` · No. ${contractNumber}` : ""} · ${sigDataUrl ? "drawn signature captured" : (agreementMethod === "checkbox" ? "accepted by checkbox" : "accepted by email/DM consent")}${isCustomContract ? " · CUSTOM CONTRACT / AGENCY MSA REQUESTED" : ""} (full text below)`
            : "Not applicable",
          // What the client typed into "Request Custom Contract". It used to
          // travel only as one line inside the full contract text below,
          // where a request to change the terms was easy to miss.
          ...(isCustomContract ? { "Requested Contract Changes": customContractNotes || "Client requested a custom contract / agency MSA (no details given)" } : {}),
        };
        if (agreedToTerms) relayFields["Contract Full Text"] = tfpReleaseText.trim();
        // A brief carries its own subject, usage and scale; the package form's
        // defaults ("Fashion Editorial", "Full Day", "Outdoor") only misled.
        if (isProduction) ["Shoot Type", "Session Duration", "Studio Space"].forEach((k) => delete relayFields[k]);

        // The signed-contract email is an independent channel from the inquiry
        // relay — it goes out however the inquiry itself ends up travelling —
        // but it is queued to run AFTER the relay settles rather than beside
        // it: FormSubmit rate-limits per IP, so firing both (plus the
        // attachment retry) at once made them knock each other out.
        let releaseSent = false;
        const sendSubjectRelease = async () => {
          if (releaseSent || !subjectName || !releaseTo) return;
          releaseSent = true;
          try {
            await sendSubjectReleaseEmail({
              studioEmail,
              to: releaseTo,
              subjectName,
              signedBy: releaseSignedBy,
              isMinor: subjectIsMinor,
              bookerName: name,
              bookerEmail: email,
              bookerRole: role,
              selfMinor: selfMinorBooking,
              shootType: type,
              date,
              location: locationVal,
              contractNumber
            });
          } catch (e) {
            // The booking itself is already through; a failed release is for
            // the studio to chase, not a reason to tell the client it broke.
            console.warn("release email failed:", e);
          }
        };

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
            ...(onBehalf ? { participantName: subjectName, participantEmail: subjectEmail, participantIsMinor: subjectIsMinor, guardianName, guardianEmail } : {}),
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
          sendSubjectRelease();
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
        // Web3Forms first, FormSubmit as its backup (sendStudioMail); only if
        // both fail does the client get "one more step".
        window.sendStudioMail(studioEmail, relayFields, { wait: 15000 })
        .then((r) => {
          if (r.ok) {
            // Only now is it true. The signed-contract email follows rather
            // than travelling beside this one: FormSubmit rate-limits per IP,
            // and two emails fired in the same millisecond knock each other
            // out — the bug this sequencing was written for in v258, undone by
            // an "instant response" change in v281 and found again in the
            // Sep 2026 audit.
            showSuccess("sent");
            sendContractRecord();
            sendSubjectRelease();
            return;
          }
          console.warn("Booking relay rejected:", r.message);
          finishWithFallback();                      // downgrade to "one more step"
        })
        .catch((err) => {
          console.warn("Booking relay unreachable:", err && err.message);
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
        openTermsModal(onBehalfName(name), "TFP", (agreed, isCustom, notes, sigUrl, method) => proceedSubmit(agreed, "TFP", isCustom, notes, sigUrl, method));
      } else {
        openTermsModal(onBehalfName(name), "Commercial", (agreed, isCustom, notes, sigUrl, method) => proceedSubmit(agreed, "Commercial", isCustom, notes, sigUrl, method));
      }
    };

    if (form) form.addEventListener("submit", handleBookingSubmit);
    if (btn) btn.addEventListener("click", handleBookingSubmit);
    // Warm the contract text while they fill the form, so pressing Submit does
    // not sit on a network fetch before the terms can be read.
    if (form || btn) loadContracts().catch(() => {});

    /* Draw a contract's own text into the modal.

       The archive stores each contract as plain prose: numbered headings on
       their own line ("7. CALL TIME, GRACE PERIOD…"), later additions as
       block capitals ("A GUARDIAN FOR YOUNG PARTICIPANTS"), paragraphs
       separated by blank lines. That is all the structure there is, so that
       is all this reads. Everything goes in as text, never as HTML — the
       source is the studio's own file, but it reaches a client's screen and
       has no business carrying markup. */
    let contractsUnavailable = false;
    /* A contract laid out to be read (the owner, Sep 29 2026: "the contracts
       UX is bad, can we have bullet points and headers and sub headers …
       You dont have to change the content"). Not one word of the contract
       changes: each clause becomes a header with its number, a clause's
       paragraphs stay apart, a paragraph of several sentences becomes one
       bullet per sentence, and the figures in it are bold. The short
       sub-headers (CONTRACT_LABELS) are on-screen reading aids only — they
       are not in the contract text, the emails or the signed record.
       Everything goes in as text, never as HTML. */
    const CONTRACT_LABELS = [
      ["Any studio rental applicable to the session", "Studio rental"],
      ["Where a dedicated external or commercial studio space is booked", "Booking an outside studio"],
      ["RAW unedited files are not included", "RAW files"],
      ["The Participant is granted a non-exclusive licence", "Your licence"],
      ["On Instagram, tagging is not enough", "Instagram Collaborator"],
      ["Shoots requiring travel beyond", "Travel"],
      ["Where the session takes place at the Studio’s home studio", "Home studio attendance"],
      ["If the Participant has not arrived", "No-show"],
      ["A delay or cancellation notified at least 24 hours", "Rescheduling"],
      ["A delay notified on the shoot day", "Running late on the day"],
      ["If the Studio is not ready to begin", "If the Studio runs late"],
      ["Permission to use the photographs", "Permission to use the photographs"],
      ["This does not apply where the Participant is under 18", "Participants under 18"],
      ["Where they arrive alone", "Arriving alone"],
      ["The Studio may set this requirement aside", "Written confirmation"],
      ["Where a parent or guardian attends", "Guardians and attendance"],
      ["One round of minor revisions", "Revisions"],
      ["The Studio keeps the delivered files", "File retention"]
    ];
    // Amounts, times, distances and counts: the numbers a reader looks for.
    const CONTRACT_FIGURES = /(₹\s?[\d,]+|\b\d{1,2}:\d{2}\s?[AP]M\b|\b\d+(?:\/\d+)+(?=\s|\b)|\b\d+(?:\.\d+)?%|>?\b\d+\s?(?:km|KM)\b|\b\d+\s(?:to\s\d+\s)?(?:minutes|hours|days|months|people|Retouched Master Clicks)\b(?:\s\(\d+\s\w+\))?|\bunder 18\b|\bmaximum of two reschedules\b|\bOne round\b)/g;
    window.contractLayout = function(fullText, { labels = true, contents = true } = {}) {
      const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
      const withFigures = (node, text) => {
        let at = 0;
        String(text).replace(CONTRACT_FIGURES, (m, _g, i) => {
          if (i > at) node.appendChild(document.createTextNode(text.slice(at, i)));
          node.appendChild(el("strong", "ct-fig", m));
          at = i + m.length;
          return m;
        });
        if (at < text.length) node.appendChild(document.createTextNode(text.slice(at)));
        return node;
      };
      // Sentences, split only where a full stop, ? or ! is followed by a new
      // sentence — never at a semicolon, so no bullet starts mid-sentence.
      // Two characters before the stop, so an initial ("A.") never ends one.
      const sentences = (t) => String(t).split(/(?<=[A-Za-z0-9)”"'’\]]{2}[.!?])\s+(?=[A-Z0-9“"(‘])/).map((s) => s.trim()).filter(Boolean);
      // A heading written in capitals, as a line in the contents list: in
      // ordinary case, with the contract's own capitals kept where it uses
      // them — its defined terms and the names it writes that way.
      const KEEP_CASE = { hmua: "HMUA", raw: "RAW", tfp: "TFP", ncr: "NCR", km: "km", noida: "Noida", delhi: "Delhi", instagram: "Instagram", client: "Client", participant: "Participant", "participant's": "Participant's", "studio's": "Studio's" };
      const plainCase = (h) => {
        const low = String(h).toLowerCase().replace(/\b[a-z][a-z'’]*\b/g, (w) => KEEP_CASE[w.replace(/’/g, "'")] || w).replace(/\bthe studio\b/g, "the Studio");
        return low.charAt(0).toUpperCase() + low.slice(1);
      };
      const isHead = (l) => /^\d+\.\s+[A-Z]/.test(l) || (/^[A-Z][A-Z ,&/0-9()>.'’-]{5,}$/.test(l) && l === l.toUpperCase());
      const sections = [];
      let cur = null;
      String(fullText || "").split(/\n\s*\n/).forEach((block) => {
        const lines = block.replace(/\s+$/, "").split("\n");
        if (!lines.join("").trim()) return;
        if (isHead(lines[0].trim())) { cur = { head: lines.shift().trim(), paras: [] }; sections.push(cur); }
        else if (!cur) { cur = { head: "", paras: [] }; sections.push(cur); }
        let quote = null;
        lines.forEach((ln) => {
          // An indented line is quoted as written (the credit lines).
          if (/^\s{2,}\S/.test(ln)) { if (!quote) { quote = { quote: [] }; cur.paras.push(quote); } quote.quote.push(ln.trim()); return; }
          quote = null;
          if (ln.trim()) cur.paras.push({ text: ln.trim() });
        });
      });
      const frag = document.createDocumentFragment();
      const titled = sections.filter((s) => s.head);
      if (contents && titled.length > 2) {
        const toc = el("nav", "ct-toc");
        toc.setAttribute("aria-label", "Contents");
        toc.appendChild(el("span", "ct-toc-k", "Contents"));
        const list = el("ol", "ct-toc-list");
        titled.forEach((s, i) => {
          const m = s.head.match(/^(\d+)\.\s+(.*)$/);
          const b = el("button", "ct-toc-item");
          b.type = "button";
          b.appendChild(el("span", "ct-toc-n", m ? m[1] : "·"));
          b.appendChild(document.createTextNode(plainCase(m ? m[2] : s.head)));
          b.addEventListener("click", () => {
            const t = frag.__secs && frag.__secs[i];
            if (!t) return;
            // Shown first when the contract is paged (showTermsPage listens).
            t.dispatchEvent(new CustomEvent("ct-jump", { bubbles: true }));
            t.scrollIntoView({ behavior: "smooth", block: "start" });
          });
          const li = el("li"); li.appendChild(b); list.appendChild(li);
        });
        toc.appendChild(list);
        frag.appendChild(toc);
      }
      const secs = [];
      sections.forEach((s, si) => {
        const sec = el("section", "ct-sec");
        if (s.head) {
          const m = s.head.match(/^(\d+)\.\s+(.*)$/);
          const h = el("h4", "ct-head");
          if (m) h.appendChild(el("span", "ct-num", m[1]));
          h.appendChild(el("span", "ct-title", m ? m[2] : s.head));
          sec.appendChild(h);
          secs.push(sec);
        }
        let first = true;
        s.paras.forEach((p) => {
          if (p.quote) { const q = el("div", "ct-quote"); p.quote.forEach((ln) => q.appendChild(el("div", "", ln))); sec.appendChild(q); return; }
          const parts = sentences(p.text);
          let list = null;
          parts.forEach((sn) => {
            const label = labels && !first ? CONTRACT_LABELS.find(([start]) => sn.replace(/'/g, "’").startsWith(start.replace(/'/g, "’"))) : null;
            if (label) { sec.appendChild(el("h5", "ct-sub", label[1])); list = null; }
            first = false;
            if (parts.length === 1) { sec.appendChild(withFigures(el("p", "ct-p"), sn)); return; }
            if (!list) { list = el("ul", "ct-list"); sec.appendChild(list); }
            list.appendChild(withFigures(el("li"), sn));
          });
        });
        frag.appendChild(sec);
      });
      frag.__secs = secs;
      return frag;
    };
    /* The passages of a contract that apply only at the home studio, and name
       where it is. Each is written "where the session takes place at the home
       studio…", so leaving them out of a booking made for somewhere else
       changes nothing that booking agrees to; what is left out is what the
       client reads, ticks and has recorded. */
    function withoutHomeStudio(text) {
      return String(text)
        .replace(/\n\nHOME STUDIO ATTENDANCE\n[\s\S]*?(?=\n\n[A-Z0-9][A-Z0-9 ,&'’()\-./]{3,}\n|$)/, "")
        .replace(/\n\nAt the home studio the accompanying parent or guardian[^\n]*/, "")
        .replace(/\n\nAnyone the Participant brings along to help counts towards the home studio's limit[^\n]*/, "")
        // The paid contract says it in one sentence at the end of its crew clause.
        .replace(/ Where the session takes place at the (?:Studio|photographer)[’']s home studio in [^.\n]*\./, "");
    }
    function renderTermsBody(key, isTfp, atHome) {
      const host = $("#termsBody");
      if (!host) return;
      const doc = (window.WPS_CONTRACT_ARCHIVE || {})[key];
      host.textContent = "";
      host.__contractText = "";
      if (!doc && !window.WPS_CONTRACT_ARCHIVE && !contractsUnavailable) {
        // Not there yet: fetch it and draw when it lands.
        host.textContent = "Loading the terms…";
        setTermsAgreeable(false);
        loadContracts().then(() => renderTermsBody(key, isTfp, atHome)).catch(() => { contractsUnavailable = true; renderTermsBody(key, isTfp, atHome); });
        return;
      }
      if (!doc || !doc.fullText) {
        // Nobody should tick "I have read and agree" against a document that
        // did not arrive. Say so plainly and offer the retry.
        const warn = document.createElement("p");
        warn.style.cssText = "margin:0;color:var(--accent-text);font-weight:600;";
        warn.textContent = "The terms could not be loaded just now, so there is nothing here to agree to. Check your connection and try again.";
        const again = document.createElement("button");
        again.type = "button"; again.className = "btn btn-ghost";
        again.style.cssText = "font-size:var(--font-xs);height:auto;padding:9px 14px;align-self:flex-start;";
        again.textContent = "Try again";
        again.addEventListener("click", () => {
          host.textContent = "Loading the terms…";
          loadContracts().then(() => renderTermsBody(key, isTfp, atHome)).catch(() => renderTermsBody(key, isTfp, atHome));
        });
        host.append(warn, again);
        setTermsAgreeable(false);
        return;
      }
      // A contract read as part of a booking (atHome known) speaks of the studio as it is now;
      // one opened from an email link (atHome null) is the archive's, word for word.
      const agreed = atHome === false ? studioText(withoutHomeStudio(doc.fullText)) : atHome === true ? studioText(doc.fullText) : String(doc.fullText);
      host.appendChild(window.contractLayout(agreed));
      // The words themselves, for the record: serializeTermsSheet takes these,
      // not the laid-out screen, so no heading, contents line or bullet break
      // added for reading ever becomes part of the agreed contract.
      host.__contractText = agreed;
      paginateTerms(host);
      showTermsPage(1);
      setTermsAgreeable(true);
    }

    /* The contract a page at a time, like a paper one (the owner, Sep 29
       2026: "cant we have it like page 1 page 2 rather than 1 big"). Page 1
       is who the agreement is between and the contents; the clauses follow,
       a few to a page and never split across two. The tick-box and "Agree &
       Continue" stay on every page from the first — reading every page is
       the client's choice (the owner: "we can keep the check box in first
       page itself its upto user to read it or not"). Only what is on screen
       is paged: the agreed record is the contract text itself
       (serializeTermsSheet). */
    const TERMS_PAGE_CHARS = 2000;
    function paginateTerms(host) {
      const toc = host.querySelector(".ct-toc");
      const secs = [...host.querySelectorAll(".ct-sec")];
      let page = 1, used = 0;
      if (toc && secs.length) { toc.dataset.page = "1"; page = 2; }
      secs.forEach((sec) => {
        const len = (sec.textContent || "").length;
        if (used > 0 && used + len > TERMS_PAGE_CHARS) { page++; used = 0; }
        sec.dataset.page = String(page);
        used += len;
      });
      host.__pages = secs.length ? page : 0;
      // Each line of the contents says which page it is on.
      const titled = secs.filter((sec) => sec.querySelector(".ct-head"));
      if (toc) toc.querySelectorAll(".ct-toc-item").forEach((b, i) => {
        if (!titled[i] || b.querySelector(".ct-toc-p")) return;
        const tag = document.createElement("span");
        tag.className = "ct-toc-p";
        tag.textContent = `p. ${titled[i].dataset.page}`;
        b.appendChild(tag);
      });
      if (!host.__jumpWired) {
        host.addEventListener("ct-jump", (e) => { const pg = Number(e.target && e.target.dataset && e.target.dataset.page); if (pg) showTermsPage(pg, true); });
        host.__jumpWired = true;
      }
    }
    function showTermsPage(n, keepScroll) {
      const host = $("#termsBody"), area = $("#termsScrollArea"), pager = $("#termsPager"), agree = $("#termsAgreeBlock");
      const intro = [$("#termsModalSubtitle"), $("#termsIntroGrid")];
      const pages = (host && host.__pages) || 0;
      if (!pages) {
        // Nothing paged (still loading, or not there): everything as it was.
        if (pager) pager.hidden = true;
        intro.forEach((el) => { if (el) el.hidden = false; });
        if (agree) agree.hidden = false;
        return;
      }
      const page = Math.min(pages, Math.max(1, n || 1));
      host.__page = page;
      host.querySelectorAll("[data-page]").forEach((el) => { el.hidden = Number(el.dataset.page) !== page; });
      // The first clause on a page needs no rule above it.
      let firstSeen = false;
      host.querySelectorAll(".ct-sec").forEach((el) => { const first = !el.hidden && !firstSeen; if (first) firstSeen = true; el.classList.toggle("ct-first", first); });
      intro.forEach((el) => { if (el) el.hidden = page !== 1; });
      if (agree) agree.hidden = false;
      if (pager) {
        pager.hidden = false;
        const prev = $("#termsPrevBtn"), next = $("#termsNextBtn"), no = $("#termsPageNo");
        if (prev) { prev.disabled = page === 1; prev.onclick = () => showTermsPage(page - 1); }
        if (next) { next.hidden = page === pages; next.onclick = () => showTermsPage(page + 1); }
        if (no) no.textContent = `Page ${page} of ${pages}`;
      }
      if (area && !keepScroll) { area.scrollTop = 0; try { area.focus({ preventScroll: true }); } catch (e) {} }
    }
    window.showTermsPage = showTermsPage;

    /* With nothing to read there is nothing to agree to, so the tick and the
       accept button go with the text. */
    function setTermsAgreeable(on) {
      const box = $("#termsAgreeCheckbox"), wrap = $("#termsAgreeCheckbox")?.closest("label");
      if (box) { box.disabled = !on; if (!on) box.checked = false; }
      if (wrap) { wrap.style.opacity = on ? "" : "0.5"; wrap.style.cursor = on ? "pointer" : "not-allowed"; }
    }

    // Open the terms modal for `partnerName` and `shootCategory` ("TFP" vs "Commercial").
    // The terms window names who the contract is with; booking for someone
    // else, it names the person photographed as well (Sep 2026 audit, B7).
    const onBehalfName = (booker) => ($("#b_onbehalf")?.checked && !$("#b_selfminor")?.checked && val("b_subject_name"))
      ? `${booker} — booking for ${val("b_subject_name")}` : booker;

    function openTermsModal(partnerName, shootCategory, onAccept, pinnedVersion) {
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
      /* The version shown is the version booked. Both used to read a literal
         "V3.7" while ACTIVE_CONTRACTS had moved on to V3.10, so the badge, the
         tick-box label and the document itself all claimed a version three
         behind what the booking was actually stamped with. */
      // A link from a client's email names the version they agreed to, so an
      // older contract can still be re-read after a newer one takes over
      // (Sep 2026 audit, B18). Without one, the version in force is shown.
      const currentKey = isTfp ? window.ACTIVE_CONTRACTS.tfp : window.ACTIVE_CONTRACTS.commercial;
      const activeKey = (pinnedVersion && /^V\d+\.\d+-(COMMERCIAL|TFP)$/.test(pinnedVersion)) ? pinnedVersion : currentKey;
      const activeNum = (String(activeKey).match(/V(\d+\.\d+)/) || [])[1] || "";
      if (modalTag) modalTag.textContent = `${isTfp ? "TFP-LIABILITY-RELEASE" : "COMMERCIAL-CONTRACT"}-V${activeNum} (${activeKey === currentKey ? "ACTIVE" : "AS AGREED"})`;
      const versionLabel = $("#termsAgreeVersionLabel");
      if (versionLabel) versionLabel.textContent = `Studio Terms & Conditions (Version V${activeNum})`;
      if (partnerNameEl) partnerNameEl.textContent = partnerName || "Valued Client";
      const termsLocationEl = $("#termsLocation");
      if (termsLocationEl) termsLocationEl.textContent = ($("#b_location")?.value || "").trim() || "As per the booking form";
      
      // This is the screen the signature is actually captured on, so it is the
      // last place that can be left contradicting the form. On an invite that
      // supplies the venue, the stock "locations >20 km require client-funded
      // travel" / "venue rentals billed at actuals" lines are the opposite of
      // what the visitor was just shown.
      const modalIsHomeStudio = bookingAtHomeStudio();
      const modalVenueByStudio = $("#b_location")?.dataset.inviteLocked === "1" || modalIsHomeStudio;
      const modalVenueAddress = modalVenueByStudio ? ($("#b_location")?.value || "") : "";
      const modalHomeRider = modalIsHomeStudio
        ? studioText(` <strong>Home studio sessions</strong> take place at the photographer's private residence: attendance is capped at 3 people in total — the photographer, you, and any crew you bring; hair &amp; make-up, stylist, assistants and guests all count towards this cap, the session runs within booked daylight hours and finishes by <strong>7:00 PM</strong>, and the full address is shared once your booking is confirmed. Anyone under 18 must come with a parent or guardian.`)
        : "";
      // A paid home-studio booking now carries a fixed rental, so the blanket
      // "no studio rental is billed to you" would contradict the quote the
      // client is looking at while they tick this box.
      // The rental is read from the quote, not from the studio-space list: an
      // invite that locks the home studio hides that list, and the sheet then
      // told a test shoot being charged ₹4,000 that no rental was billed (the
      // studio, Sep 30 2026). A rental at a venue that isn't the home studio is
      // named as that venue.
      const modalHomeStudioFee = (bookingCalc && bookingCalc.homeStudioFee) || 0;
      const venueSentence = modalHomeStudioFee > 0 && !modalIsHomeStudio
        ? ` This session takes place at <strong>${esc(modalVenueAddress || ($("#b_location")?.value || "").trim() || "the venue named in your booking")}</strong>. A fixed venue rental of <strong>₹${modalHomeStudioFee.toLocaleString("en-IN")}</strong> applies and is itemised in your quote, <strong>payable in full at least 48 hours before the shoot day</strong> to reserve the space and non-refundable once paid — nothing further is charged for the venue, and no travel cost is charged for it.`
        : modalHomeStudioFee > 0
        ? studioText(` This session takes place at the Studio's home studio in ${HOME_STUDIO_AREA}${modalVenueAddress && modalVenueAddress !== HOME_STUDIO_NAME ? ` (<strong>${esc(modalVenueAddress)}</strong>)` : ""}. A fixed home studio rental of <strong>₹${modalHomeStudioFee.toLocaleString("en-IN")}</strong> applies and is itemised in your quote, <strong>payable in full at least 48 hours before the shoot day</strong> to reserve the space and non-refundable once paid — nothing further is charged for the venue, and no travel cost is charged for it.${modalHomeRider}`)
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
          ? `As a creative collaboration, test shoots (TFP collabs) include <strong>${esc(deliverablesNow(true).line)}</strong>. Deliverables include 1 Round of Minor Revisions (within 7 days). Cloud retention is active for 3 Months (90 days). The Studio retains final artistic authority over image selection and editing styles.${venueSentence} Under no circumstances will raw unedited files (RAW format) be delivered.`
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
      const modalPackage = isTfp ? "" : ($("#b_budget")?.value || "");
      if (subtitleEl) subtitleEl.textContent = isTfp ? tfpSubtitle : "Commercial Shoot, Usage Licence & Digital Consent Terms";
      if (partnerLabelEl) partnerLabelEl.textContent = isTfp ? "Model:" : "Client:";
      if (prodStatusEl) prodStatusEl.textContent = isTfp ? "Test shoot (collaboration)" : `Commercial / paid production${modalPackage ? ` — ${modalPackage}` : ""}`;
      // A booking away from the home studio does not see where it is, nor the
      // passages that only apply there (the studio, Sep 30 2026). A contract
      // opened from a client's email link (pinned) is shown whole.
      const termsAtHome = pinnedVersion ? null : bookingAtHomeStudio();
      { const area = $("#termsStudioArea"); if (area) area.textContent = termsAtHome === false ? "Noida" : getStudio().area; }
      renderTermsBody(activeKey, isTfp, termsAtHome);

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
      openTermsModal($("#b_name")?.value || "[Your name]", "TFP");
    });

    // Check if loaded with Hash link
    if (location.hash === "#tfp-terms") {
      openTermsModal("[Your name]", "TFP");
    } else if (/^#terms-V\d+\.\d+-(COMMERCIAL|TFP)$/.test(location.hash)) {
      const key = location.hash.slice("#terms-".length);
      openTermsModal("[Your name]", /TFP$/.test(key) ? "TFP" : "Commercial", undefined, key);
    } else if (location.hash === "#terms") {
      // The link in every commercial client's email ("Read terms online:
      // …/book/#terms") opened the form and nothing else, so a paying client
      // could not re-read what they had agreed to (Sep 2026 audit).
      openTermsModal("[Your name]", "Commercial");
    }

    /* "I am under 18" (v622). Ticking it does what booking for someone under 18
       does, with the child as the person photographed: the on-behalf and under-18 ticks go on, the booker's own name and
       email are copied into the "photographed" fields (the child's own address, which the guardian's must differ from),
       and the booker's confirmation is the tick itself. Unticking puts all of it back. */
    const selfMinorBox = $("#b_selfminor");
    const mirrorSelf = () => {
      if (!selfMinorBox?.checked) return;
      const n = $("#b_subject_name"), e = $("#b_subject_email");
      if (n) n.value = val("b_name");
      if (e) e.value = val("b_email");
    };
    selfMinorBox?.addEventListener("change", () => {
      const on = selfMinorBox.checked;
      ["b_onbehalf", "b_subject_minor", "b_authorised"].forEach((id) => { const el = $("#" + id); if (el) el.checked = on; });
      if (on) { const adult = $("#b_adult"); if (adult) adult.checked = false; mirrorSelf(); }
      else ["b_subject_name", "b_subject_email", "b_guardian_name", "b_guardian_email"].forEach((id) => { const el = $("#" + id); if (el) el.value = ""; });
      ["b_adult", "b_authorised", "b_subject_name", "b_subject_email", "b_guardian_name", "b_guardian_email"].forEach(clearError);
      updateFields();
    });
    ["b_name", "b_email"].forEach((id) => $("#" + id)?.addEventListener("input", mirrorSelf));

    // "Someone referred me" opens the optional box for who; any other answer, or none, puts it away.
    const syncHeard = () => { const f = $("#b_referrer_field"); if (f) f.hidden = $("#b_heard")?.value !== REFERRED; };
    $("#b_heard")?.addEventListener("change", syncHeard);
    syncHeard();

    /* A draft of the form, kept for this browser tab only. Going back and
       forward used to empty every field, a long brief included (Sep 2026
       audit, B25). Cleared once a request is sent, and by "Send another". */
    const BOOK_DRAFT_KEY = "wps-book-draft";
    const draftFields = () => [...form.querySelectorAll("input[id^='b_'], select[id^='b_'], textarea[id^='b_']")]
      .filter((el) => el.type !== "file" && el.type !== "hidden");
    const saveBookDraft = () => {
      try {
        const d = {};
        draftFields().forEach((el) => { d[el.id] = (el.type === "checkbox" || el.type === "radio") ? el.checked : el.value; });
        sessionStorage.setItem(BOOK_DRAFT_KEY, JSON.stringify(d));
      } catch (e) {}
    };
    const clearBookDraft = () => { try { sessionStorage.removeItem(BOOK_DRAFT_KEY); } catch (e) {} };
    (function restoreBookDraft() {
      let d = null;
      try { d = JSON.parse(sessionStorage.getItem(BOOK_DRAFT_KEY) || "null"); } catch (e) {}
      if (!d || typeof d !== "object") return;
      draftFields().forEach((el) => {
        if (!(el.id in d)) return;
        if (el.type === "checkbox" || el.type === "radio") el.checked = !!d[el.id];
        else if (!el.value || el.tagName === "SELECT" || el.tagName === "TEXTAREA") el.value = d[el.id];
        el.dispatchEvent(new Event(el.tagName === "SELECT" || el.type === "checkbox" || el.type === "radio" ? "change" : "input", { bubbles: true }));
      });
    })();
    form.addEventListener("input", saveBookDraft);
    form.addEventListener("change", saveBookDraft);

    // "Send another request" — reset back to a clean form.
    $("#bookAnother")?.addEventListener("click", () => {
      clearBookDraft();
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
      syncHeard();
      if (successPanel) successPanel.hidden = true;
      form.hidden = false;
      form.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" });
      updateFields();
    });
  
  };
})();
