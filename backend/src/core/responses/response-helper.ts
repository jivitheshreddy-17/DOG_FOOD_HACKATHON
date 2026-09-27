export interface SuccessResponse<T> {
  data: T;
}

/**
 * Creates a standard successful API response envelope.
 */
export function successResponse<T>(data: T): SuccessResponse<T> {
  return {
    data,
  };
}
