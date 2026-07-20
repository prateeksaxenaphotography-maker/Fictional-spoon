const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const dns = require("dns");
const util = require("util");
const resolveMx = util.promisify(dns.resolveMx);

const LOGS_FILE = path.join(__dirname, "logs.json");

// Known disposable / temporary email domains list
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com", "temp-mail.org", "tempmail.com", "guerrillamail.com",
  "mailinator.com", "throwawaymail.com", "yopmail.com", "trashmail.com",
  "sharklasers.com", "dispostable.com", "getnada.com", "boun.cr",
  "inboxalias.com", "fakeinbox.com", "emailondeck.com", "crazymailing.com",
  "mohmal.com", "tempmailo.com", "byom.de", "burnermail.io", "maildrop.cc",
  "temp-mail.com", "disposablemail.com", "mytemp.email", "guerrillamail.net"
]);

// Helper to validate email format, disposable list, and real DNS MX records
async function validateRealEmail(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  if (!cleanEmail || !emailRegex.test(cleanEmail)) {
    return { valid: false, error: "Please enter a valid email address (e.g., name@example.com)." };
  }

  const parts = cleanEmail.split("@");
  if (parts.length !== 2) {
    return { valid: false, error: "Invalid email structure." };
  }

  const domain = parts[1];

  // 1. Check disposable domain blacklist
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, error: "Temporary or disposable email addresses are not allowed." };
  }

  // 2. Common domain typo checks
  const commonTypos = ["gmai.com", "gamil.com", "hotmial.com", "outlok.com", "yaho.com"];
  if (commonTypos.includes(domain)) {
    const suggested = domain.replace("gmai", "gmail").replace("gamil", "gmail").replace("hotmial", "hotmail").replace("outlok", "outlook").replace("yaho", "yahoo");
    return { valid: false, error: `Did you mean @${suggested}? Please check for typos.` };
  }

  // 3. Real-time DNS MX Lookup to verify domain has active mail servers
  try {
    const mxRecords = await resolveMx(domain);
    if (!mxRecords || !mxRecords.length) {
      return { valid: false, error: `Domain '@${domain}' does not have active mail servers.` };
    }
  } catch (err) {
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
      return { valid: false, error: `Domain '@${domain}' does not exist or cannot receive email.` };
    }
    console.warn(`DNS MX lookup warning for domain ${domain}:`, err.message);
  }

  return { valid: true };
}

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

// Send magic download link copy to user's verified inbox (Inviting Marketing Email)
async function sendMagicDownloadEmail(email, modelName, downloadUrl) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const baseUrl = "https://nerdyphotographer.in";
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "nerdyphotographer.in studio <prateeksaxenaphotography@gmail.com>",
          to: [email],
          subject: `Model Comp Card — ${modelName} · nerdyphotographer.in`,
          reply_to: "prateeksaxenaphotography@gmail.com",
          headers: {
            "X-Entity-Ref-ID": `compcard-${Date.now()}`,
            "X-Priority": "1",
            "Priority": "urgent",
            "Importance": "high"
          },
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #111; max-width: 580px; margin: 0 auto; padding: 24px 20px; background: #ffffff; border: 1px solid #e8e6e2; border-radius: 12px;">
              <div style="border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: baseline;">
                <span style="font-weight: 800; font-size: 16px; letter-spacing: -0.02em; text-transform: uppercase; color: #000;">nerdyphotographer.in studio</span>
                <span style="font-size: 11px; color: #666; font-weight: 600; text-transform: uppercase;">Noida / Delhi NCR</span>
              </div>

              <p style="margin: 0 0 16px; font-size: 15px; color: #222;">Hello,</p>
              <p style="margin: 0 0 18px; font-size: 15px; color: #333; line-height: 1.6;">
                Thank you for connecting with <strong>nerdyphotographer.in studio</strong>! We're excited to share the official Model Comp Card for <strong>${modelName}</strong> with you.
              </p>

              <div style="text-align: center; margin: 24px 0 28px;">
                <a href="${downloadUrl}" style="background-color: #000000; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                  View &amp; Print Comp Card (PDF) &rarr;
                </a>
              </div>

              <div style="background-color: #f8f7f5; border: 1px solid #e2e0dc; border-radius: 10px; padding: 20px; margin: 28px 0 20px; text-align: left;">
                <h4 style="margin: 0 0 8px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #d24e1a;">
                  📸 Ready to Book a Shoot or Test Session?
                </h4>
                <p style="margin: 0 0 14px; font-size: 13px; color: #444; line-height: 1.55;">
                  We specialize in high-impact model portfolios, commercial lookbooks, and fashion test shoots across Delhi NCR &amp; Noida. Whether you're looking to cast talent, shoot a campaign, or create a brand new portfolio, we'd love to collaborate with you!
                </p>
                <a href="${baseUrl}/book" style="background-color: #ffffff; color: #000000; border: 1.5px solid #000000; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; display: inline-block;">
                  Request a Test Shoot / Book Session &rarr;
                </a>
              </div>

              <div style="border-top: 1px solid #eee; padding-top: 18px; margin-top: 24px; font-size: 13px; color: #555;">
                <p style="margin: 0 0 6px; font-weight: 700; color: #000;">
                  📸 Instagram: <a href="https://www.instagram.com/nerdyphotographer.in/" style="color: #d24e1a; text-decoration: underline;">@nerdyphotographer.in</a>
                </p>
                <p style="margin: 0 0 6px; font-weight: 700; color: #000;">
                  📧 Email: <a href="mailto:prateeksaxenaphotography@gmail.com" style="color: #000; text-decoration: underline;">prateeksaxenaphotography@gmail.com</a>
                </p>
                <p style="margin: 0; font-weight: 700; color: #000;">
                  🌐 Website: <a href="https://nerdyphotographer.in" style="color: #d24e1a; text-decoration: underline;">www.nerdyphotographer.in</a>
                </p>
              </div>
            </div>
          `
        })
      });
    } catch (err) {
      console.error("Failed to dispatch email via Resend API:", err);
    }
  }
}

// POST /api/logs - Option 3: Real-time MX & Disposable Email Verification + Instant PDF Download
exports.logDownload = async (req, res) => {
  const { email, modelName, shootId, orientation, originUrl } = req.body;
  
  // Real-Time Option 3 Email Verification (MX Lookup + Disposable Filter)
  const verification = await validateRealEmail(email);
  if (!verification.valid) {
    return res.status(400).json({ error: verification.error });
  }

  if (!modelName) {
    return res.status(400).json({ error: "Model name is required." });
  }

  // Get client IP address accurately (handling reverse proxy forwards)
  const forwarded = req.headers["x-forwarded-for"];
  const ip = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress;

  const baseUrl = originUrl || "https://nerdyphotographer.in";
  const downloadUrl = `${baseUrl.replace(/\/$/, "")}/?downloadCompCard=1&shootId=${encodeURIComponent(shootId || "")}&orientation=${encodeURIComponent(orientation || "portrait")}`;

  const logs = readLogs();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    modelName: modelName.trim(),
    email: email.trim(),
    shootId: shootId || "",
    ip: ip || "unknown",
    timestamp: new Date().toISOString()
  };

  logs.push(entry);
  writeLogs(logs);

  // Send email copy in background
  sendMagicDownloadEmail(email.trim(), modelName.trim(), downloadUrl);

  return res.status(200).json({
    success: true,
    message: "Email verified successfully."
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
