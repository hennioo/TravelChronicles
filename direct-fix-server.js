// Super-direkter Fix-Server für Render (alles in einer Datei)
const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

// Konfiguration
const PORT = process.env.PORT || 3000;
const ACCESS_CODE = process.env.ACCESS_CODE || 'suuuu';
const DATABASE_URL = process.env.DATABASE_URL;

// App initialisieren
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statische Dateien
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
    console.log('Datenbankverbindung hergestellt');
    client.release();
    return true;
  } catch (error) {
    console.error('Fehler bei Datenbankverbindung:', error);
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

// SUPER-WICHTIG: DATENBANK-FIX ROUTE
app.get('/fix-database', async (req, res) => {
  try {
    console.log('==== BEGINNE DATENBANK-REPARATUR ====');
    
    const client = await pool.connect();
    
    // Tabelle löschen (wenn sie existiert)
    console.log('Lösche existierende Tabelle...');
    await client.query('DROP TABLE IF EXISTS locations CASCADE');
    console.log('Tabelle gelöscht');
    
    // Neue Tabelle erstellen
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
    
    // Test-Eintrag
    console.log('Füge Test-Ort hinzu...');
    await client.query(`
      INSERT INTO locations (title, latitude, longitude, description)
      VALUES ('Test-Ort', 52.5200, 13.4050, 'Ein Test-Ort in Berlin')
    `);
    console.log('Test-Ort hinzugefügt');
    
    // Erneut prüfen, ob die Tabelle existiert
    const check = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
      );
    `);
    
    const tableExists = check.rows[0].exists;
    
    // Spalten auflisten
    const columnsResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'locations'
      ORDER BY ordinal_position;
    `);
    
    const columns = columnsResult.rows.map(row => `${row.column_name} (${row.data_type})`);
    
    // Anzahl der Einträge
    const countResult = await client.query('SELECT COUNT(*) FROM locations;');
    const locationCount = countResult.rows[0].count;
    
    client.release();
    
    // HTML-Antwort
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
            background-color: #1a1a1a;
            color: #f5f5f5;
          }
          h1 { color: #4caf50; }
          .success { 
            background-color: #1e3c1e; 
            border: 1px solid #4caf50; 
            padding: 15px; 
            border-radius: 4px;
          }
          .columns {
            background-color: #222;
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
          <p>Anzahl Orte: ${locationCount}</p>
        </div>
        
        <h2>Spaltenstruktur:</h2>
        <div class="columns">
          <pre>${columns.join('\n')}</pre>
        </div>
        
        <a href="/map?sessionId=${req.query.sessionId || ''}">Zurück zur Karte</a>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('FEHLER BEI DER DATENBANK-REPARATUR:', error);
    
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
            background-color: #1a1a1a;
            color: #f5f5f5;
          }
          h1 { color: #e53935; }
          .error { 
            background-color: #3e1e1e; 
            border: 1px solid #e53935; 
            padding: 15px; 
            border-radius: 4px;
          }
          pre {
            background-color: #222;
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

// Login-Seite
app.get('/', function(req, res) {
  // Erstellt eine neue Session
  const sessionId = createSession();
  
  const htmlContent = '<!DOCTYPE html>\n' +
    '<html lang="de">\n' +
    '<head>\n' +
    '  <meta charset="UTF-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '  <title>Susibert - Login</title>\n' +
    '  <style>\n' +
    '    body {\n' +
    '      font-family: system-ui, -apple-system, sans-serif;\n' +
    '      background-color: #1a1a1a;\n' +
    '      color: #f5f5f5;\n' +
    '      margin: 0;\n' +
    '      padding: 0;\n' +
    '      display: flex;\n' +
    '      justify-content: center;\n' +
    '      align-items: center;\n' +
    '      min-height: 100vh;\n' +
    '    }\n' +
    '    \n' +
    '    .login-container {\n' +
    '      width: 90%;\n' +
    '      max-width: 400px;\n' +
    '      background-color: #222;\n' +
    '      border-radius: 12px;\n' +
    '      padding: 30px;\n' +
    '      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);\n' +
    '    }\n' +
    '    \n' +
    '    .login-title {\n' +
    '      text-align: center;\n' +
    '      margin-bottom: 30px;\n' +
    '    }\n' +
    '    \n' +
    '    .login-title h1 {\n' +
    '      font-size: 2.5rem;\n' +
    '      margin: 0;\n' +
    '      background: linear-gradient(45deg, #f59a0c, #ffbf49);\n' +
    '      -webkit-background-clip: text;\n' +
    '      -webkit-text-fill-color: transparent;\n' +
    '      background-clip: text;\n' +
    '    }\n' +
    '    \n' +
    '    .couple-photo {\n' +
    '      width: 150px;\n' +
    '      height: 150px;\n' +
    '      border-radius: 50%;\n' +
    '      object-fit: cover;\n' +
    '      margin: 0 auto 30px;\n' +
    '      display: block;\n' +
    '      border: 3px solid #f59a0c;\n' +
    '    }\n' +
    '    \n' +
    '    .login-form .form-group {\n' +
    '      margin-bottom: 20px;\n' +
    '    }\n' +
    '    \n' +
    '    .login-form label {\n' +
    '      display: block;\n' +
    '      margin-bottom: 8px;\n' +
    '      font-weight: bold;\n' +
    '    }\n' +
    '    \n' +
    '    .login-form input {\n' +
    '      width: 100%;\n' +
    '      padding: 12px;\n' +
    '      background-color: #333;\n' +
    '      border: 1px solid #444;\n' +
    '      border-radius: 6px;\n' +
    '      color: white;\n' +
    '      font-size: 1rem;\n' +
    '    }\n' +
    '    \n' +
    '    .login-form button {\n' +
    '      width: 100%;\n' +
    '      padding: 12px;\n' +
    '      background: linear-gradient(45deg, #f59a0c, #ffbf49);\n' +
    '      border: none;\n' +
    '      border-radius: 6px;\n' +
    '      color: black;\n' +
    '      font-size: 1rem;\n' +
    '      font-weight: bold;\n' +
    '      cursor: pointer;\n' +
    '      transition: opacity 0.2s;\n' +
    '    }\n' +
    '    \n' +
    '    .login-form button:hover {\n' +
    '      opacity: 0.9;\n' +
    '    }\n' +
    '    \n' +
    '    .error-message {\n' +
    '      background-color: #ff5252;\n' +
    '      color: white;\n' +
    '      padding: 10px;\n' +
    '      border-radius: 6px;\n' +
    '      margin-bottom: 20px;\n' +
    '      display: none;\n' +
    '    }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <div class="login-container">\n' +
    '    <div class="login-title">\n' +
    '      <h1>Susibert</h1>\n' +
    '    </div>\n' +
    '    \n' +
    '    <img src="/uploads/couple.jpg" alt="Pärchen" class="couple-photo" onerror="this.src=\'/uploads/couple.png\'">\n' +
    '    \n' +
    '    <div class="error-message" id="errorMessage"></div>\n' +
    '    \n' +
    '    <form class="login-form" id="loginForm">\n' +
    '      <div class="form-group">\n' +
    '        <label for="accessCode">Zugriffscode</label>\n' +
    '        <input type="password" id="accessCode" name="accessCode" placeholder="Bitte Code eingeben..." required>\n' +
    '      </div>\n' +
    '      \n' +
    '      <button type="submit">Anmelden</button>\n' +
    '    </form>\n' +
    '  </div>\n' +
    '  \n' +
    '  <script>\n' +
    '    // Login-Formular\n' +
    '    const loginForm = document.getElementById("loginForm");\n' +
    '    const errorMessage = document.getElementById("errorMessage");\n' +
    '    \n' +
    '    loginForm.addEventListener("submit", function(e) {\n' +
    '      e.preventDefault();\n' +
    '      \n' +
    '      const accessCode = document.getElementById("accessCode").value;\n' +
    '      \n' +
    '      fetch("/login", {\n' +
    '        method: "POST",\n' +
    '        headers: {\n' +
    '          "Content-Type": "application/json"\n' +
    '        },\n' +
    '        body: JSON.stringify({ \n' +
    '          accessCode: accessCode,\n' +
    '          sessionId: "' + sessionId + '"\n' +
    '        })\n' +
    '      })\n' +
    '      .then(response => response.json())\n' +
    '      .then(data => {\n' +
    '        if (data.success) {\n' +
    '          window.location.href = data.redirect;\n' +
    '        } else {\n' +
    '          errorMessage.textContent = data.message;\n' +
    '          errorMessage.style.display = "block";\n' +
    '        }\n' +
    '      })\n' +
    '      .catch(error => {\n' +
    '        console.error("Fehler:", error);\n' +
    '        errorMessage.textContent = "Ein Fehler ist aufgetreten. Bitte versuche es später erneut.";\n' +
    '        errorMessage.style.display = "block";\n' +
    '      });\n' +
    '    });\n' +
    '  </script>\n' +
    '</body>\n' +
    '</html>';
    
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

// Kartenansicht
app.get('/map', requireAuth, function(req, res) {
  const sessionId = req.query.sessionId;
  
  const mapHtml = `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Susibert - Karte</title>
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
      </style>
    </head>
    <body>
      <header>
        <a href="#" class="logo">
          <img src="/uploads/couple.jpg" alt="Pärchen" onerror="this.src='/uploads/couple.png'">
          <span class="logo-text">Susibert</span>
        </a>
        
        <div>
          <a href="/admin?sessionId=${sessionId}" class="btn admin">Admin</a>
          <a href="/logout?sessionId=${sessionId}" class="btn logout">Abmelden</a>
        </div>
      </header>
      
      <div class="map-container">
        <div id="map"></div>
      </div>
      
      <script>
        // Karte initialisieren
        const map = L.map('map').setView([30, 0], 2);
        
        // Kartenlayer hinzufügen
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        
        // Orte laden
        fetch('/api/locations?sessionId=${sessionId}')
          .then(response => {
            if (!response.ok) {
              throw new Error('Fehler beim Laden der Orte');
            }
            return response.json();
          })
          .then(locations => {
            if (locations && locations.length > 0) {
              // Orte auf der Karte anzeigen
              locations.forEach(location => {
                const marker = L.marker([location.latitude, location.longitude]).addTo(map);
                
                marker.bindPopup(
                  \`<div><strong>\${location.title || 'Ort'}</strong></div>\`
                );
                
                // Radius um den Marker (50km)
                L.circle([location.latitude, location.longitude], {
                  color: '#f59a0c',
                  fillColor: '#f59a0c',
                  fillOpacity: 0.2,
                  radius: 50000
                }).addTo(map);
              });
            } else {
              console.log('Keine Orte gefunden');
            }
          })
          .catch(error => {
            console.error('Fehler:', error);
          });
      </script>
    </body>
    </html>
  `;
  
  res.send(mapHtml);
});

// API-Endpunkte für Orte
app.get('/api/locations', requireAuth, async (req, res) => {
  try {
    // Hier zuerst mit title versuchen
    try {
      const result = await pool.query('SELECT id, title, latitude, longitude FROM locations ORDER BY id DESC');
      return res.json(result.rows);
    } catch (error) {
      console.log('Erster Versuch mit title fehlgeschlagen, versuche name...');
      // Wenn das nicht klappt, mit name versuchen
      const result = await pool.query('SELECT id, name AS title, latitude, longitude FROM locations ORDER BY id DESC');
      return res.json(result.rows);
    }
  } catch (error) {
    console.error('Fehler beim Abrufen der Orte:', error);
    return res.status(500).json([]);
  }
});

// Server starten
connectToDatabase().then(connected => {
  dbConnected = connected;
  console.log('Datenbankverbindung Status:', connected);
  
  app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
  });
});