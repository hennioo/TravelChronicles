// Schlussendliche Korrektur für die Datenbankstruktur
const { Pool } = require('pg');

// Hauptfunktion zur Korrektur der Datenbank
async function fixDatabase() {
  console.log('===== BEGINNE FINALE DATENBANK-KORREKTUR =====');
  
  // Verbindung zur Datenbank herstellen
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    const client = await pool.connect();
    console.log('Datenbankverbindung hergestellt');
    
    // 1. Prüfen, ob Tabelle existiert
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
      // 2. Spalten auflisten
      const columnsResult = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
        ORDER BY ordinal_position;
      `);
      
      const columns = columnsResult.rows.map(row => row.column_name);
      console.log('Vorhandene Spalten:', columns);
      
      // 3. Spalten prüfen und anpassen
      
      // title-Spalte prüfen
      if (!columns.includes('title')) {
        if (columns.includes('name')) {
          console.log('Spalte "name" wird zu "title" umbenannt...');
          await client.query('ALTER TABLE locations RENAME COLUMN name TO title;');
          console.log('Umbenennung abgeschlossen!');
        } else {
          console.log('Füge title-Spalte hinzu...');
          await client.query('ALTER TABLE locations ADD COLUMN title VARCHAR(255);');
          console.log('title-Spalte hinzugefügt');
        }
      } else {
        console.log('title-Spalte existiert bereits.');
      }
      
      // image_data-Spalte prüfen
      if (!columns.includes('image_data')) {
        console.log('Füge image_data-Spalte hinzu...');
        await client.query('ALTER TABLE locations ADD COLUMN image_data BYTEA;');
        console.log('image_data-Spalte hinzugefügt');
      } else {
        console.log('image_data-Spalte existiert bereits.');
      }
      
      // image_type-Spalte prüfen
      if (!columns.includes('image_type')) {
        console.log('Füge image_type-Spalte hinzu...');
        await client.query('ALTER TABLE locations ADD COLUMN image_type VARCHAR(50);');
        console.log('image_type-Spalte hinzugefügt');
      } else {
        console.log('image_type-Spalte existiert bereits.');
      }
      
      // thumbnail_data-Spalte prüfen
      if (!columns.includes('thumbnail_data')) {
        console.log('Füge thumbnail_data-Spalte hinzu...');
        await client.query('ALTER TABLE locations ADD COLUMN thumbnail_data BYTEA;');
        console.log('thumbnail_data-Spalte hinzugefügt');
      } else {
        console.log('thumbnail_data-Spalte existiert bereits.');
      }
      
      // Erneut Spalten auflisten nach den Änderungen
      const updatedColumnsResult = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
        ORDER BY ordinal_position;
      `);
      
      console.log('Aktualisierte Spalten:');
      updatedColumnsResult.rows.forEach(row => {
        console.log(`- ${row.column_name} (${row.data_type})`);
      });
      
      // Anzahl der Datensätze prüfen
      const countResult = await client.query('SELECT COUNT(*) FROM locations;');
      console.log(`Anzahl der Orte in der Datenbank: ${countResult.rows[0].count}`);
      
      console.log('===== DATENBANK-KORREKTUR ERFOLGREICH ABGESCHLOSSEN =====');
    } else {
      // Wenn die Tabelle nicht existiert, erstellen wir sie
      console.log('Tabelle locations existiert nicht, wird erstellt...');
      
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
      
      console.log('Tabelle erfolgreich erstellt!');
    }
    
    client.release();
  } catch (error) {
    console.error('FEHLER bei der Datenbankkorrektur:', error);
  } finally {
    await pool.end();
  }
}

// Skript ausführen
fixDatabase().catch(err => {
  console.error('Unerwarteter Fehler:', err);
});