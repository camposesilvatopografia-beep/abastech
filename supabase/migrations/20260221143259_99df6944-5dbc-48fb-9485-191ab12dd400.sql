-- Table to store mobile form field ordering configuration
CREATE TABLE public.form_field_order (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_type text NOT NULL, -- 'saida', 'entrada', 'comboio', 'tanque', 'arla', 'horimeter', 'service_order'
  field_id text NOT NULL, -- e.g. 'vehicle', 'horimeter', 'photo', 'fuel_quantity', 'arla', 'observations'
  field_label text NOT NULL, -- Display label
  sort_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(form_type, field_id)
);

ALTER TABLE public.form_field_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to form_field_order"
  ON public.form_field_order
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert default field order for 'saida' form
INSERT INTO public.form_field_order (form_type, field_id, field_label, sort_order) VALUES
  ('saida', 'vehicle', 'Veículo', 1),
  ('saida', 'horimeter', 'Horímetro / KM Atual', 2),
  ('saida', 'photo', 'Fotos', 3),
  ('saida', 'fuel_quantity', 'Quantidade (Litros)', 4),
  ('saida', 'equipment_extras', 'Equipamento (Opcionais)', 5),
  ('saida', 'arla', 'ARLA (Litros)', 6),
  ('saida', 'observations', 'Observações', 7);

-- Insert default field order for 'entrada' form  
INSERT INTO public.form_field_order (form_type, field_id, field_label, sort_order) VALUES
  ('entrada', 'fuel_quantity', 'Quantidade (Litros)', 1),
  ('entrada', 'supplier', 'Fornecedor', 2),
  ('entrada', 'invoice', 'Nota Fiscal', 3),
  ('entrada', 'unit_price', 'Preço Unitário', 4),
  ('entrada', 'observations', 'Observações', 5);

-- Trigger for updated_at
CREATE TRIGGER update_form_field_order_updated_at
  BEFORE UPDATE ON public.form_field_order
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
