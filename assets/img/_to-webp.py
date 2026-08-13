# Разовый скрипт: PNG-рендеры -> webp для страницы. Исходные PNG не трогает.
# Запуск: python assets/img/_to-webp.py
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
NAMES = [
    "heroBlock", "heroBlockDark",
    "lendingPromo", "lendingPromoDark",
    "telegramBot", "telegramBotDark",
    "automaticProces", "automaticProcesDark",
]

total_src = total_out = 0
for name in NAMES:
    src = os.path.join(HERE, name + ".png")
    dst = os.path.join(HERE, name + ".webp")
    im = Image.open(src).convert("RGB")
    im.save(dst, "WEBP", quality=84, method=6)

    s, o = os.path.getsize(src), os.path.getsize(dst)
    total_src += s
    total_out += o
    print(f"{name+'.webp':<26} {im.width}x{im.height:<5}  {s/1024:7.0f} KB -> {o/1024:6.0f} KB")

print(f"\n{'ИТОГО':<26} {'':<11}  {total_src/1024:7.0f} KB -> {total_out/1024:6.0f} KB")
