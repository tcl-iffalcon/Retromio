const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const path = require("path");

global.fetch = fetch;

const { fetchCatalog } = require("./routes/catalog");
const { fetchMeta } = require("./routes/meta");
const { fetchStreams } = require("./routes/stream");
const baseManifest = require("./manifest.json");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ─── Helpers ────────────────────────────────────────────────────────────────

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.get("host")}`;
}

function getUserConfig(req) {
  // Config is encoded in the URL path: /:config/manifest.json
  const config = req.params.config;
  if (!config) return { retro: false };
  try {
    return JSON.parse(Buffer.from(config, "base64").toString("utf8"));
  } catch {
    return { retro: false };
  }
}

// ─── Configure Page ──────────────────────────────────────────────────────────

app.get("/configure", (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Retromio - Configure</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a0a0f;
      color: #e8e0d5;
      font-family: 'Georgia', serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container {
      max-width: 520px;
      width: 100%;
    }
    .logo {
      text-align: center;
      margin-bottom: 2.5rem;
    }
    .logo img {
      width: 72px;
      height: 72px;
      margin-bottom: 1rem;
      filter: sepia(0.3);
    }
    h1 {
      font-size: 2rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #c9a84c;
      text-align: center;
    }
    .tagline {
      text-align: center;
      color: #7a6e60;
      font-style: italic;
      margin-top: 0.4rem;
      font-size: 0.9rem;
    }
    .card {
      background: #13131a;
      border: 1px solid #2a2520;
      border-radius: 8px;
      padding: 2rem;
      margin-top: 2rem;
    }
    .option-label {
      font-size: 1rem;
      color: #c9a84c;
      margin-bottom: 1rem;
      display: block;
      letter-spacing: 0.05em;
    }
    .poster-options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .poster-option {
      border: 2px solid #2a2520;
      border-radius: 6px;
      padding: 1rem;
      cursor: pointer;
      text-align: center;
      transition: all 0.2s;
      background: #0d0d12;
    }
    .poster-option:hover { border-color: #c9a84c; }
    .poster-option.selected {
      border-color: #c9a84c;
      background: #1a1508;
    }
    .poster-option .preview {
      width: 100%;
      height: 120px;
      border-radius: 4px;
      margin-bottom: 0.75rem;
      background: #1e1e28;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      overflow: hidden;
      position: relative;
    }
    .preview-original {
      background: linear-gradient(135deg, #1a2a4a, #2a1a3a);
    }
    .preview-retro {
      background: linear-gradient(135deg, #3d2b1f, #1f1a0f);
      filter: sepia(0.8) contrast(1.1) saturate(0.7);
    }
    .poster-option .name {
      font-size: 0.85rem;
      color: #e8e0d5;
      letter-spacing: 0.05em;
    }
    .poster-option .desc {
      font-size: 0.75rem;
      color: #5a5248;
      margin-top: 0.25rem;
    }
    .install-btn {
      width: 100%;
      padding: 1rem;
      background: #c9a84c;
      color: #0a0a0f;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      font-family: 'Georgia', serif;
      font-weight: bold;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
      transition: background 0.2s;
    }
    .install-btn:hover { background: #e0bc5a; }
    .install-url {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: #0d0d12;
      border: 1px solid #2a2520;
      border-radius: 6px;
      font-size: 0.8rem;
      color: #7a6e60;
      word-break: break-all;
      display: none;
    }
    .divider {
      border: none;
      border-top: 1px solid #2a2520;
      margin: 1.5rem 0;
    }
    .providers {
      display: flex;
      gap: 0.75rem;
      justify-content: center;
    }
    .provider-badge {
      padding: 0.3rem 0.75rem;
      border: 1px solid #2a2520;
      border-radius: 20px;
      font-size: 0.75rem;
      color: #7a6e60;
      letter-spacing: 0.05em;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <img src="https://img.icons8.com/fluency/96/retro-tv.png" alt="Retromio">
      <h1>Retromio</h1>
      <p class="tagline">Vintage cinema, modern streams</p>
    </div>

    <div class="card">
      <span class="option-label">🎞 Poster Style</span>
      <div class="poster-options">
        <div class="poster-option selected" onclick="selectStyle('original', this)">
          <div class="preview preview-original">🎬</div>
          <div class="name">Original</div>
          <div class="desc">TMDB posters as-is</div>
        </div>
        <div class="poster-option" onclick="selectStyle('retro', this)">
          <div class="preview preview-retro">🎞</div>
          <div class="name">Retro</div>
          <div class="desc">Vintage film aesthetic</div>
        </div>
      </div>

      <button class="install-btn" onclick="install()">
        📺 Install to Stremio
      </button>
      <div class="install-url" id="installUrl"></div>

      <hr class="divider">
      <div class="providers">
        <span class="provider-badge">Vidlink</span>
        <span class="provider-badge">NetMirror</span>
        <span class="provider-badge">TMDB</span>
      </div>
    </div>
  </div>

  <script>
    let selectedStyle = 'original';
    const BASE_URL = '${baseUrl}';

    function selectStyle(style, el) {
      selectedStyle = style;
      document.querySelectorAll('.poster-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
    }

    function getManifestUrl() {
      const config = { retro: selectedStyle === 'retro' };
      const encoded = btoa(JSON.stringify(config));
      return BASE_URL + '/' + encoded + '/manifest.json';
    }

    function install() {
      const url = getManifestUrl();
      const stremioUrl = 'stremio://' + url.replace(/^https?:\/\//, '');
      const urlDiv = document.getElementById('installUrl');
      urlDiv.style.display = 'block';
      urlDiv.textContent = url;
      window.location.href = stremioUrl;
    }
  </script>
</body>
</html>`);
});

