#!/usr/bin/env python3
"""Normalize basket artwork into a shared transparent bounding box."""

import os
import struct
import zlib


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "购物篮")
OUT_DIR = os.path.join(SRC_DIR, "优化")
FILES = ["普通铁皮.png", "星空蓝.png", "草莓粉.png", "薄荷绿.png", "金光闪闪.png"]
WIDTH = HEIGHT = 1242
TARGET = (0.29, 0.71, 0.19, 0.80)


def read_png(path):
    with open(path, "rb") as f:
        data = f.read()
    pos = 8
    width = height = color_type = None
    idat = b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        chunk_type = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if chunk_type == b"IHDR":
            width, height, bit, color_type = struct.unpack(">IIBB", chunk[:10])
            if bit != 8 or color_type not in (2, 6):
                raise ValueError("Only 8-bit RGB/RGBA PNG files are supported: " + path)
        elif chunk_type == b"IDAT":
            idat += chunk

    raw = zlib.decompress(idat)
    channels = 3 if color_type == 2 else 4
    stride = width * channels
    pixels = bytearray()
    previous = bytearray(stride)
    pos = 0
    for _ in range(height):
        filter_type = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        for i in range(stride):
            left = line[i - channels] if i >= channels else 0
            up = previous[i]
            upper_left = previous[i - channels] if i >= channels else 0
            value = line[i]
            if filter_type == 1:
                value = (value + left) & 255
            elif filter_type == 2:
                value = (value + up) & 255
            elif filter_type == 3:
                value = (value + ((left + up) >> 1)) & 255
            elif filter_type == 4:
                estimate = left + up - upper_left
                pa = abs(estimate - left)
                pb = abs(estimate - up)
                pc = abs(estimate - upper_left)
                predictor = left if pa <= pb and pa <= pc else (up if pb <= pc else upper_left)
                value = (value + predictor) & 255
            line[i] = value
        pixels += line
        previous = line
    return width, height, channels, pixels


def alpha_bbox(width, height, channels, pixels):
    x0, y0, x1, y1 = width, height, -1, -1
    for y in range(height):
        row = y * width * channels
        for x in range(width):
            alpha = pixels[row + x * channels + 3] if channels == 4 else 255
            if alpha <= 16:
                continue
            x0 = min(x0, x)
            y0 = min(y0, y)
            x1 = max(x1, x)
            y1 = max(y1, y)
    if x1 < x0 or y1 < y0:
        raise ValueError("PNG has no visible pixels")
    return x0, y0, x1, y1


def write_png(path, width, height, rgba):
    def chunk(chunk_type, payload):
        body = chunk_type + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xffffffff)

    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += rgba[y * width * 4:(y + 1) * width * 4]
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        f.write(chunk(b"IEND", b""))


def sample(pixels, width, height, channels, x, y):
    x = max(0, min(width - 1, x))
    y = max(0, min(height - 1, y))
    offset = (y * width + x) * channels
    alpha = (pixels[offset + 3] if channels == 4 else 255) / 255.0
    return (
        pixels[offset] * alpha,
        pixels[offset + 1] * alpha,
        pixels[offset + 2] * alpha,
        alpha,
    )


def normalize(path, output_path):
    width, height, channels, pixels = read_png(path)
    x0, y0, x1, y1 = alpha_bbox(width, height, channels, pixels)
    source_width = x1 - x0 + 1
    source_height = y1 - y0 + 1

    target_x0, target_x1, target_y0, target_y1 = TARGET
    target_width = (target_x1 - target_x0) * WIDTH
    target_height = (target_y1 - target_y0) * HEIGHT
    scale = min(target_width / source_width, target_height / source_height)
    draw_width = source_width * scale
    draw_height = source_height * scale
    draw_x = (target_x0 + target_x1) * WIDTH / 2 - draw_width / 2
    draw_y = (target_y0 + target_y1) * HEIGHT / 2 - draw_height / 2

    output = bytearray(WIDTH * HEIGHT * 4)
    for y in range(HEIGHT):
        for x in range(WIDTH):
            source_x = x0 + (x - draw_x) / scale
            source_y = y0 + (y - draw_y) / scale
            if source_x < 0 or source_y < 0 or source_x > width - 1 or source_y > height - 1:
                continue
            left = int(source_x)
            top = int(source_y)
            right = min(left + 1, width - 1)
            bottom = min(top + 1, height - 1)
            fx = source_x - left
            fy = source_y - top
            samples = [
                sample(pixels, width, height, channels, left, top),
                sample(pixels, width, height, channels, right, top),
                sample(pixels, width, height, channels, left, bottom),
                sample(pixels, width, height, channels, right, bottom),
            ]
            values = []
            for channel in range(4):
                top_value = samples[0][channel] * (1 - fx) + samples[1][channel] * fx
                bottom_value = samples[2][channel] * (1 - fx) + samples[3][channel] * fx
                values.append(top_value * (1 - fy) + bottom_value * fy)
            red, green, blue, alpha = values
            alpha_byte = max(0, min(255, int(round(alpha * 255))))
            offset = (y * WIDTH + x) * 4
            output[offset + 3] = alpha_byte
            if alpha_byte:
                output[offset] = max(0, min(255, int(round(red / alpha))))
                output[offset + 1] = max(0, min(255, int(round(green / alpha))))
                output[offset + 2] = max(0, min(255, int(round(blue / alpha))))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    write_png(output_path, WIDTH, HEIGHT, output)


def main():
    for name in FILES:
        source = os.path.join(SRC_DIR, name)
        output = os.path.join(OUT_DIR, name)
        normalize(source, output)
        print("normalized", name)


if __name__ == "__main__":
    main()
