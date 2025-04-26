import { 
  SlashCommandBuilder, 
  Client, 
  ChatInputCommandInteraction,
  EmbedBuilder,
  ColorResolvable,
  PermissionFlagsBits,
  REST,
  Routes
} from 'discord.js';
import axios from 'axios';
import { IStorage } from '../storage';
import { 
  initiateVerification, 
  completeVerification, 
  checkVerificationStatus 
} from './roblox';
import { generateLog } from './utils';
import { verificationInstructions } from './verification-messages';
import dotenv from 'dotenv';

dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

// Define the slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Roblox account')
    .addStringOption(option => 
      option.setName('roblox-username')
        .setDescription('Your Roblox username')
        .setRequired(true))
    .toJSON(),
  
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check your verification status')
    .toJSON(),
  
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Display help information about the bot')
    .toJSON(),
  
  new SlashCommandBuilder()
    .setName('update')
    .setDescription('Update your verification if you changed your Roblox username')
    .toJSON(),
  
  new SlashCommandBuilder()
    .setName('setup-verification')
    .setDescription('Setup the verification system for your server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption(option => 
      option.setName('verification-role')
        .setDescription('Role to give after verifying')
        .setRequired(true))
    .addChannelOption(option => 
      option.setName('verified-channel')
        .setDescription('Where users get verified')
        .setRequired(true))
    .addRoleOption(option => 
      option.setName('unverified-role')
        .setDescription('Optional role to remove after verifying')
        .setRequired(false))
    .toJSON(),
  
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure the verification bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('roles')
        .setDescription('Configure verification roles')
        .addRoleOption(option => 
          option.setName('role')
            .setDescription('Role to give verified members')
            .setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('channel')
        .setDescription('Set verification or log channel')
        .addStringOption(option => 
          option.setName('type')
            .setDescription('Channel type to configure')
            .setRequired(true)
            .addChoices(
              { name: 'Verification Channel', value: 'verification' },
              { name: 'Log Channel', value: 'log' }
            ))
        .addChannelOption(option => 
          option.setName('channel')
            .setDescription('Channel to use')
            .setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('settings')
        .setDescription('Configure general settings')
        // All options are optional for settings subcommand, so no reordering needed
        .addBooleanOption(option => 
          option.setName('auto-kick')
            .setDescription('Automatically kick unverified users after 24 hours'))
        .addBooleanOption(option => 
          option.setName('dm-users')
            .setDescription('Send users a DM on verification'))
        .addBooleanOption(option => 
          option.setName('allow-reverify')
            .setDescription('Allow users to reverify their accounts'))
    )
    .toJSON(),
  
  new SlashCommandBuilder()
    .setName('logs')
    .setDescription('View verification logs')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  
  new SlashCommandBuilder()
    .setName('reverify')
    .setDescription('Force a user to reverify')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(option => 
      option.setName('user')
        .setDescription('User to force reverification')
        .setRequired(true))
    .toJSON(),
];

// Register slash commands with Discord
export async function registerCommands(client: Client): Promise<void> {
  if (!CLIENT_ID || !DISCORD_TOKEN) {
    console.error('Missing required environment variables: DISCORD_CLIENT_ID or DISCORD_TOKEN');
    return;
  }

  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    
    console.log('Started refreshing application (/) commands.');
    
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands },
    );
    
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Failed to refresh application commands:', error);
  }
}

// Handle slash command interactions
export async function handleCommand(
  interaction: ChatInputCommandInteraction, 
  storage: IStorage,
  client?: Client
): Promise<void> {
  const { commandName, guildId, user } = interaction;
  
  if (!guildId) {
    await interaction.reply('This command can only be used in a server.');
    return;
  }
  
  switch (commandName) {
    case 'verify':
      await handleVerifyCommand(interaction, storage);
      break;
      
    case 'status':
      await handleStatusCommand(interaction, storage, client);
      break;
      
    case 'help':
      await handleHelpCommand(interaction);
      break;
      
    case 'config':
      await handleConfigCommand(interaction, storage);
      break;
      
    case 'logs':
      await handleLogsCommand(interaction, storage);
      break;
      
    case 'reverify':
      await handleReverifyCommand(interaction, storage);
      break;
      
    case 'setup-verification':
      await handleSetupVerificationCommand(interaction, storage);
      break;
      
    case 'update':
      await handleUpdateCommand(interaction, storage, client);
      break;
      
    default:
      await interaction.reply({
        content: `Unknown command: ${commandName}`,
        ephemeral: true
      });
  }
}

