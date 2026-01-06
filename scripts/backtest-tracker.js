import 'dotenv/config';
import fs from "fs";
import path from "path";
import { fetchStockData } from "./stock-tool.js";

const ANALYSIS_DIR = path.join(process.cwd(), "analysis-results");

/**
 * 执行回测
 * 扫描历史预测并根据当前价格核对准确度
 */
export async function runBacktest() {
    console.log('\n' + '='.repeat(60));
    console.log('--- 🚀 开始执行预测回测跟踪 ---');
    console.log('='.repeat(60));

    if (!fs.existsSync(ANALYSIS_DIR)) {
        console.log('⚠️ 未找到分析结果目录，跳过回测。');
        return;
    }

    const files = fs.readdirSync(ANALYSIS_DIR)
        .filter(f => f.startsWith('analysis-') && f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 20); // 检查最近的 20 个分析文件

    const stockMap = new Map(); // code -> { files: [], latestPrice: null }

    // 1. 收集待核对的股票代码
    for (const file of files) {
        const filePath = path.join(ANALYSIS_DIR, file);
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const stockAnalysis = data.analysis?.stockAnalysis || [];

            for (const stock of stockAnalysis) {
                if (!stock.stock_code) continue;
                if (!stockMap.has(stock.stock_code)) {
                    stockMap.set(stock.stock_code, {
                        name: stock.stock_name,
                        predictions: []
                    });
                }
                stockMap.get(stock.stock_code).predictions.push({
                    file,
                    date: data.meta?.date,
                    predPrice: parseFloat(stock.current_price),
                    targetPrice: parseFloat(stock.target_price),
                    operation: stock.operation,
                    probability: stock.probability
                });
            }
        } catch (e) {
            console.error(`❌ 解析文件失败: ${file}`, e.message);
        }
    }

    const codes = Array.from(stockMap.keys());
    if (codes.length === 0) {
        console.log('✅ 无需核对的股票预测。');
        return;
    }

    console.log(`📡 正在获取 ${codes.length} 只股票的最新实时价格...`);
    const currentMarkets = await fetchStockData(codes);

    // 建立快速查找 Map
    const marketMap = new Map();
    currentMarkets.forEach(m => marketMap.set(m.code, m));

    // 2. 计算收益率并打印报告
    console.log('\n--- 📊 回测报告汇总 ---');
    console.log('代码\t名称\t预测日期\t建议\t预测价\t当前价\t收益率\t表现');

    let totalWin = 0;
    let totalCount = 0;

    for (const [code, info] of stockMap) {
        const market = marketMap.get(code);
        if (!market) continue;

        const currentPrice = parseFloat(market.current);

        for (const pred of info.predictions) {
            const diff = currentPrice - pred.predPrice;
            const profitRate = ((diff / pred.predPrice) * 100).toFixed(2);

            // 简单逻辑：如果建议买入且涨了，或者建议卖出且跌了，算预测正确
            const isBuy = pred.operation.includes('买') || pred.operation.includes('增持');
            const isSell = pred.operation.includes('卖') || pred.operation.includes('减持');

            let performance = '⚪';
            if ((isBuy && diff > 0) || (isSell && diff < 0)) {
                performance = '🔴 胜';
                totalWin++;
            } else if ((isBuy && diff < 0) || (isSell && diff > 0)) {
                performance = '🟢 负';
            }

            totalCount++;

            console.log(`${code}\t${info.name}\t${pred.date}\t${pred.operation}\t${pred.predPrice}\t${currentPrice}\t${profitRate}%\t${performance}`);
        }
    }

    if (totalCount > 0) {
        const totalAccuracy = ((totalWin / totalCount) * 100).toFixed(2);
        console.log(`\n📈 整体回测胜率: ${totalAccuracy}% (${totalWin}/${totalCount})`);
    }
    console.log('='.repeat(60) + '\n');
}

// 如果直接运行脚本
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runBacktest().catch(console.error);
}
