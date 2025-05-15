#!/bin/bash

# Dieses Skript führt den Datenbank-Fix direkt auf dem Server aus
# Es erfordert Node.js und die notwendigen Module (express und pg)

echo "=== Direkte Datenbank-Reparatur ==="

# Prüfen, ob die notwendigen Module installiert sind
npm list express pg || npm install express pg

# Den Reparatur-Server temporär ausführen
node fix-db-api.js