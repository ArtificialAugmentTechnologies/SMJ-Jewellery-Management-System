/** Store details printed on invoices. Configure in frontend/.env (see .env.example). */
const env = import.meta.env;

export const STORE = {
  name: (env.VITE_STORE_NAME as string) || 'SMJ Jewellery',
  address: (env.VITE_STORE_ADDRESS as string) || '',
  phone: (env.VITE_STORE_PHONE as string) || '',
  email: (env.VITE_STORE_EMAIL as string) || '',
  gstin: (env.VITE_STORE_GSTIN as string) || '',
};
