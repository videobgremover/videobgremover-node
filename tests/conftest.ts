/**
 * Test configuration and fixtures for VideoBGRemover SDK tests
 * (Equivalent to Python conftest.py)
 */

import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

// Load environment variables
config()

/**
 * Get test API key from environment
 */
export function getTestApiKey(): string | undefined {
  const env = process.env.VIDEOBGREMOVER_ENV || 'local'
  return process.env[`VIDEOBGREMOVER_${env.toUpperCase()}_API_KEY`]
}

/**
 * Get test base URL from environment
 */
export function getTestBaseUrl(): string {
  const env = process.env.VIDEOBGREMOVER_ENV || 'local'

  if (env === 'prod') {
    return process.env.VIDEOBGREMOVER_PROD_BASE_URL || 'https://api.videobgremover.com'
  } else if (env === 'staging') {
    return process.env.VIDEOBGREMOVER_STAGING_BASE_URL || 'https://staging-api.videobgremover.com'
  } else {
    const baseUrl = process.env.VIDEOBGREMOVER_LOCAL_BASE_URL || 'http://localhost:3000'
    // Ensure we have /api in the path for local development
    // Note: Don't add /v1 here as the API client adds it automatically
    if (baseUrl === 'http://localhost:3000') {
      return 'http://localhost:3000/api'
    }
    return baseUrl
  }
}

/**
 * Get test video sources
 */
export function getTestVideoSources(): { url?: string; file?: string } {
  return {
    url: process.env.TEST_VIDEO_URL,
    file: 'test_assets/default_green_screen.mp4',
  }
}

/**
 * Get test background assets
 */
export function getTestBackgrounds(): { image?: string; video?: string } {
  return {
    image: process.env.TEST_BACKGROUND_IMAGE || 'test_assets/background_image.png',
    video: process.env.TEST_BACKGROUND_VIDEO || 'test_assets/background_video.mp4',
  }
}

/**
 * Check if test assets exist
 */
export function checkTestAssets(): { missing: string[]; available: string[] } {
  const assets = [
    'test_assets/default_green_screen.mp4',
    'test_assets/background_image.png',
    'test_assets/background_video.mp4',
    'test_assets/transparent_webm_vp9.webm',
    'test_assets/transparent_mov_prores.mov',
    'test_assets/stacked_video_comparison.mp4',
    'test_assets/pro_bundle_multiple_formats.zip',
  ]

  const missing: string[] = []
  const available: string[] = []

  for (const asset of assets) {
    const assetPath = path.resolve(asset)
    if (fs.existsSync(assetPath)) {
      available.push(asset)
    } else {
      missing.push(asset)
    }
  }

  return { missing, available }
}

/**
 * Create output directory
 */
export function ensureOutputDir(subDir = ''): string {
  const outputPath = path.resolve('test_outputs', subDir)
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true })
  }
  return outputPath
}
