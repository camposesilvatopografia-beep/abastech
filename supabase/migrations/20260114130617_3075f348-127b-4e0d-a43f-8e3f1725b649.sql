-- Add interval_days column to service_orders for preventive maintenance scheduling
ALTER TABLE public.service_orders 
ADD COLUMN interval_days integer DEFAULT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN public.service_orders.interval_days IS 'Interval in days for preventive maintenance recurrence. When a preventive OS is finalized, the next revision date is calculated based on this interval.';