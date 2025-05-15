// Ultra-direkter Ansatz für die Datenbank-Korrektur
const express = require('express');
const { Pool } = require('pg');
const app = express();

// Konfiguration
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

// Datenbank-Verbindung
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Route für die Datenbank-Korrektur
app.get('/fix-database', async (req, res) => {
  try {
    console.log('==== BEGINNE DATENBANK-REPARATUR ====');
    
    const client = await pool.connect();
    
    // Tabelle löschen und neu erstellen
    console.log('Lösche existierende Tabelle...');
    await client.query('DROP TABLE IF EXISTS locations CASCADE');
    console.log('Tabelle gelöscht');
    
    console.log('Erstelle neue Tabelle...');
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
    console.log('Neue Tabelle erstellt');
    
    // Prüfen, ob die Tabelle erstellt wurde
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
      );
    `);
    
    const tableExists = tableCheck.rows[0].exists;
    
    // Spaltenstruktur abrufen
    const columnsResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'locations'
      ORDER BY ordinal_position;
    `);
    
    const columns = columnsResult.rows.map(row => `${row.column_name} (${row.data_type})`);
    
    client.release();
    
    // HTML-Antwort mit Erfolgsmeldung
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Datenbank-Reparatur</title>
        <style>
          body { 
            font-family: system-ui, sans-serif; 
            line-height: 1.6; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px;
            background-color: #f5f5f5;
          }
          h1 { color: #4caf50; }
          .success { 
            background-color: #e8f5e9; 
            border: 1px solid #4caf50; 
            padding: 15px; 
            border-radius: 4px;
          }
          .columns {
            background-color: #f1f1f1;
            padding: 15px;
            border-radius: 4px;
            font-family: monospace;
          }
          a {
            display: inline-block;
            margin-top: 20px;
            background-color: #2196f3;
            color: white;
            padding: 10px 15px;
            text-decoration: none;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <h1>Datenbank-Reparatur abgeschlossen!</h1>
        
        <div class="success">
          <p><strong>Die Datenbank wurde erfolgreich zurückgesetzt und neu erstellt.</strong></p>
          <p>Tabelle existiert: ${tableExists ? 'Ja' : 'Nein'}</p>
        </div>
        
        <h2>Spaltenstruktur:</h2>
        <div class="columns">
          <pre>${columns.join('\n')}</pre>
        </div>
        
        <p>Die Tabelle wurde mit der korrekten Struktur erstellt und sollte jetzt mit der Anwendung funktionieren.</p>
        
        <a href="/">Zurück zur Startseite</a>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('FEHLER BEI DER DATENBANK-REPARATUR:', error);
    
    // HTML-Antwort mit Fehlermeldung
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Datenbank-Reparatur fehlgeschlagen</title>
        <style>
          body { 
            font-family: system-ui, sans-serif; 
            line-height: 1.6; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px;
            background-color: #f5f5f5;
          }
          h1 { color: #e53935; }
          .error { 
            background-color: #ffebee; 
            border: 1px solid #e53935; 
            padding: 15px; 
            border-radius: 4px;
          }
          pre {
            background-color: #f1f1f1;
            padding: 15px;
            border-radius: 4px;
            overflow: auto;
          }
          a {
            display: inline-block;
            margin-top: 20px;
            background-color: #2196f3;
            color: white;
            padding: 10px 15px;
            text-decoration: none;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <h1>Datenbank-Reparatur fehlgeschlagen</h1>
        
        <div class="error">
          <p><strong>Bei der Datenbank-Reparatur ist ein Fehler aufgetreten:</strong></p>
        </div>
        
        <pre>${error.message}\n\n${error.stack}</pre>
        
        <a href="/">Zurück zur Startseite</a>
      </body>
      </html>
    `);
  }
});

// Startseite
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Datenbank-Reparatur Tool</title>
      <style>
        body { 
          font-family: system-ui, sans-serif; 
          line-height: 1.6; 
          max-width: 800px; 
          margin: 0 auto; 
          padding: 20px;
          background-color: #f5f5f5;
        }
        h1 { color: #2196f3; }
        .warning { 
          background-color: #fff8e1; 
          border: 1px solid #ffc107; 
          padding: 15px; 
          border-radius: 4px;
          margin-bottom: 20px;
        }
        .button {
          display: inline-block;
          background-color: #e53935;
          color: white;
          padding: 15px 25px;
          text-decoration: none;
          border-radius: 4px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <h1>Datenbank-Reparatur Tool</h1>
      
      <div class="warning">
        <p><strong>Achtung:</strong> Dieses Tool wird die Tabelle <code>locations</code> löschen und neu erstellen. Alle vorhandenen Daten gehen dabei verloren!</p>
        <p>Verwende es nur, wenn du Probleme mit der Datenbankstruktur hast.</p>
      </div>
      
      <a href="/fix-database" class="button">Datenbank reparieren</a>
    </body>
    </html>
  `);
});

// Server starten
app.listen(PORT, () => {
  console.log(`Reparatur-Server läuft auf Port ${PORT}`);
});