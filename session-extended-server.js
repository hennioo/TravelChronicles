// Version mit erweitertem Session-Handling und Fehlerbehandlung
const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// Konfiguration
const PORT = process.env.PORT || 10000;
const ACCESS_CODE = process.env.ACCESS_CODE || 'suuuu';
const DATABASE_URL = process.env.DATABASE_URL;
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB Limit
const SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 Stunden

console.log('---------- SERVER START ----------');
console.log('Datum:', new Date().toISOString());
console.log('DATABASE_URL vorhanden:', !!DATABASE_URL);
console.log('Max. Bildgröße:', MAX_FILE_SIZE / (1024 * 1024), 'MB');
console.log('Session-Timeout:', SESSION_TIMEOUT / (60 * 1000), 'Minuten');

// App initialisieren
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Bessere Fehlerbehandlung für alle Anfragen
app.use((req, res, next) => {
  const originalJsonSend = res.json;
  
  // Override json method
  res.json = function(obj) {
    console.log(`Sende JSON-Antwort für ${req.method} ${req.url}:`, 
                typeof obj === 'object' ? JSON.stringify(obj).substring(0, 200) : obj);
    return originalJsonSend.call(this, obj);
  };
  
  next();
});

// Zusätzliche Fehlerbehandlung bei unbehandelten Ausnahmen
process.on('uncaughtException', (err) => {
  console.error('Unbehandelte Ausnahme:', err);
});

// Statische Dateien
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static('public'));

// Uploads-Verzeichnis erstellen, falls nicht vorhanden
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  console.log(`Erstelle Uploads-Verzeichnis: ${uploadsDir}`);
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Sessions
const sessions = {};

// Session-Cleanup alle 30 Minuten
setInterval(() => {
  const now = Date.now();
  let expiredCount = 0;
  
  for (const sessionId in sessions) {
    if (now - sessions[sessionId].created > SESSION_TIMEOUT) {
      delete sessions[sessionId];
      expiredCount++;
    }
  }
  
  if (expiredCount > 0) {
    console.log(`${expiredCount} abgelaufene Sessions entfernt.`);
  }
}, 30 * 60 * 1000);

// Datenbank-Verbindung
let pool;
try {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5, // Reduzierte Anzahl von Verbindungen
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 60000 // 60 Sekunden Timeout für Queries
  });
  console.log('Pool für Datenbankverbindung initialisiert');
  
  // Test-Query
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.error('Fehler bei Test-Query:', err.message);
    } else {
      console.log('Test-Query erfolgreich. Aktuelle Zeit:', res.rows[0].now);
    }
  });
} catch (error) {
  console.error('Fehler beim Initialisieren des Datenbankpools:', error.message);
}

// Login-Seite
app.get('/', function(req, res) {
  const sessionId = crypto.randomBytes(16).toString('hex');
  sessions[sessionId] = { created: Date.now(), authenticated: false };
  
  // Session-Cookie setzen
  res.cookie('sessionId', sessionId, { 
    maxAge: SESSION_TIMEOUT,
    httpOnly: true 
  });
  
  console.log('Neue Session erstellt:', sessionId);
  
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Susibert</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background-color: #1a1a1a;
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .login-box {
      background-color: #222;
      border-radius: 10px;
      padding: 30px;
      width: 300px;
      text-align: center;
      box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    }
    h1 {
      color: #f59a0c;
      margin-top: 0;
    }
    img {
      width: 150px;
      height: 150px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid #f59a0c;
      margin: 0 auto 20px;
      display: block;
    }
    label {
      display: block;
      text-align: left;
      margin-bottom: 5px;
    }
    input {
      width: 100%;
      padding: 10px;
      box-sizing: border-box;
      border-radius: 5px;
      border: 1px solid #444;
      background-color: #333;
      color: white;
      margin-bottom: 20px;
    }
    button {
      width: 100%;
      padding: 10px;
      background-color: #f59a0c;
      color: black;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
    }
    .error {
      background-color: #f44336;
      color: white;
      padding: 10px;
      border-radius: 5px;
      margin-bottom: 15px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>Susibert</h1>
    <img src="/uploads/couple.jpg" onerror="this.src='/uploads/couple.png'">
    <div id="error" class="error"></div>
    <form id="loginForm">
      <label for="code">Zugriffscode</label>
      <input type="password" id="code" placeholder="Bitte Code eingeben...">
      <button type="submit">Anmelden</button>
    </form>
  </div>

  <script>
    document.getElementById('loginForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const code = document.getElementById('code').value;
      
      fetch('/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accessCode: code
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          window.location.href = data.redirect;
        } else {
          const error = document.getElementById('error');
          error.textContent = data.message;
          error.style.display = 'block';
        }
      });
    });
  </script>
