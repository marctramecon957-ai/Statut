# Valenca Studio — Emploi du temps 1MELEC

Application web (mobile + ordinateur) pour consulter et gérer l'emploi du temps
de la classe **1MELEC** du **Lycée Albert Londres**.

- Emploi du temps affiché sous forme de **frise horaire** (8h à 18h) : une
  barre par cours, sans texte visible dessus — survolez avec la souris pour
  un aperçu rapide (infobulle), cliquez pour voir le détail complet
  (matière, horaire, salle, professeur) dans une **fenêtre qui s'ouvre au
  premier plan**
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
   Cliquez sur **"Modifier"** dans le tableau pour corriger un créneau déjà
   créé (le formulaire se pré-remplit avec ses valeurs) sans avoir à le
   supprimer et le recréer. Les boutons **"Annulé aujourd'hui"** et
   **"Modifié aujourd'hui"** permettent de marquer manuellement un créneau
   comme annulé ou modifié pour son jour dans la semaine en cours — utile en
   secours si la synchronisation Pronote (voir plus bas) ne détecte pas un
   changement. Un marquage manuel n'est jamais écrasé par une
   synchronisation automatique ultérieure ; cliquez à nouveau sur le bouton
   pour le retirer.
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
depuis Pronote, via l'**export iCal officiel** de Pronote (fonctionnalité
native, aucune librairie tierce ni identifiant de connexion nécessaire).
Elle est **entièrement optionnelle** : sans configuration, le reste du site
fonctionne normalement.

### Obtenir l'URL iCal

1. Connectez-vous à Pronote dans un navigateur (avec le compte élève).
2. Allez dans l'onglet **Communication** → **Agenda**.
3. Cliquez sur **« Exporter l'agenda au format iCal »** (généralement en
   haut à droite).
4. Cochez au moins **« Votre emploi du temps »**.
5. Sous **« Synchronisation avec le gestionnaire d'agenda »**, copiez
   l'adresse indiquée (elle ressemble à
   `https://xxxx.index-education.net/pronote/ical/mesinformations.ics?icalsecurise=...`).
   Cette adresse contient un jeton d'accès secret : ne la partagez pas
   publiquement, traitez-la comme un mot de passe.

### Configurer sur Render

1. Dans les variables d'environnement du service Render, ajoutez :
   - `PRONOTE_ICAL_URL` : l'adresse copiée à l'étape précédente.
2. Redéployez. Une synchronisation se lance automatiquement 5 secondes après
   le démarrage, puis toutes les 20 minutes.
3. Dans l'espace admin, le bloc **"Synchronisation Pronote"** affiche le
   statut de la dernière synchro (réussie ou en erreur, avec le détail), et
   propose un bouton **"Synchroniser maintenant"** pour forcer une mise à jour.
4. Sur la frise, un cours annulé apparaît en rouge avec le texte **"Cours
   annulé"**, et un cours modifié en orange avec **"Modifié"**. Cliquer sur
   la barre affiche le détail complet dans la fenêtre.

**Important : la synchro Pronote ne crée pas l'emploi du temps toute seule.**
Elle ajoute seulement les annulations/modifications par-dessus des créneaux
déjà existants (créés à la main ou via l'import PDF). Si l'emploi du temps
est vide, utilisez le bouton **"Créer mon emploi du temps à partir de
Pronote"** (sous le bouton de synchro) : il crée automatiquement les
matières et créneaux à partir des cours de la semaine récupérés depuis
Pronote. Vous pourrez ensuite ajuster manuellement la répartition Semaine 1
/ Semaine 2 pour les cours en alternance, puisque Pronote ne donne que les
cours d'une semaine à la fois.

**Comment est détecté un cours annulé/modifié ?** Pronote n'utilise pas le
champ de statut standard du format iCal pour ça : l'information est écrite
directement dans le titre de l'événement (ex : *"Cours annulé : Mathématiques"*).
Le site détecte ces mots-clés automatiquement.

**Limites à connaître** : cette fonctionnalité dépend du format exact de
l'export iCal de Pronote, qui peut varier légèrement d'un établissement à
l'autre ou évoluer avec le temps. Si la détection d'annulation ne fonctionne
pas comme attendu, vérifiez le texte exact utilisé par Pronote pour signaler
une annulation dans votre établissement (regardez le contenu du fichier
`.ics` téléchargé, par exemple avec le bouton "Exporter" en récupération
ponctuelle) et faites-le moi savoir pour ajuster la détection si besoin.

## 4ter. Activer les notifications push (même app fermée)

Les notifications (« ton cours commence », « trou d'1h avant le prochain
cours ») fonctionnent même quand l'application/le navigateur est fermé, grâce
au **Web Push** (gratuit, aucun service payant). Il faut deux choses :

### A. Les clés VAPID (identité de ton serveur)

Ajoute ces variables d'environnement sur Render (Render → ton service →
**Environment**) :

