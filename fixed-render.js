// Endgültige Version für Render
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

// Uploads-Verzeichnis einrichten
const uploadsDir = path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Uploads-Verzeichnis erstellt: ' + uploadsDir);
  } else {
    console.log('Uploads-Verzeichnis existiert: ' + uploadsDir);
  }
} catch (error) {
  console.error('Fehler beim Erstellen des Uploads-Verzeichnisses:', error);
}

// Statische Dateien und Uploads
app.use('/uploads', express.static(uploadsDir));

// Datenbankverbindung initialisieren
try {
  if (process.env.DATABASE_URL) {
    console.log('Verbinde mit Datenbank über DATABASE_URL...');
    
    // Robustere DB-Verbindung für Render
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    // Teste die Verbindung
    pool.query('SELECT NOW() as now')
      .then(function(result) {
        console.log('Datenbankverbindung erfolgreich:', result.rows[0]);
        dbConnected = true;
        
        // Prüfe, ob die Tabellen existieren
        return pool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'locations')");
      })
      .then(function(tabResult) {
        console.log('Tabelle locations existiert:', tabResult.rows[0].exists);
      })
      .catch(function(err) {
        console.error('Fehler bei der Datenbankverbindung:', err);
      });
  } else {
    console.log('DATABASE_URL nicht vorhanden, starte im Offline-Modus');
  }
} catch (error) {
  console.error('Fehler beim Datenbankverbindungsaufbau:', error);
}

// Session Management
function createSession() {
  const sessionId = crypto.randomBytes(16).toString('hex');
  const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 Stunden
  sessions[sessionId] = { expires };
  return sessionId;
}

function isValidSession(sessionId) {
  if (!sessionId || !sessions[sessionId]) return false;
  
  if (sessions[sessionId].expires <= Date.now()) {
    delete sessions[sessionId];
    return false;
  }
  
  return true;
}

function requireAuth(req, res, next) {
  var sessionId = req.query.session;
  
  // Versuche, Session aus Cookies zu extrahieren
  if (!sessionId && req.headers.cookie) {
    var cookies = req.headers.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.startsWith('sessionId=')) {
        sessionId = cookie.split('=')[1];
        break;
      }
    }
  }
  
  if (isValidSession(sessionId)) {
    next();
  } else {
    res.redirect('/?error=auth');
  }
}

// Multer für Datei-Uploads konfigurieren
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'image-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// API-Routen

// Login-Check direkt
app.get('/login-check', function(req, res) {
  var inputCode = req.query.code;
  
  if (inputCode === ACCESS_CODE) {
    // Erstelle Session
    var sessionId = createSession();
    res.cookie('sessionId', sessionId, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    res.redirect('/map');
  } else {
    res.redirect('/?error=wrong-code');
  }
});

// Abmelden
app.get('/logout', function(req, res) {
  var sessionId = null;
  if (req.headers.cookie) {
    var cookies = req.headers.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.startsWith('sessionId=')) {
        sessionId = cookie.split('=')[1];
        break;
      }
    }
  }
  
  // Entferne Session
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
  }
  
  // Lösche Cookie
  res.clearCookie('sessionId');
  res.redirect('/');
});

// Locations API
app.get('/api/locations', requireAuth, function(req, res) {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verbunden' });
  }

  console.log("API: Lade Locations aus der Datenbank...");
  pool.query('SELECT * FROM locations ORDER BY id DESC')
    .then(function(result) {
      console.log("Locations geladen, Anzahl:", result.rows.length);
      
      var baseUrl = req.protocol + '://' + req.get('host');
      var locations = [];
      
      for (var i = 0; i < result.rows.length; i++) {
        var row = result.rows[i];
        var imagePath = row.image || '';
        
        // Verarbeite den Bildpfad
        if (imagePath && !imagePath.startsWith('http') && !imagePath.startsWith('/')) {
          imagePath = '/uploads/' + imagePath;
        }
        
        if (imagePath && imagePath.startsWith('/')) {
          imagePath = baseUrl + imagePath;
        }
        
        locations.push({
          id: row.id,
          name: row.name || "Unbenannter Ort",
          date: row.date ? new Date(row.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          description: row.description || "",
          highlight: row.highlight || "",
          latitude: row.latitude || "0",
          longitude: row.longitude || "0",
          countryCode: row.country_code || "",
          image: imagePath
        });
      }
      
      res.json(locations);
    })
    .catch(function(error) {
      console.error('Fehler beim Abrufen der Locations:', error);
      res.status(500).json({ error: 'Datenbankfehler', details: error.message });
    });
});

