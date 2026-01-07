-- ============================================================
-- VivaSpot → GoHighLevel Integration
-- Initial Database Schema
-- ============================================================

-- Table: ghl_connections
-- Stores OAuth tokens after GHL marketplace installation
CREATE TABLE IF NOT EXISTS ghl_connections (
    id                  SERIAL PRIMARY KEY,
    ghl_location_id     VARCHAR(50) UNIQUE NOT NULL,
    ghl_company_id      VARCHAR(50),
    access_token        TEXT NOT NULL,
    refresh_token       TEXT NOT NULL,
    token_expires_at    TIMESTAMP NOT NULL,
    installed_at        TIMESTAMP DEFAULT NOW(),
    is_active           BOOLEAN DEFAULT TRUE,
    
    CONSTRAINT ghl_location_id_not_empty CHECK (ghl_location_id <> '')
);

CREATE INDEX IF NOT EXISTS idx_ghl_connections_active 
    ON ghl_connections(is_active);

-- Table: location_mappings
-- Maps GHL locations to VivaSpot MAC addresses
-- Supports multiple MACs per GHL location (multi-AP venues)
CREATE TABLE IF NOT EXISTS location_mappings (
    id                  SERIAL PRIMARY KEY,
    ghl_location_id     VARCHAR(50) NOT NULL 
                        REFERENCES ghl_connections(ghl_location_id) ON DELETE CASCADE,
    vivaspot_mac        VARCHAR(17) NOT NULL,
    vivaspot_location   VARCHAR(100),
    created_at          TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(ghl_location_id, vivaspot_mac)
);

CREATE INDEX IF NOT EXISTS idx_location_mappings_ghl 
    ON location_mappings(ghl_location_id);

CREATE INDEX IF NOT EXISTS idx_location_mappings_mac 
    ON location_mappings(vivaspot_mac);

-- Table: sync_log
-- Tracks sync history for debugging and monitoring
CREATE TABLE IF NOT EXISTS sync_log (
    id                      SERIAL PRIMARY KEY,
    ghl_location_id         VARCHAR(50) NOT NULL
                            REFERENCES ghl_connections(ghl_location_id) ON DELETE CASCADE,
    vivaspot_mac            VARCHAR(17),
    contact_email           VARCHAR(255),
    sync_type               VARCHAR(20) DEFAULT 'webhook',
    status                  VARCHAR(20) DEFAULT 'success',
    ghl_contact_id          VARCHAR(50),
    error_message           TEXT,
    synced_at               TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_location 
    ON sync_log(ghl_location_id);

CREATE INDEX IF NOT EXISTS idx_sync_log_timestamp 
    ON sync_log(synced_at);

-- Table: synced_contacts
-- Prevents duplicate contact creation in GHL
CREATE TABLE IF NOT EXISTS synced_contacts (
    id                      SERIAL PRIMARY KEY,
    ghl_location_id         VARCHAR(50) NOT NULL,
    contact_email           VARCHAR(255) NOT NULL,
    ghl_contact_id          VARCHAR(50),
    synced_at               TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(ghl_location_id, contact_email)
);

CREATE INDEX IF NOT EXISTS idx_synced_contacts_lookup 
    ON synced_contacts(ghl_location_id, contact_email);
