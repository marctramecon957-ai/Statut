#!/usr/bin/env python3
"""
Se connecte a Pronote (via pronotepy) et recupere les cours de la semaine
courante (lundi a samedi), avec leur statut (normal / annule / modifie).
Affiche le resultat en JSON sur stdout pour que le serveur Node puisse le lire.

Variables d'environnement attendues :
  PRONOTE_URL       - URL Pronote (ex: https://xxxx.index-education.net/pronote/eleve.html?identifiant=XXXX)
  PRONOTE_USERNAME  - identifiant de connexion (ENT ou Pronote selon le cas)
  PRONOTE_PASSWORD  - mot de passe correspondant
  PRONOTE_ENT       - optionnel : nom de l'ENT si l'etablissement en utilise un
                       (ex: "ent_auvergnerhonealpe"). Laisser vide pour une
                       connexion directe a Pronote sans ENT.
"""
import sys
import os
import json
from datetime import date, timedelta

def erreur(message):
    print(json.dumps({"success": False, "error": message}))
    sys.exit(1)

try:
    import pronotepy
    from pronotepy import ent as pronote_ent
except ImportError:
    erreur("Le module pronotepy n'est pas installe sur le serveur")

url = os.environ.get("PRONOTE_URL")
username = os.environ.get("PRONOTE_USERNAME")
password = os.environ.get("PRONOTE_PASSWORD")
ent_nom = (os.environ.get("PRONOTE_ENT") or "").strip()

if not url or not username or not password:
    erreur("Variables PRONOTE_URL / PRONOTE_USERNAME / PRONOTE_PASSWORD manquantes")

try:
    if ent_nom:
        fonction_ent = getattr(pronote_ent, ent_nom, None)
        if fonction_ent is None:
            erreur(f"ENT '{ent_nom}' inconnu de pronotepy (verifiez PRONOTE_ENT)")
        client = pronotepy.Client(url, username=username, password=password, ent=fonction_ent)
    else:
        client = pronotepy.Client(url, username=username, password=password)
except Exception as e:
    erreur(f"Connexion a Pronote impossible : {e}")

if not client.logged_in:
    erreur("Identifiants Pronote refuses")

aujourdhui = date.today()
lundi = aujourdhui - timedelta(days=aujourdhui.weekday())
samedi = lundi + timedelta(days=5)

evenements = []
JOURS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

try:
    lecons = client.lessons(lundi, samedi)
except Exception as e:
    erreur(f"Impossible de recuperer l'emploi du temps : {e}")

for lecon in lecons:
    try:
        annule = bool(getattr(lecon, "canceled", False))
        statut_brut = getattr(lecon, "status", None)
        deplace = bool(getattr(lecon, "outing", False))

        statut = "annule" if annule else ("modifie" if statut_brut else "normal")

        matiere = ""
        try:
            matiere = lecon.subject.name if lecon.subject else ""
        except Exception:
            matiere = ""

        evenements.append({
            "date": lecon.start.strftime("%Y-%m-%d"),
            "jour": JOURS_FR[lecon.start.weekday()],
            "heure_debut": lecon.start.strftime("%H:%M"),
            "heure_fin": lecon.end.strftime("%H:%M"),
            "matiere_nom": matiere,
            "salle": getattr(lecon, "classroom", "") or "",
            "professeur": getattr(lecon, "teacher_name", "") or "",
            "statut": statut,
            "commentaire": statut_brut or "",
        })
    except Exception:
        continue  # ignore une lecon mal formee plutot que de tout faire echouer

print(json.dumps({"success": True, "evenements": evenements}))
