// Super-vereinfachte Version für Render
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
        pool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'locations')")
          .then(function(tabResult) {
            console.log('Tabelle locations existiert:', tabResult.rows[0].exists);
            
            // Wenn die Tabelle nicht existiert, erstelle sie
            if (!tabResult.rows[0].exists) {
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
            console.error('Fehler beim Prüfen der Tabelle:', err);
          });
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

// Geschützte Kartenansicht - STARK VEREINFACHTE VERSION
app.get('/map', requireAuth, function(req, res) {
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
      padding: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #f59a0c;
      text-decoration: none;
    }
    .logo-circle {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background-color: #f59a0c;
      color: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 20px;
    }
    h1 {
      color: #f59a0c;
      font-size: 1.5rem;
      margin: 0;
    }
    .button {
      background-color: #333;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      text-decoration: none;
    }
    .main-content {
      display: flex;
      height: calc(100vh - 62px);
    }
    .sidebar {
      width: 300px;
      background-color: #222;
      padding: 1rem;
      overflow-y: auto;
    }
    .sidebar h2 {
      color: #f59a0c;
      margin-top: 0;
      border-bottom: 1px solid #333;
      padding-bottom: 0.5rem;
    }
    #map-container {
      flex: 1;
      position: relative;
    }
    #map-placeholder {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #333;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2rem;
    }
    .location-card {
      background-color: #333;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .location-card h3 {
      color: #f5f5f5;
      margin-top: 0;
      margin-bottom: 0.5rem;
    }
    .location-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: #888;
      margin-bottom: 0.5rem;
    }
    .location-image {
      width: 100%;
      height: 150px;
      object-fit: cover;
      border-radius: 4px;
      margin-top: 0.5rem;
    }
    .info-message {
      background-color: rgba(245, 154, 12, 0.1);
      border: 1px solid #f59a0c;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    .error-message {
      background-color: rgba(255, 77, 77, 0.1);
      border: 1px solid #ff4d4d;
      color: #ff4d4d;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
  </style>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
</head>
<body>
  <header>
    <a href="/map" class="logo">
      <div class="logo-circle">S</div>
      <h1>Susibert</h1>
    </a>
    <a href="/" class="button">Abmelden</a>
  </header>
  
  <div class="main-content">
    <div class="sidebar">
      <h2>Besuchte Orte</h2>
      <div id="locations-list">
        <div class="info-message">Orte werden geladen...</div>
      </div>
    </div>
    
    <div id="map-container">
      <div id="map-placeholder">
        <h2>Karte wird geladen...</h2>
        <p>Bitte aktiviere JavaScript in deinem Browser und/oder verwende einen modernen Webbrowser.</p>
      </div>
      <div id="map" style="width: 100%; height: 100%;"></div>
    </div>
  </div>

  <script>
    // Handler für Leaflet-Fehler
    window.onerror = function(message, source, lineno, colno, error) {
      console.error('Fehler auf Seite:', error);
      document.getElementById('map-placeholder').innerHTML = 
        '<div class="error-message">Es gab einen Fehler: ' + message + '</div>';
      return true;
    };

    document.addEventListener('DOMContentLoaded', function() {
      var mapDiv = document.getElementById('map');
      var locationsDiv = document.getElementById('locations-list');
      var mapPlaceholder = document.getElementById('map-placeholder');
      
      // Karte initialisieren
      try {
        console.log('Initialisiere Karte...');
        var mymap = L.map('map').setView([51.165, 10.452], 6);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19
        }).addTo(mymap);
        
        // Verstecke Platzhalter
        mapPlaceholder.style.display = 'none';
        
        // Lade Orte
        fetch('/api/locations')
          .then(function(response) {
            return response.json();
          })
          .then(function(locations) {
            console.log('Orte geladen:', locations.length);
            
            // Leere den Locations-Container
            locationsDiv.innerHTML = '';
            
            if (locations.length === 0) {
              locationsDiv.innerHTML = '<div class="info-message">Keine Orte gefunden</div>';
              return;
            }
            
            var bounds = [];
            
            // Für jeden Ort...
            locations.forEach(function(location) {
              console.log('Verarbeite Ort:', location.name);
              
              // Erstelle Karte
              var card = document.createElement('div');
              card.className = 'location-card';
              
              var html = '<h3>' + location.name + '</h3>';
              html += '<div class="location-meta">';
              html += '<span>' + location.date + '</span>';
              if (location.countryCode) {
                html += '<span>' + location.countryCode + '</span>';
              }
              html += '</div>';
              
              if (location.description) {
                html += '<p>' + location.description + '</p>';
              }
              
              if (location.image) {
                html += '<img src="' + location.image + '" class="location-image" onerror="this.style.display=\'none\'">';
              }
              
              card.innerHTML = html;
              locationsDiv.appendChild(card);
              
              // Füge Marker zur Karte hinzu
              try {
                var lat = parseFloat(location.latitude);
                var lng = parseFloat(location.longitude);
                
                if (!isNaN(lat) && !isNaN(lng)) {
                  console.log('Füge Marker hinzu:', lat, lng);
                  
                  // Füge Bounds für später hinzu
                  bounds.push([lat, lng]);
                  
                  // Erstelle Marker
                  var marker = L.marker([lat, lng]).addTo(mymap);
                  marker.bindPopup('<b>' + location.name + '</b><br>' + location.date);
                  
                  // Erstelle orangene Kreise
                  for (var i = 0; i < 3; i++) {
                    var radius = 50000 * (1 - i/3);
                    var opacity = 0.15 + (i / 3) * 0.2;
                    
                    L.circle([lat, lng], {
                      radius: radius,
                      color: 'transparent',
                      fillColor: '#f59a0c',
                      fillOpacity: opacity
                    }).addTo(mymap);
                  }
                }
              } catch (e) {
                console.error('Fehler beim Hinzufügen des Markers:', e);
              }
            });
            
            // Passe Karte an alle Marker an
            if (bounds.length > 0) {
              try {
                mymap.fitBounds(bounds);
              } catch (e) {
                console.error('Fehler beim Anpassen der Kartenansicht:', e);
              }
            }
          })
          .catch(function(error) {
            console.error('Fehler beim Laden der Orte:', error);
            locationsDiv.innerHTML = '<div class="error-message">Fehler beim Laden der Orte: ' + error.message + '</div>';
          });
      } catch (e) {
        console.error('Fehler beim Initialisieren der Karte:', e);
        mapPlaceholder.innerHTML = '<div class="error-message">Fehler beim Laden der Karte: ' + e.message + '</div>';
      }
    });
  </script>
</body>
</html>
  `);
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