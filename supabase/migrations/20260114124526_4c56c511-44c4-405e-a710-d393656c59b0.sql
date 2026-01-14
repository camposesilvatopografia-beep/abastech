-- Add entry_date and entry_time columns to service_orders
ALTER TABLE public.service_orders 
ADD COLUMN IF NOT EXISTS entry_date DATE,
ADD COLUMN IF NOT EXISTS entry_time TIME;