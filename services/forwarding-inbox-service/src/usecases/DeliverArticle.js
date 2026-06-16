export class DeliverArticle {
  async execute(article) {
    // TODO: UPDATE articles SET status='delivered', delivered_at=NOW() WHERE id=$1
    // TODO: insert audit row ke article_deliveries
    // TODO: trigger SSE notifikasi ke receiver (via Redis pub/sub atau HTTP ke gateway)
    return {
      ...article,
      deliveredAt: new Date().toISOString()
    };
  }
}
