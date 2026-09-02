#!/usr/bin/env python3
"""Small, dependency-free server for the personal daily board."""

from __future__ import annotations

import html
import json
import os
import re
import threading
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from time import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse
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
        "section": "ai",
        "url": "https://thinkingmachines.ai/index.xml",
        "tone": "coral",
        "description": "Connectionism 研究博客与官方公告",
    },
    {
        "id": "jiqizhixin-zhihu",
        "name": "机器之心 · 知乎",
        "short_name": "机器之心",
        "kind": "zhihu",
        "section": "ai",
        "url": "https://www.zhihu.com/api/v4/columns/jiqizhixin/articles",
        "tone": "teal",
        "description": "中文 AI 文章与论文解读",
    },
    {
        "id": "qbit-zhihu",
        "name": "量子位 · 知乎",
        "short_name": "量子位",
        "kind": "zhihu",
        "section": "ai",
        "slug": "qbitai",
        "url": "https://www.zhihu.com/api/v4/columns/qbitai/articles",
        "tone": "blue",
        "description": "量子位中文 AI 快讯与产业信息",
    },
    {
        "id": "newzyuan-zhihu",
        "name": "新智元 · 知乎",
        "short_name": "新智元",
        "kind": "zhihu",
        "section": "ai",
        "slug": "newzhiyuan",
        "slugs": ["newzhiyuan", "xinzhiyuan", "newzyuan", "newzy", "newai", "aiera"],
        "url": "https://www.zhihu.com/api/v4/columns/newzhiyuan/articles",
        "tone": "coral",
        "description": "新智元中文 AI 资讯与解读",
    },
    {
        "id": "market-tencent",
        "name": "腾讯行情",
        "short_name": "市场行情",
        "kind": "tencent",
        "section": "market",
        "url": "https://qt.gtimg.cn/q=sh000001,sz399001,hkHSI,usINX,usIXIC,hf_GC",
        "tone": "yellow",
        "description": "主要指数与黄金快照",
        "market_scope": "all",
    },
    {
        "id": "market-sectors",
        "name": "东方财富 · 板块",
        "short_name": "板块涨跌",
        "kind": "eastmoney",
        "section": "market",
        "url": "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=30&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f12,f14,f2,f3,f4,f104,f105,f106",
        "tone": "yellow",
        "description": "行业板块领涨领跌与家数",
        "market_scope": "cn",
    },
    {
        "id": "finance-news",
        "name": "金融资讯",
        "short_name": "资讯流",
        "kind": "sample",
        "section": "market",
        "url": "https://xueqiu.com/",
        "tone": "coral",
        "description": "雪球、知乎、东方财富、财新入口",
    },
    {
        "id": "steam-specials",
        "name": "Steam 特惠",
        "short_name": "Steam",
        "kind": "steam",
        "section": "game",
        "subsection": "steam",
        "url": "https://store.steampowered.com/api/featuredcategories?cc=CN&l=schinese",
        "tone": "blue",
        "description": "当前特惠价格与折扣",
    },
    {
        "id": "tft-riot-version",
        "name": "拳头 · 云顶之弈",
        "short_name": "云顶之弈",
        "kind": "tft_live_patch",
        "section": "game",
        "subsection": "tft",
        "url": "https://raw.communitydragon.org/cdragon/tft/en_us.json",
        "data_fallback_url": "https://raw.communitydragon.org/latest/cdragon/tft/en_us.json",
        "data_mirror_url": "https://raw.githubusercontent.com/CommunityDragon/Data/master/cdragon/tft/en_us.json",
        "version_fallback_url": "https://raw.communitydragon.org/api/v1/versions",
        "tone": "teal",
        "description": "CommunityDragon TFT live 数据版本号",
    },
    {
        "id": "tft-riot-meta",
        "name": "Riot API · NA 阵容采样",
        "short_name": "NA 阵容采样",
        "kind": "riot_tft_meta",
        "section": "game",
        "subsection": "tft",
        "tone": "coral",
        "description": "北美高段位对局的阵容统计（需要 RIOT_API_KEY）",
    },
    {
        "id": "nba-scoreboard",
        "name": "NBA 比赛",
        "short_name": "NBA",
        "kind": "nba",
        "section": "sports",
        "url": "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json",
        "tone": "coral",
        "description": "今日赛程与比赛结果",
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
    "qbit-zhihu": [
        {
            "id": "sample-qbit-zhihu",
            "source_id": "qbit-zhihu",
            "source": "量子位 · 知乎",
            "tone": "blue",
            "section": "ai",
            "category": "AI",
            "title": "量子位知乎专栏",
            "summary": "连接成功后显示量子位的最新文章和 AI 产业快讯。",
            "url": "https://zhuanlan.zhihu.com/qbitai",
            "published_at": "2026-09-01T00:00:00+00:00",
            "heat": 0,
            "metrics": {},
            "sample": True,
        },
    ],
    "newzyuan-zhihu": [
        {
            "id": "sample-newzyuan-zhihu",
            "source_id": "newzyuan-zhihu",
            "source": "新智元 · 知乎",
            "tone": "coral",
            "section": "ai",
            "category": "AI",
            "title": "新智元知乎专栏",
            "summary": "连接成功后显示新智元的最新文章和 AI 行业信息。",
            "url": "https://zhuanlan.zhihu.com/newzhiyuan",
            "published_at": "2026-09-01T00:00:00+00:00",
            "heat": 0,
            "metrics": {},
            "sample": True,
        },
    ],
    "market-tencent": [
        {
            "id": "sample-market-sh",
            "source_id": "market-tencent",
            "source": "腾讯行情",
            "tone": "yellow",
            "section": "market",
            "category": "市场",
            "market_scope": "cn",
            "title": "上证指数 · 3,979.89",
            "summary": "最近一次可用快照：-0.16%。实时行情连接后会自动更新。",
            "url": "https://quote.eastmoney.com/center/gridlist.html#hs_a_board",
            "published_at": "2026-09-01T08:05:01+00:00",
            "heat": 0,
            "metrics": {"涨跌%": -0.16},
            "sample": True,
        },
        {
            "id": "sample-market-gold",
            "source_id": "market-tencent",
            "source": "腾讯行情",
            "tone": "yellow",
            "section": "market",
            "category": "市场",
            "market_scope": "gold",
            "title": "COMEX 黄金 · 4,459.70",
            "summary": "黄金期货报价示例。个人看板接入后可继续扩展自选品种。",
            "url": "https://quote.eastmoney.com/center/gridlist.html#futures",
            "published_at": "2026-09-01T08:05:09+00:00",
            "heat": 0,
            "metrics": {"涨跌%": -0.49},
            "sample": True,
        },
        {
            "id": "sample-market-hsi",
            "source_id": "market-tencent",
            "source": "腾讯行情",
            "tone": "yellow",
            "section": "market",
            "category": "市场",
            "market_scope": "hk",
            "title": "恒生指数 · 25,336.75",
            "summary": "最近一次可用快照：-0.90%。数据源恢复后显示实时变动。",
            "url": "https://quote.eastmoney.com/center/gridlist.html#hk_market",
            "published_at": "2026-09-01T07:50:56+00:00",
            "heat": 0,
            "metrics": {"涨跌%": -0.90},
            "sample": True,
        },
    ],
    "market-sectors": [
        {
            "id": "sample-sector-up-1",
            "source_id": "market-sectors",
            "source": "东方财富 · 板块",
            "tone": "yellow",
            "section": "market",
            "category": "板块",
            "market_scope": "cn",
            "sector_side": "up",
            "title": "半导体 · +2.18%",
            "summary": "离线示例：恢复行情连接后显示领涨板块和上涨家数。",
            "url": "https://quote.eastmoney.com/center/boardlist.html#industry_board",
            "published_at": "2026-09-01T08:05:00+00:00",
            "heat": 2.18,
            "metrics": {"涨跌%": 2.18},
            "sample": True,
        },
        {
            "id": "sample-sector-up-2",
            "source_id": "market-sectors",
            "source": "东方财富 · 板块",
            "tone": "yellow",
            "section": "market",
            "category": "板块",
            "market_scope": "cn",
            "sector_side": "up",
            "title": "软件开发 · +1.42%",
            "summary": "离线示例：恢复行情连接后显示板块资金和个股数量。",
            "url": "https://quote.eastmoney.com/center/boardlist.html#industry_board",
            "published_at": "2026-09-01T08:04:00+00:00",
            "heat": 1.42,
            "metrics": {"涨跌%": 1.42},
            "sample": True,
        },
        {
            "id": "sample-sector-down-1",
            "source_id": "market-sectors",
            "source": "东方财富 · 板块",
            "tone": "yellow",
            "section": "market",
            "category": "板块",
            "market_scope": "cn",
            "sector_side": "down",
            "title": "房地产 · -1.76%",
            "summary": "离线示例：恢复行情连接后显示领跌板块和下跌家数。",
            "url": "https://quote.eastmoney.com/center/boardlist.html#industry_board",
            "published_at": "2026-09-01T08:03:00+00:00",
            "heat": 1.76,
            "metrics": {"涨跌%": -1.76},
            "sample": True,
        },
        {
            "id": "sample-sector-down-2",
            "source_id": "market-sectors",
            "source": "东方财富 · 板块",
            "tone": "yellow",
            "section": "market",
            "category": "板块",
            "market_scope": "cn",
            "sector_side": "down",
            "title": "医药商业 · -1.08%",
            "summary": "离线示例：恢复行情连接后显示板块分化。",
            "url": "https://quote.eastmoney.com/center/boardlist.html#industry_board",
            "published_at": "2026-09-01T08:02:00+00:00",
            "heat": 1.08,
            "metrics": {"涨跌%": -1.08},
            "sample": True,
        },
    ],
    "finance-news": [
        {
            "id": "sample-finance-xueqiu",
            "source_id": "finance-news",
            "source": "金融 · 雪球",
            "tone": "coral",
            "section": "market",
            "category": "金融",
            "title": "央行降准释放流动性，权益市场迎来新变化",
            "summary": "市场对于后续货币政策的预期持续发酵，债券、股票板块出现明显分化，机构观点出现分歧。",
            "url": "https://xueqiu.com/",
            "published_at": "2026-09-01T06:51:00+00:00",
            "heat": 7,
            "metrics": {"热点": 7, "深度": 20},
            "sample": True,
        },
        {
            "id": "sample-finance-zhihu",
            "source_id": "finance-news",
            "source": "金融 · 知乎",
            "tone": "teal",
            "section": "market",
            "category": "金融",
            "title": "个人投资者如何应对高波动市场环境",
            "summary": "震荡行情下，择时难度显著加大，普通散户配置思路应当转向均衡分散，降低单一赛道押注风险。",
            "url": "https://www.zhihu.com/search?type=content&q=%E9%87%91%E8%9E%8D",
            "published_at": "2026-09-01T04:01:00+00:00",
            "heat": 21,
            "metrics": {"赞": 21},
            "sample": True,
        },
        {
            "id": "sample-finance-eastmoney",
            "source_id": "finance-news",
            "source": "金融 · 东方财富",
            "tone": "yellow",
            "section": "market",
            "category": "金融",
            "title": "AI 大模型如何重塑券商投研工作流？风险与机遇并存",
            "summary": "智能投研工具快速普及，从财报解析到舆情抓取，AI 深度介入投研全流程，但数据幻觉问题仍然是行业隐患。",
            "url": "https://finance.eastmoney.com/",
            "published_at": "2026-09-01T06:48:00+00:00",
            "heat": 8,
            "metrics": {"赞": 8},
            "sample": True,
        },
        {
            "id": "sample-finance-caixin",
            "source_id": "finance-news",
            "source": "金融 · 财新",
            "tone": "blue",
            "section": "market",
            "category": "金融",
            "title": "公募基金费率改革后续影响推演",
            "summary": "费率下行倒逼基金公司转向管理能力竞争，小基金生存压力加大，行业加速洗牌。",
            "url": "https://www.caixin.com/",
            "published_at": "2026-09-01T04:00:00+00:00",
            "heat": 5,
            "metrics": {"赞": 5},
            "sample": True,
        },
    ],
    "steam-specials": [
        {
            "id": "sample-steam-specials",
            "source_id": "steam-specials",
            "source": "Steam 特惠",
            "tone": "blue",
            "section": "game",
            "subsection": "steam",
            "category": "游戏",
            "title": "Steam 今日特惠",
            "summary": "连接 Steam 商店后显示当前折扣和价格；历史最低价需要额外的价格历史服务。",
            "url": "https://store.steampowered.com/specials/?l=schinese",
            "published_at": "2026-09-01T00:00:00+00:00",
            "heat": 0,
            "metrics": {},
            "sample": True,
        },
    ],
    "nba-scoreboard": [
        {
            "id": "sample-nba-scoreboard",
            "source_id": "nba-scoreboard",
            "source": "NBA 比赛",
            "tone": "coral",
            "section": "sports",
            "category": "竞技",
            "title": "NBA 今日赛果",
            "summary": "连接 NBA 赛果接口后显示今日赛程、比分和比赛状态。",
            "url": "https://www.nba.com/games",
            "published_at": "2026-09-01T00:00:00+00:00",
            "heat": 0,
            "metrics": {},
            "sample": True,
        },
    ],
    "tft-riot-version": [
        {
            "id": "sample-tft-version",
            "source_id": "tft-riot-version",
            "source": "拳头 · 云顶之弈",
            "tone": "teal",
            "section": "game",
            "subsection": "tft",
            "category": "游戏",
            "title": "云顶之弈 · 16.17.1",
            "summary": "离线示例：CommunityDragon TFT live 数据连接后显示当前版本；公告按主版本号定位。",
            "url": "https://teamfighttactics.leagueoflegends.com/zh-cn/news/game-updates/teamfight-tactics-patch-16-17-notes/",
            "published_at": "2026-09-01T00:00:00+00:00",
            "heat": 0,
            "metrics": {},
            "version": "16.17.1",
            "version_source": "离线示例缓存",
            "sample": True,
        },
    ],
}

