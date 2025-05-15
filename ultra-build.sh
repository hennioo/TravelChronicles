#!/bin/bash

# Ultra-einfacher Build-Prozess für Render
set -ex

echo "=== Ultra-Simple Build für Render ==="

# Pakete installieren
npm install express pg multer sharp fs-extra

# Verzeichnisse erstellen
mkdir -p dist/uploads

# Dateien kopieren
cp -rv uploads/* dist/uploads/ || echo "Keine Uploads gefunden"

# Server-Datei kopieren
cp direct-fix-server.js dist/index.js

# Package.json erstellen
cat > dist/package.json << EOF
{
  "name": "susibert-map",
  "version": "1.0.0",
  "private": true,
  "engines": {
    "node": ">=14"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.33.1",
    "fs-extra": "^11.2.0"
  },
  "scripts": {
    "start": "node index.js"
  }
}
EOF

echo "=== Build abgeschlossen ==="