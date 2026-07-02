// Email service for BorrowedHome
// Sends transactional emails via Postmark API or Supabase SMTP

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface BookingEmailData {
  bookingId: string;
  guestName?: string;
  hostName?: string;
  listingTitle: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  paymentDeadline?: string;
  bookingUrl?: string; // Optional - some emails construct URL from bookingId
  refundAmount?: number; // For cancellation emails
  paymentAction?: "voided" | "refunded" | "none" | "failed"; // For cancellation emails
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://borrowedhome.app";

/**
 * Format currency for email display
 */
function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Format date/time for email display
 */
function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    dateStyle: "long",
    timeStyle: "short",
  });
}

/**
 * Send email via Postmark API (preferred for product emails)
 */
async function sendViaPostmark(options: EmailOptions): Promise<void> {
  const postmarkApiKey = process.env.POSTMARK_API_KEY;
  const postmarkServerToken = process.env.POSTMARK_SERVER_TOKEN;

  if (!postmarkApiKey && !postmarkServerToken) {
    throw new Error("POSTMARK_API_KEY or POSTMARK_SERVER_TOKEN not configured");
  }

  const apiKey = postmarkApiKey || postmarkServerToken;
  const fromEmail = process.env.POSTMARK_FROM_EMAIL || "hello@borrowedhome.app";

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": apiKey!,
    },
    body: JSON.stringify({
      From: fromEmail,
      To: options.to,
      Subject: options.subject,
      HtmlBody: options.html,
      TextBody: options.text || options.html.replace(/<[^>]*>/g, ""), // Strip HTML for text version
      MessageStream: "outbound",
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ ErrorCode: response.status, Message: response.statusText }));
    throw new Error(`Postmark API error: ${error.ErrorCode} - ${error.Message}`);
  }
}

/**
 * Send email (uses Postmark API if available, otherwise throws error)
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  // For now, use Postmark API directly
  // In the future, could fall back to Supabase SMTP if needed
  await sendViaPostmark(options);
}

/**
 * Send booking request notification to host
 */
export async function sendHostBookingRequestedEmail(
  hostEmail: string,
  hostName: string,
  data: BookingEmailData
): Promise<void> {
  const bookingUrl = `${SITE_URL}/bookings/${data.bookingId}/confirm`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Booking Request</h1>
        </div>
        <p>Hi ${hostName},</p>
        <p>You have a new booking request for <strong>${data.listingTitle}</strong>.</p>
        <p><strong>Details:</strong></p>
        <ul>
          <li>Guest: ${data.guestName || "Guest"}</li>
          <li>Date & Time: ${formatDateTime(data.startTime)} - ${formatDateTime(data.endTime)}</li>
          <li>Total Amount: ${formatCurrency(data.totalAmount)}</li>
        </ul>
        <p>Please review and respond to this request.</p>
        <a href="${bookingUrl}" class="button">View Booking Request</a>
        <div class="footer">
          <p>This is an automated email from BorrowedHome. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: hostEmail,
    subject: `New Booking Request: ${data.listingTitle}`,
    html,
  });
}

/**
 * Send payment required notification to guest
 */
export async function sendGuestPaymentRequiredEmail(
  guestEmail: string,
  guestName: string,
  data: BookingEmailData
): Promise<void> {
  if (!data.paymentDeadline) {
    throw new Error("Payment deadline is required for payment required email");
  }

  const bookingUrl = `${SITE_URL}/bookings/${data.bookingId}/confirm`;
  const deadlineDate = new Date(data.paymentDeadline);
  const now = new Date();
  const hoursRemaining = Math.max(0, Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60)));

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .alert { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 4px; margin: 20px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Booking Accepted - Payment Required</h1>
        </div>
        <p>Hi ${guestName},</p>
        <p>Great news! Your booking request for <strong>${data.listingTitle}</strong> has been accepted by the host.</p>
        <div class="alert">
          <strong>⏰ Payment Deadline:</strong> ${formatDateTime(data.paymentDeadline)}<br>
          <strong>Time Remaining:</strong> ${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}
        </div>
        <p><strong>Booking Details:</strong></p>
        <ul>
          <li>Date & Time: ${formatDateTime(data.startTime)} - ${formatDateTime(data.endTime)}</li>
          <li>Total Amount: ${formatCurrency(data.totalAmount)}</li>
        </ul>
        <p>Please complete payment within the next ${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''} to confirm your booking.</p>
        <a href="${bookingUrl}" class="button">Complete Payment</a>
        <div class="footer">
          <p>This is an automated email from BorrowedHome. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: guestEmail,
    subject: `Complete Payment for ${data.listingTitle} - ${hoursRemaining}h remaining`,
    html,
  });
}

/**
 * Send booking rejected notification to guest
 */
