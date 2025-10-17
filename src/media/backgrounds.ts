/**
 * Background classes for video composition with clean separation by type
 * (from Python media/backgrounds.py)
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import mime from 'mime-types'
import { VideoSource, VideoInfo } from './video-source'
import { MediaContext, defaultContext } from './context'

// Interface for video info structure (used for ffprobe results)
interface FFProbeVideoInfo {
  streams?: Array<{
    width?: number
    height?: number
    r_frame_rate?: string
    rotation?: number
    codec_type?: string
    tags?: {
      rotate?: string
    }
  }>
  format?: {
    duration?: string
  }
}

/**
 * Abstract base class for all background types
 */
export abstract class BaseBackground {
  public readonly width: number
  public readonly height: number
  public readonly fps: number
  public readonly audioEnabled: boolean = false // Audio disabled by default for backgrounds
  public readonly audioVolume: number = 1.0 // Full volume when enabled

  constructor(width: number, height: number, fps: number, audioEnabled = false, audioVolume = 1.0) {
    this.width = width
    this.height = height
    this.fps = fps
    this.audioEnabled = audioEnabled
    this.audioVolume = Math.max(0.0, Math.min(1.0, audioVolume)) // Clamp volume to 0.0-1.0
  }

  /**
   * Get background type from class name
   */
  get kind(): string {
    return this.constructor.name.toLowerCase().replace('background', '')
  }

  /**
   * Whether this background type controls composition duration
   */
  abstract controlsDuration(): boolean

  /**
   * Get FFmpeg input arguments for this background type
   */
  abstract getFFmpegInputArgs(
    canvasWidth: number,
    canvasHeight: number,
    canvasFps: number,
    ctx: MediaContext
  ): string[]

  /**
   * Set audio properties for this background (immutable)
   */
  audio(enabled: boolean = true, volume: number = 1.0): this {
    // Create new instance preserving ALL properties (like Python model_dump())
    const clampedVolume = Math.max(0.0, Math.min(1.0, volume))

    if (this instanceof VideoBackground) {
      // VideoBackground needs special handling to preserve source and video info
      const newBg = new VideoBackground(
        this.source,
        this.width,
        this.height,
        this.fps,
        enabled,
        clampedVolume,
        this.sourceTrim
      )
      // Copy the probed video info
      if ((this as VideoBackground & { _videoInfo?: VideoInfo })._videoInfo) {
        ;(newBg as VideoBackground & { _videoInfo?: VideoInfo })._videoInfo = (
          this as VideoBackground & { _videoInfo?: VideoInfo }
        )._videoInfo
      }
      return newBg as unknown as this
    } else if (this instanceof ImageBackground) {
      return new ImageBackground(
        this.source,
        this.width,
        this.height,
        this.fps,
        enabled,
        clampedVolume
      ) as unknown as this
    } else if (this instanceof ColorBackground) {
      return new ColorBackground(
        this.color,
        this.width,
        this.height,
        this.fps,
        enabled,
        clampedVolume
      ) as unknown as this
    } else {
      // EmptyBackground or other types
      return new (this.constructor as new (...args: unknown[]) => this)(
        this.width,
        this.height,
        this.fps,
        enabled,
        clampedVolume
      )
    }
  }

  /**
   * Check if this background type can have audio
   */
  hasAudio(): boolean {
    return false // Most backgrounds don't have audio
  }

  /**
   * Get the input key for audio from this background
   */
  getAudioInputKey(): string | null {
    if (this.hasAudio()) {
      return 'background'
    }
    return null
  }

  /**
   * Get dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  /**
   * Get FPS
   */
  getFps(): number {
    return this.fps
  }
}

/**
 * Solid color background
 */
export class ColorBackground extends BaseBackground {
  public readonly color: string

  constructor(
    color: string,
    width: number,
    height: number,
    fps: number,
    audioEnabled = false,
    audioVolume = 1.0
  ) {
    super(width, height, fps, audioEnabled, audioVolume)
    this.color = color
  }

  controlsDuration(): boolean {
    // Color backgrounds let foreground control duration
    return false
  }

