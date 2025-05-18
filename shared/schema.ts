import { pgTable, text, serial, integer, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// NOTE: User schema has been removed as it's not needed for this application

// Location schema (for travel map)
export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  date: text("date").notNull(),
  description: text("description").notNull(),
  highlight: text("highlight").notNull(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  image: text("image").notNull(),
});

export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
});

// Access code schema
export const accessCodes = pgTable("access_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  active: boolean("active").notNull().default(true),
});

export const insertAccessCodeSchema = createInsertSchema(accessCodes).omit({
  id: true,
});

// Define types

export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locations.$inferSelect;

export type InsertAccessCode = z.infer<typeof insertAccessCodeSchema>;
export type AccessCode = typeof accessCodes.$inferSelect;

// Auth validation type
export const validateAccessCodeSchema = z.object({
  code: z.string().min(1, "Access code is required"),
});

export type ValidateAccessCode = z.infer<typeof validateAccessCodeSchema>;
