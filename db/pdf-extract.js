// Extraction et analyse d'un emploi du temps depuis un PDF, via pdfjs-dist
let pdfjsLibPromise = null;

function chargerPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsLibPromise;
}

// Extrait le texte du PDF en reconstruisant les lignes selon la position
// verticale (Y) de chaque bloc de texte, pour conserver la structure du tableau.
async function extractLinesFromPdf(buffer) {
  const pdfjsLib = await chargerPdfjs();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
  });

  const pdfDocument = await loadingTask.promise;
  const lignes = [];

  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const contenu = await page.getTextContent();

    // Regroupe les items par position Y approximative (meme ligne visuelle)
    const groupes = [];
    contenu.items.forEach((item) => {
      const y = Math.round(item.transform[5]);
      let groupe = groupes.find((g) => Math.abs(g.y - y) <= 3);
      if (!groupe) {
        groupe = { y, items: [] };
        groupes.push(groupe);
      }
      groupe.items.push(item);
    });

    // Trie les lignes de haut en bas, et les mots de gauche a droite
    groupes.sort((a, b) => b.y - a.y);
    groupes.forEach((g) => {
      g.items.sort((a, b) => a.transform[4] - b.transform[4]);
      const texteLigne = g.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
      if (texteLigne) lignes.push(texteLigne);
    });
  }

  return lignes;
}

const JOURS_REGEX = /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i;
const HEURE_REGEX = /(\d{1,2})\s*[h:]\s*(\d{2})?\s*(?:-|–|à|a)\s*(\d{1,2})\s*[h:]\s*(\d{2})?/i;
const SALLE_REGEX = /salle\s*[:\-]?\s*([a-z0-9\-]+)/i;

function normaliserJour(mot) {
  const j = mot.toLowerCase();
  const map = {
    lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi',
    jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
  };
  return map[j] || null;
}

function formatHeure(h, m) {
  const heure = String(h).padStart(2, '0');
  const min = String(m || '00').padStart(2, '0');
  return `${heure}:${min}`;
}

// Analyse heuristique des lignes pour en deduire des creneaux probables.
// Ceci est une detection automatique "au mieux" : l'utilisateur peut corriger
// chaque ligne detectee avant de valider l'import.
function parseCreneauxFromLines(lignes) {
  const creneaux = [];
  let jourCourant = null;

  lignes.forEach((ligne) => {
    const matchJourSeul = ligne.trim().match(new RegExp(`^${JOURS_REGEX.source}$`, 'i'));
    const matchJourDebut = ligne.match(new RegExp(`^${JOURS_REGEX.source}`, 'i'));

    if (matchJourSeul) {
      jourCourant = normaliserJour(matchJourSeul[1]);
      return;
    }
    if (matchJourDebut) {
      jourCourant = normaliserJour(matchJourDebut[1]);
    }

    const matchHeure = ligne.match(HEURE_REGEX);
    if (!matchHeure) return;

    const heure_debut = formatHeure(matchHeure[1], matchHeure[2]);
    const heure_fin = formatHeure(matchHeure[3], matchHeure[4]);

    let reste = ligne.replace(matchHeure[0], ' ');
    if (matchJourDebut) reste = reste.replace(matchJourDebut[0], ' ');

    let salle = '';
    const matchSalle = reste.match(SALLE_REGEX);
    if (matchSalle) {
      salle = matchSalle[1];
      reste = reste.replace(matchSalle[0], ' ');
    }

    const matiere_nom = reste.replace(/\s+/g, ' ').trim();

    creneaux.push({
      jour: jourCourant || 'Lundi',
      heure_debut,
      heure_fin,
      matiere_nom: matiere_nom || 'A completer',
      salle,
      professeur: '',
      semaine: 'Toutes',
    });
  });

  return creneaux;
}

async function analyserPdf(buffer) {
  const lignes = await extractLinesFromPdf(buffer);
  const texte = lignes.join('\n');
  const creneaux = parseCreneauxFromLines(lignes);
  return { texte, creneaux };
}

module.exports = { analyserPdf };
