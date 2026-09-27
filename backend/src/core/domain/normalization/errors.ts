export class NormalizationError extends Error {
  public code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'NormalizationError';
    this.code = code;
  }
}
