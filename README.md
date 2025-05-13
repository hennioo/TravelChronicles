# Susibert - Interactive Travel Map

Eine interaktive Reisekarte zum Teilen von gemeinsamen Reiseerlebnissen.

## Überblick

Susibert ist eine persönliche Webapplikation, die eine interaktive Weltkarte darstellt, auf der Orte markiert werden können, die gemeinsam besucht wurden. Die Anwendung ist durch einen Zugangscode geschützt und bietet eine intuitive Benutzeroberfläche zur Verwaltung von Reisezielen.

## Funktionen

- **Zugangscode-Schutz**: Die Karte ist nur mit dem richtigen Zugangscode zugänglich.
- **Interaktive Karte**: Basierend auf Leaflet.js, vollständig zoom- und schwenkbar.
- **Standortverwaltung**: Einfaches Hinzufügen, Anzeigen und Löschen von Standorten.
- **Bildunterstützung**: Hochladen von Fotos für Standorte (unterstützt auch iPhone HEIC/HEIF Formate).
- **Responsive Design**: Optimiert für Desktop und mobile Geräte.
- **Datenpersistenz**: Alle Daten werden in einer PostgreSQL-Datenbank gespeichert.
- **Dark Mode**: Ein angenehmes dunkles Farbschema als Standard.

## Technischer Aufbau

- **Frontend**: React mit TypeScript, Tailwind CSS für Styling, shadcn/ui für Komponenten
- **Kartenvisualisierung**: Leaflet.js mit benutzerdefinierten Layern für visuelle Effekte
- **Backend**: Express.js Server
- **Datenbank**: PostgreSQL mit Drizzle ORM
- **State Management**: React Query für serverseitige Zustandsverwaltung

## Sicherheit

- Der Zugangscode ist als Umgebungsvariable konfiguriert und nicht im Code sichtbar
- Bilder werden serverseitig gespeichert und mit eindeutigen Dateinamen versehen
- HEIC/HEIF-Bilder werden automatisch konvertiert

## Bearbeitung von Orten

Im Bearbeitungsmodus können:
1. Neue Orte hinzugefügt werden (durch Klicken auf die Karte)
2. Bestehende Orte gelöscht werden
3. Die Ortsliste automatisch erweitert angezeigt werden

## Bilder

- Maximale Dateigröße: 10MB
- Unterstützte Formate: JPG, PNG, WEBP, HEIC, HEIF
- Bilder werden als Vorschaubilder in der Ortsliste angezeigt

## Datenbankstruktur

Die Anwendung verwendet zwei Haupttabellen:
- `locations`: Speichert alle Ortsinformationen einschließlich Koordinaten und Bildreferenzen
- `access_codes`: Verwaltet die Zugangscodes

## Entwicklungshinweise

- Der Zugangscode wird aus der Umgebungsvariable `ACCESS_CODE` geladen
- Die Datenbankverbindung wird aus `DATABASE_URL` konfiguriert
- Der Entwicklungsserver kann mit `npm run dev` gestartet werden