-- Drop the foreign key constraint that requires reviewed_by to exist in field_users
-- This allows system_users (admins) to approve requests
ALTER TABLE public.field_record_requests 
DROP CONSTRAINT IF EXISTS field_record_requests_reviewed_by_fkey;

-- Add a column to store the reviewer's name directly (denormalized for audit purposes)
ALTER TABLE public.field_record_requests 
ADD COLUMN IF NOT EXISTS reviewer_name TEXT;