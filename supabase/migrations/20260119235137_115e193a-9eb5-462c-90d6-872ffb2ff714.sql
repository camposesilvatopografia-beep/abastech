-- Create audit log table for horimeter/km corrections
CREATE TABLE public.correction_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  vehicle_code TEXT NOT NULL,
  vehicle_description TEXT,
  record_date TEXT NOT NULL,
  record_time TEXT,
  field_corrected TEXT NOT NULL, -- 'horimeter_previous', 'horimeter_current', 'km_previous', 'km_current'
  old_value NUMERIC,
  new_value NUMERIC NOT NULL,
  correction_type TEXT, -- 'current_extra_digit', 'previous_missing_digit', 'decimal_shift', etc.
  correction_source TEXT, -- 'auto_fix', 'manual'
  applied_by TEXT, -- Username of who applied the correction
  notes TEXT,
  row_index INTEGER -- Google Sheets row index for reference
);

-- Enable RLS
ALTER TABLE public.correction_audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all logs
CREATE POLICY "Anyone can view correction logs"
ON public.correction_audit_logs
FOR SELECT
USING (true);

-- Allow authenticated users to insert logs
CREATE POLICY "Anyone can insert correction logs"
ON public.correction_audit_logs
FOR INSERT
WITH CHECK (true);

-- Add index for faster queries
CREATE INDEX idx_correction_audit_vehicle ON public.correction_audit_logs(vehicle_code);
CREATE INDEX idx_correction_audit_date ON public.correction_audit_logs(created_at DESC);