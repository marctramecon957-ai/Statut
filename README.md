# Valenca Studio — Emploi du temps 1MELEC

Application web (mobile + ordinateur) pour consulter et gérer l'emploi du temps
de la classe **1MELEC** du **Lycée Albert Londres**.

- Emploi du temps affiché sous forme de **frise horaire** (8h à 18h) : une
  barre par cours, sans texte visible dessus — cliquez dessus pour voir le
  détail (matière, horaire, salle, professeur) dans une **fenêtre qui
  s'ouvre au premier plan**
- Navigation par onglets **Lundi, Mardi, Mercredi, Jeudi, Vendredi, Samedi,
  Semaine** (vue combinée de tous les jours), avec bascule **Semaine 1 /
  Semaine 2**
- Import PDF avec **détection automatique des créneaux** : uploadez un emploi
  du temps existant au format PDF, les cours (jour, horaires, matière, salle)
  sont détectés automatiquement et proposés dans un tableau modifiable —
  corrigez ce qu'il faut, puis validez pour créer les créneaux en un clic
- Matières créées librement depuis l'espace admin (sans couleur imposée)
- Espace administrateur protégé par identifiants
- Comptes élèves avec mot de passe provisoire : au premier login, l'utilisateur
  doit choisir un nouveau mot de passe avant d'accéder à l'emploi du temps
- Connexion persistante : une fois connecté, plus besoin de se reconnecter à
  chaque visite (session valable 1 an)
- Écran de chargement au démarrage de l'application
- Installable sur téléphone comme une vraie application (PWA)
- Thème visuel repris du logo fourni (fond sombre / crème)
- Synchronisation optionnelle avec **Pronote** : récupère automatiquement les
  cours annulés ou modifiés et les affiche sur la frise (barre grisée avec
  motif pour les cours annulés, orange pour les cours modifiés)

## 1. Installation en local