</body>
</html>`);
});

// Login-Verarbeitung
app.post('/login', (req, res) => {
  console.log('Login-Anfrage erhalten');
  const { accessCode } = req.body;
  
  // SessionId aus Cookies holen
  const sessionId = req.cookies.sessionId;
  
  if (!sessionId || !sessions[sessionId]) {
    return res.json({ success: false, message: 'Ungültige Session. Bitte lade die Seite neu.' });
  }
  
  if (accessCode === ACCESS_CODE) {
    sessions[sessionId].authenticated = true;
    console.log('User authentifiziert, Session:', sessionId);
    res.json({ success: true, redirect: '/map' });
  } else {
    res.json({ success: false, message: 'Falscher Zugriffscode. Bitte versuche es erneut.' });
  }
});

// Auth-Middleware mit verbesserten Fehlerberichten
function requireAuth(req, res, next) {
  // SessionId aus Cookies holen
  const sessionId = req.cookies.sessionId || req.query.sessionId;
  
  if (!sessionId) {
    console.log('Auth fehlgeschlagen: Keine SessionId');
    return res.redirect('/');
  }
  
  const session = sessions[sessionId];
  if (!session) {
    console.log('Auth fehlgeschlagen: Session nicht gefunden:', sessionId);
    return res.redirect('/');
  }
  
  if (!session.authenticated) {
    console.log('Auth fehlgeschlagen: Nicht authentifiziert, Session:', sessionId);
    return res.redirect('/');
  }
  
  // Session-Timeout überprüfen
  const now = Date.now();
  if (now - session.created > SESSION_TIMEOUT) {
    console.log('Auth fehlgeschlagen: Session abgelaufen, Session:', sessionId);
    delete sessions[sessionId];
    return res.redirect('/');
  }
  
  // Aktuelle Session an Request anhängen
  req.sessionId = sessionId;
  
  next();
}

// API-Anruf ohne HTML Fallback, falls nicht authentifiziert
function requireApiAuth(req, res, next) {
  // SessionId aus Cookies holen
  const sessionId = req.cookies.sessionId || req.query.sessionId || (req.body && req.body.sessionId);
  
  if (!sessionId) {
    return res.status(401).json({ error: 'Nicht authentifiziert. Keine Session-ID.' });
  }
  
  const session = sessions[sessionId];
  if (!session) {
    return res.status(401).json({ error: 'Nicht authentifiziert. Session nicht gefunden.' });
  }
  
  if (!session.authenticated) {
    return res.status(401).json({ error: 'Nicht authentifiziert.' });
  }
  
  // Session-Timeout überprüfen
  const now = Date.now();
  if (now - session.created > SESSION_TIMEOUT) {
    delete sessions[sessionId];
    return res.status(401).json({ error: 'Session abgelaufen. Bitte erneut anmelden.' });
  }
  
  // Aktuelle Session an Request anhängen
  req.sessionId = sessionId;
  
  next();
}

// Kartenansicht mit Leaflet.js
app.get('/map', requireAuth, (req, res) => {
  console.log('Kartenansicht angefordert');
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Susibert - Karte</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { 
          margin: 0; 
          padding: 0; 
          font-family: system-ui, -apple-system, sans-serif;
          background: #1a1a1a; 
          color: white; 
          min-height: 100vh;
        }
        
        .header { 
          background: #222; 
          padding: 15px 20px; 
          display: flex; 
          justify-content: space-between; 
          align-items: center;
          z-index: 1000;
          position: sticky;
          top: 0;
        }
        
        .logo { 
          color: #f59a0c; 
          font-size: 24px; 
          font-weight: bold; 
          text-decoration: none; 
          display: flex; 
          align-items: center; 
          gap: 10px;
        }
        
        .logo img { 
          width: 36px; 
          height: 36px; 
          border-radius: 50%; 
          object-fit: cover; 
          border: 2px solid #f59a0c;
        }
        
        .buttons a { 
          padding: 8px 16px; 
          background: #f59a0c; 
          color: black; 
          text-decoration: none; 
          border-radius: 4px; 
          margin-left: 10px;
          font-weight: bold;
        }
        
        .buttons a.logout { 
          background: #757575; 
          color: white;
        }
        
        .content {
          padding: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          background-color: #2a2a2a;
          min-height: calc(100vh - 70px);
        }
        
        .map-container { 
          width: 90%;
          max-width: 1000px;
          height: calc(100vh - 120px);
          position: relative;
          margin: 25px auto;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 5px 15px rgba(0,0,0,0.3);
          border: 2px solid #333;
        }
        
        #map {
          width: 100%;
          height: 100%;
          z-index: 1;
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
        }
        
        .menu-button {
          position: absolute;
          top: 20px;
          right: 20px;
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
          z-index: 999;
        }
        
        .marker-pin {
          width: 30px;
          height: 30px; 
          border-radius: 50%;
          border: 4px solid #f59a0c;
          background-color: rgba(245, 154, 12, 0.6);
          box-shadow: 0 0 0 2px white;
          transform: translate(-50%, -50%);
          position: absolute;
          z-index: 990;
          display: none;
          pointer-events: none;
        }
        
        .marker-pin-fixed {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 30px;
          height: 30px; 
          border-radius: 50%;
          border: 4px solid #f59a0c;
          background-color: rgba(245, 154, 12, 0.6);
          box-shadow: 0 0 0 2px white;
          transform: translate(-50%, -50%);
          z-index: 990;
          display: none;
          pointer-events: none;
        }

        .location-button {
          position: absolute;
          bottom: 25px;
          left: 50%;
          transform: translateX(-50%);
          padding: 12px 24px;
          background-color: #4caf50;
          color: white;
          border: none;
          border-radius: 30px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          display: none;
          z-index: 990;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
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
        
        .error-message {
          background-color: rgba(229, 57, 53, 0.8);
          color: white;
          padding: 15px;
          border-radius: 5px;
          position: fixed;
          top: 85px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          max-width: 80%;
          text-align: center;
          display: none;
        }
        
        .loading-indicator {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background-color: rgba(0, 0, 0, 0.8);
          padding: 20px;
          border-radius: 10px;
          z-index: 9999;
          display: none;
          color: white;
          text-align: center;
        }
        
        .loading-spinner {
          display: inline-block;
          width: 30px;
          height: 30px;
          border: 3px solid rgba(255,255,255,.3);
          border-radius: 50%;
          border-top-color: #f59a0c;
          animation: spin 1s ease-in-out infinite;
          margin-bottom: 10px;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        /* Responsive Anpassungen */
        @media (max-width: 768px) {
          .map-container {
            width: 95%;
            height: calc(100vh - 120px);
            margin: 15px auto;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <a href="#" class="logo">
          <img src="/uploads/couple.jpg" alt="Pärchenbild" onerror="this.src='/uploads/couple.png'">
          <span>Susibert</span>
        </a>
        <div class="buttons">
          <a href="/admin" class="admin">Admin</a>
          <a href="/logout" class="logout">Abmelden</a>
        </div>
      </div>
      
      <div class="error-message" id="errorMsg"></div>
      <div class="loading-indicator" id="loadingIndicator">
        <div class="loading-spinner"></div>
        <div>Wird hochgeladen...</div>
        <div id="loadingText">Bitte warten</div>
      </div>
      
      <div class="content">
        <div class="map-container">
          <div id="map"></div>
          <button class="menu-button" id="menuBtn">☰</button>
          <div class="marker-pin" id="markerPin"></div>
          <div class="marker-pin-fixed" id="fixedMarkerPin"></div>
          <button class="location-button" id="addHereBtn">Hier hinzufügen</button>
          
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
                <small style="color: #999; display: block; margin-top: 5px;">
                  Unterstützte Formate: JPG, PNG, HEIC. Max. 15MB.<br>
                  Tipp: Bei großen Bildern werden detaillierte Fehlerinformationen angezeigt.
                </small>
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
      </div>
      
      <script>
        // Hilfs-Debugging-Funktionen
        function debug(message, data = null) {
          const timestamp = new Date().toISOString();
          
          if (data) {
            console.log(\`[DEBUG \${timestamp}] \${message}\`, data);
          } else {
            console.log(\`[DEBUG \${timestamp}] \${message}\`);
          }
        }
        
        function showError(message, duration = 5000) {
          const errorMsg = document.getElementById('errorMsg');
          errorMsg.textContent = message;
          errorMsg.style.display = 'block';
          
          debug('FEHLER ANGEZEIGT: ' + message);
          
          setTimeout(() => {
            errorMsg.style.display = 'none';
          }, duration);
        }
        
        function showLoading(text = "Wird hochgeladen...") {
          const loadingText = document.getElementById('loadingText');
          loadingText.textContent = text;
          
          document.getElementById('loadingIndicator').style.display = 'block';
        }
        
        function hideLoading() {
          document.getElementById('loadingIndicator').style.display = 'none';
        }
        
        // Funktion zum Überprüfen, ob die Session gültig ist
        function checkSession() {
          fetch('/api/check-session')
            .then(response => {
              if (!response.ok) {
                window.location.href = '/';
                return null;
              }
              return response.json();
            })
            .then(data => {
              if (data && data.valid) {
                debug('Session gültig');
              }
            })
            .catch(() => {
              // Bei Fehler nichts tun
            });
        }
        
        // Variablen
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
        const fixedMarkerPin = document.getElementById('fixedMarkerPin');
        const addHereBtn = document.getElementById('addHereBtn');
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
        addHereBtn.addEventListener('click', addLocationHere);
        
        // Map-Events
        map.on('mousemove', handleMapMouseMove);
        map.on('move', updateFixedMarkerPosition);
        
        // Sitzung alle 5 Minuten überprüfen
        setInterval(checkSession, 5 * 60 * 1000);
        
        // Löse ein Resize-Event aus, damit Leaflet die Karte korrekt rendert
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 500);
        
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
            fixedMarkerPin.style.display = 'block';
            addHereBtn.style.display = 'block';
            map.on('click', handleMapClick);
          } else {
            fixedMarkerPin.style.display = 'none';
            addHereBtn.style.display = 'none';
            map.off('click', handleMapClick);
            hideMarkerPin();
          }
        }
        
        function updateFixedMarkerPosition() {
          // Wird aufgerufen, wenn die Karte bewegt wird
          if (editMode) {
            const center = map.getSize().divideBy(2);
            fixedMarkerPin.style.left = center.x + 'px';
            fixedMarkerPin.style.top = center.y + 'px';
          }
        }
        
        function handleMapMouseMove(e) {
          if (!editMode) return;
          
          const { lat, lng } = e.latlng;
          
          // Position des beweglichen Markers aktualisieren
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
        
        function addLocationHere() {
          const center = map.getCenter();
          const lat = center.lat;
          const lng = center.lng;
          
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
        
        function validateImageFile(file) {
          // Maximale Dateigröße prüfen (15 MB)
          const maxSizeBytes = ${MAX_FILE_SIZE}; // 15 MB
          if (file.size > maxSizeBytes) {
            return {
              valid: false,
              message: \`Das Bild ist zu groß: \${(file.size / (1024 * 1024)).toFixed(2)} MB. Maximal erlaubt sind ${MAX_FILE_SIZE / (1024 * 1024)} MB.\`
            };
          }
          
          return { valid: true };
        }
        
        function handleFormSubmit(e) {
          e.preventDefault();
          debug('Formular wird abgesendet');
          
          const title = locationTitle.value;
          const lat = locationLat.value;
          const lng = locationLng.value;
          const desc = locationDesc.value || '';
          const file = locationImage.files[0];
          
          if (!title || !lat || !lng || !file) {
            showError('Bitte fülle alle Pflichtfelder aus.');
            return;
          }
          
          // Bildvalidierung
          const validation = validateImageFile(file);
          if (!validation.valid) {
            showError(validation.message);
            return;
          }
          
          debug('Alle Eingaben validiert, bereite FormData vor', {
            title, lat, lng, fileName: file.name, fileSize: file.size
          });
          
          // Button-Zustand ändern während des Uploads
          const submitButton = e.target.querySelector('button[type="submit"]');
          const originalText = submitButton.textContent;
          submitButton.textContent = 'Speichern...';
          submitButton.disabled = true;
          
          showLoading('Bild wird hochgeladen...');
          
          const formData = new FormData();
          formData.append('title', title);
          formData.append('latitude', lat);
          formData.append('longitude', lng);
          formData.append('description', desc);
          formData.append('image', file);
          
          debug('Sende Daten an /api/locations');
          
          fetch('/api/locations', {
            method: 'POST',
            body: formData
          })
          .then(response => {
            debug('Antwort erhalten, Status:', response.status);
            
            if (!response.ok) {
              return response.text().then(text => {
                try {
                  const jsonError = JSON.parse(text);
                  throw new Error(jsonError.error || 'Unbekannter Fehler');
                } catch (e) {
                  if (e instanceof SyntaxError) {
                    debug('Fehler beim Parsen der Antwort:', text);
                    // Wenn die Antwort HTML ist und wir nicht authentifiziert sind
                    if (text.includes('<title>Susibert</title>') || text.includes('login')) {
                      throw new Error('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');
                    } else {
                      throw new Error('Unerwartete Antwort vom Server');
                    }
                  } else {
                    throw e;
                  }
                }
              });
            }
            
            return response.json();
          })
          .then(data => {
            // Button zurücksetzen
            submitButton.textContent = originalText;
            submitButton.disabled = false;
            hideLoading();
            
            debug('Erfolgreiche Antwort:', data);
            
            if (data.error) {
              showError('Fehler: ' + data.error);
              return;
            }
            
            hideAddLocationForm();
            loadLocations();
            
            // Bearbeitungsmodus beenden
            if (editMode) {
              toggleEditMode();
            }
          })
          .catch(error => {
            // Button zurücksetzen
            submitButton.textContent = originalText;
            submitButton.disabled = false;
            hideLoading();
            
            debug('Fehler bei fetch:', error);
            
            // Wenn die Sitzung abgelaufen ist
            if (error.message.includes('Sitzung') || error.message.includes('anmelden')) {
              showError('Deine Sitzung ist abgelaufen. Du wirst zur Login-Seite weitergeleitet...');
              
              // Nach 2 Sekunden zur Login-Seite weiterleiten
              setTimeout(() => {
                window.location.href = '/';
              }, 2000);
            } else {
              showError('Fehler beim Speichern: ' + error.message);
            }
          });
        }
        
        function loadLocations() {
          debug('Lade Orte...');
          locationsContainer.innerHTML = '<div style="text-align: center; color: #999;">Lade Orte...</div>';
          
          fetch('/api/locations')
            .then(response => {
              if (!response.ok) {
                if (response.status === 401) {
                  window.location.href = '/';
                  throw new Error('Nicht authentifiziert');
                }
                throw new Error('Fehler beim Laden der Orte');
              }
              return response.json();
            })
            .then(data => {
              debug('Orte geladen:', data.length);
              locations = data;
              
              if (locations.length === 0) {
                locationsContainer.innerHTML = '<div style="text-align: center; color: #999;">Keine Orte vorhanden.<br>Klicke auf "Ort hinzufügen", um zu beginnen.</div>';
                return;
              }
              
              renderLocations();
              renderMapMarkers();
            })
            .catch(error => {
              debug('Fehler beim Laden der Orte:', error);
              
              if (error.message !== 'Nicht authentifiziert') {
                locationsContainer.innerHTML = '<div style="text-align: center; color: #999;">Fehler beim Laden der Orte.</div>';
              }
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
          
          // Bild anzeigen
          detailImage.src = '/api/locations/' + location.id + '/image?t=' + new Date().getTime();
          detailImage.onerror = () => {
            detailImage.src = '/uploads/couple.jpg';
            detailImage.onerror = () => {
              detailImage.src = '/uploads/couple.png';
            };
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
            fetch('/api/locations/' + activeLocationId, {
              method: 'DELETE'
            })
            .then(response => {
              if (!response.ok) {
                if (response.status === 401) {
                  window.location.href = '/';
                  throw new Error('Nicht authentifiziert');
                }
                return response.json().then(err => {
                  throw new Error(err.error || 'Unbekannter Fehler');
                });
              }
              return response.json();
            })
            .then(data => {
              if (data.error) {
                showError('Fehler: ' + data.error);
                return;
              }
              
              hideLocationDetail();
              loadLocations();
            })
            .catch(error => {
              debug('Fehler beim Löschen:', error);
              
              if (error.message !== 'Nicht authentifiziert') {
                showError('Fehler beim Löschen des Ortes: ' + error.message);
              }
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
        updateFixedMarkerPosition();
      </script>
    </body>
    </html>
  `);
});

