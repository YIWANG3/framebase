from __future__ import annotations

import json
import os
import sqlite3
from hashlib import sha1
from pathlib import Path
from uuid import uuid4

from .models import ExportCandidate, MatchDecision, RawMetadata
from .schema import SCHEMA_STATEMENTS

RESOLVER_VERSION = "reverse_lookup_v3_embedded_metadata"
SCHEMA_VERSION = 2


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, timeout=5.0)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout=5000")
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def init_db(connection: sqlite3.Connection) -> None:
    for statement in SCHEMA_STATEMENTS:
        connection.execute(statement)
    _ensure_column(connection, "raw_metadata_cache", "metadata_level", "TEXT NOT NULL DEFAULT 'full'")
    _ensure_column(connection, "raw_metadata_cache", "fingerprint_level", "TEXT NOT NULL DEFAULT 'head-tail'")
    _ensure_column(connection, "raw_metadata_cache", "enrichment_status", "TEXT NOT NULL DEFAULT 'done'")
    _ensure_column(connection, "jobs", "result_json", "TEXT NOT NULL DEFAULT '{}'")
    connection.execute(
        """
        INSERT INTO catalog_info (catalog_id, catalog_path, schema_version)
        VALUES (1, '', ?)
        ON CONFLICT(catalog_id) DO UPDATE SET
            schema_version = excluded.schema_version,
            updated_at = CURRENT_TIMESTAMP
        """,
        (SCHEMA_VERSION,),
    )
    connection.commit()


def _ensure_column(connection: sqlite3.Connection, table_name: str, column_name: str, column_spec: str) -> None:
    columns = {
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    }
    if column_name in columns:
        return
    connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_spec}")


def set_catalog_path(connection: sqlite3.Connection, catalog_path: Path) -> None:
    connection.execute(
        """
        UPDATE catalog_info
        SET catalog_path = ?, updated_at = CURRENT_TIMESTAMP
        WHERE catalog_id = 1
        """,
        (str(catalog_path.resolve()),),
    )
    connection.commit()


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True)


def _file_id(asset_id: str, path: str) -> str:
    digest = sha1(path.encode("utf-8")).hexdigest()[:16]
    return f"file_{asset_id}_{digest}"


def _link_id(parent_asset_id: str, child_asset_id: str, relation_type: str) -> str:
    digest = sha1(f"{parent_asset_id}:{child_asset_id}:{relation_type}".encode("utf-8")).hexdigest()[:20]
    return f"link_{digest}"


def upsert_catalog_root(connection: sqlite3.Connection, root_type: str, path: Path, commit: bool = True) -> None:
    digest = sha1(f"{root_type}:{path.resolve()}".encode("utf-8")).hexdigest()[:20]
    connection.execute(
        """
        INSERT INTO catalog_roots (root_id, root_type, path)
        VALUES (?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
            root_type = excluded.root_type,
            is_active = 1,
            updated_at = CURRENT_TIMESTAMP
        """,
        (f"root_{digest}", root_type, str(path.resolve())),
    )
    if commit:
        connection.commit()


def list_catalog_roots(connection: sqlite3.Connection) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT root_id, root_type, path, is_active, created_at, updated_at
        FROM catalog_roots
        WHERE is_active = 1
        ORDER BY root_type, path
        """
    ).fetchall()


def _job_id(job_type: str) -> str:
    return f"job_{job_type}_{uuid4().hex[:20]}"


def _decode_job_row(row: sqlite3.Row | None) -> dict[str, object] | None:
    if row is None:
        return None
    return {
        "job_id": row["job_id"],
        "job_type": row["job_type"],
        "status": row["status"],
        "payload": json.loads(row["payload_json"] or "{}"),
        "result": json.loads(row["result_json"] or "{}"),
        "progress": float(row["progress"] or 0),
        "error": row["error_text"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def create_job(
    connection: sqlite3.Connection,
    job_type: str,
    payload: dict[str, object] | None = None,
    *,
    status: str = "queued",
    progress: float = 0.0,
    result: dict[str, object] | None = None,
    commit: bool = True,
) -> dict[str, object]:
    job_id = _job_id(job_type)
    connection.execute(
        """
        INSERT INTO jobs (job_id, job_type, status, payload_json, result_json, progress)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (job_id, job_type, status, _json(payload or {}), _json(result or {}), progress),
    )
    if commit:
        connection.commit()
    return get_job(connection, job_id) or {}


