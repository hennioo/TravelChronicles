// Direkte Einrichtung der Datenbankstruktur für die Render-Deployment
const { Pool } = require('pg');

// Funktion, um die Datenbank-Verbindung herzustellen
async function directSetupDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL ist nicht gesetzt');
    return;
  }
  
  console.log('===== DIRECT SETUP DATABASE =====');
  console.log('Connecting to:', process.env.DATABASE_URL);
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('Verbindung hergestellt!');
    
    // Aktuellen Status der Tabelle überprüfen
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
      );
    `);
    
    const tableExists = checkTable.rows[0].exists;
    console.log(`Tabelle locations existiert: ${tableExists}`);
    
    if (tableExists) {
      // Spalten auflisten
      const columns = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
        ORDER BY ordinal_position;
      `);
      
      console.log('Bestehende Spalten:');
      columns.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
      
      // Vorhandene Daten zählen
      const countData = await client.query('SELECT COUNT(*) FROM locations;');
      console.log(`Anzahl vorhandener Einträge: ${countData.rows[0].count}`);
      
      // Tabelle umbenennen, falls Daten vorhanden sind
      if (parseInt(countData.rows[0].count) > 0) {
        console.log('Daten vorhanden, erstelle Backup-Tabelle...');
        await client.query('ALTER TABLE locations RENAME TO locations_backup;');
        console.log('Tabelle umbenannt zu locations_backup');
      } else {
        // Tabelle löschen, wenn keine Daten vorhanden sind
        console.log('Keine Daten vorhanden, lösche Tabelle...');
        await client.query('DROP TABLE locations;');
        console.log('Tabelle gelöscht');
      }
    }
    
    // Neue Tabelle mit korrekten Spalten erstellen
    console.log('Erstelle neue locations-Tabelle...');
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
    console.log('Neue Tabelle erfolgreich erstellt!');
    
    // Optional: Testdaten einfügen
    console.log('Füge Testdaten ein...');
    await client.query(`
      INSERT INTO locations (title, latitude, longitude, description) 
      VALUES ('Beispielort', 51.5074, -0.1278, 'Ein Beispielort in London');
    `);
    console.log('Testdaten eingefügt');
    
    // Erfolg
    console.log('Datenbankeinrichtung erfolgreich abgeschlossen!');
    client.release();
  } catch (error) {
    console.error('FEHLER bei der Datenbankeinrichtung:', error);
  } finally {
    await pool.end();
  }
}

// Ausführen
directSetupDatabase().catch(err => {
  console.error('Ein unerwarteter Fehler ist aufgetreten:', err);
});