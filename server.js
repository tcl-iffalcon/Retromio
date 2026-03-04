const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");
const path    = require("path");

global.fetch = fetch;

const { fetchCatalog }  = require("./catalog");
const { fetchMeta }     = require("./meta");
const { fetchStreams }   = require("./stream");
const baseManifest      = require("./manifest.json");
const {
  triggerPoster,
  posterUrl,
  posterKey,
  existsInB2,
  getQueueStatus,
  B2_PUBLIC,
  AI_PENDING
} = require("./poster");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve background image for configure page
app.get("/kibar-feyzo.jpg", (req, res) => {
  res.sendFile(path.join(__dirname, "kibar-feyzo.jpg"));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.get("host")}`;
}

// ─── Configure Page ───────────────────────────────────────────────────────────

app.get("/configure", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Retromio</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=Outfit:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --gold:       #c8a96e;
      --gold-dim:   rgba(200,169,110,0.18);
      --gold-glow:  rgba(200,169,110,0.35);
      --bg:         #080810;
      --surface:    rgba(255,255,255,0.035);
      --border:     rgba(255,255,255,0.07);
      --text:       #ede8df;
      --muted:      rgba(237,232,223,0.38);
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      height: 100%;
      background: var(--bg);
      font-family: 'Outfit', sans-serif;
      color: var(--text);
      overflow: hidden;
    }

    /* ── Background ── */
    .bg {
      position: fixed; inset: 0; z-index: 0;
    }
    .bg-photo {
      position: absolute; inset: 0;
      background: url('/kibar-feyzo.jpg') center/cover no-repeat;
      opacity: 1;
      filter: grayscale(5%);
      transform: scale(1.06);
      transition: opacity 1s;
    }
    .bg-vignette {
      position: absolute; inset: 0;
      background:transparent;
        radial-gradient(ellipse 60% 100% at 80% 50%, transparent 0%, rgba(8,8,16,0.3) 60%, rgba(8,8,16,0.75) 100%),
        linear-gradient(to right, rgba(8,8,16,0.15) 0%, transparent 35%, rgba(8,8,16,0.55) 100%);
    }
    .bg-grain {
      position: absolute; inset: 0; opacity: 0.025;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)'/%3E%3C/svg%3E");
      pointer-events: none;
    }

    /* ── Layout ── */
    .stage {
      position: relative; z-index: 10;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      min-height: 100vh;
      padding: 2.5rem 4rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    /* ── Panel ── */
    .panel {
      width: 100%;
      max-width: 400px;
      opacity: 0;
      transform: translateY(18px);
      animation: rise 0.9s cubic-bezier(0.16,1,0.3,1) 0.15s forwards;
    }

    /* ── Brand ── */
    .eyebrow {
      font-size: 0.6rem;
      font-weight: 500;
      letter-spacing: 0.32em;
      text-transform: uppercase;
      color: var(--gold);
      opacity: 0.7;
      margin-bottom: 1rem;
    }
    .logo {
      font-family: 'Playfair Display', serif;
      font-size: 5rem;
      font-weight: 700;
      line-height: 0.85;
      letter-spacing: -0.03em;
      color: var(--text);
      margin-bottom: 0.15em;
    }
    .logo em {
      font-style: italic;
      color: var(--gold);
    }
    .rule {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 1.4rem 0 1.1rem;
    }
    .rule-line {
      flex: 1;
      max-width: 32px;
      height: 1px;
      background: linear-gradient(to right, var(--gold), transparent);
      opacity: 0.4;
    }
    .rule-dot {
      width: 3px; height: 3px;
      border-radius: 50%;
      background: var(--gold);
      opacity: 0.5;
    }
    .tagline {
      font-size: 0.82rem;
      font-weight: 300;
      line-height: 1.8;
      color: var(--muted);
      margin-bottom: 2.2rem;
    }
    .tagline strong {
      color: rgba(237,232,223,0.72);
      font-weight: 400;
    }

    /* ── Card ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 1.6rem;
      backdrop-filter: blur(32px) saturate(1.4);
      -webkit-backdrop-filter: blur(32px) saturate(1.4);
      box-shadow:
        0 0 0 1px rgba(255,255,255,0.025) inset,
        0 24px 80px rgba(0,0,0,0.6),
        0 0 60px rgba(200,169,110,0.04);
    }

    /* ── Buttons ── */
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.82rem 1.2rem;
      border-radius: 12px;
      font-family: 'Outfit', sans-serif;
      font-size: 0.865rem;
      font-weight: 500;
      letter-spacing: 0.02em;
      cursor: pointer;
      text-decoration: none;
      border: none;
      transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
      margin-bottom: 0.55rem;
      position: relative;
      overflow: hidden;
    }
    .btn::after {
      content: '';
      position: absolute; inset: 0;
      opacity: 0;
      transition: opacity 0.2s;
      background: rgba(255,255,255,0.06);
    }
    .btn:hover::after { opacity: 1; }

    .btn-stremio {
      background: linear-gradient(135deg, #8458f5 0%, #5b2de8 100%);
      color: #fff;
      box-shadow: 0 4px 20px rgba(132,88,245,0.28);
    }
    .btn-stremio:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(132,88,245,0.42);
    }

    .btn-nuvio {
      background: linear-gradient(135deg, #2a9ef5 0%, #1565c0 100%);
      color: #fff;
      box-shadow: 0 4px 20px rgba(42,158,245,0.22);
    }
    .btn-nuvio:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(42,158,245,0.38);
    }

    .btn-ghost {
      background: rgba(255,255,255,0.04);
      color: var(--muted);
      border: 1px solid rgba(255,255,255,0.07);
      margin-bottom: 0;
    }
    .btn-ghost:hover {
      color: var(--text);
      border-color: rgba(255,255,255,0.13);
      transform: translateY(-1px);
    }

    /* ── Divider ── */
    .divider {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 1.2rem 0;
    }
    .divider-line {
      flex: 1;
      height: 1px;
      background: rgba(255,255,255,0.06);
    }
    .divider-text {
      font-size: 0.6rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.2);
    }

    /* ── URL box ── */
    .url-label {
      font-size: 0.58rem;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.2);
      margin-bottom: 0.45rem;
    }
    .url-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      padding: 0.6rem 0.85rem;
      cursor: pointer;
      transition: border-color 0.18s, background 0.18s;
    }
    .url-row:hover {
      border-color: var(--gold-dim);
      background: rgba(0,0,0,0.4);
    }
    .url-text {
      flex: 1;
      font-size: 0.63rem;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      color: rgba(255,255,255,0.25);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .copy-icon {
      width: 13px; height: 13px;
      fill: rgba(255,255,255,0.2);
      flex-shrink: 0;
      transition: fill 0.15s;
    }
    .url-row:hover .copy-icon { fill: var(--gold); }
    .copied-msg {
      font-size: 0.62rem;
      color: var(--gold);
      text-align: right;
      margin-top: 0.3rem;
      height: 0.9rem;
      opacity: 0;
      transition: opacity 0.25s;
    }
    .copied-msg.show { opacity: 1; }

    /* ── Tags ── */
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 1.3rem;
    }
    .tag {
      font-size: 0.6rem;
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 0.25rem 0.65rem;
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.07);
      color: rgba(255,255,255,0.28);
      background: rgba(255,255,255,0.025);
    }
    .tag.hi {
      border-color: rgba(200,169,110,0.25);
      color: rgba(200,169,110,0.65);
      background: rgba(200,169,110,0.05);
    }

    /* ── Animations ── */
    @keyframes rise {
      to { opacity: 1; transform: translateY(0); }
    }

    /* ── Mobile ── */
    @media (max-width: 680px) {
      .stage { justify-content: center; padding: 2rem 1.5rem; }
      .logo  { font-size: 3.8rem; }
    }
  </style>
</head>
<body>

  <div class="bg">
    <div class="bg-photo"></div>
    <div class="bg-vignette"></div>
    <div class="bg-grain"></div>
  </div>

  <div class="stage">
    <div class="panel">

      <div class="eyebrow">Stremio &amp; Nuvio Addon</div>
      <h1 class="logo">Retro<em>mio</em></h1>

      <div class="rule">
        <div class="rule-line"></div>
        <div class="rule-dot"></div>
        <div class="rule-dot" style="opacity:.25"></div>
      </div>

      <p class="tagline">
        <strong>Her içerik türü için ayrı promthlarla yapay zeka tarafından hazırlanmış posterleri Vidlink ve Netmirror kullanarak sunan Nuvio ve Stremio eklentisi.</strong> —<br>
      </p>

      <div class="card">

        <!-- Stremio -->
        <a class="btn btn-stremio" id="stremioBtn" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
          </svg>
          Stremio'ya Yükle
        </a>

        <!-- Nuvio -->
        <a class="btn btn-nuvio" id="nuvioBtn" href="#">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
          </svg>
          Nuvio'ya Yükle
        </a>

        <div class="divider">
          <div class="divider-line"></div>
          <span class="divider-text">veya</span>
          <div class="divider-line"></div>
        </div>

        <!-- Manifest URL -->
        <div class="url-label">Manifest URL</div>
        <div class="url-row" id="urlRow">
          <svg class="copy-icon" viewBox="0 0 24 24">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
          </svg>
          <span class="url-text" id="urlText">yükleniyor…</span>
        </div>
        <div class="copied-msg" id="copiedMsg">Kopyalandı ✓</div>

        <!-- Ghost link: poster status -->
        <div style="margin-top:1rem">
          <a class="btn btn-ghost" href="/poster-status">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-4l-3-3.75L6 15h12l-3.75-5-2.25 3z"/>
            </svg>
            Poster Kuyruğu
          </a>
        </div>



      </div>
    </div>
  </div>

  <script>
    const manifest = 'https://retromio.onrender.com/manifest.json';

    // Set URL display
    document.getElementById('urlText').textContent = manifest;

    // Stremio — stremio:// deep link
    document.getElementById('stremioBtn').href =
      manifest.replace(/^https?:\\/\\//, 'stremio://');

    // Nuvio — copy manifest URL to clipboard
    document.getElementById('nuvioBtn').addEventListener('click', (e) => {
      e.preventDefault();
      navigator.clipboard.writeText(manifest).then(() => {
        const btn = document.getElementById('nuvioBtn');
        const original = btn.innerHTML;
        btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Kopyalandı!';
        setTimeout(() => { btn.innerHTML = original; }, 2200);
      });
    });

    // Copy manifest URL
    document.getElementById('urlRow').addEventListener('click', () => {
      navigator.clipboard.writeText(manifest).then(() => {
        const el = document.getElementById('copiedMsg');
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 2200);
      });
    });
  </script>

</body>
</html>
`);
});

