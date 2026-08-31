import { Search } from 'lucide-react'

import { ALL } from '@/lib/useList'
import { useT } from '@/i18n'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * The two widgets every list page puts above its rows. They were copied into
 * ten pages, which is how the dropdowns all ended up saying nothing but
 * "semua" — a row of those tells you what is not being filtered, but never
 * which field is not being filtered.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="relative min-w-[14rem] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export type FilterOption = { value: string; label: string }

/** A filter dropdown whose "no filter" row names the field it belongs to. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className = 'min-w-[8.5rem] flex-1 sm:max-w-[11rem]',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: FilterOption[]
  className?: string
}) {
  const { t } = useT()
  return (
    <Select value={value || ALL} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t('common.allOf', { what: label })}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
