# 编译 native_host 并将对应 release 文件移动到 `../dist_native` 目录


$script_dir = $PSScriptRoot

$target = Join-Path -Path $script_dir -ChildPath "target/release/cure_magic_sinker.exe"

$relative_destination = Join-Path -Path $script_dir -ChildPath "../dist_native"
$full_destination = Resolve-Path -Path $relative_destination -ErrorAction SilentlyContinue

if (-not $full_destination) {
    Write-Host "dist_navite folder is not exist" -ForegroundColor Red
    return
}

Push-Location -Path $script_dir
try {
    cargo build --release
} finally {
    Pop-Location
}

if (Test-Path $target) {
    Copy-Item -Path $target -Destination $full_destination
    Write-Host "move release file to dist_native ok" -ForegroundColor Green
} else {
    Write-Host "release file not found"
}