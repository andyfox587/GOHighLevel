/**
 * Updated OAuth Callback Route with Auto-Mapping
 * 
 * This replaces the existing /oauth/callback route in your Render app.
 * It automatically maps MAC addresses based on email + restaurant name matching.
 * Supports both single restaurants and hospitality groups.
 */

import { Router } from 'express';
import { 
  storeGHLConnection, 
  createMacMappings,
  createHospitalityGroupMappings,
  findVivaSpotMatch 
} from '../db/queries.js';
import { getGHLTokens, getGHLLocation, getGHLUser } from '../services/ghl.js';

const router = Router();

/**
 * GET /oauth/callback
 * 
 * Handles the OAuth callback from GoHighLevel.
 * Automatically maps MAC addresses based on email and location name.
 * Supports hospitality groups with restaurant-specific tagging.
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.status(400).send('Missing authorization code');
    }
    
    console.log('OAuth callback received with code');
    
    // Step 1: Exchange code for tokens
    const tokens = await getGHLTokens(code);
    console.log('Tokens received for location:', tokens.locationId);
    
    // Step 2: Get location details from GHL API
    const location = await getGHLLocation(tokens.access_token, tokens.locationId);
    console.log('GHL Location:', location.name);
    
    // Step 3: Get user email from GHL (the person who authorized)
    let userEmail = null;
    try {
      const user = await getGHLUser(tokens.access_token);
      userEmail = user.email?.toLowerCase();
      console.log('GHL User email:', userEmail);
    } catch (err) {
      console.log('Could not get user email:', err.message);
    }
    
    // Step 4: Store the GHL connection
    await storeGHLConnection({
      locationId: tokens.locationId,
      locationName: location.name,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      userEmail: userEmail
    });
    
    // Step 5: Auto-map MAC addresses
    let autoMappingResult = { 
      success: false, 
      type: null,
      mappedCount: 0, 
      reason: null,
      restaurants: []
    };
    
    if (userEmail && location.name) {
      console.log(`Attempting auto-mapping for email: ${userEmail}, location: ${location.name}`);
      
      // Find matching VivaSpot site(s)
      const match = await findVivaSpotMatch(userEmail, location.name);
      
      if (match.type === 'group') {
        // Hospitality group - map all restaurants with tags
        console.log(`Found hospitality group: ${match.groupName} with ${match.sites.length} restaurants`);
        
        const groupResult = await createHospitalityGroupMappings(
          tokens.locationId,
          match.sites
        );
        
        autoMappingResult = {
          success: true,
          type: 'group',
          groupName: match.groupName,
          mappedCount: groupResult.totalMapped,
          restaurants: groupResult.restaurants
        };
        
        console.log(`Mapped hospitality group: ${groupResult.totalMapped} MACs across ${groupResult.restaurants.length} restaurants`);
        
      } else if (match.type === 'single') {
        // Single restaurant - map without extra tags
        console.log(`Found single site: ${match.site.restaurant_name} with ${match.site.mac_addresses.length} MACs`);
        
        const mappedCount = await createMacMappings(
          tokens.locationId, 
          match.site.mac_addresses
        );
        
        autoMappingResult = {
          success: true,
          type: 'single',
          mappedCount,
          siteName: match.site.restaurant_name
        };
        
        console.log(`Auto-mapped ${mappedCount} MAC addresses for single restaurant`);
        
      } else {
        console.log('No matching VivaSpot site found');
        autoMappingResult.reason = 'no_match';
      }
    } else {
      autoMappingResult.reason = 'missing_email_or_location';
    }
    
    // Step 6: Redirect to success page
    const successUrl = new URL('/oauth/success', process.env.APP_URL || 'https://vivaspot.onrender.com');
    successUrl.searchParams.set('location', location.name);
    successUrl.searchParams.set('locationId', tokens.locationId);
    successUrl.searchParams.set('mapped', autoMappingResult.mappedCount.toString());
    successUrl.searchParams.set('type', autoMappingResult.type || 'none');
    
    if (autoMappingResult.type === 'group') {
      successUrl.searchParams.set('group', autoMappingResult.groupName);
      successUrl.searchParams.set('restaurantCount', autoMappingResult.restaurants.length.toString());
    }
    
    if (!autoMappingResult.success && autoMappingResult.reason === 'no_match') {
      successUrl.searchParams.set('manual', 'true');
    }
    
    res.redirect(successUrl.toString());
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>Connection Failed</h1>
          <p>There was an error connecting your GoHighLevel account.</p>
          <p style="color: #666;">${error.message}</p>
          <a href="/">Try Again</a>
        </body>
      </html>
    `);
  }
});

/**
 * GET /oauth/success
 * 
 * Success page after OAuth completion
 */
