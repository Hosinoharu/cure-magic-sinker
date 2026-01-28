这里记录网站可能的检测。

# 多余的 script

在 [第一题 js混淆源码乱码 - 猿人学](https://match.yuanrenxue.cn/match/1) 中，存在代码**利用网站 script 的个数进行解密**。

```js
window.c = cure_sinker($(cure_sinker("script")).size() - 6);
```

而改进后的、插入 hook 代码的方案就是新增 script，这导致网站运行错误咯。

**所以运行 hook 代码后需要删除其所在的 script！**

# 网站代码的变动

## JS

当前使用 AST 处理代码当然效果不错，但修改的地方太多了。**原本压缩的代码被展开；如果选择压缩，原本展开的代码会被压缩** —— 除了我使用 AST 修改的部分，其它的代码应该保持原样！

怎么办呢？！和 AI 交流后的方案：使用 AST 定位到要插入 Hook 的位置，然后进行字符串拼接。

额，先不管了，AST 处理之后，直接压缩所有的代码好了。

_预想中的检测自然是使用 `.toString()` 获取函数的文本进行各种判断_，其实这也很好解决，因为我已经插入了 `hook`，我可以在方法中判断：如果当前是一个字符串，且包含 `cure_sinker`，那么就去掉这些插入的字符串，从而过掉检测。

## HTML

在处理 html 中的内联 js 代码时，使用第三方库解析 html 也会修改其中的文本（比如空格、注释等等），这也可能被检测，正确的做法是只处理 `<script>` 中的 JS 代码，**后续的方案实现一个简单的 html 解析器** —— 还是等真的被检测了再说。

# Executing inline script Error

具体报错信息：

> Executing inline script violates the following Content Security Policy directive 'script-src 'report-sample' 'strict-dynamic' 'nonce-mfmwwSdbrdoaR61bi4J_W' 'wasm-unsafe-eval' 'unsafe-eval' 'self' ...'.
>
> Either the 'unsafe-inline' keyword, a hash ('..'), or a nonce ('nonce-...') is required to enable inline execution. The action has been blocked.

询问 AI 后我认为的解决方案：在 html 响应头中的 `content-security-policy` 字段后面追加一个 `script-src 'nonce-cure_magic_sinker_nonce'`。

也可以使用 `<script src="..">` 的形式，然后在插件中对该 url 进行拦截、返回响应 —— 这就说明 hook 代码需要放入到插件目录中！

> 太麻烦了，直接删除该字段好了！

# 异常退出插件的调试模式

在测试抖音时，下面语句会导致插件退出调试模式！

```js
let e = document.createElement("iframe");
e.src = "bitbrowser://cc/";
e.width = "0";
e.height = "0";
e.style.display = "none";
document.body.appendChild(e);
```

AI 给出的答案：

这段代码通过向 iframe 指定自定义协议导致浏览器对当前 target 做“外部协议处理”或触发目标切换/重启，进而使 chrome.debugger 所附着的调试会话被断开（强制退出）。

要解决，可以避免插入这样的 iframe、在插入前后管理调试会话，或在扩展/页面里拦截并阻止该 iframe 的创建。

**我还是重新开启调试模式吧**。
