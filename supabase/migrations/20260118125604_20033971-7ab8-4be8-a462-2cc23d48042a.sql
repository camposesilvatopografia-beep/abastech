-- Allow deletions in Apontamento Campo (records were not actually deleting due to missing RLS policy)

CREATE POLICY "Allow public delete field_fuel_records"
ON public.field_fuel_records
FOR DELETE
TO public
USING (true);
