// Supabase Debug-Tool
const { Pool } = require('pg');
const fs = require('fs');

// Supabase-Verbindung
const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_URL;

// Debug-Optionen
const DEBUG = true; // Set to true to enable verbose logging

// Speichere die Log-Daten 
function log(message, data = null) {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    
    if (data) {
      console.log(logMessage, JSON.stringify(data, null, 2));
      fs.appendFileSync('debug-log.txt', `${logMessage} ${JSON.stringify(data, null, 2)}\n`);
    } else {
      console.log(logMessage);
      fs.appendFileSync('debug-log.txt', `${logMessage}\n`);
    }
  }
}

async function checkDatabaseConnection() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    log('Versuche, Verbindung zur Datenbank herzustellen...');
    const client = await pool.connect();
    log('Verbindung zur Datenbank erfolgreich hergestellt');
    
    // Überprüfe Datenbank-Versionen und Einstellungen
    const versionResult = await client.query('SELECT version()');
    log('Datenbank-Version:', versionResult.rows[0]);
    
    // Überprüfe max_connections Einstellung
    const connectionsResult = await client.query('SHOW max_connections');
    log('Max Connections:', connectionsResult.rows[0]);
    
    // Überprüfe aktuellen Speicherplatz
    const dbSizeResult = await client.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as db_size
    `);
    log('Aktuelle Datenbankgröße:', dbSizeResult.rows[0]);
    
    // Überprüfe Tabellenschema
    log('Überprüfe Tabellenschema...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    log('Gefundene Tabellen:', tablesResult.rows);
    
    // Wenn die locations-Tabelle existiert, überprüfe deren Struktur
    const tableExists = tablesResult.rows.some(row => row.table_name === 'locations');
    
    if (tableExists) {
      const columnsResult = await client.query(`
        SELECT column_name, data_type, character_maximum_length, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'locations'
        ORDER BY ordinal_position
      `);
      
      log('Spalten der locations-Tabelle:', columnsResult.rows);
      
      // Überprüfe Datengröße
      try {
        const dataSizeResult = await client.query(`
          SELECT 
            pg_size_pretty(pg_total_relation_size('locations')) as total_size,
            pg_size_pretty(pg_relation_size('locations')) as table_size,
            pg_size_pretty(pg_total_relation_size('locations') - pg_relation_size('locations')) as index_size
        `);
        log('Größe der locations-Tabelle:', dataSizeResult.rows[0]);
      } catch (error) {
        log('Fehler beim Abrufen der Tabellengröße:', error);
      }
      
      // Teste Insert mit minimalen Daten
      try {
        log('Teste minimalen INSERT...');
        await client.query('BEGIN');
        
        const testInsertResult = await client.query(`
          INSERT INTO locations (title, latitude, longitude)
          VALUES ('Test Eintrag', '48.1351', '11.5820')
          RETURNING id
        `);
        
        log('Test-INSERT erfolgreich mit ID:', testInsertResult.rows[0]);
        
        // Rolle den Test-Insert zurück
        await client.query('ROLLBACK');
        log('Test-INSERT zurückgerollt');
      } catch (error) {
        await client.query('ROLLBACK');
        log('Fehler beim Test-INSERT:', error);
      }
      
      // Teste Insert mit Binärdaten
      try {
        log('Teste INSERT mit Binärdaten...');
        await client.query('BEGIN');
        
        const tinyImageBuffer = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
        
        const testBinaryInsertResult = await client.query(`
          INSERT INTO locations (title, latitude, longitude, image_data, image_type)
          VALUES ('Test Bild', '48.1351', '11.5820', $1, 'image/gif')
          RETURNING id
        `, [tinyImageBuffer]);
        
        log('Test-INSERT mit Binärdaten erfolgreich mit ID:', testBinaryInsertResult.rows[0]);
        
        // Rolle den Test-Insert zurück
        await client.query('ROLLBACK');
        log('Test-INSERT mit Binärdaten zurückgerollt');
      } catch (error) {
        await client.query('ROLLBACK');
        log('Fehler beim Test-INSERT mit Binärdaten:', error);
      }
    } else {
      log('Die locations-Tabelle existiert nicht');
    }
    
    // Teste die Erreichbarkeit des Uploads-Verzeichnisses
    try {
      const uploadsDir = './uploads';
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        log('Uploads-Verzeichnis erstellt');
      } else {
        log('Uploads-Verzeichnis existiert bereits');
      }
      
      // Teste, ob im Verzeichnis geschrieben werden kann
      const testFilePath = `${uploadsDir}/test-${Date.now()}.txt`;
      fs.writeFileSync(testFilePath, 'Test file');
      log(`Test-Datei erfolgreich geschrieben: ${testFilePath}`);
      
      // Lösche die Testdatei wieder
      fs.unlinkSync(testFilePath);
      log('Test-Datei erfolgreich gelöscht');
    } catch (error) {
      log('Fehler beim Testen des Uploads-Verzeichnisses:', error);
    }
    
    client.release();
    return true;
  } catch (error) {
    log('Fehler bei der Datenbankverbindung:', error);
    return false;
  } finally {
    await pool.end();
  }
}

// Hauptfunktion
async function main() {
  console.log('Starte Supabase Debug-Tool...');
  
  // Prüfe, ob die URL gesetzt ist
  if (!DATABASE_URL) {
    console.error('Fehler: DATABASE_URL oder SUPABASE_URL ist nicht gesetzt');
    return;
  }
  
  // Maskiere die URL aus Sicherheitsgründen
  const maskedUrl = DATABASE_URL.replace(/:[^:@]*@/, ':****@');
  log('Datenbank-URL:', maskedUrl);
  
  // Teste die Datenbankverbindung
  const success = await checkDatabaseConnection();
  
  if (success) {
    console.log('Alle Tests abgeschlossen');
  } else {
    console.error('Debug-Tools abgeschlossen mit Fehlern');
  }
}

// Führe das Script aus
main().catch(error => {
  console.error('Unerwarteter Fehler:', error);
});