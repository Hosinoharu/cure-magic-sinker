declare function cure_sinker(v: any): void;

type MethodToFunc<
    T extends (...args: any[]) => any,
    ThisType = ThisParameterType<T>,
> = (_this: ThisType, ...args: Parameters<T>) => ReturnType<T>;

type OneStackInfo = {
    /** 堆栈信息 */
    stack: string;
    /** 该堆栈访问链 */
    chain: StackChain;
};

/** 记录某个值的堆栈信息，这是存储到 indexedDB 时的格式哟 */
type OneValueStackInfo = {
    /** 存储的值，它作为主键 */
    key: string;
    /** 该值出现过的堆栈信息 */
    stack: Set<string>;
};

/** 堆栈链，即函数调用顺序，如 [A, B, C]，它表示调用顺序为 A -> B -> C */
type StackChain = string[];

type FilterSetting = {
    /** 字符串的最小长度 */
    min_length: number;
    /** 字符串的最大长度，为空表示不受限 */
    max_length: number;
    /** 过滤器，返回 true 表示保留，返回 false 表示过滤掉 */
    filter: (v: string) => boolean;
    /** 是否处理动态生成的 js code */
    handle_vm_code: boolean;
};

type MsgToWorker =
    | {
          type: "add";
          data: OneValueStackInfo;
      }
    | {
          type: "find";
          data: string | RegExp;
      };

type MsgFromWorker =
    | {
          type: "db-init";
      }
    | {
          type: "find-result";
          data: OneValueStackInfo[];
      };
