"""Small previews of pictures for the outpost pane.

    python -I thumb.py <max-width> <path> [<path> ...]

Prints JSON: { "<path>": { "mime", "data", "w", "h" } | { "error" } }.
A pane draws a picture inside an SVG of at most 131,072 characters, so each
preview is scaled down and saved as JPEG (flattened onto a dark background),
shrinking further until its base64 fits.
"""
import base64
import io
import json
import sys

from PIL import Image

BUDGET = 110_000  # base64 characters, leaving room for the SVG around it
BACKGROUND = (28, 28, 30)


def preview(path: str, max_width: int) -> dict:
    img = Image.open(path)
    img.seek(0)  # first frame of an animation
    img = img.convert("RGBA")
    flat = Image.new("RGB", img.size, BACKGROUND)
    flat.paste(img, mask=img.split()[3])
    width = min(max_width, flat.width)
    quality = 85
    while True:
        height = max(1, round(flat.height * width / flat.width))
        out = io.BytesIO()
        flat.resize((width, height), Image.LANCZOS).save(out, format="JPEG", quality=quality, optimize=True)
        data = base64.b64encode(out.getvalue()).decode("ascii")
        if len(data) <= BUDGET or width <= 64:
            return {"mime": "image/jpeg", "data": data, "w": width, "h": height}
        if quality > 65:
            quality -= 10
        else:
            width = int(width * 0.8)


def main() -> None:
    max_width = int(sys.argv[1])
    result = {}
    for path in sys.argv[2:]:
        try:
            result[path] = preview(path, max_width)
        except Exception as exc:  # shown in the pane in place of the picture
            result[path] = {"error": f"{type(exc).__name__}: {exc}"[:200]}
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()
