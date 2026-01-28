type MsgBase<T extends string, D> = {
    type: T;
    data: D;
};

type MsgBTCCheck = MsgBase<"ping", undefined>;

type MsgBTCMatch = MsgBase<
    "match",
    {
        id: string;
        url: string;
        rule: string;
        exclude: boolean;
    }
>;

type MsgBTCDone = MsgBase<
    "done",
    {
        id: string;
        duration: string;
    }
>;

type MsgBTC = MsgBTCCheck | MsgBTCMatch | MsgBTCDone;

type WaittingQueue = {
    channel_ok: boolean;
    queue: MsgBTC[];
};

// #region native host messaging type

type ReWriteType = "html" | "js";

/** native messaging 的通信协议
 *
 * 具体见 `rust native_messaging 实现`
 */
type OP = "Exit" | "StartHTTP" | "StopHTTP" | "ProcessJS" | "ProcessHTML";

/// 插件发送的数据格式
type InMessage = {
    id: string;
    /// 要执行的操作
    op: OP;
    /// 根据操作其含义不同
    /// - `OpenHTTP`：传入的端口号
    /// - `ProcessJS`：传入的 JS 代码
    /// - `ProcessHTML`：传入的 HTML 代码
    data?: string;
};

/// 插件接受的数据
type OutMessage = {
    id: string;
    /// 执行结果
    result?: string;
    /// 错误信息
    /// - 如果存在错误信息，则 result 为空字符串
    /// - 否则，此处为空字符串
    error?: string;
    /**
     * native host 返回的内容太多时需要分片发送，它表示了分片的顺序，从 1 开始！
     * - 如果为 undefined，则表示【根本不需要分片发送啦】
     * - 如果为 0 ，则表示【这是最后一个分片】
     *
     * 注意！分片过程中发过来的 result 是经过 base64 编码的！
     */
    next?: number;
};

// #endregion
