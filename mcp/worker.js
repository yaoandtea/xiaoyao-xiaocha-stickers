import { createMcpHandler } from "agents/mcp";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import widgetHtml from "./sticker-widget.html";

const RESOURCE_URI = "ui://widget/xiaoyao-xiaocha-sticker-card-v1.html";
const IMAGE_DOMAIN = "https://yaoandtea.github.io";
const STICKERS_URL =
  "https://yaoandtea.github.io/xiaoyao-xiaocha-stickers/stickers.json";
const CACHE_TTL_MS = 5 * 60 * 1000;

let manifestCache = { loadedAt: 0, stickers: null };

function validateManifest(value) {
  if (!Array.isArray(value)) throw new Error("Sticker manifest must be an array.");

  const seen = new Set();
  return value.map((sticker, index) => {
    if (!sticker || typeof sticker !== "object") {
      throw new Error(`Sticker at index ${index} must be an object.`);
    }

    const id = String(sticker.id || "").trim();
    const name = String(sticker.name || "").trim();
    const imageUrl = String(sticker.imageUrl || "").trim();
    const labels = Array.isArray(sticker.labels)
      ? sticker.labels.map((label) => String(label).trim()).filter(Boolean)
      : [];

    if (!id || !name || !imageUrl) {
      throw new Error(`Sticker at index ${index} is missing id, name, or imageUrl.`);
    }
    if (seen.has(id)) throw new Error(`Duplicate sticker id: ${id}`);
    if (!imageUrl.startsWith("https://")) {
      throw new Error(`Sticker ${id} must use an HTTPS imageUrl.`);
    }

    seen.add(id);
    return { id, name, labels, imageUrl };
  });
}

async function loadStickers() {
  const now = Date.now();
  if (manifestCache.stickers && now - manifestCache.loadedAt < CACHE_TTL_MS) {
    return manifestCache.stickers;
  }

  const response = await fetch(STICKERS_URL, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Sticker manifest request failed with ${response.status}.`);
  }

  const stickers = validateManifest(await response.json());
  manifestCache = { loadedAt: now, stickers };
  return stickers;
}

function normalize(value) {
  return String(value || "").toLocaleLowerCase("zh-CN").trim();
}

function queryTerms(query) {
  return normalize(query)
    .split(/[\s,，。.!！?？、/|;；:：]+/u)
    .filter(Boolean);
}

function scoreSticker(sticker, query) {
  const normalizedQuery = normalize(query);
  const normalizedId = normalize(sticker.id);
  const normalizedName = normalize(sticker.name);
  const normalizedLabels = sticker.labels.map(normalize);
  const haystack = [normalizedId, normalizedName, ...normalizedLabels].join(" ");

  let score = 0;
  if (normalizedId === normalizedQuery) score += 260;
  if (normalizedName === normalizedQuery) score += 220;
  if (normalizedLabels.includes(normalizedQuery)) score += 180;
  if (normalizedName.includes(normalizedQuery)) score += 130;
  if (normalizedLabels.some((label) => label.includes(normalizedQuery))) score += 110;
  if (haystack.includes(normalizedQuery)) score += 70;

  for (const term of queryTerms(normalizedQuery)) {
    if (normalizedName.includes(term)) score += 35;
    if (normalizedLabels.some((label) => label === term)) score += 45;
    if (normalizedLabels.some((label) => label.includes(term))) score += 25;
  }

  const meaningfulChars = [...new Set([...normalizedQuery])].filter(
    (char) => !/\s|[，。,.!！?？、]/u.test(char),
  );
  score += Math.min(
    30,
    meaningfulChars.filter((char) => haystack.includes(char)).length * 3,
  );
  return score;
}

function rankStickers(stickers, query, limit = 5) {
  const safeLimit = Math.max(1, Math.min(10, Number(limit) || 5));
  return stickers
    .map((sticker, index) => ({
      ...sticker,
      score: scoreSticker(sticker, query),
      _index: index,
    }))
    .sort((a, b) => b.score - a.score || a._index - b._index)
    .slice(0, safeLimit)
    .map(({ _index, ...sticker }) => sticker);
}

function textResult(message, structuredContent = {}) {
  return {
    content: [{ type: "text", text: message }],
    structuredContent,
  };
}

function createStickerServer() {
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

function withCors(response) {
  const result = new Response(response.body, response);
  result.headers.set("Access-Control-Allow-Origin", "*");
  result.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  result.headers.set(
    "Access-Control-Allow-Headers",
    "content-type, mcp-session-id, mcp-protocol-version",
  );
  result.headers.set("Access-Control-Expose-Headers", "mcp-session-id");
  return result;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (request.method === "GET" && ["/", "/health"].includes(url.pathname)) {
      return withCors(
        Response.json({
          ok: true,
          name: "小遥×小茶表情包 MCP",
          endpoint: "/mcp",
        }),
      );
    }

    if (url.pathname === "/mcp") {
      const response = await createMcpHandler(createStickerServer())(
        request,
        env,
        ctx,
      );
      return withCors(response);
    }

    return withCors(Response.json({ error: "Not found" }, { status: 404 }));
  },
};
