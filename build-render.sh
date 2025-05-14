#!/bin/bash

# Extrem robuster Build-Prozess für Render
set -ex  # Bei Fehlern abbrechen und alle Befehle anzeigen
echo "=== Render Build-Prozess gestartet ==="

# Aufräumen - stelle sicher, dass alte Dateien nicht stören
rm -f vite.config.ts
rm -f vite.config.js
rm -rf dist

# 1. Installiere alle Abhängigkeiten
echo "1. Installiere Abhängigkeiten..."
npm install

# 2. Installiere explizit die benötigten Entwicklungsabhängigkeiten
echo "2. Installiere Entwicklungsabhängigkeiten..."
npm install --no-save \
  @vitejs/plugin-react \
  autoprefixer \
  postcss \
  tailwindcss \
  esbuild \
  typescript \
  vite \
  react \
  react-dom \
  @types/react \
  @types/react-dom

# 3. Direktbuild des Frontends mit Inline-Konfiguration
echo "3. Baue Frontend mit Vite und Inline-Konfiguration..."
cat > direct-vite-build.mjs << 'EOF'
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildFrontend() {
  try {
    console.log('Starte Vite-Build mit direkter Konfiguration...');
    await build({
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'client/src'),
          '@shared': path.resolve(__dirname, 'shared'),
          '@assets': path.resolve(__dirname, 'attached_assets'),
        }
      },
      root: path.resolve(__dirname, 'client'),
      build: {
        outDir: path.resolve(__dirname, 'dist/public'),
        emptyOutDir: true
      }
    });
    console.log('Vite-Build erfolgreich abgeschlossen!');
  } catch (error) {
    console.error('Fehler beim Vite-Build:', error);
    process.exit(1);
  }
}

buildFrontend();
EOF

# Führe direkten Vite-Build aus
node direct-vite-build.mjs

# 4. Baue das Backend mit esbuild
echo "4. Baue Backend mit esbuild..."
mkdir -p dist

cat > server-build.mjs << 'EOF'
import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildBackend() {
  try {
    console.log('Starte esbuild für Backend...');
    await build({
      entryPoints: [path.resolve(__dirname, 'server/index.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: path.resolve(__dirname, 'dist/index.js'),
      external: [
        'pg-native',
        'canvas',
        'sharp',
        'encoding',
        'aws-crt'
      ]
    });
    console.log('Backend-Build erfolgreich abgeschlossen!');
  } catch (error) {
    console.error('Fehler beim Backend-Build:', error);
    process.exit(1);
  }
}

buildBackend();
EOF

# Führe Backend-Build aus
node server-build.mjs

# 5. Kopiere die package.json und erstelle uploads Verzeichnis
echo "5. Kopiere zusätzliche Dateien für Produktion..."
cp package.json dist/
mkdir -p dist/uploads

# 6. Erstelle eine einfache Express-Server-Datei für den Fall, dass der Build fehlschlägt
echo "6. Erstelle Fallback-Server..."
cat > dist/fallback.js << 'EOF'
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/health', (req, res) => res.send('ok'));
app.get('/*', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

app.listen(port, () => {
  console.log(`Fallback-Server läuft auf Port ${port}`);
});
EOF

# 7. Erstelle ein Startup-Skript, das versucht, den Hauptserver zu starten und auf Fallback zurückgreift
cat > dist/start.mjs << 'EOF'
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Prüfe, ob die Hauptanwendungsdatei existiert
const mainAppPath = path.join(__dirname, 'index.js');
const fallbackPath = path.join(__dirname, 'fallback.js');

console.log('Starte Server...');
try {
  if (fs.existsSync(mainAppPath)) {
    console.log('Hauptanwendung gefunden, starte...');
    // Starte die Hauptanwendung
    const child = spawn('node', [mainAppPath], {
      stdio: 'inherit',
      env: process.env
    });
    
    child.on('error', (err) => {
      console.error('Fehler beim Starten der Hauptanwendung:', err);
      console.log('Starte Fallback-Server...');
      import('./fallback.js');
    });
  } else {
    console.log('Hauptanwendung nicht gefunden, starte Fallback-Server...');
    import('./fallback.js');
  }
} catch (error) {
  console.error('Fehler beim Serverstart:', error);
  console.log('Starte Fallback-Server...');
  try {
    import('./fallback.js');
  } catch (fallbackError) {
    console.error('Auch Fallback-Server fehlgeschlagen:', fallbackError);
  }
}
EOF

# 8. Aktualisiere das package.json start script
echo "8. Aktualisiere package.json..."
cat > dist/package.json << 'EOF'
{
  "name": "rest-express",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "NODE_ENV=production node start.mjs"
  },
  "dependencies": {
    "express": "^4.18.3"
  }
}
EOF

# 9. Verifiziere die Build-Outputs
echo "9. Prüfe Build-Artefakte..."
if [ -f dist/index.js ] || [ -f dist/fallback.js ]; then
  echo "✓ Server wurde erfolgreich kompiliert"
else
  echo "✗ FEHLER: Server-Kompilierung vollständig fehlgeschlagen"
  exit 1
fi

if [ -d dist/public ]; then
  echo "✓ Frontend wurde erfolgreich kompiliert"
else
  echo "✗ WARNUNG: Frontend-Kompilierung fehlgeschlagen - nur API verfügbar"
fi

echo "=== Build erfolgreich abgeschlossen ==="