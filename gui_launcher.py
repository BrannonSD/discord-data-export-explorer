#!/usr/bin/env python3
"""
Discord Data Export Explorer - v1.0.0 Standalone Desktop Application
"""
import os
import sys
import json
import re
import threading
import time
import urllib.parse
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
import tkinter as tk
from tkinter import filedialog, messagebox

# Global Data Cache
PACKAGE_DIR = ""
DATA_CACHE = {
    "account": {},
    "channels": [],
    "servers": {},
    "messages": {}, # channelId -> list of msg objects
    "is_indexed": False,
    "indexing_error": None
}

PORT = 3000
SERVER_INSTANCE = None
SERVER_THREAD = None

def get_resource_path(relative_path):
    """Get absolute path to resource, works for dev and for PyInstaller bundle"""
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)

def read_json_file(filepath):
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"[Error] Reading {filepath}: {e}")
    return None

def recover_deleted_user_ids(target_dir, deleted_dm_channel_ids, my_user_id):
    recovered_map = {} # channelId -> recipientUserId
    reporting_dir = os.path.join(target_dir, "Activity", "reporting")

    if not os.path.exists(reporting_dir) or not deleted_dm_channel_ids:
        return recovered_map

    files = [f for f in os.listdir(reporting_dir) if f.endswith(".json")]
    if not files:
        return recovered_map

    target_set = set(deleted_dm_channel_ids)

    for file in files:
        if not target_set:
            break
        file_path = os.path.join(reporting_dir, file)
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines_scanned = 0
                for line in f:
                    lines_scanned += 1
                    if lines_scanned > 200000 or not target_set:
                        break
                    for channel_id in list(target_set):
                        if channel_id in line:
                            try:
                                obj = json.loads(line)
                                r_ids = obj.get("_governance_meta", {}).get("reporting", {}).get("recipient_ids", [])
                                other_id = next((str(r) for r in r_ids if str(r) != str(my_user_id) and str(r) != "Deleted User"), None)
                                if other_id:
                                    recovered_map[channel_id] = other_id
                                    target_set.remove(channel_id)
                                    break
                            except Exception:
                                pass
        except Exception as e:
            print(f"[Recovery Error] {file}: {e}")

    return recovered_map

