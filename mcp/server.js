import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { loadStickers, rankStickers } from "./lib/stickers.js";

const PORT = Number(process.env.PORT || 8787);
const RESOURCE_URI = "ui://widget/xiaoyao-xiaocha-sticker-card-v1.html";
const IMAGE_DOMAIN = "https://yaoandtea.github.io";
const widgetPath = fileURLToPath(
  new URL("./public/sticker-widget.html", import.meta.url),
);
const widgetHtml = readFileSync(widgetPath, "utf8");

function textResult(message, structuredContent = {}) {
  return {
    content: [{ type: "text", text: message }],
    structuredContent,
  };
}

export function createStickerServer() {
  const server = new McpServer({
    name: "小遥×小茶表情包",
    version: "0.1.0",
  });

  registerAppResource(
    server,
    "sticker-card",
    RESOURCE_URI,
    {},
    async () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                connectDomains: [],
                resourceDomains: [IMAGE_DOMAIN],
              },
            },
          },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "sticker_search",
    {
      title: "搜索小遥×小茶表情包",
      description:
        "按情绪、动作或语气搜索表情包。先调用本工具取得候选，再把选中的 id 交给 sticker_pick 显示图片卡片。",
      inputSchema: {
        query: z.string().min(1).describe("想表达的情绪、动作或语气，例如：贴贴、震惊、委屈想哭"),
        limit: z.number().int().min(1).max(10).default(5).describe("返回候选数量"),
      },
      _meta: {},
    },
    async ({ query, limit }) => {
      try {
        const stickers = await loadStickers();
        const candidates = rankStickers(stickers, query, limit);
        return textResult(
          `为“${query}”找到 ${candidates.length} 个候选。请选最贴合语境的一个，再调用 sticker_pick。`,
          { query, candidates },
        );
      } catch (error) {
        return {
          ...textResult(`表情包清单暂时读取失败：${error.message}`, {
            query,
            candidates: [],
          }),
          isError: true,
        };
      }
    },
  );

  registerAppTool(
    server,
    "sticker_pick",
    {
      title: "显示小遥×小茶表情包",
      description:
        "根据 sticker_search 返回的 id 显示一张表情包图片卡片。不要凭空编造 id。",
      inputSchema: {
        id: z.string().min(1).describe("sticker_search 返回的表情包 id"),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ id }) => {
      try {
        const stickers = await loadStickers();
        const sticker = stickers.find((item) => item.id === id);
        if (!sticker) {
          return {
            ...textResult(`没有找到 id 为“${id}”的表情包，请先调用 sticker_search。`, {
              sticker: null,
            }),
            isError: true,
          };
        }

        return textResult(`已选择表情包：${sticker.name}`, { sticker });
      } catch (error) {
        return {
          ...textResult(`表情包读取失败：${error.message}`, { sticker: null }),
          isError: true,
        };
      }
    },
  );

  return server;
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, mcp-session-id, mcp-protocol-version",
  );
  response.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
}

export const httpServer = createServer(async (request, response) => {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  if (request.method === "GET" && ["/", "/health"].includes(request.url)) {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        ok: true,
        name: "小遥×小茶表情包 MCP",
        endpoint: "/mcp",
      }),
    );
    return;
  }

  if (request.url === "/mcp" && ["GET", "POST", "DELETE"].includes(request.method)) {
    const server = createStickerServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    response.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "application/json" });
      }
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Not found" }));
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`小遥×小茶表情包 MCP 已启动：http://localhost:${PORT}/mcp`);
  });
}
