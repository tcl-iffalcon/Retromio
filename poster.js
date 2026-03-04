const fetch = require("node-fetch");
const crypto = require("crypto");

// ─── Cloudinary Config ────────────────────────────────────────────────────────
const CLD_CLOUD  = process.env.CLD_CLOUD  || "retromio";
const CLD_KEY    = process.env.CLD_KEY    || "276591239885363";
const CLD_SECRET = process.env.CLD_SECRET || "eTu9x75UoJR-EKsWVkh_WnTCGN0";
const CLD_FOLDER = "posters";
const CLD_BASE   = `https://res.cloudinary.com/${CLD_CLOUD}/image/upload/${CLD_FOLDER}`;

// ─── Replicate Config ─────────────────────────────────────────────────────────
const REPLICATE_TOKEN = process.env.REPLICATE_TOKEN || "";

// ─── Poster versioning ────────────────────────────────────────────────────────
const POSTER_VERSION = process.env.POSTER_VERSION || "v14";

// ─── Concurrency & Queue ──────────────────────────────────────────────────────
const AI_PENDING     = new Map();
let   activeRequests = 0;
const MAX_CONCURRENT = 1;
const requestQueue   = [];

const MIN_REQUEST_INTERVAL_MS = 11000;
let   lastRequestTime         = 0;
let   replicateQuotaExhausted = false;

// ─── Genre map ────────────────────────────────────────────────────────────────
const GENRE_MAP = {
  28: "action", 12: "adventure", 16: "animation", 35: "comedy",
  80: "crime", 99: "documentary", 18: "drama", 10751: "family",
  14: "fantasy", 36: "history", 27: "horror", 10402: "music",
  9648: "mystery", 10749: "romance", 878: "science fiction",
  10770: "tv movie", 53: "thriller", 10752: "war", 37: "western",
  10759: "action & adventure", 10762: "kids", 10763: "news",
  10764: "reality", 10765: "sci-fi & fantasy", 10766: "soap",
  10767: "talk", 10768: "war & politics"
};

