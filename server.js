const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// URL du site à surveiller
const TARGET_URL = process.env.TARGET_URL || 'https://electrotechnique-snvq.onrender.com';

// Intervalle de vérification (ms) - 60 secondes
const CHECK_INTERVAL = 60 * 1000;

// Seuil de latence (ms) au-delà duquel on considère le site "dégradé"
const SLOW_THRESHOLD = 4000;

let status = {
  state: 'unknown', // 'operational' | 'degraded' | 'down' | 'unknown'
  httpCode: null,
  responseTime: null,
  lastChecked: null,
  message: 'Vérification en cours...',
  history: [] // historique des derniers checks
};

async function checkSite() {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // timeout 10s

    const res = await fetch(TARGET_URL, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StatusMonitor/1.0; +https://render.com)'
      }
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - start;

    let state, message;
    if (res.ok) {
      if (responseTime > SLOW_THRESHOLD) {
        state = 'degraded';
        message = `Le site répond mais lentement (${responseTime}ms)`;
      } else {
        state = 'operational';
        message = 'Le site fonctionne normalement';
      }
    } else if (res.status >= 500) {
      state = 'down';
      message = `Erreur serveur (code ${res.status})`;
    } else if (res.status === 403) {
      // Le site répond mais bloque l'accès (ex: page de maintenance)
      const body = await res.text().catch(() => '');
      if (/maintenance/i.test(body)) {
        state = 'down';
        message = 'Le site est en mode maintenance';
      } else {
        state = 'degraded';
        message = `Accès refusé (code 403)`;
      }
    } else {
      state = 'degraded';
      message = `Réponse inattendue (code ${res.status})`;
    }

    status = {
      state,
      httpCode: res.status,
      responseTime,
      lastChecked: new Date().toISOString(),
      message,
      history: updateHistory(state)
    };
  } catch (err) {
    const responseTime = Date.now() - start;
    status = {
      state: 'down',
      httpCode: null,
      responseTime,
      lastChecked: new Date().toISOString(),
      message: err.name === 'AbortError' ? 'Le site ne répond pas (timeout)' : `Le site est injoignable (${err.message})`,
      history: updateHistory('down')
    };
  }
}

function updateHistory(state) {
  const newHistory = [...status.history, { state, time: new Date().toISOString() }];
  return newHistory.slice(-50); // garde les 50 derniers checks
}

// Première vérification au démarrage, puis à intervalle régulier
checkSite();
setInterval(checkSite, CHECK_INTERVAL);

app.get('/api/status', (req, res) => {
  res.json({ target: TARGET_URL, ...status });
});

app.get('/', (req, res) => {
  res.send(renderPage());
});

function renderPage() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Statut du site</title>
<style>
  :root {
    --green: #22c55e;
    --orange: #f59e0b;
    --red: #ef4444;
    --gray: #9ca3af;
    --bg: #0f172a;
    --card: #1e293b;
    --text: #e2e8f0;
    --muted: #94a3b8;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 20px;
  }
  .card {
    background: var(--card);
    border-radius: 16px;
    padding: 32px;
    max-width: 480px;
    width: 100%;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
  }
  h1 { font-size: 20px; margin: 0 0 4px 0; }
  .target { color: var(--muted); font-size: 14px; margin-bottom: 24px; word-break: break-all; }
  .status-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 20px;
    border-radius: 12px;
    background: rgba(255,255,255,0.03);
    margin-bottom: 20px;
  }
  .dot {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 12px currentColor;
  }
  .dot.operational { background: var(--green); color: var(--green); }
  .dot.degraded { background: var(--orange); color: var(--orange); }
  .dot.down { background: var(--red); color: var(--red); }
  .dot.unknown { background: var(--gray); color: var(--gray); }
  .status-text { font-size: 17px; font-weight: 600; }
  .status-label.operational { color: var(--green); }
  .status-label.degraded { color: var(--orange); }
  .status-label.down { color: var(--red); }
  .status-label.unknown { color: var(--gray); }
  .details { font-size: 14px; color: var(--muted); line-height: 1.6; }
  .details div { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .refresh-note { text-align: center; font-size: 12px; color: var(--muted); margin-top: 20px; }
</style>
</head>
<body>
  <div class="card">
    <h1>📡 Statut du service</h1>
    <div class="target" id="target">Chargement...</div>
    <div class="status-row">
      <div class="dot unknown" id="dot"></div>
      <div>
        <div class="status-text status-label unknown" id="statusLabel">Vérification...</div>
        <div style="font-size:13px; color: var(--muted);" id="message"></div>
      </div>
    </div>
    <div class="details">
      <div><span>Code HTTP</span><span id="httpCode">-</span></div>
      <div><span>Temps de réponse</span><span id="responseTime">-</span></div>
      <div><span>Dernière vérification</span><span id="lastChecked">-</span></div>
    </div>
    <div class="refresh-note">Actualisation automatique toutes les 30 secondes</div>
  </div>

<script>
const labels = {
  operational: 'Opérationnel',
  degraded: 'Dégradé',
  down: 'Hors ligne',
  unknown: 'Inconnu'
};

async function refresh() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    document.getElementById('target').textContent = data.target;
    document.getElementById('dot').className = 'dot ' + data.state;
    document.getElementById('statusLabel').className = 'status-text status-label ' + data.state;
    document.getElementById('statusLabel').textContent = labels[data.state] || data.state;
    document.getElementById('message').textContent = data.message || '';
    document.getElementById('httpCode').textContent = data.httpCode ?? 'N/A';
    document.getElementById('responseTime').textContent = data.responseTime != null ? data.responseTime + ' ms' : 'N/A';
    document.getElementById('lastChecked').textContent = data.lastChecked ? new Date(data.lastChecked).toLocaleString('fr-FR') : 'N/A';
  } catch (e) {
    document.getElementById('message').textContent = 'Erreur de récupération du statut';
  }
}

refresh();
setInterval(refresh, 30000);
</script>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log(`Status page running on port ${PORT}, monitoring ${TARGET_URL}`);
});
