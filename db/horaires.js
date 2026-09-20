const db = require('./database');

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const HEURE_DEBUT_JOURNEE = 8;

// Heure/date "maintenant" en fuseau Europe/Paris, quel que soit le fuseau du serveur.
function maintenantParis() {
  const maintenant = new Date();
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(maintenant);

  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const weekdayFr = get('weekday'); // ex: "lundi"
  const heure = get('hour');
  const minute = get('minute');

  const joursMap = {
    lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi',
    jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
  };
  const jour = joursMap[weekdayFr.toLowerCase()] || null;

  // Date YYYY-MM-DD en fuseau Paris
  const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(maintenant);

  return { jour, heureStr: `${heure}:${minute}`, dateStr: dateParts };
}

function minutesDepuisDebutJournee(heureStr) {
  const [h, m] = heureStr.split(':').map(Number);
  return (h - HEURE_DEBUT_JOURNEE) * 60 + m;
}

function creneauxEffectifsDuJour(jour, dateStr, semaineSouhaitee) {
  const creneaux = db
    .prepare(
      `SELECT c.id, c.heure_debut, c.heure_fin, c.semaine, m.nom AS matiere_nom
       FROM creneaux c LEFT JOIN matieres m ON m.id = c.matiere_id
       WHERE c.jour = ?`
    )
    .all(jour)
    .filter((c) => c.semaine === 'Toutes' || c.semaine === semaineSouhaitee);

  const evenements = db
    .prepare('SELECT * FROM pronote_evenements WHERE date = ? AND jour = ?')
    .all(dateStr, jour);

  const trouverEvt = (heure_debut, heure_fin) =>
    evenements.find((e) => e.heure_debut === heure_debut && e.heure_fin === heure_fin) || null;

  return creneaux
    .map((c) => {
      const evt = trouverEvt(c.heure_debut, c.heure_fin);
      if (evt && evt.statut === 'annule') return null;
      let debut = c.heure_debut;
      let fin = c.heure_fin;
      if (evt && evt.statut === 'deplace' && evt.nouvelle_heure_debut) {
        debut = evt.nouvelle_heure_debut;
        fin = evt.nouvelle_heure_fin;
      }
      return { id: c.id, matiere_nom: c.matiere_nom || 'Sans matière', debut, fin };
    })
    .filter(Boolean)
    .sort((a, b) => a.debut.localeCompare(b.debut));
}

module.exports = { JOURS, HEURE_DEBUT_JOURNEE, maintenantParis, minutesDepuisDebutJournee, creneauxEffectifsDuJour };