Prérequis : [Node.js](https://nodejs.org/) version 18 ou plus.

```bash
npm install
cp .env.example .env
npm start
```

Le site est ensuite disponible sur : http://localhost:3000

Un compte administrateur est créé automatiquement au premier démarrage :
- **Utilisateur** : `admin`
- **Mot de passe** : `ChangeMoi123!`

⚠️ Connectez-vous avec ce compte et changez immédiatement le mot de passe
(vous y serez invité automatiquement à la première connexion).

Vous pouvez personnaliser ces identifiants avant le premier démarrage en
modifiant `ADMIN_USERNAME` et `ADMIN_PASSWORD` dans le fichier `.env`.

## 2. Utilisation

### En tant qu'administrateur
1. Connectez-vous avec le compte admin.
2. Cliquez sur **"Espace admin"** en haut de l'emploi du temps.
3. Ajoutez vos **matières** (aucune couleur n'est appliquée automatiquement).
4. Créez les **créneaux** (jour, heure de début, heure de fin, matière, salle,
   professeur) — les horaires proposés vont de 8h à 18h. Pour chaque créneau,
   choisissez s'il a lieu **les deux semaines**, uniquement en **semaine 1**,
   ou uniquement en **semaine 2** (utile pour les emplois du temps alternés).
5. Pour aller plus vite, utilisez l'**import PDF** : uploadez un ancien
   emploi du temps au format PDF. Les créneaux (jour, horaires, matière,
   salle) sont **détectés automatiquement** en analysant la position de
   chaque bloc dans le tableau du PDF, et affichés dans un tableau
   modifiable. **Cette détection reste une aide, pas une garantie à 100%** :
   sur les emplois du temps très denses (plusieurs cours collés sans espace
   sur une même case), certains blocs peuvent être mal découpés ou fusionnés
   par erreur. Vérifiez toujours chaque ligne avant de valider — retirez,
   corrigez ou ajoutez des lignes selon besoin, puis cliquez sur
   **"Créer ces créneaux"** pour les enregistrer d'un coup (les matières
   manquantes sont créées automatiquement).
5. Créez des **comptes utilisateurs** (élèves) avec un nom d'utilisateur et un
   mot de passe provisoire. Vous pouvez aussi réinitialiser le mot de passe
   d'un compte existant à tout moment (bouton "Réinitialiser").

### En tant qu'élève
1. Se connecter avec le nom d'utilisateur et le mot de passe provisoire fourni
   par l'administrateur.
2. Un écran demande automatiquement de choisir un nouveau mot de passe.
3. Une fois validé, l'emploi du temps de la classe s'affiche (vue tableau sur
   ordinateur, vue liste par jour sur mobile).

## 3. Mettre le projet sur GitHub

```bash
cd emploi-du-temps
git init
git add .
git commit -m "Initial commit - Valenca Studio emploi du temps"
git branch -M main
git remote add origin https://github.com/VOTRE-UTILISATEUR/VOTRE-DEPOT.git
git push -u origin main
```

(Remplacez l'URL par celle de votre propre dépôt GitHub, créé au préalable sur
github.com.)

## 4. Déployer sur Render

1. Allez sur [render.com](https://render.com) et connectez votre compte GitHub.
2. Cliquez sur **New +** → **Web Service**.
3. Sélectionnez le dépôt GitHub que vous venez de créer.
4. Render détecte automatiquement le fichier `render.yaml` fourni dans ce
   projet (Blueprint). Sinon, configurez manuellement :
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Environment** : `Node`
5. Renseignez les variables d'environnement demandées :
   - `SESSION_SECRET` (générée automatiquement si vous utilisez le Blueprint)
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
6. Important : pour que les données (emploi du temps, comptes) soient conservées
   entre les redéploiements, ajoutez un **disque persistant** (Render → onglet
   "Disks") monté sur le dossier `db/` — c'est déjà prévu dans `render.yaml`.
7. Cliquez sur **Create Web Service**. Render installe les dépendances et
   démarre le site automatiquement. Une URL du type
   `https://votre-service.onrender.com` vous est fournie.

## 4bis. Activer la synchronisation Pronote (optionnel)

Cette fonctionnalité récupère automatiquement les cours annulés/modifiés
depuis Pronote. Elle est **entièrement optionnelle** : sans configuration,
le reste du site fonctionne normalement.

1. **Modifier le Build Command sur Render** pour installer aussi Python :
   remplacez `npm install` par :
   ```
   npm install && pip install -r requirements.txt --break-system-packages
   ```
   (Les images Node de Render incluent déjà Python 3 et pip.)
2. Dans les variables d'environnement du service Render, ajoutez :
   - `PRONOTE_URL` : l'URL directe de la page Pronote de l'établissement
     (ex: `https://xxxx.index-education.net/pronote/eleve.html?identifiant=XXXX`)
   - `PRONOTE_USERNAME` : l'identifiant de connexion (ENT ou Pronote selon le cas)
   - `PRONOTE_PASSWORD` : le mot de passe correspondant
   - `PRONOTE_ENT` (uniquement si l'établissement passe par un ENT pour se
     connecter à Pronote — ouvrez votre lien Pronote en navigation privée : si
     une page d'ENT/portail du lycée s'affiche avant l'écran Pronote, c'est le
     cas). Indiquez alors le nom technique de l'ENT utilisé par `pronotepy`,
     par exemple `ent_auvergnerhonealpe` pour l'ENT Auvergne-Rhône-Alpes.
     La liste complète des ENT supportés est visible dans le code source de
     pronotepy (module `pronotepy.ent`). Laissez cette variable vide si la
     connexion à Pronote se fait directement sans ENT.
3. Redéployez. Une synchronisation se lance automatiquement 5 secondes après
   le démarrage, puis toutes les 20 minutes.
4. Dans l'espace admin, le bloc **"Synchronisation Pronote"** affiche le
   statut de la dernière synchro (réussie ou en erreur, avec le détail), et
   propose un bouton **"Synchroniser maintenant"** pour forcer une mise à jour.
5. Sur la frise, un cours annulé apparaît avec un motif rayé, et un cours
   modifié en orange. Cliquer dessus affiche le détail dans la fenêtre.

**Limites à connaître** : Pronote n'a pas d'API officielle ; cette
fonctionnalité s'appuie sur la librairie communautaire `pronotepy`, qui
imite une connexion navigateur classique. Elle peut cesser de fonctionner si
Pronote change son fonctionnement interne, et certains établissements
bloquent ce type de connexion automatisée. Ce n'est ni illégal ni contraire
aux CGU pour un usage personnel, mais ce n'est pas une intégration garantie
dans la durée.

## 5. Structure du projet

```
emploi-du-temps/
├── server.js              # Serveur Express (API + pages)
├── db/
│   ├── database.js        # Connexion SQLite + création des tables
│   ├── seed.js            # Création du compte admin par défaut
│   ├── pdf-extract.js     # Analyse et détection automatique depuis un PDF
│   └── pronote-sync.js    # Orchestration de la synchronisation Pronote
├── scripts/
│   └── pronote_sync.py    # Script Python (pronotepy) appelé par le serveur
├── public/
│   ├── index.html         # Page unique (login, emploi du temps, admin)
│   ├── style.css          # Thème visuel (repris du logo)
│   ├── app.js             # Logique front-end
│   └── assets/logo.png    # Logo Valenca Studio
├── package.json
├── requirements.txt       # Dépendance Python (pronotepy)
├── render.yaml            # Configuration de déploiement Render
└── .env.example
```

## 6. Notes techniques

- Base de données : SQLite (fichier local, pas de service externe à payer).
- Mots de passe stockés sous forme hachée (`bcryptjs`), jamais en clair.
- Sessions utilisateurs stockées côté serveur (`express-session` +
  `connect-sqlite3`), cookie valable 1 an (connexion persistante).
- Aucune couleur n'est associée automatiquement aux matières, comme demandé :
  seul le nom de la matière est affiché.
- La synchronisation Pronote est optionnelle et n'affecte pas le
  fonctionnement du reste du site si elle n'est pas configurée ou si elle
  échoue.

