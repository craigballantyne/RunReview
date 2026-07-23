import { Resend } from "resend";
import type { Env } from "../config/env.js";

export interface Mailer {
  sendVerificationEmail(to: string, verifyUrl: string): Promise<void>;
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
}

export function createMailer(env: Env): Mailer {
  const resend = new Resend(env.RESEND_API_KEY);

  return {
    async sendVerificationEmail(to, verifyUrl) {
      const { error } = await resend.emails.send({
        from: env.EMAIL_FROM,
        to,
        subject: "Verify your Run Review account",
        html: `<p>Welcome to Run Review. Click the link below to verify your email address:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>If you didn't create this account, you can ignore this email.</p>`,
      });
      // The Resend SDK does not throw on API-level failures (e.g. an unverified sending
      // domain) — it returns { data: null, error } instead, which silently no-ops if unchecked.
      if (error) throw new Error(`Resend error sending verification email: ${error.message}`);
    },
    async sendPasswordResetEmail(to, resetUrl) {
      const { error } = await resend.emails.send({
        from: env.EMAIL_FROM,
        to,
        subject: "Reset your Run Review password",
        html: `<p>We received a request to reset your Run Review password. Click the link below to choose a new one:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
      });
      if (error) throw new Error(`Resend error sending password reset email: ${error.message}`);
    },
  };
}
