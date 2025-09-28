/**
 * Jest setup file - runs before all tests
 */

import { config } from 'dotenv'

// Load environment variables from .env file in current directory
config({ path: '.env' })

// Set test environment defaults
process.env.NODE_ENV = 'test'

// Mock console methods in tests to reduce noise (can be overridden per test)
global.console = {
  ...console,
  // Uncomment to suppress logs in tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
}
