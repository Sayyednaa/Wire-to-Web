import os
import sys
import uuid
import shutil
import getpass
import requests
import winreg
import subprocess
import socket

try:
    import win32print
except ImportError:
    print("Error: 'pywin32' library is required to run the installer on Windows.")
    sys.exit(1)

def get_local_printers():
    try:
        printers_info = win32print.EnumPrinters(
            win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        )
        return [info[2] for info in printers_info]
    except Exception as e:
        print(f"[-] Error enumerating local printers: {e}")
        return []

def set_autostart(app_name, exe_path):
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0,
            winreg.KEY_SET_VALUE
        )
        winreg.SetValueEx(key, app_name, 0, winreg.REG_SZ, f'"{exe_path}"')
        winreg.CloseKey(key)
        return True
    except Exception as e:
        print(f"[-] Error setting autostart registry key: {e}")
        return False

def main():
    print("==================================================")
    print("      WireToWeb Windows Agent Installer Setup     ")
    print("==================================================")
    print()

    # Default server URL
    default_server = "https://wiretoweb.pythonanywhere.com"
    server_url = input(f"Enter Server URL [{default_server}]: ").strip()
    if not server_url:
        server_url = default_server
    server_url = server_url.rstrip('/')

    authenticated = False
    user_token = ""
    
    while not authenticated:
        username = input("Username or Email: ").strip()
        password = getpass.getpass("Password: ")
        
        if not username or not password:
            print("[-] Username and password are required.")
            continue
            
        print("[*] Authenticating with server...")
        try:
            response = requests.post(
                f"{server_url}/api/agent/login/",
                json={"username": username, "password": password},
                timeout=10
            )
            if response.status_code == 200:
                user_token = response.json().get("token")
                print("[+] Authentication successful!")
                authenticated = True
            else:
                err_msg = response.json().get("error", "Unknown error")
                print(f"[-] Authentication failed: {err_msg}")
        except Exception as e:
            print(f"[-] Connection failed: {e}")
            retry = input("Would you like to try again? (y/n): ").strip().lower()
            if retry != 'y':
                sys.exit(1)

    # Gather local printers and register them
    local_printers = get_local_printers()
    if not local_printers:
        print("[-] No local printers detected. Installation aborted.")
        sys.exit(1)

    device_uuid = str(uuid.uuid4())
    computer_name = socket.gethostname()
    windows_username = getpass.getuser()

    print(f"[*] Registering {len(local_printers)} printers...")
    headers = {"Authorization": f"Bearer {user_token}"}
    payload = {
        "device_uuid": device_uuid,
        "computer_name": computer_name,
        "windows_username": windows_username,
        "printers": local_printers
    }

    registered_printers = {}
    try:
        response = requests.post(
            f"{server_url}/api/agent/printers/register/",
            json=payload,
            headers=headers,
            timeout=10
        )
        if response.status_code == 200:
            registered_data = response.json().get("printers", [])
            for p in registered_data:
                registered_printers[p["name"]] = p["token"]
            print("[+] Printers successfully registered on server.")
        else:
            print(f"[-] Printer registration failed: {response.text}")
            sys.exit(1)
    except Exception as e:
        print(f"[-] Printer registration connection error: {e}")
        sys.exit(1)

    # Target Directory setup
    install_dir = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'WireToWeb')
    print(f"[*] Creating installation directory at {install_dir}...")
    os.makedirs(install_dir, exist_ok=True)

    # Write config.json in the target directory
    config_path = os.path.join(install_dir, "config.json")
    import json
    try:
        with open(config_path, 'w') as f:
            json.dump({
                "server_url": server_url,
                "user_token": user_token,
                "device_uuid": device_uuid,
                "printers": registered_printers
            }, f, indent=4)
        print("[+] Wrote config.json configuration.")
    except Exception as e:
        print(f"[-] Error writing config.json: {e}")
        sys.exit(1)

    # Determine where the bundled agent.exe and PDFtoPrinter.exe are located
    if getattr(sys, 'frozen', False):
        base_dir = sys._MEIPASS
    else:
        # If running from raw source script, check dist/ first then current folder
        base_dir = os.path.dirname(os.path.abspath(__file__))
        if os.path.exists(os.path.join(base_dir, "dist", "agent.exe")):
            base_dir = os.path.join(base_dir, "dist")

    # Copy executables
    files_to_copy = ["agent.exe", "PDFtoPrinter.exe"]
    for file in files_to_copy:
        src = os.path.join(base_dir, file)
        # If running in development and we are in python, it might be in dist/ for agent.exe and root for PDFtoPrinter.exe
        if not getattr(sys, 'frozen', False) and file == "PDFtoPrinter.exe":
            src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "PDFtoPrinter.exe")
            
        dst = os.path.join(install_dir, file)
        try:
            shutil.copy2(src, dst)
            print(f"[+] Installed {file} to destination folder.")
        except Exception as e:
            print(f"[-] Error copying {file}: {e}")
            sys.exit(1)

    # Autostart Registry entry
    exe_path = os.path.join(install_dir, "agent.exe")
    print("[*] Configuring registry autostart on Windows boot...")
    if set_autostart("WireToWebAgent", exe_path):
        print("[+] Registry key configured successfully.")
    else:
        print("[-] Warning: Failed to set autostart registry key.")

    # Start the agent process in background
    print("[*] Starting the windowless background agent immediately...")
    try:
        # Start in windowless background process mode
        subprocess.Popen(
            [exe_path],
            cwd=install_dir,
            creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS
        )
        print("[+] Background agent successfully started.")
    except Exception as e:
        print(f"[-] Error starting background agent: {e}")

    print()
    print("==================================================")
    print("      WireToWeb Agent successfully installed!     ")
    print("==================================================")
    print()
    input("Press Enter to close installer...")

if __name__ == "__main__":
    main()
