/**
 * Internal importer for API orchestration and format handling
 * (Complete port from Python media/_importer_internal.py)
 *
 * This module is internal and should not be used directly by SDK users.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execSync } from 'child_process'
import axios from 'axios'
import AdmZip from 'adm-zip'
import { Video } from './video'
import { Foreground } from './foreground'
import { VideoBGRemoverClient, StartJobRequest, JobStatus } from '../client'
import { RemoveBGOptions, Prefer } from '../types'
import { MediaContext } from './context'

/**
 * Internal importer for handling API operations (matches Python Importer)
 */
export class Importer {
  constructor(private readonly ctx: MediaContext) {}

  /**
   * Remove background from video using the API (matches Python remove_background)
   */
  async removeBackground(
    video: Video,
    client: VideoBGRemoverClient,
    options: RemoveBGOptions,
    waitPollSeconds: number,
    onStatus?: (status: string) => void
  ): Promise<Foreground> {
    // Choose transparent format
    const transparentFormat = this._chooseFormat(options)
    this.ctx.logger.info(`Using transparent format: ${transparentFormat}`)

    // Create job
    const jobId = await this._createJob(video, client)
    this.ctx.logger.info(`Created job: ${jobId}`)

    // Start job with transparent background
    const startRequest: StartJobRequest = {
      background: {
        type: 'transparent',
        transparent_format: transparentFormat as
          | 'webm_vp9'
          | 'mov_prores'
          | 'png_sequence'
          | 'pro_bundle'
          | 'stacked_video',
      },
    }

    await client.startJob(jobId, startRequest)
    this.ctx.logger.info('Job started, waiting for completion...')

    // Wait for completion
    const status = await client.wait(jobId, {
      pollSeconds: waitPollSeconds,
      onStatus,
    })

    if (status.status !== 'completed') {
      throw new Error(status.message || 'Background removal failed')
    }

    this.ctx.logger.info('Job completed, downloading result...')

    // Convert API response to Foreground
    return this._fromEndpoint(status)
  }

  /**
   * Choose the best transparent format based on options and system capabilities
   */
  private _chooseFormat(options: RemoveBGOptions): string {
    if (options.prefer && options.prefer !== Prefer.AUTO) {
      return options.prefer
    }

    // Auto-detect best format
    try {
      // Check for VP9 encoder and yuva420p pixel format support

      const encResult = execSync(`${this.ctx.ffmpeg} -hide_banner -encoders`, {
        encoding: 'utf-8',
        timeout: 10000,
      })

      const pixResult = execSync(`${this.ctx.ffmpeg} -hide_banner -pix_fmts`, {
        encoding: 'utf-8',
        timeout: 10000,
      })

      if (encResult.includes('libvpx-vp9') && pixResult.includes('yuva420p')) {
        this.ctx.logger.debug('WebM VP9 support detected')
        return 'webm_vp9'
      }
    } catch (error) {
      this.ctx.logger.warn(`Error checking FFmpeg capabilities: ${error}`)
    }

    // Fall back to stacked video (universal compatibility)
    this.ctx.logger.debug('Using stacked video format for universal compatibility')
    return 'stacked_video'
  }

  /**
   * Create a job for the video (matches Python _create_job)
   */
  private async _createJob(video: Video, client: VideoBGRemoverClient): Promise<string> {
    if (video.kind === 'url' && (await this._publicUrlOk(video.src))) {
      // Use URL download
      const response = await client.createJobUrl({
        video_url: video.src,
      })
      return response.id
    } else {
      // Use file upload
      let contentType: 'video/mp4' | 'video/mov' | 'video/webm' = 'video/mp4'

      // Guess content type from extension
      const ext = path.extname(video.src).toLowerCase()
      if (ext === '.mov') {
        contentType = 'video/mov'
      } else if (ext === '.webm') {
        contentType = 'video/webm'
      }

      // Extract filename from URL or file path
      let filename: string
      if (video.kind === 'url') {
        try {
          const url = new URL(video.src)
          filename = path.basename(url.pathname) || 'video.mp4'
        } catch {
          filename = 'video.mp4' // Fallback
        }
      } else {
        filename = path.basename(video.src)
      }

      // Create upload job
      const response = await client.createJobFile({
        filename,
        content_type: contentType,
      })

      // Upload file to signed URL
      await this._signedPut(response.upload_url, video.src, contentType)

      return response.id
    }
  }

  /**
   * Check if URL is publicly accessible and within size limits (matches Python _public_url_ok)
   */
  private async _publicUrlOk(url: string): Promise<boolean> {
    try {
      const response = await axios.head(url, {
        timeout: 5000,
        maxRedirects: 5,
      })

      if (![200, 204].includes(response.status)) {
        return false
      }

      // Check content length (1GB limit)
      const contentLength = response.headers['content-length']
      if (contentLength) {
        const size = parseInt(contentLength)
        if (size > 1_000_000_000) {
          // 1GB
          return false
        }
      }

      return true
    } catch (error) {
      this.ctx.logger.debug(`URL check failed for ${url}: ${error}`)
      return false
    }
  }

  /**
   * Upload file to signed URL (matches Python _signed_put)
   */
  private async _signedPut(url: string, filePath: string, contentType: string): Promise<void> {
    try {
      const fileData = fs.readFileSync(filePath)

      await axios.put(url, fileData, {
        headers: {
          'Content-Type': contentType,
        },
        timeout: 300000, // 5 minute timeout for uploads
      })
    } catch (error) {
      throw new Error(`Failed to upload file: ${error}`)
    }
  }

