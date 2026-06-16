export class StemArticle {
  constructor({ stemmer } = {}) {
    this.stemmer = stemmer;
  }

  async execute(article) {
    // TODO: panggil this.stemmer(article.content) — pilih library (natural, sastrawijs, etc.)
    const stemmedContent = this.stemmer
      ? await this.stemmer(article.content)
      : article.content;

    return {
      ...article,
      stemmedContent,
      stemmedAt: new Date().toISOString()
    };
  }
}
