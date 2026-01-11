# BorrowedHome

BorrowedHome.app is marketplace for day-use access to real lived-in homes. Guests can book homes by the hour or in blocks. No overnight stays. No bedrooms.

## Tech Stack

- **Next.js 14+** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **shadcn/ui** components
- **Supabase** (Postgres + Auth + Storage)
- **React Hook Form** + **Zod** for validation
- **TanStack Query** for data fetching/mutations
- **Vercel** ready for deployment

## Features

### For Guests
- Browse listings by location, date, and time
- View listing details with photos, spaces, and house rules
- Book homes for day-use only (2+ hours, ends by 9pm)
- View booking confirmations with address reveal
- Message hosts after booking
- Leave reviews after completed bookings

### For Hosts
- Create listings via onboarding wizard
- Set availability, pricing, and house rules
- Manage listings (view, edit, publish)
- Message guests
- Receive reviews

## Local Setup

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- A Supabase project (free tier works)

### 1. Clone and Install

```bash
# Install dependencies
npm install
# or
yarn install
# or
pnpm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the migrations in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
   - `supabase/migrations/003_functions.sql`

3. Create a storage bucket for listing photos:
   - Go to Storage in Supabase dashboard
   - Create a bucket named `listing-photos`
   - Set it to public (or configure RLS policies for signed URLs)

### 3. Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

You can find these in your Supabase project settings under API.

### 4. Run Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Seed Data (Optional)

1. Create test users in Supabase Auth:
   - Go to Authentication > Users in Supabase dashboard
   - Create at least one user (this will be your host)
   - Note the user IDs

2. Update `scripts/seed.ts` with your user IDs

3. Run the seed script:

```bash
npx tsx scripts/seed.ts
```

Or install tsx globally:
```bash
npm install -g tsx
tsx scripts/seed.ts
```

## Project Structure

```
├── app/                    # Next.js App Router pages
│   ├── auth/              # Authentication pages
│   ├── bookings/          # Booking pages
│   ├── host/              # Host onboarding
│   ├── listings/          # Listing pages
│   ├── my-bookings/       # User bookings
│   ├── my-listings/       # Host listings
│   └── page.tsx           # Landing page
├── components/             # React components
│   ├── ui/                # shadcn/ui components
│   └── ...                # Feature components
├── lib/                    # Utilities and types
│   ├── supabase/          # Supabase clients
│   └── types.ts           # TypeScript types
├── supabase/               # Database migrations
│   └── migrations/        # SQL migration files
└── scripts/                # Utility scripts
    └── seed.ts            # Seed data script
```

## Key Pages and Routes

### Public
- `/` - Landing page with search
- `/listings` - Browse all listings (with optional search params)
- `/listings/[id]` - Listing detail page

### Authentication
- `/auth/login` - Login page
- `/auth/signup` - Sign up page

### Bookings
- `/bookings/[id]/confirm` - Booking confirmation (address revealed)
- `/bookings/[id]/messages` - Messaging thread
- `/bookings/[id]/review` - Leave a review

### Host
- `/host/onboard` - Create listing wizard (5 steps)
- `/my-listings` - Manage listings

### User
- `/my-bookings` - View all bookings

## Business Rules

- **Day use only**: All bookings must end by 9pm (enforced in DB and UI)
- **No bedrooms**: Only shared spaces (kitchen, dining, living, garden)
- **Minimum duration**: 2 hours
- **Address privacy**: Only revealed to confirmed bookings
- **Messaging**: Unlocked after booking confirmation
- **Reviews**: Can only be created after booking end time

## Database Schema

### Core Tables
- `profiles` - User profiles with role flags
- `listings` - Home listings
- `listing_spaces` - Spaces included (junction table)
- `listing_photos` - Photo references
- `listing_availability` - Weekly availability windows
- `bookings` - Booking records
- `messages` - In-app messaging
- `reviews` - Post-booking reviews

All tables have Row Level Security (RLS) policies enabled.

## Deployment

### Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

### Supabase Production

Make sure to run migrations on your production Supabase instance.

## Development Notes

- **Money handling**: All prices stored as integers (cents) to avoid floating point issues
- **Time zones**: Uses UTC timestamps; adjust for local time in UI as needed
- **Photo storage**: Photos stored in Supabase Storage; signed URLs generated for display
- **Booking overlap**: Checked via database function `check_booking_overlap`
- **Address reveal**: Handled via RLS policies and `get_listing_address` function

## Future Enhancements (Not in MVP)

- Stripe Connect for payouts
- Advanced search filters
- Multi-city scaling
- Social features
- AI recommendations
- Custom bundles beyond fixed blocks

## License

MIT
