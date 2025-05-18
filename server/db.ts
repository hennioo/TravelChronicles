import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set!");
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: true,
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err.message);
});

// Test connection
pool.query('SELECT NOW()')
  .then(res => console.log('✅ Database connection successful:', res.rows[0]))
  .catch(err => {
    console.error('❌ Database connection error:', err.message);
    if (err.code) console.error('Error code:', err.code);
  });

// Check if tables exist
pool.query('SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = \'public\' AND table_name = \'locations\')')
  .then(res => console.log('locations table exists:', res.rows[0].exists))
  .catch(err => console.error('Error checking tables:', err.message));

// Initialize Drizzle ORM
export const db = drizzle(pool, { schema });