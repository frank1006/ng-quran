#!/bin/bash
npx nx serve quranflow-api 2>&1 &
SERVER_PID=$!
sleep 8
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
  echo "✅ Server started successfully!"
  curl -s http://localhost:3000/health | jq .
  kill $SERVER_PID 2>/dev/null
else
  echo "❌ Server failed to start"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi
