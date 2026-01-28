<template>
    <header>
        <h2 class="title"
            :class="host_rules.enable ? 'enable-cure' : 'disable-cure'"
            @click="cure_toggler">
            Cure Magic Sinker
        </h2>
        <section class="host-line">
            <button class="host-name" @click="add_one_rule"
                :class="can_edit ? 'on-host-name' : 'no-host-name'">
                {{ current_host || "Web Not Support" }}
            </button>
            <section class="control-btns">
                <Button :on="host_rules.exclude" @click="change_exclude_mode"
                    text="排除模式" />
                <Button :on="is_global_ignore_page" @click="switch_to_setting"
                    text="全局忽略" />
                <Button :on="http_server.on" @click="switch_http_server"
                    text="HTTP 服务" />
            </section>
        </section>
    </header>

    <main>
        <OneRule v-if="is_global_ignore_page" :all_rules="global_ignore_rules"
            @save_all_rules="save_global_ignore" />
        <OneRule v-else :all_rules="host_rules.rules"
            @save_all_rules="save_host_rules" />
    </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, toRaw } from "vue";
import OneRule from "./components/OneRule.vue";
import { debounce, get_storage, save_storage, should_ignore, CureLogger } from "../share";
import Button from "./components/Button.vue";

const logger = new CureLogger("devtool");

/** 当前网站的 hostname */
const current_host = ref("");
/** 当前网站的规则 */
const host_rules = ref<OneHostRule>({
    enable: false,
    exclude: false,
    rules: [],
});
/** 全局忽略的规则 —— 这些文件都不会被处理 */
const global_ignore_rules = ref<GlobalIgnore>([]);
/** 当前是否显示 setting page —— 并没有单独添加 options page 了 */
const is_global_ignore_page = ref(false);
/** 配置 http server */
const http_server = ref<ExtensionStorage["http_server"]>({
    on: false,
    port: "9226",
});

/** 当前是否可以编辑规则 */
const can_edit = computed(() => {
    return current_host.value !== "";
});

const tabId = __IS_DEV__ ? 0 : chrome.devtools.inspectedWindow.tabId;

/** 功能的开启与关闭 */
function cure_toggler() {
    if (can_edit.value) {
        host_rules.value.enable = !host_rules.value.enable;
        save_host_rules();

        const msg: MsgFromDevtool = {
            tabId,
            action: host_rules.value.enable ? "on" : "off",
        };
        if (!__IS_DEV__) {
            chrome.runtime.sendMessage(msg);
            if (!host_rules.value.enable) {
                terminate_worker();
            }
        }
    }
}

/** 停止注入到网页中的、读写数据库的 worker */
function terminate_worker() {
    // #cure-warn 调用网页中的方法 terminate
    const cmd = `globalThis["CureMagicSinker"].terminate();`
    chrome.devtools.inspectedWindow.eval(cmd);
}

!__IS_DEV__ &&
    chrome.debugger.onDetach.addListener((debuggee) => {
        if (debuggee.tabId === tabId) {
            terminate_worker();
            host_rules.value.enable = false;
            http_server.value.on = false;
        }
    });

function change_exclude_mode() {
    if (can_edit.value) {
        host_rules.value.exclude = !host_rules.value.exclude;
        save_host_rules();
    }
}

function add_one_rule() {
    if (can_edit.value) {
        const t = is_global_ignore_page.value
            ? global_ignore_rules.value
            : host_rules.value.rules;
        t.unshift({
            rule: "",
            enable: false,
            invalid: false,
        });
    }
}

async function switch_to_setting() {
    is_global_ignore_page.value = !is_global_ignore_page.value;
    if (is_global_ignore_page.value) {
        await init_global_ruels();
    }
}

/** 由 background 监听 storage 变化来启动 http 服务器 */
async function switch_http_server() {
    if (!can_edit.value) {
        return;
    }

    http_server.value.on = !http_server.value.on;
    await save_http_port();
}

// #region storage manager

async function dev_get_storage<T extends keyof ExtensionStorage>(
    key: T,
    default_value?: ExtensionStorage[T]
) {
    if (__IS_DEV__) {
        return default_value;
    }
    return await get_storage<T>(key, default_value);
}

