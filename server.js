// Vereinfachte Version der Susibert-Anwendung für Render
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs');

// Express-App und Port
const app = express();
const port = process.env.PORT || 10000;

// Middleware einrichten
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Datenbankverbindung
let pool;
let dbConnected = false;
let dbStatus = 'nicht initialisiert';

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
        dbStatus = 'verbunden';
      })
      .catch(err => {
        console.error('Fehler bei der Datenbankabfrage:', err);
        dbStatus = `Fehler: ${err.message}`;
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
    dbStatus = 'keine URL konfiguriert';
  }
} catch (error) {
  console.error('Fehler beim Datenbankverbindungsaufbau:', error);
  dbStatus = `Fehler beim Verbindungsaufbau: ${error.message}`;
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
  // Aktueller Status der Datenbankverbindung prüfen
  let currentDbStatus = dbStatus;
  
  if (dbConnected) {
    try {
      const result = await pool.query('SELECT NOW() as now');
      currentDbStatus = `verbunden (${result.rows[0].now})`;
    } catch (err) {
      currentDbStatus = `Fehler bei Verbindungstest: ${err.message}`;
      dbConnected = false;
    }
  }
  
  // Prüfe die Umgebungsvariablen (ACCESS_CODE wird teilweise verdeckt)
  const envVars = {
    NODE_ENV: process.env.NODE_ENV || 'nicht gesetzt',
    DATABASE_URL: process.env.DATABASE_URL ? '***' + process.env.DATABASE_URL.substr(-10) : 'nicht gesetzt',
    ACCESS_CODE: process.env.ACCESS_CODE ? '***' + process.env.ACCESS_CODE.substr(-2) : 'nicht gesetzt',
    RENDER: process.env.RENDER || 'nicht gesetzt'
  };
  
  res.json({
    status: 'online',
    version: '1.0.0',
    server: {
      environment: process.env.NODE_ENV || 'unknown',
      timestamp: new Date().toISOString(),
      uptime: process.uptime() + ' Sekunden'
    },
    database: {
      connected: dbConnected,
      status: currentDbStatus
    },
    env: envVars,
    access_code_fallback: process.env.ACCESS_CODE || 'suuuu'
  });
});

