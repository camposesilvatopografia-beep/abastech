-- Create lubricants table for managing lubricant options
CREATE TABLE public.lubricants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  type TEXT DEFAULT 'geral',
  unit TEXT DEFAULT 'L',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.lubricants ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Allow public read lubricants" 
ON public.lubricants 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert lubricants" 
ON public.lubricants 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update lubricants" 
ON public.lubricants 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public delete lubricants" 
ON public.lubricants 
FOR DELETE 
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_lubricants_updated_at
BEFORE UPDATE ON public.lubricants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default lubricants
INSERT INTO public.lubricants (name, description, type, unit) VALUES 
  ('Graxa EP-2', 'Graxa multiuso para rolamentos', 'graxa', 'kg'),
  ('Graxa Azul', 'Graxa para chassis', 'graxa', 'kg'),
  ('WD-40', 'Desengripante e lubrificante', 'spray', 'un'),
  ('Lubrificante de Corrente', 'Para correntes e cabos', 'spray', 'un'),
  ('Desengripante', 'Penetrante antiferrugem', 'spray', 'un'),
  ('Fluido de Freio DOT 4', 'Fluido para sistema de freios', 'fluido', 'L'),
  ('Aditivo Radiador', 'Aditivo para sistema de arrefecimento', 'aditivo', 'L');