const fetch = require(“node-fetch”);
const { triggerPoster, posterKey, existsInB2, B2_PUBLIC } = require(”./poster”);

const TMDB_API_KEY = process.env.TMDB_API_KEY || “439c478a771f35c05022f9feabcca01c”;
const TMDB_BASE    = “https://api.themoviedb.org/3”;
const TMDB_IMG     = “https://image.tmdb.org/t/p/w500”;

// ─── Convert TMDB item → Stremio meta ────────────────────────────────────────

async function tmdbToStremio(item, type, baseUrl) {
const isMovie     = type === “movie”;
const stremioType = isMovie ? “movie” : “series”;
const title       = isMovie ? item.title : item.name;
const releaseDate = isMovie ? item.release_date : item.first_air_date;
const year        = releaseDate ? releaseDate.substring(0, 4) : null;
const id          = item.imdb_id || `tmdb:${item.id}`;
const tmdbPoster  = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null;

// Check if AI poster already exists in B2
let poster = tmdbPoster; // default: always show TMDB immediately
if (title) {
const key = posterKey(title, year);
try {
const exists = await existsInB2(key);
if (exists) {
poster = `${B2_PUBLIC}/${key}`;
console.log(`[Catalog] AI poster ready for "${title}" → B2`);
}
} catch {
// B2 check failed — fall through to TMDB poster
}

```
// Fire-and-forget: generate AI poster in background
// Next time this item appears in catalog, B2 check above will hit
triggerPoster(
  title,
  year,
  stremioType,
  (item.genre_ids || []).join(","),
  item.overview || ""
);
```

}

return {
id,
type:        stremioType,
name:        title,
poster,
background:  item.backdrop_path
? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}`
: null,
description: item.overview,
releaseInfo:  year,
imdbRating:  item.vote_average ? item.vote_average.toFixed(1) : null,
genres:      [],
_tmdbId:     item.id
};
}

// ─── Fetch catalog from TMDB ──────────────────────────────────────────────────

async function fetchCatalog(catalogId, type, skip = 0, baseUrl) {
const page     = Math.floor(skip / 20) + 1;
const tmdbType = type === “series” ? “tv” : “movie”;

let endpoint;
if (catalogId.includes(“trending”)) {
endpoint = `${TMDB_BASE}/trending/${tmdbType}/week?api_key=${TMDB_API_KEY}&page=${page}`;
} else {
endpoint = `${TMDB_BASE}/${tmdbType}/popular?api_key=${TMDB_API_KEY}&page=${page}`;
}

console.log(`[Catalog] Fetching: ${endpoint}`);
const res  = await fetch(endpoint);
const data = await res.json();

if (!data.results) return [];

// Run B2 checks in parallel for all items
const metas = await Promise.all(
data.results
.filter(item => item.poster_path)
.map(item => tmdbToStremio(item, tmdbType, baseUrl))
);

return metas;
}

module.exports = { fetchCatalog, tmdbToStremio };