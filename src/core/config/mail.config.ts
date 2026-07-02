import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  mailFrom: process.env.MAIL_FROM,
  sendgridApiKey: process.env.SENDGRID_API_KEY,
}));
