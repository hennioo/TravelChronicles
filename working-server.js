// Einfacher funktionierender Server ohne Template-String-Probleme
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

// Express-App und Port
const app = express();
const port = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Konstanten
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB Limit für Bilder
const ACCESS_CODE = process.env.ACCESS_CODE || 'suuuu';

// Globale Variablen
let pool;
let dbConnected = false;
const sessions = {};

// Uploads-Verzeichnis
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Statische Dateien
app.use('/uploads', express.static(uploadsDir));

// Multer Storage für Uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function(req, file, cb) {
    const uniqueName = Date.now() + '-' + crypto.randomBytes(8).toString('hex') + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: MAX_FILE_SIZE }
});

// Datenbank-Verbindung
async function connectToDatabase() {
  try {
    console.log('Umgebungsvariablen (ohne Werte):', {
      DATABASE_URL_EXISTS: !!process.env.DATABASE_URL,
      NODE_ENV: process.env.NODE_ENV
    });
    
    let connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      console.error('Fehler: DATABASE_URL ist nicht konfiguriert');
      return false;
    }
    
    console.log('Verbindungsstring-Länge:', connectionString.length, 'Zeichen');
    
    pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false
      }
    });
    
    // Test-Abfrage
    const now = await pool.query('SELECT NOW()');
    console.log('Datenbankverbindung erfolgreich hergestellt:', { now: now.rows[0].now });
    
    // Prüfen, ob die Tabellen existieren, sonst erstellen
    const tablesExist = await checkTablesExist();
    console.log('Tabelle locations existiert:', tablesExist);
    
    if (!tablesExist) {
      await createTables();
    }
    
    return true;
  } catch (error) {
    console.error('Fehler bei der Datenbankverbindung:', error);
    return false;
  }
}

