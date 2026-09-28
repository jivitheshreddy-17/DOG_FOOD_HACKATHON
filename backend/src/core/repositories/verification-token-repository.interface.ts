export interface VerificationTokenDTO {
  id?: string;
  email: string;
  tokenHash: string;
  eventId: string;
  expiresAt: Date;
  usedAt?: Date | null;
  createdAt?: Date;
}

export interface VerificationTokenRepository {
  create(data: VerificationTokenDTO): Promise<VerificationTokenDTO>;
  findByTokenHash(tokenHash: string): Promise<VerificationTokenDTO | null>;
  consumeToken(tokenHash: string): Promise<boolean>;
  deleteByEvent(eventId: string): Promise<void>;
}