```
VAPID_PUBLIC_KEY=BI_0tEUn0njAycNI6563Pq66-y2s2bR0ZM4fcW3dLL4vk9IyDtlfXUKQECx9Jf3R5fb5uQX8UQ_A11xsVjgfDVU
VAPID_PRIVATE_KEY=5AcjzQmwipQzjBL00LJC0etRMIkAPTnGJXFHB2iIr7Y
VAPID_SUBJECT=mailto:ton-email@exemple.com
CRON_SECRET=choisis-une-longue-chaine-aleatoire-ici
```

Ces clés sont fournies prêtes à l'emploi (générées spécialement pour ce
projet). Tu peux aussi en générer d'autres toi-même avec
`npx web-push generate-vapid-keys` si tu préfères. `CRON_SECRET` protège la
route de déclenchement contre un appel par n'importe qui : choisis une valeur
longue et aléatoire, à toi de la garder secrète.

### B. Le cron externe (le "réveil" toutes les 5 minutes)

Ton serveur ne vérifie l'emploi du temps que quand on l'appelle — il faut donc
un déclencheur externe et gratuit :

1. Crée un compte gratuit sur [cron-job.org](https://cron-job.org) (ou un
   service équivalent : EasyCron, UptimeRobot en mode "monitor" HTTP, etc.).
2. Crée une nouvelle tâche ("cronjob") qui appelle, toutes les **5 minutes**,
   l'URL :
   ```
   https://TON-APP.onrender.com/api/cron/verifier-notifications?secret=TON_CRON_SECRET
   ```
   (remplace `TON-APP` par le nom réel de ton service Render, et
   `TON_CRON_SECRET` par la valeur choisie ci-dessus).
3. C'est tout — chaque appel vérifie l'heure actuelle pour chaque élève abonné
   et envoie une notification si un cours commence ou si un trou ≥ 1h démarre.

Cet appel régulier a un effet bonus sur le plan gratuit de Render : il évite
que le service ne s'endorme après 15 minutes d'inactivité.

### C. Activer côté élève/admin

Dans l'emploi du temps, clique sur **🔔 Activer les notifications**, puis
accepte la demande d'autorisation du navigateur. C'est un abonnement par
appareil : à refaire sur chaque téléphone/navigateur où tu veux être notifié.

**Limite à connaître** : Safari sur iPhone nécessite que l'app soit d'abord
**installée sur l'écran d'accueil** (bouton "📲 Installer sur mon téléphone")
avant que les notifications push fonctionnent — c'est une restriction
d'Apple, pas de ce projet.

## 4quater. Notifications Telegram (alternative plus fiable)

Le push web dépend de réglages Android/navigateur parfois capricieux
(canaux de notification par site, mise en veille agressive de certains
téléphones...). Les notifications Telegram évitent ce problème : elles
passent par l'appli Telegram elle-même, avec son propre système de
notifications indépendant du navigateur.

### A. Créer le bot (une seule fois, ~2 minutes)

1. Sur Telegram, cherche **@BotFather** (le bot officiel qui crée des bots)
   et démarre une discussion avec lui.
2. Envoie `/newbot`, puis choisis un nom et un nom d'utilisateur pour ton
   bot (doit finir par "bot", ex. `EmploiDuTempsLyceeBot`).
3. BotFather te donne un **token** du type
   `123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. Copie-le.
4. Sur Render, va dans **Environment** et ajoute la variable
   `TELEGRAM_BOT_TOKEN` avec ce token. Redéploie.

### B. Activer côté élève/admin

Clique sur **📨 Notifications Telegram** dans l'app. Un message te propose
d'ouvrir Telegram et de démarrer la discussion avec le bot — accepte, appuie
sur "Démarrer", et c'est lié automatiquement. Reclique sur le bouton à tout
moment pour envoyer un message de test.

Aucune configuration supplémentaire n'est nécessaire côté cron : le même
appel toutes les 5 minutes (voir section précédente) vérifie aussi les
messages Telegram entrants et envoie les notifications Telegram.

Tu peux activer le push **et** Telegram en même temps si tu veux les deux.

## 5. Structure du projet

```
emploi-du-temps/
├── server.js              # Serveur Express (API + pages)
├── db/
│   ├── database.js        # Connexion SQLite + création des tables
│   ├── seed.js            # Création du compte admin par défaut
│   ├── pdf-extract.js     # Analyse et détection automatique depuis un PDF
│   ├── pronote-sync.js    # Synchronisation Pronote via export iCal
│   └── notifications.js   # Calcul et envoi des notifications push
├── public/
│   ├── index.html         # Page unique (login, emploi du temps, admin)
│   ├── style.css          # Thème visuel (repris du logo)
│   ├── app.js             # Logique front-end
│   └── assets/logo.png    # Logo Valenca Studio
├── package.json
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

