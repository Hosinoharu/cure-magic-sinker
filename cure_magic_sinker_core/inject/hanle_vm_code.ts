/** 这里处理 eval、Function 等动态生成 js 代码的情况 */

import * as share from "./share";
import * as logger from "./logger";
import { Hooker } from "./core";
import * as ast_handler from "../ast_handler";
import { filter_setting } from "../settings";

/** 使用 js 操作 ast 可能性能很慢，所以当动态生成的代码长度大于这个值时，
 * 所以转而使用 http server 方案。
 */
const max_code_length = 3000;

/** 处理动态生成的代码 */
export function handle_vm_code(code: string) {
    // 对一些常用代码的判断
    if (code === "this") {
        return code;
    }
    if (code === "debugger") {
        return "";
    }

    try {
        if (
            !ast_handler.is_swc_initialized() ||
            code.length > max_code_length
        ) {
            return handle_code_use_http_server(code);
        } else {
            return handle_code_use_swc_wasm(code);
        }
    } catch (e) {
        // logger.error(`handle_vm_code error: ${e}`);
        return code;
    }
}

const http_server_port = "9226";
let vm_code_index = 1;

/** 使用 http server 处理 */
function handle_code_use_http_server(code: string) {
    const xhr = new share.XHRFunc.XHR();
    // 发送同步请求
    share.XHRFunc.open(
        xhr,
        "POST",
        `http://localhost:${http_server_port}/process-js`,
        false,
    );
    share.XHRFunc.send(xhr, code);
    // 为了让 (new Error).stack 获取到 vm 中的调用栈，需要手动加上 sourceURL 哟
    // 所以手动创建名称啦 `cure_sinker_vm_code_`
    return (
        xhr.responseText +
        `\n\n//# sourceURL=${location.origin}/cure_sinker_vm_code_${vm_code_index++}.js`
    );
}

/** 使用 js 操作 ast 的方案来处理 */
function handle_code_use_swc_wasm(code: string) {
    return ast_handler.process_js(code);
}

if (filter_setting.handle_vm_code) {
    // #cure-warn hook Function.prototype.toString
    new Hooker(Function.prototype, "toString", function cure_sinker_toString(
        this: Function,
        hooked_target: Function,
    ) {
        // 这里的 this 就是调用 x.toString() 中的 x
        const raw_obj = Hooker.get_proxy_raw_obj(this);
        const str = share.ReflectFunc.apply(hooked_target, raw_obj, []);
        return str;
    }).hook_it();

    // #cure-warn hook Function
    new Hooker(globalThis, "Function", function cure_sinker_Function(
        hooked_target: Function,
        ...args: any[]
    ) {
        // 最后一个参数才是 Function 的 body
        let body = args.pop();
        if (body) {
            body = handle_vm_code(body);
        }
        args.push(body);
        const fn = hooked_target(...args);
        return fn;
    }).hook_it();

    // #cure-warn hook eval
    new Hooker(globalThis, "eval", function cure_sinker_eval(
        hooked_target: Function,
        s: string,
    ) {
        if (s) {
            s = handle_vm_code(s);
        }
        const res = hooked_target(s);
        return res;
    }).hook_it();
}