  /**
   * Download processed video from API response and create Foreground (matches Python _from_endpoint)
   */
  private async _fromEndpoint(status: JobStatus): Promise<Foreground> {
    if (!status.processed_video_url) {
      throw new Error('No processed video URL in job status')
    }

    // Determine file extension from URL
    const urlStr = status.processed_video_url
    const suffix = this._getFileExtensionFromUrl(urlStr)

    // Download the processed video
    const videoPath = await this._downloadFile(urlStr, this._tempPath(suffix))

    // Handle ZIP files (pro bundle with multiple formats)
    if (videoPath.endsWith('.zip')) {
      return this._handleZipBundle(videoPath)
    }

    // For all other formats, use simple file detection
    return Foreground.fromFile(videoPath)
  }

  /**
   * Download file from URL to local path (matches Python _download_file)
   */
  private async _downloadFile(url: string, localPath: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        responseType: 'stream',
        timeout: 300000, // 5 minute timeout
      })

      const writer = fs.createWriteStream(localPath)
      response.data.pipe(writer)

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(localPath))
        writer.on('error', reject)
      })
    } catch (error) {
      throw new Error(`Failed to download ${url}: ${error}`)
    }
  }

  /**
   * Get file extension from URL using best practices (matches Python _get_file_extension_from_url)
   */
  private _getFileExtensionFromUrl(urlStr: string): string {
    try {
      // Method 1: Parse URL properly
      const url = new URL(urlStr)
      const extension = path.extname(url.pathname).toLowerCase()

      // Validate it's a known extension
      if (['.mp4', '.mov', '.webm', '.zip'].includes(extension)) {
        return extension
      }
    } catch {
      // Continue to fallback
    }

    try {
      // Fallback: Extract filename from URL path only
      const urlBase = urlStr.split('?')[0] // Remove query parameters
      if (urlBase) {
        const filename = urlBase.split('/').pop() || '' // Get filename only

        if (filename.includes('.')) {
          const extension = '.' + filename.split('.').pop()!.toLowerCase()
          if (['.mp4', '.mov', '.webm', '.zip'].includes(extension)) {
            return extension
          }
        }
      }
    } catch {
      // Continue to ultimate fallback
    }

    // Ultimate fallback for stacked video format
    return '.mp4'
  }

  /**
   * Generate temporary file path (matches Python MediaContext.temp_path)
   */
  private _tempPath(suffix = '', prefix = 'vbr_'): string {
    const tempDir = this.ctx.tmp || os.tmpdir()
    const filename = `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}${suffix}`
    return path.join(tempDir, filename)
  }

  /**
   * Handle Pro Bundle ZIP containing color.mp4, alpha.mp4, audio.m4a (matches Python _handle_zip_bundle)
   */
  _handleZipBundle(zipPath: string): Foreground {
    try {
      // Create extraction directory
      const extractDir = fs.mkdtempSync(path.join(this.ctx.tmp, 'pro_bundle_'))

      // Extract ZIP contents
      const zip = new AdmZip(zipPath)
      zip.extractAllTo(extractDir, true)

      this.ctx.logger.info(`Extracted pro bundle to ${extractDir}`)

      // Look for the expected pro bundle files
      const colorPath = path.join(extractDir, 'color.mp4')
      const alphaPath = path.join(extractDir, 'alpha.mp4')
      const audioPath = path.join(extractDir, 'audio.m4a')

      if (!fs.existsSync(colorPath)) {
        throw new Error('color.mp4 not found in pro bundle')
      }

      if (!fs.existsSync(alphaPath)) {
        throw new Error('alpha.mp4 not found in pro bundle')
      }

      // Check for audio file (optional)
      if (fs.existsSync(audioPath)) {
        this.ctx.logger.info('Found color.mp4, alpha.mp4, and audio.m4a in pro bundle')
        return Foreground.fromVideoAndMask(colorPath, alphaPath, audioPath)
      } else {
        this.ctx.logger.info('Found color.mp4 and alpha.mp4 in pro bundle (no audio)')
        return Foreground.fromVideoAndMask(colorPath, alphaPath)
      }
    } catch (error) {
      throw new Error(`Failed to extract pro bundle ZIP: ${error}`)
    }
  }

  /**
   * Check if video is in stacked format (matches Python _is_stacked_video)
   */
  private _isStackedVideo(videoPath: string): boolean {
    try {
      const cmd = [
        this.ctx.ffprobe,
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_streams',
        '-select_streams',
        'v:0',
        videoPath,
      ]

      const result = execSync(cmd.join(' '), {
        encoding: 'utf-8',
        timeout: 30000,
      })

      const data = JSON.parse(result)

      if (!data.streams || data.streams.length === 0) {
        return false
      }

      const stream = data.streams[0]
      const width = parseInt(stream.width || '0')
      const height = parseInt(stream.height || '0')

      // Stacked video should have height roughly double the width
      if (width > 0 && height > 0) {
        const aspectRatio = height / width
        return aspectRatio >= 1.8 && aspectRatio <= 2.2 // Allow some tolerance
      }

      return false
    } catch (error) {
      this.ctx.logger.warn(`Error checking if video is stacked: ${error}`)
      return false
    }
  }
}
