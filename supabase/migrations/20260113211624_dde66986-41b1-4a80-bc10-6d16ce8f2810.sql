-- Add location field to field_users table
ALTER TABLE public.field_users 
ADD COLUMN IF NOT EXISTS assigned_location TEXT DEFAULT 'Tanque Canteiro 01';