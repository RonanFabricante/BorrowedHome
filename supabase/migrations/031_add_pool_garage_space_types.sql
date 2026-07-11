-- Migration 031: Add POOL and GARAGE space types for rentable house parts

ALTER TYPE public.space_type ADD VALUE IF NOT EXISTS 'POOL';
ALTER TYPE public.space_type ADD VALUE IF NOT EXISTS 'GARAGE';