// Prüfen, ob die Tabellen existieren
async function checkTablesExist() {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
      );
    `);
    return result.rows[0].exists;
  } catch (error) {
    console.error('Fehler beim Prüfen der Tabellen:', error);
    return false;
  }
}

// Tabellen erstellen
async function createTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        image TEXT,
        image_type TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Tabellen erfolgreich erstellt');
    return true;
  } catch (error) {
    console.error('Fehler beim Erstellen der Tabellen:', error);
    return false;
  }
}

// Session erstellen
function createSession() {
  const sessionId = crypto.randomBytes(16).toString('hex');
  sessions[sessionId] = {
    authenticated: true,
    created: Date.now()
  };
  console.log('Neue Session erstellt:', sessionId);
  return sessionId;
}

// Prüfen, ob eine Session gültig ist
function isValidSession(sessionId) {
  console.log('Prüfe Session:', sessionId, 'Existiert:', !!sessions[sessionId]);
  
  if (!sessionId || !sessions[sessionId]) {
    return false;
  }
  
  const sessionTimeout = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const sessionAge = now - sessions[sessionId].created;
  
  if (sessionAge > sessionTimeout) {
    delete sessions[sessionId];
    return false;
  }
  
  return sessions[sessionId].authenticated;
}

// Auth-Middleware (verbessert)
function requireAuth(req, res, next) {
  const sessionId = req.query.sessionId || (req.body && req.body.sessionId);
  
  console.log('Auth-Check mit SessionID:', sessionId);
  
  if (isValidSession(sessionId)) {
    if (sessions[sessionId]) {
      sessions[sessionId].created = Date.now();
      console.log('Session verlängert:', sessionId);
    }
    return next();
  }
  
  console.log('Ungültige Session:', sessionId);
  
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ 
      error: 'Nicht authentifiziert',
      message: 'Bitte melde dich an, um diese Funktion zu nutzen.'
    });
  }
  
  res.redirect('/?error=' + encodeURIComponent('Bitte melde dich an, um diese Seite zu sehen.'));
}

// Lösch-Funktion für Orte
async function deleteLocation(id, res, redirectUrl = null) {
  try {
    const deleteResult = await pool.query('DELETE FROM locations WHERE id = $1 RETURNING id, image', [id]);
    
    if (deleteResult.rows.length > 0) {
      const { id, image } = deleteResult.rows[0];
      console.log(`Ort mit ID ${id} gelöscht`);
      
      if (image && image.startsWith('/')) {
        try {
          fs.unlinkSync(image);
          console.log(`Bild ${image} gelöscht`);
        } catch (err) {
          console.warn(`Konnte Bild nicht löschen: ${err.message}`);
        }
      }
      
      if (redirectUrl) {
        return res.redirect(redirectUrl);
      }
      
      res.json({ success: true });
    } else {
      if (redirectUrl) {
        return res.redirect(redirectUrl + '?error=Ort nicht gefunden');
      }
      
      res.status(404).json({ error: 'Ort nicht gefunden' });
    }
  } catch (error) {
    console.error('Fehler beim Löschen des Ortes:', error);
    
    if (redirectUrl) {
      return res.redirect(redirectUrl + '?error=' + encodeURIComponent('Fehler beim Löschen: ' + error.message));
    }
    
    res.status(500).json({ error: error.message });
  }
}

// Verbindung zur Datenbank herstellen
connectToDatabase().then(connected => {
  dbConnected = connected;
  console.log('Datenbankverbindung Status:', dbConnected);
}).catch(error => {
  console.error('Fehler beim Verbinden zur Datenbank:', error);
});

// ROUTES

// Startseite / Login
app.get('/', function(req, res) {
  const error = req.query.error || '';
  
  res.send(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Susibert</title>
      <style>
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          background-color: #1a1a1a;
          color: white;
          margin: 0;
          padding: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
        }
        
        .container {
          width: 90%;
          max-width: 400px;
          background-color: #000;
          border-radius: 12px;
          padding: 30px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
          text-align: center;
        }
        
        .logo {
          margin-bottom: 20px;
          position: relative;
          width: 150px;
          height: 150px;
          border-radius: 50%;
          overflow: hidden;
          margin: 0 auto 30px;
          border: 3px solid #f59a0c;
        }
        
        .logo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        h1 {
          color: #f59a0c;
          margin-bottom: 30px;
          font-size: 2.5rem;
          font-weight: bold;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        label {
          display: block;
          text-align: left;
          margin-bottom: 8px;
          color: #ccc;
        }
        
        input {
          width: 100%;
          padding: 12px;
          border-radius: 6px;
          border: 1px solid #333;
          background-color: #222;
          color: white;
          font-size: 1rem;
          box-sizing: border-box;
        }
        
        button {
          width: 100%;
          padding: 12px;
          background-color: #f59a0c;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1.1rem;
          font-weight: bold;
          margin-top: 10px;
          transition: background-color 0.3s;
        }
        
        button:hover {
          background-color: #e58e0b;
        }
        
        .error {
          color: #ff5555;
          margin-top: 20px;
          font-size: 0.9rem;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <img src="/uploads/couple.jpg" alt="Pärchenbild" onerror="this.src='/uploads/couple.png'; this.onerror=null;">
        </div>
        <h1>Susibert</h1>
        <form action="/login" method="post">
          <div class="form-group">
            <label for="accessCode">Zugangs-Code</label>
            <input type="password" id="accessCode" name="accessCode" placeholder="Code eingeben" required autofocus>
          </div>
          <button type="submit">Anmelden</button>
          ${error ? `<div class="error">${error}</div>` : ''}
        </form>
      </div>
    </body>
    </html>
  `);
});

// Login-Verarbeitung
app.post('/login', function(req, res) {
  const { accessCode } = req.body;
  
  console.log('Login-Versuch mit Code:', accessCode ? '******' : 'leer');
  
  if (accessCode === ACCESS_CODE) {
    const sessionId = createSession();
    res.redirect('/map?sessionId=' + sessionId);
  } else {
    res.redirect('/?error=' + encodeURIComponent('Falscher Zugangs-Code. Bitte versuche es erneut.'));
  }
});