// ─── Manifest ─────────────────────────────────────────────────────────────────

app.get("/manifest.json",            (req, res) => res.json(baseManifest));
app.get("/:config/manifest.json",    (req, res) => res.json(baseManifest));

// ─── AI Poster ────────────────────────────────────────────────────────────────
// Flow: check B2 cache → if hit, redirect immediately
//       if pending, wait for it → redirect
//       if new, trigger + wait → redirect
//       on any failure, redirect to TMDB fallback

app.get("/ai-poster", async (req, res) => {
  const { title, year, type, genres, overview, fallback } = req.query;

  if (!title) {
    return fallback ? res.redirect(fallback) : res.status(400).send("Missing title");
  }

  const key = posterKey(title, year);

  // 1. B2 cache hit
  try {
    const exists = await existsInB2(key);
    if (exists) {
      console.log(`[Poster] B2 hit: ${key}`);
      return res.redirect(`${B2_PUBLIC}/${key}`);
    }
  } catch (err) {
    console.error(`[Poster] B2 check error: ${err.message}`);
  }

  // 2. Already generating — attach to existing promise
  if (AI_PENDING.has(key)) {
    try {
      await AI_PENDING.get(key);
      return res.redirect(`${B2_PUBLIC}/${key}`);
    } catch {
      return fallback ? res.redirect(fallback) : res.status(500).send("Generation failed");
    }
  }

  // 3. New request — trigger and wait
  triggerPoster(title, year, type, genres, overview);

  try {
    const pending = AI_PENDING.get(key);
    if (pending) await pending;
    return res.redirect(`${B2_PUBLIC}/${key}`);
  } catch {
    return fallback ? res.redirect(fallback) : res.status(500).send("Generation failed");
  }
});