// Handler for /verify command
async function handleVerifyCommand(
  interaction: ChatInputCommandInteraction, 
  storage: IStorage
): Promise<void> {
  if (!interaction.guildId) return;
  
  // Check if user is already verified
  const existingVerification = await storage.getVerifiedUserByDiscordId(
    interaction.user.id, 
    interaction.guildId
  );
  
  if (existingVerification) {
    // Check if reverification is allowed
    const serverConfig = await storage.getServerConfig(interaction.guildId);
    
    if (serverConfig && !serverConfig.allowReverification) {
      await interaction.reply({
        content: `You are already verified as ${existingVerification.robloxUsername}. Reverification is not allowed on this server.`,
        ephemeral: true
      });
      return;
    }
    
    // Delete existing verification
    await storage.deleteVerifiedUser(interaction.user.id, interaction.guildId);
  }
  
  // Begin verification process
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Get Roblox username - it's required now
    const robloxUsername = interaction.options.getString('roblox-username');
    let usernameMessage = '';
    let robloxUserInfo = null;
    
    // If a username was provided, try to look it up from Roblox
    if (robloxUsername) {
      try {
        // Search for the Roblox user to help verify
        const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
          usernames: [robloxUsername],
          excludeBannedUsers: true
        });
        
        if (response.data.data && response.data.data.length > 0) {
          const user = response.data.data[0];
          
          // Try to get additional profile information
          const profileResponse = await axios.get(`https://users.roblox.com/v1/users/${user.id}`);
          
          robloxUserInfo = {
            id: user.id,
            name: user.name,
            displayName: user.displayName,
            avatar: `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=420&height=420&format=png`,
            description: profileResponse.data.description || 'No description provided.'
          };
          
          // Create message with user info and avatar
          usernameMessage = `\n\n**Roblox Account Found:**\n` +
            `Username: **${user.name}**\n` +
            `Display Name: **${user.displayName}**\n` +
            `ID: ${user.id}\n\n` +
            `Add the verification code below to your profile description to verify this account.`;
          
          console.log(`Found Roblox user: ${user.name} (${user.id})`);
        } else {
          usernameMessage = `\n\n⚠️ **Roblox username "${robloxUsername}" not found.** If this is your correct username, make sure your profile is public and try again.`;
          console.log(`Roblox username "${robloxUsername}" not found`);
        }
      } catch (error) {
        console.error('Error looking up Roblox user:', error);
        usernameMessage = `\n\nYou provided the Roblox username: **${robloxUsername}**\nMake sure this matches your actual Roblox account.`;
      }
    }
    
    // Pass the Roblox username to initiateVerification
    const verificationCode = await initiateVerification(
      interaction.user.id,
      interaction.user.tag,
      interaction.guildId,
      storage,
      robloxUsername
    );
    
    const embed = new EmbedBuilder()
      .setTitle('Roblox Verification')
      .setDescription(`Please follow these steps to verify your Roblox account:${usernameMessage}`)
      .setColor('#5865F2' as ColorResolvable)
      .addFields(
        { name: '1. Copy your verification code', value: `\`${verificationCode}\`` },
        { name: '2. Add the code to your Roblox profile', value: verificationInstructions.addCodeToProfile },
        { name: '3. Complete verification', value: verificationInstructions.completeVerification }
      )
      .setFooter({ text: verificationInstructions.codeExpiration });
    
    // If we got user info with an avatar, set it as the thumbnail
    if (robloxUserInfo) {
      embed.setThumbnail(robloxUserInfo.avatar);
    }
    
    await interaction.followUp({ embeds: [embed], ephemeral: true });
    
    // Create log entry
    await generateLog(
      interaction.user.id, 
      interaction.user.tag, 
      robloxUsername || null, 
      interaction.guildId, 
      'pending', 
      `Verification initiated${robloxUsername ? ` with username ${robloxUsername}` : ''}`, 
      storage
    );
    
  } catch (error) {
    console.error('Verification error:', error);
    await interaction.followUp({ 
      content: 'An error occurred during the verification process. Please try again later.',
      ephemeral: true
    });
  }
}

