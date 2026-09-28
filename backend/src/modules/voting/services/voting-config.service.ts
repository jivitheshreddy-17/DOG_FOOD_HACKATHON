import { EventRepository, EventRecord } from '../../../core/repositories';
import { NotFoundError, ValidationError } from '../../../core/errors';
import { UpdateVotingConfigRequest, VotingConfigDto } from '../../../contracts';

export interface VotingConfigServiceDependencies {
  eventRepository: EventRepository;
}

export class VotingConfigService {
  constructor(private readonly dependencies: VotingConfigServiceDependencies) {}

  async getVotingConfig(eventId: string): Promise<VotingConfigDto> {
    const event = await this.dependencies.eventRepository.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    return this.mapToDto(event);
  }

  async updateVotingConfig(
    eventId: string,
    request: UpdateVotingConfigRequest
  ): Promise<VotingConfigDto> {
    const event = await this.dependencies.eventRepository.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    if (!this.dependencies.eventRepository.updateVotingConfig) {
      throw new Error('updateVotingConfig not implemented on EventRepository');
    }

    const updates: Partial<EventRecord> = {};

    if (request.votingMode !== undefined) {
      updates.votingMode = request.votingMode;
    }

    if (request.votingStartsAt !== undefined) {
      updates.votingStartsAt = request.votingStartsAt ? new Date(request.votingStartsAt) : null;
    }

    if (request.votingEndsAt !== undefined) {
      updates.votingEndsAt = request.votingEndsAt ? new Date(request.votingEndsAt) : null;
    }

    const startsAt = updates.votingStartsAt !== undefined ? updates.votingStartsAt : event.votingStartsAt;
    const endsAt = updates.votingEndsAt !== undefined ? updates.votingEndsAt : event.votingEndsAt;

    if (startsAt && endsAt && startsAt > endsAt) {
      throw new ValidationError('votingStartsAt cannot be after votingEndsAt');
    }

    if (request.isResultsPublished !== undefined) {
      updates.isResultsPublished = request.isResultsPublished;
    }

    if (request.maxVotesPerVoter !== undefined) {
      if (request.maxVotesPerVoter < 1) {
        throw new ValidationError('maxVotesPerVoter must be at least 1');
      }
      updates.maxVotesPerVoter = request.maxVotesPerVoter;
    }

    const updatedEvent = await this.dependencies.eventRepository.updateVotingConfig(eventId, updates);
    return this.mapToDto(updatedEvent);
  }

  private mapToDto(event: EventRecord): VotingConfigDto {
    return {
      eventId: event.id,
      votingMode: event.votingMode ?? 'AUTHENTICATED',
      votingStartsAt: event.votingStartsAt ? event.votingStartsAt.toISOString() : null,
      votingEndsAt: event.votingEndsAt ? event.votingEndsAt.toISOString() : null,
      isResultsPublished: event.isResultsPublished ?? false,
      maxVotesPerVoter: event.maxVotesPerVoter ?? 1,
    };
  }
}