router.get('/success', (req, res) => {
  const { location, mapped, manual, type, group, restaurantCount, locationId } = req.query;
  const mappedCount = parseInt(mapped) || 0;
  const numRestaurants = parseInt(restaurantCount) || 0;
  const needsManualSetup = manual === 'true';
  const isGroup = type === 'group';
  
  res.send(`
    <html>
      <head>
        <title>Connected to GoHighLevel</title>
        <style>
          body { font-family: -apple-system, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; }
          .success { color: #10b981; }
          .warning { color: #f59e0b; }
          .card { background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; 
                 border-radius: 6px; text-decoration: none; margin-top: 20px; }
          .btn:hover { background: #2563eb; }
          .btn-primary { background: #3b82f6; }
          .btn-secondary { background: #6b7280; margin-left: 10px; }
          .tag { display: inline-block; background: #e5e7eb; padding: 2px 8px; border-radius: 4px; 
                 font-size: 12px; margin: 2px; }
          .help-text { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <h1 class="success">✓ Connected Successfully!</h1>
        <p>Your GoHighLevel location <strong>${location || 'Unknown'}</strong> is now connected.</p>
        
        <div class="card">
          ${isGroup ? `
            <h3 class="success">✓ Hospitality Group Mapped</h3>
            <p><strong>${group}</strong> connected with <strong>${numRestaurants}</strong> restaurant locations.</p>
            <p><strong>${mappedCount}</strong> WiFi device(s) mapped total.</p>
            <p style="margin-top: 15px;">
              <strong>How it works:</strong> Contacts from each restaurant will be tagged with their location 
              (e.g., <span class="tag">Maggies_Restaurant</span>) plus <span class="tag">Vivaspot-WiFi</span>.
            </p>
          ` : mappedCount > 0 ? `
            <h3 class="success">✓ Auto-Mapping Complete</h3>
            <p><strong>${mappedCount}</strong> WiFi device(s) automatically mapped to this location.</p>
            <p>Guest contacts will now sync to GoHighLevel with the <span class="tag">Vivaspot-WiFi</span> tag.</p>
          ` : needsManualSetup ? `
            <h3 class="warning">⚠ Manual Setup Required</h3>
            <p>We couldn't automatically match "<strong>${location}</strong>" to your VivaSpot WiFi devices.</p>
            <p>This can happen if:</p>
            <ul>
              <li>The location name in GoHighLevel doesn't match our records</li>
              <li>Your email address isn't associated with a VivaSpot site</li>
              <li>This is a new location that hasn't been set up yet</li>
            </ul>
            
            <div class="help-text">
              <strong>What are MAC addresses?</strong><br>
              Each WiFi access point has a unique identifier called a MAC address (e.g., 00:18:0a:27:29:76). 
              You can find this on a sticker on your WiFi device or in your network settings.
              If you're unsure, contact VivaSpot support.
            </div>
            
            <div style="margin-top: 25px;">
              <a href="/setup/${locationId || ''}" class="btn btn-primary">Enter MAC Addresses Manually</a>
              <a href="mailto:support@vivaspot.com?subject=Help%20with%20GHL%20Setup%20-%20${encodeURIComponent(location || '')}" class="btn btn-secondary">Contact Support</a>
            </div>
          ` : `
            <h3>Setup Complete</h3>
            <p>Your account is connected. Contact VivaSpot support if you need to configure MAC address mappings.</p>
          `}
        </div>
        
        <p style="color: #666; margin-top: 40px;">You can close this window and return to GoHighLevel.</p>
      </body>
    </html>
  `);
});

export default router;
