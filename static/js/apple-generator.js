/**
 * 蘋果圖形產生器
 * 產生健康或病害的蘋果 SVG 圖形
 */

class AppleGenerator {
    constructor() {
        // 蘋果基本顏色
        this.healthyColors = {
            main: '#e74c3c',      // 紅色
            highlight: '#ff6b6b', // 亮紅色
            shadow: '#c0392b',    // 暗紅色
            leaf: '#27ae60',      // 綠色葉子
            stem: '#795548'       // 棕色莖
        };

        // 病斑顏色
        this.diseaseColors = [
            '#4a3728',  // 深褐色
            '#5d4e37',  // 褐色
            '#3d2914',  // 暗褐色
            '#2c1810'   // 黑褐色
        ];
    }

    /**
     * 產生隨機污點
     */
    generateSpots(count, severity) {
        let spots = '';
        for (let i = 0; i < count; i++) {
            // 隨機位置 (在蘋果範圍內)
            const cx = 30 + Math.random() * 40;
            const cy = 35 + Math.random() * 35;

            // 根據嚴重程度調整大小
            const baseSize = 3 + severity * 2;
            const r = baseSize + Math.random() * baseSize;

            // 隨機顏色
            const color = this.diseaseColors[Math.floor(Math.random() * this.diseaseColors.length)];

            // 不規則形狀 (使用橢圓)
            const rx = r * (0.7 + Math.random() * 0.6);
            const ry = r * (0.7 + Math.random() * 0.6);
            const rotate = Math.random() * 360;

            spots += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"
                       fill="${color}" opacity="${0.7 + Math.random() * 0.3}"
                       transform="rotate(${rotate} ${cx} ${cy})"/>`;
        }
        return spots;
    }

    /**
     * 產生健康蘋果 SVG
     */
    generateHealthyApple() {
        return `
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <!-- 蘋果主體漸層 -->
            <defs>
                <radialGradient id="appleGradient" cx="35%" cy="35%">
                    <stop offset="0%" style="stop-color:${this.healthyColors.highlight}"/>
                    <stop offset="70%" style="stop-color:${this.healthyColors.main}"/>
                    <stop offset="100%" style="stop-color:${this.healthyColors.shadow}"/>
                </radialGradient>
                <radialGradient id="leafGradient" cx="30%" cy="30%">
                    <stop offset="0%" style="stop-color:#2ecc71"/>
                    <stop offset="100%" style="stop-color:${this.healthyColors.leaf}"/>
                </radialGradient>
            </defs>

            <!-- 蘋果主體 -->
            <path d="M50 85
                     C20 85 10 55 15 35
                     C20 15 35 15 50 25
                     C65 15 80 15 85 35
                     C90 55 80 85 50 85 Z"
                  fill="url(#appleGradient)"/>

            <!-- 高光 -->
            <ellipse cx="35" cy="40" rx="8" ry="12"
                     fill="rgba(255,255,255,0.3)"/>

            <!-- 莖 -->
            <path d="M50 25 Q52 15 48 8"
                  stroke="${this.healthyColors.stem}"
                  stroke-width="4"
                  fill="none"
                  stroke-linecap="round"/>

            <!-- 葉子 -->
            <path d="M52 15 Q65 5 75 15 Q65 20 52 15"
                  fill="url(#leafGradient)"/>

            <!-- 葉脈 -->
            <path d="M55 15 Q63 13 70 15"
                  stroke="#1e8449"
                  stroke-width="0.5"
                  fill="none"/>
        </svg>`;
    }

    /**
     * 產生病害蘋果 SVG
     * @param {number} severity - 病害嚴重程度 (1-3)
     */
    generateDiseasedApple(severity = 2) {
        // 根據嚴重程度決定污點數量
        const spotCount = 2 + severity * 2 + Math.floor(Math.random() * 3);
        const spots = this.generateSpots(spotCount, severity);

        // 病害蘋果顏色較暗淡
        const mainColor = '#d35400';
        const highlightColor = '#e67e22';
        const shadowColor = '#a04000';

        return `
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <!-- 病害蘋果漸層 (較暗淡) -->
            <defs>
                <radialGradient id="diseasedGradient" cx="35%" cy="35%">
                    <stop offset="0%" style="stop-color:${highlightColor}"/>
                    <stop offset="70%" style="stop-color:${mainColor}"/>
                    <stop offset="100%" style="stop-color:${shadowColor}"/>
                </radialGradient>
                <radialGradient id="diseasedLeafGradient" cx="30%" cy="30%">
                    <stop offset="0%" style="stop-color:#7d8a2e"/>
                    <stop offset="100%" style="stop-color:#5d6a1e"/>
                </radialGradient>
            </defs>

            <!-- 蘋果主體 -->
            <path d="M50 85
                     C20 85 10 55 15 35
                     C20 15 35 15 50 25
                     C65 15 80 15 85 35
                     C90 55 80 85 50 85 Z"
                  fill="url(#diseasedGradient)"/>

            <!-- 污點/病斑 -->
            ${spots}

            <!-- 微弱高光 -->
            <ellipse cx="35" cy="40" rx="6" ry="10"
                     fill="rgba(255,255,255,0.15)"/>

            <!-- 莖 (較深色) -->
            <path d="M50 25 Q52 15 48 8"
                  stroke="#5d4037"
                  stroke-width="4"
                  fill="none"
                  stroke-linecap="round"/>

            <!-- 枯萎的葉子 -->
            <path d="M52 15 Q65 5 75 15 Q65 20 52 15"
                  fill="url(#diseasedLeafGradient)"/>

            <!-- 葉脈 -->
            <path d="M55 15 Q63 13 70 15"
                  stroke="#4a5a0e"
                  stroke-width="0.5"
                  fill="none"/>
        </svg>`;
    }

    /**
     * 產生指定類型的蘋果
     * @param {string} type - 'healthy' 或 'diseased'
     * @returns {Object} 包含 svg 和 type 的物件
     */
    generate(type = null) {
        // 如果沒指定類型，隨機產生
        if (!type) {
            type = Math.random() > 0.5 ? 'healthy' : 'diseased';
        }

        if (type === 'healthy') {
            return {
                svg: this.generateHealthyApple(),
                type: 'healthy',
                label: '健康'
            };
        } else {
            const severity = 1 + Math.floor(Math.random() * 3);
            return {
                svg: this.generateDiseasedApple(severity),
                type: 'diseased',
                label: '病害'
            };
        }
    }
}

// 匯出給其他模組使用
window.AppleGenerator = AppleGenerator;
