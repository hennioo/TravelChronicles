// Finale Render-kompatible Version mit integriertem Upload-Fix
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

// Globale Variablen
let pool;
let dbConnected = false;
const sessions = {};
const ACCESS_CODE = process.env.ACCESS_CODE || 'suuuu';

// Verschiedene mögliche Uploads-Verzeichnisse einrichten für unterschiedliche Umgebungen
const uploadsDirectories = [
  path.join(__dirname, 'uploads'),  // Standard
  path.join(__dirname, 'dist', 'uploads'),  // Für Render
  path.join(__dirname, 'dist', 'public', 'uploads'),  // Alternative für Render
  path.join(__dirname, '..', 'uploads'),  // Für relative Pfade
  path.join(__dirname, '..', 'dist', 'uploads'),  // Weitere Alternative
  '/opt/render/project/src/uploads',  // Absoluter Pfad für Render
  '/opt/render/project/src/dist/uploads'  // Weitere Render-Option
];

let uploadsDir = '';

// Versuche alle möglichen Verzeichnisse
for (const dir of uploadsDirectories) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log('Uploads-Verzeichnis erstellt: ' + dir);
    } else {
      console.log('Uploads-Verzeichnis existiert: ' + dir);
      
      // Überprüfe, ob das couple.jpg hier existiert
      const couplePath = path.join(dir, 'couple.jpg');
      if (fs.existsSync(couplePath)) {
        console.log('Pärchenbild gefunden in: ' + couplePath);
        uploadsDir = dir;
        break;
      }
    }
    
    // Wenn Verzeichnis existiert aber kein couple.jpg, trotzdem merken für später
    if (uploadsDir === '') {
      uploadsDir = dir;
    }
  } catch (error) {
    console.error('Fehler beim Erstellen des Verzeichnisses ' + dir + ': ' + error.message);
  }
}

console.log('Verwende Uploads-Verzeichnis: ' + uploadsDir);

// Prüfen, ob das Pärchenbild existiert
const coupleImagePath = path.join(uploadsDir, 'couple.jpg');
if (!fs.existsSync(coupleImagePath)) {
  console.warn('WARNUNG: Pärchenbild nicht gefunden: ' + coupleImagePath);
}

// Multer Storage für Uploads - WICHTIG: Höheres Limit (15MB)
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function(req, file, cb) {
    // UUID für den Dateinamen generieren
    const uniqueName = Date.now() + '-' + crypto.randomUUID() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB Limit
  fileFilter: function(req, file, cb) {
    // Erlaubte Dateitypen
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/heic'];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Ungültiger Dateityp. Erlaubt sind nur JPG, PNG und HEIC.'));
    }
  }
});

// Statisches Verzeichnis
app.use('/uploads', express.static(uploadsDir));

