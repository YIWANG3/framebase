from __future__ import annotations

import hashlib
import os
import re
import struct
from collections.abc import Sequence
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

from .models import ExportCandidate, RawMetadata

EXPORT_VARIANT_WORDS = {
    "copy",
    "cover",
    "denoise",
    "denoiseai",
    "edit",
    "edited",
    "enhanced",
    "export",
    "final",
    "ig",
    "instagram",
    "light",
    "low",
    "nr",
    "small",
    "thumb",
    "thumbnail",
    "web",
}

EXIF_SAMPLE_BYTES = 4 * 1024 * 1024
EMBEDDED_METADATA_SAMPLE_STEPS: Sequence[int] = (
    512 * 1024,
    2 * 1024 * 1024,
    EXIF_SAMPLE_BYTES,
)
FINGERPRINT_MODES = {"head-tail", "head-only"}
RAW_METADATA_PROFILES = {"full", "matcher"}
ASCII_TYPE = 2
SHORT_TYPE = 3
LONG_TYPE = 4
RATIONAL_TYPE = 5
UNDEFINED_TYPE = 7
SIGNED_LONG_TYPE = 9
SIGNED_RATIONAL_TYPE = 10
TIFF_TYPE_SIZES = {
    ASCII_TYPE: 1,
    SHORT_TYPE: 2,
    LONG_TYPE: 4,
    RATIONAL_TYPE: 8,
    UNDEFINED_TYPE: 1,
    SIGNED_LONG_TYPE: 4,
    SIGNED_RATIONAL_TYPE: 8,
}


def quick_fingerprint(
    path: Path,
    chunk_size: int = 65536,
    *,
    stat_result: os.stat_result | None = None,
    head_bytes: bytes | None = None,
    mode: str = "head-tail",
) -> str:
    stat_result = stat_result or path.stat()
    with path.open("rb") as handle:
        return quick_fingerprint_from_handle(
            handle,
            stat_result.st_size,
            head_bytes=head_bytes,
            chunk_size=chunk_size,
            mode=mode,
        )


def quick_fingerprint_from_handle(
    handle,
    file_size: int,
    *,
    head_bytes: bytes | None = None,
    chunk_size: int = 65536,
    mode: str = "head-tail",
) -> str:
    if mode not in FINGERPRINT_MODES:
        raise ValueError(f"unsupported fingerprint mode: {mode}")
    sha1 = hashlib.sha1()
    start = head_bytes[:chunk_size] if head_bytes is not None else handle.read(chunk_size)
    sha1.update(start)
    if mode == "head-tail" and file_size > chunk_size:
        handle.seek(max(0, file_size - chunk_size))
        sha1.update(handle.read(chunk_size))
    sha1.update(mode.encode("utf-8"))
    sha1.update(str(file_size).encode("utf-8"))
    return sha1.hexdigest()


def stable_asset_id(prefix: str, fingerprint: str) -> str:
    return f"{prefix}_{fingerprint[:24]}"


def normalize_stem(stem: str) -> str:
    normalized = re.sub(r"[\s._-]+", "-", stem.strip().lower())
    return normalized.strip("-")


def stem_key(stem: str) -> str:
    value = normalize_stem(stem)
    value = re.sub(r"\((\d+)\)$", "", value).strip("-")

    while True:
        if re.fullmatch(r"[a-z]{2,5}-\d{3,}", value):
            break
        next_value = re.sub(r"[-_ ]+\d+$", "", value).strip("-")
        if next_value == value:
            break
        value = next_value

    parts = [part for part in re.split(r"[-_ ]+", value) if part]
    while parts and (parts[-1] in EXPORT_VARIANT_WORDS or re.fullmatch(r"v\d+", parts[-1])):
        parts.pop()
    key = "-".join(parts).strip("-")
    return key or value


