const state = { user: null, lessons: [], view: "week", activeDayIndex: 0 };

const DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const HOUR_PX = 56;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;

const el = {
  splash: document.getElementById("splash-screen"),
  loginScreen: document.getElementById("login-screen"),
  appScreen: document.getElementById("app-screen"),
  loginForm: document.getElementById("login-form"),
  loginBtn: document.getElementById("login-btn"),
  loginError: document.getElementById("login-error"),

  schoolLogo: document.getElementById("school-logo"),
  schoolName: document.getElementById("school-name"),
  studentAvatar: document.getElementById("student-avatar"),
  studentName: document.getElementById("student-name"),
  studentClass: document.getElementById("student-class"),

  viewBtns: document.querySelectorAll(".view-btn"),
  dayTabs: document.getElementById("day-tabs"),
  timetableContainer: document.getElementById("timetable-container"),
  logoutBtn: document.getElementById("logout-btn"),
};

function showScreen(name) {
  el.loginScreen.hidden = name !== "login";
  el.appScreen.hidden = name !== "app";
}

function hideSplash() {
  el.splash.classList.add("hide");
  setTimeout(() => { el.splash.hidden = true; }, 380);
}

// ─── API ──────────────────────────────────────────────────────────────────
async function apiLogin(payload) {
  const res = await fetch("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    credentials: "include", body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur de connexion.");
  return data;
}
async function apiMe() {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}
async function apiTimetable() {
  const res = await fetch("/api/timetable", { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}
async function apiSettings() {
  const res = await fetch("/api/settings");
  return res.json();
}
async function apiLogout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

// ─── Rendu ────────────────────────────────────────────────────────────────
function renderStudent(user, settings) {
  if (settings?.schoolName) el.schoolName.textContent = settings.schoolName;
  if (settings?.logoUrl) el.schoolLogo.src = settings.logoUrl;

  el.studentName.textContent = `${user.firstName} ${user.lastName}`.trim();
  el.studentClass.textContent = user.className || "—";
  const initials = (user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "");
  el.studentAvatar.textContent = (initials || "?").toUpperCase();
}

function groupLessonsByDay(lessons) {
  const days = Array.from({ length: 6 }, () => []);
  for (const lesson of lessons) {
    if (lesson.day >= 0 && lesson.day <= 5) days[lesson.day].push(lesson);
  }
  days.forEach((arr) => arr.sort((a, b) => a.start.localeCompare(b.start)));
  return days;
}

function activeDayIndices(daysGrouped) {
  const indices = [0, 1, 2, 3, 4];
  if (daysGrouped[5].length > 0) indices.push(5);
  return indices;
}

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function renderWeekView() {
  el.dayTabs.hidden = true;
  const daysGrouped = groupLessonsByDay(state.lessons);
  const indices = activeDayIndices(daysGrouped);

  if (state.lessons.length === 0) {
    el.timetableContainer.innerHTML = emptyStateHTML();
    return;
  }

  const totalHours = DAY_END_HOUR - DAY_START_HOUR;
  const gridHeight = totalHours * HOUR_PX;

  let html = `<div class="week-grid" style="--day-count:${indices.length}; --hour-px:${HOUR_PX}px;">`;
  html += `<div class="hour-col-header"></div>`;
  for (const idx of indices) html += `<div class="day-col-header">${DAY_NAMES[idx]}</div>`;

  html += `<div class="hour-col" style="height:${gridHeight}px; position:relative;">`;
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) {
    html += `<div class="hour-label" style="position:absolute; top:${(h - DAY_START_HOUR) * HOUR_PX}px; right:0;">${h}h</div>`;
  }
  html += `</div>`;

  for (const idx of indices) {
    html += `<div class="day-col" style="height:${gridHeight}px;">`;
    for (const lesson of daysGrouped[idx]) html += renderLessonBlock(lesson);
    html += `</div>`;
  }
  html += `</div>`;
  el.timetableContainer.innerHTML = html;
}

function renderLessonBlock(lesson) {
  const startMin = timeToMinutes(lesson.start) - DAY_START_HOUR * 60;
  const endMin = timeToMinutes(lesson.end) - DAY_START_HOUR * 60;
  const top = (startMin / 60) * HOUR_PX;
  const height = Math.max(((endMin - startMin) / 60) * HOUR_PX - 3, 20);
  const meta = [lesson.room, lesson.teacher].filter(Boolean).join(" · ");
  return `<div class="lesson-block" style="top:${top}px; height:${height}px; background:${lesson.color};" title="${escapeHtml(lesson.subject)}">
    <div class="lesson-subject">${escapeHtml(lesson.subject)}</div>
    <div class="lesson-meta">${escapeHtml(meta)}</div>
  </div>`;
}

function renderDayView() {
  const daysGrouped = groupLessonsByDay(state.lessons);
  const indices = activeDayIndices(daysGrouped);

  el.dayTabs.hidden = false;
  el.dayTabs.innerHTML = indices.map((idx) =>
    `<button class="day-tab ${idx === state.activeDayIndex ? "active" : ""}" data-day="${idx}">${DAY_NAMES[idx]}</button>`
  ).join("");

  el.dayTabs.querySelectorAll(".day-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeDayIndex = parseInt(btn.dataset.day, 10);
      renderDayView();
    });
  });

  if (!indices.includes(state.activeDayIndex)) state.activeDayIndex = indices[0];
  const lessons = daysGrouped[state.activeDayIndex];

  if (lessons.length === 0) {
    el.timetableContainer.innerHTML = emptyStateHTML("Aucun cours ce jour-là 🎉");
    return;
  }

  el.timetableContainer.innerHTML = `<div class="day-list">${lessons.map((lesson) => {
    const meta = [lesson.room, lesson.teacher].filter(Boolean).join(" · ");
    return `<div class="day-card" style="border-left-color:${lesson.color}">
      <div class="day-card-time">${lesson.start}<span>${lesson.end}</span></div>
      <div class="day-card-body">
        <div class="subject">${escapeHtml(lesson.subject)}</div>
        <div class="meta">${escapeHtml(meta) || "—"}</div>
      </div>
    </div>`;
  }).join("")}</div>`;
}

