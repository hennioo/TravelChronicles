#!/bin/bash
echo "=== Starte super simple Bild-Test ==="

# Node-Version anzeigen
echo "Node.js Version: $(node -v)"

# Abhängigkeiten installieren, falls nötig
if [ ! -d "node_modules" ] || [ ! -d "node_modules/express" ]; then
  echo "Installiere benötigte Abhängigkeiten..."
  npm install express pg multer 
fi

# Serverstart
echo "Starte Test-Server..."
node super-simple-test.js