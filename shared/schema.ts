import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User schema for authentication
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Discord server configuration
export const serverConfigs = pgTable("server_configs", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull().unique(),
  verificationChannelId: text("verification_channel_id"),
  logChannelId: text("log_channel_id"),
  unverifiedRoleId: text("unverified_role_id"),
  autoKickUnverified: boolean("auto_kick_unverified").default(false),
  dmOnVerification: boolean("dm_on_verification").default(true),
  allowReverification: boolean("allow_reverification").default(true),
});

export const insertServerConfigSchema = createInsertSchema(serverConfigs).omit({
  id: true,
});

// Verification role configuration
export const verificationRoles = pgTable("verification_roles", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  roleId: text("role_id").notNull(),
  roleName: text("role_name").notNull(),
  roleColor: text("role_color"),
});

export const insertVerificationRoleSchema = createInsertSchema(verificationRoles).omit({
  id: true,
});

// Verified users
export const verifiedUsers = pgTable("verified_users", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  discordUsername: text("discord_username").notNull(),
  robloxId: text("roblox_id").notNull(),
  robloxUsername: text("roblox_username").notNull(),
  serverId: text("server_id").notNull(),
  verifiedAt: timestamp("verified_at").defaultNow(),
  verificationCode: text("verification_code"),
});

export const insertVerifiedUserSchema = createInsertSchema(verifiedUsers).omit({
  id: true,
  verifiedAt: true,
});

// Verification logs
export const verificationLogs = pgTable("verification_logs", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  discordUsername: text("discord_username").notNull(),
  robloxUsername: text("roblox_username"),
  serverId: text("server_id").notNull(),
  status: text("status").notNull(), // "success", "failed", "pending"
  timestamp: timestamp("timestamp").defaultNow(),
  message: text("message"),
});

export const insertVerificationLogSchema = createInsertSchema(verificationLogs).omit({
  id: true,
  timestamp: true,
});

// Verification codes for pending verifications
export const pendingVerifications = pgTable("pending_verifications", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  serverId: text("server_id").notNull(),
  verificationCode: text("verification_code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  metadata: text("metadata"), // For storing roblox username and other data
});

export const insertPendingVerificationSchema = createInsertSchema(pendingVerifications).omit({
  id: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type ServerConfig = typeof serverConfigs.$inferSelect;
export type InsertServerConfig = z.infer<typeof insertServerConfigSchema>;

export type VerificationRole = typeof verificationRoles.$inferSelect;
export type InsertVerificationRole = z.infer<typeof insertVerificationRoleSchema>;

export type VerifiedUser = typeof verifiedUsers.$inferSelect;
export type InsertVerifiedUser = z.infer<typeof insertVerifiedUserSchema>;

export type VerificationLog = typeof verificationLogs.$inferSelect;
export type InsertVerificationLog = z.infer<typeof insertVerificationLogSchema>;

export type PendingVerification = typeof pendingVerifications.$inferSelect;
export type InsertPendingVerification = z.infer<typeof insertPendingVerificationSchema>;