def update_job(
    connection: sqlite3.Connection,
    job_id: str,
    *,
    status: str | None = None,
    payload: dict[str, object] | None = None,
    result: dict[str, object] | None = None,
    progress: float | None = None,
    error_text: str | None = None,
    commit: bool = True,
) -> dict[str, object]:
    assignments: list[str] = ["updated_at = CURRENT_TIMESTAMP"]
    params: list[object] = []
    if status is not None:
        assignments.append("status = ?")
        params.append(status)
    if payload is not None:
        assignments.append("payload_json = ?")
        params.append(_json(payload))
    if result is not None:
        assignments.append("result_json = ?")
        params.append(_json(result))
    if progress is not None:
        assignments.append("progress = ?")
        params.append(progress)
    if error_text is not None:
        assignments.append("error_text = ?")
        params.append(error_text)
    params.append(job_id)
    connection.execute(
        f"UPDATE jobs SET {', '.join(assignments)} WHERE job_id = ?",
        tuple(params),
    )
    if commit:
        connection.commit()
    return get_job(connection, job_id) or {}


def get_job(connection: sqlite3.Connection, job_id: str) -> dict[str, object] | None:
    row = connection.execute(
        """
        SELECT job_id, job_type, status, payload_json, result_json, progress, error_text, created_at, updated_at
        FROM jobs
        WHERE job_id = ?
        """,
        (job_id,),
    ).fetchone()
    return _decode_job_row(row)


def get_latest_job(connection: sqlite3.Connection, job_type: str | None = None) -> dict[str, object] | None:
    if job_type:
        row = connection.execute(
            """
            SELECT job_id, job_type, status, payload_json, result_json, progress, error_text, created_at, updated_at
            FROM jobs
            WHERE job_type = ?
            ORDER BY created_at DESC, job_id DESC
            LIMIT 1
            """,
            (job_type,),
        ).fetchone()
    else:
        row = connection.execute(
            """
            SELECT job_id, job_type, status, payload_json, result_json, progress, error_text, created_at, updated_at
            FROM jobs
            ORDER BY created_at DESC, job_id DESC
            LIMIT 1
            """
        ).fetchone()
    return _decode_job_row(row)


