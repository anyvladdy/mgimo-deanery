FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    SCHOOL_CLOCK=real \
    DEANERY_DB=/data/deanery.sqlite

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY demo ./demo
COPY deploy/create-admin.mjs ./deploy/create-admin.mjs

RUN mkdir -p /data && chown node:node /data
COPY --chown=node:node data/production.sqlite /data/deanery.sqlite
USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
