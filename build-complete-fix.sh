#!/bin/bash

echo "Erstelle Build mit komplettem Fix (Upload + Detailansicht)..."

# Verzeichnisstruktur erstellen
echo "Erstelle Verzeichnisstruktur..."
mkdir -p dist/uploads

# Server-Datei kopieren
echo "Kopiere Server-Code..."
cp complete-fixed-server.js dist/index.js

# Uploads-Verzeichnis kopieren
echo "Kopiere Uploads..."
cp -r uploads/* dist/uploads/

# Package.json erstellen
echo "Erstelle package.json..."
cat > dist/package.json << EOL
{
  "name": "susibert-map",
  "version": "1.0.0",
  "description": "Weltkarte mit allen Fixes",
  "main": "index.js",
  "scripts": {
    "start": "NODE_ENV=production node index.js"
  },
  "engines": {
    "node": ">=14.0.0"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "multer": "^1.4.5-lts.1"
  }
}
EOL

# In das Verzeichnis wechseln und Abhängigkeiten installieren
echo "Installiere Abhängigkeiten..."
cd dist
npm install
cd ..

echo "=== Build komplett abgeschlossen ==="