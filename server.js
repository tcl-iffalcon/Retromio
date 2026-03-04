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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.get("host")}`;
}

// ─── Configure Page ───────────────────────────────────────────────────────────

app.get("/configure", (req, res) => {
  const baseUrl     = getBaseUrl(req);
  const manifestUrl = `${baseUrl}/manifest.json`;
  const stremioUrl  = manifestUrl.replace(/^https?:\/\//, "stremio://");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Retromio</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a0a0f;
      color: #e8e0d5;
      font-family: Georgia, serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container { max-width: 500px; width: 100%; text-align: center; }
    .logo { width: 90px; margin-bottom: 1rem; filter: sepia(.4) brightness(.9); }
    h1 {
      font-size: 2.2rem;
      letter-spacing: .2em;
      text-transform: uppercase;
      color: #c9a84c;
      margin-bottom: .25rem;
    }
    .tagline { color: #7a6e60; font-style: italic; margin-bottom: 2rem; }
    .card {
      background: #13131a;
      border: 1px solid #2a2520;
      border-radius: 10px;
      padding: 2rem;
    }
    .desc {
      font-size: .9rem;
      color: #a09080;
      margin-bottom: 1.5rem;
      line-height: 1.7;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 1rem;
      background: #c9a84c;
      color: #0a0a0f;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      font-family: Georgia, serif;
      font-weight: bold;
      letter-spacing: .1em;
      text-transform: uppercase;
      cursor: pointer;
      text-decoration: none;
      margin-bottom: .75rem;
      transition: background .2s;
    }
    .btn:hover { background: #e0bc5a; }
    .btn-secondary {
      background: transparent;
      border: 1px solid #c9a84c;
      color: #c9a84c;
    }
    .btn-secondary:hover { background: #c9a84c22; }
    .url-box {
      padding: .75rem;
      background: #0d0d12;
      border: 1px solid #2a2520;
      border-radius: 6px;
      font-size: .72rem;
      color: #7a6e60;
      word-break: break-all;
      margin-top: .75rem;
      cursor: pointer;
      transition: border-color .2s;
    }
    .url-box:hover { border-color: #c9a84c66; }
    .badges {
      display: flex;
      gap: .5rem;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 1.5rem;
    }
    .badge {
      padding: .3rem .8rem;
      border: 1px solid #2a2520;
      border-radius: 20px;
      font-size: .75rem;
      color: #7a6e60;
    }
    .badge.ai { border-color: #c9a84c55; color: #c9a84c; }
    .divider { border: none; border-top: 1px solid #2a2520; margin: 1.25rem 0; }
    #copy-msg { font-size: .75rem; color: #c9a84c; height: 1rem; margin-top: .4rem; }
  </style>
</head>
<body>
  <div class="container">
    <img class="logo" src="https://img.icons8.com/fluency/96/retro-tv.png" alt="Retromio">
    <h1>Retromio</h1>
    <p class="tagline">Vintage cinema, modern streams</p>
    <div class="card">
      <p class="desc">
        AI-generated retro cinema posters — pulp fiction style, vintage Hollywood,
        dramatic lighting — for every movie &amp; series on TMDB.
        Streams via Vidlink &amp; NetMirror in up to 1080p.
      </p>
      <a class="btn" href="${stremioUrl}">📺 Install to Stremio</a>
      <a class="btn btn-secondary" href="/poster-status">🎨 Poster Queue Status</a>
      <hr class="divider">
      <div class="url-box" onclick="copyUrl(this)" title="Click to copy">${manifestUrl}</div>
      <div id="copy-msg"></div>
      <div class="badges">
        <span class="badge">Vidlink</span>
        <span class="badge">NetMirror</span>
        <span class="badge">TMDB</span>
        <span class="badge ai">✨ AI Posters</span>
        <span class="badge">1080p</span>
        <span class="badge">Backblaze B2</span>
      </div>
    </div>
  </div>
  <script>
    function copyUrl(el) {
      navigator.clipboard.writeText(el.textContent.trim()).then(() => {
        document.getElementById("copy-msg").textContent = "✓ Copied to clipboard";
        setTimeout(() => document.getElementById("copy-msg").textContent = "", 2000);
      });
    }
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
