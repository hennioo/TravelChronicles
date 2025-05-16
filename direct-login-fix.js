// Finaler Fix für Susibert mit korrigiertem Login
const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

// Konfiguration
const PORT = process.env.PORT || 10000;
const ACCESS_CODE = process.env.ACCESS_CODE || 'suuuu';
const DATABASE_URL = process.env.DATABASE_URL;

// App initialisieren
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statische Dateien
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static('public'));

// Uploads Konfiguration
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Speicher für Sessions
const sessions = {};

// Datenbank-Verbindung
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let dbConnected = false;

// Verbindung zur Datenbank herstellen
async function connectToDatabase() {
  try {
    const client = await pool.connect();
    const now = new Date();
    console.log('Datenbankverbindung erfolgreich hergestellt:', { now });
    client.release();
    
    // Prüfen, ob die Tabellen existieren
    const tableExists = await checkTablesExist();
    console.log('Tabelle locations existiert:', tableExists);
    
    // Prüfen, ob die Spalten richtig konfiguriert sind
    await fixDatabaseConstraints();
    
    // Auf fehlende Thumbnails prüfen
    await generateAllMissingThumbnails();
    
    return true;
  } catch (error) {
    console.error('Fehler bei der Datenbankverbindung:', error.message);
    return false;
  }
}

// Datenbank-Constraints reparieren
async function fixDatabaseConstraints() {
  try {
    const client = await pool.connect();
    console.log('Überprüfe Datenbankeinschränkungen...');
    
    // Alle problematischen Spalten nullable machen
    const spalten = ['date', 'description', 'highlight', 'country_code', 'image'];
    
    for (const spalte of spalten) {
      try {
        await client.query(`ALTER TABLE locations ALTER COLUMN ${spalte} DROP NOT NULL;`);
        console.log(`Spalte '${spalte}' ist jetzt nullable.`);
      } catch (error) {
        console.log(`Spalte '${spalte}' konnte nicht angepasst werden: ${error.message}`);
      }
    }
    
    client.release();
    console.log('Datenbankeinschränkungen überprüft und angepasst.');
    return true;
  } catch (error) {
    console.error('Fehler beim Überprüfen der Datenbankeinschränkungen:', error);
    return false;
  }
}

// Prüfen, ob die Tabellen existieren
async function checkTablesExist() {
  try {
    const result = await pool.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'locations')"
    );
    return result.rows[0].exists;
  } catch (error) {
    console.error('Fehler beim Prüfen der Tabellen:', error);
    return false;
  }
}

// Session-Verwaltung
function createSession() {
  const sessionId = crypto.randomBytes(16).toString('hex');
  sessions[sessionId] = {
    created: Date.now(),
    authenticated: false
  };
  return sessionId;
}

function isValidSession(sessionId) {
  return sessions[sessionId] && sessions[sessionId].authenticated;
}

// Auth-Middleware
function requireAuth(req, res, next) {
  const sessionId = req.query.sessionId;
  
  if (!sessionId || !sessions[sessionId] || !sessions[sessionId].authenticated) {
    return res.redirect('/');
  }
  
  next();
}

