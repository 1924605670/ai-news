import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import { SOURCES } from "./sources.js";
import { fetchRSS } from "./fetch-rss.js";
import { generateMarkdown } from "./generate-md.js";
import { generateSummary } from "./generate-summary.js";

const today = dayjs().format("YYYY-MM-DD");
const timestamp = new Date().toISOString();

console.log(`Fetching news for ${today}...`);

const results = [];

// 获取所有新闻
for (const block of SOURCES) {
  const items = [];

  for (const src of block.sources) {
    console.log(`Fetching ${src.name}...`);
    const feed = await fetchRSS(src.url);
    if (!feed) continue;

    feed.items.slice(0, 3).forEach((i) => {
      items.push({
        title: i.title,
        link: i.link,
        source: src.name
      });
    });
  }

  results.push({
    category: block.category,
    items
  });
}

// 生成 LLM 摘要
let summary = null;
try {
  summary = await generateSummary(results, timestamp);
} catch (error) {
  console.error("Failed to generate summary:", error);
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

console.log(`✓ Generated ${out}`);
process.exit(0);

