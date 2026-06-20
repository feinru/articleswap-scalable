import amqp from 'amqplib';

export class RabbitMQQueueEnsurer {
  constructor({ url }) {
    this.url = url || 'amqp://rabbitmq:5672';
  }

  async ensure(queue) {
    const connection = await amqp.connect(this.url);
    const channel = await connection.createChannel();
    try {
      if (queue === 'article-delivered') {
        await channel.assertExchange('article-delivered.exchange', 'fanout', { durable: true });
      } else {
        await channel.assertQueue(queue, { durable: true });
      }
      console.log(`[queue-ensurer] "${queue}" ready`);
    } finally {
      await channel.close().catch(() => {});
      await connection.close().catch(() => {});
    }
  }
}
