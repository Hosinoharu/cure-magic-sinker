/** 和本地程序通信，让本地程序处理 JS */

import { CureLogger, native_messaging_name } from "../share";
import { disable_http_server } from "./storage_manager";

const logger = new CureLogger("swc_worker");

// #region 与 native messaging 通信

/** 单例模式，和 native messaging 通信，处理文件 */
class SWCWorker {
    static readonly instance: SWCWorker = new SWCWorker();
    private channel: chrome.runtime.Port | null = null;
    private http_server_port: string = "";

    /** 发送消息时是一个异步过程，为了能准确处理对应的消息，所以使用 `id` 唯一标识。
     *
     * 在调用发送消息的函数之后，返回一个 Promise（内部保存），
     * 当内部收到 native messaging 返回的消息时，根据 `id` 找到对应的 Promise 并处理
     *
     * 为了避免长时间没有回复，所以设置了超时时间
     */
    private pending: Map<
        string,
        {
            resolve: (v: string) => void;
            reject: (e: any) => void;
            /** 定时器 */
            timer?: number;
            /** swc 无法一次性发送大量文件，所以需要分片发送，这里暂时缓存结果。
             * 在实现时是以按顺序处理的啦。注意！这里存储的是 base64 编码后的结果
             */
            buffer: string[];
            /** 记录该操作的类型 */
            op: OP;
        }
    > = new Map();

    private max_timeout = 10000;

    private constructor() {}

    /** 连接到本地程序 */
    public connect() {
        if (this.channel) {
            return;
        }

        this.channel = chrome.runtime.connectNative(native_messaging_name);

        this.channel.onDisconnect.addListener(() => {
            logger.log("native messaging disconnect");
            this.clear_pending();
            this.channel = null;
        });

        // 监听 native 返回的消息
        // #cure-warn native host 在处理文件后返回的都是 base64 编码的数据哟！！！
        // 其它的数据都是正常的啦
        // 当不是处理 js 时，应该将它们解码便于展示信息
        this.channel.onMessage.addListener((msg: OutMessage) => {
            const id = msg.id;
            const p = this.pending.get(id);
            if (!p) {
                logger.warn("no pending request for id", id, "message:", msg);
                return;
            }

            let done = true;

            if (msg.error && msg.error.length > 0) {
                p.reject(msg.error);
            } else {
                if (msg.next === undefined || msg.next === null) {
                    p.resolve(msg.result || "");
                }
                // 这是最后一次发送了
                else if (msg.next === 0) {
                    p.buffer.push(msg.result || "");
                    const result = p.buffer.join("");
                    if (p.op === "ProcessJS" || p.op === "ProcessHTML") {
                        p.resolve(result);
                    } else {
                        p.resolve(atob(result));
                    }
                    p.buffer = [];
                }
                // 分片处理
                else {
                    const order = msg.next!;
                    logger.log(
                        "received native message order:",
                        msg.id,
                        "=>",
                        order,
                    );
                    p.buffer.push(msg.result || "");
                    done = false;
                }
            }

            if (done) {
                clearTimeout(p.timer);
                this.pending.delete(id);
            }
        });
    }

    /** 断开连接 */
    public disconnect() {
        if (this.channel) {
            this.channel.postMessage(this.create_native_message("Exit"));
            this.channel.disconnect();
            this.clear_pending();
            this.channel = null;
        }
    }

    /** 拒绝所有待处理的消息 */
    private clear_pending() {
        this.pending.forEach((v) => {
            clearTimeout(v.timer);
            v.reject("native messaging disconnect");
        });
        this.pending.clear();
    }

    private create_native_message(op: OP, data?: string): InMessage {
        return {
            // #cure-tip 随机数生成
            id: crypto.randomUUID(),
            op,
            data,
        };
    }

    /** 发送消息给 native host */
    private send_native_message(msg: InMessage) {
        if (this.channel) {
            this.channel.postMessage(msg);
        } else {
            throw new Error("native messaging not connected");
        }
    }

    /** 发送消息给 native host，并等待返回结果 */
    private send_native_message_with_promise(msg: InMessage) {
        if (!this.channel) {
            return Promise.reject(new Error("native messaging not connected"));
        }

        // #cure-tip 返回的类型就是 OutMessage["result"] 类型啦
        return new Promise<string>((resolve, reject) => {
            // @ts-ignore
            const timer = setTimeout(() => {
                this.pending.delete(msg.id);
                reject(new Error("native request timeout"));
            }, this.max_timeout) as number;

            this.pending.set(msg.id, {
                resolve,
                reject,
                timer,
                buffer: [],
                op: msg.op,
            });

            try {
                this.send_native_message(msg);
            } catch (e) {
                clearTimeout(timer);
                this.pending.delete(msg.id);
                reject(e);
            }
        });
    }

