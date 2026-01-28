/** 日志输出 */
import * as share from "./share";
import { cure_sinker } from "../settings";

export const raw_log = console.log;
const raw_error = console.error;

const cure_idol = "#FE5B9B";
const cure_wink = "#4060EE";
const cure_kyun = "#CD5FFB";

const base_style =
    "color:white; font-weight:bold; border-radius:3px; padding:2px 5px;";
/** 用于 lite_warn 输出时的样式 */
const log_style = `background-color:${cure_idol};${base_style}`;
/** 用于 warn 输出时的样式，cure-wink */
const warn_style = `background-color:${cure_wink};${base_style}`;
const error_style = `background-color:${cure_kyun};${base_style}`;

export function log(...args: any[]) {
    raw_log(`%c[${cure_sinker}]`, log_style, ...args);
}

export function warn(...args: any[]) {
    raw_log(`%c[${cure_sinker}]`, warn_style, ...args);
}

export function error(...args: any[]) {
    raw_error(`%c[${cure_sinker}]`, error_style, ...args);
}

/** 搜索到一个值时，用本方法进行输出 */
export function log_stack_info(v: OneValueStackInfo) {
    const stack = share.ArrayFunc.join(v.stack, "\n\t=> ");
    raw_log(
        `%c[${cure_sinker} - Find]`,
        log_style,
        v.key,
        "\n\toccurrence count:",
        v.stack.size,
        "\n\t=>",
        stack,
    );
}
