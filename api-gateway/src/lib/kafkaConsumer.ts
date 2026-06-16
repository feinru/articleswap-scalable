/**
 * Kafka consumer that delivers article messages to local SSE clients.
 *
 * Each gateway instance subscribes with a unique consumer group so that
 * every instance receives every message (fan-out via Kafka topic).
 * On message arrival, the article is pushed to the local SSE registry
 * using `sendToReceiver(..., isBroadcast=true)` to prevent re-broadcast loops.
 */
import { Kafka, type Consumer } from 'kafkajs';

const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const topic = process.env.KAFKA_TOPIC || 'article-submissions';
const clientId = `${process.env.KAFKA_CLIENT_ID || 'articles-api-gateway'}-consumer`;

const kafka = new Kafka({ clientId, brokers });

let consumer: Consumer | null = null;

/**
 * Unique group id per instance ensures all gateways see all messages
 * (each instance gets its own copy of the topic stream).
 * In Kubernetes/Docker, HOSTNAME is set automatically.
 */
const groupId =
  process.env.KAFKA_CONSUMER_GROUP ||
  `gateway-${process.env.HOSTNAME || Math.random().toString(36).slice(2, 8)}`;

/**
 * Ensures the target topic exists with proper partition layout.
 * Auto-create on first produce can race with consumer subscription,
 * causing "This server does not host this topic-partition" errors.
 * Idempotent: safe to call when topic already exists.
 */
async function ensureTopic(): Promise<void> {
  const admin = kafka.admin();
  try {
    await admin.connect();
    const existing = await admin.listTopics();
    if (!existing.includes(topic)) {
      await admin.createTopics({
        topics: [{ topic, numPartitions: 3, replicationFactor: 1 }],
        waitForLeaders: true
      });
      console.log(`[Consumer:${groupId}] Created topic "${topic}" with 3 partitions`);
    } else {
      console.log(`[Consumer:${groupId}] Topic "${topic}" already exists`);
    }
  } catch (e: any) {
    console.error(`[Consumer:${groupId}] Topic ensure failed (non-fatal):`, e.message);
  } finally {
    await admin.disconnect().catch(() => {});
  }
}

/**
 * Starts the Kafka consumer. Safe to call multiple times — no-ops if already started.
 *
 * @returns Resolves when consumer is connected and subscribed.
 */
export async function startConsumer(): Promise<void> {
  if (consumer) return;

  await ensureTopic();

  consumer = kafka.consumer({ groupId });

  try {
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });
    console.log(`[Consumer:${groupId}] Subscribed to topic "${topic}"`);

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        try {
          const article = JSON.parse(message.value.toString());
          if (article.receiver) {
            const { sendToReceiver } = await import('./receiverRegistry');
            console.log(
              `[Consumer:${groupId}] Delivering article ${article.id} to receiver "${article.receiver}"`
            );
            sendToReceiver(article.receiver, article, true);
          }
        } catch (e: any) {
          console.error(`[Consumer:${groupId}] Failed to process message:`, e.message);
        }
      }
    });
  } catch (e: any) {
    console.error(`[Consumer:${groupId}] Failed to start:`, e.message);
    consumer = null;
  }
}

/**
 * Gracefully disconnects the consumer. Safe to call when not started.
 */
export async function stopConsumer(): Promise<void> {
  if (consumer) {
    try {
      await consumer.disconnect();
    } catch {
      // ignore
    }
    consumer = null;
    console.log(`[Consumer:${groupId}] Disconnected`);
  }
}