// Login-Seite mit perfekt symmetrischem Design
app.get('/', function(req, res) {
  // Erstellt eine neue Session
  const sessionId = createSession();
  
  const htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Susibert - Login</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background-color: #1a1a1a;
      color: #f5f5f5;
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    
    .login-container {
      width: 90%;
      max-width: 400px;
      background-color: #222;
      border-radius: 12px;
      padding: 30px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    }
    
    .login-title {
      text-align: center;
      margin-bottom: 30px;
    }
    
    .login-title h1 {
      font-size: 2.5rem;
      margin: 0;
      background: linear-gradient(45deg, #f59a0c, #ffbf49);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .couple-photo {
      width: 150px;
      height: 150px;
      border-radius: 50%;
      object-fit: cover;
      margin: 0 auto 30px;
      display: block;
      border: 3px solid #f59a0c;
    }
    
    .form-wrapper {
      max-width: 300px;
      margin: 0 auto;
    }
    
    .login-form label {
      display: block;
      margin-bottom: 8px;
      font-weight: bold;
    }
    
    .login-form input {
      width: 100%;
      box-sizing: border-box;
      padding: 12px;
      background-color: #333;
      border: 1px solid #444;
      border-radius: 6px;
      color: white;
      font-size: 1rem;
      margin-bottom: 10px;
    }
    
    .login-form button {
      width: 100%;
      padding: 12px;
      background: linear-gradient(45deg, #f59a0c, #ffbf49);
      border: none;
      border-radius: 6px;
      color: black;
      font-size: 1rem;
      font-weight: bold;
      cursor: pointer;
      transition: opacity 0.2s;
      box-sizing: border-box;
    }
    
    .login-form button:hover {
      opacity: 0.9;
    }
    
    .error-message {
      background-color: #ff5252;
      color: white;
      padding: 10px;
      border-radius: 6px;
      margin-bottom: 20px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="login-title">
      <h1>Susibert</h1>
    </div>
    
    <img src="/uploads/couple.jpg" alt="Pärchen" class="couple-photo" onerror="this.src='/uploads/couple.png'">
    
    <div class="error-message" id="errorMessage"></div>
    
    <div class="form-wrapper">
      <form class="login-form" id="loginForm">
        <label for="accessCode">Zugriffscode</label>
        <input type="password" id="accessCode" name="accessCode" placeholder="Bitte Code eingeben..." required>
        <button type="submit">Anmelden</button>
      </form>
    </div>
  </div>
  
  <script>
    // Login-Formular
    const loginForm = document.getElementById("loginForm");
    const errorMessage = document.getElementById("errorMessage");
    
    loginForm.addEventListener("submit", function(e) {
      e.preventDefault();
      
      const accessCode = document.getElementById("accessCode").value;
      
      fetch("/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
          accessCode: accessCode,
          sessionId: "${sessionId}"
        })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          window.location.href = data.redirect;
        } else {
          errorMessage.textContent = data.message;
          errorMessage.style.display = "block";
        }
      })
      .catch(error => {
        console.error("Fehler:", error);
        errorMessage.textContent = "Ein Fehler ist aufgetreten. Bitte versuche es später erneut.";
        errorMessage.style.display = "block";
      });
    });
  </script>
</body>
</html>
  `;
    
  res.send(htmlContent);
});

// Login-Verarbeitung
app.post('/login', express.json(), (req, res) => {
  const { accessCode, sessionId } = req.body;
  
  if (!sessionId || !sessions[sessionId]) {
    return res.json({ success: false, message: 'Ungültige Session. Bitte lade die Seite neu.' });
  }
  
  if (accessCode === ACCESS_CODE) {
    sessions[sessionId].authenticated = true;
    res.json({ success: true, redirect: '/map?sessionId=' + sessionId });
  } else {
    res.json({ success: false, message: 'Falscher Zugriffscode. Bitte versuche es erneut.' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  const sessionId = req.query.sessionId;
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
  }
  
  res.redirect('/');
});

// Admin-Bereich
app.get('/admin', requireAuth, async (req, res) => {
  const sessionId = req.query.sessionId;
  
  try {
    const client = await pool.connect();
    
    // Tabelle prüfen
    const check = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
      );
    `);
    
    const tableExists = check.rows[0].exists;
    
    // HTML für Admin-Bereich
    const html = `
      <!DOCTYPE html>
      <html lang="de">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Susibert - Admin</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background-color: #1a1a1a;
            color: #f5f5f5;
            margin: 0;
            padding: 0;
          }
          
          header {
            background-color: #222;
            padding: 20px;
            display: flex;
            align-items: center;
            gap: 20px;
          }
          
          header img {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid #f59a0c;
          }
          
          header h1 {
            color: #f59a0c;
            margin: 0;
          }
          
          .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          
          h2 {
            color: #f59a0c;
            margin-top: 40px;
          }
          
          .card {
            background-color: #222;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
          }
          
          .warning {
            background-color: rgba(229, 57, 53, 0.2);
            border: 1px solid #e53935;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
          }
          
          .success {
            background-color: rgba(76, 175, 80, 0.2);
            border: 1px solid #4caf50;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
          }
          
          .button {
            display: inline-block;
            background-color: #f59a0c;
            color: black;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            font-weight: bold;
            margin-right: 10px;
          }
          
          .button.red {
            background-color: #e53935;
            color: white;
          }
          
          .button.blue {
            background-color: #2196f3;
            color: white;
          }
          
          .back-link {
            display: inline-block;
            color: #f59a0c;
            margin-top: 20px;
            text-decoration: none;
          }
          
          .back-link:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <header>
          <img src="/uploads/couple.jpg" alt="Pärchenbild" onerror="this.src='/uploads/couple.png'">
          <h1>Susibert - Admin</h1>
        </header>
        
        <div class="container">
          <h2>Datenbankstatus</h2>
          <div class="card">
            <p>Tabelle "locations" existiert: <strong>${tableExists ? 'Ja' : 'Nein'}</strong></p>
            
            <div class="success">
              <p><strong>Direkter Datenbankfix</strong></p>
              <p>Verwende den unten stehenden Link, um die Datenbank zurückzusetzen und neu zu erstellen:</p>
            </div>
            
            <a href="/fix-database?sessionId=${sessionId}" class="button blue">Datenbank reparieren</a>
            <a href="/reset-database?sessionId=${sessionId}" class="button red">Datenbank zurücksetzen</a>
          </div>
          
          <a href="/map?sessionId=${sessionId}" class="back-link">← Zurück zur Karte</a>
        </div>
      </body>
      </html>
    `;
    
    client.release();
    res.send(html);
  } catch (error) {
    console.error('Fehler beim Laden des Admin-Bereichs:', error);
    res.status(500).send(`
      <h1>Fehler</h1>
      <p>${error.message}</p>
      <a href="/map?sessionId=${sessionId}">Zurück zur Karte</a>
    `);
  }
});

