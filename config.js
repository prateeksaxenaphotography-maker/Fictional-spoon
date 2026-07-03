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
  behance: "https://behance.net/thenerdyphotographer",
  linkedin: "https://linkedin.com/in/thenerdyphotographer",

  // Categories & Taxonomies
  // These drive the navigation, filtering, and upload options
  activities: ["Portrait", "Street", "Landscape", "Fashion", "Minimalist", "Travel", "Sports", "Fitness"],
  types: ["Editorial", "Fine Art", "Commercial", "Documentary", "Campaign", "Test Shoot", "E-commerce"],
  brands: ["Personal Project", "Vogue", "National Geographic", "Patagonia", "Local Cafe", "Independent Film"],

  // Custom Colors Theme (Tailor the clay-orange to your own vibe if wanted!)
  colors: {
    accent: "#d24e1a",    // Brand Accent Color
    accentHover: "#b23f12" // Hover Accent Color
  }
};

window.STUDIO_CONFIG = STUDIO_CONFIG;