const GENRE_STYLES = {
  horror:               "terrifying 1970s horror movie poster, dark gothic atmosphere, deep crimson black shadows, menacing figures, dripping paint texture, screaming bold title, painted illustration",
  thriller:             "1960s psychological thriller painted poster, cold blue grey palette, tense shadowy figures, paranoid atmosphere, stark contrast, bold condensed title",
  "science fiction":    "retro 1950s sci-fi painted movie poster, deep space blues purples, futuristic characters and technology, dramatic cosmic scene, bold retro-futurist typography",
  "sci-fi & fantasy":   "retro 1950s sci-fi painted movie poster, deep space blues purples, futuristic characters and technology, dramatic cosmic scene, bold retro-futurist typography",
  action:               "explosive 1980s action movie painted poster, intense orange red fiery palette, heroic muscular figures, dramatic explosion background, bold aggressive title typography",
  "action & adventure": "explosive 1980s action movie painted poster, intense orange red fiery palette, heroic figures in combat, dramatic scene, bold aggressive title typography",
  adventure:            "classic 1950s adventure painted movie poster, rich jungle greens golden yellows, heroic explorer figures, exotic dramatic scene, bold adventurous title",
  romance:              "elegant 1940s romantic painted movie poster, soft warm rose gold ivory palette, glamorous couple, dreamy atmosphere, flowing art nouveau typography",
  comedy:               "fun vintage 1960s comedy painted movie poster, bright cheerful warm palette, expressive comedic characters, playful scene, bold colorful title",
  animation:            "vintage 1950s illustrated movie poster, vibrant jewel tone colors, whimsical characters, magical scene, bold playful retro title typography",
  fantasy:              "epic fantasy painted movie poster, deep jewel tones purple gold emerald, mythical characters and creatures, grand dramatic scene, ornate fantasy typography",
  crime:                "1940s film noir painted movie poster, dramatic high contrast, deep blacks cool blues, shadowy detective figures, smoky atmosphere, classic noir typography",
  drama:                "classic Hollywood 1950s painted drama poster, warm amber crimson cream palette, expressive emotional characters, intimate cinematic scene, elegant serif title",
  war:                  "powerful 1940s war painted movie poster, muted olive grey brown palette, soldiers in dramatic battle scene, gritty atmosphere, bold patriotic typography",
  western:              "classic 1960s western painted movie poster, warm dusty desert palette, lone cowboy silhouette, dramatic sunset, bold slab serif title typography",
  history:              "epic historical painted movie poster, rich earthy tones gold bronze, period-accurate costumes and setting, grand dramatic composition, classical typography",
  mystery:              "atmospheric 1950s mystery painted poster, moody blue purple shadows, mysterious figure in fog, suspenseful composition, elegant serif title",
  family:               "warm vintage 1950s family adventure poster, bright cheerful palette, wholesome characters in exciting scene, friendly retro typography"
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function posterPublicId(title, year) {
  const safe = (title || "unknown").replace(/[^a-z0-9]/gi, "_").toLowerCase().substring(0, 80);
  return `${CLD_FOLDER}/${POSTER_VERSION}_${safe}_${year || "0"}`;
}

function posterKey(title, year) {
  const safe = (title || "unknown").replace(/[^a-z0-9]/gi, "_").toLowerCase().substring(0, 80);
  return `${POSTER_VERSION}_${safe}_${year || "0"}`;
}

function posterUrl(title, year) {
  return `${CLD_BASE}/${posterKey(title, year)}.jpg`;
}

function processQueue() {
  if (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    const next = requestQueue.shift();
    next().catch(err => {
      console.error(`[Queue] Unhandled task error: ${err.message}`);
    }).finally(() => {
      activeRequests--;
      processQueue();
    });
  }
}

// ─── Cloudinary helpers ───────────────────────────────────────────────────────

async function existsInCloudinary(title, year) {
  try {
    const url = posterUrl(title, year);
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function uploadToCloudinary(title, year, buffer) {
  const publicId  = posterPublicId(title, year);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // Cloudinary signature: sorted params, no folder field, append secret directly
  const toSign    = `public_id=${publicId}&timestamp=${timestamp}${CLD_SECRET}`;
  const signature = crypto.createHash("sha256").update(toSign).digest("hex");

  // Build multipart form
  const boundary = "----RetromioB" + Date.now();
  const CRLF     = "\r\n";

  const fields = {
    api_key:   CLD_KEY,
    timestamp,
    public_id: publicId,
    signature
  };

  let body = "";
  for (const [k, v] of Object.entries(fields)) {
    body += `--${boundary}${CRLF}`;
    body += `Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}`;
    body += `${v}${CRLF}`;
  }
  body += `--${boundary}${CRLF}`;
  body += `Content-Disposition: form-data; name="file"; filename="poster.jpg"${CRLF}`;
  body += `Content-Type: image/jpeg${CRLF}${CRLF}`;

  const prefix = Buffer.from(body, "binary");
  const suffix = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, "binary");
  const full   = Buffer.concat([prefix, buffer, suffix]);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLD_CLOUD}/image/upload`, {
    method:  "POST",
    headers: {
      "Content-Type":   `multipart/form-data; boundary=${boundary}`,
      "Content-Length": full.length.toString()
    },
    body: full
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Cloudinary upload failed ${res.status}: ${txt}`);
  }

  const json = await res.json();
  console.log(`[Cloudinary] Uploaded: ${json.public_id} (${json.bytes} bytes)`);
  return json.secure_url;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(title, year, type, genreIds, overview) {
  const ids        = (genreIds || "").split(",").map(Number).filter(Boolean);
  const genreNames = ids.map(id => GENRE_MAP[id]).filter(Boolean);
  const primary    = genreNames[0] || "drama";
  const style      = GENRE_STYLES[primary] || "classic 1950s Hollywood painted movie poster, rich warm palette, dramatic characters, cinematic composition, bold vintage typography";
  const plotHint   = overview ? overview.substring(0, 120) : "";
  const mediaLabel = type === "series" ? "TV series" : "film";

  const prompt = [
    style,
    `movie poster for the ${mediaLabel} "${title}"${year ? ` (${year})` : ""}`,
    plotHint ? `scene inspired by: ${plotHint}` : "",
    "portrait orientation 2:3",
    "highly detailed hand-painted illustration",
    "dramatic cinematic composition with characters",
    "vintage tagline at bottom",
    "professional vintage movie poster layout",
    "NOT flat design, NOT yellow background, NOT minimalist, NOT comic book flat outline",
    "rich deep colors, strong cinematic contrast, painterly oil texture"
  ].filter(Boolean).join(", ");

  return { prompt, styleLabel: primary };
}

// ─── Replicate generation ─────────────────────────────────────────────────────

