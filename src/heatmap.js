/**
 * heatmap.js
 * Canvas-based gaze heatmap overlay.
 * Positions absolute over a target element.
 * Uses a Float32Array intensity field + Gaussian blobs + color gradient.
 */

export class HeatmapOverlay {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.width = 0;
    this.height = 0;
    this.intensityData = null;
    this.targetEl = null;
    this.renderInterval = null;
    this.pointCount = 0;

    // Gaussian parameters
    this.BLOB_RADIUS = 80;
    this.BLOB_SIGMA = 30;

    // Pre-compute Gaussian kernel
    this._kernel = null;
    this._kernelSize = 0;
  }

  _buildKernel() {
    const r = this.BLOB_RADIUS;
    const sigma = this.BLOB_SIGMA;
    const size = r * 2 + 1;
    this._kernelSize = size;
    this._kernel = new Float32Array(size * size);

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const val = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        this._kernel[(dy + r) * size + (dx + r)] = val;
      }
    }
  }

  attach(element) {
    this.targetEl = element;

    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.mixBlendMode = 'screen';

    element.appendChild(this.canvas);
    this._resize();
    this._buildKernel();

    // Re-size if container changes
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(element);

    // Start render loop
    this.renderInterval = setInterval(() => this._render(), 100);
  }

  _resize() {
    const rect = this.targetEl.getBoundingClientRect();
    this.width = Math.floor(rect.width) || 600;
    this.height = Math.floor(rect.height) || 400;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');

    // Re-allocate intensity array
    this.intensityData = new Float32Array(this.width * this.height);
    this._buildKernel();
  }

  /**
   * Add a gaze point. Coords are relative to the document (screen space).
   * We convert to canvas-local coordinates using the element's bounding rect.
   */
  addPoint(screenX, screenY) {
    const rect = this.targetEl.getBoundingClientRect();
    const lx = screenX - rect.left;
    const ly = screenY - rect.top;
    this._addLocalPoint(lx, ly);
    this.pointCount++;
  }

  /**
   * Add a point that's already in canvas-local coordinates.
   */
  addLocalPoint(lx, ly) {
    this._addLocalPoint(lx, ly);
    this.pointCount++;
  }

  _addLocalPoint(lx, ly) {
    if (!this.intensityData) return;

    const r = this.BLOB_RADIUS;
    const size = this._kernelSize;
    const cx = Math.round(lx);
    const cy = Math.round(ly);

    const x0 = Math.max(0, cx - r);
    const x1 = Math.min(this.width - 1, cx + r);
    const y0 = Math.max(0, cy - r);
    const y1 = Math.min(this.height - 1, cy + r);

    for (let py = y0; py <= y1; py++) {
      const ky = py - cy + r;
      for (let px = x0; px <= x1; px++) {
        const kx = px - cx + r;
        const kernelVal = this._kernel[ky * size + kx];
        this.intensityData[py * this.width + px] += kernelVal;
      }
    }
  }

  _render() {
    if (!this.ctx || !this.intensityData) return;

    const w = this.width;
    const h = this.height;

    // Find max for normalization
    let maxVal = 0;
    for (let i = 0; i < this.intensityData.length; i++) {
      if (this.intensityData[i] > maxVal) maxVal = this.intensityData[i];
    }

    if (maxVal === 0) return;

    const imageData = this.ctx.createImageData(w, h);
    const data = imageData.data;

    for (let i = 0; i < this.intensityData.length; i++) {
      const t = this.intensityData[i] / maxVal;
      const [r, g, b, a] = this._colorGradient(t);
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = a;
    }

    this.ctx.clearRect(0, 0, w, h);
    this.ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Color gradient:
   * 0     = transparent
   * 0.20  = blue   rgba(0,0,255,0.3)
   * 0.50  = cyan   rgba(0,255,255,0.5)
   * 0.70  = green  rgba(0,255,0,0.6)
   * 0.85  = yellow rgba(255,255,0,0.7)
   * 1.00  = red    rgba(255,0,0,0.8)
   */
  _colorGradient(t) {
    if (t <= 0) return [0, 0, 0, 0];

    // Stops: [t, r, g, b, a]
    const stops = [
      [0.00,   0,   0,   0,   0],
      [0.20,   0,   0, 255,  77],
      [0.50,   0, 255, 255, 128],
      [0.70,   0, 255,   0, 153],
      [0.85, 255, 255,   0, 178],
      [1.00, 255,   0,   0, 204],
    ];

    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const prev = stops[i - 1];
        const next = stops[i];
        const ratio = (t - prev[0]) / (next[0] - prev[0]);
        return [
          Math.round(prev[1] + (next[1] - prev[1]) * ratio),
          Math.round(prev[2] + (next[2] - prev[2]) * ratio),
          Math.round(prev[3] + (next[3] - prev[3]) * ratio),
          Math.round(prev[4] + (next[4] - prev[4]) * ratio),
        ];
      }
    }

    return [255, 0, 0, 204];
  }

  clear() {
    if (this.intensityData) {
      this.intensityData.fill(0);
    }
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
    this.pointCount = 0;
  }

  getImageDataURL() {
    this._render();
    return this.canvas ? this.canvas.toDataURL('image/png') : null;
  }

  freeze() {
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }
    this._render();
  }

  destroy() {
    if (this.renderInterval) clearInterval(this.renderInterval);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}
