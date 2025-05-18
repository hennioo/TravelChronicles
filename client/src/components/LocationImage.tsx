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
    
    // Hardcoded Session-ID für Test
    const hardcodedSessionId = "b4d1af6eb79ad71edc843b34aeeba3d6";
    
    // SessionID aus der URL extrahieren
    const pathname = window.location.pathname;
    const search = window.location.search;
    const fullUrl = window.location.href;
    
    // Versuche verschiedene Methoden, um die sessionId zu finden
    let sessionId = '';
    
    // Methode 1: Aus dem Pathname (für URL-Format /map/sessionId-xyz/)
    if (pathname.includes('sessionId')) {
      const matches = pathname.match(/sessionId[-=]([^\/&?#]+)/i);
      if (matches && matches[1]) {
        sessionId = matches[1];
        console.log("SessionID aus URL-Pfad gefunden:", sessionId);
      }
    }
    
    // Methode 2: Aus der URL-Suche (für URL-Format ?sessionId=xyz)
    if (!sessionId && search) {
      const params = new URLSearchParams(search);
      const paramSessionId = params.get('sessionId');
      if (paramSessionId) {
        sessionId = paramSessionId;
        console.log("SessionID aus URL-Parametern gefunden:", sessionId);
      }
    }
    
    // Methode 3: Direkt aus der vollständigen URL
    if (!sessionId && fullUrl.includes('sessionId')) {
      const urlMatches = fullUrl.match(/sessionId[-=]([^\/&?#]+)/i);
      if (urlMatches && urlMatches[1]) {
        sessionId = urlMatches[1];
        console.log("SessionID direkt aus URL gefunden:", sessionId);
      }
    }
    
    // Fallback auf hartcodierte Session-ID, wenn keine gefunden wurde
    if (!sessionId) {
      sessionId = hardcodedSessionId;
      console.log("Keine SessionID gefunden, verwende Fallback:", sessionId);
    }
    
    console.log(`LocationImage verwendet SessionID: ${sessionId}`);
    
    // Das Bild als JSON mit Base64-Daten abrufen
    const imgUrl = `/api/locations/${locationId}/image?sessionId=${sessionId}&nocache=${Date.now()}`;
    console.log(`Lade Bild als JSON: ${imgUrl}`);
    
    // JSON-Anfrage mit Fetch
    fetch(imgUrl)
      .then(response => {
        console.log(`Bild-Antwort Status für ID ${locationId}:`, response.status);
        console.log("Content-Type:", response.headers.get('content-type'));
        
        if (!response.ok) {
          throw new Error(`Fehler beim Laden des Bildes: ${response.status}`);
        }
        
        // Versuche als JSON zu parsen
        if (response.headers.get('content-type')?.includes('application/json')) {
          return response.json();
        } else {
          // Falls keine JSON-Antwort, dann ist es wahrscheinlich HTML (Login-Seite)
          throw new Error('Keine JSON-Antwort vom Server - möglicherweise Session abgelaufen');
        }
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
            // Bild aus Base64-Daten anzeigen
            const fullImageUrl = `data:${data.imageType || 'image/jpeg'};base64,${data.imageData}`;
            setImageData(fullImageUrl);
            console.log(`Bild erfolgreich geladen für ID ${locationId}`);
            setIsLoading(false);
          } catch (parseError) {
            console.error('Fehler beim Verarbeiten der Bilddaten:', parseError);
            setError('Fehler beim Verarbeiten der Bilddaten');
            setIsLoading(false);
          }
        } else {
          setError("Keine Bilddaten in der Antwort");
          setIsLoading(false);
        }
      })
      .catch(err => {
        console.error(`Bildfehler für Ort ${locationId}:`, err);
        
        // Versuche eine Alternative mit hartcodierter Session-ID als letzten Ausweg
        console.log("Versuche Fallback mit hartcodierter Session-ID...");
        
        const fallbackUrl = `/api/locations/${locationId}/image?sessionId=b4d1af6eb79ad71edc843b34aeeba3d6&nocache=${Date.now()}`;
        
        fetch(fallbackUrl)
          .then(response => {
            if (!response.ok) throw new Error(`Fallback fehlgeschlagen: ${response.status}`);
            return response.json();
          })
          .then(data => {
            if (data.success && data.imageData) {
              const fullImageUrl = `data:${data.imageType || 'image/jpeg'};base64,${data.imageData}`;
              setImageData(fullImageUrl);
              console.log("Fallback-Bild erfolgreich geladen!");
              setIsLoading(false);
            } else {
              throw new Error("Keine Bilddaten in der Fallback-Antwort");
            }
          })
          .catch(fallbackErr => {
            console.error("Auch Fallback fehlgeschlagen:", fallbackErr);
            setError(`Fehler: ${err.message}, Fallback: ${fallbackErr.message}`);
            setIsLoading(false);
          });
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
    <div className="w-full h-full relative">
      <img 
        src={imageData}
        alt={`Bild von ${locationName}`}
        className="w-full h-full object-cover rounded-md"
        onError={(e) => {
          console.error("Fehler beim Anzeigen des Bildes im DOM");
          e.currentTarget.style.display = "none";
          setError("Fehler beim Anzeigen des Bildes");
        }}
      />
    </div>
  );
}