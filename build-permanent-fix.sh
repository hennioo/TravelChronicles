#!/bin/bash

echo "Starte Build mit permanenter Fix-Lösung..."

# Erstelle Verzeichnisstruktur
echo "Erstelle Verzeichnisstruktur..."
mkdir -p dist/uploads

# Erstelle Server-Datei in dist
echo "Erstelle Server-Code..."
cp permanent-fix-server.js dist/index.js

# Kopiere Uploads-Verzeichnis
echo "Kopiere Dateien..."
cp -r uploads/* dist/uploads/

# Erstelle package.json für Render
echo "Erstelle package.json..."
cat > dist/package.json << EOL
{
  "name": "susibert-map",
  "version": "1.0.0",
  "description": "Reisekarte mit permanentem Fix",
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

echo "=== Build erfolgreich abgeschlossen ==="