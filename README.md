# Susibert - Interaktive Reisekarte

Eine personalisierte, interaktive Weltkarte, die Reiseerinnerungen visualisiert. Die Anwendung zeigt besuchte Orte mit einem ansprechenden Farbverlaufseffekt an und erlaubt das Hinzufügen von neuen Standorten mit Bildern, Beschreibungen und Highlights.

## Funktionen

- **Zugangscode-Schutz**: Schützt die Karte vor unbefugtem Zugriff
- **Interaktive Karte**: Zoomen, Verschieben und Anklicken von Standorten
- **Standortverwaltung**: Hinzufügen, Anzeigen und Löschen von Reisezielen
- **Fotounterstützung**: Bilder für jeden Standort hochladen
- **Responsive Design**: Optimiert für Desktop und Mobile
- **Dunkelmodus**: Standardmäßig aktiviert für bessere Lesbarkeit
- **Persistente Datenspeicherung**: Alle Daten werden in einer Supabase PostgreSQL-Datenbank gespeichert

## Technologien

- **Frontend**: React.js, Tailwind CSS, shadcn/ui
- **Karte**: Leaflet.js mit benutzerdefinierten Overlays
- **Backend**: Express.js API
- **Datenbank**: Supabase PostgreSQL
- **Datenverarbeitung**: Direkte SQL-Abfragen für zuverlässige Leistung
- **Hosting**: Replit

## Einrichtung

### Voraussetzungen

1. Ein Supabase-Account und Projekt
2. Ein Replit-Account

### Umgebungsvariablen

Die folgenden Umgebungsvariablen müssen in den Replit-Secrets konfiguriert werden:

- `DATABASE_URL`: Die PostgreSQL-Verbindungs-URL von Supabase
- `ACCESS_CODE`: Der Zugangscode für den Zugriff auf die Karte (Standard: "suuuu")

### Datenbank-Setup

Die Anwendung erstellt automatisch die erforderlichen Tabellen in der Supabase-Datenbank:
- `locations`: Speichert Reisestandorte
- `access_codes`: Enthält den Zugangscode
- `users`: (Derzeit nicht verwendet, für zukünftige Erweiterungen)

## Entwicklung

```bash
# Repository klonen
git clone https://github.com/yourusername/susibert.git

# In das Projektverzeichnis wechseln
cd susibert

# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten
npm run dev
```

## Deployment

Die Anwendung ist für das Hosting auf Replit optimiert. Für ein erfolgreiches Deployment:

1. Stelle sicher, dass alle Umgebungsvariablen korrekt gesetzt sind
2. Verwende den "Deploy"-Button in Replit

## Projektstruktur

```
/
├── client/              # Frontend-Code
│   └── src/
│       ├── components/  # UI-Komponenten
│       ├── hooks/       # React Hooks
│       ├── lib/         # Hilfsfunktionen
│       └── pages/       # Seiten
├── server/              # Backend-Code
│   ├── routes.ts        # API-Routen
│   ├── storage.ts       # Datenbankoperationen
│   └── db.ts            # Datenbankverbindung
├── shared/              # Gemeinsamer Code
│   └── schema.ts        # Datenbankschema
└── uploads/             # Hochgeladene Bilder
```

## Wartung

### Ändern des Zugangscodes

Der Zugangscode kann geändert werden durch:
1. Aktualisieren der `ACCESS_CODE` Umgebungsvariable in Replit
2. Direkte Bearbeitung in der Supabase-Datenbank (Tabelle "access_codes")

### Datenspeicherort

- Alle Anwendungsdaten werden in der Supabase-Datenbank gespeichert
- Hochgeladene Bilder werden im Replit-Dateisystem im Ordner `/uploads` gespeichert

## Lizenz

Dieses Projekt ist privat und nicht zur öffentlichen Verwendung oder Verbreitung bestimmt.