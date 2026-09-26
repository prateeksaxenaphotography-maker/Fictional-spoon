/* The contract archive — every version the studio has ever issued, and the
   only copy of their text.

   It used to live in admin.js, which no visitor ever downloads. The booking
   page's terms modal therefore had its own hand-written copy of the document,
   and the two drifted: bookings were being stamped V3.10 while the text people
   read and ticked "Agree & Continue" on had stood still at V3.7, missing the
   room cap, the booking-on-behalf terms, the agency warranty and the guardian
   clause. Nobody noticed for three versions, because nothing compared them.

   So the text moved here, where both halves of the site can reach it, and the
   modal now renders whatever window.ACTIVE_CONTRACTS points at. There is one
   copy of every clause. It cannot drift again.

   Loaded on demand by app.js (loadContracts) rather than by every page: it is
   ~94 KB and only the booking page and the studio's own screens need it.
   Depends on window.buildLateArrivalText from app.js, which always loads first.

   Archived versions are never edited — whoever signed V3.9 agreed to V3.9.
   See the version-by-version notes inline below. */

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
This session is scheduled as a peer-to-peer creative collaboration or commercial production structured for mutual portfolio growth, asset curation, and personal branding advancement. The Studio provides specialized equipment, lighting architecture, workspace, and post-production engineering; the Participant(s) provide technical modelling direction, personal wardrobe, and makeup artistry. Studio Rental Policy: Package rates cover photography creation, light design & master retouched deliverables. If a dedicated indoor studio venue/space is required, applicable studio rental fees are billed at actuals (at cost), or the client may directly book their preferred studio venue for the production.

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
This session is conducted under a Time-For-Print (TFP) framework for mutual portfolio creation. The Studio provides photography, lighting, and editing services; the Participant provides modelling services, wardrobe, and styling. No monetary compensation is exchanged for creative time.

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
TFP creative session organized for portfolio development. Studio provides camera equipment, lighting, and post-processing; model provides styling and modelling direction.

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
  // The home studio's area, named in place (September 2026) without a new
  // version: the terms are unchanged, only where the studio is is stated.
  ).replace("the Studio’s home studio in Noida,", `the Studio’s home studio in ${HOME_STUDIO_AREA},`)
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

// V3.7-TFP: the travel radius for a test shoot is 10 km from Noida (paid
// shoots keep 20 km under the commercial contract). Composed off V3.6-TFP.
window.WPS_CONTRACT_ARCHIVE["V3.7-TFP"] = {
  version: "V3.7-TFP",
  title: "Test Shoot & TFP Liability Release V3.7 (Test Shoots)",
  effectiveDate: "September 2026 – Present",
  status: "Active / Current (Test Shoot / TFP)",
  summary: window.WPS_CONTRACT_ARCHIVE["V3.6-TFP"].summary + " Travel radius for a test shoot is 10 km from Noida; beyond it, travel is at actuals.",
  fullText: window.WPS_CONTRACT_ARCHIVE["V3.6-TFP"].fullText.replace(
    "Shoots requiring travel beyond 20 km incur travel expenses at actuals.",
    "Shoots requiring travel beyond 10 km from Noida incur travel expenses at actuals."
  )
};
/* V3.8: the home studio holds three people INCLUDING the photographer.

   V3.4 introduced the cap as "total attendance including the Client and all
   such crew is capped at 3 people", which left the photographer outside the
   count — four people in a room meant for three. The studio's rule is three in
   total, the photographer and the person being photographed among them.

   That is a narrower term than the one V3.7 clients agreed to, so it is a new
   version rather than an edit in place: a signed contract has to keep saying
   what was signed. The TFP release never carried the cap at all and now does,
   because it is the same room.

   Composed off the active sentences with .replace(), like the versions before
   it, and matched on the tail of the sentence only, so it does not depend on
   how the home studio's area happens to be named. */
