// Extraction et analyse d'un emploi du temps depuis un PDF, via pdfjs-dist.
// Le parsing est base sur la position (X/Y) de chaque bloc de texte dans le
// PDF pour reconstruire la grille (jours en colonnes, heures en lignes,
// semestres S1/S2 en sous-colonnes). C'est une detection "au mieux" :
// le tableau de revision cote client permet de corriger chaque ligne.
let pdfjsLibPromise = null;

function chargerPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsLibPromise;
}

const JOURS_NOMS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const JOURS_LABELS = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi',
  vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
};

function normaliserSemestre(s) {
  const t = s.trim();
  if (t === 'S1' || t.toLowerCase() === 'semestre 1') return 'S1';
  if (t === 'S2' || t.toLowerCase() === 'semestre 2') return 'S2';
  return null;
}

function estLigneProf(l) {
  return /(?:^|[\s,])[A-ZÀ-Ÿ]\.$/.test(l.trim());
}

function formatHeure(h) {
  return String(h).padStart(2, '0') + ':00';
}

// Extrait un texte brut lisible (regroupe par ligne visuelle), pour reference
// dans l'interface d'import.
function construireTexteBrut(items) {
  const groupes = [];
  items.forEach((item) => {
    const y = Math.round(item.y);
    let g = groupes.find((g) => Math.abs(g.y - y) <= 3);
    if (!g) { g = { y, items: [] }; groupes.push(g); }
    g.items.push(item);
  });
  groupes.sort((a, b) => b.y - a.y);
  return groupes
    .map((g) => g.items.sort((a, b) => a.x - b.x).map((i) => i.str).join(' '))
    .filter(Boolean)
    .join('\n');
}

// Analyse la grille : tente de detecter jour / heure / matiere / salle /
// professeur / semestre pour chaque cours visible dans le tableau.
function analyserGrille(items) {
  const dayItems = items.filter((it) => JOURS_NOMS.includes(it.str.toLowerCase()));
  if (dayItems.length === 0) return []; // format non reconnu comme grille

  const jours = dayItems
    .map((it) => ({ jour: JOURS_LABELS[it.str.toLowerCase()], x: it.x }))
    .sort((a, b) => a.x - b.x);

  const hourItems = items.filter((it) => /^\d{1,2}h\d{2}$/.test(it.str) && it.x < 60);
  const rows = hourItems.map((it) => ({ h: parseInt(it.str, 10), y: it.y })).sort((a, b) => b.y - a.y);
  if (rows.length < 2) return [];

  const markers = items
    .filter((it) => normaliserSemestre(it.str))
    .map((it) => ({ sem: normaliserSemestre(it.str), x: it.x, y: it.y }));

  const exclus = new Set([...dayItems.map((i) => i.str), ...hourItems.map((i) => i.str), ...markers.map((i) => i.str)]);
  const contenu = items.filter((it) =>
    !exclus.has(it.str) &&
    !JOURS_NOMS.includes(it.str.toLowerCase()) &&
    !/^\d{1,2}h\d{2}$/.test(it.str) &&
    !normaliserSemestre(it.str) &&
    !/index education/i.test(it.str) &&
    !/^l\.p\./i.test(it.str) &&
    it.y < rows[0].y + 20
  );

  const bornes = jours.map((j, i) => ({
    jour: j.jour,
    gauche: i === 0 ? -Infinity : (jours[i - 1].x + j.x) / 2,
    droite: i === jours.length - 1 ? Infinity : (j.x + jours[i + 1].x) / 2,
  }));
  function trouverJour(x) {
    const b = bornes.find((b) => x >= b.gauche && x < b.droite);
    return b ? b.jour : jours[jours.length - 1].jour;
  }

  function indexLigneHeure(y) {
    for (let i = 0; i < rows.length - 1; i++) {
      if (y <= rows[i].y + 2 && y > rows[i + 1].y) return i;
    }
    return y > rows[0].y ? 0 : rows.length - 1;
  }

  const parJour = {};
  contenu.forEach((it) => {
    const j = trouverJour(it.x);
    (parJour[j] = parJour[j] || []).push(it);
  });

  const creneaux = [];

  Object.entries(parJour).forEach(([jour, itemsJour]) => {
    const xs = [...new Set(itemsJour.map((i) => i.x))].sort((a, b) => a - b);
    const voies = [];
    let voieCourante = [xs[0]];
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] - xs[i - 1] > 30) { voies.push(voieCourante); voieCourante = []; }
      voieCourante.push(xs[i]);
    }
    if (voieCourante.length) voies.push(voieCourante);

    voies.forEach((voieXs) => {
      const itemsVoie = itemsJour.filter((i) => voieXs.includes(i.x)).sort((a, b) => b.y - a.y);

      const chips = [];
      let chipCourant = [];
      for (let i = 0; i < itemsVoie.length; i++) {
        if (chipCourant.length && chipCourant[chipCourant.length - 1].y - itemsVoie[i].y > 20) {
          chips.push(chipCourant);
          chipCourant = [];
        }
        chipCourant.push(itemsVoie[i]);
      }
      if (chipCourant.length) chips.push(chipCourant);

      chips.forEach((chip) => {
        const ys = chip.map((c) => c.y);
        const yTop = Math.max(...ys);
        const yBottom = Math.min(...ys);
        const startIdx = indexLigneHeure(yTop);
        const endIdx = indexLigneHeure(yBottom);
        const heure_debut = formatHeure(rows[startIdx].h);
        const heure_fin = formatHeure(rows[endIdx + 1] ? rows[endIdx + 1].h : rows[endIdx].h + 1);

        const lignes = chip.map((c) => c.str);
        const matiere_nom = lignes[0] || 'A completer';
        let professeur = '';
        const salleParts = [];
        lignes.slice(1).forEach((l) => {
          if (/^\[.*\]$/.test(l)) return; // ignore le tag de classe, ex: [1MELECP.2]
          if (estLigneProf(l)) professeur = professeur ? professeur + ', ' + l : l;
          else salleParts.push(l);
        });

        const candidatsMarker = markers
          .filter((m) => trouverJour(m.x) === jour && m.y < yBottom + 3 && yBottom - m.y < 25)
          .sort((a, b) => Math.abs(a.x - chip[0].x) - Math.abs(b.x - chip[0].x));
        const semaine = candidatsMarker.length ? candidatsMarker[0].sem : 'Toutes';

        creneaux.push({ jour, heure_debut, heure_fin, matiere_nom, professeur, salle: salleParts.join(' / '), semaine });
      });
    });
  });

  const creneauxFiltres = creneaux.filter((c) => c.matiere_nom && /\p{L}/u.test(c.matiere_nom));
  creneauxFiltres.sort((a, b) => a.jour.localeCompare(b.jour) || a.heure_debut.localeCompare(b.heure_debut));
  return creneauxFiltres;
}

async function analyserPdf(buffer) {
  const pdfjsLib = await chargerPdfjs();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdfDocument = await loadingTask.promise;

  let tousLesItems = [];
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const contenu = await page.getTextContent();
    const items = contenu.items
      .map((it) => ({ str: (it.str || '').trim(), x: it.transform[4], y: it.transform[5] }))
      .filter((it) => it.str.length > 0);
    tousLesItems = tousLesItems.concat(items);
  }

  const texte = construireTexteBrut(tousLesItems);
  const creneaux = analyserGrille(tousLesItems);

  return { texte, creneaux };
}

module.exports = { analyserPdf };
