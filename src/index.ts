/**
 * VideoBGRemover Node.js SDK
 *
 * Official Node.js SDK for VideoBGRemover API - Remove video backgrounds with AI and compose videos with FFmpeg.
 *
 * @example
 * ```typescript
 * import { VideoBGRemoverClient, Video, Background, Composition, EncoderProfile, Anchor, SizeMode } from 'videobgremover'
 *
 * const client = new VideoBGRemoverClient(process.env.VIDEOBGREMOVER_API_KEY!)
 * const video = Video.open('path/to/video.mp4')
 * const foreground = await video.removeBackground({client})
 *
 * const background = Background.fromColor('#00FF00', 1920, 1080, 30)
 * const composition = new Composition(background)
 * composition.add(foreground).at(Anchor.CENTER).size(SizeMode.CONTAIN)
 * await composition.toFile('output.mp4', EncoderProfile.h264())
 * ```
 */

// Version
export { VERSION } from './version'

// Core client
export { VideoBGRemoverClient } from './client'

// Media classes
export {
  Video,
  Background,
  BaseBackground,
  ColorBackground,
  ImageBackground,
  VideoBackground,
  EmptyBackground,
  Foreground,
  Composition,
  EncoderProfile,
  MediaContext,
  defaultContext,
  setDefaultContext,
  RemoveBGOptions,
  Prefer,
  Model,
} from './media'

// Types and enums
export { BackgroundType, TransparentFormat, Anchor, SizeMode } from './types'
export type { LayerDict, AudioInput, SizeParams } from './types'

// Error classes
export {
  ApiError,
  InsufficientCreditsError,
  JobNotFoundError,
  ProcessingError,
  VideoBGRemoverError,
  ValidationError,
} from './errors'

// Type exports for TypeScript users
export type {
  ClientOptions,
  Credits,
  LayerHandle,
  StatusCallback,
  VideoSource,
  BackgroundSource,
  ProcessingStatus,
} from './types'

// Re-export API models for advanced users
export type {
  CreateJobFileUpload,
  CreateJobUrlDownload,
  BackgroundOptions,
  StartJobRequest,
  JobStatus,
  CreditBalance,
} from './client'
