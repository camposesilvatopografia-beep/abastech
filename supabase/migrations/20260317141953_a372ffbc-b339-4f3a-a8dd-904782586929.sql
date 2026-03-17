
-- Add problem_tags column to service_orders for simplified problem categorization
ALTER TABLE public.service_orders
ADD COLUMN problem_tags text[] DEFAULT '{}';
