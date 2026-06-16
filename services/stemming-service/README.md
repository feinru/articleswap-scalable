# Stemming Service

Kafka consumer/producer dalam pipeline ArticleSwap.

**Pipeline position**: consume `article-submissions` → produce `article-stemmed`

Tugas: stemming artikel (bhs Indonesia/Inggris sesuai requirement), persist ke Postgres, forward ke topic berikutnya.

## Run lokal
```bash
npm install
npm run dev
```

## Env (di-set di docker-compose.yml, contoh)
- `KAFKA_BROKERS` — broker addresses, comma-separated
- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — Redis (kalau pakai untuk cache/dedup)
- `CONSUME_TOPIC` — default: `article-submissions`
- `PRODUCE_TOPIC` — default: `article-stemmed`

## TODO
- [ ] Pilih stemmer library + implement `stem(text)`
- [ ] Schema Postgres untuk article + stemmed fields
- [ ] Idempotency: skip kalau articleId sudah diproses (pakai Redis SET atau DB unique constraint)
- [ ] Error handling: dead-letter queue ke topic `article-submissions.dlq`
