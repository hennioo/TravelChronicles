const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const sharp = require('sharp');

// In-Memory Sessions (würden bei Neustart verloren gehen)
const sessions = {};

// Verbindung zur Datenbank
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Prüfe, ob die Umgebungsvariable für den Zugriffscode existiert
if (!process.env.ACCESS_CODE) {
  console.warn("Warnung: Umgebungsvariable ACCESS_CODE nicht gesetzt. Verwende Standard-Code 'suuuu'.");
}
const ACCESS_CODE = process.env.ACCESS_CODE || 'suuuu';

// Express-App
const app = express();
const port = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Datenbank-Funktionen
async function connectToDatabase() {
  try {
    const client = await pool.connect();
    console.log('Datenbankverbindung hergestellt');
    return client;
  } catch (error) {
    console.error('Fehler bei der Datenbankverbindung:', error);
    throw error;
  }
}

async function checkTablesExist() {
  const client = await connectToDatabase();
  try {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'locations'
      );
    `);
    
    if (!result.rows[0].exists) {
      await createTables(client);
    } else {
      console.log('Tabellen existieren bereits');
    }
  } catch (error) {
    console.error('Fehler beim Prüfen der Tabellen:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function createTables() {
  const client = await connectToDatabase();
  try {
    // Erstelle Locations-Tabelle
    await client.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        latitude NUMERIC(10, 6) NOT NULL,
        longitude NUMERIC(10, 6) NOT NULL,
        description TEXT,
        image_data TEXT,
        image_type VARCHAR(50),
        thumbnail_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('Tabellen erfolgreich erstellt');
  } catch (error) {
    console.error('Fehler beim Erstellen der Tabellen:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Session-Funktionen
function createSession() {
  const sessionId = crypto.randomBytes(16).toString('hex');
  sessions[sessionId] = {
    created: Date.now(),
    lastActive: Date.now()
  };
  console.log(`Neue Session erstellt: ${sessionId}`);
  return sessionId;
}

function isValidSession(sessionId) {
  const session = sessions[sessionId];
  
  if (!session) {
    console.log(`Prüfe Session: ${sessionId} Existiert: false`);
    return false;
  }
  
  console.log(`Prüfe Session: ${sessionId} Existiert: true`);
  
  // Prüfe, ob die Session abgelaufen ist (24 Stunden)
  const now = Date.now();
  const sessionAge = now - session.created;
  const maxAge = 24 * 60 * 60 * 1000; // 24 Stunden
  
  if (sessionAge > maxAge) {
    console.log(`Session abgelaufen: ${sessionId}`);
    delete sessions[sessionId];
    return false;
  }
  
  // Aktualisiere den Zeitstempel der letzten Aktivität
  session.lastActive = now;
  console.log(`Session verlängert: ${sessionId}`);
  
  return true;
}

// Auth-Middleware
function requireAuth(req, res, next) {
  const sessionId = req.query.sessionId || req.cookies.sessionId;
  
  console.log(`Auth-Check mit SessionID: ${sessionId}`);
  
  if (!sessionId || !isValidSession(sessionId)) {
    console.log(`Ungültige Session: ${sessionId}`);
    return res.status(401).json({ success: false, error: 'Nicht autorisiert' });
  }
  
  next();
}

// Multer für Datei-Uploads konfigurieren
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB Limit
});

// API-Routen
// Login mit Zugangscode
app.post('/api/login', (req, res) => {
  const { accessCode } = req.body;
  
  console.log(`Login-Versuch mit Code: ${accessCode ? '******' : 'undefined'}`);
  
  if (!accessCode || accessCode !== ACCESS_CODE) {
    return res.status(401).json({
      success: false,
      error: 'Falscher Zugangscode'
    });
  }
  
  const sessionId = createSession();
  
  // Session-Cookie setzen
  res.cookie('sessionId', sessionId, {
    maxAge: 24 * 60 * 60 * 1000, // 24 Stunden
    httpOnly: true
  });
  
  res.json({
    success: true,
    sessionId: sessionId
  });
});

// Logout
app.post('/api/logout', (req, res) => {
  const sessionId = req.cookies.sessionId;
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
    console.log(`Session beendet: ${sessionId}`);
  }
  
  res.clearCookie('sessionId');
  res.json({ success: true });
});

// Alle Orte abrufen
app.get('/api/locations', requireAuth, async (req, res) => {
  console.log('Rufe alle Orte ab');
  
  try {
    const result = await pool.query(`
      SELECT id, title, latitude, longitude, description, created_at, 
      CASE WHEN thumbnail_data IS NOT NULL THEN true ELSE false END as has_image
      FROM locations
      ORDER BY created_at DESC
    `);
    
    console.log(`${result.rows.length} Orte abgerufen`);
    
    res.json({
      success: true,
      locations: result.rows
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Orte:', error);
    res.status(500).json({
      success: false,
      error: 'Datenbankfehler'
    });
  }
});

// Einen bestimmten Ort abrufen
app.get('/api/locations/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT id, title, latitude, longitude, description, created_at 
      FROM locations 
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ort nicht gefunden'
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fehler beim Abrufen des Ortes:', error);
    res.status(500).json({
      success: false,
      error: 'Datenbankfehler'
    });
  }
});

// Bild für einen Ort abrufen (optimiert)
app.get('/api/locations/:id/image', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Bild für Ort ${id} angefordert`);
    
    const result = await pool.query(`
      SELECT image_data, image_type
      FROM locations
      WHERE id = $1 AND image_data IS NOT NULL
    `, [id]);
    
    if (result.rows.length === 0 || !result.rows[0].image_data) {
      console.log(`Ort ${id} nicht gefunden oder hat keine Bilddaten`);
      return res.status(404).send('Bild nicht gefunden');
    }
    
    const { image_data, image_type } = result.rows[0];
    
    // Verbessertes Caching-Header
    res.set('Cache-Control', 'public, max-age=31536000'); // 1 Jahr
    res.set('Content-Type', image_type);
    
    // Base64-Daten dekodieren und als Binärdaten senden
    const imageBuffer = Buffer.from(image_data, 'base64');
    res.send(imageBuffer);
    
  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error);
    res.status(500).send('Serverfehler');
  }
});

