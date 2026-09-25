/* ============================================================
   Service landing pages — the words.

   .github/scripts/build-seo.mjs turns each entry into a real page at
   /services/<slug>/ every time the site deploys. Prices and sample albums are
   NOT written here: they are read from data.js at build time, so a package
   edited in the Admin Panel shows up on these pages with the next publish.

   Keep every claim true to what the studio actually does. No invented
   numbers, awards or client names — Google and clients both check.

   `emptyNote` is what a page says on the day it has no album of its own: it
   still shows recent work, because a services page with no photographs on it
   persuades nobody, but it says plainly that those frames are not commissions
   of this kind. Never let a page imply work that has not happened.

   `h1` carries NO city, by the owner's decision: the heading a person reads is
   about the work, not the geography. The city still does its job in `metaTitle`
   (the line Google prints in its results) and in the `eyebrow` above the
   heading, which reads "For models · Model portfolio shoots · Noida · Delhi
   NCR". Keep it that way — a city dropped from the title as well would cost the
   only searches this site can realistically win.

   Every page says WHO IT IS FOR in `audience`, in the same words a visitor
   would use about themselves. Every page answers that one question, so a
   fitness model knows at a glance whether she is on the right page — naming two
   pages after the client and two after the kind of photograph left her guessing.

   `albumFilter` decides what a page shows, and so whether it exists at all.
   There are two kinds of page:
     look     a kind of photograph (config.js `looks`). The page is a grid of
              every photo of that kind, from every album: a photo tagged with
              the look in Upload, or an untagged photo in an album whose
              Activity belongs to it. One shoot day's fitness look lands here
              even when the rest of the album is fashion.
     clients  who the album was made for (config.js `clients`). The page shows
              album cards, each saying who it was shot for. An album that has
              never been given a client falls back to the older rules kept
              beside it: `modelWork` (one model, nobody paying), `clientWork`
              (a client is named) and `types`.

   A slug is a public address. Changing one breaks links that Google and
   clients already hold, so add a new page rather than renaming an old one.
   app.js lists the same slugs in SERVICE_LINKS (home page cards and menu);
   the build fails if the two disagree.

   A question in `faqs` is [question, answer], or [question, answer, points]
   when the answer is a list: the points are printed as a numbered list under
   the answer.
   ============================================================ */

// Asked on the model portfolio and fitness & sports pages only, by the owner's
// decision: test shoots are offered to models and athletes. These are the
// studio's own reasons for agreeing to one.
const TEST_SHOOT_FAQ = [
  "When does a test shoot (or collaboration) make sense?",
  "A test shoot has no shoot fee (if it uses the home studio, the room is charged, and shown in your quote), so it has to be worth everyone's time. It assumes you can already direct yourself in front of a camera — needing to be taught is what makes a shoot a booking rather than a collaboration. On top of that, it makes sense when you bring at least one of these:",
  [
    "A designer outfit, or a garment you designed, that lifts the look of the pictures for the photographer and everyone else on the team.",
    "Creative hair or make-up — a look the model and the photographer will both enjoy shooting.",
    "A following large enough that the post brings new followers to everyone who worked on the shoot.",
    "Contacts who can bring paid work to the team."
  ]
];

export const SERVICES_INDEX = {
  // Google shows about 60 characters. The old title was 118, so it was cut
  // before "Noida" ever appeared. The description is rebuilt at deploy time
  // from the pages that actually exist (build-seo.mjs), so it cannot promise a
  // kind of shoot that has no page yet.
  metaTitle: "What I Shoot — Model Portfolio & Fashion Photography, Noida",
  metaDescription: "Model portfolio and comp card shoots, fashion, editorial, fitness and sports photography in Noida and Delhi NCR. See the work and send a brief for a quote.",
  eyebrow: "Kinds of shoot",
  h1: "What I shoot",
  intro: "nerdyphotographer.in is a photography studio in Noida working across Delhi NCR. Each kind of shoot has its own page, sorted by who it is for: what is included, and the work to judge it by."
};

