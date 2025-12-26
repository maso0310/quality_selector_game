/**
 * YOLOv8 蘋果品質偵測引擎
 * 使用 ONNX Runtime Web 在瀏覽器中執行推論
 */

class AppleDetector {
    constructor() {
        this.session = null;
        this.isLoaded = false;
        this.isLoading = false;
        this.inputSize = 640;  // YOLOv8 輸入大小
        this.classes = ['diseased', 'healthy'];  // 按字母順序
        this.confThreshold = 0.5;  // 信心度閾值
        this.iouThreshold = 0.45;  // NMS IoU 閾值

        // 顏色設定
        this.colors = {
            healthy: '#4CAF50',    // 綠色
            diseased: '#f44336'    // 紅色
        };
    }

    /**
     * 載入 ONNX 模型
     */
    async load(modelPath = 'static/models/apple_detector.onnx') {
        if (this.isLoaded) return true;
        if (this.isLoading) return false;

        this.isLoading = true;
        console.log('[AI] 開始載入模型...');

        try {
            // 設定 ONNX Runtime
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

            // 嘗試使用 WebGL 加速
            const options = {
                executionProviders: ['webgl', 'wasm'],
                graphOptimizationLevel: 'all'
            };

            this.session = await ort.InferenceSession.create(modelPath, options);
            this.isLoaded = true;
            this.isLoading = false;

            console.log('[AI] 模型載入成功');
            console.log('[AI] 輸入:', this.session.inputNames);
            console.log('[AI] 輸出:', this.session.outputNames);

            return true;
        } catch (error) {
            console.error('[AI] 模型載入失敗:', error);
            this.isLoading = false;
            return false;
        }
    }

    /**
     * 預處理圖片
     */
    preprocessImage(imageElement) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = this.inputSize;
        canvas.height = this.inputSize;

        // 計算縮放比例 (保持比例)
        const scale = Math.min(
            this.inputSize / imageElement.naturalWidth,
            this.inputSize / imageElement.naturalHeight
        );

        const scaledWidth = imageElement.naturalWidth * scale;
        const scaledHeight = imageElement.naturalHeight * scale;

        // 置中繪製 (letterbox)
        const offsetX = (this.inputSize - scaledWidth) / 2;
        const offsetY = (this.inputSize - scaledHeight) / 2;

