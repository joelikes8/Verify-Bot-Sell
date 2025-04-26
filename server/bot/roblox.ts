import axios from 'axios';
import { 
  GuildMember, 
  Role, 
  ColorResolvable, 
  EmbedBuilder,
  Client
} from 'discord.js';
import { IStorage } from '../storage';
import { 
  type PendingVerification, 
  type VerificationRole 
} from '../../shared/schema';
import { nanoid } from 'nanoid';

// Roblox API base URL
const ROBLOX_API_BASE = 'https://users.roblox.com/v1/users';

// Start the verification process
export async function initiateVerification(
  discordId: string,
  discordUsername: string,
  serverId: string,
  storage: IStorage,
  robloxUsername?: string | null
): Promise<string> {
  // Clean up any existing verification attempts first
  const existingVerification = await storage.getPendingVerification(discordId, serverId);
  if (existingVerification) {
    await storage.deletePendingVerification(existingVerification.id);
  }
  
  // Generate a unique verification code in the format VERIFY-[CODE] with no spaces
  const verificationCode = `VERIFY-${nanoid(6).toUpperCase()}`;
  
  // Set expiration time (30 minutes from now)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 30);
  
  // Create metadata with Roblox username if provided
  let metadata = null;
  if (robloxUsername) {
    metadata = JSON.stringify({ robloxUsername });
    console.log(`Storing Roblox username ${robloxUsername} with verification`);
  }
  
  // Store the pending verification
  await storage.createPendingVerification({
    discordId,
    serverId,
    verificationCode,
    expiresAt,
    metadata
  });
  
  return verificationCode;
}

