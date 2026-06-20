import amqp from 'amqplib';
import { CircuitBreaker } from './CircuitBreaker.js';

export class RabbitMQEventPublisher {
  constructor({ url }) {
    this.url = url || 'amqp://rabbitmq:5672';
    this.connection = null;
    this.channel = null;
    this.breaker = new CircuitBreaker({
      failureThreshold: Number(process.env.RABBITMQ_CIRCUIT_FAILURE_THRESHOLD) || 3,
      cooldownMs: Number(process.env.RABBITMQ_CIRCUIT_COOLDOWN_MS) || 10_000
    });
  }

  async connect() {
    if (this.channel) return;
    this.connection = await amqp.connect(this.url);
    this.connection.on('error', (error) => console.error('[rabbitmq-publisher] connection error:', error.message));
    this.connection.on('close', () => {
      this.channel = null;
      this.connection = null;
      console.error('[rabbitmq-publisher] connection closed');
    });
    this.channel = await this.connection.createConfirmChannel();
  }

  async publish({ topic, key, value }) {
    await this.breaker.execute(async () => {
      await this.connect();
      await this.channel.assertQueue(topic, { durable: true });
      const ok = this.channel.sendToQueue(topic, Buffer.from(JSON.stringify(value)), {
        contentType: 'application/json',
        persistent: true,
        messageId: key,
        timestamp: Date.now()
      });
      if (!ok) await onceDrain(this.channel);
      await this.channel.waitForConfirms();
    });
  }

  async disconnect() {
    if (this.channel) await this.channel.close().catch(() => {});
    if (this.connection) await this.connection.close().catch(() => {});
    this.channel = null;
    this.connection = null;
  }
}

function onceDrain(channel) {
  return new Promise((resolve) => channel.once('drain', resolve));
}
