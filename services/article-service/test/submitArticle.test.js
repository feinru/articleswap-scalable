import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizePostgresText, sanitizeSubmitPayload } from '../src/domain/sanitizeText.js';
import { SubmitArticle } from '../src/usecases/SubmitArticle.js';

test('sanitizePostgresText removes NUL bytes rejected by Postgres UTF8 text columns', () => {
  assert.equal(sanitizePostgresText('hello\u0000world'), 'helloworld');
  assert.equal(sanitizePostgresText(null), null);
});

test('sanitizeSubmitPayload removes NUL bytes from persisted text fields', () => {
  const sanitized = sanitizeSubmitPayload({
    title: 'T\u0000itle',
    content: 'A\u0000B',
    fileData: 'abc\u0000def',
    fileName: 'doc\u0000.pdf',
    sender: 'al\u0000ice',
    receiver: 'bo\u0000b'
  });

  assert.deepEqual(sanitized, {
    title: 'Title',
    content: 'AB',
    fileData: 'abcdef',
    fileName: 'doc.pdf',
    sender: 'alice',
    receiver: 'bob'
  });
});

test('SubmitArticle persists and publishes sanitized content', async () => {
  let persistedArticle = null;
  let publishedEvent = null;
  const useCase = new SubmitArticle({
    articleRepository: {
      create: async (article) => {
        persistedArticle = article;
      },
      updateStatus: async () => {}
    },
    eventPublisher: {
      publish: async (event) => {
        publishedEvent = event;
      }
    }
  });

  const result = await useCase.execute({
    articleId: '11111111-1111-4111-8111-111111111111',
    title: 'Bad\u0000 title',
    content: 'Hello\u0000 Postgres',
    sender: 'alice\u0000',
    receiver: 'bob'
  });

  assert.equal(result.articleId, '11111111-1111-4111-8111-111111111111');
  assert.equal(persistedArticle.title, 'Bad title');
  assert.equal(persistedArticle.content, 'Hello Postgres');
  assert.equal(persistedArticle.sender, 'alice');
  assert.equal(publishedEvent.value.content, 'Hello Postgres');
});
