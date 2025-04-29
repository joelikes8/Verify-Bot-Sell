# Deploying to Deno Deploy

This guide will walk you through the steps to deploy the Discord Verify Bot on Deno Deploy.

## Prerequisites

1. A [Deno Deploy](https://dash.deno.com) account
2. Your Discord Bot Token
3. Your Roblox Cookie
4. Admin User ID

## Deployment Steps

### 1. Fork or Clone the Repository

First, make sure your code is in a GitHub repository that Deno Deploy can access.

### 2. Create a New Project on Deno Deploy

1. Go to [Deno Deploy dashboard](https://dash.deno.com)
2. Click "New Project" 
3. Connect your GitHub repository
4. Select the repository that contains your bot code

### 3. Configure the Project

1. Set the entry point to `deno-deploy.ts`
2. Add the following environment variables:
   - `DISCORD_BOT_TOKEN`: Your Discord bot token
   - `ROBLOX_COOKIE`: Your Roblox authentication cookie
   - `ADMIN_USER_ID`: Your Discord user ID (for admin commands)
   - `DATABASE_URL`: Your PostgreSQL database connection string (if applicable)

### 4. Deploy the Project

1. Click "Deploy" to deploy your bot
2. Once the deployment is complete, you should see a URL for your project
3. Your bot should now be running on Deno Deploy

## Verifying the Deployment

1. Visit your deployment URL to verify the API is running
2. Check the Deno Deploy logs to ensure your bot has logged in to Discord

## Troubleshooting

- **Bot not connecting to Discord**: Check that your `DISCORD_BOT_TOKEN` is correctly set in the environment variables
- **Database connection issues**: Verify your `DATABASE_URL` is correct and accessible from Deno Deploy
- **Roblox API issues**: Ensure your `ROBLOX_COOKIE` is valid and not expired

## Database Notes

If you're using a database, make sure it's accessible from Deno Deploy's network. For Postgres, consider using Neon or another cloud PostgreSQL provider.

## Additional Resources

- [Deno Deploy Documentation](https://deno.com/deploy/docs)
- [Oak Framework Documentation](https://deno.land/x/oak)
- [Discord.js Documentation](https://discord.js.org/)