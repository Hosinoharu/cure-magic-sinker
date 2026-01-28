/** 拦截与重写响应，当前主要对以下内容进行拦截处理：
 * - HTML 文档。提前其中的 script 标签，并处理其中的 js 代码
 * - JS 文件，目前有两种情况：
 *     - 普通的 js 文档，即 `<script src="xx.js">`
 *     - new Worker('xx.js') 等请求的 js 文件
 *
 * TIP: 暂时不处理 `worker` 中的 `js`，似乎是多此一举，以后再说，
 * 后续搜索 `#cure-noworker` 来定位到相关代码
 */

import { CureLogger } from "../share";
import Protocol from "../types/cdp";
import { get_global_ignore_rules, get_rule_by_url } from "./storage_manager";
import { init_swc, swc_handle_code } from "./swc_worker";
import { get_taId_main_iframe, save_tabId_main_iframe } from "../share";

const logger = new CureLogger("rewriter");

export async function start_debugger(tabId: number) {
    try {
        await chrome.debugger.attach({ tabId }, "1.3");
        await chrome.debugger.sendCommand({ tabId }, "Network.enable");
        // https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#method-enable
        // #cure-warn 拦截指定的资源
        // 因为只需要拦截 html、js 等资源，所以在这里提前指定，这样后面就能减少一些判断哟
        // 不要在 `response state` 才进行拦截，在 `request state` 能根据链接进行提前过滤
        const patterns: Protocol.Fetch.RequestPattern[] = [
            { resourceType: "Document" },
            { resourceType: "Script" },
            // #cure-noworker
            // new Worker('xx.js') 等请求的 js 文件哟
            // { resourceType: "Other" },
        ];
        await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
            patterns,
        });

        // #cure-tip 尽快启动
        await init_swc();
    } catch (e: any) {
        if (!e.message.includes("Another debugger is already attached")) {
            logger.error("start_debugger error", e.message);
        }
    }
}

export async function stop_debugger(tabId: number) {
    try {
        await chrome.debugger.detach({ tabId });
    } catch {}
}

chrome.debugger.onDetach.addListener((source, reason) => {
    if (reason === "target_closed") {
        source.tabId && start_debugger(source.tabId);
    }
});

/** 和 swc worker 通信来处理 code */
async function rewrite_code(code: string, type: ReWriteType) {
    return await swc_handle_code(code, type);
}

// #cure-tip 监听 cdp 消息并重写响应
// 触发的相关事件：
// 1. Network.requestWillBeSent
// 2. Fetch.requestPaused
// 3. Network.requestWillBeSentExtraInfo
// 4. Network.responseReceivedExtraInfo
// 5. Network.responseReceived
// 6. Network.dataReceived
// 7. Network.loadingFinished
chrome.debugger.onEvent.addListener(async (source, method, params) => {
    // logger.log("CDP message", method, "=>", params);

    const tabId = source.tabId;
    const requestId = (params as any).requestId as string;

    if (
        requestId === undefined ||
        tabId === undefined ||
        tabId === chrome.tabs.TAB_ID_NONE
    ) {
        return;
    }

    // 现在需要知道每一个标签页的 main frame id，从而过滤到 iframe 中的请求
    // 通过该事件可以过滤出来
    // https://chromedevtools.github.io/devtools-protocol/tot/Network/#event-requestWillBeSent
    if (method === "Network.requestWillBeSent") {
        const temp = params as Protocol.Network.RequestWillBeSentEvent;
        if (temp.type === "Document" && temp.initiator.type === "other") {
            await save_tabId_main_iframe(tabId, temp.frameId);
        }

        return;
    }

    // https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#event-requestPaused
    if (method === "Fetch.requestPaused") {
        const temp = params as Protocol.Fetch.RequestPausedEvent;

        // request state
        if (temp.responseStatusCode === undefined) {
            const ok = await is_from_main_iframe(tabId, temp.frameId);
            if (ok) {
                logger.log(
                    "request paused",
                    "Type:",
                    temp.resourceType,
                    "=>",
                    temp.request.url,
                );
            }

            const is_target = ok && (await should_handle_by_rule(tabId, temp));
            await send_fetch_continue_request(tabId, requestId, is_target);
        }
        // response state
        else {
            const type = get_rewrite_resource_type(temp);
            if (type === undefined) {
                return await send_fetch_fulfill_request(tabId, temp);
            }

            try {
                const code = await get_req_response(tabId, requestId);
                const length = code.length;
                const start = performance.now();
                const new_code = await rewrite_code(code, type);

                const duration = ((performance.now() - start) / 1000).toFixed(
                    2,
                );
                logger.log(
                    `handle ${type} code done`,
                    duration,
                    "s",
                    "=> length:",
                    length,
                );
                const msg: MsgBTC = {
                    type: "done",
                    data: { id: requestId, duration },
                };
                log_to_content(tabId, msg);

                if (type === "html") {
                    remove_csp_header(temp);
                }

                await send_fetch_fulfill_request(tabId, temp, new_code);
            } catch (e: any) {
                logger.error("handle code error", e.message);
                await send_fetch_fulfill_request(tabId, temp);
            }
        }
    }
});

function remove_csp_header(params: Protocol.Fetch.RequestPausedEvent) {
    // #cure-tip 移除 csp header
    if (params.responseHeaders === undefined) {
        return;
    }

    const headers = params.responseHeaders;
    const new_headers = headers.filter((header) => {
        return !header.name.toLowerCase().includes("content-security-policy");
    });

    params.responseHeaders = new_headers;
}

