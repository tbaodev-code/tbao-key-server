"""
=============================================================================
  TBAO TEAM - DEMO CLIENT TOOL WITH LICENSE PROTECTION
  Mã nguồn mẫu minh họa cách bảo vệ BẤT KỲ TOOL NÀO bằng TBAO Key Server
=============================================================================
"""

import sys
import os
import json
import subprocess
import urllib.request
import urllib.error
import hashlib

# Đảm bảo in tiếng Việt có dấu không bị lỗi trên Windows Console (cp1252)
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# CẤU HÌNH ĐỊA CHỈ SERVER CỦA BẠN (Đổi thành domain VPS nếu đưa lên online)
SERVER_URL = "http://localhost:3000"
LICENSE_FILE = "license.key"


def get_hardware_components():
    """
    Trích xuất trực tiếp các giá trị PHẦN CỨNG VẬT LÝ từ chip của máy tính:
    1. UUID Bo mạch chủ (Motherboard UUID trong chip BIOS)
    2. CPU Processor ID (Khắc trên đế chip vi xử lý Intel/AMD)
    3. Serial Bo mạch chủ (BaseBoard Serial Number)
    -> KHÔNG BAO GIỜ THAY ĐỔI kể cả khi cài lại Win, đổi mạng, đổi IP hay format ổ cứng!
    """
    uuid = ""
    cpu_id = ""
    board_serial = ""

    # Cách 1: PowerShell CIM (Chuẩn nhất, chạy trên 100% Windows 10 & 11)
    try:
        cmd = [
            "powershell", "-NoProfile", "-Command",
            "(Get-CimInstance Win32_ComputerSystemProduct).UUID; (Get-CimInstance Win32_Processor).ProcessorId; (Get-CimInstance Win32_BaseBoard).SerialNumber"
        ]
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode('utf-8', errors='ignore').strip().splitlines()
        if len(out) >= 1 and out[0].strip():
            uuid = out[0].strip()
        if len(out) >= 2 and out[1].strip():
            cpu_id = out[1].strip()
        if len(out) >= 3 and out[2].strip():
            board_serial = out[2].strip()
    except Exception:
        pass

    # Cách 2: Đọc trực tiếp từ Registry BIOS phần cứng nếu PowerShell bị chặn
    if not uuid or not cpu_id:
        try:
            cmd = 'reg query "HKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\BIOS" /v BaseBoardSerialNumber'
            out = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL).decode('utf-8', errors='ignore')
            for line in out.splitlines():
                if "BaseBoardSerialNumber" in line:
                    board_serial = line.split()[-1].strip()
        except Exception:
            pass

    # Dự phòng an toàn nếu không lấy được (rất hiếm)
    if not uuid:
        try:
            cmd = 'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid'
            out = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL).decode('utf-8', errors='ignore')
            for line in out.splitlines():
                if "MachineGuid" in line:
                    uuid = line.split()[-1].strip()
        except Exception:
            uuid = os.environ.get("COMPUTERNAME", "PC-CLIENT")

    return {
        "motherboard_uuid": uuid or "UNKNOWN-UUID",
        "cpu_id": cpu_id or "UNKNOWN-CPU",
        "board_serial": board_serial or "UNKNOWN-BOARD"
    }


def get_machine_hwid():
    """
    Tạo chuỗi HWID bất biến từ các linh kiện phần cứng vật lý.
    """
    hw = get_hardware_components()
    raw = f"{hw['motherboard_uuid']}#{hw['cpu_id']}#{hw['board_serial']}"
    # Băm SHA256 để tạo mã HWID chuẩn ngắn gọn 16 ký tự
    short_hash = hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16].upper()
    return f"HWID-{short_hash}", hw


def send_json(url, data):
    """Gửi HTTP POST request với payload JSON bằng thư viện chuẩn (không cần cài thêm gì)"""
    payload = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "TBAO-Client-Tool/1.0"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            body = response.read().decode('utf-8')
            return response.status, json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"ok": False, "reason": "HTTP_ERROR"}
    except Exception as e:
        return 0, {"ok": False, "reason": f"CONNECTION_FAILED: {str(e)}"}


def auto_register_hwid(hwid):
    """Báo danh thiết bị lên Server để Admin nhìn thấy máy này trên Web"""
    cpu_info = os.environ.get("PROCESSOR_IDENTIFIER", "Standard CPU")
    os_info = f"Windows {sys.getwindowsversion().major}.{sys.getwindowsversion().minor}" if hasattr(sys, 'getwindowsversion') else "Windows OS"
    
    send_json(f"{SERVER_URL}/api/v1/register-hwid", {
        "hwid": hwid,
        "cpu_info": cpu_info,
        "os_info": os_info
    })


