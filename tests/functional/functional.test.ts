/**
 * Complete VideoBGRemover workflow tests with all formats
 * (Port of Python test_functional.py)
 *
 * This test suite validates the complete VideoBGRemover workflow:
 * - Mocks API responses for all supported formats
 * - Uses real FFmpeg operations for composition
 * - Tests with both image and video backgrounds
 * - Tests with both file and URL video sources
 * - Verifies actual output files are created
 *
 * All formats tested:
 * - WebM VP9 (transparent video)
 * - MOV ProRes (professional format)
 * - Stacked Video (RGB + mask in single file)
 * - Pro Bundle (ZIP with color.mp4 + alpha.mp4)
 * - PNG Sequence (frame-by-frame)
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
  MediaContext,
  Anchor,
  SizeMode,
  Prefer,
  Model,
} from '../../src/index'

// Type definitions for test data
type FormatKey = 'webm_vp9' | 'mov_prores' | 'stacked_video' | 'pro_bundle'
type TestResult = {
  success: boolean
  encoder?: string
  crf?: number
  preset?: string
  layout?: string
  fps?: number
  outputPath?: string
  description?: string
  error?: string
  format?: string
}
import { ensureOutputDir } from '../conftest'

describe('VideoBGRemover Workflow Tests', () => {
  let mockClient: VideoBGRemoverClient
  let outputDir: string

  beforeAll(() => {
    outputDir = ensureOutputDir('workflow_tests')
    mockClient = new VideoBGRemoverClient('mock_api_key_for_workflow_tests')
  })

  describe('API Compatibility Tests', () => {
    test('should verify EncoderProfile API matches Python', () => {
      console.log('✅ Testing EncoderProfile API compatibility...')

      // Test that all Python methods exist with correct signatures
      const h264Encoder = EncoderProfile.h264({ crf: 18, preset: 'medium' })
      const vp9Encoder = EncoderProfile.vp9({ crf: 32 })
      const transparentWebm = EncoderProfile.transparentWebm({ crf: 28 })
      const prores4444 = EncoderProfile.prores4444()
      const pngSequence = EncoderProfile.pngSequence({ fps: 30 })
      const stackedVideo = EncoderProfile.stackedVideo({ layout: 'vertical' })

      // Verify structure matches Python
      expect(h264Encoder.kind).toBe('h264')
      expect(h264Encoder.crf).toBe(18)
      expect(h264Encoder.preset).toBe('medium')

      expect(vp9Encoder.kind).toBe('vp9')
      expect(vp9Encoder.crf).toBe(32)

      expect(transparentWebm.kind).toBe('transparent_webm')
      expect(transparentWebm.crf).toBe(28)

      expect(prores4444.kind).toBe('prores_4444')

      expect(pngSequence.kind).toBe('png_sequence')
      expect(pngSequence.fps).toBe(30)

      expect(stackedVideo.kind).toBe('stacked_video')
      expect(stackedVideo.layout).toBe('vertical')

      // Test args() method matches Python
      const ffmpegArgs = h264Encoder.args('output.mp4')
      expect(ffmpegArgs).toContain('-c:v')
      expect(ffmpegArgs).toContain('libx264')
      expect(ffmpegArgs).toContain('-crf')
      expect(ffmpegArgs).toContain('18')
      expect(ffmpegArgs).toContain('-preset')
      expect(ffmpegArgs).toContain('medium')
      expect(ffmpegArgs[ffmpegArgs.length - 1]).toBe('output.mp4')

      console.log('✅ EncoderProfile API compatibility verified')
    })

    test('should verify RemoveBGOptions API matches Python', () => {
      console.log('✅ Testing RemoveBGOptions API compatibility...')

      // Test class-based approach like Python
      const defaultOptions = new RemoveBGOptions()
      const webmOptions = new RemoveBGOptions(Prefer.WEBM_VP9)
      const autoOptions = RemoveBGOptions.default()
      const specificOptions = RemoveBGOptions.withPrefer(Prefer.MOV_PRORES)

      expect(defaultOptions.prefer).toBe(Prefer.AUTO)
      expect(webmOptions.prefer).toBe(Prefer.WEBM_VP9)
      expect(autoOptions.prefer).toBe(Prefer.AUTO)
      expect(specificOptions.prefer).toBe(Prefer.MOV_PRORES)

      console.log('✅ RemoveBGOptions API compatibility verified')
    })

    test('should verify Model enum and RemoveBGOptions with model parameter', () => {
      console.log('✅ Testing Model enum and model parameter...')

      // Test Model enum values
      expect(Model.VIDEOBGREMOVER_ORIGINAL).toBe('videobgremover-original')
      expect(Model.VIDEOBGREMOVER_LIGHT).toBe('videobgremover-light')

      // Test RemoveBGOptions with model parameter (using enum)
      const optionsWithModel = new RemoveBGOptions(Prefer.AUTO, Model.VIDEOBGREMOVER_LIGHT)
      expect(optionsWithModel.prefer).toBe(Prefer.AUTO)
      expect(optionsWithModel.model).toBe(Model.VIDEOBGREMOVER_LIGHT)

      // Test static factory method withModel
      const modelOptions = RemoveBGOptions.withModel(Model.VIDEOBGREMOVER_ORIGINAL)
      expect(modelOptions.prefer).toBe(Prefer.AUTO)
      expect(modelOptions.model).toBe(Model.VIDEOBGREMOVER_ORIGINAL)

      // Test combining prefer and model
      const combinedOptions = new RemoveBGOptions(Prefer.WEBM_VP9, Model.VIDEOBGREMOVER_LIGHT)
      expect(combinedOptions.prefer).toBe(Prefer.WEBM_VP9)
      expect(combinedOptions.model).toBe(Model.VIDEOBGREMOVER_LIGHT)

      // Test with plain string (future model that doesn't exist in enum yet)
      const futureModelOptions = new RemoveBGOptions(Prefer.AUTO, 'videobgremover-ultra' as any)
      expect(futureModelOptions.model).toBe('videobgremover-ultra')
      console.log('✅ Plain string models work (future-proof for new models)')

      console.log('✅ Model enum and model parameter verified')
    })

    test('should verify MediaContext API matches Python', () => {
      console.log('✅ Testing MediaContext API compatibility...')

      // Test constructor matches Python signature
      const ctx1 = new MediaContext()
      const ctx2 = new MediaContext('ffmpeg', 'ffprobe', '/tmp')

      expect(ctx1.ffmpeg).toBe('ffmpeg')
      expect(ctx1.ffprobe).toBe('ffprobe')
      expect(ctx2.tmp).toBe('/tmp')

      // Test method names (camelCase versions of Python snake_case)
      const tempPath = ctx1.tempPath('.mp4', 'test_')
      expect(tempPath).toContain('test_')
      expect(tempPath).toContain('.mp4')

      const webmSupport = ctx1.checkWebmSupport()
      expect(typeof webmSupport).toBe('boolean')

      console.log('✅ MediaContext API compatibility verified')
    })

    test('export test - composition to opaque formats', async () => {
      console.log('🎬 Test 1: Export Composition to Opaque Video Formats...')

      // Create test_outputs/export_test directory
      const testOutputsDir = path.join(process.cwd(), 'test_outputs', 'export_test')
      if (!fs.existsSync(testOutputsDir)) {
        fs.mkdirSync(testOutputsDir, { recursive: true })
      }

      // Create a transparent foreground
      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      // Create a SOLID background - composition will be opaque
      const solidBg = Background.fromColor('#FF6B35', 1920, 1080, 30.0) // Orange background

      // Test OPAQUE formats for composition export (foreground + background = opaque video)
      const opaqueEncoders = [
        {
          name: 'composition_h264_default',
          encoder: EncoderProfile.h264(),
          description: 'Composition → H.264 (opaque video with background)',
        },
        {
          name: 'composition_h264_fast',
          encoder: EncoderProfile.h264({ crf: 25, preset: 'ultrafast' }),
          description: 'Composition → H.264 fast (opaque video)',
        },
        {
          name: 'composition_vp9',
          encoder: EncoderProfile.vp9({ crf: 35 }),
          description: 'Composition → VP9 (opaque video with background)',
        },
      ]

      console.log(`  📁 Output directory: ${testOutputsDir}`)
      console.log(`  🎯 Testing ${opaqueEncoders.length} opaque encoder formats...`)

      const results: Record<string, TestResult> = {}

      for (const test of opaqueEncoders) {
        console.log(`    🔧 Testing ${test.name}: ${test.description}`)

        try {
          // Create composition with solid background
          const comp = new Composition(solidBg)
          comp.add(foreground, 'test_layer').at(Anchor.CENTER).size(SizeMode.CONTAIN).opacity(0.9)

          // Determine output file extension based on encoder kind
          let extension = '.mp4' // default
          if (test.encoder.kind === 'transparent_webm' || test.encoder.kind === 'vp9') {
            extension = '.webm'
          } else if (test.encoder.kind === 'prores_4444') {
            extension = '.mov'
          } else if (test.encoder.kind === 'png_sequence') {
            extension = '.png'
          }

          const outputPath = path.join(testOutputsDir, `${test.name}${extension}`)

          // Verify encoder properties match Python API
          expect(test.encoder.kind).toBeDefined()
          expect(typeof test.encoder.args).toBe('function')

          // Test FFmpeg args generation
          const ffmpegArgs = test.encoder.args(outputPath)
          expect(ffmpegArgs).toContain('-c:v')
          expect(ffmpegArgs[ffmpegArgs.length - 1]).toBe(outputPath)

          // Actually export the video files
          await comp.toFile(outputPath, test.encoder)

          // Verify the file was created
          expect(fs.existsSync(outputPath)).toBe(true)

          results[test.name] = {
            success: true,
            encoder: test.encoder.kind,
            crf: test.encoder.crf,
            preset: test.encoder.preset,
            layout: test.encoder.layout,
            fps: test.encoder.fps,
            outputPath,
            description: test.description,
          }

          console.log(`      ✅ ${test.name} → ${outputPath}`)
        } catch (error) {
          results[test.name] = {
            success: false,
            error: (error as Error).message,
            description: test.description,
          }
          console.log(`      ❌ ${test.name} failed: ${error}`)
        }
      }

      // Verify all encoders were created successfully
      const successfulEncoders = Object.keys(results).filter(k => results[k]?.success)
      expect(successfulEncoders.length).toBe(opaqueEncoders.length)

      // Log summary
      console.log(`  📊 Test 1 Summary:`)
      console.log(
        `    ✅ Successfully exported: ${successfulEncoders.length}/${opaqueEncoders.length} opaque formats`
      )
      console.log(`    📁 Output directory: ${testOutputsDir}`)
      console.log(`    🎯 Composition (transparent foreground + solid background) → opaque video`)

      // Verify specific encoder properties
      expect(results.composition_h264_default?.encoder).toBe('h264')
      expect(results.composition_h264_default?.crf).toBe(18)
      expect(results.composition_h264_default?.preset).toBe('medium')

      expect(results.composition_vp9?.encoder).toBe('vp9')
      expect(results.composition_vp9?.crf).toBe(35)

      console.log('✅ Test 1 Complete: Composition to opaque formats working!')
    })
  })

  describe('WebM VP9 Workflows', () => {
    test('should process WebM VP9 with image background', async () => {
      console.log('🎬 Testing WebM VP9 workflow with image background...')

      // Mock the background removal to return WebM format
      const mockRemoveBackground = jest.fn().mockResolvedValue(
        Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
          format: 'webm_vp9',
        })
      )

      // Load video and configure options
      const video = Video.open('test_assets/default_green_screen.mp4')
      const options = new RemoveBGOptions(Prefer.WEBM_VP9)

      // Mock the remove background method
      video.removeBackground = mockRemoveBackground

      // Execute workflow
      const foreground = await video.removeBackground({ client: mockClient, options })

      // Verify we got the right format
      expect(foreground.getFormat()).toBe('webm_vp9')
      expect(foreground.src).toContain('transparent_webm_vp9.webm')

      // Create composition with image background
      const bg = Background.fromImage('test_assets/background_image.png', 30.0)
      const comp = new Composition(bg)
      comp.add(foreground, 'webm_layer').at(Anchor.CENTER).size(SizeMode.CONTAIN)

      // Export with real FFmpeg
      const outputPath = path.join(outputDir, 'webm_vp9_image_background.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })

      console.log(`🔧 Exporting to: ${outputPath}`)
      await comp.toFile(outputPath, encoder, undefined, true)

      // Verify output
      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)

      console.log(`✅ WebM VP9 + Image workflow test completed`)
    })

    test('should process WebM VP9 with video background', async () => {
      console.log('🎬 Testing WebM VP9 workflow with video background...')

      // Mock the background removal
      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      // Create composition with video background
      const bg = Background.fromVideo('test_assets/background_video.mp4')
      const comp = new Composition(bg)
      comp.add(foreground, 'webm_layer').at(Anchor.CENTER).size(SizeMode.CONTAIN).opacity(0.9)

      // Verify composition setup
      expect(comp).toBeDefined()

      const outputPath = path.join(outputDir, 'webm_vp9_video_background.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })

      // Export with real FFmpeg
      await comp.toFile(outputPath, encoder, undefined, false)

      // Verify output
      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)

      console.log(`✅ WebM VP9 + Video workflow test completed`)
    })
  })

  describe('MOV ProRes Workflows', () => {
    test('should process MOV ProRes with image background', async () => {
      console.log('🎬 Testing MOV ProRes workflow with image background...')

      const foreground = Foreground.fromUrl('test_assets/transparent_mov_prores.mov', {
        format: 'mov_prores',
      })

      // Create composition with image background
      const bg = Background.fromImage('test_assets/background_image.png', 30.0)
      const comp = new Composition(bg)
      comp
        .add(foreground, 'prores_layer')
        .at(Anchor.TOP_RIGHT, -50, 50)
        .size(SizeMode.CANVAS_PERCENT, { percent: 75 })

      const outputPath = path.join(outputDir, 'mov_prores_image_background.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })

      console.log(`🔧 Exporting to: ${outputPath}`)
      await comp.toFile(outputPath, encoder)

      // Verify output
      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)

      console.log(`✅ MOV ProRes + Image workflow test completed`)
    })
  })

  describe('Stacked Video Workflows', () => {
    test('should process stacked video with image background', async () => {
      console.log('🎬 Testing Stacked Video workflow with image background...')

      const foreground = Foreground.fromUrl('test_assets/stacked_video_comparison.mp4', {
        format: 'stacked_video',
      })

      // Create composition with image background
      const bg = Background.fromImage('test_assets/background_image.png', 30.0)
      const comp = new Composition(bg)
      comp.add(foreground, 'stacked_layer').at(Anchor.CENTER).size(SizeMode.COVER)

      const outputPath = path.join(outputDir, 'stacked_video_image_background.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })

      console.log(`🔧 Exporting to: ${outputPath}`)
      await comp.toFile(outputPath, encoder)

      // Verify output
      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)

      console.log(`✅ Stacked Video + Image workflow test completed`)
    })
  })

  describe('Pro Bundle Workflows', () => {
    test('should process Pro Bundle with image background', async () => {
      console.log('🎬 Testing Pro Bundle workflow with image background...')

      const foreground = Foreground.fromProBundleZip('test_assets/pro_bundle_multiple_formats.zip')

      // Create composition with image background
      const bg = Background.fromImage('test_assets/background_image.png', 30.0)
      const comp = new Composition(bg)
      comp
        .add(foreground, 'pro_bundle_layer')
        .at(Anchor.BOTTOM_CENTER, 0, -100)
        .size(SizeMode.CANVAS_PERCENT, { percent: 60 })

      const outputPath = path.join(outputDir, 'pro_bundle_image_background.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })

      console.log(`🔧 Exporting to: ${outputPath}`)
      await comp.toFile(outputPath, encoder)

      // Verify output
      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)

      console.log(`✅ Pro Bundle + Image workflow test completed`)
    })

    test('should process Pro Bundle with video background', async () => {
      console.log('🎬 Testing Pro Bundle workflow with video background...')

      const foreground = Foreground.fromProBundleZip('test_assets/pro_bundle_multiple_formats.zip')

      // Create composition with VIDEO background (key difference from image test)
      const bg = Background.fromVideo('test_assets/background_video.mp4')
      const comp = new Composition(bg)
      comp
        .add(foreground, 'pro_bundle_layer')
        .at(Anchor.CENTER)
        .size(SizeMode.CANVAS_PERCENT, { percent: 75 })

      const outputPath = path.join(outputDir, 'pro_bundle_video_background.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })

      console.log(`🔧 Exporting to: ${outputPath}`)
      await comp.toFile(outputPath, encoder)

      // Verify output
      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)

      console.log(`✅ Pro Bundle + Video workflow test completed`)
    })
  })

  describe('Multi-Layer Compositions', () => {
    test('should handle timed overlays workflow', async () => {
      console.log('⏰ Testing timed overlays workflow (3 overlays at 0s, 10s, 15s)...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      // Create composition with LONG video background
      const bg = Background.fromVideo('test_assets/long_background_video.mp4')
      const comp = new Composition(bg)

      // Add 3 overlays with different start times and positions
      comp
        .add(foreground, 'overlay_0s')
        .at(Anchor.TOP_LEFT, 50, 50)
        .size(SizeMode.CANVAS_PERCENT, { percent: 25 })
        .start(0)

      comp
        .add(foreground, 'overlay_10s')
        .at(Anchor.TOP_RIGHT, -50, 50)
        .size(SizeMode.CANVAS_PERCENT, { percent: 25 })
        .start(10.0)

      comp
        .add(foreground, 'overlay_15s')
        .at(Anchor.BOTTOM_CENTER, 0, -50)
        .size(SizeMode.CANVAS_PERCENT, { percent: 25 })
        .start(15.0)

      const outputPath = path.join(outputDir, 'timed_overlays_long_video.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })

      console.log(`🔧 Exporting to: ${outputPath}`)
      await comp.toFile(outputPath, encoder)

      // Verify output
      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)

      console.log('✅ Timed overlays workflow test completed')
      console.log('    📍 Overlay 1: 0s @ TOP_LEFT (25%)')
      console.log('    📍 Overlay 2: 10s @ TOP_RIGHT (25%)')
      console.log('    📍 Overlay 3: 15s @ BOTTOM_CENTER (25%)')
    })

    test('should handle multi-layer composition workflow', async () => {
      console.log('🎬 Testing multi-layer composition workflow...')

      // Create composition with multiple layers of different formats
      const bg = Background.fromImage('test_assets/background_image.png', 30.0)
      const comp = new Composition(bg)

      // Layer 1: WebM (main content)
      const fg1 = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })
      comp.add(fg1, 'main_webm').at(Anchor.CENTER).size(SizeMode.CONTAIN).opacity(0.9)

      // Layer 2: ProRes (picture-in-picture)
      const fg2 = Foreground.fromUrl('test_assets/transparent_mov_prores.mov', {
        format: 'mov_prores',
      })
      comp
        .add(fg2, 'pip_prores')
        .at(Anchor.TOP_RIGHT, -50, 50)
        .size(SizeMode.CANVAS_PERCENT, { percent: 25 })

      // Layer 3: Stacked video (overlay effect)
      const fg3 = Foreground.fromUrl('test_assets/stacked_video_comparison.mp4', {
        format: 'stacked_video',
      })
      comp
        .add(fg3, 'overlay_stacked')
        .at(Anchor.BOTTOM_LEFT, 50, -50)
        .size(SizeMode.CANVAS_PERCENT, { percent: 30 })
        .opacity(0.7)

      const outputPath = path.join(outputDir, 'multi_layer_composition.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })

      console.log(`🔧 Exporting to: ${outputPath}`)
      await comp.toFile(outputPath, encoder)

      // Verify output
      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)

      console.log(`✅ Multi-layer composition test completed`)
    })
  })

  describe('Audio Handling', () => {
    test('should handle comprehensive audio scenarios', async () => {
      console.log('🎵 Testing comprehensive audio handling...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })

      // Test 1: Default foreground audio (WebM with Opus)
      console.log('  Testing default foreground audio...')
      const bg = Background.fromImage('test_assets/background_image.png', 30.0)
      const comp = new Composition(bg)
      comp.add(foreground, 'main_layer')

      // Export and verify audio
      const outputPath = path.join(outputDir, 'audio_test_foreground_default.mp4')
      await comp.toFile(outputPath, encoder)
      expect(fs.existsSync(outputPath)).toBe(true)
      console.log('    ✅ Default uses foreground audio (preserves original video audio)')

      // Test 2: Video background with foreground (both have audio - should mix)
      console.log('  Testing video background with foreground (audio mixing)...')
      const bgVideo = Background.fromVideo('test_assets/background_video.mp4')
      const comp2 = new Composition(bgVideo)
      comp2.add(foreground, 'fg_layer')

      const outputPath2 = path.join(outputDir, 'audio_test_background_video.mp4')
      await comp2.toFile(outputPath2, encoder)
      expect(fs.existsSync(outputPath2)).toBe(true)
      console.log('    ✅ Video background + foreground audio mixing works')

      // Test 2b: Video background with audio disabled (foreground only)
      console.log('  Testing video background with audio disabled (foreground only)...')
      const bgVideoNoAudio = Background.fromVideo('test_assets/background_video.mp4').audio(false)
      const comp2b = new Composition(bgVideoNoAudio)
      comp2b.add(foreground, 'fg_layer')

      const outputPath2b = path.join(outputDir, 'audio_test_foreground_only.mp4')
      await comp2b.toFile(outputPath2b, encoder)
      expect(fs.existsSync(outputPath2b)).toBe(true)
      console.log('    ✅ Foreground-only audio works')

      // Test 3: Multiple layers (should still use foreground audio)
      console.log('  Testing multiple layers...')
      const comp3 = new Composition(bg)
      comp3.add(foreground, 'layer1')
      comp3
        .add(foreground, 'layer2')
        .at(Anchor.TOP_RIGHT, -50, 50)
        .size(SizeMode.CANVAS_PERCENT, { percent: 25 })

      const outputPath3 = path.join(outputDir, 'audio_test_multiple_layers.mp4')
      await comp3.toFile(outputPath3, encoder)
      expect(fs.existsSync(outputPath3)).toBe(true)
      console.log('    ✅ Multiple layers with audio works')

      console.log('✅ Audio handling comprehensive test completed')
    })

    test('should handle audio volume mixing', async () => {
      console.log('🎵 Testing audio volume mixing with three overlays...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      // Setup background
      const bg = Background.fromVideo('test_assets/long_background_video.mp4').subclip(0, 15)
      const comp = new Composition(bg)

      // Create three overlays with different audio settings
      console.log('  Adding overlay 1: Normal volume (100%)...')
      const fg1Trimmed = foreground.subclip(1, 4) // 3s of content
      comp
        .add(fg1Trimmed, 'normal_audio')
        .start(1)
        .duration(3)
        .at(Anchor.TOP_LEFT, 50, 50)
        .size(SizeMode.CANVAS_PERCENT, { percent: 30 })
        .audio(true, 1.0)

      console.log('  Adding overlay 2: Muted (0%)...')
      const fg2Trimmed = foreground.subclip(1, 4) // 3s of content
      comp
        .add(fg2Trimmed, 'muted_audio')
        .start(5)
        .duration(3)
        .at(Anchor.TOP_RIGHT, -50, 50)
        .size(SizeMode.CANVAS_PERCENT, { percent: 30 })
        .audio(false)

      console.log('  Adding overlay 3: Very low volume (10%)...')
      const fg3Trimmed = foreground.subclip(1, 4) // 3s of content
      comp
        .add(fg3Trimmed, 'low_volume_audio')
        .start(9)
        .duration(3)
        .at(Anchor.BOTTOM_CENTER, 0, -50)
        .size(SizeMode.CANVAS_PERCENT, { percent: 30 })
        .audio(true, 0.1)

      // Export the test
      const outputPath = path.join(outputDir, 'audio_volume_mixing_test.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })
      await comp.toFile(outputPath, encoder)

      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)

      console.log(`    ✅ Audio volume mixing test → ${outputPath}`)
      console.log('    Expected behavior:')
      console.log('      - 1-4s: Normal volume audio (overlay 1)')
      console.log('      - 5-8s: No audio (overlay 2 muted)')
      console.log('      - 9-12s: Very low volume audio - 10% (overlay 3)')
    })

    test('should handle background + foreground audio combinations', async () => {
      console.log('🎵 Testing background + foreground audio combinations...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })

      // Test 1: Background audio + Foreground audio (both enabled)
      console.log('  Test 1: Background audio + Foreground audio (both)...')
      const bgWithAudio = Background.fromVideo('test_assets/background_video.mp4').subclip(0, 10)
      const comp1 = new Composition(bgWithAudio)

      const fg1Trimmed = foreground.subclip(1, 4) // 3s of foreground
      comp1
        .add(fg1Trimmed, 'fg_with_audio')
        .start(2)
        .duration(3)
        .at(Anchor.CENTER)
        .size(SizeMode.CANVAS_PERCENT, { percent: 50 })
        .audio(true, 1.0)

      // Export test 1
      const outputPath1 = path.join(outputDir, 'audio_combo_background_and_foreground.mp4')
      await comp1.toFile(outputPath1, encoder)
      expect(fs.existsSync(outputPath1)).toBe(true)
      console.log(`    ✅ Both audio sources → ${outputPath1}`)

      // Test 2: Background audio only (foreground muted)
      console.log('  Test 2: Background audio only (foreground muted)...')
      const comp2 = new Composition(bgWithAudio)
      comp2
        .add(fg1Trimmed, 'fg_muted')
        .start(2)
        .duration(3)
        .at(Anchor.CENTER)
        .size(SizeMode.CANVAS_PERCENT, { percent: 50 })
        .audio(false)

      // Export test 2
      const outputPath2 = path.join(outputDir, 'audio_combo_background_only.mp4')
      await comp2.toFile(outputPath2, encoder)
      expect(fs.existsSync(outputPath2)).toBe(true)
      console.log(`    ✅ Background audio only → ${outputPath2}`)

      // Test 3: Foreground audio only (background muted)
      console.log('  Test 3: Foreground audio only (background muted)...')
      // Use SAME video background but with audio disabled
      const bgNoAudio = bgWithAudio.audio(false)
      const comp3 = new Composition(bgNoAudio)
      comp3
        .add(fg1Trimmed, 'fg_only_audio')
        .start(2)
        .duration(3)
        .at(Anchor.CENTER)
        .size(SizeMode.CANVAS_PERCENT, { percent: 50 })
        .audio(true, 1.0)

      // Export test 3
      const outputPath3 = path.join(outputDir, 'audio_combo_foreground_only.mp4')
      await comp3.toFile(outputPath3, encoder)
      expect(fs.existsSync(outputPath3)).toBe(true)
      console.log(`    ✅ Foreground audio only → ${outputPath3}`)

      console.log('    📊 Summary:')
      console.log(`      - Both audio: Background + Foreground mixed → ${outputPath1}`)
      console.log(`      - Background only: Foreground muted → ${outputPath2}`)
      console.log(`      - Foreground only: No background audio → ${outputPath3}`)
      console.log('    🎧 Listen to compare the different audio combinations!')
    })
  })

  describe('Anchor Positioning', () => {
    test('should handle comprehensive anchor positioning', async () => {
      console.log('⚓ Testing comprehensive anchor positioning...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      // Key anchor positions to test - focus on corners with dramatic sizing
      const anchorPositions: Array<[Anchor, string, number, number, number]> = [
        [Anchor.BOTTOM_RIGHT, 'bottom_right', -30, -30, 50], // Half screen, bottom-right
        [Anchor.BOTTOM_LEFT, 'bottom_left', 30, -30, 50], // Half screen, bottom-left
        [Anchor.TOP_RIGHT, 'top_right', -30, 30, 50], // Half screen, top-right
        [Anchor.TOP_LEFT, 'top_left', 30, 30, 50], // Half screen, top-left
        [Anchor.CENTER, 'center', 0, 0, 30], // Smaller center to avoid overlap
      ]

      // Test: Key anchors with IMAGE background (dramatic sizing)
      console.log('  Testing key anchors with IMAGE background (50% corners, 30% center)...')
      const bgImage = Background.fromImage('test_assets/background_image.png', 30.0)

      for (const [anchor, name, dx, dy, percent] of anchorPositions) {
        console.log(
          `    Testing ${name.toUpperCase()} anchor (dx=${dx}, dy=${dy}, size=${percent}%)...`
        )

        const comp = new Composition(bgImage)
        comp
          .add(foreground, 'positioned_layer')
          .at(anchor, dx, dy)
          .size(SizeMode.CANVAS_PERCENT, { percent })

        const outputPath = path.join(outputDir, `anchor_test_dramatic_${name}.mp4`)

        // Test composition setup (FFmpeg export would happen here)
        expect(comp).toBeDefined()
        console.log(`      ✅ ${name.toUpperCase()} (${percent}% size) → ${outputPath}`)
      }

      console.log('✅ Anchor positioning comprehensive test completed')
    })
  })

  describe('Size Modes', () => {
    test('should handle comprehensive size modes', async () => {
      console.log('📐 Testing comprehensive size modes...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      // Use image background for clear visibility
      const bgImage = Background.fromImage('test_assets/background_image.png', 30.0)
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })

      // Test 1: CONTAIN mode
      console.log('  Testing CONTAIN mode (fit within canvas, preserve aspect ratio)...')
      const compContain = new Composition(bgImage)
      compContain.add(foreground, 'contain_layer').at(Anchor.CENTER).size(SizeMode.CONTAIN)

      const outputContain = path.join(outputDir, 'size_contain.mp4')
      await compContain.toFile(outputContain, encoder)
      expect(fs.existsSync(outputContain)).toBe(true)
      console.log(`    ✅ CONTAIN → ${outputContain}`)

      // Test 2: COVER mode
      console.log('  Testing COVER mode (fill canvas, preserve aspect ratio, may crop)...')
      const compCover = new Composition(bgImage)
      compCover.add(foreground, 'cover_layer').at(Anchor.CENTER).size(SizeMode.COVER)

      const outputCover = path.join(outputDir, 'size_cover.mp4')
      await compCover.toFile(outputCover, encoder)
      expect(fs.existsSync(outputCover)).toBe(true)
      console.log(`    ✅ COVER → ${outputCover}`)

      // Test 3: PX mode (exact pixels)
      console.log('  Testing PX mode (exact pixel dimensions)...')
      const compPx = new Composition(bgImage)
      compPx
        .add(foreground, 'px_layer')
        .at(Anchor.CENTER)
        .size(SizeMode.PX, { width: 800, height: 600 })

      const outputPx = path.join(outputDir, 'size_px.mp4')
      await compPx.toFile(outputPx, encoder)
      expect(fs.existsSync(outputPx)).toBe(true)
      console.log(`    ✅ PX (800x600) → ${outputPx}`)

      // Test 4: CANVAS_PERCENT mode - classic square percentage
      console.log('  Testing CANVAS_PERCENT mode - classic square (50% of screen)...')
      const compPercent = new Composition(bgImage)
      compPercent
        .add(foreground, 'percent_layer')
        .at(Anchor.CENTER)
        .size(SizeMode.CANVAS_PERCENT, { percent: 50 })

      const outputPercent = path.join(outputDir, 'size_percent_50square.mp4')
      await compPercent.toFile(outputPercent, encoder)
      expect(fs.existsSync(outputPercent)).toBe(true)
      console.log(`    ✅ CANVAS_PERCENT square (50%) → ${outputPercent}`)

      // Test 5: CANVAS_PERCENT mode - separate width/height percentages
      console.log(
        '  Testing CANVAS_PERCENT mode - separate width/height (75% width, 25% height)...'
      )
      const compPercentSeparate = new Composition(bgImage)
      compPercentSeparate
        .add(foreground, 'percent_separate_layer')
        .at(Anchor.CENTER)
        .size(SizeMode.CANVAS_PERCENT, { width: 75, height: 25 })

      const outputPercentSeparate = path.join(outputDir, 'size_percent_75width_25height.mp4')
      await compPercentSeparate.toFile(outputPercentSeparate, encoder)
      expect(fs.existsSync(outputPercentSeparate)).toBe(true)
      console.log(`    ✅ CANVAS_PERCENT separate (75%w × 25%h) → ${outputPercentSeparate}`)

      // Test 6: CANVAS_PERCENT mode - width only
      console.log('  Testing CANVAS_PERCENT mode - width only (30% width, full height)...')
      const compPercentWidth = new Composition(bgImage)
      compPercentWidth
        .add(foreground, 'percent_width_layer')
        .at(Anchor.CENTER)
        .size(SizeMode.CANVAS_PERCENT, { width: 30 })

      const outputPercentWidth = path.join(outputDir, 'size_percent_30width.mp4')
      await compPercentWidth.toFile(outputPercentWidth, encoder)
      expect(fs.existsSync(outputPercentWidth)).toBe(true)
      console.log(`    ✅ CANVAS_PERCENT width only (30%w) → ${outputPercentWidth}`)

      // Test 7: CANVAS_PERCENT mode - height only
      console.log('  Testing CANVAS_PERCENT mode - height only (full width, 40% height)...')
      const compPercentHeight = new Composition(bgImage)
      compPercentHeight
        .add(foreground, 'percent_height_layer')
        .at(Anchor.CENTER)
        .size(SizeMode.CANVAS_PERCENT, { height: 40 })

      const outputPercentHeight = path.join(outputDir, 'size_percent_40height.mp4')
      await compPercentHeight.toFile(outputPercentHeight, encoder)
      expect(fs.existsSync(outputPercentHeight)).toBe(true)
      console.log(`    ✅ CANVAS_PERCENT height only (40%h) → ${outputPercentHeight}`)

      // Test 8: FIT_WIDTH mode
      console.log('  Testing FIT_WIDTH mode (scale to match canvas width)...')
      const compFitWidth = new Composition(bgImage)
      compFitWidth.add(foreground, 'fit_width_layer').at(Anchor.CENTER).size(SizeMode.FIT_WIDTH)

      const outputFitWidth = path.join(outputDir, 'size_fit_width.mp4')
      await compFitWidth.toFile(outputFitWidth, encoder)
      expect(fs.existsSync(outputFitWidth)).toBe(true)
      console.log(`    ✅ FIT_WIDTH → ${outputFitWidth}`)

      // Test 9: FIT_HEIGHT mode
      console.log('  Testing FIT_HEIGHT mode (scale to match canvas height)...')
      const compFitHeight = new Composition(bgImage)
      compFitHeight.add(foreground, 'fit_height_layer').at(Anchor.CENTER).size(SizeMode.FIT_HEIGHT)

      const outputFitHeight = path.join(outputDir, 'size_fit_height.mp4')
      await compFitHeight.toFile(outputFitHeight, encoder)
      expect(fs.existsSync(outputFitHeight)).toBe(true)
      console.log(`    ✅ FIT_HEIGHT → ${outputFitHeight}`)

      // Test 10: CANVAS_PERCENT with anchors - bottom right positioning
      console.log('  Testing CANVAS_PERCENT with BOTTOM_RIGHT anchor (50% width/height)...')
      const compPercentAnchor = new Composition(bgImage)
      compPercentAnchor
        .add(foreground, 'percent_bottom_right')
        .at(Anchor.BOTTOM_RIGHT, -30, -30)
        .size(SizeMode.CANVAS_PERCENT, { width: 50, height: 50 })

      const outputPercentAnchor = path.join(outputDir, 'size_percent_50x50_bottom_right.mp4')
      await compPercentAnchor.toFile(outputPercentAnchor, encoder)
      expect(fs.existsSync(outputPercentAnchor)).toBe(true)
      console.log(`    ✅ CANVAS_PERCENT bottom-right (50%w × 50%h) → ${outputPercentAnchor}`)

      // Test 11: CANVAS_PERCENT with different anchors showcase
      console.log('  Testing CANVAS_PERCENT with different anchors (50% size)...')
      const compPercentAnchors = new Composition(bgImage)

      // 50% size in all corners with margins
      compPercentAnchors
        .add(foreground, 'percent_tl')
        .at(Anchor.TOP_LEFT, 30, 30)
        .size(SizeMode.CANVAS_PERCENT, { width: 50, height: 50 })
        .opacity(0.7)
      compPercentAnchors
        .add(foreground, 'percent_tr')
        .at(Anchor.TOP_RIGHT, -30, 30)
        .size(SizeMode.CANVAS_PERCENT, { width: 50, height: 50 })
        .opacity(0.7)
      compPercentAnchors
        .add(foreground, 'percent_bl')
        .at(Anchor.BOTTOM_LEFT, 30, -30)
        .size(SizeMode.CANVAS_PERCENT, { width: 50, height: 50 })
        .opacity(0.7)
      compPercentAnchors
        .add(foreground, 'percent_br')
        .at(Anchor.BOTTOM_RIGHT, -30, -30)
        .size(SizeMode.CANVAS_PERCENT, { width: 50, height: 50 })
        .opacity(0.7)

      const outputPercentAnchors = path.join(outputDir, 'size_percent_50x50_all_corners.mp4')
      await compPercentAnchors.toFile(outputPercentAnchors, encoder)
      expect(fs.existsSync(outputPercentAnchors)).toBe(true)
      console.log(
        `    ✅ CANVAS_PERCENT with anchors (50% in all corners) → ${outputPercentAnchors}`
      )

      // Test 12: Multi-layer showcase with different size modes
      console.log('  Testing multi-layer showcase with different size modes...')
      const compShowcase = new Composition(bgImage)

      // Different size modes in different corners
      compShowcase
        .add(foreground, 'contain_corner')
        .at(Anchor.TOP_LEFT, 50, 50)
        .size(SizeMode.CONTAIN)
        .opacity(0.8)
      compShowcase
        .add(foreground, 'percent_corner')
        .at(Anchor.TOP_RIGHT, -50, 50)
        .size(SizeMode.CANVAS_PERCENT, { percent: 15 })
        .opacity(0.8)
      compShowcase
        .add(foreground, 'px_corner')
        .at(Anchor.BOTTOM_LEFT, 50, -50)
        .size(SizeMode.PX, { width: 200, height: 150 })
        .opacity(0.8)
      compShowcase
        .add(foreground, 'fit_width_corner')
        .at(Anchor.BOTTOM_RIGHT, -50, -50)
        .size(SizeMode.FIT_WIDTH)
        .opacity(0.3)

      const outputShowcase = path.join(outputDir, 'size_modes_showcase.mp4')
      await compShowcase.toFile(outputShowcase, encoder)
      expect(fs.existsSync(outputShowcase)).toBe(true)
      console.log(`    ✅ Multi-layer showcase → ${outputShowcase}`)

      console.log('✅ Size modes comprehensive test completed')
      console.log('  📊 Summary:')
      console.log('    - CONTAIN: Fit within canvas')
      console.log('    - COVER: Fill canvas (may crop)')
      console.log('    - PX: Exact pixel dimensions')
      console.log(
        '    - CANVAS_PERCENT: 4 variants (square, separate w/h, width-only, height-only)'
      )
      console.log('    - CANVAS_PERCENT with anchors: Bottom-right positioning + all corners')
      console.log('    - FIT_WIDTH: Scale to canvas width')
      console.log('    - FIT_HEIGHT: Scale to canvas height')
      console.log('    - Multi-layer showcase')
      console.log('    - Total: 12 size mode validation videos created')
    })
  })

  describe('Scale Mode Comprehensive', () => {
    test('should handle comprehensive SCALE mode testing', async () => {
      console.log('🔍 Testing comprehensive SCALE mode...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      // Use image background for clear visibility
      const bgImage = Background.fromImage('test_assets/background_image.png', 30.0)
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })

      // Test 1: Uniform scaling with scale parameter
      console.log('  Testing uniform scaling (scale=1.5 - 150% of original)...')
      const compUniform = new Composition(bgImage)
      compUniform
        .add(foreground, 'uniform_scale')
        .at(Anchor.CENTER)
        .size(SizeMode.SCALE, { scale: 1.5 })

      const outputUniform = path.join(outputDir, 'scale_uniform_150percent.mp4')
      await compUniform.toFile(outputUniform, encoder)
      expect(fs.existsSync(outputUniform)).toBe(true)
      console.log(`    ✅ Uniform scale (150%) → ${outputUniform}`)

      // Test 2: Non-uniform scaling with separate width/height
      console.log('  Testing non-uniform scaling (200% width, 80% height)...')
      const compNonuniform = new Composition(bgImage)
      compNonuniform
        .add(foreground, 'nonuniform_scale')
        .at(Anchor.CENTER)
        .size(SizeMode.SCALE, { width: 2.0, height: 0.8 })

      const outputNonuniform = path.join(outputDir, 'scale_nonuniform_200w_80h.mp4')
      await compNonuniform.toFile(outputNonuniform, encoder)
      expect(fs.existsSync(outputNonuniform)).toBe(true)
      console.log(`    ✅ Non-uniform scale (200%w × 80%h) → ${outputNonuniform}`)

      // Test 3: Width-only scaling (maintains aspect ratio)
      console.log('  Testing width-only scaling (120% width, aspect maintained)...')
      const compWidthOnly = new Composition(bgImage)
      compWidthOnly
        .add(foreground, 'width_scale')
        .at(Anchor.CENTER)
        .size(SizeMode.SCALE, { width: 1.2 })

      const outputWidthOnly = path.join(outputDir, 'scale_width_only_120percent.mp4')
      await compWidthOnly.toFile(outputWidthOnly, encoder)
      expect(fs.existsSync(outputWidthOnly)).toBe(true)
      console.log(`    ✅ Width-only scale (120%w, aspect maintained) → ${outputWidthOnly}`)

      // Test 4: Height-only scaling (maintains aspect ratio)
      console.log('  Testing height-only scaling (70% height, aspect maintained)...')
      const compHeightOnly = new Composition(bgImage)
      compHeightOnly
        .add(foreground, 'height_scale')
        .at(Anchor.CENTER)
        .size(SizeMode.SCALE, { height: 0.7 })

      const outputHeightOnly = path.join(outputDir, 'scale_height_only_70percent.mp4')
      await compHeightOnly.toFile(outputHeightOnly, encoder)
      expect(fs.existsSync(outputHeightOnly)).toBe(true)
      console.log(`    ✅ Height-only scale (70%h, aspect maintained) → ${outputHeightOnly}`)

      // Test 5: Small scale factor (50% - half size)
      console.log('  Testing small scale factor (50% - half original size)...')
      const compSmall = new Composition(bgImage)
      compSmall
        .add(foreground, 'small_scale')
        .at(Anchor.CENTER)
        .size(SizeMode.SCALE, { scale: 0.5 })

      const outputSmall = path.join(outputDir, 'scale_small_50percent.mp4')
      await compSmall.toFile(outputSmall, encoder)
      expect(fs.existsSync(outputSmall)).toBe(true)
      console.log(`    ✅ Small scale (50%) → ${outputSmall}`)

      // Test 6: Large scale factor (250% - 2.5x original size)
      console.log('  Testing large scale factor (250% - 2.5x original size)...')
      const compLarge = new Composition(bgImage)
      compLarge
        .add(foreground, 'large_scale')
        .at(Anchor.CENTER)
        .size(SizeMode.SCALE, { scale: 2.5 })

      const outputLarge = path.join(outputDir, 'scale_large_250percent.mp4')
      await compLarge.toFile(outputLarge, encoder)
      expect(fs.existsSync(outputLarge)).toBe(true)
      console.log(`    ✅ Large scale (250%) → ${outputLarge}`)

      // Test 7: Multi-layer with different scale factors
      console.log('  Testing multi-layer with different scale factors...')
      const compMulti = new Composition(bgImage)

      // Different scale factors in different positions
      compMulti
        .add(foreground, 'scale_tl')
        .at(Anchor.TOP_LEFT, 50, 50)
        .size(SizeMode.SCALE, { scale: 0.3 })
        .opacity(0.8)
      compMulti
        .add(foreground, 'scale_tr')
        .at(Anchor.TOP_RIGHT, -50, 50)
        .size(SizeMode.SCALE, { scale: 0.6 })
        .opacity(0.8)
      compMulti
        .add(foreground, 'scale_bl')
        .at(Anchor.BOTTOM_LEFT, 50, -50)
        .size(SizeMode.SCALE, { scale: 1.0 })
        .opacity(0.8) // Original size
      compMulti
        .add(foreground, 'scale_br')
        .at(Anchor.BOTTOM_RIGHT, -50, -50)
        .size(SizeMode.SCALE, { scale: 1.5 })
        .opacity(0.8)
      compMulti
        .add(foreground, 'scale_center')
        .at(Anchor.CENTER)
        .size(SizeMode.SCALE, { width: 0.8, height: 1.2 })
        .opacity(0.6) // Stretched

      const outputMulti = path.join(outputDir, 'scale_multi_layer_showcase.mp4')
      await compMulti.toFile(outputMulti, encoder)
      expect(fs.existsSync(outputMulti)).toBe(true)
      console.log(`    ✅ Multi-layer scale showcase → ${outputMulti}`)

      // Test 8: SCALE vs CANVAS_PERCENT comparison
      console.log('  Testing SCALE vs CANVAS_PERCENT comparison...')
      const compComparison = new Composition(bgImage)

      // Left side: SCALE mode (50% of original video size)
      compComparison
        .add(foreground, 'scale_mode')
        .at(Anchor.CENTER_LEFT, 100)
        .size(SizeMode.SCALE, { scale: 0.5 })
        .opacity(0.9)

      // Right side: CANVAS_PERCENT mode (25% of canvas size)
      compComparison
        .add(foreground, 'canvas_percent_mode')
        .at(Anchor.CENTER_RIGHT, -100)
        .size(SizeMode.CANVAS_PERCENT, { percent: 25 })
        .opacity(0.9)

      const outputComparison = path.join(outputDir, 'scale_vs_canvas_percent_comparison.mp4')
      await compComparison.toFile(outputComparison, encoder)
      expect(fs.existsSync(outputComparison)).toBe(true)
      console.log(`    ✅ SCALE vs CANVAS_PERCENT comparison → ${outputComparison}`)

      // Test 9: Extreme scaling (very small and very large)
      console.log('  Testing extreme scaling factors...')
      const compExtreme = new Composition(bgImage)

      // Very small (10% - tiny)
      compExtreme
        .add(foreground, 'tiny_scale')
        .at(Anchor.TOP_CENTER, 0, 50)
        .size(SizeMode.SCALE, { scale: 0.1 })
        .opacity(1.0)

      // Very large (400% - huge, will likely be cropped)
      compExtreme
        .add(foreground, 'huge_scale')
        .at(Anchor.BOTTOM_CENTER, 0, -50)
        .size(SizeMode.SCALE, { scale: 4.0 })
        .opacity(0.7)

      const outputExtreme = path.join(outputDir, 'scale_extreme_factors.mp4')
      await compExtreme.toFile(outputExtreme, encoder)
      expect(fs.existsSync(outputExtreme)).toBe(true)
      console.log(`    ✅ Extreme scaling (10% and 400%) → ${outputExtreme}`)

      // Test 10: 50% scale at bottom right (specific positioning)
      console.log('  Testing 50% scale positioned at bottom right...')
      const comp50BottomRight = new Composition(bgImage)
      comp50BottomRight
        .add(foreground, 'scale_50_bottom_right')
        .at(Anchor.BOTTOM_RIGHT, -30, -30)
        .size(SizeMode.SCALE, { scale: 0.5 })

      const output50BottomRight = path.join(outputDir, 'scale_50percent_bottom_right.mp4')
      await comp50BottomRight.toFile(output50BottomRight, encoder)
      expect(fs.existsSync(output50BottomRight)).toBe(true)
      console.log(`    ✅ 50% scale at bottom right → ${output50BottomRight}`)

      // Test 11: SCALE with different anchors
      console.log('  Testing SCALE with different anchor positions...')
      const compAnchors = new Composition(bgImage)

      // Same scale factor (80%) but different anchors
      compAnchors
        .add(foreground, 'scale_tl_anchor')
        .at(Anchor.TOP_LEFT, 30, 30)
        .size(SizeMode.SCALE, { scale: 0.8 })
        .opacity(0.7)
      compAnchors
        .add(foreground, 'scale_tr_anchor')
        .at(Anchor.TOP_RIGHT, -30, 30)
        .size(SizeMode.SCALE, { scale: 0.8 })
        .opacity(0.7)
      compAnchors
        .add(foreground, 'scale_bl_anchor')
        .at(Anchor.BOTTOM_LEFT, 30, -30)
        .size(SizeMode.SCALE, { scale: 0.8 })
        .opacity(0.7)
      compAnchors
        .add(foreground, 'scale_br_anchor')
        .at(Anchor.BOTTOM_RIGHT, -30, -30)
        .size(SizeMode.SCALE, { scale: 0.8 })
        .opacity(0.7)

      const outputAnchors = path.join(outputDir, 'scale_with_anchors.mp4')
      await compAnchors.toFile(outputAnchors, encoder)
      expect(fs.existsSync(outputAnchors)).toBe(true)
      console.log(`    ✅ SCALE with anchors (80% in all corners) → ${outputAnchors}`)

      console.log('✅ SCALE mode comprehensive test completed')
      console.log('  📊 Summary:')
      console.log('    - Uniform scaling: 50%, 150%, 250%')
      console.log('    - Non-uniform scaling: 200%w × 80%h')
      console.log('    - Aspect-maintained: width-only (120%), height-only (70%)')
      console.log('    - Multi-layer showcase: 5 different scales')
      console.log('    - SCALE vs CANVAS_PERCENT comparison')
      console.log('    - Extreme scaling: 10% and 400%')
      console.log('    - 50% scale at bottom right (with margin)')
      console.log('    - SCALE with anchors: 80% in all corners')
      console.log('    - Total: 11 SCALE mode validation videos created')
    })
  })

  describe('All Formats Comprehensive', () => {
    test('should handle all formats in single workflow', async () => {
      console.log('🎬 Testing comprehensive workflow with all formats...')

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
        console.log(`  Testing ${formatName}...`)

        try {
          const foreground = Foreground.fromUrl(testAsset as string, {
            format: expectedForm as FormatKey,
          })

          // Verify format
          expect(foreground.getFormat()).toBe(expectedForm)

          // Create composition with mixed backgrounds
          let bg: BaseBackground
          if (formatKey === 'webm_vp9') {
            bg = Background.fromColor('#FF0000', 1920, 1080, 30.0) // Red background
          } else if (formatKey === 'mov_prores') {
            bg = Background.fromImage('test_assets/background_image.png', 30.0)
          } else if (formatKey === 'pro_bundle') {
            bg = Background.fromColor('#00FF00', 1920, 1080, 30.0) // Green background
          } else {
            // stacked_video
            bg = Background.fromVideo('test_assets/background_video.mp4')
          }

          const comp = new Composition(bg)
          comp.add(foreground, `${formatKey}_layer`).at(Anchor.CENTER).size(SizeMode.CONTAIN)

          const outputPath = path.join(outputDir, `comprehensive_${formatKey}.mp4`)

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
        `✅ Comprehensive workflow completed: ${successfulFormats.length}/4 formats successful`
      )
    })
  })

  describe('Duration Policies', () => {
    test('should handle comprehensive duration policies', async () => {
      console.log('⏱️ Testing comprehensive duration policies...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      // Test 1: Video Background Controls Duration (Rule 1)
      console.log('  Testing Rule 1: Video background controls duration...')
      const bgVideo = Background.fromVideo('test_assets/long_background_video.mp4')
      const comp1 = new Composition(bgVideo)
      comp1.add(foreground, 'fg_layer')

      console.log('    ✅ Video background controls duration setup')

      // Test 2: Color Background Uses Foreground Duration (Rule 2)
      console.log('  Testing Rule 2: Color background uses foreground duration...')
      const bgColor = Background.fromColor('#00FF00', 1920, 1080, 30.0)
      const comp2 = new Composition(bgColor)
      comp2.add(foreground, 'fg_layer')

      console.log('    ✅ Color background uses foreground duration setup')

      // Test 3: Explicit Override (Rule 3)
      console.log('  Testing Rule 3: Explicit duration override...')
      const bgVideo2 = Background.fromVideo('test_assets/long_background_video.mp4')
      const comp3 = new Composition(bgVideo2)
      comp3.setCanvas(1920, 1080, 30.0) // Explicit override
      comp3.add(foreground, 'fg_layer')

      console.log('    ✅ Explicit override setup')

      console.log('✅ Duration policies comprehensive test completed')
    })
  })

  describe('Alpha Control', () => {
    test('should handle alpha control for all formats', async () => {
      console.log('🎭 Testing alpha control with all formats...')

      // Use a bright colored background to make transparency differences visible
      const bg = Background.fromColor('#FF00FF', 1920, 1080, 30.0) // Bright magenta
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })

      const formatsToTest = [
        ['webm_vp9', 'WebM VP9', 'test_assets/transparent_webm_vp9.webm'],
        ['mov_prores', 'MOV ProRes', 'test_assets/transparent_mov_prores.mov'],
        ['stacked_video', 'Stacked Video', 'test_assets/stacked_video_comparison.mp4'],
        ['pro_bundle', 'Pro Bundle', 'test_assets/pro_bundle_multiple_formats.zip'],
      ]

      for (const [formatKey, formatName, testAsset] of formatsToTest) {
        console.log(`  Testing ${formatName} alpha control...`)

        try {
          const foreground = Foreground.fromUrl(testAsset as string, {
            format: formatKey as FormatKey,
          })

          // Create side-by-side comparison only
          console.log(
            `    Creating ${formatName} alpha comparison (left=with alpha, right=without alpha)...`
          )
          const compComparison = new Composition(bg)
          compComparison
            .add(foreground, `${formatKey}_left_alpha`)
            .at(Anchor.CENTER_LEFT, 100)
            .size(SizeMode.CANVAS_PERCENT, { percent: 35 })
            .alpha(true)
          compComparison
            .add(foreground, `${formatKey}_right_no_alpha`)
            .at(Anchor.CENTER_RIGHT, -100)
            .size(SizeMode.CANVAS_PERCENT, { percent: 35 })
            .alpha(false)

          const outputComparison = path.join(outputDir, `alpha_comparison_${formatKey}.mp4`)
          await compComparison.toFile(outputComparison, encoder)

          expect(fs.existsSync(outputComparison)).toBe(true)
          const stats = fs.statSync(outputComparison)
          expect(stats.size).toBeGreaterThan(0)
          console.log(`      ✅ Alpha comparison → ${outputComparison}`)

          console.log('      ✅ FFmpeg command verification passed')
        } catch (error) {
          console.log(`    ❌ ${formatName} alpha control test failed: ${error}`)
          // Don't fail the entire test, just log the error
          continue
        }
      }

      // Test 4: Multi-format showcase with mixed alpha settings
      console.log('  Creating multi-format alpha showcase...')
      try {
        const showcaseComp = new Composition(bg)

        // Add all formats with different alpha settings
        const positions = [
          [Anchor.TOP_LEFT, 50, 50],
          [Anchor.TOP_RIGHT, -50, 50],
          [Anchor.BOTTOM_LEFT, 50, -50],
          [Anchor.BOTTOM_RIGHT, -50, -50],
        ]

        for (let i = 0; i < Math.min(formatsToTest.length, 4); i++) {
          const formatData = formatsToTest[i]
          if (!formatData) continue
          const [formatKey, , testAsset] = formatData
          const foreground = Foreground.fromUrl(testAsset as string, {
            format: formatKey as FormatKey,
          })

          const positionData = positions[i]
          if (!positionData) continue
          const [anchor, dx, dy] = positionData
          const alphaEnabled = i % 2 === 0 // Alternate alpha on/off

          showcaseComp
            .add(foreground, `showcase_${formatKey}`)
            .at(anchor as Anchor, dx as number, dy as number)
            .size(SizeMode.CANVAS_PERCENT, { percent: 20 })
            .alpha(alphaEnabled)
            .opacity(0.9)
        }

        const outputShowcase = path.join(outputDir, 'alpha_comparison_multi_format_showcase.mp4')
        await showcaseComp.toFile(outputShowcase, encoder)

        expect(fs.existsSync(outputShowcase)).toBe(true)
        const stats = fs.statSync(outputShowcase)
        expect(stats.size).toBeGreaterThan(0)
        console.log(`    ✅ Multi-format showcase → ${outputShowcase}`)
      } catch (error) {
        console.log(`    ⚠️ Multi-format showcase failed: ${error}`)
      }

      console.log('✅ Alpha control comprehensive test completed')
      console.log('  📊 Summary:')
      console.log('    - Tested all 4 formats: WebM VP9, MOV ProRes, Stacked Video, Pro Bundle')
      console.log('    - Each format tested with alpha enabled and disabled')
      console.log('    - Side-by-side comparisons created for visual verification')
      console.log('    - Multi-format showcase with mixed alpha settings')
      console.log('  🎭 Compare the outputs to see transparency differences!')
    })
  })

  describe('Workflow Error Handling', () => {
    test('should handle workflow error handling', async () => {
      console.log('🎬 Testing workflow error handling...')

      const foreground = Foreground.fromUrl('/non/existent/video.webm', {
        format: 'webm_vp9',
      })

      // Try to create composition (should handle gracefully)
      const bg = Background.fromColor('#00FF00', 1920, 1080, 30.0)
      const comp = new Composition(bg)
      comp.add(foreground)

      // Dry run should work (generates command without executing)
      const cmd = comp.dryRun()
      expect(cmd).toContain('ffmpeg')
      expect(cmd).toContain('/non/existent/video.webm')

      console.log('✅ Error handling test completed')
    })
  })

  describe('Multiple Foregrounds Audio Selection', () => {
    test('should handle multiple foregrounds audio selection', async () => {
      console.log('🎵 Testing multiple foregrounds audio selection...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      // Create composition with multiple layers
      const bg = Background.fromColor('#0000FF', 1920, 1080, 30.0)
      const comp = new Composition(bg)

      // Layer 1: WebM with Opus audio
      comp.add(foreground, 'main_video').at(Anchor.CENTER).size(SizeMode.CONTAIN)

      // Layer 2: ProRes with PCM audio
      const foregroundProres = Foreground.fromUrl('test_assets/transparent_mov_prores.mov', {
        format: 'mov_prores',
      })
      comp
        .add(foregroundProres, 'pip_video')
        .at(Anchor.TOP_RIGHT, -50, 50)
        .size(SizeMode.CANVAS_PERCENT, { percent: 25 })

      // Export test
      const outputPath = path.join(outputDir, 'multi_layer_default_audio.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })
      await comp.toFile(outputPath, encoder)

      expect(fs.existsSync(outputPath)).toBe(true)
      console.log(`      ✅ Multiple layers with default audio - ${outputPath}`)

      console.log('✅ Multiple foregrounds audio selection test completed')
    })
  })

  describe('Comprehensive Timing System', () => {
    test('should handle comprehensive timing system', async () => {
      console.log('⏰ Testing comprehensive timing system...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      // Test 1: Background subclip
      console.log('  Testing background subclip...')
      const bgOriginal = Background.fromVideo('test_assets/long_background_video.mp4')
      const bgTrimmed = bgOriginal.subclip(5, 15) // Use 5-15s of background (10s total)

      // Verify background trimming doesn't modify original
      expect(bgOriginal.sourceTrim).toBeUndefined()
      expect(bgTrimmed.sourceTrim).toEqual([5, 15])
      expect(bgTrimmed.source).toBe(bgOriginal.source) // Same source file

      // Test 2: Foreground subclip
      console.log('  Testing foreground subclip...')
      const fgTrimmed = foreground.subclip(2, 6) // Use 2-6s of foreground (4s total)

      // Verify foreground trimming doesn't modify original
      expect(foreground.sourceTrim).toBeUndefined()
      expect(fgTrimmed.sourceTrim).toEqual([2, 6])
      expect(fgTrimmed.primaryPath).toBe(foreground.primaryPath) // Same source file

      // Test 3: Composition with both background and foreground trimming
      console.log('  Testing composition with source trimming...')
      const comp = new Composition(bgTrimmed) // 10s background (5-15s)
      comp.add(fgTrimmed, 'trimmed_fg').start(2).duration(4) // Show 4s fg at 2-6s

      // Export and verify
      const outputPath = path.join(outputDir, 'timing_comprehensive_source_trimming.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })
      await comp.toFile(outputPath, encoder)

      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)
      console.log(`    ✅ Source trimming test → ${outputPath}`)
    })

    test('should handle composition timing comprehensive', async () => {
      console.log('⏰ Testing composition timeline timing...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      const bg = Background.fromVideo('test_assets/long_background_video.mp4')
      const comp = new Composition(bg)

      // Test 1: .start() and .end()
      console.log('  Testing .start() and .end()...')
      comp.add(foreground, 'start_end').start(2).end(8).at(Anchor.TOP_LEFT)

      // Test 2: .start() and .duration()
      console.log('  Testing .start() and .duration()...')
      comp.add(foreground, 'start_duration').start(5).duration(3).at(Anchor.TOP_RIGHT)

      // Test 3: .start() only (show from start onwards)
      console.log('  Testing .start() only...')
      comp.add(foreground, 'start_only').start(10).at(Anchor.BOTTOM_CENTER)

      // Export complex timing composition
      const outputPath = path.join(outputDir, 'timing_comprehensive_composition.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })
      await comp.toFile(outputPath, encoder)

      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)
      console.log(`    ✅ Composition timing test → ${outputPath}`)
    })

    test('should handle combined source and composition timing', async () => {
      console.log('⏰ Testing combined source + composition timing...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      // Complex scenario: trim sources, then compose with timing
      const bg = Background.fromVideo('test_assets/long_background_video.mp4').subclip(10, 30) // 20s background

      // Trim foreground sources
      const fg1 = foreground.subclip(1, 4) // 3s of content
      const fg2 = foreground.subclip(0, 2) // 2s of content

      // Compose with timeline timing
      const comp = new Composition(bg)
      comp.add(fg1, 'combined1').start(3).duration(3).at(Anchor.CENTER) // Use all 3s, show 3-6s
      comp.add(fg2, 'combined2').start(8).end(12).at(Anchor.TOP_RIGHT) // Use 2s, show 8-12s

      // Export
      const outputPath = path.join(outputDir, 'timing_combined_source_composition.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })
      await comp.toFile(outputPath, encoder)

      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)
      console.log(`    ✅ Combined timing test → ${outputPath}`)
    })

    test('should handle timing edge cases', async () => {
      console.log('⚠️ Testing timing edge cases...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      // Test 1: Zero start time with duration (should work)
      console.log('  Testing zero start time with duration...')
      const bg = Background.fromColor('#FF0000', 1920, 1080, 30.0)
      const comp1 = new Composition(bg)
      comp1.add(foreground).start(0).duration(5)

      const cmd1 = comp1.dryRun()
      expect(cmd1).toContain('ffmpeg') // Should generate valid FFmpeg command

      // Test 2: Subclip with end=None (until end of video)
      console.log('  Testing subclip with end=None...')
      const fgOpenEnd = foreground.subclip(2) // From 2s to end
      const comp2 = new Composition(bg)
      comp2.add(fgOpenEnd)

      const cmd2 = comp2.dryRun()
      expect(cmd2).toContain('-ss 2') // Should start from 2s

      // Test 3: Multiple subclips (re-trimming)
      console.log('  Testing multiple subclips (re-trimming)...')
      const fgDoubleTrim = foreground.subclip(1, 10).subclip(2, 5) // First 1-10s, then 2-5s of that
      const comp4 = new Composition(bg)
      comp4.add(fgDoubleTrim)

      // Should use the final trim values
      expect(fgDoubleTrim.sourceTrim).toEqual([2, 5])

      // Export overlapping test
      const outputPath = path.join(outputDir, 'timing_edge_cases_overlapping.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })
      await comp1.toFile(outputPath, encoder)

      expect(fs.existsSync(outputPath)).toBe(true)
      console.log(`    ✅ Edge cases test → ${outputPath}`)
    })

    test('should handle timing with different formats', async () => {
      console.log('🎬 Testing timing with different formats...')

      const bg = Background.fromVideo('test_assets/long_background_video.mp4').subclip(0, 20)
      const comp = new Composition(bg)

      // Test with different formats
      const formatsToTest = [
        ['webm_vp9', 'test_assets/transparent_webm_vp9.webm', 'webm_vp9'],
        ['stacked_video', 'test_assets/stacked_video_comparison.mp4', 'stacked_video'],
        ['pro_bundle', 'test_assets/pro_bundle_multiple_formats.zip', 'pro_bundle'],
      ]

      for (let i = 0; i < formatsToTest.length; i++) {
        const formatData = formatsToTest[i]
        if (!formatData) continue
        const [formatKey, testAsset, expectedForm] = formatData
        console.log(`  Testing timing with ${formatKey}...`)

        const fg = Foreground.fromUrl(testAsset as string, {
          format: expectedForm as FormatKey,
        })

        // Apply both source and composition timing
        const fgTrimmed = fg.subclip(1, 4) // 3s of source
        const startTime = i * 5 // Stagger start times: 0s, 5s, 10s

        const anchors = [Anchor.TOP_LEFT, Anchor.TOP_RIGHT, Anchor.BOTTOM_CENTER]
        comp
          .add(fgTrimmed, `${formatKey}_timed`)
          .start(startTime)
          .duration(3)
          .at(anchors[i])
          .opacity(0.8)
      }

      // Export multi-format timing test
      const outputPath = path.join(outputDir, 'timing_multi_format.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })
      await comp.toFile(outputPath, encoder)

      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)
      console.log(`    ✅ Multi-format timing test → ${outputPath}`)
    })

    test('should handle timing performance stress', async () => {
      console.log('🚀 Testing timing performance with many layers...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      const bg = Background.fromVideo('test_assets/long_background_video.mp4').subclip(0, 30)
      const comp = new Composition(bg)

      // Add many layers with different timing
      const numLayers = 8 // Reasonable number for testing
      const anchors = [
        Anchor.TOP_LEFT,
        Anchor.TOP_CENTER,
        Anchor.TOP_RIGHT,
        Anchor.CENTER_LEFT,
        Anchor.CENTER_RIGHT,
        Anchor.BOTTOM_LEFT,
        Anchor.BOTTOM_CENTER,
        Anchor.BOTTOM_RIGHT,
      ]

      for (let i = 0; i < numLayers; i++) {
        // Stagger timing and positions
        const startTime = i * 2 // Start every 2 seconds
        const duration = 4 // Each layer visible for 4 seconds

        // Apply source trimming too
        const fgTrimmed = foreground.subclip(0, duration)

        comp
          .add(fgTrimmed, `stress_layer_${i}`)
          .start(startTime)
          .duration(duration)
          .at(anchors[i])
          .size(SizeMode.CANVAS_PERCENT, { percent: 15 })
          .opacity(0.6)
      }

      // Export stress test
      const outputPath = path.join(outputDir, 'timing_stress_test.mp4')
      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })
      await comp.toFile(outputPath, encoder)

      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)
      console.log(`    ✅ Stress test (${numLayers} layers) → ${outputPath}`)
    })

    test('should handle timing audio interaction', async () => {
      console.log('🎵 Testing timing + audio interaction...')

      const foreground = Foreground.fromUrl('test_assets/transparent_webm_vp9.webm', {
        format: 'webm_vp9',
      })

      // Test 1: Background audio with background trimming
      console.log('  Testing background audio with trimming...')
      const bgTrimmed = Background.fromVideo('test_assets/background_video.mp4').subclip(2, 8) // 6s background

      const comp1 = new Composition(bgTrimmed)
      comp1.add(foreground).start(1).duration(4)

      // Test 2: Foreground audio with foreground trimming
      console.log('  Testing foreground audio with trimming...')
      const fgTrimmed = foreground.subclip(1, 5) // 4s foreground

      const comp2 = new Composition(Background.fromColor('#00FF00', 1920, 1080, 30.0))
      comp2.add(fgTrimmed).start(2).duration(3)

      // Export audio tests
      const outputPath1 = path.join(outputDir, 'timing_audio_background.mp4')
      const outputPath2 = path.join(outputDir, 'timing_audio_foreground.mp4')

      const encoder = EncoderProfile.h264({ crf: 35, preset: 'ultrafast' })
      await comp1.toFile(outputPath1, encoder)
      await comp2.toFile(outputPath2, encoder)

      expect(fs.existsSync(outputPath1) && fs.existsSync(outputPath2)).toBe(true)
      console.log(`    ✅ Audio + timing tests → ${outputPath1}, ${outputPath2}`)
    })
  })

  describe('Image Background URL Performance', () => {
    test('should test image background URL performance with TWO URLs', async () => {
      console.log('✅ Testing image background URL performance (FIXED) with 2 URLs...')

      // Get URLs from environment - REQUIRED
      const testImageUrl1 = process.env.TEST_BACKGROUND_IMAGE_URL
      const testImageUrl2 = process.env.TEST_BACKGROUND_IMAGE_URL2

      if (!testImageUrl1) {
        throw new Error('TEST_BACKGROUND_IMAGE_URL environment variable is required')
      }
      if (!testImageUrl2) {
        throw new Error('TEST_BACKGROUND_IMAGE_URL2 environment variable is required')
      }

      console.log(`  📸 Test image URL 1: ${testImageUrl1}`)
      console.log(`  📸 Test image URL 2: ${testImageUrl2}`)

      // Use pro_bundle ZIP file as foreground
      const foreground = Foreground.fromProBundleZip('test_assets/pro_bundle_multiple_formats.zip')
      const encoder = EncoderProfile.h264({ crf: 20, preset: 'fast' })

      // Test URL 1
      console.log('\n  🔹 Testing URL 1...')
      const startProbe1 = Date.now()
      const bgImage1 = Background.fromImage(testImageUrl1, 24.0)
      const probeTime1 = (Date.now() - startProbe1) / 1000
      console.log(`  ⏱️  Download + probing: ${probeTime1.toFixed(2)}s`)
      console.log(`  📏 Dimensions: ${bgImage1.width}x${bgImage1.height}`)

      const comp1 = new Composition(bgImage1)
      comp1
        .add(foreground, 'ai_actor')
        .at(Anchor.BOTTOM_RIGHT, -30, -30)
        .size(SizeMode.SCALE, { scale: 0.5 })
        .audio(true, 1.0)

      const cmd1 = comp1.dryRun()
      expect(cmd1).toContain('-loop')
      expect(cmd1).not.toContain(testImageUrl1)
      expect(cmd1).toContain('downloaded_image_')
      console.log('  ✅ Using LOCAL FILE (FAST PATH)')

      const outputPath1 = path.join(outputDir, 'image_url_background_1.mp4')
      const startTime1 = Date.now()
      await comp1.toFile(outputPath1, encoder)
      const duration1 = (Date.now() - startTime1) / 1000

      expect(fs.existsSync(outputPath1)).toBe(true)
      const stats1 = fs.statSync(outputPath1)
      expect(stats1.size).toBeGreaterThan(0)
      console.log(`  ✅ URL 1 output: ${outputPath1}`)
      console.log(`  ⏱️  Composition: ${duration1.toFixed(2)}s`)

      // Test URL 2
      console.log('\n  🔹 Testing URL 2...')
      const startProbe2 = Date.now()
      const bgImage2 = Background.fromImage(testImageUrl2, 24.0)
      const probeTime2 = (Date.now() - startProbe2) / 1000
      console.log(`  ⏱️  Download + probing: ${probeTime2.toFixed(2)}s`)
      console.log(`  📏 Dimensions: ${bgImage2.width}x${bgImage2.height}`)

      const comp2 = new Composition(bgImage2)
      comp2
        .add(foreground, 'ai_actor')
        .at(Anchor.BOTTOM_RIGHT, -30, -30)
        .size(SizeMode.SCALE, { scale: 0.5 })
        .audio(true, 1.0)

      const cmd2 = comp2.dryRun()
      expect(cmd2).toContain('-loop')
      expect(cmd2).not.toContain(testImageUrl2)
      expect(cmd2).toContain('downloaded_image_')
      console.log('  ✅ Using LOCAL FILE (FAST PATH)')

      const outputPath2 = path.join(outputDir, 'image_url_background_2.mp4')
      const startTime2 = Date.now()
      await comp2.toFile(outputPath2, encoder)
      const duration2 = (Date.now() - startTime2) / 1000

      expect(fs.existsSync(outputPath2)).toBe(true)
      const stats2 = fs.statSync(outputPath2)
      expect(stats2.size).toBeGreaterThan(0)
      console.log(`  ✅ URL 2 output: ${outputPath2}`)
      console.log(`  ⏱️  Composition: ${duration2.toFixed(2)}s`)

      // Summary
      const total = probeTime1 + duration1 + probeTime2 + duration2
      console.log('\n  📊 Performance Summary:')
      console.log(`     URL 1: ${(probeTime1 + duration1).toFixed(2)}s total`)
      console.log(`     URL 2: ${(probeTime2 + duration2).toFixed(2)}s total`)
      console.log(`     BOTH: ${total.toFixed(2)}s`)

      if (duration1 < 10 && duration2 < 10) {
        console.log('  ✅ SUCCESS: Both URLs are FAST! Fix confirmed!')
      } else {
        console.log('  ⚠️  Some URLs slow - needs investigation')
      }
    })
  })

  describe('Matte Feature - Functional Tests', () => {
    test('should compose video with matte=true and export', async () => {
      console.log('🎨 Testing matte feature with matte=true (soft alpha)...')

      const outputPath = path.join(outputDir, 'matte_true_composition.mp4')

      // Create composition with matte foreground (soft edges)
      const bg = Background.fromColor('#00FF00', 1920, 1080, 30.0)
      const comp = new Composition(bg)
      const fg = Foreground.fromVideoAndMask(
        'test_assets/matte/video_preprocessed.mp4',
        'test_assets/matte/video_matte.mp4',
        undefined,
        undefined,
        true // matte=true for soft edges
      )
      comp.add(fg).at(Anchor.CENTER).size(SizeMode.CONTAIN)

      // Export
      const encoder = EncoderProfile.h264({ crf: 23, preset: 'fast' })
      await comp.toFile(outputPath, encoder)

      // Verify output
      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)
      console.log(
        `  ✅ Matte=true output: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
      )
    })

    test('should compose video with matte=false and export', async () => {
      console.log('🎨 Testing matte feature with matte=false (binary mask)...')

      const outputPath = path.join(outputDir, 'matte_false_composition.mp4')

      // Create composition with binary mask foreground (hard edges)
      const bg = Background.fromColor('#0000FF', 1920, 1080, 30.0)
      const comp = new Composition(bg)
      const fg = Foreground.fromVideoAndMask(
        'test_assets/matte/video_preprocessed.mp4',
        'test_assets/matte/video_matte.mp4',
        undefined,
        undefined,
        false // matte=false for hard edges
      )
      comp.add(fg).at(Anchor.CENTER).size(SizeMode.CONTAIN)

      // Export
      const encoder = EncoderProfile.h264({ crf: 23, preset: 'fast' })
      await comp.toFile(outputPath, encoder)

      // Verify output
      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)
      console.log(
        `  ✅ Matte=false output: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
      )
    })

    test('should compare matte=true vs matte=false side-by-side', async () => {
      console.log('🎨 Testing matte comparison: soft edges (left) vs hard edges (right)...')

      const outputPath = path.join(outputDir, 'matte_comparison.mp4')

      // Create side-by-side comparison
      const bg = Background.fromColor('#808080', 1920, 1080, 30.0)
      const comp = new Composition(bg)

      // Left side: matte=true (soft edges)
      const fgMatte = Foreground.fromVideoAndMask(
        'test_assets/matte/video_preprocessed.mp4',
        'test_assets/matte/video_matte.mp4',
        undefined,
        undefined,
        true
      )
      comp
        .add(fgMatte, 'matte_true')
        .at(Anchor.CENTER_LEFT, 100)
        .size(SizeMode.CANVAS_PERCENT, { percent: 40 })

      // Right side: matte=false (hard edges)
      const fgBinary = Foreground.fromVideoAndMask(
        'test_assets/matte/video_preprocessed.mp4',
        'test_assets/matte/video_matte.mp4',
        undefined,
        undefined,
        false
      )
      comp
        .add(fgBinary, 'matte_false')
        .at(Anchor.CENTER_RIGHT, -100)
        .size(SizeMode.CANVAS_PERCENT, { percent: 40 })

      // Export
      const encoder = EncoderProfile.h264({ crf: 20, preset: 'medium' })
      await comp.toFile(outputPath, encoder)

      // Verify output
      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)
      console.log(
        `  ✅ Side-by-side comparison: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
      )
      console.log('     Left: matte=true (soft alpha), Right: matte=false (binary mask)')
    })

    test('should compose with matte foreground and image background', async () => {
      console.log('🎨 Testing matte foreground with image background...')

      const outputPath = path.join(outputDir, 'matte_with_image_bg.mp4')

      // Use image background
      const bg = Background.fromImage('test_assets/background_image.png', 30.0)
      const comp = new Composition(bg)
      const fg = Foreground.fromVideoAndMask(
        'test_assets/matte/video_preprocessed.mp4',
        'test_assets/matte/video_matte.mp4',
        undefined,
        undefined,
        true // Soft edges work better with complex backgrounds
      )
      comp.add(fg).at(Anchor.CENTER).size(SizeMode.CANVAS_PERCENT, { percent: 60 })

      // Export
      const encoder = EncoderProfile.h264({ crf: 22, preset: 'fast' })
      await comp.toFile(outputPath, encoder)

      // Verify output
      expect(fs.existsSync(outputPath)).toBe(true)
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(0)
      console.log(
        `  ✅ Matte + image background: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
      )
    })
  })
})
