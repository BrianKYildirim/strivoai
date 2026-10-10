/**
 * useOutOfMeritsModal — Phase 24 Plan 06 (SC-9a rewire).
 *
 * Consumer-side hook that manages OutOfMeritsModalV2 visibility and props.
 * Introduced in Plan 06 as the additive path: usePaywallGuard keeps its
 * existing UpgradeModal surface for lifetime-limit paths, while new
 * feature-gated flows (Resume Analysis, Career Compass, LinkedIn Grader,
 * Recruiting Lens, Interview Prep Coach) that fail with HTTP 402
 * 'insufficient_merits' bind to this hook instead.
 *
 * Typical consumer pattern:
 *   const { openModal, modalProps } = useOutOfMeritsModal();
 *   // on 402 response:
 *   openModal({ feature: 'Resume Analysis', cost: 3, balance: 1 });
 *   // in JSX:
 *   <OutOfMeritsModalV2 {...modalProps} />
 */
import { useCallback, useMemo, useState } from 'react';
import type { OutOfMeritsModalV2Props } from '@/components/topup/OutOfMeritsModalV2';

interface OpenModalArgs {
  feature: string;
  cost: number;
  balance: number;
}

interface UseOutOfMeritsModalReturn {
  isOpen: boolean;
  openModal: (args: OpenModalArgs) => void;
  closeModal: () => void;
  modalProps: OutOfMeritsModalV2Props;
}

export function useOutOfMeritsModal(): UseOutOfMeritsModalReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [args, setArgs] = useState<OpenModalArgs>({
    feature: '',
    cost: 0,
    balance: 0,
  });

  const openModal = useCallback((next: OpenModalArgs) => {
    setArgs(next);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const modalProps = useMemo<OutOfMeritsModalV2Props>(
    () => ({
      open: isOpen,
      onOpenChange: (next: boolean) => setIsOpen(next),
      feature: args.feature,
      cost: args.cost,
      balance: args.balance,
    }),
    [isOpen, args],
  );

  return { isOpen, openModal, closeModal, modalProps };
}
