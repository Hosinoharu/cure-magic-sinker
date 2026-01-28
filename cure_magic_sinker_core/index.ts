import "./inject";

// #cure-warn 善后处理，移除本代码所在的 script 标签
// 放心，它一定会是第一个 script！
document.querySelector("script")?.remove();