def list_jobs(connection: sqlite3.Connection, job_type: str | None = None, limit: int = 20) -> list[dict[str, object]]:
    if job_type:
        rows = connection.execute(
            """
            SELECT job_id, job_type, status, payload_json, result_json, progress, error_text, created_at, updated_at
            FROM jobs
            WHERE job_type = ?
            ORDER BY created_at DESC, job_id DESC
            LIMIT ?
            """,
            (job_type, limit),
        ).fetchall()
    else:
        rows = connection.execute(
            """
            SELECT job_id, job_type, status, payload_json, result_json, progress, error_text, created_at, updated_at
            FROM jobs
            ORDER BY created_at DESC, job_id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [_decode_job_row(row) for row in rows if row is not None]


def upsert_raw_asset(connection: sqlite3.Connection, metadata: RawMetadata, commit: bool = True) -> None:
    asset_metadata = {
        "capture_time": metadata.capture_time,
        "camera_model": metadata.camera_model,
        "lens_model": metadata.lens_model,
        "width": metadata.width,
        "height": metadata.height,
        "normalized_stem": metadata.normalized_stem,
        "stem_key": metadata.stem_key,
        "file_size": metadata.file_size,
        "modified_time": metadata.modified_time,
        "metadata_level": metadata.metadata_level,
        "fingerprint_level": metadata.fingerprint_level,
        "enrichment_status": metadata.enrichment_status,
    }
    connection.execute(
        """
        INSERT INTO assets (
            asset_id, asset_type, canonical_path, stem, normalized_stem, stem_key, extension,
            fingerprint, file_size, modified_time, metadata_json
        ) VALUES (?, 'raw', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(asset_id) DO UPDATE SET
            canonical_path = excluded.canonical_path,
            stem = excluded.stem,
            normalized_stem = excluded.normalized_stem,
            stem_key = excluded.stem_key,
            extension = excluded.extension,
            fingerprint = excluded.fingerprint,
            file_size = excluded.file_size,
            modified_time = excluded.modified_time,
            metadata_json = excluded.metadata_json,
            exists_on_disk = 1,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            metadata.asset_id,
            str(metadata.path),
            metadata.stem,
            metadata.normalized_stem,
            metadata.stem_key,
            metadata.extension,
            metadata.fingerprint,
            metadata.file_size,
            metadata.modified_time,
            _json(asset_metadata),
        ),
    )
    connection.execute(
        """
        INSERT INTO asset_files (file_id, asset_id, path, role)
        VALUES (?, ?, ?, 'primary')
        ON CONFLICT(path) DO UPDATE SET
            asset_id = excluded.asset_id,
            role = excluded.role
        """,
        (_file_id(metadata.asset_id, str(metadata.path)), metadata.asset_id, str(metadata.path)),
    )
    connection.execute(
        """
        INSERT INTO raw_metadata_cache (
            raw_asset_id, path, stem, normalized_stem, stem_key, capture_time, camera_model,
            lens_model, width, height, aspect_ratio, file_size, modified_time, fingerprint,
            metadata_level, fingerprint_level, enrichment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(raw_asset_id) DO UPDATE SET
            path = excluded.path,
            stem = excluded.stem,
            normalized_stem = excluded.normalized_stem,
            stem_key = excluded.stem_key,
            capture_time = excluded.capture_time,
            camera_model = excluded.camera_model,
            lens_model = excluded.lens_model,
            width = excluded.width,
            height = excluded.height,
            aspect_ratio = excluded.aspect_ratio,
            file_size = excluded.file_size,
            modified_time = excluded.modified_time,
            fingerprint = excluded.fingerprint,
            metadata_level = excluded.metadata_level,
            fingerprint_level = excluded.fingerprint_level,
            enrichment_status = excluded.enrichment_status,
            cached_at = CURRENT_TIMESTAMP
        """,
        (
            metadata.asset_id,
            str(metadata.path),
            metadata.stem,
            metadata.normalized_stem,
            metadata.stem_key,
            metadata.capture_time,
            metadata.camera_model,
            metadata.lens_model,
            metadata.width,
            metadata.height,
            metadata.aspect_ratio,
            metadata.file_size,
            metadata.modified_time,
            metadata.fingerprint,
            metadata.metadata_level,
            metadata.fingerprint_level,
            metadata.enrichment_status,
        ),
    )
    if commit:
        connection.commit()


