"""
去除圖片白色背景腳本
將白色/接近白色的像素轉為透明
"""

import os
import sys
from PIL import Image
import numpy as np
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import time


def remove_white_background(image_path, output_path, threshold=240):
    """
    去除圖片的白色背景

    Args:
        image_path: 輸入圖片路徑
        output_path: 輸出圖片路徑
        threshold: 白色閾值 (0-255)，像素 RGB 值都高於此值則視為白色
    """
    try:
        # 開啟圖片
        img = Image.open(image_path)

        # 轉換為 RGBA 模式（支援透明度）
        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        # 轉換為 numpy array
        data = np.array(img)

        # 找出白色/接近白色的像素
        # 條件：R, G, B 三個值都大於 threshold
        r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]
        white_mask = (r > threshold) & (g > threshold) & (b > threshold)

        # 將白色像素的 alpha 值設為 0（透明）
        data[:, :, 3] = np.where(white_mask, 0, a)

        # 建立新圖片
        result = Image.fromarray(data, 'RGBA')

        # 儲存
        result.save(output_path, 'PNG')
        return True, image_path

    except Exception as e:
        return False, f"{image_path}: {str(e)}"


def process_folder(input_folder, output_folder, threshold=240, max_workers=4):
    """
    處理整個資料夾的圖片

    Args:
        input_folder: 輸入資料夾路徑
        output_folder: 輸出資料夾路徑
        threshold: 白色閾值
        max_workers: 並行處理的執行緒數
    """
    input_path = Path(input_folder)
    output_path = Path(output_folder)

    # 建立輸出資料夾
    output_path.mkdir(parents=True, exist_ok=True)

    # 支援的圖片格式
    image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'}

    # 收集所有圖片檔案
    image_files = [
        f for f in input_path.iterdir()
        if f.is_file() and f.suffix.lower() in image_extensions
    ]

    total = len(image_files)
    if total == 0:
        print(f"  [!] 資料夾中沒有找到圖片: {input_folder}")
        return 0, 0

    print(f"  [*] 找到 {total} 張圖片，開始處理...")

    success_count = 0
    fail_count = 0
    start_time = time.time()

    # 使用多執行緒處理
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}

        for img_file in image_files:
            # 輸出檔案路徑（統一使用 .png 格式）
            output_file = output_path / (img_file.stem + '.png')
            future = executor.submit(remove_white_background, str(img_file), str(output_file), threshold)
            futures[future] = img_file.name

        # 處理結果
        for i, future in enumerate(as_completed(futures), 1):
            success, result = future.result()
            if success:
                success_count += 1
            else:
                fail_count += 1
                print(f"    [!] 失敗: {result}")

            # 顯示進度
            if i % 100 == 0 or i == total:
                elapsed = time.time() - start_time
                speed = i / elapsed if elapsed > 0 else 0
                remaining = (total - i) / speed if speed > 0 else 0
                print(f"    進度: {i}/{total} ({i*100//total}%) - {speed:.1f} 張/秒 - 剩餘 {remaining:.0f} 秒")

    elapsed = time.time() - start_time
    print(f"  [✓] 完成！成功: {success_count}, 失敗: {fail_count}, 耗時: {elapsed:.1f} 秒")

    return success_count, fail_count


def main():
    # 專案路徑
    base_path = Path(__file__).parent.parent
    images_path = base_path / 'images'

    # 建立處理後的輸出資料夾
    processed_path = images_path / 'processed'

    print("=" * 60)
    print("蘋果圖片去背工具")
    print("=" * 60)
    print(f"輸入資料夾: {images_path}")
    print(f"輸出資料夾: {processed_path}")
    print(f"白色閾值: 240 (RGB 值 > 240 視為白色)")
    print()

    total_success = 0
    total_fail = 0

    # 處理 healthy 資料夾
    healthy_input = images_path / 'healthy'
    healthy_output = processed_path / 'healthy'
    if healthy_input.exists():
        print("[健康蘋果]")
        s, f = process_folder(healthy_input, healthy_output)
        total_success += s
        total_fail += f
        print()

    # 處理 diseased 資料夾
    diseased_input = images_path / 'diseased'
    diseased_output = processed_path / 'diseased'
    if diseased_input.exists():
        print("[病害蘋果]")
        s, f = process_folder(diseased_input, diseased_output)
        total_success += s
        total_fail += f
        print()

    print("=" * 60)
    print(f"全部完成！總計成功: {total_success}, 失敗: {total_fail}")
    print(f"處理後的圖片在: {processed_path}")
    print("=" * 60)


if __name__ == '__main__':
    main()
