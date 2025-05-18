const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const multer = require('multer');

// Maximale Dateigröße: 15 MB
const MAX_FILE_SIZE = 15 * 1024 * 1024;

// Uploads-Verzeichnis definieren
const uploadsDir = path.join(__dirname, 'uploads');

// Stellen Sie sicher, dass das Uploads-Verzeichnis existiert
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Stellen Sie sicher, dass das "couple.jpg" Bild existiert
const coupleImagePath = path.join(uploadsDir, 'couple.jpg');
if (!fs.existsSync(coupleImagePath)) {
  try {
    fs.copyFileSync(path.join(__dirname, 'client', 'couple.jpg'), coupleImagePath);
    console.log('Couple.jpg wurde kopiert');
  } catch (error) {
    console.warn('Konnte couple.jpg nicht kopieren:', error);
  }
}

// Multer Storage konfigurieren
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

// Upload-Handler erstellen
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE }
});

// Express-App erstellen
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadsDir));

// Umgebungsvariablen ausgeben (ohne den tatsächlichen Inhalt)
console.log('Umgebungsvariablen (ohne Werte):', {
  DATABASE_URL_EXISTS: !!process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV
});

// Wenn die Datenbankverbindung vorhanden ist, gib deren Länge aus
if (process.env.DATABASE_URL) {
  console.log('Verbindungsstring-Länge:', process.env.DATABASE_URL.length, 'Zeichen');
}

// Datenbank-Konfiguration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Session-Management
const sessions = {};

function createSession() {
  const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  sessions[sessionId] = { 
    created: Date.now(),
    expires: Date.now() + 24 * 60 * 60 * 1000 // 24 Stunden
  };
  return sessionId;
}

function isValidSession(sessionId) {
  const session = sessions[sessionId];
  if (!session) {
    return false;
  }
  
  if (session.expires < Date.now()) {
    delete sessions[sessionId];
    return false;
  }
  
  // Session verlängern
  session.expires = Date.now() + 24 * 60 * 60 * 1000;
  return true;
}

function requireAuth(req, res, next) {
  // Session-ID aus Cookie oder Query-Parameter
  const sessionId = req.cookies.sessionId || req.query.sessionId;
  
  console.log(`Auth-Check mit SessionID: ${sessionId}`);
  
  if (!sessionId || !isValidSession(sessionId)) {
    return res.status(401).redirect('/login.html');
  }
  
  console.log(`Session verlängert: ${sessionId}`);
  res.cookie('sessionId', sessionId, { 
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true
  });
  
  next();
}

// Datenbank-Verbindung testen
async function connectToDatabase() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('Datenbankverbindung erfolgreich hergestellt:', result.rows[0]);
    client.release();
    return true;
  } catch (error) {
    console.error('Fehler bei der Datenbankverbindung:', error);
    return false;
  }
}

