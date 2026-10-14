# -*- coding: utf-8 -*-
"""生成 PWA 图标：青色背景 + 白色哑铃。运行: python make_icons.py"""
from PIL import Image, ImageDraw

BG = (13, 148, 136)      # teal-600
BG_DARK = (15, 118, 110) # teal-700 底部渐变
FG = (255, 255, 255)


def vertical_gradient(size):
    img = Image.new('RGB', (size, size))
    top, bottom = BG, BG_DARK
    for y in range(size):
        t = y / max(1, size - 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(size):
            img.putpixel((x, y), color)
    return img


def make(size, path):
    img = vertical_gradient(size)
    d = ImageDraw.Draw(img)
    u = size / 10.0
    cy = size / 2
    bar_w, bar_h = 4.4 * u, 0.8 * u
    plate_w, plate_h = 1.0 * u, 4.0 * u
    plate2_w, plate2_h = 0.7 * u, 2.8 * u
    r = 0.4 * u

    # 横杆
    d.rounded_rectangle(
        [size / 2 - bar_w / 2, cy - bar_h / 2, size / 2 + bar_w / 2, cy + bar_h / 2],
        radius=bar_h / 2 * 0.9, fill=FG)
    # 两侧杠铃片（外大内小）
    for side in (-1, 1):
        edge = size / 2 + side * bar_w / 2
        if side < 0:
            d.rounded_rectangle([edge - plate_w, cy - plate_h / 2, edge, cy + plate_h / 2], radius=r, fill=FG)
            d.rounded_rectangle([edge - plate_w - plate2_w, cy - plate2_h / 2, edge - plate_w, cy + plate2_h / 2], radius=r * 0.8, fill=FG)
        else:
            d.rounded_rectangle([edge, cy - plate_h / 2, edge + plate_w, cy + plate_h / 2], radius=r, fill=FG)
            d.rounded_rectangle([edge + plate_w, cy - plate2_h / 2, edge + plate_w + plate2_w, cy + plate2_h / 2], radius=r * 0.8, fill=FG)
    img.save(path)
    print('saved', path, size)


if __name__ == '__main__':
    make(192, 'icon-192.png')
    make(512, 'icon-512.png')
    make(180, 'apple-touch-icon.png')
