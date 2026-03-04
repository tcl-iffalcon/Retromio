const fetch = require(“node-fetch”);
const crypto = require(“crypto”);

// ─── Backblaze B2 Config ──────────────────────────────────────────────────────
const B2_KEY_ID   = process.env.B2_KEY_ID  || “”;
const B2_APP_KEY  = process.env.B2_APP_KEY || “”;
const B2_BUCKET   = process.env.B2_BUCKET  || “retromio-posters”;
const B2_REGION   = process.env.B2_REGION  || “us-east-005”;
const B2_ENDPOINT = `https://s3.${B2_REGION}.backblazeb2.com`;
const B2_PUBLIC   = `https://${B2_BUCKET}.s3.${B2_REGION}.backblazeb2.com`;

// ─── Replicate Config ─────────────────────────────────────────────────────────
const REPLICATE_TOKEN = process.env.REPLICATE_TOKEN || “”;
const REPLICATE_MODEL = “black-forest-labs/flux-schnell”;

// ─── Poster versioning ────────────────────────────────────────────────────────
const POSTER_VERSION = process.env.POSTER_VERSION || “v14”;

// ─── Concurrency & Queue ──────────────────────────────────────────────────────
const AI_PENDING     = new Map();
let   activeRequests = 0;
const MAX_CONCURRENT = 1;
const requestQueue   = [];

// Replicate free tier: 6 req/min → enforce 11s between requests
// FIX: This is now only enforced inside _executeGenerate, not bypassed by retries
const MIN_REQUEST_INTERVAL_MS = 11000;
let   lastRequestTime         = 0;

// ─── Genre → Prompt style map ─────────────────────────────────────────────────
const GENRE_MAP = {
28: “action”, 12: “adventure”, 16: “animation”, 35: “comedy”,
80: “crime”, 99: “documentary”, 18: “drama”, 10751: “family”,
14: “fantasy”, 36: “history”, 27: “horror”, 10402: “music”,
9648: “mystery”, 10749: “romance”, 878: “science fiction”,
10770: “tv movie”, 53: “thriller”, 10752: “war”, 37: “western”,
10759: “action & adventure”, 10762: “kids”, 10763: “news”,
10764: “reality”, 10765: “sci-fi & fantasy”, 10766: “soap”,
10767: “talk”, 10768: “war & politics”
};