// Base64-Bild für einen Ort abrufen
app.get('/api/locations/:id/image/base64', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT image_data, image_type
      FROM locations
      WHERE id = $1 AND image_data IS NOT NULL
    `, [id]);
    
    if (result.rows.length === 0 || !result.rows[0].image_data) {
      return res.json({
        success: false,
        error: 'Bild nicht gefunden'
      });
    }
    
    const { image_data, image_type } = result.rows[0];
    console.log(`Sende Base64-Bild für Ort ${id} mit Typ ${image_type}`);
    
    res.json({
      success: true,
      imageData: image_data,
      imageType: image_type
    });
    
  } catch (error) {
    console.error('Fehler beim Abrufen des Base64-Bildes:', error);
    res.status(500).json({
      success: false,
      error: 'Serverfehler'
    });
  }
});

// Thumbnail für einen Ort abrufen
app.get('/api/locations/:id/thumbnail', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT thumbnail_data, image_type
      FROM locations
      WHERE id = $1 AND thumbnail_data IS NOT NULL
    `, [id]);
    
    if (result.rows.length === 0 || !result.rows[0].thumbnail_data) {
      return res.status(404).send('Thumbnail nicht gefunden');
    }
    
    const { thumbnail_data, image_type } = result.rows[0];
    
    res.set('Cache-Control', 'public, max-age=31536000');
    res.set('Content-Type', image_type);
    
    const thumbnailBuffer = Buffer.from(thumbnail_data, 'base64');
    res.send(thumbnailBuffer);
    
  } catch (error) {
    console.error('Fehler beim Abrufen des Thumbnails:', error);
    res.status(500).send('Serverfehler');
  }
});

