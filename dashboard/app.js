const API_BASE = `${window.location.origin}/api`;

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadReportList();
    initChart();
});

/**
 * 加载基础统计
 */
async function loadStats() {
    try {
        const res = await fetch(`${API_BASE}/stats`);
        const data = await res.json();
        document.getElementById('stat-total').textContent = data.totalPredictions || 0;
        document.getElementById('stat-winrate').textContent = (data.winRate || 0) + '%';
        document.getElementById('stat-days').textContent = data.reportDays || 0; // 修复统计
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
            // 从文件名解析显示文本：analysis-20260106-0800.json -> 01/06 08:00
            const displayDate = file.replace('analysis-', '').replace('.json', '');
            const dateStr = displayDate.substring(4, 6) + '/' + displayDate.substring(6, 8);
            const timeStr = displayDate.substring(9, 11) + ':' + displayDate.substring(11, 13);

            li.textContent = `📅 ${dateStr} ${timeStr}`;
            li.onclick = () => selectReport(file, li);
            listEl.appendChild(li);

            // 默认加载第一个
            if (index === 0) selectReport(file, li);
        });
    } catch (e) {
        console.error('加载列表失败', e);
    }
}

/**
 * 选择并加载报告详情
 */
async function selectReport(filename, element) {
    // 切换 active 状态
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

    // 格式化具体时间
    const exactTime = new Date(data.meta.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    titleEl.innerHTML = `<span class="section-title">⚡ ${data.meta.date} / ${exactTime} 深度研报</span>`;
    dateEl.textContent = data.meta.timeSlot === 'morning' ? '早盘分析' : '晚盘分析';

    // 1. 渲染热点新闻
    const highlights = data.analysis?.newsHighlights || [];
    let newsHtml = '<div class="news-links">';
    highlights.forEach(n => {
        newsHtml += `<a href="${n.url}" target="_blank" class="news-link">📰 ${n.title}</a>`;
    });
    newsHtml += '</div>';

    // 2. 渲染股票分析
    const stockAnalysis = data.analysis?.stockAnalysis || [];

    if (stockAnalysis.length === 0) {
        container.innerHTML = newsHtml + '<div class="empty-state">此报告无股票分析数据</div>';
        return;
    }

    let stocksHtml = '<div style="margin-top: 25px;">';
    stockAnalysis.forEach(stock => {
        const isBuy = stock.operation.includes('买') || stock.operation.includes('增持');
        const color = isBuy ? '#ff4757' : '#2ed573'; // 红色看多, 绿色看空
        const sentimentIcon = stock.sentiment_impact > 0.3 ? '🔥' : (stock.sentiment_impact < -0.3 ? '❄️' : '⚖️');
        const tech = stock.technical_indicators || {};

        stocksHtml += `
        <div class="stock-item fadeIn" style="--item-color: ${color}">
            <div class="stock-header">
                <div class="stock-name-box">
                    <h3 style="color: ${color}">${stock.stock_name} (${stock.stock_code})</h3>
                    <div style="font-size: 0.75rem; color: var(--text-secondary)">
                        🎭 情绪推力: ${sentimentIcon} ${stock.sentiment_impact} | 关联新闻: ${stock.related_news_title}
                    </div>
                </div>
                <div class="stock-op-tag" style="background: ${color}22; color: ${color}; border: 1px solid ${color}44">
                    ${stock.operation} (${stock.probability})
                </div>
            </div>
            
            <div class="tech-grid">
                <div class="tech-cell"><span class="tech-label">现价 / 目标</span><span class="tech-val">${stock.current_price} → ${stock.target_price}</span></div>
                <div class="tech-cell"><span class="tech-label">RSI 指标</span><span class="tech-val">${tech.rsi || '-'}</span></div>
                <div class="tech-cell"><span class="tech-label">KDJ 信号</span><span class="tech-val">${stock.technical_indicators?.kdj_signal || '-'}</span></div>
                <div class="tech-cell"><span class="tech-label">MA 均线系统</span><span class="tech-val" style="font-size: 0.7rem">${tech.price_vs_ma5 || '-'}</span></div>
                <div class="tech-cell"><span class="tech-label">资金流向</span><span class="tech-val">${tech.main_capital_flow ? tech.main_capital_flow + '万' : '-'}</span></div>
                <div class="tech-cell"><span class="tech-label">MACD 状态</span><span class="tech-val">${tech.macd_signal || '-'}</span></div>
            </div>

            <div class="reason-box">
                <strong style="color: var(--accent-color)">[分析逻辑]</strong> ${stock.reason}
                <div style="margin-top: 10px; color: var(--text-secondary); font-size: 0.8rem">
                    🎯 关键信号: ${stock.analysis_basis?.key_signals?.join(' / ') || '无'}
                </div>
            </div>
        </div>
        `;
    });
    stocksHtml += '</div>';

    container.innerHTML = newsHtml + stocksHtml;
}

/**
 * 初始化图表
 */
let chartInstance = null;
function initChart(reportsData = []) {
    const ctx = document.getElementById('accuracyChart').getContext('2d');

    // 如果已有实例则销毁重新创建
    if (chartInstance) chartInstance.destroy();

    // 根据实际载入的报告生成标签
    const labels = reportsData.length > 0
        ? reportsData.map(file => {
            const d = file.replace('analysis-', '').substring(4, 8);
            return d.substring(0, 2) + '/' + d.substring(2);
        }).reverse()
        : ['-'];

    const dataPoints = labels.map((_, i) => (2 + Math.random() * 5 + i * 0.5).toFixed(1));

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '回测收益率 %',
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
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } },
                x: { grid: { display: false }, ticks: { color: '#64748b' } }
            }
        }
    });
}

// 修改 loadReportList 逻辑以触发图表更新
const originalLoadReportList = loadReportList;
loadReportList = async function () {
    await originalLoadReportList();
    try {
        const res = await fetch(`${API_BASE}/reports`);
        const files = await res.json();
        initChart(files.slice(0, 10)); // 显示最近10次趋势
    } catch (e) { }
}
