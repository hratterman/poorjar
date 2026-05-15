/**
 * main.js
 * Demo page controller.
 * Wires up gaze tracking, heatmap, and UI state machine.
 */

import { startCalibration, calibrationClick, startGaze, stopGaze } from './gaze.js';
import { HeatmapOverlay } from './heatmap.js';
import { startTracking, stopTracking, getMaxScrollDepth } from './tracking.js';

// ─── State ───────────────────────────────────────────────────────────────────
let demoState = 'idle'; // idle | calibrating | tracking | frozen
let heatmap = null;
let gazeCount = 0;
let clickCount = 0;
let timerStart = null;
let timerInterval = null;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const iframeWrapper = document.getElementById('demoIframeWrapper');
const heatmapContainer = document.getElementById('heatmapContainer');
const calibOverlay = document.getElementById('calibOverlay');
const calibDot = document.getElementById('calibDot');
const calibProgressText = document.getElementById('calibProgressText');
const calibInstructions = document.getElementById('calibInstructions');

const btnEnableWebcam = document.getElementById('btnEnableWebcam');
const btnCapture = document.getElementById('btnCapture');
const btnReset = document.getElementById('btnReset');
const btnRestart = document.getElementById('btnRestart');
const calibProgress = document.getElementById('calibProgress');

const statGaze = document.getElementById('statGaze');
const statClicks = document.getElementById('statClicks');
const statScroll = document.getElementById('statScroll');
const finalGaze = document.getElementById('finalGaze');
const finalClicks = document.getElementById('finalClicks');
const finalScroll = document.getElementById('finalScroll');
const demoTimer = document.getElementById('demoTimer');

// ─── Step UI helpers ──────────────────────────────────────────────────────────
function showStep(n) {
  for (let i = 0; i <= 3; i++) {
    const el = document.getElementById(`demoStep${i}`);
    if (el) {
      el.classList.toggle('active', i === n);
    }
  }
}

// ─── Calibration UI ───────────────────────────────────────────────────────────
function showCalibOverlay() {
  calibOverlay.classList.add('active');
  calibInstructions.style.display = 'block';
  setTimeout(() => {
    calibInstructions.style.display = 'none';
  }, 3000);
}

function hideCalibOverlay() {
  calibOverlay.classList.remove('active');
  calibDot.classList.remove('active', 'captured');
}

function onCalibPoint(index, point, captured) {
  calibProgressText.textContent = `${index} / 9`;
  calibProgress.textContent = `${index} / 9 points captured`;

  if (!captured) {
    calibDot.style.left = point.x + 'px';
    calibDot.style.top = point.y + 'px';
    calibDot.classList.remove('captured');
    calibDot.classList.add('active');
  } else {
    calibDot.classList.add('captured');
    calibProgressText.textContent = `${index + 1} / 9`;
    calibProgress.textContent = `${index + 1} / 9 points captured`;
  }
}

function onCalibComplete(success) {
  hideCalibOverlay();
  if (!success) {
    alert('Calibration failed. Not enough gaze data captured. Please try again with better lighting.');
    showStep(0);
    demoState = 'idle';
    return;
  }
  startTracking(onTrackingEvent);
  activateGaze();
}

// ─── Gaze / heatmap ──────────────────────────────────────────────────────────
function activateGaze() {
  demoState = 'tracking';
  showStep(2);
  gazeCount = 0;
  clickCount = 0;
  timerStart = Date.now();

  iframeWrapper.classList.add('interactive');

  // Set up heatmap overlay
  heatmap = new HeatmapOverlay();
  heatmap.attach(heatmapContainer);

  // Start timer display
  timerInterval = setInterval(updateTimer, 1000);

  startGaze(onGazePoint);
}

function onGazePoint(pt) {
  if (demoState !== 'tracking') return;

  gazeCount++;
  statGaze.textContent = gazeCount;

  // Convert screen coordinates to iframe-container-local coordinates
  const rect = heatmapContainer.getBoundingClientRect();
  const lx = pt.x - rect.left;
  const ly = pt.y - rect.top;

  if (lx >= 0 && ly >= 0 && lx <= rect.width && ly <= rect.height) {
    heatmap.addLocalPoint(lx, ly);
  }
}

function onTrackingEvent(event) {
  if (event.type === 'click' || event.type === 'rage_click') {
    clickCount++;
    statClicks.textContent = clickCount;
  }
  if (event.type === 'scroll') {
    const pct = Math.round(event.depth * 100);
    statScroll.textContent = pct + '%';
  }
}

function updateTimer() {
  if (!timerStart) return;
  const elapsed = Math.floor((Date.now() - timerStart) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  demoTimer.textContent = `${m}:${s}`;
}

// ─── Button handlers ──────────────────────────────────────────────────────────
if (btnEnableWebcam) {
  btnEnableWebcam.addEventListener('click', async () => {
    btnEnableWebcam.disabled = true;
    btnEnableWebcam.textContent = 'Requesting camera...';

    try {
      // Quick permission check
      await navigator.mediaDevices.getUserMedia({ video: true }).then(s => {
        s.getTracks().forEach(t => t.stop());
      });
    } catch {
      alert('Camera permission denied. PoorJar needs your webcam for gaze tracking.\n\nIf you denied it, reload the page and allow camera access when prompted.');
      btnEnableWebcam.disabled = false;
      btnEnableWebcam.textContent = 'Enable webcam';
      return;
    }

    demoState = 'calibrating';
    showStep(1);
    showCalibOverlay();

    try {
      await startCalibration(onCalibPoint, onCalibComplete);
    } catch (err) {
      console.error('Calibration error:', err);
      alert('Something went wrong starting gaze tracking. Check the console for details. Make sure you\'re using Chrome or Edge.');
      demoState = 'idle';
      showStep(0);
      hideCalibOverlay();
    }
  });
}

// Calibration dot click handler
if (calibDot) {
  calibDot.addEventListener('click', () => {
    calibrationClick();
  });
}

if (btnCapture) {
  btnCapture.addEventListener('click', () => {
    if (demoState !== 'tracking') return;
    demoState = 'frozen';

    stopGaze();
    stopTracking();
    clearInterval(timerInterval);

    if (heatmap) heatmap.freeze();
    iframeWrapper.classList.remove('interactive');

    // Snapshot final scroll depth
    const scrollPct = Math.round(getMaxScrollDepth() * 100);
    statScroll.textContent = scrollPct + '%';

    finalGaze.textContent = gazeCount;
    finalClicks.textContent = clickCount;
    finalScroll.textContent = scrollPct + '%';

    showStep(3);
  });
}

if (btnReset) {
  btnReset.addEventListener('click', resetDemo);
}

if (btnRestart) {
  btnRestart.addEventListener('click', resetDemo);
}

function resetDemo() {
  stopGaze();
  stopTracking();
  clearInterval(timerInterval);

  if (heatmap) {
    heatmap.destroy();
    heatmap = null;
  }

  iframeWrapper.classList.remove('interactive');
  hideCalibOverlay();

  gazeCount = 0;
  clickCount = 0;
  timerStart = null;
  demoState = 'idle';

  showStep(0);

  if (btnEnableWebcam) {
    btnEnableWebcam.disabled = false;
    btnEnableWebcam.textContent = 'Enable webcam';
    btnEnableWebcam.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><path d="M16 3l-4 4-4-4"/></svg>
      Enable webcam
    `;
  }

  if (statGaze) statGaze.textContent = '0';
  if (statClicks) statClicks.textContent = '0';
  if (statScroll) statScroll.textContent = '0%';
  if (demoTimer) demoTimer.textContent = '00:00';
}
