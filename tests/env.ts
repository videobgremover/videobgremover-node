/**
 * Test environment configuration
 */

import { config } from 'dotenv'

// Load .env file first
config({ path: '.env' })

// Set test environment variables (only if not already defined in .env)
process.env.VIDEOBGREMOVER_ENV = process.env.VIDEOBGREMOVER_ENV || 'test'
process.env.VIDEOBGREMOVER_API_KEY = process.env.VIDEOBGREMOVER_API_KEY || 'test-api-key'
process.env.VIDEOBGREMOVER_BASE_URL =
  process.env.VIDEOBGREMOVER_BASE_URL || 'http://localhost:3000/api'

// Disable real API calls in unit tests by default (only if not already set)
process.env.SKIP_API_TESTS = process.env.SKIP_API_TESTS || 'true'

// Test file paths (only set if not already defined in .env)
process.env.TEST_VIDEO_URL = process.env.TEST_VIDEO_URL || 'https://example.com/test-video.mp4'
process.env.TEST_BACKGROUND_IMAGE =
  process.env.TEST_BACKGROUND_IMAGE || 'tests/fixtures/test-background.png'
process.env.TEST_BACKGROUND_VIDEO =
  process.env.TEST_BACKGROUND_VIDEO || 'tests/fixtures/test-background.mp4'