// Handler for /status command
async function handleStatusCommand(
  interaction: ChatInputCommandInteraction, 
  storage: IStorage,
  client?: Client
): Promise<void> {
  if (!interaction.guildId) return;
  
  await interaction.deferReply({ ephemeral: true });
  
  // Check if user is already verified
  const existingVerification = await storage.getVerifiedUserByDiscordId(
    interaction.user.id, 
    interaction.guildId
  );
  
  if (existingVerification) {
    // Format verified timestamp, if available
    const verifiedTime = existingVerification.verifiedAt 
      ? new Date(existingVerification.verifiedAt)
      : new Date();
      
    const embed = new EmbedBuilder()
      .setTitle('Verification Status')
      .setDescription(`You are verified as **${existingVerification.robloxUsername}**`)
      .setColor('#57F287' as ColorResolvable)
      .setTimestamp(verifiedTime);
    
    await interaction.followUp({ embeds: [embed], ephemeral: true });
    return;
  }
  
  // Check for pending verification
  const pendingVerification = await storage.getPendingVerification(
    interaction.user.id,
    interaction.guildId
  );
  
  if (!pendingVerification) {
    await interaction.followUp({ 
      content: 'You don\'t have an active verification process. Use `/verify` to start verification.',
      ephemeral: true
    });
    return;
  }
  
  // Check verification status
  try {
    const result = await checkVerificationStatus(
      pendingVerification,
      interaction.user.tag,
      interaction.member,
      storage
    );
    
    if (result.success) {
      const embed = new EmbedBuilder()
        .setTitle('Verification Successful')
        .setDescription(`You have been successfully verified as **${result.robloxUsername}**`)
        .setColor('#57F287' as ColorResolvable)
        .addFields({ 
          name: 'Roles Assigned', 
          value: result.roles.length > 0 
            ? result.roles.join(', ') 
            : 'No verification roles configured' 
        });
      
      await interaction.followUp({ embeds: [embed], ephemeral: true });
      
      // Complete the verification
      if (result.robloxId && result.robloxUsername) {
        await completeVerification(
          pendingVerification,
          result.robloxId,
          result.robloxUsername,
          storage,
          client
        );
        
        // Generate success log
        await generateLog(
          interaction.user.id, 
          interaction.user.tag, 
          result.robloxUsername, 
          interaction.guildId, 
          'success', 
          `Verified as ${result.robloxUsername}`,
          storage
        );
      } else {
        console.error('Missing Roblox information for verification completion');
        await interaction.followUp({ 
          content: 'An error occurred while completing verification. Missing Roblox information.',
          ephemeral: true
        });
      }
      
    } else {
      const embed = new EmbedBuilder()
        .setTitle('Verification Check')
        .setDescription('Your verification code was not found on your Roblox profile.')
        .setColor('#ED4245' as ColorResolvable)
        .addFields(
          { name: 'Verification Code', value: `\`${pendingVerification.verificationCode}\`` },
          { name: 'Next Steps', value: `${verificationInstructions.addCodeToProfile} Then try again with \`/status\`` }
        )
        .setFooter({ text: verificationInstructions.codeExpiration });
      
      await interaction.followUp({ embeds: [embed], ephemeral: true });
    }
  } catch (error) {
    console.error('Verification status error:', error);
    await interaction.followUp({ 
      content: 'An error occurred while checking your verification status. Please try again later.',
      ephemeral: true
    });
    
    // Generate failed log
    await generateLog(
      interaction.user.id, 
      interaction.user.tag, 
      null, 
      interaction.guildId, 
      'failed', 
      `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      storage
    );
  }
}

// Handler for /setup-verification command
async function handleSetupVerificationCommand(
  interaction: ChatInputCommandInteraction,
  storage: IStorage
): Promise<void> {
  if (!interaction.guildId) return;
  
  // Verify that the user has permission to manage roles
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: 'You need the "Manage Roles" permission to use this command.',
      ephemeral: true
    });
    return;
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Get the roles and channel from the options
    const verificationRole = interaction.options.getRole('verification-role');
    const unverifiedRole = interaction.options.getRole('unverified-role');
    const verifiedChannel = interaction.options.getChannel('verified-channel');
    
    if (!verificationRole || !verifiedChannel) {
      await interaction.followUp({
        content: 'Missing required options. Please provide a verification role and verified channel.',
        ephemeral: true
      });
      return;
    }
    
    // Get or create server config
    const serverConfig = await storage.getServerConfig(interaction.guildId) || {
      serverId: interaction.guildId,
      verificationChannelId: null,
      logChannelId: null,
      autoKickUnverified: false,
      dmOnVerification: true,
      allowReverification: true
    };
    
    // Update server config with the verified channel
    serverConfig.verificationChannelId = verifiedChannel.id;
    
    // Save the server config
    if (await storage.getServerConfig(interaction.guildId)) {
      await storage.updateServerConfig(interaction.guildId, serverConfig);
    } else {
      await storage.createServerConfig(serverConfig);
    }
    
    // Get role color safely
    const verificationRoleColor = typeof (verificationRole as any).hexColor === 'string' 
      ? (verificationRole as any).hexColor 
      : '#000000'; // Default color if not available
    
    // Add the verification role
    await storage.createVerificationRole({
      serverId: interaction.guildId,
      roleId: verificationRole.id,
      roleName: verificationRole.name,
      roleColor: verificationRoleColor
    });
    
    // Store unverified role in server config if provided
    if (unverifiedRole) {
      // Update server config with unverified role ID
      await storage.updateServerConfig(interaction.guildId, {
        unverifiedRoleId: unverifiedRole.id
      });
    }
    
    // Create a success message
    const embed = new EmbedBuilder()
      .setTitle('Verification Setup Complete')
      .setDescription('The verification system has been set up for this server.')
      .setColor('#57F287' as ColorResolvable)
      .addFields(
        { name: 'Verification Role', value: `<@&${verificationRole.id}>` },
        { name: 'Verification Channel', value: `<#${verifiedChannel.id}>` }
      );
    
    if (unverifiedRole) {
      embed.addFields({ name: 'Unverified Role', value: `<@&${unverifiedRole.id}>` });
    }
    
    await interaction.followUp({ embeds: [embed], ephemeral: true });
    
    // Log the setup
    await generateLog(
      interaction.user.id,
      interaction.user.tag,
      null,
      interaction.guildId,
      'success',
      'Verification system setup completed',
      storage
    );
    
  } catch (error) {
    console.error('Error setting up verification:', error);
    await interaction.followUp({
      content: 'An error occurred while setting up verification.',
      ephemeral: true
    });
  }
}

