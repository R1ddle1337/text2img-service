# Text2Img Service

基于 Puppeteer + TailwindCSS 的文本转图片渲染服务，输出 PNG。

## 功能特性

- 统一模板设计，适配多种内容形态
- 内置中文与 Emoji 字体
- Docker 运行，接口稳定、部署简单
- 模板可挂载覆盖，修改后无需重启容器

## 快速开始（GHCR）

启动服务（推荐 Docker Compose）：
```bash
docker compose -f docker-compose.ghcr.yml up -d
```

健康检查：
```bash
curl http://localhost:51234/health
```

查看日志：
```bash
docker compose -f docker-compose.ghcr.yml logs -f
```

也可以直接运行容器：
```bash
docker run -d --name text2img-service -p 51234:51234 ghcr.io/r1ddle1337/riddletext2img:latest
```
如需固定版本，将 `latest` 替换为实际 tag（如 `v1.0.0`）。

## Docker Compose 说明

仓库内提供 `docker-compose.ghcr.yml`，默认从 GHCR 拉取镜像并启动。  
如需自定义模板，取消注释 volume 映射：`./templates:/app/templates`  
端口映射修改见 `docker-compose.ghcr.yml` 的 `ports`。

## 服务器快速部署

适合没有本地 Docker 的情况，直接在服务器上拉镜像运行。

1. 服务器安装 Docker 和 Docker Compose 插件
2. 下载 `docker-compose.ghcr.yml` 并启动
```bash
mkdir -p /opt/text2img-service
cd /opt/text2img-service
curl -fsSL https://raw.githubusercontent.com/R1ddle1337/text2img-service/main/docker-compose.ghcr.yml -o docker-compose.ghcr.yml
docker compose -f docker-compose.ghcr.yml up -d
```
3. 验证服务
```bash
curl http://localhost:51234/health
```

## API

### 健康检查
```
GET /health
```
响应：`{"status":"ok","timestamp":"..."}`

### 通用渲染
```
POST /render
Content-Type: application/json
```
字段（按需选填）：
- `title`
- `subtitle`
- `icon`
- `weekday`
- `items`（数组）
- `content`（字符串）
- `table`（数组对象）
- `stats`（对象）
- `quote`
- `sources`

### 预设业务接口

| 接口 | 说明 | 参数 |
| --- | --- | --- |
| `POST /api/fabing` | 发病语录 | `{ saying }` |
| `POST /api/kfc` | KFC 文案 | `{ text }` |
| `POST /api/gold` | 黄金价格 | `{ date, metals, stores, recycle }` |
| `POST /api/luck` | 运势 | `{ luck_desc, luck_rank, luck_tip }` |
| `POST /api/universal` | 通用内容 | `{ title, content, icon? }` |

### 请求示例

```bash
curl -X POST http://localhost:51234/api/universal \
  -H "Content-Type: application/json" \
  -d '{"title":"AI 资讯","content":"1. 标题一\n2. 标题二"}' \
  --output ai_news.png
```

```bash
curl -X POST http://localhost:51234/render \
  -H "Content-Type: application/json" \
  -d '{
    "title": "每日 60s 读懂世界",
    "icon": "📰",
    "items": ["新闻1", "新闻2", "新闻3"],
    "quote": "人生不是等待风暴过去，而是学会在雨中起舞。"
  }' \
  --output news.png
```

### 最小可用请求

```bash
curl -X POST http://localhost:51234/api/universal \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello","content":"Just a test."}' \
  --output out.png
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `51234` | 服务端口 |

### 最小化配置示例

`.env`：
```bash
PORT=51234
```

如果你修改了 `PORT`，需要同步调整容器端口映射，例如：
```yaml
ports:
  - "3000:3000"
environment:
  - PORT=3000
```

## 发布到 GHCR（GitHub Actions）

已内置发布工作流：`.github/workflows/publish-ghcr.yml`。

1. 推送代码到 GitHub
2. 打 tag 并推送（示例）
```bash
git tag v1.0.0
git push origin v1.0.0
```
3. 在 GitHub Actions 中查看 `Publish to GHCR` 是否成功
4. 第一次发布后，在 GitHub Packages 将镜像可见性设置为 `Public`

镜像地址：
`ghcr.io/r1ddle1337/riddletext2img`

## 模板说明

默认模板：`templates/universal.ejs`  
如需覆盖模板，使用 volume 映射：`./templates:/app/templates`

## 本地开发

```bash
npm install
npm run dev
```

本地运行需要安装 Chromium：
```bash
npx puppeteer browsers install chrome
```

## License

MIT
