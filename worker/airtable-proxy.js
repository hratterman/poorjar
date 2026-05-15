/**
 * PoorJar Airtable Proxy — Cloudflare Worker
 * Routes events from poorjar.js to Airtable's REST API.
 * Deployed at: poorjar.com/airtable-proxy
 */

const ALLOWED_ORIGIN_RE = /^https?:\/\/(.*\.)?poorjar\.com$/;

function corsHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGIN_RE.test(origin) ? origin : '*';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const apiKey = url.searchParams.get('key');
    const baseId = url.searchParams.get('base');
    const tableName = url.searchParams.get('table') || 'PoorJar Events';

    if (!apiKey || !baseId) {
      return new Response(JSON.stringify({ error: 'Missing key or base param' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // poorjar.js sends: { site_id, session_id, vpw, vph, ua, events: [...] }
    const events = body.events || [];
    if (!events.length) {
      return new Response(JSON.stringify({ ok: true, created: 0 }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // Airtable: batch up to 10 records at a time
    const records = events.map(ev => ({
      fields: {
        'site_id':    body.site_id  || '',
        'session_id': body.session_id || '',
        'type':       ev.type       || '',
        'x':          ev.x          ?? null,
        'y':          ev.y          ?? null,
        'vx':         ev.vx         ?? null,
        'vy':         ev.vy         ?? null,
        'vpw':        ev.vpw        ?? body.vpw ?? null,
        'vph':        ev.vph        ?? body.vph ?? null,
        'depth':      ev.depth      ?? null,
        'scroll_y':   ev.scroll_y   ?? null,
        'timestamp':  ev.timestamp  || Date.now(),
        'url':        ev.url        || '',
      }
    }));

    const BATCH = 10;
    let created = 0;
    for (let i = 0; i < records.length; i += BATCH) {
      const chunk = records.slice(i, i + BATCH);
      const resp = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: chunk }),
      });
      if (resp.ok) {
        const data = await resp.json();
        created += (data.records || []).length;
      }
    }

    return new Response(JSON.stringify({ ok: true, created }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
};
