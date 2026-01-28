import * as path from "path";
import { defineConfig, PluginOption, UserConfig } from "vite";
import { fileURLToPath } from "node:url";

const curr_dir = path.dirname(fileURLToPath(import.meta.url));

const user_config: UserConfig = {
    root: curr_dir,
    base: "./",
    define: {
        __IS_DEV__: false,
    },
    plugins: [vite_plugin_use_wasm()],
    build: {
        rollupOptions: {
            input: {
                index: path.resolve(curr_dir, "index.html"),
            },
            output: {
                entryFileNames: "[name].js",
                chunkFileNames: "[name].js",
                assetFileNames: "[name].[ext]",
            },
        },
    },
};

export default defineConfig(({ command }) => {
    if (command === "serve") {
        user_config.define!.__IS_DEV__ = true;
    }
    return user_config;
});

/** 解决测试的时候报错：
 * `WebAssembly.instantiateStreaming` failed because your server
 * does not serve Wasm with `application/wasm` MIME type. Falling
 * back to `WebAssembly.instantiate` which is slower.
 */
function vite_plugin_use_wasm(): PluginOption {
    return {
        name: "vite-plugin-use-wasm",

        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url && req.url.endsWith(".wasm")) {
                    // 请求 wasm 时访问 node_modules/.vite/deps/wasm_bg.wasm
                    // 其实那里根本没有 wasm 文件，让它去原本位置找
                    req.url = req.url.replace(".vite/deps", "@swc/wasm-web");
                    res.setHeader("Content-Type", "application/wasm");
                }
                next();
            });
        },
    };
}
