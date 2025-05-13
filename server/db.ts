import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Supabase Datenbankverbindung über die konfigurierte URL
const SUPABASE_URL = process.env.SUPABASE_URL;

// Überprüfen, ob die URL gesetzt ist
if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL Umgebungsvariable nicht gesetzt!");
}

// Pool erstellen mit der Supabase-Verbindung und erweiterter Konfiguration
export const pool = new Pool({
  connectionString: SUPABASE_URL,
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

// Drizzle ORM initialisieren
export const db = drizzle(pool, { schema });
