// ============================================================
//  Retromio Multi-Source Provider — v4
//  VixSrc · VidSrc · 2Embed · VidLink
//  VixSrc kaynak kodundan öğrenilen gerçek extraction mantığı
// ============================================================

var USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var DEFAULT_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Connection": "keep-alive"
};

// ── HTML'den m3u8 URL çıkar (VixSrc mantığı) ───────────────
function extractM3U8FromHtml(html, baseReferer) {
  // 1. window.masterPlaylist token yöntemi
  if (html.includes("window.masterPlaylist") || html.includes("masterPlaylist")) {
    var urlMatch    = html.match(/url:\s*['"]([^'"]+)['"]/);
    var tokenMatch  = html.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/);
    var expiresMatch= html.match(/['"]?expires['"]?\s*:\s*['"]([^'"]+)['"]/);
    if (urlMatch && tokenMatch && expiresMatch) {
      var base    = urlMatch[1];
      var token   = tokenMatch[1];
      var expires = expiresMatch[1];
      var m3u8 = base.includes("?b=1")
        ? base + "&token=" + token + "&expires=" + expires + "&h=1&lang=en"
        : base + "?token=" + token + "&expires=" + expires + "&h=1&lang=en";
      console.log("[Retromio] masterPlaylist m3u8 bulundu");
      return m3u8;
    }
  }

  // 2. Direkt .m3u8 linki
  var directMatch = html.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/);
  if (directMatch) {
    console.log("[Retromio] Direkt m3u8 bulundu");
    return directMatch[1];
  }

  // 3. Script içinde stream URL
  var scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g) || [];
  for (var i = 0; i < scripts.length; i++) {
    var streamMatch = scripts[i].match(/(https?:\/\/[^'"\s]+(?:\.m3u8|playlist)[^'"\s]*)/);
    if (streamMatch) {
      console.log("[Retromio] Script içinde stream bulundu");
      return streamMatch[1];
    }
  }

  return null;
}

// ── VixSrc ─────────────────────────────────────────────────
function fetchVixSrc(tmdbId, mediaType, season, episode) {
  var url = mediaType === "tv"
    ? "https://vixsrc.to/tv/" + tmdbId + "/" + season + "/" + episode
    : "https://vixsrc.to/movie/" + tmdbId;

  return fetch(url, { headers: DEFAULT_HEADERS })
    .then(function(r) { return r.text(); })
    .then(function(html) {
      var m3u8 = extractM3U8FromHtml(html, "https://vixsrc.to");
      if (!m3u8) return [];
      return [{
        name: "VixSrc",
        title: "VixSrc · Auto",
        url: m3u8,
        quality: "Auto",
        type: "direct",
        headers: {
          "Referer": "https://vixsrc.to",
          "User-Agent": USER_AGENT
        }
      }];
    })
    .catch(function(e) {
      console.error("[Retromio] VixSrc hata:", e.message);
      return [];
    });
}

// ── VidSrc ─────────────────────────────────────────────────
function fetchVidSrc(tmdbId, mediaType, season, episode) {
  var url = mediaType === "tv"
    ? "https://vidsrc.to/embed/tv/" + tmdbId + "/" + season + "/" + episode
    : "https://vidsrc.to/embed/movie/" + tmdbId;

  return fetch(url, { headers: DEFAULT_HEADERS })
    .then(function(r) { return r.text(); })
    .then(function(html) {
      var m3u8 = extractM3U8FromHtml(html, "https://vidsrc.to");
      if (!m3u8) return [];
      return [{
        name: "VidSrc",
        title: "VidSrc · Auto",
        url: m3u8,
        quality: "Auto",
        type: "direct",
        headers: {
          "Referer": "https://vidsrc.to",
          "User-Agent": USER_AGENT
        }
      }];
    })
    .catch(function(e) {
      console.error("[Retromio] VidSrc hata:", e.message);
      return [];
    });
}

// ── 2Embed ─────────────────────────────────────────────────
function fetch2Embed(tmdbId, mediaType, season, episode) {
  var url = mediaType === "tv"
    ? "https://www.2embed.stream/embed/tv/" + tmdbId + "/" + season + "/" + episode
    : "https://www.2embed.stream/embed/movie/" + tmdbId;

  return fetch(url, { headers: DEFAULT_HEADERS })
    .then(function(r) { return r.text(); })
    .then(function(html) {
      var m3u8 = extractM3U8FromHtml(html, "https://www.2embed.stream");
      if (!m3u8) return [];
      return [{
        name: "2Embed",
        title: "2Embed · HD",
        url: m3u8,
        quality: "1080p",
        type: "direct",
        headers: {
          "Referer": "https://www.2embed.stream",
          "User-Agent": USER_AGENT
        }
      }];
    })
    .catch(function(e) {
      console.error("[Retromio] 2Embed hata:", e.message);
      return [];
    });
}

// ── VidLink ────────────────────────────────────────────────
function fetchVidLink(tmdbId, mediaType, season, episode) {
  var url = mediaType === "tv"
    ? "https://vidlink.pro/tv/" + tmdbId + "/" + season + "/" + episode
    : "https://vidlink.pro/movie/" + tmdbId;

  return fetch(url, { headers: DEFAULT_HEADERS })
    .then(function(r) { return r.text(); })
    .then(function(html) {
      var m3u8 = extractM3U8FromHtml(html, "https://vidlink.pro");
      if (!m3u8) return [];
      return [{
        name: "VidLink",
        title: "VidLink · Auto",
        url: m3u8,
        quality: "Auto",
        type: "direct",
        headers: {
          "Referer": "https://vidlink.pro",
          "User-Agent": USER_AGENT
        }
      }];
    })
    .catch(function(e) {
      console.error("[Retromio] VidLink hata:", e.message);
      return [];
    });
}

// ── Ana fonksiyon ───────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  var s = season || 1;
  var e = episode || 1;
  console.log("[Retromio] Fetching " + mediaType + " tmdb:" + tmdbId);

  return Promise.all([
    fetchVixSrc(tmdbId, mediaType, s, e),
    fetchVidSrc(tmdbId, mediaType, s, e),
    fetch2Embed(tmdbId, mediaType, s, e),
    fetchVidLink(tmdbId, mediaType, s, e)
  ]).then(function(results) {
    var all = [];
    results.forEach(function(r) {
      if (r && r.length) all = all.concat(r);
    });
    console.log("[Retromio] Toplam stream: " + all.length);
    return all;
  }).catch(function() {
    return [];
  });
}

module.exports = { getStreams };
