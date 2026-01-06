import fetch from "node-fetch";
import { fetchStockData } from "./stock-tool.js";

/**
 * 延迟函数,避免请求过快被限制
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 获取股票历史K线数据(新浪财经接口)
 * @param {string} code - 股票代码
 * @param {number} days - 获取天数,默认60天
 * @param {number} scale - 采样频率,默认240(单位:分钟), 5表示5分钟, 60表示1小时, 240表示日线
 * @returns {Promise<Array>} K线数据数组
 */
export async function fetchHistoricalData(code, days = 60, scale = 240) {
    try {
        // ... construct prefix ...
        let prefix = 'sh';
        if (code.startsWith('0') || code.startsWith('3')) prefix = 'sz';
        if (code.startsWith('4') || code.startsWith('8')) prefix = 'bj';

        const symbol = `${prefix}${code}`;

        // 使用新浪财经历史数据接口，支持 scale 参数
        const url = `https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_${symbol}_${days}_${scale}_data=/CN_MarketDataService.getKLineData?symbol=${symbol}&scale=${scale}&datalen=${days}`;

        const response = await fetch(url, {
            headers: {
                "Referer": "https://finance.sina.com.cn/",
                "User-Agent": "Mozilla/5.0"
            }
        });

        const text = await response.text();

        // 解析JSONP响应
        const jsonMatch = text.match(/\[(.*)\]/s);
        if (!jsonMatch) return [];

        const data = JSON.parse('[' + jsonMatch[1] + ']');

        return data.map(item => ({
            day: item.day,
            open: parseFloat(item.open),
            high: parseFloat(item.high),
            low: parseFloat(item.low),
            close: parseFloat(item.close),
            volume: parseFloat(item.volume)
        }));

    } catch (error) {
        console.error(`  ❌ 获取${code}历史数据失败:`, error.message);
        return [];
    }
}

/**
 * 计算移动平均线(MA)
 * @param {Array} prices - 价格数组
 * @param {number} period - 周期
 * @returns {number} MA值
 */
function calculateMA(prices, period) {
    if (prices.length < period) return null;
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return (sum / period).toFixed(2);
}

/**
 * 计算RSI指标
 * @param {Array} prices - 收盘价数组
 * @param {number} period - 周期,默认14
 * @returns {number} RSI值
 */
function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;

    const changes = [];
    for (let i = 1; i < prices.length; i++) {
        changes.push(prices[i] - prices[i - 1]);
    }

    const recentChanges = changes.slice(-period);
    const gains = recentChanges.filter(c => c > 0);
    const losses = recentChanges.filter(c => c < 0).map(c => Math.abs(c));

    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi.toFixed(2);
}

/**
 * 计算KDJ指标
 * @param {Array} data - K线数据数组 {high, low, close}
 * @param {number} n - 周期,默认9
 * @param {number} m1 - M1,默认3
 * @param {number} m2 - M2,默认3
 * @returns {Object} KDJ数据 {k, d, j, signal}
 */
function calculateKDJ(data, n = 9, m1 = 3, m2 = 3) {
    if (data.length < n) return { k: null, d: null, j: null, signal: '数据不足' };

    let k = 50, d = 50;
    const results = [];

    for (let i = 0; i < data.length; i++) {
        if (i < n - 1) continue;

        const recentData = data.slice(i - n + 1, i + 1);
        const hn = Math.max(...recentData.map(d => d.high));
        const ln = Math.min(...recentData.map(d => d.low));
        const cn = data[i].close;

        const rsv = hn === ln ? 50 : ((cn - ln) / (hn - ln)) * 100;
        k = (rsv + (m1 - 1) * k) / m1;
        d = (k + (m2 - 1) * d) / m2;
        const j = 3 * k - 2 * d;

        results.push({ k, d, j });
    }

    const last = results[results.length - 1];
    let signal = '中性';
    if (last.k > last.d && results[results.length - 2]?.k <= results[results.length - 2]?.d) signal = '金叉';
    if (last.k < last.d && results[results.length - 2]?.k >= results[results.length - 2]?.d) signal = '死叉';
    if (last.j > 100) signal = '超买';
    if (last.j < 0) signal = '超卖';

    return {
        k: last.k.toFixed(2),
        d: last.d.toFixed(2),
        j: last.j.toFixed(2),
        signal
    };
}

/**
 * 计算MACD指标
 * @param {Array} prices - 收盘价数组
 * @returns {Object} MACD数据 {dif, dea, macd, signal}
 */
function calculateMACD(prices) {
    if (prices.length < 26) return { dif: null, dea: null, macd: null, signal: '数据不足' };

    // 计算EMA
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);

    if (!ema12 || !ema26) return { dif: null, dea: null, macd: null, signal: '数据不足' };

    const dif = ema12 - ema26;

    // 简化的DEA计算(实际应该是DIF的9日EMA)
    const dea = dif * 0.2; // 简化处理
    const macd = (dif - dea) * 2;

    let signal = '震荡';
    if (macd > 0) signal = dif > dea ? '多头' : '金叉';
    if (macd < 0) signal = dif < dea ? '空头' : '死叉';

    return {
        dif: dif.toFixed(2),
        dea: dea.toFixed(2),
        macd: macd.toFixed(2),
        signal
    };
}

/**
 * 计算EMA指数移动平均
 * @param {Array} prices - 价格数组
 * @param {number} period - 周期
 * @returns {number} EMA值
 */
function calculateEMA(prices, period) {
    if (prices.length < period) return null;

    const k = 2 / (period + 1);
    let ema = prices[0];

    for (let i = 1; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
    }

    return ema;
}

