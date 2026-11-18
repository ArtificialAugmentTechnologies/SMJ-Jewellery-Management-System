import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { sql } from 'drizzle-orm';
import { getDb, getDbHandle } from '../config/db.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import * as auth from '../controllers/authController.js';
import * as usersCtl from '../controllers/userController.js';
import * as rates from '../controllers/goldRateController.js';
import * as dashboard from '../controllers/dashboardController.js';
import * as customersCtl from '../controllers/customerController.js';
import * as productsCtl from '../controllers/productController.js';
import * as stock from '../controllers/stockController.js';
import * as parties from '../controllers/partyController.js';
import * as distributions from '../controllers/distributionController.js';
import * as invoicesCtl from '../controllers/invoiceController.js';
import * as reports from '../controllers/reportController.js';

export function buildRouter({ loginRateLimit = true } = {}) {
  const r = Router();

  // ---- Public --------------------------------------------------------------
  r.get('/health', async (_req, res) => {
    let database = 'down';
    try {
      await getDb().execute(sql`SELECT 1`);
      database = 'up';
    } catch {
      /* reported below */
    }
    res.status(database === 'up' ? 200 : 503).json({ status: database === 'up' ? 'ok' : 'degraded', database, driver: getDbHandle().driver });
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'too_many_attempts', message: 'Too many login attempts. Try again in 15 minutes.' } },
  });
  r.post('/auth/login', ...(loginRateLimit ? [loginLimiter] : []), auth.login);

  // ---- Authenticated (admin + staff) -----------------------------------------
  r.use(requireAuth);

  r.get('/auth/me', auth.me);
  r.post('/auth/change-password', auth.changePassword);

  r.get('/dashboard', dashboard.summary);

  r.get('/gold-rates/current', rates.currentRate);
  r.get('/gold-rates', rates.rateHistory);
  r.post('/gold-rates', requireAdmin, rates.createRate);

  r.get('/customers', customersCtl.listCustomers);
  r.get('/customers/lookup', customersCtl.lookupByMobile);
  r.get('/customers/:id', customersCtl.getCustomer);
  r.post('/customers', customersCtl.createCustomer);
  r.patch('/customers/:id', customersCtl.updateCustomer);

  r.get('/products', productsCtl.listProducts);
  r.get('/products/:id', productsCtl.getProduct);
  r.post('/products', requireAdmin, productsCtl.createProduct);
  r.patch('/products/:id', requireAdmin, productsCtl.updateProduct);

  r.get('/stock/summary', stock.stockSummary);
  r.get('/stock/movements', stock.listMovements);
  r.post('/stock/inward', requireAdmin, stock.stockInward);
  r.post('/stock/outward', requireAdmin, distributions.issueDistribution);

  r.get('/wholesale/parties', parties.listParties);
  r.get('/wholesale/parties/:id', parties.getParty);
  r.post('/wholesale/parties', requireAdmin, parties.createParty);
  r.patch('/wholesale/parties/:id', requireAdmin, parties.updateParty);

  r.get('/wholesale/distributions', distributions.listDistributions);
  r.get('/wholesale/distributions/:id', distributions.getDistribution);
  r.post('/wholesale/distributions', requireAdmin, distributions.issueDistribution);
  r.post('/wholesale/distributions/:id/settle', requireAdmin, distributions.settleDistribution);

  r.get('/invoices', invoicesCtl.listInvoices);
  r.get('/invoices/:id', invoicesCtl.getInvoice);
  r.post('/invoices/retail', invoicesCtl.createRetailInvoice);
  r.post('/invoices/wholesale', invoicesCtl.createWholesaleInvoice);
  r.post('/invoices/:id/payments', invoicesCtl.recordPayment);

  r.get('/reports/:report', reports.runReport);

  // ---- Admin only ---------------------------------------------------------------
  r.get('/users', requireAdmin, usersCtl.listUsers);
  r.post('/users', requireAdmin, usersCtl.createUser);
  r.patch('/users/:id', requireAdmin, usersCtl.updateUser);

  return r;
}
