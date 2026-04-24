"""
4D天性测评 - NAS 数据收集服务
部署在绿联云 Docker 中，通过 Cloudflare Tunnel 暴露公网访问
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import csv
import os
from datetime import datetime

app = Flask(__name__)
# 允许任何来源的跨域请求（因为前端在 GitHub Pages 上）
CORS(app, resources={r"/*": {"origins": "*"}})

# 数据文件路径（通过 Docker volume 映射到宿主机）
DATA_DIR = '/app/data'
CSV_FILE = os.path.join(DATA_DIR, '4d_results.csv')

# 确保数据目录和 CSV 表头存在
os.makedirs(DATA_DIR, exist_ok=True)
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow([
            '提交时间', '用户名', '情感(F)', '直觉(N)', '逻辑(T)', '感觉(S)',
            '绿色', '黄色', '蓝色', '橙色', '主导颜色'
        ])
    print(f'[4D Collector] 已创建数据文件: {CSV_FILE}')


@app.route('/submit', methods=['POST'])
def submit():
    """接收测评结果并写入 CSV"""
    try:
        data = request.get_json(force=True)
        print(f'[4D Collector] 收到数据: {data}')

        # 写入 CSV（追加模式）
        with open(CSV_FILE, 'a', newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f)
            writer.writerow([
                data.get('timestamp', datetime.now().isoformat()),
                data.get('username', '匿名'),
                data.get('F', 0),
                data.get('N', 0),
                data.get('T', 0),
                data.get('S', 0),
                data.get('scores', {}).get('green', 0),
                data.get('scores', {}).get('yellow', 0),
                data.get('scores', {}).get('blue', 0),
                data.get('scores', {}).get('orange', 0),
                data.get('mainColor', '')
            ])

        return jsonify({'status': 'ok', 'message': '数据已保存'}), 200

    except Exception as e:
        print(f'[4D Collector] 错误: {e}')
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/data', methods=['GET'])
def get_data():
    """返回 CSV 数据，用于查看或下载"""
    try:
        with open(CSV_FILE, 'r', encoding='utf-8-sig') as f:
            content = f.read()
        return content, 200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename=4d_results.csv'
        }
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({'status': 'ok', 'time': datetime.now().isoformat()}), 200


if __name__ == '__main__':
    print('[4D Collector] 服务启动，端口 5000')
    app.run(host='0.0.0.0', port=5000, debug=False)
