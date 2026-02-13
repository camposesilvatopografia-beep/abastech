-- Insert field-specific module permissions for all 3 roles
-- Field modules: field_dashboard, field_abastecimento, field_horimetros, field_os

INSERT INTO public.role_permissions (role, module_id, can_view, can_edit) VALUES
  -- Admin: full access to all field modules
  ('admin', 'field_dashboard', true, true),
  ('admin', 'field_abastecimento', true, true),
  ('admin', 'field_horimetros', true, true),
  ('admin', 'field_os', true, true),
  -- Supervisor: view all, edit most
  ('supervisor', 'field_dashboard', true, true),
  ('supervisor', 'field_abastecimento', true, true),
  ('supervisor', 'field_horimetros', true, true),
  ('supervisor', 'field_os', true, true),
  -- Operador: view and edit basic modules
  ('operador', 'field_dashboard', true, false),
  ('operador', 'field_abastecimento', true, true),
  ('operador', 'field_horimetros', true, true),
  ('operador', 'field_os', true, false)
ON CONFLICT DO NOTHING;