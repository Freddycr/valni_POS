#!/bin/bash

# Script to build and deploy the project to Firebase

echo "Building the frontend..."
npm run build

if [ $? -eq 0 ]; then
    echo "Frontend built successfully!"
    echo "Deploying to Firebase..."
    firebase deploy
else
    echo "Frontend build failed. Please check the errors above."
    exit 1
fi