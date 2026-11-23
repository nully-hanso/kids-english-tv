"""'오늘의 추천'에 쓸 영상 모음(pool.json)을 만듭니다.

index.html의 CHANNELS에서 채널·재생목록을 읽고, 각각의 최신 영상(RSS)을 모은 뒤
영상 길이를 확인해 2~15분짜리만 남깁니다. 하루에 한 번 GitHub Actions가 실행합니다.
실행: python3 tools/build_pool.py   (kids-english-tv 폴더에서)
"""
import json, re, subprocess, time, html, os, sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
PER_SOURCE = 10            # 채널마다 최신 몇 개까지 길이를 확인할지
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
        if lst:
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
        items = feed(src["playlist"])[:PER_SOURCE]
        if not items:
            failed += 1
            # 이번에 못 읽었으면 예전 목록을 그대로 유지
            videos += [v for v in old.values() if v.get("key") == src["key"]]
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
        videos += short
        print(f"{src['ch']}: {len(short)}/{len(items)}", file=sys.stderr)

    if len(videos) < 30:
        sys.exit(f"영상이 너무 적어서({len(videos)}개) pool.json을 바꾸지 않았어요")
    json.dump({"updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "videos": videos},
              open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"{len(videos)}개 저장 (읽기 실패 {failed}곳)", file=sys.stderr)


main()
