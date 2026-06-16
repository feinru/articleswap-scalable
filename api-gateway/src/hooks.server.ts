/**
 * SvelteKit server hooks. Runs once on app startup (init) and on every request (handle).
 *
 * - `init`: starts the Kafka consumer so the gateway can deliver messages to local SSE clients.
 * - `handle`: pass-through; the consumer already runs in the background.
 */
import type { Handle } from '@sveltejs/kit';
import { startConsumer, stopConsumer } from '$lib/kafkaConsumer';

let consumerStarted = false;

export async function init(): Promise<void> {
  if (consumerStarted) return;
  consumerStarted = true;
  // Fire-and-forget: don't block app startup if Kafka is slow to respond.
  startConsumer().catch((e) => console.error('Kafka consumer init failed:', e));
}

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event);
};

// Graceful shutdown for SIGTERM/SIGINT (Docker stop, Ctrl+C in dev).
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    console.log(`Received ${sig}, shutting down consumer...`);
    await stopConsumer();
    process.exit(0);
  });
}
