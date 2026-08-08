// NOTE: this controller used to also persist every request to logs.json and
// expose an admin CSV export of it. That functionality was removed by owner
// decision (2026-08): Render's free-tier disk is wiped on every restart, so
// the log was silently lossy anyway. This endpoint now only validates the
// email and sends the magic download link.

// Known disposable / temporary email domains list
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com", "temp-mail.org", "tempmail.com", "guerrillamail.com",
  "mailinator.com", "throwawaymail.com", "yopmail.com", "trashmail.com",
  "sharklasers.com", "dispostable.com", "getnada.com", "boun.cr",
  "inboxalias.com", "fakeinbox.com", "emailondeck.com", "crazymailing.com",
  "mohmal.com", "tempmailo.com", "byom.de", "burnermail.io", "maildrop.cc",
  "temp-mail.com", "disposablemail.com", "mytemp.email", "guerrillamail.net"
]);

const fs = require("fs");
const path = require("path");

const COMMON_DOMAIN_TYPOS = {
  "gmai.com": "gmail.com", "gamil.com": "gmail.com", "hotmial.com": "hotmail.com",
  "outlok.com": "outlook.com", "yaho.com": "yahoo.com"
};

const AUDIT_FILE_PATH = path.join(__dirname, "contractAudit.json");

function readAuditStore() {
  try {
    if (!fs.existsSync(AUDIT_FILE_PATH)) return [];
    const raw = fs.readFileSync(AUDIT_FILE_PATH, "utf8");
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to read contract audit store:", err);
    return [];
  }
}