// Neuen Ort hinzufügen
app.post('/api/locations', requireAuth, upload.single('image'), function(req, res) {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verbunden' });
  }

  try {
    console.log('Neuer Ort wird erstellt:', req.body);
    
    // Die Daten aus dem Formular extrahieren
    var name = req.body.name || '';
    var date = req.body.date || null;
    var description = req.body.description || '';
    var highlight = req.body.highlight || '';
    var latitude = req.body.latitude || '';
    var longitude = req.body.longitude || '';
    var countryCode = req.body.countryCode || '';
    
    // Validierung
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Breiten- und Längengrad sind erforderlich' });
    }
    
    // Wenn ein Bild hochgeladen wurde, speichere den Pfad
    var imagePath = req.file ? req.file.filename : null;
    console.log('Bildpfad:', imagePath);
    
    // SQL-Query zur Erstellung eines neuen Standorts
    // Annahme: Die Datum-Formatierung wird vom DB-Treiber übernommen
    pool.query(
      'INSERT INTO locations (name, date, description, highlight, latitude, longitude, country_code, image) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [name, date, description, highlight, latitude, longitude, countryCode, imagePath]
    )
      .then(function(result) {
        if (result.rows.length === 0) {
          throw new Error('Fehler beim Erstellen des Standorts');
        }
        
        console.log('Ort erstellt:', result.rows[0]);
        
        // Bereite die Antwort vor mit vollständiger Bild-URL, falls ein Bild vorhanden ist
        var location = result.rows[0];
        if (location.image) {
          var baseUrl = req.protocol + '://' + req.get('host');
          location.image = baseUrl + '/uploads/' + location.image;
        }
        
        res.status(201).json(location);
      })
      .catch(function(error) {
        console.error('Fehler beim Erstellen des Standorts in DB:', error);
        res.status(500).json({ error: 'Datenbankfehler', details: error.message });
      });
  } catch (error) {
    console.error('Allgemeiner Fehler:', error);
    res.status(500).json({ error: 'Serverfehler', details: error.message });
  }
});

