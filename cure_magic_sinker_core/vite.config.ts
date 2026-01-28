import * as path from "path";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { vite_plugin_copy_files } from "../vite_plugin/vite-plugin-copy-files";

const curr_dir = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(curr_dir, "../dist_native");
const extension_dist = path.resolve(curr_dir, "../dist");

export default defineConfig({
    plugins: [
        // 需要将 wasm_bg.wasm 从 dist 目录移动到插件的 dist 目录中
        vite_plugin_copy_files([
            {
                from: path.resolve(dist, "wasm_bg.wasm"),
                to: path.resolve(extension_dist),
                new_filename: "swc.wasm",
            },
        ]),
    ],
    define: {
        __IS_DEV__: false,
    },
    build: {
        minify: false,
        outDir: dist,
        emptyOutDir: false,
        rollupOptions: {
            input: {
                cure_magic_sinker_core: path.resolve(curr_dir, "index.ts"),
            },
            output: {
                entryFileNames: "[name].js",
                chunkFileNames: "[name].js",
                assetFileNames: "[name].[ext]",
                format: "iife",
            },
        },
    },
});
