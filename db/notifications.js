const webpush = require('web-push');
const db = require('./database');
const { JOURS, maintenantParis, minutesDepuisDebutJournee, creneauxEffectifsDuJour } = require('./horaires');
const telegram = require('./telegram');

// Tolerance en minutes : le cron externe appelle cette route toutes les
// ~5 minutes, mais peut avoir du retard (services gratuits). On considere
// qu'un evenement "arrive maintenant" s'il est survenu dans les FENETRE_MIN
// dernieres minutes, pour ne rien manquer entre deux appels tout en ne
// notifiant qu'une seule fois (grace a push_envois).
const FENETRE_MIN = 15;

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
    return { ok: true };
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      // Abonnement expire ou revoque cote navigateur : on le supprime.
      db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(subscription.id);
    }
    return { ok: false, statusCode: err.statusCode, message: err.body || err.message };
  }
}

async function envoyerNotificationTest(userId) {
  const abonnements = configurerVapid()
    ? db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId)
    : [];

  let envoyees = 0;
  const erreurs = [];
  const confirmIds = [];
  for (const sub of abonnements) {
    const confirmId = `${sub.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    db.prepare('INSERT INTO push_confirmations (id, subscription_id) VALUES (?, ?)').run(confirmId, sub.id);
    const resultat = await envoyerPush(sub, {
      title: 'Notification de test',
      body: 'Si tu vois ceci, les notifications push fonctionnent 🎉',
      confirmId,
    });
    if (resultat.ok) {
      envoyees++;
      confirmIds.push(confirmId);
    } else {
      erreurs.push(`Push : statut ${resultat.statusCode || '?'} : ${resultat.message || 'erreur inconnue'}`);
    }
  }

  const telegramLie = telegram.chatLiePour(userId);
  let telegramOk = false;
  if (telegramLie) {
    const resultatTg = await telegram.envoyerMessage(telegramLie.chat_id, 'Notification de test 🎉\nSi tu vois ceci, les notifications Telegram fonctionnent.');
    if (resultatTg.ok) {
      telegramOk = true;
      envoyees++;
    } else {
      erreurs.push(`Telegram : ${resultatTg.message || 'erreur inconnue'}`);
    }
  }

  if (abonnements.length === 0 && !telegramLie) {
    return { envoyees: 0, erreurs: [], erreurGlobale: "Aucun moyen de notification n'est lié à ce compte (ni push, ni Telegram). Réactive-en un dans l'app." };
  }

  return { envoyees, erreurs, total: abonnements.length + (telegramLie ? 1 : 0), telegramOk, telegramLie: !!telegramLie, confirmIds };
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
    const { ok } = await envoyerPush(sub, { title: titre, body: corps, tag: `instant-${statut}` });
    if (ok) envoyees++;
  }

  const chatsTelegram = telegram
    .tousLesChatsLies()
    .filter((chat) => semaine === 'Toutes' || chat.semaine === semaine);
  for (const chat of chatsTelegram) {
    const { ok } = await telegram.envoyerMessage(chat.chat_id, `${titre}\n${corps}`);
    if (ok) envoyees++;
  }

  return { envoyees };
}

// Calcule, pour un jour/heure donnes, les 3 evenements (debut/fin/trou) a
// eventuellement notifier pour un ensemble de creneaux, sans envoyer.
function evenementsANotifier(cours, nowMin) {
  const evts = [];
  for (let i = 0; i < cours.length; i++) {
    const c = cours[i];
    const debutMin = minutesDepuisDebutJournee(c.debut);
    const finMin = minutesDepuisDebutJournee(c.fin);
    const suivant = cours[i + 1];
    const trouMin = suivant ? minutesDepuisDebutJournee(suivant.debut) - finMin : null;

    if (nowMin >= debutMin && nowMin < debutMin + FENETRE_MIN) {
      evts.push({ cle: `debut-${c.id}-${c.debut}`, titre: 'Ton cours commence', corps: `${c.matiere_nom} à ${c.debut}` });
    }

    if (nowMin >= finMin && nowMin < finMin + FENETRE_MIN && !(trouMin !== null && trouMin >= 60)) {
      const corps = suivant
        ? `${c.matiere_nom} se termine à ${c.fin}. Prochain cours : ${suivant.matiere_nom} à ${suivant.debut}.`
        : `${c.matiere_nom} se termine à ${c.fin}. Plus de cours aujourd'hui.`;
      evts.push({ cle: `fin-${c.id}-${c.fin}`, titre: 'Ton cours se termine', corps });
    }

    if (nowMin >= finMin && nowMin < finMin + FENETRE_MIN && trouMin !== null && trouMin >= 60) {
      const h = Math.floor(trouMin / 60);
      const m = trouMin % 60;
      const dureeTxt = m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
      evts.push({
        cle: `trou-${c.id}-${c.fin}`,
        titre: "Trou dans l'emploi du temps",
        corps: `${dureeTxt} de libre avant ${suivant.matiere_nom} à ${suivant.debut}.`,
      });
    }
  }
  return evts;
}

async function verifierEtEnvoyerNotifications() {
  const { jour, heureStr, dateStr } = maintenantParis();
  if (!jour || jour === 'Dimanche' || !JOURS.includes(jour)) {
    return { envoyees: 0, info: 'Pas de cours ce jour' };
  }
  const nowMin = minutesDepuisDebutJournee(heureStr);
  let envoyees = 0;

  if (configurerVapid()) {
    const abonnements = db.prepare('SELECT * FROM push_subscriptions').all();
    for (const sub of abonnements) {
      const cours = creneauxEffectifsDuJour(jour, dateStr, sub.semaine || 'S1');
      for (const evt of evenementsANotifier(cours, nowMin)) {
        if (!dejaEnvoye(sub.id, dateStr, evt.cle)) {
          const { ok } = await envoyerPush(sub, { title: evt.titre, body: evt.corps });
          if (ok) envoyees++;
          marquerEnvoye(sub.id, dateStr, evt.cle);
        }
      }
    }
  }

  for (const chat of telegram.tousLesChatsLies()) {
    const cours = creneauxEffectifsDuJour(jour, dateStr, chat.semaine || 'S1');
    for (const evt of evenementsANotifier(cours, nowMin)) {
      if (!telegram.dejaEnvoye(chat.chat_id, dateStr, evt.cle)) {
        const { ok } = await telegram.envoyerMessage(chat.chat_id, `${evt.titre}\n${evt.corps}`);
        if (ok) envoyees++;
        telegram.marquerEnvoye(chat.chat_id, dateStr, evt.cle);
      }
    }
  }

  return { envoyees };
}

function marquerPushRecu(confirmId) {
  db.prepare("UPDATE push_confirmations SET recu_at = CURRENT_TIMESTAMP WHERE id = ? AND recu_at IS NULL").run(confirmId);
}

function statutPushConfirm(confirmId) {
  const row = db.prepare('SELECT recu_at FROM push_confirmations WHERE id = ?').get(confirmId);
  return { recu: !!(row && row.recu_at) };
}

module.exports = { verifierEtEnvoyerNotifications, envoyerNotificationInstantanee, envoyerNotificationTest, vapidPublicKey, configurerVapid, marquerPushRecu, statutPushConfirm };
