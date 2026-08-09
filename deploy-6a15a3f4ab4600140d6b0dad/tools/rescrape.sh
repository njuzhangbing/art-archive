#!/bin/bash
# Patient runner for scrape_khitan.py.
#
# CCAMC answers 200 with a 62-byte body when it is throttling, so a burst of
# requests poisons a long stretch of the run. The scraper validates every page
# and refuses to write a partial dataset; this wrapper just keeps trying, and
# because pages are cached each attempt resumes where the last one stopped.
cd "$(dirname "$0")/.."
for attempt in $(seq 1 60); do
  echo "=== attempt $attempt · $(date '+%H:%M:%S') ==="
  if python3 -u tools/scrape_khitan.py; then
    echo "=== 完成 ==="
    exit 0
  fi
  echo "--- 被限流，休息 6 分钟后续抓 ---"
  sleep 900
done
echo "=== 放弃：40 次尝试后仍未取全 ==="
exit 1