def upsert_export_asset(connection: sqlite3.Connection, export: ExportCandidate, commit: bool = True) -> str:
    existing = connection.execute(
        "SELECT asset_id FROM asset_files WHERE path = ?",
        (str(export.path),),
    ).fetchone()
    asset_id = str(existing["asset_id"]) if existing else export.asset_id
    asset_metadata = {
        "capture_time": export.capture_time,
        "camera_model": export.camera_model,
        "lens_model": export.lens_model,
        "width": export.width,
        "height": export.height,
        "normalized_stem": export.normalized_stem,
        "stem_key": export.stem_key,
        "file_size": export.file_size,
        "modified_time": export.modified_time,
    }
    connection.execute(
        """
        INSERT INTO assets (
            asset_id, asset_type, canonical_path, stem, normalized_stem, stem_key, extension,
            fingerprint, file_size, modified_time, metadata_json
        ) VALUES (?, 'export', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(asset_id) DO UPDATE SET
            canonical_path = excluded.canonical_path,
            stem = excluded.stem,
            normalized_stem = excluded.normalized_stem,
            stem_key = excluded.stem_key,
            extension = excluded.extension,
            fingerprint = excluded.fingerprint,
            file_size = excluded.file_size,
            modified_time = excluded.modified_time,
            metadata_json = excluded.metadata_json,
            exists_on_disk = 1,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            asset_id,
            str(export.path),
            export.stem,
            export.normalized_stem,
            export.stem_key,
            export.extension,
            export.fingerprint,
            export.file_size,
            export.modified_time,
            _json(asset_metadata),
        ),
    )
    connection.execute(
        """
        INSERT INTO asset_files (file_id, asset_id, path, role)
        VALUES (?, ?, ?, 'primary')
        ON CONFLICT(path) DO UPDATE SET
            asset_id = excluded.asset_id,
            role = excluded.role
        """,
        (_file_id(asset_id, str(export.path)), asset_id, str(export.path)),
    )
    if commit:
        connection.commit()
    return asset_id


def upsert_registry(connection: sqlite3.Connection, decision: MatchDecision, commit: bool = True) -> None:
    connection.execute(
        """
        INSERT INTO export_lookup_registry (
            export_path, export_asset_id, raw_asset_id, match_status, score, resolver_version,
            feature_vector_json, candidate_json, confirmed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IN ('auto_bound', 'manual_confirmed') THEN CURRENT_TIMESTAMP END)
        ON CONFLICT(export_path) DO UPDATE SET
            export_asset_id = excluded.export_asset_id,
            raw_asset_id = excluded.raw_asset_id,
            match_status = excluded.match_status,
            score = excluded.score,
            resolver_version = excluded.resolver_version,
            feature_vector_json = excluded.feature_vector_json,
            candidate_json = excluded.candidate_json,
            confirmed_at = CASE
                WHEN excluded.match_status IN ('auto_bound', 'manual_confirmed') THEN CURRENT_TIMESTAMP
                ELSE export_lookup_registry.confirmed_at
            END,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            str(decision.export_path),
            decision.export_asset_id,
            decision.raw_asset_id,
            decision.status,
            decision.score,
            RESOLVER_VERSION,
            _json(decision.feature_vector),
            _json(decision.ranked_candidates),
            decision.status,
        ),
    )
    if decision.raw_asset_id and decision.status in {"auto_bound", "manual_confirmed"}:
        link_assets(
            connection,
            parent_asset_id=decision.raw_asset_id,
            child_asset_id=decision.export_asset_id,
            relation_type="source_of",
            confidence=decision.score,
            confirmed_by="system" if decision.status == "auto_bound" else "user",
        )
    if commit:
        connection.commit()


def link_assets(
    connection: sqlite3.Connection,
    parent_asset_id: str,
    child_asset_id: str,
    relation_type: str,
    confidence: float,
    confirmed_by: str,
    recipe_json: dict[str, object] | None = None,
) -> None:
    connection.execute(
        """
        INSERT INTO asset_links (
            link_id, parent_asset_id, child_asset_id, relation_type, recipe_json,
            confidence, confirmed_by, confirmed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(parent_asset_id, child_asset_id, relation_type) DO UPDATE SET
            recipe_json = excluded.recipe_json,
            confidence = excluded.confidence,
            confirmed_by = excluded.confirmed_by,
            confirmed_at = CURRENT_TIMESTAMP
        """,
        (
            _link_id(parent_asset_id, child_asset_id, relation_type),
            parent_asset_id,
            child_asset_id,
            relation_type,
            _json(recipe_json or {}),
            confidence,
            confirmed_by,
        ),
    )


def get_registry(connection: sqlite3.Connection, export_path: Path) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM export_lookup_registry WHERE export_path = ?",
        (str(export_path.resolve()),),
    ).fetchone()


def load_raw_cache(connection: sqlite3.Connection, limit: int = 200) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT *
        FROM raw_metadata_cache
        ORDER BY cached_at DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()


def load_raw_candidates(connection: sqlite3.Connection, stem_key: str, limit: int = 200) -> list[sqlite3.Row]:
    rows = connection.execute(
        """
        SELECT *
        FROM raw_metadata_cache
        WHERE stem_key = ?
        ORDER BY cached_at DESC
        LIMIT ?
        """,
        (stem_key, limit),
    ).fetchall()
    if rows:
        return rows
    return connection.execute(
        """
        SELECT *
        FROM raw_metadata_cache
        WHERE normalized_stem LIKE ?
        ORDER BY cached_at DESC
        LIMIT ?
        """,
        (f"{stem_key}%", limit),
    ).fetchall()


