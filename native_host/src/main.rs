//! 文档 https://developer.chrome.google.cn/docs/extensions/develop/concepts/native-messaging?hl=zh-cn#native-messaging-host-protocol
//! 此处实现 native messaging 的通信与处理
//! 每条消息都使用 JSON 进行序列化、使用 UTF-8 进行编码，并且前面带有以原生字节顺序表示的 32 位消息长度

mod ast;
mod html;
mod http_server;

use serde::{Deserialize, Serialize};
use std::{
    io::{self, Read, Write},
    process::exit,
};

use crate::http_server::HttpServer;

// #region 消息格式

/// 插件指定 native host 的操作
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum OP {
    /// 退出程序
    Exit,
    /// 开启 HTTP 服务
    StartHTTP,
    /// 关闭 HTTP 服务
    StopHTTP,
    /// 处理 JS
    ProcessJS,
    /// 处理 HTML
    ProcessHTML,
}

/// 插件发送过来的数据
#[derive(Debug, Deserialize)]
struct InMessage {
    id: String,
    /// 要执行的操作
    op: OP,
    /// 根据操作其含义不同
    /// - `StartHTTP`：传入的端口号
    /// - `ProcessJS`：传入的 JS 代码
    data: Option<String>,
}

/// 发送给插件的数据
#[derive(Debug, Serialize)]
struct OutMessage {
    id: String,
    /// 执行结果
    result: Option<String>,
    /// 错误信息
    error: Option<String>,
    /// 内容太多时需要分片发送，它表示了分片的顺序，从 1 开始！
    /// - 如果为 undefined，则表示【根本不需要分片发送啦】
    ///  - 如果为 0 ，则表示【这是最后一个分片】
    next: Option<u32>,
}

impl OutMessage {
    /// 创建一个表示【不需要分片发送】的 OutMessage
    fn new(id: String, result: Option<String>, error: Option<String>) -> Self {
        Self {
            id,
            result,
            error,
            next: None,
        }
    }

    /// 创建一个表示【分片发送】的 OutMessage
    /// - `next` 为 0 时表示这是最后一个分片
    fn new_split(id: String, result: String, next: u32) -> Self {
        Self {
            id,
            result: Some(result),
            error: None,
            next: Some(next),
        }
    }
}

// #endregion

// #region 读写消息

/// 从 stdin 读取一条 native messaging 消息
fn read_native_message() -> io::Result<Option<Vec<u8>>> {
    // 读取 4 字节长度，如果 stdin 关闭则返回 Ok(None)
    let mut len_buf = [0u8; 4];
    match io::stdin().read_exact(&mut len_buf) {
        Ok(_) => {}
        Err(ref e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }

    // 使用原生字节序
    let len = u32::from_ne_bytes(len_buf) as usize;
    if len == 0 {
        return Ok(Some(Vec::new()));
    }
    let mut buf = vec![0u8; len];
    io::stdin().read_exact(&mut buf)?;
    Ok(Some(buf))
}

/// 向 stdout 写入一条 native messaging 消息
fn write_native_message(bytes: &[u8]) -> io::Result<()> {
    let len = bytes.len() as u32;
    // 原生字节序
    let len_buf = len.to_ne_bytes();

    let mut stdout = io::stdout();
    stdout.write_all(&len_buf)?;
    stdout.write_all(bytes)?;
    stdout.flush()?;
    Ok(())
}

/// 将 OutMessage 序列化并发送给插件
fn write_out_message(msg: &OutMessage) -> io::Result<()> {
    let bytes = match serde_json::to_vec(msg) {
        Ok(bytes) => bytes,
        Err(e) => {
            let msg = OutMessage::new(
                "-1".to_string(),
                None,
                Some(format!("convert to json faild: {}", e)),
            );
            serde_json::to_vec(&msg)?
        }
    };
    write_native_message(&bytes)
}

/// 当 result 内容太多时，需要分片发送 OutMessage
fn write_out_message_split(op: OP, msg: &OutMessage) -> io::Result<()> {
    // 先将文本转为 utf8 编码
    if let Some(s) = msg.result.clone() {
        let bytes = s.into_bytes();

        // native host 最大发送 1Mib 数据，但转为 JSON 后还会有一些增加，不详细计算了
        // 直接按 648kb 发送！
        let chunk_size = 648 * 1024;

        // 无需分片
        if bytes.len() <= chunk_size {
            // 如果是处理 js、html，则在这里进行 base64 编码
            if OP::ProcessJS == op || OP::ProcessHTML == op {
                let new_result =
                    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
                let msg = OutMessage::new(msg.id.clone(), Some(new_result), None);
                return write_out_message(&msg);
            } else {
                return write_out_message(msg);
            }
        }

        // 分片，每次构建一个 OutMessage，然后发送
        for i in 0..((bytes.len() + chunk_size - 1) / chunk_size) {
            let start = i * chunk_size;
            let end = if start + chunk_size >= bytes.len() {
                bytes.len()
            } else {
                start + chunk_size
            };
            let chunk = &bytes[start..end];
            // 需要将 chunk 编码成 base64 的字符串
            let new_result =
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, chunk);

            let next = if end == bytes.len() { 0 } else { i + 1 };
            let msg = OutMessage::new_split(msg.id.clone(), new_result, next as u32);
            write_out_message(&msg)?;
        }
    }

    return Ok(());
}