// ─── Poster Queue Status ──────────────────────────────────────────────────────

app.get("/poster-status", (req, res) => {
  const status  = getQueueStatus();
  const pending = [...AI_PENDING.keys()];
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Retromio — Poster Queue</title>
  <meta http-equiv="refresh" content="5">
  <style>
    body { background: #0a0a0f; color: #e8e0d5; font-family: monospace; padding: 2rem; }
    h2 { color: #c9a84c; margin-bottom: 1rem; }
    .stat { margin: .4rem 0; }
    .key { color: #7a6e60; }
    ul { margin-top: 1rem; padding-left: 1.2rem; }
    li { font-size: .8rem; color: #a09080; margin: .2rem 0; }
    a { color: #c9a84c; }
  </style>
</head>
<body>
  <h2>🎨 AI Poster Queue</h2>
  ${status.quotaExhausted ? '<div style="background:#3a1a1a;border:1px solid #c94c4c;border-radius:6px;padding:.75rem 1rem;margin-bottom:1rem;color:#e07070;">⚠️ HuggingFace quota exhausted. Serving TMDB fallback posters. Upgrade to HF Pro or purchase credits.</div>' : ''}
  <div class="stat"><span class="key">Active:  </span> ${status.active} / ${status.max}</div>
  <div class="stat"><span class="key">Queued:  </span> ${status.queued}</div>
  <div class="stat"><span class="key">Pending: </span> ${status.pending}</div>
  ${pending.length > 0 ? `<ul>${pending.map(k => `<li>${k}</li>`).join("")}</ul>` : "<p style='margin-top:1rem;color:#7a6e60'>Queue is empty.</p>"}
  <p style="margin-top:2rem;font-size:.75rem;color:#7a6e60">Auto-refreshes every 5 seconds. <a href="/configure">← Back</a></p>
</body>
</html>`);
});

// ─── Catalog ──────────────────────────────────────────────────────────────────

async function handleCatalog(req, res) {
  const { type, id } = req.params;
  const baseUrl = getBaseUrl(req);
  const skip    = parseInt(
    req.query.skip ||
    (req.params.extra || "").replace("skip=", "") ||
    "0"
  );

  console.log(`[Catalog] type=${type} id=${id} skip=${skip}`);
  try {
    const metas = await fetchCatalog(id, type, skip, baseUrl);
    res.json({ metas });
  } catch (err) {
    console.error(`[Catalog] ${err.message}`);
    res.json({ metas: [] });
  }
}

app.get("/catalog/:type/:id/:extra?.json",        handleCatalog);
app.get("/:config/catalog/:type/:id/:extra?.json", handleCatalog);

// ─── Meta ─────────────────────────────────────────────────────────────────────

async function handleMeta(req, res) {
  const { type, id } = req.params;
  const baseUrl = getBaseUrl(req);
  console.log(`[Meta] type=${type} id=${id}`);
  try {
    const meta = await fetchMeta(id, type, baseUrl);
    res.json({ meta: meta || null });
  } catch (err) {
    console.error(`[Meta] ${err.message}`);
    res.json({ meta: null });
  }
}

app.get("/meta/:type/:id.json",        handleMeta);
app.get("/:config/meta/:type/:id.json", handleMeta);

// ─── Stream ───────────────────────────────────────────────────────────────────

async function handleStream(req, res) {
  const { type, id } = req.params;
  console.log(`[Stream] type=${type} id=${id}`);
  try {
    const streams = await fetchStreams(id, type);
    res.json({ streams: streams || [] });
  } catch (err) {
    console.error(`[Stream] ${err.message}`);
    res.json({ streams: [] });
  }
}

app.get("/stream/:type/:id.json",        handleStream);
app.get("/:config/stream/:type/:id.json", handleStream);

// ─── Root ─────────────────────────────────────────────────────────────────────

app.get("/", (req, res) => res.redirect("/configure"));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🎬 Retromio running on port ${PORT}`);
  console.log(`📺 Configure:     http://localhost:${PORT}/configure`);
  console.log(`📋 Manifest:      http://localhost:${PORT}/manifest.json`);
  console.log(`🎨 Poster status: http://localhost:${PORT}/poster-status\n`);

  // Warn if required env vars are missing
  const missing = ["REPLICATE_TOKEN", "B2_KEY_ID", "B2_APP_KEY"].filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.warn(`⚠️  Missing env vars: ${missing.join(", ")}`);
    console.warn("   AI poster generation will be disabled until these are set.\n");
  }
});
