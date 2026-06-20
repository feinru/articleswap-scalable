import { Kafka, logLevel } from 'kafkajs';

export class KafkaEventConsumer {
  constructor({
    brokers,
    clientId,
    groupId,
    sessionTimeout = 120000,
    heartbeatInterval = 3000,
    rebalanceTimeout = 120000,
    maxWaitTimeInMs = 5000,
    maxBytesPerPartition = 1048576,
    maxInFlightRequests = 1,
    retry = { retries: 8, initialRetryTime: 300, multiplier: 2 },
    logger = console
  }) {
    this.brokers = (brokers || 'localhost:9092').split(',');
    this.clientId = clientId || 'consumer';
    this.groupId = groupId;
    this.logger = logger;
    this.sessionTimeout = sessionTimeout;
    this.heartbeatInterval = heartbeatInterval;
    this.rebalanceTimeout = rebalanceTimeout;
    this.maxWaitTimeInMs = maxWaitTimeInMs;
    this.maxBytesPerPartition = maxBytesPerPartition;
    this.maxInFlightRequests = maxInFlightRequests;
    this.kafka = new Kafka({
      clientId: this.clientId,
      brokers: this.brokers,
      logLevel: logLevel.WARN,
      retry
    });
    this.consumer = null;
    this.running = false;
    this.restartTimer = null;
    this.metrics = {
      connected: false,
      running: false,
      lastHeartbeatAt: null,
      lastCrashAt: null,
      lastError: null,
      lastBatchAt: null,
      lastProcessedAt: null,
      processedMessages: 0,
      failedMessages: 0,
      dlqMessages: 0,
      processingDurationsMs: [],
      lagByPartition: {}
    };
  }

  async connect() {
    if (!this.consumer) {
      this.consumer = this.kafka.consumer({
        groupId: this.groupId,
        sessionTimeout: this.sessionTimeout,
        heartbeatInterval: this.heartbeatInterval,
        rebalanceTimeout: this.rebalanceTimeout,
        maxWaitTimeInMs: this.maxWaitTimeInMs,
        maxBytesPerPartition: this.maxBytesPerPartition,
        maxInFlightRequests: this.maxInFlightRequests,
        retry: { retries: 8 }
      });
      this.attachInstrumentation();
      await this.consumer.connect();
    }
  }

  async subscribe({ topic, handler, onFailure, fromBeginning = false }) {
    await this.connect();
    await retryKafka(`subscribe ${topic}`, () => this.consumer.subscribe({ topic, fromBeginning }));
    this.running = true;
    this.metrics.running = true;
    await this.consumer.run({
      autoCommit: false,
      eachBatchAutoResolve: false,
      eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }) => {
        this.recordBatchLag(batch);
        for (const message of batch.messages) {
          if (!isRunning() || isStale()) break;
          if (!message.value) {
            resolveOffset(message.offset);
            await heartbeat();
            this.metrics.lastHeartbeatAt = new Date().toISOString();
            await this.commitCurrentOffset(batch, message);
            continue;
          }

          const startedAt = Date.now();
          try {
            const value = JSON.parse(message.value.toString());
            await handler(value, message, { heartbeat });
            this.metrics.processedMessages += 1;
            this.metrics.lastProcessedAt = new Date().toISOString();
          } catch (error) {
            this.metrics.failedMessages += 1;
            this.metrics.lastError = error.message;
            this.logger.error(`[${this.groupId}] handler error at ${batch.topic}[${batch.partition}] offset ${message.offset}:`, error.message);
            if (onFailure) {
              await onFailure({ error, message, batch });
              this.metrics.dlqMessages += 1;
            } else {
              throw error;
            }
          } finally {
            this.recordProcessingDuration(Date.now() - startedAt);
          }

          resolveOffset(message.offset);
          await heartbeat();
          this.metrics.lastHeartbeatAt = new Date().toISOString();
          await this.commitCurrentOffset(batch, message);
        }
      }
    });
  }

  getHealth() {
    const durations = this.metrics.processingDurationsMs;
    const sorted = [...durations].sort((a, b) => a - b);
    const avg = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;
    const p95 = sorted.length ? sorted[Math.floor((sorted.length - 1) * 0.95)] : 0;
    return {
      groupId: this.groupId,
      connected: this.metrics.connected,
      running: this.metrics.running,
      lastHeartbeatAt: this.metrics.lastHeartbeatAt,
      lastCrashAt: this.metrics.lastCrashAt,
      lastError: this.metrics.lastError,
      processedMessages: this.metrics.processedMessages,
      failedMessages: this.metrics.failedMessages,
      dlqMessages: this.metrics.dlqMessages,
      processingDurationMs: { avg, p95, max: sorted.at(-1) || 0 },
      lagByPartition: this.metrics.lagByPartition
    };
  }

  async disconnect() {
    this.running = false;
    this.metrics.running = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }
  }

  attachInstrumentation() {
    const events = this.consumer.events;
    this.consumer.on(events.CONNECT, () => {
      this.metrics.connected = true;
      this.logger.log(`[${this.groupId}] consumer connected`);
    });
    this.consumer.on(events.DISCONNECT, () => {
      this.metrics.connected = false;
      this.metrics.running = false;
      this.logger.error(`[${this.groupId}] consumer disconnected`);
      process.exit(1);
    });
    this.consumer.on(events.GROUP_JOIN, ({ payload }) => {
      this.logger.log(`[${this.groupId}] joined group as ${payload.memberId}`);
    });
    this.consumer.on(events.HEARTBEAT, () => {
      this.metrics.lastHeartbeatAt = new Date().toISOString();
    });
    this.consumer.on(events.CRASH, ({ payload }) => {
      this.metrics.lastCrashAt = new Date().toISOString();
      this.metrics.lastError = payload.error.message;
      this.metrics.running = false;
      this.logger.error(`[stemming-service] consumer crashed`, payload);
      process.exit(1);
    });
  }

  recordBatchLag(batch) {
    this.metrics.lastBatchAt = new Date().toISOString();
    this.metrics.lagByPartition[`${batch.topic}:${batch.partition}`] = {
      highWatermark: batch.highWatermark,
      lastOffset: batch.lastOffset(),
      offsetLag: Math.max(0, Number(batch.highWatermark) - Number(batch.lastOffset()) - 1),
      batchSize: batch.messages.length
    };
  }

  recordProcessingDuration(durationMs) {
    this.metrics.processingDurationsMs.push(durationMs);
    if (this.metrics.processingDurationsMs.length > 200) this.metrics.processingDurationsMs.shift();
  }

  async commitCurrentOffset(batch, message) {
    await this.consumer.commitOffsets([{
      topic: batch.topic,
      partition: batch.partition,
      offset: (BigInt(message.offset) + 1n).toString()
    }]);
  }
}

async function retryKafka(label, operation) {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      console.error(`[kafka-consumer] ${label} failed attempt ${attempt}:`, error.message);
      if (attempt === 8) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
}
