# Forwarding & Inbox Service

Worker final di pipeline — mark article as delivered + push notifikasi ke receiver.

**Pipeline position**: consume `article-wordcloud-generated` → produce `article-delivered`

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
- `CONSUME_TOPIC` — default: `article-wordcloud-generated`
- `PRODUCE_TOPIC` — default: `article-delivered`

## TODO
- [ ] Update Postgres: `articles.status = 'delivered'`, `delivered_at = NOW()`
- [ ] Trigger SSE notif ke receiver (via HTTP ke gateway atau shared Redis pub/sub)
- [ ] Audit log ke table `article_deliveries` (siapa, kapan, status)
- [ ] Metrics: counter delivered, latency p50/p95
