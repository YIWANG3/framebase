# Text Overlay Tool — Implementation Plan

## Architecture Overview

Text tool integrates into EditorOverlay as a new `tool === "text"` mode, following the same patterns as crop and AI repaint. Text layers are rendered on a separate canvas overlay, composited onto the image at Apply time.

## Phase 1: Tool Entry + Empty Panel

**Files:**
- `EditorOverlay.jsx` — Add "text" to tool switching, add ToolTab, add empty TextPanel mount point

**Changes:**
1. Add `tool === "text"` branch in panelMeta (line ~601)
2. Add TextPanel render slot alongside crop/AI panels (line ~1570)
3. Add ToolTab for Type icon between Crop and AI Repaint (line ~1589)
4. Create `components/editor/TextPanel.jsx` — empty shell with panel header "Text"

## Phase 2: Text Layer State & Data Model

**Files:**
- `components/editor/textState.js` — State helpers and defaults

**Data model:**
```js
{
  id: string,
  text: string,
  fontFamily: string,
  fontSize: number,        // 12-200
  bold: boolean,
  italic: boolean,
  underline: boolean,
  align: 'left' | 'center' | 'right',
  fillMode: 'solid' | 'gradient',
  fillColor: string,       // hex
  gradientFrom: string,
  gradientTo: string,
  gradientAngle: number,
  opacity: number,         // 0-100
  strokeEnabled: boolean,
  strokeColor: string,
  strokeWidth: number,
  bgMode: 'none' | 'solid' | 'blur',
  bgColor: string,
  bgOpacity: number,
  shadow: boolean,
  shadowX: number,
  shadowY: number,
  shadowBlur: number,
  shadowSpread: number,
  shadowColor: string,
  shadowOpacity: number,
  // Transform
  x: number, y: number,   // normalized 0-1 relative to image
  width: number,           // auto from text measurement
  height: number,
  rotation: number,        // degrees
  // Meta
  preset: string | null,
}
```

**State in EditorOverlay:**
```js
const [textLayers, setTextLayers] = useState([]);
const [selectedLayerIds, setSelectedLayerIds] = useState(new Set());
```

## Phase 3: Canvas Rendering — Text Overlay Layer

**Files:**
- `components/editor/TextCanvas.jsx` — Canvas overlay for rendering text layers

**Approach:**
- Separate `<canvas>` element positioned exactly over the image canvas
- Re-renders whenever textLayers state changes
- Each layer: measure text → draw background → draw text → draw stroke → draw shadow
- Selected layer: draw selection frame (dashed border + 8 handles + rotation handle)
- Uses requestAnimationFrame for smooth updates during drag

**Rendering pipeline per layer:**
1. Save context, apply transform (translate + rotate)
2. If shadow enabled: set shadowColor/Blur/OffsetX/Y
3. If bgMode !== 'none': draw background rect
4. Set font, fillStyle, textAlign
5. fillText (or gradient fill via createLinearGradient)
6. If stroke: strokeText
7. If selected: draw selection UI (not composited to final)

## Phase 4: TextPanel — Full Controls UI

**Files:**
- `components/editor/TextPanel.jsx` — Complete panel with all sections

**Sections (top to bottom):**
1. **Presets** — 4-column grid, 8 preset styles, click to apply
2. **Text Layers** — Layer list with multi-select (Shift+click), + button, delete button
3. **Alignment toolbar** — Shown when 2+ selected: 6 align + 2 distribute buttons
4. **Content** — Textarea + left/center/right alignment buttons
5. **Font** — Font family dropdown + size slider/input
6. **Style** — B / I / U toggles
7. **Fill** — Solid/Gradient toggle, color swatches, gradient controls, opacity
8. **Stroke** — Enable toggle, color, width
9. **Background** — None/Solid/Blur mode buttons
10. **Shadow** — Enable toggle, X/Y/Blur/Spread inputs, color + opacity
11. **Footer** — Reset, Undo, Redo, Apply

## Phase 5: Canvas Interactions — Drag, Resize, Rotate

**Files:**
- `components/editor/TextCanvas.jsx` — Pointer event handlers

**Interactions:**
1. **Click canvas** → Select/deselect layer (hit test)
2. **Click empty area** → Deselect all (or create new layer on double-click)
3. **Drag layer body** → Move (update x, y)
4. **Drag corner handle** → Resize (scale fontSize proportionally)
5. **Drag edge handle** → Resize width/height
6. **Drag rotation handle** → Rotate
7. **Shift+click** → Multi-select in layer list
8. **Delete key** → Remove selected layers

**Hit testing:**
- Transform mouse coords to each layer's local space
- Check if point is inside text bounding box
- Check if point is on a handle (8px radius)
- Check if point is on rotation handle (12px radius)

## Phase 6: Multi-Layer Alignment

**Files:**
- `components/editor/textAlign.js` — Alignment math utilities

**Functions:**
- `alignLeft(layers)` — Align left edges to leftmost
- `alignCenterH(layers)` — Align horizontal centers
- `alignRight(layers)` — Align right edges to rightmost
- `alignTop(layers)` — Align top edges to topmost
- `alignCenterV(layers)` — Align vertical centers
- `alignBottom(layers)` — Align bottom edges to bottommost
- `distributeH(layers)` — Equal horizontal spacing
- `distributeV(layers)` — Equal vertical spacing

## Phase 7: Apply — Composite Text onto Image

**Changes in EditorOverlay.jsx:**

When `tool === "text"` and user clicks Apply:
1. Get current image canvas (after crop transforms)
2. Create composite canvas at full resolution
3. Draw image onto composite
4. For each text layer (sorted by z-order):
   - Scale coordinates from normalized to pixel space
   - Apply rotation transform
   - Draw background, text, stroke, shadow (same pipeline as preview)
5. Replace sourceImage with composite result
6. Clear text layers, reset history

This follows the same pattern as crop Apply — composites edits into the working image.

## Phase 8: Undo/Redo for Text

**Approach:**
- Reuse the existing history pattern from EditorOverlay
- Each text edit (add/remove/modify layer, move, resize) pushes a snapshot
- `textLayers` array is the snapshot unit (clone on each change)
- Undo/Redo pops from history stack

## Implementation Order

1. Phase 1 → Phase 2 → Phase 4 (get the panel working with state)
2. Phase 3 → Phase 5 (get canvas rendering + interactions)
3. Phase 6 (alignment)
4. Phase 7 (apply/composite)
5. Phase 8 (undo/redo)

Each phase is independently testable. Phase 1-4 gives a working panel UI. Phase 3+5 gives interactive canvas. Phase 7 makes it actually useful.
