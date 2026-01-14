-- Add horimeter and km fields to service_orders table
ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS horimeter_current numeric,
ADD COLUMN IF NOT EXISTS km_current numeric;