// Admin-Bereich
app.get('/admin', requireAuth, async (req, res) => {
  console.log('Admin-Bereich angefordert');
  
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
    console.log('Tabellen-Check:', tableExists ? 'Tabelle existiert' : 'Tabelle existiert nicht');
    
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
            margin-bottom: 10px;
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
            <p>Max. Bildgröße: <strong>${MAX_FILE_SIZE / (1024 * 1024)} MB</strong></p>
            <p>Session-Timeout: <strong>${SESSION_TIMEOUT / (60 * 1000)} Minuten</strong></p>
            
            <div class="success">
              <p><strong>Datenbank-Management</strong></p>
              <p>Verwende die unten stehenden Links, um die Datenbank zu verwalten:</p>
            </div>
            
            <a href="/test-insert" class="button blue">Einfügung testen</a>
            <a href="/test-minimal-insert" class="button blue">Minimale Einfügung testen</a>
            <a href="/test-limit" class="button blue">Grenzwerte testen</a>
            <a href="/fix-database" class="button blue">Datenbank reparieren</a>
            <a href="/reset-database" class="button red">Datenbank zurücksetzen</a>
          </div>
          
          <a href="/map" class="back-link">← Zurück zur Karte</a>
        </div>
      </body>
      </html>
    `;
    
    client.release();
    res.send(html);
  } catch (error) {
    console.error('Fehler beim Laden des Admin-Bereichs:', error.message);
    res.status(500).send(`
      <h1>Fehler</h1>
      <p>${error.message}</p>
      <a href="/map">Zurück zur Karte</a>
    `);
  }
});

// Test-Insert Route
app.get('/test-insert', requireAuth, async (req, res) => {
  console.log('Test-Insert angefordert');
  
  try {
    const client = await pool.connect();
    
    try {
      // Testdaten
      const title = 'Testeintrag';
      const latitude = '48.1351';
      const longitude = '11.5820';
      const description = 'Dies ist ein Testeintrag';
      
      // Ein kleines Testbild (1x1 Pixel transparent GIF)
      const imageData = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      const imageType = 'image/gif';
      
      // Transaktion starten
      await client.query('BEGIN');
      
      // Insert ausführen
      const queryText = 'INSERT INTO locations (title, latitude, longitude, description, image_data, image_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id';
      const queryParams = [title, latitude, longitude, description, imageData, imageType];
      
      console.log('Führe Test-Query aus...');
      const result = await client.query(queryText, queryParams);
      console.log('Query erfolgreich mit ID:', result.rows[0].id);
      
      // Daten wieder löschen
      await client.query('DELETE FROM locations WHERE id = $1', [result.rows[0].id]);
      console.log('Testdaten gelöscht');
      
      // Transaktion abschließen
      await client.query('COMMIT');
      
      client.release();
      
      res.send(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
          <meta charset="UTF-8">
          <title>Einfügungstest</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              background-color: #1a1a1a;
              color: white;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            .success {
              background-color: rgba(76, 175, 80, 0.2);
              border: 1px solid #4caf50;
              padding: 15px;
              border-radius: 4px;
              margin: 20px 0;
            }
            h1, h2 {
              color: #f59a0c;
            }
            pre {
              background-color: #333;
              padding: 15px;
              border-radius: 4px;
              overflow-x: auto;
              color: #eee;
            }
            a {
              color: #f59a0c;
              text-decoration: none;
            }
            a:hover {
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <h1>Einfügungstest</h1>
          
          <div class="success">
            <h2>Test erfolgreich!</h2>
            <p>Die Einfügung in die Datenbank funktioniert.</p>
          </div>
          
          <h3>Details:</h3>
          <pre>
Einfügung mit ID: ${result.rows[0].id}
Titel: ${title}
Koordinaten: ${latitude}, ${longitude}
Beschreibung: ${description}
Bild: 1x1 Pixel GIF (${imageData.length} Bytes)
          </pre>
          
          <p><a href="/admin">← Zurück zum Admin-Bereich</a></p>
        </body>
        </html>
      `);
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      
      console.error('Fehler beim Test-Insert:', error.message);
      throw error;
    }
  } catch (error) {
    console.error('Fehler beim Testen der Einfügung:', error.message);
    res.status(500).send(`
      <h1>Fehler beim Testen der Einfügung</h1>
      <p>${error.message}</p>
      <a href="/admin">Zurück zum Admin-Bereich</a>
    `);
  }
});

