#!/bin/bash

# Detailliertes Build-Skript für Render
set -e  # Bei Fehlern abbrechen
echo "=== Render Build-Prozess gestartet ==="

# 1. Installiere alle Abhängigkeiten
echo "1. Installiere Abhängigkeiten..."
npm install

# 2. Installiere explizit die benötigten Entwicklungsabhängigkeiten
echo "2. Installiere Entwicklungsabhängigkeiten..."
npm install --no-save @vitejs/plugin-react autoprefixer postcss tailwindcss esbuild typescript vite react react-dom @types/react @types/react-dom path

# 3. Erstelle eine einfache Vite-Konfiguration direkt im Skript
echo "3. Erstelle vereinfachte Vite-Konfiguration..."
cat > simplified-vite.config.js << 'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
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
EOF

# 4. Ersetze die aktuelle Vite-Konfiguration
echo "4. Setze vereinfachte Konfiguration..."
mv simplified-vite.config.js vite.config.js

# 5. Baue das Frontend
echo "5. Baue Frontend mit Vite..."
npx vite build

# 6. Baue das Backend
echo "6. Baue Backend mit esbuild..."
npx esbuild server/index.ts --platform=node --bundle --packages=external --outfile=dist/index.js --format=cjs

# 7. Kopiere die package.json für NODE_PATH-Auflösung
echo "7. Kopiere zusätzliche Dateien für Produktion..."
cp package.json dist/

# 8. Verifiziere die Build-Outputs
echo "8. Prüfe Build-Artefakte..."
if [ -f dist/index.js ]; then
  echo "✓ Backend wurde erfolgreich kompiliert"
else
  echo "✗ FEHLER: Backend-Kompilierung fehlgeschlagen"
  exit 1
fi

if [ -d dist/public ]; then
  echo "✓ Frontend wurde erfolgreich kompiliert"
else
  echo "✗ FEHLER: Frontend-Kompilierung fehlgeschlagen"
  exit 1
fi

echo "=== Build erfolgreich abgeschlossen ==="