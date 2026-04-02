from __future__ import annotations

import time
from pathlib import Path

from .config import DEFAULT_EXPORT_EXTENSIONS, Thresholds
from .reverse_lookup import resolve_export


class ExportWatcher:
    def __init__(
        self,
        connection,
        export_dirs: tuple[Path, ...],
        thresholds: Thresholds | None = None,
        poll_interval_seconds: float = 2.0,
    ) -> None:
        self.connection = connection
        self.export_dirs = tuple(path.resolve() for path in export_dirs)
        self.thresholds = thresholds or Thresholds()
        self.poll_interval_seconds = poll_interval_seconds
        self._seen: dict[str, int] = {}

    def poll_once(self) -> list[dict[str, object]]:
        events: list[dict[str, object]] = []
        for export_dir in self.export_dirs:
            if not export_dir.exists():
                continue
            for path in sorted(export_dir.rglob("*")):
                if not path.is_file() or path.suffix.lower() not in DEFAULT_EXPORT_EXTENSIONS:
                    continue
                stat = path.stat()
                key = str(path.resolve())
                marker = stat.st_mtime_ns
                if self._seen.get(key) == marker:
                    continue
                self._seen[key] = marker
                decision = resolve_export(self.connection, path, thresholds=self.thresholds)
                events.append(
                    {
                        "path": key,
                        "status": decision.status,
                        "score": decision.score,
                        "raw_asset_id": decision.raw_asset_id,
                    }
                )
        return events

    def run(self) -> None:
        while True:
            self.poll_once()
            time.sleep(self.poll_interval_seconds)

