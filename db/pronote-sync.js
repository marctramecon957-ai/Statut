// Synchronisation Pronote via l'export iCal officiel (fonctionnalite native
// de Pronote : Communication > Agenda > Exporter au format iCal).
// Ne necessite ni identifiants, ni ENT, ni librairie tierce fragile :
// l'URL contient deja un jeton d'acces securise genere par Pronote.
const ical = require('node-ical');
const db = require('./database');

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const FUSEAU = 'Europe/Paris';

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

// Retire les balises HTML et decode les entites (&lt; &gt; &amp;) que Pronote
// insere parfois dans la description (notes de cours, devoirs...).
function nettoyerHtml(texte) {
  return texte
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extrait un champ "Label : valeur" jusqu'au prochain label connu ou a la fin
// du texte. La description Pronote ressemble a :
// "Matière : X Professeur : Y Groupe : Z Salle : W <notes de cours...>"
const LABELS_CONNUS = ['Matière', 'Professeur', 'Groupe', 'Salle', 'Partie de classe'];
function extraireChamp(texte, label) {
  const autresLabels = LABELS_CONNUS.filter((l) => l !== label).join('|');
  const regex = new RegExp(`${label}\\s*:\\s*([^]*?)(?=(?:${autresLabels})\\s*:|$)`, 'i');
  const m = texte.match(regex);
  return m ? m[1].trim() : '';
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
  // Le titre Pronote ressemble parfois a "MATIERE - PROF - [CLASSE] - <GROUPE> ..."
  const premierSegment = versTexte(summary).split(' - ')[0];
  return premierSegment
    .replace(/^cours annul[ée]?\s*:?\s*/i, '')
    .replace(/^annul[ée]?\s*:?\s*/i, '')
    .trim() || 'Sans matière';
}

// Formatte une date dans le fuseau de Paris, quel que soit le fuseau du serveur.
function formatterDateParis(date) {
  const partiesDate = new Intl.DateTimeFormat('fr-CA', {
    timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date); // format fr-CA => AAAA-MM-JJ
  const partiesHeure = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const heure = partiesHeure.find((p) => p.type === 'hour').value;
  const minute = partiesHeure.find((p) => p.type === 'minute').value;
  const jourSemaine = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, weekday: 'long' }).format(date);
  const jourCapitalise = jourSemaine.charAt(0).toUpperCase() + jourSemaine.slice(1);

  return { date: partiesDate, heure: `${pad2(heure)}:${pad2(minute)}`, jour: jourCapitalise };
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

    // Fenetre de la semaine courante, calculee dans le fuseau de Paris
    const maintenant = new Date();
    const auj = formatterDateParis(maintenant);
    const joursOrdre = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const decalageDepuisLundi = joursOrdre.indexOf(auj.jour);
    const lundiDate = new Date(`${auj.date}T12:00:00`); // midi pour eviter tout souci de bascule DST
    lundiDate.setDate(lundiDate.getDate() - decalageDepuisLundi);
    const dimancheSuivant = new Date(lundiDate);
    dimancheSuivant.setDate(lundiDate.getDate() + 7);

    const evenements = [];

    Object.values(data).forEach((ev) => {
      if (ev.type !== 'VEVENT' || !ev.start || !ev.end) return;

      const debut = new Date(ev.start);
      const fin = new Date(ev.end);
      if (debut < lundiDate || debut >= dimancheSuivant) return; // hors semaine courante

      const infosDebut = formatterDateParis(debut);
      const infosFin = formatterDateParis(fin);

      const descriptionBrute = nettoyerHtml(versTexte(ev.description));
      const summaryBrut = versTexte(ev.summary);
      const texteComplet = `${summaryBrut} ${descriptionBrute}`;
      const statut = determinerStatut(texteComplet);

      const matiere = extraireChamp(descriptionBrute, 'Matière') || nettoyerMatiere(summaryBrut);
      const professeur = extraireChamp(descriptionBrute, 'Professeur');
      const salleDescription = extraireChamp(descriptionBrute, 'Salle');

      evenements.push({
        date: infosDebut.date,
        jour: infosDebut.jour,
        heure_debut: infosDebut.heure,
        heure_fin: infosFin.heure,
        matiere_nom: matiere,
        salle: versTexte(ev.location) || salleDescription,
        professeur: professeur,
        statut,
        commentaire: statut !== 'normal' ? nettoyerHtml(summaryBrut) : '',
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
      // Ne supprime que les evenements issus d'une synchro automatique
      // precedente : un marquage manuel (voir /statut-jour) est preserve.
      const placeholders = dates.map(() => '?').join(',');
      db.prepare(`DELETE FROM pronote_evenements WHERE date IN (${placeholders}) AND (commentaire IS NULL OR commentaire != 'Marque manuellement')`).run(...dates);
    }
    const insert = db.prepare(`
      INSERT INTO pronote_evenements (date, jour, heure_debut, heure_fin, matiere_nom, salle, professeur, statut, commentaire)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const dejaManuel = db.prepare(`SELECT 1 FROM pronote_evenements WHERE date = ? AND jour = ? AND heure_debut = ? AND heure_fin = ? AND commentaire = 'Marque manuellement'`);
    liste.forEach((e) => {
      // Un marquage manuel a priorite sur ce que Pronote renvoie pour ce meme creneau/jour
      if (dejaManuel.get(e.date, e.jour, e.heure_debut, e.heure_fin)) return;
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
