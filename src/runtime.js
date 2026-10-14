import { createAws } from './storage/aws.js';
import { createLocal } from './storage/local.js';
import { createJobs } from './jobs.js';

/**
 * The single seam between local and AWS: QUEUE_URL set means S3 + SQS, otherwise local disk
 * and an in-process queue. Everything above this (jobs, pdf, http) is identical in both modes.
 */
export function createRuntime(config) {
  const backend = config.queueUrl ? createAws(config) : createLocal(config);
  const { storage, queue } = backend;
  return { storage, queue, sweep: backend.sweep, jobs: createJobs({ config, storage, queue }) };
}
