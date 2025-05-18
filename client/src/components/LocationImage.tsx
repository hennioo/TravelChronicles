import { useState, useEffect } from "react";

interface LocationImageProps {
  locationId: number;
  locationName: string;
}

// Globale Session-ID für Diagnose
const HARDCODED_SESSION_ID = "b4d1af6eb79ad71edc843b34aeeba3d6";

export default function LocationImage({ locationId, locationName }: LocationImageProps) {
  const [imageData, setImageData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log(`LocationImage lädt Bild für ID: ${locationId}`);
    
    // Einfache Version mit hartcodierter Session-ID für maximale Zuverlässigkeit
    const imageUrl = `/api/locations/${locationId}/image?sessionId=${HARDCODED_SESSION_ID}&nocache=${Date.now()}`;
    
    fetch(imageUrl)
      .then(response => {
        console.log(`Bild-Status für ID ${locationId}:`, response.status);
        if (!response.ok) {
          throw new Error(`Server-Fehler: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success && data.imageData) {
          // Bild aus Base64-Daten erstellen
          try {
            const imgUrl = `data:${data.imageType || 'image/jpeg'};base64,${data.imageData}`;
            console.log(`Bild für ID ${locationId} erfolgreich geladen`);
            setImageData(imgUrl);
          } catch (err) {
            console.error("Fehler beim Verarbeiten der Bilddaten:", err);
            setError("Fehler beim Verarbeiten der Bilddaten");
          }
        } else {
          console.error("Keine Bilddaten in der Server-Antwort");
          setError("Keine Bilddaten verfügbar");
        }
        setIsLoading(false);
      })
      .catch(err => {
        console.error(`Fehler beim Laden des Bildes (${locationId}):`, err);
        setError(`Fehler: ${err.message}`);
        setIsLoading(false);
      });
      
    return () => {
      // Cleanup bei Unmount
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
    <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${imageData})` }} />
  );
}