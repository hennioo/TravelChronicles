// Super-vereinfachte Version der Susibert-Anwendung für Render
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

// Express-App und Port
const app = express();
const port = process.env.PORT || 10000;

// Middleware einrichten
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Einfaches Session-Management
const sessions = {};

// Erstellt eine neue Session
function createSession() {
  const sessionId = crypto.randomBytes(16).toString('hex');
  const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 Stunden
  sessions[sessionId] = { expires };
  return sessionId;
}

// Prüft, ob eine Session gültig ist
function isValidSession(sessionId) {
  if (!sessionId || !sessions[sessionId]) return false;
  
  if (sessions[sessionId].expires <= Date.now()) {
    delete sessions[sessionId];
    return false;
  }
  
  return true;
}

// Auth-Middleware für geschützte Routen
function requireAuth(req, res, next) {
  // Session-ID aus Query-Parameter oder Cookie extrahieren
  const sessionId = req.query.session || req.headers.cookie?.split(';').find(c => c.trim().startsWith('sessionId='))?.split('=')[1];
  
  if (isValidSession(sessionId)) {
    next();
  } else {
    res.redirect('/?error=auth');
  }
}

// Datenbankverbindung
let pool;
let dbConnected = false;

try {
  if (process.env.DATABASE_URL) {
    console.log('Verbinde mit Datenbank über DATABASE_URL...');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    // Teste die Datenbankverbindung direkt
    pool.query('SELECT NOW() as now')
      .then(result => {
        console.log('Datenbankverbindung erfolgreich hergestellt:', result.rows[0]);
        dbConnected = true;
      })
      .catch(err => {
        console.error('Fehler bei der Datenbankabfrage:', err);
      });
      
    // Prüfe, ob die Tabelle locations existiert
    pool.query(`SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'locations'
    )`)
      .then(result => {
        console.log('Tabelle locations existiert:', result.rows[0].exists);
      })
      .catch(err => {
        console.error('Fehler beim Prüfen der Tabelle locations:', err);
      });
  } else {
    console.log('DATABASE_URL nicht vorhanden, starte im Offline-Modus');
  }
} catch (error) {
  console.error('Fehler beim Datenbankverbindungsaufbau:', error);
}

// Uploads-Verzeichnis einrichten
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer für Datei-Uploads konfigurieren
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `image-${uniqueSuffix}${ext}`);
  }
});
const upload = multer({ storage });

// Statische Dateien
app.use('/uploads', express.static(uploadsDir));

// API-Routen
app.get('/api/health', async (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    database: dbConnected ? 'verbunden' : 'nicht verbunden',
    environment: process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString()
  });
});

// Locations API
app.get('/api/locations', requireAuth, async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verbunden' });
  }

  try {
    console.log("API: Lade Locations aus der Datenbank...");
    const result = await pool.query(`SELECT * FROM locations ORDER BY id DESC`);
    console.log("Locations geladen, Anzahl:", result.rows.length);
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const locations = result.rows.map(row => {
      // Verarbeite den Bildpfad, um eine vollständige URL zu erstellen
      let imagePath = row.image || '';
      
      // Wenn das Bild eine relative URL ohne führenden Slash ist, füge /uploads/ hinzu
      if (imagePath && !imagePath.startsWith('http') && !imagePath.startsWith('/')) {
        imagePath = `/uploads/${imagePath}`;
      }
      
      // Wenn das Bild eine relative URL mit führendem Slash ist, füge die Basis-URL hinzu
      if (imagePath && imagePath.startsWith('/')) {
        imagePath = `${baseUrl}${imagePath}`;
      }
      
      return {
        id: row.id,
        name: row.name || "Unbenannter Ort",
        date: row.date || new Date().toISOString().split('T')[0],
        description: row.description || "",
        highlight: row.highlight || "",
        latitude: row.latitude || "0",
        longitude: row.longitude || "0",
        countryCode: row.country_code || row.countrycode || "XX",
        image: imagePath
      };
    });
    
    res.json(locations);
  } catch (error) {
    console.error('Fehler beim Abrufen der Locations:', error);
    res.status(500).json({ error: 'Datenbankfehler', details: error.message });
  }
});

