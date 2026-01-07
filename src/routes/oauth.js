/**
 * OAuth Routes
 * 
 * Handles GoHighLevel OAuth 2.0 flow for marketplace installation.
 */

import { Router } from 'express';
import * as ghl from '../services/ghl.js';
import { saveGHLConnection } from '../db/queries.js';

const router = Router();

/**
 * GET /oauth/authorize
 * 
 * Initiates OAuth flow - redirects to GHL's Installation URL.
 * This is where users go when they click "Connect GoHighLevel Account".
 */
router.get('/authorize', (req, res) => {
  try {
    // Use GHL's pre-built Installation URL (includes version_id)
    const installUrl = process.env.GHL_INSTALL_URL;
    
    if (!installUrl) {
      console.error('GHL_INSTALL_URL environment variable not set');
      return res.status(500).json({ 
        error: 'OAuth not configured. Missing GHL_INSTALL_URL.' 
      });
    }
    
    console.log('Redirecting to GHL Install URL');
    res.redirect(installUrl);
  } catch (error) {
    console.error('OAuth authorize error:', error);
    res.status(500).json({ error: 'Failed to initiate OAuth flow' });
  }
});

/**
 * GET /oauth/callback
 * 
 * OAuth callback - receives authorization code from GHL.
 * Exchanges code for access tokens and stores them.
 */
router.get('/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  
  // Handle OAuth errors
  if (oauthError) {
    console.error('OAuth error from GHL:', oauthError);
    return res.redirect(`/setup?error=${encodeURIComponent(oauthError)}`);
  }
  
  // Verify we have an authorization code
  if (!code) {
    console.error('No authorization code received');
    return res.redirect('/setup?error=no_code');
  }
  
  try {
    // Exchange code for tokens
    console.log('Exchanging authorization code for tokens...');
    const tokens = await ghl.exchangeCodeForTokens(code);
    
    console.log('Received tokens for location:', tokens.locationId);
    
    // Save to database
    await saveGHLConnection({
      locationId: tokens.locationId,
      companyId: tokens.companyId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn
    });
    
    console.log('Saved GHL connection for location:', tokens.locationId);
    
    // Redirect to setup page to configure MAC mappings
    res.redirect(`/setup?location_id=${tokens.locationId}&success=true`);
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`/setup?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * POST /oauth/refresh
 * 
 * Manually refresh tokens (for testing/admin purposes)
 */
router.post('/refresh', async (req, res) => {
  const { location_id } = req.body;
  
  if (!location_id) {
    return res.status(400).json({ error: 'Missing location_id' });
  }
  
  try {
    const { getGHLConnection } = await import('../db/queries.js');
    const connection = await getGHLConnection(location_id);
    
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    const newTokens = await ghl.refreshAccessToken(connection.refresh_token);
    
    const { updateGHLTokens } = await import('../db/queries.js');
    await updateGHLTokens({
      locationId: location_id,
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresIn: newTokens.expiresIn
    });
    
    res.json({ success: true, message: 'Tokens refreshed' });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
