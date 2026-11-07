#!/bin/sh
set -eu

# Nginx 负责前端静态文件与 /api 反向代理；API 是主进程，退出即结束容器。
nginx
exec node dist/main.js