def load_raw_candidates_by_camera_token(
    connection: sqlite3.Connection,
    token: str,
    limit: int = 200,
) -> list[sqlite3.Row]:
    rows = connection.execute(
        """
        SELECT *
        FROM raw_metadata_cache
        WHERE stem_key = ?
        ORDER BY cached_at DESC
        LIMIT ?
        """,
        (token, limit),
    ).fetchall()
    if rows:
        return rows
    return connection.execute(
        """
        SELECT *
        FROM raw_metadata_cache
        WHERE normalized_stem LIKE ?
        ORDER BY cached_at DESC
        LIMIT ?
        """,
        (f"{token}%", limit),
    ).fetchall()


def load_raw_candidates_by_capture_window(
    connection: sqlite3.Connection,
    capture_time: str,
    *,
    camera_model: str | None = None,
    limit: int = 200,
) -> list[sqlite3.Row]:
    if camera_model:
        rows = connection.execute(
            """
            SELECT *
            FROM raw_metadata_cache
            WHERE camera_model = ?
              AND capture_time IS NOT NULL
            ORDER BY ABS(julianday(capture_time) - julianday(?)) ASC, cached_at DESC
            LIMIT ?
            """,
            (camera_model, capture_time, limit),
        ).fetchall()
        if rows:
            return rows
    return connection.execute(
        """
        SELECT *
        FROM raw_metadata_cache
        WHERE capture_time IS NOT NULL
        ORDER BY ABS(julianday(capture_time) - julianday(?)) ASC, cached_at DESC
        LIMIT ?
        """,
        (capture_time, limit),
    ).fetchall()


