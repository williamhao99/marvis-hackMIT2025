#!/bin/bash

echo "Starting ngrok tunnel with static domain..."
echo "URL: https://unspirited-gladis-unequatorial.ngrok-free.app"
echo ""

ngrok http --url=unspirited-gladis-unequatorial.ngrok-free.app 3000
