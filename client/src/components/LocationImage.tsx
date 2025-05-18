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
    // Debug-Informationen zur Fehlersuche
    console.log(`LocationImage wird geladen für ID: ${locationId}`);
    
    // SessionID aus der URL extrahieren
    const pathname = window.location.pathname;
    const search = window.location.search;
    const fullUrl = window.location.href;
    
    // Versuche verschiedene Methoden, um die sessionId zu finden
    let sessionId = '';
    
    // Methode 1: Aus dem Pathname (für URL-Format /map/sessionId-xyz/)
    const sessionIdFromPath = pathname.match(/sessionId[-=]([^\/&?#]+)/i);
    if (sessionIdFromPath) {
      sessionId = sessionIdFromPath[1];
      console.log("SessionID aus URL-Pfad gefunden:", sessionId);
    }
    
    // Methode 2: Aus der URL-Suche (für URL-Format ?sessionId=xyz)
    if (!sessionId) {
      const searchParams = new URLSearchParams(search);
      const sessionIdFromSearch = searchParams.get('sessionId');
      if (sessionIdFromSearch) {
        sessionId = sessionIdFromSearch;
        console.log("SessionID aus URL-Query gefunden:", sessionId);
      }
    }
    
    // Methode 3: Direkt aus der vollständigen URL
    if (!sessionId) {
      const directMatch = fullUrl.match(/sessionId[-=]([^\/&?#]+)/i);
      if (directMatch) {
        sessionId = directMatch[1];
        console.log("SessionID direkt aus URL gefunden:", sessionId);
      }
    }
    
    console.log(`LocationImage verwendet SessionID: ${sessionId || 'keine'}`);
    
    // Das tatsächliche Bild vom Server laden
    fetch(`/api/locations/${locationId}/image?sessionId=${sessionId}&nocache=${Date.now()}`)
      .then(response => {
        console.log(`Bild-Antwort Status für ID ${locationId}:`, response.status);
        if (!response.ok) {
          throw new Error(`Fehler beim Laden des Bildes: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log(`Bild-Daten für ID ${locationId}:`, {
          success: data.success,
          hasImageData: !!data.imageData,
          imageType: data.imageType,
          imageDataLength: data.imageData?.length || 0
        });
        
        if (data.success && data.imageData) {
          try {
            // Zusätzliche Validierung der Base64-Daten
            if (typeof data.imageData !== 'string' || data.imageData.length < 10) {
              throw new Error('Ungültige Bilddaten erhalten');
            }
            
            const fullImageUrl = `data:${data.imageType || 'image/jpeg'};base64,${data.imageData}`;
            setImageData(fullImageUrl);
            console.log(`Bild erfolgreich geladen für ID ${locationId}`);
          } catch (parseError) {
            console.error('Fehler beim Verarbeiten der Bilddaten:', parseError);
            setError('Fehler beim Verarbeiten der Bilddaten');
          }
        } else {
          setError("Keine Bilddaten in der Antwort");
        }
        setIsLoading(false);
      })
      .catch(err => {
        console.error(`Bildfehler für Ort ${locationId}:`, err);
        setError(err.message);
        setIsLoading(false);
      });
      
    // Fallback: Wenn nach 5 Sekunden noch kein Bild geladen wurde, setze Fehler
    const timeout = setTimeout(() => {
      if (isLoading) {
        console.warn(`Timeout beim Laden des Bildes für ID ${locationId}`);
        setError('Zeitüberschreitung beim Laden des Bildes');
        setIsLoading(false);
      }
    }, 5000);
    
    return () => clearTimeout(timeout);
  }, [locationId, isLoading]);

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