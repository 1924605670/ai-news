import OpenAI from "openai";
import { fetchStockData } from "./stock-tool.js";

const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1";

/**
 * 延迟函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 调用 LLM API 通用函数
 */
async function callLLMAPI(client, prompt, jsonMode = true) {
  const response = await client.chat.completions.create({
    model: "deepseek-ai/DeepSeek-V3.2",
    messages: [{ role: "user", content: prompt }],
    stream: false,
    max_tokens: 32000,
    temperature: 0.3,
    response_format: jsonMode ? { type: "json_object" } : { type: "text" }
  });
  return response.choices[0]?.message?.content?.trim();
}

/**
 * 尝试解析 JSON
 */
function safeParseJSON(content) {
  try {
    return JSON.parse(content);
  } catch (e) {
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      return JSON.parse(content.substring(jsonStart, jsonEnd + 1));
    }
    throw e;
  }
}

/**
 * Step 1: 格式定义
 */
const CANDIDATE_FORMAT = `
{
  "candidates": ["600519", "000001", "300059"] 
}
说明：仅返回最相关的 3-5 个 A股股票代码（6位数字），不要其他内容。
`;

/**
 * Step 2: 最终格式定义
 */
const FINAL_OUTPUT_FORMAT = `
{
  "summary_markdown": "日报 Markdown 总结部分（保留原有风格）",
  "news_highlights": [
    {
      "title": "新闻标题(中文)",
      "summary": "一句话核心概要",
      "url": "原始链接",
      "category": "分类",
      "published_at": "新闻发布时间(格式: HH:mm)"
    }
  ],
  "stock_analysis": [
    {
      "stock_name": "股票名称",
      "stock_code": "股票代码",
      "current_price": "实际现价(从行情数据获取)",
      "target_price": "预测目标价",
      "operation": "买入/增持/持有/观望/卖出",
      "related_news_title": "关联的新闻标题(必须是今日已列出的)",
      "reason": "结合新闻与实时行情的分析逻辑",
      "probability": "80%"
    }
  ]
}
`;

/**
 * 生成摘要主逻辑
 */
export async function generateSummary(newsData, timestamp, maxRetries = 5) {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    console.warn("⚠️  SILICONFLOW_API_KEY not set, skipping summary generation");
    return null;
  }

  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: SILICONFLOW_API_URL,
    timeout: 600000,
    maxRetries: 0,
  });

  // 1. 构建新闻内容字符串
  const newsItems = [];
  for (const block of newsData) {
    if (block.items.length === 0) continue;
    block.items.slice(0, 5).forEach((item, idx) => {
      const content = item.fullContent || item.snippet || "";
      let trimmedContent = content.length > 500 ? content.substring(0, 500) + '...' : content;
      trimmedContent = trimmedContent.replace(/\n/g, ' ');
      newsItems.push({
        category: block.category,
        title: item.title || 'Untitled',
        url: item.link,
        pubDate: item.pubDate, // 确保传递时间
        content: trimmedContent,
      });
    });
  }

  let newsContent = "";
  newsItems.forEach((item, i) => {
    newsContent += `${i + 1}. [${item.category}] [时间: ${item.pubDate}] ${item.title}\n   Link: ${item.url}\n   Content: ${item.content}\n\n`;
  });

  // 截断以防过长
  if (newsContent.length > 25000) {
    newsContent = newsContent.substring(0, 25000) + "\n...(truncated)...";
  }

  console.log(`   📏 News Content Length: ${newsContent.length}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) await sleep(2000 * Math.pow(2, attempt - 2));
      console.log(`   🔄 尝试第 ${attempt} 次生成...`);

      // === Step 1: 提取相关股票代码 ===
      console.log(`   🔍 [Step 1] 识别相关 A 股代码...`);
      const step1Prompt = `
以下是今日科技财经新闻：
${newsContent}

请分析新闻，识别出最受影响的 3-5 只中国 A 股上市公司。
请返回 JSON 格式，包含 candidates 数组（股票代码）。
${CANDIDATE_FORMAT}
`;
      const step1Res = await callLLMAPI(client, step1Prompt, true);
      const step1Data = safeParseJSON(step1Res);
      const outputCodes = step1Data.candidates || [];
      console.log(`      Found codes: ${JSON.stringify(outputCodes)}`);

      // === Step 2: 获取实时行情 ===
      let stockMarketInfo = "暂无实时行情数据";
      if (outputCodes.length > 0) {
        console.log(`   📡 [Step 2] 获取实时行情数据...`);
        const prices = await fetchStockData(outputCodes);
        if (prices.length > 0) {
          stockMarketInfo = JSON.stringify(prices.map(p => ({
            code: p.code,
            name: p.name,
            price: p.current,
            change: p.changePercent,
            time: p.time
          })), null, 2);
          console.log(`      Fetched prices for: ${prices.map(p => p.name).join(', ')}`);
        } else {
          console.log(`      ⚠️ 未获取到有效行情`);
        }
      }

      // === Step 3: 生成最终报告 ===
      console.log(`   📝 [Step 3] 生成最终分析报告...`);
      const finalPrompt = `
当前时间：${new Date(timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

你是一位资深的全球科技新闻主编和A股金融分析师。

【输入数据】
1. **新闻列表**：
${newsContent}

2. **实时股票行情** (这是当前时刻的真实交易数据，严禁虚构，请基于此进行分析)：
${stockMarketInfo}

【任务说明】
1. **精选新闻 (news_highlights)**：
   - 挑选 5-8 条最重要的科技/财经新闻。
   - 必须包含原文链接。
   - 中文摘要，简洁有力。

2. **A股分析 (stock_analysis)**：
   - 基于上述【实时股票行情】中的数据，选取 3 只重点股票进行分析。
   - **\`current_price\` 必须直接使用行情数据中的 \`price\`，不要自己编造。**
   - 结合新闻事件和当前涨跌幅 (\`change\`)，给出操作建议 (\`operation\`) 和目标价 (\`target_price\`)。
   - 逻辑要严密，体现专业性。

请返回 JSON 数据：
${FINAL_OUTPUT_FORMAT}
`;

      const finalRes = await callLLMAPI(client, finalPrompt, true);
      const finalData = safeParseJSON(finalRes);

      console.log(`   ✅ 流程执行成功`);
      return finalData;

    } catch (error) {
      console.error(`   ❌ 流程失败: ${error.message}`);
      if (attempt === maxRetries) return null;
    }
  }
  return null;
}
