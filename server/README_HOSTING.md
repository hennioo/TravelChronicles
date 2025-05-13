# Anleitung für externes Hosting

## Bild-Upload und Speicherung

Wenn das Projekt außerhalb von Replit gehostet wird, gibt es zwei Möglichkeiten für die Handhabung von Bild-Uploads:

### Option 1: Beibehaltung des aktuellen Systems (einfacher)

- Stelle sicher, dass der `/uploads`-Ordner auf deinem neuen Hosting existiert und Schreibrechte hat
- Wenn du Frontend und Backend trennst, müssen Bildpfade angepasst werden:
  - Ändere Bildpfade von `/uploads/image.jpg` zu `https://deine-backend-url.com/uploads/image.jpg`
  - Aktualisiere die Bildpfade in bereits gespeicherten Daten in der Datenbank

### Option 2: Verwendung eines Cloud-Speicherdienstes (empfohlen)

Für eine robustere Lösung kannst du Bilder in einem Cloud-Speicher wie AWS S3, Cloudinary oder Firebase Storage speichern:

#### Beispiel für Cloudinary-Integration:

1. Erstelle ein Konto bei Cloudinary
2. Installiere das cloudinary-Paket:
   ```
   npm install cloudinary
   ```

3. Konfiguriere Cloudinary in deinem Backend:
   ```javascript
   import { v2 as cloudinary } from 'cloudinary';
   
   cloudinary.config({
     cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
     api_key: process.env.CLOUDINARY_API_KEY,
     api_secret: process.env.CLOUDINARY_API_SECRET
   });
   ```

4. Ändere den Upload-Handler in routes.ts, um Bilder zu Cloudinary hochzuladen:
   ```javascript
   app.post("/api/locations", upload.single('image'), async (req, res) => {
     try {
       // Cloudinary-Upload statt lokaler Speicherung
       const result = await cloudinary.uploader.upload(req.file.path);
       
       // Verwende die Cloudinary-URL anstelle des lokalen Pfades
       const locationData = {
         ...req.body,
         image: result.secure_url
       };
       
       const location = await storage.createLocation(locationData);
       res.status(201).json(location);
     } catch (error) {
       console.error("Error creating location:", error);
       res.status(500).json({ message: "Failed to create location" });
     }
   });
   ```

## Datenbank-Konfiguration

Die Anwendung verwendet bereits Supabase als externe Datenbank, daher sind keine Änderungen an der Datenbankverbindung erforderlich.

## Umgebungsvariablen

Stelle sicher, dass folgende Umgebungsvariablen auf deinem neuen Hosting konfiguriert sind:

```
DATABASE_URL=deine-supabase-postgres-verbindungszeichenfolge
ACCESS_CODE=dein-zugangscode
NODE_ENV=production
PORT=8080 (oder der von deinem Hosting-Anbieter vorgegebene Port)
```

Bei Verwendung von Cloudinary oder anderen Cloud-Diensten:
```
CLOUDINARY_CLOUD_NAME=dein-cloud-name
CLOUDINARY_API_KEY=dein-api-key
CLOUDINARY_API_SECRET=dein-api-secret
```

## Frontend-Konfiguration

1. Erstelle eine `.env`-Datei im `/client`-Verzeichnis:
   ```
   VITE_API_URL=https://deine-backend-api-url.com
   ```

2. Baue das Frontend für die Produktion:
   ```
   cd client
   npm run build
   ```

3. Lade die erstellten Dateien (im `/client/dist`-Ordner) zu deinem Hosting-Anbieter hoch (Netlify, Vercel, etc.)

## Wichtig: Cross-Origin Resource Sharing (CORS)

Bei der Trennung von Frontend und Backend sind CORS-Konfigurationen entscheidend. Das Backend ist bereits mit CORS eingerichtet, aber du solltest die erlaubten Ursprünge aktualisieren:

```javascript
// In server/index.ts
app.use(cors({
  origin: ['https://deine-frontend-domain.com'],
  methods: ['GET', 'POST', 'DELETE'],
  credentials: true
}));
```