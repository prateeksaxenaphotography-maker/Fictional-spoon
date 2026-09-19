/* ============================================================
   Personal PhotoStudio Configuration
   Customize your studio's name, email, socials, categories, and settings here.
   ============================================================ */
const STUDIO_CONFIG = {
  // Brand & Naming
  studioName: "nerdyphotographer.in",
  // The photographer behind the studio. Google has nothing to tell a brand
  // apart from nerdyphotographer.com (an established American studio) without
  // a real person attached to it, and the name appeared nowhere on the site
  // (site audit Sep 2026). It goes in the business details and the footer.
  photographerName: "Prateek Saxena",
  // The neighbourhood only — never a street or a flat number. It is what a
  // local search needs, and clients already see it on their contract.
  studioArea: "Sector 46, Noida",
  // Shoots run at weekends by design; search engines read this as opening days.
  shootDays: ["Saturday", "Sunday"],
  studioShortName: "NERDY",
  studioSubName: "PHOTOGRAPHER.IN",
  tagline: "Fashion, fitness and model portrait photography in Noida & Delhi NCR.",
  introQuote: "“The best photography doesn't just record a moment. It captures the light, the mood, and the silent story within the frame.”",

  // The Studio page (/studio) is being rethought. While this is false, visitors
  // who open it land on the home page, and it is left out of the menu, the
  // footer and the sitemap. In admin mode you still see it. Set it to true
  // when the new page is ready.
  studioPagePublic: false,

  // Homepage hero — hand-picked, not automatic. The first screen is the one
  // image that deserves to be chosen rather than whatever sorts to the top.
  // Pick a LANDSCAPE frame: this fills the full width of the screen, and a
  // portrait would have to be cropped to fit it.
  // heroFocus is the object-position: it decides which part survives when the
  // screen is a different shape to the photo. "50% 35%" keeps faces in frame
  // on tall phone screens, where the crop is most aggressive.
  // Blank on purpose: nothing in the library is composed as a cover frame.
  // Portfolio work fills the frame by design, which leaves the wordmark no
  // clear ground to sit on. Leave this empty until a frame is shot for it —
  // horizontal, subject pushed to one third, ~40% clean space on the other
  // side, 2400px+ wide. Filling it in switches the hero over; nothing else
  // needs changing.
  heroImage: "",
  heroFocus: "50% 22%",
  heroAlt: "Editorial studio portrait — model reclining, shot on white seamless in Noida",

  // Contact & Socials
  email: "prateeksaxenaphotography@gmail.com",
  instagram: "https://www.instagram.com/nerdyphotographer.in/",
  kavyar: "https://kavyar.com/uucurn46ib8f",

  // Testimonials (Client Reactions)
  // To show testimonials on the homepage, populate this array with real reviews.
  // Example: { quote: "My review...", author: "Client Name", role: "Company Role" }
  testimonials: [],

  // Categories & Taxonomies
  // These drive the navigation, filtering, and upload options
  // Activity is the GENRE — what the pictures are. It decides which "What I
  // shoot" page an album appears under, so a wrong one is a false claim, not an
  // untidy label. "Creative" is the catch-all for work that fits none of the
  // others; an album left without an activity lands there too.
  activities: ["Beauty", "Creative", "Editorial", "Fashion", "Fitness", "Portrait", "Sports", "Workshop"],
  types: ["Campaign", "Commercial", "Documentary", "E-commerce", "Editorial", "Fine Art", "Test Shoot", "Workshop Attended"],
  // One shoot day can hold several looks of different kinds: two fashion, one
  // fitness, one creative. Each photo can be tagged with the kind of work it
  // is; a photo left untagged follows the album, through the Activity (or, for
  // Creative, the Type) listed here. Fashion, Fitness and Creative each have a
  // "What I shoot" page that shows every photo of that kind. Portrait has no
  // page — it shows in its album and under Categories → Portrait.
  // The keys are stored in data.js: never rename one.
  looks: [
    { key: "fashion", label: "Fashion & Editorial", activities: ["Fashion", "Editorial", "Beauty"] },
    { key: "fitness", label: "Fitness & Sports", activities: ["Fitness", "Sports"] },
    { key: "creative", label: "Creative", activities: ["Creative"], types: ["Creative", "Fine Art", "Documentary"] },
    { key: "portrait", label: "Portrait", activities: ["Portrait"] }
  ],
  // Who an album was made for: the person who booked the shoot and uses the
  // pictures — not who is credited on it (a make-up artist is credited on most
  // shoots). An album has one main client and may also be for others, as on a
  // collaboration everyone uses. `plural` is the filter button on the shared
  // designers, stylists & make-up artists page. Keys are stored: never rename.
  clients: [
    { key: "model", label: "Model", plural: "Models" },
    { key: "agency", label: "Model agency", plural: "Agencies" },
    { key: "brand", label: "Brand", plural: "Brands" },
    { key: "designer", label: "Fashion designer", plural: "Designers" },
    { key: "stylist", label: "Stylist", plural: "Stylists" },
    { key: "mua", label: "Makeup & hair artist", plural: "Makeup & hair" }
  ],
  // Only real values. This list used to ship with Vogue, National Geographic
  // and Patagonia as demo placeholders — one stray click would have printed a
  // client the studio has never shot for, on the site and in any PDF built from
  // it. Add a brand here once it is genuinely a client, or pick "Other" in the
  // upload form and type it.
  brands: ["Personal Project"],
  // Admin passcode is stored ONLY as a SHA-256 hash (the site is public
  // source — a readable passcode here could be seen by anyone).
  //
  // This line was commented out in July 2026, which switched admin sign-in off
  // for everyone: with no hash and no plain passcode, verifyAdminPasscode()
  // returns false for whatever you type, so the prompt could never be passed.
  // Restored Sep 2026 at the owner's request, now holding the hash of the
  // passcode they asked for.
  //
  // To change it, run this in your browser's console on the site, type the new
  // passcode when asked, and paste the line it prints over the one below:
  //   crypto.subtle.digest("SHA-256", new TextEncoder().encode(prompt("New passcode")))
  //     .then(b => console.log('adminPasscodeHash: "' + [...new Uint8Array(b)]
  //       .map(x => x.toString(16).padStart(2, "0")).join("") + '",'))
  // Never put the passcode itself here, and never in a commit message.
  adminPasscodeHash: "732934c8038f3f6543681c61069d9d44bda89b55a2f45ba4e84a1dd78a530e61",

   adminPasscodeHash: "732934c8038f3f6543681c61069d9d44bda89b55a2f45ba4e84a1dd78a530e61",

  // Custom Colors Theme (Tailor the clay-orange to your own vibe if wanted!)
  colors: {
    accent: "#d24e1a",    // Brand Accent Color
    accentHover: "#b23f12" // Hover Accent Color
  }
};

window.STUDIO_CONFIG = STUDIO_CONFIG;
