// Synchronisation Pronote via l'export iCal officiel (fonctionnalite native
// de Pronote : Communication > Agenda > Exporter au format iCal).
// Ne necessite ni identifiants, ni ENT, ni librairie tierce fragile :
// l'URL contient deja un jeton d'acces securise genere par Pronote.
const ical = require('node-ical');
const db = require('./database');

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

let dernierSync = { date: null, succes: null, erreur: null, nombre: 0 };

function pronoteConfigure() {
  return !!process.env.PRONOTE_ICAL_URL;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Convertit une valeur de champ ICS (qui peut etre une simple chaine, mais
// aussi un objet {val, params} ou un tableau selon les cas) en texte simple.
function versTexte(valeur) {
  if (valeur === null || valeur === undefined) return '';
  if (typeof valeur === 'string') return valeur;
  if (Array.isArray(valeur)) return valeur.map(versTexte).join(' ');
  if (typeof valeur === 'object' && 'val' in valeur) return versTexte(valeur.val);
  return String(valeur);
}

// Determine le statut d'un evenement a partir de son titre/description.
// Pronote n'utilise pas le champ STATUS standard de l'ICS pour les
// annulations : l'information est ecrite dans le texte (ex: "Cours annulé : ...").
function determinerStatut(texte) {
  const t = (texte || '').toLowerCase();
  if (t.includes('annul')) return 'annule';
  if (t.includes('modifi') || t.includes('changement') || t.includes('déplac')) return 'modifie';
  return 'normal';
}

function nettoyerMatiere(summary) {
  return versTexte(summary)
    .replace(/^cours annul[ée]?\s*:?\s*/i, '')
    .replace(/^annul[ée]?\s*:?\s*/i, '')
    .replace(/\(.*?\)\s*$/, '')
    .trim() || 'Sans matière';
}

async function lancerSynchronisation() {
  if (!pronoteConfigure()) {
    dernierSync = { date: new Date().toISOString(), succes: false, erreur: "Pronote n'est pas configure (variable PRONOTE_ICAL_URL manquante)", nombre: 0 };
    return dernierSync;
  }

  try {
    const url = process.env.PRONOTE_ICAL_URL;
    const reponse = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!reponse.ok) {
      throw new Error(`Le serveur Pronote a repondu avec le code ${reponse.status}`);
    }
    const texteIcs = await reponse.text();
    const data = ical.sync.parseICS(texteIcs);

    const aujourdhui = new Date();
    const jourSemaineActuel = (aujourdhui.getDay() + 6) % 7; // 0 = lundi
    const lundi = new Date(aujourdhui);
    lundi.setHours(0, 0, 0, 0);
    lundi.setDate(aujourdhui.getDate() - jourSemaineActuel);
    const dimancheSuivant = new Date(lundi);
    dimancheSuivant.setDate(lundi.getDate() + 7);

    const evenements = [];

    Object.values(data).forEach((ev) => {
      if (ev.type !== 'VEVENT' || !ev.start || !ev.end) return;

      const debut = new Date(ev.start);
      if (debut < lundi || debut >= dimancheSuivant) return; // hors semaine courante

      const texteComplet = `${versTexte(ev.summary)} ${versTexte(ev.description)}`;
      const statut = determinerStatut(texteComplet);

      evenements.push({
        date: debut.toISOString().slice(0, 10),
        jour: JOURS_FR[debut.getUTCDay()],
        heure_debut: `${pad2(debut.getUTCHours())}:${pad2(debut.getUTCMinutes())}`,
        heure_fin: `${pad2(new Date(ev.end).getUTCHours())}:${pad2(new Date(ev.end).getUTCMinutes())}`,
        matiere_nom: nettoyerMatiere(ev.summary),
        salle: versTexte(ev.location),
        professeur: versTexte(ev.description),
        statut,
        commentaire: statut !== 'normal' ? versTexte(ev.summary) : '',
      });
    });

    enregistrerEvenements(evenements);
    dernierSync = { date: new Date().toISOString(), succes: true, erreur: null, nombre: evenements.length };
  } catch (e) {
    const messageErreur = (e.cause && e.cause.message) ? `${e.message} (${e.cause.message})` : (e.message || 'Erreur inconnue');
    dernierSync = { date: new Date().toISOString(), succes: false, erreur: messageErreur, nombre: 0 };
  }

  return dernierSync;
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
  setTimeout(() => lancerSynchronisation(), 5000);
  setInterval(() => lancerSynchronisation(), intervalleMinutes * 60 * 1000);
}

module.exports = { lancerSynchronisation, obtenirStatutSync, demarrerSyncPeriodique, pronoteConfigure };
