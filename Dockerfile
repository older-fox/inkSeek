# syntax=docker/dockerfile:1
#
# inkSeek Platform 单容器镜像：Nginx 对外暴露 3000，Nest API 仅监听回环 127.0.0.1:3100。
#
# 构建约束：
#   · GitLab Runner 是容器内 runner，没有 docker daemon / dind 权限：CI 用 kaniko 构建并推送。
#   · 所有外部依赖都走可覆盖的加速地址（见下方 build args / .gitlab-ci.yml 变量）。
#   · 运行镜像只带 production 依赖；Prisma Client 在构建阶段生成并编译进 dist。
#
# 目标：
#   runtime：对外仅 3000（Nginx），API 仅内部 127.0.0.1:3100，挂载 /app/data 持久化聊天媒体；
#   容器启动时自动执行 `prisma migrate deploy`，无需单独的迁移镜像。
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

# 只拷清单：package.json / lockfile 不变时依赖安装层可复用。
# schema 刻意不放这里：它随迁移频繁变化，放进来会让安装层每次都失效。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY scripts ./scripts
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# 此刻还没有 schema，根 postinstall 会跳过 Prisma 生成（scripts/postinstall.mjs）；
# 生成挪到下面 schema 拷贝之后，改模型/加迁移只重跑一次 generate。
# --mount=type=cache 在本地 BuildKit 生效；kaniko 会忽略它（构建不会失败）。
RUN --mount=type=cache,target=/pnpm-store \
    pnpm install --frozen-lockfile

COPY apps/api/prisma.config.ts ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm db:generate

# 源码放在依赖之后 COPY：改业务代码不会让依赖层失效。
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY apps/web/tsconfig.json apps/web/vite.config.ts apps/web/index.html ./apps/web/
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json ./apps/api/
COPY apps/api/src ./apps/api/src

# turbo 会先构建 shared，再构建 api / web；web 的 tsc --noEmit 也在 build 里执行。
# 构建后拦一道：dist 里若残留 `.ts` 相对导入说明 Prisma Client 被按 `.ts` 生成过，
# Node ESM 在运行期会 ERR_MODULE_NOT_FOUND。宁可构建失败，也不要打出坏镜像。
RUN set -eu; \
    pnpm build; \
    if grep -rlE "from ['\"]\.{1,2}/[^'\"]*\.ts['\"]" apps/api/dist >/dev/null; then \
      echo "error: apps/api/dist contains .ts import specifiers (Prisma Client generated without importFileExtension=js)" >&2; \
      exit 1; \
    fi

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

# ---------- 运行镜像：Nginx + Node API（启动时自动迁移） ----------
FROM ${NODE_IMAGE} AS runtime
ARG APT_MIRROR=http://mirrors.aliyun.com
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
ARG PRISMA_VERSION=7.10.1
# 与本地 `apps/api` 一致：ConfigModule 会从 ../../.env 读取，挂载 /app/.env 也能生效。
WORKDIR /app/apps/api
# HOME 指到数据卷：adb 的配对密钥落在 $HOME/.android，容器重建后不用重新配对。
ENV NODE_ENV=production \
    HOME=/app/data

# Nginx 托管前端，/api 反代 API；ffmpeg 供视频抽帧/照片缩放，adb 供手机焦点使用；
# chromium 供心智的无头浏览器工具（browser.*）使用，中文字体避免截图与正文出现方框。
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
    apt-get install -y --no-install-recommends \
      ca-certificates nginx ffmpeg adb \
      chromium fonts-noto-cjk fonts-liberation; \
    rm -rf /var/lib/apt/lists/*; \
    rm -f /etc/nginx/sites-enabled/default

# 启动即自动迁移：把 Prisma CLI + schema/migrations 内嵌进运行镜像，由 entrypoint 在启动
# API 前执行 `prisma migrate deploy`（幂等，只应用未执行的迁移）。版本升级换镜像即可，不再
# 需要单独跑 migrate 镜像。代价是运行镜像多一份 Prisma CLI/引擎体积。
RUN set -eu; \
    mkdir -p /app/migrate; \
    cd /app/migrate; \
    printf '{"type":"module","private":true}\n' > package.json; \
    PRISMA_ENGINES_MIRROR="$PRISMA_ENGINES_MIRROR" \
    PRISMA_SKIP_POSTINSTALL_GENERATE=true \
    npm install --no-audit --no-fund --registry "$NPM_REGISTRY" prisma@${PRISMA_VERSION}
COPY apps/api/prisma.config.ts /app/migrate/prisma.config.ts
COPY apps/api/prisma /app/migrate/prisma

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
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