window.WPS_CONTRACT_ARCHIVE["V3.8-COMMERCIAL"] = {
  version: "V3.8-COMMERCIAL",
  title: "Commercial Shoot & Release Agreement V3.8 (Paid Shoots)",
  effectiveDate: "September 2026 - Present",
  status: "Active / Current (Paid Commercial)",
  summary: window.WPS_CONTRACT_ARCHIVE["V3.7-COMMERCIAL"].summary + " At the home studio the room holds three people in total, the photographer included.",
  fullText: window.WPS_CONTRACT_ARCHIVE["V3.7-COMMERCIAL"].fullText.replace(
    "total attendance including the Client and all such crew is capped at 3 people.",
    "attendance is capped at 3 people in total, and that 3 counts the photographer as well as the Client and every crew member or guest the Client brings."
  )
};
window.WPS_CONTRACT_ARCHIVE["V3.7-COMMERCIAL"].effectiveDate = "September 2026 (superseded by V3.8)";
window.WPS_CONTRACT_ARCHIVE["V3.7-COMMERCIAL"].status = "Archived - superseded by V3.8 (home studio holds 3 including the photographer)";

window.WPS_CONTRACT_ARCHIVE["V3.8-TFP"] = {
  version: "V3.8-TFP",
  title: "Test Shoot & TFP Liability Release V3.8 (Test Shoots)",
  effectiveDate: "September 2026 - Present",
  status: "Active / Current (Test Shoot / TFP)",
  summary: window.WPS_CONTRACT_ARCHIVE["V3.7-TFP"].summary + " At the home studio the room holds three people in total, the photographer included.",
  fullText: window.WPS_CONTRACT_ARCHIVE["V3.7-TFP"].fullText +
    "\n\nHOME STUDIO ATTENDANCE\nWhere the session takes place at the photographer's home studio in " + HOME_STUDIO_AREA + ", attendance is capped at 3 people in total, and that 3 counts the photographer as well as the Participant and every crew member or guest the Participant brings."
};
/* V3.9: someone can book for someone else, and the release follows the face.

   An agency, brand or manager could always book — the role dropdown has said
   so for a long time — but the form asked for one name, so every Participant
   clause (the physical risk on the premises, the image release, the
   indemnity) attached to whoever signed. Where a brand booked a model, the
   brand had accepted a physical risk that was not theirs to accept, and the
   model had agreed to nothing at all, including to their own pictures being
   published.

   V3.9 separates the two: the Client is whoever arranges and pays, the
   Participant is the person photographed, and the Client warrants they may
   book for them. The image release is not taken from the Client at all — it
   is asked of the Participant in their own name, or of a parent or guardian
   where the Participant is under 18.

   A new version rather than an edit, for the same reason as V3.8: this
   changes what a signature means, and a signed contract has to keep saying
   what was signed. */
window.WPS_CONTRACT_ARCHIVE["V3.9-COMMERCIAL"] = {
  version: "V3.9-COMMERCIAL",
  title: "Commercial Shoot & Release Agreement V3.9 (Paid Shoots)",
  effectiveDate: "September 2026 - Present",
  status: "Active / Current (Paid Commercial)",
  summary: window.WPS_CONTRACT_ARCHIVE["V3.8-COMMERCIAL"].summary + " Where the Client books for somebody else, that person is named as the Participant and gives their own permission for their pictures.",
  fullText: window.WPS_CONTRACT_ARCHIVE["V3.8-COMMERCIAL"].fullText +
    "\n\nBOOKING ON BEHALF OF ANOTHER PERSON\nWhere the Client is not the person being photographed, that person is named in this booking as the Participant, and every term here describing the Participant applies to them and not to the Client. The Client warrants that they are authorised to make this booking for the Participant and to commit them to the shoot date and place.\n\nPermission to use the photographs is NOT given by the Client. It is asked of the Participant directly, in their own name, and the Studio does not publish or otherwise use the photographs until that permission is given. Where the Participant is under 18, that permission is asked of a parent or guardian instead, and the Participant's own agreement is not relied on. Permission may be withdrawn at any time, and on withdrawal the Studio removes the photographs from its own website and social media."
};
window.WPS_CONTRACT_ARCHIVE["V3.8-COMMERCIAL"].effectiveDate = "September 2026 (superseded by V3.9)";
window.WPS_CONTRACT_ARCHIVE["V3.8-COMMERCIAL"].status = "Archived - superseded by V3.9 (booking on another person's behalf; the release follows the Participant)";

