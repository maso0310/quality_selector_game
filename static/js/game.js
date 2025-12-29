/**
 * 農作物品質分類遊戲 - 主遊戲邏輯
 * 支援 AI 自動偵測模式
 */

class QualitySelectorGame {
    constructor() {
        // 遊戲狀態
        this.isRunning = false;
        this.isPaused = false;
        this.score = 0;
        this.correct = 0;
        this.wrong = 0;
        this.missed = 0;
        this.level = 1;

        // 遊戲設定
        this.speed = 3;          // 輸送帶速度 (1-6)
        this.spawnRate = 2;      // 生成頻率 (1-6)
        this.crops = [];         // 目前在輸送帶上的作物
        this.cropIdCounter = 0;

        // 分類點位置 (從右邊算起的百分比)
        this.sortingZoneStart = 15;  // 分類區起始 (%)
        this.sortingZoneEnd = 25;    // 分類區結束 (%)

        // 圖片資源
        this.imageList = {
            healthy: [],
            diseased: [],
            useRealImages: false
        };

        // 預載圖片快取
        this.preloadedImages = {
            healthy: [],
            diseased: []
        };

        // AI 模式相關
        this.aiMode = false;           // AI 自動模式開關
        this.aiWorker = null;          // AI Web Worker
        this.detectionCanvas = null;   // 偵測框 Canvas
        this.detectionCtx = null;      // Canvas 2D 上下文
        this.aiModelLoaded = false;    // 模型是否已載入
        this.aiDetectionLoop = null;   // AI 偵測框繪製循環
        this.pendingDetections = new Map();  // 等待中的偵測請求
        this.aiStats = {               // AI 統計
            correct: 0,
            wrong: 0,
            total: 0
        };
        this.playerStats = {           // 玩家統計 (手動模式)
            correct: 0,
            wrong: 0,
            total: 0
        };

        // 判定記錄 (用於檢視詳細資訊)
        this.resultRecords = {
            correct: [],   // 正確分類的蘋果
            wrong: [],     // 錯誤分類的蘋果
            missed: []     // 遺漏的蘋果
        };

        // DOM 元素
        this.conveyor = document.getElementById('conveyor');
        this.scoreEl = document.getElementById('score');
        this.correctEl = document.getElementById('correct');
        this.wrongEl = document.getElementById('wrong');
        this.missedEl = document.getElementById('missed');
        this.levelEl = document.getElementById('level');

        // 控制元素
        this.speedSlider = document.getElementById('speed-slider');
        this.spawnRateSlider = document.getElementById('spawn-rate');
        this.speedValue = document.getElementById('speed-value');
        this.spawnValue = document.getElementById('spawn-value');
        this.startBtn = document.getElementById('start-btn');
        this.pauseBtn = document.getElementById('pause-btn');
        this.resetBtn = document.getElementById('reset-btn');

        // AI 控制元素
        this.aiToggleBtn = document.getElementById('ai-toggle-btn');
        this.aiStatusEl = document.getElementById('ai-status');
        this.aiStatsPanel = document.getElementById('ai-stats-panel');
        this.aiAccuracyEl = document.getElementById('ai-accuracy');

        // 分類區
        this.zoneHealthy = document.getElementById('zone-healthy');
        this.zoneDiseased = document.getElementById('zone-diseased');

        // 蘋果產生器 (備用)
        this.appleGenerator = new AppleGenerator();

        // 計時器
        this.gameLoop = null;
        this.spawnTimer = null;

        // 初始化
        this.init();
    }

    async init() {
        await this.loadImageList();
        this.initDetectionCanvas();
        this.bindEvents();
        this.updateUI();

        // 初始化 AI 偵測器
        this.initAIDetector();
    }

    /**
     * 初始化偵測框 Canvas
     */
    initDetectionCanvas() {
        this.detectionCanvas = document.getElementById('detection-overlay');
        if (this.detectionCanvas) {
            this.detectionCtx = this.detectionCanvas.getContext('2d');
            this.resizeDetectionCanvas();

            // 監聽視窗大小變化
            window.addEventListener('resize', () => this.resizeDetectionCanvas());
        }
    }

    /**
     * 調整偵測 Canvas 大小
     */
    resizeDetectionCanvas() {
        if (!this.detectionCanvas || !this.conveyor) return;

        const rect = this.conveyor.getBoundingClientRect();
        this.detectionCanvas.width = rect.width;
        this.detectionCanvas.height = rect.height;
    }