// Verify if a user has added the code to their profile
export async function checkVerificationStatus(
  verification: PendingVerification,
  discordUsername: string,
  member: any, // Using 'any' to accommodate different member types
  storage: IStorage
): Promise<{
  success: boolean;
  robloxId?: string;
  robloxUsername?: string;
  roles: string[];
}> {
  try {
    // First, let's check if there's a specified Roblox username stored with the verification
    // Check for the username in PendingVerification data
    const pendingVerification = await storage.getPendingVerificationByCode(verification.verificationCode);
    const specifiedRobloxUsername = pendingVerification?.metadata ? 
      JSON.parse(pendingVerification.metadata).robloxUsername : null;
    
    let potentialUsers = [];
    
    // Try to use stored Roblox username first if it exists
    if (specifiedRobloxUsername) {
      console.log(`Using stored Roblox username for verification: ${specifiedRobloxUsername}`);
      
      // Search for the specific Roblox user
      const searchResponse = await axios.post('https://users.roblox.com/v1/usernames/users', {
        usernames: [specifiedRobloxUsername],
        excludeBannedUsers: true
      });
      
      if (searchResponse.data.data && searchResponse.data.data.length > 0) {
        potentialUsers = searchResponse.data.data;
      }
    }
    
    // If no user found by stored Roblox name, fall back to Discord username
    if (potentialUsers.length === 0) {
      console.log(`No Roblox user found with stored username, trying Discord username`);
      const usernameToSearch = discordUsername.split('#')[0]; // Use the part before the discriminator
      
      // Make API request to search for users
      const searchResponse = await axios.post('https://users.roblox.com/v1/usernames/users', {
        usernames: [usernameToSearch],
        excludeBannedUsers: true
      });
      
      potentialUsers = searchResponse.data.data;
      
      // If no users found by direct match, try a broader search
      if (potentialUsers.length === 0) {
        console.log(`No exact match found, trying broader search for: ${usernameToSearch}`);
        // Try to search users through the avatar search endpoint to find users with similar names
        const fallbackSearchResponse = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(usernameToSearch)}&limit=10`);
        potentialUsers = fallbackSearchResponse.data.data || [];
      }
    }
    
    // If we still have no users, we can't proceed
    if (potentialUsers.length === 0) {
      console.log('No Roblox users found to check');
      return { success: false, roles: [] };
    }
    
    console.log(`Found ${potentialUsers.length} potential users to check`);
    
    // Check each potential profile for the verification code
    for (const user of potentialUsers) {
      try {
        console.log(`Checking profile for user ${user.name} (${user.id})`);
        let codeFound = false;
        let description = '';
        
        // METHOD 1: Try through official API v1
        try {
          const profileResponse = await axios.get(`https://users.roblox.com/v1/users/${user.id}`);
          description = profileResponse.data.description || '';
          console.log(`METHOD 1 - API v1 description for ${user.name} (${description.length} chars)`);
          
          // Check if the verification code is in the description
          const cleanDescription = description.replace(/\s+/g, '').toLowerCase();
          const cleanVerificationCode = verification.verificationCode.replace(/\s+/g, '').toLowerCase();
          
          if (cleanDescription.includes(cleanVerificationCode)) {
            console.log(`METHOD 1 - Found verification code in API description!`);
            codeFound = true;
          }
        } catch (apiError) {
          console.error(`METHOD 1 - Failed to get profile from API v1:`, apiError);
        }
        
        // METHOD 2: Try the profile info API as alternative
        if (!codeFound) {
          try {
            const infoResponse = await axios.get(`https://www.roblox.com/users/profile/profileheader-json?userId=${user.id}`);
            if (infoResponse.data && infoResponse.data.Description) {
              description = infoResponse.data.Description;
              console.log(`METHOD 2 - Profile info API description for ${user.name} (${description.length} chars)`);
              
              // Check for the code in this description
              const cleanDescription = description.replace(/\s+/g, '').toLowerCase();
              const cleanVerificationCode = verification.verificationCode.replace(/\s+/g, '').toLowerCase();
              
              if (cleanDescription.includes(cleanVerificationCode)) {
                console.log(`METHOD 2 - Found verification code in profile info API!`);
                codeFound = true;
              }
            }
          } catch (infoError) {
            console.error(`METHOD 2 - Failed to get profile from info API:`, infoError);
          }
        }
        
        // METHOD 3: Try to fetch the profile page HTML with Roblox cookie if available
        if (!codeFound) {
          try {
            const profileUrl = `https://www.roblox.com/users/${user.id}/profile`;
            console.log(`METHOD 3 - Trying to fetch profile page HTML: ${profileUrl}`);
            
            // Check if there's a Roblox cookie in the environment variables
            const robloxCookie = process.env.ROBLOX_COOKIE;
            const headers: Record<string, string> = {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml',
              'Accept-Language': 'en-US,en;q=0.9'
            };
            
            // Add cookie if available
            if (robloxCookie) {
              console.log('Using Roblox cookie for authenticated request');
              headers['Cookie'] = `.ROBLOSECURITY=${robloxCookie}`;
            } else {
              console.log('No Roblox cookie found, using anonymous request');
            }
            
            // Make the request with the appropriate headers
            const profilePageResponse = await axios.get(profileUrl, { headers });
            
            const html = profilePageResponse.data;
            
            // Look for the verification code in the HTML
            if (html.includes(verification.verificationCode)) {
              console.log(`METHOD 3 - Found verification code directly in HTML!`);
              codeFound = true;
            } else {
              // Try a more flexible search in case the HTML has different formatting
              const cleanHtml = html.replace(/\s+/g, '').toLowerCase();
              const cleanCode = verification.verificationCode.replace(/\s+/g, '').toLowerCase();
              
              if (cleanHtml.includes(cleanCode)) {
                console.log(`METHOD 3 - Found verification code in cleaned HTML!`);
                codeFound = true;
              } else {
                console.log(`METHOD 3 - Verification code not found in HTML page.`);
              }
            }
          } catch (pageError) {
            console.error(`METHOD 3 - Failed to scrape profile page:`, pageError);
          }
        }
        
        // METHOD 4: As a last resort, try using the authenticated friends API which may give more data
        if (!codeFound && process.env.ROBLOX_COOKIE) {
          try {
            console.log(`METHOD 4 - Trying to use authenticated API for user ${user.id}`);
            
            const headers = {
              'Cookie': `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Accept': 'application/json'
            };
            
            // Try a different API endpoint that requires authentication
            const userInfoResponse = await axios.get(`https://friends.roblox.com/v1/users/${user.id}`, { headers });
            if (userInfoResponse.data && userInfoResponse.data.description) {
              const description = userInfoResponse.data.description;
              console.log(`METHOD 4 - Got description from authenticated API (${description.length} chars)`);
              
              // Check if the verification code is in this description
              const cleanDescription = description.replace(/\s+/g, '').toLowerCase();
              const cleanVerificationCode = verification.verificationCode.replace(/\s+/g, '').toLowerCase();
              
              if (cleanDescription.includes(cleanVerificationCode)) {
                console.log(`METHOD 4 - Found verification code in authenticated API data!`);
                codeFound = true;
              }
            }
          } catch (authError) {
            console.error(`METHOD 4 - Failed to use authenticated API:`, authError);
          }
        }
        
        // If we found the code in any method, proceed with verification
        if (codeFound) {
          console.log(`Verification successful for user ${user.name} (${user.id})`);
          
          // Verification successful, assign roles if member exists
          const roles: string[] = [];
          
          if (member) {
            try {
              // Get server config to check for unverified role
              const serverConfig = await storage.getServerConfig(verification.serverId);
              const unverifiedRoleId = serverConfig?.unverifiedRoleId;
              
              // Remove unverified role if it exists
              if (unverifiedRoleId) {
                try {
                  const unverifiedRole = member.guild.roles.cache.get(unverifiedRoleId);
                  if (unverifiedRole && member.roles.cache.has(unverifiedRoleId)) {
                    await member.roles.remove(unverifiedRole);
                    console.log(`Removed unverified role ${unverifiedRole.name} from user ${member.user.tag}`);
                  }
                } catch (error) {
                  console.error(`Failed to remove unverified role:`, error);
                }
              }
              
              // Get verification roles for this server
              const verificationRoles = await storage.getVerificationRoles(verification.serverId);
              
              // Assign each role to the member
              for (const roleConfig of verificationRoles) {
                try {
                  const role = member.guild.roles.cache.get(roleConfig.roleId);
                  if (role) {
                    await member.roles.add(role);
                    roles.push(role.name);
                  }
                } catch (error) {
                  console.error(`Failed to add role ${roleConfig.roleName}:`, error);
                }
              }
            } catch (error) {
              console.error('Error managing roles during verification:', error);
            }
          }
          
          return {
            success: true,
            robloxId: user.id.toString(),
            robloxUsername: user.name,
            roles
          };
        }
      } catch (error) {
        console.error(`Failed to check profile for user ${user.name}:`, error);
        // Continue to the next user
      }
    }
    
    // No matching profile found
    console.log('Verification failed - code not found in any profile');
    return { success: false, roles: [] };
  } catch (error) {
    console.error('Error checking verification status:', error);
    throw new Error('Failed to check Roblox profile');
  }
}