// Debug-Route für einfachere Fehlerbehebung
app.get('/api/debug', async (req, res) => {
  try {
    // Datenbank testen
    let dbTest = { status: 'Nicht verbunden' };
    if (pool) {
      try {
        const result = await pool.query('SELECT NOW() as now, current_database() as db_name');
        dbTest = {
          status: 'Verbunden',
          timestamp: result.rows[0].now,
          database: result.rows[0].db_name
        };
        
        // Prüfe, ob die locations-Tabelle existiert
        const tableResult = await pool.query(`SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'locations'
        )`);
        
        dbTest.tables = {
          locations_exists: tableResult.rows[0].exists
        };
        
        // Beispiellocation einfügen, wenn keine existiert
        const countResult = await pool.query('SELECT COUNT(*) FROM locations');
        dbTest.locations_count = parseInt(countResult.rows[0].count);
        
        if (dbTest.locations_count === 0) {
          const testLocation = await pool.query(`
            INSERT INTO locations (
              name, date, description, highlight, latitude, longitude, country_code, image
            ) VALUES (
              'Testort', '2025-05-14', 'Ein Testort für die Verbindungsprüfung', 
              'Automatisch erstellt', '48.7758', '9.1829', 'DE', ''
            ) RETURNING id
          `);
          dbTest.test_location_created = testLocation.rows[0].id;
        }
      } catch (err) {
        dbTest.error = err.message;
      }
    }
    
    res.json({
      server_time: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      database_test: dbTest,
      environment_variables: {
        NODE_ENV: process.env.NODE_ENV || 'nicht gesetzt',
        ACCESS_CODE_EXISTS: !!process.env.ACCESS_CODE,
        ACCESS_CODE_LENGTH: process.env.ACCESS_CODE ? process.env.ACCESS_CODE.length : 0,
        ACCESS_CODE_VALUE: process.env.ACCESS_CODE || 'suuuu', // Für Debug-Zwecke
        DATABASE_URL_EXISTS: !!process.env.DATABASE_URL,
        RENDER: process.env.RENDER || 'nicht gesetzt'
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// Access-Code Validierung
app.post('/api/access-codes/validate', (req, res) => {
  const { accessCode } = req.body;
  const configuredCode = process.env.ACCESS_CODE || 'suuuu'; // Fallback zum Standardwert
  
  console.log('Access Code Validation angefordert:', { 
    givenCode: accessCode, 
    configuredCode: configuredCode ? '***' + configuredCode.substr(-2) : 'nicht gesetzt',
    isValid: accessCode === configuredCode
  });
  
  if (accessCode === configuredCode) {
    console.log('Access Code ist gültig');
    res.json({ valid: true });
  } else {
    console.log('Access Code ist ungültig');
    res.status(401).json({ 
      valid: false, 
      message: 'Ungültiger Zugangscode'
    });
  }
});

// Locations API
app.get('/api/locations', async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verbunden' });
  }

  try {
    // Berücksichtige potenzielle Unterschiede im Spaltennamen (countryCode vs country_code)
    const result = await pool.query(`
      SELECT 
        id, 
        name, 
        date, 
        description, 
        highlight, 
        latitude, 
        longitude, 
        COALESCE(country_code, countryCode) as country_code, 
        image 
      FROM locations 
      ORDER BY id DESC
    `);
    
    // Transformiere die Daten zurück zum Frontend-Format
    const locations = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      date: row.date,
      description: row.description,
      highlight: row.highlight,
      latitude: row.latitude,
      longitude: row.longitude,
      countryCode: row.country_code,
      image: row.image
    }));
    
    res.json(locations);
  } catch (error) {
    console.error('Fehler beim Abrufen der Locations:', error);
    res.status(500).json({ error: 'Datenbankfehler', details: error.message });
  }
});

// Location-Detail Route
app.get('/api/locations/:id', async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verbunden' });
  }

  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        id, 
        name, 
        date, 
        description, 
        highlight, 
        latitude, 
        longitude, 
        COALESCE(country_code, countryCode) as country_code, 
        image 
      FROM locations 
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Location nicht gefunden' });
    }
    
    const row = result.rows[0];
    res.json({
      id: row.id,
      name: row.name,
      date: row.date,
      description: row.description,
      highlight: row.highlight,
      latitude: row.latitude,
      longitude: row.longitude,
      countryCode: row.country_code,
      image: row.image
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Location-Details:', error);
    res.status(500).json({ error: 'Datenbankfehler', details: error.message });
  }
});

// Neue Location erstellen
app.post('/api/locations', upload.single('image'), async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verbunden' });
  }

  try {
    const { name, date, description, highlight, latitude, longitude, countryCode } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : '';

    const result = await pool.query(`
      INSERT INTO locations (
        name, date, description, highlight, latitude, longitude, country_code, image
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING *
    `, [name, date, description, highlight, latitude, longitude, countryCode, image]);

    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      name: row.name,
      date: row.date,
      description: row.description,
      highlight: row.highlight,
      latitude: row.latitude,
      longitude: row.longitude,
      countryCode: row.country_code || row.countrycode,
      image: row.image
    });
  } catch (error) {
    console.error('Fehler beim Erstellen einer Location:', error);
    res.status(500).json({ error: 'Datenbankfehler', details: error.message });
  }
});

// Location löschen
app.delete('/api/locations/:id', async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verbunden' });
  }

  try {
    const { id } = req.params;
    
    // Zuerst das Bild abrufen
    const locationResult = await pool.query('SELECT image FROM locations WHERE id = $1', [id]);
    if (locationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Location nicht gefunden' });
    }
    
    const location = locationResult.rows[0];
    
    // Lösche den Eintrag aus der Datenbank
    await pool.query('DELETE FROM locations WHERE id = $1', [id]);
    
    // Lösche das Bild, wenn es lokal gespeichert ist
    if (location.image && location.image.startsWith('/uploads/')) {
      const imagePath = path.join(__dirname, location.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    res.json({ success: true, message: 'Location erfolgreich gelöscht' });
  } catch (error) {
    console.error('Fehler beim Löschen einer Location:', error);
    res.status(500).json({ error: 'Datenbankfehler', details: error.message });
  }
});

