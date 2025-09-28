/**
 * Composition class for multi-layer video composition
 * (from Python media/composition.py)
 */

import { BaseBackground, EmptyBackground } from './backgrounds'
import { Foreground } from './foreground'
import { EncoderProfile } from './encoders'
import { MediaContext, defaultContext } from './context'
import { Anchor, SizeMode, LayerHandle as ILayerHandle, LayerDict, AudioInput } from '../types'

/**
 * Layer handle for fluent API (matches Python LayerHandle)
 */
class LayerHandle implements ILayerHandle {
  constructor(
    private readonly comp: Composition,
    private readonly idx: number
  ) {}

  // Position/Size methods
  at(anchor: Anchor = Anchor.CENTER, dx = 0, dy = 0): LayerHandle {
    const layer = this.comp._layers[this.idx]
    if (layer) {
      layer.anchor = anchor
      layer.dx = dx
      layer.dy = dy
    }
    return this
  }

  xy(xExpr: string, yExpr: string): LayerHandle {
    const layer = this.comp._layers[this.idx]
    if (layer) {
      layer.x_expr = xExpr
      layer.y_expr = yExpr
    }
    return this
  }

  size(
    mode: SizeMode,
    options: {
      width?: number
      height?: number
      percent?: number
      scale?: number
    } = {}
  ): LayerHandle {
    const layer = this.comp._layers[this.idx]
    if (layer) {
      layer.size = [mode, options.width, options.height, options.percent, options.scale]
    }
    return this
  }

  // Visual effects
  opacity(alpha: number): LayerHandle {
    const layer = this.comp._layers[this.idx]
    if (layer) {
      layer.opacity = Math.max(0.0, Math.min(1.0, alpha))
    }
    return this
  }

  rotate(degrees: number): LayerHandle {
    const layer = this.comp._layers[this.idx]
    if (layer) {
      layer.rotate = degrees
    }
    return this
  }

  crop(x: number, y: number, w: number, h: number): LayerHandle {
    const layer = this.comp._layers[this.idx]
    if (layer) {
      layer.crop = [x, y, w, h]
    }
    return this
  }

  // Timing methods - Composition timing (when to show in final video)
  start(seconds: number): LayerHandle {
    const layer = this.comp._layers[this.idx]
    if (layer) {
      layer.comp_start = seconds
    }
    return this
  }

  end(seconds: number): LayerHandle {
    const layer = this.comp._layers[this.idx]
    if (layer) {
      layer.comp_end = seconds
    }
    return this
  }

  duration(seconds: number): LayerHandle {
    const layer = this.comp._layers[this.idx]
    if (layer) {
      layer.comp_duration = seconds
    }
    return this
  }

  // Source trimming (which part of source video to use)
  subclip(start: number, end?: number): LayerHandle {
    const layer = this.comp._layers[this.idx]
    if (layer) {
      layer.source_trim = [start, end]
    }
    return this
  }

  // Audio control
  audio(enabled = true, volume = 1.0): LayerHandle {
    const layer = this.comp._layers[this.idx]
    if (layer) {
      layer.audio_enabled = enabled
      layer.audio_volume = Math.max(0.0, Math.min(1.0, volume)) // Clamp volume to 0.0-1.0
    }
    return this
  }

  // Z-order
  z(index: number): LayerHandle {
    const layer = this.comp._layers[this.idx]
    if (layer) {
      layer.z = index
    }
    return this
  }

  alpha(enabled = true): LayerHandle {
    const layer = this.comp._layers[this.idx]
    if (layer) {
      layer.alpha_enabled = enabled
    }
    return this
  }
}

/**
 * Multi-layer video composition (matches Python Composition)
 */
export class Composition {
  public readonly ctx: MediaContext
  public readonly _background?: BaseBackground
  public readonly _layers: LayerDict[] = []
  private _canvasHint?: [number, number, number] // [width, height, fps]
  private _explicitDuration?: number // For rule 3: explicit override

  constructor(background?: BaseBackground, ctx?: MediaContext) {
    this.ctx = ctx || defaultContext()
    this._background = background
  }

  // Background/Canvas setup
  background(bg: BaseBackground): Composition {
    // Create new composition with background (immutable pattern)
    return new Composition(bg, this.ctx)
  }

  /**
   * Create composition with explicit canvas size
   */
  static canvas(width: number, height: number, fps: number, ctx?: MediaContext): Composition {
    return new Composition(new EmptyBackground(width, height, fps), ctx)
  }

