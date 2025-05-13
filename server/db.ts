import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Supabase Datenbankverbindung mit Passwort aus Umgebungsvariable
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD;
const DATABASE_URL = `postgresql://postgres:${SUPABASE_PASSWORD}@db.oooxcbiqljntazjylipt.supabase.co:5432/postgres`;

// Überprüfen, ob das Passwort gesetzt ist
if (!SUPABASE_PASSWORD) {
  throw new Error("SUPABASE_PASSWORD Umgebungsvariable nicht gesetzt!");
}

// Pool erstellen mit der Supabase-Verbindung
export const pool = new Pool({ 
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Wichtig für Verbindungen von Plattformen wie Replit
  }
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
