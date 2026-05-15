/**
 * wizard.js
 * Multi-step setup wizard.
 * Loaded as a regular script (not module) so it can export globals for inline onclick handlers.
 */

(function () {
  let selectedBackend = null;
  let currentStep = 0;

  // Config values per backend
  const userInputs = {
    supabase: { projectUrl: '', anonKey: '' },
    airtable: { apiKey: '', baseId: '' },
    sheets: { webAppUrl: '' },
    custom: { endpointUrl: '' },
  };

  // ─── Backend selection ────────────────────────────────────────────────────
  window.selectBackend = function (backend, cardEl) {
    selectedBackend = backend;

    // Update card styles
    document.querySelectorAll('.backend-card').forEach(c => c.classList.remove('selected'));
    if (cardEl) cardEl.classList.add('selected');

    // Enable next button
    const btn = document.getElementById('wizNext0');
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  };

  // ─── Navigation ───────────────────────────────────────────────────────────
  window.wizardNext = function (fromStep) {
    if (fromStep === 0) {
      if (!selectedBackend) return;
      buildConfigStep();
      setWizardStep(1);
    } else if (fromStep === 1) {
      captureInputs();
      buildScriptStep();
      setWizardStep(2);
    }
  };

  window.wizardBack = function (fromStep) {
    if (fromStep === 1) {
      setWizardStep(0);
    } else if (fromStep === 2) {
      setWizardStep(1);
    }
  };

  window.wizardReset = function () {
    selectedBackend = null;
    currentStep = 0;

    // Reset backend cards
    document.querySelectorAll('.backend-card').forEach(c => c.classList.remove('selected'));
    const btn = document.getElementById('wizNext0');
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
    }

    setWizardStep(0);
  };

  function setWizardStep(step) {
    currentStep = step;

    // Show/hide panels
    for (let i = 0; i <= 2; i++) {
      const panel = document.getElementById(`wizPanel${i}`);
      if (panel) panel.classList.toggle('active', i === step);
    }

    // Update indicators
    for (let i = 0; i <= 2; i++) {
      const ind = document.getElementById(`wizInd${i}`);
      if (!ind) continue;
      ind.classList.remove('active', 'done');
      if (i < step) ind.classList.add('done');
      else if (i === step) ind.classList.add('active');

      // Checkmark for done
      const circle = ind.querySelector('.wizard-step-circle');
      if (circle) {
        if (i < step) {
          circle.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>`;
        } else {
          circle.textContent = i + 1;
        }
      }
    }

    // Update connectors
    for (let i = 0; i <= 1; i++) {
      const conn = document.getElementById(`wizConn${i}`);
      if (conn) conn.classList.toggle('done', i < step);
    }
  }

  // ─── Config step builder ──────────────────────────────────────────────────
  function buildConfigStep() {
    const container = document.getElementById('configContent');
    if (!container) return;

    container.innerHTML = '';

    if (selectedBackend === 'supabase') {
      container.innerHTML = `
        <div class="config-instructions">
          <h4>Set up your Supabase table</h4>
          <ol>
            <li>Go to your Supabase project and open the SQL editor.</li>
            <li>Run this to create the events table:</li>
          </ol>
          <div class="config-code-wrap">
            <div class="config-code-header">
              <span class="config-code-lang">SQL</span>
              <button class="config-copy-btn" onclick="(function(btn){
                const sql = btn.closest('.config-code-wrap').querySelector('.config-code-snippet').innerText;
                navigator.clipboard.writeText(sql).then(function(){
                  btn.textContent = 'Copied!';
                  setTimeout(function(){ btn.textContent = 'Copy'; }, 2000);
                });
              })(this)">Copy</button>
            </div>
            <div class="config-code-snippet">CREATE TABLE poorjar_events (
  id         bigint generated always as identity primary key,
  site_id    text,
  session_id text,
  type       text,
  x          float8,
  y          float8,
  vx         float8,
  vy         float8,
  vpw        int,
  vph        int,
  depth      float8,
  scroll_y   float8,
  timestamp  bigint,
  url        text
);

-- Allow anonymous inserts (no auth required)
ALTER TABLE poorjar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON poorjar_events FOR INSERT WITH CHECK (true);</div>
          </div>
          <ol start="3">
            <li>Go to <strong>Settings &gt; API</strong> and copy your Project URL and anon/public key.</li>
            <li>Paste them below.</li>
          </ol>
        </div>
        <div class="config-form">
          <div class="form-field">
            <label class="form-label">Supabase Project URL</label>
            <input class="form-input" id="inputSupabaseUrl" type="url" placeholder="https://xxxxxxxxxxxx.supabase.co" value="${userInputs.supabase.projectUrl}">
          </div>
          <div class="form-field">
            <label class="form-label">Supabase Anon Key</label>
            <input class="form-input" id="inputSupabaseKey" type="text" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." value="${userInputs.supabase.anonKey}">
          </div>
        </div>
      `;
    } else if (selectedBackend === 'airtable') {
      container.innerHTML = `
        <div class="config-instructions">
          <h4>Set up your Airtable base</h4>
          <ol>
            <li>Create a new base in Airtable (or use an existing one).</li>
            <li>Add a table called <strong>PoorJar Events</strong> with these fields: Session ID (Text), Type (Text), X (Number), Y (Number), Scroll Y (Number), Timestamp (Number), URL (URL).</li>
            <li>Get your API key from <a href="https://airtable.com/create/tokens" target="_blank" rel="noopener" style="color:var(--accent);">airtable.com/create/tokens</a>. Create a personal access token with <code>data.records:write</code> scope on your base.</li>
            <li>Find your Base ID in the URL when viewing your base: <code>https://airtable.com/<strong>appXXXXXXXXXXXXX</strong>/...</code></li>
          </ol>
        </div>
        <div class="config-form">
          <div class="form-field">
            <label class="form-label">Airtable API Key (Personal Access Token)</label>
            <input class="form-input" id="inputAirtableKey" type="text" placeholder="patXXXXXXXXXXXXXX.xxxxxxxx..." value="${userInputs.airtable.apiKey}">
          </div>
          <div class="form-field">
            <label class="form-label">Airtable Base ID</label>
            <input class="form-input" id="inputAirtableBase" type="text" placeholder="appXXXXXXXXXXXXXX" value="${userInputs.airtable.baseId}">
          </div>
        </div>
      `;
    } else if (selectedBackend === 'sheets') {
      container.innerHTML = `
        <div class="config-instructions">
          <h4>Set up Google Sheets (this one's a bit janky but it works)</h4>
          <ol>
            <li>Create a new Google Sheet. The column headers in row 1 should be: session_id, type, x, y, scroll_y, timestamp, url, site_id</li>
            <li>Open <strong>Extensions &gt; Apps Script</strong> and paste this code:</li>
          </ol>
          <div class="config-code-snippet">function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var events = data.events || [];
    events.forEach(function(ev) {
      sheet.appendRow([
        data.session_id || '',
        ev.type || '',
        ev.x || 0,
        ev.y || 0,
        ev.scroll_y || ev.depth || 0,
        ev.timestamp || Date.now(),
        ev.url || '',
        data.site_id || ''
      ]);
    });
    return ContentService
      .createTextOutput(JSON.stringify({status:'ok'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({error:err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}</div>
          <ol start="3">
            <li>Click <strong>Deploy &gt; New deployment</strong>. Type: Web app. Execute as: Me. Who has access: Anyone. Click Deploy.</li>
            <li>Copy the web app URL and paste it below.</li>
          </ol>
        </div>
        <div class="config-form">
          <div class="form-field">
            <label class="form-label">Apps Script Web App URL</label>
            <input class="form-input" id="inputSheetsUrl" type="url" placeholder="https://script.google.com/macros/s/XXXXX/exec" value="${userInputs.sheets.webAppUrl}">
          </div>
        </div>
      `;
    } else if (selectedBackend === 'custom') {
      container.innerHTML = `
        <div class="config-instructions">
          <h4>Custom webhook endpoint</h4>
          <ol>
            <li>Point to any URL that accepts <code>POST</code> with a JSON body.</li>
            <li>PoorJar will send batches every 30 seconds in this format:</li>
          </ol>
          <div class="config-code-snippet">{
  "site_id": "your-site-id",
  "session_id": "abc12345",
  "events": [
    { "type": "click", "x": 512, "y": 240, "selector": "button.cta", "timestamp": 1716000000000 },
    { "type": "scroll", "depth": 0.45, "timestamp": 1716000001000 },
    { "type": "mousemove", "x": 600, "y": 300, "timestamp": 1716000002000 },
    { "type": "rage_click", "x": 512, "y": 240, "timestamp": 1716000003000 }
  ]
}</div>
          <ol start="3">
            <li>Make sure your endpoint returns a 2xx status. CORS must allow <code>*</code> or your domain.</li>
          </ol>
        </div>
        <div class="config-form">
          <div class="form-field">
            <label class="form-label">Endpoint URL</label>
            <input class="form-input" id="inputCustomUrl" type="url" placeholder="https://your-api.example.com/poorjar/events" value="${userInputs.custom.endpointUrl}">
          </div>
        </div>
      `;
    }
  }

  function captureInputs() {
    if (selectedBackend === 'supabase') {
      const u = document.getElementById('inputSupabaseUrl');
      const k = document.getElementById('inputSupabaseKey');
      if (u) userInputs.supabase.projectUrl = u.value.trim();
      if (k) userInputs.supabase.anonKey = k.value.trim();
    } else if (selectedBackend === 'airtable') {
      const k = document.getElementById('inputAirtableKey');
      const b = document.getElementById('inputAirtableBase');
      if (k) userInputs.airtable.apiKey = k.value.trim();
      if (b) userInputs.airtable.baseId = b.value.trim();
    } else if (selectedBackend === 'sheets') {
      const u = document.getElementById('inputSheetsUrl');
      if (u) userInputs.sheets.webAppUrl = u.value.trim();
    } else if (selectedBackend === 'custom') {
      const u = document.getElementById('inputCustomUrl');
      if (u) userInputs.custom.endpointUrl = u.value.trim();
    }
  }

  // ─── Script tag builder ───────────────────────────────────────────────────
  function generateUUID() {
    // RFC 4122 v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function buildEndpoint() {
    if (selectedBackend === 'supabase') {
      const url = userInputs.supabase.projectUrl.replace(/\/$/, '');
      if (!url) return 'YOUR_SUPABASE_ENDPOINT';
      return `${url}/rest/v1/poorjar_events`;
    } else if (selectedBackend === 'airtable') {
      const apiKey = userInputs.airtable.apiKey;
      const baseId = userInputs.airtable.baseId;
      if (!apiKey || !baseId) return 'YOUR_AIRTABLE_ENDPOINT';
      // Airtable doesn't allow direct browser POSTs (CORS restriction).
      // User needs a small proxy — the wizard shows instructions for a Cloudflare Worker proxy.
      if (!apiKey || !baseId) return 'YOUR_AIRTABLE_PROXY_URL';
      return `https://poorjar-airtable.YOUR-SUBDOMAIN.workers.dev?base=${baseId}&table=PoorJar%20Events&key=${apiKey}`;
    } else if (selectedBackend === 'sheets') {
      return userInputs.sheets.webAppUrl || 'YOUR_APPS_SCRIPT_URL';
    } else if (selectedBackend === 'custom') {
      return userInputs.custom.endpointUrl || 'YOUR_ENDPOINT_URL';
    }
    return 'YOUR_ENDPOINT_URL';
  }

  function buildScriptStep() {
    // Generate once and persist — going back/forward shouldn't change the site-id
    if (!userInputs._siteId) userInputs._siteId = generateUUID();
    const siteId = userInputs._siteId;
    const endpoint = buildEndpoint();

    const modeAttr = selectedBackend === 'supabase' ? '\n  data-mode="supabase"' : '';
    const keyAttr = selectedBackend === 'supabase' && userInputs.supabase.anonKey
      ? `\n  data-key="${userInputs.supabase.anonKey}"` : '';
    // NOTE: no async/defer — poorjar.js uses document.currentScript which breaks with async
    const tag = `<script
  src="https://poorjar.com/poorjar.js"
  data-endpoint="${endpoint}"
  data-site-id="${siteId}"${modeAttr}${keyAttr}
><\/script>`;

    const outputEl = document.getElementById('scriptTagOutput');
    if (outputEl) {
      outputEl.innerHTML = escapeAndHighlight(tag);
      outputEl.dataset.raw = tag;
    }

    // Generate pre-connected dashboard link
    if (selectedBackend === 'supabase' && userInputs.supabase) {
      const supaUrl = userInputs.supabase.projectUrl ? userInputs.supabase.projectUrl.trim().replace(/\/$/, '') : '';
      const supaKey = userInputs.supabase.anonKey || '';
      if (supaUrl && supaKey) {
        const cfg = btoa(JSON.stringify({ u: supaUrl, k: supaKey }));
        const dashLink = 'https://poorjar.com/dashboard/#' + cfg;
        const dashEl = document.getElementById('dashLinkOutput');
        if (dashEl) {
          dashEl.textContent = dashLink;
          dashEl.dataset.link = dashLink;
        }
      }
    }
  }

  function escapeAndHighlight(tag) {
    const esc = tag
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return esc
      .replace(/(&lt;script)/g, '<span style="color:#9ECEF5;">$1</span>')
      .replace(/(&lt;\/script&gt;)/g, '<span style="color:#9ECEF5;">$1</span>')
      .replace(/(src|data-endpoint|data-site-id|data-mode|data-key)/g, '<span style="color:#4AE3A0;">$1</span>')
      .replace(/("([^"]*)")/g, '<span style="color:#F2A65A;">$1</span>');
  }

  // ─── Copy button ──────────────────────────────────────────────────────────
  window.copyDashLink = function () {
    const dashEl = document.getElementById('dashLinkOutput');
    const btn = document.getElementById('btnDashCopy');
    if (!dashEl || !btn) return;
    const link = dashEl.dataset.link || dashEl.textContent;
    navigator.clipboard.writeText(link).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy link'; }, 2000);
    }).catch(() => {
      prompt('Copy your dashboard link:', link);
    });
  };

  window.copyScript = function () {
    const outputEl = document.getElementById('scriptTagOutput');
    const btn = document.getElementById('btnCopy');
    if (!outputEl || !btn) return;

    const raw = outputEl.dataset.raw || outputEl.textContent;

    navigator.clipboard.writeText(raw).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = raw;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
  };

})();
