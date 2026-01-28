//! 一些关于 ast 处理的工具函数

use swc_core::ecma::ast::*;

/// 添加的 hook 函数名称，它应该和插件端注入的名称相同！
const HOOK_NAME: &str = "cure_sinker";

/// 判断一个 ast node 是否可以被包裹成 `hook(x)` 的形式。
/// 这是判断节点自身，根据节点的值来判断，不考虑它位于什么代码结构！
pub fn is_node_hookable(node: &Expr) -> bool {
    // 一个变量肯定被赋值过，所以会记录它的值，所以不需要处理
    // node.is_ident() // 是一个标识符，需要获取标识符的值，比如 hook(a)
    node.is_lit() || node.is_tpl() // 是一个字面量，或者模板字符串
    // 对象的属性也一定被赋值过（或者初始化过），所以不需要处理
    // || node.is_member() // 是一个成员表达式，需要获取成员表达式的值，比如 hook(a.b)
    || (node.is_call() && !is_hooked(node)) // 是一个调用表达式，需要获取函数的返回值，比如 hook(a())
    // 经过实践，异步调用很少，暂时忽略
    // || node.is_await_expr() // await func() 这样的调用
    // 情况稀少，所以不考虑
    // || node.is_new() // 是一个 new 表达式，需要获取 new 表达式的返回值，比如 hook(new String())
    // 经过实践可以忽略
    // || node.is_unary() // 是一个一元表达式，需要获取一元表达式的返回值，比如 hook(!a)
    || node.is_bin() // 是一个二元表达式，需要获取二元表达式的返回值，比如 hook(a + b)
}

/// 将一个 node 包裹成 `hook(x)` 的形式
pub fn hook_one_node(node: &Expr) -> Expr {
    // 生成标识符名称 hook
    let ident = Ident::new(HOOK_NAME.into(), Default::default(), Default::default());
    // 转为表达式
    let new_node = Box::new(Expr::Ident(ident));
    // 生成一个 CallExpression
    CallExpr {
        callee: Callee::Expr(new_node),
        args: vec![ExprOrSpread {
            expr: Box::new(node.clone()),
            spread: None,
        }],
        type_args: None,
        span: Default::default(),
        ctxt: Default::default(),
    }
    .into()
}

/// 判断一个节点是否被 hook 过，避免重复 hook
pub fn is_hooked(node: &Expr) -> bool {
    match node {
        Expr::Call(call) => is_hooked_function(call),
        _ => false,
    }
}

/// 判断一个函数是否被 hook 过
pub fn is_hooked_function(node: &CallExpr) -> bool {
    // 获取该函数的名称
    if let Callee::Expr(expr) = &node.callee {
        if let Expr::Ident(ident) = expr.as_ref() {
            return ident.sym.as_str() == HOOK_NAME;
        }
    }
    return false;
}
