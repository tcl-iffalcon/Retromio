// ============================================================
//  Nuvio Multi-Source Provider — v2
//  VidSrc.to · VixSrc · 2Embed · VidLink
//  Embed URL'leri direkt döndürür (WebView ile oynatılır)
// ============================================================

function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Retromio] Fetching ' + mediaType + ' tmdb:' + tmdbId);

  var streams = [];

  if (mediaType === 'movie') {
    streams = [
      {
        name: 'VidSrc',
        title: 'VidSrc · Auto',
        url: 'https://vidsrc.to/embed/movie/' + tmdbId,
        quality: 'auto',
        headers: { 'Referer': 'https://vidsrc.to' }
      },
      {
        name: 'VixSrc',
        title: 'VixSrc · Auto',
        url: 'https://vixsrc.to/embed/movie/' + tmdbId,
        quality: 'auto',
        headers: { 'Referer': 'https://vixsrc.to' }
      },
      {
        name: '2Embed',
        title: '2Embed · HD',
        url: 'https://www.2embed.stream/embed/movie/' + tmdbId,
        quality: '1080p',
        headers: { 'Referer': 'https://www.2embed.stream' }
      },
      {
        name: 'VidLink',
        title: 'VidLink · Auto',
        url: 'https://vidlink.pro/movie/' + tmdbId + '?autoplay=true',
        quality: 'auto',
        headers: { 'Referer': 'https://vidlink.pro' }
      }
    ];
  } else if (mediaType === 'tv') {
    var s = season || 1;
    var e = episode || 1;
    streams = [
      {
        name: 'VidSrc',
        title: 'VidSrc · S' + s + 'E' + e,
        url: 'https://vidsrc.to/embed/tv/' + tmdbId + '/' + s + '/' + e,
        quality: 'auto',
        headers: { 'Referer': 'https://vidsrc.to' }
      },
      {
        name: 'VixSrc',
        title: 'VixSrc · S' + s + 'E' + e,
        url: 'https://vixsrc.to/embed/tv/' + tmdbId + '?s=' + s + '&e=' + e,
        quality: 'auto',
        headers: { 'Referer': 'https://vixsrc.to' }
      },
      {
        name: '2Embed',
        title: '2Embed · S' + s + 'E' + e,
        url: 'https://www.2embed.stream/embed/tv/' + tmdbId + '/' + s + '/' + e,
        quality: '1080p',
        headers: { 'Referer': 'https://www.2embed.stream' }
      },
      {
        name: 'VidLink',
        title: 'VidLink · S' + s + 'E' + e,
        url: 'https://vidlink.pro/tv/' + tmdbId + '/' + s + '/' + e + '?autoplay=true',
        quality: 'auto',
        headers: { 'Referer': 'https://vidlink.pro' }
      }
    ];
  }

  console.log('[Retromio] ' + streams.length + ' stream hazır');
  return Promise.resolve(streams);
}

module.exports = { getStreams };