  getFFmpegInputArgs(canvasWidth: number, canvasHeight: number, canvasFps: number): string[] {
    // Generate color background with FFmpeg lavfi
    return [
      '-f',
      'lavfi',
      '-i',
      `color=c=${this.color}:size=${canvasWidth}x${canvasHeight}:rate=${canvasFps}`,
    ]
  }
}

/**
 * Image background (looped)
 */
export class ImageBackground extends BaseBackground {
  public readonly source: string

  constructor(
    source: string,
    width: number,
    height: number,
    fps: number,
    audioEnabled = false,
    audioVolume = 1.0
  ) {
    super(width, height, fps, audioEnabled, audioVolume)
    this.source = source
  }

  controlsDuration(): boolean {
    // Image backgrounds let foreground control duration
    return false
  }

  getFFmpegInputArgs(): string[] {
    // Loop image as background
    return ['-loop', '1', '-i', this.source]
  }
}

/**
 * Video background with format detection and decoder support
 */
export class VideoBackground extends BaseBackground {
  public readonly source: string
  public readonly sourceTrim?: [number, number?] // (start, end) for trimming
  private videoSource: VideoSource

  constructor(
    source: string,
    width: number,
    height: number,
    fps: number,
    audioEnabled = true, // Enable audio by default for video backgrounds
    audioVolume = 1.0,
    sourceTrim?: [number, number?]
  ) {
    super(width, height, fps, audioEnabled, audioVolume)
    this.source = source
    this.sourceTrim = sourceTrim
    this.videoSource = new VideoSource()
  }

  getDuration(): number | undefined {
    // Get video duration from probed info
    return this.videoSource.getDuration()
  }

  controlsDuration(): boolean {
    // Video backgrounds control composition duration
    return true
  }

  override hasAudio(): boolean {
    // Check if this video background actually has audio streams
    return this.videoSource.hasAudioStreams()
  }

  getFFmpegInputArgs(
    canvasWidth: number,
    canvasHeight: number,
    canvasFps: number,
    ctx: MediaContext
  ): string[] {
    // Get video input with optional trimming - video controls duration
    const decoderArgs = this.videoSource.getDecoderArgs(ctx)

    // Add trimming if specified
    if (this.sourceTrim) {
      const [start, end] = this.sourceTrim
      const args = [...decoderArgs, '-ss', start.toString()]
      if (end !== undefined && end !== null) {
        args.push('-t', (end - start).toString())
      }
      args.push('-i', this.source)
      return args
    } else {
      // No trimming - video background controls final duration
      return [...decoderArgs, '-i', this.source]
    }
  }

  subclip(start: number, end?: number): VideoBackground {
    // Create a new VideoBackground with source trimming
    const newBg = new VideoBackground(
      this.source,
      this.width,
      this.height,
      this.fps,
      this.audioEnabled,
      this.audioVolume,
      [start, end]
    )
    // Copy the probed video info
    const videoInfo = this.videoSource.getVideoInfo()
    if (videoInfo) {
      newBg.videoSource.setVideoInfo(videoInfo)
    }
    return newBg
  }

  // Internal method to set video info after probing
  _setVideoInfo(videoInfo: VideoInfo): void {
    this.videoSource.setVideoInfo(videoInfo)
  }
}

/**
 * Empty/transparent background
 */
export class EmptyBackground extends BaseBackground {
  constructor(width: number, height: number, fps: number, audioEnabled = false, audioVolume = 1.0) {
    super(width, height, fps, audioEnabled, audioVolume)
  }

  controlsDuration(): boolean {
    // Empty backgrounds let foreground control duration
    return false
  }

  getFFmpegInputArgs(canvasWidth: number, canvasHeight: number, canvasFps: number): string[] {
    // Generate transparent background
    return [
      '-f',
      'lavfi',
      '-i',
      `color=c=black@0.0:size=${canvasWidth}x${canvasHeight}:rate=${canvasFps}`,
    ]
  }
}

/**
 * Download an image from a URL to a temporary local file (SYNCHRONOUSLY).
 * Determines file extension from Content-Type header or URL path.
 */
