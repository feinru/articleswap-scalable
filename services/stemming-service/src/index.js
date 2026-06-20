import 'dotenv/config';
import { RabbitMQEventPublisher } from './infrastructure/messaging/RabbitMQEventPublisher.js';
import { RabbitMQEventConsumer } from './infrastructure/messaging/RabbitMQEventConsumer.js';
import { RabbitMQQueueEnsurer } from './infrastructure/messaging/RabbitMQQueueEnsurer.js';
import { createArticleHandler } from './interfaces/messaging/handler.js';
import pg from 'pg';
import { PostgresProcessingRepository } from './infrastructure/persistence/PostgresProcessingRepository.js';
import http from 'node:http';

const SERVICE = 'stemming-service';

async function main() {
  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
  const consumeTopic = process.env.CONSUME_TOPIC || 'article-submissions';
  const produceTopic = process.env.PRODUCE_TOPIC || 'article-stemmed';
  const databaseUrl = process.env.DATABASE_URL;
  const pendingRequeueThresholdMinutes = Number(process.env.PENDING_REQUEUE_THRESHOLD_MINUTES || 30);

  const eventPublisher = new RabbitMQEventPublisher({ url: rabbitmqUrl });

  const rabbitmqConsumer = new RabbitMQEventConsumer({
    url: rabbitmqUrl,
    groupId: process.env.RABBITMQ_CONSUMER_NAME || SERVICE,
    prefetch: Number(process.env.RABBITMQ_PREFETCH || 1)
  });

  const queueEnsurer = new RabbitMQQueueEnsurer({ url: rabbitmqUrl });

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
    eventConsumer: rabbitmqConsumer,
    queueEnsurer,
    consumeTopic,
    produceTopic,
    processingRepository
  });

  await eventPublisher.connect();
  await handler.recoverPending({ thresholdMinutes: pendingRequeueThresholdMinutes });
  startHealthServer({ eventConsumer: rabbitmqConsumer });
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

function startHealthServer({ eventConsumer }) {
  const port = Number(process.env.HEALTH_PORT || 3001);
  const server = http.createServer((req, res) => {
    if (req.url === '/metrics') {
      const health = eventConsumer.getHealth();
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(renderMetrics(health));
      return;
    }

    if (req.url === '/health') {
      const health = eventConsumer.getHealth();
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