// Stelle sicher, dass die benötigten Tabellen existieren
async function checkTablesExist() {
  try {
    const client = await pool.connect();
    
    // Prüfen, ob 'locations' Tabelle existiert
    const tableExistsResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
      );
    `);
    
    const locationsTableExists = tableExistsResult.rows[0].exists;
    console.log('Tabelle locations existiert:', locationsTableExists);
    
    if (!locationsTableExists) {
      await createTables(client);
    }
    
    client.release();
    return true;
  } catch (error) {
    console.error('Fehler beim Prüfen der Tabellen:', error);
    return false;
  }
}

// Erstellen der benötigten Tabellen, falls sie nicht existieren
async function createTables(client) {
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        description TEXT,
        image TEXT,
        image_data TEXT,
        image_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('Tabellen wurden erstellt');
  } catch (error) {
    console.error('Fehler beim Erstellen der Tabellen:', error);
    throw error;
  }
}

// Statische Dateien für Adressierung unter der Root-URL
app.use(express.static(path.join(__dirname, 'public')));

// Login-Endpunkt
app.post('/api/login', (req, res) => {
  const { accessCode } = req.body;
  
  console.log(`Login-Versuch mit Code: ${accessCode ? '******' : 'kein Code'}`);
  
  if (accessCode === process.env.ACCESS_CODE) {
    const sessionId = createSession();
    console.log(`Neue Session erstellt: ${sessionId}`);
    
    res.cookie('sessionId', sessionId, { 
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true
    });
    
    res.json({ success: true, sessionId });
  } else {
    res.status(401).json({ success: false, message: 'Ungültiger Zugangscode' });
  }
});

// Abrufen aller Orte
app.get('/api/locations', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, title, latitude, longitude, description FROM locations ORDER BY id DESC');
    console.log(`${result.rows.length} Orte abgerufen`);
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Orte:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Orte' });
  }
});

// Erstellen eines neuen Ortes
app.post('/api/locations', requireAuth, upload.single('image'), async (req, res) => {
  try {
    console.log('Neuer Ort wird hinzugefügt');
    
    // Überprüfe, ob ein Bild hochgeladen wurde
    if (!req.file) {
      console.log('Kein Bild hochgeladen');
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
    
    // Temporäre Datei löschen
    fs.unlinkSync(req.file.path);
    
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

// Bild eines Ortes abrufen - DIREKTE DATA-URI METHODE
app.get('/api/locations/:id/image', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`Bild für Ort ${id} angefordert`);
    
    // Cache-Control Header sofort setzen
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Direkter und vereinfachter Abruf der Bilddaten aus der Datenbank
    const result = await pool.query('SELECT image_data, image_type FROM locations WHERE id = $1', [id]);
    
    // Absoluter Pfad zum Uploads-Verzeichnis
    const absoluteUploadsDir = path.resolve(uploadsDir);
    
    if (result.rows.length === 0 || !result.rows[0].image_data) {
      console.log(`Ort ${id} nicht gefunden oder hat keine Bilddaten`);
      return res.sendFile(path.join(absoluteUploadsDir, 'couple.jpg'));
    }
    
    const { image_data, image_type } = result.rows[0];
    
    try {
      // Als HTML mit eingebetteter Data-URI senden - dies funktioniert besser mit großen Bildern
      console.log(`Sende Base64-Bild für Ort ${id} mit Typ ${image_type || 'image/jpeg'}`);
      
      // HTML mit eingebettetem Bild als Data-URI
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Bild ${id}</title>
          <style>
            body, html { margin: 0; padding: 0; height: 100%; }
            img { display: block; max-width: 100%; height: auto; }
          </style>
        </head>
        <body>
          <img src="data:${image_type || 'image/jpeg'};base64,${image_data}" alt="Ortsbild">
        </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } catch (imageError) {
      console.error('Fehler beim Verarbeiten des Bildes:', imageError);
      return res.sendFile(path.join(absoluteUploadsDir, 'couple.jpg'));
    }
  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error);
    // Im Fehlerfall senden wir das Standard-Bild
    const absoluteUploadsDir = path.resolve(uploadsDir);
    return res.sendFile(path.join(absoluteUploadsDir, 'couple.jpg'));
  }
});

// Ort löschen
app.delete('/api/locations/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query('DELETE FROM locations WHERE id = $1', [id]);
    console.log(`Ort mit ID ${id} gelöscht`);
    res.json({ success: true });
  } catch (error) {
    console.error('Fehler beim Löschen des Ortes:', error);
    res.status(500).json({ error: 'Fehler beim Löschen des Ortes' });
  }
});

// Startseite mit Login-Formular
app.get('/', (req, res) => {
  const sessionId = req.cookies.sessionId;
  
  if (sessionId && isValidSession(sessionId)) {
    return res.redirect('/map.html');
  }
  
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Login HTML-Seite
app.get('/login.html', (req, res) => {
  const sessionId = req.cookies.sessionId;
  
  if (sessionId && isValidSession(sessionId)) {
    return res.redirect('/map.html');
  }
  
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Map HTML-Seite
app.get('/map.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'map.html'));
});

// Nicht gefundene Routen abfangen
app.use((req, res) => {
  res.status(404).send('Seite nicht gefunden');
});

// HTML für die Anmeldeseite
const loginHTML = `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Susibert - Login</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background-color: #222;
            color: #fff;
        }
        
        .container {
            max-width: 400px;
            padding: 2rem;
            background-color: #333;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            text-align: center;
        }
        
        .couple-image {
            width: 100%;
            max-width: 300px;
            border-radius: 50%;
            margin-bottom: 1.5rem;
            border: 4px solid #f2960c;
            background-color: #000;
        }
        
        h1 {
            margin-bottom: 1.5rem;
            color: #f2960c;
        }
        
        .form-group {
            margin-bottom: 1.5rem;
        }
        
        input {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #555;
            border-radius: 4px;
            background-color: #444;
            color: #fff;
            font-size: 1rem;
        }
        
        button {
            width: 100%;
            padding: 0.75rem;
            background-color: #f2960c;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1rem;
            font-weight: bold;
            transition: background-color 0.3s;
        }
        
        button:hover {
            background-color: #d98200;
        }
        
        .error {
            color: #ff6b6b;
            margin-top: 1rem;
            display: none;
        }
        
        @media (max-width: 480px) {
            .container {
                width: 90%;
                padding: 1.5rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <img src="/uploads/couple.jpg" alt="Pärchenbild" class="couple-image">
        <h1>Susibert</h1>
        <div class="form-group">
            <input type="password" id="accessCode" placeholder="Zugangscode eingeben">
        </div>
        <button id="loginButton">Anmelden</button>
        <p id="errorMessage" class="error">Ungültiger Zugangscode!</p>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const accessCodeInput = document.getElementById('accessCode');
            const loginButton = document.getElementById('loginButton');
            const errorMessage = document.getElementById('errorMessage');
            
            // Bei Enter-Taste Login auslösen
            accessCodeInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    attemptLogin();
                }
            });
            
            // Bei Klick auf den Login-Button
            loginButton.addEventListener('click', attemptLogin);
            
            function attemptLogin() {
                const accessCode = accessCodeInput.value.trim();
                
                if (!accessCode) {
                    errorMessage.style.display = 'block';
                    errorMessage.textContent = 'Bitte gib einen Zugangscode ein!';
                    return;
                }
                
                // Login-Request an den Server senden
                fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ accessCode })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        window.location.href = '/map.html';
                    } else {
                        errorMessage.style.display = 'block';
                        errorMessage.textContent = data.message || 'Ungültiger Zugangscode!';
                    }
                })
                .catch(error => {
                    console.error('Login-Fehler:', error);
                    errorMessage.style.display = 'block';
                    errorMessage.textContent = 'Fehler bei der Anmeldung. Bitte versuche es später noch einmal.';
                });
            }
        });
    </script>
