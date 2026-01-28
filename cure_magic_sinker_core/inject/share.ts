/** 保存用到的 API，尽可能和网站使用的 API 隔离 */

export const ReflectFunc = {
    apply: Reflect.apply,
    getPrototypeOf: Reflect.getPrototypeOf,
    defineProperty: Reflect.defineProperty,
    getOwnPropertyDescriptor: Reflect.getOwnPropertyDescriptor,
    getOwnPropertyNames: Object.getOwnPropertyNames,
    get: Reflect.get,
    /** 判断对象自身有某个属性 */
    has: Object.hasOwn,
    /** 获取函数的字符串 */
    to_func_string: save_raw_method(Function.prototype.toString),
};

function save_raw_method<T extends (...args: any[]) => any>(
    raw: T,
): MethodToFunc<T> {
    return function (_this: ThisParameterType<T>, ...args: Parameters<T>) {
        return ReflectFunc.apply(raw, _this, args);
    };
}

export const ArrayFunc = {
    from: Array.from,
    join: save_raw_method(Array.prototype.join),
    unshift: save_raw_method(Array.prototype.unshift),
    push: save_raw_method(Array.prototype.push),
    includes: save_raw_method(Array.prototype.includes),
    findIndex: save_raw_method(Array.prototype.findIndex),
    findLastIndex: save_raw_method(Array.prototype.findLastIndex),
    slice: save_raw_method(Array.prototype.slice),
};

export const StringFunc = {
    split: save_raw_method(String.prototype.split) as (
        _this: string,
        separator: string | RegExp,
        limit?: number | undefined,
    ) => string[],
    trim: save_raw_method(String.prototype.trim),
    indexOf: save_raw_method(String.prototype.indexOf),
    includes: save_raw_method(String.prototype.includes),
    substring: save_raw_method(String.prototype.substring),
};

export const XHRFunc = {
    XHR: XMLHttpRequest,
    open: save_raw_method(XMLHttpRequest.prototype.open),
    send: save_raw_method(XMLHttpRequest.prototype.send),
};

export const post_worker_msg = save_raw_method(Worker.prototype.postMessage);

// #region Cure Map

const raw_Map = Map;
const raw_map_get = save_raw_method(Map.prototype.get);
const raw_map_set = save_raw_method(Map.prototype.set);

export class CureMap<K, V> {
    private map: Map<K, V>;

    constructor() {
        this.map = new raw_Map();
    }

    get(key: K): V | undefined {
        return raw_map_get(this.map, key);
    }

    set(key: K, value: V) {
        return raw_map_set(this.map, key, value);
    }
}

// #endregion
