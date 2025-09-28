/**
 * Foreground class representing a transparent video
 * (from Python media/foregrounds.py)
 */

import { TransparentFormat } from '../types'
import { VideoSource } from './video-source'
import { MediaContext, defaultContext } from './context'
import { Importer } from './_importer_internal'

/**
 * Represents a transparent video (foreground) after background removal
 */
export class Foreground extends VideoSource {
  public readonly format: TransparentFormat
  public readonly primaryPath: string
  public readonly maskPath?: string
  public readonly audioPath?: string
  public readonly sourceTrim?: [number, number?] // (start, end) for trimming

  constructor(
    format: TransparentFormat,
    primaryPath: string,
    options: {
      maskPath?: string
      audioPath?: string
      sourceTrim?: [number, number?]
    } = {}
  ) {
    super()
    this.format = format
    this.primaryPath = primaryPath
    this.maskPath = options.maskPath
    this.audioPath = options.audioPath
    this.sourceTrim = options.sourceTrim
  }

  /**
   * Create foreground from WebM VP9 video file with alpha channel
   */
  static fromWebmVp9(path: string, ctx?: MediaContext): Foreground {
    const context = ctx || defaultContext()
    const fg = new Foreground('webm_vp9', path)
    fg.probeAndStore(path, context)
    return fg
  }

  /**
   * Create foreground from MOV ProRes video file with alpha channel
   */
  static fromMovProres(path: string, ctx?: MediaContext): Foreground {
    const context = ctx || defaultContext()
    const fg = new Foreground('mov_prores', path)
    fg.probeAndStore(path, context)
    return fg
  }

  /**
   * Create foreground from PNG sequence ZIP file
   */
  static fromPngSequence(path: string): Foreground {
    const fg = new Foreground('png_sequence', path)
    // PNG sequences don't need video probing since they're image sequences
    return fg
  }

  /**
   * Create foreground from separate RGB video and mask files
   */
  static fromVideoAndMask(
    videoPath: string,
    maskPath: string,
    audioPath?: string,
    ctx?: MediaContext
  ): Foreground {
    const context = ctx || defaultContext()
    const fg = new Foreground('pro_bundle', videoPath, { maskPath, audioPath })
    fg.probeAndStore(videoPath, context) // Probe the RGB video
    return fg
  }

  /**
   * Create foreground from stacked video file
   */
  static fromStackedVideo(path: string, ctx?: MediaContext): Foreground {
    const context = ctx || defaultContext()
    const fg = new Foreground('stacked_video', path)
    fg.probeAndStore(path, context)
    return fg
  }

  /**
   * Create foreground from pro bundle ZIP file (from API)
   */
  static fromProBundleZip(path: string): Foreground {
    // Let the importer handle the ZIP extraction (like Python)

    const importer = new Importer(defaultContext())
    return importer._handleZipBundle(path)
  }

  /**
   * Create foreground from any video file with automatic format detection
   */
  static fromFile(path: string, ctx?: MediaContext): Foreground {
    const context = ctx || defaultContext()
    const extension = Foreground._getFileExtension(path)

    if (extension === '.webm') {
      return Foreground.fromWebmVp9(path, context)
    } else if (extension === '.mov') {
      return Foreground.fromMovProres(path, context)
    } else if (extension === '.zip') {
      return Foreground.fromProBundleZip(path)
    } else if (extension === '.mp4') {
      return Foreground.fromStackedVideo(path, context)
    } else {
      throw new Error(
        `Unknown video format for file: ${path}\n` +
          `Detected extension: ${extension || 'none'}\n` +
          `Supported formats:\n` +
          `  - .webm → use Foreground.fromWebmVp9()\n` +
          `  - .mov  → use Foreground.fromMovProres()\n` +
          `  - .mp4  → use Foreground.fromStackedVideo()\n` +
          `  - .zip  → use Foreground.fromProBundleZip()\n` +
          `Or use specific format methods if you know the exact format.`
      )
    }
  }

  /**
   * Create foreground from URL with automatic format detection and probing
   */
  static fromUrl(
    url: string,
    metadata: { format?: TransparentFormat } = {},
    ctx?: MediaContext
  ): Foreground {
    const context = ctx || defaultContext()
    const format = metadata.format || 'webm_vp9'

    // Auto-detect if this is a ZIP file that needs extraction (like Python)
    if (format === 'pro_bundle' || url.endsWith('.zip')) {
      return Foreground.fromProBundleZip(url) // Delegate to ZIP handler
    }

    // Regular single-file formats - create foreground and probe video info
    const fg = new Foreground(format, url)
    fg.probeAndStore(url, context)
    return fg
  }

