const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use('/static', express.static(path.join(__dirname, 'public')));

// URL du site à surveiller
const TARGET_URL = process.env.TARGET_URL || 'https://electrotechnique-snvq.onrender.com';
const SITE_LOGO = process.env.SITE_LOGO || `${TARGET_URL}/img/logo.png`;

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
<title>Statut — Électrotechnique</title>
<style>
  :root {
    --green: #2ecc71;
    --orange: #f5a623;
    --red: #e74c3c;
    --gray: #6b7280;
    --accent: #0F6C7C;
    --text: #eef2f4;
    --muted: #a9b4bb;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--text);
  }
  body {
    background:
      linear-gradient(180deg, rgba(5,6,10,0.55) 0%, rgba(5,6,10,0.85) 55%, rgba(5,6,10,0.97) 100%),
      url('/static/background.jpg') center center / cover no-repeat fixed;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: rgba(12, 16, 22, 0.72);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 18px;
    padding: 36px;
    max-width: 480px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 6px;
  }
  .brand img {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    object-fit: contain;
    background: rgba(255,255,255,0.04);
    padding: 4px;
  }
  .brand h1 {
    font-size: 19px;
    margin: 0;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .target-link {
    display: inline-block;
    color: var(--accent);
    font-size: 13px;
    text-decoration: none;
    margin-bottom: 24px;
    word-break: break-all;
    border-bottom: 1px solid transparent;
    transition: border-color .2s;
  }
  .target-link:hover { border-color: var(--accent); }

  .status-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 22px;
    border-radius: 14px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 22px;
  }
  .dot-wrap { position: relative; width: 20px; height: 20px; flex-shrink: 0; }
  .dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    box-shadow: 0 0 14px currentColor;
  }
  .dot.operational { background: var(--green); color: var(--green); }
  .dot.degraded { background: var(--orange); color: var(--orange); }
  .dot.down { background: var(--red); color: var(--red); }
  .dot.unknown { background: var(--gray); color: var(--gray); }
  .dot.operational::after {
    content: '';
    position: absolute; inset: 0;
    border-radius: 50%;
    background: var(--green);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0% { transform: scale(1); opacity: 0.6; }
    100% { transform: scale(2.4); opacity: 0; }
  }
  .status-text { font-size: 18px; font-weight: 700; }
  .status-label.operational { color: var(--green); }
  .status-label.degraded { color: var(--orange); }
  .status-label.down { color: var(--red); }
  .status-label.unknown { color: var(--gray); }
  .message { font-size: 13px; color: var(--muted); margin-top: 2px; }

  .details { font-size: 13.5px; color: var(--muted); line-height: 1.7; margin-bottom: 22px; }
  .details div { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .details div:last-child { border-bottom: none; }
  .details span:last-child { color: var(--text); font-weight: 500; }

  .visit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 13px;
    border-radius: 10px;
    background: var(--accent);
    color: #fff;
    text-decoration: none;
    font-weight: 600;
    font-size: 14px;
    transition: filter .2s, transform .2s;
  }
  .visit-btn:hover { filter: brightness(1.15); transform: translateY(-1px); }

  .refresh-note { text-align: center; font-size: 11.5px; color: var(--muted); margin-top: 18px; opacity: 0.8; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <img src="${SITE_LOGO}" alt="Logo" onerror="this.style.display='none'">
      <h1>Électrotechnique</h1>
    </div>
    <a class="target-link" href="${TARGET_URL}" target="_blank" rel="noopener" id="target">${TARGET_URL}</a>

    <div class="status-row">
      <div class="dot-wrap"><div class="dot unknown" id="dot"></div></div>
      <div>
        <div class="status-text status-label unknown" id="statusLabel">Vérification...</div>
        <div class="message" id="message"></div>
      </div>
    </div>

    <div class="details">
      <div><span>Code HTTP</span><span id="httpCode">-</span></div>
      <div><span>Temps de réponse</span><span id="responseTime">-</span></div>
      <div><span>Dernière vérification</span><span id="lastChecked">-</span></div>
    </div>

    <a class="visit-btn" href="${TARGET_URL}" target="_blank" rel="noopener">Visiter le site →</a>

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
