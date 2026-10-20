/**
 * HeaderTopUpTrigger — Phase 24 Plan 06 (SC-9b).
 *
 * The '+' icon sibling of MeritBalanceHeaderV2 in the top nav. Only renders
 * when the user is in the "low merits" zone (D-08 isLow true). Deep-links to
 * /pricing#packs (D-24) — the pack section of the pricing page.
 *
 * Self-hides on /pricing to avoid a redundant CTA at the destination.
 */
import { Plus } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useMerits } from '@/hooks/useMerits';

export function HeaderTopUpTrigger() {
  const { isLow, isZero, isLoading } = useMerits();
  const location = useLocation();
  const navigate = useNavigate();

  if (isLoading) return null;
  // IN-01: WR-03 widened isLow to include subscription===0. When the user is
  // fully out, the OutOfMeritsModalV2 / Dashboard "Limit Reached" banner owns
  // the zero-state CTA — the header '+' nudge would be a third redundant
  // affordance. Yield to the modal/banner by hiding here on isZero.
  if (isZero) return null;
  if (!isLow) return null;
  if (location.pathname === '/pricing') return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Buy more merits"
      onClick={() => navigate('/pricing#packs')}
      className="h-8 w-8 text-[--accent-red]"
    >
      <Plus className="h-4 w-4" />
    </Button>
  );
}