async function _executeGenerate(title, year, type, genreIds, overview) {
  const { prompt, styleLabel } = buildPrompt(title, year, type, genreIds, overview);
  const seed = Math.abs([...(title || "x")].reduce((a, c) => a + c.charCodeAt(0), 0));

  const now     = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    const wait = MIN_REQUEST_INTERVAL_MS - elapsed;
    console.log(`[AI] Rate-limit gate: waiting ${wait}ms`);
    await new Promise(r => setTimeout(r, wait));
  }
  lastRequestTime = Date.now();

  const createRes = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${REPLICATE_TOKEN}`,
      "Content-Type":  "application/json",
      "Prefer":        "wait"
    },
    body: JSON.stringify({
      input: {
        prompt,
        width:               512,
        height:              768,
        num_inference_steps: 4,
        seed,
        output_format:       "jpg",
        output_quality:      90,
        go_fast:             true
      }
    })
  });

  if (!createRes.ok) {
    const txt = await createRes.text();
    const err  = new Error(`Replicate ${createRes.status}: ${txt.substring(0, 200)}`);
    err.status = createRes.status;
    throw err;
  }

  let prediction = await createRes.json();
  console.log(`[AI] Prediction ${prediction.id} — status: ${prediction.status}`);

  const maxWait = 120000;
  const started = Date.now();
  while (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
    if (Date.now() - started > maxWait) throw new Error("Replicate timeout");
    await new Promise(r => setTimeout(r, 2000));
    const pollRes  = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { "Authorization": `Bearer ${REPLICATE_TOKEN}` }
    });
    prediction = await pollRes.json();
    console.log(`[AI] Polling ${prediction.id} — ${prediction.status}`);
  }

  if (prediction.status !== "succeeded") {
    throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error || "unknown"}`);
  }

  const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!imageUrl) throw new Error("Replicate returned no image URL");

  console.log(`[AI] Downloading: ${imageUrl}`);
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Image download failed ${imgRes.status}`);

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  if (buffer.length < 1000) throw new Error(`Image too small (${buffer.length} bytes)`);

  console.log(`[AI] Generated: "${title}" (${buffer.length} bytes)`);
  return buffer;
}

async function generatePoster(title, year, type, genreIds, overview) {
  if (!REPLICATE_TOKEN)        throw new Error("REPLICATE_TOKEN not set");
  if (replicateQuotaExhausted) throw new Error("Replicate quota exhausted");

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[AI] Generating (attempt ${attempt}/${MAX_RETRIES}): "${title}"`);
      return await _executeGenerate(title, year, type, genreIds, overview);
    } catch (err) {
      if (err.status === 402) {
        replicateQuotaExhausted = true;
        console.warn(`[AI] Replicate 402 — insufficient credit. Falling back to TMDB.`);
        throw err;
      }
      if (err.status === 429) {
        if (attempt >= MAX_RETRIES) {
          console.warn(`[AI] Replicate 429 — max retries reached for "${title}". Skipping.`);
          throw new Error(`Replicate rate limited after ${MAX_RETRIES} attempts`);
        }
        const delay = 20000 * attempt;
        console.warn(`[AI] Replicate 429. Retry ${attempt}/${MAX_RETRIES} in ${delay/1000}s…`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

// ─── Main: trigger background generation ─────────────────────────────────────

function triggerPoster(title, year, type, genreIds, overview) {
  if (!title) return;
  const key = posterKey(title, year);
  if (AI_PENDING.has(key)) return;

  const promise = new Promise((resolve, reject) => {
    const task = async () => {
      try {
        const exists = await existsInCloudinary(title, year);
        if (exists) {
          console.log(`[AI] Cache hit in Cloudinary: ${key}`);
          resolve();
          return;
        }

        const buf = await generatePoster(title, year, type, genreIds, overview);
        await uploadToCloudinary(title, year, buf);
        console.log(`[AI] Stored in Cloudinary: ${key}`);
        resolve();
      } catch (err) {
        console.error(`[AI] Failed for "${title}": ${err.message}`);
        reject(err);
      } finally {
        AI_PENDING.delete(key);
      }
    };

    requestQueue.push(task);
    processQueue();
  });

  AI_PENDING.set(key, promise);
}

// ─── Status ───────────────────────────────────────────────────────────────────

function getQueueStatus() {
  return {
    active:         activeRequests,
    queued:         requestQueue.length,
    pending:        AI_PENDING.size,
    max:            MAX_CONCURRENT,
    provider:       "Replicate + Cloudinary",
    quotaExhausted: replicateQuotaExhausted
  };
}

// ─── Exports (B2 compat shims for server.js) ──────────────────────────────────
// server.js references existsInB2 and B2_PUBLIC — provide shims so it still works

async function existsInB2(title, year) {
  return existsInCloudinary(title, year);
}

module.exports = {
  triggerPoster,
  posterUrl,
  posterKey,
  existsInB2,         // shim
  uploadToB2: uploadToCloudinary, // shim
  generatePoster,
  getQueueStatus,
  B2_PUBLIC: CLD_BASE, // shim
  AI_PENDING,
  MAX_CONCURRENT,
  requestQueue
};
