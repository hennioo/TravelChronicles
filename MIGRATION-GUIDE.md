# Migration von Replit zu Render

Diese Anleitung beschreibt detailliert die Schritte, um deine Susibert-Anwendung von Replit zu Render zu migrieren und alle Replit-spezifischen Abhängigkeiten zu ersetzen.

## Inhaltsverzeichnis

1. [Vorbereitung](#1-vorbereitung)
2. [Replit-spezifische Komponenten](#2-replit-spezifische-komponenten)
3. [Manuelles Hinzufügen der Dateien zu GitHub](#3-manuelles-hinzufügen-der-dateien-zu-github)
4. [Render-Service einrichten](#4-render-service-einrichten)
5. [Persistenten Speicher für Uploads konfigurieren](#5-persistenten-speicher-für-uploads-konfigurieren)
6. [Umgebungsvariablen einrichten](#6-umgebungsvariablen-einrichten)
7. [Nach dem Deployment](#7-nach-dem-deployment)
8. [Wartung und Updates](#8-wartung-und-updates)
9. [Problembehandlung](#9-problembehandlung)

## 1. Vorbereitung

### Bereits vorhanden:
- GitHub-Repository: https://github.com/hennioo/TravelChronicles
- Supabase-Datenbank mit korrekter Konfiguration

### Noch benötigt:
- Render-Konto (für Deployment) - Erstelle eines unter https://render.com

## 2. Replit-spezifische Komponenten

Die folgenden Replit-spezifischen Komponenten müssen für Render angepasst werden:

1. **Build-Prozess**: 
   - Replit nutzt spezielle Plugins für Vite, die auf Render nicht verfügbar sind
   - Lösung: Ein angepasstes Build-Skript und eine vereinfachte Vite-Konfiguration

2. **Dateien für Uploads**:
   - Replit speichert Dateien lokal, während Render persistenten Speicher benötigt
   - Lösung: Eine angepasste Datei-Speicher-Implementierung

3. **Umgebungsvariablen**:
   - Replit hat seine eigenen Umgebungsvariablen
   - Lösung: Konfiguration von Render-spezifischen Umgebungsvariablen

## 3. Manuelles Hinzufügen der Dateien zu GitHub

Da du Replit nicht direkt zum Pushen zu GitHub verwenden kannst, füge diese Dateien manuell in deinem GitHub-Repository hinzu:

### 1. render.yaml
Erstelle diese Datei im Hauptverzeichnis deines Repositories:
```yaml
services:
  - type: web
    name: susibert
    env: node
    buildCommand: ./build-render.sh
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false
      - key: ACCESS_CODE
        sync: false
      - key: RENDER
        value: "true"
```

### 2. build-render.sh
Erstelle diese Datei im Hauptverzeichnis deines Repositories:
```bash
#!/bin/bash

# Dieses Skript ist für den Build-Prozess auf Render
# Es installiert alle dev-dependencies vor dem Build-Prozess
echo "Installing all dependencies for Render..."

# Install production dependencies
npm install

# Install development dependencies explicitly
npm install --no-save @vitejs/plugin-react autoprefixer postcss tailwindcss esbuild typescript vite

# Kopiere die Render-optimierte Vite-Konfiguration
cp vite.config.render.ts vite.config.ts

# Run the build
echo "Building the application..."
npm run build

echo "Build completed!"
```

### 3. vite.config.render.ts
Erstelle diese Datei im Hauptverzeichnis deines Repositories:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Diese vereinfachte Konfiguration ist für Render optimiert
// Sie vermeidet die Replit-spezifischen Plugins
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
});
```

### 4. server/fileStorage.ts
Erstelle diese Datei im server-Verzeichnis deines Repositories:
```typescript
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import multer from 'multer';

// Bestimme den Speicherort für Uploads basierend auf der Umgebung
export const getUploadDir = () => {
  // Render verwendet einen speziellen Pfad für persistente Daten
  if (process.env.RENDER) {
    return path.join('/var/data/uploads');
  }
  
  // Standard Upload-Verzeichnis für lokale Entwicklung oder andere Hosts
  return path.join(process.cwd(), 'uploads');
};

// Stelle sicher, dass das Upload-Verzeichnis existiert
const uploadDir = getUploadDir();
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Konfiguriere den Speicher für Multer
const storage = multer.diskStorage({
  destination: (_req: Request, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req: Request, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `image-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// Exportiere den konfigurierten Multer-Upload
export const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB Limit
  }
});

// Hilfs-Funktion zum Generieren der korrekten URL für ein Bild
export const getImageUrl = (imagePath: string): string => {
  // Wenn es eine externe URL ist, verwende sie direkt
  if (imagePath.startsWith('http')) {
    return imagePath;
  }
  
  // Relativen Pfad für lokale Bilder zurückgeben
  const filename = path.basename(imagePath);
  return `/uploads/${filename}`;
};
```

## 4. Render-Service einrichten

1. **Erstelle einen neuen Web Service:**
   - Gehe zu https://dashboard.render.com/
   - Klicke auf "New" > "Web Service"
   - **Wichtig**: Verbinde dein GitHub-Repository "TravelChronicles"
   - Wähle "main" als Branch

2. **Konfiguriere den Web Service MANUELL:**
   - **WICHTIG**: Bearbeite die folgenden Einstellungen manuell, da Render die render.yaml erst nach der ersten Verbindung liest
   - **Name**: Gib deinem Service einen Namen (z.B. "susibert" oder "travel-chronicles")
   - **Environment**: Node
   - **Build Command**: `./build-render.sh`  ← NICHT den Standard-Befehl verwenden
   - **Start Command**: `npm start`
   - **Plan**: Wähle den Free-Tier für Tests

3. **Konfiguriere den persistenten Speicher:**
   - Scrolle zum Abschnitt "Disk"
   - Aktiviere "Enable Disk"
   - Setze den Mounting Path auf `/var/data`  ← WICHTIG für die Bild-Uploads
   - Wähle 1GB Speicher (kann später angepasst werden)

## 5. Persistenten Speicher für Uploads konfigurieren

1. **Beachte die Speicherpfade:**
   - Render hat einen anderen Dateisystem-Aufbau als Replit
   - Bilder werden in `/var/data/uploads` gespeichert statt in `/uploads`
   - Die `fileStorage.ts` Datei behandelt diese Unterschiede automatisch

2. **Nach dem ersten Deployment:**
   - Prüfe, ob der `/var/data/uploads` Ordner automatisch erstellt wurde
   - Falls nicht, führe im Render-Shell den Befehl aus: `mkdir -p /var/data/uploads`

3. **Bestehende Bilder migrieren:**
   - Bestehende Bild-Uploads in Replit bleiben dort und sind nicht automatisch in Render verfügbar
   - Für wichtige Bilder: Lade sie von Replit herunter und lade sie manuell in den persistenten Speicher von Render hoch

## 6. Umgebungsvariablen einrichten

1. **Notwendige Umgebungsvariablen:**
   - Gehe in Render zu deinem Service → Environment
   - Füge folgende Variablen hinzu:
     - `DATABASE_URL`: [Exakt die gleiche URL, die du in Replit verwendest für Supabase]
     - `ACCESS_CODE`: [Dein Zugangscode, standardmäßig "suuuu"]
     - `RENDER`: `true`  ← WICHTIG für die Erkennung der Render-Umgebung
     - `NODE_ENV`: `production`

2. **Anmerkungen zur Datenbankkonfiguration:**
   - Die Supabase-Datenbank bleibt unverändert
   - Stelle sicher, dass die IP-Adressen von Render in Supabase zugelassen sind (falls du IP-Beschränkungen aktiviert hast)

## 7. Nach dem Deployment

1. **Überprüfe deine Anwendung:**
   - Sobald der Build erfolgreich abgeschlossen ist, öffne die Render-URL (endet mit .onrender.com)
   - Melde dich mit deinem Zugangscode an
   - Stelle sicher, dass alle Orte auf der Karte angezeigt werden
   - Teste das Hinzufügen und Löschen von Orten

2. **Spezifische Tests:**
   - **Bild-Upload**: Füge einen neuen Ort mit Bild hinzu und prüfe, ob es gespeichert wird
   - **Datenbank-Zugriff**: Überprüfe, ob neue Orte in der Datenbank gespeichert werden
   - **Mobile Ansicht**: Teste die Anwendung auf einem Mobilgerät

## 8. Wartung und Updates

1. **Code-Updates:**
   - Für zukünftige Updates kannst du entweder:
     - Direkt in GitHub Dateien bearbeiten
     - Oder lokal entwickeln und zu GitHub pushen
   - Render wird automatisch bei jedem Push zu deinem GitHub-Repository neu deployen

2. **Render-Dashboard überwachen:**
   - Render bietet Logs und Metriken
   - Überwache den Ressourcenverbrauch (CPU, RAM, Disk)
   - Achte auf Fehler in den Logs

3. **Replit vs Render - Wichtige Unterschiede:**
   - **Sleep-Modus**: Im Free-Tier von Render wird dein Service nach 15 Minuten Inaktivität in den Ruhezustand versetzt
   - **Kaltstarts**: Das erste Aufrufen nach dem Ruhezustand kann langsamer sein (ca. 30 Sekunden)
   - **Speichergrenzen**: Achte auf die Nutzung des persistenten Speichers

## 9. Problembehandlung

### Build-Fehler mit @vitejs/plugin-react oder anderen Plugins:
- Prüfe, ob du das neueste build-render.sh verwendest
- Stelle sicher, dass das Skript ausführbar ist (`chmod +x build-render.sh` in Render Shell)
- Update: Füge weitere fehlende Abhängigkeiten zum npm install --no-save Befehl hinzu

### Statische Dateien (CSS/JS) werden nicht geladen:
- Prüfe die Netzwerk-Konsole im Browser für 404-Fehler
- Überprüfe die Pfade in vite.config.render.ts

### Bild-Uploads schlagen fehl:
- Überprüfe, ob der persistente Speicher korrekt eingerichtet ist (Mount Path: `/var/data`)
- Prüfe die Berechtigungen: `ls -la /var/data` in der Render Shell
- Stelle sicher, dass die Umgebungsvariable `RENDER=true` gesetzt ist
- Überprüfe die Server-Logs für spezifische Fehlermeldungen

### Datenbank-Verbindungsprobleme:
- Prüfe, ob die DATABASE_URL-Umgebungsvariable exakt mit der in Replit übereinstimmt
- Validiere die Verbindung mit einem einfachen Testskript in der Render Shell:
  ```js
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query('SELECT NOW()').then(res => console.log(res.rows[0])).catch(err => console.error(err));
  ```
- Überprüfe die Netzwerkregeln in Supabase

### App funktioniert nach Sleep-Modus nicht richtig:
- Free-Tier von Render pausiert Anwendungen nach 15 Minuten Inaktivität
- Der erste Aufruf danach kann bis zu 30 Sekunden dauern
- Für Produktionsanwendungen erwäge ein Upgrade auf einen bezahlten Plan