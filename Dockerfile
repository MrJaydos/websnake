FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN apk add --no-cache python3 make g++ && \
    npm ci --omit=dev && \
    apk del python3 make g++

COPY . .

ENV PORT=3000
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