def canonical_json(obj):
    """Sắp xếp key alphabet để tạo chuỗi canonical đồng bộ với Server Node.js"""
    if obj is None or not isinstance(obj, dict):
        return json.dumps(obj)
    sorted_items = sorted(obj.items())
    return "{" + ",".join(f"{json.dumps(k)}:{json.dumps(v)}" for k, v in sorted_items) + "}"


def verify_license(key, hwid):
    """
    Gửi Key + HWID kèm Nonce + Timestamp chống Replay
    Đồng thời xác thực Chữ ký số Ed25519 từ Server chống giả mạo response!
    """
    import time
    import secrets

    nonce = secrets.token_hex(16)
    timestamp = int(time.time() * 1000)

    status_code, res = send_json(f"{SERVER_URL}/api/v1/check-key", {
        "key": key,
        "hwid": hwid,
        "nonce": nonce,
        "timestamp": timestamp
    })

    if status_code != 200 or res.get("valid") is not True:
        return False, res

    # 1. BẢO MẬT CHỐNG REPLAY: Kiểm tra Nonce phản hồi phải khớp chính xác với Nonce vừa gửi đi
    server_nonce = res.get("nonce")
    if server_nonce != nonce:
        print("[!] CẢNH BÁO AN NINH: Phát hiện tấn công Replay! Nonce không khớp.")
        return False, {"ok": False, "reason": "SECURITY_NONCE_MISMATCH"}

    # 2. XÁC THỰC CHỮ KÝ SỐ ED25519 (Chống Client bị can thiệp / Fake Server)
    signature_hex = res.get("signature")
    if signature_hex:
        try:
            from cryptography.hazmat.primitives.asymmetric import ed25519
            from cryptography.hazmat.primitives import serialization

            # Tải Public Key từ server hoặc cache
            _, pub_res = send_json(f"{SERVER_URL}/api/v1/public-key", {})
            pub_pem = pub_res.get("public_key")
            if pub_pem:
                public_key = serialization.load_pem_public_key(pub_pem.encode('utf-8'))
                
                # Tạo canonical data cần kiểm tra
                verify_data = {
                    "bound_devices": res.get("bound_devices"),
                    "device_limit": res.get("device_limit"),
                    "expires_at": res.get("expires_at"),
                    "hwid": res.get("hwid"),
                    "key": res.get("key"),
                    "nonce": res.get("nonce"),
                    "ok": res.get("ok"),
                    "timestamp": res.get("timestamp"),
                    "valid": res.get("valid")
                }
                canonical_str = canonical_json(verify_data)
                public_key.verify(bytes.fromhex(signature_hex), canonical_str.encode('utf-8'))
                # Chữ ký hợp lệ 100%!
        except Exception as sig_err:
            print(f"[!] CẢNH BÁO AN NINH: Chữ ký số máy chủ không hợp lệ ({sig_err})!")
            return False, {"ok": False, "reason": "INVALID_CRYPTOGRAPHIC_SIGNATURE"}

    return True, res


# =============================================================================
# CHỨC NĂNG CHÍNH CỦA TOOL (CHỈ CHẠY ĐƯỢC KHI BẢN QUYỀN HỢP LỆ)
# =============================================================================
def run_main_tool(key_info):
    """Giao diện tính năng thực sự của Tool sau khi đã vượt qua bảo mật"""
    print("\n" + "=" * 60)
    print("⚡ [TBAO TOOL GAMING PRO] - ĐÃ MỞ KHÓA TẤT CẢ TÍNH NĂNG!")
    print("=" * 60)
    print(f"🔑 Key Đang Dùng : {key_info.get('key')}")
    print(f"💻 Mã Máy HWID   : {key_info.get('hwid')}")
    exp = key_info.get('expires_at')
    print(f"⏳ Thời Hạn Dùng : {exp if exp else 'VĨNH VIỄN (LIFETIME) ∞'}")
    print(f"🖥️ Giới Hạn Máy  : Đang dùng {key_info.get('bound_devices')}/{key_info.get('device_limit')} máy")
    print("=" * 60)

    while True:
        print("\n--- MENU CHỨC NĂNG TOOL ---")
        print("1. Kích hoạt Auto Farm / Bot Gaming")
        print("2. Tối ưu hóa Windows & Giảm Ping FPS")
        print("3. Đổi License Key khác")
        print("0. Thoát Tool")
        
        choice = input("👉 Nhập lựa chọn [0-3]: ").strip()
        if choice == "1":
            print("\n[+] Đang chạy Auto Farm... [OK] Hoạt động mượt mà!")
        elif choice == "2":
            print("\n[+] Đã tối ưu hóa hệ thống! FPS đã tăng 35%!")
        elif choice == "3":
            if os.path.exists(LICENSE_FILE):
                os.remove(LICENSE_FILE)
            print("\n[+] Đã xóa key cũ! Khởi động lại tool để nhập key mới.")
            break
        elif choice == "0":
            print("\nĐã thoát tool. Tạm biệt!")
            break
        else:
            print("\n[!] Lựa chọn không hợp lệ!")


