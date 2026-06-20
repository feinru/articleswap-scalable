import { StemArticle } from '../../usecases/StemArticle.js';

export function createArticleHandler({ eventPublisher, eventConsumer, queueEnsurer, consumeTopic, produceTopic, processingRepository, logger = console }) {
  const useCase = new StemArticle();
  const dlqTopic = process.env.DLQ_TOPIC || `${consumeTopic}-dlq`;
  const maxAttempts = Number(process.env.STEMMING_MAX_ATTEMPTS || 3);

  return {
    async start() {
      await Promise.all([
        queueEnsurer.ensure(consumeTopic),
        queueEnsurer.ensure(produceTopic),
        queueEnsurer.ensure(dlqTopic)
      ]);
      await eventConsumer.subscribe({
        topic: consumeTopic,
        handler: async (article, message, { heartbeat } = {}) => {
          const result = await withRetry(
            () => useCase.execute(article, { heartbeat }),
            { attempts: maxAttempts, heartbeat, label: `stem ${article.id}`, logger }
          );
          if (processingRepository) {
            await withRetry(
              () => processingRepository.markStemmed(article.id, result.stemmedContent),
              { attempts: maxAttempts, heartbeat, label: `markStemmed ${article.id}`, logger }
            );
          }
          await withRetry(
            () => eventPublisher.publish({
              topic: produceTopic,
              key: article.id,
              value: result
            }),
            { attempts: maxAttempts, heartbeat, label: `publish ${article.id}`, logger }
          );
          logger.log(`[stemming-service] processed ${article.id} → ${article.receiver}`);
        },
        onFailure: async ({ error, message, batch }) => {
          const rawValue = message.value?.toString() || message.content?.toString() || '';
          let parsedValue = null;
          try {
            parsedValue = rawValue ? JSON.parse(rawValue) : null;
          } catch (_parseError) {
            parsedValue = null;
          }
          await eventPublisher.publish({
            topic: dlqTopic,
            key: message.key?.toString() || message.properties?.messageId || parsedValue?.id || `${batch.partition || 0}:${message.fields?.deliveryTag || message.offset || 'unknown'}`,
            value: {
              sourceTopic: batch.topic,
              sourcePartition: batch.partition,
              sourceOffset: message.offset || message.fields?.deliveryTag,
              failedAt: new Date().toISOString(),
              error: error.message,
              rawValue,
              value: parsedValue
            }
          });
          logger.error(`[stemming-service] sent failed message to ${dlqTopic}: ${error.message}`);
        }
      });
      logger.log(`[stemming-service] consuming "${consumeTopic}" → producing "${produceTopic}"; dlq "${dlqTopic}"`);
    },

    async recoverPending({ thresholdMinutes = 30 } = {}) {
      if (!processingRepository?.findStalePendingArticles) return 0;
      const staleArticles = await processingRepository.findStalePendingArticles({ thresholdMinutes });
      for (const article of staleArticles) {
        await eventPublisher.publish({ topic: consumeTopic, key: article.id, value: article });
      }
      if (staleArticles.length) {
        logger.warn(`[stemming-service] requeued ${staleArticles.length} stale PENDING articles older than ${thresholdMinutes} minutes`);
      }
      return staleArticles.length;
    }
  };
}

async function withRetry(operation, { attempts, heartbeat, label, logger }) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      logger.error(`[stemming-service] ${label} failed attempt ${attempt}/${attempts}:`, error.message);
      if (attempt === attempts) throw error;
      await heartbeat?.();
      await delay(Math.min(30000, 500 * 2 ** (attempt - 1)));
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
