#!/bin/bash

echo "Erstelle einen Server mit CSS-basierter Bildanzeige..."

# Erstelle das server.js mit dem CSS-Bildanzeige-Fix
cat > server.js << 'EOL'
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
EOL

# Kopiere die original index.html als Sicherung
cp -f public/index.html public/index.html.backup

# Aktualisiere index.html mit dem Fix für die Bildanzeige
cat > public/index.html << 'EOL'
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Susibert - Reisekarte</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    :root {
      --primary-color: #f2960c;
      --primary-light: #f9b44c;
      --primary-dark: #d17d00;
      --dark-bg: #222;
      --light-text: #eee;
      --dark-text: #333;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      background-color: #111;
      color: var(--light-text);
      min-height: 100vh;
    }
    
    /* Login-Bereich */
    .login-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
      background-color: #000;
    }
    
    .couple-image-container {
      width: 100%;
      max-width: 400px;
      margin-bottom: 20px;
      border-radius: 12px;
      overflow: hidden;
    }
    
    .couple-image {
      width: 100%;
      height: auto;
      display: block;
    }
    
    .login-form {
      width: 100%;
      max-width: 400px;
      padding: 20px;
      background-color: rgba(30, 30, 30, 0.8);
      border-radius: 12px;
      backdrop-filter: blur(10px);
    }
    
    .login-form h2 {
      margin-bottom: 20px;
      text-align: center;
      color: var(--primary-color);
    }
    
    .form-group {
      margin-bottom: 15px;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 5px;
      color: var(--light-text);
    }
    
    .form-group input {
      width: 100%;
      padding: 10px;
      background-color: #333;
      border: 1px solid #444;
      border-radius: 6px;
      color: white;
    }
    
    .btn {
      display: block;
      width: 100%;
      padding: 12px;
      margin-top: 20px;
      background-color: var(--primary-color);
      border: none;
      border-radius: 6px;
      color: white;
      font-weight: bold;
      cursor: pointer;
      transition: background-color 0.3s;
    }
    
    .btn:hover {
      background-color: var(--primary-light);
    }
    
    /* Map-Bereich */
    .app-container {
      display: none;
      height: 100vh;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 20px;
      background-color: var(--dark-bg);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      position: relative;
      z-index: 1000;
    }
    
    .logo-container {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .logo {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background-color: var(--primary-color);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 20px;
    }
    
    .app-title {
      font-size: 24px;
      font-weight: bold;
      background: linear-gradient(90deg, var(--primary-color), var(--primary-light));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    
    .header-buttons {
      display: flex;
      gap: 10px;
    }
    
    .map-container {
      width: 90%;
      height: calc(100vh - 60px);
      margin: 0 auto;
      border-radius: 8px;
      overflow: hidden;
    }
    
    #map {
      width: 100%;
      height: 100%;
    }
    
    /* Menü-Bereich */
    .hamburger-button {
      background: none;
      border: none;
      font-size: 30px;
      color: var(--light-text);
      cursor: pointer;
      z-index: 1001;
    }
    
    .sidebar {
      position: fixed;
      top: 0;
      right: -300px;
      width: 300px;
      height: 100vh;
      background-color: var(--dark-bg);
      transition: right 0.3s ease;
      z-index: 2000;
      box-shadow: -2px 0 5px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
    }
    
    .sidebar.open {
      right: 0;
    }
    
    .sidebar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      border-bottom: 1px solid #444;
    }
    
    .close-sidebar {
      background: none;
      border: none;
      font-size: 24px;
      color: var(--light-text);
      cursor: pointer;
    }
    
    .sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }
    
    .location-list {
      list-style: none;
    }
    
    .location-item {
      margin-bottom: 15px;
      padding: 10px;
      background-color: #333;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    
    .location-item:hover {
      background-color: #444;
    }
    
    .location-thumbnail {
      width: 100%;
      height: 100px;
      object-fit: cover;
      border-radius: 6px;
      margin-bottom: 8px;
    }
    
    .sidebar-footer {
      padding: 20px;
      border-top: 1px solid #444;
    }
    
    /* Admin-Bereich */
    .admin-container {
      padding: 20px;
      background-color: var(--dark-bg);
    }
    
    .admin-header {
      margin-bottom: 20px;
    }
    
    .admin-card {
      background-color: #333;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    
    .admin-card h3 {
      margin-bottom: 15px;
      color: var(--primary-color);
    }
    
    .warning-text {
      color: #ff6b6b;
      margin-bottom: 15px;
    }
    
    /* Detail-Ansicht */
    .detail-view {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90%;
      max-width: 500px;
      background-color: rgba(34, 34, 34, 0.95);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
      z-index: 1500;
      backdrop-filter: blur(5px);
    }
    
    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    
    .close-button {
      background: none;
      border: none;
      font-size: 24px;
      color: var(--light-text);
      cursor: pointer;
    }
    
    .image-container {
      margin-bottom: 15px;
    }
    
    .location-image {
      width: 100%;
      max-height: 300px;
      object-fit: cover;
      border-radius: 8px;
      margin-bottom: 15px;
    }
    
    .location-description {
      margin-bottom: 20px;
      line-height: 1.6;
    }
    
    .delete-button {
      padding: 8px 16px;
      background-color: #ff5555;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    
    .delete-button:hover {
      background-color: #ff3333;
    }
    
    /* Add Form */
    .add-form {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90%;
      max-width: 500px;
      background-color: rgba(34, 34, 34, 0.95);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
      z-index: 1500;
      backdrop-filter: blur(5px);
      display: none;
    }
    
    .add-form h2 {
      margin-bottom: 20px;
    }
    
    .form-buttons {
      display: flex;
      justify-content: space-between;
      margin-top: 20px;
    }
    
    /* Add Marker Popup */
    .add-marker-popup {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(34, 34, 34, 0.9);
      padding: 10px 20px;
      border-radius: 30px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      display: none;
    }
    
    .confirm-marker {
      padding: 8px 16px;
      background-color: var(--primary-color);
      color: white;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      margin-right: 10px;
    }
    
    .cancel-marker {
      padding: 8px 16px;
      background-color: #555;
      color: white;
      border: none;
      border-radius: 20px;
      cursor: pointer;
    }
    
    /* Map Controls */
    .map-controls {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .map-control-button {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background-color: rgba(34, 34, 34, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 24px;
      border: none;
      cursor: pointer;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
      transition: background-color 0.2s;
    }
    
    .map-control-button:hover {
      background-color: var(--primary-color);
    }
    
    .debug-image-container {
      border: 2px solid red;
      padding: 10px;
      position: fixed;
      top: 10px;
      left: 10px;
      z-index: 2000;
      background: rgba(0, 0, 0, 0.8);
      color: white;
    }
  </style>
</head>
<body>
  <!-- Login-Bereich -->
  <div class="login-container" id="login-container">
    <div class="couple-image-container">
      <img src="/couple-image.jpg" alt="Paar" class="couple-image" id="couple-image">
    </div>
    <form class="login-form" id="login-form">
      <h2>SUSIBERT</h2>
      <div class="form-group">
        <label for="access-code">Zugangscode</label>
        <input type="password" id="access-code" required>
      </div>
      <button type="submit" class="btn">Zugang erhalten</button>
    </form>
  </div>
  
  <!-- App-Bereich -->
  <div class="app-container" id="app-container">
    <header class="header">
      <div class="logo-container">
        <div class="logo">S</div>
        <h1 class="app-title">Susibert</h1>
      </div>
      <div class="header-buttons">
        <button class="btn" id="logout-button">Abmelden</button>
        <button class="hamburger-button" id="hamburger-button">☰</button>
      </div>
    </header>
    
    <div class="map-container">
      <div id="map"></div>
    </div>
    
    <div class="map-controls">
      <button class="map-control-button" id="edit-mode-button">✏️</button>
    </div>
    
    <div class="add-marker-popup" id="add-marker-popup">
      <button class="confirm-marker" id="confirm-marker">Bestätigen</button>
      <button class="cancel-marker" id="cancel-marker">Abbrechen</button>
    </div>
  </div>
  
  <!-- Seitenleiste -->
  <div class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <h2>Orte</h2>
      <button class="close-sidebar" id="close-sidebar">×</button>
    </div>
    <div class="sidebar-content">
      <ul class="location-list" id="location-list">
        <!-- Orte werden hier dynamisch eingefügt -->
      </ul>
    </div>
    <div class="sidebar-footer">
      <button class="btn" id="admin-button">Admin-Bereich</button>
    </div>
  </div>
  
  <!-- Add Location Form -->
  <form class="add-form" id="add-form" enctype="multipart/form-data">
    <h2>Neuen Ort hinzufügen</h2>
    <div class="form-group">
      <label for="title">Titel</label>
      <input type="text" id="title" name="title" required>
    </div>
    <div class="form-group">
      <label for="description">Beschreibung (optional)</label>
      <textarea id="description" name="description" rows="4"></textarea>
    </div>
    <div class="form-group">
      <label for="image">Bild</label>
      <input type="file" id="image" name="image" accept="image/*" required>
    </div>
    <input type="hidden" id="latitude" name="latitude">
    <input type="hidden" id="longitude" name="longitude">
    <div class="form-buttons">
      <button type="button" class="btn" id="cancel-add">Abbrechen</button>
      <button type="submit" class="btn">Speichern</button>
    </div>
  </form>
  
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    // Globale Variablen
    let map;
    let markers = [];
    let circleOverlays = [];
    let editMode = false;
    let tempMarker = null;
    
    // Warte, bis das DOM geladen ist
    document.addEventListener('DOMContentLoaded', function() {
      // Koppelbild-Fallback für Login
      const coupleImage = document.getElementById('couple-image');
      coupleImage.onerror = function() {
        // Wenn das normale Bild nicht geladen werden kann, versuche die andere Quelle
        this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2YyOTYwYyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPktvcHBlbGJpbGQ8L3RleHQ+PC9zdmc+';
      };
      
      // Überprüfe, ob eine gültige Session existiert
      checkSession();
      
      // Login-Form Submit
      document.getElementById('login-form').addEventListener('submit', function(e) {
        e.preventDefault();
        login();
      });
      
      // Logout-Button
      document.getElementById('logout-button').addEventListener('click', logout);
      
      // Sidebar öffnen/schließen
      document.getElementById('hamburger-button').addEventListener('click', openSidebar);
      document.getElementById('close-sidebar').addEventListener('click', closeSidebar);
      
      // Admin-Bereich
      document.getElementById('admin-button').addEventListener('click', function() {
        window.location.href = '/admin';
      });
      
      // Edit-Mode Toggle
      document.getElementById('edit-mode-button').addEventListener('click', toggleEditMode);
      
      // Add Marker Popup
      document.getElementById('confirm-marker').addEventListener('click', showAddForm);
      document.getElementById('cancel-marker').addEventListener('click', cancelAddMarker);
      
      // Add Form
      document.getElementById('add-form').addEventListener('submit', addLocation);
      document.getElementById('cancel-add').addEventListener('click', cancelAddForm);
    });
    
    // Hilfsfunktion zum Extrahieren der Session-ID aus dem Cookie
    function getSessionId() {
      return document.cookie.split(';')
        .find(c => c.trim().startsWith('sessionId='))
        ?.split('=')[1] || '';
    }
    
    // Überprüfe, ob eine gültige Session existiert
    function checkSession() {
      const sessionId = getSessionId();
      
      if (!sessionId) {
        showLogin();
        return;
      }
      
      // Überprüfe die Session beim Server
      fetch(`/api/locations?sessionId=${sessionId}`)
        .then(response => {
          if (response.ok) {
            initApp();
          } else {
            showLogin();
          }
        })
        .catch(error => {
          console.error('Fehler bei der Session-Überprüfung:', error);
          showLogin();
        });
    }
    
    // Login-Funktion
    function login() {
      const accessCode = document.getElementById('access-code').value;
      
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
          // Cookie wird vom Server gesetzt, initialisiere die App
          initApp();
        } else {
          alert('Falscher Zugangscode. Bitte versuche es erneut.');
        }
      })
      .catch(error => {
        console.error('Login-Fehler:', error);
        alert('Ein Fehler ist aufgetreten. Bitte versuche es später erneut.');
      });
    }
    
    // Logout-Funktion
    function logout() {
      fetch('/api/logout', { method: 'POST' })
        .then(() => {
          // Zeige den Login-Bereich an
          showLogin();
        })
        .catch(error => {
          console.error('Logout-Fehler:', error);
        });
    }
    
    // Zeige den Login-Bereich an
    function showLogin() {
      document.getElementById('login-container').style.display = 'flex';
      document.getElementById('app-container').style.display = 'none';
      document.getElementById('sidebar').classList.remove('open');
    }
    
    // Initialisiere die App
    function initApp() {
      // Zeige den App-Bereich an
      document.getElementById('login-container').style.display = 'none';
      document.getElementById('app-container').style.display = 'block';
      
      // Initialisiere die Karte
      initMap();
      
      // Lade alle Orte
      loadLocations();
      
      console.log('[DEBUG] Session-ID', getSessionId(), 'gefunden:', getSessionId().length > 0);
    }
    
    // Initialisiere die Karte
    function initMap() {
      // Wenn die Karte bereits initialisiert wurde, nichts tun
      if (map) return;
      
      // Erstelle die Leaflet-Karte
      map = L.map('map').setView([25, 0], 2); // Zentriere auf Welt-Ansicht
      
      // Füge die Kartenkacheln hinzu (Leaflet-Standard)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      
      // Click-Event-Handler für die Karte
      map.on('click', function(e) {
        if (editMode) {
          // In Edit-Mode: Füge einen temporären Marker hinzu
          const { lat, lng } = e.latlng;
          
          // Entferne vorherigen temporären Marker, falls vorhanden
          if (tempMarker) {
            map.removeLayer(tempMarker);
          }
          
          // Setze einen neuen temporären Marker
          tempMarker = L.marker([lat, lng]).addTo(map);
          
          // Speichere die Koordinaten im Formular
          document.getElementById('latitude').value = lat;
          document.getElementById('longitude').value = lng;
          
          // Zeige das Bestätigungspopup an
          document.getElementById('add-marker-popup').style.display = 'block';
        }
      });
    }
    
    // Lade alle Orte
    function loadLocations() {
      const sessionId = getSessionId();
      console.log('[DEBUG] Lade Orte...');
      
      fetch(`/api/locations?sessionId=${sessionId}`)
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            console.log(`[DEBUG] Orte geladen: ${data.locations.length}`);
            
            // Lösche alle vorhandenen Marker und Overlays
            clearMapMarkers();
            
            // Seitenleiste leeren
            const locationList = document.getElementById('location-list');
            locationList.innerHTML = '';
            
            // Füge die Orte zur Karte und Seitenleiste hinzu
            data.locations.forEach(location => {
              addLocationToMap(location);
              addLocationToSidebar(location);
            });
          } else {
            console.error('Fehler beim Laden der Orte:', data.error);
          }
        })
        .catch(error => {
          console.error('Fehler beim Laden der Orte:', error);
        });
    }
    
    // Füge einen Ort zur Karte hinzu
    function addLocationToMap(location) {
      // Marker erstellen
      const marker = L.marker([location.latitude, location.longitude])
        .addTo(map)
        .on('click', function() {
          if (!editMode) {
            showLocationDetail(location.id);
          }
        });
      
      // Speichere den Marker in der globalen Liste
      markers.push({ id: location.id, marker: marker });
      
      // Füge den Radius-Effekt hinzu (50km mit Farbverlauf)
      const circle = L.circle([location.latitude, location.longitude], {
        radius: 50000, // 50km in Metern
        color: '#f2960c',
        fillColor: '#f2960c',
        fillOpacity: 0.3,
        weight: 1
      }).addTo(map);
      
      // Speichere den Circle in der globalen Liste
      circleOverlays.push({ id: location.id, circle: circle });
    }
    
    // Füge einen Ort zur Seitenleiste hinzu
    function addLocationToSidebar(location) {
      const locationList = document.getElementById('location-list');
      
      const listItem = document.createElement('li');
      listItem.className = 'location-item';
      listItem.setAttribute('data-id', location.id);
      
      // HTML-Inhalt des Listeneintrags
      listItem.innerHTML = `
        <div class="location-thumbnail-container">
          ${location.has_image ? 
            `<div style="height:100px;background-image:url('/api/locations/${location.id}/thumbnail?sessionId=${getSessionId()}&nocache=${Date.now()}');background-size:cover;background-position:center;border-radius:6px;margin-bottom:8px;"></div>` : 
            '<div style="height:100px;background-color:#444;border-radius:6px;margin-bottom:8px;display:flex;align-items:center;justify-content:center;">Kein Bild</div>'}
        </div>
        <div class="location-title">${location.title}</div>
      `;
      
      // Event-Listener für Klick auf den Listeneintrag
      listItem.addEventListener('click', function() {
        // Seitenleiste schließen (auf mobilen Geräten)
        closeSidebar();
        
        // Zur Position zoomen und Detail anzeigen
        const locationId = this.getAttribute('data-id');
        const locationObj = markers.find(m => m.id == locationId);
        
        if (locationObj) {
          // Zentriere die Karte auf den Marker
          map.setView(locationObj.marker.getLatLng(), 10);
          
          // Zeige die Detailansicht an
          showLocationDetail(locationId);
        }
      });
      
      locationList.appendChild(listItem);
    }
    
    // Lösche alle Marker und Overlays von der Karte
    function clearMapMarkers() {
      // Entferne alle Marker
      markers.forEach(m => map.removeLayer(m.marker));
      markers = [];
      
      // Entferne alle Circle-Overlays
      circleOverlays.forEach(c => map.removeLayer(c.circle));
      circleOverlays = [];
    }
    
    // Funktionalität zum Anzeigen der Detailansicht für einen Ort
    function showLocationDetail(locationId) {
      console.log('[DEBUG] Detailansicht für Ort:', locationId);
      
      // Bestehende Detailansicht entfernen, falls vorhanden
      const existingDetail = document.querySelector('.detail-view');
      if (existingDetail) {
        existingDetail.remove();
      }
      
      // Lade die Ortsdaten
      const sessionId = getSessionId();
      fetch(`/api/locations/${locationId}?sessionId=${sessionId}`)
        .then(response => response.json())
        .then(location => {
          // Detailansicht erstellen
          const detailView = document.createElement('div');
          detailView.className = 'detail-view';
          detailView.setAttribute('data-location-id', locationId);
          
          // Inhalt für die Detailansicht
          detailView.innerHTML = `
            <div class="detail-header">
              <h2>${location.title}</h2>
              <button class="close-button">&times;</button>
            </div>
            <div class="image-container">
              <div class="location-image" style="height:200px;background-color:#333;"></div>
            </div>
            <div class="location-description">
              ${location.description || 'Keine Beschreibung vorhanden.'}
            </div>
            <button class="delete-button">Löschen</button>
          `;
          
          // Füge die Detailansicht zur Seite hinzu
          document.body.appendChild(detailView);
          
          // Bild laden (als CSS-Hintergrund)
          const imageContainer = detailView.querySelector('.location-image');
          
          fetch(`/api/locations/${locationId}/image/base64?sessionId=${sessionId}&nocache=${Date.now()}`)
            .then(response => response.json())
            .then(data => {
              if (data.success && data.imageData) {
                console.log('[DEBUG] Bild erhalten, Länge:', data.imageData.length);
                imageContainer.style.backgroundImage = `url('data:${data.imageType || 'image/jpeg'};base64,${data.imageData}')`;
                imageContainer.style.backgroundSize = 'cover';
                imageContainer.style.backgroundPosition = 'center';
              } else {
                console.error('[DEBUG] Keine Bilddaten in der Antwort:', data);
                imageContainer.textContent = 'Bild konnte nicht geladen werden.';
              }
            })
            .catch(error => {
              console.error('[DEBUG] Fehler beim Laden des Bildes:', error);
              imageContainer.textContent = 'Fehler beim Laden des Bildes.';
            });
          
          // Event-Listener für den Schließen-Button
          detailView.querySelector('.close-button').addEventListener('click', function() {
            detailView.remove();
          });
          
          // Event-Listener für den Löschen-Button
          detailView.querySelector('.delete-button').addEventListener('click', function() {
            if (confirm('Möchtest du diesen Ort wirklich löschen?')) {
              fetch(`/api/locations/${locationId}?sessionId=${sessionId}`, {
                method: 'DELETE'
              })
              .then(response => response.json())
              .then(data => {
                if (data.success) {
                  detailView.remove();
                  loadLocations(); // Orte neu laden
                } else {
                  alert('Fehler beim Löschen des Ortes: ' + data.error);
                }
              })
              .catch(error => {
                console.error('Fehler beim Löschen:', error);
                alert('Fehler beim Löschen des Ortes.');
              });
            }
          });
        })
        .catch(error => {
          console.error('Fehler beim Laden der Ortsdaten:', error);
        });
    }
    
    // Toggle Edit-Mode
    function toggleEditMode() {
      editMode = !editMode;
      
      const editButton = document.getElementById('edit-mode-button');
      
      if (editMode) {
        editButton.style.backgroundColor = '#f2960c';
      } else {
        editButton.style.backgroundColor = 'rgba(34, 34, 34, 0.8)';
        
        // Entferne temporären Marker
        if (tempMarker) {
          map.removeLayer(tempMarker);
          tempMarker = null;
        }
        
        // Verstecke das Bestätigungspopup
        document.getElementById('add-marker-popup').style.display = 'none';
      }
    }
    
    // Bestätige den neuen Marker und zeige das Formular an
    function showAddForm() {
      document.getElementById('add-marker-popup').style.display = 'none';
      document.getElementById('add-form').style.display = 'block';
    }
    
    // Brich das Hinzufügen eines Markers ab
    function cancelAddMarker() {
      // Verstecke das Popup
      document.getElementById('add-marker-popup').style.display = 'none';
      
      // Entferne den temporären Marker
      if (tempMarker) {
        map.removeLayer(tempMarker);
        tempMarker = null;
      }
    }
    
    // Brich das Hinzufügen eines Ortes ab
    function cancelAddForm() {
      // Verstecke das Formular
      document.getElementById('add-form').style.display = 'none';
      
      // Entferne den temporären Marker
      if (tempMarker) {
        map.removeLayer(tempMarker);
        tempMarker = null;
      }
      
      // Formular zurücksetzen
      document.getElementById('add-form').reset();
    }
    
    // Füge einen neuen Ort hinzu
    function addLocation(e) {
      e.preventDefault();
      
      // Formular-Daten sammeln
      const formData = new FormData(document.getElementById('add-form'));
      
      // Session-ID hinzufügen (sowohl als Form-Feld als auch als Query-Parameter)
      const sessionId = getSessionId();
      formData.append('sessionId', sessionId);
      
      // Validiere Eingaben
      const title = formData.get('title');
      const lat = formData.get('latitude');
      const lng = formData.get('longitude');
      const image = formData.get('image');
      
      console.log('[DEBUG] Alle Eingaben validiert, bereite FormData vor:', 
                 'title:', title, 
                 'lat:', lat, 
                 'lng:', lng, 
                 'Bild ausgewählt:', image && image.name ? 'Ja' : 'Nein');
      
      if (!title || !lat || !lng || !image || !image.name) {
        alert('Bitte fülle alle Pflichtfelder aus');
        return;
      }
      
      console.log('[DEBUG] Formular wird abgesendet', 'sessionId:', sessionId);
      
      // Sende die Daten an den Server
      fetch(`/api/locations?sessionId=${sessionId}`, {
        method: 'POST',
        body: formData
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          console.log('[DEBUG] Ort erfolgreich hinzugefügt', data);
          
          // Formular zurücksetzen und verstecken
          document.getElementById('add-form').reset();
          document.getElementById('add-form').style.display = 'none';
          
          // Entferne den temporären Marker
          if (tempMarker) {
            map.removeLayer(tempMarker);
            tempMarker = null;
          }
          
          // Deaktiviere den Edit-Mode
          editMode = false;
          document.getElementById('edit-mode-button').style.backgroundColor = 'rgba(34, 34, 34, 0.8)';
          
          // Lade alle Orte neu
          loadLocations();
        } else {
          console.error('[DEBUG] Fehler beim Hinzufügen des Ortes:', data.error);
          alert(`Fehler beim Hinzufügen des Ortes: ${data.error}`);
        }
      })
      .catch(error => {
        console.error('[DEBUG] Fehler beim Hinzufügen des Ortes:', error);
        alert('Ein Fehler ist aufgetreten');
      });
    }
    
    // Seitenleiste öffnen
    function openSidebar() {
      document.getElementById('sidebar').classList.add('open');
    }
    
    // Seitenleiste schließen
    function closeSidebar() {
      document.getElementById('sidebar').classList.remove('open');
    }
  </script>
  
  <!-- Debug-Script für Bildprobleme -->
  <script src="/image-display-fix.js"></script>
</body>
</html>
EOL

# Erstelle Verzeichnisse für öffentliche Dateien
mkdir -p public

# Kopiere das neue Image-Fix-Script
cp image-display-fix.js public/

# Starte den Server
echo "Build abgeschlossen. Starte den Server mit dem Bildanzeige-Fix."

echo "Wenn du dich einloggst, sollen die Bilder nun als CSS-Hintergrund angezeigt werden, was häufig besser funktioniert."
echo "Sollte dies immer noch nicht funktionieren, werden wir einen weiteren Ansatz mit stark komprimierten Bildern ausprobieren."