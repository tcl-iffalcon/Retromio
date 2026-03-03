// ============================================================
//  Retromio — v5 minimal test
//  Sadece VixSrc, VixSrc kaynak kodundan birebir uyarlandı
// ============================================================
"use strict";

var __async = function(__this, __arguments, generator) {
  return new Promise(function(resolve, reject) {
    var fulfilled = function(value) {
      try { step(generator.next(value)); } catch(e) { reject(e); }
    };
    var rejected = function(value) {
      try { step(generator.throw(value)); } catch(e) { reject(e); }
    };
    var step = function(x) {
      return x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    };
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var BASE_URL = "https://vixsrc.to";
var USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function makeRequest(url, options) {
  options = options || {};
  var headers = Object.assign({
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Connection": "keep-alive"
  }, options.headers || {});

  return fetch(url, { method: "GET", headers: headers })
    .then(function(response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response;
    });
}

function extractStreamFromPage(contentType, contentId, seasonNum, episodeNum) {
  return __async(this, null, function*() {
    var vixsrcUrl;
    if (contentType === "movie") {
      vixsrcUrl = BASE_URL + "/movie/" + contentId;
    } else {
      vixsrcUrl = BASE_URL + "/tv/" + contentId + "/" + seasonNum + "/" + episodeNum;
    }

    console.log("[Retromio] Fetching: " + vixsrcUrl);
    var response = yield makeRequest(vixsrcUrl);
    var html = yield response.text();
    console.log("[Retromio] HTML length: " + html.length);

    var masterPlaylistUrl = null;

    if (html.includes("masterPlaylist")) {
      var urlMatch     = html.match(/url:\s*['"]([^'"]+)['"]/);
      var tokenMatch   = html.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/);
      var expiresMatch = html.match(/['"]?expires['"]?\s*:\s*['"]([^'"]+)['"]/);

      if (urlMatch && tokenMatch && expiresMatch) {
        var base    = urlMatch[1];
        var token   = tokenMatch[1];
        var expires = expiresMatch[1];
        masterPlaylistUrl = base.includes("?b=1")
          ? base + "&token=" + token + "&expires=" + expires + "&h=1&lang=en"
          : base + "?token=" + token + "&expires=" + expires + "&h=1&lang=en";
        console.log("[Retromio] masterPlaylist URL bulundu");
      }
    }

    if (!masterPlaylistUrl) {
      var m3u8Match = html.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/);
      if (m3u8Match) masterPlaylistUrl = m3u8Match[1];
    }

    if (!masterPlaylistUrl) {
      console.log("[Retromio] Stream bulunamadı");
      return null;
    }

    return masterPlaylistUrl;
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function*() {
    console.log("[Retromio] getStreams: " + mediaType + " " + tmdbId);
    var s = season || 1;
    var e = episode || 1;

    try {
      var url = yield extractStreamFromPage(mediaType, tmdbId, s, e);
      if (!url) return [];

      return [{
        name: "Retromio",
        title: "VixSrc · Auto",
        url: url,
        quality: "Auto",
        type: "direct",
        headers: {
          "Referer": BASE_URL,
          "User-Agent": USER_AGENT
        }
      }];
    } catch(err) {
      console.error("[Retromio] Hata: " + err.message);
      return [];
    }
  });
}

module.exports = { getStreams };
