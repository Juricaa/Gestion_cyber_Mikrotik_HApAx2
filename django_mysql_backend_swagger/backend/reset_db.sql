DROP DATABASE IF EXISTS cyber_manager;

CREATE DATABASE cyber_manager
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'cyber_user'@'localhost' IDENTIFIED BY 'cyber_pass';

GRANT ALL PRIVILEGES ON cyber_manager.* TO 'cyber_user'@'localhost';

FLUSH PRIVILEGES;
