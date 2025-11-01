/**
 * Media module exports
 * (like Python media/__init__.py)
 */

export { Video } from './video'
export {
  Background,
  BaseBackground,
  ColorBackground,
  ImageBackground,
  VideoBackground,
  EmptyBackground,
} from './backgrounds'
export { Foreground } from './foreground'
export { Composition } from './composition'
export { EncoderProfile } from './encoders'
export { MediaContext, defaultContext, setDefaultContext } from './context'
export { VideoSource } from './video-source'
export { RemoveBGOptions, Prefer, Model } from './remove_bg'

// Re-export LayerHandle from composition
export type { LayerHandle } from './composition'
