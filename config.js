/* ============================================================
   Personal PhotoStudio Configuration
   Customize your studio's name, email, socials, categories, and settings here.
   ============================================================ */
const STUDIO_CONFIG = {
  // Brand & Naming
  studioName: "thenerdyphotographer.in",
  studioShortName: "THENERDY",
  studioSubName: "PHOTOGRAPHER.IN",
  tagline: "Cinematic photography, visual stories, and fine art prints.",
  introQuote: "“The best photography doesn't just record a moment. It captures the light, the mood, and the silent story within the frame.”",

  // Contact & Socials
  email: "prateeksaxenaphotography@gmail.com",
  instagram: "https://www.instagram.com/thenerdyphotographer.in/",
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
  adminPasscode: "canonr5markii",

  // Custom Colors Theme (Tailor the clay-orange to your own vibe if wanted!)
  colors: {
    accent: "#d24e1a",    // Brand Accent Color
    accentHover: "#b23f12" // Hover Accent Color
  }
};

window.STUDIO_CONFIG = STUDIO_CONFIG;
