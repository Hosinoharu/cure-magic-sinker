import {
    filter_setting,
    hook_name,
    cure_sinker,
    database_name,
} from "../settings";
import * as share from "./share";
import * as tools from "./tools";
import * as logger from "./logger";
import { worker_func } from "./db_worker";
import "./hanle_vm_code";
import "./core";

// #region indexedDB Worker 通信

const worker_func_str = `;(${share.ReflectFunc.to_func_string(
    worker_func,
)})();`;
const blob = new Blob([worker_func_str], { type: "text/javascript" });
const url = URL.createObjectURL(blob);
const worker = new Worker(url);

/** 可能 worker 还没有初始化完成，所以需要临时缓存已经准备好的信息哟 */
const waitting_buffer: MsgToWorker[] = [];
let worker_is_ready = false;
let ooops = false;
/** 当停止调试功能时，关闭 worker 且不再写入数据库 */
let worker_dead = false;

/** 添加一个值的信息，传入值以及它的堆栈 */
function add_value_to_db(value: string, stack: string) {
    if (ooops) {
        return;
    }

    const msg: MsgToWorker = {
        type: "add",
        data: { key: value, stack: new Set([stack]) },
    };

    if (!worker_is_ready) {
        if (waitting_buffer.length > 5000) {
            logger.warn("waitting_buffer is too long, maybe something wrong");
            ooops = true;
        }

        return share.ArrayFunc.push(waitting_buffer, msg);
    }
    share.post_worker_msg(worker, msg);
}

function flush_buffer_msg() {
    for (const msg of waitting_buffer) {
        share.post_worker_msg(worker, msg);
    }
}

function find_value(f: string | RegExp) {
    const msg: MsgToWorker = {
        type: "find",
        data: f,
    };
    share.post_worker_msg(worker, msg);

    return new Promise<OneValueStackInfo[]>((resolve) => {
        worker.addEventListener(
            "message",
            (e) => {
                const msg = e.data as MsgFromWorker;
                if (msg.type === "find-result") {
                    resolve(msg.data);
                }
            },
            { once: true },
        );
    });
}

/** 删除 indexedDB 数据库 */
const delete_db = (() => {
    const raw_delete_db = indexedDB.deleteDatabase.bind(indexedDB);
    return () => {
        console.log("delete db");
        worker.terminate();
        raw_delete_db(database_name);
    };
})();

worker.addEventListener("message", (e) => {
    const msg = e.data as MsgFromWorker;
    // #cure-init-worker 输出 init 信息
    if (msg.type === "db-init") {
        worker_is_ready = true;
        flush_buffer_msg();

        if (tools.is_top_frame() && location.hostname) {
            logger.log(
                `init worker on <${location.hostname}>.\n\n`,
                `\t- '${cure_sinker}.find(v)' 查找特定的值，要传入字符串哟\n\n`,
            );
        }
    }
});

// #endregion

// #region 添加的 Hook

let is_visited = false;

/** 注入到网页中的 hook 方法，用于记录值 */
export function cure_sinker_hook(value: any) {
    if (!is_visited) {
        is_visited = true;
        logger.log("cure_sinker is ready");
    }

    if (worker_dead) {
        return value;
    }

    const type = typeof value;
    const trimed_value =
        type === "string" ? share.StringFunc.trim(value) : value;
    // #cure-warn 只处理字符串
    if (type !== "string" || should_ignore(trimed_value)) {
        return value;
    }

    const stack = tools.cure_sinker_get_current_stack(trimed_value);
    // #cure-warn 主线程不操作 indexedDB
    stack && add_value_to_db(trimed_value, stack);

    return value;
}

/** 对保存的值进行过滤，比如最小长度和最大长度等等 */
function should_ignore(value: string) {
    if (!value) {
        return true;
    }

    const length = value.length;
    if (length < filter_setting.min_length) {
        return true;
    }
    if (filter_setting.max_length && length > filter_setting.max_length) {
        return true;
    }
    if (filter_setting.filter && filter_setting.filter(value)) {
        return true;
    }

    return false;
}

// #endregion

// #region 暴露到全局作用域

// 确保退出网站时，是否清空存储
if (tools.is_top_frame()) {
    // #cure-warn 删除 indexdbDB
    globalThis.addEventListener("beforeunload", () => delete_db());
}

const aha = share.ReflectFunc.getPrototypeOf(globalThis) || globalThis;
share.ReflectFunc.defineProperty(aha, hook_name, {
    value: cure_sinker_hook,
    writable: false,
    configurable: false,
    enumerable: false,
});

// 设置全局对象的东西
const hei = {
    find(v: string) {
        if (worker_dead) {
            logger.log("can't find value, cause worker is terminated");
            return [];
        }
        find_value(v).then((result) => {
            logger.log(`find [${v}], count: ${result.length}`);
            for (const item of result) {
                logger.log_with_tip(
                    "Match",
                    item.key,
                    "\n\t=>",
                    share.ArrayFunc.from(item.stack.values()).join("\n\t=> "),
                );
            }
        });
    },

    /** 当停止使用功能（即取消 debugger 时)，外部调用本方法 */
    terminate() {
        worker_dead = true;
        worker.terminate();
        logger.warn("worker is terminated");
    },
};

share.ReflectFunc.defineProperty(aha, cure_sinker, {
    value: hei,
    writable: false,
    configurable: false,
    enumerable: false,
});

// #endregion
