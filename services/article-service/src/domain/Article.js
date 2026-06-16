export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

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

  static fromSubmitPayload(payload) {
    return new Article({
      id: crypto.randomUUID(),
      title: payload.title,
      content: payload.content,
      file: payload.fileData ? { name: payload.fileName, data: payload.fileData } : null,
      sender: payload.sender,
      receiver: payload.receiver,
      timestamp: new Date().toISOString()
    });
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      content: this.content,
      file: this.file,
      sender: this.sender,
      receiver: this.receiver,
      timestamp: this.timestamp
    };
  }
}
