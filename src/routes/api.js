/**
 * API Routes
 * 
 * REST API endpoints for managing mappings and checking sync status.
 */

import { Router } from 'express';
import * as db from '../db/queries.js';
import * as ghl from '../services/ghl.js';

const router = Router();

// ============================================================
// Location Mappings
// ============================================================

/**
 * GET /api/mappings/:locationId
 * 
 * Get all MAC address mappings for a GHL location.
 */
router.get('/mappings/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    
    const mappings = await db.getMappingsForLocation(locationId);
    
    res.json({
      location_id: locationId,
      mappings: mappings.map(m => ({
        id: m.id,
        mac: m.vivaspot_mac,
        name: m.vivaspot_location,
        created_at: m.created_at
      }))
    });
    
  } catch (error) {
    console.error('Get mappings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/mappings
 * 
 * Add a new MAC address mapping.
 * 
 * Body: { location_id, mac, name }
 */
router.post('/mappings', async (req, res) => {
  try {
    const { location_id, mac, name } = req.body;
    
    if (!location_id) {
      return res.status(400).json({ error: 'Missing location_id' });
    }
    
    if (!mac) {
      return res.status(400).json({ error: 'Missing mac address' });
    }
    
    // Validate MAC address format
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    if (!macRegex.test(mac)) {
      return res.status(400).json({ 
        error: 'Invalid MAC address format. Use format: AA:BB:CC:DD:EE:FF' 
      });
    }
    
    // Verify the GHL connection exists
    const connection = await db.getGHLConnection(location_id);
    if (!connection) {
      return res.status(404).json({ error: 'GHL location not found. Please complete OAuth first.' });
    }
    
    // Add the mapping
    const mapping = await db.addLocationMapping({
      locationId: location_id,
      mac,
      locationName: name || ''
    });
    
    console.log(`Added mapping: ${mac} -> ${location_id}`);
    
    res.json({
      success: true,
      mapping: {
        id: mapping.id,
        mac: mapping.vivaspot_mac,
        name: mapping.vivaspot_location,
        location_id: mapping.ghl_location_id
      }
    });
    
  } catch (error) {
    console.error('Add mapping error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/mappings/:id
 * 
 * Remove a MAC address mapping.
 */
router.delete('/mappings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.deleteMapping(id);
    
    res.json({ success: true, message: 'Mapping deleted' });
    
  } catch (error) {
    console.error('Delete mapping error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// Connection Status
// ============================================================

/**
 * GET /api/connection/:locationId
 * 
 * Check the status of a GHL connection.
 */
router.get('/connection/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    
    const connection = await db.getGHLConnection(locationId);
    
    if (!connection) {
      return res.status(404).json({ 
        connected: false, 
        error: 'Connection not found' 
      });
    }
    
    const tokenExpiresAt = new Date(connection.token_expires_at);
    const isExpired = tokenExpiresAt < new Date();
    
    res.json({
      connected: true,
      location_id: connection.ghl_location_id,
      company_id: connection.ghl_company_id,
      token_expires_at: connection.token_expires_at,
      token_expired: isExpired,
      installed_at: connection.installed_at,
      is_active: connection.is_active
    });
    
  } catch (error) {
    console.error('Connection status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// Sync Status & Logs
// ============================================================

/**
 * GET /api/sync-status/:locationId
 * 
 * Get recent sync logs for a location.
 */
router.get('/sync-status/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const logs = await db.getSyncLogs(locationId, limit);
    
    // Calculate summary stats
    const stats = {
      total: logs.length,
      success: logs.filter(l => l.status === 'success').length,
      skipped: logs.filter(l => l.status === 'skipped').length,
      errors: logs.filter(l => l.status === 'error').length
    };
    
    res.json({
      location_id: locationId,
      stats,
      recent_logs: logs.map(l => ({
        email: l.contact_email,
        mac: l.vivaspot_mac,
        status: l.status,
        ghl_contact_id: l.ghl_contact_id,
        error: l.error_message,
        timestamp: l.synced_at
      }))
    });
    
  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// Test Endpoints
// ============================================================

/**
 * POST /api/test/ghl-connection
 * 
 * Test the GHL API connection by fetching location details.
 */
router.post('/test/ghl-connection', async (req, res) => {
  try {
    const { location_id } = req.body;
    
    if (!location_id) {
      return res.status(400).json({ error: 'Missing location_id' });
    }
    
    const connection = await db.getGHLConnection(location_id);
    
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    // Ensure token is valid
    const accessToken = await ghl.ensureValidToken(connection);
    
    // Test by fetching location details
    const location = await ghl.getLocation(accessToken, location_id);
    
    res.json({
      success: true,
      location: {
        id: location.id,
        name: location.name,
        email: location.email,
        phone: location.phone
      }
    });
    
  } catch (error) {
    console.error('Test connection error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;
