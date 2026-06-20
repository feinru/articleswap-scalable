const POSTGRES_NUL_BYTE_PATTERN = /\u0000/g;

export function sanitizePostgresText(value) {
  if (typeof value !== 'string') return value;
  return value.replace(POSTGRES_NUL_BYTE_PATTERN, '');
}

export function sanitizeSubmitPayload(payload) {
  return {
    ...payload,
    title: sanitizePostgresText(payload.title),
    content: sanitizePostgresText(payload.content),
    fileData: sanitizePostgresText(payload.fileData),
    fileName: sanitizePostgresText(payload.fileName),
    sender: sanitizePostgresText(payload.sender),
    receiver: sanitizePostgresText(payload.receiver)
  };
}