window.WPS_CONTRACT_ARCHIVE["V3.9-TFP"] = {
  version: "V3.9-TFP",
  title: "Test Shoot & TFP Liability Release V3.9 (Test Shoots)",
  effectiveDate: "September 2026 - Present",
  status: "Active / Current (Test Shoot / TFP)",
  summary: window.WPS_CONTRACT_ARCHIVE["V3.8-TFP"].summary + " Where the booking is made for somebody else, that person is named as the Participant and gives their own permission for their pictures.",
  fullText: window.WPS_CONTRACT_ARCHIVE["V3.8-TFP"].fullText +
    "\n\nBOOKING ON BEHALF OF ANOTHER PERSON\nWhere the person making this booking is not the person being photographed, that person is named here as the Participant, and every term describing the Participant applies to them rather than to the person who booked. Whoever books warrants that they are authorised to do so for the Participant.\n\nPermission to use the photographs is asked of the Participant directly, in their own name, and nothing is published until it is given. Where the Participant is under 18, that permission is asked of a parent or guardian instead. Permission may be withdrawn at any time, and the Studio then removes the photographs from its own website and social media."
};
/* V3.10: an agency or brand warrants the rights instead of the studio asking
   its talent.

   V3.9 asked every booker to hand the release to the person photographed.
   That is right for an individual booking for a friend, and wrong for a
   company: an agency already holds a contract with its model, and several
   forbid approaching their talent directly, so a release email from the
   studio reads as going around them. What the studio actually needs from a
   company is not the model's signature but the company's word that it holds
   the rights and is granting portfolio use.

   So the obligation splits by who is booking. A company warrants; an
   individual passes the release to the person. A Participant under 18 is the
   exception either way — that permission is asked of a parent or guardian and
   kept on the studio's own record, because a child's images are not something
   to hold on another company's assurance.

   V3.10 also requires a guardian on set for a Participant under 18, or within
   six months of turning 18, and lets the Studio decline the session where one
   does not come. Turning 18 does not change who walks through the door, so the
   months after a birthday are treated like the months before it. The way out
   is deliberately hard to fake: written, before the call time, on a medium that
   records the sender, naming the Participant and the date, carrying identity
   and taking the liability. A phone call is not enough. Who may send it follows
   the law rather than the booking — a parent or guardian for a child, the
   Participant themselves once they are 18.

   That clause arrived after V3.10 was drafted and became part of it rather
   than a V3.11, because V3.10 had never been published: nobody had signed it,
   so there was no signer's copy to protect. The rule against editing an
   archived version is about people who agreed to it, not about the numbering. */
window.WPS_CONTRACT_ARCHIVE["V3.10-COMMERCIAL"] = {
  version: "V3.10-COMMERCIAL",
  title: "Commercial Shoot & Release Agreement V3.10 (Paid Shoots)",
  effectiveDate: "September 2026 - Present",
  status: "Active / Current (Paid Commercial)",
  summary: window.WPS_CONTRACT_ARCHIVE["V3.9-COMMERCIAL"].summary + " An agency or brand warrants the Participant's agreement rather than the Studio approaching them. Someone under 18, or within six months of turning 18, comes accompanied by a parent or guardian, and the Studio may decline the session where they do not.",
  fullText: window.WPS_CONTRACT_ARCHIVE["V3.9-COMMERCIAL"].fullText +
    "\n\nWHERE THE CLIENT IS AN AGENCY OR A COMPANY\nWhere the Client books as an agency, a brand or any other organisation, the Studio does not approach the Participant for permission and relies instead on the Client. The Client warrants that it holds the Participant's agreement to be photographed at this shoot, and that it is authorised to grant — and does grant — the Studio the right to use the photographs in its own portfolio, on its website and on its social media, with credit. The Client indemnifies the Studio against any claim that this agreement was not held.\n\nThis does not apply where the Participant is under 18. In that case permission is asked of a parent or guardian directly and kept on the Studio's own record, whoever made the booking." +
    "\n\nA GUARDIAN FOR YOUNG PARTICIPANTS\nWhere the Participant is under 18 on the shoot date, or reached 18 within the six months before it, they are expected on set accompanied by a parent or guardian, who stays for the whole of the session.\n\nWhere they arrive alone, the Studio may decline to begin the session, or end it once begun, at its sole discretion. A session declined on this basis is treated as a no-show under clause 7 above: the shoot day is released and the advance retainer is forfeited.\n\nThe Studio may set this requirement aside only on a written confirmation received before the call time, by email or another medium that records who sent it. That confirmation must name the Participant and the shoot date, state that the sender takes responsibility for the Participant attending unaccompanied, release the Studio from liability arising from their doing so, and enclose a government-issued photographic identity document of the sender. Where the Participant is under 18 it must come from a parent or guardian. Where the Participant has reached 18 it may come from the Participant themselves. A message that cannot be traced to a named adult is not a confirmation, and nothing agreed only in conversation sets this requirement aside.\n\nWhere a parent or guardian attends, they count towards any limit on attendance at the shoot venue."
};
window.WPS_CONTRACT_ARCHIVE["V3.9-COMMERCIAL"].effectiveDate = "September 2026 (superseded by V3.10)";
window.WPS_CONTRACT_ARCHIVE["V3.9-COMMERCIAL"].status = "Archived - superseded by V3.10 (an agency warrants the rights rather than the Studio approaching its talent)";