function emptyStateHTML(message = "Aucun cours renseigné pour l'instant") {
  return `<div class="empty-state"><div class="empty-icon">☺</div>${message}</div>`;
}

function render() {
  if (state.view === "week") renderWeekView();
  else renderDayView();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ─── Actions ──────────────────────────────────────────────────────────────
el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.loginError.hidden = true;
  el.loginBtn.disabled = true;
  el.loginBtn.textContent = "Connexion…";
  try {
    await apiLogin({
      username: document.getElementById("username").value,
      password: document.getElementById("password").value,
    });
    await loadApp();
  } catch (err) {
    el.loginError.textContent = err.message;
    el.loginError.hidden = false;
  } finally {
    el.loginBtn.disabled = false;
    el.loginBtn.textContent = "Se connecter";
  }
});

el.viewBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    el.viewBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.view = btn.dataset.view;
    render();
  });
});

el.logoutBtn.addEventListener("click", async () => {
  await apiLogout();
  state.user = null;
  showScreen("login");
});

async function loadApp() {
  const [{ lessons, settings, user }] = await Promise.all([apiTimetable()]);
  state.user = user;
  state.lessons = lessons;
  renderStudent(user, settings);
  render();
  showScreen("app");
}

// ─── Démarrage ────────────────────────────────────────────────────────────
(async function init() {
  const minSplash = new Promise((r) => setTimeout(r, 700));
  try {
    await apiMe();
    await loadApp();
  } catch {
    showScreen("login");
  } finally {
    await minSplash;
    hideSplash();
  }
})();
