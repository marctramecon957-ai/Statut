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

-- Liaison compte <-> discussion Telegram (methode de notification alternative,
-- moins fragile que le push web car elle passe par l'appli Telegram elle-meme).
CREATE TABLE IF NOT EXISTS telegram_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  chat_id TEXT NOT NULL,
  semaine TEXT NOT NULL DEFAULT 'S1',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Code de liaison temporaire affiche a l'eleve, qu'il envoie au bot pour lier
-- son compte (evite d'exposer les chat_id ou de deviner qui est qui).
CREATE TABLE IF NOT EXISTS telegram_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  code TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Evite de renvoyer deux fois le meme message Telegram (meme logique que push_envois).
CREATE TABLE IF NOT EXISTS telegram_envois (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  date TEXT NOT NULL,
  cle TEXT NOT NULL,
  envoye_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chat_id, date, cle)
);

-- Retient le dernier "update_id" Telegram traite, pour le polling (getUpdates).
CREATE TABLE IF NOT EXISTS telegram_offset (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  offset_id INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO telegram_offset (id, offset_id) VALUES (1, 0);
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
