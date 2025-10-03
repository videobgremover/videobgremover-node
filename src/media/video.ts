/**
 * Video class for loading and processing videos
 * (from Python media/video.py)
 */

import { VideoBGRemoverClient } from '../client'
import { RemoveBGOptions, StatusCallback } from '../types'
import { Foreground } from './foreground'
import { MediaContext, defaultContext } from './context'
import { RemoveBGOptions as BGRemoveOptions } from './remove_bg'

/**
 * Options for background removal processing
 */
export interface RemoveBackgroundOptions {
  client: VideoBGRemoverClient
  options?: BGRemoveOptions
  waitPollSeconds?: number
  onStatus?: StatusCallback
  ctx?: MediaContext
  webhookUrl?: string
}

/**
 * Video representation that can be loaded from file or URL
 */
export class Video {
  private constructor(
    public readonly kind: 'file' | 'url',
    public readonly src: string
  ) {}

  /**
   * Open a video from file path or URL
   */
  static open(src: string): Video {
    // Determine if it's a URL or file path
    const kind = src.startsWith('http://') || src.startsWith('https://') ? 'url' : 'file'
    return new Video(kind, src)
  }

  /**
   * Remove background from this video
   */
  async removeBackground(opts: RemoveBackgroundOptions): Promise<Foreground> {
    const {
      client,
      options = new RemoveBGOptions(),
      waitPollSeconds = 2.0,
      onStatus,
      ctx,
      webhookUrl,
    } = opts

    // Import here to avoid circular imports
    const { Importer } = await import('./_importer_internal')

    const context = ctx || defaultContext()
    const importer = new Importer(context)

    return importer.removeBackground(this, client, options, waitPollSeconds, onStatus, webhookUrl)
  }

  /**
   * Get video information (placeholder for future implementation)
   */
  async getInfo(): Promise<{
    duration: number
    width: number
    height: number
    fps: number
  }> {
    // TODO: Implement using ffprobe
    throw new Error('Video info extraction not yet implemented')
  }
}