  setCanvas(width: number, height: number, fps: number): Composition {
    const comp = new Composition(this._background, this.ctx)
    comp._canvasHint = [width, height, fps]
    // Copy existing layers
    comp._layers.push(...this._layers)
    comp._explicitDuration = this._explicitDuration
    return comp
  }

  setDuration(seconds: number): Composition {
    const comp = new Composition(this._background, this.ctx)
    comp._explicitDuration = seconds
    // Copy existing state
    comp._canvasHint = this._canvasHint
    comp._layers.push(...this._layers)
    return comp
  }

  // Layer management
  add(fg: Foreground, name?: string): LayerHandle {
    const layerName = name || `layer${this._layers.length}`

    const layer: LayerDict = {
      name: layerName,
      fg: fg,
      anchor: Anchor.CENTER,
      dx: 0,
      dy: 0,
      x_expr: undefined,
      y_expr: undefined,
      size: [SizeMode.CONTAIN, undefined, undefined, undefined, undefined],
      opacity: 1.0,
      rotate: 0.0,
      crop: undefined,
      // Timing system
      comp_start: undefined, // When to start in composition timeline
      comp_end: undefined, // When to end in composition timeline
      comp_duration: undefined, // How long to show (alternative to comp_end)
      source_trim: undefined, // (start, end) - which part of source to use
      // Audio system (enabled by default for foregrounds)
      audio_enabled: true, // Foreground audio enabled by default
      audio_volume: 1.0, // Full volume by default
      // Alpha transparency system
      alpha_enabled: true, // Alpha channel transparency enabled by default
      z: this._layers.length,
    }

    this._layers.push(layer)
    return new LayerHandle(this, this._layers.length - 1)
  }

  // Export methods
  async toFile(
    outPath: string,
    encoder: EncoderProfile,
    onProgress?: (status: string) => void,
    verbose = false
  ): Promise<void> {
    const argv = this._buildFFmpegArgv(outPath, encoder, false)
    await this._run(argv, onProgress, verbose)
  }

  dryRun(): string {
    const argv = this._buildFFmpegArgv('OUT.mp4', EncoderProfile.h264(), false)
    return argv.join(' ')
  }

  // Internal methods
  private _getCanvasSize(): [number, number, number] {
    // Priority 1: Background dimensions (all background types have these)
    if (
      this._background &&
      this._background.width &&
      this._background.height &&
      this._background.fps
    ) {
      return [this._background.width, this._background.height, this._background.fps]
    }

    // Priority 2: Explicit canvas hint
    if (this._canvasHint) {
      return this._canvasHint
    }

    // Priority 3: Error - cannot determine canvas size
    throw new Error(
      'Cannot determine canvas size. Please provide a background ' +
        '(Background.fromImage/fromVideo/fromColor) or set explicit canvas dimensions ' +
        'using Composition.canvas() or .setCanvas().'
    )
  }

  private _getCompositionDuration(): number | undefined {
    // Rule 3: Explicit override wins
    if (this._explicitDuration !== undefined) {
      return this._explicitDuration
    }

    // Rule 1: Video background controls duration
    if (this._background && this._background.controlsDuration()) {
      if ('getDuration' in this._background) {
        const backgroundWithDuration = this._background as BaseBackground & {
          getDuration(): number | undefined
        }
        const bgDuration = backgroundWithDuration.getDuration()
        if (bgDuration && bgDuration > 0) {
          return bgDuration
        }
      }
    }

    // Rule 2: Longest foreground controls duration
    return this._getLongestForegroundDuration()
  }

  private _getLongestForegroundDuration(): number | undefined {
    let maxDuration = 0.0
    for (const layer of this._layers) {
      const fgDuration = this._getForegroundDuration(layer.fg)
      if (fgDuration && fgDuration > maxDuration) {
        maxDuration = fgDuration
      }
    }
    return maxDuration > 0 ? maxDuration : undefined
  }

  private _getForegroundDuration(fg: Foreground): number | undefined {
    // Use the video info from VideoSource (should already be probed during creation)
    return fg.getDuration()
  }

  private _logDurationInfo(duration: number): void {
    if (this._explicitDuration !== undefined) {
      this.ctx.logger.info(`🎬 Using explicit duration: ${duration.toFixed(1)}s`)
    } else if (this._background && this._background.controlsDuration()) {
      this.ctx.logger.info(`🎬 Using video background duration: ${duration.toFixed(1)}s`)
    } else {
      this.ctx.logger.info(`🎬 Using longest foreground duration: ${duration.toFixed(1)}s`)
    }
  }

