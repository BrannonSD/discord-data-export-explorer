#!/usr/bin/env python3
"""
Discord Data Export Explorer - v1.3.1 Standalone Desktop Application Launcher & Server
Zero-dependency Python desktop backend serving embedded UI and handling native file picker.
"""
import os
import sys
import json
import re
import threading
import time
import csv
import io
import urllib.parse
import webbrowser
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
import tkinter as tk
from tkinter import filedialog, messagebox

VERSION = "1.3.1"

# Global Data Cache
PACKAGE_DIR = ""
DATA_CACHE = {
    "account": {},
    "channels": [],
    "servers": {},
    "messages": {}, # channelId -> list of msg objects (sorted oldest -> newest)
    "activity": [],
    "relationships": [],
    "is_indexed": False,
    "indexing_error": None
}

PORT = 3000
SERVER_INSTANCE = None
SERVER_THREAD = None

def get_resource_path(relative_path):
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

def clean_username(name):
    if not name:
        return ""
    cleaned = str(name).strip()
    cleaned = re.sub(r'^Direct Message with\s+', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'#(0|0000)$', '', cleaned)
    return cleaned

def parse_discord_csv(filepath):
    if not os.path.exists(filepath):
        return []
    messages = []
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            reader = csv.reader(f)
            header = next(reader, None)
            if not header:
                return []
            
            header_map = {h.strip().lower(): idx for idx, h in enumerate(header)}
            id_idx = header_map.get('id', header_map.get('messageid', header_map.get('message_id', -1)))
            time_idx = header_map.get('timestamp', header_map.get('time', header_map.get('date', -1)))
            contents_idx = header_map.get('contents', header_map.get('content', header_map.get('message', -1)))
            att_idx = header_map.get('attachments', header_map.get('attachment', -1))

            r_idx = 1
            for row in reader:
                if not row or not any(row):
                    continue
                r_idx += 1
                msg_id = row[id_idx].strip() if id_idx != -1 and id_idx < len(row) else str(r_idx)
                raw_time = row[time_idx].strip() if time_idx != -1 and time_idx < len(row) else ""
                contents = row[contents_idx] if contents_idx != -1 and contents_idx < len(row) else ""
                attachments = row[att_idx].strip() if att_idx != -1 and att_idx < len(row) else ""

                formatted_time = raw_time
                if raw_time and re.match(r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}', raw_time):
                    formatted_time = raw_time.replace(' ', 'T') + 'Z'

                messages.append({
                    "ID": msg_id,
                    "Timestamp": formatted_time,
                    "Contents": contents,
                    "Attachments": attachments
                })
    except Exception as e:
        print(f"[CSV Parsing Error] {filepath}: {e}")
    return messages

