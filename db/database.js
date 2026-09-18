const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'eleve', -- 'admin' ou 'eleve'
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matieres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS creneaux (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jour TEXT NOT NULL,        -- 'Lundi', 'Mardi', ...
  heure_debut TEXT NOT NULL, -- '08:00'
  heure_fin TEXT NOT NULL,   -- '09:00'
  matiere_id INTEGER,
  salle TEXT,
  professeur TEXT,
  semaine TEXT NOT NULL DEFAULT 'Toutes', -- 'S1', 'S2' ou 'Toutes' (les deux semaines)
  FOREIGN KEY (matiere_id) REFERENCES matieres(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pronote_evenements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,        -- 'YYYY-MM-DD'
  jour TEXT NOT NULL,
  heure_debut TEXT NOT NULL,
  heure_fin TEXT NOT NULL,
  matiere_nom TEXT,
  salle TEXT,
  professeur TEXT,
  statut TEXT NOT NULL DEFAULT 'normal', -- 'normal', 'annule', 'modifie', 'deplace'
  commentaire TEXT,
  nouvelle_heure_debut TEXT, -- utilise seulement si statut = 'deplace'
  nouvelle_heure_fin TEXT,
  nouvelle_salle TEXT,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  semaine TEXT NOT NULL DEFAULT 'S1', -- 'S1' ou 'S2', suit le choix fait dans l'app
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Evite de renvoyer deux fois la meme notification push (le cron externe
-- appelle /api/cron/verifier-notifications toutes les quelques minutes, il
-- faut donc se souvenir de ce qui a deja ete envoye aujourd'hui).
CREATE TABLE IF NOT EXISTS push_envois (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  cle TEXT NOT NULL,
  envoye_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  UNIQUE(subscription_id, date, cle)
);
`);

// Migration douce : ajoute la colonne "semaine" si la base existait avant son introduction
const colonnes = db.prepare("PRAGMA table_info(creneaux)").all().map(c => c.name);
if (!colonnes.includes('semaine')) {
  db.exec("ALTER TABLE creneaux ADD COLUMN semaine TEXT NOT NULL DEFAULT 'Toutes'");
}

// Migration douce : ajoute les colonnes de deplacement si la base existait avant leur introduction
const colonnesEvt = db.prepare("PRAGMA table_info(pronote_evenements)").all().map(c => c.name);
if (!colonnesEvt.includes('nouvelle_heure_debut')) {
  db.exec("ALTER TABLE pronote_evenements ADD COLUMN nouvelle_heure_debut TEXT");
}
if (!colonnesEvt.includes('nouvelle_heure_fin')) {
  db.exec("ALTER TABLE pronote_evenements ADD COLUMN nouvelle_heure_fin TEXT");
}
if (!colonnesEvt.includes('nouvelle_salle')) {
  db.exec("ALTER TABLE pronote_evenements ADD COLUMN nouvelle_salle TEXT");
}

module.exports = db;
