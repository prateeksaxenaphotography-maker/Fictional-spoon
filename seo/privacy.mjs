/* ============================================================
   The privacy notice — the words.

   .github/scripts/build-seo.mjs turns this into a real page at /privacy/
   every time the site deploys, exactly as it does /licence/. There is no
   shell in the repo for it.

   WHY IT EXISTS. The booking form, the testimonial form and the portfolio
   PDF take names, emails, phone numbers, shoot addresses and, for a young
   participant, a guardian's details — and there was no notice anywhere
   saying what happens to them (Sep 2026 audit, S6; India's Digital Personal
   Data Protection Act 2023 expects one).

   KEEP IT TRUE. Every sentence here describes what the code actually does.
   If a form starts sending somewhere new, or a new service is added to the
   page, this page changes with it. The retention period is the owner's
   rule; change it here if the rule changes.
   ============================================================ */

export const PRIVACY = {
  slug: "privacy",

  metaTitle: "Privacy | nerdyphotographer.in",
  metaDescription:
    "What nerdyphotographer.in collects when you book, write a testimonial or buy a portfolio PDF, where it goes, how long it is kept and how to have it deleted.",

  eyebrow: "Your details",
  h1: "Privacy",
  intro:
    "This site belongs to Prateek Saxena, a photographer in Sector 46, Noida, trading as nerdyphotographer.in. This page says what I collect, why, where it goes and how to have it removed.",

  sections: [
    {
      heading: "What I collect",
      body: ["Only what you type into a form, and only when you send it:"],
      points: [
        "Booking a shoot: your name, email, phone number and Instagram or website, the shoot date and place, your brief and any links you add. If you book for someone else, their name and email, and a parent's or guardian's details if they are under 18.",
        "Writing a testimonial: your name, email, what you wrote and, if you choose, a file that shows the words are real.",
        "Buying a portfolio PDF: your email and your UPI reference number.",
        "Browsing: Google Analytics counts which pages are visited. It does not receive anything you type, or the codes or keys in a page address."
      ]
    },
    {
      heading: "Why",
      body: [
        "To reply to you, plan and run the shoot, send the contract you agreed to, match a payment to a sale, and ask the person photographed for permission to use their pictures. I do not sell your details, and I do not use them for advertising."
      ]
    },
    {
      heading: "Where it goes",
      body: ["The forms do not put anything you type on this website or in its public code — a testimonial appears here only once I choose to put it up, under the name you gave. What you send travels by email:"],
      points: [
        "FormSubmit (formsubmit.co), a form-to-email service, passes each form to my Gmail inbox. It is based outside India.",
        "Google keeps that inbox (Gmail) and runs the page counts (Google Analytics).",
        "Your own browser keeps a copy of a booking you sent and of the contract you agreed to, so you can see them again. Clearing the site's data in your browser removes them.",
        "The website itself is hosted by GitHub and served through Cloudflare. They see ordinary web traffic, not your form details."
      ]
    },
    {
      heading: "How long",
      body: [
        "Booking emails and signed contracts are kept for as long as the shoot, the payments and my accounts need them — at most three years after the shoot, unless the law requires longer — and are then deleted. A testimonial stays for as long as it is on the site; ask and it comes down."
      ]
    },
    {
      heading: "Photographs of you",
      body: [
        "Pictures are shown on this site and my social media only with permission: the permission in the contract when you booked for yourself, or given by you (or your parent or guardian) when someone else booked — or, where an agency or brand booked, confirmed by them as holding your agreement. You can withdraw it at any time by email, and the pictures come down from this site and my social media."
      ]
    },
    {
      heading: "Under 18",
      body: [
        "Someone under 18 does not book for themselves. A parent or guardian books for them, and permission for their pictures is asked of that adult."
      ]
    },
    {
      heading: "Your rights, and who to ask",
      body: [
        "You can ask to see the details I hold about you, to correct them, or to have them deleted, and you can withdraw a permission you gave. Email prateeksaxenaphotography@gmail.com — that address is also where to raise a complaint (I, Prateek Saxena, handle it myself). I reply within 30 days."
      ]
    }
  ]
};