def load_raw_candidates_by_camera(connection: sqlite3.Connection, camera_model: str, limit: int = 200) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT *
        FROM raw_metadata_cache
        WHERE camera_model = ?
        ORDER BY cached_at DESC
        LIMIT ?
        """,
        (camera_model, limit),
    ).fetchall()


def load_raw_cache_index(connection: sqlite3.Connection, root: Path | None = None) -> dict[str, tuple[int, str]]:
    if root is None:
        rows = connection.execute(
            "SELECT path, file_size, modified_time FROM raw_metadata_cache"
        ).fetchall()
    else:
        rows = connection.execute(
            """
            SELECT path, file_size, modified_time
            FROM raw_metadata_cache
            WHERE path LIKE ?
            """,
            (f"{str(root.resolve())}%",),
        ).fetchall()
    return {row["path"]: (int(row["file_size"]), str(row["modified_time"])) for row in rows}


def load_raw_enrichment_candidates(
    connection: sqlite3.Connection,
    roots: list[Path] | None = None,
    limit: int | None = None,
) -> list[sqlite3.Row]:
    query = [
        """
        SELECT *
        FROM raw_metadata_cache
        WHERE (metadata_level != 'full' OR enrichment_status != 'done')
        """
    ]
    params: list[object] = []
    if roots:
        predicates = []
        for root in roots:
            predicates.append("path LIKE ?")
            params.append(f"{str(root.resolve())}%")
        query.append(f"AND ({' OR '.join(predicates)})")
    query.append("ORDER BY cached_at ASC")
    if limit is not None:
        query.append("LIMIT ?")
        params.append(limit)
    return connection.execute("\n".join(query), params).fetchall()


def list_assets_for_preview(
    connection: sqlite3.Connection,
    asset_type: str | None = None,
    kind: str = "preview",
    limit: int | None = None,
    paths: list[Path] | None = None,
):
    query = [
        """
        SELECT
            assets.asset_id,
            assets.asset_type,
            assets.canonical_path,
            assets.extension,
            json_extract(assets.metadata_json, '$.width') AS width,
            json_extract(assets.metadata_json, '$.height') AS height,
            preview_entries.relative_path AS existing_relative_path,
            preview_entries.status AS existing_status
        FROM assets
        LEFT JOIN preview_entries
            ON preview_entries.asset_id = assets.asset_id
           AND preview_entries.kind = ?
        WHERE assets.exists_on_disk = 1
        """
    ]
    params: list[object] = [kind]
    if asset_type:
        query.append("AND assets.asset_type = ?")
        params.append(asset_type)
    if paths:
        path_clauses: list[str] = []
        for target_path in paths:
            resolved = target_path.resolve()
            if resolved.is_dir():
                path_clauses.append("(assets.canonical_path = ? OR assets.canonical_path LIKE ?)")
                params.append(str(resolved))
                params.append(f"{resolved}{os.sep}%")
            else:
                path_clauses.append("assets.canonical_path = ?")
                params.append(str(resolved))
        if path_clauses:
            query.append(f"AND ({' OR '.join(path_clauses)})")
    query.append(
        """
        ORDER BY
            CASE WHEN preview_entries.relative_path IS NULL OR preview_entries.status != 'ready' THEN 0 ELSE 1 END,
            assets.asset_type,
            assets.stem
        """
    )
    if limit is not None:
        query.append("LIMIT ?")
        params.append(limit)
    return connection.execute("\n".join(query), params).fetchall()


def upsert_preview_entry(
    connection: sqlite3.Connection,
    asset_id: str,
    kind: str,
    relative_path: str,
    width: int | None,
    height: int | None,
    status: str,
    commit: bool = True,
) -> None:
    cache_key = sha1(f"{asset_id}:{kind}".encode("utf-8")).hexdigest()[:20]
    connection.execute(
        """
        INSERT INTO preview_entries (cache_key, asset_id, kind, relative_path, width, height, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
            relative_path = excluded.relative_path,
            width = excluded.width,
            height = excluded.height,
            status = excluded.status,
            updated_at = CURRENT_TIMESTAMP
        """,
        (f"preview_{cache_key}", asset_id, kind, relative_path, width, height, status),
    )
    if commit:
        connection.commit()


def list_export_assets(
    connection: sqlite3.Connection,
    status: str,
    limit: int = 120,
    offset: int = 0,
) -> list[sqlite3.Row]:
    if status == "matched":
        status_clause = "registry.match_status IN ('auto_bound', 'manual_confirmed')"
    elif status == "unmatched":
        status_clause = "registry.match_status = 'unmatched'"
    elif status == "all":
        status_clause = "registry.match_status IN ('auto_bound', 'manual_confirmed', 'unmatched')"
    else:
        raise ValueError(f"unsupported status: {status}")

    return connection.execute(
        f"""
        SELECT
            assets.asset_id,
            assets.stem,
            assets.canonical_path AS export_path,
            assets.metadata_json AS export_metadata_json,
            registry.match_status,
            registry.score,
            registry.raw_asset_id,
            raw_assets.canonical_path AS raw_path,
            raw_assets.metadata_json AS raw_metadata_json,
            preview_entries.relative_path AS preview_relative_path
        FROM assets
        LEFT JOIN export_lookup_registry AS registry
            ON registry.export_asset_id = assets.asset_id
        LEFT JOIN assets AS raw_assets
            ON raw_assets.asset_id = registry.raw_asset_id
        LEFT JOIN preview_entries
            ON preview_entries.asset_id = assets.asset_id
           AND preview_entries.kind = 'preview'
           AND preview_entries.status = 'ready'
        WHERE assets.asset_type = 'export'
          AND {status_clause}
        ORDER BY assets.stem, assets.canonical_path
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    ).fetchall()


