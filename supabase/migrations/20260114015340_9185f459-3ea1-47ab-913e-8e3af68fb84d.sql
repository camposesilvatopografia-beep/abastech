-- Create mechanics table
CREATE TABLE public.mechanics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  specialty TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mechanics ENABLE ROW LEVEL SECURITY;

-- Create policy for full access (internal system)
CREATE POLICY "Allow full access to mechanics" 
ON public.mechanics 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_mechanics_updated_at
BEFORE UPDATE ON public.mechanics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create service_orders table
CREATE TABLE public.service_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL,
  vehicle_code TEXT NOT NULL,
  vehicle_description TEXT,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  order_type TEXT NOT NULL DEFAULT 'Corretiva',
  priority TEXT NOT NULL DEFAULT 'Média',
  status TEXT NOT NULL DEFAULT 'Aberta',
  problem_description TEXT,
  solution_description TEXT,
  mechanic_id UUID REFERENCES public.mechanics(id),
  mechanic_name TEXT,
  estimated_hours NUMERIC(10,2),
  actual_hours NUMERIC(10,2),
  parts_used TEXT,
  parts_cost NUMERIC(10,2),
  labor_cost NUMERIC(10,2),
  total_cost NUMERIC(10,2),
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

-- Create policy for full access (internal system)
CREATE POLICY "Allow full access to service_orders" 
ON public.service_orders 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_service_orders_updated_at
BEFORE UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();