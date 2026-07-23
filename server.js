require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const logController = require("./backend/logController");

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

// API Routes
app.post("/api/logs", logController.logDownload);
app.get("/api/logs/download", logController.downloadCSV);

// Serve static project files
app.use(express.static(__dirname));

// Fallback all SPA routing to index.html or directory index files
app.get("*", (req, res) => {
  // Check if directory matches a specific subpage index
  const paths = ["/albums", "/book", "/categories", "/studio", "/upload", "/testimonials"];
  const matchedPath = paths.find(p => req.path.startsWith(p));
  if (matchedPath) {
    return res.sendFile(path.join(__dirname, matchedPath, "index.html"));
  }
  return res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(` WPS portfolio backend server running on http://localhost:${PORT}`);
  console.log(` Serve static project files: Active`);
  console.log(` logs controller location: backend/logController.js`);
  console.log(`============================================================`);
});
