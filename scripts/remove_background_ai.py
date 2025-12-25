"""
AI 去背工具 - 使用 rembg (U2-Net 模型)
效果比簡單的顏色閾值去背好很多
"""

import os
import sys
from pathlib import Path
from PIL import Image
from rembg import remove
from concurrent.futures import ThreadPoolExecutor, as_completed
import time


def remove_background_ai(image_path, output_path):
    """
    使用 AI 模型去除圖片背景

    Args:
        image_path: 輸入圖片路徑
        output_path: 輸出圖片路徑
    """
    try:
        # 開啟圖片
        with open(image_path, 'rb') as f:
            input_data = f.read()

        # 使用 rembg 去背
        output_data = remove(input_data)

        # 儲存結果
        with open(output_path, 'wb') as f:
            f.write(output_data)

        return True, image_path

    except Exception as e:
        return False, f"{image_path}: {str(e)}"


def process_folder(input_folder, output_folder, max_workers=2):
    """
    處理整個資料夾的圖片

    Args:
        input_folder: 輸入資料夾路徑
        output_folder: 輸出資料夾路徑
        max_workers: 並行處理的執行緒數 (AI 模型較耗資源，建議不要太高)
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

    print(f"  [*] 找到 {total} 張圖片，開始 AI 去背處理...")
    print(f"  [*] 使用 {max_workers} 個並行處理執行緒")

    success_count = 0
    fail_count = 0
    start_time = time.time()

    # 使用多執行緒處理
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}

        for img_file in image_files:
            # 輸出檔案路徑（統一使用 .png 格式）
            output_file = output_path / (img_file.stem + '.png')

            # 如果已經處理過就跳過
            if output_file.exists():
                success_count += 1
                continue

            future = executor.submit(remove_background_ai, str(img_file), str(output_file))
            futures[future] = img_file.name

        # 處理結果
        processed = success_count  # 已跳過的數量
        for future in as_completed(futures):
            processed += 1
            success, result = future.result()
            if success:
                success_count += 1
            else:
                fail_count += 1
                print(f"    [!] 失敗: {result}")

            # 顯示進度
            if processed % 10 == 0 or processed == total:
                elapsed = time.time() - start_time
                speed = processed / elapsed if elapsed > 0 else 0
                remaining = (total - processed) / speed if speed > 0 else 0
                print(f"    進度: {processed}/{total} ({processed*100//total}%) - {speed:.2f} 張/秒 - 剩餘約 {remaining/60:.1f} 分鐘")

    elapsed = time.time() - start_time
    print(f"  [✓] 完成！成功: {success_count}, 失敗: {fail_count}, 耗時: {elapsed/60:.1f} 分鐘")

    return success_count, fail_count


def main():
    # 專案路徑
    base_path = Path(__file__).parent.parent
    images_path = base_path / 'images'

    # 建立處理後的輸出資料夾
    processed_path = images_path / 'processed'

    print("=" * 60)
    print("AI 蘋果圖片去背工具 (rembg / U2-Net)")
    print("=" * 60)
    print(f"輸入資料夾: {images_path}")
    print(f"輸出資料夾: {processed_path}")
    print()
    print("[!] AI 去背較耗時，請耐心等待...")
    print("[!] 已處理過的圖片會自動跳過")
    print()

    total_success = 0
    total_fail = 0

    # 處理 healthy 資料夾
    healthy_input = images_path / 'healthy'
    healthy_output = processed_path / 'healthy'
    if healthy_input.exists():
        print("[健康蘋果]")
        s, f = process_folder(healthy_input, healthy_output, max_workers=2)
        total_success += s
        total_fail += f
        print()

    # 處理 diseased 資料夾
    diseased_input = images_path / 'diseased'
    diseased_output = processed_path / 'diseased'
    if diseased_input.exists():
        print("[病害蘋果]")
        s, f = process_folder(diseased_input, diseased_output, max_workers=2)
        total_success += s
        total_fail += f
        print()

    print("=" * 60)
    print(f"全部完成！總計成功: {total_success}, 失敗: {total_fail}")
    print(f"處理後的圖片在: {processed_path}")
    print("=" * 60)


if __name__ == '__main__':
    main()
