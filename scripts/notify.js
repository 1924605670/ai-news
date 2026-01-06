
import fetch from "node-fetch";

/**
 * Send markdown message to WeCom
 * @param {string} markdownContent - The markdown text to send
 * @param {string} key - The webhook key (optional, can use env var)
 */
export async function sendWeChatNotification(markdownContent, key = "") {
    // 优先使用完整的 WEBHOOK_URL 环境变量
    let url = process.env.WEBHOOK_URL;

    if (!url && key) {
        url = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${key}`;
    } else if (!url && !key) {
        // 兜底默认 key (如果需要)
        url = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=211f6bdc-01fd-49e3-bbea-0a9fc263ffce`;
    }


    if (!markdownContent) {
        console.warn("⚠️ No content to send to WeCom");
        return;
    }

    // WeCom markdown message limit is 4096 bytes. We need to truncate if too long.
    // Safety margin: 4000.
    let contentToSend = markdownContent;
    if (contentToSend.length > 4000) {
        contentToSend = contentToSend.substring(0, 3900) + "\n...(内容过长已截断)...";
    }

    const payload = {
        msgtype: "markdown",
        markdown: {
            content: contentToSend
        }
    };

    try {
        console.log(`🚀 Sending notification to WeCom...`);
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.errcode === 0) {
            console.log("✅ WeCom notification sent successfully");
        } else {
            console.error(`❌ WeCom notification failed: ${data.errmsg}`);
        }
    } catch (error) {
        console.error(`❌ Error sending WeCom notification: ${error.message}`);
    }
}
