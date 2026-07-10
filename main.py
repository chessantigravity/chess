import threading
import http.server
import socketserver
import os
import subprocess
import time
import sys
import webbrowser

PORT = 8624 # A unique custom port to prevent collisions

class SilentHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress logging to keep the console output clean
        pass

def start_server(directory):
    # Bind to localhost specifically for safety
    class Handler(SilentHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=directory, **kwargs)
            
    # Try binding to the port, loop if port is busy
    global PORT
    while True:
        try:
            with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
                print(f"Server started on http://127.0.0.1:{PORT}")
                httpd.serve_forever()
        except OSError:
            PORT += 1 # increment port and try again

if __name__ == '__main__':
    # Determine the directory of the script
    app_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Start the local server thread as daemon
    server_thread = threading.Thread(target=start_server, args=(app_dir,), daemon=True)
    server_thread.start()
    
    # Wait briefly for server startup
    time.sleep(0.5)
    
    url = f"http://127.0.0.1:{PORT}"
    print(f"Launching Antigravity Chess client window at {url}...")
    
    # Paths to Microsoft Edge executable
    edge_paths = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    ]
    
    edge_exe = None
    for path in edge_paths:
        if os.path.exists(path):
            edge_exe = path
            break
            
    if edge_exe:
        # Edge App Mode creates a dedicated, borderless desktop window without URL bar or tab strips
        # It looks and operates exactly like an Electron application window.
        try:
            subprocess.run([edge_exe, f"--app={url}", "--window-size=1120,780"])
        except Exception as e:
            print("Edge App-Mode launch failed, falling back to standard browser...", e)
            webbrowser.open(url)
    else:
        # Fallback to standard default browser if Edge is not found
        webbrowser.open(url)
        # Keep python process alive while serving if opened in external browser
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("Shutting down Chess server.")
