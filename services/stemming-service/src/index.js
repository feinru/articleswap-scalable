import 'dotenv/config';
import { KafkaEventPublisher } from './infrastructure/messaging/KafkaEventPublisher.js';
import { KafkaEventConsumer } from './infrastructure/messaging/KafkaEventConsumer.js';
import { KafkaTopicEnsurer } from './infrastructure/kafka/KafkaTopicEnsurer.js';
import { createArticleHandler } from './interfaces/messaging/handler.js';
import pg from 'pg';
import { PostgresProcessingRepository } from './infrastructure/persistence/PostgresProcessingRepository.js';
import http from 'node:http';

const SERVICE = 'stemming-service';

async function main() {
  const brokers = process.env.KAFKA_BROKERS || 'localhost:9092';
  const consumeTopic = process.env.CONSUME_TOPIC || 'article-submissions';
  const produceTopic = process.env.PRODUCE_TOPIC || 'article-stemmed';
  const databaseUrl = process.env.DATABASE_URL;
  const pendingRequeueThresholdMinutes = Number(process.env.PENDING_REQUEUE_THRESHOLD_MINUTES || 30);

  const eventPublisher = new KafkaEventPublisher({
    brokers,
    clientId: `${SERVICE}-publisher`
  });

  const kafkaConsumer = new KafkaEventConsumer({
    brokers,
    clientId: `${SERVICE}-consumer`,
    groupId: process.env.KAFKA_CONSUMER_GROUP || SERVICE,
    sessionTimeout: Number(process.env.KAFKA_SESSION_TIMEOUT_MS || 120000),
    heartbeatInterval: Number(process.env.KAFKA_HEARTBEAT_INTERVAL_MS || 3000),
    rebalanceTimeout: Number(process.env.KAFKA_REBALANCE_TIMEOUT_MS || 120000),
    maxWaitTimeInMs: Number(process.env.KAFKA_MAX_WAIT_TIME_MS || 5000),
    maxBytesPerPartition: Number(process.env.KAFKA_MAX_BYTES_PER_PARTITION || 1048576),
    maxInFlightRequests: Number(process.env.KAFKA_MAX_IN_FLIGHT_REQUESTS || 1)
  });

  const topicEnsurer = new KafkaTopicEnsurer({
    brokers,
    clientId: `${SERVICE}-admin`
  });

  let processingRepository = null;
  if (databaseUrl) {
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    processingRepository = new PostgresProcessingRepository({ pool });
    console.log(`[${SERVICE}] DB ready`);
  } else {
    console.warn(`[${SERVICE}] DATABASE_URL not set — DB status updates disabled`);
  }

  const handler = createArticleHandler({
    eventPublisher,
    kafkaConsumer,
    topicEnsurer,
    consumeTopic,
    produceTopic,
    processingRepository
  });

  await eventPublisher.connect();
  await handler.recoverPending({ thresholdMinutes: pendingRequeueThresholdMinutes });
  startHealthServer({ kafkaConsumer });
  await handler.start();
}

main().catch((e) => {
  console.error(`[${SERVICE}] fatal:`, e);
  process.exit(1);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[${SERVICE}] received ${sig}, shutting down`);
    process.exit(0);
  });
}

function startHealthServer({ kafkaConsumer }) {
  const port = Number(process.env.HEALTH_PORT || 3001);
  const server = http.createServer((req, res) => {
    if (req.url === '/metrics') {
      const health = kafkaConsumer.getHealth();
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(renderMetrics(health));
      return;
    }

    if (req.url === '/health') {
      const health = kafkaConsumer.getHealth();
      const healthy = health.connected && health.running;
      res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ service: SERVICE, status: healthy ? 'ok' : 'degraded', consumer: health }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  server.listen(port, '0.0.0.0', () => console.log(`[${SERVICE}] health server listening on ${port}`));
}

function renderMetrics(health) {
  const lagTotal = Object.values(health.lagByPartition).reduce((sum, value) => sum + value.offsetLag, 0);
  return [
    `stemming_consumer_connected ${health.connected ? 1 : 0}`,
    `stemming_consumer_running ${health.running ? 1 : 0}`,
    `stemming_messages_processed_total ${health.processedMessages}`,
    `stemming_messages_failed_total ${health.failedMessages}`,
    `stemming_messages_dlq_total ${health.dlqMessages}`,
    `stemming_processing_duration_avg_ms ${health.processingDurationMs.avg}`,
    `stemming_processing_duration_p95_ms ${health.processingDurationMs.p95}`,
    `stemming_processing_duration_max_ms ${health.processingDurationMs.max}`,
    `stemming_consumer_lag ${lagTotal}`,
    ''
  ].join('\n');
}
