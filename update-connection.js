// Skript zum Aktualisieren der Datenbankverbindung mit neuem Passwort
import { execSync } from 'child_process';

// Zugangsdaten aus Umgebungsvariablen
const newPassword = process.env.SUPABASE_PASSWORD;
const oldUrl = process.env.SUPABASE_URL;

// Überprüfe, ob die Umgebungsvariablen gesetzt sind
if (!newPassword) {
  console.error('SUPABASE_PASSWORD Umgebungsvariable fehlt!');
  process.exit(1);
}

if (!oldUrl) {
  console.error('SUPABASE_URL Umgebungsvariable fehlt!');
  process.exit(1);
}

// Parse die alte URL und ersetze das Passwort
let newUrl = '';
try {
  // Standard Connection String Format: postgresql://username:password@host:port/database
  const urlPattern = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/;
  const match = oldUrl.match(urlPattern);
  
  if (match) {
    // Extrahiere alle Komponenten
    const username = match[1];
    const host = match[3];
    const port = match[4];
    const database = match[5];
    
    // Erstelle neue URL mit neuem Passwort
    newUrl = `postgresql://${username}:${encodeURIComponent(newPassword)}@${host}:${port}/${database}`;
    
    console.log('Alte URL (Passwort versteckt):', oldUrl.replace(/:[^:]*@/, ':***@'));
    console.log('Neue URL (Passwort versteckt):', newUrl.replace(/:[^:]*@/, ':***@'));
    
    // Teste die neue Verbindung
    console.log('\nTeste neue Verbindung...');
    
    // Setze die neue URL temporär
    process.env.DATABASE_URL = newUrl;
    
    // Versuche eine Datenbankabfrage über die Kommandozeile
    try {
      console.log('Führe PSQL-Befehl aus...');
      // Wir müssen SSL explizit ausschalten, da die pg-Bibliothek in Node.js automatisch 
      // SSL für Hostnames mit bestimmten Domains (wie amazonaws.com) aktiviert
      execSync(`node -e "
        const { Pool } = require('pg');
        const pool = new Pool({ 
          connectionString: '${newUrl}',
          ssl: { rejectUnauthorized: false }
        });
        pool.query('SELECT NOW()').then(res => {
          console.log('Verbindung erfolgreich:', res.rows[0]);
          pool.end();
        }).catch(err => {
          console.error('Verbindungsfehler:', err.message);
          process.exit(1);
        });"`, { stdio: 'inherit' });
      
      console.log('Verbindungstest erfolgreich!');
    } catch (error) {
      console.error('Verbindungstest fehlgeschlagen:', error.message);
    }
  } else {
    throw new Error('Ungültiges URL-Format');
  }
} catch (error) {
  console.error('Fehler beim Verarbeiten der Verbindungs-URL:', error.message);
  process.exit(1);
}

// Ausgabe
console.log('\nBitte verwende diese URL zum Verbinden mit Supabase:');
console.log(newUrl);