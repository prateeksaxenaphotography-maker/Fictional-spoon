/* ============================================================
   Service landing pages — the words.

   .github/scripts/build-seo.mjs turns each entry into a real page at
   /services/<slug>/ every time the site deploys. Prices and sample albums are
   NOT written here: they are read from data.js at build time, so a package
   edited in the Admin Panel shows up on these pages with the next publish.

   Keep every claim true to what the studio actually does. No invented
   numbers, awards or client names — Google and clients both check.

   Every page says WHO IT IS FOR in `audience`, in the same words a visitor
   would use about themselves. All four answer that one question, so a fitness
   model knows at a glance whether she is on the right page — naming two pages
   after the client and two after the kind of photograph left her guessing.

   A slug is a public address. Changing one breaks links that Google and
   clients already hold, so add a new page rather than renaming an old one.
   app.js lists the same slugs in SERVICE_LINKS (home page cards and menu);
   the build fails if the two disagree.
   ============================================================ */

export const SERVICES_INDEX = {
  metaTitle: "What I Shoot — Model Portfolios, Fashion, Fitness & Brand Photography in Noida & Delhi NCR | nerdyphotographer.in",
  metaDescription: "Model portfolio and comp card shoots, fashion and editorial photography, fitness and sports shoots, and brand campaigns in Noida and Delhi NCR. See sample work and send a brief for a quote.",
  eyebrow: "Four kinds of shoot",
  h1: "What I shoot",
  intro: "nerdyphotographer.in is a photography studio in Noida working across Delhi NCR. Four kinds of shoot, sorted by who they are for: what is included, what it costs, and the work to judge it by."
};

