# Build context is the repo root (docker-compose.yml: context: ., dockerfile: packages/api/Dockerfile)
# so npm workspaces resolve correctly across packages/shared and packages/api.

FROM node:20-alpine AS base
# Prisma's query engine needs libssl to load; plain node:20-alpine ships neither openssl nor
# libssl, which makes Prisma's OpenSSL auto-detection fail and fall back to a mismatched guess.
RUN apk add --no-cache openssl
WORKDIR /workspace
COPY package.json package-lock.json* ./
COPY packages/api/package.json packages/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm install

FROM base AS dev
COPY . .
RUN npx prisma generate --schema packages/api/prisma/schema.prisma
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace", "packages/api"]

FROM base AS build
COPY . .
RUN npx prisma generate --schema packages/api/prisma/schema.prisma
RUN npm run build --workspace packages/api

FROM node:20-alpine AS prod
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/package.json ./package.json
COPY --from=build /workspace/packages/shared ./packages/shared
COPY --from=build /workspace/packages/api/dist ./packages/api/dist
COPY --from=build /workspace/packages/api/prisma ./packages/api/prisma
COPY --from=build /workspace/packages/api/package.json ./packages/api/package.json
EXPOSE 3000
CMD ["node", "packages/api/dist/server.js"]
