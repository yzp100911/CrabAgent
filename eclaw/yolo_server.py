#!/usr/bin/env python3
"""
手机摄像头快速Demo + JSON检测接口 + 多模型支持(seg/pose)
访问地址: http://0.0.0.0:60017
（端口从 60016 改为 60017，避开云服务器上 xCrab 占用的 60016）
"""

import os
import cv2
import numpy as np
from flask import Flask, request, send_file, jsonify
from ultralytics import YOLO
import supervision as sv
from supervision import ByteTrack, DetectionsSmoother
from io import BytesIO
from PIL import Image
import logging
import math
import time
from collections import defaultdict, deque

# 日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ======================== 多模型管理 ========================
class ModelManager:
    """管理 det/seg/pose 三种 YOLO 模型，按需加载"""

    def __init__(self):
        self.models = {}  # type -> YOLO instance
        self.current_type = 'det'  # det | seg | pose
        # 模型路径（可通过环境变量覆盖）
        self.model_paths = {
            'det': os.environ.get('YOLO_DET_MODEL', '/www/wwwroot/eclaw/yolov8s.pt'),
            'seg': os.environ.get('YOLO_SEG_MODEL', '/www/wwwroot/eclaw/yolov8s-seg.pt'),
            'pose': os.environ.get('YOLO_POSE_MODEL', '/www/wwwroot/eclaw/yolov8s-pose.pt'),
        }

    def get_model(self, model_type=None):
        t = model_type or self.current_type
        if t not in self.models:
            path = self.model_paths.get(t)
            if not path or not os.path.exists(path):
                raise FileNotFoundError(f"模型文件不存在: {path} (type={t})")
            logger.info(f"🔄 加载模型 [{t}]: {path}")
            if t == 'pose':
                self.models[t] = YOLO(path, task='pose')
            elif t == 'seg':
                self.models[t] = YOLO(path, task='segment')
            else:
                self.models[t] = YOLO(path, task='detect')
        return self.models[t]

    def switch_model(self, model_type):
        if model_type not in self.model_paths:
            return False
        self.current_type = model_type
        return True

    def list_models(self):
        result = {}
        for t, path in self.model_paths.items():
            result[t] = {
                'path': path,
                'loaded': t in self.models,
                'exists': os.path.exists(path),
            }
        return result

model_manager = ModelManager()

# 标注器
box_annotator = sv.BoxAnnotator(thickness=2)
label_annotator = sv.LabelAnnotator(text_scale=0.8, text_thickness=2, text_padding=10)

# ByteTrack 跟踪器
tracker = ByteTrack()
smoother = DetectionsSmoother(length=5)

# 速度估算状态
coord_history = {}
SPEED_HISTORY_LEN = 15
PIXEL_TO_METER = 0.05