  /**
   * Create a new Foreground with source trimming
   */
  subclip(start: number, end?: number): Foreground {
    return new Foreground(this.format, this.primaryPath, {
      maskPath: this.maskPath,
      audioPath: this.audioPath,
      sourceTrim: [start, end],
    })
  }

  /**
   * Extract file extension from path or URL using proper parsing
   */
  private static _getFileExtension(path: string): string {
    try {
      if (path.startsWith('http://') || path.startsWith('https://')) {
        // It's a URL - extract path component
        const url = new URL(path)
        const pathname = url.pathname
        return pathname.substring(pathname.lastIndexOf('.')).toLowerCase()
      } else {
        // It's a file path
        return path.substring(path.lastIndexOf('.')).toLowerCase()
      }
    } catch {
      // Fallback to basic string parsing
      const pathLower = path.toLowerCase()
      if (pathLower.includes('.')) {
        return '.' + pathLower.split('.').pop()!
      }
      return ''
    }
  }

  /**
   * Get FFmpeg input arguments for this foreground format
   */
  getFFmpegInputs(
    inputIdx: number,
    layerIdx: number,
    ctx: MediaContext,
    sourceTrimArgs: string[],
    compositionTimingArgs: string[]
  ): [string[], Record<string, number>, string | null] {
    if (this.format === 'webm_vp9') {
      return this._getWebmInputs(inputIdx, layerIdx, ctx, sourceTrimArgs, compositionTimingArgs)
    } else if (this.format === 'mov_prores') {
      return this._getMovInputs(inputIdx, layerIdx, ctx, sourceTrimArgs, compositionTimingArgs)
    } else if (this.format === 'pro_bundle') {
      return this._getBundleInputs(inputIdx, layerIdx, ctx, sourceTrimArgs, compositionTimingArgs)
    } else if (this.format === 'stacked_video') {
      return this._getStackedInputs(inputIdx, layerIdx, ctx, sourceTrimArgs, compositionTimingArgs)
    } else {
      throw new Error(`Unknown foreground format: ${this.format}`)
    }
  }

  /**
   * Get FFmpeg filters to process this foreground into RGBA format
   */
  getFFmpegFilters(
    layerLabel: string,
    inputMap: Record<string, number>,
    alphaEnabled = true
  ): string[] {
    if (this.format === 'webm_vp9') {
      return this._getWebmFilters(layerLabel, inputMap, alphaEnabled)
    } else if (this.format === 'mov_prores') {
      return this._getMovFilters(layerLabel, inputMap, alphaEnabled)
    } else if (this.format === 'pro_bundle') {
      return this._getBundleFilters(layerLabel, inputMap, alphaEnabled)
    } else if (this.format === 'stacked_video') {
      return this._getStackedFilters(layerLabel, inputMap, alphaEnabled)
    } else {
      throw new Error(`Unknown foreground format: ${this.format}`)
    }
  }

  /**
   * Get the current input label after all format-specific processing
   */
  getCurrentInputLabel(layerLabel: string, alphaEnabled = true): string {
    if (this.format === 'webm_vp9') {
      if (alphaEnabled) {
        // WebM VP9 uses the direct input when alpha is enabled
        const inputKey = `layer_${layerLabel.split('_')[1]}` // Extract layer index
        return `[${inputKey}:v]`
      } else {
        // When alpha is disabled, use the merged output
        return `[${layerLabel}_merged]`
      }
    } else if (this.format === 'mov_prores') {
      if (alphaEnabled) {
        // MOV ProRes uses the direct input when alpha is enabled
        const inputKey = `layer_${layerLabel.split('_')[1]}` // Extract layer index
        return `[${inputKey}:v]`
      } else {
        // When alpha is disabled, use the merged output
        return `[${layerLabel}_merged]`
      }
    } else if (this.format === 'pro_bundle' || this.format === 'stacked_video') {
      // Bundle and stacked formats always use the merged output
      return `[${layerLabel}_merged]`
    } else {
      throw new Error(`Unknown foreground format: ${this.format}`)
    }
  }

