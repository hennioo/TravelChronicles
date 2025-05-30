#!/bin/bash

# Ultimate Render Build Script
echo "Starte ultimativen Build-Prozess für Render..."

# NPM-Pakete installieren
npm install express pg multer sharp dotenv cookie-parser fs-extra

# Verzeichnisstruktur erstellen
echo "Erstelle Verzeichnisstruktur..."
mkdir -p dist/uploads
mkdir -p dist/public/uploads

# Server-Code erstellen
echo "Erstelle Server-Code..."
cat render-image-fix.js > dist/index.js

# Dateien kopieren
echo "Kopiere Dateien..."
mkdir -p dist/uploads
cp -rv uploads/* dist/uploads/ 2>/dev/null || echo "Keine Uploads vorhanden oder Fehler beim Kopieren"

# package.json für Render erstellen
echo "Erstelle package.json..."
cat > dist/package.json << EOL
{
  "name": "travelchronicles",
  "version": "1.0.0",
  "description": "Travel Map Application",
  "main": "index.js",
  "scripts": {
    "start": "NODE_ENV=production node index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.33.1",
    "dotenv": "^16.3.1",
    "cookie-parser": "^1.4.6",
    "fs-extra": "^11.2.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOL

echo "=== Build erfolgreich abgeschlossen ==="