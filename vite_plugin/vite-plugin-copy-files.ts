import fs from "fs";
import path from "path";

type CopyOptions = {
    from: string;
    to: string;
    new_filename?: string;
};

export function vite_plugin_copy_files(option: CopyOptions[]) {
    function copy_one_file(filepath: string, des: string, new_filename?: string) {
        if (!fs.existsSync(filepath)) {
            console.error("[copy] file not found:", filepath);
            return;
        }
        if (!fs.existsSync(des)) {
            fs.mkdirSync(des, { recursive: true });
            console.log(`[copy] create destination dir:`, des);
        }

        const filename = new_filename ?? path.basename(filepath);
        try {
            fs.copyFileSync(filepath, path.join(des, filename));
            console.log(`[copy] file <${filename}> to:`, des);
        } catch (e) {
            console.error(`[copy] file <${filename}> failed:`, e);
        }
    }

    function copy_one_dir(dir: string, des: string) {
        if (!fs.existsSync(dir)) {
            console.error("[copy] file not found:", dir);
            return;
        }
        if (!fs.existsSync(des)) {
            fs.mkdirSync(des, { recursive: true });
            console.log(`[copy] create destination dir:`, des);
        }

        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filepath = path.join(dir, file);
            if (fs.statSync(filepath).isDirectory()) {
                return copy_one_dir(filepath, path.join(des, file));
            }
            copy_one_file(filepath, des);
        }
    }

    return {
        name: "vite-plugin-copy-files",

        closeBundle() {
            for (const opt of option) {
                if (fs.statSync(opt.from).isDirectory()) {
                    copy_one_dir(opt.from, opt.to);
                } else {
                    copy_one_file(opt.from, opt.to, opt.new_filename);
                }
            }
        },
    };
}
