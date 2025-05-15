// Finale Render-kompatible Version
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

// Import der neuen Kartenansicht
const { generateMapView } = require('./new-map-view');

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

// Hosting-Konfiguration
const PRODUCTION_DOMAIN = 'susio.site';
const isProduction = process.env.NODE_ENV === 'production' || 
                     (process.env.RENDER && process.env.RENDER === 'true');

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

// Multer Storage für Uploads
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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB Limit
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
    const connectionString = process.env.DATABASE_URL || 
                            (process.env.SUPABASE_URL && process.env.SUPABASE_PASSWORD) ? 
                            process.env.SUPABASE_URL.replace('[YOUR-PASSWORD]', process.env.SUPABASE_PASSWORD) : 
                            null;
    
    if (!connectionString) {
      console.error('Keine Datenbankverbindung konfiguriert. Bitte DATABASE_URL oder SUPABASE_URL und SUPABASE_PASSWORD angeben.');
      return false;
    }
    
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
        name TEXT NOT NULL,
        description TEXT,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        image TEXT,
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

// Auth-Middleware
function requireAuth(req, res, next) {
  const sessionId = req.query.sessionId;
  
  if (isValidSession(sessionId)) {
    // Session verlängern
    if (sessions[sessionId]) {
      sessions[sessionId].created = Date.now();
    }
    return next();
  }
  
  res.redirect('/?error=' + encodeURIComponent('Bitte melde dich an, um diese Seite zu sehen.'));
}

// Helper-Funktion für das Löschen eines Ortes
async function deleteLocation(id, res, redirectUrl = null) {
  try {
    // Erst Bild-Informationen holen
    const imageResult = await pool.query('SELECT image FROM locations WHERE id = $1', [id]);
    
    if (imageResult.rows.length > 0) {
      const location = imageResult.rows[0];
      
      // Bild löschen, wenn vorhanden
      if (location.image) {
        // Nur den Dateinamen extrahieren ohne URL-Pfad
        const imagePath = location.image.startsWith('/uploads/') 
          ? path.join(uploadsDir, location.image.substring(9)) 
          : path.join(uploadsDir, path.basename(location.image));
        
        try {
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log('Bild gelöscht:', imagePath);
          } else {
            console.warn('Bild nicht gefunden zum Löschen:', imagePath);
          }
        } catch (fileError) {
          console.error('Fehler beim Löschen des Bildes:', fileError);
        }
      }
      
      // Jetzt den Datenbankeintrag löschen
      await pool.query('DELETE FROM locations WHERE id = $1', [id]);
      
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
  // Debug-Ausgabe für den Pfad der Uploads
  console.log('Debug: Map-Seite wird geladen mit Uploads-Verzeichnis:', {
    uploadsDir: uploadsDir,
    dirname: __dirname,
    env: process.env.NODE_ENV,
    host: req.get('host'),
    protocol: req.protocol
  });
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

  // Pfad zum Pärchenbild
  const coupleImageUrl = '/uploads/couple.jpg';

  // Neue Layout-Funktion für die Kartenansicht verwenden
  return res.send(generateMapView(coupleImageUrl));
});

