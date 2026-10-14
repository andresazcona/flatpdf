import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/http/app.js';
import { createRuntime } from '../src/runtime.js';
import { samplePdf } from '../scripts/sample-pdf.js';

const hash = (s) => createHash('sha256').update(s).digest('hex');
const KEY = 'test-key-1';
let dir, server, base, runtime;

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flatpdf-test-'));
  const config = loadConfig({
    DATA_DIR: dir,
    MAX_PAGES: '4',
    DPI: '72',
    API_KEY_SHA256: `${hash(KEY)},${hash('test-key-2')}`,
  });
  runtime = createRuntime(config);
  runtime.queue.consume((m) => runtime.jobs.process(m));
  server = createApp({ config, ...runtime }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  config.publicUrl = base; // download links are built from this
});

after(async () => {
  server.close();
  await fs.rm(dir, { recursive: true, force: true });
});

const form = (pdf, fields = {}, { type = 'application/pdf', name = 'report.pdf' } = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
  if (pdf) f.append('file', new Blob([pdf], { type }), name);
  return f;
};
const post = (body, key = KEY) => fetch(`${base}/v1/jobs`, { method: 'POST', body, headers: key ? { 'x-api-key': key } : {} });
const get = (p, key = KEY) => fetch(`${base}${p}`, { headers: key ? { 'x-api-key': key } : {} });

test('healthz is open', async () => {
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
});

test('requests without a valid API key are rejected', async () => {
  const pdf = await samplePdf(1);
  assert.equal((await post(form(pdf, { recipient: 'a' }), null)).status, 401);
  assert.equal((await post(form(pdf, { recipient: 'a' }), 'wrong-key')).status, 401);
  assert.equal((await get('/v1/jobs/00000000-0000-4000-8000-000000000000', null)).status, 401);
});

test('non-PDF uploads are rejected by content type and by magic bytes', async () => {
  const notPdf = Buffer.from('hello, I am a text file');
  assert.equal((await post(form(notPdf, { recipient: 'a' }, { type: 'text/plain', name: 'a.txt' }))).status, 415);
  assert.equal((await post(form(notPdf, { recipient: 'a' }))).status, 415, 'application/pdf label, wrong bytes');
  assert.equal((await post(form(await samplePdf(1), { recipient: 'a' }, { type: 'image/png' }))).status, 415, 'PDF bytes, wrong label');
  assert.equal((await post(form(null, { recipient: 'a' }))).status, 400, 'no file');
});

test('input validation: recipient rules and page limit', async () => {
  const pdf = await samplePdf(1);
  assert.equal((await post(form(pdf))).status, 400, 'watermark on needs a recipient');
  assert.equal((await post(form(pdf, { recipient: 'a', watermark: 'maybe' }))).status, 400);
  assert.equal((await post(form(await samplePdf(5), { recipient: 'a' }))).status, 422, 'over MAX_PAGES');
  assert.equal((await post(form(Buffer.from('%PDF-1.4 not really'), { recipient: 'a' }))).status, 422, 'corrupt PDF');
});

test('end to end: upload, poll, download one flattened copy per recipient', async () => {
  const res = await post(form(await samplePdf(2), { recipient: ['alice@example.com', 'bob@example.com'] }));
  assert.equal(res.status, 202);
  const { jobId } = await res.json();

  await runtime.queue.drain();
  const job = await (await get(`/v1/jobs/${jobId}`)).json();
  assert.equal(job.status, 'done');
  assert.equal(job.pages, 2);
  assert.deepEqual(job.outputs.map((o) => o.recipient), ['alice@example.com', 'bob@example.com']);

  for (const o of job.outputs) {
    const file = await fetch(o.url);
    assert.equal(file.status, 200);
    const bytes = Buffer.from(await file.arrayBuffer());
    assert.equal(hash(bytes), o.sha256);
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
  }

  const tampered = job.outputs[0].url.replace(/sig=[^&]+/, 'sig=AAAA');
  assert.equal((await fetch(tampered)).status, 403);
});

test('jobs are private to the key that created them', async () => {
  const { jobId } = await (await post(form(await samplePdf(1), { recipient: 'a' }))).json();
  assert.equal((await get(`/v1/jobs/${jobId}`, 'test-key-2')).status, 404);
  assert.equal((await get('/v1/jobs/not-a-uuid')).status, 404);
});