// Datenbank-Verbindung
async function connectToDatabase() {
  try {
    // Debugging-Info für Render
    console.log('Umgebungsvariablen (ohne Werte):', {
      DATABASE_URL_EXISTS: !!process.env.DATABASE_URL,
      SUPABASE_URL_EXISTS: !!process.env.SUPABASE_URL,
      SUPABASE_PASSWORD_EXISTS: !!process.env.SUPABASE_PASSWORD,
      NODE_ENV: process.env.NODE_ENV
    });
    
    // Direkter Zugriff auf DATABASE_URL, da diese auf Render konfiguriert ist
    let connectionString = process.env.DATABASE_URL;
    
    // Sicherheitsprüfung für Datenbankkonfiguration
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
        image_data BYTEA,
        image_type TEXT,
        thumbnail_data BYTEA,
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
  const sessionId = crypto.randomUUID();
  sessions[sessionId] = {
    authenticated: true,
    created: Date.now()
  };
  return sessionId;
}

// Prüfen, ob eine Session gültig ist
function isValidSession(sessionId) {
  if (!sessionId || !sessions[sessionId]) {
    return false;
  }
  
  // Session-Timeout nach 24 Stunden
  const sessionTimeout = 24 * 60 * 60 * 1000; // 24 Stunden
  const now = Date.now();
  const sessionAge = now - sessions[sessionId].created;
  
  if (sessionAge > sessionTimeout) {
    delete sessions[sessionId];
    return false;
  }
  
  return sessions[sessionId].authenticated;
}

// Auth-Middleware mit verbesserter Session-Handhabung
function requireAuth(req, res, next) {
  // Session-ID aus verschiedenen Quellen abrufen (URL, Body, FormData)
  const sessionId = req.query.sessionId || (req.body && req.body.sessionId);
  
  console.log(`Auth-Prüfung für Session: ${sessionId}`);
  
  if (isValidSession(sessionId)) {
    // Session verlängern
    if (sessions[sessionId]) {
      sessions[sessionId].created = Date.now();
    }
    return next();
  }
  
  console.log(`Ungültige Session: ${sessionId}`);
  res.redirect('/?error=' + encodeURIComponent('Bitte melde dich an, um diese Seite zu sehen.'));
}

// Helper-Funktion für das Löschen eines Ortes
async function deleteLocation(id, res, redirectUrl = null) {
  try {
    // Lösche direkt den Ort aus der Datenbank
    // Die Bild-Daten werden automatisch mitgelöscht, da sie in derselben Tabelle sind
    const deleteResult = await pool.query('DELETE FROM locations WHERE id = $1 RETURNING id', [id]);
    
    if (deleteResult.rows.length > 0) {
      // Ort wurde erfolgreich gelöscht
      
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
    delete sessions[sessionId];
  }
  
  res.redirect('/');
});

// Geschützte Kartenansicht mit Leaflet
app.get('/map', requireAuth, function(req, res) {
  // Prüfe, ob die Datenbankverbindung aktiv ist
  if (!dbConnected) {
    return res.send(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Susibert - Datenbankfehler</title>
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
    
    .error-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 2rem;
      text-align: center;
    }
    
    .error-message {
      background-color: #ff5252;
      color: white;
      padding: 1rem 2rem;
      border-radius: 8px;
      margin-bottom: 2rem;
      max-width: 600px;
    }
    
    .btn {
      background-color: #f59a0c;
      color: black;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
      text-decoration: none;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div class="header">
    <a href="/" class="logo">
      <div class="logo-circle">
        <img src="/uploads/couple.jpg" alt="Pärchenbild" onerror="this.src='/uploads/couple.png'">
      </div>
      <span class="logo-text">Susibert</span>
    </a>
  </div>
  
  <div class="error-container">
    <div class="error-message">
      <h2>Datenbankverbindung nicht verfügbar</h2>
      <p>Die Verbindung zur Datenbank konnte nicht hergestellt werden. Bitte versuche es später erneut.</p>
    </div>
    <a href="/" class="btn">Zurück zur Anmeldung</a>
  </div>
</body>
</html>`);
  }

  const sessionId = req.query.sessionId;
  
  // Kartenansicht mit EINGEBAUTEM JavaScript-Fix
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
    
    // Session-ID aus URL extrahieren
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');
    
    // WICHTIGER FIX: Standard-Upload überschreiben
    function applyUploadFix() {
      debug("*** WENDE UPLOAD-FIX AN ***");
      
      if (!locationForm) {
        debug("Formular nicht gefunden!");
        return false;
      }
      
      locationForm.onsubmit = function(e) {
        e.preventDefault();
        debug("ANGEPASSTER UPLOAD-HANDLER AKTIV");
        
        if (!sessionId) {
          showError("Keine Session-ID gefunden! Bitte neu anmelden.");
          return;
        }
        
        // Formular-Daten prüfen
        const title = locationTitle.value;
        const lat = locationLat.value;
        const lng = locationLng.value;
        const desc = locationDesc.value || '';
        
        if (!title || !lat || !lng || !locationImage.files.length) {
          showError("Bitte fülle alle Pflichtfelder aus.");
          return;
        }
        
        const file = locationImage.files[0];
        
        // Bildgröße prüfen
        const maxSize = 15 * 1024 * 1024; // 15MB
        if (file.size > maxSize) {
          showError(\`Das Bild ist zu groß: \${(file.size / (1024 * 1024)).toFixed(2)} MB. Maximal erlaubt sind 15 MB.\`);
          return;
        }
        
        // FormData erstellen - WICHTIG: sessionId in FormData UND URL einfügen!
        const formData = new FormData();
        formData.append('title', title);
        formData.append('latitude', lat);
        formData.append('longitude', lng);
        formData.append('description', desc);
        formData.append('image', file);
        formData.append('sessionId', sessionId);
        
        debug("Sende Daten mit Session-ID in URL und FormData", { sessionId });
        
        // Lade-Anzeige
        showLoading("Bild wird hochgeladen...");
        
        // Button deaktivieren
        const submitButton = e.target.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = "Uploading...";
        
        // Anfrage senden
        fetch('/api/locations?sessionId=' + sessionId, {
          method: 'POST',
          body: formData
        })
        .then(response => {
          debug("Antwort erhalten:", { status: response.status });
          
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            return response.json();
          } else {
            return response.text().then(text => {
              debug("Keine JSON-Antwort erhalten:", text.substring(0, 200));
              
              if (text.includes('<title>Susibert</title>') || text.includes('loginForm')) {
                debug("Login-Seite erhalten - Session abgelaufen");
                alert("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
                window.location.href = '/';
                throw new Error('Session abgelaufen');
              }
              
              throw new Error('Unerwartete Antwort vom Server');
            });
          }
        })
        .then(data => {
          // Button zurücksetzen
          submitButton.disabled = false;
          submitButton.textContent = originalText;
          hideLoading();
          
          if (data.error) {
            showError("Fehler: " + data.error);
            return;
          }
          
          debug("Erfolgreiche Antwort:", data);
          
          // Erfolgsmeldung
          alert("Ort wurde erfolgreich gespeichert!");
          
          // Formular zurücksetzen und schließen
          locationForm.reset();
          addLocationForm.style.display = 'none';
          
          // Orte neu laden
          loadLocations();
          
          // Bearbeitungsmodus beenden
          if (editMode) {
            toggleEditMode();
          }
        })
        .catch(error => {
          // Button zurücksetzen
          submitButton.disabled = false;
          submitButton.textContent = originalText;
          hideLoading();
          
          debug("Fehler beim Upload:", error.message);
          
          if (!error.message.includes('Session abgelaufen')) {
            showError("Fehler beim Speichern: " + error.message);
          }
        });
      };
      
      debug("*** UPLOAD-FIX ERFOLGREICH INSTALLIERT ***");
      return true;
    }
    
    // Karten-Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // Variablen
    let locations = [];
    let markers = {};
    let editMode = false;
    let activeLocationId = null;
    let uploadFixApplied = false;
    
    // Event-Listener
    menuBtn.addEventListener('click', toggleSidebar);
    closeBtn.addEventListener('click', toggleSidebar);
    addLocationBtn.addEventListener('click', startAddLocation);
    editModeBtn.addEventListener('click', toggleEditMode);
    cancelBtn.addEventListener('click', hideAddLocationForm);
    detailClose.addEventListener('click', hideLocationDetail);
    detailDelete.addEventListener('click', deleteLocation);
    addHereBtn.addEventListener('click', addLocationHere);
    
    // Upload-Fix bei Formular-Anzeige anwenden
    addLocationBtn.addEventListener('click', () => {
      if (!uploadFixApplied) {
        setTimeout(() => {
          uploadFixApplied = applyUploadFix();
        }, 500);
      }
    });
    
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
      
      const { lat, lng } = e.latlng;
      
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
      
      // Upload-Fix anwenden, falls noch nicht geschehen
      if (!uploadFixApplied) {
        uploadFixApplied = applyUploadFix();
      }
    }
    
    function addLocationHere() {
      const center = map.getCenter();
      const lat = center.lat;
      const lng = center.lng;
      
      locationLat.value = lat;
      locationLng.value = lng;
      
      showAddLocationForm();
      
      // Upload-Fix anwenden, falls noch nicht geschehen
      if (!uploadFixApplied) {
        uploadFixApplied = applyUploadFix();
      }
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
      
      // Bild anzeigen mit Session-ID Parameter
      detailImage.src = '/api/locations/' + location.id + '/image?sessionId=' + sessionId + '&t=' + new Date().getTime();
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
        fetch('/api/locations/' + activeLocationId + '?sessionId=' + sessionId, {
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
    
    // Map-Events
    map.on('move', updateFixedMarkerPosition);
    
    // Seite initialisieren
    loadLocations();
    updateFixedMarkerPosition();
    
    // Upload-Fix starten
    setTimeout(() => {
      uploadFixApplied = applyUploadFix();
      debug("Upload-Fix beim Start angewendet:", uploadFixApplied);
    }, 1000);
    
    // Resize-Event auslösen, damit Leaflet die Karte korrekt rendert
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      debug("Resize-Event ausgelöst");
    }, 500);
  </script>
</body>
</html>
  `);
});

// Admin-Bereich (gekürzte Version)
app.get('/admin', requireAuth, async (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    
    if (!dbConnected) {
      return res.send(`
        <h1>Datenbankverbindung nicht verfügbar</h1>
        <p>Bitte versuche es später erneut.</p>
        <a href="/map?sessionId=${sessionId}">Zurück zur Karte</a>
      `);
    }
    
    // Admin-Bereich HTML hier...
    res.send(`
      <h1>Admin-Bereich</h1>
      <p>Hier könnten Admin-Funktionen sein.</p>
      <a href="/map?sessionId=${sessionId}">Zurück zur Karte</a>
    `);
  } catch (error) {
    console.error('Fehler beim Laden des Admin-Bereichs:', error);
    res.status(500).send('Fehler beim Laden des Admin-Bereichs');
  }
});

// API-Routen mit verbesserter Session-Handhabung
// API-Route zum Abrufen aller Orte
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

// API-Route zum Hinzufügen eines neuen Ortes
// WICHTIG: verbesserte Session-Handhabung
app.post('/api/locations', requireAuth, upload.single('image'), async (req, res) => {
  try {
    console.log('Neuer Ort wird hinzugefügt');
    
    // Sichere Session-Handhabung
    const sessionId = req.query.sessionId || (req.body && req.body.sessionId);
    console.log(`Session-ID aus Request: ${sessionId}`);
    
    if (!isValidSession(sessionId)) {
      console.log('Ungültige Session beim Hochladen:', sessionId);
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }
    
    // Prüfe, ob ein Bild hochgeladen wurde
    if (!req.file) {
      console.log('Kein Bild im Request');
      return res.status(400).json({ error: 'Bild ist erforderlich' });
    }
    
    console.log(`Bild hochgeladen: ${req.file.originalname}, ${req.file.size} Bytes`);
    
    // Parameter aus dem Request
    const { title, latitude, longitude, description } = req.body;
    
    // Prüfe, ob alle erforderlichen Felder vorhanden sind
    if (!title || !latitude || !longitude) {
      console.log('Fehlende Pflichtfelder');
      return res.status(400).json({ error: 'Titel und Koordinaten sind erforderlich' });
    }
    
    // In die Datenbank einfügen
    const result = await pool.query(
      'INSERT INTO locations (title, latitude, longitude, description, image, image_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [title, latitude, longitude, description || '', req.file.path, req.file.mimetype]
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

// API-Route zum Abrufen eines Bildes
app.get('/api/locations/:id/image', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    
    const result = await pool.query('SELECT image, image_type FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0 || !result.rows[0].image) {
      // Wenn kein Bild oder Ort gefunden wurde, das Standardbild verwenden
      return res.sendFile(path.join(uploadsDir, 'couple.jpg'), {
        headers: {
          'Content-Type': 'image/jpeg'
        }
      });
    }
    
    const { image, image_type } = result.rows[0];
    
    if (image.startsWith('/')) {
      // Wenn das Bild als Pfad gespeichert ist
      res.sendFile(image, {
        headers: {
          'Content-Type': image_type || 'image/jpeg'
        }
      });
    } else {
      // Hier würde man die Bild-Daten aus der Datenbank zurückgeben, falls sie dort gespeichert sind
      res.sendFile(path.join(uploadsDir, path.basename(image)), {
        headers: {
          'Content-Type': image_type || 'image/jpeg'
        }
      });
    }
  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error);
    
    // Standardbild zurückgeben im Fehlerfall
    res.sendFile(path.join(uploadsDir, 'couple.jpg'), {
      headers: {
        'Content-Type': 'image/jpeg'
      }
    });
  }
});

// API-Route zum Löschen eines Ortes
app.delete('/api/locations/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    
    await deleteLocation(id, res);
  } catch (error) {
    console.error('Fehler beim Löschen des Ortes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health-Check Route
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Server starten
app.listen(port, '0.0.0.0', () => {
  console.log(`Server läuft auf Port ${port}`);
});