export async function sendGuestRequestRejectedEmail(
  guestEmail: string,
  guestName: string,
  data: BookingEmailData
): Promise<void> {
  const bookingUrl = `${SITE_URL}/bookings/${data.bookingId}/confirm`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Booking Request Not Available</h1>
        </div>
        <p>Hi ${guestName},</p>
        <p>Unfortunately, your booking request for <strong>${data.listingTitle}</strong> was not available.</p>
        <p><strong>Requested Details:</strong></p>
        <ul>
          <li>Date & Time: ${formatDateTime(data.startTime)} - ${formatDateTime(data.endTime)}</li>
        </ul>
        <p>You can browse other available listings or try a different time slot.</p>
        <a href="${SITE_URL}/listings" class="button">Browse Listings</a>
        <div class="footer">
          <p>This is an automated email from BorrowedHome. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: guestEmail,
    subject: `Booking Request: ${data.listingTitle}`,
    html,
  });
}

/**
 * Send booking confirmed notification to guest
 */
export async function sendGuestBookingConfirmedEmail(
  guestEmail: string,
  guestName: string,
  data: BookingEmailData
): Promise<void> {
  const bookingUrl = `${SITE_URL}/bookings/${data.bookingId}/confirm`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #d4edda; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Booking Confirmed</h1>
        </div>
        <p>Hi ${guestName},</p>
        <p>Your booking for <strong>${data.listingTitle}</strong> has been confirmed!</p>
        <p><strong>Booking Details:</strong></p>
        <ul>
          <li>Date & Time: ${formatDateTime(data.startTime)} - ${formatDateTime(data.endTime)}</li>
          <li>Total Amount: ${formatCurrency(data.totalAmount)}</li>
        </ul>
        <p>Your payment has been received and your booking is confirmed.</p>
        <a href="${bookingUrl}" class="button">View Booking Details</a>
        <div class="footer">
          <p>This is an automated email from BorrowedHome. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: guestEmail,
    subject: `Booking Confirmed: ${data.listingTitle}`,
    html,
  });
}

/**
 * Send booking confirmed notification to host
 */
export async function sendHostBookingConfirmedEmail(
  hostEmail: string,
  hostName: string,
  data: BookingEmailData
): Promise<void> {
  const bookingUrl = `${SITE_URL}/bookings/${data.bookingId}/confirm`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #d4edda; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Booking Confirmed</h1>
        </div>
        <p>Hi ${hostName},</p>
        <p>The guest has completed payment for the booking at <strong>${data.listingTitle}</strong>.</p>
        <p><strong>Booking Details:</strong></p>
        <ul>
          <li>Guest: ${data.guestName || "Guest"}</li>
          <li>Date & Time: ${formatDateTime(data.startTime)} - ${formatDateTime(data.endTime)}</li>
          <li>Total Amount: ${formatCurrency(data.totalAmount)}</li>
        </ul>
        <a href="${bookingUrl}" class="button">View Booking Details</a>
        <div class="footer">
          <p>This is an automated email from BorrowedHome. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: hostEmail,
    subject: `Booking Confirmed: ${data.listingTitle}`,
    html,
  });
}

/**
 * Send payment expired notification to guest
 */
export async function sendGuestPaymentExpiredEmail(
  guestEmail: string,
  guestName: string,
  data: BookingEmailData
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8d7da; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Payment Window Expired</h1>
        </div>
        <p>Hi ${guestName},</p>
        <p>Unfortunately, the payment window for your booking request at <strong>${data.listingTitle}</strong> has expired.</p>
        <p><strong>Requested Details:</strong></p>
        <ul>
          <li>Date & Time: ${formatDateTime(data.startTime)} - ${formatDateTime(data.endTime)}</li>
        </ul>
        <p>The time slot is now available again. You can submit a new booking request if you're still interested.</p>
        <a href="${SITE_URL}/listings" class="button">Browse Listings</a>
        <div class="footer">
          <p>This is an automated email from BorrowedHome. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: guestEmail,
    subject: `Payment Window Expired: ${data.listingTitle}`,
    html,
  });
}

/**
 * Send booking cancelled by guest notification to host
 */
export async function sendHostBookingCancelledByGuestEmail(
  hostEmail: string,
  hostName: string,
  data: BookingEmailData
): Promise<void> {
  const bookingUrl = `${SITE_URL}/bookings/${data.bookingId}/confirm`;
  const refundInfo = data.paymentAction === "voided"
    ? "The payment authorization was voided and funds will be released by your bank (typically within a few business days)."
    : data.paymentAction === "refunded"
    ? `A refund of ${formatCurrency(data.refundAmount || data.totalAmount)} has been initiated and may take 5-10 business days depending on your bank.`
    : "Payment processing is pending.";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Booking Cancelled by Guest</h1>
        </div>
        <p>Hi ${hostName},</p>
        <p>The guest has cancelled their booking for <strong>${data.listingTitle}</strong>.</p>
        <p><strong>Booking Details:</strong></p>
        <ul>
          <li>Guest: ${data.guestName || "Guest"}</li>
          <li>Date & Time: ${formatDateTime(data.startTime)} - ${formatDateTime(data.endTime)}</li>
          <li>Total Amount: ${formatCurrency(data.totalAmount)}</li>
        </ul>
        <p><strong>Refund Information:</strong></p>
        <p>${refundInfo}</p>
        <p>The time slot is now available again for other bookings.</p>
        <a href="${bookingUrl}" class="button">View Booking Details</a>
        <div class="footer">
          <p>This is an automated email from BorrowedHome. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: hostEmail,
    subject: `Booking Cancelled: ${data.listingTitle}`,
    html,
  });
}

