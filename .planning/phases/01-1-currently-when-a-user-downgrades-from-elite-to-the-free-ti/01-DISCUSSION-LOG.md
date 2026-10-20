# Phase 01: Elite-to-Free Downgrade Feedback and Renewal Recovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md`; this log preserves the alternatives considered.

**Date:** 2026-07-19
**Phase:** 01-elite-to-free-downgrade-feedback-and-renewal-recovery
**Areas discussed:** Billing destination, Persistent reminder, Final-week dashboard alert, Keep Elite flow

---

## Billing Destination

### Canonical management surface

| Option | Description | Selected |
|--------|-------------|----------|
| Keep `/pricing` as Billing / Membership | Reuse the current navigation destination and add authenticated subscription status above the tier cards. | ✓ |
| Create `/settings/billing` | Build a dedicated subscription-status page. | |
| Use the Profile billing card | Put downgrade status and controls inside `/profile`. | |

**User's choice:** Keep `/pricing` as Billing / Membership.

### Public and authenticated experiences

| Option | Description | Selected |
|--------|-------------|----------|
| Context-aware header | Normal pricing for signed-out/Free users; account-status panel for authenticated Elite users. | ✓ |
| Always show a billing section | Render a membership section for every visitor. | |
| Separate authenticated tab | Add Plans and My Membership tabs. | |

**User's choice:** Context-aware header.

### Tier-card state

| Option | Description | Selected |
|--------|-------------|----------|
| Elite Current; Free Scheduled | Preserve current access while clearly marking the future transition. | ✓ |
| Elite Current; cards unchanged | Put all pending-state information only in the panel. | |
| Free as Next plan | Emphasize the destination tier. | |

**User's choice:** Elite remains **Current** and Free shows **Scheduled**.
**Notes:** The user explicitly required that an Elite user with a pending downgrade cannot click any downgrade action again. Until they restore renewal, the UI offers only renewal or passive continuation of the scheduled downgrade.

### Keeping the scheduled downgrade

| Option | Description | Selected |
|--------|-------------|----------|
| Passive status, one action | Leaving the state alone keeps the downgrade; only **Keep Elite and renew** mutates it. | ✓ |
| Two explicit buttons | Add a no-op confirmation for keeping the scheduled downgrade. | |
| Decision dialog | Present both states as modal choices. | |

**User's choice:** Passive status with one state-changing action.

---

## Persistent Reminder

### Panel prominence

| Option | Description | Selected |
|--------|-------------|----------|
| Date-led status panel | Lead with the exact end date and place renewal beside it. | ✓ |
| Status-led panel | Lead with “Downgrade scheduled.” | |
| Compact reminder strip | Use a single-line reminder. | |

**User's choice:** Date-led status panel.

### Date expression

| Option | Description | Selected |
|--------|-------------|----------|
| Local calendar date only | Full month, day, and year without a time. | ✓ |
| Date and time | Include the exact local timestamp and zone. | |
| Date plus billing context | Add “at the end of your current billing period.” | |

**User's choice:** Local calendar date only.

### Supporting detail

| Option | Description | Selected |
|--------|-------------|----------|
| Concise outcome summary | Explain continued Elite access, the move to Free, and disabled automatic renewal. | ✓ |
| Detailed impact list | Enumerate affected capabilities and Merits. | |
| Date and action only | Rely on tier cards for all other explanation. | |

**User's choice:** Concise outcome summary.

### Missing-date behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Visible syncing state | Keep the reminder and renewal action visible while confirming the exact date. | ✓ |
| Generic fallback | Say only “end of current billing period.” | |
| Hide temporarily | Render nothing until the exact date arrives. | |

**User's choice:** Visible syncing state; never estimate a date.

---

## Final-Week Dashboard Alert

### Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Seven or fewer local calendar days | Include the expiration date in the countdown window. | ✓ |
| Within 168 hours | Use a precise timestamp duration. | |
| Start of expiration week | Begin on that calendar week's Monday. | |

**User's choice:** Seven or fewer local calendar days remain.

### Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Topmost dashboard alert | Render above low-Merit and every other operational banner. | ✓ |
| Above Career OS hero | Preserve other alert ordering. | |
| Inside Career OS hero | Integrate the warning into the hero. | |

**User's choice:** Topmost dashboard alert.

### Dismissal

| Option | Description | Selected |
|--------|-------------|----------|
| No dismissal | Always render until the state changes. | |
| Dismiss for current session | Return in a new browser session if still relevant. | ✓ |
| Dismiss until next day | Persist dismissal through the local day. | |

**User's choice:** Dismiss for the current browser session.

### Alert emphasis

| Option | Description | Selected |
|--------|-------------|----------|
| Countdown plus exact date | Show remaining days, local date, and renewal action. | ✓ |
| Exact date only | Match Billing panel wording exactly. | |
| Escalating urgency | Switch to hours during the final 48 hours. | |

**User's choice:** Countdown plus exact date.

---

## Keep Elite Flow

### Entry interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Confirmation dialog | Explain resumed automatic billing before changing state. | ✓ |
| Restore immediately | Mutate billing state on the first click. | |
| Stripe portal | Redirect outside Strivo. | |

**User's choice:** Confirmation dialog.

### Financial disclosure

| Option | Description | Selected |
|--------|-------------|----------|
| Renewal date and continuity | Show date, uninterrupted Elite access, and saved-payment-method commitment without guessing price. | ✓ |
| Renewal date and exact charge | Fetch and show amount and interval. | |
| Minimal confirmation | Ask only whether to turn renewal on. | |

**User's choice:** Renewal date and continuity; do not guess a price.

### Success treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Toast plus persistent confirmed state | Keep “Automatic renewal is on” visible and remove pending-state UI. | ✓ |
| Toast only | Immediately return to normal Elite pricing. | |
| Dialog-only confirmation | Keep success inside the dialog until closed. | |

**User's choice:** Toast plus persistent confirmed state.

### Synchronization and failure

| Option | Description | Selected |
|--------|-------------|----------|
| Safe two-stage status | Disable repeats, distinguish Stripe confirmation from local synchronization, and preserve the downgrade on failure. | ✓ |
| Wait for full synchronization | Block until Stripe and profile agree. | |
| Return immediately | Let a later load resolve stale state. | |

**User's choice:** Safe two-stage status with Retry on true failure.

---

## Agent Discretion

- Exact component factoring, semantic-token styling, cache mechanics, and test seams.
- Minor copy polish that does not weaken the dates, state meanings, or financial commitment.

## Deferred Ideas

None.
