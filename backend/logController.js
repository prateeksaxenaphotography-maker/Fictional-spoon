const fs = require("fs");
const crypto = require("crypto");
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

// Send magic download link to user's verified inbox
async function sendMagicDownloadEmail(email, modelName, downloadUrl) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "nerdyphotographer.in <studio@nerdyphotographer.in>",
          to: [email],
          subject: `Your Model Comp Card PDF — ${modelName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px; border: 1px solid #e2e0dc; border-radius: 12px; background: #ffffff; color: #111;">
              <h2 style="font-family: Arial, sans-serif; font-size: 22px; font-weight: 800; text-transform: uppercase; margin: 0 0 12px; color: #000; letter-spacing: -0.02em;">
                nerdyphotographer.in studio
              </h2>
              <p style="font-size: 14px; line-height: 1.6; color: #333;">
                Hi there,<br/><br/>
                Thank you for requesting the official Model Comp Card for <strong>${modelName}</strong>. Click the link below to open and print your 1-page PDF:
              </p>
              <div style="text-align: center; margin: 28px 0;">
                <a href="${downloadUrl}" style="background: #000; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; display: inline-block;">
                  Open &amp; Print Comp Card (PDF) ↗
                </a>
              </div>
              <p style="font-size: 12px; color: #666; line-height: 1.5;">
                Or copy and paste this link into your browser:<br/>
                <a href="${downloadUrl}" style="color: #d24e1a; word-break: break-all;">${downloadUrl}</a>
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="font-size: 10.5px; color: #888; margin: 0; line-height: 1.4;">
                All photographs &amp; comp cards are official creative works of nerdyphotographer.in studio Noida &amp; Delhi NCR.
              </p>
            </div>
          `
        })
      });
      return await response.json();
    } catch (err) {
      console.error("Failed to dispatch email via Resend API:", err);
    }
  } else {
    console.log(`[DEV MODE] Magic link created for ${email}: ${downloadUrl}`);
  }
}

// POST /api/logs - Log download request & dispatch magic email link
exports.logDownload = async (req, res) => {
  const { email, modelName, shootId, orientation, originUrl } = req.body;
  
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

  const baseUrl = originUrl || "https://nerdyphotographer.in";
  const downloadToken = crypto.randomBytes(16).toString("hex");
  const downloadUrl = `${baseUrl.replace(/\/$/, "")}/?downloadCompCard=1&shootId=${encodeURIComponent(shootId || "")}&orientation=${encodeURIComponent(orientation || "portrait")}&token=${downloadToken}`;

  const logs = readLogs();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    modelName: modelName.trim(),
    email: email.trim(),
    shootId: shootId || "",
    token: downloadToken,
    ip: ip || "unknown",
    timestamp: new Date().toISOString()
  };

  logs.push(entry);
  writeLogs(logs);

  // Dispatch magic email download link
  await sendMagicDownloadEmail(email.trim(), modelName.trim(), downloadUrl);

  return res.status(200).json({
    success: true,
    message: "Magic download link sent to email.",
    downloadUrl: downloadUrl
  });
};

// GET /api/logs/download - Export download logs to CSV (Admin Only)
exports.downloadCSV = (req, res) => {
  const { passcode } = req.query;

  // Compare the SHA-256 hash of the supplied passcode — no plaintext
  // passcode lives in the source. Must match adminPasscodeHash in config.js.
  const ADMIN_PASSCODE_HASH = "2e55b636fd71c28ad7c20658421a20086eb22a6ecb9c065c6b1c9c6ecc05b6c5";
  const suppliedHash = passcode
    ? crypto.createHash("sha256").update(String(passcode)).digest("hex")
    : "";
  if (suppliedHash !== ADMIN_PASSCODE_HASH) {
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
