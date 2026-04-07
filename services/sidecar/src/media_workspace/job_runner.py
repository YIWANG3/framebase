from __future__ import annotations

from pathlib import Path

from .catalog import ensure_catalog
from .config import Thresholds
from .db import update_job
from .preview_service import PreviewService
from .reverse_lookup import resolve_export_batch
from .scanner import enrich_raw_assets, scan_raw_directory


def _fraction(processed: int | None, total: int | None) -> float:
    if not total:
        return 0.0
    return max(0.0, min(1.0, float(processed or 0) / float(total)))


def _scan_fraction(update: dict[str, int | str]) -> float:
    discovered = int(update.get("discovered", 0) or 0)
    processed = int(update.get("processed", 0) or 0)
    if discovered <= 0:
        return 0.0
    return max(0.0, min(0.99, float(processed) / float(discovered)))


def _phase_result(phase: dict[str, object], result: dict[str, object]) -> dict[str, object]:
    return {"key": phase["key"], "label": phase["label"], "result": result}


def _build_import_phases(mode: str, has_raw_dirs: bool, has_export_dirs: bool) -> list[dict[str, object]]:
    if mode == "source_only":
        return [{"key": "scan_sources", "label": "Index Sources", "progress": 1.0}]
    if mode == "processed_only":
        phases = [{"key": "index_processed_media", "label": "Index Processed Media", "progress": 0.5}]
        if has_export_dirs:
            phases.append({"key": "generate_previews", "label": "Generate Previews", "progress": 1.0})
        return phases
    if mode == "processed_with_sources":
        phases = [{"key": "match_processed_media", "label": "Match Processed Media", "progress": 0.5}]
        if has_export_dirs:
            phases.append({"key": "generate_previews", "label": "Generate Previews", "progress": 1.0})
        return phases
    if mode == "source_with_media":
        phases = [{"key": "scan_sources", "label": "Index Sources", "progress": 1 / 3}]
        if has_export_dirs:
            phases.append({"key": "match_processed_media", "label": "Match Processed Media", "progress": 2 / 3})
            phases.append({"key": "generate_previews", "label": "Generate Previews", "progress": 1.0})
        return phases
    phases: list[dict[str, object]] = []
    if has_raw_dirs:
        phases.append({"key": "scan_sources", "label": "Index Sources", "progress": 1 / 3})
    if has_export_dirs:
        phases.append({"key": "match_processed_media", "label": "Match Processed Media", "progress": 2 / 3 if has_raw_dirs else 0.5})
        phases.append({"key": "generate_previews", "label": "Generate Previews", "progress": 1.0})
    return phases