async function dev_save_storage<T extends keyof ExtensionStorage>(
    key: T,
    value: ExtensionStorage[T]
) {
    if (__IS_DEV__) {
        logger.log("save storage:", key, "=>", value);
    } else {
        await save_storage(key, value);
    }
}

// #region 读写规则配置项

/** 获取当前网站的规则配置 */
async function init_host_rules() {
    if (!can_edit.value) {
        return [];
    }

    if (__IS_DEV__) {
        host_rules.value = {
            enable: true,
            exclude: false,
            rules: [
                { rule: "rule1", enable: true, invalid: false },
                { rule: "rule2", enable: false, invalid: false },
                { rule: "rule3", enable: true, invalid: false },
            ],
        };
        return;
    }

    const all_host = await dev_get_storage("host_rules");
    host_rules.value = all_host?.[current_host.value] ?? {
        enable: false,
        exclude: false,
        rules: [],
    };
}

async function raw_save_host_rules() {
    const rules = toRaw(host_rules.value);

    if (!can_edit.value || rules === undefined) {
        return;
    }

    const all_host = (await dev_get_storage("host_rules", {}))!;
    all_host[current_host.value] = rules;
    await dev_save_storage("host_rules", all_host);
}

/** 获取全局的规则配置项 */
async function init_global_ruels() {
    if (!can_edit.value) {
        return [];
    }

    if (__IS_DEV__) {
        global_ignore_rules.value = [
            {
                rule: "global_rule1",
                enable: true,
                invalid: false,
            },
            {
                rule: "global_rule2",
                enable: false,
                invalid: false,
            },
            {
                rule: "global_rule3",
                enable: true,
                invalid: false,
            },
        ];
        return;
    }

    const all_host = await dev_get_storage("global_ignore");
    global_ignore_rules.value = all_host ?? [];
}

async function raw_save_global_ignore() {
    if (!can_edit.value) {
        return;
    }

    await dev_save_storage("global_ignore", toRaw(global_ignore_rules.value));
}

// #endregion

async function get_http_port() {
    const res = await dev_get_storage("http_server");
    res && (http_server.value = res);
}

async function save_http_port() {
    await dev_save_storage("http_server", toRaw(http_server.value));
}

const save_host_rules = debounce(raw_save_host_rules, 500);
const save_global_ignore = debounce(raw_save_global_ignore, 500);

// #endregion

async function init_current_host() {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url && !should_ignore(tab.url)) {
        current_host.value = new URL(tab.url).hostname;
    }
}

onMounted(async () => {
    if (__IS_DEV__) {
        current_host.value = "www.example.com";
    } else {
        await init_current_host();
    }
    logger.log('devtools on:', current_host.value);
    await init_host_rules();
    await get_http_port();
});
</script>

<style scoped>
header {
    display: flex;
    justify-content: center;
}

.title {
    text-align: center;
    font-size: x-large;
    display: inline-block;
    font-weight: bolder;
    cursor: pointer;
    user-select: none;
}

.enable-cure {
    color: var(--cure-idol);
}

.disable-cure {
    color: var(--disable-color);
}

main,
header {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    margin: 10px 0;
}

.host-line {
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 20px;
    padding: 10px 0;
    overflow-x: hidden;
}

.control-btns {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 90%;
    gap: 20px;
}

.host-name {
    width: fit-content;
    max-width: 80%;
    height: 2rem;
    text-align: center;
    font-weight: bold;
    font-size: medium;
    font-family: "Consolas", "Courier New", monospace;
    letter-spacing: 1px;

    padding: 5px 15px;
    border: 2px solid var(--cure-zukyoon);
    border-radius: 5px;
    cursor: pointer;

    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
}

.on-host-name {
    color: var(--cure-zukyoon);
}

.no-host-name {
    color: var(--disable-color);
}

.http-server-btn {
    display: flex;
    justify-content: center;
    align-items: center;
}

.port-input {
    width: 100px;
    height: 2rem;
    border-left: none;
}
</style>
