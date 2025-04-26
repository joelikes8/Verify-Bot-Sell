# Discord Verification Bot Deployment Guide

## Features
- Advanced Roblox verification system
- Custom verification messages and instructions
- Server-specific configuration
- Role management for verified users
- Verification logs and history

## Environment Setup
- **Type**: Web Service
- **Runtime**: Node.js
- **Node Version**: 18 or higher (20 recommended)

## Build Command
```
npm install && npm run build
```

## Start Command
```
npm start
```

## Required Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `DISCORD_TOKEN`: Discord bot token
- `DISCORD_CLIENT_ID`: Discord application client ID
- `NODE_ENV`: Set to `production` for deployment
- `ROBLOX_COOKIE`: (Optional) Roblox account cookie for enhanced profile access

## Setup Instructions
1. Create a Discord application and bot at the [Discord Developer Portal](https://discord.com/developers/applications)
2. Set up a PostgreSQL database (can be on Render or an external service)
3. Add all required environment variables
4. Deploy the application
5. Invite the bot to your Discord server with proper permissions:
   - Manage Roles
   - Read Messages/View Channels
   - Send Messages
   - Embed Links
   - Use Slash Commands

## Verification Process
1. Users run `/verify` command with their Roblox username
2. Bot assigns a unique verification code
3. Users add this code to their Roblox profile
4. Users run `/status` to complete verification
5. On success, users get assigned verification roles

## Additional Notes
- Make sure the bot role is higher in the server hierarchy than any roles it needs to assign
- Set up verification roles with appropriate permissions
- Configure the verification channel where users will perform verification