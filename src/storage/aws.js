import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** S3 + SQS implementation of the same storage/queue interface as ./local.js. */
export function createAws(config) {
  const s3 = new S3Client({});
  const sqs = new SQSClient({});
  const buckets = { uploads: config.uploadsBucket, results: config.resultsBucket };

  const storage = {
    async put(bucket, key, body, contentType) {
      await s3.send(new PutObjectCommand({ Bucket: buckets[bucket], Key: key, Body: body, ContentType: contentType }));
    },
    async get(bucket, key) {
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: buckets[bucket], Key: key }));
        return Buffer.from(await res.Body.transformToByteArray());
      } catch (err) {
        if (err.name === 'NoSuchKey') return null; // needs s3:ListBucket, otherwise S3 answers 403
        throw err;
      }
    },
    async del(bucket, key) {
      await s3.send(new DeleteObjectCommand({ Bucket: buckets[bucket], Key: key }));
    },
    presign(key, ttlSec, filename) {
      const cmd = new GetObjectCommand({
        Bucket: buckets.results,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${filename}"`,
      });
      return getSignedUrl(s3, cmd, { expiresIn: ttlSec });
    },
  };

  const queue = {
    async send(message) {
      await sqs.send(new SendMessageCommand({ QueueUrl: config.queueUrl, MessageBody: JSON.stringify(message) }));
    },
  };

  return { storage, queue };
}
