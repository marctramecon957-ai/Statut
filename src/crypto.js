const crypto = require("crypto");

const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me-in-production";
const KEY = crypto.createHash("sha256").update(SECRET).digest();

function encrypt(payloadObj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const json = JSON.stringify(payloadObj);
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

function decrypt(token) {
  try {
    const combined = Buffer.from(token, "base64url");
    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(12, 28);
    const encrypted = combined.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt };
