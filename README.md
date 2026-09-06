# Status Site

Page de statut qui surveille en continu si https://electrotechnique-snvq.onrender.com est :
- 🟢 **Opérationnel** — répond correctement et rapidement
- 🟠 **Dégradé** — répond mais lentement ou avec un code inattendu
- 🔴 **Hors ligne** — ne répond pas ou erreur serveur (5xx)

Le check se fait **côté serveur** (toutes les 60 secondes), donc pas de problème de CORS.

## Déploiement

### 1. Mettre le code sur GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TON_USER/TON_REPO.git
git push -u origin main
```

### 2. Déployer sur Render

1. Va sur https://dashboard.render.com
2. Clique sur **New +** → **Web Service**
3. Connecte ton repo GitHub
4. Configure :
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Environment** : Node
5. (Optionnel) Ajoute une variable d'environnement `TARGET_URL` si tu veux surveiller un autre site
6. Clique sur **Create Web Service**

Render te donnera une URL du type `https://ton-status.onrender.com` — c'est ta page de statut.

## Lancer en local

```bash
npm install
npm start
```

Puis ouvre http://localhost:3000