def process_image(image_bytes):
    """处理图片并返回带标注的结果"""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return None, "图片解码失败"

    logger.info(f"📷 图片尺寸: {img.shape}")

    det_model = model_manager.get_model('det')

    # 置信度过滤 + NMS（单张图片也用）
    results = det_model(img, conf=0.25, verbose=False)
    detections = sv.Detections.from_ultralytics(results[0])

    if len(detections) > 0:
        detections = detections.with_nms(threshold=0.5)

    logger.info(f"🔍 检测到 {len(detections)} 个目标")

    if len(detections) > 0:
        labels = [
            f"{det_model.names[class_id]} {confidence:.2f}"
            for class_id, confidence
            in zip(detections.class_id, detections.confidence)
        ]

        annotated = box_annotator.annotate(
            scene=img.copy(),
            detections=detections
        )
        annotated = label_annotator.annotate(
            scene=annotated,
            detections=detections,
            labels=labels
        )
    else:
        annotated = img.copy()
        h, w = img.shape[:2]
        cv2.putText(annotated, "No objects detected", (w//2-100, h//2),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

    return annotated, None

def detect_image_json(image_bytes, model_type=None, conf_threshold=0.25, nms_threshold=0.5,
                      enable_tracking=True, enable_smoothing=True):
    """
    检测图片并返回 JSON 格式的检测结果
    支持: det(检测), seg(分割+检测), pose(姿态)
    返回 masks / keypoints / occluded / truncated 等字段
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None

    h, w = img.shape[:2]
    mt = model_type or model_manager.current_type
    logger.info(f"📷 检测图片尺寸: {img.shape}, 模型: {mt}")

    # 获取对应模型
    model = model_manager.get_model(mt)

    # YOLO 推理
    results = model(img, conf=conf_threshold, verbose=False)
    detections = sv.Detections.from_ultralytics(results[0])

    # NMS 去重（YOLO26 端到端无 NMS；文件名含 yolo26 时跳过）
    model_path = model_manager.model_paths.get(mt, '')
    is_yolo26 = 'yolo26' in os.path.basename(model_path).lower()
    if not is_yolo26 and len(detections) > 0 and nms_threshold < 1.0:
        detections = detections.with_nms(threshold=nms_threshold)

    # ByteTrack 跟踪
    if enable_tracking and len(detections) > 0:
        detections = tracker.update_with_detections(detections)
    if enable_smoothing and len(detections) > 0:
        detections = smoother.update_with_detections(detections)

    logger.info(f"🔍 检测到 {len(detections)} 个目标 (模型={mt})")

    # 提取 masks（分割模型）
    raw_masks = None
    if mt == 'seg' and results[0].masks is not None:
        raw_masks = results[0].masks  # ultralytics Masks 对象

    # 提取 keypoints（姿态模型）
    raw_keypoints = None
    if mt == 'pose' and results[0].keypoints is not None:
        raw_keypoints = results[0].keypoints  # ultralytics Keypoints 对象

    now = time.time()
    objects = []
    class_counts = {}
    max_speed = 0
    max_speed_obj = None

    for i, class_id in enumerate(detections.class_id):
        class_name = model.names[class_id]
        confidence = float(detections.confidence[i])
        x1, y1, x2, y2 = [float(v) for v in detections.xyxy[i]]

        obj = {
            'class': class_name,
            'confidence': confidence,
            'xyxy': [x1, y1, x2, y2],
            'speed_px': 0,
            'speed_kmh': 0,
        }

        # ===== 分割掩码（多边形格式） =====
        if raw_masks is not None:
            try:
                # masks.xy[i] 是多边形点列表 [(x,y),...]
                poly = raw_masks.xy[i]
                if len(poly) > 0:
                    # 展平为 [x1,y1,x2,y2,...] 格式
                    flat = []
                    for px, py in poly:
                        flat.append(float(px))
                        flat.append(float(py))
                    obj['mask'] = flat
            except (IndexError, AttributeError):
                pass

        # ===== 姿态关键点 =====
        if raw_keypoints is not None:
            try:
                kp_data = raw_keypoints.data[i]  # tensor of shape (17, 3)
                kp_list = []
                for kp_idx in range(len(kp_data)):
                    kx = float(kp_data[kp_idx][0])
                    ky = float(kp_data[kp_idx][1])
                    kc = float(kp_data[kp_idx][2])  # 置信度
                    kp_list.append({'x': kx, 'y': ky, 'confidence': kc})
                obj['keypoints'] = kp_list
            except (IndexError, AttributeError):
                pass

        # ===== 遮挡检测（基于框重叠的启发式判断） =====
        obj['occluded'] = False
        obj['truncated'] = False
        # 检查是否靠近边缘（截断）
        margin_x = w * 0.02
        margin_y = h * 0.02
        if x1 < margin_x or y1 < margin_y or x2 > w - margin_x or y2 > h - margin_y:
            obj['truncated'] = True
        # 检查与其他框的重叠（遮挡），只在 detections 列表中检查
        for j in range(len(detections.class_id)):
            if i == j:
                continue
            ox1, oy1, ox2, oy2 = [float(v) for v in detections.xyxy[j]]
            # 计算交并比
            ix1 = max(x1, ox1)
            iy1 = max(y1, oy1)
            ix2 = min(x2, ox2)
            iy2 = min(y2, oy2)
            if ix2 > ix1 and iy2 > iy1:
                iw = ix2 - ix1
                ih = iy2 - iy1
                inter = iw * ih
                area = (x2 - x1) * (y2 - y1)
                if area > 0 and inter / area > 0.65:
                    obj['occluded'] = True
                    break

        # ===== tracker_id + 速度 =====
        if detections.tracker_id is not None and len(detections.tracker_id) > i and detections.tracker_id[i] is not None:
            tid = int(detections.tracker_id[i])
            obj['tracker_id'] = tid

            cx = (x1 + x2) / 2
            cy = y2

            if tid not in coord_history:
                coord_history[tid] = deque(maxlen=SPEED_HISTORY_LEN)
            coord_history[tid].append((cx, cy, now))

            history = coord_history[tid]
            if len(history) >= 2:
                first_cx, first_cy, first_ts = history[0]
                last_cx, last_cy, last_ts = history[-1]
                dt = last_ts - first_ts
                if dt > 0.1:
                    dist_px = math.sqrt((last_cx - first_cx) ** 2 + (last_cy - first_cy) ** 2)
                    speed_px = dist_px / dt
                    speed_ms = speed_px * PIXEL_TO_METER
                    speed_kmh = speed_ms * 3.6
                    obj['speed_px'] = round(speed_px, 1)
                    obj['speed_kmh'] = round(speed_kmh, 1)
                    if speed_kmh > max_speed:
                        max_speed = speed_kmh
                        max_speed_obj = {'class': class_name, 'tracker_id': tid, 'speed_kmh': round(speed_kmh, 1)}

        objects.append(obj)
        class_counts[class_name] = class_counts.get(class_name, 0) + 1

    # 清理过期轨迹（超过 10 秒无更新的 tracker_id）
    expired = [tid for tid, hist in coord_history.items() if now - hist[-1][2] > 10.0]
    for tid in expired:
        del coord_history[tid]

    return {
        'total_count': len(detections),
        'class_counts': class_counts,
        'objects': objects,
        'image_size': {'width': w, 'height': h},
        'model_type': mt,
        'speed': {
            'max_speed': round(max_speed, 1) if max_speed_obj else 0,
            'max_speed_obj': max_speed_obj,
        },
    }

@app.route('/')
def index():
    """返回上传网页"""
    html = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>📷 摄像头实时分析 - YOLOv8</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:20px;color:#fff}
        h1{margin-bottom:20px;text-align:center;font-size:24px}
        .container{background:rgba(255,255,255,.1);border-radius:20px;padding:20px;max-width:500px;width:100%}
        .info{background:rgba(0,255,136,.1);border:1px solid #00ff88;border-radius:10px;padding:15px;margin-bottom:20px;font-size:14px}
        .info h3{color:#00ff88;margin-bottom:10px}
        input[type="file"]{display:none}
        .btn{width:100%;padding:15px;margin:10px 0;border:none;border-radius:10px;font-size:18px;font-weight:700;cursor:pointer;transition:all .3s}
        .btn-primary{background:linear-gradient(135deg,#00ff88,#00cc6a);color:#1a1a2e}
        .btn-primary:hover{transform:scale(1.02)}
        .btn-secondary{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff}
        #preview{width:100%;max-height:300px;margin:15px 0;border-radius:10px;display:none}
        #result{width:100%;max-height:400px;margin:15px 0;border-radius:10px;display:none}
        .status{text-align:center;padding:10px;margin:10px 0;border-radius:10px;display:none}
        .loading{background:rgba(255,193,7,.2);color:#ffc107}.success{background:rgba(0,255,136,.2);color:#00ff88}.error{background:rgba(255,87,87,.2);color:#ff5757}
        .stats{background:rgba(255,255,255,.05);border-radius:10px;padding:10px;margin-top:15px;font-size:14px}
        .stats div{margin:5px 0}
        .badge{display:inline-block;background:#00ff88;color:#1a1a2e;padding:3px 8px;border-radius:5px;font-size:12px;margin-right:5px}
    </style>
</head>
<body>
    <h1>📷 YOLOv8 实时检测</h1>
    <div class="container">
        <div class="info"><h3>🎯 使用说明</h3><p>1. 点击「📸 拍照上传」选择或拍摄照片</p><p>2. 服务器将自动分析图片中的物体</p><p>3. 查看右侧检测结果</p></div>
        <img id="preview" alt="预览"><img id="result" alt="检测结果"><div id="status" class="status"></div>
        <input type="file" id="fileInput" accept="image/*" capture="environment">
        <button class="btn btn-primary" onclick="document.getElementById('fileInput').click()">📸 拍照上传</button>
        <button class="btn btn-secondary" onclick="useCamera()">📱 使用后置摄像头</button>
        <div class="stats"><div><span class="badge">模型</span> YOLOv8s (COCO 80类)</div><div><span class="badge">支持</span> person, car, bicycle, dog, cat...</div></div>
    </div>
    <script>
        const fi=document.getElementById('fileInput'),pv=document.getElementById('preview'),rs=document.getElementById('result'),st=document.getElementById('status');
        fi.addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;
            const r=new FileReader();r.onload=e=>{pv.src=e.target.result;pv.style.display='block'};r.readAsDataURL(f);
            st.textContent='🔄 正在分析...';st.className='status loading';st.style.display='block';rs.style.display='none';
            const fd=new FormData();fd.append('image',f);
            try{const r=await fetch('/analyze',{method:'POST',body:fd});if(r.ok){const b=await r.blob();rs.src=URL.createObjectURL(b);rs.style.display='block';st.textContent='✅ 分析完成！';st.className='status success'}else throw Error('分析失败')}catch(e){st.textContent='❌ '+e.message;st.className='status error'}});
        async function useCamera(){try{const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});const v=document.createElement('video');v.srcObject=s;v.play();
            v.onloadedmetadata=()=>{const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);
            c.toBlob(async b=>{s.getTracks().forEach(t=>t.stop());const fd=new FormData();fd.append('image',b,'camera.jpg');
            st.textContent='🔄 正在分析...';st.className='status loading';st.style.display='block';
            try{const r=await fetch('/analyze',{method:'POST',body:fd});if(r.ok){rs.src=URL.createObjectURL(await r.blob());rs.style.display='block';st.textContent='✅ 分析完成！';st.className='status success'}}catch(e){st.textContent='❌ '+e.message;st.className='status error'}},'image/jpeg')}}catch(e){st.textContent='❌ 无法访问摄像头';st.className='status error';st.style.display='block'}}
    </script>
</body>
</html>'''
    return html

@app.route('/analyze', methods=['POST'])
def analyze():
    """接收图片并返回分析结果"""
    if 'image' not in request.files:
        return '没有图片', 400

    file = request.files['image']
    image_bytes = file.read()

    logger.info(f"📥 收到图片: {len(image_bytes)} bytes")

    annotated, error = process_image(image_bytes)

    if error:
        return error, 400

    _, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return buffer.tobytes(), 200, {'Content-Type': 'image/jpeg'}

@app.route('/detect_json', methods=['POST'])
def detect_json():
    """接收图片，返回 JSON 格式的检测结果
    表单参数:
        image        - 图片文件（必需）
        model_type   - 模型类型: det | seg | pose (可选，默认当前)
        conf         - 置信度阈值 (可选，默认 0.25)
        nms          - NMS 阈值 (可选，默认 0.5)
        tracking     - 启用跟踪: 1/0 (可选，默认 1)
        smoothing    - 启用平滑: 1/0 (可选，默认 1)
    """
    if 'image' not in request.files:
        return jsonify({'error': '没有图片'}), 400

    file = request.files['image']
    image_bytes = file.read()

    model_type = request.form.get('model_type')  # None = 使用当前模型
    conf = float(request.form.get('conf', 0.25))
    nms = float(request.form.get('nms', 0.5))
    tracking = request.form.get('tracking', '1') != '0'
    smoothing = request.form.get('smoothing', '1') != '0'

    logger.info(f"📥 JSON检测: {len(image_bytes)} bytes, 模型={model_type or 'current'}, "
                f"conf={conf}, nms={nms}, tracking={tracking}")

    result = detect_image_json(
        image_bytes,
        model_type=model_type,
        conf_threshold=conf,
        nms_threshold=nms,
        enable_tracking=tracking,
        enable_smoothing=smoothing
    )

    if result is None:
        return jsonify({'error': '图片解码失败'}), 400

    return jsonify(result)

@app.route('/models', methods=['GET'])
def list_models():
    """列出可用模型及其加载状态"""
    return jsonify(model_manager.list_models())

@app.route('/current_model', methods=['GET'])
def current_model():
    """获取当前使用的模型类型"""
    return jsonify({
        'current_type': model_manager.current_type,
        'models': model_manager.list_models(),
    })

@app.route('/switch_model', methods=['POST'])
def switch_model():
    """切换当前模型类型"""
    data = request.get_json()
    if not data or 'model_type' not in data:
        return jsonify({'error': '缺少 model_type 参数'}), 400

    mt = data['model_type']
    if mt not in ('det', 'seg', 'pose'):
        return jsonify({'error': f'无效的模型类型: {mt}，可选: det, seg, pose'}), 400

    try:
        # 尝试加载新模型（确保文件存在）
        model_manager.get_model(mt)
        model_manager.switch_model(mt)
        logger.info(f"🔄 模型已切换至: {mt}")
        return jsonify({'status': 'ok', 'current_type': mt})
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': f'模型加载失败: {str(e)}'}), 500

@app.route('/calibrate', methods=['GET', 'POST'])
def calibrate():
    """获取或设置像素→米校准值"""
    global PIXEL_TO_METER
    if request.method == 'POST':
        data = request.get_json()
        if not data or 'pixel_to_meter' not in data:
            return jsonify({'error': '缺少 pixel_to_meter'}), 400
        val = float(data['pixel_to_meter'])
        if val <= 0:
            return jsonify({'error': '值必须大于 0'}), 400
        PIXEL_TO_METER = val
        logger.info(f"📏 校准更新: 1px = {PIXEL_TO_METER:.6f}m")
        return jsonify({'status': 'ok', 'pixel_to_meter': PIXEL_TO_METER})
    return jsonify({'pixel_to_meter': PIXEL_TO_METER})

@app.route('/health')
def health():
    """健康检查"""
    return {
        'status': 'ok',
        'model': os.path.basename(model_manager.model_paths.get(model_manager.current_type, '')),
        'current_type': model_manager.current_type,
        'models': {t: {'loaded': t in model_manager.models,
                       'exists': info['exists']}
                   for t, info in model_manager.list_models().items()},
    }

if __name__ == '__main__':
    # 启动时默认加载 det 模型
    try:
        model_manager.get_model('det')
        logger.info("✅ 默认检测模型加载完成")
    except FileNotFoundError as e:
        logger.warning(f"⚠️ 检测模型未找到: {e}")
    except Exception as e:
        logger.warning(f"⚠️ 模型加载异常: {e}")

    logger.info("🚀 启动服务: http://0.0.0.0:60017")
    app.run(host='0.0.0.0', port=60017, debug=False, threaded=True)
