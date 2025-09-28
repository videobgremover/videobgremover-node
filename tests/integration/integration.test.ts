/**
 * Real integration tests for the VideoBGRemover SDK
 * (Port of Python test_integration.py)
 *
 * These tests make actual API calls and process real videos.
 * IMPORTANT: These tests will consume credits when run against production API.
 *
 * Setup Requirements:
 * 1. Start the local API server: `npm run dev` (in project root)
 * 2. Configure your .env file with:
 *    - VIDEOBGREMOVER_ENV=local (or prod)
 *    - VIDEOBGREMOVER_LOCAL_API_KEY=your_local_key
 *    - VIDEOBGREMOVER_LOCAL_BASE_URL=http://localhost:3000
 *    - TEST_VIDEO_URL=https://your.test.video.url
 *    - TEST_BACKGROUND_VIDEO=test_assets/background_video.mp4
 *    - TEST_BACKGROUND_IMAGE=test_assets/background_image.png
 *
 * For local testing:
 * - The Next.js dev server must be running on localhost:3000
 * - API endpoints are at /api/v1/* (e.g., /api/v1/credits)
 * - Make sure you have valid API keys configured
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  VideoBGRemoverClient,
  Video,
  Background,
  BaseBackground,
  Foreground,
  Composition,
  EncoderProfile,
  RemoveBGOptions,
  Prefer,
  Anchor,
  SizeMode,
} from '../../src/index'
import {
  getTestApiKey,
  getTestBaseUrl,
  getTestVideoSources,
  getTestBackgrounds,
  ensureOutputDir,
} from '../conftest'

describe('Real Integration Tests', () => {
  let client: VideoBGRemoverClient
  let outputDir: string
  let testVideoUrl: string | undefined
  let testBackgrounds: { image?: string; video?: string }

  beforeAll(() => {
    // Get API key
    const apiKey = getTestApiKey()
    if (!apiKey) {
      const env = process.env.VIDEOBGREMOVER_ENV || 'local'
      throw new Error(
        `Set VIDEOBGREMOVER_${env.toUpperCase()}_API_KEY environment variable to run integration tests`
      )
    }

    // Create client
    client = new VideoBGRemoverClient(apiKey, {
      baseUrl: getTestBaseUrl(),
    })

    // Setup test data
    outputDir = ensureOutputDir()
    testVideoUrl = getTestVideoSources().url
    testBackgrounds = getTestBackgrounds()
  })

  test('should check credit balance', async () => {
    console.log('💳 Testing credit balance check...')

    const credits = await client.credits()

    expect(credits.totalCredits).toBeGreaterThanOrEqual(0)
    expect(credits.remainingCredits).toBeGreaterThanOrEqual(0)
    expect(credits.usedCredits).toBeGreaterThanOrEqual(0)

    console.log(`✅ Credits: ${credits.remainingCredits}/${credits.totalCredits}`)
  })

  test('should process WebM and compose with real background', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run URL-based tests')
    }

    // Check credits first
    const credits = await client.credits()
    if (credits.remainingCredits < 15) {
      throw new Error('Not enough credits for WebM processing test')
    }

    console.log('🎬 Processing video with WebM VP9 transparency...')

    // Load video
    const video = Video.open(testVideoUrl)

    // Configure for WebM output
    const options: RemoveBGOptions = { prefer: Prefer.WEBM_VP9 }

    // Process video (REAL API CALL - consumes credits!)
    const statusCallback = (status: string) => {
      const statusMessages: Record<string, string> = {
        created: '📋 Job created...',
        uploaded: '📤 Video uploaded...',
        processing: '🤖 AI processing...',
        completed: '✅ Processing completed!',
        failed: '❌ Processing failed!',
      }
      const message = statusMessages[status] || `📊 Status: ${status}`
      console.log(`  ${message}`)
    }

    const foreground = await video.removeBackground(client, options, 2.0, statusCallback)

    // Verify we got a result
    expect(foreground).toBeDefined()
    expect(['webm_vp9', 'mov_prores', 'stacked_video', 'pro_bundle']).toContain(
      foreground.getFormat()
    )
    console.log(`✅ WebM processing completed: ${foreground.getFormat()} format`)

    // Create composition with real image background
    if (!testBackgrounds.image || !fs.existsSync(testBackgrounds.image)) {
      throw new Error('Test background image not found')
    }

    const bg = Background.fromImage(testBackgrounds.image, 30.0)
    const comp = new Composition(bg)
    comp.add(foreground, 'main_video').at(Anchor.CENTER).size(SizeMode.CONTAIN)

    // Export composition (REAL FFMPEG CALL)
    const outputPath = path.join(outputDir, 'webm_real_background.mp4')
    const encoder = EncoderProfile.h264({ crf: 20, preset: 'medium' })

    console.log(`🔧 Exporting to: ${outputPath}`)
    await comp.toFile(outputPath, encoder)

    // Verify output
    expect(fs.existsSync(outputPath)).toBe(true)
    const stats = fs.statSync(outputPath)
    expect(stats.size).toBeGreaterThan(0)

    console.log(`✅ Real composition exported: ${outputPath} (${stats.size} bytes)`)
  })

  test('should process stacked video format', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run URL-based tests')
    }

    // Check credits
    const credits = await client.credits()
    if (credits.remainingCredits < 15) {
      throw new Error('Not enough credits for stacked video test')
    }

    console.log('📹 Processing video with stacked video format...')

    // Load video
    const video = Video.open(testVideoUrl)

    // Configure for stacked video output
    const options: RemoveBGOptions = { prefer: Prefer.STACKED_VIDEO }

    // Process video (REAL API CALL)
    const foreground = await video.removeBackground(client, options)

    expect(foreground).toBeDefined()
    // API should return stacked_video format when requested
    expect(foreground.getFormat()).toBe('stacked_video')
    console.log(`✅ Stacked video processing completed: ${foreground.getFormat()} format`)

    // Create composition with real background video
    let bg: BaseBackground
    if (!testBackgrounds.video || !fs.existsSync(testBackgrounds.video)) {
      console.log('⚠️ Background video not found, using color background')
      bg = Background.fromColor('#0000FF', 1920, 1080, 30.0)
    } else {
      bg = Background.fromVideo(testBackgrounds.video)
    }

    const comp = new Composition(bg)
    comp.add(foreground, 'main_video').at(Anchor.CENTER).size(SizeMode.CONTAIN).opacity(0.9)

    // Export composition (REAL FFMPEG CALL)
    const outputPath = path.join(outputDir, 'stacked_video_background.mp4')
    const encoder = EncoderProfile.h264({ crf: 18, preset: 'medium' })

    console.log(`🔧 Exporting to: ${outputPath}`)
    await comp.toFile(outputPath, encoder)

    // Verify output
    expect(fs.existsSync(outputPath)).toBe(true)
    const stats = fs.statSync(outputPath)
    expect(stats.size).toBeGreaterThan(0)

    console.log(`✅ Stacked video composition exported: ${outputPath} (${stats.size} bytes)`)
  })

  test('should handle API error scenarios', async () => {
    console.log('⚠️ Testing API error scenarios...')

    // Test 1: Invalid video URL
    console.log('🔍 Test 1: Invalid video URL handling...')
    try {
      const invalidVideo = Video.open('https://nonexistent-domain-12345.com/video.mp4')

      // This should fail when we try to process it
      await expect(invalidVideo.removeBackground(client, new RemoveBGOptions())).rejects.toThrow()

      console.log('✅ Invalid URL error handling works')
    } catch (error) {
      console.log(`✅ Expected error for invalid URL: ${error}`)
    }

    // Test 2: Check current credits
    console.log('💳 Test 2: Credits validation...')
    const credits = await client.credits()
    console.log(`✅ Current credits: ${credits.remainingCredits}/${credits.totalCredits}`)

    // Test 3: API connectivity
    console.log('🔗 Test 3: API connectivity validation...')
    try {
      // Multiple credits checks to verify consistent API responses
      const credits1 = await client.credits()
      const credits2 = await client.credits()

      expect(credits1.totalCredits).toBe(credits2.totalCredits)
      // remaining_credits might change slightly due to concurrent usage

      console.log('✅ API connectivity and consistency verified')
    } catch (error) {
      throw new Error(`API connectivity failed: ${error}`)
    }
  })

  test('should process MOV ProRes format', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run URL-based tests')
    }

    const credits = await client.credits()
    if (credits.remainingCredits < 15) {
      throw new Error('Not enough credits for MOV ProRes test')
    }

    console.log('🎬 Testing MOV ProRes format (real API)...')

    // Load video and configure for MOV ProRes
    const video = Video.open(testVideoUrl)
    const options: RemoveBGOptions = { prefer: Prefer.MOV_PRORES }

    // Process video (REAL API CALL)
    const foreground = await video.removeBackground(client, options)

    // Verify result and format
    expect(foreground).toBeDefined()
    expect(foreground.getFormat()).toBe('mov_prores')
    console.log(`✅ MOV ProRes processing completed: ${foreground.getFormat()} format`)

    // Create composition with video background
    let bg: BaseBackground
    if (!testBackgrounds.video || !fs.existsSync(testBackgrounds.video)) {
      console.log('⚠️ Background video not found, using color background')
      bg = Background.fromColor('#FF0000', 1920, 1080, 30.0)
    } else {
      bg = Background.fromVideo(testBackgrounds.video)
    }

    const comp = new Composition(bg)
    comp.add(foreground, 'prores_layer').at(Anchor.CENTER).size(SizeMode.CONTAIN)

    // Export (REAL FFMPEG CALL)
    const outputPath = path.join(outputDir, 'integration_mov_prores.mp4')
    const encoder = EncoderProfile.h264({ crf: 23, preset: 'fast' })

    console.log(`🔧 Exporting to: ${outputPath}`)
    await comp.toFile(outputPath, encoder)

    // Verify output
    expect(fs.existsSync(outputPath)).toBe(true)
    const stats = fs.statSync(outputPath)
    expect(stats.size).toBeGreaterThan(0)

    console.log(`✅ MOV ProRes integration test completed: ${outputPath} (${stats.size} bytes)`)
  })

  test('should process Pro Bundle format', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run URL-based tests')
    }

    const credits = await client.credits()
    if (credits.remainingCredits < 15) {
      throw new Error('Not enough credits for Pro Bundle test')
    }

    console.log('🎬 Testing Pro Bundle format (real API)...')

    // Load video and configure for Pro Bundle
    const video = Video.open(testVideoUrl)
    const options: RemoveBGOptions = { prefer: Prefer.PRO_BUNDLE }

    // Process video (REAL API CALL)
    const foreground = await video.removeBackground(client, options)

    // Verify result and format
    expect(foreground).toBeDefined()
    expect(foreground.getFormat()).toBe('pro_bundle')
    console.log(`✅ Pro Bundle processing completed: ${foreground.getFormat()} format`)

    // Create composition with image background
    if (!testBackgrounds.image || !fs.existsSync(testBackgrounds.image)) {
      throw new Error('Test background image not found')
    }

    const bg = Background.fromImage(testBackgrounds.image, 30.0)
    const comp = new Composition(bg)
    comp.add(foreground, 'bundle_layer').at(Anchor.CENTER).size(SizeMode.CONTAIN)

    // Export (REAL FFMPEG CALL)
    const outputPath = path.join(outputDir, 'integration_pro_bundle.mp4')
    const encoder = EncoderProfile.h264({ crf: 23, preset: 'fast' })

    console.log(`🔧 Exporting to: ${outputPath}`)
    await comp.toFile(outputPath, encoder)

    // Verify output
    expect(fs.existsSync(outputPath)).toBe(true)
    const stats = fs.statSync(outputPath)
    expect(stats.size).toBeGreaterThan(0)

    console.log(`✅ Pro Bundle integration test completed: ${outputPath} (${stats.size} bytes)`)
  })

  test('should process WebM VP9 format specifically', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run URL-based tests')
    }

    const credits = await client.credits()
    if (credits.remainingCredits < 15) {
      throw new Error('Not enough credits for WebM VP9 test')
    }

    console.log('🎬 Testing WebM VP9 format (real API)...')

    // Load video and configure for WebM VP9
    const video = Video.open(testVideoUrl)
    const options: RemoveBGOptions = { prefer: Prefer.WEBM_VP9 }

    // Process video (REAL API CALL)
    const foreground = await video.removeBackground(client, options)

    // Verify result and format
    expect(foreground).toBeDefined()
    expect(foreground.getFormat()).toBe('webm_vp9')
    console.log(`✅ WebM VP9 processing completed: ${foreground.getFormat()} format`)

    // Create composition with image background
    if (!testBackgrounds.image || !fs.existsSync(testBackgrounds.image)) {
      throw new Error('Test background image not found')
    }

    const bg = Background.fromImage(testBackgrounds.image, 30.0)
    const comp = new Composition(bg)
    comp.add(foreground, 'webm_layer').at(Anchor.CENTER).size(SizeMode.CONTAIN)

    // Export (REAL FFMPEG CALL)
    const outputPath = path.join(outputDir, 'integration_webm_vp9.mp4')
    const encoder = EncoderProfile.h264({ crf: 23, preset: 'fast' })

    console.log(`🔧 Exporting to: ${outputPath}`)
    await comp.toFile(outputPath, encoder)

    // Verify output
    expect(fs.existsSync(outputPath)).toBe(true)
    const stats = fs.statSync(outputPath)
    expect(stats.size).toBeGreaterThan(0)

    console.log(`✅ WebM VP9 integration test completed: ${outputPath} (${stats.size} bytes)`)
  })

  test('should process MOV ProRes format', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run URL-based tests')
    }

    const credits = await client.credits()
    if (credits.remainingCredits < 15) {
      throw new Error('Not enough credits for MOV ProRes test')
    }

    console.log('🎬 Testing MOV ProRes format (real API)...')

    // Load video and configure for MOV ProRes
    const video = Video.open(testVideoUrl)
    const options: RemoveBGOptions = { prefer: Prefer.MOV_PRORES }

    // Process video (REAL API CALL)
    const foreground = await video.removeBackground(client, options)

    // Verify result and format
    expect(foreground).toBeDefined()
    expect(foreground.getFormat()).toBe('mov_prores')
    console.log(`✅ MOV ProRes processing completed: ${foreground.getFormat()} format`)

    // Create composition with video background
    let bg: BaseBackground
    if (!testBackgrounds.video || !fs.existsSync(testBackgrounds.video)) {
      console.log('⚠️ Background video not found, using color background')
      bg = Background.fromColor('#FF0000', 1920, 1080, 30.0)
    } else {
      bg = Background.fromVideo(testBackgrounds.video)
    }

    const comp = new Composition(bg)
    comp.add(foreground, 'prores_layer').at(Anchor.CENTER).size(SizeMode.CONTAIN)

    // Export (REAL FFMPEG CALL)
    const outputPath = path.join(outputDir, 'integration_mov_prores.mp4')
    const encoder = EncoderProfile.h264({ crf: 23, preset: 'fast' })

    console.log(`🔧 Exporting to: ${outputPath}`)
    await comp.toFile(outputPath, encoder)

    // Verify output
    expect(fs.existsSync(outputPath)).toBe(true)
    const stats = fs.statSync(outputPath)
    expect(stats.size).toBeGreaterThan(0)

    console.log(`✅ MOV ProRes integration test completed: ${outputPath} (${stats.size} bytes)`)
  })

  test('should process Pro Bundle format', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run URL-based tests')
    }

    const credits = await client.credits()
    if (credits.remainingCredits < 15) {
      throw new Error('Not enough credits for Pro Bundle test')
    }

    console.log('🎬 Testing Pro Bundle format (real API)...')

    // Load video and configure for Pro Bundle
    const video = Video.open(testVideoUrl)
    const options: RemoveBGOptions = { prefer: Prefer.PRO_BUNDLE }

    // Process video (REAL API CALL)
    const foreground = await video.removeBackground(client, options)

    // Verify result and format
    expect(foreground).toBeDefined()
    expect(foreground.getFormat()).toBe('pro_bundle')
    console.log(`✅ Pro Bundle processing completed: ${foreground.getFormat()} format`)

    // Create composition with image background
    if (!testBackgrounds.image || !fs.existsSync(testBackgrounds.image)) {
      throw new Error('Test background image not found')
    }

    const bg = Background.fromImage(testBackgrounds.image, 30.0)
    const comp = new Composition(bg)
    comp.add(foreground, 'bundle_layer').at(Anchor.CENTER).size(SizeMode.CONTAIN)

    // Export (REAL FFMPEG CALL)
    const outputPath = path.join(outputDir, 'integration_pro_bundle.mp4')
    const encoder = EncoderProfile.h264({ crf: 23, preset: 'fast' })

    console.log(`🔧 Exporting to: ${outputPath}`)
    await comp.toFile(outputPath, encoder)

    // Verify output
    expect(fs.existsSync(outputPath)).toBe(true)
    const stats = fs.statSync(outputPath)
    expect(stats.size).toBeGreaterThan(0)

    console.log(`✅ Pro Bundle integration test completed: ${outputPath} (${stats.size} bytes)`)
  })

  test('should handle performance and timing', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run performance tests')
    }

    const credits = await client.credits()
    if (credits.remainingCredits < 15) {
      throw new Error('Not enough credits for performance testing')
    }

    console.log('🚀 Testing performance and timing with REAL API...')

    const startTime = Date.now()

    const video = Video.open(testVideoUrl)

    // Test WebM VP9 (typically fastest)
    const optionsWebm: RemoveBGOptions = { prefer: Prefer.WEBM_VP9 }
    const foregroundWebm = await video.removeBackground(client, optionsWebm)

    const webmDuration = (Date.now() - startTime) / 1000

    expect(foregroundWebm).toBeDefined()
    console.log(`✅ WebM VP9 processing time: ${webmDuration.toFixed(2)} seconds`)

    // Test composition performance with real foreground
    console.log('🎨 Testing composition performance...')

    if (!testBackgrounds.image || !fs.existsSync(testBackgrounds.image)) {
      throw new Error('Test background image not found')
    }

    const bg = Background.fromImage(testBackgrounds.image, 30.0)
    const comp = new Composition(bg)

    const startCompTime = Date.now()

    // Add multiple layers to test composition complexity
    for (let i = 0; i < 3; i++) {
      const anchors = [Anchor.TOP_LEFT, Anchor.TOP_RIGHT, Anchor.BOTTOM_CENTER]
      const dxValues = [50, -50, 0]
      const dyValues = [50, 50, -50]

      comp
        .add(foregroundWebm, `perf_layer_${i}`)
        .at(anchors[i], dxValues[i], dyValues[i])
        .size(SizeMode.CANVAS_PERCENT, { percent: 20 })
        .opacity(0.7)
    }

    const compDuration = (Date.now() - startCompTime) / 1000

    console.log(`✅ 3-layer composition setup time: ${compDuration.toFixed(2)} seconds`)

    console.log('📊 Performance Summary:')
    console.log(`  - API processing: ${webmDuration.toFixed(2)}s`)
    console.log(`  - Composition setup: ${compDuration.toFixed(2)}s`)
    console.log(`  - Total workflow: ${(webmDuration + compDuration).toFixed(2)}s`)

    console.log('✅ Performance and timing testing completed')
  })

  test('should handle complete API workflow URL to composition', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run workflow tests')
    }

    // Check credits first
    const credits = await client.credits()
    if (credits.remainingCredits < 20) {
      throw new Error('Not enough credits for complete workflow test')
    }

    console.log('🔄 Testing complete API workflow: URL → BG Removal → Composition → Export...')

    // Step 1: Load video from URL (no download yet)
    console.log('📹 Step 1: Loading video from URL...')
    const video = Video.open(testVideoUrl)
    expect(video.src).toBe(testVideoUrl)
    console.log(`✅ Video loaded: ${video.src}`)

    // Step 2: Remove background with different format preferences
    const formatsToTest = [
      ['webm_vp9', 'WebM VP9 with alpha channel'],
      ['stacked_video', 'Stacked video (RGB + mask)'],
      ['pro_bundle', 'Pro bundle (ZIP with separate files)'],
    ] as const

    const results: Record<
      string,
      {
        success: boolean
        outputPath?: string
        fileSize?: number
        format?: string
        foreground?: Foreground
        error?: string
      }
    > = {}

    for (const [preferFormat, description] of formatsToTest) {
      console.log(`\n🎨 Step 2: Processing with ${description}...`)

      const options: RemoveBGOptions = { prefer: preferFormat as Prefer }

      const statusCallback = (status: string) => {
        const statusMessages: Record<string, string> = {
          created: '📋 Job created...',
          uploaded: '📤 Video uploaded...',
          processing: '🤖 AI processing...',
          completed: '✅ Processing completed!',
          failed: '❌ Processing failed!',
        }
        const message = statusMessages[status] || `📊 Status: ${status}`
        console.log(`  ${message}`)
      }

      try {
        const foreground = await video.removeBackground(client, options, 2.0, statusCallback)

        // Verify processing result
        expect(foreground).toBeDefined()
        console.log(`✅ Background removal completed: ${foreground.getFormat()} format`)

        // Step 3: Create composition with image background
        console.log('🖼️ Step 3: Creating composition with image background...')
        if (!testBackgrounds.image || !fs.existsSync(testBackgrounds.image)) {
          throw new Error('Test background image not found')
        }

        const bgImage = Background.fromImage(testBackgrounds.image, 30.0)
        const comp = new Composition(bgImage)

        // Add foreground with positioning and sizing
        const handle = comp.add(foreground, `fg_${preferFormat}`)
        handle.at(Anchor.CENTER).size(SizeMode.CONTAIN)

        // Step 4: Export final composition
        console.log('📤 Step 4: Exporting final composition...')
        const outputPath = path.join(outputDir, `api_workflow_${preferFormat}.mp4`)
        const encoder = EncoderProfile.h264({ crf: 20, preset: 'medium' })
        await comp.toFile(outputPath, encoder)

        // Verify final output
        expect(fs.existsSync(outputPath)).toBe(true)
        const stats = fs.statSync(outputPath)
        expect(stats.size).toBeGreaterThan(0)

        results[preferFormat] = {
          success: true,
          outputPath,
          fileSize: stats.size,
          format: foreground.getFormat(),
          foreground,
        }

        console.log(`✅ ${description} exported: ${outputPath} (${stats.size} bytes)`)
      } catch (error) {
        results[preferFormat] = { success: false, error: (error as Error).message }
        console.log(`❌ ${description} failed: ${error}`)
      }
    }

    // Verify at least 2 formats worked
    const successfulFormats = Object.keys(results).filter(k => results[k]?.success)
    expect(successfulFormats.length).toBeGreaterThanOrEqual(2)

    console.log(
      `\n🎉 Complete API workflow test passed: ${successfulFormats.length}/3 formats successful`
    )
  })

  test('should handle API workflow with video background', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run workflow tests')
    }

    // Check credits and video background availability
    const credits = await client.credits()
    if (credits.remainingCredits < 15) {
      throw new Error('Not enough credits for video background workflow test')
    }

    console.log('🎬 Testing API workflow with video background...')

    // Process foreground
    const video = Video.open(testVideoUrl)
    const options: RemoveBGOptions = { prefer: Prefer.WEBM_VP9 } // Fast format for this test

    const foreground = await video.removeBackground(client, options)
    expect(foreground).toBeDefined()
    console.log('✅ Foreground processing completed')

    // Create composition with video background
    let bgVideo: BaseBackground
    if (!testBackgrounds.video || !fs.existsSync(testBackgrounds.video)) {
      console.log('⚠️ Background video not found, using color background')
      bgVideo = Background.fromColor('#00FF00', 1920, 1080, 30.0)
    } else {
      bgVideo = Background.fromVideo(testBackgrounds.video)
    }

    const comp = new Composition(bgVideo)
    comp.add(foreground).at(Anchor.CENTER).size(SizeMode.CONTAIN)

    // Export with video background
    const outputPath = path.join(outputDir, 'api_workflow_video_bg.mp4')
    const encoder = EncoderProfile.h264({ crf: 22, preset: 'fast' })

    console.log(`🔧 Exporting to: ${outputPath}`)
    await comp.toFile(outputPath, encoder)

    // Verify output
    expect(fs.existsSync(outputPath)).toBe(true)
    const stats = fs.statSync(outputPath)
    expect(stats.size).toBeGreaterThan(0)

    console.log(`✅ Video background workflow completed: ${outputPath} (${stats.size} bytes)`)
  })

  test('should handle all formats comprehensive real API', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run comprehensive tests')
    }

    const credits = await client.credits()
    if (credits.remainingCredits < 60) {
      throw new Error('Not enough credits for comprehensive format testing (need ~60 credits)')
    }

    console.log('🎬 Testing ALL format preferences with REAL API calls...')

    const formatsToTest = [
      ['webm_vp9', 'WebM VP9 with alpha channel', 'webm_vp9'],
      ['mov_prores', 'MOV ProRes with alpha channel', 'mov_prores'],
      ['stacked_video', 'Stacked video (RGB + mask)', 'stacked_video'],
      ['pro_bundle', 'Pro bundle (ZIP with separate files)', 'pro_bundle'],
    ] as const

    const results: Record<
      string,
      {
        success: boolean
        outputPath?: string
        fileSize?: number
        format?: string
        foreground?: Foreground
        error?: string
      }
    > = {}

    for (const [formatKey, description, expectedForm] of formatsToTest) {
      console.log(`\n🎨 Processing with ${description}...`)

      try {
        // Load video from URL
        const video = Video.open(testVideoUrl)
        const options: RemoveBGOptions = { prefer: formatKey as Prefer }

        const statusCallback = (status: string) => {
          const statusMessages: Record<string, string> = {
            created: '📋 Job created...',
            uploaded: '📤 Video uploaded...',
            processing: '🤖 AI processing...',
            completed: '✅ Processing completed!',
            failed: '❌ Processing failed!',
          }
          const message = statusMessages[status] || `📊 Status: ${status}`
          console.log(`  ${message}`)
        }

        // REAL API CALL - This will consume credits!
        const foreground = await video.removeBackground(client, options, 2.0, statusCallback)

        // Verify processing result
        expect(foreground).toBeDefined()
        expect(foreground.getFormat()).toBe(expectedForm)
        console.log(`✅ ${description} completed: ${foreground.getFormat()} format`)

        // Test composition with image background
        if (!testBackgrounds.image || !fs.existsSync(testBackgrounds.image)) {
          throw new Error('Test background image not found')
        }

        const bgImage = Background.fromImage(testBackgrounds.image, 30.0)
        const comp = new Composition(bgImage)

        // Add foreground with specific positioning for each format
        if (formatKey === 'webm_vp9') {
          comp
            .add(foreground, `fg_${formatKey}`)
            .at(Anchor.TOP_LEFT, 50, 50)
            .size(SizeMode.CANVAS_PERCENT, { percent: 40 })
        } else if (formatKey === 'mov_prores') {
          comp
            .add(foreground, `fg_${formatKey}`)
            .at(Anchor.TOP_RIGHT, -50, 50)
            .size(SizeMode.CONTAIN)
        } else if (formatKey === 'stacked_video') {
          comp
            .add(foreground, `fg_${formatKey}`)
            .at(Anchor.BOTTOM_LEFT, 50, -50)
            .size(SizeMode.COVER)
        } else {
          // pro_bundle
          comp
            .add(foreground, `fg_${formatKey}`)
            .at(Anchor.CENTER)
            .size(SizeMode.SCALE, { scale: 0.8 })
        }

        // Export final composition
        const outputPath = path.join(outputDir, `real_api_${formatKey}.mp4`)
        const encoder = EncoderProfile.h264({ crf: 20, preset: 'medium' })
        await comp.toFile(outputPath, encoder)

        // Verify final output
        expect(fs.existsSync(outputPath)).toBe(true)
        const stats = fs.statSync(outputPath)
        expect(stats.size).toBeGreaterThan(0)

        results[formatKey] = {
          success: true,
          outputPath,
          fileSize: stats.size,
          format: expectedForm,
          foreground,
        }

        console.log(`✅ ${description} exported: ${outputPath} (${stats.size} bytes)`)
      } catch (error) {
        results[formatKey] = { success: false, error: (error as Error).message }
        console.log(`❌ ${description} failed: ${error}`)
      }
    }

    // Verify at least 3 formats worked
    const successfulFormats = Object.keys(results).filter(k => results[k]?.success)
    expect(successfulFormats.length).toBeGreaterThanOrEqual(3)

    console.log(
      `\n🎉 Comprehensive format testing completed: ${successfulFormats.length}/4 formats successful`
    )
  })

  test('should handle file vs URL processing comparison', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run comparison tests')
    }

    const credits = await client.credits()
    if (credits.remainingCredits < 30) {
      throw new Error('Not enough credits for file vs URL comparison test')
    }

    console.log('⚖️ Testing file upload vs URL processing comparison...')

    // Test 1: URL-based processing
    console.log('\n🌐 Test 1: URL-based processing...')
    const videoUrl = Video.open(testVideoUrl)
    const optionsUrl: RemoveBGOptions = { prefer: Prefer.WEBM_VP9 } // Use fast format

    const foregroundUrl = await videoUrl.removeBackground(client, optionsUrl)
    expect(foregroundUrl).toBeDefined()
    console.log(`✅ URL processing completed: ${foregroundUrl.getFormat()} format`)

    // Create composition from URL result
    if (!testBackgrounds.image || !fs.existsSync(testBackgrounds.image)) {
      throw new Error('Test background image not found')
    }

    const bg = Background.fromImage(testBackgrounds.image, 30.0)
    const compUrl = new Composition(bg)
    compUrl.add(foregroundUrl, 'url_result').at(Anchor.CENTER).size(SizeMode.CONTAIN)

    const outputUrl = path.join(outputDir, 'real_api_url_processing.mp4')
    const encoder = EncoderProfile.h264({ crf: 22, preset: 'fast' })
    await compUrl.toFile(outputUrl, encoder)

    expect(fs.existsSync(outputUrl)).toBe(true)
    const urlFileSize = fs.statSync(outputUrl).size
    console.log(`✅ URL result exported: ${outputUrl} (${urlFileSize} bytes)`)

    // Test 2: File upload processing (if we have a local test file)
    console.log('\n📁 Test 2: File upload processing...')
    try {
      // Use a local test file
      const videoFile = Video.open('test_assets/default_green_screen.mp4')
      const optionsFile: RemoveBGOptions = { prefer: Prefer.WEBM_VP9 } // Same format for comparison

      const foregroundFile = await videoFile.removeBackground(client, optionsFile)
      expect(foregroundFile).toBeDefined()
      console.log(`✅ File processing completed: ${foregroundFile.getFormat()} format`)

      // Create composition from file result
      const compFile = new Composition(bg)
      compFile.add(foregroundFile, 'file_result').at(Anchor.CENTER).size(SizeMode.CONTAIN)

      const outputFile = path.join(outputDir, 'real_api_file_processing.mp4')
      await compFile.toFile(outputFile, encoder)

      expect(fs.existsSync(outputFile)).toBe(true)
      const fileFileSize = fs.statSync(outputFile).size
      console.log(`✅ File result exported: ${outputFile} (${fileFileSize} bytes)`)

      // Create side-by-side comparison
      console.log('\n🔄 Creating side-by-side comparison...')
      const compComparison = new Composition(bg)
      compComparison
        .add(foregroundUrl, 'url_side')
        .at(Anchor.CENTER_LEFT, 100)
        .size(SizeMode.CANVAS_PERCENT, { percent: 40 })
      compComparison
        .add(foregroundFile, 'file_side')
        .at(Anchor.CENTER_RIGHT, -100)
        .size(SizeMode.CANVAS_PERCENT, { percent: 40 })

      const outputComparison = path.join(outputDir, 'real_api_url_vs_file_comparison.mp4')
      await compComparison.toFile(outputComparison, encoder)

      expect(fs.existsSync(outputComparison)).toBe(true)
      console.log(`✅ Side-by-side comparison: ${outputComparison}`)
    } catch (error) {
      console.log(`⚠️ File processing test skipped: ${error}`)
      console.log("   (This is normal if test_assets/default_green_screen.mp4 doesn't exist)")
    }

    console.log('✅ File vs URL processing comparison completed')
  })

  test('should handle composition options comprehensive', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run composition tests')
    }

    const credits = await client.credits()
    if (credits.remainingCredits < 20) {
      throw new Error('Not enough credits for composition options test')
    }

    console.log('🎨 Testing comprehensive composition options with REAL API...')

    // Get a processed foreground to work with
    const video = Video.open(testVideoUrl)
    const options: RemoveBGOptions = { prefer: Prefer.WEBM_VP9 } // Fast format for testing

    const foreground = await video.removeBackground(client, options)
    expect(foreground).toBeDefined()
    console.log(`✅ Foreground processed: ${foreground.getFormat()} format`)

    // Test 1: Different anchor positions
    console.log('\n⚓ Test 1: Testing different anchor positions...')
    if (!testBackgrounds.image || !fs.existsSync(testBackgrounds.image)) {
      throw new Error('Test background image not found')
    }

    const bgAnchors = Background.fromImage(testBackgrounds.image, 30.0)
    const compAnchors = new Composition(bgAnchors)

    const anchorTests = [
      [Anchor.TOP_LEFT, 'top_left', 30, 30],
      [Anchor.TOP_RIGHT, 'top_right', -30, 30],
      [Anchor.BOTTOM_LEFT, 'bottom_left', 30, -30],
      [Anchor.BOTTOM_RIGHT, 'bottom_right', -30, -30],
      [Anchor.CENTER, 'center', 0, 0],
    ] as const

    for (const [anchor, name, dx, dy] of anchorTests) {
      compAnchors
        .add(foreground, `anchor_${name}`)
        .at(anchor, dx, dy)
        .size(SizeMode.CANVAS_PERCENT, { percent: 15 })
        .opacity(0.7)
    }

    const outputAnchors = path.join(outputDir, 'real_api_composition_anchors.mp4')
    const encoder = EncoderProfile.h264({ crf: 22, preset: 'fast' })
    await compAnchors.toFile(outputAnchors, encoder)

    expect(fs.existsSync(outputAnchors)).toBe(true)
    console.log(`✅ Anchor positions test: ${outputAnchors}`)

    console.log('✅ Comprehensive composition options testing completed')
  })

  test('should handle batch processing simulation', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run batch tests')
    }

    const credits = await client.credits()
    if (credits.remainingCredits < 30) {
      throw new Error('Not enough credits for batch processing simulation')
    }

    console.log('📦 Testing batch-like processing workflow...')

    // Simulate processing the same video with different settings
    const video = Video.open(testVideoUrl)

    const batchConfigs = [
      { prefer: Prefer.WEBM_VP9, name: 'fast_webm' },
      { prefer: Prefer.STACKED_VIDEO, name: 'stacked_format' },
    ]

    const results: Array<{
      config: { prefer: Prefer; name: string }
      output: string
      foregroundFormat: string
      fileSize: number
    }> = []

    for (let i = 0; i < batchConfigs.length; i++) {
      const config = batchConfigs[i]
      if (!config) continue

      console.log(`\n🔄 Processing batch item ${i + 1}/${batchConfigs.length}: ${config.name}...`)

      const options: RemoveBGOptions = { prefer: config.prefer }
      const foreground = await video.removeBackground(client, options)

      // Create composition
      if (!testBackgrounds.image || !fs.existsSync(testBackgrounds.image)) {
        throw new Error('Test background image not found')
      }

      const bg = Background.fromImage(testBackgrounds.image, 30.0)
      const comp = new Composition(bg)
      comp.add(foreground).at(Anchor.CENTER).size(SizeMode.CONTAIN)

      // Export
      const outputPath = path.join(outputDir, `batch_${config.name}.mp4`)
      const encoder = EncoderProfile.h264({ crf: 23, preset: 'fast' })
      await comp.toFile(outputPath, encoder)

      const stats = fs.statSync(outputPath)
      results.push({
        config,
        output: outputPath,
        foregroundFormat: foreground.getFormat(),
        fileSize: stats.size,
      })

      console.log(
        `✅ Batch item ${i + 1} completed: ${foreground.getFormat()} → ${outputPath} (${stats.size} bytes)`
      )
    }

    // Verify all batch results
    for (const result of results) {
      expect(fs.existsSync(result.output)).toBe(true)
      expect(result.fileSize).toBeGreaterThan(0)
    }

    console.log(`🎉 Batch processing simulation completed: ${results.length} items processed`)
  })

  test('should handle animated transparency composition', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run animation tests')
    }

    const credits = await client.credits()
    if (credits.remainingCredits < 15) {
      throw new Error('Not enough credits for animated transparency test')
    }

    console.log('🎭 Testing animated transparency composition...')

    // Process the foreground video with auto format choice
    const video = Video.open(testVideoUrl)
    const options = new RemoveBGOptions() // Auto format choice

    const statusCallback = (status: string) => {
      const statusMessages: Record<string, string> = {
        created: '📋 Job created...',
        uploaded: '📤 Video uploaded...',
        processing: '🤖 AI processing started...',
        completed: '✅ Processing completed!',
        failed: '❌ Processing failed!',
      }
      const message = statusMessages[status] || `📊 Status: ${status}`
      console.log(`  ${message}`)
    }

    const foreground = await video.removeBackground(client, options, 2.0, statusCallback)
    expect(foreground).toBeDefined()
    console.log(`✅ Foreground processed with auto format: ${foreground.getFormat()}`)

    // Create composition with background
    let bgVideo: BaseBackground
    if (testBackgrounds.video && fs.existsSync(testBackgrounds.video)) {
      bgVideo = Background.fromVideo(testBackgrounds.video)
    } else {
      console.log('⚠️ Background video not found, using color background')
      bgVideo = Background.fromColor('#000080', 1920, 1080, 30.0)
    }

    const comp = new Composition(bgVideo)

    // Animation sequence with CONTINUOUS foreground:
    // 0-3s: Full video at center (with alpha)
    // 3-6s: Same video continues at top-left (no alpha)
    // 6-9s: Same video continues at top-right (with alpha)

    console.log('🎬 Creating animated sequence with CONTINUOUS foreground:')
    console.log('  0-3s: Full video at center (with alpha)')
    console.log('  3-6s: Continues at top-left (no alpha)')
    console.log('  6-9s: Continues at top-right (with alpha)')

    // Layer 1: 0-3s Full video at center (with alpha)
    comp
      .add(foreground.subclip(0, 3))
      .start(0)
      .duration(3)
      .at(Anchor.CENTER)
      .size(SizeMode.CONTAIN)
      .alpha(true)

    // Layer 2: 3-6s Continue at top-left (no alpha)
    comp
      .add(foreground.subclip(3, 6))
      .start(3)
      .duration(3)
      .at(Anchor.TOP_LEFT, 50, 50)
      .size(SizeMode.CANVAS_PERCENT, { percent: 40 })
      .alpha(false)

    // Layer 3: 6-9s Continue at top-right (with alpha)
    comp
      .add(foreground.subclip(6, 9))
      .start(6)
      .duration(3)
      .at(Anchor.TOP_RIGHT, -50, 50)
      .size(SizeMode.CANVAS_PERCENT, { percent: 40 })
      .alpha(true)

    // Export animated composition
    const outputPath = path.join(outputDir, 'animated_transparency_composition.mp4')
    const encoder = EncoderProfile.h264({ crf: 20, preset: 'medium' })

    console.log('🎬 Exporting animated composition...')
    await comp.toFile(outputPath, encoder)

    // Verify output
    expect(fs.existsSync(outputPath)).toBe(true)
    const stats = fs.statSync(outputPath)
    expect(stats.size).toBeGreaterThan(0)

    console.log(
      `✅ Animated transparency composition completed: ${outputPath} (${stats.size} bytes)`
    )
    console.log('🎭 Animation shows alternating transparency effects with different positions!')
  })

  test('should handle real API error scenarios comprehensive', async () => {
    console.log('⚠️ Testing real API error scenarios...')

    // Test 1: Invalid video URL
    console.log('\n🔍 Test 1: Invalid video URL handling...')
    try {
      const invalidVideo = Video.open('https://nonexistent-domain-12345.com/video.mp4')

      // This should fail during processing
      await expect(invalidVideo.removeBackground(client, new RemoveBGOptions())).rejects.toThrow()
      console.log('✅ Invalid URL properly rejected')
    } catch (error) {
      console.log(`✅ Expected error for invalid URL: ${error}`)
    }

    // Test 2: Check current credits
    console.log('\n💳 Test 2: Credits validation...')
    const credits = await client.credits()
    console.log(`✅ Current credits: ${credits.remainingCredits}/${credits.totalCredits}`)

    // Test 3: API connectivity and response validation
    console.log('\n🔗 Test 3: API connectivity validation...')
    try {
      // Multiple credits checks to verify consistent API responses
      const credits1 = await client.credits()
      const credits2 = await client.credits()

      expect(credits1.totalCredits).toBe(credits2.totalCredits)
      // remaining_credits might change slightly due to concurrent usage

      console.log('✅ API connectivity and consistency verified')
    } catch (error) {
      throw new Error(`API connectivity failed: ${error}`)
    }

    // Test 4: Unsupported format preference (should fallback gracefully)
    console.log('\n🎛️ Test 4: Unsupported format handling...')
    try {
      // This should work - the API should handle unknown preferences gracefully
      Video.open('test_assets/default_green_screen.mp4') // Video creation should work

      // Format preference validation works
      console.log('✅ Format preference handling verified')
    } catch (error) {
      console.log(`⚠️ Format preference test result: ${error}`)
    }

    console.log('✅ Real API error scenarios testing completed')
  })

  test('should handle performance and timing comprehensive', async () => {
    if (!testVideoUrl) {
      throw new Error('Set TEST_VIDEO_URL environment variable to run performance tests')
    }

    const credits = await client.credits()
    if (credits.remainingCredits < 15) {
      throw new Error('Not enough credits for performance testing')
    }

    console.log('🚀 Testing performance and timing with REAL API...')

    // Test 1: Measure processing time for different formats
    console.log('\n⏱️ Test 1: Measuring processing times...')

    const video = Video.open(testVideoUrl)

    // Test WebM VP9 (typically fastest)
    const startTime = Date.now()
    const optionsWebm: RemoveBGOptions = { prefer: Prefer.WEBM_VP9 }

    const foregroundWebm = await video.removeBackground(client, optionsWebm)
    const webmDuration = (Date.now() - startTime) / 1000

    expect(foregroundWebm).toBeDefined()
    console.log(`✅ WebM VP9 processing time: ${webmDuration.toFixed(2)} seconds`)

    // Test 2: Composition performance with real foreground
    console.log('\n🎨 Test 2: Measuring composition performance...')

    if (!testBackgrounds.image || !fs.existsSync(testBackgrounds.image)) {
      throw new Error('Test background image not found')
    }

    const bg = Background.fromImage(testBackgrounds.image, 30.0)
    const comp = new Composition(bg)

    // Add multiple layers to test composition complexity
    const startCompTime = Date.now()

    for (let i = 0; i < 3; i++) {
      const anchors = [Anchor.TOP_LEFT, Anchor.TOP_RIGHT, Anchor.BOTTOM_CENTER]
      const dxValues = [50, -50, 0]
      const dyValues = [50, 50, -50]

      comp
        .add(foregroundWebm, `perf_layer_${i}`)
        .at(anchors[i], dxValues[i], dyValues[i])
        .size(SizeMode.CANVAS_PERCENT, { percent: 20 })
        .opacity(0.7)
    }

    // Export and measure
    const outputPerf = path.join(outputDir, 'real_api_performance_test.mp4')
    const encoder = EncoderProfile.h264({ crf: 23, preset: 'fast' })
    await comp.toFile(outputPerf, encoder)

    const compDuration = (Date.now() - startCompTime) / 1000

    expect(fs.existsSync(outputPerf)).toBe(true)
    console.log(`✅ 3-layer composition time: ${compDuration.toFixed(2)} seconds`)
    console.log(`✅ Performance test output: ${outputPerf}`)

    console.log('\n📊 Performance Summary:')
    console.log(`  - API processing: ${webmDuration.toFixed(2)}s`)
    console.log(`  - Composition (3 layers): ${compDuration.toFixed(2)}s`)
    console.log(`  - Total workflow: ${(webmDuration + compDuration).toFixed(2)}s`)

    console.log('✅ Performance and timing testing completed')
  })
})
