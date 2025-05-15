#!/bin/bash

# Alles-in-einem Build-Script für Render
set -ex

echo "=== Komplettes Build-Script für Render ==="

# 1. Pakete installieren
echo "Installiere benötigte Pakete..."
npm install express pg multer sharp fs-extra

# 2. Verzeichnisse erstellen
echo "Erstelle Verzeichnisstruktur..."
mkdir -p dist/uploads
mkdir -p dist/public/uploads

# 3. Server-Code erstellen (alles in einer Datei)
echo "Erstelle Server-Code..."
cat > dist/index.js << 'EOF'
// Einfacher Server für Render ohne Template-Strings
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
app.use('/uploads', express.static('uploads'));
app.use('/public', express.static('public'));
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
    
    if (!tableExists) {
      await createTables();
      console.log('Tabellen erstellt');
    } else {
      // Tabelle existiert, stellen wir sicher, dass alle Spalten vorhanden sind
      await ensureColumns();
    }
    
    return true;
  } catch (error) {
    console.error('Fehler bei der Datenbankverbindung:', error.message);
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

// Stelle sicher, dass alle benötigten Spalten existieren
async function ensureColumns() {
  try {
    console.log('Prüfe und aktualisiere Spaltenstruktur...');
    
    // Liste aller benötigten Spalten und ihrer Definitionen
    const requiredColumns = [
      { name: 'id', definition: 'SERIAL PRIMARY KEY' },
      { name: 'title', definition: 'VARCHAR(255)' },
      { name: 'latitude', definition: 'DECIMAL(10, 8)' },
      { name: 'longitude', definition: 'DECIMAL(11, 8)' },
      { name: 'description', definition: 'TEXT' },
      { name: 'image_data', definition: 'BYTEA' },
      { name: 'image_type', definition: 'VARCHAR(50)' },
      { name: 'thumbnail_data', definition: 'BYTEA' },
      { name: 'created_at', definition: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
    ];
    
    // Prüfen, welche Spalten bereits existieren
    const columnsResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'locations'
    `);
    
    const existingColumns = columnsResult.rows.map(row => row.column_name);
    console.log('Vorhandene Spalten:', existingColumns);
    
    // Füge fehlende Spalten hinzu
    for (const column of requiredColumns) {
      if (!existingColumns.includes(column.name)) {
        try {
          console.log(`Füge fehlende Spalte hinzu: ${column.name}`);
          await pool.query(`ALTER TABLE locations ADD COLUMN ${column.name} ${column.definition}`);
        } catch (columnError) {
          console.error(`Fehler beim Hinzufügen der Spalte ${column.name}:`, columnError);
        }
      }
    }
    
    console.log('Spaltenstruktur aktualisiert');
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Spalten:', error);
  }
}

// Tabellen erstellen, falls sie nicht existieren
async function createTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        description TEXT,
        image_data BYTEA,
        image_type VARCHAR(50),
        thumbnail_data BYTEA,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return true;
  } catch (error) {
    console.error('Fehler beim Erstellen der Tabellen:', error);
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

// Ort löschen
async function deleteLocation(id, res, redirectUrl = null) {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    await pool.query('DELETE FROM locations WHERE id = $1', [id]);
    console.log('Ort mit ID ' + id + ' wurde gelöscht');
    
    if (redirectUrl) {
      res.redirect(redirectUrl);
    } else {
      res.json({ success: true, message: 'Ort erfolgreich gelöscht' });
    }
  } catch (error) {
    console.error('Fehler beim Löschen des Ortes:', error);
    
    if (redirectUrl) {
      res.redirect(redirectUrl + '?error=Fehler beim Löschen des Ortes: ' + error.message);
    } else {
      res.status(500).json({ error: error.message });
    }
  }
}

// Prüfen und ggf. generieren von Thumbnails für bestehende Orte
async function ensureThumbnailExists(id, imageData, imageType) {
  try {
    // Prüfen, ob bereits ein Thumbnail existiert
    const thumbResult = await pool.query('SELECT thumbnail_data FROM locations WHERE id = $1', [id]);
    
    if (thumbResult.rows.length > 0 && thumbResult.rows[0].thumbnail_data) {
      // Thumbnail existiert bereits
      return;
    }
    
    if (!imageData) {
      console.log('Kein Bild für Ort ' + id + ' vorhanden, kann kein Thumbnail generieren.');
      return;
    }
    
    // Thumbnail mit Sharp generieren
    const thumbnailBuffer = await sharp(imageData)
      .resize(60, 60, { fit: 'cover' })
      .toBuffer();
    
    // Thumbnail in der Datenbank speichern
    await pool.query('UPDATE locations SET thumbnail_data = $1 WHERE id = $2', [thumbnailBuffer, id]);
    console.log('Thumbnail für Ort ' + id + ' nachträglich generiert.');
  } catch (error) {
    console.error('Fehler beim Generieren des Thumbnails für Ort ' + id + ':', error);
  }
}

// Funktion zum Generieren von Thumbnails für alle bestehenden Orte ohne Thumbnails
async function generateAllMissingThumbnails() {
  try {
    if (!dbConnected) {
      console.log('Datenbank nicht verbunden, überspringe Thumbnail-Generierung');
      return;
    }
    
    console.log('Prüfe auf fehlende Thumbnails für bestehende Orte...');
    
    // Prüfe erst, ob die Spalten existieren, um Fehler zu vermeiden
    // Teste diese Abfrage sicher
    try {
      // Hole alle Orte, die ein Bild aber kein Thumbnail haben
      const result = await pool.query(
        'SELECT id, image_data, image_type FROM locations WHERE image_data IS NOT NULL AND thumbnail_data IS NULL'
      );
      
      if (result.rows.length === 0) {
        console.log('Alle Orte haben bereits Thumbnails');
        return;
      }
      
      console.log(result.rows.length + ' Orte ohne Thumbnails gefunden, generiere Thumbnails...');
      
      // Generiere Thumbnails für jeden Ort
      for (const location of result.rows) {
        await ensureThumbnailExists(location.id, location.image_data, location.image_type);
      }
      
      console.log('Alle fehlenden Thumbnails wurden generiert');
    } catch (queryError) {
      console.error('SQL-Fehler beim Abfragen fehlender Thumbnails, möglicherweise fehlen Spalten:', queryError);
    }
  } catch (error) {
    console.error('Fehler beim Generieren der Thumbnails:', error);
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
app.get('/admin', requireAuth, function(req, res) {
  const sessionId = req.query.sessionId;
  
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
    '    .warning {\n' +
    '      background-color: rgba(229, 57, 53, 0.2);\n' +
    '      border: 1px solid #e53935;\n' +
    '      padding: 15px;\n' +
    '      border-radius: 6px;\n' +
    '      margin-bottom: 20px;\n' +
    '    }\n' +
    '    \n' +
    '    .admin-button {\n' +
    '      background-color: #e53935;\n' +
    '      color: white;\n' +
    '      border: none;\n' +
    '      padding: 10px 15px;\n' +
    '      border-radius: 4px;\n' +
    '      cursor: pointer;\n' +
    '      font-weight: bold;\n' +
    '      margin-right: 10px;\n' +
    '    }\n' +
    '    \n' +
    '    .admin-button.green {\n' +
    '      background-color: #4caf50;\n' +
    '    }\n' +
    '    \n' +
    '    .admin-button.orange {\n' +
    '      background-color: #f59a0c;\n' +
    '      color: black;\n' +
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
    '    .action-result {\n' +
    '      display: none;\n' +
    '      margin-top: 15px;\n' +
    '      padding: 10px;\n' +
    '      border-radius: 4px;\n' +
    '    }\n' +
    '    \n' +
    '    .action-result.success {\n' +
    '      background-color: rgba(76, 175, 80, 0.2);\n' +
    '      border: 1px solid #4caf50;\n' +
    '    }\n' +
    '    \n' +
    '    .action-result.error {\n' +
    '      background-color: rgba(229, 57, 53, 0.2);\n' +
    '      border: 1px solid #e53935;\n' +
    '    }\n' +
    '    \n' +
    '    .hamburger-menu {\n' +
    '      display: none;\n' +
    '    }\n' +
    '    \n' +
    '    @media (max-width: 768px) {\n' +
    '      .content {\n' +
    '        padding: 20px;\n' +
    '      }\n' +
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
    '      <h2 class="section-title">Datenbank zurücksetzen</h2>\n' +
    '      <div class="warning">\n' +
    '        <strong>Warnung:</strong> Diese Aktion löscht alle Orte und Bilder aus der Datenbank. Dieser Vorgang kann nicht rückgängig gemacht werden!\n' +
    '      </div>\n' +
    '      <button id="resetDbBtn" class="admin-button">Datenbank zurücksetzen</button>\n' +
    '      <div id="resetResult" class="action-result"></div>\n' +
    '    </div>\n' +
    '    \n' +
    '    <div class="admin-section">\n' +
    '      <h2 class="section-title">Thumbnails neu generieren</h2>\n' +
    '      <p>Wenn Thumbnails für Orte fehlen, können diese mit dieser Funktion neu generiert werden.</p>\n' +
    '      <button id="generateThumbsBtn" class="admin-button green">Thumbnails generieren</button>\n' +
    '      <div id="thumbsResult" class="action-result"></div>\n' +
    '    </div>\n' +
    '    \n' +
    '    <a href="/map?sessionId=' + sessionId + '" class="back-link">← Zurück zur Karte</a>\n' +
    '  </div>\n' +
    '  \n' +
    '  <script>\n' +
    '    // Datenbank zurücksetzen mit dreifacher Bestätigung\n' +
    '    document.getElementById("resetDbBtn").addEventListener("click", function() {\n' +
    '      // Erste Bestätigung\n' +
    '      if (!confirm("Bist du sicher, dass du die Datenbank zurücksetzen möchtest? Dies löscht ALLE Orte!")) {\n' +
    '        return;\n' +
    '      }\n' +
    '      \n' +
    '      // Zweite Bestätigung\n' +
    '      if (!confirm("Wirklich sicher? Diese Aktion kann NICHT rückgängig gemacht werden!")) {\n' +
    '        return;\n' +
    '      }\n' +
    '      \n' +
    '      // Dritte Bestätigung\n' +
    '      if (!confirm("LETZTE WARNUNG: Alle Daten werden gelöscht. Fortfahren?")) {\n' +
    '        return;\n' +
    '      }\n' +
    '      \n' +
    '      fetch("/api/admin/reset-database?sessionId=' + sessionId + '", {\n' +
    '        method: "POST"\n' +
    '      })\n' +
    '        .then(response => response.json())\n' +
    '        .then(data => {\n' +
    '          const resultElement = document.getElementById("resetResult");\n' +
    '          \n' +
    '          if (data.success) {\n' +
    '            resultElement.textContent = "Datenbank erfolgreich zurückgesetzt.";\n' +
    '            resultElement.className = "action-result success";\n' +
    '          } else {\n' +
    '            resultElement.textContent = "Fehler: " + data.error;\n' +
    '            resultElement.className = "action-result error";\n' +
    '          }\n' +
    '          \n' +
    '          resultElement.style.display = "block";\n' +
    '        })\n' +
    '        .catch(error => {\n' +
    '          const resultElement = document.getElementById("resetResult");\n' +
    '          resultElement.textContent = "Fehler: " + error.message;\n' +
    '          resultElement.className = "action-result error";\n' +
    '          resultElement.style.display = "block";\n' +
    '        });\n' +
    '    });\n' +
    '    \n' +
    '    // Thumbnails generieren\n' +
    '    document.getElementById("generateThumbsBtn").addEventListener("click", function() {\n' +
    '      fetch("/api/admin/generate-thumbnails?sessionId=' + sessionId + '", {\n' +
    '        method: "POST"\n' +
    '      })\n' +
    '        .then(response => response.json())\n' +
    '        .then(data => {\n' +
    '          const resultElement = document.getElementById("thumbsResult");\n' +
    '          \n' +
    '          if (data.success) {\n' +
    '            resultElement.textContent = "Thumbnails wurden erfolgreich generiert.";\n' +
    '            resultElement.className = "action-result success";\n' +
    '          } else {\n' +
    '            resultElement.textContent = "Fehler: " + data.error;\n' +
    '            resultElement.className = "action-result error";\n' +
    '          }\n' +
    '          \n' +
    '          resultElement.style.display = "block";\n' +
    '        })\n' +
    '        .catch(error => {\n' +
    '          const resultElement = document.getElementById("thumbsResult");\n' +
    '          resultElement.textContent = "Fehler: " + error.message;\n' +
    '          resultElement.className = "action-result error";\n' +
    '          resultElement.style.display = "block";\n' +
    '        });\n' +
    '    });\n' +
    '  </script>\n' +
    '</body>\n' +
    '</html>';
  
  res.send(adminHtml);
});

// Geschützte Kartenansicht mit Leaflet
app.get('/map', requireAuth, function(req, res) {
  // Prüfe, ob die Datenbankverbindung aktiv ist
  if (!dbConnected) {
    const errorHtml = '<!DOCTYPE html>\n' +
      '<html lang="de">\n' +
      '<head>\n' +
      '  <meta charset="UTF-8">\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '  <title>Susibert - Datenbankfehler</title>\n' +
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
      '    .error-container {\n' +
      '      flex: 1;\n' +
      '      display: flex;\n' +
      '      flex-direction: column;\n' +
      '      justify-content: center;\n' +
      '      align-items: center;\n' +
      '      padding: 2rem;\n' +
      '      text-align: center;\n' +
      '    }\n' +
      '    \n' +
      '    .error-message {\n' +
      '      background-color: #ff5252;\n' +
      '      color: white;\n' +
      '      padding: 1rem 2rem;\n' +
      '      border-radius: 8px;\n' +
      '      margin-bottom: 2rem;\n' +
      '      max-width: 600px;\n' +
      '    }\n' +
      '    \n' +
      '    .btn {\n' +
      '      background-color: #f59a0c;\n' +
      '      color: black;\n' +
      '      border: none;\n' +
      '      padding: 10px 20px;\n' +
      '      border-radius: 4px;\n' +
      '      font-size: 1rem;\n' +
      '      cursor: pointer;\n' +
      '      text-decoration: none;\n' +
      '      margin-top: 1rem;\n' +
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
      '  <div class="error-container">\n' +
      '    <div class="error-message">\n' +
      '      <h2>Datenbankverbindung nicht verfügbar</h2>\n' +
      '      <p>Die Verbindung zur Datenbank konnte nicht hergestellt werden. Bitte versuche es später erneut.</p>\n' +
      '    </div>\n' +
      '    <a href="/" class="btn">Zurück zur Anmeldung</a>\n' +
      '  </div>\n' +
      '</body>\n' +
      '</html>';
    
    return res.send(errorHtml);
  }

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
    '      display: flex;\n' +
    '      flex: 1;\n' +
    '      overflow: hidden;\n' +
    '    }\n' +
    '    \n' +
    '    .sidebar {\n' +
    '      width: 300px;\n' +
    '      background-color: #222;\n' +
    '      border-right: 1px solid #333;\n' +
    '      overflow-y: auto;\n' +
    '      display: flex;\n' +
    '      flex-direction: column;\n' +
    '      transition: transform 0.3s;\n' +
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
    '      display: flex;\n' +
    '      justify-content: space-between;\n' +
    '      flex-wrap: wrap;\n' +
    '      gap: 8px;\n' +
    '    }\n' +
    '    \n' +
    '    .add-button, .mode-toggle, .logout-button, .admin-button {\n' +
    '      background-color: #f59a0c;\n' +
    '      color: black;\n' +
    '      border: none;\n' +
    '      padding: 8px 12px;\n' +
    '      border-radius: 4px;\n' +
    '      cursor: pointer;\n' +
    '      font-weight: bold;\n' +
    '      transition: background-color 0.2s;\n' +
    '      flex: 1;\n' +
    '      text-align: center;\n' +
    '      white-space: nowrap;\n' +
    '    }\n' +
    '    \n' +
    '    .add-button:hover, .mode-toggle:hover, .logout-button:hover, .admin-button:hover {\n' +
    '      background-color: #e08a00;\n' +
    '    }\n' +
    '    \n' +
    '    .admin-button {\n' +
    '      display: inline-block;\n' +
    '      text-decoration: none;\n' +
    '    }\n' +
    '    \n' +
    '    .map-container {\n' +
    '      flex: 1;\n' +
    '      position: relative;\n' +
    '      overflow: hidden;\n' +
    '    }\n' +
    '    \n' +
    '    #map {\n' +
    '      height: 100%;\n' +
    '      width: 100%;\n' +
    '      background-color: #333;\n' +
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
    '    .hamburger-menu {\n' +
    '      cursor: pointer;\n' +
    '      background: none;\n' +
    '      border: none;\n' +
    '      color: #f59a0c;\n' +
    '      font-size: 1.5rem;\n' +
    '    }\n' +
    '    \n' +
    '    .main-menu {\n' +
    '      position: fixed;\n' +
    '      top: 0;\n' +
    '      right: 0;\n' +
    '      width: 280px;\n' +
    '      height: 100vh;\n' +
    '      background-color: #222;\n' +
    '      z-index: 2000;\n' +
    '      transform: translateX(100%);\n' +
    '      transition: transform 0.3s ease;\n' +
    '      box-shadow: -5px 0 15px rgba(0, 0, 0, 0.3);\n' +
    '      display: flex;\n' +
    '      flex-direction: column;\n' +
    '    }\n' +
    '    \n' +
    '    .main-menu.open {\n' +
    '      transform: translateX(0);\n' +
    '    }\n' +
    '    \n' +
    '    .menu-header {\n' +
    '      display: flex;\n' +
    '      justify-content: space-between;\n' +
    '      align-items: center;\n' +
    '      padding: 20px;\n' +
    '      border-bottom: 1px solid #333;\n' +
    '    }\n' +
    '    \n' +
    '    .menu-header h3 {\n' +
    '      margin: 0;\n' +
    '      color: #f59a0c;\n' +
    '    }\n' +
    '    \n' +
    '    .menu-close {\n' +
    '      background: none;\n' +
    '      border: none;\n' +
    '      color: #aaa;\n' +
    '      font-size: 1.5rem;\n' +
    '      cursor: pointer;\n' +
    '    }\n' +
    '    \n' +
    '    .menu-items {\n' +
    '      display: flex;\n' +
    '      flex-direction: column;\n' +
    '      padding: 10px 0;\n' +
    '    }\n' +
    '    \n' +
    '    .menu-item {\n' +
    '      display: flex;\n' +
    '      align-items: center;\n' +
    '      padding: 15px 20px;\n' +
    '      color: #f5f5f5;\n' +
    '      text-decoration: none;\n' +
    '      border-bottom: 1px solid #333;\n' +
    '    }\n' +
    '    \n' +
    '    .menu-item:hover {\n' +
    '      background-color: #333;\n' +
    '    }\n' +
    '    \n' +
    '    .menu-icon {\n' +
    '      margin-right: 15px;\n' +
    '      font-size: 1.2rem;\n' +
    '    }\n' +
    '    \n' +
    '    .location-form {\n' +
    '      position: absolute;\n' +
    '      top: 20px;\n' +
    '      left: 50%;\n' +
    '      transform: translateX(-50%);\n' +
    '      width: 320px;\n' +
    '      background-color: rgba(34, 34, 34, 0.95);\n' +
    '      border-radius: 8px;\n' +
    '      padding: 20px;\n' +
    '      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);\n' +
    '      z-index: 1000;\n' +
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
    '      .sidebar {\n' +
    '        position: absolute;\n' +
    '        height: calc(100% - 71px);\n' +
    '        transform: translateX(-100%);\n' +
    '        z-index: 1000;\n' +
    '      }\n' +
    '      \n' +
    '      .sidebar.open {\n' +
    '        transform: translateX(0);\n' +
    '      }\n' +
    '      \n' +
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
    '    <button class="hamburger-menu" id="menuToggleBtn">☰</button>\n' +
    '  </div>\n' +
    '  \n' +
    '  <!-- Hauptmenü (Mobile) -->\n' +
    '  <div class="main-menu" id="mainMenu">\n' +
    '    <div class="menu-header">\n' +
    '      <h3>Menü</h3>\n' +
    '      <button class="menu-close" id="menuCloseBtn">&times;</button>\n' +
    '    </div>\n' +
    '    <div class="menu-items">\n' +
    '      <a href="#" id="addLocationMenuBtn" class="menu-item">\n' +
    '        <span class="menu-icon">➕</span>\n' +
    '        <span class="menu-text">Ort hinzufügen</span>\n' +
    '      </a>\n' +
    '      <a href="#" id="editModeMenuBtn" class="menu-item">\n' +
    '        <span class="menu-icon">✏️</span>\n' +
    '        <span class="menu-text">Bearbeitungsmodus</span>\n' +
    '      </a>\n' +
    '      <a href="/admin?sessionId=' + sessionId + '" class="menu-item">\n' +
    '        <span class="menu-icon">🔧</span>\n' +
    '        <span class="menu-text">Admin-Bereich</span>\n' +
    '      </a>\n' +
    '      <a href="#" id="logoutMenuBtn" class="menu-item">\n' +
    '        <span class="menu-icon">🚪</span>\n' +
    '        <span class="menu-text">Abmelden</span>\n' +
    '      </a>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '  \n' +
    '  <div class="content">\n' +
    '    <div class="sidebar">\n' +
    '      <div class="sidebar-header">\n' +
    '        <h2 class="sidebar-title">Besuchte Orte</h2>\n' +
    '      </div>\n' +
    '      <div class="locations-list" id="locationsList">\n' +
    '        <!-- Hier werden die Orte dynamisch eingefügt -->\n' +
    '      </div>\n' +
    '      <div class="sidebar-footer">\n' +
    '        <button class="add-button" id="addLocationBtn">Ort hinzufügen</button>\n' +
    '        <button class="mode-toggle" id="toggleEditMode">Bearbeiten</button>\n' +
    '        <a href="/admin?sessionId=' + sessionId + '" class="admin-button">Admin</a>\n' +
    '        <button class="logout-button" id="logoutBtn">Abmelden</button>\n' +
    '      </div>\n' +
    '    </div>\n' +
    '    \n' +
    '    <div class="map-container">\n' +
    '      <div id="map"></div>\n' +
    '      \n' +
    '      <div class="location-detail" id="locationDetail">\n' +
    '        <div class="detail-header">\n' +
    '          <h3 class="detail-title" id="detailTitle"></h3>\n' +
    '          <button class="detail-close" id="detailClose">&times;</button>\n' +
    '        </div>\n' +
    '        <img class="detail-image" id="detailImage" src="" alt="Ortsbild">\n' +
    '        <div class="detail-coords" id="detailCoords"></div>\n' +
    '        <div class="detail-description" id="detailDescription"></div>\n' +
    '        <div class="detail-actions">\n' +
    '          <button class="detail-delete" id="detailDelete">Löschen</button>\n' +
    '        </div>\n' +
    '      </div>\n' +
    '      \n' +
    '      <form class="location-form" id="locationForm" enctype="multipart/form-data">\n' +
    '        <h3 class="form-title">Neuen Ort hinzufügen</h3>\n' +
    '        \n' +
    '        <div class="form-group">\n' +
    '          <label class="form-label" for="locationTitle">Titel*</label>\n' +
    '          <input type="text" class="form-input" id="locationTitle" name="title" required>\n' +
    '        </div>\n' +
    '        \n' +
    '        <div class="form-coords">\n' +
    '          <div class="form-group">\n' +
    '            <label class="form-label" for="locationLat">Breitengrad</label>\n' +
    '            <input type="number" step="0.000001" class="form-input" id="locationLat" name="latitude" readonly>\n' +
    '          </div>\n' +
    '          <div class="form-group">\n' +
    '            <label class="form-label" for="locationLng">Längengrad</label>\n' +
    '            <input type="number" step="0.000001" class="form-input" id="locationLng" name="longitude" readonly>\n' +
    '          </div>\n' +
    '        </div>\n' +
    '        \n' +
    '        <div class="form-group">\n' +
    '          <label class="form-label" for="locationDescription">Beschreibung</label>\n' +
    '          <textarea class="form-textarea" id="locationDescription" name="description"></textarea>\n' +
    '        </div>\n' +
    '        \n' +
    '        <div class="form-group">\n' +
    '          <label class="form-label" for="locationImage">Bild*</label>\n' +
    '          <input type="file" class="form-input" id="locationImage" name="image" accept="image/*" required>\n' +
    '        </div>\n' +
    '        \n' +
    '        <input type="hidden" id="sessionIdInput" name="sessionId" value="' + sessionId + '">\n' +
    '        \n' +
    '        <div class="form-actions">\n' +
    '          <button type="button" class="form-cancel" id="formCancel">Abbrechen</button>\n' +
    '          <button type="submit" class="form-submit">Speichern</button>\n' +
    '        </div>\n' +
    '      </form>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '\n' +
    '  <div class="tooltip" id="tooltip" style="display: none;"></div>\n' +
    '  \n' +
    '  <script>\n' +
    '    // Parameter aus der URL lesen\n' +
    '    const params = new URLSearchParams(window.location.search);\n' +
    '    const sessionId = params.get("sessionId");\n' +
    '    \n' +
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
    '    const addLocationMenuBtn = document.getElementById("addLocationMenuBtn");\n' +
    '    const toggleEditModeBtn = document.getElementById("toggleEditMode");\n' +
    '    const editModeMenuBtn = document.getElementById("editModeMenuBtn");\n' +
    '    const logoutBtn = document.getElementById("logoutBtn");\n' +
    '    const logoutMenuBtn = document.getElementById("logoutMenuBtn");\n' +
    '    const locationForm = document.getElementById("locationForm");\n' +
    '    const formCancel = document.getElementById("formCancel");\n' +
    '    const menuToggleBtn = document.getElementById("menuToggleBtn");\n' +
    '    const menuCloseBtn = document.getElementById("menuCloseBtn");\n' +
    '    const mainMenu = document.getElementById("mainMenu");\n' +
    '    const sidebar = document.querySelector(".sidebar");\n' +
    '    const tooltip = document.getElementById("tooltip");\n' +
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
    '    // Menü-Funktionen\n' +
    '    function toggleMainMenu() {\n' +
    '      mainMenu.classList.toggle("open");\n' +
    '    }\n' +
    '    \n' +
    '    menuToggleBtn.addEventListener("click", toggleMainMenu);\n' +
    '    menuCloseBtn.addEventListener("click", toggleMainMenu);\n' +
    '    \n' +
    '    // Verknüpfung der Menü-Aktionen mit den Sidebar-Buttons\n' +
    '    addLocationMenuBtn.addEventListener("click", function() {\n' +
    '      toggleMainMenu(); // Menü schließen\n' +
    '      startAddLocation();\n' +
    '    });\n' +
    '    \n' +
    '    editModeMenuBtn.addEventListener("click", function() {\n' +
    '      toggleMainMenu(); // Menü schließen\n' +
    '      toggleEditMode();\n' +
    '    });\n' +
    '    \n' +
    '    logoutMenuBtn.addEventListener("click", function() {\n' +
    '      toggleMainMenu(); // Menü schließen\n' +
    '      logout();\n' +
    '    });\n' +
    '    \n' +
    '    // Eventlistener\n' +
    '    detailClose.addEventListener("click", closeLocationDetail);\n' +
    '    addLocationBtn.addEventListener("click", startAddLocation);\n' +
    '    formCancel.addEventListener("click", cancelAddLocation);\n' +
    '    toggleEditModeBtn.addEventListener("click", toggleEditMode);\n' +
    '    detailDelete.addEventListener("click", deleteActiveLocation);\n' +
    '    logoutBtn.addEventListener("click", logout);\n' +
    '    locationForm.addEventListener("submit", handleFormSubmit);\n' +
    '    \n' +
    '    // Initialisierung\n' +
    '    loadLocations();\n' +
    '    \n' +
    '    // Funktionen\n' +
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
    '        const thumbnail = document.createElement("img");\n' +
    '        thumbnail.className = "location-thumbnail";\n' +
    '        thumbnail.src = "/api/thumbnails/" + location.id + "?sessionId=" + sessionId;\n' +
    '        thumbnail.alt = location.title;\n' +
    '        thumbnail.onerror = function() {\n' +
    '          this.src = "/uploads/couple.jpg";\n' +
    '        };\n' +
    '        \n' +
    '        const info = document.createElement("div");\n' +
    '        info.className = "location-info";\n' +
    '        \n' +
    '        const title = document.createElement("div");\n' +
    '        title.className = "location-title";\n' +
    '        title.textContent = location.title;\n' +
    '        \n' +
    '        const coords = document.createElement("div");\n' +
    '        coords.className = "location-coords";\n' +
    '        coords.textContent = parseFloat(location.latitude).toFixed(4) + ", " + parseFloat(location.longitude).toFixed(4);\n' +
    '        \n' +
    '        info.appendChild(title);\n' +
    '        info.appendChild(coords);\n' +
    '        item.appendChild(thumbnail);\n' +
    '        item.appendChild(info);\n' +
    '        \n' +
    '        item.addEventListener("click", function() {\n' +
    '          showLocationDetail(location.id);\n' +
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
    '        popupTitle.textContent = location.title;\n' +
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
    '      detailTitle.textContent = location.title;\n' +
    '      detailImage.src = "/api/images/" + id + "?sessionId=" + sessionId;\n' +
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
    '      \n' +
    '      // Bei mobilen Geräten das Seitenmenü schließen\n' +
    '      if (window.innerWidth <= 768) {\n' +
    '        sidebar.classList.remove("open");\n' +
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
    '    }\n' +
    '    \n' +
    '    function toggleEditMode() {\n' +
    '      editMode = !editMode;\n' +
    '      toggleEditModeBtn.textContent = editMode ? "Beenden" : "Bearbeiten";\n' +
    '      toggleEditModeBtn.style.backgroundColor = editMode ? "#e53935" : "#f59a0c";\n' +
    '      \n' +
    '      // Auch für den Menü-Button aktualisieren\n' +
    '      editModeMenuBtn.querySelector(".menu-text").textContent = editMode ? "Bearbeitungsmodus beenden" : "Bearbeitungsmodus";\n' +
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
    '    function toggleSidebar() {\n' +
    '      sidebar.classList.toggle("open");\n' +
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
    '    \n' +
    '    // Bei kleinen Bildschirmen den Hamburger-Button aktivieren\n' +
    '    if (window.innerWidth <= 768) {\n' +
    '      document.querySelector(".hamburger-menu").addEventListener("click", function() {\n' +
    '        sidebar.classList.toggle("open");\n' +
    '      });\n' +
    '    }\n' +
    '  </script>\n' +
    '</body>\n' +
    '</html>';
  
  res.send(mapHtml);
});

// API-Endpunkte

// Thumbnail aus der Datenbank abrufen
app.get('/api/thumbnails/:id', async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    const id = req.params.id;
    const result = await pool.query('SELECT thumbnail_data, image_type FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0 || !result.rows[0].thumbnail_data) {
      // Fallback auf das Pärchenbild, wenn kein Thumbnail gefunden wurde
      const defaultImagePath = path.join(uploadsDir, 'couple.jpg');
      if (fs.existsSync(defaultImagePath)) {
        // Verkleinertes Thumbnail vom Pärchenbild erstellen
        const thumbnailBuffer = await sharp(defaultImagePath)
          .resize(60, 60, { fit: 'cover' })
          .toBuffer();
        
        res.contentType('image/jpeg');
        return res.send(thumbnailBuffer);
      } else {
        return res.status(404).send('Thumbnail nicht gefunden');
      }
    }
    
    // Setze den korrekten Content-Type
    const imageType = result.rows[0].image_type || 'image/jpeg';
    res.contentType(imageType);
    
    // Sende das Thumbnail als Binärdaten
    res.send(result.rows[0].thumbnail_data);
  } catch (error) {
    console.error('Fehler beim Abrufen des Thumbnails:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bild aus der Datenbank abrufen
app.get('/api/images/:id', async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    const id = req.params.id;
    const result = await pool.query('SELECT image_data, image_type FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0 || !result.rows[0].image_data) {
      // Fallback auf das Pärchenbild, wenn kein Bild gefunden wurde
      const defaultImagePath = path.join(uploadsDir, 'couple.jpg');
      if (fs.existsSync(defaultImagePath)) {
        const defaultImage = fs.readFileSync(defaultImagePath);
        res.contentType('image/jpeg');
        return res.send(defaultImage);
      } else {
        return res.status(404).send('Bild nicht gefunden');
      }
    }
    
    // Setze den korrekten Content-Type
    const imageType = result.rows[0].image_type || 'image/jpeg';
    res.contentType(imageType);
    
    // Stelle sicher, dass ein Thumbnail existiert, falls es noch nicht erstellt wurde
    await ensureThumbnailExists(id, result.rows[0].image_data, imageType);
    
    // Sende das Bild als Binärdaten
    res.send(result.rows[0].image_data);
  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Alle Orte abrufen
app.get('/api/locations', requireAuth, async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    const result = await pool.query('SELECT id, title, latitude, longitude, description FROM locations ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Orte:', error);
    res.status(500).json({ error: error.message });
  }
});

// Storage für das hochgeladene Bild konfigurieren
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB Limit
});

// Neuen Ort hinzufügen
app.post('/api/locations', upload.single('image'), async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
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
    
    // Verarbeite das Bild mit Sharp
    const imageBuffer = req.file.buffer;
    const imageType = req.file.mimetype;
    
    // Erstelle ein Thumbnail
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(60, 60, { fit: 'cover' })
      .toBuffer();
    
    // Füge den Ort zur Datenbank hinzu
    const result = await pool.query(
      'INSERT INTO locations (title, latitude, longitude, description, image_data, image_type, thumbnail_data) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [title, latitude, longitude, description, imageBuffer, imageType, thumbnailBuffer]
    );
    
    const newLocationId = result.rows[0].id;
    
    res.json({ success: true, id: newLocationId });
  } catch (error) {
    console.error('Fehler beim Hinzufügen des Ortes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ort löschen
app.delete('/api/locations/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  await deleteLocation(id, res);
});

// Admin: Datenbank zurücksetzen
app.post('/api/admin/reset-database', requireAuth, async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    await pool.query('DELETE FROM locations');
    res.json({ success: true });
  } catch (error) {
    console.error('Fehler beim Zurücksetzen der Datenbank:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Alle fehlenden Thumbnails generieren
app.post('/api/admin/generate-thumbnails', requireAuth, async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    await generateAllMissingThumbnails();
    res.json({ success: true });
  } catch (error) {
    console.error('Fehler beim Generieren der Thumbnails:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verbindung zur Datenbank herstellen
connectToDatabase().then(connected => {
  dbConnected = connected;
  console.log('Datenbankverbindung Status:', dbConnected);
  
  // Nach erfolgreicher Verbindung alle fehlenden Thumbnails generieren
  if (dbConnected) {
    generateAllMissingThumbnails();
  }
}).catch(error => {
  console.error('Fehler bei der Datenbankverbindung:', error);
});

// Server starten
const server = app.listen(PORT, () => {
  console.log('Server laeuft auf Port ' + PORT);
});
EOF

# 4. Kopiere wichtige Dateien für das Deployment
echo "Kopiere Dateien..."
mkdir -p dist/uploads
cp -rv uploads/* dist/uploads/ || echo "Keine Uploads-Dateien gefunden"
cp -v uploads/couple.jpg dist/uploads/ || echo "Warnung: couple.jpg nicht gefunden"
cp -v uploads/couple.png dist/uploads/ || echo "Warnung: couple.png nicht gefunden"

# 5. package.json erstellen
echo "Erstelle package.json..."
cat > package.json << EOF
{
  "name": "travelchronicles",
  "version": "1.0.0",
  "type": "commonjs",
  "license": "MIT",
  "scripts": {
    "start": "NODE_ENV=production node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.3",
    "pg": "^8.11.3",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.33.2",
    "fs-extra": "^11.2.0"
  }
}
EOF

echo "=== Build erfolgreich abgeschlossen ==="