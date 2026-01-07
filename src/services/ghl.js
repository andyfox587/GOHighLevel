/**
 * GoHighLevel API Service
 * 
 * Handles OAuth token exchange, refresh, and contact creation.
 */

import { updateGHLTokens } from '../db/queries.js';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_AUTH_URL = 'https://marketplace.gohighlevel.com/oauth/chooselocation';

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
  tags = ['vivaspot-wifi']
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

export default {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  ensureValidToken,
  createContact,
  findContactByEmail,
  getLocation
};
