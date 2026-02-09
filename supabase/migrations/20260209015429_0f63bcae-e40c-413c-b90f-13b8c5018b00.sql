-- Add 2 more photo columns to service_orders for up to 5 photos total
ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS photo_4_url text,
ADD COLUMN IF NOT EXISTS photo_5_url text;