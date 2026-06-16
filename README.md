# Distributed Article Swap

ArticleSwap adalah distributed platform untuk bertukar artikel secara real-time menggunakan SvelteKit, Nginx Load Balancer, dan Apache Kafka.


## Cara Menjalankan Layanan

### Opsi 1: Docker (Recommended)

Paling simpel — satu perintah handle semua (Kafka, 2 gateway instance, Nginx LB).

**Prerequisites**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) atau Docker Engine + Compose v2.

```bash
docker compose up --build
```

Tunggu sampai log menunjukkan `Subscribed to topic "article-submissions"` dari kedua gateway (sekitar 10-15 detik untuk first build).

**Akses**:
- **Dashboard (Load Balanced)**: [http://localhost:8080](http://localhost:8080)
- Kafka broker: `localhost:9092` (kalau mau connect pake tools eksternal)

**Stop**:
```bash
docker compose down            # stop + hapus container
docker compose down -v         # + hapus volume (Kafka state)
```

**Konfigurasi** (opsional): copy `.env.example` ke `.env` dan edit. Lalu jalankan `docker compose up` (otomatis baca `.env`).

> **Mode dev**: Source di-bind-mount, jadi edit di `api-gateway/src/` ke-reflect di container via HMR.
>
> **Mode prod**: Dockerfile sekarang jalanin Vite dev (untuk demo). Buat production-grade, install `@sveltejs/adapter-node`, ubah CMD jadi `node build/index.js`, dan hapus bind-mount.

### Opsi 2: Native (Tanpa Docker)

#### Prerequisites
- **Node.js** (v18+)
- **Nginx**
- Apache Kafka (atau pakai mock producer built-in kalau Kafka ga tersedia)

#### Langkah Menjalankan
Jalankan script di root direktori untuk mengaktifkan dua instance API Gateway dan Nginx load balancer secara otomatis:
```bash
./run.sh
```

**Untuk Pengguna Windows / OS Lain:**

> **Git Bash / WSL / macOS:** Jalankan perintah `./run.sh` yang sama.

> **Windows (Command Prompt / PowerShell - Manual):**
1. `cd api-gateway && npm run dev -- --port 5173`
2. `cd api-gateway && npm run dev -- --port 5174`
3. `nginx -p <path_ke_project> -c <path_ke_project>/nginx.conf`


- **Dashboard (Load Balanced)**: [http://localhost:8080](http://localhost:8080)

Tekan `Ctrl+C` di terminal untuk menghentikan semua service.

---

## Endpoint API Utama

### 1. Kirim Artikel (`POST /api/articles`)
Menerima artikel berupa teks biasa atau dokumen PDF.
```json
{
  "title": "Judul Artikel",
  "sender": "alice",
  "receiver": "bob",
  "content": "Isi artikel..."
}
```

Untuk file PDF, kirim `fileData` sebagai base64 dan `fileName` berakhiran `.pdf`.

### 2. Terima SSE (`GET /api/receive?receiver=<nama_penerima>`)
Koneksi streaming SSE (`text/event-stream`) untuk menerima artikel secara real-time.
