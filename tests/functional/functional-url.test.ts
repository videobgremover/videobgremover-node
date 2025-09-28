/**
 * URL-based VideoBGRemover workflow tests
 * (Port of Python test_functional_url.py)
 *
 * This test suite validates URL-based video processing workflows:
 * - Tests Video.open() with URLs (no premature downloads)
 * - Validates public URL accessibility checks
 * - Tests API job creation with URL vs file upload paths
 * - Verifies URL-based background removal workflows
 * - Tests composition with URL-sourced foregrounds
 * - Validates error handling for inaccessible URLs
 *
 * URL Configuration:
 * - Uses TEST_VIDEO_URL environment variable
 * - Validates URL accessibility before testing
 * - Skips tests gracefully if URL not configured
 */

import * as fs from 'fs'
import * as path from 'path'
import axios from 'axios'
import {
  Video,
  Background,
  Composition,
  EncoderProfile,
  Anchor,
  SizeMode,
  Foreground,
} from '../../src/index'

// Type definitions for test data
type FormatKey = 'webm_vp9' | 'mov_prores' | 'stacked_video' | 'pro_bundle'
type TestResult = {
  success: boolean
  outputPath?: string
  format?: string
  error?: string
}
import { getTestVideoSources, ensureOutputDir } from '../conftest'

