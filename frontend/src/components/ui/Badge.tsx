const colors: Record<string, string> = {
  scheduled: 'bg-amber-100 text-amber-800',
  sending: 'bg-blue-100 text-blue-800',
  sent: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

export function Badge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${colors[status] ?? 'bg-gray-100 text-gray-700'}`}>{status}</span>;
}
