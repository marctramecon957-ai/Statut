const webpush = require('web-push');
const db = require('./database');

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const HEURE_DEBUT_JOURNEE = 8;

// Tolerance en minutes : le cron externe appelle cette route toutes les
// ~5 minutes, donc on considere qu'un evenement "arrive maintenant" s'il est
// survenu dans les FENETRE_MIN dernieres minutes, pour ne rien manquer entre
// deux appels tout en ne notifiant qu'une seule fois (grace a push_envois).
const FENETRE_MIN = 7;

let vapideConfigure = false;
function configurerVapid() {
  if (vapideConfigure) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:contact@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapideConfigure = true;
  return true;
}

function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

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

function dejaEnvoye(subscriptionId, dateStr, cle) {
  return !!db
    .prepare('SELECT 1 FROM push_envois WHERE subscription_id = ? AND date = ? AND cle = ?')
    .get(subscriptionId, dateStr, cle);
}

function marquerEnvoye(subscriptionId, dateStr, cle) {
  db.prepare('INSERT OR IGNORE INTO push_envois (subscription_id, date, cle) VALUES (?, ?, ?)').run(
    subscriptionId,
    dateStr,
    cle
  );
}

async function envoyerPush(subscription, payload) {
  const pushConfig = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
  try {
    await webpush.sendNotification(pushConfig, JSON.stringify(payload));
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      // Abonnement expire ou revoque cote navigateur : on le supprime.
      db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(subscription.id);
    }
    return false;
  }
}

async function envoyerNotificationInstantanee({ jour, dateStr, semaine, statut, matiere_nom, heure_debut, heure_fin, nouvelle_heure_debut, nouvelle_heure_fin }) {
  if (!configurerVapid()) return { envoyees: 0 };

  const { dateStr: aujourdhuiStr } = maintenantParis();
  const quandTxt = dateStr === aujourdhuiStr ? "aujourd'hui" : jour;

  let titre;
  let corps;
  if (statut === 'annule') {
    titre = 'Cours annulé';
    corps = `${matiere_nom} ${quandTxt} à ${heure_debut} est annulé.`;
  } else if (statut === 'deplace') {
    titre = 'Cours déplacé';
    corps = `${matiere_nom} ${quandTxt} est déplacé de ${heure_debut} à ${nouvelle_heure_debut}.`;
  } else if (statut === 'modifie') {
    titre = 'Cours modifié';
    corps = `${matiere_nom} ${quandTxt} à ${heure_debut} a été modifié.`;
  } else {
    titre = 'Cours rétabli';
    corps = `${matiere_nom} ${quandTxt} à ${heure_debut} redevient normal.`;
  }

  const abonnements = db
    .prepare('SELECT * FROM push_subscriptions')
    .all()
    .filter((sub) => semaine === 'Toutes' || sub.semaine === semaine);

  let envoyees = 0;
  for (const sub of abonnements) {
    const ok = await envoyerPush(sub, { title: titre, body: corps, tag: `instant-${statut}` });
    if (ok) envoyees++;
  }
  return { envoyees };
}

async function verifierEtEnvoyerNotifications() {
  if (!configurerVapid()) {
    return { envoyees: 0, erreur: 'VAPID non configure' };
  }

  const { jour, heureStr, dateStr } = maintenantParis();
  if (!jour || jour === 'Dimanche' || !JOURS.includes(jour)) {
    return { envoyees: 0, info: 'Pas de cours ce jour' };
  }
  const nowMin = minutesDepuisDebutJournee(heureStr);

  const abonnements = db.prepare('SELECT * FROM push_subscriptions').all();
  let envoyees = 0;

  for (const sub of abonnements) {
    const cours = creneauxEffectifsDuJour(jour, dateStr, sub.semaine || 'S1');

    for (let i = 0; i < cours.length; i++) {
      const c = cours[i];
      const debutMin = minutesDepuisDebutJournee(c.debut);
      const finMin = minutesDepuisDebutJournee(c.fin);

      // Debut de cours
      if (nowMin >= debutMin && nowMin < debutMin + FENETRE_MIN) {
        const cle = `debut-${c.id}-${c.debut}`;
        if (!dejaEnvoye(sub.id, dateStr, cle)) {
          const ok = await envoyerPush(sub, {
            title: 'Ton cours commence',
            body: `${c.matiere_nom} à ${c.debut}`,
          });
          if (ok) envoyees++;
          marquerEnvoye(sub.id, dateStr, cle);
        }
      }

      // Trou avant le prochain cours
      if (nowMin >= finMin && nowMin < finMin + FENETRE_MIN) {
        const suivant = cours[i + 1];
        if (suivant) {
          const trouMin = minutesDepuisDebutJournee(suivant.debut) - finMin;
          if (trouMin >= 60) {
            const cle = `fin-${c.id}-${c.fin}`;
            if (!dejaEnvoye(sub.id, dateStr, cle)) {
              const h = Math.floor(trouMin / 60);
              const m = trouMin % 60;
              const dureeTxt = m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
              const ok = await envoyerPush(sub, {
                title: "Trou dans l'emploi du temps",
                body: `${dureeTxt} avant ${suivant.matiere_nom} à ${suivant.debut}`,
              });
              if (ok) envoyees++;
              marquerEnvoye(sub.id, dateStr, cle);
            }
          }
        }
      }
    }
  }

  return { envoyees };
}

module.exports = { verifierEtEnvoyerNotifications, envoyerNotificationInstantanee, vapidPublicKey, configurerVapid };
