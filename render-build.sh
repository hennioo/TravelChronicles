#!/bin/bash

# Super robuster Build-Prozess für Render-Deployment
set -ex

echo "=== Render-kompatiblen Build starten ==="

# 1. Pakete installieren
echo "Installiere benötigte Pakete..."
npm install express pg multer sharp fs-extra

# 2. Verzeichnisse erstellen
echo "Erstelle Verzeichnisstruktur..."
mkdir -p dist/uploads
mkdir -p dist/public
mkdir -p dist/public/uploads

# 3. Dateien kopieren
echo "Kopiere Dateien..."
cp -v render-server.js dist/index.js
cp -v map.html dist/map.html
cp -v uploads/couple.jpg dist/uploads/ || echo "Keine couple.jpg gefunden"
cp -v uploads/couple.png dist/uploads/ || echo "Keine couple.png gefunden"
cp -rv uploads/* dist/uploads/ || echo "Keine Uploads gefunden"

# 4. package.json für Produktion erstellen
echo "Erstelle package.json für Produktion..."
cat > package.json << EOF
{
  "name": "travelchronicles",
  "version": "1.0.0",
  "type": "commonjs",
  "license": "MIT",
  "scripts": {
    "start": "NODE_ENV=production node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.3",
    "pg": "^8.11.3",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.33.2",
    "fs-extra": "^11.2.0"
  }
}
EOF

echo "=== Build für Render abgeschlossen ==="