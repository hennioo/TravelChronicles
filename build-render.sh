#!/bin/bash
set -e

echo "🚀 Starte Build-Prozess..."

# NPM-Pakete installieren
echo "📦 Installiere Abhängigkeiten..."
npm install express pg multer sharp cookie-parser fs-extra dotenv

# Verzeichnisstruktur erstellen
echo "📁 Erstelle Verzeichnisse..."
mkdir -p dist/uploads
mkdir -p dist/public/uploads

# Server-Code kopieren
echo "📄 Kopiere Server-Code..."
cp circle-thumbnail-server.cjs dist/index.js

# Uploads kopieren (falls vorhanden)
echo "🖼️ Kopiere Uploads..."
if [ -d "uploads" ]; then
  cp -r uploads/* dist/uploads/ 2>/dev/null || echo "Keine Uploads gefunden"
fi

echo "✅ Build abgeschlossen"