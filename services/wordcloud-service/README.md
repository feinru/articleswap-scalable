# Wordcloud Service

Worker untuk generate word cloud image + upload ke MinIO.

**Pipeline position**: consume `article-stemmed` → produce `article-wordcloud-generated`

## Run lokal
```bash
npm install
npm run dev
```

## Env
- `RABBITMQ_URL`
- `RABBITMQ_CONSUMER_NAME`
- `RABBITMQ_PREFETCH`
- `DATABASE_URL`
- `CONSUME_TOPIC` — default: `article-stemmed`
- `PRODUCE_TOPIC` — default: `article-wordcloud-generated`
- `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_USE_SSL`
- `PUBLIC_MINIO_URL` — URL prefix untuk hasil di response/SSE

## TODO
- [ ] Pilih word-cloud renderer (`wordcloud` JS, `d3-cloud`, atau Python `wordcloud` lewat subprocess)
- [ ] Hitung frekuensi kata dari `article.stemmedContent`
- [ ] Generate PNG/SVG buffer
- [ ] Upload ke MinIO bucket `wordclouds`
- [ ] Simpan public URL di Postgres (table articles.wordcloud_url)
- [ ] Tambah cache layer (Redis) buat idempotency
