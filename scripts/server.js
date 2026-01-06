import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
            // 这里暂时只统计数量，具体的“胜负”标签需结合实时价格回测
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
        // 胜率以后端回测数据为准，此处返回占位
        winRate: 0
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Dashboard server running at http://localhost:${PORT}`);
});
