#!/bin/bash

# Build-Skript für die einfache Fix-Version der TravelChronicles-App
echo "Erstelle Build mit Detailansicht-Fix..."

# Verzeichnisstruktur erstellen
echo "Erstelle Verzeichnisstruktur..."
mkdir -p dist/uploads

# Server-Code kopieren
echo "Kopiere Server-Code..."
cp working-server.js dist/index.js
cp location-detail-fix.js dist/location-detail-fix.js

# Uploads kopieren
echo "Kopiere Uploads..."
cp -r uploads/* dist/uploads/ 2>/dev/null || :

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

# Server-Code modifizieren um den Fix einzubinden
echo "Integriere den Detailansicht-Fix in den Server-Code..."
sed -i 's|</head>|<script src="/location-detail-fix.js"></script></head>|' dist/index.js

# Installiere Abhängigkeiten
echo "Installiere Abhängigkeiten..."
cd dist && npm install

echo "=== Build erfolgreich abgeschlossen ==="