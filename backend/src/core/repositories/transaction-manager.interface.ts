import { AppRepositories } from '../application/dependencies';

export interface TransactionManager {
  /**
   * Executes an atomic operation within a transaction boundary.
   * If the operation succeeds, all changes made through the transaction-scoped
   * repositories are committed.
   * If the operation throws an error, all changes are rolled back.
   *
   * @param operation Async callback that receives transaction-scoped repositories.
   */
  run<T>(operation: (repositories: AppRepositories) => Promise<T>): Promise<T>;
}
