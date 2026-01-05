import fetch from "node-fetch";

/**
 * Fetch real-time stock data from Sina Finance
 * @param {string[]} codes - Array of stock codes (e.g. ['600519', '000001'])
 * @returns {Promise<Object[]>} - Array of stock info objects
 */
export async function fetchStockData(codes) {
    if (!codes || codes.length === 0) return [];

    const list = codes.map(code => {
        // Basic prefix logic for A-share
        if (code.startsWith('6')) return `sh${code}`;
        if (code.startsWith('0') || code.startsWith('3')) return `sz${code}`;
        if (code.startsWith('4') || code.startsWith('8')) return `bj${code}`;
        return `sh${code}`; // default fallback
    }).join(',');

    const url = `http://hq.sinajs.cn/list=${list}`;

    try {
        const response = await fetch(url, {
            headers: {
                "Referer": "https://finance.sina.com.cn/"
            }
        });

        const buffer = await response.arrayBuffer();

        // Try to decode GBK
        let text = "";
        try {
            const decoder = new TextDecoder("gbk");
            text = decoder.decode(buffer);
        } catch (e) {
            // Fallback to utf-8 if gbk fails (Name might be garbage but numbers are fine)
            const decoder = new TextDecoder("utf-8");
            text = decoder.decode(buffer);
        }

        const results = [];
        // Parse lines: var hq_str_sh600519="贵州茅台,1700.00,...";
        const lines = text.split('\n');

        for (const line of lines) {
            const match = line.match(/var hq_str_([a-z]{2})(\d+)="([^"]+)";/);
            if (match) {
                const fullCode = match[1] + match[2];
                const code = match[2];
                const data = match[3].split(',');

                if (data.length > 30) {
                    const name = data[0];
                    const open = parseFloat(data[1]);
                    const preClose = parseFloat(data[2]);
                    const current = parseFloat(data[3]);
                    const high = parseFloat(data[4]);
                    const low = parseFloat(data[5]);
                    const date = data[30];
                    const time = data[31];

                    let changePercent = 0;
                    if (preClose > 0 && current > 0) {
                        changePercent = ((current - preClose) / preClose) * 100;
                    }

                    results.push({
                        code,
                        fullCode,
                        name,
                        current: current.toFixed(2),
                        changePercent: changePercent.toFixed(2) + '%',
                        preClose,
                        open,
                        high,
                        low,
                        date,
                        time
                    });
                }
            }
        }
        return results;

    } catch (error) {
        console.error("fetchStockData error:", error);
        return [];
    }
}
