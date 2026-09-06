const el = {
  loginScreen: document.getElementById("login-screen"),
  adminScreen: document.getElementById("admin-screen"),
  loginForm: document.getElementById("login-form"),
  loginBtn: document.getElementById("login-btn"),
  loginError: document.getElementById("login-error"),
  logoutBtn: document.getElementById("logout-btn"),
  tabs: document.querySelectorAll(".admin-tab"),
  panels: {
    settings: document.getElementById("tab-settings"),
    users: document.getElementById("tab-users"),
    lessons: document.getElementById("tab-lessons"),
  },
};

function showScreen(name) {
  el.loginScreen.hidden = name !== "login";
  el.adminScreen.hidden = name !== "admin";
}

// ─── API helpers ──────────────────────────────────────────────────────────
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur.");
  return data;
}

// ─── Connexion ────────────────────────────────────────────────────────────
el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.loginError.hidden = true;
  el.loginBtn.disabled = true;
  el.loginBtn.textContent = "Connexion…";
  try {
    const data = await api("POST", "/api/auth/login", {
      username: document.getElementById("username").value,
      password: document.getElementById("password").value,
    });
    if (data.user.role !== "admin") throw new Error("Ce compte n'est pas administrateur.");
    await bootAdmin();
  } catch (err) {
    el.loginError.textContent = err.message;
    el.loginError.hidden = false;
  } finally {
    el.loginBtn.disabled = false;
    el.loginBtn.textContent = "Se connecter";
  }
});

el.logoutBtn.addEventListener("click", async () => {
  await api("POST", "/api/auth/logout");
  showScreen("login");
});

// ─── Onglets ──────────────────────────────────────────────────────────────
el.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    el.tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    Object.entries(el.panels).forEach(([key, panelEl]) => {
      panelEl.hidden = key !== tab.dataset.tab;
    });
  });
});

// ─── Établissement ────────────────────────────────────────────────────────
async function loadSettings() {
  const { settings } = await api("GET", "/api/settings");
  document.getElementById("school-name-input").value = settings.schoolName ?? "";
  document.getElementById("logo-url-input").value = settings.logoUrl ?? "";
}

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("settings-msg");
  try {
    await api("PUT", "/api/admin/settings", {
      schoolName: document.getElementById("school-name-input").value,
      logoUrl: document.getElementById("logo-url-input").value,
    });
    msg.textContent = "Enregistré ✓";
    msg.hidden = false;
    setTimeout(() => (msg.hidden = true), 2000);
  } catch (err) {
    alert(err.message);
  }
});

// ─── Élèves ───────────────────────────────────────────────────────────────
async function loadUsers() {
  const { users } = await api("GET", "/api/admin/users");
  const tbody = document.getElementById("users-tbody");
  tbody.innerHTML = users.map((u) => `
    <tr>
      <td>${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)} ${u.role === "admin" ? "👑" : ""}</td>
      <td>${escapeHtml(u.className) || "—"}</td>
      <td>${escapeHtml(u.username)}</td>
      <td class="actions"><button class="del-btn" data-id="${u.id}">Supprimer</button></td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Supprimer ce compte ?")) return;
      try {
        await api("DELETE", `/api/admin/users/${btn.dataset.id}`);
        loadUsers();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

document.getElementById("user-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("user-msg");
  msg.hidden = true;
  try {
    await api("POST", "/api/admin/users", {
      firstName: document.getElementById("u-firstName").value,
      lastName: document.getElementById("u-lastName").value,
      className: document.getElementById("u-className").value,
      username: document.getElementById("u-username").value,
      password: document.getElementById("u-password").value,
    });
    e.target.reset();
    loadUsers();
  } catch (err) {
    msg.textContent = err.message;
    msg.hidden = false;
  }
});

// ─── Emploi du temps ──────────────────────────────────────────────────────
let allLessons = [];

async function loadLessons() {
  const { lessons } = await api("GET", "/api/admin/lessons");
  allLessons = lessons;
  renderLessonsTable();
}

function renderLessonsTable() {
  const filter = document.getElementById("lesson-filter").value.trim().toLowerCase();
  const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const tbody = document.getElementById("lessons-tbody");

  const filtered = filter
    ? allLessons.filter((l) => l.className.toLowerCase().includes(filter))
    : allLessons;

  const sorted = [...filtered].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));

  tbody.innerHTML = sorted.map((l) => `
    <tr>
      <td>${escapeHtml(l.className)}</td>
      <td>${DAY_NAMES[l.day] ?? "—"}</td>
      <td>${l.start} – ${l.end}</td>
      <td><span class="color-dot" style="background:${l.color}"></span>${escapeHtml(l.subject)}</td>
      <td>${escapeHtml(l.teacher) || "—"}</td>
      <td>${escapeHtml(l.room) || "—"}</td>
      <td class="actions"><button class="del-btn" data-id="${l.id}">Supprimer</button></td>
    </tr>
  `).join("") || `<tr><td colspan="7" style="text-align:center; color:var(--ink-soft);">Aucun cours.</td></tr>`;

  tbody.querySelectorAll(".del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Supprimer ce cours ?")) return;
      try {
        await api("DELETE", `/api/admin/lessons/${btn.dataset.id}`);
        loadLessons();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

document.getElementById("lesson-filter").addEventListener("input", renderLessonsTable);

document.getElementById("lesson-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("lesson-msg");
  msg.hidden = true;
  try {
    await api("POST", "/api/admin/lessons", {
      className: document.getElementById("l-className").value,
      day: document.getElementById("l-day").value,
      start: document.getElementById("l-start").value,
      end: document.getElementById("l-end").value,
      subject: document.getElementById("l-subject").value,
      teacher: document.getElementById("l-teacher").value,
      room: document.getElementById("l-room").value,
      color: document.getElementById("l-color").value,
    });
    e.target.reset();
    document.getElementById("l-color").value = "#4f46e5";
    loadLessons();
  } catch (err) {
    msg.textContent = err.message;
    msg.hidden = false;
  }
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ─── Démarrage ────────────────────────────────────────────────────────────
async function bootAdmin() {
  await Promise.all([loadSettings(), loadUsers(), loadLessons()]);
  showScreen("admin");
}

(async function init() {
  try {
    const { user } = await api("GET", "/api/auth/me");
    if (user.role !== "admin") throw new Error("not admin");
    await bootAdmin();
  } catch {
    showScreen("login");
  }
})();
