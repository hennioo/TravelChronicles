#!/bin/bash

# Build-Skript für die finale Fix-Version der TravelChronicles-App
echo "Erstelle Build mit finalen Fixes..."

# Verzeichnisstruktur erstellen
echo "Erstelle Verzeichnisstruktur..."
mkdir -p dist/uploads

# Server-Code kopieren
echo "Kopiere Server-Code..."
cp working-server.js dist/index.js

# Uploads kopieren
echo "Kopiere Uploads..."
cp -r uploads/* dist/uploads/ 2>/dev/null || :

# Stelle sicher, dass der couple.jpg vorhanden ist
echo "Stelle couple.jpg sicher..."
if [ ! -d "dist/uploads" ]; then
  mkdir -p dist/uploads
fi

if [ ! -f "dist/uploads/couple.jpg" ] && [ -f "uploads/couple.jpg" ]; then
  cp uploads/couple.jpg dist/uploads/
fi

if [ ! -f "dist/uploads/couple.jpg" ]; then
  # Fallback falls das Bild nicht existiert
  echo "ACHTUNG: couple.jpg nicht gefunden, erstelle Platzhalterbild..."
  convert -size 400x300 xc:#222222 -fill "#f59a0c" -pointsize 36 -gravity center -annotate +0+0 "Susibert" dist/uploads/couple.jpg 2>/dev/null || :
fi

# package.json erstellen
echo "Erstelle package.json..."
cat > dist/package.json << EOF
{
  "name": "rest-express",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "NODE_ENV=production node index.js"
  },
  "dependencies": {
    "cookie-parser": "^1.4.6",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "pg": "^8.11.3",
    "sharp": "^0.33.2"
  }
}
EOF

# Installiere Abhängigkeiten
echo "Installiere Abhängigkeiten..."
cd dist && npm install

echo "=== Build erfolgreich abgeschlossen ==="