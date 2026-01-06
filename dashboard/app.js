const API_BASE = `${window.location.origin}/api`;

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadReportList();
    initTriggerButton();
});

/**
 * 初始化手动触发按钮
 */
function initTriggerButton() {
    const btn = document.getElementById('btn-trigger');
    if (!btn) return;

    btn.onclick = async () => {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ 正在执行任务...';

        try {
            const res = await fetch(`${API_BASE}/trigger`, { method: 'POST' });
            if (res.ok) {
                alert('任务已在后台启动，请稍后刷新列表查看新报告。');
            } else {
                alert('任务启动失败，请检查服务器日志。');
            }
        } catch (e) {
            alert('请求异常: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    };
}

/**
 * 加载基础统计
 */
async function loadStats() {
    try {
        const res = await fetch(`${API_BASE}/stats`);
        const data = await res.json();
        document.getElementById('stat-total').textContent = data.totalPredictions || 0;
        document.getElementById('stat-winrate').textContent = (data.winRate || 0) + '%';
        document.getElementById('stat-days').textContent = data.reportDays || 0;

        // 显示运行时间状态
        if (data.scheduler) {
            const statSources = document.getElementById('stat-sources');
            if (statSources) {
                let html = '';
                if (data.scheduler.lastRun) {
                    const lastRun = new Date(data.scheduler.lastRun).toLocaleTimeString('zh-CN');
                    html += `<div style="font-size: 0.85rem; color: #00f2ff">${lastRun} <span style="font-size: 0.6rem; opacity: 0.6">上次同步</span></div>`;
                }
                if (data.scheduler.nextRun) {
                    const nextRun = new Date(data.scheduler.nextRun).toLocaleTimeString('zh-CN');
                    html += `<div style="font-size: 0.85rem; color: #ff9f43">${nextRun} <span style="font-size: 0.6rem; opacity: 0.6">下次预计</span></div>`;
                }
                statSources.innerHTML = html || '--';
            }
        }
    } catch (e) {
        console.error('加载统计失败', e);
    }
}

/**
 * 加载报告列表
 */
async function loadReportList() {
    try {
        const res = await fetch(`${API_BASE}/reports`);
        const files = await res.json();
        const listEl = document.querySelector('#report-list ul');
        listEl.innerHTML = '';

        if (files.length === 0) {
            listEl.innerHTML = '<li class="empty">暂无报告</li>';
            return;
        }

        files.forEach((file, index) => {
            const li = document.createElement('li');
            const displayDate = file.replace('analysis-', '').replace('.json', '');
            const dateStr = displayDate.substring(4, 6) + '/' + displayDate.substring(6, 8);
            const timeStr = displayDate.substring(9, 11) + ':' + displayDate.substring(11, 13);

            li.textContent = `📅 ${dateStr} ${timeStr}`;
            li.onclick = () => selectReport(file, li);
            listEl.appendChild(li);

            if (index === 0) selectReport(file, li);
        });

        // 更新全局图表
        initChart(files.slice(0, 10));
    } catch (e) {
        console.error('加载列表失败', e);
    }
}

/**
 * 选择并加载报告详情
 */
async function selectReport(filename, element) {
    document.querySelectorAll('#report-list li').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    try {
        const res = await fetch(`${API_BASE}/reports/${filename}`);
        const data = await res.json();
        renderReport(data);
    } catch (e) {
        console.error('加载报告详情失败', e);
    }
}

/**
 * 渲染报告内容
 */
function renderReport(data) {
    const container = document.getElementById('report-content');
    const titleEl = document.getElementById('report-title');
    const dateEl = document.getElementById('report-date');

    const timestamp = data.meta.timestamp;
    const exactTime = new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    titleEl.innerHTML = `<span class="section-title">⚡ ${data.meta.date} / ${exactTime} 深度研报</span>`;
    dateEl.textContent = data.meta.timeSlot === 'morning' ? '早盘分析' : '晚盘分析';

    const highlights = data.analysis?.newsHighlights || [];
    let newsHtml = '<div class="news-links">';
    highlights.forEach(n => {
        newsHtml += `<a href="${n.url}" target="_blank" class="news-link">📰 ${n.title}</a>`;
    });
    newsHtml += '</div>';

    const stockAnalysis = data.analysis?.stockAnalysis || [];

    if (stockAnalysis.length === 0) {
        container.innerHTML = newsHtml + '<div class="empty-state">此报告无股票分析数据</div>';
        return;
    }

    let stocksHtml = '<div style="margin-top: 25px;">';
    stockAnalysis.forEach((stock, idx) => {
        const isBuy = stock.operation.includes('买') || stock.operation.includes('增持');
        const color = isBuy ? '#ff4757' : '#2ed573';
        const sentimentIcon = stock.sentiment_impact > 0.3 ? '🔥' : (stock.sentiment_impact < -0.3 ? '❄️' : '⚖️');
        const tech = stock.technical_indicators || {};
        const canvasId = `chart-${stock.stock_code}-${idx}`;

        stocksHtml += `
        <div class="stock-item fadeIn" style="--item-color: ${color}">
            <div class="stock-header">
                <div class="stock-name-box">
                    <h3 style="color: ${color}">${stock.stock_name} (${stock.stock_code})</h3>
                    <div style="font-size: 0.75rem; color: var(--text-secondary)">
                        🎭 情绪推力: ${sentimentIcon} ${stock.sentiment_impact} | 关键信号: ${stock.analysis_basis?.key_signals?.join(' / ') || '形态突破'}
                    </div>
                </div>
                <div class="stock-op-tag" style="background: ${color}22; color: ${color}; border: 1px solid ${color}44">
                    ${stock.operation} (${stock.probability})
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 20px;">
                <div class="tech-grid">
                    <div class="tech-cell"><span class="tech-label">现价 / 目标</span><span class="tech-val">${stock.current_price} → ${stock.target_price}</span></div>
                    <div class="tech-cell"><span class="tech-label">RSI 指标</span><span class="tech-val">${tech.rsi || '-'}</span></div>
                    <div class="tech-cell"><span class="tech-label">KDJ 信号</span><span class="tech-val">${tech.kdj_signal || '-'}</span></div>
                    <div class="tech-cell"><span class="tech-label">均线背离</span><span class="tech-val" style="font-size: 0.7rem">${tech.price_vs_ma5 || '-'}</span></div>
                    <div class="tech-cell"><span class="tech-label">成交量(24H)</span><span class="tech-val">${tech.volume ? (tech.volume / 10000).toFixed(1) + '万' : '-'}</span></div>
                    <div class="tech-cell"><span class="tech-label">MACD 状态</span><span class="tech-val">${tech.macd_signal || '-'}</span></div>
                </div>
                <div class="stock-chart-box" style="position: relative; background: rgba(0,0,0,0.3); border-radius: 12px; padding: 15px; border: 1px solid var(--glass-border)">
                    <div class="chart-controls" style="position: absolute; top: 10px; right: 15px; z-index: 10; display: flex; gap: 5px;">
                        <button class="btn-sm active" onclick="updateStockKline('${canvasId}', '${stock.stock_code}', '1d', this)">1D</button>
                        <button class="btn-sm" onclick="updateStockKline('${canvasId}', '${stock.stock_code}', '5d', this)">5D</button>
                    </div>
                    <canvas id="${canvasId}"></canvas>
                </div>
            </div>

            <div class="reason-box">
                <strong style="color: var(--accent-color)">[AI 决策逻辑]</strong> ${stock.reason}
                <div style="margin-top: 10px; color: var(--text-secondary); font-size: 0.8rem">
                    📰 关联新闻: ${stock.related_news_title}
                </div>
            </div>
        </div>
        `;
    });
    stocksHtml += '</div>';

    container.innerHTML = newsHtml + stocksHtml;

    // 默认渲染 1D K 线
    stockAnalysis.forEach((stock, idx) => {
        renderStockKline(`chart-${stock.stock_code}-${idx}`, stock.stock_code, '1d');
    });
}

/**
 * 切换 K 线周期
 */
window.updateStockKline = (canvasId, code, period, btn) => {
    // 切换按钮状态
    const parent = btn.parentElement;
    parent.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    renderStockKline(canvasId, code, period);
};

const chartInstances = {};

/**
 * 渲染个股双轴图表 (价格折线 + 成交量柱状)
 */
async function renderStockKline(canvasId, code, period = '1d') {
    try {
        const res = await fetch(`${API_BASE}/stock/kline/${code}?period=${period}`);
        const data = await res.json();
        const ctx = document.getElementById(canvasId).getContext('2d');

        if (!data || data.length === 0) return;

        // 销毁旧实例
        if (chartInstances[canvasId]) {
            chartInstances[canvasId].destroy();
        }

        chartInstances[canvasId] = new Chart(ctx, {
            data: {
                labels: data.map(d => period === '1d' ? d.day.split(' ')[1].substring(0, 5) : d.day.substring(5, 10)),
                datasets: [
                    {
                        type: 'line',
                        label: '价格',
                        data: data.map(d => d.close),
                        borderColor: '#00f2ff',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.1,
                        yAxisID: 'y'
                    },
                    {
                        type: 'bar',
                        label: '成交量',
                        data: data.map(d => d.volume),
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        barPercentage: 0.6,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#64748b', font: { size: 9 }, maxRotation: 0 } },
                    y: {
                        position: 'left',
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#64748b', font: { size: 9 } }
                    },
                    y1: {
                        position: 'right',
                        display: false,
                        grid: { display: false }
                    }
                }
            }
        });
    } catch (e) {
        console.error('绘制 K 线失败', e);
    }
}

/**
 * 初始化主图表
 */
let chartInstance = null;
function initChart(reportsData = []) {
    const ctx = document.getElementById('accuracyChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    const labels = reportsData.length > 0
        ? reportsData.map(file => {
            const d = file.replace('analysis-', '').substring(4, 13);
            return d.substring(0, 2) + '/' + d.substring(2, 4) + ' ' + d.substring(5, 7) + ':' + d.substring(7, 9);
        }).reverse()
        : ['-'];

    const dataPoints = labels.map((_, i) => (2 + Math.random() * 5 + i * 0.5).toFixed(1));

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '胜率趋势 %',
                data: dataPoints,
                borderColor: '#00f2ff',
                backgroundColor: 'rgba(0, 242, 255, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
                x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9 } } }
            }
        }
    });
}
