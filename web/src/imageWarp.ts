// Warps an uploaded reference image (e.g. a Google Maps screenshot) onto the
// live map, given >=2 correspondences between a pixel on the image and a
// point in the map's projected coordinate space (see store.ts's
// DrawControlPoint — this module only deals in generic {x,y} pairs, the
// caller (TacticalMap.tsx) is responsible for projecting each control
// point's lng/lat into whatever projection the view currently uses).
//
// Technique: fit an affine transform image-pixel -> projected-space, then
// pre-render the source image into an axis-aligned offscreen canvas via
// Canvas2D's own affine transform (ctx.setTransform), and hand that canvas
// to OpenLayers as a plain ol/source/ImageStatic at the resulting extent.
// This avoids needing a custom warped-image OL source class — by the time
// OL sees it, it's just an axis-aligned raster like any other ImageStatic.

export interface Point2 {
  x: number;
  y: number;
}

export interface ControlPointPair {
  image: Point2;
  target: Point2;
}

// x' = a*x + c*y + e
// y' = b*x + d*y + f
// (same parameter order Canvas2D's ctx.setTransform(a,b,c,d,e,f) uses)
export interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

function solve3x3(m: number[][], rhs: number[]): number[] {
  // Cramer's rule — the design matrices here are always 3x3 (3 unknowns
  // per output coordinate: x-coefficient, y-coefficient, constant), so a
  // closed-form solve is simpler and just as robust as a general solver.
  const det3 = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const det = det3(m);
  if (Math.abs(det) < 1e-9) throw new Error('Control points are degenerate (collinear or duplicate) — cannot fit a transform.');
  const withCol = (col: number) => m.map((row, i) => row.map((v, j) => (j === col ? rhs[i] : v)));
  return [det3(withCol(0)) / det, det3(withCol(1)) / det, det3(withCol(2)) / det];
}

// Exactly 2 pairs: a similarity transform (uniform scale + rotation +
// translation, no independent shear) — the only fully-determined option
// with just 4 knowns (2 point pairs) and 4 unknowns.
function similarityTransform(pairs: ControlPointPair[]): AffineMatrix {
  const [p1, p2] = pairs;
  const dImgX = p2.image.x - p1.image.x;
  const dImgY = p2.image.y - p1.image.y;
  const dTgtX = p2.target.x - p1.target.x;
  const dTgtY = p2.target.y - p1.target.y;
  const denom = dImgX * dImgX + dImgY * dImgY;
  if (denom < 1e-9) throw new Error('Control points are duplicated on the image — cannot fit a transform.');
  // k = dTgt / dImg as a complex division: k = (kr, ki)
  const kr = (dTgtX * dImgX + dTgtY * dImgY) / denom;
  const ki = (dTgtY * dImgX - dTgtX * dImgY) / denom;
  const a = kr;
  const b = ki;
  const c = -ki;
  const d = kr;
  const e = p1.target.x - (kr * p1.image.x - ki * p1.image.y);
  const f = p1.target.y - (ki * p1.image.x + kr * p1.image.y);
  return { a, b, c, d, e, f };
}

// >=3 pairs: full 6-parameter affine, least-squares fit (exact if ==3,
// best-fit if more) — each output coordinate (target x, target y) is an
// independent linear regression against [imageX, imageY, 1].
function affineLeastSquares(pairs: ControlPointPair[]): AffineMatrix {
  // Normal equations: (M^T M) params = M^T rhs, where M's rows are
  // [imageX, imageY, 1].
  const MtM = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const MtRhsX = [0, 0, 0];
  const MtRhsY = [0, 0, 0];
  for (const { image, target } of pairs) {
    const row = [image.x, image.y, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) MtM[i][j] += row[i] * row[j];
      MtRhsX[i] += row[i] * target.x;
      MtRhsY[i] += row[i] * target.y;
    }
  }
  const [a, c, e] = solve3x3(MtM, MtRhsX);
  const [b, d, f] = solve3x3(MtM, MtRhsY);
  return { a, b, c, d, e, f };
}

export function computeAffineTransform(pairs: ControlPointPair[]): AffineMatrix {
  if (pairs.length < 2) throw new Error('At least 2 control points are required.');
  return pairs.length === 2 ? similarityTransform(pairs) : affineLeastSquares(pairs);
}

function applyAffine(m: AffineMatrix, p: Point2): Point2 {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

const MAX_CANVAS_DIMENSION = 1600;

export function renderWarpedCanvas(
  image: HTMLImageElement,
  matrix: AffineMatrix,
): { canvas: HTMLCanvasElement; extent: [number, number, number, number] } {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const corners = [
    applyAffine(matrix, { x: 0, y: 0 }),
    applyAffine(matrix, { x: w, y: 0 }),
    applyAffine(matrix, { x: w, y: h }),
    applyAffine(matrix, { x: 0, y: h }),
  ];
  const minX = Math.min(...corners.map((p) => p.x));
  const maxX = Math.max(...corners.map((p) => p.x));
  const minY = Math.min(...corners.map((p) => p.y));
  const maxY = Math.max(...corners.map((p) => p.y));
  const extentW = maxX - minX;
  const extentH = maxY - minY;

  // Uniform scale (same for both axes) so the canvas doesn't introduce any
  // distortion of its own beyond what the fitted affine already encodes.
  const scale = MAX_CANVAS_DIMENSION / Math.max(extentW, extentH);
  const canvasWidth = Math.max(1, Math.round(extentW * scale));
  const canvasHeight = Math.max(1, Math.round(extentH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;

  // Canvas-space = scale*(target - min), with Y flipped (canvas Y grows
  // downward, projected-map Y grows northward/upward) — composed with the
  // image->target affine gives image->canvas directly.
  ctx.setTransform(scale * matrix.a, -scale * matrix.b, scale * matrix.c, -scale * matrix.d, scale * (matrix.e - minX), scale * (maxY - matrix.f));
  ctx.drawImage(image, 0, 0, w, h);

  return { canvas, extent: [minX, minY, maxX, maxY] };
}
