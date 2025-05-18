const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const multer = require('multer');

// Maximale Dateigröße: 15 MB
const MAX_FILE_SIZE = 15 * 1024 * 1024;

// Uploads-Verzeichnis definieren
const uploadsDir = path.join(__dirname, 'uploads');

// Stellen Sie sicher, dass das Uploads-Verzeichnis existiert
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage konfigurieren
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

// Upload-Handler erstellen
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE }
});

// Express-App erstellen
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadsDir));

// Datenbank-Konfiguration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Datenbank-Verbindung testen
async function connectToDatabase() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('Datenbankverbindung erfolgreich hergestellt:', result.rows[0]);
    client.release();
    return true;
  } catch (error) {
    console.error('Fehler bei der Datenbankverbindung:', error);
    return false;
  }
}

// Session-Management
const sessions = {};

function createSession() {
  const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  sessions[sessionId] = { 
    created: Date.now(),
    expires: Date.now() + 24 * 60 * 60 * 1000 // 24 Stunden
  };
  return sessionId;
}

function isValidSession(sessionId) {
  const session = sessions[sessionId];
  if (!session) {
    return false;
  }
  
  if (session.expires < Date.now()) {
    delete sessions[sessionId];
    return false;
  }
  
  // Session verlängern
  session.expires = Date.now() + 24 * 60 * 60 * 1000;
  return true;
}

function requireAuth(req, res, next) {
  // Session-ID aus Cookie oder Query-Parameter
  const sessionId = req.cookies.sessionId || req.query.sessionId;
  
  console.log(`Auth-Check mit SessionID: ${sessionId}`);
  
  if (!sessionId || !isValidSession(sessionId)) {
    return res.status(401).redirect('/login.html');
  }
  
  console.log(`Session verlängert: ${sessionId}`);
  res.cookie('sessionId', sessionId, { 
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true
  });
  
  next();
}

// Bild eines Ortes abrufen - VERBESSERTE VERSION
app.get('/api/locations/:id/image', async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`Bild für Ort ${id} angefordert`);
    
    // Direkter Abruf der Bilddaten aus der Datenbank
    const result = await pool.query('SELECT image_data, image_type FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0 || !result.rows[0].image_data) {
      console.log(`Kein Bild für Ort ${id} gefunden, sende Ersatz`);
      return res.sendFile(path.join(uploadsDir, 'couple.jpg'));
    }
    
    const { image_data, image_type } = result.rows[0];
    
    // Cache-Header setzen
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Content-Type setzen
    res.setHeader('Content-Type', image_type || 'image/jpeg');
    
    // Als Base64 direkt senden
    console.log(`Sende Base64-Bild für Ort ${id}`);
    const buffer = Buffer.from(image_data, 'base64');
    return res.send(buffer);
  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error);
    // Im Fehlerfall senden wir das Couple-Bild
    return res.sendFile(path.join(uploadsDir, 'couple.jpg'));
  }
});

// Login-Endpunkt
app.post('/api/login', (req, res) => {
  const { accessCode } = req.body;
  
  console.log(`Login-Versuch mit Code: ${accessCode ? '******' : 'kein Code'}`);
  
  if (accessCode === process.env.ACCESS_CODE) {
    const sessionId = createSession();
    console.log(`Neue Session erstellt: ${sessionId}`);
    
    res.cookie('sessionId', sessionId, { 
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true
    });
    
    res.json({ success: true, sessionId });
  } else {
    res.status(401).json({ success: false, message: 'Ungültiger Zugangscode' });
  }
});

// Startseite mit Login-Formular
app.get('/', (req, res) => {
  const sessionId = req.cookies.sessionId;
  
  if (sessionId && isValidSession(sessionId)) {
    return res.redirect('/map.html');
  }
  
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Server starten
async function startServer() {
  const dbConnected = await connectToDatabase();
  
  if (!dbConnected) {
    console.error('Server wird nicht gestartet, da keine Datenbankverbindung besteht.');
    return;
  }
  
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
  });
}

// Server starten
startServer();