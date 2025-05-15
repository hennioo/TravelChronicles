#!/bin/bash

# Fix-Column Build-Script für Render mit direkter Spaltenumwandlung
set -ex

echo "=== Fix-Column Build-Script ==="

# 1. Pakete installieren
echo "Installiere benötigte Pakete..."
npm install express pg multer sharp fs-extra

# 2. Verzeichnisse erstellen
echo "Erstelle Verzeichnisstruktur..."
mkdir -p dist/uploads
mkdir -p dist/public/uploads

# 3. Dateien kopieren
echo "Kopiere Uploads-Dateien..."
cp -rv uploads/* dist/uploads/ || echo "Keine Uploads-Dateien gefunden"

# 4. Datenbank anpassen
echo "Bereite Datenbank vor..."
node setup-supabase.js

# 5. Server-Code erstellen
echo "Erstelle Server..."
cat > dist/index.js << 'EOF'
// Fix-Column Server für Susibert Travel Map
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

// Verbindung zur Datenbank herstellen und Statusinfos ausgeben
async function initializeDatabase() {
  try {
    const client = await pool.connect();
    console.log('Datenbankverbindung erfolgreich hergestellt');
    
    // Prüfen, ob die Tabelle existiert
    const tableExists = await checkTableExists(client);
    console.log('Tabelle locations existiert:', tableExists);
    
    if (tableExists) {
      // Spalten der Tabelle auflisten
      const columns = await getTableColumns(client);
      console.log('Spalten der Tabelle locations:', columns);
      
      // Anzahl der Einträge
      const count = await getLocationCount(client);
      console.log('Anzahl der Orte in der Datenbank:', count);
    }
    
    client.release();
    return true;
  } catch (error) {
    console.error('Fehler bei Datenbankinitialisierung:', error);
    return false;
  }
}

// Prüfen, ob die Tabelle existiert
async function checkTableExists(client) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'locations'
    );
  `);
  return result.rows[0].exists;
}

// Spalten der Tabelle abrufen
async function getTableColumns(client) {
  const result = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'locations'
    ORDER BY ordinal_position;
  `);
  return result.rows.map(row => row.column_name);
}

// Anzahl der Orte abrufen
async function getLocationCount(client) {
  const result = await client.query('SELECT COUNT(*) FROM locations;');
  return result.rows[0].count;
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

// Thumbnail für ein Bild erstellen
async function createThumbnail(imageData) {
  try {
    return await sharp(imageData)
      .resize(60, 60, { fit: 'cover' })
      .toBuffer();
  } catch (error) {
    console.error('Fehler beim Erstellen des Thumbnails:', error);
    return null;
  }
}

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
    
    // Spalten der Tabelle abrufen
    const columnsResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'locations'
      ORDER BY ordinal_position;
    `);
    
    const columns = columnsResult.rows;
    
    // Anzahl der Orte
    const countResult = await client.query('SELECT COUNT(*) FROM locations;');
    const locationCount = countResult.rows[0].count;
    
    client.release();
    
    const adminHtml = '<!DOCTYPE html>\n' +
      '<html lang="de">\n' +
      '<head>\n' +
      '  <meta charset="UTF-8">\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '  <title>Susibert - Admin</title>\n' +
      '  <style>\n' +
      '    body {\n' +
      '      font-family: system-ui, -apple-system, sans-serif;\n' +
      '      background-color: #1a1a1a;\n' +
      '      color: #f5f5f5;\n' +
      '      margin: 0;\n' +
      '      padding: 0;\n' +
      '      display: flex;\n' +
      '      flex-direction: column;\n' +
      '      min-height: 100vh;\n' +
      '    }\n' +
      '    \n' +
      '    .header {\n' +
      '      background-color: #222;\n' +
      '      padding: 15px 20px;\n' +
      '      display: flex;\n' +
      '      justify-content: space-between;\n' +
      '      align-items: center;\n' +
      '      border-bottom: 1px solid #333;\n' +
      '    }\n' +
      '    \n' +
      '    .logo {\n' +
      '      display: flex;\n' +
      '      align-items: center;\n' +
      '      gap: 10px;\n' +
      '      color: #f59a0c;\n' +
      '      text-decoration: none;\n' +
      '    }\n' +
      '    \n' +
      '    .logo-circle {\n' +
      '      width: 36px;\n' +
      '      height: 36px;\n' +
      '      border-radius: 50%;\n' +
      '      overflow: hidden;\n' +
      '      border: 2px solid #f59a0c;\n' +
      '    }\n' +
      '    \n' +
      '    .logo-circle img {\n' +
      '      width: 100%;\n' +
      '      height: 100%;\n' +
      '      object-fit: cover;\n' +
      '    }\n' +
      '    \n' +
      '    .logo-text {\n' +
      '      font-size: 1.5rem;\n' +
      '      font-weight: bold;\n' +
      '    }\n' +
      '    \n' +
      '    .content {\n' +
      '      flex: 1;\n' +
      '      padding: 30px;\n' +
      '      max-width: 800px;\n' +
      '      margin: 0 auto;\n' +
      '      width: 100%;\n' +
      '    }\n' +
      '    \n' +
      '    .admin-title {\n' +
      '      font-size: 2rem;\n' +
      '      color: #f59a0c;\n' +
      '      margin-bottom: 30px;\n' +
      '      text-align: center;\n' +
      '    }\n' +
      '    \n' +
      '    .admin-section {\n' +
      '      background-color: #222;\n' +
      '      border-radius: 8px;\n' +
      '      padding: 20px;\n' +
      '      margin-bottom: 30px;\n' +
      '    }\n' +
      '    \n' +
      '    .section-title {\n' +
      '      font-size: 1.4rem;\n' +
      '      margin-top: 0;\n' +
      '      margin-bottom: 15px;\n' +
      '      color: #f59a0c;\n' +
      '    }\n' +
      '    \n' +
      '    .info-box {\n' +
      '      background-color: #333;\n' +
      '      border: 1px solid #444;\n' +
      '      padding: 15px;\n' +
      '      border-radius: 6px;\n' +
      '      margin-bottom: 20px;\n' +
      '      font-family: monospace;\n' +
      '      white-space: pre-wrap;\n' +
      '      max-height: 300px;\n' +
      '      overflow-y: auto;\n' +
      '    }\n' +
      '    \n' +
      '    .success-box {\n' +
      '      background-color: rgba(76, 175, 80, 0.2);\n' +
      '      border: 1px solid #4caf50;\n' +
      '      padding: 15px;\n' +
      '      border-radius: 6px;\n' +
      '      margin-bottom: 20px;\n' +
      '    }\n' +
      '    \n' +
      '    .back-link {\n' +
      '      display: inline-block;\n' +
      '      margin-top: 20px;\n' +
      '      color: #f59a0c;\n' +
      '      text-decoration: none;\n' +
      '    }\n' +
      '    \n' +
      '    .back-link:hover {\n' +
      '      text-decoration: underline;\n' +
      '    }\n' +
      '    \n' +
      '    @media (max-width: 768px) {\n' +
      '      .content {\n' +
      '        padding: 20px;\n' +
      '      }\n' +
      '    }\n' +
      '    \n' +
      '    .table {\n' +
      '      width: 100%;\n' +
      '      border-collapse: collapse;\n' +
      '    }\n' +
      '    \n' +
      '    .table th, .table td {\n' +
      '      padding: 8px 12px;\n' +
      '      text-align: left;\n' +
      '      border-bottom: 1px solid #444;\n' +
      '    }\n' +
      '    \n' +
      '    .table th {\n' +
      '      color: #f59a0c;\n' +
      '      font-weight: bold;\n' +
      '    }\n' +
      '  </style>\n' +
      '</head>\n' +
      '<body>\n' +
      '  <div class="header">\n' +
      '    <a href="/map?sessionId=' + sessionId + '" class="logo">\n' +
      '      <div class="logo-circle">\n' +
      '        <img src="/uploads/couple.jpg" alt="Pärchenbild" onerror="this.src=\'/uploads/couple.png\'">\n' +
      '      </div>\n' +
      '      <span class="logo-text">Susibert</span>\n' +
      '    </a>\n' +
      '  </div>\n' +
      '  \n' +
      '  <div class="content">\n' +
      '    <h1 class="admin-title">Administrator-Bereich</h1>\n' +
      '    \n' +
      '    <div class="admin-section">\n' +
      '      <h2 class="section-title">Datenbankstatus</h2>\n' +
      '      <div class="success-box">\n' +
      '        <p><strong>Anzahl der Orte:</strong> ' + locationCount + '</p>\n' +
      '      </div>\n' +
      '      \n' +
      '      <h3>Spaltenstruktur</h3>\n' +
      '      <div class="info-box" style="max-height: none; overflow: auto;">\n' +
      '        <table class="table">\n' +
      '          <thead>\n' +
      '            <tr>\n' +
      '              <th>Spaltenname</th>\n' +
      '              <th>Datentyp</th>\n' +
      '            </tr>\n' +
      '          </thead>\n' +
      '          <tbody>\n' +
      columns.map(col => 
      '            <tr>\n' +
      '              <td>' + col.column_name + '</td>\n' +
      '              <td>' + col.data_type + '</td>\n' +
      '            </tr>\n'
      ).join('') +
      '          </tbody>\n' +
      '        </table>\n' +
      '      </div>\n' +
      '    </div>\n' +
      '    \n' +
      '    <a href="/map?sessionId=' + sessionId + '" class="back-link">← Zurück zur Karte</a>\n' +
      '  </div>\n' +
      '</body>\n' +
      '</html>';
    
    res.send(adminHtml);
  } catch (error) {
    console.error('Fehler beim Laden des Admin-Bereichs:', error);
    res.status(500).send('Fehler beim Laden des Admin-Bereichs: ' + error.message);
  }
});

// Geschützte Kartenansicht mit Leaflet
app.get('/map', requireAuth, function(req, res) {
  // Hole die Session-ID aus der Anfrage
  const sessionId = req.query.sessionId;

  // Map-HTML-Datei inline generieren, damit wir keine externe Datei brauchen
  const mapHtml = '<!DOCTYPE html>\n' +
    '<html lang="de">\n' +
    '<head>\n' +
    '  <meta charset="UTF-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '  <title>Susibert - Weltkarte</title>\n' +
    '  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">\n' +
    '  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>\n' +
    '  <style>\n' +
    '    body {\n' +
    '      font-family: system-ui, -apple-system, sans-serif;\n' +
    '      background-color: #1a1a1a;\n' +
    '      color: #f5f5f5;\n' +
    '      margin: 0;\n' +
    '      padding: 0;\n' +
    '      display: flex;\n' +
    '      flex-direction: column;\n' +
    '      height: 100vh;\n' +
    '      overflow: hidden;\n' +
    '    }\n' +
    '    \n' +
    '    .header {\n' +
    '      background-color: #222;\n' +
    '      padding: 15px 20px;\n' +
    '      display: flex;\n' +
    '      justify-content: space-between;\n' +
    '      align-items: center;\n' +
    '      border-bottom: 1px solid #333;\n' +
    '      z-index: 1000;\n' +
    '    }\n' +
    '    \n' +
    '    .logo {\n' +
    '      display: flex;\n' +
    '      align-items: center;\n' +
    '      gap: 10px;\n' +
    '      color: #f59a0c;\n' +
    '      text-decoration: none;\n' +
    '    }\n' +
    '    \n' +
    '    .logo-circle {\n' +
    '      width: 36px;\n' +
    '      height: 36px;\n' +
    '      border-radius: 50%;\n' +
    '      overflow: hidden;\n' +
    '      border: 2px solid #f59a0c;\n' +
    '    }\n' +
    '    \n' +
    '    .logo-circle img {\n' +
    '      width: 100%;\n' +
    '      height: 100%;\n' +
    '      object-fit: cover;\n' +
    '    }\n' +
    '    \n' +
    '    .logo-text {\n' +
    '      font-size: 1.5rem;\n' +
    '      font-weight: bold;\n' +
    '    }\n' +
    '    \n' +
    '    .content {\n' +
    '      position: relative;\n' +
    '      flex: 1;\n' +
    '      overflow: hidden;\n' +
    '    }\n' +
    '    \n' +
    '    .map-container {\n' +
    '      position: absolute;\n' +
    '      top: 0;\n' +
    '      left: 0;\n' +
    '      width: 100%;\n' +
    '      height: 100%;\n' +
    '      z-index: 1;\n' +
    '    }\n' +
    '    \n' +
    '    #map {\n' +
    '      height: 100%;\n' +
    '      width: 100%;\n' +
    '      background-color: #333;\n' +
    '    }\n' +
    '    \n' +
    '    .sidebar {\n' +
    '      position: fixed;\n' +
    '      top: 70px; /* Header-Höhe + kleines Padding */\n' +
    '      right: 0;\n' +
    '      width: 300px;\n' +
    '      height: calc(100vh - 70px);\n' +
    '      background-color: rgba(34, 34, 34, 0.95);\n' +
    '      z-index: 1000;\n' +
    '      transform: translateX(100%);\n' +
    '      transition: transform 0.3s ease;\n' +
    '      display: flex;\n' +
    '      flex-direction: column;\n' +
    '      border-left: 1px solid #333;\n' +
    '    }\n' +
    '    \n' +
    '    .sidebar.open {\n' +
    '      transform: translateX(0);\n' +
    '    }\n' +
    '    \n' +
    '    .sidebar-header {\n' +
    '      padding: 15px;\n' +
    '      border-bottom: 1px solid #333;\n' +
    '      display: flex;\n' +
    '      justify-content: space-between;\n' +
    '      align-items: center;\n' +
    '    }\n' +
    '    \n' +
    '    .sidebar-title {\n' +
    '      font-size: 1.2rem;\n' +
    '      font-weight: bold;\n' +
    '      color: #f59a0c;\n' +
    '      margin: 0;\n' +
    '    }\n' +
    '    \n' +
    '    .sidebar-close {\n' +
    '      background: none;\n' +
    '      border: none;\n' +
    '      color: #aaa;\n' +
    '      font-size: 1.5rem;\n' +
    '      cursor: pointer;\n' +
    '    }\n' +
    '    \n' +
    '    .locations-list {\n' +
    '      flex: 1;\n' +
    '      overflow-y: auto;\n' +
    '    }\n' +
    '    \n' +
    '    .location-item {\n' +
    '      padding: 12px 15px;\n' +
    '      border-bottom: 1px solid #333;\n' +
    '      cursor: pointer;\n' +
    '      transition: background-color 0.2s;\n' +
    '      display: flex;\n' +
    '      align-items: center;\n' +
    '      gap: 10px;\n' +
    '    }\n' +
    '    \n' +
    '    .location-item:hover {\n' +
    '      background-color: #2a2a2a;\n' +
    '    }\n' +
    '    \n' +
    '    .location-thumbnail {\n' +
    '      width: 40px;\n' +
    '      height: 40px;\n' +
    '      border-radius: 6px;\n' +
    '      object-fit: cover;\n' +
    '      border: 1px solid #444;\n' +
    '    }\n' +
    '    \n' +
    '    .location-info {\n' +
    '      flex: 1;\n' +
    '    }\n' +
    '    \n' +
    '    .location-title {\n' +
    '      font-weight: bold;\n' +
    '      margin-bottom: 3px;\n' +
    '    }\n' +
    '    \n' +
    '    .location-coords {\n' +
    '      font-size: 0.8rem;\n' +
    '      color: #aaa;\n' +
    '    }\n' +
    '    \n' +
    '    .sidebar-footer {\n' +
    '      padding: 15px;\n' +
    '      border-top: 1px solid #333;\n' +
    '    }\n' +
    '    \n' +
    '    .footer-buttons {\n' +
    '      display: grid;\n' +
    '      grid-template-columns: 1fr 1fr;\n' +
    '      gap: 10px;\n' +
    '    }\n' +
    '    \n' +
    '    .sidebar-btn {\n' +
    '      display: block;\n' +
    '      width: 100%;\n' +
    '      padding: 10px;\n' +
    '      text-align: center;\n' +
    '      background-color: #f59a0c;\n' +
    '      color: black;\n' +
    '      border: none;\n' +
    '      border-radius: 4px;\n' +
    '      font-weight: bold;\n' +
    '      cursor: pointer;\n' +
    '      margin-bottom: 10px;\n' +
    '      text-decoration: none;\n' +
    '    }\n' +
    '    \n' +
    '    .sidebar-btn:hover {\n' +
    '      background-color: #e08a00;\n' +
    '    }\n' +
    '    \n' +
    '    .edit-btn {\n' +
    '      background-color: #4caf50;\n' +
    '    }\n' +
    '    \n' +
    '    .edit-btn.active {\n' +
    '      background-color: #e53935;\n' +
    '    }\n' +
    '    \n' +
    '    .logout-btn {\n' +
    '      background-color: #757575;\n' +
    '      color: white;\n' +
    '    }\n' +
    '    \n' +
    '    .admin-btn {\n' +
    '      background-color: #2196f3;\n' +
    '      color: white;\n' +
    '    }\n' +
    '    \n' +
    '    .location-detail {\n' +
    '      position: absolute;\n' +
    '      top: 20px;\n' +
    '      right: 20px;\n' +
    '      width: 320px;\n' +
    '      background-color: rgba(34, 34, 34, 0.9);\n' +
    '      border-radius: 8px;\n' +
    '      padding: 20px;\n' +
    '      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);\n' +
    '      z-index: 1000;\n' +
    '      display: none;\n' +
    '      max-height: calc(100% - 80px);\n' +
    '      overflow-y: auto;\n' +
    '    }\n' +
    '    \n' +
    '    .detail-header {\n' +
    '      display: flex;\n' +
    '      justify-content: space-between;\n' +
    '      align-items: flex-start;\n' +
    '      margin-bottom: 15px;\n' +
    '    }\n' +
    '    \n' +
    '    .detail-title {\n' +
    '      font-size: 1.4rem;\n' +
    '      font-weight: bold;\n' +
    '      color: #f59a0c;\n' +
    '      margin: 0;\n' +
    '    }\n' +
    '    \n' +
    '    .detail-close {\n' +
    '      background: none;\n' +
    '      border: none;\n' +
    '      color: #aaa;\n' +
    '      cursor: pointer;\n' +
    '      font-size: 1.5rem;\n' +
    '      line-height: 1;\n' +
    '      padding: 0;\n' +
    '    }\n' +
    '    \n' +
    '    .detail-image {\n' +
    '      width: 100%;\n' +
    '      border-radius: 6px;\n' +
    '      margin-bottom: 15px;\n' +
    '    }\n' +
    '    \n' +
    '    .detail-coords {\n' +
    '      font-size: 0.85rem;\n' +
    '      color: #aaa;\n' +
    '      margin-bottom: 15px;\n' +
    '    }\n' +
    '    \n' +
    '    .detail-description {\n' +
    '      margin-bottom: 20px;\n' +
    '      line-height: 1.5;\n' +
    '    }\n' +
    '    \n' +
    '    .detail-actions {\n' +
    '      display: flex;\n' +
    '      justify-content: space-between;\n' +
    '    }\n' +
    '    \n' +
    '    .detail-delete {\n' +
    '      background-color: #e53935;\n' +
    '      color: white;\n' +
    '      border: none;\n' +
    '      padding: 8px 12px;\n' +
    '      border-radius: 4px;\n' +
    '      cursor: pointer;\n' +
    '      transition: background-color 0.2s;\n' +
    '    }\n' +
    '    \n' +
    '    .detail-delete:hover {\n' +
    '      background-color: #c62828;\n' +
    '    }\n' +
    '    \n' +
    '    .control-buttons {\n' +
    '      position: absolute;\n' +
    '      top: 20px;\n' +
    '      right: 20px;\n' +
    '      z-index: 999;\n' +
    '      display: flex;\n' +
    '      gap: 10px;\n' +
    '    }\n' +
    '    \n' +
    '    .control-btn {\n' +
    '      width: 44px;\n' +
    '      height: 44px;\n' +
    '      border-radius: 50%;\n' +
    '      background-color: #222;\n' +
    '      color: #f59a0c;\n' +
    '      border: 1px solid #444;\n' +
    '      font-size: 20px;\n' +
    '      display: flex;\n' +
    '      align-items: center;\n' +
    '      justify-content: center;\n' +
    '      cursor: pointer;\n' +
    '      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);\n' +
    '    }\n' +
    '    \n' +
    '    .leaflet-container {\n' +
    '      font-family: system-ui, -apple-system, sans-serif;\n' +
    '    }\n' +
    '    \n' +
    '    .leaflet-popup-content-wrapper {\n' +
    '      background-color: #222;\n' +
    '      color: #f5f5f5;\n' +
    '      border-radius: 8px;\n' +
    '    }\n' +
    '    \n' +
    '    .leaflet-popup-tip {\n' +
    '      background-color: #222;\n' +
    '    }\n' +
    '    \n' +
    '    .leaflet-popup-content {\n' +
    '      margin: 12px;\n' +
    '    }\n' +
    '    \n' +
    '    .popup-title {\n' +
    '      font-weight: bold;\n' +
    '      color: #f59a0c;\n' +
    '      margin-bottom: 5px;\n' +
    '    }\n' +
    '    \n' +
    '    .popup-link {\n' +
    '      color: #f59a0c;\n' +
    '      text-decoration: none;\n' +
    '      margin-top: 5px;\n' +
    '      display: inline-block;\n' +
    '    }\n' +
    '    \n' +
    '    .popup-link:hover {\n' +
    '      text-decoration: underline;\n' +
    '    }\n' +
    '    \n' +
    '    .location-form {\n' +
    '      position: absolute;\n' +
    '      top: 50%;\n' +
    '      left: 50%;\n' +
    '      transform: translate(-50%, -50%);\n' +
    '      width: 320px;\n' +
    '      background-color: rgba(34, 34, 34, 0.95);\n' +
    '      border-radius: 8px;\n' +
    '      padding: 20px;\n' +
    '      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);\n' +
    '      z-index: 1100;\n' +
    '      display: none;\n' +
    '    }\n' +
    '    \n' +
    '    .form-title {\n' +
    '      font-size: 1.2rem;\n' +
    '      font-weight: bold;\n' +
    '      color: #f59a0c;\n' +
    '      margin: 0 0 15px 0;\n' +
    '    }\n' +
    '    \n' +
    '    .form-group {\n' +
    '      margin-bottom: 15px;\n' +
    '    }\n' +
    '    \n' +
    '    .form-label {\n' +
    '      display: block;\n' +
    '      margin-bottom: 5px;\n' +
    '      font-weight: bold;\n' +
    '    }\n' +
    '    \n' +
    '    .form-input, .form-textarea {\n' +
    '      width: 100%;\n' +
    '      padding: 8px 12px;\n' +
    '      border-radius: 4px;\n' +
    '      background-color: #333;\n' +
    '      border: 1px solid #444;\n' +
    '      color: #f5f5f5;\n' +
    '    }\n' +
    '    \n' +
    '    .form-textarea {\n' +
    '      min-height: 100px;\n' +
    '      resize: vertical;\n' +
    '    }\n' +
    '    \n' +
    '    .form-coords {\n' +
    '      display: flex;\n' +
    '      gap: 10px;\n' +
    '    }\n' +
    '    \n' +
    '    .form-coords .form-group {\n' +
    '      flex: 1;\n' +
    '    }\n' +
    '    \n' +
    '    .form-actions {\n' +
    '      display: flex;\n' +
    '      justify-content: space-between;\n' +
    '      margin-top: 20px;\n' +
    '    }\n' +
    '    \n' +
    '    .form-submit {\n' +
    '      background-color: #4caf50;\n' +
    '      color: white;\n' +
    '      border: none;\n' +
    '      padding: 8px 16px;\n' +
    '      border-radius: 4px;\n' +
    '      cursor: pointer;\n' +
    '      font-weight: bold;\n' +
    '    }\n' +
    '    \n' +
    '    .form-cancel {\n' +
    '      background-color: #757575;\n' +
    '      color: white;\n' +
    '      border: none;\n' +
    '      padding: 8px 16px;\n' +
    '      border-radius: 4px;\n' +
    '      cursor: pointer;\n' +
    '    }\n' +
    '    \n' +
    '    .tooltip {\n' +
    '      position: fixed;\n' +
    '      background: rgba(0, 0, 0, 0.7);\n' +
    '      color: white;\n' +
    '      padding: 5px 10px;\n' +
    '      border-radius: 4px;\n' +
    '      z-index: 2000;\n' +
    '      pointer-events: none;\n' +
    '      font-size: 0.9rem;\n' +
    '    }\n' +
    '    \n' +
    '    @media (max-width: 768px) {\n' +
    '      .location-detail {\n' +
    '        width: 280px;\n' +
    '        right: 10px;\n' +
    '        top: 10px;\n' +
    '      }\n' +
    '    }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <div class="header">\n' +
    '    <a href="/" class="logo">\n' +
    '      <div class="logo-circle">\n' +
    '        <img src="/uploads/couple.jpg" alt="Pärchenbild" onerror="this.src=\'/uploads/couple.png\'">\n' +
    '      </div>\n' +
    '      <span class="logo-text">Susibert</span>\n' +
    '    </a>\n' +
    '  </div>\n' +
    '  \n' +
    '  <div class="content">\n' +
    '    <div class="map-container">\n' +
    '      <div id="map"></div>\n' +
    '    </div>\n' +
    '    \n' +
    '    <div class="control-buttons">\n' +
    '      <button class="control-btn" id="menuBtn">☰</button>\n' +
    '      <button class="control-btn" id="logoutMainBtn">🚪</button>\n' +
    '    </div>\n' +
    '    \n' +
    '    <div class="sidebar" id="sidebar">\n' +
    '      <div class="sidebar-header">\n' +
    '        <h2 class="sidebar-title">Besuchte Orte</h2>\n' +
    '        <button class="sidebar-close" id="sidebarCloseBtn">&times;</button>\n' +
    '      </div>\n' +
    '      \n' +
    '      <div class="locations-list" id="locationsList">\n' +
    '        <!-- Hier werden die Orte dynamisch eingefügt -->\n' +
    '      </div>\n' +
    '      \n' +
    '      <div class="sidebar-footer">\n' +
    '        <button class="sidebar-btn" id="addLocationBtn">Ort hinzufügen</button>\n' +
    '        <div class="footer-buttons">\n' +
    '          <button class="sidebar-btn edit-btn" id="toggleEditModeBtn">Bearbeiten</button>\n' +
    '          <a href="/admin?sessionId=' + sessionId + '" class="sidebar-btn admin-btn">Admin</a>\n' +
    '        </div>\n' +
    '      </div>\n' +
    '    </div>\n' +
    '    \n' +
    '    <div class="location-detail" id="locationDetail">\n' +
    '      <div class="detail-header">\n' +
    '        <h3 class="detail-title" id="detailTitle"></h3>\n' +
    '        <button class="detail-close" id="detailClose">&times;</button>\n' +
    '      </div>\n' +
    '      <img class="detail-image" id="detailImage" src="" alt="Ortsbild">\n' +
    '      <div class="detail-coords" id="detailCoords"></div>\n' +
    '      <div class="detail-description" id="detailDescription"></div>\n' +
    '      <div class="detail-actions">\n' +
    '        <button class="detail-delete" id="detailDelete">Löschen</button>\n' +
    '      </div>\n' +
    '    </div>\n' +
    '    \n' +
    '    <form class="location-form" id="locationForm" enctype="multipart/form-data">\n' +
    '      <h3 class="form-title">Neuen Ort hinzufügen</h3>\n' +
    '      \n' +
    '      <div class="form-group">\n' +
    '        <label class="form-label" for="locationTitle">Titel*</label>\n' +
    '        <input type="text" class="form-input" id="locationTitle" name="title" required>\n' +
    '      </div>\n' +
    '      \n' +
    '      <div class="form-coords">\n' +
    '        <div class="form-group">\n' +
    '          <label class="form-label" for="locationLat">Breitengrad</label>\n' +
    '          <input type="number" step="0.000001" class="form-input" id="locationLat" name="latitude" readonly>\n' +
    '        </div>\n' +
    '        <div class="form-group">\n' +
    '          <label class="form-label" for="locationLng">Längengrad</label>\n' +
    '          <input type="number" step="0.000001" class="form-input" id="locationLng" name="longitude" readonly>\n' +
    '        </div>\n' +
    '      </div>\n' +
    '      \n' +
    '      <div class="form-group">\n' +
    '        <label class="form-label" for="locationDescription">Beschreibung</label>\n' +
    '        <textarea class="form-textarea" id="locationDescription" name="description"></textarea>\n' +
    '      </div>\n' +
    '      \n' +
    '      <div class="form-group">\n' +
    '        <label class="form-label" for="locationImage">Bild*</label>\n' +
    '        <input type="file" class="form-input" id="locationImage" name="image" accept="image/*" required>\n' +
    '      </div>\n' +
    '      \n' +
    '      <input type="hidden" id="sessionIdInput" name="sessionId" value="' + sessionId + '">\n' +
    '      \n' +
    '      <div class="form-actions">\n' +
    '        <button type="button" class="form-cancel" id="formCancel">Abbrechen</button>\n' +
    '        <button type="submit" class="form-submit">Speichern</button>\n' +
    '      </div>\n' +
    '    </form>\n' +
    '  </div>\n' +
    '\n' +
    '  <div class="tooltip" id="tooltip" style="display: none;"></div>\n' +
    '  \n' +
    '  <script>\n' +
    '    // DOM-Elemente\n' +
    '    const map = L.map("map").setView([20, 0], 2);\n' +
    '    const locationsList = document.getElementById("locationsList");\n' +
    '    const locationDetail = document.getElementById("locationDetail");\n' +
    '    const detailTitle = document.getElementById("detailTitle");\n' +
    '    const detailImage = document.getElementById("detailImage");\n' +
    '    const detailCoords = document.getElementById("detailCoords");\n' +
    '    const detailDescription = document.getElementById("detailDescription");\n' +
    '    const detailClose = document.getElementById("detailClose");\n' +
    '    const detailDelete = document.getElementById("detailDelete");\n' +
    '    const addLocationBtn = document.getElementById("addLocationBtn");\n' +
    '    const toggleEditModeBtn = document.getElementById("toggleEditModeBtn");\n' +
    '    const locationForm = document.getElementById("locationForm");\n' +
    '    const formCancel = document.getElementById("formCancel");\n' +
    '    const sessionIdInput = document.getElementById("sessionIdInput");\n' +
    '    const tooltip = document.getElementById("tooltip");\n' +
    '    const sidebar = document.getElementById("sidebar");\n' +
    '    const menuBtn = document.getElementById("menuBtn");\n' +
    '    const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");\n' +
    '    const logoutMainBtn = document.getElementById("logoutMainBtn");\n' +
    '    \n' +
    '    // Parameter aus der URL lesen\n' +
    '    const params = new URLSearchParams(window.location.search);\n' +
    '    const sessionId = params.get("sessionId");\n' +
    '    if (sessionIdInput) sessionIdInput.value = sessionId;\n' +
    '    \n' +
    '    // Karteneinstellungen\n' +
    '    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {\n' +
    '      attribution: \'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors\'\n' +
    '    }).addTo(map);\n' +
    '    \n' +
    '    // Variablen\n' +
    '    let locations = [];\n' +
    '    let markers = {};\n' +
    '    let editMode = false;\n' +
    '    let tempMarker = null;\n' +
    '    let activeLocationId = null;\n' +
    '    \n' +
    '    // Sidebar Toggle\n' +
    '    menuBtn.addEventListener("click", toggleSidebar);\n' +
    '    sidebarCloseBtn.addEventListener("click", toggleSidebar);\n' +
    '    \n' +
    '    // Logout Funktion\n' +
    '    logoutMainBtn.addEventListener("click", logout);\n' +
    '    \n' +
    '    // Eventlistener\n' +
    '    detailClose.addEventListener("click", closeLocationDetail);\n' +
    '    addLocationBtn.addEventListener("click", startAddLocation);\n' +
    '    formCancel.addEventListener("click", cancelAddLocation);\n' +
    '    toggleEditModeBtn.addEventListener("click", toggleEditMode);\n' +
    '    detailDelete.addEventListener("click", deleteActiveLocation);\n' +
    '    locationForm.addEventListener("submit", handleFormSubmit);\n' +
    '    \n' +
    '    // Initialisierung\n' +
    '    loadLocations();\n' +
    '    \n' +
    '    // Funktionen\n' +
    '    function toggleSidebar() {\n' +
    '      sidebar.classList.toggle("open");\n' +
    '    }\n' +
    '    \n' +
    '    function loadLocations() {\n' +
    '      fetch("/api/locations?sessionId=" + sessionId)\n' +
    '        .then(response => response.json())\n' +
    '        .then(data => {\n' +
    '          locations = data;\n' +
    '          renderLocations();\n' +
    '          renderMarkersOnMap();\n' +
    '        })\n' +
    '        .catch(error => console.error("Fehler beim Laden der Orte:", error));\n' +
    '    }\n' +
    '    \n' +
    '    function renderLocations() {\n' +
    '      locationsList.innerHTML = "";\n' +
    '      \n' +
    '      if (locations.length === 0) {\n' +
    '        locationsList.innerHTML = \'<div class="empty-state" style="padding: 20px; text-align: center; color: #999;">Keine Orte vorhanden.<br>Klicke auf "Ort hinzufügen" um zu starten.</div>\';\n' +
    '        return;\n' +
    '      }\n' +
    '      \n' +
    '      locations.forEach(function(location) {\n' +
    '        const item = document.createElement("div");\n' +
    '        item.className = "location-item";\n' +
    '        item.dataset.id = location.id;\n' +
    '        \n' +
    '        const info = document.createElement("div");\n' +
    '        info.className = "location-info";\n' +
    '        \n' +
    '        const title = document.createElement("div");\n' +
    '        title.className = "location-title";\n' +
    '        title.textContent = location.title || "Unbenannter Ort";\n' +
    '        \n' +
    '        const coords = document.createElement("div");\n' +
    '        coords.className = "location-coords";\n' +
    '        coords.textContent = parseFloat(location.latitude).toFixed(4) + ", " + parseFloat(location.longitude).toFixed(4);\n' +
    '        \n' +
    '        info.appendChild(title);\n' +
    '        info.appendChild(coords);\n' +
    '        item.appendChild(info);\n' +
    '        \n' +
    '        item.addEventListener("click", function() {\n' +
    '          showLocationDetail(location.id);\n' +
    '          // Sidebar schließen bei Auswahl eines Ortes\n' +
    '          sidebar.classList.remove("open");\n' +
    '        });\n' +
    '        \n' +
    '        locationsList.appendChild(item);\n' +
    '      });\n' +
    '    }\n' +
    '    \n' +
    '    function renderMarkersOnMap() {\n' +
    '      // Bestehende Marker entfernen\n' +
    '      Object.values(markers).forEach(function(marker) {\n' +
    '        if (marker.circle) {\n' +
    '          map.removeLayer(marker.circle);\n' +
    '        }\n' +
    '        map.removeLayer(marker);\n' +
    '      });\n' +
    '      markers = {};\n' +
    '      \n' +
    '      // Neue Marker hinzufügen\n' +
    '      locations.forEach(function(location) {\n' +
    '        const marker = L.marker([location.latitude, location.longitude]).addTo(map);\n' +
    '        \n' +
    '        // Popup mit Informationen\n' +
    '        const popupContent = document.createElement("div");\n' +
    '        \n' +
    '        const popupTitle = document.createElement("div");\n' +
    '        popupTitle.className = "popup-title";\n' +
    '        popupTitle.textContent = location.title || "Unbenannter Ort";\n' +
    '        \n' +
    '        const popupLink = document.createElement("a");\n' +
    '        popupLink.className = "popup-link";\n' +
    '        popupLink.textContent = "Details anzeigen";\n' +
    '        popupLink.href = "#";\n' +
    '        popupLink.addEventListener("click", function(e) {\n' +
    '          e.preventDefault();\n' +
    '          showLocationDetail(location.id);\n' +
    '        });\n' +
    '        \n' +
    '        popupContent.appendChild(popupTitle);\n' +
    '        popupContent.appendChild(popupLink);\n' +
    '        \n' +
    '        marker.bindPopup(popupContent);\n' +
    '        \n' +
    '        // Radius um den Marker zeichnen (50km)\n' +
    '        const circle = L.circle([location.latitude, location.longitude], {\n' +
    '          color: "#f59a0c",\n' +
    '          fillColor: "#f59a0c",\n' +
    '          fillOpacity: 0.2,\n' +
    '          radius: 50000  // 50km in Metern\n' +
    '        }).addTo(map);\n' +
    '        \n' +
    '        // Circle zum Marker hinzufügen\n' +
    '        marker.circle = circle;\n' +
    '        \n' +
    '        // Marker speichern\n' +
    '        markers[location.id] = marker;\n' +
    '      });\n' +
    '    }\n' +
    '    \n' +
    '    function showLocationDetail(id) {\n' +
    '      const location = locations.find(function(loc) {\n' +
    '        return loc.id == id;\n' +
    '      });\n' +
    '      if (!location) return;\n' +
    '      \n' +
    '      activeLocationId = id;\n' +
    '      detailTitle.textContent = location.title || "Unbenannter Ort";\n' +
    '      detailImage.src = "/uploads/couple.jpg"; // Standardbild verwenden\n' +
    '      detailCoords.textContent = "Koordinaten: " + parseFloat(location.latitude).toFixed(6) + ", " + parseFloat(location.longitude).toFixed(6);\n' +
    '      detailDescription.textContent = location.description || "Keine Beschreibung vorhanden.";\n' +
    '      \n' +
    '      locationDetail.style.display = "block";\n' +
    '      \n' +
    '      // Karte auf den Marker zentrieren\n' +
    '      map.setView([location.latitude, location.longitude], 10);\n' +
    '      \n' +
    '      // Marker hervorheben\n' +
    '      if (markers[id]) {\n' +
    '        markers[id].openPopup();\n' +
    '      }\n' +
    '    }\n' +
    '    \n' +
    '    function closeLocationDetail() {\n' +
    '      locationDetail.style.display = "none";\n' +
    '      activeLocationId = null;\n' +
    '    }\n' +
    '    \n' +
    '    function startAddLocation() {\n' +
    '      if (!editMode) {\n' +
    '        toggleEditMode();\n' +
    '      }\n' +
    '      \n' +
    '      showTooltip("Klicke auf die Karte, um einen Ort zu markieren");\n' +
    '      \n' +
    '      // Schließe die Sidebar, um bessere Kartenansicht zu haben\n' +
    '      sidebar.classList.remove("open");\n' +
    '    }\n' +
    '    \n' +
    '    function toggleEditMode() {\n' +
    '      editMode = !editMode;\n' +
    '      \n' +
    '      // Button-Text und Farbe ändern\n' +
    '      toggleEditModeBtn.textContent = editMode ? "Beenden" : "Bearbeiten";\n' +
    '      toggleEditModeBtn.classList.toggle("active", editMode);\n' +
    '      \n' +
    '      if (editMode) {\n' +
    '        map.on("click", handleMapClick);\n' +
    '        showTooltip("Bearbeitungsmodus aktiviert - Klicke auf die Karte, um einen Ort hinzuzufügen");\n' +
    '      } else {\n' +
    '        map.off("click", handleMapClick);\n' +
    '        if (tempMarker) {\n' +
    '          map.removeLayer(tempMarker);\n' +
    '          tempMarker = null;\n' +
    '        }\n' +
    '        locationForm.style.display = "none";\n' +
    '        hideTooltip();\n' +
    '      }\n' +
    '    }\n' +
    '    \n' +
    '    function handleMapClick(e) {\n' +
    '      if (!editMode) return;\n' +
    '      \n' +
    '      const latlng = e.latlng;\n' +
    '      \n' +
    '      // Wenn bereits ein temporärer Marker existiert, entferne ihn\n' +
    '      if (tempMarker) {\n' +
    '        map.removeLayer(tempMarker);\n' +
    '      }\n' +
    '      \n' +
    '      // Neuen temporären Marker setzen\n' +
    '      tempMarker = L.marker(latlng).addTo(map);\n' +
    '      \n' +
    '      // Formular anzeigen und mit Koordinaten füllen\n' +
    '      document.getElementById("locationLat").value = latlng.lat;\n' +
    '      document.getElementById("locationLng").value = latlng.lng;\n' +
    '      locationForm.style.display = "block";\n' +
    '      hideTooltip();\n' +
    '    }\n' +
    '    \n' +
    '    function cancelAddLocation() {\n' +
    '      locationForm.style.display = "none";\n' +
    '      \n' +
    '      if (tempMarker) {\n' +
    '        map.removeLayer(tempMarker);\n' +
    '        tempMarker = null;\n' +
    '      }\n' +
    '    }\n' +
    '    \n' +
    '    function handleFormSubmit(e) {\n' +
    '      e.preventDefault();\n' +
    '      \n' +
    '      const formData = new FormData(locationForm);\n' +
    '      \n' +
    '      fetch("/api/locations", {\n' +
    '        method: "POST",\n' +
    '        body: formData\n' +
    '      })\n' +
    '        .then(function(response) {\n' +
    '          return response.json();\n' +
    '        })\n' +
    '        .then(function(data) {\n' +
    '          if (data.error) {\n' +
    '            alert("Fehler: " + data.error);\n' +
    '            return;\n' +
    '          }\n' +
    '          \n' +
    '          // Formular zurücksetzen und ausblenden\n' +
    '          locationForm.reset();\n' +
    '          locationForm.style.display = "none";\n' +
    '          \n' +
    '          // Temporären Marker entfernen\n' +
    '          if (tempMarker) {\n' +
    '            map.removeLayer(tempMarker);\n' +
    '            tempMarker = null;\n' +
    '          }\n' +
    '          \n' +
    '          // Liste der Orte neu laden\n' +
    '          loadLocations();\n' +
    '        })\n' +
    '        .catch(function(error) {\n' +
    '          console.error("Fehler beim Speichern des Ortes:", error);\n' +
    '          alert("Fehler beim Speichern: " + error.message);\n' +
    '        });\n' +
    '    }\n' +
    '    \n' +
    '    function deleteActiveLocation() {\n' +
    '      if (!activeLocationId) return;\n' +
    '      \n' +
    '      if (!confirm("Möchtest du diesen Ort wirklich löschen?")) {\n' +
    '        return;\n' +
    '      }\n' +
    '      \n' +
    '      fetch("/api/locations/" + activeLocationId + "?sessionId=" + sessionId, {\n' +
    '        method: "DELETE"\n' +
    '      })\n' +
    '        .then(function(response) {\n' +
    '          return response.json();\n' +
    '        })\n' +
    '        .then(function(data) {\n' +
    '          if (data.error) {\n' +
    '            alert("Fehler: " + data.error);\n' +
    '            return;\n' +
    '          }\n' +
    '          \n' +
    '          // Location Detail schließen\n' +
    '          closeLocationDetail();\n' +
    '          \n' +
    '          // Liste der Orte neu laden\n' +
    '          loadLocations();\n' +
    '        })\n' +
    '        .catch(function(error) {\n' +
    '          console.error("Fehler beim Löschen des Ortes:", error);\n' +
    '          alert("Fehler beim Löschen: " + error.message);\n' +
    '        });\n' +
    '    }\n' +
    '    \n' +
    '    function logout() {\n' +
    '      if (confirm("Möchtest du dich wirklich abmelden?")) {\n' +
    '        window.location.href = "/logout?sessionId=" + sessionId;\n' +
    '      }\n' +
    '    }\n' +
    '    \n' +
    '    function showTooltip(text) {\n' +
    '      tooltip.textContent = text;\n' +
    '      tooltip.style.display = "block";\n' +
    '      \n' +
    '      document.addEventListener("mousemove", moveTooltip);\n' +
    '      \n' +
    '      // Tooltip nach 5 Sekunden ausblenden\n' +
    '      setTimeout(hideTooltip, 5000);\n' +
    '    }\n' +
    '    \n' +
    '    function moveTooltip(e) {\n' +
    '      tooltip.style.left = (e.pageX + 10) + "px";\n' +
    '      tooltip.style.top = (e.pageY + 10) + "px";\n' +
    '    }\n' +
    '    \n' +
    '    function hideTooltip() {\n' +
    '      tooltip.style.display = "none";\n' +
    '      document.removeEventListener("mousemove", moveTooltip);\n' +
    '    }\n' +
    '  </script>\n' +
    '</body>\n' +
    '</html>';
  
  res.send(mapHtml);
});