# Keep the first offline render useful without pretending these are live data.
for sample_index, sample_title in enumerate(
    [
        "当 AI 从工具到认知主体，我们需要警惕哪些新风险？",
        "OpenAI 新付费方式：AI 没把活干完，钱就不用付",
        "少数 Full Attention 层如何重塑内部计算？",
        "今天，人工智能这个学科诞生 70 年了",
        "刚刚，OpenClaw 2.0 来了，龙虾升级",
        "Mac mini 缺货原因找到了！OpenAI、Anthropic 都在抢",
        "为 Agent 重造一台游戏引擎",
        "Astra 接管 OpenAI？第三代智能体文明的新模型",
        "惊！AI 开始亲自动手做实验了",
        "Claude 安全机制大翻车？",
    ],
    start=1,
):
    SAMPLE_ITEMS["jiqizhixin-zhihu"].append(
        {
            "id": f"sample-zhihu-extra-{sample_index}",
            "source_id": "jiqizhixin-zhihu",
            "source": "机器之心 · 知乎",
            "tone": "teal",
            "section": "ai",
            "category": "AI",
            "title": sample_title,
            "summary": "离线示例缓存。恢复网络后会被知乎专栏的实时文章替换。",
            "url": "https://zhuanlan.zhihu.com/jiqizhixin",
            "published_at": f"2026-09-01T02:{sample_index:02d}:00+00:00",
            "heat": 0,
            "metrics": {},
            "sample": True,
        }
    )


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