// Neuen Ort erstellen
app.post('/api/locations', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const { title, latitude, longitude, description } = req.body;
    console.log('Neuer Ort wird hinzugefügt');
    
    // Validierung
    if (!title || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Titel, Breitengrad und Längengrad sind erforderlich'
      });
    }
    
    // Prüfe, ob ein Bild hochgeladen wurde
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Ein Bild ist erforderlich'
      });
    }
    
    console.log(`Bild hochgeladen: ${req.file.originalname}, ${req.file.size} Bytes, ${req.file.mimetype}`);
    
    // Bildverarbeitung mit Sharp
    let imageBuffer = req.file.buffer;
    let imageType = req.file.mimetype;
    
    // Konvertiere HEIC zu JPEG falls nötig
    if (req.file.originalname.toLowerCase().endsWith('.heic') || req.file.mimetype === 'image/heic') {
      try {
        const heicConvert = require('heic-convert');
        imageBuffer = await heicConvert({
          buffer: req.file.buffer,
          format: 'JPEG',
          quality: 0.9
        });
        imageType = 'image/jpeg';
        console.log('HEIC zu JPEG konvertiert');
      } catch (error) {
        console.error('Fehler bei HEIC-Konvertierung:', error);
        return res.status(500).json({
          success: false,
          error: 'Fehler bei der Bildkonvertierung'
        });
      }
    }
    
    // Komprimiere das Bild auf maximal 800px Breite/Höhe
    try {
      imageBuffer = await sharp(imageBuffer)
        .resize({
          width: 800,
          height: 800,
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85 })
        .toBuffer();
      
      console.log(`Bild auf ${imageBuffer.length} Bytes komprimiert`);
    } catch (error) {
      console.error('Fehler bei der Bildkomprimierung:', error);
    }
    
    // Erstelle ein Thumbnail für die Seitenleiste
    let thumbnailBuffer;
    try {
      thumbnailBuffer = await sharp(imageBuffer)
        .resize({
          width: 100,
          height: 100,
          fit: 'cover'
        })
        .jpeg({ quality: 70 })
        .toBuffer();
      
      console.log(`Thumbnail erstellt: ${thumbnailBuffer.length} Bytes`);
    } catch (error) {
      console.error('Fehler beim Erstellen des Thumbnails:', error);
      thumbnailBuffer = null;
    }
    
    // Speichere in der Datenbank
    const imageBase64 = imageBuffer.toString('base64');
    const thumbnailBase64 = thumbnailBuffer ? thumbnailBuffer.toString('base64') : null;
    
    const result = await pool.query(`
      INSERT INTO locations (title, latitude, longitude, description, image_data, image_type, thumbnail_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      title,
      latitude,
      longitude,
      description || null,
      imageBase64,
      imageType,
      thumbnailBase64
    ]);
    
    console.log(`Ort mit ID ${result.rows[0].id} erstellt`);
    
    res.json({
      success: true,
      locationId: result.rows[0].id
    });
    
  } catch (error) {
    console.error('Fehler beim Erstellen des Ortes:', error);
    res.status(500).json({
      success: false,
      error: 'Serverfehler'
    });
  }
});

// Ort löschen
app.delete('/api/locations/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM locations WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ort nicht gefunden'
      });
    }
    
    console.log(`Ort mit ID ${id} gelöscht`);
    
    res.json({
      success: true,
      message: 'Ort erfolgreich gelöscht'
    });
  } catch (error) {
    console.error('Fehler beim Löschen des Ortes:', error);
    res.status(500).json({
      success: false,
      error: 'Datenbankfehler'
    });
  }
});

// Datenbank zurücksetzen (Admin)
app.post('/api/admin/reset-database', requireAuth, async (req, res) => {
  try {
    // Lösche alle Einträge aus der locations-Tabelle
    await pool.query('DELETE FROM locations');
    
    console.log('Datenbank zurückgesetzt');
    
    res.json({
      success: true,
      message: 'Datenbank erfolgreich zurückgesetzt'
    });
  } catch (error) {
    console.error('Fehler beim Zurücksetzen der Datenbank:', error);
    res.status(500).json({
      success: false,
      error: 'Datenbankfehler'
    });
  }
});

// Frontend-Dateien bereitstellen
app.use(express.static('public'));

// Index.html für alle unbekannten Routen senden (für clientseitiges Routing)
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

// Starte den Server
async function startServer() {
  try {
    // Prüfe und erstelle Datenbanktabellen
    await checkTablesExist();
    
    // Starte den Server
    app.listen(port, '0.0.0.0', () => {
      console.log(`Server läuft auf Port ${port}`);
    });
  } catch (error) {
    console.error('Fehler beim Starten des Servers:', error);
  }
}

startServer();