window.WPS_CONTRACT_ARCHIVE["V3.10-TFP"] = {
  version: "V3.10-TFP",
  title: "Test Shoot & TFP Liability Release V3.10 (Test Shoots)",
  effectiveDate: "September 2026 - Present",
  status: "Active / Current (Test Shoot / TFP)",
  summary: window.WPS_CONTRACT_ARCHIVE["V3.9-TFP"].summary + " An agency or brand warrants the Participant's agreement rather than the Studio approaching them. Someone under 18, or within six months of turning 18, comes accompanied by a parent or guardian, and the Studio may decline the session where they do not.",
  fullText: window.WPS_CONTRACT_ARCHIVE["V3.9-TFP"].fullText +
    "\n\nWHERE THE BOOKING IS MADE BY AN AGENCY OR A COMPANY\nWhere the booking is made by an agency, a brand or any other organisation, the Studio does not approach the Participant for permission and relies on whoever booked. They warrant that they hold the Participant's agreement to be photographed, and that they are authorised to grant — and do grant — the Studio the right to use the photographs in its own portfolio, on its website and on its social media, with credit.\n\nThis does not apply where the Participant is under 18. In that case permission is asked of a parent or guardian directly and kept on the Studio's own record, whoever made the booking." +
    "\n\nA GUARDIAN FOR YOUNG PARTICIPANTS\nWhere the Participant is under 18 on the shoot date, or reached 18 within the six months before it, they are expected on set accompanied by a parent or guardian, who stays for the whole of the session.\n\nWhere they arrive alone, the Studio may decline to begin the session, or end it once begun, at its sole discretion, and the session is treated as a no-show under clause 6 above.\n\nThe Studio may set this requirement aside only on a written confirmation received before the call time, by email or another medium that records who sent it. That confirmation must name the Participant and the shoot date, state that the sender takes responsibility for the Participant attending unaccompanied, release the Studio from liability arising from their doing so, and enclose a government-issued photographic identity document of the sender. Where the Participant is under 18 it must come from a parent or guardian. Where the Participant has reached 18 it may come from the Participant themselves. A message that cannot be traced to a named adult is not a confirmation, and nothing agreed only in conversation sets this requirement aside.\n\nAt the home studio the accompanying parent or guardian is one of the three people the room holds, as set out above — the photographer, the Participant and the adult with them."
};
window.WPS_CONTRACT_ARCHIVE["V3.9-TFP"].effectiveDate = "September 2026 (superseded by V3.10-TFP)";
window.WPS_CONTRACT_ARCHIVE["V3.9-TFP"].status = "Archived - superseded by V3.10-TFP (an agency warrants the rights rather than the Studio approaching its talent)";

/* V3.11: the terms the booking screen had and the contract did not.

   Moving the terms modal onto this archive (v476) exposed that the two
   documents did not merely differ in age — they disagreed. The screen clients
   actually read promised a proofing gallery, one round of minor revisions and
   a 6-month retention window, none of which appear here; and it sold RAW files
   as a buyout while clause 2 here refused them outright. Shipping the archive
   text as written would have quietly withdrawn two promises and reversed the
   RAW policy.

   The owner settled all three: the revision round and the retention window are
   real promises and stay; RAW is available as a paid buyout. So the clause is
   added and the contradicting sentence is replaced rather than left to argue
   with it. TFP keeps its shorter 3-month window.

   A new version rather than an edit to V3.10, because V3.10 shipped in v475
   and a published version may already have signers. That is the line: an
   unpublished version can still grow, a published one cannot. */
