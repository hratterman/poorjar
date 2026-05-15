/**
 * tracking.js
 * Behavioral event tracking: clicks, scroll depth, mousemove, rage clicks.
 */

let _onEvent = null;
let _events = [];
let _mouseInterval = null;
let _lastMouseX = 0;
let _lastMouseY = 0;
let _mouseMoved = false;

// Rage click detection
const RAGE_WINDOW_MS = 400;
const RAGE_RADIUS_PX = 50;
const RAGE_MIN_CLICKS = 3;
let _recentClicks = [];

// Scroll depth tracking
let _maxScrollDepth = 0;

function _ts() {
  return Date.now();
}

function _getSelector(el) {
  if (!el || el === document.body) return 'body';
  const parts = [];
  let cur = el;
  for (let i = 0; i < 4 && cur && cur !== document.body; i++) {
    let part = cur.tagName.toLowerCase();
    if (cur.id) {
      part += '#' + cur.id;
      parts.unshift(part);
      break;
    }
    if (cur.className && typeof cur.className === 'string') {
      const cls = cur.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (cls) part += '.' + cls;
    }
    parts.unshift(part);
    cur = cur.parentElement;
  }
  return parts.join(' > ') || el.tagName.toLowerCase();
}

function _emit(event) {
  _events.push(event);
  if (_onEvent) _onEvent(event);
}

function _handleClick(e) {
  const now = _ts();
  const x = e.clientX;
  const y = e.clientY;

  _emit({
    type: 'click',
    x,
    y,
    selector: _getSelector(e.target),
    timestamp: now,
  });

  // Rage click detection
  _recentClicks = _recentClicks.filter(c => now - c.ts < RAGE_WINDOW_MS);
  _recentClicks.push({ x, y, ts: now });

  const nearby = _recentClicks.filter(c => {
    const dx = c.x - x;
    const dy = c.y - y;
    return Math.sqrt(dx * dx + dy * dy) <= RAGE_RADIUS_PX;
  });

  if (nearby.length >= RAGE_MIN_CLICKS) {
    _emit({
      type: 'rage_click',
      x,
      y,
      timestamp: now,
    });
    _recentClicks = [];
  }
}

function _handleScroll() {
  const el = document.documentElement;
  const scrolled = el.scrollTop || document.body.scrollTop;
  const total = el.scrollHeight - el.clientHeight;
  const depth = total > 0 ? Math.min(1, scrolled / total) : 0;

  if (depth > _maxScrollDepth) {
    _maxScrollDepth = depth;
    _emit({
      type: 'scroll',
      depth,
      timestamp: _ts(),
    });
  }
}

function _handleMouseMove(e) {
  _lastMouseX = e.clientX;
  _lastMouseY = e.clientY;
  _mouseMoved = true;
}

function _startMouseSampling() {
  _mouseInterval = setInterval(() => {
    if (_mouseMoved) {
      _emit({
        type: 'mousemove',
        x: _lastMouseX,
        y: _lastMouseY,
        timestamp: _ts(),
      });
      _mouseMoved = false;
    }
  }, 100);
}

export function startTracking(onEvent) {
  _onEvent = onEvent;
  _events = [];
  _maxScrollDepth = 0;
  _recentClicks = [];

  document.addEventListener('click', _handleClick, true);
  document.addEventListener('scroll', _handleScroll, { passive: true });
  document.addEventListener('mousemove', _handleMouseMove, { passive: true });
  _startMouseSampling();
}

export function stopTracking() {
  document.removeEventListener('click', _handleClick, true);
  document.removeEventListener('scroll', _handleScroll);
  document.removeEventListener('mousemove', _handleMouseMove);
  if (_mouseInterval) {
    clearInterval(_mouseInterval);
    _mouseInterval = null;
  }
  _onEvent = null;
}

export function getEvents() {
  return [..._events];
}

export function getMaxScrollDepth() {
  return _maxScrollDepth;
}
