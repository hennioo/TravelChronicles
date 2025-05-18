#!/bin/bash

echo "Erstelle Build mit Bild-Kompression..."

# Verzeichnisstruktur erstellen
mkdir -p dist/uploads dist/public

# Server-Code kopieren
cp working-server.js dist/index.js
chmod +x dist/index.js

# Bilder-Kompressionsänderungen hinzufügen
cat >> dist/index.js << 'EOL'

// Verbesserte Bildkomprimierung und -verwaltung
async function compressAndSaveImage(file) {
  try {
    // Lade das Sharp-Modul, falls es vorhanden ist
    let sharp;
    try {
      sharp = require('sharp');
      console.log('Sharp-Modul gefunden, verwende es für Bildkomprimierung');
    } catch (err) {
      console.log('Sharp nicht verfügbar, verwende einfache Bildkonvertierung');
      return fs.readFileSync(file.path, { encoding: 'base64' });
    }
    
    // Lese das Bild ein
    let imageBuffer = fs.readFileSync(file.path);
    
    // HEIC-Format konvertieren, falls nötig
    if (file.mimetype === 'image/heic' || file.originalname.toLowerCase().endsWith('.heic')) {
      try {
        const heicConvert = require('heic-convert');
        console.log('Konvertiere HEIC zu JPEG...');
        imageBuffer = await heicConvert({
          buffer: imageBuffer,
          format: 'JPEG',
          quality: 0.8
        });
        file.mimetype = 'image/jpeg';
      } catch (heicError) {
        console.error('Fehler bei HEIC-Konvertierung:', heicError);
      }
    }
    
    // Bild komprimieren
    const compressedImageBuffer = await sharp(imageBuffer)
      .resize(1200, 1200, { 
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ 
        quality: 80,
        progressive: true
      })
      .toBuffer();
    
    console.log(`Bild wurde komprimiert: ${file.size} Bytes -> ${compressedImageBuffer.length} Bytes`);
    
    // Als Base64 kodieren
    return compressedImageBuffer.toString('base64');
  } catch (error) {
    console.error('Fehler bei der Bildkomprimierung:', error);
    // Fallback zur einfachen Konvertierung
    return fs.readFileSync(file.path, { encoding: 'base64' });
  }
}

