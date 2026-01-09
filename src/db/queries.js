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
 * Store GHL connection (alternative signature for OAuth callback)
 */
export async function storeGHLConnection({
  locationId,
  locationName,
  accessToken,
  refreshToken,
  expiresAt,
  userEmail
}) {
  const result = await query(`
    INSERT INTO ghl_connections (
      ghl_location_id, location_name, access_token, refresh_token, token_expires_at, user_email
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (ghl_location_id) 
    DO UPDATE SET 
      location_name = EXCLUDED.location_name,
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      token_expires_at = EXCLUDED.token_expires_at,
      user_email = EXCLUDED.user_email,
      is_active = true
    RETURNING *
  `, [locationId, locationName, accessToken, refreshToken, expiresAt, userEmail]);
  
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
// Location Mappings (Original)
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
// MAC Mappings (New - for auto-mapping)
// ============================================================

/**
 * Convert restaurant name to tag format (underscores, no special chars)
 * e.g., "Maggie's Restaurant & Bar" → "Maggies_Restaurant_Bar"
 */
export function nameToTag(name) {
  return name
    .replace(/['']/g, '')           // Remove apostrophes
    .replace(/[&]/g, 'and')         // Replace & with 'and'
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove other special chars
    .trim()
    .replace(/\s+/g, '_');          // Replace spaces with underscores
}

/**
 * Create MAC address mappings for a GHL location (single restaurant)
 * 
 * @param {string} locationId - The GHL location ID
 * @param {string[]} macAddresses - Array of MAC addresses to map
 * @returns {number} - Number of mappings created
 */
export async function createMacMappings(locationId, macAddresses) {
  return createMacMappingsWithTag(locationId, macAddresses, null, null);
}

/**
 * Create MAC address mappings for a GHL location with optional source tag
 * Used for hospitality group mappings where contacts need restaurant-specific tags
 * 
 * @param {string} locationId - The GHL location ID
 * @param {string[]} macAddresses - Array of MAC addresses to map
 * @param {string|null} sourceRestaurant - Original restaurant name (for hospitality groups)
 * @param {string|null} sourceTag - Tag to apply in GHL (e.g., "Maggies_Restaurant")
 * @returns {number} - Number of mappings created
 */
export async function createMacMappingsWithTag(locationId, macAddresses, sourceRestaurant, sourceTag) {
  if (!macAddresses || macAddresses.length === 0) {
    return 0;
  }
  
  let created = 0;
  
  for (const mac of macAddresses) {
    const normalizedMac = mac.toLowerCase().trim();
    
    // Skip invalid MACs
    if (!normalizedMac || normalizedMac.length < 11) continue;
    
    // Check if already mapped
    const existing = await query(
      'SELECT id FROM mac_mappings WHERE mac_address = $1',
      [normalizedMac]
    );
    
    if (existing.rows.length > 0) {
      // Update existing mapping to new location
      await query(
        `UPDATE mac_mappings 
         SET ghl_location_id = $1, 
             source_restaurant = $3,
             source_tag = $4,
             updated_at = NOW() 
         WHERE mac_address = $2`,
        [locationId, normalizedMac, sourceRestaurant, sourceTag]
      );
      console.log(`Updated existing mapping for MAC: ${normalizedMac}${sourceTag ? ` (tag: ${sourceTag})` : ''}`);
    } else {
      // Create new mapping
      await query(
        `INSERT INTO mac_mappings (mac_address, ghl_location_id, source_restaurant, source_tag) 
         VALUES ($1, $2, $3, $4)`,
        [normalizedMac, locationId, sourceRestaurant, sourceTag]
      );
      console.log(`Created new mapping for MAC: ${normalizedMac}${sourceTag ? ` (tag: ${sourceTag})` : ''}`);
    }
    created++;
  }
  
  return created;
}

/**
 * Create MAC mappings for an entire hospitality group
 * Each restaurant's MACs are tagged with the restaurant name
 * 
 * @param {string} locationId - The GHL location ID
 * @param {Array} sites - Array of vivaspot_sites rows
 * @returns {Object} - { totalMapped, restaurants: [{name, macCount}] }
 */
export async function createHospitalityGroupMappings(locationId, sites) {
  const results = {
    totalMapped: 0,
    restaurants: []
  };
  
  for (const site of sites) {
    const tag = nameToTag(site.restaurant_name);
    const macCount = await createMacMappingsWithTag(
      locationId,
      site.mac_addresses,
      site.restaurant_name,
      tag
    );
    
    results.totalMapped += macCount;
    results.restaurants.push({
      name: site.restaurant_name,
      macCount,
      tag
    });
  }
  
  console.log(`Hospitality group mapping complete: ${results.totalMapped} MACs across ${results.restaurants.length} restaurants`);
  return results;
}

/**
 * Get the source tag for a MAC address (if any)
 * Used during contact sync to apply restaurant-specific tags
 * 
 * @param {string} macAddress - The MAC address to look up
 * @returns {Object|null} - { ghl_location_id, source_tag } or null
 */
export async function getMacMappingWithTag(macAddress) {
  const result = await query(
    `SELECT ghl_location_id, source_restaurant, source_tag 
     FROM mac_mappings 
     WHERE mac_address = $1`,
    [macAddress.toLowerCase().trim()]
  );
  
  return result.rows[0] || null;
}

/**
 * Get all MAC mappings for a GHL location
 * Used by the setup page to show existing mappings
 * 
 * @param {string} locationId - The GHL location ID
 * @returns {Array} - Array of { mac_address, source_restaurant, source_tag }
 */
export async function getMacMappingsForLocation(locationId) {
  const result = await query(
    `SELECT mac_address, source_restaurant, source_tag, created_at
     FROM mac_mappings 
     WHERE ghl_location_id = $1
     ORDER BY created_at DESC`,
    [locationId]
  );
  
  return result.rows;
}

// ============================================================
// VivaSpot Sites (for auto-mapping)
// ============================================================

/**
 * Find matching VivaSpot site(s) by email and location name
 * Returns either a single site or a hospitality group with multiple sites
 * 
 * @param {string} email - The merchant email to match
 * @param {string} locationName - The GHL location name to match
 * @returns {Object} - { type: 'single'|'group'|'none', site?: Object, sites?: Array, groupName?: string }
 */
export async function findVivaSpotMatch(email, locationName) {
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedName = locationName.toLowerCase().trim();
  
  // Strategy 1: Check if locationName matches a hospitality_group
  const groupResult = await query(`
    SELECT 
      id,
      restaurant_name,
      hospitality_group,
      address,
      merchant_emails,
      mac_addresses
    FROM vivaspot_sites
    WHERE $1 = ANY(merchant_emails)
    AND LOWER(hospitality_group) LIKE $2
    ORDER BY restaurant_name
  `, [
    normalizedEmail,
    `%${normalizedName}%`
  ]);
  
  if (groupResult.rows.length > 1) {
    console.log(`Found hospitality group match: ${groupResult.rows[0].hospitality_group} with ${groupResult.rows.length} sites`);
    return {
      type: 'group',
      groupName: groupResult.rows[0].hospitality_group,
      sites: groupResult.rows
    };
  }
  
  // Strategy 2: Exact email match + fuzzy restaurant name match
  let result = await query(`
    SELECT 
      id,
      restaurant_name,
      hospitality_group,
      address,
      merchant_emails,
      mac_addresses
    FROM vivaspot_sites
    WHERE $1 = ANY(merchant_emails)
    AND (
      LOWER(restaurant_name) = $2
      OR LOWER(restaurant_name) LIKE $3
      OR $2 LIKE '%' || LOWER(restaurant_name) || '%'
      OR LOWER(restaurant_name) LIKE '%' || $4 || '%'
    )
    LIMIT 1
  `, [
    normalizedEmail,
    normalizedName,
    `%${normalizedName}%`,
    normalizedName.split(' ')[0] // First word match
  ]);
  
  if (result.rows.length > 0) {
    console.log(`Found site by email + name match: ${result.rows[0].restaurant_name}`);
    return { type: 'single', site: result.rows[0] };
  }
  
  // Strategy 3: Just email match if only one site for this email
  result = await query(`
    SELECT 
      id,
      restaurant_name,
      hospitality_group,
      address,
      merchant_emails,
      mac_addresses
    FROM vivaspot_sites
    WHERE $1 = ANY(merchant_emails)
  `, [normalizedEmail]);
  
  // If only one site for this email, use it regardless of name
  if (result.rows.length === 1) {
    console.log(`Found single site for email: ${result.rows[0].restaurant_name}`);
    return { type: 'single', site: result.rows[0] };
  }
  
  // Strategy 4: Multiple sites - try to find best name match
  if (result.rows.length > 1) {
    for (const site of result.rows) {
      const siteName = site.restaurant_name.toLowerCase();
      
      // Check for strong name overlap
      const nameWords = normalizedName.split(/[\s\-]+/).filter(w => w.length > 2);
      const siteWords = siteName.split(/[\s\-]+/).filter(w => w.length > 2);
      
      const matchingWords = nameWords.filter(word => 
        siteWords.some(sw => sw.includes(word) || word.includes(sw))
      );
      
      if (matchingWords.length >= 1) {
        console.log(`Found site by word match: ${site.restaurant_name} (matched: ${matchingWords.join(', ')})`);
        return { type: 'single', site };
      }
    }
    
    console.log(`Multiple sites for email but no name match. Sites: ${result.rows.map(r => r.restaurant_name).join(', ')}`);
  }
  
  return { type: 'none' };
}

/**
 * Legacy function for backward compatibility
 */
export async function findVivaSpotSiteByEmailAndName(email, locationName) {
  const match = await findVivaSpotMatch(email, locationName);
  if (match.type === 'single') return match.site;
  if (match.type === 'group') return match.sites[0]; // Return first for legacy
  return null;
}

/**
 * Get all VivaSpot sites for a given email
 * Used for manual selection when auto-match fails
 * 
 * @param {string} email - The merchant email
 * @returns {Array} - Array of sites
 */
export async function getVivaSpotSitesByEmail(email) {
  const result = await query(`
    SELECT 
      id,
      restaurant_name,
      hospitality_group,
      address,
      array_length(mac_addresses, 1) as mac_count
    FROM vivaspot_sites
    WHERE $1 = ANY(merchant_emails)
    ORDER BY restaurant_name
  `, [email.toLowerCase().trim()]);
  
  return result.rows;
}

/**
 * Get MAC addresses for a specific VivaSpot site
 * 
 * @param {number} siteId - The vivaspot_sites.id
 * @returns {string[]} - Array of MAC addresses
 */
export async function getVivaSpotSiteMacs(siteId) {
  const result = await query(
    'SELECT mac_addresses FROM vivaspot_sites WHERE id = $1',
    [siteId]
  );
  
  return result.rows[0]?.mac_addresses || [];
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

// ============================================================
// Default Export
// ============================================================

export default {
  // Connections
  saveGHLConnection,
  storeGHLConnection,
  getGHLConnection,
  updateGHLTokens,
  deactivateGHLConnection,
  // Location Mappings (Original)
  addLocationMapping,
  getMappingsForLocation,
  getLocationByMAC,
  deleteMapping,
  // MAC Mappings (New)
  nameToTag,
  createMacMappings,
  createMacMappingsWithTag,
  createHospitalityGroupMappings,
  getMacMappingWithTag,
  getMacMappingsForLocation,
  // VivaSpot Sites
  findVivaSpotMatch,
  findVivaSpotSiteByEmailAndName,
  getVivaSpotSitesByEmail,
  getVivaSpotSiteMacs,
  // Synced Contacts
  isContactSynced,
  recordSyncedContact,
  // Sync Log
  logSync,
  getSyncLogs
};
