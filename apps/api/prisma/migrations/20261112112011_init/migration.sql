-- CreateTable
CREATE TABLE `merchants` (
    `id` CHAR(36) NOT NULL,
    `getorio_tenant_id` VARCHAR(64) NOT NULL,
    `getorio_user_id` VARCHAR(64) NOT NULL,
    `role` ENUM('owner', 'staff', 'platform_admin') NOT NULL,
    `last_login_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `merchants_getorio_tenant_id_getorio_user_id_key`(`getorio_tenant_id`, `getorio_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stores` (
    `id` CHAR(36) NOT NULL,
    `getorio_tenant_id` VARCHAR(64) NOT NULL,
    `owner_user_id` CHAR(36) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `status` ENUM('draft', 'published', 'suspended') NOT NULL DEFAULT 'draft',
    `currency` CHAR(3) NOT NULL DEFAULT 'PKR',
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Karachi',
    `settings` JSON NOT NULL,
    `draft_config` JSON NOT NULL,
    `published_config` JSON NULL,
    `published_version_id` CHAR(36) NULL,
    `published_at` DATETIME(3) NULL,
    `suspended_at` DATETIME(3) NULL,
    `storage_used_bytes` BIGINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stores_getorio_tenant_id_key`(`getorio_tenant_id`),
    INDEX `stores_owner_user_id_idx`(`owner_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `domains` (
    `id` CHAR(36) NOT NULL,
    `store_id` CHAR(36) NOT NULL,
    `getorio_tenant_id` VARCHAR(64) NOT NULL,
    `hostname` VARCHAR(253) NOT NULL,
    `type` ENUM('subdomain', 'custom') NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `redirect_to_domain_id` CHAR(36) NULL,
    `redirect_expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `domains_hostname_key`(`hostname`),
    INDEX `domains_store_id_idx`(`store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `site_versions` (
    `id` CHAR(36) NOT NULL,
    `store_id` CHAR(36) NOT NULL,
    `getorio_tenant_id` VARCHAR(64) NOT NULL,
    `kind` ENUM('published', 'draft_revision') NOT NULL,
    `config` JSON NOT NULL,
    `label` VARCHAR(120) NULL,
    `created_by` CHAR(36) NULL,
    `source` ENUM('manual', 'command', 'publish', 'restore', 'generate') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `site_versions_store_id_kind_created_at_idx`(`store_id`, `kind`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `command_logs` (
    `id` CHAR(36) NOT NULL,
    `store_id` CHAR(36) NOT NULL,
    `getorio_tenant_id` VARCHAR(64) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `command_text` VARCHAR(300) NOT NULL,
    `model` VARCHAR(100) NOT NULL,
    `prompt_tokens` INTEGER NOT NULL DEFAULT 0,
    `completion_tokens` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('proposed', 'applied', 'discarded', 'rejected', 'error') NOT NULL,
    `rejection_reason` VARCHAR(500) NULL,
    `patch` JSON NULL,
    `latency_ms` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `command_logs_store_id_created_at_idx`(`store_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_products` (
    `id` CHAR(36) NOT NULL,
    `store_id` CHAR(36) NOT NULL,
    `getorio_tenant_id` VARCHAR(64) NOT NULL,
    `getorio_product_id` VARCHAR(64) NOT NULL,
    `visible` BOOLEAN NOT NULL DEFAULT true,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `store_products_store_id_visible_idx`(`store_id`, `visible`),
    UNIQUE INDEX `store_products_store_id_getorio_product_id_key`(`store_id`, `getorio_product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` CHAR(36) NOT NULL,
    `store_id` CHAR(36) NOT NULL,
    `getorio_tenant_id` VARCHAR(64) NOT NULL,
    `order_ref` VARCHAR(32) NOT NULL,
    `idempotency_key` VARCHAR(128) NOT NULL,
    `status` ENUM('pending_sync', 'synced', 'sync_failed', 'cancelled') NOT NULL DEFAULT 'pending_sync',
    `customer_name` VARCHAR(120) NOT NULL,
    `customer_phone` VARCHAR(20) NOT NULL,
    `customer_email` VARCHAR(254) NULL,
    `address` VARCHAR(250) NOT NULL,
    `city` VARCHAR(80) NOT NULL,
    `notes` VARCHAR(500) NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `shipping_fee` DECIMAL(12, 2) NOT NULL,
    `total` DECIMAL(12, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `payment_method` VARCHAR(20) NOT NULL,
    `stock_unverified` BOOLEAN NOT NULL DEFAULT false,
    `getorio_order_id` VARCHAR(64) NULL,
    `sync_attempts` INTEGER NOT NULL DEFAULT 0,
    `last_sync_error` VARCHAR(500) NULL,
    `synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `orders_order_ref_key`(`order_ref`),
    INDEX `orders_store_id_created_at_idx`(`store_id`, `created_at`),
    INDEX `orders_status_updated_at_idx`(`status`, `updated_at`),
    UNIQUE INDEX `orders_store_id_idempotency_key_key`(`store_id`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `getorio_tenant_id` VARCHAR(64) NOT NULL,
    `getorio_product_id` VARCHAR(64) NOT NULL,
    `variant_id` VARCHAR(64) NULL,
    `sku` VARCHAR(64) NOT NULL,
    `name_snapshot` VARCHAR(200) NOT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `qty` INTEGER NOT NULL,
    `line_total` DECIMAL(12, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `order_items_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assets` (
    `id` CHAR(36) NOT NULL,
    `store_id` CHAR(36) NOT NULL,
    `getorio_tenant_id` VARCHAR(64) NOT NULL,
    `url` VARCHAR(2048) NOT NULL,
    `key` VARCHAR(512) NOT NULL,
    `mime` VARCHAR(100) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `assets_store_id_idx`(`store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `store_id` CHAR(36) NULL,
    `getorio_tenant_id` VARCHAR(64) NULL,
    `actor` VARCHAR(100) NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `audit_logs_store_id_created_at_idx`(`store_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `stores` ADD CONSTRAINT `stores_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `merchants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `domains` ADD CONSTRAINT `domains_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `site_versions` ADD CONSTRAINT `site_versions_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `command_logs` ADD CONSTRAINT `command_logs_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_products` ADD CONSTRAINT `store_products_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