// Session-Check 
app.get('/api/check-session', requireApiAuth, (req, res) => {
  res.json({ valid: true });
});

// Grenzwerte testen
app.get('/test-limit', requireAuth, (req, res) => {
  const limits = {
    multerFileSize: MAX_FILE_SIZE,
    multerFileSizeMB: MAX_FILE_SIZE / (1024 * 1024),
    sessionTimeout: SESSION_TIMEOUT,
    sessionTimeoutMinutes: SESSION_TIMEOUT / (60 * 1000),
    expressJsonLimit: '100kb', // Standard
    cookieSize: 4096 // Standard für Cookies
  };
  
  res.send(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <title>Grenzwerte</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          background-color: #1a1a1a;
          color: white;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        .info {
          background-color: rgba(33, 150, 243, 0.2);
          border: 1px solid #2196f3;
          padding: 15px;
          border-radius: 4px;
          margin: 20px 0;
        }
        h1, h2 {
          color: #f59a0c;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        th, td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #444;
        }
        th {
          background-color: #333;
          color: #f59a0c;
        }
        tr:nth-child(even) {
          background-color: #2a2a2a;
        }
        a {
          color: #f59a0c;
          text-decoration: none;
          display: inline-block;
          margin-top: 20px;
        }
        a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <h1>Grenzwerte des Systems</h1>
      
      <div class="info">
        <h2>Konfigurierte Limits</h2>
        <p>Hier sind die aktuellen Grenzwerte der Anwendung:</p>
      </div>
      
      <table>
        <tr>
          <th>Einstellung</th>
          <th>Wert</th>
        </tr>
        <tr>
          <td>Max. Bildgröße (Multer)</td>
          <td>${limits.multerFileSizeMB.toFixed(2)} MB (${limits.multerFileSize.toLocaleString()} Bytes)</td>
        </tr>
        <tr>
          <td>Session-Timeout</td>
          <td>${limits.sessionTimeoutMinutes} Minuten (${(limits.sessionTimeout / 1000).toLocaleString()} Sekunden)</td>
        </tr>
        <tr>
          <td>Express JSON Body Limit</td>
          <td>${limits.expressJsonLimit}</td>
        </tr>
        <tr>
          <td>Max. Cookie-Größe</td>
          <td>${limits.cookieSize} Bytes</td>
        </tr>
      </table>
      
      <h2>Bildupload-Hinweise</h2>
      <p>
        Wenn du Probleme beim Hochladen von Bildern hast, überprüfe folgende Punkte:
      </p>
      <ul>
        <li>Die Bildgröße darf ${limits.multerFileSizeMB.toFixed(2)} MB nicht überschreiten</li>
        <li>Unterstützte Formate sind JPG, PNG und HEIC</li>
        <li>Die Sitzung darf nicht abgelaufen sein (max. ${limits.sessionTimeoutMinutes} Minuten)</li>
        <li>Bei der Verwendung von HEIC-Bildern (iPhone) können zusätzliche Konvertierungsprobleme auftreten</li>
      </ul>
      
      <a href="/admin">← Zurück zum Admin-Bereich</a>
    </body>
    </html>
  `);
});

// Minimaler Test-Insert Route
app.get('/test-minimal-insert', requireAuth, async (req, res) => {
  console.log('Minimaler Test-Insert angefordert');
  
  try {
    const client = await pool.connect();
    
    try {
      // Testdaten
      const title = 'Minimaler Testeintrag';
      const latitude = '48.1351';
      const longitude = '11.5820';
      
      // Transaktion starten
      await client.query('BEGIN');
      
      // Insert ausführen (ohne Bilddaten)
      const queryText = 'INSERT INTO locations (title, latitude, longitude) VALUES ($1, $2, $3) RETURNING id';
      const queryParams = [title, latitude, longitude];
      
      console.log('Führe minimale Test-Query aus...');
      const result = await client.query(queryText, queryParams);
      console.log('Minimale Query erfolgreich mit ID:', result.rows[0].id);
      
      // Daten wieder löschen
      await client.query('DELETE FROM locations WHERE id = $1', [result.rows[0].id]);
      console.log('Minimale Testdaten gelöscht');
      
      // Transaktion abschließen
      await client.query('COMMIT');
      
      client.release();
      
      res.send(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
          <meta charset="UTF-8">
          <title>Minimaler Einfügungstest</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              background-color: #1a1a1a;
              color: white;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            .success {
              background-color: rgba(76, 175, 80, 0.2);
              border: 1px solid #4caf50;
              padding: 15px;
              border-radius: 4px;
              margin: 20px 0;
            }
            h1, h2 {
              color: #f59a0c;
            }
            pre {
              background-color: #333;
              padding: 15px;
              border-radius: 4px;
              overflow-x: auto;
              color: #eee;
            }
            a {
              color: #f59a0c;
              text-decoration: none;
            }
            a:hover {
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <h1>Minimaler Einfügungstest</h1>
          
          <div class="success">
            <h2>Test erfolgreich!</h2>
            <p>Die minimale Einfügung ohne Bilddaten funktioniert.</p>
          </div>
          
          <h3>Details:</h3>
          <pre>
Einfügung mit ID: ${result.rows[0].id}
Titel: ${title}
Koordinaten: ${latitude}, ${longitude}
          </pre>
          
          <p><a href="/admin">← Zurück zum Admin-Bereich</a></p>
        </body>
        </html>
      `);
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      
      console.error('Fehler beim minimalen Test-Insert:', error.message);
      throw error;
    }
  } catch (error) {
    console.error('Fehler beim Testen der minimalen Einfügung:', error.message);
    res.status(500).send(`
      <h1>Fehler beim Testen der minimalen Einfügung</h1>
      <p>${error.message}</p>
      <a href="/admin">Zurück zum Admin-Bereich</a>
    `);
  }
});

