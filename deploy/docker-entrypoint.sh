#!/bin/sh
set -eu

# 启动即自动迁移：先应用待执行的数据库迁移，再启动 Nginx 与 API。
# `prisma migrate deploy` 幂等，只应用尚未执行的迁移；失败则退出，容器不会带着旧 schema 启动。

# DATABASE_URL 优先取容器环境变量；缺失时回退到挂载的 /app/.env（去掉外层引号）。
if [ -z "${DATABASE_URL:-}" ] && [ -f /app/.env ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' /app/.env | tail -n1 | cut -d= -f2- \
    | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
  export DATABASE_URL
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] DATABASE_URL 未设置，无法执行迁移" >&2
  exit 1
fi

# 数据库可能比容器晚就绪：迁移失败时有限次重试，避免首次部署抖一下起不来。
attempt=1
max=10
applied=0
while [ "$attempt" -le "$max" ]; do
  echo "[entrypoint] prisma migrate deploy（第 $attempt/$max 次）"
  if ( cd /app/migrate && ./node_modules/.bin/prisma migrate deploy ); then
    applied=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 3
done

if [ "$applied" -ne 1 ]; then
  echo "[entrypoint] 数据库迁移连续 $max 次失败，终止启动" >&2
  exit 1
fi

# Nginx 负责前端静态文件与 /api 反向代理；API 是主进程，退出即结束容器。
nginx
exec node dist/main.js
