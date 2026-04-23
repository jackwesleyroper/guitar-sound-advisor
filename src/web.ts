import http from "http";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { GuitarSchema, AmpSchema, PedalSchema } from "./schema.js";

const INVENTORY_PATH = path.resolve(process.cwd(), "inventory.yml");

// ─── YAML helpers ────────────────────────────────────────────────────────────

function loadRawInventory(): Record<string, unknown> {
  const raw = fs.readFileSync(INVENTORY_PATH, "utf8");
  return yaml.load(raw) as Record<string, unknown>;
}

function saveInventory(data: Record<string, unknown>): void {
  fs.writeFileSync(INVENTORY_PATH, yaml.dump(data, { lineWidth: 120 }), "utf8");
}

// ─── Request body parser ─────────────────────────────────────────────────────

const MAX_BODY_BYTES = 64 * 1024; // 64 KB — generous for JSON inventory items

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON in request body"));
      }
    });
    req.on("error", reject);
  });
}

// ─── ID generator ────────────────────────────────────────────────────────────

function idFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// ─── Safe error message (avoids leaking stack traces) ────────────────────────

function errMsg(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Take only the first line so no stacked frames can reach the response
  return raw.split("\n")[0];
}

// ─── HTML UI ─────────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Guitar Sound Advisor &mdash; Inventory</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #111;
      color: #ddd;
      min-height: 100vh;
    }

    header {
      background: linear-gradient(135deg, #1c1c1c 0%, #252525 100%);
      border-bottom: 2px solid #c8a32c;
      padding: 1.25rem 2rem;
    }
    header h1 {
      font-size: 1.65rem;
      color: #f0c040;
      letter-spacing: 0.02em;
      text-shadow: 0 0 24px rgba(200,163,44,0.35);
    }

    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }

    /* ── Tabs ─────────────────────────────────────────────────────────────── */
    .tabs {
      display: flex;
      gap: 0;
      border-bottom: 2px solid #2e2e2e;
      margin-bottom: 2rem;
    }
    .tab-btn {
      background: #1a1a1a;
      border: none;
      color: #888;
      padding: 0.75rem 1.4rem;
      cursor: pointer;
      font-size: 0.95rem;
      border-radius: 4px 4px 0 0;
      transition: background 0.15s, color 0.15s;
    }
    .tab-btn:hover { background: #252525; color: #c8a32c; }
    .tab-btn.active {
      background: #252525;
      color: #f0c040;
      border-bottom: 2px solid #f0c040;
      font-weight: 700;
    }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

    /* ── Table ────────────────────────────────────────────────────────────── */
    .table-wrap { overflow-x: auto; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; }
    th {
      background: #1e1e1e;
      color: #c8a32c;
      padding: 0.7rem 1rem;
      text-align: left;
      border-bottom: 1px solid #333;
      font-weight: 600;
      white-space: nowrap;
    }
    td {
      padding: 0.65rem 1rem;
      border-bottom: 1px solid #1e1e1e;
      color: #ccc;
      vertical-align: top;
    }
    tr:hover td { background: #181818; }

    .item-id { color: #666; font-size: 0.78rem; display: block; }
    .fx-badge {
      font-size: 0.72rem;
      display: block;
      margin-top: 2px;
    }
    .fx-yes { color: #7acc7a; }
    .fx-no  { color: #888; }

    .badge {
      display: inline-block;
      background: #1e1e1e;
      border: 1px solid #333;
      border-radius: 3px;
      padding: 0.1rem 0.4rem;
      font-size: 0.78rem;
      margin: 0.1rem;
      color: #bbb;
    }
    .badge-cat { border-color: #c8a32c55; color: #c8a32c; }
    .empty-cell { color: #444; }

    /* ── Add section ──────────────────────────────────────────────────────── */
    .add-section { margin-top: 1.5rem; }
    .add-toggle {
      background: #1a1a1a;
      border: 1px solid #3a3a3a;
      color: #c8a32c;
      padding: 0.55rem 1.1rem;
      cursor: pointer;
      border-radius: 4px;
      font-size: 0.92rem;
      transition: background 0.15s, border-color 0.15s;
    }
    .add-toggle:hover { background: #222; border-color: #c8a32c; }

    .add-form {
      display: none;
      background: #181818;
      border: 1px solid #2e2e2e;
      border-radius: 4px;
      padding: 1.5rem;
      margin-top: 0.5rem;
    }
    .add-form.open { display: block; }

    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    @media (max-width: 680px) { .form-grid { grid-template-columns: 1fr; } }

    .form-group { display: flex; flex-direction: column; gap: 0.3rem; }
    .form-group.full { grid-column: 1 / -1; }

    label {
      color: #888;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .field-hint { color: #555; text-transform: none; letter-spacing: 0; }

    input[type="text"], select {
      background: #222;
      border: 1px solid #3a3a3a;
      color: #ddd;
      padding: 0.48rem 0.75rem;
      border-radius: 4px;
      font-size: 0.92rem;
      width: 100%;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    input[type="text"]:focus, select:focus {
      outline: none;
      border-color: #c8a32c;
      box-shadow: 0 0 0 2px rgba(200,163,44,0.18);
    }
    input::placeholder { color: #444; }

    .btn-submit {
      background: #c8a32c;
      color: #111;
      border: none;
      padding: 0.6rem 1.5rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 700;
      margin-top: 1.1rem;
      transition: background 0.15s;
    }
    .btn-submit:hover { background: #f0c040; }
    .btn-submit:active { background: #a88520; }

    .msg {
      margin-top: 0.85rem;
      padding: 0.65rem 0.9rem;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    .msg.success { background: #152515; border: 1px solid #2e6a2e; color: #7acc7a; }
    .msg.error   { background: #251515; border: 1px solid #6a2e2e; color: #cc7a7a; }

    .loading { color: #555; font-style: italic; padding: 0.75rem 0; }
  </style>
</head>
<body>
  <header>
    <h1>&#127928; Guitar Sound Advisor &mdash; Inventory</h1>
  </header>

  <div class="container">
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab(this,'guitars')">&#127928; Guitars</button>
      <button class="tab-btn"        onclick="switchTab(this,'amps')">&#127927; Amps</button>
      <button class="tab-btn"        onclick="switchTab(this,'pedals')">&#127906; Pedals</button>
    </div>

    <!-- ── Guitars ─────────────────────────────────────────────────────────── -->
    <div id="tab-guitars" class="tab-panel active">
      <div id="guitars-table" class="table-wrap"><p class="loading">Loading&hellip;</p></div>
      <div class="add-section">
        <button class="add-toggle" onclick="toggleForm('guitars-form')">+ Add New Guitar</button>
        <div id="guitars-form" class="add-form">
          <form onsubmit="submitForm(event,'guitars')">
            <div class="form-grid">
              <div class="form-group">
                <label>Name <span style="color:#c8a32c">*</span></label>
                <input type="text" name="name" required placeholder="e.g. Fender Stratocaster">
              </div>
              <div class="form-group">
                <label>ID <span class="field-hint">(auto-derived if blank)</span></label>
                <input type="text" name="id" placeholder="e.g. fender_strat">
              </div>
              <div class="form-group">
                <label>Pickups <span style="color:#c8a32c">*</span> <span class="field-hint">comma-separated</span></label>
                <input type="text" name="pickups" required placeholder="e.g. hh">
              </div>
              <div class="form-group">
                <label>Pickup Positions <span class="field-hint">comma-separated</span></label>
                <input type="text" name="pickup_positions" placeholder="e.g. bridge, middle, neck">
              </div>
              <div class="form-group full">
                <label>Notes <span class="field-hint">comma-separated</span></label>
                <input type="text" name="notes" placeholder="e.g. Colour: Black, Year: 2020">
              </div>
            </div>
            <button type="submit" class="btn-submit">Add Guitar</button>
            <div id="guitars-msg"></div>
          </form>
        </div>
      </div>
    </div>

    <!-- ── Amps ────────────────────────────────────────────────────────────── -->
    <div id="tab-amps" class="tab-panel">
      <div id="amps-table" class="table-wrap"><p class="loading">Loading&hellip;</p></div>
      <div class="add-section">
        <button class="add-toggle" onclick="toggleForm('amps-form')">+ Add New Amp</button>
        <div id="amps-form" class="add-form">
          <form onsubmit="submitForm(event,'amps')">
            <div class="form-grid">
              <div class="form-group">
                <label>Name <span style="color:#c8a32c">*</span></label>
                <input type="text" name="name" required placeholder="e.g. Marshall JCM 800">
              </div>
              <div class="form-group">
                <label>ID <span class="field-hint">(auto-derived if blank)</span></label>
                <input type="text" name="id" placeholder="e.g. marshall_jcm800">
              </div>
              <div class="form-group">
                <label>Amp Type</label>
                <input type="text" name="amp_type" placeholder="e.g. Head, Combo">
              </div>
              <div class="form-group">
                <label>Effects Loop</label>
                <select name="effects_loop">
                  <option value="">Not specified</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div class="form-group">
                <label>Channels <span class="field-hint">comma-separated</span></label>
                <input type="text" name="channels" placeholder="e.g. Clean, OD">
              </div>
              <div class="form-group">
                <label>Controls <span style="color:#c8a32c">*</span> <span class="field-hint">comma-separated</span></label>
                <input type="text" name="controls" required placeholder="e.g. gain, bass, middle, treble">
              </div>
              <div class="form-group full">
                <label>Notes <span class="field-hint">comma-separated</span></label>
                <input type="text" name="notes" placeholder="e.g. Great clean sound">
              </div>
            </div>
            <button type="submit" class="btn-submit">Add Amp</button>
            <div id="amps-msg"></div>
          </form>
        </div>
      </div>
    </div>

    <!-- ── Pedals ──────────────────────────────────────────────────────────── -->
    <div id="tab-pedals" class="tab-panel">
      <div id="pedals-table" class="table-wrap"><p class="loading">Loading&hellip;</p></div>
      <div class="add-section">
        <button class="add-toggle" onclick="toggleForm('pedals-form')">+ Add New Pedal</button>
        <div id="pedals-form" class="add-form">
          <form onsubmit="submitForm(event,'pedals')">
            <div class="form-grid">
              <div class="form-group">
                <label>Name <span style="color:#c8a32c">*</span></label>
                <input type="text" name="name" required placeholder="e.g. Tube Screamer">
              </div>
              <div class="form-group">
                <label>ID <span class="field-hint">(auto-derived if blank)</span></label>
                <input type="text" name="id" placeholder="e.g. ts_od">
              </div>
              <div class="form-group">
                <label>Category <span style="color:#c8a32c">*</span></label>
                <input type="text" name="category" required placeholder="e.g. overdrive, fuzz, delay">
              </div>
              <div class="form-group">
                <label>Controls <span style="color:#c8a32c">*</span> <span class="field-hint">comma-separated</span></label>
                <input type="text" name="controls" required placeholder="e.g. Drive, Tone, Volume">
              </div>
              <div class="form-group full">
                <label>Notes <span class="field-hint">comma-separated</span></label>
                <input type="text" name="notes" placeholder="e.g. Classic TS circuit">
              </div>
            </div>
            <button type="submit" class="btn-submit">Add Pedal</button>
            <div id="pedals-msg"></div>
          </form>
        </div>
      </div>
    </div>
  </div><!-- /.container -->

  <script>
    var inventory = null;

    /* ── Tabs ──────────────────────────────────────────────────────────────── */
    function switchTab(btn, tab) {
      document.querySelectorAll('.tab-panel').forEach(function(el) { el.classList.remove('active'); });
      document.querySelectorAll('.tab-btn').forEach(function(el)   { el.classList.remove('active'); });
      document.getElementById('tab-' + tab).classList.add('active');
      btn.classList.add('active');
    }

    function toggleForm(id) {
      document.getElementById(id).classList.toggle('open');
    }

    /* ── Helpers ───────────────────────────────────────────────────────────── */
    function esc(s) {
      return String(s)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
    }

    function splitCSV(val) {
      if (!val || !val.trim()) return undefined;
      return val.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    }

    function badges(arr, cls) {
      if (!arr || arr.length === 0) return '<span class="empty-cell">&mdash;</span>';
      return arr.map(function(s) {
        return '<span class="badge' + (cls ? ' ' + cls : '') + '">' + esc(s) + '</span>';
      }).join(' ');
    }

    /* ── Render ────────────────────────────────────────────────────────────── */
    function renderGuitars(guitars) {
      var el = document.getElementById('guitars-table');
      if (!guitars || guitars.length === 0) {
        el.innerHTML = '<p style="color:#555">No guitars in inventory.</p>';
        return;
      }
      var rows = guitars.map(function(g) {
        return '<tr>' +
          '<td><strong>' + esc(g.name) + '</strong><span class="item-id">' + esc(g.id) + '</span></td>' +
          '<td>' + badges(g.pickups) + '</td>' +
          '<td>' + badges(g.pickup_positions) + '</td>' +
          '<td>' + badges(g.notes) + '</td>' +
          '</tr>';
      });
      el.innerHTML =
        '<table>' +
        '<thead><tr><th>Name</th><th>Pickups</th><th>Pickup Positions</th><th>Notes</th></tr></thead>' +
        '<tbody>' + rows.join('') + '</tbody>' +
        '</table>';
    }

    function renderAmps(amps) {
      var el = document.getElementById('amps-table');
      if (!amps || amps.length === 0) {
        el.innerHTML = '<p style="color:#555">No amps in inventory.</p>';
        return;
      }
      var rows = amps.map(function(a) {
        var fxBadge = '';
        if (a.effects_loop === true)       fxBadge = '<span class="fx-badge fx-yes">&#10003; FX Loop</span>';
        else if (a.effects_loop === false)  fxBadge = '<span class="fx-badge fx-no">&#10007; No FX Loop</span>';
        var ampType = a.amp_type || '';
        return '<tr>' +
          '<td><strong>' + esc(a.name) + '</strong><span class="item-id">' + esc(a.id) + '</span>' + fxBadge + '</td>' +
          '<td>' + (ampType ? esc(ampType) : '<span class="empty-cell">&mdash;</span>') + '</td>' +
          '<td>' + badges(a.channels) + '</td>' +
          '<td>' + badges(a.controls) + '</td>' +
          '<td>' + badges(a.notes) + '</td>' +
          '</tr>';
      });
      el.innerHTML =
        '<table>' +
        '<thead><tr><th>Name</th><th>Type</th><th>Channels</th><th>Controls</th><th>Notes</th></tr></thead>' +
        '<tbody>' + rows.join('') + '</tbody>' +
        '</table>';
    }

    function renderPedals(pedals) {
      var el = document.getElementById('pedals-table');
      if (!pedals || pedals.length === 0) {
        el.innerHTML = '<p style="color:#555">No pedals in inventory.</p>';
        return;
      }
      var rows = pedals.map(function(p) {
        return '<tr>' +
          '<td><strong>' + esc(p.name) + '</strong><span class="item-id">' + esc(p.id) + '</span></td>' +
          '<td>' + badges([p.category], 'badge-cat') + '</td>' +
          '<td>' + badges(p.controls) + '</td>' +
          '<td>' + badges(p.notes) + '</td>' +
          '</tr>';
      });
      el.innerHTML =
        '<table>' +
        '<thead><tr><th>Name</th><th>Category</th><th>Controls</th><th>Notes</th></tr></thead>' +
        '<tbody>' + rows.join('') + '</tbody>' +
        '</table>';
    }

    function renderAll() {
      if (!inventory) return;
      renderGuitars(inventory.guitars);
      renderAmps(inventory.amps);
      renderPedals(inventory.pedals);
      /* update tab labels with counts */
      var btns = document.querySelectorAll('.tab-btn');
      var counts = [
        (inventory.guitars || []).length,
        (inventory.amps    || []).length,
        (inventory.pedals  || []).length,
      ];
      var labels = ['&#127928; Guitars', '&#127927; Amps', '&#127906; Pedals'];
      btns.forEach(function(btn, i) {
        btn.innerHTML = labels[i] + ' <small style="opacity:0.65">(' + counts[i] + ')</small>';
      });
    }

    /* ── API ───────────────────────────────────────────────────────────────── */
    async function loadInventory() {
      try {
        var res = await fetch('/api/inventory');
        inventory = await res.json();
        renderAll();
      } catch (err) {
        console.error('Failed to load inventory:', err);
      }
    }

    async function submitForm(event, type) {
      event.preventDefault();
      var form = event.target;
      var msgEl = document.getElementById(type + '-msg');
      msgEl.innerHTML = '';

      var data = {};
      var fd = new FormData(form);
      var arrayFields = ['pickups', 'pickup_positions', 'controls', 'channels', 'notes'];

      for (var pair of fd.entries()) {
        var key = pair[0], value = pair[1];
        if (arrayFields.indexOf(key) !== -1) {
          var arr = splitCSV(value);
          if (arr !== undefined) data[key] = arr;
        } else if (key === 'effects_loop') {
          if (value === 'true')       data[key] = true;
          else if (value === 'false') data[key] = false;
          /* else omit the field */
        } else if (value && value.trim()) {
          data[key] = value.trim();
        }
      }

      /* auto-generate id from name */
      if (!data.id && data.name) {
        data.id = data.name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
      }

      /* ensure required array fields default to [] */
      if (type !== 'guitars' && !data.controls) data.controls = [];
      if (type === 'guitars'  && !data.pickups)  data.pickups  = [];

      try {
        var res = await fetch('/api/inventory/' + type, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        var result = await res.json();
        if (res.ok) {
          msgEl.innerHTML = '<div class="msg success">&#10003; ' + esc(String(data.name || 'Item')) + ' added successfully!</div>';
          form.reset();
          await loadInventory();
        } else {
          msgEl.innerHTML = '<div class="msg error">&#10007; ' + esc(result.error || 'Unknown error') + '</div>';
        }
      } catch (err) {
        msgEl.innerHTML = '<div class="msg error">&#10007; ' + esc(String(err)) + '</div>';
      }
    }

    /* activate tab from URL hash, e.g. http://localhost:3000/#amps */
    (function() {
      var hash = window.location.hash.slice(1);
      if (hash === 'amps' || hash === 'pedals') {
        var idx = hash === 'amps' ? 1 : 2;
        var btn = document.querySelectorAll('.tab-btn')[idx];
        if (btn) switchTab(btn, hash);
      }
    })();

    loadInventory();
  </script>
</body>
</html>`;

// ─── Request handler ─────────────────────────────────────────────────────────

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const { method, url } = req;

  // ── GET / ──────────────────────────────────────────────────────────────────
  if (method === "GET" && url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
    return;
  }

  // ── GET /api/inventory ─────────────────────────────────────────────────────
  if (method === "GET" && url === "/api/inventory") {
    try {
      const inv = loadRawInventory();
      sendJson(res, 200, inv);
    } catch (err) {
      sendJson(res, 500, { error: errMsg(err) });
    }
    return;
  }

  // ── POST /api/inventory/guitars ────────────────────────────────────────────
  if (method === "POST" && url === "/api/inventory/guitars") {
    try {
      const body = await parseBody(req);
      const parsed = body as Record<string, unknown>;
      if (!parsed.id && typeof parsed.name === "string") {
        parsed.id = idFromName(parsed.name);
      }
      const result = GuitarSchema.safeParse(parsed);
      if (!result.success) {
        const msg = result.error.errors
          .map((e) => `${e.path.join(".")} — ${e.message}`)
          .join("; ");
        sendJson(res, 400, { error: msg });
        return;
      }
      const inv = loadRawInventory();
      if (!Array.isArray(inv.guitars)) inv.guitars = [];
      (inv.guitars as unknown[]).push(result.data);
      saveInventory(inv);
      sendJson(res, 201, { success: true, item: result.data });
    } catch (err) {
      sendJson(res, 400, { error: errMsg(err) });
    }
    return;
  }

  // ── POST /api/inventory/amps ───────────────────────────────────────────────
  if (method === "POST" && url === "/api/inventory/amps") {
    try {
      const body = await parseBody(req);
      const parsed = body as Record<string, unknown>;
      if (!parsed.id && typeof parsed.name === "string") {
        parsed.id = idFromName(parsed.name);
      }
      const result = AmpSchema.safeParse(parsed);
      if (!result.success) {
        const msg = result.error.errors
          .map((e) => `${e.path.join(".")} — ${e.message}`)
          .join("; ");
        sendJson(res, 400, { error: msg });
        return;
      }
      const inv = loadRawInventory();
      if (!Array.isArray(inv.amps)) inv.amps = [];
      (inv.amps as unknown[]).push(result.data);
      saveInventory(inv);
      sendJson(res, 201, { success: true, item: result.data });
    } catch (err) {
      sendJson(res, 400, { error: errMsg(err) });
    }
    return;
  }

  // ── POST /api/inventory/pedals ─────────────────────────────────────────────
  if (method === "POST" && url === "/api/inventory/pedals") {
    try {
      const body = await parseBody(req);
      const parsed = body as Record<string, unknown>;
      if (!parsed.id && typeof parsed.name === "string") {
        parsed.id = idFromName(parsed.name);
      }
      const result = PedalSchema.safeParse(parsed);
      if (!result.success) {
        const msg = result.error.errors
          .map((e) => `${e.path.join(".")} — ${e.message}`)
          .join("; ");
        sendJson(res, 400, { error: msg });
        return;
      }
      const inv = loadRawInventory();
      if (!Array.isArray(inv.pedals)) inv.pedals = [];
      (inv.pedals as unknown[]).push(result.data);
      saveInventory(inv);
      sendJson(res, 201, { success: true, item: result.data });
    } catch (err) {
      sendJson(res, 400, { error: errMsg(err) });
    }
    return;
  }

  // ── 404 ────────────────────────────────────────────────────────────────────
  sendJson(res, 404, { error: "Not found" });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function startWebServer(port: number): void {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      sendJson(res, 500, { error: errMsg(err) });
    });
  });

  server.listen(port, () => {
    console.log(`\n🎸  Inventory web UI is running`);
    console.log(`    Open: http://localhost:${port}\n`);
  });
}
