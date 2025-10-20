export class ExponentialBackoff {
  private static readonly DEFAULT_BASE_DELAY = 1000; // 1 second
  private static readonly DEFAULT_MAX_DELAY = 30000; // 30 seconds
  private static readonly DEFAULT_MAX_RETRIES = 3;

  static async executeWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = ExponentialBackoff.DEFAULT_MAX_RETRIES,
    baseDelay: number = ExponentialBackoff.DEFAULT_BASE_DELAY,
    maxDelay: number = ExponentialBackoff.DEFAULT_MAX_DELAY
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on client errors (4xx) except rate limits
        if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
          if (error.response.status === 429) {
            // Rate limit - continue with backoff
            console.warn(`Rate limit hit, attempt ${attempt + 1}/${maxRetries + 1}`);
          } else {
            // Other client errors - don't retry
            throw error;
          }
        }
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        const jitter = Math.random() * 0.1 * delay; // Add up to 10% jitter
        const finalDelay = delay + jitter;
        
        console.log(`Attempt ${attempt + 1} failed, retrying in ${Math.round(finalDelay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, finalDelay));
      }
    }
    
    throw lastError;
  }
}