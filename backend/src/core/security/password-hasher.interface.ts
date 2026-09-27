/**
 * Password hashing and verification abstraction.
 * Decouples identity/authentication services from specific cryptographic algorithms.
 */
export interface PasswordHasher {
  /**
   * Hashes a plaintext password and returns an encoded representation
   * suitable for storage (including salt).
   */
  hash(password: string): Promise<string>;

  /**
   * Verifies a plaintext password against a stored password hash.
   * Must use constant-time comparison to prevent timing side-channel attacks.
   * Must safely return false if the hash format is malformed or invalid.
   */
  verify(password: string, passwordHash: string): Promise<boolean>;
}
