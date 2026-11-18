-- =====================================================================
-- SMJ Jewellery - optional SAMPLE data (safe to run more than once).
-- Run with:  npm run db:seed -- --sample
--
-- The administrator account is NOT created here (no passwords in SQL files);
-- `npm run db:seed` creates it from ADMIN_EMAIL / ADMIN_PASSWORD in backend/.env.
--
-- The gold / silver rates below are PLACEHOLDERS - update them from the
-- Gold Rate Management screen before billing.
-- =====================================================================

BEGIN;

INSERT INTO gold_rates (gold_rate_per_gram, silver_rate_per_gram, effective_date)
SELECT 11850.00, 168.00, now()
WHERE NOT EXISTS (SELECT 1 FROM gold_rates);

-- Opening stock: every product with stock gets a matching "inward" movement so
-- the stock ledger always reconciles with products.quantity.
WITH new_products AS (
    INSERT INTO products (product_name, category, metal, description, weight, quantity, purchase_price)
    VALUES
        ('Plain Gold Tumbler',        'Tumbler', 'gold',   '22K plain finish tumbler',          8.500,  6, 98000.00),
        ('Silver Pooja Tumbler',      'Tumbler', 'silver', '92.5 silver tumbler',               45.000, 12, 7200.00),
        ('Rope Chain 22K',            'Chain',   'gold',   '22K rope chain, 20 inch',           12.250, 10, 141000.00),
        ('Box Chain 22K',             'Chain',   'gold',   '22K box chain, 18 inch',            8.000,  15, 92000.00),
        ('Silver Anklet (Kolusu)',    'Anklet',  'silver', 'Traditional silver kolusu, pair',   60.000, 20, 9600.00),
        ('Gold Anklet Light',         'Anklet',  'gold',   '22K light anklet, pair',            10.000,  4, 115000.00),
        ('Ladies Stone Ring',         'Ring',    'gold',   '22K ring with CZ stone',            3.200,  25, 36500.00),
        ('Gents Signet Ring',         'Ring',    'gold',   '22K signet ring',                   6.500,  10, 74800.00)
    ON CONFLICT DO NOTHING
    RETURNING id, weight, quantity, purchase_price
)
INSERT INTO stock_movements (product_id, movement_type, quantity, weight, unit_price, reference_type, remarks)
SELECT id, 'inward', quantity, weight * quantity, purchase_price, 'stock_inward', 'Opening stock (sample seed)'
FROM new_products
WHERE quantity > 0;

COMMIT;
