-- Create enum for system user roles
CREATE TYPE public.system_user_role AS ENUM ('admin', 'supervisor', 'operador');

-- Create system_users table for admin panel authentication
CREATE TABLE public.system_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  role system_user_role DEFAULT 'operador'::system_user_role,
  active BOOLEAN DEFAULT true,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;

-- Create policy for public read (for login validation)
CREATE POLICY "Allow public read for login" ON public.system_users
FOR SELECT USING (true);

-- Create policy for authenticated operations (will be managed by backend)
CREATE POLICY "Allow all operations for now" ON public.system_users
FOR ALL USING (true) WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_system_users_updated_at
  BEFORE UPDATE ON public.system_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default admin user (password: admin123)
INSERT INTO public.system_users (username, password_hash, name, role)
VALUES ('admin', 'admin123', 'Administrador', 'admin');

-- Create index for faster lookups
CREATE INDEX idx_system_users_username ON public.system_users(username);
CREATE INDEX idx_system_users_active ON public.system_users(active);