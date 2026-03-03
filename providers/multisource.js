// ============================================================
//  Retromio Multi-Source Provider — v3
//  VidSrc API · VixSrc API · 2Embed · VidLink
//  Promise-only (Hermes uyumlu, async/await YOK)
// ============================================================

var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// ── VidSrc — JSON API ───────────────────────────────────────
function fetchVidSrc(tmdbId, mediaType, season, episode) {
  var url = mediaType === 'tv'
    ? 'https://vidsrc.to/api/3/tv/' + tmdbId + '/' + season + '/' + episode
    : 'https://vidsrc.to/api/3/movie/' + tmdbId;

  return fetch(url, { headers: HEADERS })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var sources = (data && data.sources) ? data.sources : [];
      return sources.map(function(s) {
        return {
          name: 'VidSrc',
          title: 'VidSrc · ' + (s.quality || 'Auto'),
          url: s.url,
          quality: s.quality || 'auto',
          headers: { 'Referer': 'https://vidsrc.to' }
        };
      });
    })
    .catch(function(e) {
      console.error('[Retromio] VidSrc hata:', e.message);
      return [];
    });
}

// ── VixSrc — JSON API ───────────────────────────────────────
function fetchVixSrc(tmdbId, mediaType, season, episode) {
  var url = mediaType === 'tv'
    ? 'https://vixsrc.to/api/tv/' + tmdbId + '?season=' + season + '&episode=' + episode
    : 'https://vixsrc.to/api/movie/' + tmdbId;

  return fetch(url, { headers: HEADERS })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var sources = (data && data.sources) ? data.sources : [];
      return sources.map(function(s) {
        return {
          name: 'VixSrc',
          title: 'VixSrc · ' + (s.quality || 'Auto'),
          url: s.url,
          quality: s.quality || 'auto',
          headers: { 'Referer': 'https://vixsrc.to' }
        };
      });
    })
    .catch(function(e) {
      console.error('[Retromio] VixSrc hata:', e.message);
      return [];
    });
}

// ── 2Embed — embed URL (WebView fallback) ───────────────────
function fetch2Embed(tmdbId, mediaType, season, episode) {
  var url = mediaType === 'tv'
    ? 'https://www.2embed.stream/embed/tv/' + tmdbId + '/' + season + '/' + episode
    : 'https://www.2embed.stream/embed/movie/' + tmdbId;

  return Promise.resolve([{
    name: '2Embed',
    title: '2Embed · HD',
    url: url,
    quality: '1080p',
    behaviorHints: { notWebReady: true },
    headers: { 'Referer': 'https://www.2embed.stream' }
  }]);
}

// ── VidLink — embed URL (WebView fallback) ──────────────────
function fetchVidLink(tmdbId, mediaType, season, episode) {
  var url = mediaType === 'tv'
    ? 'https://vidlink.pro/tv/' + tmdbId + '/' + season + '/' + episode
    : 'https://vidlink.pro/movie/' + tmdbId;

  return Promise.resolve([{
    name: 'VidLink',
    title: 'VidLink · Auto',
    url: url,
    quality: 'auto',
    behaviorHints: { notWebReady: true },
    headers: { 'Referer': 'https://vidlink.pro' }
  }]);
}

// ── Ana fonksiyon ───────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Retromio] Fetching ' + mediaType + ' tmdb:' + tmdbId);

  var s = season || 1;
  var e = episode || 1;

  return Promise.all([
    fetchVidSrc(tmdbId, mediaType, s, e),
    fetchVixSrc(tmdbId, mediaType, s, e),
    fetch2Embed(tmdbId, mediaType, s, e),
    fetchVidLink(tmdbId, mediaType, s, e)
  ]).then(function(results) {
    var all = [];
    results.forEach(function(r) {
      if (r && r.length) all = all.concat(r);
    });
    console.log('[Retromio] Toplam stream: ' + all.length);
    return all;
  }).catch(function() {
    return [];
  });
}

module.exports = { getStreams };
