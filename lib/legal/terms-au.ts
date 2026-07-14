/**
 * Legal copy constants for BorrowedHome (Australia)
 * Single source of truth for all legal text
 */

export const TERMS_VERSION = "2026-01-08-au-v1";

// Plain-English summary for Guest onboarding (non-binding)
export const onboardingSummaryGuest = {
  title: "Quick Summary (Not Legal Terms)",
  bullets: [
    "BorrowedHome is a platform that connects guests with hosts offering spaces for day-use only.",
    "Always pay and communicate through BorrowedHome to reduce fraud risk.",
    "If something looks inaccurate or unsafe, report the listing immediately.",
  ],
  footer: "This summary is for convenience only. The BorrowedHome Guest Terms control.",
};

// Plain-English summary for Host onboarding (non-binding)
export const onboardingSummaryHost = {
  title: "Quick Summary for Hosts (Not Legal Terms)",
  bullets: [
    "You must have legal authority to offer the space you list (owner/occupier/permission).",
    "Your photos and description must be accurate and not misleading.",
    "Day-use only means no overnight stays. Set clear house rules and access instructions.",
  ],
  footer: "This summary is for convenience only. The BorrowedHome Host Agreement and policies control.",
};

// Host Declaration (click-through, required)
export const hostDeclarationText = `I declare that I am the lawful owner or occupier of the property I am listing, or I have explicit legal authority to make the space available for day-use. I confirm that my listing information and photos are truthful, accurate, current, and not misleading. I understand that fake or misleading listings may result in immediate removal, withheld payouts, and account termination, and may be reported to relevant authorities.`;

// Short Host Declaration checkbox label (required before Publish)
export const hostDeclarationCheckboxLabel = "I confirm I have legal authority to offer this space and that my listing is accurate.";

// Day-Use Only / No Overnight risk allocation clause
export const dayUseRiskClauseMarkdown = `## Day-Use Only / No Overnight

BorrowedHome is for day-use bookings only. Overnight stays are not permitted.

Hosts and guests are responsible for complying with applicable laws, building rules, strata by-laws, lease conditions, and house rules. Guests must leave by the agreed end time.

BorrowedHome does not supervise in-person interactions and is not responsible for a host's or guest's acts or omissions. To the maximum extent permitted by law, each party assumes the risks associated with accessing and using a space in person.`;

// Guest Terms page content (ACL strong)
export const guestTermsMarkdown = `# BorrowedHome Guest Terms (Australia)

Last updated: January 8, 2026

## Platform Role and Consumer Rights (ACL Safe)

BorrowedHome operates an online platform that enables hosts to make residential spaces available for day-use only. BorrowedHome is not the owner, occupier, or provider of listed spaces unless expressly stated otherwise.

Nothing in these Terms excludes, restricts, or modifies any consumer guarantees or rights you may have under the Australian Consumer Law (ACL) that cannot lawfully be excluded.

## Guest Obligations and Prohibited Conduct

As a guest, you agree that you will not:

- Use the platform for unlawful, misleading, or fraudulent purposes
- Attempt to bypass the platform's payment, booking, or messaging systems
- Provide false or misleading information when creating an account or making a booking
- Use a space in a manner inconsistent with its day-use only designation

BorrowedHome may suspend or terminate guest access where misuse, fraud, or risk to safety is reasonably suspected.

## Listings, Accuracy, and Reliance

Listings are created and maintained by hosts. BorrowedHome does not independently verify every aspect of a listing and does not guarantee that a space will meet individual expectations beyond what is expressly described.

Guests are encouraged to review listings carefully, use platform messaging to clarify details, and report suspected inaccuracies or misconduct promptly.

## Reporting and Platform Action

Guests may report listings or conduct they reasonably believe to be misleading, unsafe, or fraudulent.

BorrowedHome may, at its discretion, suspend listings, cancel bookings, issue refunds in accordance with platform policies, and investigate and take enforcement action against hosts.

## Limitation of Liability (ACL-Compliant)

To the maximum extent permitted by law, BorrowedHome is not liable for indirect or consequential loss arising from the use of the platform.

Where BorrowedHome is required under the ACL to accept liability, that liability is limited (at BorrowedHome's option) to resupplying the services or paying the cost of having the services supplied again.

${dayUseRiskClauseMarkdown}

## Contact

For questions about these Terms, contact: hello@borrowedhome.app`;

// Host Agreement page content (AU)
export const hostAgreementMarkdown = `# BorrowedHome Host Agreement (Australia)

Last updated: July 9, 2026

## Platform Role

BorrowedHome operates an online marketplace that enables hosts to offer residential spaces for day-use only. BorrowedHome is not the owner, occupier, property manager, or insurer of your space unless expressly stated otherwise.

Nothing in this Agreement excludes, restricts, or modifies any rights or remedies under the Australian Consumer Law that cannot lawfully be excluded.

## Authority and Accuracy

By listing a space you confirm that:

- You are the lawful owner or occupier, or you have explicit legal authority to offer the space for day-use
- Your photos, description, house rules, and availability are truthful, accurate, and not misleading
- You will keep your listing current and correct material changes promptly

Fake, “ghost,” or deliberately misleading listings may result in immediate removal, withheld payouts, account suspension, and referral to relevant authorities.

## Day-Use Only

All bookings are day-use only. Overnight stays, accommodation, lodging, and tenancy are prohibited. Bookings must end by the agreed end time (platform rules require endings by 9:00 PM unless a stricter house rule applies).

You are responsible for complying with applicable laws, strata by-laws, lease conditions, council rules, and insurance requirements for your property and activities.

## Insurance and Risk

BorrowedHome does not provide property, public liability, or contents insurance for hosts or guests. You are responsible for assessing whether your existing insurance covers day-use visitors and for obtaining additional cover if needed.

In-person interactions carry inherent risks. To the maximum extent permitted by law, you assume the risks associated with hosting guests at your property.

## Payments and Off-Platform Conduct

Payments, refunds, and deposits must be processed through BorrowedHome and Stripe. Do not solicit or accept off-platform payments for bookings made on the platform.

Bypassing platform payments or messaging to avoid fees, deposits, or safety controls may result in suspension and forfeiture of protections that rely on platform records.

## Platform Action

BorrowedHome may, at its discretion:

- Unpublish or remove listings
- Suspend or terminate host accounts
- Cancel bookings and handle refunds in accordance with platform policies
- Investigate reports of misleading, unsafe, or fraudulent conduct

## Host Declaration

Before publishing a listing you must accept the Host Declaration presented in the product. That declaration forms part of your obligations under this Agreement.

## Contact

For questions about this Agreement, contact: hello@borrowedhome.app`;
