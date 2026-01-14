-- Add status column to vehicles table
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'manutencao'));

-- Add index for better filtering performance
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON public.vehicles(status);