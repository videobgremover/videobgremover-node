/**
 * Tests for the VideoBGRemover API client
 * (Port of Python test_client.py)
 */

import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import {
  VideoBGRemoverClient,
  ApiError,
  InsufficientCreditsError,
  JobNotFoundError,
} from '../../src/index'

describe('VideoBGRemoverClient', () => {
  let mockAxios: MockAdapter

  beforeEach(() => {
    mockAxios = new MockAdapter(axios)
  })

  afterEach(() => {
    mockAxios.restore()
  })

  test('should initialize with default settings', () => {
    const client = new VideoBGRemoverClient('test_key')
    expect(client).toBeDefined()
  })

  test('should initialize with custom base URL', () => {
    const client = new VideoBGRemoverClient('test_key', {
      baseUrl: 'https://custom.api.com/',
    })
    expect(client).toBeDefined()
  })

  test('should get credits successfully', async () => {
    const client = new VideoBGRemoverClient('test_key')

    mockAxios.onGet('/v1/credits').reply(200, {
      total_credits: 100.0,
      remaining_credits: 50.0,
      used_credits: 50.0,
    })

    const credits = await client.credits()

    expect(credits.totalCredits).toBe(100.0)
    expect(credits.remainingCredits).toBe(50.0)
    expect(credits.usedCredits).toBe(50.0)
  })

  test('should create job file successfully', async () => {
    const client = new VideoBGRemoverClient('test_key')

    mockAxios.onPost('/v1/jobs').reply(200, {
      id: 'job_123',
      upload_url: 'https://storage.googleapis.com/signed-url',
      expires_at: '2024-01-01T12:00:00Z',
    })

    const response = await client.createJobFile({
      filename: 'test.mp4',
      content_type: 'video/mp4',
    })

    expect(response.id).toBe('job_123')
    expect(response.upload_url).toContain('storage.googleapis.com')
  })

  test('should create job URL successfully', async () => {
    const client = new VideoBGRemoverClient('test_key')

    mockAxios.onPost('/v1/jobs').reply(200, {
      id: 'job_456',
    })

    const response = await client.createJobUrl({
      video_url: 'https://example.com/video.mp4',
    })

    expect(response.id).toBe('job_456')
  })

  test('should get job status', async () => {
    const client = new VideoBGRemoverClient('test_key')

    mockAxios.onGet('/v1/jobs/job_123/status').reply(200, {
      id: 'job_123',
      status: 'completed',
      filename: 'test.mp4',
      created_at: '2024-01-01T10:00:00Z',
      processed_video_url: 'https://example.com/result.webm',
    })

    const status = await client.status('job_123')

    expect(status.id).toBe('job_123')
    expect(status.status).toBe('completed')
    expect(status.processed_video_url).toBe('https://example.com/result.webm')
  })

  test('should start job successfully', async () => {
    const client = new VideoBGRemoverClient('test_key')

    mockAxios.onPost('/v1/jobs/job_123/start').reply(200, {
      id: 'job_123',
      status: 'processing',
    })

    const response = await client.startJob('job_123', {
      background: {
        type: 'transparent',
        transparent_format: 'webm_vp9',
      },
    })

    expect(response.id).toBe('job_123')
    expect(response.status).toBe('processing')
  })

  test('should wait for job completion', async () => {
    const client = new VideoBGRemoverClient('test_key')

    // First call: processing
    mockAxios.onGet('/v1/jobs/job_123/status').replyOnce(200, {
      id: 'job_123',
      status: 'processing',
      filename: 'test.mp4',
      created_at: '2024-01-01T10:00:00Z',
    })

    // Second call: completed
    mockAxios.onGet('/v1/jobs/job_123/status').replyOnce(200, {
      id: 'job_123',
      status: 'completed',
      filename: 'test.mp4',
      created_at: '2024-01-01T10:00:00Z',
      processed_video_url: 'https://example.com/result.webm',
    })

    const status = await client.wait('job_123', { pollSeconds: 0.1 })

    expect(status.status).toBe('completed')
  })

  test('should handle 401 authentication error', async () => {
    const client = new VideoBGRemoverClient('test_key')

    mockAxios.onGet('/v1/credits').reply(401, {
      error: 'Invalid API key',
    })

    await expect(client.credits()).rejects.toThrow(ApiError)
    await expect(client.credits()).rejects.toThrow('Invalid API key')
  })

  test('should handle 402 insufficient credits error', async () => {
    const client = new VideoBGRemoverClient('test_key')

    mockAxios.onPost('/v1/jobs/job_123/start').reply(402, {
      error: 'Insufficient credits',
    })

    await expect(client.startJob('job_123')).rejects.toThrow(InsufficientCreditsError)
  })

  test('should handle 404 job not found error', async () => {
    const client = new VideoBGRemoverClient('test_key')

    mockAxios.onGet('/v1/jobs/nonexistent/status').reply(404, {
      error: 'Job not found',
    })

    await expect(client.status('nonexistent')).rejects.toThrow(JobNotFoundError)
  })

  test('should get result with custom color', async () => {
    const client = new VideoBGRemoverClient('test_key')

    mockAxios.onPost('/v1/jobs/job_123/result').reply(200, {
      job_id: 'job_123',
      status: 'success',
      download_url: 'https://example.com/result.mp4',
      expires_at: '2024-01-01T12:00:00Z',
      filename: 'result.mp4',
    })

    const result = await client.resultColor('job_123', '#FF0000')

    expect(result.job_id).toBe('job_123')
    expect(result.download_url).toBe('https://example.com/result.mp4')
  })

  test('should handle wait timeout', async () => {
    const client = new VideoBGRemoverClient('test_key')

    mockAxios.onGet('/v1/jobs/job_123/status').reply(200, {
      id: 'job_123',
      status: 'processing',
      filename: 'test.mp4',
      created_at: '2024-01-01T10:00:00Z',
    })

    await expect(client.wait('job_123', { pollSeconds: 0.1, timeout: 0.2 })).rejects.toThrow(
      'did not complete within'
    )
  })

  test('should handle processing failure', async () => {
    const client = new VideoBGRemoverClient('test_key')

    mockAxios.onGet('/v1/jobs/job_123/status').reply(200, {
      id: 'job_123',
      status: 'failed',
      filename: 'test.mp4',
      created_at: '2024-01-01T10:00:00Z',
      message: 'Processing failed',
    })

    await expect(client.wait('job_123')).rejects.toThrow('Processing failed')
  })
})
