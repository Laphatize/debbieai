#!/bin/bash

# Check if node_modules exists, if not install dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Create projects directory if it doesn't exist
mkdir -p projects

# Start the server
echo "Starting backend server..."
npm run dev