def run_import_job(
    connection,
    catalog_path: Path,
    job_id: str,
    raw_dirs: list[Path],
    export_dirs: list[Path],
    mode: str = "combined",
) -> dict[str, object]:
    thresholds = Thresholds()
    phase_results: list[dict[str, object]] = []
    phases = _build_import_phases(mode, bool(raw_dirs), bool(export_dirs))
    if not phases:
        result = {"phase_results": [], "current_phase": None}
        update_job(
            connection,
            job_id,
            status="succeeded",
            payload={
                "raw_dirs": [str(path.resolve()) for path in raw_dirs],
                "export_dirs": [str(path.resolve()) for path in export_dirs],
                "mode": mode,
                "phase": None,
                "phase_label": None,
                "phase_index": 0,
                "phase_count": 0,
            },
            result=result,
            progress=1.0,
            error_text=None,
        )
        return result
    payload = {
        "raw_dirs": [str(path.resolve()) for path in raw_dirs],
        "export_dirs": [str(path.resolve()) for path in export_dirs],
        "mode": mode,
        "phase": phases[0]["key"],
        "phase_label": phases[0]["label"],
        "phase_index": 1,
        "phase_count": len(phases),
    }
    update_job(connection, job_id, status="running", payload=payload, progress=0.0)

    try:
        phase_cursor = 0

        if raw_dirs:
            scan_phase = phases[phase_cursor]
            if scan_phase["key"] == "scan_sources":
                scan_totals: dict[str, object] = {
                    "indexed": 0,
                    "skipped": 0,
                    "unchanged": 0,
                    "forced": 0,
                    "processed": 0,
                    "discovered": 0,
                    "total": 0,
                }

                def scan_progress(update: dict[str, int | str]) -> None:
                    overall_processed = int(scan_totals["processed"]) + int(update.get("processed", 0) or 0)
                    overall_discovered = int(scan_totals["discovered"]) + int(update.get("discovered", 0) or 0)
                    phase_result = {
                        **scan_totals,
                        **update,
                        "processed": overall_processed,
                        "discovered": overall_discovered,
                        "total": overall_discovered,
                    }
                    update_job(
                        connection,
                        job_id,
                        payload=payload,
                        result={
                            "phase_results": phase_results,
                            "current_phase": _phase_result(scan_phase, phase_result),
                        },
                        progress=(phase_cursor + _scan_fraction(phase_result)) / len(phases),
                        commit=True,
                    )

                for raw_dir in raw_dirs:
                    result = scan_raw_directory(
                        connection,
                        raw_dir,
                        workers=8,
                        fingerprint_mode="head-only",
                        metadata_profile="matcher",
                        progress_callback=scan_progress,
                    )
                    for key in ("indexed", "skipped", "unchanged", "forced", "processed"):
                        scan_totals[key] = int(scan_totals.get(key, 0)) + int(result.get(key, 0))
                    scan_totals["discovered"] = int(scan_totals.get("discovered", 0)) + int(result.get("discovered", 0))
                    scan_totals["total"] = scan_totals["discovered"]
                    scan_totals["workers"] = result["workers"]
                    scan_totals["fingerprint_mode"] = result["fingerprint_mode"]
                    scan_totals["metadata_profile"] = result["metadata_profile"]
                phase_results.append(_phase_result(scan_phase, scan_totals))
                phase_cursor += 1

        if phase_cursor < len(phases) and phases[phase_cursor]["key"] in {"index_processed_media", "match_processed_media"}:
            resolve_phase = phases[phase_cursor]
            update_job(
                connection,
                job_id,
                payload={
                    **payload,
                    "phase": resolve_phase["key"],
                    "phase_label": resolve_phase["label"],
                    "phase_index": phase_cursor + 1,
                },
                result={"phase_results": phase_results, "current_phase": None},
                progress=(phase_cursor / len(phases)),
            )

            def resolve_progress(update: dict[str, int | str]) -> None:
                phase_fraction = _fraction(int(update.get("processed", 0)), int(update.get("total", 0)))
                update_job(
                    connection,
                    job_id,
                    payload={
                        **payload,
                        "phase": resolve_phase["key"],
                        "phase_label": resolve_phase["label"],
                        "phase_index": phase_cursor + 1,
                    },
                    result={
                        "phase_results": phase_results,
                        "current_phase": _phase_result(resolve_phase, update),
                    },
                    progress=(phase_cursor + phase_fraction) / len(phases),
                    commit=True,
                )

            resolve_result = resolve_export_batch(
                connection,
                export_dirs,
                thresholds=thresholds,
                refresh=True,
                progress_callback=resolve_progress,
            )
            phase_results.append(_phase_result(resolve_phase, resolve_result))
            phase_cursor += 1

        if phase_cursor < len(phases) and phases[phase_cursor]["key"] == "generate_previews":
            preview_phase = phases[phase_cursor]
            update_job(
                connection,
                job_id,
                payload={
                    **payload,
                    "phase": preview_phase["key"],
                    "phase_label": preview_phase["label"],
                    "phase_index": phase_cursor + 1,
                },
                result={"phase_results": phase_results, "current_phase": None},
                progress=(phase_cursor / len(phases)),
            )

            def preview_progress(update: dict[str, int | str]) -> None:
                phase_fraction = _fraction(int(update.get("processed", 0)), int(update.get("total", 0)))
                update_job(
                    connection,
                    job_id,
                    payload={
                        **payload,
                        "phase": preview_phase["key"],
                        "phase_label": preview_phase["label"],
                        "phase_index": phase_cursor + 1,
                    },
                    result={
                        "phase_results": phase_results,
                        "current_phase": _phase_result(preview_phase, update),
                    },
                    progress=(phase_cursor + phase_fraction) / len(phases),
                    commit=True,
                )

            preview_result = PreviewService(ensure_catalog(catalog_path)).generate_batch(
                connection,
                kind="preview",
                asset_type="export",
                progress_callback=preview_progress,
                paths=export_dirs,
            )
            phase_results.append(_phase_result(preview_phase, preview_result))
        result = {"phase_results": phase_results, "current_phase": None}
        update_job(
            connection,
            job_id,
            status="succeeded",
            payload={
                **payload,
                "phase": None,
                "phase_label": None,
                "phase_index": len(phases),
            },
            result=result,
            progress=1.0,
            error_text=None,
        )
        return result
    except Exception as error:
        update_job(
            connection,
            job_id,
            status="failed",
            payload=payload,
            result={"phase_results": phase_results},
            progress=max(0.0, len(phase_results) / len(phases)),
            error_text=str(error),
        )
        raise


