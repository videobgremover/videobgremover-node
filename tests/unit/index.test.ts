/**
 * Basic unit tests for SDK exports and initialization
 */

import {
  VideoBGRemoverClient,
  Video,
  Background,
  Composition,
  EncoderProfile,
  Prefer,
  Anchor,
  SizeMode,
  VERSION,
} from '../../src/index'

describe('VideoBGRemover SDK', () => {
  it('should export main classes and functions', () => {
    // Check main exports exist
    expect(VideoBGRemoverClient).toBeDefined()
    expect(Video).toBeDefined()
    expect(Background).toBeDefined()
    expect(Composition).toBeDefined()
    expect(EncoderProfile).toBeDefined()

    // Check enums
    expect(Prefer).toBeDefined()
    expect(Anchor).toBeDefined()
    expect(SizeMode).toBeDefined()

    // Check version (should match package.json)
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-\w+\.\d+)?$/)
  })

  it('should have proper TypeScript types', () => {
    // These should be constructor functions
    expect(typeof VideoBGRemoverClient).toBe('function')
    expect(typeof Video).toBe('function')
    expect(typeof Background).toBe('function')
    expect(typeof Composition).toBe('function')
  })

  it('should create client instance', () => {
    const client = new VideoBGRemoverClient('test-api-key')
    expect(client).toBeInstanceOf(VideoBGRemoverClient)
  })

  it('should create video instance', () => {
    const video = Video.open('test-video.mp4')
    expect(video).toBeInstanceOf(Video)
    expect(video.kind).toBe('file')
    expect(video.src).toBe('test-video.mp4')
  })

  it('should detect URL vs file', () => {
    const fileVideo = Video.open('test-video.mp4')
    const urlVideo = Video.open('https://example.com/video.mp4')

    expect(fileVideo.kind).toBe('file')
    expect(urlVideo.kind).toBe('url')
  })
})
