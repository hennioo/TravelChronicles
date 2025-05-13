// Skript zum Initialisieren der Datenbank
import { execSync } from 'child_process';

// Supabase URL verwenden
const supabaseUrl = process.env.SUPABASE_URL;

// Überprüfen, ob die URL gesetzt ist
if (!supabaseUrl) {
  console.error('SUPABASE_URL Umgebungsvariable nicht gesetzt!');
  process.exit(1);
}

// Umgebungsvariable temporär setzen und Drizzle ausführen
process.env.DATABASE_URL = supabaseUrl;

try {
  console.log('Starte Datenbankschema-Push zu Supabase...');
  execSync('npx drizzle-kit push', { stdio: 'inherit' });
  console.log('Datenbankschema erfolgreich zu Supabase gepusht!');
} catch (error) {
  console.error('Fehler beim Initialisieren der Datenbank:', error);
  process.exit(1);
}