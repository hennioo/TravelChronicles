import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { validateAccessCodeSchema, insertLocationSchema } from "@shared/schema";
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Setup für Datei-Uploads
const uploadDir = path.join(process.cwd(), 'uploads');

// Stelle sicher, dass der Upload-Ordner existiert
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Konfiguration für multer (für Bild-Uploads)
const storage_config = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    
    // Normalisiere die Dateiendung zu .jpg für alle Bildformate für bessere Kompatibilität
    // Apple-Geräte verwenden manchmal .heic, was Probleme verursachen kann
    let ext = path.extname(file.originalname).toLowerCase();
    
    // Stelle sicher, dass wir eine standardisierte Erweiterung verwenden
    if (!['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
      ext = '.jpg'; // Standardmäßig .jpg für unbekannte Formate
    }
    
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage_config,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB Limit (erhöht, um iOS-Bildern genug Platz zu geben)
  },
  fileFilter: (_req, file, cb) => {
    // Akzeptiere alle Bildtypen und konvertiere sie später zu jpg
    // iOS kann .heic oder andere weniger verbreitete Formate verwenden
    if (file.mimetype.startsWith('image/') || 
        file.originalname.match(/\.(heic|heif)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Nur Bilddateien sind erlaubt!') as any);
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Statischer Dateizugriff für Uploads
  // Wichtig: Cache-Control auf no-cache setzen, damit Bilder nicht im Browser-Cache verschwinden
  app.use('/uploads', express.static(uploadDir, {
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store');
    }
  }));

  // Health Check Endpoint für Replit Deployments
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // Health Check API-Endpunkt an /api
  app.get("/api", (req, res) => {
    res.status(200).json({ status: "ok", message: "Susibert travel map API is running" });
  });

  // API Routes
  
  // Validate access code
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

  // Get all locations
  app.get("/api/locations", async (req, res) => {
    try {
      const locations = await storage.getLocations();
      return res.status(200).json(locations);
    } catch (error) {
      console.error("Error getting locations:", error);
      return res.status(500).json({ 
        message: "Internal server error" 
      });
    }
  });

  // Get location by ID
  app.get("/api/locations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ 
          message: "Invalid location ID" 
        });
      }
      
      const location = await storage.getLocation(id);
      
      if (!location) {
        return res.status(404).json({ 
          message: "Location not found" 
        });
      }
      
      return res.status(200).json(location);
    } catch (error) {
      console.error("Error getting location:", error);
      return res.status(500).json({ 
        message: "Internal server error" 
      });
    }
  });
  
  // Delete location by ID
  app.delete("/api/locations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ 
          message: "Invalid location ID" 
        });
      }
      
      // Überprüfen, ob der Ort existiert
      const location = await storage.getLocation(id);
      
      if (!location) {
        return res.status(404).json({ 
          message: "Location not found" 
        });
      }
      
      // Wenn die Location ein eigenes Bild hat (kein externes URL), lösche die Datei
      if (location.image && location.image.startsWith('/uploads/')) {
        try {
          const filePath = path.join(process.cwd(), location.image.substring(1));
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (fileError) {
          console.error("Error deleting image file:", fileError);
          // Wir löschen den Ort trotzdem, auch wenn das Löschen des Bildes fehlschlägt
        }
      }
      
      // Ort löschen
      const success = await storage.deleteLocation(id);
      
      if (success) {
        return res.status(200).json({ 
          success: true, 
          message: "Location deleted successfully" 
        });
      } else {
        return res.status(500).json({ 
          success: false, 
          message: "Failed to delete location" 
        });
      }
    } catch (error) {
      console.error("Error deleting location:", error);
      return res.status(500).json({ 
        message: "Internal server error" 
      });
    }
  });
  
  // Neuen Ort hinzufügen (mit Bild-Upload) - Robustere Implementierung
  app.post("/api/locations", upload.single('image'), async (req: Request, res: Response) => {
    try {
      // Stelle sicher, dass der Upload-Ordner existiert
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Bild-URL festlegen
      let imageUrl = '';
      
      // Wenn ein Bild hochgeladen wurde
      if (req.file) {
        // Pfad des hochgeladenen Bildes
        const filePath = path.join(uploadDir, req.file.filename);
        
        // Überprüfe, ob die Datei existiert
        if (fs.existsSync(filePath)) {
          imageUrl = `/uploads/${req.file.filename}`;
          
          // Zusätzliche Validierung des Bildes
          try {
            // Dateigröße überprüfen (für Konsistenzprüfung)
            const stats = fs.statSync(filePath);
            if (stats.size === 0) {
              // Leere Datei
              fs.unlinkSync(filePath); // Lösche die leere Datei
              imageUrl = ''; // Setze URL zurück
            }
          } catch (fileError) {
            console.error("Fehler bei der Bildvalidierung:", fileError);
            imageUrl = ''; // Bei Fehler URL zurücksetzen
          }
        } else {
          console.warn("Hochgeladene Datei existiert nicht im Dateisystem:", req.file.filename);
          imageUrl = '';
        }
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
        // Bild-URL (leer, wenn kein Bild oder Fehler)
        image: imageUrl
      };

      // Validiere die Daten mit zod
      const validationResult = insertLocationSchema.safeParse(locationData);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Ungültige Daten", 
          errors: validationResult.error.errors
        });
      }

      // Speichere den neuen Ort in der Datenbank
      const newLocation = await storage.createLocation(validationResult.data);
      
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
