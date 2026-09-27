import { z } from 'zod';

export const envSchema = z.object({
  PORT: z
    .string()
    .default('3000')
    .refine((val) => /^\d+$/.test(val), {
      message: 'PORT must be a valid numeric string',
    })
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1, 'PORT must be >= 1').max(65535, 'PORT must be <= 65535')),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z
    .string()
    .min(16, 'SESSION_SECRET must be at least 16 characters long'),
  SESSION_TTL_SECONDS: z
    .string()
    .default('604800')
    .refine((val) => /^\d+$/.test(val), {
      message: 'SESSION_TTL_SECONDS must be a valid numeric string',
    })
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(60, 'SESSION_TTL_SECONDS must be >= 60')),
});

export type EnvInput = z.input<typeof envSchema>;
export type EnvOutput = z.output<typeof envSchema>;

export interface Config {
  readonly port: number;
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly databaseUrl: string;
  readonly sessionSecret: string;
  readonly sessionTtlSeconds: number;
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly isDevelopment: boolean;
}

/**
 * Loads and validates environment variables.
 * Throws a descriptive Error if validation fails.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    const errorMessages = Object.entries(fieldErrors)
      .map(([field, errors]) => `${field}: ${errors?.join(', ')}`)
      .join('; ');
    throw new Error(`Configuration validation error: ${errorMessages}`);
  }

  const { PORT, NODE_ENV, DATABASE_URL, SESSION_SECRET, SESSION_TTL_SECONDS } = result.data;

  return {
    port: PORT,
    nodeEnv: NODE_ENV,
    databaseUrl: DATABASE_URL,
    sessionSecret: SESSION_SECRET,
    sessionTtlSeconds: SESSION_TTL_SECONDS,
    isProduction: NODE_ENV === 'production',
    isTest: NODE_ENV === 'test',
    isDevelopment: NODE_ENV === 'development',
  };
}
