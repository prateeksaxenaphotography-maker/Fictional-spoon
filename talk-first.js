/* Talk first — the booking page's button under the Contact card (v594).

   The owner, Oct 8 2026: "can we have a option bellow it called talk first and
   it just send these details only" — "we just need a button"; and "talk first
   is not linked to bookings … it happens before someone books its independent".
   When, where and anything else "can be talked over mail or call".

   So it sends the Contact card's details — name, role, email, phone,
   Instagram — and nothing else, the way a booking travels: Web3Forms with
   FormSubmit behind it (window.sendStudioMail), and the visitor's own mail app
   if both fail. Nothing is booked, quoted or agreed, and no calendar is
   touched. The studio replies, and a meeting it arranges goes on the calendar
   with Meeting, which clients see as busy.

   Loaded on the press by app.js (which hands over the booking page's own
   helpers), so the code every visitor downloads stays inside its budget. */
window.WPS_TALK_FIRST = function ({ $, esc, setError, clearError, form, panel }) {
  const v = (id) => (($("#" + id) || {}).value || "").trim();
  const name = v("b_name"), email = v("b_email");
  const okMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (name) clearError("b_name"); else setError("b_name", "Please add your name.");
  if (okMail) clearError("b_email"); else setError("b_email", "Please add an email I can reply to.");
  if (!name || !okMail) {
    const el = $(name ? "#b_email" : "#b_name");
    if (el) { el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true }); }
    return;
  }

  const to = (window.STUDIO_CONFIG && window.STUDIO_CONFIG.email) || "prateeksaxenaphotography@gmail.com";
  const subject = `Talk first — ${name}`;
  const role = (($("#b_role") || {}).selectedOptions || [])[0];
  const lines = [["Name", name], ["Role", role ? role.text.trim() : "—"], ["Email", email], ["Phone", v("b_phone") || "—"], ["Instagram / Website", v("b_instagram") || "—"]];
  const plain = `Hi,\n\nI'd like to talk first, before booking.\n\n${lines.map(([k, x]) => `${k}: ${x}`).join("\n")}\n\nThanks,\n${name}`;
  const enc = encodeURIComponent;
  const links = {
    "#bookGmailLink": `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(plain)}`,
    "#bookOutlookLink": `https://outlook.live.com/default.aspx?rru=compose&to=${enc(to)}&subject=${enc(subject)}&body=${enc(plain)}`,
    "#bookMailtoLink": `mailto:${to}?subject=${enc(subject)}&body=${enc(plain)}`
  };
  const put = (sel, f) => { const el = $(sel); if (el) f(el); };

  // The booking page's own "sent" panel, worded for this.
  const show = (mode) => {
    const sending = mode === "sending", sent = mode === "sent";
    if (!panel) return;
    form.hidden = true; panel.hidden = false;
    Object.entries(links).forEach(([sel, href]) => put(sel, (a) => { a.href = href; a.hidden = sending || sent; }));
    const steps = panel.querySelector(".next-steps"); if (steps) steps.hidden = true;
    put("#bookAnother", (el) => { el.hidden = sending; });
    put("#inquiryTextPreview", (el) => { el.textContent = plain; });
    ["#inquiryTextPreview", "#copyInquiryBtn", "#inquiryCopyNote"].forEach((sel) => put(sel, (el) => { el.hidden = sending || sent; }));
    put("#inquiryCopyNote", (el) => { el.innerHTML = `Mail app didn't open? Copy this and email it to <strong>${esc(to)}</strong>.`; });
    put("#bookSuccessIcon", (el) => {
      el.innerHTML = sent
        ? `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>`
        : `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>`;
    });
    put("#bookSuccessHeading", (el) => { el.textContent = sending ? "Sending…" : sent ? "Details sent." : mode === "gmail" ? "One last step — press Send." : "One last step — pick how to send."; });
    put("#bookSuccessMsg", (el) => {
      el.innerHTML = sending
        ? "Sending your details to the studio — <strong>please keep this page open</strong> for a moment."
        : sent
        ? `<strong>Thanks, ${esc(name.split(/\s+/)[0] || name)}.</strong> Your details have reached the studio. I'll get in touch by email or a call.`
        : mode === "gmail"
        ? "I've opened your details, already filled in, in a <strong>new Gmail tab</strong> — switch to it and press <strong>Send</strong>. Don't use Gmail? Any button below sends the same."
        : "Your details are ready — <strong>choose one of the buttons below</strong> and press Send in whichever app opens. Nothing has reached the studio yet.";
    });
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
  };

  show("sending");
  const fallback = () => {
    let opened = false;
    try { opened = !!window.open(links["#bookGmailLink"], "_blank"); } catch (e) {}
    show(opened ? "gmail" : "manual");
  };
  window.sendStudioMail(to, {
    _subject: subject, "Enquiry": "Talk first — wants to talk before booking", _replyto: email, _template: "box",
    ...Object.fromEntries(lines),
    "Next step": "Get in touch by email or a call. If you meet, add it to the calendar with Meeting; clients see that day as busy."
  }, { wait: 15000 }).then((r) => (r && r.ok ? show("sent") : fallback())).catch(fallback);
};
