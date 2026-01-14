-- Create table for user layout preferences
CREATE TABLE public.layout_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_identifier TEXT NOT NULL,
  module_name TEXT NOT NULL,
  column_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_identifier, module_name)
);

-- Enable RLS
ALTER TABLE public.layout_preferences ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (no auth required for this system)
CREATE POLICY "Allow all operations on layout_preferences" 
ON public.layout_preferences 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_layout_preferences_updated_at
BEFORE UPDATE ON public.layout_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();