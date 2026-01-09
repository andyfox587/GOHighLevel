/**
 * Manual Setup Route
 * 
 * Allows users to manually enter MAC addresses when auto-mapping fails.
 * This is a fallback for cases where:
 * - Email doesn't match our records
 * - Location name doesn't match
 * - New location not yet in our database
 */

import { Router } from 'express';
import { createMacMappings, getGHLConnection, getMacMappingsForLocation } from '../db/queries.js';

const router = Router();

/**
 * GET /setup/:locationId
 * 
 * Display the manual MAC address entry form
 */
router.get('/:locationId', async (req, res) => {
  const { locationId } = req.params;
  
  if (!locationId) {
    return res.status(400).send('Missing location ID');
  }
  
  // Get the GHL connection to show location name
  let connection = null;
  let existingMappings = [];
  
  try {
    connection = await getGHLConnection(locationId);
    existingMappings = await getMacMappingsForLocation(locationId);
  } catch (err) {
    console.error('Error fetching connection:', err);
  }
  
  const locationName = connection?.location_name || 'Your Location';
  
  res.send(`
    <html>
      <head>
        <title>Setup WiFi Devices - ${locationName}</title>
        <style>
          body { 
            font-family: -apple-system, sans-serif; 
            padding: 40px; 
            max-width: 700px; 
            margin: 0 auto;
            background: #f9fafb;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          h1 { color: #1f2937; margin-bottom: 10px; }
          .subtitle { color: #6b7280; margin-bottom: 30px; }
          .form-group { margin-bottom: 20px; }
          label { display: block; font-weight: 500; margin-bottom: 8px; color: #374151; }
          textarea { 
            width: 100%; 
            padding: 12px; 
            border: 1px solid #d1d5db; 
            border-radius: 6px; 
            font-family: monospace;
            font-size: 14px;
            min-height: 120px;
          }
          textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
          .help-text { font-size: 13px; color: #6b7280; margin-top: 8px; }
          .btn { 
            background: #3b82f6; 
            color: white; 
            padding: 12px 24px; 
            border: none;
            border-radius: 6px; 
            font-size: 16px;
            cursor: pointer;
            width: 100%;
          }
          .btn:hover { background: #2563eb; }
          .btn:disabled { background: #9ca3af; cursor: not-allowed; }
          .existing { 
            background: #f0fdf4; 
            border: 1px solid #86efac; 
            border-radius: 6px; 
            padding: 15px; 
            margin-bottom: 25px;
          }
          .existing h3 { color: #166534; margin: 0 0 10px 0; font-size: 14px; }
          .existing-mac { 
            font-family: monospace; 
            background: white; 
            padding: 4px 8px; 
            border-radius: 4px;
            display: inline-block;
            margin: 2px;
            font-size: 13px;
          }
          .example-box {
            background: #f3f4f6;
            border-radius: 6px;
            padding: 15px;
            margin: 15px 0;
          }
          .example-box code {
            display: block;
            font-family: monospace;
            color: #4b5563;
          }
          .success-message {
            background: #d1fae5;
            border: 1px solid #6ee7b7;
            color: #065f46;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            display: none;
          }
          .error-message {
            background: #fee2e2;
            border: 1px solid #fca5a5;
            color: #991b1b;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            display: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Setup WiFi Devices</h1>
          <p class="subtitle">Configure MAC addresses for <strong>${locationName}</strong></p>
          
          <div id="success-message" class="success-message"></div>
          <div id="error-message" class="error-message"></div>
          
          ${existingMappings.length > 0 ? `
            <div class="existing">
              <h3>✓ Currently Mapped Devices (${existingMappings.length})</h3>
              ${existingMappings.map(m => `<span class="existing-mac">${m.mac_address}</span>`).join('')}
            </div>
          ` : ''}
          
          <form id="setup-form">
            <input type="hidden" name="locationId" value="${locationId}" />
            
            <div class="form-group">
              <label for="macAddresses">MAC Addresses</label>
              <textarea 
                id="macAddresses" 
                name="macAddresses" 
                placeholder="Enter one MAC address per line..."
              ></textarea>
              <p class="help-text">
                Enter each MAC address on a new line. You can find the MAC address on your WiFi device 
                or in your network settings.
              </p>
              
              <div class="example-box">
                <strong>Example formats (all accepted):</strong>
                <code>00:18:0a:27:29:76</code>
                <code>00-18-0a-27-29-76</code>
                <code>00180a272976</code>
              </div>
            </div>
            
            <button type="submit" class="btn" id="submit-btn">Save MAC Addresses</button>
          </form>
          
          <p style="color: #9ca3af; font-size: 13px; margin-top: 25px; text-align: center;">
            Need help? Contact <a href="mailto:support@vivaspot.com">support@vivaspot.com</a>
          </p>
        </div>
        
        <script>
          const form = document.getElementById('setup-form');
          const submitBtn = document.getElementById('submit-btn');
          const successMsg = document.getElementById('success-message');
          const errorMsg = document.getElementById('error-message');
          
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
            successMsg.style.display = 'none';
            errorMsg.style.display = 'none';
            
            const formData = new FormData(form);
            const macAddresses = formData.get('macAddresses')
              .split('\\n')
              .map(mac => mac.trim())
              .filter(mac => mac.length > 0);
            
            if (macAddresses.length === 0) {
              errorMsg.textContent = 'Please enter at least one MAC address.';
              errorMsg.style.display = 'block';
              submitBtn.disabled = false;
              submitBtn.textContent = 'Save MAC Addresses';
              return;
            }
            
            try {
              const response = await fetch('/setup/${locationId}/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ macAddresses })
              });
              
              const result = await response.json();
              
              if (result.success) {
                successMsg.innerHTML = '✓ Successfully mapped <strong>' + result.mapped + '</strong> MAC address(es). Guest contacts will now sync to GoHighLevel!';
                successMsg.style.display = 'block';
                form.reset();
                
                // Reload to show updated existing mappings
                setTimeout(() => window.location.reload(), 2000);
              } else {
                throw new Error(result.error || 'Failed to save');
              }
            } catch (err) {
              errorMsg.textContent = 'Error: ' + err.message;
              errorMsg.style.display = 'block';
            }
            
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save MAC Addresses';
          });
        </script>
      </body>
    </html>
  `);
});

