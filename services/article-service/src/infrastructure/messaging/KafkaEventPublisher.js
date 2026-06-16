import { Kafka, logLevel } from 'kafkajs';

export class KafkaEventPublisher {
  constructor({ brokers, clientId }) {
    this.brokers = (brokers || 'localhost:9092').split(',');
    this.clientId = clientId || 'publisher';
    this.kafka = new Kafka({ clientId: this.clientId, brokers: this.brokers, logLevel: logLevel.WARN });
    this.producer = null;
  }

  async connect() {
    if (!this.producer) {
      this.producer = this.kafka.producer();
      await this.producer.connect();
    }
  }

  async publish({ topic, key, value }) {
    await this.connect();
    await this.producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(value) }]
    });
  }

  async disconnect() {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
  }
}
