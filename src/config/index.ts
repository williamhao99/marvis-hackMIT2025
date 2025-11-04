/**
 * Centralized configuration management with validation
 */

export interface Config {
  packageName: string
  mentraApiKey: string
  port: number

  anthropicApiKey?: string
  cerebrasApiKey?: string
  serpapiKey?: string
  exaApiKey?: string

  s3BucketUrl: string
  awsAccessKeyId?: string
  awsSecretAccessKey?: string
  awsRegion?: string

  nodeEnv: string
  logLevel: string
}

class ConfigManager {
  private config: Config

  constructor() {
    this.config = this.loadConfig()
    this.validate()
  }

  private loadConfig(): Config {
    return {
      packageName: process.env.PACKAGE_NAME || "com.marvis.hackmit2025",
      mentraApiKey: process.env.MENTRAOS_API_KEY || "",
      port: parseInt(process.env.PORT || "3000"),

      anthropicApiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
      cerebrasApiKey: process.env.CEREBRAS_API_KEY,
      serpapiKey: process.env.SERPAPI_KEY,
      exaApiKey: process.env.EXA_API_KEY,

      s3BucketUrl: process.env.S3_BUCKET_URL || "https://hackmit25.s3.amazonaws.com",
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
      awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      awsRegion: process.env.AWS_REGION || "us-east-1",

      nodeEnv: process.env.NODE_ENV || "development",
      logLevel: process.env.LOG_LEVEL || "info",
    }
  }

  private validate(): void {
    const errors: string[] = []

    if (!this.config.mentraApiKey) {
      errors.push("MENTRAOS_API_KEY is required")
    }

    if (!this.config.anthropicApiKey) {
      console.warn("ANTHROPIC_API_KEY not set - instruction generation will be limited")
    }

    if (!this.config.cerebrasApiKey) {
      console.warn("CEREBRAS_API_KEY not set - product identification will be limited")
    }

    if (!this.config.serpapiKey && !this.config.exaApiKey) {
      console.warn("Neither SERPAPI_KEY nor EXA_API_KEY set - manual search will be disabled")
    }

    if (errors.length > 0) {
      console.error("Configuration errors:")
      errors.forEach(err => console.error(`   - ${err}`))
      console.error("\nPlease check your .env file")
      process.exit(1)
    }
  }

  get(): Config {
    return this.config
  }

  isDevelopment(): boolean {
    return this.config.nodeEnv === 'development'
  }

  isProduction(): boolean {
    return this.config.nodeEnv === 'production'
  }
}

export const config = new ConfigManager().get()
export const configManager = new ConfigManager()
