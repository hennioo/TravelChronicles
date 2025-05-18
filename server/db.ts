
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

const DATABASE_URL = process.env.DATABASE_URL?.trim();

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set!");
}

console.log('Attempting to connect to database:', 
  DATABASE_URL.replace(/:[^:]*@/, ':***@')
);

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
    sslmode: 'require'
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err.message);
});

export const db = drizzle(pool, { schema });

const initDb = async () => {
  try {
    await pool.query(`
      DROP TABLE IF EXISTS locations;
      CREATE TABLE locations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        highlight TEXT NOT NULL,
        latitude TEXT NOT NULL,
        longitude TEXT NOT NULL,
        image TEXT NOT NULL,
        image_type TEXT,
        image_data TEXT,
        thumbnail_data TEXT
      );
      
      CREATE TABLE IF NOT EXISTS access_codes (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        active BOOLEAN NOT NULL DEFAULT true
      );
    `);
    console.log('✅ Database tables initialized');
  } catch (err) {
    console.error('❌ Error initializing database tables:', err);
  }
};

initDb();
