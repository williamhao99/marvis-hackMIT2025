#!/bin/bash

echo "Verifying MentraOS App Setup..."
echo "================================"

# Check environment variables
echo "Environment Configuration:"
echo "  Package Name: ${PACKAGE_NAME:-com.marvis.hackmit2025}"
echo "  Port: ${PORT:-3000}"
echo "  API Key: ${MENTRAOS_API_KEY:0:10}..."

# Check if server is running
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "Server is running on port 3000"
else
    echo "Server may not be running or health endpoint not available"
fi

# Check package.json
echo ""
echo "Package Configuration:"
grep -E '"name"|"@mentra/sdk"' package.json | head -2

echo ""
echo "================================"
echo "Ready to connect glasses!"
echo ""
echo "Make sure on your glasses:"
echo "1. You're connected to the same network"
echo "2. The app shows 'com.marvis.hackmit2025'"
echo "3. You can access http://[your-computer-ip]:3000"