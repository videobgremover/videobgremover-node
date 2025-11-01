/**
 * VideoBGRemover API Client
 * (from Python client/api.py and client/models.py)
 */

import axios, { AxiosInstance, AxiosError } from 'axios'
import { VERSION } from './version'
import { ClientOptions, Credits } from './types'
import { ApiError, InsufficientCreditsError, JobNotFoundError, ProcessingError } from './errors'

// ============================================================================
// API MODEL INTERFACES (from Python client/models.py)
// ============================================================================

export interface CreateJobFileUpload {
  filename: string
  content_type: 'video/mp4' | 'video/mov' | 'video/webm'
}

export interface CreateJobUrlDownload {
  video_url: string
}

export interface BackgroundOptions {
  type: 'color' | 'transparent'
  color?: string
  transparent_format?: 'webm_vp9' | 'mov_prores' | 'png_sequence' | 'pro_bundle' | 'stacked_video'
}

export interface StartJobRequest {
  format?: 'mp4'
  model?: string
  background?: BackgroundOptions
  webhook_url?: string
}

export interface JobStatus {
  id: string
  status: 'created' | 'uploaded' | 'processing' | 'completed' | 'failed'
  filename: string
  created_at: string
  length_seconds?: number
  thumbnail_url?: string
  transparent_thumbnail_url?: string
  processed_video_url?: string
  processed_mask_url?: string
  message?: string
  background?: BackgroundOptions
  output_format?: string
  export_id?: string
}

export interface CreditBalance {
  total_credits: number
  remaining_credits: number
  used_credits: number
}

export interface ResultResponse {
  job_id: string
  status: 'success'
  download_url: string
  expires_at: string
  filename: string
}

// ============================================================================
// API CLIENT CLASS (from Python client/api.py)
// ============================================================================

/**
 * Client for interacting with the VideoBGRemover API
 */
export class VideoBGRemoverClient {
  private readonly httpClient: AxiosInstance
  private readonly baseUrl: string
  private readonly timeout: number

  constructor(apiKey: string, options: ClientOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://api.videobgremover.com'
    this.timeout = options.timeout || 30000

    // Create axios instance with default config
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'X-Api-Key': apiKey,
        'User-Agent': `videobgremover-node/${VERSION}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      response => response,
      error => this.handleApiError(error)
    )
  }

  /**
   * Get credit balance
   */
  async credits(): Promise<Credits> {
    const response = await this.httpClient.get<CreditBalance>('/v1/credits')
    return {
      totalCredits: response.data.total_credits,
      remainingCredits: response.data.remaining_credits,
      usedCredits: response.data.used_credits,
    }
  }

  /**
   * Create a job for file upload (matches Python create_job_file)
   */
  async createJobFile(
    req: CreateJobFileUpload
  ): Promise<{ id: string; upload_url: string; expires_at: string }> {
    const response = await this.httpClient.post('/v1/jobs', req)
    return response.data
  }

  /**
   * Create a job for URL download (matches Python create_job_url)
   */
  async createJobUrl(req: CreateJobUrlDownload): Promise<{ id: string }> {
    const response = await this.httpClient.post('/v1/jobs', req)
    return response.data
  }

  /**
   * Start processing a job (matches Python start_job)
   */
  async startJob(jobId: string, req?: StartJobRequest): Promise<JobStatus> {
    const response = await this.httpClient.post(`/v1/jobs/${jobId}/start`, req || {})
    return response.data
  }

  /**
   * Get job status (matches Python status method)
   */
  async status(jobId: string): Promise<JobStatus> {
    const response = await this.httpClient.get(`/v1/jobs/${jobId}/status`)
    return response.data
  }

  /**
   * Wait for a job to complete (matches Python wait method)
   */
  async wait(
    jobId: string,
    options: {
      pollSeconds?: number
      timeout?: number
      onStatus?: (status: string) => void
    } = {}
  ): Promise<JobStatus> {
    const { pollSeconds = 2.0, timeout, onStatus } = options
    const startTime = Date.now()
    let lastStatus: string | null = null

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const status = await this.status(jobId)

      if (status.status === 'completed') {
        return status
      } else if (status.status === 'failed') {
        throw new ProcessingError(status.message || 'Job processing failed', jobId)
      }

      // Check timeout
      if (timeout && Date.now() - startTime > timeout * 1000) {
        throw new Error(`Job ${jobId} did not complete within ${timeout} seconds`)
      }

      // Call status callback only when status changes
      if (onStatus && status.status !== lastStatus) {
        onStatus(status.status)
        lastStatus = status.status
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollSeconds * 1000))
    }
  }

  /**
   * Get webhook delivery history for a job
   */
  async webhookDeliveries(videoId: string): Promise<{
    video_id: string
    total_deliveries: number
    deliveries: Array<{
      event_type: string
      webhook_url: string
      attempt_number: number
      delivery_status: string
      http_status_code: number | null
      error_message: string | null
      scheduled_at: string
      delivered_at: string | null
      payload: {
        job_id: string
        user_id: string
        status: 'started' | 'completed' | 'failed'
        file_name?: string
        error_message?: string
        source?: 'api' | 'web'
      }
      created_at: string
    }>
  }> {
    const response = await this.httpClient.get(`/v1/webhooks/deliveries?video_id=${videoId}`)
    return response.data
  }

  /**
   * Handle API errors and convert to appropriate error types
   */
  private handleApiError(error: AxiosError): never {
    if (!error.response) {
      throw new ApiError('Network error: ' + error.message)
    }

    const { status, data } = error.response
    const message = (data as { error?: string })?.error || error.message

    switch (status) {
      case 401:
        throw new ApiError('Invalid API key', 401, 'UNAUTHORIZED')
      case 402:
        throw new InsufficientCreditsError(message)
      case 404:
        throw new JobNotFoundError(message)
      case 500:
        throw new ProcessingError(message)
      default:
        throw new ApiError(message, status)
    }
  }
}
