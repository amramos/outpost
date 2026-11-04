"""Turn a picture (URL or local file) into a small square PNG for outpost.

    python -I avatar.py <url-or-path>

Prints the PNG as base64 on stdout. The picture is cropped to a square
(biased to the top, where a character's face usually is) and scaled to 96 px.
"""
import base64
import io
import sys
import urllib.request

from PIL import Image

SIZE = 96
MAX_BYTES = 15_000_000


def load(source: str) -> bytes:
    if source.startswith(("http://", "https://")):
        req = urllib.request.Request(source, headers={"User-Agent": "outpost/0.1"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read(MAX_BYTES + 1)
    else:
        with open(source, "rb") as fh:
            data = fh.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("picture is larger than 15 MB")
    return data


def main() -> None:
    # --fit: keep the whole picture on a transparent square (logos); default
    # crops to a square (portraits)
    fit = "--fit" in sys.argv[1:]
    source = next(a for a in sys.argv[1:] if a != "--fit")
    img = Image.open(io.BytesIO(load(source)))
    img.seek(0)  # first frame of a GIF/WebP animation
    img = img.convert("RGBA")
    if fit:
        bbox = img.getbbox()  # trim transparent margins first
        if bbox:
            img = img.crop(bbox)
        img.thumbnail((SIZE, SIZE), Image.LANCZOS)
        square = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        square.paste(img, ((SIZE - img.width) // 2, (SIZE - img.height) // 2))
        img = square
    else:
        w, h = img.size
        side = min(w, h)
        left = (w - side) // 2
        top = 0 if h > w else (h - side) // 2
        img = img.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    sys.stdout.write(base64.b64encode(out.getvalue()).decode("ascii"))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # reported back to the person by the mod
        sys.stderr.write(f"{type(exc).__name__}: {exc}")
        sys.exit(1)
