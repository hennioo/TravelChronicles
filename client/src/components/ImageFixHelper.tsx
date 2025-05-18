import { useState, useEffect } from "react";

// Helper-Komponente zum Optimieren der Bildanzeige
export function useOptimizedImage(locationId: number | null | undefined) {
  const [imageData, setImageData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Nichts tun, wenn keine ID vorhanden
    if (locationId === null || locationId === undefined) {
      setImageData(null);
      return;
    }

    // Rücksetzen der Zustände
    setIsLoading(true);
    setError(null);

    // Verwende die Test-Image-Route für einfache Bildanzeige
    fetch(`/api/test-image?${new Date().getTime()}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Fehler beim Laden des Bildes: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success && data.imageData) {
          const fullImageData = `data:${data.imageType || 'image/jpeg'};base64,${data.imageData}`;
          setImageData(fullImageData);
        } else {
          setError("Keine Bilddaten in der Antwort");
        }
      })
      .catch(err => {
        console.error("Bildfehler:", err);
        setError(err.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [locationId]);

  return { imageData, isLoading, error };
}

// Komponente zum Anzeigen eines optimierten Bildes
export function OptimizedImage({ locationId }: { locationId: number | null | undefined }) {
  const { imageData, isLoading, error } = useOptimizedImage(locationId);

  if (isLoading) {
    return <div className="w-full h-48 bg-muted flex items-center justify-center">Bild wird geladen...</div>;
  }

  if (error) {
    return (
      <div className="w-full h-48 bg-muted flex items-center justify-center flex-col">
        <p className="text-destructive">Fehler beim Laden des Bildes</p>
        <p className="text-xs text-muted-foreground mt-2">{error}</p>
      </div>
    );
  }

  if (!imageData) {
    return <div className="w-full h-48 bg-muted flex items-center justify-center">Kein Bild verfügbar</div>;
  }

  return (
    <div 
      className="w-full h-48 bg-cover bg-center"
      style={{ backgroundImage: `url(${imageData})` }}
      aria-label={`Bild für Ort #${locationId}`}
    />
  );
}

// Exportiere eine vereinfachte Version für direktes Einbinden in die Detail-Ansicht
export default function ImageFix({ locationId }: { locationId: number }) {
  return <OptimizedImage locationId={locationId} />;
}