/**
 * POST /setup/:locationId/save
 * 
 * Save manually entered MAC addresses
 */
router.post('/:locationId/save', async (req, res) => {
  const { locationId } = req.params;
  const { macAddresses } = req.body;
  
  if (!locationId) {
    return res.status(400).json({ success: false, error: 'Missing location ID' });
  }
  
  if (!macAddresses || !Array.isArray(macAddresses) || macAddresses.length === 0) {
    return res.status(400).json({ success: false, error: 'No MAC addresses provided' });
  }
  
  // Validate and normalize MAC addresses
  const normalizedMacs = [];
  const invalidMacs = [];
  
  for (const mac of macAddresses) {
    const normalized = normalizeMacAddress(mac);
    if (normalized) {
      normalizedMacs.push(normalized);
    } else {
      invalidMacs.push(mac);
    }
  }
  
  if (invalidMacs.length > 0) {
    return res.status(400).json({ 
      success: false, 
      error: `Invalid MAC address format: ${invalidMacs.join(', ')}` 
    });
  }
  
  try {
    // Verify the GHL connection exists
    const connection = await getGHLConnection(locationId);
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        error: 'GHL location not found. Please complete OAuth first.' 
      });
    }
    
    // Create the mappings
    const mapped = await createMacMappings(locationId, normalizedMacs);
    
    console.log(`Manual setup: mapped ${mapped} MACs for location ${locationId}`);
    
    res.json({ success: true, mapped });
    
  } catch (error) {
    console.error('Manual setup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Normalize MAC address to standard format (lowercase, colons)
 * Returns null if invalid
 */
function normalizeMacAddress(mac) {
  if (!mac) return null;
  
  // Remove all separators and whitespace
  const cleaned = mac.replace(/[:\-\.\s]/g, '').toLowerCase();
  
  // Must be exactly 12 hex characters
  if (!/^[0-9a-f]{12}$/.test(cleaned)) {
    return null;
  }
  
  // Format as xx:xx:xx:xx:xx:xx
  return cleaned.match(/.{2}/g).join(':');
}

export default router;
