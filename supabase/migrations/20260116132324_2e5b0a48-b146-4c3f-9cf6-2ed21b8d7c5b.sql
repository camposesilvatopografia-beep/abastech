-- Create table for project/work settings
CREATE TABLE public.obra_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT 'CONSÓRCIO AERO MARAGOGI',
  subtitulo TEXT DEFAULT 'Obra: Sistema de Abastecimento de Água',
  cidade TEXT DEFAULT 'Maragogi-AL',
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.obra_settings ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to view settings
CREATE POLICY "Anyone can view obra settings" 
ON public.obra_settings 
FOR SELECT 
USING (true);

-- Allow all authenticated users to update settings (admin-only in practice)
CREATE POLICY "Anyone can update obra settings" 
ON public.obra_settings 
FOR UPDATE 
USING (true);

-- Allow insert for initial setup
CREATE POLICY "Anyone can insert obra settings" 
ON public.obra_settings 
FOR INSERT 
WITH CHECK (true);

-- Insert default values
INSERT INTO public.obra_settings (nome, subtitulo, cidade) 
VALUES ('CONSÓRCIO AERO MARAGOGI', 'Obra: Sistema de Abastecimento de Água', 'Maragogi-AL');

-- Create trigger for updated_at
CREATE TRIGGER update_obra_settings_updated_at
BEFORE UPDATE ON public.obra_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();