import tkinter as tk
import os
from datetime import datetime

# Ensure logs directory exists
LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "test.log")

def write_log(message):
    """Append a message to the test log file with a timestamp."""
    with open(LOG_FILE, "a") as f:
        f.write(f"{datetime.now().isoformat()} - {message}\n")

# Minimal Tkinter GUI with auto-close and live feedback
root = tk.Tk()
root.title("Drone-Ingestor Test GUI v2")
root.geometry("400x250")

label = tk.Label(root, text="✅ VS Code Explorer is working!", font=("Arial", 12))
label.pack(pady=20)

status_label = tk.Label(root, text="GUI launched.", font=("Arial", 10), fg="blue")
status_label.pack(pady=10)

def on_close():
    write_log("GUI closed by user.")
    status_label.config(text="Closed by user.")
    root.after(1000, root.destroy)  # short delay so message is visible

def auto_close():
    write_log("GUI auto-closed after timeout.")
    status_label.config(text="Auto-closing after 5 seconds...")
    root.after(1000, root.destroy)

button = tk.Button(root, text="Close", command=on_close)
button.pack(pady=10)

write_log("GUI launched successfully.")
status_label.config(text="Auto-closing in 5 seconds...")

# Auto close after 5 seconds (5000 ms)
root.after(5000, auto_close)

root.mainloop()
