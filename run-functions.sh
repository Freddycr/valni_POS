#!/bin/bash

# Script to run the Firebase Functions locally for development

echo "Starting Firebase Functions emulator..."
cd functions
firebase emulators:start --only functions