def fetch_bytes(url: str, accept: str, timeout: float = 15, extra_headers: dict[str, str] | None = None) -> bytes:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": accept,
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    if extra_headers:
        headers.update(extra_headers)
    request = Request(
        url,
        headers=headers,
    )
    with urlopen(request, timeout=timeout) as response:
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
                "section": config["section"],
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
                "section": config["section"],
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


MARKET_NAMES = {
    "sh000001": "上证指数",
    "sz399001": "深证成指",
    "hkHSI": "恒生指数",
    "usINX": "标普 500",
    "usIXIC": "纳斯达克",
    "hf_GC": "COMEX 黄金",
}


def parse_tencent(raw: bytes, config: dict) -> list[dict]:
    text = raw.decode("gbk", errors="replace")
    items: list[dict] = []
    for match in re.finditer(r'v_([A-Za-z0-9_]+)="([^"]*)";', text):
        code, value = match.groups()
        fields = value.split("~") if "~" in value else value.split(",")
        if not fields or len(fields) < 2:
            continue
        name = MARKET_NAMES.get(code, fields[1] if "~" in value else code)
        try:
            current = float(fields[3] if "~" in value else fields[0])
        except (TypeError, ValueError, IndexError):
            continue
        if "~" in value:
            try:
                change = float(fields[31])
                change_pct = float(fields[32])
                stamp = fields[30]
            except (TypeError, ValueError, IndexError):
                change = 0.0
                change_pct = 0.0
                stamp = ""
        else:
            try:
                change = float(fields[1])
                change_pct = change / (current - change) * 100 if current != change else 0.0
            except (TypeError, ValueError, IndexError, ZeroDivisionError):
                change = 0.0
                change_pct = 0.0
            stamp = fields[6] if len(fields) > 6 else ""
        try:
            if re.fullmatch(r"\d{14}", stamp):
                dt = datetime.strptime(stamp, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
                published = dt.isoformat()
            else:
                published = datetime.now(timezone.utc).isoformat()
        except ValueError:
            published = datetime.now(timezone.utc).isoformat()
        items.append(
            {
                "id": f"{config['id']}-{code}",
                "source_id": config["id"],
                "source": config["name"],
                "tone": config["tone"],
                "section": config["section"],
                "category": "市场",
                "market_scope": "cn" if code.startswith(("sh", "sz")) else "hk" if code.startswith("hk") else "us" if code.startswith("us") else "gold" if code.startswith("hf_") else "other",
                "title": f"{name} · {current:,.2f}",
                "summary": f"最新变动 {change:+.2f}，涨跌幅 {change_pct:+.2f}%",
                "url": "https://quote.eastmoney.com/center/gridlist.html#hs_a_board",
                "published_at": published,
                "heat": abs(change_pct),
                "metrics": {"涨跌%": round(change_pct, 2)},
            }
        )
    return items


def parse_eastmoney(raw: bytes, config: dict) -> list[dict]:
    payload = json.loads(raw.decode("utf-8"))
    rows = payload.get("data", {}).get("diff", []) if isinstance(payload, dict) else []
    if isinstance(rows, dict):
        rows = list(rows.values())
    items: list[dict] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        name = str(row.get("f14") or row.get("name") or "板块")
        try:
            pct = float(row.get("f3"))
        except (TypeError, ValueError):
            continue
        up_count = int(row.get("f104") or 0)
        down_count = int(row.get("f105") or 0)
        flat_count = int(row.get("f106") or 0)
        code = str(row.get("f12") or name)
        side = "up" if pct >= 0 else "down"
        items.append(
            {
                "id": f"{config['id']}-{code}",
                "source_id": config["id"],
                "source": config["name"],
                "tone": config["tone"],
                "section": config["section"],
                "category": "板块",
                "market_scope": config.get("market_scope", "cn"),
                "sector_side": side,
                "title": f"{name} · {pct:+.2f}%",
                "summary": f"上涨 {up_count} · 下跌 {down_count} · 平盘 {flat_count}",
                "url": "https://quote.eastmoney.com/center/boardlist.html#industry_board",
                "published_at": datetime.now(timezone.utc).isoformat(),
                "heat": abs(pct),
                "metrics": {"涨跌%": round(pct, 2), "上涨家数": up_count, "下跌家数": down_count},
            }
        )
    return sorted(items, key=lambda item: item["heat"], reverse=True)[:30]


def parse_steam(raw: bytes, config: dict) -> list[dict]:
    payload = json.loads(raw.decode("utf-8"))
    items: list[dict] = []
    seen: set[str] = set()
    for group in payload.values() if isinstance(payload, dict) else []:
        for entry in group.get("items", []) if isinstance(group, dict) else []:
            app_id = str(entry.get("id") or "")
            discount = int(entry.get("discount_percent") or 0)
            if not app_id or app_id in seen or discount <= 0:
                continue
            seen.add(app_id)
            final_price = entry.get("final_price")
            original_price = entry.get("original_price")
            price = f"¥{final_price / 100:.2f}" if isinstance(final_price, (int, float)) else "特惠"
            original = f"，原价 ¥{original_price / 100:.2f}" if isinstance(original_price, (int, float)) else ""
            items.append(
                {
                    "id": f"{config['id']}-{app_id}",
                    "source_id": config["id"],
                    "source": config["name"],
                    "tone": config["tone"],
                    "section": config["section"],
                    "subsection": config.get("subsection"),
                    "category": "游戏",
                    "title": entry.get("name") or "Steam 特惠",
                    "summary": f"折扣 {discount}% · {price}{original}",
                    "url": entry.get("url") or f"https://store.steampowered.com/app/{app_id}",
                    "published_at": datetime.now(timezone.utc).isoformat(),
                    "heat": discount,
                    "metrics": {"折扣%": discount},
                    "discount_percent": discount,
                    "final_price": final_price,
                    "original_price": original_price,
                    "image_url": entry.get("header_image") or "",
                }
            )
            if len(items) >= 20:
                return items
    return items


def _tft_collection(payload: dict, aliases: tuple[str, ...]) -> list:
    """Find a named TFT collection at the top level or in setData."""
    containers = [payload]
    set_data = payload.get("setData")
    if isinstance(set_data, dict):
        containers.extend(value for value in set_data.values() if isinstance(value, dict))
    elif isinstance(set_data, list):
        containers.extend(value for value in set_data if isinstance(value, dict))
    for container in containers:
        for key in aliases:
            value = container.get(key)
            if isinstance(value, list):
                return value
            if isinstance(value, dict):
                return list(value.values())
    return []


def _tft_entry_names(entries: list) -> list[str]:
    names: list[str] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name") or entry.get("displayName") or entry.get("characterName") or entry.get("apiName")
        if name and str(name) not in names:
            names.append(str(name))
    return names


def _tft_entry_name(entry: dict) -> str:
    return str(entry.get("name") or entry.get("displayName") or entry.get("characterName") or entry.get("apiName") or "未知")


def _tft_api_name(entry: dict) -> str:
    return str(entry.get("apiName") or entry.get("api_name") or "").lower()


def _tft_traits(entry: dict) -> list[str]:
    values = entry.get("traits") or entry.get("associatedTraits") or entry.get("synergies") or []
    if isinstance(values, dict):
        values = list(values.values())
    names: list[str] = []
    for value in values if isinstance(values, list) else []:
        if isinstance(value, dict):
            value = value.get("name") or value.get("displayName") or value.get("apiName")
        if value and str(value) not in names:
            names.append(str(value))
    return names


def _tft_is_unit(entry: dict) -> bool:
    name = _tft_entry_name(entry).lower()
    api_name = _tft_api_name(entry)
    if any(token in name for token in ("training dummy", "rift scuttler", "voidspawn")):
        return False
    if "summon" in api_name or "dummy" in api_name or "scuttle" in api_name:
        return False
    cost = entry.get("cost") or entry.get("tier")
    if isinstance(cost, (int, float)):
        return cost > 0
    return bool(_tft_traits(entry)) and bool(entry.get("stats"))


def _tft_is_augment(entry: dict) -> bool:
    name = _tft_entry_name(entry).lower()
    api_name = _tft_api_name(entry)
    return "augment" in api_name or name.startswith("trait:") or name.endswith(" crown") or " crown" in name


def _tft_is_item(entry: dict) -> bool:
    api_name = _tft_api_name(entry)
    return not _tft_is_augment(entry) and (bool(entry.get("composition")) or "_item_" in api_name or api_name.startswith("item_"))


def parse_tft_live_patch(raw: bytes, config: dict, require_version: bool = True) -> list[dict]:
    """Read the live TFT data version, rather than the League client version list."""
    payload = json.loads(raw.decode("utf-8"))
    if isinstance(payload, list):
        candidates = [str(payload[0])] if payload else []
    elif isinstance(payload, dict):
        version_list = payload.get("versions") or payload.get("data")
        candidates = [str(version_list[0])] if isinstance(version_list, list) and version_list else []
    else:
        raise ValueError("CommunityDragon TFT response has an unsupported shape")

    for container in (payload, payload.get("metadata"), payload.get("versionInfo")) if isinstance(payload, dict) else ():
        if not isinstance(container, dict):
            continue
        for key in ("version", "gameVersion", "patchVersion", "patch"):
            value = container.get(key)
            if value is not None:
                candidates.append(str(value))
    version = next(
        (match.group(0) for value in candidates for match in [re.search(r"\d+\.\d+(?:\.\d+)?", value)] if match),
        None,
    )
    if not version and require_version:
        raise ValueError("CommunityDragon TFT version is missing")
    version = version or "待同步"
    major_minor = ".".join(version.split(".")[:2]) if version != "待同步" else ""
    patch_url = f"https://teamfighttactics.leagueoflegends.com/zh-cn/news/game-updates/teamfight-tactics-patch-{major_minor.replace('.', '-')}-notes/" if major_minor else "https://teamfighttactics.leagueoflegends.com/zh-cn/news/game-updates/"
    collections = {
        "英雄": ("champions", "units", "characters"),
        "装备": ("items", "itemData"),
        "羁绊": ("traits", "synergies"),
        "强化符文": ("augments", "enhancements"),
    }
    data_counts: dict[str, int] = {}
    data_samples: dict[str, list[str]] = {}
    raw_units = _tft_collection(payload, collections["英雄"]) if isinstance(payload, dict) else []
    raw_items = _tft_collection(payload, collections["装备"]) if isinstance(payload, dict) else []
    raw_traits = _tft_collection(payload, collections["羁绊"]) if isinstance(payload, dict) else []
    raw_augments = _tft_collection(payload, collections["强化符文"]) if isinstance(payload, dict) else []
    units = [entry for entry in raw_units if isinstance(entry, dict) and _tft_is_unit(entry)]
    equipment = [entry for entry in raw_items if isinstance(entry, dict) and _tft_is_item(entry)]
    augments = [entry for entry in raw_augments if isinstance(entry, dict) and _tft_is_augment(entry)]
    if not augments:
        augments = [entry for entry in raw_items if isinstance(entry, dict) and _tft_is_augment(entry)]
    filtered_collections = {"英雄": units, "装备": equipment, "羁绊": raw_traits, "强化符文": augments}
    for label, entries in filtered_collections.items():
        if entries:
            data_counts[label] = len(entries)
            data_samples[label] = _tft_entry_names(entries)[:6]
    unit_details = []
    trait_members: dict[str, list[str]] = {}
    for entry in units:
        name = _tft_entry_name(entry)
        cost = entry.get("cost") or entry.get("tier")
        traits = _tft_traits(entry)
        unit_details.append({"name": name, "api_name": entry.get("apiName") or entry.get("api_name") or "", "cost": cost if isinstance(cost, (int, float)) else None, "traits": traits})
        for trait in traits:
            trait_members.setdefault(trait, []).append(name)
    unit_details.sort(key=lambda item: (item["cost"] is None, item["cost"] or 0, item["name"]))
    lineups = [
        {"name": trait, "units": members[:12]}
        for trait, members in sorted(trait_members.items(), key=lambda pair: (-len(pair[1]), pair[0]))
        if len(members) >= 2
    ][:10]
    return [
        {
            "id": f"{config['id']}-{version}",
            "source_id": config["id"],
            "source": config["name"],
            "tone": config["tone"],
            "section": config["section"],
            "subsection": config.get("subsection"),
            "category": "游戏",
            "title": f"云顶之弈 · {version}",
            "summary": f"CommunityDragon TFT live 数据版本。官方公告通常按 {major_minor or '主版本'} 命名，小版本后缀可能不同。",
            "url": patch_url,
            "published_at": datetime.now(timezone.utc).isoformat(),
            "heat": 0,
            "metrics": {},
            "version": version if version != "待同步" else "",
            "patch_url": patch_url,
            "version_source": "CommunityDragon TFT live",
            "tft_data": {"counts": data_counts, "samples": data_samples, "units": unit_details[:60], "lineups": lineups},
        }
    ]


def _riot_json(url: str, api_key: str) -> dict | list:
    raw = fetch_bytes(
        url,
        "application/json, text/plain;q=0.9",
        timeout=10,
        extra_headers={"X-Riot-Token": api_key},
    )
    payload = json.loads(raw.decode("utf-8"))
    if not isinstance(payload, (dict, list)):
        raise ValueError("Riot API response has an unsupported shape")
    return payload


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        return max(minimum, min(maximum, int(os.getenv(name, str(default)))))
    except ValueError:
        return default


def _friendly_tft_unit_name(character_id: str, static_units: dict[str, str]) -> str:
    if character_id in static_units:
        return static_units[character_id]
    for key, value in static_units.items():
        if key.lower() == character_id.lower():
            return value
    fallback = re.sub(r"^TFT\d*_", "", character_id, flags=re.IGNORECASE)
    return fallback.replace("_", " ") or character_id


def fetch_riot_tft_meta(config: dict, static_units: dict[str, str]) -> list[dict]:
    """Sample NA high-elo matches and calculate transparent composition stats."""
    api_key = os.getenv("RIOT_API_KEY", "").strip()
    if not api_key:
        raise ValueError("RIOT_API_KEY is not configured")
    platform = os.getenv("RIOT_TFT_PLATFORM", "na1").strip().lower() or "na1"
    routing = os.getenv("RIOT_TFT_ROUTING", "americas").strip().lower() or "americas"
    player_limit = _env_int("RIOT_TFT_PLAYERS", 8, 1, 20)
    match_limit = _env_int("RIOT_TFT_MATCHES", 50, 1, 100)
    ids_per_player = _env_int("RIOT_TFT_MATCH_IDS_PER_PLAYER", 20, 1, 20)

    ladder = _riot_json(f"https://{platform}.api.riotgames.com/tft/league/v1/challenger", api_key)
    entries = ladder.get("entries", []) if isinstance(ladder, dict) else []
    puuids = [value.strip() for value in os.getenv("RIOT_TFT_PUUIDS", "").split(",") if value.strip()]
    for entry in entries[:player_limit]:
        summoner_id = entry.get("summonerId") if isinstance(entry, dict) else None
        if not summoner_id:
            continue
        summoner = _riot_json(f"https://{platform}.api.riotgames.com/tft/summoner/v1/summoners/{quote(str(summoner_id), safe='')}", api_key)
        if isinstance(summoner, dict) and summoner.get("puuid"):
            puuids.append(str(summoner["puuid"]))
        if len(puuids) >= player_limit:
            break
    puuids = list(dict.fromkeys(puuids))[:player_limit]
    if not puuids:
        raise ValueError("Riot API returned no NA TFT PUUIDs")

    match_ids: list[str] = []
    for puuid in puuids:
        response = _riot_json(
            f"https://{routing}.api.riotgames.com/tft/match/v1/matches/by-puuid/{quote(puuid, safe='')}/ids?start=0&count={ids_per_player}",
            api_key,
        )
        if isinstance(response, list):
            match_ids.extend(str(match_id) for match_id in response)
    match_ids = list(dict.fromkeys(match_ids))[:match_limit]
    if not match_ids:
        raise ValueError("Riot API returned no recent NA TFT matches")

    records: list[tuple[str, dict]] = []
    version_counts: dict[str, int] = {}
    for match_id in match_ids:
        match = _riot_json(f"https://{routing}.api.riotgames.com/tft/match/v1/matches/{quote(match_id, safe='')}", api_key)
        info = match.get("info", {}) if isinstance(match, dict) else {}
        version = str(info.get("game_version") or "unknown")
        participants = info.get("participants", []) if isinstance(info, dict) else []
        for participant in participants:
            if not isinstance(participant, dict):
                continue
            try:
                placement = int(participant.get("placement"))
            except (TypeError, ValueError):
                continue
            units = participant.get("units") or []
            if placement < 1 or placement > 8 or not isinstance(units, list) or len(units) < 3:
                continue
            records.append((version, participant))
            version_counts[version] = version_counts.get(version, 0) + 1
    if not records:
        raise ValueError("Riot API matches contained no finished TFT participants")

    requested_patch = os.getenv("RIOT_TFT_PATCH", "").strip()
    target_version = requested_patch or max(version_counts, key=version_counts.get)
    selected_records = [
        (version, participant)
        for version, participant in records
        if version == target_version or version.startswith(f"{target_version}.") or target_version.startswith(f"{version}.")
    ]
    if not selected_records:
        selected_records = records
        target_version = "多版本混合"

    compositions: dict[str, dict] = {}
    for _, participant in selected_records:
        names: dict[str, str] = {}
        for unit in participant.get("units", []):
            if not isinstance(unit, dict):
                continue
            character_id = str(unit.get("character_id") or unit.get("name") or "")
            if character_id:
                names[character_id] = _friendly_tft_unit_name(character_id, static_units)
        if len(names) < 3:
            continue
        key = "|".join(sorted(names))
        comp = compositions.setdefault(key, {"units": sorted(names.values()), "games": 0, "wins": 0, "top4": 0, "placement_sum": 0})
        placement = int(participant.get("placement", 8))
        comp["games"] += 1
        comp["wins"] += placement == 1
        comp["top4"] += placement <= 4
        comp["placement_sum"] += placement

    min_games = _env_int("RIOT_TFT_MIN_GAMES", 2, 1, 50)
    ranked = []
    for comp in compositions.values():
        if comp["games"] < min_games:
            continue
        games = comp["games"]
        ranked.append({
            "units": comp["units"],
            "games": games,
            "win_rate": round(comp["wins"] / games * 100, 1),
            "top4_rate": round(comp["top4"] / games * 100, 1),
            "avg_placement": round(comp["placement_sum"] / games, 2),
        })
    ranked.sort(key=lambda comp: (-comp["top4_rate"], -comp["win_rate"], -comp["games"], comp["avg_placement"]))
    ranked = ranked[:10]
    sample_count = len(selected_records)
    summary = f"NA 高段位采样 · {target_version} · {sample_count} 名玩家对局记录"
    return [
        {
            "id": f"{config['id']}-{target_version}",
            "source_id": config["id"],
            "source": config["name"],
            "tone": config["tone"],
            "section": config["section"],
            "subsection": config.get("subsection"),
            "category": "游戏",
            "title": f"NA 阵容排行 · {target_version}",
            "summary": summary,
            "url": "https://developer.riotgames.com/apis#tft-match-v1",
            "published_at": datetime.now(timezone.utc).isoformat(),
            "heat": ranked[0]["top4_rate"] if ranked else 0,
            "metrics": {"样本": sample_count, "阵容": len(ranked)},
            "tft_meta": {"region": "NA", "patch": target_version, "sample_games": sample_count, "comps": ranked},
        }
    ]


def parse_nba(raw: bytes, config: dict) -> list[dict]:
    payload = json.loads(raw.decode("utf-8"))
    games = payload.get("scoreboard", {}).get("games", [])
    items: list[dict] = []
    for game in games:
        home = game.get("homeTeam", {})
        away = game.get("awayTeam", {})
        status = game.get("gameStatusText") or game.get("gameStatus", "")
        home_score = home.get("score", "-")
        away_score = away.get("score", "-")
        home_name = home.get("teamTricode") or home.get("teamName") or "主队"
        away_name = away.get("teamTricode") or away.get("teamName") or "客队"
        game_id = game.get("gameId") or f"{away_name}-{home_name}"
        items.append(
            {
                "id": f"{config['id']}-{game_id}",
                "source_id": config["id"],
                "source": config["name"],
                "tone": config["tone"],
                "section": config["section"],
                "category": "竞技",
                "title": f"{away_name} {away_score} : {home_score} {home_name}",
                "summary": status or "今日赛程",
                "url": "https://www.nba.com/games",
                "published_at": parse_date(game.get("gameTimeUTC") or game.get("gameEt")),
                "heat": 0,
                "metrics": {},
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
        static_unit_names: dict[str, str] = {}
        # Start from the last good cache so a temporary outage cannot erase it.
        updated_cache = {"sources": dict(disk_cache.get("sources", {}))}

        for config in SOURCE_CONFIG:
            source_id = config["id"]
            try:
                if config["kind"] == "rss":
                    raw = fetch_bytes(config["url"], "application/rss+xml, application/xml, text/xml;q=0.9")
                    items = parse_rss(raw, config)
                elif config["kind"] == "zhihu":
                    params = {
                        "include": "data[*].title,url,created,updated,excerpt,voteup_count,comment_count,image_url",
                        "limit": "20",
                        "offset": "0",
                    }
                    slugs = config.get("slugs") or [config.get("slug", "")]
                    items = []
                    candidate_errors: list[str] = []
                    for slug in slugs:
                        if not slug:
                            continue
                        candidate_url = f"https://www.zhihu.com/api/v4/columns/{slug}/articles?{urlencode(params)}"
                        try:
                            raw = fetch_bytes(candidate_url, "application/json, text/plain;q=0.9")
                            candidate_items = parse_zhihu(raw, config)
                            if candidate_items:
                                items = candidate_items
                                break
                            candidate_errors.append(f"{slug}: empty")
                        except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError, UnicodeError, ValueError) as candidate_exc:
                            candidate_errors.append(f"{slug}: {candidate_exc}")
                    if not items:
                        raise ValueError("; ".join(candidate_errors)[:500] or "no Zhihu column candidates")
                elif config["kind"] == "tencent":
                    raw = fetch_bytes(config["url"], "text/plain, */*;q=0.9")
                    items = parse_tencent(raw, config)
                elif config["kind"] == "eastmoney":
                    # Eastmoney's `po` parameter controls sort direction. Fetch both
                    # ends so a strong bull day cannot hide the losing sectors.
                    urls = [config["url"], re.sub(r"([?&])po=1(?:&|$)", r"\1po=0&", config["url"], count=1)]
                    merged: dict[str, dict] = {}
                    sector_errors: list[Exception] = []
                    for sector_url in dict.fromkeys(urls):
                        try:
                            raw = fetch_bytes(sector_url, "application/json, text/plain;q=0.9")
                            for item in parse_eastmoney(raw, config):
                                key = item["id"]
                                existing = merged.get(key)
                                if existing is None or abs(item["metrics"].get("涨跌%", 0)) > abs(existing["metrics"].get("涨跌%", 0)):
                                    merged[key] = item
                        except (HTTPError, URLError, TimeoutError, OSError, ET.ParseError, json.JSONDecodeError, UnicodeError, ValueError) as sector_exc:
                            sector_errors.append(sector_exc)
                    if not merged and sector_errors:
                        raise sector_errors[0]
                    items = sorted(merged.values(), key=lambda item: item["metrics"].get("涨跌%", 0), reverse=True)
                elif config["kind"] == "steam":
                    raw = fetch_bytes(config["url"], "application/json, text/plain;q=0.9")
                    items = parse_steam(raw, config)
                elif config["kind"] == "nba":
                    raw = fetch_bytes(config["url"], "application/json, text/plain;q=0.9")
                    items = parse_nba(raw, config)
                elif config["kind"] == "tft_live_patch":
                    data_items: list[dict] | None = None
                    data_errors: list[Exception] = []
                    data_urls = [config["url"], config.get("data_fallback_url"), config.get("data_mirror_url")]
                    for data_url in dict.fromkeys(url for url in data_urls if url):
                        try:
                            raw = fetch_bytes(data_url, "application/json, text/plain;q=0.9", timeout=8)
                            candidate_items = parse_tft_live_patch(raw, config, require_version=False)
                            if data_items is None:
                                data_items = candidate_items
                            candidate_data = candidate_items[0].get("tft_data", {}).get("counts", {})
                            current_data = data_items[0].get("tft_data", {}).get("counts", {})
                            if len(candidate_data) > len(current_data):
                                data_items = candidate_items
                            if candidate_data:
                                break
                        except (HTTPError, URLError, TimeoutError, OSError, ET.ParseError, json.JSONDecodeError, UnicodeError, ValueError) as data_exc:
                            data_errors.append(data_exc)
                    if data_items is None:
                        raise data_errors[0] if data_errors else ValueError("TFT live data is empty")
                    items = data_items
                    if not items[0].get("version"):
                        fallback_url = config.get("version_fallback_url")
                        if fallback_url:
                            try:
                                fallback_raw = fetch_bytes(fallback_url, "application/json, text/plain;q=0.9", timeout=8)
                                version_items = parse_tft_live_patch(fallback_raw, config)
                                version_items[0]["tft_data"] = items[0].get("tft_data", {})
                                items = version_items
                                for item in items:
                                    item["version_source"] = "CommunityDragon patch index（回退）"
                                    item["summary"] = "CommunityDragon 版本索引回退值。官方公告通常按主版本命名，小版本后缀可能不同。"
                            except (HTTPError, URLError, TimeoutError, OSError, ET.ParseError, json.JSONDecodeError, UnicodeError, ValueError):
                                items[0]["version_source"] = "CommunityDragon TFT live（版本字段缺失）"
                    for unit in items[0].get("tft_data", {}).get("units", []):
                        if isinstance(unit, dict) and unit.get("api_name") and unit.get("name"):
                            static_unit_names[str(unit["api_name"])] = str(unit["name"])
                elif config["kind"] == "riot_tft_meta":
                    items = fetch_riot_tft_meta(config, static_unit_names)
                elif config["kind"] == "sample":
                    raise ValueError("sample-only source")
                else:
                    items = []
                items = items[:60] if config["kind"] == "eastmoney" else items[:30]
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
                {
                    "id": c["id"],
                    "name": c["name"],
                    "short_name": c["short_name"],
                    "section": c["section"],
                    "description": c["description"],
                    "url": c["url"],
                }
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
