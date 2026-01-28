//! 给指定的 js 进行处理
//! 用法：cargo run --example add_cure_sinker -- <input_file>
//! 或者编译之后再使用：cargo build --example add_cure_sinker
//!
//! 输出：output.js，和 <input_file> 在同一目录下

use cure_magic_sinker::process_js;
use std::fs;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 2 {
        eprintln!("Usage: {} <input_file>", args[0]);
        std::process::exit(1);
    }

    let input_path = std::path::Path::new(&args[1]);
    let input = fs::read_to_string(input_path)?;
    let output = process_js(input)?;

    let output_path = input_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("output.js");
    fs::write(output_path, output)?;

    Ok(())
}