    /**
     * 初始化 AI 偵測器 (使用 Web Worker)
     */
    async initAIDetector() {
        this.updateAIStatus('loading', '模型載入中...');

        try {
            // 建立 Web Worker
            this.aiWorker = new Worker('static/js/ai-worker.js');

            // 監聽 Worker 訊息
            this.aiWorker.onmessage = (e) => this.handleWorkerMessage(e);
            this.aiWorker.onerror = (e) => {
                console.error('[AI] Worker 錯誤:', e);
                this.updateAIStatus('error', 'Worker 錯誤');
            };

            console.log('[AI] Worker 已建立，開始載入模型...');

            // 在主線程載入模型檔案，再傳給 Worker
            const modelPath = 'static/models/apple_detector.onnx';
            const response = await fetch(modelPath);
            if (!response.ok) {
                throw new Error(`無法載入模型: ${response.status}`);
            }
            const modelBuffer = await response.arrayBuffer();

            console.log('[AI] 模型檔案已載入，傳送給 Worker...');

            // 傳送模型給 Worker
            this.aiWorker.postMessage({
                type: 'load',
                id: 'init',
                data: { modelBuffer }
            }, [modelBuffer]);  // 使用 Transferable 提高效率

        } catch (error) {
            console.error('[AI] 初始化錯誤:', error);
            this.updateAIStatus('error', '模型載入失敗');
        }
    }

    /**
     * 處理 Worker 訊息
     */
    handleWorkerMessage(e) {
        const { type, id, cropId, success, detections, error } = e.data;

        switch (type) {
            case 'loaded':
                if (success) {
                    this.aiModelLoaded = true;
                    this.updateAIStatus('ready', 'AI 就緒');
                    if (this.aiToggleBtn) {
                        this.aiToggleBtn.disabled = false;
                    }
                    console.log('[AI] 模型載入完成 (Worker)');
                } else {
                    console.error('[AI] 模型載入失敗:', error);
                    this.updateAIStatus('error', '模型載入失敗');
                }
                break;

            case 'detected':
                // 移除等待中的請求
                this.pendingDetections.delete(cropId);

                // 找到對應的作物
                const crop = this.crops.find(c => c.id === cropId);
                if (!crop || crop.sorted) break;

                if (success && detections && detections.length > 0) {
                    // 偵測成功，儲存結果
                    crop.aiDetection = detections[0];
                    crop.detectAttempts = 0;  // 重置嘗試次數
                } else {
                    // 偵測無結果，追蹤嘗試次數以便重試
                    crop.detectAttempts = (crop.detectAttempts || 0) + 1;
                    // 最多重試 5 次
                    if (crop.detectAttempts >= 5) {
                        // 標記為無法偵測，避免無限重試
                        crop.aiDetection = null;
                        crop.detectFailed = true;
                    }
                }
                break;
        }
    }

    /**
     * 更新 AI 狀態顯示
     */
    updateAIStatus(status, text) {
        if (!this.aiStatusEl) return;

        this.aiStatusEl.textContent = text;
        this.aiStatusEl.className = 'ai-status';

        if (status === 'ready') {
            this.aiStatusEl.classList.add('ready');
        } else if (status === 'loading') {
            this.aiStatusEl.classList.add('loading');
        } else if (status === 'error') {
            this.aiStatusEl.classList.add('error');
        }
    }

    async loadImageList() {
        try {
            const response = await fetch('api/images/list');
            if (response.ok) {
                this.imageList = await response.json();
                console.log(`[遊戲] 載入圖片成功: 健康 ${this.imageList.healthy.length} 張, 病害 ${this.imageList.diseased.length} 張`);

                if (this.imageList.useRealImages) {
                    console.log('[遊戲] 使用真實圖片模式');
                    // 預載部分圖片
                    this.preloadImages();
                } else {
                    console.log('[遊戲] 使用模擬圖片模式');
                }
            }
        } catch (error) {
            console.log('[遊戲] 無法載入圖片列表，使用模擬圖片');
            this.imageList.useRealImages = false;
        }
    }

    preloadImages() {
        // 預載前 30 張圖片 (每種類型各 15 張)
        const preloadCount = 15;

        ['healthy', 'diseased'].forEach(type => {
            const list = this.imageList[type];
            const toPreload = list.slice(0, Math.min(preloadCount, list.length));

            toPreload.forEach(imageName => {
                const img = new Image();
                img.src = `images/validation/${type}/${imageName}`;
                img.onload = () => {
                    this.preloadedImages[type].push({
                        name: imageName,
                        img: img
                    });
                };
            });
        });

        console.log('[遊戲] 開始預載圖片...');
    }