  // Format-specific input methods
  private _getWebmInputs(
    inputIdx: number,
    layerIdx: number,
    ctx: MediaContext,
    sourceTrimArgs: string[],
    compositionTimingArgs: string[]
  ): [string[], Record<string, number>, string | null] {
    const args: string[] = []
    args.push(...compositionTimingArgs)

    // Use libvpx-vp9 decoder to preserve alpha channels if available
    if (ctx.checkWebmSupport()) {
      args.push('-c:v', 'libvpx-vp9')
      args.push(...sourceTrimArgs)
      args.push('-i', this.primaryPath)
      ctx.logger.debug(`Using libvpx-vp9 decoder for WebM: ${this.primaryPath}`)
    } else {
      // Use default decoder
      args.push(...sourceTrimArgs)
      args.push('-i', this.primaryPath)
    }

    const layerKey = `layer_${layerIdx}`
    const inputMapUpdates = { [layerKey]: inputIdx }
    const audioInputKey = layerKey // Same input for both video and audio

    return [args, inputMapUpdates, audioInputKey]
  }

  private _getMovInputs(
    inputIdx: number,
    layerIdx: number,
    ctx: MediaContext,
    sourceTrimArgs: string[],
    compositionTimingArgs: string[]
  ): [string[], Record<string, number>, string | null] {
    const args: string[] = []
    args.push(...compositionTimingArgs)

    // MOV ProRes uses default decoder (no special decoder needed)
    args.push(...sourceTrimArgs)
    args.push('-i', this.primaryPath)

    const layerKey = `layer_${layerIdx}`
    const inputMapUpdates = { [layerKey]: inputIdx }
    const audioInputKey = layerKey // Same input for both video and audio

    return [args, inputMapUpdates, audioInputKey]
  }

  private _getBundleInputs(
    inputIdx: number,
    layerIdx: number,
    ctx: MediaContext,
    sourceTrimArgs: string[],
    compositionTimingArgs: string[]
  ): [string[], Record<string, number>, string | null] {
    if (!this.maskPath) {
      throw new Error('maskPath is required for pro_bundle format')
    }

    const rgbArgs: string[] = []
    const maskArgs: string[] = []

    // Add composition timing to both RGB and mask
    rgbArgs.push(...compositionTimingArgs)
    maskArgs.push(...compositionTimingArgs)

    if (
      this.primaryPath &&
      Foreground._getFileExtension(this.primaryPath) === '.webm' &&
      ctx.checkWebmSupport()
    ) {
      rgbArgs.push('-c:v', 'libvpx-vp9')
      rgbArgs.push(...sourceTrimArgs)
      rgbArgs.push('-i', this.primaryPath)
      maskArgs.push(...sourceTrimArgs)
      maskArgs.push('-i', this.maskPath)
      ctx.logger.debug(`Using libvpx-vp9 decoder for WebM RGB: ${this.primaryPath}`)
    } else {
      rgbArgs.push(...sourceTrimArgs)
      rgbArgs.push('-i', this.primaryPath)
      maskArgs.push(...sourceTrimArgs)
      maskArgs.push('-i', this.maskPath)
    }

    const args = [...rgbArgs, ...maskArgs]
    const inputMapUpdates = {
      [`layer_${layerIdx}_rgb`]: inputIdx,
      [`layer_${layerIdx}_mask`]: inputIdx + 1,
    }

    // Add separate audio file if present
    let audioInputKey: string | null
    if (this.audioPath) {
      const audioArgs: string[] = []
      audioArgs.push(...compositionTimingArgs)
      audioArgs.push(...sourceTrimArgs)
      audioArgs.push('-i', this.audioPath)
      args.push(...audioArgs)
      const audioKey = `layer_${layerIdx}_audio`
      inputMapUpdates[audioKey] = inputIdx + 2
      audioInputKey = audioKey // Use separate audio file
    } else {
      audioInputKey = `layer_${layerIdx}_rgb` // Fallback to RGB input
    }

    return [args, inputMapUpdates, audioInputKey]
  }

