-- Migrate existing data: for vehicles with unit = 'km', copy current_value to current_km and previous_value to previous_km
UPDATE public.horimeter_readings hr
SET 
  current_km = hr.current_value,
  previous_km = hr.previous_value
FROM public.vehicles v
WHERE hr.vehicle_id = v.id
  AND v.unit = 'km'
  AND hr.current_km IS NULL;