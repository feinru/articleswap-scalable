# Article Service

Service backend khusus untuk submission artikel. Publish ke RabbitMQ queue `article-submissions`, downstream services (stemming, wordcloud, forwarding-inbox) consume & process.

**Tanggung jawab:**
- Terima `POST /api/articles` (JSON body)
- Validasi field wajib (title, sender, receiver, content atau file)
- Generate `articleId` (UUID v4)
- Publish ke RabbitMQ
- Return `202 Accepted` + `articleId`

**Tidak termasuk:**
- Persistence ke Postgres (bisa ditambah sebagai TODO)
- SSE delivery (api-gateway yang handle)
- Pipeline processing (service lain)

## Endpoints

### `POST /api/articles`
```json
{
  "title": "Judul Artikel",
  "content": "Isi artikel...",
  "fileData": "<base64 string, optional>",
  "fileName": "lampiran.pdf",
  "sender": "alice",
  "receiver": "bob"
}
```

Response `202`:
```json
{
  "message": "Article submitted successfully to processing pipeline",
  "articleId": "uuid-v4"
}
```

Response `400`: field hilang.

### `GET /health`
Liveness probe. Return `{ "status": "ok" }`.

## Run lokal
```bash
npm install
npm run dev
```

## Env
- `RABBITMQ_URL` — AMQP connection URL
- `RABBITMQ_QUEUE` — default `article-submissions`
- `PORT` — default `3000`
- `HOST` — default `0.0.0.0`

## TODO
- [ ] Persistent artikel ke Postgres sebelum publish (audit + replay)
- [ ] Idempotency: reject duplicate `articleId` (kalau client retry)
- [ ] Auth: API key / JWT validation di header
- [ ] Rate limit per `sender`
- [ ] Schema validation pake Zod / Joi
- [ ] File upload limit sesuai requirement (10MB saat ini hardcoded)
