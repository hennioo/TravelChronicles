import { useState, useEffect } from "react";

interface LocationImageProps {
  locationId: number;
  locationName: string;
}

export default function LocationImage({ locationId, locationName }: LocationImageProps) {
  const [imageData, setImageData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Das tatsächliche Bild vom Server laden
    fetch(`/api/locations/${locationId}/image?nocache=${Date.now()}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Fehler beim Laden des Bildes: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success && data.imageData) {
          const fullImageUrl = `data:${data.imageType || 'image/jpeg'};base64,${data.imageData}`;
          setImageData(fullImageUrl);
          setIsLoading(false);
        } else {
          setError("Keine Bilddaten in der Antwort");
          setIsLoading(false);
        }
      })
      .catch(err => {
        console.error(`Bildfehler für Ort ${locationId}:`, err);
        setError(err.message);
        setIsLoading(false);
      });
  }, [locationId]);

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
        <span className="text-white">Bild konnte nicht geladen werden</span>
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
    <div 
      className="w-full h-full bg-cover bg-center" 
      style={{ backgroundImage: `url(${imageData})` }}
      role="img"
      aria-label={`Bild von ${locationName}`}
    />
  );
}