def get_export_asset_detail(connection: sqlite3.Connection, asset_id: str) -> sqlite3.Row | None:
    return connection.execute(
        """
        SELECT
            assets.asset_id,
            assets.stem,
            assets.canonical_path AS export_path,
            assets.metadata_json AS export_metadata_json,
            registry.match_status,
            registry.score,
            registry.raw_asset_id,
            registry.feature_vector_json,
            registry.candidate_json,
            raw_assets.canonical_path AS raw_path,
            raw_assets.metadata_json AS raw_metadata_json,
            export_preview.relative_path AS export_preview_relative_path,
            raw_preview.relative_path AS raw_preview_relative_path
        FROM assets
        LEFT JOIN export_lookup_registry AS registry
            ON registry.export_asset_id = assets.asset_id
        LEFT JOIN assets AS raw_assets
            ON raw_assets.asset_id = registry.raw_asset_id
        LEFT JOIN preview_entries AS export_preview
            ON export_preview.asset_id = assets.asset_id
           AND export_preview.kind = 'preview'
           AND export_preview.status = 'ready'
        LEFT JOIN preview_entries AS raw_preview
            ON raw_preview.asset_id = registry.raw_asset_id
           AND raw_preview.kind = 'preview'
           AND raw_preview.status = 'ready'
        WHERE assets.asset_id = ?
          AND assets.asset_type = 'export'
        """,
        (asset_id,),
    ).fetchone()