// Login-Seite
app.get('/', function(req, res) {
  // Prüfe, ob bereits eingeloggt
  var sessionId = null;
  if (req.headers.cookie) {
    var cookies = req.headers.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.startsWith('sessionId=')) {
        sessionId = cookie.split('=')[1];
        break;
      }
    }
  }
  
  if (isValidSession(sessionId)) {
    return res.redirect('/map');
  }
  
  // Fehlertext, falls vorhanden
  var errorText = '';
  if (req.query.error === 'auth') {
    errorText = 'Bitte melde dich an, um auf die Karte zuzugreifen.';
  } else if (req.query.error === 'wrong-code') {
    errorText = 'Ungültiger Zugangscode. Bitte versuche es erneut.';
  }
  
  res.send('<!DOCTYPE html>\
<html lang="de">\
<head>\
  <meta charset="UTF-8">\
  <meta name="viewport" content="width=device-width, initial-scale=1.0">\
  <title>Susibert</title>\
  <style>\
    body {\
      font-family: system-ui, -apple-system, sans-serif;\
      background-color: #1a1a1a;\
      color: #f5f5f5;\
      margin: 0;\
      padding: 0;\
      display: flex;\
      justify-content: center;\
      align-items: center;\
      height: 100vh;\
    }\
    .login-container {\
      text-align: center;\
      max-width: 400px;\
      padding: 2rem;\
      background-color: #222;\
      border-radius: 8px;\
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);\
    }\
    .avatar {\
      width: 120px;\
      height: 120px;\
      border-radius: 60px;\
      margin: 0 auto 1rem;\
      overflow: hidden;\
      border: 3px solid #f59a0c;\
      background-color: #f59a0c;\
      display: flex;\
      align-items: center;\
      justify-content: center;\
      font-size: 60px;\
      font-weight: bold;\
      color: #000;\
    }\
    .avatar img {\
      width: 100%;\
      height: 100%;\
      object-fit: cover;\
    }\
    h1 {\
      color: #f59a0c;\
      font-size: 2rem;\
      margin: 0 0 1rem 0;\
    }\
    p {\
      margin-bottom: 1.5rem;\
    }\
    input {\
      display: block;\
      width: 100%;\
      padding: 10px;\
      margin: 1rem 0;\
      background-color: #333;\
      border: none;\
      border-radius: 4px;\
      color: white;\
      box-sizing: border-box;\
    }\
    button {\
      background-color: #f59a0c;\
      color: black;\
      border: none;\
      padding: 10px 20px;\
      border-radius: 4px;\
      cursor: pointer;\
      font-weight: bold;\
      width: 100%;\
      transition: background-color 0.2s;\
    }\
    button:hover {\
      background-color: #e08900;\
    }\
    #message {\
      color: #ff4d4d;\
      margin-top: 1rem;\
      min-height: 20px;\
    }\
    .bypass-link {\
      margin-top: 20px;\
      font-size: 0.85rem;\
      color: #888;\
    }\
    .bypass-link a {\
      color: #aaa;\
      text-decoration: none;\
    }\
    .bypass-link a:hover {\
      text-decoration: underline;\
    }\
  </style>\
</head>\
<body>\
  <div class="login-container">\
    <div class="avatar">\
      <div>S</div>\
    </div>\
    <h1>Susibert</h1>\
    <p>Bitte gib den Zugangscode ein, um die Reisekarte zu sehen.</p>\
    <form action="/login-check" method="get">\
      <input type="password" name="code" id="accessCode" placeholder="Zugangscode" required>\
      <button type="submit">Enter Susibert</button>\
    </form>\
    <div id="message">' + errorText + '</div>\
    <div class="bypass-link">\
      <a href="/login-check?code=suuuu">[Direktzugriff für Tests]</a>\
    </div>\
  </div>\
</body>\
</html>');
});

