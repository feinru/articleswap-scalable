import 'dotenv/config';
import { KafkaEventPublisher } from './infrastructure/messaging/KafkaEventPublisher.js';
import { KafkaEventConsumer } from './infrastructure/messaging/KafkaEventConsumer.js';
import { KafkaTopicEnsurer } from './infrastructure/kafka/KafkaTopicEnsurer.js';
import { createArticleHandler } from './interfaces/messaging/handler.js';

const SERVICE = 'forwarding-inbox-service';

async function main() {
  const brokers = process.env.KAFKA_BROKERS || 'localhost:9092';
  const consumeTopic = process.env.CONSUME_TOPIC || 'article-wordcloud-generated';
  const produceTopic = process.env.PRODUCE_TOPIC || 'article-delivered';

  const eventPublisher = new KafkaEventPublisher({
    brokers,
    clientId: `${SERVICE}-publisher`
  });

  const kafkaConsumer = new KafkaEventConsumer({
    brokers,
    clientId: `${SERVICE}-consumer`,
    groupId: process.env.KAFKA_CONSUMER_GROUP || SERVICE
  });

  const topicEnsurer = new KafkaTopicEnsurer({
    brokers,
    clientId: `${SERVICE}-admin`
  });

  const handler = createArticleHandler({
    eventPublisher,
    kafkaConsumer,
    topicEnsurer,
    consumeTopic,
    produceTopic
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