        // 填充灰色背景
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, this.inputSize, this.inputSize);

        // 繪製圖片
        ctx.drawImage(
            imageElement,
            offsetX, offsetY,
            scaledWidth, scaledHeight
        );

        // 取得像素資料
        const imageData = ctx.getImageData(0, 0, this.inputSize, this.inputSize);
        const pixels = imageData.data;

        // 轉換為模型輸入格式 [1, 3, 640, 640] (NCHW, 正規化 0-1)
        const input = new Float32Array(3 * this.inputSize * this.inputSize);
        const size = this.inputSize * this.inputSize;

        for (let i = 0; i < size; i++) {
            input[i] = pixels[i * 4] / 255;           // R
            input[i + size] = pixels[i * 4 + 1] / 255;     // G
            input[i + size * 2] = pixels[i * 4 + 2] / 255; // B
        }

        return {
            input,
            scale,
            offsetX,
            offsetY,
            originalWidth: imageElement.naturalWidth,
            originalHeight: imageElement.naturalHeight
        };
    }

    /**
     * 執行偵測
     */
    async detect(imageElement) {
        if (!this.isLoaded) {
            console.warn('[AI] 模型尚未載入');
            return [];
        }

        try {
            // 預處理
            const { input, scale, offsetX, offsetY, originalWidth, originalHeight } =
                this.preprocessImage(imageElement);

            // 建立輸入 tensor
            const inputTensor = new ort.Tensor('float32', input, [1, 3, this.inputSize, this.inputSize]);

            // 執行推論
            const feeds = { [this.session.inputNames[0]]: inputTensor };
            const results = await this.session.run(feeds);

            // 取得輸出
            const output = results[this.session.outputNames[0]];

            // 後處理
            const detections = this.postprocess(
                output.data,
                output.dims,
                scale,
                offsetX,
                offsetY,
                originalWidth,
                originalHeight
            );

            return detections;

        } catch (error) {
            console.error('[AI] 偵測失敗:', error);
            return [];
        }
    }

    /**
     * 後處理：解析 YOLOv8 輸出並執行 NMS
     */
    postprocess(data, dims, scale, offsetX, offsetY, originalWidth, originalHeight) {
        // YOLOv8 輸出格式: [1, 6, 8400] (batch, [x,y,w,h,conf_cls0,conf_cls1], anchors)
        // 或 [1, 4+nc, 8400]
        const numClasses = this.classes.length;
        const numAnchors = dims[2];
        const numOutputs = dims[1];

        const boxes = [];

        for (let i = 0; i < numAnchors; i++) {
            // 取得座標
            const x = data[i];
            const y = data[numAnchors + i];
            const w = data[numAnchors * 2 + i];
            const h = data[numAnchors * 3 + i];

            // 取得各類別信心度
            let maxConf = 0;
            let maxClassId = 0;

            for (let c = 0; c < numClasses; c++) {
                const conf = data[numAnchors * (4 + c) + i];
                if (conf > maxConf) {
                    maxConf = conf;
                    maxClassId = c;
                }
            }

            // 過濾低信心度
            if (maxConf < this.confThreshold) continue;

            // 轉換座標 (從 letterbox 座標轉回原圖座標)
            const x1 = (x - w / 2 - offsetX) / scale;
            const y1 = (y - h / 2 - offsetY) / scale;
            const x2 = (x + w / 2 - offsetX) / scale;
            const y2 = (y + h / 2 - offsetY) / scale;

            // 限制在圖片範圍內
            const box = {
                x1: Math.max(0, x1),
                y1: Math.max(0, y1),
                x2: Math.min(originalWidth, x2),
                y2: Math.min(originalHeight, y2),
                confidence: maxConf,
                classId: maxClassId,
                className: this.classes[maxClassId]
            };

            // 計算中心點
            box.centerX = (box.x1 + box.x2) / 2;
            box.centerY = (box.y1 + box.y2) / 2;
            box.width = box.x2 - box.x1;
            box.height = box.y2 - box.y1;

            boxes.push(box);
        }

        // NMS
        const nmsBoxes = this.nms(boxes);

        return nmsBoxes;
    }

    /**
     * Non-Maximum Suppression
     */
    nms(boxes) {
        // 按信心度排序
        boxes.sort((a, b) => b.confidence - a.confidence);

        const selected = [];

        while (boxes.length > 0) {
            const best = boxes.shift();
            selected.push(best);

            // 移除重疊的框
            boxes = boxes.filter(box => {
                if (box.classId !== best.classId) return true;
                return this.iou(best, box) < this.iouThreshold;
            });
        }

        return selected;
    }

    /**
     * 計算 IoU
     */
    iou(boxA, boxB) {
        const xA = Math.max(boxA.x1, boxB.x1);
        const yA = Math.max(boxA.y1, boxB.y1);
        const xB = Math.min(boxA.x2, boxB.x2);
        const yB = Math.min(boxA.y2, boxB.y2);

        const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        const boxAArea = (boxA.x2 - boxA.x1) * (boxA.y2 - boxA.y1);
        const boxBArea = (boxB.x2 - boxB.x1) * (boxB.y2 - boxB.y1);

        return interArea / (boxAArea + boxBArea - interArea);
    }

    /**
     * 在 Canvas 上繪製偵測框
     */
    drawBoxes(canvas, detections, offsetX = 0, offsetY = 0, scale = 1) {
        const ctx = canvas.getContext('2d');

        for (const det of detections) {
            const color = this.colors[det.className];

            // 計算繪製座標
            const x = det.x1 * scale + offsetX;
            const y = det.y1 * scale + offsetY;
            const w = det.width * scale;
            const h = det.height * scale;

            // 繪製框框
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, w, h);

            // 繪製標籤背景
            const label = `${det.className === 'healthy' ? '健康' : '病害'} ${(det.confidence * 100).toFixed(0)}%`;
            ctx.font = 'bold 14px Arial';
            const textWidth = ctx.measureText(label).width;
            const textHeight = 18;

            ctx.fillStyle = color;
            ctx.fillRect(x, y - textHeight - 2, textWidth + 8, textHeight + 2);

            // 繪製標籤文字
            ctx.fillStyle = '#fff';
            ctx.fillText(label, x + 4, y - 6);

            // 繪製中心點
            const cx = det.centerX * scale + offsetX;
            const cy = det.centerY * scale + offsetY;

            ctx.beginPath();
            ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
        }
    }

    /**
     * 清除 Canvas
     */
    clearCanvas(canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// 建立全域實例
window.appleDetector = new AppleDetector();
