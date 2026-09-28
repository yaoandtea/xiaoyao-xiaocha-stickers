# 小遥×小茶表情包 MCP

一个可被 ChatGPT 调用的 MCP Apps 表情包服务：先用 `sticker_search` 按语境搜索，再用 `sticker_pick` 在聊天中显示图片卡片。

## 已接入的资源

- 表情包清单：<https://yaoandtea.github.io/xiaoyao-xiaocha-stickers/stickers.json>
- 图片资源域名：`https://yaoandtea.github.io`
- 当前表情数量：22

## 本地运行

```powershell
npm install
npm test
npm start
```

服务启动后：

- MCP 地址：`http://localhost:8787/mcp`
- 健康检查：`http://localhost:8787/health`

另开一个终端运行完整连通测试：

```powershell
npm run smoke
```

## 工具

### `sticker_search`

输入：

```json
{ "query": "贴贴", "limit": 5 }
```

返回匹配的候选表情，包含 `id`、名称、标签、图片地址和匹配分数。

### `sticker_pick`

输入：

```json
{ "id": "sticker-id-from-search" }
```

返回选中的表情数据，并让 ChatGPT 加载 MCP UI 图片卡片。

## 接入 ChatGPT

ChatGPT 需要一个公网可访问的 HTTPS `/mcp` 地址。项目同时提供两种运行入口：

- `server.js`：本地 Node.js 调试，运行 `npm start`
- `worker.js`：Cloudflare Workers 公网部署，运行 `npm run deploy:worker`

Cloudflare 部署配置在 `wrangler.jsonc`。部署完成后的连接地址形如：

```text
https://xiaoyao-xiaocha-sticker-mcp.你的子域名.workers.dev/mcp
```

健康检查地址为相同域名下的 `/health`。

连接后可以这样测试：

> 搜索一张适合“宝宝我想贴贴”的表情包，选最合适的一张显示出来。

实现遵循 OpenAI 的 [Apps SDK 快速开始](https://developers.openai.com/plugins/build/app-quickstart) 与 [ChatGPT UI 指南](https://developers.openai.com/plugins/build/chatgpt-ui)。
