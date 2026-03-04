const fetch = require("node-fetch");
const { triggerPoster, posterUrl, existsInB2 } = require("./poster");

const TMDB_API_KEY = process.env.TMDB_API_KEY || "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE    = "https://api.themoviedb.org/3";
const TMDB_IMG     = "https://image.tmdb.org/t/p/w500";

// ─── Build poster URL ─────────────────────────────────────────────────────────
// Returns direct Cloudinary URL if cached, otherwise TMDB fallback.

async function getPosterUrl(item, type) {
  const isMovie     = type === "movie";
  const title       = isMovie ? item.title : item.name;
  const releaseDate = isMovie ? item.release_date : item.first_air_date;
  const year        = releaseDate ? releaseDate.substring(0, 4) : "";
  const tmdbFallback = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null;

  try {
    const exists = await existsInB2(title, year);
    if (exists) return posterUrl(title, year);
  } catch {}

  return tmdbFallback;
}

// ─── Convert TMDB item → Stremio meta ────────────────────────────────────────

async function tmdbToStremio(item, type) {
  const isMovie     = type === "movie";
  const stremioType = isMovie ? "movie" : "series";
  const title       = isMovie ? item.title : item.name;
  const releaseDate = isMovie ? item.release_date : item.first_air_date;
  const year        = releaseDate ? releaseDate.substring(0, 4) : null;
  const id          = item.imdb_id || `tmdb:${item.id}`;

  // Fire-and-forget background generation
  triggerPoster(
    title,
    year,
    isMovie ? "movie" : "series",
    (item.genre_ids || []).join(","),
    item.overview || ""
  );

  const poster = await getPosterUrl(item, isMovie ? "movie" : "tv");

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
  const tmdbType = type === "series" ? "tv" : "movie";

  let endpoint;
  if (catalogId.includes("trending")) {
    endpoint = `${TMDB_BASE}/trending/${tmdbType}/week?api_key=${TMDB_API_KEY}&page=${page}`;
  } else {
    endpoint = `${TMDB_BASE}/${tmdbType}/popular?api_key=${TMDB_API_KEY}&page=${page}`;
  }

  console.log(`[Catalog] Fetching: ${endpoint}`);
  const res  = await fetch(endpoint);
  const data = await res.json();

  if (!data.results) return [];

  return Promise.all(
    data.results
      .filter(item => item.poster_path)
      .map(item => tmdbToStremio(item, tmdbType))
  );
}

module.exports = { fetchCatalog, tmdbToStremio };
