const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// Génère les créneaux horaires de 8h à 18h par pas de 30 min pour les selects admin
function genererHeures() {
  const heures = [];
  for (let h = 8; h <= 18; h++) {
    for (const m of [0, 30]) {
      if (h === 18 && m === 30) continue;
      heures.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return heures;
}

let state = {
  user: null,
  matieres: [],
  creneaux: [],
  semaineActive: 'S1',
  jourActif: 'Lundi',
};

const views = {
  login: document.getElementById('view-login'),
  forceChange: document.getElementById('view-force-change'),
  changePwd: document.getElementById('view-change-pwd'),
  schedule: document.getElementById('view-schedule'),
  admin: document.getElementById('view-admin'),
};

function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[name].classList.remove('hidden');
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

// ---------- Bootstrap ----------
async function init() {
  try {
    const { user } = await api('/api/me');
    state.user = user;
  } catch (e) {
    state.user = null;
  }

  if (!state.user) {
    showView('login');
    updateUserBar();
    hideSplash();
    return;
  }

  updateUserBar();
  await loadDataAndShowSchedule();
  hideSplash();
}

function hideSplash() {
  const splash = document.getElementById('splashScreen');
  if (!splash) return;
  splash.classList.add('splash-hidden');
  setTimeout(() => splash.remove(), 400);
}

function updateUserBar() {
  const bar = document.getElementById('userBar');
  const label = document.getElementById('userLabel');
  const adminLink = document.getElementById('btnAdminLink');
  if (state.user) {
    bar.classList.remove('hidden');
    label.textContent = `${state.user.username} (${state.user.role === 'admin' ? 'admin' : 'élève'})`;
    if (state.user.role === 'admin') adminLink.classList.remove('hidden');
    else adminLink.classList.add('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

async function loadDataAndShowSchedule() {
  const [matieres, creneaux] = await Promise.all([
    api('/api/matieres'),
    api('/api/creneaux'),
  ]);
  state.matieres = matieres;
  state.creneaux = creneaux;
  syncWeekToggleUI();
  renderSchedule();
  showView('schedule');
  chargerEvenementsPronote();
  mettreAJourBoutonNotif();
}

// ---- Pronote : evenements de la semaine reelle en cours (annulations, etc.) ----
state.pronoteEvenements = [];

async function chargerEvenementsPronote() {
  try {
    state.pronoteEvenements = await api('/api/pronote-evenements');
  } catch (e) {
    state.pronoteEvenements = [];
  }
  renderSchedule();
}

// Calcule la date reelle (YYYY-MM-DD) du jour donne pour la semaine en cours
function dateReelleDuJour(jour) {
  const indexJour = JOURS.indexOf(jour); // 0=Lundi ... 5=Samedi
  if (indexJour === -1) return null;
  const aujourdhui = new Date();
  const jourSemaineActuel = (aujourdhui.getDay() + 6) % 7; // 0=lundi
  const lundi = new Date(aujourdhui);
  lundi.setDate(aujourdhui.getDate() - jourSemaineActuel);
  const cible = new Date(lundi);
  cible.setDate(lundi.getDate() + indexJour);
  return cible.toISOString().slice(0, 10);
}

function trouverEvenementPronote(jour, heure_debut, heure_fin) {
  const date = dateReelleDuJour(jour);
  if (!date) return null;
  return state.pronoteEvenements.find(e =>
    e.date === date && e.heure_debut === heure_debut && e.heure_fin === heure_fin
  ) || null;
}

// ---------- LOGIN ----------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');

  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    state.user = { username, role: data.role };
    updateUserBar();

    if (data.mustChangePassword) {
      showView('forceChange');
    } else {
      await loadDataAndShowSchedule();
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ---------- FORCE CHANGE PASSWORD ----------
document.getElementById('forceChangeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p1 = document.getElementById('fcNewPassword').value;
  const p2 = document.getElementById('fcConfirmPassword').value;
  const errEl = document.getElementById('fcError');
  errEl.classList.add('hidden');

  if (p1 !== p2) {
    errEl.textContent = 'Les mots de passe ne correspondent pas.';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    await api('/api/change-password', { method: 'POST', body: JSON.stringify({ newPassword: p1 }) });
    await loadDataAndShowSchedule();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ---------- CHANGE PASSWORD (volontaire) ----------
document.getElementById('btnChangePwd').addEventListener('click', () => {
  document.getElementById('cpError').classList.add('hidden');
  document.getElementById('cpSuccess').classList.add('hidden');
  document.getElementById('changePwdForm').reset();
  showView('changePwd');
});

document.getElementById('cpCancel').addEventListener('click', () => showView('schedule'));

document.getElementById('changePwdForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const currentPassword = document.getElementById('cpCurrent').value;
  const newPassword = document.getElementById('cpNew').value;
  const errEl = document.getElementById('cpError');
  const okEl = document.getElementById('cpSuccess');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  try {
    await api('/api/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
    okEl.textContent = 'Mot de passe mis à jour.';
    okEl.classList.remove('hidden');
    setTimeout(() => showView('schedule'), 1200);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ---------- LOGOUT ----------
document.getElementById('btnLogout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  state.user = null;
  updateUserBar();
  showView('login');
});

// ---------- ADMIN LINK ----------
document.getElementById('btnAdminLink').addEventListener('click', async (e) => {
  e.preventDefault();
  await loadAdminView();
  showView('admin');
});

// ---------- TOGGLE SEMAINE 1 / SEMAINE 2 ----------
const semaineSauvegardee = localStorage.getItem('semaineActive');
if (semaineSauvegardee === 'S1' || semaineSauvegardee === 'S2') {
  state.semaineActive = semaineSauvegardee;
}

document.getElementById('weekToggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.week-btn');
  if (!btn) return;
  state.semaineActive = btn.dataset.week;
  localStorage.setItem('semaineActive', state.semaineActive);
  document.querySelectorAll('.week-btn').forEach(b => b.classList.toggle('active', b === btn));
  renderSchedule();
  mettreAJourSemaineAbonnement();
});

// Si l'utilisateur a deja active les notifications, garde son abonnement a
// jour avec la semaine choisie (S1/S2) pour que le serveur sache quels cours lui notifier.
async function mettreAJourSemaineAbonnement() {
  try {
    const abonnement = await abonnementPushActuel();
    if (abonnement) {
      await api('/api/push-subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscription: abonnement.toJSON(), semaine: state.semaineActive }),
      });
    }
  } catch (e) { /* pas grave si ca echoue */ }
  try {
    await api('/api/telegram/semaine', {
      method: 'POST',
      body: JSON.stringify({ semaine: state.semaineActive }),
    });
  } catch (e) { /* pas grave si pas lie / pas configure */ }
}

function syncWeekToggleUI() {
  document.querySelectorAll('.week-btn').forEach(b => b.classList.toggle('active', b.dataset.week === state.semaineActive));
}

// ================= AFFICHAGE EMPLOI DU TEMPS (FRISE) =================
const HEURE_DEBUT_JOURNEE = 8; // 8h
const HEURE_FIN_JOURNEE = 18;  // 18h
const HEURES_LABELS = ['8h', '10h', '12h', '14h', '16h', '18h'];

function creneauxSemaine() {
  return state.creneaux.filter(c => c.semaine === 'Toutes' || c.semaine === state.semaineActive);
}

function minutesDepuisDebutJournee(heureStr) {
  const [h, m] = heureStr.split(':').map(Number);
  return (h - HEURE_DEBUT_JOURNEE) * 60 + m;
}

function renderSchedule() {
  const container = document.getElementById('timelineContainer');
  container.innerHTML = '';

  const creneaux = creneauxSemaine();
  const joursAAfficher = state.jourActif === 'Semaine' ? JOURS : [state.jourActif];

  const scroll = document.createElement('div');
  scroll.className = 'timeline-scroll';

  joursAAfficher.forEach(jour => {
    const creneauxJour = creneaux.filter(c => c.jour === jour);
    const dayWrap = document.createElement('div');
    dayWrap.className = 'timeline-day-wrap';
    dayWrap.style.flex = state.jourActif === 'Semaine' ? '1' : 'none';
    dayWrap.style.width = state.jourActif === 'Semaine' ? 'auto' : '100%';

    let html = '';
    if (state.jourActif === 'Semaine') {
      html += `<div class="timeline-day-label">${jour}</div>`;
    }

    html += '<div class="timeline-day">';
    if (jour === joursAAfficher[0]) {
      html += `<div class="timeline-hours">${HEURES_LABELS.map(h => `<span>${h}</span>`).join('')}</div>`;
    }
    html += '<div class="timeline-track" style="height:360px;">';

    const journeeMin = (HEURE_FIN_JOURNEE - HEURE_DEBUT_JOURNEE) * 60;
    creneauxJour.forEach(c => {
      const evt = trouverEvenementPronote(c.jour, c.heure_debut, c.heure_fin);

      if (evt && evt.statut === 'deplace' && evt.nouvelle_heure_debut && evt.nouvelle_heure_fin) {
        // Barre d'origine : barree, en pointilles, pour montrer que le cours n'a pas lieu a cette heure-la
        const topPctOrig = (minutesDepuisDebutJournee(c.heure_debut) / journeeMin) * 100;
        const heightPctOrig = ((minutesDepuisDebutJournee(c.heure_fin) - minutesDepuisDebutJournee(c.heure_debut)) / journeeMin) * 100;
        const infoOrig = `${c.matiere_nom || 'Sans matière'} — Déplacé à ${evt.nouvelle_heure_debut} - ${evt.nouvelle_heure_fin}`;
        html += `<div class="time-bar deplace-origine" data-id="${c.id}" title="${escapeHtml(infoOrig)}" style="top:${topPctOrig}%; height:${Math.max(heightPctOrig, 3.5)}%;"><span class="time-bar-label">${escapeHtml(c.matiere_nom || 'Sans matière')}</span></div>`;

        // Barre au nouvel horaire : c'est la, en vrai, que le cours a lieu
        const topPctNew = (minutesDepuisDebutJournee(evt.nouvelle_heure_debut) / journeeMin) * 100;
        const heightPctNew = ((minutesDepuisDebutJournee(evt.nouvelle_heure_fin) - minutesDepuisDebutJournee(evt.nouvelle_heure_debut)) / journeeMin) * 100;
        const salleAffichee = evt.nouvelle_salle || c.salle;
        const infoNew = [c.matiere_nom || 'Sans matière', `${evt.nouvelle_heure_debut} - ${evt.nouvelle_heure_fin}`, salleAffichee ? `Salle ${salleAffichee}` : '', c.professeur || '', 'Cours déplacé'].filter(Boolean).join(' — ');
        html += `<div class="time-bar deplace-nouveau" data-id="${c.id}" data-deplace="1" title="${escapeHtml(infoNew)}" style="top:${topPctNew}%; height:${Math.max(heightPctNew, 3.5)}%;"><span class="time-bar-label">${escapeHtml(c.matiere_nom || 'Sans matière')} (déplacé)</span></div>`;
        return;
      }

      const topPct = (minutesDepuisDebutJournee(c.heure_debut) / journeeMin) * 100;
      const heightPct = ((minutesDepuisDebutJournee(c.heure_fin) - minutesDepuisDebutJournee(c.heure_debut)) / journeeMin) * 100;
      const classeStatut = evt && evt.statut === 'annule' ? ' annule' : (evt && evt.statut === 'modifie' ? ' modifie' : '');
      const label = evt && evt.statut === 'annule' ? 'Cours annulé' : (evt && evt.statut === 'modifie' ? 'Cours modifié' : '');
      const infoBulle = [c.matiere_nom || 'Sans matière', `${c.heure_debut} - ${c.heure_fin}`, c.salle ? `Salle ${c.salle}` : '', c.professeur || '', label].filter(Boolean).join(' — ');
      html += `<div class="time-bar${classeStatut}" data-id="${c.id}" title="${escapeHtml(infoBulle)}" style="top:${topPct}%; height:${Math.max(heightPct, 3.5)}%;">${label ? `<span class="time-bar-label">${label}</span>` : ''}</div>`;
    });

    html += '</div></div>';
    dayWrap.innerHTML = html;
    scroll.appendChild(dayWrap);
  });

  container.appendChild(scroll);

  if (creneaux.filter(c => joursAAfficher.includes(c.jour)).length === 0) {
    const empty = document.createElement('p');
    empty.className = 'timeline-empty';
    empty.textContent = "Aucun créneau n'a encore été ajouté.";
    container.appendChild(empty);
  }

  // Gestion du clic sur une barre : ouvrir la fenêtre de détail
  container.querySelectorAll('.time-bar').forEach(bar => {
    bar.addEventListener('click', (e) => {
      e.stopPropagation();
      const c = creneaux.find(x => String(x.id) === bar.dataset.id);
      if (!c) return;
      ouvrirFenetreCours(c);
    });
  });
}

function ouvrirFenetreCours(c) {
  const overlay = document.getElementById('coursModal');
  document.getElementById('coursModalMatiere').textContent = c.matiere_nom || 'Sans matière';

  const statutLigne = document.getElementById('coursModalStatut');
  const salleLigne = document.getElementById('coursModalSalle');
  const evt = trouverEvenementPronote(c.jour, c.heure_debut, c.heure_fin);

  if (evt && evt.statut === 'deplace' && evt.nouvelle_heure_debut) {
    document.getElementById('coursModalHoraire').textContent = `${evt.nouvelle_heure_debut} - ${evt.nouvelle_heure_fin}`;
    statutLigne.textContent = `Déplacé — initialement ${c.heure_debut} - ${c.heure_fin}`;
    statutLigne.className = 'cours-modal-statut deplace';
    statutLigne.classList.remove('hidden');
    const salleAffichee = evt.nouvelle_salle || c.salle;
    if (salleAffichee) { salleLigne.textContent = `Salle ${salleAffichee}`; salleLigne.classList.remove('hidden'); }
    else { salleLigne.classList.add('hidden'); }
  } else {
    document.getElementById('coursModalHoraire').textContent = `${c.heure_debut} - ${c.heure_fin}`;
    if (evt && evt.statut === 'annule') {
      statutLigne.textContent = 'Cours annulé';
      statutLigne.className = 'cours-modal-statut annule';
      statutLigne.classList.remove('hidden');
    } else if (evt && evt.statut === 'modifie') {
      statutLigne.textContent = evt.commentaire ? `Modifié — ${evt.commentaire}` : 'Cours modifié';
      statutLigne.className = 'cours-modal-statut modifie';
      statutLigne.classList.remove('hidden');
    } else {
      statutLigne.classList.add('hidden');
    }
    if (c.salle) { salleLigne.textContent = `Salle ${c.salle}`; salleLigne.classList.remove('hidden'); }
    else { salleLigne.classList.add('hidden'); }
  }

  const profLigne = document.getElementById('coursModalProf');
  if (c.professeur) { profLigne.textContent = c.professeur; profLigne.classList.remove('hidden'); }
  else { profLigne.classList.add('hidden'); }

  overlay.classList.remove('hidden');
}

document.getElementById('coursModalClose').addEventListener('click', () => {
  document.getElementById('coursModal').classList.add('hidden');
});
document.getElementById('coursModal').addEventListener('click', (e) => {
  if (e.target.id === 'coursModal') document.getElementById('coursModal').classList.add('hidden');
});

document.getElementById('dayTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.day-tab');
  if (!btn) return;
  state.jourActif = btn.dataset.day;
  document.querySelectorAll('.day-tab').forEach(b => b.classList.toggle('active', b === btn));
  renderSchedule();
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ================= ADMIN =================
async function loadAdminView() {
  const [matieres, creneaux, users] = await Promise.all([
    api('/api/matieres'),
    api('/api/creneaux'),
    api('/api/admin/users'),
  ]);
  state.matieres = matieres;
  state.creneaux = creneaux;
  state.users = users;

  renderMatiereList();
  renderMatiereOptions();
  renderUserList();
  renderCreneauAdminTable();
  renderAdminTimeline();
  setupHeureSelects();
  chargerStatutPronote();
}

// ================= FRISE ADMIN : GLISSER-DEPOSER POUR DEPLACER =================
function jourReelAujourdhui() {
  const idx = (new Date().getDay() + 6) % 7; // 0=lundi
  return JOURS[idx] || 'Lundi';
}

function renderAdminTimeline() {
  const container = document.getElementById('adminTimelineContainer');
  const labelEl = document.getElementById('adminTimelineDayLabel');
  if (!container) return;
  container.innerHTML = '';

  const jour = jourReelAujourdhui();
  if (labelEl) labelEl.textContent = jour;

  const creneauxJour = creneauxSemaine().filter(c => c.jour === jour);
  const journeeMin = (HEURE_FIN_JOURNEE - HEURE_DEBUT_JOURNEE) * 60;

  const dayWrap = document.createElement('div');
  dayWrap.className = 'timeline-day-wrap';
  dayWrap.style.width = '100%';

  let html = `<div class="timeline-day"><div class="timeline-hours">${HEURES_LABELS.map(h => `<span>${h}</span>`).join('')}</div>`;
  html += `<div class="timeline-track" id="adminTimelineTrack" style="height:420px;">`;

  creneauxJour.forEach(c => {
    const evt = trouverEvenementPronote(c.jour, c.heure_debut, c.heure_fin);
    const verrouille = !!(evt && evt.statut === 'deplace' && evt.commentaire !== 'Marque manuellement');

    let debutAffiche = c.heure_debut;
    let finAffiche = c.heure_fin;
    let classeStatut = '';
    if (evt && evt.statut === 'deplace' && evt.nouvelle_heure_debut) {
      debutAffiche = evt.nouvelle_heure_debut;
      finAffiche = evt.nouvelle_heure_fin;
      classeStatut = ' modifie';
    } else if (evt && evt.statut === 'annule') {
      classeStatut = ' annule';
    } else if (evt && evt.statut === 'modifie') {
      classeStatut = ' modifie';
    }

    const topPct = (minutesDepuisDebutJournee(debutAffiche) / journeeMin) * 100;
    const heightPct = ((minutesDepuisDebutJournee(finAffiche) - minutesDepuisDebutJournee(debutAffiche)) / journeeMin) * 100;
    const classeDrag = verrouille ? ' verrouille' : ' draggable';
    const titre = `${c.matiere_nom || 'Sans matière'} — ${debutAffiche} - ${finAffiche}${verrouille ? ' (déplacé automatiquement, non modifiable ici)' : ''}`;

    html += `<div class="time-bar${classeStatut}${classeDrag}" data-id="${c.id}" data-debut="${c.heure_debut}" data-fin="${c.heure_fin}" data-debut-effectif="${debutAffiche}" data-fin-effectif="${finAffiche}" data-verrouille="${verrouille ? '1' : '0'}" title="${escapeHtml(titre)}" style="top:${topPct}%; height:${Math.max(heightPct, 3.5)}%;"><span class="time-bar-label">${escapeHtml(c.matiere_nom || 'Sans matière')}</span></div>`;
  });

  html += '</div></div>';
  dayWrap.innerHTML = html;
  container.appendChild(dayWrap);

  if (creneauxJour.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'timeline-empty';
    empty.textContent = "Aucun créneau aujourd'hui.";
    container.appendChild(empty);
  }

  initDragCreneauxAdmin();
}

function initDragCreneauxAdmin() {
  const track = document.getElementById('adminTimelineTrack');
  if (!track) return;
  const journeeMin = (HEURE_FIN_JOURNEE - HEURE_DEBUT_JOURNEE) * 60;
  const PAS_MINUTES = 5;
  const LONG_PRESS_MS = 350;
  const SEUIL_ANNULATION_PX = 8;

  track.querySelectorAll('.time-bar.draggable').forEach(bar => {
    let pressTimer = null;
    let dragging = false;
    let startY = 0;
    let startTopPct = 0;
    let trackHeight = 0;
    let dureeMin = 0;
    let ghost = null;
    let nouvelDebutMin = null;

    function minutesVersStr(min) {
      const total = HEURE_DEBUT_JOURNEE * 60 + min;
      const h = Math.floor(total / 60);
      const m = total % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function annulerPressTimer() {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }

    function onPointerMove(e) {
      if (!dragging) {
        if (Math.abs(e.clientY - startY) > SEUIL_ANNULATION_PX) annulerPressTimer();
        return;
      }
      e.preventDefault();
      const deltaY = e.clientY - startY;
      const deltaPct = (deltaY / trackHeight) * 100;
      let newTopPct = startTopPct + deltaPct;
      const maxTopPct = ((journeeMin - dureeMin) / journeeMin) * 100;
      newTopPct = Math.max(0, Math.min(newTopPct, maxTopPct));
      bar.style.top = `${newTopPct}%`;

      let debutMin = (newTopPct / 100) * journeeMin;
      debutMin = Math.round(debutMin / PAS_MINUTES) * PAS_MINUTES;
      debutMin = Math.max(0, Math.min(debutMin, journeeMin - dureeMin));
      nouvelDebutMin = debutMin;

      if (!ghost) {
        ghost = document.createElement('div');
        ghost.className = 'time-bar-ghost-time';
        bar.appendChild(ghost);
      }
      ghost.textContent = `${minutesVersStr(debutMin)} - ${minutesVersStr(debutMin + dureeMin)}`;
    }

    async function onPointerUp(e) {
      annulerPressTimer();
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);

      if (!dragging) return;
      dragging = false;
      bar.classList.remove('dragging');
      if (ghost) { ghost.remove(); ghost = null; }

      if (nouvelDebutMin === null) return;
      const nouvelle_heure_debut = minutesVersStr(nouvelDebutMin);
      const nouvelle_heure_fin = minutesVersStr(nouvelDebutMin + dureeMin);

      if (nouvelle_heure_debut === bar.dataset.debutEffectif) {
        renderAdminTimeline();
        return;
      }

      try {
        await api(`/api/admin/creneaux/${bar.dataset.id}/statut-jour`, {
          method: 'POST',
          body: JSON.stringify({ statut: 'deplace', nouvelle_heure_debut, nouvelle_heure_fin, nouvelle_salle: '' }),
        });
        await chargerEvenementsPronote();
        await chargerEvenementsPronoteDebug();
        renderAdminTimeline();
      } catch (err) {
        alert(err.message);
        renderAdminTimeline();
      }
    }

    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      startY = e.clientY;
      const trackRect = track.getBoundingClientRect();
      trackHeight = trackRect.height;
      startTopPct = parseFloat(bar.style.top) || 0;
      const debut = bar.dataset.debutEffectif;
      const fin = bar.dataset.finEffectif;
      dureeMin = minutesDepuisDebutJournee(fin) - minutesDepuisDebutJournee(debut);
      nouvelDebutMin = null;

      pressTimer = setTimeout(() => {
        dragging = true;
        bar.classList.add('dragging');
        document.addEventListener('pointermove', onPointerMove, { passive: false });
        document.addEventListener('pointerup', onPointerUp);
      }, LONG_PRESS_MS);

      document.addEventListener('pointermove', onPointerMove, { passive: false });
      document.addEventListener('pointerup', function annulationRapide() {
        if (!dragging) annulerPressTimer();
        document.removeEventListener('pointerup', annulationRapide);
      });
    });
  });
}

// ================= NOTIFICATIONS PUSH (fonctionnent app/navigateur fermes) =================
// Le navigateur s'abonne aupres du service worker, l'abonnement est envoye au
// serveur, et un cron externe appelle /api/cron/verifier-notifications toutes
// les quelques minutes pour declencher les envois via web-push. Voir README.

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function abonnementPushActuel() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function mettreAJourBoutonNotif() {
  const btn = document.getElementById('btnNotif');
  if (!btn) return;
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    btn.classList.add('hidden');
    return;
  }
  const abonnement = await abonnementPushActuel();
  btn.textContent = abonnement ? '🔔 Notifications activées' : '🔔 Activer les notifications';
}

async function activerNotificationsPush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  const { publicKey } = await api('/api/vapid-public-key');
  const registration = await navigator.serviceWorker.ready;

  let abonnement = await registration.pushManager.getSubscription();
  if (!abonnement) {
    abonnement = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await api('/api/push-subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription: abonnement.toJSON(), semaine: state.semaineActive }),
  });
}

// ================= NOTIFICATIONS TELEGRAM (alternative au push, plus fiable) =================
// Le push web depend de reglages Android/navigateur parfois capricieux ; Telegram
// passe par sa propre appli, qui a son propre canal de notifications independant.

document.getElementById('btnTelegram').addEventListener('click', async () => {
  const btn = document.getElementById('btnTelegram');
  try {
    const statut = await api('/api/telegram/statut');
    if (!statut.configure) {
      alert("Les notifications Telegram ne sont pas encore configurées sur ce serveur.");
      return;
    }
    if (statut.lie) {
      const resultat = await api('/api/telegram/test', { method: 'POST' });
      if (resultat.ok) {
        alert('Message de test envoyé sur Telegram. Il devrait arriver dans quelques secondes.');
      } else {
        alert('Échec de l\'envoi Telegram : ' + (resultat.message || 'erreur inconnue') + '\n\nSi tu as bloqué ou supprimé le chat avec le bot, clique de nouveau sur ce bouton pour le relier.');
      }
      return;
    }
    if (!statut.botUsername) {
      alert("Impossible de récupérer le nom du bot Telegram pour l'instant. Réessaie dans un instant.");
      return;
    }
    const lien = `https://t.me/${statut.botUsername}?start=${statut.code}`;
    const ouvrir = confirm(
      `Pour recevoir tes notifications sur Telegram :\n\n1. Clique sur OK pour ouvrir Telegram\n2. Appuie sur "Démarrer" dans la discussion avec le bot\n\n(Si Telegram ne s'ouvre pas automatiquement, envoie ce message au bot @${statut.botUsername} : /lier ${statut.code})`
    );
    if (ouvrir) window.open(lien, '_blank');
  } catch (err) {
    alert("Erreur : " + err.message);
  }
});

document.getElementById('btnNotif').addEventListener('click', async () => {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert("Les notifications ne sont pas prises en charge sur cet appareil/navigateur.");
    return;
  }
  try {
    const dejaAbonne = await abonnementPushActuel();
    if (dejaAbonne) {
      const resultat = await api('/api/push-test', { method: 'POST' });
      if (resultat.envoyees > 0) {
        alert(`Notification de test envoyée (${resultat.envoyees}/${resultat.total}). Elle devrait arriver dans quelques secondes, même si tu fermes l'application.`);
      } else if (resultat.erreurGlobale) {
        if (/[Aa]bonnement/.test(resultat.erreurGlobale) && !/VAPID/.test(resultat.erreurGlobale)) {
          await dejaAbonne.unsubscribe().catch(() => {});
          await activerNotificationsPush();
          await mettreAJourBoutonNotif();
          alert("Ton abonnement n'était pas bien enregistré côté serveur — c'est corrigé, réessaie le bouton 🔔 pour tester à nouveau.");
        } else {
          alert('Échec : ' + resultat.erreurGlobale);
        }
      } else if (resultat.erreurs && resultat.erreurs.length) {
        alert('Échec de l\'envoi :\n' + resultat.erreurs.join('\n') + '\n\nRéessaie de réactiver les notifications ci-dessous.');
        await dejaAbonne.unsubscribe().catch(() => {});
        await activerNotificationsPush();
        await mettreAJourBoutonNotif();
      }
      return;
    }
    await activerNotificationsPush();
    await mettreAJourBoutonNotif();
    alert("Notifications activées ! Tu seras prévenu au début de chaque cours et en cas de trou d'1h ou plus — même si l'application est fermée.");
  } catch (err) {
    alert("Impossible d'activer les notifications : " + err.message);
  }
});

// ---- Pronote ----
async function chargerStatutPronote() {
  const el = document.getElementById('pronoteStatut');
  try {
    const s = await api('/api/admin/pronote-statut');
    if (!s.configure) {
      el.innerHTML = "Pronote n'est pas configuré sur ce serveur (variables d'environnement absentes).";
    } else if (s.date === null) {
      el.innerHTML = 'Configuré, en attente de la première synchronisation...';
    } else if (s.succes) {
      const date = new Date(s.date).toLocaleString('fr-FR');
      el.innerHTML = `<span class="ok">Dernière synchro réussie</span> le ${date} — ${s.nombre} événement(s) récupéré(s).`;
    } else {
      const date = new Date(s.date).toLocaleString('fr-FR');
      el.innerHTML = `<span class="erreur">Échec de la synchro</span> le ${date} : ${escapeHtml(s.erreur || '')}`;
    }
  } catch (e) {
    el.textContent = 'Impossible de récupérer le statut Pronote.';
  }

  await chargerEvenementsPronoteDebug();
}

async function chargerEvenementsPronoteDebug() {
  const body = document.getElementById('pronoteEvenementsDebugBody');
  if (!body) return;
  try {
    const evenements = await api('/api/pronote-evenements');
    if (evenements.length === 0) {
      body.innerHTML = '<tr><td colspan="5" class="muted">Aucun événement récupéré pour le moment.</td></tr>';
      return;
    }
    const statutLabel = { annule: 'Annulé', modifie: 'Modifié', deplace: 'Déplacé', normal: 'Normal' };
    body.innerHTML = evenements.map(e => `
      <tr>
        <td>${escapeHtml(e.jour)}</td>
        <td>${escapeHtml(e.heure_debut)}</td>
        <td>${escapeHtml(e.heure_fin)}</td>
        <td>${escapeHtml(e.matiere_nom || '')}</td>
        <td>${statutLabel[e.statut] || e.statut}</td>
      </tr>`).join('');
  } catch (e) {
    body.innerHTML = '<tr><td colspan="5" class="muted">Impossible de charger les événements.</td></tr>';
  }
}

document.getElementById('btnPronoteSync').addEventListener('click', async () => {
  const btn = document.getElementById('btnPronoteSync');
  btn.disabled = true;
  btn.textContent = 'Synchronisation en cours...';
  try {
    await api('/api/admin/pronote-sync', { method: 'POST' });
  } catch (e) {
    // l'erreur est deja affichee via le statut
  }
  await chargerStatutPronote();
  btn.disabled = false;
  btn.textContent = 'Synchroniser maintenant';
});

document.getElementById('btnPronoteVersCreneaux').addEventListener('click', async () => {
  const btn = document.getElementById('btnPronoteVersCreneaux');
  btn.disabled = true;
  btn.textContent = 'Création en cours...';
  try {
    const resultat = await api('/api/admin/pronote-vers-creneaux', { method: 'POST' });
    alert(`${resultat.creneauxCrees} créneau(x) créé(s) à partir des données Pronote.`);
    await loadAdminView();
    renderSchedule();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Créer mon emploi du temps à partir de Pronote';
  }
});

// ---- Matières ----
function renderMatiereList() {
  const ul = document.getElementById('matiereList');
  ul.innerHTML = '';
  if (state.matieres.length === 0) {
    ul.innerHTML = '<li class="muted">Aucune matière pour le moment.</li>';
    return;
  }
  state.matieres.forEach(m => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(m.nom)}</span>
      <span>
        <button class="icon-btn" data-action="renommer" data-id="${m.id}">Renommer</button>
        <button class="icon-btn danger" data-action="supprimer" data-id="${m.id}">Supprimer</button>
      </span>`;
    li.querySelector('[data-action="supprimer"]').addEventListener('click', async () => {
      await api(`/api/admin/matieres/${m.id}`, { method: 'DELETE' });
      await loadAdminView();
    });
    li.querySelector('[data-action="renommer"]').addEventListener('click', async () => {
      const nouveauNom = prompt('Nouveau nom de la matière :', m.nom);
      if (!nouveauNom || !nouveauNom.trim() || nouveauNom.trim() === m.nom) return;
      try {
        await api(`/api/admin/matieres/${m.id}`, { method: 'PUT', body: JSON.stringify({ nom: nouveauNom.trim() }) });
        await loadAdminView();
        renderSchedule();
      } catch (err) {
        alert(err.message);
      }
    });
    ul.appendChild(li);
  });
}

function renderMatiereOptions() {
  const select = document.getElementById('creneauMatiere');
  select.innerHTML = '<option value="">— Aucune matière —</option>' +
    state.matieres.map(m => `<option value="${m.id}">${escapeHtml(m.nom)}</option>`).join('');
}

document.getElementById('matiereForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nomInput = document.getElementById('matiereNom');
  const nom = nomInput.value.trim();
  if (!nom) return;
  try {
    await api('/api/admin/matieres', { method: 'POST', body: JSON.stringify({ nom }) });
    nomInput.value = '';
    await loadAdminView();
  } catch (err) {
    alert(err.message);
  }
});

// ---- Utilisateurs ----
function renderUserList() {
  const ul = document.getElementById('userList');
  ul.innerHTML = '';
  state.users.forEach(u => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${escapeHtml(u.username)} <span class="tag">${u.role}</span>${u.must_change_password ? ' <span class="tag">provisoire</span>' : ''}</span>
      <span>
        <button class="icon-btn" data-action="reset" data-id="${u.id}">Réinitialiser</button>
        <button class="icon-btn danger" data-action="delete" data-id="${u.id}">Supprimer</button>
      </span>`;
    li.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm(`Supprimer le compte "${u.username}" ?`)) return;
      try {
        await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
        await loadAdminView();
      } catch (err) {
        alert(err.message);
      }
    });
    li.querySelector('[data-action="reset"]').addEventListener('click', async () => {
      const newPassword = prompt(`Nouveau mot de passe provisoire pour "${u.username}" :`);
      if (!newPassword) return;
      try {
        await api(`/api/admin/users/${u.id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) });
        alert('Mot de passe provisoire mis à jour.');
      } catch (err) {
        alert(err.message);
      }
    });
    ul.appendChild(li);
  });
}

document.getElementById('userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;
  const role = document.getElementById('newRole').value;
  try {
    await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ username, password, role }) });
    e.target.reset();
    await loadAdminView();
  } catch (err) {
    alert(err.message);
  }
});

// ---- Créneaux ----
function setupHeureSelects() {
  const heures = genererHeures();
  const debutSelect = document.getElementById('creneauDebut');
  const finSelect = document.getElementById('creneauFin');
  debutSelect.innerHTML = heures.map(h => `<option value="${h}">${h}</option>`).join('');
  finSelect.innerHTML = heures.map(h => `<option value="${h}">${h}</option>`).join('');
  finSelect.value = heures[1] || heures[0];
}

function renderCreneauAdminTable() {
  const body = document.getElementById('creneauAdminBody');
  body.innerHTML = '';
  const sorted = [...state.creneaux].sort((a, b) =>
    JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour) || a.heure_debut.localeCompare(b.heure_debut)
  );

  const semaineLabel = { S1: 'Semaine 1', S2: 'Semaine 2', Toutes: 'Les deux' };

  sorted.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.jour}</td>
      <td>${c.heure_debut}</td>
      <td>${c.heure_fin}</td>
      <td>${escapeHtml(c.matiere_nom || '—')}</td>
      <td>${semaineLabel[c.semaine] || 'Les deux'}</td>
      <td>${escapeHtml(c.salle || '')}</td>
      <td>${escapeHtml(c.professeur || '')}</td>
      <td>
        <button class="icon-btn" data-action="edit" data-id="${c.id}">Modifier</button>
        <button class="icon-btn" data-action="annuler-jour" data-id="${c.id}">Annulé aujourd'hui</button>
        <button class="icon-btn" data-action="modifier-jour" data-id="${c.id}">Modifié aujourd'hui</button>
        <button class="icon-btn" data-action="deplacer-jour" data-id="${c.id}">Déplacé aujourd'hui</button>
        <button class="icon-btn danger" data-action="delete" data-id="${c.id}">Supprimer</button>
      </td>`;
    tr.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      await api(`/api/admin/creneaux/${c.id}`, { method: 'DELETE' });
      await loadAdminView();
      renderSchedule();
    });
    tr.querySelector('[data-action="edit"]').addEventListener('click', () => {
      chargerCreneauDansFormulaire(c);
    });
    tr.querySelector('[data-action="annuler-jour"]').addEventListener('click', async () => {
      const dejaAnnule = trouverEvenementPronote(c.jour, c.heure_debut, c.heure_fin);
      const nouveauStatut = (dejaAnnule && dejaAnnule.statut === 'annule') ? 'normal' : 'annule';
      try {
        await api(`/api/admin/creneaux/${c.id}/statut-jour`, { method: 'POST', body: JSON.stringify({ statut: nouveauStatut }) });
        await chargerEvenementsPronote();
        await chargerEvenementsPronoteDebug();
      } catch (err) {
        alert(err.message);
      }
    });
    tr.querySelector('[data-action="modifier-jour"]').addEventListener('click', async () => {
      const dejaModifie = trouverEvenementPronote(c.jour, c.heure_debut, c.heure_fin);
      const nouveauStatut = (dejaModifie && dejaModifie.statut === 'modifie') ? 'normal' : 'modifie';
      try {
        await api(`/api/admin/creneaux/${c.id}/statut-jour`, { method: 'POST', body: JSON.stringify({ statut: nouveauStatut }) });
        await chargerEvenementsPronote();
        await chargerEvenementsPronoteDebug();
      } catch (err) {
        alert(err.message);
      }
    });
    tr.querySelector('[data-action="deplacer-jour"]').addEventListener('click', () => {
      ouvrirModaleDeplacement(c);
    });
    body.appendChild(tr);
  });
}

