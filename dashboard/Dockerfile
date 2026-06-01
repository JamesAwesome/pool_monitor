FROM node:22.22.3-slim AS build

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG VITE_APP_TITLE="Pool Dashboard"
ENV VITE_APP_TITLE=${VITE_APP_TITLE}
RUN pnpm build

FROM node:22.22.3-slim

RUN apt-get update && apt-get install -y --no-install-recommends fontconfig && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
COPY server/fonts ./dist/server/fonts

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Run as the unprivileged 'node' user that the base image already provides.
# /app is owned by root and only read at runtime, so no chown is needed.
USER node

CMD ["node", "dist/server/index.js"]
