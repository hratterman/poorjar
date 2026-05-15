/**
 * gaze.js
 * MediaPipe FaceMesh iris tracking with calibration and screen-space mapping.
 */

let faceMesh = null;
let camera = null;
let gazeCallback = null;
let prevSmoothed = null;
let isRunning = false;

// Calibration state
let calibrating = false;
let calibPoints = [];
let calibIrisPoints = [];
let currentCalibIndex = 0;
let currentSamples = [];
let sampleTimer = null;
let onCalibPointCallback = null;
let onCalibCompleteCallback = null;

// Regression coefficients
let regCoeffs = null; // { ax, bx, cx, ay, by, cy }

// Webcam video element
let videoEl = null;

// ─────────────────────────────────────────────
//  Math helpers
// ─────────────────────────────────────────────

function avgLandmarks(landmarks, start, end) {
  let x = 0, y = 0;
  const count = end - start + 1;
  for (let i = start; i <= end; i++) {
    x += landmarks[i].x;
    y += landmarks[i].y;
  }
  return { x: x / count, y: y / count };
}

function getIrisCenter(landmarks) {
  const left = avgLandmarks(landmarks, 468, 472);
  const right = avgLandmarks(landmarks, 473, 477);
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

/**
 * Least-squares linear regression.
 * Maps iris (ix, iy) -> screen (sx, sy)
 * sx = ax*ix + bx*iy + cx
 * sy = ay*ix + by*iy + cy
 */
function computeRegression(irisPoints, screenPoints) {
  const n = irisPoints.length;
  if (n < 6) return null;

  // Build matrices for least squares: A * coeffs = B
  // For x: [ix, iy, 1] * [ax, bx, cx]^T = sx
  let A = [];
  let Bx = [];
  let By = [];

  for (let i = 0; i < n; i++) {
    A.push([irisPoints[i].x, irisPoints[i].y, 1]);
    Bx.push(screenPoints[i].x);
    By.push(screenPoints[i].y);
  }

  // Normal equations: (A^T A) coeffs = A^T B
  function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  const col0 = A.map(r => r[0]);
  const col1 = A.map(r => r[1]);
  const col2 = A.map(r => r[2]);

  const ATA = [
    [dot(col0, col0), dot(col0, col1), dot(col0, col2)],
    [dot(col1, col0), dot(col1, col1), dot(col1, col2)],
    [dot(col2, col0), dot(col2, col1), dot(col2, col2)],
  ];

  const ATBx = [dot(col0, Bx), dot(col1, Bx), dot(col2, Bx)];
  const ATBy = [dot(col0, By), dot(col1, By), dot(col2, By)];

  function solve3x3(M, b) {
    // Gaussian elimination with partial pivoting
    const m = M.map(r => [...r]);
    const v = [...b];
    for (let col = 0; col < 3; col++) {
      let maxRow = col;
      for (let row = col + 1; row < 3; row++) {
        if (Math.abs(m[row][col]) > Math.abs(m[maxRow][col])) maxRow = row;
      }
      [m[col], m[maxRow]] = [m[maxRow], m[col]];
      [v[col], v[maxRow]] = [v[maxRow], v[col]];
      for (let row = col + 1; row < 3; row++) {
        if (Math.abs(m[col][col]) < 1e-10) continue;
        const factor = m[row][col] / m[col][col];
        for (let k = col; k < 3; k++) m[row][k] -= factor * m[col][k];
        v[row] -= factor * v[col];
      }
    }
    const x = [0, 0, 0];
    for (let i = 2; i >= 0; i--) {
      let s = v[i];
      for (let j = i + 1; j < 3; j++) s -= m[i][j] * x[j];
      x[i] = Math.abs(m[i][i]) < 1e-10 ? 0 : s / m[i][i];
    }
    return x;
  }

  const [ax, bx, cx] = solve3x3(ATA, ATBx);
  const [ay, by, cy] = solve3x3(ATA, ATBy);

  return { ax, bx, cx, ay, by, cy };
}

function applyRegression(iris) {
  if (!regCoeffs) return null;
  const { ax, bx, cx, ay, by, cy } = regCoeffs;
  return {
    x: ax * iris.x + bx * iris.y + cx,
    y: ay * iris.x + by * iris.y + cy,
  };
}

// ─────────────────────────────────────────────
//  Calibration dots (9 points, 3x3 grid)
// ─────────────────────────────────────────────

const CALIB_POSITIONS_PERCENT = [
  [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
  [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
  [0.1, 0.9], [0.5, 0.9], [0.9, 0.9],
];

function getCalibScreenPoints() {
  return CALIB_POSITIONS_PERCENT.map(([px, py]) => ({
    x: px * window.innerWidth,
    y: py * window.innerHeight,
  }));
}

function startCalibrationFlow(onPoint, onComplete) {
  calibPoints = getCalibScreenPoints();
  calibIrisPoints = [];
  calibrating = true;
  currentCalibIndex = 0;
  currentSamples = [];
  onCalibPointCallback = onPoint;
  onCalibCompleteCallback = onComplete;

  showCalibDot(currentCalibIndex);
}

function showCalibDot(index) {
  if (index >= calibPoints.length) {
    finishCalibration();
    return;
  }
  const pt = calibPoints[index];
  if (onCalibPointCallback) onCalibPointCallback(index, pt, false);

  // 1.5s dwell timer
  clearTimeout(sampleTimer);
  currentSamples = [];
  sampleTimer = setTimeout(() => {
    captureCalibPoint();
  }, 1500);
}

function captureCalibPoint() {
  clearTimeout(sampleTimer);
  if (currentSamples.length === 0) {
    // Skip and move on
    currentCalibIndex++;
    showCalibDot(currentCalibIndex);
    return;
  }

  // Average samples
  const avgX = currentSamples.reduce((s, p) => s + p.x, 0) / currentSamples.length;
  const avgY = currentSamples.reduce((s, p) => s + p.y, 0) / currentSamples.length;
  calibIrisPoints.push({ x: avgX, y: avgY });

  if (onCalibPointCallback) onCalibPointCallback(currentCalibIndex, calibPoints[currentCalibIndex], true);

  currentCalibIndex++;
  setTimeout(() => showCalibDot(currentCalibIndex), 300);
}

function calibDotClicked() {
  if (!calibrating) return;
  captureCalibPoint();
}

function finishCalibration() {
  calibrating = false;
  regCoeffs = computeRegression(calibIrisPoints, calibPoints.slice(0, calibIrisPoints.length));
  if (onCalibCompleteCallback) onCalibCompleteCallback(!!regCoeffs);
}

// ─────────────────────────────────────────────
//  FaceMesh setup
// ─────────────────────────────────────────────

function onResults(results) {
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;
  const landmarks = results.multiFaceLandmarks[0];
  if (landmarks.length < 478) return; // need iris landmarks

  const iris = getIrisCenter(landmarks);

  // During calibration: collect iris samples
  if (calibrating) {
    currentSamples.push(iris);
    return;
  }

  if (!isRunning || !regCoeffs || !gazeCallback) return;

  const raw = applyRegression(iris);
  if (!raw) return;

  // Exponential smoothing: 0.7 * prev + 0.3 * new
  let smoothed;
  if (!prevSmoothed) {
    smoothed = raw;
  } else {
    smoothed = {
      x: 0.7 * prevSmoothed.x + 0.3 * raw.x,
      y: 0.7 * prevSmoothed.y + 0.3 * raw.y,
    };
  }
  prevSmoothed = smoothed;
  gazeCallback(smoothed);
}

async function initFaceMesh() {
  if (faceMesh) return;

  faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  faceMesh.onResults(onResults);
}

async function startCamera() {
  videoEl = document.createElement('video');
  videoEl.style.display = 'none';
  document.body.appendChild(videoEl);

  await initFaceMesh();

  camera = new Camera(videoEl, {
    onFrame: async () => {
      await faceMesh.send({ image: videoEl });
    },
    width: 640,
    height: 480,
    facingMode: 'user',
  });

  await camera.start();
}

// ─────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────

export async function startCalibration(onPoint, onComplete) {
  await startCamera();
  calibrating = true;
  startCalibrationFlow(onPoint, onComplete);
}

export function calibrationClick() {
  calibDotClicked();
}

export function startGaze(onGazePoint) {
  gazeCallback = onGazePoint;
  isRunning = true;
  prevSmoothed = null;
}

export function stopGaze() {
  isRunning = false;
  gazeCallback = null;
  if (camera) {
    camera.stop();
    camera = null;
  }
  if (videoEl) {
    videoEl.remove();
    videoEl = null;
  }
  faceMesh = null;
}
