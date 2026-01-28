/** 测试在浏览器中运行 swc */

import * as swc from "@swc/wasm-web";
import * as logger from "../inject/logger";
import {
    handle_ast,
    create_hooker_node,
    Visitor,
    is_node_hookable,
} from "./handle_ast";

declare const __IS_DEV__: boolean;

const visitor: Visitor = {
    // 处理 let a = x 这种情况
    VariableDeclarator(node) {
        // 忽略 let a = x = y 这种情况，它由赋值表达式处理
        if (!node.init || node.init.type === "AssignmentExpression") {
            return;
        }
        // console.log("VariableDeclarator:", node);
        if (is_node_hookable(node.init)) {
            node.init = create_hooker_node(node.init);
        }
    },

    // 处理 a = x 这种情况
    AssignmentExpression(node) {
        // console.log("AssignmentExpression:", node);
        if (is_node_hookable(node.right)) {
            node.right = create_hooker_node(node.right);
        }
    },

    // 处理函数调用的参数
    CallExpression(node) {
        // console.log("CallExpression:", node);
        for (const arg of node.arguments) {
            if (is_node_hookable(arg.expression)) {
                arg.expression = create_hooker_node(arg.expression);
            }
        }
    },

    // 删除 debugger 语句咯
    DebuggerStatement(node) {
        // 如果想真正的实现删除，得增加一些逻辑，这里替换成空语句好了
        node.type = "EmptyStatement" as any;
    },
};

let initialized = false;
/** 解析 js 代码时的 js 版本，尽可能最大 */
const js_target = "es2022";

(async function init_swc() {
    // 由插件提供 @swc/wasm-web
    const wasm_uri =
        "chrome-extension://ckkbkccpdagmhhfefeelnklemkfjpolc/swc.wasm";
    const module = await swc.default(wasm_uri);
    swc.initSync(module);
    initialized = true;
    logger.log("@swc/wasm-web initialized");
})();

export function is_swc_initialized() {
    return initialized;
}

/** 使用 swc 处理 js 并返回结果 */
export function process_js(code: string) {
    if (!initialized) {
        return code;
    }

    const ast = swc.parseSync(code, {
        syntax: "ecmascript",
        target: js_target,
    });

    handle_ast(ast, visitor);

    const output = swc.transformSync(ast, {
        jsc: {
            target: js_target,
        },
        minify: true,
    });

    return output.code;
}

if (__IS_DEV__) {
    async function load_test_code() {
        const res = await fetch("./test.js");
        return await res.text();
    }

    (async () => {
        const code = await load_test_code();
        const start = performance.now();
        const output = await process_js(code);
        const end = performance.now();
        const time = ((end - start) / 1000).toFixed(2);
        console.log("=".repeat(20), "used time:", time, "s");
        console.log(output);
    })();
}
