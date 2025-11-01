/**
 * Background removal options and configuration
 * (from Python media/remove_bg.py)
 */

/**
 * Preferred transparent format for background removal (matches API transparent_format values)
 */
export enum Prefer {
  AUTO = 'auto',
  WEBM_VP9 = 'webm_vp9',
  MOV_PRORES = 'mov_prores',
  PNG_SEQUENCE = 'png_sequence',
  STACKED_VIDEO = 'stacked_video',
  PRO_BUNDLE = 'pro_bundle',
}

/**
 * AI model for background removal
 */
export enum Model {
  VIDEOBGREMOVER_ORIGINAL = 'videobgremover-original',
  VIDEOBGREMOVER_LIGHT = 'videobgremover-light',
}

/**
 * Options for background removal processing (matches Python RemoveBGOptions)
 */
export class RemoveBGOptions {
  public readonly prefer: Prefer
  public readonly model?: Model

  constructor(prefer: Prefer = Prefer.AUTO, model?: Model) {
    this.prefer = prefer
    this.model = model
  }

  /**
   * Create RemoveBGOptions with default settings (matches Python default)
   */
  static default(): RemoveBGOptions {
    return new RemoveBGOptions()
  }

  /**
   * Create RemoveBGOptions with specific preference
   */
  static withPrefer(prefer: Prefer): RemoveBGOptions {
    return new RemoveBGOptions(prefer)
  }

  /**
   * Create RemoveBGOptions with specific model
   */
  static withModel(model: Model): RemoveBGOptions {
    return new RemoveBGOptions(Prefer.AUTO, model)
  }
}
