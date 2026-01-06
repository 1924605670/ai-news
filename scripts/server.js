import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchHistoricalData } from './stock-indicators.js';
import { run, schedulerStatus } from './run.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const analysisDir = path.join(rootDir, 'analysis-results');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(rootDir, 'dashboard')));

/**
 * API: 获取所有分析文件列表
 */
app.get('/api/reports', (req, res) => {
    if (!fs.existsSync(analysisDir)) {
        return res.json([]);
    }
    const files = fs.readdirSync(analysisDir)
        .filter(f => f.startsWith('analysis-') && f.endsWith('.json'))
        .sort()
        .reverse();
    res.json(files);
});

/**
 * API: 获取单个报告详情
 */
app.get('/api/reports/:filename', (req, res) => {
    const filePath = path.join(analysisDir, req.params.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Report not found' });
    }
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to parse report' });
    }
});

/**
 * API: 手动触发分析任务
 */
app.post('/api/trigger', async (req, res) => {
    console.log('🚀 Manual trigger received');
    try {
        // 异步执行，不阻塞响应
        run().catch(e => console.error('Manual run failed:', e));
        res.json({ message: 'Task triggered successfully' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to trigger task' });
    }
});

/**
 * API: 获取股票 K 线数据
 */
app.get('/api/stock/kline/:code', async (req, res) => {
    try {
        const { period } = req.query;
        let scale = 240; // 默认日线
        let datalen = 30;

        if (period === '1d') {
            scale = 5;
            datalen = 48; // A 股一天 4 小时交易，48 个 5 分钟
        } else if (period === '5d') {
            scale = 60;
            datalen = 20; // 5 天交易时间总和映射到 60 分钟线
        }

        const data = await fetchHistoricalData(req.params.code, datalen, scale);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch K-line data' });
    }
});

/**
 * API: 获取整体统计数据
 */
app.get('/api/stats', (req, res) => {
    if (!fs.existsSync(analysisDir)) {
        return res.json({ totalPredictions: 0, winRate: 0 });
    }
    const files = fs.readdirSync(analysisDir)
        .filter(f => f.startsWith('analysis-') && f.endsWith('.json'))
        .slice(0, 30); // 最近30次

    let totalWin = 0;
    let totalCount = 0;
    const uniqueDays = new Set();

    files.forEach(file => {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(analysisDir, file), 'utf-8'));
            totalCount += data.analysis?.stockAnalysis?.length || 0;
            if (data.meta?.date) {
                uniqueDays.add(data.meta.date);
            }
        } catch (e) { }
    });

    res.json({
        totalReports: files.length,
        totalPredictions: totalCount,
        reportDays: uniqueDays.size,
        winRate: 0,
        scheduler: schedulerStatus
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Dashboard server running at http://localhost:${PORT}`);
});
