import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

// Defensive dotenv.config() call, same pattern as config/db.js and
// utils/uploadthing.js — ES module imports are hoisted and evaluated
// before server.js's own top-level dotenv.config() call runs.
dotenv.config();

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
  }
  return transporter;
}

// Callers should never let an email failure break the caller's own
// operation (marking someone absent, creating an onboarding invite must
// still succeed even if the mail server hiccups) — errors are logged, not
// thrown.
export async function sendMail({ to, subject, html, text }) {
  try {
    await getTransporter().sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'Advertisers360 HRMS'}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text,
    });
    return true;
  } catch (err) {
    console.error(`[mailer] failed to send "${subject}" to ${to}:`, err.message);
    return false;
  }
}
