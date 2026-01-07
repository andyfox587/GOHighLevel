/**
 * Database Query Helper Functions
 * 
 * Provides convenient functions for common database operations.
 */

import { query } from './connection.js';

// ============================================================
// GHL Connections
// ============================================================

/**
 * Save or update GHL OAuth tokens
 */
export async function saveGHLConnection({ 
  locationId, 
  companyId, 
  accessToken, 
  refreshToken, 
  expiresIn 
}) {
  const expiresAt = new Date(Date.now() + (expiresIn * 1000));
  
  const result = await query(`
    INSERT INTO ghl_connections (
      ghl_location_id, ghl_company_id, access_token, refresh_token, token_expires_at
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (ghl_location_id) 
    DO UPDATE SET 
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      token_expires_at = EXCLUDED.token_expires_at,
      is_active = true
    RETURNING *
  `, [locationId, companyId, accessToken, refreshToken, expiresAt]);
  
  return result.rows[0];
}

/**
 * Get GHL connection by location ID
 */
export async function getGHLConnection(locationId) {
  const result = await query(`
    SELECT * FROM ghl_connections 
    WHERE ghl_location_id = $1 AND is_active = true
  `, [locationId]);
  
  return result.rows[0];
}

/**
 * Update GHL tokens after refresh
 */
export async function updateGHLTokens({ 
  locationId, 
  accessToken, 
  refreshToken, 
  expiresIn 
}) {
  const expiresAt = new Date(Date.now() + (expiresIn * 1000));
  
  const result = await query(`
    UPDATE ghl_connections 
    SET access_token = $2, refresh_token = $3, token_expires_at = $4
    WHERE ghl_location_id = $1
    RETURNING *
  `, [locationId, accessToken, refreshToken, expiresAt]);
  
  return result.rows[0];
}

/**
 * Deactivate GHL connection (on uninstall)
 */
export async function deactivateGHLConnection(locationId) {
  await query(`
    UPDATE ghl_connections SET is_active = false WHERE ghl_location_id = $1
  `, [locationId]);
}

// ============================================================
// Location Mappings
// ============================================================

/**
 * Add a MAC address mapping for a GHL location
 */
export async function addLocationMapping({ locationId, mac, locationName }) {
  // Normalize MAC address format (uppercase, colon-separated)
  const normalizedMac = mac.toUpperCase().replace(/-/g, ':');
  
  const result = await query(`
    INSERT INTO location_mappings (ghl_location_id, vivaspot_mac, vivaspot_location)
    VALUES ($1, $2, $3)
    ON CONFLICT (ghl_location_id, vivaspot_mac) DO UPDATE
    SET vivaspot_location = EXCLUDED.vivaspot_location
    RETURNING *
  `, [locationId, normalizedMac, locationName]);
  
  return result.rows[0];
}

/**
 * Get all mappings for a GHL location
 */
export async function getMappingsForLocation(locationId) {
  const result = await query(`
    SELECT * FROM location_mappings WHERE ghl_location_id = $1
  `, [locationId]);
  
  return result.rows;
}

/**
 * Get GHL location by MAC address
 */
export async function getLocationByMAC(mac) {
  // Normalize MAC address format
  const normalizedMac = mac.toUpperCase().replace(/-/g, ':');
  
  const result = await query(`
    SELECT lm.*, gc.access_token, gc.refresh_token, gc.token_expires_at
    FROM location_mappings lm
    JOIN ghl_connections gc ON lm.ghl_location_id = gc.ghl_location_id
    WHERE lm.vivaspot_mac = $1 AND gc.is_active = true
  `, [normalizedMac]);
  
  return result.rows[0];
}

/**
 * Delete a mapping
 */
export async function deleteMapping(mappingId) {
  await query(`DELETE FROM location_mappings WHERE id = $1`, [mappingId]);
}

// ============================================================
// Synced Contacts
// ============================================================

/**
 * Check if contact has already been synced
 */
export async function isContactSynced(locationId, email) {
  const result = await query(`
    SELECT id FROM synced_contacts 
    WHERE ghl_location_id = $1 AND contact_email = $2
  `, [locationId, email.toLowerCase()]);
  
  return result.rows.length > 0;
}

/**
 * Record a synced contact
 */
export async function recordSyncedContact({ locationId, email, ghlContactId }) {
  await query(`
    INSERT INTO synced_contacts (ghl_location_id, contact_email, ghl_contact_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (ghl_location_id, contact_email) DO NOTHING
  `, [locationId, email.toLowerCase(), ghlContactId]);
}

// ============================================================
// Sync Log
// ============================================================

/**
 * Log a sync attempt
 */
export async function logSync({ 
  locationId, 
  mac, 
  email, 
  status, 
  ghlContactId, 
  errorMessage 
}) {
  await query(`
    INSERT INTO sync_log (
      ghl_location_id, vivaspot_mac, contact_email, status, ghl_contact_id, error_message
    ) VALUES ($1, $2, $3, $4, $5, $6)
  `, [locationId, mac, email, status, ghlContactId, errorMessage]);
}

/**
 * Get recent sync logs for a location
 */
export async function getSyncLogs(locationId, limit = 50) {
  const result = await query(`
    SELECT * FROM sync_log 
    WHERE ghl_location_id = $1 
    ORDER BY synced_at DESC 
    LIMIT $2
  `, [locationId, limit]);
  
  return result.rows;
}

export default {
  // Connections
  saveGHLConnection,
  getGHLConnection,
  updateGHLTokens,
  deactivateGHLConnection,
  // Mappings
  addLocationMapping,
  getMappingsForLocation,
  getLocationByMAC,
  deleteMapping,
  // Synced Contacts
  isContactSynced,
  recordSyncedContact,
  // Sync Log
  logSync,
  getSyncLogs
};
