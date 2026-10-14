# syntax=docker/dockerfile:1
# One Dockerfile, two images (docker build --target api|worker). Both share the dependency stage.
# @napi-rs/canvas ships prebuilt glibc binaries, so no compiler or system libraries are needed.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# SQS-triggered Lambda: AWS base image supplies the runtime interface client.
FROM public.ecr.aws/lambda/nodejs:22 AS worker
WORKDIR ${LAMBDA_TASK_ROOT}
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
CMD ["src/worker/lambda.handler"]

# HTTP API for ECS Fargate (or any container host), non-root.
FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "src/server.js"]