/**
 * Send booking cancelled by guest notification to guest
 */
export async function sendGuestBookingCancelledByGuestEmail(
  guestEmail: string,
  guestName: string,
  data: BookingEmailData
): Promise<void> {
  const bookingUrl = `${SITE_URL}/bookings/${data.bookingId}/confirm`;
  const refundInfo = data.paymentAction === "voided"
    ? "The payment authorization was voided and funds will be released by your bank (typically within a few business days)."
    : data.paymentAction === "refunded"
    ? `A refund of ${formatCurrency(data.refundAmount || data.totalAmount)} has been initiated and may take 5-10 business days depending on your bank.`
    : "Payment processing is pending.";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Booking Cancelled</h1>
        </div>
        <p>Hi ${guestName},</p>
        <p>Your booking for <strong>${data.listingTitle}</strong> has been cancelled.</p>
        <p><strong>Booking Details:</strong></p>
        <ul>
          <li>Date & Time: ${formatDateTime(data.startTime)} - ${formatDateTime(data.endTime)}</li>
          <li>Total Amount: ${formatCurrency(data.totalAmount)}</li>
        </ul>
        <p><strong>Refund Information:</strong></p>
        <p>${refundInfo}</p>
        <a href="${bookingUrl}" class="button">View Booking Details</a>
        <div class="footer">
          <p>This is an automated email from BorrowedHome. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: guestEmail,
    subject: `Booking Cancelled: ${data.listingTitle}`,
    html,
  });
}

/**
 * Send booking cancelled by host notification to guest
 */
export async function sendGuestBookingCancelledByHostEmail(
  guestEmail: string,
  guestName: string,
  data: BookingEmailData
): Promise<void> {
  const bookingUrl = `${SITE_URL}/bookings/${data.bookingId}/confirm`;
  const refundInfo = data.paymentAction === "voided"
    ? "The payment authorization was voided and funds will be released by your bank (typically within a few business days)."
    : data.paymentAction === "refunded"
    ? `A full refund of ${formatCurrency(data.refundAmount || data.totalAmount)} has been initiated and may take 5-10 business days depending on your bank.`
    : "Payment processing is pending.";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #fff3cd; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Booking Cancelled by Host</h1>
        </div>
        <p>Hi ${guestName},</p>
        <p>Unfortunately, the host has cancelled your booking for <strong>${data.listingTitle}</strong>.</p>
        <p><strong>Booking Details:</strong></p>
        <ul>
          <li>Date & Time: ${formatDateTime(data.startTime)} - ${formatDateTime(data.endTime)}</li>
          <li>Total Amount: ${formatCurrency(data.totalAmount)}</li>
        </ul>
        <p><strong>Refund Information:</strong></p>
        <p>${refundInfo}</p>
        <p>We apologize for any inconvenience. You can browse other available listings or try a different time.</p>
        <a href="${SITE_URL}/listings" class="button">Browse Listings</a>
        <div class="footer">
          <p>This is an automated email from BorrowedHome. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: guestEmail,
    subject: `Booking Cancelled by Host: ${data.listingTitle}`,
    html,
  });
}

/**
 * Send booking cancelled by host notification to host
 */
export async function sendHostBookingCancelledByHostEmail(
  hostEmail: string,
  hostName: string,
  data: BookingEmailData
): Promise<void> {
  const bookingUrl = `${SITE_URL}/bookings/${data.bookingId}/confirm`;
  const refundInfo = data.paymentAction === "voided"
    ? "The payment authorization was voided and funds will be released to the guest's bank (typically within a few business days)."
    : data.paymentAction === "refunded"
    ? `A full refund of ${formatCurrency(data.refundAmount || data.totalAmount)} has been initiated and may take 5-10 business days depending on the guest's bank.`
    : "Payment processing is pending.";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Booking Cancelled</h1>
        </div>
        <p>Hi ${hostName},</p>
        <p>You have cancelled the booking for <strong>${data.listingTitle}</strong>.</p>
        <p><strong>Booking Details:</strong></p>
        <ul>
          <li>Guest: ${data.guestName || "Guest"}</li>
          <li>Date & Time: ${formatDateTime(data.startTime)} - ${formatDateTime(data.endTime)}</li>
          <li>Total Amount: ${formatCurrency(data.totalAmount)}</li>
        </ul>
        <p><strong>Refund Information:</strong></p>
        <p>${refundInfo}</p>
        <p>The time slot is now available again for other bookings.</p>
        <a href="${bookingUrl}" class="button">View Booking Details</a>
        <div class="footer">
          <p>This is an automated email from BorrowedHome. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: hostEmail,
    subject: `Booking Cancelled: ${data.listingTitle}`,
    html,
  });
}
