CREATE TABLE product_variants (
 product_id TEXT NOT NULL REFERENCES products(id),
 id TEXT NOT NULL,
 data TEXT NOT NULL,
 stock INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY (product_id, id),
 CONSTRAINT variant_stock_nonnegative CHECK (stock >= 0)
);
CREATE TABLE design_templates (
 id TEXT PRIMARY KEY NOT NULL,
 data TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1
);
