/**
 * GoHighLevel API Service
 * 
 * Handles OAuth token exchange, refresh, and contact creation.
 */

import { updateGHLTokens } from '../db/queries.js';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_AUTH_URL = 'https://marketplace.gohighlevel.com/oauth/chooselocation';

// ============================================================
// OAuth & Authorization
// ============================================================

/**
 * Get OAuth authorization URL
 */
export function getAuthorizationUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.GHL_CLIENT_ID,
    redirect_uri: process.env.GHL_REDIRECT_URI,
    scope: 'contacts.write contacts.readonly locations.readonly',
    state: state || ''
  });

  return `${GHL_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code) {
  const response = await fetch(`${GHL_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: new URLSearchParams({
      client_id: process.env.GHL_CLIENT_ID,
      client_secret: process.env.GHL_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.GHL_REDIRECT_URI
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    locationId: data.locationId,
    companyId: data.companyId,
    userId: data.userId
  };
}

/**
 * Exchange authorization code for tokens (alternative signature for OAuth callback)
 * Returns data with snake_case keys to match GHL API response format
 */
export async function getGHLTokens(code) {
  const response = await fetch(`${GHL_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: new URLSearchParams({
      client_id: process.env.GHL_CLIENT_ID,
      client_secret: process.env.GHL_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.GHL_REDIRECT_URI
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('GHL Token API error:', error);
    throw new Error(`Failed to exchange code for tokens: ${response.status}`);
  }

  return response.json();
}

/**
 * Refresh an access token
 */
export async function refreshAccessToken(refreshToken) {
  const response = await fetch(`${GHL_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: new URLSearchParams({
      client_id: process.env.GHL_CLIENT_ID,
      client_secret: process.env.GHL_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in
  };
}

/**
 * Check if token needs refresh and refresh if necessary
 */
export async function ensureValidToken(connection) {
  const expiresAt = new Date(connection.token_expires_at);
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  
  if (expiresAt > fiveMinutesFromNow) {
    // Token is still valid
    return connection.access_token;
  }
  
  console.log(`Refreshing token for location ${connection.ghl_location_id}`);
  
  // Token is expiring soon, refresh it
  const newTokens = await refreshAccessToken(connection.refresh_token);
  
  // Update database
  await updateGHLTokens({
    locationId: connection.ghl_location_id,
    accessToken: newTokens.accessToken,
    refreshToken: newTokens.refreshToken,
    expiresIn: newTokens.expiresIn
  });
  
  return newTokens.accessToken;
}

// ============================================================
// Contacts
// ============================================================

/**
 * Create a contact in GoHighLevel
 */
export async function createContact(accessToken, { 
  locationId, 
  email, 
  firstName, 
  lastName, 
  phone, 
  source = 'VivaSpot WiFi',
  tags = ['Vivaspot-WiFi']
}) {
  const body = {
    locationId,
    email,
    source,
    tags
  };
  
  // Only include fields that have values
  if (firstName) body.firstName = firstName;
  if (lastName) body.lastName = lastName;
  if (phone) body.phone = phone;

  const response = await fetch(`${GHL_API_BASE}/contacts/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Create contact failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.contact;
}

/**
 * Create a contact in GoHighLevel (alias for sync service)
 */
export async function createGHLContact(accessToken, contactData) {
  return createContact(accessToken, contactData);
}

/**
 * Search for an existing contact by email
 */
export async function findContactByEmail(accessToken, locationId, email) {
  const params = new URLSearchParams({
    locationId,
    query: email
  });

  const response = await fetch(`${GHL_API_BASE}/contacts/search/duplicate?${params}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Version': '2021-07-28'
    }
  });

  if (!response.ok) {
    // 404 means no contact found, which is fine
    if (response.status === 404) return null;
    const error = await response.text();
    throw new Error(`Contact search failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.contact || null;
}

// ============================================================
// Locations
// ============================================================

/**
 * Get location details
 */
export async function getLocation(accessToken, locationId) {
  const response = await fetch(`${GHL_API_BASE}/locations/${locationId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Version': '2021-07-28'
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Get location failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.location;
}

/**
 * Get location details from GHL API (alias for OAuth callback)
 * 
 * @param {string} accessToken - The GHL access token
 * @param {string} locationId - The GHL location ID
 * @returns {Object} - Location details including name, email, etc.
 */
export async function getGHLLocation(accessToken, locationId) {
  const response = await fetch(`${GHL_API_BASE}/locations/${locationId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Version': '2021-07-28',
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('GHL Location API error:', error);
    throw new Error(`Failed to get location: ${response.status}`);
  }
  
  const data = await response.json();
  return data.location || data;
}

// ============================================================
// Users
// ============================================================

/**
 * Get the current user's details from GHL API
 * 
 * @param {string} accessToken - The GHL access token
 * @returns {Object} - User details including email
 */
export async function getGHLUser(accessToken) {
  const response = await fetch(`${GHL_API_BASE}/users/me`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Version': '2021-07-28',
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    // Try alternate endpoint
    const altResponse = await fetch(`${GHL_API_BASE}/oauth/userinfo`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    if (!altResponse.ok) {
      throw new Error(`Failed to get user info: ${response.status}`);
    }
    
    return altResponse.json();
  }
  
  const data = await response.json();
  return data.user || data;
}

// ============================================================
// Default Export
// ============================================================

export default {
  // OAuth
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getGHLTokens,
  refreshAccessToken,
  ensureValidToken,
  // Contacts
  createContact,
  createGHLContact,
  findContactByEmail,
  // Locations
  getLocation,
  getGHLLocation,
  // Users
  getGHLUser
};