    getPreloadedImage(type) {
        // 優先使用已預載的圖片
        if (this.preloadedImages[type].length > 0) {
            const cached = this.preloadedImages[type].shift();
            // 補充預載一張新的
            this.preloadOneImage(type);
            return cached;
        }
        return null;
    }

    preloadOneImage(type) {
        const list = this.imageList[type];
        if (list.length === 0) return;

        const randomIndex = Math.floor(Math.random() * list.length);
        const imageName = list[randomIndex];

        const img = new Image();
        img.src = `images/validation/${type}/${imageName}`;
        img.onload = () => {
            this.preloadedImages[type].push({
                name: imageName,
                img: img
            });
        };
    }

    bindEvents() {
        // 控制滑桿
        this.speedSlider.addEventListener('input', (e) => {
            this.speed = parseInt(e.target.value);
            this.speedValue.textContent = this.speed;
            this.updateBeltSpeed();
        });

        this.spawnRateSlider.addEventListener('input', (e) => {
            this.spawnRate = parseInt(e.target.value);
            this.spawnValue.textContent = this.spawnRate;
            if (this.isRunning && !this.isPaused) {
                this.restartSpawnTimer();
            }
        });

        // 按鈕
        this.startBtn.addEventListener('click', () => this.start());
        this.pauseBtn.addEventListener('click', () => this.togglePause());
        this.resetBtn.addEventListener('click', () => this.reset());

        // AI 模式切換按鈕
        if (this.aiToggleBtn) {
            this.aiToggleBtn.addEventListener('click', () => this.toggleAIMode());
        }

        // 鍵盤控制
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));

        // 計分板點擊事件 (查看判定記錄)
        if (this.correctEl) {
            this.correctEl.parentElement.addEventListener('click', () => this.showRecordsModal('correct'));
            this.correctEl.parentElement.classList.add('clickable');
        }
        if (this.wrongEl) {
            this.wrongEl.parentElement.addEventListener('click', () => this.showRecordsModal('wrong'));
            this.wrongEl.parentElement.classList.add('clickable');
        }
        if (this.missedEl) {
            this.missedEl.parentElement.addEventListener('click', () => this.showRecordsModal('missed'));
            this.missedEl.parentElement.classList.add('clickable');
        }
    }

    /**
     * 切換 AI 自動模式
     */
    toggleAIMode() {
        if (!this.aiModelLoaded) {
            console.log('[AI] 模型尚未載入');
            return;
        }

        this.aiMode = !this.aiMode;

        if (this.aiMode) {
            // 開啟 AI 模式
            this.aiToggleBtn.classList.add('active');
            this.aiToggleBtn.textContent = 'AI 模式開啟';
            this.updateAIStatus('ready', 'AI 自動分類中');

            // 顯示統計面板
            if (this.aiStatsPanel) {
                this.aiStatsPanel.style.display = 'block';
            }

            // 開始 AI 偵測循環
            this.startAIDetection();

            console.log('[AI] AI 自動模式開啟');
        } else {
            // 關閉 AI 模式
            this.aiToggleBtn.classList.remove('active');
            this.aiToggleBtn.textContent = 'AI 自動模式';
            this.updateAIStatus('ready', 'AI 就緒');

            // 停止 AI 偵測循環
            this.stopAIDetection();

            // 清除偵測框
            this.clearDetectionCanvas();

            console.log('[AI] AI 自動模式關閉');
        }
    }

    /**
     * 開始 AI 偵測循環
     */
    startAIDetection() {
        if (this.aiDetectionLoop) return;

        // 動畫循環：繪製偵測框 + 檢查自動分類 + 發送偵測請求
        const loop = () => {
            if (!this.aiMode) return;

            if (this.isRunning && !this.isPaused) {
                // 清除 Canvas
                this.clearDetectionCanvas();

                // 處理每個作物
                for (const crop of this.crops) {
                    if (crop.sorted) continue;

                    const cropEl = document.getElementById(`crop-${crop.id}`);
                    if (!cropEl) continue;

                    // 如果有偵測結果，繪製框框並檢查自動分類
                    if (crop.aiDetection) {
                        this.drawCropDetection(crop, cropEl, crop.aiDetection);
                        this.checkAIAutoSort(crop);
                    }

                    // 如果還沒有偵測結果、沒有等待中的請求、且沒有失敗過，發送偵測請求
                    if (!crop.aiDetection && !crop.detectFailed && !this.pendingDetections.has(crop.id)) {
                        this.requestDetection(crop, cropEl);
                    }
                }
            }

            this.aiDetectionLoop = requestAnimationFrame(loop);
        };

        this.aiDetectionLoop = requestAnimationFrame(loop);
    }

    /**
     * 發送偵測請求到 Worker
     */
    requestDetection(crop, cropEl) {
        const imgEl = cropEl.querySelector('img');

        // 圖片尚未載入完成，等待載入後再偵測
        if (!imgEl || !imgEl.complete || !imgEl.naturalWidth) {
            // 如果圖片存在但還在載入，監聽載入完成事件
            if (imgEl && !imgEl.complete) {
                imgEl.addEventListener('load', () => {
                    // 載入完成後，如果還沒偵測過就發送請求
                    if (!crop.aiDetection && !crop.detectFailed && !this.pendingDetections.has(crop.id)) {
                        this.sendDetectionRequest(crop, imgEl);
                    }
                }, { once: true });
            }
            return;
        }

        this.sendDetectionRequest(crop, imgEl);
    }

    /**
     * 實際發送偵測請求
     */
    sendDetectionRequest(crop, imgEl) {
        if (!imgEl || !imgEl.naturalWidth || !this.aiWorker) return;

        // 標記為等待中
        this.pendingDetections.set(crop.id, true);

        // 將圖片轉換為 ImageData 並發送到 Worker
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = imgEl.naturalWidth;
            canvas.height = imgEl.naturalHeight;
            ctx.drawImage(imgEl, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            this.aiWorker.postMessage({
                type: 'detect',
                id: crop.id,
                data: {
                    cropId: crop.id,
                    imageData: imageData.data,
                    width: canvas.width,
                    height: canvas.height
                }
            });
        } catch (error) {
            // 跨域圖片可能會失敗，移除等待標記
            this.pendingDetections.delete(crop.id);
        }
    }

    /**
     * 停止 AI 偵測循環
     */
    stopAIDetection() {
        if (this.aiDetectionLoop) {
            cancelAnimationFrame(this.aiDetectionLoop);
            this.aiDetectionLoop = null;
        }
        this.pendingDetections.clear();
    }

    /**
     * 清除偵測 Canvas
     */
    clearDetectionCanvas() {
        if (this.detectionCtx && this.detectionCanvas) {
            this.detectionCtx.clearRect(0, 0, this.detectionCanvas.width, this.detectionCanvas.height);
        }
    }

    /**
     * 繪製單個作物的偵測框
     */
    drawCropDetection(crop, cropEl, detection) {
        if (!this.detectionCtx) return;

        const conveyorRect = this.conveyor.getBoundingClientRect();
        const cropRect = cropEl.getBoundingClientRect();

        // 計算偵測框在 Canvas 上的位置
        const offsetX = cropRect.left - conveyorRect.left;
        const offsetY = cropRect.top - conveyorRect.top;

        // 計算縮放比例
        const scale = cropRect.width / cropEl.querySelector('img').naturalWidth;

        // 繪製偵測框
        const x = detection.x1 * scale + offsetX;
        const y = detection.y1 * scale + offsetY;
        const w = detection.width * scale;
        const h = detection.height * scale;

        const color = detection.className === 'healthy' ? '#4CAF50' : '#f44336';

        // 繪製框框
        this.detectionCtx.strokeStyle = color;
        this.detectionCtx.lineWidth = 3;
        this.detectionCtx.strokeRect(x, y, w, h);

        // 繪製標籤背景
        const label = `${detection.className === 'healthy' ? '健康' : '病害'} ${(detection.confidence * 100).toFixed(0)}%`;
        this.detectionCtx.font = 'bold 14px Arial';
        const textWidth = this.detectionCtx.measureText(label).width;
        const textHeight = 18;

        this.detectionCtx.fillStyle = color;
        this.detectionCtx.fillRect(x, y - textHeight - 2, textWidth + 8, textHeight + 2);

        // 繪製標籤文字
        this.detectionCtx.fillStyle = '#fff';
        this.detectionCtx.fillText(label, x + 4, y - 6);

        // 繪製中心點
        const cx = detection.centerX * scale + offsetX;
        const cy = detection.centerY * scale + offsetY;

        this.detectionCtx.beginPath();
        this.detectionCtx.arc(cx, cy, 5, 0, 2 * Math.PI);
        this.detectionCtx.fillStyle = color;
        this.detectionCtx.fill();
    }

    /**
     * 檢查是否需要 AI 自動分類
     */
    checkAIAutoSort(crop) {
        if (!this.aiMode || crop.sorted || !crop.aiDetection) return;

        const conveyorWidth = this.conveyor.offsetWidth;
        const sortStart = conveyorWidth * (1 - this.sortingZoneEnd / 100);
        const sortEnd = conveyorWidth * (1 - this.sortingZoneStart / 100);
        const sortCenter = (sortStart + sortEnd) / 2;

        // 計算作物中心點位置
        const cropWidth = 180;
        const cropCenter = crop.position + cropWidth / 2;

        // 當作物中心點到達分類區中心時，自動分類
        if (cropCenter >= sortCenter - 20 && cropCenter <= sortCenter + 20) {
            // 根據 AI 偵測結果分類
            const aiPrediction = crop.aiDetection.className;
            this.aiAutoSort(crop, aiPrediction);
        }
    }

    /**
     * AI 自動分類
     */
    aiAutoSort(crop, predictedType) {
        if (crop.sorted) return;

        crop.sorted = true;

        // 判斷對錯
        const isCorrect = crop.type === predictedType;
        const cropElement = document.getElementById(`crop-${crop.id}`);

        // 記錄結果
        const record = {
            id: crop.id,
            actualType: crop.type,
            predictedType: predictedType,
            imageName: crop.imageName || null,
            confidence: crop.aiDetection ? crop.aiDetection.confidence : null,
            mode: 'AI',
            timestamp: new Date().toLocaleTimeString()
        };

        // 更新 AI 統計
        this.aiStats.total++;
        if (isCorrect) {
            this.aiStats.correct++;
            this.correct++;
            this.score += 10 * this.level;
            if (cropElement) cropElement.classList.add('correct');
            this.resultRecords.correct.push(record);
        } else {
            this.aiStats.wrong++;
            this.wrong++;
            this.score = Math.max(0, this.score - 5);
            if (cropElement) cropElement.classList.add('wrong');
            this.resultRecords.wrong.push(record);
        }

        // 閃爍對應區域
        this.flashZone(predictedType);

        // 播放分類動畫
        if (cropElement) {
            setTimeout(() => {
                if (predictedType === 'healthy') {
                    cropElement.classList.add('sorting-up');
                } else {
                    cropElement.classList.add('sorting-down');
                }
            }, 100);
        }

        // 移除作物
        setTimeout(() => {
            this.removeCrop(crop.id);
        }, 600);

        this.updateUI();
        this.updateAIStatsPanel();
        this.checkLevelUp();
    }

    /**
     * 更新 AI 統計面板
     */
    updateAIStatsPanel() {
        if (!this.aiAccuracyEl) return;

        // 計算 AI 正確率
        const aiTotal = this.aiStats.correct + this.aiStats.wrong;
        const aiAccuracy = aiTotal > 0 ? (this.aiStats.correct / aiTotal * 100).toFixed(0) : 0;
        this.aiAccuracyEl.textContent = `${aiAccuracy}%`;
    }

    handleKeyPress(e) {
        if (!this.isRunning || this.isPaused) return;

        // AI 模式下禁用鍵盤輸入
        if (this.aiMode) return;

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.sortCrop('healthy');
            this.flashZone('healthy');
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.sortCrop('diseased');
            this.flashZone('diseased');
        }
    }

    flashZone(type) {
        const zone = type === 'healthy' ? this.zoneHealthy : this.zoneDiseased;
        zone.classList.add('active');
        setTimeout(() => zone.classList.remove('active'), 200);
    }

    sortCrop(targetType) {
        // 找到在分類區內的作物
        const conveyorWidth = this.conveyor.offsetWidth;
        const sortStart = conveyorWidth * (1 - this.sortingZoneEnd / 100);
        const sortEnd = conveyorWidth * (1 - this.sortingZoneStart / 100);

        // 找最靠近分類點的作物
        let targetCrop = null;
        let minDistance = Infinity;

        for (const crop of this.crops) {
            if (crop.sorted) continue;

            const cropWidth = 180; // 作物寬度
            const cropRight = crop.position + cropWidth;
            const cropCenter = crop.position + cropWidth / 2;

            // 檢查作物是否在分類區內
            if (cropCenter >= sortStart && cropCenter <= sortEnd) {
                const distance = Math.abs(cropCenter - (sortStart + sortEnd) / 2);
                if (distance < minDistance) {
                    minDistance = distance;
                    targetCrop = crop;
                }
            }
        }

        if (!targetCrop) return;

        // 標記為已分類
        targetCrop.sorted = true;

        // 判斷對錯
        const isCorrect = targetCrop.type === targetType;
        const cropElement = document.getElementById(`crop-${targetCrop.id}`);

        // 記錄結果
        const record = {
            id: targetCrop.id,
            actualType: targetCrop.type,
            predictedType: targetType,
            imageName: targetCrop.imageName || null,
            confidence: null,
            mode: '手動',
            timestamp: new Date().toLocaleTimeString()
        };

        // 更新玩家統計
        this.playerStats.total++;
        if (isCorrect) {
            this.playerStats.correct++;
            this.correct++;
            this.score += 10 * this.level;
            cropElement.classList.add('correct');
            this.resultRecords.correct.push(record);
        } else {
            this.playerStats.wrong++;
            this.wrong++;
            this.score = Math.max(0, this.score - 5);
            cropElement.classList.add('wrong');
            this.resultRecords.wrong.push(record);
        }

        // 播放分類動畫
        setTimeout(() => {
            if (targetType === 'healthy') {
                cropElement.classList.add('sorting-up');
            } else {
                cropElement.classList.add('sorting-down');
            }
        }, 100);

        // 移除作物
        setTimeout(() => {
            this.removeCrop(targetCrop.id);
        }, 600);

        this.updateUI();
        this.updateAIStatsPanel();
        this.checkLevelUp();
    }

    getRandomImage(type) {
        const list = type === 'healthy' ? this.imageList.healthy : this.imageList.diseased;
        if (list.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * list.length);
        return list[randomIndex];
    }

    spawnCrop() {
        let crop;
        let cropEl;

        // 隨機決定健康或病害
        const type = Math.random() > 0.5 ? 'healthy' : 'diseased';
        const label = type === 'healthy' ? '健康' : '病害';

        // 檢查是否使用真實圖片
        if (this.imageList.useRealImages) {
            // 優先使用預載的圖片
            const preloaded = this.getPreloadedImage(type);

            if (preloaded) {
                crop = {
                    id: this.cropIdCounter++,
                    type: type,
                    label: label,
                    imageName: preloaded.name,
                    position: -190, // 從左邊外面開始
                    sorted: false
                };

                // 建立 DOM 元素 (使用預載的圖片)
                cropEl = document.createElement('div');
                cropEl.id = `crop-${crop.id}`;
                cropEl.className = 'crop-item real-image';

                const img = preloaded.img.cloneNode();
                img.alt = label;
                img.draggable = false;
                img.className = 'loaded'; // 已載入完成

                cropEl.appendChild(img);
            } else {
                // 沒有預載圖片時，使用一般載入方式
                const imageName = this.getRandomImage(type);

                if (imageName) {
                    crop = {
                        id: this.cropIdCounter++,
                        type: type,
                        label: label,
                        imageName: imageName,
                        position: -190, // 從左邊外面開始
                        sorted: false
                    };

                    cropEl = document.createElement('div');
                    cropEl.id = `crop-${crop.id}`;
                    cropEl.className = 'crop-item real-image';

                    const img = document.createElement('img');
                    img.src = `images/validation/${type}/${imageName}`;
                    img.alt = label;
                    img.draggable = false;
                    img.onload = () => img.classList.add('loaded');

                    cropEl.appendChild(img);
                }
            }
        }

        // 如果沒有真實圖片或載入失敗，使用 SVG 模擬
        if (!crop) {
            const apple = this.appleGenerator.generate(type);
            crop = {
                id: this.cropIdCounter++,
                type: apple.type,
                label: apple.label,
                svg: apple.svg,
                position: -100, // 從左邊外面開始
                sorted: false
            };

            cropEl = document.createElement('div');
            cropEl.id = `crop-${crop.id}`;
            cropEl.className = 'crop-item';
            cropEl.innerHTML = apple.svg;
        }

        this.crops.push(crop);

        cropEl.style.left = `${crop.position}px`;
        cropEl.title = crop.label; // Debug 用

        this.conveyor.appendChild(cropEl);
    }

    removeCrop(id) {
        const index = this.crops.findIndex(c => c.id === id);
        if (index > -1) {
            this.crops.splice(index, 1);
        }
        const el = document.getElementById(`crop-${id}`);
        if (el) {
            el.remove();
        }
    }

    updateCrops() {
        const conveyorWidth = this.conveyor.offsetWidth;
        const pixelsPerFrame = (this.speed * 2); // 速度轉換為像素

        for (const crop of this.crops) {
            if (crop.sorted) continue;

            crop.position += pixelsPerFrame;

            const cropEl = document.getElementById(`crop-${crop.id}`);
            if (cropEl) {
                cropEl.style.left = `${crop.position}px`;
            }

            // 檢查是否超出輸送帶 (遺漏)
            if (crop.position > conveyorWidth) {
                // 記錄遺漏
                this.resultRecords.missed.push({
                    id: crop.id,
                    actualType: crop.type,
                    predictedType: null,
                    imageName: crop.imageName || null,
                    confidence: null,
                    mode: this.aiMode ? 'AI' : '手動',
                    timestamp: new Date().toLocaleTimeString()
                });

                this.missed++;
                this.score = Math.max(0, this.score - 3);
                crop.sorted = true;
                this.removeCrop(crop.id);
                this.updateUI();
            }
        }
    }

    updateBeltSpeed() {
        const beltPattern = this.conveyor.querySelector('.belt-pattern');
        if (beltPattern) {
            const duration = 3 / this.speed; // 速度越快，動畫時間越短
            beltPattern.style.animationDuration = `${duration}s`;
        }
    }

    checkLevelUp() {
        // 每正確分類 10 個就升級
        const newLevel = Math.floor(this.correct / 10) + 1;
        if (newLevel > this.level) {
            this.level = newLevel;
            this.levelUp();
        }
    }

    levelUp() {
        // 自動提高難度
        if (this.speed < 6) {
            this.speed = Math.min(6, this.speed + 1);
            this.speedSlider.value = this.speed;
            this.speedValue.textContent = this.speed;
            this.updateBeltSpeed();
        }

        if (this.spawnRate < 6) {
            this.spawnRate = Math.min(6, this.spawnRate + 1);
            this.spawnRateSlider.value = this.spawnRate;
            this.spawnValue.textContent = this.spawnRate;
            this.restartSpawnTimer();
        }

        this.updateUI();

        // 顯示升級提示
        this.showLevelUpNotification();
    }

    showLevelUpNotification() {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(45deg, #2196F3, #03A9F4);
            color: white;
            padding: 20px 40px;
            border-radius: 10px;
            font-size: 1.5rem;
            font-weight: bold;
            z-index: 1000;
            animation: levelUp 1s ease forwards;
        `;
        notification.textContent = `Level ${this.level}!`;

        // 加入動畫樣式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes levelUp {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
            style.remove();
        }, 1000);
    }

    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.isPaused = false;

        this.startBtn.disabled = true;
        this.pauseBtn.disabled = false;

        this.updateBeltSpeed();
        this.resizeDetectionCanvas();

        // 開始遊戲循環
        this.gameLoop = setInterval(() => {
            if (!this.isPaused) {
                this.updateCrops();
            }
        }, 1000 / 60); // 60 FPS

        // 開始生成作物
        this.restartSpawnTimer();

        // 如果 AI 模式已開啟，開始偵測
        if (this.aiMode && this.aiModelLoaded) {
            this.startAIDetection();
        }
    }

    restartSpawnTimer() {
        if (this.spawnTimer) {
            clearInterval(this.spawnTimer);
        }

        // 生成間隔：spawnRate 越高，間隔越短
        const interval = 3000 / this.spawnRate;
        this.spawnTimer = setInterval(() => {
            if (!this.isPaused) {
                this.spawnCrop();
            }
        }, interval);
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        this.pauseBtn.textContent = this.isPaused ? '繼續' : '暫停';

        // 暫停/繼續輸送帶動畫
        const beltPattern = this.conveyor.querySelector('.belt-pattern');
        if (beltPattern) {
            beltPattern.style.animationPlayState = this.isPaused ? 'paused' : 'running';
        }
    }

    reset() {
        // 停止遊戲
        this.isRunning = false;
        this.isPaused = false;

        if (this.gameLoop) {
            clearInterval(this.gameLoop);
            this.gameLoop = null;
        }
        if (this.spawnTimer) {
            clearInterval(this.spawnTimer);
            this.spawnTimer = null;
        }

        // 停止 AI 偵測
        this.stopAIDetection();
        this.clearDetectionCanvas();

        // 重置 AI 模式
        this.aiMode = false;
        if (this.aiToggleBtn) {
            this.aiToggleBtn.classList.remove('active');
            this.aiToggleBtn.textContent = 'AI 自動模式';
        }
        if (this.aiModelLoaded) {
            this.updateAIStatus('ready', 'AI 就緒');
        }

        // 隱藏 AI 統計面板
        if (this.aiStatsPanel) {
            this.aiStatsPanel.style.display = 'none';
        }

        // 重置統計
        this.aiStats = { correct: 0, wrong: 0, total: 0 };
        this.playerStats = { correct: 0, wrong: 0, total: 0 };
        this.resultRecords = { correct: [], wrong: [], missed: [] };

        // 清除所有作物
        for (const crop of this.crops) {
            const el = document.getElementById(`crop-${crop.id}`);
            if (el) el.remove();
        }
        this.crops = [];

        // 重置分數
        this.score = 0;
        this.correct = 0;
        this.wrong = 0;
        this.missed = 0;
        this.level = 1;

        // 重置控制
        this.speed = 3;
        this.spawnRate = 2;
        this.speedSlider.value = 3;
        this.spawnRateSlider.value = 2;
        this.speedValue.textContent = 3;
        this.spawnValue.textContent = 2;

        // 重置按鈕
        this.startBtn.disabled = false;
        this.pauseBtn.disabled = true;
        this.pauseBtn.textContent = '暫停';

        // 重置輸送帶動畫
        const beltPattern = this.conveyor.querySelector('.belt-pattern');
        if (beltPattern) {
            beltPattern.style.animationPlayState = 'running';
            beltPattern.style.animationDuration = '2s';
        }

        this.updateUI();
        this.updateAIStatsPanel();
    }

    updateUI() {
        this.scoreEl.textContent = this.score;
        this.correctEl.textContent = this.correct;
        this.wrongEl.textContent = this.wrong;
        this.missedEl.textContent = this.missed;
        this.levelEl.textContent = this.level;
    }

    /**
     * 顯示判定記錄彈出視窗
     */
    showRecordsModal(type) {
        const records = this.resultRecords[type];
        const titles = {
            correct: '正確分類的蘋果',
            wrong: '錯誤分類的蘋果',
            missed: '遺漏的蘋果'
        };

        // 建立或取得 modal
        let modal = document.getElementById('records-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'records-modal';
            modal.className = 'records-modal';
            modal.innerHTML = `
                <div class="records-modal-content">
                    <div class="records-modal-header">
                        <h3 id="records-modal-title"></h3>
                        <button class="records-modal-close">&times;</button>
                    </div>
                    <div class="records-modal-body" id="records-modal-body"></div>
                </div>
            `;
            document.body.appendChild(modal);

            // 關閉按鈕事件
            modal.querySelector('.records-modal-close').addEventListener('click', () => {
                modal.classList.remove('show');
            });

            // 點擊背景關閉
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        }

        // 更新標題
        document.getElementById('records-modal-title').textContent =
            `${titles[type]} (${records.length} 個)`;

        // 更新內容
        const body = document.getElementById('records-modal-body');

        if (records.length === 0) {
            body.innerHTML = '<p class="no-records">目前沒有記錄</p>';
        } else {
            body.innerHTML = `
                <div class="records-list">
                    ${records.map((record, index) => `
                        <div class="record-item ${type}">
                            <div class="record-image">
                                ${record.imageName
                                    ? `<img src="images/validation/${record.actualType}/${record.imageName}" alt="蘋果">`
                                    : '<div class="no-image">SVG</div>'
                                }
                            </div>
                            <div class="record-info">
                                <div class="record-row">
                                    <span class="record-label">實際類型:</span>
                                    <span class="record-value ${record.actualType}">${record.actualType === 'healthy' ? '健康' : '病害'}</span>
                                </div>
                                ${record.predictedType ? `
                                <div class="record-row">
                                    <span class="record-label">判定類型:</span>
                                    <span class="record-value ${record.predictedType}">${record.predictedType === 'healthy' ? '健康' : '病害'}</span>
                                </div>
                                ` : ''}
                                ${record.confidence ? `
                                <div class="record-row">
                                    <span class="record-label">信心度:</span>
                                    <span class="record-value">${(record.confidence * 100).toFixed(1)}%</span>
                                </div>
                                ` : ''}
                                <div class="record-row">
                                    <span class="record-label">模式:</span>
                                    <span class="record-value">${record.mode}</span>
                                </div>
                                <div class="record-row">
                                    <span class="record-label">時間:</span>
                                    <span class="record-value">${record.timestamp}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // 顯示 modal
        modal.classList.add('show');
    }
}

// 當頁面載入完成後初始化遊戲
document.addEventListener('DOMContentLoaded', () => {
    window.game = new QualitySelectorGame();
});
