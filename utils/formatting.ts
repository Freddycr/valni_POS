export const formatCurrency = (amount: number | undefined | null): string => {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return 'S/ 0.00';
  }
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };
  return new Intl.NumberFormat('es-PE', options).format(amount);
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};
