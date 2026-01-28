import * as share from "./share";
import * as logger from "./logger";

const raw_Error = Error;

// #region stack chain 的过滤

/** 记录当前作用域中值的调用链 */
const all_stack_chanins = new share.CureMap<string, StackChain[]>();

/** 判断当前堆栈是否应该忽略 */
function should_ignore_by_stack(curr: StackChain, raw: StackChain[]) {
    const top = curr[curr.length - 1];
    for (const chain of raw) {
        // 不是同一堆栈当中
        if (curr[0] !== chain[0]) {
            continue;
        }
        // chain 堆栈为 A --> B --> C，curr 堆栈位于其中。看作是【值返回到这些函数中】
        if (share.ArrayFunc.includes(chain, top)) {
            return true;
        }
        // curr 堆栈为 A --> B --> C，chain 堆栈位于其中，看作是【值传参到这些函数中】
        if (share.ArrayFunc.includes(curr, chain[chain.length - 1])) {
            return true;
        }
    }

    return false;
}

/** 检查一个值的调用链，如果返回 true 则应该忽略它 */
function is_value_recorded(value: any, chain: StackChain) {
    const saved_chains = all_stack_chanins.get(value);
    if (saved_chains) {
        if (should_ignore_by_stack(chain, saved_chains)) {
            return true;
        } else {
            share.ArrayFunc.push(saved_chains, chain);
        }
    } else {
        all_stack_chanins.set(value, [chain]);
    }
    return false;
}

// #endregion

/** 获取当前的顶部堆栈！*/
export function cure_sinker_get_current_stack(value: any): string {
    const stack = new raw_Error().stack;
    if (!stack) {
        return "";
    }

    const raw_stack_arr = share.StringFunc.split(stack, "\n");
    // 需要先判断其是否位于 vm code 中！
    const vm_code_index = share.ArrayFunc.findIndex(
        raw_stack_arr,
        is_vm_code_stack,
    );
    // 然后规划出真正的堆栈范围
    const stack_arr =
        vm_code_index === -1
            ? raw_stack_arr
            : share.ArrayFunc.slice(raw_stack_arr, 0, vm_code_index + 1);
    // 从下往上，找到第一个在 hook 代码的堆栈！
    const entry_index = share.ArrayFunc.findLastIndex(
        stack_arr,
        is_self_in_stack,
    );
    if (entry_index === -1) {
        return stack_arr[1] || "";
    }

    const start_index = Math.min(entry_index + 1, stack_arr.length - 1);
    const top_stack = share.StringFunc.trim(stack_arr[start_index] || "");

    const stack_chain: string[] = [];
    for (let i = start_index; i < stack_arr.length; i++) {
        const func_name = parse_func_name_in_stack(stack_arr[i]);
        if (func_name) {
            share.ArrayFunc.unshift(stack_chain, func_name);
        }
    }

    // #cure-warn 判断 stack chain
    if (is_value_recorded(value, stack_chain)) {
        return "";
    }

    return top_stack;
}

/** 判断某一条堆栈信息是否为内部调用  */
function is_self_in_stack(s: string) {
    const index: number = share.StringFunc.indexOf(s, "cure_sinker");
    if (index === -1) {
        return false;
    }
    const pattern = "(eval at ";
    if (
        share.StringFunc.substring(s, index - pattern.length, index) === pattern
    ) {
        return false;
    }
    return true;
}

/** 判断某一条堆栈信息是否为 vm code 的入口点  */
function is_vm_code_stack(s: string) {
    return share.StringFunc.includes(s, "cure_sinker_vm_code");
}

/** 解析堆栈中的函数名称，如果返回空字符串，说明位于全局作用域 */
function parse_func_name_in_stack(s: string) {
    // 堆栈形如 at test (test.js:4:15)
    const end_index = share.StringFunc.indexOf(s, "(");
    if (end_index === -1) {
        return "";
    }

    const start_index = share.StringFunc.indexOf(s, " at");
    if (start_index === -1) {
        return "";
    }

    // start_index + 3 是为了跳过 'at ' 这三个字符
    // end_index - 1 是为了跳过 ( 前面的空格
    const result = share.StringFunc.substring(
        s,
        start_index + 3,
        end_index - 1,
    );
    return share.StringFunc.trim(result);
}

export function is_top_frame() {
    return globalThis.top === globalThis.self;
}