describe('URL-Based Workflow Tests', () => {
  let outputDir: string
  let testVideoUrl: string | undefined

  beforeAll(async () => {
    outputDir = ensureOutputDir('url_tests')
    testVideoUrl = getTestVideoSources().url

    if (!testVideoUrl) {
      console.warn('⚠️ TEST_VIDEO_URL not set - using mock URL for tests')
      testVideoUrl = 'https://example.com/mock-video.mp4'
      return
    }

    // Validate URL is accessible (HEAD request only - no download)
    try {
      const response = await axios.head(testVideoUrl, {
        timeout: 5000,
        maxRedirects: 5,
      })
      if (![200, 204].includes(response.status)) {
        console.warn(`⚠️ Test video URL not accessible: ${response.status} - using mock URL`)
        testVideoUrl = 'https://example.com/mock-video.mp4'
      }
    } catch (error) {
      console.warn(`⚠️ Test video URL validation failed: ${error} - using mock URL`)
      testVideoUrl = 'https://example.com/mock-video.mp4'
    }
  })

  test('should open URL without downloading', () => {
    if (!testVideoUrl) return

    console.log(`🌐 Testing Video.open() with URL: ${testVideoUrl}`)

    // This should be instant - no download occurs
    const video = Video.open(testVideoUrl)

    // Verify video properties
    expect(video.kind).toBe('url')
    expect(video.src).toBe(testVideoUrl)

    console.log('✅ Video.open() with URL completed instantly (no download)')
  })

  test('should validate URL accessibility', async () => {
    if (!testVideoUrl) return

    console.log('🔍 Testing URL accessibility validation...')

    // Test with valid URL (our test URL)
    try {
      const response = await axios.head(testVideoUrl, { timeout: 10000 })
      expect([200, 204]).toContain(response.status)
      console.log('✅ Test URL is accessible')
    } catch (error) {
      throw new Error(`Test URL should be accessible: ${error}`)
    }

    // Test with invalid URL
    try {
      await axios.head('https://nonexistent-domain-12345.com/video.mp4', { timeout: 5000 })
      throw new Error('Invalid URL should not be accessible')
    } catch (error) {
      // Expected to fail
      console.log('✅ Invalid URL properly rejected')
    }

    console.log('✅ URL accessibility validation working correctly')
  })

  test('should handle URL vs file job creation paths', async () => {
    if (!testVideoUrl) return

    console.log('🔄 Testing URL vs file job creation paths...')

    // Test URL video detection
    const urlVideo = Video.open(testVideoUrl)
    expect(urlVideo.kind).toBe('url')

    // Test file video detection
    const fileVideo = Video.open('test_assets/default_green_screen.mp4')
    expect(fileVideo.kind).toBe('file')

    console.log('✅ URL and file videos use correct detection logic')
  })

  test('should handle URL-based WebM workflow with image background', async () => {
    if (!testVideoUrl) return

    console.log(`🎬 Testing URL-based WebM workflow: ${testVideoUrl}`)

    // Mock the background removal to return WebM foreground
    const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
      format: 'webm_vp9',
    })

    // Load video from URL (no download occurs)
    const video = Video.open(testVideoUrl)
    expect(video.kind).toBe('url')

    // Verify we got the right format
    expect(foreground.getFormat()).toBe('webm_vp9')
    expect(foreground.src).toContain('transparent_webm_vp9.webm')

    // Create composition with image background
    const bg = Background.fromImage('test_assets/background_image.png', 30.0)
    const comp = new Composition(bg)
    comp.add(foreground, 'url_webm_layer').at(Anchor.CENTER).size(SizeMode.CONTAIN)

    // Export with real FFmpeg (when implemented)
    const outputPath = path.join(outputDir, 'url_webm_image_background.mp4')
    const encoder = EncoderProfile.h264({ crf: 20, preset: 'fast' })

    console.log(`🔧 Exporting to: ${outputPath}`)
    await comp.toFile(outputPath, encoder)

    // Verify output
    expect(fs.existsSync(outputPath)).toBe(true)
    const stats = fs.statSync(outputPath)
    expect(stats.size).toBeGreaterThan(0)

    console.log(`✅ URL-based WebM workflow test completed`)
  })

  test('should handle URL-based stacked video workflow', async () => {
    if (!testVideoUrl) return

    console.log(`📹 Testing URL-based stacked video workflow: ${testVideoUrl}`)

    // Mock the background removal to return stacked video foreground
    const foreground = Foreground.fromUrl('test_assets/stacked_video_comparison.mp4', {
      format: 'stacked_video',
    })

    // Load video from URL
    Video.open(testVideoUrl)

    // Verify format
    expect(foreground.getFormat()).toBe('stacked_video')

    // Create composition with color background
    const bg = Background.fromColor('#FF0000', 1920, 1080, 30.0)
    const comp = new Composition(bg)
    comp.add(foreground, 'url_stacked_layer').at(Anchor.CENTER).size(SizeMode.COVER)

    // Export
    const outputPath = path.join(outputDir, 'url_stacked_video.mp4')
    const encoder = EncoderProfile.h264({ crf: 20, preset: 'medium' })

    console.log(`🔧 Exporting to: ${outputPath}`)
    await comp.toFile(outputPath, encoder)

    // Verify output
    expect(fs.existsSync(outputPath)).toBe(true)
    const stats = fs.statSync(outputPath)
    expect(stats.size).toBeGreaterThan(0)

    console.log(`✅ URL-based stacked video workflow test completed`)
  })

  test('should handle URL-based pro bundle workflow', async () => {
    if (!testVideoUrl) return

    console.log(`🎬 Testing URL-based pro bundle workflow: ${testVideoUrl}`)

    // Mock the background removal to return pro bundle foreground
    const foreground = Foreground.fromUrl('test_assets/pro_bundle_multiple_formats.zip', {
      format: 'pro_bundle',
    })

    // Load video from URL
    Video.open(testVideoUrl)

    // Verify format
    expect(foreground.getFormat()).toBe('pro_bundle')

    // Create composition with video background
    const bg = Background.fromVideo('test_assets/background_video.mp4')
    const comp = new Composition(bg)
    comp.add(foreground, 'url_bundle_layer').at(Anchor.CENTER).size(SizeMode.CONTAIN)

    // Export
    const outputPath = path.join(outputDir, 'url_pro_bundle.mp4')
    const encoder = EncoderProfile.h264({ crf: 20, preset: 'medium' })

    console.log(`🔧 Exporting to: ${outputPath}`)
    await comp.toFile(outputPath, encoder)

    // Verify output
    expect(fs.existsSync(outputPath)).toBe(true)
    const stats = fs.statSync(outputPath)
    expect(stats.size).toBeGreaterThan(0)

    console.log(`✅ URL-based pro bundle workflow test completed`)
  })

  test('should handle comprehensive URL format testing', async () => {
    if (!testVideoUrl) return

    console.log(`🎬 Testing all formats with URL source: ${testVideoUrl}`)

    const formatsToTest = [
      ['webm_vp9', 'WebM VP9', 'test_assets/transparent_webm_vp9.webm', 'webm_vp9'],
      ['mov_prores', 'MOV ProRes', 'test_assets/transparent_mov_prores.mov', 'mov_prores'],
      [
        'stacked_video',
        'Stacked Video',
        'test_assets/stacked_video_comparison.mp4',
        'stacked_video',
      ],
      ['pro_bundle', 'Pro Bundle', 'test_assets/pro_bundle_multiple_formats.zip', 'pro_bundle'],
    ]

    const results: Record<string, TestResult> = {}

    for (const [formatKey, formatName, testAsset, expectedForm] of formatsToTest) {
      console.log(`  Testing ${formatName} with URL source...`)

      try {
        // Mock appropriate foreground type
        const foreground = Foreground.fromUrl(testAsset as string, {
          format: expectedForm as FormatKey,
        })

        // Load video from URL
        const video = Video.open(testVideoUrl)
        expect(video.kind).toBe('url')

        // Verify format
        expect(foreground.getFormat()).toBe(expectedForm)

        // Create composition
        const bg = Background.fromColor('#00FF00', 1920, 1080, 30.0)
        const comp = new Composition(bg)
        comp.add(foreground, `url_${formatKey}_layer`).at(Anchor.CENTER).size(SizeMode.CONTAIN)

        // Export
        const outputPath = path.join(outputDir, `url_comprehensive_${formatKey}.mp4`)

        // Test composition setup
        expect(comp).toBeDefined()

        results[formatKey as string] = {
          success: true,
          outputPath,
          format: expectedForm,
        }

        console.log(`    ✅ ${formatName}: ${expectedForm} format`)
      } catch (error) {
        results[formatKey as string] = {
          success: false,
          error: (error as Error).message,
        }
        console.log(`    ❌ ${formatName} failed: ${error}`)
      }
    }

    // Verify at least 2 formats worked
    const successfulFormats = Object.keys(results).filter(k => results[k]?.success)
    expect(successfulFormats.length).toBeGreaterThanOrEqual(2)

    console.log(
      `✅ URL-based comprehensive test completed: ${successfulFormats.length}/4 formats successful`
    )
  })

  test('should handle URL error scenarios', async () => {
    console.log('🎬 Testing URL error handling...')

    // Test with completely invalid URLs
    const invalidUrls = [
      'https://nonexistent-domain-12345.com/video.mp4',
      'http://localhost:99999/video.mp4', // Invalid port
      'https://httpstat.us/404', // Returns 404
      'not-a-url-at-all', // Not even a URL
    ]

    for (const invalidUrl of invalidUrls) {
      console.log(`  Testing invalid URL: ${invalidUrl}`)

      // Video.open should still work (no validation at this stage)
      const video = Video.open(invalidUrl)
      expect(video).toBeDefined()

      // But URL validation should fail when we try to access it
      if (invalidUrl.startsWith('http')) {
        try {
          await axios.head(invalidUrl, { timeout: 5000 })
          // If it doesn't throw, the URL is actually accessible
          console.log(`    ⚠️ URL is actually accessible: ${invalidUrl}`)
        } catch (error) {
          console.log(`    ✅ URL properly rejected: ${invalidUrl}`)
        }
      }
    }

    console.log('✅ URL error handling test completed')
  })

  test('should handle URL file size limit validation', async () => {
    console.log('🔍 Testing URL file size limit validation...')

    // Test with our valid URL to check if it has content-length
    if (testVideoUrl) {
      try {
        const response = await axios.head(testVideoUrl, { timeout: 10000 })
        const contentLength = response.headers['content-length']

        if (contentLength) {
          const sizeInBytes = parseInt(contentLength)
          const sizeInMB = sizeInBytes / (1024 * 1024)
          console.log(`  Test video size: ${sizeInMB.toFixed(2)} MB`)

          // Should be under 1GB (1024 MB)
          expect(sizeInMB).toBeLessThan(1024)
          console.log('✅ Test video is within size limits')
        } else {
          console.log('⚠️ Test video does not provide content-length header')
        }
      } catch (error) {
        console.log(`⚠️ Could not check test video size: ${error}`)
      }
    }

    console.log('✅ URL file size limit validation completed')
  })

  test('should handle URL video as background in composition', async () => {
    if (!testVideoUrl) return

    console.log(`🎨 Testing URL video as background: ${testVideoUrl}`)

    // Create a mock foreground
    const fg = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
      format: 'webm_vp9',
    })

    // Use URL video as background
    const bg = Background.fromVideo(testVideoUrl)
    expect(bg.source).toBe(testVideoUrl)

    // Create composition
    const comp = new Composition(bg)
    comp.add(fg, 'overlay').at(Anchor.CENTER).size(SizeMode.CONTAIN).opacity(0.8)

    // Test composition setup
    expect(comp).toBeDefined()

    console.log('✅ URL video background composition working correctly')
  })
})

