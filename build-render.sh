#!/bin/bash

# Erzeuge die genaue Datei, die Render erwartet
set -ex
echo "=== Minimaler Build für Render ==="

# 1. Installiere Express und weitere benötigte Pakete
echo "Installiere benötigte Pakete..."
npm install express pg multer sharp

# 2. Stelle sicher, dass alle benötigten Verzeichnisse existieren
echo "Prüfe Verzeichnisstruktur..."
mkdir -p dist
mkdir -p dist/uploads
mkdir -p dist/public
mkdir -p dist/public/uploads

# 3. Kopiere unsere Server-Dateien
echo "Kopiere Server-Dateien..."
# Immer die aktuelle Version verwenden
cp -v server.js dist/index.js
cp -v server.js render-final.js
cp -v server.js final-server.js
cp -v server.js final-render.js
cp -v server.js map-render.js
cp -v server.js simple-final.js
cp -v server.js fixed-render.js

# Kopiere auch alle unterstützenden JavaScript-Dateien, die importiert werden
echo "Kopiere JavaScript-Module..."
cp -v new-map-view.js dist/new-map-view.js 
cp -v map-layout.js dist/map-layout.js
# Andere Module, die importiert werden könnten
cp -v *.js dist/ || echo "Warnung: Konnte nicht alle JavaScript-Dateien kopieren"

# Setze Umgebungsvariable für Render
echo "RENDER=true" >> .env
echo "NODE_ENV=production" >> .env
echo "export RENDER=true" >> ~/.bashrc
echo "export NODE_ENV=production" >> ~/.bashrc

# Stelle sicher, dass Uploads-Verzeichnis existiert und Bilder kopiert sind
echo "Kopiere Uploads-Verzeichnis..."
# In alle möglichen Verzeichnisse kopieren, um sicherzustellen, dass sie unabhängig vom Pfad gefunden werden
mkdir -p dist/uploads
mkdir -p dist/public/uploads
mkdir -p public/uploads

# Kopiere in alle möglichen Verzeichnisse
cp -rv uploads/* dist/uploads/ || echo "Warnung: Konnte nicht in dist/uploads kopieren"
cp -rv uploads/* dist/public/uploads/ || echo "Warnung: Konnte nicht in dist/public/uploads kopieren"
cp -rv uploads/* public/uploads/ || echo "Warnung: Konnte nicht in public/uploads kopieren"

# Kopiere auch direkt nach /dist, da manche Pfade dort suchen
cp -rv uploads/* dist/ || echo "Warnung: Konnte nicht direkt in dist/ kopieren"

# Auch ins Root-Verzeichnis für absolute URLs ohne Präfix
cp -rv uploads/* ./ || echo "Warnung: Konnte nicht ins Root-Verzeichnis kopieren"

# Erstelle eine Datei mit allen kopierten Dateien zur Diagnose
echo "Kopierte Dateien in dist/uploads:" > dist/uploads-info.txt
ls -la dist/uploads/ >> dist/uploads-info.txt
echo "Kopierte Dateien in public/uploads:" >> dist/uploads-info.txt
ls -la public/uploads/ >> dist/uploads-info.txt

# Kopiere couple.jpg und couple.png in alle möglichen Verzeichnisse für den absoluten Notfall
cp -v uploads/couple.jpg dist/ || echo "Warnung: Konnte couple.jpg nicht in dist/ kopieren"
cp -v uploads/couple.png dist/ || echo "Warnung: Konnte couple.png nicht in dist/ kopieren"
cp -v uploads/couple.jpg ./ || echo "Warnung: Konnte couple.jpg nicht ins Root-Verzeichnis kopieren"
cp -v uploads/couple.png ./ || echo "Warnung: Konnte couple.png nicht ins Root-Verzeichnis kopieren"

# Stelle sicher, dass keine Berechtigungsprobleme auftreten
chmod -R 755 dist/uploads/ || true
chmod -R 755 dist/public/uploads/ || true
chmod -R 755 public/uploads/ || true
chmod -R 755 dist/*.jpg dist/*.png || true

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
    "express": "^4.18.3",
    "pg": "^8.11.3",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.33.2"
  }
}
EOF

# 5. Zusätzliche Anpassungen für Render-Umgebung
echo "Erstelle Symlinks für häufige Bildpfade..."
ln -sf ./uploads /opt/render/project/src/uploads 2>/dev/null || echo "Konnte Symlink für /opt/render/project/src/uploads nicht erstellen"
ln -sf ./uploads /opt/render/project/src/dist/uploads 2>/dev/null || echo "Konnte Symlink für /opt/render/project/src/dist/uploads nicht erstellen"

# 6. Kopiere couple.jpg und couple.png in absolute Pfade für Render
mkdir -p /opt/render/project/src/uploads 2>/dev/null || echo "Konnte /opt/render/project/src/uploads nicht erstellen"
mkdir -p /opt/render/project/src/dist/uploads 2>/dev/null || echo "Konnte /opt/render/project/src/dist/uploads nicht erstellen"
cp -v uploads/couple.jpg /opt/render/project/src/uploads/ 2>/dev/null || echo "Konnte couple.jpg nicht in /opt/render/project/src/uploads/ kopieren"
cp -v uploads/couple.png /opt/render/project/src/uploads/ 2>/dev/null || echo "Konnte couple.png nicht in /opt/render/project/src/uploads/ kopieren"
cp -v uploads/couple.jpg /opt/render/project/src/dist/uploads/ 2>/dev/null || echo "Konnte couple.jpg nicht in /opt/render/project/src/dist/uploads/ kopieren" 
cp -v uploads/couple.png /opt/render/project/src/dist/uploads/ 2>/dev/null || echo "Konnte couple.png nicht in /opt/render/project/src/dist/uploads/ kopieren"

# 7. Erstelle eine .htaccess-Datei für zusätzliche Konfiguration
echo "Erstelle .htaccess für Bild-Fallbacks..."
cat > dist/.htaccess << 'EOF'
# Aktiviere CORS für Bilder
<IfModule mod_headers.c>
    <FilesMatch "\.(jpg|jpeg|png|gif|heic)$">
        Header set Access-Control-Allow-Origin "*"
    </FilesMatch>
</IfModule>

# Fallback für Bilder
<IfModule mod_rewrite.c>
    RewriteEngine On
    
    # Wenn Bild nicht in /uploads/ gefunden wurde, versuche andere Pfade
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteRule ^uploads/(.+)$ dist/uploads/$1 [L]
    
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteRule ^uploads/(.+)$ dist/public/uploads/$1 [L]
    
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteRule ^uploads/(.+)$ public/uploads/$1 [L]
    
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteRule ^uploads/(.+)$ $1 [L]
</IfModule>
EOF

echo "=== Build abgeschlossen ==="