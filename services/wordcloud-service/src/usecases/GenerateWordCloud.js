export class GenerateWordCloud {
  constructor({ objectStorage, publicBaseUrl }) {
    this.objectStorage = objectStorage;
    this.publicBaseUrl = publicBaseUrl;
  }

  async execute(article) {
    // TODO: hitung frekuensi kata dari article.stemmedContent
    // TODO: render PNG buffer (pakai `wordcloud`, `d3-cloud`, atau subprocess Python)
    const pngBuffer = Buffer.from([]);

    const objectName = `${article.id}.png`;
    await this.objectStorage.upload(objectName, pngBuffer);
    const wordcloudUrl = this.objectStorage.publicUrl(objectName, this.publicBaseUrl);

    return {
      ...article,
      wordcloudUrl,
      generatedAt: new Date().toISOString()
    };
  }
}
