-- Create table for persisting KPI mappings
CREATE TABLE public.kpi_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sheet_name TEXT NOT NULL,
  kpi_id TEXT NOT NULL,
  column_name TEXT NOT NULL,
  user_identifier TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(sheet_name, kpi_id, user_identifier)
);

-- Enable Row Level Security
ALTER TABLE public.kpi_mappings ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (no auth required for this system config)
CREATE POLICY "Allow public read access to kpi_mappings"
ON public.kpi_mappings
FOR SELECT
USING (true);

CREATE POLICY "Allow public insert access to kpi_mappings"
ON public.kpi_mappings
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update access to kpi_mappings"
ON public.kpi_mappings
FOR UPDATE
USING (true);

CREATE POLICY "Allow public delete access to kpi_mappings"
ON public.kpi_mappings
FOR DELETE
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_kpi_mappings_updated_at
BEFORE UPDATE ON public.kpi_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();