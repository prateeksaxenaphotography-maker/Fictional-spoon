/* ============================================================
   Wolverine PhotoStudio — data model + demo content
   A "shoot" is the unit: metadata (categories, credits, links,
   testimonial) + an array of photos. Demo shoots seed a full,
   gorgeous site on first visit; real uploads (IndexedDB) replace
   them the moment the user publishes their first shoot.
   ============================================================ */
(() => {
  "use strict";

  const cfg = window.STUDIO_CONFIG || {
    activities: ["Portrait", "Street", "Landscape", "Fashion", "Minimalist", "Travel"],
    types: ["Editorial", "Fine Art", "Commercial", "Documentary", "Campaign"],
    brands: ["Personal Project", "Vogue", "National Geographic", "Patagonia", "Local Cafe", "Independent Film"]
  };

  const ACTIVITIES = cfg.activities;
  const TYPES = cfg.types;
  const BRANDS = cfg.brands;

  /* ---------- Procedural "photo" generator (SVG gradient stills) ---------- */
  function still(palette, w, ratio, brand, idx) {
    const [c1, c2] = palette;
    const h = Math.round(w * ratio);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
      <defs>
        <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient>
        <radialGradient id='v' cx='0.5' cy='0.32' r='0.95'><stop offset='0' stop-color='rgba(255,255,255,0.16)'/><stop offset='1' stop-color='rgba(0,0,0,0)'/></radialGradient>
      </defs>
      <rect width='${w}' height='${h}' fill='url(#g)'/>
      <rect width='${w}' height='${h}' fill='url(#v)'/>
      <circle cx='${w * 0.72}' cy='${h * 0.26}' r='${w * 0.045}' fill='rgba(255,255,255,0.10)'/>
      <text x='40' y='${h - 46}' font-family='Archivo, sans-serif' font-weight='800' font-size='${Math.round(w*0.045)}' fill='rgba(255,255,255,0.92)'>${brand}</text>
      <text x='40' y='${h - 74}' font-family='Archivo, sans-serif' font-weight='700' font-size='${Math.round(w*0.019)}' letter-spacing='3' fill='rgba(255,255,255,0.5)'>FRAME · 0${(idx % 9) + 1}</text>
    </svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  function photosFor(shoot, count) {
    const ratios = [1.28, 0.82, 1.0, 1.34, 0.9];
    return Array.from({ length: count }, (_, i) => ({
      id: `${shoot.id}-p${i}`,
      dataUrl: still(shoot.palette, 800, ratios[i % ratios.length], shoot.brand, i),
    }));
  }

  const RAW = [
    { id: "s1", brand: BRANDS[0 % BRANDS.length], title: `${BRANDS[0 % BRANDS.length]} — Series I`, activity: ACTIVITIES[0 % ACTIVITIES.length], type: TYPES[0 % TYPES.length], season: "Spring 2026",
      photographer: "A. Reyes", artDirector: "M. Vance", stylist: "L. Cho", talent: "The North Collective", location: "Cascade Range, WA",
      description: "A campaign chasing first light on the ridgeline — grit, breath, and the trail underfoot.", client: BRANDS[0 % BRANDS.length], date: "Mar 2026",
      instagram: "@merrell", palette: ["#2f6b4f", "#163726"], featured: true,
      testimonial: { quote: "They didn't just shoot the product — they shot the feeling of the mountain.", by: `Brand Lead, ${BRANDS[0 % BRANDS.length]}` } },
    { id: "s2", brand: BRANDS[1 % BRANDS.length], title: `${BRANDS[1 % BRANDS.length]} Studies`, activity: ACTIVITIES[1 % ACTIVITIES.length], type: TYPES[1 % TYPES.length], season: "Summer 2026",
      photographer: "K. Osei", artDirector: "R. Blake", stylist: "—", talent: "City Track Club", location: "Studio 3, Brooklyn",
      description: "High-shutter product studies built for motion.", client: BRANDS[1 % BRANDS.length], date: "Jun 2026",
      instagram: "@saucony", palette: ["#d24e1a", "#7a2a0d"], featured: true,
      testimonial: { quote: "The sharpest work we've run in years.", by: `Creative Dir., ${BRANDS[1 % BRANDS.length]}` } },
    { id: "s3", brand: BRANDS[2 % BRANDS.length], title: `${BRANDS[2 % BRANDS.length]} Editorial`, activity: ACTIVITIES[2 % ACTIVITIES.length], type: TYPES[2 % TYPES.length], season: "Summer 2026",
      photographer: "M. Vance", artDirector: "A. Reyes", stylist: "L. Cho", talent: "Harbor cast", location: "Newport, RI",
      description: "Salt, rope, and golden hour — an editorial love letter to the coast.", client: BRANDS[2 % BRANDS.length], date: "Jul 2026",
      instagram: "@sperry", palette: ["#274b6d", "#0f2437"], featured: true,
      testimonial: null },
    { id: "s4", brand: BRANDS[3 % BRANDS.length], title: `${BRANDS[3 % BRANDS.length]} Movement`, activity: ACTIVITIES[3 % ACTIVITIES.length], type: TYPES[3 % TYPES.length], season: "Spring 2026",
      photographer: "L. Cho", artDirector: "M. Vance", stylist: "K. Osei", talent: "Movement collective", location: "Studio 1, London",
      description: "Power, breath, and control — movement captured clean on seamless.", client: BRANDS[3 % BRANDS.length], date: "Apr 2026",
      instagram: "@sweatybetty", palette: ["#b23f12", "#d24e1a"], featured: false,
      testimonial: { quote: "Every frame felt intentional.", by: `Head of Brand, ${BRANDS[3 % BRANDS.length]}` } },
    { id: "s5", brand: BRANDS[4 % BRANDS.length], title: `${BRANDS[4 % BRANDS.length]} Canyon`, activity: ACTIVITIES[4 % ACTIVITIES.length], type: TYPES[4 % TYPES.length], season: "Fall 2026",
      photographer: "A. Reyes", artDirector: "R. Blake", stylist: "—", talent: "Field crew", location: "Moab, UT",
      description: "Dust, straps, and river crossings — a day in the canyon.", client: BRANDS[4 % BRANDS.length], date: "Sep 2026",
      instagram: "@chaco", palette: ["#8a5a2b", "#3a2510"], featured: false, testimonial: null },
    { id: "s6", brand: BRANDS[5 % BRANDS.length], title: `Built to Last — ${BRANDS[5 % BRANDS.length]}`, activity: ACTIVITIES[5 % ACTIVITIES.length], type: TYPES[0 % TYPES.length], season: "Fall 2026",
      photographer: "R. Blake", artDirector: "A. Reyes", stylist: "L. Cho", talent: "Trades cast", location: "Detroit, MI",
      description: "Hands, leather, and honest work — the workwear campaign, unvarnished.", client: BRANDS[5 % BRANDS.length], date: "Oct 2026",
      instagram: "@wolverine", palette: ["#3a3a3a", "#0d0d0d"], featured: true,
      testimonial: { quote: "This is exactly who we are.", by: `VP Marketing, ${BRANDS[5 % BRANDS.length]}` } },
    { id: "s7", brand: BRANDS[0 % BRANDS.length], title: `${BRANDS[0 % BRANDS.length]} Neutrals`, activity: ACTIVITIES[1 % ACTIVITIES.length], type: TYPES[1 % TYPES.length], season: "Spring 2026",
      photographer: "L. Cho", artDirector: "M. Vance", stylist: "K. Osei", talent: "—", location: "Studio 2, Rockford",
      description: "Soft neutrals, soft light — an easy weekend product story.", client: BRANDS[0 % BRANDS.length], date: "Feb 2026",
      instagram: "@hushpuppies", palette: ["#9a8f7d", "#4a4238"], featured: false, testimonial: null },
    { id: "s8", brand: BRANDS[1 % BRANDS.length], title: `${BRANDS[1 % BRANDS.length]} — Low Light`, activity: ACTIVITIES[2 % ACTIVITIES.length], type: TYPES[2 % TYPES.length], season: "Winter 2026",
      photographer: "R. Blake", artDirector: "A. Reyes", stylist: "—", talent: "Service cast", location: "Studio 3, Brooklyn",
      description: "Discipline in shadow — low-key portraits for the tactical line.", client: BRANDS[1 % BRANDS.length], date: "Jan 2026",
      instagram: "@batesfootwear", palette: ["#20262b", "#0a0d0f"], featured: false, testimonial: null },
    { id: "s9", brand: BRANDS[2 % BRANDS.length], title: `${BRANDS[2 % BRANDS.length]} Portraits`, activity: ACTIVITIES[3 % ACTIVITIES.length], type: TYPES[3 % TYPES.length], season: "Summer 2026",
      photographer: "K. Osei", artDirector: "R. Blake", stylist: "L. Cho", talent: "City Track Club", location: "Queens, NY",
      description: "Faces of the club — portraits between intervals.", client: BRANDS[2 % BRANDS.length], date: "Jun 2026",
      instagram: "@saucony", palette: ["#d24e1a", "#b23f12"], featured: false, testimonial: null },
    { id: "s10", brand: BRANDS[3 % BRANDS.length], title: `${BRANDS[3 % BRANDS.length]} Golden Hour`, activity: ACTIVITIES[4 % ACTIVITIES.length], type: TYPES[4 % TYPES.length], season: "Fall 2026",
      photographer: "M. Vance", artDirector: "A. Reyes", stylist: "K. Osei", talent: "Dock cast", location: "Portland, ME",
      description: "The last light on the water, and the boat shoe that belongs there.", client: BRANDS[3 % BRANDS.length], date: "Oct 2026",
      instagram: "@sperry", palette: ["#c98a3a", "#6d4416"], featured: false, testimonial: null },
  ];

  const DEMO_SHOOTS = RAW.map((s) => ({
    ...s,
    demo: true,
    photographer: s.photographer,
    photos: photosFor(s, s.featured ? 5 : 3),
    createdAt: Date.now() - RAW.indexOf(s) * 1000,
  }));

  window.WPS_DATA = { ACTIVITIES, TYPES, BRANDS, DEMO_SHOOTS };
})();
