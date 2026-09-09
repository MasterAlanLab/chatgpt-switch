"""Generate the extension's original switch-arrow icon (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
out = root / 'public' / 'icons'
out.mkdir(parents=True, exist_ok=True)
scale = 4
im = Image.new('RGBA', (128 * scale, 128 * scale), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rounded_rectangle((0, 0, 128 * scale - 1, 128 * scale - 1), radius=32 * scale, fill='#1b7559')
for points in [[(32, 46), (96, 46), (82, 32)], [(96, 46), (82, 60)], [(96, 82), (32, 82), (46, 68)], [(32, 82), (46, 96)]]:
    d.line([(x * scale, y * scale) for x, y in points], fill='white', width=7 * scale, joint='curve')
for size in (16, 32, 48, 128):
    im.resize((size, size), Image.Resampling.LANCZOS).save(out / f'{size}.png')