  private _buildFFmpegArgv(
    outPath: string,
    encoder: EncoderProfile,
    toPipe: boolean,
    streamFormat?: string
  ): string[] {
    const [canvasWidth, canvasHeight, canvasFps] = this._getCanvasSize()

    const argv = [this.ctx.ffmpeg, '-y'] // Force overwrite existing files

    // Input sources
    const inputMap: Record<string, number> = {} // Map input labels to indices
    let inputIdx = 0

    // Add background (clean approach with separate classes)
    if (this._background) {
      // Each background class handles its own FFmpeg arguments
      const bgArgs = this._background.getFFmpegInputArgs(
        canvasWidth,
        canvasHeight,
        canvasFps,
        this.ctx
      )
      argv.push(...bgArgs)
      inputMap['background'] = inputIdx
      inputIdx += 1
    } else {
      // No background - create transparent
      argv.push(
        '-f',
        'lavfi',
        '-i',
        `color=c=black@0.0:size=${canvasWidth}x${canvasHeight}:rate=${canvasFps}`
      )
      inputMap['background'] = inputIdx
      inputIdx += 1
    }

    // Add layer inputs with timing and collect audio info simultaneously
    const audioInputs: AudioInput[] = []

    for (let i = 0; i < this._layers.length; i++) {
      const layer = this._layers[i]
      if (!layer) continue
      const fg = layer.fg

      // Helper functions for timing arguments
      const getSourceTrimArgs = (): string[] => {
        if (fg.sourceTrim) {
          const [start, end] = fg.sourceTrim
          const args = ['-ss', start.toString()]
          if (end !== undefined && end !== null) {
            args.push('-t', (end - start).toString())
          }
          return args
        }
        return []
      }

      const getCompositionTimingArgs = (): string[] => {
        // Composition timing is now handled in filter graph, not input level
        return []
      }

      // Use Foreground's clean method to get inputs
      const sourceTrimArgs = getSourceTrimArgs()
      const compositionTimingArgs = getCompositionTimingArgs()

      const [ffmpegArgs, inputMapUpdates, audioInputKey] = fg.getFFmpegInputs(
        inputIdx,
        i,
        this.ctx,
        sourceTrimArgs,
        compositionTimingArgs
      )

      // Add the FFmpeg arguments
      argv.push(...ffmpegArgs)

      // Update input map
      Object.assign(inputMap, inputMapUpdates)
      inputIdx = Math.max(...Object.values(inputMap)) + 1 // Update input_idx based on what was actually added

      // Collect audio info immediately while we know the input key
      if (layer && layer.audio_enabled && audioInputKey && audioInputKey in inputMap) {
        audioInputs.push({
          input: `${inputMap[audioInputKey]}:a`,
          volume: layer.audio_volume,
          type: 'foreground',
          layerIndex: i,
        })
      }
    }

    // Build filter graph
    const filterParts: string[] = []
    let currentOutput = `[${inputMap['background']}:v]`

    // Sort layers by z-index
    const sortedLayers = this._layers
      .map((layer, index) => ({ layer, originalIndex: index }))
      .sort((a, b) => a.layer.z - b.layer.z)

    for (let layerIdx = 0; layerIdx < sortedLayers.length; layerIdx++) {
      const sortedLayer = sortedLayers[layerIdx]
      if (!sortedLayer) continue
      const { layer, originalIndex } = sortedLayer
      const fg = layer.fg

      // Use Foreground's clean method to get filters
      const layerLabel = `layer_${originalIndex}`
      const alphaEnabled = layer.alpha_enabled // Get alpha setting from layer
      const formatFilters = fg.getFFmpegFilters(layerLabel, inputMap, alphaEnabled)

      // Add format-specific filters
      filterParts.push(...formatFilters)

      // Get the current input after format processing
      let layerOutput: string
      if (formatFilters.length > 0) {
        // Format produced filters, use the merged output
        layerOutput = fg.getCurrentInputLabel(layerLabel, alphaEnabled)
      } else {
        // No format filters, use direct input
        layerOutput = `[${inputMap[`layer_${originalIndex}`]}:v]`
      }

      // Apply layer transformations (positioning, sizing, effects, timing)
      const transformationFilters = this._getLayerTransformationFilters(
        layer,
        originalIndex,
        layerOutput,
        canvasWidth,
        canvasHeight
      )
      filterParts.push(...transformationFilters)

      // Get final layer output after transformations
      if (transformationFilters.length > 0) {
        layerOutput = `[layer_${originalIndex}_final]`
      }
      // else layerOutput remains unchanged

      // Calculate position from anchor and offsets
      const positionParams = this._calculateOverlayPosition(layer, canvasWidth, canvasHeight)

      // Overlay parameters - timing now handled by setpts in layer filters
      const overlayParams = `=${positionParams}:eof_action=pass`

      if (layerIdx === sortedLayers.length - 1) {
        // Last layer - output to final
        filterParts.push(`${currentOutput}${layerOutput}overlay${overlayParams}[out]`)
      } else {
        // Intermediate layer
        const tempOutput = `[tmp${layerIdx}]`
        filterParts.push(`${currentOutput}${layerOutput}overlay${overlayParams}${tempOutput}`)
        currentOutput = tempOutput
      }
    }

    // Store video filter parts for later combination with audio filters
    const videoFilterParts = [...filterParts]
    let videoMapArgs: string[]

    if (filterParts.length > 0) {
      videoMapArgs = ['-map', '[out]']
    } else {
      // No layers, just use background
      videoMapArgs = ['-map', `${inputMap['background']}:v`]
    }

    // Add background audio if enabled
    if (this._background && this._background.audioEnabled && this._background.hasAudio()) {
      audioInputs.push({
        input: `${inputMap['background']}:a`,
        volume: this._background.audioVolume,
        type: 'background',
      })
    }

    // Handle audio with proper timing in filter graph
    const audioFilterParts: string[] = []
    let audioMapArgs: string[]

    if (audioInputs.length === 0) {
      // No audio
      audioMapArgs = ['-an']
    } else if (audioInputs.length === 1) {
      // Single audio source - but still needs timing if comp_start > 0
      const audioInput = audioInputs[0]

      // Check if this audio needs timing delay
      let needsDelay = false
      let compStart = 0

      // Only apply timing delay for foreground audio, not background audio
      if (audioInput && audioInput.type === 'foreground' && audioInput.layerIndex !== undefined) {
        const layerIdx = audioInput.layerIndex
        if (layerIdx < this._layers.length) {
          const layer = this._layers[layerIdx]
          if (layer) {
            compStart = layer.comp_start || 0
            needsDelay = compStart > 0
          }
        }
      }

      if (audioInput && (needsDelay || audioInput.volume !== 1.0)) {
        // Use filter graph for timing and/or volume
        let currentLabel = `[${audioInput.input}]`

        // Apply timing delay if needed
        if (needsDelay) {
          const delayMs = Math.floor(compStart * 1000)
          const delayedLabel = '[audio_delayed]'
          audioFilterParts.push(`${currentLabel}adelay=${delayMs}|${delayMs}${delayedLabel}`)
          currentLabel = delayedLabel
        }

        // Apply volume if needed
        if (audioInput.volume !== 1.0) {
          const volumeLabel = '[audio_out]'
          audioFilterParts.push(`${currentLabel}volume=${audioInput.volume}${volumeLabel}`)
          currentLabel = volumeLabel
        } else {
          // Rename to standard output
          if (currentLabel !== '[audio_out]') {
            audioFilterParts.push(`${currentLabel}anull[audio_out]`)
          }
        }

        audioMapArgs = ['-map', '[audio_out]']
      } else if (audioInput) {
        // No timing or volume changes needed
        audioMapArgs = ['-map', `${audioInput.input}?`]
      } else {
        audioMapArgs = ['-an']
      }
    } else {
      // Multiple audio sources - handle timing in audio filters
      const processedAudio: string[] = []

      for (let i = 0; i < audioInputs.length; i++) {
        const audioInput = audioInputs[i]
        if (!audioInput) continue

        // Get timing info for this layer
        const layerIdx = audioInput.layerIndex || i
        let compStart = 0

        if (layerIdx < this._layers.length) {
          const layer = this._layers[layerIdx]
          if (layer) {
            compStart = layer.comp_start || 0
          }
        }

        // Start with the raw input
        let currentLabel = `[${audioInput.input}]`

        // Apply adelay for timing
        if (compStart > 0) {
          const delayMs = Math.floor(compStart * 1000)
          const delayedLabel = `[audio_delayed_${i}]`
          audioFilterParts.push(`${currentLabel}adelay=${delayMs}|${delayMs}${delayedLabel}`)
          currentLabel = delayedLabel
        }

        // Apply volume if needed
        if (audioInput.volume !== 1.0) {
          const volumeLabel = `[audio_vol_${i}]`
          audioFilterParts.push(`${currentLabel}volume=${audioInput.volume}${volumeLabel}`)
          currentLabel = volumeLabel
        }

        processedAudio.push(currentLabel)
      }

      // Mix all processed audio streams
      const amixFilter = `${processedAudio.join('')}amix=inputs=${processedAudio.length}:duration=longest[audio_out]`
      audioFilterParts.push(amixFilter)
      audioMapArgs = ['-map', '[audio_out]']
    }

    // Combine video and audio filters
    const allFilterParts = [...videoFilterParts, ...audioFilterParts]

    if (allFilterParts.length > 0) {
      argv.push('-filter_complex', allFilterParts.join(';'))
    }

    // Add video and audio mapping
    argv.push(...videoMapArgs)
    argv.push(...audioMapArgs)

    // Add duration control using simple 3-rule logic
    const compDuration = this._getCompositionDuration()
    if (compDuration) {
      argv.push('-t', compDuration.toString())
      this._logDurationInfo(compDuration)
    }

    // Add encoder arguments (matches Python encoder.args() method)
    const encoderArgs = encoder.args(outPath)
    argv.push(...encoderArgs.slice(0, -1)) // All except output path

    // Handle streaming format
    if (toPipe && streamFormat) {
      if (streamFormat === 'y4m') {
        argv.push('-f', 'yuv4mpegpipe')
      } else if (streamFormat === 'webm') {
        argv.push('-f', 'webm')
      } else if (streamFormat === 'matroska') {
        argv.push('-f', 'matroska')
      } else if (streamFormat === 'mp4_fragmented') {
        argv.push('-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov')
      }
    }

    // Add output path (already included in encoder args)
    const outputPath = encoderArgs[encoderArgs.length - 1]
    if (outputPath) {
      argv.push(outputPath)
    }

    return argv
  }

