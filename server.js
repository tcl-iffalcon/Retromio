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
  const baseUrl     = getBaseUrl(req);
  const manifestUrl = `${baseUrl}/manifest.json`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Retromio</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,600;1,300;1,600&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      background: #06060e;
      font-family: 'DM Sans', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .bg-img {
      position: fixed; inset: 0;
      background-image: url('/kibar-feyzo.jpg');
      background-size: cover;
      background-position: center;
      opacity: 0.32;
      filter: grayscale(20%);
      transform: scale(1.04);
    }
    .bg-overlay {
      position: fixed; inset: 0;
      background:
        linear-gradient(to right, rgba(6,6,14,0.35) 0%, rgba(6,6,14,0.75) 60%, rgba(6,6,14,0.92) 100%),
        linear-gradient(to bottom, rgba(6,6,14,0.3) 0%, transparent 30%, transparent 70%, rgba(6,6,14,0.6) 100%);
    }
    .grain {
      position: fixed; inset: 0; opacity: 0.03;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E");
      pointer-events: none;
    }
    .wrap {
      position: relative; z-index: 10;
      display: flex; align-items: center; justify-content: flex-end;
      width: 100%; max-width: 1100px; min-height: 100vh; padding: 3rem;
    }
    .panel { width: 100%; max-width: 390px; animation: fadeIn 1.2s cubic-bezier(0.16,1,0.3,1) both; }
    .brand { margin-bottom: 2.5rem; }
    .brand-eyebrow {
      font-size: 0.62rem; letter-spacing: 0.28em; text-transform: uppercase;
      color: rgba(210,175,95,0.55); margin-bottom: 0.75rem;
    }
    .brand-name {
      font-family: 'Cormorant Garamond', serif;
      font-size: 4.2rem; font-weight: 600;
      color: #f5ede0; line-height: 0.88; letter-spacing: -0.02em;
    }
    .brand-name span { font-style: italic; color: #d2af5f; }
    .brand-line { width: 28px; height: 1px; background: rgba(210,175,95,0.35); margin: 1.25rem 0; }
    .brand-desc { font-size: 0.82rem; line-height: 1.75; color: rgba(255,255,255,0.35); font-weight: 300; }
    .brand-desc strong { color: rgba(255,255,255,0.62); font-weight: 400; }
    .card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px; padding: 1.75rem;
      backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.02) inset, 0 32px 64px rgba(0,0,0,0.5);
    }
    .btn {
      display: flex; align-items: center; justify-content: center; gap: 0.55rem;
      width: 100%; padding: 0.85rem 1.25rem; border-radius: 10px;
      font-family: 'DM Sans', sans-serif; font-size: 0.875rem; font-weight: 500;
      letter-spacing: 0.01em; cursor: pointer; text-decoration: none;
      transition: all 0.18s ease; border: none; margin-bottom: 0.625rem;
    }
    .btn-primary {
      background: linear-gradient(135deg, #d2af5f 0%, #a8862a 100%);
      color: #06060e; box-shadow: 0 2px 16px rgba(210,175,95,0.2);
    }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(210,175,95,0.35); filter: brightness(1.08); }
    .btn-secondary {
      background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.52);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.78); border-color: rgba(255,255,255,0.13); transform: translateY(-1px); }
    .url-section { margin-top: 1.25rem; padding-top: 1.25rem; border-top: 1px solid rgba(255,255,255,0.05); }
    .url-label { font-size: 0.6rem; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.18); margin-bottom: 0.5rem; }
    .url-row {
      display: flex; align-items: center; gap: 0.6rem;
      background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05);
      border-radius: 8px; padding: 0.65rem 0.875rem;
      cursor: pointer; transition: border-color 0.15s;
    }
    .url-row:hover { border-color: rgba(210,175,95,0.2); }
    .url-row:hover .copy-svg { opacity: 0.65; }
    .url-text {
      flex: 1; font-size: 0.64rem; color: rgba(255,255,255,0.22);
      font-family: 'SF Mono', 'Fira Code', monospace;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .copy-svg { width: 13px; height: 13px; fill: rgba(255,255,255,0.22); flex-shrink: 0; opacity: 0.38; transition: opacity 0.15s; }
    .copied { font-size: 0.64rem; color: #d2af5f; text-align: right; margin-top: 0.35rem; opacity: 0; transition: opacity 0.25s; height: 0.9rem; }
    .copied.on { opacity: 1; }
    @keyframes fadeIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
    @media (max-width: 700px) { .wrap { justify-content: center; padding: 1.5rem; min-height: 100svh; } .brand-name { font-size: 3.2rem; } }
  </style>
</head>
<body>
  <div class="bg-img"></div>
  <div class="bg-overlay"></div>
  <div class="grain"></div>
  <div class="wrap">
    <div class="panel">
      <div class="brand">
        <p class="brand-eyebrow">Stremio &amp; Nuvio Addon</p>
        <h1 class="brand-name">Retro<span>mio</span></h1>
        <div class="brand-line"></div>
        <p class="brand-desc">
          <strong>Nuvio</strong> ve <strong>Stremio</strong> için posterleri yapay zeka aracılığıyla düzenler,
          <strong>Vidlink</strong> ve <strong>NetMirror</strong> kaynaklarından içerik sunar.
        </p>
      </div>
      <div class="card">
        <a class="btn btn-primary" id="stremioBtn" href="#">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
          Stremio'ya Yükle
        </a>
        <a class="btn btn-secondary" id="nuvioBtn" href="#">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
          Nuvio'ya Yükle
        </a>
        <a class="btn btn-secondary" href="/poster-status">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-4l-3-3.75L6 15h12l-3.75-5-2.25 3z"/></svg>
          Poster Kuyruğu
        </a>
        <div class="url-section">
          <p class="url-label">Manifest URL</p>
          <div class="url-row" id="urlRow">
            <svg class="copy-svg" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            <span class="url-text" id="urlText">—</span>
          </div>
          <p class="copied" id="copied">Kopyalandı ✓</p>
        </div>
      </div>
    </div>
  </div>
  <script>
    const base = window.location.origin;
    const manifest = base + '/manifest.json';
    document.getElementById('urlText').textContent = manifest;
    document.getElementById('stremioBtn').href = manifest.replace(/^https?:\/\//, 'stremio://');
    document.getElementById('nuvioBtn').href = 'https://www.nuvio.cc/install?manifest=' + encodeURIComponent(manifest);
    document.getElementById('urlRow').addEventListener('click', () => {
      navigator.clipboard.writeText(manifest).then(() => {
        const el = document.getElementById('copied');
        el.classList.add('on');
        setTimeout(() => el.classList.remove('on'), 2000);
      });
    });
  </script>
</body>
</html>`);
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
  const missing = ["HF_TOKEN", "B2_KEY_ID", "B2_APP_KEY"].filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.warn(`⚠️  Missing env vars: ${missing.join(", ")}`);
    console.warn("   AI poster generation will be disabled until these are set.\n");
  }
});
