//! 测试处理 html 文档
//! 用法：cargo run --example process_html -- <input_file>
//! 或者编译之后再使用：cargo build --example process_html
//!
//! 输出：output.html，和 <input_file> 在同一目录下

use cure_magic_sinker::process_html;
use std::fs;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 2 {
        eprintln!("Usage: {} <input_file>", args[0]);
        std::process::exit(1);
    }

    let current_dir = std::env::current_dir()?;
    println!("current_dir: {:?}", current_dir);
    let cure_magic_sinker_core = current_dir.join("../dist_native/cure_magic_sinker_core.js");
    // println!("cure_magic_sinker_core.js: {:?}", cure_magic_sinker_core);

    let input_path = std::path::Path::new(&args[1]);
    let input = fs::read_to_string(input_path)?;
    let output = process_html(input, cure_magic_sinker_core.to_str())?;

    let output_path = input_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("output.html");
    fs::write(output_path, output)?;

    Ok(())
}
