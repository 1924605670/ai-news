import Parser from "rss-parser";
import https from "https";
import http from "http";

// 创建自定义 Agent，禁用 keep-alive，确保连接立即关闭
const httpsAgent = new https.Agent({
  keepAlive: false
});

const httpAgent = new http.Agent({
  keepAlive: false
});

// 创建一个通用的 parser，使用 HTTPS agent（大多数 RSS 都是 HTTPS）
const defaultParser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "news-bot/1.0",
    "Connection": "close"  // 显式关闭连接
  },
  requestOptions: {
    agent: httpsAgent  // 默认使用 HTTPS agent
  }
});

/**
 * 根据 URL 协议创建合适的 parser
 */
function createParser(url) {
  try {
    const protocol = new URL(url).protocol;
    
    // 如果已经是 HTTPS，使用默认 parser
    if (protocol === 'https:') {
      return defaultParser;
    }
    
    // 如果是 HTTP，创建新的 parser 使用 HTTP agent
    return new Parser({
      timeout: 10000,
      headers: {
        "User-Agent": "news-bot/1.0",
        "Connection": "close"
      },
      requestOptions: {
        agent: httpAgent
      }
    });
  } catch (e) {
    // URL 解析失败，使用默认 parser
    return defaultParser;
  }
}

export async function fetchRSS(url) {
  try {
    // 根据 URL 协议选择合适的 parser
    const parser = createParser(url);
    return await parser.parseURL(url);
  } catch (e) {
    console.error(`RSS fetch failed: ${url}`, e.message);
    return null;
  }
}

