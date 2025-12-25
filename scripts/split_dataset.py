"""
資料集分割工具
將處理過的圖片分成訓練集(80%)和驗證集(20%)
- 驗證集: 上傳 GitHub，供網站輸送帶展示用
- 訓練集: 保留本機，供未來模型訓練用
"""

import os
import shutil
import random
from pathlib import Path


def split_dataset(source_folder, train_folder, val_folder, val_ratio=0.2, seed=42):
    """
    將圖片資料夾分割成訓練集和驗證集

    Args:
        source_folder: 來源資料夾 (已去背的圖片)
        train_folder: 訓練集輸出資料夾
        val_folder: 驗證集輸出資料夾
        val_ratio: 驗證集比例 (預設 20%)
        seed: 隨機種子，確保可重現性
    """
    source_path = Path(source_folder)
    train_path = Path(train_folder)
    val_path = Path(val_folder)

    # 建立輸出資料夾
    train_path.mkdir(parents=True, exist_ok=True)
    val_path.mkdir(parents=True, exist_ok=True)

    # 收集所有圖片
    image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'}
    images = [
        f for f in source_path.iterdir()
        if f.is_file() and f.suffix.lower() in image_extensions
    ]

    if not images:
        print(f"  [!] 沒有找到圖片: {source_folder}")
        return 0, 0

    # 設定隨機種子並打亂順序
    random.seed(seed)
    random.shuffle(images)

    # 計算分割點
    total = len(images)
    val_count = int(total * val_ratio)
    train_count = total - val_count

    # 分割
    val_images = images[:val_count]
    train_images = images[val_count:]

    print(f"  [*] 共 {total} 張圖片")
    print(f"  [*] 訓練集: {train_count} 張 ({100-val_ratio*100:.0f}%)")
    print(f"  [*] 驗證集: {val_count} 張 ({val_ratio*100:.0f}%)")

    # 複製驗證集圖片
    print(f"  [*] 複製驗證集圖片...")
    for img in val_images:
        dest = val_path / img.name
        if not dest.exists():
            shutil.copy2(img, dest)

    # 複製訓練集圖片
    print(f"  [*] 複製訓練集圖片...")
    for img in train_images:
        dest = train_path / img.name
        if not dest.exists():
            shutil.copy2(img, dest)

    print(f"  [✓] 完成!")
    return train_count, val_count


def main():
    # 專案路徑
    base_path = Path(__file__).parent.parent
    images_path = base_path / 'images'
    processed_path = images_path / 'processed'

    # 輸出路徑
    train_path = images_path / 'train'      # 訓練集 (不上傳 GitHub)
    val_path = images_path / 'validation'   # 驗證集 (上傳 GitHub)

    print("=" * 60)
    print("資料集分割工具")
    print("=" * 60)
    print(f"來源: {processed_path}")
    print(f"訓練集 (80%): {train_path} [本機保留]")
    print(f"驗證集 (20%): {val_path} [上傳 GitHub]")
    print()

    total_train = 0
    total_val = 0

    # 處理健康蘋果
    healthy_source = processed_path / 'healthy'
    if healthy_source.exists():
        print("[健康蘋果]")
        t, v = split_dataset(
            healthy_source,
            train_path / 'healthy',
            val_path / 'healthy',
            val_ratio=0.2
        )
        total_train += t
        total_val += v
        print()

    # 處理病害蘋果
    diseased_source = processed_path / 'diseased'
    if diseased_source.exists():
        print("[病害蘋果]")
        t, v = split_dataset(
            diseased_source,
            train_path / 'diseased',
            val_path / 'diseased',
            val_ratio=0.2
        )
        total_train += t
        total_val += v
        print()

    print("=" * 60)
    print(f"全部完成!")
    print(f"訓練集: {total_train} 張 -> {train_path}")
    print(f"驗證集: {total_val} 張 -> {val_path}")
    print()
    print("[下一步]")
    print("1. 驗證集已準備好上傳 GitHub")
    print("2. 訓練集保留在本機供未來訓練使用")
    print("=" * 60)


if __name__ == '__main__':
    main()
