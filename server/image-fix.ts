import express from 'express';
import { pool } from './db';
import sharp from 'sharp';

const router = express.Router();

// Endpoint zum Abrufen eines komprimierten Bildes für einen Ort
router.get('/locations/:id/image/optimized', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Ungültige Ort-ID' 
      });
    }
    
    // Bild aus der Datenbank holen
    const result = await pool.query(`
      SELECT image, image_type
      FROM locations
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0 || !result.rows[0].image) {
      return res.status(404).json({ 
        success: false, 
        error: 'Bild nicht gefunden' 
      });
    }
    
    // Base64-Daten extrahieren
    const imageBase64 = result.rows[0].image;
    const imageType = result.rows[0].image_type || 'image/jpeg';
    
    // Base64 zu Buffer konvertieren
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    
    try {
      // Bild komprimieren und verkleinern für einfache Anzeige im Browser
      const compressedImage = await sharp(imageBuffer)
        .resize({
          width: 800,
          height: 800,
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 80 })
        .toBuffer();
      
      // Als Base64 zurückgeben
      const compressedBase64 = compressedImage.toString('base64');
      
      return res.json({
        success: true,
        imageData: compressedBase64,
        imageType: 'image/jpeg',
        originalSize: imageBuffer.length,
        compressedSize: compressedImage.length
      });
    } catch (error) {
      console.error('Fehler bei der Bildkomprimierung:', error);
      
      // Wenn die Komprimierung fehlschlägt, das Originalbild zurückgeben
      return res.json({
        success: true,
        imageData: imageBase64,
        imageType: imageType,
        message: 'Originalbild (Komprimierung fehlgeschlagen)'
      });
    }
  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Serverfehler' 
    });
  }
});

// Endpoint für ein sehr kleines Testbild
router.get('/test-image', async (req, res) => {
  try {
    // Erzeuge ein einfaches, kleines Testbild (orange Box)
    const testImage = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 242, g: 150, b: 12, alpha: 1 }
      }
    })
    .jpeg({ quality: 90 })
    .toBuffer();
    
    // Als Base64 zurückgeben
    const testImageBase64 = testImage.toString('base64');
    
    res.json({
      success: true,
      imageData: testImageBase64,
      imageType: 'image/jpeg',
      size: testImage.length
    });
  } catch (error) {
    console.error('Fehler beim Erstellen des Testbildes:', error);
    res.status(500).json({
      success: false,
      error: 'Serverfehler'
    });
  }
});

export default router;