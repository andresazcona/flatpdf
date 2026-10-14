import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { openPdf } from '../pdf/rasterize.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PDF_MAGIC = Buffer.from('%PDF-');
const MAX_RECIPIENT_LENGTH = 120;

const fail = (res, status, error) => res.status(status).json({ error });

/**
 * API keys are configured as SHA-256 hex digests, so the environment never holds a usable key.
 * Every configured hash is compared in constant time; a key's hash prefix identifies the job owner.
 */
function authenticate(hashes) {
  if (hashes.length === 0) throw new Error('API_KEY_SHA256 is empty: refusing to start without API keys');
  if (!hashes.every((h) => /^[0-9a-f]{64}$/.test(h))) throw new Error('API_KEY_SHA256 must hold 64-char hex SHA-256 digests');
  const known = hashes.map((h) => Buffer.from(h, 'hex'));
  return (req, res, next) => {
    const key = req.get('x-api-key');
    if (key) {
      const digest = createHash('sha256').update(key).digest();
      let ok = false;
      for (const k of known) ok = timingSafeEqual(digest, k) || ok;
      if (ok) {
        req.owner = digest.toString('hex').slice(0, 16);
        return next();
      }
    }
    fail(res, 401, 'missing or invalid x-api-key header');
  };
}

function parseRecipients(raw, max) {
  const list = [raw ?? []].flat().map((v) => String(v).replace(/\p{C}/gu, '').trim()).filter(Boolean);
  if (list.length > max) return `at most ${max} recipients`;
  if (list.some((r) => r.length > MAX_RECIPIENT_LENGTH)) return `recipient longer than ${MAX_RECIPIENT_LENGTH} characters`;
  return [...new Set(list)];
}

export function createApp({ config, jobs, storage }) {
  const app = express();
  const auth = authenticate(config.apiKeyHashes);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: config.maxRecipients + 2, fieldSize: 1024 },
  }).single('file');

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  // Auth runs before multer, so unauthenticated uploads are rejected without reading the body.
  app.post('/v1/jobs', auth, upload, async (req, res) => {
    const file = req.file;
    if (!file) return fail(res, 400, 'multipart field "file" is required');
    if (file.mimetype !== 'application/pdf' || !file.buffer.subarray(0, 5).equals(PDF_MAGIC)) {
      return fail(res, 415, 'file must be a PDF (application/pdf starting with %PDF-)');
    }
    const { watermark: flag = 'true' } = req.body;
    if (flag !== 'true' && flag !== 'false') return fail(res, 400, 'watermark must be "true" or "false"');
    const watermark = flag === 'true';
    const recipients = parseRecipients(req.body.recipient, config.maxRecipients);
    if (typeof recipients === 'string') return fail(res, 400, recipients);
    if (watermark && recipients.length === 0) return fail(res, 400, 'at least one "recipient" is required when watermark is on');

    let pages;
    try {
      const doc = await openPdf(file.buffer);
      pages = doc.numPages;
      await doc.loadingTask.destroy();
    } catch (err) {
      return fail(res, 422, err.message);
    }
    if (pages > config.maxPages) return fail(res, 422, `too many pages (${pages} > ${config.maxPages})`);

    const jobId = await jobs.submit({ owner: req.owner, name: file.originalname, pdf: file.buffer, pages, recipients, watermark });
    res.status(202).location(`/v1/jobs/${jobId}`).json({ jobId, status: 'queued' });
  });

  app.get('/v1/jobs/:id', auth, async (req, res) => {
    const job = UUID.test(req.params.id) && (await jobs.view(req.params.id, req.owner));
    if (!job) return fail(res, 404, 'job not found');
    res.status(job.status === 'expired' ? 410 : 200).json(job);
  });

  // Local mode only: serves the HMAC-signed URLs that S3 presigning provides in AWS.
  if (storage.verify) {
    app.get('/v1/files/*key', (req, res) => {
      const file = storage.verify(req.params.key.join('/'), req.query);
      if (!file) return fail(res, 403, 'invalid or expired link');
      res.download(file, String(req.query.filename || 'document.pdf'), (err) => {
        if (err && !res.headersSent) fail(res, 404, 'file expired');
      });
    });
  }

  app.use((req, res) => fail(res, 404, 'not found'));
  // eslint-disable-next-line no-unused-vars -- Express recognises error handlers by arity
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) return fail(res, err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, err.message);
    console.error(JSON.stringify({ level: 'error', msg: 'request failed', path: req.path, err: err.message }));
    fail(res, 500, 'internal error');
  });

  return app;
}
