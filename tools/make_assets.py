"""generate_imgs의 그림(이미 배경이 투명한 PNG)을 잘라 assets/에 WebP로 저장합니다.
실행: python3 tools/make_assets.py   (kids-english-tv 폴더에서)"""
import glob, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "generate_imgs"); OUT = os.path.join(ROOT, "assets")


def src(word):
    return Image.open(glob.glob(os.path.join(SRC, f"*{word}*.png"))[0]).convert("RGBA")


def trim(img):
    a = img.getchannel("A").point(lambda v: 255 if v > 8 else 0)
    return img.crop(a.getbbox())


def save(img, name, maxw, q=86):
    if img.width > maxw:
        img = img.resize((maxw, round(img.height * maxw / img.width)), Image.LANCZOS)
    img.save(os.path.join(OUT, name), "WEBP", quality=q, method=6)
    print(name, img.size, os.path.getsize(os.path.join(OUT, name)) // 1024, "KB")


def pick(*words):
    """파일 이름에 words가 모두 들어간 그림 하나"""
    f = [x for x in glob.glob(os.path.join(SRC, "*.png")) if all(w in os.path.basename(x) for w in words)]
    return Image.open(f[0]).convert("RGBA")


# 무대 바탕: 우주 배경
save(pick("Cosmic"), "sky.webp", 1800, 82)

# 그림책 세계(배경 지운 그림): 가운데 빈 곳에서 좌우로 나누기(성 쪽, 우주 쪽)
wd = pick("Open_storybook", "removeBackground"); SPLIT = 1151
save(trim(wd.crop((0, 0, SPLIT, wd.height))), "world-left.webp", 760, 80)
save(trim(wd.crop((SPLIT, 0, wd.width, wd.height))), "world-right.webp", 760, 80)

# 빛나는 그림책
save(trim(pick("Glowing_storybook")), "book.webp", 1200)

# 커튼: 좌우로 나눠 각각 그림이 있는 부분만
c = pick("theater_curtains"); w, h = c.size
save(trim(c.crop((0, 0, w // 2, h))), "curtain-left.webp", 700)
save(trim(c.crop((w // 2, 0, w, h))), "curtain-right.webp", 700)

# 천장 커튼: 가운데 주름 한 칸(술 장식 사이)만 잘라 가로로 이어 붙일 수 있게
v = np.asarray(trim(pick("valance"))).astype(np.float32)
P, X0, FW = 596, 895, 70          # 반복 폭, 시작 위치(술 장식 한가운데), 이음매 섞는 폭
H = 410                           # 주름 아래 끝까지의 높이
t = v[:H, X0:X0 + P].copy()
wgt = (np.arange(FW) / FW)[None, :, None]
t[:, :FW] = v[:H, X0:X0 + FW] * wgt + v[:H, X0 + P:X0 + P + FW] * (1 - wgt)
save(Image.fromarray(t.astype(np.uint8), "RGBA"), "valance.webp", 600)
# 구름: 커튼처럼 좌우로 나눠 각각 그림이 있는 부분만
cl = pick("Purple_clouds"); w, h = cl.size
def fade_inner(img, side, frac=.16):
    """가운데 쪽 끝(무대 바닥이 잘린 곳)을 부드럽게 사라지게"""
    a = np.asarray(img).astype(np.float32).copy()
    x = np.linspace(0, 1, a.shape[1])
    ramp = np.clip((1 - x if side == "right" else x) / frac, 0, 1)   # side: 흐리게 할 쪽
    a[..., 3] *= ramp[None, :]
    return Image.fromarray(a.astype(np.uint8), "RGBA")


save(trim(fade_inner(cl.crop((0, 0, w // 2, h)), "right")), "clouds-left.webp", 1000)
save(trim(fade_inner(cl.crop((w // 2, 0, w, h)), "left")), "clouds-right.webp", 1000)
save(trim(src("light_effects")), "sparkles.webp", 1400)
save(trim(src("castle")), "icon-morning.webp", 360)
save(trim(src("flask")), "icon-theater.webp", 360)
