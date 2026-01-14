-- Create oil_types table for managing oil type options
CREATE TABLE public.oil_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.oil_types ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Allow public read oil_types" 
ON public.oil_types 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert oil_types" 
ON public.oil_types 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update oil_types" 
ON public.oil_types 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public delete oil_types" 
ON public.oil_types 
FOR DELETE 
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_oil_types_updated_at
BEFORE UPDATE ON public.oil_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default oil types
INSERT INTO public.oil_types (name, description) VALUES 
  ('SAE 15W40', 'Óleo motor diesel comum'),
  ('SAE 10W40', 'Óleo motor diesel sintético'),
  ('SAE 5W30', 'Óleo motor sintético'),
  ('Hidráulico HLP 68', 'Óleo hidráulico HLP 68'),
  ('Hidráulico HLP 46', 'Óleo hidráulico HLP 46'),
  ('Transmissão 80W90', 'Óleo de transmissão'),
  ('Transmissão 85W140', 'Óleo de transmissão pesada');

-- Alter field_fuel_records to add filter_blow_quantity
ALTER TABLE public.field_fuel_records 
ADD COLUMN IF NOT EXISTS filter_blow_quantity NUMERIC DEFAULT 0;