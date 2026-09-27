import { AuthenticatedUser } from '@hackathon/contracts';
import { UserRepository } from '../../../core/repositories';
import { PasswordHasher, DEFAULT_DUMMY_HASH } from '../../../core/security';
import { UnauthorizedError } from '../../../core/errors';
import { toAuthenticatedUser } from '../../../core/types/mappers';

export interface AuthenticationServiceDeps {
  userRepository: UserRepository;
  passwordHasher: PasswordHasher;
  dummyHash?: string;
}

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Core authentication application service.
 * Handles credential verification, constant-time execution against enumeration,
 * and safe authenticated identity generation.
 *
 * Responsibilities:
 * - Email normalization (trimming, lowercasing)
 * - User credential retrieval via UserRepository seam
 * - Constant-time cryptographic verification via PasswordHasher abstraction
 * - Prevention of user enumeration via identical failure errors and dummy hash execution
 * - Sanitized AuthenticatedUser output excluding all sensitive fields
 */
export class AuthenticationService {
  private readonly dummyHash: string;

  constructor(private readonly deps: AuthenticationServiceDeps) {
    this.dummyHash = deps.dummyHash ?? DEFAULT_DUMMY_HASH;
  }

  async authenticate(credentials: Credentials): Promise<AuthenticatedUser>;
  async authenticate(email: string, password: string): Promise<AuthenticatedUser>;
  async authenticate(
    emailOrCredentials: string | Credentials,
    maybePassword?: string
  ): Promise<AuthenticatedUser> {
    let email: string;
    let password: string;

    if (typeof emailOrCredentials === 'object' && emailOrCredentials !== null) {
      email = emailOrCredentials.email;
      password = emailOrCredentials.password;
    } else {
      email = emailOrCredentials;
      password = maybePassword ?? '';
    }

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      throw new UnauthorizedError('Invalid credentials');
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.length === 0) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const user = await this.deps.userRepository.findByEmail(normalizedEmail);

    if (!user) {
      // Execute constant-time dummy verification to mitigate timing-based user enumeration attacks
      await this.deps.passwordHasher.verify(password, this.dummyHash);
      throw new UnauthorizedError('Invalid credentials');
    }

    const isValid = await this.deps.passwordHasher.verify(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    return toAuthenticatedUser(user);
  }
}
