export const native_messaging_name = "com.cure_magic_sinker.native";

export function debounce<T extends (...args: any[]) => void>(
    func: T,
    delay: number,
) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return function (...args: any[]) {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            func(...args);
        }, delay);
    };
}

export function should_ignore(url: string) {
    return (
        url.startsWith("chrome-extension:") ||
        url.startsWith("chrome:") ||
        url.startsWith("edge-extension:") ||
        url.startsWith("edge:") ||
        url.startsWith("about:")
    );
}

/** 判断输入的正则表达式是否有效 */
export function raw_is_valid_rule(s: string) {
    try {
        new RegExp(s);
        return true;
    } catch (e: any) {
        console.log(e.message);
    }
    return false;
}

// #region 通用 storage 读写

export async function get_storage<T extends keyof ExtensionStorage>(
    key: T,
    default_value?: ExtensionStorage[T],
) {
    const res = await chrome.storage.local.get(key);
    // console.log("get storage data (k/v):", key, "=>", res);
    return (res[key] as ExtensionStorage[T]) || default_value;
}

export async function save_storage<T extends keyof ExtensionStorage>(
    key: T,
    value: ExtensionStorage[T],
) {
    // console.log("save storage data (k/v):", key, "=>", value);
    await chrome.storage.local.set({ [key]: value });
}

// #endregion

// #region 日志输出

const raw_log = console.log;
const raw_error = console.error;

export class CureLogger {
    private readonly cure_idol = "#FE5B9B";
    private readonly cure_wink = "#4060EE";
    private readonly cure_kyun = "#CD5FFB";
    private readonly base_style =
        "color:white; font-weight:bold; border-radius:3px; padding:2px 5px;";
    /** 用于 lite_warn 输出时的样式 */
    private readonly log_style = `background-color:${this.cure_idol};${this.base_style}`;
    /** 用于 warn 输出时的样式，cure-wink */
    private readonly warn_style = `background-color:${this.cure_wink};${this.base_style}`;
    private readonly error_style = `background-color:${this.cure_kyun};${this.base_style}`;

    constructor(private prefix: string) {}

    public log(title: string, ...args: any[]) {
        raw_log(`%c[${this.prefix}] - ${title}`, this.log_style, ...args);
    }

    public warn(title: string, ...args: any[]) {
        raw_log(`%c[${this.prefix}] - ${title}`, this.warn_style, ...args);
    }

    public error(title: string, ...args: any[]) {
        raw_error(`%c[${this.prefix}] - ${title}`, this.error_style, ...args);
    }
}

// #endregion
