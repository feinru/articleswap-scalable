import amqp from 'amqplib';

export class RabbitMQEventConsumer {
  constructor({ url, prefetch = 1, groupId, logger = console }) {
    this.url = url || 'amqp://rabbitmq:5672';
    this.prefetch = prefetch;
    this.groupId = groupId || 'consumer';
    this.logger = logger;
    this.connection = null;
    this.channel = null;
    this.metrics = { connected: false, running: false, processedMessages: 0, failedMessages: 0, dlqMessages: 0, lastError: null };
  }

  async connect() {
    if (this.channel) return;
    this.connection = await amqp.connect(this.url);
    this.connection.on('error', (error) => {
      this.metrics.connected = false;
      this.metrics.running = false;
      this.metrics.lastError = error.message;
      this.logger.error(`[${this.groupId}] rabbitmq connection error:`, error.message);
    });
    this.connection.on('close', () => {
      this.metrics.connected = false;
      this.metrics.running = false;
      this.logger.error(`[${this.groupId}] rabbitmq connection closed`);
      process.exit(1);
    });
    this.channel = await this.connection.createChannel();
    await this.channel.prefetch(this.prefetch);
    this.metrics.connected = true;
  }

  async subscribe({ topic, handler, onFailure }) {
    await this.connect();
    await this.channel.assertQueue(topic, { durable: true });
    this.metrics.running = true;
    await this.channel.consume(topic, async (message) => {
      if (!message) return;
      try {
        const value = JSON.parse(message.content.toString());
        await handler(value, message, { heartbeat: async () => {} });
        this.channel.ack(message);
        this.metrics.processedMessages += 1;
      } catch (error) {
        this.metrics.failedMessages += 1;
        this.metrics.lastError = error.message;
        if (onFailure) {
          await onFailure({ error, message, batch: { topic, partition: 0 } });
          this.metrics.dlqMessages += 1;
          this.channel.ack(message);
        } else {
          this.channel.nack(message, false, true);
        }
      }
    }, { noAck: false });
  }

  getHealth() {
    return { groupId: this.groupId, ...this.metrics, lagByPartition: {}, processingDurationMs: { avg: 0, p95: 0, max: 0 } };
  }

  async disconnect() {
    this.metrics.running = false;
    if (this.channel) await this.channel.close().catch(() => {});
    if (this.connection) await this.connection.close().catch(() => {});
    this.channel = null;
    this.connection = null;
  }
}
