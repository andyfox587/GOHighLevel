# VivaSpot → GoHighLevel Integration

Automatically sync guest contact information from VivaSpot WiFi captive portals to GoHighLevel CRM.

## Overview

This application connects your VivaSpot WiFi marketing system to GoHighLevel, enabling automatic contact synchronization when guests connect to your WiFi.

**How it works:**
1. Guest connects to WiFi and submits email via captive portal
2. Your existing n8n workflow captures the data
3. n8n sends the contact to this app via webhook
4. This app posts the contact to the correct GoHighLevel location
5. Contact appears in GHL CRM immediately, triggering your automations

## Features

- **OAuth 2.0 Integration** - Secure connection to GoHighLevel
- **Multi-Location Support** - Map multiple WiFi access points to one GHL account
- **Real-Time Sync** - Contacts sync instantly via webhook
- **Opt-In Filtering** - Only syncs contacts who opted in to marketing
- **Duplicate Prevention** - Tracks synced contacts to avoid duplicates

## Setup

### 1. Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

Or manually:
1. Fork this repository
2. Create a new Web Service on Render
3. Connect to your GitHub repo
4. Render will auto-detect `render.yaml` and configure everything

### 2. Register GHL App

1. Go to [GoHighLevel Marketplace](https://marketplace.gohighlevel.com/apps)
2. Create a new app
3. Set OAuth redirect URI to: `https://your-app.onrender.com/oauth/callback`
4. Request scopes: `contacts.write`, `contacts.readonly`, `locations.readonly`
5. Copy Client ID and Client Secret

### 3. Configure Environment Variables

In Render dashboard, set:
- `GHL_CLIENT_ID` - From GHL app settings
- `GHL_CLIENT_SECRET` - From GHL app settings  
- `GHL_REDIRECT_URI` - `https://your-app.onrender.com/oauth/callback`

### 4. Install in GoHighLevel

1. In GHL, go to Settings → Integrations → Marketplace
2. Find your app and click Install
3. Grant permissions
4. You'll be redirected to the setup page

### 5. Configure MAC Address Mappings

1. On the setup page, add your WiFi access point MAC addresses
2. Each MAC address maps to this GHL location
3. You can add multiple MACs (for venues with multiple APs)

### 6. Update n8n Workflow

Add an HTTP Request node after your Google Sheets node:

**Method:** POST  
**URL:** `https://your-app.onrender.com/webhook/contact`  
**Body (JSON):**
```json
{
  "mac": "{{ $json.MAC }}",
  "email": "{{ $json.Email }}",
  "name": "{{ $json.Name }}",
  "phone": "{{ $json.Mobile }}",
  "opt_in": "{{ $json.form?.opt_in_email }}"
}
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/oauth/authorize` | GET | Start OAuth flow |
| `/oauth/callback` | GET | OAuth callback |
| `/setup` | GET | Configuration UI |
| `/api/mappings/:locationId` | GET | Get MAC mappings |
| `/api/mappings` | POST | Add MAC mapping |
| `/api/mappings/:id` | DELETE | Remove mapping |
| `/webhook/contact` | POST | Receive contact from n8n |
| `/api/sync-status/:locationId` | GET | View sync logs |

## Webhook Payload

When n8n calls `/webhook/contact`, send:

```json
{
  "mac": "00:18:0A:36:1A:F8",
  "email": "guest@example.com",
  "name": "John Doe",
  "phone": "+15551234567",
  "opt_in": true
}
```

**Response:**
```json
{
  "status": "success",
  "ghl_contact_id": "abc123",
  "ghl_location_id": "xyz789",
  "processing_time_ms": 245
}
```

## Local Development

```bash
# Clone repo
git clone https://github.com/andyfox587/GOHighLevel.git
cd GOHighLevel

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your credentials

# Start local PostgreSQL (or use a cloud instance)
# Update DATABASE_URL in .env

# Run development server
npm run dev
```

## Project Structure

```
├── src/
│   ├── index.js           # Express app entry point
│   ├── routes/
│   │   ├── oauth.js       # OAuth flow
│   │   ├── setup.js       # Setup UI
│   │   ├── api.js         # REST API
│   │   └── webhook.js     # n8n webhook
│   ├── services/
│   │   ├── ghl.js         # GHL API client
│   │   └── sync.js        # Contact sync logic
│   └── db/
│       ├── connection.js  # PostgreSQL connection
│       ├── queries.js     # Query helpers
│       └── migrations/    # SQL schemas
├── public/
│   └── setup.html         # Setup UI
├── package.json
├── render.yaml            # Render config
└── README.md
```

## Support

For issues or questions, contact: andrew@vivaspot.com

## License

MIT