// Handler for /update command
async function handleUpdateCommand(
  interaction: ChatInputCommandInteraction,
  storage: IStorage,
  client?: Client
): Promise<void> {
  if (!interaction.guildId) return;
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Check if user is verified
    const existingVerification = await storage.getVerifiedUserByDiscordId(
      interaction.user.id,
      interaction.guildId
    );
    
    if (!existingVerification) {
      await interaction.followUp({
        content: 'You are not currently verified. Please use `/verify` to verify your account first.',
        ephemeral: true
      });
      return;
    }
    
    // Start a new verification process
    const verificationCode = await initiateVerification(
      interaction.user.id,
      interaction.user.tag,
      interaction.guildId,
      storage
    );
    
    const embed = new EmbedBuilder()
      .setTitle('Update Roblox Verification')
      .setDescription(`You are currently verified as **${existingVerification.robloxUsername}**. Follow these steps to update your verification:`)
      .setColor('#5865F2' as ColorResolvable)
      .addFields(
        { name: '1. Copy your verification code', value: `\`${verificationCode}\`` },
        { name: '2. Add the code to your Roblox profile', value: verificationInstructions.addCodeToProfile },
        { name: '3. Complete verification', value: verificationInstructions.completeVerification }
      )
      .setFooter({ text: verificationInstructions.codeExpiration });
    
    await interaction.followUp({ embeds: [embed], ephemeral: true });
    
    // Create log entry
    await generateLog(interaction.user.id, interaction.user.tag, existingVerification.robloxUsername, interaction.guildId, 'pending', 'Verification update initiated', storage);
    
  } catch (error) {
    console.error('Update verification error:', error);
    await interaction.followUp({
      content: 'An error occurred during the verification update process. Please try again later.',
      ephemeral: true
    });
  }
}

