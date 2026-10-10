import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Shield, Users, Activity, Crown, CheckCircle, Clock, Star, X, ChevronDown, ChevronUp, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { getTierDisplayName, normalizeActiveTier } from '@/config/pricing-config';

interface UsageStats {
  user_id: string;
  email: string;
  subscription_tier: string;
  total_actions: number;
  last_action_at: string | null;
  subscription_balance: number;
  shop_balance: number;
  total_merits: number;
}

interface UpgradeRequest {
  id: string;
  user_id: string;
  email: string;
  requested_at: string;
  status: string;
  payment_method: string | null;
  notes: string | null;
}

const AdminUsage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [usageStats, setUsageStats] = useState<UsageStats[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([]);
  const [upgradingUser, setUpgradingUser] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userBreakdown, setUserBreakdown] = useState<Record<string, { action_type: string; credits_used: number }[]>>({});
  const [loadingBreakdown, setLoadingBreakdown] = useState<string | null>(null);
  const [editingMeritsUserId, setEditingMeritsUserId] = useState<string | null>(null);
  const [editingMeritsValue, setEditingMeritsValue] = useState<string>('');
  const [savingMerits, setSavingMerits] = useState(false);

  useEffect(() => {
    const checkAdminAndFetchStats = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate('/auth');
          return;
        }

        const { data: hasAdminRole, error: roleError } = await supabase
          .rpc('has_role', { _user_id: user.id, _role: 'admin' });

        if (roleError || !hasAdminRole) {
          toast.error('Access denied. Admin privileges required.');
          navigate('/dashboard');
          return;
        }

        setIsAdmin(true);
        await fetchData();
      } catch (error) {
        console.error('Admin check error:', error);
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    checkAdminAndFetchStats();
  }, [navigate]);

  const fetchData = async () => {
    const [statsResult, requestsResult] = await Promise.all([
      supabase.rpc('get_admin_usage_stats'),
      supabase.rpc('get_pending_upgrade_requests')
    ]);

    if (statsResult.data) setUsageStats(statsResult.data);
    if (requestsResult.data) setUpgradeRequests(requestsResult.data as UpgradeRequest[]);
  };

  const handleChangeTier = async (userId: string, newTier: string, userEmail?: string, requestId?: string) => {
    setUpgradingUser(userId);
    try {
      const { data, error } = await supabase.rpc('admin_upgrade_user', {
        p_user_id: userId,
        p_tier: newTier,
        p_request_id: requestId || undefined
      });

      if (error) throw error;

      // Send approval email to user via unified email function
      if (userEmail && normalizeActiveTier(newTier) === 'elite') {
        try {
          await supabase.functions.invoke('send-notification-email', {
            body: { 
              eventType: 'user_elite_granted',
              to: userEmail,
              data: { email: userEmail, tier: normalizeActiveTier(newTier) }
            }
          });
        } catch (emailError) {
          console.error('Failed to send approval email:', emailError);
        }
      }

      toast.success(`User tier changed to ${newTier}!`);
      await fetchData();
    } catch (error) {
      console.error('Tier change error:', error);
      toast.error('Failed to change user tier');
    } finally {
      setUpgradingUser(null);
    }
  };

  const getTierBadgeClass = (tier: string) => {
    switch (tier) {
      case 'elite': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUserId) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId: deletingUserId }
      });
      if (error) throw error;
      if (data && typeof data === 'object' && 'error' in (data as any)) {
        throw new Error((data as any).error);
      }

      toast.success('User removed');
      setDeletingUserId(null);
      await fetchData();
    } catch (e: any) {
      console.error('Delete user error:', e);
      toast.error(e?.message || 'Failed to remove user');
    } finally {
      setDeleting(false);
    }
  };

  const ACTION_LABELS: Record<string, string> = {
    resume_analysis: 'Resume Analysis',
    job_matching: 'Recruiting Lens',
    career_compass: 'Career Compass',
    linkedin_grading: 'LinkedIn Grader',
  };

  const handleToggleBreakdown = async (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(userId);
    if (userBreakdown[userId]) return;
    setLoadingBreakdown(userId);
    try {
      const { data, error } = await supabase.rpc('get_user_usage_breakdown', { p_user_id: userId });
      if (error) throw error;
      setUserBreakdown(prev => ({ ...prev, [userId]: (data as any[]) || [] }));
    } catch (e) {
      console.error('Failed to fetch breakdown:', e);
    } finally {
      setLoadingBreakdown(null);
    }
  };

  const handleStartEditMerits = (userId: string, currentBalance: number) => {
    setEditingMeritsUserId(userId);
    setEditingMeritsValue(String(currentBalance));
  };

  const handleCancelEditMerits = () => {
    setEditingMeritsUserId(null);
    setEditingMeritsValue('');
  };

  const handleSaveMerits = async () => {
    if (!editingMeritsUserId) return;
    const parsedValue = parseInt(editingMeritsValue, 10);
    if (isNaN(parsedValue) || parsedValue < 0) {
      toast.error('Merits must be a positive number');
      return;
    }
    setSavingMerits(true);
    try {
      const { error } = await supabase.rpc('admin_set_user_merits', {
        p_user_id: editingMeritsUserId,
        p_merits: parsedValue,
      });
      if (error) throw error;
      toast.success('Merits updated');
      setEditingMeritsUserId(null);
      setEditingMeritsValue('');
      await fetchData();
    } catch (e: any) {
      console.error('Failed to update merits:', e);
      toast.error('Failed to update merits');
    } finally {
      setSavingMerits(false);
    }
  };

  const handleMeritsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveMerits();
    } else if (e.key === 'Escape') {
      handleCancelEditMerits();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'fulfilled':
        return (
          <Badge className="bg-green-500/20 text-green-400">
            <CheckCircle className="w-3 h-3 mr-1" />
            Fulfilled
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 pt-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 pt-8 pb-12 max-w-lg">
          <Card className="p-8 text-center">
            <div className="p-4 rounded-full bg-destructive/10 w-fit mx-auto mb-4">
              <Shield className="h-12 w-12 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Not Authorized</h1>
            <p className="text-muted-foreground mb-6">
              You don't have permission to access this page. Admin privileges are required.
            </p>
            <Button onClick={() => navigate('/dashboard')}>
              Return to Dashboard
            </Button>
          </Card>
        </div>
    );
  }

  const totalUsers = usageStats.length;
  const totalActions = usageStats.reduce((sum, u) => sum + Number(u.total_actions), 0);
  const activeUsers = usageStats.filter(u => u.total_actions > 0).length;
  const pendingRequests = upgradeRequests.filter(r => r.status === 'pending').length;

  return (
    <div className="container mx-auto px-4 pt-8 pb-12 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-xl bg-primary/10">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage users and upgrade requests</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold text-foreground">{totalUsers}</p>
              </div>
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Active This Cycle</p>
                <p className="text-2xl font-bold text-foreground">{activeUsers}</p>
              </div>
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Total Actions</p>
                <p className="text-2xl font-bold text-primary">{totalActions}</p>
              </div>
            </div>
          </Card>
          <Card className="p-6 border-primary/50">
            <div className="flex items-center gap-3">
              <Crown className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Pending Upgrades</p>
                <p className="text-2xl font-bold text-primary">{pendingRequests}</p>
              </div>
            </div>
          </Card>
        </div>

        <Tabs defaultValue="requests" className="space-y-4">
          <TabsList>
            <TabsTrigger value="requests">
              Upgrade Requests {pendingRequests > 0 && <Badge className="ml-2 bg-primary">{pendingRequests}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="users">All Users</TabsTrigger>
          </TabsList>

          <TabsContent value="requests">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-secondary/30">
                    <tr>
                      <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Email</th>
                      <th className="text-center py-4 px-6 text-sm font-medium text-muted-foreground">Status</th>
                      <th className="text-center py-4 px-6 text-sm font-medium text-muted-foreground">Requested</th>
                      <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upgradeRequests.map((request) => (
                      <tr key={request.id} className="border-t border-border hover:bg-secondary/10 transition-colors">
                        <td className="py-4 px-6">
                          <span className="text-sm text-foreground">{request.email}</span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          {getStatusBadge(request.status)}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(request.requested_at), 'MMM d, h:mm a')}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          {request.status === 'pending' && (
                            <div className="flex items-center justify-end gap-2">
                              <Button 
                                size="sm"
                                className="bg-purple-600 hover:bg-purple-700"
                                onClick={() => handleChangeTier(request.user_id, 'elite', request.email, request.id)}
                                disabled={upgradingUser === request.user_id}
                              >
                                {upgradingUser === request.user_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Star className="h-4 w-4 mr-1" />
                                    Grant Elite
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {upgradeRequests.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-muted-foreground">
                          No upgrade requests yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-secondary/30">
                    <tr>
                      <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Email</th>
                      <th className="text-center py-4 px-6 text-sm font-medium text-muted-foreground">Plan</th>
                      <th className="text-center py-4 px-6 text-sm font-medium text-muted-foreground">Actions</th>
                      <th className="text-center py-4 px-6 text-sm font-medium text-muted-foreground">Merits</th>
                      <th className="text-center py-4 px-6 text-sm font-medium text-muted-foreground">Last Action</th>
                      <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">Quick Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageStats.map((user) => (
                      <React.Fragment key={user.user_id}>
                        <tr className="border-t border-border hover:bg-secondary/10 transition-colors">
                          <td className="py-4 px-6">
                            <button
                              className="flex items-center gap-1.5 text-sm text-foreground hover:text-primary transition-colors text-left"
                              onClick={() => handleToggleBreakdown(user.user_id)}
                            >
                              {expandedUserId === user.user_id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              {user.email}
                            </button>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <Badge variant="outline" className={getTierBadgeClass(user.subscription_tier)}>
                              {getTierDisplayName(user.subscription_tier)}
                            </Badge>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <span className="text-lg font-semibold text-foreground">{user.total_actions}</span>
                          </td>
                          <td className="py-4 px-6 text-center">
                            {editingMeritsUserId === user.user_id ? (
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  value={editingMeritsValue}
                                  onChange={(e) => setEditingMeritsValue(e.target.value)}
                                  onKeyDown={handleMeritsKeyDown}
                                  className="w-20 h-7 text-center text-sm border rounded bg-background text-foreground"
                                  autoFocus
                                  disabled={savingMerits}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                                  onClick={handleSaveMerits}
                                  disabled={savingMerits}
                                  title="Save"
                                >
                                  {savingMerits ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  onClick={handleCancelEditMerits}
                                  disabled={savingMerits}
                                  title="Cancel"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center">
                                <button
                                  className="flex items-center justify-center gap-1 cursor-pointer hover:text-primary transition-colors text-sm font-medium text-foreground"
                                  onClick={() => handleStartEditMerits(user.user_id, user.subscription_balance)}
                                  title="Click to edit subscription merits"
                                >
                                  <span>{user.subscription_balance + user.shop_balance}</span>
                                  <Pencil className="h-3 w-3 text-muted-foreground" />
                                </button>
                                {user.shop_balance > 0 && (
                                  <span className="text-xs text-muted-foreground">{user.subscription_balance}s + {user.shop_balance}p</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-6 text-center">
                            <span className="text-sm text-muted-foreground">
                              {user.last_action_at
                                ? format(new Date(user.last_action_at), 'MMM d, h:mm a')
                                : 'Never'
                              }
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Select
                                value={normalizeActiveTier(user.subscription_tier)}
                                onValueChange={(value) => handleChangeTier(user.user_id, value, user.email)}
                                disabled={upgradingUser === user.user_id}
                              >
                                <SelectTrigger className="w-[110px]">
                                  {upgradingUser === user.user_id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <SelectValue />
                                  )}
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="free">Free</SelectItem>
                                  <SelectItem value="elite">Elite</SelectItem>
                                </SelectContent>
                              </Select>

                              <AlertDialog open={deletingUserId === user.user_id} onOpenChange={(open) => setDeletingUserId(open ? user.user_id : null)}>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    title="Remove user"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove user?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete this user and their data. They can sign up again later using the same email.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      disabled={deleting}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        handleDeleteUser();
                                      }}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                        {expandedUserId === user.user_id && (
                          <tr className="bg-secondary/5">
                            <td colSpan={6} className="px-6 py-4">
                              {loadingBreakdown === user.user_id ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" /> Loading breakdown…
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Merit Breakdown</p>
                                  {userBreakdown[user.user_id]?.length ? (
                                    <div className="flex flex-wrap gap-2">
                                      {userBreakdown[user.user_id].map((item) => (
                                        <Badge key={item.action_type} variant="outline" className="text-xs">
                                          {ACTION_LABELS[item.action_type] || item.action_type}: <span className="font-semibold ml-1">{item.credits_used}</span>
                                        </Badge>
                                      ))}
                                      <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                                        Sub: <span className="font-semibold ml-1">{user.subscription_balance}</span>
                                        <span className="mx-1">|</span>
                                        Shop: <span className="font-semibold ml-1">{user.shop_balance}</span>
                                      </Badge>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">No usage this cycle</p>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {usageStats.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-muted-foreground">
                          No users found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
};

export default AdminUsage;
