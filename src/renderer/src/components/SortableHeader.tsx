export type SortDirection = 'ascending' | 'descending'

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

export function compareSortValues(
  a: string | number | null,
  b: string | number | null,
  direction: SortDirection
): number {
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  const result = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : collator.compare(String(a), String(b))
  return direction === 'ascending' ? result : -result
}

export function SortableHeader({ label, direction, onClick }: {
  label: string
  direction?: SortDirection
  onClick: () => void
}) {
  return (
    <th scope="col" aria-sort={direction}>
      <button type="button" className="table-sort-button" onClick={onClick}>
        {label} <span aria-hidden="true">{direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '↕'}</span>
      </button>
    </th>
  )
}