/**
 * 获取东方财富资金流向数据
 * @param {string} code - 股票代码
 * @returns {Promise<Object>} 资金流向数据
 */
async function fetchCapitalFlow(code) {
    try {
        // 使用东方财富资金流向接口
        let secid = code.startsWith('6') ? `1.${code}` : `0.${code}`;

        const url = `http://push2.eastmoney.com/api/qt/stock/fflow/kline/get?` +
            `secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57&` +
            `klt=101&lmt=1&cb=`;

        const response = await fetch(url, {
            headers: {
                "Referer": "http://quote.eastmoney.com/",
                "User-Agent": "Mozilla/5.0"
            }
        });

        const data = await response.json();

        if (data?.data?.klines && data.data.klines.length > 0) {
            const latest = data.data.klines[data.data.klines.length - 1].split(',');

            return {
                mainInflow: (parseFloat(latest[1]) / 10000).toFixed(2), // 主力净流入(万元)
                superInflow: (parseFloat(latest[2]) / 10000).toFixed(2), // 超大单净流入
                bigInflow: (parseFloat(latest[3]) / 10000).toFixed(2), // 大单净流入
                midInflow: (parseFloat(latest[4]) / 10000).toFixed(2), // 中单净流入
                smallInflow: (parseFloat(latest[5]) / 10000).toFixed(2), // 小单净流入
                mainInflowRate: (latest[6] && latest[6] !== 'undefined') ? latest[6] + '%' : '-' // 主力净流入占比
            };
        }

        return {
            mainInflow: '0.00',
            superInflow: '0.00',
            bigInflow: '0.00',
            midInflow: '0.00',
            smallInflow: '0.00',
            mainInflowRate: '0%'
        };

    } catch (error) {
        console.error(`  ⚠️ 获取${code}资金流向失败:`, error.message);
        return {
            mainInflow: '-',
            superInflow: '-',
            bigInflow: '-',
            midInflow: '-',
            smallInflow: '-',
            mainInflowRate: '-'
        };
    }
}

/**
 * 分析价格与均线关系
 * @param {number} currentPrice - 当前价格
 * @param {number} ma - 均线值
 * @returns {string} 关系描述
 */
function analyzePriceVsMA(currentPrice, ma) {
    if (!ma) return '-';

    const diff = ((currentPrice - ma) / ma * 100).toFixed(2);

    if (Math.abs(diff) < 0.5) return '持平';
    if (diff > 0) return `上方+${diff}%`;
    return `下方${diff}%`;
}

/**
 * 获取扩展的股票数据(包含技术指标)
 * @param {Array} codes - 股票代码数组
 * @returns {Promise<Array>} 扩展股票数据数组
 */
export async function fetchExtendedStockData(codes) {
    if (!codes || codes.length === 0) return [];

    console.log(`   📊 开始获取${codes.length}只股票的扩展数据...`);

    // 1. 获取基础行情数据
    const basicData = await fetchStockData(codes);

    // 2. 为每只股票获取技术指标
    const extendedData = [];

    for (let i = 0; i < basicData.length; i++) {
        const stock = basicData[i];
        console.log(`      [${i + 1}/${basicData.length}] 处理 ${stock.name} (${stock.code})...`);

        // 获取历史数据
        const histData = await fetchHistoricalData(stock.code, 60);
        await sleep(300); // 请求间隔,避免被限制

        let indicators = {
            volume: stock.volume || '-',
            turnoverRate: '-',
            ma5: null,
            ma10: null,
            ma20: null,
            ma60: null,
            rsi: null,
            macd: null,
            priceVsMA5: '-',
            priceVsMA10: '-',
            macdSignal: '-',
            mainCapitalFlow: '-',
            capitalFlowRate: '-'
        };

        if (histData.length >= 20) {
            const closePrices = histData.map(d => d.close);
            const volumes = histData.map(d => d.volume);

            // 计算均线
            indicators.ma5 = calculateMA(closePrices, 5);
            indicators.ma10 = calculateMA(closePrices, 10);
            indicators.ma20 = calculateMA(closePrices, 20);
            indicators.ma60 = calculateMA(closePrices, 60);

            // 计算RSI
            indicators.rsi = calculateRSI(closePrices, 14);

            // 计算KDJ
            const kdjData = calculateKDJ(histData);
            indicators.kdj = kdjData;
            indicators.kdjSignal = kdjData.signal;

            // 分析价格与均线关系
            const currentPrice = parseFloat(stock.current);
            indicators.priceVsMA5 = analyzePriceVsMA(currentPrice, parseFloat(indicators.ma5));
            indicators.priceVsMA10 = analyzePriceVsMA(currentPrice, parseFloat(indicators.ma10));

            console.log(`         ✓ 技术指标: RSI=${indicators.rsi}, MA5=${indicators.ma5}, MACD=${indicators.macdSignal}, KDJ=${indicators.kdjSignal}`);
        } else {
            console.log(`         ⚠️ 历史数据不足,跳过技术指标计算`);
        }

        // 获取资金流向
        const capitalFlow = await fetchCapitalFlow(stock.code);
        indicators.mainCapitalFlow = capitalFlow.mainInflow;
        indicators.capitalFlowRate = capitalFlow.mainInflowRate;
        await sleep(300);

        console.log(`         ✓ 资金流向: 主力净流入=${indicators.mainCapitalFlow}万元`);

        extendedData.push({
            ...stock,
            technicalIndicators: indicators
        });
    }

    console.log(`   ✅ 扩展数据获取完成`);
    return extendedData;
}
