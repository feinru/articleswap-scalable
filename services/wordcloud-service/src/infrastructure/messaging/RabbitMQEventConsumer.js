import amqp from 'amqplib';

export class RabbitMQEventConsumer {
  constructor({ url, prefetch = 1, groupId, logger = console }) {
    this.url = url || 'amqp://rabbitmq:5672';
    this.prefetch = prefetch;
    this.groupId = groupId || 'consumer';
    this.logger = logger;
    this.connection = null;
    this.channel = null;
  }

  async connect() {
    if (this.channel) return;
    this.connection = await amqp.connect(this.url);
    this.connection.on('error', (error) => this.logger.error(`[${this.groupId}] rabbitmq connection error:`, error.message));
    this.connection.on('close', () => {
      this.logger.error(`[${this.groupId}] rabbitmq connection closed`);
      process.exit(1);
    });
    this.channel = await this.connection.createChannel();
    await this.channel.prefetch(this.prefetch);
  }

  async subscribe({ topic, handler }) {
    await this.connect();
    await this.channel.assertQueue(topic, { durable: true });
    await this.channel.consume(topic, async (message) => {
      if (!message) return;
      try {
        await handler(JSON.parse(message.content.toString()), message);
        this.channel.ack(message);
      } catch (error) {
        this.logger.error(`[${this.groupId}] handler error:`, error.message);
        this.channel.nack(message, false, true);
      }
    }, { noAck: false });
  }

  async disconnect() {
    if (this.channel) await this.channel.close().catch(() => {});
    if (this.connection) await this.connection.close().catch(() => {});
    this.channel = null;
    this.connection = null;
  }
}
