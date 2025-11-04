type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const COLORS = {
  debug: '\x1b[36m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  reset: '\x1b[0m',
  gray: '\x1b[90m',
}

export class Logger {
  private module: string
  private level: LogLevel

  constructor(module: string) {
    this.module = module
    this.level = (process.env.LOG_LEVEL as LogLevel) || 'info'
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    return levels.indexOf(level) >= levels.indexOf(this.level)
  }

  private formatMessage(level: LogLevel, message: string, meta?: any): string {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
    const color = COLORS[level]
    const moduleStr = `[${this.module}]`
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''

    if (process.env.NODE_ENV === 'production') {
      return `${timestamp} ${level.toUpperCase()} ${moduleStr} ${message}${metaStr}`
    }

    return `${COLORS.gray}${timestamp}${COLORS.reset} ${color}${level.toUpperCase()}${COLORS.reset} ${COLORS.gray}${moduleStr}${COLORS.reset} ${message}${metaStr}`
  }

  debug(message: string, meta?: any): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, meta))
    }
  }

  info(message: string, meta?: any): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, meta))
    }
  }

  warn(message: string, meta?: any): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta))
    }
  }

  error(message: string, error?: any): void {
    if (this.shouldLog('error')) {
      if (error instanceof Error) {
        console.error(this.formatMessage('error', message, {
          error: error.message,
          stack: error.stack
        }))
      } else {
        console.error(this.formatMessage('error', message, error))
      }
    }
  }

  static createLogger(module: string): Logger {
    return new Logger(module)
  }
}
