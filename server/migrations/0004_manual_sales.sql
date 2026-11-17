ALTER TABLE orders ADD COLUMN source TEXT NOT NULL DEFAULT 'site';
ALTER TABLE orders ADD COLUMN sale_date TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN stock_action TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE orders ADD COLUMN customer_document TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN reference TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN due_date TEXT NOT NULL DEFAULT '';
UPDATE orders SET sale_date=date(created_at,'-3 hours') WHERE sale_date='';
CREATE INDEX orders_sale_date ON orders(sale_date);
