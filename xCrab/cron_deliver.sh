#!/bin/bash
# 定时任务：发送"内容"到网页端，最多 3 次，间隔 10 秒
# 调度时间: 由 at/cron 触发本脚本，脚本内部循环 3 次

URL="http://YOUR_SERVER_DOMAIN:10090/api/cron_deliver"
USERNAME="ad1009"
MESSAGE="内容"

for i in 1 2 3; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 第 $i 次发送"
  curl -s -X POST "$URL" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\",\"message\":\"$MESSAGE\"}" \
    -w "\nHTTP状态: %{http_code}\n"
  # 最后一次不需要再 sleep
  if [ $i -lt 3 ]; then
    sleep 10
  fi
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 任务完成"
