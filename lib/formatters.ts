export const fmt = (n: number) => '$' + Math.round(n).toLocaleString();
export const fmtGB = (n: number) => Math.round(n).toLocaleString() + ' GB';
export const fmtK = (n: number) => '$' + (n / 1000).toFixed(0) + 'K';

export const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const monthLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return MONTH_NAMES[+mo] + " '" + y.slice(2);
};

export const daysInMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).getDate();
};
