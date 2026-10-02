FROM node:20-alpine AS development

WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace backend
COPY backend ./backend
WORKDIR /app/backend
EXPOSE 4000
CMD ["npm", "run", "dev"]

FROM node:20-alpine AS production-dependencies

WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace backend --omit=dev

FROM node:20-alpine AS production

ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node backend/package.json ./backend/package.json
COPY --chown=node:node backend/src ./backend/src
COPY --chown=node:node backend/migrations ./backend/migrations
COPY --chown=node:node backend/scripts ./backend/scripts
WORKDIR /app/backend
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
