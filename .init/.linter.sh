#!/bin/bash
cd /home/kavia/workspace/code-generation/thought-chain-platform-214367-214409/thought_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

