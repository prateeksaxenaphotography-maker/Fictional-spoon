/* ============================================================
   Personal PhotoStudio Configuration
   Customize your studio's name, email, socials, categories, and settings here.
   ============================================================ */
const STUDIO_CONFIG = {
  // Brand & Naming
  studioName: "nerdyphotographer.in",
  studioShortName: "NERDY",
  studioSubName: "PHOTOGRAPHER.IN",
  tagline: "Cinematic photography, visual stories, and fine art prints.",
  introQuote: "“The best photography doesn't just record a moment. It captures the light, the mood, and the silent story within the frame.”",

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
  activities: ["Beauty", "Editorial", "Fashion", "Fitness", "Portrait", "Sports"],
  types: ["Campaign", "Commercial", "Documentary", "E-commerce", "Editorial", "Fine Art", "Test Shoot"],
  brands: ["Personal Project", "Vogue", "National Geographic", "Patagonia", "Local Cafe", "Independent Film"],
  // Admin passcode is stored ONLY as a SHA-256 hash (the site is public
  // source — a readable passcode here could be seen by anyone). To change
  // it, put the SHA-256 hex of your new passcode below.
  adminPasscodeHash: "2e55b636fd71c28ad7c20658421a20086eb22a6ecb9c065c6b1c9c6ecc05b6c5",

  // Custom Colors Theme (Tailor the clay-orange to your own vibe if wanted!)
  colors: {
    accent: "#d24e1a",    // Brand Accent Color
    accentHover: "#b23f12" // Hover Accent Color
  }
};

window.STUDIO_CONFIG = STUDIO_CONFIG;
