// Einfacher Server für Susibert Travel Map
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
app.use('/uploads', express.static('uploads'));
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
    return true;
  } catch (error) {
    console.error('Fehler bei der Datenbankverbindung:', error.message);
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

// Login-Seite
app.get('/', function(req, res) {
  // Erstellt eine neue Session
  const sessionId = createSession();
  
  const htmlContent = `<!DOCTYPE html>
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
        
        .login-form .form-group {
          margin-bottom: 20px;
        }
        
        .login-form label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
        }
        
        .login-form input {
          width: 100%;
          padding: 12px;
          background-color: #333;
          border: 1px solid #444;
          border-radius: 6px;
          color: white;
          font-size: 1rem;
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
        
        <form class="login-form" id="loginForm">
          <div class="form-group">
            <label for="accessCode">Zugriffscode</label>
            <input type="password" id="accessCode" name="accessCode" placeholder="Bitte Code eingeben..." required>
          </div>
          
          <button type="submit">Anmelden</button>
        </form>
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
    </html>`;
    
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
app.get('/admin', requireAuth, function(req, res) {
  const sessionId = req.query.sessionId;
  
  // Hole Spalteninformationen aus der DB
  pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'locations'
    ORDER BY ordinal_position
  `).then(result => {
    const columns = result.rows.map(row => `${row.column_name} (${row.data_type})`);
    
    const adminHtml = `<!DOCTYPE html>
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
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }
        
        .header {
          background-color: #222;
          padding: 15px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #333;
        }
        
        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #f59a0c;
          text-decoration: none;
        }
        
        .logo-circle {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          overflow: hidden;
          border: 2px solid #f59a0c;
        }
        
        .logo-circle img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .logo-text {
          font-size: 1.5rem;
          font-weight: bold;
        }
        
        .content {
          flex: 1;
          padding: 30px;
          max-width: 800px;
          margin: 0 auto;
          width: 100%;
        }
        
        .admin-title {
          font-size: 2rem;
          color: #f59a0c;
          margin-bottom: 30px;
          text-align: center;
        }
        
        .admin-section {
          background-color: #222;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 30px;
        }
        
        .section-title {
          font-size: 1.4rem;
          margin-top: 0;
          margin-bottom: 15px;
          color: #f59a0c;
        }
        
        .info-box {
          background-color: #333;
          border: 1px solid #444;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 20px;
          font-family: monospace;
          white-space: pre-wrap;
          max-height: 200px;
          overflow-y: auto;
        }
        
        .warning {
          background-color: rgba(229, 57, 53, 0.2);
          border: 1px solid #e53935;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 20px;
        }
        
        .admin-button {
          background-color: #e53935;
          color: white;
          border: none;
          padding: 10px 15px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          margin-right: 10px;
        }
        
        .admin-button.green {
          background-color: #4caf50;
        }
        
        .admin-button.orange {
          background-color: #f59a0c;
          color: black;
        }
        
        .admin-button.blue {
          background-color: #2196f3;
        }
        
        .back-link {
          display: inline-block;
          margin-top: 20px;
          color: #f59a0c;
          text-decoration: none;
        }
        
        .back-link:hover {
          text-decoration: underline;
        }
        
        .action-result {
          display: none;
          margin-top: 15px;
          padding: 10px;
          border-radius: 4px;
        }
        
        .action-result.success {
          background-color: rgba(76, 175, 80, 0.2);
          border: 1px solid #4caf50;
        }
        
        .action-result.error {
          background-color: rgba(229, 57, 53, 0.2);
          border: 1px solid #e53935;
        }
        
        @media (max-width: 768px) {
          .content {
            padding: 20px;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <a href="/map?sessionId=${sessionId}" class="logo">
          <div class="logo-circle">
            <img src="/uploads/couple.jpg" alt="Pärchenbild" onerror="this.src='/uploads/couple.png'">
          </div>
          <span class="logo-text">Susibert</span>
        </a>
      </div>
      
      <div class="content">
        <h1 class="admin-title">Administrator-Bereich</h1>
        
        <div class="admin-section">
          <h2 class="section-title">Datenbankstruktur</h2>
          <p>Aktuelle Spalten in der locations-Tabelle:</p>
          <div class="info-box">${columns.join('\n')}</div>
          <p>Diese Information ist wichtig, um zu verstehen, wie auf Orte zugegriffen werden kann.</p>
        </div>
        
        <div class="admin-section">
          <h2 class="section-title">Konfigurationshinweis</h2>
          <div class="warning">
            <strong>Wichtiger Hinweis:</strong> Es scheint, dass deine Datenbank den Spaltennamen "name" statt "title" verwendet. 
            Du solltest den Server-Code entsprechend anpassen, um mit dieser Spaltenstruktur zu arbeiten.
          </div>
        </div>
        
        <a href="/map?sessionId=${sessionId}" class="back-link">← Zurück zur Karte</a>
      </div>
    </body>
    </html>`;
    
    res.send(adminHtml);
  }).catch(err => {
    res.send(`<h1>Fehler beim Abrufen der Datenbankstruktur</h1><p>${err.message}</p>`);
  });
});

// Geschützte Kartenansicht mit Leaflet
app.get('/map', requireAuth, function(req, res) {
  // Prüfe, ob die Datenbankverbindung aktiv ist
  if (!dbConnected) {
    return res.send(`
      <h1>Datenbankverbindung nicht verfügbar</h1>
      <p>Die Verbindung zur Datenbank konnte nicht hergestellt werden.</p>
      <a href="/">Zurück zur Anmeldung</a>
    `);
  }

  // Hole die Session-ID aus der Anfrage
  const sessionId = req.query.sessionId;

  // Map-HTML-Datei inline generieren, sehr vereinfacht
  const mapHtml = `<!DOCTYPE html>
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
      }
      
      .header {
        background-color: #222;
        padding: 15px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .logo {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #f59a0c;
        text-decoration: none;
      }
      
      .logo-circle {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        overflow: hidden;
        border: 2px solid #f59a0c;
      }
      
      .logo-circle img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      
      .logo-text {
        font-size: 1.5rem;
        font-weight: bold;
      }
      
      #map { 
        height: calc(100vh - 70px);
        width: 100%;
      }
      
      .controls {
        position: absolute;
        top: 85px;
        right: 15px;
        z-index: 1000;
        display: flex;
        flex-direction: column;
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

      .sidebar {
        position: fixed;
        top: 70px;
        right: -300px;
        width: 300px;
        height: calc(100vh - 70px);
        background-color: #222;
        transition: right 0.3s ease;
        z-index: 1000;
        display: flex;
        flex-direction: column;
      }

      .sidebar.open {
        right: 0;
      }

      .sidebar-header {
        padding: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #333;
      }

      .sidebar-title {
        margin: 0;
        color: #f59a0c;
        font-size: 1.2rem;
      }

      .sidebar-close {
        background: none;
        border: none;
        font-size: 24px;
        color: #aaa;
        cursor: pointer;
      }

      .sidebar-content {
        flex: 1;
        overflow-y: auto;
        padding: 15px;
      }

      .sidebar-footer {
        padding: 15px;
        border-top: 1px solid #333;
      }

      .sidebar-button {
        display: block;
        width: 100%;
        padding: 10px 12px;
        margin-bottom: 10px;
        background-color: #f59a0c;
        color: black;
        border: none;
        border-radius: 4px;
        font-weight: bold;
        text-align: center;
        cursor: pointer;
        text-decoration: none;
      }

      .sidebar-button.blue {
        background-color: #2196f3;
        color: white;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <a href="#" class="logo">
        <div class="logo-circle">
          <img src="/uploads/couple.jpg" alt="Pärchenbild" onerror="this.src='/uploads/couple.png'">
        </div>
        <span class="logo-text">Susibert</span>
      </a>
    </div>
    
    <div id="map"></div>
    
    <div class="controls">
      <button class="control-btn" id="menuBtn">☰</button>
      <button class="control-btn" id="logoutBtn">🚪</button>
    </div>

    <div class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <h3 class="sidebar-title">Menü</h3>
        <button class="sidebar-close" id="sidebarCloseBtn">&times;</button>
      </div>
      <div class="sidebar-content">
        <p>Die Kartenfunktion ist vereinfacht, bis die Datenbank korrekt eingerichtet ist.</p>
        <p>Bitte gehe zum Admin-Bereich, um die Datenbankstruktur einzusehen.</p>
      </div>
      <div class="sidebar-footer">
        <a href="/admin?sessionId=${sessionId}" class="sidebar-button blue">Admin-Bereich</a>
        <button class="sidebar-button" id="logoutBtn2">Abmelden</button>
      </div>
    </div>
    
    <script>
      // Karte initialisieren
      const map = L.map('map').setView([51.505, -0.09], 3);
      
      // OpenStreetMap-Layer hinzufügen
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      
      // Sidebar-Funktionalität
      const sidebar = document.getElementById('sidebar');
      const menuBtn = document.getElementById('menuBtn');
      const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
      const logoutBtn = document.getElementById('logoutBtn');
      const logoutBtn2 = document.getElementById('logoutBtn2');
      
      menuBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
      });
      
      sidebarCloseBtn.addEventListener('click', () => {
        sidebar.classList.remove('open');
      });
      
      logoutBtn.addEventListener('click', logout);
      logoutBtn2.addEventListener('click', logout);
      
      function logout() {
        if (confirm('Möchtest du dich wirklich abmelden?')) {
          window.location.href = '/logout?sessionId=${sessionId}';
        }
      }
    </script>
  </body>
  </html>`;
  
  res.send(mapHtml);
});

// Alle Orte abrufen (NICHT VERWENDET)
app.get('/api/locations', requireAuth, async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    // Versuche, sowohl "name" als auch "title" als mögliche Spaltennamen zu berücksichtigen
    let result;
    try {
      result = await pool.query('SELECT id, name, latitude, longitude, description FROM locations ORDER BY created_at DESC');
    } catch (err) {
      try {
        result = await pool.query('SELECT id, title, latitude, longitude, description FROM locations ORDER BY created_at DESC');
      } catch (err2) {
        return res.status(500).json({ error: 'Spaltenstruktur konnte nicht erkannt werden. Bitte überprüfe im Admin-Bereich die Datenbankstruktur.' });
      }
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Orte:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verbindung zur Datenbank herstellen
connectToDatabase().then(connected => {
  dbConnected = connected;
  console.log('Datenbankverbindung Status:', dbConnected);
}).catch(error => {
  console.error('Fehler bei der Datenbankverbindung:', error);
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});