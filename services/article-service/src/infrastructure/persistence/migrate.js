import { readFile, readdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', '..', '..', 'migrations');

/**
 * Runs all `.sql` files in /migrations/ in lexicographic order.
 * Each file is idempotent (uses IF NOT EXISTS) so re-running is safe.
 *
 * @param {import('pg').Pool} pool Active pg pool.
 * @returns {Promise<string[]>} List of applied migration filenames.
 */
export async function runMigrations(pool) {
  let files;
  try {
    files = await readdir(migrationsDir);
  } catch (e) {
    console.warn(`[migrations] dir not found: ${migrationsDir}`);
    return [];
  }

  const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();
  const applied = [];

  for (const file of sqlFiles) {
    const path = join(migrationsDir, file);
    const sql = await readFile(path, 'utf8');
    await pool.query(sql);
    applied.push(file);
    console.log(`[migrations] applied ${file}`);
  }

  return applied;
}
