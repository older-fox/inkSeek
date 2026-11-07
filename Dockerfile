# syntax=docker/dockerfile:1
#
# inkSeek Platform 单容器镜像：Nginx 提供 web 静态文件，Nest API 监听 127.0.0.1:3100。
#
# 构建约束：
#   · GitLab Runner 是容器内 runner，没有 docker daemon / dind 权限：CI 用 kaniko 构建并推送。
#   · 所有外部依赖都走可覆盖的加速地址（见下方 build args / .gitlab-ci.yml 变量）。
#   · 运行镜像只带 production 依赖；Prisma Client 在构建阶段生成并编译进 dist。
#
# 目标（CI 分别构建）：
#   runtime（默认）：Nginx:80 + API:3100，挂载 /app/data 持久化聊天媒体
#   migrate：只含 Prisma CLI + schema/migrations，部署时一次性执行 prisma migrate deploy
#
# 加速 build args（CI 中同名变量可覆盖）：
#   NODE_IMAGE            基础镜像，默认 Docker Hub 加速域名
#   NPM_REGISTRY          npm 源，默认 npmmirror
#   APT_MIRROR            Debian apt 源，默认阿里云 http 镜像（Nginx / ffmpeg / adb 安装用）
#   PRISMA_ENGINES_MIRROR Prisma 引擎下载镜像，默认 npmmirror
#   PNPM_VERSION / PRISMA_VERSION 版本锁定，避免 CI 与本地漂移

ARG NODE_IMAGE=docker.1ms.run/library/node:24-bookworm-slim
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
ARG PNPM_VERSION=12.11.2
ARG PRISMA_VERSION=7.10.1

# ---------- 基础层：pnpm + 加速源 ----------
# 刻意不在这里放 WORKDIR：被继承的父阶段带 WORKDIR 会让 kaniko 的层缓存
# 在每个子阶段失效（目录 mtime 每次都变），子阶段的缓存就永远命不中。
FROM ${NODE_IMAGE} AS base
ARG NPM_REGISTRY
ARG PRISMA_ENGINES_MIRROR
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    PRISMA_ENGINES_MIRROR=${PRISMA_ENGINES_MIRROR}
RUN set -eu; \
    npm install -g pnpm@${PNPM_VERSION} --registry "$NPM_REGISTRY" --no-audit --no-fund; \
    pnpm config set registry "$NPM_REGISTRY"; \
    pnpm config set store-dir /pnpm-store

# ---------- 构建：安装全部依赖 → 生成 Prisma Client → turbo build ----------
FROM base AS build
WORKDIR /app

# prisma generate 只读 schema，不会连接数据库；给一个占位值满足 prisma.config.ts 的 env()。
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build

# 先只拷清单和 Prisma schema：package.json / lock 不变时，pnpm install 层可复用。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/prisma.config.ts ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# 根 postinstall 会执行 pnpm db:generate；schema 已在上下文里，可以直接生成。
# --mount=type=cache 在本地 BuildKit 生效；kaniko 会忽略它（构建不会失败）。
RUN --mount=type=cache,target=/pnpm-store \
    pnpm install --frozen-lockfile

# 源码放在依赖之后 COPY：改业务代码不会让依赖层失效。
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY apps/web/tsconfig.json apps/web/vite.config.ts apps/web/index.html ./apps/web/
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json ./apps/api/
COPY apps/api/src ./apps/api/src

# turbo 会先构建 shared，再构建 api / web；web 的 tsc --noEmit 也在 build 里执行。
RUN pnpm build

# ---------- 运行期依赖：仅 production ----------
FROM base AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
# --ignore-scripts：根 postinstall 需要 prisma CLI（devDependency），运行期不需要，
# 也不能在这里重新生成（生成的客户端已编译进 dist）。esbuild / tailwind 也不需要运行。
RUN --mount=type=cache,target=/pnpm-store \
    pnpm install --frozen-lockfile --prod --ignore-scripts

# ---------- 运行镜像：Nginx + Node API ----------
FROM ${NODE_IMAGE} AS runtime
ARG APT_MIRROR=http://mirrors.aliyun.com
# 与本地 `apps/api` 一致：ConfigModule 会从 ../../.env 读取，挂载 /app/.env 也能生效。
WORKDIR /app/apps/api
# HOME 指到数据卷：adb 的配对密钥落在 $HOME/.android，容器重建后不用重新配对。
ENV NODE_ENV=production \
    HOME=/app/data

