import * as path from "path";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const curr_dir = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(curr_dir, "../../dist");

export default defineConfig({
    build: {
        minify: false,
        outDir: dist,
        emptyOutDir: false,
        rollupOptions: {
            input: {
                content: path.resolve(curr_dir, "content.ts"),
            },
            output: {
                entryFileNames: "[name].js",
            },
        },
    },
});