// Handler for /help command
async function handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle('Roblox Verification Bot Help')
    .setDescription('This bot allows users to verify their Roblox accounts and receive designated roles based on verification.')
    .setColor('#5865F2' as ColorResolvable)
    .addFields(
      { 
        name: 'Basic Commands', 
        value: 
          '`/verify [roblox-username]` - Start the verification process\n' +
          '`/status` - Check your verification status\n' +
          '`/update` - Update your verification if you changed your Roblox username\n' +
          '`/help` - Display this help information'
      },
      {
        name: 'Admin Commands',
        value:
          '`/setup-verification` - Quick setup for verification system\n' +
          '`/config roles` - Configure verification roles\n' +
          '`/config channel` - Set verification or log channel\n' +
          '`/config settings` - Configure general settings\n' +
          '`/logs` - View verification logs\n' +
          '`/reverify [user]` - Force a user to reverify'
      },
      {
        name: 'Setup-Verification Command',
        value:
          'This command allows server admins to quickly set up the verification system with these options:\n' +
          '• `verification-role` - Role to give after verifying (required)\n' +
          '• `unverified-role` - Role to remove after verifying (optional)\n' +
          '• `verified-channel` - Channel where users get verified (required)'
      },
      {
        name: 'Verification Process',
        value:
          '1. User runs `/verify` and gets a unique verification code\n' +
          '2. User adds the code to their Roblox profile description\n' +
          '3. User runs `/status` to complete verification\n' +
          '4. After verification, the user receives the verification role and loses the unverified role (if configured)'
      }
    );
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Handler for /config command
async function handleConfigCommand(
  interaction: ChatInputCommandInteraction, 
  storage: IStorage
): Promise<void> {
  if (!interaction.guildId) return;
  
  const subcommand = interaction.options.getSubcommand();
  
  switch (subcommand) {
    case 'roles': {
      const role = interaction.options.getRole('role');
      if (!role) {
        await interaction.reply({ content: 'No role provided', ephemeral: true });
        return;
      }
      
      try {
        // Get role color safely - prefer hexColor if available (GuildRole), otherwise fallback
        const roleColor = typeof (role as any).hexColor === 'string' 
          ? (role as any).hexColor 
          : '#000000'; // Default color if not available
        
        await storage.createVerificationRole({
          serverId: interaction.guildId,
          roleId: role.id,
          roleName: role.name,
          roleColor
        });
        
        await interaction.reply({ 
          content: `Added ${role.name} as a verification role`,
          ephemeral: true
        });
      } catch (error) {
        console.error('Error adding verification role:', error);
        await interaction.reply({ 
          content: 'An error occurred while adding the verification role.',
          ephemeral: true
        });
      }
      break;
    }
    
    case 'channel': {
      const type = interaction.options.getString('type') as 'verification' | 'log';
      const channel = interaction.options.getChannel('channel');
      
      if (!channel || !type) {
        await interaction.reply({ 
          content: 'Invalid channel or type specified',
          ephemeral: true
        });
        return;
      }
      
      try {
        const serverConfig = await storage.getServerConfig(interaction.guildId) || {
          serverId: interaction.guildId,
          verificationChannelId: null,
          logChannelId: null,
          autoKickUnverified: false,
          dmOnVerification: true,
          allowReverification: true
        };
        
        if (type === 'verification') {
          serverConfig.verificationChannelId = channel.id;
        } else if (type === 'log') {
          serverConfig.logChannelId = channel.id;
        }
        
        if (await storage.getServerConfig(interaction.guildId)) {
          await storage.updateServerConfig(interaction.guildId, serverConfig);
        } else {
          await storage.createServerConfig(serverConfig);
        }
        
        await interaction.reply({ 
          content: `Set ${channel} as the ${type === 'verification' ? 'verification' : 'log'} channel`,
          ephemeral: true
        });
      } catch (error) {
        console.error('Error setting channel:', error);
        await interaction.reply({ 
          content: 'An error occurred while setting the channel.',
          ephemeral: true
        });
      }
      break;
    }
    
    case 'settings': {
      const autoKick = interaction.options.getBoolean('auto-kick');
      const dmUsers = interaction.options.getBoolean('dm-users');
      const allowReverify = interaction.options.getBoolean('allow-reverify');
      
      try {
        const serverConfig = await storage.getServerConfig(interaction.guildId) || {
          serverId: interaction.guildId,
          verificationChannelId: null,
          logChannelId: null,
          autoKickUnverified: false,
          dmOnVerification: true,
          allowReverification: true
        };
        
        const updates: Record<string, boolean> = {};
        
        if (autoKick !== null) {
          serverConfig.autoKickUnverified = autoKick;
          updates.autoKickUnverified = autoKick;
        }
        
        if (dmUsers !== null) {
          serverConfig.dmOnVerification = dmUsers;
          updates.dmOnVerification = dmUsers;
        }
        
        if (allowReverify !== null) {
          serverConfig.allowReverification = allowReverify;
          updates.allowReverification = allowReverify;
        }
        
        if (Object.keys(updates).length === 0) {
          await interaction.reply({
            content: 'No settings were changed. Please specify at least one setting to update.',
            ephemeral: true
          });
          return;
        }
        
        if (await storage.getServerConfig(interaction.guildId)) {
          await storage.updateServerConfig(interaction.guildId, serverConfig);
        } else {
          await storage.createServerConfig(serverConfig);
        }
        
        // Create a nice response message
        const updateMessages = [];
        if ('autoKickUnverified' in updates) {
          updateMessages.push(`Auto-kick unverified users: ${updates.autoKickUnverified ? 'Enabled' : 'Disabled'}`);
        }
        if ('dmOnVerification' in updates) {
          updateMessages.push(`DM users on verification: ${updates.dmOnVerification ? 'Enabled' : 'Disabled'}`);
        }
        if ('allowReverification' in updates) {
          updateMessages.push(`Allow reverification: ${updates.allowReverification ? 'Enabled' : 'Disabled'}`);
        }
        
        await interaction.reply({
          content: `Settings updated:\n${updateMessages.join('\n')}`,
          ephemeral: true
        });
      } catch (error) {
        console.error('Error updating settings:', error);
        await interaction.reply({ 
          content: 'An error occurred while updating settings.',
          ephemeral: true
        });
      }
      break;
    }
    
    default:
      await interaction.reply({
        content: `Unknown subcommand: ${subcommand}`,
        ephemeral: true
      });
  }
}