// Datenbank-Fix Route
app.get('/fix-database', requireAuth, async (req, res) => {
  try {
    console.log('Starte Datenbank-Fix...');
    
    const client = await pool.connect();
    
    // Alle problematischen Spalten nullable machen
    const spalten = ['date', 'description', 'highlight', 'country_code', 'image'];
    
    for (const spalte of spalten) {
      try {
        await client.query(`ALTER TABLE locations ALTER COLUMN ${spalte} DROP NOT NULL;`);
        console.log(`Spalte '${spalte}' ist jetzt nullable.`);
      } catch (error) {
        console.log(`Spalte '${spalte}' konnte nicht angepasst werden: ${error.message}`);
      }
    }
    
    // Aktuelle Struktur anzeigen
    const columnsResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'locations'
      ORDER BY ordinal_position;
    `);
    
    const columns = columnsResult.rows.map(col => 
      `${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`
    );
    
    client.release();
    
    res.send(`
      <!DOCTYPE html>
      <html lang="de">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Susibert - Datenbank Fix</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background-color: #1a1a1a;
            color: #f5f5f5;
            margin: 0;
            padding: 0;
          }
          
          header {
            background-color: #222;
            padding: 20px;
            display: flex;
            align-items: center;
            gap: 20px;
          }
          
          header img {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid #f59a0c;
          }
          
          header h1 {
            color: #f59a0c;
            margin: 0;
          }
          
          .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          
          h2 {
            color: #f59a0c;
            margin-top: 40px;
          }
          
          .card {
            background-color: #222;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
          }
          
          .success {
            background-color: rgba(76, 175, 80, 0.2);
            border: 1px solid #4caf50;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
          }
          
          pre {
            background-color: #333;
            padding: 15px;
            border-radius: 4px;
            overflow: auto;
            color: #f5f5f5;
          }
          
          .button {
            display: inline-block;
            background-color: #f59a0c;
            color: black;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <header>
          <img src="/uploads/couple.jpg" alt="Pärchenbild" onerror="this.src='/uploads/couple.png'">
          <h1>Susibert - Datenbank Fix</h1>
        </header>
        
        <div class="container">
          <div class="success">
            <h2>Datenbank erfolgreich repariert!</h2>
            <p>Die Datenbankstruktur wurde angepasst, um NULL-Werte zu erlauben.</p>
          </div>
          
          <div class="card">
            <h3>Aktuelle Spaltenstruktur:</h3>
            <pre>${columns.join('\n')}</pre>
          </div>
          
          <a href="/map?sessionId=${req.query.sessionId}" class="button">Zurück zur Karte</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Fehler beim Reparieren der Datenbank:', error);
    res.status(500).send(`
      <h1>Fehler beim Reparieren der Datenbank</h1>
      <p>${error.message}</p>
      <a href="/admin?sessionId=${req.query.sessionId}">Zurück zum Admin-Bereich</a>
    `);
  }
});

// Datenbank zurücksetzen Route
app.get('/reset-database', requireAuth, async (req, res) => {
  try {
    console.log('Starte Datenbank-Reset...');
    
    const client = await pool.connect();
    
    // Tabelle löschen und neu erstellen
    await client.query('DROP TABLE IF EXISTS locations CASCADE;');
    
    await client.query(`
      CREATE TABLE locations (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT NULL,
        description TEXT NULL,
        highlight TEXT NULL,
        latitude TEXT NOT NULL,
        longitude TEXT NOT NULL,
        country_code TEXT NULL,
        image TEXT NULL,
        image_data BYTEA NULL,
        image_type VARCHAR(50) NULL,
        thumbnail_data BYTEA NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    client.release();
    
    res.send(`
      <!DOCTYPE html>
      <html lang="de">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Susibert - Datenbank Reset</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background-color: #1a1a1a;
            color: #f5f5f5;
            margin: 0;
            padding: 0;
          }
          
          header {
            background-color: #222;
            padding: 20px;
            display: flex;
            align-items: center;
            gap: 20px;
          }
          
          header img {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid #f59a0c;
          }
          
          header h1 {
            color: #f59a0c;
            margin: 0;
          }
          
          .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          
          h2 {
            color: #f59a0c;
            margin-top: 40px;
          }
          
          .card {
            background-color: #222;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
          }
          
          .success {
            background-color: rgba(76, 175, 80, 0.2);
            border: 1px solid #4caf50;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
          }
          
          .button {
            display: inline-block;
            background-color: #f59a0c;
            color: black;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <header>
          <img src="/uploads/couple.jpg" alt="Pärchenbild" onerror="this.src='/uploads/couple.png'">
          <h1>Susibert - Datenbank Reset</h1>
        </header>
        
        <div class="container">
          <div class="success">
            <h2>Datenbank erfolgreich zurückgesetzt!</h2>
            <p>Die Tabelle wurde komplett neu erstellt mit der richtigen Struktur.</p>
            <p>Alle vorherigen Daten wurden gelöscht.</p>
          </div>
          
          <a href="/map?sessionId=${req.query.sessionId}" class="button">Zurück zur Karte</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Fehler beim Zurücksetzen der Datenbank:', error);
    res.status(500).send(`
      <h1>Fehler beim Zurücksetzen der Datenbank</h1>
      <p>${error.message}</p>
      <a href="/admin?sessionId=${req.query.sessionId}">Zurück zum Admin-Bereich</a>
    `);
  }
});

// Kartenansicht mit Marker beim Klicken und ohne Koordinatenanzeige
app.get('/map', requireAuth, function(req, res) {
  const sessionId = req.query.sessionId;
  
  const mapHtml = `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Susibert - Weltkarte</title>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          background-color: #1a1a1a;
          color: #f5f5f5;
          margin: 0;
          padding: 0;
          height: 100vh;
          display: flex;
          flex-direction: column;
        }
        
        header {
          background-color: #222;
          padding: 15px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 1000;
        }
        
        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #f59a0c;
          text-decoration: none;
        }
        
        .logo img {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #f59a0c;
        }
        
        .logo-text {
          font-size: 1.5rem;
          font-weight: bold;
        }
        
        .map-container {
          flex: 1;
          position: relative;
        }
        
        #map {
          height: 100%;
          width: 100%;
        }
        
        .btn {
          background-color: #f59a0c;
          color: black;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          text-decoration: none;
          font-weight: bold;
        }
        
        .btn.admin {
          background-color: #2196f3;
          color: white;
          margin-right: 10px;
        }
        
        .btn.logout {
          background-color: #757575;
          color: white;
        }

        .sidebar {
          position: fixed;
          top: 70px;
          right: -300px;
          width: 300px;
          height: calc(100vh - 70px);
          background-color: #222;
          z-index: 1000;
          transition: right 0.3s ease;
          box-shadow: -2px 0 10px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
        }
        
        .sidebar.open {
          right: 0;
        }
        
        .sidebar-header {
          padding: 15px;
          border-bottom: 1px solid #333;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .sidebar-title {
          font-size: 1.2rem;
          color: #f59a0c;
          margin: 0;
        }
        
        .sidebar-close {
          background: none;
          border: none;
          color: #aaa;
          font-size: 1.5rem;
          cursor: pointer;
        }
        
        .sidebar-content {
          flex: 1;
          overflow-y: auto;
          padding: 15px;
        }
        
        .location-item {
          padding: 10px;
          border-bottom: 1px solid #333;
          cursor: pointer;
        }
        
        .location-item:hover {
          background-color: #333;
        }
        
        .location-title {
          font-weight: bold;
          margin-bottom: 5px;
        }
        
        .sidebar-footer {
          padding: 15px;
          border-top: 1px solid #333;
        }
        
        .sidebar-button {
          display: block;
          width: 100%;
          padding: 10px;
          background-color: #f59a0c;
          color: black;
          border: none;
          border-radius: 4px;
          text-align: center;
          cursor: pointer;
          font-weight: bold;
          margin-bottom: 10px;
          text-decoration: none;
        }
        
        .control-btns {
          position: absolute;
          top: 20px;
          right: 20px;
          z-index: 999;
          display: flex;
          gap: 10px;
        }
        
        .control-btn {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background-color: #222;
          color: #f59a0c;
          border: 1px solid #444;
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        
        .marker-pin {
          position: absolute;
          width: 30px;
          height: 30px; 
          border-radius: 50%;
          border: 4px solid #f59a0c;
          background-color: rgba(245, 154, 12, 0.6);
          box-shadow: 0 0 0 2px white;
          transform: translate(-50%, -50%);
          display: none;
          z-index: 990;
          pointer-events: none;
        }
        
        .form-container {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background-color: #222;
          border-radius: 10px;
          padding: 20px;
          width: 90%;
          max-width: 400px;
          z-index: 1000;
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
          display: none;
        }
        
        .form-title {
          color: #f59a0c;
          margin-top: 0;
          margin-bottom: 20px;
        }
        
        .form-group {
          margin-bottom: 15px;
        }
        
        .form-label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        
        .form-input, .form-textarea {
          width: 100%;
          padding: 10px;
          border-radius: 4px;
          background-color: #333;
          border: 1px solid #444;
          color: #fff;
          box-sizing: border-box;
        }
        
        .form-textarea {
          min-height: 100px;
          resize: vertical;
        }
        
        .form-actions {
          display: flex;
          justify-content: space-between;
          margin-top: 20px;
        }
        
        .form-button {
          padding: 10px 20px;
          border-radius: 4px;
          border: none;
          font-weight: bold;
          cursor: pointer;
        }
        
        .form-button.primary {
          background-color: #4caf50;
          color: white;
        }
        
        .form-button.secondary {
          background-color: #757575;
          color: white;
        }

        /* Location Details */
        .location-detail {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background-color: #222;
          border-radius: 10px;
          padding: 20px;
          width: 90%;
          max-width: 400px;
          z-index: 1000;
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
          display: none;
        }
        
        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 15px;
        }
        
        .detail-title {
          color: #f59a0c;
          margin: 0;
          font-size: 1.5rem;
        }
        
        .detail-close {
          background: none;
          border: none;
          color: #aaa;
          font-size: 1.5rem;
          cursor: pointer;
        }
        
        .detail-image {
          width: 100%;
          border-radius: 6px;
          margin-bottom: 15px;
        }
        
        .detail-description {
          margin-bottom: 20px;
          line-height: 1.5;
        }
        
        .detail-actions {
          display: flex;
          justify-content: flex-end;
        }
        
        .detail-delete {
          background-color: #e53935;
          color: white;
          border: none;
          padding: 8px 15px;
          border-radius: 4px;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <header>
        <a href="#" class="logo">
          <img src="/uploads/couple.jpg" alt="Pärchenbild" onerror="this.src='/uploads/couple.png'">
          <span class="logo-text">Susibert</span>
        </a>
        
        <div>
          <a href="/admin?sessionId=${sessionId}" class="btn admin">Admin</a>
          <a href="/logout?sessionId=${sessionId}" class="btn logout">Abmelden</a>
        </div>
      </header>
      
      <div class="map-container">
        <div id="map"></div>
        
        <div class="control-btns">
          <button class="control-btn" id="menuBtn">☰</button>
        </div>
        
        <div class="marker-pin" id="markerPin"></div>
        
        <div class="sidebar" id="sidebar">
          <div class="sidebar-header">
            <h3 class="sidebar-title">Besuchte Orte</h3>
            <button class="sidebar-close" id="closeBtn">&times;</button>
          </div>
          
          <div class="sidebar-content" id="locationsContainer">
            <div style="text-align: center; color: #999;">Lade Orte...</div>
          </div>
          
          <div class="sidebar-footer">
            <button class="sidebar-button" id="addLocationBtn">Ort hinzufügen</button>
            <button class="sidebar-button" id="editModeBtn" style="background-color: #4caf50;">Bearbeiten</button>
          </div>
        </div>
        
        <div class="form-container" id="addLocationForm">
          <h3 class="form-title">Neuen Ort hinzufügen</h3>
          
          <form id="locationForm">
            <div class="form-group">
              <label class="form-label" for="locationTitle">Titel*</label>
              <input type="text" id="locationTitle" class="form-input" required>
            </div>
            
            <input type="hidden" id="locationLat">
            <input type="hidden" id="locationLng">
            
            <div class="form-group">
              <label class="form-label" for="locationDesc">Beschreibung</label>
              <textarea id="locationDesc" class="form-textarea"></textarea>
            </div>
            
            <div class="form-group">
              <label class="form-label" for="locationImage">Bild*</label>
              <input type="file" id="locationImage" class="form-input" accept="image/*" required>
            </div>
            
            <div class="form-actions">
              <button type="button" class="form-button secondary" id="cancelBtn">Abbrechen</button>
              <button type="submit" class="form-button primary">Speichern</button>
            </div>
          </form>
        </div>
        
        <div class="location-detail" id="locationDetail">
          <div class="detail-header">
            <h3 class="detail-title" id="detailTitle"></h3>
            <button class="detail-close" id="detailClose">&times;</button>
          </div>
          
          <img class="detail-image" id="detailImage" src="" alt="Ortsbild">
          
          <div class="detail-description" id="detailDescription"></div>
          
          <div class="detail-actions">
            <button class="detail-delete" id="detailDelete">Löschen</button>
          </div>
        </div>
      </div>
      
      <script>
        // DOM-Elemente
        const map = L.map('map').setView([30, 0], 2);
        const sidebar = document.getElementById('sidebar');
        const menuBtn = document.getElementById('menuBtn');
        const closeBtn = document.getElementById('closeBtn');
        const locationsContainer = document.getElementById('locationsContainer');
        const addLocationBtn = document.getElementById('addLocationBtn');
        const editModeBtn = document.getElementById('editModeBtn');
        const addLocationForm = document.getElementById('addLocationForm');
        const locationForm = document.getElementById('locationForm');
        const locationTitle = document.getElementById('locationTitle');
        const locationLat = document.getElementById('locationLat');
        const locationLng = document.getElementById('locationLng');
        const locationDesc = document.getElementById('locationDesc');
        const locationImage = document.getElementById('locationImage');
        const cancelBtn = document.getElementById('cancelBtn');
        const markerPin = document.getElementById('markerPin');
        const locationDetail = document.getElementById('locationDetail');
        const detailTitle = document.getElementById('detailTitle');
        const detailImage = document.getElementById('detailImage');
        const detailDescription = document.getElementById('detailDescription');
        const detailClose = document.getElementById('detailClose');
        const detailDelete = document.getElementById('detailDelete');
        
        // Karten-Layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        
        // Variablen
        let locations = [];
        let markers = {};
        let editMode = false;
        let activeLocationId = null;
        
        // Event-Listener
        menuBtn.addEventListener('click', toggleSidebar);
        closeBtn.addEventListener('click', toggleSidebar);
        addLocationBtn.addEventListener('click', startAddLocation);
        editModeBtn.addEventListener('click', toggleEditMode);
        cancelBtn.addEventListener('click', hideAddLocationForm);
        locationForm.addEventListener('submit', handleFormSubmit);
        detailClose.addEventListener('click', hideLocationDetail);
        detailDelete.addEventListener('click', deleteLocation);
        
        // Map Click-Event
        map.on('mousemove', handleMapMouseMove);
        
        // Funktionen
        function toggleSidebar() {
          sidebar.classList.toggle('open');
        }
        
        function startAddLocation() {
          if (!editMode) {
            toggleEditMode();
          }
          
          sidebar.classList.remove('open');
        }
        
        function toggleEditMode() {
          editMode = !editMode;
          
          editModeBtn.textContent = editMode ? 'Fertig' : 'Bearbeiten';
          editModeBtn.style.backgroundColor = editMode ? '#e53935' : '#4caf50';
          
          if (editMode) {
            map.on('click', handleMapClick);
          } else {
            map.off('click', handleMapClick);
            hideMarkerPin();
          }
        }
        
        function handleMapMouseMove(e) {
          if (!editMode) return;
          
          const { lat, lng } = e.latlng;
          
          // Position des Markers aktualisieren
          markerPin.style.display = 'block';
          markerPin.style.left = e.containerPoint.x + 'px';
          markerPin.style.top = e.containerPoint.y + 'px';
        }
        
        function hideMarkerPin() {
          markerPin.style.display = 'none';
        }
        
        function handleMapClick(e) {
          const { lat, lng } = e.latlng;
          
          locationLat.value = lat;
          locationLng.value = lng;
          
          showAddLocationForm();
        }
        
        function showAddLocationForm() {
          addLocationForm.style.display = 'block';
        }
        
        function hideAddLocationForm() {
          addLocationForm.style.display = 'none';
          locationForm.reset();
        }
        
        function handleFormSubmit(e) {
          e.preventDefault();
          
          const title = locationTitle.value;
          const lat = locationLat.value;
          const lng = locationLng.value;
          const desc = locationDesc.value;
          const file = locationImage.files[0];
          
          if (!title || !lat || !lng || !file) {
            alert('Bitte fülle alle Pflichtfelder aus.');
            return;
          }
          
          const formData = new FormData();
          formData.append('title', title);
          formData.append('latitude', lat);
          formData.append('longitude', lng);
          formData.append('description', desc);
          formData.append('image', file);
          formData.append('sessionId', '${sessionId}');
          
          fetch('/api/locations', {
            method: 'POST',
            body: formData
          })
          .then(response => response.json())
          .then(data => {
            if (data.error) {
              alert('Fehler: ' + data.error);
              return;
            }
            
            hideAddLocationForm();
            loadLocations();
          })
          .catch(error => {
            console.error('Fehler:', error);
            alert('Fehler beim Speichern des Ortes. Bitte versuche es später erneut.');
          });
        }
        
        function loadLocations() {
          locationsContainer.innerHTML = '<div style="text-align: center; color: #999;">Lade Orte...</div>';
          
          fetch('/api/locations?sessionId=${sessionId}')
            .then(response => {
              if (!response.ok) {
                throw new Error('Fehler beim Laden der Orte');
              }
              return response.json();
            })
            .then(data => {
              locations = data;
              
              if (locations.length === 0) {
                locationsContainer.innerHTML = '<div style="text-align: center; color: #999;">Keine Orte vorhanden.<br>Klicke auf "Ort hinzufügen", um zu beginnen.</div>';
                return;
              }
              
              renderLocations();
              renderMapMarkers();
            })
            .catch(error => {
              console.error('Fehler:', error);
              locationsContainer.innerHTML = '<div style="text-align: center; color: #999;">Fehler beim Laden der Orte.</div>';
            });
        }
        
        function renderLocations() {
          locationsContainer.innerHTML = '';
          
          locations.forEach(location => {
            const item = document.createElement('div');
            item.className = 'location-item';
            item.innerHTML = \`
              <div class="location-title">\${location.title || 'Unbenannter Ort'}</div>
            \`;
            
            item.addEventListener('click', () => {
              showLocationDetail(location);
              sidebar.classList.remove('open');
            });
            
            locationsContainer.appendChild(item);
          });
        }
        
        function renderMapMarkers() {
          // Bestehende Marker entfernen
          Object.values(markers).forEach(marker => {
            map.removeLayer(marker.marker);
            if (marker.circle) {
              map.removeLayer(marker.circle);
            }
          });
          markers = {};
          
          // Neue Marker erstellen
          locations.forEach(location => {
            const marker = L.marker([location.latitude, location.longitude]).addTo(map);
            
            marker.bindPopup(\`
              <div style="font-weight: bold; color: #f59a0c;">\${location.title || 'Unbenannter Ort'}</div>
              <a href="#" onclick="showLocationDetail(\${location.id}); return false;" style="color: #f59a0c;">Details anzeigen</a>
            \`);
            
            // Radius um den Marker
            const circle = L.circle([location.latitude, location.longitude], {
              color: '#f59a0c',
              fillColor: '#f59a0c',
              fillOpacity: 0.2,
              radius: 50000 // 50km
            }).addTo(map);
            
            markers[location.id] = { marker, circle };
          });
        }
        
        function showLocationDetail(location) {
          activeLocationId = location.id;
          
          detailTitle.textContent = location.title || 'Unbenannter Ort';
          detailDescription.textContent = location.description || 'Keine Beschreibung vorhanden.';
          
          // Bild anzeigen (entweder aus der Datenbank oder Standardbild)
          detailImage.src = '/uploads/couple.jpg';
          detailImage.onerror = () => {
            detailImage.src = '/uploads/couple.png';
          };
          
          locationDetail.style.display = 'block';
          
          // Karte auf den Ort zentrieren
          map.setView([location.latitude, location.longitude], 10);
          
          // Marker hervorheben
          if (markers[location.id]) {
            markers[location.id].marker.openPopup();
          }
        }
        
        function hideLocationDetail() {
          locationDetail.style.display = 'none';
          activeLocationId = null;
        }
        
        function deleteLocation() {
          if (!activeLocationId) return;
          
          if (confirm('Möchtest du diesen Ort wirklich löschen?')) {
            fetch('/api/locations/' + activeLocationId + '?sessionId=${sessionId}', {
              method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
              if (data.error) {
                alert('Fehler: ' + data.error);
                return;
              }
              
              hideLocationDetail();
              loadLocations();
            })
            .catch(error => {
              console.error('Fehler:', error);
              alert('Fehler beim Löschen des Ortes. Bitte versuche es später erneut.');
            });
          }
        }
        
        // Globale Funktionen für Popups
        window.showLocationDetail = function(id) {
          const location = locations.find(loc => loc.id === id);
          if (location) {
            showLocationDetail(location);
          }
        };
        
        // Seite initialisieren
        loadLocations();
      </script>
    </body>
    </html>
  `;
  
  res.send(mapHtml);
});

// Auf fehlende Thumbnails prüfen
async function generateAllMissingThumbnails() {
  try {
    console.log('Prüfe auf fehlende Thumbnails für bestehende Orte...');
    
    const result = await pool.query(`
      SELECT id, image_data, image_type 
      FROM locations 
      WHERE image_data IS NOT NULL 
        AND thumbnail_data IS NULL
    `);
    
    if (result.rows.length === 0) {
      console.log('Alle Orte haben bereits Thumbnails');
      return;
    }
    
    console.log(`${result.rows.length} Orte ohne Thumbnails gefunden, erstelle fehlende Thumbnails...`);
    
    for (const row of result.rows) {
      await ensureThumbnailExists(row.id, row.image_data, row.image_type);
    }
    
    console.log('Thumbnail-Generierung abgeschlossen');
  } catch (error) {
    console.error('Fehler bei der Thumbnail-Generierung:', error);
  }
}

// Thumbnail für einen Ort erstellen
async function ensureThumbnailExists(id, imageData, imageType) {
  try {
    if (!imageData) return;
    
    const thumbnailData = await sharp(imageData)
      .resize(60, 60, { fit: 'cover' })
      .toBuffer();
    
    await pool.query(
      'UPDATE locations SET thumbnail_data = $1 WHERE id = $2',
      [thumbnailData, id]
    );
    
    console.log(`Thumbnail für Ort ${id} erstellt`);
  } catch (error) {
    console.error(`Fehler beim Erstellen des Thumbnails für Ort ${id}:`, error);
  }
}

// Storage für das hochgeladene Bild konfigurieren
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB Limit
});

