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
});

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

    creneauxJour.forEach(c => {
      const topPct = (minutesDepuisDebutJournee(c.heure_debut) / ((HEURE_FIN_JOURNEE - HEURE_DEBUT_JOURNEE) * 60)) * 100;
      const heightPct = ((minutesDepuisDebutJournee(c.heure_fin) - minutesDepuisDebutJournee(c.heure_debut)) / ((HEURE_FIN_JOURNEE - HEURE_DEBUT_JOURNEE) * 60)) * 100;
      html += `<div class="time-bar" data-id="${c.id}" style="top:${topPct}%; height:${Math.max(heightPct, 3.5)}%;"></div>`;
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

  // Gestion du clic sur une barre : ouvrir/fermer la bulle de détail
  container.querySelectorAll('.time-bar').forEach(bar => {
    bar.addEventListener('click', (e) => {
      e.stopPropagation();
      const dejaOuverte = bar.querySelector('.time-bubble');
      document.querySelectorAll('.time-bubble').forEach(b => b.remove());
      if (dejaOuverte) return;

      const c = creneaux.find(x => String(x.id) === bar.dataset.id);
      if (!c) return;

      const bubble = document.createElement('div');
      bubble.className = 'time-bubble';
      bubble.innerHTML = `
        <div class="bubble-matiere">${escapeHtml(c.matiere_nom || 'Sans matière')}</div>
        <div class="bubble-detail">${c.heure_debut} - ${c.heure_fin}</div>
        ${c.salle ? `<div class="bubble-detail">Salle ${escapeHtml(c.salle)}</div>` : ''}
        ${c.professeur ? `<div class="bubble-detail">${escapeHtml(c.professeur)}</div>` : ''}
      `;
      bar.appendChild(bubble);
    });
  });
}

document.addEventListener('click', () => {
  document.querySelectorAll('.time-bubble').forEach(b => b.remove());
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
  setupHeureSelects();
}

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
      <button class="icon-btn danger" data-id="${m.id}">Supprimer</button>`;
    li.querySelector('button').addEventListener('click', async () => {
      await api(`/api/admin/matieres/${m.id}`, { method: 'DELETE' });
      await loadAdminView();
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
      <td><button class="icon-btn danger" data-id="${c.id}">Supprimer</button></td>`;
    tr.querySelector('button').addEventListener('click', async () => {
      await api(`/api/admin/creneaux/${c.id}`, { method: 'DELETE' });
      await loadAdminView();
      renderSchedule();
    });
    body.appendChild(tr);
  });
}

document.getElementById('creneauForm').addEventListener('submit', async (e) => {
  e.preventDefault();
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
    await api('/api/admin/creneaux', {
      method: 'POST',
      body: JSON.stringify({ jour, heure_debut, heure_fin, matiere_id, salle, professeur, semaine }),
    });
    document.getElementById('creneauSalle').value = '';
    document.getElementById('creneauProf').value = '';
    await loadAdminView();
    renderSchedule();
  } catch (err) {
    alert(err.message);
  }
});

// ---- Import PDF ----
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

    document.getElementById('pdfExtractedText').value = data.text || '(aucun texte détecté dans ce PDF)';
    document.getElementById('pdfResult').classList.remove('hidden');
  } catch (err) {
    alert(err.message);
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
