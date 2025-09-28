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
 * Options for background removal processing (matches Python RemoveBGOptions)
 */
export class RemoveBGOptions {
  public readonly prefer: Prefer

  constructor(prefer: Prefer = Prefer.AUTO) {
    this.prefer = prefer
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
}
