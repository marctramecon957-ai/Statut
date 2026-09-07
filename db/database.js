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
`);

// Migration douce : ajoute la colonne "semaine" si la base existait avant son introduction
const colonnes = db.prepare("PRAGMA table_info(creneaux)").all().map(c => c.name);
if (!colonnes.includes('semaine')) {
  db.exec("ALTER TABLE creneaux ADD COLUMN semaine TEXT NOT NULL DEFAULT 'Toutes'");
}

module.exports = db;
