import { run } from "./run.js";

const INTERVAL_MINUTES = 5;
const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000;

// 同步时间窗口到环境变量
process.env.NEWS_TIME_WINDOW_MINUTES = INTERVAL_MINUTES.toString();

console.log(`🚀 Starting News Bot Scheduler`);
console.log(`⏰ Schedule: Run every ${INTERVAL_MINUTES} minutes`);

async function loop() {
    try {
        console.log(`\n\n[Scheduler] Triggering run at ${new Date().toLocaleString()}`);
        await run();
    } catch (error) {
        console.error(`[Scheduler] Run failed:`, error);
    } finally {
        console.log(`[Scheduler] Next run in ${INTERVAL_MINUTES} minutes...`);
        setTimeout(loop, INTERVAL_MS);
    }
}

// Start immediately
loop();
