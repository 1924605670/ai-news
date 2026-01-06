import 'dotenv/config';
import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { fileURLToPath } from 'url';
import { SOURCES, canFetchFullText, isArxivSource } from "./sources.js";
import { fetchRSS } from "./fetch-rss.js";
import { fetchArticleContent } from "./fetch-content.js";
import { generateMarkdown } from "./generate-md.js";
import { generateSummary } from "./generate-summary.js";
import { sendWeChatNotification } from "./notify.js";
import { HistoryManager } from "./history-manager.js";
import { saveAnalysisResult } from "./analysis-storage.js";
import cron from "node-cron";


// 启用 dayjs 的 timezone 插件
dayjs.extend(utc);
dayjs.extend(timezone);

const TIME_WINDOW_MINUTES = parseInt(process.env.NEWS_TIME_WINDOW_MINUTES || '60', 10);
const history = new HistoryManager();

export async function run() {
  const today = dayjs().format("YYYY-MM-DD");
  const timestamp = new Date().toISOString();

  // 判断是上午还是下午
  const utcHour = dayjs().utc().hour();
  const timeSlot = utcHour < 12 ? 'morning' : 'evening';
  const timeSlotLabel = utcHour < 12 ? '上午' : '晚上';

  // 获取北京时间用于显示
  const beijingTime = dayjs().tz('Asia/Shanghai');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📰 科研 & 技术热点日报 - ${today} ${timeSlotLabel}`);
  console.log(`⏰ 开始时间: ${beijingTime.format('YYYY-MM-DD HH:mm:ss')} (UTC+8)`);
  console.log(`⏱️  新闻时间窗口: 过去 ${TIME_WINDOW_MINUTES} 分钟`);
  console.log(`${'='.repeat(60)}\n`);

  const results = [];
  const cutoffTime = dayjs().subtract(TIME_WINDOW_MINUTES, 'minute');

  // 获取所有新闻
  for (const block of SOURCES) {
    console.log(`\n📂 Processing category: ${block.category}`);
    const items = [];

    for (const src of block.sources) {
      console.log(`  🔍 Fetching ${src.name} from ${src.url}...`);
      const feed = await fetchRSS(src.url);
      if (!feed) {
        console.log(`  ⚠️  Failed to fetch from ${src.name}`);
        continue;
      }

      const feedTitle = feed.title || 'Unknown';
      let feedItems = feed.items || [];
      console.log(`  ✓ Successfully fetched: "${feedTitle}" (${feedItems.length} items)`);

      // 🕒 时间过滤 & 🔄 历史去重
      const initialCount = feedItems.length;
      feedItems = feedItems.filter(item => {
        const itemDate = item.isoDate || item.pubDate;
        if (!itemDate) return false; // 严格一点，没有时间的跳过

        // 1. 时间检查
        const isRecent = dayjs(itemDate).isAfter(cutoffTime);
        if (!isRecent) return false;

        // 2. 历史检查
        const isNew = !history.isProcessed(item.link);
        if (!isNew) {
          // console.log(`    Start skipping: ${item.title}`); 
        }
        return isNew;
      });

      const keptCount = feedItems.length;
      if (keptCount === 0) {
        console.log(`  ⚪ No new items (filtered by time or history)`);
        continue;
      } else {
        console.log(`  🕒 Filtered: kept ${keptCount}/${initialCount} items`);
      }

      // 根据源类型决定抓取数量
      const isArxiv = isArxivSource(src.name);
      const maxItems = isArxiv ? 2 : (src.type === 'blog' ? 4 : 3);
      const selectedItems = feedItems.slice(0, maxItems);

      console.log(`  📰 Selected ${selectedItems.length} items (${isArxiv ? 'arXiv补充型' : '稳定输出型'}):`);

      // 处理每个文章
      const contentPromises = selectedItems.map(async (i, idx) => {
        const item = {
          title: i.title || 'Untitled',
          link: i.link || '#',
          source: src.name,
          sourceType: src.type || 'unknown',
          pubDate: dayjs(i.isoDate || i.pubDate).tz('Asia/Shanghai').format('HH:mm'),
          snippet: i.contentSnippet || i.content || i.summary || i.description || "",
          fullContent: null,
          contentType: "rss-snippet"
        };

        console.log(`    ${idx + 1}. [${item.pubDate}] ${item.title}`);
        console.log(`       🔗 ${item.link}`);

        if (item.snippet) {
          const preview = item.snippet.substring(0, 100).replace(/\n/g, ' ').trim();
          console.log(`       📄 RSS摘要 (${item.snippet.length} chars): ${preview}...`);
        }

        const shouldFetchFullText = canFetchFullText(item.link);

        if (shouldFetchFullText) {
          console.log(`       🔍 白名单站点，尝试抓取全文...`);
          item.fullContent = await fetchArticleContent(item.link);

          if (item.fullContent) {
            item.contentType = "fulltext";
            const preview = item.fullContent.substring(0, 100).replace(/\n/g, ' ').trim();
            console.log(`       ✅ 全文提取成功 (${item.fullContent.length} chars): ${preview}...`);
          } else {
            console.log(`       ⚠️  全文提取失败，使用RSS摘要`);
          }
        } else {
          console.log(`       ℹ️  非白名单站点，仅使用RSS摘要`);
        }

        return item;
      });

      const fetchedItems = await Promise.all(contentPromises);
      items.push(...fetchedItems);
    }

    if (items.length > 0) {
      console.log(`  ✅ Category "${block.category}": collected ${items.length} items total`);
      results.push({
        category: block.category,
        items
      });
    }
  }

  // 统计摘要
  const totalItems = results.reduce((sum, block) => sum + block.items.length, 0);
  const distinctSources = new Set();
  results.forEach(block => block.items.forEach(i => distinctSources.add(i.source)));

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 数据统计:`);
  console.log(`   - 分类数量: ${results.length}`);
  console.log(`   - 文章总数: ${totalItems}`);
  console.log(`   - 来源站点: ${distinctSources.size} 个 (${Array.from(distinctSources).join(', ')})`);
  console.log(`${'='.repeat(60)}\n`);

  if (totalItems === 0) {
    console.log("⚠️ 没有新文章，跳过摘要生成和推送。");
    return;
  }

  // 生成 LLM 摘要
  let summaryData = null;
  let markdownSummary = "";
  let wechatMessage = "";

  try {
    console.log(`🤖 开始生成 LLM 摘要与金融分析...`);
    summaryData = await generateSummary(results, timestamp, 5);

    if (summaryData) {
      markdownSummary = summaryData.summary_markdown || "摘要生成失败 (JSON format error)";

      const newsSection = (summaryData.news_highlights || []).map(n => {
        return `🔹 **[${n.published_at || '新'}] ${n.title}**\n${n.summary} [🔗原文](${n.url})`;
      }).join('\n\n');

      const stockSection = (summaryData.stock_analysis || []).map(s => {
        const icon = s.operation && s.operation.includes('买') ? '🔴' : (s.operation.includes('卖') ? '🟢' : '⚪');

        const tech = s.technical_indicators || {};
        const basis = s.analysis_basis || {};

        // 技术指标摘要行
        let techSummary = '';
        if (tech.rsi || tech.ma5 || tech.main_capital_flow) {
          const rsi = tech.rsi ? `RSI:${tech.rsi}` : '';
          const ma5 = tech.ma5 ? `MA5:${tech.ma5}` : '';
          const capital = tech.main_capital_flow && tech.main_capital_flow !== '-'
            ? `主力:${tech.main_capital_flow}万` : '';
          const parts = [rsi, ma5, capital].filter(Boolean);
          if (parts.length > 0) {
            techSummary = `   📊 ${parts.join(' | ')}\n`;
          }
        }

        // 关键信号
        const signals = basis.key_signals && basis.key_signals.length > 0
          ? `   🎯 ${basis.key_signals.join(', ')}\n`
          : '';

        // 技术分析总结
        const techAnalysis = basis.technical_summary
          ? `   🔍 ${basis.technical_summary}`
          : `   📝 ${s.reason}`;

        return `${icon} **${s.stock_name} (${s.stock_code})**\n` +
          `   💰 ${s.current_price} → 🎯 ${s.target_price} | **${s.operation}** (${s.probability})\n` +
          techSummary +
          techAnalysis +
          (signals ? '\n' + signals : '');
      }).join('\n\n');

      wechatMessage = `📅 **${today} | 科技新闻日报**\n\n` +
        `🔥 **今日热点**\n${newsSection}\n\n` +
        `--------------------------------\n\n` +
        `📈 **A股龙虎榜预测**\n${stockSection}`;

      console.log(`✅ LLM 摘要生成成功`);

      if (summaryData.stock_analysis && summaryData.stock_analysis.length > 0) {
        console.log(`📈 股票分析: ${summaryData.stock_analysis.map(s => s.stock_name).join(', ')}`);
      }

      // Mark as processed ONLY if we successfully generated a summary
      // 将本次成功处理的 URL 加入历史记录
      results.forEach(block => {
        block.items.forEach(item => {
          if (item.link) history.add(item.link);
        });
      });
      history.save();
      console.log(`✅ 已更新历史记录,本次新增处理 ${totalItems} 条`);

      // 保存分析结果
      saveAnalysisResult({
        timestamp,
        date: today,
        timeSlot,
        newsData: results,
        analysis: summaryData
      }, timestamp, timeSlot);


    } else {
      console.log(`⚠️  LLM 摘要生成失败，将继续生成不含摘要的报告`);
    }
  } catch (error) {
    console.error(`❌ 摘要生成过程异常:`, error.message);
    console.log(`⚠️  将继续生成不含摘要的报告`);
  }

  // 生成 Markdown 文件
  const md = generateMarkdown(today, results, markdownSummary, timestamp, timeSlotLabel);
  const dailyDir = path.join(process.cwd(), "daily");

  if (!fs.existsSync(dailyDir)) {
    fs.mkdirSync(dailyDir, { recursive: true });
  }

  const filename = `${beijingTime.format('YYYYMMDD-HHmm')}.md`;
  const out = path.join(dailyDir, filename);
  fs.writeFileSync(out, md, "utf-8");

  const fileSize = (fs.statSync(out).size / 1024).toFixed(2);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ 报告生成完成!`);
  console.log(`   📄 文件路径: ${out}`);
  console.log(`   📏 文件大小: ${fileSize} KB`);

  // 发送企业微信通知
  if (wechatMessage) {
    await sendWeChatNotification(wechatMessage);
  } else {
    console.log(`⚠️ 无微信消息内容，跳过推送`);
  }

  console.log(`⏰ 结束时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log(`${'='.repeat(60)}\n`);
}

// 定义定时任务逻辑
function startScheduler() {
  console.log('⏰ 定时任务已启动: 每 5 分钟执行一次');

  // 首次运行一次
  run().catch(e => console.error('❌ 初次运行失败:', e));

  // 设置 Cron 任务: 每 5 分钟执行一次
  // 分别是: 秒, 分, 时, 日, 月, 星期
  cron.schedule('*/5 * * * *', async () => {
    console.log(`\n🔔 定时触发: ${dayjs().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')}`);
    try {
      await run();
    } catch (e) {
      console.error('❌ 定时任务执行失败:', e);
    }
  });
}

// 如果直接运行脚本
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isOnce = process.argv.includes('--once');

  if (isOnce) {
    run().then(() => process.exit(0)).catch(e => {
      console.error(e);
      process.exit(1);
    });
  } else {
    startScheduler();
  }
}

