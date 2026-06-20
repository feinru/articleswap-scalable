/**
 * RabbitMQ fanout consumer that delivers article messages to local SSE clients.
 * Each gateway instance binds its own durable queue to article-delivered.exchange,
 * so every instance receives every delivered article.
 */
import amqp, { type Channel, type ChannelModel } from 'amqplib';

const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
const exchange = process.env.RABBITMQ_DELIVERED_EXCHANGE || 'article-delivered.exchange';
const instanceName = process.env.RABBITMQ_CONSUMER_NAME || `gateway-${process.env.HOSTNAME || Math.random().toString(36).slice(2, 8)}`;
const queue = process.env.RABBITMQ_DELIVERED_QUEUE || `${exchange}.${instanceName}`;

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export async function startConsumer(): Promise<void> {
  if (channel) return;

  try {
    connection = await amqp.connect(rabbitmqUrl);
    connection.on('error', (error) => console.error(`[RabbitMQ:${instanceName}] connection error:`, error.message));
    connection.on('close', () => {
      connection = null;
      channel = null;
      console.error(`[RabbitMQ:${instanceName}] connection closed`);
    });

    channel = await connection.createChannel();
    await channel.assertExchange(exchange, 'fanout', { durable: true });
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, exchange, '');
    await channel.prefetch(Number(process.env.RABBITMQ_PREFETCH || 10));

    await channel.consume(queue, async (message) => {
      if (!message || !channel) return;
      try {
        const article = JSON.parse(message.content.toString());
        if (article.receiver) {
          const { sendToReceiver } = await import('./receiverRegistry');
          console.log(`[RabbitMQ:${instanceName}] Delivering article ${article.id} to receiver "${article.receiver}"`);
          sendToReceiver(article.receiver, article, true);
        }
        channel.ack(message);
      } catch (error: any) {
        console.error(`[RabbitMQ:${instanceName}] Failed to process message:`, error.message);
        channel.nack(message, false, false);
      }
    }, { noAck: false });

    console.log(`[RabbitMQ:${instanceName}] Bound queue "${queue}" to fanout exchange "${exchange}"`);
  } catch (error: any) {
    console.error(`[RabbitMQ:${instanceName}] Failed to start:`, error.message);
    channel = null;
    connection = null;
  }
}

export async function stopConsumer(): Promise<void> {
  if (channel) await channel.close().catch(() => {});
  if (connection) await connection.close().catch(() => {});
  channel = null;
  connection = null;
  console.log(`[RabbitMQ:${instanceName}] Disconnected`);
}
