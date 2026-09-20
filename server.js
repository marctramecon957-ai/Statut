require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { analyserPdf } = require('./db/pdf-extract');
const { lancerSynchronisation, obtenirStatutSync, demarrerSyncPeriodique } = require('./db/pronote-sync');
const { verifierEtEnvoyerNotifications, envoyerNotificationInstantanee, envoyerNotificationTest, vapidPublicKey } = require('./db/notifications');
const telegram = require('./db/telegram');
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
    rolling: true, // prolonge la session a chaque visite, tant que l'utilisateur revient avant expiration
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 an - reste connecte tant que le navigateur/app n'est pas desinstalle
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
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

// ---------- IMPORT PDF ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 Mo max
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new Error('Seuls les fichiers PDF sont acceptés'));
    cb(null, true);
  },
});

app.post('/api/admin/import-pdf', requireAdmin, (req, res) => {
  upload.single('pdf')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

    try {
      const { texte, creneaux } = await analyserPdf(req.file.buffer);
      res.json({ success: true, text: texte, creneaux });
    } catch (e) {
      res.status(500).json({ error: 'Impossible de lire ce PDF' });
    }
  });
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

app.put('/api/admin/matieres/:id', requireAdmin, (req, res) => {
  const { nom } = req.body;
  if (!nom || !nom.trim()) return res.status(400).json({ error: 'Nom de matiere requis' });
  try {
    db.prepare('UPDATE matieres SET nom = ? WHERE id = ?').run(nom.trim(), Number(req.params.id));
    res.json({ success: true });
  } catch (e) {
    res.status(409).json({ error: 'Cette matiere existe deja' });
  }
});

// ---------- EMPLOI DU TEMPS ----------
app.get('/api/creneaux', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.jour, c.heure_debut, c.heure_fin, c.salle, c.professeur, c.matiere_id, c.semaine, m.nom AS matiere_nom
       FROM creneaux c
       LEFT JOIN matieres m ON m.id = c.matiere_id
       ORDER BY c.heure_debut`
    )
    .all();
  res.json(rows);
});

app.post('/api/admin/creneaux', requireAdmin, (req, res) => {
  const { jour, heure_debut, heure_fin, matiere_id, salle, professeur, semaine } = req.body;
  if (!jour || !heure_debut || !heure_fin) {
    return res.status(400).json({ error: 'Jour et horaires requis' });
  }
  const semaineValue = ['S1', 'S2', 'Toutes'].includes(semaine) ? semaine : 'Toutes';
  const info = db
    .prepare(
      `INSERT INTO creneaux (jour, heure_debut, heure_fin, matiere_id, salle, professeur, semaine)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(jour, heure_debut, heure_fin, matiere_id || null, salle || '', professeur || '', semaineValue);
  res.json({ success: true, id: info.lastInsertRowid });
});

app.put('/api/admin/creneaux/:id', requireAdmin, (req, res) => {
  const { jour, heure_debut, heure_fin, matiere_id, salle, professeur, semaine } = req.body;
  const semaineValue = ['S1', 'S2', 'Toutes'].includes(semaine) ? semaine : 'Toutes';
  db.prepare(
    `UPDATE creneaux SET jour=?, heure_debut=?, heure_fin=?, matiere_id=?, salle=?, professeur=?, semaine=? WHERE id=?`
  ).run(jour, heure_debut, heure_fin, matiere_id || null, salle || '', professeur || '', semaineValue, Number(req.params.id));
  res.json({ success: true });
});

