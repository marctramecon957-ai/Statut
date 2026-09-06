const fs = require("fs");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "db.json");

const DEFAULT_DB = {
  settings: {
    schoolName: "Mon établissement",
    logoUrl: "/logo.png",
  },
  users: [],   // { id, username, passwordHash, role: 'admin' | 'student', firstName, lastName, className }
  lessons: [], // { id, className, day (0=lundi..5=samedi), start "HH:MM", end "HH:MM", subject, teacher, room, color }
};

function ensureDbFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

function writeDb(db) {
  ensureDbFile();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

module.exports = { readDb, writeDb };