// Alle Orte abrufen
app.get('/api/locations', requireAuth, async (req, res) => {
  try {
    // Versuche die Orte abzurufen, zuerst mit 'title', dann mit 'name'
    let result;
    try {
      result = await pool.query('SELECT id, title, latitude, longitude, description FROM locations ORDER BY id DESC');
    } catch (error) {
      try {
        result = await pool.query('SELECT id, name AS title, latitude, longitude, description FROM locations ORDER BY id DESC');
      } catch (error2) {
        return res.status(500).json([]);
      }
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Orte:', error);
    res.status(500).json([]);
  }
});

// Neuen Ort hinzufügen
app.post('/api/locations', upload.single('image'), async (req, res) => {
  try {
    // Parameter aus dem Request
    const { title, latitude, longitude, description, sessionId } = req.body;
    
    // Prüfe, ob alle erforderlichen Felder vorhanden sind
    if (!title || !latitude || !longitude) {
      return res.status(400).json({ error: 'Titel und Koordinaten sind erforderlich' });
    }
    
    // Prüfe die Session
    if (!sessionId || !sessions[sessionId] || !sessions[sessionId].authenticated) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }
    
    // Bildverarbeitung, falls ein Bild hochgeladen wurde
    let imageData = null;
    let imageType = null;
    let thumbnailData = null;
    
    if (req.file) {
      imageData = req.file.buffer;
      imageType = req.file.mimetype;
      
      // Thumbnail erstellen
      try {
        thumbnailData = await sharp(imageData)
          .resize(60, 60, { fit: 'cover' })
          .toBuffer();
      } catch (error) {
        console.error('Fehler beim Erstellen des Thumbnails:', error);
      }
    }
    
    // In die Datenbank einfügen
    try {
      const result = await pool.query(
        'INSERT INTO locations (title, latitude, longitude, description, image_data, image_type, thumbnail_data) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [title, latitude, longitude, description, imageData, imageType, thumbnailData]
      );
      
      return res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
      console.error('Fehler beim Einfügen in die Datenbank:', error);
      return res.status(500).json({ error: error.message });
    }
  } catch (error) {
    console.error('Fehler beim Hinzufügen des Ortes:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Ort löschen
app.delete('/api/locations/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query('DELETE FROM locations WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Fehler beim Löschen des Ortes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Server starten
connectToDatabase().then(connected => {
  dbConnected = connected;
  console.log('Datenbankverbindung Status:', dbConnected);
  
  app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
  });
});