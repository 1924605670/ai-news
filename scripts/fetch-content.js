import fetch from "node-fetch";
import * as cheerio from "cheerio";
import https from "https";
import http from "http";

// 创建自定义 Agent，禁用 keep-alive
const httpsAgent = new https.Agent({
  keepAlive: false
});

const httpAgent = new http.Agent({
  keepAlive: false
});

/**
 * 从URL提取文章内容
 */
export async function fetchArticleContent(url, timeout = 10000) {
  if (!url || url === '#') {
    return null;
  }

  try {
    console.log(`    📥 Fetching content from: ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const protocol = new URL(url).protocol;
    const agent = protocol === 'https:' ? httpsAgent : httpAgent;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'news-bot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Connection': 'close'
      },
      agent  // node-fetch v3 支持 agent 配置
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`    ⚠️  HTTP ${response.status}: ${url}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 特殊处理：arXiv 论文
    if (url.includes('arxiv.org')) {
      return extractArXivContent($, url);
    }

    // 通用内容提取
    return extractGenericContent($, url);
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`    ⏱️  Timeout fetching: ${url}`);
    } else {
      console.log(`    ❌ Error fetching: ${url} - ${error.message}`);
    }
    return null;
  }
}

/**
 * 提取 arXiv 论文内容（摘要和主要信息）
 */
function extractArXivContent($, url) {
  try {
    // arXiv 摘要通常在 meta 标签或特定 div 中
    const abstract = $('meta[name="citation_abstract"]').attr('content') ||
                    $('.abstract').text().trim() ||
                    $('[class*="abstract"]').first().text().trim();

    // 作者信息
    const authors = $('meta[name="citation_author"]')
      .map((_, el) => $(el).attr('content'))
      .get()
      .join(', ');

    // 标题
    const title = $('meta[name="citation_title"]').attr('content') ||
                  $('h1.title').text().trim();

    let content = '';
    if (title) content += `标题: ${title}\n`;
    if (authors) content += `作者: ${authors}\n`;
    if (abstract) {
      content += `摘要: ${abstract.replace(/\s+/g, ' ').trim()}\n`;
    }

    return content.trim() || null;
  } catch (e) {
    return null;
  }
}

/**
 * 提取通用网页内容
 */
function extractGenericContent($, url) {
  try {
    // 移除 script 和 style 标签
    $('script, style, noscript, iframe').remove();

    // 尝试找到主要内容区域
    const selectors = [
      'article',
      '[role="article"]',
      '.post-content',
      '.entry-content',
      '.article-content',
      '.content',
      'main',
      '[class*="content"]',
      '[class*="post"]',
      '[class*="article"]'
    ];

    let content = '';
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        content = element.text().trim();
        if (content.length > 200) {  // 确保有足够内容
          break;
        }
      }
    }

    // 如果还没找到，尝试 body 内容
    if (!content || content.length < 200) {
      $('header, footer, nav, aside, .sidebar, .menu, .navigation').remove();
      content = $('body').text().trim();
    }

    // 清理文本：移除多余空白
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    // 限制长度（避免内容过长）
    if (content.length > 5000) {
      content = content.substring(0, 5000) + '...';
    }

    return content.length > 100 ? content : null;
  } catch (e) {
    return null;
  }
}

