import test from 'node:test';
import assert from 'node:assert/strict';

import { createArticleHandler } from '../src/interfaces/messaging/handler.js';
import {
  detectTokenLanguage,
  StemArticle,
  stemMixedLanguageText,
  stemMixedLanguageTextAsync,
  stemToken,
  tokenizeText
} from '../src/usecases/StemArticle.js';

test('tokenizeText keeps readable punctuation and technical chunks', () => {
  assert.deepEqual(tokenizeText('API, RabbitMQ 3.13, https://example.com/a?b=1'), [
    'API',
    ',',
    ' ',
    'RabbitMQ',
    ' ',
    '3.13',
    ',',
    ' ',
    'https://example.com/a?b=1'
  ]);
});

test('stems Indonesian article with SastrawiJS', () => {
  assert.equal(stemMixedLanguageText('Pengembangan aplikasi sangat menyenangkan.'), 'kembang aplikasi sangat senang.');
  assert.equal(detectTokenLanguage('pengembangan'), 'id');
});

test('stems English article with Porter stemmer', () => {
  assert.equal(stemMixedLanguageText('Users can share articles quickly.'), 'user can share article quick.');
  assert.equal(detectTokenLanguage('quickly'), 'en');
});

test('stems mixed Indonesian and English per token', () => {
  assert.equal(
    stemMixedLanguageText('Pengembangan aplikasi scalable sangat menyenangkan karena users can share articles quickly.'),
    'kembang aplikasi scalable sangat senang karena user can share article quick.'
  );
});

test('does not stem technical terms, numbers, URLs, emails, code-like tokens, or symbols', () => {
  const input = 'API RabbitMQ Redis Docker PostgreSQL storage recycle worker-1 test@example.com https://example.com const user_id = 42;';

  assert.equal(stemMixedLanguageText(input), input);
  assert.equal(stemToken('scalable'), 'scalable');
  assert.equal(stemToken('RabbitMQ'), 'RabbitMQ');
  assert.equal(stemToken('storage'), 'storage');
  assert.equal(stemToken('recycle'), 'recycle');
});

test('StemArticle usecase writes mixed-language stemmedContent', async () => {
  const result = await new StemArticle().execute({
    id: 'article-1',
    content: 'Pengembangan aplikasi scalable sangat menyenangkan karena users can share articles quickly.'
  });

  assert.equal(result.stemmedContent, 'kembang aplikasi scalable sangat senang karena user can share article quick.');
  assert.equal(typeof result.stemmedAt, 'string');
});

test('async stemmer yields and heartbeats during long content processing', async () => {
  let heartbeats = 0;
  const input = Array.from({ length: 250 }, () => 'Pengembangan').join(' ');

  const result = await stemMixedLanguageTextAsync(input, {
    yieldEveryTokens: 50,
    heartbeat: async () => {
      heartbeats += 1;
    }
  });

  assert.equal(result.split(' ')[0], 'kembang');
  assert.ok(heartbeats >= 4);
});

test('StemArticle passes heartbeat through non-blocking async stemmer', async () => {
  let heartbeats = 0;
  const article = {
    id: 'article-long',
    content: Array.from({ length: 220 }, () => 'Pengembangan').join(' ')
  };

  await new StemArticle().execute(article, {
    yieldEveryTokens: 50,
    heartbeat: async () => {
      heartbeats += 1;
    }
  });

  assert.ok(heartbeats >= 4);
});

test('RabbitMQ handler preserves existing queues, stores stemmed content, and publishes article-stemmed event', async () => {
  const ensuredTopics = [];
  const publishedEvents = [];
  const storedStemmedContent = [];
  let subscribedTopic = '';
  let subscribedHandler = null;

  const handler = createArticleHandler({
    consumeTopic: 'article-submissions',
    produceTopic: 'article-stemmed',
    queueEnsurer: {
      ensure: async (topic) => ensuredTopics.push(topic)
    },
    eventConsumer: {
      subscribe: async ({ topic, handler: articleHandler }) => {
        subscribedTopic = topic;
        subscribedHandler = articleHandler;
      }
    },
    processingRepository: {
      markStemmed: async (articleId, stemmedContent) => storedStemmedContent.push({ articleId, stemmedContent })
    },
    eventPublisher: {
      publish: async (event) => publishedEvents.push(event)
    },
    logger: { log: () => {} }
  });

  await handler.start();
  await subscribedHandler({
    id: 'article-1',
    receiver: 'wordcloud-service',
    content: 'Pengembangan aplikasi scalable sangat menyenangkan karena users can share articles quickly.'
  });

  assert.deepEqual(ensuredTopics, ['article-submissions', 'article-stemmed', 'article-submissions-dlq']);
  assert.equal(subscribedTopic, 'article-submissions');
  assert.deepEqual(storedStemmedContent, [{
    articleId: 'article-1',
    stemmedContent: 'kembang aplikasi scalable sangat senang karena user can share article quick.'
  }]);
  assert.equal(publishedEvents.length, 1);
  assert.equal(publishedEvents[0].topic, 'article-stemmed');
  assert.equal(publishedEvents[0].key, 'article-1');
  assert.equal(publishedEvents[0].value.stemmedContent, 'kembang aplikasi scalable sangat senang karena user can share article quick.');
});

test('RabbitMQ handler requeues stale pending articles on startup recovery', async () => {
  const publishedEvents = [];
  const handler = createArticleHandler({
    consumeTopic: 'article-submissions',
    produceTopic: 'article-stemmed',
    queueEnsurer: { ensure: async () => {} },
    eventConsumer: { subscribe: async () => {} },
    processingRepository: {
      findStalePendingArticles: async ({ thresholdMinutes }) => {
        assert.equal(thresholdMinutes, 30);
        return [{ id: 'article-2', title: 'T', content: 'Content', sender: 'alice', receiver: 'bob' }];
      }
    },
    eventPublisher: { publish: async (event) => publishedEvents.push(event) },
    logger: { log: () => {}, warn: () => {}, error: () => {} }
  });

  const count = await handler.recoverPending({ thresholdMinutes: 30 });

  assert.equal(count, 1);
  assert.deepEqual(publishedEvents, [{
    topic: 'article-submissions',
    key: 'article-2',
    value: { id: 'article-2', title: 'T', content: 'Content', sender: 'alice', receiver: 'bob' }
  }]);
});