// Login überprüfen
app.post('/api/login', (req, res) => {
  const { accessCode } = req.body;
  const configuredCode = process.env.ACCESS_CODE || 'suuuu';
  
  console.log('Login-Versuch mit Code:', accessCode ? '***' + accessCode.substr(-2) : 'fehlt');
  
  if (accessCode === configuredCode) {
    // Erstelle eine neue Session
    const sessionId = createSession();
    
    // Setze ein Session-Cookie und leite zur geschützten Seite um
    res.setHeader('Set-Cookie', `sessionId=${sessionId}; Path=/; HttpOnly; Max-Age=86400`);
    res.json({ success: true, redirect: '/map' });
  } else {
    res.status(401).json({ success: false, message: 'Ungültiger Zugangscode' });
  }
});

// Login-Seite
app.get('/', (req, res) => {
  // Prüfe, ob bereits eingeloggt
  const sessionId = req.headers.cookie?.split(';').find(c => c.trim().startsWith('sessionId='))?.split('=')[1];
  if (isValidSession(sessionId)) {
    return res.redirect('/map');
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
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
    }
    .login-container {
      text-align: center;
      max-width: 400px;
      padding: 2rem;
      background-color: #222;
      border-radius: 8px;
    }
    h1 {
      color: #f59a0c;
      font-size: 2rem;
      margin: 0 0 1rem 0;
    }
    p {
      margin-bottom: 1.5rem;
    }
    input {
      display: block;
      width: 100%;
      padding: 10px;
      margin: 1rem 0;
      background-color: #333;
      border: none;
      border-radius: 4px;
      color: white;
      box-sizing: border-box;
    }
    button {
      background-color: #f59a0c;
      color: black;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    }
    button:hover {
      background-color: #e08900;
    }
    #message {
      color: #ff4d4d;
      margin-top: 1rem;
      min-height: 20px;
    }
    .bypass-link {
      margin-top: 20px;
      font-size: 0.85rem;
      color: #888;
    }
    .bypass-link a {
      color: #aaa;
      text-decoration: none;
    }
    .bypass-link a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <h1>Susibert</h1>
    <p>Bitte gib den Zugangscode ein, um die Reisekarte zu sehen.</p>
    <form id="loginForm">
      <input type="password" name="accessCode" id="accessCode" placeholder="Zugangscode" required>
      <button type="submit">Einloggen</button>
    </form>
    <div id="message"></div>
    <div class="bypass-link">
      <a href="#" id="directAccessLink">[Direktzugriff für Tests]</a>
    </div>
  </div>
  
  <script>
    // Prüfe, ob ein Fehler in der URL ist
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('error')) {
      var messageEl = document.getElementById('message');
      if (urlParams.get('error') === 'auth') {
        messageEl.textContent = "Bitte melde dich an, um auf die Karte zuzugreifen.";
      }
    }
    
    // Login-Formular-Handler
    document.getElementById('loginForm').addEventListener('submit', function(e) {
      e.preventDefault();
      
      var code = document.getElementById('accessCode').value;
      var messageEl = document.getElementById('message');
      
      messageEl.textContent = "Überprüfe Code...";
      
      // API-Aufruf zur Code-Validierung
      fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessCode: code })
      })
      .then(function(response) {
        return response.json();
      })
      .then(function(data) {
        if (data.success) {
          messageEl.textContent = "Code korrekt, lade Karte...";
          window.location.href = data.redirect;
        } else {
          messageEl.textContent = data.message || "Ungültiger Zugangscode. Bitte versuche es erneut.";
        }
      })
      .catch(function(error) {
        console.error('Fehler:', error);
        messageEl.textContent = "Fehler beim Überprüfen des Codes. Bitte versuche es später erneut.";
      });
    });
    
    // Direktzugriff für Entwicklungszwecke (verwendet den Standard-Code)
    document.getElementById('directAccessLink').addEventListener('click', function(e) {
      e.preventDefault();
      document.getElementById('accessCode').value = 'suuuu';
      document.getElementById('loginForm').dispatchEvent(new Event('submit'));
    });
  </script>
