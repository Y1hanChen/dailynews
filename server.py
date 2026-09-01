#!/usr/bin/env python3
"""Small, dependency-free server for the personal daily board."""

from __future__ import annotations

import html
import json
import re
import threading
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from time import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlencode, urlparse
from urllib.request import Request, urlopen
import mimetypes
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


BASE_DIR = Path(__file__).resolve().parent
CACHE_FILE = BASE_DIR / ".cache.json"
CACHE_TTL_SECONDS = 15 * 60
USER_AGENT = "DailyBoard/0.1 (personal use; RSS reader)"

SOURCE_CONFIG = [
    {
        "id": "thinking-machines",
        "name": "Thinking Machines Lab",
        "short_name": "Thinking Machines",
        "kind": "rss",
        "url": "https://thinkingmachines.ai/index.xml",
        "tone": "coral",
        "description": "Connectionism 研究博客与官方公告",
    },
    {
        "id": "jiqizhixin-zhihu",
        "name": "机器之心 · 知乎",
        "short_name": "机器之心",
        "kind": "zhihu",
        "url": "https://www.zhihu.com/api/v4/columns/jiqizhixin/articles",
        "tone": "teal",
        "description": "中文 AI 文章与论文解读",
    },
]

SAMPLE_ITEMS = {
    "thinking-machines": [
        {
            "id": "sample-thinking-machines-1",
            "source_id": "thinking-machines",
            "source": "Thinking Machines Lab",
            "tone": "coral",
            "category": "AI",
            "title": "A Safe Path to Open Weights",
            "summary": "Thinking Machines Lab 分享开放权重模型的安全发布路径与评估框架。",
            "url": "https://thinkingmachines.ai/blog/a-safe-path-to-open-weights/",
            "published_at": "2026-07-31T00:00:00+00:00",
            "heat": 0,
            "metrics": {},
            "sample": True,
        },
        {
            "id": "sample-thinking-machines-2",
            "source_id": "thinking-machines",
            "source": "Thinking Machines Lab",
            "tone": "coral",
            "category": "AI",
            "title": "Interaction Models: A Scalable Approach to Human-AI Collaboration",
            "summary": "关于让 AI 在多模态、实时交互中成为更好协作者的研究思路。",
            "url": "https://thinkingmachines.ai/blog/interaction-models/",
            "published_at": "2026-05-11T00:00:00+00:00",
            "heat": 0,
            "metrics": {},
            "sample": True,
        },
    ],
    "jiqizhixin-zhihu": [
        {
            "id": "sample-zhihu-1",
            "source_id": "jiqizhixin-zhihu",
            "source": "机器之心 · 知乎",
            "tone": "teal",
            "category": "AI",
            "title": "Runway 把世界模型做成了操作系统！不用代码直接生成界面",
            "summary": "机器之心知乎专栏示例内容。连接数据源后会替换为实时文章。",
            "url": "https://zhuanlan.zhihu.com/jiqizhixin",
            "published_at": "2026-09-01T02:00:00+00:00",
            "heat": 0,
            "metrics": {},
            "sample": True,
        },
    ],
}


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def text(self) -> str:
        return re.sub(r"\s+", " ", html.unescape(" ".join(self.parts))).strip()


def strip_html(value: str | None, max_length: int = 320) -> str:
    if not value:
        return ""
    parser = TextExtractor()
    try:
        parser.feed(value)
        text = parser.text()
    except Exception:
        text = re.sub(r"<[^>]+>", " ", html.unescape(value))
        text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= max_length else text[: max_length - 1].rstrip() + "…"


def element_text(parent: ET.Element, name: str, namespace: str | None = None) -> str:
    node = parent.find(f"{{{namespace}}}{name}" if namespace else name)
    return (node.text or "").strip() if node is not None and node.text else ""


def parse_date(value: str | int | float | None) -> str:
    try:
        if isinstance(value, (int, float)):
            dt = datetime.fromtimestamp(value, tz=timezone.utc)
        else:
            dt = parsedate_to_datetime(str(value))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            dt = dt.astimezone(timezone.utc)
        return dt.isoformat()
    except (TypeError, ValueError, OverflowError):
        return datetime.now(timezone.utc).isoformat()


def fetch_bytes(url: str, accept: str) -> bytes:
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": accept,
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
    )
    with urlopen(request, timeout=15) as response:
        return response.read()


def parse_rss(raw: bytes, config: dict) -> list[dict]:
    root = ET.fromstring(raw)
    content_ns = "http://purl.org/rss/1.0/modules/content/"
    items: list[dict] = []
    for node in root.findall(".//item"):
        title = element_text(node, "title")
        link = element_text(node, "link")
        guid = element_text(node, "guid") or link or title
        published = element_text(node, "pubDate") or element_text(node, "date")
        description = element_text(node, "description")
        encoded = element_text(node, "encoded", content_ns)
        summary = strip_html(description or encoded)
        items.append(
            {
                "id": guid,
                "source_id": config["id"],
                "source": config["name"],
                "tone": config["tone"],
                "category": "AI",
                "title": html.unescape(title),
                "summary": summary,
                "url": link,
                "published_at": parse_date(published),
                "heat": 0,
                "metrics": {},
            }
        )
    return items


