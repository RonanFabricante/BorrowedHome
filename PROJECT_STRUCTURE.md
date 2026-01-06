# BorrowedHome - Project Structure

## File Tree

```
BorrowedHome/
├── app/
│   ├── auth/
│   │   ├── login/
│   │   │   └── page.tsx              # Login page
│   │   └── signup/
│   │       └── page.tsx               # Sign up page
│   ├── bookings/
│   │   └── [id]/
│   │       ├── confirm/
│   │       │   └── page.tsx           # Booking confirmation (address reveal)
│   │       ├── messages/
│   │       │   └── page.tsx           # Messaging thread
│   │       └── review/
│   │           └── page.tsx           # Leave review page
│   ├── host/
│   │   └── onboard/
│   │       └── page.tsx               # Host onboarding wizard entry
│   ├── listings/
│   │   ├── [id]/
│   │   │   └── page.tsx               # Listing detail page
│   │   └── page.tsx                   # Listings grid with search
│   ├── my-bookings/
│   │   └── page.tsx                   # User's bookings list
│   ├── my-listings/
│   │   └── page.tsx                   # Host's listings management
│   ├── globals.css                    # Global styles + Tailwind
│   ├── layout.tsx                     # Root layout
│   ├── page.tsx                       # Landing page
│   └── providers.tsx                  # TanStack Query provider
├── components/
│   ├── ui/                            # shadcn/ui components
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── checkbox.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   └── textarea.tsx
│   ├── booking-confirmation.tsx       # Booking confirmation display
│   ├── booking-dialog.tsx             # Booking form modal
│   ├── host-onboarding-wizard.tsx     # 5-step listing creation wizard
│   ├── listing-detail.tsx             # Listing detail view
│   ├── listings-grid.tsx              # Listings grid component
│   ├── messages-thread.tsx            # In-app messaging
│   ├── my-bookings-list.tsx           # Bookings list component
│   ├── my-listings-list.tsx           # Listings list component
│   ├── nav.tsx                        # Navigation bar
│   ├── review-form.tsx                # Review submission form
│   └── search-form.tsx                # Landing page search
├── lib/
│   ├── supabase/
│   │   ├── client.ts                  # Browser Supabase client
│   │   └── server.ts                   # Server Supabase client
│   ├── types.ts                       # TypeScript type definitions
│   └── utils.ts                       # Utility functions
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql     # Database schema
│       ├── 002_rls_policies.sql       # Row Level Security policies
│       └── 003_functions.sql          # Database functions
├── scripts/
│   └── seed.ts                        # Seed data script
├── middleware.ts                      # Supabase auth middleware
├── next.config.js                     # Next.js configuration
├── package.json                       # Dependencies
├── postcss.config.mjs                 # PostCSS config
├── tailwind.config.ts                 # Tailwind configuration
├── tsconfig.json                      # TypeScript configuration
├── .eslintrc.json                     # ESLint configuration
├── .gitignore                         # Git ignore rules
├── README.md                          # Setup and usage instructions
└── PROJECT_STRUCTURE.md               # This file
```

## Key Implementation Details

### Database Schema

**Core Tables:**
- `profiles` - User profiles with `is_host` and `is_guest` flags
- `listings` - Home listings with pricing, rules, and metadata
- `listing_spaces` - Junction table for spaces (KITCHEN, DINING, LIVING, GARDEN)
- `listing_photos` - Photo storage references
- `listing_availability` - Weekly availability windows (day_of_week, start_time, end_time)
- `bookings` - Booking records with status, pricing, and timestamps
- `messages` - In-app messaging threads per booking
- `reviews` - Post-booking reviews (1-5 stars + optional text)

**Key Constraints:**
- Bookings must end by 9pm (day use only)
- Minimum booking duration: 2 hours
- No bedrooms in spaces (enforced in UI/validation)
- Address only visible to booking parties (RLS)

### Row Level Security (RLS)

All tables have RLS enabled with policies for:
- **Public read access**: Published listings (without address)
- **Host access**: Full CRUD on own listings
- **Booking access**: Guests and hosts can view their bookings
- **Messaging**: Only booking parties can read/write messages
- **Reviews**: Only after booking completion, by booking parties

### Business Logic

**Booking Overlap Check:**
- Implemented via `check_booking_overlap()` database function
- Validates against existing CONFIRMED/PENDING bookings
- Called before booking creation

**Address Reveal:**
- Address stored in `listings.address_text`
- RLS policy allows guests to see address via booking join
- Only revealed on booking confirmation page

**Pricing:**
- All prices stored as integers (cents) to avoid floating point issues
- Hourly, half-day (4h), and full-day (8h) rates
- Platform fee calculated as 10% of base price
- Deposit stored separately

**Time Validation:**
- Minimum 2 hours enforced in booking dialog
- Maximum end time: 9pm (enforced in DB constraint and UI)
- Availability windows checked against listing availability
- Day-of-week matching required

### Components Architecture

**Page Components (Server):**
- Fetch data server-side using Supabase server client
- Handle authentication and authorization
- Pass data to client components

**Feature Components (Client):**
- Use TanStack Query for data fetching/mutations
- React Hook Form + Zod for validation
- Real-time updates where needed (messaging)

**UI Components:**
- shadcn/ui style components
- Tailwind CSS for styling
- Accessible and responsive

### Authentication Flow

1. User signs up → Profile created automatically
2. User can become host → `is_host` flag set during onboarding
3. Auth state managed via Supabase Auth
4. Middleware refreshes session on each request

### Host Onboarding Wizard

5-step process:
1. **Select Spaces** - Choose which spaces to include (no bedrooms)
2. **Basic Info** - Title, description, location, address, max guests
3. **Availability** - Set days of week and time windows
4. **House Rules** - Host presence, cooking, alcohol, noise, cleaning
5. **Pricing** - Hourly, half-day, full-day rates + deposit

### Booking Flow

1. Guest searches/browses listings
2. Views listing detail
3. Clicks "Select Time"
4. Booking dialog opens:
   - Select date, start time, end time
   - Enter guest count (validated against max)
   - View price breakdown
   - Accept house rules (required checkbox)
5. Booking created with status=CONFIRMED
6. Redirect to confirmation page (address revealed)
7. Messaging unlocked
8. After booking end time, reviews available

### Messaging

- Simple thread per booking
- Only accessible to booking parties (guest + host)
- Real-time polling (5s interval) for new messages
- In-app only (no email)

### Reviews

- Can be created after booking `end_at` time
- Only by parties in the booking
- Guest reviews host, host reviews guest
- 1-5 star rating + optional text
- One review per booking per reviewer

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key

## Commands

```bash
# Development
npm run dev

# Build
npm run build

# Production
npm start

# Lint
npm run lint

# Seed data (after setting up users)
npx tsx scripts/seed.ts
```

## Deployment Checklist

1. ✅ Run migrations on Supabase production
2. ✅ Set environment variables in Vercel
3. ✅ Create storage bucket `listing-photos`
4. ✅ Configure storage bucket policies
5. ✅ Test authentication flow
6. ✅ Test booking creation
7. ✅ Test address reveal
8. ✅ Test messaging
9. ✅ Test reviews
