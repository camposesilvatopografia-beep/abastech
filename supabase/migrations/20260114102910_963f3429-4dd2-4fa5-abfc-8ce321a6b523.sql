-- Add photo columns to service_orders table
ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS photo_before_url TEXT,
ADD COLUMN IF NOT EXISTS photo_after_url TEXT,
ADD COLUMN IF NOT EXISTS photo_parts_url TEXT;