// Logout
app.get('/logout', function(req, res) {
  const sessionId = req.query.sessionId;
  
  if (sessionId && sessions[sessionId]) {
    console.log('Logout für Session:', sessionId);
    delete sessions[sessionId];
  }
  
  res.redirect('/');
});

// Geschützte Kartenansicht
app.get('/map', requireAuth, function(req, res) {
  if (!dbConnected) {
    return res.send(`
      <h1>Datenbankverbindung nicht verfügbar</h1>
      <a href="/">Zurück zur Anmeldung</a>
    `);
  }

  const sessionId = req.query.sessionId;
  
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
      <a href="/admin?sessionId=${sessionId}" class="admin">Admin</a>
      <a href="/logout?sessionId=${sessionId}" class="logout">Abmelden</a>
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
              <strong>Wichtig:</strong> Der Upload kann einen Moment dauern.
            </small>
          </div>
          
          <div class="form-actions">
            <button type="button" class="form-button secondary" id="cancelBtn">Abbrechen</button>
            <button type="submit" class="form-button primary">Speichern</button>
          </div>
        </form>
      </div>
      
      <div class="location-detail" id="locationDetail" style="z-index: 9999;">
        <div class="detail-header">
          <h3 class="detail-title" id="detailTitle"></h3>
          <button class="detail-close" id="detailClose" onclick="hideLocationDetail()">&times;</button>
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
    // Debugging-Funktionen
    function debug(message, data) {
      const timestamp = new Date().toISOString();
      
      if (data) {
        console.log("[DEBUG " + timestamp + "] " + message, data);
      } else {
        console.log("[DEBUG " + timestamp + "] " + message);
      }
    }
    
    function showError(message, duration) {
      duration = duration || 5000;
      
      const errorMsg = document.getElementById('errorMsg');
      errorMsg.textContent = message;
      errorMsg.style.display = 'block';
      
      debug('FEHLER ANGEZEIGT: ' + message);
      
      setTimeout(function() {
        errorMsg.style.display = 'none';
      }, duration);
    }
    
    function showLoading(text) {
      text = text || "Wird hochgeladen...";
      
      const loadingText = document.getElementById('loadingText');
      loadingText.textContent = text;
      
      document.getElementById('loadingIndicator').style.display = 'block';
    }
    
    function hideLoading() {
      document.getElementById('loadingIndicator').style.display = 'none';
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
    
    // Session-ID aus URL lesen
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');
    
    if (!sessionId) {
      showError('Keine Session-ID in der URL gefunden');
    } else {
      debug('Session-ID gefunden: ' + sessionId);
    }
    
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
    detailClose.addEventListener('click', hideLocationDetail);
    detailDelete.addEventListener('click', deleteLocation);
    addHereBtn.addEventListener('click', addLocationHere);
    
    // Upload-Handler für das Formular
    locationForm.addEventListener('submit', function(e) {
      e.preventDefault();
      debug('Formular wird abgesendet');
      
      const title = locationTitle.value;
      const lat = locationLat.value;
      const lng = locationLng.value;
      const desc = locationDesc.value || '';
      
      if (!title || !lat || !lng || !locationImage.files.length) {
        showError('Bitte fülle alle Pflichtfelder aus.');
        return;
      }
      
      const file = locationImage.files[0];
      
      // FormData erstellen
      const formData = new FormData();
      formData.append('title', title);
      formData.append('latitude', lat);
      formData.append('longitude', lng);
      formData.append('description', desc);
      formData.append('image', file);
      formData.append('sessionId', sessionId);
      
      debug('Sende Daten an /api/locations');
      showLoading();
      
      // Anfrage senden
      fetch('/api/locations?sessionId=' + sessionId, {
        method: 'POST',
        body: formData
      })
      .then(function(response) {
        debug('Antwort erhalten, Status: ' + response.status);
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.indexOf('application/json') !== -1) {
          return response.json();
        } else {
          return response.text().then(function(text) {
            debug('Fehler beim Parsen der Antwort: ' + text.substring(0, 200));
            
            if (text.includes('<title>Susibert</title>') || text.includes('loginForm')) {
              window.location.href = '/';
              throw new Error('Nicht eingeloggt');
            }
            
            throw new Error('Unerwartete Antwort vom Server');
          });
        }
      })
      .then(function(data) {
        hideLoading();
        debug('Erfolgreiche Antwort:', data);
        
        if (data.error) {
          showError('Fehler: ' + data.error);
          return;
        }
        
        // Erfolgsmeldung
        alert('Ort wurde erfolgreich gespeichert!');
        
        // Formular zurücksetzen und schließen
        locationForm.reset();
        addLocationForm.style.display = 'none';
        
        // Orte neu laden
        loadLocations();
        
        // Bearbeitungsmodus beenden, falls aktiv
        if (editMode) {
          toggleEditMode();
        }
      })
      .catch(function(error) {
        hideLoading();
        debug('Fehler beim Absenden:', error);
        
        if (error.message !== 'Nicht eingeloggt') {
          showError('Fehler beim Speichern: ' + error.message);
        }
      });
    });
    
    // Karten-Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
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
        map.on('mousemove', handleMapMouseMove);
      } else {
        fixedMarkerPin.style.display = 'none';
        addHereBtn.style.display = 'none';
        map.off('click', handleMapClick);
        map.off('mousemove', handleMapMouseMove);
        hideMarkerPin();
      }
    }
    
    function updateFixedMarkerPosition() {
      if (editMode) {
        const center = map.getSize().divideBy(2);
        fixedMarkerPin.style.left = center.x + 'px';
        fixedMarkerPin.style.top = center.y + 'px';
      }
    }
    
    function handleMapMouseMove(e) {
      if (!editMode) return;
      
      markerPin.style.display = 'block';
      markerPin.style.left = e.containerPoint.x + 'px';
      markerPin.style.top = e.containerPoint.y + 'px';
    }
    
    function hideMarkerPin() {
      markerPin.style.display = 'none';
    }
    
    function handleMapClick(e) {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      
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
    
    function loadLocations() {
      debug('Lade Orte...');
      locationsContainer.innerHTML = '<div style="text-align: center; color: #999;">Lade Orte...</div>';
      
      fetch('/api/locations?sessionId=' + sessionId)
        .then(function(response) {
          if (!response.ok) {
            if (response.status === 401) {
              window.location.href = '/';
              throw new Error('Nicht authentifiziert');
            }
            throw new Error('Fehler beim Laden der Orte');
          }
          return response.json();
        })
        .then(function(data) {
          debug('Orte geladen: ' + data.length);
          locations = data;
          
          if (locations.length === 0) {
            locationsContainer.innerHTML = '<div style="text-align: center; color: #999;">Keine Orte vorhanden.<br>Klicke auf "Ort hinzufügen", um zu beginnen.</div>';
            return;
          }
          
          renderLocations();
          renderMapMarkers();
        })
        .catch(function(error) {
          debug('Fehler beim Laden der Orte: ' + error);
          
          if (error.message !== 'Nicht authentifiziert') {
            locationsContainer.innerHTML = '<div style="text-align: center; color: #999;">Fehler beim Laden der Orte.</div>';
          }
        });
    }
    
    function renderLocations() {
      locationsContainer.innerHTML = '';
      
      locations.forEach(function(location) {
        const item = document.createElement('div');
        item.className = 'location-item';
        item.dataset.id = location.id;
        item.innerHTML = '<div class="location-title">' + (location.title || 'Unbenannter Ort') + '</div>';
        
        item.addEventListener('click', function() {
          showLocationDetail(location);
          sidebar.classList.remove('open');
        });
        
        locationsContainer.appendChild(item);
      });
    }
    
    function renderMapMarkers() {
      // Marker entfernen
      Object.values(markers).forEach(function(marker) {
        map.removeLayer(marker.marker);
        if (marker.circle) {
          map.removeLayer(marker.circle);
        }
      });
      markers = {};
      
      // Neue Marker hinzufügen
      locations.forEach(function(location) {
        const marker = L.marker([location.latitude, location.longitude]).addTo(map);
        
        marker.on('click', function() {
          showLocationDetail(location);
        });
        
        // Kreis um den Ort
        const circle = L.circle([location.latitude, location.longitude], {
          color: '#f59a0c',
          fillColor: '#f59a0c',
          fillOpacity: 0.2,
          radius: 50000 // 50km
        }).addTo(map);
        
        markers[location.id] = { marker, circle };
      });
    }
    
    // Detailansicht zeigen
    function showLocationDetail(location) {
      debug('Detailansicht für Ort: ' + (location.id || 'unbekannt'));
      
      // Mit ID suchen, falls ID übergeben wurde
      if (typeof location === 'number') {
        location = locations.find(function(loc) { 
          return loc.id === location; 
        });
        
        if (!location) {
          showError('Ort nicht gefunden');
          return;
        }
      }
      
      // Entferne vorhandene Detailansicht falls vorhanden
      var existingDetail = document.getElementById('locationDetailFixed');
      if (existingDetail) {
        existingDetail.remove();
      }
      
      // Erstelle neues Detailfenster
      var detailView = document.createElement('div');
      detailView.id = 'locationDetailFixed';
      detailView.style.position = 'fixed';
      detailView.style.top = '50%';
      detailView.style.left = '50%';
      detailView.style.transform = 'translate(-50%, -50%)';
      detailView.style.width = '90%';
      detailView.style.maxWidth = '450px';
      detailView.style.backgroundColor = '#222';
      detailView.style.color = 'white';
      detailView.style.padding = '20px';
      detailView.style.borderRadius = '8px';
      detailView.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';
      detailView.style.zIndex = '9999';
      detailView.style.display = 'flex';
      detailView.style.flexDirection = 'column';
      
      // Header mit Titel und Schließen-Button
      var header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.marginBottom = '15px';
      
      var title = document.createElement('h3');
      title.textContent = location.title || 'Unbenannter Ort';
      title.style.margin = '0';
      title.style.color = '#fff';
      title.style.fontSize = '18px';
      
      var closeButton = document.createElement('button');
      closeButton.innerHTML = '&times;';
      closeButton.style.background = 'none';
      closeButton.style.border = 'none';
      closeButton.style.color = 'white';
      closeButton.style.fontSize = '24px';
      closeButton.style.cursor = 'pointer';
      closeButton.style.padding = '0 5px';
      closeButton.onclick = function() {
        detailView.remove();
      };
      
      header.appendChild(title);
      header.appendChild(closeButton);
      
      // Bild
      var image = document.createElement('img');
      image.src = '/api/locations/' + location.id + '/image?sessionId=' + sessionId + '&t=' + new Date().getTime();
      image.alt = location.title || 'Ortsbild';
      image.style.width = '100%';
      image.style.maxHeight = '300px';
      image.style.objectFit = 'cover';
      image.style.borderRadius = '4px';
      image.style.marginBottom = '15px';
      image.onerror = function() {
        image.src = '/uploads/couple.jpg';
        console.error('Fehler beim Laden des Bildes');
      };
      
      // Beschreibung
      var description = document.createElement('div');
      description.textContent = location.description || 'Keine Beschreibung vorhanden.';
      description.style.marginBottom = '15px';
      description.style.lineHeight = '1.4';
      
      // Löschen-Button
      var deleteButton = document.createElement('button');
      deleteButton.textContent = 'Löschen';
      deleteButton.style.backgroundColor = '#e74c3c';
      deleteButton.style.color = 'white';
      deleteButton.style.border = 'none';
      deleteButton.style.padding = '8px 15px';
      deleteButton.style.borderRadius = '4px';
      deleteButton.style.cursor = 'pointer';
      deleteButton.style.alignSelf = 'flex-start';
      deleteButton.style.marginTop = '10px';
      deleteButton.onclick = function() {
        if (confirm('Ort wirklich löschen?')) {
          // API-Löschanfrage
          fetch('/api/locations/' + location.id + '?sessionId=' + sessionId, {
            method: 'DELETE'
          })
          .then(function(response) {
            if (!response.ok) {
              throw new Error('Fehler beim Löschen');
            }
            return response.json();
          })
          .then(function(data) {
            // Detailansicht schließen
            detailView.remove();
            // Marker entfernen
            if (markers[location.id]) {
              map.removeLayer(markers[location.id].marker);
              map.removeLayer(markers[location.id].circle);
              delete markers[location.id];
            }
            // Orte neu laden
            loadLocations();
            showSuccess('Ort erfolgreich gelöscht');
          })
          .catch(function(error) {
            console.error('Fehler:', error);
            showError('Fehler beim Löschen: ' + error.message);
          });
        }
      };
      
      // Alles zusammenfügen
      detailView.appendChild(header);
      detailView.appendChild(image);
      detailView.appendChild(description);
      detailView.appendChild(deleteButton);
      
      // Zum Body hinzufügen
      document.body.appendChild(detailView);
      
      // Karte nur zentrieren, ohne Zoom zu ändern
      map.panTo([location.latitude, location.longitude]);
      
      debug('Detailansicht sollte jetzt sichtbar sein');
    }
    
    // Detailansicht schließen
    function hideLocationDetail() {
      locationDetail.style.display = 'none';
      activeLocationId = null;
    }
    
    // Globale Funktion
    window.hideLocationDetail = hideLocationDetail;
    
    // Ort löschen
    function deleteLocation() {
      if (!activeLocationId) return;
      
      if (confirm('Möchtest du diesen Ort wirklich löschen?')) {
        fetch('/api/locations/' + activeLocationId + '?sessionId=' + sessionId, {
          method: 'DELETE'
        })
        .then(function(response) {
          if (!response.ok) {
            if (response.status === 401) {
              window.location.href = '/';
              throw new Error('Nicht authentifiziert');
            }
            return response.json().then(function(err) {
              throw new Error(err.error || 'Unbekannter Fehler');
            });
          }
          return response.json();
        })
        .then(function(data) {
          if (data.error) {
            showError('Fehler: ' + data.error);
            return;
          }
          
          hideLocationDetail();
          loadLocations();
        })
        .catch(function(error) {
          debug('Fehler beim Löschen: ' + error);
          
          if (error.message !== 'Nicht authentifiziert') {
            showError('Fehler beim Löschen des Ortes: ' + error.message);
          }
        });
      }
    }
    
    // Klick außerhalb schließt das Detail-Fenster
    document.addEventListener('click', function(e) {
      if (locationDetail.style.display === 'block') {
        // Prüfe, ob der Klick außerhalb war
        if (!locationDetail.contains(e.target) && e.target !== locationDetail) {
          hideLocationDetail();
        }
      }
    });
    
    // Map-Events
    map.on('move', updateFixedMarkerPosition);
    
    // Resize-Event auslösen
    setTimeout(function() {
      window.dispatchEvent(new Event('resize'));
    }, 500);
    
    // Seite initialisieren
    loadLocations();
    updateFixedMarkerPosition();
  </script>
</body>
</html>
  `);
});

// Admin-Bereich
app.get('/admin', requireAuth, function(req, res) {
  const sessionId = req.query.sessionId;
  res.send(`
    <h1>Admin-Bereich</h1>
    <p>Hier könnte der Admin-Bereich sein.</p>
    <a href="/map?sessionId=${sessionId}">Zurück zur Karte</a>
  `);
});

// API-Routen

// Alle Orte abrufen
app.get('/api/locations', requireAuth, async (req, res) => {
  try {
    console.log('Rufe alle Orte ab');
    
    const result = await pool.query('SELECT id, title, latitude, longitude, description FROM locations ORDER BY id DESC');
    console.log(`${result.rows.length} Orte abgerufen`);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Orte:', error);
    res.status(500).json({ error: error.message });
  }
});

// Neuen Ort hinzufügen
app.post('/api/locations', requireAuth, upload.single('image'), async (req, res) => {
  try {
    console.log('Neuer Ort wird hinzugefügt');
    
    // Prüfe, ob ein Bild hochgeladen wurde
    if (!req.file) {
      console.log('Kein Bild im Request');
      return res.status(400).json({ error: 'Bild ist erforderlich' });
    }
    
    console.log(`Bild hochgeladen: ${req.file.originalname}, ${req.file.size} Bytes, ${req.file.mimetype}`);
    
    // Parameter aus dem Request
    const { title, latitude, longitude, description } = req.body;
    
    // Prüfe, ob alle erforderlichen Felder vorhanden sind
    if (!title || !latitude || !longitude) {
      console.log('Fehlende Pflichtfelder in Request');
      return res.status(400).json({ error: 'Titel und Koordinaten sind erforderlich' });
    }
    
    // Bild als Base64 einlesen
    const imageData = fs.readFileSync(req.file.path, { encoding: 'base64' });
    
    // In die Datenbank einfügen
    const result = await pool.query(
      'INSERT INTO locations (title, latitude, longitude, description, image_data, image_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [title, latitude, longitude, description || null, imageData, req.file.mimetype]
    );
    
    console.log(`Ort mit ID ${result.rows[0].id} erstellt`);
    
    // Erfolgsmeldung zurücksenden
    res.status(201).json({
      success: true,
      id: result.rows[0].id,
      message: 'Ort erfolgreich gespeichert'
    });
  } catch (error) {
    console.error('Fehler beim Erstellen des Ortes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bild eines Ortes abrufen
app.get('/api/locations/:id/image', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`Bild für Ort ${id} angefordert`);
    
    const result = await pool.query('SELECT image_data, image_type FROM locations WHERE id = $1', [id]);
    
    // Absoluter Pfad zum Uploads-Verzeichnis
    const absoluteUploadsDir = path.resolve(uploadsDir);
    
    if (result.rows.length === 0 || !result.rows[0].image_data) {
      console.log(`Bild für Ort ${id} nicht gefunden (keine Daten in DB)`);
      return res.sendFile(path.join(absoluteUploadsDir, 'couple.jpg'));
    }
    
    const { image_data, image_type } = result.rows[0];
    
    // Sende Base64-Daten als Bild
    if (image_data) {
      console.log(`Sende Bild für Ort ${id} mit Typ ${image_type}`);
      const buffer = Buffer.from(image_data, 'base64');
      res.setHeader('Content-Type', image_type);
      return res.send(buffer);
    }
    
    // Fallback zum Pärchenbild
    console.log('Bild nicht gefunden, sende Fallback');
    return res.sendFile(path.join(absoluteUploadsDir, 'couple.jpg'));
  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error);
    res.status(500).send('Fehler beim Abrufen des Bildes');
  }
});

// Ort löschen
app.delete('/api/locations/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    
    await deleteLocation(id, res);
  } catch (error) {
    console.error('Fehler beim Löschen des Ortes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Server starten
app.listen(port, '0.0.0.0', () => {
  console.log(`Server läuft auf Port ${port}`);
});