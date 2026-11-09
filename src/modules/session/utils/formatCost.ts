import { USD_TO_EUR } from '../pricing';

/** Below a cent, two decimals would show "0,00 €"; four show that it is just cheap */
const CENT = 0.01;

/** USD estimate in euros. */
export function usdToEur(usd: number, rate: number = USD_TO_EUR): number {
  return usd * rate;
}

/** "0,0042 €" below a cent, "1,27 €" from a cent up, in the given locale. */
export function formatEur(usd: number, locale: string, rate: number = USD_TO_EUR): string {
  const eur = Math.max(0, usdToEur(usd, rate));
  const small = eur > 0 && eur < CENT;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: small ? 4 : 2,
    maximumFractionDigits: small ? 4 : 2,
  }).format(eur);
}
