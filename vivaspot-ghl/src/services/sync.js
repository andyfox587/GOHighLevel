/**
 * Sync Service
 * 
 * Handles contact synchronization from VivaSpot to GoHighLevel.
 */

import * as ghl from './ghl.js';
import * as db from '../db/queries.js';

/**
 * Process a contact from the n8n webhook
 * 
 * @param {Object} contact - Contact data from n8n
 * @param {string} contact.mac - MAC address of the WiFi access point
 * @param {string} contact.email - Guest email address
 * @param {string} contact.name - Guest name (may be "First Last")
 * @param {string} contact.phone - Guest phone number (optional)
 * @param {boolean|string|array} contact.opt_in - Marketing opt-in status
 * @returns {Object} Result of the sync operation
 */
export async function processContact(contact) {
  const { mac, email, name, phone, opt_in } = contact;
  
  // Validate required fields
  if (!mac) {
    return { 
      status: 'error', 
      reason: 'Missing MAC address' 
    };
  }
  
  if (!email) {
    return { 
      status: 'error', 
      reason: 'Missing email address' 
    };
  }
  
  // Check opt-in status
  if (!isOptedIn(opt_in)) {
    console.log(`Contact ${email} not opted in, skipping`);
    return { 
      status: 'skipped', 
      reason: 'Not opted in' 
    };
  }
  
  // Look up GHL location by MAC address
  const mapping = await db.getLocationByMAC(mac);
  
  if (!mapping) {
    console.log(`No GHL mapping found for MAC ${mac}`);
    return { 
      status: 'skipped', 
      reason: 'No GHL mapping for this MAC address' 
    };
  }
  
  const locationId = mapping.ghl_location_id;
  
  // Check if already synced
  const alreadySynced = await db.isContactSynced(locationId, email);
  if (alreadySynced) {
    console.log(`Contact ${email} already synced to ${locationId}`);
    return { 
      status: 'skipped', 
      reason: 'Already synced' 
    };
  }
  
  try {
    // Ensure we have a valid token
    const accessToken = await ghl.ensureValidToken(mapping);
    
    // Parse name into first/last
    const { firstName, lastName } = parseName(name);
    
    // Create contact in GHL
    const ghlContact = await ghl.createContact(accessToken, {
      locationId,
      email,
      firstName,
      lastName,
      phone,
      source: 'VivaSpot WiFi',
      tags: ['vivaspot-wifi']
    });
    
    // Record successful sync
    await db.recordSyncedContact({
      locationId,
      email,
      ghlContactId: ghlContact.id
    });
    
    // Log the sync
    await db.logSync({
      locationId,
      mac,
      email,
      status: 'success',
      ghlContactId: ghlContact.id
    });
    
    console.log(`Successfully synced ${email} to GHL location ${locationId}`);
    
    return {
      status: 'success',
      ghl_contact_id: ghlContact.id,
      ghl_location_id: locationId
    };
    
  } catch (error) {
    console.error(`Failed to sync ${email}:`, error.message);
    
    // Log the failure
    await db.logSync({
      locationId,
      mac,
      email,
      status: 'error',
      errorMessage: error.message
    });
    
    return {
      status: 'error',
      reason: error.message
    };
  }
}

/**
 * Check if user has opted in to marketing
 * Handles various formats: boolean, string, array
 */
function isOptedIn(optIn) {
  // If undefined or null, default to false for safety
  if (optIn === undefined || optIn === null) {
    return false;
  }
  
  // Boolean
  if (typeof optIn === 'boolean') {
    return optIn;
  }
  
  // String
  if (typeof optIn === 'string') {
    const lower = optIn.toLowerCase();
    return lower === 'yes' || lower === 'true' || lower === '1';
  }
  
  // Array (like ["Item 1"] from n8n checkbox)
  if (Array.isArray(optIn)) {
    return optIn.length > 0;
  }
  
  // Object - check if has any truthy value
  if (typeof optIn === 'object') {
    return Object.values(optIn).some(v => v);
  }
  
  return false;
}

/**
 * Parse a full name into first and last name
 */
function parseName(name) {
  if (!name || typeof name !== 'string') {
    return { firstName: '', lastName: '' };
  }
  
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/);
  
  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }
  
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
}

export default {
  processContact,
  isOptedIn,
  parseName
};
