// Finaler Image-Column Fix
const { Pool } = require('pg');
require('dotenv').config();

// Verbindung zur Datenbank herstellen
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Hauptfunktion
async function fixImageColumn() {
  console.log('===== BEGINNE FINALEN IMAGE-SPALTEN-FIX =====');
  
  try {
    const client = await pool.connect();
    console.log('Datenbankverbindung erfolgreich hergestellt');
    
    // Image-Spalte nullable machen
    console.log('Mache image-Spalte nullable...');
    await client.query('ALTER TABLE locations ALTER COLUMN image DROP NOT NULL;');
    
    // Nochmals alle Spalten prüfen und anpassen
    console.log('Stelle sicher, dass alle problematischen Spalten nullable sind...');
    
    const spalten = ['date', 'description', 'highlight', 'country_code', 'image'];
    
    for (const spalte of spalten) {
      try {
        await client.query(`ALTER TABLE locations ALTER COLUMN ${spalte} DROP NOT NULL;`);
        console.log(`Spalte '${spalte}' ist jetzt nullable.`);
      } catch (error) {
        console.log(`Spalte '${spalte}' konnte nicht angepasst werden: ${error.message}`);
      }
    }
    
    // Aktuelle Struktur anzeigen
    const columnsResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'locations'
      ORDER BY ordinal_position;
    `);
    
    console.log('\nAktuelle Spaltenstruktur:');
    columnsResult.rows.forEach(col => {
      console.log(`- ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
    console.log('\n===== IMAGE-SPALTEN-FIX ABGESCHLOSSEN =====');
    client.release();
  } catch (error) {
    console.error('FEHLER beim Anpassen der Image-Spalte:', error);
  } finally {
    await pool.end();
  }
}

// Ausführen
fixImageColumn().catch(err => {
  console.error('Unerwarteter Fehler:', err);
});