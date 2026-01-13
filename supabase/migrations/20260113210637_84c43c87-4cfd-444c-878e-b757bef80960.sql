-- Add new columns for equipment-specific fields
ALTER TABLE public.field_fuel_records 
ADD COLUMN IF NOT EXISTS oil_type TEXT,
ADD COLUMN IF NOT EXISTS oil_quantity NUMERIC,
ADD COLUMN IF NOT EXISTS filter_blow BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS lubricant TEXT;

-- Add new columns for entry type records
ALTER TABLE public.field_fuel_records 
ADD COLUMN IF NOT EXISTS record_type TEXT DEFAULT 'saida',
ADD COLUMN IF NOT EXISTS supplier TEXT,
ADD COLUMN IF NOT EXISTS invoice_number TEXT,
ADD COLUMN IF NOT EXISTS unit_price NUMERIC,
ADD COLUMN IF NOT EXISTS entry_location TEXT;