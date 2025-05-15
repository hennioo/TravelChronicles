// Direkte Anpassung der Supabase-Datenbankstruktur für die Susibert-Karte
const { Pool } = require('pg');

// Verbindung zur Datenbank herstellen
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Datenbank-Setup durchführen
async function setupSupabaseDatabase() {
  console.log('===== SETUP SUPABASE DATABASE =====');
  console.log('Starte Anpassung der Datenbankstruktur...');
  
  const client = await pool.connect();
  
  try {
    // 1. Prüfen, ob die Tabelle existiert
    console.log('Prüfe, ob die Tabelle locations existiert...');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
      );
    `);
    
    const tableExists = tableCheck.rows[0].exists;
    console.log(`Tabelle locations existiert: ${tableExists}`);
    
    if (tableExists) {
      // 2. Vorhandene Spalten abfragen
      console.log('Frage vorhandene Spalten ab...');
      const columnsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
        ORDER BY ordinal_position;
      `);
      
      const columns = columnsResult.rows.map(row => row.column_name);
      console.log('Vorhandene Spalten:', columns);
      
      // 3. Prüfen, ob die title-Spalte existiert
      if (!columns.includes('title')) {
        console.log('Spalte "title" fehlt - versuche, sie hinzuzufügen...');
        
        // Wenn eine name-Spalte existiert, umbenennen
        if (columns.includes('name')) {
          console.log('Spalte "name" gefunden - benenne sie in "title" um');
          await client.query('ALTER TABLE locations RENAME COLUMN name TO title;');
          console.log('Spalte "name" wurde in "title" umbenannt');
        } else {
          // Sonst title-Spalte hinzufügen
          console.log('Füge neue "title"-Spalte hinzu');
          await client.query('ALTER TABLE locations ADD COLUMN title VARCHAR(255);');
          console.log('Spalte "title" wurde hinzugefügt');
        }
      } else {
        console.log('Spalte "title" existiert bereits');
      }
      
      // 4. Prüfen, ob die image_data-Spalte existiert
      if (!columns.includes('image_data')) {
        console.log('Spalte "image_data" fehlt - füge sie hinzu...');
        await client.query('ALTER TABLE locations ADD COLUMN image_data BYTEA;');
        console.log('Spalte "image_data" wurde hinzugefügt');
      }
      
      // 5. Prüfen, ob die image_type-Spalte existiert
      if (!columns.includes('image_type')) {
        console.log('Spalte "image_type" fehlt - füge sie hinzu...');
        await client.query('ALTER TABLE locations ADD COLUMN image_type VARCHAR(50);');
        console.log('Spalte "image_type" wurde hinzugefügt');
      }
      
      // 6. Prüfen, ob die thumbnail_data-Spalte existiert
      if (!columns.includes('thumbnail_data')) {
        console.log('Spalte "thumbnail_data" fehlt - füge sie hinzu...');
        await client.query('ALTER TABLE locations ADD COLUMN thumbnail_data BYTEA;');
        console.log('Spalte "thumbnail_data" wurde hinzugefügt');
      }
      
      // Aktuelle Anzahl der Orte ausgeben
      const countResult = await client.query('SELECT COUNT(*) FROM locations;');
      console.log(`Aktuelle Anzahl der Orte: ${countResult.rows[0].count}`);
      
    } else {
      // Wenn die Tabelle nicht existiert, erstellen wir sie
      console.log('Tabelle locations existiert nicht - erstelle sie...');
      await client.query(`
        CREATE TABLE locations (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          latitude DECIMAL(10, 8) NOT NULL,
          longitude DECIMAL(11, 8) NOT NULL,
          description TEXT,
          image_data BYTEA,
          image_type VARCHAR(50),
          thumbnail_data BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Tabelle locations wurde erstellt');
    }
    
    // Aktuelle Spaltenstruktur anzeigen
    const finalColumnsResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'locations'
      ORDER BY ordinal_position;
    `);
    
    console.log('Endgültige Datenbankstruktur:');
    finalColumnsResult.rows.forEach(row => {
      console.log(`- ${row.column_name} (${row.data_type})`);
    });
    
    console.log('===== SETUP ABGESCHLOSSEN =====');
  } catch (error) {
    console.error('FEHLER beim Setup der Datenbank:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Funktion ausführen
setupSupabaseDatabase().catch(err => {
  console.error('Unerwarteter Fehler:', err);
});