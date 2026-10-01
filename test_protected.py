# -*- coding: utf-8 -*-

# -*- coding: utf-8 -*-
# =============================================================================
#   TBAO TEAM — CYBERNETIC LICENSE GUARD WRAPPER
#   HỆ THỐNG BẢO MẬT & XÁC THỰC BẢN QUYỀN PHẦN CỨNG BẤT BIẾN
# =============================================================================

import sys
import os
import json
import subprocess
import hashlib
import time
import urllib.request
import urllib.error

# Kích hoạt màu ANSI Terminal trên Windows 10/11 & Console
if sys.platform.startswith("win"):
    try:
        os.system("")
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ANSI Color Codes
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
DIM = "\033[90m"
BOLD = "\033[1m"
RESET = "\033[0m"

# CẤU HÌNH MÁY CHỦ BẢN QUYỀN (TỰ ĐỘNG CẬP NHẬT TỪ TỦ ĐIỀU KHIỂN)
__LICENSE_SERVER__ = "http://localhost:3000"
__LICENSE_CACHE_FILE__ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "license.key")

def __get_machine_id():
    """Trích xuất mã máy phần cứng bất biến (Motherboard UUID + CPU ID + BaseBoard Serial)"""
    uuid, cpu_id, board_serial = "", "", ""
    try:
        cmd = [
            "powershell", "-NoProfile", "-Command",
            "(Get-CimInstance Win32_ComputerSystemProduct).UUID; (Get-CimInstance Win32_Processor).ProcessorId; (Get-CimInstance Win32_BaseBoard).SerialNumber"
        ]
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode("utf-8", errors="ignore").strip().splitlines()
        if len(out) >= 1 and out[0].strip():
            uuid = out[0].strip()
        if len(out) >= 2 and out[1].strip():
            cpu_id = out[1].strip()
        if len(out) >= 3 and out[2].strip():
            board_serial = out[2].strip()
    except Exception:
        pass

    if not uuid:
        try:
            cmd = 'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid'
            out = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL).decode("utf-8", errors="ignore")
            for line in out.splitlines():
                if "MachineGuid" in line:
                    uuid = line.split()[-1].strip()
        except Exception:
            uuid = os.environ.get("COMPUTERNAME", "STANDALONE-RIG")

    raw = f"{uuid}#{cpu_id}#{board_serial}"
    short_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16].upper()
    return f"HWID-{short_hash}"

