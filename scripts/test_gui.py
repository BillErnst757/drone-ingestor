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

# Minimal Tkinter GUI with auto-close
root = tk.Tk()
root.title("Drone-Ingestor Test GUI")
root.geometry("350x200")

label = tk.Label(root, text="✅ VS Code Explorer is working!", font=("Arial", 12))
label.pack(pady=20)

def on_close():
    write_log("GUI closed by user.")
    root.destroy()

button = tk.Button(root, text="Close", command=on_close)
button.pack(pady=10)

write_log("GUI launched successfully.")

# Auto close after 5 seconds (5000 ms)
root.after(5000, on_close)

root.mainloop()