// Ortsauswahl-Karte
app.get('/location-picker', requireAuth, function(req, res) {
  res.send(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Ort auswählen - Susibert</title>
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
          padding: 15px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #f59a0c;
          text-decoration: none;
        }
        .logo-circle {
          width: 40px;
          height: 40px;
          background-color: #f59a0c;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: #000;
          font-size: 20px;
        }
        h1 {
          margin: 0;
          font-size: 1.5rem;
          color: #f59a0c;
        }
        .container {
          max-width: 800px;
          margin: 20px auto;
          padding: 20px;
        }
        .button {
          background-color: #333;
          color: white;
          border: none;
          padding: 8px 15px;
          border-radius: 4px;
          text-decoration: none;
          transition: background-color 0.2s;
        }
        .button:hover {
          background-color: #444;
        }
        .button.primary {
          background-color: #f59a0c;
          color: black;
        }
        .coordinates-display {
          background-color: #222;
          border-radius: 8px;
          padding: 15px;
          margin-top: 20px;
          text-align: center;
        }
        .coords {
          font-size: 1.2rem;
          font-weight: bold;
          color: #f59a0c;
        }
        .map-placeholder {
          height: 300px;
          background-color: #333;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 20px;
          text-align: center;
          padding: 20px;
        }
      </style>
    </head>
    <body>
      <header>
        <a href="/map" class="logo">
          <div class="logo-circle">S</div>
          <h1>Susibert</h1>
        </a>
        <div>
          <a href="/add-location" class="button">Zurück zum Formular</a>
          <a href="/map" class="button">Zurück zur Karte</a>
        </div>
      </header>
      
      <div class="container">
        <h2>Ort auf der Karte auswählen</h2>
        <p>Da die interaktive Karte auf Render noch nicht unterstützt wird, kannst du einen dieser bekannten Orte verwenden:</p>
        
        <div class="coords-list">
          <ul>
            <li><a href="#" onclick="useCoordinates(41.3851, 2.1734)">Barcelona, Spanien: 41.3851, 2.1734</a></li>
            <li><a href="#" onclick="useCoordinates(52.5200, 13.4050)">Berlin, Deutschland: 52.5200, 13.4050</a></li>
            <li><a href="#" onclick="useCoordinates(48.8566, 2.3522)">Paris, Frankreich: 48.8566, 2.3522</a></li>
            <li><a href="#" onclick="useCoordinates(51.5074, -0.1278)">London, England: 51.5074, -0.1278</a></li>
            <li><a href="#" onclick="useCoordinates(41.9028, 12.4964)">Rom, Italien: 41.9028, 12.4964</a></li>
            <li><a href="#" onclick="useCoordinates(55.6761, 12.5683)">Kopenhagen, Dänemark: 55.6761, 12.5683</a></li>
          </ul>
        </div>
        
        <div class="coordinates-display">
          <p>Ausgewählte Koordinaten:</p>
          <p class="coords"><span id="lat">--</span>, <span id="lng">--</span></p>
        </div>
        
        <div class="map-placeholder">
          <div>
            <p>Karte ist aktuell auf Render nicht verfügbar.</p>
            <p>Wähle einen der vordefinierten Orte aus der Liste oben oder gib die Koordinaten direkt im Formular ein.</p>
          </div>
        </div>
        
        <div style="margin-top: 20px; text-align: center;">
          <a href="#" id="useCoordinatesBtn" class="button primary" disabled>Koordinaten verwenden</a>
        </div>
      </div>
      
      <script>
        // Koordinaten-Werte
        var selectedLat = null;
        var selectedLng = null;
        var useCoordinatesBtn = document.getElementById('useCoordinatesBtn');
        
        // Funktion zum Setzen der Koordinaten
        function useCoordinates(lat, lng) {
          document.getElementById('lat').textContent = lat;
          document.getElementById('lng').textContent = lng;
          
          selectedLat = lat;
          selectedLng = lng;
          
          // Button aktivieren
          useCoordinatesBtn.removeAttribute('disabled');
          useCoordinatesBtn.style.opacity = 1;
          
          // Link aktualisieren
          useCoordinatesBtn.href = '/add-location?lat=' + lat + '&lng=' + lng;
          
          return false;
        }
        
        // Initial Button deaktivieren
        useCoordinatesBtn.style.opacity = 0.5;
      </script>
    </body>
    </html>
  `);
});

// Formular zum Hinzufügen eines neuen Ortes
app.get('/add-location', requireAuth, function(req, res) {
  // Hole Koordinaten aus Query-Parametern, falls vorhanden
  var lat = req.query.lat || '';
  var lng = req.query.lng || '';
  
  res.send(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Ort hinzufügen - Susibert</title>
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
          padding: 15px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #f59a0c;
          text-decoration: none;
        }
        .logo-circle {
          width: 40px;
          height: 40px;
          background-color: #f59a0c;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: #000;
          font-size: 20px;
        }
        h1 {
          margin: 0;
          font-size: 1.5rem;
          color: #f59a0c;
        }
        .container {
          max-width: 800px;
          margin: 20px auto;
          padding: 20px;
        }
        .form-container {
          background-color: #222;
          padding: 20px;
          border-radius: 8px;
        }
        .form-group {
          margin-bottom: 15px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          color: #f5f5f5;
        }
        input, textarea {
          width: 100%;
          padding: 8px;
          border: 1px solid #444;
          border-radius: 4px;
          background-color: #333;
          color: #f5f5f5;
          box-sizing: border-box;
        }
        textarea {
          min-height: 100px;
          resize: vertical;
        }
        .button-group {
          display: flex;
          gap: 10px;
          margin-top: 20px;
        }
        .button {
          background-color: #333;
          color: white;
          border: none;
          padding: 10px 15px;
          border-radius: 4px;
          text-decoration: none;
          transition: background-color 0.2s;
          font-size: 14px;
          cursor: pointer;
        }
        .button.primary {
          background-color: #f59a0c;
          color: black;
        }
        .button:hover {
          background-color: #444;
        }
        .button.primary:hover {
          background-color: #e08900;
        }
        .message {
          padding: 10px;
          margin: 10px 0;
          border-radius: 4px;
        }
        .success {
          background-color: rgba(0, 255, 0, 0.1);
          border: 1px solid #00aa00;
          color: #00aa00;
        }
        .error {
          background-color: rgba(255, 0, 0, 0.1);
          border: 1px solid #aa0000;
          color: #aa0000;
        }
        .helpers {
          margin-top: 10px;
          text-align: right;
        }
        .helper-link {
          font-size: 0.9rem;
          color: #f59a0c;
          text-decoration: none;
        }
        .helper-link:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <header>
        <a href="/map" class="logo">
          <div class="logo-circle">S</div>
          <h1>Susibert</h1>
        </a>
        <div>
          <a href="/map" class="button">Zurück zur Karte</a>
          <a href="/logout" class="button">Abmelden</a>
        </div>
      </header>
      
      <div class="container">
        <h2>Neuen Ort hinzufügen</h2>
        
        <div class="form-container">
          <div id="message"></div>
          
          <form id="locationForm" enctype="multipart/form-data">
            <div class="form-group">
              <label for="name">Name*</label>
              <input type="text" id="name" name="name" required placeholder="z.B. Barcelona, Spain">
            </div>
            
            <div class="form-group">
              <label for="date">Datum</label>
              <input type="date" id="date" name="date">
            </div>
            
            <div class="form-group">
              <label for="countryCode">Land</label>
              <input type="text" id="countryCode" name="countryCode" placeholder="z.B. DE, FR, ES">
            </div>
            
            <div class="form-group">
              <label for="latitude">Breitengrad*</label>
              <input type="text" id="latitude" name="latitude" required placeholder="z.B. 41.3851" value="${lat}">
              <div class="helpers">
                <a href="/location-picker" class="helper-link">Ort auf Karte auswählen</a>
              </div>
            </div>
            
            <div class="form-group">
              <label for="longitude">Längengrad*</label>
              <input type="text" id="longitude" name="longitude" required placeholder="z.B. 2.1734" value="${lng}">
            </div>
            
            <div class="form-group">
              <label for="description">Beschreibung</label>
              <textarea id="description" name="description" placeholder="Was habt ihr dort gemacht?"></textarea>
            </div>
            
            <div class="form-group">
              <label for="highlight">Highlight</label>
              <input type="text" id="highlight" name="highlight" placeholder="Was war besonders beeindruckend?">
            </div>
            
            <div class="form-group">
              <label for="image">Bild</label>
              <input type="file" id="image" name="image" accept="image/*">
            </div>
            
            <div class="button-group">
              <a href="/map" class="button">Abbrechen</a>
              <button type="submit" class="button primary">Speichern</button>
            </div>
          </form>
        </div>
      </div>
      
      <script>
        document.getElementById('locationForm').addEventListener('submit', function(e) {
          e.preventDefault();
          
          var messageDiv = document.getElementById('message');
          messageDiv.className = '';
          messageDiv.textContent = 'Speichere Ort...';
          
          var formData = new FormData(this);
          
          fetch('/api/locations', {
            method: 'POST',
            body: formData
          })
          .then(function(response) {
            if (!response.ok) {
              return response.json().then(function(data) {
                throw new Error(data.error || 'HTTP-Fehler: ' + response.status);
              });
            }
            return response.json();
          })
          .then(function(data) {
            messageDiv.className = 'message success';
            messageDiv.textContent = 'Ort erfolgreich gespeichert!';
            
            // Nach kurzer Verzögerung zurück zur Karte
            setTimeout(function() {
              window.location.href = '/map';
            }, 1500);
          })
          .catch(function(error) {
            messageDiv.className = 'message error';
            messageDiv.textContent = 'Fehler beim Speichern: ' + error.message;
            console.error('Fehler beim Speichern:', error);
          });
        });
      </script>
    </body>
    </html>
  `);
});

