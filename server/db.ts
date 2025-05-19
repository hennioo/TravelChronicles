import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@shared/schema';

// Datenbank-URL aus Umgebungsvariablen
const rawUrl = process.env.DATABASE_URL?.trim();

if (!rawUrl) {
  throw new Error('❌ DATABASE_URL Umgebungsvariable nicht gesetzt!');
}

// Maskierte Ausgabe für Logs
console.log(
  '📡 Verbindung zur Datenbank wird versucht:',
  rawUrl.replace(/:[^:]*@/, ':***@')
);

// Pool konfigurieren
export const pool = new Pool({
  connectionString: rawUrl,
  ssl: {
    rejectUnauthorized: false
  },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Fehlerbehandlung
pool.on('error', (err) => {
  console.error('❌ Unerwarteter Pool-Fehler:', err.message);
});

// Verbindung testen
(async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Datenbankverbindung erfolgreich:', result.rows[0]);
  } catch (err: any) {
    console.error('❌ Fehler bei der Datenbankverbindung:', err.message);
    if (err.code) console.error('Fehlercode:', err.code);
    if (err.errno) console.error('Fehlernummer:', err.errno);
    if (err.syscall) console.error('Systemaufruf:', err.syscall);
    if (err.hostname) console.error('Hostname:', err.hostname);
    process.exit(1); // Sofort beenden bei Verbindungsfehler
  }

  // Prüfen, ob Tabelle "locations" existiert
  try {
    const check = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'locations'
      );
    `);
    const exists = check.rows[0].exists;
    console.log(`📦 Tabelle 'locations' existiert: ${exists}`);
  } catch (err: any) {
    console.error('❌ Fehler beim Prüfen der Tabellen:', err.message);
  }
})();

// Drizzle ORM initialisieren
export const db = drizzle(pool, { schema });
