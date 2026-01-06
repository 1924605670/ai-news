const API_BASE = 'http://localhost:3000/api';

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
        document.getElementById('stat-days').textContent = data.totalReports || 0;
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

    titleEl.textContent = `${data.meta.date} ${data.meta.timeSlot === 'morning' ? '早盘' : '晚盘'}分析`;
    dateEl.textContent = data.meta.timestamp.split('T')[0];

    const stockAnalysis = data.analysis?.stockAnalysis || [];

    if (stockAnalysis.length === 0) {
        container.innerHTML = '<div class="empty-state">此报告无股票分析数据</div>';
        return;
    }

    let html = '';
    stockAnalysis.forEach(stock => {
        const isBuy = stock.operation.includes('买') || stock.operation.includes('增持');
        const opClass = isBuy ? 'op-buy' : 'op-sell';
        const sentimentIcon = stock.sentiment_impact > 0.3 ? '🔥' : (stock.sentiment_impact < -0.3 ? '❄️' : '⚖️');

        html += `
        <div class="stock-item fadeIn">
            <div class="stock-header">
                <div>
                    <span class="stock-name">${stock.stock_name}</span>
                    <span class="stock-code" style="color: #94a3b8; font-size: 0.8rem; margin-left: 8px;">${stock.stock_code}</span>
                </div>
                <span class="stock-op ${opClass}">${stock.operation} (${stock.probability})</span>
            </div>
            
            <div class="stock-grid">
                <div class="data-point">
                    <span class="dp-label">现价</span>
                    <span class="dp-value">${stock.current_price}</span>
                </div>
                <div class="data-point">
                    <span class="dp-label">目标价</span>
                    <span class="dp-value" style="color: #60a5fa; font-weight: 600;">${stock.target_price}</span>
                </div>
                <div class="data-point">
                    <span class="dp-label">情绪推力</span>
                    <span class="dp-value">${sentimentIcon} ${stock.sentiment_impact}</span>
                </div>
                <div class="data-point">
                    <span class="dp-label">技术指标</span>
                    <span class="dp-value" style="font-size: 0.7rem;">RSI:${stock.technical_indicators?.rsi || '-'} | MACD:${stock.technical_indicators?.macd_signal || '-'}</span>
                </div>
            </div>

            <div class="reason-box">
                <strong>分析依据：</strong>${stock.reason}
            </div>
        </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * 初始化图表
 */
function initChart() {
    const ctx = document.getElementById('accuracyChart').getContext('2d');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
            datasets: [{
                label: '回测收益率 %',
                data: [1.2, 2.5, -0.8, 3.1, 1.8, 4.2, 3.8],
                borderColor: '#3b82f6',
                backgroundGradient: 'linear-gradient(180deg, rgba(59, 130, 246, 0.2) 0%, rgba(59, 130, 246, 0) 100%)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}
