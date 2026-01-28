/** 注入到网站中的全局对象！！！ */
export const cure_sinker = "CureMagicSinker";

/** 注入到网站中的 hook 方法！*/
export const hook_name = "cure_sinker";

/** indexedDB 数据库名称 */
export const database_name = cure_sinker;

/** 用于过滤值的配置 */
export const filter_setting: FilterSetting = {
    handle_vm_code: true,
    min_length: 5,
    max_length: 500,
    filter(v: string) {
        return false;
    },
};

/** 一些反调试的配置 */
export const anti_debug = {
    /** 禁用网站的 console 日志输出 */
    no_console: true,
};
