import { Kafka, logLevel } from 'kafkajs';

export class KafkaEventConsumer {
  constructor({ brokers, clientId, groupId }) {
    this.brokers = (brokers || 'localhost:9092').split(',');
    this.clientId = clientId || 'consumer';
    this.groupId = groupId;
    this.kafka = new Kafka({ clientId: this.clientId, brokers: this.brokers, logLevel: logLevel.WARN });
    this.consumer = null;
  }

  async connect() {
    if (!this.consumer) {
      this.consumer = this.kafka.consumer({ groupId: this.groupId });
      await this.consumer.connect();
    }
  }

  async subscribe({ topic, handler, fromBeginning = false }) {
    await this.connect();
    await this.consumer.subscribe({ topic, fromBeginning });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        try {
          const value = JSON.parse(message.value.toString());
          await handler(value, message);
        } catch (e) {
          console.error(`[${this.groupId}] handler error:`, e.message);
        }
      }
    });
  }

  async disconnect() {
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }
  }
}