def parse_zhihu(raw: bytes, config: dict) -> list[dict]:
    payload = json.loads(raw.decode("utf-8"))
    items: list[dict] = []
    for entry in payload.get("data", []):
        title = strip_html(entry.get("title"), 180)
        url = entry.get("url") or ""
        voteups = int(entry.get("voteup_count") or 0)
        comments = int(entry.get("comment_count") or 0)
        items.append(
            {
                "id": url or f"zhihu-{entry.get('id', title)}",
                "source_id": config["id"],
                "source": config["name"],
                "tone": config["tone"],
                "category": "AI",
                "title": title,
                "summary": strip_html(entry.get("excerpt"), 320),
                "url": url,
                "published_at": parse_date(entry.get("created")),
                "heat": voteups + comments * 2,
                "metrics": {"赞": voteups, "评": comments},
                "image_url": entry.get("image_url") or "",
            }
        )
    return items


def load_disk_cache() -> dict:
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return {}


def save_disk_cache(cache: dict) -> None:
    temporary = CACHE_FILE.with_suffix(".tmp")
    try:
        temporary.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        temporary.replace(CACHE_FILE)
    except OSError:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


cache_lock = threading.Lock()
memory_cache: dict | None = None


def build_payload(force: bool = False) -> dict:
    global memory_cache
    now = time()
    with cache_lock:
        if not force and memory_cache and now - memory_cache["fetched_epoch"] < CACHE_TTL_SECONDS:
            return memory_cache["payload"]

        disk_cache = load_disk_cache()
        all_items: list[dict] = []
        statuses: list[dict] = []
        updated_cache = {"sources": {}}

        for config in SOURCE_CONFIG:
            source_id = config["id"]
            try:
                if config["kind"] == "rss":
                    raw = fetch_bytes(config["url"], "application/rss+xml, application/xml, text/xml;q=0.9")
                    items = parse_rss(raw, config)
                else:
                    params = {
                        "include": "data[*].title,url,created,updated,excerpt,voteup_count,comment_count,image_url",
                        "limit": "20",
                        "offset": "0",
                    }
                    raw = fetch_bytes(f"{config['url']}?{urlencode(params)}", "application/json, text/plain;q=0.9")
                    items = parse_zhihu(raw, config)
                items = items[:30]
                updated_cache["sources"][source_id] = {"items": items, "saved_at": now}
                statuses.append({"id": source_id, "name": config["short_name"], "state": "live", "count": len(items)})
            except (HTTPError, URLError, TimeoutError, OSError, ET.ParseError, json.JSONDecodeError, UnicodeError, ValueError) as exc:
                cached = disk_cache.get("sources", {}).get(source_id, {})
                items = cached.get("items") or SAMPLE_ITEMS.get(source_id, [])
                state = "cached" if cached.get("items") else "sample"
                statuses.append(
                    {
                        "id": source_id,
                        "name": config["short_name"],
                        "state": state,
                        "count": len(items),
                        "error": str(exc)[:140],
                    }
                )
            all_items.extend(items)

        all_items.sort(key=lambda item: item.get("published_at", ""), reverse=True)
        payload = {
            "items": all_items,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "statuses": statuses,
            "sources": [
                {"id": c["id"], "name": c["name"], "description": c["description"], "url": c["url"]}
                for c in SOURCE_CONFIG
            ],
        }
        memory_cache = {"fetched_epoch": now, "payload": payload}
        save_disk_cache(updated_cache)
        return payload


class DashboardHandler(BaseHTTPRequestHandler):
    server_version = "DailyBoard/0.1"

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/dashboard":
            query = parse_qs(parsed.query)
            payload = build_payload(force=query.get("refresh", ["0"])[0] == "1")
            self.send_json(payload)
            return
        if parsed.path == "/api/health":
            self.send_json({"ok": True, "service": "daily-board"})
            return
        self.send_static(parsed.path)

    def send_json(self, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_static(self, request_path: str) -> None:
        relative = unquote(request_path.lstrip("/")) or "index.html"
        if relative.startswith(".") or "/." in relative:
            self.send_error(404)
            return
        target = (BASE_DIR / relative).resolve()
        if target != BASE_DIR and BASE_DIR not in target.parents:
            self.send_error(404)
            return
        if not target.is_file():
            self.send_error(404)
            return
        body = target.read_bytes()
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or target.suffix in {".js", ".css"}:
            content_type += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Run the personal daily board")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), DashboardHandler)
    print(f"Daily board: http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\\nStopping")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
