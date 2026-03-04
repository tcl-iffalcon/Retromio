# 🎬 Retromio — Stremio Addon

AI-generated retro cinema posters for every movie & series.  
Streams via **Vidlink** & **NetMirror** in up to **1080p**.

---

## Proje Yapısı

```
retromio/
├── server.js           # Express sunucusu, tüm endpointler
├── catalog.js          # TMDB katalog + AI poster trigger
├── meta.js             # Film/dizi detayları
├── stream.js           # Stream çözümleyici (1080p öncelikli)
├── poster.js           # HuggingFace AI üretimi + B2 depolama
├── manifest.json       # Stremio addon manifest
├── package.json
├── render.yaml         # Render.com deployment config
└── providers/
    ├── vidlink.js      # Vidlink stream provider
    └── netmirror.js    # NetMirror stream provider
```

---

## Akış Mimarisi

```
Stremio
  │
  ├─ /catalog  → TMDB trending/popular
  │               └─ triggerPoster() → [background]
  │                                      HuggingFace FLUX.1-schnell
  │                                      → Backblaze B2
  │
  ├─ /meta     → TMDB detayları
  │               └─ poster: /ai-poster?title=...
  │
  ├─ /ai-poster → B2 cache check
  │               → generate if needed
  │               → redirect to B2 URL
  │
  └─ /stream   → Vidlink + NetMirror (parallel)
                  └─ 1080p öncelikli filtre
```

---

## Kurulum

### 1. Gerekli Env Variables

| Değişken | Açıklama |
|---|---|
| `HF_TOKEN` | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) |
| `B2_KEY_ID` | Backblaze B2 Application Key ID |
| `B2_APP_KEY` | Backblaze B2 Application Key |
| `B2_BUCKET` | Bucket adı (default: `retromio-posters`) |
| `B2_REGION` | Bucket bölgesi (default: `us-east-005`) |
| `TMDB_API_KEY` | (isteğe bağlı) Kendi TMDB API anahtarınız |
| `POSTER_VERSION` | Cache buster (default: `v14`) |

### 2. Backblaze B2 Bucket Ayarları

1. Backblaze'de bucket oluşturun: `retromio-posters`
2. **Public** erişim açın (Files: Public)
3. Application Key oluştururken bucket'a **Read + Write** izni verin
4. `B2_REGION` değeri bucket URL'inden bulunur: `s3.us-east-005.backblazeb2.com`

### 3. Yerel Geliştirme

```bash
npm install

# .env dosyası oluşturun
echo "HF_TOKEN=hf_xxx" >> .env
echo "B2_KEY_ID=xxx" >> .env
echo "B2_APP_KEY=xxx" >> .env

npm run dev
```

Açılacak adresler:
- Configure: http://localhost:3000/configure
- Manifest:  http://localhost:3000/manifest.json
- Poster status: http://localhost:3000/poster-status

### 4. Render.com Deploy

1. GitHub'a push edin
2. Render → New Web Service → repo seçin
3. `render.yaml` otomatik algılanır
4. Environment Variables bölümünden `HF_TOKEN`, `B2_KEY_ID`, `B2_APP_KEY` ekleyin

---

## Poster Sistemi

- **İlk istek**: HuggingFace FLUX.1-schnell ile 512×768 px görüntü üretilir
- **Cache**: B2'ye yüklendikten sonra anında servis edilir
- **Versiyon**: `POSTER_VERSION` değişkenini değiştirerek tüm posterleri yeniden üretebilirsiniz
- **Eşzamanlılık**: Max 2 paralel üretim, geri kalanlar sıraya girer
- **Fallback**: Üretim başarısız olursa TMDB posteri gösterilir

---

## Endpoint Referansı

| Endpoint | Açıklama |
|---|---|
| `GET /configure` | Kurulum sayfası |
| `GET /manifest.json` | Stremio manifest |
| `GET /ai-poster?title=&year=&type=&genres=&overview=&fallback=` | AI poster redirect |
| `GET /poster-status` | Queue durumu (5sn auto-refresh) |
| `GET /catalog/:type/:id.json` | Katalog |
| `GET /meta/:type/:id.json` | Meta |
| `GET /stream/:type/:id.json` | Stream |