// Admin-Bereich
app.get('/admin', requireAuth, function(req, res) {
  res.send(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Susibert Admin</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          background-color: #1a1a1a;
          color: #f5f5f5;
          margin: 0;
          padding: 20px;
        }
        
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        
        h1 {
          color: #f59a0c;
          margin: 0;
        }
        
        .btn {
          background-color: #333;
          color: #fff;
          border: none;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
          text-decoration: none;
          font-size: 0.9rem;
          transition: background-color 0.2s;
        }
        
        .btn:hover {
          background-color: #444;
        }
        
        .btn-primary {
          background-color: #f59a0c;
          color: #000;
        }
        
        .btn-primary:hover {
          background-color: #e58e0b;
        }
        
        .btn-danger {
          background-color: #e74c3c;
          color: white;
        }
        
        .btn-danger:hover {
          background-color: #c0392b;
        }
        
        .card {
          background-color: #222;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        
        .section-title {
          color: #f59a0c;
          font-size: 1.2rem;
          margin-top: 0;
          margin-bottom: 15px;
          border-bottom: 1px solid #333;
          padding-bottom: 8px;
        }
        
        .confirmation {
          display: none;
          margin-top: 10px;
          background-color: rgba(255, 0, 0, 0.1);
          padding: 10px;
          border-radius: 4px;
          border: 1px solid #f55;
        }
        
        .confirmation p {
          color: #f55;
          margin: 0 0 10px 0;
        }
        
        .confirmation-buttons {
          display: flex;
          gap: 10px;
        }
        
        .form-group {
          margin-bottom: 15px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 5px;
          color: #ccc;
        }
        
        .form-control {
          width: 100%;
          padding: 8px;
          background-color: #333;
          border: 1px solid #444;
          border-radius: 4px;
          color: #fff;
          font-size: 0.9rem;
        }
        
        .confirmation-count {
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Susibert Admin</h1>
        <div>
          <a href="/map?sessionId=${req.query.sessionId}" class="btn">Zurück zur Karte</a>
          <a href="/logout?sessionId=${req.query.sessionId}" class="btn btn-primary">Abmelden</a>
        </div>
      </div>
      
      <!-- Datenbank-Verwaltung -->
      <div class="card">
        <h2 class="section-title">Datenbank-Verwaltung</h2>
        <p>Hier kannst du die Datenbank zurücksetzen und alle gespeicherten Orte löschen.</p>
        
        <button id="resetDbBtn" class="btn btn-danger">Datenbank zurücksetzen</button>
        
        <div id="confirmationStep1" class="confirmation">
          <p>Bist du sicher? Diese Aktion wird <span class="confirmation-count">ALLE Orte und Bilder</span> unwiderruflich löschen!</p>
          <div class="confirmation-buttons">
            <button id="step1Cancel" class="btn">Abbrechen</button>
            <button id="step1Confirm" class="btn btn-danger">Ja, weiter</button>
          </div>
        </div>
        
        <div id="confirmationStep2" class="confirmation">
          <p>Letzte Warnung: Nach dieser Aktion gibt es kein Zurück mehr!</p>
          <div class="confirmation-buttons">
            <button id="step2Cancel" class="btn">Abbrechen</button>
            <button id="step2Confirm" class="btn btn-danger">Ja, wirklich löschen</button>
          </div>
        </div>
        
        <div id="confirmationStep3" class="confirmation">
          <p>Tippe "LÖSCHEN" ein, um zu bestätigen:</p>
          <div class="form-group">
            <input type="text" id="deleteConfirmation" class="form-control" placeholder="LÖSCHEN">
          </div>
          <div class="confirmation-buttons">
            <button id="step3Cancel" class="btn">Abbrechen</button>
            <button id="step3Confirm" class="btn btn-danger">Datenbank unwiderruflich löschen</button>
          </div>
        </div>
      </div>
      
      <script>
        // Reset-Bestätigung
        const resetDbBtn = document.getElementById('resetDbBtn');
        const confirmationStep1 = document.getElementById('confirmationStep1');
        const confirmationStep2 = document.getElementById('confirmationStep2');
        const confirmationStep3 = document.getElementById('confirmationStep3');
        
        // Schritt 1
        resetDbBtn.addEventListener('click', function() {
          confirmationStep1.style.display = 'block';
          resetDbBtn.style.display = 'none';
        });
        
        document.getElementById('step1Cancel').addEventListener('click', function() {
          confirmationStep1.style.display = 'none';
          resetDbBtn.style.display = 'block';
        });
        
        document.getElementById('step1Confirm').addEventListener('click', function() {
          confirmationStep1.style.display = 'none';
          confirmationStep2.style.display = 'block';
        });
        
        // Schritt 2
        document.getElementById('step2Cancel').addEventListener('click', function() {
          confirmationStep2.style.display = 'none';
          resetDbBtn.style.display = 'block';
        });
        
        document.getElementById('step2Confirm').addEventListener('click', function() {
          confirmationStep2.style.display = 'none';
          confirmationStep3.style.display = 'block';
        });
        
        // Schritt 3
        document.getElementById('step3Cancel').addEventListener('click', function() {
          confirmationStep3.style.display = 'none';
          resetDbBtn.style.display = 'block';
        });
        
        document.getElementById('step3Confirm').addEventListener('click', function() {
          const deleteConfirmation = document.getElementById('deleteConfirmation').value;
          
          if (deleteConfirmation === 'LÖSCHEN') {
            // Redirect zum Reset-Endpunkt
            window.location.href = '/api/reset-database?sessionId=${req.query.sessionId}';
          } else {
            alert('Bitte gib "LÖSCHEN" ein, um zu bestätigen.');
          }
        });
      </script>
    </body>
    </html>
  `);
});

// API-Endpunkte

// Alle Orte abrufen
app.get('/api/locations', async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    const result = await pool.query('SELECT * FROM locations ORDER BY date DESC');
    
    // Absolute URLs für Bilder
    const baseUrl = isProduction ? `https://${PRODUCTION_DOMAIN}` : '';
    
    const locations = result.rows.map(location => {
      // Wenn ein Bild vorhanden ist und nicht mit http beginnt, füge den Pfad hinzu
      if (location.image && !location.image.startsWith('http')) {
        // Falls das Bild nicht mit / beginnt, füge es hinzu
        if (!location.image.startsWith('/')) {
          location.image = '/' + location.image;
        }
        
        // Stelle sicher, dass Bilder im uploads-Verzeichnis sind
        if (!location.image.startsWith('/uploads/')) {
          location.image = '/uploads/' + location.image.replace(/^\//g, '');
        }
        
        // Setze die vollständige URL für Bilder
        location.image = baseUrl + location.image;
      }
      
      return location;
    });
    
    res.json(locations);
  } catch (error) {
    console.error('Fehler beim Abrufen der Orte:', error);
    res.status(500).json({ error: error.message });
  }
});

// Neuen Ort hinzufügen
app.post('/api/locations', requireAuth, upload.single('image'), async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    // Validierung
    const { name, latitude, longitude, description } = req.body;
    
    if (!name || !latitude || !longitude) {
      return res.status(400).json({ error: 'Name, Breitengrad und Längengrad sind erforderlich' });
    }
    
    let imagePath = null;
    
    if (req.file) {
      // Pfad für die Datenbank relativ zum uploads-Verzeichnis
      imagePath = '/uploads/' + req.file.filename;
    }
    
    // Einfügen in die Datenbank
    const result = await pool.query(
      'INSERT INTO locations (name, description, latitude, longitude, image) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, description || null, latitude, longitude, imagePath]
    );
    
    const newLocation = result.rows[0];
    
    // Absolute URL für das Bild
    if (newLocation.image) {
      const baseUrl = isProduction ? `https://${PRODUCTION_DOMAIN}` : '';
      newLocation.image = baseUrl + newLocation.image;
    }
    
    res.status(201).json(newLocation);
  } catch (error) {
    console.error('Fehler beim Hinzufügen des Ortes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ort löschen
app.get('/api/locations/:id/delete', requireAuth, async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    const id = req.params.id;
    await deleteLocation(id, res);
  } catch (error) {
    console.error('Fehler beim Löschen des Ortes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Datenbank zurücksetzen
app.get('/api/reset-database', requireAuth, async (req, res) => {
  if (!dbConnected) {
    return res.redirect('/admin?sessionId=' + req.query.sessionId + '&error=' + encodeURIComponent('Datenbank nicht verfügbar'));
  }
  
  try {
    // Alle Bilder aus dem Uploads-Verzeichnis löschen, außer couple.jpg
    const files = fs.readdirSync(uploadsDir);
    for (const file of files) {
      if (file !== 'couple.jpg' && file !== 'couple.png') {
        try {
          fs.unlinkSync(path.join(uploadsDir, file));
          console.log('Datei gelöscht:', file);
        } catch (fileError) {
          console.error('Fehler beim Löschen der Datei ' + file + ':', fileError);
        }
      }
    }
    
    // Alle Orte aus der Datenbank löschen
    await pool.query('TRUNCATE TABLE locations RESTART IDENTITY');
    
    // Zur Admin-Seite zurückleiten
    res.redirect('/admin?sessionId=' + req.query.sessionId + '&success=true');
  } catch (error) {
    console.error('Fehler beim Zurücksetzen der Datenbank:', error);
    res.redirect('/admin?sessionId=' + req.query.sessionId + '&error=' + encodeURIComponent('Fehler beim Zurücksetzen: ' + error.message));
  }
});

// Server starten
app.listen(port, '0.0.0.0', () => {
  console.log(`Server läuft auf Port ${port}`);
});