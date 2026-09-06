# 📅 Valenca Studio — Emploi du temps

Application web d'emploi du temps scolaire **100% autonome** (aucune connexion à Pronote) :
tu crées toi-même les comptes élèves et le planning depuis un espace admin.

---

## 🧱 Stack technique

- **Backend** : Node.js + Express
- **Authentification** : mots de passe hashés (bcrypt), session via cookie chiffré
- **Données** : fichier JSON simple (voir note sur la persistance plus bas)
- **Frontend** : HTML / CSS / JS vanilla, écran de chargement (splash) optimisé mobile
- **Hébergement** : Render (Web Service)
- **Code source** : GitHub

---

## 🚀 Déploiement

### 1. GitHub

```bash
cd app
git init
git add .
git commit -m "Première version"
git remote add origin https://github.com/TON-PSEUDO/valenca-emploi-du-temps.git
git branch -M main
git push -u origin main
```

### 2. Render

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Web Service**.
2. Connecte ton dépôt GitHub `valenca-emploi-du-temps`.
3. Render lit `render.yaml` automatiquement (build `npm install`, start `npm start`,
   variables `SESSION_SECRET` et `ADMIN_PASSWORD` générées automatiquement).
4. Onglet **Environment** → note bien le mot de passe admin généré (ou fixe le tien).
5. **Create Web Service**. Après 2-3 minutes, ton app est en ligne sur
   `https://valenca-emploi-du-temps.onrender.com`.

### 3. ⚠️ Persistance des données

Par défaut (plan Free), Render **ne conserve pas** le système de fichiers entre deux
redéploiements : si tu crées des élèves et un planning puis que tu redéploies (ou que le
service redémarre après une longue inactivité), **tout est réinitialisé**.

Deux options :
- **Simple / gratuit** : accepte cette limite en test, ou recrée les comptes après chaque
  déploiement.
- **Définitif** : passe au plan **Starter** de Render, ajoute un disque persistant
  (décommente le bloc `disk:` dans `render.yaml`), et ajoute la variable d'environnement
  `DB_PATH=/data/db.json`. Les données survivent alors à tous les redéploiements.

---

## 🔑 Première connexion

Un compte **admin** est créé automatiquement au premier démarrage du serveur, avec les
identifiants définis dans les variables d'environnement `ADMIN_USERNAME` / `ADMIN_PASSWORD`
(par défaut `admin` / `admin123` en local — **change-les en production**).

1. Va sur `/admin` (ex. `https://ton-app.onrender.com/admin`).
2. Connecte-toi avec le compte admin.
3. Onglet **Établissement** : renseigne le nom de l'établissement (le logo Valenca Studio
   est déjà configuré par défaut, tu peux le remplacer par une autre URL d'image si besoin).
4. Onglet **Élèves** : crée un compte par élève (prénom, nom, classe, identifiant, mot de
   passe).
5. Onglet **Emploi du temps** : ajoute les cours un par un (classe, jour, horaires, matière,
   professeur, salle, couleur). Tous les élèves d'une même classe partagent automatiquement
   le même planning.

Chaque élève se connecte ensuite sur la page d'accueil (`/`) avec son identifiant et voit :
nom, prénom, classe, logo + nom de l'établissement, et son emploi du temps en vue semaine ou
jour.

---

## 💻 Lancer en local

```bash
npm install
cp .env.example .env      # personnalise SESSION_SECRET / ADMIN_USERNAME / ADMIN_PASSWORD
npm start
```

- Espace élève : [http://localhost:3000](http://localhost:3000)
- Espace admin : [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 📂 Structure du projet

```
app/
├── server.js               # Serveur Express (auth, routes admin, routes élève)
├── src/
│   ├── db.js                # Petite base de données JSON sur disque
│   └── crypto.js            # Chiffrement AES-256-GCM du cookie de session
├── public/
│   ├── index.html            # Espace élève (splash mobile + connexion + planning)
│   ├── admin.html            # Espace admin (élèves + planning + réglages)
│   ├── style.css             # Thème partagé (identité Valenca Studio)
│   ├── admin.css             # Styles additionnels de l'espace admin
│   ├── app.js                 # Logique frontend élève
│   ├── admin.js                # Logique frontend admin
│   └── logo.png                # Logo Valenca Studio
├── render.yaml
├── package.json
└── .env.example
```

## 🔒 Sécurité

- Mots de passe hashés avec **bcrypt**, jamais stockés en clair.
- Cookie de session **httpOnly**, chiffré (AES-256-GCM), `Secure` en production.
- Définis un `SESSION_SECRET` long et aléatoire en production (généré automatiquement par
  `render.yaml`).
- Change le mot de passe admin par défaut dès le premier déploiement.
