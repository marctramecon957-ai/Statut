require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const db = require('./db/database');

// S'assure que le compte admin par defaut existe
require('./db/seed');

const app = express();
const PORT = process.env.PORT || 3000;

// Necessaire derriere le proxy HTTPS de Render pour que les cookies de session
// marques "secure" soient correctement geres.
app.set('trust proxy', 1);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'db') }),
    secret: process.env.SESSION_SECRET || 'valenca-studio-secret-change-moi',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 jours
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

// ---------- Middlewares ----------
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Non authentifie' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acces reserve a l\'administrateur' });
  }
  next();
}

// ---------- AUTH ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Identifiants manquants' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Identifiants invalides' });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });

  req.session.user = { id: user.id, username: user.username, role: user.role };

  res.json({
    success: true,
    mustChangePassword: !!user.must_change_password,
    role: user.role,
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  res.json({ user: req.session.user });
});

app.post('/api/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caracteres' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  if (!user.must_change_password) {
    const ok = bcrypt.compareSync(currentPassword || '', user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, user.id);
  res.json({ success: true });
});

// ---------- ADMIN : GESTION DES UTILISATEURS ----------
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role, must_change_password, created_at FROM users').all();
  res.json(users);
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Champs manquants' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'Ce nom d\'utilisateur existe deja' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (username, password_hash, role, must_change_password) VALUES (?, ?, ?, 1)')
    .run(username, hash, role === 'admin' ? 'admin' : 'eleve');

  res.json({ success: true, id: info.lastInsertRowid });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.session.user.id) return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

app.post('/api/admin/users/:id/reset-password', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Mot de passe provisoire trop court (6 caracteres min.)' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hash, id);
  res.json({ success: true });
});

// ---------- MATIERES ----------
app.get('/api/matieres', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM matieres ORDER BY nom').all());
});

app.post('/api/admin/matieres', requireAdmin, (req, res) => {
  const { nom } = req.body;
  if (!nom || !nom.trim()) return res.status(400).json({ error: 'Nom de matiere requis' });
  try {
    const info = db.prepare('INSERT INTO matieres (nom) VALUES (?)').run(nom.trim());
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: 'Cette matiere existe deja' });
  }
});

app.delete('/api/admin/matieres/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM matieres WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

// ---------- EMPLOI DU TEMPS ----------
app.get('/api/creneaux', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.jour, c.heure_debut, c.heure_fin, c.salle, c.professeur, c.matiere_id, m.nom AS matiere_nom
       FROM creneaux c
       LEFT JOIN matieres m ON m.id = c.matiere_id
       ORDER BY c.heure_debut`
    )
    .all();
  res.json(rows);
});

app.post('/api/admin/creneaux', requireAdmin, (req, res) => {
  const { jour, heure_debut, heure_fin, matiere_id, salle, professeur } = req.body;
  if (!jour || !heure_debut || !heure_fin) {
    return res.status(400).json({ error: 'Jour et horaires requis' });
  }
  const info = db
    .prepare(
      `INSERT INTO creneaux (jour, heure_debut, heure_fin, matiere_id, salle, professeur)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(jour, heure_debut, heure_fin, matiere_id || null, salle || '', professeur || '');
  res.json({ success: true, id: info.lastInsertRowid });
});

app.put('/api/admin/creneaux/:id', requireAdmin, (req, res) => {
  const { jour, heure_debut, heure_fin, matiere_id, salle, professeur } = req.body;
  db.prepare(
    `UPDATE creneaux SET jour=?, heure_debut=?, heure_fin=?, matiere_id=?, salle=?, professeur=? WHERE id=?`
  ).run(jour, heure_debut, heure_fin, matiere_id || null, salle || '', professeur || '', Number(req.params.id));
  res.json({ success: true });
});

app.delete('/api/admin/creneaux/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM creneaux WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

// ---------- Pages ----------
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur Valenca Studio - Emploi du temps demarre sur le port ${PORT}`);
});
