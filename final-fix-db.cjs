// Finale Datenbankkorrektur
const { Pool } = require('pg');
require('dotenv').config();

// Verbindung zur Datenbank herstellen
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Hauptfunktion
async function finalFixDatabase() {
  console.log('===== BEGINNE FINALE DATENBANK-REPARATUR =====');
  
  try {
    const client = await pool.connect();
    console.log('Datenbankverbindung erfolgreich hergestellt');
    
    // Zeige aktuelle Spaltenstruktur an
    const columnsResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'locations'
      ORDER BY ordinal_position;
    `);
    
    console.log('Aktuelle Spaltenstruktur:');
    columnsResult.rows.forEach(col => {
      console.log(`- ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
    // Spalten-Einschränkungen ändern
    console.log('\nÄndere Spalteneinschränkungen...');
    
    // date-Spalte nullable machen
    console.log('Mache date-Spalte nullable...');
    await client.query('ALTER TABLE locations ALTER COLUMN date DROP NOT NULL;');
    
    // highlight-Spalte nullable machen, falls vorhanden
    console.log('Mache highlight-Spalte nullable (falls vorhanden)...');
    try {
      await client.query('ALTER TABLE locations ALTER COLUMN highlight DROP NOT NULL;');
    } catch (error) {
      console.log('highlight-Spalte bereits nullable oder nicht vorhanden');
    }
    
    // country_code-Spalte nullable machen, falls vorhanden
    console.log('Mache country_code-Spalte nullable (falls vorhanden)...');
    try {
      await client.query('ALTER TABLE locations ALTER COLUMN country_code DROP NOT NULL;');
    } catch (error) {
      console.log('country_code-Spalte bereits nullable oder nicht vorhanden');
    }
    
    // latitude und longitude sollten Text sein, aber nicht null
    console.log('Stelle sicher, dass latitude und longitude nicht NULL sein dürfen...');
    try {
      await client.query('ALTER TABLE locations ALTER COLUMN latitude SET NOT NULL;');
      await client.query('ALTER TABLE locations ALTER COLUMN longitude SET NOT NULL;');
    } catch (error) {
      console.log('latitude/longitude-Einschränkungen konnten nicht geändert werden');
    }
    
    // Zeige finale Spaltenstruktur
    const finalColumnsResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'locations'
      ORDER BY ordinal_position;
    `);
    
    console.log('\nFinale Spaltenstruktur:');
    finalColumnsResult.rows.forEach(col => {
      console.log(`- ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
    console.log('\n===== DATENBANK-REPARATUR ABGESCHLOSSEN =====');
    client.release();
  } catch (error) {
    console.error('FEHLER bei der Datenbank-Reparatur:', error);
  } finally {
    await pool.end();
  }
}

// Ausführen
finalFixDatabase().catch(err => {
  console.error('Unerwarteter Fehler:', err);
});