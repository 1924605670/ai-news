import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import { SOURCES } from "./sources.js";
import { fetchRSS } from "./fetch-rss.js";
import { fetchArticleContent } from "./fetch-content.js";
import { generateMarkdown } from "./generate-md.js";
import { generateSummary } from "./generate-summary.js";

const today = dayjs().format("YYYY-MM-DD");
const timestamp = new Date().toISOString();

console.log(`\n${'='.repeat(60)}`);
console.log(`📰 科研 & 技术热点日报 - ${today}`);
console.log(`⏰ 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
console.log(`${'='.repeat(60)}\n`);

const results = [];

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
    const feedItems = feed.items || [];
    console.log(`  ✓ Successfully fetched: "${feedTitle}" (${feedItems.length} items)`);

    const selectedItems = feedItems.slice(0, 3);
    console.log(`  📰 Selected ${selectedItems.length} items:`);
    
    // 并行抓取文章内容
    const contentPromises = selectedItems.map(async (i, idx) => {
      const item = {
        title: i.title || 'Untitled',
        link: i.link || '#',
        source: src.name,
        content: null
      };
      
      console.log(`    ${idx + 1}. ${item.title}`);
      console.log(`       🔗 ${item.link}`);
      
      // 抓取文章内容
      item.content = await fetchArticleContent(item.link);
      
      if (item.content) {
        const preview = item.content.substring(0, 100).replace(/\n/g, ' ');
        console.log(`       ✓ Content extracted (${item.content.length} chars): ${preview}...`);
      } else {
        console.log(`       ⚠️  No content extracted`);
      }
      
      return item;
    });
    
    const fetchedItems = await Promise.all(contentPromises);
    items.push(...fetchedItems);
  }

  console.log(`  ✅ Category "${block.category}": collected ${items.length} items total`);
  results.push({
    category: block.category,
    items
  });
}

// 统计摘要
const totalItems = results.reduce((sum, block) => sum + block.items.length, 0);
console.log(`\n${'='.repeat(60)}`);
console.log(`📊 数据统计:`);
console.log(`   - 分类数量: ${results.length}`);
console.log(`   - 文章总数: ${totalItems}`);
console.log(`${'='.repeat(60)}\n`);

// 生成 LLM 摘要
let summary = null;
try {
  console.log(`🤖 开始生成 LLM 摘要...`);
  summary = await generateSummary(results, timestamp);
  if (summary) {
    console.log(`✅ LLM 摘要生成成功 (${summary.length} 字符)`);
    console.log(`\n📝 摘要内容:\n${summary}\n`);
  } else {
    console.log(`⚠️  LLM 摘要生成失败或返回为空`);
  }
} catch (error) {
  console.error(`❌ Failed to generate summary:`, error);
}

// 生成 Markdown
const md = generateMarkdown(today, results, summary, timestamp);
const dailyDir = path.join(process.cwd(), "daily");

// Ensure daily directory exists
if (!fs.existsSync(dailyDir)) {
  fs.mkdirSync(dailyDir, { recursive: true });
}

const out = path.join(dailyDir, `${today}.md`);
fs.writeFileSync(out, md, "utf-8");

const fileSize = (fs.statSync(out).size / 1024).toFixed(2);
console.log(`\n${'='.repeat(60)}`);
console.log(`✅ 报告生成完成!`);
console.log(`   📄 文件路径: ${out}`);
console.log(`   📏 文件大小: ${fileSize} KB`);
console.log(`⏰ 结束时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
console.log(`${'='.repeat(60)}\n`);

// 强制退出，确保脚本正常结束
process.exit(0);

