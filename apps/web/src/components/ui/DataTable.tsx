import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';

type Align = 'left' | 'center' | 'right';

const alignClass: Record<Align, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

interface DataTableProps extends TableHTMLAttributes<HTMLTableElement> {
  containerClassName?: string;
}

export function DataTable({
  children,
  className = '',
  containerClassName = '',
  ...props
}: DataTableProps) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-border ${containerClassName}`}>
      <table className={`w-full text-sm ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}

export function DataTableHead({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={`border-b border-border bg-surface-elevated ${className}`}
      {...props}
    >
      {children}
    </thead>
  );
}

export function DataTableBody({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`divide-y divide-border ${className}`} {...props}>
      {children}
    </tbody>
  );
}

export function DataTableRow({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`transition-colors hover:bg-surface-elevated/50 ${className}`} {...props}>
      {children}
    </tr>
  );
}

interface DataTableHeaderProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
}

export function DataTableHeader({
  children,
  align = 'left',
  className = '',
  ...props
}: DataTableHeaderProps) {
  return (
    <th className={`whitespace-nowrap px-md py-sm font-medium ${alignClass[align]} ${className}`} {...props}>
      {children}
    </th>
  );
}

interface DataTableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
}

export function DataTableCell({
  children,
  align = 'left',
  className = '',
  ...props
}: DataTableCellProps) {
  return (
    <td className={`px-md py-sm ${alignClass[align]} ${className}`} {...props}>
      {children}
    </td>
  );
}
