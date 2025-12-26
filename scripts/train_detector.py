"""
YOLOv8 蘋果品質偵測模型訓練腳本
訓練完成後自動匯出 ONNX 格式供瀏覽器使用

用法:
    py scripts/train_detector.py          # 從頭訓練
    py scripts/train_detector.py --resume # 繼續訓練
"""

from ultralytics import YOLO
from pathlib import Path
import shutil
import argparse


def train_model(resume=False):
    """訓練 YOLOv8 偵測模型

    Args:
        resume: 是否從上次的 checkpoint 繼續訓練
    """

    # 專案路徑
    base_path = Path(__file__).parent.parent
    data_yaml = base_path / 'datasets' / 'apple_detection' / 'data.yaml'
    last_pt = base_path / 'runs' / 'detect' / 'apple_detector' / 'weights' / 'last.pt'

    print("=" * 60)
    print("YOLOv8 蘋果品質偵測模型訓練")
    print("=" * 60)

    if resume:
        # 繼續訓練模式
        if not last_pt.exists():
            print(f"錯誤: 找不到 checkpoint 檔案: {last_pt}")
            print("請先執行一次完整訓練，或使用 --resume 時確保有之前的訓練紀錄")
            return None

        print(f"模式: 繼續訓練")
        print(f"Checkpoint: {last_pt}")
        print()

        # 載入上次的 checkpoint
        model = YOLO(str(last_pt))

        # 繼續訓練 (自動讀取之前的設定)
        results = model.train(
            resume=True,
            data=str(data_yaml),  # 使用當前電腦的路徑
            project=str(base_path / 'runs' / 'detect'),
            name='apple_detector',
            exist_ok=True,
        )
    else:
        # 從頭訓練模式
        print(f"模式: 從頭訓練")
        print(f"資料集: {data_yaml}")
        print()

        # 載入預訓練模型 (nano 版本，適合瀏覽器部署)
        model = YOLO('yolov8n.pt')

        # 訓練設定
        results = model.train(
            data=str(data_yaml),
            epochs=50,              # 訓練輪數
            imgsz=640,              # 輸入圖片大小
            batch=16,               # 批次大小 (視 GPU 記憶體調整)
            patience=10,            # 早停耐心值
            save=True,              # 儲存檢查點
            project=str(base_path / 'runs' / 'detect'),
            name='apple_detector',
            exist_ok=True,          # 覆蓋既有結果
            pretrained=True,        # 使用預訓練權重
            optimizer='auto',       # 自動選擇優化器
            verbose=True,           # 顯示詳細資訊
            seed=42,                # 隨機種子
            deterministic=True,     # 確保可重現性

            # 資料增強
            hsv_h=0.015,            # 色調變化
            hsv_s=0.7,              # 飽和度變化
            hsv_v=0.4,              # 亮度變化
            degrees=15,             # 旋轉角度
            translate=0.1,          # 平移
            scale=0.5,              # 縮放
            fliplr=0.5,             # 水平翻轉機率
            mosaic=0.5,             # Mosaic 增強
        )

    print("\n訓練完成！")
    print(f"最佳模型: {results.save_dir / 'weights' / 'best.pt'}")

    return results.save_dir


def export_to_onnx(model_dir):
    """匯出模型為 ONNX 格式"""

    model_path = Path(model_dir) / 'weights' / 'best.pt'

    print("\n" + "=" * 60)
    print("匯出 ONNX 模型")
    print("=" * 60)

    # 載入訓練好的模型
    model = YOLO(str(model_path))

    # 匯出為 ONNX
    onnx_path = model.export(
        format='onnx',
        imgsz=640,
        simplify=True,      # 簡化模型
        opset=12,           # ONNX opset 版本 (相容性較好)
        dynamic=False,      # 固定輸入大小 (瀏覽器較穩定)
    )

    print(f"ONNX 模型已匯出: {onnx_path}")

    # 複製到 static/models 資料夾
    base_path = Path(__file__).parent.parent
    static_models = base_path / 'static' / 'models'
    static_models.mkdir(parents=True, exist_ok=True)

    dest_path = static_models / 'apple_detector.onnx'
    shutil.copy2(onnx_path, dest_path)

    print(f"已複製至: {dest_path}")

    # 顯示模型大小
    size_mb = dest_path.stat().st_size / (1024 * 1024)
    print(f"模型大小: {size_mb:.2f} MB")

    return dest_path


def validate_model(model_dir):
    """驗證模型效能"""

    model_path = Path(model_dir) / 'weights' / 'best.pt'

    print("\n" + "=" * 60)
    print("模型驗證")
    print("=" * 60)

    model = YOLO(str(model_path))

    # 驗證
    base_path = Path(__file__).parent.parent
    data_yaml = base_path / 'datasets' / 'apple_detection' / 'data.yaml'

    metrics = model.val(data=str(data_yaml))

    print(f"\n驗證結果:")
    print(f"  mAP50: {metrics.box.map50:.4f}")
    print(f"  mAP50-95: {metrics.box.map:.4f}")
    print(f"  Precision: {metrics.box.mp:.4f}")
    print(f"  Recall: {metrics.box.mr:.4f}")


def main():
    # 解析命令列參數
    parser = argparse.ArgumentParser(description='YOLOv8 蘋果品質偵測模型訓練')
    parser.add_argument('--resume', action='store_true',
                        help='從上次的 checkpoint 繼續訓練')
    args = parser.parse_args()

    # 訓練模型
    model_dir = train_model(resume=args.resume)

    if model_dir is None:
        return

    # 驗證模型
    validate_model(model_dir)

    # 匯出 ONNX
    export_to_onnx(model_dir)

    print("\n" + "=" * 60)
    print("全部完成！")
    print("模型已準備好供瀏覽器使用")
    print("=" * 60)


if __name__ == '__main__':
    main()