  private async _run(
    argv: string[],
    onProgress?: (status: string) => void,
    verbose = false
  ): Promise<void> {
    const { spawn } = await import('child_process')

    this.ctx.logger.info(`Running FFmpeg: ${argv.join(' ')}`)

    if (verbose) {
      console.log(`🔧 FFmpeg command: ${argv.join(' ')}`)
    }

    return new Promise((resolve, reject) => {
      if (onProgress) {
        onProgress('processing')
      }

      const ffmpegPath = argv[0]
      if (!ffmpegPath) {
        reject(new Error('FFmpeg path is required'))
        return
      }

      const process = spawn(ffmpegPath, argv.slice(1), {
        stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      })

      let stderr = ''

      if (!verbose && process.stderr) {
        process.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })
      }

      process.on('close', (code: number | null) => {
        if (code === 0) {
          if (onProgress) {
            onProgress('completed')
          }
          this.ctx.logger.info('FFmpeg completed successfully')
          resolve()
        } else {
          reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`))
        }
      })

      process.on('error', (error: Error) => {
        reject(new Error(`FFmpeg execution failed: ${error.message}`))
      })
    })
  }

  /**
   * Get FFmpeg filters for layer transformations (positioning, sizing, effects, timing)
   */
  private _getLayerTransformationFilters(
    layer: LayerDict,
    layerIdx: number,
    currentInput: string,
    canvasWidth: number,
    canvasHeight: number
  ): string[] {
    const filters: string[] = []
    const layerLabel = `layer_${layerIdx}`
    let currentOutput = currentInput

    // Apply timeline shifting for composition timing (before other transformations)
    const compStart = layer.comp_start

    if (compStart && compStart > 0) {
      const nextLabel = `[${layerLabel}_timed]`
      // Shift video timeline: reset to 0, then shift by comp_start seconds
      filters.push(`${currentOutput}setpts=PTS-STARTPTS,setpts=PTS+${compStart}/TB${nextLabel}`)
      currentOutput = nextLabel
    }

    // Crop
    if (layer.crop) {
      const [x, y, w, h] = layer.crop
      const nextLabel = `[${layerLabel}_crop]`
      filters.push(`${currentOutput}crop=${w}:${h}:${x}:${y}${nextLabel}`)
      currentOutput = nextLabel
    }

    // Scale/Size
    const [sizeMode, width, height, , scale] = layer.size
    let scaleApplied = false
    const aspectConstraint = this._getAspectRatioConstraint(sizeMode)

    let targetW: string | number = 'iw'
    let targetH: string | number = 'ih'

    if (sizeMode === SizeMode.PX && width && height) {
      targetW = width
      targetH = height
      scaleApplied = true
    } else if (sizeMode === SizeMode.CANVAS_PERCENT) {
      ;[targetW, targetH] = this._calculateTargetDimensions(layer.size, canvasWidth, canvasHeight)
      scaleApplied = true
    } else if (sizeMode === SizeMode.CONTAIN || sizeMode === SizeMode.COVER) {
      targetW = canvasWidth
      targetH = canvasHeight
      scaleApplied = true
    } else if (sizeMode === SizeMode.FIT_WIDTH) {
      targetW = canvasWidth
      targetH = -1
      scaleApplied = true
    } else if (sizeMode === SizeMode.FIT_HEIGHT) {
      targetW = -1
      targetH = canvasHeight
      scaleApplied = true
    } else if (sizeMode === SizeMode.SCALE) {
      // Scale relative to original video dimensions using scale factors
      if (width !== undefined && height !== undefined) {
        // Non-uniform scaling with separate width and height scale factors
        targetW = `iw*${width}`
        targetH = `ih*${height}`
      } else if (scale !== undefined) {
        // Uniform scaling with single scale factor
        targetW = `iw*${scale}`
        targetH = `ih*${scale}`
      } else if (width !== undefined) {
        // Width scale factor only, maintain aspect ratio
        targetW = `iw*${width}`
        targetH = `ih*${width}`
      } else if (height !== undefined) {
        // Height scale factor only, maintain aspect ratio
        targetW = `iw*${height}`
        targetH = `ih*${height}`
      } else {
        // No scale specified, use original size (scale=1.0)
        targetW = 'iw'
        targetH = 'ih'
      }
      scaleApplied = true
    }

    if (scaleApplied) {
      const nextLabel = `[${layerLabel}_scale]`
      let scaleParams = `${targetW}:${targetH}`
      if (aspectConstraint) {
        scaleParams += `:force_original_aspect_ratio=${aspectConstraint}`
      }
      filters.push(`${currentOutput}scale=${scaleParams}${nextLabel}`)
      currentOutput = nextLabel
    }

    // Rotation
    if (layer.rotate !== 0) {
      const nextLabel = `[${layerLabel}_rotate]`
      filters.push(`${currentOutput}rotate=${layer.rotate}*PI/180${nextLabel}`)
      currentOutput = nextLabel
    }

    // Opacity
    if (layer.opacity !== 1.0) {
      const nextLabel = `[${layerLabel}_opacity]`
      filters.push(`${currentOutput}colorchannelmixer=aa=${layer.opacity}${nextLabel}`)
      currentOutput = nextLabel
    }

    // Update the final output label if we applied any transformations
    if (filters.length > 0) {
      // The last filter already has the correct output label
      // Just ensure it ends with the final label
      if (!currentOutput.endsWith(`[layer_${layerIdx}_final]`)) {
        // Add a null operation to create the final label
        filters.push(`${currentOutput}null[layer_${layerIdx}_final]`)
      }
    }

    return filters
  }

  private _getAspectRatioConstraint(sizeMode: SizeMode): string | null {
    if (
      [
        SizeMode.CANVAS_PERCENT,
        SizeMode.PX,
        SizeMode.CONTAIN,
        SizeMode.FIT_WIDTH,
        SizeMode.FIT_HEIGHT,
      ].includes(sizeMode)
    ) {
      return 'decrease' // Fit within bounds, preserve aspect ratio
    } else if (sizeMode === SizeMode.COVER) {
      return 'increase' // Fill bounds, preserve aspect ratio, may crop
    } else if (sizeMode === SizeMode.SCALE) {
      return null // SCALE mode uses explicit scale factors, no automatic aspect ratio constraint
    } else {
      return null // No constraint (stretch to exact dimensions)
    }
  }

  private _calculateTargetDimensions(
    sizeParams: [SizeMode, number?, number?, number?, number?],
    canvasWidth: number,
    canvasHeight: number
  ): [number, number] {
    const [sizeMode, width, height, percent] = sizeParams

    if (sizeMode !== SizeMode.CANVAS_PERCENT) {
      return [canvasWidth, canvasHeight] // Not used for non-CANVAS_PERCENT modes
    }

    // Same logic as in Python
    let targetWidth: number
    let targetHeight: number

    if (width !== undefined && height !== undefined) {
      targetWidth = Math.floor((canvasWidth * width) / 100)
      targetHeight = Math.floor((canvasHeight * height) / 100)
    } else if (width !== undefined) {
      targetWidth = Math.floor((canvasWidth * width) / 100)
      targetHeight = Math.floor((canvasHeight * (percent || 100)) / 100)
    } else if (height !== undefined) {
      targetWidth = Math.floor((canvasWidth * (percent || 100)) / 100)
      targetHeight = Math.floor((canvasHeight * height) / 100)
    } else if (percent !== undefined) {
      targetWidth = Math.floor((canvasWidth * percent) / 100)
      targetHeight = Math.floor((canvasHeight * percent) / 100)
    } else {
      targetWidth = canvasWidth
      targetHeight = canvasHeight
    }

    return [targetWidth, targetHeight]
  }

  private _calculateOverlayPosition(
    layer: LayerDict,
    canvasWidth: number,
    canvasHeight: number
  ): string {
    const { anchor, dx, dy } = layer

    // Use custom expressions if provided
    if (layer.x_expr && layer.y_expr) {
      return `x='${layer.x_expr}':y='${layer.y_expr}'`
    }

    // Check if this is CANVAS_PERCENT mode - if so, use target box dimensions for positioning
    const sizeMode = layer.size[0]
    const useTargetBox = sizeMode === SizeMode.CANVAS_PERCENT

    let xExpr: string
    let yExpr: string

    if (useTargetBox) {
      const [targetWidth, targetHeight] = this._calculateTargetDimensions(
        layer.size,
        canvasWidth,
        canvasHeight
      )

      // CANVAS_PERCENT mode: position the target box, then center video within it
      if (anchor === Anchor.TOP_LEFT) {
        xExpr = dx !== 0 ? `0${dx >= 0 ? '+' : ''}${dx}` : '0'
        yExpr = dy !== 0 ? `0${dy >= 0 ? '+' : ''}${dy}` : '0'
      } else if (anchor === Anchor.TOP_CENTER) {
        xExpr = dx !== 0 ? `(W-${targetWidth})/2${dx >= 0 ? '+' : ''}${dx}` : `(W-${targetWidth})/2`
        yExpr = dy !== 0 ? `0${dy >= 0 ? '+' : ''}${dy}` : '0'
      } else if (anchor === Anchor.TOP_RIGHT) {
        xExpr = dx !== 0 ? `W-${targetWidth}${dx >= 0 ? '+' : ''}${dx}` : `W-${targetWidth}`
        yExpr = dy !== 0 ? `0${dy >= 0 ? '+' : ''}${dy}` : '0'
      } else if (anchor === Anchor.CENTER_LEFT) {
        xExpr = dx !== 0 ? `0${dx >= 0 ? '+' : ''}${dx}` : '0'
        yExpr =
          dy !== 0 ? `(H-${targetHeight})/2${dy >= 0 ? '+' : ''}${dy}` : `(H-${targetHeight})/2`
      } else if (anchor === Anchor.CENTER) {
        xExpr = dx !== 0 ? `(W-${targetWidth})/2${dx >= 0 ? '+' : ''}${dx}` : `(W-${targetWidth})/2`
        yExpr =
          dy !== 0 ? `(H-${targetHeight})/2${dy >= 0 ? '+' : ''}${dy}` : `(H-${targetHeight})/2`
      } else if (anchor === Anchor.CENTER_RIGHT) {
        xExpr = dx !== 0 ? `W-${targetWidth}${dx >= 0 ? '+' : ''}${dx}` : `W-${targetWidth}`
        yExpr =
          dy !== 0 ? `(H-${targetHeight})/2${dy >= 0 ? '+' : ''}${dy}` : `(H-${targetHeight})/2`
      } else if (anchor === Anchor.BOTTOM_LEFT) {
        xExpr = dx !== 0 ? `0${dx >= 0 ? '+' : ''}${dx}` : '0'
        yExpr = dy !== 0 ? `H-${targetHeight}${dy >= 0 ? '+' : ''}${dy}` : `H-${targetHeight}`
      } else if (anchor === Anchor.BOTTOM_CENTER) {
        xExpr = dx !== 0 ? `(W-${targetWidth})/2${dx >= 0 ? '+' : ''}${dx}` : `(W-${targetWidth})/2`
        yExpr = dy !== 0 ? `H-${targetHeight}${dy >= 0 ? '+' : ''}${dy}` : `H-${targetHeight}`
      } else if (anchor === Anchor.BOTTOM_RIGHT) {
        xExpr = dx !== 0 ? `W-${targetWidth}${dx >= 0 ? '+' : ''}${dx}` : `W-${targetWidth}`
        yExpr = dy !== 0 ? `H-${targetHeight}${dy >= 0 ? '+' : ''}${dy}` : `H-${targetHeight}`
      } else {
        // Default to center
        xExpr = dx !== 0 ? `(W-${targetWidth})/2${dx >= 0 ? '+' : ''}${dx}` : `(W-${targetWidth})/2`
        yExpr =
          dy !== 0 ? `(H-${targetHeight})/2${dy >= 0 ? '+' : ''}${dy}` : `(H-${targetHeight})/2`
      }

      // Align video to anchor within the target box
      if ([Anchor.TOP_RIGHT, Anchor.CENTER_RIGHT, Anchor.BOTTOM_RIGHT].includes(anchor)) {
        // Right-aligned: position video at right edge of target box
        xExpr = `(${xExpr})+(${targetWidth}-w)`
      } else if ([Anchor.TOP_CENTER, Anchor.CENTER, Anchor.BOTTOM_CENTER].includes(anchor)) {
        // Center-aligned: center video within target box
        xExpr = `(${xExpr})+(${targetWidth}-w)/2`
      }
      // Left-aligned anchors: video stays at left edge of target box (no adjustment needed)

      if ([Anchor.BOTTOM_LEFT, Anchor.BOTTOM_CENTER, Anchor.BOTTOM_RIGHT].includes(anchor)) {
        // Bottom-aligned: position video at bottom edge of target box
        yExpr = `(${yExpr})+(${targetHeight}-h)`
      } else if ([Anchor.CENTER_LEFT, Anchor.CENTER, Anchor.CENTER_RIGHT].includes(anchor)) {
        // Center-aligned: center video within target box
        yExpr = `(${yExpr})+(${targetHeight}-h)/2`
      }
      // Top-aligned anchors: video stays at top edge of target box (no adjustment needed)
    } else {
      // Other modes: use actual video dimensions (w, h variables in FFmpeg)
      if (anchor === Anchor.TOP_LEFT) {
        xExpr = dx !== 0 ? `0${dx >= 0 ? '+' : ''}${dx}` : '0'
        yExpr = dy !== 0 ? `0${dy >= 0 ? '+' : ''}${dy}` : '0'
      } else if (anchor === Anchor.TOP_CENTER) {
        xExpr = dx !== 0 ? `(W-w)/2${dx >= 0 ? '+' : ''}${dx}` : '(W-w)/2'
        yExpr = dy !== 0 ? `0${dy >= 0 ? '+' : ''}${dy}` : '0'
      } else if (anchor === Anchor.TOP_RIGHT) {
        xExpr = dx !== 0 ? `W-w${dx >= 0 ? '+' : ''}${dx}` : 'W-w'
        yExpr = dy !== 0 ? `0${dy >= 0 ? '+' : ''}${dy}` : '0'
      } else if (anchor === Anchor.CENTER_LEFT) {
        xExpr = dx !== 0 ? `0${dx >= 0 ? '+' : ''}${dx}` : '0'
        yExpr = dy !== 0 ? `(H-h)/2${dy >= 0 ? '+' : ''}${dy}` : '(H-h)/2'
      } else if (anchor === Anchor.CENTER) {
        xExpr = dx !== 0 ? `(W-w)/2${dx >= 0 ? '+' : ''}${dx}` : '(W-w)/2'
        yExpr = dy !== 0 ? `(H-h)/2${dy >= 0 ? '+' : ''}${dy}` : '(H-h)/2'
      } else if (anchor === Anchor.CENTER_RIGHT) {
        xExpr = dx !== 0 ? `W-w${dx >= 0 ? '+' : ''}${dx}` : 'W-w'
        yExpr = dy !== 0 ? `(H-h)/2${dy >= 0 ? '+' : ''}${dy}` : '(H-h)/2'
      } else if (anchor === Anchor.BOTTOM_LEFT) {
        xExpr = dx !== 0 ? `0${dx >= 0 ? '+' : ''}${dx}` : '0'
        yExpr = dy !== 0 ? `H-h${dy >= 0 ? '+' : ''}${dy}` : 'H-h'
      } else if (anchor === Anchor.BOTTOM_CENTER) {
        xExpr = dx !== 0 ? `(W-w)/2${dx >= 0 ? '+' : ''}${dx}` : '(W-w)/2'
        yExpr = dy !== 0 ? `H-h${dy >= 0 ? '+' : ''}${dy}` : 'H-h'
      } else if (anchor === Anchor.BOTTOM_RIGHT) {
        xExpr = dx !== 0 ? `W-w${dx >= 0 ? '+' : ''}${dx}` : 'W-w'
        yExpr = dy !== 0 ? `H-h${dy >= 0 ? '+' : ''}${dy}` : 'H-h'
      } else {
        // Default to center
        xExpr = dx !== 0 ? `(W-w)/2${dx >= 0 ? '+' : ''}${dx}` : '(W-w)/2'
        yExpr = dy !== 0 ? `(H-h)/2${dy >= 0 ? '+' : ''}${dy}` : '(H-h)/2'
      }
    }

    return `x='${xExpr}':y='${yExpr}'`
  }
}

// Export the LayerHandle type
export type { ILayerHandle as LayerHandle }
