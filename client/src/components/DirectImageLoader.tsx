import { useState, useEffect } from "react";

interface DirectImageLoaderProps {
  locationId: number;
  locationName: string;
  className?: string;
}

export default function DirectImageLoader({ locationId, locationName, className = "" }: DirectImageLoaderProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Nichts hier, wir laden das Bild direkt über das src-Attribut
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [locationId]);

  // URL für den Bildendpunkt mit Timestamp für Cache-Busting
  const getSessionId = () => {
    // Session aus URL extrahieren
    const url = window.location.href;
    const matches = url.match(/sessionId[-=]([^\/&?#]+)/i);
    return matches && matches[1] ? matches[1] : "";
  };

  const imageUrl = `/api/locations/${locationId}/direct-image?sessionId=${getSessionId()}&t=${Date.now()}`;

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
        <div className="animate-pulse">Lade Bild...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-red-50 ${className}`}>
        <div className="text-red-500 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className={className}>
      <img 
        src={imageUrl}
        alt={`Bild von ${locationName}`}
        className="w-full h-full object-cover"
        onError={() => setError("Bild konnte nicht geladen werden")}
      />
    </div>
  );
}