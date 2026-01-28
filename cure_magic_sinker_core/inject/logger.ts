/** 日志输出 */
import { cure_sinker } from "../settings";

export const raw_log = console.log;
const raw_error = console.error;

const cure_idol = "#FE5B9B";
const cure_wink = "#4060EE";
const cure_kyun = "#CD5FFB";
const cure_zukyoon = "#A9F9B5";

const base_style =
    "color:white; font-weight:bold; border-radius:3px; padding:2px 5px;";
/** 用于 lite_warn 输出时的样式 */
const log_style = `background-color:${cure_idol};${base_style}`;
/** 用于 warn 输出时的样式，cure-wink */
const warn_style = `background-color:${cure_wink};${base_style}`;
const error_style = `background-color:${cure_kyun};${base_style}`;
const tip_style = `color:${cure_zukyoon};`;

export function log(...args: any[]) {
    raw_log(`%c[${cure_sinker}]`, log_style, ...args);
}

export function warn(...args: any[]) {
    raw_log(`%c[${cure_sinker}]`, warn_style, ...args);
}

export function error(...args: any[]) {
    raw_error(`%c[${cure_sinker}]`, error_style, ...args);
}

export function log_with_tip(title: string, ...args: any[]) {
    raw_log(`%c[${cure_sinker} - ${title}]`, tip_style, ...args);
}
