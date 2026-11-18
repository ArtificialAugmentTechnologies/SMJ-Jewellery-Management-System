import { useI18n } from '../i18n';
import type { Distribution, MovementType, PaymentStatus } from '../lib/types';
import { Badge } from './ui';

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const { t } = useI18n();
  const tone = status === 'paid' ? 'green' : status === 'partial' ? 'amber' : 'red';
  return <Badge tone={tone}>{t(`paymentStatus.${status}`)}</Badge>;
}

export function TypeBadge({ type }: { type: 'retail' | 'wholesale' }) {
  const { t } = useI18n();
  return <Badge tone={type === 'retail' ? 'gold' : 'blue'}>{t(`invoiceTypes.${type}`)}</Badge>;
}

export function MovementBadge({ type }: { type: MovementType }) {
  const { t } = useI18n();
  const tone = { inward: 'green', outward: 'blue', sold: 'gold', returned: 'amber' } as const;
  return <Badge tone={tone[type]}>{t(`movementTypes.${type}`)}</Badge>;
}

export function DistributionBadge({ status }: { status: Distribution['status'] }) {
  const { t } = useI18n();
  const tone = status === 'closed' ? 'green' : status === 'partially_settled' ? 'amber' : 'blue';
  return <Badge tone={tone}>{t(`distributionStatus.${status}`)}</Badge>;
}
