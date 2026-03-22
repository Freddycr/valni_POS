#!/bin/bash

# Script to run both frontend and backend locally for development

echo "Starting local development environment..."

# Start the functions emulator in the background
echo "Starting Firebase Functions emulator..."
cd functions
firebase emulators:start --only functions &

# Go back to the root directory
cd ..

# Start the frontend
echo "Starting frontend..."
npm run dev