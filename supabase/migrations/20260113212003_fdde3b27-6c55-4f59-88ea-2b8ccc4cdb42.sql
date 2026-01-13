-- Change assigned_location from single text to array of texts
ALTER TABLE public.field_users 
DROP COLUMN IF EXISTS assigned_location;

ALTER TABLE public.field_users 
ADD COLUMN assigned_locations TEXT[] DEFAULT ARRAY['Tanque Canteiro 01']::TEXT[];