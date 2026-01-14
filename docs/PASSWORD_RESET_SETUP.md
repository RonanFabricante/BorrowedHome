# Password Reset Flow Setup

This document describes the password reset flow implementation and required Supabase configuration.

## Overview

The password reset flow consists of three pages:
1. **Login page** (`/auth/login`) - Contains "Forgot password?" link
2. **Reset password request** (`/auth/reset-password`) - User enters email to receive reset link
3. **Update password** (`/auth/update-password`) - User sets new password from email link

## Environment Variables

### Required

Add to `.env.local` (development) and production environment:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

For production:
```env
NEXT_PUBLIC_SITE_URL=https://borrowedhome.app
```

This is used to construct the reset password redirect URL that Supabase includes in the email.

## Supabase Dashboard Configuration

### 1. URL Configuration

Go to **Authentication** → **URL Configuration** in your Supabase dashboard:

- **Site URL**: `https://borrowedhome.app`
- **Redirect URLs**: Add the following:
  - `https://borrowedhome.app/auth/update-password`
  - `http://localhost:3000/auth/update-password` (for local development)

### 2. Email Templates

Go to **Authentication** → **Emails** → **Templates**:

1. **Reset Password Template**:
   - Ensure the template exists
   - The template should use `{{ .ConfirmationURL }}` to include the reset link
   - Example: "Click here to reset your password: {{ .ConfirmationURL }}"

2. **Email Sender Configuration**:
   - Configure the sender email (e.g., `no-reply@borrowedhome.app`)
   - Ensure Postmark SMTP is configured for email delivery

### 3. Email Settings

- **Enable email confirmations**: Not required for password reset (it's separate)
- **Enable password resets**: Should be enabled by default

## Security Features

### Account Enumeration Prevention

The reset password flow **never reveals** whether an email exists in the system:
- Success message is always shown: "If an account exists for that email, we've sent a password reset link."
- Error messages are generic: "Something went wrong. Please try again."

### Token Handling

- Reset tokens are handled automatically by Supabase
- Tokens are validated via session checks in the update password page
- Expired/invalid tokens show a helpful error message with a link to request a new reset

## User Flow

1. User clicks "Forgot password?" on login page
2. User enters email address on reset password page
3. User receives email with reset link (if email exists)
4. User clicks link → redirected to `/auth/update-password`
5. User sets new password
6. User is redirected to login page
7. User signs in with new password

## Testing Checklist

- [ ] "Forgot password?" link appears on login page
- [ ] Reset password page shows success message (regardless of email existence)
- [ ] Email arrives with reset link (check Postmark dashboard)
- [ ] Clicking link opens update password page
- [ ] User can set new password
- [ ] Password confirmation validation works
- [ ] After update, user can sign in with new password
- [ ] Expired/invalid link shows error message
- [ ] Error message includes link to request new reset
- [ ] Success message never reveals if email exists

## Troubleshooting

### Email not received

1. Check Postmark SMTP configuration in Supabase
2. Check spam folder
3. Verify email sender is configured correctly
4. Check Supabase logs for email delivery errors

### Link not working / "Link expired" error

1. Verify redirect URL is configured in Supabase dashboard
2. Check that `NEXT_PUBLIC_SITE_URL` matches the redirect URL
3. Reset links expire after a set time (check Supabase settings)
4. Ensure the user clicks the link within the expiration window

### Redirect URL mismatch

- Ensure `NEXT_PUBLIC_SITE_URL` matches exactly (including protocol: `https://` vs `http://`)
- Verify redirect URLs in Supabase dashboard include the exact path: `/auth/update-password`
- Check for trailing slashes (should not have one)
