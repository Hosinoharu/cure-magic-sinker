//! 基于 ast 处理 js 代码

mod plugin_cure_sinker;
mod utils;
use plugin_cure_sinker::AddCureSinkerVisitor;

use swc_core::common::errors::*;
use swc_core::common::sync::Lrc;
use swc_core::common::*;
use swc_core::ecma::codegen::text_writer::JsWriter;
use swc_core::ecma::codegen::{Config, Emitter};
use swc_core::ecma::parser::*;
use swc_core::ecma::visit::*;

/// 使用预定义的 AST 插件处理一个 JS 代码
pub fn process_js(code: String) -> Result<String, Box<dyn std::error::Error>> {
    let cm: Lrc<SourceMap> = Default::default();
    let handler = Handler::with_tty_emitter(ColorConfig::Auto, true, false, Some(cm.clone()));

    let fm = cm.new_source_file(Lrc::new(FileName::Anon), code);

    let lexer = Lexer::new(
        Syntax::Es(Default::default()),
        swc_ecma_ast::EsVersion::EsNext,
        StringInput::from(&*fm),
        None,
    );

    let mut parser = Parser::new_from(lexer);

    for e in parser.take_errors() {
        e.into_diagnostic(&handler).emit();
    }

    let mut module = parser
        .parse_module()
        .map_err(|e| format!("parse js code error: {:?}", e))?;

    module.visit_mut_with(&mut AddCureSinkerVisitor);

    let code = {
        let mut buf = Vec::new();

        {
            let config = Config::default().with_minify(true);
            let mut emitter = Emitter {
                cfg: config,
                cm: cm.clone(),
                comments: None,
                wr: JsWriter::new(cm, "\n", &mut buf, None),
            };

            emitter.emit_module(&module)?;
        }

        String::from_utf8_lossy(&buf).to_string()
    };

    Ok(code)
}
