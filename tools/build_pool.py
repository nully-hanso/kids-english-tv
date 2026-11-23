"""고르는 화면에 쓸 영상 모음(pool.json)을 만듭니다.

index.html의 CHANNELS에서 채널·재생목록을 읽고, 각 재생목록 페이지에서
영상 제목과 길이를 가져와 2~15분짜리만 남깁니다(채널마다 최근 것 최대 30개).
영상 페이지는 서버에서 막히는 일이 많아서 재생목록 페이지만 씁니다.
하루에 한 번 GitHub Actions가 실행합니다.
실행: python3 tools/build_pool.py   (kids-english-tv 폴더에서)
"""
import json, re, subprocess, time, os, sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
KEEP = 30                    # 채널마다 모아 둘 최대 개수
MIN_SEC, MAX_SEC = 120, 900  # 2분 ~ 15분
LOOSE_MAX = 1500             # 짧은 영상이 5개도 안 되는 채널은 25분까지 허용


def curl(url, effective=False):
    args = ["curl", "-sL", "--max-time", "25", "-A", UA, "-H", "Accept-Language: en"]
    if effective:
        args += ["-o", "/dev/null", "-w", "%{url_effective}"]
    r = subprocess.run(args + [url], capture_output=True)
    return r.stdout.decode("utf-8", "replace")


def sources():
    s = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    block = s[s.index("const CHANNELS = ["):s.index("CHANNELS.forEach")]
    out = []
    for line in block.splitlines():
        if line.strip().startswith("//"):
            continue
        m = re.search(r'\{ cat: "(\w+)", name: "([^"]+)"(.*)\}', line)
        if not m:
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


def secs(t):
    p = [int(x) for x in t.split(":")]
    return p[0] * 3600 + p[1] * 60 + p[2] if len(p) == 3 else p[0] * 60 + p[1]


def playlist(list_id):
    """재생목록 페이지에서 (영상ID, 제목, 길이초) 목록을 순서대로(최근 것 먼저) 읽기"""
    h = curl("https://www.youtube.com/playlist?list=" + list_id)
    m = re.search(r"var ytInitialData = (\{.*?\});</script>", h)
    if not m:
        return []
    found = []

    def walk(o):
        if isinstance(o, dict):
            if "lockupViewModel" in o:
                found.append(o["lockupViewModel"])
            elif "playlistVideoRenderer" in o:
                found.append({"_old": o["playlistVideoRenderer"]})
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(json.loads(m.group(1)))
    out = []
    for r in found:
        try:
            if "_old" in r:   # 예전 형식
                o = r["_old"]
                if o.get("lengthSeconds"):
                    out.append((o["videoId"], "".join(x["text"] for x in o["title"]["runs"]), int(o["lengthSeconds"])))
                continue
            if r.get("contentType") != "LOCKUP_CONTENT_TYPE_VIDEO":
                continue
            title = r["metadata"]["lockupMetadataViewModel"]["title"]["content"]
            dur = re.search(r'"text": "(\d+(?::\d\d){1,2})"', json.dumps(r))
            if dur:
                out.append((r["contentId"], title, secs(dur.group(1))))
        except (KeyError, TypeError):
            continue
    return out


def main():
    path = os.path.join(ROOT, "pool.json")
    old = {}
    if os.path.exists(path):
        try:
            for v in json.load(open(path, encoding="utf-8"))["videos"]:
                old[v["id"]] = v
        except Exception:
            pass

    videos, failed = [], 0
    for src in sources():
        base = {"ch": src["ch"], "key": src["key"], "cat": src["cat"]}
        if "videos" in src:
            # 직접 적은 영상: 임시 재생목록으로 길이를 읽고, 길이 제한 없이 넣기
            url = curl("https://www.youtube.com/watch_videos?video_ids=" + ",".join(src["videos"]), effective=True)
            tl = re.search(r"list=([\w-]+)", url)
            items = playlist(tl.group(1)) if tl else []
            got = [dict(base, id=i, title=t, sec=s) for i, t, s in items if i in src["videos"]]
        else:
            items = playlist(src["playlist"])
            got = [dict(base, id=i, title=t, sec=s) for i, t, s in items]
            short = [v for v in got if MIN_SEC <= v["sec"] <= MAX_SEC]
            if len(short) < 5:
                short = [v for v in got if MIN_SEC <= v["sec"] <= LOOSE_MAX]
            got = short[:KEEP]
        if not items:
            failed += 1
            got = [dict(v, **base) for v in old.values() if v.get("key") == src["key"]][:KEEP]   # 못 읽으면 예전 것 유지
        videos += got
        print(f"{src['ch']}: {len(got)} (페이지 {len(items)}개)", file=sys.stderr)
        time.sleep(0.5)

    if len(videos) < 60:
        sys.exit(f"영상이 너무 적어서({len(videos)}개) pool.json을 바꾸지 않았어요")
    json.dump({"updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "videos": videos},
              open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"{len(videos)}개 저장 (읽기 실패 {failed}곳)", file=sys.stderr)


main()
