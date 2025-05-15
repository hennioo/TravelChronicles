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
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
      )
    `);
    return result.rows[0].exists;
  } catch (error) {
    console.error('Fehler beim Prüfen der Tabellen:', error);
    return false;
  }
}

// Tabellen erstellen, falls sie nicht existieren
async function createTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
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
  } catch (error) {
    console.error('Fehler beim Generieren der Thumbnails:', error);
  }
}

// Login-Seite
app.get('/', function(req, res) {
  // Erstellt eine neue Session
  const sessionId = createSession();
  
  res.send('<!DOCTYPE html>\n' +
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
    '</html>');
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

// Geschützte Kartenansicht mit Leaflet
app.get('/map', requireAuth, function(req, res) {
  // Prüfe, ob die Datenbankverbindung aktiv ist
  if (!dbConnected) {
    return res.send('<!DOCTYPE html>\n' +
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
      '</html>');
  }

  // Statische HTML-Seite für die Karte
  res.sendFile(path.join(__dirname, 'map.html'));
});

// Lade das HTML für die Kartenansicht
const mapHTML = fs.readFileSync(path.join(__dirname, 'map.html'), { encoding: 'utf8', flag: 'r' });

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
  console.log('Server läuft auf Port ' + PORT);
});