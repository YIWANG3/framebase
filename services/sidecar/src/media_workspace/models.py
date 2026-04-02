from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(slots=True)
class RawMetadata:
    asset_id: str
    path: Path
    stem: str
    normalized_stem: str
    stem_key: str
    extension: str
    fingerprint: str
    file_size: int
    modified_time: str
    capture_time: str | None
    camera_model: str | None
    lens_model: str | None
    width: int | None
    height: int | None
    metadata_level: str
    fingerprint_level: str
    enrichment_status: str

    @property
    def aspect_ratio(self) -> float | None:
        if not self.width or not self.height:
            return None
        return self.width / self.height


@dataclass(slots=True)
class ExportCandidate:
    asset_id: str
    path: Path
    stem: str
    normalized_stem: str
    stem_key: str
    extension: str
    fingerprint: str
    file_size: int
    modified_time: str
    capture_time: str | None
    camera_model: str | None
    lens_model: str | None
    width: int | None
    height: int | None

    @property
    def aspect_ratio(self) -> float | None:
        if not self.width or not self.height:
            return None
        return self.width / self.height


@dataclass(slots=True)
class MatchDecision:
    export_asset_id: str
    export_path: Path
    status: str
    score: float
    raw_asset_id: str | None
    feature_vector: dict[str, float]
    ranked_candidates: list[dict[str, object]] = field(default_factory=list)
