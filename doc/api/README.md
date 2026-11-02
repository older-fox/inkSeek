# API 契约

- Base URL：`http://localhost:3100/api/v1`
- Swagger UI：`http://localhost:3100/api/docs`
- 内容类型：`application/json`
- 鉴权：HttpOnly Cookie `inkseek_session`（登录/初始化成功后由服务端下发）

## 错误格式

所有错误由全局异常过滤器统一为：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数不合法",
    "fieldErrors": {
      "redis.host": "无法连接到该 Redis 地址"
    }
  }
}
```

`fieldErrors` 仅在字段级错误时出现，键为点分路径，前端据此定位表单字段。

常见 `code`：

| code                  | HTTP | 说明             |
| --------------------- | ---- | ---------------- |
| `VALIDATION_ERROR`    | 400  | Zod 校验失败     |
| `REDIS_UNREACHABLE`   | 400  | Redis 探活失败   |
| `INVALID_CREDENTIALS` | 401  | 用户名或密码错误 |
| `UNAUTHORIZED`        | 401  | 未登录或会话失效 |
| `ALREADY_INITIALIZED` | 409  | 系统已完成初始化 |
| `NOT_FOUND`           | 404  | 资源不存在       |
| `INTERNAL_ERROR`      | 500  | 未预期错误       |

## 端点

### GET /health

健康检查，访问数据库后返回服务状态。

```json
{ "status": "ok", "service": "inkseek-api", "time": "2026-11-02T11:38:32.081Z" }
```

### GET /bootstrap/status

```json
{ "initialized": false }
```

### POST /bootstrap/test-redis

请求体（`redisConnectionSchema`）：

```json
{ "host": "10.1.3.15", "port": 6379, "db": 0, "password": "", "tls": false }
```

成功：`{ "ok": true, "latencyMs": 17 }`
失败：400 `REDIS_UNREACHABLE`，`fieldErrors["redis.host"]` 给出提示。

### POST /bootstrap

仅当系统未初始化时可用。

```json
{
  "redis": { "host": "10.1.3.15", "port": 6379, "db": 0, "tls": false },
  "admin": {
    "username": "admin",
    "displayName": "Administrator",
    "password": "changeme123"
  }
}
```

- 用户名：3–32 位，仅字母、数字、`_`、`-`。
- 密码：8–72 位，至少包含一个字母和一个数字。
- 成功：200 `{ "user": { "id", "username", "displayName", "role" } }`，并下发会话 Cookie。
- 已初始化：409 `ALREADY_INITIALIZED`。

### POST /auth/login

```json
{ "username": "admin", "password": "changeme123" }
```

- 成功：200 `{ "user": { ... } }`，下发会话 Cookie。
- 失败：401 `INVALID_CREDENTIALS`。

### GET /auth/me

需要会话。成功：200 `{ "user": { ... } }`；无会话：401 `UNAUTHORIZED`。

### POST /auth/logout

需要会话。成功：204，清除 Cookie 并吊销数据库会话。

## 共享类型

请求/响应 schema 与 DTO 定义在 `packages/shared/src`，API 与 Web 均直接引用，修改契约时请先改共享包。