const GENRE_STYLES = {
horror:               “terrifying 1970s horror movie poster, dark gothic atmosphere, deep crimson black shadows, menacing figures, dripping paint texture, screaming bold title, painted illustration”,
thriller:             “1960s psychological thriller painted poster, cold blue grey palette, tense shadowy figures, paranoid atmosphere, stark contrast, bold condensed title”,
“science fiction”:    “retro 1950s sci-fi painted movie poster, deep space blues purples, futuristic characters and technology, dramatic cosmic scene, bold retro-futurist typography”,
“sci-fi & fantasy”:   “retro 1950s sci-fi painted movie poster, deep space blues purples, futuristic characters and technology, dramatic cosmic scene, bold retro-futurist typography”,
action:               “explosive 1980s action movie painted poster, intense orange red fiery palette, heroic muscular figures, dramatic explosion background, bold aggressive title typography”,
“action & adventure”: “explosive 1980s action movie painted poster, intense orange red fiery palette, heroic figures in combat, dramatic scene, bold aggressive title typography”,
adventure:            “classic 1950s adventure painted movie poster, rich jungle greens golden yellows, heroic explorer figures, exotic dramatic scene, bold adventurous title”,
romance:              “elegant 1940s romantic painted movie poster, soft warm rose gold ivory palette, glamorous couple, dreamy atmosphere, flowing art nouveau typography”,
comedy:               “fun vintage 1960s comedy painted movie poster, bright cheerful warm palette, expressive comedic characters, playful scene, bold colorful title”,
animation:            “vintage 1950s illustrated movie poster, vibrant jewel tone colors, whimsical characters, magical scene, bold playful retro title typography”,
fantasy:              “epic fantasy painted movie poster, deep jewel tones purple gold emerald, mythical characters and creatures, grand dramatic scene, ornate fantasy typography”,
crime:                “1940s film noir painted movie poster, dramatic high contrast, deep blacks cool blues, shadowy detective figures, smoky atmosphere, classic noir typography”,
drama:                “classic Hollywood 1950s painted drama poster, warm amber crimson cream palette, expressive emotional characters, intimate cinematic scene, elegant serif title”,
war:                  “powerful 1940s war painted movie poster, muted olive grey brown palette, soldiers in dramatic battle scene, gritty atmosphere, bold patriotic typography”,
western:              “classic 1960s western painted movie poster, warm dusty desert palette, lone cowboy silhouette, dramatic sunset, bold slab serif title typography”,
history:              “epic historical painted movie poster, rich earthy tones gold bronze, period-accurate costumes and setting, grand dramatic composition, classical typography”,
mystery:              “atmospheric 1950s mystery painted poster, moody blue purple shadows, mysterious figure in fog, suspenseful composition, elegant serif title”,
family:               “warm vintage 1950s family adventure poster, bright cheerful palette, wholesome characters in exciting scene, friendly retro typography”
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function posterKey(title, year) {
const safe = (title || “unknown”)
.replace(/[^a-z0-9]/gi, “_”)
.toLowerCase()
.substring(0, 80);
return `${POSTER_VERSION}_${safe}_${year || "0"}.jpg`;
}

function posterUrl(title, year) {
return `${B2_PUBLIC}/${posterKey(title, year)}`;
}

// ─── Queue processor ──────────────────────────────────────────────────────────
// FIX: processQueue is the only place that increments activeRequests,
//      so concurrent slot management is centralized and can’t be bypassed.

function processQueue() {
if (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
activeRequests++;
const next = requestQueue.shift();
next().finally(() => {
activeRequests–;
processQueue(); // drain next item after current finishes
});
}
}

// ─── AWS Signature v4 for Backblaze S3-compatible API ────────────────────────

function awsHeaders(method, key, body, contentType) {
const now       = new Date();
const amzDate   = now.toISOString().replace(/[:-]/g, “”).replace(/.\d+Z/, “Z”);
const dateShort = amzDate.substring(0, 8);
const host      = `s3.${B2_REGION}.backblazeb2.com`;
const bodyHash  = crypto.createHash(“sha256”).update(body || “”).digest(“hex”);

const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
const signedHeaders    = “content-type;host;x-amz-content-sha256;x-amz-date”;
const canonicalRequest = [method, `/${B2_BUCKET}/${key}`, “”, canonicalHeaders, signedHeaders, bodyHash].join(”\n”);
const credentialScope  = `${dateShort}/${B2_REGION}/s3/aws4_request`;
const stringToSign     = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;

const signingKey = [“aws4_request”, “s3”, B2_REGION, dateShort]
.reduceRight((k, d) => crypto.createHmac(“sha256”, k).update(d).digest(), `AWS4${B2_APP_KEY}`);
const signature = crypto.createHmac(“sha256”, signingKey).update(stringToSign).digest(“hex”);

return {
“Authorization”:         `AWS4-HMAC-SHA256 Credential=${B2_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
“Content-Type”:          contentType,
“x-amz-content-sha256”:  bodyHash,
“x-amz-date”:            amzDate
};
}

async function existsInB2(key) {
try {
const headers = awsHeaders(“HEAD”, key, “”, “application/octet-stream”);
const res = await fetch(`${B2_ENDPOINT}/${B2_BUCKET}/${key}`, { method: “HEAD”, headers });
return res.ok;
} catch {
return false;
}
}

async function uploadToB2(key, buffer) {
const headers = awsHeaders(“PUT”, key, buffer, “image/jpeg”);
const res = await fetch(`${B2_ENDPOINT}/${B2_BUCKET}/${key}`, {
method: “PUT”,
headers,
body: buffer
});
if (!res.ok) {
const txt = await res.text();
throw new Error(`B2 upload failed ${res.status}: ${txt}`);
}
console.log(`[B2] Uploaded: ${key}`);
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(title, year, type, genreIds, overview) {
const ids        = (genreIds || “”).split(”,”).map(Number).filter(Boolean);
const genreNames = ids.map(id => GENRE_MAP[id]).filter(Boolean);
const primary    = genreNames[0] || “drama”;
const style      = GENRE_STYLES[primary] || “classic 1950s Hollywood painted movie poster, rich warm palette, dramatic characters, cinematic composition, bold vintage typography”;
const plotHint   = overview ? overview.substring(0, 120) : “”;
const mediaLabel = type === “series” ? “TV series” : “film”;

const prompt = [
style,
`movie poster for the ${mediaLabel} "${title}"${year ? ` (${year})` : ""}`,
plotHint ? `scene inspired by: ${plotHint}` : “”,
“portrait orientation 2:3”,
“highly detailed hand-painted illustration”,
“dramatic cinematic composition with characters”,
“vintage tagline at bottom”,
“professional vintage movie poster layout”,
“NOT flat design, NOT yellow background, NOT minimalist, NOT comic book flat outline”,
“rich deep colors, strong cinematic contrast, painterly oil texture”
].filter(Boolean).join(”, “);

return { prompt, styleLabel: primary };
}

// ─── AI Generation via Replicate ─────────────────────────────────────────────

let replicateQuotaExhausted = false;

const MAX_RETRIES    = 3;
const RETRY_DELAY_MS = 20000; // 20s base, exponential backoff

// FIX: _executeGenerate handles a single HTTP attempt only.
//      Retries are done by the caller (generatePoster) as a simple loop,
//      so activeRequests is never double-counted or prematurely released.
async function _executeGenerate(title, year, type, genreIds, overview) {
const { prompt, styleLabel } = buildPrompt(title, year, type, genreIds, overview);
const seed = Math.abs([…(title || “x”)].reduce((a, c) => a + c.charCodeAt(0), 0));

// Enforce minimum interval between Replicate requests
const now     = Date.now();
const elapsed = now - lastRequestTime;
if (elapsed < MIN_REQUEST_INTERVAL_MS) {
const wait = MIN_REQUEST_INTERVAL_MS - elapsed;
console.log(`[AI] Rate-limit gate: waiting ${wait}ms before next request`);
await new Promise(r => setTimeout(r, wait));
}
lastRequestTime = Date.now();

const createRes = await fetch(“https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions”, {
method: “POST”,
headers: {
“Authorization”: `Bearer ${REPLICATE_TOKEN}`,
“Content-Type”:  “application/json”,
“Prefer”:        “wait”
},
body: JSON.stringify({
input: {
prompt,
width:               512,
height:              768,
num_inference_steps: 4,
seed,
output_format:       “jpg”,
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

// Poll until done
const maxWait  = 120000;
const interval = 2000;
const started  = Date.now();

while (prediction.status !== “succeeded” && prediction.status !== “failed” && prediction.status !== “canceled”) {
if (Date.now() - started > maxWait) throw new Error(“Replicate timeout after 2 minutes”);
await new Promise(r => setTimeout(r, interval));

```
const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
  headers: { "Authorization": `Bearer ${REPLICATE_TOKEN}` }
});
prediction = await pollRes.json();
console.log(`[AI] Polling ${prediction.id} — ${prediction.status}`);
```

}

if (prediction.status !== “succeeded”) {
throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error || "unknown error"}`);
}