// Datenbank-Fix Route
app.get('/fix-database', requireAuth, async (req, res) => {
  console.log('Datenbank-Fix angefordert');
  
  try {
    const client = await pool.connect();
    
    // Alle problematischen Spalten nullable machen
    const spalten = ['date', 'description', 'highlight', 'country_code', 'image', 'image_data', 'image_type', 'thumbnail_data'];
    
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
          
          <a href="/map" class="button">Zurück zur Karte</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Fehler beim Reparieren der Datenbank:', error.message);
    res.status(500).send(`
      <h1>Fehler beim Reparieren der Datenbank</h1>
      <p>${error.message}</p>
      <a href="/admin">Zurück zum Admin-Bereich</a>
    `);
  }
});

// Datenbank zurücksetzen Route
app.get('/reset-database', requireAuth, async (req, res) => {
  console.log('Datenbank-Reset angefordert');
  
  try {
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
          
          <a href="/map" class="button">Zurück zur Karte</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Fehler beim Zurücksetzen der Datenbank:', error.message);
    res.status(500).send(`
      <h1>Fehler beim Zurücksetzen der Datenbank</h1>
      <p>${error.message}</p>
      <a href="/admin">Zurück zum Admin-Bereich</a>
    `);
  }
});

// Logout
app.get('/logout', (req, res) => {
  console.log('Logout angefordert');
  
  // SessionId aus Cookies holen
  const sessionId = req.cookies.sessionId;
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
    console.log('Session gelöscht:', sessionId);
  }
  
  // Cookie löschen
  res.clearCookie('sessionId');
  
  res.redirect('/');
});

