-- Add required_fields column to field_users table
-- This stores which fields are mandatory for each user in the field form
ALTER TABLE public.field_users
ADD COLUMN IF NOT EXISTS required_fields jsonb DEFAULT '{
  "horimeter_current": true,
  "km_current": false,
  "fuel_quantity": true,
  "arla_quantity": false,
  "oil_type": false,
  "oil_quantity": false,
  "lubricant": false,
  "filter_blow": false,
  "observations": false,
  "photo_horimeter": false,
  "photo_pump": false
}'::jsonb;

-- Add a comment to describe the column
COMMENT ON COLUMN public.field_users.required_fields IS 'JSON object defining which form fields are mandatory for this user';