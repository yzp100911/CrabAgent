#!/bin/bash
# 定时发送 POST 请求，每隔10秒一次，共3次

URL="http://YOUR_SERVER_DOMAIN:10090/api/cron_deliver"
DATA='{"username":"ad1009","message":"内容"}'

for i in 1 2 3; do
    echo "发送第 $i 次..."
    curl -X POST -H "Content-Type: application/json" -d "$DATA" "$URL"
    echo ""
    if [ $i -lt 3 ]; then
        sleep 10
    fi
done
echo "完成。"