const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
if (!imageUrl) throw new Error(“Replicate returned no image URL”);

console.log(`[AI] Downloading: ${imageUrl}`);
const imgRes = await fetch(imageUrl);
if (!imgRes.ok) throw new Error(`Image download failed ${imgRes.status}`);

const arrayBuffer = await imgRes.arrayBuffer();
const buffer      = Buffer.from(arrayBuffer);
if (buffer.length < 1000) throw new Error(`Image too small (${buffer.length} bytes)`);

console.log(`[AI] Generated: "${title}" (${buffer.length} bytes)`);
return buffer;
}

// FIX: generatePoster is now a simple retry loop — no recursive calls,
//      no manual activeRequests manipulation. The slot is held for the
//      entire duration including retries, which is correct since the
//      queue slot IS being used while we wait.
async function generatePoster(title, year, type, genreIds, overview) {
if (!REPLICATE_TOKEN)        throw new Error(“REPLICATE_TOKEN env variable not set”);
if (replicateQuotaExhausted) throw new Error(“Replicate quota exhausted — using TMDB fallback posters”);

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
try {
console.log(`[AI] Generating poster (attempt ${attempt}/${MAX_RETRIES}): "${title}"`);
return await _executeGenerate(title, year, type, genreIds, overview);

```
} catch (err) {
  if (err.status === 402) {
    replicateQuotaExhausted = true;
    console.warn(`[AI] ⚠️  Replicate insufficient credit (402). Falling back to TMDB posters.`);
    throw err;
  }

  if (err.status === 429) {
    if (attempt >= MAX_RETRIES) {
      console.warn(`[AI] ⚠️  Replicate rate limit (429) — max retries reached for "${title}". Skipping.`);
      throw new Error(`Replicate 429: rate limited after ${MAX_RETRIES} attempts`);
    }
    const delay = RETRY_DELAY_MS * attempt; // 20s, 40s, 60s
    console.warn(`[AI] ⚠️  Replicate 429. Retry ${attempt}/${MAX_RETRIES} in ${delay / 1000}s…`);
    await new Promise(r => setTimeout(r, delay));
    continue;
  }

  // Any other error: propagate immediately
  throw err;
}
```

}
}

// ─── Main: trigger background generation ─────────────────────────────────────
// FIX: triggerPoster only pushes to queue, never calls processQueue() directly.
//      processQueue() is called only from: here after push, and from the
//      finally block in processQueue itself — preventing double-drain.

function triggerPoster(title, year, type, genreIds, overview) {
if (!title) return;
const key = posterKey(title, year);
if (AI_PENDING.has(key)) return; // already queued or in-flight

const promise = new Promise((resolve, reject) => {
const task = async () => {
try {
const exists = await existsInB2(key);
if (exists) {
console.log(`[AI] Cache hit in B2: ${key}`);
resolve();
return;
}

```
    const buf = await generatePoster(title, year, type, genreIds, overview);
    await uploadToB2(key, buf);
    console.log(`[AI] Stored in B2: ${key}`);
    resolve();

  } catch (err) {
    console.error(`[AI] Failed for "${title}": ${err.message}`);
    reject(err);
  } finally {
    AI_PENDING.delete(key);
  }
};

requestQueue.push(task);
processQueue(); // only called once per new item
```

});

AI_PENDING.set(key, promise);
}

// ─── Status helper ────────────────────────────────────────────────────────────

function getQueueStatus() {
return {
active:         activeRequests,
queued:         requestQueue.length,
pending:        AI_PENDING.size,
max:            MAX_CONCURRENT,
provider:       “Replicate (flux-schnell)”,
quotaExhausted: replicateQuotaExhausted
};
}

module.exports = {
triggerPoster,
posterUrl,
posterKey,
existsInB2,
uploadToB2,
generatePoster,
getQueueStatus,
B2_PUBLIC,
AI_PENDING,
MAX_CONCURRENT,
requestQueue
};