// ─── Manifest ────────────────────────────────────────────────────────────────

app.get("/:config/manifest.json", (req, res) => {
  const config = getUserConfig(req);
  const manifest = {
    ...baseManifest,
    name: config.retro ? "Retromio ✦ Retro" : "Retromio",
    description: config.retro
      ? "Vintage-styled catalog with Vidlink & NetMirror streams"
      : "Modern catalog with Vidlink & NetMirror streams"
  };
  res.json(manifest);
});

app.get("/manifest.json", (req, res) => {
  res.json(baseManifest);
});

// ─── Retro Poster Proxy ───────────────────────────────────────────────────────

app.get("/poster", async (req, res) => {
  const imgUrl = req.query.img;
  if (!imgUrl) return res.status(400).send("Missing img param");

  try {
    const response = await fetch(imgUrl);
    if (!response.ok) throw new Error("Image fetch failed");
    const buffer = await response.buffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";

    // Return SVG wrapper that applies retro filter over the image
    const base64 = buffer.toString("base64");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="500" height="750">
  <defs>
    <filter id="retro" color-interpolation-filters="sRGB">
      <feColorMatrix type="saturate" values="0.55"/>
      <feColorMatrix type="matrix" values="
        1.1  0.1  0.05 0 0.02
        0.05 0.95 0.05 0 0.01
        0    0.05 0.8  0 0
        0    0    0    1 0"/>
      <feComponentTransfer>
        <feFuncR type="gamma" amplitude="1" exponent="0.9" offset="0.03"/>
        <feFuncG type="gamma" amplitude="1" exponent="0.95" offset="0.02"/>
        <feFuncB type="gamma" amplitude="0.9" exponent="1.05" offset="0"/>
      </feComponentTransfer>
      <feBlend in="SourceGraphic" mode="multiply"/>
    </filter>
    <!-- Grain overlay -->
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feBlend in="SourceGraphic" mode="overlay" result="blend"/>
      <feComposite in="blend" in2="SourceGraphic" operator="in"/>
    </filter>
  </defs>
  <!-- Base image with retro color grading -->
  <image href="data:${contentType};base64,${base64}" width="500" height="750" filter="url(#retro)"/>
  <!-- Vignette overlay -->
  <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
    <stop offset="60%" stop-color="transparent"/>
    <stop offset="100%" stop-color="rgba(10,5,0,0.55)"/>
  </radialGradient>
  <rect width="500" height="750" fill="url(#vignette)"/>
  <!-- Subtle warm overlay -->
  <rect width="500" height="750" fill="rgba(80,40,0,0.08)"/>
  <!-- Film strip top -->
  <rect width="500" height="18" fill="rgba(0,0,0,0.7)"/>
  <rect x="10" y="3" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="46" y="3" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="82" y="3" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="118" y="3" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="154" y="3" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="190" y="3" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="226" y="3" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="262" y="3" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="298" y="3" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="334" y="3" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="370" y="3" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="406" y="3" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="442" y="3" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <!-- Film strip bottom -->
  <rect y="732" width="500" height="18" fill="rgba(0,0,0,0.7)"/>
  <rect x="10" y="735" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="46" y="735" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="82" y="735" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="118" y="735" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="154" y="735" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="190" y="735" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="226" y="735" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="262" y="735" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="298" y="735" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="334" y="735" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="370" y="735" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="406" y="735" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
  <rect x="442" y="735" width="28" height="12" rx="2" fill="rgba(255,255,255,0.12)"/>
</svg>`;

    res.set("Content-Type", "image/svg+xml");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(svg);
  } catch (err) {
    console.error(`[Poster] Error: ${err.message}`);
    res.status(500).send("Poster error");
  }
});

// ─── Catalog ──────────────────────────────────────────────────────────────────

app.get("/:config/catalog/:type/:id/:extra?.json", async (req, res) => {
  const { type, id } = req.params;
  const config = getUserConfig(req);
  const baseUrl = getBaseUrl(req);
  const skip = parseInt(req.query.skip || "0");

  console.log(`[Catalog] Request: type=${type} id=${id} skip=${skip} retro=${config.retro}`);
  try {
    const metas = await fetchCatalog(id, type, skip, baseUrl, config.retro);
    res.json({ metas });
  } catch (err) {
    console.error(`[Catalog] Error: ${err.message}`);
    res.json({ metas: [] });
  }
});

// ─── Meta ─────────────────────────────────────────────────────────────────────

app.get("/:config/meta/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;
  console.log(`[Meta] Request: type=${type} id=${id}`);
  try {
    const meta = await fetchMeta(id, type);
    if (!meta) return res.json({ meta: null });
    res.json({ meta });
  } catch (err) {
    console.error(`[Meta] Error: ${err.message}`);
    res.json({ meta: null });
  }
});

// ─── Stream ───────────────────────────────────────────────────────────────────

app.get("/:config/stream/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;
  console.log(`[Stream] Request: type=${type} id=${id}`);
  try {
    const streams = await fetchStreams(id, type);
    res.json({ streams: streams || [] });
  } catch (err) {
    console.error(`[Stream] Error: ${err.message}`);
    res.json({ streams: [] });
  }
});

// ─── Root redirect ────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.redirect("/configure");
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🎬 Retromio running on port ${PORT}`);
  console.log(`📺 Configure: http://localhost:${PORT}/configure`);
  console.log(`📋 Manifest:  http://localhost:${PORT}/manifest.json\n`);
});
