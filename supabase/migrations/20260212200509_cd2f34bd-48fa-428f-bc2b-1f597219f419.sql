
-- Create unique index to prevent duplicate service orders
-- Based on same vehicle, entry date, entry time, and problem description
CREATE UNIQUE INDEX idx_service_orders_no_duplicates 
ON public.service_orders (vehicle_code, entry_date, entry_time, problem_description)
WHERE entry_date IS NOT NULL AND entry_time IS NOT NULL AND problem_description IS NOT NULL;
