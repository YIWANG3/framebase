from __future__ import annotations

import argparse
import json
from pathlib import Path

from .benchmark import benchmark_dataset
from .catalog import ensure_catalog
from .config import Thresholds
from .analysis import analyze_metadata_coverage
from .db import (
    cleanup_orphan_export_assets,
    confirm_match,
    connect,
    create_job,
    get_export_asset_detail,
    get_export_asset_detail_by_path,
    get_job,
    get_latest_job,
    init_db,
    list_jobs,
    list_catalog_roots,
    list_export_assets,
    list_pending,
    set_catalog_path,
    summary,
    upsert_catalog_root,
)
from .evaluation import evaluate_ground_truth
from .ground_truth import export_ground_truth
from .job_runner import run_enrichment_job, run_import_job, run_preview_job
from .preview_service import PreviewService
from .reverse_lookup import resolve_export, resolve_export_batch
from .scanner import enrich_raw_assets, scan_raw_directory
from .watcher import ExportWatcher


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="media_workspace")
    parser.add_argument("--catalog", type=Path, default=Path("data/default.mwcatalog"))
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--catalog", type=Path, default=argparse.SUPPRESS)

    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("init-catalog", parents=[common])

    scan_raw = subparsers.add_parser("scan-raw", parents=[common])
    scan_raw.add_argument("--raw-dir", type=Path, action="append", required=True)
    scan_raw.add_argument("--force", action="store_true")
    scan_raw.add_argument("--workers", type=int)
    scan_raw.add_argument("--fingerprint-mode", choices=["head-tail", "head-only"], default="head-only")
    scan_raw.add_argument("--metadata-profile", choices=["full", "matcher"], default="matcher")

    enrich_raw = subparsers.add_parser("enrich-raw", parents=[common])
    enrich_raw.add_argument("--raw-dir", type=Path, action="append", default=[])
    enrich_raw.add_argument("--limit", type=int)
    enrich_raw.add_argument("--workers", type=int)
    enrich_raw.add_argument("--fingerprint-mode", choices=["head-only"], default="head-only")

    analyze = subparsers.add_parser("analyze-metadata", parents=[common])
    analyze.add_argument("--raw-dir", type=Path, action="append", default=[])
    analyze.add_argument("--export-dir", type=Path, action="append", default=[])

    evaluate = subparsers.add_parser("evaluate-ground-truth", parents=[common])
    evaluate.add_argument("--truth-csv", type=Path, required=True)
    evaluate.add_argument("--refresh", action="store_true")

    export_truth = subparsers.add_parser("export-ground-truth", parents=[common])
    export_truth.add_argument("--output-csv", type=Path, required=True)
    export_truth.add_argument(
        "--status",
        choices=["matched", "unmatched", "pending"],
        action="append",
        required=True,
    )

    benchmark = subparsers.add_parser("benchmark-dataset", parents=[common])
    benchmark.add_argument("--raw-dir", type=Path, action="append", required=True)
    benchmark.add_argument("--export-dir", type=Path, action="append", required=True)
    benchmark.add_argument("--truth-csv", type=Path)
    benchmark.add_argument("--auto-threshold", type=float, default=0.85)
    benchmark.add_argument("--manual-threshold", type=float, default=0.7)
    benchmark.add_argument("--skip-previews", action="store_true")
    benchmark.add_argument("--force-scan", action="store_true")
    benchmark.add_argument("--force-previews", action="store_true")
    benchmark.add_argument("--scan-workers", type=int)
    benchmark.add_argument("--fingerprint-mode", choices=["head-tail", "head-only"], default="head-tail")
    benchmark.add_argument("--metadata-profile", choices=["full", "matcher"], default="full")
    benchmark.add_argument("--report-json", type=Path)

    resolve = subparsers.add_parser("resolve-export", parents=[common])
    resolve.add_argument("--path", type=Path, required=True)
    resolve.add_argument("--auto-threshold", type=float, default=0.85)
    resolve.add_argument("--manual-threshold", type=float, default=0.7)
    resolve.add_argument("--refresh", action="store_true")

    resolve_batch = subparsers.add_parser("resolve-export-batch", parents=[common])
    resolve_batch.add_argument("--export-dir", type=Path, action="append", required=True)
    resolve_batch.add_argument("--auto-threshold", type=float, default=0.85)
    resolve_batch.add_argument("--manual-threshold", type=float, default=0.7)
    resolve_batch.add_argument("--refresh", action="store_true")

    watch = subparsers.add_parser("watch-export", parents=[common])
    watch.add_argument("--export-dir", type=Path, action="append", required=True)
    watch.add_argument("--interval", type=float, default=2.0)
    watch.add_argument("--auto-threshold", type=float, default=0.85)
    watch.add_argument("--manual-threshold", type=float, default=0.7)

    previews = subparsers.add_parser("generate-previews", parents=[common])
    previews.add_argument("--kind", choices=["preview", "proxy"], default="preview")
    previews.add_argument("--asset-type", choices=["raw", "export"])
    previews.add_argument("--limit", type=int)
    previews.add_argument("--force", action="store_true")

    browse = subparsers.add_parser("browse-exports", parents=[common])
    browse.add_argument("--status", choices=["all", "matched", "unmatched"], required=True)
    browse.add_argument("--limit", type=int, default=120)
    browse.add_argument("--offset", type=int, default=0)

    detail = subparsers.add_parser("asset-detail", parents=[common])
    detail_group = detail.add_mutually_exclusive_group(required=True)
    detail_group.add_argument("--asset-id")
    detail_group.add_argument("--export-path", type=Path)

    subparsers.add_parser("list-pending", parents=[common])

    confirm = subparsers.add_parser("confirm-match", parents=[common])
    confirm.add_argument("--export-path", type=Path, required=True)
    confirm.add_argument("--raw-asset-id", required=True)

    subparsers.add_parser("cleanup-orphan-exports", parents=[common])
    subparsers.add_parser("catalog-roots", parents=[common])
    register_roots_parser = subparsers.add_parser("register-roots", parents=[common])
    register_roots_parser.add_argument("--root-type", choices=["raw", "export"], required=True)
    register_roots_parser.add_argument("--path", type=Path, action="append", required=True)

    create_job_parser = subparsers.add_parser("create-job", parents=[common])
    create_job_parser.add_argument("--job-type", choices=["import", "enrichment", "preview"], required=True)
    create_job_parser.add_argument("--payload-json", default="{}")

    get_job_parser = subparsers.add_parser("get-job", parents=[common])
    get_job_parser.add_argument("--job-id", required=True)

    latest_job_parser = subparsers.add_parser("latest-job", parents=[common])
    latest_job_parser.add_argument("--job-type", choices=["import", "enrichment", "preview"])

    list_jobs_parser = subparsers.add_parser("list-jobs", parents=[common])
    list_jobs_parser.add_argument("--job-type", choices=["import", "enrichment", "preview"])
    list_jobs_parser.add_argument("--limit", type=int, default=20)

    run_import_job_parser = subparsers.add_parser("run-import-job", parents=[common])
    run_import_job_parser.add_argument("--job-id", required=True)
    run_import_job_parser.add_argument(
        "--mode",
        choices=["source_only", "processed_only", "source_with_media", "processed_with_sources", "combined"],
        default="combined",
    )
    run_import_job_parser.add_argument("--raw-dir", type=Path, action="append", default=[])
    run_import_job_parser.add_argument("--export-dir", type=Path, action="append", default=[])

    run_enrichment_job_parser = subparsers.add_parser("run-enrichment-job", parents=[common])
    run_enrichment_job_parser.add_argument("--job-id", required=True)
    run_enrichment_job_parser.add_argument("--raw-dir", type=Path, action="append", default=[])

    run_preview_job_parser = subparsers.add_parser("run-preview-job", parents=[common])
    run_preview_job_parser.add_argument("--job-id", required=True)
    run_preview_job_parser.add_argument("--kind", choices=["preview", "proxy"], default="preview")
    run_preview_job_parser.add_argument("--asset-type", choices=["raw", "export"])
    run_preview_job_parser.add_argument("--limit", type=int)
    run_preview_job_parser.add_argument("--force", action="store_true")

    summary_parser = subparsers.add_parser("summary", parents=[common])
    summary_parser.add_argument("--json", action="store_true")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "benchmark-dataset":
        thresholds = Thresholds(auto_bind=args.auto_threshold, manual_review=args.manual_threshold)
        payload = benchmark_dataset(
            catalog_path=args.catalog,
            raw_dirs=args.raw_dir,
            export_dirs=args.export_dir,
            truth_csv=args.truth_csv,
            thresholds=thresholds,
            include_previews=not args.skip_previews,
            force_scan=args.force_scan,
            force_previews=args.force_previews,
            scan_workers=args.scan_workers,
            fingerprint_mode=args.fingerprint_mode,
            metadata_profile=args.metadata_profile,
        )
        rendered = json.dumps(payload, indent=2)
        if args.report_json:
            args.report_json.parent.mkdir(parents=True, exist_ok=True)
            args.report_json.write_text(rendered + "\n", encoding="utf-8")
        print(rendered)
        return 0

    catalog = ensure_catalog(args.catalog)
    fresh_db = not catalog.db_path.exists()
    connection = connect(catalog.db_path)

    if args.command == "init-catalog":
        init_db(connection)
        set_catalog_path(connection, catalog.root)
        print(f"initialized {catalog.root}")
        return 0

    init_db(connection)
    if fresh_db:
        set_catalog_path(connection, catalog.root)

    if args.command == "scan-raw":
        aggregate = {"indexed": 0, "skipped": 0, "unchanged": 0, "forced": int(args.force)}
        for raw_dir in args.raw_dir:
            result = scan_raw_directory(
                connection,
                raw_dir,
                force=args.force,
                workers=args.workers,
                fingerprint_mode=args.fingerprint_mode,
                metadata_profile=args.metadata_profile,
            )
            aggregate["indexed"] += result["indexed"]
            aggregate["skipped"] += result["skipped"]
            aggregate["unchanged"] += result["unchanged"]
            aggregate["workers"] = result["workers"]
            aggregate["fingerprint_mode"] = result["fingerprint_mode"]
            aggregate["metadata_profile"] = result["metadata_profile"]
        print(json.dumps(aggregate, indent=2))
        return 0

    if args.command == "enrich-raw":
        payload = enrich_raw_assets(
            connection,
            raw_dirs=args.raw_dir,
            limit=args.limit,
            workers=args.workers,
            fingerprint_mode=args.fingerprint_mode,
        )
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "analyze-metadata":
        payload = analyze_metadata_coverage(
            raw_dirs=[path.resolve() for path in args.raw_dir],
            export_dirs=[path.resolve() for path in args.export_dir],
        )
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "create-job":
        payload = json.loads(args.payload_json or "{}")
        print(json.dumps(create_job(connection, args.job_type, payload=payload), indent=2))
        return 0

    if args.command == "get-job":
        print(json.dumps(get_job(connection, args.job_id), indent=2))
        return 0

    if args.command == "latest-job":
        print(json.dumps(get_latest_job(connection, args.job_type), indent=2))
        return 0

    if args.command == "list-jobs":
        print(json.dumps(list_jobs(connection, job_type=args.job_type, limit=args.limit), indent=2))
        return 0

    if args.command == "run-import-job":
        payload = run_import_job(
            connection,
            catalog.root,
            args.job_id,
            raw_dirs=args.raw_dir,
            export_dirs=args.export_dir,
            mode=args.mode,
        )
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "run-enrichment-job":
        payload = run_enrichment_job(connection, args.job_id, raw_dirs=args.raw_dir)
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "run-preview-job":
        payload = run_preview_job(
            connection,
            catalog.root,
            args.job_id,
            kind=args.kind,
            asset_type=args.asset_type,
            limit=args.limit,
            force=args.force,
        )
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "evaluate-ground-truth":
        payload = evaluate_ground_truth(connection, args.truth_csv.resolve(), refresh=args.refresh)
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "export-ground-truth":
        payload = export_ground_truth(connection, args.output_csv, statuses=args.status)
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "resolve-export":
        thresholds = Thresholds(auto_bind=args.auto_threshold, manual_review=args.manual_threshold)
        decision = resolve_export(connection, args.path, thresholds=thresholds, refresh=args.refresh)
        print(
            json.dumps(
                {
                    "status": decision.status,
                    "score": decision.score,
                    "raw_asset_id": decision.raw_asset_id,
                    "top_candidates": decision.ranked_candidates,
                },
                indent=2,
            )
        )
        return 0

    if args.command == "resolve-export-batch":
        thresholds = Thresholds(auto_bind=args.auto_threshold, manual_review=args.manual_threshold)
        payload = resolve_export_batch(connection, args.export_dir, thresholds=thresholds, refresh=args.refresh)
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "watch-export":
        thresholds = Thresholds(auto_bind=args.auto_threshold, manual_review=args.manual_threshold)
        watcher = ExportWatcher(
            connection,
            export_dirs=tuple(args.export_dir),
            thresholds=thresholds,
            poll_interval_seconds=args.interval,
        )
        watcher.run()
        return 0

    if args.command == "generate-previews":
        service = PreviewService(catalog)
        payload = service.generate_batch(
            connection,
            kind=args.kind,
            asset_type=args.asset_type,
            limit=args.limit,
            force=args.force,
        )
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "browse-exports":
        payload = []
        for row in list_export_assets(connection, status=args.status, limit=args.limit, offset=args.offset):
            preview_path = None
            if row["preview_relative_path"]:
                preview_path = str((catalog.root / row["preview_relative_path"]).resolve())
            payload.append(
                {
                    "asset_id": row["asset_id"],
                    "stem": row["stem"],
                    "export_path": row["export_path"],
                    "export_metadata": json.loads(row["export_metadata_json"] or "{}"),
                    "imported_at": row["imported_at"],
                    "match_status": row["match_status"],
                    "score": row["score"],
                    "raw_asset_id": row["raw_asset_id"],
                    "raw_path": row["raw_path"],
                    "raw_metadata": json.loads(row["raw_metadata_json"] or "{}") if row["raw_metadata_json"] else {},
                    "preview_path": preview_path,
                }
            )
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "asset-detail":
        if args.export_path:
            row = get_export_asset_detail_by_path(connection, str(args.export_path.resolve()))
            identifier = str(args.export_path)
        else:
            row = get_export_asset_detail(connection, args.asset_id)
            identifier = args.asset_id
        if row is None:
            raise SystemExit(f"unknown export asset: {identifier}")
        payload = {
            "asset_id": row["asset_id"],
            "stem": row["stem"],
            "export_path": row["export_path"],
            "export_metadata": json.loads(row["export_metadata_json"] or "{}"),
            "imported_at": row["imported_at"],
            "match_status": row["match_status"],
            "score": row["score"],
            "raw_asset_id": row["raw_asset_id"],
            "raw_path": row["raw_path"],
            "raw_metadata": json.loads(row["raw_metadata_json"] or "{}") if row["raw_metadata_json"] else {},
            "feature_vector": json.loads(row["feature_vector_json"] or "{}"),
            "candidates": json.loads(row["candidate_json"] or "[]"),
            "export_preview_path": str((catalog.root / row["export_preview_relative_path"]).resolve())
            if row["export_preview_relative_path"]
            else None,
            "raw_preview_path": str((catalog.root / row["raw_preview_relative_path"]).resolve())
            if row["raw_preview_relative_path"]
            else None,
        }
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "list-pending":
        payload = []
        for row in list_pending(connection):
            payload.append(
                {
                    "export_path": row["export_path"],
                    "export_asset_id": row["export_asset_id"],
                    "score": row["score"],
                    "candidates": json.loads(row["candidate_json"]),
                }
            )
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "confirm-match":
        confirm_match(connection, args.export_path, args.raw_asset_id)
        print(f"confirmed {args.export_path} -> {args.raw_asset_id}")
        return 0

    if args.command == "cleanup-orphan-exports":
        payload = cleanup_orphan_export_assets(connection)
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "catalog-roots":
        payload = [
            {
                "root_id": row["root_id"],
                "root_type": row["root_type"],
                "path": row["path"],
                "is_active": bool(row["is_active"]),
            }
            for row in list_catalog_roots(connection)
        ]
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "register-roots":
        for root_path in args.path:
            upsert_catalog_root(connection, args.root_type, root_path.resolve(), commit=False)
        connection.commit()
        payload = [
            {
                "root_id": row["root_id"],
                "root_type": row["root_type"],
                "path": row["path"],
                "is_active": bool(row["is_active"]),
            }
            for row in list_catalog_roots(connection)
        ]
        print(json.dumps(payload, indent=2))
        return 0

    if args.command == "summary":
        payload = summary(connection)
        if args.json:
            print(json.dumps(payload))
        else:
            print(json.dumps(payload, indent=2))
        return 0

    parser.error(f"unsupported command: {args.command}")
    return 2
