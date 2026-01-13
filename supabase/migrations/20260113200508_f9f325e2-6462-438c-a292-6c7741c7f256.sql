-- Create field users table for authentication
CREATE TABLE public.field_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'operador',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.field_users ENABLE ROW LEVEL SECURITY;

-- Create policies for field_users (public read for login, restricted write)
CREATE POLICY "Allow public read for login"
ON public.field_users
FOR SELECT
USING (true);

CREATE POLICY "Allow authenticated insert"
ON public.field_users
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow authenticated update"
ON public.field_users
FOR UPDATE
USING (true);

-- Create field fuel records table
CREATE TABLE public.field_fuel_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.field_users(id) ON DELETE SET NULL,
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  record_time TIME NOT NULL DEFAULT CURRENT_TIME,
  vehicle_code TEXT NOT NULL,
  vehicle_description TEXT,
  category TEXT,
  operator_name TEXT,
  company TEXT,
  work_site TEXT,
  horimeter_previous NUMERIC DEFAULT 0,
  horimeter_current NUMERIC DEFAULT 0,
  km_previous NUMERIC DEFAULT 0,
  km_current NUMERIC DEFAULT 0,
  fuel_quantity NUMERIC NOT NULL,
  fuel_type TEXT DEFAULT 'Diesel',
  arla_quantity NUMERIC DEFAULT 0,
  location TEXT,
  photo_pump_url TEXT,
  photo_horimeter_url TEXT,
  observations TEXT,
  synced_to_sheet BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.field_fuel_records ENABLE ROW LEVEL SECURITY;

-- Create policies for field_fuel_records
CREATE POLICY "Allow public read field_fuel_records"
ON public.field_fuel_records
FOR SELECT
USING (true);

CREATE POLICY "Allow public insert field_fuel_records"
ON public.field_fuel_records
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update field_fuel_records"
ON public.field_fuel_records
FOR UPDATE
USING (true);

-- Create update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_field_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_field_users_updated_at
BEFORE UPDATE ON public.field_users
FOR EACH ROW
EXECUTE FUNCTION public.update_field_updated_at();

CREATE TRIGGER update_field_fuel_records_updated_at
BEFORE UPDATE ON public.field_fuel_records
FOR EACH ROW
EXECUTE FUNCTION public.update_field_updated_at();

-- Insert default admin user (password: admin123)
INSERT INTO public.field_users (name, username, password_hash, role)
VALUES ('Administrador', 'admin', 'admin123', 'admin');