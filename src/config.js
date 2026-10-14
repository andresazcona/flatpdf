import os from 'node:os';
import path from 'node:path';

const int = (value, fallback, min, max) => {
  const n = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`config value ${value} must be an integer in [${min}, ${max}]`);
  return n;
};

/** All runtime settings, read once from the environment. See .env.example. */
export function loadConfig(env = process.env) {
  return {
    port: int(env.PORT, 3000, 1, 65535),
    publicUrl: env.PUBLIC_URL || `http://localhost:${env.PORT || 3000}`,
    dataDir: path.resolve(env.DATA_DIR || path.join(os.tmpdir(), 'flatpdf')),
    apiKeyHashes: (env.API_KEY_SHA256 || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),

    maxUploadBytes: int(env.MAX_UPLOAD_MB, 20, 1, 100) * 1024 * 1024,
    maxPages: int(env.MAX_PAGES, 50, 1, 1000),
    maxRecipients: int(env.MAX_RECIPIENTS, 20, 1, 100),
    dpi: int(env.DPI, 150, 50, 300),
    jpegQuality: int(env.JPEG_QUALITY, 80, 30, 100),
    maxAttempts: int(env.MAX_ATTEMPTS, 1, 1, 10),

    resultTtlSec: int(env.RESULT_TTL_SEC, 3600, 60, 30 * 86400),
    urlTtlSec: int(env.URL_TTL_SEC, 900, 60, 7 * 86400),

    uploadsBucket: env.UPLOADS_BUCKET,
    resultsBucket: env.RESULTS_BUCKET,
    queueUrl: env.QUEUE_URL,
  };
}