def __render_banner(machine_id, status_text=None, is_valid=False):
    """Hiển thị Banner Cyberpunk tự động thích ứng với Terminal (Desktop & Termux Android)"""
    os.system("cls" if os.name == "nt" else "clear")
    try:
        import shutil
        width = shutil.get_terminal_size(fallback=(80, 24)).columns
    except Exception:
        width = 80

    if is_valid:
        action_line = f"  \033[1;32m[✓] License: VALID | Machine: VERIFIED ({machine_id})\033[0m"
    else:
        action_line = f"  \033[1;33m👉 Gửi Mã máy này cho Admin để nhận License Key:\033[0m \033[1;36m{machine_id}\033[0m"

    if width >= 70:
        # Layout Desktop / Rộng (Rainbow THAI BAO DEV + Admin Info)
        banner = f"""\033[38;5;196m
████████╗██╗  ██╗ █████╗ ██╗    ██████╗  █████╗  ██████╗     ██████╗ ███████╗██╗   ██╗
\033[38;5;208m╚══██╔══╝██║  ██║██╔══██╗██║    ██╔══██╗██╔══██╗██╔═══██╗    ██╔══██╗██╔════╝██║   ██║
\033[38;5;226m   ██║   ███████║███████║██║    ██████╔╝███████║██║   ██║    ██║  ██║█████╗  ██║   ██║
\033[38;5;46m   ██║   ██╔══██║██╔══██║██║    ██╔══██╗██╔══██║██║   ██║    ██║  ██║██╔══╝  ╚██╗ ██╔╝
\033[38;5;51m   ██║   ██║  ██║██║  ██║██║    ██████╔╝██║  ██║╚██████╔╝    ██████╔╝███████╗ ╚████╔╝
\033[38;5;21m   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝    ╚═════╝ ╚═╝  ╚═╝ ╚═════╝     ╚═════╝ ╚══════╝  ╚═══╝
\033[38;5;201m ━O━O━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\033[38;5;196m              ZALO ADMIN : 032.7774.256 🔥 💀
\033[38;5;208m ┊👑 Admin : Thai Bao ~~👑tbao team👑~~
\033[38;5;226m ┊💀 KEY PRO | VIP Login Available
\033[38;5;46m ┊👾 Pronouns | Gender : Male
\033[38;5;51m ┊🔥 System : Thai Bao Pro | Max Speed
\033[38;5;21m         Tools Made By VietNam
\033[38;5;201m==================================================================================================
              ︻ ╦ デ ╤ ━ ╼ TOOLS BY THAI BAO - KEY LOGIN TOOL ╾ ━ ╤ デ ╦ ︻\033[0m
{action_line}
\033[38;5;201m==================================================================================================\033[0m
"""
    else:
        # Layout Termux / Mobile / Màn hình nhỏ (Tối ưu cho 36 - 60 cột, không vỡ chữ)
        div = "═" * max(34, min(width - 2, 45))
        banner = f"""\033[38;5;196m   
   ████████╗██████╗  █████╗  ██████╗
\033[38;5;208m   ╚══██╔══╝██╔══██╗██╔══██╗██╔═══██╗
\033[38;5;226m      ██║   ██████╔╝███████║██║   ██║
\033[38;5;46m      ██║   ██╔══██╗██╔══██║██║   ██║
\033[38;5;51m      ██║   ██████╔╝██║  ██║╚██████╔╝
\033[38;5;21m      ╚═╝   ╚═════╝ ╚═╝  ╚═╝ ╚═════╝\033[0m
\033[38;5;201m━O━O━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m
\033[38;5;196m ┊🔥 ZALO ADMIN : 032.7774.256 🔥 💀
\033[38;5;208m ┊👑 Admin : Thai Bao ~~👑tbao team👑~~
\033[38;5;226m ┊💀 KEY PRO | VIP Login Available
\033[38;5;46m ┊👾 Pronouns | Gender : Male
\033[38;5;51m ┊🔥 System : Thai Bao Pro | Max Speed
\033[38;5;21m         Tools Made By VietNam
\033[38;5;201m{div}
 ︻ ╦ デ ╤ ━ ╼ TOOLS BY THAI BAO ╾ ━ ╤ デ ╦ ︻\033[0m
{action_line}
\033[38;5;201m{div}\033[0m
"""
    print(banner)

