import fs from "fs";
import path from "path";

/**
 * 分析结果存储模块
 * 负责保存和读取分析结果数据
 */

/**
 * 获取存储目录路径
 */
function getStorageDir() {
    return path.join(process.cwd(), "analysis-results");
}

/**
 * 确保存储目录存在
 */
function ensureStorageDir() {
    const dir = getStorageDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`   📁 创建分析结果目录: ${dir}`);
    }
}

/**
 * 生成文件名
 * @param {string} date - 日期
 * @param {string} timeSlot - 时段
 * @param {string} timestamp - 完整时间戳
 * @returns {string} 文件名
 */
function generateFilename(date, timeSlot, timestamp = "") {
    if (timestamp) {
        try {
            // 尝试从 ISO String 提取 YYYYMMDD-HHmm
            const t = new Date(timestamp);
            const beijingTime = new Date(t.getTime() + 8 * 3600 * 1000); // 粗略转换为北京时间
            const formatted = beijingTime.toISOString().replace(/[-:]/g, "").replace("T", "-").substring(0, 13);
            return `analysis-${formatted}.json`;
        } catch (e) {
            // 降级使用传入的参数
        }
    }
    return `analysis-${date}-${timeSlot}.json`;
}


/**
 * 保存分析结果
 * @param {Object} data - 分析数据
 * @param {string} timestamp - 时间戳
 * @param {string} timeSlot - 时段
 */
export function saveAnalysisResult(data, timestamp, timeSlot) {
    try {
        ensureStorageDir();

        const { date, newsData, analysis } = data;

        // 构造存储数据
        const storageData = {
            meta: {
                timestamp,
                date,
                timeSlot,
                savedAt: new Date().toISOString()
            },
            statistics: {
                newsCount: newsData.reduce((sum, block) => sum + block.items.length, 0),
                categories: newsData.map(b => b.category),
                stockAnalyzed: analysis?.stock_analysis?.length || 0
            },
            news: newsData.map(block => ({
                category: block.category,
                items: block.items.map(item => ({
                    title: item.title,
                    link: item.link,
                    source: item.source,
                    pubDate: item.pubDate,
                    snippet: item.snippet?.substring(0, 200) || '' // 只保存摘要前200字
                }))
            })),
            analysis: {
                summary: analysis?.summary_markdown || '',
                newsHighlights: analysis?.news_highlights || [],
                stockAnalysis: analysis?.stock_analysis || []
            }
        };

        const filename = generateFilename(date, timeSlot, timestamp);
        const filepath = path.join(getStorageDir(), filename);

        fs.writeFileSync(filepath, JSON.stringify(storageData, null, 2), 'utf-8');

        const fileSize = (fs.statSync(filepath).size / 1024).toFixed(2);
        console.log(`   💾 分析结果已保存: ${filename} (${fileSize} KB)`);

        return filepath;

    } catch (error) {
        console.error(`   ❌ 保存分析结果失败:`, error.message);
        return null;
    }
}

/**
 * 加载指定日期和时段的分析结果
 * @param {string} date - 日期 YYYY-MM-DD
 * @param {string} timeSlot - 时段 morning/evening
 * @returns {Object|null} 分析数据
 */
export function loadAnalysisResult(date, timeSlot) {
    try {
        const filename = generateFilename(date, timeSlot);
        const filepath = path.join(getStorageDir(), filename);

        if (!fs.existsSync(filepath)) {
            return null;
        }

        const content = fs.readFileSync(filepath, 'utf-8');
        return JSON.parse(content);

    } catch (error) {
        console.error(`   ❌ 读取分析结果失败:`, error.message);
        return null;
    }
}

/**
 * 获取历史分析结果列表
 * @param {number} days - 获取最近几天的数据
 * @returns {Array} 分析结果列表
 */
export function getAnalysisHistory(days = 7) {
    try {
        ensureStorageDir();
        const dir = getStorageDir();

        const files = fs.readdirSync(dir)
            .filter(f => f.startsWith('analysis-') && f.endsWith('.json'))
            .sort()
            .reverse()
            .slice(0, days * 2); // 每天最多2个时段

        const results = [];

        for (const filename of files) {
            const filepath = path.join(dir, filename);
            try {
                const content = fs.readFileSync(filepath, 'utf-8');
                const data = JSON.parse(content);
                results.push({
                    filename,
                    ...data.meta,
                    statistics: data.statistics
                });
            } catch (e) {
                console.warn(`   ⚠️ 跳过损坏的文件: ${filename}`);
            }
        }

        return results;

    } catch (error) {
        console.error(`   ❌ 获取历史记录失败:`, error.message);
        return [];
    }
}

/**
 * 清理过期的分析结果
 * @param {number} keepDays - 保留天数
 */
export function cleanOldAnalysis(keepDays = 30) {
    try {
        const dir = getStorageDir();
        if (!fs.existsSync(dir)) return;

        const files = fs.readdirSync(dir)
            .filter(f => f.startsWith('analysis-') && f.endsWith('.json'));

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - keepDays);

        let deletedCount = 0;

        for (const filename of files) {
            // 从文件名提取日期: analysis-YYYY-MM-DD-timeSlot.json
            const match = filename.match(/analysis-(\d{4}-\d{2}-\d{2})-/);
            if (match) {
                const fileDate = new Date(match[1]);
                if (fileDate < cutoffDate) {
                    const filepath = path.join(dir, filename);
                    fs.unlinkSync(filepath);
                    deletedCount++;
                }
            }
        }

        if (deletedCount > 0) {
            console.log(`   🗑️  已清理 ${deletedCount} 个过期分析文件`);
        }

    } catch (error) {
        console.error(`   ❌ 清理过期文件失败:`, error.message);
    }
}
