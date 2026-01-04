export function generateMarkdown(date, data, summary = null, timestamp = null) {
  let md = `# 🧠 科研 & 技术热点日报\n\n日期：${date}\n`;

  // 如果有时间戳，显示具体时间
  if (timestamp) {
    const timeStr = new Date(timestamp).toLocaleString('zh-CN', { 
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    md += `生成时间：${timeStr}\n\n`;
  } else {
    md += "\n";
  }

  // 如果有摘要，放在最前面
  if (summary) {
    md += `## 📝 今日总结\n\n${summary}\n\n---\n\n`;
  }

  // 新闻列表
  for (const block of data) {
    if (block.items.length === 0) continue;
    
    md += `## 🔥 ${block.category}\n\n`;
    for (const item of block.items.slice(0, 5)) {
      md += `- **${item.title}**  \n`;
      md += `  来源：${item.source}  \n`;
      md += `  链接：${item.link}\n\n`;
    }
  }

  md += "---\n_自动生成 · GitHub Actions_\n";
  return md;
}

