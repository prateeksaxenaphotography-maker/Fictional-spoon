const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

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

const COMMON_DOMAIN_TYPOS = {
  "gmai.com": "gmail.com", "gamil.com": "gmail.com", "hotmial.com": "hotmail.com",
  "outlok.com": "outlook.com", "yaho.com": "yahoo.com"
};

const PRIVATE_IP_REGEX = /^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|::ffff:127\.)/;

// The request body's originUrl is client-supplied and was previously used
// as-is to build the "View & Print Comp Card" button link mailed out via the
// studio's Resend sender — a POST with originUrl: "https://evil.example"
// would have the studio's own domain send an official-looking email pointing
// at an attacker's site. Only ever build the link from a known-good origin.
const ALLOWED_DOWNLOAD_ORIGINS = new Set([
  "https://www.nerdyphotographer.in",
  "https://nerdyphotographer.in",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
function safeBaseUrl(originUrl) {
  try {
    const u = new URL(originUrl);
    const origin = `${u.protocol}//${u.host}`;
    return ALLOWED_DOWNLOAD_ORIGINS.has(origin) ? origin : "https://nerdyphotographer.in";
  } catch {
    return "https://nerdyphotographer.in";
  }
}

// Minimal in-memory rate limit: this endpoint sends real email through the
// studio's Resend account on every accepted request, with no other gate
// (the client-side form has no CAPTCHA). Without this, the endpoint is a
// ready-made way to spam arbitrary inboxes "from" the studio's domain.
// In-memory is fine here — worst case on a restart is a limiter reset, not
// a functional break, and this is a single small Render instance.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitHits = new Map(); // ip -> timestamps[]
function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateLimitHits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

// Best-effort city/region/country lookup for the visitor's IP (free, keyless
// ip-api.com tier — plain HTTP only on the free tier, fine for a server-to-server
// call). Never throws — logging analytics must not depend on this.
async function getGeoLocation(ip) {
  const empty = { city: "", region: "", country: "" };
  if (!ip || PRIVATE_IP_REGEX.test(ip)) return empty;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return empty;
    const data = await res.json();
    if (data.status !== "success") return empty;

    return {
      city: data.city || "",
      region: data.regionName || "",
      country: data.country || ""
    };
  } catch (err) {
    console.warn(`Geo-IP lookup failed for ${ip}:`, err.message);
    return empty;
  }
}

// Format + disposable/typo checks only. Real proof of ownership comes from the
// magic link click-through (checkMagicDownloadLink in app.js), not from this —
// a prior DNS MX-lookup step was tried here and reverted (commit da03ed4) because
// it produced false rejections for real visitors.
function validateEmailShape(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  if (!cleanEmail || !emailRegex.test(cleanEmail)) {
    return { valid: false, error: "Please enter a valid email address (e.g., name@example.com)." };
  }

  const domain = cleanEmail.split("@")[1];

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, error: "Temporary or disposable email addresses are not allowed." };
  }

  if (COMMON_DOMAIN_TYPOS[domain]) {
    return { valid: false, error: `Did you mean @${COMMON_DOMAIN_TYPOS[domain]}? Please check for typos.` };
  }

  return { valid: true, cleanEmail };
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
  const fromAddress = process.env.RESEND_FROM_EMAIL || "noreply@nerdyphotographer.in";

  if (!resendApiKey) {
    console.error("RESEND_API_KEY is not set — cannot send magic download email.");
    return { success: false, error: "Email service is not configured." };
  }

  try {
    const baseUrl = "https://nerdyphotographer.in";
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: `nerdyphotographer.in studio <${fromAddress}>`,
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

    if (!resendRes.ok) {
      const errorBody = await resendRes.text().catch(() => "");
      console.error(`Resend API rejected the send (${resendRes.status}):`, errorBody);
      return { success: false, error: `Resend API error ${resendRes.status}` };
    }

    return { success: true };
  } catch (err) {
    console.error("Failed to dispatch email via Resend API:", err);
    return { success: false, error: err.message };
  }
}

// POST /api/logs - validates the email shape, logs the download attempt for
// analytics, and emails a magic download link. Real proof the address is
// reachable comes from the visitor clicking that link, not from validation here.
exports.logDownload = async (req, res) => {
  const { email, modelName, shootId, orientation, originUrl } = req.body;

  // Get client IP address accurately (handling reverse proxy forwards)
  const forwarded = req.headers["x-forwarded-for"];
  const ip = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress;

  if (isRateLimited(ip || "unknown")) {
    return res.status(429).json({ error: "Too many download requests from this connection. Please try again later." });
  }

  const shapeCheck = validateEmailShape(email);
  if (!shapeCheck.valid) {
    return res.status(400).json({ error: shapeCheck.error });
  }
  const cleanEmail = shapeCheck.cleanEmail;

  if (!modelName) {
    return res.status(400).json({ error: "Model name is required." });
  }

  const baseUrl = safeBaseUrl(originUrl);
  const downloadUrl = `${baseUrl.replace(/\/$/, "")}/?downloadCompCard=1&shootId=${encodeURIComponent(shootId || "")}&orientation=${encodeURIComponent(orientation || "portrait")}`;

  const [emailResult, geo] = await Promise.all([
    sendMagicDownloadEmail(cleanEmail, modelName.trim(), downloadUrl),
    getGeoLocation(ip)
  ]);

  // Log the attempt regardless of send outcome — the id/email/ip/location is
  // what powers analytics, and we still want it even if Resend rejects the send.
  const logs = readLogs();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    modelName: modelName.trim(),
    email: cleanEmail,
    shootId: shootId || "",
    ip: ip || "unknown",
    city: geo.city,
    region: geo.region,
    country: geo.country,
    emailSent: emailResult.success,
    timestamp: new Date().toISOString()
  };
  logs.push(entry);
  writeLogs(logs);

  if (!emailResult.success) {
    return res.status(502).json({
      error: "We couldn't send the verification email right now. Please try again in a moment."
    });
  }

  return res.status(200).json({
    success: true,
    message: "Magic download link sent."
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
  const headers = ["Timestamp", "Model Name", "Email Address", "IP Address", "City", "Region", "Country", "Email Sent"];
  const csvRows = [headers.join(",")];

  // Coerces any value to a safely-quoted CSV field: `String(value ?? "")`
  // means one legacy/partial log entry (a missing field) can no longer throw
  // and break the entire download for every other entry. A leading
  // apostrophe defuses CSV formula injection — Excel/Sheets would otherwise
  // execute a cell starting with =, +, -, or @ as a formula when opened.
  const csvSafe = (value) => {
    const str = String(value ?? "");
    const defused = /^[=+\-@]/.test(str) ? `'${str}` : str;
    return `"${defused.replace(/"/g, '""')}"`;
  };

  logs.forEach(log => {
    const row = [
      csvSafe(log.timestamp),
      csvSafe(log.modelName),
      csvSafe(log.email),
      csvSafe(log.ip),
      csvSafe(log.city),
      csvSafe(log.region),
      csvSafe(log.country),
      csvSafe(log.emailSent === undefined ? "n/a" : log.emailSent)
    ];
    csvRows.push(row.join(","));
  });

  const csvContent = csvRows.join("\r\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="compcard_download_logs.csv"');
  return res.status(200).send(csvContent);
};
