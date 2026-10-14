import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Local stand-ins for S3 and SQS: files under DATA_DIR, HMAC-signed expiring download URLs
 * served by the API itself, and an in-process queue.
 */
export function createLocal(config) {
  const roots = { uploads: path.join(config.dataDir, 'uploads'), results: path.join(config.dataDir, 'results') };
  const secret = randomBytes(32); // URLs die with the process, like a rotated signing key.

  const file = (bucket, key) => {
    const p = path.resolve(roots[bucket], key);
    if (!p.startsWith(roots[bucket] + path.sep)) throw new Error(`key escapes ${bucket}: ${key}`);
    return p;
  };
  const sign = (key, expires, filename) => createHmac('sha256', secret).update(`${key}\n${expires}\n${filename}`).digest('base64url');

  const storage = {
    async put(bucket, key, body) {
      const p = file(bucket, key);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, body);
    },
    async get(bucket, key) {
      try {
        return await fs.readFile(file(bucket, key));
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
    async del(bucket, key) {
      await fs.rm(file(bucket, key), { force: true });
    },
    async presign(key, ttlSec, filename) {
      const expires = Math.floor(Date.now() / 1000) + ttlSec;
      const q = new URLSearchParams({ expires, filename, sig: sign(key, expires, filename) });
      return `${config.publicUrl}/v1/files/${key}?${q}`;
    },
    /** Path of a results file if the signature is valid and unexpired, else null. */
    verify(key, { expires, filename = '', sig = '' }) {
      const good = Buffer.from(sign(key, expires, filename));
      const given = Buffer.from(String(sig));
      if (given.length !== good.length || !timingSafeEqual(given, good)) return null;
      if (!(Number(expires) * 1000 > Date.now())) return null;
      return file('results', key);
    },
  };

  // ponytail: single in-process consumer, no retries, lost on restart. SQS covers this in AWS.
  let consumer = null;
  let tail = Promise.resolve();
  const queue = {
    async send(message) {
      tail = tail.then(() => consumer(message)).catch(() => {}); // jobs.process already logged it
    },
    consume(fn) {
      consumer = fn;
    },
    drain: () => tail,
  };

  /** TTL cleanup: the local equivalent of the S3 lifecycle rule. */
  async function sweep() {
    const cutoff = Date.now() - config.resultTtlSec * 1000;
    for (const root of Object.values(roots)) {
      const entries = await fs.readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        const p = path.join(e.parentPath, e.name);
        if (e.isFile() && (await fs.stat(p)).mtimeMs < cutoff) await fs.rm(p, { force: true });
      }
      for (const e of entries.filter((d) => d.isDirectory()).reverse()) await fs.rmdir(path.join(e.parentPath, e.name)).catch(() => {});
    }
  }

  return { storage, queue, sweep };
}
