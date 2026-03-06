
CREATE TABLE public.report_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(report_type)
);

ALTER TABLE public.report_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read report_configurations" ON public.report_configurations FOR SELECT USING (true);
CREATE POLICY "Allow public insert report_configurations" ON public.report_configurations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update report_configurations" ON public.report_configurations FOR UPDATE USING (true);
CREATE POLICY "Allow public delete report_configurations" ON public.report_configurations FOR DELETE USING (true);