window.WPS_CONTRACT_ARCHIVE["V3.11-COMMERCIAL"] = {
  version: "V3.11-COMMERCIAL",
  title: "Commercial Shoot & Release Agreement V3.11 (Paid Shoots)",
  effectiveDate: "September 2026 - Present",
  status: "Active / Current (Paid Commercial)",
  summary: window.WPS_CONTRACT_ARCHIVE["V3.10-COMMERCIAL"].summary + " Adds the proofing gallery, one round of minor revisions and a stated file-retention period, and makes RAW files available under a separate paid buyout rather than refusing them outright.",
  fullText: window.WPS_CONTRACT_ARCHIVE["V3.10-COMMERCIAL"].fullText
    .replace("Under no circumstances are RAW unedited files delivered.", "RAW unedited files are not included in any package. Where the Client wants them, they are available only under a separate written buyout, agreed and paid for in advance.")
    + "\n\nDELIVERABLES, REVISIONS & FILE RETENTION\nThe Client receives a full proofing gallery together with the retouched master deliverables specified in the rate tier booked. One round of minor revisions is included, requested within 7 days of delivery; revisions cover retouching corrections rather than reselection or reshooting. The Studio keeps the delivered files available for 6 months (180 days) from the date of delivery, after which they may be removed without further notice — the Client is responsible for taking their own copy within that period."
};
window.WPS_CONTRACT_ARCHIVE["V3.10-COMMERCIAL"].effectiveDate = "September 2026 (superseded by V3.11)";
window.WPS_CONTRACT_ARCHIVE["V3.10-COMMERCIAL"].status = "Archived - superseded by V3.11 (proofing gallery, revision round, retention window; RAW by paid buyout)";

window.WPS_CONTRACT_ARCHIVE["V3.11-TFP"] = {
  version: "V3.11-TFP",
  title: "Test Shoot & TFP Liability Release V3.11 (Test Shoots)",
  effectiveDate: "September 2026 - Present",
  status: "Active / Current (Test Shoot / TFP)",
  summary: window.WPS_CONTRACT_ARCHIVE["V3.10-TFP"].summary + " Adds the proofing gallery, one round of minor revisions and a stated file-retention period, and makes RAW files available under a separate paid buyout rather than refusing them outright.",
  fullText: window.WPS_CONTRACT_ARCHIVE["V3.10-TFP"].fullText
    .replace("Strictly no RAW unedited files are delivered.", "RAW unedited files are not included. Where the Participant wants them, they are available only by separate written agreement with the Studio, for an additional fee agreed in advance.")
    + "\n\nDELIVERABLES, REVISIONS & FILE RETENTION\nThe Participant receives the deliverables agreed for the session. One round of minor revisions is included, requested within 7 days of delivery; revisions cover retouching corrections rather than reselection or reshooting, and the Studio retains final artistic authority over image selection and editing style. The Studio keeps the delivered files available for 3 months (90 days) from the date of delivery, after which they may be removed without further notice."
};
/* British spelling in the two versions clients read now (Sep 2026 audit,
   language items L15/L16): licence (the noun), colour, catalogues,
   specialisation, make-up. Spelling only — no word changes what the contract
   means — so the owner chose to keep the V3.11 numbers rather than issue a
   V3.12 (24 Sep 2026). It runs after both texts are composed, so none of the
   .replace() calls above can miss its target, and it touches V3.11 alone:
   every archived version stays exactly as its signers read it. */
(() => {
  const BRITISH = [
    [/\bLICENSE\b/g, "LICENCE"], [/\blicense\b/g, "licence"],
    [/\bcolor\b/g, "colour"], [/\bcatalogs\b/g, "catalogues"],
    [/\bSPECIALIZATION\b/g, "SPECIALISATION"], [/\bspecialization\b/g, "specialisation"],
    [/\bspecialized\b/g, "specialised"], [/\borganized\b/g, "organised"],
    [/\bauthorization\b/g, "authorisation"],
    [/\bmakeup\b/g, "make-up"], [/\bMakeup\b/g, "Make-up"]
  ];
  const british = (s) => BRITISH.reduce((t, [from, to]) => t.replace(from, to), String(s || ""));
  ["V3.11-COMMERCIAL", "V3.11-TFP"].forEach((v) => {
    const c = window.WPS_CONTRACT_ARCHIVE[v];
    c.title = british(c.title);
    c.summary = british(c.summary);
    c.fullText = british(c.fullText);
  });
})();

