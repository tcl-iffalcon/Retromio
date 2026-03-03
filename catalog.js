const fetch = require("node-fetch");

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

// Poster URL selector: original, retro filter, or AI-generated
function getPosterUrl(baseUrl, tmdbPath, config, title, year, type, genres) {
  if (!tmdbPath) return null;
  const original = `${TMDB_IMG}${tmdbPath}`;

  if (config.ai) {
    const params = new URLSearchParams({
      title: title || "",
      year: year || "",
      type: type || "movie",
      genres: (genres || []).join(","),
      style: config.aiStyle || "pulp",
      fallback: original
    });
    return `${baseUrl}/ai-poster?${params.toString()}`;
  }

  if (config.retro) {
    return `${baseUrl}/poster?img=${encodeURIComponent(original)}`;
  }

  return original;
}

function tmdbToStremio(item, type, baseUrl, config) {
  // config can be boolean (legacy retro) or object {retro, ai, aiStyle}
  if (typeof config === "boolean") config = { retro: config, ai: false, aiStyle: "pulp" };

  const isMovie = type === "movie";
  const title = isMovie ? item.title : item.name;
  const releaseDate = isMovie ? item.release_date : item.first_air_date;
  const year = releaseDate ? releaseDate.substring(0, 4) : null;
  const imdbId = item.imdb_id || null;
  const id = imdbId || `tmdb:${item.id}`;

  return {
    id,
    type: isMovie ? "movie" : "series",
    name: title,
    poster: getPosterUrl(baseUrl, item.poster_path, config, title, year, isMovie ? "movie" : "series", []),
    background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
    description: item.overview,
    releaseInfo: year,
    imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
    genres: [],
    _tmdbId: item.id
  };
}

async function fetchCatalog(catalogId, type, skip = 0, baseUrl, config) {
  const page = Math.floor(skip / 20) + 1;
  let endpoint;

  if (catalogId.includes("trending")) {
    endpoint = `${TMDB_BASE}/trending/${type === "series" ? "tv" : "movie"}/week?api_key=${TMDB_API_KEY}&page=${page}`;
  } else {
    endpoint = `${TMDB_BASE}/${type === "series" ? "tv" : "movie"}/popular?api_key=${TMDB_API_KEY}&page=${page}`;
  }

  console.log(`[Catalog] Fetching: ${endpoint}`);
  const res = await fetch(endpoint);
  const data = await res.json();

  if (!data.results) return [];

  const metas = data.results
    .filter(item => item.poster_path)
    .map(item => tmdbToStremio(item, type === "series" ? "tv" : "movie", baseUrl, config));

  return metas;
}

module.exports = { fetchCatalog, tmdbToStremio, getPosterUrl };
