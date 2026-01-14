-- Create table for edit/delete requests that need admin approval
CREATE TABLE public.field_record_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID NOT NULL REFERENCES field_fuel_records(id) ON DELETE CASCADE,
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('edit', 'delete')),
  requested_by UUID NOT NULL REFERENCES field_users(id),
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES field_users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  -- For edit requests, store the proposed changes as JSON
  proposed_changes JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.field_record_requests ENABLE ROW LEVEL SECURITY;

-- Policies: Operadores can create and view their own requests
CREATE POLICY "Operadores can create requests"
  ON public.field_record_requests
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Operadores can view their own requests"
  ON public.field_record_requests
  FOR SELECT
  USING (true);

-- Admins can update requests (approve/reject)
CREATE POLICY "Anyone can update requests"
  ON public.field_record_requests
  FOR UPDATE
  USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_field_record_requests_updated_at
  BEFORE UPDATE ON public.field_record_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for efficient lookups
CREATE INDEX idx_field_record_requests_status ON public.field_record_requests(status);
CREATE INDEX idx_field_record_requests_record_id ON public.field_record_requests(record_id);