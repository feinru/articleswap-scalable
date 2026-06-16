/**
 * Wrapper structure for individual ReadableStream controllers to uniquely identify and track SSE client connections.
 */
export interface ControllerWrapper {
  /** Unique identifier for the client connection. */
  id: string;
  /** Svelte/standard stream controller to enqueue events. */
  controller: ReadableStreamDefaultController;
}

/**
 * Registry map pairing lowercase receiver usernames to list of active client streams.
 */
export const clients = new Map<string, ControllerWrapper[]>();

/**
 * Broadcasts a serialized article payload to all active Server-Sent Events streams registered for the given receiver.
 *
 * @param receiver Username of the receiver/subscriber.
 * @param article Article object payload containing title, content, files, etc.
 * @param isBroadcast Flag indicating if the call is a broadcast from another instance to prevent infinite forwarding loops.
 *
 * @complexity O(N) where N is the number of active SSE client connections for the receiver.
 */
export function sendToReceiver(receiver: string, article: any, isBroadcast = false) {
  const targetClients = clients.get(receiver.toLowerCase());
  if (targetClients && targetClients.length > 0) {
    const data = `data: ${JSON.stringify(article)}\n\n`;
    targetClients.forEach(({ controller }) => {
      try {
        controller.enqueue(new TextEncoder().encode(data));
      } catch (e) {
        console.error('Error sending message to client:', e);
      }
    });
  }

  // If this is the initiating node, broadcast to other cluster peers.
  // Peers are read from CLUSTER_PEERS env var (comma-separated host:port list).
  // Defaults to local dev setup. Connection errors (offline peers, self-loop) are ignored.
  if (!isBroadcast) {
    const peers = (process.env.CLUSTER_PEERS || '127.0.0.1:5173,127.0.0.1:5174')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    peers.forEach((peer) => {
      fetch(`http://${peer}/api/internal-broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ receiver, article })
      }).catch(() => {
        // Ignore connection refused on offline instances or the current instance
      });
    });
  }
}

