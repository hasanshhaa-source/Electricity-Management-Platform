import { Badge } from '@/components/ui/badge';
import type { MeterType } from '@/types';

export function MeterTypeBadge({ type }: { type: MeterType }) {
  return (
    <Badge variant={type === 'shared' ? 'warning' : 'default'}>
      {type === 'shared' ? 'Shared' : 'Individual'}
    </Badge>
  );
}
