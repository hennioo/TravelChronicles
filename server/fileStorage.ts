import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import multer from 'multer';

// Bestimme den Speicherort für Uploads basierend auf der Umgebung
export const getUploadDir = () => {
  // In Render verwenden wir temporären Speicher im tmp-Verzeichnis
  if (process.env.RENDER) {
    const tempDir = path.join('/tmp/uploads');
    return tempDir;
  }
  
  // Standard Upload-Verzeichnis für lokale Entwicklung oder andere Hosts
  return path.join(process.cwd(), 'uploads');
};

// Stelle sicher, dass das Upload-Verzeichnis existiert
const uploadDir = getUploadDir();
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Konfiguriere den Speicher für Multer
const storage = multer.diskStorage({
  destination: (_req: Request, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req: Request, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `image-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// Exportiere den konfigurierten Multer-Upload
export const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB Limit
  }
});

// Hilfs-Funktion zum Generieren der korrekten URL für ein Bild
export const getImageUrl = (imagePath: string): string => {
  // Wenn es eine externe URL ist, verwende sie direkt
  if (imagePath.startsWith('http')) {
    return imagePath;
  }
  
  // Für Render-Umgebung: Füge Cache-Busting-Parameter hinzu, da Bilder bei Neustarts
  // verschwinden werden (temporärer Speicher)
  const filename = path.basename(imagePath);
  const timestamp = new Date().getTime();
  return `/uploads/${filename}?t=${timestamp}`;
};