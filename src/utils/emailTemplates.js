export function onboardingInviteEmail(link, expiresInDays) {
  const subject = "You're invited to join Advertisers360 HRMS";
  const text =
    `Hi,\n\n` +
    `You've been invited to join Advertisers360. Please complete your profile using the secure ` +
    `link below to activate your account:\n\n${link}\n\n` +
    `This link is valid for ${expiresInDays} day${expiresInDays === 1 ? '' : 's'} and can only be used once. ` +
    `If you were not expecting this invitation, you can ignore this email.\n\n` +
    `— Advertisers360 HRMS`;
  const html = `
    <div style="font-family: sans-serif; font-size: 14px; color: #141008;">
      <p>Hi,</p>
      <p>You've been invited to join Advertisers360. Please complete your profile using the secure link below to activate your account:</p>
      <p><a href="${link}" style="color: #2563eb;">${link}</a></p>
      <p style="color: #6b6b6b;">
        This link is valid for ${expiresInDays} day${expiresInDays === 1 ? '' : 's'} and can only be used once.
        If you were not expecting this invitation, you can ignore this email.
      </p>
      <p style="color: #6b6b6b;">— Advertisers360 HRMS</p>
    </div>
  `;
  return { subject, text, html };
}

export function autoAbsentEmail(fullName) {
  const subject = 'You have been marked Absent today';
  const text =
    `Hi ${fullName},\n\n` +
    `You have not checked in today, so your attendance has been automatically marked as Absent. ` +
    `Please inform your Manager and CEO about this.\n\n` +
    `— Advertisers360 HRMS`;
  const html = `
    <div style="font-family: sans-serif; font-size: 14px; color: #141008;">
      <p>Hi ${fullName},</p>
      <p>
        You have not checked in today, so your attendance has been automatically marked as
        <strong>Absent</strong>. Please inform your Manager and CEO about this.
      </p>
      <p style="color: #6b6b6b;">— Advertisers360 HRMS</p>
    </div>
  `;
  return { subject, text, html };
}