export const SERVICES = [
  {
    slug: "model-portfolio-shoot-noida",
    emptyNote: "There is no model portfolio album on the site yet.",
    audience: "For models",
    audienceLead: "You are starting out, or you already work and your portfolio is out of date.",
    kicker: "Models",
    cardTitle: "Model Portfolios & Comp Cards",
    cardBlurb: "Agency-ready portfolio shoots and comp cards for new and working models, male and female.",
    metaTitle: "Model Portfolio Shoot in Noida & Delhi NCR | Comp Cards",
    metaDescription: "Model portfolio shoots in Noida and Delhi NCR: agency-ready comp cards, editorial portfolio frames and guided posing. See real portfolios and ask for a quote.",
    eyebrow: "Portfolios · Comp cards · Noida & Delhi NCR",
    h1: "Model portfolio shoots",
    intro: [
      "A modelling portfolio has one job: to get you shortlisted. Agencies and casting teams look at it for a few seconds, so every frame has to show something different about you — your face, your proportions, your range — without heavy styling or retouching getting in the way.",
      "nerdyphotographer.in shoots portfolios and comp cards for new faces and working models, male and female, from a home studio in Noida and on location across Delhi NCR. You are directed through every pose, so you do not need any experience in front of a camera."
    ],
    includesTitle: "What a portfolio shoot includes",
    includes: [
      "A plan before the shoot: the looks, outfits and references that suit the kind of work you want to be booked for.",
      "Guided posing and expression on set — clean headshots, full-length frames, profiles and movement.",
      "The frame types agencies ask for on a comp card: headshot, half-length, full-length and profile.",
      "A proofing gallery to choose from, with your selects retouched naturally — skin still looks like skin.",
      "A comp card and an online portfolio page on this site that you can send to agencies and casting calls as a link."
    ],
    packageIds: ["pkg_1", "pkg_2", "pkg_3"],
    // Albums made for a model or a model agency. An album with no client set
    // falls back to model work: a single model, nobody paying for the pictures.
    albumFilter: { clients: ["model", "agency"], modelWork: true },
    // This page carries the models' comp cards: app.js paints the Comp Cards
    // page's blocks (and its A–Z bar) into the work section, over the album
    // cards written here for crawlers. The old Comp Cards address leads here.
    compCards: true,
    // The models are on this page, so this points at them rather than at the
    // retired Model Portfolio page (whose address now redirects here anyway).
    // It is rendered twice: as the hero's second button and above the work.
    workLinks: [
      { href: "/services/model-portfolio-shoot-noida/#comp-cards", label: "See the models" }
    ],
    faqs: [
      ["How much does a model portfolio shoot cost in Noida?", "It depends on how many looks you shoot and how many finished images you need — a comp card needs fewer than a full editorial portfolio. The booking page lists the set tiers and what each one includes, so you can see the price before you send anything."],
      ["I have never modelled before. Can I still book?", "Yes. Most portfolio clients are new faces. Poses, expressions and angles are directed throughout the shoot, and the looks are planned with you beforehand."],
      ["How many outfits should I bring?", "Bring more than you expect to use — fitted basics in plain colours, one formal look and one that shows your personality. The final looks are picked together before the shoot starts."],
      ["Do you shoot male models as well?", "Yes. The portfolios on this site include both male and female models."],
      ["Where does the shoot take place?", "In the studio in Noida, or on location in Noida, Delhi and the rest of Delhi NCR, depending on the looks planned."],
      ["When can I book?", "Shoots run on weekends. The booking page shows the dates that are open."],
      ["Do you do test shoots (TFP or collaboration)?", "Occasionally, and by invitation only. A collaboration means two experienced people bringing equal value to the same shoot — a professional model, a brand or a company with something of their own to put in. If you are starting out — you want direction, a first portfolio, or you are still building a following — that is a booking rather than a collaboration, and it is quoted like any other shoot. If you have been given an invite code, enter it on the booking page."],
      TEST_SHOOT_FAQ
    ]
  },
  {
    slug: "fashion-editorial-photographer-delhi-ncr",
    emptyNote: "There is no fashion or editorial album on the site yet.",
    audience: "For magazines and editorial stories",
    audienceLead: "You have a collection, a concept or a story to place, and you need the pictures to carry it.",
    kicker: "Fashion",
    cardTitle: "Fashion & Editorial",
    cardBlurb: "Concept-led fashion, beauty and editorial stories for designers, stylists and magazine submissions.",
    metaTitle: "Fashion & Editorial Photographer, Noida & Delhi NCR",
    metaDescription: "Fashion, beauty and editorial photography in Noida and Delhi NCR: concept-led shoots for designers, stylists, models and magazines. Send a brief for a quote.",
    eyebrow: "Fashion · Beauty · Editorial · Noida & Delhi NCR",
    h1: "Fashion & editorial photography",
    intro: [
      "An editorial is a story told in a handful of frames. It starts with a concept — a mood, a character, a collection — and every decision after that, from light to styling to the edit, serves it.",
      "nerdyphotographer.in shoots fashion, beauty and editorial work in Noida and across Delhi NCR for designers, stylists, make-up artists and models building published work. Shoots are planned frame by frame and credited in full, so everyone on the team can use them."
    ],
    includesTitle: "How an editorial shoot runs",
    includes: [
      "The brief: the story, the references and where the pictures are going — a lookbook, a magazine submission, a portfolio.",
      "Direction: mood, location, casting and a shot list, agreed before the day.",
      "The shoot: studio or location, with light built for the concept rather than one setup for everything.",
      "The edit: selects, colour and sequence, so the frames read as one story.",
      "Delivery with full team credits — model, stylist, hair and make-up — ready for submission or publication."
    ],
    packageIds: ["pkg_3", "pkg_4"],
    albumFilter: { look: "fashion" },
    workLinks: [
      // The album pages, which are indexed — the filtered views are not (G11).
      { href: "/albums/", label: "See every album" }
    ],
    faqs: [
      ["Can you shoot for a magazine submission?", "Yes. Shoots are planned around the publication's requirements, and full team credits are delivered with the images."],
      ["Do you arrange the stylist and the hair and make-up artist?", "Bring your own team, or ask when you send the brief and the studio will help you put one together. Every credit is published alongside the album."],
      ["Do you shoot outside Noida?", "Yes — anywhere in Delhi NCR, and further for a planned production. Travel beyond 20 km of the studio in Sector 46, Noida is added at cost."],
      ["Do I receive the RAW files?", "Not as part of a package — you receive a proofing gallery and the retouched final images listed in it. RAW files can be bought separately; ask."],
      ["When can I book?", "Shoots run on weekends. The booking page shows the dates that are open."]
    ]
  },
  {
    slug: "fitness-sports-photographer-noida",
    emptyNote: "No fitness or sports shoot has been published here yet — this is work the studio takes on, not work it can show you yet.",
    audience: "For athletes, coaches and gyms",
    audienceLead: "You have put in the work and need pictures that show it — for a competition, a coaching profile or a gym's own marketing.",
    kicker: "Athletes",
    cardTitle: "Fitness & Sports",
    cardBlurb: "Physique, training and action photography for athletes, coaches, gyms and fitness brands.",
    metaTitle: "Fitness & Sports Photographer in Noida & Delhi NCR",
    metaDescription: "Fitness and sports photography in Noida and Delhi NCR: physique shoots, athlete portraits and action frames for coaches, gyms and brands. Send a brief.",
    eyebrow: "Fitness · Sports · Noida & Delhi NCR",
    h1: "Fitness & sports photography",
    intro: [
      "Fitness photography is about light as much as muscle. Hard, directional light is what draws definition; the wrong light flattens months of work into nothing.",
      "nerdyphotographer.in shoots physique sessions, athlete portraits and training action for competitors, coaches, gyms and fitness brands in Noida and Delhi NCR — in the studio, in your gym, or outdoors."
    ],
    includesTitle: "What a fitness shoot covers",
    includes: [
      "Physique frames lit for definition — front, back and side, relaxed and flexed.",
      "Training and action: lifts, sprints and sport-specific movement, frozen sharp.",
      "Portraits for your coaching profile, website and social media.",
      "Timing advice, so the shoot lands when you are at your peak — after a prep, before a competition.",
      "A proofing gallery to choose from, with natural retouching on your selects."
    ],
    packageIds: ["pkg_2", "pkg_3"],
    albumFilter: { look: "fitness" },
    workLinks: [
      { href: "/albums/", label: "See every album" }
    ],
    faqs: [
      ["Can you shoot in my gym?", "Yes, with the gym's permission. A quiet hour works best, so lights can be set up without getting in anyone's way."],
      ["When should I schedule a physique shoot?", "Book the date first, then plan your prep towards it. Weekend dates are shown on the booking page."],
      ["Do you shoot for gyms and fitness brands?", "Yes — trainers, facilities, apparel and supplements. Brand work is quoted as a campaign — choose “Campaign or production” on the booking page."],
      ["How are the photos delivered?", "As an online proofing gallery. You choose your selects, and those are retouched and delivered."],
      ["Do you do test shoots (TFP or collaboration)?", "Occasionally, and by invitation only. A collaboration means two experienced people bringing equal value to the same shoot — a professional model, a brand or a company with something of their own to put in. If you are starting out — you want direction, a first portfolio, or you are still building a following — that is a booking rather than a collaboration, and it is quoted like any other shoot. If you have been given an invite code, enter it on the booking page."],
      TEST_SHOOT_FAQ
    ]
  },
  {
    slug: "brand-campaign-photographer-noida",
    emptyNote: "No brand campaign has been published here yet — this is work the studio takes on, not work it can show you yet.",
    audience: "For brands",
    audienceLead: "You have a product, a season or a launch, and a team that needs usable assets on a date.",
    kicker: "Brands",
    cardTitle: "Campaigns, Lookbooks & E-commerce",
    cardBlurb: "Campaign, lookbook and e-commerce photography for fashion and lifestyle brands, with usage rights in writing.",
    metaTitle: "Brand Campaign & Lookbook Photographer, Noida & Delhi",
    metaDescription: "Campaign, lookbook and e-commerce photography for fashion, fitness and lifestyle brands in Noida and Delhi NCR, with clear usage rights. Send a brief.",
    eyebrow: "Campaigns · Lookbooks · E-commerce · Noida & Delhi NCR",
    h1: "Brand campaigns & lookbooks",
    intro: [
      "A brand shoot has to work twice: once as pictures people stop for, and once as assets your team can actually use — the right crops, the right number of frames, delivered on the date you need them.",
      "nerdyphotographer.in plans and shoots campaigns, lookbooks and e-commerce sets for fashion, fitness and lifestyle brands in Noida and Delhi NCR. Every production is covered by a written contract that spells out the deliverables, the payment milestones and the usage rights."
    ],
    includesTitle: "How a brand production runs",
    includes: [
      "A brief: what the pictures are for, where they will run and what they need to say about the brand.",
      "Pre-production: mood, casting, location, styling and a shot list signed off before the day.",
      "The shoot day, run to the shot list — hero frames first, then the variations your channels need.",
      "Retouched master images, delivered against the list agreed in the brief.",
      "A contract covering deliverables, payment milestones and usage rights, signed online before the shoot."
    ],
    packageIds: ["pkg_4", "pkg_5"],
    // Commissioned work only: albums made for a brand. Fashion albums are NOT
    // claimed here — a lookbook shown on a campaigns page reads as a campaign
    // that happened. An album with no client set falls back to its Type, or to
    // a named client.
    albumFilter: { clients: ["brand"], types: ["Campaign", "Commercial", "E-commerce"], clientWork: true },
    workLinks: [
      { href: "/categories/", label: "Browse work by category" },
      { href: "/albums/", label: "See all albums" }
    ],
    faqs: [
      ["How do we start?", "Send a brief through the booking page and choose “Campaign or production”. You will get a plan and a quote against it."],
      ["Who owns the images?", "The contract sets out usage rights in plain language — where the images can run and for how long — before anything is shot."],
      ["Can you arrange models, styling and make-up?", "Casting, styling and make-up are planned with you in pre-production, and everyone involved is credited on the final work."],
      ["Do you shoot product-only e-commerce?", "The studio's focus is on-model fashion and lifestyle photography. Product-only catalogues are taken on when they are part of a wider campaign."],
      ["How is payment structured?", "In milestones tied to the production — an advance to hold the date, with the balance split across the shoot and delivery. The exact schedule is in the contract."],
      ["Why are there no prices on this page?", "There are set tiers, and the booking page lists them — they run from a comp card up to a full-day production. Past those, no two campaigns are the same: the price follows the brief — the number of looks, the finished images you need, the crew and the usage — so you get a quote written against what you are actually asking for."]
    ]
  },
  {
    slug: "designer-stylist-makeup-artist-shoot-noida",
    emptyNote: "No shoot for a designer, stylist or make-up artist has been published here yet.",
    audience: "For designers, stylists and make-up artists",
    audienceLead: "Your work is the clothes, the styling or the face, and you need pictures that show it — not a model's portfolio with your name in the credits.",
    kicker: "Designers · Stylists · Make-up",
    cardTitle: "Designers, Stylists & Make-up Artists",
    cardBlurb: "Lookbooks, styling portfolios and make-up looks, shot for the designer, stylist or make-up artist whose work is in the frame.",
    metaTitle: "Shoots for Designers, Stylists & Make-up Artists, Noida",
    metaDescription: "Lookbook, styling and make-up portfolio shoots in Noida and Delhi NCR for designers, stylists and hair and make-up artists, credited in full. Send a brief.",
    eyebrow: "Lookbooks · Styling · Hair & make-up · Noida & Delhi NCR",
    h1: "Shoots for designers, stylists & make-up artists",
    intro: [
      "When a model books a shoot, the pictures are about the model. When a designer, a stylist or a make-up artist books one, they have to be about the work: the cut and fabric of a garment, how a look is put together, the finish of the skin. Light, framing and the edit all follow from that.",
      "nerdyphotographer.in shoots lookbooks for fashion designers, portfolio sets for stylists, and make-up and hair looks for the artists who created them, in the home studio in Noida and on location across Delhi NCR. The shoot is planned around what you need to show, and everyone who worked on it is credited."
    ],
    includesTitle: "How a shoot for your work runs",
    includes: [
      "The brief: what the pictures are for — a lookbook, a portfolio, your social media, a pitch to a client — and what has to be visible in them.",
      "Planning: the model, the looks and the order they are shot in, so hair, make-up and outfit changes fit the day.",
      "Light chosen for the work: even light that keeps a garment's true colour, or closer, softer light that shows skin and make-up.",
      "Frames of the detail as well as the whole look — full length, half length, and close-ups of fabric, styling or make-up.",
      "A proofing gallery to choose from, your selects retouched without changing the work itself, and full credits for the team."
    ],
    packageIds: ["pkg_2", "pkg_3", "pkg_4"],
    // Albums made for a fashion designer, a stylist or a hair & make-up artist.
    // No fallback rule: an album is only here once it has been given one of
    // these clients in Upload.
    albumFilter: { clients: ["designer", "stylist", "mua"] },
    workLinks: [
      { href: "/albums/", label: "See all albums" }
    ],
    faqs: [
      ["I am a make-up artist. Can I book a shoot for my own portfolio?", "Yes. The shoot is planned around your looks — how many, in what order, and how close the frames need to be to show the detail. Bring your own model, or ask for help finding one when you send the brief."],
      ["Can you shoot a lookbook for my collection?", "Yes. Send the number of pieces and where the lookbook will be used, and the shoot is planned around that: how many looks, how many frames of each, and whether it is shot in the studio or on location."],
      ["Who is credited on the pictures?", "Everyone who worked on the shoot — you, the model and the rest of the team. If the album goes on this site, the credits are published beside it."],
      ["How much does it cost?", "The booking page lists the set tiers, and most of this work fits one of them. Past that it is quoted to the brief: the price follows the number of looks, the finished images you need and where the shoot happens. Send a brief through the booking page and you will have a price written against it before anything is booked."],
      ["When can I book?", "Shoots run on weekends. The booking page shows the dates that are open."]
    ]
  },
  {
    slug: "creative-shoot-photographer-noida",
    packageIds: ["pkg_2", "pkg_3", "pkg_4"],
    emptyNote: "No creative or conceptual shoot has been published here yet.",
    audience: "For anyone with an idea",
    audienceLead: "You are not a model and not a brand. You have a picture in your head and nowhere obvious to ask for it.",
    kicker: "For anyone with an idea",
    cardTitle: "Creative & Conceptual Shoots",
    cardBlurb: "Conceptual, themed and personal shoots for artists, makers and performers — the work that fits none of the other pages.",
    metaTitle: "Creative & Conceptual Photoshoots in Noida & Delhi NCR",
    metaDescription: "Creative and conceptual photography in Noida and Delhi NCR: themed and narrative shoots, personal projects and collaborations with artists. Send a brief.",
    eyebrow: "Conceptual · Themed · Personal projects · Noida & Delhi NCR",
    h1: "Creative & conceptual shoots",
    intro: [
      "Most shoots arrive with a brief already attached: an agency wants a comp card, a magazine wants a story, a brand wants assets by a date. Some ideas have none of that behind them. You have a picture in your head — a character, a place, a thing you make — and nobody whose job it is to turn it into decisions somebody can shoot.",
      "This page is for that work. nerdyphotographer.in shoots conceptual, themed and personal projects from a home studio in Noida and on location across Delhi NCR: portraits that are not for a casting, narrative sets, and shoots made with artists and makers. The idea stays yours. Pinning it down, then lighting and shooting it, is the part done here."
    ],
    includesTitle: "How a shoot with no brief runs",
    includes: [
      "A conversation first: what the idea is, what the pictures are for, and what has to be in the frame. It ends written down, as a short brief you can correct.",
      "References gathered on both sides — pictures, a film still, a colour, a piece of music. An idea that is hard to describe is usually easy to point at.",
      "The decisions taken before the day: location, light, wardrobe, props, who else needs to be there, and the frames the shoot has to come away with.",
      "The shoot, run to that list — the planned frames first, then time for what the day turns up.",
      "The edit: a proofing gallery to choose from, your selects retouched, and colour and sequence worked so the set reads as one idea.",
      "Full credits for everyone who worked on it, published beside the album if you want the set on this site."
    ],
    // Every creative photo — tagged Creative, or in an album filed as Creative,
    // Fine Art or Documentary — and, as the catch-all, the photos of an album
    // that no other page claims.
    albumFilter: { look: "creative", residual: true },
    workLinks: [
      { href: "/albums/", label: "See the archive" }
    ],
    faqs: [
      ["I am not a model, a designer or a brand. Is this the right page?", "Probably. This page is for the work the other pages do not cover. A portfolio to send to agencies belongs on the model portfolio page, a magazine story on the fashion and editorial page, physique and training work on the fitness and sports page, anything whose job is to sell a product is quoted as a brand campaign through the booking page, and a designer's, stylist's or make-up artist's own portfolio on theirs. A concept, a theme or a personal project belongs here."],
      ["My idea is still vague. Is that enough to start with?", "Yes. Half a sentence and three reference pictures is a start. The first conversation turns that into something specific: what is in the frame, where, in what light, and what the set of pictures is for. If the idea needs more thinking before it is worth shooting, you will be told so before a date is held."],
      ["How much does a creative shoot cost?", "The booking page lists the set tiers and a smaller idea usually fits one. Past that it is quoted to the brief — one portrait idea in the studio and a two-location shoot with a team are not the same job, so the price follows what the idea needs: looks, locations, people, shooting hours and finished images. Send the idea through the booking page and you will have a price written against it before anything is booked."],
      ["Who else needs to be on the shoot?", "Whoever the idea needs, and often nobody. Bring your own stylist, hair and make-up artist or performers if you have them, or ask when you send the idea and the studio will help put a small team together. Everyone involved is credited on the finished work."],
      ["Is this a TFP or collaboration shoot?", "No. A creative shoot is quoted and booked like any other. A collaboration means two experienced people bringing equal value to the same shoot, it happens occasionally, and it is by invitation only — if you have been given an invite code, enter it on the booking page."],
      ["When can I book, and what do I get?", "Shoots run on weekends, in the home studio in Noida or on location across Delhi NCR when the idea needs a real place, and the booking page shows the dates that are open. Afterwards you get a proofing gallery to choose from and your selects retouched. RAW files aren't included (they can be bought separately), and the shoot is covered by a written contract signed online."]
    ]
  }
];
