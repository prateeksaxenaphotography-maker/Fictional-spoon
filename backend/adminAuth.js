const crypto = require("crypto");

// Shared by every admin-gated backend endpoint (CSV log export, analytics
// summary, …) so the passcode hash lives in exactly one place — previously
// each controller carried its own copy of this literal, which meant rotating
// the passcode required remembering to update every copy in lockstep. This
// value must match STUDIO_CONFIG.adminPasscodeHash in config.js — it had
// drifted (config.js had rotated to a new hash; this backend copy still had
// the old one), which meant the CSV download silently rejected the current
// admin passcode.
const ADMIN_PASSCODE_HASH = "732934c8038f3f6543681c61069d9d44bda89b55a2f45ba4e84a1dd78a530e61";

function verifyPasscode(passcode) {
  const suppliedHash = passcode
    ? crypto.createHash("sha256").update(String(passcode)).digest("hex")
    : "";
  return suppliedHash === ADMIN_PASSCODE_HASH;
}

module.exports = { verifyPasscode };
