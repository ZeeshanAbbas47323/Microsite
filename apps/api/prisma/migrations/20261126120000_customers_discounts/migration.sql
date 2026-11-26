-- AlterTable
ALTER TABLE `orders` ADD COLUMN `customer_id` CHAR(36) NULL,
    ADD COLUMN `discount_code` VARCHAR(32) NULL,
    ADD COLUMN `discount_id` CHAR(36) NULL,
    ADD COLUMN `discount_total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `via_account` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `customers` (
    `id` CHAR(36) NOT NULL,
    `store_id` CHAR(36) NOT NULL,
    `getorio_tenant_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(254) NULL,
    `password_hash` VARCHAR(255) NULL,
    `accepts_marketing` BOOLEAN NOT NULL DEFAULT false,
    `notes` VARCHAR(1000) NULL,
    `tags` JSON NULL,
    `orders_count` INTEGER NOT NULL DEFAULT 0,
    `total_spent` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `first_order_at` DATETIME(3) NULL,
    `last_order_at` DATETIME(3) NULL,
    `last_city` VARCHAR(80) NULL,
    `registered_at` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `customers_store_id_created_at_idx`(`store_id`, `created_at`),
    INDEX `customers_store_id_last_order_at_idx`(`store_id`, `last_order_at`),
    INDEX `customers_store_id_total_spent_idx`(`store_id`, `total_spent`),
    UNIQUE INDEX `customers_store_id_phone_key`(`store_id`, `phone`),
    UNIQUE INDEX `customers_store_id_email_key`(`store_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_addresses` (
    `id` CHAR(36) NOT NULL,
    `customer_id` CHAR(36) NOT NULL,
    `label` VARCHAR(40) NOT NULL DEFAULT 'Home',
    `name` VARCHAR(120) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `address` VARCHAR(250) NOT NULL,
    `city` VARCHAR(80) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `customer_addresses_customer_id_idx`(`customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discounts` (
    `id` CHAR(36) NOT NULL,
    `store_id` CHAR(36) NOT NULL,
    `getorio_tenant_id` VARCHAR(64) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `description` VARCHAR(200) NULL,
    `type` ENUM('percentage', 'fixed', 'free_shipping') NOT NULL,
    `value` DECIMAL(12, 2) NOT NULL,
    `max_discount` DECIMAL(12, 2) NULL,
    `min_subtotal` DECIMAL(12, 2) NULL,
    `usage_limit` INTEGER NULL,
    `per_customer_limit` INTEGER NULL,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `discounts_store_id_created_at_idx`(`store_id`, `created_at`),
    UNIQUE INDEX `discounts_store_id_code_key`(`store_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `orders_customer_id_created_at_idx` ON `orders`(`customer_id`, `created_at`);

-- CreateIndex
CREATE INDEX `orders_discount_id_idx` ON `orders`(`discount_id`);

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_discount_id_fkey` FOREIGN KEY (`discount_id`) REFERENCES `discounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_addresses` ADD CONSTRAINT `customer_addresses_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discounts` ADD CONSTRAINT `discounts_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: one customer per store + phone from existing orders, then link the orders.
INSERT INTO `customers` (`id`, `store_id`, `getorio_tenant_id`, `name`, `phone`, `orders_count`, `total_spent`, `first_order_at`, `last_order_at`, `last_city`, `created_at`, `updated_at`)
SELECT UUID(), x.store_id, x.getorio_tenant_id, x.customer_name, x.customer_phone, x.cnt, x.spent, x.first_at, x.last_at, x.city, x.first_at, CURRENT_TIMESTAMP(3)
FROM (
    SELECT o.store_id, o.getorio_tenant_id, o.customer_name, o.customer_phone, o.city,
        ROW_NUMBER() OVER w AS rn,
        COUNT(*) OVER p AS cnt,
        SUM(CASE WHEN o.status <> 'cancelled' THEN o.total ELSE 0 END) OVER p AS spent,
        MIN(o.created_at) OVER p AS first_at,
        MAX(o.created_at) OVER p AS last_at
    FROM `orders` o
    WINDOW p AS (PARTITION BY o.store_id, o.customer_phone),
           w AS (PARTITION BY o.store_id, o.customer_phone ORDER BY o.created_at DESC)
) x
WHERE x.rn = 1;

UPDATE `orders` o
JOIN `customers` c ON c.store_id = o.store_id AND c.phone = o.customer_phone
SET o.customer_id = c.id;
