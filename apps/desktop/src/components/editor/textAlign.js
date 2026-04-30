// Alignment uses normalized coordinates (0-1).
// Each layer has x, y as center point.

export function alignLeft(layers) {
  const minX = Math.min(...layers.map((l) => l.x));
  return layers.map((l) => ({ ...l, x: minX }));
}

export function alignCenterH(layers) {
  const avg = layers.reduce((s, l) => s + l.x, 0) / layers.length;
  return layers.map((l) => ({ ...l, x: avg }));
}

export function alignRight(layers) {
  const maxX = Math.max(...layers.map((l) => l.x));
  return layers.map((l) => ({ ...l, x: maxX }));
}

export function alignTop(layers) {
  const minY = Math.min(...layers.map((l) => l.y));
  return layers.map((l) => ({ ...l, y: minY }));
}

export function alignCenterV(layers) {
  const avg = layers.reduce((s, l) => s + l.y, 0) / layers.length;
  return layers.map((l) => ({ ...l, y: avg }));
}

export function alignBottom(layers) {
  const maxY = Math.max(...layers.map((l) => l.y));
  return layers.map((l) => ({ ...l, y: maxY }));
}

export function distributeH(layers) {
  if (layers.length < 3) return layers;
  const sorted = [...layers].sort((a, b) => a.x - b.x);
  const min = sorted[0].x;
  const max = sorted[sorted.length - 1].x;
  const step = (max - min) / (sorted.length - 1);
  const map = new Map(sorted.map((l, i) => [l.id, min + i * step]));
  return layers.map((l) => ({ ...l, x: map.get(l.id) ?? l.x }));
}

export function distributeV(layers) {
  if (layers.length < 3) return layers;
  const sorted = [...layers].sort((a, b) => a.y - b.y);
  const min = sorted[0].y;
  const max = sorted[sorted.length - 1].y;
  const step = (max - min) / (sorted.length - 1);
  const map = new Map(sorted.map((l, i) => [l.id, min + i * step]));
  return layers.map((l) => ({ ...l, y: map.get(l.id) ?? l.y }));
}
