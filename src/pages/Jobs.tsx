import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { invokeWithTimeout } from '@/lib/fetchWithTimeout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Heart, X, Upload } from 'lucide-react';
import { toast } from 'sonner';

import {
  ACCEPTED_RESUME_DOCUMENT_ACCEPT,
  RESUME_DOCUMENT_TYPE_LABEL,
  extractDocumentFromFile,
  isAcceptedResumeDocument,
} from '@/lib/document-extraction';

const JobsPage = () => {
  const [resume, setResume] = useState<File | null>(null);
  const [linkedinId, setLinkedinId] = useState('');
  const [jobType, setJobType] = useState('');
  const [location, setLocation] = useState('');
  const [experience, setExperience] = useState('');
  const [jobs, setJobs] = useState<any[]>([]);
  const [currentJobIndex, setCurrentJobIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  // Load confetti library dynamically
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    if (selectedFile && !isAcceptedResumeDocument(selectedFile)) {
      toast.error(`Please upload a ${RESUME_DOCUMENT_TYPE_LABEL} file`);
      e.target.value = '';
      return;
    }
    setResume(selectedFile);
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    try {
      const extraction = await extractDocumentFromFile({
        file,
        documentType: 'resume',
      });
      return extraction.text;
    } catch (e) {
      console.error('Failed extracting resume text:', e);
      return '';
    }
  };

  const handleStart = async () => {
    if (!resume || !linkedinId) {
      toast.error('Please upload resume and enter LinkedIn ID');
      return;
    }
    setLoading(true);
    try {
      // Extract skills from resume (PDF-aware)
      const resumeText = await extractTextFromFile(resume);
      
      const { data, error } = await invokeWithTimeout<any>(
        'match-jobs',
        {
          body: {
            resumeText,
            linkedinId,
            jobType: jobType || 'full-time',
            location: location || 'United States',
            experience: jobType === 'internship' ? 'entry' : (experience || 'mid'),
            limit: 15,
          },
        },
        120000,
      );

      if (error) throw error;
      
      if (data?.jobs && data.jobs.length > 0) {
        const filtered = data.jobs.filter((j: any) => {
          const validTitle = j?.title && j?.company;
          const notSorry = !/i am sorry|cannot extract/i.test(j?.description || '') && !/i am sorry|cannot extract/i.test(j?.whyMatch || '');
          const matchType = jobType ? (j?.type ? String(j.type).toLowerCase() === jobType : true) : true;
          const matchLocation = location ? String(j?.location || '').toLowerCase().includes(location.toLowerCase()) : true;
          return validTitle && notSorry && matchType && matchLocation;
        });
        const finalJobs = filtered.length > 0 ? filtered : data.jobs;
        setJobs(finalJobs);
        setStarted(true);
        toast.success(`Found ${finalJobs.length} matching jobs!`);
      } else {
        toast.error('No matching jobs found. Try different criteria.');
      }
    } catch (error) {
      console.error('Job search error:', error);
      toast.error('Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleSwipe = async (liked: boolean) => {
    setSwipeDirection(liked ? 'right' : 'left');
    
    if (liked) {
      // Trigger confetti animation
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const duration = 500;
          const particleCount = 50;
          const spread = 90;
          
          (window as any).confetti?.({
            particleCount,
            spread,
            origin: { y: 0.6 },
            colors,
            ticks: 100,
            gravity: 1.2,
            decay: 0.94,
            startVelocity: 30,
            scalar: 1.2,
          });
        }, i * 100);
      }
      
      // Save the job to database
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && currentJob) {
          await supabase.from('applications').insert({
            user_id: user.id,
            jd_id: null,
            role_applied: currentJob.title,
            company_applied: currentJob.company,
            location: currentJob.location,
            salary: currentJob.salary,
            url: currentJob.url,
            posted: currentJob.posted,
            status: 'saved',
            application_source: 'other',
          });
        }
      } catch (error) {
        console.error('Failed to save job:', error);
      }
      
      toast.success('Job saved to dashboard!');
    }
    
    setTimeout(() => {
      if (currentJobIndex < jobs.length - 1) {
        setCurrentJobIndex(currentJobIndex + 1);
        setSwipeDirection(null);
      } else {
        toast.info('No more jobs! Check your saved jobs in Dashboard.');
        setStarted(false);
        setCurrentJobIndex(0);
        setSwipeDirection(null);
      }
    }, 300);
  };

  const currentJob = jobs[currentJobIndex];

  const sanitize = (t?: string) => {
    if (!t) return '';
    let out = t;
    out = out.replace(/please upload a resume[^.]*\./gi, currentJob?.title || '');
    out = out.replace(/i am sorry[^.]*\./gi, '');
    out = out.replace(/cannot extract[^.]*\./gi, '');
    out = out.replace(/no resume content was detected[^.]*\./gi, '');
    out = out.replace(/please provide a resume[^.]*\./gi, '');
    return out.trim();
  };

  const displayDescription = currentJob ? sanitize(currentJob.description) || (currentJob.title || '') : '';
  const displayWhy = currentJob ? sanitize(currentJob.whyMatch) : '';

  return (
      <div className="container mx-auto px-4 pt-6 pb-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-2">Job Matcher</h1>
        <p className="text-muted-foreground mb-8">Swipe right to save jobs, left to skip</p>
        
        {!started ? (
          <Card className="p-8">
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium mb-2 block">Upload Resume *</label>
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
                  <input
                    type="file"
                    accept={ACCEPTED_RESUME_DOCUMENT_ACCEPT}
                    onChange={handleFileChange}
                    className="hidden"
                    id="resume-upload"
                  />
                  <label htmlFor="resume-upload" className="cursor-pointer">
                    <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg mb-2">{resume ? resume.name : 'Click to upload your resume'}</p>
                    <p className="text-sm text-muted-foreground">{RESUME_DOCUMENT_TYPE_LABEL}</p>
                  </label>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">LinkedIn ID *</label>
                <Input
                  placeholder="your-linkedin-id"
                  value={linkedinId}
                  onChange={(e) => setLinkedinId(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Job Type</label>
                <Select value={jobType} onValueChange={setJobType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select job type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full-time">Full Time</SelectItem>
                    <SelectItem value="part-time">Part Time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="internship">Internship</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Preferred Location</label>
                <Input
                  placeholder="e.g., San Francisco, Remote, New York"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>

              {jobType && jobType !== 'internship' && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Experience Level</label>
                  <Select value={experience} onValueChange={setExperience}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select experience" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entry">Entry Level</SelectItem>
                      <SelectItem value="mid">Mid Level</SelectItem>
                      <SelectItem value="senior">Senior</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button onClick={handleStart} disabled={loading} size="lg" className="w-full">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading Jobs...</> : 'Start Matching'}
              </Button>
            </div>
          </Card>
        ) : currentJob ? (
          <div className="max-w-2xl mx-auto">
            <Card className={`p-8 mb-6 relative overflow-hidden transition-all duration-300 ${
              swipeDirection === 'left' ? 'translate-x-[-100%] opacity-0' : 
              swipeDirection === 'right' ? 'translate-x-[100%] opacity-0' : ''
            }`}>
              {currentJob.matchScore && (
                <div className="absolute top-4 right-4">
                  <Badge className="bg-primary text-primary-foreground">
                    {currentJob.matchScore}% Match
                  </Badge>
                </div>
              )}
                <div className="text-center mb-6">
                  <Badge className="mb-4">Job {currentJobIndex + 1} of {jobs.length}</Badge>
                  <h2 className="text-3xl font-bold mb-2">{currentJob.company}</h2>
                  <p className="text-xl text-muted-foreground mb-2">{currentJob.title}</p>
                <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground mb-4">
                  <span className="flex items-center gap-1">
                    📍 {currentJob.location}
                  </span>
                  {currentJob.salary && (
                    <>
                      <span>•</span>
                      <span>{currentJob.salary}</span>
                    </>
                  )}
                </div>
                {currentJob.posted && (
                  <p className="text-xs text-muted-foreground">
                    Posted {new Date(currentJob.posted).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="bg-muted/30 rounded-lg p-4 mb-8 max-h-[200px] overflow-y-auto">
                <p className="text-sm leading-relaxed mb-3">
                  <span className="font-semibold">About the role: </span>
                  {displayDescription || currentJob.title}
                </p>
                {currentJob.whyMatch && (
                  <p className="text-sm leading-relaxed pt-3 border-t border-border">
                    <span className="font-semibold">Why it suits you: </span>{displayWhy || `This ${currentJob.title} role at ${currentJob.company} aligns with your profile.`}
                  </p>
                )}
              </div>
              
              <div className="flex items-center justify-center gap-6">
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => handleSwipe(false)}
                  className="h-16 w-16 rounded-full p-0 border-2 hover:border-primary/50"
                >
                  <X className="h-8 w-8" />
                </Button>
                <Button
                  size="lg"
                  onClick={() => handleSwipe(true)}
                  className="h-16 w-16 rounded-full p-0 bg-primary hover:bg-primary/90"
                >
                  <Heart className="h-8 w-8" />
                </Button>
              </div>
            </Card>
            <p className="text-center text-sm text-muted-foreground">
              Swipe right to save • Swipe left to skip
            </p>
          </div>
        ) : null}
      </div>
  );
};

export default JobsPage;
