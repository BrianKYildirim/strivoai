import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PlusCircle, Briefcase } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AddApplicationDialog from "@/components/applications/AddApplicationDialog";
import ReportOutcomeDialog from "@/components/applications/ReportOutcomeDialog";
import { supabase } from "@/lib/supabaseClient";

type ApplicationStatus =
  | "saved"
  | "applied"
  | "interviewing"
  | "offered"
  | "rejected"
  | "withdrawn"
  | "ghosted";

interface OutcomeRow {
  id: string;
  result: string;
}

interface ApplicationRow {
  id: string;
  company_applied: string;
  role_applied: string;
  status: ApplicationStatus;
  application_date: string | null;
  application_source: string | null;
  created_at: string;
  // outcomes.application_id is UNIQUE (1:1 with applications), so PostgREST embeds this as
  // a TO-ONE relation: it arrives as `OutcomeRow | null`, NEVER as an array. Typing it
  // `OutcomeRow[]` and calling `.length` on it threw
  // `Cannot read properties of null (reading 'length')` for every application with no
  // outcome row — which is all of them today — and, with no error boundary above this page,
  // unmounted the entire React tree to a white screen.
  outcomes: OutcomeRow | null;
}

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offered: "Offered",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
};

const STATUS_BADGE_VARIANT: Record<ApplicationStatus, string> = {
  saved: "secondary",
  applied: "outline",
  interviewing: "default",
  offered: "default",
  rejected: "destructive",
  withdrawn: "secondary",
  ghosted: "secondary",
};

const OVERDUE_THRESHOLD_DAYS = 14;

function isOverdue(app: ApplicationRow): boolean {
  const date = app.application_date ?? app.created_at;
  const cutoff = new Date(Date.now() - OVERDUE_THRESHOLD_DAYS * 86400000);
  return new Date(date) < cutoff && app.outcomes === null;
}

export default function ApplicationsPage() {
  const [searchParams] = useSearchParams();
  const filter = searchParams.get("filter");

  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [outcomeOpenFor, setOutcomeOpenFor] = useState<string | null>(null);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("applications")
        .select("id, company_applied, role_applied, status, application_date, application_source, created_at, outcomes(id, result)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[Applications] Fetch error:", error);
        toast.error("Failed to load applications.");
        return;
      }

      // Cast through `unknown`: Supabase's GENERATED types model the `outcomes` embed as an
      // array (`{id, result}[]`), but PostgREST returns it as a TO-ONE relation — an object,
      // or `null` when no outcome row exists — because outcomes.application_id is UNIQUE.
      // Verified against the live API: `outcomes = null, isArray = false`. The generated type
      // is what made `app.outcomes.length` look safe; it is not.
      setApplications((data ?? []) as unknown as ApplicationRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchApplications();
  }, []);

  const handleStatusChange = async (appId: string, newStatus: ApplicationStatus) => {
    const { error } = await supabase
      .from("applications")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", appId);

    if (error) {
      toast.error("Failed to update status.");
      return;
    }

    setApplications((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a)),
    );
    toast.success("Status updated.");
  };

  const displayed =
    filter === "overdue" ? applications.filter(isOverdue) : applications;

  return (
    <div className="container mx-auto px-4 pt-6 pb-12 max-w-6xl">
      {/* Header */}
      {/* flex-wrap + min-w-0 + shrink-0: at a 390px viewport the non-shrinkable
          whitespace-nowrap "Add Application" button (162px) could not fit beside the
          heading block, pushing the page to a 428px scrollWidth and scrolling the whole
          document sideways. Wrapping costs nothing on desktop (it only engages when the
          row genuinely cannot fit). */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Applications</h1>
          <p className="text-muted-foreground mt-1">
            Track and manage your job applications.
            {filter === "overdue" && (
              <Badge variant="destructive" className="ml-2">
                Overdue filter active
              </Badge>
            )}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2 shrink-0">
          <PlusCircle className="h-4 w-4" />
          Add Application
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <Card className="p-8 text-center text-muted-foreground">Loading applications…</Card>
      ) : displayed.length === 0 ? (
        <Card className="p-12 text-center border-2 border-dashed border-primary/30">
          <Briefcase className="h-16 w-16 mx-auto mb-6 text-primary/60" />
          <h2 className="text-xl font-bold mb-2">No applications yet</h2>
          <p className="text-muted-foreground mb-6">
            {filter === "overdue"
              ? "No overdue applications found. Great work!"
              : "Add your first application to start tracking your job search."}
          </p>
          {filter !== "overdue" && (
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <PlusCircle className="h-4 w-4" />
              Add Application
            </Button>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Application Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.map((app) => {
                const hasOutcome = app.outcomes !== null;
                const overdue = isOverdue(app);
                return (
                  <TableRow key={app.id} className={overdue ? "bg-destructive/5" : ""}>
                    <TableCell className="font-medium">{app.company_applied}</TableCell>
                    <TableCell>{app.role_applied}</TableCell>
                    <TableCell>
                      <Select
                        value={app.status}
                        onValueChange={(val) =>
                          handleStatusChange(app.id, val as ApplicationStatus)
                        }
                      >
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {STATUS_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {app.application_date
                        ? new Date(app.application_date).toLocaleDateString()
                        : new Date(app.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm capitalize">
                      {app.application_source?.replace("_", " ") ?? "—"}
                    </TableCell>
                    <TableCell>
                      {hasOutcome ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize text-xs">
                            {app.outcomes?.result}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setOutcomeOpenFor(app.id)}
                          >
                            Update
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setOutcomeOpenFor(app.id)}
                        >
                          Report
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Modals */}
      <AddApplicationDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={fetchApplications}
      />
      <ReportOutcomeDialog
        applicationId={outcomeOpenFor}
        onOpenChange={(open) => {
          if (!open) setOutcomeOpenFor(null);
        }}
        onSaved={fetchApplications}
      />
    </div>
  );
}