// Storage für das hochgeladene Bild konfigurieren
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    // Detailliertere Fehlerbehandlung im Filter
    if (file.size > MAX_FILE_SIZE) {
      return cb(new Error(`Datei zu groß (${(file.size / (1024 * 1024)).toFixed(2)} MB). Maximal ${MAX_FILE_SIZE / (1024 * 1024)} MB erlaubt.`));
    }
    
    // Überprüfen Sie die Dateiendung und den MIME-Typ
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];
    
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (!allowedMimeTypes.includes(file.mimetype) && !allowedExtensions.includes(fileExt)) {
      return cb(new Error(`Ungültiger Dateityp: ${file.mimetype}. Erlaubt sind nur JPG, PNG und HEIC.`));
    }
    
    return cb(null, true);
  }
});

// Fehlerbehandlung für Multer-Fehler
const handleMulterErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Ein Multer-Fehler ist aufgetreten
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: `Datei zu groß. Maximal ${MAX_FILE_SIZE / (1024 * 1024)} MB erlaubt.` 
      });
    }
    
    // Andere Multer-Fehler
    return res.status(400).json({ 
      error: `Upload-Fehler: ${err.message}` 
    });
  }
  
  // Andere Fehler behandeln
  next(err);
};

// Bild eines Ortes abrufen
app.get('/api/locations/:id/image', requireApiAuth, async (req, res) => {
  try {
    const id = req.params.id;
    
    const result = await pool.query(
      'SELECT image_data, image_type FROM locations WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0 || !result.rows[0].image_data) {
      return res.status(404).json({ error: 'Bild nicht gefunden' });
    }
    
    const { image_data, image_type } = result.rows[0];
    
    res.setHeader('Content-Type', image_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(image_data);
  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error.message);
    res.status(500).json({ error: 'Fehler beim Abrufen des Bildes: ' + error.message });
  }
});

