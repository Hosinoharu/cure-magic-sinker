# 文档 https://developer.chrome.google.cn/docs/extensions/develop/concepts/native-messaging?hl=zh-cn
# 根据文档所言，需要将应用程序写入到对应的注册表中
# 本脚本用于创建 `manifest.json` 文件到当前 .py 所在的目录，并注册其到注册表中
# 仅支持 windows


import json
import winreg
from pathlib import Path


def regist_native_messaging(
    registry_paths: dict, native_messaging_name: str, manifest_file: str | None
):
    """注册 native_messaging，如果不传入 manifest_file 则删除注册表"""
    remove = manifest_file is None

    for browser, reg_path in registry_paths.items():
        reg_full_path = f"{reg_path}\\{native_messaging_name}"

        try:
            if remove:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, reg_full_path)
            else:
                with winreg.CreateKey(winreg.HKEY_CURRENT_USER, reg_full_path) as key:
                    winreg.SetValueEx(key, None, 0, winreg.REG_SZ, manifest_file)

            print(f"<{browser}> success")
        except Exception as e:
            print(f" <{browser}> failed: {e}")


def generate_manifest_file(native_messaging_name: str) -> str:
    curr_dir = Path(__file__).parent.absolute()
    manifest_path = curr_dir / "native_manifest.json"

    manifest = {
        "name": native_messaging_name,
        "description": "Cure Magic Sinker native messaging host",
        "path": "./cure_magic_sinker.exe",
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://ckkbkccpdagmhhfefeelnklemkfjpolc/"],
    }

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=4, ensure_ascii=False)

    print(f"create native manifest file: {manifest_path}")

    return str(manifest_path)


if __name__ == "__main__":
    # 不同浏览器注册表路径不同
    registry_paths = {
        "chrome": r"SOFTWARE\\Google\\Chrome\\NativeMessagingHosts",
        # edge-version
        # "edge": r"SOFTWARE\\\Microsoft\\Edge\\NativeMessagingHosts",
    }

    native_messaging_name = "com.cure_magic_sinker.native"
    manifest_file = None

    choice = input("regist(y) / unregist(n)? (y/n) ")
    remove = choice.strip().lower() == "n"
    if not remove:
        manifest_file = generate_manifest_file(native_messaging_name)

    print()
    regist_native_messaging(registry_paths, native_messaging_name, manifest_file)
