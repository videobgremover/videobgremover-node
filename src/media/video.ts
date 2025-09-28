/**
 * Video class for loading and processing videos
 * (from Python media/video.py)
 */

import { VideoBGRemoverClient } from '../client'
import { RemoveBGOptions, StatusCallback } from '../types'
import { Foreground } from './foreground'
import { MediaContext, defaultContext } from './context'

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
  async removeBackground(
    client: VideoBGRemoverClient,
    options: RemoveBGOptions = new RemoveBGOptions(),
    waitPollSeconds = 2.0,
    onStatus?: StatusCallback,
    ctx?: MediaContext
  ): Promise<Foreground> {
    // Import here to avoid circular imports
    const { Importer } = await import('./_importer_internal')

    const context = ctx || defaultContext()
    const importer = new Importer(context)

    return importer.removeBackground(this, client, options, waitPollSeconds, onStatus)
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
