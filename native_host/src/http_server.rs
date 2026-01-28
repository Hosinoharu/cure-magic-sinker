//! 此处实现 http server
//! 它只暴露一个链接：`http://localhost:port/process-js`
//! 插件通过 post 提交代码来处理
//! 端口 port 由插件通过 native messaging 传递

use crate::ast;
use axum::{
    Router,
    body::{Body, Bytes},
    http::{HeaderName, HeaderValue},
    response::Response,
    routing::post,
};
use tokio;

async fn handle_js(body: Bytes) -> Response {
    let response_body = match String::from_utf8(body.to_vec()) {
        Ok(s) => match ast::process_js(s) {
            Ok(processed) => Body::from(processed),
            Err(_) => Body::from(body),
        },
        // 解析失败就原样返回 body（保持二进制）
        Err(_) => Body::from(body),
    };

    let mut res = Response::new(response_body);
    res.headers_mut().insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/javascript; charset=utf-8"),
    );
    // 允许跨域
    res.headers_mut().insert(
        axum::http::header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    // 允许 Private Network Access
    res.headers_mut().insert(
        HeaderName::from_static("access-control-allow-private-network"),
        HeaderValue::from_static("true"),
    );
    res
}

/// 处理 options 请求
async fn before_handle_js() -> Response {
    let mut res = Response::new(Body::empty());
    // 允许跨域
    res.headers_mut().insert(
        axum::http::header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    // 允许 Private Network Access
    res.headers_mut().insert(
        HeaderName::from_static("access-control-allow-private-network"),
        HeaderValue::from_static("true"),
    );
    res
}

pub struct HttpServer {
    /// 用于从外部发送停止信号给服务器 task
    stop_tx: tokio::sync::oneshot::Sender<()>,
    /// 被 spawn 的服务器异步 task 句柄，用于等待任务结束
    join_handle: tokio::task::JoinHandle<()>,
    start: bool,
}

impl HttpServer {
    /// 启动 http server，若端口被占用则返回 Err
    pub async fn try_new(port: String) -> Result<Self, std::io::Error> {
        let addr = format!("0.0.0.0:{}", port);
        let listener = tokio::net::TcpListener::bind(addr).await?;

        let (stop_tx, stop_rx) = tokio::sync::oneshot::channel();

        let join_handle = tokio::spawn(async move {
            let app = Router::new()
                .route("/process-js", post(handle_js))
                .route("/process-js", axum::routing::options(before_handle_js));

            let server = axum::serve(listener, app);
            let graceful = server
                .with_graceful_shutdown(async {
                    // 发送方没了则返回 Err
                    stop_rx.await.unwrap_or(());
                })
                .await;
            if let Err(e) = graceful {
                eprintln!("server error: {}", e);
            }
        });

        Ok(Self {
            stop_tx,
            join_handle,
            start: true,
        })
    }

    /// 停止 server
    pub async fn stop(mut self) -> Result<(), String> {
        if !self.start {
            return Ok(());
        }
        self.start = false;

        // 接受方已经没了
        if let Err(_) = self.stop_tx.send(()) {
            return Ok(());
        }

        // 等待任务结束，设置超时以免无限等待
        let timeout = tokio::time::Duration::from_secs(5);
        match tokio::time::timeout(timeout, self.join_handle).await {
            Ok(res) => match res {
                Ok(_) => Ok(()),
                Err(e) => Err(e.to_string()),
            },
            Err(_) => Err("timeout waiting server stop".into()),
        }
    }
}
