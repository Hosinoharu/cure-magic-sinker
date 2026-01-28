/** 监听消息，启动功能、调整插件状态等 */

import { start_debugger, stop_debugger } from "./rewrite_response";
import { disable_all_host_rules, get_rule_by_url } from "./storage_manager";
import { CureLogger, should_ignore } from "../share";

const logger = new CureLogger("action");

// #region badge state manager

const default_off_text = "";
const default_on_text = "on";
const default_off_bgcolor: chrome.extensionTypes.ColorArray = [0, 0, 0, 0];
const default_on_bgcolor = "#FE5B9B";

async function off_state(tabId?: number) {
    await chrome.action.setBadgeText({ text: default_off_text, tabId });
    await chrome.action.setBadgeBackgroundColor({
        color: default_off_bgcolor,
        tabId,
    });
}

async function on_state(tabId: number) {
    await chrome.action.setBadgeText({ text: default_on_text, tabId });
    await chrome.action.setBadgeBackgroundColor({
        color: default_on_bgcolor,
        tabId,
    });
}

// #endregion

// #region 监听消息并启动功能

// #cure-tip listen from devtool
chrome.runtime.onMessage.addListener(
    async (message: MsgFromDevtool, sender, sendResponse) => {
        const tabId = message.tabId;
        if (tabId === undefined || tabId === chrome.tabs.TAB_ID_NONE) {
            return sendResponse();
        }

        if (message.action === "on") {
            logger.log("[start on]", tabId);
            await on_state(tabId);
            await start_debugger(tabId);
        } else {
            logger.log("[stop on]", tabId);
            await off_state(tabId);
            await stop_debugger(tabId);
        }
        sendResponse();
    },
);

// #cure-tip start debugger when tab change
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === "loading" && tab.url) {
        if (should_ignore(tab.url)) {
            return;
        }

        const setting = await get_rule_by_url(tab.url);
        if (setting?.enable) {
            logger.log("[initially start on]", tabId, "=>", tab.url);
            await on_state(tabId);
            await start_debugger(tabId);
        } else {
            await off_state(tabId);
            await stop_debugger(tabId);
        }
    }
});

// #cure-tip 如果是点击页面提示信息来取消调试，则会关闭所有调试，所以需要关闭所有功能！
chrome.debugger.onDetach.addListener(async (debuggee, reason) => {
    if (reason === "canceled_by_user") {
        logger.log("[detach on]", debuggee.tabId);
        await off_state(debuggee.tabId);
        disable_all_host_rules();
    }
});

// #endregion
