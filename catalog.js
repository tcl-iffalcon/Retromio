const fetch = require("node-fetch");
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

function getAiPosterUrl(baseUrl, item, type) {
  const isMovie = type === "movie";
  const title = isMovie ? item.title : item.name;
  const releaseDate = isMovie ? item.release_date : item.first_air_date;
  const year = releaseDate ? releaseDate.substring(0, 4) : "";
  const params = new URLSearchParams({
    title: title || "",
    year: year || "",
    type: isMovie ? "movie" : "series",
    fallback: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : ""
  });
  return `${baseUrl}/ai-poster?${params.toString()}`;
}

function tmdbToStremio(item, type, baseUrl) {
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
    poster: getAiPosterUrl(baseUrl, item, type),
    background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
    description: item.overview,
    releaseInfo: year,
    imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
    genres: [],
    _tmdbId: item.id
  };
}

async function fetchCatalog(catalogId, type, skip = 0, baseUrl) {
  const RESULTS_PER_PAGE = 30;

  // TMDB returns 20 per page — 2 pages gives us ~40, slice to 30
  const tmdbPage = Math.floor(skip / RESULTS_PER_PAGE) * 2 + 1;
  const tmdbType = type === "series" ? "tv" : "movie";
  const isTrending = catalogId.includes("trending");

  const pagePromises = [tmdbPage, tmdbPage + 1].map(p => {
    const endpoint = isTrending
      ? `${TMDB_BASE}/trending/${tmdbType}/week?api_key=${TMDB_API_KEY}&page=${p}`
      : `${TMDB_BASE}/${tmdbType}/popular?api_key=${TMDB_API_KEY}&page=${p}`;
    return fetch(endpoint).then(r => r.json());
  });

  const pages = await Promise.all(pagePromises);
  const allResults = pages.flatMap(data => data.results || []);

  const metas = allResults
    .filter(item => item.poster_path)
    .slice(0, RESULTS_PER_PAGE)
    .map(item => tmdbToStremio(item, tmdbType, baseUrl));

  console.log(`[Catalog] ${catalogId} skip=${skip} → ${metas.length} results`);

  // NOTE: prewarm removed — it was firing all poster requests at once
  // and causing Pollinations 530 rate limit errors.
  // Posters are now generated on-demand when Stremio renders each item.

  return metas;
}

module.exports = { fetchCatalog, tmdbToStremio };
