/**
 * VivaSpot → GoHighLevel Integration App
 * 
 * Main entry point for the Express application.
 * Handles OAuth, MAC address mapping, and contact sync via webhook.
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Routes
import oauthRoutes from './routes/oauth.js';
import setupRoutes from './routes/setup.js';
import apiRoutes from './routes/api.js';
import webhookRoutes from './routes/webhook.js';

// Database
import { initializeDatabase } from './db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Routes
app.use('/oauth', oauthRoutes);
app.use('/setup', setupRoutes);
app.use('/api', apiRoutes);
app.use('/webhook', webhookRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'VivaSpot → GoHighLevel Integration',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      oauth: '/oauth/authorize',
      setup: '/setup',
      webhook: '/webhook/contact'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
async function start() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('Database initialized');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
