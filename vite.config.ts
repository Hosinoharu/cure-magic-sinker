/** 打包 background */

import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath, URL } from "node:url";
import { vite_plugin_copy_files } from "./vite_plugin/vite-plugin-copy-files";

const curr_dir = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(curr_dir, "dist");

const service_worker = path.join(curr_dir, "src/background/service_worker.ts");
const icons = path.join(curr_dir, "icons");
const manifest = path.join(curr_dir, "src/manifest.json");

export default defineConfig({
    build: {
        minify: false,
        emptyOutDir: false,
        rollupOptions: {
            input: {
                service_worker: service_worker,
            },
            output: {
                entryFileNames: "[name].js",
                assetFileNames: "[name].[ext]",
            },
        },
    },
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    plugins: [
        vite_plugin_copy_files([
            { from: icons, to: path.join(dist, "icons") },
            { from: manifest, to: dist },
            { from: manifest, to: dist },
        ]),
    ],
});
