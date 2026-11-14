FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY web ./web
RUN mkdir -p /app/data && chown -R node:node /app/data
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
