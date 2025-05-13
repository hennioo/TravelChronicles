// Skript zum Initialisieren der Datenbank
import { execSync } from 'child_process';

// Supabase URL für DATABASE_URL setzen
const supabasePassword = process.env.SUPABASE_PASSWORD;
const databaseUrl = `postgresql://postgres:${supabasePassword}@db.oooxcbiqljntazjylipt.supabase.co:5432/postgres`;

// Umgebungsvariable temporär setzen und Drizzle ausführen
process.env.DATABASE_URL = databaseUrl;

try {
  console.log('Starte Datenbankschema-Push zu Supabase...');
  execSync('npx drizzle-kit push:pg', { stdio: 'inherit' });
  console.log('Datenbankschema erfolgreich zu Supabase gepusht!');
} catch (error) {
  console.error('Fehler beim Initialisieren der Datenbank:', error);
  process.exit(1);
}