def list_pending(connection: sqlite3.Connection) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT export_path, export_asset_id, score, candidate_json
        FROM export_lookup_registry
        WHERE match_status = 'pending_confirmation'
        ORDER BY updated_at DESC
        """
    ).fetchall()


def confirm_match(connection: sqlite3.Connection, export_path: Path, raw_asset_id: str) -> None:
    registry = get_registry(connection, export_path)
    if registry is None:
        raise ValueError(f"no registry entry for {export_path}")

    connection.execute(
        """
        UPDATE export_lookup_registry
        SET raw_asset_id = ?, match_status = 'manual_confirmed', confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE export_path = ?
        """,
        (raw_asset_id, str(export_path.resolve())),
    )
    link_assets(
        connection,
        parent_asset_id=raw_asset_id,
        child_asset_id=registry["export_asset_id"],
        relation_type="source_of",
        confidence=max(float(registry["score"]), 0.7),
        confirmed_by="user",
    )
    connection.commit()


def cleanup_orphan_export_assets(connection: sqlite3.Connection, commit: bool = True) -> dict[str, int]:
    orphan_rows = connection.execute(
        """
        SELECT orphan.asset_id AS orphan_asset_id, active.asset_id AS active_asset_id
        FROM assets AS orphan
        JOIN assets AS active
            ON active.asset_type = 'export'
           AND active.canonical_path = orphan.canonical_path
        JOIN asset_files AS active_files
            ON active_files.asset_id = active.asset_id
           AND active_files.path = active.canonical_path
        LEFT JOIN asset_files AS orphan_files
            ON orphan_files.asset_id = orphan.asset_id
        WHERE orphan.asset_type = 'export'
          AND orphan.asset_id != active.asset_id
          AND orphan_files.asset_id IS NULL
        ORDER BY orphan.canonical_path, orphan.asset_id
        """
    ).fetchall()
    metrics = {
        "found": len(orphan_rows),
        "deleted": 0,
        "previews_migrated": 0,
        "registry_relinked": 0,
        "links_relinked": 0,
    }

    for row in orphan_rows:
        orphan_asset_id = str(row["orphan_asset_id"])
        active_asset_id = str(row["active_asset_id"])

        preview_rows = connection.execute(
            """
            SELECT kind, relative_path, width, height, status
            FROM preview_entries
            WHERE asset_id = ?
            """,
            (orphan_asset_id,),
        ).fetchall()
        for preview in preview_rows:
            upsert_preview_entry(
                connection,
                active_asset_id,
                kind=str(preview["kind"]),
                relative_path=str(preview["relative_path"]),
                width=preview["width"],
                height=preview["height"],
                status=str(preview["status"]),
                commit=False,
            )
            metrics["previews_migrated"] += 1
        connection.execute("DELETE FROM preview_entries WHERE asset_id = ?", (orphan_asset_id,))

        metrics["registry_relinked"] += connection.execute(
            """
            UPDATE export_lookup_registry
            SET export_asset_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE export_asset_id = ?
            """,
            (active_asset_id, orphan_asset_id),
        ).rowcount

        link_rows = connection.execute(
            """
            SELECT link_id, parent_asset_id, child_asset_id, relation_type, recipe_json,
                   confidence, confirmed_by, confirmed_at
            FROM asset_links
            WHERE parent_asset_id = ? OR child_asset_id = ?
            """,
            (orphan_asset_id, orphan_asset_id),
        ).fetchall()
        for link in link_rows:
            parent_asset_id = active_asset_id if link["parent_asset_id"] == orphan_asset_id else str(link["parent_asset_id"])
            child_asset_id = active_asset_id if link["child_asset_id"] == orphan_asset_id else str(link["child_asset_id"])
            if parent_asset_id == child_asset_id:
                continue
            connection.execute(
                """
                INSERT INTO asset_links (
                    link_id, parent_asset_id, child_asset_id, relation_type, recipe_json,
                    confidence, confirmed_by, confirmed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(parent_asset_id, child_asset_id, relation_type) DO UPDATE SET
                    recipe_json = excluded.recipe_json,
                    confidence = excluded.confidence,
                    confirmed_by = excluded.confirmed_by,
                    confirmed_at = COALESCE(asset_links.confirmed_at, excluded.confirmed_at)
                """,
                (
                    _link_id(parent_asset_id, child_asset_id, str(link["relation_type"])),
                    parent_asset_id,
                    child_asset_id,
                    str(link["relation_type"]),
                    str(link["recipe_json"]),
                    float(link["confidence"]),
                    link["confirmed_by"],
                    link["confirmed_at"],
                ),
            )
            metrics["links_relinked"] += 1
        connection.execute(
            "DELETE FROM asset_links WHERE parent_asset_id = ? OR child_asset_id = ?",
            (orphan_asset_id, orphan_asset_id),
        )

        connection.execute("DELETE FROM assets WHERE asset_id = ?", (orphan_asset_id,))
        metrics["deleted"] += 1

    if commit:
        connection.commit()
    return metrics


def summary(connection: sqlite3.Connection) -> dict[str, int]:
    return {
        "assets": connection.execute(
            """
            SELECT COUNT(DISTINCT asset_files.asset_id)
            FROM asset_files
            JOIN assets ON assets.asset_id = asset_files.asset_id
            WHERE assets.exists_on_disk = 1
            """
        ).fetchone()[0],
        "raw_assets": connection.execute(
            """
            SELECT COUNT(DISTINCT asset_files.asset_id)
            FROM asset_files
            JOIN assets ON assets.asset_id = asset_files.asset_id
            WHERE assets.asset_type = 'raw' AND assets.exists_on_disk = 1
            """
        ).fetchone()[0],
        "export_assets": connection.execute(
            """
            SELECT COUNT(DISTINCT asset_files.asset_id)
            FROM asset_files
            JOIN assets ON assets.asset_id = asset_files.asset_id
            WHERE assets.asset_type = 'export' AND assets.exists_on_disk = 1
            """
        ).fetchone()[0],
        "roots": connection.execute("SELECT COUNT(*) FROM catalog_roots WHERE is_active = 1").fetchone()[0],
        "preview_ready": connection.execute(
            "SELECT COUNT(*) FROM preview_entries WHERE kind = 'preview' AND status = 'ready'"
        ).fetchone()[0],
        "proxy_ready": connection.execute(
            "SELECT COUNT(*) FROM preview_entries WHERE kind = 'proxy' AND status = 'ready'"
        ).fetchone()[0],
        "pending_matches": connection.execute(
            "SELECT COUNT(*) FROM export_lookup_registry WHERE match_status = 'pending_confirmation'"
        ).fetchone()[0],
        "confirmed_matches": connection.execute(
            "SELECT COUNT(*) FROM export_lookup_registry WHERE match_status IN ('auto_bound', 'manual_confirmed')"
        ).fetchone()[0],
        "unmatched_exports": connection.execute(
            "SELECT COUNT(*) FROM export_lookup_registry WHERE match_status = 'unmatched'"
        ).fetchone()[0],
        "raw_fast_only": connection.execute(
            "SELECT COUNT(*) FROM raw_metadata_cache WHERE metadata_level != 'full' OR enrichment_status != 'done'"
        ).fetchone()[0],
        "raw_enriched": connection.execute(
            "SELECT COUNT(*) FROM raw_metadata_cache WHERE metadata_level = 'full' AND enrichment_status = 'done'"
        ).fetchone()[0],
    }