def recover_deleted_user_ids(target_dir, deleted_dm_channel_ids, my_user_id):
    recovered_map = {}
    target_set = set(deleted_dm_channel_ids)

    if not target_set:
        return recovered_map

    for channel_id in list(target_set):
        folder_path = os.path.join(target_dir, "Messages", f"c{channel_id}")
        m_json = os.path.join(folder_path, "messages.json")
        m_csv = os.path.join(folder_path, "messages.csv")
        msgs = []
        if os.path.exists(m_json):
            msgs = read_json_file(m_json) or []
        elif os.path.exists(m_csv):
            msgs = parse_discord_csv(m_csv)

        for m in msgs:
            text_match = re.search(r'<@!?(\d{17,19})>', m.get("Contents") or "")
            if text_match and str(text_match.group(1)) != str(my_user_id):
                recovered_map[channel_id] = str(text_match.group(1))
                target_set.remove(channel_id)
                break
            att_match = re.search(r'/attachments/\d+/(\d{17,19})/', m.get("Attachments") or "")
            if att_match and str(att_match.group(1)) != str(channel_id):
                recovered_map[channel_id] = str(att_match.group(1))
                target_set.remove(channel_id)
                break

    if target_set:
        activity_dir = os.path.join(target_dir, "Activity")
        log_files = []

        def find_log_files(d):
            if not os.path.exists(d):
                return
            for entry in os.listdir(d):
                full = os.path.join(d, entry)
                if os.path.isdir(full):
                    find_log_files(full)
                elif entry.endswith('.json'):
                    log_files.append(full)

        find_log_files(activity_dir)

        for file in log_files:
            if not target_set:
                break
            try:
                with open(file, 'r', encoding='utf-8', errors='ignore') as f:
                    lines_scanned = 0
                    for line in f:
                        lines_scanned += 1
                        if lines_scanned > 150000 or not target_set:
                            break
                        for channel_id in list(target_set):
                            if channel_id in line:
                                try:
                                    obj = json.loads(line)
                                    r_ids = obj.get("_governance_meta", {}).get("reporting", {}).get("recipient_ids", []) or obj.get("recipient_ids", [])
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
        start_time = time.time()

        account_path = os.path.join(PACKAGE_DIR, "Account", "user.json")
        acc = read_json_file(account_path) or {}
        if acc:
            acc["username"] = clean_username(acc.get("username"))
            acc["global_name"] = clean_username(acc.get("global_name"))
        DATA_CACHE["account"] = acc
        DATA_CACHE["relationships"] = acc.get("relationships", [])

        rel_path = os.path.join(PACKAGE_DIR, "Account", "relationships.json")
        if os.path.exists(rel_path):
            r_data = read_json_file(rel_path)
            if isinstance(r_data, list):
                DATA_CACHE["relationships"] = r_data

        servers_path = os.path.join(PACKAGE_DIR, "Servers", "index.json")
        DATA_CACHE["servers"] = read_json_file(servers_path) or {}

        msg_index_path = os.path.join(PACKAGE_DIR, "Messages", "index.json")
        msg_index = read_json_file(msg_index_path) or {}

        activity_dir = os.path.join(PACKAGE_DIR, "Activity")
        DATA_CACHE["activity"] = []
        if os.path.exists(activity_dir):
            for file in os.listdir(activity_dir):
                if file.endswith(".json"):
                    fp = os.path.join(activity_dir, file)
                    try:
                        with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                            for line in f:
                                if line.strip():
                                    DATA_CACHE["activity"].append(json.loads(line))
                    except Exception:
                        pass

        messages_dir = os.path.join(PACKAGE_DIR, "Messages")
        channels = []
        DATA_CACHE["messages"].clear()
        deleted_dm_channel_ids = []
        seen_channel_ids = set()

        index_keys = list(msg_index.keys()) if isinstance(msg_index, dict) else []

        def process_channel_folder(entry, channel_id_override=None):
            folder_path = os.path.join(messages_dir, entry)
            if not os.path.exists(folder_path) or not os.path.isdir(folder_path):
                return None

            channel_json_path = os.path.join(folder_path, "channel.json")
            messages_json_path = os.path.join(folder_path, "messages.json")
            messages_csv_path = os.path.join(folder_path, "messages.csv")
            channel_info = read_json_file(channel_json_path)

            channel_id = str(channel_info.get("id") if channel_info else (channel_id_override or entry.replace("c", "")))
            if channel_id in seen_channel_ids:
                return None
            seen_channel_ids.add(channel_id)

            indexed_desc = msg_index.get(channel_id, "")

            ch_type = channel_info.get("type", "UNKNOWN") if channel_info else "UNKNOWN"
            raw_name = channel_info.get("name", "") if channel_info else ""
            if not raw_name:
                raw_name = indexed_desc or f"Channel {channel_id}"

            ch_name = clean_username(raw_name)

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
                    recipient_handle = clean_username(match.group(1))
                    if not ch_name or ch_name == f"Channel {channel_id}" or ch_name.startswith("Direct Message with"):
                        ch_name = recipient_handle if recipient_handle.startswith("@") else f"@{recipient_handle}"

                if recipient_id == "Deleted User" or not recipient_id or "Unknown Participant" in recipient_handle:
                    is_deleted_user = True
                    deleted_dm_channel_ids.append(channel_id)

            elif ch_type == "GROUP_DM" or indexed_desc.startswith("Group DM"):
                ch_type = "GROUP_DM"

            msgs = []
            if os.path.exists(messages_json_path):
                msgs = read_json_file(messages_json_path) or []
            elif os.path.exists(messages_csv_path):
                msgs = parse_discord_csv(messages_csv_path)

            msgs.sort(key=lambda m: m.get("Timestamp") or "")
            DATA_CACHE["messages"][channel_id] = msgs

            first_ts = msgs[0].get("Timestamp") if msgs else None
            last_ts = msgs[-1].get("Timestamp") if msgs else None

            return {
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
                "messageCount": len(msgs),
                "firstMessageTimestamp": first_ts,
                "lastMessageTimestamp": last_ts
            }

        # 1. Process channels in exact original order of Messages/index.json
        for ch_id in index_keys:
            folder_name = f"c{ch_id}"
            ch_data = process_channel_folder(folder_name, ch_id)
            if ch_data:
                channels.append(ch_data)

        # 2. Process any unindexed folders in Messages/
        if os.path.exists(messages_dir):
            for entry in os.listdir(messages_dir):
                ch_data = process_channel_folder(entry)
                if ch_data:
                    channels.append(ch_data)

        # Sort channels by latest active message
        channels.sort(key=lambda c: c.get("lastMessageTimestamp") or "", reverse=True)

        DATA_CACHE["channels"] = channels
        DATA_CACHE["is_indexed"] = True
        DATA_CACHE["indexing_error"] = None

        total_msgs = sum(c["messageCount"] for c in channels)
        elapsed = time.time() - start_time
        print(f"[Verified Indexing] Tallied {total_msgs:,} exact messages across {len(channels)} channels in {elapsed:.3f}s!")

        if deleted_dm_channel_ids:
            def bg_recovery():
                print(f"[Background Recovery] Scanning for {len(deleted_dm_channel_ids)} deleted user IDs...")
                recovered_map = recover_deleted_user_ids(PACKAGE_DIR, deleted_dm_channel_ids, DATA_CACHE["account"].get("id", ""))
                for ch in DATA_CACHE["channels"]:
                    if ch["isDeletedUser"] and ch["id"] in recovered_map:
                        ch["recipientId"] = recovered_map[ch["id"]]
                        ch["isRecovered"] = True
                print(f"[Background Recovery Complete] Recovered {len(recovered_map)} deleted user IDs.")

            t = threading.Thread(target=bg_recovery, daemon=True)
            t.start()

        return True

    except Exception as e:
        print(f"[Error] Indexing failed: {e}")
        DATA_CACHE["is_indexed"] = False
        DATA_CACHE["indexing_error"] = str(e)
        return False

