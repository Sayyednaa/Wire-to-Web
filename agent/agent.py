import os
import sys
import time
import json
import uuid
import socket
import getpass
import requests
import threading
import tempfile
import traceback

# Import win32 libraries
try:
    import win32api
    import win32print
except ImportError:
    print("Error: 'pywin32' library is required to run the agent on Windows.")
    print("Please install it using: pip install pywin32")
    sys.exit(1)

CONFIG_FILE = "config.json"

class CloudPrintAgent:
    def __init__(self):
        self.server_url = "http://127.0.0.1:8000"
        self.user_token = ""
        self.device_uuid = ""
        self.printers = {}  # name -> printer_token
        self.printer_locks = {}  # name -> Lock
        self.running = True
        self.computer_name = socket.gethostname()
        self.windows_username = getpass.getuser()

    def load_config(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r') as f:
                    config = json.load(f)
                    self.server_url = config.get("server_url", self.server_url)
                    self.user_token = config.get("user_token", "")
                    self.device_uuid = config.get("device_uuid", "")
                    self.printers = config.get("printers", {})
                return True
            except Exception as e:
                print(f"[-] Error loading configuration: {e}")
        return False

    def save_config(self):
        try:
            with open(CONFIG_FILE, 'w') as f:
                json.dump({
                    "server_url": self.server_url,
                    "user_token": self.user_token,
                    "device_uuid": self.device_uuid,
                    "printers": self.printers
                }, f, indent=4)
        except Exception as e:
            print(f"[-] Error saving configuration: {e}")

    def prompt_setup(self):
        print("=== CloudPrintHub Windows Agent Setup ===")
        server_input = input(f"Enter Server URL [{self.server_url}]: ").strip()
        if server_input:
            self.server_url = server_input.rstrip('/')

        # Generate UUID for this device if not present
        if not self.device_uuid:
            self.device_uuid = str(uuid.uuid4())

        authenticated = False
        while not authenticated:
            username = input("Username or Email: ").strip()
            password = getpass.getpass("Password: ")

            if not username or not password:
                print("[-] Username and password are required.")
                continue

            print("[*] Authenticating with server...")
            try:
                response = requests.post(
                    f"{self.server_url}/api/agent/login/",
                    json={"username": username, "password": password},
                    timeout=10
                )
                if response.status_code == 200:
                    self.user_token = response.json().get("token")
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

        self.save_config()

    def get_local_printers(self):
        """
        Enumerate local and connection printers on Windows.
        """
        try:
            # Enum local and network printers
            printers_info = win32print.EnumPrinters(
                win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
            )
            printer_names = [info[2] for info in printers_info]
            return printer_names
        except Exception as e:
            print(f"[-] Error enumerating printers: {e}")
            return []

    def register_printers(self):
        local_printers = self.get_local_printers()
        if not local_printers:
            print("[-] No local printers detected. Cannot register.")
            return False

        print(f"[*] Registering {len(local_printers)} printers to backend...")
        headers = {"Authorization": f"Bearer {self.user_token}"}
        payload = {
            "device_uuid": self.device_uuid,
            "computer_name": self.computer_name,
            "windows_username": self.windows_username,
            "printers": local_printers
        }

        try:
            response = requests.post(
                f"{self.server_url}/api/agent/printers/register/",
                json=payload,
                headers=headers,
                timeout=10
            )
            if response.status_code == 200:
                registered_data = response.json().get("printers", [])
                # Reset printers dictionary
                self.printers = {}
                for p in registered_data:
                    self.printers[p["name"]] = p["token"]
                self.save_config()
                print("[+] Printers successfully registered and tokens saved.")
                return True
            else:
                print(f"[-] Printer registration failed: {response.text}")
                return False
        except Exception as e:
            print(f"[-] Printer registration connection error: {e}")
            return False

    def send_heartbeat(self, printer_name, token, status='ONLINE'):
        headers = {"Authorization": f"Bearer {token}"}
        payload = {
            "status": status,
            "computer_name": self.computer_name,
            "windows_username": self.windows_username
        }
        try:
            response = requests.post(
                f"{self.server_url}/api/agent/heartbeat/",
                json=payload,
                headers=headers,
                timeout=10
            )
            return response.status_code == 200
        except Exception:
            # Silent failure for heartbeats during run
            return False

    def update_job_status(self, token, job_id, status, error_message=None):
        headers = {"Authorization": f"Bearer {token}"}
        payload = {"status": status}
        if error_message:
            payload["error_message"] = error_message
        try:
            response = requests.post(
                f"{self.server_url}/api/agent/job/{job_id}/status/",
                json=payload,
                headers=headers,
                timeout=10
            )
            return response.status_code == 200
        except Exception as e:
            print(f"[-] Error updating status for job #{job_id}: {e}")
            return False

    def download_file(self, token, job_id):
        headers = {"Authorization": f"Bearer {token}"}
        try:
            response = requests.get(
                f"{self.server_url}/api/agent/job/{job_id}/download/",
                headers=headers,
                stream=True,
                timeout=30
            )
            if response.status_code == 200:
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        temp_file.write(chunk)
                temp_file.close()
                return temp_file.name
            else:
                print(f"[-] Failed to download job #{job_id}: HTTP {response.status_code}")
                return None
        except Exception as e:
            print(f"[-] Exception downloading job #{job_id}: {e}")
            return None

    def print_file(self, printer_name, file_path):
        """
        Natively print PDF file on Windows using ShellExecute.
        Falls back to Microsoft Edge headless print command if ShellExecute fails.
        """
        # Save current default printer to restore later
        try:
            orig_default = win32print.GetDefaultPrinter()
        except Exception:
            orig_default = None

        print(f"[*] Setting default printer to: {printer_name}")
        try:
            win32print.SetDefaultPrinter(printer_name)
        except Exception as e:
            print(f"[-] Warning: Failed to set default printer via win32print: {e}")

        success = False
        shell_error = None

        # Method 1: Try ShellExecute print verb
        try:
            print(f"[*] Triggering Windows print verb for file: {file_path}")
            # ShellExecute runs asynchronously
            win32api.ShellExecute(0, "print", file_path, None, ".", 0)
            time.sleep(3) # Give spooler time
            success = True
            print("[+] ShellExecute command sent successfully.")
        except Exception as e:
            shell_error = e
            print(f"[-] ShellExecute print verb failed: {e}. Trying fallback methods...")

        # Method 2: Fallback to Microsoft Edge (fully native on Win 10/11)
        if not success:
            import subprocess
            local_appdata = os.environ.get('LOCALAPPDATA', '')
            edge_paths = [
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            ]
            if local_appdata:
                edge_paths.append(os.path.join(local_appdata, r"Microsoft\Edge\Application\msedge.exe"))
            
            edge_bin = None
            for p in edge_paths:
                if os.path.exists(p):
                    edge_bin = p
                    break
            
            if edge_bin:
                try:
                    print(f"[*] Found Microsoft Edge at: {edge_bin}")
                    print(f"[*] Printing silently using Microsoft Edge headless command...")
                    # Command format: msedge --headless --disable-gpu --print-to-destination="Printer Name" "file.pdf"
                    cmd = [
                        edge_bin,
                        "--headless",
                        "--disable-gpu",
                        f"--print-to-destination={printer_name}",
                        file_path
                    ]
                    # Run silently in background
                    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    success = True
                    print("[+] Edge print command completed successfully.")
                except Exception as edge_err:
                    print(f"[-] Fallback to Edge print failed: {edge_err}")
            else:
                print("[-] Microsoft Edge executable not found at standard paths.")

        # Restore original default printer if it existed
        if orig_default:
            try:
                win32print.SetDefaultPrinter(orig_default)
            except Exception:
                pass

        if not success:
            raise shell_error if shell_error else Exception("All print methods failed.")
        return True

    def process_jobs_for_printer(self, printer_name, token):
        lock = self.printer_locks.setdefault(printer_name, threading.Lock())
        if not lock.acquire(blocking=False):
            # Already processing a job on this printer
            return

        try:
            headers = {"Authorization": f"Bearer {token}"}
            # Fetch jobs
            response = requests.get(
                f"{self.server_url}/api/agent/jobs/",
                headers=headers,
                timeout=10
            )
            if response.status_code != 200:
                return

            jobs = response.json().get("jobs", [])
            for job in jobs:
                job_id = job["id"]
                filename = job["filename"]
                print(f"[*] Processing job #{job_id} ({filename}) for printer '{printer_name}'")
                
                # 1. Update status to DOWNLOADED
                self.update_job_status(token, job_id, "DOWNLOADED")
                self.send_heartbeat(printer_name, token, status="BUSY")

                # 2. Download file
                temp_path = self.download_file(token, job_id)
                if not temp_path:
                    self.update_job_status(token, job_id, "FAILED", "Failed to download document from server.")
                    self.send_heartbeat(printer_name, token, status="ONLINE")
                    continue

                # 3. Update status to PRINTING
                self.update_job_status(token, job_id, "PRINTING")

                # 4. Print
                try:
                    self.print_file(printer_name, temp_path)
                    print(f"[+] Successfully printed job #{job_id} on '{printer_name}'")
                    self.update_job_status(token, job_id, "COMPLETED")
                except Exception as e:
                    error_trace = traceback.format_exc()
                    print(f"[-] Print failed for job #{job_id}: {e}")
                    self.update_job_status(token, job_id, "FAILED", f"Windows Printing error: {str(e)}")
                finally:
                    # Clean up temp file
                    try:
                        if os.path.exists(temp_path):
                            os.remove(temp_path)
                    except Exception:
                        pass
                    
                    self.send_heartbeat(printer_name, token, status="ONLINE")
        
        except Exception as e:
            print(f"[-] Error processing queue for '{printer_name}': {e}")
        finally:
            lock.release()

    def printer_loop(self, printer_name, token):
        print(f"[+] Starting worker loop for printer: {printer_name}")
        last_heartbeat = 0
        while self.running:
            now = time.time()
            # Send heartbeat every 60 seconds
            if now - last_heartbeat > 60:
                self.send_heartbeat(printer_name, token, status="ONLINE")
                last_heartbeat = now

            # Poll jobs every 5 seconds
            self.process_jobs_for_printer(printer_name, token)
            time.sleep(5)

    def start(self):
        # 1. Load config or prompt login setup
        if not self.load_config() or not self.user_token:
            self.prompt_setup()

        # 2. Register printers
        while not self.register_printers():
            print("[-] Unable to register printers. Retrying in 10 seconds...")
            time.sleep(10)

        # 3. Start worker thread for each printer
        threads = []
        for name, token in self.printers.items():
            t = threading.Thread(target=self.printer_loop, args=(name, token), daemon=True)
            t.start()
            threads.append(t)

        print("[+] CloudPrintHub Agent fully started. Polling print queues... Press Ctrl+C to stop.")
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n[*] Stopping agent...")
            self.running = False

if __name__ == "__main__":
    agent = CloudPrintAgent()
    agent.start()
