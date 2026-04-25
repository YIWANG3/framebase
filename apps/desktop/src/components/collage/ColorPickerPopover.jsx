import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

// ── Color math ────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const toHex = (n) => Math.round(n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s, v };
}

function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function hexToHsv(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

function hsvToHex(h, s, v) {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

// ── SB Area ───────────────────────────────────────────────

function SatBrightArea({ hue, sat, val, onChange }) {
  const ref = useRef(null);

  const update = useCallback((e) => {
    const rect = ref.current.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    onChange(s, v);
  }, [onChange]);

  function onDown(e) {
    e.preventDefault();
    ref.current.setPointerCapture(e.pointerId);
    update(e);
  }

  function onMove(e) {
    if (!ref.current.hasPointerCapture(e.pointerId)) return;
    update(e);
  }

  return (
    <div
      ref={ref}
      className="relative cursor-crosshair rounded"
      style={{
        width: 208,
        height: 200,
        backgroundColor: `hsl(${hue}, 100%, 50%)`,
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
    >
      {/* Saturation: white → transparent */}
      <div className="absolute inset-0 rounded" style={{ background: "linear-gradient(to right, #fff, transparent)" }} />
      {/* Brightness: transparent → black */}
      <div className="absolute inset-0 rounded" style={{ background: "linear-gradient(to bottom, transparent, #000)" }} />
      {/* Handle */}
      <div
        className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
        style={{
          left: `${sat * 100}%`,
          top: `${(1 - val) * 100}%`,
          boxShadow: "0 0 2px rgba(0,0,0,0.6)",
        }}
      />
    </div>
  );
}

// ── Hue Slider ────────────────────────────────────────────

function HueSlider({ hue, onChange }) {
  const ref = useRef(null);

  const update = useCallback((e) => {
    const rect = ref.current.getBoundingClientRect();
    const h = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
    onChange(h);
  }, [onChange]);

  function onDown(e) {
    e.preventDefault();
    ref.current.setPointerCapture(e.pointerId);
    update(e);
  }

  function onMove(e) {
    if (!ref.current.hasPointerCapture(e.pointerId)) return;
    update(e);
  }

  return (
    <div
      ref={ref}
      className="relative cursor-pointer rounded-full"
      style={{
        width: 208,
        height: 12,
        background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
    >
      <div
        className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
        style={{
          left: `${(hue / 360) * 100}%`,
          boxShadow: "0 0 2px rgba(0,0,0,0.6)",
        }}
      />
    </div>
  );
}

// ── Main Popover ──────────────────────────────────────────

export default function ColorPickerPopover({ color, onChange, onClose, anchorEl }) {
  const popoverRef = useRef(null);
  const hueRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Init HSV from incoming hex
  const initial = hexToHsv(color || "#000000");
  if (initial.s > 0.01 || initial.v > 0.01) hueRef.current = initial.h;

  const [hsv, setHsv] = useState({ h: hueRef.current, s: initial.s, v: initial.v });
  const [hexDraft, setHexDraft] = useState((color || "#000000").replace("#", "").toUpperCase());
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Position near anchor
  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const popW = 240;
    const popH = 310;
    let top = rect.top - popH - 8;
    let left = rect.left;
    // Fall back below if not enough space above
    if (top < 8) top = rect.bottom + 8;
    // Clamp horizontal
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    if (left < 8) left = 8;
    setPos({ top, left });
  }, [anchorEl]);

  // Sync hex draft when hsv changes internally
  useEffect(() => {
    const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
    setHexDraft(hex.replace("#", "").toUpperCase());
    onChange(hex);
  }, [hsv.h, hsv.s, hsv.v]);

  // Click outside — delay registration by one frame to avoid catching the opening click
  useEffect(() => {
    let id;
    function handle(e) {
      if (popoverRef.current?.contains(e.target)) return;
      if (anchorEl?.contains(e.target)) return;
      onCloseRef.current();
    }
    function handleKey(e) {
      if (e.key === "Escape") onCloseRef.current();
    }
    id = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", handle);
      document.addEventListener("keydown", handleKey);
    });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("pointerdown", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [anchorEl]);

  function onSBChange(s, v) {
    setHsv((prev) => {
      if (s > 0.01 || v > 0.01) hueRef.current = prev.h;
      return { h: prev.h, s, v };
    });
  }

  function onHueChange(h) {
    hueRef.current = h;
    setHsv((prev) => ({ ...prev, h }));
  }

  function onHexCommit() {
    const cleaned = hexDraft.replace("#", "").trim();
    if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
      const parsed = hexToHsv(`#${cleaned}`);
      if (parsed.s > 0.01 || parsed.v > 0.01) hueRef.current = parsed.h;
      setHsv({ h: hueRef.current, s: parsed.s, v: parsed.v });
    } else {
      // Revert to current
      setHexDraft(hsvToHex(hsv.h, hsv.s, hsv.v).replace("#", "").toUpperCase());
    }
  }

  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[10300] rounded-lg border border-border bg-panel p-3 shadow-overlay"
      style={{ top: pos.top, left: pos.left, width: 240 }}
    >
      <div className="space-y-3">
        {/* SB Area */}
        <SatBrightArea hue={hsv.h} sat={hsv.s} val={hsv.v} onChange={onSBChange} />

        {/* Hue Slider */}
        <HueSlider hue={hsv.h} onChange={onHueChange} />

        {/* Hex Input + Preview */}
        <div className="flex items-center gap-2">
          <div
            className="h-7 w-7 shrink-0 rounded border border-border"
            style={{ backgroundColor: currentHex }}
          />
          <div className="flex flex-1 items-center rounded border border-border/60 bg-app px-2 py-1">
            <span className="text-[11px] text-muted2">#</span>
            <input
              type="text"
              value={hexDraft}
              onChange={(e) => setHexDraft(e.target.value.toUpperCase())}
              onBlur={onHexCommit}
              onKeyDown={(e) => { if (e.key === "Enter") onHexCommit(); }}
              maxLength={6}
              className="ml-0.5 w-full bg-transparent text-[12px] text-text outline-none"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