def get_channel_messages(channel_id):
    if channel_id in DATA_CACHE["messages"]:
        return DATA_CACHE["messages"][channel_id]

    ch_info = next((c for c in DATA_CACHE["channels"] if str(c["id"]) == str(channel_id)), None)
    folder_name = ch_info["folderName"] if ch_info else f"c{channel_id}"

    messages_json_path = os.path.join(PACKAGE_DIR, "Messages", folder_name, "messages.json")
    messages_csv_path = os.path.join(PACKAGE_DIR, "Messages", folder_name, "messages.csv")
    msgs = []
    if os.path.exists(messages_json_path):
        msgs = read_json_file(messages_json_path) or []
    elif os.path.exists(messages_csv_path):
        msgs = parse_discord_csv(messages_csv_path)

    msgs.sort(key=lambda m: m.get("Timestamp") or "")
    DATA_CACHE["messages"][channel_id] = msgs

    if ch_info:
        ch_info["messageCount"] = len(msgs)

    return msgs


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
                ".jpeg": "image/jpeg",
                ".webp": "image/webp",
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

        if path_name == "/api/account/avatar":
            if PACKAGE_DIR:
                account_dir = os.path.join(PACKAGE_DIR, "Account")
                for fn in ["avatar.gif", "avatar.png", "avatar.jpg", "avatar.jpeg", "avatar.webp"]:
                    fp = os.path.join(account_dir, fn)
                    if os.path.exists(fp):
                        ext = os.path.splitext(fn)[1].lower()
                        mime = "image/gif" if ext == ".gif" else ("image/png" if ext == ".png" else "image/jpeg")
                        with open(fp, 'rb') as f:
                            data = f.read()
                        self.send_response(200)
                        self.send_header('Content-Type', mime)
                        self.send_header('Content-Length', str(len(data)))
                        self.end_headers()
                        return self.wfile.write(data)
            self.send_response(404)
            self.end_headers()
            return

        if path_name == "/api/account/banner":
            if PACKAGE_DIR:
                account_dir = os.path.join(PACKAGE_DIR, "Account")
                for fn in ["banner.gif", "banner.png", "banner.jpg", "banner.jpeg", "banner.webp"]:
                    fp = os.path.join(account_dir, fn)
                    if os.path.exists(fp):
                        ext = os.path.splitext(fn)[1].lower()
                        mime = "image/gif" if ext == ".gif" else ("image/png" if ext == ".png" else "image/jpeg")
                        with open(fp, 'rb') as f:
                            data = f.read()
                        self.send_response(200)
                        self.send_header('Content-Type', mime)
                        self.send_header('Content-Length', str(len(data)))
                        self.end_headers()
                        return self.wfile.write(data)
            self.send_response(404)
            self.end_headers()
            return

        if path_name == "/api/status":
            self.send_json({
                "isIndexed": DATA_CACHE["is_indexed"],
                "packageDir": PACKAGE_DIR,
                "error": DATA_CACHE["indexing_error"],
                "totalChannels": len(DATA_CACHE["channels"]),
                "totalMessages": sum(c["messageCount"] for c in DATA_CACHE["channels"]),
                "version": VERSION
            })
        elif path_name == "/api/account":
            acc = DATA_CACHE["account"]
            self.send_json({
                "id": str(acc.get("id", "")),
                "username": acc.get("username", "User"),
                "global_name": acc.get("global_name") or acc.get("username") or "Discord User",
                "email": acc.get("email", ""),
                "phone": acc.get("phone", ""),
                "bio": acc.get("bio", ""),
                "premium_type": acc.get("premium_type", 0),
                "created_at": acc.get("created_at", ""),
                "avatar_hash": acc.get("avatar_hash", ""),
                "banner_hash": acc.get("banner_hash", ""),
                "connected_accounts": acc.get("connected_accounts", []),
                "relationships": DATA_CACHE["relationships"],
                "packageDir": PACKAGE_DIR
            })
        elif path_name == "/api/servers":
            guild_map = {}
            for s_id, s_name in DATA_CACHE["servers"].items():
                guild_map[s_id] = {
                    "id": s_id,
                    "name": s_name,
                    "channels": [],
                    "totalMessages": 0
                }
            for ch in DATA_CACHE["channels"]:
                g_id = ch.get("guildId")
                if g_id:
                    if g_id not in guild_map:
                        guild_map[g_id] = {
                            "id": g_id,
                            "name": ch.get("guildName") or f"Server {g_id}",
                            "channels": [],
                            "totalMessages": 0
                        }
                    guild_map[g_id]["channels"].append(ch)
                    guild_map[g_id]["totalMessages"] += ch["messageCount"]
            
            servers_sorted = sorted(guild_map.values(), key=lambda s: s["totalMessages"], reverse=True)
            self.send_json({"servers": servers_sorted})

        elif path_name == "/api/activity":
            games_map = {}
            total_voice_minutes = 0
            for item in DATA_CACHE["activity"]:
                g_name = item.get("game_name") or item.get("application_name")
                if g_name:
                    dur = item.get("duration_minutes") or (round(item.get("duration", 0) / 60) if item.get("duration") else 10)
                    games_map[g_name] = games_map.get(g_name, 0) + dur
                if item.get("event_type") == "voice_channel_joined" or item.get("duration_minutes"):
                    total_voice_minutes += item.get("duration_minutes", 0)

            top_games = [{"name": k, "minutes": v, "hours": round(v / 60, 1)} for k, v in sorted(games_map.items(), key=lambda i: i[1], reverse=True)]
            self.send_json({
                "totalEvents": len(DATA_CACHE["activity"]),
                "topGames": top_games,
                "totalVoiceMinutes": total_voice_minutes
            })

        elif path_name == "/api/channels":
            self.send_json({
                "total": len(DATA_CACHE["channels"]),
                "packageDir": PACKAGE_DIR,
                "isIndexed": DATA_CACHE["is_indexed"],
                "channels": DATA_CACHE["channels"]
            })

        elif path_name.startswith("/api/channel/") and path_name.endswith("/export"):
            parts = path_name.split("/")
            channel_id = parts[3]
            fmt = query_params.get("format", ["html"])[0].lower()
            ch_info = next((c for c in DATA_CACHE["channels"] if str(c["id"]) == str(channel_id)), None)
            msgs = get_channel_messages(channel_id)
            ch_name = ch_info.get("name") if ch_info else f"Channel_{channel_id}"
            safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', ch_name)

            if fmt == "json":
                body = json.dumps(msgs, indent=2).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Disposition', f'attachment; filename="{safe_name}_export.json"')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                return self.wfile.write(body)

            elif fmt == "csv":
                output = io.StringIO()
                writer = csv.writer(output)
                writer.writerow(["ID", "Timestamp", "AuthorID", "Contents", "Attachments"])
                for m in msgs:
                    writer.writerow([m.get("ID", ""), m.get("Timestamp", ""), m.get("AuthorID", ""), m.get("Contents", ""), m.get("Attachments", "")])
                body = output.getvalue().encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/csv; charset=utf-8')
                self.send_header('Content-Disposition', f'attachment; filename="{safe_name}_export.csv"')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                return self.wfile.write(body)

            elif fmt == "txt":
                txt = f"=====================================================\r\nDiscord Chat Export: {ch_name}\r\nChannel ID: {channel_id}\r\nTotal Messages: {len(msgs)}\r\n=====================================================\r\n\r\n"
                for m in msgs:
                    time_str = f"[{m.get('Timestamp', '')}] " if m.get('Timestamp') else ""
                    txt += f"{time_str}{m.get('Contents', '')}"
                    if m.get('Attachments'):
                        txt += f" [Attachments: {m.get('Attachments')}]"
                    txt += "\r\n"
                body = txt.encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.send_header('Content-Disposition', f'attachment; filename="{safe_name}_export.txt"')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                return self.wfile.write(body)

            else: # HTML export
                html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>{ch_name} - Export</title>
