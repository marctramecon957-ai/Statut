const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./database');

const TOKEN_FILE = path.join(__dirname, 'pronote_token.json');

let dernierSync = { date: null, succes: null, erreur: null, nombre: 0 };

function tokenExiste() {
  return fs.existsSync(TOKEN_FILE);
}

function pronoteConfigure() {
  // Configure soit via un token deja appaire (QR code), soit via identifiant/mot de passe (+ ENT eventuel)
  return tokenExiste() || !!(process.env.PRONOTE_URL && process.env.PRONOTE_USERNAME && process.env.PRONOTE_PASSWORD);
}

function envAvecToken() {
  return { ...process.env, PRONOTE_TOKEN_FILE: TOKEN_FILE };
}

function lancerSynchronisation() {
  return new Promise((resolve) => {
    if (!pronoteConfigure()) {
      dernierSync = { date: new Date().toISOString(), succes: false, erreur: "Pronote n'est pas configure (ni token QR, ni variables d'environnement)", nombre: 0 };
      return resolve(dernierSync);
    }

    const scriptPath = path.join(__dirname, '..', 'scripts', 'pronote_sync.py');
    execFile('python3', [scriptPath], { env: envAvecToken(), timeout: 30000 }, (err, stdout, stderr) => {
      if (stdout && stdout.trim()) {
        try {
          const data = JSON.parse(stdout.trim().split('\n').pop());
          if (!data.success) {
            dernierSync = { date: new Date().toISOString(), succes: false, erreur: data.error || 'Erreur inconnue', nombre: 0 };
            return resolve(dernierSync);
          }
          const evenements = data.evenements || [];
          enregistrerEvenements(evenements);
          dernierSync = { date: new Date().toISOString(), succes: true, erreur: null, nombre: evenements.length };
          return resolve(dernierSync);
        } catch (e) {
          // stdout n'est pas du JSON valide, on tombe dans la gestion d'erreur ci-dessous
        }
      }

      if (err) {
        dernierSync = { date: new Date().toISOString(), succes: false, erreur: 'Le script de synchronisation a echoue : ' + (stderr || err.message), nombre: 0 };
        return resolve(dernierSync);
      }

      dernierSync = { date: new Date().toISOString(), succes: false, erreur: 'Reponse du script Pronote illisible', nombre: 0 };
      resolve(dernierSync);
    });
  });
}

function enregistrerEvenements(evenements) {
  const transaction = db.transaction((liste) => {
    const dates = [...new Set(liste.map((e) => e.date))];
    if (dates.length) {
      const placeholders = dates.map(() => '?').join(',');
      db.prepare(`DELETE FROM pronote_evenements WHERE date IN (${placeholders})`).run(...dates);
    }
    const insert = db.prepare(`
      INSERT INTO pronote_evenements (date, jour, heure_debut, heure_fin, matiere_nom, salle, professeur, statut, commentaire)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    liste.forEach((e) => {
      insert.run(e.date, e.jour, e.heure_debut, e.heure_fin, e.matiere_nom || '', e.salle || '', e.professeur || '', e.statut || 'normal', e.commentaire || '');
    });
  });
  transaction(evenements);
}

// Appairage initial par QR code : recoit les donnees du QR + le PIN, tente la
// connexion, et si elle reussit, sauvegarde le token pour les prochaines synchros.
function appairerParQrCode(qrJson, pin) {
  return new Promise((resolve) => {
    const uuidApp = crypto.randomUUID();
    const scriptPath = path.join(__dirname, '..', 'scripts', 'pronote_qr_pair.py');
    const entree = JSON.stringify({ qr_json: qrJson, pin, uuid: uuidApp });

    const child = execFile('python3', [scriptPath], { timeout: 20000 }, (err, stdout, stderr) => {
      if (stdout && stdout.trim()) {
        try {
          const data = JSON.parse(stdout.trim().split('\n').pop());
          if (data.success) {
            fs.writeFileSync(TOKEN_FILE, JSON.stringify(data.credentials));
            return resolve({ success: true });
          }
          return resolve({ success: false, error: data.error || 'Erreur inconnue' });
        } catch (e) {
          return resolve({ success: false, error: 'Reponse du script illisible' });
        }
      }
      resolve({ success: false, error: 'Le script d\'appairage a echoue : ' + (stderr || (err && err.message) || 'erreur inconnue') });
    });

    child.stdin.write(entree);
    child.stdin.end();
  });
}

function obtenirStatutSync() {
  return { ...dernierSync, configure: pronoteConfigure(), methode: tokenExiste() ? 'qrcode' : (pronoteConfigure() ? 'identifiants' : null) };
}

function demarrerSyncPeriodique(intervalleMinutes = 20) {
  // Toujours programmee : lancerSynchronisation() verifie elle-meme si Pronote
  // est configure (utile si l'appairage QR code se fait apres le demarrage).
  setTimeout(() => lancerSynchronisation(), 5000);
  setInterval(() => lancerSynchronisation(), intervalleMinutes * 60 * 1000);
}

module.exports = { lancerSynchronisation, obtenirStatutSync, demarrerSyncPeriodique, pronoteConfigure, appairerParQrCode };