// Storage für das hochgeladene Bild konfigurieren
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB Limit
});

// API-Endpunkte

// Alle Orte abrufen
app.get('/api/locations', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, title, latitude, longitude, description FROM locations ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Orte:', error);
    
    // Zweiter Versuch mit name statt title
    try {
      const result = await pool.query('SELECT id, name AS title, latitude, longitude, description FROM locations ORDER BY created_at DESC');
      res.json(result.rows);
    } catch (error2) {
      console.error('Fehler beim zweiten Versuch:', error2);
      res.status(500).json({ error: 'Fehler beim Abrufen der Orte' });
    }
  }
});

// Neuen Ort hinzufügen
app.post('/api/locations', upload.single('image'), async (req, res) => {
  try {
    // Prüfe, ob ein Bild hochgeladen wurde
    if (!req.file) {
      return res.status(400).json({ error: 'Kein Bild hochgeladen' });
    }
    
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
    
    // Verarbeite das Bild und erstelle ein Thumbnail
    const imageBuffer = req.file.buffer;
    const imageType = req.file.mimetype;
    const thumbnailBuffer = await createThumbnail(imageBuffer);
    
    // Versuche Ort zur Datenbank hinzuzufügen, erst mit title-Spalte
    try {
      const result = await pool.query(
        'INSERT INTO locations (title, latitude, longitude, description, image_data, image_type, thumbnail_data) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [title, latitude, longitude, description, imageBuffer, imageType, thumbnailBuffer]
      );
      
      res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
      // Wenn das nicht funktioniert, versuche es mit name-Spalte
      console.error('Erster Einfügeversuch fehlgeschlagen:', error);
      
      try {
        const result = await pool.query(
          'INSERT INTO locations (name, latitude, longitude, description, image_data, image_type, thumbnail_data) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
          [title, latitude, longitude, description, imageBuffer, imageType, thumbnailBuffer]
        );
        
        res.json({ success: true, id: result.rows[0].id });
      } catch (error2) {
        console.error('Zweiter Einfügeversuch fehlgeschlagen:', error2);
        res.status(500).json({ error: 'Konnte Ort nicht speichern. Bitte prüfe die Datenbankstruktur im Admin-Bereich.' });
      }
    }
  } catch (error) {
    console.error('Fehler beim Hinzufügen des Ortes:', error);
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
initializeDatabase().then(isConnected => {
  console.log('Datenbankverbindung Status:', isConnected);
  
  app.listen(PORT, () => {
    console.log('Server laeuft auf Port ' + PORT);
  });
}).catch(error => {
  console.error('Fehler beim Starten des Servers:', error);
});
EOF

# 6. package.json erstellen
echo "Erstelle package.json..."
cat > dist/package.json << EOF
{
  "name": "susibert-travel-map",
  "version": "1.0.0",
  "private": true,
  "engines": {
    "node": ">=14"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.33.1",
    "fs-extra": "^11.2.0"
  },
  "scripts": {
    "start": "node index.js"
  }
}
EOF

echo "=== Fix-Column Build abgeschlossen ==="