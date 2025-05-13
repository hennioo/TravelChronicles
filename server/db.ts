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
  ssl: false // Ändere zu true, falls SSL erforderlich ist
});

// Drizzle ORM initialisieren
export const db = drizzle(pool, { schema });
