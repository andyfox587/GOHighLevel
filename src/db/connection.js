/**
 * Database Connection Module
 * 
 * Handles PostgreSQL connection pool and initialization.
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

/**
 * Execute a query
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('Query executed:', { text: text.substring(0, 50), duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  }
}

/**
 * Get a client from the pool (for transactions)
 */
export async function getClient() {
  return await pool.connect();
}

/**
 * Initialize database schema
 */
export async function initializeDatabase() {
  const migrationPath = path.join(__dirname, 'migrations', '001_initial.sql');
  
  try {
    const migration = fs.readFileSync(migrationPath, 'utf8');
    await pool.query(migration);
    console.log('Database migration completed');
  } catch (error) {
    // If tables already exist, that's fine
    if (error.code === '42P07') {
      console.log('Database tables already exist');
    } else {
      throw error;
    }
  }
}

export default { query, getClient, initializeDatabase };
