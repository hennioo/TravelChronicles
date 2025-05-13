// Einfacher Test für die Supabase-Verbindung
import pg from 'pg';
const { Pool } = pg;

// Supabase-URL aus der Umgebungsvariable
const supabaseUrl = process.env.SUPABASE_URL;

// Timeout-Funktion für asynchrone Tests
const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Versuch, eine Verbindung herzustellen
async function testConnection() {
  console.log('Teste Verbindung zur Supabase-Datenbank...');
  console.log(`Verwende URL: ${supabaseUrl.replace(/:[^:]*@/, ':***@')}`); // Passwort verbergen
  
  // Versuche verschiedene SSL-Konfigurationen mit Authentifizierungsoptionen
  const testConfigs = [
    { ssl: { rejectUnauthorized: false } },
    { ssl: true },
    { ssl: false },
    // Benutzerdefinierte Connection-String-Parameter
    { ssl: { rejectUnauthorized: false }, client_encoding: 'UTF8' },
    { ssl: { rejectUnauthorized: false }, application_name: 'susibert_app' },
    // Versuche verschiedene Verbindungs-URLs
    { useModifiedUrl: true, ssl: { rejectUnauthorized: false } }
  ];
  
  for (let i = 0; i < testConfigs.length; i++) {
    console.log(`\nVersuch ${i+1} mit Konfiguration:`, JSON.stringify(testConfigs[i]));
    
    let connectionString = supabaseUrl;
    
    // Teste auch mit modifizierter URL für den Supabase-Pooler
    if (testConfigs[i].useModifiedUrl) {
      // Versuche eine andere Portnummer oder direkten Modus
      connectionString = connectionString.replace(':6543/', ':5432/');
      console.log(`Modifizierte URL: ${connectionString.replace(/:[^:]*@/, ':***@')}`);
    }
    
    const pool = new Pool({
      connectionString: connectionString,
      ...testConfigs[i],
      connectionTimeoutMillis: 5000,
    });
    
    try {
      console.log('Versuche Abfrage...');
      const result = await pool.query('SELECT NOW()');
      console.log('Verbindung erfolgreich!');
      console.log('Ergebnis:', result.rows[0]);
      await pool.end();
      return;
    } catch (error) {
      console.error('Fehler beim Verbinden:', error.message);
      if (error.code) console.error('Fehlercode:', error.code);
      try {
        await pool.end();
      } catch (e) {
        // Ignoriere Fehler beim Schließen des Pools
      }
      await timeout(500); // Kurze Pause vor dem nächsten Versuch
    }
  }
  
  console.log('\nAlle Verbindungsversuche fehlgeschlagen.');
}

// Führe den Test aus
testConnection().catch(err => {
  console.error('Unerwarteter Fehler im Testskript:', err);
  process.exit(1);
});