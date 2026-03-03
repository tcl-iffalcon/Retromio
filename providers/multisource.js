/**
 * Retromio Provider for Nuvio TV
 * Vidlink + VixSrc — paralel, saf Promise chain
 */

// ── Vidlink ─────────────────────────────────────────────────
var ENC_API     = "https://enc-dec.app/api/enc-vidlink";
var VIDLINK_API = "https://vidlink.pro/api/b";
var VIDLINK_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Referer": "https://vidlink.pro/",
  "Origin": "https://vidlink.pro"
};

function fetchVidlink(tmdbId, mediaType, season, episode) {
  return fetch(ENC_API + "?text=" + tmdbId, { headers: VIDLINK_HEADERS })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data || !data.result) throw new Error("Encryption failed");
      var url = mediaType === "tv" && season && episode
        ? VIDLINK_API + "/tv/" + data.result + "/" + season + "/" + episode
        : VIDLINK_API + "/movie/" + data.result;
      return fetch(url, { headers: VIDLINK_HEADERS });
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var streams = [];
      if (data.stream && data.stream.qualities) {
        Object.keys(data.stream.qualities).forEach(function(key) {
          var q = data.stream.qualities[key];
          if (q.url) streams.push({
            name: "Retromio",
            title: "Vidlink · " + key,
            url: q.url,
            quality: key,
            headers: VIDLINK_HEADERS
          });
        });
      }
      if (streams.length === 0 && data.stream && data.stream.playlist) {
        streams.push({
          name: "Retromio",
          title: "Vidlink · Auto",
          url: data.stream.playlist,
          quality: "Auto",
          headers: VIDLINK_HEADERS
        });
      }
      console.log("[Retromio] Vidlink streams:", streams.length);
      return streams;
    })
    .catch(function(err) {
      console.error("[Retromio] Vidlink hata:", err.message);
      return [];
    });
}

// ── VixSrc ──────────────────────────────────────────────────
var VIXSRC_BASE = "https://vixsrc.to";
var VIXSRC_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Connection": "keep-alive"
};

function fetchVixsrc(tmdbId, mediaType, season, episode) {
  var url = mediaType === "tv"
    ? VIXSRC_BASE + "/tv/" + tmdbId + "/" + season + "/" + episode
    : VIXSRC_BASE + "/movie/" + tmdbId;

  return fetch(url, { headers: VIXSRC_HEADERS })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var masterUrl = null;

      if (html.includes("masterPlaylist")) {
        var urlMatch     = html.match(/url:\s*['"]([^'"]+)['"]/);
        var tokenMatch   = html.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/);
        var expiresMatch = html.match(/['"]?expires['"]?\s*:\s*['"]([^'"]+)['"]/);
        if (urlMatch && tokenMatch && expiresMatch) {
          var base = urlMatch[1];
          var token = tokenMatch[1];
          var expires = expiresMatch[1];
          masterUrl = base.includes("?b=1")
            ? base + "&token=" + token + "&expires=" + expires + "&h=1&lang=en"
            : base + "?token=" + token + "&expires=" + expires + "&h=1&lang=en";
        }
      }

      if (!masterUrl) {
        var m3u8 = html.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/);
        if (m3u8) masterUrl = m3u8[1];
      }

      if (!masterUrl) {
        console.log("[Retromio] VixSrc stream bulunamadı");
        return [];
      }

      console.log("[Retromio] VixSrc stream bulundu");
      return [{
        name: "Retromio",
        title: "VixSrc · Auto",
        url: masterUrl,
        quality: "Auto",
        type: "direct",
        headers: { "Referer": VIXSRC_BASE, "User-Agent": VIXSRC_HEADERS["User-Agent"] }
      }];
    })
    .catch(function(err) {
      console.error("[Retromio] VixSrc hata:", err.message);
      return [];
    });
}

// ── Ana fonksiyon ────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[Retromio] Fetching:", mediaType, tmdbId, season, episode);
  var s = season || 1;
  var e = episode || 1;

  return Promise.all([
    fetchVidlink(tmdbId, mediaType, s, e),
    fetchVixsrc(tmdbId, mediaType, s, e)
  ]).then(function(results) {
    var all = results[0].concat(results[1]);
    console.log("[Retromio] Toplam stream:", all.length);
    return all;
  });
}

module.exports = { getStreams };
