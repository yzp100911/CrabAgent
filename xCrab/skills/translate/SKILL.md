---
name: translate
description: 多语言翻译，支持中英日韩法德等常见语言
---

# Translate 技能

提供高质量的多语言翻译服务。

## 用法

用户说"翻译xxx"时，直接用 curl 调用翻译 API：

```bash
# 中译英
curl -s "https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=en&dt=t&q=你好世界"

# 英译中
curl -s "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=hello"
```

## 注意事项
- 直接使用谷歌翻译接口，无需 API Key
- 适合短文本翻译
