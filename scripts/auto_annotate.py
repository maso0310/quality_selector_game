"""
自動標註工具 - 利用去背圖片產生 YOLO 格式標註
原理：去背圖片有透明區域，用 OpenCV 偵測非透明區域輪廓產生 bounding box
"""

import os
import cv2
import numpy as np
from pathlib import Path
import shutil
import random
import yaml


def get_bounding_box_from_alpha(image_path):
    """
    從去背圖片的 alpha 通道取得 bounding box

    Args:
        image_path: 圖片路徑

    Returns:
        (x_center, y_center, width, height) 正規化座標 (0-1)
        如果偵測失敗回傳 None
    """
    # 讀取圖片 (包含 alpha 通道)
    img = cv2.imread(str(image_path), cv2.IMREAD_UNCHANGED)

    if img is None:
        return None

    h, w = img.shape[:2]

    # 檢查是否有 alpha 通道
    if img.shape[2] == 4:
        # 使用 alpha 通道
        alpha = img[:, :, 3]
    else:
        # 沒有 alpha 通道，使用灰度轉換
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, alpha = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)

    # 找出非透明區域的輪廓
    contours, _ = cv2.findContours(alpha, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return None

    # 合併所有輪廓取得最大外框
    all_points = np.vstack(contours)
    x, y, bw, bh = cv2.boundingRect(all_points)

    # 轉換為 YOLO 格式 (正規化中心座標 + 寬高)
    x_center = (x + bw / 2) / w
    y_center = (y + bh / 2) / h
    width = bw / w
    height = bh / h

    return (x_center, y_center, width, height)


def create_yolo_dataset(train_folder, output_folder, val_ratio=0.2, seed=42):
    """
    建立 YOLO 格式資料集

    Args:
        train_folder: 訓練圖片資料夾 (包含 healthy/ 和 diseased/ 子資料夾)
        output_folder: 輸出資料集資料夾
        val_ratio: 驗證集比例
        seed: 隨機種子
    """
    train_path = Path(train_folder)
    output_path = Path(output_folder)

    # 類別定義 (按字母順序，YOLOv8 預設)
    classes = ['diseased', 'healthy']
    class_to_id = {cls: idx for idx, cls in enumerate(classes)}

    # 建立輸出目錄結構
    dirs = [
        output_path / 'images' / 'train',
        output_path / 'images' / 'val',
        output_path / 'labels' / 'train',
        output_path / 'labels' / 'val',
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("YOLO 自動標註工具")
    print("=" * 60)
    print(f"來源資料夾: {train_path}")
    print(f"輸出資料夾: {output_path}")
    print(f"類別: {classes}")
    print()

    # 設定隨機種子
    random.seed(seed)

    total_images = 0
    total_annotated = 0
    failed_images = []

    for class_name in ['healthy', 'diseased']:
        class_folder = train_path / class_name
        if not class_folder.exists():
            print(f"[!] 找不到資料夾: {class_folder}")
            continue

        class_id = class_to_id[class_name]

        # 收集所有圖片
        image_files = list(class_folder.glob('*.png')) + list(class_folder.glob('*.jpg'))
        random.shuffle(image_files)

        # 分割訓練/驗證
        val_count = int(len(image_files) * val_ratio)
        val_files = image_files[:val_count]
        train_files = image_files[val_count:]

        print(f"[{class_name}]")
        print(f"  總共: {len(image_files)} 張")
        print(f"  訓練: {len(train_files)} 張")
        print(f"  驗證: {len(val_files)} 張")

        # 處理訓練集
        for img_file in train_files:
            success = process_image(
                img_file, class_id, class_name,
                output_path / 'images' / 'train',
                output_path / 'labels' / 'train'
            )
            total_images += 1
            if success:
                total_annotated += 1
            else:
                failed_images.append(str(img_file))

        # 處理驗證集
        for img_file in val_files:
            success = process_image(
                img_file, class_id, class_name,
                output_path / 'images' / 'val',
                output_path / 'labels' / 'val'
            )
            total_images += 1
            if success:
                total_annotated += 1
            else:
                failed_images.append(str(img_file))

        print()

    # 建立 data.yaml
    data_yaml = {
        'path': str(output_path.absolute()),
        'train': 'images/train',
        'val': 'images/val',
        'names': {i: name for i, name in enumerate(classes)}
    }

    yaml_path = output_path / 'data.yaml'
    with open(yaml_path, 'w', encoding='utf-8') as f:
        yaml.dump(data_yaml, f, default_flow_style=False, allow_unicode=True)

    print("=" * 60)
    print(f"完成！")
    print(f"  總圖片: {total_images}")
    print(f"  成功標註: {total_annotated}")
    print(f"  失敗: {len(failed_images)}")
    print(f"  data.yaml: {yaml_path}")
    print("=" * 60)

    if failed_images:
        print("\n標註失敗的圖片:")
        for f in failed_images[:10]:
            print(f"  - {f}")
        if len(failed_images) > 10:
            print(f"  ... 還有 {len(failed_images) - 10} 張")


def process_image(img_path, class_id, class_name, output_images_dir, output_labels_dir):
    """
    處理單張圖片：複製圖片並產生標註檔
    """
    # 取得 bounding box
    bbox = get_bounding_box_from_alpha(img_path)

    if bbox is None:
        return False

    x_center, y_center, width, height = bbox

    # 產生唯一檔名 (避免重複)
    new_name = f"{class_name}_{img_path.stem}"

    # 複製圖片
    output_img = output_images_dir / f"{new_name}.png"
    shutil.copy2(img_path, output_img)

    # 產生標註檔
    output_label = output_labels_dir / f"{new_name}.txt"
    with open(output_label, 'w') as f:
        f.write(f"{class_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}\n")

    return True


def visualize_sample(dataset_folder, num_samples=5):
    """
    視覺化幾張標註結果，驗證標註正確性
    """
    dataset_path = Path(dataset_folder)
    images_dir = dataset_path / 'images' / 'train'
    labels_dir = dataset_path / 'labels' / 'train'

    output_dir = dataset_path / 'visualization'
    output_dir.mkdir(exist_ok=True)

    image_files = list(images_dir.glob('*.png'))[:num_samples]

    print(f"\n視覺化 {len(image_files)} 張標註結果...")

    for img_file in image_files:
        label_file = labels_dir / f"{img_file.stem}.txt"

        if not label_file.exists():
            continue

        # 讀取圖片
        img = cv2.imread(str(img_file))
        h, w = img.shape[:2]

        # 讀取標註
        with open(label_file, 'r') as f:
            line = f.readline().strip()
            parts = line.split()
            class_id = int(parts[0])
            x_center, y_center, bw, bh = map(float, parts[1:])

        # 轉換為像素座標
        x1 = int((x_center - bw/2) * w)
        y1 = int((y_center - bh/2) * h)
        x2 = int((x_center + bw/2) * w)
        y2 = int((y_center + bh/2) * h)

        # 繪製框框
        color = (0, 255, 0) if class_id == 1 else (0, 0, 255)  # 綠=healthy, 紅=diseased
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 3)

        # 標籤文字
        label = 'healthy' if class_id == 1 else 'diseased'
        cv2.putText(img, label, (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

        # 儲存
        output_file = output_dir / f"viz_{img_file.name}"
        cv2.imwrite(str(output_file), img)

    print(f"視覺化結果已儲存至: {output_dir}")


def main():
    # 專案路徑
    base_path = Path(__file__).parent.parent
    train_folder = base_path / 'images' / 'train'
    output_folder = base_path / 'datasets' / 'apple_detection'

    # 建立資料集
    create_yolo_dataset(train_folder, output_folder)

    # 視覺化驗證
    visualize_sample(output_folder, num_samples=5)


if __name__ == '__main__':
    main()