app.delete('/api/admin/creneaux/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM creneaux WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

// Marque manuellement un creneau comme annule/modifie pour aujourd'hui (secours
// si la detection automatique via Pronote ne fonctionne pas). Reutilise la
// table pronote_evenements : le reste du systeme (frise, fenetre de detail)
// fonctionne alors exactement comme pour une detection automatique.
app.post('/api/admin/creneaux/:id/statut-jour', requireAdmin, async (req, res) => {
  const { statut, nouvelle_heure_debut, nouvelle_heure_fin, nouvelle_salle } = req.body; // 'annule', 'modifie', 'deplace' ou 'normal' (normal = retirer le marquage)
  if (!['annule', 'modifie', 'deplace', 'normal'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }
  if (statut === 'deplace') {
    if (!nouvelle_heure_debut || !nouvelle_heure_fin) {
      return res.status(400).json({ error: 'Nouvel horaire requis pour un déplacement' });
    }
    if (nouvelle_heure_fin <= nouvelle_heure_debut) {
      return res.status(400).json({ error: "L'heure de fin doit être après l'heure de début" });
    }
  }

  const creneau = db
    .prepare(`SELECT c.jour, c.heure_debut, c.heure_fin, c.semaine, m.nom AS matiere_nom, c.salle, c.professeur
               FROM creneaux c LEFT JOIN matieres m ON m.id = c.matiere_id WHERE c.id = ?`)
    .get(Number(req.params.id));
  if (!creneau) return res.status(404).json({ error: 'Creneau introuvable' });

  // Calcule la date du jour du creneau dans la semaine en cours (ex: si le
  // creneau est un Lundi, on prend le lundi de cette semaine, pas la date du jour actuel).
  const JOURS_ORDRE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const indexJourCreneau = JOURS_ORDRE.indexOf(creneau.jour);
  const maintenant = new Date();
  const indexJourActuel = (maintenant.getDay() + 6) % 7; // 0 = lundi
  const dateCible = new Date(maintenant);
  dateCible.setDate(maintenant.getDate() - indexJourActuel + (indexJourCreneau === -1 ? 0 : indexJourCreneau));
  const dateStr = dateCible.toISOString().slice(0, 10);

  db.prepare('DELETE FROM pronote_evenements WHERE date = ? AND jour = ? AND heure_debut = ? AND heure_fin = ?')
    .run(dateStr, creneau.jour, creneau.heure_debut, creneau.heure_fin);

  if (statut !== 'normal') {
    db.prepare(`
      INSERT INTO pronote_evenements (date, jour, heure_debut, heure_fin, matiere_nom, salle, professeur, statut, commentaire, nouvelle_heure_debut, nouvelle_heure_fin, nouvelle_salle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dateStr, creneau.jour, creneau.heure_debut, creneau.heure_fin,
      creneau.matiere_nom || '', creneau.salle || '', creneau.professeur || '',
      statut, 'Marque manuellement',
      statut === 'deplace' ? nouvelle_heure_debut : null,
      statut === 'deplace' ? nouvelle_heure_fin : null,
      statut === 'deplace' ? (nouvelle_salle || null) : null
    );
  }

  res.json({ success: true });

  // Notification instantanee (best-effort, ne bloque pas la reponse ci-dessus).
  envoyerNotificationInstantanee({
    jour: creneau.jour,
    dateStr,
    semaine: creneau.semaine || 'Toutes',
    statut,
    matiere_nom: creneau.matiere_nom || 'Un cours',
    heure_debut: creneau.heure_debut,
    heure_fin: creneau.heure_fin,
    nouvelle_heure_debut,
    nouvelle_heure_fin,
  }).catch(() => {});
});

// ---------- PRONOTE ----------
app.get('/api/pronote-evenements', requireAuth, (req, res) => {
  // Retourne les evenements de la semaine courante (lundi a samedi)
  const aujourdhui = new Date();
  const jourSemaine = (aujourdhui.getDay() + 6) % 7; // 0 = lundi
  const lundi = new Date(aujourdhui);
  lundi.setDate(aujourdhui.getDate() - jourSemaine);
  const samedi = new Date(lundi);
  samedi.setDate(lundi.getDate() + 5);

  const fmt = (d) => d.toISOString().slice(0, 10);
  const rows = db
    .prepare('SELECT * FROM pronote_evenements WHERE date >= ? AND date <= ? ORDER BY date, heure_debut')
    .all(fmt(lundi), fmt(samedi));
  res.json(rows);
});

app.get('/api/admin/pronote-statut', requireAdmin, (req, res) => {
  res.json(obtenirStatutSync());
});

app.post('/api/admin/pronote-sync', requireAdmin, async (req, res) => {
  const resultat = await lancerSynchronisation();
  res.json(resultat);
});

// Cree les matieres et creneaux de base a partir des evenements Pronote deja
// synchronises (utile pour demarrer rapidement sans tout saisir a la main).
app.post('/api/admin/pronote-vers-creneaux', requireAdmin, (req, res) => {
  const evenements = db.prepare('SELECT DISTINCT jour, heure_debut, heure_fin, matiere_nom, salle, professeur FROM pronote_evenements ORDER BY jour, heure_debut').all();

  if (evenements.length === 0) {
    return res.status(400).json({ error: "Aucun evenement Pronote synchronise pour le moment. Cliquez d'abord sur \"Synchroniser maintenant\"." });
  }

  let creneauxCrees = 0;
  const transaction = db.transaction(() => {
    evenements.forEach((e) => {
      if (!e.matiere_nom || e.matiere_nom === 'Sans matière') return;

      let matiere = db.prepare('SELECT id FROM matieres WHERE LOWER(nom) = LOWER(?)').get(e.matiere_nom);
      if (!matiere) {
        const info = db.prepare('INSERT INTO matieres (nom) VALUES (?)').run(e.matiere_nom);
        matiere = { id: info.lastInsertRowid };
      }

      const existe = db.prepare('SELECT id FROM creneaux WHERE jour = ? AND heure_debut = ? AND heure_fin = ? AND matiere_id = ?')
        .get(e.jour, e.heure_debut, e.heure_fin, matiere.id);
      if (existe) return; // evite les doublons si on relance l'operation

      db.prepare('INSERT INTO creneaux (jour, heure_debut, heure_fin, matiere_id, salle, professeur, semaine) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(e.jour, e.heure_debut, e.heure_fin, matiere.id, e.salle || '', e.professeur || '', 'Toutes');
      creneauxCrees++;
    });
  });
  transaction();

  res.json({ success: true, creneauxCrees });
});

// ---------- NOTIFICATIONS PUSH ----------
app.get('/api/vapid-public-key', requireAuth, (req, res) => {
  const key = vapidPublicKey();
  if (!key) return res.status(503).json({ error: 'Notifications push non configurées sur ce serveur' });
  res.json({ publicKey: key });
});

app.post('/api/push-subscribe', requireAuth, (req, res) => {
  const { subscription, semaine } = req.body;
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Abonnement invalide' });
  }
  const semaineValue = semaine === 'S2' ? 'S2' : 'S1';
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, semaine)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, semaine = excluded.semaine`
  ).run(req.session.user.id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, semaineValue);
  res.json({ success: true });
});

app.post('/api/push-unsubscribe', requireAuth, (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint requis' });
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, req.session.user.id);
  res.json({ success: true });
});

// Envoie une notif de test aux abonnements de l'utilisateur connecte, et
// renvoie le detail des erreurs eventuelles (utile pour diagnostiquer).
app.post('/api/push-test', requireAuth, async (req, res) => {
  try {
    const resultat = await envoyerNotificationTest(req.session.user.id);
    res.json(resultat);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Appelee par un cron externe (ex. cron-job.org) toutes les 5 minutes. Pas de
// session ici : protegee par un secret partage passe en query string.
app.get('/api/cron/verifier-notifications', async (req, res) => {
  if (!process.env.CRON_SECRET || req.query.secret !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: 'Secret invalide' });
  }
  try {
    await telegram.traiterMessagesEntrants();
    const resultat = await verifierEtEnvoyerNotifications();
    res.json(resultat);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- NOTIFICATIONS TELEGRAM (alternative au push, moins fragile) ----------

// Renvoie l'etat de liaison de l'utilisateur connecte, et un code de liaison
// s'il n'est pas encore lie (a envoyer au bot avec "/lier CODE").
app.get('/api/telegram/statut', requireAuth, async (req, res) => {
  if (!telegram.estConfigure()) {
    return res.status(503).json({ configure: false, error: "Le bot Telegram n'est pas configuré sur le serveur" });
  }
  const chat = telegram.chatLiePour(req.session.user.id);
  if (chat) {
    return res.json({ configure: true, lie: true, semaine: chat.semaine });
  }
  const code = telegram.codePour(req.session.user.id);
  const username = await telegram.botUsername();
  res.json({ configure: true, lie: false, code, botUsername: username });
});

app.post('/api/telegram/delier', requireAuth, (req, res) => {
  telegram.delierPour(req.session.user.id);
  res.json({ success: true });
});

app.post('/api/telegram/semaine', requireAuth, (req, res) => {
  const { semaine } = req.body;
  if (semaine !== 'S1' && semaine !== 'S2') return res.status(400).json({ error: 'semaine invalide' });
  telegram.majSemaine(req.session.user.id, semaine);
  res.json({ success: true });
});

app.post('/api/telegram/test', requireAuth, async (req, res) => {
  const chat = telegram.chatLiePour(req.session.user.id);
  if (!chat) return res.status(400).json({ error: 'Aucun chat Telegram lié à ce compte' });
  const resultat = await telegram.envoyerMessage(chat.chat_id, 'Notification de test 🎉\nSi tu vois ceci, les notifications Telegram fonctionnent.');
  res.json(resultat);
});

// ---------- Pages ----------
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur Valenca Studio - Emploi du temps demarre sur le port ${PORT}`);
  demarrerSyncPeriodique(20);
});
