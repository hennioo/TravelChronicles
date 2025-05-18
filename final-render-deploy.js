// Optimierter Node.js Server für Render-Deployment
// Enthält alle Bildverarbeitungsverbesserungen und SSL-Support
const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');

// Server erstellen
const app = express();
const port = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist'))); // Frontend-Assets

// Multer für Datei-Uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB Limit
  }
});

// Datenbankverbindung mit SSL für Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Wichtig für Supabase/Render
  }
});

// Hilfsfunktion für Byte-Formatierung
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Bild komprimieren
async function compressImage(buffer, mimeType) {
  try {
    console.log(`Komprimiere Bild vom Typ ${mimeType}...`);
    
    // JPEG/JPG komprimieren
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      const compressed = await sharp(buffer)
        .jpeg({ quality: 60, mozjpeg: true })
        .toBuffer();
      
      const originalSize = buffer.length;
      const compressedSize = compressed.length;
      const savingsPercent = ((1 - compressedSize / originalSize) * 100).toFixed(2);
      
      console.log(`Bild komprimiert: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (${savingsPercent}% gespart)`);
      
      return {
        buffer: compressed,
        mimeType: 'image/jpeg',
        originalSize,
        compressedSize
      };
    }
    
    // PNG komprimieren
    if (mimeType.includes('png')) {
      const compressed = await sharp(buffer)
        .png({ quality: 60, compressionLevel: 9 })
        .toBuffer();
      
      const originalSize = buffer.length;
      const compressedSize = compressed.length;
      
      return {
        buffer: compressed,
        mimeType: 'image/png',
        originalSize,
        compressedSize
      };
    }
    
    // Andere Formate zu JPEG konvertieren
    const compressed = await sharp(buffer)
      .jpeg({ quality: 60, mozjpeg: true })
      .toBuffer();
    
    return {
      buffer: compressed,
      mimeType: 'image/jpeg',
      originalSize: buffer.length,
      compressedSize: compressed.length
    };
  } catch (err) {
    console.error('Fehler bei Bildkompression:', err);
    return {
      buffer,
      mimeType,
      originalSize: buffer.length,
      compressedSize: buffer.length
    };
  }
}

// Server-Status-Endpunkt
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    server: 'Susibert Travel Map Server',
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || 'production'
  });
});

// Health-Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Statusberichte für API
app.get('/api', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Susibert Travel Map API is running',
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

// Zugriffscode prüfen
app.post('/api/access-codes/validate', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        message: "Kein Zugangscode angegeben"
      });
    }
    
    // Überprüfe, ob der Code dem Umgebungs-Secret entspricht
    const validCode = process.env.ACCESS_CODE || 'suuuu';
    
    if (code === validCode) {
      console.log('Login-Versuch mit Code: ******');
      
      // Session erstellen
      const sessionId = require('crypto').randomBytes(16).toString('hex');
      console.log(`Neue Session erstellt: ${sessionId}`);
      
      return res.status(200).json({
        valid: true,
        message: "Zugriff gewährt",
        sessionId
      });
    } else {
      console.log('Ungültiger Login-Versuch');
      return res.status(401).json({
        valid: false,
        message: "Ungültiger Zugangscode"
      });
    }
  } catch (error) {
    console.error("Fehler bei Zugangscode-Validierung:", error);
    return res.status(500).json({
      message: "Serverfehler"
    });
  }
});

// Alle Orte abrufen
app.get('/api/locations', async (req, res) => {
  try {
    // Session prüfen
    const sessionId = req.query.sessionId;
    if (!sessionId) {
      return res.status(401).json({
        message: "Nicht authentifiziert"
      });
    }
    
    // Orte aus der Datenbank abfragen
    const result = await pool.query(`
      SELECT 
        id, title as name, description, created_at as date, highlight, latitude, longitude, country_code as countryCode,
        CASE WHEN image IS NOT NULL THEN true ELSE false END as has_image
      FROM locations 
      ORDER BY id DESC
    `);
    
    console.log("Orte abgerufen:", result.rows.length);
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Fehler beim Abrufen der Orte:", error);
    return res.status(500).json({
      message: "Serverfehler: " + (error.message || "Unbekannter Fehler")
    });
  }
});

// Optimierter Bild-Abruf-Endpunkt
app.get('/api/locations/:id/image', async (req, res) => {
  const startTime = Date.now();
  try {
    // Session prüfen
    const sessionId = req.query.sessionId;
    if (!sessionId) {
      return res.status(401).json({ message: "Nicht authentifiziert" });
    }
    
    const id = parseInt(req.params.id);
    console.log(`Bild für Ort ${id} angefordert`);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: "Ungültige Orts-ID" });
    }
    
    // Mit Einzelclient für bessere Fehlerbehandlung
    const client = await pool.connect();
    console.log(`DB-Verbindung für Bild ${id} hergestellt`);
    
    try {
      // Bild aus der Datenbank holen
      const result = await client.query(`
        SELECT image, image_type
        FROM locations
        WHERE id = $1
      `, [id]);
      
      console.log(`Abfrageergebnis für Bild ${id}: ${result.rowCount} Zeilen gefunden`);
      
      if (result.rows.length === 0) {
        client.release();
        console.log(`Bild ${id} nicht gefunden (keine Zeile in DB)`);
        return res.status(404).json({ message: "Bild nicht gefunden" });
      }
      
      if (!result.rows[0].image) {
        client.release();
        console.log(`Bild ${id} ist NULL in der Datenbank`);
        return res.status(404).json({ message: "Leeres Bild in Datenbank" });
      }
      
      // Bild-Informationen auslesen
      const imageBase64 = result.rows[0].image;
      const imageType = result.rows[0].image_type || 'image/jpeg';
      console.log(`Bild ${id} gefunden: Typ ${imageType}, Base64-Länge: ${imageBase64.length}`);
      
      // Header zurücksetzen und korrekt setzen
      res.setHeader('Content-Type', imageType);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      
      // Base64 in binäre Daten konvertieren
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      console.log(`Bild ${id} in Buffer konvertiert: ${imageBuffer.length} Bytes`);
      
      // Verbindung freigeben
      client.release();
      
      // Binärdaten direkt senden
      res.end(imageBuffer);
      
      const endTime = Date.now();
      console.log(`✅ Bild ${id} erfolgreich gesendet (${endTime - startTime}ms)`);
      
    } catch (queryError) {
      client.release();
      console.error(`Fehler bei der Datenbankabfrage für Bild ${id}:`, queryError);
      return res.status(500).json({ message: "Datenbankfehler: " + (queryError.message || 'Unbekannter Fehler') });
    }
    
  } catch (error) {
    console.error(`Allgemeiner Fehler beim Abrufen des Bildes ${req.params.id}:`, error);
    return res.status(500).json({ message: "Serverfehler: " + (error.message || 'Unbekannter Fehler') });
  }
});