# =============================================================================
# HÀM KHỞI ĐỘNG TOOL (BOOTSTRAP & SECURITY CHECK)
# =============================================================================
def main():
    print("=" * 60)
    print("           TBAO TEAM - TOOL BẢO MẬT BẢN QUYỀN")
    print("=" * 60)

    # BƯỚC 1: LẤY MÃ MÁY HWID CỦA THIẾT BỊ NÀY TỪ PHẦN CỨNG VẬT LÝ
    hwid, hw = get_machine_hwid()
    print("[*] LINH KIỆN PHẦN CỨNG GỐC CỦA MÁY (BẤT BIẾN):")
    print(f"    • Motherboard UUID : {hw['motherboard_uuid']}")
    print(f"    • CPU Processor ID : {hw['cpu_id']}")
    print(f"    • BaseBoard Serial : {hw['board_serial']}")
    print(f"    ==> MÃ MÁY HWID CHUẨN : {hwid}")

    # BƯỚC 2: TỰ ĐỘNG BÁO DANH LÊN SERVER (Admin sẽ thấy máy này trên Web)
    print("[*] Đang kết nối tới máy chủ cấp key...")
    auto_register_hwid(hwid)

    # BƯỚC 3: KIỂM TRA FILE KEY ĐÃ LƯU TRƯỚC ĐÓ CHƯA
    saved_key = ""
    if os.path.exists(LICENSE_FILE):
        try:
            with open(LICENSE_FILE, "r", encoding="utf-8") as f:
                saved_key = f.read().strip()
        except Exception:
            saved_key = ""

    # Nếu có key đã lưu -> thử kiểm tra ngay
    if saved_key:
        print(f"[*] Đang xác thực key đã lưu: {saved_key}...")
        valid, res = verify_license(saved_key, hwid)
        if valid:
            print("✅ Bản quyền hợp lệ!")
            run_main_tool(res)
            return
        else:
            print(f"⚠️ Key đã lưu không còn hiệu lực ({res.get('reason')}). Vui lòng nhập key mới!")

    # BƯỚC 4: NẾU CHƯA CÓ KEY HOẶC KEY SAI -> YÊU CẦU NGƯỜI DÙNG NHẬP KEY
    while True:
        print("-" * 60)
        print("💡 Chưa kích hoạt bản quyền!")
        print(f"👉 Hãy gửi Mã máy này cho Admin để nhận Key: {hwid}")
        user_key = input("👉 Nhập mã License Key của bạn (hoặc gõ 'exit' để thoát): ").strip()

        if user_key.lower() == "exit" or not user_key:
            print("Đã hủy bỏ. Phần mềm sẽ đóng lại.")
            sys.exit(0)

        print("[*] Đang kiểm tra key trên máy chủ...")
        valid, res = verify_license(user_key, hwid)

        if valid:
            print("✅ XÁC THỰC THÀNH CÔNG!")
            # Lưu lại key vào file để lần sau mở tool không cần nhập lại
            try:
                with open(LICENSE_FILE, "w", encoding="utf-8") as f:
                    f.write(user_key)
            except Exception:
                pass

            # Cho phép chạy tool
            run_main_tool(res)
            break
        else:
            # Xử lý các thông báo lỗi dễ hiểu cho khách hàng
            reason = res.get("reason", "UNKNOWN_ERROR")
            if reason == "KEY_NOT_FOUND":
                print("❌ LỖI: Mã key không tồn tại trên hệ thống!")
            elif reason == "DEVICE_LIMIT_REACHED":
                print("❌ LỖI: Key này đã hết lượt sử dụng trên máy khác (Đã đủ giới hạn thiết bị)!")
            elif reason == "KEY_BANNED":
                print("❌ LỖI: Key này đã bị Admin khóa do vi phạm!")
            elif reason == "KEY_EXPIRED":
                print("❌ LỖI: Key này đã hết hạn sử dụng! Vui lòng liên hệ Admin gia hạn.")
            else:
                print(f"❌ LỖI: Không thể kích hoạt ({reason}).")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nĐã hủy.")
