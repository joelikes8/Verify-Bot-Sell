# Discord Roblox Verification Bot

A Discord bot designed for efficient Roblox user verification and role management, leveraging PostgreSQL for persistent data storage and seamless server integration.

## Features

- **Multi-method Verification**: Uses four different approaches to verify Roblox profiles
- **Role Management**: Automatically assigns roles to verified users
- **Server Configuration**: Customize verification settings per Discord server
- **Logs & Tracking**: Keep track of verification activity
- **Nickname Syncing**: Updates Discord nickname to match Roblox username

## How It Works

1. User runs `/verify` command with their Roblox username
2. Bot generates a unique verification code
3. User adds this code to their Roblox profile description
4. User runs `/status` to check verification
5. Bot uses multiple methods to find the code in the profile:
   - Official Roblox API
   - Profile info API
   - HTML profile scraping
   - Authenticated API access (with Roblox cookie)
6. Upon success, bot assigns roles and updates nickname

## Commands

- `/verify [roblox-username]` - Start verification process
- `/status` - Check verification status or complete verification
- `/help` - Display help information
- `/update` - Update your verification if you changed Roblox username
- `/config` - Configure server settings (admin only)
- `/logs` - View verification logs (admin only)
- `/reverify` - Force a user to reverify (admin only)
- `/setup-verification` - Quick setup for server verification (admin only)

## Setup

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## Improvements

### Enhanced Verification Process
- Multiple profile checking methods for reliability
- Stores and checks the specific Roblox username provided
- Uses authenticated API access when available

### Fallback Mechanisms
- If the primary API fails, tries alternative API endpoints
- HTML scraping as last resort for private profiles
- Flexible matching for verification codes with different formats

### Quality of Life
- Automatically updates Discord nickname to match Roblox username
- Detailed logging for verification tracking
- Optional DM notifications on successful verification

## Deployment

This bot can be deployed on any Node.js hosting service. We recommend using Render for easy setup with the included `render.yaml` configuration.

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `DISCORD_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord client ID

Optional:
- `ROBLOX_COOKIE` - Roblox .ROBLOSECURITY cookie for enhanced verification