</body>
</html>
  `);
});

// Geschützte Kartenansicht
app.get('/map', requireAuth, (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Susibert</title>
  <!-- OpenStreetMap-Leaflet -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background-color: #1a1a1a;
      color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 0;
      border-bottom: 1px solid #333;
      margin-bottom: 2rem;
    }
    h1 {
      color: #f59a0c;
      font-size: 2rem;
      margin: 0;
    }
    .actions {
      display: flex;
      gap: 1rem;
    }
    .logout-button {
      background-color: #444;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      text-decoration: none;
      font-size: 14px;
    }
    .logout-button:hover {
      background-color: #555;
    }
    #map {
      height: 600px;
      width: 100%;
      border-radius: 8px;
      margin-bottom: 2rem;
      background-color: #333;
    }
    .locations-list {
      margin: 2rem 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1rem;
    }
    .location-card {
      background-color: #222;
      border-radius: 8px;
      padding: 1rem;
      transition: transform 0.2s;
      cursor: pointer;
    }
    .location-card:hover {
      transform: translateY(-3px);
    }
    .location-image {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin-top: 0.5rem;
    }
    .error-message {
      background-color: rgba(255, 80, 80, 0.2);
      border: 1px solid #ff5050;
      color: #ff5050;
      padding: 10px;
      border-radius: 4px;
      margin: 10px 0;
    }
    .status-text {
      color: #888;
      font-size: 0.9rem;
      margin: 1rem 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Susibert</h1>
      <div class="actions">
        <a href="/" class="logout-button">Abmelden</a>
      </div>
    </header>
    <main>
      <div id="map"></div>
      <div class="status-text" id="mapStatus">Karte wird geladen...</div>
      <h2>Besuchte Orte</h2>
      <div id="locations" class="locations-list">
        <div class="status-text">Orte werden geladen...</div>
      </div>
    </main>
  </div>

  <script>
    // Warte, bis das Dokument vollständig geladen ist
    window.addEventListener('load', function() {
      console.log("Seite geladen, initialisiere Karte...");
      document.getElementById('mapStatus').textContent = "Karte wird initialisiert...";
      
      try {
        // Erstelle die Karte
        var map = L.map('map').setView([51.1657, 10.4515], 6);
        
        // Füge den Kartenstil hinzu
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          subdomains: 'abcd',
          maxZoom: 19
        }).addTo(map);
        
        document.getElementById('mapStatus').textContent = "Karte erfolgreich initialisiert";
        console.log("Karte initialisiert, lade Orte...");
        
        // Lade Locations
        loadLocations(map);
      } catch (error) {
        console.error("Fehler bei der Karteninitialisierung:", error);
        document.getElementById('mapStatus').innerHTML = 
          '<div class="error-message">Fehler beim Laden der Karte: ' + error.message + '</div>';
        
        // Trotzdem versuchen, Orte zu laden
        loadLocations(null);
      }
    });
    
    // Funktion zum Laden der Locations
    function loadLocations(map) {
      var locationsContainer = document.getElementById('locations');
      var markers = [];
      
      fetch('/api/locations')
        .then(function(response) {
          if (!response.ok) {
            throw new Error('HTTP Fehler ' + response.status);
          }
          return response.json();
        })
        .then(function(locations) {
          console.log("Orte geladen:", locations.length);
          
          // Locations anzeigen
          locationsContainer.innerHTML = '';
          
          if (locations.length === 0) {
            locationsContainer.innerHTML = '<p>Keine Orte gefunden</p>';
            return;
          }
          
          var bounds = [];
          
          locations.forEach(function(loc) {
            // Orte auf der Karte anzeigen, wenn eine Karte existiert
            if (map) {
              var lat = parseFloat(loc.latitude);
              var lng = parseFloat(loc.longitude);
              
              if (!isNaN(lat) && !isNaN(lng)) {
                bounds.push([lat, lng]);
                
                // Marker mit orangenem Gradient erstellen
                for (var i = 0; i < 10; i++) {
                  var radius = 50000 * (1 - i/10);
                  var opacity = 0.05 + (i / 10) * 0.3;
                  
                  var circle = L.circle([lat, lng], {
                    radius: radius,
                    color: 'transparent',
                    fillColor: '#f59a0c',
                    fillOpacity: opacity
                  }).addTo(map);
                  
                  markers.push(circle);
                }
                
                // Hauptmarker hinzufügen
                var marker = L.marker([lat, lng]).addTo(map);
                marker.bindPopup("<b>" + loc.name + "</b><br>" + loc.date);
                markers.push(marker);
              }
            }
            
            // Location-Karte erstellen
            var card = document.createElement('div');
            card.className = 'location-card';
            
            var cardContent = "<h3>" + loc.name + "</h3>";
            cardContent += "<p><strong>Datum:</strong> " + loc.date + "</p>";
            
            if (loc.description && loc.description.trim() !== "") {
              cardContent += "<p>" + loc.description + "</p>";
            }
            
            if (loc.highlight && loc.highlight.trim() !== "") {
              cardContent += "<p><strong>Highlight:</strong> " + loc.highlight + "</p>";
            }
            
            if (loc.image && loc.image.trim() !== "") {
              cardContent += "<img src='" + loc.image + "' alt='" + loc.name + "' class='location-image'>";
            }
            
            card.innerHTML = cardContent;
            
            // Karte klickbar machen, wenn eine Karte existiert
            if (map) {
              card.addEventListener('click', function() {
                var lat = parseFloat(loc.latitude);
                var lng = parseFloat(loc.longitude);
                
                if (!isNaN(lat) && !isNaN(lng)) {
                  map.setView([lat, lng], 10);
                }
              });
            }
            
            locationsContainer.appendChild(card);
          });
          
          // Kartenansicht an alle Marker anpassen, wenn eine Karte existiert
          if (map && bounds.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] });
          }
        })
        .catch(function(error) {
          console.error("Fehler beim Laden der Locations:", error);
          locationsContainer.innerHTML = 
            '<div class="error-message">Fehler beim Laden der Orte: ' + error.message + '</div>';
        });
    }
  </script>
</body>
</html>
  `);
});

// Fehler-Route für nicht vorhandene Pfade
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Nicht gefunden - Susibert</title>
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
          height: 100vh;
          text-align: center;
        }
        .error-container {
          max-width: 500px;
          padding: 2rem;
          background-color: #222;
          border-radius: 8px;
        }
        h1 {
          color: #f59a0c;
          font-size: 2rem;
          margin-bottom: 1rem;
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
      <div class="error-container">
        <h1>Seite nicht gefunden</h1>
        <p>Die angeforderte Seite existiert nicht.</p>
        <p><a href="/">Zurück zur Startseite</a></p>
      </div>
    </body>
    </html>
  `);
});

// Server starten
const server = app.listen(port, () => {
  console.log(`Susibert Server läuft auf Port ${port}`);
  console.log(`Umgebung: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Datenbankverbindung: ${dbConnected ? 'Erfolgreich' : 'Nicht verbunden'}`);
  console.log(`Datum/Zeit: ${new Date().toISOString()}`);
});

// Fehlerbehandlung
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM Signal erhalten, beende Server...');
  server.close(() => {
    if (pool) {
      pool.end();
    }
    console.log('Server beendet');
    process.exit(0);
  });
});