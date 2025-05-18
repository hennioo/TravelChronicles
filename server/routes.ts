import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { pool } from "./db";
import { validateAccessCodeSchema, insertLocationSchema } from "@shared/schema";
import multer from 'multer';
import imageFixRouter from './image-fix';

// Für Bild-Uploads nutzen wir In-Memory-Storage statt Dateisystem
// Dies erlaubt uns, die Bilder direkt als Base64 in der Datenbank zu speichern
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB Limit, da wir die Bilder ohnehin komprimieren werden
  },
  fileFilter: (_req, file, cb) => {
    // Akzeptiere alle Bildtypen (werden beim Upload komprimiert)
    if (file.mimetype.startsWith('image/') || 
        file.originalname.match(/\.(heic|heif)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Nur Bilddateien sind erlaubt!') as any);
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Bild-Optimierungsrouten hinzufügen
  app.use('/api', imageFixRouter);
  
  // Health Check Endpoint für Replit Deployments
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // Health Check API-Endpunkt an /api
  app.get("/api", (req, res) => {
    res.status(200).json({ status: "ok", message: "Susibert travel map API is running" });
  });

  // API Routen
  
  // Zugriffscode validieren
  app.post("/api/access-codes/validate", async (req, res) => {
    try {
      const result = validateAccessCodeSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: result.error.errors 
        });
      }
      
      const isValid = await storage.validateAccessCode(result.data.code);
      
      if (isValid) {
        return res.status(200).json({ 
          valid: true, 
          message: "Access granted" 
        });
      } else {
        return res.status(401).json({ 
          valid: false, 
          message: "Invalid access code" 
        });
      }
    } catch (error) {
      console.error("Error validating access code:", error);
      return res.status(500).json({ 
        message: "Internal server error" 
      });
    }
  });

  // Alle Orte abrufen
  app.get("/api/locations", async (req, res) => {
    try {
      // Direkter Zugriff auf die Datenbank ohne Drizzle-ORM
      const result = await pool.query(`
        SELECT 
          id, name, description, date, highlight, latitude, longitude, countryCode,
          CASE WHEN image IS NOT NULL THEN true ELSE false END as has_image
        FROM locations 
        ORDER BY id DESC
      `);
      console.log("Locations abgerufen:", result.rows.length);
      return res.status(200).json(result.rows);
    } catch (error) {
      console.error("Error getting locations:", error);
      return res.status(500).json({ 
        message: "Internal server error" 
      });
    }
  });

  // Einen bestimmten Ort abrufen (ohne Bilddaten für bessere Performance)
  app.get("/api/locations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ 
          message: "Invalid location ID" 
        });
      }
      
      // Direkter Datenbankzugriff für bessere Kontrolle
      const result = await pool.query(`
        SELECT id, name, description, date, highlight, latitude, longitude, countryCode,
        CASE WHEN image IS NOT NULL THEN true ELSE false END as has_image
        FROM locations
        WHERE id = $1
      `, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          message: "Location not found" 
        });
      }
      
      return res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error("Error getting location:", error);
      return res.status(500).json({ 
        message: "Internal server error" 
      });
    }
  });
  
  // Funktion zur Überprüfung der Authentifizierung
  function requireAuth(req: Request, res: Response, next: Function) {
    // Session-ID aus der URL oder dem Request-Body erhalten
    const sessionId = req.query.sessionId || req.body?.sessionId;
    
    console.log('Auth-Check mit SessionID:', sessionId);
    
    // Hier würde normalerweise eine echte Session-Überprüfung stattfinden
    // Da wir keinen direkten Zugriff auf dein Session-Management haben,
    // prüfen wir nur ob die Session-ID existiert
    if (!sessionId) {
      console.log('Keine SessionID gefunden');
      
      // Bei API-Endpunkten 401 zurückgeben
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ 
          error: 'Nicht authentifiziert',
          message: 'Bitte melde dich an, um diese Funktion zu nutzen.' 
        });
      }
      
      // Ansonsten zur Login-Seite umleiten
      return res.redirect('/?error=Bitte+melde+dich+an');
    }
    
    // Session ist gültig
    next();
  }
  
  // Einfache Testbild-Route ohne Authentifizierung (für Diagnose)
  app.get("/test-image-direct", async (req, res) => {
    try {
      // Nehmen wir an, wir wollen ein einfaches Bild aus der Datenbank holen (z.B. ID 26)
      const locationId = 26;
      console.log(`TEST-ROUTE: Lade Bild für Ort ${locationId}`);
      
      const result = await pool.query(`
        SELECT image, image_type
        FROM locations
        WHERE id = $1 AND image IS NOT NULL
      `, [locationId]);
      
      if (result.rows.length === 0 || !result.rows[0].image) {
        return res.status(404).send('Bild nicht gefunden');
      }
      
      const imageBase64 = result.rows[0].image;
      const imageType = result.rows[0].image_type || 'image/jpeg';
      
      // Strikte Header-Kontrolle
      res.removeHeader('X-Powered-By');
      res.removeHeader('ETag');
      
      // Anti-Cache-Header
      res.setHeader('Cache-Control', 'no-store, private, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      
      // Content-Type MUSS korrekt sein
      res.setHeader('Content-Type', imageType);
      
      // Base64 zu Binär konvertieren
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      console.log(`TEST-ROUTE: Sende Bild mit Typ ${imageType} und Größe ${imageBuffer.length} Bytes`);
      
      // Binärdaten zurücksenden
      return res.end(imageBuffer);
    } catch (error) {
      console.error('Test-Image-Fehler:', error);
      res.status(500).send('Fehler beim Test-Bild');
    }
  });

  // Nur das Bild eines Ortes abrufen (überarbeitete Version)
  app.get("/api/locations/:id/image", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ 
          message: "Invalid location ID" 
        });
      }
      
      // Bild aus der Datenbank holen
      const result = await pool.query(`
        SELECT image, image_type
        FROM locations
        WHERE id = $1 AND image IS NOT NULL
      `, [id]);
      
      if (result.rows.length === 0 || !result.rows[0].image) {
        return res.status(404).json({ 
          message: "Image not found" 
        });
      }
      
      // Direktes Senden des Bildes als binäre Daten
      try {
        const imageBase64 = result.rows[0].image;
        const imageType = result.rows[0].image_type || 'image/jpeg';
        
        // Lösche alle vorherigen Header
        res.removeHeader('X-Powered-By');
        res.removeHeader('ETag');
        
        // Den Cache verhindern
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        // Extrem wichtig: Content-Type setzen
        res.setHeader('Content-Type', imageType);
        
        // Base64 in binäre Daten konvertieren
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        
        // Binärdaten direkt senden
        console.log(`Sende Bild für Ort ${id} mit Typ ${imageType} und Größe ${imageBuffer.length} Bytes direkt`);
        
        // Verwende res.end statt res.send für maximale Kontrolle
        return res.end(imageBuffer);
      } catch (imageError) {
        console.error(`Fehler beim Verarbeiten des Bildes für Ort ${id}:`, imageError);
        return res.status(500).json({ 
          message: "Fehler beim Verarbeiten des Bildes" 
        });
      }
    } catch (error) {
      console.error("Error getting image:", error);
      return res.status(500).json({ 
        message: "Internal server error" 
      });
    }
  });
  
  // Ort löschen
  app.delete("/api/locations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ 
          message: "Invalid location ID" 
        });
      }
      
      // Überprüfen, ob der Ort existiert
      const result = await pool.query('SELECT id FROM locations WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          message: "Location not found" 
        });
      }
      
      // Ort löschen
      await pool.query('DELETE FROM locations WHERE id = $1', [id]);
      
      return res.status(200).json({ 
        success: true, 
        message: "Location deleted successfully" 
      });
    } catch (error) {
      console.error("Error deleting location:", error);
      return res.status(500).json({ 
        message: "Internal server error" 
      });
    }
  });
  
  // Neuen Ort hinzufügen (mit Bild-Upload)
  app.post("/api/locations", upload.single('image'), async (req: Request, res: Response) => {
    try {
      let imageBase64 = null;
      let imageType = null;
      
      // Wenn ein Bild hochgeladen wurde, als Base64 konvertieren
      if (req.file) {
        console.log(`Bild hochgeladen: ${req.file.originalname}, ${req.file.size} Bytes, ${req.file.mimetype}`);
        
        try {
          // Konvertiere zu Base64 für die Datenbank
          imageBase64 = req.file.buffer.toString('base64');
          imageType = req.file.mimetype;
          
          console.log(`Bild in Base64 konvertiert: ${imageBase64.length} Zeichen`);
        } catch (imageError) {
          console.error("Fehler bei der Bildverarbeitung:", imageError);
          return res.status(400).json({
            message: "Fehler bei der Bildverarbeitung"
          });
        }
      } else {
        console.warn("Kein Bild hochgeladen");
        return res.status(400).json({
          message: "Ein Bild wird benötigt"
        });
      }
      
      // Extrahiere Daten aus dem Request
      const locationData = {
        name: req.body.name,
        description: req.body.description || '',
        highlight: req.body.highlight || '',
        date: req.body.date,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        countryCode: req.body.countryCode || '',
        image: '' // Wird später durch Base64-Daten ersetzt
      };

      // Validiere die Daten mit zod
      const validationResult = insertLocationSchema.safeParse(locationData);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Ungültige Daten", 
          errors: validationResult.error.errors
        });
      }

      // Speichere den neuen Ort direkt in der Datenbank
      const result = await pool.query(`
        INSERT INTO locations 
        (name, description, highlight, date, latitude, longitude, countryCode, image, image_type) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, name, description, date, highlight, latitude, longitude, countryCode
      `, [
        locationData.name,
        locationData.description,
        locationData.highlight,
        locationData.date,
        locationData.latitude,
        locationData.longitude,
        locationData.countryCode,
        imageBase64,
        imageType
      ]);
      
      const newLocation = result.rows[0];
      newLocation.has_image = true;
      
      return res.status(201).json(newLocation);
    } catch (error) {
      console.error("Error adding new location:", error);
      return res.status(500).json({
        message: "Fehler beim Hinzufügen des neuen Ortes"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
