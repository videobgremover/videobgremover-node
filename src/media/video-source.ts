/**
 * VideoSource base class for video probing and metadata extraction
 * (from Python media/video_source.py)
 */

import { execSync } from 'child_process'
import { MediaContext } from './context'

/**
 * Video information from ffprobe
 */
export interface VideoInfo {
  codec_name: string
  codec_type?: string
  pix_fmt?: string
  width?: number
  height?: number
  duration?: string | number
  source_type: 'file' | 'url'
  original_source: string
  streams?: Array<{
    width?: number
    height?: number
    r_frame_rate?: string
    rotation?: number
    codec_type?: string
  }>
}

/**
 * Base class for video sources with probing capabilities
 */
export class VideoSource {
  protected _videoInfo?: VideoInfo

  /**
   * Probe video info and store (like Python VideoSource._probe_and_store)
   */
  public probeAndStore(path: string, ctx: MediaContext): void {
    try {
      this._videoInfo = this._probeVideoInfo(path, ctx)
    } catch (error) {
      // If probing fails, videoInfo remains undefined (like Python fallback)
      console.warn(`Failed to probe video info for ${path}: ${error}`)
      this._videoInfo = this._fallbackInfo(path)
    }
  }

  /**
   * Probe video info using ffprobe (like Python VideoSource._probe_video_info)
   */
  protected _probeVideoInfo(path: string, ctx: MediaContext): VideoInfo {
    try {
      const cmd = [
        ctx.ffprobe || 'ffprobe',
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_entries',
        'stream=codec_name,codec_type,pix_fmt,width,height,duration:format=duration',
        '-probesize',
        '1M',
        '-analyzeduration',
        '5M',
        path,
      ]

      const result = execSync(cmd.join(' '), { encoding: 'utf-8', timeout: 15000 })
      const data = JSON.parse(result) as {
        streams?: Array<{
          width?: number
          height?: number
          r_frame_rate?: string
          codec_name?: string
          codec_type?: string
          pix_fmt?: string
          duration?: string | number
        }>
        format?: { duration?: string }
      }

      if (!data.streams) {
        return this._fallbackInfo(path)
      }

      // Find first video stream
      const videoStream = data.streams.find(stream => stream.codec_type === 'video')
      if (!videoStream) {
        return this._fallbackInfo(path)
      }

      // Try to get duration from stream first, then format (like Python)
      let duration = videoStream.duration
      if (!duration && data.format) {
        duration = data.format.duration
      }

      return {
        codec_name: videoStream.codec_name || 'unknown',
        codec_type: videoStream.codec_type,
        pix_fmt: videoStream.pix_fmt,
        width: videoStream.width,
        height: videoStream.height,
        duration: duration,
        source_type: this._detectSourceType(path),
        original_source: path,
        streams: data.streams,
      }
    } catch (error) {
      return this._fallbackInfo(path)
    }
  }

  /**
   * Fallback info when probing fails (like Python)
   */
  protected _fallbackInfo(path: string): VideoInfo {
    return {
      codec_name: 'unknown',
      pix_fmt: 'unknown',
      source_type: this._detectSourceType(path),
      original_source: path,
    }
  }

  /**
   * Detect source type (file vs URL)
   */
  protected _detectSourceType(path: string): 'file' | 'url' {
    return path.startsWith('http://') || path.startsWith('https://') ? 'url' : 'file'
  }

  /**
   * Get video duration from probed info (EXACT match to Python)
   */
  getDuration(): number | undefined {
    if (this._videoInfo && this._videoInfo.duration) {
      const duration =
        typeof this._videoInfo.duration === 'string'
          ? parseFloat(this._videoInfo.duration)
          : this._videoInfo.duration
      return isNaN(duration) ? undefined : duration
    }
    return undefined
  }

  /**
   * Get video dimensions if available
   */
  getDimensions(): { width?: number; height?: number } {
    const result: { width?: number; height?: number } = {}
    if (this._videoInfo?.width !== undefined) {
      result.width = this._videoInfo.width
    }
    if (this._videoInfo?.height !== undefined) {
      result.height = this._videoInfo.height
    }
    return result
  }

  /**
   * Get format information
   */
  getFormat(): string | undefined {
    return this._videoInfo?.pix_fmt
  }

  /**
   * Get decoder arguments for this video format
   */
  getDecoderArgs(ctx: MediaContext): string[] {
    if (!this._videoInfo) {
      return []
    }

    // WebM VP9 specific decoder (like Python)
    if (this._videoInfo.codec_name === 'vp9' && ctx.checkWebmSupport && ctx.checkWebmSupport()) {
      return ['-c:v', 'libvpx-vp9']
    }

    return []
  }

  /**
   * Check if this video source has audio streams
   */
  hasAudioStreams(): boolean {
    if (this._videoInfo && this._videoInfo.streams) {
      return this._videoInfo.streams.some(stream => stream.codec_type === 'audio')
    }
    return false
  }

  /**
   * Set video info (for external use)
   */
  setVideoInfo(videoInfo: VideoInfo): void {
    this._videoInfo = videoInfo
  }

  /**
   * Get video info (for external use)
   */
  getVideoInfo(): VideoInfo | undefined {
    return this._videoInfo
  }
}
