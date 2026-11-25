/** The API stores money as integer satang (1 baht = 100 satang). */
export const satangToBaht = (satang: number): number => satang / 100;
export const bahtToSatang = (baht: number): number => Math.round(baht * 100);
export const formatBaht = (satang: number): string =>
  satangToBaht(satang).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
