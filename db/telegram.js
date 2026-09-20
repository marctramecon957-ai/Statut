const db = require('./database');

// --- Configuration -----------------------------------------------------

function botToken() {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

function estConfigure() {
  return !!botToken();
}

async function botUsername() {
  const token = botToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    return data?.result?.username || null;
  } catch {
    return null;
  }
}

// --- Liaison compte <-> chat Telegram -----------------------------------

function genererCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Cree (ou reutilise) un code de liaison a 6 caracteres pour cet utilisateur.
function codePour(userId) {
  const existant = db.prepare('SELECT code FROM telegram_codes WHERE user_id = ?').get(userId);
  if (existant) return existant.code;
  let code;
  do {
    code = genererCode();
  } while (db.prepare('SELECT 1 FROM telegram_codes WHERE code = ?').get(code));
  db.prepare('INSERT INTO telegram_codes (user_id, code) VALUES (?, ?)').run(userId, code);
  return code;
}

function chatLiePour(userId) {
  return db.prepare('SELECT * FROM telegram_chats WHERE user_id = ?').get(userId) || null;
}

function tousLesChatsLies() {
  return db.prepare('SELECT * FROM telegram_chats').all();
}

function delierPour(userId) {
  db.prepare('DELETE FROM telegram_chats WHERE user_id = ?').run(userId);
}

function majSemaine(userId, semaine) {
  db.prepare('UPDATE telegram_chats SET semaine = ? WHERE user_id = ?').run(semaine, userId);
}

// --- Envoi ---------------------------------------------------------------

async function envoyerMessage(chatId, texte) {
  const token = botToken();
  if (!token) return { ok: false, message: "Le bot Telegram n'est pas configuré sur le serveur (TELEGRAM_BOT_TOKEN manquant)." };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texte }),
    });
    const data = await res.json();
    if (!data.ok) {
      // Chat supprimé / bot bloqué par l'utilisateur : on retire la liaison.
      if (data.error_code === 403) {
        db.prepare('DELETE FROM telegram_chats WHERE chat_id = ?').run(String(chatId));
      }
      return { ok: false, message: data.description || 'Erreur Telegram inconnue' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

// --- Dedup (memes clefs que push_envois, mais indexees par chat_id) ------

function dejaEnvoye(chatId, dateStr, cle) {
  return !!db.prepare('SELECT 1 FROM telegram_envois WHERE chat_id = ? AND date = ? AND cle = ?').get(String(chatId), dateStr, cle);
}

function marquerEnvoye(chatId, dateStr, cle) {
  db.prepare('INSERT OR IGNORE INTO telegram_envois (chat_id, date, cle) VALUES (?, ?, ?)').run(String(chatId), dateStr, cle);
}

// --- Polling des messages entrants (getUpdates) ---------------------------
// Le bot n'a pas de webhook (ça demanderait un domaine HTTPS stable dédié à
// configurer côté Telegram) : à la place, on interroge périodiquement
// l'API pour voir si quelqu'un a envoyé "/lier CODE" au bot, et on relie
// alors son chat_id au compte correspondant. Appelé par le même cron externe
// que les notifications.
async function traiterMessagesEntrants() {
  const token = botToken();
  if (!token) return { traites: 0 };

  const ligne = db.prepare('SELECT offset_id FROM telegram_offset WHERE id = 1').get();
  const offset = ligne ? ligne.offset_id : 0;

  let updates;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=0`);
    const data = await res.json();
    if (!data.ok) return { traites: 0, erreur: data.description };
    updates = data.result || [];
  } catch (err) {
    return { traites: 0, erreur: err.message };
  }

  let traites = 0;
  let dernierUpdateId = offset - 1;

  for (const update of updates) {
    dernierUpdateId = update.update_id;
    const message = update.message;
    const texte = message?.text?.trim() || '';
    const chatId = message?.chat?.id;
    if (!chatId || !texte) continue;

    const match = texte.match(/^\/(?:lier|start)\s+([A-Z0-9]{6})$/i);
    if (match) {
      const code = match[1].toUpperCase();
      const demande = db.prepare('SELECT user_id FROM telegram_codes WHERE code = ?').get(code);
      if (demande) {
        db.prepare(
          `INSERT INTO telegram_chats (user_id, chat_id, semaine) VALUES (?, ?, 'S1')
           ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id`
        ).run(demande.user_id, String(chatId));
        db.prepare('DELETE FROM telegram_codes WHERE code = ?').run(code);
        await envoyerMessage(chatId, "C'est lié ! Tu recevras désormais ici les notifications de ton emploi du temps. 🎉");
        traites++;
      } else {
        await envoyerMessage(chatId, "Ce code n'est pas valide ou a déjà été utilisé. Retourne dans l'app pour en générer un nouveau.");
      }
    } else if (texte === '/start') {
      await envoyerMessage(chatId, "Salut ! Pour lier ce chat à ton compte, récupère ton code dans l'app (bouton notifications Telegram) puis envoie-moi : /lier TONCODE");
    }
  }

  db.prepare('UPDATE telegram_offset SET offset_id = ? WHERE id = 1').run(dernierUpdateId + 1);
  return { traites };
}

module.exports = {
  estConfigure,
  botUsername,
  codePour,
  chatLiePour,
  tousLesChatsLies,
  delierPour,
  majSemaine,
  envoyerMessage,
  dejaEnvoye,
  marquerEnvoye,
  traiterMessagesEntrants,
};
