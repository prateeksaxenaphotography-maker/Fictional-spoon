const fs = require("fs");
const path = require("path");

const LOGS_FILE = path.join(__dirname, "logs.json");

// Helper to read logs safely
function readLogs() {
  try {
    if (!fs.existsSync(LOGS_FILE)) {
      fs.writeFileSync(LOGS_FILE, JSON.stringify([]));
    }
    const data = fs.readFileSync(LOGS_FILE, "utf8");
    return JSON.parse(data || "[]");
  } catch (err) {
    console.error("Error reading logs file:", err);
    return [];
  }
}

// Helper to write logs safely
function writeLogs(logs) {
  try {
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing logs file:", err);
  }
}

// POST /api/logs - Log a PDF download event
exports.logDownload = (req, res) => {
  const { email, modelName } = req.body;
  
  // Basic server-side email validation check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email address format." });
  }

  if (!modelName) {
    return res.status(400).json({ error: "Model name is required." });
  }

  // Get client IP address accurately (handling reverse proxy forwards)
  const forwarded = req.headers["x-forwarded-for"];
  const ip = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress;

  const logs = readLogs();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    modelName: modelName.trim(),
    email: email.trim(),
    ip: ip || "unknown",
    timestamp: new Date().toISOString()
  };

  logs.push(entry);
  writeLogs(logs);

  return res.status(200).json({ success: true, message: "Download logged successfully." });
};

// GET /api/logs/download - Export download logs to CSV (Admin Only)
exports.downloadCSV = (req, res) => {
  const { passcode } = req.query;

  // Simple secure validation of admin credentials
  if (passcode !== "canonr5markii") {
    return res.status(401).send("Unauthorized access - invalid passcode.");
  }

  const logs = readLogs();

  // Excel-compatible CSV header and rows
  const headers = ["Timestamp", "Model Name", "Email Address", "IP Address"];
  const csvRows = [headers.join(",")];

  logs.forEach(log => {
    const row = [
      `"${log.timestamp.replace(/"/g, '""')}"`,
      `"${log.modelName.replace(/"/g, '""')}"`,
      `"${log.email.replace(/"/g, '""')}"`,
      `"${log.ip.replace(/"/g, '""')}"`
    ];
    csvRows.push(row.join(","));
  });

  const csvContent = csvRows.join("\r\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="compcard_download_logs.csv"');
  return res.status(200).send(csvContent);
};
