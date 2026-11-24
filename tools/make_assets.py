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


def unmark(img, cx=2090, cy=1493, r=64):
    """오른쪽 아래 생성기 표시(반투명 흰 별)를 덮기 전 색으로 되돌리고 테두리를 다듬기"""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    d = (np.abs(xx - cx) / r) ** (2 / 3) + (np.abs(yy - cy) / r) ** (2 / 3)
    m = np.asarray(Image.fromarray(((d <= 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))) / 255
    box = (np.abs(xx - cx) < r * 1.3) & (np.abs(yy - cy) < r * 1.3)
    ring = a[(d > 1.15) & (d < 1.6) & box].mean(0)
    al = float(np.clip(((a[d < .5].mean(0) - ring) / (255 - ring)).mean(), 0, .9))
    A = (m * al)[..., None]
    out = np.clip((a - A * 255) / (1 - A), 0, 255)
    band = (np.abs(d - 1) < .2) & box
    med = np.asarray(Image.fromarray(out.astype(np.uint8)).filter(ImageFilter.MedianFilter(11)).filter(ImageFilter.GaussianBlur(1))).astype(np.float32)
    bm = np.asarray(Image.fromarray((band * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)))[..., None] / 255
    return Image.fromarray((out * (1 - bm) + med * bm).astype(np.uint8))


def cut_sky(img):
    """그림책 세계 그림에서 위쪽과 이어진 어두운 하늘만 투명하게"""
    rgb = np.asarray(img).astype(np.float32); mx = rgb.max(2)
    m = Image.fromarray(((mx < 95) * 255).astype(np.uint8), "L").copy()
    for x in range(0, m.width, 6):
        if m.getpixel((x, 0)) == 255: ImageDraw.floodfill(m, (x, 0), 128)
    sky = Image.fromarray(((np.asarray(m) == 128) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
    alpha = np.asarray(Image.fromarray(255 - np.asarray(sky)).filter(ImageFilter.GaussianBlur(2))).astype(np.float32)
    # 좌우 끝은 부드럽게 사라지게(화면이 그림보다 넓을 때 경계가 안 보이도록)
    x = np.linspace(0, 1, img.width)
    alpha *= np.clip(np.minimum(x, 1 - x) / .09, 0, 1)[None, :] ** 1.5
    alpha = Image.fromarray(alpha.astype(np.uint8))
    out = img.convert("RGBA"); out.putalpha(alpha)
    return out


# 무대 바탕: 우주 배경 위에 하늘을 오려 낸 그림책 세계(둘 다 같은 4:3 크기라 겹치면 맞아요)
save(unmark(src("Cosmic")), "sky.webp", 1800, 82)
save(cut_sky(unmark(src("storybook"))), "world.webp", 1800, 84)

# 커튼: 좌우로 나눠 각각 그림이 있는 부분만
c = src("theater_curtains"); w, h = c.size
save(trim(c.crop((0, 0, w // 2, h))), "curtain-left.webp", 700)
save(trim(c.crop((w // 2, 0, w, h))), "curtain-right.webp", 700)

save(trim(src("valance")), "valance.webp", 1800)
save(trim(src("clouds")), "clouds.webp", 1800)
save(trim(src("light_effects")), "sparkles.webp", 1400)
save(trim(src("castle")), "icon-morning.webp", 360)
save(trim(src("flask")), "icon-theater.webp", 360)
