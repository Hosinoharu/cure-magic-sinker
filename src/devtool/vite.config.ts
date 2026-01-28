import { defineConfig, UserConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { fileURLToPath } from "node:url";
import { vite_plugin_copy_files } from "../../vite_plugin/vite-plugin-copy-files";

const curr_dir = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(curr_dir, "../../dist/devtool");

const user_config: UserConfig = {
    root: curr_dir,
    base: "./",
    define: {
        __IS_DEV__: false,
    },
    build: {
        outDir: dist,
        emptyOutDir: true,
        rollupOptions: {
            input: {
                index: path.join(curr_dir, "./index.html"),
            },
            output: {
                entryFileNames: "[name].js",
                chunkFileNames: "[name].js",
                assetFileNames: "[name].[ext]",
            },
        },
    },
    plugins: [
        vue(),
        vite_plugin_copy_files([
            {
                from: path.join(curr_dir, "./devtools.html"),
                to: dist,
            },
            {
                from: path.join(curr_dir, "./devtools.js"),
                to: dist,
            },
        ]),
    ],
};

export default defineConfig(({ command }) => {
    if (command === "serve") {
        user_config.define!.__IS_DEV__ = true;
    }
    return user_config;
});
