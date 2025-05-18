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
    
    // Das tatsächliche Bild direkt als Bild-URL laden
    const imgUrl = `/api/locations/${locationId}/image?sessionId=${sessionId}&nocache=${Date.now()}`;
    console.log(`Lade Bild direkt von URL: ${imgUrl}`);
    
    // Testen mit einem Bild-Element
    const testImg = new Image();
    testImg.onload = () => {
      console.log(`Bild für ID ${locationId} erfolgreich geladen`);
      setImageData(imgUrl);
      setIsLoading(false);
    };
    
    testImg.onerror = (e) => {
      console.error(`Fehler beim Laden des Bildes für ID ${locationId}:`, e);
      setError("Bild konnte nicht geladen werden");
      setIsLoading(false);
      
      // Direkter Test mit alternativer Methode
      console.log("Versuche alternativ direkte Einbindung...");
      
      // Fallback: Hole das Bild direkt vom Server und verarbeite manuell
      console.log("Versuche Fallback-Methode mit direktem Bild-Tag...");
      
      // Alternative Bild-URL generieren mit fest eingebauter Session-ID
      const alternativeUrl = `/api/locations/${locationId}/image?sessionId=b4d1af6eb79ad71edc843b34aeeba3d6&nocache=${Date.now()}`;
      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        console.log("Fallback-Bild erfolgreich geladen!");
        setImageData(alternativeUrl);
        setIsLoading(false);
      };
      
      fallbackImg.onerror = () => {
        console.error("Auch Fallback-Methode fehlgeschlagen");
        setError("Bild konnte mit keiner Methode geladen werden");
        setIsLoading(false);
      };
      
      fallbackImg.src = alternativeUrl;
    };
    
    testImg.src = imgUrl;
      
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