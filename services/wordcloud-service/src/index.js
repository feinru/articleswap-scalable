import 'dotenv/config';
import { RabbitMQEventPublisher } from './infrastructure/messaging/RabbitMQEventPublisher.js';
import { RabbitMQEventConsumer } from './infrastructure/messaging/RabbitMQEventConsumer.js';
import { RabbitMQQueueEnsurer } from './infrastructure/messaging/RabbitMQQueueEnsurer.js';
import { createArticleHandler } from './interfaces/messaging/handler.js';
import pg from 'pg';
import { PostgresProcessingRepository } from './infrastructure/persistence/PostgresProcessingRepository.js';

const SERVICE = 'wordcloud-service';

async function main() {
  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
  const consumeTopic = process.env.CONSUME_TOPIC || 'article-stemmed';
  const produceTopic = process.env.PRODUCE_TOPIC || 'article-wordcloud-generated';
  const publicBaseUrl = process.env.PUBLIC_MINIO_URL || 'http://localhost:9000';
  const databaseUrl = process.env.DATABASE_URL;

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
    publicBaseUrl,
    processingRepository
  });

  await eventPublisher.connect();
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
