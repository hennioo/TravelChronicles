#!/bin/bash
echo "Erstelle einfachen Bild-Test-Server für Render..."

# Datenbank-URL ausgeben (ohne Inhalt)
if [ -n "$DATABASE_URL" ]; then
  echo "Datenbankverbindung ist konfiguriert."
else
  echo "WARNUNG: DATABASE_URL ist nicht gesetzt!"
fi

# Node-Version prüfen
echo "Node.js Version: $(node -v)"

# Server starten
echo "Starte Image-Test-Server..."
node simple-image-test.js