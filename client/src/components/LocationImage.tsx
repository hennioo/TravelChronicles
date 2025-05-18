import { useState, useEffect } from "react";

interface LocationImageProps {
  locationId: number;
  locationName: string;
}

// Aktuelle Session-ID aus der URL extrahieren
function getSessionId(): string {
  const url = window.location.href;
  const matches = url.match(/sessionId[-=]([^\/&?#]+)/i);
  return matches && matches[1] ? matches[1] : "b52f1161d574b33cc7d8d68bbc7cdece";
}

export default function LocationImage({ locationId, locationName }: LocationImageProps) {
  const [imageData, setImageData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Die aktuelle Session-ID aus der URL holen
    const sessionId = getSessionId();
    console.log(`LocationImage lädt Bild für ID: ${locationId} mit Session: ${sessionId}`);
    
    // Bild wird jetzt direkt (nicht als JSON) geladen und als <img> Element angezeigt
    const imageUrl = `/api/locations/${locationId}/image?sessionId=${sessionId}&nocache=${Date.now()}`;
    
    // Einfach das Image-Element erstellen und den Pfad direkt setzen
    const img = new Image();
    
    img.onload = () => {
      console.log(`Bild für ID ${locationId} erfolgreich geladen`);
      setImageData(imageUrl);
      setIsLoading(false);
    };
    
    img.onerror = (err) => {
      console.error(`Fehler beim Laden des Bildes (${locationId}):`, err);
      setError(`Bild konnte nicht geladen werden`);
      setIsLoading(false);
    };
    
    // Starte den Ladevorgang
    img.src = imageUrl;
    
    return () => {
      // Laden abbrechen wenn Komponente unmounted
      img.src = "";
    };
  }, [locationId]); // Nur bei Änderung der ID neu laden

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span className="text-white">Bild wird geladen...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span className="text-white">Fehler: {error}</span>
      </div>
    );
  }

  if (!imageData) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span className="text-white text-xl font-bold">Kein Bild verfügbar</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <img 
        src={imageData}
        alt={`Bild von ${locationName}`}
        className="w-full h-full object-cover rounded-md"
      />
    </div>
  );
}