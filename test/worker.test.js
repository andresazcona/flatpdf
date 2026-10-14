import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createRuntime } from '../src/runtime.js';
import { samplePdf } from '../scripts/sample-pdf.js';

test('SQS handler processes queued jobs and reports only the failing messages', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flatpdf-worker-'));
  process.env.DATA_DIR = dir;
  process.env.DPI = '72';
  const { handler } = await import('../src/worker/lambda.js');

  // The API side: store the upload and the job record. No consumer is attached, so nothing runs yet.
  const { jobs } = createRuntime(loadConfig({ DATA_DIR: dir }));
  const jobId = await jobs.submit({ owner: 'o', name: 'a.pdf', pdf: await samplePdf(2), pages: 2, recipients: ['a@example.com'], watermark: true });
  assert.equal((await jobs.view(jobId, 'o')).status, 'queued');

  const result = await handler({
    Records: [
      { messageId: 'ok', body: JSON.stringify({ jobId }) },
      { messageId: 'bad-json', body: '{not json' },
    ],
  });
  assert.deepEqual(result, { batchItemFailures: [{ itemIdentifier: 'bad-json' }] });
  assert.equal((await jobs.view(jobId, 'o')).status, 'done');
  await fs.rm(dir, { recursive: true, force: true });
});
