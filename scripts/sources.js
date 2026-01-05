export const SOURCES = [
  {
    category: "A股 / 财经",
    sources: [
      { name: "新浪财经-股市", url: "http://rss.sina.com.cn/finance/stock.xml", type: "news" },
      { name: "新浪财经-国内", url: "http://rss.sina.com.cn/finance/domestic.xml", type: "news" },
      { name: "界面新闻-财经", url: "https://a.jiemian.com/index.php?m=article&a=rss", type: "news" }
    ]
  },
  {
    category: "科技 / 创投",
    sources: [
      { name: "36氪", url: "https://36kr.com/feed", type: "news" },
      { name: "虎嗅", url: "https://www.huxiu.com/rss/0.xml", type: "news" },
      { name: "爱范儿", url: "https://www.ifanr.com/feed", type: "news" },
      { name: "IT之家", url: "https://www.ithome.com/rss/", type: "news" }
    ]
  }
];

export const FULLTEXT_WHITELIST = [
  "github.blog",
  "openai.com",
  "deepmind.google",
  "research.google",
  "mit.edu",
  "hbr.org",
  "36kr.com",
  "ifanr.com",
  "huxiu.com",
  "ithome.com",
  "sina.com.cn",
  "jiemian.com"
];

export function canFetchFullText(link) {
  try {
    const urlObj = new URL(link);
    return FULLTEXT_WHITELIST.some(domain => urlObj.hostname.includes(domain));
  } catch (e) {
    return false;
  }
}

export function isArxivSource(sourceType) {
  return sourceType === 'arxiv';
}
