FROM docker.xuanyuan.run/node:22-alpine AS build
ENV COREPACK_HOME=/pnpm/corepack
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=bind,source=.,target=/source,readonly if [ -d /source/vendor ]; then cp -a /source/vendor /workspace/vendor; fi
RUN --mount=type=cache,id=openxiangda-corepack-v1,target=/pnpm/corepack,sharing=locked \
    --mount=type=cache,id=openxiangda-pnpm-v1,target=/pnpm/store,sharing=locked \
    --mount=type=cache,id=openxiangda-pnpm-metadata-v1,target=/root/.cache/pnpm,sharing=locked \
    pnpm --filter @app/server --filter @app/contracts install --frozen-lockfile --prefer-offline --store-dir=/pnpm/store --ignore-scripts
COPY apps/server apps/server
COPY packages/contracts packages/contracts
RUN --mount=type=cache,id=openxiangda-corepack-v1,target=/pnpm/corepack,sharing=locked \
    pnpm --filter @app/server... build
RUN --mount=type=cache,id=openxiangda-corepack-v1,target=/pnpm/corepack,sharing=locked \
    --mount=type=cache,id=openxiangda-pnpm-v1,target=/pnpm/store,sharing=locked \
    --mount=type=cache,id=openxiangda-pnpm-metadata-v1,target=/root/.cache/pnpm,sharing=locked \
    pnpm --filter @app/server deploy --prod --legacy --prefer-offline --store-dir=/pnpm/store --ignore-scripts /output

FROM docker.xuanyuan.run/node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=1000:1000 /output /app
USER 1000:1000
EXPOSE 3000
CMD ["node", "dist/main.js"]
