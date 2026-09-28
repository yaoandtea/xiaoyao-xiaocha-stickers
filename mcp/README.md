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

ChatGPT 需要一个公网可访问的 HTTPS `/mcp` 地址。本地调试可使用安全隧道，正式使用建议部署到支持 Node.js 常驻服务的平台，并把启动命令设为 `npm start`。

项目已经附带 `Dockerfile` 和 `render.yaml`。部署到 Render 时可直接使用 Blueprint，部署完成后的连接地址形如：

```text
https://你的服务域名/mcp
```

连接后可以这样测试：

> 搜索一张适合“宝宝我想贴贴”的表情包，选最合适的一张显示出来。

实现遵循 OpenAI 的 [Apps SDK 快速开始](https://developers.openai.com/plugins/build/app-quickstart) 与 [ChatGPT UI 指南](https://developers.openai.com/plugins/build/chatgpt-ui)。
