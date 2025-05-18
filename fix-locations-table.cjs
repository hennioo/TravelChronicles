// Fix für die Locations-Tabelle - Fügt die fehlende Thumbnail-Spalte hinzu
const { Pool } = require('pg');

// Datenbank-Verbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Für Render/Supabase nötig
  }
});

async function fixTable() {
  try {
    // Verbindung zur Datenbank testen
    const client = await pool.connect();
    console.log('✅ Datenbank-Verbindung erfolgreich');
    
    // Prüfen, ob die thumbnail-Spalte existiert
    const columnCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'locations' AND column_name = 'thumbnail'
      );
    `);
    
    const columnExists = columnCheck.rows[0].exists;
    console.log(`Spalte 'thumbnail' existiert: ${columnExists}`);
    
    // Spalte hinzufügen, falls sie nicht existiert
    if (!columnExists) {
      console.log('Füge Spalte "thumbnail" zur Tabelle "locations" hinzu...');
      
      await client.query(`
        ALTER TABLE locations 
        ADD COLUMN thumbnail TEXT,
        ADD COLUMN image_type VARCHAR(50);
      `);
      
      console.log('Spalte "thumbnail" wurde hinzugefügt');
    }
    
    client.release();
    console.log('Datenbank-Fix abgeschlossen!');
  } catch (err) {
    console.error('❌ Fehler beim Beheben der Datenbank:', err);
  } finally {
    process.exit(0);
  }
}

// Fix ausführen
fixTable();