window.WPS_CONTRACT_ARCHIVE["V3.10-TFP"].effectiveDate = "September 2026 (superseded by V3.11-TFP)";
window.WPS_CONTRACT_ARCHIVE["V3.10-TFP"].status = "Archived - superseded by V3.11-TFP (proofing gallery, revision round, retention window; RAW by paid agreement)";

window.WPS_CONTRACT_ARCHIVE["V3.8-TFP"].effectiveDate = "September 2026 (superseded by V3.9-TFP)";
window.WPS_CONTRACT_ARCHIVE["V3.8-TFP"].status = "Archived - superseded by V3.9-TFP (booking on another person's behalf; the release follows the Participant)";

window.WPS_CONTRACT_ARCHIVE["V3.7-TFP"].effectiveDate = "September 2026 (superseded by V3.8-TFP)";
window.WPS_CONTRACT_ARCHIVE["V3.7-TFP"].status = "Archived - superseded by V3.8-TFP (home studio holds 3 including the photographer)";

window.WPS_CONTRACT_ARCHIVE["V3.6-TFP"].effectiveDate = "September 2026 (superseded by V3.7-TFP)";
window.WPS_CONTRACT_ARCHIVE["V3.6-TFP"].status = "Archived — superseded by V3.7-TFP (test-shoot travel radius 10 km)";

/* ── V3.12 (24 Sep 2026) ──────────────────────────────────────────────────
   The Sep 2026 audit found the contract clients tick disagreeing with the
   booking page it sits on. The owner settled each point, and V3.12 says it
   once:
   - payment: packages are 50/50; campaigns follow their written proposal;
   - cancellation: 24 hours' notice moves the advance to a new date (up to two
     moves); less notice or a no-show keeps it; if the Studio cancels, a new
     date or a full refund;
   - usage: a package covers the client's own website, social media,
     portfolio and comp cards; print, outdoor, TV and paid advertising need a
     separate written licence; campaigns agree usage in their proposal;
   - RAW: not included, can be bought (unchanged), and clause 5 no longer
     calls the raw captures the Studio's for ever regardless;
   - a client who books for themselves gives the Studio permission to show
     the pictures in its portfolio, withdrawable at any time (there was none);
   - the parties are named, with governing law, a liability limit and a
     force-majeure line; ID for an unaccompanied young participant is checked
     by video call or in person, never emailed; the test-shoot injury waiver
     no longer covers the Studio's own negligence; retouched counts come from
     the booking rather than a fixed "8 to 12"; TikTok is gone.
   A new version, because every one of these changes what a signer agreed to.
   Composed off V3.11 with .replace(); a sentence that fails to match is
   recorded in WPS_CONTRACT_COMPOSE_MISSES so a test can prove none did. */
