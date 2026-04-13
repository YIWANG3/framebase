# Image Editor UI — Requirement Spec

Generate a single-file HTML mockup for a desktop image editor overlay. This is a full-screen editing mode inside a photo management app (Electron, dark theme). The mockup should be static but interactive enough to demonstrate tool switching and panel states.

## Context

- The editor opens from a photo gallery/lightbox view, and the user needs a way to exit back
- The source image has a filename (e.g. `IMG_2847.jpg`) that should be visible somewhere
- Dark theme. Background: near-black. Use a CSS gradient to simulate the photo being edited

## Tools Available

The editor has 4 tools. Each tool has its own set of adjustable parameters:

### 1. Crop & Transform
- Aspect ratio presets: Free, Original, 1:1, 3:2, 4:3, 5:4, 16:9, 21:9, 4:5, 9:16, 1.91:1, 5:7, 8.5:11, A4
- Rotate: 90° left, 90° right
- Flip: horizontal, vertical
- Free angle rotation: slider from -45° to +45°
- Crop changes apply in real-time (no confirm/cancel step)
- Show crop overlay on the image: darkened mask outside crop area, rule-of-thirds grid inside, corner and edge drag handles

### 2. Text Overlay
- Add text elements on the canvas, drag to position
- Properties: font family (dropdown), font size (px), color (preset swatches + custom), bold/italic/underline, text alignment (left/center/right), opacity (0-100%)
- Can delete selected text element

### 3. AI Repaint (inpainting)
- Brush tool to paint a mask area on the image
- Brush sizes: small, medium, large
- Mask actions: clear, invert
- Mode: Replace, Fill, Remove
- Text prompt input for what to generate
- Generate button

### 4. AI Generate (style transfer)
- Text prompt input
- Style presets: Realistic, Illustration, Watercolor, Oil Paint, Sketch, Anime
- Strength slider (0-100%)

## Global Actions

These actions are always available regardless of which tool is active:

- **Undo / Redo**: step through edit history
- **Reset**: revert all changes to original state
- **Save**: export the edited image. Must open a save dialog with:
  - File name input (default: `{original_name}_edited.{ext}`)
  - Directory picker (default: same directory as source file), with a Browse button
  - Format selection: JPEG, PNG, WebP
  - Save / Cancel buttons
- **Close / Exit**: leave the editor, return to gallery view

## Design Constraints

- Font: `DM Sans` (Google Fonts)
- Icons: inline SVG (Lucide style — thin stroke, rounded caps)
- The image canvas should take up as much space as possible
- Panels/controls should float over the canvas, not consume fixed layout columns
- Use glass-morphism for floating panels (semi-transparent background + backdrop blur)
- No serif fonts, no slow entrance animations
- Prioritize efficiency: minimize mouse travel between related actions
- Think carefully about which controls are tool-specific vs. global, and group them accordingly
- Consider the natural workflow: tool selection → parameter adjustment → global actions (undo/save)

## Deliverable

A single self-contained HTML file with embedded CSS and JS. Tool switching should work (clicking a tool shows its parameter panel). The save dialog should open/close. No external dependencies except the Google Fonts import.
