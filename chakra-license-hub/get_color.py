from PIL import Image
from collections import Counter

img = Image.open(r"d:\Chakra\chakra-license-hub\logo\ChakraLogo3.png").convert("RGBA")
pixels = list(img.getdata())

# Filter out transparent pixels
non_transparent = [p[:3] for p in pixels if p[3] > 0]

if not non_transparent:
    print("No non-transparent pixels found.")
else:
    # Find the most common color
    counts = Counter(non_transparent)
    common = counts.most_common(10)
    print("Most common colors (RGB):")
    for color, count in common:
        print(f"#{color[0]:02x}{color[1]:02x}{color[2]:02x} - count: {count}")