// #endregion

/// 处理一条 InMessage，返回要回写的 OutMessage。
async fn handle_message(msg: InMessage, server: &mut Option<HttpServer>) -> OutMessage {
    let id = msg.id.clone();
    // 这缩进真是美妙~
    match msg.op {
        OP::Exit => {
            if let Some(s) = server.take() {
                let _ = s.stop().await;
            }

            let _ = write_out_message(&OutMessage::new(id, Some("exit".to_string()), None));

            exit(0);
        }
        OP::StartHTTP => {
            // 先停止再开启咯
            if let Some(s) = server.take() {
                let _ = s.stop().await;
            }

            match msg.data {
                Some(port) => match HttpServer::try_new(port.clone()).await {
                    Ok(s) => {
                        *server = Some(s);
                        OutMessage::new(
                            id,
                            Some(format!("HTTP server started at port {}", port)),
                            None,
                        )
                    }
                    Err(e) => OutMessage::new(id, None, Some(e.to_string())),
                },
                None => OutMessage::new(id, None, Some("StartHTTP requires port".to_string())),
            }
        }
        OP::StopHTTP => match server.take() {
            Some(s) => match s.stop().await {
                Ok(()) => OutMessage::new(id, Some("HTTP server stopped".to_string()), None),
                Err(e) => OutMessage::new(id, None, Some(e.to_string())),
            },
            None => OutMessage::new(id, None, Some("HTTP server not started".to_string())),
        },
        OP::ProcessJS => {
            // 发过来的 js 代码是 base64 编码的，需要解码
            match base64::Engine::decode(
                &base64::engine::general_purpose::STANDARD,
                msg.data.unwrap_or_default(),
            ) {
                Ok(raw) => {
                    let js_code = String::from_utf8(raw).unwrap_or_default();
                    if js_code.is_empty() {
                        return OutMessage::new(id, None, Some("js code is empty".to_string()));
                    }

                    match ast::process_js(js_code) {
                        Ok(result) => OutMessage::new(id, Some(result), None),
                        Err(e) => OutMessage::new(id, None, Some(e.to_string())),
                    }
                }
                Err(e) => {
                    return OutMessage::new(id, None, Some(format!("base64 decode faild: {}", e)));
                }
            }
        }
        OP::ProcessHTML => {
            match base64::Engine::decode(
                &base64::engine::general_purpose::STANDARD,
                msg.data.unwrap_or_default(),
            ) {
                Ok(raw) => {
                    let html_code = String::from_utf8(raw).unwrap_or_default();
                    if html_code.is_empty() {
                        return OutMessage::new(id, None, Some("html code is empty".to_string()));
                    }

                    match html::process_html(html_code, None) {
                        Ok(result) => OutMessage::new(id, Some(result), None),
                        Err(e) => OutMessage::new(id, None, Some(e.to_string())),
                    }
                }
                Err(e) => {
                    return OutMessage::new(id, None, Some(format!("base64 decode faild: {}", e)));
                }
            }
        }
    }
}

fn main() {
    let rt = tokio::runtime::Runtime::new().expect("create tokio runtime faild");

    // 因为最多只能存在一个服务器，所以不需要使用 Arc<Mutex<x>>
    let mut server: Option<HttpServer> = None;
    // 不愧是很美感的缩进
    loop {
        match read_native_message() {
            Ok(Some(buf)) => {
                match serde_json::from_slice::<InMessage>(&buf) {
                    Ok(in_msg) => {
                        let op = in_msg.op.clone();
                        let out = rt.block_on(handle_message(in_msg, &mut server));
                        if let Err(e) = write_out_message_split(op, &out) {
                            eprintln!("Failed to write response: {}", e);
                            break;
                        }
                    }
                    Err(e) => {
                        // JSON 解析错误：返回错误信息
                        // 尝试从收到的原始字节构造 id（如果能解析部分）
                        let id = match serde_json::from_slice::<serde_json::Value>(&buf)
                            .ok()
                            .and_then(|v| {
                                v.get("id").and_then(|x| x.as_str()).map(|s| s.to_string())
                            }) {
                            Some(s) => s,
                            None => "-1".to_string(),
                        };
                        let out =
                            OutMessage::new(id, None, Some(format!("invalid input json: {}", e)));
                        if let Err(e) = write_out_message(&out) {
                            eprintln!("Failed to write parsing error response: {}", e);
                            break;
                        }
                    }
                }
            }
            // stdin off
            Ok(None) => break,
            Err(e) => {
                eprintln!("read_message error: {}", e);
                break;
            }
        }
    }
}
