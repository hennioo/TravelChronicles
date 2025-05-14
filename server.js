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
    }
  });
});

// Access-Code Validierung
app.post('/api/access-codes/validate', (req, res) => {
  const { accessCode } = req.body;
  
  if (accessCode === process.env.ACCESS_CODE) {
    res.json({ valid: true });
  } else {
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
  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Susibert</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <style>
        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
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
        .login-container {
            text-align: center;
            max-width: 400px;
            margin: 100px auto;
            padding: 2rem;
            background-color: #222;
            border-radius: 8px;
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
        }
        #app {
            display: none;
        }
        #map {
            height: 600px;
            width: 100%;
            border-radius: 8px;
            margin-bottom: 2rem;
        }
        .locations-list {
            margin: 2rem 0;
        }
        .location-card {
            background-color: #222;
            border-radius: 8px;
            padding: 1rem;
            margin-bottom: 1rem;
        }
        .location-image {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
            margin-top: 0.5rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div id="login" class="login-container">
            <h1>Susibert</h1>
            <p>Bitte gib den Zugangscode ein, um die Reisekarte zu sehen.</p>
            <input type="password" id="accessCode" placeholder="Zugangscode">
            <button id="loginButton">Einloggen</button>
            <div id="message"></div>
        </div>
        
        <div id="app">
            <header>
                <h1>Susibert</h1>
            </header>
            <main>
                <div id="map"></div>
                <h2>Besuchte Orte</h2>
                <div id="locations" class="locations-list"></div>
            </main>
        </div>
    </div>

    <script>
        // Zugangscode prüfen
        document.getElementById('loginButton').addEventListener('click', async () => {
            const code = document.getElementById('accessCode').value;
            const messageEl = document.getElementById('message');
            
            try {
                const response = await fetch('/api/access-codes/validate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accessCode: code })
                });
                
                const data = await response.json();
                
                if (data.valid) {
                    document.getElementById('login').style.display = 'none';
                    document.getElementById('app').style.display = 'block';
                    initMap();
                } else {
                    messageEl.textContent = 'Ungültiger Zugangscode. Bitte versuche es erneut.';
                }
            } catch (error) {
                messageEl.textContent = 'Fehler beim Überprüfen des Codes. Bitte versuche es später erneut.';
                console.error('Login error:', error);
            }
        });
        
        // Karte initialisieren
        let map;
        let markers = [];
        
        function initMap() {
            // Karte erstellen
            map = L.map('map').setView([51.1657, 10.4515], 6); // Deutschland als Start
            
            // Kartenstil: CartoDB Positron (hell) für dunklen Hintergrund
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(map);
            
            // Locations laden
            loadLocations();
        }
        
        // Locations laden und anzeigen
        async function loadLocations() {
            const locationsEl = document.getElementById('locations');
            
            try {
                const response = await fetch('/api/locations');
                
                if (!response.ok) {
                    throw new Error('Fehler beim Laden der Daten');
                }
                
                const locations = await response.json();
                
                // Marker löschen
                markers.forEach(marker => map.removeLayer(marker));
                markers = [];
                
                // Locations anzeigen
                locationsEl.innerHTML = '';
                locations.forEach(loc => {
                    // Marker hinzufügen
                    if (loc.latitude && loc.longitude) {
                        const lat = parseFloat(loc.latitude);
                        const lng = parseFloat(loc.longitude);
                        
                        if (!isNaN(lat) && !isNaN(lng)) {
                            // Marker mit orangenem Gradient erstellen
                            for (let i = 0; i < 20; i++) {
                                const radius = 50000 * (1 - i/20); // Abnehmender Radius (50km bis 0)
                                const opacity = 0.05 + (i / 20) * 0.3; // Zunehmende Opazität
                                
                                const circle = L.circle([lat, lng], {
                                    radius: radius,
                                    color: 'transparent',
                                    fillColor: '#f59a0c',
                                    fillOpacity: opacity,
                                    interactive: false
                                }).addTo(map);
                                
                                markers.push(circle);
                            }
                            
                            // Hauptmarker hinzufügen
                            const marker = L.marker([lat, lng]).addTo(map);
                            marker.bindPopup(`<b>${loc.name}</b><br>${loc.date}`);
                            markers.push(marker);
                        }
                    }
                    
                    // Location-Karte hinzufügen
                    const card = document.createElement('div');
                    card.className = 'location-card';
                    card.innerHTML = `
                        <h3>${loc.name}</h3>
                        <p><strong>Datum:</strong> ${loc.date}</p>
                        ${loc.description ? `<p>${loc.description}</p>` : ''}
                        ${loc.highlight ? `<p><strong>Highlight:</strong> ${loc.highlight}</p>` : ''}
                        ${loc.image ? `<img src="${loc.image}" alt="${loc.name}" class="location-image">` : ''}
                    `;
                    
                    // Karte klickbar machen
                    card.addEventListener('click', () => {
                        if (loc.latitude && loc.longitude) {
                            const lat = parseFloat(loc.latitude);
                            const lng = parseFloat(loc.longitude);
                            if (!isNaN(lat) && !isNaN(lng)) {
                                map.setView([lat, lng], 10);
                                
                                // Finde den entsprechenden Marker und öffne das Popup
                                markers.forEach(marker => {
                                    if (marker instanceof L.Marker) {
                                        const markerLatLng = marker.getLatLng();
                                        if (markerLatLng.lat === lat && markerLatLng.lng === lng) {
                                            marker.openPopup();
                                        }
                                    }
                                });
                            }
                        }
                    });
                    
                    locationsEl.appendChild(card);
                });
                
                // Kartenansicht an alle Marker anpassen, wenn Marker vorhanden sind
                if (markers.length > 0) {
                    const markerGroup = L.featureGroup(markers.filter(m => m instanceof L.Marker));
                    map.fitBounds(markerGroup.getBounds(), { padding: [50, 50] });
                }
            } catch (error) {
                locationsEl.innerHTML = '<p>Fehler beim Laden der Locations: ' + error.message + '</p>';
                console.error('Error loading locations:', error);
            }
        }
    </script>
</body>
</html>`);
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