def run_enrichment_job(
    connection,
    job_id: str,
    raw_dirs: list[Path] | None = None,
) -> dict[str, object]:
    payload = {
        "raw_dirs": [str(path.resolve()) for path in raw_dirs] if raw_dirs else [],
        "phase": "enrich_raw",
        "phase_label": "Enrich RAW Metadata",
        "phase_index": 1,
        "phase_count": 1,
    }
    update_job(connection, job_id, status="running", payload=payload, progress=0.0)
    try:
        def enrich_progress(update: dict[str, int | str]) -> None:
            update_job(
                connection,
                job_id,
                payload=payload,
                result={"current_phase": _phase_result({"key": "enrich_raw", "label": "Enrich RAW Metadata"}, update)},
                progress=_fraction(int(update.get("processed", 0)), int(update.get("total", 0))),
                commit=True,
            )

        result = enrich_raw_assets(
            connection,
            raw_dirs=raw_dirs or [],
            workers=8,
            fingerprint_mode="head-only",
            progress_callback=enrich_progress,
        )
        update_job(
            connection,
            job_id,
            status="succeeded",
            payload={**payload, "phase": None, "phase_label": None},
            result={**result, "current_phase": None},
            progress=1.0,
            error_text=None,
        )
        return result
    except Exception as error:
        update_job(
            connection,
            job_id,
            status="failed",
            payload=payload,
            result={},
            progress=0.0,
            error_text=str(error),
        )
        raise


def run_preview_job(
    connection,
    catalog_path: Path,
    job_id: str,
    *,
    kind: str = "preview",
    asset_type: str | None = "export",
    limit: int | None = None,
    force: bool = False,
) -> dict[str, object]:
    payload = {
        "kind": kind,
        "asset_type": asset_type,
        "limit": limit,
        "force": force,
        "phase": "generate_previews",
        "phase_label": "Generate Previews",
        "phase_index": 1,
        "phase_count": 1,
    }
    update_job(connection, job_id, status="running", payload=payload, progress=0.0)
    try:
        def preview_progress(update: dict[str, int | str]) -> None:
            update_job(
                connection,
                job_id,
                payload=payload,
                result={"current_phase": _phase_result({"key": "generate_previews", "label": "Generate Previews"}, update)},
                progress=_fraction(int(update.get("processed", 0)), int(update.get("total", 0))),
                commit=True,
            )

        result = PreviewService(ensure_catalog(catalog_path)).generate_batch(
            connection,
            kind=kind,
            asset_type=asset_type,
            limit=limit,
            force=force,
            progress_callback=preview_progress,
        )
        update_job(
            connection,
            job_id,
            status="succeeded",
            payload={**payload, "phase": None, "phase_label": None},
            result={**result, "current_phase": None},
            progress=1.0,
            error_text=None,
        )
        return result
    except Exception as error:
        update_job(
            connection,
            job_id,
            status="failed",
            payload=payload,
            result={},
            progress=0.0,
            error_text=str(error),
        )
        raise
