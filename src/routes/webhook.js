/**
 * Webhook Routes
 * 
 * Receives contact data from n8n and syncs to GoHighLevel.
 */

import { Router } from 'express';
import { processContact } from '../services/sync.js';
import { deactivateGHLConnection } from '../db/queries.js';

const router = Router();

/**
 * POST /webhook/contact
 * 
 * Receives contact data from n8n webhook and syncs to GHL.
 * 
 * Expected body from n8n:
 * {
 *   "mac": "00:18:0a:36:1a:f8",
 *   "email": "guest@example.com",
 *   "name": "John Doe",
 *   "phone": "+15551234567",
 *   "opt_in": true | "Yes" | ["Item 1"]
 * }
 */
router.post('/contact', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { mac, email, name, phone, opt_in, mobile } = req.body;
    
    // Log incoming webhook
    console.log('Webhook received:', { 
      mac, 
      email, 
      name, 
      hasPhone: !!phone || !!mobile,
      opt_in 
    });
    
    // Process the contact
    const result = await processContact({
      mac,
      email,
      name,
      phone: phone || mobile, // Handle both field names
      opt_in
    });
    
    const duration = Date.now() - startTime;
    console.log(`Webhook processed in ${duration}ms:`, result);
    
    res.json({
      ...result,
      processing_time_ms: duration
    });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ 
      status: 'error', 
      reason: error.message 
    });
  }
});

/**
 * POST /webhook/contact/batch
 * 
 * Process multiple contacts at once (for batch operations).
 * 
 * Expected body:
 * {
 *   "contacts": [
 *     { "mac": "...", "email": "...", "name": "...", "opt_in": true },
 *     ...
 *   ]
 * }
 */
router.post('/contact/batch', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { contacts } = req.body;
    
    if (!Array.isArray(contacts)) {
      return res.status(400).json({ error: 'contacts must be an array' });
    }
    
    console.log(`Processing batch of ${contacts.length} contacts`);
    
    const results = [];
    
    for (const contact of contacts) {
      const result = await processContact(contact);
      results.push({
        email: contact.email,
        ...result
      });
      
      // Small delay between contacts to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const duration = Date.now() - startTime;
    
    // Summarize results
    const summary = {
      total: results.length,
      success: results.filter(r => r.status === 'success').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length
    };
    
    console.log(`Batch processed in ${duration}ms:`, summary);
    
    res.json({
      summary,
      results,
      processing_time_ms: duration
    });
    
  } catch (error) {
    console.error('Batch webhook error:', error);
    res.status(500).json({ 
      status: 'error', 
      reason: error.message 
    });
  }
});

/**
 * POST /webhook/ghl/uninstall
 * 
 * Handles GHL app uninstall webhook.
 * Deactivates the connection when a user uninstalls the app.
 */
router.post('/ghl/uninstall', async (req, res) => {
  try {
    const { locationId } = req.body;
    
    if (locationId) {
      console.log('GHL app uninstalled for location:', locationId);
      await deactivateGHLConnection(locationId);
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Uninstall webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /webhook/health
 * 
 * Health check for the webhook endpoint.
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    endpoint: '/webhook/contact',
    timestamp: new Date().toISOString()
  });
});

export default router;
