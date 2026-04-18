from __future__ import annotations

import base64
import json
import mimetypes
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_GEMINI_MODEL = "gemini-3-pro-image-preview"
NANOBANANA_PROVIDER = "nanobanana"
GEMINI_MODELS_WITH_IMAGE_SIZE = {
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview",
}


@dataclass(slots=True)
class RepaintResult:
    provider: str
    model: str
    output_path: str
    mime_type: str
    prompt: str
    notes: list[str]


def _detect_mime_type(path: Path) -> str:
    mime_type, _ = mimetypes.guess_type(str(path))
    if not mime_type or not mime_type.startswith("image/"):
        raise ValueError(f"Unsupported image type for {path}")
    return mime_type


def _image_ext_from_mime(mime_type: str) -> str:
    if mime_type == "image/png":
        return ".png"
    if mime_type == "image/webp":
        return ".webp"
    return ".jpg"


def _write_output_bytes(target: Path, image_bytes: bytes, mime_type: str) -> Path:
    resolved = target
    if target.is_dir():
        resolved = target / f"ai-repaint-output{_image_ext_from_mime(mime_type)}"
    elif not target.suffix:
        resolved = target.with_suffix(_image_ext_from_mime(mime_type))
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_bytes(image_bytes)
    return resolved


def run_mock_repaint(input_path: Path, output_path: Path, prompt: str) -> RepaintResult:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(input_path, output_path)
    return RepaintResult(
        provider="mock",
        model="mock-pass-through",
        output_path=str(output_path),
        mime_type=_detect_mime_type(input_path),
        prompt=prompt,
        notes=["Mock mode copied the input image to validate the local repaint flow."],
    )


def run_gemini_repaint(
    input_path: Path,
    output_path: Path,
    prompt: str,
    *,
    api_key: str | None,
    model: str = DEFAULT_GEMINI_MODEL,
    aspect_ratio: str | None = None,
    image_size: str | None = None,
) -> RepaintResult:
    effective_key = api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not effective_key:
        raise ValueError("Missing Gemini API key. Set GEMINI_API_KEY or pass --api-key.")

    mime_type = _detect_mime_type(input_path)
    image_bytes = input_path.read_bytes()
    payload: dict[str, Any] = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64.b64encode(image_bytes).decode("utf-8"),
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
        },
    }

    image_config: dict[str, Any] = {}
    if aspect_ratio:
        image_config["aspectRatio"] = aspect_ratio
    if image_size and model in GEMINI_MODELS_WITH_IMAGE_SIZE:
        image_config["imageSize"] = image_size
    if image_config:
        payload["generationConfig"]["imageConfig"] = image_config

    request = Request(
        url=f"{GEMINI_API_BASE}/models/{model}:generateContent",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": effective_key,
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=300) as response:
            body = response.read().decode("utf-8")
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini request failed: HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Gemini request failed: {error.reason}") from error

    payload = json.loads(body)
    parts = (
        payload.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    text_notes: list[str] = []
    output_bytes: bytes | None = None
    output_mime = "image/png"

    for part in parts:
        text = part.get("text")
        if text:
            text_notes.append(text)
        inline_data = part.get("inlineData") or part.get("inline_data")
        if inline_data and inline_data.get("data"):
            output_bytes = base64.b64decode(inline_data["data"])
            output_mime = inline_data.get("mimeType") or inline_data.get("mime_type") or output_mime
            break

    if output_bytes is None:
        raise RuntimeError(f"Gemini returned no image output: {json.dumps(payload, indent=2)}")

    written_path = _write_output_bytes(output_path, output_bytes, output_mime)
    return RepaintResult(
        provider="gemini",
        model=model,
        output_path=str(written_path),
        mime_type=output_mime,
        prompt=prompt,
        notes=text_notes,
    )


def run_nanobanana_repaint(
    input_path: Path,
    output_path: Path,
    prompt: str,
    *,
    api_key: str | None,
    model: str = DEFAULT_GEMINI_MODEL,
    aspect_ratio: str | None = None,
    image_size: str | None = None,
) -> RepaintResult:
    result = run_gemini_repaint(
        input_path=input_path,
        output_path=output_path,
        prompt=prompt,
        api_key=api_key,
        model=model,
        aspect_ratio=aspect_ratio,
        image_size=image_size,
    )
    return RepaintResult(
        provider=NANOBANANA_PROVIDER,
        model=result.model,
        output_path=result.output_path,
        mime_type=result.mime_type,
        prompt=result.prompt,
        notes=result.notes,
    )
