// Direkter Datenbank-Fix für die Supabase-Datenbank
const { Pool } = require('pg');
require('dotenv').config();

// Verbindung zur Datenbank herstellen
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Hauptfunktion
async function fixDatabase() {
  console.log('===== BEGINNE DATENBANK-REPARATUR =====');
  
  try {
    const client = await pool.connect();
    console.log('Datenbankverbindung erfolgreich hergestellt');
    
    // Tabellen-Existenz prüfen
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
      );
    `);
    
    const tableExists = checkTable.rows[0].exists;
    console.log(`Tabelle 'locations' existiert: ${tableExists}`);
    
    if (tableExists) {
      // Zeige aktuelle Spalten an
      const columnsResult = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
        ORDER BY ordinal_position;
      `);
      
      console.log('Aktuelle Spalten:');
      columnsResult.rows.forEach(col => {
        console.log(`- ${col.column_name} (${col.data_type})`);
      });
      
      // Anzahl der Einträge zählen
      const countResult = await client.query('SELECT COUNT(*) FROM locations;');
      console.log(`Anzahl vorhandener Einträge: ${countResult.rows[0].count}`);
      
      // Prüfe, ob Spalte name existiert, aber title nicht
      const columns = columnsResult.rows.map(row => row.column_name);
      if (columns.includes('name') && !columns.includes('title')) {
        console.log("SPALTENUMBENENNUNG: 'name' wird zu 'title' umbenannt...");
        await client.query('ALTER TABLE locations RENAME COLUMN name TO title;');
        console.log("Spalte erfolgreich umbenannt!");
      }
      
      // Fehlende Spalten hinzufügen
      console.log('Prüfe auf fehlende Spalten und füge sie hinzu...');
      
      if (!columns.includes('image_data')) {
        console.log("Spalte 'image_data' fehlt - wird hinzugefügt...");
        await client.query('ALTER TABLE locations ADD COLUMN image_data BYTEA;');
      }
      
      if (!columns.includes('image_type')) {
        console.log("Spalte 'image_type' fehlt - wird hinzugefügt...");
        await client.query('ALTER TABLE locations ADD COLUMN image_type VARCHAR(50);');
      }
      
      if (!columns.includes('thumbnail_data')) {
        console.log("Spalte 'thumbnail_data' fehlt - wird hinzugefügt...");
        await client.query('ALTER TABLE locations ADD COLUMN thumbnail_data BYTEA;');
      }
      
      if (!columns.includes('created_at')) {
        console.log("Spalte 'created_at' fehlt - wird hinzugefügt...");
        await client.query('ALTER TABLE locations ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;');
      }
      
      // Endgültige Spaltenstruktur anzeigen
      const finalColumnsResult = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
        ORDER BY ordinal_position;
      `);
      
      console.log('\nEndgültige Spaltenstruktur:');
      finalColumnsResult.rows.forEach(col => {
        console.log(`- ${col.column_name} (${col.data_type})`);
      });
      
    } else {
      // Neue Tabelle erstellen, falls sie nicht existiert
      console.log('Tabelle existiert nicht, wird erstellt...');
      
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
    
    console.log('\n===== DATENBANK-REPARATUR ERFOLGREICH ABGESCHLOSSEN =====');
    
    client.release();
  } catch (error) {
    console.error('FEHLER bei der Datenbank-Reparatur:', error);
  } finally {
    await pool.end();
  }
}

// Ausführen
fixDatabase().catch(err => {
  console.error('Unerwarteter Fehler:', err);
});