</body>
</html>`;

// HTML für die Karten-Seite
const mapHTML = `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Susibert - Unsere Reisekarte</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            color: #fff;
            background-color: #222;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .header {
            background-color: #333;
            padding: 0.8rem 1rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 100;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        
        .logo {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .logo img {
            width: 2rem;
            height: 2rem;
            border-radius: 50%;
        }
        
        .logo h1 {
            margin: 0;
            font-size: 1.5rem;
            color: #f2960c;
        }
        
        .actions {
            display: flex;
            gap: 1rem;
            align-items: center;
        }
        
        .btn {
            padding: 0.5rem 1rem;
            background-color: #444;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: background-color 0.3s;
        }
        
        .btn-primary {
            background-color: #f2960c;
        }
        
        .btn:hover {
            background-color: #555;
        }
        
        .btn-primary:hover {
            background-color: #d98200;
        }
        
        .menu-icon {
            font-size: 1.5rem;
            cursor: pointer;
            color: #f2960c;
            user-select: none;
        }
        
        .content {
            flex: 1;
            position: relative;
            overflow: hidden;
            display: flex;
        }
        
        #map {
            width: 100%;
            height: 100%;
            transition: width 0.3s ease;
            z-index: 1;
        }
        
        .sidebar {
            width: 0;
            height: 100%;
            background-color: #333;
            transition: width 0.3s ease;
            overflow-y: auto;
            position: absolute;
            right: 0;
            top: 0;
            z-index: 2;
            box-shadow: -2px 0 5px rgba(0,0,0,0.2);
            box-sizing: border-box;
        }
        
        .sidebar.open {
            width: 320px;
            padding: 1rem;
        }
        
        .sidebar-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }
        
        .sidebar-title {
            font-size: 1.2rem;
            font-weight: bold;
            color: #f2960c;
            margin: 0;
        }
        
        .location-list {
            margin-top: 1rem;
        }
        
        .location-item {
            padding: 0.8rem;
            background-color: #444;
            border-radius: 4px;
            margin-bottom: 0.8rem;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        
        .location-item:hover {
            background-color: #555;
        }
        
        .location-title {
            font-weight: bold;
            margin-bottom: 0.3rem;
            color: #f2960c;
        }
        
        .location-coords {
            font-size: 0.8rem;
            color: #aaa;
        }
        
        .detail-view {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: #333;
            padding: 1.5rem;
            border-radius: 8px;
            z-index: 9999;
            max-width: 90%;
            width: 450px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            display: none;
            max-height: 90vh;
            overflow-y: auto;
        }
        
        .detail-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }
        
        .detail-title {
            font-size: 1.5rem;
            font-weight: bold;
            color: #f2960c;
            margin: 0;
        }
        
        .close-btn {
            font-size: 1.5rem;
            cursor: pointer;
            color: #aaa;
            transition: color 0.3s;
        }
        
        .close-btn:hover {
            color: #fff;
        }
        
        .overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.7);
            z-index: 9998;
            display: none;
        }
        
        .add-form {
            display: none;
            margin-top: 1.5rem;
        }
        
        .form-group {
            margin-bottom: 1rem;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            color: #ccc;
        }
        
        .form-group input, .form-group textarea {
            width: 100%;
            padding: 0.75rem;
            background-color: #444;
            border: 1px solid #555;
            border-radius: 4px;
            color: #fff;
            font-family: inherit;
            box-sizing: border-box;
        }
        
        .form-group textarea {
            min-height: 100px;
            resize: vertical;
        }
        
        .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 0.8rem;
        }
        
        .delete-btn {
            background-color: #e74c3c;
            color: white;
        }
        
        .delete-btn:hover {
            background-color: #c0392b;
        }
        
        .edit-mode-notice {
            background-color: #f2960c;
            color: #333;
            text-align: center;
            padding: 0.5rem;
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 1000;
            font-weight: bold;
            display: none;
        }
        
        .leaflet-container {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        .temp-marker {
            display: none;
            position: absolute;
            z-index: 1000;
            pointer-events: none;
        }
        
        .temp-marker:before {
            content: '';
            display: block;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background-color: rgba(242, 150, 12, 0.7);
            border: 2px solid white;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
        }
        
        .confirmation-buttons {
            display: none;
            position: absolute;
            z-index: 1000;
            margin-top: 10px;
            background-color: #333;
            padding: 5px;
            border-radius: 4px;
        }
        
        /* Mobile Ansicht */
        @media (max-width: 768px) {
            .sidebar.open {
                width: 250px;
            }
            
            .detail-view {
                width: 90%;
            }
            
            .actions {
                gap: 0.5rem;
            }
            
            .btn {
                padding: 0.4rem 0.8rem;
                font-size: 0.8rem;
            }
            
            .logo h1 {
                font-size: 1.2rem;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">
            <img src="/uploads/couple.jpg" alt="Logo">
            <h1>Susibert</h1>
        </div>
        <div class="actions">
            <button id="addLocationBtn" class="btn btn-primary">Ort hinzufügen</button>
            <button id="logoutBtn" class="btn">Abmelden</button>
            <div id="menuToggle" class="menu-icon">☰</div>
        </div>
    </div>
    
    <div class="content">
        <div id="map"></div>
        <div id="sidebar" class="sidebar">
            <div class="sidebar-header">
                <h2 class="sidebar-title">Unsere Orte</h2>
                <div id="closeSidebar" class="close-btn">×</div>
            </div>
            <div id="locationList" class="location-list"></div>
        </div>
    </div>
    
    <div id="overlay" class="overlay"></div>
    
    <div id="detailView" class="detail-view">
        <div class="detail-header">
            <h2 id="detailTitle" class="detail-title"></h2>
            <div id="closeDetail" class="close-btn">×</div>
        </div>
        <div id="detailContent"></div>
    </div>
    
    <div id="editModeNotice" class="edit-mode-notice">
        Klicke auf die Karte, um einen neuen Ort zu markieren
    </div>
    
    <div id="tempMarker" class="temp-marker"></div>
    <div id="confirmationButtons" class="confirmation-buttons">
        <button id="confirmLocationBtn" class="btn btn-primary">Bestätigen</button>
        <button id="cancelLocationBtn" class="btn">Abbrechen</button>
    </div>

    <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
    <script>
        // Status Variablen
        let editMode = false;
        let map;
        let markers = [];
        let selectedLocation = null;
        let tempMarker = null;
        
        // Ort-Objekte
        let locations = [];
        
        // Session-ID aus Cookie oder URL abrufen
        function getSessionId() {
            // Aus Cookie
            const cookies = document.cookie.split(';');
            for (let cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'sessionId') {
                    return value;
                }
            }
            
            // Aus URL
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('sessionId');
        }
        
        // Session-ID
        const sessionId = getSessionId();
        
        document.addEventListener('DOMContentLoaded', function() {
            // DOM-Elemente
            const sidebarEl = document.getElementById('sidebar');
            const menuToggleEl = document.getElementById('menuToggle');
            const closeSidebarEl = document.getElementById('closeSidebar');
            const locationListEl = document.getElementById('locationList');
            const overlayEl = document.getElementById('overlay');
            const detailViewEl = document.getElementById('detailView');
            const closeDetailEl = document.getElementById('closeDetail');
            const detailTitleEl = document.getElementById('detailTitle');
            const detailContentEl = document.getElementById('detailContent');
            const addLocationBtnEl = document.getElementById('addLocationBtn');
            const logoutBtnEl = document.getElementById('logoutBtn');
            const editModeNoticeEl = document.getElementById('editModeNotice');
            const tempMarkerEl = document.getElementById('tempMarker');
            const confirmationButtonsEl = document.getElementById('confirmationButtons');
            const confirmLocationBtnEl = document.getElementById('confirmLocationBtn');
            const cancelLocationBtnEl = document.getElementById('cancelLocationBtn');
            
            // Seitenleiste öffnen/schließen
            menuToggleEl.addEventListener('click', function() {
                sidebarEl.classList.toggle('open');
            });
            
            closeSidebarEl.addEventListener('click', function() {
                sidebarEl.classList.remove('open');
            });
            
            // Detail-Ansicht schließen
            closeDetailEl.addEventListener('click', function() {
                hideDetailView();
            });
            
            overlayEl.addEventListener('click', function() {
                hideDetailView();
            });
            
            // Logout-Funktion
            logoutBtnEl.addEventListener('click', function() {
                window.location.href = '/api/logout';
            });
            
            // Karte initialisieren
            initMap();
            
            // Orte laden
            loadLocations();
            
            // "Ort hinzufügen"-Modus
            addLocationBtnEl.addEventListener('click', function() {
                toggleEditMode();
            });
            
            // Bestätigen eines neuen Orts
            confirmLocationBtnEl.addEventListener('click', function() {
                if (tempMarker) {
                    showAddLocationForm(tempMarker.getLatLng());
                }
            });
            
            // Abbrechen eines neuen Orts
            cancelLocationBtnEl.addEventListener('click', function() {
                cancelAddLocation();
            });
            
            // Tastaturkürzel (ESC zum Abbrechen)
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    if (editMode) {
                        cancelAddLocation();
                    } else if (detailViewEl.style.display === 'block') {
                        hideDetailView();
                    }
                }
            });
        });
        
        // Karte initialisieren
        function initMap() {
            // Karte erstellen und auf Europa zentrieren
            map = L.map('map').setView([48.775846, 9.182932], 5);
            
            // Kartenkacheln von OpenStreetMap laden
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
            
            // Karten-Klick-Event für das Hinzufügen neuer Orte
            map.on('click', function(e) {
                if (editMode) {
                    placeTemporaryMarker(e.latlng);
                }
            });
        }
        
        // Temporären Marker platzieren
        function placeTemporaryMarker(latlng) {
            // Vorherigen temporären Marker entfernen
            if (tempMarker) {
                map.removeLayer(tempMarker);
            }
            
            // Neuen temporären Marker erstellen
            tempMarker = L.marker(latlng).addTo(map);
            
            // Bestätigungs-Buttons positionieren und anzeigen
            const confirmationButtonsEl = document.getElementById('confirmationButtons');
            
            // Position der Buttons relativ zum Marker berechnen
            const point = map.latLngToContainerPoint(latlng);
            confirmationButtonsEl.style.left = point.x - 60 + 'px';
            confirmationButtonsEl.style.top = point.y + 30 + 'px';
            confirmationButtonsEl.style.display = 'block';
        }
        
        // Hinzufügen-Modus umschalten
        function toggleEditMode() {
            editMode = !editMode;
            
            const editModeNoticeEl = document.getElementById('editModeNotice');
            const addLocationBtnEl = document.getElementById('addLocationBtn');
            
            if (editMode) {
                editModeNoticeEl.style.display = 'block';
                addLocationBtnEl.textContent = 'Abbrechen';
                
                // Cursor-Style anpassen
                document.getElementById('map').style.cursor = 'crosshair';
            } else {
                editModeNoticeEl.style.display = 'none';
                addLocationBtnEl.textContent = 'Ort hinzufügen';
                
                // Temporären Marker und Bestätigungs-Buttons entfernen
                cancelAddLocation();
                
                // Cursor zurücksetzen
                document.getElementById('map').style.cursor = '';
            }
        }
        
        // Hinzufügen abbrechen
        function cancelAddLocation() {
            const confirmationButtonsEl = document.getElementById('confirmationButtons');
            confirmationButtonsEl.style.display = 'none';
            
            if (tempMarker) {
                map.removeLayer(tempMarker);
                tempMarker = null;
            }
            
            if (editMode) {
                toggleEditMode();
            }
        }
        
        // Formular zum Hinzufügen eines Ortes anzeigen
        function showAddLocationForm(latlng) {
            // Detail-Ansicht vorbereiten
            const detailTitleEl = document.getElementById('detailTitle');
            const detailContentEl = document.getElementById('detailContent');
            const overlayEl = document.getElementById('overlay');
            const detailViewEl = document.getElementById('detailView');
            
            detailTitleEl.textContent = 'Neuen Ort hinzufügen';
            
            // Formular erstellen
            const formHtml = \`
                <form id="addLocationForm" enctype="multipart/form-data">
                    <div class="form-group">
                        <label for="title">Titel *</label>
                        <input type="text" id="title" name="title" required>
                    </div>
                    <div class="form-group">
                        <label for="description">Beschreibung</label>
                        <textarea id="description" name="description"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="image">Bild *</label>
                        <input type="file" id="image" name="image" accept="image/*" required>
                    </div>
                    <input type="hidden" id="latitude" name="latitude" value="\${latlng.lat}">
                    <input type="hidden" id="longitude" name="longitude" value="\${latlng.lng}">
                    <div class="form-actions">
                        <button type="button" id="cancelFormBtn" class="btn">Abbrechen</button>
                        <button type="submit" class="btn btn-primary">Speichern</button>
                    </div>
                </form>
            \`;
            
            detailContentEl.innerHTML = formHtml;
            
            // Formular-Events
            document.getElementById('addLocationForm').addEventListener('submit', function(e) {
                e.preventDefault();
                submitAddLocationForm();
            });
            
            document.getElementById('cancelFormBtn').addEventListener('click', function() {
                hideDetailView();
                cancelAddLocation();
            });
            
            // Detail-Ansicht und Overlay anzeigen
            overlayEl.style.display = 'block';
            detailViewEl.style.display = 'block';
            
            // Bestätigungs-Buttons ausblenden
            document.getElementById('confirmationButtons').style.display = 'none';
        }
        
        // Formular absenden
        function submitAddLocationForm() {
            console.log('Formular wird abgesendet');
            
            const form = document.getElementById('addLocationForm');
            const formData = new FormData(form);
            
            // Session-ID hinzufügen
            formData.append('sessionId', sessionId);
            
            // Validierung
            const title = formData.get('title');
            const lat = formData.get('latitude');
            const lng = formData.get('longitude');
            const image = formData.get('image');
            
            if (!title || !lat || !lng || !image) {
                alert('Bitte fülle alle Pflichtfelder aus!');
                return;
            }
            
            console.log('Alle Eingaben validiert, bereite FormData vor', { title, lat, lng });
            
            // Formular absenden
            fetch('/api/locations', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Detail-Ansicht ausblenden
                    hideDetailView();
                    
                    // Edit-Modus beenden
                    cancelAddLocation();
                    
                    // Orte neu laden
                    loadLocations();
                } else {
                    alert('Fehler beim Speichern: ' + (data.error || 'Unbekannter Fehler'));
                }
            })
            .catch(error => {
                console.error('Fehler beim Absenden des Formulars:', error);
                alert('Fehler beim Speichern des Ortes. Bitte versuche es später noch einmal.');
            });
        }
        
        // Orte vom Server laden
        function loadLocations() {
            fetch(\`/api/locations?sessionId=\${sessionId}\`)
                .then(response => response.json())
                .then(data => {
                    locations = data;
                    
                    // Marker auf der Karte aktualisieren
                    updateMapMarkers();
                    
                    // Liste in der Seitenleiste aktualisieren
                    updateLocationList();
                })
                .catch(error => {
                    console.error('Fehler beim Laden der Orte:', error);
                });
        }
        
        // Marker auf der Karte aktualisieren
        function updateMapMarkers() {
            // Alle vorhandenen Marker entfernen
            markers.forEach(marker => map.removeLayer(marker));
            markers = [];
            
            // Neue Marker hinzufügen
            locations.forEach(location => {
                const marker = L.marker([location.latitude, location.longitude])
                    .addTo(map)
                    .bindPopup(location.title);
                
                // Klick-Event für Marker
                marker.on('click', function() {
                    showLocationDetail(location);
                });
                
                // Marker speichern
                markers.push(marker);
                
                // Visuelle Markierung des bereisten Bereichs (50km Radius)
                const circle = L.circle([location.latitude, location.longitude], {
                    color: '#f2960c',
                    fillColor: '#f2960c',
                    fillOpacity: 0.2,
                    radius: 50000
                }).addTo(map);
                
                markers.push(circle);
            });
            
            // Wenn es Orte gibt, Karte auf alle Marker zentrieren
            if (locations.length > 0) {
                const group = new L.featureGroup(markers);
                map.fitBounds(group.getBounds(), { padding: [50, 50] });
            }
        }
        
        // Liste in der Seitenleiste aktualisieren
        function updateLocationList() {
            const locationListEl = document.getElementById('locationList');
            locationListEl.innerHTML = '';
            
            if (locations.length === 0) {
                locationListEl.innerHTML = '<p>Noch keine Orte vorhanden. Füge deinen ersten Ort hinzu!</p>';
                return;
            }
            
            locations.forEach(location => {
                const itemEl = document.createElement('div');
                itemEl.className = 'location-item';
                
                const titleEl = document.createElement('div');
                titleEl.className = 'location-title';
                titleEl.textContent = location.title;
                
                itemEl.appendChild(titleEl);
                
                if (location.description) {
                    const descEl = document.createElement('div');
                    descEl.textContent = location.description.length > 50 
                        ? location.description.substring(0, 50) + '...' 
                        : location.description;
                    itemEl.appendChild(descEl);
                }
                
                // Klick-Event
                itemEl.addEventListener('click', function() {
                    // Marker zentrieren und Popup öffnen
                    map.setView([location.latitude, location.longitude], 12);
                    
                    // Detail-Ansicht anzeigen
                    showLocationDetail(location);
                    
                    // Auf mobilen Geräten die Seitenleiste schließen
                    if (window.innerWidth < 768) {
                        document.getElementById('sidebar').classList.remove('open');
                    }
                });
                
                locationListEl.appendChild(itemEl);
            });
        }
        
        // Detail-Ansicht eines Ortes anzeigen
        function showLocationDetail(location) {
            selectedLocation = location;
            
            const detailTitleEl = document.getElementById('detailTitle');
            const detailContentEl = document.getElementById('detailContent');
            const overlayEl = document.getElementById('overlay');
            const detailViewEl = document.getElementById('detailView');
            
            detailTitleEl.textContent = location.title;
            
            // Prüfe, ob ein gelöschtes Bild angefordert wird
            const cachedImageTimestamp = new Date().getTime();
            
            // Inhalt erstellen
            detailContentEl.innerHTML = \`
                <img id="locationImage" src="/api/locations/\${location.id}/image?sessionId=\${sessionId}&t=\${cachedImageTimestamp}" 
                     alt="\${location.title}" style="width: 100%; max-height: 300px; object-fit: cover; border-radius: 4px; margin-bottom: 15px;"
                     onerror="this.src='/uploads/couple.jpg'; console.error('Fehler beim Laden des Bildes');">
                <div>\${location.description || 'Keine Beschreibung vorhanden.'}</div>
                <div class="form-actions" style="margin-top: 20px;">
                    <button id="deleteLocationBtn" class="btn delete-btn">Löschen</button>
                </div>
            \`;
            
            // EventListener für Lösch-Button
            document.getElementById('deleteLocationBtn').addEventListener('click', function() {
                deleteLocation(location.id);
            });
            
            // Detail-Ansicht anzeigen
            overlayEl.style.display = 'block';
            detailViewEl.style.display = 'block';
        }
        
        // Detail-Ansicht ausblenden
        function hideDetailView() {
            const overlayEl = document.getElementById('overlay');
            const detailViewEl = document.getElementById('detailView');
            
            overlayEl.style.display = 'none';
            detailViewEl.style.display = 'none';
            
            selectedLocation = null;
        }
        
        // Ort löschen
        function deleteLocation(id) {
            if (!confirm('Bist du sicher, dass du diesen Ort löschen möchtest?')) {
                return;
            }
            
            fetch(\`/api/locations/\${id}?sessionId=\${sessionId}\`, {
                method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Detail-Ansicht ausblenden
                    hideDetailView();
                    
                    // Orte neu laden
                    loadLocations();
                } else {
                    alert('Fehler beim Löschen: ' + (data.error || 'Unbekannter Fehler'));
                }
            })
            .catch(error => {
                console.error('Fehler beim Löschen des Ortes:', error);
                alert('Fehler beim Löschen des Ortes. Bitte versuche es später noch einmal.');
            });
        }
    </script>
</body>
</html>`;

// Server starten
async function startServer() {
  try {
    // Prüfe, ob die Datenbank erreichbar ist
    const dbConnected = await connectToDatabase();
    
    if (!dbConnected) {
      console.error('Server wird nicht gestartet, da keine Datenbankverbindung besteht.');
      return;
    }
    
    console.log("Datenbankverbindung Status:", dbConnected);
    
    // Prüfe, ob alle benötigten Tabellen existieren
    await checkTablesExist();
    
    // HTML-Dateien schreiben
    fs.writeFileSync(path.join(__dirname, 'login.html'), loginHTML);
    fs.writeFileSync(path.join(__dirname, 'map.html'), mapHTML);
    
    // Server starten
    const PORT = process.env.PORT || 10000;
    app.listen(PORT, () => {
      console.log(`Server läuft auf Port ${PORT}`);
    });
  } catch (error) {
    console.error('Fehler beim Starten des Servers:', error);
  }
}

// Server starten
startServer();