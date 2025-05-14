#!/bin/bash

# Erzeuge die genaue Datei, die Render erwartet
set -ex
echo "=== Minimaler Build für Render ==="

# 1. Installiere Express für unseren Server
echo "Installiere Express und benötigte Pakete..."
npm install express

# 2. Stelle sicher, dass dist-Verzeichnis existiert
echo "Prüfe Verzeichnisstruktur..."
mkdir -p dist

# 3. Kopiere unsere Wartungsserver-Datei falls die vorhandene fehlt
echo "Kopiere Wartungsserver-Datei..."
if [ ! -f "dist/index.js" ]; then
  cp -v server.js dist/index.js
fi

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
    "express": "^4.18.3"
  }
}
EOF

echo "=== Build abgeschlossen ==="