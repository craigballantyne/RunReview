# Build context is the repo root (docker-compose.yml: context: ., dockerfile: packages/web/Dockerfile).

FROM node:20-alpine AS base
WORKDIR /workspace
COPY package.json package-lock.json* ./
COPY packages/web/package.json packages/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
RUN npm install

FROM base AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace", "packages/web", "--", "--host"]

FROM base AS build
COPY . .
RUN npm run build --workspace packages/shared
RUN npm run build --workspace packages/web

FROM nginx:alpine AS prod
COPY --from=build /workspace/packages/web/dist /usr/share/nginx/html
EXPOSE 80
