/** 读写 storage */

import { debounce, get_storage, save_storage } from "../share";

// #region 初始化插件默认的配置项

// 常见的第三方库，它们不需要被处理
const global_ignore_rules: GlobalIgnore = [
    // 通用关键字
    { enable: true, rule: "\\.min\\.js", invalid: false },
    { enable: true, rule: "-min\\.js", invalid: false },
    { enable: true, rule: "\\.prod\\.js", invalid: false },
    { enable: true, rule: "polyfill", invalid: false },

    // 常用的第三方库
    { enable: true, rule: "jquery", invalid: false },
    { enable: true, rule: "bootstrap", invalid: false },
    { enable: true, rule: "lodash", invalid: false },
    { enable: true, rule: "moment", invalid: false },
    { enable: true, rule: "react", invalid: false },
    { enable: true, rule: "vue", invalid: false },
    { enable: true, rule: "angular", invalid: false },
    { enable: true, rule: "axios", invalid: false },
    { enable: true, rule: "echarts", invalid: false },
    { enable: true, rule: "svelte", invalid: false },
    { enable: true, rule: "hls", invalid: false },
    { enable: true, rule: "babel", invalid: false },
    { enable: true, rule: "hm\\.baidu\\.com", invalid: false },
];

chrome.runtime.onInstalled.addListener(async () => {
    // 避免重新加载插件时清空已有的配置
    const host_rules = (await get_storage("host_rules")) || {};
    const http_server = (await get_storage("http_server")) || {
        on: false,
        port: "9226",
    };

    const data: ExtensionStorage = {
        host_rules,
        global_ignore: global_ignore_rules,
        http_server,
    };
    await chrome.storage.local.set(data);
});

// #endregion

// #region 读写配置项

export async function get_rule_by_url(url: string) {
    const hostname = new URL(url).hostname;
    const data = await get_all_host_rules();
    return data[hostname];
}

/** 获取所有网站的配置项 */
export async function get_all_host_rules() {
    return ((await get_storage("host_rules")) as RuleStorage) || {};
}

export async function get_global_ignore_rules() {
    return await get_storage("global_ignore");
}

export async function raw_disable_all_host_rules() {
    const data = await get_all_host_rules();
    Object.keys(data).forEach((hostname) => {
        if (data[hostname]?.enable !== undefined) {
            data[hostname].enable = false;
        }
    });
    await save_storage("host_rules", data);
}

/** 如果开启了 http server，停止调试时，虽然会自动断开，但还需要重置配置项嘛 */
export async function disable_http_server() {
    const data = await get_storage("http_server");
    data.on = false;
    await save_storage("http_server", data);
}

export const disable_all_host_rules = debounce(raw_disable_all_host_rules, 500);

// #endregion