// Neuen Ort mit optimiertem Bild-Upload hinzufügen
app.post('/api/locations', upload.single('image'), async (req, res) => {
  try {
    // Session prüfen
    const sessionId = req.body.sessionId || req.query.sessionId;
    if (!sessionId) {
      return res.status(401).json({ message: "Nicht authentifiziert" });
    }
    
    console.log('Neuer Ort wird erstellt...');
    const { title, description, highlight, latitude, longitude, countryCode } = req.body;
    
    // Validierung
    if (!title || !latitude || !longitude) {
      return res.status(400).json({ 
        message: "Pflichtfelder fehlen" 
      });
    }
    
    // Bilder sind optional, aber wenn eins hochgeladen wurde, verarbeiten
    let imageBase64 = null;
    let imageType = null;
    
    if (req.file) {
      console.log(`Bild hochgeladen: ${formatBytes(req.file.size)}, Typ: ${req.file.mimetype}`);
      
      try {
        // Bild komprimieren
        const processedImage = await compressImage(req.file.buffer, req.file.mimetype);
        
        // In Base64 konvertieren
        imageBase64 = processedImage.buffer.toString('base64');
        imageType = processedImage.mimeType;
        
        console.log(`Bild für Ort "${title}" verarbeitet: ${formatBytes(processedImage.compressedSize)}`);
      } catch (imgError) {
        console.error('Fehler bei Bildverarbeitung:', imgError);
        
        // Fallback auf unkomprimiertes Bild
        imageBase64 = req.file.buffer.toString('base64');
        imageType = req.file.mimetype;
      }
    } else {
      console.warn("Kein Bild hochgeladen");
      return res.status(400).json({
        message: "Ein Bild wird benötigt"
      });
    }
    
    // In Datenbank speichern
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        INSERT INTO locations (title, description, highlight, latitude, longitude, country_code, image, image_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, title, description, created_at as date, highlight, latitude, longitude, country_code as countryCode
      `, [
        title,
        description || '',
        highlight || '',
        parseFloat(latitude),
        parseFloat(longitude),
        countryCode || '',
        imageBase64,
        imageType
      ]);
      
      client.release();
      
      const newLocation = result.rows[0];
      newLocation.has_image = true;
      
      console.log(`✅ Neuer Ort mit ID ${newLocation.id} erfolgreich gespeichert`);
      return res.status(201).json(newLocation);
    } catch (dbError) {
      client.release();
      throw dbError;
    }
    
  } catch (error) {
    console.error("Fehler beim Erstellen des Orts:", error);
    return res.status(500).json({ 
      message: "Serverfehler: " + (error.message || "Unbekannter Fehler") 
    });
  }
});

// Füge optionell SPA-Support hinzu (Single Page Application)
app.get('*', (req, res) => {
  // Wenn die Anfrage nicht /api/ enthält, sende das Frontend
  if (!req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
  // Sonst handle 404 für API-Routen
  res.status(404).json({ message: 'API-Endpunkt nicht gefunden' });
});

// Server starten
async function startServer() {
  try {
    // Verbindung zur Datenbank testen
    const client = await pool.connect();
    console.log('✅ Datenbank-Verbindung erfolgreich');
    
    // Tabellen-Existenz prüfen
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'locations'
      );
    `);
    
    const tableExists = tableCheck.rows[0].exists;
    console.log(`Tabelle 'locations' existiert: ${tableExists}`);
    
    if (tableExists) {
      // Anzahl der Bilder checken
      const countResult = await client.query('SELECT COUNT(*) FROM locations');
      console.log(`Anzahl Einträge in locations: ${countResult.rows[0].count}`);
      
      // Anzahl der Bilder checken
      const imageCountResult = await client.query('SELECT COUNT(*) FROM locations WHERE image IS NOT NULL');
      console.log(`Anzahl Einträge mit Bildern: ${imageCountResult.rows[0].count}`);
    }
    
    client.release();
    
    // Server starten
    app.listen(port, () => {
      console.log(`
      ===================================
      🌎 Susibert Server läuft auf Port ${port}
      ===================================
      Umgebung: ${process.env.NODE_ENV || 'production'}
      Datenbank: Supabase PostgreSQL
      `);
    });
  } catch (err) {
    console.error('❌ Fehler beim Starten des Servers:', err);
    process.exit(1);
  }
}

// Server starten
startServer();