require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const logController = require("./backend/logController");
const viewController = require("./backend/viewController");

const app = express();
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = [
  "https://www.nerdyphotographer.in",
  "https://nerdyphotographer.in",
  "http://localhost:3000",
  "http://localhost:8000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8000"
];

// Enable CORS (restricted to the real site + local dev) and JSON parsing
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  }
}));
app.use(express.json());

// Health check — for uptime monitors and Render health checks. Pinging this
// every few minutes also keeps the free-tier instance from spinning down.
app.get("/healthz", (req, res) => {
  res.status(200).json({ ok: true, uptime: Math.round(process.uptime()) });
});

// API Routes. (/api/logs keeps its historic name for deployed-frontend
// compatibility, but it only sends the magic download email now — the
// download-log store and its CSV export were removed by owner decision.)
app.post("/api/logs", logController.logDownload);
app.post("/api/views", viewController.logView);
app.get("/api/views/summary", viewController.getViewsSummary);

// Serve static project files
app.use(express.static(__dirname));

// Fallback all SPA routing to index.html or directory index files
app.get("*", (req, res) => {
  // Check if directory matches a specific subpage index. Exact match or a
  // following "/" only — plain startsWith would also match "/booking-x" or
  // "/studios" against "/book"/"/studio" and serve that page's SEO meta
  // tags for an unrelated route.
  const paths = ["/albums", "/book", "/calendar", "/analytics", "/categories", "/studio", "/upload", "/testimonials"];
  const matchedPath = paths.find(p => req.path === p || req.path.startsWith(p + "/"));
  // Only routes that ship their own index.html (SEO meta per page) get it;
  // the rest — /calendar and /analytics have no directory — fall back to the
  // SPA shell like static hosting does via 404.html, instead of sendFile
  // throwing on the missing file and the route answering 500.
  if (matchedPath && fs.existsSync(path.join(__dirname, matchedPath, "index.html"))) {
    return res.sendFile(path.join(__dirname, matchedPath, "index.html"));
  }
  return res.sendFile(path.join(__dirname, "index.html"));
});

// Error middleware: anything a route or middleware throws (including the CORS
// rejection above and malformed JSON bodies) lands here as a clean 4xx/5xx
// response instead of an unhandled throw.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Origin not allowed." });
  }
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
  console.error("Unhandled route error:", err);
  return res.status(500).json({ error: "Internal server error." });
});

// Last-resort crash guards: without these, one stray rejected promise or
// thrown callback anywhere kills the whole process (and on Render free tier
// that reads as the site "crashing" until the next cold start). Log loudly
// and keep serving — every request path above already fails soft.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

app.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(` WPS portfolio backend server running on http://localhost:${PORT}`);
  console.log(` Serve static project files: Active`);
  console.log(` logs controller location: backend/logController.js`);
  console.log(`============================================================`);
});