(() => {
  const A = window.WPS_CONTRACT_ARCHIVE;
  const misses = (window.WPS_CONTRACT_COMPOSE_MISSES = window.WPS_CONTRACT_COMPOSE_MISSES || []);
  const swap = (label, text, pairs) => pairs.reduce((t, [from, to]) => {
    if (!t.includes(from)) { misses.push(`${label}: ${from.slice(0, 60)}`); return t; }
    return t.replace(from, to);
  }, text);

  const CANCEL_PAID = "\nCancelling with less notice than that, or not arriving, means the advance retainer is kept. If the Studio has to cancel the session, the Client is offered a new date or a full refund of everything paid for it, at the Client's choice.";
  const PORTFOLIO_USE = (who) => `PORTFOLIO USE OF THE PHOTOGRAPHS\nWhere the ${who} made this booking themselves, they agree that the Studio may show the photographs in its own portfolio, on its website and on its social media, with credit. They may withdraw this at any time by email, and the Studio then removes the photographs from its own website and social media. Where the booking is made for someone else, or by an agency or a company, the sections below apply instead.\n\n`;
  const PARTIES = (who) => `\n\nTHE PARTIES, LIABILITY & GOVERNING LAW\nThe Studio is Prateek Saxena, trading as nerdyphotographer.in, Sector 46, Noida, Uttar Pradesh. The Studio's total liability arising from a session, including for lost or damaged files, is limited to the amount the ${who} paid for that session. Neither party is responsible for a failure caused by events beyond its reasonable control, such as severe weather, illness or government restrictions; the session is then rescheduled, or refunded if it cannot be. This agreement is governed by the laws of India, and the courts at Gautam Buddh Nagar (Noida), Uttar Pradesh have jurisdiction.`;
  const ID_OLD = "and enclose a government-issued photographic identity document of the sender.";
  const ID_NEW = "and come from an adult the Studio can identify: the Studio may ask to see the sender's photographic ID on a short video call or in person, and identity documents should not be emailed.";

  A["V3.12-COMMERCIAL"] = {
    version: "V3.12-COMMERCIAL",
    title: "Commercial Shoot & Release Agreement V3.12 (Paid Shoots)",
    effectiveDate: "September 2026 - Present",
    status: "Active / Current (Paid Commercial)",
    summary: "Paid shoots. Packages are paid 50% before the shoot and 50% before the final files; campaigns follow their written proposal. Moving the shoot with 24 hours' notice carries the advance to the new date (up to two moves); less notice or a no-show keeps it; if the Studio cancels, a new date or a full refund. A package covers the Client's own website, social media, portfolio and comp cards; print, outdoor, TV and paid advertising are licensed separately in writing. RAW files are not included and can be bought. A client booking for themselves lets the Studio show the pictures in its portfolio, withdrawable at any time. Names the Studio, limits its liability to the fee paid, adds force majeure and Indian law with Noida courts. Keeps the grace period, home-studio cap of three, booking-on-behalf and guardian terms, revisions and file retention.",
    fullText: swap("V3.12-COMMERCIAL", A["V3.11-COMMERCIAL"].fullText, [
      ["Package rates cover photography creation, light design & master retouched deliverables. Standard bookings require a 50% advance retainer prior to shoot day start (non-refundable) and 50% final balance after shoot wrap prior to receiving downloadable master files (non-refundable). Commercial campaign bookings follow a 50/30/20 milestone structure.",
       "Package rates cover photography creation, light design and the retouched photographs specified in the tier booked. Package bookings are paid in two parts: a 50% advance retainer before the shoot day, which holds the date, and the 50% balance after the shoot, before the final files are sent. Campaign and production bookings follow the milestone schedule set out in their written proposal, the last part again due before the final files are sent. The advance retainer is not refunded, except as set out in clause 7 and where the Studio cancels."],
      ["2. COMMERCIAL USAGE RIGHTS & INTELLECTUAL PROPERTY", "2. USAGE RIGHTS & INTELLECTUAL PROPERTY"],
      ["The Client is granted full commercial usage rights for digital advertising, website grids, social media campaigns, print catalogues, and brand marketing as specified in the agreed project scope.",
       "For a package booking, the Client may use the final photographs on their own website and social media, in their own portfolio and on comp cards, crediting the Studio where the platform allows. Print, outdoor, television and paid advertising use is not included and needs a separate written licence from the Studio. For a campaign or production booking, the media, territory and period of use are those agreed in writing in its proposal."],
      ["All camera bodies, lenses, memory cards, tethering systems, and digital raw captures remain the exclusive physical and intellectual property of the Studio.",
       "All camera bodies, lenses, memory cards and tethering systems belong to the Studio, and the raw captures remain the Studio's property unless bought out under clause 2."],
      ["7. CALL TIME, GRACE PERIOD, LATE ARRIVAL & NO-SHOW", "7. CANCELLATION, CALL TIME, LATE ARRIVAL & NO-SHOW"],
      ["the advance retainer carries over to the rescheduled date — up to a maximum of two reschedules.",
       "the advance retainer carries over to the rescheduled date — up to a maximum of two reschedules." + CANCEL_PAID],
      ["BOOKING ON BEHALF OF ANOTHER PERSON\n", PORTFOLIO_USE("Client") + "BOOKING ON BEHALF OF ANOTHER PERSON\n"],
      [ID_OLD, ID_NEW]
    ]) + PARTIES("Client")
  };

  A["V3.12-TFP"] = {
    version: "V3.12-TFP",
    title: "Test Shoot & TFP Liability Release V3.12 (Test Shoots)",
    effectiveDate: "September 2026 - Present",
    status: "Active / Current (Test Shoot / TFP)",
    summary: "Test shoots unlocked by an invite code. No shoot fee; any studio rental is quoted in advance and paid before the shoot day. The retouched photographs are the number stated in the booking; RAW files are not included and can be bought. Personal, non-commercial use with Instagram co-author credit. Moving the shoot with 24 hours' notice forfeits nothing (up to two moves); less notice or a no-show keeps what was paid; if the Studio cancels, a new date or a full refund. The participant lets the Studio show the pictures in its portfolio, withdrawable at any time. The injury waiver excludes the Studio's own negligence. Names the Studio, limits its liability to the amount paid, adds force majeure and Indian law with Noida courts. Keeps the 60-minute grace period, home-studio cap of three, booking-on-behalf and guardian terms, revisions and file retention.",
    fullText: swap("V3.12-TFP", A["V3.11-TFP"].fullText, [
      ["Standard packages include web gallery access for online proofing and 8 to 12 Retouched Master Clicks.",
       "The session includes web gallery access for online proofing and the number of retouched photographs stated in the booking."],
      ["(Instagram/TikTok)", "(Instagram, YouTube and similar)"],
      ["  👤 Model / Talent: @[Handle]", "  👤 Model / Talent: @ followed by the Participant's own handle"],
      ["The Studio is not liable for injuries or clothing damage.", "The Studio is not liable for injuries or clothing damage, except where caused by the Studio's own negligence."],
      ["up to a maximum of two reschedules; beyond that the invite lapses.",
       "up to a maximum of two reschedules; beyond that the invite lapses. Cancelling with less notice than that, or not arriving, means any home studio rental or other amount already paid is kept. If the Studio has to cancel, the Participant is offered a new date or a full refund of anything paid for the session."],
      ["BOOKING ON BEHALF OF ANOTHER PERSON\n", PORTFOLIO_USE("Participant") + "BOOKING ON BEHALF OF ANOTHER PERSON\n"],
      [ID_OLD, ID_NEW]
    ]) + PARTIES("Participant")
  };

  A["V3.11-COMMERCIAL"].effectiveDate = "September 2026 (superseded by V3.12)";
  A["V3.11-COMMERCIAL"].status = "Archived - superseded by V3.12 (50/50 packages, one cancellation rule, own-channel usage, portfolio permission, parties and law)";
  A["V3.11-TFP"].effectiveDate = "September 2026 (superseded by V3.12-TFP)";
  A["V3.11-TFP"].status = "Archived - superseded by V3.12-TFP (one cancellation rule, portfolio permission, negligence carve-out, parties and law)";
})();

