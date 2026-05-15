# PoorJar

**Hotjar for the rest of us.** Free, open-source session analytics. Bring your own backend.

No $99/month. No vendor lock-in. One script tag.

→ **[poorjar.com](https://poorjar.com)**

---

## What it does

PoorJar tracks what matters:

- **Click heatmaps** — see where people actually click
- **Rage clicks** — 3+ clicks in under 600ms flags frustrated users
- **Scroll depth** — fires at 25%, 50%, 75%, 100% milestones
- **Dwell spots** — where people pause and read

Under 5KB. No dependencies. Vanilla JS.

---

## Quick start

Paste this before `</body>`:

```html
<script
  src="https://poorjar.com/poorjar.js"
  data-endpoint="https://YOUR_PROJECT.supabase.co/rest/v1/poorjar_events"
  data-site-id="your-site-id"
  data-mode="supabase"
  data-key="your-anon-key"
></script>
```

**Important:** no `async` or `defer` on this tag. PoorJar uses `document.currentScript` which breaks with async loading.

Use the [setup wizard](https://poorjar.com/#setup) to generate your script tag automatically.

---

## Backends

| Backend | Setup |
|---|---|
| Supabase | Create a table (schema below), paste your URL + anon key |
| Google Sheets | Publish an Apps Script web app, paste the URL |
| Custom webhook | Any endpoint that accepts a POST with JSON |

### Supabase table schema

```sql
create table poorjar_events (
  id          bigint generated always as identity primary key,
  site_id     text,
  session_id  text,
  type        text,
  x           integer,
  y           integer,
  vx          integer,
  vy          integer,
  vpw         integer,
  vph         integer,
  depth       real,
  scroll_y    integer,
  timestamp   bigint,
  url         text
);

-- Allow anonymous inserts
alter table poorjar_events enable row level security;
create policy "allow insert" on poorjar_events for insert with check (true);
```

---

## Dashboard

The analytics dashboard at [poorjar.com/dashboard](https://poorjar.com/dashboard) is a single HTML file. Your credentials go directly from your browser to your Supabase project. poorjar.com never sees them.

**Self-host it:** [Download dashboard.html](https://poorjar.com/dashboard/index.html) and open it anywhere. No server required.

---

## Event types

| Type | When it fires |
|---|---|
| `click` | Any click |
| `rage_click` | 3+ clicks within 600ms and 60px radius |
| `scroll` | Once each at 25%, 50%, 75%, 100% scroll depth |
| `dwell` | Mouse pauses 500ms+ in the same 30px area |

---

## Data format (Supabase mode)

Each event is a flat row:

```json
{
  "site_id": "your-site-id",
  "session_id": "abc123",
  "type": "click",
  "x": 540,
  "y": 320,
  "vx": 540,
  "vy": 120,
  "vpw": 1440,
  "vph": 900,
  "depth": null,
  "scroll_y": null,
  "timestamp": 1747000000000,
  "url": "https://yoursite.com/page"
}
```

`x/y` are page-absolute coordinates. `vx/vy` are viewport coordinates.

---

## Public API

PoorJar exposes a small API after loading:

```js
PoorJar.flush()       // force an immediate flush
PoorJar.getQueue()    // get queued events not yet sent
PoorJar.stats()       // { flushCount, totalSent, queued }
```

---

## License

MIT. Fork it, self-host it, modify it. That's the point.

Built by [Henry Ratterman](https://henryratterman.com).
