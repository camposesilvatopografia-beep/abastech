-- Create storage bucket for field photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('field-photos', 'field-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for field photos bucket
CREATE POLICY "Anyone can view field photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'field-photos');

CREATE POLICY "Authenticated users can upload field photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'field-photos');

CREATE POLICY "Users can update their own field photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'field-photos');

CREATE POLICY "Users can delete their own field photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'field-photos');