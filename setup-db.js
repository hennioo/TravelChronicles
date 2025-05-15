// Diese Datei wird verwendet, um die Datenbank-Struktur zu erzwingen
const { Pool } = require('pg');

// Funktion, um die Datenbank-Verbindung herzustellen
async function setupDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL ist nicht gesetzt');
    return;
  }
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Verbindung testen
    const client = await pool.connect();
    console.log('Datenbankverbindung erfolgreich hergestellt');
    
    // Prüfen, ob die Tabelle existiert
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
      )
    `);
    
    const tableExists = tableCheck.rows[0].exists;
    
    if (tableExists) {
      console.log('Tabelle locations existiert bereits, versuche zu löschen');
      // Versuche, die vorhandene Tabelle zu löschen
      await client.query('DROP TABLE IF EXISTS locations CASCADE');
      console.log('Tabelle locations erfolgreich gelöscht');
    }
    
    // Tabelle neu erstellen mit der richtigen Struktur
    console.log('Erstelle Tabelle locations neu');
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
      )
    `);
    
    console.log('Tabelle locations erfolgreich erstellt');
    
    // Beispiel-Eintrag zum Testen
    console.log('Füge Beispiel-Eintrag hinzu');
    await client.query(`
      INSERT INTO locations (title, latitude, longitude, description) 
      VALUES ('Beispiel-Ort', 51.5074, -0.1278, 'Ein Beispiel-Ort zum Testen')
    `);
    
    console.log('Datenbank erfolgreich eingerichtet');
    
    client.release();
  } catch (error) {
    console.error('Fehler beim Einrichten der Datenbank:', error);
  } finally {
    await pool.end();
  }
}

setupDatabase().catch(console.error);