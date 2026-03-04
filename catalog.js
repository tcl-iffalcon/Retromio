const fetch = require("node-fetch");
const { triggerPoster, posterUrl, existsInB2 } = require("./poster");

const TMDB_API_KEY = process.env.TMDB_API_KEY || "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE    = "https://api.themoviedb.org/3";
const TMDB_IMG     = "https://image.tmdb.org/t/p/w500";

// ─── Convert TMDB item → Stremio meta ────────────────────────────────────────
async function tmdbToStremio(item, type, baseUrl) {
  const isMovie     = type === "movie";
  const stremioType = isMovie ? "movie" : "series";
  const title       = isMovie ? item.title : item.name;
  const releaseDate = isMovie ? item.release_date : item.first_air_date;
  const year        = releaseDate ? releaseDate.substring(0, 4) : null;
  const id          = item.imdb_id || `tmdb:${item.id}`;

  const tmdbFallback = item.poster_path
    ? `${TMDB_IMG}${item.poster_path}`
    : null;

  // /ai-poster proxy'sini kullan — cache varsa anında, yoksa üretip döndürür
  const poster = baseUrl
    ? `${baseUrl}/ai-poster?` + new URLSearchParams({
        title:    title,
        year:     year || "",
        type:     stremioType,
        genres:   (item.genre_ids || []).join(","),
        overview: item.overview || "",
        fallback: tmdbFallback || ""
      }).toString()
    : tmdbFallback;

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
      .map(item => tmdbToStremio(item, tmdbType, baseUrl))
  );
}

module.exports = { fetchCatalog, tmdbToStremio };
