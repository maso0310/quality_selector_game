"""
農作物品質分類遊戲 - Flask 應用程式
使用 DispatcherMiddleware 部署於 /quality_selector_game 路徑
"""

from flask import Flask, render_template, send_from_directory
from werkzeug.middleware.dispatcher import DispatcherMiddleware
import os

# 建立 Flask 應用程式
real_app = Flask(__name__)

# 設定靜態檔案路徑
real_app.config['IMAGES_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'images')


@real_app.route("/")
def index():
    """遊戲主頁面"""
    return render_template("index.html")


@real_app.route("/images/<path:filename>")
def serve_images(filename):
    """提供 images 資料夾中的圖片"""
    return send_from_directory(real_app.config['IMAGES_FOLDER'], filename)


@real_app.route("/images/healthy/<path:filename>")
def serve_healthy_images(filename):
    """提供健康作物圖片（優先使用處理後的圖片）"""
    processed_folder = os.path.join(real_app.config['IMAGES_FOLDER'], 'processed', 'healthy')
    original_folder = os.path.join(real_app.config['IMAGES_FOLDER'], 'healthy')

    # 優先使用處理後的圖片
    if os.path.exists(os.path.join(processed_folder, filename)):
        return send_from_directory(processed_folder, filename)
    return send_from_directory(original_folder, filename)


@real_app.route("/images/diseased/<path:filename>")
def serve_diseased_images(filename):
    """提供病害作物圖片（優先使用處理後的圖片）"""
    processed_folder = os.path.join(real_app.config['IMAGES_FOLDER'], 'processed', 'diseased')
    original_folder = os.path.join(real_app.config['IMAGES_FOLDER'], 'diseased')

    # 優先使用處理後的圖片
    if os.path.exists(os.path.join(processed_folder, filename)):
        return send_from_directory(processed_folder, filename)
    return send_from_directory(original_folder, filename)


@real_app.route("/api/images/list")
def list_images():
    """列出所有可用的作物圖片（優先使用處理後的圖片）"""
    from flask import jsonify

    images = {
        'healthy': [],
        'diseased': [],
        'useRealImages': True
    }

    # 優先使用處理後的圖片資料夾
    processed_healthy = os.path.join(real_app.config['IMAGES_FOLDER'], 'processed', 'healthy')
    processed_diseased = os.path.join(real_app.config['IMAGES_FOLDER'], 'processed', 'diseased')

    # 備用原始圖片資料夾
    original_healthy = os.path.join(real_app.config['IMAGES_FOLDER'], 'healthy')
    original_diseased = os.path.join(real_app.config['IMAGES_FOLDER'], 'diseased')

    # 列出健康圖片
    healthy_path = processed_healthy if os.path.exists(processed_healthy) else original_healthy
    if os.path.exists(healthy_path):
        images['healthy'] = [f for f in os.listdir(healthy_path)
                            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp'))]

    # 列出病害圖片
    diseased_path = processed_diseased if os.path.exists(processed_diseased) else original_diseased
    if os.path.exists(diseased_path):
        images['diseased'] = [f for f in os.listdir(diseased_path)
                             if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp'))]

    # 如果沒有圖片，標記使用模擬圖片
    if not images['healthy'] and not images['diseased']:
        images['useRealImages'] = False

    return jsonify(images)


# 使用 DispatcherMiddleware 包裝，部署於 /quality_selector_game 路徑
app = DispatcherMiddleware(
    lambda environ, start_response: (
        start_response('404 Not Found', [('Content-Type', 'text/plain')]) or [b'Not Found']
    ),
    {
        "/quality_selector_game": real_app
    }
)


# 開發環境直接執行
if __name__ == "__main__":
    # 開發時直接執行 real_app，不使用 DispatcherMiddleware
    real_app.run(debug=True, host="0.0.0.0", port=5000)
