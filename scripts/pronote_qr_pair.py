#!/usr/bin/env python3
"""
Appairage initial avec Pronote via la methode QR code (contourne l'ENT/EduConnect).

Lit sur stdin un JSON de la forme :
  {"qr_json": "{...contenu du QR code...}", "pin": "1234", "uuid": "identifiant-app"}

Affiche sur stdout un JSON avec les identifiants permanents obtenus
(a stocker pour les prochaines synchronisations via token_login) :
  {"success": true, "credentials": {"url":..., "username":..., "password":..., "uuid":...}}
"""
import sys
import json

def erreur(message):
    print(json.dumps({"success": False, "error": message}))
    sys.exit(1)

try:
    import pronotepy
except ImportError:
    erreur("Le module pronotepy n'est pas installe sur le serveur")

try:
    entree = json.loads(sys.stdin.read())
    qr_json = json.loads(entree["qr_json"]) if isinstance(entree["qr_json"], str) else entree["qr_json"]
    pin = entree["pin"]
    uuid_app = entree["uuid"]
except Exception as e:
    erreur(f"Donnees d'entree invalides : {e}")

try:
    client = pronotepy.Client.qrcode_login(qr_json, pin, uuid_app)
except Exception as e:
    erreur(f"Appairage QR code impossible : {e}")

if not client.logged_in:
    erreur("Le QR code ou le code PIN a ete refuse (le QR code n'est valable que 10 minutes)")

credentials = client.export_credentials()
print(json.dumps({"success": True, "credentials": credentials}))
