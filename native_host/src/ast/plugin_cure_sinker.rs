//! 这里实现处理 JS 的 AST 插件 —— 在不同表达式中插入一个 hook 方法

use crate::ast::utils;
use swc_core::common::util::take::Take;
use swc_core::ecma::ast::*;
use swc_core::ecma::visit::*;

/// 一个给 JS 代码添加 Hook 的 ast 插件
pub struct AddCureSinkerVisitor;

// 类似 Babel 的 visitor https://rustdoc.swc.rs/swc_ecma_visit/trait.VisitMut.html
impl VisitMut for AddCureSinkerVisitor {
    /// 处理变量声明，如 let a = x 形式
    fn visit_mut_var_declarator(&mut self, node: &mut VarDeclarator) {
        // 调用它循环处理子节点
        node.visit_mut_children_with(self);
        if let Some(init) = node.init.as_mut() {
            // let a = b = x 这种连等形式，直接返回
            // 因为它会被【赋值表达式插件】处理！
            if init.is_assign() {
                return;
            }

            if utils::is_node_hookable(init) {
                // 将 let a = x 的右侧节目包裹成 hook(x) 的形式
                let new_init = utils::hook_one_node(init);
                node.init = Some(Box::new(new_init));
            }
        }
    }

    /// 处理赋值表达式，如 a = x 形式
    fn visit_mut_assign_expr(&mut self, node: &mut AssignExpr) {
        node.visit_mut_children_with(self);
        if utils::is_node_hookable(&node.right) {
            let new_right = utils::hook_one_node(&node.right);
            node.right = Box::new(new_right);
        }
    }

    /// 处理对象表达式，如 a = {x: 1} 的形式
    fn visit_mut_prop(&mut self, node: &mut Prop) {
        node.visit_mut_children_with(self);
        // 只处理 {x: 1} 这种 key-value 形式
        if !node.is_key_value() {
            return;
        }

        // 判断它的 value（属性值）是否可以 hook
        if let Some(key_value) = node.as_mut_key_value() {
            if utils::is_node_hookable(&key_value.value) {
                let new_value = utils::hook_one_node(&key_value.value);
                key_value.value = Box::new(new_value);
            }
        }
    }

    /// 处理函数调用时的参数，如 func(x) 的形式
    fn visit_mut_call_expr(&mut self, node: &mut CallExpr) {
        node.visit_mut_children_with(self);

        if utils::is_hooked_function(node) {
            return;
        }

        node.args.iter_mut().for_each(|arg| {
            if !utils::is_hooked(&arg.expr) {
                // hook 参数哟
                arg.expr = Box::new(utils::hook_one_node(&arg.expr));
            }
        });
    }

    // #region 删除 debugger 语句

    /// 参考 https://swc.rust-lang.net.cn/docs/plugin/ecmascript/cheatsheet#delete-from-the-parent-handler
    fn visit_mut_stmts(&mut self, node: &mut Vec<Stmt>) {
        node.visit_mut_children_with(self);
        // 保留不是 debugger 的语句
        // 另外，删除 debugger 语句后，来留下了空语句，这个也需要删除
        // 此处只能删除【非模块级别】的空语句
        node.retain(|stmt| !stmt.is_debugger() && !stmt.is_empty());
    }

    fn visit_mut_stmt(&mut self, node: &mut Stmt) {
        node.visit_mut_children_with(self);
        if node.is_debugger() || node.is_empty() {
            node.take();
        }
    }

    /// 删除模块级别的空语句，解决【删除 debugger;】语句后留下的分号
    fn visit_mut_module_items(&mut self, items: &mut Vec<ModuleItem>) {
        items.visit_mut_children_with(self);
        items.retain(|item| match item {
            ModuleItem::Stmt(Stmt::Empty(_)) => false,
            _ => true,
        });
    }

    // #endregion
}
