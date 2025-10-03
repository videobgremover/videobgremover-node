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

  test('should start job with webhook_url', async () => {
    const client = new VideoBGRemoverClient('test_key')

    mockAxios.onPost('/v1/jobs/job_123/start').reply(200, {
      id: 'job_123',
      status: 'processing',
    })

    const response = await client.startJob('job_123', {
      webhook_url: 'https://example.com/webhooks',
      background: {
        type: 'transparent',
        transparent_format: 'webm_vp9',
      },
    })

    expect(response.id).toBe('job_123')
    expect(response.status).toBe('processing')

    // Verify the request was made with webhook_url
    expect(mockAxios.history.post).toBeDefined()
    if (mockAxios.history.post && mockAxios.history.post.length > 0) {
      const lastRequest = mockAxios.history.post[mockAxios.history.post.length - 1]
      expect(lastRequest).toBeDefined()
      if (lastRequest && lastRequest.data) {
        const requestData = JSON.parse(lastRequest.data)
        expect(requestData.webhook_url).toBe('https://example.com/webhooks')
      }
    }
  })

  test('should get webhook deliveries', async () => {
    const client = new VideoBGRemoverClient('test_key')

    mockAxios.onGet('/v1/webhooks/deliveries?video_id=job_123').reply(200, {
      video_id: 'job_123',
      total_deliveries: 2,
      deliveries: [
        {
          event_type: 'job.started',
          webhook_url: 'https://example.com/webhooks',
          attempt_number: 1,
          delivery_status: 'delivered',
          http_status_code: 200,
          error_message: null,
          scheduled_at: '2025-10-02T10:00:00Z',
          delivered_at: '2025-10-02T10:00:01Z',
          payload: { event: 'job.started' },
          created_at: '2025-10-02T10:00:00Z',
        },
        {
          event_type: 'job.completed',
          webhook_url: 'https://example.com/webhooks',
          attempt_number: 1,
          delivery_status: 'delivered',
          http_status_code: 200,
          error_message: null,
          scheduled_at: '2025-10-02T10:05:00Z',
          delivered_at: '2025-10-02T10:05:01Z',
          payload: { event: 'job.completed' },
          created_at: '2025-10-02T10:05:00Z',
        },
      ],
    })

    const deliveries = await client.webhookDeliveries('job_123')

    expect(deliveries.video_id).toBe('job_123')
    expect(deliveries.total_deliveries).toBe(2)
    expect(deliveries.deliveries).toHaveLength(2)
    if (deliveries.deliveries && deliveries.deliveries.length >= 2) {
      const delivery1 = deliveries.deliveries[0]
      const delivery2 = deliveries.deliveries[1]
      if (delivery1 && delivery2) {
        expect(delivery1.event_type).toBe('job.started')
        expect(delivery2.event_type).toBe('job.completed')
      }
    }
  })
})
