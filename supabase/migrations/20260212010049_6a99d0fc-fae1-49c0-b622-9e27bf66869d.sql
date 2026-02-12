-- Drop the unique constraint that prevents multiple readings per vehicle per day
ALTER TABLE public.horimeter_readings DROP CONSTRAINT IF EXISTS horimeter_readings_vehicle_id_reading_date_key;

-- Add an index for performance (non-unique)
CREATE INDEX IF NOT EXISTS idx_horimeter_readings_vehicle_date ON public.horimeter_readings (vehicle_id, reading_date);