/**
 * Core types, enums, and interfaces for VideoBGRemover SDK
 */

// ============================================================================
// ENUMS (from Python core/types.py)
// ============================================================================

/**
 * Background source types
 */
export enum BackgroundType {
  COLOR = 'color',
  TRANSPARENT = 'transparent',
}

// Removed enum - using type alias instead

// Re-export from dedicated module
export { Prefer } from './media/remove_bg'

/**
 * Layer positioning anchors
 */
export enum Anchor {
  CENTER = 'center',
  TOP_LEFT = 'top-left',
  TOP_CENTER = 'top-center',
  TOP_RIGHT = 'top-right',
  CENTER_LEFT = 'center-left',
  CENTER_RIGHT = 'center-right',
  BOTTOM_LEFT = 'bottom-left',
  BOTTOM_CENTER = 'bottom-center',
  BOTTOM_RIGHT = 'bottom-right',
}

/**
 * Layer sizing modes
 */
export enum SizeMode {
  /** Fit within bounds, maintain aspect ratio */
  CONTAIN = 'contain',
  /** Fill bounds, maintain aspect ratio, may crop */
  COVER = 'cover',
  /** Exact pixel dimensions */
  PX = 'px',
  /** Percentage of canvas size */
  CANVAS_PERCENT = 'canvas_percent',
  /** Scale to match canvas width */
  FIT_WIDTH = 'fit_width',
  /** Scale to match canvas height */
  FIT_HEIGHT = 'fit_height',
  /** Scale relative to original dimensions */
  SCALE = 'scale',
}

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

/**
 * Status callback type (from Python core/types.py)
 */
export type StatusCallback = (status: string) => void

/**
 * Layer configuration dictionary (matches Python layer dict)
 */
export interface LayerDict {
  name: string
  fg: import('./media/foreground').Foreground
  anchor: Anchor
  dx: number
  dy: number
  x_expr?: string
  y_expr?: string
  size: [SizeMode, number?, number?, number?, number?] // [mode, width, height, percent, scale]
  opacity: number
  rotate: number
  crop?: [number, number, number, number] // [x, y, w, h]
  comp_start?: number
  comp_end?: number
  comp_duration?: number
  source_trim?: [number, number?] // [start, end?]
  audio_enabled: boolean
  audio_volume: number
  alpha_enabled: boolean
  z: number
}

/**
 * Audio input for mixing
 */
export interface AudioInput {
  input: string
  volume: number
  type: 'foreground' | 'background'
  layerIndex?: number
}

/**
 * Size parameters for layer sizing
 */
export interface SizeParams {
  mode: SizeMode
  width?: number
  height?: number
  percent?: number
  scale?: number
}

/**
 * Transparent format types (matches Python)
 */
export type TransparentFormat =
  | 'webm_vp9'
  | 'mov_prores'
  | 'png_sequence'
  | 'pro_bundle'
  | 'stacked_video'

/**
 * API client configuration options
 */
export interface ClientOptions {
  /** Base URL for the API */
  baseUrl?: string
  /** Request timeout in milliseconds */
  timeout?: number
  /** Custom headers */
  headers?: Record<string, string>
  /** Enable debug logging */
  debug?: boolean
}

/**
 * User credits information
 */
export interface Credits {
  totalCredits: number
  remainingCredits: number
  usedCredits: number
}

// Re-export from dedicated module
export { RemoveBGOptions } from './media/remove_bg'

/**
 * Layer manipulation handle for fluent API
 */
export interface LayerHandle {
  /** Position the layer */
  at(anchor?: Anchor, dx?: number, dy?: number): LayerHandle
  /** Position with custom expressions */
  xy(xExpr: string, yExpr: string): LayerHandle
  /** Set layer size */
  size(
    mode: SizeMode,
    options?: { width?: number; height?: number; percent?: number; scale?: number }
  ): LayerHandle
  /** Set layer opacity (0-1) */
  opacity(alpha: number): LayerHandle
  /** Rotate layer in degrees */
  rotate(degrees: number): LayerHandle
  /** Crop layer */
  crop(x: number, y: number, w: number, h: number): LayerHandle
  /** Set layer start time */
  start(seconds: number): LayerHandle
  /** Set layer end time */
  end(seconds: number): LayerHandle
  /** Set layer duration */
  duration(seconds: number): LayerHandle
  /** Trim source video */
  subclip(start: number, end?: number): LayerHandle
  /** Control layer audio */
  audio(enabled?: boolean, volume?: number): LayerHandle
  /** Set layer z-index */
  z(index: number): LayerHandle
  /** Control alpha transparency */
  alpha(enabled?: boolean): LayerHandle
}

/**
 * Video source types
 */
export type VideoSource = string

/**
 * Background source types
 */
export type BackgroundSource = string

/**
 * Processing status information
 */
export interface ProcessingStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  message: string
  estimatedTimeRemaining?: number
}
