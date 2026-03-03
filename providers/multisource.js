// ============================================================
//  Nuvio Multi-Source Provider
//  Kaynaklar: VidSrc, VixSrc, CineHDPlus, 4KHDHub
//  Format: Promise chain (Hermes uyumlu, async/await YOK)
// ============================================================

var BASE_URLS = {
  vidsrc:    "https://vidsrc.to/embed",
  vixsrc:    "https://vixsrc.to/embed",
  cinehdplus:"https://cinehdplus.com/embed",
  k4hdhub:   "https://4khdHub.com/embed"
};

// ── Yardımcı: m3u8/mp4 linkini kaynak sayfasından çek ──────
function fetchStreamUrl(embedUrl, referer) {
  return fetch(embedUrl, {
    headers: {
      "Referer":    referer || embedUrl,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  })
  .then(function(r) { return r.text(); })
  .then(function(html) {
    // m3u8 veya mp4 URL'sini bul
    var m3u8 = html.match(/https?:\/\/[^"' \n]+\.m3u8[^"' \n]*/);
    var mp4   = html.match(/https?:\/\/[^"' \n]+\.mp4[^"' \n]*/);
    return (m3u8 && m3u8[0]) || (mp4 && mp4[0]) || null;
  })
  .catch(function() { return null; });
}

// ── VidSrc ─────────────────────────────────────────────────
function getVidSrcStreams(tmdbId, mediaType, season, episode) {
  var path = mediaType === "tv"
    ? "/tv/" + tmdbId + "/" + season + "-" + episode
    : "/movie/" + tmdbId;
  var embedUrl = BASE_URLS.vidsrc + path;

  return fetchStreamUrl(embedUrl, "https://vidsrc.to")
    .then(function(url) {
      if (!url) return [];
      return [{
        name:    "VidSrc",
        title:   "VidSrc | Auto",
        url:     url,
        quality: "auto",
        headers: { "Referer": "https://vidsrc.to" }
      }];
    })
    .catch(function() { return []; });
}

// ── VixSrc ─────────────────────────────────────────────────
function getVixSrcStreams(tmdbId, mediaType, season, episode) {
  var path = mediaType === "tv"
    ? "/tv/" + tmdbId + "?s=" + season + "&e=" + episode
    : "/movie/" + tmdbId;
  var embedUrl = BASE_URLS.vixsrc + path;

  return fetchStreamUrl(embedUrl, "https://vixsrc.to")
    .then(function(url) {
      if (!url) return [];
      return [{
        name:    "VixSrc",
        title:   "VixSrc | Auto",
        url:     url,
        quality: "auto",
        headers: { "Referer": "https://vixsrc.to" }
      }];
    })
    .catch(function() { return []; });
}

// ── CineHDPlus ─────────────────────────────────────────────
function getCineHDPlusStreams(tmdbId, mediaType, season, episode) {
  var path = mediaType === "tv"
    ? "/series/" + tmdbId + "/" + season + "/" + episode
    : "/film/" + tmdbId;
  var embedUrl = BASE_URLS.cinehdplus + path;

  return fetchStreamUrl(embedUrl, "https://cinehdplus.com")
    .then(function(url) {
      if (!url) return [];
      return [{
        name:    "CineHDPlus",
        title:   "CineHDPlus | HD",
        url:     url,
        quality: "1080p",
        headers: { "Referer": "https://cinehdplus.com" }
      }];
    })
    .catch(function() { return []; });
}

// ── 4KHDHub ────────────────────────────────────────────────
function get4KHDHubStreams(tmdbId, mediaType, season, episode) {
  var path = mediaType === "tv"
    ? "/tv?tmdb=" + tmdbId + "&season=" + season + "&episode=" + episode
    : "/movie?tmdb=" + tmdbId;
  var embedUrl = BASE_URLS.k4hdhub + path;

  return fetchStreamUrl(embedUrl, "https://4khdHub.com")
    .then(function(url) {
      if (!url) return [];
      return [{
        name:    "4KHDHub",
        title:   "4KHDHub | 4K",
        url:     url,
        quality: "4K",
        headers: { "Referer": "https://4khdHub.com" }
      }];
    })
    .catch(function() { return []; });
}

// ── Ana fonksiyon: tüm kaynakları paralel çalıştır ─────────
function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[MultiSource] Fetching " + mediaType + " tmdb:" + tmdbId);

  var tasks = [
    getVidSrcStreams(tmdbId, mediaType, season, episode),
    getVixSrcStreams(tmdbId, mediaType, season, episode),
    getCineHDPlusStreams(tmdbId, mediaType, season, episode),
    get4KHDHubStreams(tmdbId, mediaType, season, episode)
  ];

  return Promise.all(tasks)
    .then(function(results) {
      // Tüm sonuçları tek array'de topla
      var streams = [];
      results.forEach(function(r) {
        if (r && r.length) streams = streams.concat(r);
      });
      console.log("[MultiSource] Toplam stream: " + streams.length);
      return streams;
    })
    .catch(function(err) {
      console.error("[MultiSource] Hata:", err.message);
      return [];
    });
}

module.exports = { getStreams };
