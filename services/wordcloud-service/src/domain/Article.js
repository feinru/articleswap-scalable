export class Article {
  constructor({ id, title, content, file, sender, receiver, timestamp, ...rest } = {}) {
    this.id = id;
    this.title = title;
    this.content = content || '';
    this.file = file || null;
    this.sender = sender;
    this.receiver = receiver;
    this.timestamp = timestamp || new Date().toISOString();
    Object.assign(this, rest);
  }
}
