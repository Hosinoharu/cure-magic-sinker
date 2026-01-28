此处实现插件的 `native messaging` 程序，它被用于处理 JS 代码。

默认情况下，本地程序以 `native messaging` 方式运行

插件可以发送一个 `native messaging` 消息，让本地程序启用 `HTTP Server` 来处理代码。

# 注意

本地程序尽可能不会报错并退出，如果出现错误，会返回给插件，插件会输出错误信息，并且不会重写响应。
