"""生成一张真实的测试图片"""
from PIL import Image, ImageDraw

# 创建一张 100x100 的蓝色图片
img = Image.new('RGB', (100, 100), color='skyblue')
d = ImageDraw.Draw(img)
d.rectangle([20, 20, 80, 80], fill='orange')
d.text((25, 45), "Hi!", fill='white')

img.save('/www/wwwroot/eclaw/sensenova-test/test_image.jpg', 'JPEG')
print(f"✅ 已生成: /www/wwwroot/eclaw/sensenova-test/test_image.jpg")
print(f"   尺寸: 100x100, skyblue 背景 + 橙色方块 + 'Hi!' 文字")