function _downloadImageToTemp(imageUrl: string, ctx: MediaContext): string {
  ctx.logger.debug(`Downloading image from URL: ${imageUrl}`)

  try {
    // Use synchronous HTTP download with execSync + curl
    const tempFilePathNoExt = ctx.tempPath('', 'downloaded_image_')

    // First, get Content-Type with HEAD request to determine extension
    let extension = '.tmp'
    try {
      const headCmd = `curl -sIL -m 10 "${imageUrl}" | grep -i "content-type:" | cut -d' ' -f2 | tr -d '\\r'`
      const contentType = execSync(headCmd, { encoding: 'utf-8', timeout: 10000 }).trim()

      if (contentType) {
        const cleanContentType = contentType.split(';')[0]?.trim()
        if (cleanContentType) {
          const guessedExt = mime.extension(cleanContentType)
          if (guessedExt) {
            extension = `.${guessedExt}`
            ctx.logger.debug(`Guessed extension from Content-Type: ${extension}`)
          }
        }
      }
    } catch {
      // HEAD request failed, continue to fallback
    }

    // 2. Fallback: Determine from URL path, ignoring query parameters
    if (extension === '.tmp' || extension === '.bin') {
      try {
        const url = new URL(imageUrl)
        const pathWithoutQuery = url.pathname
        const pathExt = path.extname(pathWithoutQuery)
        if (pathExt) {
          extension = pathExt
          ctx.logger.debug(`Extracted extension from URL path: ${extension}`)
        }
      } catch {
        // Invalid URL, skip this fallback
      }
    }

    // 3. Final fallback: If still no good extension, default to .png
    if (!extension || extension === '.tmp' || extension === '.bin') {
      extension = '.png'
      ctx.logger.debug(`Defaulting to extension: ${extension}`)
    }

    // Create final temp file path with extension
    const tempFilePath = tempFilePathNoExt + extension

    // Download the file synchronously using curl (with -L to follow redirects)
    const downloadCmd = `curl -sL -m 30 -o "${tempFilePath}" "${imageUrl}"`
    execSync(downloadCmd, { timeout: 30000 })

    // Verify the file was created
    if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
      throw new Error('Downloaded file is empty or does not exist')
    }

    ctx.logger.info(`Downloaded ${imageUrl} to ${tempFilePath}`)
    return tempFilePath
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to download image from ${imageUrl}: ${error.message}`)
    }
    throw new Error(`Failed to download image from ${imageUrl}`)
  }
}

/**
 * Probe image dimensions using ffprobe
 */
function _probeImageDimensions(imagePath: string, ctx: MediaContext): [number, number] {
  try {
    const cmd = [
      ctx.ffprobe,
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      imagePath,
    ]

    const result = execSync(cmd.join(' '), { encoding: 'utf-8', timeout: 10000 })
    const data = JSON.parse(result) as FFProbeVideoInfo

    if (!data.streams || data.streams.length === 0) {
      throw new Error(`No video streams found in image ${imagePath}`)
    }

    const stream = data.streams[0]
    if (!stream) {
      throw new Error(`No video stream found in image ${imagePath}`)
    }

    const width = stream.width
    const height = stream.height

    if (!width || !height) {
      throw new Error(`Could not determine dimensions for image ${imagePath}`)
    }

    return [parseInt(width.toString()), parseInt(height.toString())]
  } catch (error) {
    if (error instanceof Error && error.message.includes('timeout')) {
      throw new Error(`Timeout while probing image ${imagePath}`)
    }
    throw new Error(`Failed to probe image dimensions for ${imagePath}: ${error}`)
  }
}

/**
 * Probe video dimensions and FPS using ffprobe, accounting for rotation
 */
function _probeVideoDimensions(videoPath: string, ctx: MediaContext): [number, number, number] {
  try {
    const cmd = [
      ctx.ffprobe,
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,r_frame_rate,rotation:stream_tags=rotate:format=duration',
      videoPath,
    ]

    const result = execSync(cmd.join(' '), { encoding: 'utf-8', timeout: 15000 })
    const data = JSON.parse(result) as FFProbeVideoInfo

    if (!data.streams || data.streams.length === 0) {
      throw new Error(`No video streams found in video ${videoPath}`)
    }

    const stream = data.streams[0]
    if (!stream) {
      throw new Error(`No video stream found in video ${videoPath}`)
    }

    // Get basic dimensions
    let width = stream.width
    let height = stream.height

    if (width === null || width === undefined || height === null || height === undefined) {
      throw new Error(`Could not determine video dimensions for ${videoPath}`)
    }

    width = parseInt(width.toString())
    height = parseInt(height.toString())

    // Check for rotation metadata (actual display dimensions)
    let rotation = 0

    // Check stream-level rotation field
    if (stream.rotation) {
      rotation = Math.abs(Math.floor(parseFloat(stream.rotation.toString())))
    }
    // Check stream tags for rotate metadata (common in mobile videos)
    else if (stream.tags && stream.tags.rotate) {
      rotation = Math.abs(parseInt(stream.tags.rotate.toString()))
    }

    // If rotated 90° or 270°, swap width and height for actual display dimensions
    if (rotation === 90 || rotation === 270) {
      ;[width, height] = [height, width]
      ctx.logger.debug(`Video has ${rotation}° rotation, swapped dimensions to ${width}x${height}`)
    }

    // Get FPS
    let fps = 30.0 // Default fallback
    const rFrameRate = stream.r_frame_rate
    if (rFrameRate && rFrameRate.includes('/')) {
      try {
        const [num, den] = rFrameRate.split('/')
        if (num && den) {
          fps = parseFloat(num) / parseFloat(den)
        }
      } catch {
        // Keep default
      }
    }

    return [width, height, fps]
  } catch (error) {
    if (error instanceof Error && error.message.includes('timeout')) {
      throw new Error(`Timeout while probing video ${videoPath}`)
    }
    throw new Error(`Failed to probe video dimensions for ${videoPath}: ${error}`)
  }
}

/**
 * Factory class for creating background instances (maintains same public API)
 */
export class Background {
  /**
   * Create a solid color background
   */
  static fromColor(hexColor: string, width: number, height: number, fps: number): ColorBackground {
    // Validate color format (basic validation)
    if (!hexColor.match(/^#[0-9A-Fa-f]{6}$/)) {
      throw new Error('Color must be in hex format (#RRGGBB)')
    }
    return new ColorBackground(hexColor, width, height, fps)
  }

  /**
   * Create a background from an image with automatic dimension detection
   */
  static fromImage(pathOrUrl: string, fps = 30.0, ctx?: MediaContext): ImageBackground {
    const context = ctx || defaultContext()
    let source = pathOrUrl

    // Check if source is a URL (starts with http:// or https://)
    const isUrl = source.startsWith('http://') || source.startsWith('https://')

    if (isUrl) {
      // Download to temporary local file first (fixes slow FFmpeg -loop with URLs)
      context.logger.info('Image background is a URL, downloading to local temp file...')
      source = _downloadImageToTemp(source, context)
      context.logger.info(`Using local image file: ${source}`)
    }

    // Auto-detect dimensions from image
    const [width, height] = _probeImageDimensions(source, context)

    return new ImageBackground(source, width, height, fps)
  }

  /**
   * Create a background from a video with automatic dimension detection
   */
  static fromVideo(pathOrUrl: string, ctx?: MediaContext): VideoBackground {
    const context = ctx || defaultContext()

    // Auto-detect dimensions from video
    const [width, height, fps] = _probeVideoDimensions(pathOrUrl, context)

    // Create video background with actual dimensions
    const bg = new VideoBackground(
      pathOrUrl,
      width,
      height,
      fps,
      true // Enable audio by default for video backgrounds
    )

    // Probe and store full video format information for decoder support
    const videoSource = new VideoSource()
    videoSource.probeAndStore(pathOrUrl, context)
    const videoInfo = videoSource.getVideoInfo()
    if (videoInfo) {
      bg._setVideoInfo(videoInfo)
    }

    return bg
  }

  /**
   * Create an empty/transparent background
   */
  static empty(width: number, height: number, fps: number): EmptyBackground {
    return new EmptyBackground(width, height, fps)
  }
}
