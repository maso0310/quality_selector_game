/**
 * AI 偵測 Web Worker
 * 在獨立線程中執行 ONNX 推論，不阻塞主線程動畫
 */

// 載入 ONNX Runtime
importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');

let session = null;
let isLoaded = false;
const inputSize = 640;
const classes = ['diseased', 'healthy'];
const confThreshold = 0.5;
const iouThreshold = 0.45;

/**
 * 載入模型
 */
async function loadModel(modelPath) {
    if (isLoaded) return { success: true };

    try {
        console.log('[Worker] 開始載入模型...');

        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

        session = await ort.InferenceSession.create(modelPath, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });

        isLoaded = true;
        console.log('[Worker] 模型載入成功');
        return { success: true };
    } catch (error) {
        console.error('[Worker] 模型載入失敗:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 執行偵測
 */
async function detect(imageData, width, height) {
    if (!isLoaded) {
        return { success: false, error: '模型未載入' };
    }

    try {
        // 預處理
        const { input, scale, offsetX, offsetY } = preprocessImageData(imageData, width, height);

        // 建立輸入 tensor
        const inputTensor = new ort.Tensor('float32', input, [1, 3, inputSize, inputSize]);

        // 執行推論
        const feeds = { [session.inputNames[0]]: inputTensor };
        const results = await session.run(feeds);

        // 取得輸出
        const output = results[session.outputNames[0]];

        // 後處理
        const detections = postprocess(output.data, output.dims, scale, offsetX, offsetY, width, height);

        return { success: true, detections };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 預處理圖片數據
 */
function preprocessImageData(imageData, originalWidth, originalHeight) {
    // 計算縮放比例
    const scale = Math.min(inputSize / originalWidth, inputSize / originalHeight);
    const scaledWidth = originalWidth * scale;
    const scaledHeight = originalHeight * scale;
    const offsetX = (inputSize - scaledWidth) / 2;
    const offsetY = (inputSize - scaledHeight) / 2;

    // 建立輸入陣列
    const input = new Float32Array(3 * inputSize * inputSize);
    const size = inputSize * inputSize;

    // 填充灰色背景 (0.5)
    for (let i = 0; i < size; i++) {
        input[i] = 0.5;
        input[i + size] = 0.5;
        input[i + size * 2] = 0.5;
    }

    // 將圖片數據縮放並放入正確位置
    for (let y = 0; y < scaledHeight; y++) {
        for (let x = 0; x < scaledWidth; x++) {
            const srcX = Math.floor(x / scale);
            const srcY = Math.floor(y / scale);
            const srcIdx = (srcY * originalWidth + srcX) * 4;

            const dstX = Math.floor(offsetX + x);
            const dstY = Math.floor(offsetY + y);
            const dstIdx = dstY * inputSize + dstX;

            if (dstIdx >= 0 && dstIdx < size) {
                input[dstIdx] = imageData[srcIdx] / 255;
                input[dstIdx + size] = imageData[srcIdx + 1] / 255;
                input[dstIdx + size * 2] = imageData[srcIdx + 2] / 255;
            }
        }
    }

    return { input, scale, offsetX, offsetY };
}

/**
 * 後處理
 */
function postprocess(data, dims, scale, offsetX, offsetY, originalWidth, originalHeight) {
    const numClasses = classes.length;
    const numAnchors = dims[2];
    const boxes = [];

    for (let i = 0; i < numAnchors; i++) {
        const x = data[i];
        const y = data[numAnchors + i];
        const w = data[numAnchors * 2 + i];
        const h = data[numAnchors * 3 + i];

        let maxConf = 0;
        let maxClassId = 0;

        for (let c = 0; c < numClasses; c++) {
            const conf = data[numAnchors * (4 + c) + i];
            if (conf > maxConf) {
                maxConf = conf;
                maxClassId = c;
            }
        }

        if (maxConf < confThreshold) continue;

        const x1 = (x - w / 2 - offsetX) / scale;
        const y1 = (y - h / 2 - offsetY) / scale;
        const x2 = (x + w / 2 - offsetX) / scale;
        const y2 = (y + h / 2 - offsetY) / scale;

        const box = {
            x1: Math.max(0, x1),
            y1: Math.max(0, y1),
            x2: Math.min(originalWidth, x2),
            y2: Math.min(originalHeight, y2),
            confidence: maxConf,
            classId: maxClassId,
            className: classes[maxClassId]
        };

        box.centerX = (box.x1 + box.x2) / 2;
        box.centerY = (box.y1 + box.y2) / 2;
        box.width = box.x2 - box.x1;
        box.height = box.y2 - box.y1;

        boxes.push(box);
    }

    return nms(boxes);
}

/**
 * NMS
 */
function nms(boxes) {
    boxes.sort((a, b) => b.confidence - a.confidence);
    const selected = [];

    while (boxes.length > 0) {
        const best = boxes.shift();
        selected.push(best);

        boxes = boxes.filter(box => {
            if (box.classId !== best.classId) return true;
            return iou(best, box) < iouThreshold;
        });
    }

    return selected;
}

/**
 * IoU
 */
function iou(boxA, boxB) {
    const xA = Math.max(boxA.x1, boxB.x1);
    const yA = Math.max(boxA.y1, boxB.y1);
    const xB = Math.min(boxA.x2, boxB.x2);
    const yB = Math.min(boxA.y2, boxB.y2);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const boxAArea = (boxA.x2 - boxA.x1) * (boxA.y2 - boxA.y1);
    const boxBArea = (boxB.x2 - boxB.x1) * (boxB.y2 - boxB.y1);

    return interArea / (boxAArea + boxBArea - interArea);
}

// 監聽主線程訊息
self.onmessage = async function(e) {
    const { type, id, data } = e.data;

    switch (type) {
        case 'load':
            const loadResult = await loadModel(data.modelPath);
            self.postMessage({ type: 'loaded', id, ...loadResult });
            break;

        case 'detect':
            const detectResult = await detect(data.imageData, data.width, data.height);
            self.postMessage({ type: 'detected', id, cropId: data.cropId, ...detectResult });
            break;
    }
};
