-- Add request_reason column to field_record_requests table
ALTER TABLE public.field_record_requests 
ADD COLUMN request_reason TEXT;