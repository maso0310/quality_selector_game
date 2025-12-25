/**
 * 農作物品質分類遊戲 - 主遊戲邏輯
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
        this.speed = 3;          // 輸送帶速度 (1-10)
        this.spawnRate = 2;      // 生成頻率 (1-10)
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
        this.bindEvents();
        this.updateUI();
    }

    async loadImageList() {
        try {
            const response = await fetch('api/images/list');
            if (response.ok) {
                this.imageList = await response.json();
                console.log(`[遊戲] 載入圖片成功: 健康 ${this.imageList.healthy.length} 張, 病害 ${this.imageList.diseased.length} 張`);

                if (this.imageList.useRealImages) {
                    console.log('[遊戲] 使用真實圖片模式');
                } else {
                    console.log('[遊戲] 使用模擬圖片模式');
                }
            }
        } catch (error) {
            console.log('[遊戲] 無法載入圖片列表，使用模擬圖片');
            this.imageList.useRealImages = false;
        }
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

        // 鍵盤控制
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
    }

    handleKeyPress(e) {
        if (!this.isRunning || this.isPaused) return;

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

            const cropRight = crop.position + 80; // 作物寬度
            const cropCenter = crop.position + 40;

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

        if (isCorrect) {
            this.correct++;
            this.score += 10 * this.level;
            cropElement.classList.add('correct');
        } else {
            this.wrong++;
            this.score = Math.max(0, this.score - 5);
            cropElement.classList.add('wrong');
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
            const imageName = this.getRandomImage(type);

            if (imageName) {
                crop = {
                    id: this.cropIdCounter++,
                    type: type,
                    label: label,
                    imageName: imageName,
                    position: -100, // 從左邊外面開始
                    sorted: false
                };

                // 建立 DOM 元素 (使用真實圖片)
                cropEl = document.createElement('div');
                cropEl.id = `crop-${crop.id}`;
                cropEl.className = 'crop-item real-image';

                const img = document.createElement('img');
                img.src = `images/${type}/${imageName}`;
                img.alt = label;
                img.draggable = false;

                cropEl.appendChild(img);
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
                position: -80, // 從左邊外面開始
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
        if (this.speed < 10) {
            this.speed = Math.min(10, this.speed + 1);
            this.speedSlider.value = this.speed;
            this.speedValue.textContent = this.speed;
            this.updateBeltSpeed();
        }

        if (this.spawnRate < 10) {
            this.spawnRate = Math.min(10, this.spawnRate + 1);
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

        // 開始遊戲循環
        this.gameLoop = setInterval(() => {
            if (!this.isPaused) {
                this.updateCrops();
            }
        }, 1000 / 60); // 60 FPS

        // 開始生成作物
        this.restartSpawnTimer();
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
    }

    updateUI() {
        this.scoreEl.textContent = this.score;
        this.correctEl.textContent = this.correct;
        this.wrongEl.textContent = this.wrong;
        this.missedEl.textContent = this.missed;
        this.levelEl.textContent = this.level;
    }
}

// 當頁面載入完成後初始化遊戲
document.addEventListener('DOMContentLoaded', () => {
    window.game = new QualitySelectorGame();
});
