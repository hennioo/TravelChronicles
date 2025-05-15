#!/bin/bash

# Erzeuge die genaue Datei, die Render erwartet
set -ex
echo "=== Minimaler Build für Render ==="

# 1. Installiere Express und weitere benötigte Pakete
echo "Installiere benötigte Pakete..."
npm install express pg multer

# 2. Stelle sicher, dass dist-Verzeichnis existiert
echo "Prüfe Verzeichnisstruktur..."
mkdir -p dist
mkdir -p dist/uploads

# 3. Kopiere unsere Server-Dateien
echo "Kopiere Server-Dateien..."
# Immer die aktuelle Version verwenden
cp -v server.js dist/index.js
cp -v server.js render-final.js
cp -v server.js final-server.js
cp -v server.js final-render.js
cp -v server.js map-render.js
cp -v server.js simple-final.js
cp -v server.js fixed-render.js

# Stelle sicher, dass Uploads-Verzeichnis existiert und Bilder kopiert sind
echo "Kopiere Uploads-Verzeichnis..."
cp -rv uploads/* dist/uploads/

# 4. Benutzerdefinierte package.json für Start-Befehl, falls Procfile ignoriert wird
echo "Erstelle package.json Backup..."
cp package.json package.json.original
cat > package.json << 'EOF'
{
  "name": "rest-express",
  "version": "1.0.0",
  "type": "commonjs",
  "license": "MIT",
  "scripts": {
    "start": "NODE_ENV=production node dist/index.js",
    "dev": "NODE_ENV=development node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.3",
    "pg": "^8.11.3",
    "multer": "^1.4.5-lts.1"
  }
}
EOF

echo "=== Build abgeschlossen ==="