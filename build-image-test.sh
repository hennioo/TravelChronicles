#!/bin/bash

# Build-Skript für den reinen Bildupload-Test
echo "Starte Build für Bildupload-Test..."

# NPM-Pakete installieren
npm install express multer

# Verzeichnisstruktur erstellen
echo "Erstelle Verzeichnisstruktur..."
mkdir -p dist/uploads

# Server-Code erstellen
echo "Erstelle Server-Code..."
cp image-test.js dist/index.js

# package.json erstellen
echo "Erstelle package.json..."
cat > dist/package.json << EOL
{
  "name": "image-upload-test",
  "version": "1.0.0",
  "description": "Simple Image Upload Test",
  "main": "index.js",
  "type": "commonjs",
  "scripts": {
    "start": "NODE_ENV=production node index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOL

echo "=== Build erfolgreich abgeschlossen ==="