/**
 * Setup Routes
 * 
 * Serves the configuration UI for mapping MAC addresses to GHL locations.
 */

import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

/**
 * GET /setup
 * 
 * Serves the setup page for configuring MAC address mappings.
 */
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/setup.html'));
});

export default router;
