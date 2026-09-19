#!/usr/bin/env python3
"""Writes the wide preview image WhatsApp, Instagram and Google show for a link.

Every album cover here is a portrait photograph. A link preview card is wide
(1.91:1), so the platforms crop one out of the middle of the picture — which on
a standing portrait is a chest, not a face. These are proper 1200x630 crops
taken around the subject's head instead.

Run it after adding or re-covering an album:

    python3 .github/scripts/make-og-images.py

It writes photos/og/<album-slug>.jpg for every published album and commits
nothing; build-seo.mjs uses the file when it exists and falls back to the
portrait cover when it does not, so a brand-new album still previews, just less
well until this is re-run. Needs Pillow (pip3 install pillow).
"""
import json
import os
import re
import subprocess
import sys

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("This needs Pillow:  pip3 install pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(ROOT)
OUT_DIR = os.path.join("photos", "og")
W, H = 1200, 630

# data.js is JavaScript, so read it the way the site does: through node.
data = json.loads(subprocess.check_output(
    ["node", "-e", 'global.window={};require("./data.js");process.stdout.write(JSON.stringify(window.WPS_DATA))'],
    text=True))


def slugify(text):
    """Mirrors slugify() in app.js and build-seo.mjs."""
    s = re.sub(r"\([^)]*\)", "", str(text or "")).strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return re.sub(r"^-+|-+$", "", s)


def album_name(s):
    return (s.get("talent") or s.get("title") or "").strip()


def cover_of(s):
    photos = s.get("photos") or []
    if not photos:
        return None
    want = s.get("coverPhotoId")
    for p in photos:
        if want and str(p.get("id", "")).split("-")[0] == want:
            return p
    return photos[0]


def crop_box(im, focal_x, focal_y):
    """A 1200x630-shaped window over the photo, centred on the subject.

    Without a focal point, a portrait is cropped from its upper third: that is
    where a standing or seated subject's head is, and a centred crop is exactly
    what produces the headless previews this script exists to avoid.
    """
    src_w, src_h = im.size
    target = W / H
    if src_w / src_h > target:              # wider than the card: trim the sides
        box_h = src_h
        box_w = round(src_h * target)
    else:                                   # taller than the card: trim top and bottom
        box_w = src_w
        box_h = round(src_w / target)
    cx = (focal_x if focal_x is not None else 50) / 100 * src_w
    # A focal point low in the frame is a framing choice for the square grid
    # tiles ("show more of the outfit"), not a mark on the face — following it
    # cropped one preview to a torso and a pillar. Anything below 40% is
    # ignored in favour of the upper-third rule.
    useful_y = focal_y if (focal_y is not None and focal_y <= 40) else 32
    cy = useful_y / 100 * src_h
    left = min(max(0, round(cx - box_w / 2)), src_w - box_w)
    top = min(max(0, round(cy - box_h / 2)), src_h - box_h)
    # …and never start below the subject's head on a tall portrait.
    if src_h > src_w:
        top = min(top, round(0.12 * src_h))
    return (left, top, left + box_w, top + box_h)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    made, skipped = [], []
    slugs = set()
    for s in data.get("DEMO_SHOOTS", []):
        if not (s.get("photos") or []):
            continue
        slug = slugify(album_name(s)) or slugify(s.get("id"))
        n, base = 2, slug
        while slug in slugs:                # same rule as the page builder
            slug = f"{base}-{n}"
            n += 1
        slugs.add(slug)

        cover = cover_of(s)
        src = (cover or {}).get("url", "").lstrip("/")
        if not src or not os.path.exists(src):
            skipped.append((slug, "cover file missing"))
            continue
        im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
        box = crop_box(im, cover.get("focalX"), cover.get("focalY"))
        out = im.crop(box).resize((W, H), Image.LANCZOS)
        path = os.path.join(OUT_DIR, f"{slug}.jpg")
        out.save(path, "JPEG", quality=84, optimize=True, progressive=True)
        made.append((path, os.path.getsize(path), "focal point" if (cover.get("focalY") is not None and cover.get("focalY") <= 40) else "upper third"))

    for path, size, how in made:
        print(f"  {size/1024:6.0f} KB  {path}   ({how})")
    for slug, why in skipped:
        print(f"  skipped {slug}: {why}")
    print(f"\n{len(made)} preview image(s) written to {OUT_DIR}/")


if __name__ == "__main__":
    main()
