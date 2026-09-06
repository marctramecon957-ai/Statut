const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");

const { readDb, writeDb } = require("./src/db");
const { encrypt, decrypt } = require("./src/crypto");

const app = express();
const COOKIE_NAME = "vs_session";
const isProd = process.env.NODE_ENV === "production";

app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// ────────────────────────────────────────────────────────────────────────────
// Amorçage : crée le compte admin initial s'il n'existe pas encore
// ────────────────────────────────────────────────────────────────────────────
function ensureAdminSeed() {
  const db = readDb();
  const hasAdmin = db.users.some((u) => u.role === "admin");
  if (!hasAdmin) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || "admin123";
    db.users.push({
      id: crypto.randomUUID(),
      username,
      passwordHash: bcrypt.hashSync(password, 10),
      role: "admin",
      firstName: "Admin",
      lastName: "",
      className: "",
    });
    writeDb(db);
    console.log(`🔑 Compte admin créé — identifiant: "${username}" / mot de passe: "${password}"`);
    console.log("   ⚠️  Change ce mot de passe (variables ADMIN_USERNAME / ADMIN_PASSWORD).");
  }
}
ensureAdminSeed();

// ────────────────────────────────────────────────────────────────────────────
// Auth helpers
// ────────────────────────────────────────────────────────────────────────────
function setSessionCookie(res, userId) {
  const token = encrypt({ userId });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 180 * 24 * 60 * 60 * 1000,
  });
}

function getCurrentUser(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  const data = decrypt(token);
  if (!data) return null;
  const db = readDb();
  return db.users.find((u) => u.id === data.userId) || null;
}

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

function requireAuth(req, res, next) {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Non connecté." });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = getCurrentUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Accès refusé." });
  req.user = user;
  next();
}

// ────────────────────────────────────────────────────────────────────────────
// Auth : login / logout / me
// ────────────────────────────────────────────────────────────────────────────
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "Identifiant et mot de passe requis." });
  }

  const db = readDb();
  const user = db.users.find((u) => u.username.toLowerCase() === String(username).trim().toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: "Identifiant ou mot de passe incorrect." });
  }

  setSessionCookie(res, user.id);
  res.json({ success: true, user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

app.get("/api/auth/me", (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Non connecté." });
  res.json({ success: true, user: publicUser(user) });
});

// ────────────────────────────────────────────────────────────────────────────
// Élève : réglages établissement + emploi du temps de sa classe
// ────────────────────────────────────────────────────────────────────────────
app.get("/api/settings", (req, res) => {
  const db = readDb();
  res.json({ success: true, settings: db.settings });
});

app.get("/api/timetable", requireAuth, (req, res) => {
  const db = readDb();
  const lessons = db.lessons.filter((l) => l.className === req.user.className);
  res.json({ success: true, lessons, settings: db.settings, user: publicUser(req.user) });
});

// ────────────────────────────────────────────────────────────────────────────
// Admin : réglages établissement (nom / logo)
// ────────────────────────────────────────────────────────────────────────────
app.put("/api/admin/settings", requireAdmin, (req, res) => {
  const { schoolName, logoUrl } = req.body ?? {};
  const db = readDb();
  if (typeof schoolName === "string") db.settings.schoolName = schoolName.trim();
  if (typeof logoUrl === "string") db.settings.logoUrl = logoUrl.trim();
  writeDb(db);
  res.json({ success: true, settings: db.settings });
});

// ────────────────────────────────────────────────────────────────────────────
// Admin : gestion des utilisateurs (élèves)
// ────────────────────────────────────────────────────────────────────────────
app.get("/api/admin/users", requireAdmin, (req, res) => {
  const db = readDb();
  res.json({ success: true, users: db.users.map(publicUser) });
});

app.post("/api/admin/users", requireAdmin, (req, res) => {
  const { username, password, firstName, lastName, className, role } = req.body ?? {};
  if (!username || !password || !firstName || !className) {
    return res.status(400).json({ error: "Identifiant, mot de passe, prénom et classe sont requis." });
  }

  const db = readDb();
  const exists = db.users.some((u) => u.username.toLowerCase() === String(username).trim().toLowerCase());
  if (exists) return res.status(409).json({ error: "Cet identifiant existe déjà." });

  const newUser = {
    id: crypto.randomUUID(),
    username: String(username).trim(),
    passwordHash: bcrypt.hashSync(password, 10),
    role: role === "admin" ? "admin" : "student",
    firstName: String(firstName).trim(),
    lastName: String(lastName ?? "").trim(),
    className: String(className).trim(),
  };
  db.users.push(newUser);
  writeDb(db);
  res.json({ success: true, user: publicUser(newUser) });
});

app.put("/api/admin/users/:id", requireAdmin, (req, res) => {
  const db = readDb();
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });

  const { username, password, firstName, lastName, className } = req.body ?? {};
  if (username) user.username = String(username).trim();
  if (password) user.passwordHash = bcrypt.hashSync(password, 10);
  if (firstName) user.firstName = String(firstName).trim();
  if (lastName !== undefined) user.lastName = String(lastName).trim();
  if (className) user.className = String(className).trim();

  writeDb(db);
  res.json({ success: true, user: publicUser(user) });
});

app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  const db = readDb();
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "Tu ne peux pas supprimer ton propre compte." });
  }
  db.users = db.users.filter((u) => u.id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

// ────────────────────────────────────────────────────────────────────────────
// Admin : gestion de l'emploi du temps (cours par classe)
// ────────────────────────────────────────────────────────────────────────────
app.get("/api/admin/lessons", requireAdmin, (req, res) => {
  const db = readDb();
  res.json({ success: true, lessons: db.lessons });
});

app.post("/api/admin/lessons", requireAdmin, (req, res) => {
  const { className, day, start, end, subject, teacher, room, color } = req.body ?? {};
  if (!className || day === undefined || !start || !end || !subject) {
    return res.status(400).json({ error: "Classe, jour, horaires et matière sont requis." });
  }

  const db = readDb();
  const lesson = {
    id: crypto.randomUUID(),
    className: String(className).trim(),
    day: parseInt(day, 10),
    start,
    end,
    subject: String(subject).trim(),
    teacher: String(teacher ?? "").trim(),
    room: String(room ?? "").trim(),
    color: color || "#4f46e5",
  };
  db.lessons.push(lesson);
  writeDb(db);
  res.json({ success: true, lesson });
});

app.put("/api/admin/lessons/:id", requireAdmin, (req, res) => {
  const db = readDb();
  const lesson = db.lessons.find((l) => l.id === req.params.id);
  if (!lesson) return res.status(404).json({ error: "Cours introuvable." });

  const { className, day, start, end, subject, teacher, room, color } = req.body ?? {};
  if (className) lesson.className = String(className).trim();
  if (day !== undefined) lesson.day = parseInt(day, 10);
  if (start) lesson.start = start;
  if (end) lesson.end = end;
  if (subject) lesson.subject = String(subject).trim();
  if (teacher !== undefined) lesson.teacher = String(teacher).trim();
  if (room !== undefined) lesson.room = String(room).trim();
  if (color) lesson.color = color;

  writeDb(db);
  res.json({ success: true, lesson });
});

app.delete("/api/admin/lessons/:id", requireAdmin, (req, res) => {
  const db = readDb();
  db.lessons = db.lessons.filter((l) => l.id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

// ────────────────────────────────────────────────────────────────────────────
// Pages
// ────────────────────────────────────────────────────────────────────────────
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🟢 Serveur démarré sur le port ${PORT}`));
