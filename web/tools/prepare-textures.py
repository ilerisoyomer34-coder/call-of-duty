"""prepare-weapon-glb.mjs için isteğe bağlı, tarayıcısız Pillow doku dönüşümü."""
import base64
import io
import json
from pathlib import Path
import sys
from PIL import Image, ImageDraw

request = json.load(sys.stdin)
root = Path(request['root'])
for job in request['jobs']:
    image = Image.open(io.BytesIO(base64.b64decode(job['image']))).convert('RGB')
    draw = ImageDraw.Draw(image)
    for x, y, w, h, sx, sy in job['paint']:
        color = image.getpixel((sx, sy))
        draw.rectangle((x, y, x + w - 1, y + h - 1), fill=color)
    scale = min(1, job['max'] / max(image.size))
    if scale < 1:
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    image.save(root / job['file'], quality=round(job['quality'] * 100), subsampling=0, optimize=True)