// Complete the verification process and save the verified user
export async function completeVerification(
  verification: PendingVerification,
  robloxId: string,
  robloxUsername: string,
  storage: IStorage,
  client?: Client
): Promise<void> {
  try {
    // Create verified user record
    let discordUsername = verification.discordId;
    
    if (client) {
      try {
        const discordUser = await client.users.fetch(verification.discordId);
        discordUsername = discordUser.tag || discordUser.username || verification.discordId;
      } catch (error) {
        console.error('Failed to fetch Discord username:', error);
        // Continue with the Discord ID if we can't fetch the username
      }
    }
    
    await storage.createVerifiedUser({
      discordId: verification.discordId,
      discordUsername: typeof discordUsername === 'string' ? discordUsername : verification.discordId,
      robloxId,
      robloxUsername,
      serverId: verification.serverId,
      verificationCode: verification.verificationCode
    });
    
    // Clean up the pending verification
    await storage.deletePendingVerification(verification.id);
    
    // Update user's nickname to their Roblox username
    if (client) {
      try {
        const guild = await client.guilds.fetch(verification.serverId);
        const member = await guild.members.fetch(verification.discordId);
        
        if (member && member.manageable) {
          await member.setNickname(robloxUsername);
          console.log(`Updated nickname for ${member.user.tag} to ${robloxUsername}`);
        } else {
          console.log(`Cannot update nickname for ${verification.discordId}: Member not found or not manageable`);
        }
      } catch (error) {
        console.error('Error updating nickname:', error);
        // Continue even if nickname update fails
      }
    }
    
    // Send DM to user if configured and client is available
    if (client) {
      const serverConfig = await storage.getServerConfig(verification.serverId);
      if (serverConfig?.dmOnVerification) {
        try {
          const user = await client.users.fetch(verification.discordId);
          const guild = await client.guilds.fetch(verification.serverId);
          
          const embed = new EmbedBuilder()
            .setTitle('Verification Successful')
            .setDescription(`You have been successfully verified as **${robloxUsername}** in ${guild.name}`)
            .setColor('#57F287' as ColorResolvable)
            .setTimestamp();
          
          await user.send({ embeds: [embed] });
        } catch (error) {
          console.error('Failed to send verification DM:', error);
          // Continue even if DM fails
        }
      }
    }
  } catch (error) {
    console.error('Failed to complete verification:', error);
    throw new Error('Failed to save verification data');
  }
}