// Handler for /logs command
async function handleLogsCommand(
  interaction: ChatInputCommandInteraction, 
  storage: IStorage
): Promise<void> {
  if (!interaction.guildId) return;
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const logs = await storage.getVerificationLogs(interaction.guildId, 10);
    
    if (logs.length === 0) {
      await interaction.followUp({
        content: 'No verification logs found for this server.',
        ephemeral: true
      });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setTitle('Recent Verification Logs')
      .setColor('#5865F2' as ColorResolvable)
      .setDescription('Latest verification attempts:');
    
    logs.forEach((log, index) => {
      const statusColor = log.status === 'success' ? '🟢' : log.status === 'pending' ? '🟡' : '🔴';
      const robloxInfo = log.robloxUsername ? ` as ${log.robloxUsername}` : '';
      
      // Format timestamp safely
      const timestamp = log.timestamp
        ? new Date(log.timestamp).toLocaleString()
        : 'Unknown time';
      
      embed.addFields({
        name: `${statusColor} ${log.discordUsername}${robloxInfo}`,
        value: `${timestamp} - ${log.message || log.status}`
      });
    });
    
    await interaction.followUp({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.error('Error fetching verification logs:', error);
    await interaction.followUp({ 
      content: 'An error occurred while fetching verification logs.',
      ephemeral: true
    });
  }
}

// Handler for /reverify command
async function handleReverifyCommand(
  interaction: ChatInputCommandInteraction, 
  storage: IStorage
): Promise<void> {
  if (!interaction.guildId) return;
  
  const targetUser = interaction.options.getUser('user');
  
  if (!targetUser) {
    await interaction.reply({
      content: 'No user specified for reverification.',
      ephemeral: true
    });
    return;
  }
  
  try {
    // Remove the user's verification
    const deleted = await storage.deleteVerifiedUser(targetUser.id, interaction.guildId);
    
    if (!deleted) {
      await interaction.reply({
        content: `${targetUser.tag} is not currently verified in this server.`,
        ephemeral: true
      });
      return;
    }
    
    // Log the reverification
    await generateLog(
      targetUser.id,
      targetUser.tag,
      null,
      interaction.guildId,
      'pending',
      `Forced reverification by ${interaction.user.tag}`,
      storage
    );
    
    await interaction.reply({
      content: `Successfully reset verification for ${targetUser.tag}. They will need to verify again.`,
      ephemeral: true
    });
  } catch (error) {
    console.error('Error during reverification:', error);
    await interaction.reply({ 
      content: 'An error occurred during the reverification process.',
      ephemeral: true
    });
  }
}