<style>
body {{ font-family: sans-serif; background: #313338; color: #dbdee1; padding: 20px; }}
.header {{ background: #1e1f22; padding: 16px; border-radius: 8px; margin-bottom: 20px; }}
.msg {{ display: flex; gap: 12px; margin-bottom: 12px; padding: 6px; }}
.avatar {{ width: 36px; height: 36px; border-radius: 50%; background: #5865f2; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; }}
.time {{ font-size: 0.75rem; color: #949ba4; margin-left: 8px; }}
</style></head><body>
<div class="header"><h2>{ch_name}</h2><p>Channel ID: {channel_id} • {len(msgs)} messages</p></div>
"""
                for m in msgs:
                    html_body += f"""<div class="msg"><div class="avatar">💬</div><div><div><strong>User</strong><span class="time">{m.get('Timestamp', '')}</span></div><div>{m.get('Contents', '')}</div></div></div>\n"""
                html_body += "</body></html>"
                body = html_body.encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Disposition', f'attachment; filename="{safe_name}_export.html"')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                return self.wfile.write(body)

        elif path_name.startswith("/api/channel/") and path_name.endswith("/messages"):
            parts = path_name.split("/")
            channel_id = parts[3]
            messages = get_channel_messages(channel_id)

            search_query = query_params.get("search", [""])[0].lower()
            if search_query:
                filtered = [m for m in messages if search_query in (m.get("Contents") or "").lower() or search_query in (m.get("Attachments") or "").lower()]
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

            total = len(filtered)
            end_index = max(0, total - offset)
            start_index = max(0, total - offset - limit)

            paginated = filtered[start_index:end_index]
            ch_meta = next((c for c in DATA_CACHE["channels"] if str(c["id"]) == str(channel_id)), None)

            self.send_json({
                "channelId": channel_id,
                "channelMeta": ch_meta,
                "totalMessages": total,
                "offset": offset,
                "limit": limit,
                "messages": paginated,
                "hasMore": start_index > 0
            })

        elif path_name == "/api/search":
            raw_query = query_params.get("q", [""])[0].strip()
            if not raw_query:
                return self.send_json({"query": "", "total": 0, "results": []})

            try:
                limit = int(query_params.get("limit", [1000])[0])
            except ValueError:
                limit = 1000

            max_per_ch = max(50, limit // 5)

            filter_image = "has:image" in raw_query.lower()
            filter_video = "has:video" in raw_query.lower()
            filter_audio = "has:audio" in raw_query.lower()
            filter_file = "has:file" in raw_query.lower()
            filter_link = "has:link" in raw_query.lower()

            filter_from = None
            m_from = re.search(r'from:(\S+)', raw_query, re.IGNORECASE)
            if m_from:
                filter_from = m_from.group(1).lower()

            clean_q = re.sub(r'(has:\w+|from:\S+|before:\S+|after:\S+)', '', raw_query, flags=re.IGNORECASE).strip().lower()

            results = []
            for ch in DATA_CACHE["channels"]:
                ch_id = ch["id"]
                msgs = get_channel_messages(ch_id)
                ch_matches = 0

                for i in range(len(msgs) - 1, -1, -1):
                    msg = msgs[i]
                    contents = (msg.get("Contents") or "").lower()
                    atts = (msg.get("Attachments") or "").lower()

                    if filter_image and not re.search(r'\.(png|jpg|jpeg|webp|gif|svg)', atts, re.I):
                        continue
                    if filter_video and not re.search(r'\.(mp4|webm|mov|mkv)', atts, re.I) and "youtube.com" not in contents and "youtu.be" not in contents:
                        continue
                    if filter_audio and not re.search(r'\.(mp3|ogg|wav|m4a|flac)', atts, re.I):
                        continue
                    if filter_file and not atts:
                        continue
                    if filter_link and "http://" not in contents and "https://" not in contents:
                        continue

                    if filter_from:
                        if filter_from != "me" and filter_from not in (ch.get("name") or "").lower() and filter_from not in (ch.get("recipientHandle") or "").lower() and filter_from not in (ch.get("recipientId") or ""):
                            continue

                    if clean_q and clean_q not in contents and clean_q not in atts:
                        continue

                    results.append({
                        "channelId": ch_id,
                        "channelName": ch.get("name") or f"Channel {ch_id}",
                        "guildName": ch.get("guildName") or "",
                        "type": ch.get("type") or "UNKNOWN",
                        "recipientId": ch.get("recipientId"),
                        "recipientHandle": ch.get("recipientHandle") or "",
                        "message": msg
                    })

                    ch_matches += 1
                    if len(results) >= limit or ch_matches >= max_per_ch:
                        break

                if len(results) >= limit:
                    break

            self.send_json({"query": raw_query, "total": len(results), "results": results})

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

        elif path_name == "/api/stats/advanced":
            total_msgs = 0
            total_chars = 0
            total_words = 0
            heatmap = [[0 for _ in range(24)] for _ in range(7)]
            monthly_map = {}
            yearly_map = {}
            daily_count_map = {}
            emoji_map = {}
            word_map = {}
            attachment_stats = {"images": 0, "videos": 0, "audio": 0, "documents": 0, "total": 0}

            stop_words = set([
                'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he',
                'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or',
                'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about',
                'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
                'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than',
                'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two',
                'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give',
                'day', 'most', 'us', 'is', 'are', 'was', 'were', 'am', 'been', 'has', 'had', 'did', 'does', 'im', 'dont'
            ])

            for ch in DATA_CACHE["channels"]:
                msgs = get_channel_messages(ch["id"])
                for m in msgs:
                    total_msgs += 1
                    contents = m.get("Contents") or ""
                    atts = m.get("Attachments") or ""
                    total_chars += len(contents)

                    # Custom emojis
                    for em in re.findall(r'<a?:([a-zA-Z0-9_]+):(\d+)>', contents):
                        key = f":{em[0]}:"
                        emoji_map[key] = emoji_map.get(key, 0) + 1

                    # Words
                    words = re.findall(r'\b[a-zA-Z]{3,}\b', contents.lower())
                    total_words += len(words)
                    for w in words:
                        if w not in stop_words:
                            word_map[w] = word_map.get(w, 0) + 1

                    # Attachments
                    if atts:
                        urls = [u for u in atts.split() if u]
                        attachment_stats["total"] += len(urls)
                        for u in urls:
                            if re.search(r'\.(png|jpg|jpeg|webp|gif|svg)', u, re.I):
                                attachment_stats["images"] += 1
                            elif re.search(r'\.(mp4|webm|mov|mkv)', u, re.I):
                                attachment_stats["videos"] += 1
                            elif re.search(r'\.(mp3|ogg|wav|m4a|flac)', u, re.I):
                                attachment_stats["audio"] += 1
                            else:
                                attachment_stats["documents"] += 1

                    # Timestamps
                    ts = m.get("Timestamp")
                    if ts:
                        try:
                            clean_ts = ts.replace("Z", "+00:00")
                            dt = datetime.fromisoformat(clean_ts)
                            dow = (dt.weekday() + 1) % 7 # 0 = Sunday
                            hour = dt.hour
                            heatmap[dow][hour] += 1

                            m_key = f"{dt.year}-{dt.month:02d}"
                            monthly_map[m_key] = monthly_map.get(m_key, 0) + 1
                            yearly_map[dt.year] = yearly_map.get(dt.year, 0) + 1
                            d_key = dt.strftime("%Y-%m-%d")
                            daily_count_map[d_key] = daily_count_map.get(d_key, 0) + 1
                        except Exception:
                            pass

            monthly_timeline = [{"month": k, "count": v} for k, v in sorted(monthly_map.items())]
            yearly_timeline = [{"year": k, "count": v} for k, v in sorted(yearly_map.items())]
            top_emojis = [{"emoji": k, "count": v} for k, v in sorted(emoji_map.items(), key=lambda x: x[1], reverse=True)[:15]]
            top_words = [{"word": k, "count": v} for k, v in sorted(word_map.items(), key=lambda x: x[1], reverse=True)[:20]]

            daily_dates = sorted(daily_count_map.keys())
            most_active = {"date": "", "count": 0}
            longest_streak = 0
            cur_streak = 0
            prev_d = None

            for d_str in daily_dates:
                c = daily_count_map[d_str]
                if c > most_active["count"]:
                    most_active = {"date": d_str, "count": c}
                cur_d = datetime.strptime(d_str, "%Y-%m-%d").date()
                if prev_d:
                    if (cur_d - prev_d).days == 1:
                        cur_streak += 1
                    else:
                        longest_streak = max(longest_streak, cur_streak)
                        cur_streak = 1
                else:
                    cur_streak = 1
                prev_d = cur_d
            longest_streak = max(longest_streak, cur_streak)

            self.send_json({
                "totalMessages": total_msgs,
                "totalCharacters": total_chars,
                "totalWords": total_words,
                "avgMessageLength": round(total_chars / total_msgs) if total_msgs else 0,
                "heatmap": heatmap,
                "monthlyTimeline": monthly_timeline,
                "yearlyTimeline": yearly_timeline,
                "topEmojis": top_emojis,
                "topWords": top_words,
                "attachmentStats": attachment_stats,
                "activityStreaks": {
                    "activeDays": len(daily_dates),
                    "longestStreak": longest_streak,
                    "mostActiveDay": most_active
                }
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


def launch_gui():
    root = tk.Tk()
    root.title(f"Discord Data Export Explorer v{VERSION}")
    root.geometry("680x420")
    root.resizable(False, False)

    try:
        root.tk.call('wm', 'iconphoto', root._w, tk.PhotoImage(data='''iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAadEVYdFNvZnR3YXJlAFBhaW50Lk5FVCB2My41.10VzTEQAAABPSURBVDhPY2AYBaMGAgAAFBAAAe9fFOcAAAAASUVORUS5CYII='''))
    except Exception:
        pass

    root.configure(bg="#1e1f22")

    # Header Title Banner
    header_frame = tk.Frame(root, bg="#1e1f22")
    header_frame.pack(fill="x", padx=40, pady=(28, 10))

    title_label = tk.Label(header_frame, text="Discord Data Export Explorer", font=("Segoe UI", 18, "bold"), fg="#f2f3f5", bg="#1e1f22")
    title_label.pack(side="left")

    ver_badge = tk.Label(header_frame, text=f"v{VERSION}", font=("Segoe UI", 9, "bold"), fg="#ffffff", bg="#5865f2", padx=6, pady=2)
    ver_badge.pack(side="left", padx=10)

    sub_label = tk.Label(root, text="Select your unzipped Discord Data Package folder to begin exploring your chat history.", font=("Segoe UI", 10), fg="#949ba4", bg="#1e1f22", justify="left")
    sub_label.pack(anchor="w", padx=40, pady=(0, 20))

    # Main Card Container
    card_frame = tk.Frame(root, bg="#2b2d31", highlightthickness=1, highlightbackground="#3f4248", highlightcolor="#3f4248")
    card_frame.pack(fill="x", padx=40, pady=5, ipady=15)

    card_title = tk.Label(card_frame, text="Data Export Package Directory:", font=("Segoe UI", 10, "bold"), fg="#f2f3f5", bg="#2b2d31")
    card_title.pack(anchor="w", padx=20, pady=(15, 8))

    path_frame = tk.Frame(card_frame, bg="#2b2d31")
    path_frame.pack(fill="x", padx=20)

    path_var = tk.StringVar(value=PACKAGE_DIR)
    entry_path = tk.Entry(path_frame, textvariable=path_var, font=("Segoe UI", 10), bg="#1e1f22", fg="#f2f3f5", insertbackground="#f2f3f5", relief="flat", highlightthickness=1, highlightbackground="#3f4248", highlightcolor="#5865f2")
    entry_path.pack(side="left", fill="x", expand=True, ipady=6, padx=(0, 10))

    def browse_folder():
        chosen = filedialog.askdirectory(title="Select Discord Export Package Folder")
        if chosen:
            path_var.set(chosen)

    btn_browse = tk.Button(path_frame, text="Browse...", font=("Segoe UI", 9, "bold"), bg="#4e5058", fg="#ffffff", activebackground="#6d6f78", activeforeground="#ffffff", relief="flat", cursor="hand2", command=browse_folder, padx=14, pady=4)
    btn_browse.pack(side="right")

    status_var = tk.StringVar(value="Ready to load package." if not PACKAGE_DIR else f"Loaded: {PACKAGE_DIR}")
    status_label = tk.Label(root, textvariable=status_var, font=("Segoe UI", 9, "bold"), fg="#23a55a", bg="#1e1f22")
    status_label.pack(pady=(18, 12))

    def on_launch():
        target = path_var.get().strip()
        if not target or not os.path.exists(target):
            messagebox.showerror("Invalid Folder", "Please select a valid existing Discord Data Export folder.")
            return

        status_var.set("Indexing Discord package...")
        root.update_idletasks()

        success = index_package_data(target)
        if success:
            webbrowser.open(f"http://localhost:{PORT}")
            status_var.set("Application loaded successfully!")
        else:
            messagebox.showerror("Indexing Error", DATA_CACHE["indexing_error"] or "Failed to index package.")
            status_var.set("Indexing failed.")

    btn_launch = tk.Button(root, text="🚀 Launch Explorer in Browser", font=("Segoe UI", 11, "bold"), bg="#5865f2", fg="#ffffff", activebackground="#4752c4", activeforeground="#ffffff", relief="flat", cursor="hand2", command=on_launch, padx=28, pady=8)
    btn_launch.pack(pady=(0, 15))

    root.mainloop()


def main():
    global PACKAGE_DIR, SERVER_THREAD, PORT

    if "--port" in sys.argv:
        port_idx = sys.argv.index("--port")
        if port_idx + 1 < len(sys.argv):
            try:
                PORT = int(sys.argv[port_idx + 1])
            except ValueError:
                pass

    if "--package" in sys.argv:
        package_arg_idx = sys.argv.index("--package")
        if package_arg_idx + 1 < len(sys.argv):
            PACKAGE_DIR = os.path.abspath(sys.argv[package_arg_idx + 1])

    if not PACKAGE_DIR:
        cwd = os.getcwd()
        if os.path.exists(os.path.join(cwd, "Account", "user.json")) or os.path.exists(os.path.join(cwd, "Messages")):
            PACKAGE_DIR = cwd

    SERVER_THREAD = threading.Thread(target=start_http_server, daemon=True)
    SERVER_THREAD.start()

    if PACKAGE_DIR and os.path.exists(PACKAGE_DIR):
        index_package_data(PACKAGE_DIR)

    if "--headless" in sys.argv or "--server" in sys.argv or "--no-gui" in sys.argv:
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
    else:
        try:
            launch_gui()
        except Exception as e:
            print(f"[GUI Notice] Running in background server mode: {e}")
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                pass

if __name__ == "__main__":
    main()
