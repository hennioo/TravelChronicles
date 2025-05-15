// Einfacher Server für Render mit dynamischer Spaltenerkennung
const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs-extra');
const sharp = require('sharp');
const path = require('path');
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
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Uploads Verzeichnis erstellen
const uploadsDir = path.join(__dirname, 'uploads');
fs.ensureDirSync(uploadsDir);

// Datenbank-Verbindung
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Temporärer Speicher für Sessions
const sessions = {};

// Spalteninformationen
let columnsInfo = {
  titleColumn: null,  // 'title' oder 'name'
  hasImageColumn: false,
  hasImageTypeColumn: false,
  hasThumbnailColumn: false
};

// Verbindung zur Datenbank prüfen und Spalteninformationen ermitteln
async function initializeDatabase() {
  try {
    const client = await pool.connect();
    console.log('Datenbankverbindung hergestellt');
    
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
      console.log('Tabelle locations existiert, prüfe Spalten...');
      
      // Spalten der Tabelle abrufen
      const columnsResult = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
      `);
      
      const columns = columnsResult.rows.map(row => row.column_name);
      console.log('Vorhandene Spalten:', columns);
      
      // Spalteninformationen speichern
      columnsInfo.titleColumn = columns.includes('title') ? 'title' : (columns.includes('name') ? 'name' : null);
      columnsInfo.hasImageColumn = columns.includes('image_data') || columns.includes('image');
      columnsInfo.hasImageTypeColumn = columns.includes('image_type');
      columnsInfo.hasThumbnailColumn = columns.includes('thumbnail_data') || columns.includes('thumbnail');
      
      console.log('Spalteninformationen:', columnsInfo);
    } else {
      console.log('Tabelle locations existiert nicht, erstelle sie...');
      await client.query(`
        CREATE TABLE locations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          latitude DECIMAL(10, 8) NOT NULL,
          longitude DECIMAL(11, 8) NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      columnsInfo.titleColumn = 'name';
      console.log('Tabelle erstellt mit name statt title');
    }
    
    client.release();
    return true;
  } catch (error) {
    console.error('Fehler bei der Datenbankinitialisierung:', error);
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
app.get('/', (req, res) => {
  const sessionId = createSession();
  
  res.send(`
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
    </html>
  `);
});

// Login-Verarbeitung
app.post('/login', (req, res) => {
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
    // Spalteninformationen aktualisieren
    const client = await pool.connect();
    
    // Spalten der Tabelle abrufen
    const columnsResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'locations'
      ORDER BY ordinal_position
    `);
    
    const columns = columnsResult.rows.map(row => `${row.column_name} (${row.data_type})`);
    
    // Anzahl der Orte abfragen
    const countResult = await client.query('SELECT COUNT(*) FROM locations');
    const locationCount = countResult.rows[0].count;
    
    client.release();
    
    res.send(`
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
          
          .success-box {
            background-color: rgba(76, 175, 80, 0.2);
            border: 1px solid #4caf50;
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
            <h2 class="section-title">Datenbankstatus</h2>
            <div class="success-box">
              <strong>Anzahl der Orte:</strong> ${locationCount}<br>
              <strong>Titel-Spalte erkannt als:</strong> ${columnsInfo.titleColumn || 'Nicht erkannt'}<br>
              <strong>Bild-Spalte vorhanden:</strong> ${columnsInfo.hasImageColumn ? 'Ja' : 'Nein'}<br>
              <strong>Thumbnail-Spalte vorhanden:</strong> ${columnsInfo.hasThumbnailColumn ? 'Ja' : 'Nein'}
            </div>
            <p><strong>Vollständige Spalteninformationen:</strong></p>
            <div class="info-box">${columns.join('\n')}</div>
          </div>
          
          <div class="admin-section">
            <h2 class="section-title">Wichtige Hinweise</h2>
            <div class="warning">
              <strong>Hinweis zur Datenbankstruktur:</strong> 
              <p>Die Datenbank verwendet als Spalte für Ortsnamen: <strong>${columnsInfo.titleColumn || 'Unbekannt'}</strong></p>
              <p>Der Server passt sich automatisch an diese Struktur an.</p>
            </div>
          </div>
          
          <a href="/map?sessionId=${sessionId}" class="back-link">← Zurück zur Karte</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Fehler beim Laden der Admin-Seite:', error);
    res.status(500).send(`<h1>Fehler beim Laden der Admin-Seite</h1><p>${error.message}</p>`);
  }
});

// Kartenansicht
app.get('/map', requireAuth, (req, res) => {
  const sessionId = req.query.sessionId;
  
  res.send(`
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
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
        }
        
        .header {
          background-color: #222;
          padding: 15px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #333;
          z-index: 1000;
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
        
        .map-container {
          flex: 1;
          position: relative;
          overflow: hidden;
        }
        
        #map {
          width: 100%;
          height: 100%;
        }
        
        .control-buttons {
          position: absolute;
          top: 20px;
          right: 20px;
          z-index: 1000;
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
        
        .sidebar {
          position: fixed;
          top: 70px;
          right: -300px;
          width: 300px;
          height: calc(100vh - 70px);
          background-color: rgba(34, 34, 34, 0.95);
          z-index: 1000;
          transform: translateX(0);
          transition: right 0.3s ease;
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
          font-weight: bold;
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
        
        .locations-list {
          flex: 1;
          overflow-y: auto;
          padding: 0;
        }
        
        .empty-state {
          padding: 20px;
          text-align: center;
          color: #999;
        }
        
        .sidebar-footer {
          padding: 15px;
          border-top: 1px solid #333;
        }
        
        .sidebar-btn {
          display: block;
          width: 100%;
          padding: 10px;
          text-align: center;
          background-color: #f59a0c;
          color: black;
          border: none;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
          margin-bottom: 10px;
          text-decoration: none;
        }
        
        .footer-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        
        .admin-btn {
          background-color: #2196f3;
          color: white;
        }
        
        .location-detail {
          position: absolute;
          top: 20px;
          left: 20px;
          width: 320px;
          background-color: rgba(34, 34, 34, 0.9);
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          z-index: 999;
          display: none;
        }
        
        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }
        
        .detail-title {
          font-size: 1.4rem;
          font-weight: bold;
          color: #f59a0c;
          margin: 0;
        }
        
        .detail-close {
          background: none;
          border: none;
          color: #aaa;
          cursor: pointer;
          font-size: 1.5rem;
        }
        
        .detail-coords {
          font-size: 0.85rem;
          color: #aaa;
          margin-bottom: 15px;
        }
        
        .detail-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 20px;
        }
        
        .detail-button {
          background-color: #e53935;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .location-form {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 80%;
          max-width: 400px;
          background-color: rgba(34, 34, 34, 0.95);
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          z-index: 1001;
          display: none;
        }
        
        .form-title {
          font-size: 1.2rem;
          font-weight: bold;
          color: #f59a0c;
          margin: 0 0 15px 0;
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
          padding: 8px;
          background-color: #333;
          border: 1px solid #444;
          border-radius: 4px;
          color: #fff;
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
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
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
        
        @media (max-width: 768px) {
          .sidebar {
            width: 80%;
          }
          
          .location-detail {
            width: 80%;
            max-width: 300px;
          }
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
      
      <div class="map-container">
        <div id="map"></div>
        
        <div class="control-buttons">
          <button class="control-btn" id="menuBtn">☰</button>
          <button class="control-btn" id="logoutBtn">🚪</button>
        </div>
        
        <div class="sidebar" id="sidebar">
          <div class="sidebar-header">
            <h2 class="sidebar-title">Besuchte Orte</h2>
            <button class="sidebar-close" id="sidebarCloseBtn">&times;</button>
          </div>
          
          <div class="locations-list" id="locationsList">
            <div class="empty-state">Lade Orte...</div>
          </div>
          
          <div class="sidebar-footer">
            <button class="sidebar-btn" id="addLocationBtn">Ort hinzufügen</button>
            <div class="footer-buttons">
              <button class="sidebar-btn" id="editModeBtn">Bearbeiten</button>
              <a href="/admin?sessionId=${sessionId}" class="sidebar-btn admin-btn">Admin</a>
            </div>
          </div>
        </div>
        
        <div class="location-detail" id="locationDetail">
          <div class="detail-header">
            <h3 class="detail-title" id="detailTitle"></h3>
            <button class="detail-close" id="detailClose">&times;</button>
          </div>
          <div class="detail-coords" id="detailCoords"></div>
          <div id="detailDescription"></div>
          <div class="detail-actions">
            <button class="detail-button" id="detailDelete">Löschen</button>
          </div>
        </div>
        
        <form id="locationForm" class="location-form">
          <h3 class="form-title">Neuen Ort hinzufügen</h3>
          
          <div class="form-group">
            <label class="form-label" for="locationTitle">Titel*</label>
            <input type="text" id="locationTitle" class="form-input" required>
          </div>
          
          <div class="form-group">
            <label class="form-label">Koordinaten</label>
            <div style="display: flex; gap: 10px;">
              <input type="text" id="locationLat" class="form-input" placeholder="Breitengrad" readonly>
              <input type="text" id="locationLng" class="form-input" placeholder="Längengrad" readonly>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label" for="locationDescription">Beschreibung</label>
            <textarea id="locationDescription" class="form-textarea"></textarea>
          </div>
          
          <div class="form-actions">
            <button type="button" class="form-button secondary" id="cancelFormBtn">Abbrechen</button>
            <button type="submit" class="form-button primary">Speichern</button>
          </div>
        </form>
      </div>
      
      <script>
        // Karte initialisieren
        const map = L.map('map').setView([30, 0], 2);
        
        // Kartenlayer hinzufügen
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        
        // DOM-Elemente
        const sidebar = document.getElementById('sidebar');
        const locationsList = document.getElementById('locationsList');
        const menuBtn = document.getElementById('menuBtn');
        const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const addLocationBtn = document.getElementById('addLocationBtn');
        const editModeBtn = document.getElementById('editModeBtn');
        const locationDetail = document.getElementById('locationDetail');
        const detailTitle = document.getElementById('detailTitle');
        const detailCoords = document.getElementById('detailCoords');
        const detailDescription = document.getElementById('detailDescription');
        const detailClose = document.getElementById('detailClose');
        const detailDelete = document.getElementById('detailDelete');
        const locationForm = document.getElementById('locationForm');
        const locationTitle = document.getElementById('locationTitle');
        const locationLat = document.getElementById('locationLat');
        const locationLng = document.getElementById('locationLng');
        const locationDescription = document.getElementById('locationDescription');
        const cancelFormBtn = document.getElementById('cancelFormBtn');
        
        // Variablen
        let locations = [];
        let markers = {};
        let activeLocationId = null;
        let editMode = false;
        let tempMarker = null;
        const sessionId = '${sessionId}';
        
        // Event-Listener
        menuBtn.addEventListener('click', toggleSidebar);
        sidebarCloseBtn.addEventListener('click', closeSidebar);
        logoutBtn.addEventListener('click', confirmLogout);
        addLocationBtn.addEventListener('click', showAddLocationForm);
        editModeBtn.addEventListener('click', toggleEditMode);
        detailClose.addEventListener('click', closeLocationDetail);
        detailDelete.addEventListener('click', deleteLocation);
        cancelFormBtn.addEventListener('click', hideLocationForm);
        locationForm.addEventListener('submit', saveLocation);
        
        // Funktionen
        function toggleSidebar() {
          sidebar.classList.toggle('open');
        }
        
        function closeSidebar() {
          sidebar.classList.remove('open');
        }
        
        function confirmLogout() {
          if (confirm('Möchtest du dich wirklich abmelden?')) {
            window.location.href = '/logout?sessionId=' + sessionId;
          }
        }
        
        function toggleEditMode() {
          editMode = !editMode;
          editModeBtn.textContent = editMode ? 'Fertig' : 'Bearbeiten';
          editModeBtn.style.backgroundColor = editMode ? '#e53935' : '';
          
          if (editMode) {
            map.on('click', handleMapClick);
          } else {
            map.off('click', handleMapClick);
            if (tempMarker) {
              map.removeLayer(tempMarker);
              tempMarker = null;
            }
          }
        }
        
        function handleMapClick(e) {
          const latlng = e.latlng;
          
          if (tempMarker) {
            map.removeLayer(tempMarker);
          }
          
          tempMarker = L.marker(latlng).addTo(map);
          locationLat.value = latlng.lat.toFixed(6);
          locationLng.value = latlng.lng.toFixed(6);
          
          showLocationForm();
        }
        
        function showAddLocationForm() {
          if (!editMode) {
            toggleEditMode();
          }
          closeSidebar();
        }
        
        function showLocationForm() {
          locationForm.style.display = 'block';
        }
        
        function hideLocationForm() {
          locationForm.style.display = 'none';
          if (tempMarker) {
            map.removeLayer(tempMarker);
            tempMarker = null;
          }
        }
        
        function saveLocation(e) {
          e.preventDefault();
          
          const title = locationTitle.value;
          const latitude = parseFloat(locationLat.value);
          const longitude = parseFloat(locationLng.value);
          const description = locationDescription.value;
          
          if (!title || isNaN(latitude) || isNaN(longitude)) {
            alert('Bitte fülle alle Pflichtfelder aus.');
            return;
          }
          
          // Vereinfachte Speicherung, keine Bilder
          fetch('/api/locations?sessionId=' + sessionId, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: title,  // Wir verwenden 'name' als Standard
              title: title, // Wir senden auch 'title' für den Fall, dass die Spalte so heißt
              latitude,
              longitude,
              description
            })
          })
          .then(response => response.json())
          .then(data => {
            if (data.error) {
              alert('Fehler: ' + data.error);
              return;
            }
            
            loadLocations();
            hideLocationForm();
            
            if (tempMarker) {
              map.removeLayer(tempMarker);
              tempMarker = null;
            }
            
            locationForm.reset();
          })
          .catch(error => {
            console.error('Fehler beim Speichern:', error);
            alert('Fehler beim Speichern des Ortes. Bitte versuche es später erneut.');
          });
        }
        
        function showLocationDetail(id) {
          const location = locations.find(loc => loc.id == id);
          if (!location) return;
          
          activeLocationId = id;
          detailTitle.textContent = location.name || location.title;
          detailCoords.textContent = 'Koordinaten: ' + location.latitude + ', ' + location.longitude;
          detailDescription.textContent = location.description || 'Keine Beschreibung vorhanden.';
          
          locationDetail.style.display = 'block';
          
          // Karte zentrieren
          map.setView([location.latitude, location.longitude], 10);
          
          if (markers[id]) {
            markers[id].openPopup();
          }
        }
        
        function closeLocationDetail() {
          locationDetail.style.display = 'none';
          activeLocationId = null;
        }
        
        function deleteLocation() {
          if (!activeLocationId) return;
          
          if (confirm('Möchtest du diesen Ort wirklich löschen?')) {
            fetch('/api/locations/' + activeLocationId + '?sessionId=' + sessionId, {
              method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
              if (data.error) {
                alert('Fehler: ' + data.error);
                return;
              }
              
              closeLocationDetail();
              loadLocations();
            })
            .catch(error => {
              console.error('Fehler beim Löschen:', error);
              alert('Fehler beim Löschen des Ortes. Bitte versuche es später erneut.');
            });
          }
        }
        
        function loadLocations() {
          locationsList.innerHTML = '<div class="empty-state">Lade Orte...</div>';
          
          fetch('/api/locations?sessionId=' + sessionId)
            .then(response => response.json())
            .then(data => {
              locations = data;
              renderLocations();
              renderMarkers();
            })
            .catch(error => {
              console.error('Fehler beim Laden der Orte:', error);
              locationsList.innerHTML = '<div class="empty-state">Fehler beim Laden der Orte.</div>';
            });
        }
        
        function renderLocations() {
          locationsList.innerHTML = '';
          
          if (locations.length === 0) {
            locationsList.innerHTML = '<div class="empty-state">Keine Orte vorhanden. Klicke auf "Ort hinzufügen", um zu beginnen.</div>';
            return;
          }
          
          // HTML für die Ortsliste erstellen
          const html = locations.map(location => {
            const title = location.name || location.title;
            return \`
              <div class="location-item" data-id="\${location.id}" onclick="showLocationDetail(\${location.id})">
                <div class="location-info">
                  <div class="location-title">\${title}</div>
                  <div class="location-coords">\${location.latitude.toFixed(4)}, \${location.longitude.toFixed(4)}</div>
                </div>
              </div>
            \`;
          }).join('');
          
          locationsList.innerHTML = html;
        }
        
        function renderMarkers() {
          // Bestehende Marker entfernen
          Object.values(markers).forEach(marker => map.removeLayer(marker));
          markers = {};
          
          // Neue Marker hinzufügen
          locations.forEach(location => {
            const marker = L.marker([location.latitude, location.longitude]).addTo(map);
            const title = location.name || location.title;
            
            marker.bindPopup(\`
              <div>
                <div style="font-weight: bold; color: #f59a0c;">\${title}</div>
                <a href="#" onclick="showLocationDetail(\${location.id}); return false;" style="color: #f59a0c;">Details anzeigen</a>
              </div>
            \`);
            
            // Radius um den Marker
            L.circle([location.latitude, location.longitude], {
              color: '#f59a0c',
              fillColor: '#f59a0c',
              fillOpacity: 0.2,
              radius: 50000 // 50km
            }).addTo(map);
            
            markers[location.id] = marker;
          });
        }
        
        // Seite initialisieren
        loadLocations();
        
        // Globale Funktionen für Popup-Links
        window.showLocationDetail = showLocationDetail;
      </script>
    </body>
    </html>
  `);
});

// API-Endpunkte

// Alle Orte abrufen
app.get('/api/locations', requireAuth, async (req, res) => {
  try {
    let result;
    const titleCol = columnsInfo.titleColumn || 'name';
    
    // Dynamische SQL-Abfrage basierend auf erkannten Spalten
    result = await pool.query(`SELECT id, ${titleCol}, latitude, longitude, description FROM locations ORDER BY id DESC`);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Orte:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ort speichern
app.post('/api/locations', requireAuth, express.json(), async (req, res) => {
  try {
    const { name, title, latitude, longitude, description } = req.body;
    
    // Verwende die erkannte Titelspalte oder "name" als Standard
    const titleCol = columnsInfo.titleColumn || 'name';
    const titleValue = titleCol === 'title' ? title : name;
    
    const query = `INSERT INTO locations (${titleCol}, latitude, longitude, description) VALUES ($1, $2, $3, $4) RETURNING id`;
    const result = await pool.query(query, [titleValue, latitude, longitude, description]);
    
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Fehler beim Speichern des Ortes:', error);
    res.status(500).json({ error: error.message });
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
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
  });
}).catch(err => {
  console.error('Fehler beim Start des Servers:', err);
});