function is_rule_match_url(rule: OneRule, url: string) {
    if (!rule.enable) {
        return false;
    }
    try {
        return new RegExp(rule.rule).test(url);
    } catch {}
    return false;
}

/** 获取要重写的资源类型 —— 在开启 Fetch 请求拦截时，已经设立了目标类型了哟，这里进行细分啦
 * @returns
 * - 如果是 html 文档，则返回 "html"；
 * - 如果是 js 文件，则返回 "js"；
 * - 其它情况一律返回 undefined，表示不应该进行重写
 */
function get_rewrite_resource_type(
    param: Protocol.Fetch.RequestPausedEvent,
): ReWriteType | undefined {
    switch (param.resourceType) {
        case "Document":
            return "html";
        case "Script":
            return "js";
        // #cure-noworker
        // case "Other":
        //     // 如果是 new Worker("xx") 发起的 .js 请求，其类型为 "Other"
        //     // 但我也不确定是否还有其它的情况呀，所以额外增加对 url 的判断
        //     if (param.request.url.includes(".js")) {
        //         return "js";
        //     }
        //     logger.warn("unknown resource type Other", param);
        default:
            break;
    }
    return undefined;
}

/** 根据规则判断是否拦截该请求的响应 */
async function should_handle_by_rule(
    tabId: number,
    param: Protocol.Fetch.RequestPausedEvent,
) {
    // #cure-tip html 文档必须处理，需要向其中写入 hook 代码
    if (param.resourceType === "Document") {
        return true;
    }

    const tab = await chrome.tabs.get(tabId);
    if (tab.url === undefined) {
        return false;
    }

    // #cure-tip 根据全局规则进行判断
    const global_ignore_rules = await get_global_ignore_rules();
    for (const rule of global_ignore_rules) {
        if (is_rule_match_url(rule, param.request.url)) {
            logger.log(
                "global rule ignore",
                rule.rule,
                "=>",
                param.request.url,
            );
            return false;
        }
    }

    // #cure-tip 根据该 url 所在的网站的规则进行判断
    const setting = await get_rule_by_url(tab.url);
    if (!setting?.enable) {
        return false;
    }

    let is_target = setting.exclude;
    let final_rule = "NO RULE MATCH";

    const prefix = setting.exclude ? "exclude" : "include";
    for (const rule of setting.rules) {
        if (is_rule_match_url(rule, param.request.url)) {
            logger.log(
                prefix,
                "[rule match url]",
                rule.rule,
                "=>",
                param.request.url,
            );
            final_rule = rule.rule;
            is_target = !setting.exclude;
            break;
        }
    }

    if (is_target) {
        const msg: MsgBTC = {
            type: "match",
            data: {
                id: param.requestId,
                url: param.request.url,
                rule: final_rule,
                exclude: setting.exclude,
            },
        };
        // do not use await
        log_to_content(tabId, msg);
    }

    return is_target;
}

async function log_to_content(tabId: number, msg: MsgBTC, retry_count = 0) {
    try {
        await chrome.tabs.sendMessage(tabId, msg);
    } catch (e: any) {
        if (e.message.includes("Receiving end does not exist")) {
            if (retry_count < 5) {
                setTimeout(
                    () => log_to_content(tabId, msg, retry_count + 1),
                    500,
                );
            } else {
                logger.log("log_to_content timeout", msg);
            }
            return;
        }
        throw e;
    }
}

// https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#method-continueRequest
async function send_fetch_continue_request(
    tabId: number,
    requestId: string,
    is_target: boolean,
) {
    const data: Protocol.Fetch.ContinueRequestRequest = {
        requestId,
        interceptResponse: is_target,
    };
    await chrome.debugger.sendCommand(
        { tabId },
        "Fetch.continueRequest",
        data as any,
    );
}

// https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#method-getResponseBody
/** 直接默认它返回的就是 base64 encode 数据 */
async function get_req_response(tabId: number, requestId: string) {
    const data = (await chrome.debugger.sendCommand(
        { tabId },
        "Fetch.getResponseBody",
        {
            requestId,
        },
    )) as Protocol.Fetch.GetResponseBodyResponse;

    // return data.base64Encoded ? base64_decode_to_utf8(data.body) : data.body;
    return data.body;
}

// https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#method-fulfillRequest
/** 响应 body 必须是 base64 encode 后的结果 */
async function send_fetch_fulfill_request(
    tabId: number,
    param: Protocol.Fetch.RequestPausedEvent,
    body?: string,
) {
    const data: Protocol.Fetch.FulfillRequestRequest = {
        requestId: param.requestId,
        responseCode: param.responseStatusCode || 200,
        responseHeaders: param.responseHeaders,
        body,
    };
    await chrome.debugger.sendCommand(
        { tabId },
        "Fetch.fulfillRequest",
        data as any,
    );
}

// #region 获取标签页的 main frame id

/** 判断一个请求是否来自 main iframe，如果不是，则不会重写它！
 * @param tabId 该请求所在的标签页 id
 * @param in_frameId 该请求所在的 frame id
 */
async function is_from_main_iframe(tabId: number, in_frameId: string) {
    // 从临时存储中获取
    // 因为现在插件的后台脚本可能休息导致重新运行，如果使用全局变量则会丢失数据！
    const target = await get_taId_main_iframe(tabId);
    return in_frameId === target;
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
    await save_tabId_main_iframe(tabId);
});

//#endregion
