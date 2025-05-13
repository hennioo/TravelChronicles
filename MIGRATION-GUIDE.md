# Migration von Replit zu Render

Diese Anleitung beschreibt die Schritte, um deine Susibert-Anwendung von Replit zu Render zu migrieren.

## Inhaltsverzeichnis

1. [Vorbereitung](#1-vorbereitung)
2. [Lokales Setup](#2-lokales-setup)
3. [GitHub-Repository einrichten](#3-github-repository-einrichten)
4. [Render-Konfiguration](#4-render-konfiguration)
5. [Persistenten Speicher für Uploads konfigurieren](#5-persistenten-speicher-für-uploads-konfigurieren)
6. [Umgebungsvariablen einrichten](#6-umgebungsvariablen-einrichten)
7. [Deployment auf Render](#7-deployment-auf-render)
8. [Nach dem Deployment](#8-nach-dem-deployment)
9. [Wartung und Updates](#9-wartung-und-updates)

## 1. Vorbereitung

### Benötigte Konten:
- GitHub-Konto (für Code-Hosting)
- Render-Konto (für Deployment)
- Supabase-Konto (du hast dies bereits für die Datenbank)

### Benötigte Tools:
- Git (installiert auf deinem lokalen Computer)
- Node.js und npm (installiert auf deinem lokalen Computer)
- Ein Code-Editor (VSCode empfohlen)

## 2. Lokales Setup

1. **Kopiere dein Projekt von Replit:**
   - In Replit, klicke auf den Download-Button oben im Datei-Explorer
   - Entpacke das heruntergeladene ZIP-Archiv auf deinem Computer

2. **Installiere die Abhängigkeiten:**
   ```bash
   cd pfad/zu/deinem/projekt
   npm install
   ```

3. **Teste deine Anwendung lokal:**
   ```bash
   npm run dev
   ```
   - Öffne http://localhost:5000 in deinem Browser
   - Stelle sicher, dass alles wie erwartet funktioniert

## 3. GitHub-Repository einrichten

1. **Erstelle ein neues Repository auf GitHub:**
   - Gehe zu https://github.com/new
   - Vergib einen Namen (z.B. "susibert")
   - Wähle "Private" wenn du das Repository privat halten möchtest
   - Klicke auf "Create repository"

2. **Initialisiere Git in deinem lokalen Projekt:**
   ```bash
   cd pfad/zu/deinem/projekt
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/dein-username/susibert.git
   git push -u origin main
   ```

## 4. Render-Konfiguration

Diese Dateien wurden bereits erstellt und sollten in deinem Projekt sein:

### render.yaml
```yaml
services:
  - type: web
    name: susibert
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false
      - key: ACCESS_CODE
        sync: false
```

### Procfile
```
web: npm start
```

### .gitignore
Stelle sicher, dass deine .gitignore-Datei sensible Daten ausschließt (node_modules, .env, etc.).

## 5. Persistenten Speicher für Uploads konfigurieren

Render bietet persistenten Speicher für Dateien. Die Datei `server/fileStorage.ts` wurde erstellt, um die Uploads für Render anzupassen.

### Integration in deine Anwendung:

1. **Aktualisiere die server/routes.ts:**
   - Importiere die Funktionen aus fileStorage.ts
   - Ersetze die vorhandene multer-Konfiguration

2. **Aktualisiere die Express-Route für statische Dateien:**
   ```javascript
   // In server/routes.ts, aktualisiere die statische Datei-Route
   app.use('/uploads', express.static(getUploadDir()));
   ```

## 6. Umgebungsvariablen einrichten

Auf Render musst du dieselben Umgebungsvariablen einrichten, die du auf Replit hattest:

1. **Notwendige Umgebungsvariablen:**
   - `DATABASE_URL`: Deine Supabase PostgreSQL-Verbindungszeichenfolge
   - `ACCESS_CODE`: Der Zugangscode für deine Anwendung (derzeit "suuuu")
   - `NODE_ENV`: Sollte auf "production" gesetzt sein
   - `RENDER`: Setze auf "true" (hilft beim Identifizieren der Render-Umgebung)

2. **Füge ein Secret in der Render-Benutzeroberfläche hinzu:**
   - Gehe zu deinem Dashboard in Render
   - Wähle deinen Web Service
   - Gehe zu "Environment" > "Environment Variables"
   - Füge die oben genannten Variablen hinzu

## 7. Deployment auf Render

1. **Erstelle einen neuen Web Service:**
   - Gehe zu https://dashboard.render.com/
   - Klicke auf "New" und wähle "Web Service"
   - Verbinde dein GitHub-Repository
   - Wähle "main" als Branch

2. **Konfiguriere den Web Service:**
   - **Name**: Gib deinem Service einen Namen (z.B. "susibert")
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Wähle einen passenden Plan (Free für Tests)

3. **Konfiguriere den persistenten Speicher:**
   - Scrolle zum Abschnitt "Disk"
   - Aktiviere "Enable Disk"
   - Setze den Mounting Path auf `/var/data`
   - Wähle eine angemessene Größe (z.B. 1GB für den Anfang)

4. **Setze die Umgebungsvariablen:**
   - Füge die im vorherigen Abschnitt erwähnten Variablen hinzu

5. **Erstelle den Web Service:**
   - Klicke auf "Create Web Service"
   - Render wird automatisch dein Repository klonen und den Buildprozess starten

## 8. Nach dem Deployment

1. **Überprüfe deine Anwendung:**
   - Öffne die von Render bereitgestellte URL
   - Stelle sicher, dass du dich mit dem Zugangscode anmelden kannst
   - Überprüfe, ob alle Standorte korrekt angezeigt werden
   - Teste das Hinzufügen und Löschen von Standorten

2. **Richte eine benutzerdefinierte Domain ein (optional):**
   - Auf der Render-Seite deines Web Service, gehe zu "Settings" > "Custom Domains"
   - Folge den Anweisungen, um deine eigene Domain hinzuzufügen

3. **Teste die Bild-Uploads:**
   - Lade ein neues Bild hoch und stelle sicher, dass es gespeichert und angezeigt wird
   - Überprüfe, ob die persistenten Speicherfunktionen korrekt funktionieren

## 9. Wartung und Updates

1. **Aktualisiere deinen Code:**
   - Mache deine Änderungen lokal
   - Committe und pushe zu GitHub:
     ```bash
     git add .
     git commit -m "Beschreibung der Änderungen"
     git push
     ```
   - Render wird automatisch neu deployen, wenn Änderungen erkannt werden

2. **Überwache deine Anwendung:**
   - Render bietet Logs und Metriken für deinen Service
   - Überprüfe sie regelmäßig, um Probleme zu erkennen

3. **Datenbankwartung:**
   - Die Supabase-Datenbank bleibt unverändert
   - Du kannst weiterhin die Supabase-Benutzeroberfläche für Datenbankoperationen verwenden

## Problembehandlung

### Bild-Uploads funktionieren nicht:
- Überprüfe, ob der persistente Speicher korrekt eingerichtet ist
- Stelle sicher, dass die Pfade in fileStorage.ts korrekt sind
- Überprüfe die Berechtigungen des Speicherverzeichnisses

### Datenbank-Verbindungsprobleme:
- Überprüfe, ob die DATABASE_URL-Umgebungsvariable korrekt gesetzt ist
- Stelle sicher, dass die Supabase-Datenbank erreichbar ist
- Prüfe die Netzwerkregeln in Supabase

### Fehlgeschlagene Builds:
- Überprüfe die Build-Logs in Render
- Stelle sicher, dass alle Abhängigkeiten korrekt installiert sind
- Überprüfe, ob die Node.js-Version kompatibel ist