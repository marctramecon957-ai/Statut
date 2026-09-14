const { execFile } = require('child_process');
const path = require('path');
const db = require('./database');

let dernierSync = { date: null, succes: null, erreur: null, nombre: 0 };

function pronoteConfigure() {
  return !!(process.env.PRONOTE_URL && process.env.PRONOTE_USERNAME && process.env.PRONOTE_PASSWORD);
}

function lancerSynchronisation() {
  return new Promise((resolve) => {
    if (!pronoteConfigure()) {
      dernierSync = { date: new Date().toISOString(), succes: false, erreur: "Pronote n'est pas configure (variables d'environnement manquantes)", nombre: 0 };
      return resolve(dernierSync);
    }

    const scriptPath = path.join(__dirname, '..', 'scripts', 'pronote_sync.py');
    execFile('python3', [scriptPath], { env: process.env, timeout: 30000 }, (err, stdout, stderr) => {
      // Le script ecrit toujours du JSON sur stdout, meme en cas d'erreur
      // (il sort juste avec un code non-zero) : on tente de le lire d'abord.
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

function obtenirStatutSync() {
  return { ...dernierSync, configure: pronoteConfigure() };
}

function demarrerSyncPeriodique(intervalleMinutes = 20) {
  if (!pronoteConfigure()) return;
  // Premiere synchronisation peu apres le demarrage, puis a intervalle regulier
  setTimeout(() => lancerSynchronisation(), 5000);
  setInterval(() => lancerSynchronisation(), intervalleMinutes * 60 * 1000);
}

module.exports = { lancerSynchronisation, obtenirStatutSync, demarrerSyncPeriodique, pronoteConfigure };
