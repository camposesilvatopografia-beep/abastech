-- Tabela de veículos (para referência)
CREATE TABLE public.vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  company TEXT,
  unit TEXT DEFAULT 'h',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de horímetros
CREATE TABLE public.horimeter_readings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  reading_date DATE NOT NULL,
  current_value NUMERIC NOT NULL,
  previous_value NUMERIC,
  operator TEXT,
  observations TEXT,
  source TEXT DEFAULT 'system',
  synced_from_sheet BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id, reading_date)
);

-- Índices para performance
CREATE INDEX idx_horimeter_readings_vehicle_id ON public.horimeter_readings(vehicle_id);
CREATE INDEX idx_horimeter_readings_date ON public.horimeter_readings(reading_date DESC);
CREATE INDEX idx_vehicles_code ON public.vehicles(code);

-- Habilitar RLS
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horimeter_readings ENABLE ROW LEVEL SECURITY;

-- Políticas públicas (sem autenticação por enquanto)
CREATE POLICY "Allow public read vehicles" ON public.vehicles FOR SELECT USING (true);
CREATE POLICY "Allow public insert vehicles" ON public.vehicles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update vehicles" ON public.vehicles FOR UPDATE USING (true);
CREATE POLICY "Allow public delete vehicles" ON public.vehicles FOR DELETE USING (true);

CREATE POLICY "Allow public read horimeter_readings" ON public.horimeter_readings FOR SELECT USING (true);
CREATE POLICY "Allow public insert horimeter_readings" ON public.horimeter_readings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update horimeter_readings" ON public.horimeter_readings FOR UPDATE USING (true);
CREATE POLICY "Allow public delete horimeter_readings" ON public.horimeter_readings FOR DELETE USING (true);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_vehicles_updated_at
BEFORE UPDATE ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_horimeter_readings_updated_at
BEFORE UPDATE ON public.horimeter_readings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();