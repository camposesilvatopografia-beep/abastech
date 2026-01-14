-- Create scheduled_maintenance table for preventive maintenance calendar
CREATE TABLE public.scheduled_maintenance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_code TEXT NOT NULL,
  vehicle_description TEXT,
  maintenance_type TEXT NOT NULL DEFAULT 'Preventiva',
  title TEXT NOT NULL,
  description TEXT,
  scheduled_date DATE NOT NULL,
  interval_days INTEGER DEFAULT 90,
  interval_hours INTEGER,
  last_completed_date DATE,
  status TEXT NOT NULL DEFAULT 'Programada',
  priority TEXT DEFAULT 'Média',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.scheduled_maintenance ENABLE ROW LEVEL SECURITY;

-- Create policies for full access
CREATE POLICY "Allow full access to scheduled_maintenance" 
ON public.scheduled_maintenance 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_scheduled_maintenance_updated_at
BEFORE UPDATE ON public.scheduled_maintenance
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();