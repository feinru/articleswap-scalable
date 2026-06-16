/**
 * ListArticles use case. Supports filtering + pagination for the
 * "Recent Submissions" panel in the sender UI.
 */
export class ListArticles {
  constructor({ articleRepository }) {
    this.articleRepository = articleRepository;
  }

  async execute({ limit = 20, offset = 0, sender, receiver, status } = {}) {
    if (!this.articleRepository) return { items: [], total: 0 };

    const [items, total] = await Promise.all([
      this.articleRepository.list({ limit, offset, sender, receiver, status }),
      this.articleRepository.count({ sender, receiver, status })
    ]);
    return { items, total, limit, offset };
  }
}
