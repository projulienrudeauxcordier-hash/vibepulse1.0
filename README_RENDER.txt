VIBEPULSE - DEPLOIEMENT RENDER

IMPORTANT:
Tous ces fichiers doivent être à la RACINE du dépôt GitHub :

vibepulse-server.js
package.json
vibepulse-catalog.json
render.yaml

Sur Render :
1. New -> Web Service
2. Choisir le dépôt GitHub
3. Root Directory : laisser VIDE
4. Build Command : npm install
5. Start Command : npm start

L'erreur ENOENT /opt/render/project/src/package.json signifie que package.json n'était pas à la racine du dépôt.

Après déploiement, utilise l'URL HTTPS Render pour ouvrir VibePulse.