function writeAuditStore(entries) {
  try {
    fs.writeFileSync(AUDIT_FILE_PATH, JSON.stringify(entries, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("Failed to write contract audit store:", err);
    return false;
  }
}

function generateContractNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WPS-${y}${m}${d}-${h}${min}${s}-${suffix}`;
}

// The request body's originUrl is client-supplied and was previously used
// as-is to build the "View & Print Comp Card" button link mailed out via the
// studio's Resend sender — a POST with originUrl: "https://evil.example"
// would have the studio's own domain send an official-looking email pointing
// at an attacker's site. Only ever build the link from a known-good origin.
const PDFDocument = require("pdfkit");
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

function buildContractPdfBuffer(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).font("Helvetica-Bold").text("Studio Contract & Agreement", { align: "center" });
    doc.moveDown(1);
    doc.fontSize(10).font("Helvetica").text(`Client: ${data.clientName || "—"}`);
    doc.text(`Email: ${data.clientEmail || "—"}`);
    doc.text(`Phone: ${data.phone || "—"}`);
    doc.text(`Instagram / Website: ${data.instagram || "—"}`);
    doc.text(`Session Type: ${data.shootType || "—"}`);
    doc.text(`Scheduled Date: ${data.date || "—"}`);
    doc.text(`Location: ${data.location || "—"}`);
    doc.text(`Contract Version: ${data.contractVersion || "—"}`);
    doc.text(`Contract Number: ${data.contractNumber || "—"}`);
    doc.moveDown(0.5);
    doc.text(`Notes: ${data.notes || "—"}`, { width: 510 });
    doc.moveDown(1);

    if (data.contractText) {
      doc.fontSize(10).font("Helvetica-Bold").text("Contract Summary", { underline: true });
      doc.moveDown(0.25);
      doc.fontSize(9).font("Helvetica").text(data.contractText, { width: 510, align: "justify" });
      doc.addPage();
    }

    doc.fontSize(10).font("Helvetica-Bold").text("Signed Contract Acceptance", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9).font("Helvetica").text(`Agreement captured: ${data.contractVersion || "—"}`);
    doc.text(`Signature recorded: ${data.sigDataUrl ? "Yes" : "No"}`);
    doc.moveDown(0.5);

    if (data.sigDataUrl) {
      const matches = String(data.sigDataUrl).match(/^data:(image\/png|image\/jpeg);base64,(.+)$/);
      if (matches) {
        try {
          const imageBuffer = Buffer.from(matches[2], "base64");
          doc.image(imageBuffer, { fit: [300, 120], align: "center" });
          doc.moveDown(0.3);
        } catch (err) {
          // ignore invalid image data and continue
        }
      }
    }

    doc.moveDown(0.5);
    doc.fontSize(9).font("Helvetica").text("This document was generated by the studio booking system and includes the requested contract terms and captured approval.", {
      width: 510,
      align: "justify"
    });

    doc.end();
  });
}

async function sendSignedContractEmail(payload) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL || "noreply@nerdyphotographer.in";
  if (!resendApiKey) {
    return { success: false, error: "Email service is not configured." };
  }

  const pdfBuffer = await buildContractPdfBuffer(payload);
  const toRecipients = [process.env.RESEND_TO_EMAIL || "prateeksaxenaphotography@gmail.com"];
  if (payload.clientEmail && !toRecipients.includes(payload.clientEmail)) {
    toRecipients.push(payload.clientEmail);
  }

  const sendBody = {
    from: `nerdyphotographer.in studio <${fromAddress}>`,
    to: toRecipients,
    subject: `Signed Contract — ${payload.clientName || "Client"} (${payload.contractNumber || payload.contractVersion || "Contract"})`,
    reply_to: payload.clientEmail || fromAddress,
    html: `
      <div style="font-family: system-ui, sans-serif; font-size:14px; color:#111;">
        <p>Hi,</p>
        <p>The signed contract for <strong>${payload.clientName || "a client"}</strong> is attached as a PDF.</p>
        <p><strong>Contract Number:</strong> ${payload.contractNumber || "—"}</p>
        <p><strong>Contract Version:</strong> ${payload.contractVersion || "—"}</p>
        <p><strong>Client Email:</strong> ${payload.clientEmail || "—"}</p>
        <p><strong>Session Type:</strong> ${payload.shootType || "—"}</p>
        <p><strong>Scheduled Date:</strong> ${payload.date || "—"}</p>
        <p><strong>Signature captured:</strong> ${payload.sigDataUrl ? "Yes" : "No"}</p>
        <p>This email includes the generated contract PDF attachment and the approval details recorded in the booking workflow.</p>
      </div>
    `,
    attachments: [
      {
        type: "application/pdf",
        name: "signed-contract.pdf",
        data: pdfBuffer.toString("base64")
      }
    ]
  };

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(sendBody)
  });

  if (!resendRes.ok) {
    const errorBody = await resendRes.text().catch(() => "");
    return { success: false, error: `Resend API error ${resendRes.status}: ${errorBody}` };
  }

  return { success: true };
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress;
}

exports.recordContractAudit = async (req, res) => {
  const { clientName, clientEmail, phone, instagram, date, location, shootType, contractVersion, sigDataUrl, notes, contractNumber } = req.body;
  const ip = getClientIp(req) || "unknown";

  const shapeCheck = validateEmailShape(clientEmail);
  if (!shapeCheck.valid) {
    return res.status(400).json({ error: shapeCheck.error });
  }

  const entry = {
    contractNumber: contractNumber || generateContractNumber(),
    clientName: clientName || "Unknown Client",
    clientEmail: shapeCheck.cleanEmail,
    phone: phone || "",
    instagram: instagram || "",
    date: date || "",
    location: location || "",
    shootType: shootType || "",
    contractVersion: contractVersion || "",
    sigCaptured: !!sigDataUrl,
    notes: notes || "",
    timestamp: new Date().toISOString(),
    ip
  };

  const allEntries = readAuditStore();
  allEntries.push(entry);
  if (!writeAuditStore(allEntries)) {
    return res.status(500).json({ error: "Unable to persist contract audit record." });
  }

  return res.status(200).json({ success: true, entry });
};

exports.getContractAudits = async (_req, res) => {
  const entries = readAuditStore();
  return res.status(200).json({ success: true, entries });
};

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
// Sweep dead IPs out of the map periodically. isRateLimited prunes old
// timestamps *within* a key but never removes the key itself, so on a
// long-lived process the map grew by one entry per unique visitor IP
// forever — a slow memory leak that eventually OOM-restarts a small
// instance. unref() keeps this timer from holding the process open.
setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of rateLimitHits) {
    if (!hits.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) rateLimitHits.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

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

// POST /api/logs - validates the email shape and emails a magic download
// link. Real proof the address is reachable comes from the visitor clicking
// that link, not from validation here. (The route path keeps its historic
// /api/logs name so already-deployed frontends keep working, but nothing is
// logged anymore.)
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

  const emailResult = await sendMagicDownloadEmail(cleanEmail, modelName.trim(), downloadUrl);

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

exports.sendContractEmail = async (req, res) => {
  const { clientName, clientEmail, phone, instagram, date, location, shootType, contractVersion, contractText, sigDataUrl, notes } = req.body;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
  if (isRateLimited(ip || "unknown")) {
    return res.status(429).json({ error: "Too many contract send requests from this connection. Please try again later." });
  }

  const emailCheck = validateEmailShape(clientEmail);
  if (!emailCheck.valid) {
    return res.status(400).json({ error: emailCheck.error });
  }

  const payload = {
    clientName: clientName || "Client",
    clientEmail: emailCheck.cleanEmail,
    phone: phone || "",
    instagram: instagram || "",
    date: date || "",
    location: location || "",
    shootType: shootType || "",
    contractVersion: contractVersion || "",
    contractText: contractText || "",
    sigDataUrl: sigDataUrl || "",
    notes: notes || ""
  };

  const emailResult = await sendSignedContractEmail(payload);
  if (!emailResult.success) {
    return res.status(502).json({ error: emailResult.error || "Unable to send signed contract email." });
  }

  return res.status(200).json({ success: true, message: "Signed contract email sent." });
};
