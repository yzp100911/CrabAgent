---
name: weather
description: 获取全球城市实时天气和天气预报
---

# Weather 技能

使用 wttr.in 获取实时天气信息。

## 用法

### 当前天气
使用 curl 查询 wttr.in：
```bash
curl "wttr.in/北京?format=3"
curl "wttr.in/London?format=%l:+%c+%t+(feels+like+%f),+%w+wind,+%h+humidity"
```

### 天气预报
```bash
# 3天预报
curl "wttr.in/北京"

# JSON 格式
curl "wttr.in/北京?format=j1"
```

## 注意事项
- 城市名可以用中文或英文
- 无需 API Key
- 注意频率限制
