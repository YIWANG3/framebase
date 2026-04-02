SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS catalog_info (
        catalog_id INTEGER PRIMARY KEY CHECK (catalog_id = 1),
        catalog_path TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS catalog_roots (
        root_id TEXT PRIMARY KEY,
        root_type TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS assets (
        asset_id TEXT PRIMARY KEY,
        asset_type TEXT NOT NULL,
        canonical_path TEXT NOT NULL,
        stem TEXT NOT NULL,
        normalized_stem TEXT NOT NULL,
        stem_key TEXT NOT NULL,
        extension TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        modified_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        exists_on_disk INTEGER NOT NULL DEFAULT 1,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS asset_files (
        file_id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(asset_id) REFERENCES assets(asset_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS asset_links (
        link_id TEXT PRIMARY KEY,
        parent_asset_id TEXT NOT NULL,
        child_asset_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        recipe_json TEXT NOT NULL DEFAULT '{}',
        confidence REAL NOT NULL DEFAULT 1,
        confirmed_by TEXT,
        confirmed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(parent_asset_id, child_asset_id, relation_type),
        FOREIGN KEY(parent_asset_id) REFERENCES assets(asset_id),
        FOREIGN KEY(child_asset_id) REFERENCES assets(asset_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS raw_metadata_cache (
        raw_asset_id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        stem TEXT NOT NULL,
        normalized_stem TEXT NOT NULL,
        stem_key TEXT NOT NULL,
        capture_time TEXT,
        camera_model TEXT,
        lens_model TEXT,
        width INTEGER,
        height INTEGER,
        aspect_ratio REAL,
        file_size INTEGER NOT NULL,
        modified_time TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        metadata_level TEXT NOT NULL DEFAULT 'full',
        fingerprint_level TEXT NOT NULL DEFAULT 'head-tail',
        enrichment_status TEXT NOT NULL DEFAULT 'done',
        cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(raw_asset_id) REFERENCES assets(asset_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS export_lookup_registry (
        export_path TEXT PRIMARY KEY,
        export_asset_id TEXT NOT NULL,
        raw_asset_id TEXT,
        match_status TEXT NOT NULL,
        score REAL NOT NULL DEFAULT 0,
        resolver_version TEXT NOT NULL,
        feature_vector_json TEXT NOT NULL DEFAULT '{}',
        candidate_json TEXT NOT NULL DEFAULT '[]',
        confirmed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(export_asset_id) REFERENCES assets(asset_id),
        FOREIGN KEY(raw_asset_id) REFERENCES assets(asset_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        result_json TEXT NOT NULL DEFAULT '{}',
        progress REAL NOT NULL DEFAULT 0,
        error_text TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS preview_entries (
        cache_key TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(asset_id) REFERENCES assets(asset_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_roots_type ON catalog_roots(root_type)",
    "CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type)",
    "CREATE INDEX IF NOT EXISTS idx_assets_stem_key ON assets(stem_key)",
    "CREATE INDEX IF NOT EXISTS idx_assets_fingerprint ON assets(fingerprint)",
    "CREATE INDEX IF NOT EXISTS idx_asset_links_parent ON asset_links(parent_asset_id)",
    "CREATE INDEX IF NOT EXISTS idx_asset_links_child ON asset_links(child_asset_id)",
    "CREATE INDEX IF NOT EXISTS idx_raw_cache_stem_key ON raw_metadata_cache(stem_key)",
    "CREATE INDEX IF NOT EXISTS idx_raw_cache_capture_time ON raw_metadata_cache(capture_time)",
    "CREATE INDEX IF NOT EXISTS idx_registry_status ON export_lookup_registry(match_status)",
]
