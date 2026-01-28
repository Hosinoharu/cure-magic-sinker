/** 和 background 通信，用于输出处理了哪些链接 */

const cure_wink = "#4060EE";
const cure_kyun = "#CD5FFB";
const base_style =
    "color:white; font-weight:bold; border-radius:3px; padding:2px 5px;";
const log_style = `background-color:${cure_wink};${base_style}`;
const warn_style = `background-color:${cure_kyun};${base_style}`;

/** 记录处理过的 js 信息。
 *
 * background 发来的消息顺序不确定哟，所以两种数据都保存到一起，看谁先到、后到再读取就好了
 */
const handled = new Map<string, MsgBTCMatch | MsgBTCDone>();

function log_handled(msg: MsgBTCMatch["data"], duration: string) {
    const prefix = msg.exclude ? "Exclude" : "Include";
    const rule_info = msg.exclude ? "" : `rule <${msg.rule}>`;

    console.log(
        `%c[CureMagicSinker Handle URI] %c %c<${duration} s>`,
        log_style,
        "",
        warn_style,
        `<${prefix}> ${rule_info}`,
        "\n    =>",
        msg.url,
    );
}

chrome.runtime.onMessage.addListener((msg: MsgBTC, sender, sendResponse) => {
    switch (msg.type) {
        case "ping":
            break;
        case "match":
            const done = handled.get(msg.data.id);
            if (!done) {
                handled.set(msg.data.id, msg);
            } else if (done.type === "done") {
                log_handled(msg.data, done.data.duration);
                handled.delete(msg.data.id);
            } else {
                console.warn("unexpected msg when match:", msg);
            }

            break;
        case "done":
            const match = handled.get(msg.data.id);
            if (!match) {
                handled.set(msg.data.id, msg);
            } else if (match.type === "match") {
                log_handled(match.data, msg.data.duration);
                handled.delete(msg.data.id);
            } else {
                console.warn("unexpected msg when done:", msg);
            }
            break;
    }
    sendResponse();
});