// ---- Deplacement d'un cours (aujourd'hui) ----
let creneauEnDeplacement = null;

function ouvrirModaleDeplacement(c) {
  creneauEnDeplacement = c;
  const heures = genererHeures();
  const debutSelect = document.getElementById('deplaceDebut');
  const finSelect = document.getElementById('deplaceFin');
  debutSelect.innerHTML = heures.map(h => `<option value="${h}">${h}</option>`).join('');
  finSelect.innerHTML = heures.map(h => `<option value="${h}">${h}</option>`).join('');

  const evt = trouverEvenementPronote(c.jour, c.heure_debut, c.heure_fin);
  const dejaDeplace = evt && evt.statut === 'deplace';

  document.getElementById('deplaceModalOriginal').textContent =
    `${c.matiere_nom || 'Sans matière'} — actuellement ${c.jour} ${c.heure_debut} - ${c.heure_fin}`;
  debutSelect.value = dejaDeplace ? evt.nouvelle_heure_debut : c.heure_debut;
  finSelect.value = dejaDeplace ? evt.nouvelle_heure_fin : c.heure_fin;
  document.getElementById('deplaceSalle').value = dejaDeplace ? (evt.nouvelle_salle || '') : '';
  document.getElementById('deplaceAnnulerLien').classList.toggle('hidden', !dejaDeplace);

  document.getElementById('deplaceModal').classList.remove('hidden');
}

