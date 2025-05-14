// Vereinfachte Version der Susibert-Anwendung für Render
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
      .then(function(result) {
        console.log('Tabelle locations existiert:', result.rows[0].exists);
        
        // Wenn die Tabelle nicht existiert, erstelle sie
        if (!result.rows[0].exists) {
          console.log('Erstelle Tabelle locations...');
          return pool.query(
            "CREATE TABLE IF NOT EXISTS locations (" +
            "id SERIAL PRIMARY KEY, " +
            "name VARCHAR(255) NOT NULL, " +
            "date DATE, " +
            "description TEXT, " +
            "highlight TEXT, " +
            "latitude VARCHAR(50) NOT NULL, " +
            "longitude VARCHAR(50) NOT NULL, " +
            "country_code VARCHAR(10), " +
            "image VARCHAR(255), " +
            "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
          ).then(function() {
            console.log('Tabelle locations erstellt');
          });
        }
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
app.get('/api/health', function(req, res) {
  res.json({
    status: 'online',
    version: '1.0.0',
    database: dbConnected ? 'verbunden' : 'nicht verbunden',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Direkter Login-Check
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

// Login-Verarbeitung
app.post('/api/login', function(req, res) {
  var accessCode = req.body.accessCode;
  
  console.log('Login-Versuch mit Code:', accessCode ? '***' + accessCode.substr(-2) : 'fehlt');
  
  if (accessCode === ACCESS_CODE) {
    // Erstelle eine neue Session
    var sessionId = createSession();
    
    // Setze ein Session-Cookie und leite zur geschützten Seite um
    res.setHeader('Set-Cookie', 'sessionId=' + sessionId + '; Path=/; HttpOnly; Max-Age=86400');
    res.json({ success: true, redirect: '/map' });
  } else {
    res.status(401).json({ success: false, message: 'Ungültiger Zugangscode' });
  }
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

  console.log('Neuer Ort wird erstellt...', req.body);
  
  var name = req.body.name;
  var date = req.body.date;
  var description = req.body.description;
  var highlight = req.body.highlight;
  var latitude = req.body.latitude;
  var longitude = req.body.longitude;
  var countryCode = req.body.countryCode;
  
  if (!name || !latitude || !longitude) {
    return res.status(400).json({ error: 'Name, Breitengrad und Längengrad sind erforderlich' });
  }
  
  // Wenn ein Bild hochgeladen wurde, speichere den Pfad
  var imagePath = req.file ? req.file.filename : null;
  console.log('Bildpfad:', imagePath);
  
  // SQL-Query zur Erstellung eines neuen Standorts
  pool.query(
    'INSERT INTO locations (name, date, description, highlight, latitude, longitude, country_code, image) ' +
    'VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
    [name, date || new Date(), description, highlight, latitude, longitude, countryCode, imagePath]
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
      console.error('Fehler beim Erstellen des Standorts:', error);
      res.status(500).json({ error: 'Datenbankfehler', details: error.message });
    });
});

// Ort löschen
app.delete('/api/locations/:id', requireAuth, function(req, res) {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verbunden' });
  }

  var id = req.params.id;
  console.log('Lösche Ort mit ID:', id);
  
  // Finde den Ort, um das zugehörige Bild zu löschen, falls vorhanden
  pool.query('SELECT * FROM locations WHERE id = $1', [id])
    .then(function(findResult) {
      if (findResult.rows.length === 0) {
        return res.status(404).json({ error: 'Standort nicht gefunden' });
      }
      
      var location = findResult.rows[0];
      
      // Lösche den Ort aus der Datenbank
      return pool.query('DELETE FROM locations WHERE id = $1 RETURNING *', [id])
        .then(function() {
          // Wenn der Ort ein Bild hat, versuche es zu löschen
          if (location.image && !location.image.startsWith('http')) {
            var imagePath = path.join(uploadsDir, location.image);
            if (fs.existsSync(imagePath)) {
              try {
                fs.unlinkSync(imagePath);
                console.log('Bild gelöscht:', imagePath);
              } catch (err) {
                console.error('Fehler beim Löschen des Bildes:', err);
              }
            }
          }
          
          console.log('Ort gelöscht:', location);
          res.json({ success: true, message: 'Standort erfolgreich gelöscht', location: location });
        });
    })
    .catch(function(error) {
      console.error('Fehler beim Löschen des Standorts:', error);
      res.status(500).json({ error: 'Datenbankfehler', details: error.message });
    });
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

// Geschützte Kartenansicht
app.get('/map', requireAuth, function(req, res) {
  res.send('<!DOCTYPE html>\
<html lang="de">\
<head>\
  <meta charset="UTF-8">\
  <meta name="viewport" content="width=device-width, initial-scale=1.0">\
  <title>Susibert</title>\
  <!-- OpenStreetMap-Leaflet -->\
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">\
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>\
  <style>\
    body {\
      font-family: system-ui, -apple-system, sans-serif;\
      background-color: #1a1a1a;\
      color: #f5f5f5;\
      margin: 0;\
      padding: 0;\
      overflow-x: hidden;\
    }\
    .app-container {\
      display: flex;\
      flex-direction: column;\
      min-height: 100vh;\
    }\
    header {\
      background-color: #222;\
      padding: 0.75rem 1.5rem;\
      display: flex;\
      justify-content: space-between;\
      align-items: center;\
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);\
    }\
    .logo {\
      display: flex;\
      align-items: center;\
      gap: 0.75rem;\
      color: #f59a0c;\
      text-decoration: none;\
    }\
    .logo-img {\
      width: 40px;\
      height: 40px;\
      border-radius: 20px;\
      overflow: hidden;\
      border: 2px solid #f59a0c;\
      background-color: #f59a0c;\
      display: flex;\
      align-items: center;\
      justify-content: center;\
      font-size: 20px;\
      font-weight: bold;\
      color: #000;\
    }\
    .logo-text {\
      font-size: 1.5rem;\
      font-weight: bold;\
      margin: 0;\
    }\
    .actions {\
      display: flex;\
      gap: 1rem;\
    }\
    .button {\
      background-color: #333;\
      color: #fff;\
      border: none;\
      padding: 8px 16px;\
      border-radius: 4px;\
      cursor: pointer;\
      font-size: 14px;\
      text-decoration: none;\
      display: inline-flex;\
      align-items: center;\
      gap: 0.5rem;\
      transition: background-color 0.2s;\
    }\
    .button:hover {\
      background-color: #444;\
    }\
    .button.primary {\
      background-color: #f59a0c;\
      color: #000;\
    }\
    .button.primary:hover {\
      background-color: #e08900;\
    }\
    .main-content {\
      flex: 1;\
      display: flex;\
      position: relative;\
    }\
    #map {\
      flex: 1;\
      height: calc(100vh - 58px);\
      z-index: 1;\
    }\
    .sidebar {\
      width: 360px;\
      background-color: #222;\
      overflow-y: auto;\
      padding: 1rem;\
      box-shadow: -2px 0 5px rgba(0, 0, 0, 0.3);\
      z-index: 2;\
      max-height: calc(100vh - 58px);\
    }\
    .sidebar h2 {\
      color: #f59a0c;\
      margin-top: 0;\
      border-bottom: 1px solid #333;\
      padding-bottom: 0.5rem;\
    }\
    .locations-list {\
      display: flex;\
      flex-direction: column;\
      gap: 1rem;\
    }\
    .location-card {\
      background-color: #333;\
      border-radius: 8px;\
      padding: 1rem;\
      transition: transform 0.2s;\
      cursor: pointer;\
    }\
    .location-card:hover {\
      transform: translateY(-3px);\
      box-shadow: 0 3px 6px rgba(0, 0, 0, 0.2);\
    }\
    .location-card h3 {\
      margin-top: 0;\
      margin-bottom: 0.25rem;\
      color: #f5f5f5;\
    }\
    .location-meta {\
      display: flex;\
      align-items: center;\
      gap: 0.5rem;\
      margin-bottom: 0.75rem;\
      font-size: 0.85rem;\
      color: #aaa;\
    }\
    .location-image {\
      width: 100%;\
      height: 140px;\
      border-radius: 4px;\
      object-fit: cover;\
      margin-top: 0.5rem;\
    }\
    .location-description {\
      margin-top: 0.75rem;\
      font-size: 0.9rem;\
      color: #ddd;\
    }\
    .location-highlight {\
      margin-top: 0.5rem;\
      font-style: italic;\
      color: #f59a0c;\
      font-size: 0.85rem;\
    }\
    .error-message {\
      background-color: rgba(255, 80, 80, 0.2);\
      border: 1px solid #ff5050;\
      color: #ff5050;\
      padding: 10px;\
      border-radius: 4px;\
      margin: 10px 0;\
    }\
    .status-text {\
      color: #888;\
      font-size: 0.9rem;\
      margin: 1rem 0;\
    }\
    \
    /* Modal für Ort Details und Bearbeitung */\
    .modal {\
      display: none;\
      position: fixed;\
      top: 0;\
      left: 0;\
      width: 100%;\
      height: 100%;\
      background-color: rgba(0, 0, 0, 0.7);\
      z-index: 999;\
      justify-content: center;\
      align-items: center;\
    }\
    .modal-content {\
      background-color: #222;\
      border-radius: 8px;\
      padding: 1.5rem;\
      width: 90%;\
      max-width: 600px;\
      max-height: 90vh;\
      overflow-y: auto;\
    }\
    .modal-header {\
      display: flex;\
      justify-content: space-between;\
      align-items: center;\
      margin-bottom: 1rem;\
      border-bottom: 1px solid #333;\
      padding-bottom: 0.5rem;\
    }\
    .modal-header h2 {\
      margin: 0;\
      color: #f59a0c;\
    }\
    .close-modal {\
      background: none;\
      border: none;\
      color: #f5f5f5;\
      font-size: 1.5rem;\
      cursor: pointer;\
    }\
    .modal-form label {\
      display: block;\
      margin-bottom: 0.25rem;\
      color: #ddd;\
    }\
    .modal-form input,\
    .modal-form textarea,\
    .modal-form select {\
      width: 100%;\
      padding: 0.75rem;\
      margin-bottom: 1rem;\
      background-color: #333;\
      border: 1px solid #444;\
      border-radius: 4px;\
      color: #f5f5f5;\
    }\
    .modal-form textarea {\
      min-height: 100px;\
      resize: vertical;\
    }\
    .modal-actions {\
      display: flex;\
      justify-content: flex-end;\
      gap: 1rem;\
      margin-top: 1rem;\
    }\
    \
    /* Responsive Anpassungen */\
    @media (max-width: 768px) {\
      .main-content {\
        flex-direction: column;\
      }\
      #map {\
        height: 50vh;\
      }\
      .sidebar {\
        width: 100%;\
        max-height: 50vh;\
      }\
    }\
    \
    /* Details Modal */\
    .detail-image {\
      width: 100%;\
      height: auto;\
      max-height: 300px;\
      object-fit: cover;\
      border-radius: 4px;\
      margin-bottom: 1rem;\
    }\
    .detail-content h3 {\
      color: #f59a0c;\
      margin-top: 0;\
    }\
    .detail-meta {\
      display: flex;\
      justify-content: space-between;\
      margin-bottom: 1rem;\
      color: #aaa;\
      font-size: 0.9rem;\
    }\
    .detail-actions {\
      display: flex;\
      justify-content: space-between;\
      margin-top: 1.5rem;\
    }\
  </style>\
</head>\
<body>\
  <div class="app-container">\
    <header>\
      <a href="/map" class="logo">\
        <div class="logo-img">\
          <div>S</div>\
        </div>\
        <h1 class="logo-text">Susibert</h1>\
      </a>\
      <div class="actions">\
        <button id="addLocationBtn" class="button primary">\
          <span>Ort hinzufügen</span>\
        </button>\
        <a href="/" class="button">Abmelden</a>\
      </div>\
    </header>\
    \
    <div class="main-content">\
      <div id="map"></div>\
      <div class="sidebar">\
        <h2>Besuchte Orte</h2>\
        <div id="locations" class="locations-list">\
          <div class="status-text">Orte werden geladen...</div>\
        </div>\
      </div>\
    </div>\
  </div>\
  \
  <!-- Modal für Ort hinzufügen/bearbeiten -->\
  <div id="locationModal" class="modal">\
    <div class="modal-content">\
      <div class="modal-header">\
        <h2 id="modalTitle">Ort hinzufügen</h2>\
        <button class="close-modal" id="closeModal">&times;</button>\
      </div>\
      <form id="locationForm" class="modal-form" enctype="multipart/form-data">\
        <input type="hidden" id="locationId" name="id">\
        \
        <label for="name">Name*</label>\
        <input type="text" id="name" name="name" required placeholder="z.B. Barcelona, Spain">\
        \
        <label for="date">Datum</label>\
        <input type="date" id="date" name="date">\
        \
        <label for="description">Beschreibung</label>\
        <textarea id="description" name="description" placeholder="Was habt ihr dort gemacht?"></textarea>\
        \
        <label for="highlight">Highlight</label>\
        <input type="text" id="highlight" name="highlight" placeholder="Was war besonders beeindruckend?">\
        \
        <label for="countryCode">Land</label>\
        <input type="text" id="countryCode" name="countryCode" placeholder="z.B. DE, FR, ES">\
        \
        <label for="latitude">Breitengrad*</label>\
        <input type="text" id="latitude" name="latitude" required placeholder="z.B. 51.1657">\
        \
        <label for="longitude">Längengrad*</label>\
        <input type="text" id="longitude" name="longitude" required placeholder="z.B. 10.4515">\
        \
        <label for="image">Bild</label>\
        <input type="file" id="image" name="image" accept="image/*">\
        \
        <div class="modal-actions">\
          <button type="button" class="button" id="cancelLocation">Abbrechen</button>\
          <button type="submit" class="button primary">Speichern</button>\
        </div>\
      </form>\
    </div>\
  </div>\
  \
  <!-- Modal für Ort-Details -->\
  <div id="detailModal" class="modal">\
    <div class="modal-content">\
      <div class="modal-header">\
        <h2 id="detailTitle">Ort Details</h2>\
        <button class="close-modal" id="closeDetailModal">&times;</button>\
      </div>\
      <div class="detail-content">\
        <img id="detailImage" src="" alt="" class="detail-image">\
        <div class="detail-meta">\
          <span id="detailDate"></span>\
          <span id="detailCountry"></span>\
        </div>\
        <p id="detailDescription"></p>\
        <div id="detailHighlightBox">\
          <h3>Highlight</h3>\
          <p id="detailHighlight"></p>\
        </div>\
        <div class="detail-actions">\
          <button class="button" id="showOnMapBtn">Auf Karte anzeigen</button>\
          <button class="button" id="deleteLocationBtn">Löschen</button>\
        </div>\
      </div>\
    </div>\
  </div>\
\
  <script>\
    // Globale Variablen\
    var map;\
    var markers = [];\
    var currentLocation = null;\
    var editMode = false;\
    var tempMarker = null;\
    \
    // Debugging-Funktion\
    function debug(message, data) {\
      console.log("[DEBUG] " + message, data || "");\
    }\
    \
    // Warte, bis das Dokument vollständig geladen ist\
    window.addEventListener("DOMContentLoaded", function() {\
      debug("Seite geladen, initialisiere Anwendung...");\
      \
      // DOM-Elemente\
      var locationModal = document.getElementById("locationModal");\
      var detailModal = document.getElementById("detailModal");\
      var locationForm = document.getElementById("locationForm");\
      var addLocationBtn = document.getElementById("addLocationBtn");\
      var closeModal = document.getElementById("closeModal");\
      var closeDetailModal = document.getElementById("closeDetailModal");\
      var cancelLocation = document.getElementById("cancelLocation");\
      var showOnMapBtn = document.getElementById("showOnMapBtn");\
      var deleteLocationBtn = document.getElementById("deleteLocationBtn");\
      \
      // Modal-Funktionen\
      function showLocationModal() {\
        locationModal.style.display = "flex";\
      }\
      \
      function hideLocationModal() {\
        locationModal.style.display = "none";\
        locationForm.reset();\
        if (tempMarker && map) {\
          map.removeLayer(tempMarker);\
          tempMarker = null;\
        }\
      }\
      \
      function showLocationDetails(location) {\
        currentLocation = location;\
        \
        document.getElementById("detailTitle").textContent = location.name;\
        document.getElementById("detailDate").textContent = location.date || "";\
        document.getElementById("detailCountry").textContent = location.countryCode || "";\
        document.getElementById("detailDescription").textContent = location.description || "";\
        \
        var detailImage = document.getElementById("detailImage");\
        if (location.image) {\
          detailImage.src = location.image;\
          detailImage.style.display = "block";\
          \
          // Fehlerbehandlung für Bilder\
          detailImage.onerror = function() {\
            detailImage.style.display = "none";\
          };\
        } else {\
          detailImage.style.display = "none";\
        }\
        \
        var highlightBox = document.getElementById("detailHighlightBox");\
        var highlightText = document.getElementById("detailHighlight");\
        if (location.highlight) {\
          highlightText.textContent = location.highlight;\
          highlightBox.style.display = "block";\
        } else {\
          highlightBox.style.display = "none";\
        }\
        \
        detailModal.style.display = "flex";\
      }\
      \
      function hideDetailModal() {\
        detailModal.style.display = "none";\
        currentLocation = null;\
      }\
      \
      // Event Listeners\
      addLocationBtn.addEventListener("click", function() {\
        document.getElementById("modalTitle").textContent = "Ort hinzufügen";\
        document.getElementById("locationId").value = "";\
        editMode = true;\
        showLocationModal();\
      });\
      \
      closeModal.addEventListener("click", hideLocationModal);\
      cancelLocation.addEventListener("click", hideLocationModal);\
      \
      closeDetailModal.addEventListener("click", hideDetailModal);\
      \
      showOnMapBtn.addEventListener("click", function() {\
        if (currentLocation && map) {\
          var lat = parseFloat(currentLocation.latitude);\
          var lng = parseFloat(currentLocation.longitude);\
          if (!isNaN(lat) && !isNaN(lng)) {\
            map.setView([lat, lng], 12);\
          }\
          hideDetailModal();\
        }\
      });\
      \
      deleteLocationBtn.addEventListener("click", function() {\
        if (currentLocation && confirm("Möchtest du diesen Ort wirklich löschen?")) {\
          deleteLocation(currentLocation.id);\
        }\
      });\
      \
      // Formular-Handling\
      locationForm.addEventListener("submit", function(e) {\
        e.preventDefault();\
        \
        var formData = new FormData(locationForm);\
        \
        // Zeige Ladeindikator\
        document.getElementById("modalTitle").textContent = "Speichere Ort...";\
        \
        fetch("/api/locations", {\
          method: "POST",\
          body: formData\
        })\
        .then(function(response) {\
          if (!response.ok) {\
            throw new Error("Fehler beim Speichern des Ortes: " + response.status);\
          }\
          return response.json();\
        })\
        .then(function(location) {\
          debug("Ort gespeichert:", location);\
          hideLocationModal();\
          loadLocations(); // Orte neu laden\
        })\
        .catch(function(error) {\
          console.error("Fehler:", error);\
          document.getElementById("modalTitle").textContent = "Fehler beim Speichern";\
          setTimeout(function() {\
            document.getElementById("modalTitle").textContent = "Ort hinzufügen";\
          }, 3000);\
        });\
      });\
      \
      // Initialisiere Karte\
      try {\
        debug("Initialisiere Karte...");\
        initMap();\
        debug("Karte initialisiert.");\
      } catch (e) {\
        console.error("Fehler bei der Karteninitialisierung:", e);\
        document.getElementById("map").innerHTML = \
          \'<div class="error-message">Fehler beim Laden der Karte: \' + e.message + \'</div>\';\
      }\
      \
      // Lade Orte\
      debug("Lade Orte...");\
      loadLocations();\
    });\
    \
    // Funktion zum Initialisieren der Karte\
    function initMap() {\
      debug("Initialisiere Leaflet Map");\
      // Erstelle die Karte\
      map = L.map("map", {\
        attributionControl: false,\
        zoomControl: true\
      }).setView([51.1657, 10.4515], 6);\
      \
      // Event-Listener für Klicks auf die Karte (im Edit-Modus)\
      map.on("click", function(e) {\
        if (editMode) {\
          var lat = e.latlng.lat;\
          var lng = e.latlng.lng;\
          \
          // Setze die Koordinaten im Formular\
          document.getElementById("latitude").value = lat.toFixed(6);\
          document.getElementById("longitude").value = lng.toFixed(6);\
          \
          // Füge temporären Marker hinzu\
          if (tempMarker) {\
            map.removeLayer(tempMarker);\
          }\
          \
          tempMarker = L.marker([lat, lng]).addTo(map);\
          tempMarker.bindPopup("Neuer Ort").openPopup();\
        }\
      });\
      \
      // Füge den Kartenstil hinzu\
      debug("Füge Kartenlayer hinzu");\
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {\
        attribution: \'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>\',\
        subdomains: "abcd",\
        maxZoom: 19\
      }).addTo(map);\
      \
      // Attribution hinzufügen\
      L.control.attribution({\
        position: "bottomright"\
      }).addTo(map);\
      \
      debug("Karte erfolgreich initialisiert");\
    }\
    \
    // Funktion zum Laden der Locations\
    function loadLocations() {\
      debug("Lade Locations vom Server...");\
      var locationsContainer = document.getElementById("locations");\
      locationsContainer.innerHTML = \'<div class="status-text">Orte werden geladen...</div>\';\
      \
      // Lösche bestehende Marker\
      try {\
        if (markers.length > 0 && map) {\
          debug("Lösche bestehende Marker: " + markers.length);\
          for (var i = 0; i < markers.length; i++) {\
            if (map) map.removeLayer(markers[i]);\
          }\
          markers = [];\
        }\
      } catch (e) {\
        console.error("Fehler beim Entfernen der Marker:", e);\
      }\
      \
      fetch("/api/locations")\
        .then(function(response) {\
          if (!response.ok) {\
            throw new Error("HTTP Fehler " + response.status);\
          }\
          return response.json();\
        })\
        .then(function(locations) {\
          debug("Orte geladen:", locations.length);\
          \
          // Locations anzeigen\
          locationsContainer.innerHTML = "";\
          \
          if (locations.length === 0) {\
            locationsContainer.innerHTML = "<p>Keine Orte gefunden</p>";\
            return;\
          }\
          \
          var bounds = [];\
          \
          for (var i = 0; i < locations.length; i++) {\
            var loc = locations[i];\
            \
            try {\
              // Orte auf der Karte anzeigen, aber nur wenn map existiert\
              if (map) {\
                var lat = parseFloat(loc.latitude);\
                var lng = parseFloat(loc.longitude);\
                \
                if (!isNaN(lat) && !isNaN(lng)) {\
                  bounds.push([lat, lng]);\
                  \
                  // Marker mit orangenem Gradient erstellen\
                  debug("Erstelle Marker für: " + loc.name);\
                  for (var j = 0; j < 5; j++) {\
                    var radius = 50000 * (1 - j/5);\
                    var opacity = 0.05 + (j / 5) * 0.3;\
                    \
                    var circle = L.circle([lat, lng], {\
                      radius: radius,\
                      color: "transparent",\
                      fillColor: "#f59a0c",\
                      fillOpacity: opacity\
                    }).addTo(map);\
                    \
                    markers.push(circle);\
                  }\
                  \
                  // Hauptmarker hinzufügen\
                  var marker = L.marker([lat, lng]).addTo(map);\
                  marker.bindPopup("<b>" + loc.name + "</b><br>" + loc.date);\
                  \
                  // Klick-Handler für Marker\
                  (function(location) {\
                    marker.on("click", function() {\
                      debug("Marker geklickt: " + location.name);\
                      showLocationDetails(location);\
                    });\
                  })(loc);\
                  \
                  markers.push(marker);\
                }\
              } else {\
                debug("Map ist nicht definiert!");\
              }\
            } catch (e) {\
              console.error("Fehler beim Anzeigen des Markers:", e);\
            }\
            \
            // Location-Karte erstellen\
            var card = document.createElement("div");\
            card.className = "location-card";\
            \
            var imageHtml = "";\
            if (loc.image) {\
              imageHtml = "<img src=\\"" + loc.image + "\\" alt=\\"" + loc.name + "\\" class=\\"location-image\\" onerror=\\"this.style.display=\'none\';\\">";\
            }\
            \
            var cardHtml = \
              "<h3>" + loc.name + "</h3>" +\
              "<div class=\\"location-meta\\">" +\
                "<span>" + (loc.date || "") + "</span>" +\
                (loc.countryCode ? "<span>" + loc.countryCode + "</span>" : "") +\
              "</div>" +\
              imageHtml;\
              \
            if (loc.description) {\
              cardHtml += "<div class=\\"location-description\\">" + loc.description + "</div>";\
            }\
              \
            if (loc.highlight) {\
              cardHtml += "<div class=\\"location-highlight\\">" + loc.highlight + "</div>";\
            }\
            \
            card.innerHTML = cardHtml;\
            \
            // Karte klickbar machen\
            (function(location) {\
              card.addEventListener("click", function() {\
                debug("Karte geklickt: " + location.name);\
                showLocationDetails(location);\
              });\
            })(loc);\
            \
            locationsContainer.appendChild(card);\
          }\
          \
          // Kartenansicht an alle Marker anpassen\
          if (bounds.length > 0 && map) {\
            try {\
              debug("Karte an Grenzen anpassen");\
              map.fitBounds(bounds, { padding: [50, 50] });\
            } catch (e) {\
              console.error("Fehler beim Anpassen der Kartenansicht:", e);\
            }\
          }\
        })\
        .catch(function(error) {\
          console.error("Fehler beim Laden der Locations:", error);\
          locationsContainer.innerHTML = \
            \'<div class="error-message">Fehler beim Laden der Orte: \' + error.message + \'</div>\';\
        });\
    }\
    \
    // Funktion zum Löschen eines Ortes\
    function deleteLocation(id) {\
      fetch("/api/locations/" + id, {\
        method: "DELETE"\
      })\
      .then(function(response) {\
        if (!response.ok) {\
          throw new Error("Fehler beim Löschen des Ortes: " + response.status);\
        }\
        return response.json();\
      })\
      .then(function(data) {\
        debug("Ort gelöscht:", data);\
        document.getElementById("detailModal").style.display = "none";\
        loadLocations(); // Orte neu laden\
      })\
      .catch(function(error) {\
        console.error("Fehler:", error);\
        alert("Fehler beim Löschen des Ortes: " + error.message);\
      });\
    }\
  </script>\
</body>\
</html>');
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