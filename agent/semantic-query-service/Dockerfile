FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY agent/semantic-query-service ./agent/semantic-query-service

EXPOSE 8787

CMD ["node", "agent/semantic-query-service/server.js"]

