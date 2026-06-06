import type { ApiResponse } from '@/types';

export function successResponse<T>(data: T, message?: string): ApiResponse<T> {
  return { data, error: null, message };
}

export function errorResponse(error: string): ApiResponse<never> {
  return { data: null, error };
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
}