/* ── V4.0 (26 Sep 2026) ─────────────────────────────────────────────────────
   The owner's instruction: the contract clients sign goes back to the V3.11
   wording — "I want the contract language that was before … match it to
   V3.11". V3.12 (24 Sep 2026) had been issued without the owner approving its
   wording; among other things its usage clause could be read as a package
   promising the client's portfolio and comp cards, when making those is
   extra, paid work.
   V4.0 is V3.11 word for word (including the British spelling V3.11 already
   carries); only the version name and date differ. A new number rather than
   pointing back at V3.11, so every booking says which text it was made under
   and the week of V3.12 stays readable: V3.12 is archived unchanged for anyone
   who signed it between 24 and 26 Sep 2026. */
(() => {
  const A = window.WPS_CONTRACT_ARCHIVE;
  for (const [kind, label] of [["COMMERCIAL", "Paid Commercial"], ["TFP", "Test Shoot / TFP"]]) {
    const from = A[`V3.11-${kind}`];
    // "V4.0", not "V4": the site reads version numbers as number.number
    // (the admin's sorting, the booking's reference, the terms modal), and a
    // bare "V4" would sort as the oldest and print as a blank.
    A[`V4.0-${kind}`] = {
      version: `V4.0-${kind}`,
      title: from.title.replace("V3.11", "V4.0"),
      effectiveDate: "26 September 2026 - Present",
      status: `Active / Current (${label})`,
      summary: from.summary,
      fullText: from.fullText
    };
    A[`V3.12-${kind}`].effectiveDate = "24 - 26 September 2026 (superseded by V4.0)";
    A[`V3.12-${kind}`].status = "Archived - superseded by V4.0, which restores the V3.11 wording";
  }
})();
