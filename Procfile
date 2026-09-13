services:
  - type: web
    name: thunder
    env: node
    plan: free
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: JWT_SECRET
        generateValue: true
      - key: CORS_ORIGIN
        value: "*"
      - key: NODE_VERSION
        value: 20.11.0