def __verify_key_online(key, machine_id):
    """Gửi yêu cầu xác thực tới License Server (Có Anti-Replay Nonce & Timestamp)"""
    url = f"{__LICENSE_SERVER__.rstrip('/')}/api/v1/check-key"
    nonce = hashlib.sha256(f"{time.time()}:{key}:{machine_id}".encode()).hexdigest()[:16]
    timestamp = int(time.time() * 1000)

    payload = json.dumps({
        "key": key.strip(),
        "hwid": machine_id.strip(),
        "nonce": nonce,
        "timestamp": timestamp
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "TBAO-Protected-Client/2.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data.get("valid") is True, res_data
    except urllib.error.HTTPError as e:
        try:
            err_data = json.loads(e.read().decode("utf-8"))
            return False, err_data
        except Exception:
            return False, {"reason": f"HTTP_{e.code}"}
    except Exception as ex:
        return False, {"reason": "SERVER_UNREACHABLE", "message": str(ex)}

def __enforce_license():
    """Hàm bảo vệ bắt buộc - Kiểm tra và dừng ngay nếu không có bản quyền hợp lệ"""
    machine_id = __get_machine_id()

    # 1. Kiểm tra cache key đã lưu
    saved_key = ""
    if os.path.exists(__LICENSE_CACHE_FILE__):
        try:
            with open(__LICENSE_CACHE_FILE__, "r", encoding="utf-8") as f:
                saved_key = f.read().strip()
        except Exception:
            saved_key = ""

    if saved_key:
        valid, info = __verify_key_online(saved_key, machine_id)
        if valid:
            __render_banner(machine_id, "License: VALID | Machine: VERIFIED", is_valid=True)
            exp = info.get("expires_at")
            exp_str = f"Hết hạn: {exp}" if exp else "Bản quyền: Vĩnh viễn ∞"
            print(f"  {GREEN}[✓] Kích hoạt bản quyền thành công! ({exp_str}){RESET}")
            print(f"  {DIM}[*] Khởi chạy chương trình chính...{RESET}\n")
            time.sleep(0.5)
            return

    # 2. Nếu chưa kích hoạt hoặc key cũ hết hạn -> Hỏi người dùng nhập key
    while True:
        __render_banner(machine_id, "Waiting for license key...")
        try:
            user_key = input(f"\n  {CYAN}Enter License Key: > {RESET}").strip()
        except (KeyboardInterrupt, EOFError):
            print(f"\n  {RED}[!] Đã hủy thao tác. Thoát chương trình.{RESET}")
            sys.exit(0)

        if not user_key or user_key.lower() == "exit":
            print(f"  {RED}[!] Đã thoát.{RESET}")
            sys.exit(0)

        print(f"  {DIM}[*] Đang xác thực với máy chủ...{RESET}")
        valid, info = __verify_key_online(user_key, machine_id)

        if valid:
            try:
                with open(__LICENSE_CACHE_FILE__, "w", encoding="utf-8") as f:
                    f.write(user_key)
            except Exception:
                pass

            __render_banner(machine_id, "License: VALID | Machine: VERIFIED", is_valid=True)
            exp = info.get("expires_at")
            exp_str = f"Hết hạn: {exp}" if exp else "Bản quyền: Vĩnh viễn ∞"
            print(f"  {GREEN}[✓] Kích hoạt bản quyền thành công! ({exp_str}){RESET}")
            print(f"  {DIM}[*] Đang khởi chạy ứng dụng...{RESET}\n")
            time.sleep(0.6)
            return
        else:
            reason = info.get("reason", "UNKNOWN_ERROR")
            msg = info.get("message", "")
            err_desc = {
                "KEY_NOT_FOUND": "Mã key không tồn tại trên hệ thống!",
                "DEVICE_LIMIT_REACHED": "Key này đã đạt giới hạn số máy sử dụng!",
                "KEY_EXPIRED": "Key đã hết hạn sử dụng! Vui lòng liên hệ Admin gia hạn.",
                "KEY_BANNED": "Key này đã bị khóa do vi phạm!",
                "SERVER_UNREACHABLE": "Không thể kết nối tới máy chủ cấp bản quyền!"
            }.get(reason, f"Mã lỗi: {reason} {msg}")

            print(f"\n  {RED}[✗] TỪ CHỐI TRUY CẬP: {err_desc}{RESET}")
            try:
                input(f"\n  {DIM}Nhấn Enter để thử lại hoặc Ctrl+C để thoát...{RESET}")
            except (KeyboardInterrupt, EOFError):
                sys.exit(1)

# Thực thi kiểm tra ngay khi nạp file
__enforce_license()

# =============================================================================
#   MÃ NGUỒN CHÍNH CỦA BẠN (ORIGINAL CODE PRESERVED BELOW)
# =============================================================================


# Tool ban quyen goc cua khach hang
import time

def run_app():
    print('===> [CHUONG TRINH CHINH DANG CHAY]: CHÚC BẠN SỮ DỤNG TOOL VUI VẺ!')

if __name__ == '__main__':
    run_app()
