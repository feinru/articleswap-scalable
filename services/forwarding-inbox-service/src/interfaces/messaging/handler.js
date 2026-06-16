import { DeliverArticle } from '../../usecases/DeliverArticle.js';

export function createArticleHandler({ eventPublisher, kafkaConsumer, topicEnsurer, consumeTopic, produceTopic, logger = console }) {
  const useCase = new DeliverArticle();

  return {
    async start() {
      await topicEnsurer.ensure(consumeTopic);
      await kafkaConsumer.subscribe({
        topic: consumeTopic,
        handler: async (article) => {
          const result = await useCase.execute(article);
          await eventPublisher.publish({
            topic: produceTopic,
            key: article.id,
            value: result
          });
          logger.log(`[forwarding-inbox-service] delivered ${article.id} → ${article.receiver}`);
        }
      });
      logger.log(`[forwarding-inbox-service] consuming "${consumeTopic}" → producing "${produceTopic}"`);
    }
  };
}
