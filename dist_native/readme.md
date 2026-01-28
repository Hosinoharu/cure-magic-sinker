本地程序编译后会放置到该目录哟，将来它和 `dist`（插件目录）一起打包再发布。

# 使用方法

只需要进行注册，当插件启动时，浏览器会自动调用本地程序。

具体文档在[原生消息传递主机位置](https://developer.chrome.google.cn/docs/extensions/develop/concepts/native-messaging?hl=zh-cn#native-messaging-host-location)，不同操作系统有不同的情况，我无法测试其它平台，所以当前仅用于 windows。

运行 `python register.py` 注册本地程序，默认支持 `chrome` 浏览器。

如果需要支持 `edge`，修改 `register.py` 文件 —— 搜索 `edge-version` 然后修改对应的注释、再运行文件。
