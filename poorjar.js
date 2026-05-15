/*!
 * poorjar.js v1.2.0
 * Open source analytics. Bring your own backend.
 * https://poorjar.com
 * MIT License
 */
// Capture currentScript immediately at parse time, before any async execution
var _pjScript = document.currentScript;

(function () {
  'use strict';

  var script = _pjScript;
  var endpoint = script && script.dataset.endpoint;
  var siteId   = script && script.dataset.siteId;
  var mode     = script && script.dataset.mode; // 'supabase' | 'sheets' | '' (default: custom webhook)
  var apiKey   = script && script.dataset.key;  // Supabase anon key for auth headers

  if (!endpoint) { console.warn('[PoorJar] no endpoint found — check script tag data-endpoint attribute'); return; }

  var sessionId = (Math.random().toString(16).slice(2,10) + Math.random().toString(16).slice(2,10)).slice(0,12);
  console.log('[PoorJar] initialized — site:', siteId, '| endpoint:', endpoint, '| mode:', mode);
  var vpW = window.innerWidth, vpH = window.innerHeight;

  var events = [];
  var recentClicks = [];
  var RAGE_MS = 600, RAGE_PX = 60, RAGE_MIN = 3;

  // Scroll milestones: fire exactly at 25 / 50 / 75 / 100 %
  var SCROLL_MILESTONES = [0.25, 0.50, 0.75, 1.00];
  var firedMilestones = [];

  // Mouse dwell — record position only when cursor pauses in same area
  var dwellTimer = null;
  var dwellAnchorX = 0, dwellAnchorY = 0;
  var DWELL_MS = 500, DWELL_PX = 30;

  // Mousemove throttle
  var lastMoveTs = 0;
  var MOVE_THROTTLE_MS = 50;

  function ts()           { return Date.now(); }
  function pageX(cx)      { return Math.round(cx + window.scrollX); }
  function pageY(cy)      { return Math.round(cy + window.scrollY); }

  function push(e) {
    events.push(e);
    console.log('[PoorJar] event queued:', e.type, '| queue length:', events.length);
    // Emit custom event so external tooling (test consoles, debuggers) can observe
    try {
      document.dispatchEvent(new CustomEvent('poorjar:event', { detail: e }));
    } catch(err) {}
  }

  function handleClick(e) {
    var now = ts();
    push({
      type: 'click',
      x: pageX(e.clientX), y: pageY(e.clientY),
      vx: Math.round(e.clientX), vy: Math.round(e.clientY),
      vpw: vpW, vph: vpH,
      timestamp: now, url: location.href,
      site_id: siteId, session_id: sessionId
    });

    recentClicks = recentClicks.filter(function(c){ return now - c.ts < RAGE_MS; });
    recentClicks.push({ x: e.clientX, y: e.clientY, ts: now });
    var nearby = recentClicks.filter(function(c){
      var dx = c.x - e.clientX, dy = c.y - e.clientY;
      return Math.sqrt(dx*dx + dy*dy) <= RAGE_PX;
    });
    if (nearby.length >= RAGE_MIN) {
      push({ type: 'rage_click', x: pageX(e.clientX), y: pageY(e.clientY), vpw: vpW, vph: vpH, timestamp: now, url: location.href, site_id: siteId, session_id: sessionId });
      recentClicks = [];
    }
  }

  function handleScroll() {
    var el = document.documentElement;
    var scrolled = el.scrollTop || document.body.scrollTop;
    var total = el.scrollHeight - el.clientHeight;
    var depth = total > 0 ? Math.min(1, scrolled / total) : 0;

    // Fire at each milestone exactly once
    for (var i = 0; i < SCROLL_MILESTONES.length; i++) {
      var m = SCROLL_MILESTONES[i];
      if (depth >= m && firedMilestones.indexOf(m) === -1) {
        firedMilestones.push(m);
        push({
          type: 'scroll',
          depth: m,
          scroll_y: Math.round(scrolled),
          vpw: vpW, vph: vpH,
          timestamp: ts(), url: location.href,
          site_id: siteId, session_id: sessionId
        });
      }
    }
  }

  function handleMouseMove(e) {
    var now = ts();

    // Throttle raw mousemove pushes
    if (now - lastMoveTs < MOVE_THROTTLE_MS) return;
    lastMoveTs = now;

    var cx = e.clientX, cy = e.clientY;
    var dx = cx - dwellAnchorX, dy = cy - dwellAnchorY;
    if (Math.sqrt(dx*dx + dy*dy) > DWELL_PX) {
      dwellAnchorX = cx; dwellAnchorY = cy;
      clearTimeout(dwellTimer);
      var snapX = cx, snapY = cy;
      dwellTimer = setTimeout(function() {
        push({ type: 'dwell', x: pageX(snapX), y: pageY(snapY), vx: Math.round(snapX), vy: Math.round(snapY), vpw: vpW, vph: vpH, timestamp: ts(), url: location.href, site_id: siteId, session_id: sessionId });
      }, DWELL_MS);
    }
  }

  var flushCount = 0;
  var totalSent = 0;

  function flush(beacon) {
    console.log('[PoorJar] flush called — events in queue:', events.length);
    if (!events.length) return;
    var batch = events.splice(0);
    var payload;

    flushCount++;
    totalSent += batch.length;

    // Notify observers
    try {
      document.dispatchEvent(new CustomEvent('poorjar:flush', { detail: { count: batch.length, flushCount: flushCount, totalSent: totalSent } }));
    } catch(err) {}

    if (mode === 'supabase') {
      // PostgREST requires every row in a batch to have identical keys.
      // Normalise: fill any missing fields with null so all rows match.
      var ALL_KEYS = ['site_id','session_id','type','x','y','vx','vy','vpw','vph','depth','scroll_y','timestamp','url'];
      var normalised = batch.map(function(e) {
        var row = {};
        ALL_KEYS.forEach(function(k) { row[k] = (k in e) ? e[k] : null; });
        return row;
      });
      payload = JSON.stringify(normalised);
    } else {
      // Custom webhook / Apps Script: wrapped envelope with session metadata
      payload = JSON.stringify({ site_id: siteId, session_id: sessionId, vpw: vpW, vph: vpH, ua: navigator.userAgent, events: batch });
    }

    var headers = { 'Content-Type': 'application/json' };
    if (mode === 'supabase') {
      headers['Prefer'] = 'return=minimal';
      if (apiKey) {
        headers['apikey'] = apiKey;
        headers['Authorization'] = 'Bearer ' + apiKey;
      }
    }

    // sendBeacon can't set custom headers — Supabase needs apikey/Authorization.
    // For Supabase mode always use XHR (keepalive when available).
    // For custom webhooks, sendBeacon is fine.
    var useBeacon = beacon && navigator.sendBeacon && mode !== 'supabase';
    if (useBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);
      for (var h in headers) xhr.setRequestHeader(h, headers[h]);
      xhr.onerror = function() { console.warn('[PoorJar] XHR error on flush'); };
      xhr.onload  = function() {
        if (xhr.status >= 400) console.warn('[PoorJar] flush HTTP', xhr.status, xhr.responseText && xhr.responseText.slice(0, 200));
      };
      xhr.send(payload);
    }
  }

  // Attach listeners with capture:true so stopPropagation in page code doesn't block us
  document.addEventListener('click',     handleClick,     true);
  document.addEventListener('scroll',    handleScroll,    { passive: true, capture: true });
  document.addEventListener('mousemove', handleMouseMove, { passive: true, capture: true });

  setInterval(function() { flush(false); }, 5000);
  window.addEventListener('pagehide',      function() { flush(true); });
  window.addEventListener('beforeunload',  function() { flush(true); });

  // Public API — lets test consoles trigger a manual flush
  window.PoorJar = {
    flush:      function() { flush(false); },
    getQueue:   function() { return events.slice(); },
    stats:      function() { return { flushCount: flushCount, totalSent: totalSent, queued: events.length }; }
  };

})();
