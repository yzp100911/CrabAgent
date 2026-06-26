#!/bin/bash
# 每隔10秒发送消息，共3次
for i in {1..3}; do
  echo "第 $i 次发送: $(date)"
  curl -X POST -H "Content-Type: application/json" -d '{"username":"YOUR_USERNAME","message":"内容"}' http://YOUR_SERVER_DOMAIN:10090/api/cron_deliver
  if [ $i -lt 3 ]; then
    echo "等待10秒..."
    sleep 10
  fi
done
echo "任务完成"