export const SERVICES = [
  {
    slug: "model-portfolio-shoot-noida",
    audience: "For models",
    audienceLead: "You are starting out, or you already work and your portfolio is out of date.",
    kicker: "Models",
    cardTitle: "Model Portfolios & Comp Cards",
    cardBlurb: "Agency-ready portfolio shoots and comp cards for new and working models, male and female.",
    metaTitle: "Model Portfolio Shoot in Noida & Delhi NCR — Comp Cards & Portfolios | nerdyphotographer.in",
    metaDescription: "Model portfolio photoshoots in Noida and Delhi NCR for male and female models: agency-ready comp cards, editorial-grade portfolio frames and guided posing. See real portfolios, what a shoot includes, and send a brief for a quote.",
    eyebrow: "Model portfolio shoots · Noida · Delhi NCR",
    h1: "Model portfolio shoot in Noida",
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
    // Model work: a single model, shot for the model rather than for a client.
    albumFilter: { modelWork: true },
    workLinks: [
      { href: "/categories/?kind=type&val=Model%20Portfolio", label: "See model portfolios" },
      { href: "/categories/?kind=type&val=Comp%20Cards", label: "See comp cards" }
    ],
    faqs: [
      ["How much does a model portfolio shoot cost in Noida?", "It depends on how many looks you shoot and how many finished images you need — a comp card needs fewer than a full editorial portfolio. Send a brief through the booking page and you will have a price against it before anything is booked."],
      ["I have never modelled before. Can I still book?", "Yes. Most portfolio clients are new faces. Poses, expressions and angles are directed throughout the shoot, and the looks are planned with you beforehand."],
      ["How many outfits should I bring?", "Bring more than you expect to use — fitted basics in plain colours, one formal look and one that shows your personality. The final looks are picked together before the shoot starts."],
      ["Do you shoot male models as well?", "Yes. The portfolios on this site include both male and female models."],
      ["Where does the shoot take place?", "In the studio in Noida, or on location in Noida, Delhi and the rest of Delhi NCR, depending on the looks planned."],
      ["When can I book?", "Shoots run on weekends. The booking page shows the dates that are open."],
      ["Do you offer TFP or collaboration shoots?", "Occasionally, and by invitation only. If you have been given an invite code, enter it on the booking page."]
    ]
  },
  {
    slug: "fashion-editorial-photographer-delhi-ncr",
    audience: "For designers, stylists and magazines",
    audienceLead: "You have a collection, a concept or a story to place, and you need the pictures to carry it.",
    kicker: "Fashion",
    cardTitle: "Fashion & Editorial",
    cardBlurb: "Concept-led fashion, beauty and editorial stories for designers, stylists and magazine submissions.",
    metaTitle: "Fashion & Editorial Photographer in Delhi NCR & Noida | nerdyphotographer.in",
    metaDescription: "Fashion, beauty and editorial photography in Noida and Delhi NCR — concept-led shoots for designers, stylists, models and magazine submissions. See recent editorials, what a shoot includes, and send a brief for a quote.",
    eyebrow: "Fashion · Beauty · Editorial",
    h1: "Fashion & editorial photographer in Delhi NCR",
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
    albumFilter: { activities: ["Fashion", "Editorial", "Beauty"] },
    workLinks: [
      { href: "/categories/?kind=activity&val=Fashion", label: "See fashion work" },
      { href: "/categories/?kind=activity&val=Editorial", label: "See editorial work" }
    ],
    faqs: [
      ["Can you shoot for a magazine submission?", "Yes. Shoots are planned around the publication's requirements, and full team credits are delivered with the images."],
      ["Do you arrange the stylist and the hair and make-up artist?", "Bring your own team, or ask when you send the brief and the studio will help you put one together. Every credit is published alongside the album."],
      ["Do you shoot outside Noida?", "Yes — across Delhi NCR as standard, and further for a planned production."],
      ["Do I receive the RAW files?", "No. You receive a proofing gallery and the retouched final images listed in your package."],
      ["When can I book?", "Shoots run on weekends. The booking page shows the dates that are open."]
    ]
  },
  {
    slug: "fitness-sports-photographer-noida",
    audience: "For athletes, coaches and gyms",
    audienceLead: "You have put in the work and need pictures that show it — for a competition, a coaching profile or a gym's own marketing.",
    kicker: "Athletes",
    cardTitle: "Fitness & Sports",
    cardBlurb: "Physique, training and action photography for athletes, coaches, gyms and fitness brands.",
    metaTitle: "Fitness & Sports Photographer in Noida & Delhi NCR | nerdyphotographer.in",
    metaDescription: "Fitness and sports photography in Noida and Delhi NCR — physique shoots, athlete portraits and action frames for coaches, competitors, gyms and fitness brands. See what a shoot includes and send a brief for a quote.",
    eyebrow: "Fitness · Sports · Athletes",
    h1: "Fitness & sports photographer in Noida",
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
    albumFilter: { activities: ["Fitness", "Sports"] },
    workLinks: [
      { href: "/categories/?kind=activity&val=Fitness", label: "See fitness work" },
      { href: "/categories/?kind=activity&val=Sports", label: "See sports work" }
    ],
    faqs: [
      ["Can you shoot in my gym?", "Yes, with the gym's permission. A quiet hour works best, so lights can be set up without getting in anyone's way."],
      ["When should I schedule a physique shoot?", "Book the date first, then plan your prep towards it. Weekend dates are shown on the booking page."],
      ["Do you shoot for gyms and fitness brands?", "Yes — trainers, facilities, apparel and supplements. Brand work is quoted as a campaign; see the brand campaigns page."],
      ["How are the photos delivered?", "As an online proofing gallery. You choose your selects, and those are retouched and delivered."]
    ]
  },
  {
    slug: "brand-campaign-photographer-noida",
    audience: "For brands",
    audienceLead: "You have a product, a season or a launch, and a team that needs usable assets on a date.",
    kicker: "Brands",
    cardTitle: "Campaigns, Lookbooks & E-commerce",
    cardBlurb: "Campaign, lookbook and e-commerce photography for fashion and lifestyle brands, with usage rights in writing.",
    metaTitle: "Brand Campaign, Lookbook & E-commerce Photographer in Noida & Delhi NCR | nerdyphotographer.in",
    metaDescription: "Campaign, lookbook and e-commerce photography for fashion, fitness and lifestyle brands in Noida and Delhi NCR. Planned productions, clear usage rights and a written contract. Send a brief for a quote.",
    eyebrow: "Campaigns · Lookbooks · E-commerce",
    h1: "Brand campaign & lookbook photographer in Noida",
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
    // Commissioned work first, then fashion and editorial: a lookbook is fashion
    // photography, so that work is the right evidence for a brand to judge.
    // Fitness stays strict by contrast — a gym owner shown an editorial learns
    // nothing about whether this studio can light a physique.
    albumFilter: { types: ["Campaign", "Commercial", "E-commerce"], clientWork: true, activities: ["Fashion", "Editorial"] },
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
      ["Why are there no prices on this page?", "Because no two productions are the same. The price follows the brief — the number of looks, the finished images you need, the crew and the usage — so you get a quote written against what you are actually asking for, rather than a rate card you have to work around."]
    ]
  }
];