// Frontend-Route mit eingebautem Leaflet für interaktive Karte
app.get('/*', (req, res) => {
  res.send('<!DOCTYPE html>\
<html lang="de">\
<head>\
    <meta charset="UTF-8">\
    <meta name="viewport" content="width=device-width, initial-scale=1.0">\
    <title>Susibert</title>\
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>\
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>\
    <style>\
        body {\
            font-family: system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Oxygen, Ubuntu, Cantarell, \'Open Sans\', \'Helvetica Neue\', sans-serif;\
            background-color: #1a1a1a;\
            color: #f5f5f5;\
            margin: 0;\
            padding: 0;\
        }\
        .container {\
            max-width: 1200px;\
            margin: 0 auto;\
            padding: 20px;\
        }\
        header {\
            display: flex;\
            justify-content: space-between;\
            align-items: center;\
            padding: 1rem 0;\
            border-bottom: 1px solid #333;\
            margin-bottom: 2rem;\
        }\
        h1 {\
            color: #f59a0c;\
            font-size: 2rem;\
            margin: 0;\
        }\
        .login-container {\
            text-align: center;\
            max-width: 400px;\
            margin: 100px auto;\
            padding: 2rem;\
            background-color: #222;\
            border-radius: 8px;\
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
        }\
        button {\
            background-color: #f59a0c;\
            color: black;\
            border: none;\
            padding: 10px 20px;\
            border-radius: 4px;\
            cursor: pointer;\
            font-weight: bold;\
        }\
        button:hover {\
            background-color: #e08900;\
        }\
        #message {\
            color: #ff4d4d;\
            margin-top: 1rem;\
        }\
        #app {\
            display: none;\
        }\
        #map {\
            height: 600px;\
            width: 100%;\
            border-radius: 8px;\
            margin-bottom: 2rem;\
        }\
        .locations-list {\
            margin: 2rem 0;\
        }\
        .location-card {\
            background-color: #222;\
            border-radius: 8px;\
            padding: 1rem;\
            margin-bottom: 1rem;\
        }\
        .location-image {\
            max-width: 100%;\
            height: auto;\
            border-radius: 4px;\
            margin-top: 0.5rem;\
        }\
    </style>\
</head>\
<body>\
    <div class="container">\
        <div id="login" class="login-container">\
            <h1>Susibert</h1>\
            <p>Bitte gib den Zugangscode ein, um die Reisekarte zu sehen.</p>\
            <input type="password" id="accessCode" placeholder="Zugangscode">\
            <button id="loginButton">Einloggen</button>\
            <div id="message"></div>\
        </div>\
        \
        <div id="app">\
            <header>\
                <h1>Susibert</h1>\
            </header>\
            <main>\
                <div id="map"></div>\
                <h2>Besuchte Orte</h2>\
                <div id="locations" class="locations-list"></div>\
            </main>\
        </div>\
    </div>\
