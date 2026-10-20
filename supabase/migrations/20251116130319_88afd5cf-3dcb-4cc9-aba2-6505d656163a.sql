-- Create improvement_checklist table to track completed improvements
CREATE TABLE public.improvement_checklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  improvement_text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(resume_id, improvement_text)
);

-- Enable Row Level Security
ALTER TABLE public.improvement_checklist ENABLE ROW LEVEL SECURITY;

-- Create policies for improvement_checklist
CREATE POLICY "Users can view their own checklist items"
ON public.improvement_checklist
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own checklist items"
ON public.improvement_checklist
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own checklist items"
ON public.improvement_checklist
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own checklist items"
ON public.improvement_checklist
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_improvement_checklist_updated_at
BEFORE UPDATE ON public.improvement_checklist
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_improvement_checklist_resume_id ON public.improvement_checklist(resume_id);
CREATE INDEX idx_improvement_checklist_user_id ON public.improvement_checklist(user_id);