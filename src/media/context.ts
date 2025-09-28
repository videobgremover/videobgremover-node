/**
 * Media context for FFmpeg configuration
 * (from Python media/context.py)
 */

import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'

/**
 * Context for media processing operations (matches Python MediaContext)
 */
export class MediaContext {
  public readonly ffmpeg: string
  public readonly ffprobe: string
  public readonly tmp: string
  private _tempFiles: Set<string> = new Set()

  constructor(ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', tmpRoot?: string, logger?: Console) {
    this.ffmpeg = ffmpeg
    this.ffprobe = ffprobe
    this.tmp = tmpRoot || os.tmpdir()

    // Set up logger if provided
    if (logger) {
      this.logger = logger
    }

    // Verify FFmpeg is available
    this._verifyFFmpeg()
  }

  /**
   * Verify that FFmpeg binaries are available (matches Python _verify_ffmpeg)
   */
  private _verifyFFmpeg(): void {
    try {
      // Check ffmpeg
      const ffmpegResult = execSync(`${this.ffmpeg} -version`, {
        encoding: 'utf-8',
        timeout: 10000,
      })
      if (!ffmpegResult.includes('ffmpeg version')) {
        throw new Error(`FFmpeg not working`)
      }

      // Check ffprobe
      const ffprobeResult = execSync(`${this.ffprobe} -version`, {
        encoding: 'utf-8',
        timeout: 10000,
      })
      if (!ffprobeResult.includes('ffprobe version')) {
        throw new Error(`FFprobe not working`)
      }

      this.logger.debug('FFmpeg binaries verified successfully')
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new Error(`FFmpeg not found. Please install FFmpeg: ${error.message}`)
      } else if (error instanceof Error && error.message.includes('timeout')) {
        throw new Error('FFmpeg verification timed out')
      } else {
        throw new Error(`FFmpeg verification failed: ${error}`)
      }
    }
  }

  /**
   * Generate a temporary file path (matches Python temp_path)
   */
  tempPath(suffix = '', prefix = 'vbr_'): string {
    const filename = `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}${suffix}`
    const filePath = path.join(this.tmp, filename)
    this._tempFiles.add(filePath)
    return filePath
  }

  /**
   * Clean up temporary files (matches Python cleanup)
   */
  cleanup(): void {
    try {
      this._tempFiles.forEach(filePath => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
          }
        } catch (error) {
          this.logger.warn(`Failed to delete temp file ${filePath}: ${error}`)
        }
      })
      this._tempFiles.clear()
      this.logger.debug('Temporary files cleaned up')
    } catch (error) {
      this.logger.warn(`Error cleaning up temporary files: ${error}`)
    }
  }

  /**
   * Check if WebM VP9 decoder is available (matches Python check_webm_support)
   */
  checkWebmSupport(): boolean {
    try {
      const result = execSync(`${this.ffmpeg} -codecs 2>/dev/null | grep libvpx-vp9`, {
        encoding: 'utf-8',
        timeout: 5000,
      })
      return result.includes('libvpx-vp9')
    } catch {
      return false
    }
  }

  /**
   * Logger interface (simplified)
   */
  logger = {
    info: (message: string) => console.log(message),
    debug: (message: string) => console.debug(message),
    warn: (message: string) => console.warn(message),
    error: (message: string) => console.error(message),
  }
}

/**
 * Default global context
 */
let _defaultContext: MediaContext | undefined

/**
 * Get the default media context
 */
export function defaultContext(): MediaContext {
  if (!_defaultContext) {
    _defaultContext = new MediaContext()
  }
  return _defaultContext
}

/**
 * Set the default media context
 */
export function setDefaultContext(context: MediaContext): void {
  _defaultContext = context
}
