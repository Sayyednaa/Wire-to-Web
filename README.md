# WireToWeb - Cloud Printing for Legacy & Non-Wi-Fi Printers

WireToWeb is a secure, self-hosted cloud printing middleware platform that bridges physical, local-only (USB, parallel, or non-Wi-Fi) desktop printers to the web. It enables users to submit files and design custom page layouts from anywhere in the world and have them print silently on their local hardware without complex network configurations, VPNs, or port forwarding.

---

## 🌐 Live Demo
Check out the live demo hosted on PythonAnywhere:
👉 **[https://wiretoweb.pythonanywhere.com/](https://wiretoweb.pythonanywhere.com/)**

---

## 💡 The Problem

Most legacy and office printers lack wireless interfaces, native web APIs, or cloud capabilities. Connecting them to the internet to support remote print requests (e.g., printing order receipts from an e-commerce backend, or printing shipping labels from a remote warehouse) traditionally requires:
- Exposing local networks to the public internet (port forwarding/DMZ).
- Setting up static IP addresses or Dynamic DNS (DDNS).
- Configuring complex VPN tunnels or expensive proprietary enterprise print servers.
- Manually compiling document drafts on the target computer before printing.

---

## 🚀 The Solution: WireToWeb

WireToWeb solves this by splitting the printing pipeline into a secure, public-facing web hub and an outbound-only polling desktop agent.

```
┌─────────────────────────────────┐
│     Any Device Worldwide        │
│  (Laptop, Tablet, Mobile, Web)   │
└────────────────┬────────────────┘
                 │
                 │ 1. Uploads PDF or designs on A4 Canvas
                 ▼
┌─────────────────────────────────┐
│     WireToWeb Web Server        │
│  (Centralized Django Queue Hub) │
└────────────────┬────────────────┘
                 ▲
                 │ 2. Outbound HTTP short-polling (Secure Queue)
                 │    No incoming ports open on local router!
┌────────────────┴────────────────┐
│      Windows Desktop Agent       │
│  (Local daemon running win32)   │
└────────────────┬────────────────┘
                 │
                 │ 3. Silent native print command (USB / spooler)
                 ▼
┌─────────────────────────────────┐
│     Legacy / Non-Wi-Fi Printer  │
│  (HP LaserJet, USB Thermal, etc)│
└─────────────────────────────────┘
```

1. **Clay-Inspired Web Workspace**: A centralized hub where users register profiles, manage active printers, configure print jobs (copies, duplex, orientation, quality), upload files, and compose documents inside an interactive A4 Page Editor.
2. **Outbound Polling Desktop Agent**: A lightweight background daemon that runs on the Windows computer connected to the physical printer. It discovers local spoolers, registers them on the hub, and securely polls the server queue for print jobs using outbound-only HTTP/HTTPS requests.
3. **Silent Hardware Execution**: The agent pulls down the document PDF payload and prints it silently using local Windows print drivers (assisted by robust helpers like `PDFtoPrinter.exe`).

---

## 🎨 Interactive A4 Page Editor

The front-end includes a complete **A4 Canvas Designer** for building custom pages (shipping labels, receipts, collage, or photo layout cards) directly inside the browser:
- **Dynamic Elements**: Drag, drop, scale, and layer text boxes and image uploads.
- **Layer Reordering**: Move elements forward or backward step-by-step using DOM-swapping.
- **Freeform Image Cropping**: Crop images to any rectangular frame using a custom resizable crop box overlay and crop handles.
- **WYSIWYG Compiles**: Compiles layout views client-side using `html2canvas` and `jsPDF` into multi-page print-ready PDFs.

---

## 🔒 Security & Privacy

- **Outbound-Only Connection**: The desktop agent communicates exclusively via outbound HTTP/HTTPS requests. The local network's router configuration remains locked—no port forwarding, VPN configuration, or static IPs are required.
- **Data Protection (Zero-Retain)**: To protect personal and corporate document privacy, PDF payloads are automatically purged from the server immediately after successful delivery to the printer spooler. Cancelled or failed print jobs are auto-deleted after 24 hours.

---

## 🛠️ Repository Architecture

- `server/`: Central Django web application. Contains models (`Printer`, `Document`, `PrintJob`), forms, styling (`style.css`), AJAX polling views, and canvas scripts (`canvas.js`).
- `agent/`: Local Windows daemon (`agent.py`) using `win32print` queues and background polling workers.

---

## ☁️ Server Deployment Guide (Hosting on PythonAnywhere)

PythonAnywhere is a great platform for hosting Django apps. Follow these steps to host your WireToWeb web server:

### 1. Upload Code & Create Virtual Environment
1. Log in to your [PythonAnywhere](https://www.pythonanywhere.com/) dashboard.
2. Open a new **Bash Console**.
3. Clone your repository into your PythonAnywhere space:
   ```bash
   git clone https://github.com/your-username/Remote-Printer.git
   ```
4. Create a virtual environment using Python 3.10 (or higher):
   ```bash
   mkvirtualenv --python=python3.10 env-wiretoweb
   ```
5. Install the server dependencies:
   ```bash
   cd Remote-Printer/server
   pip install -r requirements.txt
   ```

### 2. Configure Django settings
1. Open the file editor on PythonAnywhere and open `/home/<your-username>/Remote-Printer/server/server/settings.py`.
2. Modify `ALLOWED_HOSTS` to include your PythonAnywhere hostname:
   ```python
   ALLOWED_HOSTS = ['<your-username>.pythonanywhere.com']
   ```
3. Set `DEBUG = False` (for security in production).
4. Run migrations and compile static assets inside your active Bash console:
   ```bash
   python manage.py migrate
   python manage.py collectstatic
   python manage.py createsuperuser
   ```

### 3. Create the PythonAnywhere Web App
1. Go to the **Web** tab on the PythonAnywhere dashboard.
2. Click **Add a new web app**.
3. Select **Manual Configuration** (Do NOT choose "Django" here—choosing manual configuration gives you absolute control over virtual environment paths).
4. Select **Python 3.10** (matching your virtual environment).
5. Once created, configure the paths on the Web tab:
   - **Source code**: `/home/<your-username>/Remote-Printer/server`
   - **Working directory**: `/home/<your-username>/Remote-Printer/server`
   - **Virtualenv**: `/home/<your-username>/.virtualenvs/env-wiretoweb`

### 4. Setup WSGI Configuration
1. Under the **Web** tab, click the link to edit the **WSGI configuration file** (located at `/var/www/<your-username>_pythonanywhere_com_wsgi.py`).
2. Replace the entire content of the file with the following clean Django WSGI loader script:
   ```python
   import os
   import sys

   # Add your project directory to the sys.path
   path = '/home/<your-username>/Remote-Printer/server'
   if path not in sys.path:
       sys.path.insert(0, path)

   # Set environment variables
   os.environ['DJANGO_SETTINGS_MODULE'] = 'server.settings'

   # Load the application
   from django.core.wsgi import get_wsgi_application
   application = get_wsgi_application()
   ```

### 5. Setup Static and Media Mappings (Crucial)
To ensure styles, images, and documents load correctly, define the directory mappings in the **Static files** section of the **Web** tab:

| URL | Directory Path |
| :--- | :--- |
| `/static/` | `/home/<your-username>/Remote-Printer/server/staticfiles/` |
| `/media/` | `/home/<your-username>/Remote-Printer/server/media/` |

### 6. Reload Web App
1. Go to the top of the **Web** tab.
2. Click the green **Reload** button.
3. Visit `https://<your-username>.pythonanywhere.com/` in your browser. Your live WireToWeb landing page should render beautifully with the paper-fluttering animations!

---

## 🔌 Windows Desktop Agent Configuration Guide

Follow these steps to run the background agent on the Windows computer connected to the physical printers:

### 1. Prerequisites
- **Operating System**: Windows (required for Win32 Spooler APIs).
- **Python**: Installed Python 3.10+ (Add Python to your Windows System PATH during installation).
- **Physical Printer**: Connected via USB, parallel, or visible as a local driver in your Windows "Printers & Scanners" control panel.

### 2. Installation
1. Download or transfer the `agent/` folder to the target Windows machine.
2. Open **Command Prompt (cmd)** or **PowerShell** and navigate to the agent directory:
   ```cmd
   cd path/to/agent
   ```
3. Install library dependencies using pip:
   ```cmd
   pip install -r requirements.txt
   ```
   *Note: This installs `pywin32` to allow Python to interface directly with Windows printing queues, along with `requests` for polling the Django API.*

### 3. Execution
1. Start the agent daemon script:
   ```cmd
   python agent.py
   ```
2. **Initial Setup prompts** (triggered on the first run):
   - **Server URL**: Type your web hub URL (e.g. `https://<your-username>.pythonanywhere.com` or `http://127.0.0.1:8000` if running locally) and press Enter.
   - **Username/Email**: Type the login credential of your registered account.
   - **Password**: Enter your password securely.
3. **Automatic Configuration**:
   - The agent authenticates, saves a secure bearer authentication token inside `config.json`, and generates a unique Hardware UUID.
   - It reads your active local drivers, registers them as printers on the cloud hub, and begins a quiet heartbeat/polling loop.

### 4. Background Services (Optional)
To run the agent automatically in the background on startup, you can add a shortcut to the python execution command inside your Windows Startup folder:
1. Press `Win + R`, type `shell:startup`, and press Enter.
2. Create a batch script file (e.g. `start_agent.bat`) inside that folder containing:
   ```cmd
   @echo off
   cd /d "C:\path\to\agent"
   start /min python agent.py
   ```

---

## 📖 End-to-End Usage Walkthrough

1. **Sign Up**: Register an account on the WireToWeb web server.
2. **Run Agent**: Start the agent on your Windows computer. It registers all local printer spoolers automatically.
3. **Verify Printers**: Refresh your web dashboard—you will see your Windows printers listed as **ONLINE** in the active printer grid.
4. **Create a Print Job**:
   - **Upload Option**: Select a printer, upload a PDF file, specify layout copies, and press **Print**.
   - **Canvas Option**: Click **Canvas Designer**, build custom cards or layout texts, click **Compile & Print**, select your destination printer, and submit.
5. **Print Spooling**:
   - The job is queued in `PENDING` state on the server.
   - Within seconds, the local Windows agent pulls the job, marks it `PROCESSING`, downloads the temporary PDF file, and pipes it silently to the printer driver.
   - Once printed, the spooler deletes local temporary files, marks the job `COMPLETED` on the server, and the server immediately purges the PDF payload.
