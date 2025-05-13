import { 
  locations, type Location, type InsertLocation,
  accessCodes, type AccessCode, type InsertAccessCode
} from "@shared/schema";
import { db, pool } from './db';
import { desc, eq } from 'drizzle-orm';

// Define User interface since we've removed it from schema but still need it for compatibility
interface User {
  id: number;
  username: string;
  password: string;
}

interface InsertUser {
  username: string;
  password: string;
}

// Interface for storage operations
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Location methods
  getLocations(): Promise<Location[]>;
  getLocation(id: number): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
  deleteLocation(id: number): Promise<boolean>;
  
  // Access code methods
  getAccessCodes(): Promise<AccessCode[]>;
  validateAccessCode(code: string): Promise<boolean>;
  createAccessCode(accessCode: InsertAccessCode): Promise<AccessCode>;
}

// In-memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private locations: Map<number, Location>;
  private accessCodes: Map<number, AccessCode>;
  private userCurrentId: number;
  private locationCurrentId: number;
  private accessCodeCurrentId: number;

  constructor() {
    this.users = new Map();
    this.locations = new Map();
    this.accessCodes = new Map();
    this.userCurrentId = 1;
    this.locationCurrentId = 1;
    this.accessCodeCurrentId = 1;

    // Add access code from environment variable
    const accessCode = process.env.ACCESS_CODE || "invalid"; // Fallback for development only
    this.createAccessCode({ code: accessCode, active: true });

    // Add sample locations
    this.createLocation({
      name: "Paris, France",
      date: "October 2022",
      description: "We spent an amazing week exploring the city of love. We visited the Eiffel Tower, strolled along the Seine, and enjoyed delicious pastries at local cafés.",
      highlight: "First trip together abroad",
      latitude: "48.8566",
      longitude: "2.3522",
      countryCode: "FR",
      image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
    });

    this.createLocation({
      name: "Rome, Italy",
      date: "December 2022",
      description: "We explored ancient ruins, tossed coins in the Trevi Fountain, and enjoyed authentic Italian pasta and gelato.",
      highlight: "Christmas in Rome",
      latitude: "41.9028",
      longitude: "12.4964",
      countryCode: "IT",
      image: "https://images.unsplash.com/photo-1555992336-fb0d29498b13?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
    });

    this.createLocation({
      name: "Barcelona, Spain",
      date: "March 2023",
      description: "Gaudi's architecture, tapas, and the beautiful beaches made this trip unforgettable.",
      highlight: "Watching the sunset at Park Güell",
      latitude: "41.3851",
      longitude: "2.1734",
      countryCode: "ES",
      image: "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
    });

    this.createLocation({
      name: "Amsterdam, Netherlands",
      date: "June 2023",
      description: "We cycled through the city, visited museums, and took a boat tour through the canals.",
      highlight: "Cycling adventure through Vondelpark",
      latitude: "52.3676",
      longitude: "4.9041",
      countryCode: "NL",
      image: "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Location methods
  async getLocations(): Promise<Location[]> {
    return Array.from(this.locations.values());
  }

  async getLocation(id: number): Promise<Location | undefined> {
    return this.locations.get(id);
  }

  async createLocation(insertLocation: InsertLocation): Promise<Location> {
    const id = this.locationCurrentId++;
    const location: Location = { ...insertLocation, id };
    this.locations.set(id, location);
    return location;
  }
  
  async deleteLocation(id: number): Promise<boolean> {
    // Überprüfen, ob der Ort existiert
    if (!this.locations.has(id)) {
      return false;
    }
    
    // Ort löschen
    return this.locations.delete(id);
  }

  // Access code methods
  async getAccessCodes(): Promise<AccessCode[]> {
    return Array.from(this.accessCodes.values());
  }

  async validateAccessCode(code: string): Promise<boolean> {
    const accessCodes = await this.getAccessCodes();
    return accessCodes.some(ac => ac.code === code && ac.active);
  }

  async createAccessCode(insertAccessCode: InsertAccessCode): Promise<AccessCode> {
    const id = this.accessCodeCurrentId++;
    // Stelle sicher, dass 'active' immer einen boolean-Wert hat
    const accessCode: AccessCode = { 
      ...insertAccessCode, 
      id,
      active: insertAccessCode.active === undefined ? true : insertAccessCode.active
    };
    this.accessCodes.set(id, accessCode);
    return accessCode;
  }
}

// Datenbankbasierte Speicherimplementierung
export class DatabaseStorage implements IStorage {
  // User methods - Stub implementations since users are not needed
  async getUser(id: number): Promise<User | undefined> {
    return undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    throw new Error("User creation not implemented - not needed for this application");
  }

  async getLocations(): Promise<Location[]> {
    // Direkter Datenbankzugriff statt Drizzle ORM
    try {
      const result = await pool.query('SELECT * FROM locations ORDER BY id DESC');
      console.log("Direct database query successful, found", result.rows.length, "locations");
      
      // Konvertiere die Datenbankergebnisse in das richtige Format
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        date: row.date,
        description: row.description,
        highlight: row.highlight,
        latitude: row.latitude,
        longitude: row.longitude,
        countryCode: row.country_code, // Konvertiere country_code zu countryCode
        image: row.image
      }));
    } catch (error) {
      console.error("Database query error in getLocations:", error);
      throw error;
    }
  }

  async getLocation(id: number): Promise<Location | undefined> {
    try {
      // Direkter Datenbankzugriff statt Drizzle ORM
      const result = await pool.query('SELECT * FROM locations WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return undefined;
      }
      
      const row = result.rows[0];
      // Konvertiere die Datenbankergebnisse in das richtige Format
      return {
        id: row.id,
        name: row.name,
        date: row.date,
        description: row.description,
        highlight: row.highlight,
        latitude: row.latitude,
        longitude: row.longitude,
        countryCode: row.country_code, // Konvertiere country_code zu countryCode
        image: row.image
      };
    } catch (error) {
      console.error("Database query error in getLocation:", error);
      throw error;
    }
  }

  async createLocation(insertLocation: InsertLocation): Promise<Location> {
    try {
      // Direkter Datenbankzugriff für das Einfügen von Daten
      const result = await pool.query(
        `INSERT INTO locations 
        (name, date, description, highlight, latitude, longitude, country_code, image) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
        RETURNING *`,
        [
          insertLocation.name,
          insertLocation.date,
          insertLocation.description,
          insertLocation.highlight,
          insertLocation.latitude,
          insertLocation.longitude,
          insertLocation.countryCode, // Wird als country_code in der Datenbank gespeichert
          insertLocation.image
        ]
      );
      
      const row = result.rows[0];
      
      // Konvertiere die Datenbankergebnisse in das richtige Format
      return {
        id: row.id,
        name: row.name,
        date: row.date,
        description: row.description,
        highlight: row.highlight,
        latitude: row.latitude,
        longitude: row.longitude,
        countryCode: row.country_code, // Konvertiere country_code zu countryCode
        image: row.image
      };
    } catch (error) {
      console.error("Database query error in createLocation:", error);
      throw error;
    }
  }

  async deleteLocation(id: number): Promise<boolean> {
    try {
      // Direkter Datenbankzugriff für das Löschen von Daten
      const result = await pool.query(
        'DELETE FROM locations WHERE id = $1 RETURNING id',
        [id]
      );
      
      return result.rows.length > 0;
    } catch (error) {
      console.error("Database query error in deleteLocation:", error);
      throw error;
    }
  }

  async getAccessCodes(): Promise<AccessCode[]> {
    try {
      const result = await pool.query('SELECT * FROM access_codes');
      
      return result.rows.map(row => ({
        id: row.id,
        code: row.code,
        active: row.active
      }));
    } catch (error) {
      console.error("Database query error in getAccessCodes:", error);
      throw error;
    }
  }

  async validateAccessCode(code: string): Promise<boolean> {
    try {
      // Direkter Datenbankzugriff für die Validierung des Zugangscodes
      const result = await pool.query(
        'SELECT * FROM access_codes WHERE code = $1',
        [code]
      );
      
      return result.rows.length > 0;
    } catch (error) {
      console.error("Database query error in validateAccessCode:", error);
      throw error;
    }
  }

  async createAccessCode(insertAccessCode: InsertAccessCode): Promise<AccessCode> {
    try {
      // Direkter Datenbankzugriff für das Einfügen von Zugangscodes
      const result = await pool.query(
        'INSERT INTO access_codes (code, active) VALUES ($1, $2) RETURNING *',
        [insertAccessCode.code, insertAccessCode.active]
      );
      
      const row = result.rows[0];
      
      return {
        id: row.id,
        code: row.code,
        active: row.active
      };
    } catch (error) {
      console.error("Database query error in createAccessCode:", error);
      throw error;
    }
  }
}

// Supabase Datenbankverbindung für die Produktion verwenden
export const storage = new DatabaseStorage();
