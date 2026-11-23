"""reference_imgs의 그림에서 배경을 지워 assets/ 에 투명 WebP로 저장합니다.
실행: python3 tools/cutout.py <업스케일 폴더>   (매직월드·커튼은 미리 3배로 키운 파일 사용)"""
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "reference_imgs"); OUT = os.path.join(ROOT, "assets")
UP = sys.argv[1] if len(sys.argv) > 1 else REF

def load(p): return np.asarray(Image.open(p).convert("RGB")).astype(np.float32)
def save(rgb, a, name, maxw=None, q=86):
    img = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), np.clip(a * 255, 0, 255)]).astype(np.uint8), "RGBA")
    if maxw and img.width > maxw: img = img.resize((maxw, round(img.height * maxw / img.width)), Image.LANCZOS)
    img.save(os.path.join(OUT, name), "WEBP", quality=q, method=6)
    print(name, img.size, os.path.getsize(os.path.join(OUT, name)) // 1024, "KB")

def flood_from_border(cand):
    """cand(bool) 중 가장자리와 이어진 부분만 True"""
    h, w = cand.shape
    m = Image.fromarray((cand * 255).astype(np.uint8), "L").copy()   # copy: 배열과 메모리를 공유하면 채우기가 안 먹어요
    step = 8
    seeds = [(x, 0) for x in range(0, w, step)] + [(x, h - 1) for x in range(0, w, step)] + [(0, y) for y in range(0, h, step)] + [(w - 1, y) for y in range(0, h, step)]
    for s in seeds:
        if m.getpixel(s) == 255: ImageDraw.floodfill(m, s, 128)
    return np.asarray(m) == 128

def sat_val(rgb):
    mx = rgb.max(2); mn = rgb.min(2)
    return (mx - mn) / np.maximum(mx, 1), mx / 255, mn

def white_bg(path, name, maxw=640):
    """흰 배경: 가장자리와 이어진 흰색·회색(그림자)을 투명하게, 그림자는 반투명으로"""
    rgb = load(path); s, v, mn = sat_val(rgb)
    cand = (s < .12) & (mn > 140)
    region = flood_from_border(cand)
    # 고리 안쪽처럼 가장자리와 안 이어진 넓은 흰 구멍도 지우기(작은 반사광은 남김)
    h, w = cand.shape
    m = Image.fromarray(((cand & ~region) * 255).astype(np.uint8), "L").copy()
    for sy in range(0, h, 10):
        for sx in range(0, w, 10):
            if m.getpixel((sx, sy)) == 255:
                ImageDraw.floodfill(m, (sx, sy), 100)
                arr = np.asarray(m); hole = arr == 100
                if hole.mean() > .012: region |= hole
                m = Image.fromarray(np.where(hole, 50, arr).astype(np.uint8), "L").copy()
    a = np.ones(mn.shape, np.float32)
    soft = np.clip((255 - mn) / 115, 0, 1) ** 1.2          # 하얄수록 투명
    a[region] = soft[region] * .85
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.8))) / 255
    # 흰 배경 번짐 제거: C = (C - (1-a)*255)/a
    out = (rgb - (1 - a[..., None]) * 255) / np.maximum(a[..., None], .05)
    out = np.where(a[..., None] > .02, out, 0)
    save(out, a, name, maxw)

def checker_light(path, name, maxw=None):
    """밝은 체크무늬(흰/연회색) 배경: 채도 낮고 밝은 부분 중 가장자리와 이어진 곳 제거"""
    rgb = load(path); s, v, mn = sat_val(rgb)
    cand = (s < .1) & (v > .86)
    region = flood_from_border(cand)
    # 가운데 빈 공간도 체크무늬 — 가운데 점에서도 채움
    h, w = cand.shape
    m = Image.fromarray(((cand & ~region) * 255).astype(np.uint8), "L").copy()
    for sx in range(int(w * .3), int(w * .7), 12):
        for sy in range(int(h * .35), int(h * .95), 12):
            if m.getpixel((sx, sy)) == 255: ImageDraw.floodfill(m, (sx, sy), 128)
    region |= np.asarray(m) == 128
    a = (~region).astype(np.float32)
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))) / 255
    save(rgb, a, name, maxw)

def dark_glow(path, name, maxw=None):
    """어두운 배경 위의 빛 효과: 밝기 → 투명도 (검정 기준으로 색 복원)"""
    rgb = load(path)
    base = 84.0   # 체크무늬 회색(44~80)까지 지움
    lum = np.clip(rgb.max(2) - base, 0, None) / (255 - base)
    a = np.clip(lum * 1.35, 0, 1) ** 1.1
    out = np.clip((rgb - base) / np.maximum(a[..., None], .05) * (255 / (255 - base)), 0, 255)
    save(out, a, name, maxw)

def clouds(path, name, maxw=2000):
    """남색 하늘 위 구름: 남색을 투명하게"""
    rgb = load(path); navy = np.array([28, 28, 78], np.float32)
    d = np.sqrt(((rgb - navy) ** 2).sum(2))
    a = np.clip((d - 18) / 70, 0, 1)
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))) / 255
    save(rgb, a, name, maxw)

def vignette(path, name, maxw=2400):
    """매직월드: 위와 양옆을 별하늘로 녹아들게 흐리기"""
    rgb = load(path); h, w, _ = rgb.shape
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    nx = (x / w - .5) * 2; ny = y / h
    side = np.clip((1 - np.abs(nx)) / .16, 0, 1)
    top = np.clip((ny - .0) / .14, 0, 1)
    ell = np.clip((1.12 - np.sqrt(nx ** 2 * .9 + ((ny - 1.05) * 1.25) ** 2)) / .38, 0, 1)
    a = np.minimum(side, top) ** 1.2
    a = np.maximum(a, 0)
    save(rgb, a, name, maxw, q=84)

os.makedirs(OUT, exist_ok=True)
white_bg(os.path.join(REF, "아침방송.jpg"), "icon-morning.webp")
white_bg(os.path.join(REF, "극장.jpg"), "icon-theater.webp")
checker_light(os.path.join(UP, "curtain.png"), "curtain.webp", 2400)
dark_glow(os.path.join(REF, "별과 마법 효과.jpg"), "sparkles.webp", 1600)
clouds(os.path.join(REF, "구름.jpg"), "clouds.webp")
vignette(os.path.join(UP, "world.png"), "world.webp")
Image.open(os.path.join(REF, os.listdir(REF)[0] if os.listdir(REF)[0].startswith("Cosmic") else [f for f in os.listdir(REF) if f.startswith("Cosmic")][0])).convert("RGB").resize((2048, 1639)).save(os.path.join(OUT, "sky.webp"), "WEBP", quality=80, method=6)
print("sky.webp", os.path.getsize(os.path.join(OUT, "sky.webp")) // 1024, "KB")

# 커튼을 왼쪽·오른쪽·가운데 장식으로 나눠서, 화면 비율이 달라도 찌그러지지 않게
cur = Image.open(os.path.join(OUT, "curtain.webp")); W, H = cur.size
cur.crop((0, 0, int(W * .40), H)).save(os.path.join(OUT, "curtain-left.webp"), "WEBP", quality=86, method=6)
cur.crop((int(W * .60), 0, W, H)).save(os.path.join(OUT, "curtain-right.webp"), "WEBP", quality=86, method=6)
cur.crop((int(W * .27), 0, int(W * .73), int(H * .30))).save(os.path.join(OUT, "valance.webp"), "WEBP", quality=86, method=6)
os.remove(os.path.join(OUT, "curtain.webp"))
print("curtain pieces saved")
