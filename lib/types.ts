export type BookingStatus = "REQUESTED" | "PENDING" | "ACCEPTED" | "PAYMENT_PENDING" | "CONFIRMED" | "DECLINED" | "REJECTED" | "EXPIRED" | "CANCELLED" | "COMPLETED";
export type SpaceType = "KITCHEN" | "DINING" | "LIVING" | "GARDEN";
export type NoiseTolerance = "LOW" | "MEDIUM" | "HIGH";
export type ToiletAccessType = "shared" | "private" | "limited" | "none";

export interface Profile {
  id: string;
  full_name: string | null;
  is_host: boolean;
  is_guest: boolean;
  created_at: string;
}

export interface Listing {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  location_text: string;
  address_text: string;
  max_guests: number;
  host_present: boolean;
  noise_tolerance: NoiseTolerance;
  cooking_allowed: boolean;
  alcohol_allowed: boolean;
  cleaning_expectations: string | null;
  additional_instructions: string | null;
  toilet_access: ToiletAccessType;
  toilet_access_notes: string | null;
  consumables_policy: string;
  provides_toilet_paper: boolean;
  provides_pantry_staples: boolean;
  provides_groceries: boolean;
  hourly_rate: number;
  half_day_rate: number;
  full_day_rate: number;
  deposit_amount: number;
  published: boolean;
  created_at: string;
  updated_at: string;
  spaces?: SpaceType[];
  photos?: ListingPhoto[];
  availability?: ListingAvailability[];
  host?: Profile;
}

export interface ListingSpace {
  listing_id: string;
  space_type: SpaceType;
}

export interface ListingPhoto {
  id: string;
  listing_id: string;
  storage_path: string;
  sort_order: number;
  created_at: string;
  url?: string;
}

export interface ListingAvailability {
  id: string;
  listing_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  created_at: string;
}

export interface Booking {
  id: string;
  listing_id: string;
  guest_id: string;
  start_at: string;
  end_at: string;
  status: BookingStatus;
  accepted_rules_at: string | null;
  guest_ack_toilet_access: boolean;
  guest_ack_consumables_policy: boolean;
  ack_version: string | null;
  guests_count: number;
  total_amount: number;
  platform_fee_amount: number;
  deposit_amount: number;
  created_at: string;
  listing?: Listing;
  guest?: Profile;
}

export interface Message {
  id: string;
  booking_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: Profile;
}

export interface Review {
  id: string;
  booking_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  reviewer?: Profile;
  reviewee?: Profile;
}
