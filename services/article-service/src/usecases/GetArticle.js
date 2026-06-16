import { ValidationError } from '../domain/Article.js';

export class GetArticle {
  constructor({ articleRepository }) {
    this.articleRepository = articleRepository;
  }

  async execute(id) {
    if (!id || typeof id !== 'string') {
      throw new ValidationError('Article ID is required');
    }

    const article = await this.articleRepository.findById(id);
    if (!article) return null;
    return article;
  }
}
