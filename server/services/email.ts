/**
 * Sends email. Invitations and resets contain only a link: never patient information.
 * Development prints to the console; production uses Amazon SES (wired up in the AWS phase).
 */
export interface Email { to: string; subject: string; text: string }
export interface EmailProvider { send(mail: Email): Promise<void> }

export const consoleEmail: EmailProvider = {
  async send(m) {
    console.log(`\n[email:dev] to ${m.to}\n  ${m.subject}\n  ${m.text.replace(/\n/g, '\n  ')}\n`);
  },
};

export const sesEmail: EmailProvider = {
  async send() {
    throw new Error('Amazon SES is not connected yet (AWS phase). Set EMAIL_PROVIDER=console for development.');
  },
};

export const inviteEmail = (to: string, practiceName: string, link: string, hours: number): Email => ({
  to,
  subject: `You're invited to ${practiceName} on Plenire`,
  text: `You've been invited to join ${practiceName} on Plenire.\n\nSet your password here (the link works once and expires in ${hours} hours):\n${link}\n\nIf you weren't expecting this, you can ignore this email.`,
});

export const adminInviteEmail = (to: string, link: string, hours: number): Email => ({
  to,
  subject: 'Your Plenire platform admin invitation',
  text: `You've been invited as a Plenire platform admin.\n\nSet your password here (works once, expires in ${hours} hours):\n${link}`,
});

export const resetEmail = (to: string, link: string): Email => ({
  to,
  subject: 'Reset your Plenire password',
  text: `Someone asked to reset the password for this email address.\n\nChoose a new password here (works once, expires in 1 hour):\n${link}\n\nIf this wasn't you, ignore this email: your password has not changed.`,
});
