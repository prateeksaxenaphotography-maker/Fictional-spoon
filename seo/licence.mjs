/* ============================================================
   The photo licensing page — the words.

   .github/scripts/build-seo.mjs turns this into a real page at /licence/
   every time the site deploys, the same way it builds the service pages.
   There is no tenth shell in the repo for it.

   WHY THE PAGE EXISTS. Every photograph on this site already goes out with
   its author, its copyright line and a page to ask on (creditText,
   copyrightNotice, creator, acquireLicensePage in the ImageObject each album
   page carries). The one thing missing was the address of the terms
   themselves — schema.org's `license` — which is what Google asks for before
   it will mark a photograph "Licensable" in Google Images and print a link
   back to the studio beside it. That link is the point: it is a way for
   someone who found a photograph to arrive here, which no amount of tagging
   the pictures achieves on its own.

   WHO IT IS WRITTEN FOR. A stranger who found one of these photographs —
   a publisher, a brand, someone building a mood board — and wants to know
   what they may do with it. It is NOT the client-facing agreement: what a
   model, an agency or a brand who actually shot with the studio may do with
   their pictures is settled by the contract they signed, and that text lives
   in exactly one place, contracts.js, rendered through ACTIVE_CONTRACTS in
   the terms modal on the booking page. Nothing here restates a clause from
   it. The "If you have shot with me" section deliberately points at that
   text instead of paraphrasing it — a second, drifting copy of usage terms
   is the thing the studio has already been bitten by.

   KEEP IT TRUE. No invented licence tiers, no prices, no promises about
   turnaround. The studio agrees terms per picture, in writing, before use.
   If the owner wants to take a position on something this page is silent
   about — machine learning and dataset training is the obvious one — that is
   the owner's decision to make and to word, not this file's to assume.

   ITS RELATIONSHIP TO contracts.js. This file is public-facing copy. It is
   not versioned per signer and it may be reworded whenever the studio likes,
   which is exactly why it does not belong in contracts.js: an archived
   contract must never move under the person who signed it, and this page must
   be free to change. The rule to hold instead of single-sourcing is that
   this page must never CONTRADICT, and never GRANT MORE THAN, the clause
   "COMMERCIAL USAGE RIGHTS & INTELLECTUAL PROPERTY" in the version that
   window.ACTIVE_CONTRACTS points at (V3.11-COMMERCIAL as this is written,
   which inherits that clause's wording from V3.10 and earlier). That clause
   keeps copyright exclusively with the studio and grants a paying client
   usage within the agreed project scope; everything below is narrower than
   it — the public is granted only linking, sharing and private reference.
   If that clause is ever widened or narrowed, read this page again.
   ============================================================ */

export const LICENCE = {
  slug: "licence",

  // Google prints about 60 characters of the title.
  metaTitle: "Photo Licensing & Copyright | nerdyphotographer.in",
  metaDescription:
    "How the photographs on nerdyphotographer.in may be used. Every picture is copyright of the studio: sharing a link needs no permission, republishing does. Ask about licensing a frame for print, editorial or a campaign.",

  eyebrow: "Copyright and usage",
  h1: "Licensing these photographs",
  intro:
    "Every photograph on this site was made by nerdyphotographer.in, a photography studio in Noida working across Delhi NCR. They are published here to show the work. They are not stock, and they are not free to reuse — but licensing one is usually straightforward, and this page says what needs asking and what does not.",

  sections: [
    {
      heading: "Who owns these pictures",
      body: [
        "The copyright in every photograph on this site stays with the studio. That is true of the frames on the album pages, the ones on the pages about each kind of shoot, and the wide preview images that appear when a link is shared."
      ]
    },
    {
      heading: "What needs no permission",
      body: ["Some things are simply how the web works, and nobody needs to write and ask:"],
      points: [
        "Linking to any page on this site, from anywhere.",
        "Sharing a link, and letting Instagram, WhatsApp or a search engine show the preview picture it pulls with it.",
        "Saving a photograph for your own private reference — a mood board you are not publishing, or a note to yourself about a shoot you want to book."
      ]
    },
    {
      heading: "What needs permission",
      body: ["Anything that publishes a photograph somewhere else, in other words:"],
      points: [
        "Reposting or reuploading a picture to a website, a social account, a newsletter or an app.",
        "Printing one — in a magazine, a lookbook, a portfolio, on a wall or on anything for sale.",
        "Using one in an advertisement, a campaign, a pitch deck or on a product.",
        "Cropping, editing, recolouring or adding text to one and then publishing the result.",
        "Anything commercial, whether or not the picture is credited."
      ]
    },
    {
      heading: "How to license a photograph",
      body: [
        "Get in touch through the booking page and say which frame you mean — the album it is in, and which picture — along with where it would appear, for how long, and in what size or territory if that matters.",
        "Terms and a fee are agreed in writing before the picture is used. What a licence costs depends on the use, so there is no rate card here; a single editorial frame and a national campaign are not the same thing and pretending otherwise would waste your time.",
        "Where a licence is granted, the credit is nerdyphotographer.in unless something else is agreed in writing."
      ]
    },
    {
      heading: "If you have shot with me",
      body: [
        "This page is not your answer. What a model, an agency or a brand may do with the pictures from their own shoot is set by the agreement made for that shoot, which is a different thing from licensing a photograph out of this portfolio.",
        "Those terms are on the booking page, in full, in the version that applied on the day — read them there rather than here, so there is only ever one copy of them."
      ]
    },
    {
      heading: "People in the photographs",
      body: [
        "Many of these frames are of models and other collaborators. Being able to license a photograph from the studio is not the same as being free to imply that the person in it endorses a product, and a commercial use involving a recognisable person may need their agreement as well as the studio's. Say what the use is when you ask, and it can be sorted out properly."
      ]
    }
  ]
};

export default LICENCE;
