import { Clock } from '../../../core/clock';
import { EventRecord } from '../../../core/repositories';
import { VotingNotOpenError, VotingClosedError, InvalidVotingModeError } from '../../../core/errors';

export interface VotingWindowCheckResult {
  open: boolean;
  reason?: 'DISABLED' | 'NOT_OPEN' | 'CLOSED';
}

export class VotingWindowService {
  constructor(private readonly clock: Clock) {}

  checkVotingWindow(event: EventRecord, customNow?: Date): VotingWindowCheckResult {
    const now = customNow ?? this.clock.now();

    if (event.votingMode === 'DISABLED') {
      return { open: false, reason: 'DISABLED' };
    }

    if (event.votingStartsAt && now < event.votingStartsAt) {
      return { open: false, reason: 'NOT_OPEN' };
    }

    if (event.votingEndsAt && now >= event.votingEndsAt) {
      return { open: false, reason: 'CLOSED' };
    }

    return { open: true };
  }

  assertVotingWindowOpen(event: EventRecord, customNow?: Date): void {
    const result = this.checkVotingWindow(event, customNow);
    if (!result.open) {
      if (result.reason === 'DISABLED') {
        throw new InvalidVotingModeError(`Community voting is disabled for event '${event.id}'`);
      }
      if (result.reason === 'NOT_OPEN') {
        throw new VotingNotOpenError(`Voting for event '${event.id}' has not opened yet`);
      }
      if (result.reason === 'CLOSED') {
        throw new VotingClosedError(`Voting for event '${event.id}' has already closed`);
      }
    }
  }
}
