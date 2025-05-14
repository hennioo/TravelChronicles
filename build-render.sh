#!/bin/bash

# Super-minimalistischer Build-Prozess für Render
set -ex  # Bei Fehlern abbrechen und alle Befehle anzeigen
echo "=== Minimalistischer Render Build-Prozess gestartet ==="

# Aufräumen - stelle sicher, dass alte Dateien nicht stören
rm -rf dist

# 1. Installiere nur Express für unseren Ersatzserver
echo "1. Installiere Express..."
npm install express

# 2. Erstelle dist-Verzeichnis
echo "2. Erstelle Verzeichnisstruktur..."
mkdir -p dist/public
mkdir -p dist/uploads

# 3. Erstelle eine statische HTML-Wartungsseite
echo "3. Erstelle statische Wartungsseite..."
cat > dist/public/index.html << 'EOF'
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Susibert - Wartungsmodus</title>
    <style>
        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            background-color: #1a1a1a;
            color: #f5f5f5;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100vh;
            text-align: center;
        }
        .container {
            max-width: 600px;
            padding: 20px;
        }
        h1 {
            color: #f59a0c;
            font-size: 2.5rem;
            margin-bottom: 1rem;
        }
        p {
            font-size: 1.1rem;
            line-height: 1.6;
            margin-bottom: 1.5rem;
        }
        .status {
            background-color: #282828;
            padding: 15px 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #f59a0c;
        }
        .emoji {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="emoji">🧳</div>
        <h1>Susibert</h1>
        <div class="status">
            <p><strong>Status:</strong> Wartungsmodus aktiv</p>
        </div>
        <p>Unsere Reisekarte befindet sich derzeit im Wartungsmodus. Wir arbeiten daran, die Website so schnell wie möglich wieder verfügbar zu machen.</p>
        <p>Solltest du Fragen haben, kontaktiere uns bitte direkt.</p>
    </div>
</body>
</html>
EOF

# 4. Erstelle eine einfache Express-Server-Datei
echo "4. Erstelle Express-Server..."
cat > dist/server.js << 'EOF'
const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

// Statische Dateien aus dem public-Verzeichnis bedienen
app.use(express.static('public'));

// API-Endpunkt für Healthchecks
app.get('/api/health', (req, res) => {
  res.send({
    status: 'maintenance',
    message: 'Server im Wartungsmodus',
    timestamp: new Date().toISOString()
  });
});

// Alle anderen Routen zur index.html umleiten
app.get('/*', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Server starten
app.listen(port, () => {
  console.log(`Wartungsserver läuft auf Port ${port}`);
});
EOF

# 5. Erstelle package.json für Node.js
echo "5. Erstelle package.json..."
cat > dist/package.json << 'EOF'
{
  "name": "susibert-maintenance",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "NODE_ENV=production node server.js"
  },
  "dependencies": {
    "express": "^4.18.3"
  }
}
EOF

echo "=== Build erfolgreich abgeschlossen ==="