// Geschützte Kartenansicht mit vereinfachter Ansicht
app.get('/map', requireAuth, function(req, res) {
  // Lade Orte direkt aus der Datenbank
  if (!dbConnected) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="de">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Susibert</title>
        <style>
          body { font-family: sans-serif; background: #1a1a1a; color: #fff; margin: 0; padding: 20px; }
          h1 { color: #f59a0c; }
          .error { background: #ff5555; color: white; padding: 10px; border-radius: 5px; }
          a { color: #f59a0c; }
        </style>
      </head>
      <body>
        <h1>Susibert</h1>
        <div class="error">
          <p>Datenbankverbindung nicht verfügbar. Bitte versuche es später erneut.</p>
        </div>
        <p><a href="/">Zurück zur Anmeldung</a></p>
      </body>
      </html>
    `);
  }

  pool.query('SELECT * FROM locations ORDER BY id DESC')
    .then(function(result) {
      const locations = result.rows;
      console.log("Orte geladen für Karte:", locations.length);
      
      // Generiere die HTML
      let locationsList = '';
      if (locations.length === 0) {
        locationsList = '<p>Keine Orte gefunden.</p>';
      } else {
        for (const loc of locations) {
          let imageHtml = '';
          if (loc.image) {
            // Relativen Pfad in absoluten umwandeln
            let imagePath = loc.image;
            if (!imagePath.startsWith('http') && !imagePath.startsWith('/')) {
              imagePath = '/uploads/' + imagePath;
            }
            imageHtml = `<img src="${imagePath}" alt="${loc.name}" style="max-width:100%; height:auto; margin-top:10px; border-radius:5px;" onerror="this.style.display='none'">`;
          }
          
          locationsList += `
            <div class="location-card">
              <h3>${loc.name}</h3>
              <div class="loc-meta">
                <span>Datum: ${loc.date ? new Date(loc.date).toLocaleDateString() : 'Unbekannt'}</span>
                ${loc.country_code ? `<span>Land: ${loc.country_code}</span>` : ''}
              </div>
              <p>Koordinaten: ${loc.latitude}, ${loc.longitude}</p>
              ${loc.description ? `<p>${loc.description}</p>` : ''}
              ${loc.highlight ? `<p class="highlight">Highlight: ${loc.highlight}</p>` : ''}
              ${imageHtml}
            </div>
          `;
        }
      }
      
      res.send(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Susibert</title>
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
              padding: 15px 20px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            }
            .logo {
              display: flex;
              align-items: center;
              gap: 10px;
              color: #f59a0c;
              text-decoration: none;
            }
            .logo-circle {
              width: 40px;
              height: 40px;
              background-color: #f59a0c;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              color: #000;
              font-size: 20px;
            }
            h1 {
              margin: 0;
              font-size: 1.5rem;
              color: #f59a0c;
            }
            .content {
              padding: 20px;
              max-width: 1200px;
              margin: 0 auto;
            }
            .button {
              background-color: #333;
              color: white;
              border: none;
              padding: 8px 15px;
              border-radius: 4px;
              text-decoration: none;
              transition: background-color 0.2s;
            }
            .button:hover {
              background-color: #444;
            }
            .button.primary {
              background-color: #f59a0c;
              color: black;
            }
            .button.primary:hover {
              background-color: #e08900;
            }
            h2 {
              color: #f59a0c;
              margin-top: 0;
              border-bottom: 1px solid #333;
              padding-bottom: 10px;
            }
            .notice {
              background-color: #333;
              padding: 15px;
              border-radius: 5px;
              margin-bottom: 20px;
            }
            .notice h3 {
              margin-top: 0;
              color: #f59a0c;
            }
            .locations-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
              gap: 20px;
              margin-top: 20px;
            }
            .location-card {
              background-color: #222;
              border-radius: 8px;
              padding: 15px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .location-card h3 {
              margin-top: 0;
              color: #f59a0c;
            }
            .loc-meta {
              display: flex;
              justify-content: space-between;
              color: #888;
              font-size: 0.9rem;
              margin-bottom: 10px;
            }
            .highlight {
              color: #f59a0c;
              font-style: italic;
            }
          </style>
        </head>
        <body>
          <header>
            <a href="/map" class="logo">
              <div class="logo-circle">S</div>
              <h1>Susibert</h1>
            </a>
            <div>
              <a href="/add-location" class="button primary">Ort hinzufügen</a>
              <a href="/logout" class="button">Abmelden</a>
            </div>
          </header>
          
          <div class="content">
            <div class="notice">
              <h3>Karte vereinfacht</h3>
              <p>Die Karte ist momentan aus Kompatibilitätsgründen auf Render nicht verfügbar. Stattdessen werden die Orte als Liste angezeigt.</p>
              <p>Anzahl der gefundenen Orte: ${locations.length}</p>
            </div>
            
            <h2>Besuchte Orte</h2>
            <div class="locations-grid">
              ${locationsList}
            </div>
          </div>
        </body>
        </html>
      `);
    })
    .catch(function(error) {
      console.error('Fehler beim Laden der Orte:', error);
      res.send(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Susibert</title>
          <style>
            body { font-family: sans-serif; background: #1a1a1a; color: #fff; margin: 0; padding: 20px; }
            h1 { color: #f59a0c; }
            .error { background: #ff5555; color: white; padding: 10px; border-radius: 5px; }
            a { color: #f59a0c; }
          </style>
        </head>
        <body>
          <h1>Susibert</h1>
          <div class="error">
            <p>Fehler beim Laden der Orte: ${error.message}</p>
          </div>
          <p><a href="/">Zurück zur Anmeldung</a></p>
        </body>
        </html>
      `);
    });
});

// Fehler-Route für nicht vorhandene Pfade
app.use(function(req, res) {
  res.status(404).send('<!DOCTYPE html>\
    <html lang="de">\
    <head>\
      <meta charset="UTF-8">\
      <meta name="viewport" content="width=device-width, initial-scale=1.0">\
      <title>Nicht gefunden - Susibert</title>\
      <style>\
        body {\
          font-family: system-ui, -apple-system, sans-serif;\
          background-color: #1a1a1a;\
          color: #f5f5f5;\
          margin: 0;\
          padding: 0;\
          display: flex;\
          justify-content: center;\
          align-items: center;\
          height: 100vh;\
          text-align: center;\
        }\
        .error-container {\
          max-width: 500px;\
          padding: 2rem;\
          background-color: #222;\
          border-radius: 8px;\
        }\
        h1 {\
          color: #f59a0c;\
          font-size: 2rem;\
          margin-bottom: 1rem;\
        }\
        a {\
          color: #f59a0c;\
          text-decoration: none;\
        }\
        a:hover {\
          text-decoration: underline;\
        }\
      </style>\
    </head>\
    <body>\
      <div class="error-container">\
        <h1>Seite nicht gefunden</h1>\
        <p>Die angeforderte Seite existiert nicht.</p>\
        <p><a href="/">Zurück zur Startseite</a></p>\
      </div>\
    </body>\
    </html>');
});

// Server starten
const server = app.listen(port, function() {
  console.log('Susibert Server läuft auf Port ' + port);
  console.log('Umgebung: ' + (process.env.NODE_ENV || 'development'));
  console.log('Datenbankverbindung: ' + (dbConnected ? 'Erfolgreich' : 'Nicht verbunden'));
  console.log('Datum/Zeit: ' + new Date().toISOString());
});

// Fehlerbehandlung
process.on('unhandledRejection', function(reason, promise) {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', function(error) {
  console.error('Uncaught Exception:', error);
});

// Graceful Shutdown
process.on('SIGTERM', function() {
  console.log('SIGTERM Signal erhalten, beende Server...');
  server.close(function() {
    if (pool) {
      pool.end();
    }
    console.log('Server beendet');
    process.exit(0);
  });
});