type OneRule = {
    rule: string;
    enable: boolean;
    /** 上述规则是否有效 */
    invalid: boolean;
};

type OneHostRule = {
    /** 是否在该网站开启功能 */
    enable: boolean;
    /** 规则列表 */
    rules: OneRule[];
    /** 是否排除模式，也就是说默认处理所有文件，除了规则列表匹配的 */
    exclude: boolean;
};

/** 全局忽略 */
type GlobalIgnore = OneRule[];

/** 插件存储的规则，key 是网站的 host */
type RuleStorage = { [key: string]: OneHostRule | undefined };

/** 插件存储的整体结构 */
type ExtensionStorage = {
    /** 不同网站规则 */
    host_rules: RuleStorage;
    /** 规定一个特殊的名称 `global_ignore`，表示全局忽略，即匹配这些的链接都不处理，主要用于过滤一些库。 */
    global_ignore: GlobalIgnore;
    /** 本地的 http server  */
    http_server: {
        on: boolean;
        port: string;
    };
};

type MsgFromDevtool = {
    tabId: number;
    action: "on" | "off";
};

declare const __IS_DEV__: boolean;