document.getElementById('deplaceModalClose').addEventListener('click', () => {
  document.getElementById('deplaceModal').classList.add('hidden');
});
document.getElementById('deplaceModal').addEventListener('click', (e) => {
  if (e.target.id === 'deplaceModal') document.getElementById('deplaceModal').classList.add('hidden');
});

document.getElementById('deplaceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!creneauEnDeplacement) return;
  const nouvelle_heure_debut = document.getElementById('deplaceDebut').value;
  const nouvelle_heure_fin = document.getElementById('deplaceFin').value;
  const nouvelle_salle = document.getElementById('deplaceSalle').value.trim();

  if (nouvelle_heure_fin <= nouvelle_heure_debut) {
    alert("L'heure de fin doit être après l'heure de début.");
    return;
  }

  try {
    await api(`/api/admin/creneaux/${creneauEnDeplacement.id}/statut-jour`, {
      method: 'POST',
      body: JSON.stringify({ statut: 'deplace', nouvelle_heure_debut, nouvelle_heure_fin, nouvelle_salle }),
    });
    document.getElementById('deplaceModal').classList.add('hidden');
    await chargerEvenementsPronote();
    await chargerEvenementsPronoteDebug();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('deplaceAnnulerLien').addEventListener('click', async () => {
  if (!creneauEnDeplacement) return;
  try {
    await api(`/api/admin/creneaux/${creneauEnDeplacement.id}/statut-jour`, {
      method: 'POST',
      body: JSON.stringify({ statut: 'normal' }),
    });
    document.getElementById('deplaceModal').classList.add('hidden');
    await chargerEvenementsPronote();
    await chargerEvenementsPronoteDebug();
  } catch (err) {
    alert(err.message);
  }
});

function chargerCreneauDansFormulaire(c) {
  document.getElementById('creneauEditId').value = c.id;
  document.getElementById('creneauJour').value = c.jour;
  document.getElementById('creneauDebut').value = c.heure_debut;
  document.getElementById('creneauFin').value = c.heure_fin;
  document.getElementById('creneauMatiere').value = c.matiere_id || '';
  document.getElementById('creneauSemaine').value = c.semaine || 'Toutes';
  document.getElementById('creneauSalle').value = c.salle || '';
  document.getElementById('creneauProf').value = c.professeur || '';

  const btn = document.getElementById('creneauFormSubmitBtn');
  btn.textContent = 'Enregistrer les modifications';
  document.getElementById('creneauFormCancelBtn').classList.remove('hidden');
  document.getElementById('creneauForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function reinitialiserFormulaireCreneau() {
  document.getElementById('creneauForm').reset();
  document.getElementById('creneauEditId').value = '';
  document.getElementById('creneauFormSubmitBtn').textContent = 'Ajouter le créneau';
  document.getElementById('creneauFormCancelBtn').classList.add('hidden');
}

document.getElementById('creneauFormCancelBtn').addEventListener('click', reinitialiserFormulaireCreneau);

document.getElementById('creneauForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const editId = document.getElementById('creneauEditId').value;
  const jour = document.getElementById('creneauJour').value;
  const heure_debut = document.getElementById('creneauDebut').value;
  const heure_fin = document.getElementById('creneauFin').value;
  const matiere_id = document.getElementById('creneauMatiere').value || null;
  const semaine = document.getElementById('creneauSemaine').value;
  const salle = document.getElementById('creneauSalle').value.trim();
  const professeur = document.getElementById('creneauProf').value.trim();

  if (heure_fin <= heure_debut) {
    alert("L'heure de fin doit être après l'heure de début.");
    return;
  }

  try {
    if (editId) {
      await api(`/api/admin/creneaux/${editId}`, {
        method: 'PUT',
        body: JSON.stringify({ jour, heure_debut, heure_fin, matiere_id, salle, professeur, semaine }),
      });
    } else {
      await api('/api/admin/creneaux', {
        method: 'POST',
        body: JSON.stringify({ jour, heure_debut, heure_fin, matiere_id, salle, professeur, semaine }),
      });
    }
    reinitialiserFormulaireCreneau();
    await loadAdminView();
    renderSchedule();
  } catch (err) {
    alert(err.message);
  }
});

// ---- Import PDF ----
let pdfCreneauxDetectes = [];

document.getElementById('pdfImportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('pdfFile');
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('pdf', file);

  try {
    const res = await fetch('/api/admin/import-pdf', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'import');

    pdfCreneauxDetectes = data.creneaux || [];
    document.getElementById('pdfExtractedText').value = data.text || '(aucun texte détecté dans ce PDF)';
    document.getElementById('pdfReview').classList.remove('hidden');
    renderPdfReviewTable();

    if (pdfCreneauxDetectes.length === 0) {
      alert("Aucun créneau n'a pu être détecté automatiquement dans ce PDF. Vous pouvez en ajouter manuellement avec le bouton \"Ajouter une ligne\", ou consulter le texte brut extrait plus bas.");
    }
  } catch (err) {
    alert(err.message);
  }
});

function renderPdfReviewTable() {
  const body = document.getElementById('pdfCreneauxBody');
  body.innerHTML = '';
  const heures = genererHeures();

  pdfCreneauxDetectes.forEach((c, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <select class="pdf-row-input" data-field="jour" data-index="${index}">
          ${JOURS.map(j => `<option value="${j}" ${c.jour === j ? 'selected' : ''}>${j}</option>`).join('')}
        </select>
      </td>
      <td>
        <select class="pdf-row-input" data-field="heure_debut" data-index="${index}">
          ${heures.map(h => `<option value="${h}" ${c.heure_debut === h ? 'selected' : ''}>${h}</option>`).join('')}
        </select>
      </td>
      <td>
        <select class="pdf-row-input" data-field="heure_fin" data-index="${index}">
          ${heures.map(h => `<option value="${h}" ${c.heure_fin === h ? 'selected' : ''}>${h}</option>`).join('')}
        </select>
      </td>
      <td><input class="pdf-row-input" data-field="matiere_nom" data-index="${index}" value="${escapeHtml(c.matiere_nom || '')}" /></td>
      <td>
        <select class="pdf-row-input" data-field="semaine" data-index="${index}">
          <option value="Toutes" ${c.semaine === 'Toutes' ? 'selected' : ''}>Les deux</option>
          <option value="S1" ${c.semaine === 'S1' ? 'selected' : ''}>S1</option>
          <option value="S2" ${c.semaine === 'S2' ? 'selected' : ''}>S2</option>
        </select>
      </td>
      <td><input class="pdf-row-input" data-field="salle" data-index="${index}" value="${escapeHtml(c.salle || '')}" /></td>
      <td><input class="pdf-row-input" data-field="professeur" data-index="${index}" value="${escapeHtml(c.professeur || '')}" /></td>
      <td><button type="button" class="icon-btn danger" data-remove="${index}">Retirer</button></td>`;
    body.appendChild(tr);
  });

  body.querySelectorAll('.pdf-row-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.index);
      const field = e.target.dataset.field;
      pdfCreneauxDetectes[i][field] = e.target.value;
    });
  });

  body.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      pdfCreneauxDetectes.splice(Number(btn.dataset.remove), 1);
      renderPdfReviewTable();
    });
  });
}

document.getElementById('pdfAddRow').addEventListener('click', () => {
  pdfCreneauxDetectes.push({
    jour: 'Lundi', heure_debut: '08:00', heure_fin: '09:00',
    matiere_nom: '', salle: '', professeur: '', semaine: 'Toutes',
  });
  renderPdfReviewTable();
});

document.getElementById('pdfValidateImport').addEventListener('click', async () => {
  if (pdfCreneauxDetectes.length === 0) {
    alert('Aucun créneau à importer.');
    return;
  }

  const btn = document.getElementById('pdfValidateImport');
  btn.disabled = true;
  btn.textContent = 'Import en cours...';

  try {
    for (const c of pdfCreneauxDetectes) {
      if (!c.matiere_nom || !c.matiere_nom.trim()) continue;

      // Cherche une matiere existante (insensible a la casse), sinon la cree
      let matiere = state.matieres.find(m => m.nom.toLowerCase() === c.matiere_nom.trim().toLowerCase());
      if (!matiere) {
        const created = await api('/api/admin/matieres', { method: 'POST', body: JSON.stringify({ nom: c.matiere_nom.trim() }) });
        matiere = { id: created.id, nom: c.matiere_nom.trim() };
        state.matieres.push(matiere);
      }

      await api('/api/admin/creneaux', {
        method: 'POST',
        body: JSON.stringify({
          jour: c.jour,
          heure_debut: c.heure_debut,
          heure_fin: c.heure_fin,
          matiere_id: matiere.id,
          salle: c.salle,
          professeur: c.professeur,
          semaine: c.semaine || 'Toutes',
        }),
      });
    }

    pdfCreneauxDetectes = [];
    document.getElementById('pdfReview').classList.add('hidden');
    document.getElementById('pdfFile').value = '';
    await loadAdminView();
    renderSchedule();
    alert('Créneaux importés avec succès. Vous pouvez encore les modifier depuis le tableau ci-dessous.');
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Créer ces créneaux';
  }
});

// ================= INSTALLATION SUR LE TELEPHONE (PWA) =================
let deferredInstallPrompt = null;
const btnInstall = document.getElementById('btnInstall');

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

if (!isStandalone()) {
  if (isIos()) {
    // Safari iOS n'a pas de prompt natif : on affiche le bouton avec des instructions
    btnInstall.classList.remove('hidden');
  } else {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      btnInstall.classList.remove('hidden');
    });
  }
}

btnInstall.addEventListener('click', async () => {
  if (isIos()) {
    document.getElementById('installInstructions').textContent =
      "Sur iPhone, l'installation se fait depuis Safari :\n\n1. Appuyez sur le bouton Partager (le carré avec une flèche vers le haut) en bas de l'écran.\n2. Faites défiler et appuyez sur \"Sur l'écran d'accueil\".\n3. Appuyez sur \"Ajouter\".\n\nL'application apparaîtra ensuite comme une icône sur votre écran d'accueil.";
    document.getElementById('installModal').classList.remove('hidden');
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    btnInstall.classList.add('hidden');
  }
});

document.getElementById('installModalClose').addEventListener('click', () => {
  document.getElementById('installModal').classList.add('hidden');
});

window.addEventListener('appinstalled', () => {
  btnInstall.classList.add('hidden');
});

// Lien retour vers l'emploi du temps depuis l'admin
document.getElementById('btnBackToSchedule').addEventListener('click', (e) => {
  e.preventDefault();
  renderSchedule();
  showView('schedule');
});

init();