// Überschreibe den Ort-Erstellungs-Endpunkt
app.post('/api/locations', requireAuth, upload.single('image'), async (req, res) => {
  try {
    console.log('Neuer Ort wird hinzugefügt');
    
    // Überprüfe, ob ein Bild hochgeladen wurde
    if (!req.file) {
      console.log('Kein Bild hochgeladen');
      return res.status(400).json({ error: 'Bild ist erforderlich' });
    }
    
    console.log(`Bild hochgeladen: ${req.file.originalname}, ${req.file.size} Bytes, ${req.file.mimetype}`);
    
    // Parameter aus dem Request
    const { title, latitude, longitude, description } = req.body;
    
    // Prüfe, ob alle erforderlichen Felder vorhanden sind
    if (!title || !latitude || !longitude) {
      console.log('Fehlende Pflichtfelder in Request');
      return res.status(400).json({ error: 'Titel und Koordinaten sind erforderlich' });
    }
    
    // Bild komprimieren und als Base64 kodieren
    const imageData = await compressAndSaveImage(req.file);
    
    // In die Datenbank einfügen
    const result = await pool.query(
      'INSERT INTO locations (title, latitude, longitude, description, image_data, image_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [title, latitude, longitude, description || null, imageData, req.file.mimetype]
    );
    
    console.log(`Ort mit ID ${result.rows[0].id} erstellt`);
    
    // Temporäre Datei löschen
    fs.unlinkSync(req.file.path);
    
    // Erfolgsmeldung zurücksenden
    res.status(201).json({
      success: true,
      id: result.rows[0].id,
      message: 'Ort erfolgreich gespeichert'
    });
  } catch (error) {
    console.error('Fehler beim Erstellen des Ortes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Überschreibe den Bild-Abruf-Endpunkt
app.get('/api/locations/:id/image', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`Bild für Ort ${id} angefordert`);
    
    // Cache-Control Header setzen
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Direkter und vereinfachter Abruf der Bilddaten aus der Datenbank
    const result = await pool.query('SELECT image_data, image_type FROM locations WHERE id = $1', [id]);
    
    // Absoluter Pfad zum Uploads-Verzeichnis
    const absoluteUploadsDir = path.resolve(uploadsDir);
    
    if (result.rows.length === 0 || !result.rows[0].image_data) {
      console.log(`Ort ${id} nicht gefunden oder hat keine Bilddaten`);
      return res.sendFile(path.join(absoluteUploadsDir, 'couple.jpg'));
    }
    
    const { image_data, image_type } = result.rows[0];
    
    // Prüfe ob die Bilddaten zu groß sind
    const MAX_SIZE = 3 * 1024 * 1024; // 3 MB Limit für direkte Übertragung
    const imageSize = Buffer.from(image_data, 'base64').length;
    
    if (imageSize > MAX_SIZE) {
      console.log(`Bild ist zu groß (${imageSize} Bytes), sende HTML-Wrapper`);
      
      // HTML mit eingebettetem Data-URI Bild (besser für große Bilder)
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body, html { margin: 0; padding: 0; height: 100vh; width: 100vw; overflow: hidden; }
            img { width: 100%; height: 100%; object-fit: contain; }
          </style>
        </head>
        <body>
          <img src="data:${image_type || 'image/jpeg'};base64,${image_data}" alt="Bild">
        </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    }
    
    // Direkte Ausgabe für kleinere Bilder
    console.log(`Sende Base64-Bild für Ort ${id} mit Typ ${image_type || 'image/jpeg'}`);
    const buffer = Buffer.from(image_data, 'base64');
    res.setHeader('Content-Type', image_type || 'image/jpeg');
    return res.send(buffer);
  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error);
    // Im Fehlerfall senden wir das Standard-Bild
    const absoluteUploadsDir = path.resolve(uploadsDir);
    return res.sendFile(path.join(absoluteUploadsDir, 'couple.jpg'));
  }
});

// Bild eines Ortes als Base64 im JSON-Format abrufen
app.get('/api/locations/:id/image/base64', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`Bild für Ort ${id} als Base64 angefordert`);
    
    // Cache-Control Header setzen
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Direkter und vereinfachter Abruf der Bilddaten aus der Datenbank
    const result = await pool.query('SELECT image_data, image_type FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0 || !result.rows[0].image_data) {
      console.log(`Ort ${id} nicht gefunden oder hat keine Bilddaten`);
      return res.status(404).json({ success: false, message: 'Bild nicht gefunden' });
    }
    
    const { image_data, image_type } = result.rows[0];
    
    // Als JSON mit Base64-String zurückgeben
    return res.json({
      success: true,
      imageData: image_data,
      imageType: image_type || 'image/jpeg'
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error);
    return res.status(500).json({ success: false, message: 'Serverfehler beim Abrufen des Bildes' });
  }
});

EOL

# Uploads kopieren
cp -r uploads/* dist/uploads/ 2>/dev/null || :

# Stelle sicher, dass couple.jpg existiert
if [ ! -f "dist/uploads/couple.jpg" ]; then
  cp client/couple.jpg dist/uploads/ 2>/dev/null || :
fi

# Erstelle package.json
cat > dist/package.json << 'EOF'
{
  "name": "rest-express",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "NODE_ENV=production node index.js"
  },
  "dependencies": {
    "cookie-parser": "^1.4.6",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "pg": "^8.11.3",
    "sharp": "^0.33.0",
    "heic-convert": "^1.2.4"
  }
}
EOF

# Installiere Abhängigkeiten
cd dist && npm install

echo "=== Build erfolgreich abgeschlossen ==="