// Alle Orte abrufen
app.get('/api/locations', requireApiAuth, async (req, res) => {
  console.log('Rufe alle Orte ab');
  
  try {
    const client = await pool.connect();
    
    try {
      // Versuche die Orte abzurufen
      const result = await client.query('SELECT id, title, latitude, longitude, description FROM locations ORDER BY id DESC');
      console.log(`${result.rows.length} Orte abgerufen`);
      
      res.json(result.rows);
    } catch (error) {
      console.error('Fehler beim Abrufen der Orte:', error.message);
      res.status(500).json({ error: 'Fehler beim Abrufen der Orte: ' + error.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Fehler beim Abrufen der Orte (Verbindung):', error.message);
    res.status(500).json({ error: 'Datenbankfehler: ' + error.message });
  }
});

// Neuen Ort hinzufügen mit besserer Fehlerbehandlung
app.post('/api/locations', requireApiAuth, upload.single('image'), handleMulterErrors, async (req, res) => {
  console.log('POST /api/locations aufgerufen');
  let client = null;
  
  try {
    if (!req.file) {
      console.error('Kein Bild im Request');
      return res.status(400).json({ error: 'Bild ist erforderlich' });
    }
    
    console.log('Bild hochgeladen:', req.file.originalname, req.file.size, 'Bytes', req.file.mimetype);
    
    // Parameter aus dem Request
    const { title, latitude, longitude, description } = req.body;
    
    // Prüfe, ob alle erforderlichen Felder vorhanden sind
    if (!title || !latitude || !longitude) {
      console.error('Fehlende Pflichtfelder in Request');
      return res.status(400).json({ error: 'Titel und Koordinaten sind erforderlich' });
    }
    
    console.log('Verarbeite Request-Parameter:', { title, lat: latitude, lng: longitude });
    
    try {
      console.log('Erstelle Verbindung zur Datenbank...');
      client = await pool.connect();
      console.log('Verbindung hergestellt');
      
      // Transaktion starten
      await client.query('BEGIN');
      console.log('Transaktion gestartet');
      
      try {
        console.log('Füge Daten ein...');
        const insertQuery = 'INSERT INTO locations (title, latitude, longitude, description, image_data, image_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id';
        const insertParams = [title, latitude, longitude, description || '', req.file.buffer, req.file.mimetype];
        
        const result = await client.query(insertQuery, insertParams);
        const insertedId = result.rows[0].id;
        console.log('Einfügung erfolgreich, ID:', insertedId);
        
        // Transaktion bestätigen
        await client.query('COMMIT');
        console.log('Transaktion erfolgreich abgeschlossen');
        
        // Erfolg melden
        res.status(201).json({ 
          success: true, 
          id: insertedId,
          message: 'Ort erfolgreich gespeichert'
        });
      } catch (error) {
        // Bei Fehler Transaktion rückgängig machen
        await client.query('ROLLBACK');
        console.error('Fehler bei der Datenbankoperation:', error.message);
        throw error;
      }
    } finally {
      if (client) {
        client.release();
        console.log('Verbindung freigegeben');
      }
    }
  } catch (error) {
    console.error('Allgemeiner Fehler:', error.message);
    
    // Detailliertere Fehlermeldung
    let errorMessage = 'Serverfehler';
    
    if (error.message.includes('too large')) {
      errorMessage = `Datei zu groß. Maximal ${MAX_FILE_SIZE / (1024 * 1024)} MB erlaubt.`;
    } else if (error.message.includes('database') || error.message.includes('sql')) {
      errorMessage = 'Datenbankfehler: ' + error.message;
    } else if (error.message.includes('constraint') || error.message.includes('violation')) {
      errorMessage = 'Datenvalidierungsfehler: ' + error.message;
    } else {
      errorMessage = 'Fehler: ' + error.message;
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// Ort löschen
app.delete('/api/locations/:id', requireApiAuth, async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`Lösche Ort mit ID: ${id}`);
    
    await pool.query('DELETE FROM locations WHERE id = $1', [id]);
    console.log('Ort erfolgreich gelöscht');
    
    res.json({ success: true });
  } catch (error) {
    console.error('Fehler beim Löschen des Ortes:', error.message);
    res.status(500).json({ error: 'Fehler beim Löschen: ' + error.message });
  }
});

// Health-Check route
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Server starten
async function startServer() {
  try {
    // Datenbankverbindung testen
    const client = await pool.connect();
    console.log('Datenbankverbindung erfolgreich hergestellt');
    client.release();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server läuft auf Port ${PORT}`);
    });
  } catch (error) {
    console.error('Fehler bei der Datenbankverbindung:', error.message);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server läuft auf Port ${PORT} (ohne Datenbankverbindung)`);
    });
  }
}

process.on('exit', () => {
  console.log('Server wird beendet');
  if (pool) {
    pool.end();
  }
});

startServer();