const fs = require("fs");
const path = require("path");
const { verifyPasscode } = require("./adminAuth");

const VIEWS_FILE = path.join(__dirname, "views.json");

// Content-engagement analytics — deliberately narrow scope. Live traffic,
// referrers, and session-level analytics are already covered by Cloudflare
// and Google Analytics; this only answers the one question those can't
// without a lot of custom event setup: which photo categories and which
// specific shoots get looked at, so the studio knows what kind of shoot to
// do more of. One record per lightbox open (not per next/prev navigation
// within it), no visitor identity captured at all.

function readViews() {
  try {
    if (!fs.existsSync(VIEWS_FILE)) {
      fs.writeFileSync(VIEWS_FILE, JSON.stringify([]));
    }
    const data = fs.readFileSync(VIEWS_FILE, "utf8");
    return JSON.parse(data || "[]");
  } catch (err) {
    console.error("Error reading views file:", err);
    return [];
  }
}

function writeViews(views) {
  try {
    fs.writeFileSync(VIEWS_FILE, JSON.stringify(views, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing views file:", err);
  }
}

// Simple in-memory rate limit — this is a public, unauthenticated,
// write-to-disk endpoint. Generous relative to the email-sending endpoint's
// limit (this just appends a small record, doesn't cost money or send mail),
// but still bounded so it can't be used to unboundedly grow views.json.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 300;
const rateLimitHits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateLimitHits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

const MAX_FIELD_LEN = 200;
const clean = (v) => String(v || "").trim().slice(0, MAX_FIELD_LEN);

// POST /api/views — fire-and-forget from the client whenever a shoot's
// lightbox is opened. No email, no visitor identity; just enough to
// aggregate "what kind of photos get looked at."
exports.logView = (req, res) => {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress;

  if (isRateLimited(ip || "unknown")) {
    return res.status(429).json({ error: "Too many requests." });
  }

  const { shootId, activity, type, talent, title } = req.body || {};
  if (!shootId) return res.status(400).json({ error: "shootId is required." });

  const views = readViews();
  views.push({
    shootId: clean(shootId),
    activity: clean(activity) || "Uncategorized",
    type: clean(type),
    talent: clean(talent),
    title: clean(title),
    timestamp: new Date().toISOString(),
  });
  writeViews(views);

  return res.status(200).json({ success: true });
};

// GET /api/views/summary?passcode=... — aggregated counts only (Admin Only).
// Grouped by category/activity (the "what kind of shoot to do more of"
// signal) and by individual shoot (a top-shoots leaderboard).
exports.getViewsSummary = (req, res) => {
  const { passcode } = req.query;
  if (!verifyPasscode(passcode)) {
    return res.status(401).json({ error: "Unauthorized access - invalid passcode." });
  }

  const views = readViews();

  const byCategory = new Map();
  const byShoot = new Map();
  for (const v of views) {
    const cat = v.activity || "Uncategorized";
    byCategory.set(cat, (byCategory.get(cat) || 0) + 1);

    const key = v.shootId || "unknown";
    const label = v.talent || v.title || "Untitled";
    const existing = byShoot.get(key);
    if (existing) existing.count++;
    else byShoot.set(key, { shootId: key, label, count: 1 });
  }

  const categories = [...byCategory.entries()]
    .map(([activity, count]) => ({ activity, count }))
    .sort((a, b) => b.count - a.count);

  const topShoots = [...byShoot.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return res.status(200).json({
    totalViews: views.length,
    categories,
    topShoots,
  });
};