def stem_alnum_key(stem: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", stem_key(stem))


def camera_stem_token(stem: str) -> str | None:
    key = stem_key(stem)
    if not key:
        return None
    patterns = (
        r"img-\d{4,}",
        r"dscn?-\d{4,}",
        r"dji-\d{8,}",
        r"[a-z]\d{7,}",
        r"\d[a-z]\d[a-z]\d{4,}",
    )
    for pattern in patterns:
        if re.fullmatch(pattern, key):
            return key
    return None


def iso_mtime(path: Path, stat_result: os.stat_result | None = None) -> str:
    stat_result = stat_result or path.stat()
    return datetime.fromtimestamp(stat_result.st_mtime, tz=UTC).isoformat()


def read_image_dimensions(path: Path) -> tuple[int | None, int | None]:
    with path.open("rb") as handle:
        return read_image_dimensions_from_handle(handle)


def read_image_dimensions_from_handle(handle) -> tuple[int | None, int | None]:
    header = handle.read(32)
    if header.startswith(b"\x89PNG\r\n\x1a\n") and len(header) >= 24:
        width, height = struct.unpack(">II", header[16:24])
        return width, height

    if header[:2] == b"\xff\xd8":
        handle.seek(2)
        while True:
            marker_prefix = handle.read(1)
            if not marker_prefix:
                return None, None
            if marker_prefix != b"\xff":
                continue
            marker = handle.read(1)
            while marker == b"\xff":
                marker = handle.read(1)
            if marker in {b"\xc0", b"\xc1", b"\xc2", b"\xc3", b"\xc5", b"\xc6", b"\xc7", b"\xc9", b"\xca", b"\xcb", b"\xcd", b"\xce", b"\xcf"}:
                _segment_length = struct.unpack(">H", handle.read(2))[0]
                handle.read(1)
                height, width = struct.unpack(">HH", handle.read(4))
                return width, height
            if marker in {b"\xd8", b"\xd9"}:
                continue
            segment_length_raw = handle.read(2)
            if len(segment_length_raw) != 2:
                return None, None
            segment_length = struct.unpack(">H", segment_length_raw)[0]
            handle.seek(segment_length - 2, 1)
    return None, None


def read_image_dimensions_from_bytes(data: bytes) -> tuple[int | None, int | None]:
    return read_image_dimensions_from_handle(BytesIO(data))


def _read_sample(path: Path, limit: int = EXIF_SAMPLE_BYTES) -> bytes:
    with path.open("rb") as handle:
        return handle.read(limit)


def _ensure_sample(handle, sample: bytearray, limit: int) -> bytes:
    missing = limit - len(sample)
    if missing > 0:
        sample.extend(handle.read(missing))
    return bytes(sample[:limit])


def _read_u16(data: bytes, offset: int, little_endian: bool) -> int:
    return struct.unpack("<H" if little_endian else ">H", data[offset : offset + 2])[0]


def _read_u32(data: bytes, offset: int, little_endian: bool) -> int:
    return struct.unpack("<I" if little_endian else ">I", data[offset : offset + 4])[0]


def _normalize_capture_time(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip().replace("\x00", "")
    if not cleaned:
        return None
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(cleaned, fmt).replace(tzinfo=UTC).isoformat()
        except ValueError:
            continue
    return None


def _parse_tiff_value(
    data: bytes,
    tiff_base: int,
    entry_offset: int,
    field_type: int,
    count: int,
    little_endian: bool,
) -> object | None:
    unit_size = TIFF_TYPE_SIZES.get(field_type)
    if unit_size is None:
        return None
    total_size = unit_size * count
    if total_size <= 4:
        raw = data[entry_offset + 8 : entry_offset + 12][:total_size]
    else:
        pointer = _read_u32(data, entry_offset + 8, little_endian)
        start = tiff_base + pointer
        end = start + total_size
        if start < 0 or end > len(data):
            return None
        raw = data[start:end]

    if field_type == ASCII_TYPE:
        return raw.rstrip(b"\x00").decode("utf-8", "ignore").strip() or None
    if field_type == SHORT_TYPE:
        values = [
            struct.unpack("<H" if little_endian else ">H", raw[index : index + 2])[0]
            for index in range(0, len(raw), 2)
        ]
        return values[0] if count == 1 and values else values
    if field_type in {LONG_TYPE, SIGNED_LONG_TYPE}:
        values = [
            struct.unpack("<I" if little_endian else ">I", raw[index : index + 4])[0]
            for index in range(0, len(raw), 4)
        ]
        return values[0] if count == 1 and values else values
    return raw


def _parse_tiff_ifd(data: bytes, tiff_base: int, ifd_offset: int, little_endian: bool) -> dict[int, object]:
    if ifd_offset <= 0:
        return {}
    start = tiff_base + ifd_offset
    if start + 2 > len(data):
        return {}
    entry_count = _read_u16(data, start, little_endian)
    tags: dict[int, object] = {}
    for index in range(entry_count):
        entry_offset = start + 2 + index * 12
        if entry_offset + 12 > len(data):
            break
        tag = _read_u16(data, entry_offset, little_endian)
        field_type = _read_u16(data, entry_offset + 2, little_endian)
        count = _read_u32(data, entry_offset + 4, little_endian)
        value = _parse_tiff_value(data, tiff_base, entry_offset, field_type, count, little_endian)
        if value is not None:
            tags[tag] = value
    return tags


def _extract_tiff_metadata(
    data: bytes,
    tiff_base: int,
    profile: str = "full",
) -> dict[str, object]:
    if profile not in RAW_METADATA_PROFILES:
        raise ValueError(f"unsupported metadata profile: {profile}")
    if tiff_base + 8 > len(data):
        return {}
    header = data[tiff_base : tiff_base + 4]
    if header not in {b"II*\x00", b"MM\x00*"}:
        return {}

    little_endian = header[:2] == b"II"
    first_ifd = _read_u32(data, tiff_base + 4, little_endian)
    ifd0 = _parse_tiff_ifd(data, tiff_base, first_ifd, little_endian)
    exif_pointer = ifd0.get(0x8769)
    exif_ifd = _parse_tiff_ifd(data, tiff_base, exif_pointer, little_endian) if isinstance(exif_pointer, int) else {}

    capture_time = (
        _normalize_capture_time(exif_ifd.get(0x9003) if isinstance(exif_ifd.get(0x9003), str) else None)
        or _normalize_capture_time(ifd0.get(0x0132) if isinstance(ifd0.get(0x0132), str) else None)
    )
    camera_model = ifd0.get(0x0110) if isinstance(ifd0.get(0x0110), str) else None
    if profile == "matcher":
        return {
            "capture_time": capture_time,
            "camera_model": camera_model,
            "lens_model": None,
            "width": None,
            "height": None,
        }

    width = ifd0.get(0x0100)
    if not isinstance(width, int):
        width = exif_ifd.get(0xA002) if isinstance(exif_ifd.get(0xA002), int) else None
    height = ifd0.get(0x0101)
    if not isinstance(height, int):
        height = exif_ifd.get(0xA003) if isinstance(exif_ifd.get(0xA003), int) else None
    lens_model = exif_ifd.get(0xA434) if isinstance(exif_ifd.get(0xA434), str) else None

    return {
        "capture_time": capture_time,
        "camera_model": camera_model,
        "lens_model": lens_model,
        "width": width if isinstance(width, int) else None,
        "height": height if isinstance(height, int) else None,
    }


def _find_jpeg_exif_offset(data: bytes) -> int | None:
    marker = b"Exif\x00\x00"
    offset = data.find(marker)
    if offset < 0:
        return None
    return offset + len(marker)


def _iter_embedded_tiff_offsets(data: bytes) -> list[int]:
    offsets: list[int] = []
    for marker in (b"II*\x00", b"MM\x00*"):
        start = 0
        while True:
            index = data.find(marker, start)
            if index < 0:
                break
            offsets.append(index)
            start = index + 1
    offsets.sort()
    return offsets


def _merge_metadata(candidates: list[dict[str, object]]) -> dict[str, object]:
    merged: dict[str, object] = {
        "capture_time": None,
        "camera_model": None,
        "lens_model": None,
        "width": None,
        "height": None,
    }
    for candidate in candidates:
        for key, value in candidate.items():
            if merged.get(key) in {None, ""} and value not in {None, ""}:
                merged[key] = value
    return merged


def extract_embedded_metadata(path: Path, profile: str = "full") -> dict[str, object]:
    with path.open("rb") as handle:
        return extract_embedded_metadata_from_handle(handle, path.suffix.lower(), profile=profile)


def extract_embedded_metadata_from_handle(handle, suffix: str, profile: str = "full") -> dict[str, object]:
    metadata, _sample = _extract_embedded_metadata_with_sample(handle, suffix, profile=profile)
    return metadata


def _extract_embedded_metadata_with_sample(
    handle,
    suffix: str,
    profile: str = "full",
) -> tuple[dict[str, object], bytes]:
    limits = (EXIF_SAMPLE_BYTES,) if suffix in {".jpg", ".jpeg"} else EMBEDDED_METADATA_SAMPLE_STEPS
    sample = bytearray()

    for limit in limits:
        data = _ensure_sample(handle, sample, limit)
        candidates: list[dict[str, object]] = []

        if suffix in {".jpg", ".jpeg"}:
            exif_offset = _find_jpeg_exif_offset(data)
            if exif_offset is not None:
                candidates.append(_extract_tiff_metadata(data, exif_offset, profile=profile))
        else:
            for offset in _iter_embedded_tiff_offsets(data)[:8]:
                metadata = _extract_tiff_metadata(data, offset, profile=profile)
                if any(metadata.values()):
                    candidates.append(metadata)
                    if profile == "matcher" and metadata.get("camera_model") and metadata.get("capture_time"):
                        break

        merged = _merge_metadata(candidates)
        if any(merged.values()) or limit == limits[-1]:
            return merged, bytes(sample)

    return _merge_metadata([]), bytes(sample)


def extract_raw_metadata(
    path: Path,
    fingerprint_mode: str = "head-tail",
    metadata_profile: str = "full",
) -> RawMetadata:
    stat = path.stat()
    resolved_path = path.resolve()
    with path.open("rb") as handle:
        metadata, sample = _extract_embedded_metadata_with_sample(
            handle,
            path.suffix.lower(),
            profile=metadata_profile,
        )
        fingerprint = quick_fingerprint_from_handle(handle, stat.st_size, head_bytes=sample, mode=fingerprint_mode)
    return RawMetadata(
        asset_id=stable_asset_id("raw", fingerprint),
        path=resolved_path,
        stem=path.stem,
        normalized_stem=normalize_stem(path.stem),
        stem_key=stem_key(path.stem),
        extension=path.suffix.lower(),
        fingerprint=fingerprint,
        file_size=stat.st_size,
        modified_time=iso_mtime(path, stat),
        capture_time=metadata["capture_time"],
        camera_model=metadata["camera_model"],
        lens_model=metadata["lens_model"],
        width=metadata["width"],
        height=metadata["height"],
        metadata_level=metadata_profile,
        fingerprint_level=fingerprint_mode,
        enrichment_status="done" if metadata_profile == "full" else "pending",
    )


def extract_export_candidate(path: Path, fingerprint_mode: str = "head-tail") -> ExportCandidate:
    stat = path.stat()
    resolved_path = path.resolve()
    with path.open("rb") as handle:
        metadata, sample = _extract_embedded_metadata_with_sample(handle, path.suffix.lower())
        fingerprint = quick_fingerprint_from_handle(handle, stat.st_size, head_bytes=sample, mode=fingerprint_mode)
    width = metadata["width"]
    height = metadata["height"]
    if width is None or height is None:
        width, height = read_image_dimensions_from_bytes(sample) if stat.st_size else (None, None)
    return ExportCandidate(
        asset_id=stable_asset_id("export", fingerprint),
        path=resolved_path,
        stem=path.stem,
        normalized_stem=normalize_stem(path.stem),
        stem_key=stem_key(path.stem),
        extension=path.suffix.lower(),
        fingerprint=fingerprint,
        file_size=stat.st_size,
        modified_time=iso_mtime(path, stat),
        capture_time=metadata["capture_time"],
        camera_model=metadata["camera_model"],
        lens_model=metadata["lens_model"],
        width=width,
        height=height,
    )
