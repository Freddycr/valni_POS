# Firebase Deployment Guide

This project can be deployed to Firebase Hosting and Firebase Functions. Here's how to do it:

## Prerequisites

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

## Deployment Steps

### 1. Upgrade to Blaze Plan

Firebase Functions require the Blaze (pay-as-you-go) plan. To upgrade:

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to the "Usage & billing" section
4. Click on "Details & settings"
5. Click on "Modify plan"
6. Select the Blaze plan

### 2. Deploy the Project

After upgrading to the Blaze plan, you can deploy the project:

1. Build the frontend:
   ```bash
   npm run build
   ```

2. Deploy to Firebase:
   ```bash
   firebase deploy
   ```

This will deploy both the frontend to Firebase Hosting and the backend to Firebase Functions.

## Project Structure

- `/functions` - Contains the Firebase Functions backend code
- `/dist` - Contains the built frontend code (created during build)
- `firebase.json` - Firebase configuration file

## API Endpoints

When deployed to Firebase Functions, the API will be available at:
`https://us-central1-registroventas-466719.cloudfunctions.net/api`

The frontend automatically detects the environment and uses the appropriate API endpoint.

## Local Development

For local development, the backend runs on `http://localhost:3001` and the frontend on `http://localhost:5173`.

To run the backend locally:
```bash
cd backend
node server.js
```

To run the frontend locally:
```bash
npm run dev
```