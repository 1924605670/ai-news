import fs from "fs";
import path from "path";

const HISTORY_FILE = path.join(process.cwd(), "data", "processed_history.json");

// Ensure data directory exists
if (!fs.existsSync(path.dirname(HISTORY_FILE))) {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
}

export class HistoryManager {
    constructor() {
        this.history = new Set();
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(HISTORY_FILE)) {
                const data = fs.readFileSync(HISTORY_FILE, "utf-8");
                const json = JSON.parse(data);
                if (Array.isArray(json)) {
                    this.history = new Set(json);
                }
            }
        } catch (e) {
            console.error("⚠️ Failed to load history:", e.message);
            this.history = new Set();
        }
    }

    save() {
        try {
            // Keep only last 1000 items to prevent infinite growth
            const arr = Array.from(this.history).slice(-1000);
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(arr, null, 2), "utf-8");
        } catch (e) {
            console.error("⚠️ Failed to save history:", e.message);
        }
    }

    isProcessed(url) {
        if (!url) return false;
        return this.history.has(url);
    }

    add(url) {
        if (url) {
            this.history.add(url);
        }
    }
}