\
    <script>\
        // Zugangscode prüfen\
        function loginButtonClickHandler() {\
            var code = document.getElementById("accessCode").value;\
            var messageEl = document.getElementById("message");\
            messageEl.textContent = "Login wird überprüft...";\
            
            console.log("Login-Button wurde geklickt");\
            console.log("Zugangscode:", code);\
            
            fetch("/api/access-codes/validate", {\
                method: "POST",\
                headers: { "Content-Type": "application/json" },\
                body: JSON.stringify({ accessCode: code })\
            })\
            .then(function(response) {\
                console.log("Server-Antwort erhalten:", response.status);\
                return response.json();\
            })\
            .then(function(data) {\
                console.log("Validierungsdaten:", data);\
                
                if (data.valid) {\
                    console.log("Login erfolgreich, zeige App");\
                    document.getElementById("login").style.display = "none";\
                    document.getElementById("app").style.display = "block";\
                    initMap();\
                } else {\
                    console.log("Login fehlgeschlagen");\
                    messageEl.textContent = "Ungültiger Zugangscode. Bitte versuche es erneut.";\
                }\
            })\
            .catch(function(error) {\
                console.error("Login-Fehler:", error);\
                messageEl.textContent = "Fehler beim Überprüfen des Codes. Bitte versuche es später erneut.";\
            });\
        }\
        
        // Event-Listener für Klick auf Login-Button\
        document.getElementById("loginButton").addEventListener("click", loginButtonClickHandler);\
        
        // Event-Listener für Enter-Taste im Passwortfeld\
        document.getElementById("accessCode").addEventListener("keyup", function(event) {\
            if (event.key === "Enter") {\
                loginButtonClickHandler();\
            }\
        });\
        \
        // Debug-Funktion\
        function showDebugInfo() {\
            var debugContainer = document.createElement("div");\
            debugContainer.style.position = "fixed";\
            debugContainer.style.bottom = "10px";\
            debugContainer.style.right = "10px";\
            debugContainer.style.backgroundColor = "rgba(0,0,0,0.8)";\
            debugContainer.style.color = "white";\
            debugContainer.style.padding = "10px";\
            debugContainer.style.borderRadius = "5px";\
            debugContainer.style.maxWidth = "80%";\
            debugContainer.style.maxHeight = "80%";\
            debugContainer.style.overflow = "auto";\
            debugContainer.style.zIndex = "9999";\
            debugContainer.style.fontSize = "12px";\
            debugContainer.innerHTML = "<h3>Debug wird geladen...</h3>";\
            document.body.appendChild(debugContainer);\
            \
            fetch("/api/debug")\
            .then(function(response) { return response.json(); })\
            .then(function(data) {\
                var html = "<h3>Debug-Informationen</h3>";\
                html += "<p><strong>Server-Zeit:</strong> " + data.server_time + "</p>";\
                html += "<p><strong>Umgebung:</strong> " + data.environment + "</p>";\
                \
                html += "<h4>Umgebungsvariablen:</h4>";\
                html += "<ul>";\
                for (var key in data.environment_variables) {\
                    html += "<li><strong>" + key + ":</strong> " + data.environment_variables[key] + "</li>";\
                }\
                html += "</ul>";\
                \
                html += "<h4>Datenbank-Test:</h4>";\
                html += "<ul>";\
                for (var key in data.database_test) {\
                    if (typeof data.database_test[key] === 'object') {\
                        html += "<li><strong>" + key + ":</strong> <pre>" + JSON.stringify(data.database_test[key], null, 2) + "</pre></li>";\
                    } else {\
                        html += "<li><strong>" + key + ":</strong> " + data.database_test[key] + "</li>";\
                    }\
                }\
                html += "</ul>";\
                \
                html += "<p><button onclick='this.parentNode.parentNode.remove()' style='background-color: #f59a0c; border: none; color: black; padding: 5px 10px; border-radius: 4px;'>Schließen</button></p>";\
                \
                debugContainer.innerHTML = html;\
            })\
            .catch(function(error) {\
                debugContainer.innerHTML = "<h3>Fehler beim Laden der Debug-Informationen</h3><p>" + error + "</p>";\
            });\
        }\
        \
        // Debug-Button versteckt hinzufügen (Dreimal schnell auf den Susibert-Titel klicken)\
        var clickCount = 0;\
        var clickTimer;\
        document.querySelector(".login-container h1").addEventListener("click", function() {\
            clickCount++;\
            clearTimeout(clickTimer);\
            \
            clickTimer = setTimeout(function() {\
                clickCount = 0;\
            }, 1000);\
            \
            if (clickCount >= 3) {\
                showDebugInfo();\
                clickCount = 0;\
            }\
        });\
        \
        // Karte initialisieren\
        var map;\
        var markers = [];\
        \
        function initMap() {\
            // Karte erstellen\
            map = L.map("map").setView([51.1657, 10.4515], 6); // Deutschland als Start\
            \
            // Kartenstil: CartoDB Positron (hell) für dunklen Hintergrund\
            L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {\
                attribution: \'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>\',\
                subdomains: "abcd",\
                maxZoom: 19\
            }).addTo(map);\
            \
            // Locations laden\
            loadLocations();\
        }\
        \
        // Locations laden und anzeigen\
        async function loadLocations() {\
            var locationsEl = document.getElementById("locations");\
            \
            try {\
                var response = await fetch("/api/locations");\
                \
                if (!response.ok) {\
                    throw new Error("Fehler beim Laden der Daten");\
                }\
                \
                var locations = await response.json();\
                \
                // Marker löschen\
                markers.forEach(function(marker) {\
                    map.removeLayer(marker);\
                });\
                markers = [];\
                \
                // Locations anzeigen\
                locationsEl.innerHTML = "";\
                locations.forEach(function(loc) {\
                    // Marker hinzufügen\
                    if (loc.latitude && loc.longitude) {\
                        var lat = parseFloat(loc.latitude);\
                        var lng = parseFloat(loc.longitude);\
                        \
                        if (!isNaN(lat) && !isNaN(lng)) {\
                            // Marker mit orangenem Gradient erstellen\
                            for (var i = 0; i < 20; i++) {\
                                var radius = 50000 * (1 - i/20); // Abnehmender Radius (50km bis 0)\
                                var opacity = 0.05 + (i / 20) * 0.3; // Zunehmende Opazität\
                                \
                                var circle = L.circle([lat, lng], {\
                                    radius: radius,\
                                    color: "transparent",\
                                    fillColor: "#f59a0c",\
                                    fillOpacity: opacity,\
                                    interactive: false\
                                }).addTo(map);\
                                \
                                markers.push(circle);\
                            }\
                            \
                            // Hauptmarker hinzufügen\
                            var marker = L.marker([lat, lng]).addTo(map);\
                            marker.bindPopup("<b>" + loc.name + "</b><br>" + loc.date);\
                            markers.push(marker);\
                        }\
                    }\
                    \
                    // Location-Karte hinzufügen\
                    var card = document.createElement("div");\
                    card.className = "location-card";\
                    \
                    var cardContent = "<h3>" + loc.name + "</h3>";\
                    cardContent += "<p><strong>Datum:</strong> " + loc.date + "</p>";\
                    \
                    if (loc.description) {\
                        cardContent += "<p>" + loc.description + "</p>";\
                    }\
                    \
                    if (loc.highlight) {\
                        cardContent += "<p><strong>Highlight:</strong> " + loc.highlight + "</p>";\
                    }\
                    \
                    if (loc.image) {\
                        cardContent += "<img src=\\"" + loc.image + "\\" alt=\\"" + loc.name + "\\" class=\\"location-image\\">";\
                    }\
                    \
                    card.innerHTML = cardContent;\
                    \
                    // Karte klickbar machen\
                    card.addEventListener("click", function() {\
                        if (loc.latitude && loc.longitude) {\
                            var lat = parseFloat(loc.latitude);\
                            var lng = parseFloat(loc.longitude);\
                            if (!isNaN(lat) && !isNaN(lng)) {\
                                map.setView([lat, lng], 10);\
                                \
                                // Finde den entsprechenden Marker und öffne das Popup\
                                markers.forEach(function(marker) {\
                                    if (marker instanceof L.Marker) {\
                                        var markerLatLng = marker.getLatLng();\
                                        if (markerLatLng.lat === lat && markerLatLng.lng === lng) {\
                                            marker.openPopup();\
                                        }\
                                    }\
                                });\
                            }\
                        }\
                    });\
                    \
                    locationsEl.appendChild(card);\
                });\
                \
                // Kartenansicht an alle Marker anpassen, wenn Marker vorhanden sind\
                if (markers.length > 0) {\
                    var markerGroup = L.featureGroup(markers.filter(function(m) { return m instanceof L.Marker; }));\
                    map.fitBounds(markerGroup.getBounds(), { padding: [50, 50] });\
                }\
            } catch (error) {\
                locationsEl.innerHTML = "<p>Fehler beim Laden der Locations: " + error.message + "</p>";\
                console.error("Error loading locations:", error);\
            }\
        }\
    </script>\
</body>\
</html>');
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
  server.close(() => {
    process.exit(1);
  });
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