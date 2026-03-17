
-- Create vehicle_documents table for historical document attachments
CREATE TABLE public.vehicle_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_code TEXT NOT NULL,
  vehicle_description TEXT,
  document_type TEXT NOT NULL DEFAULT 'Outro',
  title TEXT NOT NULL,
  description TEXT,
  document_date DATE,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER,
  uploaded_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to vehicle_documents"
ON public.vehicle_documents FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_vehicle_documents_updated_at
BEFORE UPDATE ON public.vehicle_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for vehicle documents
INSERT INTO storage.buckets (id, name, public) VALUES ('vehicle-documents', 'vehicle-documents', true);

CREATE POLICY "Allow public read vehicle-documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-documents');

CREATE POLICY "Allow public insert vehicle-documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vehicle-documents');

CREATE POLICY "Allow public delete vehicle-documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'vehicle-documents');
