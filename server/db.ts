import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Supabase Datenbankverbindung über die konfigurierte URL
const DATABASE_URL = process.env.DATABASE_URL;

// Überprüfen, ob die URL gesetzt ist
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL Umgebungsvariable nicht gesetzt!");
}

// Pool erstellen mit der Supabase-Verbindung und erweiterter Konfiguration
export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Wichtig für Verbindungen von Plattformen wie Replit
  },
  // Zusätzliche Parameter für bessere Kompatibilität
  max: 5, // Kleinere Connection Pool Size für bessere Stabilität
  idleTimeoutMillis: 30000, // Connection timeout
  connectionTimeoutMillis: 5000, // Verbindungstimeout
});

// Test der Datenbankverbindung
pool.on('error', (err) => {
  console.error('Unerwarteter Datenbankfehler:', err.message);
});

// Test der Verbindung
pool.query('SELECT NOW()', [])
  .then(res => {
    console.log('Datenbankverbindung erfolgreich hergestellt:', res.rows[0]);
  })
  .catch(err => {
    console.error('Fehler beim Verbinden zur Datenbank:', err.message);
    // Weitere Details ausgeben, wenn verfügbar
    if (err.code) console.error('Fehlercode:', err.code);
    if (err.errno) console.error('Fehlernummer:', err.errno);
    if (err.syscall) console.error('Systemaufruf:', err.syscall);
    if (err.hostname) console.error('Hostname:', err.hostname);
  });

// Überprüfe ob die Tabellen existieren
pool.query('SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = \'public\' AND table_name = \'locations\')')
  .then(res => {
    console.log('Tabelle locations existiert:', res.rows[0].exists);
  })
  .catch(err => {
    console.error('Fehler beim Prüfen der Tabellen:', err.message);
  });

// Drizzle ORM initialisieren
export const db = drizzle(pool, { schema });
