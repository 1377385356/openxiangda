FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN node -e "const fs=require('node:fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); delete p.devDependencies; fs.writeFileSync('package.json', JSON.stringify(p));"
RUN pnpm --filter @app/server --filter @app/contracts install --no-frozen-lockfile --ignore-scripts
COPY apps/server apps/server
COPY packages/contracts packages/contracts
RUN pnpm --filter @app/server... build
RUN pnpm --filter @app/server deploy --prod --legacy --ignore-scripts /output

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=1000:1000 /output /app
USER 1000:1000
EXPOSE 3000
CMD ["node", "dist/main.js"]
