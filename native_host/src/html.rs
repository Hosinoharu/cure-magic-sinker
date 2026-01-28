//! 此处实现对 html 文档的处理，包括：
//! - 对 <script> 标签的 js 代码进行处理
//! - 注入 hook 代码

use html5ever::tendril::TendrilSink;
use html5ever::tree_builder::TreeSink;
use markup5ever_rcdom as rcdom;
use std::cell::RefCell;
use std::fs::File;
use std::io::Read;
use std::path::Path;

use crate::ast::process_js;

/// 默认从 .exe 文件所在目录下读取 cure_magic_sinker_core.js
const HOOK_FILENAME: &str = "cure_magic_sinker_core.js";

/// 读取核心的 hook 文件，并返回其内容
///
/// 如果读取出错，则返回一个 `console.error("xxx")`，这样在浏览器控制台能看到错误输出
fn load_cure_magic_sinker_core(core_js_path: &str) -> String {
    let path = Path::new(core_js_path);
    if !path.exists() {
        return String::from("console.error('cure_magic_core.js not found')");
    }

    match File::open(path) {
        Ok(mut file) => {
            let mut contents = String::new();
            match file.read_to_string(&mut contents) {
                Ok(_) => {
                    return contents;
                }
                Err(e) => {
                    return format!("console.error('read cure_magic_core.js failed: {}')", e);
                }
            }
        }
        Err(e) => {
            return format!("console.error('open cure_magic_core.js failed: {}')", e);
        }
    }
}

/// 遍历 document，处理 html 中的内联 script 标签！
fn modify_html_script(node: &rcdom::Handle) {
    match &node.data {
        // 仅处理内联的 script
        // #cure-ps 不得不说，这个模式匹配的判断很是一坨！
        rcdom::NodeData::Element { name, attrs, .. }
            if name.local.as_ref() == "script"
                && attrs
                    .borrow()
                    .iter()
                    .all(|attr| attr.name.local.as_ref() != "src") =>
        {
            // #cure-tip 获取 script 的 js 代码并处理
            // 假定它只有一个文本子节点
            if let Some(rcdom::NodeData::Text { contents }) =
                node.children.borrow().first().map(|node| &node.data)
            {
                let js = contents.borrow().to_string();
                match process_js(js) {
                    Ok(new_js) => {
                        let text = html5ever::tendril::StrTendril::from(new_js);
                        *contents.borrow_mut() = text;
                    }
                    Err(_) => {}
                }
            }
        }
        _ => {}
    }

    // #cure-tip 递归处理子节点
    for child in node.children.borrow().iter() {
        modify_html_script(&child);
    }
}

fn find_head_element(node: &rcdom::Handle) -> Option<rcdom::Handle> {
    if let rcdom::NodeData::Element { ref name, .. } = node.data {
        if name.local.as_ref() == "head" {
            return Some(node.clone());
        }
    }
    for child in node.children.borrow().iter() {
        if let Some(found) = find_head_element(child) {
            return Some(found);
        }
    }
    None
}

/// 插入核心的 hook 代码哟
fn insert_cure_magic_sinker_core(doc: &rcdom::RcDom, js_code: String) {
    // #cure-tip 先创建 script 标签，它只包含文本，没有任何属性
    let name = html5ever::QualName::new(
        None,
        html5ever::ns!(html),
        html5ever::LocalName::from("script"),
    );
    let core_script =
        rcdom::RcDom::create_element(&doc, name, Default::default(), Default::default());
    // 插入 js 代码
    // 服了，居然没有 `create_text` 的 API？？？
    let text = html5ever::tendril::StrTendril::from(js_code);
    let text_node = rcdom::Node::new(rcdom::NodeData::Text {
        contents: RefCell::new(text),
    });
    core_script.children.borrow_mut().push(text_node);

    // #cure-tip 找到文档的 head 节点，插入到其中，作为它的第一个节点！
    // 通常来说，document 的子节点一定包含 head 节点，但也有例外
    // 所以，如果下面没有找到 head 节点，那直接插入到 document 的第一个子节点！！
    match find_head_element(&doc.document) {
        Some(head_node) => {
            head_node.children.borrow_mut().insert(0, core_script);
        }
        None => {
            doc.document.children.borrow_mut().insert(0, core_script);
        }
    }
}

/// 处理 html 文档
/// - `html`: 要处理的 html 文档源码
/// - `core_js_path`: 核心 hook 文件的路径，
/// 默认为当前 .exe 文件所在目录下的 cure_magic_sinker_core.js
pub fn process_html(
    html: String,
    core_js_path: Option<&str>,
) -> Result<String, Box<dyn std::error::Error>> {
    // #cure-tip 读写 core hook js 并插入到 html 中
    let core_js_path = core_js_path.unwrap_or(HOOK_FILENAME);
    let core_js = load_cure_magic_sinker_core(core_js_path);

    let dom = html5ever::parse_document(rcdom::RcDom::default(), Default::default())
        .from_utf8()
        .read_from(&mut html.as_bytes())
        .map_err(|e| format!("parse document error: {:?}", e))?;

    modify_html_script(&dom.document);
    insert_cure_magic_sinker_core(&dom, core_js);

    // 转为 html 字符串
    let mut bytes = Vec::new();
    let document: rcdom::SerializableHandle = dom.document.clone().into();
    html5ever::serialize(&mut bytes, &document, Default::default())
        .map_err(|e| format!("serialize html failed: {:?}", e))?;

    let res =
        String::from_utf8(bytes).map_err(|e| format!("convert bytes to string failed: {:?}", e))?;
    Ok(res)
}
