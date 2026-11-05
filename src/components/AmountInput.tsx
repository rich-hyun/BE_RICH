import { forwardRef } from 'react'
import { Input } from '@/components/ui/input'
import { formatAmountInput } from '@/lib/format'
import { cn } from '@/lib/utils'

/** 천 단위 콤마가 자동 적용되는 금액 입력 (원 단위, 모바일 숫자 키패드) */
export const AmountInput = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void; allowNegative?: boolean; invalid?: boolean } & Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange'
  >
>(({ value, onChange, allowNegative, invalid, className, ...props }, ref) => (
  <div className="relative">
    <Input
      ref={ref}
      inputMode="numeric"
      autoComplete="off"
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(formatAmountInput(e.target.value, allowNegative))}
      className={cn('pr-8 text-right tabular', className)}
      {...props}
    />
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">원</span>
  </div>
))
AmountInput.displayName = 'AmountInput'
