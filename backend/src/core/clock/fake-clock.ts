import { Clock } from './clock';

export class FakeClock implements Clock {
  private currentTime: Date;

  constructor(initialTime: Date | string | number = new Date()) {
    this.currentTime = new Date(initialTime);
  }

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  setTime(time: Date | string | number): void {
    this.currentTime = new Date(time);
  }

  advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  advanceSeconds(seconds: number): void {
    this.advance(seconds * 1000);
  }

  advanceMinutes(minutes: number): void {
    this.advance(minutes * 60 * 1000);
  }
}