  private _getStackedInputs(
    inputIdx: number,
    layerIdx: number,
    ctx: MediaContext,
    sourceTrimArgs: string[],
    compositionTimingArgs: string[]
  ): [string[], Record<string, number>, string | null] {
    const args: string[] = []
    args.push(...compositionTimingArgs)
    args.push(...sourceTrimArgs)
    args.push('-i', this.primaryPath)

    const layerKey = `layer_${layerIdx}_stacked`
    const inputMapUpdates = { [layerKey]: inputIdx }
    const audioInputKey = layerKey // Same input for both video and audio

    return [args, inputMapUpdates, audioInputKey]
  }

  // Format-specific filter methods
  private _getWebmFilters(
    layerLabel: string,
    inputMap: Record<string, number>,
    alphaEnabled = true
  ): string[] {
    if (!alphaEnabled) {
      // Convert RGBA to RGB to remove alpha channel
      const inputKey = `layer_${layerLabel.split('_')[1]}` // Extract layer index from label
      return [`[${inputMap[inputKey]}:v]format=rgb24[${layerLabel}_merged]`]
    }
    // WebM VP9 with alpha is already in the right format, no filters needed
    return []
  }

  private _getMovFilters(
    layerLabel: string,
    inputMap: Record<string, number>,
    alphaEnabled = true
  ): string[] {
    if (!alphaEnabled) {
      // Convert RGBA to RGB to remove alpha channel
      const inputKey = `layer_${layerLabel.split('_')[1]}` // Extract layer index from label
      return [`[${inputMap[inputKey]}:v]format=rgb24[${layerLabel}_merged]`]
    }
    // MOV ProRes with alpha is already in the right format, no filters needed
    return []
  }

  private _getBundleFilters(
    layerLabel: string,
    inputMap: Record<string, number>,
    alphaEnabled = true
  ): string[] {
    const filters: string[] = []
    const rgbInput = `[${inputMap[`${layerLabel}_rgb`]}:v]`

    if (alphaEnabled) {
      // Full alpha processing with mask
      const maskInput = `[${inputMap[`${layerLabel}_mask`]}:v]`

      // Create the alphamerge filter chain with proper labels and binary mask conversion
      filters.push(`${rgbInput}format=rgba[${layerLabel}_rgba]`)
      filters.push(`${maskInput}format=gray[${layerLabel}_mask_gray]`)
      // Convert mask to binary (0 or 255) - same as stacked processing
      filters.push(
        `[${layerLabel}_mask_gray]geq='if(gte(lum(X,Y),128),255,0)'[${layerLabel}_binary_mask]`
      )
      filters.push(
        `[${layerLabel}_rgba][${layerLabel}_binary_mask]alphamerge[${layerLabel}_merged]`
      )
    } else {
      // No alpha - just use RGB directly
      filters.push(`${rgbInput}format=rgb24[${layerLabel}_merged]`)
    }

    return filters
  }

  private _getStackedFilters(
    layerLabel: string,
    inputMap: Record<string, number>,
    alphaEnabled = true
  ): string[] {
    const filters: string[] = []
    const stackedInput = `[${inputMap[`${layerLabel}_stacked`]}:v]`

    // Always extract top half (original video)
    filters.push(`${stackedInput}crop=iw:ih/2:0:0[${layerLabel}_top]`)

    if (alphaEnabled) {
      // Full alpha processing with mask
      filters.push(`[${layerLabel}_top]format=rgba[${layerLabel}_top_rgba]`)

      // Extract bottom half (mask), convert to grayscale, and make binary
      filters.push(`${stackedInput}crop=iw:ih/2:0:ih/2[${layerLabel}_bottom]`)
      filters.push(`[${layerLabel}_bottom]format=gray[${layerLabel}_mask_gray]`)
      filters.push(
        `[${layerLabel}_mask_gray]geq='if(gte(lum(X,Y),128),255,0)'[${layerLabel}_binary_mask]`
      )

      // Apply mask as alpha channel using alphamerge
      filters.push(
        `[${layerLabel}_top_rgba][${layerLabel}_binary_mask]alphamerge[${layerLabel}_merged]`
      )
    } else {
      // No alpha - just use RGB from top half directly
      filters.push(`[${layerLabel}_top]format=rgb24[${layerLabel}_merged]`)
    }

    return filters
  }

  // Compatibility methods
  getSource(): string {
    return this.primaryPath
  }

  override getFormat(): TransparentFormat {
    return this.format
  }

  get src(): string {
    return this.primaryPath
  }

  isUrl(): boolean {
    return this.primaryPath.startsWith('http://') || this.primaryPath.startsWith('https://')
  }
}
