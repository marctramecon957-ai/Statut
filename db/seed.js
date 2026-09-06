// Ce script crée le compte administrateur par défaut si aucun admin n'existe.
// Identifiants par défaut (a changer immediatement apres la 1ere connexion) :
//   utilisateur : admin
//   mot de passe : ChangeMoi123!
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./database');

const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'ChangeMoi123!';

const existingAdmin = db.prepare('SELECT * FROM users WHERE role = ?').get('admin');

if (!existingAdmin) {
  const hash = bcrypt.hashSync(ADMIN_PASS, 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, role, must_change_password) VALUES (?, ?, ?, ?)'
  ).run(ADMIN_USER, hash, 'admin', 1);
  console.log(`Compte admin cree : ${ADMIN_USER} / ${ADMIN_PASS} (changement de mot de passe force a la 1ere connexion)`);
} else {
  console.log('Un compte admin existe deja, aucune action.');
}