# Nginx 托管前端，/api 反代 API；ffmpeg 供视频抽帧/照片缩放，adb 供手机焦点使用。
# 镜像源不可强依赖单一站点：清华等镜像会对部分机房 IP 返回 403，所以按
# APT_MIRROR → 阿里云 → 中科大 → 华为云 → Debian 官方 的顺序逐个尝试，第一个
# apt-get update 成功的源用于后续安装。每次尝试前恢复原始 sources，避免多次 sed 叠加。
RUN set -eux; \
    cp /etc/apt/sources.list /tmp/sources.list.orig 2>/dev/null || true; \
    cp /etc/apt/sources.list.d/debian.sources /tmp/debian.sources.orig 2>/dev/null || true; \
    ok=0; \
    for base in "${APT_MIRROR:-}" \
                http://mirrors.aliyun.com \
                http://mirrors.cloud.tencent.com \
                http://mirrors.ustc.edu.cn \
                http://mirrors.163.com \
                http://repo.huaweicloud.com \
                http://deb.debian.org; do \
      [ -n "$base" ] || continue; \
      echo ">>> trying apt mirror: $base"; \
      if [ -f /tmp/sources.list.orig ]; then cp /tmp/sources.list.orig /etc/apt/sources.list; fi; \
      if [ -f /tmp/debian.sources.orig ]; then cp /tmp/debian.sources.orig /etc/apt/sources.list.d/debian.sources; fi; \
      for f in /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources; do \
        [ -f "$f" ] || continue; \
        sed -i "s|http://security.debian.org/debian-security|${base}/debian-security|g; \
                s|https://security.debian.org/debian-security|${base}/debian-security|g; \
                s|http://deb.debian.org/debian-security|${base}/debian-security|g; \
                s|https://deb.debian.org/debian-security|${base}/debian-security|g; \
                s|http://deb.debian.org/debian|${base}/debian|g; \
                s|https://deb.debian.org/debian|${base}/debian|g" "$f"; \
      done; \
      rm -rf /var/lib/apt/lists/*; \
      if apt-get update; then ok=1; break; fi; \
    done; \
    [ "$ok" = 1 ] || { echo "all apt mirrors failed" >&2; exit 1; }; \
    apt-get install -y --no-install-recommends ca-certificates nginx ffmpeg adb; \
    rm -rf /var/lib/apt/lists/*; \
    rm -f /etc/nginx/sites-enabled/default

# pnpm 的 node_modules 是符号链接农场：根 .pnpm、各 workspace 的 node_modules 都要保留，
# 相对链接才能解析到 @inkseek/shared 与 @prisma/client。
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=prod-deps /app/packages/shared/node_modules /app/packages/shared/node_modules
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/packages/shared/dist /app/packages/shared/dist
COPY --from=build /app/apps/web/dist /app/apps/web/dist
COPY apps/api/package.json /app/apps/api/package.json
COPY packages/shared/package.json /app/packages/shared/package.json

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh; \
    mkdir -p /app/data/chat; \
    nginx -t

# 聊天图片 / 语音 / 表情 / 卡片背景都在 /app/data 下，部署时必须挂卷。
VOLUME ["/app/data"]
EXPOSE 80 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# ---------- 迁移镜像：独立一次性任务，不把 Prisma CLI 塞进运行镜像 ----------
FROM ${NODE_IMAGE} AS migrate
ARG NPM_REGISTRY
ARG PRISMA_ENGINES_MIRROR
ARG PRISMA_VERSION
WORKDIR /app/apps/api
# prisma.config.ts 是 ESM；npm 安装 prisma 时也不需要跑 generate（此时还没有 schema）。
ENV PRISMA_ENGINES_MIRROR=${PRISMA_ENGINES_MIRROR} \
    PRISMA_SKIP_POSTINSTALL_GENERATE=true
RUN set -eu; \
    printf '{"type":"module","private":true}\n' > package.json; \
    npm install --no-audit --no-fund --registry "$NPM_REGISTRY" prisma@${PRISMA_VERSION}
COPY apps/api/prisma.config.ts ./prisma.config.ts
COPY apps/api/prisma ./prisma
# 运行方式：docker run --rm -e DATABASE_URL=... <image>/migrate
ENTRYPOINT ["/app/apps/api/node_modules/.bin/prisma", "migrate", "deploy"]