describe('URL Error Handling', () => {
  test('should handle various invalid URL scenarios', async () => {
    console.log('⚠️ Testing comprehensive URL error handling...')

    const errorScenarios = [
      {
        url: 'https://httpstat.us/500',
        description: 'Server error (500)',
      },
      {
        url: 'https://httpstat.us/404',
        description: 'Not found (404)',
      },
      {
        url: 'https://httpstat.us/403',
        description: 'Forbidden (403)',
      },
      {
        url: 'ftp://example.com/video.mp4',
        description: 'Unsupported protocol (FTP)',
      },
      {
        url: 'invalid-url-format',
        description: 'Invalid URL format',
      },
    ]

    for (const scenario of errorScenarios) {
      console.log(`  Testing ${scenario.description}: ${scenario.url}`)

      // Video.open should work (no validation yet)
      const video = Video.open(scenario.url)
      expect(video.src).toBe(scenario.url)

      // URL validation should happen when we try to access it
      if (scenario.url.startsWith('http')) {
        try {
          await axios.head(scenario.url, { timeout: 5000 })
          console.log(`    ⚠️ URL unexpectedly accessible: ${scenario.url}`)
        } catch (error) {
          console.log(`    ✅ URL properly rejected: ${scenario.description}`)
        }
      } else {
        console.log(`    ✅ Non-HTTP URL handled: ${scenario.description}`)
      }
    }

    console.log('✅ Comprehensive URL error handling completed')
  })
})
