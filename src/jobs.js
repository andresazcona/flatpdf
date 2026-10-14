import { randomUUID } from 'node:crypto';
import { flatten } from './pdf/flatten.js';
import { PermanentError } from './pdf/rasterize.js';

// Job state is a small JSON object next to the results (jobs/<id>.json), so the only moving
// parts are storage and a queue: no database to run, and it expires with the results.
const jobKey = (id) => `jobs/${id}.json`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const log = (level, msg, fields) => console[level](JSON.stringify({ level, msg, ...fields }));

export function createJobs({ config, storage, queue }) {
  const read = async (id) => {
    const raw = await storage.get('results', jobKey(id));
    return raw && JSON.parse(raw);
  };
  const write = (job) =>
    storage.put('results', jobKey(job.id), JSON.stringify({ ...job, updatedAt: new Date().toISOString() }), 'application/json');

  return {
    async submit({ owner, name, pdf, pages, recipients, watermark }) {
      const id = randomUUID();
      const now = Date.now();
      await storage.put('uploads', `${id}.pdf`, pdf, 'application/pdf');
      await write({
        id,
        owner,
        name: slug(name.replace(/\.pdf$/i, '')) || 'document',
        status: 'queued',
        pages,
        recipients,
        watermark,
        attempts: 0,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + config.resultTtlSec * 1000).toISOString(),
      });
      await queue.send({ jobId: id });
      log('info', 'job queued', { jobId: id, pages, copies: watermark ? recipients.length : 1 });
      return id;
    },

    /** Public view of a job, with fresh expiring download URLs once it is done. */
    async view(id, owner) {
      const job = await read(id);
      if (!job || job.owner !== owner) return null;
      const { status, pages, createdAt, updatedAt, expiresAt, error } = job;
      const view = { id, status, pages, createdAt, updatedAt, expiresAt, ...(error && { error }) };
      if (Date.now() > Date.parse(expiresAt)) return { ...view, status: 'expired' };
      if (status === 'done') {
        const urlExpiresAt = new Date(Date.now() + config.urlTtlSec * 1000).toISOString();
        view.outputs = await Promise.all(
          job.outputs.map(async (o) => ({
            recipient: o.recipient,
            bytes: o.bytes,
            sha256: o.sha256,
            url: await storage.presign(o.key, config.urlTtlSec, `${[job.name, o.recipient && slug(o.recipient)].filter(Boolean).join('-')}.pdf`),
            urlExpiresAt,
          })),
        );
      }
      return view;
    },

    /** Queue consumer. Idempotent: SQS delivers at least once. Rethrows only errors worth retrying. */
    async process({ jobId }) {
      let job = await read(jobId);
      if (!job || job.status === 'done') return;
      job = { ...job, status: 'processing', attempts: job.attempts + 1 };
      await write(job);
      const started = Date.now();
      try {
        const input = await storage.get('uploads', `${jobId}.pdf`);
        if (!input) throw new PermanentError('input expired before processing');
        const copies = await flatten(input, {
          recipients: job.recipients,
          watermark: job.watermark,
          dpi: config.dpi,
          quality: config.jpegQuality,
          maxPages: config.maxPages,
        });
        const outputs = [];
        for (const [i, c] of copies.entries()) {
          const key = `${jobId}/${i + 1}.pdf`;
          await storage.put('results', key, c.bytes, 'application/pdf');
          outputs.push({ recipient: c.recipient, key, bytes: c.bytes.length, sha256: c.sha256 });
        }
        await write({ ...job, status: 'done', outputs, error: undefined });
        await storage.del('uploads', `${jobId}.pdf`);
        log('info', 'job done', { jobId, pages: job.pages, copies: outputs.length, ms: Date.now() - started });
      } catch (err) {
        const failed = err.permanent || job.attempts >= config.maxAttempts;
        await write({ ...job, status: failed ? 'failed' : 'queued', error: err.permanent ? err.message : 'internal error' });
        log('error', 'job error', { jobId, attempt: job.attempts, permanent: !!err.permanent, err: err.message });
        if (!err.permanent) throw err;
      }
    },
  };
}