def index_package_data(target_dir):
    global PACKAGE_DIR, DATA_CACHE
    PACKAGE_DIR = os.path.abspath(target_dir)
    print(f"[Indexing] Reading Discord package from: {PACKAGE_DIR}")

    if not os.path.exists(PACKAGE_DIR):
        DATA_CACHE["is_indexed"] = False
        DATA_CACHE["indexing_error"] = "Specified directory does not exist."
        return False

    try:
        # 1. Account
        account_path = os.path.join(PACKAGE_DIR, "Account", "user.json")
        DATA_CACHE["account"] = read_json_file(account_path) or {}

        # 2. Servers Index
        servers_path = os.path.join(PACKAGE_DIR, "Servers", "index.json")
        DATA_CACHE["servers"] = read_json_file(servers_path) or {}

        # 3. Messages Index
        msg_index_path = os.path.join(PACKAGE_DIR, "Messages", "index.json")
        msg_index = read_json_file(msg_index_path) or {}

        # 4. Scan Messages Folder
        messages_dir = os.path.join(PACKAGE_DIR, "Messages")
        channels = []
        DATA_CACHE["messages"].clear()
        deleted_dm_channel_ids = []

        if os.path.exists(messages_dir):
            for entry in os.listdir(messages_dir):
                folder_path = os.path.join(messages_dir, entry)
                if os.path.isdir(folder_path):
                    channel_json_path = os.path.join(folder_path, "channel.json")
                    messages_json_path = os.path.join(folder_path, "messages.json")

                    channel_info = read_json_file(channel_json_path)
                    messages = read_json_file(messages_json_path) or []

                    if channel_info or messages:
                        channel_id = str(channel_info.get("id") if channel_info else entry.replace("c", ""))
                        indexed_desc = msg_index.get(channel_id, "")

                        ch_type = channel_info.get("type", "UNKNOWN") if channel_info else "UNKNOWN"
                        ch_name = channel_info.get("name", "") if channel_info else ""
                        if not ch_name:
                            ch_name = indexed_desc or f"Channel {channel_id}"

                        guild_info = channel_info.get("guild", {}) if channel_info else {}
                        guild_id = str(guild_info.get("id", ""))
                        guild_name = guild_info.get("name", "")

                        if guild_id and not guild_name and guild_id in DATA_CACHE["servers"]:
                            guild_name = DATA_CACHE["servers"][guild_id]

                        recipients = channel_info.get("recipients", []) if channel_info else []
                        recipient_id = None
                        recipient_handle = ""
                        is_deleted_user = False

                        my_user_id = str(DATA_CACHE["account"].get("id", ""))

                        if ch_type == "DM" or indexed_desc.startswith("Direct Message with"):
                            ch_type = "DM"
                            if recipients:
                                for r in recipients:
                                    if str(r) != my_user_id:
                                        recipient_id = str(r)
                                        break
                                if not recipient_id:
                                    recipient_id = str(recipients[0])

                            match = re.match(r"^Direct Message with (.+)$", indexed_desc)
                            if match:
                                recipient_handle = match.group(1)
                                if not ch_name or ch_name == f"Channel {channel_id}":
                                    ch_name = f"@{recipient_handle}"

                            if recipient_id == "Deleted User" or not recipient_id or "Unknown Participant" in recipient_handle:
                                is_deleted_user = True
                                deleted_dm_channel_ids.append(channel_id)

                        elif ch_type == "GROUP_DM" or indexed_desc.startswith("Group DM"):
                            ch_type = "GROUP_DM"

                        # Sort messages chronologically
                        messages.sort(key=lambda m: m.get("Timestamp", ""))
                        DATA_CACHE["messages"][channel_id] = messages

                        first_ts = messages[0].get("Timestamp") if messages else None
                        last_ts = messages[-1].get("Timestamp") if messages else None

                        channels.append({
                            "id": channel_id,
                            "folderName": entry,
                            "type": ch_type,
                            "name": ch_name,
                            "guildId": guild_id,
                            "guildName": guild_name,
                            "recipients": recipients,
                            "recipientId": recipient_id,
                            "recipientHandle": recipient_handle,
                            "isDeletedUser": is_deleted_user,
                            "isRecovered": False,
                            "indexedDesc": indexed_desc,
                            "messageCount": len(messages),
                            "firstMessageTimestamp": first_ts,
                            "lastMessageTimestamp": last_ts
                        })

        # 5. Run Telemetry Activity Log Recovery for Deleted Users
        if deleted_dm_channel_ids:
            print(f"[Recovery Engine] Scanning activity logs for {len(deleted_dm_channel_ids)} Deleted User DMs...")
            recovered_map = recover_deleted_user_ids(PACKAGE_DIR, deleted_dm_channel_ids, DATA_CACHE["account"].get("id", ""))

            for ch in channels:
                if ch["isDeletedUser"] and ch["id"] in recovered_map:
                    ch["recipientId"] = recovered_map[ch["id"]]
                    ch["isRecovered"] = True
                    print(f"[Recovered User ID] DM {ch['id']} -> {ch['recipientId']}")

        channels.sort(key=lambda c: c["lastMessageTimestamp"] or "", reverse=True)
        DATA_CACHE["channels"] = channels
        DATA_CACHE["is_indexed"] = True
        DATA_CACHE["indexing_error"] = None
        print(f"[Success] Indexed {len(channels)} channels and DMs.")
        return True

    except Exception as e:
        print(f"[Error] Indexing failed: {e}")
        DATA_CACHE["is_indexed"] = False
        DATA_CACHE["indexing_error"] = str(e)
        return False


class DiscordRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_json(self, data, code=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_static_file(self, req_path):
        if req_path == "/" or not req_path:
            req_path = "index.html"
        
        req_path = req_path.lstrip("/")
        full_path = get_resource_path(os.path.join("public", req_path))

        if os.path.exists(full_path) and os.path.isfile(full_path):
            ext = os.path.splitext(full_path)[1].lower()
            mime_types = {
                ".html": "text/html",
                ".css": "text/css",
                ".js": "application/javascript",
                ".json": "application/json",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".svg": "image/svg+xml"
            }
            content_type = mime_types.get(ext, "application/octet-stream")

            with open(full_path, 'rb') as f:
                content = f.read()

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path_name = parsed.path
        query_params = urllib.parse.parse_qs(parsed.query)

        if path_name == "/api/status":
            self.send_json({
                "isIndexed": DATA_CACHE["is_indexed"],
                "packageDir": PACKAGE_DIR,
                "error": DATA_CACHE["indexing_error"],
                "totalChannels": len(DATA_CACHE["channels"])
            })
        elif path_name == "/api/account":
            acc = DATA_CACHE["account"]
            self.send_json({
                "id": str(acc.get("id", "")),
                "username": acc.get("username", "User"),
                "global_name": acc.get("global_name") or acc.get("username") or "Discord User",
                "email": acc.get("email", ""),
                "avatar_hash": acc.get("avatar_hash", ""),
                "packageDir": PACKAGE_DIR
            })
        elif path_name == "/api/channels":
            self.send_json({
                "total": len(DATA_CACHE["channels"]),
                "packageDir": PACKAGE_DIR,
                "isIndexed": DATA_CACHE["is_indexed"],
                "channels": DATA_CACHE["channels"]
            })
        elif path_name.startswith("/api/channel/") and path_name.endswith("/messages"):
            parts = path_name.split("/")
            channel_id = parts[3]
            messages = DATA_CACHE["messages"].get(channel_id, [])

            search_query = query_params.get("search", [""])[0].lower()
            if search_query:
                filtered = [m for m in messages if search_query in (m.get("Contents") or "").lower()]
            else:
                filtered = messages

            try:
                offset = int(query_params.get("offset", [0])[0])
            except ValueError:
                offset = 0

            try:
                limit = int(query_params.get("limit", [100])[0])
            except ValueError:
                limit = 100

            paginated = filtered[offset:offset + limit]
            ch_meta = next((c for c in DATA_CACHE["channels"] if str(c["id"]) == str(channel_id)), None)

            self.send_json({
                "channelId": channel_id,
                "channelMeta": ch_meta,
                "totalMessages": len(filtered),
                "offset": offset,
                "limit": limit,
                "messages": paginated
            })
        elif path_name == "/api/search":
            query = query_params.get("q", [""])[0].strip().lower()
            if not query:
                return self.send_json({"results": [], "total": 0})

            try:
                limit = int(query_params.get("limit", [100])[0])
            except ValueError:
                limit = 100

            results = []
            for ch_id, msgs in DATA_CACHE["messages"].items():
                ch_meta = next((c for c in DATA_CACHE["channels"] if str(c["id"]) == str(ch_id)), None)
                for msg in msgs:
                    if query in (msg.get("Contents") or "").lower():
                        results.append({
                            "channelId": ch_id,
                            "channelName": ch_meta.get("name") if ch_meta else f"Channel {ch_id}",
                            "guildName": ch_meta.get("guildName") if ch_meta else "",
                            "type": ch_meta.get("type") if ch_meta else "UNKNOWN",
                            "recipientId": ch_meta.get("recipientId") if ch_meta else None,
                            "recipientHandle": ch_meta.get("recipientHandle") if ch_meta else "",
                            "message": msg
                        })
                        if len(results) >= limit:
                            break
                if len(results) >= limit:
                    break

            self.send_json({"query": query, "total": len(results), "results": results})

        elif path_name == "/api/stats":
            total_msgs = 0
            dm_count = 0
            guild_count = 0
            top_dms = []
            top_guilds_map = {}

            for ch in DATA_CACHE["channels"]:
                m_count = ch["messageCount"]
                total_msgs += m_count
                if ch["type"] == "DM":
                    dm_count += 1
                    top_dms.append(ch)
                else:
                    guild_count += 1
                    g_name = ch.get("guildName")
                    if g_name:
                        top_guilds_map[g_name] = top_guilds_map.get(g_name, 0) + m_count

            top_dms.sort(key=lambda x: x["messageCount"], reverse=True)
            top_guilds = [{"name": k, "count": v} for k, v in sorted(top_guilds_map.items(), key=lambda item: item[1], reverse=True)]

            self.send_json({
                "totalMessages": total_msgs,
                "totalChannels": len(DATA_CACHE["channels"]),
                "dmCount": dm_count,
                "guildChannelCount": guild_count,
                "topDms": [{
                    "id": d["id"],
                    "name": d["name"],
                    "recipientId": d.get("recipientId"),
                    "recipientHandle": d.get("recipientHandle"),
                    "messageCount": d["messageCount"]
                } for d in top_dms[:10]],
                "topGuilds": top_guilds[:10]
            })

        else:
            self.serve_static_file(path_name)

    def do_POST(self):
        if self.path == "/api/set-package-path":
            length = int(self.headers.get('Content-Length', 0))
            raw_data = self.rfile.read(length)
            try:
                body = json.loads(raw_data.decode('utf-8'))
                new_path = body.get("newPath", "").strip()
                if new_path and os.path.exists(new_path):
                    success = index_package_data(new_path)
                    if success:
                        return self.send_json({
                            "success": True,
                            "message": f"Loaded folder {PACKAGE_DIR}",
                            "totalChannels": len(DATA_CACHE["channels"]),
                            "packageDir": PACKAGE_DIR
                        })
                    else:
                        return self.send_json({"error": DATA_CACHE["indexing_error"] or "Failed to index"}, 500)
                else:
                    return self.send_json({"error": "Invalid or non-existent path"}, 400)
            except Exception as e:
                return self.send_json({"error": str(e)}, 500)

        self.send_response(404)
        self.end_headers()


def start_http_server():
    global SERVER_INSTANCE
    try:
        SERVER_INSTANCE = HTTPServer(('127.0.0.1', PORT), DiscordRequestHandler)
        print(f"[Server] Running on http://localhost:{PORT}")
        SERVER_INSTANCE.serve_forever()
    except Exception as e:
        print(f"[Server Error] {e}")


class LauncherApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Discord Data Export Explorer v1.0.0")
        self.root.geometry("580x320")
        self.root.resizable(False, False)
        
        self.package_path = tk.StringVar()

        # Discord Color Tokens
        bg_main = "#2b2d31"
        bg_input = "#1e1f22"
        fg_bold = "#f2f3f5"
        fg_muted = "#949ba4"
        accent_blurple = "#5865f2"
        accent_hover = "#4752c4"
        btn_red = "#da373c"

        self.root.configure(bg=bg_main)

        # Header Title
        lbl_title = tk.Label(root, text="💬 Discord Data Export Explorer", font=("Segoe UI", 16, "bold"), bg=bg_main, fg=accent_blurple)
        lbl_title.pack(anchor="w", padx=24, pady=(20, 5))

        lbl_desc = tk.Label(root, text="Select your unzipped Discord Data Package folder (containing Account, Messages, Servers):", font=("Segoe UI", 10), bg=bg_main, fg=fg_muted, wraplength=530, justify="left")
        lbl_desc.pack(anchor="w", padx=24, pady=(0, 16))

        # Folder Selection Entry + Browse Button Frame
        frame_folder = tk.Frame(root, bg=bg_main)
        frame_folder.pack(fill="x", padx=24, pady=5)

        entry_path = tk.Entry(frame_folder, textvariable=self.package_path, font=("Segoe UI", 10), bg=bg_input, fg=fg_bold, insertbackground="#ffffff", borderwidth=1, relief="solid")
        entry_path.pack(side="left", fill="x", expand=True, ipady=6, padx=(0, 10))

        btn_browse = tk.Button(frame_folder, text="📁 Browse Folder...", command=self.browse_folder, font=("Segoe UI", 9, "bold"), bg="#35373c", fg="#ffffff", activebackground="#404249", borderwidth=0, cursor="hand2", relief="flat")
        btn_browse.pack(side="right", ipadx=12, ipady=6)

        # Action Buttons Frame
        frame_btns = tk.Frame(root, bg=bg_main)
        frame_btns.pack(fill="x", padx=24, pady=20)

        self.btn_start = tk.Button(frame_btns, text="🚀 Start Server & Open Browser", command=self.on_start_click, font=("Segoe UI", 10, "bold"), bg=accent_blurple, fg="#ffffff", activebackground=accent_hover, borderwidth=0, cursor="hand2", relief="flat")
        self.btn_start.pack(side="left", fill="x", expand=True, ipady=8, padx=(0, 6))

        self.btn_stop = tk.Button(frame_btns, text="🛑 Stop Server", command=self.stop_server, font=("Segoe UI", 10, "bold"), bg=btn_red, fg="#ffffff", activebackground="#a1282b", borderwidth=0, state="disabled", cursor="hand2", relief="flat")
        self.btn_stop.pack(side="right", fill="x", expand=True, ipady=8, padx=(6, 0))

        # Status Footer
        self.lbl_status = tk.Label(root, text="Status: Ready. Please select a folder and click Start Server.", font=("Segoe UI", 10, "italic"), bg=bg_main, fg=fg_muted)
        self.lbl_status.pack(anchor="w", padx=24, pady=(0, 15))

        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def browse_folder(self):
        folder = filedialog.askdirectory(title="Select your Discord Data Package folder")
        if folder:
            self.package_path.set(folder)

    def on_start_click(self):
        folder = self.package_path.get().strip()
        if not folder or not os.path.exists(folder):
            messagebox.showwarning("Select Folder", "Please select a valid Discord Data Package folder.")
            return

        self.btn_start.config(state="disabled")
        self.lbl_status.config(text="Status: Indexing package & recovering Deleted User IDs...", fg="#e3b341")

        def background_index():
            success = index_package_data(folder)
            def update_ui():
                if success:
                    self.lbl_status.config(text=f"Status: Server running on http://localhost:{PORT} ({len(DATA_CACHE['channels'])} chats indexed)", fg="#23a55a")
                    self.btn_stop.config(state="normal")
                    webbrowser.open(f"http://localhost:{PORT}")
                else:
                    self.lbl_status.config(text="Status: Failed to index package.", fg="#da373c")
                    self.btn_start.config(state="normal")
                    messagebox.showerror("Error Loading Data", DATA_CACHE["indexing_error"] or "Failed to parse Discord package folder.")
            self.root.after(0, update_ui)

        threading.Thread(target=background_index, daemon=True).start()

    def stop_server(self):
        DATA_CACHE["is_indexed"] = False
        DATA_CACHE["channels"].clear()
        DATA_CACHE["messages"].clear()
        self.btn_start.config(state="normal")
        self.btn_stop.config(state="disabled")
        self.lbl_status.config(text="Status: Server stopped. Package unloaded.", fg="#949ba4")

    def on_close(self):
        if SERVER_INSTANCE:
            SERVER_INSTANCE.shutdown()
        self.root.destroy()


if __name__ == "__main__":
    SERVER_THREAD = threading.Thread(target=start_http_server, daemon=True)
    SERVER_THREAD.start()

    for i, arg in enumerate(sys.argv):
        if arg == "--package" and i + 1 < len(sys.argv):
            index_package_data(sys.argv[i + 1])
            break

    root = tk.Tk()
    app = LauncherApp(root)
    if PACKAGE_DIR:
        app.package_path.set(PACKAGE_DIR)
        app.lbl_status.config(text=f"Status: Loaded {len(DATA_CACHE['channels'])} channels", fg="#23a55a")
        app.btn_stop.config(state="normal")
    root.mainloop()
