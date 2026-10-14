import { loadConfig } from '../config.js';
import { createRuntime } from '../runtime.js';

const { jobs } = createRuntime(loadConfig());

/**
 * SQS-triggered handler. Reports partial batch failures so only the messages that threw are
 * retried (and eventually land in the DLQ); the event source mapping must set
 * function_response_types = ["ReportBatchItemFailures"].
 */
export async function handler(event) {
  const batchItemFailures = [];
  for (const record of event.Records) {
    try {
      await jobs.process(JSON.parse(record.body));
    } catch {
      batchItemFailures.push({ itemIdentifier: record.messageId }); // jobs.process already logged the cause
    }
  }
  return { batchItemFailures };
}
