/**
 * Encoder profiles for video export
 * (from Python media/encoders.py)
 */

/**
 * Video encoder profile configuration (matches Python EncoderProfile structure)
 */
export class EncoderProfile {
  constructor(
    public readonly kind:
      | 'h264'
      | 'vp9'
      | 'transparent_webm'
      | 'prores_4444'
      | 'png_sequence'
      | 'stacked_video',
    public readonly crf?: number,
    public readonly preset?: string,
    public readonly layout?: 'vertical' | 'horizontal',
    public readonly fps?: number
  ) {}

  /**
   * H.264 encoder profile for standard video output (matches Python)
   */
  static h264(options: { crf?: number; preset?: string } = {}): EncoderProfile {
    const { crf = 18, preset = 'medium' } = options
    return new EncoderProfile('h264', crf, preset)
  }

  /**
   * VP9 encoder profile for web-optimized video (matches Python)
   */
  static vp9(options: { crf?: number } = {}): EncoderProfile {
    const { crf = 32 } = options
    return new EncoderProfile('vp9', crf)
  }

  /**
   * Transparent WebM encoder profile with alpha channel (matches Python)
   */
  static transparentWebm(options: { crf?: number } = {}): EncoderProfile {
    const { crf = 28 } = options
    return new EncoderProfile('transparent_webm', crf)
  }

  /**
   * ProRes 4444 encoder profile for high-quality transparent video (matches Python)
   */
  static prores4444(): EncoderProfile {
    return new EncoderProfile('prores_4444')
  }

  /**
   * PNG sequence encoder profile for frame-by-frame output (matches Python)
   */
  static pngSequence(options: { fps?: number } = {}): EncoderProfile {
    const { fps } = options
    return new EncoderProfile('png_sequence', undefined, undefined, undefined, fps)
  }

  /**
   * Stacked video encoder profile (RGB + mask) (matches Python)
   */
  static stackedVideo(options: { layout?: 'vertical' | 'horizontal' } = {}): EncoderProfile {
    const { layout = 'vertical' } = options
    return new EncoderProfile('stacked_video', undefined, undefined, layout)
  }

  /**
   * Generate FFmpeg arguments for this encoder profile (matches Python args() method)
   */
  args(outPath: string): string[] {
    let args: string[] = []

    if (this.kind === 'h264') {
      args = [
        '-c:v',
        'libx264',
        '-crf',
        String(this.crf || 18),
        '-preset',
        this.preset || 'medium',
        '-pix_fmt',
        'yuv420p',
      ]
    } else if (this.kind === 'vp9') {
      args = [
        '-c:v',
        'libvpx-vp9',
        '-crf',
        String(this.crf || 32),
        '-b:v',
        '0', // Use CRF mode
      ]
    } else if (this.kind === 'transparent_webm') {
      args = [
        '-c:v',
        'libvpx-vp9',
        '-crf',
        String(this.crf || 28),
        '-b:v',
        '0',
        '-pix_fmt',
        'yuva420p', // Enable alpha channel
        '-auto-alt-ref',
        '0', // Disable alt-ref frames for better compatibility
      ]
    } else if (this.kind === 'prores_4444') {
      args = [
        '-c:v',
        'prores_ks',
        '-profile:v',
        '4', // ProRes 4444
        '-pix_fmt',
        'yuva444p10le',
      ]
    } else if (this.kind === 'png_sequence') {
      args = ['-c:v', 'png', '-pix_fmt', 'rgba']
      if (this.fps) {
        args.push('-r', String(this.fps))
      }
    } else if (this.kind === 'stacked_video') {
      // Stacked video uses standard H.264 encoding
      // The stacking is handled in the composition phase
      args = [
        '-c:v',
        'libx264',
        '-crf',
        String(this.crf || 18),
        '-preset',
        this.preset || 'medium',
        '-pix_fmt',
        'yuv420p',
      ]
    } else {
      throw new Error(`Unknown encoder kind: ${this.kind}`)
    }

    // Add output path
    args.push(outPath)

    return args
  }

  /**
   * Generate FFmpeg arguments without output path (for internal use)
   */
  toFFmpegArgs(): string[] {
    const argsWithPath = this.args('TEMP_OUTPUT')
    return argsWithPath.slice(0, -1) // Remove the output path
  }
}
