// Detaillierterer Test für die Supabase-Verbindung mit expliziter Konfiguration
import pg from 'pg';
const { Pool, Client } = pg;

// Extrahiere die Verbindungsinformationen aus der URL (ohne direkte Verwendung des Passworts im Code)
const supabaseUrl = process.env.SUPABASE_URL || '';
let connectionInfo = {};

try {
  // URL parsen, um Komponenten zu extrahieren
  const urlPattern = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/;
  const match = supabaseUrl.match(urlPattern);
  
  if (match) {
    connectionInfo = {
      user: match[1],
      password: match[2],
      host: match[3],
      port: parseInt(match[4]),
      database: match[5]
    };
    console.log('Verbindungsinfo extrahiert:', {
      user: connectionInfo.user,
      password: '***', // Passwort verbergen
      host: connectionInfo.host,
      port: connectionInfo.port,
      database: connectionInfo.database
    });
  } else {
    throw new Error('Ungültiges URL-Format');
  }
} catch (error) {
  console.error('Fehler beim Extrahieren der Verbindungsinformationen:', error.message);
  process.exit(1);
}

// Timeoutfunktion
const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Teste verschiedene Konfigurationen
async function testDirectConnection() {
  console.log('\nTeste direkte Verbindung (ohne Connection String)...');
  
  // Client statt Pool, um Konfigurationsprobleme auszuschließen
  const client = new Client({
    ...connectionInfo,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    console.log('Verbinde...');
    await client.connect();
    
    console.log('Verbindung hergestellt, teste Abfrage...');
    const result = await client.query('SELECT NOW()');
    
    console.log('Erfolg!', result.rows[0]);
    await client.end();
    return true;
  } catch (error) {
    console.error('Verbindungsfehler:', error.message);
    if (error.code) console.error('Fehlercode:', error.code);
    try {
      await client.end();
    } catch (e) {
      // Ignorieren
    }
    return false;
  }
}

// Führe Tests aus
async function runTests() {
  const success = await testDirectConnection();
  
  if (!success) {
    console.log('\nVerbindung fehlgeschlagen. Versuche alternative Port-Konfiguration...');
    
    // Versuche mit Port 5432 statt 6543
    connectionInfo.port = 5432;
    const altSuccess = await testDirectConnection();
    
    if (!altSuccess) {
      console.log('\nAlle Verbindungsversuche fehlgeschlagen.');
    }
  }
}

// Hauptfunktion
runTests().catch(err => {
  console.error('Unerwarteter Fehler:', err);
  process.exit(1);
});