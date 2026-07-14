import { DAY_USE_RULES } from "@/lib/constants/copy";
import { SUPPORT_EMAIL } from "@/components/support-contact";

export type FaqItem = {
  id: string;
  question: string;
  answer: string[];
  /** Optional internal links shown under the answer */
  links?: { href: string; label: string }[];
};

export type FaqSection = {
  id: string;
  title: string;
  items: FaqItem[];
};

export const FAQ_SECTIONS: FaqSection[] = [
  {
    id: "basics",
    title: "The basics",
    items: [
      {
        id: "what-is",
        question: "What is BorrowedHome?",
        answer: [
          "BorrowedHome is a marketplace for day-use access to real lived-in homes — kitchens, living rooms, gardens, pools, and similar spaces.",
          "There are no overnight stays and no bedrooms. Guests book by the hour or in blocks for daytime use only.",
        ],
      },
      {
        id: "day-use-rules",
        question: "What are the day-use rules?",
        answer: [
          DAY_USE_RULES + ".",
          "Overnight stays are not allowed. Guests must leave by the agreed end time.",
        ],
      },
      {
        id: "who-can-use",
        question: "Who can use BorrowedHome?",
        answer: [
          "You must be 18 or older to create an account as a guest or host.",
          "Hosts list spaces they control; guests book those spaces for daytime activities.",
        ],
        links: [{ href: "/auth/signup", label: "Create an account" }],
      },
    ],
  },
  {
    id: "guests",
    title: "Booking as a guest",
    items: [
      {
        id: "how-to-book",
        question: "How do I book a home?",
        answer: [
          "Search by location, date, and time, then open a listing you like.",
          "Request a booking for your chosen window (at least 2 hours, ending by 9:00 PM).",
          "The host reviews your request. If they accept, you have a limited time to pay and confirm.",
          "Once payment succeeds, the booking is confirmed and messaging unlocks. The full address is revealed for confirmed bookings.",
        ],
        links: [
          { href: "/listings", label: "Browse homes" },
          { href: "/my-bookings", label: "My bookings" },
        ],
      },
      {
        id: "lead-time",
        question: "How far ahead do I need to book?",
        answer: [
          "Bookings must start at least 4 hours from the time you request them.",
          "The host also cannot accept a request if the start time is less than 4 hours away.",
        ],
      },
      {
        id: "payment-window",
        question: "What happens after a host accepts?",
        answer: [
          "Your booking moves to “Awaiting payment.” You typically have 4 hours to complete payment.",
          "During that window the time slot is held for you. If you don’t pay in time, the booking expires and the slot opens again.",
        ],
      },
      {
        id: "payment-hold",
        question: "When am I charged?",
        answer: [
          "When you pay, your card is authorised (held). The rental amount is captured after the booking is completed and a short review window passes, unless there’s a dispute.",
          "A security deposit may also be authorised separately and released after the visit if there’s no issue reported.",
        ],
      },
      {
        id: "address",
        question: "When do I get the address?",
        answer: [
          "The full street address is only shown after your booking is confirmed (paid).",
          "Before that, you’ll see a general location (for example suburb or area) so you can decide whether to request.",
        ],
      },
      {
        id: "messaging",
        question: "Can I message the host?",
        answer: [
          "In-app messaging unlocks after a booking is confirmed.",
          "Use it for arrival details, house rules questions, and coordination — not as a substitute for the booking request flow.",
        ],
      },
      {
        id: "cancel-guest",
        question: "Can I cancel a booking?",
        answer: [
          "Confirmed bookings can be cancelled through the booking flow where available. Refunds depend on timing and the booking’s payment state.",
          "If you’re stuck or something looks wrong, email support with your booking details.",
        ],
        links: [
          {
            href: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("BorrowedHome booking help")}`,
            label: SUPPORT_EMAIL,
          },
        ],
      },
    ],
  },
  {
    id: "hosts",
    title: "Hosting",
    items: [
      {
        id: "become-host",
        question: "How do I become a host?",
        answer: [
          "Sign in (or create an account), then open Become a Host.",
          "The onboarding wizard walks you through photos, spaces, availability, house rules, and pricing.",
          "To receive payouts you’ll connect a Stripe account so funds can be transferred after completed bookings.",
        ],
        links: [{ href: "/host/onboard", label: "Become a host" }],
      },
      {
        id: "what-can-list",
        question: "What can I list?",
        answer: [
          "Shared daytime spaces such as kitchen, dining, living, garden, pool, or garage — not overnight bedrooms.",
          "Set clear house rules, toilet access, consumables policy, and when you’re available (always ending by 9:00 PM).",
        ],
      },
      {
        id: "host-requests",
        question: "How do booking requests work for hosts?",
        answer: [
          "Guests submit a request; you accept or decline from My Listings or the host dashboard.",
          "If you accept, the guest must pay within the payment window. Until they pay (or the window expires), that slot is locked.",
          "After the visit ends, the booking completes automatically. Payment is captured after a review window if no dispute is raised.",
        ],
        links: [
          { href: "/my-listings", label: "My listings" },
          { href: "/host/dashboard", label: "Host dashboard" },
        ],
      },
      {
        id: "payouts",
        question: "How and when do I get paid?",
        answer: [
          "Guest payments are processed through Stripe. After a booking completes and the review window ends (with no dispute), the rental is captured and your share is transferred to your connected Stripe account.",
          "Your payout is the guest total minus BorrowedHome’s platform fee and Stripe’s card processing fee (the actual fee Stripe charged on that payment). Payouts to your bank follow Stripe’s schedule for your connected account.",
        ],
        links: [{ href: "/host/payouts", label: "Payouts & Connect" }],
      },
      {
        id: "deposit",
        question: "What about the security deposit?",
        answer: [
          "Listings can require a deposit. It’s authorised at payment time and normally released after the booking if there’s no damage or dispute.",
          "If something goes wrong, use the dispute / deposit tools for that booking rather than informal side payments.",
        ],
      },
    ],
  },
  {
    id: "account",
    title: "Account & support",
    items: [
      {
        id: "password",
        question: "I forgot my password",
        answer: [
          "Use Forgot password on the login page. We’ll email a reset link to the address on your account.",
        ],
        links: [{ href: "/auth/reset-password", label: "Reset password" }],
      },
      {
        id: "contact",
        question: "How do I contact BorrowedHome?",
        answer: [
          "Email us anytime — including if you can’t sign up or log in.",
          `Support: ${SUPPORT_EMAIL}`,
        ],
        links: [
          {
            href: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("BorrowedHome support")}`,
            label: "Email support",
          },
        ],
      },
      {
        id: "terms",
        question: "Where are the legal terms?",
        answer: [
          "Guest Terms (Australia) and related agreements are linked from signup and the site footer. Please read them before hosting or booking.",
        ],
        links: [
          { href: "/terms/guest-au", label: "Guest Terms (AU)" },
          { href: "/terms", label: "Terms overview" },
        ],
      },
    ],
  },
];
