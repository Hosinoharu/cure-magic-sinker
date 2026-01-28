/** 此处是基于 Proxy 实现的 Hook，
 * 用于 Hook eval、Function 等动态生成 js 的函数
 *
 * TIP：本实现仅解决常见的监测点，仍然有很多瑕疵的哟
 */

import * as share from "./share";
import { anti_debug } from "../settings";

const raw_Proxy = Proxy;
/** 用于 proxy 获取底层的对象 */
const symbol_proxy_raw_obj = "cure-magic-sinker-proxy-raw-obj";

/** 拦截函数
 * - `hooked_target` 表示原来被 hook 的函数
 */
type Handler = (hooked_target: any, ...args: any[]) => any;

/** 用于 Hook 对象上的某个方法！ */
export class Hooker {
    /** 被 hook 的原始值 */
    private raw_value: any;
    private descriptor: PropertyDescriptor;

    constructor(
        private obj: any,
        private property: string,
        /** 拦截函数的调用 */
        private handler: Handler,
    ) {
        const des = share.ReflectFunc.getOwnPropertyDescriptor(obj, property);
        if (des === undefined) {
            throw new Error(`only own property can hook`);
        }
        if (des.get !== undefined || des.set !== undefined) {
            throw new Error(`only value property can hook`);
        }
        if (typeof des.value !== "function") {
            throw new Error(`only function can hook`);
        }

        this.raw_value = des.value;
        this.descriptor = des;
    }

    private get_hooker() {
        const self = this;

        const p = new raw_Proxy(self.raw_value, {
            get: function cure_sinker_getter(
                target: object,
                property: string,
                receiver: any,
            ) {
                // 首先解决非自身的调用，即通过原型链的访问
                const is_self = p === receiver;

                // 访问该属性，返回原始的对象
                if (property === symbol_proxy_raw_obj) {
                    return is_self ? target : undefined;
                }

                // #cure-warn 删除关于堆栈
                return share.ReflectFunc.get(target, property, receiver);
            },
            apply: function cure_sinker_apply(
                target: Function,
                this_: any,
                args: any,
            ) {
                // 避免 Function.call(Function) 这样的操作时 this 执行 Proxy 对象
                if (this_ === self) {
                    this_ = target;
                }

                // #cure-warn 处理堆栈报错
                // 调用拦截函数，传入自身
                const res = share.ReflectFunc.apply(self.handler, this_, [
                    target,
                    ...args,
                ]);

                return res;
            },
        });

        // hook 函数时，让它的 prototype.constructor 指向自身哟
        if (
            share.ReflectFunc.has(self.raw_value, "prototype") &&
            self.raw_value.prototype !== undefined
        ) {
            share.ReflectFunc.defineProperty(
                self.raw_value.prototype,
                "constructor",
                {
                    value: p,
                    enumerable: false,
                    configurable: true,
                },
            );
        }

        return p;
    }

    public hook_it() {
        const value = this.get_hooker();
        share.ReflectFunc.defineProperty(this.obj, this.property, {
            value,
            configurable: this.descriptor.configurable,
            enumerable: this.descriptor.enumerable,
            writable: this.descriptor.writable,
        });
    }

    /** 获取 Proxy 对象底层的对象 —— 如果不是 Proxy 则返回自身 */
    public static get_proxy_raw_obj<T extends object>(obj: T) {
        return share.ReflectFunc.get(obj, symbol_proxy_raw_obj) ?? obj;
    }
}

// #region 反调试

// #cure-tip 禁用网站输出
if (anti_debug.no_console) {
    for (const name of share.ReflectFunc.getOwnPropertyNames(console)) {
        // @ts-ignore
        const item = console[name];
        if (typeof item === "function") {
            new Hooker(console, name, () => {}).hook_it();
        }
    }
}

// #endregion
