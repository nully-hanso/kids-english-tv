"""'오늘의 추천'에 쓸 영상 모음(pool.json)을 만듭니다.

index.html의 CHANNELS에서 채널·재생목록을 읽고, 각각의 최신 영상(RSS)을 모은 뒤
영상 길이를 확인해 2~15분짜리만 남깁니다. 하루에 한 번 GitHub Actions가 실행합니다.
실행: python3 tools/build_pool.py   (kids-english-tv 폴더에서)
"""
import json, re, subprocess, time, html, os, sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
PER_SOURCE = 15            # 채널마다 최신 몇 개까지 확인할지(RSS 최대 15개)
KEEP = 30                  # 채널마다 모아 둘 최대 개수(예전 영상도 남겨서 고를 거리가 늘어나요)
MIN_SEC, MAX_SEC = 120, 900  # 2분 ~ 15분
LOOSE_MAX = 1500             # 짧은 영상이 3개도 안 되는 채널은 25분까지 허용


def get(url):
    r = subprocess.run(["curl", "-sL", "--max-time", "20", "-A", UA, "-H", "Accept-Language: en", url],
                       capture_output=True)
    return r.stdout.decode("utf-8", "replace")


def sources():
    s = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    block = s[s.index("const CHANNELS = ["):s.index("CHANNELS.forEach")]
    out = []
    for line in block.splitlines():
        m = re.search(r'\{ cat: "(\w+)", name: "([^"]+)"(.*)\}', line)
        if not m or line.strip().startswith("//"):
            continue
        cat, name, rest = m.groups()
        cid = re.search(r'id: "(UC[^"]+)"', rest)
        lst = re.search(r'list: "([^"]+)"', rest)
        vids = re.search(r'videos: \[([^\]]*)\]', rest)
        if vids:
            ids = re.findall(r'"([^"]+)"', vids.group(1))
            out.append({"cat": cat, "ch": name, "key": ",".join(ids), "videos": ids})
        elif lst:
            out.append({"cat": cat, "ch": name, "key": lst.group(1), "playlist": lst.group(1)})
        elif cid:
            out.append({"cat": cat, "ch": name, "key": cid.group(1), "playlist": "UULF" + cid.group(1)[2:]})
    return out


def feed(playlist):
    x = get("https://www.youtube.com/feeds/videos.xml?playlist_id=" + playlist)
    items = []
    for e in re.findall(r"<entry>(.*?)</entry>", x, re.S):
        vid = re.search(r"<yt:videoId>([^<]+)", e)
        title = re.search(r"<title>([^<]*)", e)
        if vid and title:
            items.append((vid.group(1), html.unescape(title.group(1)).strip()))
    return items


def length(vid):
    h = get("https://www.youtube.com/watch?v=" + vid)
    m = re.search(r'"lengthSeconds":"(\d+)"', h)
    if not m:
        return None
    # 퍼가기 금지 영상은 빼기
    if '"playableInEmbed":false' in h:
        return -1
    return int(m.group(1))


def main():
    path = os.path.join(ROOT, "pool.json")
    old = {}
    if os.path.exists(path):
        try:
            for v in json.load(open(path, encoding="utf-8"))["videos"]:
                old[v["id"]] = v
        except Exception:
            pass
    known = dict((k, v["sec"]) for k, v in old.items())

    videos, failed = [], 0
    for src in sources():
        if "videos" in src:
            # 직접 적은 영상: 길이 제한 없이 넣기
            for vid in src["videos"]:
                sec = known.get(vid) or length(vid)
                o = json.loads(get("https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=" + vid) or "{}") if vid not in old else {"title": old[vid]["title"]}
                if sec and sec > 0:
                    videos.append({"id": vid, "title": o.get("title", src["ch"]), "ch": src["ch"], "key": src["key"], "cat": src["cat"], "sec": sec})
            continue
        items = feed(src["playlist"])[:PER_SOURCE]
        if not items:
            failed += 1
            # 이번에 못 읽었으면 예전 목록을 그대로 유지
            videos += [dict(v, cat=src["cat"], ch=src["ch"]) for v in old.values() if v.get("key") == src["key"]][:KEEP]
            continue
        got = []
        for vid, title in items:
            sec = known.get(vid)
            if sec is None:
                sec = length(vid)
                time.sleep(0.3)
            if sec is None or sec < 0:
                continue
            got.append({"id": vid, "title": title, "ch": src["ch"], "key": src["key"], "cat": src["cat"], "sec": sec})
        short = [v for v in got if MIN_SEC <= v["sec"] <= MAX_SEC]
        if len(short) < 3:
            short = [v for v in got if MIN_SEC <= v["sec"] <= LOOSE_MAX]
        # 새 영상을 앞에, 예전에 모아 둔 영상은 뒤에 이어 붙이기
        ids = {v["id"] for v in short}
        kept = [dict(v, cat=src["cat"], ch=src["ch"]) for v in old.values() if v.get("key") == src["key"] and v["id"] not in ids]
        videos += (short + kept)[:KEEP]
        print(f"{src['ch']}: new {len(short)}/{len(items)}, total {min(KEEP, len(short) + len(kept))}", file=sys.stderr)

    if len(videos) < 30:
        sys.exit(f"영상이 너무 적어서({len(videos)}개) pool.json을 바꾸지 않았어요")
    json.dump({"updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "videos": videos},
              open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"{len(videos)}개 저장 (읽기 실패 {failed}곳)", file=sys.stderr)


main()