    // #region 封装操作

    public async start_http_server(port: string) {
        this.http_server_port = port;
        return this.send_native_message_with_promise(
            this.create_native_message("StartHTTP", port),
        );
    }

    public async stop_http_server() {
        return this.send_native_message_with_promise(
            this.create_native_message("StopHTTP"),
        );
    }

    public async process_js(code: string) {
        return this.send_native_message_with_promise(
            this.create_native_message("ProcessJS", code),
        );
    }

    public async process_html(html: string) {
        return this.send_native_message_with_promise(
            this.create_native_message("ProcessHTML", html),
        );
    }

    /** 访问 http 服务器来处理 js，而不是使用 native messaging */
    public async process_js_with_http(code: string) {
        // #cure-warn 端口从配置项读取，然后发送给 native messaging
        const port = this.http_server_port;
        const local_server = `http://localhost:${port}/process-js`;
        try {
            const res = await fetch(local_server, {
                method: "POST",
                headers: {
                    "Content-Type": "application/javascript",
                },
                body: code,
            });
            const js_code = await res.text();
            return js_code;
        } catch (e) {
            logger.error("process js error:", e);
            return code;
        }
    }

    // #endregion
}

export const swc_worker = SWCWorker.instance;
chrome.runtime.onSuspend.addListener(() => {
    swc_worker.disconnect();
    disable_http_server();
});
chrome.runtime.onRestartRequired.addListener(() => {
    swc_worker.disconnect();
    disable_http_server();
});
/** 当结束调试模式时，应该结束本地程序。这说的是：点击浏览器横幅的【取消全部】调试哟 */
chrome.debugger.onDetach.addListener((_, reason) => {
    if (reason === "canceled_by_user") {
        swc_worker.disconnect();
        disable_http_server();
    }
});

// #cure-test 测试通信
function test_swc_worker() {
    setTimeout(async () => {
        await init_swc();

        // 普通 native messaging 来处理 js
        try {
            logger.log(await swc_worker.process_js("const a = 1;"));
        } catch (e) {
            logger.error("process js error:", e);
        }

        // 使用 http 服务器来处理 js
        try {
            logger.log(await swc_worker.start_http_server("9226"));
        } catch (e) {
            logger.error("start http server error:", e);
        }

        try {
            logger.log(await swc_worker.process_js_with_http("const b = 22;"));
        } catch (e) {
            logger.error("process js with http error:", e);
        }

        setTimeout(async () => {
            try {
                logger.log(await swc_worker.stop_http_server());
            } catch (e) {
                logger.error("stop http server error:", e);
            }
        }, 2000);
    }, 2000);
}

// test_swc_worker();

// #endregion

/** 应该在启用功能（也就是开始调试网页时）就启动本地程序 */
export async function init_swc() {
    swc_worker.connect();
}

/** 使用 swc 来处理 js 代码或者 html 文档
 *
 * 注意：`code` 是 base64 编码后的字符串（由本地程序处理），返回的也是 base64 编码后的字符串
 */
export async function swc_handle_code(code: string, type: ReWriteType) {
    try {
        return type === "js"
            ? await swc_worker.process_js(code)
            : await swc_worker.process_html(code);
    } catch (e) {
        logger.error(`swc handle ${type} code error:`, e);
        return code;
    }
}

// #cure-tip devtool 界面开启 http 服务
chrome.storage.onChanged.addListener(async (_changes, area) => {
    if (area === "local") {
        const changes = _changes as {
            [key in keyof ExtensionStorage]: chrome.storage.StorageChange;
        };
        const http_server = changes["http_server"]?.newValue as
            | ExtensionStorage["http_server"]
            | undefined;
        if (!http_server) {
            return;
        }

        if (http_server.on) {
            try {
                await init_swc();
                const res = await swc_worker.start_http_server(
                    http_server.port,
                );
                logger.log("start http server info:", res);
            } catch (e) {
                logger.error("start http server error:", e);
            }
        } else {
            try {
                const res = await swc_worker.stop_http_server();
                logger.log("stop http server info:", res);
            } catch (e: any) {
                if (!e.message.includes("native messaging not connected")) {
                    logger.error("stop http server error:", e);
                }
            }
        }
    }
});
