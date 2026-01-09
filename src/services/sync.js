/**
 * Updated Sync Service with Hospitality Group Tagging
 * 
 * This updates the processContact function to apply restaurant-specific tags
 * when contacts come from a hospitality group setup.
 */

import { getMacMappingWithTag, getGHLConnection } from '../db/queries.js';
import { createGHLContact } from './ghl.js';

/**
 * Process a contact from the webhook
 * 
 * @param {Object} contact - Contact data from webhook
 * @param {string} contact.mac - MAC address of the WiFi device
 * @param {string} contact.email - Contact email
 * @param {string} contact.name - Contact name
 * @param {string} contact.phone - Contact phone
 * @param {boolean|string} contact.opt_in - Opt-in status
 * @returns {Object} - Processing result
 */
export async function processContact({ mac, email, name, phone, opt_in }) {
  // Validate required fields
  if (!mac) {
    return { status: 'error', reason: 'Missing MAC address' };
  }
  
  if (!email) {
    return { status: 'error', reason: 'Missing email' };
  }
  
  // Check opt-in status
  const isOptedIn = checkOptIn(opt_in);
  if (!isOptedIn) {
    return { status: 'skipped', reason: 'Not opted in' };
  }
  
  // Look up MAC mapping (now includes source_tag)
  const mapping = await getMacMappingWithTag(mac);
  
  if (!mapping) {
    return { status: 'error', reason: 'MAC address not mapped to any GHL location' };
  }
  
  // Get GHL connection for this location
  const connection = await getGHLConnection(mapping.ghl_location_id);
  
  if (!connection) {
    return { status: 'error', reason: 'No GHL connection for this location' };
  }
  
  if (!connection.is_active) {
    return { status: 'error', reason: 'GHL connection is inactive' };
  }
  
  // Build tags array
  const tags = ['Vivaspot-WiFi'];
  
  // Add restaurant-specific tag if this is a hospitality group mapping
  if (mapping.source_tag) {
    tags.push(mapping.source_tag);
    console.log(`Adding restaurant tag: ${mapping.source_tag}`);
  }
  
  // Parse name into first/last
  const { firstName, lastName } = parseName(name);
  
  // Create contact in GHL
  try {
    const result = await createGHLContact(connection.access_token, {
      locationId: mapping.ghl_location_id,
      email,
      firstName,
      lastName,
      phone,
      tags,
      source: 'VivaSpot WiFi'
    });
    
    return {
      status: 'success',
      ghl_contact_id: result.contact?.id,
      ghl_location_id: mapping.ghl_location_id,
      tags_applied: tags
    };
    
  } catch (error) {
    console.error('Error creating GHL contact:', error);
    return { status: 'error', reason: error.message };
  }
}

/**
 * Check if contact has opted in
 * Handles various formats: boolean, string, array
 */
function checkOptIn(opt_in) {
  if (opt_in === true) return true;
  if (opt_in === 'true') return true;
  if (opt_in === 'Yes' || opt_in === 'yes') return true;
  if (Array.isArray(opt_in) && opt_in.length > 0) return true;
  return false;
}

/**
 * Parse full name into first and last name
 */
function parseName(fullName) {
  if (!fullName) {
    return { firstName: '', lastName: '' };
  }
  
  const parts = fullName.trim().split(/\s+/);
  
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
}
