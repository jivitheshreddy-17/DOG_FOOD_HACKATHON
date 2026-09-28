import * as nodemailer from 'nodemailer';

export interface EmailDeliveryService {
  sendOtpEmail(email: string, eventId: string, otp: string, expiresAt: Date): Promise<void>;
}

export class DevelopmentEmailDeliveryService implements EmailDeliveryService {
  async sendOtpEmail(email: string, eventId: string, otp: string, expiresAt: Date): Promise<void> {
    const isDev = process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEV_OTP === 'true';
    if (!isDev) {
      throw new Error('Production email delivery is not configured. Failing closed.');
    }
    console.log(`[DEV EMAIL] To: ${email} | Event: ${eventId} | OTP: ${otp} | Expires: ${expiresAt.toISOString()}`);
  }
}

export class SmtpEmailDeliveryService implements EmailDeliveryService {
  private transporter: nodemailer.Transporter;

  constructor() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      throw new Error('SMTP configuration is missing. Failing closed.');
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  async sendOtpEmail(email: string, eventId: string, otp: string, expiresAt: Date): Promise<void> {
    const from = process.env.SMTP_FROM || 'noreply@dogfood.hackathon';
    
    await this.transporter.sendMail({
      from,
      to: email,
      subject: `Your DOGFOOD voting OTP code for event ${eventId}`,
      text: `Your OTP code is: ${otp}\n\nIt expires at ${expiresAt.toISOString()}.\n\nDo not share this code.`,
      html: `<p>Your OTP code is: <strong>${otp}</strong></p><p>It expires at ${expiresAt.toISOString()}.</p><p>Do not share this code.</p>`,
    });
  }
}
