# GitHub Contributions Worker

一个基于 Cloudflare Workers 的 API 服务，用于获取 GitHub 用户的贡献热力图数据。

## 功能特点

- 🎯 获取 GitHub 用户贡献热力图 HTML 片段
- ⚡ 使用 Cloudflare Workers 全球边缘网络，响应快速
- 🗄️ 内置 KV 缓存，减少重复请求
- 📅 支持自定义日期范围
- 🔧 TypeScript 编写，类型安全

## API 接口

### 获取贡献热力图 JSON 数据

```
GET /api/contributions/:username
```

**参数：**
- `username` (路径参数): GitHub 用户名
- `from` (查询参数，可选): 开始日期，格式 `YYYY-MM-DD`，默认为当前年份的1月1日
- `to` (查询参数，可选): 结束日期，格式 `YYYY-MM-DD`，默认为当前年份的12月31日

**示例请求：**
```bash
curl "https://your-worker.your-subdomain.workers.dev/api/contributions/octocat?from=2024-01-01&to=2024-12-31"
```

**响应格式：**
```json
{
  "total_contributions": 1568,
  "contributions": [
    {
      "date": "2024-07-28",
      "count": 15,
      "level": 3
    },
    {
      "date": "2024-07-29",
      "count": 8,
      "level": 2
    },
    {
      "date": "2024-07-30",
      "count": 0,
      "level": 0
    }
  ],
  "username": "octocat",
  "from": "2024-01-01",
  "to": "2024-12-31",
  "cached": false,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 获取贡献热力图 SVG 图像

```
GET /api/contributions/:username/svg
```

**参数：**
- `username` (路径参数): GitHub 用户名
- `from` (查询参数，可选): 开始日期，格式 `YYYY-MM-DD`，默认为当前年份的1月1日
- `to` (查询参数，可选): 结束日期，格式 `YYYY-MM-DD`，默认为当前年份的12月31日

**示例请求：**
```bash
curl "https://your-worker.your-subdomain.workers.dev/api/contributions/octocat/svg?from=2024-01-01&to=2024-12-31"
```

**使用示例：**
获取JSON数据：
```bash
curl https://your-worker.your-subdomain.workers.dev/api/contributions/octocat
```

获取SVG图像：
```bash
curl https://your-worker.your-subdomain.workers.dev/api/contributions/octocat/svg
```

在Markdown中嵌入SVG：
```markdown
![GitHub Contributions](https://your-worker.your-subdomain.workers.dev/api/contributions/octocat/svg)
```

**字段说明：**
- `total_contributions`: 总贡献数
- `contributions`: 每日贡献数据数组
  - `date`: 日期 (YYYY-MM-DD格式)
  - `count`: 当日贡献数量
  - `level`: 贡献等级 (0-4, 0表示无贡献，4表示最多)

### 健康检查

```
GET /health
```

## 本地开发

### 环境要求

- Node.js 16+
- npm 或 yarn
- Cloudflare 账户

### 安装步骤

1. 克隆项目：
```bash
git clone <repository-url>
cd github-contributions-worker
```

2. 安装依赖：
```bash
npm install
```

3. 配置 Wrangler：
```bash
npm run wrangler login
```

4. 创建 KV 命名空间：
```bash
npm run wrangler kv:namespace create "CACHE"
npm run wrangler kv:namespace create "CACHE" --preview
```

5. 更新 `wrangler.toml` 中的 KV 命名空间 ID

6. 本地开发：
```bash
npm run dev
```

## 部署

### 开发环境
```bash
npm run deploy --env development
```

### 生产环境
```bash
npm run deploy
```

## 项目结构

```
├── src/
│   └── index.ts          # 主程序入口
├── wrangler.toml        # Cloudflare Workers 配置
├── tsconfig.json        # TypeScript 配置
├── package.json         # 项目依赖
└── README.md           # 项目文档
```

## 缓存策略

- 使用 Cloudflare KV 存储缓存数据
- 缓存有效期：1小时（3600秒）
- 缓存键格式：`contributions:{username}:{from}:{to}`

## 错误处理

API 会返回适当的 HTTP 状态码和错误信息：

- `200 OK`: 成功获取数据
- `404 Not Found`: 路由不存在
- `500 Internal Server Error`: 服务器内部错误

错误响应格式：
```json
{
  "error": "错误描述",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License