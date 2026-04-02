from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from .catalog import CatalogPaths
from .config import DEFAULT_RAW_EXTENSIONS
from .db import list_assets_for_preview, upsert_preview_entry

KIND_SIZES = {
    "preview": 512,
    "proxy": 1600,
}


@dataclass(slots=True)
class PreviewResult:
    asset_id: str
    kind: str
    relative_path: str
    width: int | None
    height: int | None
    status: str


class PreviewService:
    def __init__(self, catalog: CatalogPaths) -> None:
        self.catalog = catalog

    def output_path(self, asset_id: str, kind: str) -> Path:
        directory = self.catalog.previews_dir if kind == "preview" else self.catalog.proxies_dir
        shard = asset_id[:2]
        target_dir = directory / shard
        target_dir.mkdir(parents=True, exist_ok=True)
        return target_dir / f"{asset_id}.jpg"

    def relative_output_path(self, path: Path) -> str:
        return str(path.relative_to(self.catalog.root))

    def generate_for_row(self, row, kind: str, force: bool = False) -> PreviewResult:
        if kind not in KIND_SIZES:
            raise ValueError(f"unsupported preview kind: {kind}")

        source_path = Path(row["canonical_path"])
        output_path = self.output_path(row["asset_id"], kind)
        if output_path.exists() and not force:
            width = row["width"] if "width" in row.keys() else None
            height = row["height"] if "height" in row.keys() else None
            return PreviewResult(
                asset_id=row["asset_id"],
                kind=kind,
                relative_path=self.relative_output_path(output_path),
                width=width,
                height=height,
                status="ready",
            )

        if source_path.suffix.lower() in DEFAULT_RAW_EXTENSIONS:
            rendered = self._render_with_quicklook(source_path, output_path, KIND_SIZES[kind])
        else:
            rendered = self._render_with_sips(source_path, output_path, KIND_SIZES[kind])

        return PreviewResult(
            asset_id=row["asset_id"],
            kind=kind,
            relative_path=self.relative_output_path(rendered),
            width=row["width"] if "width" in row.keys() else None,
            height=row["height"] if "height" in row.keys() else None,
            status="ready",
        )

    def generate_batch(
        self,
        connection,
        kind: str,
        asset_type: str | None = None,
        limit: int | None = None,
        force: bool = False,
        progress_callback=None,
        paths: list[Path] | None = None,
    ) -> dict[str, int]:
        rows = list_assets_for_preview(connection, asset_type=asset_type, kind=kind, limit=limit, paths=paths)
        generated = 0
        skipped = 0
        failed = 0
        processed = 0
        total = len(rows)
        batch_size = 50
        report_progress(progress_callback, phase="generate_previews", processed=0, total=total, generated=0, skipped=0, failed=0)
        for row in rows:
            if row["existing_relative_path"] and row["existing_status"] == "ready" and not force:
                skipped += 1
                processed += 1
                report_progress(
                    progress_callback,
                    phase="generate_previews",
                    processed=processed,
                    total=total,
                    generated=generated,
                    skipped=skipped,
                    failed=failed,
                )
                continue
            try:
                result = self.generate_for_row(row, kind=kind, force=force)
                upsert_preview_entry(
                    connection,
                    asset_id=result.asset_id,
                    kind=result.kind,
                    relative_path=result.relative_path,
                    width=result.width,
                    height=result.height,
                    status=result.status,
                    commit=False,
                )
                generated += 1
                processed += 1
                if generated % batch_size == 0:
                    connection.commit()
                report_progress(
                    progress_callback,
                    phase="generate_previews",
                    processed=processed,
                    total=total,
                    generated=generated,
                    skipped=skipped,
                    failed=failed,
                )
            except Exception:
                upsert_preview_entry(
                    connection,
                    asset_id=row["asset_id"],
                    kind=kind,
                    relative_path="",
                    width=None,
                    height=None,
                    status="failed",
                    commit=False,
                )
                failed += 1
                processed += 1
                if failed % batch_size == 0:
                    connection.commit()
                report_progress(
                    progress_callback,
                    phase="generate_previews",
                    processed=processed,
                    total=total,
                    generated=generated,
                    skipped=skipped,
                    failed=failed,
                )
        connection.commit()
        return {"generated": generated, "skipped": skipped, "failed": failed, "total": total}

    def _render_with_sips(self, source_path: Path, output_path: Path, size: int) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["sips", "-s", "format", "jpeg", "-Z", str(size), "--out", str(output_path), str(source_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        return output_path

    def _render_with_quicklook(self, source_path: Path, output_path: Path, size: int) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="media-workspace-ql-") as temp_dir:
            subprocess.run(
                ["qlmanage", "-t", "-s", str(size), "-o", temp_dir, str(source_path)],
                check=True,
                capture_output=True,
                text=True,
            )
            generated = Path(temp_dir) / f"{source_path.name}.png"
            if not generated.exists():
                raise FileNotFoundError(f"Quick Look did not render {source_path}")
            subprocess.run(
                ["sips", "-s", "format", "jpeg", "--out", str(output_path), str(generated)],
                check=True,
                capture_output=True,
                text=True,
            )
        return output_path


def report_progress(progress_callback, **payload) -> None:
    if progress_callback is None:
        return
    progress_callback(payload)
