-- Add separate columns for KM tracking (horimeter already uses current_value/previous_value)
ALTER TABLE public.horimeter_readings
ADD COLUMN current_km numeric NULL,
ADD COLUMN previous_km numeric NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.horimeter_readings.current_value IS 'Current horimeter value (hours)';
COMMENT ON COLUMN public.horimeter_readings.previous_value IS 'Previous horimeter value (hours)';
COMMENT ON COLUMN public.horimeter_readings.current_km IS 'Current KM/odometer value';
COMMENT ON COLUMN public.horimeter_readings.previous_km IS 'Previous KM/odometer value';