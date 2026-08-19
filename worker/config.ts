/**
 * Configuration Constants for Information Arbitrage Engine
 */
export const CONFIG = {
  // 💎 Default AI Credentials
  // Note: These are fallback values. In production, these should be managed via environment variables.
  DEFAULT_GEMINI_API_KEY: 'AIzaSyA2uc9ppPcxOSEsdKXy8ftN3V85gtl2TMY',
  // 🧠 Model Selection
  MODELS: {
    PRIMARY: 'google-ai-studio/gemini-2.0-flash-lite',
    ANALYST: 'google-ai-studio/gemini-2.0-flash',
    CONTENT: 'google-ai-studio/gemini-2.0-flash',
    AUDIT: 'google-ai-studio/gemini-1.5-pro'
  },
  // 🛡️ Governance Defaults
  GOVERNOR: {
    DEFAULT_RESERVE_FLOOR: 2500,
    DEFAULT_MAX_SPEND: 1000,
    DEFAULT_MAX_RISK: 0.75,
    COOLDOWN_MS: 300000 // 5 minutes
  },
  // 💰 Treasury Settings
  TREASURY: {
    BUCKETS: {
      RESERVE: 0.20,      // 20%
      OPERATING: 0.20,    // 20%
      REINVESTMENT: 0.15, // 15%
      TAX_BUFFER: 0.30,   // 30%
      OWNER: 0.15         // 15%
    },
    MIN_WITHDRAWAL: 50.00
  }
} as const;
/**
 * Standardized API Responses
 */
export const API_RESPONSES = {
  MISSING_MESSAGE: 'Message required',
  INVALID_MODEL: 'Invalid model',
  PROCESSING_ERROR: 'Failed to process message',
  NOT_FOUND: 'Not Found',
  AGENT_ROUTING_FAILED: 'Agent routing failed',
  INTERNAL_ERROR: 'Internal Server Error',
  UNAUTHORIZED: 'Unauthorized: Owner access only',
  SETUP_REQUIRED: 'System setup incomplete',
  ALREADY_RUNNING: 'Cycle already in progress',
  INSUFFICIENT_FUNDS: 'Insufficient treasury balance',
  COOLDOWN_ACTIVE: 'Operation restricted by cooldown policy'
} as const;