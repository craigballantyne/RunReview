import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_COOKIE_SECRET: z.string().min(16),
  SESSION_COOKIE_NAME: z.string().default("rr_session"),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  APP_BASE_URL: z.string().url(),
  API_BASE_URL: z.string().url(),
  NOMINATIM_USER_AGENT: z.string().min(1),
  IMPORT_UPLOAD_DIR: z.string().min(1),
  IMPORT_MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(268_435_456),
  PORT: z.coerce.number().int().positive().default(3000),
  // z.coerce.boolean() is a footgun here: Boolean("false") is true, so any non-empty
  // string (including the literal "false") would coerce to true. Compare explicitly instead.
  FEATURE_EMAIL_VERIFICATION: z
    .string()
    .default("true")
    .transform((val) => val !== "false"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
